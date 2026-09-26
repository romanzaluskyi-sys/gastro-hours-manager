// @ts-nocheck
// Pole godziny z makiety "Shiftro" (TimeField): wpisz "18:30" z klawiatury
// albo przesuń o ±15 min. Zmienione względem punktu odniesienia (zapisu,
// grafiku) robi się bursztynowe — widać, który koniec zmiany ruszono.
// Wspólne dla "Do decyzji" (panel "Popraw") i okna wpisu w Rejestrze godzin.
//
// ⚠️ Wartość zatwierdza się przy wyjściu z pola (blur), nie przy każdym
// znaku: "1" w trakcie pisania "18:30" nie może stać się godziną 01:00.
import React, { useEffect, useState } from "react";
import { naMin, zMin } from "../../utils/czas";

export default function PoleCzasu({
  value,
  onChange,
  zmienione = false,
  bazowa = "",
  aria,
  szerokie = false,
  // Puste pole znaczy tu coś (np. "zmiana jeszcze trwa") — wyczyszczenie ma
  // zapisać pustą wartość zamiast wrócić do poprzedniej.
  mozePuste = false,
}) {
  const [tekst, setTekst] = useState(value || "");
  useEffect(() => setTekst(value || ""), [value]);
  const zatwierdz = () => {
    if (mozePuste && !String(tekst).trim()) {
      if (value) onChange("");
      return;
    }
    const m = naMin(tekst);
    if (m != null) onChange(zMin(m));
    else setTekst(value || "");
  };
  const krok = (d) => {
    const m = naMin(value) ?? naMin(bazowa) ?? 0;
    onChange(zMin(m + d));
  };
  const przyciskCls = `${
    szerokie ? "w-11" : "w-[34px]"
  } flex-shrink-0 text-[#6E6E66] text-lg font-bold hover:bg-[#F6F5F1] hover:text-[#171714]`;
  return (
    <span
      className={`${
        szerokie ? "flex w-full h-12 md:h-11" : "inline-flex h-11"
      } items-stretch border-[2px] rounded-md overflow-hidden focus-within:ring-[3px] focus-within:ring-[#DE3A22] focus-within:ring-offset-2 ${
        zmienione ? "border-[#8A5300] bg-[#FDF0D8]" : "border-[#171714] bg-white"
      }`}
    >
      <button type="button" onClick={() => krok(-15)} aria-label="−15 min" className={przyciskCls}>
        −
      </button>
      <input
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        onBlur={zatwierdz}
        onKeyDown={(e) => {
          // Enter w formularzu wysłałby go z godziną sprzed zatwierdzenia.
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        inputMode="numeric"
        placeholder="--:--"
        aria-label={aria}
        className={`${
          szerokie ? "flex-1" : "w-16"
        } min-w-0 bg-transparent text-center text-[17px] font-bold tabular-nums outline-none text-[#171714]`}
      />
      <button type="button" onClick={() => krok(15)} aria-label="+15 min" className={przyciskCls}>
        +
      </button>
    </span>
  );
}
