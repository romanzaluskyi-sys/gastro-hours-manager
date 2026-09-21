// @ts-nocheck
import React, { useState, useEffect } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";
import { isConfigured } from "./config";
import { api } from "./api/supabase";
import { ustawKontekstBledow } from "./api/errors";
import {
  wczytajSesje,
  wczytajKonto,
  widokDlaRoli,
  token,
  wyloguj,
} from "./api/auth";
import { toLocalYMD } from "./api/googleSheets";
import LoginScreen from "./components/LoginScreen";
import PersonalDashboard from "./components/PersonalDashboard";
import KioskDashboard from "./components/KioskDashboard";
import ManagerDashboard from "./components/ManagerDashboard";
import UpdateBanner from "./components/UpdateBanner";
import KonfiguracjaBrak from "./components/KonfiguracjaBrak";

// Sesję trzyma od 0.42.0 SUPABASE AUTH (patrz api/auth.ts), a nie własny wpis
// w localStorage. Różnica nie jest kosmetyczna: dotąd "zalogowany" znaczyło
// tylko tyle, że w przeglądarce leży obiekt z rolą — dopisanie sobie tam
// `role: "admin"` wystarczyło, żeby zobaczyć panel kierownika. Teraz
// tożsamość niesie token podpisany przez serwer.
//
// ⚠️ Stary klucz `gastro_session` czyścimy przy starcie. Był otagowany
// wersją aplikacji, bo podbicie APP_VERSION było JEDYNYM sposobem na
// "wyloguj wszystkich" (nie było tabeli sesji). Dziś sesje żyją w Supabase,
// ale ten wpis zostałby na urządzeniach w nieskończoność — razem z imieniem,
// rolą i lokalem.
const STARY_KLUCZ_SESJI = "gastro_session";

