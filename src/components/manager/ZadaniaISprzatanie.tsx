// @ts-nocheck
// Panel kierownika → Zadania. Układ z makiety właściciela (0.56.0, TasksToday /
// TasksLocation / TasksMine / TasksConfig / TasksMobile). Trzy widoki:
//
//   Dziś w lokalach — najpierw STAN: przy "Cała sieć" karta na lokal (postęp,
//     stan każdego bloku, pomiary poza normą), po wybraniu lokalu jego
//     checklisty blok po bloku. Lokal wybiera się górnym paskiem albo kartą.
//   Moje zadania    — lista spraw kierownika (utils/mojeZadania.ts, tabela
//     `zadania_moje`): własne, ze zgłoszeń w Skrzynce, z Pulsu.
//   Bloki i zadania — konfiguracja (ZadaniaKonfiguracja.tsx).
//
// Cała arytmetyka ("co jest dziś do zrobienia", zapis wykonania i pomiaru)
// żyje w utils/tasks.ts — tu tylko rysujemy.
//
// ⚠️ Kierownik odhacza ZA ZESPÓŁ — zapis idzie od razu (to jedno wykonanie
// na dzień, wspólne dla lokalu), a przez 6 s pasek "Cofnij" odkręca go
// (odhaczenie → kasujemy wiersz, odznaczenie → przywracamy ten sam wiersz).
// Wykonania z pomiarem dalej nie da się odznaczyć — tylko "Popraw" z powodem.
import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Clock,
  Thermometer,
  Activity,
  Flag,
  User,
  Lock,
  Repeat,
  Plus,
  ArrowRight,
  Users,
} from "lucide-react";
import {
  blokiNaDzien,
  splaszczBloki,
  toggleTaskCompletion,
  przywrocWykonanie,
  zapiszWykonanieZPomiarem,
  poprawPomiarZadania,
  kluczWpisuZadania,
  parseStanowiska,
  dniBlokuLabel,
  toLocalYMD,
} from "../../utils/tasks";
import { wartoscPolaTekst, opisNormy } from "../../utils/pola";
import { publishedShiftsOnDay } from "../../utils/grafik";
import { znajdzKarte, opisPoprawki } from "../../utils/dziennik";
import {
  KIEDY,
  GRUPY_MOICH,
  terminZ,
  widoczneDla,
  grupaMojego,
  opisTerminu,
  naDzis,
  dodajMojeZadanie,
  ustawZrobione,
  ustawTermin,
  naJutro,
  maZadanieZe,
} from "../../utils/mojeZadania";
import { pad } from "../../utils/czas";
import ModalWpisu from "./ModalWpisu";
import SladPoprawki from "./SladPoprawki";
import ZadaniaKonfiguracja from "./ZadaniaKonfiguracja";
import { PasekCofnij, CZAS_NA_COFNIECIE_MS } from "./odlozoneDecyzje";

// --- klasy (tokeny "Shiftro", te same co w Grafiku i Ustawieniach) ---
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const inputCls =
  "w-full h-12 md:h-11 border-[2px] border-[#171714] rounded-md bg-white px-3 text-[15px] text-[#171714]";
const btnMalyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#F6F5F1] disabled:opacity-40";
const btnMalyGlownyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#B8321A] disabled:opacity-40";
const btnGlownyCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[15px] whitespace-nowrap hover:bg-[#B8321A] disabled:opacity-40";
const linkCls = "text-sm font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22]";

const DNI = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
const MIES = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const fmtDzien = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return `${DNI[d.getDay()]} ${d.getDate()} ${MIES[d.getMonth()]}`;
};
const godz = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const liczba = (v) => String(v).replace(".", ",");

// Pory w filtrze widoku lokalu. Pokazujemy tylko NIEPUSTE — makieta: pusta
// zakładka "Obiadowe" to strona, na którą ktoś wejdzie i nic nie zobaczy.
const PORY_FILTRA = [
  { key: "all", label: "Wszystkie" },
  { key: "poranne", label: "Poranne" },
  { key: "obiadowe", label: "Obiadowe" },
  { key: "wieczorne", label: "Wieczorne" },
  { key: "ogolne", label: "Ogólne" },
  { key: "cykliczne", label: "Cykliczne" },
  { key: "kierownik", label: "Kierownika" },
];
const cykliczny = (g) =>
  g.blok.schedule_type === "cykliczne" || g.items.some((i) => i.task.cycle_days);
const pasujeDoPory = (g, pora) =>
  pora === "all"
    ? true
    : pora === "kierownik"
    ? !!g.blok.for_manager
    : pora === "cykliczne"
    ? cykliczny(g)
    : g.blok.schedule_type === pora && !g.blok.for_manager;

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md).
// ---------------------------------------------------------------------------
function Postep({ pct, czerwony }) {
  return (
    <div className="h-2 rounded-full bg-[#ECEBE6] overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: czerwony ? "#DE3A22" : "#171714" }}
      />
    </div>
  );
}

function Kafelek({ etykieta, duza, maly, pod, ton, pct, id }) {
  const kolor = ton === "bad" ? "#DE3A22" : ton === "warn" ? "#8A5300" : null;
  return (
    <div
      className={`${kartaCls} px-4 md:px-5 py-4 flex flex-col gap-1.5 min-w-[200px] md:min-w-0 snap-start`}
      style={kolor ? { borderColor: kolor } : undefined}
      data-kafelek-zadan={id}
    >
      <span className={etykietaCls}>{etykieta}</span>
      <span className="font-['Archivo'] text-[28px] leading-8 font-extrabold tabular-nums" style={kolor ? { color: kolor } : undefined}>
        {duza}
        {maly != null && <small className="text-[18px] text-[#6E6E66] font-bold">/{maly}</small>}
      </span>
      {pct != null && <Postep pct={pct} />}
      <span className="text-[13px] leading-[18px] text-[#6E6E66]">{pod}</span>
    </div>
  );
}

