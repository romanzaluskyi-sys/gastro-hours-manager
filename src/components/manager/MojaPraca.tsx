// @ts-nocheck
// Kierownik jest też pracownikiem i sam odbija godziny — ten ekran ma
// wyglądać jak ekrany "Zmiana"/"Raport" u pracownika (te same klasy
// stylów z employeeSessionShared.tsx), nie jak stare TimeEntryForm/
// HoursReport. Logika zapisu zmiany jest tą samą, co w TimeEntryForm.tsx —
// przepisana tu bez pickera pracownika, bo `currentUser` jest już
// konkretną osobą (dokładnie ten sam powód, dla którego
// EmployeeSessionScreens go nie ma dla kont osobistych, patrz CLAUDE.md).
// Różnica względem ekranu pracownika: zamiast chorągiewki "Zgłoś"
// przy wierszu raportu, kierownik od razu edytuje swój wpis (ten sam
// modal edycji co reszta Panelu, przekazany jako `onEditShift`).
//
// Layout: dwie karty (zapis zmiany + raport) w gridzie 1 kolumna na
// mobile / 2 równe kolumny od md w górę, żeby nie zostawać wąskim
// telefonowym makietem na dużym ekranie (feedback z sesji).
import React, { useState, useEffect } from "react";
import { ChevronDown, Edit2 } from "lucide-react";
import { api } from "../../api/supabase";
import { sendToGoogleSheets } from "../../api/googleSheets";
import { findOverlappingShift, getTodaysShiftsForUser } from "../../utils/shifts";
import { getShort, getDayOfWeek, getMonthName, getAvailableYears } from "../../utils/format";
import {
  fieldLabelCls,
  selectWrapCls,
  selectElCls,
  selectChevronCls,
  sectionLabelCls,
  timeHeroCls,
  timePlainCls,
  razemRowCls,
  helperTextCls,
  ctaPrimaryCls,
  checkboxRowCls,
  fmtHHMM,
} from "../employeeSessionShared";
import { pageTitleCls, cardCls } from "./designTokens";

