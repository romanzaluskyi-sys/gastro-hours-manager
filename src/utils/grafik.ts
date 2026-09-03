// @ts-nocheck
// Wspólna logika modułu Grafik — jedyne miejsce, które liczy "czy obsada
// pokrywa wymagania" i porównuje plan z faktem. Wywoływane przez
// components/manager/Grafik*.tsx (panel kierownika) i docelowo przez
// employeeSessionShared.tsx (grafik pracownika) — nie duplikuj tej logiki
// w komponentach, ten sam wzorzec co utils/tasks.ts i utils/corrections.ts.
//
// Pełna specyfikacja modułu: docs/GRAFIK.md.
import { toLocalYMD } from "../api/googleSheets";

// --- CZAS ---------------------------------------------------------------
// PostgREST zwraca kolumny `time` jako "09:00:00", a <input type="time">
// oczekuje "09:00" — wszystko wewnątrz tego pliku pracuje na minutach od
// północy, a na zewnątrz oddajemy zawsze skrócone "HH:MM".
export const trimTime = (t) => (typeof t === "string" ? t.slice(0, 5) : "");

export const timeToMin = (t) => {
  const [h, m] = trimTime(t).split(":");
  const hh = Number(h);
  const mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
};

export const minToTime = (min) => {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const minToHours = (min) => Math.round((min / 60) * 100) / 100;

export const addDaysYMD = (dateStr, delta) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toLocalYMD(d);
};

export const dowOf = (dateStr) => new Date(dateStr + "T00:00:00").getDay();

// Lista indeksów dni po przecinku ("1,2,3,4,5", 0=niedziela..6=sobota) —
// ten sam format i to samo znaczenie co `tasks.days_of_week`, żeby nie
// wprowadzać drugiej konwencji w tym samym projekcie.
export const parseDays = (raw) => {
  if (!raw) return null;
  const days = String(raw)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  return days.length > 0 ? days : null;
};

// --- ZMIANY -------------------------------------------------------------
// `end_time < start_time` oznacza zmianę przechodzącą przez północ (np.
// 18:00–02:00). Taka zmiana wchodzi w DWA dni, więc do kontroli obsady
// rozbijamy ją na odcinki należące do konkretnej daty.
export const isOvernight = (shift) => {
  const s = timeToMin(shift.start_time);
  const e = timeToMin(shift.end_time);
  return s != null && e != null && e <= s;
};

export const shiftSegmentsOnDate = (shift, dateStr) => {
  const s = timeToMin(shift.start_time);
  const e = timeToMin(shift.end_time);
  if (s == null || e == null) return [];
  const overnight = e <= s;
  if (shift.date === dateStr) return [[s, overnight ? 1440 : e]];
  if (overnight && addDaysYMD(shift.date, 1) === dateStr) return [[0, e]];
  return [];
};

// Długość zmiany w minutach — dla zmiany przez północ liczona przez dobę,
// nie jako ujemna różnica.
export const shiftLengthMin = (shift) => {
  const s = timeToMin(shift.start_time);
  const e = timeToMin(shift.end_time);
  if (s == null || e == null) return 0;
  return e > s ? e - s : 1440 - s + e;
};

export const shiftHours = (shift) => minToHours(shiftLengthMin(shift));

// --- GODZINY OTWARCIA I WYJĄTKI ----------------------------------------
// Wyjątek (święto, niedziela handlowa) nadpisuje i godziny otwarcia, i
// wymagania obsady — dlatego szukamy go raz i przekazujemy dalej.
export const findWyjatek = (wyjatki, lokal, dateStr) =>
  (wyjatki || []).find(
    (w) => w.lokal === lokal && w.date_from <= dateStr && dateStr <= w.date_to
  ) || null;

export const getOpeningHours = (lokaleGodziny, wyjatki, lokal, dateStr) => {
  const wyjatek = findWyjatek(wyjatki, lokal, dateStr);
  if (wyjatek) {
    return {
      zamkniete: !!wyjatek.zamkniete,
      open: trimTime(wyjatek.open_time),
      close: trimTime(wyjatek.close_time),
      wyjatek,
    };
  }
  const row = (lokaleGodziny || []).find(
    (g) => g.lokal === lokal && g.day_of_week === dowOf(dateStr)
  );
  if (!row) return { zamkniete: false, open: "", close: "", wyjatek: null };
  return {
    zamkniete: !!row.zamkniete,
    open: trimTime(row.open_time),
    close: trimTime(row.close_time),
    wyjatek: null,
  };
};

// --- WYMAGANIA OBSADY ---------------------------------------------------
// Zestaw obowiązuje od swojego miesiąca aż do pojawienia się nowszego —
// kierownik nie musi wypełniać każdego miesiąca od zera.
export const findRuleSetForDate = (ruleSets, lokal, dateStr) => {
  const candidates = (ruleSets || [])
    .filter((s) => s.lokal === lokal && s.obowiazuje_od <= dateStr)
    .sort((a, b) => (a.obowiazuje_od < b.obowiazuje_od ? 1 : -1));
  return candidates[0] || null;
};

