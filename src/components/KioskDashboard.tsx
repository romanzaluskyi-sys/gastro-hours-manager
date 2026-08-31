// @ts-nocheck
import React, { useState, useEffect } from "react";
import {
  Home,
  Clock,
  FileText,
  ClipboardCheck,
  MoreHorizontal,
  Bell,
  Lock,
  Calendar,
  Flag,
  ChevronLeft,
  ChevronDown,
  Check,
  AlertCircle,
  Sun,
  Delete,
} from "lucide-react";
import { api } from "../api/supabase";
import { sendToGoogleSheets } from "../api/googleSheets";
import { findOverlappingShift, getTodaysShiftsForUser } from "../utils/shifts";
import {
  getShort,
  getDayOfWeek,
  getMonthName,
  getAvailableYears,
  formatNotificationText,
} from "../utils/format";

// ==========================================
// KIOSK SŁUŻBOWY — nowy design ("Tablet Służbowy")
// Zastępuje OpenDeviceDashboard w widoku "open_dashboard" (App.tsx).
// Wzornictwo wg zatwierdzonego prototypu HTML z sesji projektowej — patrz
// opis w PR/promptcie tej zmiany. OpenDeviceDashboard.tsx pozostaje
// nietknięty w repo jako łatwy rollback.
// ==========================================

const TABS = [
  { key: "PULPIT", label: "Pulpit", Icon: Home },
  { key: "ZMIANA", label: "Zmiana", Icon: Clock },
  { key: "RAPORT", label: "Raport", Icon: FileText },
  { key: "ZADANIA", label: "Zadania", Icon: ClipboardCheck },
  { key: "WIECEJ", label: "Więcej", Icon: MoreHorizontal },
];

const fmtHHMM = (d) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;

