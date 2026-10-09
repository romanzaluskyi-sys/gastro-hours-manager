// Dane wersji demonstracyjnej (demo.shiftro.pl, 0.72.0).
//
// `generuj({ dzis, teraz })` zwraca komplet wierszy dla pustej bazy: dwa lokale,
// ~20 osób, półtora miesiąca godzin, grafik na dwa tygodnie w przód, zadania,
// Puls i — co najważniejsze — po jednej sprawie w KAŻDEJ kolejce, którą
// kierownik ma pod ręką (korekta, zapomniane odbicie, brak odbicia, zmiana bez
// końca, osoba na próbę, wniosek o wolne, giełda, zgłoszenie). Demo, w którym
// „Do decyzji” jest puste, nie pokazuje, po co ta aplikacja istnieje.
//
// ⚠️ Wszystko liczy się od `dzis` — reset co noc przesuwa dane razem z
// kalendarzem, więc demo zawsze wygląda „na żywo”. Żadnej daty na sztywno.
//
// ⚠️ Losowość jest DETERMINISTYCZNA (ziarno = data), a id osób, lokali i
// stanowisk liczą się z nazwy, więc są TE SAME po każdym resecie. Karta otwarta
// w trakcie resetu z przycisku dalej wskazuje właściwe osoby, a sprawdzian
// (`harness-demo.html`) może porównywać wynik z liczbami policzonymi ręcznie.
//
// ⚠️ Kształt wierszy musi się zgadzać ze schematem z migracji —
// `harness-demo.html` czyta `docs/sql/migrations/*.sql` i sprawdza, że każda
// kolumna, którą tu wpisujemy, istnieje. Dokładając tabelę albo kolumnę,
// puść harness.
//
// Zwykły CommonJS, bez importów z src/ (patrz CLAUDE.md, sekcja "Cron").
// Bloki zadań i szablony Pulsu są KOPIĄ `BLOKI_STARTOWE` (utils/tasks.ts) i
// `SZABLONY_STARTOWE` (utils/dziennik.ts) — nie muszą się z nimi zgadzać co do
// litery, to są dane przykładowe, nie reguła.

const C = require("./czas");
const K = require("./demoKonta");

const BISTRO = "Bistro Lipowa";
const PIZZERIA = "Pizzeria Port";

// --- Losowość i identyfikatory ----------------------------------------------

// cyrb128 — cztery 32-bitowe hashe z tekstu. Wystarcza na ziarno i na id.
const cyrb128 = (str) => {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
};

const hex8 = (n) => (n >>> 0).toString(16).padStart(8, "0");

// UUID w formacie v4 (wersja 4, wariant 8–b) liczony z tekstu.
const uuidZ = (tekst) => {
  const h = cyrb128(tekst).map(hex8).join("");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
};

// mulberry32 — losowość z ziarna.
const losowanie = (ziarno) => {
  let a = cyrb128(ziarno)[0];
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (od, doW) => od + Math.floor(r() * (doW - od + 1));
  r.wybierz = (lista) => lista[Math.floor(r() * lista.length)];
  return r;
};

// --- Czas ----------------------------------------------------------------------

const dwa = (n) => String(n).padStart(2, "0");
const min = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (m) => `${dwa(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${dwa(((m % 60) + 60) % 60)}`;
// Chwila (ISO) dla polskiej daty i minut od północy; minuty ≥ 1440 = następny dzień.
const iso = (dzien, minuty) =>
  C.chwila(C.dodajDni(dzien, Math.floor(minuty / 1440)), hhmm(minuty)).toISOString();
