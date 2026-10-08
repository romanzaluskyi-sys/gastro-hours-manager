// Reset wersji demonstracyjnej (demo.shiftro.pl, 0.72.0): czyści bazę demo i
// zapisuje świeże dane przykładowe, policzone od dzisiejszej daty
// (api/_lib/demoDane.js). Dzięki temu demo co rano wygląda „na żywo”, a to, co
// wczoraj nawpisywali odwiedzający, znika.
//
// Kto woła:
//   - Vercel Cron co noc (`vercel.json`, GET z `Authorization: Bearer $CRON_SECRET`);
//   - przycisk „Przywróć dane demo” w aplikacji (POST z tokenem zalogowanego
//     konta demo „Panel kierownika”) — gdy ktoś przed prezentacją rozgrzebał dane.
//
// ⚠️ Ten plik stoi w `vercel.json` WSZYSTKICH klientów (repozytorium jest jedno).
// Dlatego dwa niezależne bezpieczniki, oba muszą przejść, zanim cokolwiek
// zostanie skasowane:
//   1. zmienna `DEMO=tak` w projekcie Vercel — bez niej odpowiedź 200
//      „pominięto” i koniec (cron u klienta nie świeci na czerwono);
//   2. funkcja `demo_znacznik()` w BAZIE (docs/sql/demo/demo.sql) — instaluje
//      ją tylko `nowy-klient.py --demo`. Zmienną da się przekleić do złego
//      projektu; funkcji w bazie klienta nie ma i odwiedzający jej nie założy.
//
// Zwykły CommonJS .js, bez importów z src/ (patrz CLAUDE.md, sekcja "Cron").

const C = require("../_lib/czas");
const K = require("../_lib/demoKonta");
const { generuj, KOLEJNOSC } = require("../_lib/demoDane");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERWIS = process.env.SUPABASE_SERVICE_KEY;

const jakoSerwis = () => ({
  apikey: SERWIS,
  Authorization: `Bearer ${SERWIS}`,
  "Content-Type": "application/json",
});

// Odstęp między resetami z przycisku. Dwa kliknięcia jedno po drugim to dwa
// TRUNCATE-y w trakcie zapisu — drugi skasowałby połowę danych pierwszego.
const ODSTEP_MS = 60 * 1000;
const PACZKA = 500;

const blad = async (res, gdzie) => {
  const t = await res.text().catch(() => "");
  return new Error(`${gdzie}: ${res.status} ${t.slice(0, 300)}`);
};

const rpc = async (nazwa) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nazwa}`, {
    method: "POST",
    headers: jakoSerwis(),
    body: "{}",
  });
  if (!res.ok) throw await blad(res, `rpc ${nazwa}`);
  return res.json().catch(() => null);
};

// PostgREST przyjmuje wiele wierszy naraz tylko wtedy, gdy mają TE SAME
// kolumny — inaczej brakujące uzupełniłby NULL-em, a NULL nie jest
// wartością domyślną (np. `is_read not null default false`). Grupujemy więc
// wiersze po zestawie kluczy.
const wstaw = async (tabela, wiersze) => {
  const grupy = new Map();
  for (const w of wiersze) {
    const klucz = Object.keys(w).sort().join(",");
    if (!grupy.has(klucz)) grupy.set(klucz, []);
    grupy.get(klucz).push(w);
  }
  for (const grupa of grupy.values()) {
    for (let i = 0; i < grupa.length; i += PACZKA) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
        method: "POST",
        headers: { ...jakoSerwis(), Prefer: "return=minimal" },
        body: JSON.stringify(grupa.slice(i, i + PACZKA)),
      });
      if (!res.ok) throw await blad(res, `zapis ${tabela}`);
    }
  }
};

// --- Konta w Supabase Auth ---------------------------------------------------

const kontaAuth = async () => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: jakoSerwis(),
  });
  if (!res.ok) throw await blad(res, "lista kont Auth");
  const odp = await res.json();
  return odp.users || [];
};

const daSieZalogowac = async (email) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SERWIS, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: K.PIN }),
  });
  return res.ok;
};

// Trzy konta demo istnieją i mają PIN z ekranu logowania. Hasło zmieniamy
// TYLKO wtedy, gdy logowanie nie przechodzi — zmiana hasła bez potrzeby
// mogłaby wylogować prezentację otwartą w drugiej karcie.
// Konta założone przez odwiedzających (karta pracownika → e-mail + PIN)
// kasujemy: następnego dnia ich wiersze w `users` i tak już nie istnieją.
const przygotujKonta = async (wynik) => {
  const wszystkie = await kontaAuth();
  const idPoEmailu = {};
  for (const k of K.KONTA) {
    const jest = wszystkie.find((u) => (u.email || "").toLowerCase() === k.email);
    if (!jest) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: jakoSerwis(),
        body: JSON.stringify({ email: k.email, password: K.PIN, email_confirm: true, user_metadata: { name: k.imie } }),
      });
      if (!res.ok) throw await blad(res, `zakładanie konta ${k.email}`);
      idPoEmailu[k.email] = (await res.json()).id;
      wynik.konta.push(`${k.klucz}: założone`);
      continue;
    }
    idPoEmailu[k.email] = jest.id;
    if (!(await daSieZalogowac(k.email))) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${jest.id}`, {
        method: "PUT",
        headers: jakoSerwis(),
        body: JSON.stringify({ password: K.PIN, ban_duration: "none" }),
      });
      if (!res.ok) throw await blad(res, `PIN konta ${k.email}`);
      wynik.konta.push(`${k.klucz}: PIN przywrócony`);
    }
  }
  for (const u of wszystkie) {
    if (K.jestKontemDemo(u.email)) continue;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: jakoSerwis(),
    });
    if (res.ok) wynik.konta.push(`usunięte: ${u.email || u.id}`);
  }
  return idPoEmailu;
};

