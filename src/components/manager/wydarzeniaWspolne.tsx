// @ts-nocheck
// Klocki Wydarzeń wspólne dla Grafiku, listy, Pulpitu i ekranów pracownika
// (makiety ScheduleEvents / ScheduleEventPanel / EmployeeScheduleEvent, 0.74.0).
// Kolory typów są z design systemu (bundle.css, `.ev-ic.*`) — nie wpisuj ich
// ponownie w komponentach.
import React from "react";
import { Presentation, Users, ClipboardList, ShieldCheck, MapPin, Star, Coins } from "lucide-react";
import { typWydarzenia, godzinyTekst, calyDzien } from "../../utils/wydarzenia";
import { trimTime } from "../../utils/grafik";

export const WYGLAD_TYPU = {
  zebranie: { Ikona: Presentation, tlo: "#E3EEFB", kolor: "#1D5FA8" },
  grupa: { Ikona: Users, tlo: "#F3E8DC", kolor: "#7A4F22" },
  inwentaryzacja: { Ikona: ClipboardList, tlo: "#ECEBF6", kolor: "#4A3F8A" },
  kontrola: { Ikona: ShieldCheck, tlo: "#FDF0D8", kolor: "#8A5300" },
  okolica: { Ikona: MapPin, tlo: "#E2F3E9", kolor: "#1F7A4A" },
  inne: { Ikona: Star, tlo: "#ECEBE6", kolor: "#171714" },
};
export const wygladTypu = (typ) => WYGLAD_TYPU[typ] || WYGLAD_TYPU.inne;

// Kwadracik z ikoną typu (28 px w liście i panelu).
export function IkonaTypu({ typ, size = 28 }) {
  const { Ikona, tlo, kolor } = wygladTypu(typ);
  return (
    <span
      className="inline-grid place-items-center rounded-md flex-none"
      style={{ width: size, height: size, background: tlo, color: kolor }}
      title={typWydarzenia(typ).label}
    >
      <Ikona size={Math.round(size * 0.6)} />
    </span>
  );
}

// Ciemny chip w nagłówku dnia: ikona · godzina · tytuł (makieta: `.ev-chip`).
export function ChipWydarzenia({ w, onClick }) {
  const { Ikona } = wygladTypu(w.typ);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[5px] h-[26px] px-[7px] rounded-md bg-[#171714] hover:bg-[#3A3935] text-white text-[12px] text-left w-full min-w-0"
      title={`${w.tytul} · ${godzinyTekst(w)}${w.platne ? " · płatne" : ""}`}
      data-chip-wydarzenia={w.id}
    >
      <Ikona size={14} className="flex-none" />
      {!calyDzien(w) && <b className="font-extrabold tabular-nums flex-none">{trimTime(w.godz_od)}</b>}
      <span className="truncate font-semibold opacity-90">{w.tytul}</span>
    </button>
  );
}

// Plakietki z makiety (`.ev-tag`): płatne / odwołane / do rozliczenia / goście.
export function TagWydarzenia({ ton = "neutral", children }) {
  const kolory = {
    neutral: "bg-[#ECEBE6] text-[#171714]",
    paid: "bg-[#E2F3E9] text-[#1F7A4A]",
    warn: "bg-[#FDF0D8] text-[#8A5300]",
    no: "bg-[#FBEAE6] text-[#B3321C]",
  };
  return (
    <span className={`inline-flex items-center gap-1 h-[22px] px-[7px] rounded-md text-[12px] font-extrabold whitespace-nowrap tabular-nums ${kolory[ton]}`}>
      {ton === "paid" && <Coins size={13} />}
      {children}
    </span>
  );
}
