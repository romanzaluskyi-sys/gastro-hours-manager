// Stan JEDNEGO wdrożenia: wersja, komplet zmiennych, baza, Brevo, a od 0.77.0
// także crony (czy każdy miał udany przebieg w swoim oknie — dziennik z 0045) i
// błędy aplikacji z ostatniej doby. Wołają go
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

// --- Monitoring (0.77.0, migracja 0045) -------------------------------------
// Jakie crony mają chodzić i jak długo wolno nie mieć UDANEGO przebiegu.
// Harmonogram Vercela czytamy z vercel.json (jedno źródło), a wysyłkę maili —
// pg_cron w bazie co 5 minut (docs/sql/tools/email-harmonogram.sql) — dopisujemy
// ręcznie, bo vercel.json o niej nie wie.
let HARMONOGRAM = [];
try {
  HARMONOGRAM = (require("../vercel.json").crons || []).map((c) => c.path.split("/").pop());
} catch (e) {
  HARMONOGRAM = [];
}
const GODZINA = 3600 * 1000;
// Dobowe: 26 h — zapas na przesunięcie wywołania przez Vercel. Wysyłka maili:
// trzy opuszczone przebiegi z rzędu to już nie przypadek.
const OKNA = { "wyslij-maile": 20 * 60 * 1000 };
const oknoCrona = (nazwa) => OKNA[nazwa] || 26 * GODZINA;

const oczekiwaneCrony = (demo) => [
  // demo-reset stoi w vercel.json wszystkich klientów, ale pracuje tylko w demo.
  ...HARMONOGRAM.filter((n) => demo || n !== "demo-reset"),
  // Demo maili nie wysyła (docs/DEMO.md) — nie ma tam też harmonogramu.
  ...(demo ? [] : ["wyslij-maile"]),
];

// Kiedy błędy aplikacji to już sygnał, a nie szum. „Właściwe pytanie do tej
// tabeli brzmi «co się POWTARZA»” (CLAUDE.md, „Błędy aplikacji”) — stąd próg
// na jeden komunikat, a nie tylko na sumę.
const PROG_BLEDOW_DOBA = 20;
const PROG_POWTORZEN = 5;

const sprawdzCrony = async (pobierzRest, demo) => {
  const teraz = Date.now();
  const od = new Date(teraz - 48 * GODZINA).toISOString();
  const r = await pobierzRest(
    `cron_przebiegi?select=nazwa,start_at,ok,kod,info&start_at=gt.${encodeURIComponent(od)}&order=start_at.desc&limit=2000`
  );
  if (r.brakTabeli) return { ok: false, problemy: ["brak dziennika cronów — migracja 0045"], lista: [] };
  const wiersze = r.wiersze;
  const pierwszy = (await pobierzRest("cron_przebiegi?select=start_at&order=start_at.asc&limit=1")).wiersze[0];
  const dziennikOd = pierwszy ? Date.parse(pierwszy.start_at) : null;

  const problemy = [];
  const lista = oczekiwaneCrony(demo).map((nazwa) => {
    const moje = wiersze.filter((w) => w.nazwa === nazwa);
    const ostatni = moje[0] || null;
    const ostatniOk = moje.find((w) => w.ok) || null;
    const okno = oknoCrona(nazwa);
    let stan = "ok";
    if (ostatni && !ostatni.ok) {
      stan = "błąd";
      problemy.push(`cron ${nazwa}: ostatni przebieg ${ostatni.kod}${ostatni.info ? ` — ${String(ostatni.info).slice(0, 120)}` : ""}`);
    } else if (!ostatniOk || teraz - Date.parse(ostatniOk.start_at) > okno) {
      // Dziennik młodszy niż okno crona: nie wiemy jeszcze, czy coś nie
      // przyszło, czy po prostu nie było kiedy. Pierwszy dzień po migracji
      // nie może świecić na czerwono za wszystkie crony naraz.
      if (dziennikOd == null || teraz - dziennikOd < okno) {
        stan = "bez pomiaru";
      } else {
        stan = "brak przebiegu";
        problemy.push(
          `cron ${nazwa}: brak udanego przebiegu ${ostatniOk ? `od ${ostatniOk.start_at.slice(0, 16).replace("T", " ")} UTC` : "w ostatnich 48 h"}`
        );
      }
    }
    return { nazwa, stan, ostatni: ostatni ? ostatni.start_at : null, ostatni_ok: ostatniOk ? ostatniOk.start_at : null };
  });
  return { ok: !problemy.length, problemy, lista };
};

