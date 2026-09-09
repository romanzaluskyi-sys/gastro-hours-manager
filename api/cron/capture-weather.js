// Wywoływane raz dziennie przez Vercel Cron (patrz vercel.json). Zapisuje do
// weather_forecasts trzy rzeczy dla każdego miasta z lokale.miasto:
//   - prognozę na 1..14 dni naprzód (horizon_days = 1..14)
//   - stan faktyczny dla wczoraj    (horizon_days = 0)
// Dzięki temu po jakimś czasie da się policzyć, ile warta jest prognoza
// z danym wyprzedzeniem — patrz docs/sql/migrations/0013_prognoza_pogody.sql.
//
// ⚠️ Horyzont 14 dni istnieje TYLKO dzięki temu, że ten cron chodzi codziennie.
// Open-Meteo pozwala sięgnąć wstecz po dawne prognozy najwyżej 7 dni
// (previous-runs API, patrz scripts/backfill-pogoda.py), więc każdy dzień, w
// którym ten cron nie zadziała, jest dla horyzontów 8–14 stracony na zawsze.
//
// Zwykły CommonJS .js (nie .ts) — powód identyczny jak w
// check-document-terms.js: Vercel buduje api/ osobnym, legacy tsc, który
// przewraca się na starym `typescript` z package.json. Bez importów z src/,
// paręnaście linijek zduplikowanych świadomie.

// ⚠️ Model silo: adres bazy NIE MOŻE stać w kodzie — jedno repozytorium
// obsługuje N projektów Vercel, każdy z własnym projektem Supabase. Zmienne
// ustawia się w Vercel → Project Settings → Environment Variables, obok
// istniejącego CRON_SECRET. Fallback na wartości pierwszego klienta zostaje,
// żeby ta zmiana nie zgasiła działającego crona przed ich ustawieniem.
const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://gdzossvaauznqsrfqovw.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_KEY || "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const HORYZONT_MAX = 14;

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const dniMiedzy = (od, doDnia) =>
  Math.round((Date.parse(doDnia) - Date.parse(od)) / 86400000);

const getMiasta = async () => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/lokale?select=miasto&archived=is.false`,
    { headers }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Błąd pobierania lokali");
  const miasta = json.map((l) => (l.miasto || "").trim()).filter(Boolean);
  return [...new Set(miasta)];
};

const geocode = async (miasto) => {
  const res = await fetch(
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=pl&country=PL&name=" +
      encodeURIComponent(miasto)
  );
  const json = await res.json();
  if (!res.ok) throw new Error("Błąd geokodowania");
  const first = json.results && json.results[0];
  if (!first) throw new Error(`Nie znaleziono miasta "${miasto}"`);
  return { lat: first.latitude, lon: first.longitude };
};

const pobierzPogode = async (lat, lon) => {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum," +
    "precipitation_probability_max,weather_code" +
    "&past_days=2&forecast_days=16&timezone=Europe%2FWarsaw";
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.reason || "Błąd Open-Meteo");
  return json.daily;
};

// Upsert po (miasto, target_date, horizon_days) — cron chodzi codziennie i
// za każdym razem widzi te same dni naprzód. Bez merge-duplicates tabela
// zapełniłaby się duplikatami, a średni błąd przestałby cokolwiek znaczyć.
const zapisz = async (wiersze) => {
  if (!wiersze.length) return;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/weather_forecasts?on_conflict=miasto,target_date,horizon_days`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(wiersze),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Błąd zapisu prognoz: ${res.status} ${txt}`);
  }
};

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const dzis = ymd(new Date());
  const wczoraj = ymd(new Date(Date.now() - 86400000));
  const podsumowanie = [];
  const failures = [];

  let miasta;
  try {
    miasta = await getMiasta();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  for (const miasto of miasta) {
    // Błąd jednego miasta nie może przewrócić pozostałych — ten sam wzorzec
    // co w check-document-terms.js.
    try {
      const { lat, lon } = await geocode(miasto);
      const d = await pobierzPogode(lat, lon);
      const wiersze = [];

      d.time.forEach((data, i) => {
        const horyzont = dniMiedzy(dzis, data);
        // Zapisujemy prognozy na 1..14 dni naprzód oraz FAKT dla wczoraj.
        // Dzisiaj pomijamy: dzień jeszcze trwa, więc to ani prognoza, ani fakt.
        const fakt = data === wczoraj;
        if (!fakt && (horyzont < 1 || horyzont > HORYZONT_MAX)) return;
        wiersze.push({
          miasto,
          target_date: data,
          horizon_days: fakt ? 0 : horyzont,
          temp_max: d.temperature_2m_max[i],
          temp_min: d.temperature_2m_min[i],
          opady_mm: d.precipitation_sum[i],
          opady_prawdopodobienstwo: fakt ? null : d.precipitation_probability_max[i],
          kod: d.weather_code[i],
          zrodlo: "forecast",
        });
      });

      await zapisz(wiersze);
      podsumowanie.push({ miasto, zapisano: wiersze.length });
    } catch (e) {
      failures.push({ miasto, error: e.message });
    }
  }

  return res.status(200).json({ dzien: dzis, podsumowanie, failures });
};
