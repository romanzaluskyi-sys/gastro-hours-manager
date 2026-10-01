// @ts-nocheck
// Linki z e-maili (0.70.0): `?otworz=grafik` otwiera aplikację od razu we
// właściwym miejscu ("Przycisk otworzy Shiftro od razu we właściwym miejscu").
//
// Cel zapamiętujemy PRZY ŁADOWANIU modułu, zanim ktokolwiek się zaloguje: link
// z maila zwykle trafia na ekran logowania, a po zalogowaniu adresu już nikt
// nie czyta. Trzymamy go w sessionStorage (ta karta, do zamknięcia) i od razu
// czyścimy z paska adresu — inaczej odświeżenie strony za godzinę znowu
// przeskoczyłoby do "Zatwierdzania".
//
// ⚠️ Słownik celów musi się zgadzać z serwerem: api/_lib/wiadomosci.js (CTA) i
// api/_lib/raportMail.js. Nieznany cel jest po prostu ignorowany.

const KLUCZ = "shiftro_otworz";

try {
  const p = new URLSearchParams(window.location.search);
  const cel = p.get("otworz");
  if (cel) {
    window.sessionStorage.setItem(KLUCZ, cel);
    p.delete("otworz");
    const reszta = p.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (reszta ? `?${reszta}` : "") + window.location.hash
    );
  }
} catch (e) {
  // Prywatne okno bez sessionStorage — link otworzy po prostu Pulpit.
}

// Panel kierownika: cel → klucz zakładki.
export const CELE_KIEROWNIKA = {
  pulpit: "pulpit",
  zatwierdzanie: "zatwierdzanie",
  raporty: "raporty",
  puls: "puls",
  skrzynka: "skrzynka",
  grafik: "grafik",
};

// Ekrany pracownika: cel → ekran i (dla Zgłoś) typ formularza.
export const CELE_PRACOWNIKA = {
  grafik: { screen: "GRAFIK", blok: "GRAFIK" },
  raport: { screen: "RAPORT", blok: "RAPORT" },
  wiadomosci: { screen: "WIADOMOSCI" },
  korekta: { screen: "ZGLOS", zgTyp: "correction", blok: "RAPORT" },
  wolne: { screen: "ZGLOS", zgTyp: "absence" },
};

// Zwraca cel z podanego słownika i usuwa go — link działa RAZ. Cel spoza
// słownika zostaje (np. link kierownika otwarty na tablecie nie znika, zanim
// zaloguje się właściwa osoba).
//
// ⚠️ React.StrictMode (index.tsx) w trybie deweloperskim woła inicjalizator
// useState DWA razy i bierze jeden z wyników — stąd krótka pamięć ostatniego
// celu, żeby drugie wywołanie nie oddało pustki.
let ostatni = null;
export const zuzyjCel = (slownik) => {
  if (ostatni && Date.now() - ostatni.kiedy < 2000 && slownik[ostatni.cel]) {
    return slownik[ostatni.cel];
  }
  try {
    const cel = window.sessionStorage.getItem(KLUCZ);
    if (!cel || !slownik[cel]) return null;
    window.sessionStorage.removeItem(KLUCZ);
    ostatni = { cel, kiedy: Date.now() };
    return slownik[cel];
  } catch (e) {
    return null;
  }
};