const sumHours = (arr) =>
  arr.reduce(
    (acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );

// --- klasy Tailwind wspólne dla wielu ekranów (język designu z prototypu:
// grube 2/2.5px obramowania, pogrubione nagłówki Archivo, czerwony akcent) ---
const fieldLabelCls = "text-[13.5px] text-[#6E6E66] mb-2 block";
const selectWrapCls = "relative";
const selectElCls =
  "w-full appearance-none border-[2.5px] border-[#171714] rounded bg-[#E7E7E2] p-3.5 pr-10 font-['Archivo'] font-bold text-[17px] text-[#171714]";
const selectChevronCls =
  "pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8F8E86]";
const selectValCls = "font-['Archivo'] font-bold text-[17px] text-[#171714]";
const staticBoxCls =
  "border-[2.5px] border-[#171714] rounded bg-[#E7E7E2] p-3.5 flex items-center justify-between";
const timeHeroCls =
  "relative border-[2.5px] border-[#171714] rounded bg-[#F1F1EE] p-4 flex items-center justify-between gap-2.5";
const timePlainCls =
  "relative border-[2.5px] border-[#171714] rounded bg-[#F1F1EE] p-4";
const razemRowCls =
  "flex items-center justify-between bg-[#E7E7E2] rounded p-3.5";
const helperTextCls = "text-[13.5px] text-[#6E6E66] leading-relaxed";
const sectionLabelCls =
  "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]";
const ruleStrongCls = "h-[2.5px] bg-[#171714] mt-2";
const ruleSoftCls = "h-px bg-[#B7B6AE] mt-4";
const ctaPrimaryCls =
  "flex items-center justify-center gap-2.5 bg-[#DE3A22] text-white rounded-md py-[18px] px-5 font-['Archivo'] font-extrabold text-lg w-full flex-shrink-0 active:scale-[0.99] disabled:opacity-60";
const ctaSecondaryCls =
  "relative flex items-center justify-center bg-transparent text-[#171714] border-[2.5px] border-[#171714] rounded-md py-[15px] px-5 font-['Archivo'] font-bold text-base w-full flex-shrink-0 mt-2.5";
const ctaSecondaryQuietCls =
  "relative flex items-center justify-center bg-transparent text-[#6E6E66] border-2 border-[#B7B6AE] rounded-md py-[15px] px-5 font-['Archivo'] font-bold text-base w-full flex-shrink-0 mt-2.5";
const menuRowCls =
  "border-2 border-[#B7B6AE] rounded bg-[#F1F1EE] p-4 flex items-center gap-3.5 w-full text-left mb-3.5";
const checkboxRowCls = (checked) =>
  `flex items-center gap-3 border-2 rounded p-3.5 w-full text-left ${
    checked ? "border-[2.5px] border-[#171714]" : "border-[#B7B6AE]"
  }`;

// Poza komponentem nadrzędnym celowo — Shell był kiedyś zdefiniowany w środku
// KioskDashboard, przez co żywy zegar (setInterval co 1s) wymuszał na Reakcie
// traktowanie <Shell> jako nowego typu komponentu przy każdym tickу i
// odmontowywanie/montowanie go od nowa (razem z polami formularza w środku —
// traciły focus co sekundę). Trzymaj Shell tutaj, na poziomie modułu.
const Shell = ({
  screen,
  setScreen,
  goList,
  unreadCount,
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
    <div className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-lg">
        <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center justify-between gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goList}
              className="flex items-center gap-1 border-2 border-[#B7B6AE] rounded font-['Archivo'] font-bold text-sm px-3 py-2 text-[#171714] flex-shrink-0"
            >
              <ChevronLeft size={16} strokeWidth={2.5} /> Zmień
            </button>
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
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

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
  showMsg,
}) => {
  // ---- nawigacja / stan sesji ----
  const [screen, setScreen] = useState("LIST");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [pinTarget, setPinTarget] = useState(null);
  const [pinEntered, setPinEntered] = useState("");
  const [pinError, setPinError] = useState(false);
  const [justClosed, setJustClosed] = useState(false);
  const [now, setNow] = useState(new Date());

  // ---- formularz "Zmiana" (start/pełna zmiana) ----
  const [formLokal, setFormLokal] = useState("");
  const [formStanowisko, setFormStanowisko] = useState("");
  const [knowsEnd, setKnowsEnd] = useState(false);
  const [formStartTime, setFormStartTime] = useState(fmtHHMM(new Date()));
  const [formEndTime, setFormEndTime] = useState("");
  const [saving, setSaving] = useState(false);

  // ---- Raport ----
  const [raportMonth, setRaportMonth] = useState(new Date().getMonth());
  const [raportYear, setRaportYear] = useState(new Date().getFullYear());

  // ---- Więcej ----
  const [grafikToastShown, setGrafikToastShown] = useState(false);

  // ---- Zgłoś ----
  const [zgAnon, setZgAnon] = useState(false);
  const [zgShiftId, setZgShiftId] = useState("none");
  const [zgText, setZgText] = useState("");
  const [zgSaving, setZgSaving] = useState(false);
  const [zgSent, setZgSent] = useState(false);
  const [zgPrefillShiftId, setZgPrefillShiftId] = useState(null);

  // ---- dane pochodne (identyczne z OpenDeviceDashboard.tsx) ----
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
  const activeNames = new Set(activeUsers.map((u) => u.name));
  const myNotifications = notifications.filter((n) =>
    activeNames.has(n.user_name)
  );
  const unreadCount = myNotifications.filter((n) => !n.is_read).length;

  const lokaleAllowed = lokale.filter((l) => allowed.includes(l.name));
  const stanowiskaAllowed = stanowiska.filter((s) =>
    allowed.includes(s.lokal_name)
  );
  const dostepneStanowiska = stanowiskaAllowed.filter(
    (s) => s.lokal_name === formLokal
  );

  const openShift = selectedEmployee
    ? shifts.find((s) => s.user_id === selectedEmployee.id && !s.end_time)
    : null;
  const todaysClosedShifts = selectedEmployee
    ? getTodaysShiftsForUser(shifts, selectedEmployee.id).filter(
        (s) => s.end_time
      )
    : [];

  const workingCount = activeUsers.filter((u) =>
    shifts.some((s) => s.user_id === u.id && !s.end_time)
  ).length;
  const notYetCount = activeUsers.length - workingCount;

  const raportShifts = selectedEmployee
    ? shifts
        .filter(
          (s) =>
            s.user_id === selectedEmployee.id &&
            s.start_time.getMonth() === raportMonth &&
            s.start_time.getFullYear() === raportYear
        )
        .sort((a, b) => a.start_time - b.start_time)
    : [];
  const raportTotal = raportShifts.reduce(
    (acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );

  const recentShiftsForZgloszenie = selectedEmployee
    ? shifts
        .filter((s) => s.user_id === selectedEmployee.id)
        .sort((a, b) => b.start_time - a.start_time)
        .slice(0, 8)
    : [];

  // ---- zegar na żywo (nagłówek listy + licznik trwającej zmiany) ----
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ---- reset formularza zmiany przy wyborze pracownika ----
  const resetShiftForm = (emp) => {
    setFormLokal(emp?.default_lokal || lokaleAllowed[0]?.name || "");
    setFormStanowisko(emp?.default_stanowisko || "");
    setKnowsEnd(false);
    setFormStartTime(fmtHHMM(new Date()));
    setFormEndTime("");
  };
  useEffect(() => {
    if (selectedEmployee) resetShiftForm(selectedEmployee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee]);

  // ---- korekta stanowiska, gdy zmienia się lokal (jak w TimeEntryForm) ----
  useEffect(() => {
    const dostepne = stanowiskaAllowed.filter(
      (s) => s.lokal_name === formLokal
    );
    if (!dostepne.find((s) => s.name === formStanowisko)) {
      setFormStanowisko(dostepne.length > 0 ? dostepne[0].name : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formLokal, stanowiska]);

  // ---- oznaczanie powiadomień jako przeczytane (jak w OpenDeviceDashboard) ----
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ---- reset formularza Zgłoś przy wejściu na ekran ----
  useEffect(() => {
    if (screen === "ZGLOS") {
      setZgShiftId(zgPrefillShiftId || "none");
      setZgAnon(false);
      setZgSent(false);
      setZgText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ---- nawigacja ----
  const goList = () => {
    setSelectedEmployee(null);
    setPinTarget(null);
    setPinEntered("");
    setPinError(false);
    setJustClosed(false);
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
      setJustClosed(false);
      setScreen("PULPIT");
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
            setJustClosed(false);
            setPinEntered("");
            setPinError(false);
            setScreen("PULPIT");
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

  const openZgloszenie = (shiftId) => {
    setZgPrefillShiftId(shiftId || null);
    setScreen("ZGLOS");
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
      !selectedEmployee ||
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
      selectedEmployee.id,
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
      user_id: selectedEmployee.id,
      user_name: selectedEmployee.name,
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
        user_id: zgAnon ? null : selectedEmployee.id,
        user_name: zgAnon ? null : selectedEmployee.name,
        issue_text: zgText,
        status: "nowe",
        is_anonymous: zgAnon,
        // select value jest zawsze stringiem — shift_id w bazie to liczba.
        shift_id: zgShiftId && zgShiftId !== "none" ? Number(zgShiftId) : null,
      });
      setIssues([...issues, issue]);
      setZgText("");
      setZgSent(true);
      showMsg("Zgłoszenie wysłane pomyślnie!");
    } catch (err) {
      showMsg("Błąd połączenia.", "error");
    }
    setZgSaving(false);
  };

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
        <div className={`${ruleSoftCls} mb-4`} />
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
              {lokaleAllowed.map((l) => (
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
          Dzięki, {selectedEmployee.name}
        </div>
        <div className={sectionLabelCls}>
          {selectedEmployee.name} ma dziś zapisane
        </div>
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
        <div className={ruleSoftCls} />
        <div className="flex-1" />
        <div className={`${sectionLabelCls} mb-2.5`}>Wracasz jeszcze dziś?</div>
        <button
          onClick={() => {
            setJustClosed(false);
            resetShiftForm(selectedEmployee);
          }}
          className={ctaPrimaryCls}
        >
          Rozpocznij kolejną zmianę
        </button>
        <button
          onClick={() => setScreen("RAPORT")}
          className={ctaSecondaryCls}
        >
          Zobacz swoje godziny
        </button>
        <button onClick={goList} className={ctaSecondaryQuietCls}>
          Wróć do listy osób
        </button>
      </>
    );
  };

  // ==========================================
  // EKRAN: LIST — wybór pracownika
  // ==========================================
  if (screen === "LIST") {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center">
        <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-lg">
          <header className="px-[18px] pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center justify-between flex-shrink-0">
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
              Tablet Służbowy
            </span>
            <span className="text-sm text-[#8F8E86]">
              {allowed.join(", ") || "Brak lokalu"} · {fmtHHMM(now)}
            </span>
          </header>
          <div className="bg-[#E7E7E2] border-b border-[#B7B6AE] px-5 py-2.5 flex items-center gap-2 text-sm text-[#6E6E66] flex-shrink-0">
            <Sun size={15} />
            <span>Dziś · 21°, słonecznie</span>
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
      <div className="min-h-screen bg-white flex flex-col items-center">
        <div className="w-full max-w-md bg-white min-h-screen flex flex-col shadow-lg">
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

  // Zabezpieczenie: ekrany sesji wymagają wybranego pracownika.
  if (!selectedEmployee) {
    return null;
  }

  // ==========================================
  // EKRAN: PULPIT
  // ==========================================
  if (screen === "PULPIT") {
    return (
      <Shell screen={screen} setScreen={setScreen} goList={goList} unreadCount={unreadCount} title={selectedEmployee.name} showPill={!!openShift}>
        {openShift ? (
          renderShiftInProgress()
        ) : (
          <>
            <div className="font-['Archivo'] font-extrabold text-[30px] text-[#171714]">
              Cześć, {selectedEmployee.name}
            </div>
            <div className="text-sm text-[#6E6E66] mt-0.5 mb-7">
              {selectedEmployee.default_lokal} ·{" "}
              {selectedEmployee.default_stanowisko}
            </div>
            <div className={sectionLabelCls}>Twoja zmiana dziś</div>
            <div className={ruleStrongCls} />
            <div className="text-[15px] text-[#8F8E86] italic mt-4">
              Brak zaplanowanego grafiku — moduł Grafik jeszcze nie istnieje.
            </div>
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
      <Shell screen={screen} setScreen={setScreen} goList={goList} unreadCount={unreadCount} title={selectedEmployee.name} showPill={!!openShift}>
        {openShift
          ? renderShiftInProgress()
          : justClosed
          ? renderJustClosedSummary()
          : renderStartForm()}
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
        goList={goList}
        unreadCount={unreadCount}
        title="Raport"
        footer={
          <div className="flex-shrink-0 border-t-[2.5px] border-[#171714] bg-white px-5 pt-[18px] pb-[22px] flex items-baseline justify-between">
            <span className={sectionLabelCls}>
              {selectedEmployee.name} · {getMonthName(raportMonth)}
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
            {selectedEmployee.name} · {selectedEmployee.default_stanowisko || ""}
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
            <span className="w-11 flex-shrink-0 text-[13px] font-semibold text-[#6E6E66]">
              {getShort(s.stanowisko)}
            </span>
            <span className="flex-1 text-[13.5px] text-[#171714] tabular-nums">
              {fmtHHMM(s.start_time)} –{" "}
              {s.end_time ? (
                fmtHHMM(s.end_time)
              ) : (
                <span className="text-[#DE3A22] font-bold">Trwa</span>
              )}
            </span>
            <span className="w-[74px] flex-shrink-0 text-right font-['Archivo'] font-extrabold text-[15px] text-[#171714] tabular-nums">
              {s.end_time
                ? ((s.end_time - s.start_time) / 3600000).toFixed(1).replace(".", ",")
                : "-"}
            </span>
            <button
              onClick={() => openZgloszenie(s.id)}
              className="w-9 h-[30px] flex-shrink-0 border-2 border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66]"
            >
              <Flag size={14} />
            </button>
          </div>
        ))}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZADANIA — moduł jeszcze nie istnieje (Roadmap p.2)
  // ==========================================
  if (screen === "ZADANIA") {
    return (
      <Shell screen={screen} setScreen={setScreen} goList={goList} unreadCount={unreadCount} title="Zadania">
        <div className="border-2 border-dashed border-[#B7B6AE] rounded p-6 text-center mt-6">
          <div className="text-2xl mb-2">🚧</div>
          <div className="font-['Archivo'] font-extrabold text-lg text-[#171714] mb-1.5">
            Zadania — moduł w przygotowaniu
          </div>
          <div className="text-sm text-[#6E6E66]">
            Checklisty otwarcia/zamknięcia i sprzątanie cykliczne pojawią się
            tutaj w kolejnym etapie (Roadmap p.2).
          </div>
        </div>
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: WIECEJ
  // ==========================================
  if (screen === "WIECEJ") {
    return (
      <Shell screen={screen} setScreen={setScreen} goList={goList} unreadCount={unreadCount} title="Więcej">
        <button
          onClick={() => setGrafikToastShown((v) => !v)}
          className={menuRowCls}
        >
          <Calendar size={21} className="text-[#171714] flex-shrink-0" />
          <span className="flex-1 text-base font-semibold text-[#171714]">
            Grafik
          </span>
          <span className="flex-shrink-0 text-[13px] font-semibold px-3 py-1.5 rounded border-[1.5px] border-[#DE3A22] text-[#DE3A22]">
            w budowie
          </span>
        </button>
        {grafikToastShown && (
          <div className="text-xs text-[#A83226] bg-[#FBEAE6] rounded p-2.5 -mt-2 mb-3.5">
            Grafik — ostatni etap Roadmapy (p.5), świadomie jeszcze nie
            zaczęty.
          </div>
        )}
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
        <button onClick={goList} className={menuRowCls}>
          <ChevronLeft
            size={21}
            strokeWidth={2.5}
            className="text-[#171714] flex-shrink-0"
          />
          <span className="flex-1 text-base font-semibold text-[#171714]">
            Wróć do listy osób
          </span>
        </button>
        <div className="flex-1" />
        <div className="border-2 border-dashed border-[#B7B6AE] rounded p-4">
          <div className="text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-2">
            Uwaga
          </div>
          <div className="text-[15px] text-[#171714] leading-relaxed">
            Na urządzeniu wspólnym nie ma wylogowania — robi to kierownik.
          </div>
        </div>
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
      <Shell screen={screen} setScreen={setScreen} goList={goList} unreadCount={unreadCount} title="Wiadomości" showBell={false}>
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
                {formatNotificationText(n, true)}
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
    return (
      <Shell screen={screen} setScreen={setScreen} goList={goList} unreadCount={unreadCount} title="Zgłoś poprawkę">
        <div>
          <span className={fieldLabelCls}>Kto zgłasza</span>
          <div className={selectWrapCls}>
            <select
              value={zgAnon ? "anon" : "named"}
              onChange={(e) => setZgAnon(e.target.value === "anon")}
              className={selectElCls}
            >
              <option value="named">
                {selectedEmployee.name} ·{" "}
                {selectedEmployee.default_stanowisko || ""}
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
          <span className={fieldLabelCls}>Która zmiana</span>
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
            placeholder="Np. wyszłam o 20:30, nie zdążyłam odbić."
          />
        </div>
        <div className="bg-[#E7E7E2] rounded p-3.5 text-sm text-[#6E6E66] mt-5">
          Kierownik odpowie w Wiadomościach. Do czasu odpowiedzi wiersz ma
          czerwoną chorągiewkę.
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
            Wyślij do poprawy
          </button>
        )}
      </Shell>
    );
  }

  return null;
};

export default KioskDashboard;
