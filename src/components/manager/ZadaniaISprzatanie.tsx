// @ts-nocheck
// Panel kierownika → Zadania. Widok "dziś": checklisty dnia, blok po bloku.
//
// Od 0.37.0 zadania nie są płaską listą, tylko pozycjami w BLOKACH. Blok mówi
// KIEDY (pora, dni tygodnia, ewentualny cykl) i DLA KOGO (stanowiska) — dzięki
// temu "poranne otwarcie dla kucharza" to jeden ustawiony blok, a nie osiem
// zadań z ręcznie powtórzonymi dniami tygodnia. Konfiguracja bloków mieszka w
// osobnym widoku (ZadaniaKonfiguracja.tsx), tak samo jak Konfiguracja w
// Grafiku i w Pulsie: codzienna praca i ustawienia nie mieszają się na jednym
// ekranie.
//
// Cała arytmetyka ("co jest dziś do zrobienia", zapis wykonania i pomiaru)
// żyje w utils/tasks.ts — tu tylko rysujemy.
import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  SlidersHorizontal,
  Thermometer,
  AlertTriangle,
  Users,
} from "lucide-react";
import {
  blokiNaDzien,
  splaszczBloki,
  toggleTaskCompletion,
  zapiszWykonanieZPomiarem,
  poprawPomiarZadania,
  kluczWpisuZadania,
  parseStanowiska,
  poraLabel,
  dniBlokuLabel,
  toLocalYMD,
  PRIORITY_META,
} from "../../utils/tasks";
import { wartoscPolaTekst } from "../../utils/pola";
import { publishedShiftsOnDay } from "../../utils/grafik";
import { znajdzKarte } from "../../utils/dziennik";
import ModalWpisu from "./ModalWpisu";
import ZadaniaKonfiguracja from "./ZadaniaKonfiguracja";
import {
  pageTitleCls,
  statLabelCls,
  statTileCls,
  statValueCls,
  statSubCls,
  btnPrimaryCls,
  btnSecondaryCls,
  lokalTabCls,
  sectionCardCls,
  sectionHeaderCls,
  progressTrackCls,
  progressFillStyle,
  COLORS,
} from "./designTokens";

const BUCKETS = [
  { key: "wszystko", label: "Wszystkie" },
  { key: "poranne", label: "Poranne" },
  { key: "obiadowe", label: "Obiadowe" },
  { key: "wieczorne", label: "Wieczorne" },
  { key: "ogolne", label: "Ogólne" },
  { key: "cykliczne", label: "Cykliczne" },
];

const fmtDatePL = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
  });

