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
import { findOverlappingShift, opisKolidujacej, getTodaysShiftsForUser } from "../../utils/shifts";
import { getDayOfWeek, odmianaZmian, getMonthName, getAvailableYears } from "../../utils/format";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import {
  publishedShiftsFor,
  nextShiftFrom,
  shiftHours,
  faktIPlanMiesiaca,
  trimTime,
} from "../../utils/grafik";
import { podsumowanieMiesiaca } from "../../utils/umowy";
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
  planShifts,
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
  const [teraz, setTeraz] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTeraz(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
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

  // --- GRAFIK I MIESIĄC -------------------------------------------------
  // Kierownik jest też pracownikiem i ma dokładnie te same pytania co reszta
  // zespołu: kiedy mam następną zmianę, ile jeszcze dziś, ile wyjdzie w
  // miesiącu. Liczby pochodzą z tych samych funkcji co ekran pracownika —
  // inaczej ten sam miesiąc mówiłby tu co innego niż w telefonie.
  const ymdLok = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  const dzisYMD = ymdLok(teraz);
  const mojGrafik = publishedShiftsFor(planShifts, currentUser);

  const miesiacKlucz = `${raportYear}-${String(raportMonth + 1).padStart(2, "0")}`;
  const rozbicie = faktIPlanMiesiaca({
    shifts,
    planShifts,
    user: currentUser,
    rok: raportYear,
    mies: raportMonth + 1,
    dzis: teraz,
  });
  const podsumowanie = podsumowanieMiesiaca({
    user: currentUser,
    przepracowane: rozbicie.fakt,
    zaplanowane: rozbicie.plan,
    rok: raportYear,
    mies: raportMonth + 1,
    biezacy: rozbicie.biezacy,
  });

  // Grafik na oglądany miesiąc — pod raportem, żeby obok tego, co BYŁO,
  // stało to, co jeszcze BĘDZIE.
  const grafikMiesiaca = mojGrafik
    .filter((s) => s.date.slice(0, 7) === miesiacKlucz)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const najblizszaZmiana = nextShiftFrom(planShifts, currentUser, dzisYMD);
  // Zmiana z grafiku pasująca do tej, którą właśnie odbito — stąd wiadomo,
  // ile jeszcze zostało "wg grafiku". Gdy planu na dziś nie ma, nie zgadujemy.
  const planNaTrwajaca = openShift
    ? mojGrafik.find((s) => s.date === ymdLok(openShift.start_time))
    : null;
  const naZmianieMin = openShift
    ? Math.max(0, Math.round((teraz - openShift.start_time) / 60000))
    : null;
  const doKoncaMin = (() => {
    if (!openShift || !planNaTrwajaca || !planNaTrwajaca.end_time) return null;
    const [h, m] = planNaTrwajaca.end_time.split(":").map(Number);
    const koniec = new Date(openShift.start_time);
    koniec.setHours(h, m, 0, 0);
    if (koniec < openShift.start_time) koniec.setDate(koniec.getDate() + 1);
    return Math.round((koniec - teraz) / 60000);
  })();

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
      return showMsg(
        `Ta zmiana nakłada się na już zapisaną (${opisKolidujacej(overlapping)}).`,
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
    <div className="max-w-2xl mx-auto">
      <h2 className={`${pageTitleCls} mb-6`}>Moja Praca</h2>

      <div className="space-y-6">
        <div className={cardCls}>
          {openShift ? (
            <>
              {/* Ten sam układ co ekran „Zmiana" u pracownika: duży licznik,
                  pod nim lokal i stanowisko, a czas do końca w osobnej ramce.
                  Kierownik ma widzieć swoją zmianę tak samo jak reszta zespołu. */}
              <div className={sectionLabelCls}>
                Pracujesz od {fmtHHMM(openShift.start_time)}
              </div>
              <div className="h-[2.5px] bg-[#171714] mt-2" />
              <div className="font-['Archivo'] font-extrabold text-[42px] text-[#171714] mt-4 tabular-nums">
                {Math.floor(naZmianieMin / 60)} godz. {naZmianieMin % 60} min
              </div>
              <div className="text-sm text-[#6E6E66] mt-1">
                {openShift.lokal}
                {openShift.stanowisko ? ` · ${openShift.stanowisko}` : ""}
              </div>
              {doKoncaMin != null && (
                <div
                  className={`mt-2.5 rounded p-3 border-2 ${
                    doKoncaMin < 0
                      ? "border-[#DE3A22] bg-[#FBEAE6]"
                      : "border-[#B7B6AE] bg-[#F1F1EE]"
                  }`}
                >
                  <div className={sectionLabelCls}>
                    {doKoncaMin < 0 ? "Po planowanym końcu" : "Do końca zmiany"}
                  </div>
                  <div
                    className={`font-['Archivo'] font-extrabold text-[22px] tabular-nums ${
                      doKoncaMin < 0 ? "text-[#8A3A2B]" : "text-[#171714]"
                    }`}
                  >
                    {Math.floor(Math.abs(doKoncaMin) / 60)} godz.{" "}
                    {Math.abs(doKoncaMin) % 60} min
                  </div>
                  <div className="text-[13px] text-[#6E6E66]">
                    Wg grafiku {trimTime(planNaTrwajaca.start_time)} –{" "}
                    {trimTime(planNaTrwajaca.end_time)}
                  </div>
                </div>
              )}
              <div className="h-px bg-[#B7B6AE] my-5" />
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
              {najblizszaZmiana && (
                <div className="border-[2px] border-[#171714] rounded p-3.5 mb-5">
                  <p className={fieldLabelCls}>Najbliższa zmiana wg grafiku</p>
                  <p className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] mt-1">
                    {najblizszaZmiana.date.slice(8, 10)}.
                    {najblizszaZmiana.date.slice(5, 7)} ·{" "}
                    {trimTime(najblizszaZmiana.start_time)} –{" "}
                    {trimTime(najblizszaZmiana.end_time)}
                  </p>
                  <p className="text-[13px] text-[#6E6E66]">
                    {najblizszaZmiana.stanowisko} · {najblizszaZmiana.lokal}
                  </p>
                </div>
              )}
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
                <span
                  className="w-11 flex-shrink-0 text-[11px] font-bold text-center rounded px-1 py-0.5 text-[#6E6E66]"
                  style={
                    s.is_urlop
                      ? {}
                      : stanowiskoBadgeStyle(stanowiska, s.lokal, s.stanowisko) || {}
                  }
                >
                  {s.is_urlop ? "URL" : stanowiskoShort(stanowiska, s.lokal, s.stanowisko)}
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
          <div className="flex items-end justify-between gap-3 pt-4 mt-1 border-t-[2px] border-[#171714]">
            <div className="min-w-0">
              <span className={sectionLabelCls}>
                {currentUser.name} · {getMonthName(raportMonth)}
              </span>
              {/* To samo zdanie co w Raporcie pracownika i z tej samej funkcji —
                  kierownik jest pracownikiem i ma prawo do tej samej liczby. */}
              {podsumowanie.opis && (
                <div className="text-[12px] text-[#6E6E66] leading-snug mt-0.5">
                  {podsumowanie.opis}
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-['Archivo'] font-extrabold text-[24px] text-[#171714] tabular-nums leading-none">
                {raportTotal.toFixed(1).replace(".", ",")} godz.
              </div>
              {podsumowanie.pod && (
                <div className="text-[12px] text-[#6E6E66] tabular-nums mt-1">
                  {podsumowanie.pod}
                </div>
              )}
            </div>
          </div>
          {/* Grafik na ten sam miesiąc, pod raportem: obok tego, co BYŁO,
              stoi to, co jeszcze BĘDZIE. Karty takie same jak na ekranie
              Grafik u pracownika — jeden wygląd dla obu ról. Dzień tygodnia
              stoi NAD liczbą, bo obok siebie zlewały się w jedno. */}
          {grafikMiesiaca.length > 0 && (
            <div className="mt-6 pt-4 border-t-[2px] border-[#171714]">
              <div className="flex items-baseline justify-between">
                <span className={sectionLabelCls}>
                  Grafik · {getMonthName(raportMonth)}
                </span>
                <span className="font-['Archivo'] font-extrabold text-sm text-[#171714] tabular-nums">
                  {grafikMiesiaca.length} {odmianaZmian(grafikMiesiaca.length)} ·{" "}
                  {grafikMiesiaca
                    .reduce((a, g) => a + shiftHours(g), 0)
                    .toFixed(1)
                    .replace(".", ",")}{" "}
                  h
                </span>
              </div>
              <div className="mt-3 space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
                {grafikMiesiaca.map((g) => {
                  const minione = g.date < dzisYMD;
                  const dzien = new Date(g.date + "T00:00:00");
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center gap-3 rounded border-2 px-3.5 py-2.5 ${
                        minione
                          ? "border-[#B7B6AE] text-[#8F8E86]"
                          : "border-[#171714] text-[#171714]"
                      }`}
                    >
                      <span className="w-[64px] flex-shrink-0">
                        <span className="block text-[11px] font-bold uppercase tracking-wider leading-none text-[#8F8E86]">
                          {g.date === dzisYMD ? "dziś" : getDayOfWeek(dzien)}
                        </span>
                        <span className="block font-['Archivo'] font-extrabold text-[15px] leading-tight tabular-nums mt-1">
                          {g.date.slice(8, 10)}.{g.date.slice(5, 7)}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0 text-[14px] tabular-nums">
                        {trimTime(g.start_time)} – {trimTime(g.end_time)}
                        <span className="block text-[12.5px] text-[#6E6E66] truncate">
                          {g.stanowisko} · {g.lokal}
                        </span>
                      </span>
                      <span className="flex-shrink-0 font-['Archivo'] font-extrabold text-[14px] tabular-nums">
                        {shiftHours(g).toFixed(1).replace(".", ",")} h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