const dzienMiesiaca = (dzien) => Number(dzien.slice(8, 10));
const pierwszyPoprzedniegoMiesiaca = (dzien) => {
  let [y, m] = dzien.split("-").map(Number);
  m -= 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${dwa(m)}-01`;
};
const zakres = (od, doW) => {
  const dni = [];
  for (let d = od; d <= doW; d = C.dodajDni(d, 1)) dni.push(d);
  return dni;
};
const roboczy = (dzien) => {
  const t = C.dzienTygodnia(dzien);
  return t !== 0 && t !== 6;
};

// --- Słowniki ---------------------------------------------------------------

const LOKALE = [
  { name: BISTRO, miasto: "Kraków", otwarcie: "08:00", zamkniecie: "22:00", sredniParagon: 58 },
  { name: PIZZERIA, miasto: "Gdańsk", otwarcie: "12:00", zamkniecie: "23:00", sredniParagon: 74 },
];

// Kolory z palety w Ustawieniach (PALETA w manager/Ustawienia.tsx).
const STANOWISKA = [
  { lokal: BISTRO, name: "Kuchnia", skrot: "KUCH", kolor: "#E03A1E" },
  { lokal: BISTRO, name: "Pomoc kuchenna", skrot: "POM", kolor: "#A0703A" },
  { lokal: BISTRO, name: "Sala", skrot: "SALA", kolor: "#1A4FE0" },
  { lokal: BISTRO, name: "Bar", skrot: "BAR", kolor: "#8B2FC0" },
  { lokal: BISTRO, name: "Zmywak", skrot: "ZMYW", kolor: "#4A7A2A" },
  { lokal: PIZZERIA, name: "Pizzaiolo", skrot: "PIZZ", kolor: "#E0604A" },
  { lokal: PIZZERIA, name: "Sala", skrot: "SALA", kolor: "#1A4FE0" },
  { lokal: PIZZERIA, name: "Bar", skrot: "BAR", kolor: "#8B2FC0" },
  { lokal: PIZZERIA, name: "Dowóz", skrot: "DOW", kolor: "#1A4F6A" },
];

// Stawki nie niższe niż minimalne (2026): umowa o pracę 4950 zł brutto za pełny
// etat (pół etatu — połowa), zlecenie 32,30 zł/h. `harness-demo.html` to pilnuje.
const MIN_PENSJA = 4950;
const MIN_STAWKA = 32.3;

// Załoga. `wzor`: [dni tygodnia (0 = niedziela), start, koniec, lokal?, stanowisko?].
// Wzory są ułożone tak, żeby w siatce było i dobrze, i kilka dziur w obsadzie —
// kontrola obsady bez ani jednego ostrzeżenia nie pokazuje, co potrafi.
const LUDZIE = [
  { name: "Agnieszka Kowalczyk", lokal: BISTRO, st: "Kuchnia", umiejetnosci: ["Kuchnia"], umowa: "umowa_o_prace", kwota: 6400, wymiar: 1, wzor: [[[1, 2, 3, 4, 5], "07:30", "15:30"]] },
  { name: "Tomasz Zieliński", lokal: BISTRO, st: "Kuchnia", umiejetnosci: ["Kuchnia"], umowa: "zlecenie", stawka: 34, wzor: [[[3, 4, 5, 6, 0], "14:00", "22:00"]] },
  { name: "Rafał Grabowski", lokal: BISTRO, st: "Kuchnia", umiejetnosci: ["Kuchnia", "Pomoc kuchenna"], umowa: "zlecenie", stawka: 33, wzor: [[[6, 0], "07:30", "15:30"], [[1, 2], "14:00", "22:00"]] },
  { name: "Olena Kovalenko", lokal: BISTRO, st: "Pomoc kuchenna", umiejetnosci: ["Pomoc kuchenna", "Zmywak"], umowa: "zlecenie", stawka: 32.3, wzor: [[[1, 2, 3, 4, 5], "08:00", "16:00"]] },
  { name: "Dmytro Bondarenko", lokal: BISTRO, st: "Zmywak", umiejetnosci: ["Zmywak"], umowa: "zlecenie", stawka: 32.3, wzor: [[[4, 5, 6, 0, 1], "15:00", "22:30"]] },
  { name: K.KONTA[2].imie, lokal: BISTRO, st: "Sala", umiejetnosci: ["Sala", "Bar"], umowa: "zlecenie", stawka: 32.3, wzor: [[[1, 3, 4, 5], "16:00", "22:00"]], konto: "telefon" },
  { name: "Julia Mazur", lokal: BISTRO, st: "Sala", umiejetnosci: ["Sala", "Bar"], umowa: "zlecenie", stawka: 32.3, wzor: [[[2, 3, 4, 5, 6], "09:00", "17:00"]] },
  { name: "Natalia Krawczyk", lokal: BISTRO, st: "Sala", umiejetnosci: ["Sala"], umowa: "umowa_o_prace", kwota: 3300, wymiar: 0.5, wzor: [[[6, 0], "10:00", "18:00"], [[3], "12:00", "18:00"]] },
  { name: "Kacper Wójcik", lokal: BISTRO, st: "Bar", umiejetnosci: ["Bar", "Sala"], umowa: "zlecenie", stawka: 33, wzor: [[[3, 4, 5, 6, 0], "14:00", "22:00"]] },
  { name: "Paweł Lewandowski", lokal: BISTRO, st: "Sala", umiejetnosci: ["Sala", "Bar"], umowa: "umowa_o_prace", kwota: 8500, wymiar: 1, rola: "manager_lokalu", wzor: [[[1, 2, 3, 4, 5], "10:00", "18:00"]] },
  { name: "Michał Kamiński", lokal: PIZZERIA, st: "Pizzaiolo", umiejetnosci: ["Pizzaiolo"], umowa: "umowa_o_prace", kwota: 5900, wymiar: 1, wzor: [[[2, 3, 4, 5, 6], "11:30", "19:30"]] },
  { name: "Oksana Shevchenko", lokal: PIZZERIA, st: "Pizzaiolo", umiejetnosci: ["Pizzaiolo"], umowa: "zlecenie", stawka: 33.5, wzor: [[[4, 5, 6, 0, 1], "15:00", "23:00"]] },
  { name: "Bartosz Szymański", lokal: PIZZERIA, st: "Dowóz", umiejetnosci: ["Dowóz"], umowa: "b2b", stawka: 38, wzor: [[[3, 4, 5, 6, 0], "17:00", "23:00"]] },
  { name: "Zuzanna Dąbrowska", lokal: PIZZERIA, st: "Sala", umiejetnosci: ["Sala"], umowa: "zlecenie", stawka: 32.3, wzor: [[[1, 2, 3, 4, 5], "12:00", "20:00"]] },
  // Wypożyczana: we wtorki stoi w grafiku Bistro — pokazuje pracę w dwóch lokalach.
  { name: "Iryna Melnyk", lokal: PIZZERIA, st: "Sala", umiejetnosci: ["Sala", "Bar"], umowa: "zlecenie", stawka: 32.3, wzor: [[[5, 6, 0], "15:00", "23:00"], [[2], "16:00", "22:00", BISTRO, "Sala"]] },
  { name: "Wiktoria Jankowska", lokal: PIZZERIA, st: "Bar", umiejetnosci: ["Bar", "Sala"], umowa: "zlecenie", stawka: 32.3, wzor: [[[3, 4, 5, 6, 0], "16:00", "23:00"]] },
  { name: "Ewa Piotrowska", lokal: PIZZERIA, st: "Sala", umiejetnosci: ["Sala", "Bar"], umowa: "umowa_o_prace", kwota: 7800, wymiar: 1, rola: "manager_lokalu", wzor: [[[2, 3, 4, 5, 6], "12:00", "20:00"]] },
];

const WLASCICIELKA = K.KONTA[0].imie;
const TABLET_BISTRO = K.KONTA[1].imie;
const TABLET_PIZZERIA = "Tablet · Pizzeria Port";
const PROBNY = { name: "Szymon Kubiak", lokal: BISTRO, st: "Zmywak" };

// Cel finansowy na dzień tygodnia (0 = niedziela) — utarg i % kosztu pracy.
const CELE = {
  [BISTRO]: { utarg: [9500, 6500, 6800, 7200, 7800, 10500, 12500], pct: 30 },
  [PIZZERIA]: { utarg: [8800, 4800, 5000, 5400, 6200, 9200, 10500], pct: 28 },
};

// Wymagania obsady: [stanowisko, dni ("1,2,3" | null = codziennie), od, do, ile].
const WYMAGANIA = {
  [BISTRO]: [
    ["Kuchnia", null, "07:30", "15:30", 1],
    ["Kuchnia", null, "14:00", "22:00", 1],
    ["Pomoc kuchenna", "1,2,3,4,5", "08:00", "16:00", 1],
    ["Sala", null, "09:00", "22:00", 1],
    ["Sala", "5,6,0", "12:00", "20:00", 1],
    ["Bar", "3,4,5,6,0", "14:00", "22:00", 1],
    ["Zmywak", null, "15:00", "22:00", 1],
  ],
  [PIZZERIA]: [
    ["Pizzaiolo", null, "12:00", "23:00", 1],
    ["Pizzaiolo", "5,6", "17:00", "22:00", 1],
    ["Sala", null, "12:00", "23:00", 1],
    ["Bar", "3,4,5,6,0", "16:00", "23:00", 1],
    ["Dowóz", "3,4,5,6,0", "17:00", "23:00", 1],
  ],
};

const BLOKI = [
  {
    nazwa: "Otwarcie lokalu", opis: "Pierwsza godzina zmiany porannej.", schedule_type: "poranne", deadline: "09:00",
    zadania: [
      { title: "Otworzyć lokal, wyłączyć alarm" },
      { title: "Włączyć sprzęt (ekspres, piec, bemar)" },
      { title: "Stan kasy na start", typ: "inne", pola: [{ klucz: "kwota", label: "Kwota w kasie", typ: "number", jednostka: "zł" }] },
      { title: "Temperatura lodówki — rano", typ: "temperatura", pola: [{ klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: 0, max: 5 }] },
      { title: "Sala i toalety gotowe na gości" },
    ],
  },
  {
    nazwa: "Bezpieczeństwo żywności (HACCP)", opis: "Pomiary i kontrole wymagane przez sanepid.", schedule_type: "ogolne", stanowiska: { [BISTRO]: "Kuchnia,Pomoc kuchenna", [PIZZERIA]: "Pizzaiolo" },
    zadania: [
      { title: "Temperatura zamrażarki", typ: "temperatura", pola: [{ klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: -25, max: -18 }] },
      { title: "Temperatura wydania / bemar", typ: "temperatura", pola: [{ klucz: "temp", label: "Temperatura", typ: "number", jednostka: "°C", min: 63 }] },
      { title: "Daty i oznaczenia na produktach" },
    ],
  },
  {
    nazwa: "Mycie i dezynfekcja sprzętu", opis: "Sprzęt, który myje się po zmianie albo co kilka dni.", schedule_type: "wieczorne", stanowiska: { [BISTRO]: "Kuchnia,Zmywak", [PIZZERIA]: "Pizzaiolo" },
    zadania: [
      { title: "Piec / piekarnik" },
      { title: "Lodówka — mycie wewnątrz", cycle_days: 3 },
      { title: "Okap i filtry", cycle_days: 7 },
      { title: "Podłoga zaplecza" },
    ],
  },
  {
    nazwa: "Zamknięcie lokalu", opis: "Ostatnie 30 minut zmiany wieczornej.", schedule_type: "wieczorne", deadline: "23:30",
    zadania: [
      { title: "Stan kasy na koniec", typ: "inne", pola: [{ klucz: "kwota", label: "Kwota w kasie", typ: "number", jednostka: "zł" }] },
      { title: "Sprzęt wyłączony" },
      { title: "Śmieci wyniesione" },
      { title: "Lokal zamknięty, alarm włączony" },
    ],
  },
  {
    nazwa: "Kontrola kierownika", opis: "Widoczne tylko w panelu kierownika.", schedule_type: "ogolne", for_manager: true,
    zadania: [
      { title: "Utarg i kasa zgodne z raportem" },
      { title: "Grafik na jutro obsadzony" },
    ],
  },
];

const SZABLONY = [
  { klucz: "lodowka", nazwa: "Lodówka kuchnia", typ: "temperatura", pora: "poranne", pola: [{ klucz: "temperatura", label: "Temperatura", typ: "number", jednostka: "°C", min: 0, max: 5 }] },
  { klucz: "zamrazarka", nazwa: "Zamrażarka", typ: "temperatura", pora: "poranne", pola: [{ klucz: "temperatura", label: "Temperatura", typ: "number", jednostka: "°C", min: -25, max: -18 }] },
  { klucz: "dostawa", nazwa: "Przyjęcie dostawy", typ: "dostawa", pora: "ogolne", wymagany: false, pola: [{ klucz: "dostawca", label: "Dostawca", typ: "text" }, { klucz: "temperatura", label: "Temperatura towaru", typ: "number", jednostka: "°C", max: 4 }, { klucz: "uwagi", label: "Stan towaru", typ: "text" }] },
  { klucz: "wydanie", nazwa: "Temperatura wydania", typ: "temperatura", pora: "obiadowe", pola: [{ klucz: "temperatura", label: "Temperatura", typ: "number", jednostka: "°C", min: 63 }] },
  { klucz: "sprzatanie_koncowe", nazwa: "Sprzątanie końcowe", typ: "sprzatanie", pora: "wieczorne", pola: [{ klucz: "wykonane", label: "Wykonane", typ: "bool" }, { klucz: "uwagi", label: "Uwagi", typ: "text" }] },
];

const NOTATKI_DNIA = [
  "Duża grupa o 19:00 (urodziny, 14 osób) — poszło sprawnie.",
  "Brakowało rukoli od 18:00, zamówione na jutro.",
  "Spokojny dzień, deszcz od popołudnia.",
  "Kontrola z sanepidu — bez uwag.",
  "Ekspres znowu cieknie, serwis umówiony.",
];

// --- Generator ------------------------------------------------------------------

const generuj = ({ dzis = C.ymd(), teraz = new Date() } = {}) => {
  const r = losowanie(`shiftro-demo-${dzis}`);
  let licznik = 0;
  const noweId = (prefiks) => uuidZ(`${dzis}:${prefiks}:${++licznik}`);
  const terazIso = new Date(teraz).toISOString();
  const wczoraj = C.dodajDni(dzis, -1);
  const od = pierwszyPoprzedniegoMiesiaca(dzis);
  const koniecGrafiku = C.dodajDni(dzis, 13);
  const dni = zakres(od, koniecGrafiku);
  const przeszle = dni.filter((d) => d < dzis);

  const T = {
    lokale: [], stanowiska: [], users: [], lokale_godziny: [], staffing_rule_sets: [],
    staffing_rules: [], grafik_budzet_cele: [], grafik_shifts: [], shifts: [], absences: [],
    issues: [], shift_swaps: [], shift_edits: [], task_blocks: [], tasks: [],
    day_log_templates: [], day_logs: [], day_log_entries: [], task_completions: [],
    notifications: [], zadania_moje: [], wydarzenia: [], wydarzenia_uczestnicy: [],
  };

  // --- Lokale, stanowiska, godziny otwarcia ---
  for (const l of LOKALE) {
    T.lokale.push({
      id: uuidZ(`lokal:${l.name}`), name: l.name, miasto: l.miasto, archived: false,
      dostepne_bloki: null, dzien_wyplaty: 10, okres_rozliczeniowy: 1,
      narzut_umowa: 20.48, narzut_zlecenie: 0,
    });
    for (let t = 0; t < 7; t++) {
      T.lokale_godziny.push({ id: uuidZ(`godziny:${l.name}:${t}`), lokal: l.name, day_of_week: t, open_time: l.otwarcie, close_time: l.zamkniecie, zamkniete: false });
    }
  }
  for (const s of STANOWISKA) {
    T.stanowiska.push({ id: uuidZ(`stanowisko:${s.lokal}:${s.name}`), name: s.name, lokal_name: s.lokal, skrot: s.skrot, kolor: s.kolor, archived: false });
  }

  // --- Ludzie ---
  const sanepid = {
    "Julia Mazur": C.dodajDni(dzis, 12),       // za chwilę wygasa → Terminy na Pulpicie
    "Dmytro Bondarenko": C.dodajDni(dzis, -3), // po terminie
    "Olena Kovalenko": null,                   // brak → „Braki w danych”
  };
  const user = (u) => ({
    email: null, pin: "", kiosk_pin: null, active: true, archived: false,
    default_lokal: null, default_stanowisko: null, allowed_lokale: "", allowed_stanowiska: null,
    stawka: null, typ_umowy: null, wymiar_etatu: null, wynagrodzenie_mies: null,
    umowa_bezterminowa: false, umowa_expiry: null, sanepid_expiry: null,
    telefon: null, data_zatrudnienia: null, notatki: null, email_powiadomienia: false,
    probny_status: null, probny_od: null, probny_przez: null,
    ...u,
  });
  const konto = (klucz) => K.KONTA.find((k) => k.klucz === klucz);

  T.users.push(user({
    id: uuidZ(`user:${WLASCICIELKA}`), name: WLASCICIELKA, role: "admin",
    email: konto("kierownik").email, pin: K.PIN, data_zatrudnienia: "2019-03-01",
  }));
  T.users.push(user({
    id: uuidZ(`user:${TABLET_BISTRO}`), name: TABLET_BISTRO, role: "kiosk",
    email: konto("tablet").email, pin: K.PIN, allowed_lokale: BISTRO,
  }));
  T.users.push(user({
    id: uuidZ(`user:${TABLET_PIZZERIA}`), name: TABLET_PIZZERIA, role: "kiosk", allowed_lokale: PIZZERIA,
  }));
  const osoby = {};
  LUDZIE.forEach((p, i) => {
    const etat = p.umowa === "umowa_o_prace";
    const w = user({
      id: uuidZ(`user:${p.name}`), name: p.name, role: p.rola || "open",
      default_lokal: p.lokal, default_stanowisko: p.st,
      allowed_lokale: p.lokal, allowed_stanowiska: p.umiejetnosci.join(","),
      typ_umowy: p.umowa, stawka: etat ? null : p.stawka,
      wymiar_etatu: etat ? p.wymiar : null, wynagrodzenie_mies: etat ? p.kwota : null,
      umowa_bezterminowa: etat, umowa_expiry: etat ? null : `${dzis.slice(0, 4)}-12-31`,
      sanepid_expiry: p.name in sanepid ? sanepid[p.name] : C.dodajDni(dzis, 120 + i * 17),
      data_zatrudnienia: C.dodajDni(dzis, -(200 + i * 41)),
    });
    if (p.konto === "telefon") {
      // Prywatny telefon: e-mail + kiosk_pin. Ten sam PIN blokuje jego profil na tablecie.
      w.email = konto("telefon").email;
      w.kiosk_pin = K.PIN;
      // Może dziś zamknąć Puls (0.73.0) — „Więcej → Zamknięcie dnia” na telefonie.
      w.puls_do = dzis;
    }
    if (p.rola === "manager_lokalu") w.pin = "";
    T.users.push(w);
    osoby[p.name] = { ...p, id: w.id };
  });
  if (osoby["Natalia Krawczyk"]) {
    const n = T.users.find((u) => u.name === "Natalia Krawczyk");
    n.notatki = "Studiuje zaocznie — weekendy zjazdowe ustalamy z wyprzedzeniem.";
    n.notatki_updated_by = "Paweł Lewandowski";
    n.notatki_updated_at = C.chwila(C.dodajDni(dzis, -20), "18:10").toISOString();
  }
  const probnyId = uuidZ(`user:${PROBNY.name}`);
  T.users.push(user({
    id: probnyId, name: PROBNY.name, role: "open", default_lokal: PROBNY.lokal,
    default_stanowisko: PROBNY.st, allowed_lokale: PROBNY.lokal, allowed_stanowiska: PROBNY.st,
    probny_status: "oczekuje", probny_od: dzis, probny_przez: TABLET_BISTRO,
  }));

  // --- Urlopy i niedostępność ---
  // Zatwierdzony urlop Agnieszki w poprzednim miesiącu: trzy dni robocze od 15.
  const agnieszka = osoby["Agnieszka Kowalczyk"];
  const urlopOd = (() => {
    let d = `${od.slice(0, 8)}15`;
    while (!roboczy(d)) d = C.dodajDni(d, 1);
    return d;
  })();
  const urlopDni = [];
  for (let d = urlopOd; urlopDni.length < 3; d = C.dodajDni(d, 1)) if (roboczy(d)) urlopDni.push(d);
  const urlopId = noweId("absence");
  T.absences.push({
    id: urlopId, user_id: agnieszka.id, user_name: agnieszka.name, lokal: BISTRO,
    start_date: urlopDni[0], end_date: urlopDni[2], type: "urlop", status: "approved",
    note: "Wyjazd rodzinny", requested_by: "employee", decided_by: "Paweł Lewandowski",
    decided_at: C.chwila(C.dodajDni(urlopDni[0], -20), "12:00").toISOString(),
    created_at: C.chwila(C.dodajDni(urlopDni[0], -22), "09:15").toISOString(),
  });
  const wolneOd = (imie) =>
    new Set(
      T.absences
        .filter((a) => a.user_name === imie && a.status === "approved")
        .flatMap((a) => zakres(a.start_date, a.end_date))
    );
  for (const d of urlopDni) {
    T.shifts.push({
      id: noweId("shift"), user_id: agnieszka.id, user_name: agnieszka.name, lokal: BISTRO,
      stanowisko: "Urlop", start_time: iso(d, min("09:00")), end_time: iso(d, min("17:00")),
      godzin: 8, is_urlop: true, absence_id: urlopId,
    });
  }
  // Oczekujący wniosek o urlop (kolejka „Do decyzji”) i zatwierdzona niedostępność
  // (blokuje dni w Grafiku).
  const natalia = osoby["Natalia Krawczyk"];
  T.absences.push({
    id: noweId("absence"), user_id: natalia.id, user_name: natalia.name, lokal: BISTRO,
    start_date: C.dodajDni(dzis, 8), end_date: C.dodajDni(dzis, 10), type: "urlop",
    status: "pending", note: "Sesja egzaminacyjna", requested_by: "employee",
    created_at: C.chwila(C.dodajDni(dzis, -1), "21:40").toISOString(),
  });
  const tomasz = osoby["Tomasz Zieliński"];
  T.absences.push({
    id: noweId("absence"), user_id: tomasz.id, user_name: tomasz.name, lokal: BISTRO,
    start_date: C.dodajDni(dzis, 11), end_date: C.dodajDni(dzis, 12), type: "niedostepnosc",
    status: "approved", note: "Ślub brata", requested_by: "employee", decided_by: "Paweł Lewandowski",
    decided_at: C.chwila(C.dodajDni(dzis, -5), "10:00").toISOString(),
    created_at: C.chwila(C.dodajDni(dzis, -6), "16:20").toISOString(),
  });

  // --- Grafik (plan) ---
  const opublikowanoStare = C.chwila(C.dodajDni(od, -3), "18:00").toISOString();
  const opublikowanoBiezace = new Date(Date.parse(terazIso) - 2 * 86400000).toISOString();
  const szkicOd = C.dodajDni(dzis, 11); // ostatnie trzy dni grafiku czekają na wysłanie
  const plan = [];
  for (const p of Object.values(osoby)) {
    const wolne = wolneOd(p.name);
    for (const d of dni) {
      if (wolne.has(d)) continue;
      const t = C.dzienTygodnia(d);
      for (const [dniT, s, e, lokal, st] of p.wzor) {
        if (!dniT.includes(t)) continue;
        plan.push({ osoba: p, date: d, start: s, end: e, lokal: lokal || p.lokal, st: st || p.st });
      }
    }
  }
  // Konto demo z telefonu ma DZIŚ zmianę popołudniową — odwiedzający ma co odbić.
  const marek = Object.values(osoby).find((p) => p.konto === "telefon");
  if (!plan.some((x) => x.osoba === marek && x.date === dzis)) {
    plan.push({ osoba: marek, date: dzis, start: "16:00", end: "22:00", lokal: BISTRO, st: "Sala" });
  }
  for (const x of plan) {
    const pub = x.date < dzis ? opublikowanoStare : x.date >= szkicOd ? null : opublikowanoBiezace;
    x.id = noweId("grafik");
    T.grafik_shifts.push({
      id: x.id, lokal: x.lokal, user_id: x.osoba.id, user_name: x.osoba.name, stanowisko: x.st,
      date: x.date, start_time: x.start, end_time: x.end, published_at: pub,
      created_by: x.lokal === BISTRO ? "Paweł Lewandowski" : "Ewa Piotrowska",
      updated_by: null, created_at: pub || terazIso, updated_at: pub || terazIso, deleted_at: null,
    });
  }

  // --- Godziny (fakt) z grafiku, z wyjątkami dla kolejek kierownika ---
  const naDzien = (d, filtr) => plan.filter((x) => x.date === d && filtr(x));
  // Brak odbicia wczoraj: pierwsza osoba z kuchni Bistro.
  const bezOdbicia = naDzien(wczoraj, (x) => x.lokal === BISTRO && x.st === "Kuchnia")[0] || null;
  // Zmiana bez zakończenia trzy dni temu w Pizzerii (ktoś zapomniał odbić koniec).
  const bezKonca = naDzien(C.dodajDni(dzis, -3), (x) => x.lokal === PIZZERIA && !x.osoba.rola)[0] || null;
  const faktDla = {};
  for (const x of plan) {
    if (x.date > dzis || x === bezOdbicia) continue;
    if (x.date === dzis) {
      // Dziś: na zmianie są ci, którzy zaczynają do południa. Popołudniowa
      // zmiana czeka, aż ktoś odbije ją na tablecie albo na telefonie.
      if (min(x.start) > 12 * 60 || x.osoba.konto) continue;
    }
    const s = min(x.start) + r.int(-9, 4);
    let e = min(x.end) + (r() < 0.08 ? r.int(25, 50) : r.int(-3, 14));
    if (e <= min(x.start)) e += 1440;
    const otwarta = x.date === dzis || x === bezKonca;
    const id = noweId("shift");
    faktDla[x.id] = id;
    T.shifts.push({
      id, user_id: x.osoba.id, user_name: x.osoba.name, lokal: x.lokal, stanowisko: x.st,
      start_time: iso(x.date, s), end_time: otwarta ? null : iso(x.date, e),
      godzin: otwarta ? null : Math.round(((e - s) / 60) * 100) / 100, is_urlop: false, absence_id: null,
      porzucona_powiadomiono_at: x === bezKonca ? C.chwila(C.dodajDni(x.date, 1), "07:30").toISOString() : null,
      created_at: iso(x.date, s),
    });
  }
  // Osoba na próbę odbiła dziś start na tablecie.
  T.shifts.push({
    id: noweId("shift"), user_id: probnyId, user_name: PROBNY.name, lokal: PROBNY.lokal, stanowisko: PROBNY.st,
    start_time: iso(dzis, min("10:02")), end_time: null, godzin: null, is_urlop: false, absence_id: null,
    created_at: iso(dzis, min("10:02")),
  });

  // --- Zgłoszenia i korekty ---
  // Korekta: Julia została dłużej (prosi o +45 min do ostatniej zmiany sprzed ≥ 2 dni).
  const julia = osoby["Julia Mazur"];
  const julkiZmiana = plan
    .filter((x) => x.osoba === julia && x.date <= C.dodajDni(dzis, -2) && faktDla[x.id])
    .pop();
  if (julkiZmiana) {
    T.issues.push({
      id: noweId("issue"), user_id: julia.id, user_name: julia.name, type: "correction", status: "nowe",
      is_anonymous: false, shift_id: faktDla[julkiZmiana.id],
      issue_text: "Zostałam dłużej — inwentaryzacja baru po zamknięciu kuchni",
      proposed_date: julkiZmiana.date, proposed_lokal: julkiZmiana.lokal, proposed_stanowisko: julkiZmiana.st,
      proposed_start_time: julkiZmiana.start, proposed_end_time: hhmm(min(julkiZmiana.end) + 45),
      created_at: C.chwila(C.dodajDni(julkiZmiana.date, 1), "09:12").toISOString(),
    });
  }
  // „Zapomniałam odbić”: zastępstwo w ostatnią sobotę, którego nie ma w grafiku.
  const zuzanna = osoby["Zuzanna Dąbrowska"];
  let sobota = C.dodajDni(dzis, -1);
  while (C.dzienTygodnia(sobota) !== 6) sobota = C.dodajDni(sobota, -1);
  T.issues.push({
    id: noweId("issue"), user_id: zuzanna.id, user_name: zuzanna.name, type: "correction", status: "nowe",
    is_anonymous: false, shift_id: null, issue_text: "Zapomniałam odbić — zastępstwo za Irynę",
    proposed_date: sobota, proposed_lokal: PIZZERIA, proposed_stanowisko: "Sala",
    proposed_start_time: "15:00", proposed_end_time: "22:30",
    created_at: C.chwila(C.dodajDni(sobota, 1), "11:05").toISOString(),
  });
  T.issues.push({
    id: noweId("issue"), user_id: null, user_name: null, type: "problem", status: "nowe", is_anonymous: true,
    shift_id: null, issue_text: "Awaria sprzętu: zmywarka przecieka od rana, na podłodze zaplecza stoi woda.",
    created_at: C.chwila(dzis, "08:47").toISOString(),
  });
  const olena = osoby["Olena Kovalenko"];
  T.issues.push({
    id: noweId("issue"), user_id: olena.id, user_name: olena.name, type: "problem", status: "nowe",
    is_anonymous: false, shift_id: null, issue_text: "Braki w zaopatrzeniu: brakuje rękawic nitrylowych w rozmiarze S.",
    created_at: C.chwila(wczoraj, "13:20").toISOString(),
  });
  T.issues.push({
    id: noweId("issue"), user_id: olena.id, user_name: olena.name, type: "problem", status: "rozwiazane",
    is_anonymous: false, shift_id: null, issue_text: "Bezpieczeństwo: śliska rampa przy wejściu dla dostaw.",
    created_at: C.chwila(C.dodajDni(dzis, -12), "10:00").toISOString(),
  });

  // --- Giełda zmian ---
  // Zmiana Julii wystawiona na giełdę — Marek (telefon) może ją wziąć.
  const dniMarka = new Set(plan.filter((x) => x.osoba === marek).map((x) => x.date));
  const doOddania = plan.find(
    (x) => x.osoba === julia && x.date > C.dodajDni(dzis, 1) && x.date < szkicOd && !dniMarka.has(x.date)
  );
  if (doOddania) {
    T.shift_swaps.push({
      id: noweId("swap"), grafik_shift_id: doOddania.id, lokal: doOddania.lokal, date: doOddania.date,
      author_user_id: julia.id, author_user_name: julia.name, status: "na_gieldzie", typ: "gielda",
      note: "Wesele kuzynki — chętnie oddam", created_at: C.chwila(wczoraj, "20:05").toISOString(),
    });
    T.notifications.push({
      id: noweId("notif"), audience: "manager", lokal: BISTRO, type: "swap_offer", is_read: false,
      message: `${julia.name} wystawił(a) na giełdę zmianę ${doOddania.date} ${doOddania.start}–${doOddania.end} (${doOddania.st}).`,
      created_at: C.chwila(wczoraj, "20:05").toISOString(),
    });
  }
  // Przyjęta oferta w Pizzerii czeka na zgodę kierownika.
  const wiktoria = osoby["Wiktoria Jankowska"];
  const iryna = osoby["Iryna Melnyk"];
  const dniIryny = new Set(plan.filter((x) => x.osoba === iryna).map((x) => x.date));
  const przyjeta = plan.find(
    (x) => x.osoba === wiktoria && x.date > dzis && x.date < szkicOd && !dniIryny.has(x.date)
  );
  if (przyjeta) {
    T.shift_swaps.push({
      id: noweId("swap"), grafik_shift_id: przyjeta.id, lokal: PIZZERIA, date: przyjeta.date,
      author_user_id: wiktoria.id, author_user_name: wiktoria.name, taker_user_id: iryna.id,
      taker_user_name: iryna.name, status: "przyjeta", typ: "gielda", note: null,
      created_at: C.chwila(C.dodajDni(dzis, -2), "17:30").toISOString(),
    });
  }

  // --- Ślad ręcznych poprawek ---
  const poprawiona = T.shifts.find((s) => !s.is_urlop && s.end_time && s.lokal === BISTRO && s.start_time < iso(C.dodajDni(dzis, -6), 0));
  if (poprawiona) {
    T.shift_edits.push({
      shift_id: poprawiona.id, issue_id: null, editor_name: "Paweł Lewandowski",
      reason: "Odbite po przebraniu się — wpisuję godzinę z grafiku", source: "manual_edit",
      old_date: null, new_date: null, created_at: C.chwila(C.dodajDni(dzis, -5), "18:40").toISOString(),
    });
  }

  // --- Budżet i wymagania obsady ---
  for (const l of LOKALE) {
    for (let t = 0; t < 7; t++) {
      T.grafik_budzet_cele.push({
        id: noweId("cel"), lokal: l.name, obowiazuje_od: od, day_of_week: t,
        oczekiwany_utarg: CELE[l.name].utarg[t], cel_koszt_pct: CELE[l.name].pct, created_by: WLASCICIELKA,
      });
    }
    const setId = noweId("set");
    T.staffing_rule_sets.push({ id: setId, lokal: l.name, obowiazuje_od: od, note: "Sezon jesienny", created_by: WLASCICIELKA });
    for (const [st, dniT, s, e, ile] of WYMAGANIA[l.name]) {
      T.staffing_rules.push({
        id: noweId("rule"), set_id: setId, wyjatek_id: null, stanowisko: st, days_of_week: dniT,
        start_time: s, end_time: e, required_count: ile,
      });
    }
  }

  // --- Zadania ---
  const zadaniaLokalu = {};
  for (const l of LOKALE) {
    zadaniaLokalu[l.name] = [];
    BLOKI.forEach((b, bi) => {
      const blokId = noweId("blok");
      T.task_blocks.push({
        id: blokId, lokal: l.name, nazwa: b.nazwa, opis: b.opis,
        stanowiska: (b.stanowiska && b.stanowiska[l.name]) || null, schedule_type: b.schedule_type,
        cycle_days: null, days_of_week: null, deadline_time: b.deadline || null,
        for_manager: !!b.for_manager, kolejnosc: bi, active: true, archived: false,
      });
      b.zadania.forEach((z, zi) => {
        const t = {
          id: noweId("task"), lokal: l.name, title: z.title, description: null, block_id: blokId,
          kolejnosc: zi, schedule_type: b.schedule_type, cycle_days: z.cycle_days || null,
          days_of_week: null, priority: "sredni", for_manager: !!b.for_manager,
          pola: z.pola || [], typ: z.pola ? z.typ : null, template_key: null, active: true, archived: false,
        };
        T.tasks.push(t);
        zadaniaLokalu[l.name].push({ t, blok: b });
      });
    });
  }

  // --- Puls: szablony, karty dni, wpisy ---
  for (const l of LOKALE) {
    SZABLONY.forEach((s, i) => {
      T.day_log_templates.push({
        id: noweId("szablon"), lokal: l.name, klucz: s.klucz, nazwa: s.nazwa, typ: s.typ, pora: s.pora,
        days_of_week: null, wymagany: s.wymagany !== false, pola: s.pola, kolejnosc: i, archived: false,
      });
    });
  }
  const kierownikLokalu = { [BISTRO]: "Paweł Lewandowski", [PIZZERIA]: "Ewa Piotrowska" };
  const pomiar = (pole, wartosciNormy) => {
    if (pole.typ === "bool") return true;
    if (pole.typ === "text") return wartosciNormy.tekst || "";
    const lo = pole.min != null ? pole.min : (pole.max != null ? pole.max - 4 : 0);
    const hi = pole.max != null ? pole.max : lo + 9;
    return Math.round((lo + (hi - lo) * (0.25 + 0.5 * r())) * 10) / 10;
  };
  const okno = C.dodajDni(dzis, -14);
  for (const l of LOKALE) {
    for (const d of przeszle) {
      const t = C.dzienTygodnia(d);
      // Wczoraj w Pizzerii nikt jeszcze nie otworzył karty („Uzupełnij” na Pulpicie).
      if (d === wczoraj && l.name === PIZZERIA) continue;
      const cel = CELE[l.name].utarg[t];
      const odchylenie = 0.84 + 0.32 * r();
      const obrot = Math.round((cel * odchylenie) / 10) * 10;
      const zamkniety = d < wczoraj;
      const dl = {
        id: noweId("daylog"), lokal: l.name, date: d, obrot,
        liczba_paragonow: Math.round(obrot / (l.sredniParagon * (0.9 + 0.2 * r()))),
        obrot_powod: odchylenie > 1.1 ? "wydarzenie" : odchylenie < 0.9 ? "pogoda" : null,
        obrot_komentarz: odchylenie > 1.1 ? "Koncert w okolicy" : odchylenie < 0.9 ? "Ulewa od 17:00" : null,
        cos_nadzwyczajnego: false, notatka: r() < 0.25 ? r.wybierz(NOTATKI_DNIA) : null,
        handover: r() < 0.15 ? "Zamówić więcej mąki na weekend." : null,
        tagi: r() < 0.2 ? "pogoda" : null, pogoda_temp: null, pogoda_kod: null,
        status: zamkniety ? "zamkniety" : "otwarty",
        closed_by: zamkniety ? kierownikLokalu[l.name] : null,
        closed_at: zamkniety ? iso(d, min("22:40") + r.int(0, 50)) : null,
        created_at: iso(d, min("21:30")),
      };
      T.day_logs.push(dl);
      if (d < okno) continue;
      for (const s of SZABLONY) {
        if (s.klucz === "dostawa" && ![2, 5].includes(t)) continue;
        const payload = {};
        for (const p of s.pola) {
          payload[p.klucz] = pomiar(p, { tekst: p.klucz === "dostawca" ? "Hurtownia Smak" : p.klucz === "uwagi" ? "" : "" });
        }
        // Raz w tygodniu lodówka poza normą — pokazuje, jak wygląda ostrzeżenie.
        if (s.klucz === "lodowka" && d === C.dodajDni(dzis, -3) && l.name === BISTRO) payload.temperatura = 7.2;
        T.day_log_entries.push({
          id: noweId("wpis"), lokal: l.name, date: d, day_log_id: dl.id, typ: s.typ, template_key: s.klucz,
          payload, recorded_by: kierownikLokalu[l.name], recorded_at: iso(d, min(s.pora === "wieczorne" ? "21:50" : "09:30")),
        });
      }
    }
  }

  // Wykonania zadań: ostatni tydzień prawie wszystko, dziś rano w Bistro otwarcie.
  const ostatnieWykonanie = {};
  const wykonaj = (lokal, d, { t, blok }, godzinaMin, kto) => {
    let entryId = null;
    if (t.pola.length) {
      entryId = noweId("wpis");
      const payload = {};
      for (const p of t.pola) payload[p.klucz] = p.klucz === "kwota" ? 400 + r.int(0, 20) * 10 : pomiar(p, {});
      T.day_log_entries.push({
        id: entryId, lokal, date: d, day_log_id: null, typ: t.typ || "inne", template_key: `zad:${t.id}`,
        payload, recorded_by: kto.name, recorded_at: iso(d, godzinaMin),
      });
    }
    T.task_completions.push({
      task_id: t.id, date: d, user_id: kto.id, user_name: kto.name,
      completed_at: iso(d, godzinaMin), shift_id: null, entry_id: entryId,
    });
    ostatnieWykonanie[t.id] = d;
  };
  const godzinaBloku = (blok) =>
    ({ poranne: 8 * 60 + 20, obiadowe: 13 * 60, wieczorne: 22 * 60 + 10, ogolne: 15 * 60 })[blok.schedule_type] || 15 * 60;
  for (const l of LOKALE) {
    const zaloga = Object.values(osoby).filter((p) => p.lokal === l.name && !p.konto);
    for (const d of zakres(C.dodajDni(dzis, -7), wczoraj)) {
      for (const z of zadaniaLokalu[l.name]) {
        const cykl = z.t.cycle_days;
        if (cykl && ostatnieWykonanie[z.t.id] && C.dodajDni(ostatnieWykonanie[z.t.id], cykl) > d) continue;
        if (r() > 0.93) continue;
        const kto = z.blok.for_manager ? osoby[kierownikLokalu[l.name]] : r.wybierz(zaloga);
        wykonaj(l.name, d, z, godzinaBloku(z.blok) + r.int(-15, 25), kto);
      }
    }
  }
  const otwarcieBistro = zadaniaLokalu[BISTRO].filter((z) => z.blok.nazwa === "Otwarcie lokalu");
  otwarcieBistro.forEach((z, i) => wykonaj(BISTRO, dzis, z, min("07:40") + i * 6, agnieszka));

  // --- Wiadomości ---
  const fmtDzien = (d) => `${dzienMiesiaca(d)} ${C.MIES_DOPELNIACZ[Number(d.slice(5, 7)) - 1]}`;
  const dniMarkaOpubl = plan
    .filter((x) => x.osoba === marek && x.date >= dzis && x.date < szkicOd)
    .map((x) => x.date)
    .sort();
  if (dniMarkaOpubl.length) {
    T.notifications.push({
      id: noweId("notif"), audience: "employee", user_name: marek.name, type: "grafik", is_read: false,
      message: `Grafik zaktualizowany — masz zmiany na ${fmtDzien(dniMarkaOpubl[0])} – ${fmtDzien(dniMarkaOpubl[dniMarkaOpubl.length - 1])}. Sprawdź zakładkę Grafik. Wysłał(a): Paweł Lewandowski.`,
      created_at: opublikowanoBiezace,
    });
  }
  T.notifications.push({
    id: noweId("notif"), audience: "employee", user_name: marek.name, type: "info", is_read: true,
    message: "Witaj w Shiftro! Tu znajdziesz grafik, swoje godziny i wiadomości od kierownika.",
    created_at: C.chwila(C.dodajDni(dzis, -10), "12:00").toISOString(),
  });
  T.notifications.push({
    id: noweId("notif"), audience: "manager", lokal: BISTRO, type: "probny", is_read: false,
    message: `${PROBNY.name} (${PROBNY.st}) został(a) dodany(-a) na próbę na Tablecie Służbowym w lokalu ${BISTRO}. Do potwierdzenia w zakładce Zatwierdzanie zmian.`,
    created_at: iso(dzis, min("10:01")),
  });
  T.notifications.push({
    id: noweId("notif"), audience: "manager", lokal: BISTRO, type: "sanepid", is_read: false,
    message: `Dla pracownika Dmytro Bondarenko (Zmywak) z lokalu ${BISTRO}, książeczka sanepid upłynęła w dniu ${sanepid["Dmytro Bondarenko"].split("-").reverse().join(".")} — termin przekroczony o 3 dni.`,
    created_at: C.chwila(dzis, "08:00").toISOString(),
  });
  // --- Wydarzenia (0.74.0) ---
  // Zebranie za 3 dni (płatne, cała załoga Bistro — z Markiem, więc telefon
  // ma przypomnienie i wiadomość), grupa jutro w Pizzerii (tylko ci z grafiku),
  // mecz w okolicy w najbliższą sobotę (Bistro, Sala i Bar z grafiku) i
  // wczorajsza płatna inwentaryzacja w Pizzerii — do rozliczenia (W4).
  // ⚠️ Teksty wiadomości to KOPIA tekstNowego z src/utils/wydarzenia.ts.
  const DNI_KR = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
  const dzienKr = (d) => {
    const x = new Date(`${d}T00:00:00`);
    return `${DNI_KR[x.getDay()]} ${d.slice(8)}.${d.slice(5, 7)}`;
  };
  const sobotaMeczu = (() => {
    for (let i = 1; i <= 7; i++) {
      const d = C.dodajDni(dzis, i);
      if (new Date(`${d}T00:00:00`).getDay() === 6) return d;
    }
    return C.dodajDni(dzis, 6);
  })();
  const zGrafiku = (data, lokal, stanowiska) =>
    [...new Set(
      T.grafik_shifts
        .filter((g) => g.published_at && g.date === data && g.lokal === lokal && (!stanowiska || stanowiska.includes(g.stanowisko)))
        .map((g) => g.user_id)
    )]
      .map((id) => T.users.find((u) => u.id === id))
      .filter(Boolean);
  const WYD = [
    {
      klucz: "zebranie", lokal: BISTRO, data: C.dodajDni(dzis, 3), godz_od: "15:00", godz_do: "16:00", typ: "zebranie",
      tytul: "Zebranie zespołu", opis: "Jesienne menu, grafik na listopad, BHP przy frytownicy.", platne: true, zakres: "wszyscy",
      osoby: T.users.filter((u) => u.default_lokal === BISTRO && ["open", "closed", "manager_lokalu"].includes(u.role) && !u.probny_status),
    },
    {
      klucz: "grupa", lokal: PIZZERIA, data: C.dodajDni(dzis, 1), godz_od: "13:00", godz_do: "16:00", typ: "grupa",
      tytul: "Komunia — 40 osób", opis: "Sala główna zamknięta od 12:30, menu stałe.", liczba_gosci: 40, zakres: "grafik",
      osoby: zGrafiku(C.dodajDni(dzis, 1), PIZZERIA),
    },
    {
      klucz: "mecz", lokal: BISTRO, data: sobotaMeczu, godz_od: "20:45", godz_do: "22:45", typ: "okolica",
      tytul: "Mecz Polska – Szwecja", opis: "Więcej gości przy barze i na wynos po meczu.", stanowiska: "Sala,Bar", zakres: "grafik",
      osoby: zGrafiku(sobotaMeczu, BISTRO, ["Sala", "Bar"]),
    },
    {
      klucz: "inwentaryzacja", lokal: PIZZERIA, data: C.dodajDni(dzis, -1), godz_od: "07:00", godz_do: "09:00", typ: "inwentaryzacja",
      tytul: "Inwentaryzacja miesięczna", platne: true, zakres: "wszyscy",
      osoby: T.users.filter((u) => ["Michał Kamiński", "Oksana Shevchenko"].includes(u.name)),
    },
  ];
  for (const w of WYD) {
    const id = uuidZ(`wydarzenie:${w.klucz}`);
    const utworzono = C.chwila(C.dodajDni(dzis, -2), "11:20").toISOString();
    T.wydarzenia.push({
      id, lokal: w.lokal, data: w.data, godz_od: w.godz_od, godz_do: w.godz_do, typ: w.typ, tytul: w.tytul,
      opis: w.opis || null, stanowiska: w.stanowiska || null, zakres: w.zakres, liczba_gosci: w.liczba_gosci || null,
      platne: !!w.platne, utworzyl: WLASCICIELKA, zmienil: WLASCICIELKA, created_at: utworzono, updated_at: utworzono,
    });
    for (const u of w.osoby) {
      T.wydarzenia_uczestnicy.push({
        id: uuidZ(`uczestnik:${w.klucz}:${u.id}`), wydarzenie_id: id, user_id: u.id, user_name: u.name, powiadomiono_at: utworzono,
      });
      T.notifications.push({
        id: noweId("notif"), audience: "employee", user_name: u.name, type: "wydarzenie", is_read: false,
        message: `Nowe wydarzenie: ${w.tytul} — ${dzienKr(w.data)} · ${w.godz_od}–${w.godz_do} · ${w.lokal}${
          w.platne ? " (płatny czas pracy, wpisany do grafiku)" : ""
        }.`,
        created_at: utworzono,
      });
    }
  }

  // Kopie e-mail w demo nie wychodzą — oznaczamy wiersze jako obsłużone.
  for (const n of T.notifications) {
    n.email_at = n.created_at;
    n.email_info = "pominięto: demo";
  }

  // --- Moje zadania właścicielki ---
  const wlascicielkaId = uuidZ(`user:${WLASCICIELKA}`);
  T.zadania_moje.push(
    { id: noweId("moje"), wlasciciel_id: wlascicielkaId, wlasciciel_name: WLASCICIELKA, lokal: BISTRO, tytul: "Zamówić serwis zmywarki", termin: C.dodajDni(dzis, 1), zrodlo: "wlasne", archived: false },
    { id: noweId("moje"), wlasciciel_id: wlascicielkaId, wlasciciel_name: WLASCICIELKA, lokal: BISTRO, tytul: `Rozmowa z ${PROBNY.name} po dniu próbnym`, termin: dzis, zrodlo: "wlasne", archived: false },
    { id: noweId("moje"), wlasciciel_id: wlascicielkaId, wlasciciel_name: WLASCICIELKA, lokal: null, tytul: "Grafik na święta — zebrać dyspozycyjność", termin: C.dodajDni(dzis, 9), zrodlo: "wlasne", archived: false }
  );

  return T;
};

// Kolejność zapisu: najpierw słowniki i ludzie, potem to, co się do nich odwołuje
// (issues.shift_id ma prawdziwy klucz obcy do shifts).
const KOLEJNOSC = [
  "lokale", "stanowiska", "users", "lokale_godziny", "staffing_rule_sets", "staffing_rules",
  "grafik_budzet_cele", "grafik_shifts", "shifts", "absences", "issues", "shift_swaps",
  "shift_edits", "task_blocks", "tasks", "day_log_templates", "day_logs", "day_log_entries",
  "task_completions", "notifications", "zadania_moje", "wydarzenia", "wydarzenia_uczestnicy",
];

module.exports = { generuj, KOLEJNOSC, uuidZ, BISTRO, PIZZERIA, LUDZIE, MIN_PENSJA, MIN_STAWKA };
