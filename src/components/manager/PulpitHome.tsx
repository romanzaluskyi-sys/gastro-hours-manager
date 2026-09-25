// @ts-nocheck
// Pulpit kierownika — układ z makiety właściciela z 2026-09-25 (design system
// "Shiftro", DashboardDesktop / DashboardMobile). Kolejność to kolejność, w
// jakiej kierownik ma coś ZROBIĆ, nie kolejność tabel w bazie:
//   1. "Do zrobienia teraz" — zamknięcie wczorajszego dnia per lokal i sprawy
//      do decyzji. Proste korekty godzin zatwierdza się tu jednym ✓.
//   2. "Liczby" — cztery kafelki z jednostką i UCZCIWYM porównaniem: pn–czw z
//      pn–czw, 1–25 z 1–25. Okres niepełny porównany z pełnym zawsze wygląda
//      na spadek i uczy ignorować strzałki.
//   3. Panele: kto teraz na zmianie (najpierw ten, kto powinien, a nie odbił),
//      terminy dokumentów (luki w danych osobno od prawdziwych terminów) i
//      zadania dziś.
//
// ⚠️ Czerwień jest dla akcji głównej i liczników — NIE dla "gorszego wyniku".
// Wyższe godziny ani wyższy koszt nie są same z siebie porażką (ta sama zasada
// co w Raportach i kosztach). Bursztyn tylko tam, gdzie jest co poprawić.
//
// ⚠️ Kafelka "Do decyzji" nie ma świadomie: tę liczbę mówią już karta
// "Wymaga decyzji" i znaczek w menu. Trzecie miejsce z tą samą liczbą to trzecie
// miejsce, w którym może się rozjechać.
import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Hourglass,
  Lock,
  Palmtree,
  Pencil,
  UserPlus,
} from "lucide-react";
import { blokiNaDzien } from "../../utils/tasks";
import { countWorkdays } from "../../utils/absences";
import {
  shiftHours,
  buildPlanFactMap,
  sumujPlanFakt,
  toLocalYMD,
  trimTime,
  isSameUser,
  absenceOn,
} from "../../utils/grafik";
import {
  stanKartDnia,
  szablonyNaDzien,
  wpisyDlaDnia,
  zamknijDzien,
} from "../../utils/dziennik";
import { zmianyBezOdbicia } from "../../utils/odbicia";
import { zmianyPorzucone, zmianaTrwa } from "../../utils/porzucone";
import { probniDoDecyzji } from "../../utils/probni";
import { czekaNaKoniecOdKierownika } from "../../utils/wpisy";
import {
  resolveCorrection,
  propozycjaKorekty,
  wlozKorekteDoStanu,
  duplikatyKorekt,
} from "../../utils/corrections";
import { kosztZespoluMiesiaca } from "../../utils/umowy";
import { zl } from "../../utils/budzet";
import {
  pad,
  dlugosc,
  roznicaTekst,
  dzienKrotki,
  dniOd,
  PROG_CZEKANIA_DNI,
  DNI_KROTKIE,
  odmiana,
} from "../../utils/czas";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";

// ---------------------------------------------------------------------------
// Liczby
// ---------------------------------------------------------------------------
const NBSP = " ";
// "3 008,3" — tysiące ze spacją (twardą, żeby liczba nie łamała się w kafelku)
// i przecinek dziesiętny. toLocaleString nie grupuje liczb czterocyfrowych.
const liczba1 = (n) => {
  const r = Math.round((n || 0) * 10) / 10;
  const [c, d] = Math.abs(r).toFixed(1).split(".");
  return `${r < 0 ? "−" : ""}${c.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)},${d}`;
};
const procent1 = (p) => `${Math.abs(Math.round(p * 10) / 10).toString().replace(".", ",")}%`;
const suma = (lista, f) => lista.reduce((a, x) => a + (f(x) || 0), 0);
const hhmm = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
const ileTrwa = (od, teraz) => {
  const min = Math.max(0, Math.floor((teraz - od) / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
};

const DNI_TYGODNIA = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
const MIESIACE = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec",
  "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const MIESIACE_DOPELNIACZ = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const MIESIACE_KROTKIE = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz",
  "paź", "lis", "gru"];

// Kto w grafiku, a jeszcze nie odbił — dopiero po tylu minutach od planowanego
// startu. Kilka minut spóźnienia to normalny ruch przy tablecie, nie problem.
const MARGINES_ODBICIA_MIN = 10;
// Panel ma mówić o problemie, nie zamieniać się w drugą listę obsady.
const BEZ_ODBICIA_NA_PULPICIE = 3;

// ---------------------------------------------------------------------------
// Klasy — wartości z tokenów design systemu "Shiftro", akcent aplikacji.
// ---------------------------------------------------------------------------
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const sekcjaTytulCls = "text-[13px] font-extrabold tracking-[0.07em] uppercase text-[#6E6E66] mb-3";
const btnCls =
  "inline-flex items-center justify-center gap-2 rounded-lg border-[2px] font-['Archivo'] font-bold whitespace-nowrap transition-colors active:translate-y-px disabled:opacity-50";
const btnObrysCls = `${btnCls} min-h-[48px] md:min-h-[44px] px-[18px] text-[15px] border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnMalyCls = `${btnCls} min-h-[40px] md:min-h-[36px] px-3 text-sm border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} min-h-[48px] md:min-h-[44px] px-[18px] text-[15px] border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const tonCls = {
  warn: "bg-[#FDF0D8] text-[#8A5300]",
  info: "bg-[#E3EEFB] text-[#1D5FA8]",
  ok: "bg-[#E2F3E9] text-[#1F7A4A]",
  neutral: "bg-[#ECEBE6] text-[#171714]",
};
const pigulkaCls = (ton) =>
  `inline-flex items-center gap-1 h-[26px] px-2 rounded-md text-[13px] font-bold whitespace-nowrap ${tonCls[ton]}`;
const licznikCls =
  "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-[#DE3A22] text-white text-[13px] font-extrabold";
