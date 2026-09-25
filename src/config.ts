// @ts-nocheck
// ⚠️ `@ts-nocheck` doszedł w 0.33.0 razem z odczytem zmiennych środowiskowych.
// Wcześniej ten plik był samymi literałami i jako jedyny w `src/` obywał się
// bez tej linii; po dodaniu funkcji pomocniczych `strict: true` wywala
// TS7006 na nietypowanych parametrach i build na Vercelu pada. Reszta plików
// frontendu ma to samo — patrz błąd #4 w CLAUDE.md.
// ==========================================
// KONFIGURACJA NAJEMCY (tenant)
// ==========================================
// ⚠️ Model silo: KAŻDY klient dostaje własny projekt Supabase i własny projekt
// Vercel, a repozytorium jest jedno. Dlatego nic, co różni klientów, nie może
// stać w kodzie — inaczej "drugi klient" znaczy "kopia repozytorium", a każda
// kolejna poprawka musi być wklejana w obie kopie ręcznie.
//
// Wartości ustawia się w Vercel → Project Settings → Environment Variables.
// CRA wstawia do bundla tylko zmienne z przedrostkiem REACT_APP_ i robi to na
// etapie builda, więc po ich zmianie trzeba wykonać redeploy — samo zapisanie
// zmiennej nic nie zmienia w już zbudowanej paczce.
//
// ⚠️ Zmienne muszą być ustawione dla WSZYSTKICH środowisk (Production,
// Preview, Development), nie tylko produkcji. Ustawione tylko dla produkcji
// dają deploy podglądowy z pustą konfiguracją — czyli każdy PR wygląda na
// zepsuty, choć zepsute są ustawienia projektu.
//
// ⚠️ FALLBACKU NA DANE PIERWSZEGO KLIENTA JUŻ NIE MA i nie wolno go dopisywać.
// Do 0.40.0 stały tu adres i klucz "Gastro Emka" — bezpiecznik na czas
// wdrażania modelu silo, żeby merge 0.33.0 nie zgasił działającej produkcji,
// zanim ktokolwiek ustawi zmienne. Bezpiecznik zrobił swoje i stał się
// pułapką: wdrożenie NOWEGO klienta bez ustawionych zmiennych po cichu
// czytało i ZAPISYWAŁO cudzą bazę, a wyglądało na działające. Dziś brak
// konfiguracji kończy się wyraźnym ekranem (patrz `isConfigured` i App.tsx) —
// widoczna awaria jest nieporównanie lepsza niż ciche pokazywanie cudzych
// danych.
//
// ⚠️ CRA podmienia na etapie builda CAŁE wyrażenie `process.env` na literał
// obiektu ze wszystkimi zmiennymi REACT_APP_*. Podmiana działa na dopasowaniu
// tekstu, więc `process.env` musi w tym pliku wystąpić dosłownie — i występuje
// dokładnie raz, niżej. Od tego miejsca czytamy już ze zwykłego obiektu.
//
// ⚠️ Osłona jest `try/catch`, a NIE `typeof process !== "undefined"`.
// DefinePlugin podmienia tekst `process.env` na literał obiektu, ale samego
// `process` już nie — więc `typeof process` w zbudowanej paczce daje
// "undefined", warunek się nie spełnia i konfiguracja spada na wartości puste.
// `try/catch` działa w obu światach: w produkcji nie ma czego złapać (jest
// literał), a w harnessach ładowanych prosto w przeglądarce `process` nie
// istnieje i leci ReferenceError, który tu łapiemy.
let jest = {};
try {
  jest = process.env || {};
} catch (e) {
  jest = {};
}

// Harnessy (harness-*.html) ładują ten plik prosto w przeglądarce, bez builda
// CRA, więc nie mają skąd wziąć zmiennych. Te, które faktycznie rozmawiają z
// bazą, ustawiają `window.__SHIFTRO_ENV` PRZED załadowaniem modułu. To jest
// jedyna droga na podanie konfiguracji z pominięciem builda — i ma być
// jawna: harness, który sięga do prawdziwej bazy, musi mieć to napisane u
// siebie, a nie dziedziczyć po cichu z kodu produkcyjnego.
try {
  if (typeof window !== "undefined" && window.__SHIFTRO_ENV) {
    jest = { ...jest, ...window.__SHIFTRO_ENV };
  }
} catch (e) {
  /* w bundlu nie ma czego łapać */
}

const env = (v, domyslna) => (v == null || v === "" ? domyslna : v);

export const SUPABASE_URL = env(jest.REACT_APP_SUPABASE_URL, "");
export const SUPABASE_KEY = env(jest.REACT_APP_SUPABASE_KEY, "");

// Pusty adres jest w porządku: klient, który nie miał wcześniej systemu na
// arkuszach Google, nie potrzebuje synchronizacji. `sendToGoogleSheets`
// sprawdza, czy to w ogóle adres skryptu, i przy pustym po prostu nie wysyła
// nic. ⚠️ Domyślna wartość MUSI zostać stringiem — tam woła się na niej
// `.includes()`.
export const GOOGLE_SCRIPT_URL = env(jest.REACT_APP_GOOGLE_SCRIPT_URL, "");

// Nazwa sieci/klienta — pokazywana na ekranie logowania i w panelu. Jedyny
// widoczny gołym okiem sygnał, że wdrożenie jest podpięte pod właściwą bazę.
// ⚠️ Bez domyślnej nazwy klienta: wpisana tu "Gastro Emka" robiła z tego
// sygnału ozdobnik, bo stała na ekranie także wtedy, gdy nikt niczego nie
// ustawił. Brak wartości ma być widać.
export const TENANT = env(jest.REACT_APP_TENANT, "");

// Nazwa produktu. Osobna od TENANT: produkt nazywa się tak samo u wszystkich,
// klient jest u każdego inny. Dlatego TU domyślna wartość jest na miejscu —
// nie różnicuje klientów. Zmienna zostaje na wypadek wdrożenia pod cudzą marką.
export const PRODUKT = env(jest.REACT_APP_PRODUKT, "Shiftro");

// Czego brakuje, żeby to wdrożenie w ogóle miało z czym rozmawiać. Lista, a
// nie `false`, bo ekran błędu ma powiedzieć KTÓREJ zmiennej brakuje — inaczej
// diagnoza sprowadza się do zgadywania po kolei.
export const brakujaceZmienne = [
  !SUPABASE_URL || !SUPABASE_URL.includes("supabase.co")
    ? "REACT_APP_SUPABASE_URL"
    : null,
  !SUPABASE_KEY || !SUPABASE_KEY.includes("sb_")
    ? "REACT_APP_SUPABASE_KEY"
    : null,
  !TENANT ? "REACT_APP_TENANT" : null,
].filter(Boolean);

// ⚠️ `REACT_APP_TENANT` świadomie NIE wchodzi do `isConfigured`. Brak nazwy
// najemcy nie jest powodem, żeby zgasić działającą aplikację — to sygnał dla
// oka, nie warunek połączenia. Wchodzi za to do `brakujaceZmienne`, więc
// ekran konfiguracji i tak o nim powie.
export const isConfigured =
  SUPABASE_URL.includes("supabase.co") && SUPABASE_KEY.includes("sb_");

// Podbijana przy każdej zmianie widocznej dla użytkownika — historia w
// CHANGELOG.md. Wyświetlana na ekranie logowania (LoginScreen.tsx).
export const APP_VERSION = "0.47.0";
