// PIN-y — JEDYNE miejsce, które je zmienia (od 0.77.0, migracja 0046).
//
// Trzy wywołania pod jednym adresem (`akcja` w treści żądania):
//   * bez akcji — kierownik ustawia albo usuwa PIN pracownika w karcie;
//   * "przypomnij" — „Nie pamiętam PIN-u” z ekranu logowania: e-mail z linkiem;
//   * "nowy" — nowy PIN wpisany po kliknięciu w ten link.
// ⚠️ Jeden plik zamiast trzech, bo projekt ma już 12 funkcji w `api/` — tyle,
// ile Vercel pozwala w planie Hobby. Trzynasta wywróciłaby deploy klienta,
// który na tym planie jest.
//
// ⚠️ Po co to w ogóle istnieje: PIN jest hasłem konta w Supabase Auth, a u
// pracownika z prywatnym telefonem także blokadą profilu na tablecie
// (`users.kiosk_pin`). Te dwie rzeczy mają się zmieniać RAZEM — inaczej tablet
// otwiera się nowym PIN-em, a logowanie dalej chce starego, i objawem jest
// „nie pamiętam PIN-u” zgłoszone tydzień później. Zmiana cudzego hasła wymaga
// klucza SERVICE ROLE, którego front mieć nie może.
//
// ⚠️ Od 0046 baza trzyma `kiosk_pin` jako hash (trigger `chron_piny` liczy go
// sam, gdy dostanie sześć cyfr), a zapis PIN-u z aplikacji pomija. Dlatego
// kolumnę zapisujemy TUTAJ, kluczem serwisowym, jawnymi cyframi.
//
// ⚠️ Zwykły CommonJS .js, bez importów z src/ — powód identyczny jak w
// api/cron/*.js: Vercel buduje api/ osobnym, legacy tsc, który przewraca się
// na starym `typescript` z package.json.

const crypto = require("crypto");
const { jestKontemDemo } = require("../_lib/demoKonta");
const { pobierz, zmien, dodajJesliNowy, usun, zakoduj } = require("../_lib/baza");
const { adresAplikacji, wyslij } = require("../_lib/poczta");
const { koperta, tytul, akapit, przycisk, notka } = require("../_lib/szablon");
const C = require("../_lib/czas");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;              // publishable
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // omija RLS!

const ROLE_KIEROWNIKA = ["admin", "manager", "manager_lokalu"];
const PIN_OK = /^[0-9]{6}$/;

// Ile próśb o reset na jeden adres w godzinę. Liczone dla KAŻDEGO wpisanego
// adresu, także nieistniejącego — inaczej odpowiedź „za dużo” mówiłaby, które
// adresy są w systemie.
const LIMIT_RESETOW = 3;

const jakoSerwis = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// Lokale osoby: `default_lokal` (pracownik) ALBO `allowed_lokale` (tablet,
// kierownik) — w tej bazie to pytanie ma dwie odpowiedzi (CLAUDE.md, „Porcja
// 2”). Do 0.76.0 sprawdzaliśmy sam `default_lokal`, więc kierownik lokalu nie
// mógł zmienić PIN-u tabletu swojego lokalu.
const lokaleOsoby = (u) =>
  [u.default_lokal, ...String(u.allowed_lokale || "").split(",")]
    .map((l) => (l || "").trim())
    .filter(Boolean);

