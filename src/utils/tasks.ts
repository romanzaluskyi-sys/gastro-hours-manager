// @ts-nocheck
// Zadania — bloki (checklisty) i pojedyncze pozycje w nich.
//
// JEDYNE miejsce, które decyduje "co jest dziś do zrobienia" i zapisuje
// wykonania. Wywołują je: components/manager/ZadaniaISprzatanie.tsx i
// ZadaniaKonfiguracja.tsx (panel kierownika) oraz employeeSessionShared.tsx
// (Tablet Służbowy, tablet z PIN-em i prywatny telefon — jeden kod, trzy
// powierzchnie). Nie duplikuj tego w komponentach, ten sam wzorzec co
// utils/corrections.ts i utils/grafik.ts.
//
// MODEL (od 0.37.0):
//
//   blok    = KIEDY (pora + dni tygodnia, ewentualnie cykl) i DLA KOGO
//             (lista stanowisk; puste = wszyscy na zmianie)
//   zadanie = jeden wiersz checklisty: tytuł, opcjonalny opis/procedura,
//             opcjonalne POLA do wpisania (temperatura, kwota, tak/nie),
//             opcjonalny WŁASNY cykl ("okna co 7 dni" w codziennym bloku)
//
// ⚠️ Rozkład i adresat mieszkają TYLKO na bloku. Kolumny tasks.schedule_type /
// days_of_week / stanowisko / for_manager zostały w bazie z danymi (migracja
// 0019 przepisała je na bloki), ale kod ich NIE czyta — dwa źródła odpowiedzi
// na to samo pytanie to gwarantowany rozjazd. Jedyne, co zostało na zadaniu z
// harmonogramu, to `cycle_days`: cykl WEWNĄTRZ bloku.
//
// ⚠️ Wykonanie jest ZAWSZE wspólne, jeden wiersz na (zadanie, dzień) —
// findSharedCompletion, bez wyjątków. Pierwsza wersja (2026-09-02/03) miała
// osobne wykonanie per pracownik dla zadań przypisanych do stanowiska i było
// to mylące: dwie osoby na tym samym stanowisku widziały niezależne stany
// jednej czynności. Stanowisko decyduje o WIDOCZNOŚCI, nie o liczbie wykonań.
import { api } from "../api/supabase";
import { toLocalYMD } from "../api/googleSheets";
import { parsePola, polaSzablonu, pozaNormaPola } from "./pola";

// day_of_week: 0=niedziela..6=sobota, czyli zwykłe JS Date.getDay() —
// bez własnego mapowania, żeby nie wprowadzać kolejnego źródła błędów.
export const getDayOfWeekIndex = (dateStr) =>
  new Date(dateStr + "T00:00:00").getDay();

export const daysBetweenYMD = (fromStr, toStr) => {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  return Math.round((to - from) / 86400000);
};

// "6,0,1,2,3,4" — dowolny podzbiór dni. ⚠️ Zwraca null, gdy dni nie ustawiono,
// a null znaczy "CODZIENNIE", nie "nigdy" (na tym wywrócił się pierwszy szkic
// szablonów dziennika — patrz szablonyNaDzien w utils/dziennik.ts).
export const parseDaysOfWeek = (obiekt) => {
  if (!obiekt || !obiekt.days_of_week) return null;
  const days = String(obiekt.days_of_week)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  return days.length > 0 ? days : null;
};

// Lista nazw po przecinku (konwencja allowed_lokale). Puste = wszyscy.
export const parseStanowiska = (blok) => {
  if (!blok || !blok.stanowiska) return null;
  const lista = String(blok.stanowiska)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.length > 0 ? lista : null;
};

export const PORY_BLOKU = [
  { key: "poranne", label: "Poranne", order: 0 },
  { key: "obiadowe", label: "Obiadowe", order: 1 },
  { key: "wieczorne", label: "Wieczorne", order: 2 },
  { key: "ogolne", label: "Ogólne (dowolna pora)", order: 3 },
  { key: "cykliczne", label: "Cykliczne", order: 4 },
];

export const DNI_SKROT = ["Nd", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];