// --- Kto woła ------------------------------------------------------------------

// Cron: CRON_SECRET. Przycisk: token konta demo „Panel kierownika”, sprawdzony
// W SUPABASE (nie rozkodowany u nas — patrz api/admin/ustaw-haslo.js).
const ktoWola = async (req) => {
  const naglowek = req.headers.authorization || req.headers.Authorization || "";
  if (process.env.CRON_SECRET && naglowek === `Bearer ${process.env.CRON_SECRET}`) return "cron";
  if (req.method !== "POST" || !naglowek.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERWIS, Authorization: naglowek },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => ({}));
  return (u.email || "").toLowerCase() === K.KONTA[0].email ? "przycisk" : null;
};

module.exports = async function handler(req, res) {
  // ⚠️ Pierwszy bezpiecznik — u każdego klienta poza demo kończymy tutaj.
  if (process.env.DEMO !== "tak") {
    return res.status(200).json({ pominieto: "To nie jest wdrożenie demo (brak DEMO=tak)." });
  }
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: "CRON_SECRET nie jest ustawiony w tym projekcie Vercel." });
  }
  const brak = [!SUPABASE_URL && "SUPABASE_URL", !SERWIS && "SUPABASE_SERVICE_KEY"].filter(Boolean);
  if (brak.length) {
    return res.status(500).json({ error: `Brak zmiennych środowiskowych: ${brak.join(", ")}.` });
  }

  const kto = await ktoWola(req).catch(() => null);
  if (!kto) return res.status(401).json({ error: "Unauthorized" });

  const wynik = { kto, dzis: C.ymd(), konta: [], tabele: {} };
  try {
    // ⚠️ Drugi bezpiecznik — znacznik w bazie.
    const znacznik = await rpc("demo_znacznik").catch(() => null);
    if (znacznik !== "shiftro-demo") {
      return res.status(409).json({
        error: "Ta baza nie ma znacznika demo (docs/sql/demo/demo.sql) — nic nie kasuję.",
      });
    }

    if (kto === "przycisk") {
      const lok = await fetch(`${SUPABASE_URL}/rest/v1/lokale?select=created_at&order=created_at.desc&limit=1`, {
        headers: jakoSerwis(),
      });
      const ostatni = lok.ok ? (await lok.json())[0] : null;
      if (ostatni && Date.now() - Date.parse(ostatni.created_at) < ODSTEP_MS) {
        return res.status(429).json({ error: "Dane demo zostały przywrócone przed chwilą — odśwież stronę." });
      }
    }

    const idAuth = await przygotujKonta(wynik);
    const dane = generuj({ dzis: wynik.dzis, teraz: new Date() });
    for (const u of dane.users) {
      if (u.email && idAuth[u.email]) u.auth_id = idAuth[u.email];
    }

    await rpc("demo_wyczysc");
    for (const tabela of KOLEJNOSC) {
      const wiersze = dane[tabela] || [];
      if (wiersze.length) await wstaw(tabela, wiersze);
      wynik.tabele[tabela] = wiersze.length;
    }
    return res.status(200).json(wynik);
  } catch (e) {
    wynik.error = e.message;
    return res.status(500).json(wynik);
  }
};
