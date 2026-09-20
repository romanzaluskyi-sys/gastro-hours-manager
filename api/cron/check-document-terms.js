// Wywoływane raz dziennie przez Vercel Cron (patrz vercel.json). Sprawdza
// terminy sanepid/umowy aktywnych pracowników i powiadamia kierowników ich
// lokalu oraz samych pracowników w rytmie: miesiąc przed, 2 tygodnie przed,
// codziennie w ostatnim tygodniu, codziennie po przeterminowaniu.
//
// Lista terminów jest świadomie zamknięta na tych dwóch pozycjach — nie jest
// to mechanizm pozwalający dodać dowolny trzeci termin bez zmiany kodu.
//
// Zwykły CommonJS .js (nie .ts): Vercel buduje funkcje w api/ przez osobny,
// legacy tsc zamiast tego samego pipeline'u co CRA, a stara wersja
// `typescript` w package.json (4.4.4, potrzebna dla reszty projektu — patrz
// CLAUDE.md) powoduje tam błąd "TS6046" i zepsutą kompilację ("Cannot use
// import statement outside a module" w runtime). Samodzielny CommonJS
// omija ten problem całkowicie, kosztem zduplikowania (nie importowania)
// paru linijek z src/api/supabase.ts i src/api/notifications.ts — jeśli te
// pliki się zmienią, sprawdź czy trzeba przenieść zmianę też tutaj.

