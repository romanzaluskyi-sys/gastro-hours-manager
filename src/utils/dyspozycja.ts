// @ts-nocheck
// Dyspozycja (0.79.0, migracja 0048) — kiedy pracownik może, a kiedy nie może
// pracować. Cała logika tutaj; ekran pracownika (employeeSessionShared.tsx),
// Grafik (przeszkodaDnia w GrafikTydzien) i giełda (utils/swaps.ts) tylko z
// niej korzystają. Pełny opis: docs/DYSPOZYCJA.md.
//
// Trzy stany dnia: `moge` (cały dzień), `godziny` (do dwóch przedziałów),
// `nie`. Brak wiersza = dzień BEZ ZAZNACZENIA — wolny do planowania.
// Urlop NIE jest tutaj: to dalej wniosek w `absences` (zgoda kierownika,
// godziny do wypłaty).
//
// ⚠️ Kiedy dyspozycja WIĄŻE kierownika (`wiazeDyspozycja`):
//   * wpis kierownika (w imieniu pracownika) — zawsze;
//   * wpis pracownika — gdy jego miesiąc jest WYSŁANY. Przed wysłaniem to
//     szkic: zapisany w bazie (nic nie ginie, gdy tablet zgubi wi-fi), ale
//     Grafik go nie bierze pod uwagę.
// Wiążące „Nie mogę” i godziny spoza „Mogę w godzinach” blokują wpisanie
// zmiany (Grafik, giełda, przepisanie na następcę) — tak samo jak urlop.
//
// ⚠️ Dzień z OPUBLIKOWANĄ zmianą tej osoby jest dla niej zablokowany do
// zmiany (`dzienZablokowany`): grafik obowiązuje. Prośba o zwolnienie ze
// zmiany dojdzie w kolejnym etapie (D4).

import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";
import { addDaysYMD, isSameUser, shiftSegmentsOnDate, timeToMin, trimTime } from "./grafik";

export const STANY = {
  moge: { etykieta: "Mogę cały dzień", krotko: "może" },
  godziny: { etykieta: "Mogę w godzinach", krotko: "może" },
  nie: { etykieta: "Nie mogę", krotko: "nie może" },
};

const zOsoba = (row, user) => !!user && String(row.user_id) === String(user.id);

// "2026-11-14" → "2026-11-01"
export const miesiacDnia = (dateStr) => `${String(dateStr).slice(0, 7)}-01`;

export const dniMiesiaca = (miesiac) => {
  const [r, m] = miesiac.split("-").map(Number);
  const ile = new Date(r, m, 0).getDate();
  return Array.from({ length: ile }, (_, i) => `${miesiac.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`);
};