// Wiersze wymagań obowiązujące danego dnia. Wyjątek ma pierwszeństwo:
// jeśli istnieje i ma własne wiersze, całkowicie zastępuje regułę
// miesięczną (nie dokłada się do niej).
export const getRulesForDate = (
  { rules, ruleSets, wyjatki },
  lokal,
  dateStr
) => {
  const wyjatek = findWyjatek(wyjatki, lokal, dateStr);
  if (wyjatek) {
    if (wyjatek.zamkniete) return [];
    const own = (rules || []).filter((r) => r.wyjatek_id === wyjatek.id);
    if (own.length > 0) return own;
  }
  const set = findRuleSetForDate(ruleSets, lokal, dateStr);
  if (!set) return [];
  const dow = dowOf(dateStr);
  return (rules || []).filter((r) => {
    if (r.set_id !== set.id) return false;
    const days = parseDays(r.days_of_week);
    return days ? days.includes(dow) : true;
  });
};

// --- KONTROLA OBSADY ----------------------------------------------------
// Wiersze wymagań SUMUJĄ SIĘ: "pn–nd 09:00–21:00 → 2 osoby" plus
// "sobota 14:00–19:00 → +1 osoba" daje w sobotę 2 osoby do 14:00, 3 osoby
// 14:00–19:00 i znów 2 osoby po 19:00. Kontrola nie sprawdza, KTO pokrywa
// wymaganie — liczy tylko, ile osób na danym stanowisku jest w danym
// momencie zaplanowanych. Jedna osoba na całą zmianę i dwie osoby po pół
// dnia spełniają je tak samo (ustalenie właściciela, patrz docs/GRAFIK.md).
//
// Zwraca listę dziur: { stanowisko, from, to, required, actual, missing }
// z godzinami jako "HH:MM".
export const coverageGaps = (rulesForDay, shiftsOnDay) => {
  const gaps = [];
  const stanowiska = [...new Set(rulesForDay.map((r) => r.stanowisko))];

  stanowiska.forEach((stanowisko) => {
    const rows = rulesForDay.filter((r) => r.stanowisko === stanowisko);
    const segments = shiftsOnDay
      .filter((s) => s.stanowisko === stanowisko)
      .flatMap((s) => s.__segments || []);

    // Punkty podziału osi czasu — każda granica wymagania i każda granica
    // zmiany. Między dwoma sąsiednimi punktami zarówno wymagana, jak i
    // faktyczna obsada są stałe, więc wystarczy sprawdzić środek odcinka.
    const points = new Set();
    rows.forEach((r) => {
      const a = timeToMin(r.start_time);
      const b = timeToMin(r.end_time);
      if (a != null) points.add(a);
      if (b != null) points.add(b === 0 ? 1440 : b);
    });
    segments.forEach(([a, b]) => {
      points.add(a);
      points.add(b);
    });
    const sorted = [...points].sort((a, b) => a - b);

    let current = null;
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (to <= from) continue;
      const mid = (from + to) / 2;

      const required = rows.reduce((sum, r) => {
        const a = timeToMin(r.start_time);
        const b0 = timeToMin(r.end_time);
        const b = b0 === 0 ? 1440 : b0;
        if (a == null || b == null) return sum;
        return mid >= a && mid < b ? sum + (r.required_count || 1) : sum;
      }, 0);
      const actual = segments.filter(([a, b]) => mid >= a && mid < b).length;

      if (actual < required) {
        // Scalanie sąsiadujących odcinków o tym samym niedoborze, żeby
        // "14:00–15:00" nie rozpadało się na kilka wpisów tylko dlatego,
        // że w środku ktoś inny zaczynał zmianę.
        if (
          current &&
          current.to === from &&
          current.required === required &&
          current.actual === actual
        ) {
          current.to = to;
        } else {
          if (current) gaps.push(current);
          current = { stanowisko, from, to, required, actual };
        }
      } else if (current) {
        gaps.push(current);
        current = null;
      }
    }
    if (current) gaps.push(current);
  });

  return gaps.map((g) => ({
    stanowisko: g.stanowisko,
    from: minToTime(g.from),
    to: minToTime(g.to),
    minutes: g.to - g.from,
    required: g.required,
    actual: g.actual,
    missing: g.required - g.actual,
  }));
};

