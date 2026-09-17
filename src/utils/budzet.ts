// @ts-nocheck
// Budżet Grafiku: oczekiwany utarg, docelowy % kosztu pracy i koszt planu.
//
// Cała arytmetyka pieniędzy w Grafiku żyje TUTAJ. Komponenty (GrafikTydzien,
// GrafikBudzet, GrafikWymagania) tylko rysują to, co ta funkcja policzy —
// druga kopia tego rachunku rozjechałaby się przy pierwszej poprawce, a wtedy
// siatka i konfiguracja mówiłyby o tym samym tygodniu co innego.
//
// ────────────────────────────────────────────────────────────────────────
// ILE LOKAL WYDAJE, NIE ILE PRACOWNIK ZAROBI (ustalenie właściciela)
// ────────────────────────────────────────────────────────────────────────
// Koszt godziny liczymy przez `stawkaEfektywna` z utils/umowy.ts i DOKŁADAMY
// narzut pracodawcy z konfiguracji lokalu (`narzut_umowa`/`narzut_zlecenie`).
// Dla zlecenia to po prostu stawka; dla umowy o pracę — kwota z umowy podzielona
// przez normę miesiąca, czyli ile kosztuje jedna godzina tego etatu w TYM
// miesiącu (norma zmienia się co miesiąc, więc i ta liczba).
//
// ⚠️ Przy umowie o pracę to jest ALOKACJA stałego kosztu, a nie koszt kolejnej
// godziny: etatowiec kosztuje tyle samo, czy przepracuje 160 h, czy 176 h.
// Dlatego w karcie tygodnia ta część sumy jest opisana znakiem "~". To świadome
// odstępstwo od zasady z CLAUDE.md 5c ("godziny × stawka przy umowie o pracę
// byłoby mylące") i dotyczy WYŁĄCZNIE warstwy budżetu, która odpowiada na inne
// pytanie: jaką część stałego kosztu zjadł ten konkretny dzień. W wierszu
// pracownika nadal stoi norma, bo tam decyzją jest "czy wystarczy godzin".
//
// ⚠️ Osoba bez ani stawki, ani kwoty z umowy NIE jest liczona jako zero — trafia
// do `bezDanych` i mówimy o tym wprost. Zaniżony koszt pracy wygląda dokładnie
// jak dobrze zaplanowany tydzień.
import { shiftHours, dowOf } from "./grafik";
import { stawkaEfektywna, narzutDla, naEtacie } from "./umowy";
import { api } from "../api/supabase";

export const DNI_TYGODNIA = [0, 1, 2, 3, 4, 5, 6];

const liczba = (v) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);

// Ile kosztuje lokal jedna godzina tej osoby w tym miesiącu — z narzutem.
// `rok`/`mies` mają znaczenie: przy umowie o pracę norma zmienia się z miesiąca
// na miesiąc, więc ta sama pensja daje inną stawkę godzinową w lutym i w lipcu.
export const kosztGodziny = (user, lokalRow, rok, mies) => {
  const st = stawkaEfektywna(user, rok, mies);
  if (st == null) return null;
  return st * (1 + narzutDla(user, lokalRow) / 100);
};

// --- CELE: ZESTAWY I WYJĄTKI DNIA ---------------------------------------
// Zestaw = para (lokal, obowiazuje_od). Wiersze SĄ zestawem — nie ma osobnej
// tabeli nagłówków, bo zestaw zawsze powstaje kompletny, z siedmioma dniami.
export const budzetSetyLokalu = (cele, lokal) =>
  [...new Set((cele || []).filter((c) => c.lokal === lokal).map((c) => c.obowiazuje_od))].sort(
    (a, b) => (a < b ? 1 : -1)
  );

// Zestaw obowiązuje od swojego miesiąca aż do pojawienia się nowszego — ta sama
// zasada co przy wymaganiach obsady (`findRuleSetForDate`).
export const findBudzetSetForDate = (cele, lokal, dateStr) =>
  budzetSetyLokalu(cele, lokal).find((od) => od <= dateStr) || null;

export const wierszeZestawu = (cele, lokal, obowiazujeOd) =>
  (cele || []).filter((c) => c.lokal === lokal && c.obowiazuje_od === obowiazujeOd);

