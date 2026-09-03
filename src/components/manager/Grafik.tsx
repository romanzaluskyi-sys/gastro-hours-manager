// @ts-nocheck
// Grafik — host zakładki (odpowiednik ManagerDashboard.tsx dla całego
// modułu): trzyma wybór podwidoku i przekazuje dane w dół. Widok tygodnia
// i miesiąca dochodzą w kolejnych etapach (patrz "Plan wdrożenia" w
// docs/GRAFIK.md) — na razie jest tu tylko konfiguracja, bez której
// kontrola obsady nie miałaby czego sprawdzać.
import React, { useState } from "react";
import { CalendarRange, SlidersHorizontal, Info } from "lucide-react";
import GrafikWymagania from "./GrafikWymagania";
import { pageTitleCls, cardCls, btnPrimaryCls, btnSecondaryCls } from "./designTokens";

export default function Grafik({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  activeStanowiska,
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
  const [view, setView] = useState("konfiguracja");

  // Konfiguracja dotyczy zawsze JEDNEGO lokalu — przy "Cała sieć"/"Wszystkie
  // moje" spadamy na pierwszy dostępny, tak samo jak pogoda w ManagerShell
  // (weatherLokalName w ManagerDashboard.tsx).
  const [lokalOverride, setLokalOverride] = useState(null);
  const fallbackLokal = availableLokaleForManager[0]?.name || null;
  const lokal =
    lokalOverride ||
    (selectedLokal !== "ALL" ? selectedLokal : fallbackLokal);

  if (!lokal) {
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
      <div className="flex flex-wrap items-center gap-3 max-w-5xl mx-auto">
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
        {selectedLokal === "ALL" && (
          <select
            value={lokal}
            onChange={(e) => setLokalOverride(e.target.value)}
            className="ml-auto p-2 border-[2px] border-[#171714] rounded bg-white font-bold text-sm"
          >
            {availableLokaleForManager.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === "konfiguracja" ? (
        <GrafikWymagania
          lokal={lokal}
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
        <div className="max-w-3xl mx-auto">
          <div className={cardCls}>
            <div className="flex items-start gap-3">
              <Info size={20} className="text-[#DE3A22] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-['Archivo'] font-extrabold text-[16px] mb-1">
                  Siatka tygodnia — w budowie
                </h3>
                <p className="text-[14px] text-[#6E6E66]">
                  Zanim powstanie siatka, uzupełnij <strong>Konfigurację</strong>:
                  godziny otwarcia lokalu i wymagania obsady. Bez nich grafik nie
                  ma jak sprawdzić, czy dzień jest obsadzony.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
