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
  isSameUser,
  absenceOn,
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

// ⚠️ Zawsze 31 kolumn, niezależnie od długości miesiąca (ustalenie
// właściciela). Luty i tak dostanie 31 kolumn, trzy ostatnie puste — dzięki
// temu każda kartka ma identyczną szerokość kolumn i wydruk z lutego da się
// położyć obok wydruku z marca bez przeliczania, gdzie co stoi.
const DNI_W_SIATCE = 31;

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

  /* Układ "osoby × dni". 297 mm minus 2×7 mm marginesu to 283 mm; nazwisko
     bierze 9%, więc na 31 dni zostaje po ~8,3 mm (≈31 px) na kolumnę.
     Najszerszy napis w kratce to "08:30" — przy 6,2 pt zajmuje ~25 px, czyli
     mieści się z zapasem na obramowania. Zmierzone, nie wyczute: to jest
     powód, dla którego liczba kolumn NIE może urosnąć powyżej 31. */
  #grafik-osoby { font-size: 6.2pt; line-height: 1.1; }
  #grafik-osoby td, #grafik-osoby th { padding: 0 !important; }
  #grafik-osoby .go-nazwisko { font-size: 7pt; padding: 0 1mm !important; }
  #grafik-osoby .go-dow { font-size: 5.5pt; }
  #grafik-osoby .go-num { font-size: 7.5pt; }
  #grafik-osoby .go-znacznik { font-size: 7pt; }
  /* Trzy linijki czasu przy 6,2 pt i interlinii 1,1 to ~3,3 em; z zapasem na
     obramowania wychodzi 3,6 em. */
  #grafik-osoby .go-min { min-height: 3.6em !important; }
  /* Wiersz osoby nie może się rozpaść na dwie strony w połowie. */
  #grafik-osoby tr { break-inside: avoid; page-break-inside: avoid; }
  #grafik-osoby thead { display: table-header-group; }
  /* Ekranowy overflow-x-auto obcina tabelę przy drukowaniu — kolumny od 20.
     wzwyż po prostu nie wychodziły na papier. */
  #grafik-print .go-scroll { overflow: visible !important; }
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
  users,
  absences,
  month,
  setMonth,
  onBackToWeek,
}) {
  const [forecast, setForecast] = useState({});
  // "kalendarz" — siedem kolumn, jak kartka na ścianę przy grafiku.
  // "osoby"     — jeden wiersz na osobę, 31 kolumn dni; ten układ czyta się
  //               po ludziach ("kiedy pracuję?"), a tamten po dniach
  //               ("kto jest w sobotę?"). To dwa różne pytania i dlatego dwa
  //               układy, a nie jeden kompromis.
  const [uklad, setUklad] = useState("kalendarz");

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

  // Wiersze układu "osoby": przypisani do lokalu plus każdy, kto ma tu w tym
  // miesiącu zmianę. Ta sama zasada co w siatce tygodnia — bez niej osoba
  // wypożyczona zniknęłaby z wydruku, mimo że w nim pracuje.
  const osobyMiesiaca = (users || [])
    .filter((u) => {
      if (u.role === "kiosk") return false;
      const maTuZmiany = zmianyLokalu.some((s) => isSameUser(s, u));
      if (u.archived || u.active === false) return maTuZmiany;
      return u.default_lokal === lokal || maTuZmiany;
    })
    .sort((a, b) => {
      const sa = a.default_stanowisko || "";
      const sb = b.default_stanowisko || "";
      if (sa !== sb) return sa.localeCompare(sb, "pl");
      return a.name.localeCompare(b.name, "pl");
    });

  // Zawsze 31 kratek. Dni, których w miesiącu nie ma, zostają puste i BEZ
  // etykiety — dorobiony "31 lutego" wyglądałby jak dzień, w którym nikt nie
  // pracuje, zamiast jak dzień, którego nie ma.
  const kolumnyDni = Array.from({ length: DNI_W_SIATCE }, (_, i) => dni[i] || null);

  const zmianyOsobyDnia = (user, dateStr) =>
    zmianyLokalu
      .filter((s) => s.date === dateStr && isSameUser(s, user))
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
        <div className="flex gap-2 ml-2">
          <button
            onClick={() => setUklad("kalendarz")}
            className={uklad === "kalendarz" ? btnPrimaryCls : btnSecondaryCls}
          >
            Kalendarz
          </button>
          <button
            onClick={() => setUklad("osoby")}
            className={uklad === "osoby" ? btnPrimaryCls : btnSecondaryCls}
          >
            Osoby × dni
          </button>
        </div>
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

        {uklad === "kalendarz" && (
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
        )}

        {uklad === "osoby" && (
          <div className="overflow-x-auto go-scroll">
            <table
              id="grafik-osoby"
              className="w-full border-collapse table-fixed text-[10px]"
            >
              {/* Nazwisko dostaje stały procent, a 31 dni dzieli resztę po
                  równo — inaczej kolumna z dłuższym imieniem zjadłaby dni i
                  wydruk przestałby się mieścić na szerokość A4. */}
              <colgroup>
                <col style={{ width: "9%" }} />
                {kolumnyDni.map((_, i) => (
                  <col key={i} style={{ width: `${91 / DNI_W_SIATCE}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="border-[1px] border-[#171714] px-2 py-1 text-center go-nazwisko font-['Archivo'] font-extrabold uppercase tracking-wide">
                    {getMonthName(mies - 1)}
                  </th>
                  {kolumnyDni.map((d, i) => {
                    const weekend = d && (dowOf(d) === 0 || dowOf(d) === 6);
                    return (
                      <th
                        key={i}
                        className={`border-[1px] border-[#171714] px-0 py-0.5 text-center ${
                          weekend ? "bg-[#EDEDE8]" : "bg-white"
                        }`}
                      >
                        <div className="go-dow text-[8px] font-bold text-[#6E6E66] leading-none">
                          {d ? DNI_NAGLOWEK[(dowOf(d) + 6) % 7] : ""}
                        </div>
                        <div className="go-num font-['Archivo'] font-extrabold text-[11px] leading-tight">
                          {d ? Number(d.slice(8)) : ""}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {osobyMiesiaca.length === 0 && (
                  <tr>
                    <td
                      colSpan={DNI_W_SIATCE + 1}
                      className="border-[1px] border-[#171714] px-4 py-6 text-center text-[#6E6E66] text-[13px]"
                    >
                      Nikt nie jest przypisany do tego lokalu i nikt nie ma tu zmian w
                      tym miesiącu.
                    </td>
                  </tr>
                )}
                {osobyMiesiaca.map((u) => (
                  <tr key={u.id}>
                    {/* Minimalna wysokość trzymana na komórce z nazwiskiem:
                        wiersz rośnie do najwyższej komórki, więc osoba bez ani
                        jednej zmiany dostaje taki sam pasek co reszta. Bez tego
                        wydruk miał raz linijkę, raz trzy, i przestawał wyglądać
                        jak formularz. */}
                    <td className="border-[1px] border-[#171714] px-2 py-1 go-nazwisko font-['Archivo'] font-bold text-[12px] text-center">
                      <div className="go-min min-h-[40px] flex items-center justify-center">
                        {u.name}
                      </div>
                    </td>
                    {kolumnyDni.map((d, i) => {
                      if (!d) {
                        return (
                          <td
                            key={i}
                            className="border-[1px] border-[#E7E7E2] bg-[#F6F6F3]"
                          />
                        );
                      }
                      const weekend = dowOf(d) === 0 || dowOf(d) === 6;
                      const zm = zmianyOsobyDnia(u, d);
                      const abs = zm.length === 0 ? absenceOn(absences, u, d) : null;
                      return (
                        <td
                          key={i}
                          className={`border-[1px] border-[#171714] px-0 py-0 text-center align-middle ${
                            weekend ? "bg-[#F6F6F3]" : ""
                          }`}
                        >
                          {/* Trzy linijki w pionie: początek, koniec,
                              stanowisko — tak samo jak w arkuszu, z którego
                              ten układ pochodzi. Druga zmiana tego samego dnia
                              dokłada kolejną trójkę pod spodem, zamiast
                              chować się za "…". */}
                          {zm.map((sh) => (
                            <div
                              key={sh.id}
                              className={`leading-tight tabular-nums ${
                                sh.__nieaktywny ? "line-through text-[#8A3A2B]" : ""
                              }`}
                            >
                              <div>{trimTime(sh.start_time)}</div>
                              <div>{trimTime(sh.end_time)}</div>
                              <div className="font-bold">
                                {stanowiskoShort(activeStanowiska, lokal, sh.stanowisko)}
                              </div>
                            </div>
                          ))}
                          {abs && (
                            <div className="go-znacznik font-extrabold text-[10px] text-[#6E6E66]">
                              {abs.type === "urlop" ? "URP" : "NIE"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 border-t-[2px] border-[#171714] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E6E66]">
          <span>
            {uklad === "osoby"
              ? "W kratce: początek, koniec, skrót stanowiska. URP — zatwierdzony urlop, NIE — zgłoszony brak dostępności. Siatka ma zawsze 31 kolumn, żeby każdy miesiąc drukował się tak samo."
              : "Czerwony numer dnia — obsada poniżej wymagań dla tego lokalu. Skrót przy zmianie to stanowisko."}
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