// Co obowiązuje danego dnia. Wyjątek dnia nadpisuje POLE PO POLU: można zmienić
// sam utarg na sobotę koncertową i zostawić docelowy procent z zestawu.
//
// Zwraca null, gdy budżetu w ogóle nie skonfigurowano. `null` to nie zero —
// cała warstwa budżetu ma wtedy milczeć, a nie pokazywać zapas "0 zł", który
// wygląda jak policzona liczba.
export const celDnia = ({ cele, budzetDni }, lokal, dateStr) => {
  const od = findBudzetSetForDate(cele, lokal, dateStr);
  const dow = dowOf(dateStr);
  const wiersz = od
    ? (cele || []).find(
        (c) => c.lokal === lokal && c.obowiazuje_od === od && Number(c.day_of_week) === dow
      )
    : null;
  const nadpis = (budzetDni || []).find((d) => d.lokal === lokal && d.date === dateStr) || null;

  const bazaUtarg = liczba(wiersz && wiersz.oczekiwany_utarg);
  const bazaPct = liczba(wiersz && wiersz.cel_koszt_pct);
  const nadUtarg = liczba(nadpis && nadpis.oczekiwany_utarg);
  const nadPct = liczba(nadpis && nadpis.cel_koszt_pct);

  const utarg = nadUtarg != null ? nadUtarg : bazaUtarg;
  const pct = nadPct != null ? nadPct : bazaPct;
  if (utarg == null && pct == null) return null;
  return {
    utarg,
    pct,
    zestawOd: od,
    nadpisany: nadUtarg != null || nadPct != null,
    nadpisane: { utarg: nadUtarg != null, pct: nadPct != null },
    baza: { utarg: bazaUtarg, pct: bazaPct },
    nadpisRow: nadpis,
  };
};

// --- KOSZT PLANU --------------------------------------------------------
// Zmiany bierzemy po `date`, a nie po odcinkach przechodzących przez północ —
// dokładnie tak, jak liczy godziny nagłówek dnia w siatce. Zgodność z liczbą,
// którą kierownik widzi obok, jest tu ważniejsza niż minuty po północy: dwie
// liczby o tym samym dniu, które się nie zgadzają, kosztują więcej zaufania,
// niż warta jest ta precyzja.
export const kosztZmianDnia = ({ planShifts, users, lokalRow, lokal, dateStr }) => {
  const [rok, mies] = dateStr.split("-").map(Number);
  const zmiany = (planShifts || []).filter(
    (s) => s.lokal === lokal && s.date === dateStr && !s.deleted_at && !s.__nieaktywny
  );
  let koszt = 0;
  let etaty = 0;
  let zlecenia = 0;
  const bezDanych = new Set();
  const wgStanowisk = {};
  zmiany.forEach((s) => {
    const user = (users || []).find(
      (u) => String(u.id) === String(s.user_id) || u.name === s.user_name
    );
    const h = shiftHours(s);
    const stawka = user ? kosztGodziny(user, lokalRow, rok, mies) : null;
    if (stawka == null) {
      bezDanych.add(s.user_name);
      return;
    }
    const kwota = h * stawka;
    koszt += kwota;
    if (naEtacie(user)) etaty += kwota;
    else zlecenia += kwota;
    const st = s.stanowisko || "bez stanowiska";
    wgStanowisk[st] = (wgStanowisk[st] || 0) + kwota;
  });
  return {
    koszt,
    etaty,
    zlecenia,
    wgStanowisk,
    bezDanych: [...bezDanych],
    godziny: zmiany.reduce((sum, s) => sum + shiftHours(s), 0),
  };
};

// Jeden dzień warstwy budżetu: cel, koszt planu i to, co z tego wynika.
export const budzetDnia = ({
  cele,
  budzetDni,
  planShifts,
  users,
  lokalRow,
  lokal,
  dateStr,
}) => {
  const cel = celDnia({ cele, budzetDni }, lokal, dateStr);
  const k = kosztZmianDnia({ planShifts, users, lokalRow, lokal, dateStr });
  const utarg = cel ? cel.utarg : null;
  const pct = cel ? cel.pct : null;
  // Procent liczymy tylko wtedy, gdy jest z czego. Koszt podzielony przez brak
  // prognozy to nie "0%", tylko "nie wiadomo".
  const kosztPct = utarg != null && utarg > 0 ? (k.koszt / utarg) * 100 : null;
  const limit = utarg != null && pct != null ? (utarg * pct) / 100 : null;
  // Minimalny utarg, przy którym ten dzień zmieści się w celu. To jest ta sama
  // równość co wyżej, przeczytana od drugiej strony: skoro koszt już stoi w
  // grafiku, to ile trzeba utargować, żeby procent się zgodził.
  const minUtarg = pct != null && pct > 0 ? (k.koszt / pct) * 100 : null;
  return {
    date: dateStr,
    cel,
    utarg,
    pct,
    koszt: k.koszt,
    godziny: k.godziny,
    etaty: k.etaty,
    zlecenia: k.zlecenia,
    wgStanowisk: k.wgStanowisk,
    bezDanych: k.bezDanych,
    kosztPct,
    limit,
    zapas: limit == null ? null : limit - k.koszt,
    minUtarg,
    ponizejCelu: limit != null && limit - k.koszt < 0,
  };
};