const sprawdzBledy = async (pobierzRest) => {
  const od = new Date(Date.now() - 24 * GODZINA).toISOString();
  const r = await pobierzRest(
    `app_errors?select=komunikat,ekran&created_at=gt.${encodeURIComponent(od)}&limit=1000`
  );
  if (r.brakTabeli) return { ok: true, ostatnie_24h: null, najczestsze: [], problemy: [] };
  const ile = {};
  for (const w of r.wiersze) {
    const k = String(w.komunikat || "(bez komunikatu)").slice(0, 120);
    ile[k] = (ile[k] || 0) + 1;
  }
  const najczestsze = Object.entries(ile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([komunikat, n]) => ({ komunikat, ile: n }));
  const problemy = [];
  if (r.wiersze.length >= PROG_BLEDOW_DOBA) {
    problemy.push(`błędy aplikacji: ${r.wiersze.length} w ostatnich 24 h`);
  }
  if (najczestsze[0] && najczestsze[0].ile >= PROG_POWTORZEN) {
    problemy.push(`błąd powtarza się ${najczestsze[0].ile}× w 24 h: ${najczestsze[0].komunikat}`);
  }
  return { ok: !problemy.length, ostatnie_24h: r.wiersze.length, najczestsze, problemy };
};

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

  // Wersja demonstracyjna (docs/DEMO.md) świadomie NIE wysyła maili — brak
  // Brevo jest tam stanem docelowym, nie awarią. Bez tego demo świeciłoby na
  // czerwono w każdym `klienci.py sprawdz` i alarm o niczym uczyłby go ignorować.
  const demo = process.env.DEMO === "tak";
  const brak = WYMAGANE.filter(
    (k) => !(demo && k === "BREVO_API_KEY") && !(process.env[k] || "").trim()
  );
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

  // Crony i błędy aplikacji (0.77.0). Błąd odczytu nie wywraca reszty — mówi
  // o sobie w `problemy`.
  let crony = null;
  let bledy = null;
  if (baza.ok) {
    const klucz = process.env.SUPABASE_SERVICE_KEY;
    const pobierzRest = async (sciezka) => {
      const r = await fetch(`${urlApi}/rest/v1/${sciezka}`, {
        headers: { apikey: klucz, Authorization: `Bearer ${klucz}` },
      });
      if (r.status === 404) return { brakTabeli: true, wiersze: [] };
      if (!r.ok) {
        const tekst = await r.text().catch(() => "");
        // PostgREST na nieistniejącą tabelę: 404 albo 42P01 / PGRST205 w treści.
        if (/42P01|PGRST205|does not exist|Could not find the table/.test(tekst)) {
          return { brakTabeli: true, wiersze: [] };
        }
        throw new Error(`${r.status} ${tekst.slice(0, 120)}`);
      }
      return { brakTabeli: false, wiersze: await r.json() };
    };
    try {
      crony = await sprawdzCrony(pobierzRest, demo);
      problemy.push(...crony.problemy);
    } catch (e) {
      problemy.push(`dziennik cronów: ${String(e.message || e).slice(0, 120)}`);
    }
    try {
      bledy = await sprawdzBledy(pobierzRest);
      problemy.push(...bledy.problemy);
    } catch (e) {
      problemy.push(`błędy aplikacji: ${String(e.message || e).slice(0, 120)}`);
    }
  }

  // Brevo: samo "czy klucz działa" — GET /account niczego nie wysyła i nie
  // zużywa limitu. Szczegóły konta zostają w Brevo.
  let brevo = demo ? "wyłączone (demo)" : "brak klucza";
  if (process.env.BREVO_API_KEY && !demo) {
    try {
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY, accept: "application/json" },
      });
      brevo = r.ok ? "ok" : `błąd ${r.status}`;
    } catch (e) {
      brevo = "brak połączenia";
    }
  }

  const ok = !brak.length && !problemy.length && baza.ok && (brevo === "ok" || demo);
  return res.status(ok ? 200 : 503).json({
    ok,
    demo,
    wersja: WERSJA,
    najemca: process.env.REACT_APP_TENANT || null,
    brak,
    problemy,
    baza,
    brevo,
    crony: crony && crony.lista,
    bledy: bledy && { ostatnie_24h: bledy.ostatnie_24h, najczestsze: bledy.najczestsze },
  });
};
