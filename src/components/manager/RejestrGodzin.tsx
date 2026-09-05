// @ts-nocheck
// Nowy wygląd Rejestru Godzin — grupowanie po stanowisku, jeden pasek
// wyszukiwania, "+ Dodaj wpis" (ten sam modal edycji co reszta panelu, w
// trybie tworzenia — patrz ManagerDashboard.tsx openNewShift/isNewShift),
// status wiersza (łączy się z issues.type === "correction" z
// "Zatwierdzanie zmian") i "Historia" czytająca shift_edits.
import React, { useState } from "react";
import { Plus, Download, History, Edit2, X } from "lucide-react";
import { getShort, getDayOfWeek, getMonthName } from "../../utils/format";
import {
  buildPlanFactMap,
  sumujPlanFakt,
  toLocalYMD,
  PLAN_FAKT_PROG_H,
} from "../../utils/grafik";
import { findStanowisko } from "../../utils/stanowiska";
import {
  pageTitleCls,
  sectionCardCls,
  statTileCls,
  statLabelCls,
  statSubCls,
  statValueCls,
  btnPrimaryCls,
  btnSecondaryCls,
} from "./designTokens";

const fmtHM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";

const rowStatus = (shift, hasPendingCorrection) => {
  if (hasPendingCorrection)
    return { label: "Do decyzji", cls: "bg-[#FAEAE6] text-[#8A3A2B]", border: "border-[#DE3A22]", dot: "bg-[#DE3A22]" };
  if (!shift.end_time) {
    const isToday = shift.start_time.toDateString() === new Date().toDateString();
    return isToday
      ? { label: "Na zmianie", cls: "bg-[#FFF4D6] text-[#8A6B1E]", border: "border-[#C99A1E]", dot: "bg-[#C99A1E]" }
      : { label: "Wpis otwarty", cls: "bg-[#FAEAE6] text-[#8A3A2B]", border: "border-[#DE3A22]", dot: "bg-[#DE3A22]" };
  }
  return { label: "Zatwierdzone", cls: "bg-[#EAF4EC] text-[#2E6B44]", border: "border-[#3E8E5C]", dot: "bg-[#3E8E5C]" };
};

