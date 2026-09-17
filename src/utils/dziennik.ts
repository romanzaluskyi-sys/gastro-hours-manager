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
import { zadaniaNaDzien, findSharedCompletion, parseDaysOfWeek } from "./tasks";
import { kosztGodziny } from "./budzet";
import {
  TYPY_POLA,
  slugKlucza,
  polaSzablonu,
  opisNormy,
  wartoscPolaTekst,
  pozaNormaPola,
} from "./pola";

// Definicja pól wpisu jest wspólna z zadaniami z pomiarem (utils/pola.ts) —
// re-eksport, żeby dotychczasowe importy z tego pliku dalej działały.
export { TYPY_POLA, slugKlucza, polaSzablonu, opisNormy };
export const wartoscPola = wartoscPolaTekst;

// Każda z tych funkcji dostaje stan i jego setter z góry, przez cztery
// poziomy propsów (App -> ManagerDashboard -> KartaDnia -> PulsSzablony).
// Gubiony po drodze setter daje w zminifikowanej produkcji komunikat w
// rodzaju "i is not a function (in 'i([...s||[],r])')", z którego nikt —
// łącznie z nami — nie odczyta, o co chodzi. Stąd ta straż: zamiast tego
// pada zdanie mówiące wprost, którego propsa brakuje.
const wymagajSettera = (fn, nazwaPropsa) => {
  if (typeof fn !== "function") {
    throw new Error(
      `Zapis nie doszedł do skutku: brakuje propsa ${nazwaPropsa}. ` +
        "Dane NIE zostały zapisane — zgłoś to, to błąd w aplikacji, nie w Twoich danych."
    );
  }
};

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

export const przesun = (dateStr, delta) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toLocalYMD(d);
};

export const znajdzKarte = (dayLogs, lokal, dateStr) =>
  (dayLogs || []).find((k) => k.lokal === lokal && k.date === dateStr) || null;

export const wpisyDlaDnia = (entries, lokal, dateStr) =>
  (entries || [])
    .filter((w) => w.lokal === lokal && w.date === dateStr && w.typ !== "korekta")
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

// Wartość poza normą z definicji szablonu — sprawdzenie żyje w utils/pola.ts,
// bo tak samo działa dla pól zadania z pomiarem.
export const pozaNorma = (szablon, payload) =>
  pozaNormaPola(polaSzablonu(szablon), payload);

// --- SZABLONY WPISÓW ----------------------------------------------------

// Gotowy zestaw startowy. Wpisanie sześciu pozycji ręcznie dla każdego lokalu
// to dokładnie ta praca, przez którą wdrożenie u nowego klienta rozciąga się
// z dwudziestu minut na godzinę — a zestaw jest w gastronomii ten sam.
// Kierownik dokłada własne pozycje, gdy potrzebuje czegoś specyficznego.
export const SZABLONY_STARTOWE = [
  {
    klucz: "lodowka",
    nazwa: "Lodówka kuchnia",
    typ: "temperatura",
    pora: "poranne",
    pola: [{ klucz: "temperatura", label: "Temperatura", typ: "number", jednostka: "°C", min: 0, max: 5 }],
  },
  {
    klucz: "zamrazarka",
    nazwa: "Zamrażarka",
    typ: "temperatura",
    pora: "poranne",
    pola: [{ klucz: "temperatura", label: "Temperatura", typ: "number", jednostka: "°C", min: -25, max: -18 }],
  },
  {
    klucz: "dostawa",
    nazwa: "Przyjęcie dostawy",
    typ: "dostawa",
    pora: "ogolne",
    pola: [
      { klucz: "dostawca", label: "Dostawca", typ: "text" },
      { klucz: "temperatura", label: "Temperatura towaru", typ: "number", jednostka: "°C", max: 4 },
      { klucz: "uwagi", label: "Stan towaru", typ: "text" },
    ],
  },
  {
    klucz: "wydanie",
    nazwa: "Temperatura wydania",
    typ: "temperatura",
    pora: "obiadowe",
    pola: [{ klucz: "temperatura", label: "Temperatura", typ: "number", jednostka: "°C", min: 63 }],
  },
  {
    klucz: "olej",
    nazwa: "Olej we frytkownicy",
    typ: "sprzatanie",
    pora: "wieczorne",
    pola: [
      { klucz: "wymieniony", label: "Wymieniony", typ: "bool" },
      { klucz: "uwagi", label: "Uwagi", typ: "text" },
    ],
  },
  {
    klucz: "sprzatanie_koncowe",
    nazwa: "Sprzątanie końcowe",
    typ: "sprzatanie",
    pora: "wieczorne",
    pola: [
      { klucz: "wykonane", label: "Wykonane", typ: "bool" },
      { klucz: "uwagi", label: "Uwagi", typ: "text" },
    ],
  },
];