function Pole({ zaznaczone, onClick, disabled, title, ...reszta }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={zaznaczone}
      className={`w-8 h-8 md:w-7 md:h-7 rounded-md border-[2px] grid place-items-center flex-shrink-0 disabled:opacity-50 ${
        zaznaczone ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#171714] hover:bg-[#F6F5F1]"
      }`}
      {...reszta}
    >
      {zaznaczone && <Check size={16} strokeWidth={3} />}
    </button>
  );
}

function TagWazne() {
  return (
    <span className="inline-flex items-center h-5 px-1.5 rounded bg-[#FAEAE6] text-[#8A3A2B] text-[11px] font-extrabold uppercase tracking-[0.04em]">
      Ważne
    </span>
  );
}

function MiniTag({ children }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[#ECEBE6] text-[12px] font-semibold text-[#171714] whitespace-nowrap">
      {children}
    </span>
  );
}

// Podpis źródła sprawy w "Moich zadaniach".
function Zrodlo({ z }) {
  if (z.zrodlo === "zgloszenie")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1D5FA8]">
        <Flag size={12} /> {z.zrodlo_opis || "Zgłoszenie"}
      </span>
    );
  if (z.zrodlo === "puls")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#8A5300]">
        <Activity size={12} /> Z Pulsu{z.zrodlo_opis ? ` · ${z.zrodlo_opis}` : ""}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#6E6E66]">
      <User size={12} /> Własne
    </span>
  );
}

function WierszMoj({ z, dzis, onZrobione, onNaJutro, busy }) {
  const grupa = grupaMojego(z, dzis);
  const zalegle = grupa === "zalegle";
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto] gap-3 items-start px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 ${
        z.zrobione_at ? "opacity-60" : ""
      }`}
      data-moje-zadanie={grupa}
    >
      <Pole zaznaczone={!!z.zrobione_at} onClick={() => onZrobione(z)} disabled={busy} title="Zrobione" data-moje-cbx />
      <div className="min-w-0">
        <div className={`font-bold text-[15px] ${z.zrobione_at ? "line-through" : ""}`}>{z.tytul}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
          <Zrodlo z={z} />
          <span className="text-[12px] text-[#6E6E66]">{z.lokal || "Cała sieć"}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={`inline-flex items-center gap-1 text-[13px] font-bold ${zalegle ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
          {zalegle && <AlertTriangle size={13} />}
          {opisTerminu(z.termin, dzis)}
        </span>
        {!z.zrobione_at && (
          <button
            type="button"
            onClick={() => onNaJutro(z)}
            disabled={busy}
            className="hidden md:inline-flex h-8 px-2.5 rounded-md text-[13px] font-bold text-[#6E6E66] hover:bg-[#F6F5F1] hover:text-[#171714]"
            data-na-jutro
          >
            Na jutro
          </button>
        )}
      </div>
    </div>
  );
}

