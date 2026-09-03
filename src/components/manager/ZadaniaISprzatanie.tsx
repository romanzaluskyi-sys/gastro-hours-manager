// @ts-nocheck
// Panel kierownika "Zadania i sprzątanie" (Roadmap p.2) — "Kontrola
// wykonania po osobach". Jedna, spójna lista zadań aktualnych na wybrany
// dzień (filtrowana pigułkami pory dnia + opcjonalnie stanowiskiem) — BEZ
// podziału na "wspólne"/"per pracownik": każde zadanie ma jedno wspólne
// wykonanie dziennie, niezależnie od tego, czy dotyczy całego lokalu, czy
// jednego stanowiska (patrz komentarz przy findSharedCompletion w
// utils/tasks.ts — świadoma zmiana 2026-09-04, pierwsza wersja miała
// osobne wykonanie per pracownik dla zadań przypisanych do stanowiska, co
// było mylące). Cała logika "co jest dziś do zrobienia" i zapis/kasowanie
// wykonań żyje w utils/tasks.ts — nie duplikuj jej tutaj.
import React, { useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Archive,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "../../api/supabase";
import {
  isTaskDueOn,
  findSharedCompletion,
  toggleTaskCompletion,
  toLocalYMD,
  PRIORITY_META,
} from "../../utils/tasks";
import {
  pageTitleCls,
  statLabelCls,
  btnPrimaryCls,
  btnSecondaryCls,
  lokalTabCls,
  sectionCardCls,
  sectionHeaderCls,
  taskRowCls,
} from "./designTokens";

const BUCKETS = [
  { key: "wszystko", label: "Cały lokal" },
  { key: "poranne", label: "Poranne" },
  { key: "obiadowe", label: "Obiadowe" },
  { key: "wieczorne", label: "Wieczorne" },
  { key: "ogolne", label: "Ogólne" },
  { key: "cykliczne", label: "Cykliczne" },
];

const DAYS_PL = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const SCHEDULE_LABELS = {
  poranne: "Poranne",
  obiadowe: "Obiadowe",
  wieczorne: "Wieczorne",
  ogolne: "Ogólne (dowolna pora)",
  cykliczne: "Cykliczne",
};

const fmtHHMM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`
    : "";

const fmtDatePL = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
  });

// Zwraca etykietę tylko gdy dni są faktycznie ograniczone (mniej niż 7) —
// "wszystkie dni" (7/7 albo puste/stare day_of_week=null) nie potrzebuje
// żadnej podpowiedzi.
const daysOfWeekLabel = (task) => {
  if (task.days_of_week) {
    const idxs = task.days_of_week
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
    if (idxs.length > 0 && idxs.length < 7) {
      return idxs.map((i) => DAYS_PL[i]).join(", ");
    }
    return null;
  }
  if (task.day_of_week != null) return DAYS_PL[task.day_of_week];
  return null;
};

const blankForm = (defaultLokal) => ({
  title: "",
  description: "",
  lokal: defaultLokal,
  stanowisko: "",
  schedule_type: "ogolne",
  cycle_days: "3",
  priority: "sredni",
  days_of_week: [...ALL_DAYS],
  deadline_time: "",
  for_manager: false,
});

const PriorityBadge = ({ priority }) => {
  const meta = PRIORITY_META[priority] || PRIORITY_META.sredni;
  return (
    <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${meta.badgeCls}`}>
      {meta.label}
    </span>
  );
};