// Podpis dni tylko wtedy, gdy są faktycznie ograniczone — "codziennie" nie
// potrzebuje etykiety.
export const dniBlokuLabel = (blok) => {
  const dni = parseDaysOfWeek(blok);
  if (!dni || dni.length === 7) return null;
  return dni.map((i) => DNI_SKROT[i]).join(", ");
};

export const poraLabel = (key) =>
  (PORY_BLOKU.find((p) => p.key === key) || {}).label || "Ogólne";

export const PRIORITY_META = {
  niski: { label: "Niski", order: 0, badgeCls: "bg-[#E7E7E2] text-[#6E6E66]" },
  sredni: { label: "Średni", order: 1, badgeCls: "bg-[#F1F1EE] text-[#171714]" },
  wysoki: { label: "Wysoki", order: 2, badgeCls: "bg-[#FAEAE6] text-[#8A3A2B]" },
};

// --- BLOKI --------------------------------------------------------------

// Siatka bezpieczeństwa: zadanie bez bloku nie może zniknąć z ekranu. Dostaje
// blok wirtualny "Bez bloku" — widoczny codziennie, z adresatem wziętym ze
// starych kolumn zadania, żeby zadanie kierownika nie wyciekło pracownikom.
// Po migracji 0019 nic tu nie powinno trafiać; jeśli trafia, konfiguracja
// pokazuje to wprost, zamiast gubić zadanie po cichu.
export const blokWirtualny = (task) => ({
  id: `__bez_bloku:${task.lokal}:${task.stanowisko || ""}:${task.for_manager ? "k" : ""}`,
  wirtualny: true,
  lokal: task.lokal,
  nazwa: task.stanowisko ? `Bez bloku · ${task.stanowisko}` : "Bez bloku",
  stanowiska: task.stanowisko || null,
  schedule_type: "ogolne",
  cycle_days: null,
  days_of_week: null,
  deadline_time: null,
  for_manager: !!task.for_manager,
  kolejnosc: 999,
  active: true,
  archived: false,
});

export const blokDlaZadania = (blocks, task) =>
  (blocks || []).find((b) => String(b.id) === String(task.block_id)) ||
  blokWirtualny(task);

export const zadaniaBloku = (tasks, blok) =>
  (tasks || [])
    .filter((t) => !t.archived && t.active !== false)
    .filter((t) =>
      blok.wirtualny
        ? String(blokWirtualny(t).id) === String(blok.id)
        : String(t.block_id) === String(blok.id)
    )
    .sort(
      (a, b) =>
        (a.kolejnosc || 0) - (b.kolejnosc || 0) ||
        String(a.title || "").localeCompare(String(b.title || ""), "pl")
    );

// Czy blok w ogóle pokazuje się tego dnia: dni tygodnia + ewentualny cykl
// całego bloku. Cykl bloku liczymy od ostatniego dnia, w którym wykonano
// COKOLWIEK z tego bloku — blok raz zrobiony resetuje cykl.
export const isBlockDueOn = (blok, tasksOfBlock, completions, dateStr) => {
  if (!blok || blok.archived || blok.active === false) return false;
  const dni = parseDaysOfWeek(blok);
  if (dni && !dni.includes(getDayOfWeekIndex(dateStr))) return false;
  if (blok.schedule_type === "cykliczne") {
    const ostatnie = ostatnieWykonanie(tasksOfBlock, completions);
    if (ostatnie && daysBetweenYMD(ostatnie, dateStr) < (blok.cycle_days || 1)) {
      return false;
    }
  }
  return true;
};

// Ostatni dzień, w którym wykonano którekolwiek z podanych zadań.
export const ostatnieWykonanie = (tasksList, completions) => {
  const ids = new Set((tasksList || []).map((t) => String(t.id)));
  const dni = (completions || [])
    .filter((c) => ids.has(String(c.task_id)))
    .map((c) => c.date)
    .sort();
  return dni[dni.length - 1] || null;
};

