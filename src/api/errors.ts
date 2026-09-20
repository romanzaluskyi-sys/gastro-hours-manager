// @ts-nocheck
import { SUPABASE_URL, SUPABASE_KEY, APP_VERSION, TENANT, isConfigured } from "../config";

// Zapis błędu do tabeli `app_errors` (migracja 0024).
//
// Po co: do 0.41.0 błąd w przeglądarce nie zostawiał żadnego śladu. Aplikacja
// stoi na tablecie w kuchni, więc zgłoszeniem był telefon "nie działa" —
// zwykle następnego dnia, bez wersji, bez ekranu, bez treści błędu. Przy
// jednym kliencie dawało się z tym żyć, przy kilku nie.
//
// ⚠️ Ta funkcja NIE MOŻE rzucić. Woła się ją z miejsc, w których coś już
// poszło nie tak; wyjątek w obsłudze wyjątku zamienia jeden zepsuty ekran w
// zepsutą całą aplikację. Stąd try/catch dookoła wszystkiego i `catch(() => {})`
// na samym fetchu.

// ⚠️ Ochrona przed zalaniem bazy. Jeden błąd w pętli renderowania Reacta
// potrafi wywołać się tysiące razy w minutę — czyli akurat wtedy, gdy baza
// jest najbardziej potrzebna do pracy. Licznik jest per-sesja przeglądarki
// (zwykła zmienna modułu): odświeżenie strony zaczyna od nowa i to jest w
// porządku, bo odświeżenie po awarii to nowy przypadek.
const LIMIT_NA_SESJE = 5;
let zapisanych = 0;
const juzWidziane = new Set();

// Ustawiane z App.tsx — bez tego wiadomo TYLKO, że coś się wywaliło, a nie
// komu i na którym ekranie. Trzymane tutaj, a nie przekazywane w argumencie,
// bo globalne nasłuchy (window.onerror) nie mają skąd tego wziąć.
let kontekst = { user_name: null, rola: null, lokal: null, ekran: null };

export const ustawKontekstBledow = (nowy) => {
  kontekst = { ...kontekst, ...nowy };
};

export const zapiszBlad = (typ, blad, dodatkowy) => {
  try {
    if (!isConfigured) return;
    if (zapisanych >= LIMIT_NA_SESJE) return;

    const komunikat = String(
      (blad && (blad.message || blad.reason || blad)) || "(bez komunikatu)"
    ).slice(0, 2000);

    // Ten sam błąd zgłoszony drugi raz nie niesie nowej informacji, a potrafi
    // lecieć przy każdym renderze.
    const klucz = typ + "|" + komunikat;
    if (juzWidziane.has(klucz)) return;
    juzWidziane.add(klucz);
    zapisanych += 1;

    const wiersz = {
      app_version: APP_VERSION,
      tenant: TENANT || null,
      typ,
      komunikat,
      stos: String((blad && blad.stack) || dodatkowy || "").slice(0, 4000) || null,
      ekran: kontekst.ekran,
      user_name: kontekst.user_name,
      rola: kontekst.rola,
      lokal: kontekst.lokal,
      url: typeof location !== "undefined" ? location.href.slice(0, 500) : null,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
    };

    // Świadomie bez `await` i bez api.post: tamto rzuca przy !res.ok, a tutaj
    // nie ma komu tego złapać ani po co. Zapis błędu jest usługą dla nas,
    // nie dla użytkownika — jeśli nie przejdzie, użytkownik nie może na tym
    // nic stracić.
    fetch(`${SUPABASE_URL}/rest/v1/app_errors`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wiersz),
    }).catch(() => {});
  } catch (e) {
    /* obsługa błędu nie może być źródłem błędu */
  }
};

// Nasłuchy globalne — łapią to, czego NIE łapie ErrorBoundary: błędy w
// handlerach zdarzeń, w setTimeout i odrzucone obietnice (czyli między innymi
// każde nieobsłużone `api.get`).
export const wlaczGlobalneNasluchy = () => {
  try {
    if (typeof window === "undefined") return;
    window.addEventListener("error", (e) => {
      zapiszBlad("window", e.error || { message: e.message }, `${e.filename}:${e.lineno}`);
    });
    window.addEventListener("unhandledrejection", (e) => {
      zapiszBlad("promise", e.reason);
    });
  } catch (e) {
    /* jw. */
  }
};
