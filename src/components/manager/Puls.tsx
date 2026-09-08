// @ts-nocheck
// Puls — dziennik lokalu. Host trzech widoków: lista dni, karta jednego dnia,
// raport tygodnia, plus konfiguracja wpisów.
//
// ⚠️ Ten komponent JEST właścicielem danych dziennika. Propsy `dayLogs`/
// `dayLogEntries`/`dayLogTemplates` z App.tsx służą tylko za pierwszy stan,
// żeby ekran nie mrugał w oczekiwaniu na fetch; po każdym zapisie źródłem
// prawdy jest baza (`odswiez`). Stan rodzica aktualizujemy best-effort — gdy
// setter dojechał, Pulpit od razu wie, że dzień zamknięto. Powód jest
// praktyczny, nie estetyczny: w produkcji te settery potrafiły przyjść
// `undefined` mimo poprawnego przekazania na każdym poziomie, a wtedy zapis
// się udawał i nie było go widać nigdzie. Patrz CLAUDE.md.
import React, { useState } from "react";
import { CalendarDays, BookOpen, BarChart3, SlidersHorizontal } from "lucide-react";
import { api } from "../../api/supabase";
import { pageTitleCls, btnPrimaryCls, btnSecondaryCls, lokalTabCls } from "./designTokens";
import { toLocalYMD, przesun } from "../../utils/dziennik";
import KartaDnia from "./KartaDnia";
import PulsDni from "./PulsDni";
import PulsTydzien from "./PulsTydzien";
import PulsSzablony from "./PulsSzablony";

const WIDOKI = [
  { key: "dni", label: "Dni", Icon: CalendarDays },
  { key: "karta", label: "Karta dnia", Icon: BookOpen },
  { key: "tydzien", label: "Tydzień", Icon: BarChart3 },
  { key: "konfiguracja", label: "Konfiguracja", Icon: SlidersHorizontal },
];

export default function Puls({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  lokale,
  shifts,
  planShifts,
  users,
  tasks,
  taskCompletions,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  dayLogs,
  setDayLogs,
  dayLogEntries,
  setDayLogEntries,
  dayLogTemplates,
  setDayLogTemplates,
  weatherForecasts,
  showMsg,
  initialLokal,
  initialDate,
}) {
  const dzis = toLocalYMD(new Date());
  // Dzień zamyka się po jego zakończeniu, więc domyślnie patrzymy na wczoraj.
  const [data, setData] = useState(initialDate || przesun(dzis, -1));
  const [widok, setWidok] = useState(initialDate ? "karta" : "dni");

  const lokaleNames = (availableLokaleForManager || []).map((l) => l.name);
  const konkretny =
    selectedLokal && selectedLokal !== "ALL" && lokaleNames.includes(selectedLokal)
      ? selectedLokal
      : null;
  const [lokalWybrany, setLokalWybrany] = useState(initialLokal || "");
  const lokal = konkretny || lokalWybrany || lokaleNames[0] || "";
  const lokalRow = (lokale || []).find((l) => l.name === lokal) || null;
  const miasto = (lokalRow && lokalRow.miasto) || "";

  const [kartyLokalne, setKartyLokalne] = useState(null);
  const [wpisyLokalne, setWpisyLokalne] = useState(null);
  const [szablonyLokalne, setSzablonyLokalne] = useState(null);
  const karty = kartyLokalne || dayLogs || [];
  const wpisy = wpisyLokalne || dayLogEntries || [];
  const szablony = szablonyLokalne || dayLogTemplates || [];

  const sync = (setter, lista) => {
    if (typeof setter === "function") setter(lista);
  };

  const odswiez = async () => {
    // Ten sam zakres co w App.tsx — dziennik patrzy wstecz, nie ma powodu
    // ściągać całej historii przy każdym zapisie.
    const od = przesun(dzis, -120);
    const [k, w, s] = await Promise.all([
      api.get("day_logs", `date=gte.${od}`),
      api.get("day_log_entries", `date=gte.${od}`),
      api.get("day_log_templates"),
    ]);
    const kk = Array.isArray(k) ? k : [];
    const ww = Array.isArray(w) ? w : [];
    const ss = Array.isArray(s) ? s : [];
    setKartyLokalne(kk);
    setWpisyLokalne(ww);
    setSzablonyLokalne(ss);
    sync(setDayLogs, kk);
    sync(setDayLogEntries, ww);
    sync(setDayLogTemplates, ss);
  };

  const wspolne = {
    currentUser, lokal, lokalRow, miasto, dzis,
    shifts, planShifts, users, tasks, taskCompletions,
    staffingRules, staffingRuleSets, grafikWyjatki,
    karty, wpisy, szablony, weatherForecasts,
    setKarty: setKartyLokalne,
    setWpisy: setWpisyLokalne,
    odswiez,
    showMsg,
  };

  const otworzDzien = (dateStr) => {
    setData(dateStr);
    setWidok("karta");
  };

  if (!lokal) {
    return (
      <div className="bg-white rounded-xl border-[2px] border-[#171714] p-4">
        Żaden lokal nie jest przypisany do Twojego konta — dziennika nie ma dla czego
        prowadzić.
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={pageTitleCls}>Puls</h2>
        <div className="flex flex-wrap gap-2 ml-auto">
          {WIDOKI.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setWidok(key)}
              className={widok === key ? btnPrimaryCls : btnSecondaryCls}
            >
              <Icon size={15} className="inline -mt-0.5 mr-1" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {lokaleNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lokaleNames.map((n) => (
            <button
              key={n}
              className={lokalTabCls(n === lokal)}
              onClick={() => setLokalWybrany(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {widok === "dni" && <PulsDni {...wspolne} onOtworzDzien={otworzDzien} />}
      {widok === "karta" && (
        <KartaDnia {...wspolne} data={data} setData={setData} />
      )}
      {widok === "tydzien" && (
        <PulsTydzien {...wspolne} data={data} setData={setData} onOtworzDzien={otworzDzien} />
      )}
      {widok === "konfiguracja" && (
        <PulsSzablony
          lokal={lokal}
          lokaleNames={lokaleNames}
          onZmienLokal={setLokalWybrany}
          dayLogTemplates={szablony}
          onZmiana={(lista) => {
            setSzablonyLokalne(lista);
            sync(setDayLogTemplates, lista);
          }}
          onWroc={() => setWidok("karta")}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}
