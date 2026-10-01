// Daty i liczby po polsku dla e-maili (0.70.0).
//
// ⚠️ Funkcje Vercela chodzą w UTC, a lokale pracują w czasie polskim. Każdy
// "dziś", "wczoraj" i każda godzina z `timestamptz` przechodzi przez strefę
// Europe/Warsaw — inaczej zmiana zaczęta o 1:30 w nocy wpadałaby w poprzedni
// dzień (ten sam błąd co #2 w CLAUDE.md, tylko po stronie serwera).
//
// Katalog `api/_lib/` zaczyna się od podkreślenia, więc Vercel NIE robi z tych
// plików endpointów. Zwykły CommonJS, bez importów z src/ (patrz CLAUDE.md,
// sekcja "Cron").

const STREFA = "Europe/Warsaw";

const czesci = (data) => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: STREFA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return { y: g("year"), m: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
};

const dwa = (n) => String(n).padStart(2, "0");

// "2026-10-01" dla chwili `data` w Polsce.
const ymd = (data = new Date()) => {
  const c = czesci(new Date(data));
  return `${c.y}-${dwa(c.m)}-${dwa(c.d)}`;
};

// "08:30" dla chwili `data` w Polsce.
const hhmm = (data) => {
  const c = czesci(new Date(data));
  return `${dwa(c.h)}:${dwa(c.mi)}`;
};

// Chwila odpowiadająca polskiej dacie i godzinie (np. planowany koniec zmiany).
const chwila = (dzien, godzina = "00:00") => {
  const [y, m, d] = dzien.split("-").map(Number);
  const [h, mi] = String(godzina).split(":").map(Number);
  const zgadniete = Date.UTC(y, m - 1, d, h || 0, mi || 0);
  const c = czesci(new Date(zgadniete));
  const przesuniecie = Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s) - zgadniete;
  return new Date(zgadniete - przesuniecie);
};

// Arytmetyka na samych datach — w UTC, bez strefy, bo "2026-10-01" to dzień,
// nie chwila.
const dodajDni = (dzien, n) => {
  const [y, m, d] = dzien.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${dwa(t.getUTCMonth() + 1)}-${dwa(t.getUTCDate())}`;
};
const dzienTygodnia = (dzien) => {
  const [y, m, d] = dzien.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const poniedzialek = (dzien) => dodajDni(dzien, -((dzienTygodnia(dzien) + 6) % 7));
const numerTygodnia = (dzien) => {
  // ISO 8601: tydzień z czwartkiem.
  const czw = dodajDni(poniedzialek(dzien), 3);
  const [y] = czw.split("-").map(Number);
  const pierwszy = `${y}-01-01`;
  const roznica = (Date.parse(czw) - Date.parse(pierwszy)) / 86400000;
  return Math.floor(roznica / 7) + 1;
};

const DNI_KROTKO = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
const DNI_DWULITEROWO = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
const DNI_PELNE = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const MIES_KROTKO = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MIES_MIANOWNIK = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const MIES_DOPELNIACZ = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const MIES_MIEJSCOWNIK = ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrześniu", "październiku", "listopadzie", "grudniu"];

// "czw 1 paź"
const krotkaData = (dzien) => {
  if (!dzien) return "";
  const [, m, d] = dzien.split("-").map(Number);
  return `${DNI_KROTKO[dzienTygodnia(dzien)]} ${d} ${MIES_KROTKO[m - 1]}`;
};
// "22–28 września 2026" / "29 września – 5 października 2026"
const zakresDat = (od, doDnia) => {
  const [y1, m1, d1] = od.split("-").map(Number);
  const [y2, m2, d2] = doDnia.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MIES_DOPELNIACZ[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MIES_DOPELNIACZ[m1 - 1]} – ${d2} ${MIES_DOPELNIACZ[m2 - 1]} ${y2}`;
  return `${d1} ${MIES_DOPELNIACZ[m1 - 1]} ${y1} – ${d2} ${MIES_DOPELNIACZ[m2 - 1]} ${y2}`;
};

// Godziny zmiany z planu ("08:30"–"21:00"), przez północ gdy koniec ≤ start.
const minuty = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const godzinyPlanu = (s) => {
  const a = minuty(s.start_time);
  const b = minuty(s.end_time);
  if (a == null || b == null) return 0;
  return ((b > a ? b : b + 1440) - a) / 60;
};
const godzinyFaktu = (s) =>
  s.start_time && s.end_time ? (Date.parse(s.end_time) - Date.parse(s.start_time)) / 3600000 : 0;

// Liczby: przecinek dziesiętny, twarda spacja w tysiącach (jak zl() w
// utils/budzet.ts — ta sama kwota ma wyglądać tak samo w aplikacji i w mailu).
const NBSP = " ";
const tysiace = (n) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
const zl = (v) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  return `${n < 0 ? "−" : ""}${tysiace(n)}${NBSP}zł`;
};
const kwota = (v) => (v == null ? "—" : `${v < 0 ? "−" : ""}${tysiace(Math.round(v))}`);
const godz = (h) => {
  if (h == null || !Number.isFinite(h)) return "—";
  const r = Math.round(h * 10) / 10;
  return `${String(r).replace(".", ",")}${NBSP}h`;
};
const procent = (v) =>
  v == null || !Number.isFinite(v) ? "—" : `${String(Math.round(v * 10) / 10).replace(".", ",")}%`;

// Odmiana: 1 zmiana, 2 zmiany, 5 zmian.
const odmiana = (n, [jeden, kilka, wiele]) => {
  const d = Math.abs(n) % 10;
  const s = Math.abs(n) % 100;
  if (n === 1) return jeden;
  if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return kilka;
  return wiele;
};

module.exports = {
  STREFA,
  ymd,
  hhmm,
  chwila,
  dodajDni,
  dzienTygodnia,
  poniedzialek,
  numerTygodnia,
  DNI_KROTKO,
  DNI_DWULITEROWO,
  DNI_PELNE,
  MIES_KROTKO,
  MIES_MIANOWNIK,
  MIES_DOPELNIACZ,
  MIES_MIEJSCOWNIK,
  krotkaData,
  zakresDat,
  minuty,
  godzinyPlanu,
  godzinyFaktu,
  zl,
  kwota,
  godz,
  procent,
  odmiana,
};
