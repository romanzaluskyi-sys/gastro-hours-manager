// @ts-nocheck
// Zatwierdzanie zmian — ekran "Do decyzji". Wszystko, co czeka na podpis
// kierownika: osoby na próbę, zmiany z grafiku bez odbicia, zmiany bez
// zakończenia, giełda, wnioski o wolne i korekty godzin.
//
// Układ według makiety właściciela z 2026-09-25 (design system "Shiftro",
// komponenty ApprovalCard / ApprovalPage / BulkBar / TimeField):
//   1. JEDNA siatka dla każdej sprawy: zaznaczenie · kto · szczegóły · akcje.
//      Oko uczy się jednej karty, a nie sześciu.
//   2. Różnica zamiast dwóch tabel: "Zapisane 09:00–18:00 → Zgłoszone
//      09:00–18:30 +30 min", zmieniona godzina czerwona.
//   3. Główny przycisk mówi, co się stanie ("Dopisz 10 h"), i liczy się na
//      żywo, gdy kierownik poprawia godziny. Stoi zawsze NAJBARDZIEJ Z PRAWEJ.
//   4. Poprawka bez wychodzenia z listy: "Popraw" otwiera panel pod kartą
//      (na telefonie — arkusz od dołu), z krokiem ±15 min, szybkimi godzinami
//      i gotowymi powodami.
//   5. Proste sprawy hurtem: zaznacz → jeden "Zatwierdź N" w pasku na dole.
//   6. Każdą decyzję da się COFNĄĆ przez 6 s — patrz "Decyzje odłożone" niżej.
//
// ⚠️ Zapis dalej idzie przez te same funkcje co wcześniej (resolveCorrection,
// rozliczBrakOdbicia, rozliczPorzucona, …) i przez ten sam zamek na refie —
// nowy wygląd niczego nie zmienia w tym, CO trafia do bazy.
import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  X,
  Pencil,
  HelpCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Palmtree,
  ArrowLeftRight,
  ArrowRight,
  Clock,
  Hourglass,
  UserPlus,
  User,
} from "lucide-react";
import { resolveCorrection, askAboutCorrection, odrzucKorekte } from "../../utils/corrections";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { trimTime, shiftHours, toLocalYMD, publishedShiftsFor } from "../../utils/grafik";
import { monthPlanHours, typWymiany, wzajemnaZmiana } from "../../utils/swaps";
import { zmianyBezOdbicia, rozliczBrakOdbicia } from "../../utils/odbicia";
import { zmianyPorzucone, rozliczPorzucona } from "../../utils/porzucone";
import { czekaNaKoniecOdKierownika } from "../../utils/wpisy";
import {
  probniDoDecyzji,
  zatwierdzProbnego,
  odrzucProbnego,
  godzinyProbnego,
} from "../../utils/probni";
import { pageTitleCls } from "./designTokens";

// ---------------------------------------------------------------------------
// Czas i daty
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");

const fmtHHMM = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");

// "11:00", "11.00", "1100", "930" → minuty od północy; cokolwiek innego → null.
// Kierownik wpisuje godzinę z klawiatury telefonu, na której dwukropek jest
// trzy dotknięcia dalej.
const naMin = (tekst) => {
  const s = String(tekst || "").trim().replace(".", ":");
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1];
  const mm = +m[2];
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};
const zMin = (min) => {
  const x = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};
// Długość zmiany w minutach; koniec przed startem = zmiana przez północ.
const dlugosc = (od, doG) => {
  const a = naMin(od);
  const b = naMin(doG);
  if (a == null || b == null) return null;
  const d = b - a;
  return d <= 0 ? d + 1440 : d;
};
const godzTekst = (min) => `${String(Math.round((min / 60) * 100) / 100).replace(".", ",")} h`;
const roznicaTekst = (min) => {
  const a = Math.abs(min);
  return `${min > 0 ? "+" : "−"}${a < 60 ? `${a} min` : godzTekst(a)}`;
};

