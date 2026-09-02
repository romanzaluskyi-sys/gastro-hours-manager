// @ts-nocheck
// Nowy ekran domowy Panelu Kierownika — "Dziś w liczbach" z pierwszej
// makiety sesji. Kolumny/wskaźniki zależne od Grafiku (plan zmian) albo
// modułu Zadania (jeszcze nie istnieją) są świadomie pominięte — patrz plan
// sesji ("Poza zakresem"). Koszt liczony z users.stawka; gdy część
// pracowników w zestawieniu nie ma stawki ustawionej, pokazujemy to wprost
// zamiast cichо zaniżać sumę.
import React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import {
  statTileCls,
  statLabelCls,
  statValueCls,
  statSubCls,
  sectionCardCls,
  sectionHeaderCls,
  pageTitleCls,
} from "./designTokens";

const fmtH = (n) => (n || 0).toFixed(1).replace(".", ",");
const fmtHHMM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`
    : "";
const fmtPL = (dateStr) =>
  dateStr
    ? new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
      })
    : "";

const isToday = (d) => d.toDateString() === new Date().toDateString();

export default function PulpitHome({
  users,
  shifts,
  issues,
  matchesFilter, // (lokalName) => bool — hasAccessToLokal + wybrany lokal z paska
  setActiveTab,
}) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekStart = new Date(now);
  const weekDay = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (weekDay === 0 ? 6 : weekDay - 1));
  weekStart.setHours(0, 0, 0, 0);

  const visibleShifts = shifts.filter((s) => matchesFilter(s.lokal));
  const hoursOf = (s) =>
    s.end_time ? (s.end_time - s.start_time) / 3600000 : 0;

  const rateByUser = {};
  users.forEach((u) => {
    if (u.stawka != null && u.stawka !== "") rateByUser[u.name] = Number(u.stawka);
  });

  const costOf = (list) => {
    let sum = 0;
    let incomplete = false;
    list.forEach((s) => {
      const rate = rateByUser[s.user_name];
      if (rate == null) {
        incomplete = true;
        return;
      }
      sum += hoursOf(s) * rate;
    });
    return { sum, incomplete };
  };

  const todayShifts = visibleShifts.filter((s) => isToday(s.start_time));
  const weekShifts = visibleShifts.filter((s) => s.start_time >= weekStart);
  const monthShifts = visibleShifts.filter((s) => s.start_time >= monthStart);
  const prevMonthShifts = visibleShifts.filter(
    (s) => s.start_time >= prevMonthStart && s.start_time < monthStart
  );

  const todayHours = todayShifts.reduce((a, s) => a + hoursOf(s), 0);
  const weekHours = weekShifts.reduce((a, s) => a + hoursOf(s), 0);
  const monthHours = monthShifts.reduce((a, s) => a + hoursOf(s), 0);
  const prevMonthHours = prevMonthShifts.reduce((a, s) => a + hoursOf(s), 0);
  const hoursDelta =
    prevMonthHours > 0
      ? (((monthHours - prevMonthHours) / prevMonthHours) * 100).toFixed(0)
      : null;

  const monthCost = costOf(monthShifts);
  const activeToday = new Set(todayShifts.map((s) => s.user_name)).size;

  const pendingCorrections = issues
    .filter((iss) => iss.type === "correction" && iss.status === "nowe")
    .map((iss) => {
      const existingShift = iss.shift_id
        ? shifts.find((s) => s.id === iss.shift_id)
        : null;
      const lokal = existingShift ? existingShift.lokal : iss.proposed_lokal;
      return { iss, lokal };
    })
    .filter((r) => matchesFilter(r.lokal));

  const openProblems = issues.filter(
    (iss) => (iss.type || "problem") === "problem" && iss.status === "nowe"
  ).length;

  const activeNow = visibleShifts.filter((s) => !s.end_time);

  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const terminy = users
    .filter((u) => u.active && !u.archived && u.role !== "kiosk")
    .filter((u) => matchesFilter(u.default_lokal))
    .flatMap((u) => {
      const rows = [];
      [
        ["sanepid_expiry", "badania sanepid"],
        ["umowa_expiry", "umowa"],
      ].forEach(([field, label]) => {
        const val = u[field];
        if (!val) {
          rows.push({ user: u, label, text: "brak terminu", overdue: true });
          return;
        }
        const d = new Date(val + "T00:00:00");
        const days = Math.round((d - today0) / 86400000);
        if (days <= 30) {
          rows.push({
            user: u,
            label,
            text:
              days < 0
                ? `po terminie (${fmtPL(val)})`
                : days === 0
                ? "dziś!"
                : `za ${days} dni (${fmtPL(val)})`,
            overdue: days < 0,
          });
        }
      });
      return rows;
    })
    .sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className={pageTitleCls}>Dziś w liczbach</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className={statTileCls}>
          <p className={statLabelCls}>Godziny dziś</p>
          <p className={statValueCls}>{fmtH(todayHours)}</p>
          <p className={statSubCls}>{activeToday} osób na zmianie</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Tydzień</p>
          <p className={statValueCls}>{fmtH(weekHours)}</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Koszt miesiąca</p>
          <p className={statValueCls}>
            {monthCost.sum.toFixed(0)} <span className="text-base">zł</span>
          </p>
          {monthCost.incomplete && (
            <p className="text-[12px] text-[#DE3A22] mt-0.5 flex items-center gap-1">
              <AlertTriangle size={12} /> dane niepełne (brak stawki)
            </p>
          )}
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Do decyzji</p>
          <p className={statValueCls}>{pendingCorrections.length}</p>
          <p className={statSubCls}>
            {pendingCorrections.length} korekt, {openProblems} zgłoszeń
          </p>
        </div>
      </div>

      <div className={`${statTileCls} mb-6 flex items-center justify-between`}>
        <div>
          <p className={statLabelCls}>Godziny — ten miesiąc vs poprzedni</p>
          <p className={statValueCls}>{fmtH(monthHours)}</p>
        </div>
        {hoursDelta != null && (
          <p
            className={`font-['Archivo'] font-bold text-lg ${
              hoursDelta >= 0 ? "text-[#171714]" : "text-[#DE3A22]"
            }`}
          >
            {hoursDelta >= 0 ? "+" : ""}
            {hoursDelta}%
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Wymaga Twojej decyzji</span>
            {pendingCorrections.length > 0 && (
              <span className="bg-[#DE3A22] text-white text-[11px] font-extrabold min-w-[20px] h-5 rounded flex items-center justify-center px-1.5">
                {pendingCorrections.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-[#B7B6AE]">
            {pendingCorrections.length === 0 && (
              <p className="p-4 text-sm text-[#8F8E86]">Brak oczekujących.</p>
            )}
            {pendingCorrections.slice(0, 4).map(({ iss }) => (
              <div key={iss.id} className="p-3.5">
                <p className="font-bold text-sm">{iss.user_name || "Anonim"}</p>
                <p className="text-xs text-[#6E6E66]">
                  {iss.proposed_lokal} · {fmtPL(iss.proposed_date)}
                </p>
              </div>
            ))}
          </div>
          {pendingCorrections.length > 0 && (
            <button
              onClick={() => setActiveTab("zatwierdzanie")}
              className="w-full p-3 text-sm font-bold text-[#DE3A22] flex items-center justify-center gap-1.5 border-t-[2px] border-[#171714]"
            >
              Przejdź do decyzji <ArrowRight size={14} />
            </button>
          )}
        </div>

        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Teraz na zmianie</span>
            <span className="text-xs font-normal text-[#8F8E86]">
              {activeNow.length} osób
            </span>
          </div>
          <div className="divide-y divide-[#B7B6AE]">
            {activeNow.length === 0 && (
              <p className="p-4 text-sm text-[#8F8E86]">Nikt teraz nie pracuje.</p>
            )}
            {activeNow.slice(0, 6).map((s) => (
              <div key={s.id} className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{s.user_name}</p>
                  <p className="text-xs text-[#6E6E66]">
                    {s.lokal} · {s.stanowisko}
                  </p>
                </div>
                <span className="font-['Archivo'] font-bold text-sm">
                  od {fmtHHMM(s.start_time)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Terminy i dokumenty</span>
          </div>
          <div className="divide-y divide-[#B7B6AE]">
            {terminy.length === 0 && (
              <p className="p-4 text-sm text-[#8F8E86]">Brak zbliżających się terminów.</p>
            )}
            {terminy.slice(0, 6).map((t, i) => (
              <div key={i} className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm">{t.user.name}</p>
                  <p className="text-xs text-[#6E6E66]">{t.label}</p>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded ${
                    t.overdue
                      ? "bg-[#FAEAE6] text-[#8A3A2B]"
                      : "bg-[#F1F1EE] text-[#171714]"
                  }`}
                >
                  {t.text}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setActiveTab("pracownicy")}
            className="w-full p-3 text-sm font-bold text-[#171714] flex items-center justify-center gap-1.5 border-t-[2px] border-[#171714]"
          >
            Wszystkie terminy <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
