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

// "6,0,1,2,3,4" — dowolny podzbiór dni zamiast jednego, żeby "wszystkie
// dni oprócz niedzieli" nie wymagało 6 osobnych zadań. `days_of_week`
// (nowe, text, lista indeksów po przecinku) ma pierwszeństwo nad starym,
// jednodniowym `day_of_week` — ten drugi zostaje tylko dla wstecznej
// zgodności z zadaniami utworzonymi przed tą zmianą.
export const parseDaysOfWeek = (task) => {
  if (!task.days_of_week) return null;
  const days = task.days_of_week
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  return days.length > 0 ? days : null;
};

export const isTaskDueOn = (task, completions, dateStr) => {
  if (!task.active || task.archived) return false;
  const days = parseDaysOfWeek(task);
  const todayDow = getDayOfWeekIndex(dateStr);
  if (days) {
    if (!days.includes(todayDow)) return false;
  } else if (task.day_of_week != null && todayDow !== task.day_of_week) {
    return false;
  }
  if (task.schedule_type === "cykliczne") {
    return isCyclicalDueOn(task, completions, dateStr);
  }
  return true;
};

export const PRIORITY_META = {
  niski: { label: "Niski", order: 0, badgeCls: "bg-[#E7E7E2] text-[#6E6E66]" },
  sredni: { label: "Średni", order: 1, badgeCls: "bg-[#F1F1EE] text-[#171714]" },
  wysoki: { label: "Wysoki", order: 2, badgeCls: "bg-[#FAEAE6] text-[#8A3A2B]" },
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

// Zawsze JEDNO wykonanie na (task, dzień), niezależnie od tego, do ilu
// osób zadanie jest kierowane (cały lokal albo jedno stanowisko) — jeśli
// dwie osoby mają to samo stanowisko, kliknięcie jednej odhacza zadanie
// dla obu. Świadoma zmiana (2026-09-04): pierwsza wersja miała osobne
// wykonanie per pracownik dla zadań przypisanych do stanowiska, co było
// mylące — dwie osoby na tym samym stanowisku widziały niezależne stany
// tego samego zadania, mimo że w rzeczywistości to jedna czynność do
// zrobienia przez kogokolwiek na zmianie.
export const findSharedCompletion = (completions, taskId, dateStr) =>
  completions.find((c) => c.task_id === taskId && c.date === dateStr) || null;

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

// Buduje checklistę widoczną dla JEDNEGO pracownika na dany dzień —
// używane przez ekran Zadania pracownika (kiosk/konto osobiste). Zadania
// `for_manager` są celowo pomijane — to zakres panelu kierownika
// (przełącznik "Zadania kierownika" nad surowym `tasks`), nie checklisty
// zwykłego pracownika. `viewMode: "own"` ogranicza listę do zadań "dla
// wszystkich" (stanowisko=null) i tych dopasowanych do stanowiska
// pracownika; `"all"` (przełącznik na kiosku) pokazuje wszystko dla
// lokalu bez względu na stanowisko. Wykonanie jest zawsze WSPÓLNE
// (`findSharedCompletion`) — patrz komentarz przy tej funkcji.
export const buildEmployeeChecklist = (
  tasks,
  completions,
  { lokal, stanowisko },
  dateStr,
  viewMode = "own"
) =>
  tasks
    .filter((t) => t.lokal === lokal && !t.for_manager)
    .filter((t) => isTaskDueOn(t, completions, dateStr))
    .filter(
      (t) => viewMode === "all" || t.stanowisko == null || t.stanowisko === stanowisko
    )
    .map((t) => {
      const completion = findSharedCompletion(completions, t.id, dateStr);
      return { task: t, completion, done: !!completion };
    })
    .sort((a, b) => {
      const pa = PRIORITY_META[a.task.priority]?.order ?? 1;
      const pb = PRIORITY_META[b.task.priority]?.order ?? 1;
      if (pa !== pb) return pb - pa;
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
    const list = buildEmployeeChecklist(tasks, completions, assignment, ds, "own");
    done += list.filter((item) => item.done).length;
    total += list.length;
  }
  return { done, total };
};

export { toLocalYMD };
