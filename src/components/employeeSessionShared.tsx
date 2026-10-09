// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
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
  Palmtree,
  Mail,
  ArrowLeftRight,
  AlertTriangle,
  EyeOff,
  Plus,
  X,
  LogOut,
  Tablet,
  Smartphone,
  Users,
  User,
  Lock,
  MapPin,
  RotateCcw,
  Presentation,
} from "lucide-react";
import { api } from "../api/supabase";
import { sendToGoogleSheets, toLocalYMD } from "../api/googleSheets";
import { dzienKrotki } from "../utils/czas";
import { createManagerNotification } from "../api/notifications";
import { APP_VERSION, PRODUKT } from "../config";
import ShiftroMark from "./ShiftroMark";
import { nowyUuid } from "../utils/uuid";
import { findOverlappingShift, opisKolidujacej, znajdzKolizjeWBazie, znajdzOtwartaDoZakonczenia, getTodaysShiftsForUser } from "../utils/shifts";
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
import { KartaWydarzenia } from "./manager/wydarzeniaWspolne";
import {
  wydarzeniaPracownikaNaDzien,
  wydarzeniaNaDzien,
  jestUczestnikiem,
  wCzasieZmiany,
  calyDzien,
  koniecWydarzenia,
  godzinyTekst,
  minutyWydarzenia,
  etykietaWydarzenia,
  faktIPlanZWydarzeniami,
} from "../utils/wydarzenia";
import PulsPrzypomnienie from "./manager/PulsPrzypomnienie";
// Ten sam modal, co w karcie dnia i na ekranie kierownika zmiany — wpisanie
// pomiaru to ta sama czynność i ma wyglądać tak samo wszędzie.
import ModalWpisu from "./manager/ModalWpisu";
import SladPoprawki from "./manager/SladPoprawki";
import { opisPoprawki } from "../utils/dziennik";
import { wartoscPolaTekst } from "../utils/pola";
import {
  odmianaZmian, getMonthName,
  getAvailableYears,
  formatNotificationText,
} from "../utils/format";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../utils/stanowiska";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../utils/absences";
import { zuzyjCel, CELE_PRACOWNIKA } from "../utils/linki";
import {
  normaMiesiaca,
  naEtacie,
  typUmowy,
  typUmowyLabel,
} from "../utils/umowy";
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

// Duża godzina, którą od razu da się dotknąć i zmienić (0.55.4, prośba
// właściciela). Domyślnie pokazuje "teraz"; dotknięcie otwiera systemowy wybór
// godziny, a przycisk pod spodem mówi "… o XX:XX" i dopiero ON zapisuje.
//
// ⚠️ To jest WIDOCZNE pole <input type="time">, a nie przezroczyste pole
// położone na czymś innym ani pole w środku <button> — oba te warianty na
// iPadzie często się nie otwierały (patrz "Inna godzina" w CLAUDE.md).
// ⚠️ `wartosc === null` znaczy "teraz" liczone w chwili NACIŚNIĘCIA przycisku.
// Na czas wyboru godzina się zamraża: zegar tyka co minutę i podmieniona
// wartość potrafiłaby przestawić kółko iPada w trakcie przewijania.
export function PoleGodziny({ wartosc, teraz = null, onZmiana, etykieta, onTeraz, ...reszta }) {
  const [zamrozona, setZamrozona] = React.useState(null);
  const pokazana = wartosc ?? zamrozona ?? teraz ?? "";
  const naTeraz = teraz != null && wartosc == null;
  // Wygląd z makiety (0.60.0, EmployeeShiftMobile): 76 px wysokości, godzina
  // 44 px, z prawej „teraz” albo „zmień”. Pole zostaje WIDOCZNYM inputem —
  // makieta kładła przezroczyste pole na etykiecie, a tego na iPadzie nie
  // wolno (patrz komentarz wyżej).
  return (
    <div>
      <div className="relative">
        <Clock
          size={26}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#171714] pointer-events-none"
        />
        <input
          type="time"
          value={pokazana}
          onFocus={() => {
            if (wartosc == null && teraz != null) setZamrozona(teraz);
          }}
          onBlur={() => setZamrozona(null)}
          onChange={(e) => onZmiana(e.target.value)}
          aria-label={etykieta}
          className={`block w-full min-w-0 h-[76px] border-[2.5px] border-[#171714] rounded-lg bg-white pl-14 ${
            teraz != null ? "pr-20" : "pr-4"
          } font-['Archivo'] font-extrabold text-[44px] tracking-[-.01em] text-[#171714] tabular-nums cursor-pointer`}
          {...reszta}
        />
        {teraz != null && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#6E6E66] pointer-events-none">
            {naTeraz ? "teraz" : "zmień"}
          </span>
        )}
      </div>
      {teraz != null && (
        <p className="text-[14px] text-[#6E6E66] mt-1.5 mx-0.5">
          {naTeraz ? (
            "Dotknij godziny, żeby wybrać inną."
          ) : (
            <button
              type="button"
              onClick={onTeraz}
              className="font-bold underline underline-offset-[3px] text-[#171714]"
            >
              Wróć do „teraz”
            </button>
          )}
        </p>
      )}
    </div>
  );
}
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

// Wiadomość pracownika → kategoria filtra, ton (kolor koła i plakietka),
// ikona, krótki tytuł i akcja (0.65.0, makieta EmployeeMessages). Typy w
// bazie są ogólne — `swap` to i propozycja, i zatwierdzenie — więc ton i tytuł
// doprecyzowujemy po TREŚCI, którą piszą utils/swaps.ts, corrections.ts,
// absences.ts, odbicia.ts, porzucone.ts i crony. ⚠️ Zmieniając tam zdanie,
// sprawdź dopasowanie tutaj. Nieznana treść spada na ogólny opis — wiadomość
// nigdy nie znika.
// Odmowa z bazy (trigger `pilnuj_okna_wpisu`, migracja 0044) mówi, co zrobić
// — pokazujemy ją zamiast ogólnego „Błąd zapisu”. Zwykle nie zdarza się wcale,
// bo okno sprawdza już formularz; zostaje przypadek zegara urządzenia
// przestawionego o więcej niż 15 min i duplikat (23505, `opisBledu`).
export const bladZapisuZmiany = (err, domyslny) => {
  const t = (err && err.message) || "";
  return /^Poza oknem wpisu|^Ta zmiana jest już zapisana/.test(t) ? t : domyslny;
};

