// Stan JEDNEGO wdrożenia: wersja, komplet zmiennych, baza, Brevo. Wołają go
// `scripts/nowy-klient.py` (sprawdzenie po uruchomieniu klienta) i
// `scripts/klienci.py sprawdz` (przegląd wszystkich klientów naraz).
//
// Po co osobny endpoint: przed nim konfigurację nowego klienta sprawdzało się
// ręcznie, a błędy wychodziły dopiero następnego ranka (cron raz na dobę) albo
// wcale — najgorszy z nich, front i crony patrzące na RÓŻNE bazy, nie dawał
// żadnego objawu poza tym, że powiadomienia trafiały nie tam, gdzie trzeba.
//
// Zwykły CommonJS .js, bez importów z src/ — powód w check-document-terms.js.
//
// ⚠️ Za CRON_SECRET, tak jak crony. Nazwy brakujących zmiennych i numer
// migracji to mapa wdrożenia, a nie coś dla przechodnia. Wartości zmiennych
// NIE wychodzą stąd nigdy — najwyżej to, czy są.

let WERSJA = null;
try {
  // Vercel dołącza plik do funkcji, bo widzi go w require.
  WERSJA = require("../public/version.json").version;
} catch (e) {
  WERSJA = null;
}

// Front czyta swoje w czasie BUILDA, funkcje w runtime — to dwa zestawy tych
// samych wartości i oba muszą być (patrz docs/NOWY-KLIENT.md).
const WYMAGANE = [
  "REACT_APP_SUPABASE_URL",
  "REACT_APP_SUPABASE_KEY",
  "REACT_APP_TENANT",
  "REACT_APP_PRODUKT",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_KEY",
  "CRON_SECRET",
  "BREVO_API_KEY",
  "EMAIL_FROM",
  "APP_URL",
];

const bezUkosnika = (s) => (s || "").trim().replace(/\/+$/, "");

module.exports = async function handler(req, res) {
  // ⚠️ Sprawdzenie obecności PRZED porównaniem — inaczej nieustawiony sekret
  // daje "Bearer undefined" i otwiera endpoint (patrz check-puls.js).
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ ok: false, brak: ["CRON_SECRET"] });
  }
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const brak = WYMAGANE.filter((k) => !(process.env[k] || "").trim());
  const problemy = [];

  // ⚠️ Front i crony muszą patrzeć na TĘ SAMĄ bazę. To dwie zmienne wpisywane
  // osobno; pomyłka w jednej nie gasi niczego, tylko rozdziela aplikację na
  // dwie bazy — ludzie odbijają godziny w jednej, a crony piszą w drugiej.
  const urlFront = bezUkosnika(process.env.REACT_APP_SUPABASE_URL);
  const urlApi = bezUkosnika(process.env.SUPABASE_URL);
  if (urlFront && urlApi && urlFront !== urlApi) {
    problemy.push("REACT_APP_SUPABASE_URL i SUPABASE_URL wskazują różne bazy");
  }
  if (
    process.env.SUPABASE_KEY &&
    process.env.REACT_APP_SUPABASE_KEY &&
    process.env.SUPABASE_KEY !== process.env.REACT_APP_SUPABASE_KEY
  ) {
    problemy.push("SUPABASE_KEY różni się od REACT_APP_SUPABASE_KEY");
  }
  // Klucz serwisowy w zmiennej frontu trafiłby do paczki w przeglądarce.
  if (/^sb_secret_/.test(process.env.REACT_APP_SUPABASE_KEY || "")) {
    problemy.push("REACT_APP_SUPABASE_KEY to klucz SERWISOWY — trafiłby do przeglądarki");
  }

  const baza = { ok: false };
  if (urlApi && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const klucz = process.env.SUPABASE_SERVICE_KEY;
      const r = await fetch(
        `${urlApi}/rest/v1/schema_migrations?select=version&order=version.desc&limit=1`,
        { headers: { apikey: klucz, Authorization: `Bearer ${klucz}`, Prefer: "count=exact" } }
      );
      if (r.ok) {
        const wiersze = await r.json();
        const zakres = r.headers.get("content-range") || "";
        baza.ok = true;
        baza.ostatnia_migracja = wiersze[0] ? wiersze[0].version : null;
        baza.migracji = Number(zakres.split("/")[1]) || wiersze.length;
      } else {
        baza.blad = `${r.status} ${(await r.text()).slice(0, 160)}`;
      }
    } catch (e) {
      baza.blad = String(e && e.message ? e.message : e).slice(0, 160);
    }
  }

  // Brevo: samo "czy klucz działa" — GET /account niczego nie wysyła i nie
  // zużywa limitu. Szczegóły konta zostają w Brevo.
  let brevo = "brak klucza";
  if (process.env.BREVO_API_KEY) {
    try {
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY, accept: "application/json" },
      });
      brevo = r.ok ? "ok" : `błąd ${r.status}`;
    } catch (e) {
      brevo = "brak połączenia";
    }
  }

  const ok = !brak.length && !problemy.length && baza.ok && brevo === "ok";
  return res.status(ok ? 200 : 503).json({
    ok,
    wersja: WERSJA,
    najemca: process.env.REACT_APP_TENANT || null,
    brak,
    problemy,
    baza,
    brevo,
  });
};
