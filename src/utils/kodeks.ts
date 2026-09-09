// @ts-nocheck
// Ostrzeżenia o odpoczynku — Kodeks pracy przy planowaniu grafiku.
//
// Zakres zależy od RODZAJU UMOWY (ustalenie właściciela):
//   umowa o pracę — pełne reguły: 11 h odpoczynku dobowego (art. 132 § 1)
//                   i 35 h odpoczynku tygodniowego (art. 133 § 1);
//   pozostałe      — Kodeks ich nie obejmuje, więc jedno ostrzeżenie
//                   "ponad 40 h bez dnia wolnego", jako granica zdrowego
//                   rozsądku, a nie przepisu.
//
// ⚠️ **To jest sygnał, nie blokada.** Zapis zmiany przechodzi zawsze — tak
// samo jak przy dziurach w obsadzie. Kierownik zna sytuacje, których system
// nie zna, a grafik, którego nie da się zapisać, zostanie ułożony obok
// systemu, w zeszycie.
//
// ⚠️ **Liczymy zmiany ze WSZYSTKICH lokali**, nie tylko z oglądanego. Osoba
// kończąca o 23:00 w jednym lokalu i zaczynająca o 6:00 w drugim ma siedem
// godzin odpoczynku niezależnie od tego, na którą siatkę patrzymy — a to
// właśnie przy wypożyczaniu ludzi między lokalami najłatwiej przeoczyć.
//
// ⚠️ Czego tu świadomie NIE MA: kontroli 8 h dobowych. W gastronomii
// standardem jest system równoważny (art. 135), w którym dobowy wymiar sięga
// 12 h — ostrzeżenie przy każdej dwunastce byłoby alarmem o normalnej zmianie
// i nauczyłoby ignorować całą resztę.
import { planAbsRange, isSameUser, addDaysYMD, mondayOf } from "./grafik";
import { naEtacie } from "./umowy";

export const ODPOCZYNEK_DOBOWY_MIN = 11 * 60;
export const ODPOCZYNEK_TYGODNIOWY_MIN = 35 * 60;
export const SERIA_BEZ_WOLNEGO_H = 40;

const hh = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

// Zmiany osoby jako absolutne zakresy minut, posortowane po początku.
// `planAbsRange` liczy przez północ, więc zmiana 18:00–02:00 kończy się
// naprawdę następnego dnia, a nie "przed swoim początkiem".
const zakresy = (planShifts, user, od, doDnia) =>
  (planShifts || [])
    .filter(
      (s) =>
        !s.deleted_at &&
        isSameUser(s, user) &&
        s.date >= od &&
        s.date <= doDnia &&
        s.start_time &&
        s.end_time
    )
    .map((s) => ({ shift: s, zakres: planAbsRange(s) }))
    .filter((x) => x.zakres)
    .sort((a, b) => a.zakres[0] - b.zakres[0]);

// Art. 132 § 1 — 11 h nieprzerwanego odpoczynku w każdej dobie.
//
// ⚠️ Liczymy PO DOBACH, a nie po parach kolejnych zmian. Różnica nie jest
// akademicka: zmiana dzielona (12:00–20:00 i 21:00–23:30 tego samego dnia) to
// w gastronomii norma i wolno ją wpisywać, a porównywanie par krzyczałoby o
// "1 h odpoczynku" za każdym razem. Doba pokazuje to, o co naprawdę chodzi —
// czy w ciągu 24 godzin znalazło się 11 godzin ciągiem.
//
// Doba biegnie od początku pierwszej zmiany danego dnia, zgodnie z definicją
// z art. 128 § 3 pkt 1. Szukamy w niej najdłuższej wolnej przerwy.
export const naruszeniaDobowe = (lista) => {
  if (!lista || lista.length === 0) return [];
  const zajete = lista.map((x) => x.zakres).sort((a, b) => a[0] - b[0]);

  // Pierwsza zmiana każdego dnia wyznacza początek jednej doby.
  const poczatki = [];
  const widziane = new Set();
  for (const { shift, zakres } of lista) {
    if (widziane.has(shift.date)) continue;
    widziane.add(shift.date);
    poczatki.push({ date: shift.date, start: zakres[0] });
  }

  const out = [];
  for (const { date, start } of poczatki) {
    const koniec = start + 1440;
    // Zajętość przycięta do doby i scalona — dwie zmiany z pauzą w środku dają
    // dwa odcinki, nachodzące dają jeden.
    const odcinki = [];
    for (const [a, b] of zajete) {
      const od = Math.max(a, start);
      const doK = Math.min(b, koniec);
      if (doK > od) odcinki.push([od, doK]);
    }
    if (odcinki.length === 0) continue;
    const scalone = [odcinki[0].slice()];
    for (const [a, b] of odcinki.slice(1)) {
      const ost = scalone[scalone.length - 1];
      if (a <= ost[1]) ost[1] = Math.max(ost[1], b);
      else scalone.push([a, b]);
    }
    // Najdłuższa wolna przerwa w dobie: przed pierwszym odcinkiem, między
    // odcinkami i po ostatnim.
    let najdluzsza = scalone[0][0] - start;
    for (let i = 1; i < scalone.length; i++) {
      najdluzsza = Math.max(najdluzsza, scalone[i][0] - scalone[i - 1][1]);
    }
    najdluzsza = Math.max(najdluzsza, koniec - scalone[scalone.length - 1][1]);

    if (najdluzsza < ODPOCZYNEK_DOBOWY_MIN) {
      out.push({
        typ: "dobowy",
        date,
        min: najdluzsza,
        tekst: `W dobie od ${date} najdłuższy odpoczynek to ${hh(
          najdluzsza
        )} — Kodeks wymaga 11 h (art. 132).`,
      });
    }
  }
  return out;
};

