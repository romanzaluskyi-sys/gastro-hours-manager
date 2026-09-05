// @ts-nocheck
// Wspólna logika modułu Grafik — jedyne miejsce, które liczy "czy obsada
// pokrywa wymagania" i porównuje plan z faktem. Wywoływane przez
// components/manager/Grafik*.tsx (panel kierownika) i docelowo przez
// employeeSessionShared.tsx (grafik pracownika) — nie duplikuj tej logiki
// w komponentach, ten sam wzorzec co utils/tasks.ts i utils/corrections.ts.
//
// Pełna specyfikacja modułu: docs/GRAFIK.md.
import { toLocalYMD } from "../api/googleSheets";
import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";

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

// Poniedziałek tygodnia, w którym leży podana data — tydzień w grafiku
// zawsze zaczyna się od poniedziałku (0=niedziela w JS, stąd korekta).
export const mondayOf = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toLocalYMD(d);
};

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
  // Zmiany osób z wyłączonym kontem NIE liczą się jako obsada — ktoś, kto
  // odszedł, na tę zmianę nie przyjdzie, a policzenie jej jako pokrytej
  // ukrywałoby prawdziwą dziurę w grafiku. Wiersze zostają widoczne (patrz
  // GrafikTydzien), żeby dało się je przepisać albo usunąć.
  const shiftsOnDay = (planShifts || [])
    .filter((s) => s.lokal === lokal && !s.__nieaktywny)
    .map((s) => ({ ...s, __segments: shiftSegmentsOnDate(s, dateStr) }))
    .filter((s) => s.__segments.length > 0);

  const gaps = coverageGaps(rulesForDay, shiftsOnDay);
  const gapMinutes = gaps.reduce((sum, g) => sum + g.minutes * g.missing, 0);
  const own = (planShifts || []).filter(
    (s) => s.lokal === lokal && s.date === dateStr && !s.__nieaktywny
  );

  return {
    date: dateStr,
    lokal,
    gaps,
    gapMinutes,
    hasGap: gaps.length > 0,
    // OSOBY, nie zmiany — jedna osoba może mieć tego dnia dwie zmiany
    // (dzielenie zmiany jest dozwolone, blokujemy tylko nakładanie godzin).
    people: new Set(own.map((s) => s.user_id || s.user_name)).size,
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

// --- PLAN vs FAKT -------------------------------------------------------
// Porównujemy SUMY GODZIN w obrębie (osoba, dzień), a nie parujemy zmiana do
// zmiany. Powód jest praktyczny: ludzie wymieniają się między sobą bez
// systemu, ktoś wychodzi wcześniej i przychodzi zmiennik — parowanie
// pojedynczych wpisów dawałoby wtedy bzdury, a suma dnia jest odporna na to
// wszystko. Rozbieżność NIE jest tu traktowana jak wykroczenie: to sygnał
// dla kierownika, nie oskarżenie (ustalenie właściciela).

// Poniżej tej wartości nie ma o czym mówić — kilkanaście minut to naturalny
// rozrzut odbić, nie zjawisko do analizy.
export const PLAN_FAKT_PROG_H = 0.25;

const kluczOsoby = (x) => String(x.user_id || x.user_name || "");

export const planHoursOnDay = (planShifts, userKey, dateStr) =>
  (planShifts || [])
    .filter((s) => !s.deleted_at && s.date === dateStr && kluczOsoby(s) === userKey)
    .reduce((sum, s) => sum + shiftHours(s), 0);

export const factHoursOnDay = (factShifts, userKey, dateStr) =>
  (factShifts || [])
    .filter(
      (s) =>
        !s.is_urlop &&
        s.end_time &&
        s.start_time &&
        toLocalYMD(s.start_time) === dateStr &&
        kluczOsoby(s) === userKey
    )
    .reduce((sum, s) => sum + (s.end_time - s.start_time) / 3600000, 0);

// Mapa "osoba|dzień" -> { planH, faktH, diff } dla zakresu dat. Buduje się z
// obu stron naraz, więc łapie też dni, w których był plan bez faktu i fakt
// bez planu — obie sytuacje są dozwolone i nie są tu wyróżniane.
export const buildPlanFactMap = ({ planShifts, factShifts, from, to, lokalOk }) => {
  const mapa = new Map();
  const dodaj = (userKey, userName, dateStr) => {
    const k = `${userKey}|${dateStr}`;
    if (!mapa.has(k)) {
      mapa.set(k, { userKey, userName, date: dateStr, planH: 0, faktH: 0 });
    }
    return mapa.get(k);
  };
  (planShifts || []).forEach((s) => {
    if (s.deleted_at) return;
    if (from && s.date < from) return;
    if (to && s.date > to) return;
    if (lokalOk && !lokalOk(s.lokal)) return;
    dodaj(kluczOsoby(s), s.user_name, s.date).planH += shiftHours(s);
  });
  (factShifts || []).forEach((s) => {
    if (s.is_urlop || !s.start_time || !s.end_time) return;
    const dateStr = toLocalYMD(s.start_time);
    if (from && dateStr < from) return;
    if (to && dateStr > to) return;
    if (lokalOk && !lokalOk(s.lokal)) return;
    dodaj(kluczOsoby(s), s.user_name, dateStr).faktH +=
      (s.end_time - s.start_time) / 3600000;
  });
  mapa.forEach((v) => {
    v.diff = v.faktH - v.planH;
  });
  return mapa;
};

export const sumujPlanFakt = (mapa) => {
  let planH = 0;
  let faktH = 0;
  let rozbieznosci = 0;
  mapa.forEach((v) => {
    planH += v.planH;
    faktH += v.faktH;
    if (Math.abs(v.diff) >= PLAN_FAKT_PROG_H) rozbieznosci += 1;
  });
  return { planH, faktH, diff: faktH - planH, rozbieznosci, dni: mapa.size };
};

// --- PUBLIKACJA ---------------------------------------------------------
// Zmiana jest "niewysłana", gdy nigdy nie została opublikowana albo została
// zmieniona po ostatniej publikacji. Nie ma osobnej tabeli publikacji —
// wystarczą dwa znaczniki czasu na samym wierszu.
// Zmiany zaplanowane od danego dnia w przód dla osoby z wyłączonym kontem —
// używane przy archiwizacji pracownika, żeby kierownik wiedział, co zostaje
// w grafiku po jego odejściu.
export const futureShiftsOfUser = (planShifts, user, fromDate) =>
  (planShifts || []).filter(
    (s) =>
      !s.deleted_at &&
      s.date >= fromDate &&
      (s.user_id && user?.id
        ? String(s.user_id) === String(user.id)
        : s.user_name === user?.name)
  );

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

// --- WPISYWANIE ZMIAN (tryb Edycja) ------------------------------------
// Absolutny zakres zmiany w minutach od epoki, żeby porównywać zmiany z
// różnych dni jedną miarą — zmiana 18:00–02:00 kończy się już następnego
// dnia i musi kolidować ze zmianą 01:00–09:00 z tego następnego dnia.
export const planAbsRange = (shift) => {
  const base = new Date(shift.date + "T00:00:00").getTime() / 60000;
  const s = timeToMin(shift.start_time);
  const e = timeToMin(shift.end_time);
  if (s == null || e == null) return null;
  return [base + s, base + (e > s ? e : e + 1440)];
};

export const sameUserKey = (a, b) =>
  a.user_id && b.user_id
    ? String(a.user_id) === String(b.user_id)
    : a.user_name === b.user_name;

// JEDYNA rzecz, która blokuje wpisanie zmiany. Nie blokujemy drugiej
// zmiany tego samego dnia ani pracy w dwóch lokalach — pracownik może
// pracować 09:00–12:00 w jednym miejscu i od 12:00 w innym (ustalenie
// właściciela, patrz docs/GRAFIK.md). Kolidują dopiero nachodzące godziny.
export const findOverlappingPlanShift = (planShifts, candidate) => {
  const range = planAbsRange(candidate);
  if (!range) return null;
  const [cs, ce] = range;
  return (
    (planShifts || []).find((s) => {
      if (String(s.id) === String(candidate.excludeId)) return false;
      if (!sameUserKey(s, candidate)) return false;
      const other = planAbsRange(s);
      if (!other) return false;
      return other[0] < ce && cs < other[1];
    }) || null
  );
};

// Zatwierdzony wniosek o wolne obowiązujący danego dnia — urlop albo
// zgłoszona niedostępność. Oczekujące i odrzucone niczego nie blokują.
export const findBlockingAbsence = (absences, user, dateStr) =>
  (absences || []).find(
    (a) =>
      a.status === "approved" &&
      a.start_date <= dateStr &&
      dateStr <= a.end_date &&
      (a.user_id ? String(a.user_id) === String(user.id) : a.user_name === user.name)
  ) || null;

// Godziny podpowiadane w modalu wpisywania zmiany — bierzemy je z wymagań
// obsady, a nie z osobnego pola na stanowisku, żeby nie mieć dwóch źródeł
// prawdy, które z czasem się rozjadą. Przy kilku przedziałach wygrywa
// najdłuższy (bazowy), bo krótsze to zwykle "dodatkowa osoba na szczyt".
export const defaultHoursForStanowisko = (rulesForDay, stanowisko) => {
  const rows = (rulesForDay || []).filter((r) => r.stanowisko === stanowisko);
  if (rows.length === 0) return null;
  const best = rows
    .map((r) => {
      const s = timeToMin(r.start_time);
      const e = timeToMin(r.end_time);
      return { r, len: s == null || e == null ? 0 : (e > s ? e - s : 1440 - s + e) };
    })
    .sort((a, b) => b.len - a.len)[0];
  return { start: trimTime(best.r.start_time), end: trimTime(best.r.end_time) };
};

// Kopiowanie poprzedniego tygodnia — zwraca gotowe wiersze do wstawienia.
// Pomijamy osoby, które w nowym terminie mają zatwierdzone wolne albo
// kolidującą zmianę: cicha kolizja byłaby gorsza niż brak wpisu.
export const buildCopyFromPreviousWeek = ({
  planShifts,
  absences,
  users,
  lokal,
  weekStart,
}) => {
  const prevFrom = addDaysYMD(weekStart, -7);
  const prevTo = addDaysYMD(weekStart, -1);
  const source = (planShifts || []).filter(
    (s) => s.lokal === lokal && s.date >= prevFrom && s.date <= prevTo
  );
  const drafts = [];
  const skipped = [];
  source.forEach((s) => {
    const date = addDaysYMD(s.date, 7);
    const candidate = {
      lokal: s.lokal,
      user_id: s.user_id,
      user_name: s.user_name,
      stanowisko: s.stanowisko,
      date,
      start_time: trimTime(s.start_time),
      end_time: trimTime(s.end_time),
    };
    const user =
      (users || []).find((u) =>
        s.user_id ? String(u.id) === String(s.user_id) : u.name === s.user_name
      ) || { id: s.user_id, name: s.user_name };
    if (findBlockingAbsence(absences, user, date)) {
      skipped.push({ ...candidate, powod: "wolne" });
      return;
    }
    if (findOverlappingPlanShift([...(planShifts || []), ...drafts], candidate)) {
      skipped.push({ ...candidate, powod: "kolizja godzin" });
      return;
    }
    drafts.push(candidate);
  });
  return { drafts, skipped };
};

// Publikacja grafiku — jedno kliknięcie wysyła WSZYSTKO, co jeszcze nie
// poszło, od podanego dnia w przód (domyślnie od dziś; wysyłanie zmian
// sprzed tygodnia nie ma sensu). Świadoma zmiana względem pierwszej wersji,
// która publikowała tylko oglądany tydzień: przy planowaniu na kilka
// tygodni naprzód łatwo było zapomnieć wrócić i wysłać kolejny tydzień, a
// niewysłana zmiana jest dla pracownika po prostu niewidoczna.
//
// Jedno powiadomienie na OSOBĘ, nie na zmianę — pięć zmian to nadal jedna
// informacja "grafik gotowy". Jedyne miejsce, które publikuje grafik.
export const publishGrafik = async ({ planShifts, lokaleNames, from, actorName }) => {
  const toPublish = (planShifts || []).filter(
    (s) => lokaleNames.includes(s.lokal) && s.date >= from && isUnpublished(s)
  );
  if (toPublish.length === 0) return { updated: [], powiadomieni: 0 };

  const now = new Date().toISOString();
  const doUsuniecia = toPublish.filter((s) => s.deleted_at);
  const doWyslania = toPublish.filter((s) => !s.deleted_at);

  const updated = [];
  for (const s of doWyslania) {
    updated.push(await api.patch("grafik_shifts", s.id, { published_at: now }));
  }
  // Wiersze oznaczone do usunięcia znikają dopiero teraz — do tego momentu
  // były potrzebne, żeby wiedzieć, komu i o czym powiedzieć.
  const usuniete = [];
  for (const s of doUsuniecia) {
    await api.delete("grafik_shifts", s.id);
    usuniete.push(s);
  }

  // Zakres liczymy PER OSOBA — każdy dostaje informację o swoich dniach,
  // a nie o całym zakresie, jaki akurat wysłał kierownik.
  const opts = { day: "numeric", month: "long" };
  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("pl-PL", opts);
  const names = [...new Set(toPublish.map((s) => s.user_name).filter(Boolean))];
  for (const name of names) {
    const dni = doWyslania
      .filter((s) => s.user_name === name)
      .map((s) => s.date)
      .sort();
    const skasowane = usuniete
      .filter((s) => s.user_name === name)
      .map((s) => s.date)
      .sort();
    const czesci = [];
    if (dni.length > 0) {
      const zakres =
        dni[0] === dni[dni.length - 1]
          ? fmt(dni[0])
          : `${fmt(dni[0])} – ${fmt(dni[dni.length - 1])}`;
      czesci.push(`masz zmiany na ${zakres}`);
    }
    if (skasowane.length > 0) {
      czesci.push(
        `usunięto ${skasowane.length === 1 ? "zmianę" : "zmiany"} z ${[
          ...new Set(skasowane),
        ]
          .map(fmt)
          .join(", ")}`
      );
    }
    await createEmployeeNotification(
      name,
      `Grafik zaktualizowany — ${czesci.join("; ")}. Sprawdź zakładkę Grafik.${
        actorName ? ` Wysłał(a): ${actorName}.` : ""
      }`,
      "grafik"
    );
  }
  return { updated, usuniete, powiadomieni: names.length };
};

// --- WIDOK PRACOWNIKA ---------------------------------------------------
// Pracownik widzi WYŁĄCZNIE opublikowane zmiany. Wersja robocza kierownika
// (published_at = null) nie może do niego przeciekać — filtrujemy tu, w
// jednym miejscu, a nie w każdym z dwóch dashboardów osobno.
export const publishedShiftsFor = (planShifts, user) =>
  (planShifts || []).filter(
    (s) =>
      s.published_at &&
      !s.deleted_at &&
      (s.user_id && user?.id
        ? String(s.user_id) === String(user.id)
        : s.user_name === user?.name)
  );

// Wszystkie opublikowane zmiany danego dnia w danym lokalu — "kto jeszcze
// jest ze mną na zmianie".
export const publishedShiftsOnDay = (planShifts, lokal, dateStr) =>
  (planShifts || []).filter(
    (s) => s.published_at && !s.deleted_at && s.lokal === lokal && s.date === dateStr
  );

// Najbliższa zmiana od podanego dnia włącznie — odpowiedź na pytanie, które
// pracownik zadaje najczęściej: "kiedy następnym razem pracuję".
export const nextShiftFrom = (planShifts, user, fromDate) =>
  publishedShiftsFor(planShifts, user)
    .filter((s) => s.date >= fromDate)
    .sort((a, b) =>
      a.date === b.date
        ? trimTime(a.start_time).localeCompare(trimTime(b.start_time))
        : a.date.localeCompare(b.date)
    )[0] || null;

// --- STANOWISKA PRACOWNIKA ---------------------------------------------
// `allowed_stanowiska` jest tekstem rozdzielonym przecinkami, dokładnie jak
// istniejące `allowed_lokale` (patrz ManagerDashboard.tsx — join/split), a
// NIE tablicą Postgresa, mimo zapisu "[]" w CLAUDE.md.
// Sama zawartość kolumny, BEZ doklejonego default_stanowisko — tej wersji
// używamy przy zapisie, żeby nie duplikować stanowiska domyślnego w liście.
export const storedStanowiskaArr = (user) => {
  const raw = user?.allowed_stanowiska;
  const list = Array.isArray(raw)
    ? raw
    : raw
    ? String(raw).split(",").map((s) => s.trim())
    : [];
  return [...new Set(list.filter(Boolean))];
};

// Wersja do odczytu — stanowisko domyślne zawsze liczy się jako "umie".
export const allowedStanowiskaArr = (user) => {
  if (!user) return [];
  const withDefault = user.default_stanowisko
    ? [user.default_stanowisko, ...storedStanowiskaArr(user)]
    : storedStanowiskaArr(user);
  return [...new Set(withDefault.filter(Boolean))];
};

// Czy pracownik "umie" pracować na tym stanowisku. Odpowiedź NIE blokuje —
// służy tylko do żółtego ostrzeżenia, decyzję podejmuje kierownik
// (ustalenie właściciela, patrz docs/GRAFIK.md).
export const knowsStanowisko = (user, stanowisko) =>
  !stanowisko || allowedStanowiskaArr(user).includes(stanowisko);

export { toLocalYMD };
