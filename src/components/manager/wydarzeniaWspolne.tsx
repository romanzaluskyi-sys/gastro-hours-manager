// @ts-nocheck
// Klocki Wydarzeń wspólne dla Grafiku, listy, Pulpitu i ekranów pracownika
// (makiety ScheduleEvents / ScheduleEventPanel / EmployeeScheduleEvent, 0.74.0).
// Kolory typów są z design systemu (bundle.css, `.ev-ic.*`) — nie wpisuj ich
// ponownie w komponentach.
import React from "react";
import { Presentation, Users, ClipboardList, ShieldCheck, MapPin, Star, Coins } from "lucide-react";
import { typWydarzenia, godzinyTekst, calyDzien, minutyWydarzenia, lokalTekst } from "../../utils/wydarzenia";
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

const KRESKOWANIE = "repeating-linear-gradient(135deg, rgba(28,27,25,.07) 0 5px, transparent 5px 10px)";
const godzinyKrotko = (min) => {
  const h = Math.round((min / 60) * 10) / 10;
  return `${String(h).replace(".", ",")} h`;
};

// Karta wydarzenia u pracownika (makieta EmployeeScheduleEvent*): czarny pasek
// z lewej, typ, tytuł, godziny, lokal, opis. Płatne — kreskowane, z plakietką
// „czas pracy”. W „Cały lokal” cudze wydarzenia są wyszarzone, a własne mają
// „dla Ciebie”.
export function KartaWydarzenia({ w, dlaCiebie = false, wyszarzone = false, wCzasieZmiany = false, oznaczDlaCiebie = false, onClick }) {
  const platne = w.platne && dlaCiebie;
  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl border-2 border-l-[6px] border-[#171714] bg-white px-3.5 py-3 ${wyszarzone ? "opacity-60" : ""} ${
        onClick ? "cursor-pointer" : ""
      }`}
      style={platne ? { background: `${KRESKOWANIE}, #fff`, borderStyle: "dashed", borderLeftStyle: "solid" } : undefined}
      data-karta-wydarzenia={w.id}
    >
      <div className="flex items-center gap-2 mb-1">
        <IkonaTypu typ={w.typ} size={24} />
        <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase text-[#6E6E66]">{typWydarzenia(w.typ).label}</span>
        {oznaczDlaCiebie && (
          <span className="ml-auto text-[11px] font-extrabold px-2 py-0.5 rounded bg-[#171714] text-white">dla Ciebie</span>
        )}
      </div>
      <b className="block font-['Archivo'] text-[17px] leading-6 text-[#171714]">{w.tytul}</b>
      <div className="flex flex-wrap items-center gap-2 mt-0.5">
        <b className="text-[16px] tabular-nums">{godzinyTekst(w)}</b>
        {platne && <TagWydarzenia ton="paid">czas pracy · {godzinyKrotko(minutyWydarzenia(w))}</TagWydarzenia>}
        {w.liczba_gosci ? <TagWydarzenia>{w.liczba_gosci} gości</TagWydarzenia> : null}
      </div>
      <span className="flex items-center gap-1 mt-1 text-[13px] text-[#6E6E66]">
        <MapPin size={13} /> {w.lokal ? lokalTekst(w) : "Wszystkie lokale"}
      </span>
      {w.opis && <p className="m-0 mt-1.5 text-[14px] text-[#3A3A35] leading-snug">{w.opis}</p>}
      {platne && (
        <p className="m-0 mt-1.5 text-[13px] font-bold text-[#1F7A4A]">
          {wCzasieZmiany ? "W czasie Twojej zmiany — liczy się raz, jako zmiana." : "Wpisane do Twojego grafiku — liczy się jak zmiana."}
        </p>
      )}
      {!dlaCiebie && !wyszarzone && (
        <p className="m-0 mt-1.5 text-[13px] text-[#6E6E66]">informacja · nie zmienia Twojej zmiany</p>
      )}
    </div>
  );
}
