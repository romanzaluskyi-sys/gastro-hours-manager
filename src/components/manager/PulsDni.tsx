// @ts-nocheck
// Lista dni — po jednej karcie na dzień, z liczbami, po których widać dzień
// bez wchodzenia w szczegóły.
//
// Układ każdej karty jest ten sam i celowo krótki: cztery pola, w każdym
// FAKT dużą czcionką, a odniesienie (prognoza, plan, „7 dni wcześniej”) małą
// pod spodem. Kierownik przegląda tydzień wzrokiem po jednej kolumnie, nie
// czytając kart po kolei.
import React, { useMemo, useState } from "react";
import { BarChart3, Users, ClipboardCheck, Cloud, Lock, ChevronRight } from "lucide-react";
import { COLORS, sectionCardCls, sectionHeaderCls, btnSecondaryCls } from "./designTokens";
import { describeWeatherCode } from "../../utils/weather";
import { getDayOfWeek } from "../../utils/format";
import { wierszDnia, przesun } from "../../utils/dziennik";

const KROK_DNI = 14;

const zl = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("pl-PL")} zł`);
const znak = (n, jednostka = "") =>
  n == null ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}${jednostka}`;

// Różnica jest informacją, nie oceną: wyższy utarg od zwykłego to dobrze,
// wyższy koszt pracy od planu to zwykle nie. Kolor niesie ten sens, dlatego
// kierunek podajemy jawnie zamiast zakładać, że plus zawsze znaczy dobrze.
const kolorRoznicy = (n, dobrzeGdyDodatnia) => {
  if (n == null || Math.abs(n) < 1) return COLORS.muted;
  return n > 0 === dobrzeGdyDodatnia ? "#2C6A4F" : COLORS.accent;
};

const Pole = ({ Icon, etykieta, wartosc, pod, kolorPod }) => (
  <div className="flex-1 min-w-[140px] flex gap-2.5">
    <Icon size={17} className="mt-1 flex-shrink-0" color={COLORS.mutedLight} />
    <div className="min-w-0">
      <div className="text-[10px] font-bold tracking-wider uppercase text-[#8F8E86]">
        {etykieta}
      </div>
      <div className="font-['Archivo'] font-extrabold text-[21px] leading-tight text-[#171714]">
        {wartosc}
      </div>
      <div className="text-[12px] leading-snug" style={{ color: kolorPod || COLORS.muted }}>
        {pod}
      </div>
    </div>
  </div>
);

export default function PulsDni({
  lokal, miasto, dzis,
  shifts, planShifts, users, tasks, taskCompletions,
  karty, wpisy, szablony, weatherForecasts,
  onOtworzDzien,
}) {
  const [ile, setIle] = useState(KROK_DNI);

  const wiersze = useMemo(() => {
    // Od wczoraj wstecz — dzisiejszy dzień jeszcze trwa, więc jego liczby
    // wprowadzałyby w błąd na liście podsumowań.
    const dni = [];
    for (let i = 1; i <= ile; i += 1) dni.push(przesun(dzis, -i));
    return dni.map((dateStr) =>
      wierszDnia({
        shifts, planShifts, users, tasks, taskCompletions,
        dayLogs: karty, dayLogEntries: wpisy, dayLogTemplates: szablony,
        weatherForecasts, lokal, miasto, dateStr,
      })
    );
  }, [ile, dzis, shifts, planShifts, users, tasks, taskCompletions, karty, wpisy, szablony, weatherForecasts, lokal, miasto]);

  return (
    <div className={sectionCardCls}>
      <div className={sectionHeaderCls}>
        <span>Ostatnie dni — {lokal}</span>
        <span className="text-[12px] font-normal text-[#6E6E66]">
          {wiersze.filter((w) => w.zamkniety).length} z {wiersze.length} zamkniętych
        </span>
      </div>

      {wiersze.map((w) => {
        const pogoda = w.pogodaFakt ? describeWeatherCode(w.pogodaFakt.kod) : null;
        const roznicaPogody =
          w.pogodaFakt && w.pogodaZTygodnia && w.pogodaFakt.temp_max != null
            ? Number(w.pogodaZTygodnia.temp_max) - Number(w.pogodaFakt.temp_max)
            : null;
        return (
          <button
            key={w.date}
            onClick={() => onOtworzDzien(w.date)}
            className="w-full text-left px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0 hover:bg-[#F1F1EE] flex flex-wrap items-start gap-4"
          >
            <div className="w-[120px] flex-shrink-0">
              <div className="font-['Archivo'] font-extrabold text-[16px]">
                {w.date.split("-").reverse().slice(0, 2).join(".")}
              </div>
              <div className="text-[12px] text-[#6E6E66]">
                {getDayOfWeek(new Date(w.date + "T00:00:00"))}
              </div>
              {w.zamkniety ? (
                <div className="text-[11px] text-[#2C6A4F] mt-1 flex items-center gap-1">
                  <Lock size={11} /> zamknięty
                </div>
              ) : (
                <div className="text-[11px] mt-1" style={{ color: COLORS.accent }}>
                  do zamknięcia
                </div>
              )}
            </div>

            <Pole
              Icon={BarChart3}
              etykieta="Utarg"
              wartosc={zl(w.obrot)}
              pod={
                w.prognozaUtargu
                  ? w.obrot != null
                    ? `zwykle ${zl(w.prognozaUtargu.kwota)} · ${znak(w.roznicaUtargu, " zł")}`
                    : `zwykle ${zl(w.prognozaUtargu.kwota)}`
                  : "brak porównania"
              }
              kolorPod={kolorRoznicy(w.roznicaUtargu, true)}
            />

            <Pole
              Icon={Users}
              etykieta="Koszt pracy"
              wartosc={zl(w.koszt)}
              pod={
                w.kosztPlan
                  ? `plan ${zl(w.kosztPlan)} · ${znak(w.roznicaKosztu, " zł")}`
                  : "brak grafiku"
              }
              kolorPod={kolorRoznicy(w.roznicaKosztu, false)}
            />

            <Pole
              Icon={ClipboardCheck}
              etykieta="Wykonanie"
              wartosc={`${w.zadaniaZrobione}/${w.zadaniaRazem}`}
              pod={
                w.wpisyRazem
                  ? `wpisy ${w.wpisyZrobione}/${w.wpisyRazem}`
                  : "brak wpisów w konfiguracji"
              }
            />

            <Pole
              Icon={Cloud}
              etykieta="Pogoda"
              wartosc={
                w.pogodaFakt && w.pogodaFakt.temp_max != null
                  ? `${Math.round(w.pogodaFakt.temp_max)}°`
                  : "—"
              }
              pod={
                w.pogodaZTygodnia
                  ? `7 dni wcześniej ${Math.round(w.pogodaZTygodnia.temp_max)}° · ${znak(roznicaPogody, "°")}`
                  : pogoda
                  ? pogoda.label
                  : "brak danych"
              }
            />

            <div className="flex items-center self-center">
              {w.lcPct != null && (
                <span className="font-['Archivo'] font-extrabold text-[17px] mr-3">
                  {w.lcPct}%
                </span>
              )}
              <ChevronRight size={18} color={COLORS.mutedLight} />
            </div>
          </button>
        );
      })}

      <div className="p-4">
        <button className={btnSecondaryCls} onClick={() => setIle(ile + KROK_DNI)}>
          Pokaż wcześniejsze
        </button>
      </div>
    </div>
  );
}
