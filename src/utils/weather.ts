// @ts-nocheck
// Pogoda dla lokalu — Open-Meteo (bez klucza API, darmowy, wystarczający na
// prosty "temperatura + ikona" w pasku). Miasto ustawiane ręcznie przez
// kierownika w Pracownicy → Lokale (lokale.miasto) — patrz CLAUDE.md.
// Geokodowanie i pogoda cache'owane w pamięci modułu (per miasto, TTL),
// żeby nie odpytywać API przy każdym re-renderze/przełączeniu zakładki.
const geoCache = new Map(); // miasto (lowercase) -> {lat, lon} | null
const weatherCache = new Map(); // miasto (lowercase) -> { data, ts }
const forecastCache = new Map(); // miasto (lowercase) -> { data, ts }
const WEATHER_TTL_MS = 20 * 60 * 1000;

async function geocodeCity(city) {
  const key = city.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    city
  )}&count=1&language=pl&country=PL`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("geocode_failed");
  const json = await res.json();
  const first = json.results && json.results[0];
  const loc = first ? { lat: first.latitude, lon: first.longitude } : null;
  geoCache.set(key, loc);
  return loc;
}

// Kody WMO -> polski opis + emoji. Tylko najczęstsze grupy — to mały pasek
// pogody, nie pełna stacja meteo, patrz Roadmap/prośba właściciela.
const WEATHER_CODE_MAP = {
  0: { label: "Bezchmurnie", icon: "☀️" },
  1: { label: "Prawie bezchmurnie", icon: "🌤️" },
  2: { label: "Częściowe zachmurzenie", icon: "⛅" },
  3: { label: "Pochmurno", icon: "☁️" },
  45: { label: "Mgła", icon: "🌫️" },
  48: { label: "Mgła osadzająca szron", icon: "🌫️" },
  51: { label: "Mżawka", icon: "🌦️" },
  53: { label: "Mżawka", icon: "🌦️" },
  55: { label: "Mżawka", icon: "🌦️" },
  56: { label: "Marznąca mżawka", icon: "🌧️" },
  57: { label: "Marznąca mżawka", icon: "🌧️" },
  61: { label: "Deszcz", icon: "🌧️" },
  63: { label: "Deszcz", icon: "🌧️" },
  65: { label: "Silny deszcz", icon: "🌧️" },
  66: { label: "Marznący deszcz", icon: "🌧️" },
  67: { label: "Marznący deszcz", icon: "🌧️" },
  71: { label: "Śnieg", icon: "🌨️" },
  73: { label: "Śnieg", icon: "🌨️" },
  75: { label: "Silny śnieg", icon: "🌨️" },
  77: { label: "Śnieg ziarnisty", icon: "🌨️" },
  80: { label: "Przelotny deszcz", icon: "🌦️" },
  81: { label: "Przelotny deszcz", icon: "🌦️" },
  82: { label: "Gwałtowny deszcz", icon: "🌧️" },
  85: { label: "Przelotny śnieg", icon: "🌨️" },
  86: { label: "Przelotny śnieg", icon: "🌨️" },
  95: { label: "Burza", icon: "⛈️" },
  96: { label: "Burza z gradem", icon: "⛈️" },
  99: { label: "Burza z gradem", icon: "⛈️" },
};
export const describeWeatherCode = (code) =>
  WEATHER_CODE_MAP[code] || { label: "Pogoda", icon: "🌡️" };

export async function fetchCurrentWeather(city) {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) return cached.data;
  const loc = await geocodeCity(city);
  if (!loc) {
    weatherCache.set(key, { data: null, ts: Date.now() });
    return null;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather_failed");
  const json = await res.json();
  const data = {
    temp: json.current?.temperature_2m,
    code: json.current?.weather_code,
  };
  weatherCache.set(key, { data, ts: Date.now() });
  return data;
}

// Prognoza dobowa na siatkę Grafiku — jedna wartość (temperatura maks. +
// kod pogody) na dzień. Open-Meteo daje bezpłatnie kilkanaście dni do
// przodu i kilka wstecz; dni spoza tego okna po prostu nie mają pogody i
// nagłówek dnia zostaje bez niej. To dekoracja, nie dane krytyczne —
// dlatego, jak w fetchCurrentWeather, nigdy nie pokazujemy tu błędu.
export async function fetchDailyForecast(city) {
  if (!city) return {};
  const key = city.trim().toLowerCase();
  const cached = forecastCache.get(key);
  if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) return cached.data;
  const loc = await geocodeCity(city);
  if (!loc) {
    forecastCache.set(key, { data: {}, ts: Date.now() });
    return {};
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&daily=temperature_2m_max,weather_code&past_days=7&forecast_days=16&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("forecast_failed");
  const json = await res.json();
  const days = json.daily?.time || [];
  const data = {};
  days.forEach((d, i) => {
    data[d] = {
      temp: json.daily.temperature_2m_max?.[i],
      code: json.daily.weather_code?.[i],
    };
  });
  forecastCache.set(key, { data, ts: Date.now() });
  return data;
}