const DNI = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
// "ndz 13.09" — dzień tygodnia mówi kierownikowi więcej niż sama data
// ("to była niedziela, wtedy zamykamy później").
const dzienKrotki = (ymd) => {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  return `${DNI[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};
const fmtPLAbs = (ymd) =>
  ymd
    ? new Date(`${ymd}T00:00:00`).toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
const zakresDat = (od, doD) => {
  if (!od) return "";
  if (!doD || doD === od) return `${dzienKrotki(od)}.${od.slice(0, 4)}`;
  const a = new Date(`${od}T00:00:00`);
  return `${pad(a.getDate())}.${pad(a.getMonth() + 1)} – ${fmtPLAbs(doD)}`;
};
const dniOd = (kiedy) => {
  if (!kiedy) return 0;
  const d =
    kiedy instanceof Date
      ? kiedy
      : new Date(String(kiedy).length === 10 ? `${kiedy}T00:00:00` : kiedy);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};
// Sprawa czekająca tydzień i dłużej dostaje podpis — przed wypłatą stare
// pozycje giną w kolejce najłatwiej.
const PROG_CZEKANIA_DNI = 7;

// Podpowiedź godziny zakończenia dla zmiany bez odbitego końca: to, co stało
// w grafiku. Gdy grafiku nie było, pole zostaje PUSTE — podstawiona "teraz"
// albo "start + 8 h" wyglądałaby jak liczba, którą ktoś sprawdził.
const domyslnyKoniec = (poz) => (poz.koniecPlanu ? fmtHHMM(poz.koniecPlanu) : "");

// Jak dawno minął próg — po to, żeby pozycja sprzed trzech dni wyglądała
// inaczej niż ta sprzed godziny.
const odKiedyCzeka = (prog, teraz = new Date()) => {
  const godz = Math.floor((teraz - prog) / 3600000);
  if (godz < 1) return "przed chwilą";
  if (godz < 24) return `${godz} godz. temu`;
  const dni = Math.floor(godz / 24);
  return dni === 1 ? "wczoraj" : `${dni} dni temu`;
};

// ---------------------------------------------------------------------------
// Klasy — wartości z tokenów design systemu "Shiftro" (tokens.json); akcent i
// neutralne tła jak w reszcie panelu (designTokens.ts).
// ---------------------------------------------------------------------------
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] leading-5 whitespace-nowrap transition-colors active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const btnDuchCls =
  "inline-flex items-center gap-2 min-h-[36px] px-3 rounded-lg font-['Archivo'] font-bold text-sm text-[#6E6E66] hover:bg-[#F6F5F1] hover:text-[#171714]";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const wartoscCls = "text-[17px] leading-6 font-bold tabular-nums text-[#171714]";
const chipCls = (wlaczony) =>
  `inline-flex items-center h-[34px] px-3 rounded-full border-[1.5px] text-sm font-semibold whitespace-nowrap ${
    wlaczony
      ? "border-[#171714] bg-[#171714] text-white"
      : "border-[#DEDCD4] bg-white text-[#171714] hover:border-[#171714]"
  }`;
const tonCls = {
  warn: "bg-[#FDF0D8] text-[#8A5300]",
  info: "bg-[#E3EEFB] text-[#1D5FA8]",
  neutral: "bg-[#ECEBE6] text-[#171714]",
};
const tagCls = (ton) =>
  `inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md text-[13px] font-bold whitespace-nowrap ${tonCls[ton]}`;
const ostrzezenieCls = "text-[13px] font-bold text-[#8A5300] mt-0.5";

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu — NIGDY w środku ZatwierdzanieZmian (błąd #10
// w CLAUDE.md: komponent zdefiniowany w komponencie remontuje się przy każdym
// renderze rodzica, a z nim pola godzin, w których kierownik akurat pisze).
// ---------------------------------------------------------------------------

// Pole godziny: wpisz "18:30" albo przesuń o ±15 min. Zmienione względem
// zapisu robi się bursztynowe — widać, który koniec zmiany ruszono.
function PoleCzasu({ value, onChange, zmienione = false, bazowa = "", aria }) {
  const [tekst, setTekst] = useState(value || "");
  useEffect(() => setTekst(value || ""), [value]);
  const zatwierdz = () => {
    const m = naMin(tekst);
    if (m != null) onChange(zMin(m));
    else setTekst(value || "");
  };
  const krok = (d) => {
    const m = naMin(value) ?? naMin(bazowa) ?? 0;
    onChange(zMin(m + d));
  };
  const przyciskCls =
    "w-[34px] flex-shrink-0 text-[#6E6E66] text-lg font-bold hover:bg-[#F6F5F1] hover:text-[#171714]";
  return (
    <span
      className={`inline-flex items-stretch h-11 border-[2px] rounded-md overflow-hidden focus-within:ring-[3px] focus-within:ring-[#DE3A22] focus-within:ring-offset-2 ${
        zmienione ? "border-[#8A5300] bg-[#FDF0D8]" : "border-[#171714] bg-white"
      }`}
    >
      <button type="button" onClick={() => krok(-15)} aria-label="−15 min" className={przyciskCls}>
        −
      </button>
      <input
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        onBlur={zatwierdz}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        inputMode="numeric"
        placeholder="--:--"
        aria-label={aria}
        className="w-16 min-w-0 bg-transparent text-center text-[17px] font-bold tabular-nums outline-none text-[#171714]"
      />
      <button type="button" onClick={() => krok(15)} aria-label="+15 min" className={przyciskCls}>
        +
      </button>
    </span>
  );
}

function Kv({ etykieta, children }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={etykietaCls}>{etykieta}</span>
      <span className={wartoscCls}>{children}</span>
    </div>
  );
}

function Czeka({ dni }) {
  return dni >= PROG_CZEKANIA_DNI ? <p className={ostrzezenieCls}>Czeka {dni} dni</p> : null;
}

function Zaznaczenie({ zaznaczone, onZmiana, dostepne, kto }) {
  return (
    <label
      className={`relative w-11 h-11 -m-2.5 inline-flex items-center justify-center flex-shrink-0 ${
        dostepne ? "cursor-pointer" : "opacity-30 cursor-not-allowed"
      }`}
    >
      <input
        type="checkbox"
        className="peer absolute inset-0 opacity-0 m-0 cursor-pointer disabled:cursor-not-allowed"
        checked={!!zaznaczone}
        disabled={!dostepne}
        onChange={(e) => onZmiana(e.target.checked)}
        aria-label={`Zaznacz: ${kto}`}
      />
      <span
        className={`w-[22px] h-[22px] border-[2px] rounded-[5px] flex items-center justify-center peer-focus-visible:ring-[3px] peer-focus-visible:ring-[#DE3A22] peer-focus-visible:ring-offset-2 ${
          zaznaczone ? "bg-[#DE3A22] border-[#DE3A22] text-white" : "bg-white border-[#171714]"
        }`}
      >
        {zaznaczone && <Check size={14} strokeWidth={3} />}
      </span>
    </label>
  );
}

// Karta jednej sprawy. Na komputerze siatka "zaznaczenie · kto · szczegóły ·
// akcje"; na telefonie kto na górze, szczegóły w zagłębionym bloku, pod nimi
// dwa równe przyciski na całą szerokość.
function Karta({
  kto,
  znacznik,
  meta,
  ostrzezenia,
  zaznaczone,
  onZaznacz,
  moznaZaznaczyc,
  szczegoly,
  akcje,
  notatka,
  pod,
}) {
  return (
    <article
      data-karta
      className={`rounded-xl border-[2px] border-[#171714] transition-colors ${
        zaznaczone ? "bg-[#FFF3EF]" : "bg-white"
      }`}
    >
      <div className="grid grid-cols-[24px_minmax(0,1fr)] md:grid-cols-[24px_minmax(170px,210px)_minmax(0,1fr)_auto] items-start md:items-center gap-x-3.5 gap-y-3 md:gap-5 px-4 pt-3.5 pb-4 md:px-5 md:py-[18px]">
        <Zaznaczenie
          zaznaczone={zaznaczone}
          onZmiana={onZaznacz}
          dostepne={moznaZaznaczyc}
          kto={kto}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-['Archivo'] font-bold text-[18px] leading-6 text-[#171714]">{kto}</p>
            {znacznik}
          </div>
          {meta && <p className="text-[14px] leading-5 text-[#6E6E66]">{meta}</p>}
          {ostrzezenia}
        </div>
        <div className="col-span-2 md:col-span-1 flex items-center gap-x-[22px] gap-y-3 flex-wrap min-w-0 bg-[#F6F5F1] md:bg-transparent rounded-lg md:rounded-none p-3 md:p-0">
          {szczegoly}
        </div>
        {akcje && (
          <div
            data-przyciski
            className="col-span-2 md:col-span-1 grid grid-cols-2 md:flex gap-2 md:justify-end md:[&>button]:min-w-[132px]"
          >
            {akcje}
          </div>
        )}
      </div>
      {notatka && (
        <p className="px-4 md:pl-[64px] md:pr-5 -mt-1 pb-4 text-sm italic text-[#6E6E66]">„{notatka}”</p>
      )}
      {pod}
    </article>
  );
}

function Sekcja({ Icon, tytul, tytulKrotki, liczba, opis, onZaznaczWszystkie, children }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex items-center gap-3 mb-1">
        <h3 className="font-['Archivo'] font-extrabold text-[20px] leading-[26px] text-[#171714] flex items-center gap-2.5 min-w-0">
          <Icon size={20} className="flex-shrink-0" />
          <span className="hidden md:inline">{tytul}</span>
          <span className="md:hidden">{tytulKrotki}</span>
          <span className="tabular-nums">· {liczba}</span>
        </h3>
        {onZaznaczWszystkie && (
          <button type="button" onClick={onZaznaczWszystkie} className={`${btnDuchCls} ml-auto`}>
            <span className="hidden md:inline">Zaznacz wszystkie</span>
            <span className="md:hidden">Zaznacz</span>
          </button>
        )}
      </div>
      {opis && <p className="mb-3 text-[14px] text-[#6E6E66] max-w-[640px]">{opis}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const GRUPY = [
  {
    typ: "probny",
    Icon: UserPlus,
    tytul: "Pracownicy na próbę",
    tab: "Na próbę",
    opis: "Dodani z Tabletu Służbowego. Odbijają godziny, ale nie ma ich w Grafiku i nie mogą się nigdzie zalogować, dopóki nie zdecydujesz.",
  },
  {
    typ: "odbicie",
    Icon: Clock,
    tytul: "Był w grafiku, nie odbił",
    tab: "Brak odbicia",
    opis: "Zwykle zapomniany tablet. Sprawdź godziny i dopisz — bez decyzji nie trafią na wypłatę.",
  },
  {
    typ: "porzucona",
    Icon: Hourglass,
    tytul: "Zmiany bez zakończenia",
    tab: "Bez końca",
    opis: "Ktoś odbił start i wyszedł bez odbicia końca. Godzin nie zgadujemy — do Twojej decyzji liczą się jako zero.",
  },
  {
    typ: "gielda",
    Icon: ArrowLeftRight,
    tytul: "Giełda zmian",
    tab: "Giełda",
    opis: "Pracownicy sami uzgodnili przejęcie albo zamianę zmiany. Ostatnie słowo należy do Ciebie.",
  },
  {
    typ: "wolne",
    Icon: Palmtree,
    tytul: "Wnioski o wolne",
    tab: "Wolne",
    opis: "Urlop dopisuje 8 h za każdy dzień roboczy. Niedostępność tylko blokuje termin w Grafiku.",
  },
  {
    typ: "korekta",
    Icon: Pencil,
    tytul: "Korekty godzin",
    tab: "Korekty",
    opis: "Pracownik prosi o zmianę zapisanych godzin. Na czerwono — co się zmienia.",
  },
];

const POWODY = [
  "Potwierdzone z kierownikiem zmiany",
  "Zamknięcie kasy",
  "Zgodnie z monitoringiem",
];

// Po ilu milisekundach decyzja trafia do bazy. Do tego czasu karta jest tylko
// schowana i "Cofnij" przywraca ją bez żadnego zapisu.
const CZAS_NA_COFNIECIE_MS = 6000;

export default function ZatwierdzanieZmian({
  currentUser,
  shifts,
  setShifts,
  users = [],
  setUsers,
  lokale = [],
  absences = [],
  onOpenEmployee,
  setPlanShifts,
  issues,
  setIssues,
  shiftEdits,
  setShiftEdits,
  hasAccessToLokal,
  availableLokale,
  activeStanowiska,
  pendingAbsences = [],
  onResolveAbsence,
  pendingSwaps = [],
  planShifts = [],
  onResolveSwap,
  zakres = "Cała sieć",
  showMsg,
}) {
  // ⚠️ Zamek na REF, nie na stanie. Wszystkie decyzje na tej stronie pilnował
  // dotąd zwykły `useState` ("busy id"), a stan Reacta aktualizuje się
  // asynchronicznie: dwa wywołania w tym samym takcie widzą to samo `null` i
  // oba przechodzą dalej. 08.09.2026 jedno kliknięcie "Dopisz godziny" dało
  // przez to dwa wiersze godzin oddalone o 3,7 ms — czyli Dawidowi 20 h
  // zamiast 10. Ref zmienia się od razu, więc drugie wejście odpada.
  //
  // To jest zamek na czas jednego zapisu, a nie zabezpieczenie przed
  // duplikatem w ogóle — tym jest pytanie do bazy tuż przed zapisem
  // (znajdzKolizjeWBazie w utils/odbicia.ts i utils/corrections.ts).
  const wTrakcie = useRef(new Set());
  const zajmij = (klucz) => {
    if (wTrakcie.current.has(klucz)) return false;
    wTrakcie.current.add(klucz);
    return true;
  };
  const zwolnij = (klucz) => wTrakcie.current.delete(klucz);

  const [filtr, setFiltr] = useState("all");
  const [zaznaczone, setZaznaczone] = useState({});
  // Poprawione godziny per pozycja — kierownik potrafi poprawiać kilka naraz.
  const [odbicieGodziny, setOdbicieGodziny] = useState({});
  const [porzuconeGodziny, setPorzuconeGodziny] = useState({});
  // Otwarty panel "Popraw" korekty: { id, date, lokal, stanowisko, start,
  // end, reason, miejsce (czy pokazać datę/lokal/stanowisko) }.
  const [edycja, setEdycja] = useState(null);

  // -------------------------------------------------------------------------
  // Listy spraw
  // -------------------------------------------------------------------------
  const brakiOdbicia = zmianyBezOdbicia({
    planShifts,
    shifts,
    users,
    absences,
    lokalOk: hasAccessToLokal,
  });

  // Zmiana, o której koniec pracownik już poprosił (wpis poza oknem
  // tolerancji lokalu), stoi w kolejce korekt z konkretną godziną. Druga
  // pozycja o tę samą zmianę tutaj kazałaby rozstrzygać ją dwa razy.
  const porzucone = zmianyPorzucone({
    shifts,
    planShifts,
    lokale,
    users,
    lokalOk: hasAccessToLokal,
  }).filter((poz) => !czekaNaKoniecOdKierownika(poz.shift, issues));

  const probni = probniDoDecyzji({ users, lokalOk: hasAccessToLokal });

  const rows = issues
    .filter((iss) => iss.type === "correction" && iss.status === "nowe")
    .map((iss) => {
      const existingShift = iss.shift_id ? shifts.find((s) => s.id === iss.shift_id) : null;
      const lokal = existingShift ? existingShift.lokal : iss.proposed_lokal;
      return { issue: iss, existingShift, lokal };
    })
    .filter((r) => hasAccessToLokal(r.lokal))
    .sort((a, b) => new Date(a.issue.created_at) - new Date(b.issue.created_at));

  // Ta sama prośba wysłana dwa razy (podwójne dotknięcie na tablecie, dwa
  // urządzenia). Pierwsza zostaje zwykłą korektą, każda następna dostaje
  // ostrzeżenie i "Odrzuć duplikat" zamiast "Popraw" — zatwierdzone obie
  // dałyby dwa razy te same godziny.
  const odciskKorekty = (iss) =>
    [
      iss.user_id,
      iss.proposed_date,
      iss.proposed_start_time,
      iss.proposed_end_time || "",
      iss.shift_id || "",
    ].join("|");
  const duplikaty = new Set();
  {
    const widziane = new Set();
    for (const r of rows) {
      const k = odciskKorekty(r.issue);
      if (widziane.has(k)) duplikaty.add(r.issue.id);
      widziane.add(k);
    }
  }

  // -------------------------------------------------------------------------
  // Zapisy — te same funkcje co przed nowym wyglądem. Komunikat sukcesu
  // wypadł (o decyzji mówi pasek "Cofnij"); zostają komunikaty BŁĘDÓW, bo
  // przychodzą po zniknięciu paska, kiedy karta wraca na listę.
  // -------------------------------------------------------------------------
  const rozliczZmiane = async (poz, decyzja, koniec) => {
    if (!zajmij(`porzucona:${poz.shift.id}`)) return;
    try {
      await rozliczPorzucona({
        shift: poz.shift,
        decyzja,
        end: koniec,
        kto: currentUser.name,
        shifts,
        setShifts,
      });
    } catch (e) {
      showMsg(`${poz.shift.user_name}: ${e.message || "błąd zapisu"}`, "error");
    }
    zwolnij(`porzucona:${poz.shift.id}`);
  };

  const decyzjaOProbnym = async (user, decyzja) => {
    if (!zajmij(`probny:${user.id}`)) return;
    try {
      const zapisany =
        decyzja === "zatwierdzony" ? await zatwierdzProbnego(user) : await odrzucProbnego(user);
      setUsers((prev) => prev.map((u) => (u.id === zapisany.id ? zapisany : u)));
    } catch (e) {
      showMsg(`${user.name}: ${e.message || "błąd zapisu"}`, "error");
    }
    zwolnij(`probny:${user.id}`);
  };

  const rozliczOdbicie = async (poz, decyzja, godziny) => {
    if (!zajmij(`odbicie:${poz.plan.id}`)) return;
    try {
      await rozliczBrakOdbicia({
        plan: poz.plan,
        user: poz.user,
        decyzja,
        start: godziny.start,
        end: godziny.end,
        kto: currentUser.name,
        shifts,
        setShifts,
        planShifts,
        setPlanShifts,
      });
    } catch (e) {
      showMsg(`${poz.user.name}: ${e.message || "błąd zapisu"}`, "error");
    }
    zwolnij(`odbicie:${poz.plan.id}`);
  };

  const onSaved = (issueId, { shift, shiftEdit }) => {
    setIssues((prev) =>
      prev.map((iss) => (iss.id === issueId ? { ...iss, status: "rozwiazane" } : iss))
    );
    setShifts((prev) => {
      const exists = prev.some((s) => s.id === shift.id);
      return exists ? prev.map((s) => (s.id === shift.id ? shift : s)) : [...prev, shift];
    });
    // shiftEdit bywa pusty, gdy wiersz godzin już istniał i nie tworzyliśmy
    // go drugi raz — patrz znajdzKolizjeWBazie w utils/corrections.ts.
    if (shiftEdit) setShiftEdits((prev) => [...prev, shiftEdit]);
  };

  // `wartosci` i `powod` przychodzą z chwili decyzji — zapis rusza 6 s
  // później, kiedy panel "Popraw" jest już zamknięty.
  const zapiszKorekte = async (row, wartosci, powod) => {
    if (!zajmij(`korekta:${row.issue.id}`)) return;
    try {
      const saved = await resolveCorrection({
        issue: row.issue,
        shifts,
        editorName: currentUser.name,
        finalValues: wartosci || {
          date: row.issue.proposed_date,
          lokal: row.issue.proposed_lokal,
          stanowisko: row.issue.proposed_stanowisko,
          start: row.issue.proposed_start_time,
          end: row.issue.proposed_end_time,
        },
        reason: powod || undefined,
      });
      onSaved(row.issue.id, saved);
    } catch (err) {
      showMsg(`${row.issue.user_name}: ${err.message || "błąd zatwierdzania"}`, "error");
    }
    zwolnij(`korekta:${row.issue.id}`);
  };

  const odrzucDuplikat = async (row) => {
    if (!zajmij(`korekta:${row.issue.id}`)) return;
    try {
      await odrzucKorekte(row.issue);
      setIssues((prev) =>
        prev.map((iss) => (iss.id === row.issue.id ? { ...iss, status: "rozwiazane" } : iss))
      );
    } catch (err) {
      showMsg(`${row.issue.user_name}: ${err.message || "błąd zapisu"}`, "error");
    }
    zwolnij(`korekta:${row.issue.id}`);
  };

  const handleZapytaj = async (row) => {
    try {
      await askAboutCorrection(row.issue, currentUser.name);
      showMsg(`Wysłano pytanie do: ${row.issue.user_name}.`);
    } catch (err) {
      showMsg("Błąd wysyłki pytania.", "error");
    }
  };

  const decyzjaOWolnym = async (absence, decision) => {
    try {
      await onResolveAbsence(absence, decision);
    } catch (err) {
      showMsg(`${absence.user_name}: ${err.message || "błąd zapisu"}`, "error");
    }
  };

  const decyzjaOGieldzie = async (swap, decision) => {
    await onResolveSwap(swap, decision);
  };

  // -------------------------------------------------------------------------
  // Decyzje odłożone o 6 s ("Cofnij").
  //
  // Karta znika od razu, ale zapis rusza dopiero po CZAS_NA_COFNIECIE_MS.
  // "Cofnij" w tym czasie po prostu anuluje zapis — nic w bazie nie trzeba
  // odkręcać. Najgorszy przypadek (przeglądarka zamknięta w tych 6 s mimo
  // pytania) zostawia sprawę w kolejce, czyli tam, gdzie była — bezpieczniej
  // niż zapis, którego nie dałoby się cofnąć.
  //
  // ⚠️ Zapis woła funkcję z NAJNOWSZEGO renderu (akcjeRef), a nie z chwili
  // kliknięcia: w ciągu 6 s poll potrafi podmienić `shifts`, a funkcja ze
  // starą listą nadpisałaby w stanie świeże wiersze starymi.
  // -------------------------------------------------------------------------
  const akcjeRef = useRef({});
  akcjeRef.current = {
    rozliczZmiane,
    decyzjaOProbnym,
    rozliczOdbicie,
    zapiszKorekte,
    odrzucDuplikat,
    decyzjaOWolnym,
    decyzjaOGieldzie,
  };
  const kolejka = useRef([]);
  const [odlozone, setOdlozone] = useState({});
  const [toast, setToast] = useState(null);

  const wykonajPartie = async (partia) => {
    const i = kolejka.current.indexOf(partia);
    if (i < 0) return;
    kolejka.current.splice(i, 1);
    clearTimeout(partia.timer);
    setToast((t) => (t && t.partia === partia ? null : t));
    for (const [nazwa, args] of partia.zadania) {
      await akcjeRef.current[nazwa](...args);
    }
    setOdlozone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => delete n[k]);
      return n;
    });
  };

  // pozycje: [{ klucz, zadanie: [nazwaFunkcji, argumenty] }]
  const decyduj = (pozycje, opis) => {
    if (!pozycje.length) return;
    const partia = {
      klucze: pozycje.map((p) => p.klucz),
      zadania: pozycje.map((p) => p.zadanie),
    };
    partia.timer = setTimeout(() => wykonajPartie(partia), CZAS_NA_COFNIECIE_MS);
    kolejka.current.push(partia);
    setOdlozone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => (n[k] = true));
      return n;
    });
    setZaznaczone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => delete n[k]);
      return n;
    });
    setToast({ partia, opis });
  };

  const cofnij = () => {
    const partia = toast?.partia;
    if (!partia) return;
    clearTimeout(partia.timer);
    kolejka.current = kolejka.current.filter((p) => p !== partia);
    setOdlozone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => delete n[k]);
      return n;
    });
    setToast(null);
  };

  // Wyjście z zakładki nie może zgubić decyzji: wszystko, co czeka, idzie do
  // bazy od razu. Zamknięcie karty przeglądarki w tych 6 s pyta o
  // potwierdzenie — bez pytania zapis nie zdążyłby wyjść.
  useEffect(() => {
    const przyWyjsciu = (e) => {
      if (!kolejka.current.length) return;
      kolejka.current.slice().forEach((p) => wykonajPartie(p));
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", przyWyjsciu);
    return () => {
      window.removeEventListener("beforeunload", przyWyjsciu);
      kolejka.current.slice().forEach((p) => wykonajPartie(p));
    };
  }, []);

  // -------------------------------------------------------------------------
  // Sprawy w jednym kształcie: { klucz, typ, kto, wiek, tak, opisTak, karta }.
  // `tak` = zatwierdzenie (to samo robi "Zatwierdź N" w pasku zaznaczenia);
  // null, gdy tej sprawy nie da się zatwierdzić bez dodatkowej decyzji.
  // -------------------------------------------------------------------------
  const sprawy = [];

  // --- Pracownicy na próbę ---
  for (const u of probni) {
    const klucz = `probny:${u.id}`;
    const godziny = godzinyProbnego(shifts, u);
    const tak = { klucz, zadanie: ["decyzjaOProbnym", [u, "zatwierdzony"]] };
    sprawy.push({
      klucz,
      typ: "probny",
      kto: u.name,
      wiek: dniOd(u.probny_od),
      tak,
      opisTak: `Zatwierdzono: ${u.name}`,
      karta: (z, onZ) => (
        <Karta
          key={klucz}
          kto={u.name}
          meta={[u.default_lokal, u.default_stanowisko, u.probny_od ? `od ${dzienKrotki(u.probny_od)}` : ""]
            .filter(Boolean)
            .join(" · ")}
          ostrzezenia={
            <>
              <Czeka dni={dniOd(u.probny_od)} />
              {u.probny_przez && (
                <p className="text-[12px] text-[#8F8E86] mt-0.5">dodany(-a) na tablecie: {u.probny_przez}</p>
              )}
              {onOpenEmployee && (
                <button
                  type="button"
                  onClick={() => onOpenEmployee(u.id)}
                  className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-[#6E6E66] underline underline-offset-[3px] hover:text-[#171714]"
                >
                  <User size={13} /> Otwórz kartę
                </button>
              )}
            </>
          }
          zaznaczone={z}
          onZaznacz={onZ}
          moznaZaznaczyc
          szczegoly={
            // Liczba godzin jest tu najważniejsza: od niej zależy, czy
            // odrzucenie kogokolwiek kosztuje pieniądze.
            <Kv etykieta="Odbite godziny">
              <span className={tagCls(godziny > 0 ? "warn" : "neutral")}>
                {godziny > 0 ? `${godziny.toFixed(1).replace(".", ",")} h` : "bez godzin"}
              </span>
            </Kv>
          }
          akcje={
            <>
              <button
                type="button"
                className={btnObrysCls}
                onClick={() =>
                  decyduj(
                    [{ klucz, zadanie: ["decyzjaOProbnym", [u, "odrzucony"]] }],
                    `Odrzucono: ${u.name} — konto w archiwum, godziny zostają`
                  )
                }
              >
                <X size={18} /> Odrzuć
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                onClick={() => decyduj([tak], `Zatwierdzono: ${u.name} — uzupełnij kartę`)}
              >
                <Check size={18} /> Zatwierdź
              </button>
            </>
          }
        />
      ),
    });
  }

  // --- Był w grafiku, nie odbił ---
  for (const poz of brakiOdbicia) {
    const klucz = `odbicie:${poz.plan.id}`;
    const planOd = trimTime(poz.plan.start_time);
    const planDo = trimTime(poz.plan.end_time);
    const g = odbicieGodziny[poz.plan.id] || {};
    const od = g.start ?? planOd;
    const doG = g.end ?? planDo;
    const min = dlugosc(od, doG);
    const ustaw = (pole, v) =>
      setOdbicieGodziny((prev) => ({
        ...prev,
        [poz.plan.id]: { ...(prev[poz.plan.id] || {}), [pole]: v },
      }));
    const tak =
      min != null
        ? { klucz, zadanie: ["rozliczOdbicie", [poz, "zapisano", { start: od, end: doG }]] }
        : null;
    sprawy.push({
      klucz,
      typ: "odbicie",
      kto: poz.user.name,
      wiek: dniOd(poz.plan.date),
      tak,
      opisTak: `Dopisano: ${poz.user.name} · ${dzienKrotki(poz.plan.date)}`,
      karta: (z, onZ) => (
        <Karta
          key={klucz}
          kto={poz.user.name}
          meta={[poz.plan.lokal, poz.plan.stanowisko].filter(Boolean).join(" · ")}
          ostrzezenia={<Czeka dni={dniOd(poz.plan.date)} />}
          zaznaczone={z}
          onZaznacz={onZ}
          moznaZaznaczyc={!!tak}
          szczegoly={
            <>
              <Kv etykieta="Dzień">{dzienKrotki(poz.plan.date)}</Kv>
              <div className="flex flex-col gap-1.5">
                <span className={etykietaCls}>Godziny do dopisania</span>
                <span className="inline-flex items-center gap-2 flex-wrap">
                  <PoleCzasu value={od} onChange={(v) => ustaw("start", v)} zmienione={od !== planOd} aria="Wejście" />
                  <span className="text-[#6E6E66] font-bold">–</span>
                  <PoleCzasu value={doG} onChange={(v) => ustaw("end", v)} zmienione={doG !== planDo} aria="Wyjście" />
                </span>
              </div>
            </>
          }
          akcje={
            <>
              <button
                type="button"
                className={btnObrysCls}
                onClick={() =>
                  decyduj(
                    [{ klucz, zadanie: ["rozliczOdbicie", [poz, "odrzucono", {}]] }],
                    `Oznaczono „nie było zmiany”: ${poz.user.name}`
                  )
                }
              >
                <X size={18} className="hidden md:block" /> Nie było zmiany
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                disabled={!tak}
                onClick={() =>
                  decyduj([tak], `Dopisano ${godzTekst(min)}: ${poz.user.name} · ${dzienKrotki(poz.plan.date)}`)
                }
              >
                <Check size={18} /> Dopisz {min != null ? godzTekst(min) : ""}
              </button>
            </>
          }
        />
      ),
    });
  }

  // --- Zmiany bez zakończenia ---
  for (const poz of porzucone) {
    const klucz = `porzucona:${poz.shift.id}`;
    const start = fmtHHMM(poz.shift.start_time);
    const koniec = porzuconeGodziny[poz.shift.id] ?? domyslnyKoniec(poz);
    const min = koniec ? dlugosc(start, koniec) : null;
    const tak = min != null ? { klucz, zadanie: ["rozliczZmiane", [poz, "zapisano", koniec]] } : null;
    const dzien = toLocalYMD(poz.shift.start_time);
    sprawy.push({
      klucz,
      typ: "porzucona",
      kto: poz.shift.user_name,
      wiek: dniOd(poz.prog),
      tak,
      opisTak: `Zapisano godziny: ${poz.shift.user_name} · ${dzienKrotki(dzien)}`,
      karta: (z, onZ) => (
        <Karta
          key={klucz}
          kto={poz.shift.user_name}
          meta={[poz.shift.lokal, poz.shift.stanowisko].filter(Boolean).join(" · ")}
          ostrzezenia={
            <>
              <Czeka dni={dniOd(poz.prog)} />
              <p className="text-[12px] text-[#8F8E86] mt-0.5">
                {poz.powod === "grafik"
                  ? `wg grafiku do ${fmtHHMM(poz.koniecPlanu)}, minęło ${poz.tolerancja} godz. tolerancji`
                  : `poza grafikiem, ponad ${poz.maks} godz.`}{" "}
                · {odKiedyCzeka(poz.prog)}
              </p>
            </>
          }
          zaznaczone={z}
          onZaznacz={onZ}
          moznaZaznaczyc={!!tak}
          szczegoly={
            <>
              <Kv etykieta="Dzień">{dzienKrotki(dzien)}</Kv>
              <Kv etykieta="Start">{start}</Kv>
              <div className="flex flex-col gap-1.5">
                <span className={etykietaCls}>Koniec</span>
                <PoleCzasu
                  value={koniec}
                  bazowa={start}
                  onChange={(v) => setPorzuconeGodziny((prev) => ({ ...prev, [poz.shift.id]: v }))}
                  aria="Koniec zmiany"
                />
              </div>
            </>
          }
          akcje={
            <>
              <button
                type="button"
                className={btnObrysCls}
                onClick={() =>
                  decyduj(
                    [{ klucz, zadanie: ["rozliczZmiane", [poz, "odrzucono", null]] }],
                    `Oznaczono „nie było zmiany”: ${poz.shift.user_name}`
                  )
                }
              >
                <X size={18} className="hidden md:block" /> Nie było zmiany
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                disabled={!tak}
                onClick={() => decyduj([tak], `Zapisano ${godzTekst(min)}: ${poz.shift.user_name}`)}
              >
                <Check size={18} /> {min != null ? `Zapisz ${godzTekst(min)}` : "Podaj koniec"}
              </button>
            </>
          }
        />
      ),
    });
  }

  // --- Giełda zmian ---
  for (const sw of pendingSwaps) {
    const klucz = `gielda:${sw.id}`;
    const ps = planShifts.find((p) => String(p.id) === String(sw.grafik_shift_id));
    const typ = typWymiany(sw);
    const wz = wzajemnaZmiana(sw, planShifts);
    const moznaZatwierdzic = !!ps && !(typ === "zamiana" && !wz);
    const tak = moznaZatwierdzic ? { klucz, zadanie: ["decyzjaOGieldzie", [sw, "approve"]] } : null;
    // Różnica godzin w miesiącu dla obu stron — bez niej nie da się
    // odpowiedzialnie zdecydować, gdy ktoś pracuje na etat. Przy zamianie każda
    // strona i bierze, i oddaje; zmiana spoza tego miesiąca liczy się zerem.
    let strony = [];
    if (ps) {
      const mies = ps.date.slice(0, 7);
      const h = shiftHours(ps);
      const hw = typ === "zamiana" && wz && wz.date.slice(0, 7) === mies ? shiftHours(wz) : 0;
      strony = [
        {
          osoba: sw.taker_user_name,
          teraz: monthPlanHours(planShifts, { id: sw.taker_user_id, name: sw.taker_user_name }, mies),
          delta: h - hw,
        },
        {
          osoba: sw.author_user_name,
          teraz: monthPlanHours(planShifts, { id: sw.author_user_id, name: sw.author_user_name }, mies),
          delta: hw - h,
        },
      ];
    }
    sprawy.push({
      klucz,
      typ: "gielda",
      kto: sw.taker_user_name,
      wiek: dniOd(sw.created_at),
      tak,
      opisTak: `Zatwierdzono giełdę: ${sw.taker_user_name}`,
      karta: (z, onZ) => (
        <Karta
          key={klucz}
          kto={sw.taker_user_name}
          znacznik={typ === "oddanie" ? <span className={tagCls("neutral")}>oddane wprost</span> : null}
          meta={
            typ === "zamiana"
              ? `zamienia się z: ${sw.author_user_name}`
              : `przejmuje od: ${sw.author_user_name}`
          }
          ostrzezenia={<Czeka dni={dniOd(sw.created_at)} />}
          zaznaczone={z}
          onZaznacz={onZ}
          moznaZaznaczyc={!!tak}
          szczegoly={
            <>
              <Kv etykieta="Dzień">{ps ? dzienKrotki(ps.date) : dzienKrotki(sw.date)}</Kv>
              <Kv etykieta="Zmiana">
                {ps ? `${trimTime(ps.start_time)}–${trimTime(ps.end_time)}` : "już nie istnieje"}
              </Kv>
              {ps && <Kv etykieta="Gdzie">{`${ps.stanowisko} · ${ps.lokal}`}</Kv>}
              {/* Przy zamianie kierownik musi zobaczyć OBIE zmiany — zatwierdza
                  dwa przepisania naraz, a druga strona jest tak samo wiążąca. */}
              {typ === "zamiana" && (
                <Kv etykieta={`W zamian → ${sw.author_user_name}`}>
                  {wz ? (
                    `${dzienKrotki(wz.date)} · ${trimTime(wz.start_time)}–${trimTime(wz.end_time)}`
                  ) : (
                    <span className="text-[#DE3A22]">druga zmiana już nie istnieje</span>
                  )}
                </Kv>
              )}
              {strony.length > 0 && (
                <div className="basis-full flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-[#6E6E66]">
                  {strony.map((r) => (
                    <span key={r.osoba} className="tabular-nums">
                      <span className="font-bold text-[#171714]">{r.osoba}</span>{" "}
                      {Math.round(r.teraz * 10) / 10} h → {Math.round((r.teraz + r.delta) * 10) / 10} h{" "}
                      <span className="font-extrabold text-[#171714]">
                        (
                        {r.delta === 0
                          ? "bez zmian"
                          : `${r.delta > 0 ? "+" : "−"}${Math.round(Math.abs(r.delta) * 10) / 10} h`}
                        )
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </>
          }
          notatka={sw.note}
          akcje={
            <>
              <button
                type="button"
                className={btnObrysCls}
                onClick={() =>
                  decyduj(
                    [{ klucz, zadanie: ["decyzjaOGieldzie", [sw, "reject"]] }],
                    `Odrzucono giełdę: ${sw.taker_user_name}`
                  )
                }
              >
                <X size={18} /> Odrzuć
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                disabled={!tak}
                onClick={() => decyduj([tak], `Zatwierdzono giełdę: ${sw.taker_user_name}`)}
              >
                <Check size={18} /> Zatwierdź
              </button>
            </>
          }
        />
      ),
    });
  }

  // --- Wnioski o wolne ---
  for (const a of pendingAbsences) {
    const klucz = `wolne:${a.id}`;
    const dniRobocze = countWorkdays(a.start_date, a.end_date);
    const urlop = a.type === "urlop";
    const godziny = urlop ? dniRobocze * URLOP_HOURS_PER_DAY : 0;
    const tak = { klucz, zadanie: ["decyzjaOWolnym", [a, "approved"]] };
    sprawy.push({
      klucz,
      typ: "wolne",
      kto: a.user_name || "Pracownik",
      wiek: dniOd(a.created_at),
      tak,
      opisTak: `Zatwierdzono wolne: ${a.user_name}`,
      karta: (z, onZ) => (
        <Karta
          key={klucz}
          kto={a.user_name || "Pracownik"}
          znacznik={<span className={tagCls(urlop ? "info" : "neutral")}>{urlop ? "Urlop" : "Niedostępność"}</span>}
          meta={a.lokal}
          ostrzezenia={<Czeka dni={dniOd(a.created_at)} />}
          zaznaczone={z}
          onZaznacz={onZ}
          moznaZaznaczyc
          szczegoly={
            <>
              <Kv etykieta="Termin">{zakresDat(a.start_date, a.end_date)}</Kv>
              <Kv etykieta="Dni robocze">{dniRobocze}</Kv>
              <Kv etykieta="Do godzin">{urlop ? `+${godziny} h` : "—"}</Kv>
              {!urlop && (
                <span className={tagCls("neutral")}>
                  <Info size={15} /> Tylko blokada w Grafiku
                </span>
              )}
            </>
          }
          notatka={a.note}
          akcje={
            <>
              <button
                type="button"
                className={btnObrysCls}
                onClick={() =>
                  decyduj(
                    [{ klucz, zadanie: ["decyzjaOWolnym", [a, "rejected"]] }],
                    `Odrzucono wniosek: ${a.user_name}`
                  )
                }
              >
                <X size={18} /> Odrzuć
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                onClick={() => decyduj([tak], `Zatwierdzono wolne: ${a.user_name}`)}
              >
                <Check size={18} /> Zatwierdź
              </button>
            </>
          }
        />
      ),
    });
  }

  // --- Korekty godzin ---
  for (const row of rows) {
    const iss = row.issue;
    const klucz = `korekta:${iss.id}`;
    const zm = row.existingShift;
    const zapOd = zm ? fmtHHMM(zm.start_time) : "";
    const zapDo = zm && zm.end_time ? fmtHHMM(zm.end_time) : "";
    // Bez proponowanego końca przy ISTNIEJĄCEJ zmianie koniec się nie zmienia
    // (resolveCorrection go zachowuje) — pokazujemy ten, który jest.
    const zgOd = iss.proposed_start_time || "";
    const zgDo = iss.proposed_end_time || zapDo;
    const minZap = zapOd && zapDo ? dlugosc(zapOd, zapDo) : null;
    const minZg = zgOd && zgDo ? dlugosc(zgOd, zgDo) : null;
    const roznica = minZap != null && minZg != null ? minZg - minZap : null;
    const duplikat = duplikaty.has(iss.id);
    // Zatwierdzić da się także prośbę bez końca, gdy dotyczy istniejącej
    // zmiany — koniec zostaje wtedy nietknięty. Nowy wpis bez końca wymaga
    // pytania do pracownika.
    const moznaZatwierdzic = !!(iss.proposed_end_time || zm) && !duplikat;
    const tak = moznaZatwierdzic ? { klucz, zadanie: ["zapiszKorekte", [row, null, null]] } : null;
    // Grafik tego dnia (jeśli był) — pod szybką godziną "Jak w grafiku".
    const zGrafiku = publishedShiftsFor(planShifts, { id: iss.user_id, name: iss.user_name }).find(
      (p) => p.date === iss.proposed_date && (!row.lokal || p.lokal === row.lokal)
    );
    const otwarta = edycja && edycja.id === iss.id;

    const otworzEdycje = () =>
      setEdycja({
        id: iss.id,
        date: iss.proposed_date || "",
        lokal: iss.proposed_lokal || row.lokal || availableLokale[0]?.name || "",
        stanowisko: iss.proposed_stanowisko || zm?.stanowisko || "",
        start: zgOd,
        end: zgDo,
        reason: "",
        miejsce: false,
      });

    const zapiszEdycje = () => {
      if (!edycja.reason.trim()) {
        return showMsg("Podaj powód korekty — pracownik go zobaczy.", "error");
      }
      if (naMin(edycja.start) == null) {
        return showMsg("Podaj godzinę wejścia.", "error");
      }
      const wartosci = {
        date: edycja.date,
        lokal: edycja.lokal,
        stanowisko: edycja.stanowisko,
        start: edycja.start,
        end: edycja.end,
      };
      const powod = edycja.reason.trim();
      setEdycja(null);
      decyduj(
        [{ klucz, zadanie: ["zapiszKorekte", [row, wartosci, powod]] }],
        `Poprawiono i zatwierdzono: ${iss.user_name}`
      );
    };

    const minEdycji = otwarta ? dlugosc(edycja.start, edycja.end) : null;
    const panel = otwarta && (
      <>
        {/* Na telefonie panel jest arkuszem od dołu — pod kartą nie byłoby go
            widać nad klawiaturą. Jeden element, dwa układy. */}
        <div
          className="md:hidden fixed inset-0 z-40 bg-[rgba(20,19,17,0.45)]"
          onClick={() => setEdycja(null)}
        />
        <div
          role="dialog"
          aria-label="Popraw godziny"
          data-panel-popraw
          className="fixed md:static inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto md:overflow-visible bg-white md:bg-[#F6F5F1] rounded-t-[20px] md:rounded-none md:rounded-b-[10px] border-t-[2px] border-[#171714] md:border-t-[1.5px] md:border-[#DEDCD4] px-4 pt-2.5 pb-8 md:pr-5 md:pb-5 md:pt-[18px] md:pl-[64px]"
        >
          <div className="md:hidden w-11 h-[5px] rounded bg-[#DEDCD4] mx-auto mb-3" />
          <div className="md:hidden mb-3.5">
            <h3 className="font-['Archivo'] font-extrabold text-[20px]">Popraw godziny</h3>
            <p className="text-sm text-[#6E6E66]">
              {iss.user_name} · {row.lokal} · {dzienKrotki(edycja.date)}
            </p>
          </div>
          <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-end gap-3 md:gap-5">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className={etykietaCls}>Wejście</span>
              <PoleCzasu
                value={edycja.start}
                onChange={(v) => setEdycja((e) => ({ ...e, start: v }))}
                zmienione={!!zapOd && edycja.start !== zapOd}
                aria="Wejście"
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className={etykietaCls}>Wyjście</span>
              <PoleCzasu
                value={edycja.end}
                bazowa={edycja.start}
                onChange={(v) => setEdycja((e) => ({ ...e, end: v }))}
                zmienione={!!zapDo && edycja.end !== zapDo}
                aria="Wyjście"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <span className={etykietaCls}>Szybko</span>
              <div className="flex gap-2 flex-wrap">
                {zGrafiku && (
                  <button
                    type="button"
                    className={chipCls(false)}
                    onClick={() =>
                      setEdycja((e) => ({
                        ...e,
                        start: trimTime(zGrafiku.start_time),
                        end: trimTime(zGrafiku.end_time),
                      }))
                    }
                  >
                    Jak w grafiku · {trimTime(zGrafiku.end_time)}
                  </button>
                )}
                {zm && zapDo && (
                  <button
                    type="button"
                    className={chipCls(false)}
                    onClick={() => setEdycja((e) => ({ ...e, start: zapOd, end: zapDo }))}
                  >
                    Jak zapisane · {zapDo}
                  </button>
                )}
                <button
                  type="button"
                  className={chipCls(false)}
                  onClick={() => setEdycja((e) => ({ ...e, start: zgOd, end: zgDo }))}
                >
                  Jak zgłoszone{zgDo ? ` · ${zgDo}` : ""}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-4">
            <span className={etykietaCls}>Powód korekty · widzi go pracownik</span>
            <input
              value={edycja.reason}
              onChange={(e) => setEdycja({ ...edycja, reason: e.target.value })}
              placeholder="Np. potwierdzone z kierownikiem zmiany"
              className="h-11 w-full px-3 border-[2px] border-[#171714] rounded-md bg-white text-[15px]"
            />
            <div className="flex gap-2 flex-wrap">
              {POWODY.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={chipCls(edycja.reason === p)}
                  onClick={() => setEdycja({ ...edycja, reason: p })}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {edycja.miejsce && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="flex flex-col gap-1.5">
                <span className={etykietaCls}>Data</span>
                <input
                  type="date"
                  value={edycja.date}
                  onChange={(e) => setEdycja({ ...edycja, date: e.target.value })}
                  className="h-11 px-3 border-[2px] border-[#171714] rounded-md bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={etykietaCls}>Lokal</span>
                <select
                  value={edycja.lokal}
                  onChange={(e) => setEdycja({ ...edycja, lokal: e.target.value })}
                  className="h-11 px-3 border-[2px] border-[#171714] rounded-md bg-white"
                >
                  {availableLokale.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={etykietaCls}>Stanowisko</span>
                <select
                  value={edycja.stanowisko}
                  onChange={(e) => setEdycja({ ...edycja, stanowisko: e.target.value })}
                  className="h-11 px-3 border-[2px] border-[#171714] rounded-md bg-white"
                >
                  {activeStanowiska
                    .filter((s) => s.lokal_name === edycja.lokal)
                    .map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {!edycja.miejsce && (
              <button
                type="button"
                onClick={() => setEdycja({ ...edycja, miejsce: true })}
                className="text-sm font-bold text-[#6E6E66] underline underline-offset-[3px]"
              >
                Zmień datę, lokal lub stanowisko
              </button>
            )}
            <span className="ml-auto text-[#6E6E66] text-sm">
              Do wypłaty:{" "}
              <b className="text-[#171714] tabular-nums">{minEdycji != null ? godzTekst(minEdycji) : "—"}</b>
            </span>
            <div className="basis-full md:basis-auto grid grid-cols-[1fr_1.6fr] md:flex gap-2 mt-2 md:mt-0">
              <button type="button" className={btnObrysCls} onClick={() => setEdycja(null)}>
                Anuluj
              </button>
              <button type="button" className={btnGlownyCls} onClick={zapiszEdycje}>
                <Check size={18} /> Zapisz i zatwierdź
              </button>
            </div>
          </div>
        </div>
      </>
    );

    sprawy.push({
      klucz,
      typ: "korekta",
      kto: iss.user_name || "Anonim",
      wiek: dniOd(iss.created_at),
      tak,
      opisTak: `Zatwierdzono: ${iss.user_name}`,
      karta: (z, onZ) => (
        <Karta
          key={klucz}
          kto={iss.user_name || "Anonim"}
          meta={[row.lokal, iss.proposed_stanowisko || zm?.stanowisko].filter(Boolean).join(" · ")}
          ostrzezenia={
            <>
              <Czeka dni={dniOd(iss.created_at)} />
              {duplikat && (
                <p className={`${ostrzezenieCls} flex items-center gap-1`}>
                  <AlertTriangle size={13} /> Takie samo jak wyżej
                </p>
              )}
            </>
          }
          zaznaczone={z}
          onZaznacz={onZ}
          moznaZaznaczyc={!!tak}
          szczegoly={
            <>
              <Kv etykieta="Dzień">{dzienKrotki(iss.proposed_date)}</Kv>
              {/* "Zapisane", a nie "Grafik": po lewej stoi to, co JUŻ jest w
                  Rejestrze godzin (odbicie), a nie plan. Grafik tego dnia jest
                  pod szybką godziną w panelu "Popraw". */}
              <Kv etykieta="Zapisane">
                {zm ? (
                  `${zapOd}–${zapDo || "trwa"}`
                ) : (
                  <span className="text-[#8F8E86] font-medium">brak — nowy wpis</span>
                )}
              </Kv>
              <ArrowRight size={18} className="hidden md:block self-end mb-[3px] text-[#6E6E66]" />
              <Kv etykieta="Zgłoszone">
                <span className={zm && zgOd !== zapOd ? "text-[#DE3A22]" : ""}>{zgOd || "—"}</span>–
                <span className={zm && zgDo !== zapDo ? "text-[#DE3A22]" : ""}>{zgDo || "brak"}</span>
              </Kv>
              {roznica != null && roznica !== 0 && (
                <span
                  className={`inline-flex items-center h-[26px] px-[9px] rounded-md font-extrabold text-[14px] tabular-nums ${
                    roznica > 0 ? tonCls.warn : tonCls.info
                  }`}
                >
                  {roznicaTekst(roznica)}
                </span>
              )}
            </>
          }
          notatka={iss.issue_text}
          akcje={
            otwarta ? null : (
              <>
                {duplikat ? (
                  <button
                    type="button"
                    className={btnObrysCls}
                    onClick={() =>
                      decyduj(
                        [{ klucz, zadanie: ["odrzucDuplikat", [row]] }],
                        `Odrzucono duplikat: ${iss.user_name}`
                      )
                    }
                  >
                    <X size={18} className="hidden md:block" /> Odrzuć duplikat
                  </button>
                ) : (
                  <button type="button" className={btnObrysCls} onClick={otworzEdycje}>
                    <Pencil size={18} /> Popraw
                  </button>
                )}
                {tak || duplikat ? (
                  <button
                    type="button"
                    className={btnGlownyCls}
                    disabled={!tak}
                    onClick={() =>
                      decyduj([tak], `Zatwierdzono: ${iss.user_name} · ${dzienKrotki(iss.proposed_date)}`)
                    }
                  >
                    <Check size={18} /> Zatwierdź
                  </button>
                ) : (
                  <button type="button" className={btnGlownyCls} onClick={() => handleZapytaj(row)}>
                    <HelpCircle size={18} /> Zapytaj
                  </button>
                )}
              </>
            )
          }
          pod={panel}
        />
      ),
    });
  }

  // -------------------------------------------------------------------------
  // Widok
  // -------------------------------------------------------------------------
  const widoczne = sprawy.filter((s) => !odlozone[s.klucz]);
  const lacznie = widoczne.length;
  const liczbaTypu = (typ) => widoczne.filter((s) => s.typ === typ).length;
  const najstarsza = widoczne.reduce((m, s) => Math.max(m, s.wiek || 0), 0);
  const zaznaczoneSprawy = widoczne.filter((s) => zaznaczone[s.klucz] && s.tak);
  const aktywnyFiltr = filtr === "all" || liczbaTypu(filtr) > 0 ? filtr : "all";

  const zaznaczGrupe = (typ) => {
    const doZaznaczenia = widoczne.filter((s) => s.typ === typ && s.tak);
    const wszystkie = doZaznaczenia.every((s) => zaznaczone[s.klucz]);
    setZaznaczone((prev) => {
      const n = { ...prev };
      doZaznaczenia.forEach((s) => (n[s.klucz] = !wszystkie));
      return n;
    });
  };

  const zatwierdzZaznaczone = () => {
    const n = zaznaczoneSprawy.length;
    if (!n) return;
    decyduj(
      zaznaczoneSprawy.map((s) => s.tak),
      n === 1 ? zaznaczoneSprawy[0].opisTak : `Zatwierdzono ${n} ${n < 5 ? "sprawy" : "spraw"}`
    );
  };

  const imionaZaznaczonych = [...new Set(zaznaczoneSprawy.map((s) => s.kto))].join(", ");

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-[18px]">
        <h2 className={`${pageTitleCls} md:text-[30px] md:leading-9`}>
          Do decyzji · <span className="tabular-nums">{lacznie}</span>
        </h2>
        <p className="mt-1 text-[#6E6E66]">
          {zakres}
          {lacznie > 0 &&
            ` · ${
              najstarsza >= 1
                ? `najstarsza sprawa czeka ${najstarsza} ${najstarsza === 1 ? "dzień" : "dni"}`
                : "wszystko z ostatniej doby"
            }`}
        </p>
      </div>

      {lacznie > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 [scrollbar-width:none]" role="tablist">
          {[{ typ: "all", tab: "Wszystkie", liczba: lacznie }]
            .concat(GRUPY.filter((g) => liczbaTypu(g.typ) > 0).map((g) => ({ ...g, liczba: liczbaTypu(g.typ) })))
            .map((g) => {
              const wl = aktywnyFiltr === g.typ;
              return (
                <button
                  key={g.typ}
                  type="button"
                  role="tab"
                  aria-selected={wl}
                  onClick={() => setFiltr(g.typ)}
                  className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap flex-shrink-0 ${
                    wl ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714]"
                  }`}
                >
                  {g.tab}
                  <span className={`tabular-nums ${wl ? "opacity-75" : "text-[#6E6E66]"}`}>{g.liczba}</span>
                </button>
              );
            })}
        </div>
      )}

      {lacznie === 0 && (
        <div className="text-center py-12 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
          <b className="block text-[#171714] text-[18px] mb-1">Wszystko zatwierdzone</b>
          Godziny są już w Rejestrze godzin.
        </div>
      )}

      {/* Kolejność grup: najpierw osoby na próbę (dzień próbny trwa dzień, a
          spóźniona decyzja jest tyle samo warta co jej brak), korekty na końcu. */}
      {GRUPY.map((g) => {
        if (aktywnyFiltr !== "all" && aktywnyFiltr !== g.typ) return null;
        const lista = widoczne.filter((s) => s.typ === g.typ);
        if (!lista.length) return null;
        return (
          <Sekcja
            key={g.typ}
            Icon={g.Icon}
            tytul={g.tytul}
            tytulKrotki={g.tab}
            liczba={lista.length}
            opis={g.opis}
            onZaznaczWszystkie={lista.some((s) => s.tak) ? () => zaznaczGrupe(g.typ) : null}
          >
            {lista.map((s) =>
              s.karta(!!zaznaczone[s.klucz], (v) => setZaznaczone((prev) => ({ ...prev, [s.klucz]: v })))
            )}
          </Sekcja>
        );
      })}

      {lacznie > 0 && (
        <div className="mt-7 flex gap-2.5 items-start text-sm text-[#6E6E66]">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <p>
            Zatwierdzone trafiają do Rejestru godzin i arkusza rozliczeniowego. Każda korekta zapisuje,
            kto i kiedy zmienił godzinę.
          </p>
        </div>
      )}

      {/* Pasek na dole: zaznaczenie ma pierwszeństwo przed paskiem "Cofnij".
          Hurtem tylko ZATWIERDZAMY — odrzucenie zostaje decyzją podejmowaną
          karta po karcie. */}
      {(zaznaczoneSprawy.length > 0 || toast) && (
        <div className="sticky bottom-0 z-30 mt-5">
          {zaznaczoneSprawy.length > 0 ? (
            <div
              data-pasek-zaznaczenia
              className="flex flex-wrap md:flex-nowrap items-center gap-3 p-2.5 pl-[18px] bg-[#171714] text-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
            >
              <span className="font-bold">
                Zaznaczono {zaznaczoneSprawy.length}
                <small className="font-medium opacity-75 text-sm ml-1.5">{imionaZaznaczonych}</small>
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setZaznaczone({})}
                className="inline-flex items-center min-h-[44px] px-3 rounded-lg font-bold text-[15px] text-white/80 hover:text-white"
              >
                Wyczyść
              </button>
              <button type="button" className={btnGlownyCls} onClick={zatwierdzZaznaczone}>
                <Check size={18} /> Zatwierdź {zaznaczoneSprawy.length}
              </button>
            </div>
          ) : (
            <div
              role="status"
              data-pasek-cofnij
              className="flex items-center gap-3 p-2.5 pl-3.5 bg-[#171714] text-white rounded-lg font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.22)] max-w-[560px]"
            >
              <span className="w-[26px] h-[26px] rounded-full bg-[#E2F3E9] text-[#1F7A4A] flex items-center justify-center flex-shrink-0">
                <Check size={15} strokeWidth={3} />
              </span>
              <span className="min-w-0">{toast.opis}</span>
              <button
                type="button"
                onClick={cofnij}
                className="ml-auto px-2.5 py-2 font-extrabold underline underline-offset-[3px]"
              >
                Cofnij
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
