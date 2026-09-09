// @ts-nocheck
// Kontekst kalendarzowy dnia — święta, dni handlowo istotne, dzień wypłaty.
//
// Wszystko liczone, nic pobierane. Święta w Polsce to garść stałych dat plus
// kilka liczonych od Wielkanocy, a Wielkanoc wyznacza algorytm (Meeus/Jones/
// Butcher), który działa dla dowolnego roku. Żadnego API, żadnej tabeli do
// uzupełniania co grudzień — inaczej pierwszy rok, w którym ktoś zapomni
// wpisać świąt, po cichu wykrzywiłby całą analitykę.
//
// Osobno trzymamy DNI_HANDLOWE: to nie są dni wolne, ale w gastronomii
// zmieniają salę bardziej niż niejedno święto (Walentynki, Sylwester,
// tłusty czwartek). Dla planowania obsady liczą się tak samo.

const ymd = (rok, mies, dzien) =>
  `${rok}-${String(mies).padStart(2, "0")}-${String(dzien).padStart(2, "0")}`;

// Wielkanoc — algorytm Meeus/Jones/Butcher (kalendarz gregoriański).
export const wielkanoc = (rok) => {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mies = Math.floor((h + l - 7 * m + 114) / 31);
  const dzien = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(rok, mies - 1, dzien);
};

const przesunDate = (d, dni) => {
  const n = new Date(d.getTime());
  n.setDate(n.getDate() + dni);
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
};

// Dni ustawowo wolne od pracy.
export const swietaRoku = (rok) => {
  const w = wielkanoc(rok);
  return {
    [ymd(rok, 1, 1)]: "Nowy Rok",
    [ymd(rok, 1, 6)]: "Trzech Króli",
    [przesunDate(w, 0)]: "Wielkanoc",
    [przesunDate(w, 1)]: "Poniedziałek Wielkanocny",
    [ymd(rok, 5, 1)]: "Święto Pracy",
    [ymd(rok, 5, 3)]: "Święto Konstytucji 3 Maja",
    [przesunDate(w, 49)]: "Zielone Świątki",
    [przesunDate(w, 60)]: "Boże Ciało",
    [ymd(rok, 8, 15)]: "Wniebowzięcie NMP",
    [ymd(rok, 11, 1)]: "Wszystkich Świętych",
    [ymd(rok, 11, 11)]: "Święto Niepodległości",
    [ymd(rok, 12, 25)]: "Boże Narodzenie",
    [ymd(rok, 12, 26)]: "Drugi dzień świąt",
  };
};

// Dni pracujące, które i tak wywracają salę do góry nogami.
export const dniHandloweRoku = (rok) => {
  const w = wielkanoc(rok);
  return {
    [ymd(rok, 2, 14)]: "Walentynki",
    [przesunDate(w, -52)]: "Tłusty czwartek",
    [przesunDate(w, -47)]: "Ostatki",
    [ymd(rok, 5, 26)]: "Dzień Matki",
    [ymd(rok, 6, 1)]: "Dzień Dziecka",
    [ymd(rok, 11, 30)]: "Andrzejki",
    [ymd(rok, 12, 24)]: "Wigilia",
    [ymd(rok, 12, 31)]: "Sylwester",
  };
};

export const DZIEN_WYPLATY_DOMYSLNY = 10;

// Wszystko, co o dniu wiadomo z samego kalendarza. Kolejność ma znaczenie:
// najpierw to, co najmocniej tłumaczy nietypowy utarg.
export const kontekstDnia = (dateStr, { dzienWyplaty } = {}) => {
  if (!dateStr) return [];
  const [rok] = dateStr.split("-").map(Number);
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const out = [];

  const swieta = swietaRoku(rok);
  const handlowe = dniHandloweRoku(rok);
  if (swieta[dateStr]) out.push({ typ: "swieto", nazwa: swieta[dateStr] });
  if (handlowe[dateStr]) out.push({ typ: "handlowy", nazwa: handlowe[dateStr] });

  // Dzień przed świętem bywa mocniejszy niż samo święto — ludzie robią zakupy
  // i wychodzą wieczorem, a nazajutrz zostają w domach.
  const jutro = przesunDate(d, 1);
  const swietaJutra = jutro.startsWith(String(rok)) ? swieta : swietaRoku(rok + 1);
  if (!swieta[dateStr] && swietaJutra[jutro]) {
    out.push({ typ: "przed_swietem", nazwa: `Dzień przed: ${swietaJutra[jutro]}` });
  }

  const wyplata = dzienWyplaty || DZIEN_WYPLATY_DOMYSLNY;
  if (d.getDate() === wyplata) out.push({ typ: "wyplata", nazwa: "Dzień wypłaty" });

  if (dow === 0 || dow === 6) {
    out.push({ typ: "weekend", nazwa: dow === 6 ? "Sobota" : "Niedziela" });
  }
  return out;
};

// Etykieta do jednej linijki w karcie dnia; weekend pomijamy, bo widać go po
// nazwie dnia tygodnia obok.
export const kontekstKrotko = (kontekst) =>
  (kontekst || [])
    .filter((k) => k.typ !== "weekend")
    .map((k) => k.nazwa)
    .join(" · ");

// Wymiar czasu pracy miesiąca (art. 130 Kodeksu pracy) — ile godzin pracownik
// pełnoetatowy ma w danym miesiącu do przepracowania.
//
// Ustawowo: 40 h × pełne tygodnie + 8 h × pozostałe dni od poniedziałku do
// piątku − 8 h × święta wypadające w dniu innym niż niedziela. Każdy pełny
// siedmiodniowy blok zawiera dokładnie pięć dni roboczych, więc pierwsze dwa
// składniki to po prostu "wszystkie dni pon–pt tego miesiąca × 8".
//
// Święta odejmujemy MIMO że gastronomia w święta pracuje (art. 151-10 KP na to
// pozwala). To nie sprzeczność: normę i tak trzeba odebrać w innym dniu, a bez
// tego odejmowania wrzesień i grudzień miałyby tę samą normę i miesięczna
// stawka godzinowa przestałaby się różnić — czyli zniknąłby cały powód, dla
// którego to liczymy.
export const wymiarCzasuPracy = (rok, mies) => {
  const dniWMiesiacu = new Date(rok, mies, 0).getDate(); // mies: 1–12
  const swieta = swietaRoku(rok);
  let robocze = 0;
  let swietaPozaNiedziela = 0;
  for (let d = 1; d <= dniWMiesiacu; d++) {
    const data = new Date(rok, mies - 1, d);
    const dow = data.getDay();
    if (dow >= 1 && dow <= 5) robocze++;
    if (swieta[ymd(rok, mies, d)] && dow !== 0) swietaPozaNiedziela++;
  }
  return (robocze - swietaPozaNiedziela) * 8;
};
