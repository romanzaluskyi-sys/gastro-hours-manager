// @ts-nocheck
// Umowa, norma i koszt pracownika.
//
// Sedno tego pliku to jedno rozróżnienie, którego wcześniej w projekcie nie
// było, a bez którego każda liczba w złotówkach jest myląca:
//
//   ZLECENIE      — lokal płaci za godziny. Koszt = godziny × stawka.
//                   Każda dopisana godzina naprawdę kosztuje.
//   UMOWA O PRACĘ — lokal płaci sumę miesięczną, niezależnie od tego, ile
//                   godzin człowiek przepracował. Godziny nie mówią wtedy o
//                   koszcie, tylko o tym, czy lokal ten koszt WYKORZYSTAŁ.
//
// Stąd dwie różne funkcje: `kosztMiesiaca` (ile lokal wydał) i `bilansOkresu`
// (ile z tego wydatku zamieniło się w przepracowane godziny). Mieszanie ich
// daje albo zawyżony labour cost, albo złudzenie, że etatowiec w tygodniu
// wolnym jest darmowy.
//
// ⚠️ Czego tu świadomie NIE MA: dopłat za nadgodziny i pracę w święta
// (50/100%). W gastronomii praca w święta jest dozwolona i powszechna, a
// dopłaty ponad ustawowe minimum to decyzja restauracji, nie reguła prawa —
// właściciel wprost prosił, żeby ich nie zaszywać. Miejsce na przyszłe
// wyjątki ("ten dzień ×1,5") jest, ale puste.
import { wymiarCzasuPracy } from "./kalendarz";

export const TYPY_UMOWY = [
  { key: "umowa_o_prace", label: "Umowa o pracę" },
  { key: "zlecenie", label: "Umowa zlecenie" },
  { key: "b2b", label: "B2B / faktura" },
  { key: "inna", label: "Inna" },
];

export const WYMIARY_ETATU = [
  { key: 1, label: "Pełny etat" },
  { key: 0.75, label: "3/4 etatu" },
  { key: 0.5, label: "1/2 etatu" },
  { key: 0.4, label: "2/5 etatu" },
  { key: 0.25, label: "1/4 etatu" },
];

export const OKRES_ROZLICZENIOWY_DOMYSLNY = 1;

export const typUmowyLabel = (key) =>
  (TYPY_UMOWY.find((t) => t.key === key) || {}).label || "";

export const wymiarLabel = (w) => {
  const found = WYMIARY_ETATU.find((x) => Math.abs(x.key - Number(w)) < 0.001);
  return found ? found.label : w ? `${w} etatu` : "";
};

// Typ umowy z fallbackiem na dawną kolumnę `etat`, która trzymała naraz i
// wymiar, i rodzaj umowy. Migracja 0018 przepisała to, co dało się przepisać,
// ale konta założone starym formularzem między migracją a wdrożeniem nadal
// mogą mieć samo `etat` — nie zgadujemy wtedy nic ponad to, co tam stoi.
export const typUmowy = (user) => {
  if (!user) return null;
  if (user.typ_umowy) return user.typ_umowy;
  if (user.etat === "zlecenie") return "zlecenie";
  if (user.etat === "pełny" || user.etat === "część") return "umowa_o_prace";
  return null;
};

export const naEtacie = (user) => typUmowy(user) === "umowa_o_prace";
export const naZleceniu = (user) => typUmowy(user) === "zlecenie";

const liczba = (v) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);

// Ile godzin ta osoba ma w danym miesiącu do przepracowania. Wymiar etatu
// skaluje normę — i tylko normę. Wynagrodzenie NIE jest przez niego mnożone:
// w umowie stoi kwota za ten właśnie wymiar, a nie kwota pełnoetatowa do
// przeliczenia.
export const normaMiesiaca = (user, rok, mies) => {
  if (!naEtacie(user)) return null;
  const wymiar = liczba(user.wymiar_etatu);
  if (wymiar == null) return null;
  return Math.round(wymiarCzasuPracy(rok, mies) * wymiar * 10) / 10;
};