// Puste `allowed_lokale` u kierownika sieci znaczy WSZYSTKIE — ta sama reguła
// co `hasAccessToLokal` w ManagerDashboard.tsx i `moje_lokale()` w bazie.
const lokaleKierownika = (u) =>
  String(u.allowed_lokale || "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

const auth = async (sciezka, opcje = {}) => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${sciezka}`, {
    ...opcje,
    headers: { ...jakoSerwis, ...(opcje.headers || {}) },
  });
  const tekst = await r.text().catch(() => "");
  let json = {};
  try {
    json = tekst ? JSON.parse(tekst) : {};
  } catch (e) {
    json = {};
  }
  if (!r.ok) {
    const e = new Error(`Auth ${r.status}: ${(json.msg || json.message || tekst).slice(0, 200)}`);
    e.status = r.status;
    throw e;
  }
  return json;
};

// Hasło w Auth: zmiana, a gdy konta nie ma — założenie i dowiązanie do kartoteki.
const ustawHasloAuth = async (cel, haslo) => {
  if (cel.auth_id) {
    await auth(`admin/users/${cel.auth_id}`, {
      method: "PUT",
      body: JSON.stringify({ password: haslo }),
    });
    return "zmienione";
  }
  const email = (cel.email || "").trim().toLowerCase();
  const nowe = await auth("admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: haslo,
      email_confirm: true,
      user_metadata: { name: cel.name, rola: cel.role },
    }),
  });
  try {
    await zmien("users", `id=eq.${cel.id}`, { auth_id: nowe.id });
  } catch (e) {
    // ⚠️ Konto w Auth już istnieje, ale kartoteka o nim nie wie — przy
    // następnej próbie powstałoby drugie na ten sam e-mail (Auth na to nie
    // pozwoli) i nikt by nie zrozumiał dlaczego. Mówimy wprost.
    throw new Error(
      "Konto powstało, ale nie udało się go powiązać z kartoteką. " +
        "Zgłoś to — trzeba dopisać auth_id ręcznie."
    );
  }
  return "zalozone";
};

// Blokada na tablecie + jej licznik prób. Nowy PIN zdejmuje też blokadę po
// zbyt wielu próbach (migracja 0046) — to jest droga kierownika do odblokowania
// profilu przed upływem kwadransa.
const ustawKioskPin = async (cel, haslo) => {
  await zmien("users", `id=eq.${cel.id}`, { kiosk_pin: haslo });
  await usun("limity_pin", `rodzaj=eq.kiosk&klucz=eq.${cel.id}`).catch(() => {});
};

// Hasło, którego nikt nie zna — „zamyka” logowanie z prywatnego telefonu bez
// kasowania konta w Auth (karta może je potem otworzyć nowym PIN-em).
const hasloNiedoZgadniecia = () => crypto.randomBytes(24).toString("base64");

// --------------------------------------------------------------------------
// Po każdej zmianie: dziennik i wiadomość dla osoby, której PIN się zmienił
// (migracja 0046, `piny_zmiany`). Jedyny sygnał, że ktoś zmienił CUDZY PIN —
// kierownik lokalu w karcie albo ktoś z dostępem do czyjejś skrzynki.
//
// ⚠️ Oba kroki są best-effort: PIN jest już zmieniony, więc błąd zapisu
// śladu ani maila nie może zamienić udanej zmiany w komunikat o błędzie.
// ⚠️ Mail idzie OD RAZU i bez sprawdzania `email_powiadomienia` — to
// powiadomienie bezpieczeństwa, nie kopia wiadomości. Wiersz w `notifications`
// dostaje od razu `email_at`, żeby kolejka (wyslij-maile) nie wysłała drugiego.
// --------------------------------------------------------------------------
const kiedyTeraz = () => {
  const d = new Date();
  const [y, m, dz] = C.ymd(d).split("-");
  return `${dz}.${m}.${y} o ${C.hhmm(d)}`;
};

const tekstZmiany = (cel, kto, sposob) => {
  const kiedy = kiedyTeraz();
  if (sposob === "reset_mailem") {
    return `Twój PIN został zmieniony ${kiedy} — przez link z e-maila „Nie pamiętam PIN-u”. Jeśli to nie Ty, od razu powiedz kierownikowi.`;
  }
  if (sposob === "kierownik_usunal") {
    return `${kto.name} zdjął(-ęła) blokadę PIN-em z Twojego profilu na tablecie ${kiedy}. Logowanie z prywatnego telefonu jest wyłączone, dopóki nie dostaniesz nowego PIN-u.`;
  }
  if (kto && kto.id === cel.id) return `Twój PIN został zmieniony ${kiedy} w karcie pracownika.`;
  return `${kto.name} ustawił(a) Ci nowy PIN ${kiedy}. Jeśli o to nie prosiłeś(-aś), zgłoś to kierownikowi albo właścicielowi.`;
};

const odnotujZmiane = async (cel, kto, sposob) => {
  const tekst = tekstZmiany(cel, kto, sposob);
  try {
    await dodajJesliNowy("piny_zmiany", {
      user_id: cel.id,
      user_name: cel.name,
      kto_id: kto ? kto.id : cel.id,
      kto_name: kto ? kto.name : cel.name,
      sposob,
    });
  } catch (e) {
    // Baza bez 0046 nie ma tej tabeli — zmiana PIN-u działa i tak.
    console.error("pin: dziennik zmian nie zapisany", e.message);
  }
  // Wiadomość w aplikacji czyta pracownik (tablet, telefon); kierownik i
  // tablet takiej zakładki nie mają — im wystarczy mail.
  if (cel.role === "open" || cel.role === "closed") {
    try {
      const teraz = new Date().toISOString();
      await dodajJesliNowy("notifications", {
        audience: "employee",
        user_name: cel.name,
        type: "pin",
        message: tekst,
        is_read: false,
        email_at: teraz,
        email_info: "pominięto: powiadomienie o PIN-ie wysłane osobno",
      });
    } catch (e) {
      console.error("pin: wiadomość nie zapisana", e.message);
    }
  }
  const adres = String(cel.email || "").trim().toLowerCase();
  if (adres && process.env.BREVO_API_KEY && process.env.EMAIL_FROM && !jestKontemDemo(adres)) {
    const temat = sposob === "kierownik_usunal" ? "Blokada PIN-em zdjęta" : "Twój PIN został zmieniony";
    try {
      await wyslij({
        adres,
        imie: cel.name,
        temat,
        html: koperta({
          temat,
          zajawka: tekst,
          prawo: "",
          tresc:
            tytul(temat) +
            akapit(tekst.replace(/[<>&"]/g, "")) +
            notka("Sam PIN nigdy nie jest wysyłany e-mailem. Tej wiadomości nie da się wyłączyć — dotyczy bezpieczeństwa Twojego konta."),
          stopka: "Dostajesz tę wiadomość, bo zmienił się PIN do Twojego konta",
        }),
        tekst,
        tag: "pin-zmieniony",
      });
    } catch (e) {
      console.error("pin: mail o zmianie nie wyszedł", e.message);
    }
  }
};

// --------------------------------------------------------------------------
// 1. Kierownik w karcie pracownika
// --------------------------------------------------------------------------
const ustawPrzezKierownika = async (req, res) => {
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

  const { user_id: userId, haslo: surowe, usun: usunPin } = req.body || {};
  const haslo = String(surowe || "").trim();
  if (!userId) return res.status(400).json({ error: "Brakuje user_id." });
  if (!usunPin && !PIN_OK.test(haslo)) {
    return res.status(400).json({ error: "PIN ma mieć dokładnie 6 cyfr." });
  }

  const cel = (
    await pobierz(
      `users?select=id,name,email,role,auth_id,default_lokal,allowed_lokale&id=eq.${zakoduj(userId)}`
    )
  )[0];
  if (!cel) return res.status(404).json({ error: "Nie ma takiego pracownika." });

  // ⚠️ Kierownik lokalu zmienia PIN-y TYLKO swoim ludziom. Bez tego
  // sprawdzenia endpoint pozwalałby każdemu kierownikowi przejąć konto
  // kogokolwiek w sieci — a front, który tego nie pokazuje, nie jest
  // zabezpieczeniem.
  const moje = lokaleKierownika(wolajacy);
  if (wolajacy.role === "manager_lokalu" && moje.length) {
    if (!lokaleOsoby(cel).some((l) => moje.includes(l))) {
      return res.status(403).json({ error: "Ten pracownik nie jest z Twojego lokalu." });
    }
  }

  const email = (cel.email || "").trim().toLowerCase();

  // Wersja demonstracyjna: PIN trzech kont z przycisków na ekranie logowania
  // jest stały — zmieniony przez jednego odwiedzającego wyłączyłby logowanie
  // wszystkim do nocnego resetu. Kolumnę w bazie chroni trigger z
  // docs/sql/demo/demo.sql; to jest ta sama ochrona po stronie hasła w Auth.
  if (process.env.DEMO === "tak" && jestKontemDemo(email)) {
    return res.status(403).json({
      error: "To konto demonstracyjne — jego PIN jest stały, żeby każdy mógł się nim zalogować.",
    });
  }

  // --- Pracownik kiosku: blokada na tablecie (+ prywatny telefon) ---
  if (cel.role === "open") {
    // Najpierw Auth — częściej odmawia (sieć, limit), a rozjazd w tę stronę
    // (hasło zmienione, blokada stara) jest gorszy niż brak zmiany w ogóle.
    let akcja = "tylko_tablet";
    if (usunPin) {
      // Telefon wymaga OBU pól (PIN i e-mail) — bez PIN-u logowanie z
      // telefonu ma przestać działać, a nie zostać przy starym haśle.
      if (cel.auth_id) await ustawHasloAuth(cel, hasloNiedoZgadniecia());
      await ustawKioskPin(cel, null);
      await odnotujZmiane(cel, wolajacy, "kierownik_usunal");
      return res.status(200).json({ ok: true, akcja: "usuniete" });
    }
    if (email) akcja = await ustawHasloAuth(cel, haslo);
    try {
      await ustawKioskPin(cel, haslo);
    } catch (e) {
      throw new Error(
        `Hasło do logowania zmienione, ale blokada na tablecie NIE (${e.message}). Spróbuj zapisać PIN jeszcze raz.`
      );
    }
    await odnotujZmiane(cel, wolajacy, "kierownik");
    return res.status(200).json({ ok: true, akcja });
  }

  // --- Kierownik, tablet, `closed`: PIN to wyłącznie hasło w Auth ---
  if (usunPin) {
    return res.status(400).json({ error: "To konto loguje się PIN-em — można go zmienić, nie usunąć." });
  }
  if (!email) {
    return res.status(400).json({ error: "Najpierw wpisz e-mail — PIN jest hasłem do logowania tym adresem." });
  }
  const akcja = await ustawHasloAuth(cel, haslo);
  await odnotujZmiane(cel, wolajacy, "kierownik");
  return res.status(200).json({ ok: true, akcja });
};

// --------------------------------------------------------------------------
// 2. „Nie pamiętam PIN-u” — e-mail z linkiem
// --------------------------------------------------------------------------
// ⚠️ Odpowiedź jest TA SAMA dla adresu, który jest w systemie, i dla takiego,
// którego nie ma — inaczej ten formularz byłby wyszukiwarką kont.
const ODPOWIEDZ_PRZYPOMNIJ = {
  ok: true,
  info: "Jeśli to konto istnieje i ma dostęp do aplikacji, wysłaliśmy na ten adres link do ustawienia nowego PIN-u. Sprawdź też folder Spam.",
};

// Dokąd prowadzi link z maila. ⚠️ Na podglądzie PR-a (Vercel Preview) — na TEN
// podgląd, nie na APP_URL: produkcja ma jeszcze starą wersję, która nie zna
// `?nowy_pin=`, więc test na Preview kończyłby się zwykłym ekranem logowania.
// VERCEL_ENV / VERCEL_BRANCH_URL / VERCEL_URL ustawia sam Vercel — nie bierzemy
// adresu z nagłówka Host, bo ten podaje wołający, a link niesie token do konta.
const adresLinku = () => {
  if (process.env.VERCEL_ENV === "preview") {
    const podglad = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (podglad) return `https://${podglad}`;
  }
  return adresAplikacji();
};