const PriorityBadge = ({ priority }) => {
  const meta = PRIORITY_META[priority] || PRIORITY_META.sredni;
  if (priority !== "wysoki") return null;
  return (
    <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${meta.badgeCls}`}>
      Ważne
    </span>
  );
};

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
  users,
  matchesFilter,
  availableLokale,
  activeStanowiska,
  selectedLokal,
  showMsg,
}) {
  const [widok, setWidok] = useState("dzis");
  const [selectedDate, setSelectedDate] = useState(toLocalYMD(new Date()));
  const [bucketFilter, setBucketFilter] = useState("wszystko");
  const [managerOnly, setManagerOnly] = useState(false);
  const [zwiniete, setZwiniete] = useState({});
  const [pomiar, setPomiar] = useState(null); // { item, poprawka }
  const [busy, setBusy] = useState(false);

  const isToday = selectedDate === toLocalYMD(new Date());
  const defaultLokal =
    selectedLokal && selectedLokal !== "ALL"
      ? selectedLokal
      : availableLokale[0]?.name || "";

  const shiftSelectedDate = (deltaDays) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(toLocalYMD(d));
  };

  if (widok === "konfiguracja") {
    return (
      <ZadaniaKonfiguracja
        tasks={tasks}
        setTasks={setTasks}
        taskBlocks={taskBlocks}
        setTaskBlocks={setTaskBlocks}
        dayLogTemplates={dayLogTemplates}
        availableLokale={availableLokale}
        activeStanowiska={activeStanowiska}
        defaultLokal={defaultLokal}
        showMsg={showMsg}
        onWroc={() => setWidok("dzis")}
      />
    );
  }

  const zadaniaWZasiegu = (tasks || []).filter((t) => matchesFilter(t.lokal));
  const blokiWZasiegu = (taskBlocks || []).filter((b) => matchesFilter(b.lokal));

  const grupy = blokiNaDzien({
    tasks: zadaniaWZasiegu,
    blocks: blokiWZasiegu,
    completions: taskCompletions,
    entries: dayLogEntries,
    templates: dayLogTemplates,
    dateStr: selectedDate,
    forManager: managerOnly,
  });

  const widoczne = grupy.filter(
    (g) => bucketFilter === "wszystko" || g.blok.schedule_type === bucketFilter
  );

  const wszystkiePozycje = splaszczBloki(grupy);
  const zrobione = wszystkiePozycje.filter((i) => i.done).length;
  const alarmy = wszystkiePozycje.filter((i) => i.alarm).length;
  const termin = (i) =>
    (i.task.deadline_time || i.blok.deadline_time || "").slice(0, 5) || null;
  const teraz = new Date().toTimeString().slice(0, 5);
  const poTerminie = wszystkiePozycje.filter(
    (i) => !i.done && termin(i) && (!isToday || termin(i) < teraz)
  ).length;

  // Kto dziś obsadza ten blok wg opublikowanego grafiku. To jest odpowiedź na
  // "komu to przypisane": zadania są wspólne, a wykonują je ci, kto ma dziś
  // zmianę na pasującym stanowisku.
  const obsadaBloku = (blok) => {
    const zmiany = publishedShiftsOnDay(planShifts, blok.lokal, selectedDate) || [];
    const lista = parseStanowiska(blok);
    const osoby = zmiany
      .filter((s) => !lista || lista.includes(s.stanowisko))
      .map((s) => s.user_name);
    return [...new Set(osoby)];
  };

  const zapiszWynik = (result) => {
    if (result.removedId) {
      setTaskCompletions((prev) => prev.filter((c) => c.id !== result.removedId));
    } else if (result.created) {
      setTaskCompletions((prev) => [...prev, result.created]);
    }
    if (result.wpis && typeof setDayLogEntries === "function") {
      setDayLogEntries((prev) => [...(prev || []), result.wpis]);
    }
    if (result.updated) {
      setTaskCompletions((prev) =>
        // Scalamy, nie podmieniamy: patch zwraca pełny wiersz, ale gdyby
        // kiedykolwiek wrócił niepełny, podmiana zgubiłaby task_id i wykonanie
        // po cichu zniknęłoby z checklisty.
        prev.map((c) => (c.id === result.updated.id ? { ...c, ...result.updated } : c))
      );
    }
  };

  const handleToggle = async (item) => {
    if (item.pomiar && !item.done) return setPomiar({ item, poprawka: false });
    setBusy(true);
    try {
      zapiszWynik(
        await toggleTaskCompletion({
          task: item.task,
          dateStr: selectedDate,
          existingCompletion: item.completion,
          actorId: currentUser.id,
          actorName: currentUser.name,
          shiftId: null,
        })
      );
    } catch (err) {
      showMsg(err.message || "Błąd zapisu zadania!", "error");
    }
    setBusy(false);
  };

  const handleZapiszPomiar = async (typ, klucz, wartosci, powod) => {
    const { item, poprawka } = pomiar;
    setBusy(true);
    try {
      if (poprawka) {
        zapiszWynik(
          await poprawPomiarZadania({
            task: item.task,
            completion: item.completion,
            staryWpis: item.wpis,
            payload: wartosci,
            powod,
            actorName: currentUser.name,
          })
        );
        showMsg("Poprawka zapisana — stara wartość została w dzienniku.");
      } else {
        const karta = znajdzKarte(dayLogs, item.task.lokal, selectedDate);
        zapiszWynik(
          await zapiszWykonanieZPomiarem({
            task: item.task,
            dateStr: selectedDate,
            payload: wartosci,
            dayLogId: karta ? karta.id : null,
            actorId: currentUser.id,
            actorName: currentUser.name,
          })
        );
      }
      setPomiar(null);
    } catch (err) {
      showMsg(err.message || "Błąd zapisu pomiaru!", "error");
    }
    setBusy(false);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <p className={statLabelCls}>Zadania</p>
          <h2 className={pageTitleCls}>Checklisty na {isToday ? "dziś" : fmtDatePL(selectedDate)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button className={btnSecondaryCls} onClick={() => shiftSelectedDate(-1)}>
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[108px] text-center font-['Archivo'] font-bold text-[15px]">
            {isToday ? "Dziś" : fmtDatePL(selectedDate)}
          </div>
          <button className={btnSecondaryCls} onClick={() => shiftSelectedDate(1)}>
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button
              className={btnSecondaryCls}
              onClick={() => setSelectedDate(toLocalYMD(new Date()))}
            >
              Dziś
            </button>
          )}
          <button className={btnPrimaryCls} onClick={() => setWidok("konfiguracja")}>
            <SlidersHorizontal size={14} className="inline mr-1" />
            Konfiguracja
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
        <div className={statTileCls}>
          <p className={statLabelCls}>Wykonane</p>
          <p className={statValueCls}>
            {zrobione}
            <span className="text-[#8F8E86] text-[20px]">/{wszystkiePozycje.length}</span>
          </p>
          <p className={statSubCls}>
            {wszystkiePozycje.length
              ? `${Math.round((zrobione / wszystkiePozycje.length) * 100)}% checklisty`
              : "brak zadań na ten dzień"}
          </p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Bloki</p>
          <p className={statValueCls}>{grupy.length}</p>
          <p className={statSubCls}>
            {grupy.filter((g) => g.zostalo === 0).length} zamkniętych
          </p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Po terminie</p>
          <p className={statValueCls} style={poTerminie ? { color: COLORS.accent } : undefined}>
            {poTerminie}
          </p>
          <p className={statSubCls}>niewykonane mimo godziny</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Pomiary poza normą</p>
          <p className={statValueCls} style={alarmy ? { color: COLORS.accent } : undefined}>
            {alarmy}
          </p>
          <p className={statSubCls}>trafiają też do karty dnia</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            className={lokalTabCls(bucketFilter === b.key)}
            onClick={() => setBucketFilter(b.key)}
          >
            {b.label}
          </button>
        ))}
        <button
          className={lokalTabCls(managerOnly)}
          onClick={() => setManagerOnly((v) => !v)}
        >
          Zadania kierownika
        </button>
      </div>

      {widoczne.length === 0 && (
        <div className={sectionCardCls}>
          <div className="text-center py-10 text-[#8F8E86]">
            <ClipboardList className="mx-auto mb-2 opacity-40" size={40} />
            Brak checklist na ten dzień.
            <div className="mt-3">
              <button className={btnSecondaryCls} onClick={() => setWidok("konfiguracja")}>
                Ustaw bloki zadań
              </button>
            </div>
          </div>
        </div>
      )}

      {widoczne.map((g) => {
        const otwarty = zwiniete[g.blok.id] == null ? true : !zwiniete[g.blok.id];
        const osoby = obsadaBloku(g.blok);
        const stanowiska = parseStanowiska(g.blok);
        const dni = dniBlokuLabel(g.blok);
        const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
        return (
          <div key={g.blok.id} className={`${sectionCardCls} mb-4`}>
            <div className={sectionHeaderCls}>
              <button
                className="flex items-center gap-2 text-left"
                onClick={() =>
                  setZwiniete((prev) => ({ ...prev, [g.blok.id]: otwarty }))
                }
              >
                {otwarty ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <span>{g.blok.nazwa}</span>
              </button>
              <span className="text-[12px] font-normal text-[#6E6E66]">
                {g.done}/{g.total}
              </span>
            </div>

            <div className="px-4 pt-3 pb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6E6E66]">
              <span className="font-semibold text-[#171714]">{poraLabel(g.blok.schedule_type)}</span>
              {g.blok.schedule_type === "cykliczne" && <span>co {g.blok.cycle_days || 1} dni</span>}
              {dni && <span>tylko {dni}</span>}
              <span>· {g.blok.lokal}</span>
              <span>· {stanowiska ? stanowiska.join(", ") : "wszyscy"}</span>
              {g.blok.deadline_time && <span>· do {g.blok.deadline_time.slice(0, 5)}</span>}
              <span className="ml-auto flex items-center gap-1">
                <Users size={13} />
                {osoby.length ? osoby.join(", ") : "nikt dziś nie obsadza wg grafiku"}
              </span>
            </div>

            <div className="px-4 pb-3">
              <div className={progressTrackCls}>
                <div style={progressFillStyle(pct)} />
              </div>
            </div>

            {otwarty && (
              <div>
                {g.items.map((item) => {
                  const t = termin(item);
                  const spozniony = !item.done && t && (!isToday || t < teraz);
                  return (
                    <div
                      key={item.task.id}
                      className="px-4 py-3 border-t-[2px] border-[#171714] flex items-start gap-3"
                    >
                      <button
                        disabled={busy}
                        onClick={() => handleToggle(item)}
                        className="w-5 h-5 mt-0.5 border-2 border-[#B7B6AE] rounded-[3px] flex-shrink-0 flex items-center justify-center bg-white"
                        title={
                          item.pomiar && !item.done
                            ? "Wpisz pomiar"
                            : item.done && item.pomiar
                            ? "Pomiaru nie da się odznaczyć — użyj Popraw"
                            : "Odhacz"
                        }
                      >
                        {item.done && (
                          <span
                            className="w-[9px] h-[9px] rounded-[1px]"
                            style={{ backgroundColor: COLORS.accent }}
                          />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[15px] font-semibold ${
                              item.done ? "line-through text-[#6E6E66]" : "text-[#171714]"
                            }`}
                          >
                            {item.task.title}
                          </span>
                          <PriorityBadge priority={item.task.priority} />
                          {item.pomiar && (
                            <Thermometer size={13} className="text-[#8F8E86]" />
                          )}
                          {item.task.cycle_days && (
                            <span className="text-[11px] text-[#8F8E86]">
                              co {item.task.cycle_days} dni
                            </span>
                          )}
                          {spozniony && (
                            <span
                              className="text-[10.5px] font-bold px-1.5 py-0.5 rounded text-white"
                              style={{ backgroundColor: COLORS.accent }}
                            >
                              po {t}
                            </span>
                          )}
                        </div>
                        {item.task.description && (
                          <div className="text-[12.5px] text-[#6E6E66] mt-0.5 whitespace-pre-line">
                            {item.task.description}
                          </div>
                        )}
                        {item.pomiar && item.wpis && (
                          <div className="text-[13px] mt-1">
                            <span
                              className={item.alarm ? "font-bold" : "text-[#171714]"}
                              style={item.alarm ? { color: COLORS.accent } : undefined}
                            >
                              {item.pola
                                .map((p) => `${p.label}: ${wartoscPolaTekst(p, item.wpis.payload || {})}`)
                                .join(" · ")}
                            </span>
                            {item.alarm && (
                              <AlertTriangle
                                size={13}
                                className="inline ml-1 -mt-0.5"
                                style={{ color: COLORS.accent }}
                              />
                            )}
                          </div>
                        )}
                        <div className="text-[12px] text-[#8F8E86] mt-0.5">
                          {item.done
                            ? `${item.completion?.user_name || "?"}${
                                item.completion?.completed_at
                                  ? " · " + String(item.completion.completed_at).slice(11, 16)
                                  : ""
                              }`
                            : t
                            ? `do ${t}`
                            : " "}
                        </div>
                      </div>
                      {item.pomiar && item.done && item.wpis && (
                        <button
                          className={btnSecondaryCls}
                          disabled={busy}
                          onClick={() => setPomiar({ item, poprawka: true })}
                        >
                          Popraw
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {pomiar && (
        <ModalWpisu
          szablon={{
            nazwa: pomiar.item.task.title,
            typ: pomiar.item.task.typ || "inne",
            klucz: kluczWpisuZadania(pomiar.item.task),
            pola: pomiar.item.pola,
          }}
          wartosciStartowe={
            pomiar.poprawka && pomiar.item.wpis ? { ...(pomiar.item.wpis.payload || {}) } : null
          }
          powodWymagany={pomiar.poprawka}
          onClose={() => setPomiar(null)}
          onSave={handleZapiszPomiar}
        />
      )}
    </div>
  );
}
