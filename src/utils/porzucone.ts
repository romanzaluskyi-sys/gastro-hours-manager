// @ts-nocheck
// Zmiany, które ktoś zaczął i nigdy nie zakończył.
//
// Powód jest prawie zawsze ten sam co przy braku odbicia: tablet stoi w
// kuchni, a wyjście jest przez salę. Zostawiona tak, zmiana wisi otwarta w
// nieskończoność i psuje dwie rzeczy naraz — ekran "Kto jest teraz w pracy"
// pokazuje ludzi, których dawno nie ma, a pracownikowi BLOKUJE kolejne
// odbicie (formularz przechodzi wtedy w tryb "zakończ trwającą zmianę" i nie
// da się zacząć nowej).
//
// ⚠️ "Zamknięcie" takiej zmiany NIE oznacza wpisania końca. `end_time` zostaje
// NULL, bo nikt nie wie, o której ta osoba wyszła — a zgadnięta godzina to
// czyjaś wypłata. Wiersz bez końca daje ZERO godzin wszędzie sam z siebie:
// każde podsumowanie w tej apce liczy `end_time - start_time` i pomija wiersze
// bez końca, więc nie trzeba dokładać wyjątku w dziesięciu miejscach. Zmienia
// się tylko jedno: zmiana przestaje być uznawana za TRWAJĄCĄ.
//
// Wiersza też nie kasujemy. "O 8:02 ta osoba odbiła start" to jedyny twardy
// ślad, jaki kierownik ma — i to z niego wynika, że w ogóle przyszła.
//
// Decyzję podejmuje człowiek, w zakładce Zatwierdzanie zmian: wpisać godziny
// albo odrzucić. Tak samo jak przy zmianach z grafiku bez odbicia — patrz
// utils/odbicia.ts, ta sama para nazw `rozliczenie`.
import { api } from "../api/supabase";
import { toLocalYMD } from "../api/googleSheets";
import { trimTime, timeToMin, publishedShiftsFor } from "./grafik";
import { createEmployeeNotification } from "../api/notifications";

// Ile godzin PO planowanym końcu zmiany uznajemy, że ktoś po prostu nie
// odbił końca. Cztery godziny to zapas na to, co w gastronomii normalne:
// zmiana się przedłuża, bo sala pełna.
export const TOLERANCJA_PO_GRAFIKU_H = 4;

// Ile godzin może trwać zmiana kogoś, kogo tego dnia nie było w grafiku.
// Siedemnaście, a nie dwanaście: zmiana dzielona z długą przerwą i doba
// przez północ mają się zmieścić, a nikt nie pracuje siedemnastu godzin.
export const MAX_DLUGOSC_ZMIANY_H = 17;

const liczbaAlbo = (v, domyslna) => {
  const n = v === "" || v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : domyslna;
};

// Progi stoją na lokalu (migracja 0023), tak jak narzut i okres rozliczeniowy.
// Puste = wartości domyślne, więc lokal, którego nikt nie skonfigurował,
// zachowuje się rozsądnie.
export const progiLokalu = (lokaleRows, lokalName) => {
  const row = (lokaleRows || []).find((l) => l.name === lokalName);
  return {
    tolerancja: liczbaAlbo(row?.tolerancja_po_grafiku_h, TOLERANCJA_PO_GRAFIKU_H),
    maks: liczbaAlbo(row?.max_dlugosc_zmiany_h, MAX_DLUGOSC_ZMIANY_H),
  };
};

