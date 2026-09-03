// @ts-nocheck
// Wspólna logika modułu Zadania i sprzątanie (Roadmap p.2) — jedyne miejsce,
// które decyduje "czy to zadanie jest dziś do zrobienia" i zapisuje/kasuje
// wpisy w task_completions. Używane i przez ZadaniaISprzatanie.tsx (panel
// kierownika), i przez employeeSessionShared.tsx (Pulpit/Zadania pracownika)
// — nie duplikuj tej logiki w żadnym z tych miejsc, ten sam wzorzec co
// resolveCorrection() w utils/corrections.ts.
import { api } from "../api/supabase";
import { toLocalYMD } from "../api/googleSheets";

// day_of_week: 0=niedziela..6=sobota, czyli zwykłe JS Date.getDay() —
// bez własnego mapowania, żeby nie wprowadzać kolejnego źródła błędów.
export const getDayOfWeekIndex = (dateStr) =>
  new Date(dateStr + "T00:00:00").getDay();

export const daysBetweenYMD = (fromStr, toStr) => {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  return Math.round((to - from) / 86400000);
};

// "Cykliczne" (co N dni) — liczone od ostatniego FAKTYCZNEGO wykonania, nie
// od stałej kotwicy w kalendarzu: pominięty cykl zostaje zaległy, zamiast
// po cichu przeskoczyć do kolejnego terminu. Brak jakiegokolwiek wykonania
// = zawsze do zrobienia.
export const isCyclicalDueOn = (task, completions, dateStr) => {
  const done = completions
    .filter((c) => c.task_id === task.id)
    .map((c) => c.date)
    .sort();
  const last = done[done.length - 1];
  if (!last) return true;
  return daysBetweenYMD(last, dateStr) >= (task.cycle_days || 1);
};

export const isTaskDueOn = (task, completions, dateStr) => {
  if (!task.active || task.archived) return false;
  if (task.day_of_week != null && getDayOfWeekIndex(dateStr) !== task.day_of_week) {
    return false;
  }
  if (task.schedule_type === "cykliczne") {
    return isCyclicalDueOn(task, completions, dateStr);
  }
  return true;
};

// Ile dni z cyklu już minęło od ostatniego wykonania — do pokazania "2/3
// dni" zamiast suchego "co 3 dni" na odznace zadania. Zwraca null dla
// zadań niecyklicznych.
export const cyclicalProgress = (task, completions, dateStr) => {
  if (task.schedule_type !== "cykliczne") return null;
  const cycleDays = task.cycle_days || 1;
  const done = completions
    .filter((c) => c.task_id === task.id)
    .map((c) => c.date)
    .sort();
  const last = done[done.length - 1];
  if (!last) return { daysSince: cycleDays, cycleDays, pct: 100 };
  const daysSince = Math.min(cycleDays, Math.max(0, daysBetweenYMD(last, dateStr)));
  return { daysSince, cycleDays, pct: Math.round((daysSince / cycleDays) * 100) };
};

export const findSharedCompletion = (completions, taskId, dateStr) =>
  completions.find((c) => c.task_id === taskId && c.date === dateStr) || null;

export const findUserCompletion = (completions, taskId, dateStr, userId) =>
  completions.find(
    (c) => c.task_id === taskId && c.date === dateStr && c.user_id === userId
  ) || null;

// Jedyne miejsce, które pisze do task_completions — odhaczenie tworzy
// wiersz, odznaczenie go kasuje (brak wiersza = niezrobione).
export const toggleTaskCompletion = async ({
  task,
  dateStr,
  existingCompletion,
  actorId,
  actorName,
  shiftId,
}) => {
  if (existingCompletion) {
    await api.delete("task_completions", existingCompletion.id);
    return { removedId: existingCompletion.id };
  }
  const created = await api.post("task_completions", {
    task_id: task.id,
    date: dateStr,
    user_id: actorId || null,
    user_name: actorName || null,
    shift_id: shiftId || null,
  });
  return { created };
};