export default function App() {
  const [users, setUsers] = useState([]);
  const [lokale, setLokale] = useState([]);
  const [stanowiska, setStanowiska] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [issues, setIssues] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [shiftEdits, setShiftEdits] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskBlocks, setTaskBlocks] = useState([]);
  const [taskCompletions, setTaskCompletions] = useState([]);
  const [absences, setAbsences] = useState([]);
  // Dziennik dnia ("Puls") — karta, wpisy i szablony wpisów.
  const [dayLogs, setDayLogs] = useState([]);
  const [dayLogEntries, setDayLogEntries] = useState([]);
  const [dayLogTemplates, setDayLogTemplates] = useState([]);
  const [weatherForecasts, setWeatherForecasts] = useState([]);
  // Grafik (patrz docs/GRAFIK.md) — plan zmian, wymagania obsady, godziny
  // otwarcia, wyjątki i giełda zmian.
  const [planShifts, setPlanShifts] = useState([]);
  const [staffingRules, setStaffingRules] = useState([]);
  const [staffingRuleSets, setStaffingRuleSets] = useState([]);
  const [lokaleGodziny, setLokaleGodziny] = useState([]);
  const [grafikWyjatki, setGrafikWyjatki] = useState([]);
  const [shiftSwaps, setShiftSwaps] = useState([]);
  // Budżet Grafiku (0.39.0): cele na dzień tygodnia (wersjonowane miesięcznie)
  // i wyjątki na konkretne daty. Patrz utils/budzet.ts.
  const [budzetCele, setBudzetCele] = useState([]);
  const [budzetDni, setBudzetDni] = useState([]);

  const [currentView, setCurrentView] = useState("login");
  const [currentUser, setCurrentUser] = useState(null);
  // Dopóki trwa, nie pokazujemy NICZEGO. Ekran logowania mignięty na sekundę
  // przy każdym odświeżeniu wygląda jak wylogowanie — a na tablecie, który
  // ktoś odświeża w środku zmiany, to wystarczy, żeby przestać ufać systemowi.
  const [bootowanie, setBootowanie] = useState(true);
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

  // Wznowienie sesji przy starcie: token leży w localStorage, ale kim jest
  // jego właściciel, wie dopiero baza.
  useEffect(() => {
    (async () => {
      try {
        try {
          localStorage.removeItem(STARY_KLUCZ_SESJI);
        } catch (e) {
          /* tryb prywatny — nie ma czego sprzątać */
        }
        if (!isConfigured) return;
        const sesja = wczytajSesje();
        if (!sesja?.user_id) return;
        // ⚠️ `token()` odświeży wygasły dostęp albo zwróci null, gdy sesji już
        // nie ma. Bez tego pierwsze zapytanie poleciałoby z martwym tokenem.
        if (!(await token())) return;
        const user = await wczytajKonto(api, sesja.user_id);
        setCurrentUser(user);
        setCurrentView(widokDlaRoli(user));
      } catch (e) {
        // Konto bez kartoteki, nieaktywne albo brak sieci — zostajemy na
        // ekranie logowania. ⚠️ Sesję trzeba przy tym zamknąć, inaczej przy
        // każdym odświeżeniu wracamy tu po to samo.
        await wyloguj();
        setDbError(e.message || "Nie udało się wznowić sesji.");
      } finally {
        setBootowanie(false);
      }
    })();
  }, []);

  // Wylogowanie. Dashboardy sygnalizują je jedynym gestem, jaki znały od
  // zawsze — `setCurrentView("login")`. Zamieniamy to tutaj, w JEDNYM
  // miejscu, na prawdziwe zamknięcie sesji; przepisywanie pięciu wywołań w
  // komponentach (dwa z nich w dashboardach trzymanych już tylko jako
  // rollback) dałoby pięć okazji do zapomnienia.
  useEffect(() => {
    if (currentView !== "login" || !currentUser) return;
    setCurrentUser(null);
    wyloguj();
  }, [currentView, currentUser]);

  // ⚠️ Dane pobieramy DOPIERO po zalogowaniu. Do 0.41.2 leciało to przy
  // starcie, bo ekran logowania potrzebował tabeli `users` do porównania
  // PIN-u — czyli każdy, kto otworzył stronę, dostawał całą kartotekę, zanim
  // cokolwiek wpisał. Teraz nie ma po co, a od Etapu 3c nie będzie i czym:
  // polityki przestaną wydawać dane anonimowym.
  useEffect(() => {
    if (!isConfigured || !currentUser) return;
    const fetchData = async () => {
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
    // `users` też musi się odświeżać, z tego samego powodu co `shifts` (patrz
    // komentarz przy loadShifts niżej): Tablet Służbowy stoi zalogowany
    // tygodniami. Bez tego osoba dodana na próbę z drugiego urządzenia nie
    // pojawiłaby się na liście, a odrzucona nadal by na niej stała i dalej
    // odbijała godziny. Tabela ma kilkadziesiąt wierszy, więc to tani zapyt.
    const loadUsers = () => {
      api
        .get("users")
        .then((u) => setUsers(Array.isArray(u) ? u : []))
        .catch((err) => {
          console.error("Błąd pobierania pracowników:", err.message || err);
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

    // tasks/task_completions (Zadania i sprzątanie) — ten sam wzorzec co
    // shift_edits wyżej: osobno, poza głównym Promise.all, żeby błąd tu nie
    // blokował reszty apki.
    api
      .get("tasks")
      .then((t) => setTasks(Array.isArray(t) ? t : []))
      .catch((err) => {
        console.error("Błąd pobierania zadań:", err.message || err);
      });
    api
      .get("task_blocks")
      .then((b) => setTaskBlocks(Array.isArray(b) ? b : []))
      .catch((err) => {
        console.error("Błąd pobierania bloków zadań:", err.message || err);
      });
    api
      .get("task_completions")
      .then((tc) => setTaskCompletions(Array.isArray(tc) ? tc : []))
      .catch((err) => {
        console.error("Błąd pobierania wykonań zadań:", err.message || err);
      });

    // absences (wnioski o wolne/urlop) — ten sam wzorzec co tasks wyżej:
    // osobno, poza głównym Promise.all, żeby błąd tu nie blokował reszty.
    api
      .get("absences")
      .then((a) => setAbsences(Array.isArray(a) ? a : []))
      .catch((err) => {
        console.error("Błąd pobierania wniosków o wolne:", err.message || err);
      });

    // Dziennik dnia — ten sam wzorzec co absences/tasks wyżej: osobno i
    // nieblokująco. weather_forecasts przycinamy do ostatnich 120 dni: tabela
    // rośnie o kilkadziesiąt wierszy dziennie na każde miasto, a karta dnia i
    // tak patrzy tylko wstecz — ściąganie całej historii przy każdym otwarciu
    // apki byłoby czystym marnowaniem transferu.
    const dziennikOd = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 120);
      return toLocalYMD(d);
    })();
    [
      ["day_logs", setDayLogs, `date=gte.${dziennikOd}`],
      ["day_log_entries", setDayLogEntries, `date=gte.${dziennikOd}`],
      ["day_log_templates", setDayLogTemplates, null],
      ["weather_forecasts", setWeatherForecasts, `target_date=gte.${dziennikOd}`],
    ].forEach(([tabela, setter, filtr]) => {
      api
        .get(tabela, filtr)
        .then((rows) => setter(Array.isArray(rows) ? rows : []))
        .catch((err) => {
          console.error(`Błąd pobierania ${tabela}:`, err.message || err);
        });
    });

    // Grafik — osiem tabel, ten sam wzorzec co absences/tasks wyżej: każda
    // osobno i nieblokująco, żeby brak którejkolwiek (albo błąd RLS) nie
    // zatrzymał logowania i reszty apki.
    const loadGrafik = () => {
      const pairs = [
        ["grafik_shifts", setPlanShifts],
        ["staffing_rules", setStaffingRules],
        ["staffing_rule_sets", setStaffingRuleSets],
        ["lokale_godziny", setLokaleGodziny],
        ["grafik_wyjatki", setGrafikWyjatki],
        ["shift_swaps", setShiftSwaps],
        ["grafik_budzet_cele", setBudzetCele],
        ["grafik_budzet_dni", setBudzetDni],
      ];
      pairs.forEach(([table, setter]) => {
        api
          .get(table)
          .then((rows) => setter(Array.isArray(rows) ? rows : []))
          .catch((err) => {
            console.error(`Błąd pobierania ${table}:`, err.message || err);
          });
      });
    };
    loadGrafik();

    // ⚠️ Odbicia też muszą się odświeżać, nie tylko powiadomienia.
    //
    // `shifts` były pobierane RAZ, przy montowaniu, i nigdy więcej — a Tablet
    // Służbowy z założenia stoi w lokalu zalogowany tygodniami. Jego kopia
    // odbić pochodziła więc z ostatniego przeładowania strony, przez co
    // WSZYSTKIE zabezpieczenia czytające ten stan były ślepe na to, co zapisano
    // gdzie indziej: findOverlappingShift nie widział kolizji, a "Dziś już
    // zarejestrowano..." nie pokazywało niczego. 13.09 skończyło się to dwiema
    // zmianami wpisanymi po raz drugi (Natalia i Katia, 29 minut później, z
    // innej sesji) — człowiek nie zobaczył dowodu, że pierwszy wpis istnieje.
    //
    // Pobieramy tylko OKNO ostatnich trzech tygodni: tyle wystarczy wszystkim
    // kontrolom, a cała tabela to prawie trzy tysiące wierszy i ciągnięcie jej
    // co 45 s na każdym urządzeniu byłoby rozrzutnością.
    const OKNO_ODSWIEZANIA_DNI = 21;
    const loadShifts = () => {
      const od = new Date(Date.now() - OKNO_ODSWIEZANIA_DNI * 86400000);
      const granica = od.toISOString();
      api
        .get("shifts", `start_time=gte.${granica}`)
        .then((sh) => {
          const swieze = (Array.isArray(sh) ? sh : []).map((shift) => ({
            ...shift,
            start_time: new Date(shift.start_time),
            end_time: shift.end_time ? new Date(shift.end_time) : null,
          }));
          // Wiersze SPRZED okna zostają nietknięte (raport miesięczny i
          // Raporty i koszty sięgają dalej wstecz). Wewnątrz okna świeży wynik
          // zastępuje stary w całości — dzięki temu wiersz usunięty przez
          // kierownika naprawdę znika, zamiast zostać na ekranie do końca sesji.
          setShifts((stare) => [
            ...stare.filter((s) => s.start_time < od),
            ...swieze,
          ]);
        })
        .catch(() => {});
    };

    // Odświeżamy co 45s, żeby już otwarta sesja też widziała zmiany bez
    // konieczności przeładowania strony.
    const pollInterval = setInterval(() => {
      loadNotifications();
      loadIssues();
      loadShifts();
      loadUsers();
    }, 45000);
    return () => clearInterval(pollInterval);
  }, [currentUser?.id]);

  // Kto i na którym ekranie — dopisywane do każdego zapisu w app_errors.
  // Bez tego dziennik błędów mówi "coś się wywaliło" i nic poza tym, a przy
  // kilku lokalach to za mało, żeby cokolwiek odtworzyć.
  useEffect(() => {
    ustawKontekstBledow({
      user_name: currentUser ? currentUser.name : null,
      rola: currentUser ? currentUser.role : null,
      lokal: currentUser ? currentUser.default_lokal : null,
      ekran: currentView,
    });
  }, [currentUser, currentView]);

  // ⚠️ PRZED całą resztą renderu. Bez konfiguracji nie ma czego pobrać, więc
  // ekran logowania stałby pusty i mówił "Nieprawidłowe dane" na poprawny PIN
  // — diagnoza, która kosztuje godzinę zamiast sekundy. Patrz config.ts.
  if (!isConfigured) return <KonfiguracjaBrak />;

  // Patrz `bootowanie` wyżej: lepiej pusty ekran przez chwilę niż ekran
  // logowania, który zaraz sam zniknie.
  if (bootowanie) {
    return (
      <div className="min-h-screen bg-[#F1F1EE] flex items-center justify-center font-['Archivo'] font-bold text-[#8F8E86]">
        Wczytywanie…
      </div>
    );
  }

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
      <UpdateBanner />
      {currentView === "login" && (
        <LoginScreen
          setCurrentUser={setCurrentUser}
          setCurrentView={setCurrentView}
          dbError={dbError}
        />
      )}
      {currentView === "closed_dashboard" && (
        <PersonalDashboard
          currentUser={currentUser}
          setCurrentView={setCurrentView}
          lokale={lokale}
          stanowiska={stanowiska}
          users={users}
          shifts={shifts}
          setShifts={setShifts}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          tasks={tasks}
          taskBlocks={taskBlocks}
          dayLogEntries={dayLogEntries}
          setDayLogEntries={setDayLogEntries}
          dayLogTemplates={dayLogTemplates}
          dayLogs={dayLogs}
          taskCompletions={taskCompletions}
          setTaskCompletions={setTaskCompletions}
          absences={absences}
          setAbsences={setAbsences}
          planShifts={planShifts}
          shiftSwaps={shiftSwaps}
          setShiftSwaps={setShiftSwaps}
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
          setUsers={setUsers}
          issues={issues}
          setIssues={setIssues}
          notifications={notifications}
          setNotifications={setNotifications}
          tasks={tasks}
          taskBlocks={taskBlocks}
          dayLogEntries={dayLogEntries}
          setDayLogEntries={setDayLogEntries}
          dayLogTemplates={dayLogTemplates}
          dayLogs={dayLogs}
          taskCompletions={taskCompletions}
          setTaskCompletions={setTaskCompletions}
          absences={absences}
          setAbsences={setAbsences}
          planShifts={planShifts}
          shiftSwaps={shiftSwaps}
          setShiftSwaps={setShiftSwaps}
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
          tasks={tasks}
          taskBlocks={taskBlocks}
          setTaskBlocks={setTaskBlocks}
          setTasks={setTasks}
          taskCompletions={taskCompletions}
          setTaskCompletions={setTaskCompletions}
          dayLogs={dayLogs}
          setDayLogs={setDayLogs}
          dayLogEntries={dayLogEntries}
          setDayLogEntries={setDayLogEntries}
          dayLogTemplates={dayLogTemplates}
          setDayLogTemplates={setDayLogTemplates}
          weatherForecasts={weatherForecasts}
          absences={absences}
          setAbsences={setAbsences}
          planShifts={planShifts}
          setPlanShifts={setPlanShifts}
          staffingRules={staffingRules}
          setStaffingRules={setStaffingRules}
          staffingRuleSets={staffingRuleSets}
          setStaffingRuleSets={setStaffingRuleSets}
          lokaleGodziny={lokaleGodziny}
          setLokaleGodziny={setLokaleGodziny}
          grafikWyjatki={grafikWyjatki}
          setGrafikWyjatki={setGrafikWyjatki}
          shiftSwaps={shiftSwaps}
          setShiftSwaps={setShiftSwaps}
          budzetCele={budzetCele}
          setBudzetCele={setBudzetCele}
          budzetDni={budzetDni}
          setBudzetDni={setBudzetDni}
          showMsg={showMsg}
        />
      )}
    </div>
  );
}
