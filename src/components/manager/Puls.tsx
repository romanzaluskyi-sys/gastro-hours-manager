// @ts-nocheck
// Puls — dziennik lokalu. Układ z makiety właściciela (0.57.0): zakładki
// Karta dnia / Dni / Analityka / Konfiguracja (ta ostatnia tylko od `md` —
// makieta zostawia ją na desktopie) i znacznik "Finanse i historia — tylko
// kierownik".
//
// ⚠️ Ten komponent JEST właścicielem danych dziennika. Propsy `dayLogs`/
// `dayLogEntries`/`dayLogTemplates` z App.tsx służą tylko za pierwszy stan,
// żeby ekran nie mrugał w oczekiwaniu na fetch; po każdym zapisie źródłem
// prawdy jest baza (`odswiez`). Stan rodzica aktualizujemy best-effort — gdy
// setter dojechał, Pulpit od razu wie, że dzień zamknięto. Patrz CLAUDE.md.
//
// ⚠️ Lokal wybiera górny pasek (`selectedLokal`). Przy "Cała sieć" — przełącznik
// lokali nad kartą, bo Puls jest zawsze o JEDNYM lokalu.
// ⚠️ Dzień startowy: wczoraj, jeśli wczoraj coś się działo i nikt go nie
// zamknął; inaczej dziś (makieta: zamknięcie wieczorem, "zamknij do 23:59").
import React, { useState } from "react";
import { Lock } from "lucide-react";
import { api } from "../../api/supabase";
import { toLocalYMD, przesun, znajdzKarte } from "../../utils/dziennik";
import { dodajMojeZadanie } from "../../utils/mojeZadania";
import KartaDnia from "./KartaDnia";
import PulsDni from "./PulsDni";
import PulsTydzien from "./PulsTydzien";
import PulsSzablony from "./PulsSzablony";

const WIDOKI = [
  { key: "karta", label: "Karta dnia" },
  { key: "dni", label: "Dni" },
  { key: "tydzien", label: "Analityka" },
  { key: "konfiguracja", label: "Konfiguracja", tylkoDesktop: true },
];

export default function Puls({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  lokale,
  shifts,
  planShifts,
  users,
  setUsers,
  tasks,
  taskBlocks,
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
  // Cel finansowy dnia (utils/budzet.ts) — ta sama tabela, którą wypełnia
  // Grafik → Konfiguracja → Budżet. Karta dnia go POKAZUJE i pozwala poprawić
  // na ten jeden dzień; drugiego miejsca na tę liczbę nie ma.
  budzetCele,
  budzetDni,
  setBudzetDni,
  zadaniaMoje,
  setZadaniaMoje,
  wydarzenia = [],
  showMsg,
  initialLokal,
  initialDate,
}) {
  const dzis = toLocalYMD(new Date());
  const lokaleNames = (availableLokaleForManager || []).map((l) => l.name);
  const konkretny = selectedLokal && selectedLokal !== "ALL" && lokaleNames.includes(selectedLokal) ? selectedLokal : null;
  const [lokalWybrany, setLokalWybrany] = useState(initialLokal || "");
  const lokal = konkretny || lokalWybrany || lokaleNames[0] || "";
  const lokalRow = (lokale || []).find((l) => l.name === lokal) || null;
  const miasto = (lokalRow && lokalRow.miasto) || "";

  const [data, setData] = useState(() => {
    if (initialDate) return initialDate;
    const wczoraj = przesun(dzis, -1);
    const karta = znajdzKarte(dayLogs, lokal, wczoraj);
    const bylRuch = !!karta || (shifts || []).some((s) => s.lokal === lokal && s.start_time && toLocalYMD(s.start_time) === wczoraj);
    return bylRuch && !(karta && karta.status === "zamkniety") ? wczoraj : dzis;
  });
  const [widok, setWidok] = useState("karta");

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
    // Ten sam zakres co w App.tsx — dziennik patrzy wstecz.
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

  // Sprawa z karty dnia do "Moich zadań" (pomiar poza normą, notatka,
  // zdarzenie wymagające prowadzenia) — utils/mojeZadania.ts.
  const dodajDoMoich = async ({ tytul, lokal: l, zrodloId, zrodloOpis }) => {
    const z = await dodajMojeZadanie({
      tytul,
      lokal: l || lokal,
      termin: dzis,
      zrodlo: "puls",
      zrodloId,
      zrodloOpis,
      currentUser,
    });
    if (typeof setZadaniaMoje === "function") setZadaniaMoje((prev) => [z, ...(prev || [])]);
    return z;
  };

  const wspolne = {
    currentUser, lokal, lokalRow, miasto, dzis,
    shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
    staffingRules, staffingRuleSets, grafikWyjatki,
    karty, wpisy, szablony, weatherForecasts,
    budzetCele, budzetDni, setBudzetDni,
    zadaniaMoje, dodajDoMoich,
    wydarzenia,
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
        Żaden lokal nie jest przypisany do Twojego konta — dziennika nie ma dla czego prowadzić.
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col" data-puls-widok={widok}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="hidden md:block m-0 font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714]">Puls</h2>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
          {WIDOKI.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWidok(w.key)}
              className={`${w.tylkoDesktop ? "hidden md:inline-flex" : "inline-flex"} items-center h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
                widok === w.key ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-zakladka-pulsu={w.key}
            >
              {w.label}
            </button>
          ))}
        </div>
        <span className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#ECEBE6] text-[13px] font-bold ml-auto">
          <Lock size={14} /> Finanse i historia — tylko kierownik
        </span>
      </div>

      {!konkretny && lokaleNames.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 [scrollbar-width:none]">
          {lokaleNames.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLokalWybrany(n)}
              className={`inline-flex items-center h-10 px-3.5 rounded-lg border-[2px] font-bold text-sm whitespace-nowrap ${
                n === lokal ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-lokal-pulsu={n}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {widok === "karta" && <KartaDnia {...wspolne} data={data} setData={setData} />}
      {widok === "dni" && <PulsDni {...wspolne} onOtworzDzien={otworzDzien} />}
      {widok === "tydzien" && <PulsTydzien {...wspolne} data={data} setData={setData} onOtworzDzien={otworzDzien} onWidok={setWidok} />}
      {widok === "konfiguracja" && (
        <PulsSzablony
          key={lokal}
          lokal={lokal}
          dayLogTemplates={szablony}
          onZmiana={(lista) => {
            setSzablonyLokalne(lista);
            sync(setDayLogTemplates, lista);
          }}
          users={users}
          setUsers={setUsers}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}
