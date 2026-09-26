// @ts-nocheck
// Godziny, różnice i krótkie daty w jednym kształcie dla ekranów decyzji —
// "Do decyzji" (ZatwierdzanieZmian.tsx) i karty "Wymaga decyzji" na Pulpicie.
// Ta sama sprawa ma wyglądać tak samo w obu miejscach: "+30 min", "ndz 13.09",
// "czeka 12 dni". Dwie kopie tych funkcji rozjechałyby się przy pierwszej
// poprawce formatu.

export const pad = (n) => String(n).padStart(2, "0");

// "11:00", "11.00", "1100", "930" → minuty od północy; cokolwiek innego → null.
// Kierownik wpisuje godzinę z klawiatury telefonu, na której dwukropek jest
// trzy dotknięcia dalej.
export const naMin = (tekst) => {
  const s = String(tekst || "").trim().replace(".", ":");
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) return null;
  const h = +m[1];
  const mm = +m[2];
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};

export const zMin = (min) => {
  const x = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};

// Długość zmiany w minutach; koniec przed startem = zmiana przez północ.
export const dlugosc = (od, doG) => {
  const a = naMin(od);
  const b = naMin(doG);
  if (a == null || b == null) return null;
  const d = b - a;
  return d <= 0 ? d + 1440 : d;
};

export const godzTekst = (min) =>
  `${String(Math.round((min / 60) * 100) / 100).replace(".", ",")} h`;

export const roznicaTekst = (min) => {
  const a = Math.abs(min);
  return `${min > 0 ? "+" : "−"}${a < 60 ? `${a} min` : godzTekst(a)}`;
};

export const DNI_KROTKIE = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];

// "ndz 13.09" — dzień tygodnia mówi kierownikowi więcej niż sama data
// ("to była niedziela, wtedy zamykamy później").
export const dzienKrotki = (ymd) => {
  if (!ymd) return "";
  const d = new Date(`${ymd}T00:00:00`);
  return `${DNI_KROTKIE[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};

export const dniOd = (kiedy) => {
  if (!kiedy) return 0;
  const d =
    kiedy instanceof Date
      ? kiedy
      : new Date(String(kiedy).length === 10 ? `${kiedy}T00:00:00` : kiedy);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

// Sprawa czekająca tydzień i dłużej dostaje podpis — przed wypłatą stare
// pozycje giną w kolejce najłatwiej.
export const PROG_CZEKANIA_DNI = 7;

// Polska odmiana liczebnika: 1 osoba, 2 osoby, 5 osób, 22 osoby, 12 osób.
export const odmiana = (n, [jeden, kilka, wiele]) => {
  if (n === 1) return jeden;
  const d = n % 10;
  const s = n % 100;
  return d >= 2 && d <= 4 && !(s >= 12 && s <= 14) ? kilka : wiele;
};
