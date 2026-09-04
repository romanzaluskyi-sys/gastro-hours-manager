// @ts-nocheck
// Grafik — host zakładki: trzyma wybór podwidoku, tydzień i sortowanie,
// resztę oddaje w dół. Widok miesiąca, tryb Edycja i giełda zmian dochodzą
// w kolejnych etapach (patrz "Plan wdrożenia" w docs/GRAFIK.md).
//
// Zakres lokali bierzemy z górnego paska ManagerShell (selectedLokal) —
// nie powtarzamy wyboru lokalu wewnątrz zakładki.
import React, { useState } from "react";
import { CalendarRange, SlidersHorizontal } from "lucide-react";
import GrafikWymagania from "./GrafikWymagania";
import GrafikTydzien from "./GrafikTydzien";
import { pageTitleCls, cardCls, btnPrimaryCls, btnSecondaryCls } from "./designTokens";
import { toLocalYMD, mondayOf } from "../../utils/grafik";

export default function Grafik({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  lokale,
  users,
  activeStanowiska,
  planShifts,
  absences,
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
  const [sortBy, setSortBy] = useState("stanowisko");
  const [lokalOverride, setLokalOverride] = useState(null);

  const lokaleNames =
    selectedLokal !== "ALL"
      ? [selectedLokal]
      : (availableLokaleForManager || []).map((l) => l.name);

  // Konfiguracja dotyczy zawsze JEDNEGO lokalu — przy "Cała sieć" trzeba go
  // wskazać osobno, bo wymagania obsady są per lokal.
  const lokalKonfiguracji =
    (lokaleNames.includes(lokalOverride) && lokalOverride) || lokaleNames[0] || null;

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
            onClick={() => setView("konfiguracja")}
            className={view === "konfiguracja" ? btnPrimaryCls : btnSecondaryCls}
          >
            <SlidersHorizontal size={15} className="inline -mt-0.5 mr-1" /> Konfiguracja
          </button>
        </div>
        {view === "konfiguracja" && lokaleNames.length > 1 && (
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
      ) : (
        <GrafikTydzien
          lokaleNames={lokaleNames}
          lokale={lokale}
          users={users}
          activeStanowiska={activeStanowiska}
          planShifts={planShifts}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      )}
    </div>
  );
}