const linkCls = "font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22]";

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu — nie w środku PulpitHome (błąd #10 w
// CLAUDE.md: komponent zdefiniowany w komponencie z zegarem remontuje się co
// tik razem z całym poddrzewem).
// ---------------------------------------------------------------------------
function Pigulka({ ton = "warn", Icon, children }) {
  return (
    <span className={pigulkaCls(ton)}>
      {Icon && <Icon size={14} strokeWidth={2.5} />}
      {children}
    </span>
  );
}

function KartaZadania({ Icon, tytul, licznik, opis, children, stopka, ...reszta }) {
  return (
    <div className={`${kartaCls} p-4 md:px-5 md:py-[18px] flex flex-col gap-3`} {...reszta}>
      <h3 className="font-['Archivo'] font-extrabold text-[19px] leading-6 flex items-center gap-2.5 text-[#171714]">
        <Icon size={20} className="flex-shrink-0" />
        <span>{tytul}</span>
        {licznik > 0 && <span className={licznikCls}>{licznik}</span>}
      </h3>
      {opis && <p className="-mt-1.5 text-sm text-[#6E6E66]">{opis}</p>}
      <div>{children}</div>
      {stopka && <div className="mt-auto flex flex-wrap gap-2 items-center">{stopka}</div>}
    </div>
  );
}

function Kafelek({ etykieta, wartosc, jednostka, children, ...reszta }) {
  return (
    <div
      className={`${kartaCls} px-[18px] pt-4 pb-[18px] flex flex-col gap-1 min-w-[80%] sm:min-w-[46%] md:min-w-0 snap-start`}
      {...reszta}
    >
      <span className={etykietaCls}>{etykieta}</span>
      <span className="font-['Archivo'] text-[34px] leading-10 font-extrabold tabular-nums tracking-[-0.01em] whitespace-nowrap text-[#171714]">
        {wartosc}
        {jednostka && (
          <small className="text-[18px] font-bold ml-[3px] text-[#6E6E66]">{jednostka}</small>
        )}
      </span>
      {children}
    </div>
  );
}

function Pasek({ pct }) {
  return (
    <div className="h-2 rounded bg-[#ECEBE6] overflow-hidden mt-1.5">
      <i
        className="block h-full rounded bg-[#171714]"
        style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }}
      />
    </div>
  );
}

// Strzałka i procent, bez koloru — patrz nagłówek pliku.
function Trend({ pct }) {
  if (pct == null) return null;
  return (
    <span className="inline-flex items-center gap-[3px] h-6 px-2 rounded-md text-[13px] font-extrabold tabular-nums bg-[#ECEBE6] text-[#171714]">
      {pct >= 0 ? "▲" : "▼"} {procent1(pct)}
    </span>
  );
}

