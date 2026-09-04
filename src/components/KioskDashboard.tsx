// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Lock, AlertCircle, Delete, ChevronLeft } from "lucide-react";
import { getTodaysShiftsForUser } from "../utils/shifts";
import {
  fmtHHMM,
  sumHours,
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
  // Kiosk to wspólne urządzenie — powiadomienia dla WSZYSTKICH pracowników
  // przypisanych do lokalu, nie tylko wybranego (patrz CLAUDE.md).
  const activeNames = new Set(activeUsers.map((u) => u.name));
  const myNotifications = notifications.filter((n) =>
    activeNames.has(n.user_name)
  );
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  const lokaleAllowed = lokale.filter((l) => allowed.includes(l.name));
  const stanowiskaAllowed = stanowiska.filter((s) =>
    allowed.includes(s.lokal_name)
  );

  const workingCount = activeUsers.filter((u) =>
    shifts.some((s) => s.user_id === u.id && !s.end_time)
  ).length;
  const notYetCount = activeUsers.length - workingCount;

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
                ? `${workingCount} os. na zmianie, ${notYetCount} jeszcze nie odbiło`
                : "Brak przypisanych pracowników"}
            </div>
            {activeUsers.map((u) => {
              const empOpen = shifts.find(
                (s) => s.user_id === u.id && !s.end_time
              );
              const empClosedToday = getTodaysShiftsForUser(shifts, u.id).filter(
                (s) => s.end_time
              );
              return (
                <button
                  key={u.id}
                  onClick={() => selectEmployee(u)}
                  className="border-2 border-[#B7B6AE] rounded bg-[#F1F1EE] p-4 flex items-center justify-between gap-3 w-full text-left mb-3.5"
                >
                  <div className="min-w-0">
                    <div className="font-['Archivo'] font-extrabold text-[21px] text-[#171714] flex items-center gap-1.5">
                      {u.name}{" "}
                      {u.kiosk_pin && <Lock size={14} strokeWidth={2.3} />}
                    </div>
                    <div className="text-[13px] text-[#6E6E66] mt-0.5">
                      {u.default_stanowisko || ""}
                    </div>
                  </div>
                  {empOpen ? (
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#FAEAE6] text-[#8A3A2B]">
                      od {fmtHHMM(empOpen.start_time)}
                    </span>
                  ) : empClosedToday.length > 0 ? (
                    <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#EAEAE5] text-[#4A4A43]">
                      {sumHours(empClosedToday).toFixed(1).replace(".", ",")} godz.
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
        showEmployeeNameInMessages={true}
        issues={issues}
        setIssues={setIssues}
        tasks={tasks}
        taskCompletions={taskCompletions}
        setTaskCompletions={setTaskCompletions}
        absences={absences}
        planShifts={planShifts}
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
