// @ts-nocheck
// Automatyczne wylogowanie po 60 minutach bez aktywności (Roadmap p.6, 0.71.0).
//
// ⚠️ Tablet Służbowy (rola `kiosk`) jest WYŁĄCZONY świadomie: to wspólne
// urządzenie, które ma stać zalogowane tygodniami — jego zabezpieczeniem jest
// fizyczna kontrola w lokalu, nie sesja. Wylogowany tablet gaśnie dla całego
// lokalu do czasu, aż kierownik wpisze dane kiosku.
//
// ⚠️ Znacznik ostatniej aktywności leży w localStorage, a nie w pamięci
// komponentu, z dwóch powodów:
//   1. telefon usypia kartę i timery stoją — po powrocie liczy się czas
//      ZEGARA, nie to, ile razy odpalił interwał;
//   2. dwie karty tej samej aplikacji dzielą sesję, więc praca w jednej ma
//      trzymać przy życiu obie (inaczej druga wylogowałaby pierwszą).
// Gdy localStorage nie działa (tryb prywatny), App trzyma znacznik w refie —
// wtedy działa w obrębie karty, co i tak jest lepsze niż nic.
//
// ⚠️ Liczy się TYLKO to, co zrobił człowiek (dotyk, klawisz, kółko). Poll
// danych co 45 s to nie aktywność — inaczej nikt nigdy by się nie wylogował.

export const LIMIT_BEZCZYNNOSCI_MS = 60 * 60 * 1000;
export const KLUCZ_AKTYWNOSCI = "shiftro_ostatnia_aktywnosc";
// Zapis do localStorage najwyżej co tyle — przewijanie listy daje dziesiątki
// zdarzeń na sekundę, a minuta dokładności nie ma tu znaczenia.
export const CO_ILE_ZAPIS_MS = 15 * 1000;

export const KOMUNIKAT_WYLOGOWANIA =
  "Wylogowano po 60 minutach bez aktywności. Zaloguj się ponownie.";

export const podlegaWylogowaniu = (user) => !!user && user.role !== "kiosk";

// `null` (nic nie zapisano — np. pierwsze uruchomienie po aktualizacji) to
// NIE jest „dawno temu”: nie wylogowujemy kogoś tylko dlatego, że funkcja
// właśnie weszła.
export const czyMinal = (ostatnia, teraz, limit = LIMIT_BEZCZYNNOSCI_MS) =>
  typeof ostatnia === "number" && Number.isFinite(ostatnia) && teraz - ostatnia >= limit;

export const wczytajAktywnosc = () => {
  try {
    const v = Number(localStorage.getItem(KLUCZ_AKTYWNOSCI));
    return v > 0 ? v : null;
  } catch (e) {
    return null;
  }
};

export const zapiszAktywnosc = (teraz = Date.now()) => {
  try {
    localStorage.setItem(KLUCZ_AKTYWNOSCI, String(teraz));
  } catch (e) {
    /* tryb prywatny — App zostaje przy znaczniku w pamięci */
  }
};

// Najnowszy z dwóch znaczników: z localStorage (wspólny dla kart) i z pamięci
// tej karty. Bierzemy późniejszy, bo każdy z nich znaczy „ktoś tu był”.
export const ostatniaAktywnosc = (wPamieci) => {
  const zapisana = wczytajAktywnosc();
  if (zapisana === null) return wPamieci ?? null;
  if (wPamieci == null) return zapisana;
  return Math.max(zapisana, wPamieci);
};