// Ile godzina TEJ osoby kosztuje w TYM miesiącu — dla umowy o pracę zmienia
// się z miesiąca na miesiąc, bo zmienia się norma. To liczba do raportów, nie
// do planowania: przy planowaniu grafiku kolejna godzina w ramach normy nie
// kosztuje nic dodatkowego (patrz `kosztMiesiaca`).
export const stawkaEfektywna = (user, rok, mies) => {
  if (naZleceniu(user) || typUmowy(user) === "b2b") return liczba(user.stawka);
  if (naEtacie(user)) {
    const norma = normaMiesiaca(user, rok, mies);
    const kwota = liczba(user.wynagrodzenie_mies);
    if (!norma || kwota == null) return liczba(user.stawka);
    return Math.round((kwota / norma) * 100) / 100;
  }
  return liczba(user.stawka);
};

// Narzut pracodawcy (ZUS itd.) w procentach, z konfiguracji lokalu. Puste = 0,
// czyli dopóki właściciel go nie wpisze, nic nie jest zmyślane.
export const narzutDla = (user, lokalRow) => {
  if (!lokalRow) return 0;
  const p = naZleceniu(user) ? lokalRow.narzut_zlecenie : lokalRow.narzut_umowa;
  const n = liczba(p);
  return n == null ? 0 : n;
};

// Ile lokal WYDAJE na tę osobę w danym miesiącu.
//
// Dla umowy o pracę to suma z umowy — niezależnie od godzin. To jest właśnie
// odpowiedź na pytanie właściciela "ile lokal wydaje", a nie "ile pracownik
// zarobił za przepracowane godziny": etatowiec, który przepracował o 8 h za
// mało, kosztuje dokładnie tyle samo.
export const kosztMiesiaca = ({ user, godziny, lokalRow, rok, mies }) => {
  const narzut = 1 + narzutDla(user, lokalRow) / 100;
  if (naEtacie(user)) {
    const kwota = liczba(user.wynagrodzenie_mies);
    if (kwota != null) return kwota * narzut;
    // Bez kwoty z umowy da się jeszcze policzyć po stawce godzinowej, jeśli
    // ktoś ją wpisał — gorzej, ale lepiej niż "—".
    const st = liczba(user.stawka);
    return st == null ? null : (godziny || 0) * st * narzut;
  }
  const st = liczba(user.stawka);
  return st == null ? null : (godziny || 0) * st * narzut;
};

// Granice okresu rozliczeniowego, w którym leży dany miesiąc. Kotwiczymy je w
// początku roku kalendarzowego: przy 3 miesiącach wychodzą kwartały, przy 1 —
// same miesiące. Kotwica ruchoma (np. od daty zatrudnienia) dałaby każdemu
// pracownikowi inny okres i porównanie dwóch osób przestałoby cokolwiek
// znaczyć.
export const okresDla = (rok, mies, n) => {
  const dlugosc = Math.max(1, Math.min(12, Number(n) || OKRES_ROZLICZENIOWY_DOMYSLNY));
  const idx = Math.floor((mies - 1) / dlugosc);
  const od = idx * dlugosc + 1;
  return { od, do: Math.min(12, od + dlugosc - 1), dlugosc, rok };
};

