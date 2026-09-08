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

const SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co";
const SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S";

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
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
