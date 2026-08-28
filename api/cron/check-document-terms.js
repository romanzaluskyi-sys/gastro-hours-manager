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

const SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co";
const SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S";

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
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toYMD(today);

  let notified = 0;
  const failures = [];
  try {
    const allUsers = await getUsers();
    const activeUsers = (Array.isArray(allUsers) ? allUsers : []).filter(
      (u) => u.active && !u.archived
    );

    for (const user of activeUsers) {
      for (const term of DOCUMENT_TERMS) {
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