// "Cykliczne" (co N dni) — liczone od ostatniego FAKTYCZNEGO wykonania, nie od
// stałej kotwicy w kalendarzu: pominięty cykl zostaje zaległy, zamiast po cichu
// przeskoczyć do kolejnego terminu. Brak wykonania = zawsze do zrobienia.
export const isCyclicalDueOn = (task, completions, dateStr) => {
  const ostatnie = ostatnieWykonanie([task], completions);
  if (!ostatnie) return true;
  return daysBetweenYMD(ostatnie, dateStr) >= (task.cycle_days || 1);
};

// Blok widoczny dla osoby na danym stanowisku. Puste stanowiska bloku = wszyscy.
export const blokDlaStanowiska = (blok, stanowisko) => {
  const lista = parseStanowiska(blok);
  if (!lista) return true;
  return lista.includes(stanowisko);
};

// --- POMIAR -------------------------------------------------------------

// Pola do wpisania. Gdy zadanie wskazuje pozycję z konfiguracji Pulsu
// (template_key), definicja pochodzi z SZABLONU — jedno źródło prawdy, żeby
// norma lodówki nie istniała w dwóch wersjach.
export const polaZadania = (task, templates) => {
  if (task && task.template_key) {
    const szablon = (templates || []).find(
      (s) => s.klucz === task.template_key && s.lokal === task.lokal
    );
    if (szablon) return polaSzablonu(szablon);
  }
  return parsePola(task && task.pola);
};

export const maPomiar = (task, templates) => polaZadania(task, templates).length > 0;

// Klucz wpisu w dzienniku. Zadanie podpięte pod pozycję Pulsu zapisuje się na
// JEJ kluczu — dzięki temu karta dnia widzi pozycję jako wypełnioną i nie prosi
// o nią drugi raz (to jest ten "konektor", który nie pozwala powstać duplikatom).
// Pomiar własny zadania dostaje klucz "zad:<id>" — nie jest pozycją dziennika,
// ale MUSI mieć jakiś klucz: wpisy bez template_key karta dnia pokazuje w
// sekcji "Zdarzenia", gdzie wylądowałby jako "(bez opisu)".
export const kluczWpisuZadania = (task) =>
  task.template_key || `zad:${task.id}`;

export const czyWpisZadania = (wpis) =>
  !!wpis && String(wpis.template_key || "").startsWith("zad:");

export const zadanieWpisu = (wpis, tasks) => {
  const klucz = String((wpis && wpis.template_key) || "");
  if (!klucz.startsWith("zad:")) return null;
  const id = klucz.slice(4);
  return (tasks || []).find((t) => String(t.id) === id) || null;
};

export const wpisWykonania = (completion, entries) =>
  completion && completion.entry_id
    ? (entries || []).find((w) => String(w.id) === String(completion.entry_id)) || null
    : null;

export const pozaNormaZadania = (task, templates, wpis) =>
  !!wpis && pozaNormaPola(polaZadania(task, templates), wpis.payload || {});

// --- WYKONANIE ----------------------------------------------------------

export const findSharedCompletion = (completions, taskId, dateStr) =>
  (completions || []).find(
    (c) => String(c.task_id) === String(taskId) && c.date === dateStr
  ) || null;