// Najpóźniejszy planowany koniec tej osoby w dniu, w którym zaczęła się
// zmiana. NAJPÓŹNIEJSZY, nie pierwszy: przy zmianie dzielonej (12:00–16:00 i
// 18:00–22:00) pierwszy koniec zrzynałby zmianę o 20:00, w środku drugiej
// części, kiedy człowiek jeszcze pracuje.
//
// Liczy się tylko grafik OPUBLIKOWANY — wersja robocza kierownika nie jest
// obietnicą i nie może decydować o czyichś godzinach.
export const planowanyKoniec = (planShifts, user, startDate) => {
  const dzien = toLocalYMD(startDate);
  let najpozniej = null;
  for (const s of publishedShiftsFor(planShifts, user)) {
    if (s.date !== dzien) continue;
    const od = timeToMin(trimTime(s.start_time));
    const doG = timeToMin(trimTime(s.end_time));
    if (od == null || doG == null) continue;
    const [y, m, d] = s.date.split("-").map(Number);
    const koniec = new Date(y, m - 1, d, 0, 0, 0);
    // Zmiana przez północ kończy się nazajutrz — ta sama zasada co w grafiku.
    koniec.setMinutes(doG > od ? doG : doG + 1440);
    if (!najpozniej || koniec > najpozniej) najpozniej = koniec;
  }
  return najpozniej;
};

// Moment, od którego przestajemy wierzyć, że ta zmiana wciąż trwa.
//
// Dwie reguły i celowo żadnego mieszania ich ze sobą:
//   - osoba stała tego dnia w opublikowanym grafiku → planowany koniec + tolerancja;
//   - nie stała → start + maksymalna długość zmiany.
//
// ⚠️ Grafik liczy się tylko wtedy, gdy planowany koniec wypada PO starcie.
// Kto odbił się o 18:00, mając w grafiku 08:00–16:00, pracuje faktycznie poza
// planem — plan nie mówi wtedy nic o tym, kiedy ta osoba wyjdzie, a użyty
// dosłownie zrzynałby zmianę dwie godziny po jej rozpoczęciu.
export const progZakonczenia = ({ shift, planShifts, user, progi }) => {
  const { tolerancja, maks } = progi || {
    tolerancja: TOLERANCJA_PO_GRAFIKU_H,
    maks: MAX_DLUGOSC_ZMIANY_H,
  };
  const koniecPlanu = planowanyKoniec(planShifts, user || shift, shift.start_time);
  if (koniecPlanu && koniecPlanu > shift.start_time) {
    return {
      prog: new Date(koniecPlanu.getTime() + tolerancja * 3600000),
      powod: "grafik",
      koniecPlanu,
      tolerancja,
      maks,
    };
  }
  return {
    prog: new Date(shift.start_time.getTime() + maks * 3600000),
    powod: "limit",
    koniecPlanu: null,
    tolerancja,
    maks,
  };
};

// Zmiana otwarta, która przekroczyła swój próg. Urlopu nie dotyczy (to
// zmaterializowany wniosek, zawsze z końcem), rozliczonej też nie — kolejka,
// która pokazuje w kółko to samo, przestaje być czytana.
export const czyPorzucona = ({ shift, planShifts, lokale, users, now = new Date() }) => {
  if (!shift || shift.end_time || shift.is_urlop || shift.rozliczenie) return null;
  const user =
    (users || []).find((u) => String(u.id) === String(shift.user_id)) || {
      id: shift.user_id,
      name: shift.user_name,
    };
  const info = progZakonczenia({
    shift,
    planShifts,
    user,
    progi: progiLokalu(lokale, shift.lokal),
  });
  return now >= info.prog ? { ...info, shift, user } : null;
};

// Cała kolejka dla kierownika. Najstarsze pierwsze — tak samo jak korekty i
// zmiany bez odbicia, bo najstarsza pozycja jest tą, o której najtrudniej
// będzie komukolwiek cokolwiek sobie przypomnieć.
//
// ⚠️ Bez okna czasowego, inaczej niż przy zmianach bez odbicia (OKNO_DNI = 14).
// Tam pytanie brzmi "czy on tamtego wtorku w ogóle przyszedł" i po dwóch
// tygodniach nikt tego nie wie. Tutaj wiadomo NA PEWNO, że przyszedł — został
// ślad odbicia — więc pozycja jest niezapłaconą pracą, a ta się nie przedawnia.
export const zmianyPorzucone = ({
  shifts,
  planShifts,
  lokale,
  users,
  lokalOk,
  now = new Date(),
}) =>
  (shifts || [])
    .filter((s) => !lokalOk || lokalOk(s.lokal))
    .map((shift) => czyPorzucona({ shift, planShifts, lokale, users, now }))
    .filter(Boolean)
    .sort((a, b) => a.shift.start_time - b.shift.start_time);

