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
  ChevronRight,
  ChevronUp,
  Check,
  BookOpen,
  Thermometer,
} from "lucide-react";
import { api } from "../api/supabase";
import { sendToGoogleSheets, toLocalYMD } from "../api/googleSheets";
import { createManagerNotification } from "../api/notifications";
import { APP_VERSION, PRODUKT } from "../config";
import ShiftroMark from "./ShiftroMark";
import { findOverlappingShift, opisKolidujacej, znajdzKolizjeWBazie, getTodaysShiftsForUser } from "../utils/shifts";
import { zmianaTrwa } from "../utils/porzucone";
import {
  regulyWpisu,
  wymuszonaCalaZmiana,
  dopasujStart,
  dopasujCalaZmiane,
  sprawdzGodzine,
  podpisOkna,
  opisGdzie,
  czekaNaKoniecOdKierownika,
} from "../utils/wpisy";
import WeatherBadge from "./WeatherBadge";
import PulsZmiany, { mozeZamykacPuls } from "./manager/PulsZmiany";
import PulsPrzypomnienie from "./manager/PulsPrzypomnienie";
// Ten sam modal, co w karcie dnia i na ekranie kierownika zmiany — wpisanie
// pomiaru to ta sama czynność i ma wyglądać tak samo wszędzie.
import ModalWpisu from "./manager/ModalWpisu";
import SladPoprawki from "./manager/SladPoprawki";
import { opisPoprawki } from "../utils/dziennik";
import { wartoscPolaTekst } from "../utils/pola";
import {
  getDayOfWeek,
  odmianaZmian, getMonthName,
  getAvailableYears,
  formatNotificationText,
} from "../utils/format";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../utils/stanowiska";
import { podsumowanieMiesiaca } from "../utils/umowy";
import {
  offerSwap,
  withdrawSwap,
  acceptSwap,
  TYPY_WYMIANY,
  typWymiany,
  statusLabelFor,
  kandydaciNaZmiane,
  zmianyDoZamiany,
  wzajemnaZmiana,
  activeSwapFor,
  canOfferSwap,
  hoursUntilStart,
  offersForUser,
  claimedByUser,
  STATUS_LABEL,
  SWAP_MIN_HOURS,
} from "../utils/swaps";
import {
  trimTime,
  mondayOf,
  addDaysYMD,
  shiftHours,
  faktIPlanMiesiaca, publishedShiftsFor,
  publishedShiftsOnDay,
  nextShiftFrom,
} from "../utils/grafik";
import {
  buildEmployeeBlocks,
  pracujeTegoDnia,
  splaszczBloki,
  getEffectiveAssignmentForDate,
  toggleTaskCompletion,
  zapiszWykonanieZPomiarem,
  poprawPomiarZadania,
  kluczWpisuZadania,
  dniBlokuLabel,
  poraLabel,
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
// `blok` wskazuje klucz z lokale.dostepne_bloki, który włącza tę zakładkę.
// Pulpit i Więcej nie mają bloku — zawsze są (Więcej trzyma m.in. wylogowanie).
export const TABS = [
  { key: "PULPIT", label: "Pulpit", Icon: Home },
  { key: "ZMIANA", label: "Zmiana", Icon: Clock, blok: "WPISY" },
  { key: "GRAFIK", label: "Grafik", Icon: CalendarDays, blok: "GRAFIK" },
  { key: "RAPORT", label: "Raport", Icon: FileText, blok: "RAPORT" },
  { key: "ZADANIA", label: "Zadania", Icon: ClipboardCheck, blok: "ZADANIA" },
  { key: "WIECEJ", label: "Więcej", Icon: MoreHorizontal },
];

export const BLOKI_WSZYSTKIE = [
  "WPISY",
  "RAPORT",
  "GRAFIK",
  "ZADANIA",
  "WIADOMOSCI",
  "ZGLOS_PROBLEM",
  "WOLNE",
];

// Godziny w bloku normy: bez zbędnego ",0" przy pełnych liczbach. Wiersze
// pojedynczych zmian zostają przy jednym miejscu po przecinku — tam różnica
// pół godziny naprawdę bywa istotna, w normie miesiąca nie.
const godz = (n) => (Math.round((n || 0) * 10) / 10).toString().replace(".", ",");

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

// Kolory giełdy u pracownika. Żółty = MOJA zmiana czeka na chętnego,
// zielony = CUDZA propozycja, którą mogę wziąć (jedyny stan, w którym jest
// co kliknąć), niebieski = decyzja jest po stronie kierownika. Zielony
// świadomie zarezerwowany dla "możesz działać" — wcześniej oznaczał też
// "ktoś przejął", przez co propozycja zlewała się z własną zmianą.
export const SWAP_TLO = {
  na_gieldzie: "bg-[#FDF3D4]",
  przyjeta: "bg-[#DDEAF6]",
  propozycja: "bg-[#E4F3E0]",
};

export const sumHours = (arr) =>
  arr.reduce(
    (acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );

// Odznaka na wierszu zadania. Pora, dni i adresat stoją w nagłówku bloku, więc
// w wierszu zostaje tylko to, co dotyczy tej jednej pozycji: jej własny cykl.
const taskBadgeLabel = (task) =>
  task.cycle_days ? `co ${task.cycle_days} dni` : null;

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
// Widoczne pole "inna godzina" — tej samej wielkości co duża godzina, którą
// zastępuje, żeby ekran nie skakał przy przełączeniu.
export const poleInnejGodzinyCls =
  "w-full p-3 border-[2.5px] border-[#171714] rounded bg-white font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums";
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
  grafikBadgeCount = 0,
  bloki = BLOKI_WSZYSTKIE,
  personName = null,
  title,
  showPill = false,
  showBell = true,
  footer = null,
  children,
}) => {
  const activeTabKey = ["WIECEJ", "WIADOMOSCI", "ZGLOS"].includes(screen)
    ? "WIECEJ"
    : screen;
  // Prywatny telefon pokazuje tylko bloki włączone dla lokalu; Tablet
  // Służbowy dostaje pełną listę i nic nie traci (patrz KioskDashboard).
  const widoczneTaby = TABS.filter((t) => !t.blok || bloki.includes(t.blok));
  // ⚠️ DWA układy z jednego drzewa (0.47.0, prośba właściciela): na telefonie
  // wąska kolumna z paskiem zakładek na DOLE; od `md` (768 px — tablet w
  // pionie) pełna szerokość ekranu i zakładki w ciemnym pasku po LEWEJ, jak
  // w panelu kierownika. Pasek jest jednym elementem przestawianym klasami
  // (`order-last md:order-first`), a nie dwoma kopiami — dwie kopie zakładek
  // rozjechałyby się przy pierwszej nowej zakładce albo znaczku.
  const znaczekCls =
    "absolute top-1 right-[18%] md:static md:ml-auto bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[9.5px] md:text-[11px] min-w-[15px] md:min-w-[20px] h-[15px] md:h-5 rounded-[3px] flex items-center justify-center px-0.5 md:px-1.5";
  return (
    <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-md md:max-w-none bg-white h-full flex flex-col md:flex-row shadow-lg md:shadow-none overflow-hidden">
        <nav className="order-last md:order-first flex md:flex-col md:w-60 border-t-[1.5px] md:border-t-0 border-[#B7B6AE] bg-white md:bg-[#3D3C36] flex-shrink-0">
          {/* Znak i nazwa produktu tylko w bocznym pasku — na telefonie
              dolny pasek nie ma na to miejsca, a nagłówek i tak mówi, gdzie
              jesteśmy. */}
          <div className="hidden md:flex items-center gap-2.5 px-5 pt-6 pb-5 border-b border-white/15">
            <ShiftroMark size={26} tone="dark" />
            <span className="font-['Archivo'] font-extrabold text-lg text-white">{PRODUKT}</span>
          </div>
          {widoczneTaby.map(({ key, label, Icon }) => {
            const active = activeTabKey === key;
            return (
              <button
                key={key}
                onClick={() => setScreen(key)}
                className={`flex-1 md:flex-none flex flex-col md:flex-row items-center gap-1 md:gap-3 py-3 pb-3.5 md:py-4 md:px-5 relative border-t-[2.5px] md:border-t-0 md:border-l-[3px] md:w-full md:text-left ${
                  active
                    ? "text-[#DE3A22] border-[#DE3A22] md:text-white md:bg-white/10"
                    : "text-[#8F8E86] border-transparent md:text-[#C9C8C1]"
                }`}
              >
                <Icon size={20} />
                <span className="text-[11px] md:text-[16px] font-semibold md:font-['Archivo'] md:font-bold">
                  {label}
                </span>
                {key === "WIECEJ" && unreadCount > 0 && (
                  <span className={znaczekCls}>{unreadCount}</span>
                )}
                {key === "GRAFIK" && grafikBadgeCount > 0 && (
                  <span className={znaczekCls}>{grafikBadgeCount}</span>
                )}
                {key === "ZADANIA" && taskBadgeCount > 0 && (
                  <span className={znaczekCls}>{taskBadgeCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <header className="px-[18px] md:px-8 pt-[22px] pb-[14px] bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex items-center justify-between gap-2.5 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1 border-2 border-[#B7B6AE] rounded font-['Archivo'] font-bold text-sm px-3 py-2 text-[#171714] flex-shrink-0"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} /> Zmień
                </button>
              )}
              {/* Na wspólnym tablecie tytuł ekranu ("Grafik", "Raport") nie
                  mówi, KTO jest wybrany — imię musi być stale widoczne obok
                  przycisku powrotu. Na Pulpicie tytułem jest już imię, więc
                  nie dublujemy. */}
              {personName && personName !== title && (
                <span className="font-['Archivo'] font-bold text-[15px] text-[#6E6E66] truncate flex-shrink-0">
                  {personName} ·
                </span>
              )}
              <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714] truncate">
                {title}
              </span>
            </div>
            {showPill ? (
              <span className="flex-shrink-0 bg-[#FAEAE6] text-[#8A3A2B] text-[13px] font-semibold px-3.5 py-2 rounded">
                na zmianie
              </span>
            ) : showBell && bloki.includes("WIADOMOSCI") ? (
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
          {/* Na tablecie treść ma szerokość ekranu, ale nie rozlewa się na
              całą: formularz albo przycisk "Rozpocznij zmianę" na 900 px
              szerokości czyta się gorzej niż w kolumnie. Wewnętrzna kolumna
              zostaje `flex-col`, bo ekrany spychają przyciski na dół
              `flex-1`-owym odstępem. */}
          <main className="flex-1 overflow-y-auto px-5 md:px-8 pt-6 pb-5 flex flex-col">
            <div className="flex-1 flex flex-col w-full md:max-w-3xl md:mx-auto">{children}</div>
          </main>
          {footer}
        </div>
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
  // Pełne słowniki — do OPISYWANIA przeszłej zmiany ("Popraw zmianę"), a nie
  // do zaczynania nowej. Tablet Służbowy podaje w lokaleOptions tylko swoje
  // lokale; zmiana, którą pracownik poprawia, mogła się odbyć gdzie indziej.
  lokaleWszystkie,
  stanowiskaWszystkie,
  users = [],
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
  taskBlocks,
  taskCompletions,
  setTaskCompletions,
  dayLogs,
  dayLogEntries,
  setDayLogEntries,
  dayLogTemplates,
  absences,
  setAbsences,
  planShifts,
  shiftSwaps,
  setShiftSwaps,
  bloki = BLOKI_WSZYSTKIE,
  onBack,
  onLogout,
  deviceNote = null,
}) => {
  const [screen, setScreen] = useState("PULPIT");
  const [justClosed, setJustClosed] = useState(false);
  const [now, setNow] = useState(new Date());

  // Lokal startowy MUSI być jednym z tych, które to urządzenie oferuje.
  // Osoba wypożyczona ma default_lokal swojego macierzystego lokalu, a Tablet
  // Służbowy podaje w lokaleOptions tylko własne — wartość spoza listy zostawia
  // <select> bez zaznaczenia, efekt korekty stanowiska czyści stanowisko (bo w
  // tym lokalu nie ma takich stanowisk), i zapis pada na "Wypełnij wymagane
  // pola" mimo że formularz wygląda na kompletny.
  //
  // Kolejność preferencji: lokal z dzisiejszego grafiku (po to ta osoba tu
  // jest), potem jej własny lokal, na końcu pierwszy dostępny.
  const domyslnyLokal = () => {
    const dostepne = (lokaleOptions || []).map((l) => l.name);
    if (!dostepne.length) return "";
    const dzisiaj = toLocalYMD(new Date());
    const zGrafiku = publishedShiftsFor(planShifts, employee)
      .filter((s) => s.date === dzisiaj)
      .map((s) => s.lokal)
      .find((l) => dostepne.includes(l));
    if (zGrafiku) return zGrafiku;
    if (dostepne.includes(employee?.default_lokal)) return employee.default_lokal;
    return dostepne[0];
  };

  const [formLokal, setFormLokal] = useState(domyslnyLokal);
  const [formStanowisko, setFormStanowisko] = useState(
    employee?.default_stanowisko || ""
  );
  const [knowsEnd, setKnowsEnd] = useState(false);
  const [formStartTime, setFormStartTime] = useState(fmtHHMM(new Date()));
  // "Inna godzina" przy odbiciu (0.47.0). null = "teraz", czyli godzina z
  // chwili NACIŚNIĘCIA przycisku, nie otwarcia formularza — tablet potrafi
  // stać na tym ekranie kwadrans, a przy oknie tolerancji lokalu kwadrans
  // starej godziny to różnica między wpisem przyjętym a odesłanym kierownikowi.
  // Tekst "HH:MM" = pracownik świadomie wybrał inną godzinę.
  //
  // Do 0.46.0 start dało się zmienić tylko dotknięciem niewidocznego pola
  // schowanego pod dużą godziną, a przy końcu pole czasu siedziało W ŚRODKU
  // <button> — na iPadzie takie pole często się nie otwiera. Na tablecie
  // wyglądało to tak, jakby innej godziny nie dało się wpisać wcale.
  const [innyStart, setInnyStart] = useState(null);
  const [innyKoniec, setInnyKoniec] = useState(null);
  const [formEndTime, setFormEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  // Reguły wpisu lokalu, w którym zaczyna się zmiana (utils/wpisy.ts) — dla
  // osoby wypożyczonej to lokal, w którym stoi dziś, a nie macierzysty.
  const regulyFormularza = regulyWpisu(lokaleWszystkie, formLokal);
  // Urządzenie z kilkoma lokalami (wspólny tablet w szatni): każda reguła na
  // ekranie mówi, KTÓREGO lokalu dotyczy. Inaczej dwie osoby przy tym samym
  // tablecie widzą dwa różne sposoby wpisu i nie wiadomo, skąd różnica.
  const kilkaLokali = (lokaleOptions || []).length > 1;
  const lokalDoOpisu = (nazwa) => (kilkaLokali ? nazwa : null);
  // Lokal może wymusić sposób wpisu. Wtedy przełącznik "Znam godzinę
  // zakończenia" znika, a stan knowsEnd przestaje cokolwiek znaczyć — dlatego
  // wszędzie niżej czytamy znamKoniec, nie knowsEnd.
  const wymuszonaCala = wymuszonaCalaZmiana(regulyFormularza);
  const znamKoniec = wymuszonaCala ?? knowsEnd;
  // Wpis poza oknem tolerancji lokalu, czekający na decyzję: wysłać do
  // kierownika albo zrezygnować. Kształt: { rodzaj: "start"|"cala"|"koniec",
  // powod: "za_pozno"|"przyszlosc", okno, najwczesniej?, startD?, endD?, shift? }.
  const [pozaOknem, setPozaOknem] = useState(null);

  const [raportMonth, setRaportMonth] = useState(new Date().getMonth());
  const [raportYear, setRaportYear] = useState(new Date().getFullYear());

  // Widok grafiku i PRZESUNIĘCIE względem dziś. Wcześniej były trzy sztywne
  // zakresy (ten tydzień / następny / miesiąc), przez co horyzont pracownika
  // kończył się na 14 dniach — a giełda zmian nie ma żadnej górnej granicy
  // (canOfferSwap pilnuje tylko 12 h przed startem). Zmiany, której nie widać,
  // nie da się wystawić, więc wymiana ruszała dopiero wtedy, gdy było już za
  // późno, żeby znaleźć chętnego.
  const [grafikWidok, setGrafikWidok] = useState("tydzien"); // tydzien | miesiac
  const [tydzienOffset, setTydzienOffset] = useState(0);
  const [miesiacOffset, setMiesiacOffset] = useState(0);
  const [grafikWszyscy, setGrafikWszyscy] = useState(false);
  // Który wpis czeka na potwierdzenie wystawienia na giełdę. Duży przycisk
  // na całą szerokość pod każdą zmianą zjadał ekran, więc domyślnie jest
  // mały link z boku, a pełny przycisk pojawia się dopiero po kliknięciu.
  const [swapConfirmId, setSwapConfirmId] = useState(null);
  // Kreator wymiany: najpierw tryb, potem (dla trybów skierowanych) osoba, a
  // przy zamianie jeszcze jej zmiana. Trzymane osobno od swapConfirmId, żeby
  // zamknięcie kreatora zerowało wszystko jednym setSwapConfirmId(null).
  const [swapTyp, setSwapTyp] = useState(null);
  const [swapTarget, setSwapTarget] = useState(null);
  const [swapWzajemna, setSwapWzajemna] = useState(null);

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
  // Niedostępność bywa zgłaszana na JEDEN dzień znacznie częściej niż na
  // okres, a wpisywanie tej samej daty dwa razy było uciążliwe. Technicznie
  // to nadal jedno pole start/end — dzień po prostu wypełnia oba naraz.
  // Urlop zostaje bez zmian (tam okres to reguła, nie wyjątek).
  const [zgAbsDay, setZgAbsDay] = useState("");
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

  // ⚠️ Zmiana bez odbitego końca NIE trwa w nieskończoność. Po przekroczeniu
  // progu lokalu (utils/porzucone.ts) przestaje być uznawana za trwającą i
  // czeka na decyzję kierownika. Bez tego osoba, która raz zapomniała odbić
  // koniec, nie mogła w ogóle rozpocząć kolejnej zmiany: ekran stał wtedy w
  // trybie "zakończ trwającą zmianę" i innej drogi nie było.
  //
  // Tak samo nie trwa zmiana, o której koniec pracownik poprosił już
  // kierownika (wpis poza oknem tolerancji) — patrz czekaNaKoniecOdKierownika.
  const openShift = shifts.find(
    (s) =>
      s.user_id === employee.id &&
      !czekaNaKoniecOdKierownika(s, issues) &&
      zmianaTrwa({
        shift: s,
        planShifts,
        lokale: lokaleWszystkie,
        users: [employee],
        now,
      })
  );
  const todaysClosedShifts = getTodaysShiftsForUser(shifts, employee.id).filter(
    (s) => s.end_time
  );

  // Pracownik widzi tylko OPUBLIKOWANY grafik — wersja robocza kierownika
  // nie może tu przeciekać (filtruje publishedShiftsFor w utils/grafik.ts).
  const dzisYMD = toLocalYMD(new Date());
  const mojGrafik = publishedShiftsFor(planShifts, employee);
  const mojeDzis = mojGrafik.filter((s) => s.date === dzisYMD);

  // Checklisty zadań na dziś — "own" (własne stanowisko + wszyscy) do A7/A8
  // i domyślnego widoku Zadania, "all" tylko dla przełącznika na ekranie
  // Zadania. Wolno preferujemy otwartą zmianę nad statycznym default_lokal,
  // patrz getEffectiveAssignmentForDate w utils/tasks.ts.
  const todayStr = toLocalYMD(now);
  const effectiveAssignment = getEffectiveAssignmentForDate(
    employee,
    openShift ? [openShift] : todaysClosedShifts
  );
  const daneZadan = {
    tasks,
    blocks: taskBlocks,
    completions: taskCompletions,
    entries: dayLogEntries,
    templates: dayLogTemplates,
  };
  // Zadania dostaje ten, kto dziś pracuje — stoi w grafiku ALBO odbił zmianę.
  // Wcześniej checklistę widział każdy, kto ma ten lokal w karcie, więc w dniu
  // wolnym wyglądało to jak zaległość ("masz 8 niewykonanych zadań").
  const pracujeDzis = pracujeTegoDnia({
    grafikOsoby: mojGrafik,
    shiftsOsoby: openShift ? [openShift] : todaysClosedShifts,
    dateStr: todayStr,
  });
  const opcjeZadan = { pracuje: pracujeDzis };
  const myBlocksOwn = buildEmployeeBlocks(
    daneZadan, effectiveAssignment, todayStr, "own", opcjeZadan
  );
  const myBlocksAll = buildEmployeeBlocks(
    daneZadan, effectiveAssignment, todayStr, "all", opcjeZadan
  );
  const myChecklistOwn = splaszczBloki(myBlocksOwn);
  const taskBadgeCount = myChecklistOwn.filter((i) => !i.done).length;
  // Który blok jest rozwinięty na ekranie Zadania. Kliknięcie bloku na Pulpicie
  // otwiera właśnie ten — pracownik dostaje od razu listę, w którą celował,
  // zamiast szukać jej ponownie w pełnym spisie.
  const [openBlockId, setOpenBlockId] = useState(null);
  const [pomiarZadania, setPomiarZadania] = useState(null); // { item, poprawka }

  const najblizszaZmiana = nextShiftFrom(planShifts, employee, dzisYMD);
  // Propozycje, które mogę wziąć, i zmiany, które już przejąłem/przejęłam,
  // a które czekają na zgodę kierownika (u mnie nie ma ich jeszcze w
  // grafiku, bo właścicielem wiersza wciąż jest autor oferty).
  const mojeOferty = offersForUser({
    swaps: shiftSwaps,
    planShifts,
    absences,
    user: employee,
  });
  const mojePrzejete = claimedByUser({ swaps: shiftSwaps, planShifts, user: employee });

  // Odznaka na zakładce Grafik: propozycje z giełdy + zmiany z grafiku
  // wysłanego po ostatnim wejściu na tę zakładkę. "Ostatnio widziane"
  // trzymamy w localStorage per pracownik (na kiosku urządzenie jest
  // wspólne, więc klucz musi być imienny) — to drobna wygoda widoku, nie
  // dane do raportowania, więc świadomie nie idzie do bazy.
  const grafikSeenKey = `grafik_seen_${employee?.id}`;
  const [grafikSeen, setGrafikSeen] = useState(() => {
    try {
      return localStorage.getItem(grafikSeenKey) || "";
    } catch {
      return "";
    }
  });
  const nowoWyslane = mojGrafik.filter(
    (s) => s.published_at && s.published_at > grafikSeen && s.date >= dzisYMD
  ).length;
  const grafikBadgeCount = mojeOferty.length + nowoWyslane;

  useEffect(() => {
    if (screen !== "GRAFIK") return;
    const najnowsze = mojGrafik
      .map((s) => s.published_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0];
    if (najnowsze && najnowsze !== grafikSeen) {
      try {
        localStorage.setItem(grafikSeenKey, najnowsze);
      } catch {
        // prywatne okno / brak localStorage — odznaka po prostu nie znika
      }
      setGrafikSeen(najnowsze);
    }
  }, [screen, planShifts]);

  // Wpis z grafiku odpowiadający TRWAJĄCEJ zmianie — po nim liczymy, ile
  // zostało do końca. Szukamy po dniu odbicia (a nie po "dziś"), żeby
  // zmiana rozpoczęta przed północą też trafiła na swój wiersz w planie.
  const planTrwajacej = (() => {
    if (!openShift) return null;
    const dzien = toLocalYMD(openShift.start_time);
    const tegoDnia = mojGrafik.filter((s) => s.date === dzien);
    const wLokalu = tegoDnia.filter((s) => s.lokal === openShift.lokal);
    return (
      wLokalu.find((s) => s.stanowisko === openShift.stanowisko) ||
      wLokalu[0] ||
      tegoDnia[0] ||
      null
    );
  })();

  // Planowany koniec jako konkretny moment. end <= start oznacza zmianę
  // przez północ, więc koniec wypada nazajutrz (ta sama konwencja co w
  // utils/grafik.ts).
  const planowanyKoniec = (() => {
    if (!planTrwajacej) return null;
    const [eh, em] = trimTime(planTrwajacej.end_time).split(":").map(Number);
    const [sh, sm] = trimTime(planTrwajacej.start_time).split(":").map(Number);
    if ([eh, em, sh, sm].some((n) => Number.isNaN(n))) return null;
    const d = new Date(planTrwajacej.date + "T00:00:00");
    if (eh * 60 + em <= sh * 60 + sm) d.setDate(d.getDate() + 1);
    d.setHours(eh, em, 0, 0);
    return d;
  })();
  const myWeeklyStats = weeklyChecklistStats(
    daneZadan,
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
  // Urlop liczy się do sumy (8 h za dzień roboczy), ale pracownik ma prawo
  // wiedzieć, ile z tego faktycznie przepracował.
  const raportUrlop = raportShifts
    .filter((s) => s.is_urlop)
    .reduce((acc, s) => acc + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0), 0);

  // Zdanie o miesiącu (norma przy etacie, grafik przy zleceniu) liczy
  // `podsumowanieMiesiaca` w utils/umowy.ts — ten sam kod obsługuje Moją Pracę
  // kierownika, żeby oba ekrany nie mogły powiedzieć czegoś innego o tym samym
  // miesiącu. Rozbicie na fakt i plan robi `faktIPlanMiesiaca`: dzień
  // dzisiejszy należy do planu, także wtedy, gdy zmiana właśnie trwa.
  const raportRozbicie = faktIPlanMiesiaca({
    shifts,
    planShifts,
    user: employee,
    rok: raportYear,
    mies: raportMonth + 1,
  });
  const raportPodsumowanie = podsumowanieMiesiaca({
    user: employee,
    przepracowane: raportRozbicie.fakt,
    zaplanowane: raportRozbicie.plan,
    rok: raportYear,
    mies: raportMonth + 1,
    biezacy: raportRozbicie.biezacy,
  });

  const recentShiftsForZgloszenie = shifts
    .filter((s) => s.user_id === employee.id)
    .sort((a, b) => b.start_time - a.start_time)
    .slice(0, 8);

  // ⚠️ Stanowiska do korekty bierzemy z PEŁNEJ listy i filtrujemy po wybranym
  // lokalu — bez awaryjnego "pokaż wszystkie". Ten fallback pozwalał wpisać
  // zmianie w lokalu B stanowisko z lokalu A: w rejestrze pojawiała się wtedy
  // godzina pod stanowiskiem, którego tamten lokal nie ma i którego ta osoba
  // nawet nie ma przypisanego. Pusta lista jest uczciwsza niż zła podpowiedź.
  const slownikStanowisk = stanowiskaWszystkie || stanowiskaOptions;
  const korektaStanowiska = slownikStanowisk.filter(
    (s) => s.lokal_name === zgPropLokal
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const resetShiftForm = () => {
    setFormLokal(domyslnyLokal());
    setFormStanowisko(employee?.default_stanowisko || "");
    setKnowsEnd(false);
    setFormStartTime(fmtHHMM(new Date()));
    setInnyStart(null);
    setFormEndTime("");
  };

  // ---- korekta stanowiska, gdy zmienia się lokal (jak w TimeEntryForm) ----
  useEffect(() => {
    const dostepne = stanowiskaOptions.filter((s) => s.lokal_name === formLokal);
    if (dostepne.find((s) => s.name === formStanowisko)) return;
    // Osoba wypożyczona ma default_stanowisko ze swojego lokalu, którego tutaj
    // może nie być. Zanim spadniemy na pierwsze z brzegu, pytamy grafiku — to
    // on wie, po co ta osoba dziś tu jest.
    const dzisiaj = toLocalYMD(new Date());
    const zGrafiku = publishedShiftsFor(planShifts, employee).find(
      (s) =>
        s.date === dzisiaj &&
        s.lokal === formLokal &&
        dostepne.some((d) => d.name === s.stanowisko)
    );
    const wlasne = dostepne.find((s) => s.name === employee?.default_stanowisko);
    setFormStanowisko(
      (zGrafiku && zGrafiku.stanowisko) ||
        (wlasne && wlasne.name) ||
        (dostepne.length > 0 ? dostepne[0].name : "")
    );
  }, [formLokal, stanowiskaOptions]);

  // Poprawiana zmiana mogła się odbyć w lokalu, którego to urządzenie nie
  // obsługuje — osoba wypożyczona pracuje z tabletu lokalu B, a w jej historii
  // są zmiany z macierzystego A. Opisujemy przeszłość, nie zaczynamy nowej
  // zmiany, więc bierzemy pełny słownik lokali.
  const lokaleDoKorekty = lokaleWszystkie || lokaleOptions || [];

  // ---- to samo dla propozycji lokalu w formularzu "Popraw zmianę" ----
  // Bez awaryjnego "pokaż wszystkie": stanowisko musi należeć do wybranego
  // lokalu, inaczej korekta tworzy godzinę pod stanowiskiem, którego tam nie ma.
  useEffect(() => {
    if (screen !== "ZGLOS" || zgType !== "correction") return;
    const dostepne = slownikStanowisk.filter((s) => s.lokal_name === zgPropLokal);
    if (!dostepne.find((s) => s.name === zgPropStanowisko)) {
      setZgPropStanowisko(dostepne.length > 0 ? dostepne[0].name : "");
    }
  }, [zgPropLokal, slownikStanowisk, screen, zgType]);

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

  // "Popraw zmianę" wymaga RAPORTU — bez listy swoich zmian pracownik nie
  // widzi, co właściwie poprawia (ustalenie właściciela).
  const dostepneTypyZgloszen = [
    { key: "correction", label: "Popraw zmianę", blok: "RAPORT" },
    { key: "absence", label: "Wolne / urlop", blok: "WOLNE" },
    { key: "problem", label: "Zgłoś problem", blok: "ZGLOS_PROBLEM" },
  ].filter((t) => bloki.includes(t.blok));

  const openZgloszenie = (shiftId) => {
    setZgPrefillShiftId(shiftId || null);
    if (!dostepneTypyZgloszen.some((t) => t.key === zgType)) {
      setZgType(dostepneTypyZgloszen[0]?.key || "problem");
    }
    setScreen("ZGLOS");
  };

  // Skrót z zakładki Grafik — wniosek o wolne mieszka w "Zgłoś", ale
  // najczęściej przychodzi do głowy przy oglądaniu grafiku, nie tam.
  const openWniosekOWolne = () => {
    setZgType("absence");
    setZgSent(false);
    setZgPrefillShiftId(null);
    setScreen("ZGLOS");
  };

  const zamknijKreatorWymiany = () => {
    setSwapConfirmId(null);
    setSwapTyp(null);
    setSwapTarget(null);
    setSwapWzajemna(null);
  };

  const handleOfferSwap = async (planShift, { typ, target, wzajemnaShift } = {}) => {
    try {
      const sw = await offerSwap({
        planShift,
        author: employee,
        typ: typ || "gielda",
        target: target || null,
        wzajemnaShift: wzajemnaShift || null,
      });
      setShiftSwaps([...(shiftSwaps || []), sw]);
      showMsg(
        typ === "zamiana"
          ? `Propozycja zamiany wysłana do: ${target.name}.`
          : typ === "oddanie"
          ? `Zmiana zaproponowana osobie: ${target.name}.`
          : "Zmiana wystawiona na giełdę."
      );
      zamknijKreatorWymiany();
    } catch (err) {
      showMsg(err.message || "Nie udało się wystawić zmiany.", "error");
    }
  };

  const handleWithdrawSwap = async (swap) => {
    try {
      const up = await withdrawSwap(swap);
      setShiftSwaps((shiftSwaps || []).map((x) => (x.id === up.id ? up : x)));
      showMsg("Oferta wycofana.");
    } catch (err) {
      showMsg(err.message || "Nie udało się wycofać.", "error");
    }
  };

  const handleAcceptSwap = async (swap) => {
    const planShift = (planShifts || []).find(
      (s) => String(s.id) === String(swap.grafik_shift_id)
    );
    if (!planShift) return showMsg("Nie znaleziono tej zmiany.", "error");
    try {
      const up = await acceptSwap({
        swap,
        planShift,
        taker: employee,
        planShifts,
        absences,
        wzajemna: wzajemnaZmiana(swap, planShifts),
      });
      setShiftSwaps((shiftSwaps || []).map((x) => (x.id === up.id ? up : x)));
      showMsg("Zgłoszenie wysłane — czeka na zgodę kierownika.");
    } catch (err) {
      showMsg(err.message || "Nie udało się przejąć zmiany.", "error");
    }
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
      // Okno tolerancji lokalu tej ZMIANY (nie lokalu z formularza). "Teraz"
      // przechodzi zawsze, więc sprawdzamy tylko godzinę wybraną ręcznie.
      const okno = regulyWpisu(lokaleWszystkie, openShift.lokal).koniecWstecz;
      const problem = sprawdzGodzine(endD, new Date(), okno);
      if (problem) {
        setSaving(false);
        return setPozaOknem({ rodzaj: "koniec", ...problem, okno, shift: openShift, endD });
      }
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
      setInnyKoniec(null);
      showMsg("Zmiana zakończona pomyślnie!");
      setJustClosed(true);
      setScreen("ZMIANA");
    } catch (err) {
      showMsg("Błąd połączenia z bazą!", "error");
    }
    setSaving(false);
  };

  // Kolizja z już zapisaną zmianą — treść komunikatu albo null. Najpierw
  // lokalnie, potem w BAZIE: lokalna lista bywa nieaktualna — tablet stoi
  // zalogowany tygodniami, a kierownik może wpisywać to samo z panelu. Patrz
  // komentarz przy znajdzKolizjeWBazie.
  const kolizjaZmiany = async (startD, endD) => {
    const overlapping = findOverlappingShift(shifts, employee.id, startD, endD, null);
    if (overlapping) {
      return (
        `Ta zmiana nakłada się na już zapisaną (${opisKolidujacej(overlapping)}). ` +
        'Jeśli to pomyłka, zgłoś się przez zakładkę "Zgłoś".'
      );
    }
    const wBazie = await znajdzKolizjeWBazie({
      userId: employee.id,
      start: startD,
      end: endD,
      excludeId: null,
    });
    if (wBazie) {
      return (
        `Ta zmiana jest już zapisana (${opisKolidujacej(wBazie)}). ` +
        'Jeśli to pomyłka, zgłoś się przez zakładkę "Zgłoś".'
      );
    }
    return null;
  };

  // Zapis nowej zmiany (sam start albo cała). Zwraca zapisany wiersz albo
  // null — komunikat o przyczynie pokazuje sama. `saving` ustawia wołający.
  const zapiszNowaZmiane = async (startD, endD) => {
    const kolizja = await kolizjaZmiany(startD, endD);
    if (kolizja) {
      showMsg(kolizja, "error");
      return null;
    }
    const hrs = endD ? parseFloat(((endD - startD) / 3600000).toFixed(2)) : null;
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
      return parsed;
    } catch (err) {
      showMsg("Błąd zapisu do bazy!", "error");
      return null;
    }
  };

  // ---- utworzenie zmiany: sam start albo pełna zmiana (jak TimeEntryForm.handleCreateShift) ----
  const handleCreateShift = async () => {
    // Sam start: "teraz" liczone w chwili naciśnięcia, chyba że pracownik
    // wybrał inną godzinę. Cała zmiana: obie godziny z pól formularza.
    const startTekst = znamKoniec ? formStartTime : innyStart || fmtHHMM(new Date());
    if (
      !formLokal ||
      !formStanowisko ||
      !startTekst ||
      (znamKoniec && !formEndTime)
    ) {
      return showMsg("Wypełnij wymagane pola!", "error");
    }
    const today = new Date();
    const [sh, sm] = startTekst.split(":").map(Number);
    let startD = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      sh,
      sm
    );
    let endD = null;
    if (znamKoniec) {
      const [eh, em] = formEndTime.split(":").map(Number);
      endD = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        eh,
        em
      );
      if (endD < startD) endD.setDate(endD.getDate() + 1);
    }

    // Okno tolerancji lokalu (utils/wpisy.ts). Bez ustawień (null) nic się tu
    // nie dzieje i godziny idą dokładnie tak jak przed 0.45.0 — także
    // przesunięcie przez północ działa tylko wtedy, gdy okno jest ustawione.
    //
    // Cała zmiana wpisywana jest PO fakcie, więc liczy się okno KOŃCA; sam
    // start — okno STARTU.
    const teraz = new Date();
    const r = regulyFormularza;
    if (znamKoniec && r.koniecWstecz != null) {
      const d = dopasujCalaZmiane(startD, endD, teraz);
      startD = d.startD;
      endD = d.endD;
      const problem = sprawdzGodzine(endD, teraz, r.koniecWstecz);
      if (problem) {
        return setPozaOknem({ rodzaj: "cala", ...problem, okno: r.koniecWstecz, startD, endD });
      }
    } else if (!znamKoniec && r.startWstecz != null) {
      startD = dopasujStart(startD, teraz);
      const problem = sprawdzGodzine(startD, teraz, r.startWstecz);
      if (problem) {
        return setPozaOknem({ rodzaj: "start", ...problem, okno: r.startWstecz, startD });
      }
    }

    setSaving(true);
    const zapisana = await zapiszNowaZmiane(startD, endD);
    if (zapisana) {
      setInnyStart(null);
      showMsg(endD ? "Zmiana zapisana!" : "Rozpoczęto zmianę!");
      if (endD) {
        setJustClosed(true);
        setScreen("ZMIANA");
      }
    }
    setSaving(false);
  };

  // Prośba do kierownika o godzinę, której pracownik nie może już wpisać sam
  // (poza oknem tolerancji lokalu). To ZWYKŁA korekta — ten sam wiersz, który
  // powstaje z "Zgłoś → Popraw zmianę" — więc kierownik rozstrzyga ją w
  // Zatwierdzaniu zmian tym samym kodem (resolveCorrection).
  const wyslijProsbeOGodzine = async ({ shiftId, startD, endD, lokal, stanowisko, opis }) => {
    const issue = await api.post("issues", {
      user_id: employee.id,
      user_name: employee.name,
      issue_text: opis,
      status: "nowe",
      type: "correction",
      is_anonymous: false,
      shift_id: shiftId || null,
      proposed_date: toLocalYMD(startD),
      proposed_lokal: lokal,
      proposed_stanowisko: stanowisko,
      proposed_start_time: fmtHHMM(startD),
      proposed_end_time: endD ? fmtHHMM(endD) : null,
    });
    setIssues([...(issues || []), issue]);
    return issue;
  };

  const potwierdzPozaOknem = async () => {
    const p = pozaOknem;
    if (!p || p.powod !== "za_pozno") return setPozaOknem(null);
    setSaving(true);
    try {
      if (p.rodzaj === "start") {
        // Zmiana zaczyna się TERAZ — człowiek stoi przy tablecie i ma zostać
        // odbity, a wcześniejszą godzinę rozstrzyga kierownik. Zatwierdzenie
        // przestawia start i zostawia koniec (resolveCorrection).
        const teraz = new Date();
        teraz.setSeconds(0, 0);
        const zmiana = await zapiszNowaZmiane(teraz, null);
        if (!zmiana) return;
        try {
          await wyslijProsbeOGodzine({
            shiftId: zmiana.id,
            startD: p.startD,
            endD: null,
            lokal: zmiana.lokal,
            stanowisko: zmiana.stanowisko,
            opis: `Start o ${fmtHHMM(p.startD)} wpisany po czasie (okno lokalu: ${p.okno} min). Zmianę rozpoczęto o ${fmtHHMM(teraz)}.`,
          });
          showMsg(
            `Rozpoczęto zmianę o ${fmtHHMM(teraz)}. Start o ${fmtHHMM(p.startD)} czeka na kierownika.`
          );
        } catch (err) {
          // Zmiana już stoi — nie udawajmy, że nic się nie stało, ale też nie
          // zgłaszajmy, że nie powstała.
          showMsg(
            `Rozpoczęto zmianę o ${fmtHHMM(teraz)}, ale prośby o start ${fmtHHMM(p.startD)} nie udało się wysłać (${err.message || "błąd połączenia"}). Wyślij ją przez Zgłoś → Popraw zmianę.`,
            "error"
          );
        }
      } else if (p.rodzaj === "cala") {
        const kolizja = await kolizjaZmiany(p.startD, p.endD);
        if (kolizja) return showMsg(kolizja, "error");
        await wyslijProsbeOGodzine({
          shiftId: null,
          startD: p.startD,
          endD: p.endD,
          lokal: formLokal,
          stanowisko: formStanowisko,
          opis: `Cała zmiana wpisana po czasie (okno lokalu: ${p.okno} min od zakończenia).`,
        });
        showMsg("Wysłano do kierownika — godziny pojawią się po zatwierdzeniu.");
        resetShiftForm();
      } else if (p.rodzaj === "koniec") {
        await wyslijProsbeOGodzine({
          shiftId: p.shift.id,
          startD: p.shift.start_time,
          endD: p.endD,
          lokal: p.shift.lokal,
          stanowisko: p.shift.stanowisko,
          opis: `Koniec o ${fmtHHMM(p.endD)} wpisany po czasie (okno lokalu: ${p.okno} min).`,
        });
        showMsg("Wysłano do kierownika — zmiana czeka na jego decyzję.");
      }
      setPozaOknem(null);
    } catch (err) {
      showMsg(`Błąd połączenia: ${err.message || "nieznany błąd"}`, "error");
    } finally {
      setSaving(false);
    }
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
    const jedenDzien = zgAbsType === "niedostepnosc" && zgAbsDay;
    const odData = jedenDzien ? zgAbsDay : zgAbsStart;
    const doData = jedenDzien ? zgAbsDay : zgAbsEnd;
    if (!odData || !doData) {
      return showMsg(
        zgAbsType === "niedostepnosc"
          ? "Podaj dzień albo zakres od-do!"
          : "Podaj daty od-do!",
        "error"
      );
    }
    if (doData < odData) {
      return showMsg("Data „do” nie może być wcześniejsza niż „od”.", "error");
    }
    setZgSaving(true);
    try {
      const lokal = employee.default_lokal || lokaleOptions[0]?.name || null;
      const absence = await api.post("absences", {
        user_id: employee.id,
        user_name: employee.name,
        lokal,
        start_date: odData,
        end_date: doData,
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
          } (${odData === doData ? odData : `${odData}–${doData}`}).`,
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

  // ---- odhaczenie zadania i zapis pomiaru — jedyne miejsce w tym pliku ----
  const zapiszWynikZadania = (result) => {
    if (result.removedId) {
      setTaskCompletions((prev) => prev.filter((c) => c.id !== result.removedId));
    } else if (result.created) {
      setTaskCompletions((prev) => [...prev, result.created]);
    }
    if (result.updated) {
      setTaskCompletions((prev) =>
        // Scalamy, nie podmieniamy: patch zwraca pełny wiersz, ale gdyby
        // kiedykolwiek wrócił niepełny, podmiana zgubiłaby task_id i wykonanie
        // po cichu zniknęłoby z checklisty.
        prev.map((c) => (c.id === result.updated.id ? { ...c, ...result.updated } : c))
      );
    }
    // Wpis dziennika trzymamy też lokalnie, żeby wartość pokazała się w wierszu
    // od razu — bez tego pracownik wpisuje temperaturę i widzi pustą pozycję.
    if (result.wpis && typeof setDayLogEntries === "function") {
      setDayLogEntries((prev) => [...(prev || []), result.wpis]);
    }
  };

  const handleToggleTask = async (item) => {
    // Zadanie z polami nie odhacza się jednym kliknięciem — najpierw pomiar.
    if (item.pomiar && !item.done) return setPomiarZadania({ item, poprawka: false });
    try {
      zapiszWynikZadania(
        await toggleTaskCompletion({
          task: item.task,
          dateStr: todayStr,
          existingCompletion: item.completion,
          actorId: employee.id,
          actorName: employee.name,
          shiftId: openShift ? openShift.id : null,
        })
      );
    } catch (err) {
      showMsg(err.message || "Błąd zapisu zadania!", "error");
    }
  };

  const handleZapiszPomiarZadania = async (typ, klucz, wartosci, powod) => {
    const { item, poprawka } = pomiarZadania;
    try {
      if (poprawka) {
        zapiszWynikZadania(
          await poprawPomiarZadania({
            task: item.task,
            completion: item.completion,
            staryWpis: item.wpis,
            payload: wartosci,
            powod,
            actorName: employee.name,
          })
        );
        showMsg("Poprawka zapisana.");
      } else {
        const karta = (dayLogs || []).find(
          (k) => k.lokal === item.task.lokal && k.date === todayStr
        );
        zapiszWynikZadania(
          await zapiszWykonanieZPomiarem({
            task: item.task,
            dateStr: todayStr,
            payload: wartosci,
            dayLogId: karta ? karta.id : null,
            actorId: employee.id,
            actorName: employee.name,
            shiftId: openShift ? openShift.id : null,
          })
        );
      }
      setPomiarZadania(null);
    } catch (err) {
      showMsg(err.message || "Błąd zapisu pomiaru!", "error");
    }
  };

  // ---- checklista zadań — wspólny renderer dla Pulpitu, ekranu Zmiana i
  // zakładki Zadania, żeby nie duplikować JSX w trzech miejscach ----
  const renderTaskChecklist = (list) => (
    <div className="space-y-2">
      {list.map((item) => {
        const termin = (
          item.task.deadline_time ||
          (item.blok && item.blok.deadline_time) ||
          ""
        ).slice(0, 5);
        const odznaka = taskBadgeLabel(item.task);
        return (
          <div
            key={item.task.id}
            className={`${checkboxRowCls(item.done)} ${
              item.done ? "opacity-60" : ""
            } flex-col items-stretch gap-2`}
          >
            <button
              onClick={() => handleToggleTask(item)}
              className="flex items-start gap-3 w-full text-left"
            >
              <span className="w-5 h-5 mt-0.5 border-2 border-[#B7B6AE] rounded-[3px] flex-shrink-0 flex items-center justify-center">
                {item.done && (
                  <span className="w-[9px] h-[9px] bg-[#DE3A22] rounded-[1px]" />
                )}
              </span>
              <span className="flex-1">
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
                  {item.pomiar && (
                    <Thermometer
                      size={13}
                      className="inline ml-1.5 -mt-0.5 text-[#8F8E86]"
                    />
                  )}
                </span>
                {item.task.description && (
                  <span className="block text-[12.5px] text-[#6E6E66] mt-1 whitespace-pre-line">
                    {item.task.description}
                  </span>
                )}
                {item.pomiar && item.wpis && (
                  <span
                    className={`block text-[13px] mt-1 ${
                      item.alarm ? "font-bold text-[#DE3A22]" : "text-[#171714]"
                    }`}
                  >
                    {item.pola
                      .map(
                        (pole) =>
                          `${pole.label}: ${wartoscPolaTekst(pole, item.wpis.payload || {})}`
                      )
                      .join(" · ")}
                    {item.alarm ? " — poza normą" : ""}
                  </span>
                )}

                <span className="block text-[12px] text-[#8F8E86] mt-0.5">
                  {item.done
                    ? `${item.completion?.user_name || "?"}${
                        item.completion?.completed_at
                          ? " · " + fmtHHMM(new Date(item.completion.completed_at))
                          : ""
                      }`
                    : item.pomiar
                    ? termin
                      ? `wpisz pomiar · do ${termin}`
                      : "wpisz pomiar"
                    : termin
                    ? `do ${termin}`
                    : " "}
                </span>
              </span>
              {odznaka && (
                <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded bg-[#E7E7E2] text-[#6E6E66]">
                  {odznaka}
                </span>
              )}
            </button>
            {item.pomiar && item.wpis && (
              <SladPoprawki opis={opisPoprawki(item.wpis, dayLogEntries, item.pola)} />
            )}
            {item.pomiar && item.done && item.wpis && (
              <button
                onClick={() => setPomiarZadania({ item, poprawka: true })}
                className="self-start text-[12.5px] underline text-[#6E6E66]"
              >
                Popraw pomiar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  // Karty bloków. `zwiniete` = same nagłówki z licznikiem (Pulpit: kliknięcie
  // przenosi na ekran Zadania i otwiera ten blok) — pełna lista wszystkich
  // zadań na Pulpicie robiła z niego ścianę tekstu, przez którą nie było widać
  // zmiany ani grafiku.
  const renderBlockCards = (grupy, { zwiniete = false } = {}) => {
    // Bez wyboru rozwijamy pierwszy blok, w którym coś zostało — ekran, na
    // którym trzeba najpierw kliknąć, żeby cokolwiek zobaczyć, wygląda jak
    // pusty.
    const domyslny = (grupy.find((g) => g.zostalo > 0) || grupy[0] || {}).blok;
    return (
    <div className="space-y-3">
      {grupy.map((g) => {
        const otwarty =
          !zwiniete &&
          (openBlockId
            ? openBlockId === g.blok.id
            : !!domyslny && domyslny.id === g.blok.id);
        const dni = dniBlokuLabel(g.blok);
        return (
          <div
            key={g.blok.id}
            className={`border-2 rounded ${
              g.zostalo === 0 ? "border-[#B7B6AE] opacity-70" : "border-[#171714]"
            }`}
          >
            <button
              onClick={() => {
                if (zwiniete) {
                  setOpenBlockId(g.blok.id);
                  setScreen("ZADANIA");
                } else {
                  setOpenBlockId(otwarty ? null : g.blok.id);
                }
              }}
              className="w-full text-left p-3.5 flex items-center gap-3"
            >
              <span className="flex-1">
                <span className="block font-['Archivo'] font-extrabold text-[16px] text-[#171714]">
                  {g.blok.nazwa}
                  {g.pilne && (
                    <span className="ml-2 text-[11px] font-bold text-[#DE3A22]">Ważne</span>
                  )}
                </span>
                <span className="block text-[12px] text-[#8F8E86] mt-0.5">
                  {poraLabel(g.blok.schedule_type)}
                  {dni ? ` · tylko ${dni}` : ""}
                  {g.blok.deadline_time ? ` · do ${g.blok.deadline_time.slice(0, 5)}` : ""}
                  {g.alarm ? " · pomiar poza normą" : ""}
                </span>
              </span>
              <span
                className={`font-['Archivo'] font-extrabold text-[15px] tabular-nums ${
                  g.zostalo === 0 ? "text-[#6E6E66]" : "text-[#171714]"
                }`}
              >
                {g.done}/{g.total}
              </span>
              {zwiniete ? (
                <ChevronRight size={18} className="text-[#8F8E86]" />
              ) : otwarty ? (
                <ChevronUp size={18} className="text-[#8F8E86]" />
              ) : (
                <ChevronDown size={18} className="text-[#8F8E86]" />
              )}
            </button>
            <div className="px-3.5 pb-3">
              <div className="h-2 rounded-full bg-[#E7E7E2] overflow-hidden">
                <div
                  className="h-full bg-[#DE3A22]"
                  style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            {otwarty && <div className="px-3.5 pb-3.5">{renderTaskChecklist(g.items)}</div>}
          </div>
        );
      })}
      {pomiarZadania && (
        <ModalWpisu
          szablon={{
            nazwa: pomiarZadania.item.task.title,
            typ: pomiarZadania.item.task.typ || "inne",
            klucz: kluczWpisuZadania(pomiarZadania.item.task),
            pola: pomiarZadania.item.pola,
          }}
          wartosciStartowe={
            pomiarZadania.poprawka && pomiarZadania.item.wpis
              ? { ...(pomiarZadania.item.wpis.payload || {}) }
              : null
          }
          powodWymagany={pomiarZadania.poprawka}
          onClose={() => setPomiarZadania(null)}
          onSave={handleZapiszPomiarZadania}
        />
      )}
    </div>
    );
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
        {/* Zmiana z poprzedniego dnia wygląda na ekranie dokładnie tak samo
            jak dzisiejsza — widać tylko godzinę startu. Człowiek, który
            zapomniał odbić koniec, dowiadywał się o tym dopiero od kierownika,
            kilka dni później. Tutaj dowiaduje się od razu i może to poprawić
            sam, podając właściwą godzinę. */}
        {toLocalYMD(startDate) !== toLocalYMD(now) && (
          <div className="mt-2.5 rounded p-3 border-2 border-[#DE3A22] bg-[#FBEAE6]">
            <div className="font-['Archivo'] font-extrabold text-[15px] text-[#8A3A2B]">
              Ta zmiana trwa od {opisDnia(toLocalYMD(startDate))}
            </div>
            <div className="text-[13px] text-[#6E6E66] mt-0.5">
              Jeśli już ją skończyłeś(-aś), zakończ ją poniżej i podaj godzinę, o
              której naprawdę wyszedłeś(-aś). Bez tego te godziny nie policzą
              się nikomu.
            </div>
          </div>
        )}
        {planowanyKoniec &&
          bloki.includes("GRAFIK") &&
          (() => {
            const zostaloMs = planowanyKoniec - now;
            const po = zostaloMs < 0;
            const absMs = Math.abs(zostaloMs);
            const h = Math.floor(absMs / 3600000);
            const m = Math.floor((absMs % 3600000) / 60000);
            return (
              <div
                className={`mt-2.5 rounded p-3 border-2 ${
                  po
                    ? "border-[#DE3A22] bg-[#FBEAE6]"
                    : "border-[#B7B6AE] bg-[#F1F1EE]"
                }`}
              >
                <div className={sectionLabelCls}>
                  {po ? "Po planowanym końcu" : "Do końca zmiany"}
                </div>
                <div
                  className={`font-['Archivo'] font-extrabold text-[22px] tabular-nums ${
                    po ? "text-[#8A3A2B]" : "text-[#171714]"
                  }`}
                >
                  {h} godz. {m} min
                </div>
                <div className="text-[13px] text-[#6E6E66]">
                  Wg grafiku {trimTime(planTrwajacej.start_time)} –{" "}
                  {trimTime(planTrwajacej.end_time)}
                </div>
              </div>
            );
          })()}
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
            <div className="mt-3">{renderBlockCards(myBlocksOwn)}</div>
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
        {/* Wyłączone "Wpisy" zabierają całą obsługę zmiany, także jej
            zakończenie — inaczej pracownik mógłby zamknąć zmianę z telefonu
            mimo że lokal tego nie udostępnia. Zmianę kończy wtedy na
            Tablecie Służbowym. */}
        {bloki.includes("WPISY") ? (
          <>
            {innyKoniec === null ? (
              <>
                <button
                  onClick={() => handleCloseShift(null)}
                  disabled={saving}
                  className={ctaPrimaryCls}
                >
                  Zakończ zmianę o {fmtHHMM(now)}
                </button>
                <button
                  type="button"
                  onClick={() => setInnyKoniec(fmtHHMM(now))}
                  className={ctaSecondaryCls}
                >
                  Wybierz inną godzinę
                </button>
              </>
            ) : (
              <>
                {/* Widoczne pole zamiast zamykania zmiany przy pierwszym
                    ruchu kółka: na iPadzie zdarzenie zmiany potrafi przyjść w
                    trakcie przewijania, a stara wersja od razu zapisywała. */}
                <span className={fieldLabelCls}>Godzina zakończenia</span>
                <input
                  type="time"
                  value={innyKoniec}
                  onChange={(e) => setInnyKoniec(e.target.value)}
                  className={poleInnejGodzinyCls}
                />
                <button
                  onClick={() => handleCloseShift(innyKoniec)}
                  disabled={saving || !innyKoniec}
                  className={`${ctaPrimaryCls} mt-3`}
                >
                  Zakończ zmianę o {innyKoniec || "--:--"}
                </button>
                <button
                  type="button"
                  onClick={() => setInnyKoniec(null)}
                  className={ctaSecondaryCls}
                >
                  Wróć do „teraz”
                </button>
              </>
            )}
            {podpisOkna(
              "koniec",
              regulyWpisu(lokaleWszystkie, openShift.lokal).koniecWstecz,
              lokalDoOpisu(openShift.lokal)
            ) && (
              <p className={`${helperTextCls} mt-2.5`}>
                {podpisOkna(
                  "koniec",
                  regulyWpisu(lokaleWszystkie, openShift.lokal).koniecWstecz,
                  lokalDoOpisu(openShift.lokal)
                )}
              </p>
            )}
          </>
        ) : (
          <p className={helperTextCls}>
            Zmianę kończysz na Tablecie Służbowym w lokalu.
          </p>
        )}
      </>
    );
  };

  const razem = (() => {
    if (!znamKoniec || !formStartTime || !formEndTime) return null;
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
      {/* Lokal może wymusić jeden sposób wpisu (Ustawienia → Lokale →
          Rejestracja godzin). Wtedy przełącznika nie ma — jest zdanie, które
          mówi, jak się tu wpisuje godziny. */}
      {wymuszonaCala === null ? (
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
      ) : (
        <p className={`${helperTextCls} mt-5`}>
          {opisGdzie(lokalDoOpisu(formLokal))}{" "}
          {wymuszonaCala
            ? "wpisujesz całą zmianę naraz — po jej zakończeniu."
            : "odbijasz osobno: start teraz, koniec po pracy."}
        </p>
      )}
      <div className="mt-5">
        <span className={fieldLabelCls}>Rozpoczęcie</span>
        {znamKoniec ? (
          <div className={timeHeroCls}>
            <div className="flex items-center gap-2.5">
              <Clock size={20} className="text-[#171714]" />
              <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
                {formStartTime}
              </span>
            </div>
            <input
              type="time"
              value={formStartTime}
              onChange={(e) => setFormStartTime(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </div>
        ) : innyStart === null ? (
          <div className={timeHeroCls}>
            <div className="flex items-center gap-2.5">
              <Clock size={20} className="text-[#171714]" />
              <span className="font-['Archivo'] font-extrabold text-[30px] text-[#171714] tabular-nums">
                {fmtHHMM(now)}
              </span>
            </div>
            <span className="text-[13px] text-[#8F8E86]">teraz</span>
          </div>
        ) : (
          <input
            type="time"
            value={innyStart}
            onChange={(e) => setInnyStart(e.target.value)}
            className={poleInnejGodzinyCls}
          />
        )}
      </div>
      {znamKoniec && (
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
      {znamKoniec && razem && (
        <div className={`${razemRowCls} mt-5`}>
          <span className="text-sm text-[#6E6E66]">Razem</span>
          <span className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] tabular-nums">
            {razem} godz.
          </span>
        </div>
      )}
      {!znamKoniec && (
        <p className={`${helperTextCls} mt-5`}>
          Zapiszemy tylko start. Zmianę zakończysz przy następnym wejściu.
        </p>
      )}
      {podpisOkna(
        znamKoniec ? "cala" : "start",
        znamKoniec ? regulyFormularza.koniecWstecz : regulyFormularza.startWstecz,
        lokalDoOpisu(formLokal)
      ) && (
        <p className={`${helperTextCls} mt-2`}>
          {podpisOkna(
            znamKoniec ? "cala" : "start",
            znamKoniec ? regulyFormularza.koniecWstecz : regulyFormularza.startWstecz,
            lokalDoOpisu(formLokal)
          )}
        </p>
      )}
      <div className="flex-1" />
      <button
        onClick={() => handleCreateShift()}
        disabled={saving || (!znamKoniec && innyStart === "")}
        className={ctaPrimaryCls}
      >
        {znamKoniec
          ? "Zapisz całą zmianę"
          : `Rozpocznij zmianę o ${innyStart || fmtHHMM(now)}`}
      </button>
      {/* Ten sam przycisk co przy zakończeniu zmiany — inna godzina ma być
          widoczna jako przycisk, a nie ukryta pod dotknięciem godziny. */}
      {!znamKoniec && (
        <button
          type="button"
          onClick={() => setInnyStart(innyStart === null ? fmtHHMM(now) : null)}
          className={ctaSecondaryCls}
        >
          {innyStart === null ? "Wybierz inną godzinę" : "Wróć do „teraz”"}
        </button>
      )}
    </>
  );

  // Wpis poza oknem tolerancji lokalu — wyjaśnienie i jedyna droga dalej:
  // wysłać godzinę kierownikowi. Nic nie przepada, zmienia się tylko to, kto
  // tę godzinę zatwierdza.
  const renderPozaOknem = () => {
    const p = pozaOknem;
    if (!p) return null;
    let tytul;
    let tresc;
    if (p.powod === "przyszlosc") {
      tytul = "Tej godziny jeszcze nie było";
      tresc =
        p.rodzaj === "start"
          ? "Zmianę rozpoczniesz, gdy zaczniesz pracę — nie z wyprzedzeniem."
          : "Koniec zapiszesz, gdy zmiana się skończy.";
    } else {
      tytul = "Za późno na samodzielny wpis";
      const godzina = fmtHHMM(p.rodzaj === "start" ? p.startD : p.endD);
      tresc =
        p.rodzaj === "start"
          ? `${opisGdzie(lokalDoOpisu(formLokal))} start możesz sam cofnąć najwyżej o ${p.okno} min (najwcześniej ${fmtHHMM(p.najwczesniej)}). Rozpoczniemy zmianę teraz, a start o ${godzina} wyślemy kierownikowi do zatwierdzenia.`
          : p.rodzaj === "koniec"
          ? `${opisGdzie(lokalDoOpisu(p.shift.lokal))} koniec możesz sam cofnąć najwyżej o ${p.okno} min (najwcześniej ${fmtHHMM(p.najwczesniej)}). Koniec o ${godzina} wyślemy kierownikowi do zatwierdzenia.`
          : `${opisGdzie(lokalDoOpisu(formLokal))} całą zmianę zapisujesz sam najpóźniej ${p.okno} min po jej zakończeniu. Zmianę ${fmtHHMM(p.startD)}–${godzina} wyślemy kierownikowi do zatwierdzenia.`;
    }
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg border-[2.5px] border-[#171714] w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
          <p className="font-['Archivo'] font-extrabold text-xl text-[#171714]">{tytul}</p>
          <p className={`${helperTextCls} mt-2`}>{tresc}</p>
          {p.powod === "za_pozno" && (
            <button
              onClick={potwierdzPozaOknem}
              disabled={saving}
              className={`${ctaPrimaryCls} mt-5`}
            >
              {p.rodzaj === "start" ? "Rozpocznij i wyślij do kierownika" : "Wyślij do kierownika"}
            </button>
          )}
          <button onClick={() => setPozaOknem(null)} className={ctaSecondaryCls}>
            {p.powod === "za_pozno" ? "Anuluj" : "Rozumiem"}
          </button>
        </div>
      </div>
    );
  };

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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title={employee.name}
        showPill={!!openShift}
      >
        {/* Stoi nad wszystkim i w obu stanach Pulpitu — zamknięcie dnia jest
            czynnością na koniec zmiany, więc musi być widoczne i wtedy, gdy
            zmiana jeszcze trwa. */}
        <PulsPrzypomnienie
          employee={employee}
          lokal={effectiveAssignment.lokal}
          onOtworz={() => setScreen("PULS")}
        />
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
            {bloki.includes("GRAFIK") && (
              <>
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
              </>
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
                <div className="mt-3">
                  {renderBlockCards(myBlocksOwn, { zwiniete: true })}
                </div>
              </>
            )}
            <div className="flex-1" />
            {bloki.includes("WPISY") && (
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
            )}
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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title={employee.name}
        showPill={!!openShift}
      >
        {openShift
          ? renderShiftInProgress()
          : justClosed
          ? renderJustClosedSummary()
          : renderStartForm()}
        {renderPozaOknem()}
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
    const bazowy = addDaysYMD(mondayOf(dzisYMD), tydzienOffset * 7);
    const dniTygodnia = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysYMD(bazowy, i));
    // Swobodna nawigacja sprawia, że łatwo trafić na tydzień, którego kierownik
    // jeszcze nie wysłał. Bez tego siedem dni z napisem "Wolne" czyta się jak
    // "nie masz zmian", a prawda brzmi "grafiku jeszcze nie ma" — to dwie różne
    // wiadomości i tylko jedna z nich jest prawdziwa.
    const tydzienBezGrafiku = dniTygodnia.every(
      (d) =>
        publishedShiftsOnDay(planShifts, effectiveAssignment.lokal, d).length === 0
    );
    const miesiacData = new Date(
      Number(dzisYMD.slice(0, 4)),
      Number(dzisYMD.slice(5, 7)) - 1 + miesiacOffset,
      1
    );
    const miesiacPrefix = `${miesiacData.getFullYear()}-${String(
      miesiacData.getMonth() + 1
    ).padStart(2, "0")}`;
    // W tył puszczamy do początku poprzedniego miesiąca — dalej to już pytanie
    // do Raportu, nie do grafiku. W przód bez ograniczeń: i tak dalej niż
    // opublikowany grafik nic tam nie ma.
    const granicaWstecz = (() => {
      const d = new Date(Number(dzisYMD.slice(0, 4)), Number(dzisYMD.slice(5, 7)) - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    })();
    const mozeWstecz =
      grafikWidok === "miesiac"
        ? `${miesiacPrefix}-01` > granicaWstecz
        : addDaysYMD(bazowy, -7) >= granicaWstecz;
    const naDzis = grafikWidok === "miesiac" ? miesiacOffset === 0 : tydzienOffset === 0;
    const dd = (ymd) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
    const etykietaZakresu =
      grafikWidok === "miesiac"
        ? `${getMonthName(miesiacData.getMonth())} ${miesiacData.getFullYear()}`
        : `${dd(dniTygodnia[0])} – ${dd(dniTygodnia[6])}`;
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
      const przejeteDnia = mojePrzejete.filter(({ ps }) => ps.date === dateStr);

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
                const oferta = activeSwapFor(shiftSwaps, s.id);
                return (
                  <div
                    key={s.id}
                    className={`border-[2.5px] border-[#171714] rounded p-3.5 ${
                      oferta ? SWAP_TLO[oferta.status] || "" : ""
                    }`}
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
                      {!oferta && canOfferSwap(s) && swapConfirmId !== s.id && (
                        <button
                          onClick={() => setSwapConfirmId(s.id)}
                          className="ml-auto border-2 border-[#B7B6AE] rounded px-2.5 py-1 text-[12px] font-bold text-[#6E6E66]"
                        >
                          na giełdę
                        </button>
                      )}
                      {/* Brak przycisku wygląda jak awaria, jeśli nie wiadomo
                          dlaczego go nie ma — mówimy wprost, że minął limit
                          12 h. Dla zmian już rozpoczętych nic nie piszemy,
                          tam to oczywiste. */}
                      {!oferta &&
                        !canOfferSwap(s) &&
                        hoursUntilStart(s) > 0 && (
                          <span className="ml-auto text-[11px] text-[#8F8E86]">
                            za późno na giełdę
                          </span>
                        )}
                    </div>
                    <div className="text-[13px] text-[#6E6E66] mt-0.5">
                      {s.stanowisko} · {s.lokal}
                      {s.lokal !== employee.default_lokal && (
                        <span className="ml-1.5 text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-[#FAEAE6] text-[#8A3A2B]">
                          INNY LOKAL
                        </span>
                      )}
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
                    {(() => {
                      if (oferta) {
                        return (
                          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-extrabold px-2 py-1 rounded bg-[#E7E7E2] text-[#6E6E66]">
                              {statusLabelFor(oferta)}
                            </span>
                            {oferta.taker_user_name && (
                              <span className="text-[13px] text-[#6E6E66]">
                                przejmuje: {oferta.taker_user_name}
                              </span>
                            )}
                            {oferta.status === "na_gieldzie" && (
                              <button
                                onClick={() => handleWithdrawSwap(oferta)}
                                className="text-[13px] font-bold underline text-[#6E6E66]"
                              >
                                Wycofaj
                              </button>
                            )}
                          </div>
                        );
                      }
                      if (!canOfferSwap(s) || swapConfirmId !== s.id) return null;
                      // Kreator wymiany. Jedna kropka wejścia ("na giełdę"),
                      // a dopiero za nią trzy drogi — wystawić wszystkim,
                      // oddać jednej osobie, zamienić się. Dla pracownika to
                      // ta sama decyzja "nie mogę tego dnia", więc trzy
                      // osobne przyciski w wierszu zmiany byłyby trzema
                      // pytaniami zamiast jednego.
                      const kandydaci = swapTyp
                        ? kandydaciNaZmiane({
                            users,
                            planShifts,
                            absences,
                            planShift: s,
                            author: employee,
                            typ: swapTyp,
                          })
                        : [];
                      const zmianyKandydata =
                        swapTyp === "zamiana" && swapTarget
                          ? zmianyDoZamiany({
                              planShifts,
                              absences,
                              kandydat: swapTarget,
                              author: employee,
                              mojaZmiana: s,
                            })
                          : [];
                      const gotowe =
                        swapTyp === "gielda" ||
                        (swapTyp === "oddanie" && swapTarget) ||
                        (swapTyp === "zamiana" && swapTarget && swapWzajemna);
                      return (
                        <div className="mt-2.5">
                          {!swapTyp && (
                            <div className="space-y-1.5">
                              {TYPY_WYMIANY.map((t) => (
                                <button
                                  key={t.key}
                                  onClick={() => {
                                    setSwapTyp(t.key);
                                    setSwapTarget(null);
                                    setSwapWzajemna(null);
                                  }}
                                  className="w-full border-2 border-[#B7B6AE] rounded p-2.5 text-left"
                                >
                                  <span className="block text-[14px] font-extrabold text-[#171714]">
                                    {t.label}
                                  </span>
                                  <span className="block text-[12px] text-[#6E6E66]">
                                    {t.opis}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                          {swapTyp && swapTyp !== "gielda" && !swapTarget && (
                            <div>
                              <div className={`${sectionLabelCls} mb-1.5`}>
                                {swapTyp === "zamiana" ? "Z kim się zamieniasz" : "Komu oddajesz"}
                              </div>
                              {kandydaci.length === 0 ? (
                                <div className="text-[13px] text-[#8F8E86] italic">
                                  Nikt inny nie może wziąć tej zmiany — brak wolnych
                                  osób z tym stanowiskiem.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {kandydaci.map((u) => (
                                    <button
                                      key={u.id}
                                      onClick={() => setSwapTarget(u)}
                                      className="w-full border-2 border-[#B7B6AE] rounded p-2.5 text-left text-[14px] font-bold"
                                    >
                                      {u.name}
                                      <span className="block text-[12px] font-normal text-[#6E6E66]">
                                        {u.default_stanowisko || ""}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {swapTyp === "zamiana" && swapTarget && !swapWzajemna && (
                            <div>
                              <div className={`${sectionLabelCls} mb-1.5`}>
                                Którą zmianę bierzesz od: {swapTarget.name}
                              </div>
                              {zmianyKandydata.length === 0 ? (
                                <div className="text-[13px] text-[#8F8E86] italic">
                                  {swapTarget.name} nie ma zmiany, którą mógłbyś/mogłabyś
                                  wziąć — albo masz wtedy własną, albo to nie Twoje
                                  stanowisko.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {zmianyKandydata.map((p2) => (
                                    <button
                                      key={p2.id}
                                      onClick={() => setSwapWzajemna(p2)}
                                      className="w-full border-2 border-[#B7B6AE] rounded p-2.5 text-left"
                                    >
                                      <span className="block text-[14px] font-extrabold">
                                        {opisDnia(p2.date)} · {trimTime(p2.start_time)}–
                                        {trimTime(p2.end_time)}
                                      </span>
                                      <span className="block text-[12px] text-[#6E6E66]">
                                        {p2.stanowisko} · {p2.lokal}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {gotowe && (
                            <button
                              onClick={() =>
                                handleOfferSwap(s, {
                                  typ: swapTyp,
                                  target: swapTarget,
                                  wzajemnaShift: swapWzajemna,
                                })
                              }
                              className="w-full border-[2.5px] border-[#171714] rounded py-2.5 text-[14px] font-extrabold mt-2"
                            >
                              {swapTyp === "gielda"
                                ? "Wystaw na giełdę"
                                : swapTyp === "oddanie"
                                ? `Oddaj: ${swapTarget.name}`
                                : `Wyślij propozycję do: ${swapTarget.name}`}
                            </button>
                          )}

                          <button
                            onClick={zamknijKreatorWymiany}
                            className="mt-1.5 text-[13px] font-bold underline text-[#6E6E66]"
                          >
                            Anuluj
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ) : przejeteDnia.length > 0 ? null : wolne ? (
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

          {przejeteDnia.map(({ sw, ps }) => (
            <div
              key={`p-${sw.id}`}
              className={`mt-2.5 border-[2.5px] border-[#171714] rounded p-3.5 ${SWAP_TLO.przyjeta}`}
            >
              <div className="font-['Archivo'] font-extrabold text-[18px]">
                {trimTime(ps.start_time)} – {trimTime(ps.end_time)}
              </div>
              <div className="text-[13px] text-[#6E6E66] mt-0.5">
                {ps.stanowisko} · {ps.lokal} · od: {sw.author_user_name}
              </div>
              <div className="text-[13px] font-bold mt-1.5">
                Zgłosiłeś(-aś) się po tę zmianę — czeka na zgodę kierownika.
              </div>
            </div>
          ))}

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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title="Grafik"
      >
        <div className="flex gap-1.5 mb-2">
          {[
            { key: "tydzien", label: "Tydzień" },
            { key: "miesiac", label: "Miesiąc" },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setGrafikWidok(o.key)}
              className={`flex-1 py-2 rounded border-2 text-[13px] font-bold ${
                grafikWidok === o.key
                  ? "bg-[#171714] text-white border-[#171714]"
                  : "bg-white text-[#171714] border-[#B7B6AE]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {/* Strzałki zamiast sztywnego "ten / następny": bez nich horyzont kończy
            się na 14 dniach, a zmiany, której nie widać, nie da się wystawić na
            giełdę. "Dziś" pokazuje się dopiero, gdy jest po co wracać — jego
            brak sam mówi, że stoisz na bieżącym okresie. */}
        <div className="flex items-center gap-1.5 mb-3">
          <button
            onClick={() =>
              grafikWidok === "miesiac"
                ? setMiesiacOffset((v) => v - 1)
                : setTydzienOffset((v) => v - 1)
            }
            disabled={!mozeWstecz}
            aria-label="Wcześniej"
            className="w-10 h-10 flex-shrink-0 rounded border-2 border-[#B7B6AE] bg-white font-bold text-[#171714] disabled:opacity-35"
          >
            ‹
          </button>
          <span className="flex-1 text-center font-['Archivo'] font-extrabold text-[15px] text-[#171714]">
            {etykietaZakresu}
          </span>
          {!naDzis && (
            <button
              onClick={() => {
                setTydzienOffset(0);
                setMiesiacOffset(0);
              }}
              className="flex-shrink-0 h-10 px-3 rounded border-2 border-[#171714] bg-white text-[13px] font-bold text-[#171714]"
            >
              Dziś
            </button>
          )}
          <button
            onClick={() =>
              grafikWidok === "miesiac"
                ? setMiesiacOffset((v) => v + 1)
                : setTydzienOffset((v) => v + 1)
            }
            aria-label="Później"
            className="w-10 h-10 flex-shrink-0 rounded border-2 border-[#B7B6AE] bg-white font-bold text-[#171714]"
          >
            ›
          </button>
        </div>

        {grafikWidok === "miesiac" ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className={sectionLabelCls}>{etykietaZakresu}</span>
              <span className="font-['Archivo'] font-extrabold text-sm tabular-nums">
                {mojeWMiesiacu.length} {odmianaZmian(mojeWMiesiacu.length)} ·{" "}
                {mojeWMiesiacu
                  .reduce((a, s) => a + shiftHours(s), 0)
                  .toFixed(1)
                  .replace(".", ",")}{" "}
                h
              </span>
            </div>
            <div className={ruleStrongCls} />
            {mojeWMiesiacu.length === 0 ? (
              <div className="text-[15px] text-[#8F8E86] italic mt-4">
                {miesiacPrefix > dzisYMD.slice(0, 7)
                  ? "Kierownik nie wysłał jeszcze grafiku na ten miesiąc."
                  : "Brak zmian w tym miesiącu."}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {mojeWMiesiacu.map((s) => {
                  const minione = s.date < dzisYMD;
                  const dzien = new Date(s.date + "T00:00:00");
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 rounded border-2 px-3.5 py-2.5 ${
                        minione
                          ? "border-[#B7B6AE] text-[#8F8E86]"
                          : "border-[#171714] text-[#171714]"
                      }`}
                    >
                      <span className="w-[64px] flex-shrink-0">
                        <span className="block text-[11px] font-bold uppercase tracking-wider leading-none text-[#8F8E86]">
                          {s.date === dzisYMD ? "dziś" : getDayOfWeek(dzien)}
                        </span>
                        <span className="block font-['Archivo'] font-extrabold text-[15px] leading-tight tabular-nums mt-1">
                          {s.date.slice(8, 10)}.{s.date.slice(5, 7)}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0 text-[14px] tabular-nums">
                        {trimTime(s.start_time)} – {trimTime(s.end_time)}
                        <span className="block text-[12.5px] text-[#6E6E66] truncate">
                          {s.stanowisko} · {s.lokal}
                        </span>
                      </span>
                      <span className="flex-shrink-0 font-['Archivo'] font-extrabold text-[14px] tabular-nums">
                        {shiftHours(s).toFixed(1).replace(".", ",")} h
                      </span>
                    </div>
                  );
                })}
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
            {tydzienBezGrafiku && tydzienOffset > 0 && (
              <div className="mb-3 rounded border-2 border-[#B7B6AE] bg-[#F1F1EE] p-3 text-[13.5px] text-[#6E6E66] leading-relaxed">
                Grafik na ten tydzień nie został jeszcze wysłany. Dni niżej będą
                pokazywać się jako wolne, dopóki kierownik go nie opublikuje.
              </div>
            )}
            {dniTygodnia.map(renderDzien)}
            {mojGrafik.length === 0 && (
              <div className="text-[13.5px] text-[#6E6E66] leading-relaxed">
                Kierownik nie wysłał jeszcze grafiku na ten okres. Gdy to zrobi,
                dostaniesz powiadomienie.
              </div>
            )}

            {mojeOferty.length > 0 && (
              <>
                <div className={sectionLabelCls}>Do wzięcia</div>
                <div className={ruleStrongCls} />
                <div className="mt-3 space-y-2">
                  {mojeOferty.map(({ sw, ps }) => {
                    const typ = typWymiany(sw);
                    const wz = wzajemnaZmiana(sw, planShifts);
                    return (
                      <div
                        key={sw.id}
                        className={`border-[2.5px] border-[#171714] rounded p-3.5 ${SWAP_TLO.propozycja}`}
                      >
                        {typ !== "gielda" && (
                          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#8A3A2B] mb-1">
                            {typ === "zamiana" ? "Propozycja zamiany" : "Oddane Tobie"}
                          </div>
                        )}
                        <div className="font-['Archivo'] font-extrabold text-[16px]">
                          {opisDnia(ps.date)} · {trimTime(ps.start_time)} –{" "}
                          {trimTime(ps.end_time)}
                        </div>
                        <div className="text-[13px] text-[#6E6E66]">
                          {ps.stanowisko} · {ps.lokal} · od: {sw.author_user_name}
                        </div>
                        {/* Przy zamianie druga połowa jest równie ważna co
                            pierwsza — bez niej widać tylko, co się dostaje. */}
                        {typ === "zamiana" && (
                          <div className="text-[13px] mt-1.5 border-t-2 border-[#B7B6AE] pt-1.5">
                            {wz ? (
                              <>
                                <span className="font-bold">Oddajesz swoją: </span>
                                {opisDnia(wz.date)} · {trimTime(wz.start_time)}–
                                {trimTime(wz.end_time)} · {wz.stanowisko}
                              </>
                            ) : (
                              <span className="text-[#8A3A2B] font-bold">
                                Zmiana, którą miałbyś/miałabyś oddać, już nie istnieje.
                              </span>
                            )}
                          </div>
                        )}
                        {sw.note && (
                          <div className="text-[13px] text-[#6E6E66] mt-1">{sw.note}</div>
                        )}
                        <button
                          onClick={() => handleAcceptSwap(sw)}
                          disabled={typ === "zamiana" && !wz}
                          className="mt-2.5 w-full border-[2.5px] border-[#171714] rounded py-2 text-[14px] font-extrabold bg-white disabled:opacity-40"
                        >
                          {typ === "zamiana" ? "Zgadzam się na zamianę" : "Wezmę tę zmianę"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="mt-6">
              <button onClick={openWniosekOWolne} className={menuRowCls}>
                <Flag size={21} className="text-[#171714] flex-shrink-0" />
                <span className="flex-1 text-base font-semibold text-[#171714]">
                  Wniosek o wolne
                </span>
              </button>
              <p className={helperTextCls}>
                Zmianę można wystawić na giełdę najpóźniej {SWAP_MIN_HOURS} godzin
                przed jej rozpoczęciem. Zamianę musi zatwierdzić kierownik.
              </p>
            </div>
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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title="Raport"
        footer={
          <div className="flex-shrink-0 border-t-[2.5px] border-[#171714] bg-white px-5 pt-[18px] pb-[22px] flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span className={sectionLabelCls}>
                {employee.name} · {getMonthName(raportMonth)}
              </span>
              {/* Norma mieszka w stopce, przy sumie godzin, a nie w osobnej
                  ramce — pracownik i tak patrzy tu na jedną liczbę, a dwa
                  miejsca mówiące o tym samym miesiącu zawsze wyglądają, jakby
                  się nie zgadzały. */}
              {raportPodsumowanie.opis && (
                <div className="text-[12px] text-[#6E6E66] leading-snug mt-0.5">
                  {raportPodsumowanie.opis}
                </div>
              )}
              {raportUrlop > 0 && (
                <div className="text-[12px] text-[#6E6E66]">
                  urlop {raportUrlop.toFixed(1).replace(".", ",")} h · bez urlopu{" "}
                  {(raportTotal - raportUrlop).toFixed(1).replace(".", ",")} h
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-['Archivo'] font-extrabold text-[28px] text-[#171714] tabular-nums leading-none">
                {raportTotal.toFixed(1).replace(".", ",")} godz.
              </div>
              {raportPodsumowanie.pod && (
                <div className="text-[12px] text-[#6E6E66] tabular-nums mt-1">
                  {raportPodsumowanie.pod}
                </div>
              )}
            </div>
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
                <span className="font-bold text-[#8A3A2B]">Urlop</span>
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
    const grupyZadan = taskViewMode === "all" ? myBlocksAll : myBlocksOwn;
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
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
        {grupyZadan.length === 0 && (
          <div className="text-center py-10 text-[#8F8E86]">
            <ClipboardCheck className="mx-auto mb-2 opacity-40" size={40} />
            {/* Pusty ekran bez powodu wygląda jak awaria — mówimy wprost,
                czemu nic tu nie ma (ta sama zasada co "za późno na giełdę"). */}
            {pracujeDzis ? (
              "Brak zadań na dziś."
            ) : (
              <>
                Nie masz dziś zmiany w grafiku.
                <span className="block mt-1 text-[13px]">
                  Zadania pokażą się w dniu Twojej zmiany albo zaraz po jej
                  rozpoczęciu.
                </span>
              </>
            )}
          </div>
        )}
        {renderBlockCards(grupyZadan)}
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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title="Więcej"
      >
        {dostepneTypyZgloszen.length > 0 && (
        <button onClick={() => openZgloszenie(null)} className={menuRowCls}>
          <Flag size={21} className="text-[#171714] flex-shrink-0" />
          <span className="flex-1 text-base font-semibold text-[#171714]">
            Zgłoś
          </span>
        </button>
        )}
        {/* Prawo kierownika zmiany (users.puls_do) jest na czas i wygasa samo —
            dlatego wiersz pojawia się i znika bez niczyjej ingerencji. */}
        {mozeZamykacPuls(employee) && (
          <button onClick={() => setScreen("PULS")} className={menuRowCls}>
            <BookOpen size={21} className="text-[#171714] flex-shrink-0" />
            <span className="flex-1 text-base font-semibold text-[#171714]">
              Zamknięcie dnia
            </span>
          </button>
        )}
        {bloki.includes("WIADOMOSCI") && (
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
        )}
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
  if (screen === "PULS") {
    return (
      <Shell
        screen={screen}
        setScreen={setScreen}
        onBack={onBack}
        unreadCount={unreadCount}
        taskBadgeCount={taskBadgeCount}
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title="Zamknięcie dnia"
      >
        <div className="p-3">
          <PulsZmiany
            currentUser={employee}
            lokal={effectiveAssignment.lokal}
            showMsg={showMsg}
            onBack={() => setScreen("WIECEJ")}
          />
        </div>
      </Shell>
    );
  }

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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
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
        grafikBadgeCount={grafikBadgeCount}
        bloki={bloki}
        personName={onBack ? employee.name : null}
        title={
          zgType === "correction"
            ? "Popraw zmianę"
            : zgType === "absence"
            ? "Wniosek o wolne"
            : "Zgłoś problem"
        }
      >
        {!zgSent && (
          <div
            className={`grid gap-2 ${
              dostepneTypyZgloszen.length === 1
                ? "grid-cols-1"
                : dostepneTypyZgloszen.length === 2
                ? "grid-cols-2"
                : "grid-cols-3"
            }`}
          >
            {dostepneTypyZgloszen.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setZgType(t.key)}
                className={checkboxRowCls(zgType === t.key)}
              >
                <span className="text-[13.5px] font-semibold text-[#171714]">
                  {t.label}
                </span>
              </button>
            ))}
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
                    {lokaleDoKorekty.map((l) => (
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
                onClick={() => {
                  setZgAbsType("urlop");
                  setZgAbsDay("");
                }}
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
            {zgAbsType === "niedostepnosc" && (
              <>
                <div className="mt-5">
                  <span className={fieldLabelCls}>Jeden dzień</span>
                  <input
                    type="date"
                    value={zgAbsDay}
                    disabled={!!(zgAbsStart || zgAbsEnd)}
                    onChange={(e) => setZgAbsDay(e.target.value)}
                    className={`${selectElCls} disabled:opacity-40`}
                  />
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <span className="h-px bg-[#B7B6AE] flex-1" />
                  <span className="text-[12px] font-bold uppercase tracking-wider text-[#8F8E86]">
                    albo
                  </span>
                  <span className="h-px bg-[#B7B6AE] flex-1" />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div>
                <span className={fieldLabelCls}>Od</span>
                <input
                  type="date"
                  value={zgAbsStart}
                  disabled={!!zgAbsDay}
                  onChange={(e) => setZgAbsStart(e.target.value)}
                  className={`${selectElCls} disabled:opacity-40`}
                />
              </div>
              <div>
                <span className={fieldLabelCls}>Do</span>
                <input
                  type="date"
                  value={zgAbsEnd}
                  disabled={!!zgAbsDay}
                  onChange={(e) => setZgAbsEnd(e.target.value)}
                  className={`${selectElCls} disabled:opacity-40`}
                />
              </div>
            </div>
            {zgAbsType === "niedostepnosc" && (zgAbsDay || zgAbsStart || zgAbsEnd) && (
              <button
                type="button"
                onClick={() => {
                  setZgAbsDay("");
                  setZgAbsStart("");
                  setZgAbsEnd("");
                }}
                className="mt-2 text-[13px] font-bold underline text-[#6E6E66] self-start"
              >
                Wyczyść daty
              </button>
            )}
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
