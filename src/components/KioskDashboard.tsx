// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Lock, AlertCircle, Delete, ChevronLeft, Mail } from "lucide-react";
import { getTodaysShiftsForUser } from "../utils/shifts";
import { offersForUser, STATUS_LABEL } from "../utils/swaps";
import { trimTime, toLocalYMD } from "../utils/grafik";
import {
  fmtHHMM,
  sumHours,
  opisDnia,
  EmployeeSessionScreens,
} from "./employeeSessionShared";
import WeatherBadge from "./WeatherBadge";

// ==========================================
// KIOSK SŁUŻBOWY — nowy design ("Tablet Służbowy")
// Zastępuje OpenDeviceDashboard w widoku "open_dashboard" (App.tsx).
// Wzornictwo wg zatwierdzonego prototypu HTML z sesji projektowej — patrz
// CLAUDE.md, "Tablet Służbowy — KioskDashboard". OpenDeviceDashboard.tsx
// pozostaje nietknięty w repo jako łatwy rollback.
//
// Ekrany "wewnątrz sesji" (Pulpit/Zmiana/Raport/Zadania/Więcej/Wiadomości/
// Zgłoś) są współdzielone z PersonalDashboard.tsx (osobiste konto) przez
// employeeSessionShared.tsx — ten plik odpowiada TYLKO za "kto teraz
// korzysta z tego wspólnego urządzenia": listę pracowników i opcjonalną
// blokadę PIN-em.
// ==========================================