export const zapiszSzablon = async ({ szablon, lokal, templates, setTemplates }) => {
  wymagajSettera(setTemplates, "setDayLogTemplates");
  const dane = {
    lokal,
    klucz: szablon.klucz || slugKlucza(szablon.nazwa),
    nazwa: szablon.nazwa,
    typ: szablon.typ || "inne",
    pora: szablon.pora || "ogolne",
    days_of_week: szablon.days_of_week || null,
    wymagany: szablon.wymagany !== false,
    pola: szablon.pola || [],
    kolejnosc: szablon.kolejnosc ?? (templates || []).length,
  };
  if (szablon.id) {
    const zapisany = await api.patch("day_log_templates", szablon.id, dane);
    setTemplates((templates || []).map((s) => (s.id === szablon.id ? zapisany : s)));
    return zapisany;
  }
  const zapisany = await api.post("day_log_templates", dane);
  setTemplates([...(templates || []), zapisany]);
  return zapisany;
};

// Archiwizujemy, nie kasujemy — wpisy z poprzednich miesięcy odwołują się do
// szablonu przez template_key i muszą dalej mieć skąd wziąć nazwę i normy.
export const archiwizujSzablon = async ({ szablon, templates, setTemplates }) => {
  wymagajSettera(setTemplates, "setDayLogTemplates");
  const zapisany = await api.patch("day_log_templates", szablon.id, { archived: true });
  setTemplates((templates || []).map((s) => (s.id === szablon.id ? zapisany : s)));
  return zapisany;
};

// Zamknięta lista — po powodach będziemy filtrować i liczyć, więc wolny tekst
// (który i tak jest obok, w komentarzu) nie może być jedynym nośnikiem.
export const POWODY_UTARGU = [
  { key: "pogoda", label: "Pogoda" },
  { key: "wydarzenie", label: "Wydarzenie / święto" },
  { key: "akcja", label: "Akcja, promocja" },
  { key: "personel", label: "Personel" },
  { key: "inne", label: "Inne" },
];

export const KATEGORIE_ZDARZENIA = [
  { key: "skarga_goscia", label: "Skarga gościa" },
  { key: "konflikt", label: "Konflikt personelu" },
  { key: "wypadek", label: "Wypadek lub uraz" },
  { key: "bezpieczenstwo_zywnosci", label: "Bezpieczeństwo żywności" },
  { key: "kradziez", label: "Kradzież lub niedobór" },
  { key: "awaria", label: "Awaria sprzętu" },
  { key: "kontrola", label: "Kontrola urzędowa" },
  { key: "inne", label: "Inne" },
];

// --- KOREKTY ZAMKNIĘTEGO DNIA -------------------------------------------
// Zamkniętego dnia nie edytujemy w miejscu. Poprawka to osobny zapis: stara
// wartość, nowa i powód. Bez tego "utarg 4800" po tygodniu nie znaczy nic —
// nie wiadomo, czy tak było, czy ktoś to potem podmienił.
export const POLA_KOREKTY = [
  { klucz: "obrot", label: "Utarg brutto", typ: "number" },
  { klucz: "liczba_paragonow", label: "Liczba paragonów", typ: "number" },
  { klucz: "obrot_powod", label: "Powód odchylenia", typ: "text" },
  { klucz: "obrot_komentarz", label: "Komentarz do utargu", typ: "text" },
  { klucz: "handover", label: "Notatka dla następnej zmiany", typ: "text" },
  { klucz: "tagi", label: "Tagi dnia", typ: "text" },
  { klucz: "notatka", label: "Opis zdarzenia nadzwyczajnego", typ: "text" },
];

