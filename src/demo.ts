// @ts-nocheck
// Wersja demonstracyjna (demo.shiftro.pl, 0.72.0) — strona przeglądarki.
//
// Włącza ją `REACT_APP_DEMO=tak` (config.ts → DEMO), ustawiane wyłącznie przez
// `nowy-klient.py --demo`. Pełny opis: docs/DEMO.md.
//
// ⚠️ Adresy i PIN są KOPIĄ `api/_lib/demoKonta.js` (z api/ nie wolno importować
// z src/ i odwrotnie — to dwa różne buildy). `harness-demo.html` porównuje obie
// listy i wywraca się, gdy się rozjadą.
//
// PIN jest publiczny z założenia: stoi na ekranie logowania, żeby każdy mógł
// wejść. W bazie demo nie ma nic prawdziwego, a co noc wszystko wraca do stanu
// początkowego (api/cron/demo-reset.js).

export const DEMO_PIN = "482915";

export const KONTA_DEMO = [
  {
    klucz: "kierownik",
    email: "kierownik@demo.shiftro.pl",
    tytul: "Panel kierownika",
    kto: "Katarzyna Nowak · właścicielka sieci",
    opis: "Grafik, godziny, decyzje, zadania, raporty i koszty — na komputerze.",
  },
  {
    klucz: "tablet",
    email: "tablet@demo.shiftro.pl",
    tytul: "Tablet Służbowy",
    kto: "Wspólne urządzenie w Bistro Lipowa",
    opis: "Pracownik wybiera siebie z listy, odbija zmianę i odhacza zadania.",
  },
  {
    klucz: "telefon",
    email: "pracownik@demo.shiftro.pl",
    tytul: "Telefon pracownika",
    kto: "Marek Wiśniewski · kelner",
    opis: "Swój grafik, godziny, giełda zmian i wiadomości — na własnym telefonie.",
  },
];

export const kontoDemo = (klucz) => KONTA_DEMO.find((k) => k.klucz === klucz) || null;

// `?jako=tablet` — link „w nowej karcie” z ekranu logowania. Czytamy go PRZY
// ŁADOWANIU modułu (zanim App wznowi sesję) i od razu czyścimy z paska adresu,
// inaczej każde odświeżenie logowałoby od nowa. Ten sam wzorzec co utils/linki.ts.
let rolaZAdresu = null;
try {
  const p = new URLSearchParams(window.location.search);
  const jako = p.get("jako");
  if (jako) {
    rolaZAdresu = kontoDemo(jako) ? jako : null;
    p.delete("jako");
    const reszta = p.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (reszta ? `?${reszta}` : "") + window.location.hash
    );
  }
} catch (e) {
  /* środowisko bez window (harness arytmetyki) */
}

// Czy ta karta ma się zalogować jako konkretna rola (bez zużywania).
export const czekaRolaZAdresu = () => rolaZAdresu;

// Zwraca rolę z adresu RAZ.
export const zuzyjRoleZAdresu = () => {
  const r = rolaZAdresu;
  rolaZAdresu = null;
  return r;
};

// Podpowiedź w pasku DEMO, zależna od tego, kto jest zalogowany.
export const podpowiedzDlaRoli = (rola) => {
  if (rola === "kiosk") {
    return `Profil Marka Wiśniewskiego chroni PIN ${DEMO_PIN} — tak samo jak na prawdziwym tablecie. Pozostali wchodzą jednym dotknięciem.`;
  }
  if (rola === "open" || rola === "closed") {
    return "To widok z prywatnego telefonu pracownika. Zacznij zmianę, weź zmianę z giełdy albo wyślij wniosek o wolne — kierownik zobaczy to u siebie.";
  }
  return "Zacznij od „Do decyzji” — czekają tam korekty, wnioski i osoba na próbę. Wszystko, co tu zmienisz, zobaczysz na tablecie i na telefonie.";
};