export default function MojaPraca({
  currentUser,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  showMsg,
  onEditShift,
}) {
  const [lokal, setLokal] = useState(currentUser?.default_lokal || lokale[0]?.name || "");
  const [stanowisko, setStanowisko] = useState(currentUser?.default_stanowisko || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [knowsEnd, setKnowsEnd] = useState(false);
  const [startTime, setStartTime] = useState(fmtHHMM(new Date()));
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [closeTime, setCloseTime] = useState(fmtHHMM(new Date()));
  const [raportMonth, setRaportMonth] = useState(new Date().getMonth());
  const [raportYear, setRaportYear] = useState(new Date().getFullYear());

  const openShift = shifts.find((s) => s.user_id === currentUser.id && !s.end_time);
  const todaysClosedShifts = getTodaysShiftsForUser(shifts, currentUser.id).filter(
    (s) => s.end_time
  );
  const dostepneStanowiska = stanowiska.filter((s) => s.lokal_name === lokal);

  const raportShifts = shifts
    .filter(
      (s) =>
        s.user_id === currentUser.id &&
        s.start_time.getMonth() === raportMonth &&
        s.start_time.getFullYear() === raportYear
    )
    .sort((a, b) => a.start_time - b.start_time);
  const raportTotal = raportShifts.reduce(
    (acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );

  useEffect(() => {
    if (!dostepneStanowiska.find((s) => s.name === stanowisko)) {
      setStanowisko(dostepneStanowiska.length > 0 ? dostepneStanowiska[0].name : "");
    }
  }, [lokal, stanowiska]);

  const razem =
    knowsEnd && startTime && endTime
      ? (() => {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          let mins = eh * 60 + em - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          return (mins / 60).toFixed(1).replace(".", ",");
        })()
      : null;

  const handleCreateShift = async () => {
    if (!lokal || !stanowisko || !date || !startTime || (knowsEnd && !endTime)) {
      return showMsg("Wypełnij wymagane pola!", "error");
    }
    setSaving(true);
    const [year, month, day] = date.split("-").map(Number);
    const [startH, startM] = startTime.split(":").map(Number);
    const startD = new Date(year, month - 1, day, startH, startM);
    let endD = null;
    let hrs = null;
    if (knowsEnd) {
      const [endH, endM] = endTime.split(":").map(Number);
      endD = new Date(year, month - 1, day, endH, endM);
      if (endD < startD) endD.setDate(endD.getDate() + 1);
      hrs = parseFloat(((endD - startD) / 3600000).toFixed(2));
    }
    const overlapping = findOverlappingShift(shifts, currentUser.id, startD, endD, null);
    if (overlapping) {
      setSaving(false);
      const fmt = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return showMsg(
        `Ta zmiana nakłada się na już zapisaną (${fmt(overlapping.start_time)}–${fmt(
          overlapping.end_time
        )}).`,
        "error"
      );
    }
    try {
      const created = await api.post("shifts", {
        user_id: currentUser.id,
        user_name: currentUser.name,
        lokal,
        stanowisko,
        start_time: startD.toISOString(),
        end_time: endD ? endD.toISOString() : null,
        godzin: hrs,
      });
      const parsed = {
        ...created,
        start_time: new Date(created.start_time),
        end_time: created.end_time ? new Date(created.end_time) : null,
      };
      setShifts([...shifts, parsed]);
      sendToGoogleSheets(parsed, "ADD_SHIFT");
      showMsg(knowsEnd ? "Zmiana zapisana!" : "Rozpoczęto zmianę!");
      setStartTime(fmtHHMM(new Date()));
      setEndTime("");
      setKnowsEnd(false);
    } catch (err) {
      showMsg("Błąd zapisu do bazy!", "error");
    }
    setSaving(false);
  };

  const handleCloseShift = async (customEnd) => {
    if (!customEnd) return showMsg("Wpisz godzinę zakończenia!", "error");
    setSaving(true);
    const [endH, endM] = customEnd.split(":").map(Number);
    let endD = new Date(openShift.start_time);
    endD.setHours(endH, endM, 0, 0);
    if (endD < openShift.start_time) endD.setDate(endD.getDate() + 1);
    const hrs = parseFloat(((endD - openShift.start_time) / 3600000).toFixed(2));
    try {
      const updated = await api.patch("shifts", openShift.id, {
        end_time: endD.toISOString(),
        godzin: hrs,
      });
      const parsed = {
        ...updated,
        start_time: new Date(updated.start_time),
        end_time: new Date(updated.end_time),
      };
      setShifts(shifts.map((s) => (s.id === openShift.id ? parsed : s)));
      sendToGoogleSheets(parsed, "EDIT_SHIFT");
      showMsg("Zmiana zakończona pomyślnie!");
    } catch (err) {
      showMsg("Błąd połączenia z bazą!", "error");
    }
    setSaving(false);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className={`${pageTitleCls} mb-6`}>Moja Praca</h2>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        <div className={cardCls}>
          {openShift ? (
            <>
              <p className="text-[15px] font-bold text-[#171714] mb-1">
                Trwająca zmiana · {openShift.lokal}
              </p>
              <p className="text-[13px] text-[#6E6E66] mb-5">
                Start {fmtHHMM(openShift.start_time)}, {openShift.stanowisko}
              </p>
              <span className={fieldLabelCls}>Zakończenie</span>
              <div className={timePlainCls}>
                <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
                  {closeTime || "--:--"}
                </span>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </div>
              <button
                onClick={() => handleCloseShift(closeTime)}
                disabled={saving}
                className={`${ctaPrimaryCls} mt-5`}
              >
                Zakończ zmianę
              </button>
            </>
          ) : (
            <>
              {todaysClosedShifts.length > 0 && (
                <div className="bg-[#FAEAE6] rounded p-3.5 text-sm text-[#8A3A2B] mb-5">
                  <p className="font-bold mb-1">Dziś już zarejestrowano:</p>
                  {todaysClosedShifts.map((s) => (
                    <p key={s.id}>
                      {fmtHHMM(s.start_time)}–{fmtHHMM(s.end_time)} ({s.lokal})
                    </p>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={fieldLabelCls}>Lokal</span>
                  <div className={selectWrapCls}>
                    <select
                      value={lokal}
                      onChange={(e) => setLokal(e.target.value)}
                      className={selectElCls}
                    >
                      {lokale.map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className={selectChevronCls} />
                  </div>
                </div>
                <div>
                  <span className={fieldLabelCls}>Stanowisko</span>
                  <div className={selectWrapCls}>
                    <select
                      value={stanowisko}
                      onChange={(e) => setStanowisko(e.target.value)}
                      className={selectElCls}
                    >
                      {dostepneStanowiska.length === 0 && (
                        <option value="">Brak stanowisk</option>
                      )}
                      {dostepneStanowiska.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className={selectChevronCls} />
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <span className={fieldLabelCls}>Data</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={selectElCls}
                />
              </div>
              <button
                type="button"
                onClick={() => setKnowsEnd((v) => !v)}
                className={`${checkboxRowCls(knowsEnd)} mt-5`}
              >
                <span className="w-5 h-5 border-2 border-[#B7B6AE] rounded-[3px] flex-shrink-0 flex items-center justify-center">
                  {knowsEnd && <span className="w-[9px] h-[9px] bg-[#DE3A22] rounded-[1px]" />}
                </span>
                <span className="text-[15.5px] font-semibold text-[#171714]">
                  Znam godzinę zakończenia
                </span>
              </button>
              <div className="mt-5">
                <span className={fieldLabelCls}>Rozpoczęcie</span>
                <div className={timeHeroCls}>
                  <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
                    {startTime}
                  </span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>
              {knowsEnd && (
                <div className="mt-5">
                  <span className={fieldLabelCls}>Zakończenie</span>
                  <div className={timePlainCls}>
                    <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
                      {endTime || "--:--"}
                    </span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </div>
              )}
              {knowsEnd && razem && (
                <div className={`${razemRowCls} mt-5`}>
                  <span className="text-sm text-[#6E6E66]">Razem</span>
                  <span className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] tabular-nums">
                    {razem} godz.
                  </span>
                </div>
              )}
              {!knowsEnd && (
                <p className={`${helperTextCls} mt-5`}>
                  Zapiszemy tylko start. Zmianę zakończysz przy następnym wejściu.
                </p>
              )}
              <button
                onClick={handleCreateShift}
                disabled={saving}
                className={`${ctaPrimaryCls} mt-5`}
              >
                {knowsEnd ? "Zapisz całą zmianę" : "Rozpocznij zmianę"}
              </button>
            </>
          )}
        </div>

        <div className={cardCls}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={selectWrapCls}>
              <select
                value={raportMonth}
                onChange={(e) => setRaportMonth(Number(e.target.value))}
                className={selectElCls}
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i}>
                    {getMonthName(i)}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className={selectChevronCls} />
            </div>
            <div className={selectWrapCls}>
              <select
                value={raportYear}
                onChange={(e) => setRaportYear(Number(e.target.value))}
                className={selectElCls}
              >
                {getAvailableYears().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className={selectChevronCls} />
            </div>
          </div>
          <div className="flex gap-2 pb-2.5 border-b-[1.5px] border-[#B7B6AE]">
            <span className="w-[54px] flex-shrink-0 mr-3 text-[10.5px] font-bold tracking-wider uppercase text-[#8F8E86]">
              Data
            </span>
            <span className="w-11 flex-shrink-0 text-[10.5px] font-bold tracking-wider uppercase text-[#8F8E86]">
              St.
            </span>
            <span className="flex-1 text-[10.5px] font-bold tracking-wider uppercase text-[#8F8E86]">
              Od – Do
            </span>
            <span className="w-[74px] flex-shrink-0 text-right text-[10.5px] font-bold tracking-wider uppercase text-[#8F8E86]">
              Godz.
            </span>
            <span className="w-9 flex-shrink-0" />
          </div>
          {raportShifts.length === 0 && (
            <div className="text-center py-8 text-[#8F8E86] text-sm">
              Brak zmian w tym miesiącu.
            </div>
          )}
          <div className="max-h-[520px] overflow-y-auto">
            {raportShifts.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 py-[15px] border-b border-[#B7B6AE]"
              >
                <span className="w-[54px] flex-shrink-0 mr-3 font-['Archivo'] font-extrabold text-[14.5px] text-[#171714]">
                  {String(s.start_time.getDate()).padStart(2, "0")}.
                  {String(s.start_time.getMonth() + 1).padStart(2, "0")}
                  <span className="text-[#8F8E86] font-semibold ml-1">
                    {getDayOfWeek(s.start_time)}
                  </span>
                </span>
                <span className="w-11 flex-shrink-0 text-[13px] font-semibold text-[#6E6E66]">
                  {s.is_urlop ? "URL" : getShort(s.stanowisko)}
                </span>
                <span className="flex-1 text-[13.5px] text-[#171714] tabular-nums">
                  {s.is_urlop ? (
                    <span className="text-[#6E6E66] italic">Urlop</span>
                  ) : (
                    <>
                      {fmtHHMM(s.start_time)} –{" "}
                      {s.end_time ? (
                        fmtHHMM(s.end_time)
                      ) : (
                        <span className="text-[#DE3A22] font-bold">Trwa</span>
                      )}
                    </>
                  )}
                </span>
                <span className="w-[74px] flex-shrink-0 text-right font-['Archivo'] font-extrabold text-[15px] text-[#171714] tabular-nums">
                  {s.end_time
                    ? ((s.end_time - s.start_time) / 3600000).toFixed(1).replace(".", ",")
                    : "-"}
                </span>
                <button
                  onClick={() => onEditShift(s)}
                  className="w-9 h-[30px] flex-shrink-0 border-2 border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                  title="Edytuj wpis"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between pt-4 mt-1 border-t-[2px] border-[#171714]">
            <span className={sectionLabelCls}>
              {currentUser.name} · {getMonthName(raportMonth)}
            </span>
            <span className="font-['Archivo'] font-extrabold text-[24px] text-[#171714] tabular-nums">
              {raportTotal.toFixed(1).replace(".", ",")} godz.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
