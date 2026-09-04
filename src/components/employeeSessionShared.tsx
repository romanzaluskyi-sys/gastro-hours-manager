// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Home,
  Clock,
  FileText,
  ClipboardCheck,
  MoreHorizontal,
  Bell,
  CalendarDays,
  Flag,
  ChevronLeft,
  ChevronDown,
  Check,
} from "lucide-react";
import { api } from "../api/supabase";
import { sendToGoogleSheets, toLocalYMD } from "../api/googleSheets";
import { createManagerNotification } from "../api/notifications";
import { APP_VERSION } from "../config";
import { findOverlappingShift, getTodaysShiftsForUser } from "../utils/shifts";
import WeatherBadge from "./WeatherBadge";
import {
  getDayOfWeek,
  getMonthName,
  getAvailableYears,
  formatNotificationText,
} from "../utils/format";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../utils/stanowiska";
import {
  trimTime,
  mondayOf,
  addDaysYMD,
  shiftHours,
  publishedShiftsFor,
  publishedShiftsOnDay,
  nextShiftFrom,
} from "../utils/grafik";
import {
  buildEmployeeChecklist,
  getEffectiveAssignmentForDate,
  toggleTaskCompletion,
  cyclicalProgress,
  weeklyChecklistStats,
} from "../utils/tasks";

// ==========================================
// Współdzielone między KioskDashboard.tsx (Tablet Służbowy, wspólne
// urządzenie) i PersonalDashboard.tsx (osobisty telefon, role closed/open).
// Wizualnie identyczny "mini-account" z 5 zakładkami (Pulpit/Zmiana/Raport/
// Zadania/Więcej) — jedyna różnica między dwoma konsumentami to obecność
// (albo nie) możliwości powrotu do listy pracowników (`onBack`), patrz
// CLAUDE.md sekcja "Tablet Służbowy — KioskDashboard".
// ==========================================

// Grafik dostał własną, stałą zakładkę zamiast wiersza w "Więcej" — to
// rzecz oglądana codziennie, a "Więcej" jest szufladą na rzeczy rzadkie
// (decyzja właściciela, patrz docs/GRAFIK.md, Runda 5).
export const TABS = [
  { key: "PULPIT", label: "Pulpit", Icon: Home },
  { key: "ZMIANA", label: "Zmiana", Icon: Clock },
  { key: "GRAFIK", label: "Grafik", Icon: CalendarDays },
  { key: "RAPORT", label: "Raport", Icon: FileText },
  { key: "ZADANIA", label: "Zadania", Icon: ClipboardCheck },
  { key: "WIECEJ", label: "Więcej", Icon: MoreHorizontal },
];

export const fmtHHMM = (d) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;

// "dziś" / "jutro" / "PON 8 wrz" — pracownik myśli dniami, nie datami,
// więc dwa najbliższe dni nazywamy po ludzku.
const DZIEN_SKROT = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];
export const opisDnia = (dateStr) => {
  const dzis = toLocalYMD(new Date());
  if (dateStr === dzis) return "dziś";
  const jutro = new Date();
  jutro.setDate(jutro.getDate() + 1);
  if (dateStr === toLocalYMD(jutro)) return "jutro";
  const d = new Date(dateStr + "T00:00:00");
  return `${DZIEN_SKROT[d.getDay()]} ${d.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  })}`;
};