export const korektyDnia = (entries, lokal, dateStr) =>
  (entries || [])
    .filter((w) => w.lokal === lokal && w.date === dateStr && w.typ === "korekta")
    .sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));

export const poprawZamknietyDzien = async ({
  karta, pole, nowaWartosc, powod, kto,
  dayLogs, setDayLogs, entries, setEntries,
}) => {
  wymagajSettera(setDayLogs, "setDayLogs");
  wymagajSettera(setEntries, "setDayLogEntries");
  const opis = (POLA_KOREKTY.find((p) => p.klucz === pole) || {}).label || pole;
  const stare = karta[pole] ?? null;

  // Ślad idzie PIERWSZY. Gdyby zapis liczby się udał, a ślad nie, zostałaby
  // po cichu zmieniona wartość bez wyjaśnienia — czyli dokładnie to, przed
  // czym ta funkcja ma chronić.
  const wpis = await api.post("day_log_entries", {
    lokal: karta.lokal,
    date: karta.date,
    day_log_id: String(karta.id),
    typ: "korekta",
    payload: { pole, label: opis, stare, nowe: nowaWartosc, powod },
    recorded_by: kto,
  });
  const zapisana = await api.patch("day_logs", karta.id, { [pole]: nowaWartosc });
  setEntries([...(entries || []), wpis]);
  setDayLogs((dayLogs || []).map((k) => (k.id === karta.id ? zapisana : k)));
  return zapisana;
};

// --- AUTOMATYCZNE PODSUMOWANIE DNIA -------------------------------------
// Nic tu nie jest przechowywane w bazie: liczymy w locie z tego, co i tak już
// mamy. Dzięki temu karta sprzed pół roku pokazuje te same liczby co dziś,
// nawet jeśli kierownik zapomniał ją zamknąć.
export const autoPodsumowanie = ({
  shifts,
  planShifts,
  users,
  lokalRow,
  tasks,
  taskBlocks,
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

  // Koszt godziny liczy utils/budzet.ts — ta sama funkcja, którą liczy Grafik.
  // Do 0.39.0 stała tu goła `users.stawka`, więc etatowiec bez stawki godzinowej
  // wchodził do kosztu dnia jako ZERO i labour cost lokalu z samymi etatami
  // wyglądał na idealny. Teraz przy umowie o pracę bierzemy kwotę z umowy
  // podzieloną przez normę miesiąca, plus narzut pracodawcy z konfiguracji
  // lokalu — czyli to, ile lokal naprawdę wydaje.
  const [rokDnia, miesDnia] = dateStr.split("-").map(Number);
  const stawkaOsoby = (nazwa, userId) => {
    const u = (users || []).find(
      (x) => (userId != null && String(x.id) === String(userId)) || x.name === nazwa
    );
    return u ? kosztGodziny(u, lokalRow, rokDnia, miesDnia) : null;
  };

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
    const st = stawkaOsoby(s.user_name, s.user_id);
    if (st != null) koszt += h * st;
    else bezStawki.add(s.user_name);
  });

  const plan = (planShifts || []).filter(
    (s) => s.lokal === lokal && s.date === dateStr && !s.deleted_at
  );
  const godzinyPlan = plan.reduce((sum, s) => sum + shiftHours(s), 0);
  // Koszt planowany liczymy z tych samych stawek co faktyczny — inaczej
  // różnica plan/fakt mieszałaby dwie rzeczy naraz: inne godziny i inne stawki.
  const kosztPlan = plan.reduce(
    (sum, s) => sum + shiftHours(s) * (stawkaOsoby(s.user_name, s.user_id) ?? 0),
    0
  );

  // Faktyczne otwarcie i zamknięcie — z odbić, nie z godzin otwarcia lokalu.
  // To jedna z niewielu rzeczy, których nie widać nigdzie indziej: czy dzień
  // naprawdę zaczął się o tej godzinie, o której miał.
  const starty = naDzis.map((s) => s.start_time.getTime());
  const konce = naDzis.filter((s) => s.end_time).map((s) => s.end_time.getTime());
  const hhmm = (ms) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // Co było dziś do zrobienia — liczy to blokami utils/tasks.ts, jedyne
  // miejsce znające rozkład (od 0.37.0 siedzi on na bloku, nie na zadaniu).
  const zadaniaDnia = zadaniaNaDzien({
    tasks,
    blocks: taskBlocks,
    completions: taskCompletions,
    lokal,
    dateStr,
    forManager: null,
  }).map((i) => i.task);
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
    kosztPlan: Math.round(kosztPlan),
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

