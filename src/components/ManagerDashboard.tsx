// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Clock,
  Users,
  Plus,
  X,
  Edit2,
  Save,
  MapPin,
  Briefcase,
  Trash2,
  Archive,
  Info,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../api/supabase";
import { sendToGoogleSheets } from "../api/googleSheets";
import { getShort, getDayOfWeek, getMonthName, getAvailableYears } from "../utils/format";
import { findOverlappingShift } from "../utils/shifts";
import { isTaskDueOn, findSharedCompletion, toLocalYMD } from "../utils/tasks";
import { resolveAbsenceRequest, addUrlopDirectly, deleteAbsence } from "../utils/absences";
import NotificationsPanel from "./NotificationsPanel";
import ZatwierdzanieZmian from "./manager/ZatwierdzanieZmian";
import ZadaniaISprzatanie from "./manager/ZadaniaISprzatanie";
import ManagerShell, { NAV_ITEMS } from "./manager/ManagerShell";
import PulpitHome from "./manager/PulpitHome";
import WBudowie from "./manager/WBudowie";
import MojaPraca from "./manager/MojaPraca";
import RejestrGodzin from "./manager/RejestrGodzin";
import Aktywni from "./manager/Aktywni";
import Zgloszenia from "./manager/Zgloszenia";
import Pracownicy from "./manager/Pracownicy";
import RaportyIKoszty from "./manager/RaportyIKoszty";
import Przewodnik from "./manager/Przewodnik";
import Grafik from "./manager/Grafik";
import { resolveSwap } from "../utils/swaps";