function Panel({ tytul, prawa, children, stopka, onStopka, ...reszta }) {
  return (
    <div className={`${kartaCls} overflow-hidden`} {...reszta}>
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b-[2px] border-[#171714]">
        <h3 className="font-['Archivo'] font-extrabold text-[17px] text-[#171714]">{tytul}</h3>
        {prawa && <span className="ml-auto text-sm font-bold text-[#6E6E66]">{prawa}</span>}
      </div>
      <div className="px-[18px] pt-1 pb-3">{children}</div>
      {stopka && (
        <div className="flex justify-center p-3 border-t-[1.5px] border-[#DEDCD4]">
          <button
            type="button"
            onClick={onStopka}
            className="font-bold text-[#171714] inline-flex gap-1.5 items-center hover:text-[#DE3A22]"
          >
            {stopka} <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// Zegar Pulpitu: "dane do 12:13", "3 h 13 min" i to, kto już powinien był
// odbić. Minuta dokładności wystarcza — ekran ma być aktualny, nie tykać.
function useTeraz() {
  const [teraz, setTeraz] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTeraz(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return teraz;
}

// ---------------------------------------------------------------------------
export default function PulpitHome({
  currentUser = null,
  users = [],
  shifts = [],
  setShifts,
  issues = [],
  setIssues,
  setShiftEdits,
  tasks = [],
  taskBlocks = [],
  taskCompletions = [],
  absences = [],
  lokale = [],
  matchesFilter, // (lokalName) => bool — hasAccessToLokal + wybrany lokal z paska
  hasAccessToLokal,
  zakres = "Cała sieć",
  setActiveTab,
  shiftSwaps = [],
  planShifts = [],
  dayLogs = [],
  setDayLogs,
  dayLogEntries = [],
  dayLogTemplates = [],
  availableLokaleForManager = [],
  onOpenPuls,
  showMsg = () => {},
}) {
  const teraz = useTeraz();
  const widoczny = hasAccessToLokal || matchesFilter;
  const dzis0 = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate());
  const dzisStr = toLocalYMD(dzis0);
  const wczorajStr = toLocalYMD(new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() - 1));

  // Zmiana liczy się jako trwająca tylko wtedy, gdy NAPRAWDĘ trwa: zmiana bez
  // końca sprzed trzech dni (porzucona) albo taka, o której koniec pracownik
  // już poprosił kierownika, nie dokłada godzin "do teraz".
  const trwa = (s) =>
    zmianaTrwa({ shift: s, planShifts, lokale, users, now: teraz }) &&
    !czekaNaKoniecOdKierownika(s, issues);
  // Godziny zmiany odcięte na `granica`. Zamknięta zmiana liczy się do swojego
  // końca, trwająca — do granicy. Dzięki temu "ten tydzień do teraz" i
  // "poprzedni tydzień do tej samej chwili" liczą się TĄ SAMĄ regułą.
  const godzinyDo = (s, granica) => {
    const koniec = s.end_time ? s.end_time : trwa(s) ? granica : null;
    if (!koniec) return 0;
    return Math.max(0, (Math.min(+koniec, +granica) - s.start_time) / 3600000);
  };

  const widoczne = shifts.filter((s) => matchesFilter(s.lokal));
  const planWyslany = planShifts.filter(
    (p) => p.published_at && !p.deleted_at && matchesFilter(p.lokal)
  );

  // =========================================================================
  // Zapisy z Pulpitu: szybkie ✓ przy prostej korekcie i "Zamknij" dzień.
  // Obie idą przez odłożenie o 6 s z "Cofnij" — tak samo jak w "Do decyzji".
  // =========================================================================
  // Zamek na ref, nie na stanie — patrz ZatwierdzanieZmian.tsx (08.09.2026
  // jedno kliknięcie dało tam dwa wiersze godzin).
  const wTrakcie = useRef(new Set());
  const zajmij = (k) => {
    if (wTrakcie.current.has(k)) return false;
    wTrakcie.current.add(k);
    return true;
  };

  const zatwierdzKorekte = async (issue) => {
    if (!zajmij(`korekta:${issue.id}`)) return;
    try {
      const saved = await resolveCorrection({
        issue,
        shifts,
        editorName: currentUser?.name,
        finalValues: propozycjaKorekty(issue),
      });
      wlozKorekteDoStanu(issue.id, saved, { setIssues, setShifts, setShiftEdits });
    } catch (e) {
      showMsg(`${issue.user_name}: ${e.message || "błąd zatwierdzania"}`, "error");
    }
    wTrakcie.current.delete(`korekta:${issue.id}`);
  };

  // Zamykamy tylko dzień, który ma już utarg i komplet wymaganych wpisów —
  // przycisk "Zamknij" przy innym w ogóle się nie pokazuje. Zamkniętego dnia
  // nie da się otworzyć (patrz "Karta dnia" w CLAUDE.md), więc zamknięcie z
  // pustym utargiem zostawiłoby fałszywy koszt pracy na zawsze.
  const zamknijLokal = async (lokal) => {
    if (!zajmij(`dzien:${lokal}`)) return;
    try {
      const karta = dayLogs.find((k) => k.lokal === lokal && k.date === wczorajStr);
      if (karta && karta.status !== "zamkniety") {
        // Setter przekazany do zamknijDzien podmienia CAŁĄ listę kart na kopię
        // z chwili wywołania — przy "Zamknij wszystkie" druga karta
        // nadpisałaby w stanie pierwszą. Dlatego stan aktualizujemy sami,
        // funkcyjnie, po każdym zapisie.
        const zapisana = await zamknijDzien({
          karta,
          lokal,
          dateStr: wczorajStr,
          pola: {},
          kto: currentUser?.name,
          dayLogs,
          setDayLogs: () => {},
        });
        if (setDayLogs) setDayLogs((prev) => prev.map((k) => (k.id === zapisana.id ? zapisana : k)));
      }
    } catch (e) {
      showMsg(`${lokal}: ${e.message || "błąd zamykania dnia"}`, "error");
    }
    wTrakcie.current.delete(`dzien:${lokal}`);
  };

  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({
    zatwierdzKorekte,
    zamknijLokal,
  });

  // =========================================================================
  // 1a. Zamknij wczoraj
  // =========================================================================
  const lokaleWidoczne = (availableLokaleForManager || [])
    .map((l) => l.name)
    .filter((n) => matchesFilter(n));
  const karty = stanKartDnia({ dayLogs, lokaleNames: lokaleWidoczne, dateStr: wczorajStr }).map(
    (k) => {
      const wpisy = wpisyDlaDnia(dayLogEntries, k.lokal, wczorajStr);
      const brakWpisow = szablonyNaDzien(dayLogTemplates, k.lokal, wczorajStr)
        .filter((t) => t.wymagany)
        .filter((t) => !wpisy.some((w) => w.template_key === t.klucz)).length;
      const brakUtargu = !k.karta || k.karta.obrot == null || k.karta.obrot === "";
      const zamkniety = k.zamkniety || !!odlozone[`dzien:${k.lokal}`];
      return { ...k, zamkniety, brakUtargu, brakWpisow, gotowy: !brakUtargu && brakWpisow === 0 };
    }
  );
  const otwarte = karty.filter((k) => !k.zamkniety);
  const gotowe = otwarte.filter((k) => k.gotowy);
  const zamknij = (lista) =>
    decyduj(
      lista.map((k) => ({ klucz: `dzien:${k.lokal}`, zadanie: ["zamknijLokal", [k.lokal]] })),
      lista.length > 1 ? `Zamknięto ${lista.length} lokale` : `Zamknięto: ${lista[0].lokal}`
    );
  const wczoraj0 = new Date(`${wczorajStr}T00:00:00`);
  const wczorajPodpis = `${DNI_KROTKIE[wczoraj0.getDay()]} ${pad(wczoraj0.getDate())}.${pad(
    wczoraj0.getMonth() + 1
  )}`;

  // =========================================================================
  // 1b. Wymaga decyzji — te same kolejki co "Do decyzji", zawężone do lokalu
  // z górnego paska. Przy "Cała sieć" liczba MUSI równać się znaczkowi w menu
  // (sprawdza harness-panel.html).
  // =========================================================================
  const sprawy = [];
  for (const { plan, user } of zmianyBezOdbicia({
    planShifts,
    shifts,
    users,
    absences,
    lokalOk: matchesFilter,
  })) {
    sprawy.push({
      klucz: `odbicie:${plan.id}`,
      typ: "odbicie",
      kto: user.name,
      tag: { ton: "warn", Icon: Clock, tekst: "Brak odbicia" },
      meta: `${plan.lokal} · ${dzienKrotki(plan.date)}`,
      wiek: dniOd(plan.date),
    });
  }
  for (const poz of zmianyPorzucone({
    shifts,
    planShifts,
    lokale,
    users,
    lokalOk: matchesFilter,
    now: teraz,
  }).filter((p) => !czekaNaKoniecOdKierownika(p.shift, issues))) {
    const s = poz.shift;
    sprawy.push({
      klucz: `porzucona:${s.id}`,
      typ: "porzucona",
      kto: s.user_name,
      tag: { ton: "warn", Icon: Hourglass, tekst: "Bez końca" },
      meta: `${s.lokal} · ${dzienKrotki(toLocalYMD(s.start_time))} od ${hhmm(s.start_time)}`,
      wiek: dniOd(s.start_time),
    });
  }
  for (const u of probniDoDecyzji({ users, lokalOk: matchesFilter })) {
    sprawy.push({
      klucz: `probny:${u.id}`,
      typ: "probny",
      kto: u.name,
      tag: { ton: "info", Icon: UserPlus, tekst: "Na próbę" },
      meta: [u.default_lokal, u.probny_od ? `od ${dzienKrotki(u.probny_od)}` : ""]
        .filter(Boolean)
        .join(" · "),
      wiek: dniOd(u.probny_od),
    });
  }
  for (const sw of shiftSwaps.filter((x) => x.status === "przyjeta" && matchesFilter(x.lokal))) {
    sprawy.push({
      klucz: `gielda:${sw.id}`,
      typ: "gielda",
      kto: sw.taker_user_name || "Pracownik",
      tag: {
        ton: "neutral",
        Icon: ArrowLeftRight,
        tekst: sw.typ === "zamiana" ? "Zamiana" : "Giełda",
      },
      meta: [`od: ${sw.author_user_name}`, sw.lokal, sw.date ? dzienKrotki(sw.date) : ""]
        .filter(Boolean)
        .join(" · "),
      wiek: dniOd(sw.created_at),
    });
  }
  for (const a of absences.filter((x) => x.status === "pending" && matchesFilter(x.lokal))) {
    const dni = countWorkdays(a.start_date, a.end_date);
    sprawy.push({
      klucz: `wolne:${a.id}`,
      typ: "wolne",
      kto: a.user_name || "Pracownik",
      tag: { ton: "info", Icon: Palmtree, tekst: a.type === "urlop" ? "Urlop" : "Niedostępność" },
      meta: `${a.lokal} · od ${dzienKrotki(a.start_date)} · ${dni} ${odmiana(dni, [
        "dzień rob.",
        "dni rob.",
        "dni rob.",
      ])}`,
      wiek: dniOd(a.created_at),
    });
  }
  const korekty = issues
    .filter((iss) => iss.type === "correction" && iss.status === "nowe")
    .map((iss) => {
      const zmiana = iss.shift_id ? shifts.find((s) => s.id === iss.shift_id) : null;
      return { iss, zmiana, lokal: zmiana ? zmiana.lokal : iss.proposed_lokal };
    })
    .filter((r) => matchesFilter(r.lokal))
    .sort((a, b) => new Date(a.iss.created_at) - new Date(b.iss.created_at));
  const duplikaty = duplikatyKorekt(korekty.map((r) => r.iss));
  for (const { iss, zmiana, lokal } of korekty) {
    const duplikat = duplikaty.has(iss.id);
    // Różnica długości zmiany: "+30 min". Pusty koniec w prośbie znaczy
    // "koniec bez zmian" — tak samo liczy resolveCorrection.
    const koniecZapisany = zmiana && zmiana.end_time ? hhmm(new Date(zmiana.end_time)) : "";
    const nowa = dlugosc(iss.proposed_start_time, iss.proposed_end_time || koniecZapisany);
    const stara =
      zmiana && zmiana.end_time
        ? Math.round((new Date(zmiana.end_time) - new Date(zmiana.start_time)) / 60000)
        : null;
    const roznica = nowa != null && stara != null ? nowa - stara : null;
    // PROSTA korekta = zmieniają się same godziny zamkniętej zmiany: ten sam
    // dzień, lokal i stanowisko. Tylko taką zatwierdzamy z Pulpitu — reszta
    // (nowa zmiana, inny lokal, duplikat) potrzebuje karty w "Do decyzji".
    const prosta =
      !duplikat &&
      !!zmiana &&
      !!zmiana.end_time &&
      iss.proposed_date === toLocalYMD(new Date(zmiana.start_time)) &&
      (!iss.proposed_lokal || iss.proposed_lokal === zmiana.lokal) &&
      (!iss.proposed_stanowisko || iss.proposed_stanowisko === zmiana.stanowisko) &&
      roznica != null &&
      roznica !== 0;
    sprawy.push({
      klucz: `korekta:${iss.id}`,
      typ: duplikat ? "duplikat" : "korekta",
      kto: iss.user_name || "Pracownik",
      tag: duplikat
        ? { ton: "warn", Icon: AlertTriangle, tekst: "Duplikat" }
        : {
            ton: "neutral",
            Icon: Pencil,
            tekst: !zmiana ? "Nowa zmiana" : roznica ? roznicaTekst(roznica) : "Korekta",
          },
      meta: `${lokal} · ${dzienKrotki(iss.proposed_date)}`,
      wiek: dniOd(iss.created_at),
      szybka: prosta ? iss : null,
    });
  }
  // Najstarsze na górze — przed wypłatą stare pozycje giną najłatwiej.
  const sprawyWidoczne = sprawy
    .filter((s) => !odlozone[s.klucz])
    .sort((a, b) => b.wiek - a.wiek);
  const NA_PULPICIE = 4;
  const naKarcie = sprawyWidoczne.slice(0, NA_PULPICIE);
  const reszta = sprawyWidoczne.slice(NA_PULPICIE);
  const ODMIANY = {
    odbicie: ["brak odbicia", "braki odbicia", "braków odbicia"],
    porzucona: ["zmiana bez końca", "zmiany bez końca", "zmian bez końca"],
    probny: ["osoba na próbę", "osoby na próbę", "osób na próbę"],
    gielda: ["zamiana z giełdy", "zamiany z giełdy", "zamian z giełdy"],
    wolne: ["wniosek o wolne", "wnioski o wolne", "wniosków o wolne"],
    korekta: ["korekta", "korekty", "korekt"],
    duplikat: ["możliwy duplikat", "możliwe duplikaty", "możliwych duplikatów"],
  };
  const opisReszty = Object.keys(ODMIANY)
    .map((typ) => [typ, reszta.filter((s) => s.typ === typ).length])
    .filter(([, n]) => n > 0)
    .map(([typ, n]) => `${n} ${odmiana(n, ODMIANY[typ])}`)
    .join(" · ");

  // =========================================================================
  // 2. Liczby
  // =========================================================================
  // --- Dziś ---
  const godzDzis = suma(
    widoczne.filter((s) => s.start_time >= dzis0),
    (s) => godzinyDo(s, teraz)
  );
  const planDzis = planWyslany.filter((p) => p.date === dzisStr);
  const planDzisH = suma(planDzis, shiftHours);
  const osobWGrafiku = new Set(planDzis.map((p) => String(p.user_id || p.user_name))).size;
  const aktywni = widoczne.filter((s) => !s.end_time && trwa(s));

  // --- Ten tydzień: od poniedziałku do teraz, słupki fakt / plan ---
  const idxDzis = (teraz.getDay() + 6) % 7;
  const pn = new Date(dzis0);
  pn.setDate(pn.getDate() - idxDzis);
  const slupki = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(pn);
    d.setDate(pn.getDate() + i);
    const ymd = toLocalYMD(d);
    if (i <= idxDzis) {
      return {
        dzien: DNI_KROTKIE[d.getDay()],
        fakt: true,
        h: suma(
          widoczne.filter((s) => toLocalYMD(s.start_time) === ymd),
          (s) => godzinyDo(s, teraz)
        ),
      };
    }
    return {
      dzien: DNI_KROTKIE[d.getDay()],
      fakt: false,
      h: suma(planWyslany.filter((p) => p.date === ymd), shiftHours),
    };
  });
  const maxSlupka = Math.max(1, ...slupki.map((s) => s.h));
  const godzTydz = suma(slupki.filter((s) => s.fakt), (s) => s.h);
  const granicaTydz = new Date(teraz.getTime() - 7 * 86400000);
  const pnPoprz = new Date(pn);
  pnPoprz.setDate(pn.getDate() - 7);
  const godzTydzPoprz = suma(
    widoczne.filter((s) => s.start_time >= pnPoprz && s.start_time < granicaTydz),
    (s) => godzinyDo(s, granicaTydz)
  );
  const trendTydz =
    godzTydzPoprz > 0 ? ((godzTydz - godzTydzPoprz) / godzTydzPoprz) * 100 : null;
  const zakresTyg = idxDzis === 0 ? "pn" : `pn–${DNI_KROTKIE[teraz.getDay()]}`;

  // --- Wczoraj: plan vs fakt ---
  const pfWczoraj = sumujPlanFakt(
    buildPlanFactMap({
      planShifts,
      factShifts: shifts,
      from: wczorajStr,
      to: wczorajStr,
      lokalOk: matchesFilter,
    })
  );
  const pustyWczoraj = pfWczoraj.planH === 0 && pfWczoraj.faktH === 0;

  // --- Miesiąc: 1–N teraz kontra 1–N poprzedniego miesiąca ---
  const rok = teraz.getFullYear();
  const mies = teraz.getMonth();
  const m0 = new Date(rok, mies, 1);
  const dniWMies = new Date(rok, mies + 1, 0).getDate();
  const godzMies = suma(
    widoczne.filter((s) => s.start_time >= m0),
    (s) => godzinyDo(s, teraz)
  );
  const pm0 = new Date(rok, mies - 1, 1);
  const dniPoprz = new Date(rok, mies, 0).getDate();
  const granicaMies = new Date(
    rok,
    mies - 1,
    Math.min(teraz.getDate(), dniPoprz),
    teraz.getHours(),
    teraz.getMinutes()
  );
  const godzMiesPoprz = suma(
    widoczne.filter((s) => s.start_time >= pm0 && s.start_time < granicaMies),
    (s) => godzinyDo(s, granicaMies)
  );
  const trendMies =
    godzMiesPoprz > 0 ? ((godzMies - godzMiesPoprz) / godzMiesPoprz) * 100 : null;
  // Koszt — ta sama funkcja i ta sama reguła co w Raportach i kosztach. Do
  // 0.48.0 stała tu goła `users.stawka`, więc każdy etatowiec wypadał z kosztu
  // (błąd opisany w CLAUDE.md, "Raporty i koszty").
  const koszt = kosztZespoluMiesiaca({
    shifts,
    users,
    lokale,
    rok,
    mies: mies + 1,
    lokalOk: matchesFilter,
    widoczny,
  });
  const pmSkrot = MIESIACE_KROTKIE[(mies + 11) % 12];

  // =========================================================================
  // 3a. Teraz na zmianie
  // =========================================================================
  const odbilDzis = (user) =>
    shifts.some(
      (s) =>
        (s.user_id ? String(s.user_id) === String(user.id) : s.user_name === user.name) &&
        toLocalYMD(s.start_time) === dzisStr
    );
  const bezOdbiciaTeraz = [];
  const juzJest = new Set();
  for (const p of planDzis) {
    const start = new Date(`${p.date}T${trimTime(p.start_time)}:00`);
    const koniec = new Date(`${p.date}T${trimTime(p.end_time)}:00`);
    if (koniec <= start) koniec.setDate(koniec.getDate() + 1);
    if (+teraz < +start + MARGINES_ODBICIA_MIN * 60000 || +teraz >= +koniec) continue;
    const user = users.find((u) => isSameUser(p, u)) || { id: p.user_id, name: p.user_name };
    const k = String(user.id || user.name);
    if (juzJest.has(k) || user.archived || user.active === false) continue;
    if (absenceOn(absences, user, p.date) || odbilDzis(user)) continue;
    juzJest.add(k);
    bezOdbiciaTeraz.push({ p, user, start });
  }
  bezOdbiciaTeraz.sort((a, b) => a.start - b.start);
  const grupyAktywnych = [...new Set(aktywni.map((s) => s.lokal))]
    .map((lokal) => ({
      lokal,
      osoby: aktywni.filter((s) => s.lokal === lokal).sort((a, b) => a.start_time - b.start_time),
    }))
    .sort((a, b) => b.osoby.length - a.osoby.length || a.lokal.localeCompare(b.lokal));

  // =========================================================================
  // 3b. Terminy i dokumenty — luki w danych osobno od prawdziwych terminów.
  // Pusta data to nie "termin minął", tylko brak danych: bez niej system nie
  // ostrzeże przed końcem umowy ani badań.
  // =========================================================================
  const zespol = users.filter(
    (u) =>
      u.active &&
      !u.archived &&
      u.role !== "kiosk" &&
      !u.probny_status?.match(/^(oczekuje|odrzucony)$/) &&
      matchesFilter(u.default_lokal)
  );
  const luki = zespol
    .map((u) => ({
      user: u,
      braki: [
        !u.umowa_expiry && !u.umowa_bezterminowa ? "umowa" : null,
        !u.sanepid_expiry ? "sanepid" : null,
      ].filter(Boolean),
    }))
    .filter((x) => x.braki.length > 0);
  const lukiDokumentow = suma(luki, (x) => x.braki.length);
  const terminy = zespol
    .flatMap((u) =>
      [
        ["umowa_expiry", "umowa"],
        ["sanepid_expiry", "sanepid"],
      ]
        .filter(([pole]) => u[pole] && !(pole === "umowa_expiry" && u.umowa_bezterminowa))
        .map(([pole, label]) => {
          const dni = Math.round((new Date(`${u[pole]}T00:00:00`) - dzis0) / 86400000);
          return { user: u, label, data: u[pole], dni };
        })
    )
    .filter((t) => t.dni <= 30)
    .sort((a, b) => a.dni - b.dni);
  const opisTerminu = (dni) =>
    dni < 0
      ? `po terminie ${-dni} ${odmiana(-dni, ["dzień", "dni", "dni"])}`
      : dni === 0
      ? "dziś"
      : `za ${dni} ${odmiana(dni, ["dzień", "dni", "dni"])}`;

  // =========================================================================
  // 3c. Zadania dziś — per lokal, NIEZALEŻNIE od tego, czy ktoś już odbił
  // (zespół nie zawsze odbija od razu po przyjściu, a licznik oparty o
  // odbicia pokazywał rano zero zadań mimo wiszącej checklisty).
  // =========================================================================
  const zadaniaLokali = lokaleWidoczne.map((lokal) => {
    const grupy = blokiNaDzien({
      tasks: tasks.filter((t) => t.lokal === lokal && !t.for_manager && !t.archived),
      blocks: taskBlocks,
      completions: taskCompletions,
      lokal,
      dateStr: dzisStr,
      forManager: false,
    });
    return {
      lokal,
      done: suma(grupy, (g) => g.done),
      total: suma(grupy, (g) => g.total),
    };
  });
  const zadaniaDone = suma(zadaniaLokali, (z) => z.done);
  const zadaniaTotal = suma(zadaniaLokali, (z) => z.total);

  // =========================================================================
  const imie = String(currentUser?.name || "").trim().split(/\s+/)[0];
  const powitanie = teraz.getHours() >= 18 ? "Dobry wieczór" : "Dzień dobry";
  const dataDzis = `${DNI_TYGODNIA[teraz.getDay()]}, ${teraz.getDate()} ${
    MIESIACE_DOPELNIACZ[mies]
  }`;

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-7" data-pulpit>
      <div>
        <h2 className="font-['Archivo'] text-[26px] md:text-[30px] leading-9 font-extrabold text-[#171714]">
          {powitanie}
          {imie ? `, ${imie}` : ""}
        </h2>
        <p className="mt-1 text-[#6E6E66]">
          {dataDzis} · {zakres} · {hhmm(teraz)}
        </p>
      </div>

      {/* ============ 1. Do zrobienia teraz ============ */}
      <section>
        <h3 className={sekcjaTytulCls}>Do zrobienia teraz</h3>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {karty.length > 0 && (
            <KartaZadania
              Icon={Lock}
              tytul={`Zamknij wczoraj · ${wczorajPodpis}`}
              licznik={otwarte.length}
              opis={
                otwarte.length > 0
                  ? "Utarg i wpisy dziennika czekają na potwierdzenie — bez tego raport dnia jest otwarty."
                  : "Wszystkie lokale zamknięte. Raport dnia gotowy."
              }
              data-zamknij-wczoraj
              stopka={
                gotowe.length > 1 && (
                  <button
                    type="button"
                    className={`${btnGlownyCls} w-full md:w-auto`}
                    onClick={() => zamknij(gotowe)}
                  >
                    <Check size={18} /> Zamknij wszystkie {gotowe.length}
                  </button>
                )
              }
            >
              {karty.map((k, i) => (
                <div
                  key={k.lokal}
                  data-lokal-dnia={k.lokal}
                  className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center py-2 ${
                    i > 0 ? "border-t-[1.5px] border-[#DEDCD4]" : ""
                  }`}
                >
                  <span className="font-bold text-[#171714]">{k.lokal}</span>
                  <span className="col-span-2 md:col-span-1 order-last md:order-none flex flex-wrap gap-1.5 md:justify-end">
                    {k.zamkniety ? (
                      <Pigulka ton="ok" Icon={Check}>
                        Zamknięty
                      </Pigulka>
                    ) : k.gotowy ? (
                      <Pigulka ton="ok" Icon={Check}>
                        Uzupełniony
                      </Pigulka>
                    ) : (
                      <>
                        {k.brakUtargu && <Pigulka>Utarg</Pigulka>}
                        {k.brakWpisow > 0 && (
                          <Pigulka>Wpisy{k.brakWpisow > 1 ? ` · ${k.brakWpisow}` : ""}</Pigulka>
                        )}
                      </>
                    )}
                  </span>
                  {k.zamkniety ? (
                    <span />
                  ) : k.gotowy ? (
                    <button type="button" className={btnMalyCls} onClick={() => zamknij([k])}>
                      Zamknij
                    </button>
                  ) : (
                    // Utarg wpisuje się w karcie dnia — przycisk mówi, co się
                    // stanie, zamiast udawać zamknięcie jednym dotknięciem.
                    <button
                      type="button"
                      className={btnMalyCls}
                      onClick={() =>
                        onOpenPuls ? onOpenPuls(k.lokal, wczorajStr) : setActiveTab("puls")
                      }
                    >
                      Uzupełnij
                    </button>
                  )}
                </div>
              ))}
            </KartaZadania>
          )}

          <KartaZadania
            Icon={Clock}
            tytul="Wymaga decyzji"
            licznik={sprawyWidoczne.length}
            opis={
              sprawyWidoczne.length > 0
                ? "Proste korekty zatwierdzisz tutaj. Resztę — w Zatwierdzaniu."
                : null
            }
            data-wymaga-decyzji={sprawyWidoczne.length}
            stopka={
              sprawyWidoczne.length > 0 && (
                <button
                  type="button"
                  className={`${btnObrysCls} w-full md:w-auto`}
                  onClick={() => setActiveTab("zatwierdzanie")}
                >
                  Przejdź do decyzji <ArrowRight size={18} />
                </button>
              )
            }
          >
            {sprawyWidoczne.length === 0 && (
              <p className="flex items-center gap-2 text-sm text-[#6E6E66] py-1">
                <Check size={16} /> Nic nie czeka na Twoją decyzję.
              </p>
            )}
            {naKarcie.map((s, i) => {
              const tresc = (
                <>
                  <span className="font-bold text-[#171714] leading-5">{s.kto}</span>
                  <span className="min-w-0">
                    <span className={`${pigulkaCls(s.tag.ton)} h-[22px] text-[12px] px-[7px]`}>
                      <s.tag.Icon size={13} strokeWidth={2.5} />
                      {s.tag.tekst}
                    </span>
                    <span className="block text-[13px] leading-[18px] text-[#6E6E66] mt-0.5">
                      {s.meta}
                      {s.wiek >= PROG_CZEKANIA_DNI && (
                        <span className="text-[#8A5300] font-bold"> · czeka {s.wiek} dni</span>
                      )}
                    </span>
                  </span>
                </>
              );
              const wiersz = `grid grid-cols-[auto_1fr_auto] gap-2.5 items-center py-2 w-full text-left ${
                i > 0 ? "border-t-[1.5px] border-[#DEDCD4]" : ""
              }`;
              return s.szybka ? (
                <div key={s.klucz} className={wiersz} data-sprawa={s.klucz}>
                  {tresc}
                  <button
                    type="button"
                    aria-label={`Zatwierdź: ${s.kto} ${s.tag.tekst}`}
                    title="Zatwierdź tak, jak zgłoszono"
                    data-szybkie-zatwierdz
                    onClick={() =>
                      decyduj(
                        [{ klucz: s.klucz, zadanie: ["zatwierdzKorekte", [s.szybka]] }],
                        `Zatwierdzono: ${s.kto} ${s.tag.tekst}`
                      )
                    }
                    className="w-11 h-11 md:w-10 md:h-10 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] grid place-items-center hover:bg-[#DE3A22] hover:border-[#DE3A22] hover:text-white"
                  >
                    <Check size={18} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <button
                  key={s.klucz}
                  type="button"
                  className={`${wiersz} hover:bg-[#F6F5F1] -mx-1 px-1 rounded-md`}
                  data-sprawa={s.klucz}
                  onClick={() => setActiveTab("zatwierdzanie")}
                >
                  {tresc}
                  <ChevronRight size={18} className="text-[#6E6E66]" />
                </button>
              );
            })}
            {reszta.length > 0 && (
              <div className="grid grid-cols-[auto_1fr] gap-2.5 items-center py-2 border-t-[1.5px] border-[#DEDCD4]">
                <span className="font-bold text-[#6E6E66]">+{reszta.length}</span>
                <span className="text-[13px] leading-[18px] text-[#6E6E66]">{opisReszty}</span>
              </div>
            )}
          </KartaZadania>
        </div>
      </section>

      {/* ============ 2. Liczby ============ */}
      <section>
        <h3 className={sekcjaTytulCls}>Liczby</h3>
        {/* Na telefonie kafelki są karuzelą (widać jeden i kawałek
            następnego), od tabletu — siatką. */}
        <div
          data-kafelki
          className="flex md:grid md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]"
        >
          <Kafelek etykieta="Dziś" wartosc={liczba1(godzDzis)} jednostka="h">
            <span className="text-sm leading-5 text-[#6E6E66]">
              <b className="text-[#171714] tabular-nums">{osobWGrafiku}</b>{" "}
              {odmiana(osobWGrafiku, ["osoba", "osoby", "osób"])} w grafiku ·{" "}
              <b className="text-[#171714] tabular-nums">{aktywni.length}</b> teraz
            </span>
            {planDzisH > 0 && <Pasek pct={(godzDzis / planDzisH) * 100} />}
            <span className="text-[13px] leading-5 text-[#6E6E66]">
              {planDzisH > 0 ? `z ${liczba1(planDzisH)} h w grafiku · ` : "dzień w toku · "}
              dane do {hhmm(teraz)}
            </span>
          </Kafelek>

          <Kafelek etykieta={`Ten tydzień · ${zakresTyg}`} wartosc={liczba1(godzTydz)} jednostka="h">
            <div className="flex items-end gap-[5px] h-[38px] mt-1.5" aria-hidden="true">
              {slupki.map((s, i) => (
                <i
                  key={i}
                  className={`flex-1 rounded-t-[3px] ${
                    s.fakt
                      ? "bg-[#171714] opacity-85"
                      : "border-[1.5px] border-b-0 border-dashed border-[#6E6E66]"
                  }`}
                  style={{ height: `${Math.max(s.h > 0 ? 6 : 2, (s.h / maxSlupka) * 100)}%` }}
                  title={`${s.dzien}: ${liczba1(s.h)} h ${s.fakt ? "" : "w grafiku"}`}
                />
              ))}
            </div>
            <div className="flex gap-[5px] text-[11px] text-[#6E6E66] font-bold">
              {slupki.map((s, i) => (
                <span key={i} className="flex-1 text-center">
                  {s.dzien}
                </span>
              ))}
            </div>
            {trendTydz != null && (
              <div className="flex items-center gap-2 text-sm text-[#6E6E66] mt-auto pt-2">
                <Trend pct={trendTydz} /> vs {zakresTyg} poprz. tyg.
              </div>
            )}
          </Kafelek>

          <Kafelek
            etykieta="Wczoraj · plan vs fakt"
            wartosc={
              pustyWczoraj
                ? "—"
                : Math.abs(pfWczoraj.diff) < 0.05
                ? "0,0"
                : `${pfWczoraj.diff > 0 ? "+" : "−"}${liczba1(Math.abs(pfWczoraj.diff))}`
            }
            jednostka={pustyWczoraj ? "" : "h"}
          >
            {pustyWczoraj ? (
              <span className="text-sm leading-5 text-[#6E6E66]">
                Wczoraj nie było grafiku ani odbić.
              </span>
            ) : (
              <>
                <span className="text-sm leading-5 text-[#6E6E66]">
                  plan <b className="text-[#171714] tabular-nums">{liczba1(pfWczoraj.planH)} h</b> ·
                  fakt <b className="text-[#171714] tabular-nums">{liczba1(pfWczoraj.faktH)} h</b>
                </span>
                <div className="flex items-center gap-2 text-sm mt-auto pt-2">
                  {pfWczoraj.rozbieznosci === 0 ? (
                    <span className="text-[#6E6E66]">wszystko wg grafiku</span>
                  ) : (
                    <button type="button" className={linkCls} onClick={() => setActiveTab("godziny")}>
                      {pfWczoraj.rozbieznosci}{" "}
                      {odmiana(pfWczoraj.rozbieznosci, ["osoba", "osoby", "osób"])} z różnicą
                    </button>
                  )}
                </div>
              </>
            )}
          </Kafelek>

          <Kafelek etykieta={MIESIACE[mies]} wartosc={liczba1(godzMies)} jednostka="h" data-kafelek-miesiac>
            <span className="text-sm leading-5 text-[#6E6E66]">
              koszt <b className="text-[#171714] tabular-nums">{zl(koszt.koszt)}</b>
              {koszt.niepelny && "*"}
            </span>
            <Pasek pct={(teraz.getDate() / dniWMies) * 100} />
            <span className="text-[13px] leading-5 text-[#6E6E66]">
              dzień {teraz.getDate()} z {dniWMies}
              {trendMies != null && (
                <>
                  {" "}
                  · vs 1–{Math.min(teraz.getDate(), dniPoprz)} {pmSkrot}{" "}
                  <b className="text-[#171714] tabular-nums">
                    {trendMies >= 0 ? "▲" : "▼"} {procent1(trendMies)}
                  </b>
                </>
              )}
            </span>
            {koszt.niepelny && (
              <p className="flex gap-1.5 items-start text-[13px] leading-[18px] font-bold text-[#8A5300] mt-1">
                <AlertTriangle size={15} className="flex-shrink-0 mt-px" />
                <span>
                  *Koszt niepełny — brak stawki u części osób.{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => setActiveTab("raporty")}
                  >
                    Sprawdź
                  </button>
                </span>
              </p>
            )}
          </Kafelek>
        </div>
      </section>

      {/* ============ 3. Panele ============ */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr] items-start">
        <Panel
          tytul="Teraz na zmianie"
          prawa={`${aktywni.length} ${odmiana(aktywni.length, ["osoba", "osoby", "osób"])}`}
          stopka="Wszyscy aktywni"
          onStopka={() => setActiveTab("aktywni")}
          data-panel-zmiana
        >
          {bezOdbiciaTeraz.slice(0, BEZ_ODBICIA_NA_PULPICIE).map(({ p, user }) => (
            <div
              key={`${user.id || user.name}`}
              data-bez-odbicia-teraz
              className="grid grid-cols-[auto_1fr] gap-2.5 bg-[#FDF0D8] text-[#8A5300] rounded-lg px-3 py-2.5 mt-3 text-sm leading-[19px]"
            >
              <AlertTriangle size={18} />
              <div>
                <b className="block text-[#171714]">
                  {user.name} · {p.lokal}
                </b>
                W grafiku od {trimTime(p.start_time)} — jeszcze bez odbicia
              </div>
            </div>
          ))}
          {bezOdbiciaTeraz.length > BEZ_ODBICIA_NA_PULPICIE && (
            <p className="text-[13px] font-bold text-[#8A5300] pt-2">
              i jeszcze {bezOdbiciaTeraz.length - BEZ_ODBICIA_NA_PULPICIE}{" "}
              {odmiana(bezOdbiciaTeraz.length - BEZ_ODBICIA_NA_PULPICIE, ["osoba", "osoby", "osób"])} z
              grafiku bez odbicia
            </p>
          )}
          {aktywni.length === 0 && (
            <p className="text-sm text-[#6E6E66] pt-3">Nikt teraz nie pracuje.</p>
          )}
          {grupyAktywnych.map((g) => (
            <div key={g.lokal} className="mt-2.5">
              <div className="flex justify-between text-[12px] font-extrabold tracking-[0.06em] uppercase text-[#6E6E66] py-1.5">
                <span>{g.lokal}</span>
                <span>{g.osoby.length}</span>
              </div>
              {g.osoby.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 py-2 border-t-[1.5px] border-[#DEDCD4]"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#171714] truncate">{s.user_name}</div>
                    <div className="text-[13px] leading-[18px] text-[#6E6E66] truncate">
                      {s.stanowisko}
                    </div>
                  </div>
                  <div className="font-bold tabular-nums whitespace-nowrap text-right text-[#171714]">
                    od {hhmm(s.start_time)}
                    <small className="block font-medium text-[13px] text-[#6E6E66]">
                      {ileTrwa(s.start_time, teraz)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Panel>

        <Panel
          tytul="Terminy i dokumenty"
          stopka="Wszystkie terminy"
          onStopka={() => setActiveTab("pracownicy")}
          data-panel-terminy
        >
          {luki.length > 0 && (
            <div className="bg-[#F6F5F1] rounded-lg p-3 mt-3" data-luki-dokumentow={lukiDokumentow}>
              <div className="font-extrabold text-[#171714]">
                {lukiDokumentow}{" "}
                {odmiana(lukiDokumentow, ["dokument", "dokumenty", "dokumentów"])} bez daty ważności
              </div>
              <div className="text-[13px] text-[#6E6E66]">
                Bez daty system nie ostrzeże przed końcem umowy ani badań.
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5 mb-3">
                {luki.slice(0, 4).map((x) => (
                  <Pigulka key={x.user.id} ton="neutral">
                    {x.user.name} · {x.braki.join(", ")}
                  </Pigulka>
                ))}
                {luki.length > 4 && (
                  <Pigulka ton="neutral">
                    +{luki.length - 4} {odmiana(luki.length - 4, ["osoba", "osoby", "osób"])}
                  </Pigulka>
                )}
              </div>
              <button type="button" className={btnMalyCls} onClick={() => setActiveTab("pracownicy")}>
                <Pencil size={15} /> Uzupełnij daty
              </button>
            </div>
          )}
          <div className="flex justify-between text-[12px] font-extrabold tracking-[0.06em] uppercase text-[#6E6E66] py-1.5 mt-3.5">
            Najbliższe 30 dni
          </div>
          {terminy.length === 0 ? (
            <p className="flex gap-2 items-center text-sm text-[#6E6E66] pt-2.5 pb-0.5">
              <Check size={16} /> Nic nie wygasa{luki.length > 0 ? " (wśród dokumentów z datą)" : ""}
            </p>
          ) : (
            terminy.slice(0, 6).map((t) => (
              <div
                key={`${t.user.id}-${t.label}`}
                className="grid grid-cols-[1fr_auto] gap-2.5 items-center py-2 border-t-[1.5px] border-[#DEDCD4]"
              >
                <div className="min-w-0">
                  <div className="font-bold text-[#171714] truncate">{t.user.name}</div>
                  <div className="text-[13px] text-[#6E6E66]">
                    {t.label} · {dzienKrotki(t.data)}
                  </div>
                </div>
                <Pigulka ton={t.dni <= 7 ? "warn" : "neutral"}>{opisTerminu(t.dni)}</Pigulka>
              </div>
            ))
          )}
          {terminy.length > 6 && (
            <p className="text-[13px] text-[#6E6E66] pt-1">i jeszcze {terminy.length - 6}</p>
          )}
        </Panel>

        <Panel
          tytul="Zadania dziś"
          prawa={zadaniaTotal > 0 ? `${zadaniaDone} z ${zadaniaTotal}` : null}
          stopka="Zadania"
          onStopka={() => setActiveTab("zadania")}
          data-panel-zadania
        >
          {zadaniaLokali.length === 0 && (
            <p className="text-sm text-[#6E6E66] pt-3">Brak lokali w tym widoku.</p>
          )}
          {zadaniaLokali.map((z, i) => (
            <div
              key={z.lokal}
              className={`grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1 py-2.5 ${
                i > 0 ? "border-t-[1.5px] border-[#DEDCD4]" : ""
              }`}
            >
              <span className="font-bold text-[#171714]">{z.lokal}</span>
              {z.total > 0 ? (
                <>
                  <span className="font-bold tabular-nums text-[#171714]">
                    {z.done} z {z.total}
                  </span>
                  <div className="col-span-2">
                    <Pasek pct={(z.done / z.total) * 100} />
                  </div>
                </>
              ) : (
                <>
                  <span className="font-bold text-[#6E6E66]">—</span>
                  <span className="col-span-2 text-[13px] text-[#6E6E66]">
                    Brak zadań na dziś ·{" "}
                    <button type="button" className={linkCls} onClick={() => setActiveTab("zadania")}>
                      Dodaj
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
        </Panel>
      </section>

      {toast && (
        <div className="sticky bottom-0 z-30 -mt-3">
          <PasekCofnij opis={toast.opis} onCofnij={cofnij} />
        </div>
      )}
    </div>
  );
}
