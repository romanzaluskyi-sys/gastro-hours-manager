// @ts-nocheck
// Panel kierownika "Zadania i sprzątanie" (Roadmap p.2) — "Kontrola
// wykonania po osobach". Lewy panel: zadania wspólne dla całego lokalu
// (scope="lokal", jedno wykonanie dziennie, dowolna osoba). Prawy panel:
// postęp per pracownik (scope="pracownik" — "wszyscy" + dopasowane
// stanowisko), tylko wśród osób, które dziś faktycznie odbiły zmianę (nie
// ma jeszcze Grafiku, więc "kto dziś pracuje" da się wyczytać tylko ze
// zmian). Cała logika "co jest dziś do zrobienia" i zapis/kasowanie
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
  getEffectiveAssignmentForDate,
  buildEmployeeChecklist,
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
  progressTrackCls,
  progressFillStyle,
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
  schedule_type: "poranne",
  cycle_days: "3",
  days_of_week: [],
  lokal: defaultLokal,
  scope: "lokal",
  stanowisko: "",
  owner_label: "",
  deadline_time: "",
  priority: "sredni",
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
  users,
  shifts,
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

  const visibleTasks = (managerOnly ? managerDue : nonManagerDue).filter(
    (t) => bucketFilter === "wszystko" || t.schedule_type === bucketFilter
  );
  const sharedTasks = visibleTasks.filter((t) => t.scope === "lokal");

  // Prawy panel liczy się zawsze z pełnego zestawu dziennych zadań
  // per-pracownik (niezależnie od wybranych pigułek) — to osobny widok
  // "ile kto ma dziś do zrobienia w sumie", nie filtr listy po lewej.
  const allPerEmployeeToday = dueToday.filter(
    (t) => t.scope === "pracownik" && !t.for_manager
  );

  const shiftsOnDate = shifts.filter(
    (s) => toLocalYMD(s.start_time) === selectedDate && matchesFilter(s.lokal)
  );
  const employeeIds = [];
  const seen = new Set();
  for (const s of shiftsOnDate) {
    if (seen.has(s.user_id)) continue;
    seen.add(s.user_id);
    employeeIds.push(s.user_id);
  }
  const employeeRows = employeeIds.map((uid) => {
    const userShifts = shiftsOnDate.filter((s) => s.user_id === uid);
    const userRec = users.find((u) => u.id === uid);
    const name = userRec?.name || userShifts[0]?.user_name || "?";
    const assignment = getEffectiveAssignmentForDate(
      userRec || {
        default_lokal: userShifts[0]?.lokal,
        default_stanowisko: userShifts[0]?.stanowisko,
      },
      userShifts
    );
    const checklist = buildEmployeeChecklist(
      allPerEmployeeToday,
      taskCompletions,
      uid,
      assignment,
      selectedDate,
      "own"
    );
    return {
      id: uid,
      name,
      lokal: assignment.lokal,
      stanowisko: assignment.stanowisko,
      shifts: userShifts,
      checklist,
    };
  });
  const totalDone = employeeRows.reduce(
    (acc, r) => acc + r.checklist.filter((i) => i.done).length,
    0
  );
  const totalAll = employeeRows.reduce((acc, r) => acc + r.checklist.length, 0);

  const incompleteShared = dueToday.filter(
    (t) =>
      t.scope === "lokal" &&
      !t.for_manager &&
      !findSharedCompletion(taskCompletions, t.id, selectedDate)
  );
  const employeesWithIncomplete = employeeRows
    .map((r) => ({ ...r, incomplete: r.checklist.filter((i) => !i.done) }))
    .filter((r) => r.incomplete.length > 0);
  const totalIncompleteCount =
    incompleteShared.length +
    employeesWithIncomplete.reduce((acc, r) => acc + r.incomplete.length, 0);

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
          newTaskForm.days_of_week.length > 0
            ? newTaskForm.days_of_week.join(",")
            : null,
        scope: newTaskForm.scope,
        stanowisko:
          newTaskForm.scope === "pracownik" && newTaskForm.stanowisko
            ? newTaskForm.stanowisko
            : null,
        owner_label:
          newTaskForm.scope === "lokal" && newTaskForm.owner_label.trim()
            ? newTaskForm.owner_label.trim()
            : null,
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

  const stanowiskaForForm = activeStanowiska.filter(
    (s) => s.lokal_name === newTaskForm.lokal
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
                  setNewTaskForm({ ...newTaskForm, lokal: e.target.value })
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
              <label className="text-xs font-bold text-[#6E6E66]">Typ</label>
              <select
                value={newTaskForm.schedule_type}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, schedule_type: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="poranne">Poranne</option>
                <option value="obiadowe">Obiadowe</option>
                <option value="wieczorne">Wieczorne</option>
                <option value="ogolne">Ogólne (dowolna pora dnia)</option>
                <option value="cykliczne">Cykliczne</option>
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
            <div className="col-span-2 md:col-span-4">
              <label className="text-xs font-bold text-[#6E6E66]">
                Dni tygodnia (puste = codziennie)
              </label>
              <div className="flex gap-1.5 flex-wrap mt-1">
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
            </div>
            <div>
              <label className="text-xs font-bold text-[#6E6E66]">Termin (godzina)</label>
              <input
                type="time"
                value={newTaskForm.deadline_time}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, deadline_time: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#6E6E66]">Dla kogo</label>
              <select
                value={newTaskForm.scope}
                onChange={(e) =>
                  setNewTaskForm({ ...newTaskForm, scope: e.target.value })
                }
                className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
              >
                <option value="lokal">Wspólne dla lokalu (raz dziennie)</option>
                <option value="pracownik">Każdy pracownik osobno</option>
              </select>
            </div>
            {newTaskForm.scope === "pracownik" ? (
              <div>
                <label className="text-xs font-bold text-[#6E6E66]">Stanowisko</label>
                <select
                  value={newTaskForm.stanowisko}
                  onChange={(e) =>
                    setNewTaskForm({ ...newTaskForm, stanowisko: e.target.value })
                  }
                  className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                >
                  <option value="">Wszyscy</option>
                  {stanowiskaForForm.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-[#6E6E66]">
                  Kto ma zrobić (podpowiedź, opcjonalnie)
                </label>
                <input
                  type="text"
                  value={newTaskForm.owner_label}
                  onChange={(e) =>
                    setNewTaskForm({ ...newTaskForm, owner_label: e.target.value })
                  }
                  placeholder="Np. kierownik zmiany"
                  className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                setNewTaskForm({ ...newTaskForm, for_manager: !newTaskForm.for_manager })
              }
              className="flex items-center gap-2 text-sm font-semibold text-[#171714] col-span-2"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Wspólne dla całego lokalu</span>
            <span className="text-xs font-normal text-[#8F8E86] normal-case">
              bez przypisania
            </span>
          </div>
          {sharedTasks.length === 0 && (
            <div className="p-4 text-sm text-[#8F8E86]">
              Brak zadań wspólnych w tej kategorii na ten dzień.
            </div>
          )}
          {sharedTasks.map((task) => {
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
                    <p className="font-['Archivo'] font-bold text-[15px] text-[#171714]">
                      {task.title}
                    </p>
                    <PriorityBadge priority={task.priority} />
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
                      : `${
                          task.deadline_time
                            ? `do ${task.deadline_time.slice(0, 5)} · `
                            : ""
                        }${task.owner_label || "kto pierwszy"}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Postęp po osobach</span>
            <span className="text-xs font-normal text-[#8F8E86] normal-case">
              {totalDone} z {totalAll}
            </span>
          </div>
          {employeeRows.length === 0 && (
            <div className="p-4 text-sm text-[#8F8E86]">
              Nikt jeszcze nie odbił dziś zmiany.
            </div>
          )}
          {employeeRows.map((row) => {
            const done = row.checklist.filter((i) => i.done).length;
            const total = row.checklist.length;
            const pct = total > 0 ? (done / total) * 100 : 0;
            return (
              <div key={row.id} className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0">
                <div className="flex items-baseline justify-between">
                  <p className="font-['Archivo'] font-extrabold text-[15px] text-[#171714]">
                    {row.name}
                  </p>
                  <span className="font-['Archivo'] font-extrabold text-sm tabular-nums">
                    {done}/{total}
                  </span>
                </div>
                <p className="text-[12px] text-[#8F8E86] mb-2">
                  {row.stanowisko || ""}
                  {isAllLokale && row.lokal ? ` · ${row.lokal}` : ""}
                </p>
                <div className={progressTrackCls}>
                  <div className="h-full rounded-full" style={progressFillStyle(pct)} />
                </div>
              </div>
            );
          })}
          <div className="px-4 py-3 flex items-start gap-2 text-[12.5px] text-[#8F8E86]">
            <ClipboardList size={14} className="flex-shrink-0 mt-0.5" />
            <span>Zadania niewykonane po 22:00 trafiają do raportu tygodniowego.</span>
          </div>
        </div>
      </div>

      <div className={`${sectionCardCls} mt-5`}>
        <button
          onClick={() => setShowIncomplete((v) => !v)}
          className={`${sectionHeaderCls} w-full text-left`}
        >
          <span>Niewykonane dzisiaj · {totalIncompleteCount}</span>
          {showIncomplete ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showIncomplete && (
          <>
            {totalIncompleteCount === 0 && (
              <div className="p-4 text-sm text-[#8F8E86]">
                Wszystko wykonane jak dotąd — świetnie.
              </div>
            )}
            {incompleteShared.length > 0 && (
              <div className="px-4 py-3 border-b-[2px] border-[#171714]">
                <p className={`${statLabelCls} mb-2`}>Wspólne, niewykonane</p>
                <div className="flex flex-col gap-1.5">
                  {incompleteShared.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-semibold text-[#171714]">{t.title}</span>
                      <PriorityBadge priority={t.priority} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {employeesWithIncomplete.map((row) => (
              <div key={row.id} className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0">
                <div className="flex items-baseline justify-between flex-wrap gap-1">
                  <p className="font-['Archivo'] font-bold text-[14px] text-[#171714]">
                    {row.name}
                  </p>
                  <span className="text-[12px] text-[#8F8E86]">
                    {row.shifts
                      .map(
                        (s) =>
                          `${fmtHHMM(s.start_time)}–${
                            s.end_time ? fmtHHMM(s.end_time) : "trwa"
                          }`
                      )
                      .join(", ")}
                  </span>
                </div>
                <div className="flex flex-col gap-1 mt-1.5">
                  {row.incomplete.map((i) => (
                    <div key={i.task.id} className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="text-[#171714]">{i.task.title}</span>
                      <PriorityBadge priority={i.task.priority} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
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
                    {task.scope === "lokal" ? "wspólne" : task.stanowisko || "wszyscy"}
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