// Kontrola obsady jednego dnia w jednym lokalu. `planShifts` to wszystkie
// zaplanowane zmiany lokalu (funkcja sama wybiera te, które dotyczą tej
// daty — łącznie ze zmianami z dnia poprzedniego kończącymi się po
// północy).
export const checkDayCoverage = (
  { rules, ruleSets, wyjatki, planShifts },
  lokal,
  dateStr
) => {
  const rulesForDay = getRulesForDate({ rules, ruleSets, wyjatki }, lokal, dateStr);
  const shiftsOnDay = (planShifts || [])
    .filter((s) => s.lokal === lokal)
    .map((s) => ({ ...s, __segments: shiftSegmentsOnDate(s, dateStr) }))
    .filter((s) => s.__segments.length > 0);

  const gaps = coverageGaps(rulesForDay, shiftsOnDay);
  const gapMinutes = gaps.reduce((sum, g) => sum + g.minutes * g.missing, 0);
  const own = (planShifts || []).filter((s) => s.lokal === lokal && s.date === dateStr);

  return {
    date: dateStr,
    lokal,
    gaps,
    gapMinutes,
    hasGap: gaps.length > 0,
    people: own.length,
    hours: minToHours(own.reduce((sum, s) => sum + shiftLengthMin(s), 0)),
  };
};

// --- PLAN vs FAKT -------------------------------------------------------
// Grafik tylko INFORMUJE o rozjeździe (np. "+0,5 h ponad plan", "zmiana
// poza planem") — niczego nie koryguje. `shifts` (odbicia) zostają jedynym
// źródłem prawdy o faktycznie przepracowanych godzinach.
export const matchFactToPlan = (planShift, factShifts) =>
  (factShifts || []).find(
    (f) =>
      !f.is_urlop &&
      f.start_time &&
      toLocalYMD(f.start_time) === planShift.date &&
      (planShift.user_id
        ? String(f.user_id) === String(planShift.user_id)
        : f.user_name === planShift.user_name)
  ) || null;

export const planFactDiff = (planShift, factShift) => {
  if (!factShift) return null;
  const planMin = shiftLengthMin(planShift);
  if (!factShift.end_time) {
    return { status: "trwa", planMin, factMin: null, diffMin: null };
  }
  const factMin = Math.round(
    (factShift.end_time.getTime() - factShift.start_time.getTime()) / 60000
  );
  return {
    status: "zamknieta",
    planMin,
    factMin,
    diffMin: factMin - planMin,
    factFrom: factShift.start_time.toTimeString().slice(0, 5),
    factTo: factShift.end_time.toTimeString().slice(0, 5),
  };
};

// Zmiany, które pracownik odbił, a których nie było w grafiku — "przyszedł
// poza planem, bo wzrósł ruch". Świadomie NIE traktujemy tego jako błędu.
export const factWithoutPlan = (factShifts, planShifts, lokal, dateStr) =>
  (factShifts || [])
    .filter(
      (f) =>
        !f.is_urlop &&
        f.lokal === lokal &&
        f.start_time &&
        toLocalYMD(f.start_time) === dateStr
    )
    .filter(
      (f) =>
        !(planShifts || []).some(
          (p) =>
            p.lokal === lokal &&
            p.date === dateStr &&
            (p.user_id
              ? String(p.user_id) === String(f.user_id)
              : p.user_name === f.user_name)
        )
    );

// --- PUBLIKACJA ---------------------------------------------------------
// Zmiana jest "niewysłana", gdy nigdy nie została opublikowana albo została
// zmieniona po ostatniej publikacji. Nie ma osobnej tabeli publikacji —
// wystarczą dwa znaczniki czasu na samym wierszu.
export const isUnpublished = (planShift) =>
  !planShift.published_at ||
  new Date(planShift.updated_at) > new Date(planShift.published_at);

export const countUnpublished = (planShifts, lokal, fromDate, toDate) =>
  (planShifts || []).filter(
    (s) =>
      (!lokal || s.lokal === lokal) &&
      s.date >= fromDate &&
      s.date <= toDate &&
      isUnpublished(s)
  ).length;

// --- STANOWISKA PRACOWNIKA ---------------------------------------------
// `allowed_stanowiska` jest tekstem rozdzielonym przecinkami, dokładnie jak
// istniejące `allowed_lokale` (patrz ManagerDashboard.tsx — join/split), a
// NIE tablicą Postgresa, mimo zapisu "[]" w CLAUDE.md.
export const allowedStanowiskaArr = (user) => {
  if (!user) return [];
  const raw = user.allowed_stanowiska;
  const list = Array.isArray(raw)
    ? raw
    : raw
    ? String(raw).split(",").map((s) => s.trim())
    : [];
  const withDefault = user.default_stanowisko
    ? [user.default_stanowisko, ...list]
    : list;
  return [...new Set(withDefault.filter(Boolean))];
};

// Czy pracownik "umie" pracować na tym stanowisku. Odpowiedź NIE blokuje —
// służy tylko do żółtego ostrzeżenia, decyzję podejmuje kierownik
// (ustalenie właściciela, patrz docs/GRAFIK.md).
export const knowsStanowisko = (user, stanowisko) =>
  !stanowisko || allowedStanowiskaArr(user).includes(stanowisko);

export { toLocalYMD };