export const opisWiadomosci = (n) => {
  const t = n.message || "";
  const typ = n.type || (n.action ? "edycja" : "");
  const w = (kat, ton, ikona, tytul, akcja = null, plak = null) => ({ kat, ton, ikona, tytul, akcja, plak });
  switch (typ) {
    // Wydarzenia (0.74.0) — zdania z utils/wydarzenia.ts (tekstNowego,
    // tekstZmiany, tekstOdwolania, od 0.75.0 tekstRozliczenia). Plakietka własna: „czas pracy” przy
    // płatnym, „zmiana”, „odwołane”. Te same zdania rozpoznaje
    // api/_lib/wiadomosci.js.
    case "wydarzenie":
      if (/^Wydarzenie odwołane/.test(t)) return w("ev", "no", "wydarzenie", "Wydarzenie odwołane", "grafik", "odwołane");
      if (/^Zmiana w wydarzeniu/.test(t)) return w("ev", "warn", "wydarzenie", "Zmiana w wydarzeniu", "grafik", "zmiana");
      if (/^Godziny z wydarzenia/.test(t)) return w("ev", "ok", "wydarzenie", "Godziny z wydarzenia dopisane", null, "czas pracy");
      return /płatny czas pracy/.test(t)
        ? w("ev", "ok", "wydarzenie", "Nowe wydarzenie", "grafik", "czas pracy")
        : w("ev", "info", "wydarzenie", "Nowe wydarzenie", "grafik");
    case "grafik":
      return /koliduje/.test(t)
        ? w("grafik", "warn", "grafik", "Zmiana koliduje z Twoim wnioskiem", "grafik")
        : w("grafik", "info", "grafik", "Grafik zaktualizowany", "grafik");
    case "swap":
    case "swap_accepted":
      // 0.76.0 — oferta na giełdzie rozesłana do uprawnionych (tekstDoWziecia).
      if (/^Możesz wziąć dodatkową zmianę/.test(t)) return w("gie", "info", "gielda", "Zmiana do wzięcia", "grafik");
      if (/zatwierdził\(a\) zamianę/.test(t)) return w("gie", "ok", "gielda", "Zamiana zatwierdzona", "grafik");
      if (/nie zgodził\(a\) się/.test(t)) return w("gie", "no", "gielda", "Zamiana odrzucona");
      if (/proponuje zamianę|chce oddać Ci/.test(t)) return w("gie", "info", "gielda", "Propozycja dla Ciebie", "grafik");
      if (/zgodził\(a\) się na zamianę/.test(t)) return w("gie", "info", "gielda", "Zgoda na zamianę");
      if (/zgłosił\(a\) się po Twoją/.test(t)) return w("gie", "info", "gielda", "Ktoś chce wziąć Twoją zmianę");
      if (/nieaktualna|wycofał\(a\)/.test(t)) return w("gie", "info", "gielda", "Oferta nieaktualna");
      return w("gie", "info", "gielda", "Giełda zmian");
    case "correction_resolved":
      return /poprawił\(a\)/.test(t)
        ? w("kor", "reply", "odpowiedz", "Kierownik poprawił Twoją korektę")
        : w("kor", "ok", "korekta", "Korekta zatwierdzona");
    case "issue_reply":
      return w("zgl", "reply", "odpowiedz", "Odpowiedź na Twoje zgłoszenie");
    case "correction_query":
      return w("kor", "warn", "odpowiedz", "Kierownik pyta o korektę", "korekta");
    case "absence_resolved":
      if (/odrzucił\(a\)/.test(t)) return w("kor", "no", "wolne", "Wniosek o wolne odrzucony");
      if (/zapisał\(a\) Ci urlop/.test(t)) return w("kor", "ok", "wolne", "Kierownik wpisał Ci urlop");
      if (/zapisał\(a\) Ci dni niedostępności/.test(t)) return w("kor", "info", "wolne", "Kierownik wpisał Ci niedostępność");
      return w("kor", "ok", "wolne", /o urlop/.test(t) ? "Urlop zatwierdzony" : "Wniosek o wolne zatwierdzony");
    case "odbicie":
      return /dopisana/.test(t)
        ? w("kor", "ok", "korekta", "Zmiana dopisana z grafiku")
        : w("kor", "warn", "uwaga", "Brak odbicia", "korekta");
    case "porzucona":
      if (/zapisał\(a\) ją/.test(t)) return w("kor", "ok", "korekta", "Koniec zmiany zapisany");
      if (/odrzucona/.test(t)) return w("kor", "no", "uwaga", "Zmiana bez końca odrzucona", "korekta");
      return w("kor", "warn", "uwaga", "Zmiana bez zakończenia", "korekta");
    case "sanepid":
      return w("inne", "warn", "dokument", "Termin książeczki sanepid");
    case "umowa":
      return w("inne", "warn", "dokument", "Termin umowy");
    case "edycja":
      return w("kor", "info", "korekta", n.action === "delete" ? "Kierownik usunął Twoją zmianę" : "Kierownik zmienił Twoją zmianę");
    default:
      return w("inne", "info", "dokument", "Wiadomość");
  }
};

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
  // Ekrany już przebudowane wg makiety (od 0.58.0: Pulpit) stoją na ciepłym
  // tle z białymi kartami i szerszą kolumną; pozostałe zostają na białym,
  // dopóki nie przyjdzie ich kolej — ich szare pola zlewałyby się z nowym tłem.
  nowyWyglad = false,
  // Imię NAD tytułem na telefonie (Zgłoś, 0.64.0): „Wniosek o wolne” obok
  // imienia i „‹ Zmień” nie mieści się w jednym wierszu.
  imieNadTytulem = false,
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
  // pionie) pełna szerokość ekranu i zakładki w ciemnym pasku po LEWEJ. Pasek
  // jest jednym elementem przestawianym klasami (`order-last md:order-first`),
  // a nie dwoma kopiami — dwie kopie zakładek rozjechałyby się przy pierwszej
  // nowej zakładce albo znaczku.
  //
  // Wygląd z makiety właściciela (0.58.0): na telefonie biały pasek z grubą
  // górną krawędzią i czerwoną kreską nad aktywną zakładką, na tablecie wąska
  // (96 px) ciemna szyna z ikoną nad podpisem.
  const znaczekCls =
    "absolute top-0.5 right-[14%] md:top-1 md:right-4 bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[11px] min-w-[20px] h-5 rounded-full flex items-center justify-center px-1";
  return (
    <div className="h-screen bg-white flex flex-col items-center overflow-hidden">
      <div className="w-full max-w-md md:max-w-none bg-white h-full flex flex-col md:flex-row shadow-lg md:shadow-none overflow-hidden">
        <nav className="order-last md:order-first flex md:flex-col md:w-24 border-t-2 md:border-t-0 border-[#171714] bg-white md:bg-[#393834] md:py-3 md:gap-1 flex-shrink-0">
          {/* Znak tylko w bocznej szynie — na telefonie dolny pasek nie ma
              na to miejsca, a nagłówek i tak mówi, gdzie jesteśmy. */}
          <div className="hidden md:flex justify-center pt-1.5 pb-3.5" title={PRODUKT}>
            <ShiftroMark size={34} tone="dark" />
          </div>
          {widoczneTaby.map(({ key, label, Icon }) => {
            const active = activeTabKey === key;
            return (
              <button
                key={key}
                onClick={() => setScreen(key)}
                className={`flex-1 md:flex-none flex flex-col items-center gap-0.5 md:gap-1 pt-2 pb-3 md:py-2.5 md:px-1 relative md:w-full md:border-l-4 ${
                  key === "WIECEJ" ? "md:mt-auto" : ""
                } ${
                  active
                    ? "text-[#DE3A22] md:text-[#F2F0EA] md:bg-[#4A4944] md:border-[#DE3A22]"
                    : "text-[#6E6E66] md:text-[#C9C6BD] md:border-transparent"
                }`}
              >
                {active && (
                  <span className="md:hidden absolute top-0 left-[18%] right-[18%] h-[3px] rounded-sm bg-[#DE3A22]" />
                )}
                <Icon size={24} />
                <span className="text-[12px] font-bold">{label}</span>
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
        <div className={`flex-1 min-w-0 min-h-0 flex flex-col ${nowyWyglad ? "bg-[#F1F0EC]" : ""}`}>
          <header className="px-3.5 md:px-6 pt-2.5 pb-3 bg-white border-b-2 border-[#171714] flex items-center gap-2.5 flex-shrink-0">
            {/* Na wspólnym tablecie zawsze „‹ Zmień” — powrót do listy osób.
                48 px: z tabletu korzystają też starsze osoby. */}
            {onBack && (
              <button
                onClick={onBack}
                className="h-12 flex items-center gap-1 border-2 border-[#171714] rounded-lg bg-white pl-2.5 pr-4 font-['Archivo'] font-bold text-[17px] text-[#171714] flex-shrink-0"
              >
                <ChevronLeft size={20} strokeWidth={2.5} /> Zmień
              </button>
            )}
            {/* Na wspólnym tablecie tytuł ekranu ("Grafik", "Raport") nie
                mówi, KTO jest wybrany — imię musi być stale widoczne obok
                przycisku powrotu. */}
            <div
              className={`flex-1 min-w-0 flex ${
                imieNadTytulem ? "flex-col md:flex-row md:items-baseline md:gap-2" : "items-baseline gap-2"
              }`}
            >
              {personName && personName !== title && (
                <span
                  className={`font-['Archivo'] font-bold text-[#6E6E66] truncate min-w-0 ${
                    imieNadTytulem ? "text-[15px] leading-[18px] md:text-[20px] md:leading-normal" : "text-[18px] md:text-[20px]"
                  }`}
                >
                  {personName} ·
                </span>
              )}
              <h1
                className={`font-['Archivo'] font-extrabold text-[#171714] ${
                  imieNadTytulem ? "truncate md:flex-none md:overflow-visible" : "flex-none"
                } ${
                  personName
                    ? `${imieNadTytulem ? "leading-[26px] md:leading-normal " : ""}text-[22px] md:text-[24px]`
                    : "text-[24px] md:text-[26px]"
                }`}
              >
                {title}
              </h1>
            </div>
            {showPill ? (
              <span className="flex-shrink-0 inline-flex items-center gap-1.5 h-[34px] md:h-10 px-2.5 md:px-3 rounded-full bg-[#E2F3E9] text-[#1F7A4A] text-[13px] md:text-[14px] font-extrabold whitespace-nowrap">
                <i className="w-2.5 h-2.5 rounded-full bg-[#1F7A4A] shadow-[0_0_0_4px_rgba(42,122,58,.18)]" />
                na zmianie
              </span>
            ) : showBell && bloki.includes("WIADOMOSCI") ? (
              <button
                onClick={() => setScreen("WIADOMOSCI")}
                aria-label="Wiadomości"
                className="relative border-2 border-[#DEDCD4] rounded-lg bg-white w-12 h-12 flex items-center justify-center text-[#171714] flex-shrink-0"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[11px] min-w-[20px] h-5 rounded-full flex items-center justify-center px-1">
                    {unreadCount}
                  </span>
                )}
              </button>
            ) : null}
          </header>
          {/* Stare ekrany: treść w kolumnie do 3xl, bo formularz albo przycisk
              "Rozpocznij zmianę" na 900 px szerokości czyta się gorzej niż w
              kolumnie. Nowe mają własny układ (na tablecie dwie kolumny) i
              potrzebują szerszego miejsca. Wewnętrzna kolumna zostaje
              `flex-col`, bo ekrany spychają przyciski na dół `flex-1`-owym
              odstępem. */}
          <main
            className={`flex-1 overflow-y-auto flex flex-col ${
              // Stałe miejsce na pasek przewijania: bez tego wyśrodkowana treść
              // przesuwała się o jego szerokość, gdy ekran raz się przewija, a raz
              // nie (strzałki okresu w Grafiku skakały między tygodniem a
              // miesiącem, 0.62.2). Tylko od `md`: telefony mają pasek nakładany
              // na treść, a zarezerwowane miejsce zabierałoby wąskiemu wierszowi
              // 15 px.
              nowyWyglad ? "px-3.5 md:px-6 pt-4 pb-6 md:[scrollbar-gutter:stable]" : "px-5 md:px-8 pt-6 pb-5"
            }`}
          >
            <div
              className={`flex-1 flex flex-col w-full md:mx-auto ${
                nowyWyglad ? "md:max-w-[1100px]" : "md:max-w-3xl"
              }`}
            >
              {children}
            </div>
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
// Ostrzeżenie o wylogowaniu w "Więcej" zależy od `onBack` (wspólny tablet
// albo własny telefon) — do 0.65.0 kiosk podawał je propem `deviceNote`.
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
  // Wydarzenia (0.74.0) — karta w Grafiku, przypomnienie na Pulpicie.
  wydarzenia = [],
  wydarzeniaUczestnicy = [],
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

  // ⚠️ Listy formularza startu = to, co oferuje urządzenie, PLUS lokal i
  // stanowisko z DZISIEJSZEGO grafiku tej osoby (0.60.1, zgłoszenie
  // właściciela: Anastazja w grafiku w innym lokalu i na innym stanowisku nie
  // dała się tak zapisać). Tablet podaje tylko swoje lokale i ich stanowiska, a
  // grafik przypisuje stanowisko PO NAZWIE (to samo uprawnienie w każdym
  // lokalu) — więc stanowisko z grafiku potrafi nie istnieć w słowniku lokalu,
  // w którym ta osoba dziś stoi. Domyślnie dalej lokal urządzenia (domyslnyLokal)
  // — fakt ma mówić, gdzie człowiek naprawdę pracował; lokal z grafiku jest do
  // wybrania, gdy urządzenie go nie obsługuje.
  const grafikDzisOsoby = () =>
    publishedShiftsFor(planShifts, employee).filter(
      (s) => s.date === toLocalYMD(new Date())
    );
  const lokaleFormularza = (() => {
    const lista = [...(lokaleOptions || [])];
    grafikDzisOsoby().forEach((g) => {
      if (!g.lokal || lista.some((l) => l.name === g.lokal)) return;
      const wSlowniku = (lokaleWszystkie || []).find((l) => l.name === g.lokal);
      lista.push(wSlowniku || { id: `grafik:${g.lokal}`, name: g.lokal });
    });
    return lista;
  })();
  const stanowiskaDlaLokalu = (lokal) => {
    const zUrzadzenia = (stanowiskaOptions || []).filter((s) => s.lokal_name === lokal);
    // Lokal spoza urządzenia (dołożony z grafiku) — jego stanowiska z pełnego
    // słownika.
    const lista = zUrzadzenia.length
      ? [...zUrzadzenia]
      : (stanowiskaWszystkie || []).filter((s) => s.lokal_name === lokal && !s.archived);
    grafikDzisOsoby()
      .filter((g) => g.lokal === lokal && g.stanowisko)
      .forEach((g) => {
        if (!lista.some((x) => x.name === g.stanowisko))
          lista.push({ id: `grafik:${g.stanowisko}`, name: g.stanowisko });
      });
    return lista;
  };
  // Stanowisko domyślne dla lokalu: z dzisiejszego grafiku w TYM lokalu, potem
  // własne z karty, na końcu pierwsze z listy. Grafik pierwszy, bo wie, po co
  // ta osoba dziś tu jest — także gdy własne stanowisko w tym lokalu istnieje.
  const domyslneStanowisko = (lokal) => {
    const dostepne = stanowiskaDlaLokalu(lokal);
    const zGrafiku = grafikDzisOsoby().find(
      (g) => g.lokal === lokal && dostepne.some((d) => d.name === g.stanowisko)
    );
    if (zGrafiku) return zGrafiku.stanowisko;
    if (dostepne.some((d) => d.name === employee?.default_stanowisko))
      return employee.default_stanowisko;
    return dostepne[0]?.name || "";
  };

  const [formLokal, setFormLokal] = useState(domyslnyLokal);
  const [formStanowisko, setFormStanowisko] = useState(() =>
    domyslneStanowisko(domyslnyLokal())
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
  // Karty zmian z rozwiniętą listą „Z tobą” (po id zmiany) i dzień wybrany w
  // kalendarzu miesiąca (0.62.0).
  const [grafikRozwiniete, setGrafikRozwiniete] = useState({});
  const [grafikDzienMiesiaca, setGrafikDzienMiesiaca] = useState(null);
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
  // Wiadomości nieprzeczytane W CHWILI WEJŚCIA (0.65.0). W bazie oznaczamy je
  // od razu, jak dotąd (znaczek i koperta na liście osób mają zgasnąć), a ta
  // lista trzyma wyróżnienie „nowa” do dotknięcia karty albo „Przeczytane”.
  const [noweWiadomosci, setNoweWiadomosci] = useState([]);
  const [katWiadomosci, setKatWiadomosci] = useState("all");
  // Arkusz „Wylogować?” w Więcej (0.66.0) — wylogowanie tabletu gasi go dla
  // całego lokalu, więc zawsze pytamy drugi raz.
  const [pytanieWyloguj, setPytanieWyloguj] = useState(false);
  const [zgPrefillShiftId, setZgPrefillShiftId] = useState(null);
  // Typ formularza Zgłoś wybrany PRZED wejściem na ekran (skrót „Wniosek o
  // wolne”) — patrz reset przy wejściu na ekran ZGLOS.
  const zgTypNaWejscie = useRef(null);
  // Tekst zgłoszenia wpisany z góry („Nie da się zrobić?” w Zadaniach).
  const zgTekstNaWejscie = useRef(null);

  // Link z e-maila (0.70.0, utils/linki.ts) — tylko na WŁASNYM telefonie.
  // Na wspólnym tablecie (onBack) wybrana osoba nie musi być tą, której
  // przyszedł mail. Ekran spoza bloków lokalu zostaje Pulpitem.
  useEffect(() => {
    if (onBack) return;
    const cel = zuzyjCel(CELE_PRACOWNIKA);
    if (!cel || (cel.blok && !bloki.includes(cel.blok))) return;
    if (cel.zgTyp) {
      zgTypNaWejscie.current = cel.zgTyp;
      setZgPrefillShiftId(null);
    }
    setScreen(cel.screen);
  }, []);

  // ---- "Popraw zmianę" (type: correction) — osobny zestaw pól, patrz handleSendKorekta ----
  // null = jeszcze nie wybrano (lista zmian), uuid zmiany albo "forgot" (od 0.64.0)
  const [zgCorrectionShiftId, setZgCorrectionShiftId] = useState(null);
  const [zgPropDate, setZgPropDate] = useState("");
  const [zgPropLokal, setZgPropLokal] = useState("");
  const [zgPropStanowisko, setZgPropStanowisko] = useState("");
  const [zgPropStart, setZgPropStart] = useState("");
  const [zgPropEnd, setZgPropEnd] = useState("");
  const [zgKorektaNote, setZgKorektaNote] = useState("");
  // Powód jednym dotknięciem (chipy z makiety 0.64.0) — trafia na początek
  // issue_text, bo `issues` nie ma osobnej kolumny na powód.
  const [zgPowod, setZgPowod] = useState(null);
  // Data, lokal i stanowisko poprawianej zmiany są schowane pod linkiem —
  // zwykle poprawia się same godziny, ale pełna korekta zostaje możliwa.
  const [zgKorektaWiecej, setZgKorektaWiecej] = useState(false);
  // Kategoria „Zgłoś problem” — też na początku issue_text.
  const [zgKategoria, setZgKategoria] = useState(null);

  // ---- "Wniosek o wolne" (type: absence) — patrz handleSendAbsence ----
  const [zgAbsType, setZgAbsType] = useState("urlop"); // "urlop" | "niedostepnosc"
  // Zakres wybiera się w kalendarzu: pierwszy dzień, potem ostatni; jeden
  // dzień = dwa razy ten sam (albo tylko pierwszy). `zgAbsMies` to przesunięcie
  // oglądanego miesiąca względem bieżącego.
  const [zgAbsMies, setZgAbsMies] = useState(0);
  const [zgAbsStart, setZgAbsStart] = useState("");
  const [zgAbsEnd, setZgAbsEnd] = useState("");
  const [zgAbsNote, setZgAbsNote] = useState("");

  // "own" = tylko wszyscy + moje stanowisko; "all" = wszystko dla lokalu
  // (przełącznik przydatny głównie na kiosku, gdzie kilka ról dzieli jedno
  // urządzenie) — patrz utils/tasks.ts buildEmployeeChecklist.
  const [taskViewMode, setTaskViewMode] = useState("own");

  const dostepneStanowiska = stanowiskaDlaLokalu(formLokal);

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
  // Ekran Zadania (0.63.0): bloki z rozwiniętym „Zrobione (n)”, zadanie z
  // otwartym „Nie da się zrobić?” i pasek „Zrobione · Cofnij” po odhaczeniu.
  const [zadaniaZrobioneRozwiniete, setZadaniaZrobioneRozwiniete] = useState({});
  const [zadanieNieDaSie, setZadanieNieDaSie] = useState(null);
  const [zadanieCofnij, setZadanieCofnij] = useState(null); // { id, tytul }
  const cofnijTimer = useRef(null);
  useEffect(() => () => clearTimeout(cofnijTimer.current), []);

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

  // Rozbicie miesiąca na fakt i plan robi `faktIPlanMiesiaca` — to samo, z
  // czego Moja Praca kierownika liczy `podsumowanieMiesiaca`, więc prognoza „z
  // grafikiem” jest w obu miejscach ta sama. Dzień dzisiejszy należy do planu,
  // także wtedy, gdy zmiana właśnie trwa. Od 0.61.0 Raport pokazuje liczby
  // (norma, ponad/do normy, z grafikiem) zamiast jednego zdania.
  // Od 0.75.0 plan obejmuje też płatne wydarzenia (`faktIPlanZWydarzeniami`).
  const raportRozbicie = faktIPlanZWydarzeniami({
    shifts,
    planShifts,
    user: employee,
    rok: raportYear,
    mies: raportMonth + 1,
    wydarzenia,
    uczestnicy: wydarzeniaUczestnicy,
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
    setFormStanowisko(domyslneStanowisko(domyslnyLokal()));
    setKnowsEnd(false);
    setFormStartTime(fmtHHMM(new Date()));
    setInnyStart(null);
    setFormEndTime("");
  };

  // ---- korekta stanowiska, gdy zmienia się lokal (jak w TimeEntryForm) ----
  // Osoba wypożyczona ma default_stanowisko ze swojego lokalu, którego tutaj
  // może nie być — wtedy bierzemy domyślne dla lokalu (grafik → własne →
  // pierwsze). Wybór zrobiony ręcznie zostaje, dopóki jest na liście.
  useEffect(() => {
    if (dostepneStanowiska.some((s) => s.name === formStanowisko)) return;
    setFormStanowisko(domyslneStanowisko(formLokal));
  }, [formLokal, stanowiskaOptions, planShifts]);

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
    setNoweWiadomosci(unreadIds);
    setKatWiadomosci("all");
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
      // ⚠️ Wejście z „Wniosek o wolne” (Pulpit, Grafik) ustawia typ z góry —
      // do 0.57.0 ten reset nadpisywał go na „problem” i skrót otwierał zły
      // formularz.
      // Typ spoza bloków lokalu (prywatny telefon) zamieniamy na pierwszy
      // dostępny — inaczej pokazałby się formularz, którego lokal nie włączył.
      const chciany = zgPrefillShiftId ? "correction" : zgTypNaWejscie.current || "problem";
      setZgType(
        dostepneTypyZgloszen.some((t) => t.key === chciany)
          ? chciany
          : dostepneTypyZgloszen[0]?.key || "problem"
      );
      zgTypNaWejscie.current = null;
      setZgShiftId(zgPrefillShiftId || "none");
      setZgAnon(false);
      setZgKategoria(null);
      setZgText(zgTekstNaWejscie.current || "");
      zgTekstNaWejscie.current = null;
      setZgKorektaNote("");
      setZgAbsType(moznaUrlop ? "urlop" : "niedostepnosc");
      setZgAbsMies(0);
      setZgAbsStart("");
      setZgAbsEnd("");
      setZgAbsNote("");
      // Bez chorągiewki z Raportu — najpierw lista zmian do wybrania.
      applyKorektaShiftDefaults(zgPrefillShiftId || null);
    }
  }, [screen]);

  // "Popraw zmianę" wymaga RAPORTU — bez listy swoich zmian pracownik nie
  // widzi, co właściwie poprawia (ustalenie właściciela).
  const dostepneTypyZgloszen = [
    { key: "correction", label: "Popraw zmianę", Icon: Flag, blok: "RAPORT" },
    { key: "absence", label: "Wolne", Icon: Palmtree, blok: "WOLNE" },
    { key: "problem", label: "Zgłoś problem", Icon: AlertTriangle, blok: "ZGLOS_PROBLEM" },
  ].filter((t) => bloki.includes(t.blok));
  // Urlop przysługuje z umowy o pracę (makieta 0.64.0: zlecenie widzi samą
  // niedostępność). Konto bez danych o umowie dostaje oba — brak danych to
  // nie powód, żeby zabrać komuś urlop.
  const moznaUrlop = !["zlecenie", "b2b"].includes(typUmowy(employee));

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
    zgTypNaWejscie.current = "absence";
    setZgType("absence");
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
        users,
        planShifts,
        absences,
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
    setZgPowod(null);
    setZgKorektaWiecej(false);
    if (!shiftId) return;
    if (shiftId === "forgot") {
      setZgPropDate(toLocalYMD(new Date()));
      setZgPropLokal(employee?.default_lokal || lokaleOptions[0]?.name || "");
      setZgPropStanowisko(employee?.default_stanowisko || "");
      setZgPropStart("");
      setZgPropEnd("");
      return;
    }
    // Z całej historii, nie z listy 3 tygodni — chorągiewka w Raporcie
    // prowadzi tu też ze starszych miesięcy.
    const s = shifts.find((sh) => String(sh.id) === String(shiftId));
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
      showMsg(bladZapisuZmiany(err, "Błąd połączenia z bazą!"), "error");
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
      showMsg(bladZapisuZmiany(err, "Błąd zapisu do bazy!"), "error");
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
    }
    const problemCalej =
      znamKoniec && r.koniecWstecz != null ? sprawdzGodzine(endD, teraz, r.koniecWstecz) : null;
    if (problemCalej && problemCalej.powod === "przyszlosc") {
      return setPozaOknem({ rodzaj: "cala", ...problemCalej, okno: r.koniecWstecz, startD, endD });
    }
    // Cała zmiana, której start JUŻ jest zapisany bez końca (porzucona po
    // progu lokalu) — to zakończenie tamtej, nie druga zmiana. Patrz
    // znajdzOtwartaDoZakonczenia w utils/shifts.ts (Natalia, 25.09.2026).
    if (znamKoniec) {
      const otwarta = znajdzOtwartaDoZakonczenia(shifts, employee.id, startD, endD);
      if (otwarta) {
        if (czekaNaKoniecOdKierownika(otwarta, issues)) {
          return showMsg(
            `Zmiana od ${fmtHHMM(otwarta.start_time)} czeka już na kierownika — nie wpisuj jej drugi raz.`,
            "error"
          );
        }
        return setPozaOknem({ rodzaj: "porzucona", powod: "za_pozno", shift: otwarta, startD, endD });
      }
    }
    if (problemCalej) {
      return setPozaOknem({ rodzaj: "cala", ...problemCalej, okno: r.koniecWstecz, startD, endD });
    }
    if (!znamKoniec && r.startWstecz != null) {
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
      } else if (p.rodzaj === "porzucona") {
        await wyslijProsbeOGodzine({
          shiftId: p.shift.id,
          startD: p.startD,
          endD: p.endD,
          lokal: formLokal,
          stanowisko: formStanowisko,
          opis: `Zmiana od ${fmtHHMM(p.shift.start_time)} bez odbitego końca — pracownik wpisał całą zmianę ${fmtHHMM(p.startD)}–${fmtHHMM(p.endD)}.`,
        });
        showMsg(
          `Wysłano do kierownika — dopisze koniec do zmiany od ${fmtHHMM(p.shift.start_time)}.`
        );
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
      // Id nadajemy sami, bo zapis nie oddaje wiersza (dodajBezOdczytu) — a
      // wiersz trzymany lokalnie musi mieć to samo id co w bazie, inaczej
      // poll pokazałby go dwa razy.
      const issue = {
        id: nowyUuid(),
        created_at: new Date().toISOString(),
        user_id: zgAnon ? null : employee.id,
        user_name: zgAnon ? null : employee.name,
        // Kategoria na początku treści — `issues` nie ma na nią kolumny.
        issue_text: zgKategoria ? `${zgKategoria}: ${zgText.trim()}` : zgText.trim(),
        status: "nowe",
        type: "problem",
        is_anonymous: zgAnon,
        // shift_id to uuid (string) w bazie — nie rzutować na liczbę.
        // ⚠️ Anonimowe BEZ zmiany: data i godzina zmiany wskazują osobę.
        shift_id: !zgAnon && zgShiftId && zgShiftId !== "none" ? zgShiftId : null,
      };
      const doBazy = { ...issue };
      delete doBazy.created_at;
      await api.dodajBezOdczytu("issues", doBazy);
      // Lokalnie tylko to, co ta sesja zobaczy też po odświeżeniu: własne
      // zgłoszenie pod imieniem na PRYWATNYM telefonie. Tablet (onBack) nie
      // widzi zgłoszeń problemów swoich ludzi, a anonimowego nie widzi nikt
      // poza kierownikiem — dopisane tu zniknęłyby przy najbliższym pollu.
      if (!zgAnon && !onBack) setIssues([...(issues || []), issue]);
      setZgText("");
      setZgKategoria(null);
      setZgShiftId("none");
      showMsg(zgAnon ? "Wysłano anonimowo." : "Wysłano · kierownik odpowie w Wiadomościach.");
      setZgAnon(false);
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
    const zmiana =
      zgCorrectionShiftId !== "forgot"
        ? shifts.find((sh) => String(sh.id) === String(zgCorrectionShiftId))
        : null;
    if (
      zmiana &&
      zgPropDate === toLocalYMD(zmiana.start_time) &&
      zgPropLokal === zmiana.lokal &&
      zgPropStanowisko === zmiana.stanowisko &&
      zgPropStart === fmtHHMM(zmiana.start_time) &&
      zgPropEnd === (zmiana.end_time ? fmtHHMM(zmiana.end_time) : "")
    ) {
      return showMsg("Nic się nie zmieniło — popraw godzinę, która się nie zgadza.", "error");
    }
    // "Zapomniałem odbić", a start tej pracy JUŻ jest zapisany bez końca —
    // przypinamy prośbę do tamtej zmiany, żeby zatwierdzenie dopisało koniec
    // zamiast zakładać drugą (patrz znajdzOtwartaDoZakonczenia).
    let otwarta = null;
    if (zgCorrectionShiftId === "forgot") {
      const [y, m, d] = zgPropDate.split("-").map(Number);
      const [sh, sm] = zgPropStart.split(":").map(Number);
      const odD = new Date(y, m - 1, d, sh, sm);
      let doD = null;
      if (zgPropEnd) {
        const [eh, em] = zgPropEnd.split(":").map(Number);
        doD = new Date(y, m - 1, d, eh, em);
        if (doD <= odD) doD.setDate(doD.getDate() + 1);
      }
      otwarta = znajdzOtwartaDoZakonczenia(shifts, employee.id, odD, doD);
      if (otwarta && czekaNaKoniecOdKierownika(otwarta, issues)) {
        return showMsg(
          `Zmiana od ${fmtHHMM(otwarta.start_time)} czeka już na kierownika — nie wysyłaj jej drugi raz.`,
          "error"
        );
      }
    }
    setZgSaving(true);
    try {
      const issue = await api.post("issues", {
        user_id: employee.id,
        user_name: employee.name,
        issue_text: [zgPowod, zgKorektaNote.trim()].filter(Boolean).join(" — "),
        status: "nowe",
        type: "correction",
        is_anonymous: false,
        shift_id: otwarta ? otwarta.id : zgCorrectionShiftId !== "forgot" ? zgCorrectionShiftId : null,
        proposed_date: zgPropDate,
        proposed_lokal: zgPropLokal,
        proposed_stanowisko: zgPropStanowisko,
        proposed_start_time: zgPropStart,
        proposed_end_time: zgPropEnd || null,
      });
      setIssues([...issues, issue]);
      setZgKorektaNote("");
      setZgPrefillShiftId(null);
      applyKorektaShiftDefaults(null);
      showMsg(
        otwarta
          ? `Wysłano · kierownik dopisze koniec do zmiany od ${fmtHHMM(otwarta.start_time)}.`
          : "Wysłano · czeka na kierownika."
      );
    } catch (err) {
      showMsg(`Błąd połączenia: ${err.message || "nieznany błąd"}`, "error");
    }
    setZgSaving(false);
  };

  const handleSendAbsence = async () => {
    // Kalendarz trzyma pierwszy i (opcjonalnie) ostatni dzień w kolejności
    // kliknięć — porządkujemy dopiero tutaj.
    const [odData, doData] = [zgAbsStart, zgAbsEnd || zgAbsStart].sort();
    if (!odData) return showMsg("Zaznacz w kalendarzu, których dni dotyczy wniosek.", "error");
    const typWolnego = moznaUrlop ? zgAbsType : "niedostepnosc";
    setZgSaving(true);
    try {
      const lokal = employee.default_lokal || lokaleOptions[0]?.name || null;
      const absence = await api.post("absences", {
        user_id: employee.id,
        user_name: employee.name,
        lokal,
        start_date: odData,
        end_date: doData,
        type: typWolnego,
        status: "pending",
        note: zgAbsNote || null,
        requested_by: "employee",
      });
      setAbsences([...absences, absence]);
      if (lokal) {
        await createManagerNotification(
          lokal,
          `${employee.name} prosi o ${
            typWolnego === "urlop" ? "urlop" : "dni niedostępności"
          } (${odData === doData ? odData : `${odData}–${doData}`}).`,
          "absence_request"
        );
      }
      setZgAbsStart("");
      setZgAbsEnd("");
      setZgAbsNote("");
      showMsg("Wysłano · czeka na kierownika.");
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
      if (!item.done) {
        setZadanieCofnij({ id: item.task.id, tytul: item.task.title });
        clearTimeout(cofnijTimer.current);
        cofnijTimer.current = setTimeout(() => setZadanieCofnij(null), 5000);
      }
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

  // ---- checklista zadań — układ z makiety (0.63.0, EmployeeTasksMobile /
  // EmployeeTasksTablet). Cały wiersz klikalny z polem 34 px, zrobione na dół
  // bloku pod „Zrobione (n)”, swoje zrobione da się cofnąć, cudze — nie. ----
  const mojeWykonanie = (c) =>
    !!c && (String(c.user_id) === String(employee.id) || c.user_name === employee.name);
  const powodyNieDaSie = ["Brak towaru", "Sprzęt nie działa", "Brak czasu", "Inne"];
  const zadanieDoZgloszenia = (item, powod) => {
    zgTypNaWejscie.current = "problem";
    zgTekstNaWejscie.current = `Nie da się zrobić zadania „${item.task.title}”${
      item.blok?.nazwa ? ` (${item.blok.nazwa})` : ""
    }: ${powod.toLowerCase()}.`;
    setZadanieNieDaSie(null);
    setZgPrefillShiftId(null);
    setScreen("ZGLOS");
  };
  const odznaczZadanie = async (item) => {
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
  const renderZadanie = (item) => {
    const c = item.completion;
    const moje = mojeWykonanie(c);
    const punkty = (item.task.description || "")
      .split(/\n+/)
      .map((x) => x.replace(/^[-•·]\s*/, "").trim())
      .filter(Boolean);
    const wartosci =
      item.pomiar && item.wpis
        ? item.pola.map((pole) => `${pole.label}: ${wartoscPolaTekst(pole, item.wpis.payload || {})}`).join(" · ")
        : null;
    if (item.done) {
      return (
        <div key={item.task.id} className="flex items-start gap-3 py-2.5 px-1 border-t border-[#DEDCD4]">
          <span className="w-[34px] h-[34px] flex-shrink-0 rounded-lg bg-[#1F7A4A] text-white flex items-center justify-center">
            <Check size={20} strokeWidth={3} />
          </span>
          <div className="flex-1 min-w-0">
            <b className="block text-[16px] font-semibold text-[#6E6E66] line-through">{item.task.title}</b>
            {wartosci && (
              <span className={`block text-[14px] ${item.alarm ? "font-bold text-[#DE3A22]" : "text-[#171714]"}`}>
                {wartosci}
                {item.alarm ? " — poza normą" : ""}
              </span>
            )}
            <small className="flex flex-wrap items-center gap-1 text-[13px] text-[#6E6E66]">
              {c?.user_name || "?"}
              {c?.completed_at ? ` · ${fmtHHMM(new Date(c.completed_at))}` : ""}
              {/* Cudzego wykonania nie cofa się z tego ekranu — na wspólnym
                  tablecie odhaczyłoby się komuś jego pracę. Kierownik może. */}
              {!moje && !item.pomiar && (
                <span className="inline-flex items-center gap-1">
                  · <Lock size={12} /> tylko {c?.user_name || "ta osoba"} lub kierownik może cofnąć
                </span>
              )}
            </small>
            {item.pomiar && item.wpis && (
              <SladPoprawki opis={opisPoprawki(item.wpis, dayLogEntries, item.pola)} />
            )}
          </div>
          {item.pomiar ? (
            <button
              onClick={() => setPomiarZadania({ item, poprawka: true })}
              className="flex-shrink-0 min-h-[36px] px-3 rounded-lg border-2 border-[#171714] bg-white text-[14px] font-bold text-[#171714]"
            >
              Popraw
            </button>
          ) : (
            moje && (
              <button
                onClick={() => odznaczZadanie(item)}
                className="flex-shrink-0 inline-flex items-center gap-1 min-h-[36px] px-3 rounded-lg border-2 border-[#DEDCD4] bg-white text-[14px] font-bold text-[#171714]"
              >
                <RotateCcw size={14} /> Cofnij
              </button>
            )
          )}
        </div>
      );
    }
    return (
      <div
        key={item.task.id}
        className={`border-t border-[#DEDCD4] ${zadanieNieDaSie === item.task.id ? "bg-[#FDF0D8] -mx-3 px-3" : ""}`}
      >
        <button
          onClick={() => handleToggleTask(item)}
          aria-label={`Zrobione: ${item.task.title}`}
          className="w-full flex items-start gap-3 py-2.5 px-1 text-left"
        >
          <span className="w-[34px] h-[34px] flex-shrink-0 rounded-lg border-[2.5px] border-[#171714] bg-white" />
          <span className="flex-1 min-w-0">
            <b className="flex items-start gap-1 text-[17px] leading-[22px] font-bold text-[#171714]">
              {item.task.priority === "wysoki" && (
                <i
                  title="Ważne"
                  className="not-italic flex-shrink-0 mt-0.5 w-[18px] h-[18px] rounded-full bg-[#DE3A22] text-white text-[12px] font-black flex items-center justify-center"
                >
                  !
                </i>
              )}
              <span>
                {item.task.title}
                {item.pomiar && <Thermometer size={14} className="inline ml-1.5 -mt-0.5 text-[#6E6E66]" />}
              </span>
            </b>
            {punkty.length > 1 ? (
              <ul className="mt-1 space-y-0.5">
                {punkty.map((p) => (
                  <li key={p} className="text-[14px] text-[#6E6E66] pl-3 relative before:content-['•'] before:absolute before:left-0">
                    {p}
                  </li>
                ))}
              </ul>
            ) : punkty.length === 1 ? (
              <span className="block text-[14px] text-[#6E6E66] mt-0.5">{punkty[0]}</span>
            ) : null}
            {item.pomiar && <small className="block text-[13px] font-bold text-[#6E6E66] mt-0.5">wpisz pomiar</small>}
            {/* Własny cykl zadania (pora i dni stoją w nagłówku bloku). */}
            {taskBadgeLabel(item.task) && (
              <small className="inline-block mt-1 text-[12px] font-bold px-1.5 py-0.5 rounded-md bg-[#ECEBE6] text-[#6E6E66]">
                {taskBadgeLabel(item.task)}
              </small>
            )}
          </span>
        </button>
        {bloki.includes("ZGLOS_PROBLEM") && (
          <div className="flex justify-end pb-2 -mt-1">
            <button
              onClick={() => setZadanieNieDaSie(zadanieNieDaSie === item.task.id ? null : item.task.id)}
              className="inline-flex items-center gap-1 text-[13px] font-bold text-[#6E6E66] underline underline-offset-2"
            >
              <AlertTriangle size={13} /> Nie da się zrobić?
            </button>
          </div>
        )}
        {zadanieNieDaSie === item.task.id && (
          <div className="pb-3">
            <b className="block text-[14px] text-[#171714] mb-1.5">Co się stało?</b>
            <div className="flex flex-wrap gap-1.5">
              {powodyNieDaSie.map((p) => (
                <button
                  key={p}
                  onClick={() => zadanieDoZgloszenia(item, p)}
                  className="min-h-[40px] px-3 rounded-full border-2 border-[#171714] bg-white text-[14px] font-bold text-[#171714]"
                >
                  {p}
                </button>
              ))}
            </div>
            <small className="block text-[13px] text-[#6E6E66] mt-1.5">
              Otworzy się Zgłoś problem z tym zadaniem.
            </small>
          </div>
        )}
      </div>
    );
  };

  // Termin bloku (opcjonalny): na godzinę przed — „zostało N min”, po czasie —
  // „po terminie N min” i czerwona ramka bloku.
  const terminBloku = (g) => {
    const t = (g.blok.deadline_time || "").slice(0, 5);
    if (!t) return null;
    if (g.zostalo === 0) return { ton: "ok", tekst: `do ${t}` };
    const [h, m] = t.split(":").map(Number);
    const zostalo = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
    if (zostalo < 0) return { ton: "po", tekst: `po terminie ${czasTrwania(-zostalo * 60000)}` };
    if (zostalo <= 60) return { ton: "wkrotce", tekst: `do ${t} · zostało ${zostalo} min` };
    return { ton: "", tekst: `do ${t}` };
  };

  const renderBlockCards = (grupy, { terazId = null, pokazStanowiska = false } = {}) => {
    // Bez wyboru rozwijamy blok TERAZ albo pierwszy, w którym coś zostało —
    // ekran, na którym trzeba najpierw kliknąć, żeby cokolwiek zobaczyć,
    // wygląda jak pusty. Na tablecie wszystkie bloki są rozwinięte.
    const domyslny = terazId || (grupy.find((g) => g.zostalo > 0) || grupy[0] || {}).blok?.id;
    return (
      <div className="flex flex-col gap-3 md:grid md:grid-cols-3 md:items-start">
        {grupy.map((g) => {
          const otwarty = openBlockId ? openBlockId === g.blok.id : domyslny === g.blok.id;
          const teraz = g.blok.id === terazId;
          const termin = terminBloku(g);
          const doZrobienia = g.items.filter((i) => !i.done);
          const zrobione = g.items.filter((i) => i.done);
          const pokazZrobione = !!zadaniaZrobioneRozwiniete[g.blok.id];
          const stanowiskaBloku = (g.blok.stanowiska || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          return (
            <section
              key={g.blok.id}
              id={`zadania-blok-${g.blok.id}`}
              className={`bg-white rounded-xl border-2 ${
                termin?.ton === "po" ? "border-[#DE3A22]" : "border-[#171714]"
              } ${teraz ? "md:shadow-[0_0_0_2px_#171714]" : ""} ${g.zostalo === 0 ? "opacity-80" : ""}`}
            >
              <button
                onClick={() => setOpenBlockId(otwarty ? "__zaden__" : g.blok.id)}
                className="w-full text-left px-3 pt-3 pb-2 grid grid-cols-[1fr_auto_20px] gap-x-2 items-center"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-[#6E6E66]">
                    {teraz && (
                      <em className="not-italic text-[11px] font-extrabold uppercase text-white bg-[#DE3A22] rounded-[5px] px-1.5 py-px">
                        teraz
                      </em>
                    )}
                    {poraLabel(g.blok.schedule_type)}
                    {dniBlokuLabel(g.blok) ? ` · tylko ${dniBlokuLabel(g.blok)}` : ""}
                    {pokazStanowiska &&
                      stanowiskaBloku.map((st) => (
                        <span
                          key={st}
                          className="text-[11px] font-extrabold px-1.5 py-px rounded-md bg-[#ECEBE6] text-[#171714]"
                          style={stanowiskoBadgeStyle(stanowiskaOptions, g.blok.lokal, st) || {}}
                        >
                          {stanowiskoShort(stanowiskaOptions, g.blok.lokal, st)}
                        </span>
                      ))}
                  </span>
                  <b className="flex items-center gap-1 font-['Archivo'] text-[18px] font-extrabold text-[#171714]">
                    <span className="truncate">{g.blok.nazwa}</span>
                    {g.pilne && (
                      <i
                        title="Ważne"
                        className="not-italic flex-shrink-0 w-[18px] h-[18px] rounded-full bg-[#DE3A22] text-white text-[12px] font-black flex items-center justify-center"
                      >
                        !
                      </i>
                    )}
                  </b>
                  {termin && (
                    <span
                      className={`inline-flex items-center gap-1 mt-0.5 text-[13px] font-bold ${
                        termin.ton === "po"
                          ? "text-white bg-[#DE3A22] rounded-md px-1.5 py-px"
                          : termin.ton === "wkrotce"
                          ? "text-[#8A5300]"
                          : termin.ton === "ok"
                          ? "text-[#1F7A4A]"
                          : "text-[#6E6E66]"
                      }`}
                    >
                      {termin.ton === "po" ? <AlertTriangle size={13} /> : <Clock size={13} />}
                      {termin.tekst}
                    </span>
                  )}
                  {g.alarm && (
                    <span className="block text-[13px] font-bold text-[#DE3A22]">pomiar poza normą</span>
                  )}
                </span>
                <span className="text-[18px] font-extrabold tabular-nums text-[#171714]">
                  {g.done}/{g.total}
                </span>
                <span className="md:hidden text-[#6E6E66]">
                  {otwarty ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </span>
              </button>
              <div className="px-3 pb-2.5">
                <div className="h-2 rounded bg-[#DEDCD4] overflow-hidden">
                  <i
                    className="block h-full bg-[#1F7A4A]"
                    style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className={`px-3 pb-2 ${otwarty ? "" : "hidden md:block"}`}>
                {doZrobienia.map(renderZadanie)}
                {zrobione.length > 0 && (
                  <>
                    <button
                      onClick={() =>
                        setZadaniaZrobioneRozwiniete((p) => ({ ...p, [g.blok.id]: !p[g.blok.id] }))
                      }
                      className="w-full flex items-center gap-1.5 py-2.5 border-t border-[#DEDCD4] text-[14px] font-bold text-[#1F7A4A]"
                    >
                      <Check size={16} strokeWidth={2.5} /> Zrobione ({zrobione.length})
                      <span className="ml-auto text-[#6E6E66]">
                        {pokazZrobione ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </button>
                    {pokazZrobione && zrobione.map(renderZadanie)}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  };
  const renderModalPomiaru = () =>
    pomiarZadania && (
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
    );

  // ---- fragmenty UI wspólne dla kilku ekranów ----
  // ==========================================
  // ZMIANA — układ z makiety właściciela (0.60.0, EmployeeShiftMobile /
  // EmployeeShiftTablet). Zmienił się WYGLĄD; reguły wpisu zostały te z 0.45.0
  // (utils/wpisy.ts): okno liczy się „od teraz wstecz”, a godzina spoza okna
  // idzie do kierownika jako korekta przez okno `renderPozaOknem`.
  // ==========================================
  const lblCls =
    "block text-[13px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66] mx-0.5 mb-1.5";
  const przyciskGlownyCls =
    "w-full min-h-[64px] rounded-lg bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[21px] flex flex-col items-center justify-center px-4 disabled:bg-[#DEDCD4] disabled:text-[#6E6E66]";
  const przyciskDrugiCls =
    "w-full min-h-[48px] rounded-lg bg-white border-2 border-[#171714] text-[#171714] font-['Archivo'] font-extrabold text-[15px] flex items-center justify-center px-4";
  const godzinyH = (ms) => (Math.round((ms / 3600000) * 10) / 10).toString().replace(".", ",");
  const czasTrwania = (ms) => {
    const abs = Math.max(0, Math.abs(ms));
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    return `${h ? `${h} godz. ` : ""}${m} min`;
  };
  // Zamknięta zmiana, o którą pracownik poprosił kierownika (korekta czeka) —
  // na liście „Dziś zapisane” dostaje „czeka” zamiast samej liczby godzin.
  const czekaNaKierownika = (s) =>
    (issues || []).some(
      (i) => i.type === "correction" && i.status !== "rozwiazane" && String(i.shift_id) === String(s.id)
    );
  const renderDzisZapisane = (zawsze = false) => {
    if (!todaysClosedShifts.length && !zawsze) return null;
    return (
      <div className="bg-white border-2 border-[#DEDCD4] rounded-lg px-3 py-2.5 mb-3.5">
        <span className={lblCls}>Dziś zapisane</span>
        {todaysClosedShifts.length === 0 && (
          <p className="text-[15px] text-[#6E6E66] mx-0.5">Jeszcze nic.</p>
        )}
        {todaysClosedShifts.map((s, i) => {
          const czeka = czekaNaKierownika(s);
          return (
            <div
              key={s.id}
              className={`grid grid-cols-[1fr_auto] gap-x-2.5 items-center py-1.5 ${i ? "border-t border-[#DEDCD4]" : ""}`}
            >
              <b className="text-[18px] tabular-nums text-[#171714]">
                {fmtHHMM(s.start_time)} – {fmtHHMM(s.end_time)}
              </b>
              <em
                className={`row-span-2 not-italic text-[14px] font-extrabold px-2 py-1 rounded-lg ${
                  czeka ? "bg-[#FDF0D8] text-[#8A5300]" : "bg-[#E2F3E9] text-[#1F7A4A]"
                }`}
              >
                {godzinyH(s.end_time - s.start_time)} h{czeka ? " · czeka" : ""}
              </em>
              <span className="text-[14px] text-[#6E6E66]">
                {s.lokal} · {s.stanowisko}
              </span>
            </div>
          );
        })}
      </div>
    );
  };
  // Zasady lokalu jednym zdaniem na rodzaj wpisu — te same teksty, które
  // wcześniej stały pod polem godziny (podpisOkna).
  const renderZasady = (lokal) => {
    const r = regulyWpisu(lokaleWszystkie, lokal);
    const zdania = [
      podpisOkna("start", r.startWstecz, lokalDoOpisu(lokal)),
      podpisOkna("koniec", r.koniecWstecz, lokalDoOpisu(lokal)),
    ].filter(Boolean);
    return (
      <div className="bg-[#DEDCD4] rounded-lg px-3 py-2.5">
        <span className={lblCls}>Zasady lokalu</span>
        {zdania.length ? (
          zdania.map((z) => (
            <p key={z} className="text-[14px] leading-5 text-[#171714] mx-0.5">
              {z}
            </p>
          ))
        ) : (
          <p className="text-[14px] leading-5 text-[#171714] mx-0.5">
            Bez ograniczeń — godzinę wpisujesz dowolnie (nie w przyszłości i nie
            na inną zmianę).
          </p>
        )}
      </div>
    );
  };
  // Układ ekranu Zmiana: na telefonie jedna kolumna, przycisk nad dolnym
  // paskiem (stopka Shella); na tablecie formularz po lewej, „Dziś zapisane”
  // i zasady lokalu po prawej, przycisk pod formularzem.
  const ukladZmiany = ({ glowna, bok, przycisk }) => (
    <div className="md:grid md:grid-cols-[minmax(0,600px)_340px] md:gap-7 md:items-start md:justify-center">
      <div className="min-w-0">
        {glowna}
        {przycisk && <div className="hidden md:block mt-2">{przycisk}</div>}
      </div>
      {bok && <aside className="hidden md:flex flex-col gap-3.5 sticky top-0">{bok}</aside>}
    </div>
  );

  const renderShiftInProgress = () => {
    const startDate = openShift.start_time;
    const minelo = Math.max(0, now - startDate);
    const zGrafikiem = planowanyKoniec && bloki.includes("GRAFIK");
    const zostalo = zGrafikiem ? planowanyKoniec - now : null;
    const po = zGrafikiem && zostalo < 0;
    const planStart = zGrafikiem
      ? (() => {
          const d = new Date(planTrwajacej.date + "T00:00:00");
          const [h, m] = trimTime(planTrwajacej.start_time).split(":").map(Number);
          d.setHours(h, m, 0, 0);
          return d;
        })()
      : null;
    const calosc = zGrafikiem ? planowanyKoniec - planStart : 0;
    const procent =
      zGrafikiem && calosc > 0 ? Math.max(0, Math.min(100, ((now - planStart) / calosc) * 100)) : 0;
    // Po czasie: zielona część to cały plan, bursztynowa — nadwyżka (do 40%).
    const nadwyzka = po ? Math.min(40, (-zostalo / calosc) * 100) : 0;
    const granica = po ? 100 / (1 + nadwyzka / 100) : procent;
    const zostaloZadan = myChecklistOwn.filter((i) => !i.done).length;
    return (
      <>
        <section className="pb-3 mb-3.5 border-b-2 border-[#DEDCD4]">
          <span className={lblCls}>Pracujesz od {fmtHHMM(startDate)}</span>
          <b className="block font-['Archivo'] text-[44px] leading-[50px] font-extrabold tabular-nums text-[#171714]">
            {czasTrwania(minelo)}
          </b>
          <span className="text-[16px] text-[#6E6E66]">
            {openShift.lokal} · {openShift.stanowisko}
          </span>
          {/* Zmiana z poprzedniego dnia wygląda na ekranie dokładnie tak samo
              jak dzisiejsza — widać tylko godzinę startu. Człowiek, który
              zapomniał odbić koniec, dowiadywał się o tym dopiero od kierownika,
              kilka dni później. Tutaj dowiaduje się od razu i może to poprawić
              sam, podając właściwą godzinę. */}
          {toLocalYMD(startDate) !== toLocalYMD(now) && (
            <div className="mt-3 rounded-lg px-3.5 py-3 border-2 border-[#8A5300] bg-[#FDF0D8] text-[#8A5300]">
              <b className="block text-[15px]">
                Ta zmiana trwa od {opisDnia(toLocalYMD(startDate))}
              </b>
              <span className="text-[14px]">
                Jeśli już ją skończyłeś(-aś), zakończ ją poniżej i podaj godzinę, o
                której naprawdę wyszedłeś(-aś). Bez tego te godziny nie policzą się
                nikomu.
              </span>
            </div>
          )}
          {zGrafikiem ? (
            <>
              <div className="relative h-3.5 rounded-full bg-[#DEDCD4] mt-4 mb-1 overflow-hidden">
                <i className="absolute inset-y-0 left-0 bg-[#1F7A4A]" style={{ width: `${granica}%` }} />
                {po && (
                  <>
                    <i className="absolute inset-y-0 right-0 bg-[#8A5300]" style={{ left: `${granica}%` }} />
                    <em className="absolute inset-y-0 w-[3px] -ml-[1.5px] bg-white" style={{ left: `${granica}%` }} />
                  </>
                )}
              </div>
              <div className="flex justify-between text-[13px] font-bold text-[#6E6E66]">
                <span>{trimTime(planTrwajacej.start_time)}</span>
                <span>koniec wg grafiku {trimTime(planTrwajacej.end_time)}</span>
              </div>
              <div
                className={`flex justify-between items-baseline gap-2.5 mt-3 px-3.5 py-3 border-2 rounded-lg ${
                  po ? "border-[#8A5300] bg-[#FDF0D8] text-[#8A5300]" : "border-[#171714] bg-white"
                }`}
              >
                <span className={`min-w-0 text-[15px] leading-tight font-bold ${po ? "" : "text-[#6E6E66]"}`}>
                  {po ? "Ponad grafik" : "Do końca zmiany"}
                </span>
                {/* Czas nigdy się nie łamie („min” spadało do drugiej linii na
                    wąskim telefonie) — zawija się najwyżej podpis z lewej. */}
                <b
                  className={`flex-shrink-0 whitespace-nowrap font-['Archivo'] text-[22px] min-[380px]:text-[26px] font-extrabold tabular-nums ${
                    po ? "" : "text-[#171714]"
                  }`}
                >
                  {po ? "+" : ""}
                  {czasTrwania(zostalo)}
                </b>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-baseline gap-2.5 mt-3 px-3.5 py-3 border-2 border-[#171714] rounded-lg bg-white">
              <span className="text-[15px] font-bold text-[#6E6E66]">Bez grafiku na dziś</span>
              <b className="text-[17px] text-[#171714]">liczymy czas pracy</b>
            </div>
          )}
        </section>
        {/* Zadania mają własną zakładkę i blok TERAZ na Pulpicie — tutaj
            zostaje jedno zdanie, niewymuszające: zmianę można zakończyć. */}
        {myChecklistOwn.length > 0 && zostaloZadan > 0 && (
          <button
            onClick={() => setScreen("ZADANIA")}
            className="w-full flex items-center gap-2 text-left px-3.5 py-3 mb-3.5 rounded-lg bg-white border-2 border-[#DEDCD4] text-[15px] text-[#171714]"
          >
            <ClipboardCheck size={18} className="flex-shrink-0" />
            <span className="flex-1">
              Zostały {zostaloZadan} {zostaloZadan === 1 ? "zadanie" : "zadania"}. Możesz
              zakończyć zmianę — kierownik zobaczy status w panelu.
            </span>
            <ChevronRight size={18} className="text-[#6E6E66] flex-shrink-0" />
          </button>
        )}
        {/* Wyłączone "Wpisy" zabierają całą obsługę zmiany, także jej
            zakończenie — inaczej pracownik mógłby zamknąć zmianę z telefonu
            mimo że lokal tego nie udostępnia. Zmianę kończy wtedy na
            Tablecie Służbowym. */}
        {bloki.includes("WPISY") ? (
          <>
            <span className={lblCls}>Zakończenie</span>
            <PoleGodziny
              wartosc={innyKoniec}
              teraz={fmtHHMM(now)}
              onZmiana={setInnyKoniec}
              onTeraz={() => setInnyKoniec(null)}
              etykieta="Godzina zakończenia"
              data-godzina-konca
            />
            {podpisOkna(
              "koniec",
              regulyWpisu(lokaleWszystkie, openShift.lokal).koniecWstecz,
              lokalDoOpisu(openShift.lokal)
            ) && (
              <p className="md:hidden text-[14px] text-[#6E6E66] mt-2 mx-0.5">
                {podpisOkna(
                  "koniec",
                  regulyWpisu(lokaleWszystkie, openShift.lokal).koniecWstecz,
                  lokalDoOpisu(openShift.lokal)
                )}
              </p>
            )}
          </>
        ) : (
          <p className="text-[15px] text-[#6E6E66]">
            Zmianę kończysz na Tablecie Służbowym w lokalu.
          </p>
        )}
      </>
    );
  };
  const przyciskKonca = () =>
    bloki.includes("WPISY") && (
      <button
        onClick={() => handleCloseShift(innyKoniec)}
        disabled={saving || innyKoniec === ""}
        className={przyciskGlownyCls}
      >
        Zakończ zmianę o {innyKoniec || fmtHHMM(now)}
      </button>
    );

  const razem = (() => {
    if (!znamKoniec || !formStartTime || !formEndTime) return null;
    const [sh, sm] = formStartTime.split(":").map(Number);
    const [eh, em] = formEndTime.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return (mins / 60).toFixed(1).replace(".", ",");
  })();

  // Plan na dziś w lokalu z formularza — z niego podpis „z grafiku” przy
  // lokalu i stanowisku (domyślnyLokal i korekta stanowiska już go używają).
  const planFormularza = mojeDzis.find((s) => s.lokal === formLokal) || null;
  const renderStartForm = () => (
    <>
      {/* Na telefonie „Dziś zapisane” stoi nad formularzem — pokazuje, że
          nowa zmiana nie może zacząć się wcześniej niż koniec poprzedniej. */}
      <div className="md:hidden">{renderDzisZapisane()}</div>
      {/* Lokal może wymusić jeden sposób wpisu (Ustawienia → Lokale →
          Rejestracja godzin). Wtedy kafli nie ma — jest zdanie, które mówi, jak
          się tu wpisuje godziny. */}
      {wymuszonaCala === null ? (
        <div className="grid grid-cols-2 gap-2 mb-3.5">
          {[
            [false, "Zaczynam teraz", "koniec zapiszesz później", Clock],
            [true, "Cała zmiana", "start i koniec razem", CalendarDays],
          ].map(([wartosc, tytul, pod, Ikona]) => (
            <button
              key={tytul}
              type="button"
              onClick={() => setKnowsEnd(wartosc)}
              className={`min-h-[64px] flex items-center gap-2 px-2.5 py-2 rounded-lg border-2 text-left ${
                knowsEnd === wartosc
                  ? "bg-[#171714] border-[#171714] text-white"
                  : "bg-white border-[#171714] text-[#171714]"
              }`}
            >
              <Ikona size={22} className="flex-shrink-0" />
              <span>
                <b className="block text-[16px]">{tytul}</b>
                <small
                  className={`block text-[12px] leading-[15px] ${
                    knowsEnd === wartosc ? "text-white/75" : "text-[#6E6E66]"
                  }`}
                >
                  {pod}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[15px] text-[#6E6E66] mb-3.5 mx-0.5">
          {opisGdzie(lokalDoOpisu(formLokal))}{" "}
          {wymuszonaCala
            ? "wpisujesz całą zmianę naraz — po jej zakończeniu."
            : "odbijasz osobno: start teraz, koniec po pracy."}
        </p>
      )}
      {bloki.includes("GRAFIK") && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#DEDCD4] mb-3 text-[15px]">
          <CalendarDays size={20} className="text-[#6E6E66] flex-shrink-0" />
          <span className="flex-1 text-[#6E6E66]">
            {mojeDzis.length ? "Dziś w grafiku" : "Dziś nie ma Cię w grafiku"}
          </span>
          <b className="text-[17px] tabular-nums text-[#171714]">
            {mojeDzis.length
              ? mojeDzis
                  .map((s) => `${trimTime(s.start_time)} – ${trimTime(s.end_time)}`)
                  .join(", ")
              : "—"}
          </b>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          [
            "Lokal",
            formLokal,
            // Zmiana lokalu ustawia od razu stanowisko z grafiku w tym lokalu.
            (v) => {
              setFormLokal(v);
              setFormStanowisko(domyslneStanowisko(v));
            },
            lokaleFormularza,
            !!planFormularza,
            null,
          ],
          [
            "Stanowisko",
            formStanowisko,
            setFormStanowisko,
            dostepneStanowiska,
            planFormularza?.stanowisko === formStanowisko,
            "Brak stanowisk",
          ],
        ].map(([etykieta, wartosc, ustaw, opcje, zGrafiku, pusto]) => (
          <label key={etykieta} className="block min-w-0">
            <span className="block text-[15px] text-[#6E6E66] mx-0.5 mb-1.5">
              {etykieta}
              {zGrafiku && (
                <em className="not-italic text-[11px] font-extrabold text-[#1F7A4A] bg-[#E2F3E9] rounded-[5px] px-1.5 py-px ml-1">
                  z grafiku
                </em>
              )}
            </span>
            <span className="relative block">
              <select
                value={wartosc}
                onChange={(e) => ustaw(e.target.value)}
                className="w-full h-14 appearance-none bg-white border-2 border-[#171714] rounded-lg pl-3.5 pr-9 text-[17px] font-bold text-[#171714] truncate"
              >
                {opcje.length === 0 && pusto && <option value="">{pusto}</option>}
                {opcje.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#171714]"
              />
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3.5">
        <span className={lblCls}>Rozpoczęcie</span>
        {znamKoniec ? (
          <PoleGodziny
            wartosc={formStartTime}
            onZmiana={setFormStartTime}
            etykieta="Godzina rozpoczęcia"
            data-godzina-startu
          />
        ) : (
          <PoleGodziny
            wartosc={innyStart}
            teraz={fmtHHMM(now)}
            onZmiana={setInnyStart}
            onTeraz={() => setInnyStart(null)}
            etykieta="Godzina rozpoczęcia"
            data-godzina-startu
          />
        )}
      </div>
      {znamKoniec && (
        <div className="mt-3.5">
          <span className={lblCls}>Zakończenie</span>
          <PoleGodziny
            wartosc={formEndTime}
            onZmiana={setFormEndTime}
            etykieta="Godzina zakończenia"
            data-godzina-konca
          />
        </div>
      )}
      {znamKoniec && (
        <div className="flex justify-between items-baseline px-3.5 py-3 rounded-lg bg-[#DEDCD4] mt-3.5">
          <span className="text-[15px] text-[#6E6E66]">
            Razem · dziś,{" "}
            {new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}
          </span>
          <b className="font-['Archivo'] text-[24px] font-extrabold tabular-nums text-[#171714]">
            {razem ? `${razem} godz.` : "—"}
          </b>
        </div>
      )}
      {!znamKoniec && (
        <p className="text-[15px] leading-[21px] text-[#6E6E66] mt-2.5 mx-0.5">
          Zapiszemy tylko start. Zmianę zakończysz przy następnym wejściu.
        </p>
      )}
      {podpisOkna(
        znamKoniec ? "cala" : "start",
        znamKoniec ? regulyFormularza.koniecWstecz : regulyFormularza.startWstecz,
        lokalDoOpisu(formLokal)
      ) && (
        // Na tablecie to samo zdanie stoi w „Zasadach lokalu” obok.
        <p className="md:hidden text-[15px] leading-[21px] text-[#6E6E66] mt-2 mx-0.5">
          {podpisOkna(
            znamKoniec ? "cala" : "start",
            znamKoniec ? regulyFormularza.koniecWstecz : regulyFormularza.startWstecz,
            lokalDoOpisu(formLokal)
          )}
        </p>
      )}
    </>
  );
  const przyciskStartu = () => (
    <button
      onClick={() => handleCreateShift()}
      disabled={saving || (!znamKoniec && innyStart === "")}
      className={przyciskGlownyCls}
    >
      {znamKoniec
        ? "Zapisz całą zmianę"
        : `Rozpocznij zmianę o ${innyStart || fmtHHMM(now)}`}
    </button>
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
    } else if (p.rodzaj === "porzucona") {
      const dzis = toLocalYMD(p.shift.start_time) === toLocalYMD(new Date());
      tytul = "Ta zmiana już jest zapisana";
      tresc =
        `Masz start o ${fmtHHMM(p.shift.start_time)}${
          dzis ? "" : ` (${dzienKrotki(toLocalYMD(p.shift.start_time))})`
        } bez odbitego końca. Nie zakładamy drugiej zmiany — wyślemy kierownikowi ` +
        `prośbę, żeby zakończył tamtą: ${fmtHHMM(p.startD)}–${fmtHHMM(p.endD)}.`;
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
      <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50">
        <div className="bg-white rounded-t-[20px] md:rounded-[20px] border-2 border-[#171714] w-full md:max-w-[460px] p-5 pb-7 max-h-[90vh] overflow-y-auto flex flex-col gap-2.5">
          <div
            className={`flex gap-2.5 items-start rounded-lg px-3.5 py-3 text-[15px] leading-[21px] font-bold ${
              p.powod === "za_pozno"
                ? "bg-[#FDF0D8] text-[#8A5300] border-2 border-[#8A5300]"
                : "bg-[#DEDCD4] text-[#171714]"
            }`}
          >
            <AlertTriangle size={20} className="flex-shrink-0 mt-px" />
            <span className="font-['Archivo'] font-extrabold text-[20px] leading-6">{tytul}</span>
          </div>
          <p className="text-[16px] leading-[22px] text-[#6E6E66]">{tresc}</p>
          {p.powod === "za_pozno" && (
            <button onClick={potwierdzPozaOknem} disabled={saving} className={`${przyciskGlownyCls} mt-1`}>
              {p.rodzaj === "start" ? "Rozpocznij i wyślij do kierownika" : "Wyślij do kierownika"}
            </button>
          )}
          <button onClick={() => setPozaOknem(null)} className={przyciskDrugiCls}>
            {p.powod === "za_pozno" ? "Anuluj" : "Rozumiem"}
          </button>
        </div>
      </div>
    );
  };

  const renderJustClosedSummary = () => {
    const total = sumHours(todaysClosedShifts);
    const cosCzeka = todaysClosedShifts.some(czekaNaKierownika);
    return (
      <>
        <section className="px-0.5 pt-1.5 pb-3.5">
          <span className="w-12 h-12 rounded-full bg-[#E2F3E9] text-[#1F7A4A] flex items-center justify-center">
            <Check size={28} strokeWidth={3} />
          </span>
          <h2 className="font-['Archivo'] font-extrabold text-[32px] text-[#171714] mt-2.5">
            Zmiana zapisana
          </h2>
          <p className="text-[17px] text-[#6E6E66]">Dzięki, {employee.name}</p>
        </section>
        {renderDzisZapisane()}
        <div className="flex justify-between items-baseline px-3.5 py-3 rounded-lg bg-[#DEDCD4]">
          <span className="text-[15px] text-[#6E6E66]">Razem dziś</span>
          <b className="font-['Archivo'] text-[30px] font-extrabold tabular-nums text-[#171714]">
            {total.toFixed(1).replace(".", ",")} godz.
          </b>
        </div>
        {myChecklistOwn.length > 0 && (
          <p className="text-[15px] text-[#6E6E66] mt-2.5 mx-0.5">
            Zadania: {myChecklistOwn.filter((i) => i.done).length} z {myChecklistOwn.length}{" "}
            wykonanych
          </p>
        )}
        {cosCzeka && (
          <div className="flex gap-2.5 items-start mt-2.5 px-3.5 py-3 rounded-lg border-2 border-[#8A5300] bg-[#FDF0D8] text-[#8A5300] text-[15px] leading-[21px] font-bold">
            <AlertTriangle size={20} className="flex-shrink-0 mt-px" />
            Godzina poza oknem lokalu czeka na zatwierdzenie kierownika.
          </div>
        )}
      </>
    );
  };
  const przyciskiPoZapisie = () => (
    <>
      <span className={`${lblCls} mt-1`}>Wracasz jeszcze dziś?</span>
      <button
        onClick={() => {
          setJustClosed(false);
          resetShiftForm();
        }}
        className={przyciskGlownyCls}
      >
        Rozpocznij kolejną zmianę
      </button>
      <div className="grid gap-1.5 mt-1.5">
        <button onClick={() => setScreen("RAPORT")} className={przyciskDrugiCls}>
          Zobacz swoje godziny
        </button>
        {onBack && (
          <button onClick={onBack} className={`${przyciskDrugiCls} !border-[#DEDCD4] !text-[#6E6E66]`}>
            Wróć do listy osób
          </button>
        )}
      </div>
    </>
  );

  // ==========================================
  // EKRAN: PULPIT — układ z makiety właściciela (0.58.0, EmployeeHomeMobile /
  // EmployeeHomeTablet). Górna karta zmienia się wg STANU dnia (wolne / przed
  // zmianą / na zmianie / po zmianie), a główny przycisk tylko PROWADZI do
  // Zmiany — zapis godzin zostaje w jednym miejscu, z oknami tolerancji.
  // Pozostałe karty pokazują się wyłącznie wtedy, gdy mają treść.
  // ==========================================
  if (screen === "PULPIT") {
    const godzH = (n) => (Math.round((n || 0) * 10) / 10).toString().replace(".", ",");
    const hm = (ms) => {
      const abs = Math.max(0, Math.abs(ms));
      return `${Math.floor(abs / 3600000)} godz. ${Math.floor((abs % 3600000) / 60000)} min`;
    };
    const dataKrotko = (ymd) =>
      new Date(ymd + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
    const widziGrafik = bloki.includes("GRAFIK");
    const planDzis = widziGrafik
      ? [...mojeDzis].sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)))
      : [];
    const zamknieteDzis = [...todaysClosedShifts].sort((a, b) => a.start_time - b.start_time);
    const ostatniKoniec = zamknieteDzis.length ? zamknieteDzis[zamknieteDzis.length - 1].end_time : null;
    const naDzisPlan = (p) => {
      const d = new Date(p.date + "T00:00:00");
      const [h, m] = trimTime(p.start_time).split(":").map(Number);
      d.setHours(h, m, 0, 0);
      return d;
    };
    // Zmiana dzielona: po zakończeniu pierwszej części dzień jest znowu
    // „przed zmianą”, jeśli grafik ma jeszcze coś PO ostatnim odbitym końcu.
    const kolejnaDzis = ostatniKoniec
      ? planDzis.find((p) => naDzisPlan(p) > ostatniKoniec)
      : planDzis[0];
    const stan = openShift
      ? "on"
      : zamknieteDzis.length
      ? kolejnaDzis
        ? "before"
        : "after"
      : planDzis.length
      ? "before"
      : "off";
    const jutroYMD = addDaysYMD(dzisYMD, 1);
    const nastepna = widziGrafik
      ? stan === "off"
        ? najblizszaZmiana
        : nextShiftFrom(planShifts, employee, jutroYMD)
      : null;

    // „Dziś z Tobą” — kto jeszcze stoi w OPUBLIKOWANYM grafiku tego dnia w
    // tym samym lokalu. Z grafiku, nie z odbić: chodzi o to, z kim będę
    // pracować, a nie kto już przyszedł.
    const zespol = (date, lokal) => {
      if (!widziGrafik || !date || !lokal) return [];
      const imiona = [];
      (planShifts || []).forEach((s) => {
        if (
          s.published_at &&
          !s.deleted_at &&
          s.date === date &&
          s.lokal === lokal &&
          String(s.user_id) !== String(employee.id) &&
          s.user_name !== employee.name &&
          s.user_name &&
          !imiona.includes(s.user_name)
        )
          imiona.push(s.user_name);
      });
      return imiona;
    };
    const renderZespol = (imiona, etykieta) =>
      imiona.length > 0 && (
        <div className="flex items-center flex-wrap mt-3 pt-2.5 border-t border-[#DEDCD4] text-[14px] text-[#6E6E66]">
          {etykieta}
          <span className="inline-flex ml-2">
            {imiona.slice(0, 4).map((n, i) => (
              <span
                key={n}
                className={`w-[30px] h-[30px] rounded-full bg-[#DEDCD4] border-2 border-white inline-flex items-center justify-center text-[11px] font-extrabold text-[#171714] ${
                  i ? "-ml-1.5" : ""
                }`}
              >
                {n.slice(0, 2)}
              </span>
            ))}
          </span>
          <em className="not-italic ml-2 text-[#171714] font-semibold">
            {imiona.slice(0, 4).join(", ")}
            {imiona.length > 4 ? ` +${imiona.length - 4}` : ""}
          </em>
        </div>
      );

    const kartaCls = "bg-white border-2 border-[#171714] rounded-xl px-4 py-3.5 mb-3";
    const etykietaCls =
      "flex items-center gap-1.5 text-[13px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66]";
    const duzaCls =
      "block font-['Archivo'] text-[36px] leading-[42px] font-extrabold tabular-nums text-[#171714] mt-1";

    const renderNastepna = (solo) =>
      nastepna && (
        <div
          className={`rounded-lg px-3.5 py-3 ${
            solo ? "bg-white border-2 border-[#171714] mb-3" : "bg-[#DEDCD4] mt-2.5"
          }`}
        >
          <span className="block text-[12px] font-extrabold uppercase tracking-[.05em] text-[#6E6E66]">
            Następna zmiana
          </span>
          <b className="block font-['Archivo'] text-[24px] leading-[30px] font-extrabold text-[#171714]">
            {opisDnia(nastepna.date)} · {trimTime(nastepna.start_time)}–{trimTime(nastepna.end_time)}
          </b>
          <small className="text-[15px] text-[#6E6E66]">
            {nastepna.stanowisko} · {nastepna.lokal}
          </small>
          {!solo && renderZespol(zespol(nastepna.date, nastepna.lokal), "z Tobą:")}
        </div>
      );

    // --- karta stanu ---
    const renderStatus = () => {
      if (stan === "on") {
        const startDate = openShift.start_time;
        const minelo = now - startDate;
        const zGrafikiem = planowanyKoniec && widziGrafik;
        const calosc = zGrafikiem ? planowanyKoniec - startDate : 0;
        const po = zGrafikiem && now > planowanyKoniec;
        const procent = zGrafikiem && calosc > 0 ? Math.min(100, (minelo / calosc) * 100) : 0;
        return (
          <section className={kartaCls}>
            <span className={`${etykietaCls} !text-[#1F7A4A]`}>
              <i className="w-2.5 h-2.5 rounded-full bg-[#1F7A4A] shadow-[0_0_0_4px_rgba(42,122,58,.18)]" />
              Na zmianie od {fmtHHMM(startDate)}
            </span>
            <b className={duzaCls}>{hm(minelo)}</b>
            <small className="text-[15px] text-[#6E6E66]">
              {openShift.lokal} · {openShift.stanowisko}
            </small>
            {/* Zmiana z poprzedniego dnia wygląda tu tak samo jak dzisiejsza —
                bez tego człowiek, który zapomniał odbić koniec, dowiadywał się
                o tym od kierownika, kilka dni później. */}
            {toLocalYMD(startDate) !== toLocalYMD(now) && (
              <div className="mt-2.5 rounded-lg px-3 py-2.5 border-2 border-[#8A5300] bg-[#FDF0D8] text-[#8A5300] text-[15px] font-bold">
                Ta zmiana trwa od {opisDnia(toLocalYMD(startDate))}. Jeśli już ją
                skończyłeś(-aś), zakończ ją w zakładce Zmiana i podaj godzinę
                wyjścia.
              </div>
            )}
            {zGrafikiem ? (
              <>
                <div className="relative h-3.5 rounded-full bg-[#DEDCD4] mt-3 mb-2 overflow-hidden">
                  <i
                    className={`absolute inset-y-0 left-0 ${po ? "bg-[#8A5300]" : "bg-[#1F7A4A]"}`}
                    style={{ width: `${procent}%` }}
                  />
                </div>
                <div
                  className={`flex justify-between items-baseline text-[15px] ${
                    po ? "text-[#8A5300]" : "text-[#6E6E66]"
                  }`}
                >
                  <span>{po ? "ponad grafik" : "do końca wg grafiku"}</span>
                  <b className={`text-[18px] tabular-nums ${po ? "" : "text-[#171714]"}`}>
                    {po ? "+" : ""}
                    {hm(planowanyKoniec - now)}
                  </b>
                </div>
              </>
            ) : (
              <p className="text-[15px] text-[#6E6E66] mt-2">
                Bez zmiany w grafiku — liczymy czas pracy.
              </p>
            )}
            {!bloki.includes("WPISY") && (
              <p className="text-[14px] text-[#6E6E66] mt-2">
                Zmianę kończysz na Tablecie Służbowym w lokalu.
              </p>
            )}
            {renderZespol(zespol(toLocalYMD(startDate), openShift.lokal), "Dziś z Tobą:")}
          </section>
        );
      }
      if (stan === "before") {
        const p = kolejnaDzis || planDzis[0];
        return (
          <section className={kartaCls}>
            <span className={etykietaCls}>
              <Clock size={18} /> Dziś w grafiku
            </span>
            <b className={duzaCls}>
              {trimTime(p.start_time)} – {trimTime(p.end_time)}
            </b>
            <small className="text-[15px] text-[#6E6E66]">
              {p.stanowisko} · {p.lokal}
            </small>
            {zamknieteDzis.length > 0 && (
              <p className="text-[14px] text-[#6E6E66] mt-1">
                Dziś już zapisane: {zamknieteDzis
                  .map((s) => `${fmtHHMM(s.start_time)}–${fmtHHMM(s.end_time)}`)
                  .join(", ")}
              </p>
            )}
            {renderZespol(zespol(p.date, p.lokal), "Dziś z Tobą:")}
          </section>
        );
      }
      if (stan === "after") {
        const ostatnia = zamknieteDzis[zamknieteDzis.length - 1];
        return (
          <section className={kartaCls}>
            <span className={`${etykietaCls} !text-[#1F7A4A]`}>
              <Check size={18} strokeWidth={2.5} /> Dziś zapisane
            </span>
            <b className={duzaCls}>
              {fmtHHMM(zamknieteDzis[0].start_time)} – {fmtHHMM(ostatnia.end_time)}
            </b>
            <small className="text-[15px] text-[#6E6E66]">
              {godzH(sumHours(zamknieteDzis))} godz. · {ostatnia.stanowisko} · {ostatnia.lokal}
            </small>
          </section>
        );
      }
      return (
        <section className={kartaCls}>
          <span className={etykietaCls}>
            <Palmtree size={18} />{" "}
            {widziGrafik ? (wydarzeniaDnia(dzisYMD).some((w) => jestUczestnikiem(wydarzeniaUczestnicy, w.id, employee)) ? "Dziś bez zmiany" : "Dziś wolne") : "Dziś"}
          </span>
          {widziGrafik ? (
            nastepna ? (
              renderNastepna(false)
            ) : (
              <p className="text-[15px] text-[#6E6E66] mt-2">
                Nie masz jeszcze wpisanych zmian w grafiku.
              </p>
            )
          ) : (
            <p className="text-[15px] text-[#6E6E66] mt-2">
              Rozpocznij zmianę, gdy zaczniesz pracę.
            </p>
          )}
        </section>
      );
    };

    // --- główny przycisk: tylko przejście do Zmiany ---
    const renderGlowny = () => {
      if (!bloki.includes("WPISY")) return null;
      const glowny = stan === "on" || stan === "before";
      const tytul =
        stan === "on"
          ? "Zakończ zmianę"
          : stan === "after"
          ? "Rozpocznij kolejną zmianę"
          : "Rozpocznij zmianę";
      const pod = stan === "off" && widziGrafik ? "poza grafikiem" : "przejdziesz do Zmiany";
      return (
        <button
          onClick={() => {
            // Bez tego, jeśli pracownik wcześniej dziś zamknął zmianę, wejście
            // pokazywałoby stare podsumowanie zamiast formularza.
            setJustClosed(false);
            setScreen("ZMIANA");
          }}
          className={`w-full flex items-center justify-between text-left px-[18px] rounded-lg ${
            glowny
              ? "min-h-[68px] bg-[#DE3A22] text-white"
              : "min-h-[60px] bg-white border-2 border-[#171714] text-[#171714]"
          }`}
        >
          <span className="grid">
            <b className={`font-['Archivo'] font-extrabold ${glowny ? "text-[21px]" : "text-[18px]"}`}>
              {tytul}
            </b>
            <small className="text-[13px] font-semibold opacity-85">{pod}</small>
          </span>
          <ChevronRight size={26} />
        </button>
      );
    };

    // --- mini tydzień (dzień wolny) ---
    const renderTydzien = () => {
      if (!widziGrafik || stan !== "off") return null;
      const pn = mondayOf(dzisYMD);
      const SKROT = ["pn", "wt", "śr", "czw", "pt", "sob", "nd"];
      return (
        <button
          onClick={() => setScreen("GRAFIK")}
          className="w-full block text-left bg-white border-2 border-[#DEDCD4] rounded-lg px-3 py-2.5 mb-3"
        >
          <span className="flex items-center gap-1 text-[13px] font-extrabold uppercase tracking-[.05em] text-[#6E6E66]">
            Ten tydzień <ChevronRight size={16} className="ml-auto" />
          </span>
          <span className="grid grid-cols-7 mt-2 text-center">
            {SKROT.map((sk, i) => {
              const ymd = addDaysYMD(pn, i);
              const ma = mojGrafik.some((s) => s.date === ymd);
              return (
                <span
                  key={ymd}
                  className={`grid justify-items-center gap-0.5 py-1 rounded-[10px] ${
                    ymd === dzisYMD ? "bg-[#DEDCD4]" : ""
                  }`}
                >
                  <small className="text-[12px] font-bold text-[#6E6E66]">{sk}</small>
                  <b className="text-[18px] text-[#171714]">{Number(ymd.slice(8))}</b>
                  <i className={`w-2 h-2 rounded-full ${ma ? "bg-[#171714]" : ""}`} />
                </span>
              );
            })}
          </span>
        </button>
      );
    };

    // --- karty pokazywane tylko wtedy, gdy mają treść ---
    const nieprzeczytane = bloki.includes("WIADOMOSCI")
      ? myNotifications
          .filter((n) => !n.is_read)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      : [];
    const oferta = widziGrafik ? mojeOferty[0] : null;
    // Moje sprawy u kierownika: czekające i rozstrzygnięte w ostatnich
    // 3 dniach — starsza odpowiedź jest już w Wiadomościach.
    const granicaSpraw = Date.now() - 3 * 86400000;
    const mojeSprawy = [
      ...(issues || [])
        .filter(
          (i) =>
            !i.is_anonymous &&
            String(i.user_id) === String(employee.id) &&
            (i.status !== "rozwiazane" ||
              new Date(i.updated_at || i.created_at).getTime() > granicaSpraw)
        )
        .map((i) => ({
          klucz: `i:${i.id}`,
          kiedy: new Date(i.created_at),
          tytul:
            i.type === "correction"
              ? `Korekta${i.proposed_date ? ` ${dataKrotko(i.proposed_date)}` : ""}`
              : "Zgłoszenie",
          status: i.status === "rozwiazane" ? ["rozpatrzona", "ok"] : ["czeka", "wait"],
        })),
      ...(absences || [])
        .filter(
          (a) =>
            String(a.user_id) === String(employee.id) &&
            a.requested_by !== "manager" &&
            (a.status === "pending" ||
              new Date(a.decided_at || a.created_at).getTime() > granicaSpraw)
        )
        .map((a) => ({
          klucz: `a:${a.id}`,
          kiedy: new Date(a.created_at),
          tytul: `${a.type === "urlop" ? "Urlop" : "Wolne"} ${dataKrotko(a.start_date)}${
            a.end_date && a.end_date !== a.start_date ? `–${dataKrotko(a.end_date)}` : ""
          }`,
          status:
            a.status === "approved"
              ? ["zatwierdzony", "ok"]
              : a.status === "rejected"
              ? ["odrzucony", "no"]
              : ["czeka", "wait"],
        })),
    ]
      .sort((a, b) => b.kiedy - a.kiedy)
      .slice(0, 2);
    const plakietka = {
      ok: "bg-[#E2F3E9] text-[#1F7A4A]",
      wait: "bg-[#FDF0D8] text-[#8A5300]",
      no: "bg-[#ECEBE6] text-[#6E6E66]",
    };
    const kartaInfoCls =
      "w-full flex items-center gap-3 px-3.5 py-3 rounded-lg mb-2.5 text-left text-[#171714]";
    const kolkoCls = "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0";
    // Wydarzenia (0.74.0, makieta EmployeeHomeEvent): od dnia przed do końca
    // wydarzenia. Dziś — ciemna karta, jutro — biała z czarnym paskiem. Kilka
    // naraz → pierwsze i „+N”. Dotknięcie otwiera Grafik na tym tygodniu.
    const wydarzeniaDnia = (data) =>
      widziGrafik
        ? wydarzeniaPracownikaNaDzien({ wydarzenia, uczestnicy: wydarzeniaUczestnicy, user: employee, planShifts, data })
        : [];
    const wydDzis = wydarzeniaDnia(dzisYMD).filter((w) => koniecWydarzenia(w) > now);
    const wydPrzypomnienie = wydDzis.length
      ? { lista: wydDzis, dzis: true, data: dzisYMD }
      : { lista: wydarzeniaDnia(addDaysYMD(dzisYMD, 1)), dzis: false, data: addDaysYMD(dzisYMD, 1) };
    const kartaWydarzenia = () => {
      const { lista, dzis, data } = wydPrzypomnienie;
      if (!lista.length) return null;
      const w = lista[0];
      const uczestnik = jestUczestnikiem(wydarzeniaUczestnicy, w.id, employee);
      const godz = Math.round((minutyWydarzenia(w) / 60) * 10) / 10;
      return (
        <button
          onClick={() => {
            setTydzienOffset(
              Math.round((new Date(mondayOf(data) + "T00:00:00") - new Date(mondayOf(dzisYMD) + "T00:00:00")) / (7 * 86400000))
            );
            setGrafikWidok("tydzien");
            setGrafikWszyscy(false);
            setScreen("GRAFIK");
          }}
          className={`${kartaInfoCls} border-2 border-l-[6px] border-[#171714] ${dzis ? "bg-[#171714] text-white" : "bg-white"}`}
          data-przypomnienie-wydarzenia
        >
          <span className="flex-1 min-w-0">
            <small className={`block text-[13px] font-extrabold ${dzis ? "text-white/70" : "text-[#6E6E66]"}`}>
              {uczestnik ? (dzis ? "Wydarzenie dla Ciebie" : `Przypomnienie · ${dataKrotko(data)}`) : "W lokalu"}
            </small>
            <b className="block text-[16px] leading-[22px]">
              {dzis ? "Dziś" : "Jutro"}: {w.tytul}
              {lista.length > 1 ? ` · +${lista.length - 1}` : ""}
            </b>
            <small className={`block text-[14px] ${dzis ? "text-white/80" : "text-[#6E6E66]"}`}>
              {godzinyTekst(w)} · {w.lokal || "wszystkie lokale"}
            </small>
            {w.platne && uczestnik ? (
              <span className="inline-flex mt-1.5 h-[22px] items-center px-2 rounded-md text-[12px] font-extrabold bg-[#E2F3E9] text-[#1F7A4A]">
                czas pracy · {String(godz).replace(".", ",")} h
              </span>
            ) : !uczestnik ? (
              <span className={`inline-flex mt-1.5 h-[22px] items-center px-2 rounded-md text-[12px] font-extrabold ${dzis ? "bg-white/15 text-white" : "bg-[#ECEBE6] text-[#171714]"}`}>
                informacja · nie zmienia Twojej zmiany
              </span>
            ) : null}
          </span>
          <ChevronRight size={20} className={`${dzis ? "text-white/70" : "text-[#6E6E66]"} flex-shrink-0`} />
        </button>
      );
    };
    const renderKarty = () => (
      <>
        {kartaWydarzenia()}
        {nieprzeczytane.length > 0 && (
          <button
            onClick={() => setScreen("WIADOMOSCI")}
            className={`${kartaInfoCls} bg-[#E3EEFB]`}
          >
            <span className={`${kolkoCls} bg-white text-[#1D5FA8]`}>
              <Mail size={22} />
            </span>
            <span className="flex-1 min-w-0">
              <small className="block text-[13px] font-extrabold text-[#1D5FA8]">
                {nieprzeczytane.length === 1
                  ? "Nowa wiadomość"
                  : `Nowe wiadomości · ${nieprzeczytane.length}`}
              </small>
              <b className="block text-[16px] leading-[22px] line-clamp-2">
                {formatNotificationText(nieprzeczytane[0], false)}
              </b>
            </span>
            <ChevronRight size={20} className="text-[#6E6E66] flex-shrink-0" />
          </button>
        )}
        {oferta && oferta.ps && (
          <button
            onClick={() => setScreen("GRAFIK")}
            className={`${kartaInfoCls} bg-[#E2F3E9] border-2 border-dashed border-[#1F7A4A]`}
          >
            <span className={`${kolkoCls} bg-[#1F7A4A] text-white`}>
              <ArrowLeftRight size={22} />
            </span>
            <span className="flex-1 min-w-0">
              <small className="block text-[13px] font-extrabold text-[#1F7A4A]">
                Możesz wziąć zmianę
                {mojeOferty.length > 1 ? ` · jeszcze ${mojeOferty.length - 1}` : ""}
              </small>
              <b className="block text-[16px] leading-[22px]">
                {opisDnia(oferta.ps.date)} · {trimTime(oferta.ps.start_time)}–
                {trimTime(oferta.ps.end_time)}
                {oferta.sw.author_user_name ? ` · od ${oferta.sw.author_user_name}` : ""}
              </b>
            </span>
            <ChevronRight size={20} className="text-[#6E6E66] flex-shrink-0" />
          </button>
        )}
        {mojeSprawy.length > 0 && (
          <div className={`${kartaInfoCls} bg-white border-2 border-[#DEDCD4]`}>
            <span className={`${kolkoCls} bg-[#DEDCD4]`}>
              <Flag size={22} />
            </span>
            <span className="flex-1 min-w-0">
              <small className="block text-[13px] font-extrabold text-[#6E6E66]">
                Twoje zgłoszenia
              </small>
              {mojeSprawy.map((s) => (
                <b key={s.klucz} className="block text-[16px] leading-[22px]">
                  {s.tytul}{" "}
                  <em className={`not-italic text-[12px] font-extrabold px-1.5 py-0.5 rounded-md ml-1 ${plakietka[s.status[1]]}`}>
                    {s.status[0]}
                  </em>
                </b>
              ))}
            </span>
          </div>
        )}
      </>
    );

    // --- zadania dnia: bloki, bieżący oznaczony TERAZ ---
    const pokazZadania =
      bloki.includes("ZADANIA") && (stan === "on" || stan === "before") && myBlocksOwn.length > 0;
    // „Teraz” = pierwszy blok, w którym coś zostało — bloki są już ułożone
    // wg pory (buildEmployeeBlocks), więc to ten, który wypada najbliżej.
    const terazId = stan === "on" ? (myBlocksOwn.find((g) => g.zostalo > 0) || {}).blok?.id : null;
    const renderZadania = () =>
      pokazZadania && (
        <>
          <div className="flex justify-between items-baseline mx-0.5 mt-1 mb-2">
            <span className="text-[13px] font-extrabold uppercase tracking-[.05em] text-[#6E6E66]">
              Zadania dziś
            </span>
            <b className="text-[18px] text-[#171714] tabular-nums">
              {myChecklistOwn.filter((i) => i.done).length} z {myChecklistOwn.length}
            </b>
          </div>
          {myBlocksOwn.map((g) => {
            const teraz = g.blok.id === terazId;
            return (
              <button
                key={g.blok.id}
                onClick={() => {
                  setOpenBlockId(g.blok.id);
                  setScreen("ZADANIA");
                }}
                className={`w-full grid grid-cols-[1fr_auto_22px] gap-x-2.5 gap-y-2 items-center text-left bg-white border-2 rounded-lg mb-2 ${
                  teraz ? "border-[#171714] p-3.5" : "border-[#171714] px-3.5 py-3"
                } ${g.zostalo === 0 ? "opacity-60" : ""}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#6E6E66]">
                    {teraz && (
                      <em className="not-italic text-[11px] font-extrabold uppercase text-white bg-[#DE3A22] rounded-[5px] px-1.5 py-px">
                        teraz
                      </em>
                    )}
                    {poraLabel(g.blok.schedule_type)}
                    {g.blok.deadline_time ? ` · do ${g.blok.deadline_time.slice(0, 5)}` : ""}
                  </span>
                  <b
                    className={`flex items-center font-['Archivo'] font-extrabold text-[#171714] ${
                      teraz ? "text-[20px]" : "text-[17px]"
                    }`}
                  >
                    <span className="truncate">{g.blok.nazwa}</span>
                    {g.pilne && (
                      <i
                        title="Ważne"
                        className="not-italic inline-flex items-center justify-center w-[18px] h-[18px] ml-1 rounded-full bg-[#DE3A22] text-white text-[12px] font-black flex-shrink-0"
                      >
                        !
                      </i>
                    )}
                  </b>
                </span>
                <span className="text-[18px] font-extrabold tabular-nums text-[#171714]">
                  {g.done}/{g.total}
                </span>
                <ChevronRight size={20} className="text-[#6E6E66]" />
                {teraz && (
                  <span className="col-span-3 h-2 rounded bg-[#DEDCD4] overflow-hidden">
                    <i
                      className="block h-full bg-[#1F7A4A]"
                      style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </>
      );

    // --- godziny w miesiącu → Raport ---
    const renderGodziny = () => {
      if (!bloki.includes("RAPORT")) return null;
      const rok = now.getFullYear();
      const mies = now.getMonth() + 1;
      const { fakt } = faktIPlanMiesiaca({ shifts, planShifts, user: employee, rok, mies });
      const norma = normaMiesiaca(employee, rok, mies);
      const ponad = norma != null ? Math.round((fakt - norma) * 10) / 10 : 0;
      return (
        <button
          onClick={() => {
            setRaportMonth(now.getMonth());
            setRaportYear(now.getFullYear());
            setScreen("RAPORT");
          }}
          className="w-full flex items-center gap-2 min-h-[52px] px-3.5 rounded-lg bg-[#DEDCD4] text-[15px] text-[#6E6E66] mt-1 mb-2.5"
        >
          <FileText size={18} />
          <span className="capitalize">{getMonthName(now.getMonth())}</span>
          <b className="ml-auto text-[16px] text-[#171714] whitespace-nowrap tabular-nums">
            {norma != null ? (
              <>
                {godzH(fakt)}/{godzH(norma)} h
                {ponad > 0.5 && <em className="not-italic text-[#8A5300]"> · +{godzH(ponad)} h</em>}
              </>
            ) : (
              `${godzH(fakt)} h`
            )}
          </b>
          <ChevronRight size={18} />
        </button>
      );
    };

    const renderWolne = () =>
      stan === "off" &&
      bloki.includes("WOLNE") && (
        <button
          onClick={openWniosekOWolne}
          className="w-full flex items-center gap-2 min-h-[52px] px-3.5 rounded-lg bg-white border-2 border-[#171714] text-[16px] font-bold text-[#171714] mt-1 mb-2.5"
        >
          <Palmtree size={18} /> Wniosek o wolne
          <ChevronRight size={18} className="ml-auto text-[#6E6E66]" />
        </button>
      );

    let lewa;
    let prawa;
    if (stan === "off") {
      lewa = (
        <>
          {renderStatus()}
          {renderTydzien()}
        </>
      );
      prawa = (
        <>
          {renderKarty()}
          {renderWolne()}
          {renderGodziny()}
        </>
      );
    } else if (stan === "after") {
      lewa = renderStatus();
      prawa = (
        <>
          {renderNastepna(true)}
          {renderKarty()}
          {renderGodziny()}
        </>
      );
    } else {
      lewa = (
        <>
          {renderStatus()}
          {renderKarty()}
        </>
      );
      prawa = (
        <>
          {renderZadania()}
          {renderGodziny()}
        </>
      );
    }
    const glowny = renderGlowny();

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
        title="Pulpit"
        showPill={!!openShift}
        nowyWyglad
        footer={
          glowny && (
            // Na telefonie przycisk stoi nad dolnym paskiem, pod kciukiem; na
            // tablecie — w lewej kolumnie, pod kartą stanu.
            <div className="md:hidden flex-shrink-0 px-3.5 pt-2 pb-2.5 bg-[#F1F0EC]">{glowny}</div>
          )
        }
      >
        {/* Stoi nad wszystkim — zamknięcie dnia jest czynnością na koniec
            zmiany, więc musi być widoczne i wtedy, gdy zmiana jeszcze trwa. */}
        <PulsPrzypomnienie
          employee={employee}
          lokal={effectiveAssignment.lokal}
          onOtworz={() => setScreen("PULS")}
        />
        <div className="flex justify-between items-start gap-2.5 mb-3.5">
          <div className="min-w-0">
            <h2 className="font-['Archivo'] font-extrabold text-[30px] leading-[34px] text-[#171714]">
              Cześć, {employee.name}
            </h2>
            <small className="text-[15px] text-[#6E6E66]">
              {[employee.default_lokal, employee.default_stanowisko].filter(Boolean).join(" · ")}
            </small>
          </div>
          <WeatherBadge
            city={lokaleOptions.find((l) => l.name === effectiveAssignment.lokal)?.miasto}
            className="text-[16px] text-[#6E6E66] whitespace-nowrap mt-1 flex-shrink-0"
          />
        </div>
        <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
          <div className="min-w-0">
            {lewa}
            {glowny && <div className="hidden md:block mt-1.5">{glowny}</div>}
          </div>
          <div className="min-w-0">{prawa}</div>
        </div>
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZMIANA
  // ==========================================
  if (screen === "ZMIANA") {
    const przycisk = openShift
      ? przyciskKonca()
      : justClosed
      ? przyciskiPoZapisie()
      : przyciskStartu();
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
        title="Zmiana"
        showPill={!!openShift}
        nowyWyglad
        footer={
          przycisk && (
            // Na telefonie przycisk stoi nad dolnym paskiem, pod kciukiem.
            <div className="md:hidden flex-shrink-0 px-3.5 pt-2 pb-2.5 bg-[#F1F0EC]">{przycisk}</div>
          )
        }
      >
        {ukladZmiany({
          glowna: openShift
            ? renderShiftInProgress()
            : justClosed
            ? renderJustClosedSummary()
            : renderStartForm(),
          przycisk,
          bok: (
            <>
              {!justClosed || openShift ? renderDzisZapisane(true) : null}
              {renderZasady(openShift ? openShift.lokal : formLokal)}
            </>
          ),
        })}
        {renderPozaOknem()}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: GRAFIK — układ z makiety właściciela (0.62.0, EmployeeScheduleMobile
  // / EmployeeScheduleTablet). Logika giełdy bez zmian (utils/swaps.ts); nowe
  // są: pasek siedmiu dni, zwinięte wolne dni, zwarte karty zmian z „Z tobą”,
  // kreator giełdy z paskiem kroków, oferty w dniu, którego dotyczą, i
  // kalendarz miesiąca z wybranym dniem.
  // ==========================================
  // Pionowa lista dni, nie siatka — siatka kierownika (7 kolumn x N osób)
  // na telefonie jest nieczytelna. Pracownika interesuje przede wszystkim
  // "kiedy następnym razem pracuję", więc dzień jest tu jednostką.
  if (screen === "GRAFIK") {
    const bazowy = addDaysYMD(mondayOf(dzisYMD), tydzienOffset * 7);
    const dniTygodnia = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysYMD(bazowy, i));
    const MIES_K = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
    const DN = ["nd", "pn", "wt", "śr", "czw", "pt", "sob"];
    const dzienKrotko = (ymd) => {
      const d = new Date(ymd + "T00:00:00");
      return `${DN[d.getDay()]} ${d.getDate()} ${MIES_K[d.getMonth()]}`;
    };
    const h1 = (n) => String(Math.round((n || 0) * 10) / 10).replace(".", ",");
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
    const etykietaTygodnia = (() => {
      const a = new Date(dniTygodnia[0] + "T00:00:00");
      const b = new Date(dniTygodnia[6] + "T00:00:00");
      return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${MIES_K[b.getMonth()]}`
        : `${a.getDate()} ${MIES_K[a.getMonth()]} – ${b.getDate()} ${MIES_K[b.getMonth()]}`;
    })();
    // Rok przy miesiącu tylko wtedy, gdy nie jest bieżący — „Październik 2026”
    // nie mieści się na telefonie w stałej szerokości napisu (0.62.2).
    const etykietaZakresu =
      grafikWidok === "miesiac"
        ? `${getMonthName(miesiacData.getMonth())}${
            miesiacData.getFullYear() !== new Date().getFullYear() ? ` ${miesiacData.getFullYear()}` : ""
          }`
        : etykietaTygodnia;

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

    // Godziny miesiąca: fakt do wczoraj + grafik od dziś — ta sama prognoza co
    // w Raporcie („Z grafikiem wyjdzie”), żeby dwa ekrany nie mówiły co innego.
    const godzinyMiesiaca = (rok, mies) => {
      const r = faktIPlanZWydarzeniami({ shifts, planShifts, user: employee, rok, mies, wydarzenia, uczestnicy: wydarzeniaUczestnicy });
      return r.fakt + r.plan;
    };
    const etat = naEtacie(employee);
    const umowaOpis = etat ? "etat" : typUmowy(employee) === "zlecenie" ? "zlecenie" : "";
    const opisNormy = (godz, norma) => {
      const d = Math.round((godz - norma) * 10) / 10;
      return d > 0 ? `+${h1(d)} h ponad normą` : d < 0 ? `do normy brakuje ${h1(-d)} h` : "równo z normą";
    };

    const stanowiskoZnak = (lokal, stanowisko) => (
      <span
        className="text-[11px] font-extrabold px-1.5 py-0.5 rounded text-[#171714] bg-[#ECEBE6] flex-shrink-0"
        style={stanowiskoBadgeStyle(stanowiskaOptions, lokal, stanowisko) || {}}
      >
        {stanowiskoShort(stanowiskaOptions, lokal, stanowisko)}
      </span>
    );
    const ofertyWDniu = (d) => mojeOferty.filter(({ ps }) => ps && ps.date === d);

    // --- kreator giełdy w samej karcie, z paskiem kroków ---
    const renderKreator = (s) => {
      const kandydaci = swapTyp
        ? kandydaciNaZmiane({ users, planShifts, absences, planShift: s, author: employee, typ: swapTyp })
        : [];
      const zmianyKandydata =
        swapTyp === "zamiana" && swapTarget
          ? zmianyDoZamiany({ planShifts, absences, kandydat: swapTarget, author: employee, mojaZmiana: s })
          : [];
      const kroki =
        swapTyp === "zamiana"
          ? ["Sposób", "Z kim", "Na którą", "Wyślij"]
          : swapTyp === "oddanie"
          ? ["Sposób", "Komu", "Wyślij"]
          : swapTyp === "gielda"
          ? ["Sposób", "Wyślij"]
          : ["Sposób", "…"];
      const krok = !swapTyp
        ? 0
        : swapTyp === "gielda"
        ? 1
        : !swapTarget
        ? 1
        : swapTyp === "zamiana" && !swapWzajemna
        ? 2
        : kroki.length - 1;
      const wstecz = () => {
        if (swapWzajemna) return setSwapWzajemna(null);
        if (swapTarget) return setSwapTarget(null);
        setSwapTyp(null);
      };
      const IKONY_TYPOW = { gielda: Users, oddanie: User, zamiana: ArrowLeftRight };
      const opcjaCls =
        "w-full min-h-[60px] grid grid-cols-[36px_1fr_20px] gap-x-2 items-center text-left border-2 border-[#DEDCD4] hover:border-[#171714] rounded-lg bg-white px-3 py-2.5 disabled:opacity-45 disabled:border-dashed";
      const naglowekKroku = "text-[13px] font-extrabold tracking-[.06em] uppercase text-[#6E6E66] mt-0.5";
      return (
        <div className="border-t-[1.5px] border-[#DEDCD4] mt-1.5 pt-2.5 flex flex-col gap-2">
          <div className="flex gap-1">
            {kroki.map((k, i) => (
              <span
                key={k + i}
                className={`flex-1 text-[11px] font-extrabold text-center pt-1.5 border-t-[3px] ${
                  i < krok
                    ? "border-[#171714] text-[#171714]"
                    : i === krok
                    ? "border-[#DE3A22] text-[#171714]"
                    : "border-[#DEDCD4] text-[#6E6E66]"
                }`}
              >
                {k}
              </span>
            ))}
          </div>
          {krok > 0 && (
            <button onClick={wstecz} className="self-start flex items-center gap-1 text-[15px] font-bold text-[#171714]">
              <ChevronLeft size={18} /> Wróć
            </button>
          )}
          {!swapTyp &&
            TYPY_WYMIANY.map((t) => {
              const Ikona = IKONY_TYPOW[t.key] || ArrowLeftRight;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setSwapTyp(t.key);
                    setSwapTarget(null);
                    setSwapWzajemna(null);
                  }}
                  className={opcjaCls}
                >
                  <span className="row-span-2 w-9 h-9 rounded-lg bg-[#F6F5F1] flex items-center justify-center">
                    <Ikona size={20} />
                  </span>
                  <b className="text-[17px] text-[#171714]">{t.label}</b>
                  <ChevronRight size={20} className="row-span-2 col-start-3 row-start-1 text-[#6E6E66]" />
                  <span className="col-start-2 text-[14px] text-[#6E6E66]">{t.opis}</span>
                </button>
              );
            })}
          {swapTyp && swapTyp !== "gielda" && !swapTarget && (
            <>
              <h3 className={naglowekKroku}>
                {swapTyp === "zamiana" ? "Z kim się zamieniasz?" : "Komu oddajesz?"}
              </h3>
              {kandydaci.length === 0 ? (
                <p className="text-[14px] text-[#6E6E66]">
                  Nikt inny nie może wziąć tej zmiany — brak wolnych osób z tym stanowiskiem.
                </p>
              ) : (
                kandydaci.map((u) => (
                  <button key={u.id} onClick={() => setSwapTarget(u)} className={opcjaCls}>
                    <span className="row-span-2 w-9 h-9 rounded-full bg-[#DEDCD4] flex items-center justify-center text-[12px] font-extrabold text-[#171714]">
                      {u.name.slice(0, 2)}
                    </span>
                    <b className="text-[17px] text-[#171714]">{u.name}</b>
                    <ChevronRight size={20} className="row-span-2 col-start-3 row-start-1 text-[#6E6E66]" />
                    <small className="col-start-2 text-[14px] text-[#6E6E66]">{u.default_stanowisko || ""}</small>
                  </button>
                ))
              )}
            </>
          )}
          {swapTyp === "zamiana" && swapTarget && !swapWzajemna && (
            <>
              <h3 className={naglowekKroku}>Którą zmianę {swapTarget.name} bierzesz?</h3>
              <p className="text-[13px] text-[#6E6E66]">
                {swapTarget.name} dostaje Twoją: {dzienKrotko(s.date)} {trimTime(s.start_time)}–{trimTime(s.end_time)}
              </p>
              {zmianyKandydata.length === 0 ? (
                <p className="text-[14px] text-[#6E6E66]">
                  {swapTarget.name} nie ma zmiany, którą mógłbyś/mogłabyś wziąć — albo masz
                  wtedy własną, albo to nie Twoje stanowisko.
                </p>
              ) : (
                zmianyKandydata.map((p2) => (
                  <button key={p2.id} onClick={() => setSwapWzajemna(p2)} className={opcjaCls}>
                    <span className="row-span-2 flex items-center">{stanowiskoZnak(p2.lokal, p2.stanowisko)}</span>
                    <b className="text-[17px] text-[#171714]">
                      {dzienKrotko(p2.date)} · {trimTime(p2.start_time)}–{trimTime(p2.end_time)}
                    </b>
                    <ChevronRight size={20} className="row-span-2 col-start-3 row-start-1 text-[#6E6E66]" />
                    <small className="col-start-2 text-[14px] text-[#6E6E66]">
                      {p2.stanowisko} · {p2.lokal}
                    </small>
                  </button>
                ))
              )}
            </>
          )}
          {krok === kroki.length - 1 && swapTyp && (
            <>
              <h3 className={naglowekKroku}>Sprawdź i wyślij</h3>
              <div className="flex flex-col gap-2 bg-[#F6F5F1] rounded-lg p-3">
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#6E6E66]">
                    {swapTyp === "zamiana" ? "Oddajesz" : "Twoja zmiana"}
                  </span>
                  <b className="block text-[16px] text-[#171714]">
                    {dzienKrotko(s.date)} · {trimTime(s.start_time)}–{trimTime(s.end_time)}
                  </b>
                </div>
                {swapWzajemna && (
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#6E6E66]">Dostajesz</span>
                    <b className="block text-[16px] text-[#171714]">
                      {dzienKrotko(swapWzajemna.date)} · {trimTime(swapWzajemna.start_time)}–
                      {trimTime(swapWzajemna.end_time)}
                    </b>
                  </div>
                )}
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-[#6E6E66]">
                    {swapTyp === "gielda" ? "Widzą" : swapTyp === "oddanie" ? "Przejmuje" : "Z osobą"}
                  </span>
                  <b className="block text-[16px] text-[#171714]">
                    {swapTyp === "gielda" ? "wszyscy, którzy mogą wziąć tę zmianę" : swapTarget?.name}
                  </b>
                </div>
              </div>
              <button
                onClick={() =>
                  handleOfferSwap(s, { typ: swapTyp, target: swapTarget, wzajemnaShift: swapWzajemna })
                }
                className="w-full min-h-[48px] rounded-lg bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[16px]"
              >
                {swapTyp === "gielda"
                  ? "Wystaw na giełdę"
                  : swapTyp === "oddanie"
                  ? `Oddaj: ${swapTarget.name}`
                  : `Wyślij propozycję do: ${swapTarget.name}`}
              </button>
              <p className="text-[13px] text-[#6E6E66]">Każdą wymianę zatwierdza kierownik.</p>
            </>
          )}
          <button onClick={zamknijKreatorWymiany} className="self-start text-[16px] font-bold underline text-[#6E6E66] py-1.5">
            Anuluj
          </button>
        </div>
      );
    };

    // --- karta mojej zmiany ---
    const renderKarta = (s, inni) => {
      const oferta = activeSwapFor(shiftSwaps, s.id);
      const minela = s.date < dzisYMD;
      const innyLokal = s.lokal !== employee.default_lokal;
      const rozwiniete = !!grafikRozwiniete[s.id];
      const pokazani = rozwiniete ? inni : inni.slice(0, 3);
      return (
        <div
          key={s.id}
          className={`bg-white border-2 rounded-xl px-3 py-2.5 flex flex-col gap-1 ${
            minela ? "opacity-60 border-[#DEDCD4]" : "border-[#171714]"
          } ${innyLokal ? "border-l-[6px] border-l-[#8A5300]" : ""} ${oferta ? "border-dashed" : ""}`}
        >
          <div className="flex items-center gap-2">
            {stanowiskoZnak(s.lokal, s.stanowisko)}
            <b className="flex-1 font-['Archivo'] text-[20px] font-extrabold tabular-nums text-[#171714]">
              {trimTime(s.start_time)}–{trimTime(s.end_time)}
            </b>
            <span className="text-[14px] font-extrabold tabular-nums text-[#6E6E66]">{h1(shiftHours(s))} h</span>
            {!oferta && canOfferSwap(s) && swapConfirmId !== s.id && (
              <button
                onClick={() => setSwapConfirmId(s.id)}
                aria-label="Giełda: oddaj lub zamień"
                className="ml-1 inline-flex items-center gap-1 h-9 px-3 rounded-full border-[1.5px] border-[#DEDCD4] hover:border-[#171714] bg-white text-[14px] font-extrabold text-[#171714]"
              >
                <ArrowLeftRight size={14} /> Giełda
              </button>
            )}
            {/* Brak przycisku wygląda jak awaria, jeśli nie wiadomo dlaczego
                go nie ma — kłódka z podpisem mówi, że minął limit 12 h. */}
            {!oferta && !canOfferSwap(s) && hoursUntilStart(s) > 0 && (
              <span
                className="ml-1 w-[30px] h-[30px] flex items-center justify-center text-[#6E6E66]"
                title={`Mniej niż ${SWAP_MIN_HOURS} h do startu — giełda zamknięta`}
              >
                <Lock size={15} />
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] text-[#6E6E66]">
            {s.stanowisko} · {s.lokal}
            {innyLokal && (
              <span className="inline-flex items-center gap-1 text-[12px] font-extrabold px-1.5 py-0.5 rounded-md bg-[#FDF0D8] text-[#8A5300]">
                <MapPin size={12} /> inny lokal
              </span>
            )}
          </div>
          {inni.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className="text-[12px] font-extrabold uppercase tracking-[.05em] text-[#6E6E66] mr-0.5">Z tobą</span>
              {pokazani.map((o) => (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1 h-7 pl-0.5 pr-2 rounded-full bg-[#F6F5F1] text-[13px] font-bold text-[#171714]"
                >
                  <i className="not-italic w-[22px] h-[22px] rounded-full bg-[#ECEBE6] text-[10px] flex items-center justify-center uppercase">
                    {(o.user_name || "").slice(0, 2)}
                  </i>
                  {o.user_name}
                  <small className="text-[11px] font-bold text-[#6E6E66]">
                    {stanowiskoShort(stanowiskaOptions, o.lokal, o.stanowisko)}
                  </small>
                </span>
              ))}
              {inni.length > 3 && (
                <button
                  onClick={() => setGrafikRozwiniete((p) => ({ ...p, [s.id]: !p[s.id] }))}
                  className="text-[13px] font-bold underline text-[#171714]"
                >
                  {rozwiniete ? "mniej" : `+${inni.length - 3}`}
                </button>
              )}
            </div>
          )}
          {oferta ? (
            <div className="flex items-center gap-2.5 mt-1 rounded-lg px-2.5 py-2 bg-[#E3EEFB] text-[#1D5FA8] text-[13px] font-bold">
              <span className="flex-1">
                <ArrowLeftRight size={14} className="inline -mt-0.5 mr-1" />
                {statusLabelFor(oferta)}
                {oferta.taker_user_name ? ` · przejmuje: ${oferta.taker_user_name}` : ""}
                <small className="block font-medium opacity-85">
                  {oferta.status !== "na_gieldzie"
                    ? "czeka na zgodę kierownika"
                    : oferta.target_user_name
                    ? "czeka na odpowiedź i zgodę kierownika"
                    : "czeka na chętnych i zgodę kierownika"}
                </small>
              </span>
              {oferta.status === "na_gieldzie" && (
                <button
                  onClick={() => handleWithdrawSwap(oferta)}
                  className="min-h-[36px] px-3 rounded-lg border-2 border-[#171714] bg-white text-[14px] font-bold text-[#171714]"
                >
                  Wycofaj
                </button>
              )}
            </div>
          ) : (
            canOfferSwap(s) && swapConfirmId === s.id && renderKreator(s)
          )}
        </div>
      );
    };

    // --- oferta z giełdy w dniu, którego dotyczy ---
    const renderOferta = ({ sw, ps }, mamZmiane) => {
      const typ = typWymiany(sw);
      const wz = wzajemnaZmiana(sw, planShifts);
      return (
        <div key={sw.id} className="mt-2 bg-[#E2F3E9] border-2 border-dashed border-[#1F7A4A] rounded-xl px-3 py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[13px] text-[#1F7A4A]">
            <b>{typ === "zamiana" ? "Propozycja zamiany" : typ === "oddanie" ? "Oddane Tobie" : "Do wzięcia"}</b>
            <span className="ml-auto font-bold text-[#6E6E66]">od: {sw.author_user_name}</span>
          </div>
          <div className="flex items-center gap-2">
            {stanowiskoZnak(ps.lokal, ps.stanowisko)}
            <b className="flex-1 font-['Archivo'] text-[20px] font-extrabold tabular-nums text-[#171714]">
              {trimTime(ps.start_time)}–{trimTime(ps.end_time)}
            </b>
            <span className="text-[14px] font-extrabold tabular-nums text-[#6E6E66]">{h1(shiftHours(ps))} h</span>
          </div>
          <div className="text-[15px] text-[#6E6E66]">
            {ps.stanowisko} · {ps.lokal}
          </div>
          {/* Przy zamianie druga połowa jest równie ważna co pierwsza — bez niej
              widać tylko, co się dostaje. */}
          {typ === "zamiana" && (
            <div className="text-[14px] border-t border-[#1F7A4A]/30 pt-1.5">
              {wz ? (
                <>
                  <b>Oddajesz swoją: </b>
                  {dzienKrotko(wz.date)} · {trimTime(wz.start_time)}–{trimTime(wz.end_time)} · {wz.stanowisko}
                </>
              ) : (
                <b className="text-[#8A5300]">Zmiana, którą miałbyś/miałabyś oddać, już nie istnieje.</b>
              )}
            </div>
          )}
          {sw.note && <div className="text-[14px] text-[#6E6E66]">{sw.note}</div>}
          {mamZmiane && typ !== "zamiana" && (
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#8A5300]">
              <Clock size={14} /> Masz już zmianę tego dnia — kierownik zobaczy konflikt
            </div>
          )}
          <button
            onClick={() => handleAcceptSwap(sw)}
            disabled={typ === "zamiana" && !wz}
            className="mt-1 w-full min-h-[48px] rounded-lg bg-[#1F7A4A] text-white font-['Archivo'] font-extrabold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Check size={18} strokeWidth={2.5} />
            {typ === "zamiana" ? "Zgadzam się na zamianę" : "Wezmę tę zmianę"}
          </button>
        </div>
      );
    };

    // --- widok tygodnia ---
    const renderTydzien = () => {
      const elementy = [];
      let wolneCiag = [];
      const zamknijWolne = () => {
        if (!wolneCiag.length) return;
        const a = wolneCiag[0];
        const b = wolneCiag[wolneCiag.length - 1];
        const maDzis = wolneCiag.includes(dzisYMD);
        elementy.push(
          <div
            key={`w-${a}`}
            className="flex justify-between items-center px-3.5 py-2.5 border-[1.5px] border-dashed border-[#DEDCD4] rounded-lg text-[14px] text-[#6E6E66] md:col-span-3"
          >
            <b className="text-[#171714] font-bold">
              {wolneCiag.length === 1 ? dzienKrotko(a) : `${dzienKrotko(a)} – ${dzienKrotko(b)}`}
            </b>
            <span>
              wolne{maDzis && <em className="not-italic font-extrabold text-[#DE3A22]"> · dziś</em>}
            </span>
          </div>
        );
        wolneCiag = [];
      };
      dniTygodnia.forEach((d) => {
        const moje = mojGrafik.filter((s) => s.date === d);
        const oferty = ofertyWDniu(d);
        const przejete = mojePrzejete.filter(({ ps }) => ps.date === d);
        const wolne = wolneNa(d);
        const lokalDnia = moje[0]?.lokal || effectiveAssignment.lokal;
        const wszyscyDnia = publishedShiftsOnDay(planShifts, lokalDnia, d);
        // Wydarzenia (0.74.0): „Ja” — moje i całego lokalu w dniu, w którym
        // tam pracuję; „Cały lokal” — wszystkie lokalu dnia. Dzień z
        // wydarzeniem bez zmiany NIE zwija się do „wolne”.
        const wydJa = wydarzeniaPracownikaNaDzien({ wydarzenia, uczestnicy: wydarzeniaUczestnicy, user: employee, planShifts, data: d });
        const wydLokalu = wydarzeniaNaDzien(wydarzenia, lokalDnia, d);
        const kartaWyd = (w, wCalymLokalu) => {
          const uczestnik = jestUczestnikiem(wydarzeniaUczestnicy, w.id, employee);
          return (
            <KartaWydarzenia
              key={`wyd-${w.id}`}
              w={w}
              dlaCiebie={uczestnik}
              wyszarzone={wCalymLokalu && !uczestnik}
              oznaczDlaCiebie={wCalymLokalu && uczestnik}
              wCzasieZmiany={uczestnik && wCzasieZmiany(w, employee, planShifts)}
            />
          );
        };
        if (!grafikWszyscy && !moje.length && !oferty.length && !przejete.length && !wolne && !wydJa.length) {
          wolneCiag.push(d);
          return;
        }
        zamknijWolne();
        const inni = wszyscyDnia.filter((s) => !moje.some((m) => String(m.id) === String(s.id)));
        elementy.push(
          <div key={d} id={`grafik-dzien-${d}`} className="min-w-0">
            <div className="flex items-center gap-2 mx-0.5 mt-1 mb-1.5">
              <b className="text-[16px] text-[#171714] first-letter:uppercase">{dzienKrotko(d)}</b>
              {d === dzisYMD && (
                <span className="text-[12px] font-extrabold px-2 py-0.5 rounded-full bg-[#DE3A22] text-white">dziś</span>
              )}
              {d === addDaysYMD(dzisYMD, 1) && <span className="text-[13px] text-[#6E6E66]">jutro</span>}
              {!grafikWszyscy && !moje.length && wydJa.length > 0 && <span className="text-[13px] text-[#6E6E66]">bez zmiany</span>}
            </div>
            {grafikWszyscy && wydLokalu.length > 0 && (
              <div className="flex flex-col gap-2 mb-2">{wydLokalu.map((w) => kartaWyd(w, true))}</div>
            )}
            {grafikWszyscy ? (
              <div className="bg-white border-2 border-[#DEDCD4] rounded-xl">
                {wszyscyDnia.length === 0 ? (
                  <div className="px-3 py-2 text-[14px] text-[#6E6E66]">Nikt nie ma zmiany w {lokalDnia}.</div>
                ) : (
                  wszyscyDnia
                    .slice()
                    .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)))
                    .map((o, i) => {
                      const ja = moje.some((m) => String(m.id) === String(o.id));
                      return (
                        <div
                          key={o.id}
                          className={`grid grid-cols-[auto_1fr_auto] gap-2 items-center px-3 py-2 text-[14px] tabular-nums ${
                            i ? "border-t-[1.5px] border-[#DEDCD4]" : ""
                          } ${ja ? "bg-[#FFF3EF]" : ""}`}
                        >
                          {stanowiskoZnak(o.lokal, o.stanowisko)}
                          <b className="text-[#171714] truncate">
                            {o.user_name}
                            {ja ? " (ty)" : ""}
                          </b>
                          <span className="text-[#6E6E66]">
                            {trimTime(o.start_time)}–{trimTime(o.end_time)}
                          </span>
                        </div>
                      );
                    })
                )}
              </div>
            ) : (
              <>
                {(moje.length > 0 || wydJa.length > 0) && (
                  <div className="flex flex-col gap-2">
                    {[
                      ...moje.map((s) => ({ t: trimTime(s.start_time), el: <React.Fragment key={`z-${s.id}`}>{renderKarta(s, inni)}</React.Fragment> })),
                      ...wydJa.map((w) => ({ t: calyDzien(w) ? "00:00" : trimTime(w.godz_od), el: kartaWyd(w, false) })),
                    ]
                      .sort((a, b) => a.t.localeCompare(b.t))
                      .map((x) => x.el)}
                  </div>
                )}
                {!moje.length && wolne && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 border-2 border-[#DEDCD4] rounded-lg bg-white text-[15px] text-[#6E6E66]">
                    <Palmtree size={16} />
                    {wolne.type === "urlop" ? "Urlop" : "Zgłoszona niedostępność"}
                  </div>
                )}
                {!moje.length && !wolne && !przejete.length && !wydJa.length && (
                  <div className="px-3.5 py-2.5 border-[1.5px] border-[#DEDCD4] rounded-lg text-[14px] text-[#6E6E66]">wolne</div>
                )}
                {przejete.map(({ sw, ps }) => (
                  <div
                    key={`p-${sw.id}`}
                    className="mt-2 flex items-center gap-2.5 bg-[#E2F3E9] border-2 border-[#1F7A4A] rounded-xl px-3 py-2.5 text-[14px] text-[#1F7A4A]"
                  >
                    <Check size={18} strokeWidth={2.5} className="flex-shrink-0" />
                    <span className="flex-1 text-[#171714]">
                      <b>Zgłosiłeś(-aś) się do tej zmiany</b>
                      <br />
                      {trimTime(ps.start_time)}–{trimTime(ps.end_time)} · {ps.stanowisko} · od:{" "}
                      {sw.author_user_name} · czeka na zgodę kierownika
                    </span>
                  </div>
                ))}
                {oferty.map((o) => renderOferta(o, moje.length > 0))}
              </>
            )}
          </div>
        );
      });
      zamknijWolne();
      return elementy;
    };

    // --- widok miesiąca ---
    const renderMiesiac = () => {
      const rok = miesiacData.getFullYear();
      const mies = miesiacData.getMonth() + 1;
      const moje = mojGrafik.filter((s) => s.date.startsWith(miesiacPrefix));
      const godz = godzinyMiesiaca(rok, mies);
      const norma = etat ? normaMiesiaca(employee, rok, mies) : null;
      const pierwszy = (miesiacData.getDay() + 6) % 7;
      const dni = new Date(rok, mies, 0).getDate();
      const wybrany =
        grafikDzienMiesiaca && grafikDzienMiesiaca.startsWith(miesiacPrefix)
          ? grafikDzienMiesiaca
          : miesiacOffset === 0
          ? dzisYMD
          : `${miesiacPrefix}-01`;
      const wybraneZmiany = moje.filter((s) => s.date === wybrany);
      const kafelCls = "bg-white border-2 border-[#DEDCD4] rounded-lg px-2.5 py-2";
      return (
        <>
          {norma != null ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className={kafelCls}>
                  <b className="block text-[17px] tabular-nums">{moje.length}</b>
                  <span className="text-[12px] text-[#6E6E66]">{odmianaZmian(moje.length)}</span>
                </div>
                <div className={kafelCls}>
                  <b className="block text-[17px] tabular-nums">{h1(godz)} h</b>
                  <span className="text-[12px] text-[#6E6E66]">z normy {h1(norma)} h · etat</span>
                </div>
                <div className={kafelCls}>
                  <b className={`block text-[17px] tabular-nums ${godz > norma ? "text-[#8A5300]" : ""}`}>
                    {godz >= norma ? `+${h1(godz - norma)}` : h1(norma - godz)} h
                  </b>
                  <span className="text-[12px] text-[#6E6E66]">{godz >= norma ? "ponad normą" : "do normy"}</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-[#DEDCD4] overflow-hidden mb-3.5">
                <i
                  className={`block h-full ${godz > norma ? "bg-[#8A5300]" : "bg-[#171714]"}`}
                  style={{ width: `${Math.min(100, (godz / norma) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="grid grid-cols-[1fr_2fr] gap-2 mb-3.5">
              <div className={kafelCls}>
                <b className="block text-[17px] tabular-nums">{moje.length}</b>
                <span className="text-[12px] text-[#6E6E66]">{odmianaZmian(moje.length)}</span>
              </div>
              <div className={kafelCls}>
                <b className="block text-[17px] tabular-nums">{h1(godz)} h</b>
                <span className="text-[12px] text-[#6E6E66]">
                  {umowaOpis === "zlecenie" ? "umowa zlecenie · bez normy" : "w miesiącu"}
                </span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-7 gap-1">
            {["pn", "wt", "śr", "czw", "pt", "sob", "nd"].map((d) => (
              <b key={d} className="text-[11px] text-center uppercase text-[#6E6E66]">
                {d}
              </b>
            ))}
            {Array.from({ length: pierwszy }).map((_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: dni }).map((_, i) => {
              const ymd = `${miesiacPrefix}-${String(i + 1).padStart(2, "0")}`;
              const z = moje.filter((s) => s.date === ymd);
              const godzDnia = z.reduce((a, s) => a + shiftHours(s), 0);
              const inny = z.some((s) => s.lokal !== employee.default_lokal);
              // Urlop i zgłoszona niedostępność (zatwierdzone) — dzień, w którym
              // tej osoby nie ma, ma to mówić sam, bez klikania (0.62.1). Urlop
              // na niebiesko (jak „wolne” w panelu kierownika), niedostępność
              // kreskowana; zmiana w grafiku ma pierwszeństwo.
              const nieobecnosc = z.length ? null : wolneNa(ymd);
              const tloNieobecnosci =
                nieobecnosc?.type === "urlop"
                  ? "bg-[#E3EEFB] border-[#1D5FA8] text-[#1D5FA8]"
                  : nieobecnosc
                  ? "border-[#6E6E66] text-[#6E6E66] bg-[repeating-linear-gradient(135deg,#ECEBE6_0_4px,#fff_4px_8px)]"
                  : "";
              return (
                <button
                  key={ymd}
                  onClick={() => setGrafikDzienMiesiaca(ymd)}
                  title={nieobecnosc ? (nieobecnosc.type === "urlop" ? "Urlop" : "Niedostępność") : undefined}
                  className={`relative aspect-[1/1.05] rounded-lg border-[1.5px] flex flex-col items-center justify-center tabular-nums ${
                    z.length
                      ? inny
                        ? "bg-[#8A5300] border-[#8A5300] text-white"
                        : "bg-[#171714] border-[#171714] text-white"
                      : nieobecnosc
                      ? tloNieobecnosci
                      : "bg-white border-[#DEDCD4] text-[#171714]"
                  } ${ymd < dzisYMD ? "opacity-45" : ""} ${
                    ymd === dzisYMD ? "outline outline-[3px] outline-offset-1 outline-[#DE3A22]" : ""
                  } ${ymd === wybrany ? "shadow-[0_0_0_3px_#fff,0_0_0_5px_#171714]" : ""}`}
                >
                  {wydarzeniaPracownikaNaDzien({ wydarzenia, uczestnicy: wydarzeniaUczestnicy, user: employee, planShifts, data: ymd }).length > 0 && (
                    <i className={`absolute top-1 left-1 w-[6px] h-[6px] rotate-45 ${z.length ? "bg-white" : "bg-[#171714]"}`} />
                  )}
                  <em className="not-italic font-extrabold text-[14px]">{i + 1}</em>
                  {z.length > 0 && <small className="text-[10px] font-extrabold">{h1(godzDnia)}</small>}
                  {nieobecnosc && (
                    <small className="text-[9px] font-extrabold uppercase leading-none mt-px">
                      {nieobecnosc.type === "urlop" ? "urlop" : "niedost."}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-[12px] text-[#6E6E66] mt-2 mb-3.5">
            <span className="flex items-center gap-1">
              <i className="w-3 h-3 rounded-[3px] bg-[#171714]" /> twoja zmiana
            </span>
            <span className="flex items-center gap-1">
              <i className="w-3 h-3 rounded-[3px] bg-[#8A5300]" /> inny lokal
            </span>
            <span className="flex items-center gap-1">
              <i className="w-3 h-3 rounded-[3px] bg-[#E3EEFB] border border-[#1D5FA8]" /> urlop
            </span>
            <span className="flex items-center gap-1">
              <i className="w-3 h-3 rounded-[3px] border border-[#6E6E66] bg-[repeating-linear-gradient(135deg,#ECEBE6_0_2px,#fff_2px_4px)]" />{" "}
              niedostępność
            </span>
            <span className="flex items-center gap-1">
              <i className="w-3 h-3 rounded-[3px] border-2 border-[#DE3A22]" /> dziś
            </span>
          </div>
          <div className="bg-white border-2 border-[#171714] rounded-xl px-3.5 py-3 flex flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E6E66]">{dzienKrotko(wybrany)}</span>
            {wybraneZmiany.length ? (
              <>
                {wybraneZmiany.map((s) => (
                  <div key={s.id}>
                    <b className="block text-[18px] tabular-nums text-[#171714]">
                      {trimTime(s.start_time)}–{trimTime(s.end_time)} · {h1(shiftHours(s))} h
                    </b>
                    <span className="text-[14px] text-[#6E6E66]">
                      {s.stanowisko} · {s.lokal}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const pn = mondayOf(wybrany);
                    const roznica = Math.round(
                      (new Date(pn + "T00:00:00") - new Date(mondayOf(dzisYMD) + "T00:00:00")) / (7 * 86400000)
                    );
                    setTydzienOffset(roznica);
                    setGrafikWidok("tydzien");
                  }}
                  className="self-start mt-1.5 text-[14px] font-bold underline text-[#171714]"
                >
                  Zobacz w tygodniu, z kim pracujesz
                </button>
              </>
            ) : (
              <b className="text-[18px] text-[#171714]">{wolneNa(wybrany) ? (wolneNa(wybrany).type === "urlop" ? "Urlop" : "Niedostępność") : "Wolne"}</b>
            )}
            {wydarzeniaPracownikaNaDzien({ wydarzenia, uczestnicy: wydarzeniaUczestnicy, user: employee, planShifts, data: wybrany }).map((w) => (
              <div key={w.id} className="mt-2">
                <KartaWydarzenia
                  w={w}
                  dlaCiebie={jestUczestnikiem(wydarzeniaUczestnicy, w.id, employee)}
                  wCzasieZmiany={wCzasieZmiany(w, employee, planShifts)}
                />
              </div>
            ))}
          </div>
          {moje.length === 0 && miesiacPrefix > dzisYMD.slice(0, 7) && (
            <p className="text-[14px] text-[#6E6E66] mt-3">Kierownik nie wysłał jeszcze grafiku na ten miesiąc.</p>
          )}
        </>
      );
    };

    const godzTygodnia = mojGrafik
      .filter((s) => s.date >= dniTygodnia[0] && s.date <= dniTygodnia[6])
      .reduce((a, s) => a + shiftHours(s), 0);
    const czwartek = new Date(dniTygodnia[3] + "T00:00:00");
    const godzMies = godzinyMiesiaca(czwartek.getFullYear(), czwartek.getMonth() + 1);
    const normaMies = etat ? normaMiesiaca(employee, czwartek.getFullYear(), czwartek.getMonth() + 1) : null;
    const ofertyTygodnia = mojeOferty.filter(({ ps }) => ps && ps.date >= dniTygodnia[0] && ps.date <= dniTygodnia[6]);
    const przewinDo = (d) => {
      const el = document.getElementById(`grafik-dzien-${d}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const segCls = (on) =>
      `flex-1 min-h-[40px] px-3 rounded-full text-[14px] font-bold ${
        on ? "bg-[#171714] text-white" : "text-[#171714]"
      }`;
    const strzalkaCls =
      "w-9 h-9 md:w-10 md:h-10 flex-shrink-0 rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center text-[#171714] disabled:opacity-35";
    const zakresCls = (on) =>
      `min-h-[34px] md:min-h-[40px] px-2.5 md:px-3 rounded-full text-[13px] md:text-[14px] font-bold whitespace-nowrap ${
        on ? "bg-[#171714] text-white" : "text-[#171714]"
      }`;

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
        nowyWyglad
      >
        <div className="md:max-w-[1000px] w-full">
          <div className="flex p-1 rounded-full bg-white border-2 border-[#DEDCD4] mb-3">
            {[
              { key: "tydzien", label: "Tydzień" },
              { key: "miesiac", label: "Miesiąc" },
            ].map((o) => (
              <button key={o.key} onClick={() => setGrafikWidok(o.key)} className={segCls(grafikWidok === o.key)}>
                {o.label}
              </button>
            ))}
          </div>
          {/* Strzałki zamiast sztywnego "ten / następny": bez nich horyzont
              kończy się na 14 dniach, a zmiany, której nie widać, nie da się
              wystawić na giełdę. "Dziś" pokazuje się dopiero, gdy jest po co
              wracać. */}
          {/* ⚠️ JEDEN wiersz, bez zawijania (0.62.2): na telefonie „Ja / Cały
              lokal” spadało raz do nowej linii, raz nie — i wszystko skakało.
              Na widoku miesiąca przełącznik jest niewidoczny, ale zajmuje
              miejsce, więc strzałki stoją tam samo w obu widokach. */}
          <div className="flex items-center gap-1 min-[360px]:gap-1.5 md:gap-2 mb-2.5">
            <button
              onClick={() =>
                grafikWidok === "miesiac" ? setMiesiacOffset((v) => v - 1) : setTydzienOffset((v) => v - 1)
              }
              disabled={!mozeWstecz}
              aria-label="Wcześniej"
              className={strzalkaCls}
            >
              <ChevronLeft size={20} />
            </button>
            {/* Stała szerokość — strzałki stoją zawsze w tym samym miejscu,
                niezależnie od długości „28 wrz – 4 paź” czy „Październik”.
                Dotknięcie napisu wraca na dziś (prośba właściciela, 0.62.1) —
                osobny przycisk „Dziś” pojawiał się i znikał, przesuwając
                strzałki. Poza bieżącym okresem napis jest podkreślony. */}
            <button
              onClick={() => {
                setTydzienOffset(0);
                setMiesiacOffset(0);
                setGrafikDzienMiesiaca(null);
              }}
              title="Wróć do dziś"
              data-okres-grafiku
              className={`w-[104px] min-[360px]:w-[120px] md:w-[168px] h-9 md:h-10 flex-shrink-0 text-center font-['Archivo'] text-[13px] min-[360px]:text-[14px] md:text-[16px] font-extrabold text-[#171714] whitespace-nowrap rounded-lg ${
                (grafikWidok === "miesiac" ? miesiacOffset : tydzienOffset) !== 0
                  ? "underline decoration-dotted underline-offset-4"
                  : ""
              }`}
            >
              {etykietaZakresu}
            </button>
            <button
              onClick={() =>
                grafikWidok === "miesiac" ? setMiesiacOffset((v) => v + 1) : setTydzienOffset((v) => v + 1)
              }
              aria-label="Później"
              className={strzalkaCls}
            >
              <ChevronRight size={20} />
            </button>
            <span className="flex-1 min-w-0" />
            <div
              className={`flex flex-shrink-0 p-0.5 rounded-full bg-white border-2 border-[#DEDCD4] ${
                grafikWidok === "tydzien" ? "" : "invisible"
              }`}
              aria-hidden={grafikWidok !== "tydzien"}
            >
              <button onClick={() => setGrafikWszyscy(false)} className={zakresCls(!grafikWszyscy)} tabIndex={grafikWidok === "tydzien" ? 0 : -1}>
                Ja
              </button>
              <button onClick={() => setGrafikWszyscy(true)} className={zakresCls(grafikWszyscy)} tabIndex={grafikWidok === "tydzien" ? 0 : -1}>
                {/* Najwęższe telefony (poniżej 360 px): „Lokal”, inaczej wiersz
                    się nie mieści. */}
                <span className="min-[360px]:hidden">Lokal</span>
                <span className="max-[359px]:hidden">Cały lokal</span>
              </button>
            </div>
          </div>

          {grafikWidok === "miesiac" ? (
            renderMiesiac()
          ) : (
            <>
              <div className="flex items-center gap-2.5 flex-wrap text-[13px] text-[#6E6E66] mx-0.5 mb-2.5">
                <span>
                  <b className="text-[#171714] tabular-nums">{h1(godzTygodnia)} h</b> w tygodniu
                </span>
                <span className={`hidden sm:inline ${normaMies != null && godzMies > normaMies ? "text-[#8A5300] font-extrabold" : ""}`}>
                  {getMonthName(czwartek.getMonth()).toLowerCase()}{" "}
                  <b className={normaMies != null && godzMies > normaMies ? "" : "text-[#171714]"}>
                    {normaMies != null ? `${h1(godzMies)}/${h1(normaMies)} h` : `${h1(godzMies)} h`}
                  </b>
                  {normaMies != null ? ` · ${opisNormy(godzMies, normaMies)}` : umowaOpis ? ` · ${umowaOpis}` : ""}
                </span>
                {ofertyTygodnia.length > 0 ? (
                  <button
                    onClick={() => przewinDo(ofertyTygodnia[0].ps.date)}
                    className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#E2F3E9] text-[#1F7A4A] text-[12px] font-extrabold"
                  >
                    <ArrowLeftRight size={14} /> {ofertyTygodnia.length} do wzięcia
                  </button>
                ) : mojeOferty.length > 0 ? (
                  // Oferty są tylko w swoim dniu — gdy żadna nie wypada w tym
                  // tygodniu, chip prowadzi do tygodnia najbliższej.
                  <button
                    onClick={() => {
                      const pierwsza = mojeOferty
                        .map(({ ps }) => ps && ps.date)
                        .filter(Boolean)
                        .sort()[0];
                      if (!pierwsza) return;
                      setTydzienOffset(
                        Math.round(
                          (new Date(mondayOf(pierwsza) + "T00:00:00") - new Date(mondayOf(dzisYMD) + "T00:00:00")) /
                            (7 * 86400000)
                        )
                      );
                    }}
                    className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#E2F3E9] text-[#1F7A4A] text-[12px] font-extrabold"
                  >
                    <ArrowLeftRight size={14} /> {mojeOferty.length} do wzięcia · inny tydzień
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-7 gap-1 mb-3.5">
                {dniTygodnia.map((d) => {
                  const z = mojGrafik.filter((s) => s.date === d);
                  const inny = z.some((s) => s.lokal !== employee.default_lokal);
                  const oferta = ofertyWDniu(d).length > 0;
                  const dt = new Date(d + "T00:00:00");
                  return (
                    <button
                      key={d}
                      onClick={() => przewinDo(d)}
                      className={`relative flex flex-col items-center pt-1 pb-1.5 rounded-lg border-2 bg-white ${
                        d === dzisYMD ? "border-[#DE3A22]" : z.length ? "border-[#171714]" : "border-[#DEDCD4]"
                      }`}
                    >
                      <small className="text-[11px] font-bold text-[#6E6E66]">{DN[dt.getDay()]}</small>
                      <b className="text-[16px] text-[#171714]">{dt.getDate()}</b>
                      <i className={`w-4 h-1 rounded-sm mt-0.5 ${z.length ? (inny ? "bg-[#8A5300]" : "bg-[#171714]") : ""}`} />
                      {oferta && <i className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#1F7A4A]" />}
                      {wydarzeniaPracownikaNaDzien({ wydarzenia, uczestnicy: wydarzeniaUczestnicy, user: employee, planShifts, data: d }).length > 0 && (
                        <i className="absolute top-1.5 left-1.5 w-[7px] h-[7px] rotate-45 bg-[#171714]" data-romb-wydarzenia />
                      )}
                    </button>
                  );
                })}
              </div>
              {tydzienBezGrafiku && tydzienOffset > 0 && (
                <div className="mb-3 rounded-lg border-2 border-[#DEDCD4] bg-white p-3 text-[14px] text-[#6E6E66] leading-relaxed">
                  Grafik na ten tydzień nie został jeszcze wysłany. Dni niżej będą
                  pokazywać się jako wolne, dopóki kierownik go nie opublikuje.
                </div>
              )}
              {/* Na tablecie dni w trzech kolumnach; zwinięte wolne dni zajmują
                  cały wiersz. */}
              <div className="flex flex-col gap-2.5 md:grid md:grid-cols-3 md:gap-3 md:items-start">
                {renderTydzien()}
              </div>
              {mojGrafik.length === 0 && (
                <p className="text-[14px] text-[#6E6E66] leading-relaxed mt-3">
                  Kierownik nie wysłał jeszcze grafiku na ten okres. Gdy to zrobi,
                  dostaniesz powiadomienie.
                </p>
              )}
              <button
                onClick={openWniosekOWolne}
                className="w-full mt-4 grid grid-cols-[24px_1fr_20px] gap-2.5 items-center text-left px-3.5 py-3 border-2 border-[#171714] rounded-xl bg-white"
              >
                <Flag size={20} />
                <span>
                  <b className="text-[16px] text-[#171714]">Wniosek o wolne</b>
                  <small className="block text-[13px] text-[#6E6E66]">urlop lub niedostępność · trafia do kierownika</small>
                </span>
                <ChevronRight size={20} className="text-[#6E6E66]" />
              </button>
              <p className="text-[13px] text-[#6E6E66] mt-2.5 mx-0.5">
                Zmianę można wystawić na giełdę najpóźniej {SWAP_MIN_HOURS} godzin przed
                rozpoczęciem. Każdą wymianę zatwierdza kierownik.
              </p>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: RAPORT — układ z makiety właściciela (0.61.0, EmployeeReportMobile
  // / EmployeeReportTablet). Podsumowanie miesiąca stoi NA GÓRZE (zamiast
  // stopki), zależnie od umowy; lista zmian tygodniami z sumą tygodnia, flaga
  // korekty 48 px przy każdej zmianie, na końcu „Jeszcze w grafiku”.
  // ==========================================
  if (screen === "RAPORT") {
    const h1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1).replace(".", ",");
    const DNI = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
    const MIES_D = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca",
      "sierpnia", "września", "października", "listopada", "grudnia"];
    const dzis = new Date();
    const biezacyMies = raportYear === dzis.getFullYear() && raportMonth === dzis.getMonth();
    const zamkniety = raportYear < dzis.getFullYear() ||
      (raportYear === dzis.getFullYear() && raportMonth < dzis.getMonth());
    const najwczesniejszyRok = Math.min(...getAvailableYears());
    const mozeWstecz = raportYear > najwczesniejszyRok || raportMonth > 0;
    const mozeDalej = !biezacyMies && !(raportYear > dzis.getFullYear());
    const przesunMiesiac = (o) => {
      const d = new Date(raportYear, raportMonth + o, 1);
      setRaportMonth(d.getMonth());
      setRaportYear(d.getFullYear());
    };
    const umowa = typUmowy(employee);
    const etat = naEtacie(employee);
    const norma = etat ? normaMiesiaca(employee, raportYear, raportMonth + 1) : null;
    // ⚠️ Zamknięty miesiąc bez ANI JEDNEJ zmiany nie dostaje normy — ta sama
    // zasada co w podsumowanieMiesiaca (utils/umowy.ts): „do normy zabrakło
    // 176 h” za miesiąc, w którym systemu jeszcze nie było, to alarm o niczym.
    const pokazNorme = norma != null && (biezacyMies || raportTotal > 0);
    // Prognoza „z grafikiem” — fakt do wczoraj + grafik od dziś (to samo
    // rozbicie, którym liczy podsumowanieMiesiaca), tylko w trwającym miesiącu.
    const prognoza = raportRozbicie.biezacy ? raportRozbicie.fakt + raportRozbicie.plan : null;
    const zGrafiku = prognoza != null && raportRozbicie.plan > 0.05;
    const doPlanu = zGrafiku ? Math.max(0, prognoza - raportTotal) : 0;

    // Korekta wysłana do tej zmiany — czeka albo rozpatrzona.
    const korektaZmiany = (s) =>
      (issues || [])
        .filter((i) => i.type === "correction" && String(i.shift_id) === String(s.id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;

    const renderPodsumowanie = () => {
      const roznica = pokazNorme ? Math.round((raportTotal - norma) * 10) / 10 : 0;
      const skala = pokazNorme ? Math.max(raportTotal + doPlanu, norma) * 1.04 : 1;
      const wszystko = raportTotal + doPlanu;
      const procentGrafiku = wszystko > 0 ? (raportTotal / wszystko) * 100 : 100;
      const faktCls = "flex justify-between items-baseline gap-2.5 pt-2 border-t border-[#DEDCD4]";
      return (
        <section className="bg-white border-2 border-[#171714] rounded-xl px-4 pt-3.5 pb-3 mb-2.5">
          <div className="flex justify-between items-end gap-2.5">
            <div>
              <span className="block text-[13px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66]">
                {zamkniety ? "Przepracowane · zamknięty miesiąc" : "Przepracowane do dziś"}
              </span>
              <b className="block font-['Archivo'] text-[40px] leading-[44px] font-extrabold tabular-nums tracking-[-.01em] text-[#171714]">
                {h1(raportTotal)}
                <small className="text-[20px] font-extrabold"> godz.</small>
              </b>
            </div>
            <div className="text-right pb-1">
              <b className="block text-[24px] font-extrabold text-[#171714]">
                {raportShifts.filter((s) => !s.is_urlop).length}
              </b>
              <span className="text-[13px] text-[#6E6E66]">zmian</span>
            </div>
          </div>
          {pokazNorme ? (
            <>
              <div className="relative h-3.5 bg-[#DEDCD4] rounded-full mt-3.5 mb-[30px]">
                <i
                  className="absolute inset-y-0 left-0 bg-[#171714] rounded-l-full"
                  style={{ width: `${(Math.min(raportTotal, norma) / skala) * 100}%` }}
                />
                {roznica > 0 && (
                  <i
                    className="absolute inset-y-0 bg-[#8A5300]"
                    style={{ left: `${(norma / skala) * 100}%`, width: `${(roznica / skala) * 100}%` }}
                  />
                )}
                {doPlanu > 0 && (
                  <i
                    className="absolute inset-y-0 opacity-55 rounded-r-full"
                    style={{
                      left: `${(raportTotal / skala) * 100}%`,
                      width: `${(doPlanu / skala) * 100}%`,
                      background: "repeating-linear-gradient(135deg,#6E6E66 0 3px,transparent 3px 7px)",
                    }}
                  />
                )}
                <em
                  className="absolute -top-[5px] -bottom-[5px] w-[3px] -ml-[1.5px] bg-[#DE3A22] not-italic"
                  style={{ left: `${(norma / skala) * 100}%` }}
                >
                  {/* Podpis przy krawędzi paska wyrównany do kreski, żeby nie
                      wychodził poza kartę (norma blisko prawego końca). */}
                  <span
                    className={`absolute top-[26px] whitespace-nowrap text-[13px] font-bold text-[#DE3A22] ${
                      norma / skala > 0.75
                        ? "right-0"
                        : norma / skala < 0.25
                        ? "left-0"
                        : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    norma {h1(norma).replace(",0", "")} h
                  </span>
                </em>
              </div>
              <div className="grid gap-2 mt-3">
                <div className={faktCls}>
                  <span className="text-[15px] text-[#6E6E66]">
                    {roznica > 0
                      ? `Ponad normą ${h1(norma).replace(",0", "")} h`
                      : roznica < 0
                      ? `Do normy ${h1(norma).replace(",0", "")} h brakuje`
                      : "Dokładnie w normie"}
                  </span>
                  <b className={`text-[18px] font-extrabold whitespace-nowrap ${roznica > 0 ? "text-[#8A5300]" : "text-[#171714]"}`}>
                    {roznica > 0 ? `+${h1(roznica)}` : h1(Math.abs(roznica))} h
                  </b>
                </div>
                {zGrafiku && (
                  <div className={faktCls}>
                    <span className="text-[15px] text-[#6E6E66]">Z grafikiem wyjdzie {h1(prognoza)} h</span>
                    <b
                      className={`text-[18px] font-extrabold whitespace-nowrap ${
                        prognoza - norma > 0.05 ? "text-[#8A5300]" : "text-[#171714]"
                      }`}
                    >
                      {prognoza - norma > 0.05
                        ? `+${h1(prognoza - norma)} h`
                        : prognoza - norma < -0.05
                        ? `−${h1(norma - prognoza)} h`
                        : "±0 h"}
                    </b>
                  </div>
                )}
                {raportUrlop > 0 && (
                  <div className={faktCls}>
                    <span className="text-[15px] text-[#6E6E66]">W tym urlop</span>
                    <b className="text-[18px] font-extrabold whitespace-nowrap text-[#171714]">{h1(raportUrlop)} h</b>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Bez normy: ile grafiku już przepracowano. Pasek tylko w
                  trwającym miesiącu i gdy grafik ma coś jeszcze — inaczej
                  „100% grafiku” nic nie mówi. */}
              {zGrafiku && (
                <>
                  <div className="relative h-3.5 bg-[#DEDCD4] rounded-full mt-3.5 mb-1.5 overflow-hidden">
                    <i className="absolute inset-y-0 left-0 bg-[#171714]" style={{ width: `${procentGrafiku}%` }} />
                    <i
                      className="absolute inset-y-0 opacity-55"
                      style={{
                        left: `${procentGrafiku}%`,
                        right: 0,
                        background: "repeating-linear-gradient(135deg,#6E6E66 0 3px,transparent 3px 7px)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[14px] font-bold text-[#6E6E66] tabular-nums">
                    <span>{Math.round(procentGrafiku)}% grafiku</span>
                    <span>
                      {h1(raportTotal)} z {h1(wszystko)} h
                    </span>
                  </div>
                </>
              )}
              {(umowa || zGrafiku || raportUrlop > 0 || raportShifts.length > 0) && (
                <div className="grid gap-2 mt-3">
                  {umowa && (
                    <div className={faktCls}>
                      <span className="text-[15px] text-[#6E6E66]">{typUmowyLabel(umowa)}</span>
                      <b className="text-[18px] font-extrabold whitespace-nowrap text-[#171714]">bez normy</b>
                    </div>
                  )}
                  {zGrafiku ? (
                    <div className={faktCls}>
                      <span className="text-[15px] text-[#6E6E66]">
                        W grafiku jeszcze {h1(doPlanu)} h · razem
                      </span>
                      <b className="text-[18px] font-extrabold whitespace-nowrap text-[#171714]">{h1(wszystko)} h</b>
                    </div>
                  ) : (
                    raportShifts.filter((s) => !s.is_urlop && s.end_time).length > 0 && (
                      <div className={faktCls}>
                        <span className="text-[15px] text-[#6E6E66]">Średnio na zmianę</span>
                        <b className="text-[18px] font-extrabold whitespace-nowrap text-[#171714]">
                          {h1(
                            (raportTotal - raportUrlop) /
                              raportShifts.filter((s) => !s.is_urlop && s.end_time).length
                          )}{" "}
                          h
                        </b>
                      </div>
                    )
                  )}
                  {raportUrlop > 0 && (
                    <div className={faktCls}>
                      <span className="text-[15px] text-[#6E6E66]">W tym urlop</span>
                      <b className="text-[18px] font-extrabold whitespace-nowrap text-[#171714]">{h1(raportUrlop)} h</b>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      );
    };

    // Kolumny: data · stanowisko i godziny · suma · flaga.
    const kolumnyCls = "grid grid-cols-[54px_1fr_44px_48px] md:grid-cols-[90px_1fr_80px_60px] gap-2 md:gap-2.5";
    const dzisYMDr = toLocalYMD(dzis);
    const wiersz = (s, zaplanowana = false) => {
      const data = zaplanowana ? new Date(s.date + "T00:00:00") : s.start_time;
      const dd = `${String(data.getDate()).padStart(2, "0")}.${String(data.getMonth() + 1).padStart(2, "0")}`;
      const dow = data.getDay();
      const weekend = dow === 0 || dow === 6;
      const korekta = zaplanowana || s.is_urlop ? null : korektaZmiany(s);
      const czeka = korekta && korekta.status !== "rozwiazane";
      const lokal = zaplanowana ? s.lokal : s.lokal;
      const godziny = zaplanowana
        ? shiftHours(s)
        : s.end_time
        ? (s.end_time - s.start_time) / 3600000
        : null;
      return (
        <div
          key={(zaplanowana ? "p:" : "") + s.id}
          className={`${kolumnyCls} items-center min-h-[64px] py-2 px-0.5 border-b border-[#DEDCD4] ${
            czeka ? "bg-[#FDF0D8]" : zaplanowana ? "" : "bg-white"
          }`}
        >
          <div>
            <b className={`block text-[18px] leading-[22px] font-extrabold tabular-nums ${zaplanowana ? "text-[#6E6E66]" : "text-[#171714]"}`}>
              {dd}
            </b>
            <span className={`text-[15px] font-bold ${weekend ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
              {DNI[dow]}
            </span>
          </div>
          <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 md:gap-x-2 gap-y-1">
            <span
              className="text-[12px] md:text-[13px] font-extrabold px-1.5 py-0.5 rounded-md text-[#6E6E66] bg-[#ECEBE6]"
              style={s.is_urlop ? {} : stanowiskoBadgeStyle(stanowiskaOptions, lokal, s.stanowisko) || {}}
            >
              {s.is_urlop ? "URL" : stanowiskoShort(stanowiskaOptions, lokal, s.stanowisko)}
            </span>
            <b className={`text-[17px] md:text-[18px] font-semibold tabular-nums whitespace-nowrap ${zaplanowana ? "text-[#6E6E66]" : "text-[#171714]"}`}>
              {s.is_urlop ? (
                "Urlop"
              ) : zaplanowana ? (
                `${trimTime(s.start_time)} – ${trimTime(s.end_time)}`
              ) : (
                <>
                  {fmtHHMM(s.start_time)} –{" "}
                  {s.end_time ? fmtHHMM(s.end_time) : <span className="text-[#DE3A22] font-bold">trwa</span>}
                </>
              )}
            </b>
            {zaplanowana ? (
              <small className="basis-full text-[13px] font-bold text-[#6E6E66]">
                w grafiku · jeszcze nie przepracowane
              </small>
            ) : s.wydarzenie_id ? (
              <small className="basis-full text-[13px] font-bold text-[#1F7A4A]" data-wpis-wydarzenia>
                wydarzenie · {etykietaWydarzenia(s, wydarzenia)}
              </small>
            ) : czeka ? (
              <small className="basis-full flex items-center gap-1 text-[13px] font-bold text-[#8A5300]">
                <Flag size={14} /> korekta wysłana · czeka
              </small>
            ) : korekta ? (
              <small className="basis-full flex items-center gap-1 text-[13px] font-bold text-[#1F7A4A]">
                <Check size={14} /> korekta rozpatrzona
              </small>
            ) : null}
          </div>
          <div className="text-right">
            <b className={`block text-[20px] leading-[22px] font-extrabold tabular-nums ${zaplanowana ? "text-[#6E6E66]" : "text-[#171714]"}`}>
              {godziny != null ? h1(godziny) : "–"}
            </b>
            <span className="hidden md:inline text-[12px] text-[#6E6E66]">godz.</span>
          </div>
          {zaplanowana || s.is_urlop ? (
            <span />
          ) : (
            <button
              onClick={() => openZgloszenie(s.id)}
              aria-label={`Zgłoś korektę zmiany ${dd}`}
              title={czeka ? "Korekta już wysłana" : "Coś się nie zgadza? Zgłoś korektę"}
              className={`w-12 md:w-[52px] h-12 rounded-lg border-2 flex items-center justify-center ${
                czeka
                  ? "bg-[#FDF0D8] border-[#8A5300] text-[#8A5300]"
                  : "bg-white border-[#171714] text-[#171714]"
              }`}
            >
              <Flag size={22} fill={czeka ? "currentColor" : "none"} />
            </button>
          )}
        </div>
      );
    };

    // Tygodnie pn–nd, przycięte do miesiąca: „21–27 września”.
    const ostatniDzienMies = new Date(raportYear, raportMonth + 1, 0).getDate();
    const tygodnie = [];
    raportShifts.forEach((s) => {
      const d = s.start_time.getDate();
      const pn = d - ((s.start_time.getDay() + 6) % 7);
      const etykieta = `${Math.max(1, pn)}–${Math.min(pn + 6, ostatniDzienMies)} ${MIES_D[raportMonth]}`;
      let t = tygodnie[tygodnie.length - 1];
      if (!t || t.etykieta !== etykieta) {
        t = { etykieta, zmiany: [], suma: 0 };
        tygodnie.push(t);
      }
      t.zmiany.push(s);
      if (s.end_time) t.suma += (s.end_time - s.start_time) / 3600000;
    });
    // Jeszcze w grafiku: od jutra, a dziś tylko wtedy, gdy dzisiejszej zmiany
    // jeszcze nikt nie zaczął — inaczej ten sam dzień stałby dwa razy.
    const zaczeteDzis = raportShifts.some((s) => toLocalYMD(s.start_time) === dzisYMDr);
    const jeszczeWGrafiku =
      biezacyMies && bloki.includes("GRAFIK")
        ? publishedShiftsFor(planShifts, employee)
            .filter(
              (p) =>
                p.date.slice(0, 7) === dzisYMDr.slice(0, 7) &&
                (p.date > dzisYMDr || (p.date === dzisYMDr && !zaczeteDzis))
            )
            .sort((a, b) =>
              a.date === b.date
                ? trimTime(a.start_time).localeCompare(trimTime(b.start_time))
                : a.date.localeCompare(b.date)
            )
        : [];

    const nawigacjaMiesiaca = (
      <div className="grid grid-cols-[52px_1fr_52px] gap-2 items-center mb-3">
        <button
          onClick={() => przesunMiesiac(-1)}
          disabled={!mozeWstecz}
          aria-label="Poprzedni miesiąc"
          className="h-[52px] rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center text-[#171714] disabled:opacity-35"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="text-center">
          <b className="block font-['Archivo'] text-[22px] leading-[26px] font-extrabold text-[#171714]">
            {getMonthName(raportMonth)} {raportYear}
          </b>
          {umowa && <span className="text-[14px] text-[#6E6E66]">{typUmowyLabel(umowa).toLowerCase()}</span>}
        </div>
        <button
          onClick={() => przesunMiesiac(1)}
          disabled={!mozeDalej}
          aria-label="Następny miesiąc"
          className="h-[52px] rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center text-[#171714] disabled:opacity-35"
        >
          <ChevronRight size={24} />
        </button>
      </div>
    );
    const podpowiedz = (
      <p className="flex items-center gap-2.5 text-[14px] leading-[19px] text-[#6E6E66] mt-1 mb-3.5 mx-0.5">
        <span className="w-9 h-8 rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center text-[#171714] flex-shrink-0">
          <Flag size={18} />
        </span>
        Godzina się nie zgadza? Kliknij flagę przy zmianie — otworzy się zgłoszenie korekty.
      </p>
    );
    const lista = (
      <div>
        <div className={`${kolumnyCls} px-0.5 pb-1.5 text-[12px] font-extrabold tracking-[.06em] uppercase text-[#6E6E66] border-b-2 border-[#171714]`}>
          <span>Data</span>
          <span className="whitespace-nowrap">Stanowisko · od – do</span>
          <span className="text-right">Godz.</span>
          <span />
        </div>
        {raportShifts.length === 0 && jeszczeWGrafiku.length === 0 && (
          <div className="text-center py-8 text-[#6E6E66] text-[15px]">Brak zmian w tym miesiącu.</div>
        )}
        {tygodnie.map((t) => (
          <div key={t.etykieta}>
            <div className="flex justify-between items-baseline pt-3.5 pb-1.5 px-0.5 text-[14px] font-extrabold text-[#6E6E66]">
              <span>{t.etykieta}</span>
              <b className="text-[15px] text-[#171714] tabular-nums">{h1(t.suma)} h</b>
            </div>
            <div className="border-t border-[#DEDCD4]">{t.zmiany.map((s) => wiersz(s))}</div>
          </div>
        ))}
        {jeszczeWGrafiku.length > 0 && (
          <div>
            <div className="flex justify-between items-baseline pt-3.5 pb-1.5 px-0.5 mt-2 border-t-2 border-dashed border-[#171714] text-[14px] font-extrabold text-[#6E6E66]">
              <span>Jeszcze w grafiku</span>
              <b className="text-[15px] text-[#171714] tabular-nums">
                {h1(jeszczeWGrafiku.reduce((a, p) => a + shiftHours(p), 0))} h
              </b>
            </div>
            {jeszczeWGrafiku.map((p) => wiersz(p, true))}
          </div>
        )}
      </div>
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
        title="Raport"
        nowyWyglad
      >
        {/* Na tablecie miesiąc i podsumowanie po lewej (przyklejone), lista
            po prawej w karcie. Osobę wybiera się przez „Zmień”, nie polem. */}
        <div className="md:grid md:grid-cols-[380px_1fr] md:gap-6 md:items-start">
          <div className="md:sticky md:top-0" data-raport-podsumowanie>
            {nawigacjaMiesiaca}
            {renderPodsumowanie()}
            {podpowiedz}
          </div>
          <div className="md:bg-white md:border-2 md:border-[#DEDCD4] md:rounded-xl md:px-4 md:pt-2.5 md:pb-1.5" data-raport-lista>
            {lista}
          </div>
        </div>
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZADANIA — układ z makiety właściciela (0.63.0, EmployeeTasksMobile /
  // EmployeeTasksTablet). Widoczne tylko w dniu pracy (pracujeTegoDnia) — w
  // dzień wolny zamiast pustego ekranu następna zmiana i podgląd bloków.
  // ==========================================
  if (screen === "ZADANIA") {
    const grupyZadan = taskViewMode === "all" ? myBlocksAll : myBlocksOwn;
    const zostaloOwn = myChecklistOwn.filter((i) => !i.done).length;
    const zostaloAll = splaszczBloki(myBlocksAll).filter((i) => !i.done).length;
    const zrobioneDzis = myChecklistOwn.filter((i) => i.done).length;
    // TERAZ — pierwszy blok, w którym coś zostało (bloki są już po porze), i
    // tylko na zmianie. Ta sama reguła co na Pulpicie.
    const terazGrupa = openShift ? myBlocksOwn.find((g) => g.zostalo > 0) : null;
    const terazId = terazGrupa ? terazGrupa.blok.id : null;
    const skoczDoBloku = (id) => {
      setOpenBlockId(id);
      setTimeout(() => {
        const el = document.getElementById(`zadania-blok-${id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    };
    const podgladBlokow =
      !pracujeDzis && najblizszaZmiana
        ? buildEmployeeBlocks(
            daneZadan,
            { lokal: najblizszaZmiana.lokal, stanowisko: najblizszaZmiana.stanowisko },
            najblizszaZmiana.date,
            "own",
            { pracuje: true }
          )
        : [];
    const ostatnie7 =
      myWeeklyStats.total > 0 ? `${myWeeklyStats.done} z ${myWeeklyStats.total}` : null;
    const zakresCls = (on) =>
      `flex-1 min-h-[44px] px-3 rounded-full text-[15px] font-bold inline-flex items-center justify-center gap-1.5 ${
        on ? "bg-[#171714] text-white" : "text-[#171714]"
      }`;
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
        nowyWyglad
      >
        {!pracujeDzis ? (
          <div className="md:max-w-[620px]">
            <div className="bg-white border-2 border-[#171714] rounded-xl p-4 flex flex-col items-start gap-1.5">
              <span className="w-11 h-11 rounded-full bg-[#DEDCD4] flex items-center justify-center">
                <ClipboardCheck size={22} />
              </span>
              <b className="font-['Archivo'] text-[22px] font-extrabold text-[#171714]">Nie masz dziś zmiany</b>
              <p className="text-[15px] text-[#6E6E66]">
                Zadania pojawią się w dniu Twojej zmiany albo po jej rozpoczęciu.
              </p>
              {najblizszaZmiana && (
                <div className="w-full rounded-lg bg-[#DEDCD4] px-3.5 py-3 mt-1">
                  <span className="block text-[12px] font-extrabold uppercase tracking-[.05em] text-[#6E6E66]">
                    Następna zmiana
                  </span>
                  <b className="block text-[20px] font-extrabold text-[#171714]">
                    {opisDnia(najblizszaZmiana.date)} · {trimTime(najblizszaZmiana.start_time)}–
                    {trimTime(najblizszaZmiana.end_time)}
                  </b>
                  <small className="text-[14px] text-[#6E6E66]">
                    {najblizszaZmiana.lokal} · {najblizszaZmiana.stanowisko}
                  </small>
                </div>
              )}
              {bloki.includes("GRAFIK") && (
                <button
                  onClick={() => setScreen("GRAFIK")}
                  className="w-full mt-1.5 min-h-[48px] rounded-lg border-2 border-[#171714] bg-white inline-flex items-center justify-center gap-2 font-['Archivo'] font-extrabold text-[16px] text-[#171714]"
                >
                  <CalendarDays size={18} /> Zobacz grafik
                </button>
              )}
            </div>
            {podgladBlokow.length > 0 && (
              <>
                <h3 className="flex flex-wrap items-baseline gap-x-2 mt-4 mb-2 mx-0.5 text-[13px] font-extrabold uppercase tracking-[.05em] text-[#6E6E66]">
                  Co będzie na Twojej zmianie
                  <span className="normal-case tracking-normal font-bold">podgląd · nie można odhaczać</span>
                </h3>
                {podgladBlokow.map((g) => (
                  <div
                    key={g.blok.id}
                    className="flex justify-between items-center gap-2 px-3.5 py-3 mb-2 rounded-lg bg-white border-2 border-[#DEDCD4]"
                  >
                    <div className="min-w-0">
                      <span className="block text-[13px] font-bold text-[#6E6E66]">{poraLabel(g.blok.schedule_type)}</span>
                      <b className="block text-[16px] text-[#171714] truncate">{g.blok.nazwa}</b>
                    </div>
                    <span className="text-[14px] text-[#6E6E66] whitespace-nowrap">
                      {g.total} {g.total === 1 ? "zadanie" : "zadań"}
                      {g.blok.deadline_time ? ` · do ${g.blok.deadline_time.slice(0, 5)}` : ""}
                    </span>
                  </div>
                ))}
              </>
            )}
            {ostatnie7 && (
              <p className="text-[14px] text-[#6E6E66] mt-3 mx-0.5">
                Ostatnie 7 dni: <b className="text-[#171714]">{ostatnie7} zadań</b>
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Jedna karta dnia zamiast czerwonego banera i szarego paska. */}
            <div className="bg-white border-2 border-[#171714] rounded-xl px-4 py-3.5 mb-3 md:grid md:grid-cols-[1fr_1.4fr_1fr] md:gap-4 md:items-center">
              <div className="flex justify-between items-end gap-2.5">
                <div>
                  <span className="block text-[13px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66]">
                    Dziś · {fmtHHMM(now)}
                  </span>
                  <b className="block font-['Archivo'] text-[34px] leading-[38px] font-extrabold tabular-nums text-[#171714]">
                    {zrobioneDzis}
                    <small className="text-[17px] font-extrabold"> z {myChecklistOwn.length} zadań</small>
                  </b>
                </div>
                {ostatnie7 && (
                  <div className="text-right md:hidden">
                    <span className="block text-[12px] text-[#6E6E66]">ostatnie 7 dni</span>
                    <b className="text-[14px] text-[#6E6E66]">{ostatnie7}</b>
                  </div>
                )}
              </div>
              <div>
                <div className="h-2.5 rounded-full bg-[#DEDCD4] overflow-hidden my-2.5 md:my-0">
                  <i
                    className="block h-full bg-[#1F7A4A]"
                    style={{
                      width: `${myChecklistOwn.length ? (zrobioneDzis / myChecklistOwn.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                {ostatnie7 && (
                  <span className="hidden md:block text-[12px] text-[#6E6E66] mt-1">
                    ostatnie 7 dni · <b>{ostatnie7}</b>
                  </span>
                )}
              </div>
              {terazGrupa && (
                <button
                  onClick={() => skoczDoBloku(terazGrupa.blok.id)}
                  className="w-full flex items-center gap-2 min-h-[48px] px-3 rounded-lg border-2 border-[#171714] bg-white text-left text-[15px] font-bold text-[#171714]"
                >
                  <em className="not-italic text-[11px] font-extrabold uppercase text-white bg-[#DE3A22] rounded-[5px] px-1.5 py-px">
                    teraz
                  </em>
                  <span className="flex-1 truncate">
                    {terazGrupa.blok.nazwa} · {terazGrupa.done}/{terazGrupa.total}
                  </span>
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
            <div className="flex p-1 rounded-full bg-white border-2 border-[#DEDCD4] mb-3 md:max-w-[520px]">
              <button onClick={() => setTaskViewMode("own")} className={zakresCls(taskViewMode === "own")}>
                Moje stanowisko <i className="not-italic text-[13px] opacity-75">{zostaloOwn}</i>
              </button>
              <button onClick={() => setTaskViewMode("all")} className={zakresCls(taskViewMode === "all")}>
                Wszystkie <i className="not-italic text-[13px] opacity-75">{zostaloAll}</i>
              </button>
            </div>
            {grupyZadan.length === 0 ? (
              <div className="text-center py-10 text-[#6E6E66]">
                <ClipboardCheck className="mx-auto mb-2 opacity-40" size={40} />
                Brak zadań na dziś.
              </div>
            ) : (
              renderBlockCards(grupyZadan, { terazId, pokazStanowiska: taskViewMode === "all" })
            )}
          </>
        )}
        {renderModalPomiaru()}
        {/* „Zrobione · Cofnij” — przez 5 s po odhaczeniu. */}
        {zadanieCofnij && (
          <div className="fixed z-40 left-3 right-3 bottom-[84px] md:left-1/2 md:right-auto md:-translate-x-1/2 md:bottom-6 md:w-[360px] flex items-center gap-3 rounded-xl bg-[#171714] text-white px-4 py-3 shadow-lg">
            <Check size={18} strokeWidth={2.5} className="text-[#7FD4A3]" />
            <span className="flex-1 text-[15px] font-bold truncate">Zrobione · {zadanieCofnij.tytul}</span>
            <button
              onClick={async () => {
                const item = splaszczBloki(myBlocksAll).find((i) => i.task.id === zadanieCofnij.id);
                setZadanieCofnij(null);
                if (item && item.done) await odznaczZadanie(item);
              }}
              className="text-[15px] font-extrabold underline underline-offset-2"
            >
              Cofnij
            </button>
          </div>
        )}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: WIECEJ
  // ==========================================
  // ==========================================
  // EKRAN: WIECEJ — układ z makiety właściciela (0.66.0, EmployeeMoreMobile /
  // EmployeeMoreTablet): duże wiersze (Zgłoś, Zamknięcie dnia, Wiadomości,
  // Wróć do listy osób), na dole urządzenie, ostrzeżenie i „Wyloguj” z
  // potwierdzeniem. Na tablecie lista po lewej, urządzenie po prawej.
  // ==========================================
  if (screen === "WIECEJ") {
    const wspolny = !!onBack;
    // „N czeka” przy Zgłoś — te same sprawy co „Moje zgłoszenia”: korekty i
    // zgłoszenia pod imieniem bez rozstrzygnięcia plus własne wnioski o wolne.
    const czekaSpraw =
      (issues || []).filter(
        (i) => !i.is_anonymous && String(i.user_id) === String(employee.id) && i.status !== "rozwiazane"
      ).length +
      (absences || []).filter(
        (a) => String(a.user_id) === String(employee.id) && a.requested_by !== "manager" && a.status === "pending"
      ).length;
    const wiersz = ({ Ikona, tytul, podpis, znaczek, onClick, przerywany, dane }) => (
      <button
        type="button"
        onClick={onClick}
        {...dane}
        className={`w-full grid grid-cols-[48px_1fr_auto_22px] gap-3 items-center min-h-[76px] px-3.5 py-2.5 border-2 rounded-lg bg-white text-left ${
          przerywany ? "border-dashed border-[#B7B6AE]" : "border-[#B7B6AE]"
        }`}
      >
        <span className="w-12 h-12 rounded-full bg-[#DEDCD4] flex items-center justify-center text-[#171714]">
          <Ikona size={24} />
        </span>
        <span className="min-w-0">
          <b className="block text-[20px] font-extrabold text-[#171714]">{tytul}</b>
          <small className="text-[14px] leading-[18px] text-[#6E6E66]">{podpis}</small>
        </span>
        {znaczek ? (
          <em className="not-italic min-w-[28px] h-7 rounded-full bg-[#DE3A22] text-white text-[14px] font-extrabold flex items-center justify-center px-2">
            {znaczek}
          </em>
        ) : (
          <span />
        )}
        <ChevronRight size={22} className="text-[#6E6E66]" />
      </button>
    );
    const lista = (
      <div className="grid gap-2.5">
        {dostepneTypyZgloszen.length > 0 &&
          wiersz({
            Ikona: Flag,
            tytul: "Zgłoś",
            podpis: (
              <>
                {dostepneTypyZgloszen
                  .map((t) => ({ correction: "popraw zmianę", absence: "wolne", problem: "problem" })[t.key])
                  .join(" · ")}
                {czekaSpraw > 0 && <b className="font-extrabold text-[#8A5300]"> · {czekaSpraw} czeka</b>}
              </>
            ),
            onClick: () => openZgloszenie(null),
            dane: { "data-wiecej": "zglos" },
          })}
        {/* Prawo kierownika zmiany (users.puls_do) jest na czas i wygasa samo —
            dlatego wiersz pojawia się i znika bez niczyjej ingerencji. */}
        {mozeZamykacPuls(employee) &&
          wiersz({
            Ikona: BookOpen,
            tytul: "Zamknięcie dnia",
            podpis: "Puls lokalu — możesz dziś zamknąć dzień",
            onClick: () => setScreen("PULS"),
            dane: { "data-wiecej": "puls" },
          })}
        {bloki.includes("WIADOMOSCI") &&
          wiersz({
            Ikona: Mail,
            tytul: "Wiadomości",
            podpis: unreadCount > 0 ? `${unreadCount} ${unreadCount === 1 ? "nowa" : "nowe"} od kierownika` : "brak nowych",
            znaczek: unreadCount > 0 ? unreadCount : null,
            onClick: () => setScreen("WIADOMOSCI"),
            dane: { "data-wiecej": "wiadomosci" },
          })}
        {wspolny &&
          wiersz({
            Ikona: Users,
            tytul: "Wróć do listy osób",
            podpis: "tablet zostaje zalogowany dla innych",
            onClick: onBack,
            przerywany: true,
            dane: { "data-wiecej": "lista" },
          })}
      </div>
    );
    const lokaleUrzadzenia = (lokaleOptions || []).map((l) => l.name).join(", ");
    const urzadzenie = (
      <section>
        <div className="flex items-center gap-2 text-[14px] text-[#6E6E66] mx-0.5 mb-2">
          {wspolny ? <Tablet size={18} /> : <Smartphone size={18} />}
          <span>
            {wspolny ? (
              <>
                <b className="text-[#171714]">Tablet Służbowy</b>
                {lokaleUrzadzenia ? ` · ${lokaleUrzadzenia}` : ""}
              </>
            ) : (
              <>
                <b className="text-[#171714]">Twój telefon</b> · konto {employee.name}
              </>
            )}
          </span>
        </div>
        <div className="flex gap-2.5 px-3.5 py-3 border-2 border-dashed border-[#8A5300] rounded-lg bg-[#FDF0D8] text-[#8A5300]">
          <AlertTriangle size={22} className="flex-none mt-px" />
          <p className="text-[15px] leading-[21px]">
            {wspolny ? (
              <>
                <b>Uwaga:</b> to urządzenie jest zalogowane na stałe. Nie wylogowuj go bez potrzeby — potem trzeba
                zalogować się ponownie <b>danymi kiosku</b> (ma je kierownik). Żeby oddać tablet innej osobie, użyj
                „Wróć do listy osób”.
              </>
            ) : (
              "Po wylogowaniu zalogujesz się ponownie swoim e-mailem i PIN-em."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPytanieWyloguj(true)}
          data-wyloguj
          className="w-full min-h-[56px] mt-2.5 flex items-center justify-center gap-2 border-2 border-[#DE3A22] rounded-lg bg-white text-[#DE3A22] text-[17px] font-extrabold"
        >
          <LogOut size={22} /> {wspolny ? "Wyloguj urządzenie" : "Wyloguj się"}
        </button>
        <small className="block text-center text-[13px] text-[#6E6E66] mt-2.5 mb-1">Wersja {APP_VERSION}</small>
      </section>
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
        title="Więcej"
        nowyWyglad
      >
        {/* Telefon: lista u góry, urządzenie przyklejone do dołu (flex-1 nad
            nim). Tablet: dwie kolumny. */}
        <div className="flex-1 flex flex-col md:grid md:grid-cols-[minmax(0,620px)_360px] md:gap-7 md:items-start md:justify-center">
          {lista}
          <div className="flex-1 md:hidden min-h-[24px]" />
          {urzadzenie}
        </div>
        {pytanieWyloguj && (
          <div
            className="fixed inset-0 bg-black/45 flex items-end md:items-center justify-center md:p-4 z-50"
            onClick={() => setPytanieWyloguj(false)}
          >
            <div
              role="dialog"
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-[22px] md:rounded-[22px] w-full md:max-w-[440px] px-[18px] pt-[22px] pb-6 text-center"
              data-pytanie-wyloguj
            >
              <span className="inline-flex w-14 h-14 rounded-full bg-[#FBEAE6] text-[#DE3A22] items-center justify-center">
                <LogOut size={28} />
              </span>
              <h3 className="font-['Archivo'] text-[24px] font-extrabold text-[#171714] mt-2.5 mb-1.5">
                {wspolny ? "Wylogować tablet?" : "Wylogować się?"}
              </h3>
              <p className="text-[16px] leading-[23px] text-[#171714] mb-4">
                {wspolny ? (
                  <>
                    Tablet przestanie działać dla <b>wszystkich pracowników</b>
                    {lokaleUrzadzenia ? ` lokalu ${lokaleUrzadzenia}` : ""}, dopóki kierownik nie zaloguje go
                    ponownie danymi kiosku.
                  </>
                ) : (
                  "Zalogujesz się ponownie swoim e-mailem i PIN-em."
                )}
              </p>
              {/* Domyślna, czarna akcja to ZOSTAĆ — wylogowanie ma czerwony obrys. */}
              <button
                type="button"
                onClick={() => setPytanieWyloguj(false)}
                className="w-full min-h-[58px] rounded-lg bg-[#171714] text-white text-[18px] font-extrabold mb-2"
              >
                {wspolny ? "Nie, zostaw zalogowany" : "Anuluj"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPytanieWyloguj(false);
                  onLogout();
                }}
                data-wyloguj-tak
                className="w-full min-h-[58px] rounded-lg bg-white border-2 border-[#DE3A22] text-[#DE3A22] text-[18px] font-extrabold"
              >
                {wspolny ? "Tak, wyloguj tablet" : "Wyloguj się"}
              </button>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: WIADOMOSCI
  // ==========================================
  // Zamknięcie dnia — układ z makiety (0.73.0, EmployeeCloseDayMobile /
  // EmployeeCloseDayTablet). PulsZmiany sam składa treść i stopkę z
  // przyciskiem „Zamknij dzień”, a rama (Shell) zostaje tutaj — ta sama co na
  // pozostałych ekranach.
  if (screen === "PULS") {
    const lokalPulsu = effectiveAssignment.lokal;
    // Chipy „Kto brał udział” w zdarzeniu: kto dziś odbił zmianę w tym lokalu.
    const osobyNaZmianie = [
      ...new Set(
        (shifts || [])
          .filter((sh) => sh.lokal === lokalPulsu && !sh.is_urlop && toLocalYMD(sh.start_time) === todayStr)
          .map((sh) => sh.user_name)
          .filter(Boolean)
      ),
    ];
    return (
      <PulsZmiany
        currentUser={employee}
        lokal={lokalPulsu}
        showMsg={showMsg}
        osobyNaZmianie={osobyNaZmianie}
        onPoprawka={
          bloki.includes("ZGLOS_PROBLEM")
            ? (tekst) => {
                zgTypNaWejscie.current = "problem";
                zgTekstNaWejscie.current = tekst;
                setZgPrefillShiftId(null);
                setScreen("ZGLOS");
              }
            : null
        }
        onWroc={onBack ? { label: "Wróć do listy osób", onClick: onBack } : { label: "Wróć do Pulpitu", onClick: () => setScreen("PULPIT") }}
        rama={(tresc, stopka) => (
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
            imieNadTytulem
            nowyWyglad
            footer={stopka}
          >
            {tresc}
          </Shell>
        )}
      />
    );
  }

  // ==========================================
  // EKRAN: WIADOMOSCI — układ z makiety właściciela (0.65.0,
  // EmployeeMessagesMobile / EmployeeMessagesTablet): filtry, dni, karta z
  // ikoną typu, plakietką stanu i akcją. Treść jak dotąd z
  // formatNotificationText; rodzaj — opisWiadomosci (poziom modułu).
  // ==========================================
  if (screen === "WIADOMOSCI") {
    const MIES_Z = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
    const KATEGORIE = [
      ["ev", "Wydarzenia"],
      ["grafik", "Grafik"],
      ["gie", "Giełda"],
      ["kor", "Korekty i wolne"],
      ["zgl", "Zgłoszenia"],
    ];
    const IKONY_WIAD = {
      grafik: CalendarDays,
      gielda: ArrowLeftRight,
      korekta: Flag,
      wolne: Palmtree,
      uwaga: AlertTriangle,
      odpowiedz: Mail,
      dokument: FileText,
      wydarzenie: Presentation,
    };
    const KOLO = {
      info: "bg-[#DEDCD4] text-[#171714]",
      ok: "bg-[#E2F3E9] text-[#1F7A4A]",
      no: "bg-[#FBEAE6] text-[#DE3A22]",
      warn: "bg-[#FDF0D8] text-[#8A5300]",
      reply: "bg-[#E6EEF6] text-[#1A4F6A]",
    };
    const PLAKIETKA = {
      ok: [Check, "zatwierdzone", "bg-[#E2F3E9] text-[#1F7A4A]"],
      no: [X, "odrzucone", "bg-[#FBEAE6] text-[#DE3A22]"],
      warn: [AlertTriangle, "do sprawdzenia", "bg-[#FDF0D8] text-[#8A5300]"],
    };
    const AKCJE = {
      grafik: bloki.includes("GRAFIK") && ["Zobacz grafik", () => setScreen("GRAFIK")],
      korekta: bloki.includes("RAPORT") && [
        "Popraw zmianę",
        () => {
          zgTypNaWejscie.current = "correction";
          setZgPrefillShiftId(null);
          setScreen("ZGLOS");
        },
      ],
    };
    const dzisYMDw = toLocalYMD(new Date());
    const wczoraj = new Date();
    wczoraj.setDate(wczoraj.getDate() - 1);
    const wczorajYMD = toLocalYMD(wczoraj);
    const etykietaDnia = (d) => {
      const ymd = toLocalYMD(d);
      if (ymd === dzisYMDw) return "Dziś";
      if (ymd === wczorajYMD) return "Wczoraj";
      return `${d.getDate()} ${MIES_Z[d.getMonth()]}${
        d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""
      }`;
    };
    const wszystkie = [...myNotifications]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((n) => ({ n, o: opisWiadomosci(n), nowa: noweWiadomosci.includes(n.id) }));
    // Filtry tylko dla rodzajów, które są na liście — pusty filtr to martwy
    // przycisk. „Wszystkie” zawsze pierwsze.
    const filtry = [["all", "Wszystkie"], ...KATEGORIE.filter(([k]) => wszystkie.some((x) => x.o.kat === k))];
    const kat = filtry.some(([k]) => k === katWiadomosci) ? katWiadomosci : "all";
    const widoczne = wszystkie.filter((x) => kat === "all" || x.o.kat === kat);
    const ileNowych = widoczne.filter((x) => x.nowa).length;
    const noweTekst = (k) =>
      k === 1
        ? "1 nowa wiadomość"
        : k % 10 >= 2 && k % 10 <= 4 && !(k % 100 >= 12 && k % 100 <= 14)
        ? `${k} nowe wiadomości`
        : `${k} nowych wiadomości`;
    const przeczytana = (id) => setNoweWiadomosci((prev) => prev.filter((x) => x !== id));

    let dzien = null;
    const elementy = [];
    widoczne.forEach(({ n, o, nowa }) => {
      const kiedy = n.created_at ? new Date(n.created_at) : null;
      const etykieta = kiedy ? etykietaDnia(kiedy) : "Wcześniej";
      if (etykieta !== dzien) {
        dzien = etykieta;
        elementy.push(
          <h3
            key={`d:${etykieta}`}
            className="text-[13px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66] mt-4 mb-2 mx-0.5"
          >
            {etykieta}
          </h3>
        );
      }
      const Ikona = IKONY_WIAD[o.ikona] || Bell;
      // Wydarzenia niosą własny podpis plakietki („czas pracy”, „zmiana”,
      // „odwołane”) — „zatwierdzone” przy nowym zebraniu byłoby nieprawdą.
      const plakietka = o.plak && PLAKIETKA[o.ton] ? [PLAKIETKA[o.ton][0], o.plak, PLAKIETKA[o.ton][2]] : o.kat === "ev" ? null : PLAKIETKA[o.ton];
      const akcja = o.akcja && AKCJE[o.akcja];
      elementy.push(
        <div
          key={n.id}
          onClick={() => nowa && przeczytana(n.id)}
          data-wiadomosc={n.id}
          data-nowa={nowa ? "1" : undefined}
          className={`relative grid grid-cols-[44px_1fr] gap-3 px-3.5 py-3 border-2 rounded-lg bg-white mb-2 ${
            nowa ? "border-[#171714]" : "border-[#DEDCD4]"
          }`}
        >
          <span className={`w-11 h-11 rounded-full flex items-center justify-center ${KOLO[o.ton] || KOLO.info}`}>
            <Ikona size={22} />
          </span>
          <div className="min-w-0">
            <div className="flex justify-between items-baseline gap-2">
              <b className={`text-[18px] leading-[23px] text-[#171714] ${nowa ? "font-extrabold" : "font-bold"}`}>
                {o.tytul}
              </b>
              {kiedy && (
                <time className={`text-[14px] text-[#6E6E66] tabular-nums flex-none ${nowa ? "pr-4" : ""}`}>
                  {fmtHHMM(kiedy)}
                </time>
              )}
            </div>
            {plakietka && (
              <span
                className={`inline-flex items-center gap-1 text-[13px] font-extrabold px-2 py-0.5 rounded-md mt-1 ${plakietka[2]}`}
              >
                {React.createElement(plakietka[0], { size: 14 })}
                {plakietka[1]}
              </span>
            )}
            <p className="text-[16px] leading-[22px] mt-1.5 text-[#171714]">
              {formatNotificationText(n, showEmployeeNameInMessages)}
            </p>
            {akcja && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  przeczytana(n.id);
                  akcja[1]();
                }}
                className={`mt-2.5 inline-flex items-center gap-1 min-h-[44px] px-3.5 rounded-lg border-2 border-[#171714] text-[15px] font-extrabold ${
                  o.ton === "warn" ? "bg-[#171714] text-white" : "bg-white text-[#171714]"
                }`}
              >
                {akcja[0]} <ChevronRight size={18} />
              </button>
            )}
          </div>
          {nowa && <i className="absolute top-4 right-3 w-2.5 h-2.5 rounded-full bg-[#DE3A22]" aria-label="nowa" />}
        </div>
      );
    });

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
        nowyWyglad
      >
        <div className="w-full md:max-w-[720px] md:mx-auto">
          {wszystkie.length === 0 ? (
            <div className="text-center py-12 text-[#6E6E66]">
              <Bell className="mx-auto mb-2 opacity-40" size={40} />
              <p className="text-[16px]">Brak wiadomości.</p>
              <p className="text-[14px] mt-1">Tu przyjdą zmiany w grafiku, odpowiedzi na korekty i wnioski.</p>
            </div>
          ) : (
            <>
              {filtry.length > 2 && (
                // Na telefonie przewijane w bok (od krawędzi do krawędzi), na
                // tablecie jeden rząd.
                <div className="flex gap-1.5 overflow-x-auto -mx-3.5 px-3.5 pb-1 mb-2.5 md:mx-0 md:px-0 md:flex-wrap [scrollbar-width:none]">
                  {filtry.map(([k, nazwa]) => {
                    const ile = wszystkie.filter((x) => x.nowa && (k === "all" || x.o.kat === k)).length;
                    const on = kat === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKatWiadomosci(k)}
                        data-filtr-wiadomosci={k}
                        className={`flex-none min-h-[44px] px-3.5 rounded-full border-2 text-[15px] font-bold inline-flex items-center gap-1.5 ${
                          on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#B7B6AE] text-[#171714]"
                        }`}
                      >
                        {nazwa}
                        {ile > 0 && (
                          <i className="not-italic min-w-[20px] h-5 rounded-full bg-[#DE3A22] text-white text-[12px] font-extrabold flex items-center justify-center px-1">
                            {ile}
                          </i>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {ileNowych > 0 && (
                <div className="flex justify-between items-center gap-2 px-3 py-2 rounded-lg bg-[#FBEAE6] mb-1">
                  <span className="text-[15px] font-extrabold text-[#DE3A22] whitespace-nowrap">{noweTekst(ileNowych)}</span>
                  <button
                    type="button"
                    onClick={() => setNoweWiadomosci([])}
                    className="inline-flex items-center gap-1 text-[14px] font-bold underline text-[#171714] whitespace-nowrap"
                  >
                    <Check size={16} /> Przeczytane
                  </button>
                </div>
              )}
              {elementy}
              {widoczne.length === 0 && (
                <p className="text-center text-[#6E6E66] py-8">Brak wiadomości w tej kategorii.</p>
              )}
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ==========================================
  // EKRAN: ZGLOS — układ z makiety właściciela (0.64.0, EmployeeRequestsMobile /
  // EmployeeRequestsTablet). Zmienił się wygląd i sposób wyboru (lista zmian,
  // kalendarz, chipy); zapis idzie tymi samymi funkcjami co wcześniej
  // (handleSendKorekta / handleSendAbsence / handleSendZgloszenie).
  // ==========================================
  if (screen === "ZGLOS") {
    const MIES_Z = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
    const MIES_D = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca",
      "sierpnia", "września", "października", "listopada", "grudnia"];
    const MIES_M = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec",
      "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
    const DNI_K = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
    const DNI_P = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
    const h1 = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1).replace(".", ",");
    const pad = (n) => String(n).padStart(2, "0");
    const ddmm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
    const zYMD = (ymd) => new Date(ymd + "T00:00:00");
    const dzienMies = (ymd) => {
      const d = zYMD(ymd);
      return `${d.getDate()} ${MIES_Z[d.getMonth()]}`;
    };
    const godz = (t) => (t ? String(t).slice(0, 5) : "…");
    // Zakończenie przed rozpoczęciem = przez północ — tak samo liczy
    // resolveCorrection przy zatwierdzeniu.
    const dlugoscH = (od, dok) => {
      if (!od || !dok) return null;
      const [sh, sm] = od.split(":").map(Number);
      const [eh, em] = dok.split(":").map(Number);
      let r = eh * 60 + em - (sh * 60 + sm);
      if (r < 0) r += 1440;
      return r / 60;
    };
    const robocze = (n) =>
      n === 1 ? "dzień roboczy" : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? "dni robocze" : "dni roboczych";

    // --- klocki ---
    const lblZg = (tytul, pod) => (
      <div className="mt-[18px] mb-2 mx-0.5">
        <b className="block text-[18px] font-extrabold text-[#171714]">{tytul}</b>
        {pod && <span className="text-[14px] leading-[19px] text-[#6E6E66]">{pod}</span>}
      </div>
    );
    const podpisCls = "block text-[15px] text-[#6E6E66] mx-0.5 mb-1.5";
    const poleCls =
      "w-full h-14 px-3 rounded-lg border-2 border-[#171714] bg-white text-[17px] font-bold text-[#171714] min-w-0";
    const tekstCls =
      "w-full px-3.5 py-3 rounded-lg border-2 border-[#B7B6AE] bg-white text-[17px] text-[#171714] resize-y";
    const linkCls = "text-[15px] font-bold underline text-[#171714] flex-none";
    const chip = (on, onClick, tekst) => (
      <button
        key={tekst}
        type="button"
        onClick={onClick}
        className={`min-h-[44px] px-4 rounded-full border-2 text-[15px] font-bold inline-flex items-center gap-1.5 ${
          on ? "border-[#171714] bg-[#171714] text-white" : "border-[#B7B6AE] bg-white text-[#171714]"
        }`}
      >
        {on && <Check size={18} />}
        {tekst}
      </button>
    );
    const ramka = (Icon, tekst, ton = "info") => (
      <div
        className={`flex gap-2.5 items-start px-3.5 py-3 rounded-lg text-[15px] leading-[21px] mt-1.5 mb-3 ${
          ton === "warn"
            ? "bg-[#FDF0D8] text-[#8A5300] font-bold"
            : ton === "anon"
            ? "bg-[#E6EEF6] text-[#171714]"
            : "bg-[#DEDCD4] text-[#171714]"
        }`}
      >
        <Icon size={20} className={`flex-none mt-px ${ton === "warn" ? "" : "text-[#6E6E66]"}`} />
        <span>{tekst}</span>
      </div>
    );
    const kafelDuzy = (on, onClick, Icon, tytul, opis) => (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={`min-h-[96px] px-3.5 py-3 rounded-lg border-2 bg-white text-left flex flex-col gap-1 min-w-0 ${
          on ? "border-[#171714] shadow-[inset_0_0_0_2px_#171714]" : "border-[#B7B6AE]"
        }`}
      >
        {Icon && <Icon size={26} className={on ? "text-[#171714]" : "text-[#6E6E66]"} />}
        {/* 17 px na telefonie: „Niedostępność” w 19 px nie mieści się w
            połowie ekranu 375 px i łamało się w środku słowa. */}
        <b className="text-[17px] md:text-[19px] font-extrabold text-[#171714] break-words">{tytul}</b>
        <span className="text-[14px] leading-[18px] text-[#6E6E66]">{opis}</span>
      </button>
    );
    const znaczekStanowiska = (lokal, stanowisko) => (
      <span
        className="text-[12px] md:text-[13px] font-extrabold px-1.5 py-0.5 rounded-md text-[#6E6E66] bg-[#ECEBE6] flex-none"
        style={stanowiskoBadgeStyle(stanowiskaOptions, lokal, stanowisko) || {}}
      >
        {stanowiskoShort(stanowiskaOptions, lokal, stanowisko)}
      </span>
    );

    // --- kafle typów ---
    const kafleTypow = dostepneTypyZgloszen.length > 1 && (
      <div className={`grid gap-2 ${dostepneTypyZgloszen.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {dostepneTypyZgloszen.map(({ key, label, Icon }) => {
          const on = zgType === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setZgType(key)}
              data-typ-zgloszenia={key}
              aria-pressed={on}
              className={`min-h-[72px] rounded-lg border-2 flex flex-col items-center justify-center gap-1 px-1 py-1.5 text-[15px] leading-[18px] font-bold text-center ${
                on ? "border-[#171714] bg-[#171714] text-white" : "border-[#B7B6AE] bg-white text-[#171714]"
              }`}
            >
              <Icon size={24} className={on ? "text-white" : "text-[#6E6E66]"} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );

    // ---------- Popraw zmianę ----------
    const granica3tyg = new Date();
    granica3tyg.setHours(0, 0, 0, 0);
    granica3tyg.setDate(granica3tyg.getDate() - 21);
    const mojeZmiany = shifts
      .filter(
        (s) => String(s.user_id) === String(employee.id) && !s.is_urlop && s.start_time >= granica3tyg
      )
      .sort((a, b) => b.start_time - a.start_time);
    const zapomniana = zgCorrectionShiftId === "forgot";
    const zmiana =
      zgCorrectionShiftId && !zapomniana
        ? shifts.find((s) => String(s.id) === String(zgCorrectionShiftId))
        : null;
    const wybrana = zapomniana || !!zmiana;
    const dniWstecz = Array.from({ length: 22 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return toLocalYMD(d);
    });

    const renderListaZmian = () => (
      <>
        {lblZg("1. Która zmiana?", "Twoje zmiany z ostatnich 3 tygodni")}
        <div className="border-2 border-[#DEDCD4] rounded-lg bg-white overflow-hidden" data-lista-zmian-korekty>
          {mojeZmiany.length === 0 && (
            <p className="px-3 py-3.5 text-[15px] text-[#6E6E66]">Brak odbitych zmian z ostatnich 3 tygodni.</p>
          )}
          {mojeZmiany.map((s) => {
            const dow = s.start_time.getDay();
            const czeka = czekaNaKierownika(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => applyKorektaShiftDefaults(s.id)}
                data-zmiana-korekty={s.id}
                className="w-full grid grid-cols-[52px_1fr_auto_minmax(28px,auto)] gap-2 items-center min-h-[60px] px-3 py-1.5 border-b border-[#DEDCD4] last:border-b-0 text-left"
              >
                <span>
                  <b className="block text-[17px] font-extrabold tabular-nums text-[#171714]">{ddmm(s.start_time)}</b>
                  <span className={`text-[14px] font-bold ${dow === 0 || dow === 6 ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
                    {DNI_K[dow]}
                  </span>
                </span>
                <span className="flex gap-1.5 items-center min-w-0">
                  {znaczekStanowiska(s.lokal, s.stanowisko)}
                  <b className="text-[17px] font-semibold tabular-nums whitespace-nowrap text-[#171714]">
                    {fmtHHMM(s.start_time)} –{" "}
                    {s.end_time ? fmtHHMM(s.end_time) : <span className="text-[#DE3A22]">trwa</span>}
                  </b>
                </span>
                <span className="text-[16px] font-extrabold tabular-nums text-[#171714]">
                  {s.end_time ? `${h1((s.end_time - s.start_time) / 3600000)} h` : ""}
                </span>
                {czeka ? (
                  <span className="text-[11px] font-extrabold text-[#8A5300] bg-[#FDF0D8] rounded-md px-1 py-0.5">czeka</span>
                ) : (
                  <ChevronRight size={20} className="text-[#6E6E66] justify-self-end" />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => applyKorektaShiftDefaults("forgot")}
          data-zmiany-nie-ma
          className="w-full mt-2.5 grid grid-cols-[40px_1fr_24px] gap-2.5 items-center min-h-[64px] px-3 py-2 border-2 border-dashed border-[#B7B6AE] rounded-lg text-left"
        >
          <span className="w-9 h-9 rounded-full bg-[#DEDCD4] flex items-center justify-center text-[#171714]">
            <Plus size={22} />
          </span>
          <span>
            <b className="block text-[16px] text-[#171714]">Zmiany nie ma na liście</b>
            <small className="text-[14px] text-[#6E6E66]">zapomniałem/łam odbić — dopisz całą zmianę</small>
          </span>
          <ChevronRight size={20} className="text-[#6E6E66]" />
        </button>
      </>
    );

    const renderPolaMiejsca = (zDaty) => (
      <>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block mb-2.5 min-w-0">
            <span className={podpisCls}>Data</span>
            {zDaty ? (
              <select value={zgPropDate} onChange={(e) => setZgPropDate(e.target.value)} className={poleCls}>
                {dniWstecz.map((ymd) => (
                  <option key={ymd} value={ymd}>
                    {ddmm(zYMD(ymd))} · {DNI_P[zYMD(ymd).getDay()]}
                  </option>
                ))}
              </select>
            ) : (
              <input type="date" value={zgPropDate} onChange={(e) => setZgPropDate(e.target.value)} className={poleCls} />
            )}
          </label>
          <label className="block mb-2.5 min-w-0">
            <span className={podpisCls}>Lokal</span>
            <select value={zgPropLokal} onChange={(e) => setZgPropLokal(e.target.value)} className={poleCls}>
              {lokaleDoKorekty.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block mb-2.5">
          <span className={podpisCls}>Stanowisko</span>
          <select value={zgPropStanowisko} onChange={(e) => setZgPropStanowisko(e.target.value)} className={poleCls}>
            {korektaStanowiska.length === 0 && <option value="">Brak stanowisk w tym lokalu</option>}
            {korektaStanowiska.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </>
    );

    const renderKorekta = () => {
      if (!wybrana) return renderListaZmian();
      const bylStart = zmiana ? fmtHHMM(zmiana.start_time) : null;
      const bylKoniec = zmiana ? (zmiana.end_time ? fmtHHMM(zmiana.end_time) : "") : null;
      const noweH = dlugoscH(zgPropStart, zgPropEnd);
      const stareH = zmiana && zmiana.end_time ? (zmiana.end_time - zmiana.start_time) / 3600000 : null;
      const roznica = noweH != null && stareH != null ? noweH - stareH : null;
      const zRaportu = zmiana && zgPrefillShiftId && String(zgPrefillShiftId) === String(zmiana.id);
      const powody = zapomniana
        ? ["Zapomniałem/łam odbić", "Tablet nie działał", "Inne"]
        : ["Zapomniałem/łam odbić wyjście", "Zapomniałem/łam odbić wejście", "Źle odbite", "Inne"];
      return (
        <>
          {lblZg("1. Która zmiana?")}
          {zapomniana ? (
            <>
              <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-lg border-2 border-dashed border-[#171714] bg-white mb-2.5">
                <div className="flex-1 min-w-0">
                  <b className="block text-[17px] text-[#171714]">Nowa zmiana</b>
                  <span className="text-[14px] text-[#6E6E66]">nie była odbita</span>
                </div>
                <button type="button" onClick={() => applyKorektaShiftDefaults(null)} className={linkCls}>
                  Wybierz z listy
                </button>
              </div>
              {renderPolaMiejsca(true)}
            </>
          ) : (
            <>
              <div
                className="relative grid grid-cols-[auto_1fr_auto] gap-2.5 items-center px-3.5 py-3 rounded-lg border-2 border-[#171714] bg-white"
                data-wybrana-zmiana
              >
                {zRaportu && (
                  <em className="absolute -top-[11px] left-3 not-italic bg-[#FDF0D8] text-[#8A5300] text-[12px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Flag size={12} /> z Raportu
                  </em>
                )}
                <div className="min-w-[76px]">
                  <b className="block text-[22px] font-extrabold tabular-nums text-[#171714]">{ddmm(zmiana.start_time)}</b>
                  <span className="text-[14px] font-bold text-[#6E6E66]">{DNI_P[zmiana.start_time.getDay()]}</span>
                </div>
                <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {znaczekStanowiska(zmiana.lokal, zmiana.stanowisko)}
                  <b className="text-[18px] font-bold tabular-nums whitespace-nowrap text-[#171714]">
                    {bylStart} – {bylKoniec || "trwa"}
                  </b>
                  <small className="basis-full text-[14px] text-[#6E6E66]">
                    {zmiana.lokal}
                    {stareH != null ? ` · zapisane ${h1(stareH)} h` : ""}
                  </small>
                </div>
                <button type="button" onClick={() => applyKorektaShiftDefaults(null)} className={linkCls}>
                  Inna zmiana
                </button>
              </div>
              {/* Zwykle poprawia się same godziny, ale dzień, lokal i
                  stanowisko też bywają źle wybrane — schowane, nie usunięte. */}
              {zgKorektaWiecej ? (
                <div className="mt-3">{renderPolaMiejsca(false)}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => setZgKorektaWiecej(true)}
                  className="mt-2 mx-0.5 text-[14px] font-bold underline text-[#6E6E66]"
                >
                  Inny dzień, lokal albo stanowisko?
                </button>
              )}
            </>
          )}

          {lblZg("2. Jak powinno być?", zapomniana ? "Wpisz godziny pracy" : "Zmień tylko to, co się nie zgadza")}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ["start", "Rozpoczęcie", zgPropStart, setZgPropStart, bylStart],
              ["koniec", "Zakończenie", zgPropEnd, setZgPropEnd, bylKoniec],
            ].map(([klucz, etykieta, wartosc, ustaw, bylo]) => {
              const zmienione = !!zmiana && wartosc !== bylo;
              return (
                <label key={klucz} className="block mb-2.5 min-w-0">
                  <span className={podpisCls}>{etykieta}</span>
                  <input
                    type="time"
                    value={wartosc}
                    onChange={(e) => ustaw(e.target.value)}
                    data-korekta-pole={klucz}
                    className={`w-full h-16 px-3 rounded-lg border-2 text-[26px] font-extrabold tabular-nums text-[#171714] min-w-0 ${
                      zmienione ? "border-[#8A5300] bg-[#FDF0D8]" : "border-[#171714] bg-white"
                    }`}
                  />
                  {zmiana && (
                    <small className={`block mt-1 mx-0.5 text-[14px] font-bold ${zmienione ? "text-[#8A5300]" : "text-[#6E6E66]"}`}>
                      {zmienione ? (bylo ? `było ${bylo}` : "było: nie odbite") : "bez zmian"}
                    </small>
                  )}
                </label>
              );
            })}
          </div>
          {noweH != null && (
            <div className="flex items-baseline gap-2.5 px-3.5 py-3 rounded-lg bg-[#DEDCD4] mb-1" data-korekta-wynik>
              <span className="flex-1 text-[15px] text-[#6E6E66]">Po poprawce</span>
              <b className="text-[24px] font-extrabold tabular-nums text-[#171714]">{h1(noweH)} h</b>
              {roznica != null && (
                <em
                  className={`not-italic text-[16px] font-extrabold ${
                    Math.abs(roznica) > 0.01 ? "text-[#8A5300]" : "text-[#6E6E66]"
                  }`}
                >
                  {Math.abs(roznica) < 0.01 ? "bez zmiany" : `${roznica > 0 ? "+" : "−"}${h1(Math.abs(roznica))} h`}
                </em>
              )}
            </div>
          )}

          {lblZg("3. Dlaczego?", "Wybierz jedno")}
          <div className="flex flex-wrap gap-2 mb-3">
            {powody.map((p) => chip(zgPowod === p, () => setZgPowod(zgPowod === p ? null : p), p))}
          </div>
          <label className="block mb-2.5">
            <span className={podpisCls}>Komentarz (opcjonalnie)</span>
            <textarea
              rows={2}
              value={zgKorektaNote}
              onChange={(e) => setZgKorektaNote(e.target.value)}
              className={tekstCls}
              placeholder="Np. wyszłam o 21:00, nie zdążyłam odbić."
            />
          </label>
          {ramka(
            Flag,
            "Kierownik zatwierdzi albo poprawi te dane. Do czasu decyzji zmiana w Raporcie ma znaczek „czeka”."
          )}
        </>
      );
    };

    // ---------- Wniosek o wolne ----------
    const typWolnego = moznaUrlop ? zgAbsType : "niedostepnosc";
    const renderWolne = () => {
      const dzisY = toLocalYMD(new Date());
      const pierwszy = new Date();
      pierwszy.setDate(1);
      pierwszy.setMonth(pierwszy.getMonth() + zgAbsMies);
      const rok = pierwszy.getFullYear();
      const mies = pierwszy.getMonth();
      const dniMies = new Date(rok, mies + 1, 0).getDate();
      const przesuniecie = (pierwszy.getDay() + 6) % 7;
      const [lo, hi] = [zgAbsStart, zgAbsEnd || zgAbsStart].sort();
      // Kropka „masz zmianę” tylko tam, gdzie pracownik widzi grafik.
      const zaplanowane = new Set(
        bloki.includes("GRAFIK") ? publishedShiftsFor(planShifts, employee).map((p) => p.date) : []
      );
      const klikDzien = (ymd) => {
        if (!zgAbsStart || zgAbsEnd) {
          setZgAbsStart(ymd);
          setZgAbsEnd("");
        } else setZgAbsEnd(ymd);
      };
      const opisZakresu = () => {
        const a = zYMD(lo);
        const b = zYMD(hi);
        const n = Math.round((b - a) / 86400000) + 1;
        if (n === 1) return `${a.getDate()} ${MIES_D[a.getMonth()]} · ${DNI_P[a.getDay()]}`;
        const od = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MIES_D[a.getMonth()]} `;
        return `${od}–${b.getDate()} ${MIES_D[b.getMonth()]} · ${n} dni`;
      };
      const kolizje = lo ? [...zaplanowane].filter((d) => d >= lo && d <= hi).sort() : [];
      const ileRoboczych = lo ? countWorkdays(lo, hi) : 0;
      return (
        <>
          {lblZg("1. Rodzaj")}
          {moznaUrlop ? (
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5">
              {kafelDuzy(zgAbsType === "urlop", () => setZgAbsType("urlop"), null, "Urlop", "8 h za każdy dzień roboczy (bez sob. i niedz.)")}
              {kafelDuzy(
                zgAbsType === "niedostepnosc",
                () => setZgAbsType("niedostepnosc"),
                null,
                "Niedostępność",
                "nie mogę pracować · bez godzin"
              )}
            </div>
          ) : (
            <div className="px-3.5 py-3 rounded-lg border-2 border-[#171714] bg-white" data-tylko-niedostepnosc>
              <b className="block text-[19px] font-extrabold text-[#171714]">Niedostępność</b>
              <span className="text-[14px] leading-[19px] text-[#6E6E66]">
                {typUmowyLabel(typUmowy(employee))} — urlop nie przysługuje. Zaznacz dni, w które nie możesz pracować.
              </span>
            </div>
          )}

          {lblZg("2. Które dni?", "Dotknij pierwszy dzień, potem ostatni. Jeden dzień — dotknij go raz.")}
          <div className="bg-white border-2 border-[#DEDCD4] rounded-lg p-2.5" data-kalendarz-wolnego>
            <div className="grid grid-cols-[48px_1fr_48px] items-center text-center mb-1.5">
              <button
                type="button"
                disabled={zgAbsMies <= 0}
                onClick={() => setZgAbsMies(zgAbsMies - 1)}
                aria-label="Poprzedni miesiąc"
                className="h-11 rounded-lg border-2 border-[#B7B6AE] bg-white flex items-center justify-center text-[#171714] disabled:opacity-30"
              >
                <ChevronLeft size={20} />
              </button>
              <b className="text-[19px] font-extrabold text-[#171714]">
                {MIES_M[mies]} {rok}
              </b>
              <button
                type="button"
                disabled={zgAbsMies >= 12}
                onClick={() => setZgAbsMies(zgAbsMies + 1)}
                aria-label="Następny miesiąc"
                className="h-11 rounded-lg border-2 border-[#B7B6AE] bg-white flex items-center justify-center text-[#171714] disabled:opacity-30"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-y-[3px]">
              {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map((d, i) => (
                <span key={d} className={`text-center text-[13px] font-extrabold py-1 ${i > 4 ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
                  {d}
                </span>
              ))}
              {Array.from({ length: przesuniecie }, (_, i) => (
                <span key={`p${i}`} />
              ))}
              {Array.from({ length: dniMies }, (_, i) => i + 1).map((d) => {
                const ymd = `${rok}-${pad(mies + 1)}-${pad(d)}`;
                const dow = new Date(rok, mies, d).getDay();
                const zaznaczony = !!lo && ymd >= lo && ymd <= hi;
                const przeszly = ymd < dzisY;
                const ma = zaplanowane.has(ymd);
                return (
                  <button
                    key={ymd}
                    type="button"
                    disabled={przeszly}
                    onClick={() => klikDzien(ymd)}
                    data-dzien-wolnego={ymd}
                    className={`relative h-11 text-[17px] font-bold tabular-nums ${
                      zaznaczony
                        ? "bg-[#171714] text-white"
                        : przeszly
                        ? "text-[#C9C6BD]"
                        : dow === 0 || dow === 6
                        ? "text-[#DE3A22]"
                        : "text-[#171714]"
                    } ${zaznaczony && ymd === lo ? "rounded-l-full" : ""} ${zaznaczony && ymd === hi ? "rounded-r-full" : ""}`}
                  >
                    {d}
                    {ma && (
                      <i
                        className={`absolute left-1/2 bottom-1 w-1.5 h-1.5 -ml-[3px] rounded-full ${
                          zaznaczony ? "bg-[#FDF0D8]" : "bg-[#171714]"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-4 text-[13px] text-[#6E6E66] px-1 pt-2 pb-0.5">
              {zaplanowane.size > 0 && (
                <span className="flex items-center gap-1.5">
                  <i className="w-1.5 h-1.5 rounded-full bg-[#171714]" /> masz zmianę
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-full bg-[#171714]" /> wybrane
              </span>
            </div>
          </div>
          {lo && (
            <>
              <div className="grid gap-1.5 px-3.5 py-3 rounded-lg border-2 border-[#171714] bg-white mt-3 mb-1.5" data-wolne-podsumowanie>
                <div className="flex justify-between gap-2.5 items-baseline">
                  <span className="text-[15px] text-[#6E6E66]">Wybrane</span>
                  <b className="text-[17px] font-extrabold text-right text-[#171714]">{opisZakresu()}</b>
                </div>
                {typWolnego === "urlop" && (
                  <div className="flex justify-between gap-2.5 items-baseline">
                    <span className="text-[15px] text-[#6E6E66]">Urlop</span>
                    <b className="text-[17px] font-extrabold text-right text-[#171714]">
                      {ileRoboczych} {robocze(ileRoboczych)} = {ileRoboczych * URLOP_HOURS_PER_DAY} h
                    </b>
                  </div>
                )}
              </div>
              {kolizje.length > 0 &&
                ramka(
                  AlertTriangle,
                  `W tych dniach masz ${kolizje.length === 1 ? "zmianę" : `${kolizje.length} ${odmianaZmian(kolizje.length)}`} (${kolizje
                    .map(dzienMies)
                    .join(", ")}). Po zatwierdzeniu kierownik znajdzie zastępstwo.`,
                  "warn"
                )}
            </>
          )}
          <label className="block mt-3 mb-2.5">
            <span className={podpisCls}>Komentarz (opcjonalnie)</span>
            <textarea
              rows={2}
              value={zgAbsNote}
              onChange={(e) => setZgAbsNote(e.target.value)}
              className={tekstCls}
              placeholder="Np. wyjazd rodzinny"
            />
          </label>
          {ramka(
            Palmtree,
            typWolnego === "urlop"
              ? "Kierownik zatwierdzi albo odrzuci wniosek. Po zatwierdzeniu urlop wpisze się jako godziny (8 h za dzień roboczy)."
              : "Kierownik zatwierdzi albo odrzuci wniosek. Niedostępność nie daje godzin — to informacja, że wtedy nie możesz pracować."
          )}
        </>
      );
    };

    // ---------- Zgłoś problem ----------
    const KATEGORIE = ["Sprzęt / awaria", "Braki towaru", "Czystość / BHP", "Zespół / atmosfera", "Inne"];
    const renderProblem = () => (
      <>
        {lblZg("1. Kto zgłasza?")}
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5">
          {kafelDuzy(!zgAnon, () => setZgAnon(false), User, employee.name, "kierownik wie, kto pisze · odpowie w Wiadomościach")}
          {kafelDuzy(zgAnon, () => setZgAnon(true), EyeOff, "Anonimowo", "nikt nie zobaczy, kto napisał · bez odpowiedzi")}
        </div>
        {lblZg("2. Czego dotyczy?")}
        <div className="flex flex-wrap gap-2 mb-3">
          {KATEGORIE.map((k) => chip(zgKategoria === k, () => setZgKategoria(zgKategoria === k ? null : k), k))}
        </div>
        {zgAnon ? (
          ramka(
            EyeOff,
            "Przy zgłoszeniu anonimowym nie wybierasz zmiany — data i godzina zmiany wskazałyby, kto pisze.",
            "anon"
          )
        ) : (
          <label className="block mb-2.5">
            <span className={podpisCls}>Która zmiana (opcjonalnie)</span>
            <select value={zgShiftId || "none"} onChange={(e) => setZgShiftId(e.target.value)} className={poleCls}>
              <option value="none">Bez konkretnej zmiany</option>
              {recentShiftsForZgloszenie.map((s) => (
                <option key={s.id} value={s.id}>
                  {ddmm(s.start_time)} {DNI_K[s.start_time.getDay()]} · {fmtHHMM(s.start_time)}
                  {s.end_time ? `–${fmtHHMM(s.end_time)}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block mb-2.5">
          <span className={podpisCls}>Opis</span>
          <textarea
            rows={4}
            value={zgText}
            onChange={(e) => setZgText(e.target.value)}
            className={tekstCls}
            placeholder="Np. zepsuta zmywarka, brak rękawic…"
          />
        </label>
        {ramka(
          AlertTriangle,
          zgAnon
            ? "Zgłoszenie anonimowe — kierownik je przeczyta, ale nie może Ci odpowiedzieć."
            : "Kierownik odpowie w Wiadomościach."
        )}
      </>
    );

    // ---------- Moje zgłoszenia ----------
    // Czekające zawsze, rozstrzygnięte z ostatnich 30 dni.
    const granica30 = Date.now() - 30 * 86400000;
    const swiezy = (d) => new Date(d).getTime() > granica30;
    const moje = [
      ...(issues || [])
        .filter(
          (i) =>
            !i.is_anonymous &&
            String(i.user_id) === String(employee.id) &&
            (i.status !== "rozwiazane" || swiezy(i.created_at))
        )
        .map((i) => {
          const korekta = i.type === "correction";
          const byla = korekta && i.shift_id ? shifts.find((s) => String(s.id) === String(i.shift_id)) : null;
          return {
            klucz: `i:${i.id}`,
            kiedy: new Date(i.created_at || 0),
            tytul: korekta
              ? `Korekta${i.proposed_date ? ` · ${dzienMies(i.proposed_date)}` : ""}`
              : `Problem${i.created_at ? ` · ${dzienMies(toLocalYMD(new Date(i.created_at)))}` : ""}`,
            opis: korekta
              ? `${
                  byla && i.status !== "rozwiazane"
                    ? `${fmtHHMM(byla.start_time)}–${byla.end_time ? fmtHHMM(byla.end_time) : "…"} → `
                    : !i.shift_id
                    ? "nowa zmiana "
                    : ""
                }${godz(i.proposed_start_time)}–${godz(i.proposed_end_time)}`
              : i.issue_text || "",
            status:
              i.status === "rozwiazane"
                ? [korekta ? "rozpatrzona" : "rozwiązane", "ok"]
                : ["czeka", "wait"],
          };
        }),
      ...(absences || [])
        .filter(
          (a) =>
            String(a.user_id) === String(employee.id) &&
            a.requested_by !== "manager" &&
            (a.status === "pending" || swiezy(a.created_at))
        )
        .map((a) => ({
          klucz: `a:${a.id}`,
          kiedy: new Date(a.created_at || 0),
          tytul: `${a.type === "urlop" ? "Urlop" : "Wolne"} · ${dzienMies(a.start_date)}${
            a.end_date && a.end_date !== a.start_date ? `–${dzienMies(a.end_date)}` : ""
          }`,
          opis:
            a.type === "urlop"
              ? `${countWorkdays(a.start_date, a.end_date || a.start_date)} ${robocze(
                  countWorkdays(a.start_date, a.end_date || a.start_date)
                )}`
              : "niedostępność",
          status:
            a.status === "approved"
              ? ["zatwierdzony", "ok"]
              : a.status === "rejected"
              ? ["odrzucony", "no"]
              : ["czeka", "wait"],
        })),
    ]
      .sort((a, b) => b.kiedy - a.kiedy)
      .slice(0, 8);
    const plakietka = {
      ok: "bg-[#E2F3E9] text-[#1F7A4A]",
      wait: "bg-[#FDF0D8] text-[#8A5300]",
      no: "bg-[#ECEBE6] text-[#6E6E66]",
    };
    const renderMoje = () => (
      <section data-moje-zgloszenia>
        <h3 className="font-['Archivo'] text-[18px] font-extrabold text-[#171714] mx-0.5 mb-2">Moje zgłoszenia</h3>
        {moje.length === 0 && <p className="text-[15px] text-[#6E6E66] mx-0.5">Nic jeszcze nie wysłano.</p>}
        {moje.map((r) => (
          <div
            key={r.klucz}
            className="flex justify-between gap-2.5 items-center px-3 py-2.5 bg-white border-2 border-[#DEDCD4] rounded-lg mb-1.5"
          >
            <div className="min-w-0">
              <b className="block text-[16px] text-[#171714]">{r.tytul}</b>
              <span className="block text-[14px] text-[#6E6E66] truncate">{r.opis}</span>
            </div>
            <em className={`not-italic flex-none text-[13px] font-extrabold px-2 py-1 rounded-lg whitespace-nowrap ${plakietka[r.status[1]]}`}>
              {r.status[0]}
            </em>
          </div>
        ))}
      </section>
    );

    // ---------- całość ----------
    const gotowe = zgType !== "correction" || wybrana;
    const przyciskWyslij = gotowe && (
      <button
        type="button"
        onClick={
          zgType === "correction" ? handleSendKorekta : zgType === "absence" ? handleSendAbsence : handleSendZgloszenie
        }
        disabled={zgSaving}
        data-wyslij-zgloszenie
        className={przyciskGlownyCls}
      >
        {zgSaving
          ? "Wysyłanie…"
          : zgType === "correction"
          ? "Wyślij poprawkę"
          : zgType === "absence"
          ? "Wyślij wniosek"
          : "Wyślij zgłoszenie"}
      </button>
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
        title={zgType === "correction" ? "Popraw zmianę" : zgType === "absence" ? "Wniosek o wolne" : "Zgłoś problem"}
        imieNadTytulem
        nowyWyglad
        footer={
          przyciskWyslij && (
            // Na telefonie przycisk nad dolnym paskiem, pod kciukiem; na
            // tablecie — pod formularzem.
            <div className="md:hidden flex-shrink-0 px-3.5 pt-2 pb-2.5 bg-[#F1F0EC]">{przyciskWyslij}</div>
          )
        }
      >
        {ukladZmiany({
          glowna: (
            <>
              {kafleTypow}
              {zgType === "correction" ? renderKorekta() : zgType === "absence" ? renderWolne() : renderProblem()}
              {/* Na telefonie „Moje zgłoszenia” tylko pod listą zmian (makieta)
                  — w formularzu zasłaniałyby przycisk. */}
              {zgType === "correction" && !wybrana && <div className="md:hidden mt-[22px]">{renderMoje()}</div>}
            </>
          ),
          bok: renderMoje(),
          przycisk: przyciskWyslij,
        })}
      </Shell>
    );
  }

  return null;
};
