// @ts-nocheck
// Dziennik dnia ("Puls") — karta dnia, wpisy HACCP i trafność prognozy.
//
// Zasada, z której wynika cała reszta: karta ma się zamykać w 60–90 sekund.
// Wszystko, co system potrafi policzyć sam (godziny, koszt, obsada, zadania,
// pogoda), NIE jest polem do wypełnienia — jest podsumowaniem, które kierownik
// tylko potwierdza. Ręcznie wpisuje się wyłącznie to, czego system nie wie:
// utarg, temperatury, dostawę, notatkę dla następnej zmiany.
//
// Cała arytmetyka dnia żyje tutaj. KartaDnia.tsx ma tylko rysować.

import { api } from "../api/supabase";
import { toLocalYMD } from "../api/googleSheets";
import {
  shiftHours,
  checkDayCoverage,
  problemyObsady,
  timeToMin,
  minToTime,
} from "./grafik";
import { isTaskDueOn, findSharedCompletion, parseDaysOfWeek } from "./tasks";

export const PORY = [
  { key: "poranne", label: "Rano" },
  { key: "obiadowe", label: "Popołudnie" },
  { key: "wieczorne", label: "Wieczór" },
  { key: "ogolne", label: "Dowolna pora" },
];

export const TYPY_WPISU = [
  { key: "temperatura", label: "Temperatura", ikona: "🌡️" },
  { key: "dostawa", label: "Dostawa", ikona: "📦" },
  { key: "sprzatanie", label: "Sprzątanie", ikona: "🧽" },
  { key: "incydent", label: "Zdarzenie", ikona: "⚠️" },
  { key: "inne", label: "Inne", ikona: "📝" },
];

// Próg "realnie padało" przy ocenie prognozy. 1 mm na dobę to granica, poniżej
// której deszcz nie zmienia niczego w obłożeniu ogródka — a właśnie o to
// pytamy prognozę, nie o meteorologiczną dokładność.
export const PROG_DESZCZU_MM = 1.0;

export const znajdzKarte = (dayLogs, lokal, dateStr) =>
  (dayLogs || []).find((k) => k.lokal === lokal && k.date === dateStr) || null;

export const wpisyDlaDnia = (entries, lokal, dateStr) =>
  (entries || [])
    .filter((w) => w.lokal === lokal && w.date === dateStr)
    // Korekta to nowy wiersz wskazujący na stary (HACCP — zapisu nie wolno
    // cicho nadpisać). W widoku pokazujemy tylko wersje aktualne, czyli te,
    // do których nikt się nie odwołał jako do poprzedniej.
    .filter((w) => !(entries || []).some((inny) => inny.corrected_from === w.id))
    .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));

// Które pozycje trzeba dziś wpisać w tym lokalu. Dni tygodnia liczy ta sama
// funkcja co w zadaniach (parseDaysOfWeek) — jeden słownik, jeden format.
export const szablonyNaDzien = (templates, lokal, dateStr) => {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return (templates || [])
    .filter((t) => t.lokal === lokal && !t.archived)
    .filter((t) => {
      // parseDaysOfWeek zwraca null, gdy dni nie ustawiono — a to znaczy
      // "codziennie", nie "nigdy" (ta sama konwencja co w zadaniach).
      const dni = parseDaysOfWeek(t);
      return !dni || dni.includes(dow);
    })
    .sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
};