export const naruszeniaTygodniowe = (planShifts, user, poniedzialek) => {
  const koniecTygodnia = addDaysYMD(poniedzialek, 6);
  const lista = zakresy(
    planShifts,
    user,
    addDaysYMD(poniedzialek, -3),
    addDaysYMD(koniecTygodnia, 3)
  );
  if (lista.length === 0) return [];

  const startTyg = new Date(poniedzialek + "T00:00:00").getTime() / 60000;
  const koniecTyg = startTyg + 7 * 1440;

  // ⚠️ Tygodnia, którego nie widzimy z OBU stron, nie oceniamy. Jeśli pierwsza
  // znana zmiana zaczyna się już po początku tygodnia (albo ostatnia kończy
  // przed jego końcem), nie wiemy, jak długie było wolne przy krawędzi —
  // a brak danych to nie to samo co brak odpoczynku. Pomyłka idzie tu
  // świadomie w stronę milczenia, nie fałszywego alarmu.
  if (lista[0].zakres[0] > startTyg) return [];
  if (lista[lista.length - 1].zakres[1] < koniecTyg) return [];

  let najdluzszy = 0;
  for (let i = 1; i < lista.length; i++) {
    const start = lista[i - 1].zakres[1];
    const koniec = lista[i].zakres[0];
    if (koniec <= start) continue; // zmiany nachodzące — inny problem
    // Przerwa liczy się do tego tygodnia, jeśli się z nim przecina. Mierzymy
    // ją w PEŁNEJ długości, bez przycinania do granic tygodnia.
    if (koniec > startTyg && start < koniecTyg) {
      najdluzszy = Math.max(najdluzszy, koniec - start);
    }
  }

  if (najdluzszy >= ODPOCZYNEK_TYGODNIOWY_MIN) return [];
  return [
    {
      typ: "tygodniowy",
      date: poniedzialek,
      min: najdluzszy,
      tekst: `W tygodniu od ${poniedzialek} najdłuższa przerwa to ${hh(
        najdluzszy
      )} — Kodeks wymaga 35 h nieprzerwanego odpoczynku (art. 133).`,
    },
  ];
};

// Serie dni pracujących bez dnia wolnego. Dzień z zatwierdzonym wolnym albo
// bez żadnej zmiany przerywa serię.
export const serieBezWolnego = ({ planShifts, absences, user, od, doDnia }) => {
  const lista = zakresy(planShifts, user, od, doDnia);
  const godzinyDnia = {};
  for (const { shift, zakres } of lista) {
    // Zmianę przez północ liczymy w całości do dnia, w którym się zaczęła —
    // dla serii bez wolnego liczy się to, ile ktoś przepracował, a nie jak to
    // rozłożyć na daty.
    godzinyDnia[shift.date] = (godzinyDnia[shift.date] || 0) + (zakres[1] - zakres[0]) / 60;
  }
  const maWolne = (d) =>
    (absences || []).some(
      (a) =>
        a.status === "approved" &&
        a.start_date <= d &&
        d <= a.end_date &&
        (a.user_id ? String(a.user_id) === String(user.id) : a.user_name === user.name)
    );

  const serie = [];
  let biezaca = null;
  for (let d = od; d <= doDnia; d = addDaysYMD(d, 1)) {
    const godziny = godzinyDnia[d] || 0;
    if (godziny > 0 && !maWolne(d)) {
      biezaca = biezaca || { od: d, dni: 0, godziny: 0 };
      biezaca.dni += 1;
      biezaca.godziny += godziny;
      biezaca.do = d;
    } else if (biezaca) {
      serie.push(biezaca);
      biezaca = null;
    }
  }
  if (biezaca) serie.push(biezaca);
  return serie;
};

export const naruszeniaSerii = (args) =>
  serieBezWolnego(args)
    .filter((s) => s.godziny > SERIA_BEZ_WOLNEGO_H)
    .map((s) => ({
      typ: "seria",
      date: s.od,
      min: Math.round(s.godziny * 60),
      tekst: `${Math.round(s.godziny * 10) / 10} h w ciągu ${s.dni} dni bez dnia wolnego (${s.od} – ${s.do}).`,
    }));

// Wszystko razem dla jednej osoby w oknie [od, doDnia].
//
// Podział wg umowy: etatowiec dostaje reguły Kodeksu, reszta — samą serię bez
// wolnego. Serii NIE liczymy etatowcom, żeby jeden problem nie generował
// dwóch komunikatów: przekroczona seria prawie zawsze łamie też odpoczynek
// tygodniowy, a dwa ostrzeżenia o tym samym uczą ignorować oba.
export const ostrzezeniaKodeksu = ({ planShifts, absences, user, od, doDnia }) => {
  if (!user) return [];
  if (!naEtacie(user)) {
    return naruszeniaSerii({ planShifts, absences, user, od, doDnia });
  }
  const lista = zakresy(planShifts, user, addDaysYMD(od, -1), addDaysYMD(doDnia, 1));
  const out = [...naruszeniaDobowe(lista).filter((n) => n.date >= od && n.date <= doDnia)];
  for (let p = mondayOf(od); p <= doDnia; p = addDaysYMD(p, 7)) {
    out.push(...naruszeniaTygodniowe(planShifts, user, p));
  }
  return out;
};
