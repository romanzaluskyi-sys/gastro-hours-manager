// Zmiana PIN-u pracownika przez kierownika — jedyna droga, żeby PIN w karcie
// i hasło w Supabase Auth pozostały tą samą rzeczą.
//
// ⚠️ Po co to w ogóle istnieje: PIN jest jednocześnie wpisem w kolumnie
// `users.kiosk_pin` (blokada profilu na tablecie) i hasłem konta w Auth
// (logowanie z prywatnego telefonu). Kierownik zmienia go w karcie pracownika
// — i gdyby zmieniała się tylko kolumna, logowanie tej osoby przestałoby
// działać po cichu, a objawem byłoby "nie pamiętam PIN-u" zgłoszone tydzień
// później. Zmiana cudzego hasła wymaga klucza SERVICE ROLE, którego front
// mieć nie może, więc musi to zrobić funkcja serwerowa.
//
// ⚠️ Zwykły CommonJS .js, bez importów z src/ — powód identyczny jak w
// api/cron/*.js: Vercel buduje api/ osobnym, legacy tsc, który przewraca się
// na starym `typescript` z package.json.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;              // publishable
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // omija RLS!

const MIN_HASLA = 6;
const ROLE_KIEROWNIKA = ["admin", "manager", "manager_lokalu"];

const jakoSerwis = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const pobierz = async (sciezka) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${sciezka}`, { headers: jakoSerwis });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
};

// Lokale, do których kierownik ma dostęp. ⚠️ Ta sama reguła co
// `hasAccessToLokal` w ManagerDashboard.tsx i `moje_lokale()` w migracji 0025:
// puste `allowed_lokale` u kierownika sieci znaczy WSZYSTKIE. Trzy miejsca
// muszą mówić to samo, inaczej ekran pozwala na coś, czego serwer odmawia.
const lokaleKierownika = (u) =>
  (u.allowed_lokale || "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Tylko POST" });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error:
        "Brak konfiguracji: SUPABASE_URL, SUPABASE_KEY lub SUPABASE_SERVICE_KEY. " +
        "Ustaw je w Vercel → Project Settings → Environment Variables " +
        "(procedura: docs/NOWY-KLIENT.md).",
    });
  }

  try {
    // --- 1. Kto pyta ---
    const naglowek = req.headers.authorization || "";
    const tokenWolajacego = naglowek.startsWith("Bearer ") ? naglowek.slice(7) : "";
    if (!tokenWolajacego) return res.status(401).json({ error: "Brak tokenu." });

    // ⚠️ Token weryfikuje SUPABASE, nie my. Samodzielne rozkodowanie JWT bez
    // sprawdzenia podpisu znaczyłoby tyle, co uwierzenie na słowo komuś, kto
    // właśnie prosi o zmianę cudzego hasła.
    const ktoRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokenWolajacego}` },
    });
    if (!ktoRes.ok) return res.status(401).json({ error: "Sesja wygasła. Zaloguj się ponownie." });
    const authUser = await ktoRes.json();

    const wolajacy = (
      await pobierz(`users?select=id,name,role,allowed_lokale&auth_id=eq.${authUser.id}`)
    )[0];
    if (!wolajacy || !ROLE_KIEROWNIKA.includes(wolajacy.role)) {
      return res.status(403).json({ error: "To może zrobić tylko kierownik." });
    }

    // --- 2. Kogo dotyczy ---
    const { user_id: userId, haslo } = req.body || {};
    if (!userId || !haslo) {
      return res.status(400).json({ error: "Brakuje user_id albo hasła." });
    }
    if (String(haslo).length < MIN_HASLA) {
      return res.status(400).json({
        error: `PIN musi mieć co najmniej ${MIN_HASLA} znaków — krótszego nie przyjmie logowanie.`,
      });
    }

    const cel = (
      await pobierz(`users?select=id,name,email,role,auth_id,default_lokal&id=eq.${userId}`)
    )[0];
    if (!cel) return res.status(404).json({ error: "Nie ma takiego pracownika." });

    // ⚠️ Kierownik lokalu zmienia PIN-y TYLKO swoim ludziom. Bez tego
    // sprawdzenia endpoint pozwalałby każdemu kierownikowi przejąć konto
    // kogokolwiek w sieci — a front, który tego nie pokazuje, nie jest
    // zabezpieczeniem.
    const moje = lokaleKierownika(wolajacy);
    if (wolajacy.role === "manager_lokalu" && moje.length) {
      if (!moje.includes(cel.default_lokal || "")) {
        return res.status(403).json({ error: "Ten pracownik nie jest z Twojego lokalu." });
      }
    }

    const email = (cel.email || "").trim().toLowerCase();

    // --- 3a. Konto już jest: zmieniamy hasło ---
    if (cel.auth_id) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${cel.auth_id}`, {
        method: "PUT",
        headers: jakoSerwis,
        body: JSON.stringify({ password: String(haslo) }),
      });
      if (!r.ok) throw new Error(`Zmiana hasła nie przeszła: ${r.status} ${await r.text()}`);
      return res.status(200).json({ ok: true, akcja: "zmienione" });
    }

    // --- 3b. Konta nie ma: zakładamy, jeśli jest czym ---
    // Bez e-maila nie ma czego założyć i NIE jest to błąd: większość załogi
    // obsługuje tablet, który loguje się własnym kontem. PIN w kolumnie i tak
    // został już zapisany przez front — blokada profilu działa bez Auth.
    if (!email) {
      return res.status(200).json({ ok: true, akcja: "tylko_kolumna" });
    }
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: jakoSerwis,
      body: JSON.stringify({
        email,
        password: String(haslo),
        email_confirm: true,
        user_metadata: { name: cel.name, rola: cel.role },
      }),
    });
    if (!r.ok) throw new Error(`Zakładanie konta nie przeszło: ${r.status} ${await r.text()}`);
    const nowe = await r.json();

    const link = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${cel.id}`, {
      method: "PATCH",
      headers: jakoSerwis,
      body: JSON.stringify({ auth_id: nowe.id }),
    });
    if (!link.ok) {
      // ⚠️ Konto w Auth już istnieje, ale kartoteka o nim nie wie — przy
      // następnej próbie powstałoby drugie na ten sam e-mail (Auth na to nie
      // pozwoli) i nikt by nie zrozumiał dlaczego. Mówimy wprost.
      throw new Error(
        `Konto powstało, ale nie udało się go powiązać z kartoteką (${link.status}). ` +
          "Zgłoś to — trzeba dopisać auth_id ręcznie."
      );
    }
    return res.status(200).json({ ok: true, akcja: "zalozone" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Nieoczekiwany błąd." });
  }
};
