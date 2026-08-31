// @ts-nocheck
import React from "react";
import { EmployeeSessionScreens } from "./employeeSessionShared";

// ==========================================
// OSOBISTY TELEFON PRACOWNIKA — nowy design, ten sam język co
// KioskDashboard.tsx ("Tablet Służbowy"), patrz CLAUDE.md.
// Zastępuje ClosedEmployeeDashboard w widoku "closed_dashboard" (App.tsx),
// dla ról `closed` i `open`. ClosedEmployeeDashboard.tsx pozostaje
// nietknięty w repo jako łatwy rollback.
//
// W przeciwieństwie do kiosku: `currentUser` TO JUŻ jest konkretny
// pracownik (nie wspólne urządzenie z listą do wyboru) — więc od razu
// renderujemy `EmployeeSessionScreens` bez ekranu wyboru/PIN-u. Stąd też
// `onBack` jest pominięty (nie ma do czego "wracać") — Shell nie pokazuje
// "< Zmień", a "Więcej" nie pokazuje "Wróć do listy osób". Blokada PIN-em
// na kiosku (`kiosk_pin`) to koncepcja czysto kioskowa — tu się nie
// stosuje, konto i tak jest chronione własnym Email+PIN przy logowaniu.
//
// Lokal/stanowisko: przekazujemy PEŁNE `lokale`/`stanowiska` (bez
// filtrowania przez `allowed_lokale`, którego personalne konto zwykle nie
// ma) — dokładnie tak jak stary ClosedEmployeeDashboard.tsx robił to dla
// TimeEntryForm.
// ==========================================

const PersonalDashboard = ({
  currentUser,
  setCurrentView,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  issues,
  setIssues,
  notifications,
  setNotifications,
  showMsg,
}) => {
  const myNotifications = notifications.filter(
    (n) => n.user_name === currentUser.name
  );
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  return (
    <EmployeeSessionScreens
      employee={currentUser}
      lokaleOptions={lokale}
      stanowiskaOptions={stanowiska}
      shifts={shifts}
      setShifts={setShifts}
      showMsg={showMsg}
      myNotifications={myNotifications}
      unreadCount={unreadCount}
      setNotifications={setNotifications}
      showEmployeeNameInMessages={false}
      issues={issues}
      setIssues={setIssues}
      onLogout={() => setCurrentView("login")}
    />
  );
};

export default PersonalDashboard;
