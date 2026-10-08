// @ts-nocheck
import React, { useState, useEffect } from "react";
import { api } from "../api/supabase";
import { nowyUuid } from "../utils/uuid";
import { ustawHasloPracownika } from "../api/auth";
import { sendToGoogleSheets } from "../api/googleSheets";
import { createEmployeeNotification } from "../api/notifications";
import { formatNotificationText } from "../utils/format";
import { findOverlappingShift, opisKolidujacej, znajdzKolizjeWBazie, znajdzOtwartaDoZakonczenia, znajdzOtwartaWBazie } from "../utils/shifts";
import { zadaniaNaDzien, toLocalYMD } from "../utils/tasks";
import { resolveAbsenceRequest, addUrlopDirectly, deleteAbsence } from "../utils/absences";
import { zmianyPorzucone } from "../utils/porzucone";
import { zmianyBezOdbicia } from "../utils/odbicia";
import { probniDoDecyzji, czekaNaDecyzje } from "../utils/probni";
import ZatwierdzanieZmian from "./manager/ZatwierdzanieZmian";
import ZadaniaISprzatanie from "./manager/ZadaniaISprzatanie";
import Puls from "./manager/Puls";
import ManagerShell, { NAV_ITEMS } from "./manager/ManagerShell";
import PulpitHome from "./manager/PulpitHome";
import WBudowie from "./manager/WBudowie";
import MojaPraca from "./manager/MojaPraca";
import RejestrGodzin from "./manager/RejestrGodzin";
import WpisGodzinModal from "./manager/WpisGodzinModal";
import { useOdlozoneDecyzje, PasekCofnij } from "./manager/odlozoneDecyzje";
import { zapiszSladRecznejZmiany } from "../utils/corrections";
import Aktywni from "./manager/Aktywni";
import Skrzynka, { zbierzSprawy } from "./manager/Skrzynka";
import Pracownicy from "./manager/Pracownicy";
import RaportyIKoszty from "./manager/RaportyIKoszty";
import Przewodnik from "./manager/Przewodnik";
import Ustawienia from "./manager/Ustawienia";
import { czekaNaKoniecOdKierownika } from "../utils/wpisy";
import { TABELA_MOICH, dodajMojeZadanie } from "../utils/mojeZadania";
import Grafik from "./manager/Grafik";
import {
  resolveSwap,
  wzajemnaZmiana,
  wycofajOfertyDlaZmian,
} from "../utils/swaps";
import { typUmowy } from "../utils/umowy";
import {
  futureShiftsOfUser,
  przepiszZmiany,
  poOstatnimDniu,
} from "../utils/grafik";
import PrzepiszZmianyModal from "./manager/PrzepiszZmianyModal";
import { zuzyjCel, CELE_KIEROWNIKA } from "../utils/linki";

