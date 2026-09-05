// @ts-nocheck
// Grafik → widok miesiąca. Zawsze JEDEN lokal — nie ma wariantu "cała
// sieć", bo miesiąc drukuje się i wiesza w konkretnym lokalu.
//
// Świadoma asymetria względem widoku tygodnia: tutaj pokazujemy wyłącznie
// zmiany należące do tego lokalu. Osoba przypisana na stałe gdzie indziej
// pojawi się tu tylko tą jedną zmianą, którą wyjątkowo robi u nas — jej
// pozostałe zmiany nie są tu w ogóle widoczne (ustalenie właściciela,
// patrz docs/GRAFIK.md, Runda 4).
import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, CalendarRange } from "lucide-react";
import { btnPrimaryCls, btnSecondaryCls } from "./designTokens";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import { getMonthName } from "../../utils/format";
import {
  trimTime,
  shiftHours,
  checkDayCoverage,
  dowOf,
} from "../../utils/grafik";
import { fetchDailyForecast } from "../../utils/weather";

const DNI_NAGLOWEK = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"];

// "09:00" -> "9", "09:30" -> "9:30" — w kratce miesiąca liczy się każdy
// znak, a pełne godziny to zdecydowana większość zmian.
const hmShort = (t) => {
  const v = trimTime(t);
  if (!v) return "";
  const [h, m] = v.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
};

const monthDays = (monthPrefix) => {
  const [y, m] = monthPrefix.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= last; d++) {
    days.push(`${monthPrefix}-${String(d).padStart(2, "0")}`);
  }
  return days;
};