export default function ZadaniaISprzatanie({
  currentUser,
  tasks,
  setTasks,
  taskCompletions,
  setTaskCompletions,
  matchesFilter,
  availableLokale,
  activeStanowiska,
  selectedLokal,
  showMsg,
}) {
  const [selectedDate, setSelectedDate] = useState(toLocalYMD(new Date()));
  const [bucketFilter, setBucketFilter] = useState("wszystko");
  const [managerOnly, setManagerOnly] = useState(false);
  const [listStanowiskoFilter, setListStanowiskoFilter] = useState("ALL");
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [allTasksLokalFilter, setAllTasksLokalFilter] = useState("ALL");
  const [allTasksStanowiskoFilter, setAllTasksStanowiskoFilter] = useState("ALL");
  const defaultLokal =
    selectedLokal && selectedLokal !== "ALL"
      ? selectedLokal
      : availableLokale[0]?.name || "";
  const [newTaskForm, setNewTaskForm] = useState(blankForm(defaultLokal));
  const [busy, setBusy] = useState(false);

  const isToday = selectedDate === toLocalYMD(new Date());
  const isAllLokale = !selectedLokal || selectedLokal === "ALL";

  const shiftSelectedDate = (deltaDays) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(toLocalYMD(d));
  };

  const inScope = tasks.filter((t) => matchesFilter(t.lokal) && !t.archived);
  const dueToday = inScope.filter((t) =>
    isTaskDueOn(t, taskCompletions, selectedDate)
  );
  const nonManagerDue = dueToday.filter((t) => !t.for_manager);
  const managerDue = dueToday.filter((t) => t.for_manager);

  const bucketCounts = {
    wszystko: nonManagerDue.length,
    poranne: nonManagerDue.filter((t) => t.schedule_type === "poranne").length,
    obiadowe: nonManagerDue.filter((t) => t.schedule_type === "obiadowe").length,
    wieczorne: nonManagerDue.filter((t) => t.schedule_type === "wieczorne").length,
    ogolne: nonManagerDue.filter((t) => t.schedule_type === "ogolne").length,
    cykliczne: nonManagerDue.filter((t) => t.schedule_type === "cykliczne").length,
  };

  const visibleTasks = (managerOnly ? managerDue : nonManagerDue)
    .filter((t) => bucketFilter === "wszystko" || t.schedule_type === bucketFilter)
    .filter((t) => {
      if (listStanowiskoFilter === "ALL") return true;
      if (listStanowiskoFilter === "WSZYSCY") return t.stanowisko == null;
      return t.stanowisko === listStanowiskoFilter;
    });

  const totalAllToday = nonManagerDue.length;
  const totalDoneToday = nonManagerDue.filter((t) =>
    findSharedCompletion(taskCompletions, t.id, selectedDate)
  ).length;

  const incompleteToday = nonManagerDue.filter(
    (t) => !findSharedCompletion(taskCompletions, t.id, selectedDate)
  );

  const handleToggleShared = async (task) => {
    const existing = findSharedCompletion(taskCompletions, task.id, selectedDate);
    setBusy(true);
    try {
      const result = await toggleTaskCompletion({
        task,
        dateStr: selectedDate,
        existingCompletion: existing,
        actorId: currentUser.id,
        actorName: currentUser.name,
        shiftId: null,
      });
      if (result.removedId) {
        setTaskCompletions((prev) => prev.filter((c) => c.id !== result.removedId));
      } else if (result.created) {
        setTaskCompletions((prev) => [...prev, result.created]);
      }
    } catch (err) {
      showMsg("Błąd zapisu zadania!", "error");
    }
    setBusy(false);
  };

  const handleCreateTask = async () => {
    if (!newTaskForm.title.trim() || !newTaskForm.lokal) {
      return showMsg("Podaj tytuł i lokal zadania.", "error");
    }
    setBusy(true);
    try {
      const created = await api.post("tasks", {
        lokal: newTaskForm.lokal,
        title: newTaskForm.title.trim(),
        description: newTaskForm.description.trim() || null,
        schedule_type: newTaskForm.schedule_type,
        cycle_days:
          newTaskForm.schedule_type === "cykliczne"
            ? Number(newTaskForm.cycle_days) || 1
            : null,
        days_of_week:
          newTaskForm.days_of_week.length > 0 && newTaskForm.days_of_week.length < 7
            ? newTaskForm.days_of_week.join(",")
            : null,
        stanowisko: newTaskForm.stanowisko || null,
        deadline_time: newTaskForm.deadline_time || null,
        priority: newTaskForm.priority,
        for_manager: newTaskForm.for_manager,
      });
      setTasks((prev) => [...prev, created]);
      setShowNewTaskForm(false);
      setNewTaskForm(blankForm(defaultLokal));
      showMsg("Zadanie dodane!");
    } catch (err) {
      showMsg(`Błąd zapisu zadania: ${err.message || "nieznany błąd"}`, "error");
    }
    setBusy(false);
  };

  const handleArchiveTask = async (task) => {
    if (
      !window.confirm(
        `Zarchiwizować zadanie „${task.title}”? Zniknie z listy, historia wykonań zostaje.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patch("tasks", task.id, { archived: true });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      showMsg(`Błąd archiwizacji zadania: ${err.message || "nieznany błąd"}`, "error");
    }
    setBusy(false);
  };

  const toggleFormDay = (i) => {
    setNewTaskForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(i)
        ? f.days_of_week.filter((d) => d !== i)
        : [...f.days_of_week, i].sort(),
    }));
  };

  const toggleAllFormDays = () => {
    setNewTaskForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.length === 7 ? [] : [...ALL_DAYS],
    }));
  };

  const stanowiskaForForm = activeStanowiska.filter(
    (s) => s.lokal_name === newTaskForm.lokal
  );
  const stanowiskaForListFilter = activeStanowiska.filter(
    (s) => isAllLokale || s.lokal_name === selectedLokal
  );

  const allTasksFiltered = inScope
    .filter(
      (t) => allTasksLokalFilter === "ALL" || t.lokal === allTasksLokalFilter
    )
    .filter(
      (t) =>
        allTasksStanowiskoFilter === "ALL" ||
        t.stanowisko === allTasksStanowiskoFilter
    );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div>
          <p className={statLabelCls}>Zadania i sprzątanie</p>
          <h2 className={pageTitleCls}>Kontrola wykonania po osobach</h2>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              onClick={() => setSelectedDate(toLocalYMD(new Date()))}
              className={btnSecondaryCls}
            >
              Dziś
            </button>
          )}
          <button onClick={() => shiftSelectedDate(-1)} className={btnSecondaryCls}>
            <ChevronLeft size={16} />
          </button>
          <span className={`${btnSecondaryCls} cursor-default`}>
            {isToday ? `Dziś · ${fmtDatePL(selectedDate)}` : fmtDatePL(selectedDate)}
          </span>
          <button onClick={() => shiftSelectedDate(1)} className={btnSecondaryCls}>
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setShowNewTaskForm((v) => !v)}
            className={`${btnPrimaryCls} flex items-center gap-1.5`}
          >
            <Plus size={16} /> Nowe zadanie
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-5 mb-5">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => {
              setBucketFilter(b.key);
              setManagerOnly(false);
            }}
            className={lokalTabCls(!managerOnly && bucketFilter === b.key)}
          >
            {b.label} · {bucketCounts[b.key]}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setManagerOnly((v) => !v)}
          className={lokalTabCls(managerOnly)}
        >
          Zadania kierownika · {managerDue.length}
        </button>
      </div>

      {showNewTaskForm && (
        <div className={`${sectionCardCls} mb-5`}>
          <div className={sectionHeaderCls}>Nowe zadanie</div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div className="col-span-2 md:col-span-4">
              <label className="text-xs font-bold text-[#6E6E66]">Tytuł</label>
              <input
                type="text"
                value={newTaskForm.title}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, title: e.target.value })
                }
                placeholder="Np. Pomiar temperatur w chłodniach"
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="text-xs font-bold text-[#6E6E66]">
                Opis (opcjonalnie)
              </label>
              <input
                type="text"
                value={newTaskForm.description}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, description: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#6E6E66]">Lokal</label>
              <select
                value={newTaskForm.lokal}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, lokal: e.target.value, stanowisko: "" })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                {availableLokale.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#6E6E66]">Dla kogo</label>
              <select
                value={newTaskForm.stanowisko}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, stanowisko: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="">Wszyscy (cały lokal)</option>
                {stanowiskaForForm.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#6E6E66]">Typ</label>
              <select
                value={newTaskForm.schedule_type}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, schedule_type: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="ogolne">Ogólne (dowolna pora dnia)</option>
                <option value="poranne">Poranne</option>
                <option value="obiadowe">Obiadowe</option>
                <option value="wieczorne">Wieczorne</option>
                <option value="cykliczne">Cykliczne (co N dni)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[#6E6E66]">Priorytet</label>
              <select
                value={newTaskForm.priority}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, priority: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="niski">Niski — lekkie przypomnienie</option>
                <option value="sredni">Średni</option>
                <option value="wysoki">Wysoki — ważne</option>
              </select>
            </div>
            {newTaskForm.schedule_type === "cykliczne" && (
              <div>
                <label className="text-xs font-bold text-[#6E6E66]">Co ile dni</label>
                <input
                  type="number"
                  min="1"
                  value={newTaskForm.cycle_days}
                  onChange={(e) =>
                    setNewTaskForm({ ...newTaskForm, cycle_days: e.target.value })
                  }
                  className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                />
              </div>
            )}

            <div className="col-span-2 md:col-span-4 border-[2px] border-[#B7B6AE] rounded p-3">
              <label className="text-xs font-bold text-[#6E6E66] block mb-2">
                Powtarzalność — w które dni zadanie obowiązuje
              </label>
              <div className="flex gap-1.5 flex-wrap items-center">
                <button
                  type="button"
                  onClick={toggleAllFormDays}
                  className={`px-3 py-1.5 rounded border-2 text-sm font-bold ${
                    newTaskForm.days_of_week.length === 7
                      ? "bg-[#DE3A22] text-white border-[#DE3A22]"
                      : "bg-white text-[#171714] border-[#B7B6AE]"
                  }`}
                >
                  Cały tydzień
                </button>
                <span className="w-px self-stretch bg-[#B7B6AE] mx-1" />
                {DAYS_PL.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleFormDay(i)}
                    className={`px-3 py-1.5 rounded border-2 text-sm font-bold ${
                      newTaskForm.days_of_week.includes(i)
                        ? "bg-[#171714] text-white border-[#171714]"
                        : "bg-white text-[#171714] border-[#B7B6AE]"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <label className="text-xs font-bold text-[#6E6E66]">
                  Termin (godzina, opcjonalnie)
                </label>
                <input
                  type="time"
                  value={newTaskForm.deadline_time}
                  onChange={(e) =>
                    setNewTaskForm({ ...newTaskForm, deadline_time: e.target.value })
                  }
                  className="w-full max-w-[160px] border-[2px] border-[#171714] rounded p-2 text-sm mt-1"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setNewTaskForm({ ...newTaskForm, for_manager: !newTaskForm.for_manager })
              }
              className="flex items-center gap-2 text-sm font-semibold text-[#171714] col-span-2 md:col-span-4"
            >
              <span
                className={`w-4 h-4 border-2 border-[#171714] rounded-[3px] flex-shrink-0 flex items-center justify-center ${
                  newTaskForm.for_manager ? "bg-[#171714]" : ""
                }`}
              />
              Zadanie kierownika (nie pokazuj zwykłym pracownikom)
            </button>
            <div className="col-span-2 md:col-span-4 flex gap-2">
              <button onClick={handleCreateTask} disabled={busy} className={btnPrimaryCls}>
                Zapisz zadanie
              </button>
              <button
                onClick={() => setShowNewTaskForm(false)}
                className={btnSecondaryCls}
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Zadania na dziś</span>
          <span className="text-xs font-normal text-[#8F8E86] normal-case">
            {totalDoneToday} z {totalAllToday}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap p-4 border-b-[2px] border-[#171714]">
          <label className="text-xs font-bold text-[#6E6E66]">Stanowisko</label>
          <select
            value={listStanowiskoFilter}
            onChange={(e) => setListStanowiskoFilter(e.target.value)}
            className="border-[2px] border-[#171714] rounded p-2 text-sm"
          >
            <option value="ALL">Wszystkie</option>
            <option value="WSZYSCY">Dla wszystkich (bez stanowiska)</option>
            {stanowiskaForListFilter.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {visibleTasks.length === 0 && (
          <div className="p-4 text-sm text-[#8F8E86]">
            Brak zadań w tej kategorii na ten dzień.
          </div>
        )}
        {visibleTasks.map((task) => {
          const completion = findSharedCompletion(
            taskCompletions,
            task.id,
            selectedDate
          );
          return (
            <div key={task.id} className={taskRowCls}>
              <button
                onClick={() => handleToggleShared(task)}
                disabled={busy}
                className="w-5 h-5 mt-0.5 border-2 border-[#171714] rounded-[3px] flex-shrink-0 flex items-center justify-center"
              >
                {completion && (
                  <span className="w-[9px] h-[9px] bg-[#DE3A22] rounded-[1px]" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={`font-['Archivo'] font-bold text-[15px] ${
                      completion ? "line-through text-[#8F8E86]" : "text-[#171714]"
                    }`}
                  >
                    {task.title}
                  </p>
                  <PriorityBadge priority={task.priority} />
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#F1F1EE] text-[#6E6E66]">
                    {task.stanowisko || "Wszyscy"}
                  </span>
                  {isAllLokale && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#F1F1EE] text-[#6E6E66]">
                      {task.lokal}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-[#8F8E86]">
                  {completion
                    ? `${completion.user_name || "?"} · ${
                        completion.completed_at
                          ? fmtHHMM(new Date(completion.completed_at))
                          : ""
                      }`
                    : task.deadline_time
                    ? `do ${task.deadline_time.slice(0, 5)}`
                    : " "}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`${sectionCardCls} mt-5`}>
        <button
          onClick={() => setShowIncomplete((v) => !v)}
          className={`${sectionHeaderCls} w-full text-left`}
        >
          <span>Niewykonane dzisiaj · {incompleteToday.length}</span>
          {showIncomplete ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showIncomplete && (
          <>
            {incompleteToday.length === 0 && (
              <div className="p-4 text-sm text-[#8F8E86]">
                Wszystko wykonane jak dotąd — świetnie.
              </div>
            )}
            {incompleteToday.map((t) => (
              <div key={t.id} className={taskRowCls}>
                <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[#171714]">{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#F1F1EE] text-[#6E6E66]">
                    {t.stanowisko || "Wszyscy"}
                  </span>
                  {isAllLokale && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#F1F1EE] text-[#6E6E66]">
                      {t.lokal}
                    </span>
                  )}
                  {t.deadline_time && (
                    <span className="text-[12px] text-[#8F8E86]">
                      do {t.deadline_time.slice(0, 5)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
        <div className="px-4 py-3 flex items-start gap-2 text-[12.5px] text-[#8F8E86] border-t-[2px] border-[#171714]">
          <ClipboardList size={14} className="flex-shrink-0 mt-0.5" />
          <span>Zadania niewykonane po 22:00 trafiają do raportu tygodniowego.</span>
        </div>
      </div>

      <div className={`${sectionCardCls} mt-5`}>
        <button
          onClick={() => setShowAllTasks((v) => !v)}
          className={`${sectionHeaderCls} w-full text-left`}
        >
          <span>Wszystkie zadania w tym lokalu · {allTasksFiltered.length}</span>
          {showAllTasks ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showAllTasks && (
          <>
            <div className="flex items-center gap-2 flex-wrap p-4 border-b-[2px] border-[#171714]">
              <select
                value={allTasksLokalFilter}
                onChange={(e) => setAllTasksLokalFilter(e.target.value)}
                className="border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="ALL">Wszystkie lokale</option>
                {availableLokale.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
              <select
                value={allTasksStanowiskoFilter}
                onChange={(e) => setAllTasksStanowiskoFilter(e.target.value)}
                className="border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="ALL">Wszystkie stanowiska</option>
                {activeStanowiska.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {allTasksFiltered.length === 0 && (
              <div className="p-4 text-sm text-[#8F8E86]">
                Brak zadań w tym filtrze.
              </div>
            )}
            {allTasksFiltered.map((task) => (
              <div key={task.id} className={taskRowCls}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-['Archivo'] font-bold text-[14px] text-[#171714]">
                      {task.title}
                    </p>
                    <PriorityBadge priority={task.priority} />
                  </div>
                  <p className="text-[12.5px] text-[#8F8E86]">
                    {task.lokal} · {SCHEDULE_LABELS[task.schedule_type] || task.schedule_type}
                    {task.schedule_type === "cykliczne" ? ` (co ${task.cycle_days || 1} dni)` : ""}
                    {daysOfWeekLabel(task) ? ` · tylko ${daysOfWeekLabel(task)}` : ""}
                    {" · "}
                    {task.stanowisko || "wszyscy"}
                    {task.for_manager ? " · kierownik" : ""}
                    {task.deadline_time ? ` · do ${task.deadline_time.slice(0, 5)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleArchiveTask(task)}
                  disabled={busy}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold text-[#8A3A2B]"
                >
                  <Archive size={14} /> Archiwizuj
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