const KioskDashboard = ({
  currentUser,
  setCurrentView,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  users,
  issues,
  setIssues,
  notifications,
  setNotifications,
  tasks,
  taskCompletions,
  setTaskCompletions,
  absences,
  planShifts,
  shiftSwaps,
  setShiftSwaps,
  setAbsences,
  showMsg,
}) => {
  const [screen, setScreen] = useState("LIST");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinEntered, setPinEntered] = useState("");
  const [pinError, setPinError] = useState(false);
  const [now, setNow] = useState(new Date());

  const allowed = currentUser.allowed_lokale
    ? currentUser.allowed_lokale.split(",").map((l) => l.trim())
    : [];
  const activeUsers = users.filter(
    (u) =>
      u.active &&
      !u.archived &&
      u.role === "open" &&
      allowed.includes(u.default_lokal)
  );
  // Powiadomienia WYBRANEGO pracownika, nie całego urządzenia. Wcześniej
  // kiosk pokazywał worek wiadomości wszystkich osób z lokalu, więc jedna
  // osoba otwierająca zakładkę oznaczała jako przeczytane także cudze —
  // i nikt inny już ich nie zobaczył. Kto ma nieprzeczytaną wiadomość,
  // widać teraz na liście wyboru (koperta przy nazwisku).
  const myNotifications = selectedEmployee
    ? notifications.filter(
        (n) =>
          (n.audience || "employee") === "employee" &&
          n.user_name === selectedEmployee.name
      )
    : [];
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  const lokaleAllowed = lokale.filter((l) => allowed.includes(l.name));
  const stanowiskaAllowed = stanowiska.filter((s) =>
    allowed.includes(s.lokal_name)
  );

  // Stan każdej osoby na DZIŚ, liczony raz i używany zarówno przez licznik
  // nad listą, jak i przez sortowanie i kafelki. "Jeszcze nie odbiło" liczymy
  // WG GRAFIKU — kto ma dziś wolne, nie jest nikomu potrzebny na liście
  // braków (wcześniej licznik brał wszystkich przypisanych do lokalu i
  // pokazywał nieprawdę).
  const dzisYMD = toLocalYMD(new Date());
  const stanDnia = new Map(
    activeUsers.map((u) => {
      const otwarta = shifts.find((s) => s.user_id === u.id && !s.end_time);
      const zamkniete = getTodaysShiftsForUser(shifts, u.id).filter((s) => s.end_time);
      const zaplanowane = (planShifts || [])
        .filter(
          (s) =>
            s.published_at &&
            !s.deleted_at &&
            s.date === dzisYMD &&
            String(s.user_id) === String(u.id)
        )
        .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));
      const stan = otwarta
        ? "na_zmianie"
        : zamkniete.length > 0
        ? "zakonczyl"
        : zaplanowane.length > 0
        ? "oczekiwany"
        : "wolne";
      return [u.id, { otwarta, zamkniete, zaplanowane, stan }];
    })
  );
  const ile = (stan) => activeUsers.filter((u) => stanDnia.get(u.id).stan === stan).length;
  const naZmianie = ile("na_zmianie");
  const oczekiwani = ile("oczekiwany");
  const zakonczyli = ile("zakonczyl");

  // Kolejność: kto jest teraz na zmianie, potem kto jest dziś oczekiwany,
  // potem kto już skończył, na końcu wolne. Na wspólnym tablecie to skraca
  // szukanie siebie do jednego spojrzenia.
  const KOLEJNOSC = { na_zmianie: 0, oczekiwany: 1, zakonczyl: 2, wolne: 3 };
  const widoczniUsers = [...activeUsers].sort((a, b) => {
    const sa = KOLEJNOSC[stanDnia.get(a.id).stan];
    const sb = KOLEJNOSC[stanDnia.get(b.id).stan];
    if (sa !== sb) return sa - sb;
    if (sa === 1) {
      const ga = trimTime(stanDnia.get(a.id).zaplanowane[0]?.start_time) || "99:99";
      const gb = trimTime(stanDnia.get(b.id).zaplanowane[0]?.start_time) || "99:99";
      if (ga !== gb) return ga.localeCompare(gb);
    }
    return a.name.localeCompare(b.name, "pl");
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const goList = () => {
    setSelectedEmployee(null);
    setPinTarget(null);
    setPinEntered("");
    setPinError(false);
    setScreen("LIST");
  };

  const selectEmployee = (u) => {
    if (u.kiosk_pin) {
      setPinTarget(u);
      setPinEntered("");
      setPinError(false);
      setScreen("PIN");
    } else {
      setSelectedEmployee(u);
      setScreen("SESSION");
    }
  };

  const handlePinDigit = (k) => {
    if (k === "back") {
      setPinEntered((p) => p.slice(0, -1));
      return;
    }
    setPinEntered((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + k;
      if (next.length === 4) {
        const target = pinTarget;
        setTimeout(() => {
          if (target && next === String(target.kiosk_pin)) {
            setSelectedEmployee(target);
            setPinTarget(null);
            setPinEntered("");
            setPinError(false);
            setScreen("SESSION");
          } else {
            setPinError(true);
            setTimeout(() => {
              setPinEntered("");
              setPinError(false);
            }, 900);
          }
        }, 150);
      }
      return next;
    });
  };

  // ==========================================
  // EKRAN: LIST — wybór pracownika
  // ==========================================
  if (screen === "LIST") {
    return (
      <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
        <div className="w-full max-w-md bg-white h-full flex flex-col shadow-lg overflow-hidden">
          <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center justify-between flex-shrink-0">
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
              Tablet Służbowy
            </span>
            <span className="text-sm text-[#8F8E86]">
              {allowed.join(", ") || "Brak lokalu"} · {fmtHHMM(now)}
            </span>
          </header>
          <div className="bg-[#E7E7E2] border-b border-[#B7B6AE] px-5 py-2.5 flex items-center gap-2 text-sm text-[#6E6E66] flex-shrink-0">
            <WeatherBadge city={lokaleAllowed[0]?.miasto} />
          </div>
          <main className="flex-1 overflow-y-auto px-5 pt-6 pb-5 flex flex-col">
            <div className="font-['Archivo'] font-extrabold text-[30px] text-[#171714]">
              Wybierz siebie
            </div>
            <div className="text-sm text-[#6E6E66] mt-0.5 mb-3.5">
              {activeUsers.length > 0
                ? [
                    `${naZmianie} na zmianie`,
                    `${oczekiwani} wg grafiku jeszcze nie odbiło`,
                    `${zakonczyli} zakończyło`,
                  ].join(" · ")
                : "Brak przypisanych pracowników"}
            </div>
            {widoczniUsers.map((u) => {
              const { otwarta: empOpen, zamkniete: empClosedToday, zaplanowane } =
                stanDnia.get(u.id);
              // Na wspólnym tablecie nikt nie wchodzi na cudzą stronę, więc
              // giełda musi być widoczna już na liście. Podświetlamy TYLKO
              // tych, którzy mogą coś wziąć — dla nich to zaproszenie do
              // działania. Autor oferty dostaje sam napis: on już wie, że
              // ją wystawił, kolor niczego by mu nie dodał.
              const propozycje = offersForUser({
                swaps: shiftSwaps,
                planShifts,
                absences,
                user: u,
              });
              // Wiadomości są adresowane imiennie, a na wspólnym tablecie
              // nikt nie zagląda na cudzą stronę — bez sygnału na liście
              // powiadomienie potrafiłoby wisieć nieprzeczytane tygodniami.
              const nieprzeczytane = notifications.filter(
                (n) =>
                  (n.audience || "employee") === "employee" &&
                  n.user_name === u.name &&
                  !n.is_read
              ).length;
              const wystawione = (shiftSwaps || []).filter(
                (sw) =>
                  ["na_gieldzie", "przyjeta"].includes(sw.status) &&
                  String(sw.author_user_id) === String(u.id)
              );
              return (
                <button
                  key={u.id}
                  onClick={() => selectEmployee(u)}
                  className={`border-2 rounded p-4 flex items-center justify-between gap-3 w-full text-left mb-3.5 ${
                    propozycje.length > 0
                      ? "border-[#171714] bg-[#FDF3D4]"
                      : "border-[#B7B6AE] bg-[#F1F1EE]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-['Archivo'] font-extrabold text-[21px] text-[#171714] flex items-center gap-1.5">
                      {u.name}{" "}
                      {u.kiosk_pin && <Lock size={14} strokeWidth={2.3} />}
                    </div>
                    <div className="text-[13px] text-[#6E6E66] mt-0.5">
                      {u.default_stanowisko || ""}
                    </div>
                    {nieprzeczytane > 0 && (
                      <div className="text-[13px] font-bold text-[#8A3A2B] mt-1 flex items-center gap-1">
                        <Mail size={14} strokeWidth={2.3} />
                        {nieprzeczytane === 1
                          ? "Czeka wiadomość"
                          : `Czekają ${nieprzeczytane} wiadomości`}
                      </div>
                    )}
                    {propozycje.length > 0 ? (
                      <div className="text-[13px] font-bold text-[#8A3A2B] mt-1">
                        ⇄ Giełda: propozycja {opisDnia(propozycje[0].ps.date)} ·{" "}
                        {trimTime(propozycje[0].ps.start_time)} –{" "}
                        {trimTime(propozycje[0].ps.end_time)}
                        {propozycje.length > 1 ? ` (+${propozycje.length - 1})` : ""}
                      </div>
                    ) : wystawione.length > 0 ? (
                      <div className="text-[13px] text-[#6E6E66] mt-1">
                        ⇄ Giełda: {STATUS_LABEL[wystawione[0].status].toLowerCase()}
                      </div>
                    ) : null}
                  </div>
                  {empOpen ? (
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#FAEAE6] text-[#8A3A2B]">
                      od {fmtHHMM(empOpen.start_time)}
                    </span>
                  ) : empClosedToday.length > 0 ? (
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#EAEAE5] text-[#4A4A43]">
                      {sumHours(empClosedToday).toFixed(1).replace(".", ",")} godz.
                    </span>
                  ) : zaplanowane.length > 0 ? (
                    /* Trzeci stan obok "od HH:MM" (trwa) i "N godz."
                       (skończone): o której ma dziś być wg grafiku. */
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#E4F3E0] text-[#2F5E2A]">
                      o {trimTime(zaplanowane[0].start_time)}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {activeUsers.length === 0 && (
              <div className="text-center py-10 text-[#8F8E86]">
                <AlertCircle className="mx-auto mb-2 opacity-40" size={40} />
                Brak przypisanych pracowników.
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  // ==========================================
  // EKRAN: PIN — blokada wybranego pracownika
  // ==========================================
  if (screen === "PIN") {
    return (
      <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
        <div className="w-full max-w-md bg-white h-full flex flex-col shadow-lg overflow-hidden">
          <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center gap-3 flex-shrink-0">
            <button
              onClick={goList}
              className="flex items-center gap-1 border-2 border-[#B7B6AE] rounded font-['Archivo'] font-bold text-sm px-3 py-2 text-[#171714]"
            >
              <ChevronLeft size={16} strokeWidth={2.5} /> Zmień
            </button>
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
              {pinTarget?.name}
            </span>
          </header>
          <main className="flex-1 overflow-y-auto px-5 pt-10 pb-5 flex flex-col items-center text-center">
            <div className="w-[60px] h-[60px] rounded-full bg-[#E7E7E2] flex items-center justify-center text-[#171714] mb-5">
              <Lock size={26} />
            </div>
            <div className="font-['Archivo'] font-extrabold text-2xl text-[#171714]">
              Ten profil jest zablokowany
            </div>
            <div className="text-sm text-[#6E6E66] mt-2 max-w-[260px]">
              {pinTarget?.name} zabezpieczył(a) profil PIN-em. Wpisz 4 cyfry,
              żeby otworzyć.
            </div>
            <div className="flex gap-4 mt-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-[18px] h-[18px] rounded-full border-[2.5px] ${
                    pinError ? "border-[#DE3A22]" : "border-[#171714]"
                  } ${
                    i < pinEntered.length
                      ? pinError
                        ? "bg-[#DE3A22]"
                        : "bg-[#171714]"
                      : "bg-transparent"
                  }`}
                />
              ))}
            </div>
            <div
              className={`h-5 mt-3.5 text-[13px] font-semibold ${
                pinError ? "text-[#DE3A22]" : "text-[#171714]"
              }`}
            >
              {pinError ? "Niepoprawny PIN, spróbuj ponownie" : ""}
            </div>
            <div className="grid grid-cols-3 gap-3.5 mt-7 w-full max-w-[280px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <button
                  key={k}
                  onClick={() => handlePinDigit(k)}
                  className="aspect-square border-2 border-[#B7B6AE] rounded-full bg-[#F1F1EE] font-['Archivo'] font-bold text-xl text-[#171714] flex items-center justify-center"
                >
                  {k}
                </button>
              ))}
              <div />
              <button
                onClick={() => handlePinDigit("0")}
                className="aspect-square border-2 border-[#B7B6AE] rounded-full bg-[#F1F1EE] font-['Archivo'] font-bold text-xl text-[#171714] flex items-center justify-center"
              >
                0
              </button>
              <button
                onClick={() => handlePinDigit("back")}
                className="aspect-square border-2 border-[#B7B6AE] rounded-full bg-[#F1F1EE] flex items-center justify-center text-[#171714]"
              >
                <Delete size={20} />
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (screen === "SESSION" && selectedEmployee) {
    return (
      <EmployeeSessionScreens
        key={selectedEmployee.id}
        employee={selectedEmployee}
        lokaleOptions={lokaleAllowed}
        stanowiskaOptions={stanowiskaAllowed}
        shifts={shifts}
        setShifts={setShifts}
        showMsg={showMsg}
        myNotifications={myNotifications}
        unreadCount={unreadCount}
        setNotifications={setNotifications}
        showEmployeeNameInMessages={false}
        issues={issues}
        setIssues={setIssues}
        tasks={tasks}
        taskCompletions={taskCompletions}
        setTaskCompletions={setTaskCompletions}
        absences={absences}
        planShifts={planShifts}
        shiftSwaps={shiftSwaps}
        setShiftSwaps={setShiftSwaps}
        setAbsences={setAbsences}
        onBack={goList}
        onLogout={() => setCurrentView("login")}
        deviceNote="To urządzenie zostaje zalogowane na stałe — nie wylogowuj go bez potrzeby, bo trzeba będzie zalogować się ponownie danymi kiosku."
      />
    );
  }

  return null;
};

export default KioskDashboard;