export const sumHours = (arr) =>
  arr.reduce(
    (acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );

// Odznaka na wierszu zadania: dla cyklicznych częstotliwość/postęp, dla
// reszty przypisane stanowisko ("wszyscy", gdy brak — zadanie dla całego
// lokalu).
const taskBadgeLabel = (task, completions, dateStr) => {
  if (task.schedule_type === "cykliczne") {
    const prog = cyclicalProgress(task, completions, dateStr);
    return prog ? `${prog.daysSince}/${prog.cycleDays} dni` : `co ${task.cycle_days || 1} dni`;
  }
  return task.stanowisko || "wszyscy";
};

// --- klasy Tailwind wspólne dla wielu ekranów (język designu z prototypu:
// grube 2/2.5px obramowania, pogrubione nagłówki Archivo, czerwony akcent) ---
export const fieldLabelCls = "text-[13.5px] text-[#6E6E66] mb-2 block";
export const selectWrapCls = "relative";
export const selectElCls =
  "w-full appearance-none border-[2.5px] border-[#171714] rounded bg-[#E7E7E2] p-3.5 pr-10 font-['Archivo'] font-bold text-[17px] text-[#171714]";
export const selectChevronCls =
  "pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8F8E86]";
export const selectValCls = "font-['Archivo'] font-bold text-[17px] text-[#171714]";
export const staticBoxCls =
  "border-[2.5px] border-[#171714] rounded bg-[#E7E7E2] p-3.5 flex items-center justify-between";
export const timeHeroCls =
  "relative border-[2.5px] border-[#171714] rounded bg-[#F1F1EE] p-4 flex items-center justify-between gap-2.5";
export const timePlainCls =
  "relative border-[2.5px] border-[#171714] rounded bg-[#F1F1EE] p-4";
export const razemRowCls =
  "flex items-center justify-between bg-[#E7E7E2] rounded p-3.5";
export const helperTextCls = "text-[13.5px] text-[#6E6E66] leading-relaxed";
export const sectionLabelCls =
  "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]";
export const ruleStrongCls = "h-[2.5px] bg-[#171714] mt-2";
export const ruleSoftCls = "h-px bg-[#B7B6AE] mt-4";
export const ctaPrimaryCls =
  "flex items-center justify-center gap-2.5 bg-[#DE3A22] text-white rounded-md py-[18px] px-5 font-['Archivo'] font-extrabold text-lg w-full flex-shrink-0 active:scale-[0.99] disabled:opacity-60";
export const ctaSecondaryCls =
  "relative flex items-center justify-center bg-transparent text-[#171714] border-[2.5px] border-[#171714] rounded-md py-[15px] px-5 font-['Archivo'] font-bold text-base w-full flex-shrink-0 mt-2.5";
export const ctaSecondaryQuietCls =
  "relative flex items-center justify-center bg-transparent text-[#6E6E66] border-2 border-[#B7B6AE] rounded-md py-[15px] px-5 font-['Archivo'] font-bold text-base w-full flex-shrink-0 mt-2.5";
export const menuRowCls =
  "border-2 border-[#B7B6AE] rounded bg-[#F1F1EE] p-4 flex items-center gap-3.5 w-full text-left mb-3.5";
export const checkboxRowCls = (checked) =>
  `flex items-center gap-3 border-2 rounded p-3.5 w-full text-left ${
    checked ? "border-[2.5px] border-[#171714]" : "border-[#B7B6AE]"
  }`;

// Poza komponentami-konsumentami celowo — Shell był kiedyś zdefiniowany w
// środku komponentu z żywym zegarem (setInterval co 1s), przez co React
// remontował całe poddrzewo (i pola formularza w środku traciły focus) przy
// każdym ticku. Trzymaj Shell na poziomie modułu. `onBack` jest opcjonalny:
// gdy go brak (osobiste konto, nie ma do czego "wracać"), przycisk "<
// Zmień" po prostu się nie renderuje.
export const Shell = ({
  screen,
  setScreen,
  onBack,
  unreadCount,
  taskBadgeCount = 0,
  title,
  showPill = false,
  showBell = true,
  footer = null,
  children,
}) => {
  const activeTabKey = ["WIECEJ", "WIADOMOSCI", "ZGLOS"].includes(screen)
    ? "WIECEJ"
    : screen;
  return (
    <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-lg overflow-hidden">
        <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center justify-between gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 border-2 border-[#B7B6AE] rounded font-['Archivo'] font-bold text-sm px-3 py-2 text-[#171714] flex-shrink-0"
              >
                <ChevronLeft size={16} strokeWidth={2.5} /> Zmień
              </button>
            )}
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714] truncate">
              {title}
            </span>
          </div>
          {showPill ? (
            <span className="flex-shrink-0 bg-[#FAEAE6] text-[#8A3A2B] text-[13px] font-semibold px-3.5 py-2 rounded">
              na zmianie
            </span>
          ) : showBell ? (
            <button
              onClick={() => setScreen("WIADOMOSCI")}
              className="relative border-2 border-[#B7B6AE] rounded w-11 h-11 flex items-center justify-center text-[#171714] flex-shrink-0"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[11px] min-w-[18px] h-[18px] rounded flex items-center justify-center px-1">
                  {unreadCount}
                </span>
              )}
            </button>
          ) : null}
        </header>
        <main className="flex-1 overflow-y-auto px-5 pt-6 pb-5 flex flex-col">
          {children}
        </main>
        {footer}
        <nav className="flex border-t-[1.5px] border-[#B7B6AE] bg-white flex-shrink-0">
          {TABS.map(({ key, label, Icon }) => {
            const active = activeTabKey === key;
            return (
              <button
                key={key}
                onClick={() => setScreen(key)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 pb-3.5 relative border-t-[2.5px] ${
                  active
                    ? "text-[#DE3A22] border-[#DE3A22]"
                    : "text-[#8F8E86] border-transparent"
                }`}
              >
                <Icon size={20} />
                <span className="text-[11px] font-semibold">{label}</span>
                {key === "WIECEJ" && unreadCount > 0 && (
                  <span className="absolute top-1 right-[18%] bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[9.5px] min-w-[15px] h-[15px] rounded-[3px] flex items-center justify-center px-0.5">
                    {unreadCount}
                  </span>
                )}
                {key === "ZADANIA" && taskBadgeCount > 0 && (
                  <span className="absolute top-1 right-[18%] bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[9.5px] min-w-[15px] h-[15px] rounded-[3px] flex items-center justify-center px-0.5">
                    {taskBadgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

// Ekrany "wewnątrz sesji" jednego pracownika — Pulpit/Zmiana/Raport/
// Zadania/Więcej/Wiadomości/Zgłoś. Zamontuj z `key={employee.id}` w
// rodzicu, żeby przełączenie na innego pracownika (kiosk) zawsze
// startowało od czystego stanu (ekran "PULPIT", brak "justClosed" itd.).
//
// `onBack` (opcjonalny): gdy podany, w nagłówku pojawia się "< Zmień", a w
// "Więcej" wiersz "Wróć do listy osób". Gdy brak (osobiste konto — nie ma
// listy, do której wracać), oba znikają.
// `deviceNote` (opcjonalny React node): dodatkowa ramka "Uwaga" na dole
// "Więcej" (kiosk używa jej do ostrzeżenia o stałym zalogowaniu urządzenia;
// osobiste konto jej nie potrzebuje — pomiń).
// `showEmployeeNameInMessages`: przekazywane wprost do
// `formatNotificationText` — true na kiosku (wspólne urządzenie, trzeba
// wiedzieć czyje powiadomienie), false na koncie osobistym.
export const EmployeeSessionScreens = ({
  employee,
  lokaleOptions,
  stanowiskaOptions,
  shifts,
  setShifts,
  showMsg,
  myNotifications,
  unreadCount,
  setNotifications,
  showEmployeeNameInMessages,
  issues,
  setIssues,
  tasks,
  taskCompletions,
  setTaskCompletions,
  absences,
  setAbsences,
  planShifts,
  onBack,
  onLogout,
  deviceNote = null,
}) => {
  const [screen, setScreen] = useState("PULPIT");
  const [justClosed, setJustClosed] = useState(false);
  const [now, setNow] = useState(new Date());

  const [formLokal, setFormLokal] = useState(
    employee?.default_lokal || lokaleOptions[0]?.name || ""
  );
  const [formStanowisko, setFormStanowisko] = useState(
    employee?.default_stanowisko || ""
  );
  const [knowsEnd, setKnowsEnd] = useState(false);
  const [formStartTime, setFormStartTime] = useState(fmtHHMM(new Date()));
  const [formEndTime, setFormEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  const [raportMonth, setRaportMonth] = useState(new Date().getMonth());
  const [raportYear, setRaportYear] = useState(new Date().getFullYear());

  const [grafikZakres, setGrafikZakres] = useState("ten"); // ten | nast | miesiac
  const [grafikWszyscy, setGrafikWszyscy] = useState(false);

  const [zgType, setZgType] = useState("problem"); // "correction" | "problem"
  const [zgAnon, setZgAnon] = useState(false);
  const [zgShiftId, setZgShiftId] = useState("none");
  const [zgText, setZgText] = useState("");
  const [zgSaving, setZgSaving] = useState(false);
  const [zgSent, setZgSent] = useState(false);
  const [zgPrefillShiftId, setZgPrefillShiftId] = useState(null);

  // ---- "Popraw zmianę" (type: correction) — osobny zestaw pól, patrz handleSendKorekta ----
  const [zgCorrectionShiftId, setZgCorrectionShiftId] = useState("forgot"); // uuid zmiany albo "forgot"
  const [zgPropDate, setZgPropDate] = useState("");
  const [zgPropLokal, setZgPropLokal] = useState("");
  const [zgPropStanowisko, setZgPropStanowisko] = useState("");
  const [zgPropStart, setZgPropStart] = useState("");
  const [zgPropEnd, setZgPropEnd] = useState("");
  const [zgKorektaNote, setZgKorektaNote] = useState("");

  // ---- "Wniosek o wolne" (type: absence) — patrz handleSendAbsence ----
  const [zgAbsType, setZgAbsType] = useState("urlop"); // "urlop" | "niedostepnosc"
  const [zgAbsStart, setZgAbsStart] = useState("");
  const [zgAbsEnd, setZgAbsEnd] = useState("");
  const [zgAbsNote, setZgAbsNote] = useState("");

  // "own" = tylko wszyscy + moje stanowisko; "all" = wszystko dla lokalu
  // (przełącznik przydatny głównie na kiosku, gdzie kilka ról dzieli jedno
  // urządzenie) — patrz utils/tasks.ts buildEmployeeChecklist.
  const [taskViewMode, setTaskViewMode] = useState("own");

  const dostepneStanowiska = stanowiskaOptions.filter(
    (s) => s.lokal_name === formLokal
  );

  const openShift = shifts.find(
    (s) => s.user_id === employee.id && !s.end_time
  );
  const todaysClosedShifts = getTodaysShiftsForUser(shifts, employee.id).filter(
    (s) => s.end_time
  );

  // Checklisty zadań na dziś — "own" (własne stanowisko + wszyscy) do A7/A8
  // i domyślnego widoku Zadania, "all" tylko dla przełącznika na ekranie
  // Zadania. Wolno preferujemy otwartą zmianę nad statycznym default_lokal,
  // patrz getEffectiveAssignmentForDate w utils/tasks.ts.
  const todayStr = toLocalYMD(now);
  const effectiveAssignment = getEffectiveAssignmentForDate(
    employee,
    openShift ? [openShift] : todaysClosedShifts
  );
  const myChecklistOwn = buildEmployeeChecklist(
    tasks,
    taskCompletions,
    effectiveAssignment,
    todayStr,
    "own"
  );
  const myChecklistAll = buildEmployeeChecklist(
    tasks,
    taskCompletions,
    effectiveAssignment,
    todayStr,
    "all"
  );
  const taskBadgeCount = myChecklistOwn.filter((i) => !i.done).length;

  // Pracownik widzi tylko OPUBLIKOWANY grafik — wersja robocza kierownika
  // nie może tu przeciekać (filtruje publishedShiftsFor w utils/grafik.ts).
  const dzisYMD = toLocalYMD(new Date());
  const mojGrafik = publishedShiftsFor(planShifts, employee);
  const mojeDzis = mojGrafik.filter((s) => s.date === dzisYMD);
  const najblizszaZmiana = nextShiftFrom(planShifts, employee, dzisYMD);
  const myWeeklyStats = weeklyChecklistStats(
    tasks,
    taskCompletions,
    employee,
    shifts.filter((s) => s.user_id === employee.id),
    todayStr
  );

  const raportShifts = shifts
    .filter(
      (s) =>
        s.user_id === employee.id &&
        s.start_time.getMonth() === raportMonth &&
        s.start_time.getFullYear() === raportYear
    )
    .sort((a, b) => a.start_time - b.start_time);
  const raportTotal = raportShifts.reduce(
    (acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );

  const recentShiftsForZgloszenie = shifts
    .filter((s) => s.user_id === employee.id)
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, 8);

  // Jeśli żadne stanowisko nie pasuje do wybranego lokalu (np. rozjazd
  // nazwy lokalu w starszych/zmigrowanych danych zmiany), pokazujemy
  // wszystkie stanowiska zamiast blokować formularz pustą listą.
  const korektaStanowiskaMatching = stanowiskaOptions.filter(
    (s) => s.lokal_name === zgPropLokal
  );
  const korektaStanowiska =
    korektaStanowiskaMatching.length > 0
      ? korektaStanowiskaMatching
      : stanowiskaOptions;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const resetShiftForm = () => {
    setFormLokal(employee?.default_lokal || lokaleOptions[0]?.name || "");
    setFormStanowisko(employee?.default_stanowisko || "");
    setKnowsEnd(false);
    setFormStartTime(fmtHHMM(new Date()));
    setFormEndTime("");
  };

  // ---- korekta stanowiska, gdy zmienia się lokal (jak w TimeEntryForm) ----
  useEffect(() => {
    const dostepne = stanowiskaOptions.filter((s) => s.lokal_name === formLokal);
    if (!dostepne.find((s) => s.name === formStanowisko)) {
      setFormStanowisko(dostepne.length > 0 ? dostepne[0].name : "");
    }
  }, [formLokal, stanowiskaOptions]);

  // ---- to samo dla propozycji lokalu w formularzu "Popraw zmianę" ----
  // (z tym samym awaryjnym fallbackiem na pełną listę co korektaStanowiska)
  useEffect(() => {
    if (screen !== "ZGLOS" || zgType !== "correction") return;
    const matching = stanowiskaOptions.filter(
      (s) => s.lokal_name === zgPropLokal
    );
    const dostepne = matching.length > 0 ? matching : stanowiskaOptions;
    if (!dostepne.find((s) => s.name === zgPropStanowisko)) {
      setZgPropStanowisko(dostepne.length > 0 ? dostepne[0].name : "");
    }
  }, [zgPropLokal, stanowiskaOptions, screen, zgType]);

  // ---- oznaczanie powiadomień jako przeczytane ----
  useEffect(() => {
    if (screen !== "WIADOMOSCI") return;
    const unreadIds = myNotifications
      .filter((n) => !n.is_read)
      .map((n) => n.id);
    if (unreadIds.length === 0) return;
    api
      .patchByFilter("notifications", `id=in.(${unreadIds.join(",")})`, {
        is_read: true,
      })
      .then(() => {
        setNotifications((prev) =>
          prev.map((n) =>
            unreadIds.includes(n.id) ? { ...n, is_read: true } : n
          )
        );
      })
      .catch(() => {});
  }, [screen]);

  // ---- reset formularza Zgłoś przy wejściu na ekran ----
  useEffect(() => {
    if (screen === "ZGLOS") {
      // wejście przez chorągiewkę przy konkretnej zmianie (Raport) ⇒ od razu
      // "Popraw zmianę" z tą zmianą; wejście z "Więcej" (bez kontekstu) ⇒
      // domyślnie "Zgłoś problem", jak dotychczasowe "Zgłoś"
      setZgType(zgPrefillShiftId ? "correction" : "problem");
      setZgShiftId(zgPrefillShiftId || "none");
      setZgAnon(false);
      setZgSent(false);
      setZgText("");
      setZgKorektaNote("");
      setZgAbsType("urlop");
      setZgAbsStart("");
      setZgAbsEnd("");
      setZgAbsNote("");
      applyKorektaShiftDefaults(zgPrefillShiftId || "forgot");
    }
  }, [screen]);

  const openZgloszenie = (shiftId) => {
    setZgPrefillShiftId(shiftId || null);
    setScreen("ZGLOS");
  };

  // ---- wypełnia proponowane pola danymi z wybranej zmiany (punkt odniesienia
  // do poprawy) albo pustymi/domyślnymi wartościami dla "Zapomniałem odbić" ----
  const applyKorektaShiftDefaults = (shiftId) => {
    setZgCorrectionShiftId(shiftId);
    if (shiftId === "forgot") {
      setZgPropDate(toLocalYMD(new Date()));
      setZgPropLokal(employee?.default_lokal || lokaleOptions[0]?.name || "");
      setZgPropStanowisko(employee?.default_stanowisko || "");
      setZgPropStart("");
      setZgPropEnd("");
      return;
    }
    const s = recentShiftsForZgloszenie.find((sh) => sh.id === shiftId);
    if (!s) return;
    setZgPropDate(toLocalYMD(s.start_time));
    setZgPropLokal(s.lokal);
    setZgPropStanowisko(s.stanowisko);
    setZgPropStart(fmtHHMM(s.start_time));
    setZgPropEnd(s.end_time ? fmtHHMM(s.end_time) : "");
  };

  // ---- zamknięcie trwającej zmiany (jak TimeEntryForm.handleCloseShift) ----
  const handleCloseShift = async (customTime) => {
    if (!openShift) return;
    setSaving(true);
    let endD;
    if (customTime) {
      const [h, m] = customTime.split(":").map(Number);
      endD = new Date(openShift.start_time);
      endD.setHours(h, m, 0, 0);
      if (endD < openShift.start_time) endD.setDate(endD.getDate() + 1);
    } else {
      endD = new Date();
    }
    const hrs = parseFloat(
      ((endD - openShift.start_time) / 3600000).toFixed(2)
    );
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
      // Fire-and-forget — patrz komentarz w TimeEntryForm.tsx.
      sendToGoogleSheets(parsed, "EDIT_SHIFT");
      showMsg("Zmiana zakończona pomyślnie!");
      setJustClosed(true);
      setScreen("ZMIANA");
    } catch (err) {
      showMsg("Błąd połączenia z bazą!", "error");
    }
    setSaving(false);
  };

  // ---- utworzenie zmiany: sam start albo pełna zmiana (jak TimeEntryForm.handleCreateShift) ----
  const handleCreateShift = async () => {
    if (
      !formLokal ||
      !formStanowisko ||
      !formStartTime ||
      (knowsEnd && !formEndTime)
    ) {
      return showMsg("Wypełnij wymagane pola!", "error");
    }
    setSaving(true);
    const today = new Date();
    const [sh, sm] = formStartTime.split(":").map(Number);
    const startD = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      sh,
      sm
    );
    let endD = null,
      hrs = null;
    if (knowsEnd) {
      const [eh, em] = formEndTime.split(":").map(Number);
      endD = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        eh,
        em
      );
      if (endD < startD) endD.setDate(endD.getDate() + 1);
      hrs = parseFloat(((endD - startD) / 3600000).toFixed(2));
    }

    const overlapping = findOverlappingShift(
      shifts,
      employee.id,
      startD,
      endD,
      null
    );
    if (overlapping) {
      setSaving(false);
      const fmt = (d) =>
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return showMsg(
        `Ta zmiana nakłada się na już zapisaną (${fmt(
          overlapping.start_time
        )}–${fmt(
          overlapping.end_time
        )}). Jeśli to pomyłka, zgłoś się przez zakładkę "Zgłoś".`,
        "error"
      );
    }

    const newShiftData = {
      user_id: employee.id,
      user_name: employee.name,
      lokal: formLokal,
      stanowisko: formStanowisko,
      start_time: startD.toISOString(),
      end_time: endD ? endD.toISOString() : null,
      godzin: hrs,
    };

    try {
      const created = await api.post("shifts", newShiftData);
      const parsed = {
        ...created,
        start_time: new Date(created.start_time),
        end_time: created.end_time ? new Date(created.end_time) : null,
      };
      setShifts([...shifts, parsed]);
      sendToGoogleSheets(parsed, "ADD_SHIFT");
      showMsg(knowsEnd ? "Zmiana zapisana!" : "Rozpoczęto zmianę!");
      if (knowsEnd) {
        setJustClosed(true);
        setScreen("ZMIANA");
      }
    } catch (err) {
      showMsg("Błąd zapisu do bazy!", "error");
    }
    setSaving(false);
  };

  const handleSendZgloszenie = async () => {
    if (!zgText.trim()) return showMsg("Opisz zgłoszenie!", "error");
    setZgSaving(true);
    try {
      const issue = await api.post("issues", {
        user_id: zgAnon ? null : employee.id,
        user_name: zgAnon ? null : employee.name,
        issue_text: zgText,
        status: "nowe",
        type: "problem",
        is_anonymous: zgAnon,
        // shift_id to uuid (string) w bazie — nie rzutować na liczbę.
        shift_id: zgShiftId && zgShiftId !== "none" ? zgShiftId : null,
      });
      setIssues([...issues, issue]);
      setZgText("");
      setZgSent(true);
      showMsg("Zgłoszenie wysłane pomyślnie!");
    } catch (err) {
      showMsg(`Błąd połączenia: ${err.message || "nieznany błąd"}`, "error");
    }
    setZgSaving(false);
  };

  const handleSendKorekta = async () => {
    if (!zgPropDate || !zgPropLokal || !zgPropStanowisko || !zgPropStart) {
      return showMsg(
        "Uzupełnij datę, lokal, stanowisko i godzinę rozpoczęcia!",
        "error"
      );
    }
    setZgSaving(true);
    try {
      const issue = await api.post("issues", {
        user_id: employee.id,
        user_name: employee.name,
        issue_text: zgKorektaNote,
        status: "nowe",
        type: "correction",
        is_anonymous: false,
        shift_id: zgCorrectionShiftId !== "forgot" ? zgCorrectionShiftId : null,
        proposed_date: zgPropDate,
        proposed_lokal: zgPropLokal,
        proposed_stanowisko: zgPropStanowisko,
        proposed_start_time: zgPropStart,
        proposed_end_time: zgPropEnd || null,
      });
      setIssues([...issues, issue]);
      setZgKorektaNote("");
      setZgSent(true);
      showMsg("Poprawka wysłana do kierownika!");
    } catch (err) {
      showMsg(`Błąd połączenia: ${err.message || "nieznany błąd"}`, "error");
    }
    setZgSaving(false);
  };

  const handleSendAbsence = async () => {
    if (!zgAbsStart || !zgAbsEnd) {
      return showMsg("Podaj daty od-do!", "error");
    }
    if (zgAbsEnd < zgAbsStart) {
      return showMsg("Data „do” nie może być wcześniejsza niż „od”.", "error");
    }
    setZgSaving(true);
    try {
      const lokal = employee.default_lokal || lokaleOptions[0]?.name || null;
      const absence = await api.post("absences", {
        user_id: employee.id,
        user_name: employee.name,
        lokal,
        start_date: zgAbsStart,
        end_date: zgAbsEnd,
        type: zgAbsType,
        status: "pending",
        note: zgAbsNote || null,
        requested_by: "employee",
      });
      setAbsences([...absences, absence]);
      if (lokal) {
        await createManagerNotification(
          lokal,
          `${employee.name} prosi o ${
            zgAbsType === "urlop" ? "urlop" : "dni niedostępności"
          } (${zgAbsStart}–${zgAbsEnd}).`,
          "absence_request"
        );
      }
      setZgSent(true);
      showMsg("Wniosek wysłany do kierownika!");
    } catch (err) {
      showMsg(`Błąd połączenia: ${err.message || "nieznany błąd"}`, "error");
    }
    setZgSaving(false);
  };

  // ---- odhaczenie/odznaczenie zadania — jedyny konsument toggleTaskCompletion tutaj ----
  const handleToggleTask = async (item) => {
    try {
      const result = await toggleTaskCompletion({
        task: item.task,
        dateStr: todayStr,
        existingCompletion: item.completion,
        actorId: employee.id,
        actorName: employee.name,
        shiftId: openShift ? openShift.id : null,
      });
      if (result.removedId) {
        setTaskCompletions((prev) =>
          prev.filter((c) => c.id !== result.removedId)
        );
      } else if (result.created) {
        setTaskCompletions((prev) => [...prev, result.created]);
      }
    } catch (err) {
      showMsg("Błąd zapisu zadania!", "error");
    }
  };

  // ---- checklista zadań — wspólny renderer dla Pulpit (przed i w trakcie
  // zmiany) oraz zakładki Zadania, żeby nie duplikować JSX w trzech miejscach ----
  const renderTaskChecklist = (list) => (
    <div className="space-y-2">
      {list.map((item) => (
        <button
          key={item.task.id}
          onClick={() => handleToggleTask(item)}
          className={`${checkboxRowCls(item.done)} ${item.done ? "opacity-60" : ""}`}
        >
          <span className="w-5 h-5 border-2 border-[#B7B6AE] rounded-[3px] flex-shrink-0 flex items-center justify-center">
            {item.done && (
              <span className="w-[9px] h-[9px] bg-[#DE3A22] rounded-[1px]" />
            )}
          </span>
          <span className="flex-1 text-left">
            <span
              className={`block text-[15px] font-semibold ${
                item.done ? "line-through text-[#6E6E66]" : "text-[#171714]"
              }`}
            >
              {item.task.title}
              {!item.done && item.task.priority === "wysoki" && (
                <span className="ml-2 text-[11px] font-bold text-[#DE3A22] no-underline">
                  Ważne
                </span>
              )}
            </span>
            <span className="block text-[12px] text-[#8F8E86] mt-0.5">
              {item.done
                ? `${item.completion?.user_name || "?"}${
                    item.completion?.completed_at
                      ? " · " + fmtHHMM(new Date(item.completion.completed_at))
                      : ""
                  }`
                : item.task.deadline_time
                ? `do ${item.task.deadline_time.slice(0, 5)}`
                : " "}
            </span>
          </span>
          <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded bg-[#E7E7E2] text-[#6E6E66]">
            {taskBadgeLabel(item.task, taskCompletions, todayStr)}
          </span>
        </button>
      ))}
    </div>
  );

  // ---- fragmenty UI wspólne dla kilku ekranów ----
  const renderShiftInProgress = () => {
    const startDate = openShift.start_time;
    const elapsedMs = Math.max(0, now - startDate);
    const elH = Math.floor(elapsedMs / 3600000);
    const elM = Math.floor((elapsedMs % 3600000) / 60000);
    return (
      <>
        <div className={sectionLabelCls}>Pracujesz od {fmtHHMM(startDate)}</div>
        <div className={ruleStrongCls} />
        <div className="font-['Archivo'] font-extrabold text-[42px] text-[#171714] mt-4 tabular-nums">
          {elH} godz. {elM} min
        </div>
        <div className="text-sm text-[#6E6E66] mt-1">
          {openShift.lokal} · {openShift.stanowisko}
        </div>
        <div className={ruleSoftCls} />
        {myChecklistOwn.length > 0 && (
          <>
            <div className="flex items-baseline justify-between mt-4">
              <span className={sectionLabelCls}>Zadania na zmianę</span>
              <span className="font-['Archivo'] font-extrabold text-sm text-[#171714] tabular-nums">
                {myChecklistOwn.filter((i) => i.done).length} z{" "}
                {myChecklistOwn.length}
              </span>
            </div>
            <div className="flex gap-1 mt-2.5">
              {myChecklistOwn.map((item) => (
                <span
                  key={item.task.id}
                  className={`h-1.5 flex-1 rounded-full ${
                    item.done ? "bg-[#171714]" : "bg-[#E7E7E2]"
                  }`}
                />
              ))}
            </div>
            <div className="mt-3">{renderTaskChecklist(myChecklistOwn)}</div>
            {myChecklistOwn.some((i) => !i.done) && (
              <div className="bg-[#FBEAE6] border-l-4 border-[#DE3A22] text-[#8A3A2B] text-sm p-3.5 rounded-sm mt-3.5">
                Zostały {myChecklistOwn.filter((i) => !i.done).length}{" "}
                {myChecklistOwn.filter((i) => !i.done).length === 1
                  ? "zadanie"
                  : "zadania"}
                . Możesz zakończyć zmianę, kierownik zobaczy status w panelu.
              </div>
            )}
          </>
        )}
        <div className="mb-4" />
        <div className="flex-1" />
        <button
          onClick={() => handleCloseShift(null)}
          disabled={saving}
          className={ctaPrimaryCls}
        >
          Zakończ zmianę o {fmtHHMM(now)}
        </button>
        <button className={ctaSecondaryCls}>
          Wybierz inną godzinę
          <input
            type="time"
            onChange={(e) => e.target.value && handleCloseShift(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </button>
      </>
    );
  };

  const razem = (() => {
    if (!knowsEnd || !formStartTime || !formEndTime) return null;
    const [sh, sm] = formStartTime.split(":").map(Number);
    const [eh, em] = formEndTime.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return (mins / 60).toFixed(1).replace(".", ",");
  })();

  const renderStartForm = () => (
    <>
      {todaysClosedShifts.length > 0 && (
        <div className="bg-[#FBEAE6] border-l-4 border-[#DE3A22] text-[#8A3A2B] text-sm p-3.5 rounded-sm mb-4">
          <p className="font-bold mb-1">Dziś już zarejestrowano:</p>
          {todaysClosedShifts.map((s) => (
            <p key={s.id}>
              {fmtHHMM(s.start_time)} – {fmtHHMM(s.end_time)} ({s.lokal},{" "}
              {s.stanowisko})
            </p>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={fieldLabelCls}>Lokal</span>
          <div className={selectWrapCls}>
            <select
              value={formLokal}
              onChange={(e) => setFormLokal(e.target.value)}
              className={selectElCls}
            >
              {lokaleOptions.map((l) => (
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
              value={formStanowisko}
              onChange={(e) => setFormStanowisko(e.target.value)}
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
        <div className={staticBoxCls}>
          <span className={selectValCls}>
            {new Date().toLocaleDateString("pl-PL", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </span>
          <span className="text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]">
            dziś
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setKnowsEnd((v) => !v)}
        className={`${checkboxRowCls(knowsEnd)} mt-5`}
      >
        <span className="w-5 h-5 border-2 border-[#B7B6AE] rounded-[3px] flex-shrink-0 flex items-center justify-center">
          {knowsEnd && (
            <span className="w-[9px] h-[9px] bg-[#DE3A22] rounded-[1px]" />
          )}
        </span>
        <span className="text-[15.5px] font-semibold text-[#171714]">
          Znam godzinę zakończenia
        </span>
      </button>
      <div className="mt-5">
        <span className={fieldLabelCls}>Rozpoczęcie</span>
        <div className={timeHeroCls}>
          <div className="flex items-center gap-2.5">
            <Clock size={20} className="text-[#171714]" />
            <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
              {formStartTime}
            </span>
          </div>
          {!knowsEnd && (
            <span className="text-[13px] text-[#8F8E86]">teraz · zmień</span>
          )}
          <input
            type="time"
            value={formStartTime}
            onChange={(e) => setFormStartTime(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </div>
      </div>
      {knowsEnd && (
        <div className="mt-5">
          <span className={fieldLabelCls}>Zakończenie</span>
          <div className={timePlainCls}>
            <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
              {formEndTime || "--:--"}
            </span>
            <input
              type="time"
              value={formEndTime}
              onChange={(e) => setFormEndTime(e.target.value)}
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
      <div className="flex-1" />
      <button
        onClick={handleCreateShift}
        disabled={saving}
        className={ctaPrimaryCls}
      >
        {knowsEnd ? "Zapisz całą zmianę" : "Rozpocznij zmianę"}
      </button>
    </>
  );

  const renderJustClosedSummary = () => {
    const total = sumHours(todaysClosedShifts);
    return (
      <>
        <div className="font-['Archivo'] font-extrabold text-[30px] text-[#171714]">
          Zmiana zapisana
        </div>
        <div className="text-sm text-[#6E6E66] mb-6">
          Dzięki, {employee.name}
        </div>
        <div className={sectionLabelCls}>{employee.name} ma dziś zapisane</div>
        <div className={ruleStrongCls} />
        {todaysClosedShifts.map((s) => (
          <div key={s.id} className="flex items-center gap-3 py-3.5">
            <span className="w-[26px] h-[26px] rounded bg-[#DCEEDF] text-[#2F7A45] flex items-center justify-center flex-shrink-0">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="flex-1 font-['Archivo'] font-extrabold text-[21px] text-[#171714]">
              {fmtHHMM(s.start_time)} – {fmtHHMM(s.end_time)}
            </span>
            <span className="text-[15px] text-[#6E6E66]">
              {((s.end_time - s.start_time) / 3600000).toFixed(1).replace(".", ",")}{" "}
              godz.
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between mt-1.5">
          <span className={sectionLabelCls}>Razem dziś</span>
          <span className="font-['Archivo'] font-extrabold text-[26px] text-[#171714] tabular-nums">
            {total.toFixed(1).replace(".", ",")} godz.
          </span>
        </div>
        {myChecklistOwn.length > 0 && (
          <div className="flex items-baseline justify-between mt-1.5">
            <span className={sectionLabelCls}>Zadania</span>
            <span className="text-[15px] text-[#171714]">
              {myChecklistOwn.filter((i) => i.done).length} z{" "}
              {myChecklistOwn.length} wykonanych
            </span>
          </div>
        )}
        <div className={ruleSoftCls} />
        <div className="flex-1" />
        <div className={`${sectionLabelCls} mb-2.5`}>Wracasz jeszcze dziś?</div>
        <button
          onClick={() => {
            setJustClosed(false);
            resetShiftForm();
          }}
          className={ctaPrimaryCls}
        >
          Rozpocznij kolejną zmianę
        </button>
        <button onClick={() => setScreen("RAPORT")} className={ctaSecondaryCls}>
          Zobacz swoje godziny
        </button>
        {onBack && (
          <button onClick={onBack} className={ctaSecondaryQuietCls}>
            Wróć do listy osób
          </button>
        )}
      </>
    );
  };

  // ==========================================
  // EKRAN: PULPIT
  // ==========================================
  if (screen === "PULPIT") {
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title={employee.name}
        showPill={!!openShift}
      >
        {openShift ? (
          renderShiftInProgress()
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="font-['Archivo'] font-extrabold text-[30px] text-[#171714]">
                Cześć, {employee.name}
              </div>
              <WeatherBadge
                city={
                  lokaleOptions.find((l) => l.name === effectiveAssignment.lokal)?.miasto
                }
                className="text-[#8F8E86] text-sm mt-1.5 flex-shrink-0"
              />
            </div>
            <div className="text-sm text-[#6E6E66] mt-0.5 mb-7">
              {employee.default_lokal} · {employee.default_stanowisko}
            </div>
            <div className={sectionLabelCls}>Twoja zmiana dziś</div>
            <div className={ruleStrongCls} />
            {mojeDzis.length > 0 ? (
              <div className="mt-3 space-y-2">
                {mojeDzis.map((s) => (
                  <div key={s.id} className={staticBoxCls}>
                    <span className="font-['Archivo'] font-extrabold text-[19px]">
                      {trimTime(s.start_time)} – {trimTime(s.end_time)}
                    </span>
                    <span className="text-[13px] text-[#6E6E66] text-right">
                      {s.stanowisko}
                      <br />
                      {s.lokal}
                    </span>
                  </div>
                ))}
              </div>
            ) : najblizszaZmiana ? (
              <button
                onClick={() => setScreen("GRAFIK")}
                className="mt-3 w-full text-left border-2 border-[#B7B6AE] rounded bg-[#F1F1EE] p-3.5"
              >
                <div className={sectionLabelCls}>Następna zmiana</div>
                <div className="font-['Archivo'] font-extrabold text-[19px] mt-0.5">
                  {opisDnia(najblizszaZmiana.date)} ·{" "}
                  {trimTime(najblizszaZmiana.start_time)} –{" "}
                  {trimTime(najblizszaZmiana.end_time)}
                </div>
                <div className="text-[13px] text-[#6E6E66]">
                  {najblizszaZmiana.stanowisko} · {najblizszaZmiana.lokal}
                </div>
              </button>
            ) : (
              <div className="text-[15px] text-[#8F8E86] italic mt-4">
                Nie masz jeszcze wpisanych zmian w grafiku.
              </div>
            )}
            {myChecklistOwn.length > 0 && (
              <>
                <div className="flex items-baseline justify-between mt-6">
                  <span className={sectionLabelCls}>Zadania dziś</span>
                  <span className="font-['Archivo'] font-extrabold text-sm text-[#171714] tabular-nums">
                    {myChecklistOwn.filter((i) => i.done).length} z{" "}
                    {myChecklistOwn.length}
                  </span>
                </div>
                <div className={ruleSoftCls} />
                <div className="mt-3">{renderTaskChecklist(myChecklistOwn)}</div>
              </>
            )}
            <div className="flex-1" />
            <button
              onClick={() => {
                // Bez tego, jeśli pracownik wcześniej dziś zamknął zmianę,
                // wejście tutaj pokazywałoby stare podsumowanie zamiast
                // formularza — kliknięcie ma znaczyć "chcę zacząć", nie
                // "pokaż mi ponownie ostatnie podsumowanie".
                setJustClosed(false);
                setScreen("ZMIANA");
              }}
              className={ctaPrimaryCls}
            >
              <Clock size={19} /> Rozpocznij zmianę
            </button>
          </>
        )}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZMIANA
  // ==========================================
  if (screen === "ZMIANA") {
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title={employee.name}
        showPill={!!openShift}
      >
        {openShift
          ? renderShiftInProgress()
          : justClosed
          ? renderJustClosedSummary()
          : renderStartForm()}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: GRAFIK
  // ==========================================
  // Pionowa lista dni, nie siatka — siatka kierownika (7 kolumn x N osób)
  // na telefonie jest nieczytelna. Pracownika interesuje przede wszystkim
  // "kiedy następnym razem pracuję", więc dzień jest tu jednostką.
  if (screen === "GRAFIK") {
    const startTygodnia = mondayOf(dzisYMD);
    const bazowy = grafikZakres === "nast" ? addDaysYMD(startTygodnia, 7) : startTygodnia;
    const dniTygodnia = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysYMD(bazowy, i));
    const miesiacPrefix = dzisYMD.slice(0, 7);
    const mojeWMiesiacu = mojGrafik
      .filter((s) => s.date.startsWith(miesiacPrefix))
      .sort((a, b) => a.date.localeCompare(b.date));

    const wolneNa = (dateStr) =>
      (absences || []).find(
        (a) =>
          a.status === "approved" &&
          a.start_date <= dateStr &&
          dateStr <= a.end_date &&
          (a.user_id
            ? String(a.user_id) === String(employee.id)
            : a.user_name === employee.name)
      );

    const renderDzien = (dateStr) => {
      const moje = mojGrafik.filter((s) => s.date === dateStr);
      const wolne = wolneNa(dateStr);
      const lokalDnia = moje[0]?.lokal || effectiveAssignment.lokal;
      const wszyscyDnia = publishedShiftsOnDay(planShifts, lokalDnia, dateStr);
      const inni = wszyscyDnia.filter(
        (s) => !moje.some((m) => String(m.id) === String(s.id))
      );

      return (
        <div key={dateStr} className="mb-4">
          <div className="flex items-baseline justify-between">
            <span className="font-['Archivo'] font-extrabold text-[15px] text-[#171714]">
              {opisDnia(dateStr)}
            </span>
            {dateStr === dzisYMD && (
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-[#DE3A22] text-white">
                DZIŚ
              </span>
            )}
          </div>
          <div className={ruleSoftCls} />

          {moje.length > 0 ? (
            <div className="mt-2.5 space-y-2">
              {moje.map((s) => {
                const style = stanowiskoBadgeStyle(
                  stanowiskaOptions,
                  s.lokal,
                  s.stanowisko
                );
                return (
                  <div
                    key={s.id}
                    className="border-[2.5px] border-[#171714] rounded p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-[11px] font-extrabold"
                        style={style || { backgroundColor: "#E7E7E2", color: "#171714" }}
                      >
                        {stanowiskoShort(stanowiskaOptions, s.lokal, s.stanowisko)}
                      </span>
                      <span className="font-['Archivo'] font-extrabold text-[18px]">
                        {trimTime(s.start_time)} – {trimTime(s.end_time)}
                      </span>
                    </div>
                    <div className="text-[13px] text-[#6E6E66] mt-0.5">
                      {s.stanowisko} · {s.lokal}
                    </div>
                    {inni.length > 0 && (
                      <div className="text-[13px] text-[#6E6E66] mt-2">
                        <span className="font-semibold">Z tobą: </span>
                        {inni
                          .map(
                            (o) =>
                              `${o.user_name} (${stanowiskoShort(
                                stanowiskaOptions,
                                o.lokal,
                                o.stanowisko
                              )})`
                          )
                          .join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : wolne ? (
            <div className="mt-2.5 flex items-center gap-2">
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] font-extrabold ${
                  wolne.type === "urlop"
                    ? "bg-[#DE3A22] text-white"
                    : "bg-[#E7E7E2] text-[#6E6E66]"
                }`}
              >
                {wolne.type === "urlop" ? "URP" : "NIE"}
              </span>
              <span className="text-[15px] text-[#6E6E66]">
                {wolne.type === "urlop" ? "Urlop" : "Zgłoszona niedostępność"}
              </span>
            </div>
          ) : (
            <div className="mt-2.5 text-[15px] text-[#8F8E86] italic">Wolne</div>
          )}

          {grafikWszyscy && inni.length > 0 && moje.length === 0 && (
            <div className="mt-2 text-[13px] text-[#6E6E66]">
              <span className="font-semibold">W lokalu: </span>
              {inni
                .map(
                  (o) =>
                    `${o.user_name} ${trimTime(o.start_time)}–${trimTime(o.end_time)}`
                )
                .join(", ")}
            </div>
          )}
        </div>
      );
    };

    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title="Grafik"
      >
        <div className="flex gap-1.5 mb-3">
          {[
            { key: "ten", label: "Ten tydzień" },
            { key: "nast", label: "Następny" },
            { key: "miesiac", label: "Miesiąc" },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setGrafikZakres(o.key)}
              className={`flex-1 py-2 rounded border-2 text-[13px] font-bold ${
                grafikZakres === o.key
                  ? "bg-[#171714] text-white border-[#171714]"
                  : "bg-white text-[#171714] border-[#B7B6AE]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {grafikZakres === "miesiac" ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className={sectionLabelCls}>
                {getMonthName(new Date().getMonth())}
              </span>
              <span className="font-['Archivo'] font-extrabold text-sm tabular-nums">
                {mojeWMiesiacu.length} zmian ·{" "}
                {Math.round(mojeWMiesiacu.reduce((a, s) => a + shiftHours(s), 0))} h
              </span>
            </div>
            <div className={ruleStrongCls} />
            {mojeWMiesiacu.length === 0 ? (
              <div className="text-[15px] text-[#8F8E86] italic mt-4">
                Brak zmian w tym miesiącu.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {mojeWMiesiacu.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border-2 border-[#B7B6AE] rounded p-3"
                  >
                    <span className="font-['Archivo'] font-bold text-[15px]">
                      {opisDnia(s.date)}
                    </span>
                    <span className="text-[14px] tabular-nums">
                      {trimTime(s.start_time)} – {trimTime(s.end_time)}
                    </span>
                    <span className="text-[12px] text-[#6E6E66]">{s.lokal}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setGrafikWszyscy((v) => !v)}
              className="mb-3 text-[13px] font-bold underline text-[#6E6E66] self-start"
            >
              {grafikWszyscy ? "Pokaż tylko moje" : "Pokaż wszystkich w lokalu"}
            </button>
            {dniTygodnia.map(renderDzien)}
            {mojGrafik.length === 0 && (
              <div className="text-[13.5px] text-[#6E6E66] leading-relaxed">
                Kierownik nie wysłał jeszcze grafiku na ten okres. Gdy to zrobi,
                dostaniesz powiadomienie.
              </div>
            )}
          </>
        )}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: RAPORT
  // ==========================================
  if (screen === "RAPORT") {
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title="Raport"
        footer={
          <div className="flex-shrink-0 border-t-[2.5px] border-[#171714] bg-white px-5 pt-[18px] pb-[22px] flex items-baseline justify-between">
            <span className={sectionLabelCls}>
              {employee.name} · {getMonthName(raportMonth)}
            </span>
            <span className="font-['Archivo'] font-extrabold text-[28px] text-[#171714] tabular-nums">
              {raportTotal.toFixed(1).replace(".", ",")} godz.
            </span>
          </div>
        }
      >
        <span className={fieldLabelCls}>Pracownik</span>
        <div className={staticBoxCls}>
          <span className={selectValCls}>
            {employee.name} · {employee.default_stanowisko || ""}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3.5">
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
        <div className="flex gap-2 mt-5 pb-2.5 border-b-[1.5px] border-[#B7B6AE]">
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
                  : stanowiskoBadgeStyle(stanowiskaOptions, s.lokal, s.stanowisko) || {}
              }
            >
              {s.is_urlop
                ? "URL"
                : stanowiskoShort(stanowiskaOptions, s.lokal, s.stanowisko)}
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
            {s.is_urlop ? (
              <span className="w-9 h-[30px] flex-shrink-0" />
            ) : (
              <button
                onClick={() => openZgloszenie(s.id)}
                className="w-9 h-[30px] flex-shrink-0 border-2 border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66]"
              >
                <Flag size={14} />
              </button>
            )}
          </div>
        ))}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZADANIA (Roadmap p.2)
  // ==========================================
  if (screen === "ZADANIA") {
    const taskList = taskViewMode === "all" ? myChecklistAll : myChecklistOwn;
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title="Zadania"
      >
        {myChecklistOwn.some((i) => !i.done) && (
          <div className="bg-[#FBEAE6] border-l-4 border-[#DE3A22] text-[#8A3A2B] text-sm p-3.5 rounded-sm mb-4">
            Masz {myChecklistOwn.filter((i) => !i.done).length}{" "}
            {myChecklistOwn.filter((i) => !i.done).length === 1
              ? "niewykonane zadanie"
              : "niewykonanych zadań"}{" "}
            na dziś.
          </div>
        )}
        <div className={`${razemRowCls} mb-4`}>
          <span className="text-sm text-[#6E6E66]">Ostatnie 7 dni</span>
          <span className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] tabular-nums">
            {myWeeklyStats.total > 0
              ? `${myWeeklyStats.done} z ${myWeeklyStats.total} zadań`
              : "brak danych"}
          </span>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTaskViewMode("own")}
            className={`flex-1 border-2 rounded py-2.5 font-['Archivo'] font-bold text-sm ${
              taskViewMode === "own"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Twoje stanowisko
          </button>
          <button
            onClick={() => setTaskViewMode("all")}
            className={`flex-1 border-2 rounded py-2.5 font-['Archivo'] font-bold text-sm ${
              taskViewMode === "all"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Wszystkie
          </button>
        </div>
        {taskList.length === 0 && (
          <div className="text-center py-10 text-[#8F8E86]">
            <ClipboardCheck className="mx-auto mb-2 opacity-40" size={40} />
            Brak zadań na dziś.
          </div>
        )}
        {renderTaskChecklist(taskList)}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: WIECEJ
  // ==========================================
  if (screen === "WIECEJ") {
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title="Więcej"
      >
        <button onClick={() => openZgloszenie(null)} className={menuRowCls}>
          <Flag size={21} className="text-[#171714] flex-shrink-0" />
          <span className="flex-1 text-base font-semibold text-[#171714]">
            Zgłoś
          </span>
        </button>
        <button onClick={() => setScreen("WIADOMOSCI")} className={menuRowCls}>
          <Bell size={21} className="text-[#171714] flex-shrink-0" />
          <span className="flex-1 text-base font-semibold text-[#171714]">
            Wiadomości
          </span>
          {unreadCount > 0 && (
            <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded bg-[#FAEAE6] text-[#8A3A2B]">
              {unreadCount} nowe
            </span>
          )}
        </button>
        {onBack && (
          <button onClick={onBack} className={menuRowCls}>
            <ChevronLeft
              size={21}
              strokeWidth={2.5}
              className="text-[#171714] flex-shrink-0"
            />
            <span className="flex-1 text-base font-semibold text-[#171714]">
              Wróć do listy osób
            </span>
          </button>
        )}
        <div className="flex-1" />
        {deviceNote && (
          <div className="border-2 border-dashed border-[#B7B6AE] rounded p-4">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-2">
              Uwaga
            </div>
            <div className="text-[15px] text-[#171714] leading-relaxed">
              {deviceNote}
            </div>
          </div>
        )}
        <button
          onClick={onLogout}
          className={`text-[13px] text-[#8F8E86] underline underline-offset-2 self-center ${
            deviceNote ? "mt-3.5" : "mt-2"
          }`}
        >
          Wyloguj
        </button>
        <p className="text-[11px] text-[#B7B6AE] self-center mt-1.5">
          Wersja {APP_VERSION}
        </p>
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: WIADOMOSCI
  // ==========================================
  if (screen === "WIADOMOSCI") {
    const sortedNotifications = [...myNotifications].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title="Wiadomości"
        showBell={false}
      >
        {sortedNotifications.length === 0 && (
          <div className="text-center py-10 text-[#8F8E86]">
            <Bell className="mx-auto mb-2 opacity-40" size={40} />
            Brak powiadomień
          </div>
        )}
        {sortedNotifications.map((n) => (
          <div
            key={n.id}
            className={`flex gap-3.5 py-4 pl-4 pr-[18px] border-l-4 rounded-sm mb-3.5 ${
              n.is_read
                ? "border-[#8F8E86] bg-[#F1F1EE]"
                : "border-[#DE3A22] bg-[#FDF1EE]"
            }`}
          >
            <div>
              <div className="text-base leading-snug text-[#171714]">
                {formatNotificationText(n, showEmployeeNameInMessages)}
              </div>
              {n.created_at && (
                <div className="text-[13px] text-[#8F8E86] mt-2">
                  {new Date(n.created_at).toLocaleString("pl-PL")}
                </div>
              )}
            </div>
          </div>
        ))}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZGLOS
  // ==========================================
  if (screen === "ZGLOS") {
    const korektaShift =
      zgCorrectionShiftId !== "forgot"
        ? recentShiftsForZgloszenie.find((s) => s.id === zgCorrectionShiftId)
        : null;
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        title={
          zgType === "correction"
            ? "Popraw zmianę"
            : zgType === "absence"
            ? "Wniosek o wolne"
            : "Zgłoś problem"
        }
      >
        {!zgSent && (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setZgType("correction")}
              className={checkboxRowCls(zgType === "correction")}
            >
              <span className="text-[13.5px] font-semibold text-[#171714]">
                Popraw zmianę
              </span>
            </button>
            <button
              type="button"
              onClick={() => setZgType("absence")}
              className={checkboxRowCls(zgType === "absence")}
            >
              <span className="text-[13.5px] font-semibold text-[#171714]">
                Wolne / urlop
              </span>
            </button>
            <button
              type="button"
              onClick={() => setZgType("problem")}
              className={checkboxRowCls(zgType === "problem")}
            >
              <span className="text-[13.5px] font-semibold text-[#171714]">
                Zgłoś problem
              </span>
            </button>
          </div>
        )}

        {zgType === "correction" ? (
          <>
            <div className="mt-5">
              <span className={fieldLabelCls}>Która zmiana</span>
              <div className={selectWrapCls}>
                <select
                  value={zgCorrectionShiftId}
                  onChange={(e) => applyKorektaShiftDefaults(e.target.value)}
                  className={selectElCls}
                >
                  {recentShiftsForZgloszenie.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.start_time.toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                      })}{" "}
                      · {fmtHHMM(s.start_time)}
                      {s.end_time ? `–${fmtHHMM(s.end_time)}` : ""} · {s.lokal}
                    </option>
                  ))}
                  <option value="forgot">Zapomniałem/łam odbić</option>
                </select>
                <ChevronDown size={16} className={selectChevronCls} />
              </div>
            </div>
            {korektaShift && (
              <div className="mt-5">
                <span className={sectionLabelCls}>Obecnie zapisane</span>
                <div className={`${staticBoxCls} mt-2`}>
                  <span className="text-[15px] text-[#171714]">
                    {korektaShift.lokal} · {korektaShift.stanowisko}
                  </span>
                  <span className="font-['Archivo'] font-bold text-[15px] text-[#171714]">
                    {fmtHHMM(korektaShift.start_time)}
                    {korektaShift.end_time
                      ? `–${fmtHHMM(korektaShift.end_time)}`
                      : " – trwa"}
                  </span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div>
                <span className={fieldLabelCls}>Lokal</span>
                <div className={selectWrapCls}>
                  <select
                    value={zgPropLokal}
                    onChange={(e) => setZgPropLokal(e.target.value)}
                    className={selectElCls}
                  >
                    {lokaleOptions.map((l) => (
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
                    value={zgPropStanowisko}
                    onChange={(e) => setZgPropStanowisko(e.target.value)}
                    className={selectElCls}
                  >
                    {korektaStanowiska.length === 0 && (
                      <option value="">Brak stanowisk</option>
                    )}
                    {korektaStanowiska.map((s) => (
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
                value={zgPropDate}
                onChange={(e) => setZgPropDate(e.target.value)}
                className={selectElCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div>
                <span className={fieldLabelCls}>Rozpoczęcie</span>
                <input
                  type="time"
                  value={zgPropStart}
                  onChange={(e) => setZgPropStart(e.target.value)}
                  className={selectElCls}
                />
              </div>
              <div>
                <span className={fieldLabelCls}>Zakończenie</span>
                <input
                  type="time"
                  value={zgPropEnd}
                  onChange={(e) => setZgPropEnd(e.target.value)}
                  className={selectElCls}
                />
              </div>
            </div>
            <div className="mt-5">
              <span className={fieldLabelCls}>Komentarz (opcjonalnie)</span>
              <textarea
                value={zgKorektaNote}
                onChange={(e) => setZgKorektaNote(e.target.value)}
                className="border-2 border-[#B7B6AE] rounded bg-[#E7E7E2] p-3.5 text-[15px] text-[#171714] min-h-[80px] w-full"
                placeholder="Np. wyszłam o 20:30, nie zdążyłam odbić."
              />
            </div>
            <div className="bg-[#E7E7E2] rounded p-3.5 text-sm text-[#6E6E66] mt-5">
              Kierownik zatwierdzi albo poprawi te dane. Do czasu decyzji
              wiersz ma czerwoną chorągiewkę.
            </div>
            {zgSent && (
              <div className="mt-2.5 text-xs text-[#A83226] bg-[#FBEAE6] rounded p-2.5">
                Poprawka wysłana. Kierownik odpowie w Wiadomościach.
              </div>
            )}
            <div className="flex-1" />
            {!zgSent && (
              <button
                onClick={handleSendKorekta}
                disabled={zgSaving}
                className={ctaPrimaryCls}
              >
                Wyślij poprawkę
              </button>
            )}
          </>
        ) : zgType === "absence" ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setZgAbsType("urlop")}
                className={checkboxRowCls(zgAbsType === "urlop")}
              >
                <span className="text-[15px] font-semibold text-[#171714]">Urlop</span>
              </button>
              <button
                type="button"
                onClick={() => setZgAbsType("niedostepnosc")}
                className={checkboxRowCls(zgAbsType === "niedostepnosc")}
              >
                <span className="text-[15px] font-semibold text-[#171714]">
                  Niedostępność
                </span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div>
                <span className={fieldLabelCls}>Od</span>
                <input
                  type="date"
                  value={zgAbsStart}
                  onChange={(e) => setZgAbsStart(e.target.value)}
                  className={selectElCls}
                />
              </div>
              <div>
                <span className={fieldLabelCls}>Do</span>
                <input
                  type="date"
                  value={zgAbsEnd}
                  onChange={(e) => setZgAbsEnd(e.target.value)}
                  className={selectElCls}
                />
              </div>
            </div>
            <div className="mt-5">
              <span className={fieldLabelCls}>Komentarz (opcjonalnie)</span>
              <textarea
                value={zgAbsNote}
                onChange={(e) => setZgAbsNote(e.target.value)}
                className="border-2 border-[#B7B6AE] rounded bg-[#E7E7E2] p-3.5 text-[15px] text-[#171714] min-h-[80px] w-full"
                placeholder="Np. wyjazd rodzinny"
              />
            </div>
            <div className="bg-[#E7E7E2] rounded p-3.5 text-sm text-[#6E6E66] mt-5">
              {zgAbsType === "urlop"
                ? "Kierownik zatwierdzi albo odrzuci wniosek. Po zatwierdzeniu urlop zostanie wpisany jako godziny (8h za każdy dzień roboczy, bez sobót i niedziel)."
                : "Kierownik zatwierdzi albo odrzuci wniosek. Niedostępność nie generuje godzin — to tylko informacja, że nie możesz wtedy pracować."}
            </div>
            {zgSent && (
              <div className="mt-2.5 text-xs text-[#A83226] bg-[#FBEAE6] rounded p-2.5">
                Wniosek wysłany. Kierownik odpowie w Wiadomościach.
              </div>
            )}
            <div className="flex-1" />
            {!zgSent && (
              <button
                onClick={handleSendAbsence}
                disabled={zgSaving}
                className={ctaPrimaryCls}
              >
                Wyślij wniosek
              </button>
            )}
          </>
        ) : (
          <>
            <div className="mt-5">
              <span className={fieldLabelCls}>Kto zgłasza</span>
              <div className={selectWrapCls}>
                <select
                  value={zgAnon ? "anon" : "named"}
                  onChange={(e) => setZgAnon(e.target.value === "anon")}
                  className={selectElCls}
                >
                  <option value="named">
                    {employee.name} · {employee.default_stanowisko || ""}
                  </option>
                  <option value="anon">Zgłoś anonimowo</option>
                </select>
                <ChevronDown size={16} className={selectChevronCls} />
              </div>
              {zgAnon && (
                <span className="text-xs text-[#8F8E86] mt-1.5 italic block">
                  Kierownik zobaczy zgłoszenie bez Twojego imienia.
                </span>
              )}
            </div>
            <div className="mt-5">
              <span className={fieldLabelCls}>Która zmiana (opcjonalnie)</span>
              <div className={selectWrapCls}>
                <select
                  value={zgShiftId || "none"}
                  onChange={(e) => setZgShiftId(e.target.value)}
                  className={selectElCls}
                >
                  {recentShiftsForZgloszenie.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.start_time.toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                      })}{" "}
                      · {fmtHHMM(s.start_time)}
                      {s.end_time ? `–${fmtHHMM(s.end_time)}` : ""} · {s.lokal}
                    </option>
                  ))}
                  <option value="none">Bez konkretnej zmiany</option>
                </select>
                <ChevronDown size={16} className={selectChevronCls} />
              </div>
            </div>
            <div className="mt-5">
              <span className={fieldLabelCls}>Opis</span>
              <textarea
                value={zgText}
                onChange={(e) => setZgText(e.target.value)}
                className="border-2 border-[#B7B6AE] rounded bg-[#E7E7E2] p-3.5 text-[15px] text-[#171714] min-h-[120px] w-full"
                placeholder="Np. zepsuta zmywarka, brak rękawic..."
              />
            </div>
            <div className="bg-[#E7E7E2] rounded p-3.5 text-sm text-[#6E6E66] mt-5">
              Kierownik odpowie w Wiadomościach.
            </div>
            {zgSent && (
              <div className="mt-2.5 text-xs text-[#A83226] bg-[#FBEAE6] rounded p-2.5">
                Zgłoszenie wysłane. Kierownik odpowie w Wiadomościach.
              </div>
            )}
            <div className="flex-1" />
            {!zgSent && (
              <button
                onClick={handleSendZgloszenie}
                disabled={zgSaving}
                className={ctaPrimaryCls}
              >
                Wyślij zgłoszenie
              </button>
            )}
          </>
        )}
      </Shell>
    );
  }

  return null;
};