// ==========================================
// KIEROWNIK DASHBOARD
// ==========================================
const ManagerDashboard = ({
  currentUser,
  setCurrentView,
  users,
  setUsers,
  lokale,
  setLokale,
  stanowiska,
  setStanowiska,
  shifts,
  setShifts,
  issues,
  setIssues,
  notifications,
  setNotifications,
  shiftEdits,
  setShiftEdits,
  tasks,
  setTasks,
  taskCompletions,
  setTaskCompletions,
  absences,
  setAbsences,
  planShifts,
  setPlanShifts,
  shiftSwaps,
  setShiftSwaps,
  staffingRules,
  setStaffingRules,
  staffingRuleSets,
  setStaffingRuleSets,
  lokaleGodziny,
  setLokaleGodziny,
  grafikWyjatki,
  setGrafikWyjatki,
  showMsg,
}) => {
  const [tab, setTab] = useState("pulpit");
  const [przewodnikTab, setPrzewodnikTab] = useState("pracownicy");
  const [selectedLokal, setSelectedLokal] = useState("ALL");
  const [reportUserId, setReportUserId] = useState(null);
  // Imię pracownika w Rejestr Godzin/Aktywni prowadzi tu — patrz onNameClick
  // przekazywane do tych komponentów.
  const goToEmployeeReport = (userId) => {
    setReportUserId(userId);
    setTab("raporty");
  };

  // --- POWIADOMIENIA DLA PRACOWNIKA O ZMIANIE/USUNIĘCIU ZMIANY ---
  const fmtTime = (d) =>
    d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  const notifyEmployee = async (
    shiftLike,
    action,
    oldStart,
    oldEnd,
    newStart,
    newEnd
  ) => {
    try {
      const dateSrc = oldStart || newStart;
      const created = await api.post("notifications", {
        user_name: shiftLike.user_name,
        lokal: shiftLike.lokal,
        actor_name: currentUser.name,
        action,
        shift_date: dateSrc
          ? dateSrc.toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        old_start: fmtTime(oldStart),
        old_end: fmtTime(oldEnd),
        new_start: fmtTime(newStart),
        new_end: fmtTime(newEnd),
        is_read: false,
      });
      setNotifications((prev) => [...prev, created]);
    } catch (err) {
      console.error("Błąd tworzenia powiadomienia:", err);
    }
  };

  const isLocalManager = currentUser.role === "manager_lokalu";
  const managerLokaleList = currentUser.allowed_lokale
    ? currentUser.allowed_lokale.split(",").map((l) => l.trim())
    : [];

  const hasAccessToLokal = (lokalName) =>
    !isLocalManager || managerLokaleList.includes(lokalName);

  // --- POWIADOMIENIA DLA KIEROWNIKA (audience: "manager") ---
  const managerNotifications = notifications.filter(
    (n) => n.audience === "manager" && hasAccessToLokal(n.lokal)
  );
  const unreadManagerCount = managerNotifications.filter(
    (n) => !n.is_read
  ).length;

  // --- KOREKTY GODZIN OCZEKUJĄCE NA DECYZJĘ (issues.type === "correction") ---
  const pendingCorrections = issues.filter((iss) => {
    if (iss.type !== "correction" || iss.status !== "nowe") return false;
    const existingShift = iss.shift_id
      ? shifts.find((s) => s.id === iss.shift_id)
      : null;
    const lokal = existingShift ? existingShift.lokal : iss.proposed_lokal;
    return hasAccessToLokal(lokal);
  });

  // --- WNIOSKI O WOLNE OCZEKUJĄCE NA DECYZJĘ (absences.status === "pending") ---
  // Giełda: kierownik decyduje dopiero wtedy, gdy ktoś już zgłosił się po
  // zmianę ("przyjeta"). Sama oferta wisząca na giełdzie nie wymaga decyzji.
  const pendingSwaps = (shiftSwaps || []).filter(
    (s) => s.status === "przyjeta" && hasAccessToLokal(s.lokal)
  );

  const pendingAbsences = absences.filter(
    (a) => a.status === "pending" && hasAccessToLokal(a.lokal)
  );

  // Decyzja o zamianie z giełdy. Cała logika (przepisanie zmiany na nowego
  // pracownika, powiadomienia obu stron) siedzi w resolveSwap w
  // utils/swaps.ts — tutaj tylko odświeżamy stan.
  const handleResolveSwap = async (swap, decision) => {
    const planShift = (planShifts || []).find(
      (p) => String(p.id) === String(swap.grafik_shift_id)
    );
    if (!planShift) {
      showMsg("Nie znaleziono zmiany, której dotyczy zamiana.", "error");
      return;
    }
    try {
      const res = await resolveSwap({
        swap,
        planShift,
        decision,
        editorName: currentUser.name,
      });
      setShiftSwaps((shiftSwaps || []).map((s) => (s.id === res.swap.id ? res.swap : s)));
      if (res.planShift) {
        setPlanShifts(
          (planShifts || []).map((p) => (p.id === res.planShift.id ? res.planShift : p))
        );
      }
      showMsg(
        decision === "approve" ? "Zamiana zatwierdzona." : "Zamiana odrzucona."
      );
    } catch (err) {
      showMsg(`Błąd zapisu zamiany: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const handleResolveAbsence = async (absence, decision) => {
    const user = users.find((u) => u.id === absence.user_id);
    const { absence: updated, createdShifts } = await resolveAbsenceRequest({
      absence,
      user,
      editorName: currentUser.name,
      decision,
    });
    setAbsences(absences.map((a) => (a.id === updated.id ? updated : a)));
    if (createdShifts.length > 0) {
      setShifts([...shifts, ...createdShifts]);
    }
  };

  const handleAddUrlop = async (user, startDate, endDate, note) => {
    const { absence, createdShifts } = await addUrlopDirectly({
      user,
      startDate,
      endDate,
      editorName: currentUser.name,
      note,
    });
    setAbsences([...absences, absence]);
    setShifts([...shifts, ...createdShifts]);
  };

  const handleDeleteAbsence = async (absence) => {
    const { deletedShiftIds } = await deleteAbsence(absence, shifts);
    setAbsences(absences.filter((a) => a.id !== absence.id));
    if (deletedShiftIds.length > 0) {
      setShifts(shifts.filter((s) => !deletedShiftIds.includes(s.id)));
    }
  };

  useEffect(() => {
    if (tab !== "powiadomienia") return;
    const unreadIds = managerNotifications
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
  }, [tab]);

  const [fMonth, setFMonth] = useState(new Date().getMonth());
  const [fYear, setFYear] = useState(new Date().getFullYear());
  const [fDateFrom, setFDateFrom] = useState("");
  const [fDateTo, setFDateTo] = useState("");
  const [fLokal, setFLokal] = useState("");
  const [fStanowisko, setFStanowisko] = useState("");
  const [fName, setFName] = useState("");

  const [editingUser, setEditingUser] = useState(null);
  const [editingDict, setEditingDict] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    userId: "",
    date: "",
    start: "",
    end: "",
    lokal: "",
    stanowisko: "",
  });

  const handleNewUserClick = () =>
    setEditingUser({
      id: null,
      name: "",
      email: "",
      pin: "",
      role: "closed",
      active: true,
      default_lokal: "",
      default_stanowisko: "",
      allowed_lokale: [],
      sanepid_expiry: "",
      umowa_expiry: "",
      kiosk_pin: "",
      stawka: "",
      etat: "",
      notatki: "",
    });

  const activeLokale = lokale.filter((l) => !l.archived);
  const activeStanowiska = stanowiska.filter((s) => !s.archived);

  const visibleUsers = users.filter(
    (u) => !u.archived && hasAccessToLokal(u.default_lokal)
  );
  const archivedUsers = users.filter(
    (u) => u.archived && hasAccessToLokal(u.default_lokal)
  );
  const availableLokaleForManager = activeLokale.filter((l) =>
    hasAccessToLokal(l.name)
  );

  const archivedLokale = lokale.filter((l) => l.archived);
  const archivedStanowiska = stanowiska.filter((s) => s.archived);

  // --- NOWA RAMKA (ManagerShell): pasek lokali u góry + filtr na Pulpicie ---
  const lokaleForTabs =
    !isLocalManager || managerLokaleList.length > 1
      ? [
          { key: "ALL", label: isLocalManager ? "Wszystkie moje" : "Cała sieć" },
          ...availableLokaleForManager.map((l) => ({ key: l.name, label: l.name })),
        ]
      : availableLokaleForManager.map((l) => ({ key: l.name, label: l.name }));
  useEffect(() => {
    if (lokaleForTabs.length > 0 && !lokaleForTabs.find((l) => l.key === selectedLokal)) {
      setSelectedLokal(lokaleForTabs[0].key);
    }
  }, [isLocalManager, managerLokaleList.join(",")]);
  const matchesLokalFilter = (lokalName) =>
    hasAccessToLokal(lokalName) &&
    (selectedLokal === "ALL" || lokalName === selectedLokal);

  // Pogoda w pasku górnym: dla wybranego lokalu, albo (przy "Cała
  // sieć"/"Wszystkie moje") dla pierwszego dostępnego — pokazywanie kilku
  // miast naraz nie mieściłoby się w tym samym miejscu.
  const weatherLokalName =
    selectedLokal !== "ALL" ? selectedLokal : availableLokaleForManager[0]?.name;
  const weatherCity = lokale.find((l) => l.name === weatherLokalName)?.miasto || null;

  const today0ForTerminy = new Date();
  today0ForTerminy.setHours(0, 0, 0, 0);
  const pracownicyTerminyCount = users.filter((u) => {
    if (!u.active || u.archived || u.role === "kiosk") return false;
    if (!hasAccessToLokal(u.default_lokal)) return false;
    const overdue = (field) => {
      if (!u[field]) return true;
      return new Date(u[field] + "T00:00:00") < today0ForTerminy;
    };
    return overdue("sanepid_expiry") || overdue("umowa_expiry");
  }).length;

  // Tylko zadania wspólne dla lokalu (scope="lokal"), po terminie, bez
  // wykonania — świadomie NIE rozbite po pracownikach, żeby jedno
  // przeterminowane zadanie nie zawyżało licznika przez wielu ludzi.
  const todayStrForBadge = toLocalYMD(new Date());
  const nowTimeStr = new Date().toTimeString().slice(0, 5);
  const zadaniaOverdueCount = tasks.filter(
    (t) =>
      !t.for_manager &&
      !t.archived &&
      hasAccessToLokal(t.lokal) &&
      t.deadline_time &&
      t.deadline_time.slice(0, 5) < nowTimeStr &&
      isTaskDueOn(t, taskCompletions, todayStrForBadge) &&
      !findSharedCompletion(taskCompletions, t.id, todayStrForBadge)
  ).length;

  const shellBadges = {
    zatwierdzanie:
      pendingCorrections.length + pendingAbsences.length + pendingSwaps.length,
    zgloszenia: issues.filter((i) => i.status === "nowe" && i.type !== "correction")
      .length,
    powiadomienia: unreadManagerCount,
    pracownicy: pracownicyTerminyCount,
    zadania: zadaniaOverdueCount,
  };

  // --- PULPIT (Dashboard godzin) ---
  const ALLOWED_PULPIT_ROLES = ["closed", "open", "manager_lokalu"];

  const [pMode, setPMode] = useState("miesiac"); // "tydzien" | "miesiac"
  const [pMonday, setPMonday] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [pMonth, setPMonth] = useState(new Date().getMonth());
  const [pYear, setPYear] = useState(new Date().getFullYear());
  const [pLokal, setPLokal] = useState("");

  const pShiftWeek = (delta) => {
    const d = new Date(pMonday);
    d.setDate(d.getDate() + delta * 7);
    setPMonday(d);
  };
  const pShiftMonth = (delta) => {
    let m = pMonth + delta;
    let y = pYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setPMonth(m);
    setPYear(y);
  };

  let pPeriodStart, pPeriodEnd, pDays;
  if (pMode === "tydzien") {
    pPeriodStart = new Date(pMonday);
    pPeriodEnd = new Date(pMonday);
    pPeriodEnd.setDate(pPeriodEnd.getDate() + 7);
    pDays = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(pMonday);
      d.setDate(d.getDate() + i);
      return d;
    });
  } else {
    pPeriodStart = new Date(pYear, pMonth, 1);
    pPeriodEnd = new Date(pYear, pMonth + 1, 1);
    const daysInMonth = new Date(pYear, pMonth + 1, 0).getDate();
    pDays = Array.from({ length: daysInMonth }).map(
      (_, i) => new Date(pYear, pMonth, i + 1)
    );
  }

  const pPeriodLenMs = pPeriodEnd.getTime() - pPeriodStart.getTime();
  const pPrevStart = new Date(pPeriodStart.getTime() - pPeriodLenMs);
  const pPrevEnd = new Date(pPeriodStart);

  const computeHours = (s) =>
    s.end_time ? (s.end_time - s.start_time) / (1000 * 60 * 60) : 0;

  const pMatchesFilters = (s) =>
    hasAccessToLokal(s.lokal) && (!pLokal || s.lokal === pLokal);

  const pShiftsInRange = (start, end) =>
    shifts.filter(
      (s) => pMatchesFilters(s) && s.start_time >= start && s.start_time < end
    );

  const pulpitShifts = pShiftsInRange(pPeriodStart, pPeriodEnd);
  const pPrevShifts = pShiftsInRange(pPrevStart, pPrevEnd);

  const pNamesWithShifts = new Set(pulpitShifts.map((s) => s.user_name));
  const pulpitEmployees = users
    .filter((u) => !u.archived && ALLOWED_PULPIT_ROLES.includes(u.role))
    .filter((u) => hasAccessToLokal(u.default_lokal))
    .filter(
      (u) =>
        !pLokal || u.default_lokal === pLokal || pNamesWithShifts.has(u.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const pRows = pulpitEmployees.map((u) => {
    const dayValues = pDays.map((d) => {
      const dayShifts = pulpitShifts.filter(
        (s) =>
          s.user_name === u.name &&
          s.start_time.toDateString() === d.toDateString()
      );
      const hours = dayShifts.reduce((sum, s) => sum + computeHours(s), 0);
      return { hours, shifts: dayShifts };
    });
    const totalHours = dayValues.reduce((sum, v) => sum + v.hours, 0);
    const workDays = dayValues.filter((v) => v.shifts.length > 0).length;
    return { user: u, dayValues, totalHours, workDays };
  });

  const pCurrentTotal = pRows.reduce((sum, r) => sum + r.totalHours, 0);
  const pPrevTotal = pPrevShifts.reduce((sum, s) => sum + computeHours(s), 0);
  const pDynamika =
    pPrevTotal > 0 ? ((pCurrentTotal - pPrevTotal) / pPrevTotal) * 100 : null;
  const pActiveCount = pRows.filter((r) => r.totalHours > 0).length;
  const pAvgPerEmployee = pActiveCount > 0 ? pCurrentTotal / pActiveCount : 0;
  const pMaxPerEmployee = pRows.reduce(
    (max, r) => Math.max(max, r.totalHours),
    0
  );
  const pWorkingDays = pDays.filter((d) =>
    pulpitShifts.some((s) => s.start_time.toDateString() === d.toDateString())
  ).length;
  const pAvgPerDay = pWorkingDays > 0 ? pCurrentTotal / pWorkingDays : 0;

  const fmtH = (n) => (n || 0).toFixed(1).replace(".", ",");

  const openPulpitCell = (dayValue) => {
    if (!dayValue || dayValue.shifts.length === 0) return;
    openEditShift(dayValue.shifts[0]);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const dataToSave = { ...editingUser };
      if (dataToSave.role === "open") {
        dataToSave.email = "";
        dataToSave.pin = "";
      }
      // Puste "" z <input type="date"> Postgres odrzuca jako nieprawidłową
      // datę (kolumna date, nullable) — trzeba jawnie zamienić na null.
      if (!dataToSave.sanepid_expiry) dataToSave.sanepid_expiry = null;
      if (!dataToSave.umowa_expiry) dataToSave.umowa_expiry = null;
      // To samo dla stawka (numeric) — pusty string zamiast liczby.
      dataToSave.stawka =
        dataToSave.stawka === "" || dataToSave.stawka == null
          ? null
          : Number(dataToSave.stawka);
      // Ślad "kto i kiedy ostatnio zmienił notatkę" — tylko gdy notatka
      // faktycznie się zmieniła względem tego, co jest w bazie teraz.
      const existingUser = editingUser.id
        ? users.find((u) => u.id === editingUser.id)
        : null;
      if (!existingUser || (existingUser.notatki || "") !== (dataToSave.notatki || "")) {
        dataToSave.notatki_updated_by = currentUser.name;
        dataToSave.notatki_updated_at = new Date().toISOString();
      }
      if (
        (dataToSave.role === "kiosk" || dataToSave.role === "manager_lokalu") &&
        Array.isArray(dataToSave.allowed_lokale)
      ) {
        dataToSave.allowed_lokale = dataToSave.allowed_lokale.join(",");
      }
      // allowed_stanowiska (Grafik) — ta sama konwersja tablica → tekst po
      // przecinku co allowed_lokale wyżej, ale dla każdej roli poza kiosk.
      if (Array.isArray(dataToSave.allowed_stanowiska)) {
        dataToSave.allowed_stanowiska =
          dataToSave.allowed_stanowiska.length > 0
            ? dataToSave.allowed_stanowiska.join(",")
            : null;
      }

      if (editingUser.id) {
        const u = await api.patch("users", editingUser.id, dataToSave);
        setUsers(users.map((user) => (user.id === u.id ? u : user)));
      } else {
        delete dataToSave.id;
        const u = await api.post("users", dataToSave);
        setUsers([...users, u]);
      }
      setEditingUser(null);
      showMsg("Zapisano pracownika!");
    } catch (err) {
      showMsg(`Błąd zapisu pracownika: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const handleArchiveEntity = async (table, id, isArchiving) => {
    if (
      !window.confirm(
        isArchiving ? "Zarchiwizować ten element?" : "Przywrócić z archiwum?"
      )
    )
      return;
    try {
      const res = await api.patch(table, id, { archived: isArchiving });
      if (table === "users")
        setUsers(users.map((u) => (u.id === id ? res : u)));
      if (table === "lokale")
        setLokale(lokale.map((l) => (l.id === id ? res : l)));
      if (table === "stanowiska")
        setStanowiska(stanowiska.map((s) => (s.id === id ? res : s)));
      showMsg(
        isArchiving ? "Przeniesiono do archiwum" : "Przywrócono z archiwum"
      );
    } catch (err) {
      showMsg("Błąd archiwizacji", "error");
    }
  };

  const handlePermanentDelete = async (table, id) => {
    if (
      !window.confirm(
        "TRWAŁE USUNIĘCIE. Tej operacji nie można cofnąć! Jesteś pewien?"
      )
    )
      return;
    try {
      await api.delete(table, id);
      if (table === "users") setUsers(users.filter((u) => u.id !== id));
      if (table === "lokale") setLokale(lokale.filter((l) => l.id !== id));
      if (table === "stanowiska")
        setStanowiska(stanowiska.filter((s) => s.id !== id));
      showMsg("Trwale usunięto element");
    } catch (err) {
      showMsg("Nie udało się usunąć", "error");
    }
  };

  const handleSaveDict = async (e, type) => {
    e.preventDefault();
    try {
      if (type === "lokale") {
        const payload = {
          name: editingDict.name,
          miasto: editingDict.miasto || null,
        };
        if (editingDict.id) {
          const l = await api.patch("lokale", editingDict.id, payload);
          setLokale(lokale.map((lok) => (lok.id === l.id ? l : lok)));
        } else {
          const l = await api.post("lokale", payload);
          setLokale([...lokale, l]);
        }
      } else {
        const payload = {
          name: editingDict.name,
          lokal_name: editingDict.lokal_name,
          skrot: editingDict.skrot || null,
          kolor: editingDict.kolor || null,
        };
        if (editingDict.id) {
          const s = await api.patch("stanowiska", editingDict.id, payload);
          setStanowiska(stanowiska.map((st) => (st.id === s.id ? s : st)));
        } else {
          const s = await api.post("stanowiska", payload);
          setStanowiska([...stanowiska, s]);
        }
      }
      setEditingDict(null);
      showMsg("Zapisano w bazie!");
    } catch (err) {
      showMsg("Błąd zapisu słownika!", "error");
    }
  };

  const resolveIssue = async (id) => {
    try {
      const i = await api.patch("issues", id, { status: "rozwiazane" });
      setIssues(issues.map((iss) => (iss.id === i.id ? i : iss)));
      showMsg("Zgłoszenie rozwiązane!");
    } catch (err) {
      showMsg("Błąd!", "error");
    }
  };

  // "Utwórz zadanie" w Zgłoszeniach — tworzy zadanie kierownika (for_manager)
  // powiązane luźno z issue przez source_issue_id (text, bez FK — ten sam
  // wzorzec co shift_id/issue_id w shift_edits), żeby dało się je odróżnić
  // po odświeżeniu strony (badge "Zadanie utworzone" w Zgloszenia.tsx).
  const handleCreateTaskFromIssue = async (issue, title, lokalForTask) => {
    if (!title.trim() || !lokalForTask) {
      return showMsg("Brak tytułu albo lokalu dla zadania.", "error");
    }
    try {
      const created = await api.post("tasks", {
        lokal: lokalForTask,
        title: title.trim(),
        schedule_type: "ogolne",
        for_manager: true,
        source_issue_id: issue.id,
      });
      setTasks((prev) => [...prev, created]);
      showMsg("Zadanie utworzone!");
    } catch (err) {
      showMsg(`Błąd tworzenia zadania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const openEditShift = (shift) => {
    setEditingShift(shift);
    setShiftForm({
      userId: shift.user_id || "",
      date: shift.start_time.toISOString().split("T")[0],
      start: shift.start_time.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      end: shift.end_time
        ? shift.end_time.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
      lokal: shift.lokal,
      stanowisko: shift.stanowisko,
    });
  };

  // "+ Dodaj wpis" w Rejestr Godzin — ten sam modal co edycja, tylko
  // editingShift.id === null włącza w JSX pole wyboru pracownika i w
  // handleSaveShiftEdit gałąź api.post zamiast api.patch.
  const openNewShift = () => {
    const now = new Date();
    setEditingShift({ id: null, user_id: "", user_name: "", start_time: now, end_time: null });
    setShiftForm({
      userId: "",
      date: now.toISOString().split("T")[0],
      start: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      end: "",
      lokal: availableLokaleForManager[0]?.name || "",
      stanowisko: "",
    });
  };

  const isNewShift = editingShift && editingShift.id === null;

  // --- OTO MAGIA GOOGLE SHEETS DLA EDYCJI (i tworzenia — "+ Dodaj wpis") ---
  const handleSaveShiftEdit = async (e) => {
    e.preventDefault();
    try {
      if (isNewShift && !shiftForm.userId) {
        return showMsg("Wybierz pracownika!", "error");
      }
      const [year, month, day] = shiftForm.date.split("-").map(Number);
      const [startH, startM] = shiftForm.start.split(":").map(Number);
      const startD = new Date(year, month - 1, day, startH, startM);
      let endD = null,
        hrs = null;
      if (shiftForm.end) {
        const [endH, endM] = shiftForm.end.split(":").map(Number);
        endD = new Date(year, month - 1, day, endH, endM);
        if (endD < startD) endD.setDate(endD.getDate() + 1);
        hrs = parseFloat(((endD - startD) / (1000 * 60 * 60)).toFixed(2));
      }

      // Kierownik może naprawiać już niespójne dane, więc tylko ostrzegamy
      // (w przeciwieństwie do twardej blokady u pracownika w TimeEntryForm).
      const overlapping = findOverlappingShift(
        shifts,
        shiftForm.userId || editingShift.user_id,
        startD,
        endD,
        editingShift.id
      );
      if (overlapping) {
        const fmt = (d) =>
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const confirmed = window.confirm(
          `Ta zmiana nakłada się na inną zapisaną zmianę tego pracownika (${fmt(
            overlapping.start_time
          )}–${fmt(overlapping.end_time)}). Zapisać mimo to?`
        );
        if (!confirmed) return;
      }

      let updated;
      if (isNewShift) {
        const user = users.find((u) => u.id === shiftForm.userId);
        updated = await api.post("shifts", {
          user_id: shiftForm.userId,
          user_name: user?.name || "",
          start_time: startD.toISOString(),
          end_time: endD ? endD.toISOString() : null,
          lokal: shiftForm.lokal,
          stanowisko: shiftForm.stanowisko,
          godzin: hrs,
        });
      } else {
        updated = await api.patch("shifts", editingShift.id, {
          start_time: startD.toISOString(),
          end_time: endD ? endD.toISOString() : null,
          lokal: shiftForm.lokal,
          stanowisko: shiftForm.stanowisko,
          godzin: hrs,
        });
      }
      const parsed = {
        ...updated,
        start_time: new Date(updated.start_time),
        end_time: updated.end_time ? new Date(updated.end_time) : null,
      };
      setShifts(
        isNewShift
          ? [...shifts, parsed]
          : shifts.map((s) => (s.id === parsed.id ? parsed : s))
      );

      // Powiadomienie dla pracownika o edycji zmiany (nie dotyczy nowego wpisu)
      if (!isNewShift) {
        const oldStart = editingShift.start_time;
        const oldEnd = editingShift.end_time;
        const changed =
          oldStart.getTime() !== startD.getTime() ||
          (oldEnd ? oldEnd.getTime() : null) !== (endD ? endD.getTime() : null);
        if (changed) {
          notifyEmployee(parsed, "edit", oldStart, oldEnd, startD, endD);
        }
      }

      // Automatyczna poprawka w Google Sheets — w tle, nie czekamy (Supabase
      // to źródło prawdy, Apps Script bywa wolny).
      sendToGoogleSheets(parsed, isNewShift ? "ADD_SHIFT" : "EDIT_SHIFT");

      setEditingShift(null);
      showMsg(isNewShift ? "Wpis dodany!" : "Zmiana zaktualizowana!");
    } catch (err) {
      showMsg(
        `Błąd zapisu: ${err.message || "nieznany błąd"}`,
        "error"
      );
    }
  };

  // --- OTO MAGIA GOOGLE SHEETS DLA USUWANIA ---
  const handleDeleteShift = async () => {
    if (
      !window.confirm(
        "Usunąć tę zmianę całkowicie? Zostanie również usunięta z Google Sheets."
      )
    )
      return;
    try {
      await api.delete("shifts", editingShift.id);
      setShifts(shifts.filter((s) => s.id !== editingShift.id));

      // Powiadomienie dla pracownika o usunięciu zmiany
      notifyEmployee(
        editingShift,
        "delete",
        editingShift.start_time,
        editingShift.end_time,
        null,
        null
      );

      // Automatyczne usunięcie z Google Sheets — w tle, patrz komentarz
      // w handleSaveShiftEdit.
      sendToGoogleSheets(editingShift, "DELETE_SHIFT");

      setEditingShift(null);
      showMsg("Zapis usunięty z Bazy.");
    } catch (err) {
      showMsg("Błąd usuwania.", "error");
    }
  };

  const filteredShifts = shifts
    .filter((s) => {
      if (!hasAccessToLokal(s.lokal)) return false;
      let matchDate = true;
      if (fDateFrom || fDateTo) {
        const sDate = new Date(s.start_time);
        sDate.setHours(0, 0, 0, 0);
        if (fDateFrom) {
          const from = new Date(fDateFrom);
          from.setHours(0, 0, 0, 0);
          if (sDate < from) matchDate = false;
        }
        if (fDateTo) {
          const to = new Date(fDateTo);
          to.setHours(0, 0, 0, 0);
          if (sDate > to) matchDate = false;
        }
      } else {
        matchDate =
          s.start_time.getMonth() === fMonth &&
          s.start_time.getFullYear() === fYear;
      }
      return (
        matchDate &&
        (fLokal ? s.lokal === fLokal : true) &&
        (fStanowisko ? s.stanowisko === fStanowisko : true) &&
        (fName ? s.user_name.toLowerCase().includes(fName.toLowerCase()) : true)
      );
    })
    .sort((a, b) => b.start_time - a.start_time);

  let totalFilteredHours = 0;
  filteredShifts.forEach((s) => {
    if (s.end_time)
      totalFilteredHours += (s.end_time - s.start_time) / (1000 * 60 * 60);
  });

  const isEmailPinRequired = editingUser && editingUser.role !== "open";
  // Przy tworzeniu nowego pracownika terminy są zawsze puste na starcie —
  // czerwone podświetlenie tam tylko myli (wygląda na wymagane, choć nie
  // jest). Pokazujemy je dopiero przy edycji istniejącego pracownika.
  const showTermWarnings = editingUser && !!editingUser.id;

  const wBudowieLabel = NAV_ITEMS.find((n) => n.key === tab)?.label || tab;
  const tabsWithOldContent = [];
  // "moja_praca" jest już aktywna (nie w kolejności makiet, ale kierownik
  // sam odbija godziny i nie mógł ich zapisać podczas przebudowy reszty).

  return (
    <ManagerShell
      currentUser={currentUser}
      isLocalManager={isLocalManager}
      lokaleForTabs={lokaleForTabs}
      selectedLokal={selectedLokal}
      setSelectedLokal={setSelectedLokal}
      weatherCity={weatherCity}
      activeTab={tab}
      setActiveTab={setTab}
      badges={shellBadges}
      onLogout={() => setCurrentView("login")}
    >
      <div className="relative">
        {editingShift && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-xl font-bold">
                  {isNewShift ? "Nowy wpis" : `Edycja: ${editingShift.user_name}`}
                </h3>
                <button
                  onClick={() => setEditingShift(null)}
                  className="text-gray-500"
                >
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveShiftEdit} className="space-y-4">
                {isNewShift && (
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Pracownik
                    </label>
                    <select
                      value={shiftForm.userId}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, userId: e.target.value })
                      }
                      className="w-full p-2 border rounded bg-gray-50"
                      required
                    >
                      <option value="">-- Wybierz --</option>
                      {visibleUsers
                        .filter((u) => u.role !== "kiosk")
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Lokal
                    </label>
                    <select
                      value={shiftForm.lokal}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, lokal: e.target.value })
                      }
                      className="w-full p-2 border rounded bg-gray-50"
                    >
                      {availableLokaleForManager.map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Stanowisko
                    </label>
                    <select
                      value={shiftForm.stanowisko}
                      onChange={(e) =>
                        setShiftForm({
                          ...shiftForm,
                          stanowisko: e.target.value,
                        })
                      }
                      className="w-full p-2 border rounded bg-gray-50"
                    >
                      {activeStanowiska
                        .filter((s) => s.lokal_name === shiftForm.lokal)
                        .map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600">
                    Data (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, date: e.target.value })
                    }
                    className="w-full p-2 border rounded bg-gray-50"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Start
                    </label>
                    <input
                      type="time"
                      value={shiftForm.start}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, start: e.target.value })
                      }
                      className="w-full p-2 border rounded font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600">
                      Koniec
                    </label>
                    <input
                      type="time"
                      value={shiftForm.end}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, end: e.target.value })
                      }
                      className="w-full p-2 border rounded font-mono"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-6 pt-4 border-t">
                  {!isNewShift && (
                    <button
                      type="button"
                      onClick={handleDeleteShift}
                      className="flex-none p-2 bg-red-100 text-red-700 font-bold rounded flex hover:bg-red-200"
                      title="Usuń zmianę z bazy"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingShift(null)}
                    className="flex-1 p-2 bg-gray-200 font-bold rounded"
                  >
                    Anuluj
                  </button>
                  <button
                    type="submit"
                    className="flex-1 p-2 bg-blue-600 text-white font-bold rounded flex justify-center gap-2"
                  >
                    <Save size={18} />
                    Zapisz
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {tab === "pulpit" && (
          <PulpitHome
            users={users}
            shifts={shifts}
            issues={issues}
            tasks={tasks}
            taskCompletions={taskCompletions}
            absences={absences}
            matchesFilter={matchesLokalFilter}
            setActiveTab={setTab}
          />
        )}
        {tab === "raporty" && (
          <RaportyIKoszty
            users={users}
            shifts={shifts}
            matchesFilter={matchesLokalFilter}
            onEditShift={openEditShift}
            selectedUserId={reportUserId}
            setSelectedUserId={setReportUserId}
          />
        )}

        {tab === "przewodnik" && <Przewodnik />}

        {tab === "zadania" && (
          <ZadaniaISprzatanie
            currentUser={currentUser}
            tasks={tasks}
            setTasks={setTasks}
            taskCompletions={taskCompletions}
            setTaskCompletions={setTaskCompletions}
            matchesFilter={matchesLokalFilter}
            availableLokale={availableLokaleForManager}
            activeStanowiska={activeStanowiska}
            selectedLokal={selectedLokal}
            showMsg={showMsg}
          />
        )}

        {tab === "grafik" && (
          <Grafik
            currentUser={currentUser}
            selectedLokal={selectedLokal}
            availableLokaleForManager={availableLokaleForManager}
            lokale={lokale}
            users={users}
            setUsers={setUsers}
            activeStanowiska={activeStanowiska}
            planShifts={planShifts}
            setPlanShifts={setPlanShifts}
            shiftSwaps={shiftSwaps}
            onResolveSwap={handleResolveSwap}
            absences={absences}
            staffingRules={staffingRules}
            setStaffingRules={setStaffingRules}
            staffingRuleSets={staffingRuleSets}
            setStaffingRuleSets={setStaffingRuleSets}
            lokaleGodziny={lokaleGodziny}
            setLokaleGodziny={setLokaleGodziny}
            grafikWyjatki={grafikWyjatki}
            setGrafikWyjatki={setGrafikWyjatki}
            showMsg={showMsg}
          />
        )}

        {tab !== "pulpit" &&
          tab !== "grafik" &&
          tab !== "moja_praca" &&
          tab !== "godziny" &&
          tab !== "zatwierdzanie" &&
          tab !== "aktywni" &&
          tab !== "zgloszenia" &&
          tab !== "pracownicy" &&
          tab !== "raporty" &&
          tab !== "przewodnik" &&
          tab !== "powiadomienia" &&
          tab !== "zadania" && (
          <WBudowie
            label={wBudowieLabel}
            hasOldContent={tabsWithOldContent.includes(tab)}
          />
        )}

        {/* Poniżej stara zawartość zakładek — celowo martwa (false &&),
            budujemy nowy wygląd po kolei zgodnie z makietami; żeby
            "przywrócić" zakładkę, wystarczy wyjąć jej blok spod tego
            wrappera i podpiąć pod nowy tab === "..." dispatch wyżej. */}
        {false && (
        <div className="max-w-full mx-auto">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-2xl font-bold mr-auto">Pulpit godzin</h2>

              <div className="flex bg-white border rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setPMode("tydzien")}
                  className={`px-3 py-1.5 rounded text-sm font-bold ${
                    pMode === "tydzien"
                      ? "bg-blue-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  Tydzień
                </button>
                <button
                  onClick={() => setPMode("miesiac")}
                  className={`px-3 py-1.5 rounded text-sm font-bold ${
                    pMode === "miesiac"
                      ? "bg-blue-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  Miesiąc
                </button>
              </div>

              {pMode === "tydzien" ? (
                <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm">
                  <button
                    onClick={() => pShiftWeek(-1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="font-bold text-sm px-2 whitespace-nowrap">
                    {pMonday.toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    -{" "}
                    {new Date(
                      pPeriodEnd.getTime() - 86400000
                    ).toLocaleDateString("pl-PL", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <button
                    onClick={() => pShiftWeek(1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-white border rounded-lg p-1 shadow-sm">
                  <button
                    onClick={() => pShiftMonth(-1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="font-bold text-sm px-2 whitespace-nowrap capitalize">
                    {getMonthName(pMonth)} {pYear}
                  </span>
                  <button
                    onClick={() => pShiftMonth(1)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}

              <select
                value={pLokal}
                onChange={(e) => setPLokal(e.target.value)}
                className="p-2 border rounded-lg bg-white text-sm"
              >
                <option value="">Wszystkie lokale</option>
                {availableLokaleForManager.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">⬅️ Poprz. okres</p>
                <p className="text-lg font-bold">{fmtH(pPrevTotal)} h</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">📊 Dynamika</p>
                <p
                  className={`text-lg font-bold ${
                    pDynamika === null
                      ? "text-gray-400"
                      : pDynamika >= 0
                      ? "text-green-600"
                      : "text-red-500"
                  }`}
                >
                  {pDynamika === null
                    ? "-"
                    : `${pDynamika >= 0 ? "+" : ""}${pDynamika.toFixed(1)}%`}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">👥 Średnio na prac.</p>
                <p className="text-lg font-bold">{fmtH(pAvgPerEmployee)} h</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">📅 Dni robocze</p>
                <p className="text-lg font-bold">{pWorkingDays}</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">🔥 Max godzin/prac.</p>
                <p className="text-lg font-bold">{fmtH(pMaxPerEmployee)} h</p>
              </div>
              <div className="bg-white p-3 rounded-lg border shadow-sm">
                <p className="text-xs text-gray-500">📈 Średnio dziennie</p>
                <p className="text-lg font-bold">{fmtH(pAvgPerDay)} h</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-gray-100 p-2 text-left border-b border-r z-20 min-w-[130px]">
                      Imię
                    </th>
                    <th className="sticky left-[130px] bg-gray-100 p-2 text-center border-b border-r z-20 min-w-[70px]">
                      Godzin
                    </th>
                    <th className="sticky left-[200px] bg-gray-100 p-2 text-center border-b border-r z-20 min-w-[70px]">
                      Dni
                    </th>
                    {pDays.map((d, i) => {
                      const isToday =
                        d.toDateString() === new Date().toDateString();
                      return (
                        <th
                          key={i}
                          className={`p-1 text-center border-b min-w-[52px] ${
                            isToday ? "bg-blue-50" : "bg-gray-100"
                          }`}
                        >
                          <div className="text-[10px] text-gray-400 uppercase">
                            {getDayOfWeek(d)}
                          </div>
                          <div className="font-bold text-xs">{d.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3 + pDays.length}
                        className="p-6 text-center text-gray-400"
                      >
                        Brak pracowników do wyświetlenia
                      </td>
                    </tr>
                  )}
                  {pRows.map((row) => (
                    <tr key={row.user.id} className="border-b hover:bg-gray-50">
                      <td className="sticky left-0 bg-white p-2 font-semibold border-r whitespace-nowrap z-10">
                        {row.user.name}
                      </td>
                      <td className="sticky left-[130px] bg-blue-50 p-2 text-center font-bold text-blue-700 border-r z-10">
                        {fmtH(row.totalHours)}
                      </td>
                      <td className="sticky left-[200px] bg-white p-2 text-center text-gray-500 border-r z-10">
                        {row.workDays}
                      </td>
                      {row.dayValues.map((dv, i) => (
                        <td
                          key={i}
                          onClick={() => openPulpitCell(dv)}
                          className={`p-1 text-center text-xs border-r ${
                            dv.shifts.length > 0
                              ? "cursor-pointer hover:bg-blue-100 font-semibold text-gray-800"
                              : "text-gray-300"
                          }`}
                          title={
                            dv.shifts.length > 0
                              ? "Kliknij aby edytować zmianę"
                              : ""
                          }
                        >
                          {dv.shifts.length > 0
                            ? dv.hours > 0
                              ? fmtH(dv.hours)
                              : "trwa"
                            : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {false && tab === "grafik" && (
          <div className="max-w-3xl mx-auto text-center py-20">
            <Calendar size={64} className="mx-auto mb-4 text-gray-300" />
            <h2 className="text-2xl font-bold text-gray-400 mb-2">
              Grafik tygodniowy
            </h2>
            <p className="text-gray-400">
              🚧 Ta funkcja jest w budowie. Wkrótce dostępna.
            </p>
          </div>
        )}

        {tab === "godziny" && (
          <RejestrGodzin
            shifts={shifts}
            issues={issues}
            shiftEdits={shiftEdits}
            stanowiska={activeStanowiska}
            matchesFilter={matchesLokalFilter}
            onEditShift={openEditShift}
            onNewShift={openNewShift}
            onNameClick={goToEmployeeReport}
          />
        )}

        {false && tab === "godziny" && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Rejestr i Edycja Godzin</h2>
            <div className="bg-white p-4 rounded-xl shadow mb-6 border">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="col-span-1 lg:col-span-2 bg-gray-50 p-3 rounded-lg border">
                  <p className="text-xs font-bold text-gray-500 mb-2">
                    Okres (Miesiąc lub Zakres)
                  </p>
                  <div className="flex gap-2 mb-2">
                    <select
                      value={fMonth}
                      onChange={(e) => {
                        setFMonth(Number(e.target.value));
                        setFDateFrom("");
                        setFDateTo("");
                      }}
                      className="flex-1 p-2 border rounded text-sm"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i} value={i}>
                          {getMonthName(i)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={fYear}
                      onChange={(e) => setFYear(Number(e.target.value))}
                      className="w-24 p-2 border rounded text-sm"
                    >
                      {getAvailableYears().map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={fDateFrom}
                      onChange={(e) => setFDateFrom(e.target.value)}
                      className="flex-1 p-2 border rounded text-sm"
                    />
                    <input
                      type="date"
                      value={fDateTo}
                      onChange={(e) => setFDateTo(e.target.value)}
                      className="flex-1 p-2 border rounded text-sm"
                    />
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border flex flex-col justify-between">
                  <select
                    value={fLokal}
                    onChange={(e) => {
                      setFLokal(e.target.value);
                      setFStanowisko("");
                    }}
                    className="w-full p-2 border rounded text-sm mb-2"
                  >
                    <option value="">Wszystkie (Z dozwolonych)</option>
                    {availableLokaleForManager.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fStanowisko}
                    onChange={(e) => setFStanowisko(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                  >
                    <option value="">Wszystkie stanowiska</option>
                    {activeStanowiska
                      .filter((s) => (fLokal ? s.lokal_name === fLokal : true))
                      .map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg border">
                  <input
                    type="text"
                    placeholder="Wpisz imię..."
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                  />
                  <div className="mt-4 p-2 bg-blue-50 rounded border text-center">
                    <p className="text-xs font-bold text-blue-600">
                      Suma z filtra
                    </p>
                    <p className="text-xl font-bold text-blue-800">
                      {totalFilteredHours.toFixed(1)} h
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow overflow-x-auto border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Pracownik</th>
                    <th className="p-3">Lokal/Stan.</th>
                    <th className="p-3">Godziny</th>
                    <th className="p-3 text-right">Suma</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Akcja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredShifts.map((shift) => {
                    const pendingCorrection = pendingCorrections.find(
                      (iss) => iss.shift_id === shift.id
                    );
                    return (
                    <tr key={shift.id} className="hover:bg-gray-50">
                      <td className="p-3 whitespace-nowrap">
                        {shift.start_time.toLocaleDateString()}
                      </td>
                      <td className="p-3 font-semibold">{shift.user_name}</td>
                      <td className="p-3">
                        <span className="text-blue-800">
                          {getShort(shift.lokal)}
                        </span>{" "}
                        /{" "}
                        <span className="text-gray-600">
                          {getShort(shift.stanowisko)}
                        </span>
                      </td>
                      <td className="p-3 font-mono">
                        {shift.start_time.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        -{" "}
                        {shift.end_time ? (
                          shift.end_time.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        ) : (
                          <span className="text-red-500 font-sans">Trwa</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-blue-600">
                        {shift.end_time
                          ? (
                              (shift.end_time - shift.start_time) /
                              (1000 * 60 * 60)
                            ).toFixed(1) + "h"
                          : "-"}
                      </td>
                      <td className="p-3 text-center">
                        {pendingCorrection ? (
                          <button
                            onClick={() => setTab("zatwierdzanie")}
                            className="text-xs px-2 py-1 rounded font-bold bg-red-100 text-red-700 hover:bg-red-200"
                            title="Pracownik zgłosił poprawkę tej zmiany"
                          >
                            Do decyzji
                          </button>
                        ) : !shift.end_time ? (
                          <span className="text-xs px-2 py-1 rounded font-bold bg-amber-100 text-amber-700">
                            Na zmianie
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded font-bold bg-green-100 text-green-700">
                            Zatwierdzone
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => openEditShift(shift)}
                          className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 mx-auto block"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "aktywni" && (
          <Aktywni
            shifts={shifts}
            matchesFilter={matchesLokalFilter}
            onEndShift={openEditShift}
            onNameClick={goToEmployeeReport}
          />
        )}

        {false && tab === "aktywni" && (
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Trwające zmiany</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {shifts
                .filter((s) => !s.end_time && hasAccessToLokal(s.lokal))
                .map((active) => (
                  <div
                    key={active.id}
                    className="bg-white p-4 rounded-xl shadow border-l-4 border-green-500 flex items-center gap-4 relative"
                  >
                    <div className="bg-green-100 p-3 rounded-full text-green-600">
                      <Clock size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg">{active.user_name}</p>
                      <p className="text-sm text-gray-600">
                        Od: {active.start_time.toLocaleTimeString()} |{" "}
                        {active.lokal}
                      </p>
                    </div>
                    <button
                      onClick={() => openEditShift(active)}
                      className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded hover:bg-blue-700 flex-shrink-0"
                    >
                      Zakończ zmianę
                    </button>
                    <button
                      onClick={() => openEditShift(active)}
                      className="absolute top-2 right-2 text-gray-400 hover:text-blue-600 p-1"
                    >
                      <Edit2 size={16} />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "moja_praca" && (
          <MojaPraca
            currentUser={currentUser}
            lokale={availableLokaleForManager}
            stanowiska={activeStanowiska}
            shifts={shifts}
            setShifts={setShifts}
            showMsg={showMsg}
            onEditShift={openEditShift}
          />
        )}

        {tab === "zatwierdzanie" && (
          <ZatwierdzanieZmian
            currentUser={currentUser}
            shifts={shifts}
            setShifts={setShifts}
            issues={issues}
            setIssues={setIssues}
            shiftEdits={shiftEdits}
            setShiftEdits={setShiftEdits}
            hasAccessToLokal={hasAccessToLokal}
            availableLokale={availableLokaleForManager}
            activeStanowiska={activeStanowiska}
            pendingAbsences={pendingAbsences}
            onResolveAbsence={handleResolveAbsence}
            pendingSwaps={pendingSwaps}
            planShifts={planShifts}
            onResolveSwap={handleResolveSwap}
            showMsg={showMsg}
          />
        )}

        {tab === "zgloszenia" && (
          <Zgloszenia
            issues={issues}
            users={users}
            hasAccessToLokal={hasAccessToLokal}
            onResolve={resolveIssue}
            tasks={tasks}
            onCreateTaskFromIssue={handleCreateTaskFromIssue}
            fallbackLokal={availableLokaleForManager[0]?.name}
          />
        )}

        {false && tab === "zgloszenia" && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Zgłoszenia do poprawy</h2>
            <div className="space-y-4">
              {issues
                .filter((iss) => iss.type !== "correction")
                .filter((iss) =>
                  hasAccessToLokal(
                    users.find((u) => u.id === iss.user_id)?.default_lokal || ""
                  )
                )
                .map((iss) => (
                  <div
                    key={iss.id}
                    className={`p-4 rounded-xl shadow border-l-4 ${
                      iss.status === "nowe"
                        ? "border-red-500 bg-white"
                        : "border-green-500 bg-gray-50"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold">
                        {iss.user_name}{" "}
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(iss.created_at).toLocaleString()}
                        </span>
                      </p>
                      <span
                        className={`text-xs px-2 py-1 rounded font-bold ${
                          iss.status === "nowe"
                            ? "bg-red-100 text-red-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {iss.status === "nowe" ? "Nowe" : "Rozwiązane"}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-4">{iss.issue_text}</p>
                    {iss.status === "nowe" && (
                      <button
                        onClick={() => resolveIssue(iss.id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-bold"
                      >
                        Oznacz jako rozwiązane
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === "powiadomienia" && (
          <div className="max-w-4xl mx-auto">
            <h2 className="font-['Archivo'] font-extrabold text-2xl text-[#171714] mb-6">
              Powiadomienia
            </h2>
            <NotificationsPanel
              items={managerNotifications}
              showEmployeeName={false}
            />
          </div>
        )}

        {tab === "pracownicy" && (
          <Pracownicy
            visibleUsers={visibleUsers}
            archivedUsers={archivedUsers}
            editingUser={editingUser}
            setEditingUser={setEditingUser}
            onNewUser={handleNewUserClick}
            onSave={handleSaveUser}
            onArchive={handleArchiveEntity}
            onPermanentDelete={handlePermanentDelete}
            isLocalManager={isLocalManager}
            availableLokaleForManager={availableLokaleForManager}
            activeLokale={activeLokale}
            activeStanowiska={activeStanowiska}
            shifts={shifts}
            editingDict={editingDict}
            setEditingDict={setEditingDict}
            onSaveDict={handleSaveDict}
            absences={absences}
            onAddUrlop={handleAddUrlop}
            onDeleteAbsence={handleDeleteAbsence}
            showMsg={showMsg}
          />
        )}

        {false && tab === "pracownicy" && (
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Przewodnik</h2>
            <div className="flex border-b mb-6 overflow-x-auto">
              <button
                onClick={() => setPrzewodnikTab("pracownicy")}
                className={`px-4 py-3 font-bold whitespace-nowrap ${
                  przewodnikTab === "pracownicy"
                    ? "border-b-4 border-blue-500 text-blue-600"
                    : "text-gray-500"
                }`}
              >
                <Users size={18} className="inline mr-2" />
                Pracownicy
              </button>
              {!isLocalManager && (
                <button
                  onClick={() => setPrzewodnikTab("lokale")}
                  className={`px-4 py-3 font-bold whitespace-nowrap ${
                    przewodnikTab === "lokale"
                      ? "border-b-4 border-blue-500 text-blue-600"
                      : "text-gray-500"
                  }`}
                >
                  <MapPin size={18} className="inline mr-2" />
                  Lokale
                </button>
              )}
              {!isLocalManager && (
                <button
                  onClick={() => setPrzewodnikTab("stanowiska")}
                  className={`px-4 py-3 font-bold whitespace-nowrap ${
                    przewodnikTab === "stanowiska"
                      ? "border-b-4 border-blue-500 text-blue-600"
                      : "text-gray-500"
                  }`}
                >
                  <Briefcase size={18} className="inline mr-2" />
                  Stanowiska
                </button>
              )}
              <button
                onClick={() => setPrzewodnikTab("archiwum")}
                className={`px-4 py-3 font-bold whitespace-nowrap ml-auto ${
                  przewodnikTab === "archiwum"
                    ? "border-b-4 border-gray-500 text-gray-800"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Archive size={18} className="inline mr-2" />
                Archiwum
              </button>
            </div>

            {przewodnikTab === "pracownicy" && (
              <div>
                <button
                  onClick={handleNewUserClick}
                  className="mb-4 bg-green-500 text-white px-4 py-2 rounded font-bold hover:bg-green-600 flex items-center gap-2"
                >
                  <Plus size={18} /> Dodaj{" "}
                  {isLocalManager
                    ? "pracownika do swoich lokali"
                    : "użytkownika"}
                </button>
                {editingUser && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <form
                      onSubmit={handleSaveUser}
                      className="bg-white p-6 rounded-xl w-full max-w-md shadow-2xl"
                    >
                      <h3 className="text-xl font-bold mb-4 border-b pb-2">
                        {editingUser.id ? "Edytuj" : "Nowy"}: {editingUser.name}
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600">
                            Imię i nazwisko / Nazwa
                          </label>
                          <input
                            type="text"
                            value={editingUser.name}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                name: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600">
                            Typ konta
                          </label>
                          <select
                            value={editingUser.role}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                role: e.target.value,
                              })
                            }
                            className="w-full p-2 border rounded font-bold bg-blue-50"
                          >
                            <option value="closed">
                              Pracownik (Aplikacja na telefon)
                            </option>
                            <option value="open">
                              Pracownik (Otwarte Konto - Kiosk)
                            </option>
                            {!isLocalManager && (
                              <option value="kiosk">
                                Konto Służbowe (Tablet lokalu)
                              </option>
                            )}
                            {!isLocalManager && (
                              <option value="manager_lokalu">
                                Kierownik Lokalu
                              </option>
                            )}
                            {!isLocalManager && (
                              <option value="admin">Szef (Admin)</option>
                            )}
                          </select>
                        </div>

                        {isEmailPinRequired && (
                          <div className="grid grid-cols-2 gap-3 bg-blue-50 p-2 rounded border border-blue-100">
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Email / Login
                              </label>
                              <input
                                type="email"
                                value={editingUser.email}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    email: e.target.value,
                                  })
                                }
                                className="w-full p-2 border rounded"
                                required={isEmailPinRequired}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                PIN (6 cyfr)
                              </label>
                              <input
                                type="text"
                                value={editingUser.pin}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    pin: e.target.value,
                                  })
                                }
                                maxLength="6"
                                className="w-full p-2 border rounded"
                                required={isEmailPinRequired}
                              />
                            </div>
                          </div>
                        )}
                        {!isEmailPinRequired && (
                          <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded border border-yellow-200">
                            Pracownik otwartego konta nie loguje się
                            samodzielnie. Logowanie odbywa się przez{" "}
                            <b>Konto Służbowe (Kiosk)</b>.
                          </div>
                        )}

                        {(editingUser.role === "kiosk" ||
                          editingUser.role === "manager_lokalu") && (
                          <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                            <label className="block text-xs font-bold text-purple-800 mb-2">
                              Zezwól na zarządzanie lokalami (Zaznacz opcje):
                            </label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {activeLokale.map((l) => {
                                const allowedArr = Array.isArray(
                                  editingUser.allowed_lokale
                                )
                                  ? editingUser.allowed_lokale
                                  : editingUser.allowed_lokale
                                  ? editingUser.allowed_lokale
                                      .split(",")
                                      .map((s) => s.trim())
                                  : [];
                                return (
                                  <label
                                    key={l.id}
                                    className="flex items-center gap-2 cursor-pointer text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={allowedArr.includes(l.name)}
                                      onChange={(e) => {
                                        const now = e.target.checked
                                          ? [...allowedArr, l.name]
                                          : allowedArr.filter(
                                              (x) => x !== l.name
                                            );
                                        setEditingUser({
                                          ...editingUser,
                                          allowed_lokale: now,
                                        });
                                      }}
                                    />{" "}
                                    {l.name}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {editingUser.role !== "kiosk" && (
                          <div className="grid grid-cols-2 gap-3 bg-gray-50 p-2 rounded border">
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Domyślny Lokal
                              </label>
                              <select
                                value={editingUser.default_lokal || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    default_lokal: e.target.value,
                                    default_stanowisko: "",
                                  })
                                }
                                className="w-full p-2 border rounded"
                              >
                                <option value="">- Brak -</option>
                                {availableLokaleForManager.map((l) => (
                                  <option key={l.id} value={l.name}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Stanowisko
                              </label>
                              <select
                                value={editingUser.default_stanowisko || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    default_stanowisko: e.target.value,
                                  })
                                }
                                className="w-full p-2 border rounded"
                              >
                                <option value="">- Brak -</option>
                                {activeStanowiska
                                  .filter(
                                    (s) =>
                                      s.lokal_name === editingUser.default_lokal
                                  )
                                  .map((s) => (
                                    <option key={s.id} value={s.name}>
                                      {s.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}
                        {editingUser.role !== "kiosk" && (
                          <div className="grid grid-cols-2 gap-3 bg-gray-50 p-2 rounded border">
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Termin książeczki sanepid
                              </label>
                              <input
                                type="date"
                                value={editingUser.sanepid_expiry || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    sanepid_expiry: e.target.value,
                                  })
                                }
                                className={`w-full p-2 border rounded ${
                                  showTermWarnings && !editingUser.sanepid_expiry
                                    ? "border-red-400 bg-red-50"
                                    : ""
                                }`}
                              />
                              {showTermWarnings && !editingUser.sanepid_expiry && (
                                <p className="text-xs text-red-600 mt-1">
                                  Brak terminu — przypomnienia wyłączone
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-600">
                                Termin umowy
                              </label>
                              <input
                                type="date"
                                value={editingUser.umowa_expiry || ""}
                                onChange={(e) =>
                                  setEditingUser({
                                    ...editingUser,
                                    umowa_expiry: e.target.value,
                                  })
                                }
                                className={`w-full p-2 border rounded ${
                                  showTermWarnings && !editingUser.umowa_expiry
                                    ? "border-red-400 bg-red-50"
                                    : ""
                                }`}
                              />
                              {showTermWarnings && !editingUser.umowa_expiry && (
                                <p className="text-xs text-red-600 mt-1">
                                  Brak terminu — przypomnienia wyłączone
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <label className="flex items-center gap-2 pt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingUser.active}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                active: e.target.checked,
                              })
                            }
                            className="w-5 h-5 rounded"
                          />
                          <span className="font-bold text-gray-700">
                            Konto aktywne
                          </span>
                        </label>
                      </div>
                      <div className="flex gap-2 mt-6">
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="flex-1 p-2 bg-gray-200 font-bold rounded"
                        >
                          Anuluj
                        </button>
                        <button
                          type="submit"
                          className="flex-1 p-2 bg-blue-600 text-white font-bold rounded"
                        >
                          Zapisz
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                <div className="grid gap-3">
                  {visibleUsers.map((u) => (
                    <div
                      key={u.id}
                      className={`bg-white p-4 rounded-lg shadow border flex items-center justify-between ${
                        !u.active && "opacity-60 bg-gray-50"
                      }`}
                    >
                      <div>
                        <p className="font-bold text-lg">
                          {u.name}{" "}
                          {!u.active && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded ml-2">
                              Odłączony
                            </span>
                          )}
                          {u.active && u.role !== "kiosk" && !u.sanepid_expiry && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded ml-2">
                              Brak terminu sanepid
                            </span>
                          )}
                          {u.active && u.role !== "kiosk" && !u.umowa_expiry && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded ml-2">
                              Brak terminu umowy
                            </span>
                          )}
                        </p>
                        <div className="text-sm text-gray-500 mt-1 flex gap-4">
                          <span className="bg-gray-100 px-2 py-1 rounded">
                            Typ:{" "}
                            <b>
                              {u.role === "open"
                                ? "Otwarte Konto (Kiosk)"
                                : u.role === "closed"
                                ? "Aplikacja"
                                : u.role === "manager_lokalu"
                                ? "Kierownik Lokalu"
                                : u.role === "kiosk"
                                ? "Kiosk Służbowy"
                                : "Szef (Admin)"}
                            </b>
                          </span>
                          {u.default_lokal && (
                            <span>
                              Domyślnie:{" "}
                              <b className="text-blue-600">{u.default_lokal}</b>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingUser({ ...u })}
                          className="p-2 text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() =>
                            handleArchiveEntity("users", u.id, true)
                          }
                          className="p-2 text-gray-500 hover:text-red-500 bg-gray-100 rounded"
                          title="Do archiwum"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {przewodnikTab === "archiwum" && (
              <div className="space-y-6">
                <div className="bg-red-50 p-4 border border-red-200 rounded text-sm text-red-800">
                  <Info size={16} className="inline mr-2" /> Archiwum:
                  Zarchiwizowane elementy nie są widoczne w listach, ale ich
                  historia zostaje. Trwałe usunięcie skasuje je z bazy.
                </div>
                {archivedUsers.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2">Pracownicy</h3>
                    <div className="grid gap-2">
                      {archivedUsers.map((u) => (
                        <div
                          key={u.id}
                          className="bg-gray-50 p-3 rounded flex justify-between border items-center"
                        >
                          <span className="text-gray-500 line-through">
                            {u.name}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleArchiveEntity("users", u.id, false)
                              }
                              className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded"
                            >
                              Przywróć
                            </button>
                            {!isLocalManager && (
                              <button
                                onClick={() =>
                                  handlePermanentDelete("users", u.id)
                                }
                                className="px-2 py-1 bg-red-100 text-red-700 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isLocalManager && archivedLokale.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2 mt-4">Lokale</h3>
                    <div className="grid gap-2">
                      {archivedLokale.map((l) => (
                        <div
                          key={l.id}
                          className="bg-gray-50 p-3 rounded flex justify-between border items-center"
                        >
                          <span className="text-gray-500 line-through">
                            {l.name}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleArchiveEntity("lokale", l.id, false)
                              }
                              className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded"
                            >
                              Przywróć
                            </button>
                            <button
                              onClick={() =>
                                handlePermanentDelete("lokale", l.id)
                              }
                              className="px-2 py-1 bg-red-100 text-red-700 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!isLocalManager && archivedStanowiska.length > 0 && (
                  <div>
                    <h3 className="font-bold text-lg mb-2 mt-4">Stanowiska</h3>
                    <div className="grid gap-2">
                      {archivedStanowiska.map((s) => (
                        <div
                          key={s.id}
                          className="bg-gray-50 p-3 rounded flex justify-between border items-center"
                        >
                          <span className="text-gray-500 line-through">
                            {s.name} ({s.lokal_name})
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleArchiveEntity("stanowiska", s.id, false)
                              }
                              className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded"
                            >
                              Przywróć
                            </button>
                            <button
                              onClick={() =>
                                handlePermanentDelete("stanowiska", s.id)
                              }
                              className="px-2 py-1 bg-red-100 text-red-700 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(przewodnikTab === "lokale" || przewodnikTab === "stanowiska") &&
              !isLocalManager && (
                <div>
                  <button
                    onClick={() =>
                      setEditingDict({
                        id: null,
                        name: "",
                        lokal_name:
                          activeLokale.length > 0 ? activeLokale[0].name : "",
                      })
                    }
                    className="mb-4 bg-green-500 text-white px-4 py-2 rounded font-bold hover:bg-green-600 flex items-center gap-2"
                  >
                    <Plus size={18} /> Dodaj{" "}
                    {przewodnikTab === "lokale"
                      ? "nowy lokal"
                      : "nowe stanowisko"}
                  </button>
                  {editingDict && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                      <form
                        onSubmit={(e) => handleSaveDict(e, przewodnikTab)}
                        className="bg-white p-6 rounded-xl w-full max-w-sm shadow-2xl"
                      >
                        <h3 className="text-xl font-bold mb-4 border-b pb-2">
                          {editingDict.id ? "Edytuj" : "Dodaj"}{" "}
                          {przewodnikTab === "lokale" ? "Lokal" : "Stanowisko"}
                        </h3>
                        <div className="mb-4 space-y-3">
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">
                              Nazwa
                            </label>
                            <input
                              type="text"
                              value={editingDict.name}
                              onChange={(e) =>
                                setEditingDict({
                                  ...editingDict,
                                  name: e.target.value,
                                })
                              }
                              className="w-full p-2 border rounded"
                              required
                              autoFocus
                            />
                          </div>
                          {przewodnikTab === "stanowiska" && (
                            <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">
                                Lokal
                              </label>
                              <select
                                value={editingDict.lokal_name}
                                onChange={(e) =>
                                  setEditingDict({
                                    ...editingDict,
                                    lokal_name: e.target.value,
                                  })
                                }
                                className="w-full p-2 border rounded bg-blue-50"
                                required
                              >
                                {activeLokale.map((l) => (
                                  <option key={l.id} value={l.name}>
                                    {l.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingDict(null)}
                            className="flex-1 p-2 bg-gray-200 font-bold rounded"
                          >
                            Anuluj
                          </button>
                          <button
                            type="submit"
                            className="flex-1 p-2 bg-blue-600 text-white font-bold rounded"
                          >
                            Zapisz
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4">
                    {(przewodnikTab === "lokale"
                      ? activeLokale
                      : activeStanowiska
                    ).map((item) => (
                      <div
                        key={item.id}
                        className="bg-white p-4 rounded-lg shadow border flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-lg">{item.name}</p>
                          {przewodnikTab === "stanowiska" && (
                            <p className="text-sm text-gray-500">
                              Lokal: <b>{item.lokal_name}</b>
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingDict({ ...item })}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() =>
                              handleArchiveEntity(przewodnikTab, item.id, true)
                            }
                            className="p-2 text-gray-500 hover:text-red-500 bg-gray-100 rounded"
                            title="Do archiwum"
                          >
                            <Archive size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </ManagerShell>
  );
};

export default ManagerDashboard;