export const przesunMiesiac = (miesiac, o) => {
  const [r, m] = miesiac.split("-").map(Number);
  const d = new Date(r, m - 1 + o, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export const dyspozycjaNa = (dyspozycja, user, dateStr) =>
  (dyspozycja || []).find((w) => zOsoba(w, user) && w.date === dateStr) || null;

export const wpisMiesiaca = (miesiace, user, miesiac) =>
  (miesiace || []).find((m) => zOsoba(m, user) && m.miesiac === miesiac) || null;

export const miesiacWyslany = (miesiace, user, miesiac) => !!wpisMiesiaca(miesiace, user, miesiac)?.wyslano_at;

export const wiazeDyspozycja = (row, miesiace) =>
  !!row && (row.autor === "kierownik" || miesiacWyslany(miesiace, { id: row.user_id }, miesiacDnia(row.date)));

// Przedziały „Mogę w godzinach” w minutach doby. Koniec 00:00 = północ (1440).
export const przedzialyDnia = (row) =>
  [
    [row?.od1, row?.do1],
    [row?.od2, row?.do2],
  ]
    .filter(([a, b]) => a && b)
    .map(([a, b]) => {
      const x = timeToMin(a);
      const y = timeToMin(b);
      return [x, y === 0 ? 1440 : y];
    })
    .filter(([x, y]) => x != null && y != null && y > x);

const godzina = (t) => {
  const s = trimTime(t);
  if (!s) return "";
  const [h, m] = s.split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
};

export const godzinyTekst = (row) =>
  [
    [row?.od1, row?.do1],
    [row?.od2, row?.do2],
  ]
    .filter(([a, b]) => a && b)
    // Koniec o północy piszemy „24”, nie „0” — „16–0” wygląda jak błąd.
    .map(([a, b]) => `${godzina(a)}–${godzina(b) === "0" ? "24" : godzina(b)}`)
    .join(", ");

export const opisDyspozycji = (row) =>
  !row ? "Bez zaznaczenia" : row.stan === "godziny" ? `Mogę ${godzinyTekst(row)}` : STANY[row.stan]?.etykieta || "";

// Krótki podpis do siatki Grafiku i listy kandydatów.
export const krotkoDyspozycji = (row) =>
  !row ? "" : row.stan === "godziny" ? `tylko ${godzinyTekst(row)}` : STANY[row.stan]?.krotko || "";

// Czy zmiana (date, start, end) mieści się w wiążącej dyspozycji osoby.
// Zmiana przez północ sprawdza też poranną część następnego dnia. Zwraca
// null albo { krotko, tekst, dzien, wpis } — ten sam kształt co inne
// przeszkody w Grafiku.
export const przeszkodaDyspozycji = ({ dyspozycja, miesiace, user, date, start_time, end_time }) => {
  if (!user || !date || !start_time || !end_time) return null;
  const zmiana = { date, start_time, end_time };
  for (const d of [date, addDaysYMD(date, 1)]) {
    const odcinki = shiftSegmentsOnDate(zmiana, d).filter(([a, b]) => b > a);
    if (odcinki.length === 0) continue;
    const wpis = dyspozycjaNa(dyspozycja, user, d);
    if (!wpis || !wiazeDyspozycja(wpis, miesiace) || wpis.stan === "moge") continue;
    if (wpis.stan === "nie") {
      return {
        krotko: "dyspozycja: nie może",
        tekst: `${user.name} zaznaczył(a) w dyspozycji, że ${d === date ? "tego dnia" : "następnego dnia rano"} nie może pracować.`,
        dzien: d,
        wpis,
      };
    }
    const okna = przedzialyDnia(wpis);
    const miesci = odcinki.every(([a, b]) => okna.some(([x, y]) => a >= x && b <= y));
    if (!miesci) {
      return {
        krotko: `dyspozycja: tylko ${godzinyTekst(wpis)}`,
        tekst: `${user.name} może ${d === date ? "tego dnia" : "następnego dnia"} tylko w godzinach ${godzinyTekst(wpis)}.`,
        dzien: d,
        wpis,
      };
    }
  }
  return null;
};

// Opublikowana zmiana tej osoby tego dnia — wtedy dyspozycji na ten dzień
// pracownik nie zmienia (grafik obowiązuje).
export const zmianaOpublikowanaNa = (planShifts, user, dateStr) =>
  (planShifts || []).find(
    (s) => s.date === dateStr && !!s.published_at && !s.deleted_at && isSameUser(s, user)
  ) || null;

// Urlop (wniosek) obejmujący dzień — czeka albo zatwierdzony.
export const urlopNa = (absences, user, dateStr) =>
  (absences || []).find(
    (a) =>
      a.type === "urlop" &&
      (a.status === "pending" || a.status === "approved") &&
      a.start_date <= dateStr &&
      dateStr <= a.end_date &&
      (a.user_id ? String(a.user_id) === String(user.id) : a.user_name === user.name)
  ) || null;

// Stara niedostępność (`absences.type = 'niedostepnosc'`, zatwierdzona) — do
// 0.79.0 jedyna droga powiedzenia „nie mogę”. Od 0.81.0 to TO SAMO co
// dyspozycja „Nie mogę”: blokuje, daje „Zapytaj” i stoi w kalendarzu
// pracownika jako „Nie mogę” (tylko do odczytu). Nowych nikt już nie zakłada;
// przyszłe przenosi migracja 0050.
export const niedostepnoscNa = (absences, user, dateStr) =>
  (absences || []).find(
    (a) =>
      a.type === "niedostepnosc" &&
      a.status === "approved" &&
      a.start_date <= dateStr &&
      dateStr <= a.end_date &&
      (a.user_id ? String(a.user_id) === String(user.id) : a.user_name === user.name)
  ) || null;

// Czego NIE wolno zmienić z ekranu pracownika i dlaczego.
export const dzienZablokowany = ({ dateStr, dzis, planShifts, user }) => {
  if (dateStr < dzis) return "minął";
  if (zmianaOpublikowanaNa(planShifts, user, dateStr)) return "w grafiku";
  return null;
};

// Ciągłe zakresy z listy dni — jeden wniosek urlopowy na zakres.
export const zakresyCiagle = (dni) => {
  const posortowane = [...new Set(dni)].sort();
  const wynik = [];
  posortowane.forEach((d) => {
    const ostatni = wynik[wynik.length - 1];
    if (ostatni && addDaysYMD(ostatni.do, 1) === d) ostatni.do = d;
    else wynik.push({ od: d, do: d });
  });
  return wynik;
};

// Dni miesiąca, które dostaną „Nie mogę” przy wyborze „Pozostałe dni: Nie
// mogę”: od dziś, bez zaznaczenia, bez urlopu i bez opublikowanej zmiany.
export const dniPozostale = ({ miesiac, dzis, user, dyspozycja, absences, planShifts }) =>
  dniMiesiaca(miesiac).filter(
    (d) =>
      d >= dzis &&
      !dyspozycjaNa(dyspozycja, user, d) &&
      !urlopNa(absences, user, d) &&
      !niedostepnoscNa(absences, user, d) &&
      !zmianaOpublikowanaNa(planShifts, user, d)
  );

// Wiersz do zapisu dla wybranego stanu. Godziny w formacie "HH:MM".
export const wierszDnia = ({ user, dateStr, stan, od1, do1, od2, do2, notatka }) => ({
  user_id: user.id,
  user_name: user.name,
  date: dateStr,
  stan,
  od1: stan === "godziny" ? od1 || null : null,
  do1: stan === "godziny" ? do1 || null : null,
  od2: stan === "godziny" && od2 && do2 ? od2 : null,
  do2: stan === "godziny" && od2 && do2 ? do2 : null,
  notatka: notatka ? String(notatka).trim() || null : null,
});

// Godziny „Mogę w godzinach” są poprawne? Zwraca tekst błędu albo null.
export const bladGodzin = ({ od1, do1, od2, do2 }) => {
  const okno = (a, b) => {
    const x = timeToMin(a);
    const y0 = timeToMin(b);
    if (x == null || y0 == null) return null;
    const y = y0 === 0 ? 1440 : y0;
    return y > x ? [x, y] : null;
  };
  const pierwsze = okno(od1, do1);
  if (!pierwsze) return "Podaj godziny „od” i „do” (koniec po początku).";
  if (od2 || do2) {
    const drugie = okno(od2, do2);
    if (!drugie) return "Drugi przedział: podaj „od” i „do” (koniec po początku).";
    if (drugie[0] < pierwsze[1] && pierwsze[0] < drugie[1]) return "Przedziały na siebie nachodzą.";
  }
  return null;
};

// Zapis jednego stanu na kilka dni naraz. `stan = null` czyści zaznaczenie.
// Zwraca nową listę wierszy dyspozycji (do podmiany w stanie).
export const zapiszDni = async ({ user, dni, stan, godziny = {}, notatka, dyspozycja }) => {
  let lista = [...(dyspozycja || [])];
  await Promise.all(
    dni.map(async (d) => {
      const istniejacy = dyspozycjaNa(lista, user, d);
      if (!stan) {
        if (istniejacy) {
          await api.delete("dyspozycja", istniejacy.id);
          lista = lista.filter((w) => w.id !== istniejacy.id);
        }
        return;
      }
      const wiersz = wierszDnia({ user, dateStr: d, stan, notatka, ...godziny });
      const zapisany = istniejacy
        ? await api.patch("dyspozycja", istniejacy.id, wiersz)
        : await api.post("dyspozycja", wiersz);
      lista = [...lista.filter((w) => !(zOsoba(w, user) && w.date === d)), { ...wiersz, ...(zapisany || {}) }];
    })
  );
  return lista;
};

// „Wyślij dyspozycję” na miesiąc. Przy `pozostale = 'nie'` dopisuje „Nie
// mogę” w dniach bez zaznaczenia (patrz `dniPozostale`). Zwraca
// { dyspozycja, miesiace } do podmiany w stanie.
export const wyslijMiesiac = async ({ user, miesiac, pozostale, dzis, dyspozycja, miesiace, absences, planShifts, ktoWysyla }) => {
  let lista = [...(dyspozycja || [])];
  if (pozostale === "nie") {
    const dni = dniPozostale({ miesiac, dzis, user, dyspozycja: lista, absences, planShifts });
    lista = await zapiszDni({ user, dni, stan: "nie", dyspozycja: lista });
  }
  const dane = {
    user_id: user.id,
    miesiac,
    wyslano_at: new Date().toISOString(),
    wyslal_name: ktoWysyla || user.name,
    pozostale,
  };
  const istniejacy = wpisMiesiaca(miesiace, user, miesiac);
  const zapisany = istniejacy
    ? await api.patch("dyspozycja_miesiace", istniejacy.id, dane)
    : await api.post("dyspozycja_miesiace", dane);
  return {
    dyspozycja: lista,
    miesiace: [
      ...(miesiace || []).filter((m) => !(zOsoba(m, user) && m.miesiac === miesiac)),
      { ...dane, ...(zapisany || {}) },
    ],
  };
};

// Kierownik wpisuje „Nie mogę” w imieniu pracownika (0.81.0 — zastępuje dawne
// „Niedostępność” z panelu zmiany w Grafiku). Wpis kierownika wiąże od razu.
// ⚠️ Dni, które pracownik zaznaczył SAM, zostają bez zmian — trigger
// `dyspozycja_autor` i tak by ich nie przepuścił; wracają w `pominiete`.
// Zwraca { dyspozycja, zapisane: [dni], pominiete: [dni] }.
export const tekstNieMogeOdKierownika = (kto, od, doDnia) => {
  const f = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  return `Kierownik wpisał Ci w dyspozycji „Nie mogę”: ${od === doDnia ? f(od) : `${f(od)}–${f(doDnia)}`}.${kto ? ` Wpisał(a): ${kto}.` : ""}`;
};
export const wpiszNieMogeZaPracownika = async ({ user, od, doDnia, notatka, dzis, dyspozycja, kierownik }) => {
  const dni = [];
  for (let d = od < dzis ? dzis : od; d <= doDnia; d = addDaysYMD(d, 1)) dni.push(d);
  const pominiete = dni.filter((d) => {
    const w = dyspozycjaNa(dyspozycja, user, d);
    return w && w.autor === "pracownik" && w.stan !== "nie";
  });
  const juzNie = dni.filter((d) => {
    const w = dyspozycjaNa(dyspozycja, user, d);
    return w && w.autor === "pracownik" && w.stan === "nie";
  });
  const doZapisu = dni.filter((d) => !pominiete.includes(d) && !juzNie.includes(d));
  const lista = doZapisu.length ? await zapiszDni({ user, dni: doZapisu, stan: "nie", notatka, dyspozycja }) : dyspozycja;
  if (doZapisu.length) {
    try {
      await createEmployeeNotification(user.name, tekstNieMogeOdKierownika(kierownik, doZapisu[0], doZapisu[doZapisu.length - 1]), "dyspozycja");
    } catch (e) {
      // wpis jest zapisany i widać go w Dyspozycji — wiadomość best-effort
    }
  }
  return { dyspozycja: lista, zapisane: doZapisu, pominiete };
};

// Podsumowanie miesiąca przed wysłaniem (kafle „Mogę / Nie mogę / Urlop”).
export const podsumowanieMiesiaca = ({ miesiac, user, dyspozycja, absences }) => {
  const dni = dniMiesiaca(miesiac);
  const w = dni.map((d) => dyspozycjaNa(dyspozycja, user, d));
  return {
    moge: w.filter((x) => x && x.stan !== "nie").length,
    cale: w.filter((x) => x && x.stan === "moge").length,
    wGodzinach: w.filter((x) => x && x.stan === "godziny").length,
    nie: dni.filter((d, i) => (w[i] && w[i].stan === "nie") || (!w[i] && niedostepnoscNa(absences, user, d))).length,
    urlop: dni.filter((d) => urlopNa(absences, user, d)).length,
  };
};