const shiftMonth = (monthPrefix, delta) => {
  const [y, m] = monthPrefix.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 7mm; }
  body * { visibility: hidden; }
  #grafik-print, #grafik-print * { visibility: visible; }
  #grafik-print {
    position: absolute; left: 0; top: 0; width: 100%;
    font-size: 7pt; line-height: 1.15;
  }
  #grafik-print .gp-cell { min-height: 0 !important; }
  #grafik-print .gp-day { font-size: 9pt; }
  #grafik-print .gp-entry { font-size: 6.5pt; }
  #grafik-print .gp-skrot { font-size: 6pt; padding: 0 2px; }
  .gp-noprint { display: none !important; }
}
`;

export default function GrafikMiesiac({
  lokal,
  miasto,
  activeStanowiska,
  planShifts,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  month,
  setMonth,
  onBackToWeek,
}) {
  const [forecast, setForecast] = useState({});

  useEffect(() => {
    let cancelled = false;
    setForecast({});
    if (!miasto) return;
    fetchDailyForecast(miasto)
      .then((data) => {
        if (!cancelled) setForecast(data || {});
      })
      .catch((err) => {
        console.error(`Brak prognozy pogody dla "${miasto}":`, err.message || err);
        if (!cancelled) setForecast({});
      });
    return () => {
      cancelled = true;
    };
  }, [miasto]);

  const dni = monthDays(month);
  const [rok, mies] = month.split("-").map(Number);

  const zmianyLokalu = (planShifts || []).filter(
    (s) => s.lokal === lokal && s.date.startsWith(month)
  );

  const statyDnia = {};
  dni.forEach((d) => {
    statyDnia[d] = checkDayCoverage(
      { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki, planShifts },
      lokal,
      d
    );
  });

  const sumaGodzin = zmianyLokalu.reduce((sum, s) => sum + shiftHours(s), 0);
  const ileOsob = new Set(zmianyLokalu.map((s) => s.user_id || s.user_name)).size;
  const dniBezObsady = dni.filter((d) => statyDnia[d].hasGap).length;
  const dniZNadmiarem = dni.filter((d) => statyDnia[d].hasNadmiar).length;

  // Siatka zaczyna się od poniedziałku — puste kratki przed 1. dniem
  // miesiąca, żeby kolumny odpowiadały dniom tygodnia.
  const pierwszy = dni[0];
  const przesuniecie = (dowOf(pierwszy) + 6) % 7;
  const kratki = [
    ...Array.from({ length: przesuniecie }, () => null),
    ...dni,
  ];
  while (kratki.length % 7 !== 0) kratki.push(null);
  const tygodnie = [];
  for (let i = 0; i < kratki.length; i += 7) tygodnie.push(kratki.slice(i, i + 7));

  const wpisyDnia = (dateStr) =>
    zmianyLokalu
      .filter((s) => s.date === dateStr)
      .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));

  const ostatniaZmiana = zmianyLokalu
    .map((s) => s.updated_at)
    .filter(Boolean)
    .sort()
    .slice(-1)[0];

  return (
    <div className="space-y-3">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center gap-2 gp-noprint">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className={btnSecondaryCls}>
          <ChevronLeft size={16} className="inline -mt-0.5" />{" "}
          {getMonthName(((mies - 2 + 12) % 12))}
        </button>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className={btnSecondaryCls}>
          {getMonthName(mies % 12)} <ChevronRight size={16} className="inline -mt-0.5" />
        </button>
        <button onClick={onBackToWeek} className={btnSecondaryCls}>
          <CalendarRange size={15} className="inline -mt-0.5 mr-1" /> Wróć do tygodnia
        </button>
        <button onClick={() => window.print()} className={`ml-auto ${btnPrimaryCls}`}>
          <Printer size={15} className="inline -mt-0.5 mr-1" /> Drukuj (A4 poziomo)
        </button>
      </div>

      <div
        id="grafik-print"
        className="bg-white rounded-xl border-[2px] border-[#171714] overflow-hidden"
      >
        <div className="px-4 py-3 border-b-[2px] border-[#171714] flex flex-wrap items-baseline gap-3">
          <h3 className="font-['Archivo'] font-extrabold text-[17px]">
            {getMonthName(mies - 1)} {rok} · {lokal}
          </h3>
          <span className="text-[13px] text-[#6E6E66]">
            {Math.round(sumaGodzin)} h zaplanowane · {ileOsob} osób
            {dniBezObsady > 0
              ? ` · ${dniBezObsady} ${dniBezObsady === 1 ? "dzień" : "dni"} bez pełnej obsady`
              : ""}
            {dniZNadmiarem > 0
              ? ` · ${dniZNadmiarem} ${dniZNadmiarem === 1 ? "dzień" : "dni"} z nadmiarem`
              : ""}
          </span>
        </div>

        <div className="grid grid-cols-7">
          {DNI_NAGLOWEK.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 bg-[#F1F1EE] border-b-[2px] border-[#171714] text-[11px] font-bold tracking-wider text-[#6E6E66]"
            >
              {d}
            </div>
          ))}
          {tygodnie.map((tydzien, wi) =>
            tydzien.map((d, di) => {
              if (!d) {
                return (
                  <div
                    key={`pusty-${wi}-${di}`}
                    className="bg-[#F1F1EE] border-r-[2px] border-b-[2px] border-[#E7E7E2] min-h-[104px]"
                  />
                );
              }
              const stat = statyDnia[d];
              const wpisy = wpisyDnia(d);
              const pogoda = forecast[d];
              return (
                <div
                  key={d}
                  className="gp-cell px-2 py-1.5 border-r-[2px] border-b-[2px] border-[#E7E7E2] min-h-[104px] align-top"
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span
                      className={`gp-day font-['Archivo'] font-extrabold text-[14px] ${
                        stat.hasGap
                          ? "text-[#DE3A22]"
                          : stat.hasNadmiar
                          ? "text-[#7A5B12]"
                          : "text-[#171714]"
                      }`}
                      title={[
                        ...stat.gaps.map(
                          (g) =>
                            `${g.stanowisko}: ${g.from}–${g.to}, brakuje ${g.missing}`
                        ),
                        ...stat.nadmiary.map(
                          (g) =>
                            `${g.stanowisko}: ${g.from}–${g.to}, ${g.nadmiar} os. ponad wymaganie`
                        ),
                      ].join("\n")}
                    >
                      {Number(d.slice(8))}
                    </span>
                    <span className="text-[10px] text-[#8F8E86]">
                      {pogoda && pogoda.temp != null ? `${Math.round(pogoda.temp)}°` : ""}
                    </span>
                  </div>
                  {wpisy.length > 0 && (
                    <div className="text-[10px] text-[#6E6E66] mb-0.5">
                      {stat.people} os. · {Math.round(stat.hours)} h
                    </div>
                  )}
                  <div className="space-y-[1px]">
                    {wpisy.map((s) => {
                      const style = stanowiskoBadgeStyle(activeStanowiska, lokal, s.stanowisko);
                      return (
                        <div
                          key={s.id}
                          className={`gp-entry flex items-center gap-1 text-[11px] leading-tight whitespace-nowrap overflow-hidden ${
                            s.__nieaktywny ? "line-through text-[#8A3A2B]" : ""
                          }`}
                          title={
                            s.__nieaktywny
                              ? "Konto pracownika wyłączone — ta zmiana nie jest obsadzona"
                              : ""
                          }
                        >
                          <span
                            className="gp-skrot px-1 rounded text-[9px] font-extrabold flex-shrink-0"
                            style={style || { backgroundColor: "#E7E7E2", color: "#171714" }}
                          >
                            {stanowiskoShort(activeStanowiska, lokal, s.stanowisko)}
                          </span>
                          <span className="tabular-nums flex-shrink-0">
                            {hmShort(s.start_time)}–{hmShort(s.end_time)}
                          </span>
                          <span className="truncate">{s.user_name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t-[2px] border-[#171714] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E6E66]">
          <span>
            Czerwony numer dnia — obsada poniżej wymagań dla tego lokalu.
            Skrót przy zmianie to stanowisko.
          </span>
          {ostatniaZmiana && (
            <span>
              Ostatnia zmiana:{" "}
              {new Date(ostatniaZmiana).toLocaleString("pl-PL", {
                day: "numeric",
                month: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      <p className="text-[12px] text-[#6E6E66] gp-noprint">
        Widok miesiąca dotyczy jednego lokalu. Osoba przypisana na stałe do innego
        lokalu pojawia się tu tylko tą zmianą, którą wyjątkowo robi w{" "}
        <strong>{lokal}</strong> — reszta jej grafiku należy do jej lokalu.
        Wpisywanie zmian odbywa się w widoku tygodnia.
      </p>
    </div>
  );
}