export default function RejestrGodzin({
  shifts,
  planShifts = [],
  issues,
  shiftEdits,
  stanowiska,
  matchesFilter,
  onEditShift,
  onNewShift,
  onNameClick,
}) {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("data");
  const [historyFor, setHistoryFor] = useState(null);
  const [tylkoRoznice, setTylkoRoznice] = useState(false);

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };
  const isCurrentMonth =
    month === new Date().getMonth() && year === new Date().getFullYear();

  const pendingByShiftId = {};
  issues
    .filter((iss) => iss.type === "correction" && iss.status === "nowe" && iss.shift_id)
    .forEach((iss) => {
      pendingByShiftId[iss.shift_id] = true;
    });

  const editsByShiftId = {};
  shiftEdits.forEach((se) => {
    if (!se.shift_id) return;
    (editsByShiftId[se.shift_id] = editsByShiftId[se.shift_id] || []).push(se);
  });

  const q = search.trim().toLowerCase();
  const periodShifts = shifts
    .filter(
      (s) =>
        matchesFilter(s.lokal) &&
        s.start_time.getMonth() === month &&
        s.start_time.getFullYear() === year
    )
    .filter((s) => {
      if (!q) return true;
      const dateStr = s.start_time.toLocaleDateString("pl-PL");
      const hayStack = `${s.user_name} ${s.stanowisko} ${s.lokal} ${dateStr} ${fmtHM(
        s.start_time
      )} ${fmtHM(s.end_time)}`.toLowerCase();
      return hayStack.includes(q);
    });

  const totalHours = periodShifts.reduce(
    (a, s) => a + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );
  // Urlop wchodzi w sumę godzin (tak ma być — 8 h za dzień roboczy liczy się
  // do wypłaty), ale kierownik musi widzieć, ile z tego to czas na sali.
  const urlopHours = periodShifts
    .filter((s) => s.is_urlop)
    .reduce((a, s) => a + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0), 0);
  // Plan vs fakt liczony na sumach dnia (patrz utils/grafik.ts) — odporne na
  // to, że ludzie wymieniają się między sobą bez systemu.
  // Porównujemy tylko dni ZAMKNIĘTE: plan na cały miesiąc zestawiony z
  // faktem za pięć dni dawałby "-82%" i nie znaczyłby nic. Dzisiejszy dzień
  // też pomijamy — połowa ludzi jeszcze nie skończyła zmiany.
  const wczorajYMD = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalYMD(d);
  })();
  const okresOd = toLocalYMD(new Date(year, month, 1));
  const koniecMiesiaca = toLocalYMD(new Date(year, month + 1, 0));
  const okresDo = koniecMiesiaca < wczorajYMD ? koniecMiesiaca : wczorajYMD;
  const okresPusty = okresDo < okresOd;
  const planFakt = buildPlanFactMap({
    planShifts,
    factShifts: shifts,
    from: okresOd,
    to: okresDo,
    lokalOk: matchesFilter,
  });
  const pf = sumujPlanFakt(planFakt);
  const diffDnia = (s) =>
    planFakt.get(`${String(s.user_id || s.user_name || "")}|${toLocalYMD(s.start_time)}`);

  // Filtr "tylko różnice" zawęża listę do dni, w których fakt rozjechał się
  // z grafikiem o więcej niż próg. Nie ocenia, kto zawinił — pokazuje, gdzie
  // w ogóle jest o czym rozmawiać.
  const widoczneShifts = tylkoRoznice
    ? periodShifts.filter((s) => {
        const d = diffDnia(s);
        return d && Math.abs(d.diff) >= PLAN_FAKT_PROG_H;
      })
    : periodShifts;

  const korektyCount = periodShifts.filter((s) => editsByShiftId[s.id]).length;
  const doDecyzjiCount = periodShifts.filter((s) => pendingByShiftId[s.id]).length;
  const otwarteCount = periodShifts.filter(
    (s) => !s.end_time && s.start_time.toDateString() !== new Date().toDateString()
  ).length;

  // --- grupowanie ---
  const groups = {};
  widoczneShifts.forEach((s) => {
    const key = s.stanowisko || "Bez stanowiska";
    (groups[key] = groups[key] || []).push(s);
  });
  const sortRows = (rows) => {
    const sorted = [...rows];
    if (sortBy === "data") sorted.sort((a, b) => b.start_time - a.start_time);
    if (sortBy === "pracownik") sorted.sort((a, b) => a.user_name.localeCompare(b.user_name));
    if (sortBy === "lokal") sorted.sort((a, b) => a.lokal.localeCompare(b.lokal));
    return sorted;
  };
  const groupNames = Object.keys(groups).sort();
  // Zbierany w trakcie renderu — resetowany przy każdym przejściu, żeby
  // odznaka różnicy pojawiła się raz na (osoba, dzień).
  const pokazaneRoznice = new Set();

  const handleExportCsv = () => {
    const header = ["Data", "Pracownik", "Lokal", "Stanowisko", "Wejście", "Wyjście", "Godziny"];
    const lines = [header.join(";")];
    periodShifts
      .slice()
      .sort((a, b) => a.start_time - b.start_time)
      .forEach((s) => {
        const h = s.end_time ? ((s.end_time - s.start_time) / 3600000).toFixed(2) : "";
        lines.push(
          [
            s.start_time.toLocaleDateString("pl-PL"),
            s.user_name,
            s.lokal,
            s.stanowisko,
            fmtHM(s.start_time),
            fmtHM(s.end_time),
            h,
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(";")
        );
      });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rejestr-godzin-${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={pageTitleCls}>Rejestr Godzin</h2>
          <span className="inline-block bg-[#171714] text-white font-['Archivo'] font-extrabold text-base px-3 py-1 rounded mt-1.5">
            {getMonthName(month)} {year}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => shiftMonth(-1)} className={btnSecondaryCls}>
            ← Poprzedni
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => {
                setMonth(new Date().getMonth());
                setYear(new Date().getFullYear());
              }}
              className={btnSecondaryCls}
            >
              Bieżący miesiąc
            </button>
          )}
          <button onClick={() => shiftMonth(1)} className={btnSecondaryCls}>
            Następny →
          </button>
          <button onClick={handleExportCsv} className={btnSecondaryCls}>
            <Download size={15} className="inline -mt-0.5 mr-1" /> Eksport CSV
          </button>
          <button onClick={onNewShift} className={btnPrimaryCls}>
            <Plus size={15} className="inline -mt-0.5 mr-1" /> Dodaj wpis
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className={statTileCls}>
          <p className={statLabelCls}>Godziny w okresie</p>
          <p className={statValueCls}>{totalHours.toFixed(1).replace(".", ",")}</p>
          {urlopHours > 0 && (
            <p className={statSubCls}>
              w tym urlop {urlopHours.toFixed(1).replace(".", ",")} h ·{" "}
              <strong>
                bez urlopu {(totalHours - urlopHours).toFixed(1).replace(".", ",")} h
              </strong>
            </p>
          )}
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Korekty kierownika</p>
          <p className={statValueCls}>{korektyCount}</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Do decyzji</p>
          <p className={statValueCls}>{doDecyzjiCount}</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Plan vs fakt</p>
          <p
            className={`${statValueCls} ${
              Math.abs(pf.diff) < PLAN_FAKT_PROG_H
                ? ""
                : pf.diff > 0
                ? "text-[#2F7A2A]"
                : "text-[#DE3A22]"
            }`}
          >
            {pf.diff >= 0 ? "+" : "−"}
            {Math.abs(pf.diff).toFixed(1).replace(".", ",")} h
          </p>
          <p className={statSubCls}>
            plan {pf.planH.toFixed(1).replace(".", ",")} h · fakt{" "}
            {pf.faktH.toFixed(1).replace(".", ",")} h
          </p>
          <p className={statSubCls}>
            {okresPusty
              ? "brak zamkniętych dni"
              : `${pf.rozbieznosci} dni z różnicą (do ${okresDo.slice(8)}.${okresDo.slice(5, 7)})`}
            {otwarteCount > 0 ? ` · ${otwarteCount} wpisów otwartych` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj po nazwisku, stanowisku, dacie lub godzinie..."
          className="flex-1 min-w-[220px] border-[2px] border-[#171714] rounded p-2.5 text-sm"
        />
        <button
          onClick={() => setTylkoRoznice((v) => !v)}
          className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
            tylkoRoznice
              ? "bg-[#171714] text-white border-[#171714]"
              : "bg-white text-[#171714] border-[#B7B6AE]"
          }`}
          title="Pokaż tylko dni, w których fakt różni się od grafiku"
        >
          Tylko różnice{pf.rozbieznosci > 0 ? ` (${pf.rozbieznosci})` : ""}
        </button>
        <span className="text-xs text-[#8F8E86] uppercase font-bold">Sortuj</span>
        {[
          ["data", "Data"],
          ["pracownik", "Pracownik"],
          ["lokal", "Lokal"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              sortBy === key
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {groupNames.length === 0 && (
        <div className="bg-white p-8 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
          Brak zapisów w tym okresie.
        </div>
      )}

      <div className="space-y-5">
        {groupNames.map((groupName) => {
          const rows = sortRows(groups[groupName]);
          const groupHours = rows.reduce(
            (a, s) => a + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
            0
          );
          const groupStanowisko = findStanowisko(stanowiska, rows[0]?.lokal, groupName);
          return (
            <div key={groupName} className={sectionCardCls}>
              <div className="px-4 py-2.5 bg-[#F1F1EE] border-b-[2px] border-[#171714] font-['Archivo'] font-extrabold text-[13px] uppercase tracking-wide flex items-center gap-2">
                {groupStanowisko?.kolor && (
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: groupStanowisko.kolor }}
                  />
                )}
                {groupName} · {rows.length} {rows.length === 1 ? "wpis" : "wpisy"} ·{" "}
                {groupHours.toFixed(1).replace(".", ",")} h
              </div>
              <div className="divide-y divide-[#B7B6AE]">
                {rows.map((s) => {
                  const status = rowStatus(s, pendingByShiftId[s.id]);
                  const hours = s.end_time ? (s.end_time - s.start_time) / 3600000 : null;
                  return (
                    <div
                      key={s.id}
                      className={`pl-2.5 pr-3 md:px-4 py-2.5 md:py-3 flex items-center flex-nowrap gap-1.5 md:gap-3 border-l-4 ${status.border} hover:bg-[#F1F1EE]`}
                    >
                      <span className="w-10 md:w-[74px] flex-shrink-0 font-['Archivo'] font-bold text-[11px] md:text-sm">
                        {s.start_time.toLocaleDateString("pl-PL", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                        <span className="hidden md:inline text-[#8F8E86] font-semibold ml-1">
                          {getDayOfWeek(s.start_time)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => s.user_id && onNameClick(s.user_id)}
                        className="flex-1 min-w-0 md:w-32 md:flex-none text-left font-bold text-[12px] md:text-sm truncate hover:underline hover:text-[#DE3A22]"
                      >
                        {s.user_name}
                      </button>
                      <span className="hidden md:inline w-24 flex-shrink-0 text-xs">
                        {s.is_urlop ? (
                          <span className="font-extrabold text-[#8A3A2B]">Urlop</span>
                        ) : (
                          <span className="text-[#6E6E66]">{getShort(s.lokal)}</span>
                        )}
                      </span>
                      <span className="md:w-28 flex-shrink-0 text-[10.5px] md:text-sm tabular-nums whitespace-nowrap">
                        {s.is_urlop ? (
                          <span className="italic text-[#6E6E66]">Urlop</span>
                        ) : (
                          <>
                            {fmtHM(s.start_time)}–
                            {s.end_time ? fmtHM(s.end_time) : (
                              <span className="text-[#DE3A22] font-bold">trwa</span>
                            )}
                          </>
                        )}
                      </span>
                      <span className="w-9 md:w-16 flex-shrink-0 text-right font-['Archivo'] font-extrabold text-[12px] md:text-sm tabular-nums">
                        {hours != null ? hours.toFixed(1).replace(".", ",") : "-"}
                      </span>
                      {/* Różnica dotyczy CAŁEGO dnia tej osoby, nie tego
                          jednego wpisu — przy dwóch zmianach jednego dnia
                          pokazujemy ją więc tylko raz, przy pierwszym
                          wierszu, żeby nie czytało się jak podwójna. */}
                      {(() => {
                        if (s.is_urlop) return null;
                        const d = diffDnia(s);
                        if (!d || Math.abs(d.diff) < PLAN_FAKT_PROG_H) return null;
                        const klucz = `${d.userKey}|${d.date}`;
                        if (pokazaneRoznice.has(klucz)) return null;
                        pokazaneRoznice.add(klucz);
                        return (
                          <span
                            className={`hidden md:inline text-[11px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0 ${
                              d.diff > 0
                                ? "bg-[#E4F3E0] text-[#2F5E2A]"
                                : "bg-[#FAEAE6] text-[#8A3A2B]"
                            }`}
                            title={`Ten dzień: grafik ${d.planH
                              .toFixed(1)
                              .replace(".", ",")} h, odbito ${d.faktH
                              .toFixed(1)
                              .replace(".", ",")} h`}
                          >
                            {d.diff > 0 ? "+" : "−"}
                            {Math.abs(d.diff).toFixed(1).replace(".", ",")} h
                          </span>
                        );
                      })()}
                      <span
                        className={`hidden md:inline text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${status.cls}`}
                      >
                        {status.label}
                      </span>
                      <span
                        className={`md:hidden w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`}
                        title={status.label}
                      />
                      <span className="hidden md:block flex-1" />
                      <div className="flex gap-1 md:gap-1.5 flex-shrink-0">
                        {editsByShiftId[s.id] && (
                          <button
                            onClick={() => setHistoryFor(s.id)}
                            className="w-7 h-7 md:w-8 md:h-8 border-[2px] border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                            title="Historia zmian"
                          >
                            <History size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => onEditShift(s)}
                          className="w-7 h-7 md:w-8 md:h-8 border-[2px] border-[#171714] rounded flex items-center justify-center text-[#171714]"
                          title="Edytuj"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {historyFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border-[2px] border-[#171714] w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="px-5 py-4 border-b-[2px] border-[#171714] flex items-center justify-between">
              <h3 className="font-['Archivo'] font-extrabold text-lg">Historia zmian</h3>
              <button onClick={() => setHistoryFor(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="divide-y divide-[#B7B6AE]">
              {(editsByShiftId[historyFor] || [])
                .slice()
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((se) => (
                  <div key={se.id} className="px-5 py-3.5 text-sm">
                    <p className="font-bold">
                      {se.editor_name} ·{" "}
                      {new Date(se.created_at).toLocaleString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-[#6E6E66] mt-1">
                      {se.old_start_time || "—"}
                      {se.old_end_time ? `–${se.old_end_time}` : ""} →{" "}
                      <span className="text-[#171714] font-bold">
                        {se.new_start_time}
                        {se.new_end_time ? `–${se.new_end_time}` : ""}
                      </span>
                    </p>
                    {se.reason && (
                      <p className="text-[#6E6E66] italic mt-1">Powód: {se.reason}</p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
