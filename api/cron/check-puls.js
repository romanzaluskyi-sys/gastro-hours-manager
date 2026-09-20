// Wywoływane raz dziennie przez Vercel Cron (patrz vercel.json). Sprawdza, czy
// wczorajszy dzień został w każdym lokalu zamknięty, i jeśli nie — pisze do
// kierowników tego lokalu.
//
// Po co: utarg i temperatury wpisane nazajutrz z pamięci to dane zmyślone, a
// cała analityka Pulsu stoi na tym, że karta powstaje tego samego wieczora.
// Jedno przypomnienie rano jest tańsze niż miesiąc dziur w danych.
//
// Zwykły CommonJS .js — powód identyczny jak w check-document-terms.js: Vercel
// buduje api/ osobnym, legacy tsc, który przewraca się na starym `typescript`
// z package.json. Bez importów z src/, paręnaście linijek zduplikowanych.

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
};

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const pobierz = async (sciezka) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${sciezka}`, { headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `Błąd pobierania ${sciezka}`);
  return json;
};

// Każdy zapis sprawdzamy — cichy błąd 400 wyglądałby jak "wszystko zamknięte"
// (patrz błąd #8 w CLAUDE.md).
const powiadom = async (lokal, message) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lokal, message, type: "puls", audience: "manager" }),
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
  const wynik = [];
  const failures = [];

  try {
    const lokale = await pobierz("lokale?select=name&archived=is.false");
    const karty = await pobierz(
      `day_logs?select=lokal,status&date=eq.${wczoraj}`
    );
    const zamkniete = new Set(
      karty.filter((k) => k.status === "zamkniety").map((k) => k.lokal)
    );

    for (const l of lokale) {
      if (zamkniete.has(l.name)) {
        wynik.push({ lokal: l.name, stan: "zamkniety" });
        continue;
      }
      // Błąd jednego lokalu nie może przewrócić pozostałych.
      try {
        const czyJest = karty.some((k) => k.lokal === l.name);
        await powiadom(
          l.name,
          `Puls za ${wczoraj.split("-").reverse().join(".")} nie został zamknięty` +
            (czyJest ? " — karta jest zaczęta, brakuje zamknięcia." : " — karty w ogóle nie ma.")
        );
        wynik.push({ lokal: l.name, stan: "przypomniano" });
      } catch (e) {
        failures.push({ lokal: l.name, error: e.message });
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ dzien: wczoraj, wynik, failures });
};