// ==========================================
// KIEROWNIK DASHBOARD
// ==========================================
// Zakładki, które mają już własny komponent w manager/. Reszta dostaje
// WBudowie. Wcześniej był tu łańcuch `tab !== "..." && tab !== "..."` —
// dopisanie zakładki i zapomnienie o dopisaniu jej tam dawało dokładnie ten
// błąd, przed którym ostrzega CLAUDE.md: zakładka bez żywego bloku (tak
// zniknęły kiedyś Powiadomienia). Lista trzyma to w jednym miejscu.
const TABY_Z_WLASNYM_WIDOKIEM = [
  "pulpit",
  "puls",
  "grafik",
  "moja_praca",
  "godziny",
  "zatwierdzanie",
  "aktywni",
  "skrzynka",
  "pracownicy",
  "raporty",
  "przewodnik",
  "zadania",
  // Do 0.53.0 brakowało tu Ustawień i pod nimi wisiał placeholder "W budowie".
  "ustawienia",
];

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
  taskBlocks,
  setTaskBlocks,
  taskCompletions,
  setTaskCompletions,
  dayLogs,
  setDayLogs,
  dayLogEntries,
  setDayLogEntries,
  dayLogTemplates,
  setDayLogTemplates,
  weatherForecasts,
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
  budzetCele,
  setBudzetCele,
  budzetDni,
  setBudzetDni,
  showMsg,
}) => {
  // Start na zakładce z linku w e-mailu (0.70.0, utils/linki.ts), inaczej Pulpit.
  const [tab, setTabSurowy] = useState(() => zuzyjCel(CELE_KIEROWNIKA) || "pulpit");
  // Zgłoszenia i Powiadomienia to od 0.51.0 jedna Skrzynka. Stare klucze
  // przekierowujemy — dzwonek w górnym pasku otwiera ją na "Informacjach".
  const [skrzynkaStart, setSkrzynkaStart] = useState("todo");
  const setTab = (t) => {
    if (t === "powiadomienia" || t === "zgloszenia") {
      setSkrzynkaStart(t === "powiadomienia" ? "info" : "todo");
      setTabSurowy("skrzynka");
      return;
    }
    if (t === "skrzynka") setSkrzynkaStart("todo");
    setTabSurowy(t);
  };
  const [selectedLokal, setSelectedLokal] = useState("ALL");
  // "Moje zadania" (0.56.0, migracja 0038) — lista spraw kierownika. Czyta ją
  // sam panel, nie App: to dane wyłącznie kierownika, a błąd (np. baza bez
  // 0038) nie może blokować reszty — wtedy lista zostaje pusta, a zakładka
  // mówi, czego brakuje (`mojeBlad`).
  const [zadaniaMoje, setZadaniaMoje] = useState([]);
  const [mojeBlad, setMojeBlad] = useState(null);
  useEffect(() => {
    let zyje = true;
    api
      .get(TABELA_MOICH, "archived=eq.false")
      .then((w) => zyje && setZadaniaMoje(w || []))
      .catch((e) => zyje && setMojeBlad(e?.message || "błąd odczytu"));
    return () => {
      zyje = false;
    };
  }, []);
  const [reportUserId, setReportUserId] = useState(null);
  // Miesiąc, na który ma przeskoczyć zakładka Raporty przy wejściu z imienia.
  const [reportSkok, setReportSkok] = useState(null);
  // Imię pracownika w Rejestr Godzin/Aktywni prowadzi tu — patrz onNameClick
  // przekazywane do tych komponentów.
  // Skok z paska "dzień niezamknięty" na Pulpicie prosto do właściwej karty —
  // ten sam wzorzec co goToEmployeeReport niżej.
  const [pulsCel, setPulsCel] = useState(null);
  // Archiwizacja pracownika z przyszłymi zmianami — wybór, co z nimi zrobić.
  const [zmianyOdchodzacego, setZmianyOdchodzacego] = useState(null);
  const [przepisuje, setPrzepisuje] = useState(false);
  const goToPuls = (lokal, date) => {
    setPulsCel({ lokal, date });
    setTab("puls");
  };

  // ⚠️ Raporty i koszty otwierają się na miesiącu ZAMKNIĘTYM (0.40.0), a imię
  // klika się na zmianie z konkretnego dnia — najczęściej dzisiejszej. Bez
  // przekazania tej daty kierownik lądowałby na poprzednim miesiącu i widział
  // pustą kartę osoby, która właśnie stoi na zmianie. Ten sam wzorzec co
  // goToPuls (initialLokal/initialDate).
  const goToEmployeeReport = (userId, dataZmiany) => {
    setReportUserId(userId);
    const d = dataZmiany ? new Date(dataZmiany) : new Date();
    setReportSkok({ rok: d.getFullYear(), mies: d.getMonth(), seq: Date.now() });
    setTab("raporty");
  };

  // Karta pracownika wprost z kolejki decyzji. Zatwierdzony pracownik na próbę
  // nie ma jeszcze ani stawki, ani umowy — bez tego skrótu trzeba by go szukać
  // na liście kilkudziesięciu osób zaraz po tym, jak się go zatwierdziło.
  const goToEmployeeCard = (userId) => {
    const u = users.find((x) => String(x.id) === String(userId));
    if (!u) return;
    setEditingUser({ ...u });
    setTab("pracownicy");
  };

  // "Dodaj pracownika" z nagłówka siatki Grafiku. Do 0.32 otwierało modal
  // przypisania zmiany komuś spoza siatki, co myliło: przycisk mówi
  // "pracownika", a dawał zmianę. Teraz prowadzi tam, gdzie pracownik
  // naprawdę powstaje — do jego karty, z domyślnie ustawionym lokalem, z
  // którego kliknięto.
  const goToNewEmployee = (lokal) => {
    handleNewUserClick();
    if (lokal) {
      setEditingUser((u) => (u ? { ...u, default_lokal: lokal } : u));
    }
    setTab("pracownicy");
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
    newEnd,
    reason = ""
  ) => {
    try {
      const dateSrc = oldStart || newStart;
      const pola = {
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
      };
      // Powód poprawki (Rejestr godzin, od 0.50.0) nie ma własnej kolumny —
      // idzie w `message`, które formatNotificationText pokazuje zamiast
      // tekstu składanego ze starych pól. Treść jest ta sama plus powód.
      const message = reason
        ? `${formatNotificationText({ ...pola, user_name: shiftLike.user_name }, false)}. Powód: „${reason}”.`
        : undefined;
      // Bez odczytu wiersza (patrz createManagerNotification): osoba z
      // innego lokalu, której zmianę poprawiamy, nie musi być na liście
      // kierownika, a wtedy INSERT … RETURNING odrzuciłby zapis w całości.
      // Id nadajemy sami, żeby wiersz lokalny i ten z pollu były jednym.
      const created = {
        id: nowyUuid(),
        ...pola,
        ...(message ? { message, type: "shift_edit" } : {}),
        is_read: false,
      };
      await api.dodajBezOdczytu("notifications", created);
      setNotifications((prev) => [...prev, { ...created, created_at: new Date().toISOString() }]);
    } catch (err) {
      console.error("Błąd tworzenia powiadomienia:", err);
    }
  };

  const isLocalManager = currentUser.role === "manager_lokalu";
  // Ustawienia sieci (lokale, stanowiska, subskrypcja) widzi tylko właściciel
  // — decyzja właściciela z 2026-09-24. "Właściciel" to `admin` ALBO stara
  // rola `manager`: nie da się jej już nadać z karty pracownika, ale konta
  // sprzed zmian ją mają, a baza traktuje obie tak samo (widzi_wszystko() w
  // 0025). Pierwsza wersja wpuszczała sam `admin` i właściciel z rolą
  // `manager` nie widział zakładki w ogóle. Kierownik lokalu — nie.
  const jestWlascicielem = ["admin", "manager"].includes(currentUser.role);
  const managerLokaleList = currentUser.allowed_lokale
    ? currentUser.allowed_lokale.split(",").map((l) => l.trim())
    : [];

  const hasAccessToLokal = (lokalName) =>
    !isLocalManager || managerLokaleList.includes(lokalName);

  // Zgłoszenia widoczne dla TEGO kierownika. Liczone RAZ i użyte zarówno przez
  // znaczek w menu, jak i przez samą zakładkę — wcześniej znaczek liczył
  // wszystkie zgłoszenia bez filtra lokalu, a lista filtrowała, więc menu
  // pokazywało "1" nad pustym ekranem.
  //
  // ⚠️ Zgłoszenie anonimowe nie ma user_id, więc nie da się z niego odczytać
  // lokalu — i dotąd wypadało z listy każdemu oprócz admina, czyli trafiało
  // donikąd. Anonimowość dotyczy OSOBY, nie miejsca: do czasu, aż `issues`
  // dostanie własną kolumnę `lokal`, takie zgłoszenie widzi każdy kierownik.
  const widoczneZgloszenia = issues.filter((i) => {
    if ((i.type || "problem") === "correction") return false;
    if (!i.user_id) return true;
    return hasAccessToLokal(
      users.find((u) => u.id === i.user_id)?.default_lokal || ""
    );
  });

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

  // Zmiany, które ktoś zaczął i nie zakończył, oraz osoby dodane na próbę z
  // Tabletu. Liczone tu tylko po to, żeby dało się je policzyć w znaczku przy
  // zakładce — całą logikę trzyma utils/porzucone.ts i utils/probni.ts.
  // Ten sam filtr co w ZatwierdzanieZmian: zmiana z prośbą o koniec liczy się
  // raz — jako korekta — inaczej znaczek pokazuje o jedną decyzję za dużo.
  const porzuconeZmiany = zmianyPorzucone({
    shifts,
    planShifts,
    lokale,
    users,
    lokalOk: hasAccessToLokal,
  }).filter((poz) => !czekaNaKoniecOdKierownika(poz.shift, issues));
  const probniOczekujacy = probniDoDecyzji({ users, lokalOk: hasAccessToLokal });
  // Kolejka "Był w grafiku, nie odbił" — do 0.46.0 znaczek jej nie liczył,
  // choć Pulpit i sama zakładka tak. Od kiedy zakładka ma nagłówek
  // "Do decyzji · N", znaczek musi dać tę samą liczbę, inaczej jedno z nich
  // wygląda na zepsute. Te same argumenty co w ZatwierdzanieZmian.
  const brakiOdbiciaDoDecyzji = zmianyBezOdbicia({
    planShifts,
    shifts,
    users,
    absences,
    lokalOk: hasAccessToLokal,
  });

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
        // Przy zamianie przepisują się DWIE zmiany — druga musi dojść tutaj,
        // inaczej zatwierdzenie zostawia dzień z dwiema osobami naraz.
        wzajemna: wzajemnaZmiana(swap, planShifts),
      });
      setShiftSwaps((shiftSwaps || []).map((s) => (s.id === res.swap.id ? res.swap : s)));
      const zapisane = [res.planShift, res.wzajemna].filter(Boolean);
      if (zapisane.length > 0) {
        setPlanShifts(
          (planShifts || []).map(
            (p) => zapisane.find((z) => String(z.id) === String(p.id)) || p
          )
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


  const [editingUser, setEditingUser] = useState(null);
  const [editingDict, setEditingDict] = useState(null);
  const [editingShift, setEditingShift] = useState(null);

  const handleNewUserClick = () =>
    setEditingUser({
      id: null,
      name: "",
      email: "",
      pin: "",
      role: "closed",
      active: true,
      // Nowa osoba startuje w lokalu wybranym w górnym pasku — kierownik,
      // który patrzy na listę jednego lokalu, zakłada kogoś właśnie tam.
      default_lokal: selectedLokal !== "ALL" ? selectedLokal : "",
      default_stanowisko: "",
      allowed_lokale: [],
      sanepid_expiry: "",
      umowa_expiry: "",
      kiosk_pin: "",
      telefon: "",
      data_urodzenia: "",
      data_zatrudnienia: "",
      // `etat` świadomie NIE jest już inicjalizowany — zastąpiły go
      // typ_umowy/wymiar_etatu/wynagrodzenie_mies (migracja 0018).
      typ_umowy: "",
      wymiar_etatu: "",
      wynagrodzenie_mies: "",
      stawka: "",
      notatki: "",
    });

  const activeLokale = lokale.filter((l) => !l.archived);
  const activeStanowiska = stanowiska.filter((s) => !s.archived);

  const visibleUsers = users.filter(
    (u) => !u.archived && hasAccessToLokal(u.default_lokal)
  );
  // Pracownik na próbę nie istnieje dla Grafiku, dopóki kierownik go nie
  // zatwierdzi: wpisana mu zmiana wyglądałaby na pokrytą obsadę, a on może
  // jutro nie przyjść. Filtr stoi TYLKO w tym jednym miejscu — zamiast w
  // siatce tygodnia, siatce miesiąca, modalu przypisania i doborze kandydatów
  // osobno, gdzie prędzej czy później któreś zostałoby pominięte.
  const usersDoGrafiku = users.filter((u) => !czekaNaDecyzje(u));
  const archivedUsers = users.filter(
    (u) => u.archived && hasAccessToLokal(u.default_lokal)
  );
  const availableLokaleForManager = activeLokale.filter((l) =>
    hasAccessToLokal(l.name)
  );

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

  // Zadania po terminie i bez wykonania — świadomie NIE rozbite po
  // pracownikach, żeby jedno przeterminowane zadanie nie zawyżało licznika
  // przez wielu ludzi (wykonanie jest i tak wspólne, patrz utils/tasks.ts).
  const todayStrForBadge = toLocalYMD(new Date());
  // Termin zadania: własny, a gdy go nie ma — domyślny termin bloku.
  const terminPozycji = (i) =>
    (i.task.deadline_time || i.blok.deadline_time || "").slice(0, 5) || null;
  const nowTimeStr = new Date().toTimeString().slice(0, 5);
  const zadaniaOverdueCount = zadaniaNaDzien({
    tasks,
    blocks: taskBlocks,
    completions: taskCompletions,
    dateStr: todayStrForBadge,
    forManager: false,
  }).filter(
    (i) =>
      hasAccessToLokal(i.task.lokal) &&
      !i.done &&
      terminPozycji(i) &&
      terminPozycji(i) < nowTimeStr
  ).length;

  // Skrzynka (0.51.0) zastąpiła Zgłoszenia i Powiadomienia. Znaczek liczy
  // "Do zrobienia" tą samą funkcją co lista — przy "Cała sieć" liczby muszą
  // się zgadzać (sprawdza harness-panel.html).
  const zakresNazwa =
    selectedLokal !== "ALL" ? selectedLokal : isLocalManager ? "Wszystkie moje" : "Cała sieć";
  const daneSkrzynki = {
    issues: widoczneZgloszenia,
    users,
    tasks,
    zadaniaMoje,
    absences,
    notifications: managerNotifications,
    shifts,
    planShifts,
    lokale,
    dayLogs,
    lokaleNames: availableLokaleForManager.map((l) => l.name),
  };
  const skrzynkaDoZrobienia = zbierzSprawy({ ...daneSkrzynki, lokalOk: hasAccessToLokal }).filter(
    (s) => s.box === "todo"
  ).length;

  const shellBadges = {
    zatwierdzanie:
      pendingCorrections.length +
      pendingAbsences.length +
      pendingSwaps.length +
      porzuconeZmiany.length +
      probniOczekujacy.length +
      brakiOdbiciaDoDecyzji.length,
    skrzynka: skrzynkaDoZrobienia,
    // Dzwonek w górnym pasku — nieprzeczytane powiadomienia; prowadzi do
    // zakładki "Informacje" w Skrzynce.
    powiadomienia: unreadManagerCount,
    pracownicy: pracownicyTerminyCount,
    zadania: zadaniaOverdueCount,
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const dataToSave = { ...editingUser };
      // ⚠️ Kolumny WYLICZANE trzeba wyrzucić z payloadu. Payload powstaje z
      // rozsypania wiersza pobranego z bazy, więc niesie wszystko, co baza
      // oddała — a Postgres odrzuca CAŁY zapis, gdy w środku jest kolumna
      // `generated always as` (`ma_kiosk_pin`, migracja 0027). Objaw byłby
      // mylący: "Błąd zapisu pracownika" przy KAŻDEJ karcie, także takiej,
      // której nikt nie tknął w okolicy PIN-u.
      //
      // Dopisując kolejną kolumnę wyliczaną, dopisz ją TUTAJ.
      for (const wyliczana of ["ma_kiosk_pin"]) delete dataToSave[wyliczana];
      if (dataToSave.role === "open") {
        // E-mail ZOSTAJE: razem z kiosk_pin daje pracownikowi dostęp do jego
        // ekranów z prywatnego telefonu. Czyścimy tylko `pin` — sześciocyfrowy
        // PIN logowania, którego konto otwarte nie używa (loguje się PIN-em
        // blokady, patrz LoginScreen).
        dataToSave.pin = "";
      }
      // Logowanie porównuje e-mail dosłownie, a klawiatura telefonu lubi
      // dopisać spację i wielką literę — normalizujemy przy zapisie, żeby
      // "nie ma takiego użytkownika" nie brało się z niewidocznej różnicy.
      if (typeof dataToSave.email === "string") {
        dataToSave.email = dataToSave.email.trim().toLowerCase();
      }
      // Puste "" z <input type="date"> Postgres odrzuca jako nieprawidłową
      // datę (kolumna date, nullable) — trzeba jawnie zamienić na null.
      if (!dataToSave.sanepid_expiry) dataToSave.sanepid_expiry = null;
      if (!dataToSave.umowa_expiry) dataToSave.umowa_expiry = null;
      if (!dataToSave.puls_do) dataToSave.puls_do = null;
      if (!dataToSave.ostatni_dzien) dataToSave.ostatni_dzien = null;
      // Po ostatnim dniu pracy konto jest NIEAKTYWNE, ale nie w archiwum
      // (0.70.1, ustalenie właściciela). Co noc robi to api/cron/koniec-pracy.js;
      // tutaj — dla daty wpisanej wstecz, żeby nie czekać do nocy. Kto ma zostać
      // aktywny po tej dacie, musi mieć datę zmienioną albo wyczyszczoną —
      // inaczej najbliższa noc wyłączy go znowu.
      const wylaczonePoKoncu =
        !!dataToSave.ostatni_dzien &&
        dataToSave.ostatni_dzien < toLocalYMD(new Date()) &&
        dataToSave.active !== false;
      if (wylaczonePoKoncu) dataToSave.active = false;
      if (!dataToSave.data_urodzenia) dataToSave.data_urodzenia = null;
      if (!dataToSave.data_zatrudnienia) dataToSave.data_zatrudnienia = null;
      if (dataToSave.umowa_bezterminowa) dataToSave.umowa_expiry = null;
      // To samo dla kolumn numeric — pusty string zamiast liczby. Wartości
      // zostają nawet wtedy, gdy nie pasują do wybranego typu umowy (stawka
      // godzinowa przy umowie o pracę): kierownik bywa w trakcie zmiany typu,
      // a ciche kasowanie kwoty przy zapisie byłoby najgorszym momentem, żeby
      // się o tym dowiedzieć.
      for (const pole of ["stawka", "wymiar_etatu", "wynagrodzenie_mies"]) {
        dataToSave[pole] =
          dataToSave[pole] === "" || dataToSave[pole] == null ? null : Number(dataToSave[pole]);
      }
      // Konta sprzed migracji 0018 trzymają rodzaj umowy jeszcze w kolumnie
      // `etat`; formularz pokazuje go poprawnie dzięki fallbackowi w
      // `typUmowy()`. Utrwalamy to przy pierwszym zapisie karty — inaczej
      // kierownik widziałby "Umowa zlecenie", zapisał i nic by się nie
      // zapisało, bo pola nie dotknął.
      dataToSave.typ_umowy = dataToSave.typ_umowy || typUmowy(dataToSave) || null;
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

      let zapisany;
      if (editingUser.id) {
        zapisany = await api.patch("users", editingUser.id, dataToSave);
        setUsers(users.map((user) => (user.id === zapisany.id ? zapisany : user)));
      } else {
        delete dataToSave.id;
        zapisany = await api.post("users", dataToSave);
        setUsers([...users, zapisany]);
      }

      // ⚠️ PIN jest DWIEMA rzeczami naraz: wpisem w kartotece (blokada profilu
      // na tablecie) i hasłem konta w Supabase Auth (logowanie z prywatnego
      // telefonu). Zapis samej kolumny rozjechałby je po cichu — tablet
      // otwierałby się nowym PIN-em, a logowanie dalej chciało starego.
      // Konto otwarte loguje się `kiosk_pin`, reszta `pin` (patrz LoginScreen).
      const pinTeraz =
        String((dataToSave.role === "open" ? dataToSave.kiosk_pin : dataToSave.pin) || "");
      const pinPrzed = String(
        (existingUser
          ? existingUser.role === "open"
            ? existingUser.kiosk_pin
            : existingUser.pin
          : "") || ""
      );
      let ostrzezenie = "";
      if (pinTeraz && pinTeraz !== pinPrzed) {
        try {
          await ustawHasloPracownika(zapisany.id, pinTeraz);
        } catch (e) {
          // Kartoteka jest już zapisana, więc NIE udajemy, że nic się nie
          // stało — ale i nie cofamy zapisu. Mówimy dokładnie, co się
          // rozjechało, bo to jedyna informacja, z którą da się coś zrobić.
          ostrzezenie =
            ` UWAGA: PIN na tablecie zmieniony, ale hasło do logowania NIE — ${
              e.message || "nieznany błąd"
            }`;
        }
      }

      // Karta zostaje otwarta z tym, co zapisano (0.52.0) — pasek "Zapisz"
      // znika, bo nie ma już różnic, a kierownik widzi wynik zamiast pustego
      // miejsca po karcie.
      setEditingUser({ ...zapisany });
      const poKoncu = wylaczonePoKoncu
        ? " Ostatni dzień pracy minął — konto jest teraz nieaktywne (nie w archiwum)."
        : "";
      if (ostrzezenie) showMsg(`Zapisano pracownika.${poKoncu}${ostrzezenie}`, "error");
      else showMsg(`Zapisano pracownika!${poKoncu}`);
    } catch (err) {
      showMsg(`Błąd zapisu pracownika: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // Zdjęcie zmian TĄ SAMĄ zasadą co ręczne usuwanie: wysłane zostają z
  // deleted_at (pracownicy dowiedzą się przy najbliższej wysyłce), niewysłane
  // znikają od razu.
  const zdejmijZmiany = async (zmianyDoZdjecia) => {
    const teraz = new Date().toISOString();
    const poZmianie = [];
    for (const zm of zmianyDoZdjecia) {
      if (zm.published_at) {
        poZmianie.push(
          await api.patch("grafik_shifts", zm.id, {
            deleted_at: teraz,
            updated_at: teraz,
          })
        );
      } else {
        await api.delete("grafik_shifts", zm.id);
      }
    }
    // Zmiana zdjęta z grafiku zabiera ze sobą swoją ofertę z giełdy — bez
    // tego zostaje wiersz wskazujący na nieistniejącą zmianę (patrz
    // `wycofajOfertyDlaZmian`). Wołamy tu, bo `utils/grafik.ts` nie może
    // importować `utils/swaps.ts`: zależność idzie w drugą stronę i powstałby
    // cykl.
    await wycofajOfertyDlaZmian({
      swaps: shiftSwaps,
      shiftIds: zmianyDoZdjecia.map((z) => z.id),
    });
    const zdjete = new Set(zmianyDoZdjecia.map((z) => String(z.id)));
    const mapa = new Map(poZmianie.map((z) => [String(z.id), z]));
    setPlanShifts(
      (planShifts || [])
        .filter((z) => !zdjete.has(String(z.id)) || mapa.has(String(z.id)))
        .map((z) => mapa.get(String(z.id)) || z)
    );
  };

  // `potwierdzone` — ekran sam zapytał (karta pracownika ma krok "Tak,
  // archiwizuj"), więc drugiego okna przeglądarki już nie pokazujemy.
  const handleArchiveEntity = async (table, id, isArchiving, { potwierdzone = false } = {}) => {
    // Archiwizacja pracownika nie może po cichu zostawić jego zmian w
    // grafiku: liczyłyby się jako obsada, a nikt by na nie nie przyszedł.
    // Przy odejściu prawie zawsze ktoś wchodzi na to miejsce, więc zamiast
    // pytać tylko "zdjąć?", dajemy też przepisanie na następcę.
    if (table === "users" && isArchiving) {
      const user = users.find((u) => u.id === id);
      const zmiany = futureShiftsOfUser(planShifts, user, toLocalYMD(new Date()));
      if (zmiany.length > 0) {
        setZmianyOdchodzacego({ user, zmiany });
        return;
      }
    }
    if (
      !potwierdzone &&
      !window.confirm(
        isArchiving ? "Zarchiwizować ten element?" : "Przywrócić z archiwum?"
      )
    )
      return false;
    try {
      const res = await api.patch(table, id, { archived: isArchiving });
      if (table === "users")
        setUsers(users.map((u) => (u.id === id ? res : u)));
      if (table === "lokale")
        setLokale(lokale.map((l) => (l.id === id ? res : l)));
      if (table === "stanowiska")
        setStanowiska(stanowiska.map((s) => (s.id === id ? res : s)));
      showMsg(isArchiving ? "Przeniesiono do archiwum" : "Przywrócono z archiwum");
      // Wynik mówi wołającemu, czy element faktycznie zmienił stan — karta
      // lokalu w Ustawieniach zamyka się tylko wtedy, nie po "Anuluj".
      return true;
    } catch (err) {
      showMsg("Błąd archiwizacji", "error");
      return false;
    }
  };

  // Decyzja z modala "co ze zmianami odchodzącego" — przepisać na następcę
  // albo zdjąć. W obu wypadkach kończymy archiwizacją, bo po to kierownik tu
  // wszedł; przerwanie w połowie zostawiłoby konto czynne, a grafik ruszony.
  const dokonczArchiwizacje = async (naKogo) => {
    const { user, zmiany } = zmianyOdchodzacego;
    setPrzepisuje(true);
    try {
      let podsumowanie = "";
      if (naKogo) {
        const nastepca = users.find((u) => String(u.id) === String(naKogo));
        const { przepisane, pominiete } = await przepiszZmiany({
          zmiany,
          doUzytkownika: nastepca,
          planShifts,
          absences,
          api,
        });
        const mapa = new Map(przepisane.map((z) => [String(z.id), z]));
        setPlanShifts(
          (planShifts || []).map((z) => mapa.get(String(z.id)) || z)
        );
        // Zmiana zmieniła właściciela, więc oferta wystawiona przez
        // odchodzącego przestaje mieć sens — „oddaję swoją zmianę" po
        // przepisaniu dotyczy cudzej. Zdjęte zmiany załatwia `zdejmijZmiany`
        // niżej, więc tu tylko przepisane.
        await wycofajOfertyDlaZmian({
          swaps: shiftSwaps,
          shiftIds: przepisane.map((z) => z.id),
          powod: `zmiana przeszła na osobę: ${nastepca.name}`,
        });
        // Pominięte zostają na odchodzącym — zdejmujemy je, żeby nie udawały
        // obsady po jego odejściu.
        if (pominiete.length > 0) await zdejmijZmiany(pominiete.map((x) => x.zmiana));
        podsumowanie =
          `Przepisano ${przepisane.length} zmian na ${nastepca.name}.` +
          (pominiete.length > 0
            ? ` ${pominiete.length} pominięto (${[
                ...new Set(pominiete.map((x) => x.powod)),
              ].join(", ")}) i zdjęto z grafiku.`
            : "");
      } else {
        await zdejmijZmiany(zmiany);
        podsumowanie = `Zdjęto ${zmiany.length} zmian z grafiku.`;
      }
      const res = await api.patch("users", user.id, { archived: true });
      setUsers(users.map((u) => (u.id === user.id ? res : u)));
      setZmianyOdchodzacego(null);
      showMsg(`Przeniesiono do archiwum. ${podsumowanie}`);
    } catch (err) {
      showMsg(err.message || "Błąd archiwizacji", "error");
    }
    setPrzepisuje(false);
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

  // Puste pole liczbowe to null, nie 0 i nie "" — Postgres odrzuca pusty
  // string dla kolumny numeric, a zero znaczyłoby "zero procent narzutu"
  // zamiast "nie ustawiono".
  // Przecinek jak kropka: pola z jednostką w Ustawieniach (%, godz.) są
  // tekstowe, a "20,5" przez samo Number() dawało NaN — czyli null w bazie,
  // po cichu, zamiast wpisanego narzutu.
  const num = (v) => {
    if (v === "" || v == null) return null;
    const n = Number(String(v).trim().replace(",", "."));
    return Number.isNaN(n) ? null : n;
  };
  // Kolumny `integer` — "1,5 min" wpisane w pole odrzuciłoby cały zapis lokalu.
  const minutyCale = (v) => (num(v) == null ? null : Math.max(0, Math.round(num(v))));

  // Zwraca zapisany wiersz (albo nic przy błędzie) — Ustawienia po dodaniu
  // lokalu otwierają od razu jego kartę i potrzebują do tego nowego id.
  const handleSaveDict = async (e, type) => {
    e.preventDefault();
    let zapisany = null;
    try {
      if (type === "lokale") {
        const payload = {
          name: editingDict.name,
          miasto: editingDict.miasto || null,
          // Lista kluczy po przecinku, jak allowed_lokale. NULL nie jest tym
          // samym co pusty string: NULL = wszystko dostępne (tak zachowują
          // się lokale sprzed tej funkcji), "" = nic nie jest dostępne.
          dostepne_bloki: Array.isArray(editingDict.dostepne_bloki)
            ? editingDict.dostepne_bloki.join(",")
            : editingDict.dostepne_bloki ?? null,
          // ⚠️ dzien_wyplaty było w formularzu, ale nie w tym payloadzie —
          // pole dawało się wpisać i cicho przepadało przy zapisie.
          dzien_wyplaty: num(editingDict.dzien_wyplaty),
          okres_rozliczeniowy: num(editingDict.okres_rozliczeniowy),
          narzut_umowa: num(editingDict.narzut_umowa),
          narzut_zlecenie: num(editingDict.narzut_zlecenie),
          // ⚠️ Ten payload budowany jest z JAWNEJ listy pól, nie ze {...stanu}
          // — każde nowe pole formularza trzeba dopisać także tutaj, inaczej
          // wpisana wartość przepada bez błędu (patrz dzien_wyplaty wyżej).
          tolerancja_po_grafiku_h: num(editingDict.tolerancja_po_grafiku_h),
          max_dlugosc_zmiany_h: num(editingDict.max_dlugosc_zmiany_h),
          // Rejestracja godzin (0036). ⚠️ Wymaga migracji PRZED deployem —
          // PostgREST odrzuca cały zapis z nieznaną kolumną. NULL w trybie =
          // oba sposoby; w oknach NULL = bez limitu, a 0 = tylko "teraz",
          // więc num() (które zero zostawia zerem) jest tu właściwe.
          tryb_wpisu: editingDict.tryb_wpisu || null,
          start_wstecz_min: minutyCale(editingDict.start_wstecz_min),
          koniec_wstecz_min: minutyCale(editingDict.koniec_wstecz_min),
        };
        if (editingDict.id) {
          const l = await api.patch("lokale", editingDict.id, payload);
          setLokale(lokale.map((lok) => (lok.id === l.id ? l : lok)));
          zapisany = l;
        } else {
          const l = await api.post("lokale", payload);
          setLokale([...lokale, l]);
          zapisany = l;
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
          zapisany = s;
        } else {
          const s = await api.post("stanowiska", payload);
          setStanowiska([...stanowiska, s]);
          zapisany = s;
        }
      }
      setEditingDict(null);
      showMsg("Zapisano w bazie!");
    } catch (err) {
      // Przyczyna w komunikacie — "Błąd zapisu" bez niej nie odróżnia braku
      // kolumny w bazie od braku uprawnień (patrz błąd #17 w CLAUDE.md).
      showMsg(`Błąd zapisu: ${err.message || "nieznany błąd"}`, "error");
    }
    return zapisany;
  };

  // Wołane ze Skrzynki po 6 s "Cofnij" — o decyzji mówi już pasek, więc bez
  // komunikatu sukcesu. Błąd rzuca dalej, Skrzynka pokazuje go z imieniem.
  const resolveIssue = async (id) => {
    const i = await api.patch("issues", id, { status: "rozwiazane" });
    setIssues((prev) => prev.map((iss) => (iss.id === i.id ? i : iss)));
  };

  // Odpowiedź na zgłoszenie problemu (0.67.0) — do tej pory pracownik pisał i
  // nie dowiadywał się niczego, a na tablecie nie widzi nawet statusu (RLS,
  // patrz api.dodajBezOdczytu). Treść żyje tylko w wiadomości: `issues` nie ma
  // kolumny na odpowiedź, a wiadomość i tak jest tym, co pracownik przeczyta.
  // Temat skracamy — pełne zgłoszenie autor zna.
  const odpowiedzNaZgloszenie = async (issue, tekst, zamknij) => {
    if (!issue.user_name) throw new Error("Zgłoszenie anonimowe — nie ma komu odpowiedzieć.");
    const temat = (issue.issue_text || "").trim();
    const krotko = temat.length > 60 ? `${temat.slice(0, 57)}…` : temat;
    await createEmployeeNotification(
      issue.user_name,
      `${currentUser.name} odpowiedział(a) na Twoje zgłoszenie „${krotko}”: ${tekst.trim()}`,
      "issue_reply",
      // E-mail (0.70.0) pokazuje temat i odpowiedź osobno, jak w rozmowie.
      { cytat: temat.length > 200 ? `${temat.slice(0, 197)}…` : temat, odpowiedz: { kto: currentUser.name, tekst: tekst.trim() } }
    );
    if (zamknij && issue.status === "nowe") await resolveIssue(issue.id);
  };

  // "Utwórz zadanie" w Skrzynce — od 0.56.0 trafia do "Moich zadań"
  // (`zadania_moje`, utils/mojeZadania.ts), a nie do `tasks`: sprawa ze
  // zgłoszenia jest jednorazowa, a zadanie bez bloku wracało codziennie jak
  // pozycja checklisty.
  const handleCreateTaskFromIssue = async (issue, title, lokalForTask) => {
    if (!title.trim()) return showMsg("Brak tytułu zadania.", "error");
    const d = issue.created_at ? new Date(issue.created_at) : null;
    const kiedy = d ? ` ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}` : "";
    const anonim = issue.is_anonymous || !issue.user_id;
    try {
      const created = await dodajMojeZadanie({
        tytul: title,
        lokal: lokalForTask || null,
        termin: toLocalYMD(new Date()),
        zrodlo: "zgloszenie",
        zrodloId: issue.id,
        zrodloOpis: `${anonim ? "Zgłoszenie anonimowe" : `Zgłoszenie · ${issue.user_name}`}${kiedy}`,
        currentUser,
      });
      setZadaniaMoje((prev) => [created, ...prev]);
      showMsg("Dodano do Moich zadań.");
    } catch (err) {
      showMsg(`Błąd tworzenia zadania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // Okno wpisu godzin (manager/WpisGodzinModal.tsx) — formularz trzyma samo
  // okno; tu zostaje zapis, bo potrzebuje kolizji w bazie, powiadomienia i
  // arkusza Google.
  const openEditShift = (shift) => setEditingShift(shift);
  const openNewShift = () =>
    setEditingShift({ id: null, user_id: "", user_name: "", start_time: new Date(), end_time: null });

  // --- OTO MAGIA GOOGLE SHEETS DLA EDYCJI (i tworzenia — "+ Dodaj wpis") ---
  // Zwraca true, gdy zapisano — okno zamyka się dopiero wtedy.
  // `baza` — wiersz, który poprawiamy (id === null → nowy wpis). `cicho` —
  // bez komunikatu sukcesu, gdy o decyzji mówi już pasek "Cofnij" (Aktywni).
  const zapiszWpis = async (form, baza, { cicho = false } = {}) => {
    const nowy = !baza?.id;
    try {
      const [year, month, day] = form.date.split("-").map(Number);
      const [startH, startM] = form.start.split(":").map(Number);
      const startD = new Date(year, month - 1, day, startH, startM);
      let endD = null,
        hrs = null;
      if (form.end) {
        const [endH, endM] = form.end.split(":").map(Number);
        endD = new Date(year, month - 1, day, endH, endM);
        if (endD <= startD) endD.setDate(endD.getDate() + 1);
        hrs = parseFloat(((endD - startD) / (1000 * 60 * 60)).toFixed(2));
      }
      const userId = form.userId || baza.user_id;

      // Kierownik naprawia też niespójne dane, więc tu zostaje ostrzeżenie, nie
      // blokada — ale pytamy również BAZY, bo jego lista bywa równie
      // nieaktualna jak lista na tablecie.
      const kolizja =
        findOverlappingShift(shifts, userId, startD, endD, baza.id) ||
        (await znajdzKolizjeWBazie({
          userId,
          start: startD,
          end: endD,
          excludeId: baza.id,
        }));
      if (kolizja) {
        const confirmed = window.confirm(
          `Ta zmiana nakłada się na inną zapisaną zmianę tego pracownika ` +
            `(${opisKolidujacej(kolizja)}). Zapisać mimo to?`
        );
        if (!confirmed) return false;
      }
      // Nowy wpis, który opisuje pracę z JUŻ odbitym startem bez końca — druga
      // zmiana obok porzuconej (Natalia, 25.09.2026). Ostrzeżenie, nie
      // blokada: właściwa droga to zakończyć tamtą (Aktywni albo "Do
      // decyzji" → Zmiany bez zakończenia).
      if (nowy && !kolizja) {
        const otwarta =
          znajdzOtwartaDoZakonczenia(shifts, userId, startD, endD) ||
          (await znajdzOtwartaWBazie({ userId, start: startD, end: endD }));
        if (otwarta) {
          const confirmed = window.confirm(
            `Ta osoba ma już zmianę bez zakończenia (${opisKolidujacej(otwarta)}). ` +
              `Zamiast dodawać drugą, zakończ tamtą — w Aktywnych albo w "Do decyzji". ` +
              `Dodać mimo to?`
          );
          if (!confirmed) return false;
        }
      }

      let updated;
      if (nowy) {
        const user = users.find((u) => u.id === userId);
        updated = await api.post("shifts", {
          user_id: userId,
          user_name: user?.name || "",
          start_time: startD.toISOString(),
          end_time: endD ? endD.toISOString() : null,
          lokal: form.lokal,
          stanowisko: form.stanowisko,
          godzin: hrs,
        });
      } else {
        updated = await api.patch("shifts", baza.id, {
          start_time: startD.toISOString(),
          end_time: endD ? endD.toISOString() : null,
          lokal: form.lokal,
          stanowisko: form.stanowisko,
          godzin: hrs,
        });
      }
      const parsed = {
        ...updated,
        start_time: new Date(updated.start_time),
        end_time: updated.end_time ? new Date(updated.end_time) : null,
      };
      setShifts((prev) =>
        nowy ? [...prev, parsed] : prev.map((s) => (s.id === parsed.id ? parsed : s))
      );

      // Ślad: kto, kiedy, było → jest i dlaczego. Rejestr pokazuje go w
      // historii wpisu i jako "Korekta · Imię".
      const slad = await zapiszSladRecznejZmiany({
        stara: nowy ? null : baza,
        nowa: parsed,
        editorName: currentUser.name,
        reason: form.reason,
        source: nowy ? "manual_add" : "manual_edit",
      });
      if (slad) setShiftEdits((prev) => [...prev, slad]);

      // Powiadomienie dla pracownika o edycji zmiany (nie dotyczy nowego wpisu)
      if (!nowy) {
        const oldStart = baza.start_time;
        const oldEnd = baza.end_time;
        const changed =
          oldStart.getTime() !== startD.getTime() ||
          (oldEnd ? oldEnd.getTime() : null) !== (endD ? endD.getTime() : null);
        if (changed) {
          notifyEmployee(parsed, "edit", oldStart, oldEnd, startD, endD, form.reason);
        }
      }

      // Automatyczna poprawka w Google Sheets — w tle, nie czekamy (Supabase
      // to źródło prawdy, Apps Script bywa wolny).
      sendToGoogleSheets(parsed, nowy ? "ADD_SHIFT" : "EDIT_SHIFT");

      if (!cicho) showMsg(nowy ? "Wpis dodany!" : "Zmiana zaktualizowana!");
      return true;
    } catch (err) {
      showMsg(`Błąd zapisu: ${err.message || "nieznany błąd"}`, "error");
      return false;
    }
  };

  const zapiszWpisGodzin = (form) => zapiszWpis(form, editingShift);

  // Aktywni: "Zakończ" z godziną i "Dopisz wejście" z grafiku — ta sama droga
  // zapisu co okno wpisu (kolizje w bazie, ślad, powiadomienie, arkusz).
  const hhmmLok = (d) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const zakonczZmiane = (shift, godzina) =>
    zapiszWpis(
      {
        userId: shift.user_id,
        date: toLocalYMD(shift.start_time),
        start: hhmmLok(shift.start_time),
        end: godzina,
        lokal: shift.lokal,
        stanowisko: shift.stanowisko,
        reason: "",
      },
      shift,
      { cicho: true }
    );
  // `godzina` wybiera kierownik (wg grafiku albo teraz) — bez niej start z grafiku.
  const dopiszWejscie = (plan, user, godzina) =>
    zapiszWpis(
      {
        userId: user.id,
        date: plan.date,
        start: godzina || String(plan.start_time).slice(0, 5),
        end: "",
        lokal: plan.lokal,
        stanowisko: plan.stanowisko,
        reason: "Wejście dopisane przez kierownika",
      },
      { id: null, user_id: user.id, user_name: user.name },
      { cicho: true }
    );

  // Skrzynka: przeczytane powiadomienia.
  const oznaczPrzeczytane = async (ids) => {
    if (!ids.length) return;
    try {
      await api.patchByFilter("notifications", `id=in.(${ids.join(",")})`, { is_read: true });
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)));
    } catch (e) {
      showMsg("Nie udało się oznaczyć jako przeczytane.", "error");
    }
  };

  // --- OTO MAGIA GOOGLE SHEETS DLA USUWANIA ---
  // Usunięcie idzie przez 6 s "Cofnij" (odlozoneDecyzje.tsx) zamiast
  // window.confirm: wiersz znika z Rejestru od razu, a kasowanie w bazie
  // rusza dopiero po czasie na rozmyślenie się.
  const usunWpisGodzin = async (shift) => {
    try {
      await api.delete("shifts", shift.id);
      setShifts((prev) => prev.filter((s) => s.id !== shift.id));
      const slad = await zapiszSladRecznejZmiany({
        stara: shift,
        nowa: null,
        editorName: currentUser.name,
        reason: "",
        source: "manual_delete",
      });
      if (slad) setShiftEdits((prev) => [...prev, slad]);

      // Powiadomienie dla pracownika o usunięciu zmiany
      notifyEmployee(shift, "delete", shift.start_time, shift.end_time, null, null);

      // Automatyczne usunięcie z Google Sheets — w tle, patrz komentarz
      // w zapiszWpisGodzin.
      sendToGoogleSheets(shift, "DELETE_SHIFT");
    } catch (err) {
      // Pokazujemy prawdziwą przyczynę — samo "Błąd usuwania." nie mówiło
      // ani co padło, ani czy zmiana została skasowana.
      showMsg(err.message || "Błąd usuwania.", "error");
    }
  };
  const {
    odlozone: usuwaneWpisy,
    toast: pasekUsuniecia,
    decyduj: zlecUsuniecie,
    cofnij: cofnijUsuniecie,
  } = useOdlozoneDecyzje({ usunWpisGodzin });
  const usunZCofnij = (shift) => {
    setEditingShift(null);
    const d = shift.start_time;
    zlecUsuniecie(
      [{ klucz: `usun:${shift.id}`, zadanie: ["usunWpisGodzin", [shift]] }],
      `Usunięto wpis: ${shift.user_name} · ${String(d.getDate()).padStart(2, "0")}.${String(
        d.getMonth() + 1
      ).padStart(2, "0")}`
    );
  };

  const wBudowieLabel = NAV_ITEMS.find((n) => n.key === tab)?.label || tab;

  return (
    <ManagerShell
      currentUser={currentUser}
      isLocalManager={isLocalManager}
      lokaleForTabs={lokaleForTabs}
      selectedLokal={selectedLokal}
      setSelectedLokal={setSelectedLokal}
      weatherCity={weatherCity}
      jestWlascicielem={jestWlascicielem}
      activeTab={tab}
      setActiveTab={setTab}
      badges={shellBadges}
      onLogout={() => setCurrentView("login")}
    >
      <div className="relative">
        {editingShift && (
          <WpisGodzinModal
            shift={editingShift}
            users={visibleUsers}
            lokale={availableLokaleForManager}
            stanowiska={activeStanowiska}
            planShifts={planShifts}
            shiftEdits={shiftEdits}
            onClose={() => setEditingShift(null)}
            onSave={zapiszWpisGodzin}
            onDelete={usunZCofnij}
          />
        )}
        {pasekUsuniecia && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-50 w-[calc(100%-32px)] max-w-[480px]">
            <PasekCofnij opis={pasekUsuniecia.opis} onCofnij={cofnijUsuniecie} />
          </div>
        )}

        {tab === "pulpit" && (
          <PulpitHome
            currentUser={currentUser}
            users={users}
            shifts={shifts}
            setShifts={setShifts}
            issues={issues}
            setIssues={setIssues}
            setShiftEdits={setShiftEdits}
            lokale={lokale}
            hasAccessToLokal={hasAccessToLokal}
            zakres={zakresNazwa}
            setDayLogs={setDayLogs}
            dayLogEntries={dayLogEntries}
            dayLogTemplates={dayLogTemplates}
            showMsg={showMsg}
            tasks={tasks}
            taskBlocks={taskBlocks}
            taskCompletions={taskCompletions}
            absences={absences}
            matchesFilter={matchesLokalFilter}
            setActiveTab={setTab}
            shiftSwaps={shiftSwaps}
            planShifts={planShifts}
            dayLogs={dayLogs}
            availableLokaleForManager={availableLokaleForManager}
            onOpenPuls={goToPuls}
          />
        )}
        {tab === "raporty" && (
          <RaportyIKoszty
            users={users}
            shifts={shifts}
            lokale={lokale}
            stanowiska={stanowiska}
            matchesFilter={matchesLokalFilter}
            hasAccessToLokal={hasAccessToLokal}
            onEditShift={openEditShift}
            selectedUserId={reportUserId}
            setSelectedUserId={setReportUserId}
            skok={reportSkok}
            planShifts={planShifts}
            shiftEdits={shiftEdits}
            // Te same kolejki co znaczek "Zatwierdzanie zmian" — raport liczy
            // z nich tylko sprawy z oglądanego miesiąca (Gotowość do rozliczenia).
            doDecyzji={{
              korekty: pendingCorrections,
              braki: brakiOdbiciaDoDecyzji,
              porzucone: porzuconeZmiany,
            }}
            onGoToApprovals={() => setTab("zatwierdzanie")}
            onGoToRegister={() => setTab("godziny")}
            onOpenEmployee={goToEmployeeCard}
          />
        )}

        {tab === "przewodnik" && <Przewodnik />}

        {tab === "ustawienia" && jestWlascicielem && (
          <Ustawienia
            currentUser={currentUser}
            lokale={lokale}
            stanowiska={stanowiska}
            users={users}
            editingDict={editingDict}
            setEditingDict={setEditingDict}
            onSaveDict={handleSaveDict}
            onArchive={handleArchiveEntity}
            onOpenEmployee={goToEmployeeCard}
          />
        )}

        {tab === "zadania" && (
          <ZadaniaISprzatanie
            currentUser={currentUser}
            tasks={tasks}
            setTasks={setTasks}
            taskBlocks={taskBlocks}
            setTaskBlocks={setTaskBlocks}
            taskCompletions={taskCompletions}
            setTaskCompletions={setTaskCompletions}
            dayLogs={dayLogs}
            dayLogEntries={dayLogEntries}
            setDayLogEntries={setDayLogEntries}
            dayLogTemplates={dayLogTemplates}
            planShifts={planShifts}
            users={users}
            matchesFilter={matchesLokalFilter}
            availableLokale={availableLokaleForManager}
            activeStanowiska={activeStanowiska}
            selectedLokal={selectedLokal}
            onWybierzLokal={setSelectedLokal}
            zadaniaMoje={zadaniaMoje}
            setZadaniaMoje={setZadaniaMoje}
            mojeBlad={mojeBlad}
            showMsg={showMsg}
          />
        )}

        {tab === "puls" && (
          <Puls
            currentUser={currentUser}
            selectedLokal={selectedLokal}
            availableLokaleForManager={availableLokaleForManager}
            lokale={lokale}
            shifts={shifts}
            planShifts={planShifts}
            users={users}
            setUsers={setUsers}
            tasks={tasks}
            taskBlocks={taskBlocks}
            taskCompletions={taskCompletions}
            staffingRules={staffingRules}
            staffingRuleSets={staffingRuleSets}
            grafikWyjatki={grafikWyjatki}
            dayLogs={dayLogs}
            setDayLogs={setDayLogs}
            dayLogEntries={dayLogEntries}
            setDayLogEntries={setDayLogEntries}
            dayLogTemplates={dayLogTemplates}
            setDayLogTemplates={setDayLogTemplates}
            weatherForecasts={weatherForecasts}
            budzetCele={budzetCele}
            budzetDni={budzetDni}
            setBudzetDni={setBudzetDni}
            showMsg={showMsg}
            initialLokal={pulsCel && pulsCel.lokal}
            initialDate={pulsCel && pulsCel.date}
            zadaniaMoje={zadaniaMoje}
            setZadaniaMoje={setZadaniaMoje}
          />
        )}

        {tab === "grafik" && (
          <Grafik
            currentUser={currentUser}
            selectedLokal={selectedLokal}
            availableLokaleForManager={availableLokaleForManager}
            lokale={lokale}
            users={usersDoGrafiku}
            setUsers={setUsers}
            activeStanowiska={activeStanowiska}
            planShifts={planShifts}
            setPlanShifts={setPlanShifts}
            shiftSwaps={shiftSwaps}
            onResolveSwap={handleResolveSwap}
            absences={absences}
            setAbsences={setAbsences}
            setShifts={setShifts}
            staffingRules={staffingRules}
            setStaffingRules={setStaffingRules}
            staffingRuleSets={staffingRuleSets}
            setStaffingRuleSets={setStaffingRuleSets}
            lokaleGodziny={lokaleGodziny}
            setLokaleGodziny={setLokaleGodziny}
            grafikWyjatki={grafikWyjatki}
            setGrafikWyjatki={setGrafikWyjatki}
            budzetCele={budzetCele}
            setBudzetCele={setBudzetCele}
            budzetDni={budzetDni}
            setBudzetDni={setBudzetDni}
            dayLogs={dayLogs}
            onNewEmployee={goToNewEmployee}
            showMsg={showMsg}
          />
        )}

        {zmianyOdchodzacego && (
          <PrzepiszZmianyModal
            odchodzacy={zmianyOdchodzacego.user}
            zmiany={zmianyOdchodzacego.zmiany}
            pracuje={przepisuje}
            kandydaci={visibleUsers.filter(
              (u) =>
                u.active &&
                u.role !== "kiosk" &&
                String(u.id) !== String(zmianyOdchodzacego.user.id) &&
                !poOstatnimDniu(u, toLocalYMD(new Date()))
            )}
            onPrzepisz={(naKogo) => dokonczArchiwizacje(naKogo)}
            onZdejmij={() => dokonczArchiwizacje(null)}
            onClose={() => setZmianyOdchodzacego(null)}
          />
        )}

        {!TABY_Z_WLASNYM_WIDOKIEM.includes(tab) && (
          <WBudowie label={wBudowieLabel} />
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
            planShifts={planShifts}
            onGoToApprovals={() => setTab("zatwierdzanie")}
            ukryte={usuwaneWpisy}
          />
        )}

        {tab === "aktywni" && (
          <Aktywni
            shifts={shifts}
            planShifts={planShifts}
            lokale={lokale}
            users={users}
            absences={absences}
            issues={issues}
            matchesFilter={matchesLokalFilter}
            zakres={zakresNazwa}
            onEndShift={openEditShift}
            onZakoncz={zakonczZmiane}
            onDopiszWejscie={dopiszWejscie}
            onNameClick={goToEmployeeReport}
          />
        )}

        {tab === "moja_praca" && (
          <MojaPraca
            currentUser={currentUser}
            lokale={availableLokaleForManager}
            stanowiska={activeStanowiska}
            shifts={shifts}
            setShifts={setShifts}
            planShifts={planShifts}
            showMsg={showMsg}
            onEditShift={openEditShift}
            onDopisz={(plan) =>
              setEditingShift({
                id: null,
                user_id: currentUser.id,
                user_name: currentUser.name,
                lokal: plan.lokal,
                stanowisko: plan.stanowisko,
                start_time: new Date(plan.date + "T00:00:00"),
                end_time: null,
              })
            }
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
            zakres={isLocalManager ? "Twoje lokale" : "Cała sieć"}
            showMsg={showMsg}
            users={users}
            setUsers={setUsers}
            lokale={lokale}
            onOpenEmployee={goToEmployeeCard}
            absences={absences}
            setPlanShifts={setPlanShifts}
          />
        )}

        {tab === "skrzynka" && (
          <Skrzynka
            dane={{ ...daneSkrzynki, lokalOk: matchesLokalFilter }}
            key={skrzynkaStart}
            startowaZakladka={skrzynkaStart}
            onResolveAbsence={handleResolveAbsence}
            onResolveIssue={resolveIssue}
            onReplyIssue={odpowiedzNaZgloszenie}
            onCreateTaskFromIssue={handleCreateTaskFromIssue}
            onMarkRead={oznaczPrzeczytane}
            onOpenPuls={goToPuls}
            onGoToApprovals={() => setTab("zatwierdzanie")}
            fallbackLokal={availableLokaleForManager[0]?.name}
            showMsg={showMsg}
          />
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
            absences={absences}
            wybranyLokal={selectedLokal}
            onAddUrlop={handleAddUrlop}
            onDeleteAbsence={handleDeleteAbsence}
            showMsg={showMsg}
          />
        )}

      </div>
    </ManagerShell>
  );
};

export default ManagerDashboard;
