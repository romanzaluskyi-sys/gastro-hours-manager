// @ts-nocheck
// Zadania → "Bloki i zadania". Układ z makiety właściciela (0.56.0,
// TasksConfig): mapa tygodnia (bloki × dni, liczba zadań danego dnia), karty
// bloków z zadaniami, edycja w panelu z boku (na telefonie arkusz od dołu).
//
// Lokal ustawia bloki RAZ, pod swój proces, i potem zmienia je wyjątkowo —
// dlatego zestaw startowy (BLOKI_STARTOWE w utils/tasks.ts) stoi na dole jako
// "Szybki start": otwarcie, HACCP, mycie sprzętu i zamknięcie wyglądają w
// gastronomii wszędzie podobnie, a kwadrans wpisywania per lokal to dokładnie
// ta praca, która rozciąga wdrożenie u klienta.
//
// ⚠️ BLOK JEST WAŻNIEJSZY: "Wybrane dni" zadania to podzbiór dni bloku — dni
// spoza bloku są WYŁĄCZONE, nie ukryte (dniSkuteczne, utils/tasks.ts).
// ⚠️ "Kiedy" zadania to jedna z trzech dróg (jak blok / wybrane dni / co N
// dni). Baza pozwala na dni I cykl naraz — takie zadanie otwiera się jako
// "Co N dni" z podpisem, że zapis zostawi sam cykl.
// ⚠️ Archiwizacja = 6 s "Cofnij" (useOdlozoneDecyzje), bez window.confirm.
import React, { useState } from "react";
import { Plus, ChevronUp, ChevronDown, Pencil, Lock, Repeat, Thermometer, Activity, X, Check, Trash2 } from "lucide-react";
import {
  BLOKI_STARTOWE,
  dodajBlokStartowy,
  zapiszBlok,
  zapiszZadanie,
  archiwizujBlok,
  archiwizujZadanie,
  zadaniaBloku,
  parseStanowiska,
  polaZadania,
  dniSkuteczne,
  parseDaysOfWeek,
  toLocalYMD,
} from "../../utils/tasks";
import { TYPY_POLA, slugKlucza, opisNormy } from "../../utils/pola";
import { TYPY_WPISU } from "../../utils/dziennik";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";

// --- klasy (tokeny "Shiftro") ---
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const inputCls =
  "w-full h-12 md:h-11 border-[2px] border-[#171714] rounded-md bg-white px-3 text-[15px] text-[#171714]";
const podpowiedzCls = "text-[13px] leading-[18px] text-[#6E6E66]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const btnMalyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#F6F5F1] disabled:opacity-40";
const ikonaBtnCls =
  "w-10 h-10 rounded-lg border-[2px] border-[#DEDCD4] bg-white grid place-items-center text-[#171714] hover:border-[#171714] flex-shrink-0 disabled:opacity-30";

// Kolejność dni w UI: od poniedziałku. Indeksy = Date.getDay() (0 = niedziela).
const DNI_UI = [1, 2, 3, 4, 5, 6, 0];
const DN = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
const WSZYSTKIE = [0, 1, 2, 3, 4, 5, 6];
const PORY = [
  { key: "poranne", label: "Poranne" },
  { key: "obiadowe", label: "Obiadowe" },
  { key: "wieczorne", label: "Wieczorne" },
  { key: "ogolne", label: "Ogólne" },
  { key: "cykliczne", label: "Cykliczne" },
];
const poraTxt = (k) => (PORY.find((p) => p.key === k) || PORY[3]).label;

// "codziennie", "Pn–Pt", "weekend", "Pn, Śr, Pt".
const dniTxt = (dni) => {
  if (!dni || dni.length === 0 || dni.length === 7) return "codziennie";
  const s = [...dni].sort().join(",");
  if (s === "1,2,3,4,5") return "Pn–Pt";
  if (s === "1,2,3,4,5,6") return "Pn–So";
  if (s === "0,6") return "weekend";
  return DNI_UI.filter((d) => dni.includes(d))
    .map((d) => DN[d])
    .join(", ");
};
const dniZ = (obiekt) => {
  const d = parseDaysOfWeek(obiekt);
  return d ? d : [...WSZYSTKIE];
};

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md).
// ---------------------------------------------------------------------------
function Pole({ etykieta, children, podpowiedz }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={etykietaCls}>{etykieta}</span>
      {children}
      {podpowiedz && <span className={podpowiedzCls}>{podpowiedz}</span>}
    </div>
  );
}