// Wybiera lokal/stanowisko, do którego przypisać zadania danego dnia:
// otwarta zmiana > najnowsza zmiana tego dnia > domyślne dane pracownika.
// Działa i dla "dziś, żywa zmiana" (pracownik), i dla dowolnej przeszłej
// daty (panel kierownika) — wystarczy podać zmiany już przefiltrowane po
// danym dniu.
export const getEffectiveAssignmentForDate = (employee, shiftsForUserOnDate) => {
  const openShift = shiftsForUserOnDate.find((s) => !s.end_time);
  const mostRecent = [...shiftsForUserOnDate].sort(
    (a, b) => (b.start_time?.getTime?.() || 0) - (a.start_time?.getTime?.() || 0)
  )[0];
  const shift = openShift || mostRecent;
  return {
    lokal: shift?.lokal || employee.default_lokal,
    stanowisko: shift?.stanowisko || employee.default_stanowisko,
  };
};

// Buduje checklistę JEDNEGO pracownika na dany dzień — używane przez ekran
// Zadania pracownika (kiosk/konto osobiste) ORAZ przez panel "Postęp po
// osobach" kierownika. Zadania `for_manager` są celowo pomijane — to zakres
// panelu kierownika (przełącznik "Zadania kierownika" nad surowym `tasks`),
// nie checklisty zwykłego pracownika. `viewMode: "own"` ogranicza zadania ze
// scope="pracownik" do "wszyscy" (stanowisko=null) albo dopasowania do
// stanowiska pracownika; `"all"` (przełącznik na kiosku) pokazuje wszystko
// dla lokalu bez względu na stanowisko — odhaczenie w tym trybie i tak
// zapisuje się pod tożsamością osoby, która kliknęła.
export const buildEmployeeChecklist = (
  tasks,
  completions,
  employeeId,
  { lokal, stanowisko },
  dateStr,
  viewMode = "own"
) =>
  tasks
    .filter((t) => t.lokal === lokal && !t.for_manager)
    .filter((t) => isTaskDueOn(t, completions, dateStr))
    .filter(
      (t) =>
        t.scope === "lokal" ||
        viewMode === "all" ||
        t.stanowisko == null ||
        t.stanowisko === stanowisko
    )
    .map((t) => {
      const completion =
        t.scope === "lokal"
          ? findSharedCompletion(completions, t.id, dateStr)
          : findUserCompletion(completions, t.id, dateStr, employeeId);
      return { task: t, completion, done: !!completion };
    })
    .sort((a, b) => {
      const da = a.task.deadline_time || "99:99";
      const db = b.task.deadline_time || "99:99";
      if (da !== db) return da < db ? -1 : 1;
      return a.task.title.localeCompare(b.task.title, "pl");
    });

// Mini-raport "ostatnie N dni" — liczy się TYLKO dni, w które pracownik
// faktycznie miał jakąś zmianę (brak zmiany = brak oczekiwanych zadań tego
// dnia, nie liczymy tego jako "zaległość"). Przybliżenie: dla przeszłych
// dni używa tego samego `employee` (default_lokal/stanowisko) co dziś,
// nadpisanego zmianą z tamtego dnia jeśli była — wystarczające dla
// orientacyjnego wskaźnika, nie audytu.
export const weeklyChecklistStats = (
  tasks,
  completions,
  employeeId,
  employee,
  shiftsForEmployee,
  todayStr,
  days = 7
) => {
  let done = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() - i);
    const ds = toLocalYMD(d);
    const shiftsOnDay = shiftsForEmployee.filter((s) => toLocalYMD(s.start_time) === ds);
    if (shiftsOnDay.length === 0) continue;
    const assignment = getEffectiveAssignmentForDate(employee, shiftsOnDay);
    const list = buildEmployeeChecklist(tasks, completions, employeeId, assignment, ds, "own");
    done += list.filter((item) => item.done).length;
    total += list.length;
  }
  return { done, total };
};

export { toLocalYMD };
