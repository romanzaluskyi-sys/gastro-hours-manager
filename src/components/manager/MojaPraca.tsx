// @ts-nocheck
// Kierownik jest też pracownikiem i sam odbija godziny — ten ekran ma
// wyglądać jak ekran "Zmiana" u pracownika (te same klasy stylów z
// employeeSessionShared.tsx), nie jak stary TimeEntryForm. Logika
// (handleCreateShift/handleCloseShift, overlap check, Google Sheets) jest
// tą samą, co w TimeEntryForm.tsx/employeeSessionShared.tsx — przepisana
// tu bez pickera pracownika, bo `currentUser` jest już konkretną osobą
// (dokładnie ten sam powód, dla którego EmployeeSessionScreens go nie ma
// dla kont osobistych, patrz CLAUDE.md).
import React, { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../../api/supabase";
import { sendToGoogleSheets } from "../../api/googleSheets";
import { findOverlappingShift, getTodaysShiftsForUser } from "../../utils/shifts";
import {
  fieldLabelCls,
  selectWrapCls,
  selectElCls,
  selectChevronCls,
  timeHeroCls,
  timePlainCls,
  razemRowCls,
  helperTextCls,
  ctaPrimaryCls,
  checkboxRowCls,
  fmtHHMM,
} from "../employeeSessionShared";
import HoursReport from "../HoursReport";
import { pageTitleCls, cardCls } from "./designTokens";

export default function MojaPraca({ currentUser, lokale, stanowiska, shifts, setShifts, showMsg }) {
  const [lokal, setLokal] = useState(currentUser?.default_lokal || lokale[0]?.name || "");
  const [stanowisko, setStanowisko] = useState(currentUser?.default_stanowisko || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [knowsEnd, setKnowsEnd] = useState(false);
  const [startTime, setStartTime] = useState(fmtHHMM(new Date()));
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  const openShift = shifts.find((s) => s.user_id === currentUser.id && !s.end_time);
  const todaysClosedShifts = getTodaysShiftsForUser(shifts, currentUser.id).filter(
    (s) => s.end_time
  );
  const dostepneStanowiska = stanowiska.filter((s) => s.lokal_name === lokal);

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

  const [closeTime, setCloseTime] = useState(fmtHHMM(new Date()));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className={pageTitleCls}>Moja Praca</h2>

      <div className={`${cardCls} max-w-md`}>
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
            <button onClick={handleCreateShift} disabled={saving} className={`${ctaPrimaryCls} mt-5`}>
              {knowsEnd ? "Zapisz całą zmianę" : "Rozpocznij zmianę"}
            </button>
          </>
        )}
      </div>

      <div className={cardCls}>
        <HoursReport
          shiftsData={shifts}
          usersData={[currentUser]}
          defaultUserId={currentUser.id}
          isManager={false}
        />
      </div>
    </div>
  );
}
