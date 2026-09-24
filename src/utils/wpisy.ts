// @ts-nocheck
// Jak w danym lokalu wolno wpisywać godziny: sposób wpisu i okna tolerancji.
// Ustawienia stoją na lokalu (migracja 0036, karta lokalu w Ustawieniach).
//
// Pytanie, na które odpowiada ten plik: czy pracownik może SAM zapisać tę
// godzinę. Nie: czy da się ją zapisać w ogóle — wpis spoza okna idzie do
// kierownika jako zwykła korekta (`issues.type = 'correction'`) i to kierownik
// go zatwierdza. Okno ma zatrzymać wpisywanie z pamięci godzinami po fakcie,
// a nie odebrać komuś zapłatę za przepracowany czas.
//
// ⚠️ Wszystkie ustawienia NULL = zachowanie sprzed 0.45.0 (oba sposoby, bez
// limitów). Lokal, którego nikt nie skonfigurował, nie może się niczym różnić
// od wczoraj — dlatego każda funkcja niżej przy `null` po prostu przepuszcza.
//
// ⚠️ To jest kontrola w PRZEGLĄDARCE. Dopóki `shifts` ma otwarte polityki,
// dałoby się ją obejść zapytaniem wprost do bazy. Twardy zamek to trigger na
// `shifts` — razem z zawężeniem tej tabeli w Etapie 3c-2.

// Sposoby wpisu. `null` (oba) to wartość domyślna i jednocześnie stan każdego
// lokalu sprzed tej funkcji.
export const TRYBY_WPISU = [
  {
    key: null,
    label: "Oba sposoby",
    opis: "Pracownik wybiera: sam start albo cała zmiana naraz (jak dotąd).",
  },
  {
    key: "odbicie",
    label: "Tylko odbicie",
    opis: "Najpierw „Rozpocznij”, potem „Zakończ”. Bez wpisywania całej zmiany naraz.",
  },
  {
    key: "cala",
    label: "Tylko cała zmiana",
    opis: "Początek i koniec jednym zapisem, po zakończeniu pracy.",
  },
];

// Ile minut W PRZÓD wybaczamy. Zegar tabletu bywa przestawiony o minutę-dwie,
// a ktoś wybiera "08:00", stojąc przy tablecie o 7:58. Świadomie stała, nie
// ustawienie: to margines na zegar, a nie decyzja lokalu.
export const W_PRZOD_MIN = 5;

// Godzina z pola HH:MM jest zawsze budowana na DZIŚ. Jeśli wychodzi dalej niż
// pół doby w przyszłości, człowiek miał na myśli wczoraj — ktoś o 00:10
// wpisuje start 23:55. Pół doby, a nie "cokolwiek w przyszłości": start 09:00
// wpisany o 08:00 to próba wpisu z wyprzedzeniem i ma dostać ten komunikat,
// a nie zamienić się po cichu w "wczoraj o 9:00".
const POL_DOBY_MS = 12 * 3600000;

const minuty = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export const regulyWpisu = (lokaleRows, lokalName) => {
  const row = (lokaleRows || []).find((l) => l.name === lokalName);
  const tryb =
    row?.tryb_wpisu === "odbicie" || row?.tryb_wpisu === "cala" ? row.tryb_wpisu : null;
  return {
    tryb,
    startWstecz: minuty(row?.start_wstecz_min),
    koniecWstecz: minuty(row?.koniec_wstecz_min),
  };
};

// Czy pracownik ma "Znam godzinę zakończenia" zaznaczone, zablokowane, czy do
// wyboru. `null` = do wyboru (tryb "oba").
export const wymuszonaCalaZmiana = (reguly) =>
  reguly?.tryb === "odbicie" ? false : reguly?.tryb === "cala" ? true : null;

export const przesunNaWczoraj = (d) => {
  const w = new Date(d);
  w.setDate(w.getDate() - 1);
  return w;
};

// Start wpisany samą godziną — dopasowany do "teraz" przez północ.
export const dopasujStart = (startD, teraz) =>
  startD.getTime() - teraz.getTime() > POL_DOBY_MS ? przesunNaWczoraj(startD) : startD;

// Cała zmiana wpisana godzinami: koniec był już przesunięty na jutro, jeśli
// wypadał przed startem. Jeśli po tym wszystkim koniec jest pół doby przed
// nami, to była wczorajsza zmiana — przesuwamy OBA końce, żeby nie rozerwać
// zmiany przez północ (16:00–00:05 wpisane o 00:10).
export const dopasujCalaZmiane = (startD, endD, teraz) =>
  endD.getTime() - teraz.getTime() > POL_DOBY_MS
    ? { startD: przesunNaWczoraj(startD), endD: przesunNaWczoraj(endD) }
    : { startD, endD };

// null = wolno; inaczej powód i — przy spóźnieniu — najwcześniejsza godzina,
// jaką pracownik może jeszcze wpisać sam.
export const sprawdzGodzine = (d, teraz, wsteczMin) => {
  if (wsteczMin == null || !d) return null;
  if (d.getTime() > teraz.getTime() + W_PRZOD_MIN * 60000) return { powod: "przyszlosc" };
  const najwczesniej = new Date(teraz.getTime() - wsteczMin * 60000);
  if (d.getTime() < najwczesniej.getTime()) return { powod: "za_pozno", najwczesniej };
  return null;
};

// Opis okna do karty lokalu i do podpisu w formularzu pracownika.
export const opisOkna = (wsteczMin) =>
  wsteczMin == null
    ? "bez ograniczeń"
    : wsteczMin === 0
    ? "tylko „teraz”"
    : `do ${wsteczMin} min po fakcie`;

// Podpis pod formularzem pracownika — mówi z góry, gdzie jest granica, zanim
// ktoś się o nią potknie. null, gdy okna nie ustawiono (nic się nie zmienia).
export const podpisOkna = (rodzaj, wsteczMin) => {
  if (wsteczMin == null) return null;
  if (rodzaj === "cala") {
    return wsteczMin === 0
      ? "W tym lokalu całą zmianę zapisujesz sam tylko w chwili jej zakończenia. Później — przez kierownika."
      : `W tym lokalu całą zmianę zapisujesz sam najpóźniej ${wsteczMin} min po jej zakończeniu. Później — przez kierownika.`;
  }
  const co = rodzaj === "koniec" ? "Koniec" : "Start";
  return wsteczMin === 0
    ? `W tym lokalu ${co.toLowerCase()} zapisujesz sam tylko z godziną „teraz”. Inną godzinę zatwierdza kierownik.`
    : `${co} możesz sam cofnąć najwyżej o ${wsteczMin} min. Wcześniejszą godzinę zatwierdza kierownik.`;
};

// Zmiana, dla której pracownik wysłał już prośbę o godzinę zakończenia, NIE
// trwa — czeka na kierownika. Bez tego zostałaby na tablecie jako trwająca i
// blokowała rozpoczęcie następnej, a jedynym wyjściem byłoby "Zakończ teraz",
// czyli dopisanie sobie godzin, których nie było.
export const czekaNaKoniecOdKierownika = (shift, issues) =>
  !!shift &&
  (issues || []).some(
    (i) =>
      i.type === "correction" &&
      i.status !== "rozwiazane" &&
      String(i.shift_id) === String(shift.id) &&
      !!i.proposed_end_time
  );
