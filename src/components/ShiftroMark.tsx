// @ts-nocheck
// Znak produktu Shiftro (wariant 1a "Zsuw"): trzy pasy zmiany, środkowy
// przesunięty w prawo. Kolory są te same, co w całej apce
// (employeeSessionShared.tsx): #171714 / #F1F1EE, akcent #DE3A22 — znak nie
// wnosi własnej palety.
//
// Inline SVG, a NIE <img src="/shiftro-mark.svg">, z jednego praktycznego
// powodu: harnessy (`harness-app.html` i reszta) ładują komponenty prosto w
// przeglądarce, bez serwera CRA, więc `%PUBLIC_URL%` i ścieżki z `public/`
// tam nie działają. Statyczny plik zostaje tylko dla favikony, którą i tak
// ładuje przeglądarka, a nie React.
//
// ⚠️ Znak jest ZAWSZE kwadratowy i bez zaokrągleń — reszta UI ma `rounded`,
// on nie. Nie rozciągaj go i nie zmieniaj proporcji pasów.
import React from "react";

const ShiftroMark = ({ size = 40, tone = "light", className = "" }) => {
  // tone="dark" = znak stoi na ciemnym tle (sidebar kierownika), więc kwadrat
  // jest jasny, a pasy ciemne. Akcent zostaje czerwony w obu wariantach.
  const tlo = tone === "dark" ? "#F1F1EE" : "#171714";
  const pas = tone === "dark" ? "#171714" : "#F1F1EE";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Shiftro"
    >
      <rect width="100" height="100" fill={tlo} />
      <rect x="18" y="26" width="52" height="15" fill={pas} />
      <rect x="30" y="47" width="52" height="15" fill="#DE3A22" />
      <rect x="18" y="68" width="30" height="15" fill={pas} />
    </svg>
  );
};

export default ShiftroMark;