function Seg({ opcje, wartosc, onZmiana, attr }) {
  return (
    <div className="flex w-full rounded-lg border-[2px] border-[#171714] overflow-hidden">
      {opcje.map((o, i) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onZmiana(o.key)}
          className={`flex-1 h-11 px-2 text-[14px] font-bold ${i ? "border-l-[2px] border-[#171714]" : ""} ${
            wartosc === o.key ? "bg-[#171714] text-white" : "bg-white text-[#171714] hover:bg-[#F6F5F1]"
          }`}
          {...(attr ? { [attr]: o.key } : {})}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ wlaczony, children, ...reszta }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center h-[34px] px-3 rounded-full border-[1.5px] text-[13px] font-semibold whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed ${
        wlaczony ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
      }`}
      {...reszta}
    >
      {children}
    </button>
  );
}

function WyborDni({ zaznaczone, dozwolone, onPrzelacz }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DNI_UI.map((d) => {
        const ok = !dozwolone || dozwolone.includes(d);
        const on = zaznaczone.includes(d);
        return (
          <button
            key={d}
            type="button"
            disabled={!ok}
            title={ok ? "" : "Blok nie działa w ten dzień"}
            onClick={() => onPrzelacz(d)}
            className={`h-11 rounded-lg border-[2px] font-bold text-[14px] disabled:opacity-30 disabled:cursor-not-allowed ${
              on && ok ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#171714] hover:bg-[#F6F5F1]"
            }`}
            data-dzien-wybor={d}
          >
            {DN[d]}
          </button>
        );
      })}
    </div>
  );
}

function Opcja({ wlaczona, tytul, opis, onClick, ...reszta }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 text-left p-3 rounded-lg border-[2px] ${
        wlaczona ? "border-[#171714] bg-[#F6F5F1]" : "border-[#DEDCD4] bg-white hover:border-[#171714]"
      }`}
      {...reszta}
    >
      <span className="flex items-center gap-2 font-bold text-[14px]">
        <span
          className={`w-4 h-4 rounded-full border-[2px] border-[#171714] grid place-items-center ${wlaczona ? "bg-white" : ""}`}
        >
          {wlaczona && <i className="w-2 h-2 rounded-full bg-[#171714]" />}
        </span>
        {tytul}
      </span>
      <span className="text-[12px] leading-4 text-[#6E6E66]">{opis}</span>
    </button>
  );
}

