// Wywoływane raz dziennie przez Vercel Cron (patrz vercel.json). Szuka
// WCZORAJSZYCH zmian z grafiku, których nikt nie odbił, i mówi o nich obu
// stronom: pracownikowi (bo to jego godziny i jego wypłata) oraz kierownikowi
// lokalu (bo to on je zatwierdzi w zakładce Zatwierdzanie zmian).
//
// Patrzymy WYŁĄCZNIE na wczoraj, celowo. Dzięki temu każda zmiana jest
// sprawdzana dokładnie raz i nie trzeba niczego oznaczać, żeby nie wysłać tego
// samego drugi raz. Starsze pozycje i tak czekają w kolejce u kierownika.
//
// Zwykły CommonJS .js — powód identyczny jak w check-document-terms.js: Vercel
// buduje api/ osobnym, legacy tsc, który przewraca się na starym `typescript`
// z package.json. Bez importów z src/.

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
// ⚠️ SERVICE ROLE, nie publishable. Od Etapu 3c polityki RLS nie wydają
// niczego anonimowym, a klucz publishable to właśnie anonim — cron pisałby
// wtedy w próżnię (albo, gorzej, zgłaszał sukces po nieudanym zapisie).
// Kod serwerowy to miejsce, w którym klucz z pełnymi prawami jest na miejscu:
// nie opuszcza Vercela i nikt go nie zobaczy w przeglądarce.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Wołane w handlerze PO autoryzacji: komu z ulicy nic do tego, czego nam brakuje.
const brakKonfiguracji = () => {
  const brak = [];
  if (!SUPABASE_URL) brak.push("SUPABASE_URL");
  if (!SUPABASE_KEY) brak.push("SUPABASE_SERVICE_KEY");
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
};

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

// ⚠️ PostgREST oddaje maksymalnie 1000 wierszy na żądanie i robi to BEZ
// ostrzeżenia — to jest błąd #1 z CLAUDE.md, ten sam, przed którym pilnuje się
// api.get() w src/api/supabase.ts. Cron nie może importować z src/, więc
// paginację trzeba mieć tutaj. Bez niej `shifts` (2937 wierszy) wracało
// obcięte do 1000, część wczorajszych odbić w ogóle nie docierała i ludzie,
// którzy normalnie odbili zmianę, dostawali wiadomość, że jej nie odbili.
const STRONA = 1000;
const pobierz = async (sciezka) => {
  const wynik = [];
  for (let od = 0; ; od += STRONA) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${sciezka}`, {
      headers: { ...headers, Range: `${od}-${od + STRONA - 1}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `Błąd pobierania ${sciezka}`);
    wynik.push(...json);
    if (json.length < STRONA) return wynik;
  }
};

// res.ok sprawdzamy zawsze — cichy 400 wyglądałby jak "wszyscy odbili"
// (patrz błąd #8 w CLAUDE.md).
const powiadom = async (wiersz) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers,
    body: JSON.stringify(wiersz),
  });
  if (!res.ok) throw new Error(`Błąd zapisu powiadomienia: ${res.status}`);
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

  const wczoraj = ymd(new Date(Date.now() - 86400000));
  const dataPL = wczoraj.split("-").reverse().join(".");
  const failures = [];
  let znalezione = 0;

  try {
    const plan = await pobierz(
      `grafik_shifts?select=*&date=eq.${wczoraj}&deleted_at=is.null&published_at=not.is.null&rozliczenie=is.null`
    );
    if (!plan.length) return res.status(200).json({ dzien: wczoraj, znalezione: 0 });

    const [odbicia, users, urlopy] = await Promise.all([
      pobierz(
        `shifts?select=user_id,user_name,start_time,is_urlop` +
          `&start_time=gte.${ymd(new Date(Date.now() - 2 * 86400000))}` +
          `&start_time=lt.${ymd(new Date(Date.now() + 86400000))}`
      ),
      pobierz(`users?select=id,name,default_lokal,active,archived`),
      pobierz(`absences?select=user_id,user_name,start_date,end_date,status`),
    ]);

    const odbilWczoraj = new Set(
      odbicia
        .filter((s) => !s.is_urlop && s.start_time && ymd(new Date(s.start_time)) === wczoraj)
        .map((s) => String(s.user_id || s.user_name))
    );
    const naWolnym = new Set(
      urlopy
        .filter((a) => a.status === "approved" && a.start_date <= wczoraj && wczoraj <= a.end_date)
        .map((a) => String(a.user_id || a.user_name))
    );

    for (const zm of plan) {
      const user = users.find((u) => String(u.id) === String(zm.user_id));
      if (!user || !user.active || user.archived) continue;
      const klucz = String(user.id);
      if (odbilWczoraj.has(klucz) || odbilWczoraj.has(user.name)) continue;
      if (naWolnym.has(klucz) || naWolnym.has(user.name)) continue;

      znalezione += 1;
      // Każda pozycja osobno: błąd jednej nie może uciszyć pozostałych.
      try {
        await powiadom({
          audience: "employee",
          user_name: user.name,
          type: "odbicie",
          message:
            `Wczoraj (${dataPL}) miałeś(-aś) zmianę w grafiku w lokalu ${zm.lokal}, ` +
            `ale nie ma jej wśród odbitych godzin. Kierownik potwierdzi ją w systemie — ` +
            "jeśli godziny były inne, powiedz mu o tym.",
        });
        await powiadom({
          audience: "manager",
          lokal: zm.lokal,
          type: "odbicie",
          message:
            `${user.name}: zmiana z grafiku ${dataPL} (${zm.lokal}) bez odbicia. ` +
            "Do potwierdzenia w zakładce Zatwierdzanie zmian.",
        });
      } catch (e) {
        failures.push({ zmiana: zm.id, error: e.message });
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ dzien: wczoraj, znalezione, failures });
};