// Tydzień to suma dni, nie osobny byt — dokładnie jak raport tygodnia w Pulsie.
//
// ⚠️ Minimalny utarg tygodnia to SUMA dziennych, a nie "koszt tygodnia podzielony
// przez średni procent". Cel bywa inny w sobotę niż we wtorek, więc te dwa
// rachunki dają różne liczby, a tylko pierwszy zgadza się z kolumnami, które
// kierownik widzi pod spodem.
export const budzetTygodnia = (dni) => {
  const lista = dni || [];
  // ⚠️ Do średniej wchodzą tylko dni, które MAJĄ obsadę. Dzień bez wpisanych
  // zmian ma minimalny utarg zero — wliczony do średniej zaniżałby ją tak, że
  // tydzień z trzema obsadzonymi dniami wyglądałby na dwa razy łatwiejszy, niż
  // jest. Na samą sumę to nie wpływa, bo taki dzień i tak dokłada zero.
  const zMinUtargiem = lista.filter((d) => d.minUtarg != null && d.koszt > 0);
  const zCelem = lista.filter((d) => d.zapas != null);
  const minUtarg = zMinUtargiem.reduce((s, d) => s + d.minUtarg, 0);
  const prognoza = lista.reduce((s, d) => s + (d.utarg || 0), 0);
  return {
    koszt: lista.reduce((s, d) => s + d.koszt, 0),
    etaty: lista.reduce((s, d) => s + d.etaty, 0),
    zlecenia: lista.reduce((s, d) => s + d.zlecenia, 0),
    godziny: lista.reduce((s, d) => s + d.godziny, 0),
    prognoza,
    maPrognoze: lista.some((d) => d.utarg != null),
    minUtarg: zMinUtargiem.length > 0 ? minUtarg : null,
    minUtargDni: zMinUtargiem.length,
    // "Średnio na dzień" dzielimy przez dni, które faktycznie weszły do sumy —
    // dzielenie przez siedem przy trzech obsadzonych dniach zaniżałoby liczbę
    // o ponad połowę i sugerowało, że cel jest łatwiejszy, niż jest.
    minUtargSredni: zMinUtargiem.length > 0 ? minUtarg / zMinUtargiem.length : null,
    zapas: zCelem.length > 0 ? zCelem.reduce((s, d) => s + d.zapas, 0) : null,
    // Udział kosztu pracy w prognozie — liczba DOKŁADNA, nie propozycja: koszt
    // stoi w grafiku, prognoza w konfiguracji. Liczymy z sum, nie ze średniej
    // dziennych procentów: dzień z małym utargiem i dzień z dużym ważą wtedy
    // tyle, ile faktycznie ważą w tygodniu.
    kosztPct:
      lista.some((d) => d.utarg != null) && prognoza > 0
        ? (lista.reduce((s, d) => s + d.koszt, 0) / prognoza) * 100
        : null,
    // Średni cel tygodnia, ważony prognozą — punkt odniesienia dla powyższego.
    // Średnia arytmetyczna z siedmiu procentów kłamałaby tym mocniej, im
    // bardziej sobota różni się utargiem od wtorku.
    celPct: (() => {
      const zCel = lista.filter((d) => d.utarg != null && d.pct != null);
      const baza = zCel.reduce((s, d) => s + d.utarg, 0);
      if (baza <= 0) return null;
      return (zCel.reduce((s, d) => s + (d.utarg * d.pct) / 100, 0) / baza) * 100;
    })(),
    dniPonizej: lista.filter((d) => d.ponizejCelu).map((d) => d.date),
    bezDanych: [...new Set(lista.flatMap((d) => d.bezDanych))],
  };
};

// --- PODPOWIEDŹ Z HISTORII ---------------------------------------------
// Średni utarg z ostatnich `ile` takich dni tygodnia, z zamkniętych kart Pulsu.
//
// ⚠️ To jest wyłącznie PODPOWIEDŹ pod przyciskiem, nigdy wartość podstawiana
// automatycznie (ustalenie właściciela). Liczba, która wpisała się sama, po
// tygodniu wygląda dokładnie jak liczba wpisana świadomie — a cała wartość
// oczekiwanego utargu polega na tym, że ktoś się pod nim podpisał.
export const sredniUtargDnia = (dayLogs, lokal, dow, ile = 4) => {
  const karty = (dayLogs || [])
    .filter(
      (k) =>
        k.lokal === lokal &&
        k.obrot != null &&
        Number(k.obrot) > 0 &&
        dowOf(k.date) === Number(dow)
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, ile);
  if (karty.length === 0) return null;
  const suma = karty.reduce((s, k) => s + Number(k.obrot), 0);
  return { kwota: Math.round(suma / karty.length), zIlu: karty.length };
};