// Otwarte zmiany, które JESZCZE trwają — czyli te, które wolno pokazać jako
// "teraz w pracy" i które blokują rozpoczęcie kolejnej.
export const zmianaTrwa = ({ shift, planShifts, lokale, users, now = new Date() }) =>
  !!shift &&
  !shift.end_time &&
  !shift.rozliczenie &&
  !czyPorzucona({ shift, planShifts, lokale, users, now });

// Decyzja kierownika.
//
// 'zapisano' — godziny wpisane ręcznie; dopiero tutaj pojawia się `end_time`,
// więc dopiero tutaj te godziny wchodzą do wszystkich podsumowań.
// 'odrzucono' — zmiany nie było (ktoś odbił się przez pomyłkę albo za kogoś).
// Wiersz zostaje bez końca, czyli bez godzin, i znika z kolejki na zawsze.
export const rozliczPorzucona = async ({
  shift,
  decyzja,
  end,
  kto,
  shifts,
  setShifts,
}) => {
  const dane = {
    rozliczenie: decyzja,
    rozliczenie_przez: kto,
    rozliczenie_at: new Date().toISOString(),
  };

  if (decyzja === "zapisano") {
    if (!end) throw new Error("Podaj godzinę zakończenia zmiany.");
    const [h, m] = trimTime(end).split(":").map(Number);
    const endD = new Date(shift.start_time);
    endD.setHours(h, m, 0, 0);
    // Zmiana przez północ kończy się nazajutrz — ta sama zasada co wszędzie.
    if (endD <= shift.start_time) endD.setDate(endD.getDate() + 1);
    dane.end_time = endD.toISOString();
    dane.godzin = Math.round(((endD - shift.start_time) / 3600000) * 100) / 100;
  }

  const zapisana = await api.patch("shifts", shift.id, dane);
  // Scalamy z wierszem, który już mamy, zamiast podmieniać go odpowiedzią w
  // całości: gdyby baza kiedykolwiek oddała samą zmienioną część, podmiana
  // wyczyściłaby lokal, stanowisko i godzinę startu — czyli dokładnie to,
  // czym ta pozycja jest dla kierownika.
  const parsed = {
    ...shift,
    ...zapisana,
    start_time: new Date(zapisana.start_time || shift.start_time),
    end_time: zapisana.end_time ? new Date(zapisana.end_time) : null,
  };
  setShifts((shifts || []).map((s) => (String(s.id) === String(shift.id) ? parsed : s)));

  // Pracownik ma wiedzieć, co się stało z jego godzinami — to jego wypłata.
  const dataPL = toLocalYMD(shift.start_time).split("-").reverse().join(".");
  const odGodz = `${String(shift.start_time.getHours()).padStart(2, "0")}:${String(
    shift.start_time.getMinutes()
  ).padStart(2, "0")}`;
  await createEmployeeNotification(
    shift.user_name,
    decyzja === "zapisano"
      ? `Zmiana z ${dataPL} (${shift.lokal}) nie miała odbitego końca. ` +
          `${kto} zapisał(a) ją jako ${odGodz}–${trimTime(end)}.`
      : `Zmiana z ${dataPL} (${shift.lokal}) bez odbitego końca została odrzucona przez ${kto}. ` +
          "Jeśli to pomyłka, zgłoś to przez zakładkę Zgłoś.",
    "porzucona"
  ).catch(() => {});

  return parsed;
};