export const polaSzablonu = (szablon) => {
  try {
    const p = typeof szablon.pola === "string" ? JSON.parse(szablon.pola) : szablon.pola;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

// Wartość poza normą z definicji szablonu (min/max) — lodówka na 12 °C ma się
// rzucać w oczy, a nie leżeć w tabeli jako zwykła liczba.
export const pozaNorma = (szablon, payload) =>
  polaSzablonu(szablon).some((pole) => {
    const v = payload && payload[pole.klucz];
    if (v === "" || v == null || pole.typ !== "number") return false;
    const n = Number(v);
    if (Number.isNaN(n)) return false;
    return (pole.min != null && n < pole.min) || (pole.max != null && n > pole.max);
  });

// Podpis normy pod nazwą wpisu. Sam myślnik ("–4 °C") czytał się jak liczba
// ujemna, gdy zdefiniowano tylko górną granicę.
export const opisNormy = (pole) => {
  const j = pole.jednostka || "";
  if (pole.min != null && pole.max != null) return `${pole.min}–${pole.max}${j}`;
  if (pole.max != null) return `do ${pole.max}${j}`;
  if (pole.min != null) return `od ${pole.min}${j}`;
  return "";
};

// --- AUTOMATYCZNE PODSUMOWANIE DNIA -------------------------------------
// Nic tu nie jest przechowywane w bazie: liczymy w locie z tego, co i tak już
// mamy. Dzięki temu karta sprzed pół roku pokazuje te same liczby co dziś,
// nawet jeśli kierownik zapomniał ją zamknąć.
export const autoPodsumowanie = ({
  shifts,
  planShifts,
  users,
  tasks,
  taskCompletions,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  lokal,
  dateStr,
}) => {
  const naDzis = (shifts || []).filter(
    (s) =>
      s.lokal === lokal &&
      !s.is_urlop &&
      s.start_time &&
      toLocalYMD(s.start_time) === dateStr
  );

  const stawki = {};
  (users || []).forEach((u) => {
    if (u.stawka != null && u.stawka !== "") stawki[u.name] = Number(u.stawka);
  });

  let godzinyFakt = 0;
  let koszt = 0;
  const bezStawki = new Set();
  const trwajace = [];
  naDzis.forEach((s) => {
    if (!s.end_time) {
      trwajace.push(s.user_name);
      return;
    }
    const h = (s.end_time - s.start_time) / 3600000;
    godzinyFakt += h;
    if (stawki[s.user_name] != null) koszt += h * stawki[s.user_name];
    else bezStawki.add(s.user_name);
  });

  const plan = (planShifts || []).filter(
    (s) => s.lokal === lokal && s.date === dateStr && !s.deleted_at
  );
  const godzinyPlan = plan.reduce((sum, s) => sum + shiftHours(s), 0);

  // Faktyczne otwarcie i zamknięcie — z odbić, nie z godzin otwarcia lokalu.
  // To jedna z niewielu rzeczy, których nie widać nigdzie indziej: czy dzień
  // naprawdę zaczął się o tej godzinie, o której miał.
  const starty = naDzis.map((s) => s.start_time.getTime());
  const konce = naDzis.filter((s) => s.end_time).map((s) => s.end_time.getTime());
  const hhmm = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const zadaniaDnia = (tasks || []).filter(
    (t) =>
      t.lokal === lokal &&
      t.active &&
      !t.archived &&
      isTaskDueOn(t, taskCompletions, dateStr)
  );
  const zrobione = zadaniaDnia.filter((t) =>
    findSharedCompletion(taskCompletions, t.id, dateStr)
  ).length;

  const obsada = checkDayCoverage(
    {
      rules: staffingRules,
      ruleSets: staffingRuleSets,
      wyjatki: grafikWyjatki,
      planShifts,
    },
    lokal,
    dateStr
  );

  return {
    osoby: [...new Set(naDzis.map((s) => s.user_name))],
    trwajace,
    godzinyFakt: Math.round(godzinyFakt * 10) / 10,
    godzinyPlan: Math.round(godzinyPlan * 10) / 10,
    koszt: Math.round(koszt),
    // Koszt bez tych osób jest zaniżony — mówimy o tym wprost zamiast liczyć
    // brak stawki jako zero (ta sama zasada co w Raportach i kosztach).
    bezStawki: [...bezStawki],
    otwarcie: starty.length ? hhmm(Math.min(...starty)) : null,
    zamkniecie: konce.length ? hhmm(Math.max(...konce)) : null,
    zadaniaRazem: zadaniaDnia.length,
    zadaniaZrobione: zrobione,
    problemy: problemyObsady(obsada),
  };
};

export const sredniCzek = (obrot, paragony) => {
  const o = Number(obrot);
  const p = Number(paragony);
  if (!o || !p) return null;
  return Math.round((o / p) * 100) / 100;
};

// Udział kosztu pracy w utargu — najważniejsza liczba dnia dla właściciela.
// W gastronomii zdrowy przedział to mniej więcej 25–35%.
export const labourCostPct = (koszt, obrot) => {
  const o = Number(obrot);
  if (!o) return null;
  return Math.round((koszt / o) * 1000) / 10;
};

// --- ZAPIS --------------------------------------------------------------
// Świadomie bez upsertu: mamy karty załadowane w pamięci, więc wiemy, czy to
// PATCH czy POST. Unikalny indeks (lokal, date) w bazie i tak łapie wyścig,
// gdyby dwie osoby zamykały ten sam dzień równocześnie.

export const zapiszKarte = async ({ karta, lokal, dateStr, pola, dayLogs, setDayLogs }) => {
  if (karta && karta.id) {
    const zapisana = await api.patch("day_logs", karta.id, pola);
    setDayLogs((dayLogs || []).map((k) => (k.id === karta.id ? zapisana : k)));
    return zapisana;
  }
  const zapisana = await api.post("day_logs", { lokal, date: dateStr, ...pola });
  setDayLogs([...(dayLogs || []), zapisana]);
  return zapisana;
};

export const zamknijDzien = async ({ karta, lokal, dateStr, pola, kto, dayLogs, setDayLogs }) =>
  zapiszKarte({
    karta,
    lokal,
    dateStr,
    dayLogs,
    setDayLogs,
    pola: {
      ...pola,
      status: "zamkniety",
      closed_by: kto,
      closed_at: new Date().toISOString(),
    },
  });

export const zapiszWpis = async ({
  lokal,
  dateStr,
  karta,
  typ,
  templateKey,
  payload,
  kto,
  entries,
  setEntries,
}) => {
  const wpis = await api.post("day_log_entries", {
    lokal,
    date: dateStr,
    day_log_id: karta && karta.id ? String(karta.id) : null,
    typ,
    template_key: templateKey || null,
    payload,
    recorded_by: kto,
  });
  setEntries([...(entries || []), wpis]);
  return wpis;
};

// Poprawka wpisu HACCP to NOWY wiersz wskazujący na stary — nigdy update na
// miejscu. Zapis, który da się cicho przepisać dzień później, nie jest
// dowodem niczego.
export const poprawWpis = async ({ stary, payload, powod, kto, entries, setEntries }) => {
  const wpis = await api.post("day_log_entries", {
    lokal: stary.lokal,
    date: stary.date,
    day_log_id: stary.day_log_id,
    typ: stary.typ,
    template_key: stary.template_key,
    payload,
    recorded_by: kto,
    corrected_from: stary.id,
    corrected_reason: powod || null,
  });
  setEntries([...(entries || []), wpis]);
  return wpis;
};

// --- TRAFNOŚĆ PROGNOZY --------------------------------------------------
// Odpowiada na jedno pytanie: na ile dni naprzód prognoza jest jeszcze warta
// tego, żeby układać według niej obsadę. horizon_days = 0 to stan faktyczny,
// więc porównujemy wiersze w obrębie (miasto, target_date).
export const trafnoscPrognozy = (forecasts, miasto, odDaty) => {
  const swoje = (forecasts || []).filter(
    (f) => f.miasto === miasto && (!odDaty || f.target_date >= odDaty)
  );
  const fakt = new Map();
  swoje.forEach((f) => {
    if (f.horizon_days === 0) fakt.set(f.target_date, f);
  });
  if (!fakt.size) return [];

  const wgHoryzontu = new Map();
  swoje.forEach((f) => {
    if (f.horizon_days === 0) return;
    if (!fakt.has(f.target_date)) return;
    if (!wgHoryzontu.has(f.horizon_days)) wgHoryzontu.set(f.horizon_days, []);
    wgHoryzontu.get(f.horizon_days).push(f);
  });

  return [...wgHoryzontu.entries()]
    .map(([horyzont, prognozy]) => {
      let bledy = [];
      let trafione = 0;
      let falszywyAlarm = 0;
      let przegapione = 0;
      prognozy.forEach((p) => {
        const f = fakt.get(p.target_date);
        if (p.temp_max != null && f.temp_max != null) {
          bledy.push(Math.abs(Number(p.temp_max) - Number(f.temp_max)));
        }
        if (p.opady_mm != null && f.opady_mm != null) {
          const zapowiedziano = Number(p.opady_mm) >= PROG_DESZCZU_MM;
          const bylo = Number(f.opady_mm) >= PROG_DESZCZU_MM;
          if (zapowiedziano === bylo) trafione += 1;
          else if (zapowiedziano) falszywyAlarm += 1;
          else przegapione += 1;
        }
      });
      const n = trafione + falszywyAlarm + przegapione;
      return {
        horyzont,
        dni: prognozy.length,
        bladTemp: bledy.length
          ? Math.round((bledy.reduce((a, b) => a + b, 0) / bledy.length) * 10) / 10
          : null,
        deszczTrafiony: n ? Math.round((100 * trafione) / n) : null,
        falszywyAlarm: n ? Math.round((100 * falszywyAlarm) / n) : null,
        przegapiony: n ? Math.round((100 * przegapione) / n) : null,
      };
    })
    .sort((a, b) => a.horyzont - b.horyzont);
};

export const prognozaNaDzien = (forecasts, miasto, dateStr, horyzont) =>
  (forecasts || []).find(
    (f) =>
      f.miasto === miasto && f.target_date === dateStr && f.horizon_days === horyzont
  ) || null;

export { toLocalYMD, timeToMin, minToTime };
