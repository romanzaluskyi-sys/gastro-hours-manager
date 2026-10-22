// @ts-nocheck
// Poziom doświadczenia na stanowisku (0.78.0, migracja 0047).
//
// `users.poziomy_stanowisk` = { "Bar": 3, "Kasa": 2 } — klucz to NAZWA
// stanowiska, tak jak w `allowed_stanowiska` (ta sama nazwa w innym lokalu to
// to samo uprawnienie). Poziomy: 1 — wdrażany, 2 — samodzielny, 3 — może
// szkolić.
//
// ⚠️ Brak wpisu znaczy „nieustawiony”, a NIE „1”. Po wdrożeniu nikt nie ma
// jeszcze poziomów, a liczenie ich jako 1 zapaliłoby ostrzeżenie przy każdej
// zmianie w sieci. Nowe stanowisko dopisane w karcie dostaje 1 JAWNIE
// (`zPoziomemStartowym`).
//
// Karta pracownika, Grafik i ekran „Moje stanowiska” biorą wszystko stąd —
// nie licz poziomu w komponencie.

import { allowedStanowiskaArr, isSameUser, minToTime, shiftSegmentsOnDate } from "./grafik";

export const POZIOMY = [
  { poziom: 1, nazwa: "wdrażany", opis: "pracuje z kimś obok" },
  { poziom: 2, nazwa: "samodzielny", opis: "sam na zmianie" },
  { poziom: 3, nazwa: "może szkolić", opis: "może szkolić nowe osoby" },
];

export const opisPoziomu = (p) => POZIOMY.find((x) => x.poziom === p) || null;

// "●●○" — ten sam zapis w karcie, przy kandydatach i u pracownika.
export const kropkiPoziomu = (p) => (p ? "●".repeat(p) + "○".repeat(3 - p) : "");

const poprawny = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
};

// Obiekt poziomów z wiersza. PostgREST oddaje jsonb jako obiekt, ale stan
// karty mógł przyjść jako tekst — przyjmujemy oba.
export const poziomyOsoby = (user) => {
  let raw = user?.poziomy_stanowisk;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const wynik = {};
  Object.entries(raw).forEach(([k, v]) => {
    const p = poprawny(v);
    if (k && p) wynik[k] = p;
  });
  return wynik;
};

export const poziomNa = (user, stanowisko) =>
  (stanowisko && poziomyOsoby(user)[stanowisko]) || null;

export const zPoziomem = (user, stanowisko, poziom) => {
  const p = { ...poziomyOsoby(user) };
  const ok = poprawny(poziom);
  if (ok) p[stanowisko] = ok;
  else delete p[stanowisko];
  return p;
};

// Dopisane stanowisko dostaje poziom 1, jeśli go jeszcze nie ma.
export const zPoziomemStartowym = (user, stanowisko) =>
  !stanowisko || poziomNa(user, stanowisko) ? poziomyOsoby(user) : zPoziomem(user, stanowisko, 1);

// Do zapisu: tylko stanowiska, które osoba ma w karcie (główne + dodatkowe).
// Odznaczone stanowisko traci poziom — inaczej wróciłby sam po ponownym
// zaznaczeniu sprzed roku. Pusty zestaw = NULL.
export const poziomyDoZapisu = (user) => {
  const umie = allowedStanowiskaArr(user);
  const p = poziomyOsoby(user);
  const wynik = {};
  umie.forEach((s) => {
    if (p[s]) wynik[s] = p[s];
  });
  return Object.keys(wynik).length > 0 ? wynik : null;
};

// Czy baza zna kolumnę (migracja 0047). Wiersze z `users_widok` niosą klucz
// także wtedy, gdy wartość jest NULL — bez kolumny nie niosą go wcale, a zapis
// z nim dostałby od PostgREST 400.
export const bazaZnaPoziomy = (users) => (users || []).some((u) => u && "poziomy_stanowisk" in u);

// --- SYGNAŁ W GRAFIKU ----------------------------------------------------
// Odcinki dnia, w których na stanowisku stoją WYŁĄCZNIE osoby z poziomem 1.
// Osoba bez ustawionego poziomu przerywa sygnał — nie wiemy, kim jest, a
// alarm na niewiedzy to alarm o niczym. To sygnał, nie blokada.
//
// Zwraca [{ stanowisko, from, to, minutes, osoby: [imiona] }], posortowane
// po godzinie. `planShifts` — zmiany (mogą zawierać też dzień poprzedni:
// zmiana przez północ liczy się w tym dniu swoją poranną częścią).
export const sygnalyPoziomu = ({ planShifts, users, lokal, date }) => {
  const zmiany = (planShifts || [])
    .filter((s) => s.lokal === lokal && !s.__nieaktywny && !s.deleted_at && s.stanowisko)
    .map((s) => ({ s, seg: shiftSegmentsOnDate(s, date) }))
    .filter((x) => x.seg.length > 0);
  const osoba = (s) => (users || []).find((u) => isSameUser(s, u)) || null;
  const wynik = [];

  [...new Set(zmiany.map((x) => x.s.stanowisko))].forEach((stanowisko) => {
    const odcinki = zmiany
      .filter((x) => x.s.stanowisko === stanowisko)
      .flatMap((x) =>
        x.seg.map(([a, b]) => ({ a, b, imie: x.s.user_name, poziom: poziomNa(osoba(x.s), stanowisko) }))
      );
    const punkty = [...new Set(odcinki.flatMap((o) => [o.a, o.b]))].sort((x, y) => x - y);
    let biezacy = null;
    const zamknij = () => {
      if (biezacy) wynik.push(biezacy);
      biezacy = null;
    };
    for (let i = 0; i < punkty.length - 1; i++) {
      const from = punkty[i];
      const to = punkty[i + 1];
      const mid = (from + to) / 2;
      const teraz = odcinki.filter((o) => mid >= o.a && mid < o.b);
      const sami1 = teraz.length > 0 && teraz.every((o) => o.poziom === 1);
      if (!sami1) {
        zamknij();
        continue;
      }
      const imiona = [...new Set(teraz.map((o) => o.imie))];
      if (biezacy && biezacy.__to === from) {
        biezacy.__to = to;
        biezacy.osoby = [...new Set([...biezacy.osoby, ...imiona])];
      } else {
        zamknij();
        biezacy = { stanowisko, __from: from, __to: to, osoby: imiona };
      }
    }
    zamknij();
  });

  return wynik
    .map((w) => ({
      stanowisko: w.stanowisko,
      from: minToTime(w.__from),
      to: minToTime(w.__to),
      minutes: w.__to - w.__from,
      osoby: w.osoby,
    }))
    .sort((a, b) => (a.from === b.from ? a.stanowisko.localeCompare(b.stanowisko, "pl") : a.from < b.from ? -1 : 1));
};
