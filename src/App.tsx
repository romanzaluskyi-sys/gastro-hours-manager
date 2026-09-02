// @ts-nocheck
import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { isConfigured, APP_VERSION } from "./config";
import { api } from "./api/supabase";
import LoginScreen from "./components/LoginScreen";
import PersonalDashboard from "./components/PersonalDashboard";
import KioskDashboard from "./components/KioskDashboard";
import ManagerDashboard from "./components/ManagerDashboard";

// Trzyma zalogowanego użytkownika w localStorage, żeby odświeżenie strony
// nie wylogowywało — bez tego sesja żyła tylko w pamięci Reacta. `pin`
// świadomie pomijamy przy zapisie, nie jest już potrzebny po zalogowaniu.
//
// Sesja jest też otagowana wersją apki (`appVersion`, patrz APP_VERSION w
// config.ts). Loginy/widoki nie sprawdzają się z serwerem — nie ma tabeli
// sesji w bazie, więc nie da się "wylogować wszystkich" zapytaniem SQL.
// Zamiast tego: przy każdym MINOR/MAJOR bumpie APP_VERSION (patrz
// "Wersjonowanie i CHANGELOG" w CLAUDE.md) stara, zapisana sesja przestaje
// pasować i zostaje odrzucona — użytkownik ląduje z powrotem na ekranie
// logowania, świeży JS bundle jest już wtedy pobrany. To NIE działa samo z
// siebie na już otwartej karcie przeglądarki (kiosk musi dostać
// odświeżenie/reload, żeby w ogóle pobrać nowy bundle) — dopiero PO
// odświeżeniu ten mechanizm gwarantuje czysty ekran logowania zamiast
// starej sesji.
const SESSION_KEY = "gastro_session";

const loadSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { currentUser: null, currentView: "login" };
    const parsed = JSON.parse(raw);
    if (parsed.appVersion !== APP_VERSION) {
      localStorage.removeItem(SESSION_KEY);
      return { currentUser: null, currentView: "login" };
    }
    return parsed;
  } catch {
    return { currentUser: null, currentView: "login" };
  }
};

export default function App() {
  const [users, setUsers] = useState([]);
  const [lokale, setLokale] = useState([]);
  const [stanowiska, setStanowiska] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [issues, setIssues] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [shiftEdits, setShiftEdits] = useState([]);

  const [currentView, setCurrentView] = useState(() => loadSession().currentView);
  const [currentUser, setCurrentUser] = useState(() => loadSession().currentUser);
  const [isLoading, setIsLoading] = useState(false);
  const [dbError, setDbError] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const showMsg = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false }), 3000);
  };

  // Zapisuje sesję przy każdej zmianie loginu/widoku. "Wyloguj" w każdym
  // dashboardzie ustawia tylko currentView na "login" (nie czyści
  // currentUser) — tu i tak usuwamy zapisaną sesję, gdy widok wraca do
  // ekranu logowania, więc osobne czyszczenie currentUser nie jest potrzebne.
  useEffect(() => {
    try {
      if (currentUser && currentView !== "login") {
        const { pin, ...userToStore } = currentUser;
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            currentUser: userToStore,
            currentView,
            appVersion: APP_VERSION,
          })
        );
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // localStorage niedostępny (np. tryb prywatny) — sesja po prostu nie
      // przetrwa odświeżenia, reszta apki działa normalnie.
    }
  }, [currentUser, currentView]);

  useEffect(() => {
    if (!isConfigured) return;
    const fetchData = async () => {
      setIsLoading(true);
      setDbError("");
      try {
        const [u, l, s, sh, i] = await Promise.all([
          api.get("users"),
          api.get("lokale"),
          api.get("stanowiska"),
          api.get("shifts"),
          api.get("issues"),
        ]);

        const parsedShifts = (Array.isArray(sh) ? sh : []).map((shift) => ({
          ...shift,
          start_time: new Date(shift.start_time),
          end_time: shift.end_time ? new Date(shift.end_time) : null,
        }));
        setUsers(Array.isArray(u) ? u : []);
        setLokale(Array.isArray(l) ? l : []);
        setStanowiska(Array.isArray(s) ? s : []);
        setShifts(parsedShifts);
        setIssues(Array.isArray(i) ? i : []);
      } catch (err) {
        setDbError(err.message || "Błąd bazy.");
      }
      setIsLoading(false);
    };
    fetchData();

    // Powiadomienia ładujemy osobno - brak tabeli w bazie nie blokuje reszty apki
    const loadNotifications = () => {
      api
        .get("notifications")
        .then((n) => setNotifications(Array.isArray(n) ? n : []))
        .catch((err) => {
          console.error("Błąd pobierania powiadomień:", err.message || err);
          setNotifications([]);
        });
    };
    // Zgłoszenia (issues) odświeżamy tym samym rytmem, żeby otwarty Panel
    // Kierownika zobaczył nową korektę godzin od pracownika bez ręcznego
    // odświeżenia strony (patrz "Zatwierdzanie zmian").
    const loadIssues = () => {
      api
        .get("issues")
        .then((i) => setIssues(Array.isArray(i) ? i : []))
        .catch((err) => {
          console.error("Błąd pobierania zgłoszeń:", err.message || err);
        });
    };
    loadNotifications();

    // shift_edits (audit trail korekt) — ładujemy raz, bez pollingu: rośnie
    // tylko przez akcję samego kierownika w tej samej sesji (Zatwierdzanie
    // zmian), więc lokalny dopisek po zatwierdzeniu wystarczy. Osobno od
    // głównego Promise.all z tego samego powodu co notifications — błąd
    // tu nie może zablokować reszty apki.
    api
      .get("shift_edits")
      .then((se) => setShiftEdits(Array.isArray(se) ? se : []))
      .catch((err) => {
        console.error("Błąd pobierania historii korekt:", err.message || err);
      });

    // Odświeżamy co 45s, żeby już otwarta sesja też widziała zmiany bez
    // konieczności przeładowania strony.
    const pollInterval = setInterval(() => {
      loadNotifications();
      loadIssues();
    }, 45000);
    return () => clearInterval(pollInterval);
  }, []);

  return (
    <div className="font-sans text-gray-900">
      {toast.show && (
        <div
          className={`fixed top-4 right-4 p-4 rounded-lg shadow-2xl z-[100] flex items-center gap-3 font-bold animate-bounce ${
            toast.type === "error"
              ? "bg-red-500 text-white"
              : "bg-green-500 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle size={20} />
          ) : (
            <CheckCircle size={20} />
          )}{" "}
          {toast.message}
        </div>
      )}
      {currentView === "login" && (
        <LoginScreen
          users={users}
          setCurrentUser={setCurrentUser}
          setCurrentView={setCurrentView}
          isLoading={isLoading}
          dbError={dbError}
        />
      )}
      {currentView === "closed_dashboard" && (
        <PersonalDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          lokale={lokale}
          stanowiska={stanowiska}
          shifts={shifts}
          setShifts={setShifts}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          showMsg={showMsg}
        />
      )}
      {currentView === "open_dashboard" && (
        <KioskDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          lokale={lokale}
          stanowiska={stanowiska}
          shifts={shifts}
          setShifts={setShifts}
          users={users}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          showMsg={showMsg}
        />
      )}
      {currentView === "manager_dashboard" && (
        <ManagerDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          users={users}
          setUsers={setUsers}
          lokale={lokale}
          setLokale={setLokale}
          stanowiska={stanowiska}
          setStanowiska={setStanowiska}
          shifts={shifts}
          setShifts={setShifts}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          shiftEdits={shiftEdits}
          setShiftEdits={setShiftEdits}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}