// Jedyne miejsce, które pisze do task_completions dla zadań BEZ pomiaru —
// odhaczenie tworzy wiersz, odznaczenie go kasuje (brak wiersza = niezrobione).
export const toggleTaskCompletion = async ({
  task,
  dateStr,
  existingCompletion,
  actorId,
  actorName,
  shiftId,
}) => {
  if (existingCompletion) {
    // ⚠️ Wykonania z pomiarem nie odznaczamy. Za nim stoi wpis w dzienniku, a
    // zapis HACCP, który da się skasować dzień później, nie jest dowodem
    // niczego — od tego jest poprawka (poprawPomiarZadania), która zostawia ślad.
    if (existingCompletion.entry_id) {
      throw new Error(
        "Tego zadania nie da się odznaczyć — jest z nim zapisany pomiar. Popraw wartość."
      );
    }
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

// Zadanie z polami: najpierw wpis do dziennika, POTEM wykonanie. Kolejność jest
// celowa — gdyby wpis padł po odhaczeniu, zostałaby galka "zrobione" bez
// pomiaru, czyli dokładnie to, przed czym ten moduł ma chronić.
export const zapiszWykonanieZPomiarem = async ({
  task,
  dateStr,
  payload,
  dayLogId,
  actorId,
  actorName,
  shiftId,
}) => {
  const wpis = await api.post("day_log_entries", {
    lokal: task.lokal,
    date: dateStr,
    day_log_id: dayLogId ? String(dayLogId) : null,
    typ: task.typ || "inne",
    template_key: kluczWpisuZadania(task),
    payload: payload || {},
    recorded_by: actorName || null,
  });
  const created = await api.post("task_completions", {
    task_id: task.id,
    date: dateStr,
    user_id: actorId || null,
    user_name: actorName || null,
    shift_id: shiftId || null,
    entry_id: String(wpis.id),
  });
  return { created, wpis };
};

// Poprawka pomiaru to NOWY wpis wskazujący na stary (corrected_from), nigdy
// update na miejscu — ta sama zasada co poprawWpis() w utils/dziennik.ts.
// Wykonanie zostaje to samo, przestawiamy tylko wskaźnik na nową wersję.
export const poprawPomiarZadania = async ({
  task,
  completion,
  staryWpis,
  payload,
  powod,
  actorName,
}) => {
  const wpis = await api.post("day_log_entries", {
    lokal: staryWpis.lokal,
    date: staryWpis.date,
    day_log_id: staryWpis.day_log_id,
    typ: staryWpis.typ,
    template_key: staryWpis.template_key,
    payload: payload || {},
    recorded_by: actorName || null,
    corrected_from: staryWpis.id,
    corrected_reason: powod || null,
  });
  const updated = await api.patch("task_completions", completion.id, {
    entry_id: String(wpis.id),
  });
  return { updated, wpis };
};

// --- CHECKLISTY ---------------------------------------------------------

// Bloki aktualne na dany dzień wraz z ich zadaniami i stanem wykonania.
// Jedno wejście dla panelu kierownika i dla wszystkich trzech ekranów
// pracownika — różnią się tylko filtrami, nie logiką.
export const blokiNaDzien = ({
  tasks,
  blocks,
  completions,
  entries,
  templates,
  lokal = null,
  dateStr,
  stanowisko = null,
  tryb = "all", // "own" = tylko bloki dla tego stanowiska (i dla wszystkich)
  forManager = false, // true = tylko bloki kierownika, false = tylko reszta, null = wszystkie
}) => {
  const wszystkie = (tasks || []).filter(
    (t) => !t.archived && t.active !== false && (!lokal || t.lokal === lokal)
  );

  // Bloki realne + wirtualne (dla zadań bez bloku — patrz blokWirtualny).
  const mapa = new Map();
  (blocks || [])
    .filter((b) => !b.archived && b.active !== false && (!lokal || b.lokal === lokal))
    .forEach((b) => mapa.set(String(b.id), b));
  wszystkie
    .filter((t) => !mapa.has(String(t.block_id)))
    .forEach((t) => {
      const wb = blokWirtualny(t);
      if (!mapa.has(String(wb.id))) mapa.set(String(wb.id), wb);
    });

  return [...mapa.values()]
    .filter((b) => forManager == null || !!b.for_manager === !!forManager)
    .filter((b) => tryb === "all" || blokDlaStanowiska(b, stanowisko))
    .map((blok) => {
      const zadania = zadaniaBloku(wszystkie, blok);
      if (!isBlockDueOn(blok, zadania, completions, dateStr)) return null;
      const items = zadania
        .filter((t) => !t.cycle_days || isCyclicalDueOn(t, completions, dateStr))
        .map((task) => {
          const completion = findSharedCompletion(completions, task.id, dateStr);
          const wpis = wpisWykonania(completion, entries);
          const pola = polaZadania(task, templates);
          return {
            task,
            blok,
            completion,
            done: !!completion,
            wpis,
            pola,
            pomiar: pola.length > 0,
            alarm: pozaNormaZadania(task, templates, wpis),
          };
        })
        .sort((a, b) => {
          const pa = PRIORITY_META[a.task.priority]?.order ?? 1;
          const pb = PRIORITY_META[b.task.priority]?.order ?? 1;
          if (pa !== pb) return pb - pa;
          return (a.task.kolejnosc || 0) - (b.task.kolejnosc || 0);
        });
      if (items.length === 0) return null;
      return {
        blok,
        items,
        total: items.length,
        done: items.filter((i) => i.done).length,
        zostalo: items.filter((i) => !i.done).length,
        pilne: items.some((i) => !i.done && i.task.priority === "wysoki"),
        alarm: items.some((i) => i.alarm),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const oa = PORY_BLOKU.find((p) => p.key === a.blok.schedule_type)?.order ?? 3;
      const ob = PORY_BLOKU.find((p) => p.key === b.blok.schedule_type)?.order ?? 3;
      if (oa !== ob) return oa - ob;
      if ((a.blok.kolejnosc || 0) !== (b.blok.kolejnosc || 0))
        return (a.blok.kolejnosc || 0) - (b.blok.kolejnosc || 0);
      return String(a.blok.nazwa).localeCompare(String(b.blok.nazwa), "pl");
    });
};

// Płaska lista pozycji z wszystkich bloków — do liczników i odznak, tam gdzie
// grupowanie nie jest potrzebne.
export const splaszczBloki = (grupy) =>
  (grupy || []).reduce((acc, g) => acc.concat(g.items), []);

// Płaska lista zadań aktualnych na dany dzień. ⚠️ W 0.37.0 zastąpiła
// isTaskDueOn(task, completions, date): o tym, czy zadanie jest dziś do
// zrobienia, decyduje jego BLOK (dni tygodnia, pora, ewentualny cykl całego
// bloku), a tego nie da się ocenić patrząc na jedno zadanie w oderwaniu od
// reszty. Jedna droga do odpowiedzi zamiast dwóch, które kiedyś się rozjadą.
export const zadaniaNaDzien = (args) => splaszczBloki(blokiNaDzien(args));

// Wybiera lokal/stanowisko, do którego przypisać zadania danego dnia:
// otwarta zmiana > najnowsza zmiana tego dnia > domyślne dane pracownika.
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

// Checklista JEDNEGO pracownika na dany dzień, pogrupowana w bloki. Zadania
// kierownika (blok z for_manager) są celowo pomijane.
export const buildEmployeeBlocks = (
  { tasks, blocks, completions, entries, templates },
  { lokal, stanowisko },
  dateStr,
  viewMode = "own"
) =>
  blokiNaDzien({
    tasks,
    blocks,
    completions,
    entries,
    templates,
    lokal,
    dateStr,
    stanowisko,
    tryb: viewMode === "all" ? "all" : "own",
    forManager: false,
  });

// Ta sama checklista, ale płasko — używane przez liczniki i mini-raport.
export const buildEmployeeChecklist = (dane, przypisanie, dateStr, viewMode = "own") =>
  splaszczBloki(buildEmployeeBlocks(dane, przypisanie, dateStr, viewMode));

// Mini-raport "ostatnie N dni" — liczy się TYLKO dni, w które pracownik
// faktycznie miał jakąś zmianę (brak zmiany = brak oczekiwanych zadań tego dnia,
// nie liczymy tego jako zaległość). Przybliżenie dla orientacji, nie audyt.
export const weeklyChecklistStats = (
  dane,
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
    const list = buildEmployeeChecklist(dane, assignment, ds, "own");
    done += list.filter((item) => item.done).length;
    total += list.length;
  }
  return { done, total };
};

// --- ZAPIS KONFIGURACJI -------------------------------------------------

export const zapiszBlok = async (blok) => {
  const dane = {
    lokal: blok.lokal,
    nazwa: (blok.nazwa || "").trim(),
    opis: (blok.opis || "").trim() || null,
    stanowiska:
      Array.isArray(blok.stanowiska) && blok.stanowiska.length
        ? blok.stanowiska.join(",")
        : typeof blok.stanowiska === "string" && blok.stanowiska.trim()
        ? blok.stanowiska.trim()
        : null,
    schedule_type: blok.schedule_type || "ogolne",
    cycle_days:
      blok.schedule_type === "cykliczne" ? Number(blok.cycle_days) || 1 : null,
    days_of_week:
      Array.isArray(blok.days_of_week) && blok.days_of_week.length > 0 && blok.days_of_week.length < 7
        ? [...blok.days_of_week].sort().join(",")
        : null,
    deadline_time: blok.deadline_time || null,
    for_manager: !!blok.for_manager,
    kolejnosc: blok.kolejnosc ?? 0,
  };
  return blok.id
    ? api.patch("task_blocks", blok.id, dane)
    : api.post("task_blocks", dane);
};

export const zapiszZadanie = async (zadanie) => {
  const dane = {
    lokal: zadanie.lokal,
    block_id: zadanie.block_id ? String(zadanie.block_id) : null,
    title: (zadanie.title || "").trim(),
    description: (zadanie.description || "").trim() || null,
    priority: zadanie.priority || "sredni",
    deadline_time: zadanie.deadline_time || null,
    cycle_days: zadanie.cycle_days ? Number(zadanie.cycle_days) : null,
    kolejnosc: zadanie.kolejnosc ?? 0,
    pola: zadanie.template_key ? [] : zadanie.pola || [],
    typ: (zadanie.pola || []).length || zadanie.template_key ? zadanie.typ || "inne" : null,
    template_key: zadanie.template_key || null,
    // Stare kolumny rozkładu zostają puste — rozkład mieszka na bloku.
    schedule_type: "ogolne",
    for_manager: !!zadanie.for_manager,
  };
  return zadanie.id
    ? api.patch("tasks", zadanie.id, dane)
    : api.post("tasks", dane);
};

// Archiwizujemy, nie kasujemy — historia wykonań i wpisy w dzienniku muszą
// dalej mieć skąd wziąć tytuł i normy.
export const archiwizujBlok = async (blok, tasks) => {
  const zadania = zadaniaBloku(tasks, blok);
  for (const t of zadania) {
    await api.patch("tasks", t.id, { archived: true });
  }
  const zapisany = await api.patch("task_blocks", blok.id, { archived: true });
  return { blok: zapisany, zadania: zadania.map((t) => t.id) };
};

export const archiwizujZadanie = (task) =>
  api.patch("tasks", task.id, { archived: true });

// --- ZESTAW STARTOWY ----------------------------------------------------
// Nowy lokal ma być gotowy na dwa kliknięcia. W gastronomii proces otwarcia,
// HACCP i zamknięcia jest wszędzie ten sam, a kwadrans wpisywania per lokal to
// dokładnie ta praca, która rozciąga wdrożenie u klienta z pół dnia na tydzień.
// Kierownik i tak potem skasuje to, czego u siebie nie robi — poprawianie
// gotowej listy jest wielokrotnie szybsze niż pisanie jej od zera.
export const BLOKI_STARTOWE = [
  {
    nazwa: "Otwarcie lokalu",
    opis: "Pierwsza godzina zmiany porannej.",
    schedule_type: "poranne",
    zadania: [
      { title: "Otworzyć lokal, wyłączyć alarm" },
      { title: "Włączyć sprzęt (ekspres, piec, bemar)" },
      {
        title: "Stan kasy na start",
        typ: "inne",
        pola: [{ klucz: "kwota", label: "Kwota w kasie", typ: "number", jednostka: "zł" }],
      },
      {
        title: "Temperatura lodówki — rano",
        typ: "temperatura",
        pola: [
          { klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: 0, max: 5 },
        ],
      },
      { title: "Przegląd zapasów na zmianę" },
      { title: "Sala i toalety gotowe na gości" },
    ],
  },
  {
    nazwa: "Bezpieczeństwo żywności (HACCP)",
    opis: "Pomiary i kontrole wymagane przez sanepid.",
    schedule_type: "ogolne",
    zadania: [
      {
        title: "Temperatura lodówki kuchennej",
        typ: "temperatura",
        pola: [
          { klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: 0, max: 5 },
        ],
      },
      {
        title: "Temperatura zamrażarki",
        typ: "temperatura",
        pola: [
          { klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: -25, max: -18 },
        ],
      },
      {
        title: "Temperatura wydania / bemar",
        typ: "temperatura",
        pola: [
          { klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: 63 },
        ],
      },
      {
        title: "Przyjęcie dostawy",
        typ: "dostawa",
        pola: [
          { klucz: "dostawca", label: "Dostawca", typ: "text" },
          { klucz: "temp", label: "Temperatura towaru", typ: "number", jednostka: "°C", max: 5 },
          { klucz: "dokumenty", label: "Dokumenty w porządku", typ: "bool" },
        ],
      },
      {
        title: "Olej we frytkownicy",
        typ: "inne",
        pola: [{ klucz: "wymieniony", label: "Wymieniony dzisiaj", typ: "bool" }],
      },
      { title: "Daty i oznaczenia na produktach" },
    ],
  },
  {
    nazwa: "Mycie i dezynfekcja sprzętu",
    opis: "Sprzęt, który myje się po zmianie albo co kilka dni.",
    schedule_type: "wieczorne",
    zadania: [
      { title: "Piec / piekarnik" },
      { title: "Krajalnica — mycie i dezynfekcja" },
      { title: "Blender, mikser" },
      { title: "Lodówka — mycie wewnątrz", cycle_days: 3 },
      { title: "Okap i filtry", cycle_days: 7 },
      { title: "Podłoga zaplecza" },
    ],
  },
  {
    nazwa: "Zamknięcie lokalu",
    opis: "Ostatnie 30 minut zmiany wieczornej.",
    schedule_type: "wieczorne",
    zadania: [
      {
        title: "Stan kasy na koniec",
        typ: "inne",
        pola: [{ klucz: "kwota", label: "Kwota w kasie", typ: "number", jednostka: "zł" }],
      },
      {
        title: "Temperatura lodówek na noc",
        typ: "temperatura",
        pola: [
          { klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: 0, max: 5 },
        ],
      },
      { title: "Sprzęt wyłączony" },
      { title: "Śmieci wyniesione" },
      { title: "Lokal zamknięty, alarm włączony" },
    ],
  },
  {
    nazwa: "Sala i goście",
    opis: "Kontrole w ciągu dnia.",
    schedule_type: "ogolne",
    zadania: [
      { title: "Toalety — kontrola czystości" },
      { title: "Stoliki, menu, serwetki" },
      { title: "Muzyka i oświetlenie" },
    ],
  },
  {
    nazwa: "Kontrola kierownika",
    opis: "Widoczne tylko w panelu kierownika.",
    schedule_type: "ogolne",
    for_manager: true,
    zadania: [
      { title: "Utarg i kasa zgodne z raportem" },
      { title: "Grafik na jutro obsadzony" },
      { title: "Zgłoszenia od zespołu przejrzane" },
    ],
  },
];

// Wstawia jeden gotowy blok razem z zadaniami. Zwraca { blok, zadania }.
export const dodajBlokStartowy = async (wzor, lokal, kolejnosc = 0) => {
  const blok = await zapiszBlok({
    lokal,
    nazwa: wzor.nazwa,
    opis: wzor.opis,
    schedule_type: wzor.schedule_type,
    for_manager: !!wzor.for_manager,
    kolejnosc,
  });
  const zadania = [];
  for (let i = 0; i < wzor.zadania.length; i++) {
    const z = wzor.zadania[i];
    zadania.push(
      await zapiszZadanie({
        lokal,
        block_id: blok.id,
        title: z.title,
        description: z.description,
        cycle_days: z.cycle_days,
        pola: z.pola || [],
        typ: z.typ,
        priority: z.priority || "sredni",
        kolejnosc: i,
        for_manager: !!wzor.for_manager,
      })
    );
  }
  return { blok, zadania };
};

export { toLocalYMD };