const przypomnij = async (req, res) => {
  // Do tego maila wystarczą Brevo i adres aplikacji — bez CRON_SECRET (ten
  // podpisuje tylko link „Ustawienia powiadomień”, którego tu nie ma).
  const brak = [
    !process.env.BREVO_API_KEY && "BREVO_API_KEY",
    !process.env.EMAIL_FROM && "EMAIL_FROM",
    !adresLinku() && "APP_URL",
  ].filter(Boolean);
  if (brak.length) {
    // Nazwy zmiennych tylko do logów — to publiczny adres (CLAUDE.md, zdrowie.js).
    console.error("nowy-pin: brak zmiennych", brak.join(", "), process.env.VERCEL_ENV || "");
    return res.status(500).json({
      error: "Wysyłka maili nie jest skonfigurowana — PIN zmieni kierownik w karcie pracownika.",
    });
  }
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Podaj e-mail konta." });

  const godzineTemu = new Date(Date.now() - 3600 * 1000).toISOString();
  const proby = await pobierz(
    `limity_pin?select=id&rodzaj=eq.reset&klucz=eq.${zakoduj(email)}&kiedy=gt.${zakoduj(godzineTemu)}`
  );
  if (proby.length >= LIMIT_RESETOW) {
    return res.status(429).json({ error: "Za dużo próśb o nowy PIN dla tego adresu. Spróbuj za godzinę." });
  }
  await dodajJesliNowy("limity_pin", { rodzaj: "reset", klucz: email });

  // Konto musi istnieć w Auth i być aktywne w kartotece — ktoś po ostatnim
  // dniu pracy nie odzyskuje dostępu mailem.
  const kandydaci = await pobierz(
    `users?select=id,name,email,role,auth_id,active,archived&email=eq.${zakoduj(email)}`
  );
  const kto = kandydaci.find((u) => u.auth_id && u.active && !u.archived);
  if (!kto || (process.env.DEMO === "tak" && jestKontemDemo(email))) {
    return res.status(200).json(ODPOWIEDZ_PRZYPOMNIJ);
  }

  // Link bez wysyłki przez Supabase: token bierzemy z API administratora, a
  // list wysyła nasze Brevo (ten sam nadawca i wygląd co reszta maili, bez
  // osobnej konfiguracji SMTP w każdym projekcie Supabase).
  const link = await auth("admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "recovery", email }),
  });
  const token = link.hashed_token || (link.properties && link.properties.hashed_token);
  if (!token) throw new Error("Auth nie oddał tokenu odzyskiwania.");

  // ⚠️ Samo otwarcie linku niczego nie zużywa — token idzie do Auth dopiero
  // z nowym PIN-em (akcja "nowy"). Skanery linków w skrzynkach otwierają
  // każdy link; gdyby wejście zużywało token, link nie działałby człowiekowi.
  const url = `${adresLinku()}/?nowy_pin=${zakoduj(token)}`;
  const naTablecie = kto.role === "open";
  const temat = "Nowy PIN do aplikacji";
  const html = koperta({
    temat,
    zajawka: "Link do ustawienia nowego PIN-u",
    prawo: "",
    tresc:
      tytul("Ustaw nowy PIN") +
      akapit(
        `Ktoś — pewnie Ty — poprosił o nowy PIN do konta <b>${email.replace(/[<>&"]/g, "")}</b>. ` +
          "Kliknij przycisk i wpisz nowe sześć cyfr. Stary PIN przestanie działać." +
          (naTablecie ? " Ten sam PIN otwiera Twój profil na tablecie w lokalu." : "")
      ) +
      przycisk("Ustaw nowy PIN", url) +
      notka("Link działa jeden raz i wygasa po godzinie. Jeśli to nie Ty — zignoruj tę wiadomość, PIN się nie zmieni."),
    stopka: "Dostajesz tę wiadomość, bo ktoś poprosił o nowy PIN na ekranie logowania",
  });
  const tekst =
    `Ustaw nowy PIN: ${url}\n\n` +
    "Link działa jeden raz i wygasa po godzinie. Jeśli to nie Ty — zignoruj tę wiadomość.";
  try {
    await wyslij({ adres: email, imie: kto.name, temat, html, tekst, tag: "nowy-pin" });
  } catch (e) {
    // Bez szczegółów z Brevo — treść odmowy mówiłaby, że ten adres jest w
    // systemie. Szczegół zostaje w logach funkcji.
    console.error("nowy-pin: wysyłka nie wyszła", e.message);
    return res.status(502).json({ error: "Nie udało się wysłać maila. Spróbuj za kilka minut albo poproś kierownika o nowy PIN." });
  }
  return res.status(200).json(ODPOWIEDZ_PRZYPOMNIJ);
};