// Stan zamknięcia dnia w każdym z lokali — do paska na Pulpicie. Kierownik
// ma zobaczyć zaległość od razu po wejściu do panelu, a nie dopiero wtedy,
// gdy sam sobie przypomni o zakładce.
export const stanKartDnia = ({ dayLogs, lokaleNames, dateStr }) =>
  (lokaleNames || []).map((lokal) => {
    const karta = znajdzKarte(dayLogs, lokal, dateStr);
    return {
      lokal,
      karta,
      zamkniety: !!karta && karta.status === "zamkniety",
    };
  });

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
  wymagajSettera(setDayLogs, "setDayLogs");
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
  wymagajSettera(setEntries, "setDayLogEntries");
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
  wymagajSettera(setEntries, "setDayLogEntries");
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


// --- POPRAWKI WPISÓW ----------------------------------------------------
// Korekta wpisu to NOWY wiersz wskazujący na stary (corrected_from) — w widoku
// pokazujemy tylko wersję aktualną, więc bez tych funkcji poprawiona wartość
// wygląda dokładnie jak wpisana za pierwszym razem. Ślad jest w bazie, ale nikt
// go nie widzi, czyli dla celu, dla którego powstał (dowód HACCP), nie istnieje.
//
// ⚠️ Podawaj tu PEŁNĄ listę wpisów, nie wynik wpisyDlaDnia() — ta odfiltrowuje
// wersje poprzednie, czyli dokładnie te, których tu szukamy.
export const poprzedniaWersja = (wpis, entries) =>
  wpis && wpis.corrected_from
    ? (entries || []).find((w) => String(w.id) === String(wpis.corrected_from)) || null
    : null;

export const liczbaPoprawek = (wpis, entries) => {
  let ile = 0;
  let biezacy = wpis;
  while (biezacy && biezacy.corrected_from) {
    const starszy = poprzedniaWersja(biezacy, entries);
    if (!starszy) break;
    ile += 1;
    biezacy = starszy;
  }
  return ile;
};

// Podpis pod poprawioną wartością: co było, dlaczego i kto zmienił.
// Zwraca null dla wpisu, którego nikt nie poprawiał — wtedy nic nie rysujemy.
export const opisPoprawki = (wpis, entries, pola) => {
  const stary = poprzedniaWersja(wpis, entries);
  if (!stary) return null;
  return {
    bylo: (pola || []).map((p) => wartoscPolaTekst(p, stary.payload || {})).join(" / "),
    // Dwie różne osoby i dlatego dwa pola: kto wpisał pierwotną wartość i kto
    // ją zmienił. Bez rozróżnienia podpis powtarzałby to, co i tak stoi w
    // wierszu obok, albo gubił autora poprawki.
    ktoStary: stary.recorded_by || "",
    kto: wpis.recorded_by || "",
    powod: wpis.corrected_reason || "",
    ile: liczbaPoprawek(wpis, entries),
  };
};

// --- PROGNOZA UTARGU I ZESTAWIENIA ---------------------------------------