export default function ZadaniaISprzatanie({
  currentUser,
  tasks,
  setTasks,
  taskBlocks,
  setTaskBlocks,
  taskCompletions,
  setTaskCompletions,
  dayLogs,
  dayLogEntries,
  setDayLogEntries,
  dayLogTemplates,
  planShifts,
  matchesFilter,
  availableLokale,
  activeStanowiska,
  selectedLokal,
  onWybierzLokal,
  zadaniaMoje,
  setZadaniaMoje,
  mojeBlad,
  showMsg,
}) {
  const dzis = toLocalYMD(new Date());
  const [widok, setWidok] = useState("dzis");
  const [selectedDate, setSelectedDate] = useState(dzis);
  const [pora, setPora] = useState("all");
  const [otwarte, setOtwarte] = useState({});
  const [pomiarDla, setPomiarDla] = useState(null); // task.id z otwartym polem pomiaru
  const [wartosci, setWartosci] = useState({});
  const [poprawka, setPoprawka] = useState(null); // item
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { opis, cofnij }
  const timerRef = useRef(null);
  const [cfgLokal, setCfgLokal] = useState(null);
  // "Moje zadania" — szybkie dodanie
  const [nowyTytul, setNowyTytul] = useState("");
  const [nowyKiedy, setNowyKiedy] = useState("dzis");
  const [nowyLokal, setNowyLokal] = useState(selectedLokal && selectedLokal !== "ALL" ? selectedLokal : "");
  const [pokazZrobione, setPokazZrobione] = useState(false);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  useEffect(() => setPora("all"), [selectedLokal]);

  const lokaleNames = (availableLokale || []).map((l) => l.name);
  const jedenLokal = lokaleNames.length === 1;
  // Widok jednego lokalu: wybrany w górnym pasku albo jedyny dostępny.
  const lokalWidoku =
    selectedLokal && selectedLokal !== "ALL" ? selectedLokal : jedenLokal ? lokaleNames[0] : null;
  const isToday = selectedDate === dzis;
  const teraz = new Date().toTimeString().slice(0, 5);

  const pokazToast = (opis, cofnij = null) => {
    clearTimeout(timerRef.current);
    setToast({ opis, cofnij });
    timerRef.current = setTimeout(() => setToast(null), CZAS_NA_COFNIECIE_MS);
  };
  const cofnijToast = async () => {
    const t = toast;
    clearTimeout(timerRef.current);
    setToast(null);
    if (t?.cofnij) {
      try {
        await t.cofnij();
      } catch (e) {
        showMsg(e.message || "Nie udało się cofnąć.", "error");
      }
    }
  };

  const shiftDate = (delta) => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setSelectedDate(toLocalYMD(d));
  };

  const moje = widoczneDla(zadaniaMoje, currentUser);
  const otwarteMoje = moje.filter((z) => !z.zrobione_at);

  // --- checklisty --------------------------------------------------------
  const grupyLokalu = (lokal) =>
    blokiNaDzien({
      tasks: (tasks || []).filter((t) => t.lokal === lokal),
      blocks: (taskBlocks || []).filter((b) => b.lokal === lokal),
      completions: taskCompletions,
      entries: dayLogEntries,
      templates: dayLogTemplates,
      lokal,
      dateStr: selectedDate,
      forManager: null,
    });
  const termin = (i) => (i.task.deadline_time || i.blok.deadline_time || "").slice(0, 5) || null;
  // Po terminie: dzień miniony — każde niezrobione z terminem; dziś — po
  // godzinie; dzień przyszły — nic (do 0.55 przyszły dzień też świecił).
  const poTerminie = (i) => {
    if (i.done) return false;
    const t = termin(i);
    if (!t) return false;
    if (selectedDate < dzis) return true;
    if (selectedDate > dzis) return false;
    return t < teraz;
  };
  const statystyki = (grupy) => {
    const pozycje = splaszczBloki(grupy);
    return {
      n: pozycje.length,
      d: pozycje.filter((i) => i.done).length,
      late: pozycje.filter(poTerminie).length,
      bad: pozycje.filter((i) => i.alarm).length,
      bloki: grupy.length,
      zamkniete: grupy.filter((g) => g.zostalo === 0).length,
    };
  };

  // Kto dziś obsadza blok wg opublikowanego grafiku — "komu to przypisane":
  // zadania są wspólne, wykonują je ci, którzy mają zmianę na pasującym
  // stanowisku.
  const obsadaBloku = (blok) => {
    const zmiany = publishedShiftsOnDay(planShifts, blok.lokal, selectedDate) || [];
    const lista = parseStanowiska(blok);
    return [...new Set(zmiany.filter((s) => !lista || lista.includes(s.stanowisko)).map((s) => s.user_name))];
  };

  const zapiszWynik = (result) => {
    if (result.removedId) setTaskCompletions((prev) => prev.filter((c) => c.id !== result.removedId));
    else if (result.created) setTaskCompletions((prev) => [...prev, result.created]);
    if (result.wpis && typeof setDayLogEntries === "function") setDayLogEntries((prev) => [...(prev || []), result.wpis]);
    if (result.updated)
      // Scalamy, nie podmieniamy: gdyby patch wrócił niepełny, podmiana
      // zgubiłaby task_id i wykonanie zniknęłoby z checklisty.
      setTaskCompletions((prev) => prev.map((c) => (c.id === result.updated.id ? { ...c, ...result.updated } : c)));
  };

  const handleTick = async (item) => {
    if (item.pomiar && !item.done) {
      setPomiarDla(item.task.id);
      setWartosci({});
      return;
    }
    if (item.pomiar && item.done) return;
    setBusy(true);
    try {
      const wynik = await toggleTaskCompletion({
        task: item.task,
        dateStr: selectedDate,
        existingCompletion: item.completion,
        actorId: currentUser.id,
        actorName: currentUser.name,
        shiftId: null,
      });
      zapiszWynik(wynik);
      if (wynik.created) {
        const utworzone = wynik.created;
        pokazToast(`Odhaczono za zespół: ${item.task.title}`, async () =>
          zapiszWynik(
            await toggleTaskCompletion({ task: item.task, dateStr: selectedDate, existingCompletion: utworzone })
          )
        );
      } else {
        const stare = item.completion;
        pokazToast(`Odznaczono: ${item.task.title}`, async () =>
          zapiszWynik({ created: await przywrocWykonanie(stare) })
        );
      }
    } catch (err) {
      showMsg(err.message || "Błąd zapisu zadania!", "error");
    }
    setBusy(false);
  };

  const brakujace = (item) =>
    item.pola.filter((p) => p.typ !== "bool" && !String(wartosci[p.klucz] ?? "").trim());

  const zapiszPomiarInline = async (item) => {
    if (brakujace(item).length) return;
    const payload = {};
    item.pola.forEach((p) => {
      const v = wartosci[p.klucz];
      payload[p.klucz] = p.typ === "bool" ? v === true : p.typ === "number" ? String(v).replace(",", ".").trim() : v;
    });
    setBusy(true);
    try {
      const karta = znajdzKarte(dayLogs, item.task.lokal, selectedDate);
      const wynik = await zapiszWykonanieZPomiarem({
        task: item.task,
        dateStr: selectedDate,
        payload,
        dayLogId: karta ? karta.id : null,
        actorId: currentUser.id,
        actorName: currentUser.name,
      });
      zapiszWynik(wynik);
      setPomiarDla(null);
      setWartosci({});
      const poza = item.pola.some((p) => {
        if (p.typ !== "number") return false;
        const n = Number(payload[p.klucz]);
        return (p.min != null && n < p.min) || (p.max != null && n > p.max);
      });
      pokazToast(poza ? "Zapisano — wynik poza normą, dopisany do karty dnia" : "Zapisano pomiar");
    } catch (err) {
      showMsg(err.message || "Błąd zapisu pomiaru!", "error");
    }
    setBusy(false);
  };

  const zapiszPoprawke = async (typ, klucz, nowe, powod) => {
    const item = poprawka;
    setBusy(true);
    try {
      zapiszWynik(
        await poprawPomiarZadania({
          task: item.task,
          completion: item.completion,
          staryWpis: item.wpis,
          payload: nowe,
          powod,
          actorName: currentUser.name,
        })
      );
      showMsg("Poprawka zapisana — stara wartość została w dzienniku.");
      setPoprawka(null);
    } catch (err) {
      showMsg(err.message || "Błąd zapisu poprawki!", "error");
    }
    setBusy(false);
  };

  // Pomiar poza normą → sprawa do "Moich zadań".
  const doMoich = async (item) => {
    const w = item.wpis;
    const wartosc = item.pola.map((p) => `${p.label} ${liczba(wartoscPolaTekst(p, w.payload || {}))}`).join(", ");
    setBusy(true);
    try {
      const z = await dodajMojeZadanie({
        tytul: `${item.task.title} · ${wartosc} — sprawdzić`,
        lokal: item.task.lokal,
        termin: dzis,
        zrodlo: "puls",
        zrodloId: w.id,
        zrodloOpis: `Pomiar poza normą · ${w.recorded_by || "?"} ${godz(w.recorded_at || w.created_at)}`.trim(),
        currentUser,
      });
      setZadaniaMoje((prev) => [z, ...(prev || [])]);
      pokazToast("Dodano do Moich zadań");
    } catch (err) {
      showMsg(err.message || "Nie udało się dodać zadania.", "error");
    }
    setBusy(false);
  };

  // --- moje zadania ------------------------------------------------------
  const podmienMoje = (z) => setZadaniaMoje((prev) => (prev || []).map((x) => (x.id === z.id ? { ...x, ...z } : x)));

  const dodajMoje = async () => {
    if (!nowyTytul.trim()) return;
    setBusy(true);
    try {
      const z = await dodajMojeZadanie({
        tytul: nowyTytul,
        lokal: nowyLokal || null,
        termin: terminZ(nowyKiedy, dzis),
        currentUser,
      });
      setZadaniaMoje((prev) => [z, ...(prev || [])]);
      setNowyTytul("");
      pokazToast("Dodano zadanie");
    } catch (err) {
      showMsg(err.message || "Nie udało się dodać zadania.", "error");
    }
    setBusy(false);
  };

  const przelaczZrobione = async (z) => {
    const nowe = !z.zrobione_at;
    setBusy(true);
    try {
      podmienMoje(await ustawZrobione(z, nowe, currentUser));
      pokazToast(nowe ? `Zrobione: ${z.tytul}` : "Przywrócono", async () =>
        podmienMoje(await ustawZrobione(z, !nowe, currentUser))
      );
    } catch (err) {
      showMsg(err.message || "Błąd zapisu.", "error");
    }
    setBusy(false);
  };

  const przesunNaJutro = async (z) => {
    const poprzedni = z.termin || null;
    setBusy(true);
    try {
      podmienMoje(await naJutro(z, dzis));
      pokazToast("Przesunięto na jutro", async () => podmienMoje(await ustawTermin(z, poprzedni)));
    } catch (err) {
      showMsg(err.message || "Błąd zapisu.", "error");
    }
    setBusy(false);
  };

  const otworzKonfiguracje = (lokal) => {
    setCfgLokal(lokal || lokalWidoku || lokaleNames[0] || "");
    setWidok("bloki");
  };

  // --- render: kafelki ---------------------------------------------------
  const kafelki = (s) => {
    const pct = s.n ? Math.round((s.d / s.n) * 100) : 0;
    return (
      <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 md:scroll-px-0 -mx-4 px-4 md:mx-0 md:px-0 mb-4 [scrollbar-width:none]">
        <Kafelek id="wykonane" etykieta="Wykonane" duza={s.d} maly={s.n} pct={pct} pod={s.n ? `${pct}% zadań na ${isToday ? "dziś" : "ten dzień"}` : "brak zadań na ten dzień"} />
        <Kafelek id="bloki" etykieta="Bloki zamknięte" duza={s.zamkniete} maly={s.bloki} pod="wszystkie zadania bloku odhaczone" />
        <Kafelek
          id="po-terminie"
          etykieta="Po terminie"
          duza={s.late}
          ton={s.late ? "bad" : null}
          pod={s.late ? "niewykonane mimo godziny" : "wszystko na czas"}
        />
        <Kafelek id="poza-norma" etykieta="Pomiary poza normą" duza={s.bad} ton={s.bad ? "warn" : null} pod="trafiają też do karty dnia" />
      </div>
    );
  };

  // --- render: "Moje zadania na dziś" pod kartami lokali -----------------
  const zapowiedzMoich = () => {
    const lista = naDzis(moje, dzis);
    return (
      <div className={`${kartaCls} mt-4 overflow-hidden`} data-moje-na-dzis>
        <div className="flex items-center gap-2 px-4 md:px-[18px] py-3 border-b-[1.5px] border-[#DEDCD4]">
          <User size={17} />
          <h3 className="m-0 font-['Archivo'] font-extrabold text-base">Moje zadania na dziś</h3>
          <span className="ml-auto text-sm font-bold text-[#6E6E66] tabular-nums">{lista.length}</span>
        </div>
        {lista.length === 0 ? (
          <p className="m-0 px-4 md:px-[18px] py-3 text-sm text-[#6E6E66]">Na dziś nic — dopisz coś w „Moich zadaniach”.</p>
        ) : (
          lista.map((z) => (
            <WierszMoj key={z.id} z={z} dzis={dzis} onZrobione={przelaczZrobione} onNaJutro={przesunNaJutro} busy={busy} />
          ))
        )}
        <div className="px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] flex justify-center">
          <button type="button" className={`${linkCls} inline-flex items-center gap-1`} onClick={() => setWidok("moje")}>
            Wszystkie moje zadania <ArrowRight size={15} />
          </button>
        </div>
      </div>
    );
  };

  // --- render: przegląd sieci -------------------------------------------
  const przeglad = () => {
    const lokaleWZasiegu = lokaleNames.filter((n) => matchesFilter(n));
    const wszystkie = lokaleWZasiegu.map((n) => ({ lokal: n, grupy: grupyLokalu(n) }));
    const razem = statystyki(wszystkie.flatMap((w) => w.grupy));
    return (
      <>
        {kafelki(razem)}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-przeglad-lokali>
          {wszystkie.map(({ lokal, grupy }) => {
            const s = statystyki(grupy);
            const pct = s.n ? Math.round((s.d / s.n) * 100) : 0;
            return (
              <div
                key={lokal}
                role="button"
                tabIndex={0}
                onClick={() => onWybierzLokal(lokal)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onWybierzLokal(lokal)}
                className={`${kartaCls} px-4 md:px-[18px] py-4 flex flex-col gap-2.5 cursor-pointer hover:bg-[#F6F5F1] text-left`}
                data-lokal-karta={lokal}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <b className="font-['Archivo'] font-extrabold text-[17px]">{lokal}</b>
                  {grupy.length > 0 && (
                    <span className="font-['Archivo'] font-extrabold text-[17px] tabular-nums">
                      {s.d}/{s.n}
                    </span>
                  )}
                </div>
                {grupy.length === 0 ? (
                  <>
                    <span className="text-sm text-[#6E6E66]">Brak bloków na {isToday ? "dziś" : "ten dzień"}</span>
                    <button
                      type="button"
                      className={`${linkCls} self-start`}
                      onClick={(e) => {
                        e.stopPropagation();
                        otworzKonfiguracje(lokal);
                      }}
                    >
                      Ustaw bloki zadań
                    </button>
                  </>
                ) : (
                  <>
                    <Postep pct={pct} czerwony={s.late > 0} />
                    <div className="flex flex-col gap-1.5">
                      {grupy.map((g) => {
                        const lt = g.items.filter(poTerminie).length;
                        const zamkniety = g.zostalo === 0;
                        return (
                          <div key={g.blok.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex items-center gap-1.5 min-w-0">
                              {zamkniety ? (
                                <Check size={14} className="text-[#1F7A4A] flex-shrink-0" />
                              ) : lt ? (
                                <AlertTriangle size={14} className="text-[#DE3A22] flex-shrink-0" />
                              ) : (
                                <Clock size={14} className="text-[#6E6E66] flex-shrink-0" />
                              )}
                              <span className="truncate">{g.blok.nazwa}</span>
                            </span>
                            <span
                              className={`font-bold tabular-nums whitespace-nowrap ${
                                lt ? "text-[#DE3A22]" : zamkniety ? "text-[#1F7A4A]" : "text-[#6E6E66]"
                              }`}
                            >
                              {lt ? `${lt} po terminie` : `${g.done}/${g.total}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {s.bad > 0 && (
                      <span className="self-start inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-[#FDF0D8] text-[#8A5300] text-[13px] font-bold">
                        <Thermometer size={13} /> {s.bad} {s.bad === 1 ? "pomiar" : "pomiary"} poza normą
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {zapowiedzMoich()}
      </>
    );
  };

  // --- render: wiersz zadania -------------------------------------------
  const opisPomiaru = (item) => {
    if (item.task.template_key) {
      const sz = (dayLogTemplates || []).find((s) => s.klucz === item.task.template_key && s.lokal === item.task.lokal);
      return (
        <>
          <Activity size={13} /> Karta dnia: {sz ? sz.nazwa : item.task.template_key}
        </>
      );
    }
    return (
      <>
        <Thermometer size={13} />
        {item.pola.map((p) => `${p.label}${opisNormy(p) ? " " + opisNormy(p) : p.jednostka ? " " + p.jednostka : ""}`).join(", ")}
      </>
    );
  };

  const wierszZadania = (item) => {
    const lt = poTerminie(item);
    const t = termin(item);
    const otwartyPomiar = pomiarDla === item.task.id && !item.done;
    const juzWMoich = item.wpis && maZadanieZe(zadaniaMoje, [], item.wpis.id);
    return (
      <div
        key={item.task.id}
        className={`grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-start px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] ${
          lt ? "bg-[#FFF3EF]" : ""
        }`}
        data-zadanie={item.done ? "zrobione" : lt ? "po-terminie" : "otwarte"}
      >
        <Pole
          zaznaczone={item.done}
          onClick={() => handleTick(item)}
          disabled={busy || (item.pomiar && item.done)}
          title={
            item.pomiar && !item.done ? "Wpisz pomiar" : item.pomiar && item.done ? "Pomiaru nie da się odznaczyć — użyj Popraw" : "Odhacz za zespół"
          }
          data-cbx-zadania
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-bold text-[15px] ${item.done ? "line-through text-[#6E6E66]" : ""}`}>{item.task.title}</span>
            {item.task.priority === "wysoki" && <TagWazne />}
            {item.task.cycle_days && (
              <MiniTag>
                <Repeat size={12} /> co {item.task.cycle_days} dni
              </MiniTag>
            )}
            {dniBlokuLabel(item.task) && <MiniTag>{dniBlokuLabel(item.task)}</MiniTag>}
          </div>
          {item.task.description && (
            <div className="text-[13px] leading-[18px] text-[#6E6E66] mt-0.5 whitespace-pre-line">{item.task.description}</div>
          )}
          {item.pomiar && item.done && item.wpis && (
            <>
              <div
                className={`mt-1 text-[14px] inline-flex flex-wrap items-center gap-1 ${item.alarm ? "text-[#DE3A22] font-bold" : ""}`}
                data-wynik-pomiaru={item.alarm ? "poza" : "ok"}
              >
                <Thermometer size={13} />
                {item.pola.map((p, i) => (
                  <span key={p.klucz}>
                    {i > 0 ? ", " : ""}
                    {p.label}: <b>{liczba(wartoscPolaTekst(p, item.wpis.payload || {}))}</b>
                    {item.alarm && opisNormy(p) ? ` · norma ${opisNormy(p)}` : ""}
                  </span>
                ))}
              </div>
              <SladPoprawki opis={opisPoprawki(item.wpis, dayLogEntries, item.pola)} />
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {item.alarm && (
                  <>
                    <span className="text-[13px] text-[#6E6E66]">Zapisane też w karcie dnia.</span>
                    {juzWMoich ? (
                      <span className="text-[13px] font-bold text-[#1F7A4A] inline-flex items-center gap-1">
                        <Check size={13} /> w Moich zadaniach
                      </span>
                    ) : (
                      <button type="button" className={btnMalyCls} disabled={busy} onClick={() => doMoich(item)} data-do-moich>
                        <Plus size={15} /> Do moich zadań
                      </button>
                    )}
                  </>
                )}
                <button type="button" className={btnMalyCls} disabled={busy} onClick={() => setPoprawka(item)}>
                  Popraw
                </button>
              </div>
            </>
          )}
          {item.pomiar && !item.done && !otwartyPomiar && (
            <div className="mt-1 text-[13px] text-[#6E6E66] inline-flex items-center gap-1">{opisPomiaru(item)}</div>
          )}
          {otwartyPomiar && (
            <div className="mt-2 flex flex-wrap items-end gap-2" data-pomiar-inline>
              {item.pola.map((p) => (
                <label key={p.klucz} className="flex flex-col gap-1 text-[13px] font-bold">
                  {p.label}
                  {p.typ === "bool" ? (
                    <span className="flex gap-1.5">
                      {[
                        [true, "Tak"],
                        [false, "Nie"],
                      ].map(([v, l]) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setWartosci((w) => ({ ...w, [p.klucz]: v }))}
                          className={`h-10 px-3 rounded-md border-[2px] font-bold ${
                            (wartosci[p.klucz] === true) === v ? "bg-[#171714] text-white border-[#171714]" : "bg-white border-[#171714]"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="relative inline-block w-[140px]">
                      <input
                        autoFocus={p === item.pola[0]}
                        inputMode={p.typ === "number" ? "decimal" : "text"}
                        className={`${inputCls} h-10 md:h-10 tabular-nums ${p.jednostka ? "pr-10" : ""}`}
                        placeholder={opisNormy(p) || ""}
                        value={wartosci[p.klucz] ?? ""}
                        onChange={(e) => setWartosci((w) => ({ ...w, [p.klucz]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && zapiszPomiarInline(item)}
                        data-pole-pomiaru={p.klucz}
                      />
                      {p.jednostka && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E6E66] font-bold pointer-events-none">
                          {p.jednostka}
                        </span>
                      )}
                    </span>
                  )}
                </label>
              ))}
              <button
                type="button"
                className={btnMalyGlownyCls}
                disabled={busy || brakujace(item).length > 0}
                onClick={() => zapiszPomiarInline(item)}
                data-zapisz-pomiar
              >
                <Check size={15} /> Zapisz
              </button>
              <button type="button" className={btnMalyCls} onClick={() => setPomiarDla(null)}>
                Anuluj
              </button>
            </div>
          )}
        </div>
        <div className="col-start-2 md:col-start-3 md:row-start-1 text-[13px] md:text-right whitespace-nowrap">
          {item.done ? (
            <span className="font-bold text-[#1F7A4A]">
              {item.completion?.user_name || "?"}
              {item.completion?.completed_at ? ` · ${godz(item.completion.completed_at)}` : ""}
            </span>
          ) : lt ? (
            <span className="font-bold text-[#DE3A22] inline-flex items-center gap-1">
              <AlertTriangle size={13} /> po terminie · do {t}
            </span>
          ) : t ? (
            <span className="text-[#6E6E66]">do {t}</span>
          ) : (
            <span className="text-[#6E6E66]">w ciągu dnia</span>
          )}
        </div>
      </div>
    );
  };

  // --- render: jeden lokal ----------------------------------------------
  const widokLokalu = (lokal) => {
    const grupy = grupyLokalu(lokal);
    const liczniki = { all: grupy.length };
    grupy.forEach((g) => {
      PORY_FILTRA.forEach((p) => {
        if (p.key !== "all" && pasujeDoPory(g, p.key)) liczniki[p.key] = (liczniki[p.key] || 0) + 1;
      });
    });
    const widoczne = grupy.filter((g) => pasujeDoPory(g, pora));
    return (
      <>
        {kafelki(statystyki(grupy))}
        {grupy.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-3.5 [scrollbar-width:none]">
            {PORY_FILTRA.filter((p) => liczniki[p.key]).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPora(p.key)}
                className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
                  pora === p.key ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                }`}
                data-pora-filtr={p.key}
              >
                {p.label}
                <span className={`tabular-nums ${pora === p.key ? "text-white/75" : "text-[#6E6E66]"}`}>{liczniki[p.key]}</span>
              </button>
            ))}
          </div>
        )}
        {grupy.length === 0 && (
          <div className={`${kartaCls} px-5 py-10 text-center`}>
            <b className="block font-['Archivo'] font-extrabold text-lg">Brak bloków zadań na {isToday ? "dziś" : "ten dzień"}</b>
            <span className="text-sm text-[#6E6E66]">Ten lokal nie ma na ten dzień żadnej checklisty.</span>
            <div className="mt-3">
              <button type="button" className={btnMalyCls} onClick={() => otworzKonfiguracje(lokal)}>
                <Plus size={15} /> Ustaw bloki zadań
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {widoczne.map((g) => {
            const lt = g.items.filter(poTerminie).length;
            const otwarty = otwarte[g.blok.id] != null ? otwarte[g.blok.id] : g.zostalo > 0;
            const stanowiska = parseStanowiska(g.blok);
            const osoby = obsadaBloku(g.blok);
            const pct = g.total ? (g.done / g.total) * 100 : 0;
            return (
              <div key={g.blok.id} className={`${kartaCls} overflow-hidden`} data-blok-zadan={g.blok.nazwa}>
                <button
                  type="button"
                  onClick={() => setOtwarte((prev) => ({ ...prev, [g.blok.id]: !otwarty }))}
                  aria-expanded={otwarty}
                  className="w-full grid grid-cols-[20px_1fr_auto] gap-3 items-center px-4 md:px-[18px] pt-3.5 pb-2.5 text-left hover:bg-[#F6F5F1]"
                >
                  <ChevronRight size={18} className={`text-[#6E6E66] transition-transform ${otwarty ? "rotate-90" : ""}`} />
                  <span className="min-w-0">
                    <b className="block font-['Archivo'] font-extrabold text-[16px]">{g.blok.nazwa}</b>
                    <span className="block text-[13px] leading-[18px] text-[#6E6E66]">
                      {(PORY_FILTRA.find((p) => p.key === g.blok.schedule_type) || PORY_FILTRA[4]).label}
                      {g.blok.schedule_type === "cykliczne" ? ` co ${g.blok.cycle_days || 1} dni` : ""}
                      {g.blok.deadline_time ? ` · do ${g.blok.deadline_time.slice(0, 5)}` : ""}
                      {" · "}
                      {stanowiska ? stanowiska.join(", ") : "wszyscy na zmianie"}
                      {g.blok.for_manager && (
                        <span className="inline-flex items-center gap-0.5 ml-1">
                          · <Lock size={11} /> tylko kierownik
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {lt ? (
                      <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#DE3A22] text-white text-[13px] font-bold whitespace-nowrap">
                        {lt} po terminie
                      </span>
                    ) : g.alarm ? (
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#FDF0D8] text-[#8A5300] text-[13px] font-bold whitespace-nowrap">
                        <Thermometer size={13} /> poza normą
                      </span>
                    ) : g.zostalo === 0 ? (
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#E2F3E9] text-[#1F7A4A] text-[13px] font-bold whitespace-nowrap">
                        <Check size={13} /> Zamknięty
                      </span>
                    ) : null}
                    <span className="font-['Archivo'] font-extrabold tabular-nums">
                      {g.done}/{g.total}
                    </span>
                  </span>
                </button>
                <div className="px-4 md:px-[18px] pb-3">
                  <Postep pct={pct} czerwony={lt > 0} />
                </div>
                {otwarty && (
                  <div>
                    <div className="px-4 md:px-[18px] pb-2 text-[13px] text-[#6E6E66] flex items-center gap-1.5">
                      <Users size={13} />
                      {osoby.length ? `Dziś wg grafiku: ${osoby.join(", ")}` : "Nikt dziś nie obsadza tego bloku wg grafiku"}
                    </div>
                    {g.items.map(wierszZadania)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  // --- render: moje zadania ---------------------------------------------
  const widokMoich = () => {
    if (mojeBlad)
      return (
        <div className={`${kartaCls} px-5 py-4 text-sm`} data-moje-blad>
          <b className="block mb-1">Lista „Moje zadania” nie jest jeszcze dostępna</b>
          Baza nie ma tabeli <code>zadania_moje</code> — trzeba zastosować migrację 0038. ({mojeBlad})
        </div>
      );
    const zrobione = moje.filter((z) => z.zrobione_at);
    return (
      <>
        <div className={`${kartaCls} p-3 md:p-4 flex flex-col gap-2.5`} data-szybkie-dodanie>
          <input
            className={inputCls}
            placeholder="Nowe zadanie dla siebie… np. zamówić serwetki"
            value={nowyTytul}
            onChange={(e) => setNowyTytul(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dodajMoje()}
            data-nowe-moje
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${inputCls} w-auto font-semibold`}
              value={nowyLokal}
              onChange={(e) => setNowyLokal(e.target.value)}
            >
              <option value="">Cała sieć</option>
              {lokaleNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <div className="flex gap-1.5 flex-wrap">
              {KIEDY.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setNowyKiedy(k.key)}
                  className={`inline-flex items-center h-[34px] px-3 rounded-full border-[1.5px] text-[13px] font-semibold whitespace-nowrap ${
                    nowyKiedy === k.key ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] hover:border-[#171714]"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button type="button" className={btnGlownyCls} disabled={busy || !nowyTytul.trim()} onClick={dodajMoje} data-dodaj-moje>
              <Plus size={17} /> Dodaj
            </button>
          </div>
        </div>
        <p className="text-[13px] leading-[18px] text-[#6E6E66] mt-2 mb-4">
          Trafiają tu też sprawy ze Skrzynki (przycisk „Utwórz zadanie” przy zgłoszeniu) i z Pulsu („Do moich zadań” przy
          pomiarze poza normą).
        </p>
        {otwarteMoje.length === 0 && (
          <div className={`${kartaCls} px-5 py-8 text-center text-sm text-[#6E6E66] mb-3`}>Nic otwartego — wszystko zrobione.</div>
        )}
        {GRUPY_MOICH.map((g) => {
          const lista = otwarteMoje
            .filter((z) => grupaMojego(z, dzis) === g.key)
            .sort((a, b) => String(a.termin || "9999").localeCompare(String(b.termin || "9999")));
          if (!lista.length) return null;
          return (
            <div
              key={g.key}
              className={`${kartaCls} overflow-hidden mb-3`}
              style={g.key === "zalegle" ? { borderColor: "#DE3A22" } : undefined}
              data-grupa-moich={g.key}
            >
              <div className="flex items-center gap-2 px-4 md:px-[18px] py-3 border-b-[1.5px] border-[#DEDCD4]">
                <h3 className="m-0 font-['Archivo'] font-extrabold text-base">{g.label}</h3>
                <span className="ml-auto text-sm font-bold text-[#6E6E66] tabular-nums">{lista.length}</span>
              </div>
              {lista.map((z) => (
                <WierszMoj key={z.id} z={z} dzis={dzis} onZrobione={przelaczZrobione} onNaJutro={przesunNaJutro} busy={busy} />
              ))}
            </div>
          );
        })}
        {zrobione.length > 0 && (
          <>
            <button type="button" className={linkCls} onClick={() => setPokazZrobione((v) => !v)} data-pokaz-zrobione>
              {pokazZrobione ? "Ukryj" : "Pokaż"} zrobione ({zrobione.length})
            </button>
            {pokazZrobione && (
              <div className={`${kartaCls} overflow-hidden mt-2.5`}>
                {zrobione
                  .sort((a, b) => String(b.zrobione_at).localeCompare(String(a.zrobione_at)))
                  .map((z) => (
                    <WierszMoj key={z.id} z={z} dzis={dzis} onZrobione={przelaczZrobione} onNaJutro={przesunNaJutro} busy={busy} />
                  ))}
              </div>
            )}
          </>
        )}
      </>
    );
  };

  // --- całość ------------------------------------------------------------
  const ZAKLADKI = [
    { key: "dzis", label: "Dziś w lokalach" },
    { key: "moje", label: "Moje zadania", n: otwarteMoje.length },
    { key: "bloki", label: "Bloki i zadania", tylkoDesktop: true },
  ];

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col" data-zadania-widok={widok}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="hidden md:block m-0 font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714]">Zadania</h2>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
          {ZAKLADKI.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => (z.key === "bloki" ? otworzKonfiguracje() : setWidok(z.key))}
              className={`${z.tylkoDesktop ? "hidden md:inline-flex" : "inline-flex"} items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
                widok === z.key ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-zakladka-zadan={z.key}
            >
              {z.label}
              {z.n ? <span className={`tabular-nums ${widok === z.key ? "text-white/75" : "text-[#6E6E66]"}`}>{z.n}</span> : null}
            </button>
          ))}
        </div>
        {widok === "dzis" && (
          <div className="flex items-center gap-1 md:ml-auto">
            <button type="button" className="w-10 h-10 rounded-lg grid place-items-center hover:bg-[#ECEBE6]" onClick={() => shiftDate(-1)} aria-label="Poprzedni dzień">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[104px] text-center font-['Archivo'] font-extrabold text-[15px]" data-dzien-zadan>
              {fmtDzien(selectedDate)}
            </span>
            <button type="button" className="w-10 h-10 rounded-lg grid place-items-center hover:bg-[#ECEBE6]" onClick={() => shiftDate(1)} aria-label="Następny dzień">
              <ChevronRight size={18} />
            </button>
            {!isToday && (
              <button type="button" className={btnMalyCls} onClick={() => setSelectedDate(dzis)}>
                Dziś
              </button>
            )}
          </div>
        )}
      </div>

      {widok === "dzis" && (
        <>
          {lokalWidoku && !jedenLokal && (
            <div className="flex items-center gap-3 mb-3">
              <button
                type="button"
                className="inline-flex items-center gap-1 h-9 px-2 -ml-2 rounded-lg text-sm font-bold text-[#6E6E66] hover:bg-[#ECEBE6] hover:text-[#171714]"
                onClick={() => onWybierzLokal("ALL")}
                data-wszystkie-lokale
              >
                <ChevronLeft size={16} /> Wszystkie lokale
              </button>
              <b className="font-['Archivo'] font-extrabold text-[20px]">{lokalWidoku}</b>
            </div>
          )}
          {lokalWidoku ? widokLokalu(lokalWidoku) : przeglad()}
        </>
      )}
      {widok === "moje" && widokMoich()}
      {widok === "bloki" && (
        <ZadaniaKonfiguracja
          key={cfgLokal || "cfg"}
          tasks={tasks}
          setTasks={setTasks}
          taskBlocks={taskBlocks}
          setTaskBlocks={setTaskBlocks}
          dayLogTemplates={dayLogTemplates}
          availableLokale={availableLokale}
          activeStanowiska={activeStanowiska}
          defaultLokal={cfgLokal || lokalWidoku || lokaleNames[0] || ""}
          showMsg={showMsg}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-40 w-[calc(100%-32px)] md:w-auto md:min-w-[380px]">
          <PasekCofnij opis={toast.opis} onCofnij={toast.cofnij ? cofnijToast : null} />
        </div>
      )}

      {poprawka && (
        <ModalWpisu
          szablon={{
            nazwa: poprawka.task.title,
            typ: poprawka.task.typ || "inne",
            klucz: kluczWpisuZadania(poprawka.task),
            pola: poprawka.pola,
          }}
          wartosciStartowe={poprawka.wpis ? { ...(poprawka.wpis.payload || {}) } : null}
          powodWymagany
          onClose={() => setPoprawka(null)}
          onSave={zapiszPoprawke}
        />
      )}
    </div>
  );
}
