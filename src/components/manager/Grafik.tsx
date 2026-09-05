// @ts-nocheck
// Grafik — host zakładki: trzyma wybór podwidoku, tydzień i sortowanie,
// resztę oddaje w dół. Widok miesiąca, tryb Edycja i giełda zmian dochodzą
// w kolejnych etapach (patrz "Plan wdrożenia" w docs/GRAFIK.md).
//
// Zakres lokali bierzemy z górnego paska ManagerShell (selectedLokal) —
// nie powtarzamy wyboru lokalu wewnątrz zakładki.
import React, { useState } from "react";
import {
  CalendarRange,
  CalendarDays,
  CalendarCheck,
  SlidersHorizontal,
  Eye,
  Pencil,
  Send,
} from "lucide-react";
import GrafikWymagania from "./GrafikWymagania";
import GrafikTydzien from "./GrafikTydzien";
import GrafikMiesiac from "./GrafikMiesiac";
import { pageTitleCls, cardCls, btnPrimaryCls, btnSecondaryCls } from "./designTokens";
import {
  toLocalYMD,
  mondayOf,
  addDaysYMD,
  isUnpublished,
  publishGrafik,
} from "../../utils/grafik";

export default function Grafik({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  lokale,
  users,
  setUsers,
  activeStanowiska,
  planShifts,
  setPlanShifts,
  shiftSwaps,
  onResolveSwap,
  absences,
  setAbsences,
  setShifts,
  staffingRules,
  setStaffingRules,
  staffingRuleSets,
  setStaffingRuleSets,
  lokaleGodziny,
  setLokaleGodziny,
  grafikWyjatki,
  setGrafikWyjatki,
  showMsg,
}) {
  const [view, setView] = useState("tydzien");
  const [weekStart, setWeekStart] = useState(() => mondayOf(toLocalYMD(new Date())));
  // Widok dnia ma własną kotwicę: przeskakiwanie tydzień <-> dzień nie może
  // gubić daty, na którą kierownik właśnie patrzy.
  const [dayStart, setDayStart] = useState(() => toLocalYMD(new Date()));
  const [sortBy, setSortBy] = useState("stanowisko");
  const [lokalOverride, setLokalOverride] = useState(null);
  const [mode, setMode] = useState("podglad");
  // Miesiąc otwieramy na miesiącu czwartku bieżącego tygodnia — tą samą
  // zasadą, którą liczy sumy miesięczne widok tygodnia.
  const [month, setMonth] = useState(() => addDaysYMD(mondayOf(toLocalYMD(new Date())), 3).slice(0, 7));
  const [publishing, setPublishing] = useState(false);

  // Lokale WYŚWIETLANE w siatce (zależne od górnego paska)...
  const lokaleNames =
    selectedLokal !== "ALL"
      ? [selectedLokal]
      : (availableLokaleForManager || []).map((l) => l.name);
  // ...i wszystkie, do których kierownik ma dostęp. To drugie zasila wybór
  // "stanowisko + lokal" w modalu: oddanie człowieka do innego lokalu musi
  // działać także wtedy, gdy w pasku wybrano pojedynczy lokal.
  const wszystkieLokaleNames = (availableLokaleForManager || []).map((l) => l.name);

  // Konfiguracja i widok miesiąca dotyczą zawsze JEDNEGO lokalu — przy
  // "Cała sieć" trzeba go wskazać osobno.
  const lokalKonfiguracji =
    (lokaleNames.includes(lokalOverride) && lokalOverride) || lokaleNames[0] || null;

  const weekEnd = addDaysYMD(weekStart, 6);
  // Liczymy i wysyłamy po WSZYSTKICH lokalach kierownika, nie tylko po
  // widocznych. Zmianę można wpisać do innego lokalu z siatki tego, który
  // się ogląda (kafelek "stanowisko · lokal"), więc przy zawężeniu do
  // widocznych taka zmiana nigdy nie dałaby się wysłać i po cichu zostawała
  // wersją roboczą — pracownik jej nie widział, a kierownik nie miał jak się
  // o tym dowiedzieć.
  // Jedno kliknięcie wysyła WSZYSTKO od dziś w przód, ze wszystkich lokali
  // kierownika. Wysyłka per oglądany tydzień była zbyt łatwa do zgubienia:
  // przy planowaniu na dwa-trzy tygodnie naprzód część zmian zostawała
  // wersją roboczą i pracownik ich po prostu nie widział.
  const dzisYMD = toLocalYMD(new Date());
  // Wiersze oznaczone do usunięcia znikają z widoków od razu; publikacja
  // dostaje surową listę, bo to ona je kasuje i informuje pracownika.
  // Zmiany osób z wyłączonym kontem oznaczamy tu raz, a niżej wszystko już
  // wie, że nie należy ich liczyć jako obsady (utils/grafik.ts) i że trzeba
  // je pokazać z ostrzeżeniem (GrafikTydzien/GrafikMiesiac).
  const nieaktywniIds = new Set(
    (users || [])
      .filter((u) => u.archived || u.active === false)
      .map((u) => String(u.id))
  );
  const zywePlanShifts = (planShifts || [])
    .filter((s) => !s.deleted_at)
    .map((s) =>
      nieaktywniIds.has(String(s.user_id)) ? { ...s, __nieaktywny: true } : s
    );
  const niewyslaneWiersze = (planShifts || []).filter(
    (s) =>
      wszystkieLokaleNames.includes(s.lokal) &&
      s.date >= dzisYMD &&
      isUnpublished(s)
  );
  const niewyslane = niewyslaneWiersze.length;
  const niewyslanePozaTygodniem = niewyslaneWiersze.filter(
    (s) => s.date < weekStart || s.date > weekEnd
  ).length;

  const handlePublish = async () => {
    if (
      !window.confirm(
        `Wysłać grafik pracownikom? Zmian do wysłania: ${niewyslane}` +
          (niewyslanePozaTygodniem > 0
            ? ` (w tym ${niewyslanePozaTygodniem} poza oglądanym tygodniem)`
            : "") +
          ". Wysyłamy wszystko od dziś w przód, ze wszystkich Twoich lokali." +
          " Każda osoba dostanie jedno powiadomienie."
      )
    )
      return;
    setPublishing(true);
    try {
      const { updated, powiadomieni } = await publishGrafik({
        planShifts,
        lokaleNames: wszystkieLokaleNames,
        from: dzisYMD,
        actorName: currentUser?.name,
      });
      const mapa = new Map(updated.map((s) => [s.id, s]));
      setPlanShifts((planShifts || []).map((s) => mapa.get(s.id) || s));
      showMsg(`Grafik wysłany. Powiadomionych osób: ${powiadomieni}.`);
    } catch (err) {
      showMsg(`Błąd wysyłki grafiku: ${err.message || "nieznany błąd"}`, "error");
    }
    setPublishing(false);
  };

  if (!lokalKonfiguracji) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className={cardCls}>
          <p className="text-[#6E6E66]">
            Brak lokalu, do którego masz dostęp — dodaj lokal w zakładce
            Pracownicy → Lokale.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={pageTitleCls}>Grafik</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView("tydzien")}
            className={view === "tydzien" ? btnPrimaryCls : btnSecondaryCls}
          >
            <CalendarRange size={15} className="inline -mt-0.5 mr-1" /> Tydzień
          </button>
          <button
            onClick={() => {
              // wejście w dzień z tygodnia: zostań w oglądanym tygodniu
              if (view === "tydzien" && (dayStart < weekStart || dayStart > addDaysYMD(weekStart, 6))) {
                setDayStart(weekStart);
              }
              setView("dzien");
            }}
            className={view === "dzien" ? btnPrimaryCls : btnSecondaryCls}
          >
            <CalendarCheck size={15} className="inline -mt-0.5 mr-1" /> Dzień
          </button>
        </div>
        <div className="flex gap-2 ml-3">
          <button
            onClick={() => {
              setMonth(
                (view === "dzien" ? dayStart : addDaysYMD(weekStart, 3)).slice(0, 7)
              );
              setView("miesiac");
            }}
            className={view === "miesiac" ? btnPrimaryCls : btnSecondaryCls}
          >
            <CalendarDays size={15} className="inline -mt-0.5 mr-1" /> Miesiąc
          </button>
          <button
            onClick={() => setView("konfiguracja")}
            className={view === "konfiguracja" ? btnPrimaryCls : btnSecondaryCls}
          >
            <SlidersHorizontal size={15} className="inline -mt-0.5 mr-1" /> Konfiguracja
          </button>
        </div>
        {(view === "tydzien" || view === "dzien") && (
          <div className="flex gap-2 ml-2">
            <button
              onClick={() => setMode("podglad")}
              className={mode === "podglad" ? btnPrimaryCls : btnSecondaryCls}
            >
              <Eye size={15} className="inline -mt-0.5 mr-1" /> Podgląd
            </button>
            <button
              onClick={() => setMode("edycja")}
              className={mode === "edycja" ? btnPrimaryCls : btnSecondaryCls}
            >
              <Pencil size={15} className="inline -mt-0.5 mr-1" /> Edycja
            </button>
          </div>
        )}
        {(view === "tydzien" || view === "dzien") && (
          <button
            onClick={handlePublish}
            disabled={publishing || niewyslane === 0}
            className={`ml-auto ${btnPrimaryCls}`}
            title={
              niewyslane === 0
                ? "Wszystko wysłane — nic nie czeka na wysyłkę"
                : `Niewysłanych zmian od dziś: ${niewyslane}${
                    niewyslanePozaTygodniem > 0
                      ? ` (${niewyslanePozaTygodniem} poza tym tygodniem)`
                      : ""
                  }`
            }
          >
            <Send size={15} className="inline -mt-0.5 mr-1" /> Wyślij grafik pracownikom
            {niewyslane > 0 ? ` (${niewyslane})` : ""}
          </button>
        )}
        {(view === "konfiguracja" || view === "miesiac") && lokaleNames.length > 1 && (
          <select
            value={lokalKonfiguracji}
            onChange={(e) => setLokalOverride(e.target.value)}
            className="ml-auto p-2 border-[2px] border-[#171714] rounded bg-white font-bold text-sm"
          >
            {lokaleNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === "miesiac" && (
        <GrafikMiesiac
          lokal={lokalKonfiguracji}
          miasto={(lokale || []).find((l) => l.name === lokalKonfiguracji)?.miasto || null}
          activeStanowiska={activeStanowiska}
          planShifts={zywePlanShifts}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          month={month}
          setMonth={setMonth}
          onBackToWeek={() => setView("tydzien")}
        />
      )}

      {view === "konfiguracja" ? (
        <GrafikWymagania
          lokal={lokalKonfiguracji}
          activeStanowiska={activeStanowiska}
          staffingRules={staffingRules}
          setStaffingRules={setStaffingRules}
          staffingRuleSets={staffingRuleSets}
          setStaffingRuleSets={setStaffingRuleSets}
          lokaleGodziny={lokaleGodziny}
          setLokaleGodziny={setLokaleGodziny}
          grafikWyjatki={grafikWyjatki}
          setGrafikWyjatki={setGrafikWyjatki}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      ) : view === "tydzien" || view === "dzien" ? (
        <GrafikTydzien
          lokaleNames={lokaleNames}
          allLokaleNames={wszystkieLokaleNames}
          lokale={lokale}
          users={users}
          setUsers={setUsers}
          activeStanowiska={activeStanowiska}
          planShifts={zywePlanShifts}
          setPlanShifts={setPlanShifts}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          weekStart={view === "dzien" ? dayStart : weekStart}
          setWeekStart={view === "dzien" ? setDayStart : setWeekStart}
          trybDnia={view === "dzien"}
          sortBy={sortBy}
          setSortBy={setSortBy}
          mode={mode}
          shiftSwaps={shiftSwaps}
          onResolveSwap={onResolveSwap}
          setAbsences={setAbsences}
          setShifts={setShifts}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      ) : null}
    </div>
  );
}