// --- ZAPIS --------------------------------------------------------------
// Zestaw zawsze powstaje kompletny — siedem wierszy. Zestaw częściowy znaczyłby
// "w środy nie ma budżetu", a chcemy powiedzieć "w środy nie wpisano liczby".
export const utworzZestaw = async ({ lokal, obowiazujeOd, zrodlo, autor }) => {
  const rows = [];
  for (const dow of DNI_TYGODNIA) {
    const src = (zrodlo || []).find((c) => Number(c.day_of_week) === dow);
    rows.push(
      await api.post("grafik_budzet_cele", {
        lokal,
        obowiazuje_od: obowiazujeOd,
        day_of_week: dow,
        oczekiwany_utarg: src ? src.oczekiwany_utarg : null,
        cel_koszt_pct: src ? src.cel_koszt_pct : null,
        created_by: autor || null,
      })
    );
  }
  return rows;
};

// Skasowanie całego zestawu celów — siedem wierszy naraz. Zestaw utworzony na
// zły miesiąc inaczej zostawałby w rozwijanej liście na zawsze.
export const usunZestaw = async ({ cele, setCele, lokal, obowiazujeOd }) => {
  const doUsuniecia = wierszeZestawu(cele, lokal, obowiazujeOd);
  for (const w of doUsuniecia) await api.delete("grafik_budzet_cele", w.id);
  const ids = new Set(doUsuniecia.map((w) => w.id));
  setCele((cele || []).filter((c) => !ids.has(c.id)));
  return doUsuniecia.length;
};

export const zapiszCel = async ({ wiersz, patch }) =>
  api.patch("grafik_budzet_cele", wiersz.id, {
    oczekiwany_utarg: liczba(patch.oczekiwany_utarg),
    cel_koszt_pct: liczba(patch.cel_koszt_pct),
  });

// Wyjątek dnia. Pusty wyjątek (oba pola puste) KASUJEMY zamiast zapisywać —
// wiersz bez żadnej wartości znaczyłby to samo co jego brak, ale zostawiałby w
// siatce podpis "zmienione na ten tydzień" przy niezmienionym dniu.
export const zapiszNadpisanieDnia = async ({
  lokal,
  dateStr,
  oczekiwany_utarg,
  cel_koszt_pct,
  autor,
  budzetDni,
  setBudzetDni,
}) => {
  const istniejacy = (budzetDni || []).find((d) => d.lokal === lokal && d.date === dateStr);
  const u = liczba(oczekiwany_utarg);
  const p = liczba(cel_koszt_pct);
  if (u == null && p == null) {
    if (istniejacy) {
      await api.delete("grafik_budzet_dni", istniejacy.id);
      setBudzetDni((budzetDni || []).filter((d) => d.id !== istniejacy.id));
    }
    return null;
  }
  const payload = { lokal, date: dateStr, oczekiwany_utarg: u, cel_koszt_pct: p, autor: autor || null };
  const zapisany = istniejacy
    ? await api.patch("grafik_budzet_dni", istniejacy.id, payload)
    : await api.post("grafik_budzet_dni", payload);
  setBudzetDni([
    ...(budzetDni || []).filter((d) => d.id !== zapisany.id),
    zapisany,
  ]);
  return zapisany;
};

export const usunNadpisanieDnia = async ({ wiersz, budzetDni, setBudzetDni }) => {
  await api.delete("grafik_budzet_dni", wiersz.id);
  setBudzetDni((budzetDni || []).filter((d) => d.id !== wiersz.id));
};

// --- FORMATOWANIE -------------------------------------------------------
// Grupowanie tysięcy robimy SAMI, a nie przez `toLocaleString("pl-PL")` — Intl
// dla polskiego nie grupuje liczb czterocyfrowych, więc w jednej kolumnie stało
// "1260 zł" obok "13 000 zł" i dwie liczby tego samego rzędu wyglądały jak
// liczby różnych rzędów. Spacja jest nierozdzielająca, żeby kwota nie łamała
// się na dwie linijki w wąskiej kolumnie dnia.
const NBSP = "\u00a0";
export const zl = (v) => {
  if (v == null) return "—";
  const n = Math.round(v);
  const cyfry = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "−" : ""}${cyfry}${NBSP}zł`;
};

export const pct1 = (v) =>
  v == null ? "—" : `${(Math.round(v * 10) / 10).toString().replace(".", ",")}%`;

export const pct0 = (v) => (v == null ? "—" : `${Math.round(v)}%`);