function Przelacznik({ wlaczony }) {
  return (
    <span
      className={`relative w-11 h-[26px] rounded-full border-[2px] flex-shrink-0 transition-colors ${
        wlaczony ? "bg-[#1F7A4A] border-[#1F7A4A]" : "bg-[#ECEBE6] border-[#171714]"
      }`}
    >
      <i
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all ${
          wlaczony ? "left-[20px] bg-white" : "left-[2px] bg-[#171714]"
        }`}
      />
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

const pustyBlok = (lokal) => ({
  lokal,
  nazwa: "",
  opis: "",
  schedule_type: "poranne",
  cycle_days: 3,
  days_of_week: [...WSZYSTKIE],
  stanowiska: [],
  deadline_time: "",
  for_manager: false,
});

const pustePole = () => ({ label: "", typ: "number", jednostka: "°C", min: "", max: "" });

const pusteZadanie = (blok) => ({
  lokal: blok.lokal,
  block_id: blok.id,
  blok,
  title: "",
  description: "",
  priority: "sredni",
  deadline_time: "",
  kiedy: "blok", // blok | dni | cykl
  cycle_days: 7,
  days_of_week: dniZ(blok),
  typ: "temperatura",
  template_key: "",
  pomiarTryb: "brak", // brak | szablon | wlasne
  pola: [pustePole()],
  for_manager: !!blok.for_manager,
});

export default function ZadaniaKonfiguracja({
  tasks,
  setTasks,
  taskBlocks,
  setTaskBlocks,
  dayLogTemplates,
  availableLokale,
  activeStanowiska,
  defaultLokal,
  showMsg,
}) {
  const lokaleNames = (availableLokale || []).map((l) => l.name);
  const [lokal, setLokal] = useState(defaultLokal || lokaleNames[0] || "");
  const [panel, setPanel] = useState(null); // { rodzaj: 'blok'|'zadanie', form }
  const [busy, setBusy] = useState(false);
  const dzisDow = new Date(`${toLocalYMD(new Date())}T00:00:00`).getDay();

  const odswiezBlok = (nowy) =>
    setTaskBlocks((prev) => {
      const lista = prev || [];
      return lista.some((b) => b.id === nowy.id) ? lista.map((b) => (b.id === nowy.id ? { ...b, ...nowy } : b)) : [...lista, nowy];
    });
  const odswiezZadanie = (nowe) =>
    setTasks((prev) => {
      const lista = prev || [];
      return lista.some((t) => t.id === nowe.id) ? lista.map((t) => (t.id === nowe.id ? { ...t, ...nowe } : t)) : [...lista, nowe];
    });

  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({
    archiwizujBlok: async (blok) => {
      try {
        const { blok: zapisany, zadania } = await archiwizujBlok(blok, tasks);
        odswiezBlok(zapisany);
        setTasks((prev) => (prev || []).map((t) => (zadania.includes(t.id) ? { ...t, archived: true } : t)));
      } catch (e) {
        showMsg(e.message || "Błąd archiwizacji bloku", "error");
      }
    },
    archiwizujZadanie: async (task) => {
      try {
        odswiezZadanie(await archiwizujZadanie(task));
      } catch (e) {
        showMsg(e.message || "Błąd archiwizacji zadania", "error");
      }
    },
  });

  const bloki = (taskBlocks || [])
    .filter((b) => b.lokal === lokal && !b.archived && !odlozone[`blok:${b.id}`])
    .sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0) || String(a.nazwa).localeCompare(String(b.nazwa), "pl"));
  const zadaniaW = (b) => zadaniaBloku(tasks, b).filter((t) => !odlozone[`zad:${t.id}`]);

  const stanowiskaLokalu = (activeStanowiska || []).filter((s) => s.lokal_name === lokal);
  const szablonyLokalu = (dayLogTemplates || []).filter((s) => s.lokal === lokal && !s.archived);
  const brakujaceStartowe = BLOKI_STARTOWE.filter((w) => !bloki.some((b) => b.nazwa === w.nazwa));

  // Zadania bez bloku — siatka bezpieczeństwa. Po migracjach 0019 i 0038 ma
  // tu być pusto; gdy nie jest, kierownik widzi to wprost.
  const bezBloku = (tasks || []).filter(
    (t) => t.lokal === lokal && !t.archived && !(taskBlocks || []).some((b) => String(b.id) === String(t.block_id))
  );

  // Liczba zadań bloku danego dnia (mapa tygodnia). Cykl zadania pomijamy —
  // nie wiadomo z góry, w który dzień wypadnie; liczymy je jako "może być".
  const ileDnia = (b, d) => {
    if (!dniZ(b).includes(d)) return null;
    return zadaniaW(b).filter((t) => dniSkuteczne(t, b).includes(d)).length;
  };

  const opisPomiaru = (t) => {
    if (t.template_key) {
      const sz = szablonyLokalu.find((s) => s.klucz === t.template_key);
      return (
        <>
          <Activity size={12} /> Karta dnia: {sz ? sz.nazwa : t.template_key}
        </>
      );
    }
    const pola = polaZadania(t, dayLogTemplates);
    if (!pola.length) return null;
    return (
      <>
        <Thermometer size={12} />
        {pola.map((p) => `${p.label}${opisNormy(p) ? " " + opisNormy(p) : ""}`).join(", ")}
      </>
    );
  };

  // --- akcje -------------------------------------------------------------
  const dodajStartowy = async (wzor) => {
    setBusy(true);
    try {
      const { blok, zadania } = await dodajBlokStartowy(wzor, lokal, bloki.length);
      odswiezBlok(blok);
      zadania.forEach(odswiezZadanie);
      showMsg(`Dodano blok „${wzor.nazwa}” (${zadania.length} zadań) — możesz go edytować.`);
    } catch (e) {
      showMsg(e.message || "Błąd zapisu bloku", "error");
    }
    setBusy(false);
  };

  const przesunBlok = async (blok, kierunek) => {
    const i = bloki.findIndex((b) => b.id === blok.id);
    const j = i + kierunek;
    if (j < 0 || j >= bloki.length) return;
    setBusy(true);
    try {
      odswiezBlok(await zapiszBlok({ ...bloki[i], kolejnosc: j }));
      odswiezBlok(await zapiszBlok({ ...bloki[j], kolejnosc: i }));
    } catch (e) {
      showMsg(e.message || "Błąd zmiany kolejności", "error");
    }
    setBusy(false);
  };

  const edytujBlok = (b) =>
    setPanel({
      rodzaj: "blok",
      form: {
        ...b,
        opis: b.opis || "",
        // ⚠️ null w days_of_week znaczy CODZIENNIE — do formularza wraca PEŁNY
        // tydzień, inaczej wejście w edycję odznaczyłoby wszystkie dni.
        days_of_week: dniZ(b),
        stanowiska: parseStanowiska(b) || [],
        deadline_time: b.deadline_time ? b.deadline_time.slice(0, 5) : "",
        cycle_days: b.cycle_days || 3,
      },
    });

  const edytujZadanie = (t, blok) => {
    const pola = polaZadania(t, dayLogTemplates);
    const dni = parseDaysOfWeek(t);
    const kiedy = t.cycle_days ? "cykl" : dni && dni.length < 7 ? "dni" : "blok";
    setPanel({
      rodzaj: "zadanie",
      form: {
        ...t,
        blok,
        description: t.description || "",
        deadline_time: t.deadline_time ? t.deadline_time.slice(0, 5) : "",
        kiedy,
        cycle_days: t.cycle_days || 7,
        // Zadanie z dniami I cyklem (dopuszcza baza, nie formularz).
        dniPrzyCyklu: t.cycle_days && dni && dni.length < 7 ? dni : null,
        days_of_week: dni && dni.length < 7 ? dni : dniZ(blok),
        template_key: t.template_key || "",
        typ: t.typ || "temperatura",
        pomiarTryb: t.template_key ? "szablon" : pola.length ? "wlasne" : "brak",
        pola: pola.length
          ? pola.map((p) => ({ klucz: p.klucz, label: p.label, typ: p.typ, jednostka: p.jednostka || "", min: p.min ?? "", max: p.max ?? "" }))
          : [pustePole()],
        for_manager: !!blok.for_manager,
      },
    });
  };

  const ustaw = (zmiany) => setPanel((p) => ({ ...p, form: { ...p.form, ...zmiany } }));

  const zapiszBlokForm = async () => {
    const f = panel.form;
    if (!f.nazwa.trim()) return showMsg("Podaj nazwę bloku.", "error");
    if (!f.days_of_week.length) return showMsg("Wybierz co najmniej jeden dzień.", "error");
    setBusy(true);
    try {
      const zapisany = await zapiszBlok({ ...f, lokal, kolejnosc: f.kolejnosc ?? bloki.length });
      odswiezBlok(zapisany);
      setPanel(null);
      showMsg(`Zapisano blok: ${zapisany.nazwa || f.nazwa}`);
    } catch (e) {
      showMsg(e.message || "Błąd zapisu bloku", "error");
    }
    setBusy(false);
  };

  const zapiszZadanieForm = async () => {
    const f = panel.form;
    if (!f.title.trim()) return showMsg("Podaj tytuł zadania.", "error");
    const pola =
      f.pomiarTryb === "wlasne"
        ? f.pola
            .filter((p) => p.label.trim())
            .map((p) => ({
              klucz: p.klucz || slugKlucza(p.label),
              label: p.label.trim(),
              typ: p.typ,
              jednostka: p.jednostka || undefined,
              min: p.typ !== "number" || p.min === "" || p.min == null ? undefined : Number(String(p.min).replace(",", ".")),
              max: p.typ !== "number" || p.max === "" || p.max == null ? undefined : Number(String(p.max).replace(",", ".")),
            }))
        : [];
    if (f.pomiarTryb === "wlasne" && !pola.length) return showMsg("Pomiar bez pól — dodaj pole albo wybierz „Tylko odhaczenie”.", "error");
    if (f.pomiarTryb === "szablon" && !f.template_key) return showMsg("Wybierz pozycję karty dnia.", "error");
    const dni = f.kiedy === "dni" ? f.days_of_week : null;
    // Puste przecięcie dni zadania i dni bloku = zadanie nie pokaże się nigdy.
    if (dni && (dni.length === 0 || dniSkuteczne({ days_of_week: dni.join(",") }, f.blok || {}).length === 0)) {
      return showMsg("Przy tych dniach zadanie nie pokazałoby się nigdy — blok obejmuje inne dni.", "error");
    }
    const cykl = f.kiedy === "cykl" ? Number(f.cycle_days) || 0 : null;
    if (f.kiedy === "cykl" && cykl < 1) return showMsg("Podaj, co ile dni.", "error");
    // Przy pozycji z Pulsu typ wpisu z SZABLONU — inaczej ten sam pomiar
    // trafiałby do dziennika raz jako 'temperatura', raz jako co innego.
    const szablon = szablonyLokalu.find((x) => x.klucz === f.template_key);
    setBusy(true);
    try {
      const zapisane = await zapiszZadanie({
        ...f,
        days_of_week: dni,
        cycle_days: cykl,
        pola,
        template_key: f.pomiarTryb === "szablon" ? f.template_key : null,
        typ: f.pomiarTryb === "brak" ? null : f.pomiarTryb === "szablon" ? (szablon && szablon.typ) || "inne" : f.typ,
        kolejnosc: f.kolejnosc ?? zadaniaBloku(tasks, { id: f.block_id }).length,
      });
      odswiezZadanie(zapisane);
      setPanel(null);
      showMsg(`Zapisano zadanie: ${zapisane.title || f.title}`);
    } catch (e) {
      showMsg(e.message || "Błąd zapisu zadania", "error");
    }
    setBusy(false);
  };

  const archiwizujZPanelu = () => {
    const f = panel.form;
    if (panel.rodzaj === "blok") {
      const ile = zadaniaW(f).length;
      decyduj(
        [{ klucz: `blok:${f.id}`, zadanie: ["archiwizujBlok", [taskBlocks.find((b) => b.id === f.id) || f]] }],
        `Zarchiwizowano blok „${f.nazwa}”${ile ? ` i ${ile} zadań` : ""}`
      );
    } else {
      decyduj(
        [{ klucz: `zad:${f.id}`, zadanie: ["archiwizujZadanie", [tasks.find((t) => t.id === f.id) || f]] }],
        `Zarchiwizowano zadanie „${f.title}”`
      );
    }
    setPanel(null);
  };

  // --- panel: blok ------------------------------------------------------
  const formBloku = (f) => (
    <>
      <Pole etykieta="Nazwa bloku">
        <input className={inputCls} value={f.nazwa} onChange={(e) => ustaw({ nazwa: e.target.value })} placeholder="np. Otwarcie lokalu" data-pole-bloku="nazwa" />
      </Pole>
      <Pole etykieta="Opis · opcjonalnie">
        <input className={inputCls} value={f.opis} onChange={(e) => ustaw({ opis: e.target.value })} />
      </Pole>
      <Pole etykieta="Pora">
        <Seg opcje={PORY} wartosc={f.schedule_type} onZmiana={(v) => ustaw({ schedule_type: v })} attr="data-pora-bloku" />
        {f.schedule_type === "cykliczne" && (
          <span className="flex items-center gap-2 text-[14px] mt-1">
            co
            <input
              className={`${inputCls} w-20 tabular-nums`}
              inputMode="numeric"
              value={f.cycle_days}
              onChange={(e) => ustaw({ cycle_days: e.target.value.replace(/\D/g, "") })}
            />
            dni — licząc od ostatniego wykonania czegokolwiek z bloku
          </span>
        )}
      </Pole>
      <Pole etykieta="Termin · do której godziny" podpowiedz="Po tej godzinie niewykonane zadania są „po terminie”.">
        <div className="flex items-center gap-2">
          <input type="time" className={`${inputCls} w-[140px] tabular-nums`} value={f.deadline_time} onChange={(e) => ustaw({ deadline_time: e.target.value })} />
          <Chip wlaczony={!f.deadline_time} onClick={() => ustaw({ deadline_time: "" })}>
            bez terminu
          </Chip>
        </div>
      </Pole>
      <Pole etykieta={`Dni tygodnia · ${dniTxt(f.days_of_week)}`}>
        <div className="flex gap-1.5 flex-wrap">
          <Chip onClick={() => ustaw({ days_of_week: [...WSZYSTKIE] })}>Cały tydzień</Chip>
          <Chip onClick={() => ustaw({ days_of_week: [1, 2, 3, 4, 5] })}>Pn–Pt</Chip>
          <Chip onClick={() => ustaw({ days_of_week: [0, 6] })}>Weekend</Chip>
        </div>
        <WyborDni
          zaznaczone={f.days_of_week}
          onPrzelacz={(d) =>
            ustaw({
              days_of_week: f.days_of_week.includes(d)
                ? f.days_of_week.length > 1
                  ? f.days_of_week.filter((x) => x !== d)
                  : f.days_of_week
                : [...f.days_of_week, d].sort(),
            })
          }
        />
      </Pole>
      <Pole etykieta="Dla kogo · puste = wszyscy na zmianie">
        <div className="flex gap-1.5 flex-wrap">
          {stanowiskaLokalu.map((s) => (
            <Chip
              key={s.id}
              wlaczony={f.stanowiska.includes(s.name)}
              onClick={() =>
                ustaw({ stanowiska: f.stanowiska.includes(s.name) ? f.stanowiska.filter((x) => x !== s.name) : [...f.stanowiska, s.name] })
              }
            >
              {s.name}
            </Chip>
          ))}
          {!stanowiskaLokalu.length && <span className={podpowiedzCls}>Ten lokal nie ma jeszcze stanowisk.</span>}
        </div>
      </Pole>
      <button type="button" onClick={() => ustaw({ for_manager: !f.for_manager })} className="flex items-center gap-3 text-left text-[14px] font-semibold" data-blok-kierownika>
        <Przelacznik wlaczony={f.for_manager} />
        Blok kierownika — widoczny tylko w panelu, nie u pracowników
      </button>
    </>
  );

  // --- panel: zadanie ---------------------------------------------------
  const formZadania = (f) => {
    const blok = f.blok || {};
    const dniBloku = dniZ(blok);
    const terminTxt = f.deadline_time || (blok.deadline_time ? blok.deadline_time.slice(0, 5) : "") || "końca dnia";
    const kiedyTxt = f.kiedy === "cykl" ? `co ${f.cycle_days || "?"} dni` : f.kiedy === "dni" ? dniTxt(f.days_of_week) : dniTxt(dniBloku);
    const zmienPole = (idx, zmiany) => {
      const pola = [...f.pola];
      pola[idx] = { ...pola[idx], ...zmiany };
      ustaw({ pola });
    };
    return (
      <>
        <Pole etykieta="Tytuł">
          <input className={inputCls} value={f.title} onChange={(e) => ustaw({ title: e.target.value })} placeholder="np. Temperatura lodówki" data-pole-zadania="tytul" />
        </Pole>
        <Pole etykieta="Opis / procedura · pracownik zobaczy go pod zadaniem">
          <textarea
            className={`${inputCls} h-24 py-2`}
            value={f.description}
            onChange={(e) => ustaw({ description: e.target.value })}
            placeholder="Jak to zrobić…"
          />
        </Pole>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Pole etykieta="Priorytet">
            <Seg
              opcje={[
                { key: "zwykle", label: "Zwykłe" },
                { key: "wysoki", label: "Ważne" },
              ]}
              wartosc={f.priority === "wysoki" ? "wysoki" : "zwykle"}
              // "niski" (sprzed 0.56.0) zostaje, dopóki ktoś nie kliknie.
              onZmiana={(v) => ustaw({ priority: v === "wysoki" ? "wysoki" : f.priority === "wysoki" ? "sredni" : f.priority })}
            />
          </Pole>
          <Pole etykieta="Termin" podpowiedz={blok.deadline_time && !f.deadline_time ? `jak blok · ${blok.deadline_time.slice(0, 5)}` : null}>
            <div className="flex items-center gap-2">
              <input type="time" className={`${inputCls} tabular-nums`} value={f.deadline_time} onChange={(e) => ustaw({ deadline_time: e.target.value })} />
              {f.deadline_time && (
                <button type="button" className={ikonaBtnCls} onClick={() => ustaw({ deadline_time: "" })} aria-label="Jak blok" title="Jak blok">
                  <X size={16} />
                </button>
              )}
            </div>
          </Pole>
        </div>
        <Pole etykieta="Kiedy">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Opcja wlaczona={f.kiedy === "blok"} tytul="Jak blok" opis={`Każdego dnia bloku: ${dniTxt(dniBloku)}`} onClick={() => ustaw({ kiedy: "blok" })} data-kiedy="blok" />
            <Opcja wlaczona={f.kiedy === "dni"} tytul="Wybrane dni" opis="Tylko część dni bloku" onClick={() => ustaw({ kiedy: "dni" })} data-kiedy="dni" />
            <Opcja wlaczona={f.kiedy === "cykl"} tytul="Co N dni" opis="Np. odkamienianie co 7 dni" onClick={() => ustaw({ kiedy: "cykl" })} data-kiedy="cykl" />
          </div>
          {f.kiedy === "dni" && (
            <>
              <WyborDni
                zaznaczone={f.days_of_week}
                dozwolone={dniBloku}
                onPrzelacz={(d) =>
                  ustaw({
                    days_of_week: f.days_of_week.includes(d) ? f.days_of_week.filter((x) => x !== d) : [...f.days_of_week, d].sort(),
                  })
                }
              />
              <span className={podpowiedzCls}>Szare dni — blok wtedy nie działa. Zmień dni bloku, jeśli potrzeba.</span>
            </>
          )}
          {f.kiedy === "cykl" && (
            <>
              <span className="flex items-center gap-2 text-[14px]">
                co
                <input
                  className={`${inputCls} w-20 tabular-nums`}
                  inputMode="numeric"
                  value={f.cycle_days}
                  onChange={(e) => ustaw({ cycle_days: e.target.value.replace(/\D/g, "") })}
                  data-pole-zadania="cykl"
                />
                dni · licząc od ostatniego wykonania
              </span>
              {f.dniPrzyCyklu && (
                <span className={podpowiedzCls}>
                  To zadanie miało też wybrane dni ({dniTxt(f.dniPrzyCyklu)}) — zapis zostawi sam cykl.
                </span>
              )}
            </>
          )}
        </Pole>
        <Pole etykieta="Co zapisujemy przy wykonaniu">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Opcja wlaczona={f.pomiarTryb === "brak"} tytul="Tylko odhaczenie" opis="Bez wartości" onClick={() => ustaw({ pomiarTryb: "brak" })} data-pomiar-tryb="brak" />
            <Opcja wlaczona={f.pomiarTryb === "szablon"} tytul="Pozycja karty dnia" opis="Wartość zamyka pozycję w Pulsie" onClick={() => ustaw({ pomiarTryb: "szablon" })} data-pomiar-tryb="szablon" />
            <Opcja wlaczona={f.pomiarTryb === "wlasne"} tytul="Pomiar" opis="Np. temperatura z normą" onClick={() => ustaw({ pomiarTryb: "wlasne" })} data-pomiar-tryb="wlasne" />
          </div>
          {f.pomiarTryb === "szablon" && (
            <>
              <select className={`${inputCls} font-semibold`} value={f.template_key} onChange={(e) => ustaw({ template_key: e.target.value })}>
                <option value="">— wybierz pozycję —</option>
                {szablonyLokalu.map((s) => (
                  <option key={s.klucz} value={s.klucz}>
                    {s.nazwa}
                  </option>
                ))}
              </select>
              <span className={podpowiedzCls}>
                {szablonyLokalu.length
                  ? "Wpisana wartość zamyka tę pozycję na karcie dnia — nikt nie mierzy jej drugi raz przy zamknięciu."
                  : "Ten lokal nie ma jeszcze pozycji karty dnia (Puls → Konfiguracja)."}
              </span>
            </>
          )}
          {f.pomiarTryb === "wlasne" && (
            <div className="flex flex-col gap-2">
              <select className={`${inputCls} font-semibold`} value={f.typ} onChange={(e) => ustaw({ typ: e.target.value })} aria-label="Rodzaj wpisu">
                {TYPY_WPISU.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              {f.pola.map((p, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_90px] sm:grid-cols-[1fr_110px_70px_70px_70px_40px] gap-2 items-center" data-pole-pomiaru-cfg>
                  <input className={inputCls} placeholder="Nazwa, np. Lodówka 1" value={p.label} onChange={(e) => zmienPole(idx, { label: e.target.value })} />
                  <select className={inputCls} value={p.typ} onChange={(e) => zmienPole(idx, { typ: e.target.value })}>
                    {TYPY_POLA.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input className={inputCls} placeholder="°C" value={p.jednostka} onChange={(e) => zmienPole(idx, { jednostka: e.target.value })} />
                  <input className={`${inputCls} tabular-nums`} placeholder="min" inputMode="decimal" disabled={p.typ !== "number"} value={p.min} onChange={(e) => zmienPole(idx, { min: e.target.value })} />
                  <input className={`${inputCls} tabular-nums`} placeholder="max" inputMode="decimal" disabled={p.typ !== "number"} value={p.max} onChange={(e) => zmienPole(idx, { max: e.target.value })} />
                  <button
                    type="button"
                    className={ikonaBtnCls}
                    disabled={f.pola.length < 2}
                    onClick={() => ustaw({ pola: f.pola.filter((_, i) => i !== idx) })}
                    aria-label="Usuń pole"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button type="button" className={`${btnMalyCls} self-start`} onClick={() => ustaw({ pola: [...f.pola, pustePole()] })}>
                <Plus size={15} /> Dodaj pole
              </button>
              <span className={podpowiedzCls}>Wynik spoza min–max oznaczymy na czerwono i dopiszemy do karty dnia.</span>
            </div>
          )}
        </Pole>
        <div className="rounded-lg bg-[#F6F5F1] px-3.5 py-3 flex flex-col gap-1" data-podglad-zadania>
          <span className={etykietaCls}>Pracownik zobaczy</span>
          <span className="text-[14px]">
            <b>{f.title || "…"}</b>
            {f.priority === "wysoki" ? " · Ważne" : ""} · {kiedyTxt} · do {terminTxt}
          </span>
        </div>
      </>
    );
  };

  // --- render ------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4" data-konfiguracja-zadan>
      <div className="flex flex-wrap items-center gap-3">
        {lokaleNames.length > 1 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
            {lokaleNames.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLokal(n)}
                className={`inline-flex items-center h-10 px-3.5 rounded-lg border-[2px] font-bold text-sm whitespace-nowrap ${
                  n === lokal ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                }`}
                data-lokal-cfg={n}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <button type="button" className={`${btnGlownyCls} ml-auto`} onClick={() => setPanel({ rodzaj: "blok", form: pustyBlok(lokal) })} data-nowy-blok>
          <Plus size={17} /> Nowy blok
        </button>
      </div>

      {bloki.length > 0 && (
        <div className={`${kartaCls} px-4 md:px-[18px] py-4 flex flex-col gap-2.5`} data-mapa-tygodnia>
          <span className={etykietaCls}>Tydzień w {lokal}</span>
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="grid grid-cols-[minmax(140px,1fr)_repeat(7,44px)] gap-1.5 items-center min-w-[480px]">
              <span />
              {DNI_UI.map((d) => (
                <b key={d} className={`text-center text-[13px] ${d === dzisDow ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
                  {DN[d]}
                </b>
              ))}
              {bloki.map((b) => (
                <React.Fragment key={b.id}>
                  <span className="text-[14px] font-semibold truncate">{b.nazwa}</span>
                  {DNI_UI.map((d) => {
                    const n = ileDnia(b, d);
                    return (
                      <i
                        key={d}
                        className={`not-italic h-8 rounded-md grid place-items-center text-[13px] font-bold tabular-nums ${
                          n == null ? "bg-[#F6F5F1] text-transparent" : "bg-[#171714] text-white"
                        }`}
                      >
                        {n == null ? "·" : n}
                      </i>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
          <span className={podpowiedzCls}>Liczba = zadań danego dnia. Zadanie może mieć mniej dni niż jego blok.</span>
        </div>
      )}

      {bezBloku.length > 0 && (
        <div className={`${kartaCls} px-4 md:px-[18px] py-4 text-[14px]`} style={{ borderColor: "#8A5300" }}>
          <b>{bezBloku.length} zadań nie należy do żadnego bloku</b> — pokazują się codziennie. Przypisz je do bloku albo zarchiwizuj.
          <div className="mt-2 flex flex-wrap gap-2">
            {bezBloku.map((t) => (
              <MiniTag key={t.id}>{t.title}</MiniTag>
            ))}
          </div>
        </div>
      )}

      {!bloki.length && (
        <div className={`${kartaCls} px-5 py-8 text-center`}>
          <b className="block font-['Archivo'] font-extrabold text-lg">Brak bloków</b>
          <span className={podpowiedzCls}>Zacznij od gotowego zestawu (na dole) albo dodaj własny blok.</span>
        </div>
      )}

      {bloki.map((b, bi) => {
        const zadania = zadaniaW(b);
        const stanowiska = parseStanowiska(b);
        return (
          <div key={b.id} className={`${kartaCls} overflow-hidden`} data-blok-cfg={b.nazwa}>
            <div className="flex items-center gap-2 px-4 md:px-[18px] py-3 border-b-[1.5px] border-[#DEDCD4]">
              <div className="flex-1 min-w-0">
                <h3 className="m-0 font-['Archivo'] font-extrabold text-base flex items-center gap-2 flex-wrap">
                  {b.nazwa}
                  {b.for_manager && (
                    <MiniTag>
                      <Lock size={11} /> kierownik
                    </MiniTag>
                  )}
                </h3>
                <div className="text-[13px] text-[#6E6E66]">
                  {poraTxt(b.schedule_type)}
                  {b.schedule_type === "cykliczne" ? ` co ${b.cycle_days || 1} dni` : ""} · {dniTxt(parseDaysOfWeek(b))}
                  {b.deadline_time ? ` · do ${b.deadline_time.slice(0, 5)}` : ""} · {stanowiska ? stanowiska.join(", ") : "wszyscy na zmianie"}
                </div>
              </div>
              <button type="button" className={ikonaBtnCls} disabled={busy || bi === 0} onClick={() => przesunBlok(b, -1)} aria-label="W górę">
                <ChevronUp size={17} />
              </button>
              <button type="button" className={ikonaBtnCls} disabled={busy || bi === bloki.length - 1} onClick={() => przesunBlok(b, 1)} aria-label="W dół">
                <ChevronDown size={17} />
              </button>
              <button type="button" className={btnMalyCls} onClick={() => edytujBlok(b)} data-edytuj-blok>
                <Pencil size={14} /> <span className="hidden sm:inline">Edytuj blok</span>
              </button>
            </div>
            {b.opis && <div className="px-4 md:px-[18px] pt-2.5 text-[13px] text-[#6E6E66]">{b.opis}</div>}
            {zadania.map((t) => {
              const pomiar = opisPomiaru(t);
              const dniZad = parseDaysOfWeek(t);
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-zadanie-cfg>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-[15px]">{t.title}</b>
                      {t.priority === "wysoki" && (
                        <span className="inline-flex items-center h-5 px-1.5 rounded bg-[#FAEAE6] text-[#8A3A2B] text-[11px] font-extrabold uppercase tracking-[0.04em]">
                          Ważne
                        </span>
                      )}
                    </div>
                    {t.description && <div className="text-[13px] text-[#6E6E66] whitespace-pre-line">{t.description}</div>}
                    {(dniZad || t.cycle_days || t.deadline_time || pomiar) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {dniZad && dniZad.length < 7 && <MiniTag>{dniTxt(dniZad)}</MiniTag>}
                        {t.cycle_days && (
                          <MiniTag>
                            <Repeat size={12} /> co {t.cycle_days} dni
                          </MiniTag>
                        )}
                        {t.deadline_time && <MiniTag>do {t.deadline_time.slice(0, 5)}</MiniTag>}
                        {pomiar && <MiniTag>{pomiar}</MiniTag>}
                      </div>
                    )}
                  </div>
                  <button type="button" className={ikonaBtnCls} onClick={() => edytujZadanie(t, b)} aria-label="Edytuj zadanie" data-edytuj-zadanie>
                    <Pencil size={15} />
                  </button>
                </div>
              );
            })}
            {!zadania.length && <div className="px-4 md:px-[18px] py-3 text-[13px] text-[#6E6E66]">Blok jest pusty — dodaj pierwsze zadanie.</div>}
            <div className="px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4]">
              <button type="button" className={btnMalyCls} onClick={() => setPanel({ rodzaj: "zadanie", form: pusteZadanie(b) })} data-dodaj-zadanie>
                <Plus size={15} /> Dodaj zadanie
              </button>
            </div>
          </div>
        );
      })}

      {brakujaceStartowe.length > 0 && (
        <div className={`${kartaCls} overflow-hidden`} data-szybki-start>
          <div className="flex items-center gap-2 px-4 md:px-[18px] py-3 border-b-[1.5px] border-[#DEDCD4]">
            <h3 className="m-0 font-['Archivo'] font-extrabold text-base">Szybki start</h3>
            <span className="text-[13px] text-[#6E6E66]">gotowe bloki z zadaniami</span>
          </div>
          <div className="flex gap-2 flex-wrap px-4 md:px-[18px] py-3.5">
            {brakujaceStartowe.map((w) => (
              <button key={w.nazwa} type="button" className={btnMalyCls} disabled={busy} onClick={() => dodajStartowy(w)}>
                <Plus size={15} /> {w.nazwa} <span className="text-[#6E6E66] font-semibold">({w.zadania.length})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {panel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setPanel(null)} />
          <aside
            role="dialog"
            aria-label={panel.rodzaj === "blok" ? "Blok zadań" : "Zadanie"}
            className="fixed z-50 bg-white flex flex-col inset-x-0 bottom-0 top-12 rounded-t-2xl border-t-[2px] md:inset-y-0 md:right-0 md:left-auto md:top-0 md:w-[560px] md:rounded-none md:border-t-0 md:border-l-[2px] border-[#171714]"
            data-panel-zadan={panel.rodzaj}
          >
            <div className="flex items-start gap-3 px-4 md:px-5 py-4 border-b-[2px] border-[#171714]">
              <div className="min-w-0">
                <h3 className="m-0 font-['Archivo'] text-xl font-extrabold">
                  {panel.rodzaj === "blok" ? (panel.form.id ? "Edytuj blok" : "Nowy blok") : panel.form.id ? "Edytuj zadanie" : "Nowe zadanie"}
                </h3>
                <div className="text-sm text-[#6E6E66] truncate">
                  {panel.rodzaj === "blok" ? lokal : `${panel.form.blok?.nazwa || ""} · ${dniTxt(parseDaysOfWeek(panel.form.blok || {}))}`}
                </div>
              </div>
              <button type="button" onClick={() => setPanel(null)} className="ml-auto w-10 h-10 grid place-items-center rounded-lg hover:bg-[#F6F5F1]" aria-label="Zamknij">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4 flex flex-col gap-4">
              {panel.rodzaj === "blok" ? formBloku(panel.form) : formZadania(panel.form)}
            </div>
            <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-t-[2px] border-[#171714] pb-[max(12px,env(safe-area-inset-bottom))]">
              {panel.form.id && (
                <button type="button" onClick={archiwizujZPanelu} className="h-10 px-2 rounded-lg text-[14px] font-bold text-[#DE3A22] hover:bg-[#FAEAE6]" data-archiwizuj>
                  Archiwizuj
                </button>
              )}
              <span className="flex-1" />
              <button type="button" className={btnObrysCls} onClick={() => setPanel(null)}>
                Anuluj
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                disabled={busy}
                onClick={panel.rodzaj === "blok" ? zapiszBlokForm : zapiszZadanieForm}
                data-zapisz-panel
              >
                <Check size={17} /> Zapisz
              </button>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-40 w-[calc(100%-32px)] md:w-auto md:min-w-[380px]">
          <PasekCofnij opis={toast.opis} onCofnij={cofnij} />
        </div>
      )}
    </div>
  );
}
