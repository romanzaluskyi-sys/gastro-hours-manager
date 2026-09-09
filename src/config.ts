// @ts-nocheck
// ⚠️ `@ts-nocheck` doszedł w 0.33.0 razem z odczytem zmiennych środowiskowych.
// Wcześniej ten plik był samymi literałami i jako jedyny w `src/` obywał się
// bez tej linii; po dodaniu funkcji pomocniczych `strict: true` wywala
// TS7006 na nietypowanych parametrach i build na Vercelu pada. Reszta plików
// frontendu ma to samo — patrz błąd #4 w tym pliku CLAUDE.md.
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
// Fallback na wartości pierwszego klienta zostaje świadomie: bez niego merge
// tej zmiany zgasiłby produkcję, zanim ktokolwiek zdąży ustawić zmienne.
// ⚠️ Fallback jest jednocześnie pułapką — projekt bez ustawionych zmiennych
// po cichu podłączy się do BAZY PIERWSZEGO KLIENTA. Dlatego niżej jest
// TENANT: nazwa najemcy widoczna na ekranie logowania i w panelu. Jeśli w
// nowym wdrożeniu widzisz tam nazwę starego klienta, zmiennych nie ustawiono.
// ⚠️ CRA podmienia na etapie builda CAŁE wyrażenie `process.env` na literał
// obiektu ze wszystkimi zmiennymi REACT_APP_*. Podmiana działa na dopasowaniu
// tekstu, więc `process.env` musi w tym pliku wystąpić dosłownie — i występuje
// dokładnie raz, niżej. Od tego miejsca czytamy już ze zwykłego obiektu.
//
// ⚠️ Osłona jest `try/catch`, a NIE `typeof process !== "undefined"`.
// DefinePlugin podmienia tekst `process.env` na literał obiektu, ale samego
// `process` już nie — więc `typeof process` w zbudowanej paczce daje
// "undefined", warunek się nie spełnia i cała konfiguracja spada na fallback,
// czyli na bazę pierwszego klienta. Dokładnie ta awaria, przed którą ten plik
// ma chronić. `try/catch` działa w obu światach: w produkcji nie ma czego
// złapać (jest literał), a w harnessach ładowanych prosto w przeglądarce
// `process` nie istnieje i leci ReferenceError, który tu łapiemy.
let jest = {};
try {
  jest = process.env || {};
} catch (e) {
  jest = {};
}
const env = (v, domyslna) => (v == null || v === "" ? domyslna : v);

export const SUPABASE_URL = env(
  jest.REACT_APP_SUPABASE_URL,
  "https://gdzossvaauznqsrfqovw.supabase.co"
);
export const SUPABASE_KEY = env(
  jest.REACT_APP_SUPABASE_KEY,
  "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S"
);
export const GOOGLE_SCRIPT_URL = env(
  jest.REACT_APP_GOOGLE_SCRIPT_URL,
  "https://script.google.com/macros/s/AKfycbxGwCErowHgmyBwb5VBvdzIa7QRUCCXucYclLAJVS_2tYgIz88zrxUFs62oU9AIGAV5SA/exec"
);

// Nazwa sieci/klienta — pokazywana na ekranie logowania i w panelu. Jedyny
// widoczny gołym okiem sygnał, że wdrożenie jest podpięte pod właściwą bazę.
export const TENANT = env(jest.REACT_APP_TENANT, "Gastro Emka");

// Nazwa produktu. Osobna od TENANT: produkt nazywa się tak samo u wszystkich,
// klient jest u każdego inny. Zmienna zostaje mimo to — na wypadek wdrożenia
// pod cudzą marką.
export const PRODUKT = env(jest.REACT_APP_PRODUKT, "Shiftro");

export const isConfigured =
  SUPABASE_URL.includes("supabase.co") && SUPABASE_KEY.includes("sb_");

// Podbijana przy każdej zmianie widocznej dla użytkownika — historia w
// CHANGELOG.md. Wyświetlana na ekranie logowania (LoginScreen.tsx).
export const APP_VERSION = "0.34.0";