// Najprostsza prognoza, jaka ma jakikolwiek sens: średnia z tego samego dnia
// tygodnia w ostatnich czterech takich dniach. Świadomie NIE jest to model —
// prawdziwe prognozowanie to Etap E i wymaga historii, której jeszcze nie ma.
// Ta liczba ma tylko dać kierownikowi punkt odniesienia: "sobota wyszła wyżej
// czy niżej niż zwykle". Zwraca null, dopóki nie ma z czego liczyć.
export const PROGNOZA_MIN_DNI = 2;
export const prognozaUtargu = (dayLogs, lokal, dateStr) => {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const wczesniej = (dayLogs || [])
    .filter(
      (k) =>
        k.lokal === lokal &&
        k.date < dateStr &&
        k.obrot != null &&
        Number(k.obrot) > 0 &&
        new Date(k.date + "T00:00:00").getDay() === dow
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  if (wczesniej.length < PROGNOZA_MIN_DNI) return null;
  const suma = wczesniej.reduce((s, k) => s + Number(k.obrot), 0);
  return {
    kwota: Math.round(suma / wczesniej.length),
    zIlu: wczesniej.length,
  };
};

// Wiersz listy dni. Pomijamy kontrolę obsady — dla dnia, który już był, nie
// zmienia decyzji kierownika, a liczy się najdrożej z całego podsumowania.
export const wierszDnia = ({
  shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
  dayLogs, dayLogEntries, dayLogTemplates, weatherForecasts,
  lokal, lokalRow, miasto, dateStr,
}) => {
  const auto = autoPodsumowanie({
    shifts, planShifts, users, lokalRow, tasks, taskBlocks, taskCompletions,
    staffingRules: [], staffingRuleSets: [], grafikWyjatki: [],
    lokal, dateStr,
  });
  const karta = znajdzKarte(dayLogs, lokal, dateStr);
  const obrot = karta && karta.obrot != null ? Number(karta.obrot) : null;
  const prognoza = prognozaUtargu(dayLogs, lokal, dateStr);
  const szablony = szablonyNaDzien(dayLogTemplates, lokal, dateStr);
  const wpisy = wpisyDlaDnia(dayLogEntries, lokal, dateStr);
  return {
    date: dateStr,
    karta,
    zamkniety: !!karta && karta.status === "zamkniety",
    obrot,
    prognozaUtargu: prognoza,
    roznicaUtargu: obrot != null && prognoza ? obrot - prognoza.kwota : null,
    koszt: auto.koszt,
    kosztPlan: auto.kosztPlan,
    roznicaKosztu: auto.koszt - auto.kosztPlan,
    lcPct: labourCostPct(auto.koszt, obrot),
    godziny: auto.godzinyFakt,
    godzinyPlan: auto.godzinyPlan,
    zadaniaZrobione: auto.zadaniaZrobione,
    zadaniaRazem: auto.zadaniaRazem,
    wpisyZrobione: szablony.filter((s) => wpisy.some((w) => w.template_key === s.klucz)).length,
    wpisyRazem: szablony.length,
    pogodaFakt: prognozaNaDzien(weatherForecasts, miasto, dateStr, 0),
    pogodaZTygodnia: prognozaNaDzien(weatherForecasts, miasto, dateStr, 7),
  };
};

// Tydzień to suma dni, nie osobny byt — raport liczymy z tych samych wierszy,
// które widać na liście. Dzięki temu nie da się mieć raportu, który mówi co
// innego niż dni, z których powstał.
export const raportTygodnia = (wiersze) => {
  const zUtargiem = wiersze.filter((w) => w.obrot != null);
  const suma = (f) => wiersze.reduce((s, w) => s + (f(w) || 0), 0);
  const obrot = zUtargiem.reduce((s, w) => s + w.obrot, 0);
  const koszt = suma((w) => w.koszt);
  const najlepszy = zUtargiem.slice().sort((a, b) => b.obrot - a.obrot)[0] || null;
  const najslabszy = zUtargiem.slice().sort((a, b) => a.obrot - b.obrot)[0] || null;
  return {
    dni: wiersze.length,
    dniZamkniete: wiersze.filter((w) => w.zamkniety).length,
    dniZUtargiem: zUtargiem.length,
    obrot,
    koszt,
    kosztPlan: suma((w) => w.kosztPlan),
    godziny: Math.round(suma((w) => w.godziny) * 10) / 10,
    godzinyPlan: Math.round(suma((w) => w.godzinyPlan) * 10) / 10,
    lcPct: labourCostPct(koszt, obrot),
    zadaniaZrobione: suma((w) => w.zadaniaZrobione),
    zadaniaRazem: suma((w) => w.zadaniaRazem),
    wpisyZrobione: suma((w) => w.wpisyZrobione),
    wpisyRazem: suma((w) => w.wpisyRazem),
    najlepszy,
    najslabszy,
  };
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