// ⚠️ Model silo: adres bazy NIE MOŻE stać w kodzie — jedno repozytorium
// obsługuje N projektów Vercel, każdy z własnym projektem Supabase. Zmienne
// ustawia się w Vercel → Project Settings → Environment Variables, obok
// istniejącego CRON_SECRET.
//
// ⚠️ NIE MA TU FALLBACKU i nie wolno go dopisywać. Do 0.41.0 stał tu adres i
// klucz pierwszego klienta — bezpiecznik na czas wdrażania modelu silo, żeby
// zmiana z 0.33.0 nie zgasiła działającego crona, zanim ktokolwiek ustawi
// zmienne. Skutek uboczny był gorszy niż problem, który rozwiązywał: projekt
// NOWEGO klienta bez ustawionych zmiennych pisałby powiadomienia i prognozy do
// bazy PIERWSZEGO. Front ma na taki wypadek nazwę najemcy na ekranie logowania;
// cron nie ma ekranu, więc nikt by tego nie zobaczył. Brak zmiennej kończy się
// teraz błędem 500 z wyjaśnieniem — cron widoczny jako czerwony w Vercelu jest
// nieporównanie lepszy niż cron piszący po cichu do cudzej bazy.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Wołane w handlerze PO autoryzacji: komu z ulicy nic do tego, czego nam brakuje.
const brakKonfiguracji = () => {
  const brak = [];
  if (!SUPABASE_URL) brak.push("SUPABASE_URL");
  if (!SUPABASE_KEY) brak.push("SUPABASE_KEY");
  if (!brak.length) return null;
  return (
    `Brak zmiennych środowiskowych: ${brak.join(", ")}. ` +
    "Ustaw je w Vercel → Project Settings → Environment Variables " +
    "(procedura: docs/NOWY-KLIENT.md)."
  );
};

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const getUsers = async () => {
  const pageSize = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=*&order=id.asc`,
      { headers: { ...headers, Range: `${from}-${from + pageSize - 1}` } }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd pobierania users");
    allRows = allRows.concat(json);
    if (json.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
};

const patchUser = async (id, data) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Błąd aktualizacji użytkownika");
};

const createManagerNotification = async (lokal, message, type) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      audience: "manager",
      lokal,
      message,
      type,
      is_read: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`createManagerNotification failed: ${res.status} ${body}`);
  }
};

const createEmployeeNotification = async (userName, message, type) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      audience: "employee",
      user_name: userName,
      message,
      type,
      is_read: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`createEmployeeNotification failed: ${res.status} ${body}`);
  }
};

const DOCUMENT_TERMS = [
  {
    key: "sanepid",
    // Rzeczownik (r.ż.) wstawiany jako podmiot zdania w buildManagerMessage/
    // buildEmployeeMessage — musi się zgadzać rodzajem z "dobiega"/"upłynęła".
    subject: "książeczka sanitarno-epidemiologiczna",
    dateCol: "sanepid_expiry",
    lastNotifiedCol: "sanepid_last_notified",
  },
  {
    key: "umowa",
    subject: "umowa",
    dateCol: "umowa_expiry",
    lastNotifiedCol: "umowa_last_notified",
  },
];

const toYMD = (d) => d.toISOString().split("T")[0];

const toPolishDate = (dateStr) => {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
};

const daysUntil = (dateStr, today) => {
  const expiry = new Date(dateStr + "T00:00:00");
  return Math.round((expiry.getTime() - today.getTime()) / 86400000);
};

const isDueToday = (days) =>
  days === 30 || days === 14 || (days >= 0 && days <= 7) || days < 0;

const buildManagerMessage = (user, term, expiryStr, days) => {
  const dateFmt = toPolishDate(expiryStr);
  const stanowisko = user.default_stanowisko ? ` (${user.default_stanowisko})` : "";
  const lokal = user.default_lokal || "brak przypisanego lokalu";
  const who = `Dla pracownika ${user.name}${stanowisko} z lokalu ${lokal}`;
  if (days < 0) {
    return `${who}, ${term.subject} upłynęła w dniu ${dateFmt} — termin przekroczony o ${-days} dni.`;
  }
  if (days === 0) {
    return `${who}, ${term.subject} dobiega końca dzisiaj (${dateFmt}).`;
  }
  return `${who}, ${term.subject} dobiega końca w dniu ${dateFmt}, do zakończenia pozostało ${days} dni.`;
};

const buildEmployeeMessage = (term, expiryStr, days) => {
  const dateFmt = toPolishDate(expiryStr);
  if (days < 0) {
    return `Twój termin: ${term.subject} upłynęła w dniu ${dateFmt} — termin przekroczony o ${-days} dni. Zgłoś się do kierownika.`;
  }
  if (days === 0) {
    return `Twój termin: ${term.subject} dobiega końca dzisiaj (${dateFmt}). Zgłoś się do kierownika.`;
  }
  return `Twój termin: ${term.subject} dobiega końca w dniu ${dateFmt}, do zakończenia pozostało ${days} dni. Zgłoś się do kierownika, aby go zaktualizować.`;
};

module.exports = async function handler(req, res) {
  // ⚠️ Sprawdzenie PRZED porównaniem nagłówka, nie po. Przy nieustawionym
  // CRON_SECRET `Bearer ${process.env.CRON_SECRET}` daje dosłowny string
  // "Bearer undefined" — i każdy, kto wyśle taki nagłówek, przechodzi
  // autoryzację. Brakująca zmienna otwierała więc endpoint zamiast go zamknąć.
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({
      error:
        "CRON_SECRET nie jest ustawiony w tym projekcie Vercel — " +
        "bez niego nie da się odróżnić wywołania z harmonogramu od cudzego " +
        "(procedura: docs/NOWY-KLIENT.md).",
    });
  }
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const brak = brakKonfiguracji();
  if (brak) return res.status(500).json({ error: brak });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toYMD(today);

  let notified = 0;
  const failures = [];
  try {
    const allUsers = await getUsers();
    const activeUsers = (Array.isArray(allUsers) ? allUsers : []).filter(
      (u) =>
        u.active &&
        !u.archived &&
        // Kto ma znany ostatni dzień pracy i już go minął, nie potrzebuje
        // przypomnień o dokumentach — a kierownik nie potrzebuje ich o nim.
        !(u.ostatni_dzien && u.ostatni_dzien < todayStr)
    );

    for (const user of activeUsers) {
      for (const term of DOCUMENT_TERMS) {
        // Umowa bezterminowa nie ma o czym przypominać.
        if (term.key === "umowa" && user.umowa_bezterminowa) continue;
        const expiryStr = user[term.dateCol];
        if (!expiryStr) continue;

        const days = daysUntil(expiryStr, today);
        if (!isDueToday(days)) continue;
        if (user[term.lastNotifiedCol] === todayStr) continue;

        // Każdy (pracownik, termin) osobno: błąd jednego nie przerywa
        // reszty batcha i — kluczowe — NIE ustawia last_notified, więc
        // nieudana próba zostanie powtórzona przy następnym uruchomieniu
        // zamiast zostać cicho uznana za wysłaną.
        try {
          await createManagerNotification(
            user.default_lokal,
            buildManagerMessage(user, term, expiryStr, days),
            term.key
          );
          await createEmployeeNotification(
            user.name,
            buildEmployeeMessage(term, expiryStr, days),
            term.key
          );
          await patchUser(user.id, { [term.lastNotifiedCol]: todayStr });
          notified++;
        } catch (itemErr) {
          console.error(
            `check-document-terms: failed for user=${user.id} term=${term.key}:`,
            itemErr
          );
          failures.push({
            userId: user.id,
            userName: user.name,
            term: term.key,
            error: itemErr.message || String(itemErr),
          });
        }
      }
    }

    res
      .status(200)
      .json({ ok: true, checked: activeUsers.length, notified, failures });
  } catch (err) {
    console.error("check-document-terms failed:", err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
};
