// @ts-nocheck
// Raporty i koszty — świadomie BEZ starej siatki dzień×pracownik z Pulpitu
// (Roman poprosił: pomiń na razie, zrób lepszy raport per pracownik
// zamiast tego). Układ lista+karta jak w Pracownicy.tsx: po lewej
// pracownicy posortowani wg kosztu/godzin w okresie, po prawej pełny
// raport wybranej osoby (godziny, koszt, lista zmian z edycją). Imię
// pracownika w Rejestr Godzin/Aktywni nawiguje tu przez selectedUserId
// sterowany z ManagerDashboard.tsx — patrz onNameClick tam.
import React, { useState, useEffect } from "react";
import { Edit2, Download } from "lucide-react";
import { getDayOfWeek, getMonthName } from "../../utils/format";
import {
  pageTitleCls,
  sectionCardCls,
  sectionHeaderCls,
  statTileCls,
  statLabelCls,
  statValueCls,
  btnSecondaryCls,
  cardCls,
} from "./designTokens";

const fmtHM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";

export default function RaportyIKoszty({
  users,
  shifts,
  matchesFilter,
  onEditShift,
  selectedUserId,
  setSelectedUserId,
}) {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

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
  const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();

  const periodShifts = shifts.filter(
    (s) =>
      matchesFilter(s.lokal) &&
      s.start_time.getMonth() === month &&
      s.start_time.getFullYear() === year
  );

  const rateByUser = {};
  users.forEach((u) => {
    if (u.stawka != null && u.stawka !== "") rateByUser[u.id] = Number(u.stawka);
  });

  const hoursOf = (s) => (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0);

  // --- agregacja per pracownik ---
  const byUser = {};
  periodShifts.forEach((s) => {
    if (!s.user_id) return;
    byUser[s.user_id] = byUser[s.user_id] || { hours: 0, count: 0, incomplete: false };
    byUser[s.user_id].hours += hoursOf(s);
    byUser[s.user_id].count += 1;
  });
  const employeeRows = Object.keys(byUser)
    .map((uid) => {
      const u = users.find((x) => x.id === uid);
      const rate = rateByUser[uid];
      const cost = rate != null ? byUser[uid].hours * rate : null;
      return { uid, user: u, hours: byUser[uid].hours, count: byUser[uid].count, cost };
    })
    .filter((r) => r.user)
    .sort((a, b) => (b.cost ?? b.hours) - (a.cost ?? a.hours));

  const totalHours = employeeRows.reduce((a, r) => a + r.hours, 0);
  const totalCostRows = employeeRows.filter((r) => r.cost != null);
  const totalCost = totalCostRows.reduce((a, r) => a + r.cost, 0);
  const costIncomplete = employeeRows.some((r) => r.cost == null);

  // --- agregacja per lokal ---
  const byLokal = {};
  periodShifts.forEach((s) => {
    byLokal[s.lokal] = byLokal[s.lokal] || { hours: 0 };
    byLokal[s.lokal].hours += hoursOf(s);
  });

  useEffect(() => {
    if (selectedUserId && !users.find((u) => u.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [selectedUserId]);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;
  const selectedShifts = selectedUserId
    ? periodShifts
        .filter((s) => s.user_id === selectedUserId)
        .sort((a, b) => a.start_time - b.start_time)
    : [];
  const selectedHours = selectedShifts.reduce((a, s) => a + hoursOf(s), 0);
  const selectedRate = selectedUserId ? rateByUser[selectedUserId] : null;
  const selectedCost = selectedRate != null ? selectedHours * selectedRate : null;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={pageTitleCls}>Raporty i koszty</h2>
          <p className="text-sm text-[#6E6E66] mt-1">
            {getMonthName(month)} {year}
          </p>
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
          <button disabled title="Wkrótce" className={`${btnSecondaryCls} opacity-50 cursor-not-allowed`}>
            <Download size={15} className="inline -mt-0.5 mr-1" /> Eksport CSV
          </button>
          <button disabled title="Wkrótce" className={`${btnSecondaryCls} opacity-50 cursor-not-allowed`}>
            Wyślij do księgowej
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className={statTileCls}>
          <p className={statLabelCls}>Godziny</p>
          <p className={statValueCls}>{totalHours.toFixed(1).replace(".", ",")}</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Koszt</p>
          <p className={statValueCls}>{totalCost.toFixed(0)} zł</p>
          {costIncomplete && <p className="text-[11px] text-[#DE3A22] mt-0.5">dane niepełne</p>}
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Pracownicy</p>
          <p className={statValueCls}>{employeeRows.length}</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Śr. koszt/h</p>
          <p className={statValueCls}>
            {totalHours > 0 && !costIncomplete ? (totalCost / totalHours).toFixed(1) : "—"}
          </p>
        </div>
      </div>

      <div className={`${sectionCardCls} mb-6`}>
        <div className={sectionHeaderCls}>Według lokalu</div>
        <div className="divide-y divide-[#B7B6AE]">
          {Object.keys(byLokal).length === 0 && (
            <p className="p-4 text-sm text-[#8F8E86]">Brak danych w tym okresie.</p>
          )}
          {Object.entries(byLokal)
            .sort((a, b) => b[1].hours - a[1].hours)
            .map(([lokal, v]) => (
              <div key={lokal} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-bold">{lokal}</span>
                <span className="font-['Archivo'] font-bold tabular-nums">
                  {v.hours.toFixed(1).replace(".", ",")} h
                </span>
              </div>
            ))}
        </div>
      </div>

      <div className="grid md:grid-cols-[360px_1fr] gap-5">
        {/* --- Lista pracowników --- */}
        <div className={`${!selectedUser ? "block" : "hidden md:block"} ${sectionCardCls}`}>
          <div className={sectionHeaderCls}>Według pracownika</div>
          <div className="divide-y divide-[#B7B6AE]">
            {employeeRows.length === 0 && (
              <p className="p-4 text-sm text-[#8F8E86]">Brak zmian w tym okresie.</p>
            )}
            {employeeRows.map((r) => (
              <button
                key={r.uid}
                onClick={() => setSelectedUserId(r.uid)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-[#F1F1EE] ${
                  selectedUserId === r.uid ? "bg-[#F1F1EE]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{r.user.name}</p>
                  <p className="text-xs text-[#6E6E66]">{r.count} zmiany</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-['Archivo'] font-bold text-sm tabular-nums">
                    {r.hours.toFixed(1).replace(".", ",")} h
                  </p>
                  <p className="text-xs text-[#6E6E66]">
                    {r.cost != null ? `${r.cost.toFixed(0)} zł` : "brak stawki"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* --- Raport wybranego pracownika --- */}
        <div className={selectedUser ? "block" : "hidden md:block"}>
          {!selectedUser && (
            <div className="bg-white p-10 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
              Wybierz pracownika z listy, żeby zobaczyć jego raport.
            </div>
          )}
          {selectedUser && (
            <div className={cardCls}>
              <button
                onClick={() => setSelectedUserId(null)}
                className="md:hidden text-sm font-bold text-[#6E6E66] mb-3"
              >
                ← Wróć do listy
              </button>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-['Archivo'] font-extrabold text-lg">{selectedUser.name}</h3>
                <div className="text-right">
                  <p className="font-['Archivo'] font-extrabold text-xl tabular-nums">
                    {selectedHours.toFixed(1).replace(".", ",")} h
                  </p>
                  <p className="text-xs text-[#6E6E66]">
                    {selectedCost != null ? `${selectedCost.toFixed(0)} zł` : "brak stawki"}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pb-2.5 border-b-[1.5px] border-[#B7B6AE] text-[10.5px] font-bold tracking-wider uppercase text-[#8F8E86]">
                <span className="w-14 flex-shrink-0">Data</span>
                <span className="w-20 flex-shrink-0">Lokal</span>
                <span className="flex-1">Od – Do</span>
                <span className="w-16 flex-shrink-0 text-right">Godz.</span>
                <span className="w-9 flex-shrink-0" />
              </div>
              {selectedShifts.length === 0 && (
                <p className="text-center py-8 text-sm text-[#8F8E86]">Brak zmian w tym miesiącu.</p>
              )}
              {selectedShifts.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-3 border-b border-[#B7B6AE]">
                  <span className="w-14 flex-shrink-0 font-['Archivo'] font-bold text-[13px]">
                    {String(s.start_time.getDate()).padStart(2, "0")}.
                    {String(s.start_time.getMonth() + 1).padStart(2, "0")}
                    <span className="text-[#8F8E86] font-semibold ml-1">
                      {getDayOfWeek(s.start_time)}
                    </span>
                  </span>
                  <span className="w-20 flex-shrink-0 text-xs text-[#6E6E66] truncate">{s.lokal}</span>
                  <span className="flex-1 text-[13.5px] tabular-nums">
                    {fmtHM(s.start_time)} –{" "}
                    {s.end_time ? fmtHM(s.end_time) : <span className="text-[#DE3A22] font-bold">trwa</span>}
                  </span>
                  <span className="w-16 flex-shrink-0 text-right font-['Archivo'] font-extrabold text-[14px] tabular-nums">
                    {s.end_time ? hoursOf(s).toFixed(1).replace(".", ",") : "-"}
                  </span>
                  <button
                    onClick={() => onEditShift(s)}
                    className="w-9 h-[30px] flex-shrink-0 border-[2px] border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