// Bilans okresu rozliczeniowego: ile z normy zostało zamienione na godziny.
//
// ⚠️ Liczymy WYŁĄCZNIE miesiące już zamknięte. Porównanie przepracowanych 40 h
// do pełnej normy 176 h w połowie miesiąca pokazywałoby "brakuje 136 h" i
// znaczyłoby tylko tyle, że jest połowa miesiąca — ta sama zasada, co w
// raporcie tygodnia w Pulsie.
//
// ⚠️ Ujemny bilans NIE jest długiem pracownika. Jeśli lokal nie dał pracy w
// okresie, wynagrodzenie i tak się należy (przestój). To jest miara
// niewykorzystanego zasobu po stronie kierownika — i dlatego opis mówi
// "brakuje do wypracowania", a nie "zaległe".
export const bilansOkresu = ({ user, godzinyMiesiaca, lokalRow, dzis }) => {
  if (!naEtacie(user)) return null;
  const teraz = dzis ? new Date(dzis + "T00:00:00") : new Date();
  const rok = teraz.getFullYear();
  const mies = teraz.getMonth() + 1;
  const okres = okresDla(rok, mies, lokalRow && lokalRow.okres_rozliczeniowy);
  const odKiedy = user.data_zatrudnienia || null;
  const doKiedy = user.ostatni_dzien || null;

  const miesiace = [];
  const pominiete = [];
  for (let m = okres.od; m < mies && m <= okres.do; m++) {
    const norma = normaMiesiaca(user, rok, m);
    if (norma == null) continue;
    // Miesiąc sprzed zatrudnienia albo po ostatnim dniu pracy nie jest
    // niedoborem — tej osoby wtedy po prostu nie było.
    const koniecMies = `${rok}-${String(m).padStart(2, "0")}-31`;
    const poczatekMies = `${rok}-${String(m).padStart(2, "0")}-01`;
    if (odKiedy && odKiedy > koniecMies) continue;
    if (doKiedy && doKiedy < poczatekMies) continue;

    const godziny = godzinyMiesiaca(rok, m) || 0;
    // ⚠️ Miesiąc z zerem godzin pomijamy, zamiast liczyć go jako pełny
    // niedobór. Etatowiec, który przez cały miesiąc nie przepracował ani
    // godziny, praktycznie nie istnieje — to prawie zawsze znaczy, że danych
    // z tamtego miesiąca po prostu nie ma (system wdrożono później, umowę
    // uzupełniono wstecz). "Brakuje 176 h" byłoby wtedy alarmem o niczym, a
    // pierwszy taki alarm uczy kierownika ignorować wszystkie następne.
    if (godziny <= 0) {
      pominiete.push(m);
      continue;
    }
    miesiace.push({ rok, mies: m, norma, godziny });
  }
  const norma = miesiace.reduce((a, x) => a + x.norma, 0);
  const godziny = miesiace.reduce((a, x) => a + x.godziny, 0);

  const normaBiez = normaMiesiaca(user, rok, mies);
  return {
    okres,
    miesiace,
    pominiete,
    norma: Math.round(norma * 10) / 10,
    godziny: Math.round(godziny * 10) / 10,
    roznica: Math.round((godziny - norma) * 10) / 10,
    biezacy: {
      rok,
      mies,
      norma: normaBiez,
      godziny: Math.round((godzinyMiesiaca(rok, mies) || 0) * 10) / 10,
    },
  };
};

const h = (n) => `${Math.abs(Math.round(n * 10) / 10)}`.replace(".", ",");

// Jedno zdanie dla kierownika. Świadomie bez słowa "zaległe" i bez czerwieni
// w treści — powód w komentarzu przy `bilansOkresu`.
export const opisBilansu = (bilans) => {
  if (!bilans || bilans.miesiace.length === 0) return null;
  if (bilans.roznica < -0.5) return `do wypracowania brakuje ${h(bilans.roznica)} h`;
  if (bilans.roznica > 0.5) return `przepracowane o ${h(bilans.roznica)} h więcej`;
  return "zgodnie z normą";
};

// Prognoza końca miesiąca: to, co już przepracowane, plus to, co JUŻ STOI w
// opublikowanym grafiku. Świadomie nie średnie i nie ekstrapolacja — pracownik
// ma zobaczyć dokładnie to, co mu wpisano, i zdążyć zareagować przed końcem
// miesiąca, a nie dowiedzieć się po fakcie.
export const prognozaMiesiaca = ({ user, przepracowane, zaplanowane, rok, mies }) => {
  const norma = normaMiesiaca(user, rok, mies);
  const suma = (przepracowane || 0) + (zaplanowane || 0);
  return {
    norma,
    przepracowane: Math.round((przepracowane || 0) * 10) / 10,
    zaplanowane: Math.round((zaplanowane || 0) * 10) / 10,
    prognoza: Math.round(suma * 10) / 10,
    roznica: norma == null ? null : Math.round((suma - norma) * 10) / 10,
  };
};