// --------------------------------------------------------------------------
// 3. Nowy PIN po kliknięciu w link
// --------------------------------------------------------------------------
const nowyPin = async (req, res) => {
  const { token, haslo: surowe } = req.body || {};
  const haslo = String(surowe || "").trim();
  if (!token) return res.status(400).json({ error: "Brak tokenu z linku." });
  if (!PIN_OK.test(haslo)) return res.status(400).json({ error: "PIN ma mieć dokładnie 6 cyfr." });

  // Token sprawdza i ZUŻYWA Auth — drugi raz ten sam link już nie zadziała.
  const ver = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "recovery", token_hash: String(token) }),
  });
  const sesja = await ver.json().catch(() => ({}));
  const authId = sesja.user && sesja.user.id;
  if (!ver.ok || !authId) {
    return res.status(400).json({
      error: "Ten link wygasł albo został już użyty. Poproś o nowy na ekranie logowania.",
    });
  }

  // Sesja z linku jest nam potrzebna tylko do tego, żeby wiedzieć, KIM jest
  // ta osoba. Zamykamy ją od razu; zaloguje się zwyczajnie nowym PIN-em.
  const zamknijSesje = () =>
    fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${sesja.access_token}` },
    }).catch(() => {});

  const cel = (
    await pobierz(`users?select=id,name,email,role,auth_id,active,archived&auth_id=eq.${zakoduj(authId)}`)
  )[0];
  const email = String((cel && cel.email) || (sesja.user && sesja.user.email) || "").trim().toLowerCase();
  if (!cel || !cel.active || cel.archived || (process.env.DEMO === "tak" && jestKontemDemo(email))) {
    await zamknijSesje();
    return res.status(403).json({ error: "To konto nie ma dostępu do aplikacji. Zapytaj kierownika." });
  }

  await ustawHasloAuth(cel, haslo);
  if (cel.role === "open") await ustawKioskPin(cel, haslo);
  await zamknijSesje();
  await odnotujZmiane(cel, null, "reset_mailem");
  return res.status(200).json({ ok: true, email });
};

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
    const akcja = (req.body || {}).akcja;
    if (akcja === "przypomnij") return await przypomnij(req, res);
    if (akcja === "nowy") return await nowyPin(req, res);
    return await ustawPrzezKierownika(req, res);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Nieoczekiwany błąd." });
  }
};
