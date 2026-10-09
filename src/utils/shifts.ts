// @ts-nocheck
// --- LOGIKA ZMIAN (nakładanie się, zmiany "dziś") ---
import { api } from "../api/supabase";

// Zwraca istniejącą zmianę danego pracownika, która nakłada się czasowo na
// [start, end) — albo null.
//
// ⚠️ Zmiana BEZ KOŃCA (właśnie rozpoczęta) NIE trwa w nieskończoność. Do
// 0.35.x stało tu `new Date(8640000000000000)` — maksymalna data JS, rok
// 275760 — więc świeżo rozpoczynana zmiana kolidowała z KAŻDĄ przyszłą zmianą
// tej osoby. Odkąd urlop materializuje się jako zwykłe wiersze `shifts`,
// wystarczyło mieć zatwierdzony urlop na przyszły tydzień, żeby nie dać się
// odbić w ogóle: kontrola trafiała w pierwszy dzień urlopu i mówiła o
// "zapisanej zmianie 11:00–19:00", której nikt nie umiał znaleźć — bo była
// trzy dni później i była urlopem.
//
// Rozpoczynaną zmianę ograniczamy więc do końca JEJ WŁASNEJ doby. Ochrona,
// o którą chodziło (nie da się odbić zmiany w dzień urlopu), zostaje; fałszywy
// alarm z przyszłego tygodnia znika.
//
// Bierzemy pod uwagę tylko już ZAKOŃCZONE zmiany (end_time ustawiony) —
// otwarta zmiana tego samego pracownika jest wykluczona wcześniej (formularz
// przechodzi w tryb "zakończ trwającą zmianę").
// excludeId pozwala pominąć samą edytowaną zmianę (np. w edycji przez kierownika).
const koniecDoby = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);

export const findOverlappingShift = (shifts, userId, start, end, excludeId) => {
  const newEnd = end || koniecDoby(start);
  return (
    shifts.find(
      (s) =>
        s.user_id === userId &&
        s.id !== excludeId &&
        s.end_time &&
        start < s.end_time &&
        s.start_time < newEnd
    ) || null
  );
};

// Opis kolidującej zmiany do komunikatu. Z DATĄ i ze słowem "urlop", gdy to
// urlop — bez daty komunikat podawał same godziny, więc kierownik szukał
// zmiany 11:00-19:00 w dniu, w którym jej nie było, i słusznie stwierdzał, że
// system kłamie.
export const opisKolidujacej = (s) => {
  const dd = (d) =>
    `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hh = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const zakres = s.end_time ? `${hh(s.start_time)}–${hh(s.end_time)}` : `od ${hh(s.start_time)}`;
  return `${dd(s.start_time)}, ${zakres}${s.is_urlop ? " — urlop" : ""}`;
};

// Zmiany danego pracownika, które zaczęły się dzisiaj (wg lokalnej daty) —
// do przypomnienia "dziś już zarejestrowano..." przy zakładce Wpisz.
export const getTodaysShiftsForUser = (shifts, userId) => {
  const today = new Date().toDateString();
  return shifts
    .filter((s) => s.user_id === userId && s.start_time.toDateString() === today)
    .sort((a, b) => a.start_time - b.start_time);
};

// To samo pytanie co findOverlappingShift, ale zadane BAZIE, tuż przed
// zapisem — bo lokalna lista odbić potrafi być nieaktualna.
//
// Tablet Służbowy stoi w lokalu zalogowany tygodniami, a druga osoba może
// wpisywać tę samą zmianę z panelu kierownika w tej samej minucie. 13.09
// skończyło się to dwiema identycznymi zmianami dla Natalii i Katii, wpisanymi
// z dwóch sesji w odstępie 29 minut: żadna z nich nie widziała wpisu drugiej,
// więc kontrola kolizji nie miała na czym zadziałać.
//
// Okno ±1 dzień, bo zmiana może przechodzić przez północ.
//
// ⚠️ Błąd sieci NIE blokuje zapisu. Niezapisana zmiana to czyjeś godziny i
// czyjeś pieniądze; ewentualny duplikat jest odwracalny jednym kliknięciem
// kierownika, a utracone odbicie trzeba odtwarzać z pamięci.
export const zmianyOsobyWBazie = async (userId, start) => {
  const od = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const doKiedy = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 2);
  const wiersze = await api.get(
    "shifts",
    `user_id=eq.${userId}&start_time=gte.${od.toISOString()}&start_time=lt.${doKiedy.toISOString()}`
  );
  return (Array.isArray(wiersze) ? wiersze : []).map((s) => ({
    ...s,
    start_time: new Date(s.start_time),
    end_time: s.end_time ? new Date(s.end_time) : null,
  }));
};

export const znajdzKolizjeWBazie = async ({ userId, start, end, excludeId }) => {
  if (!userId || !start) return null;
  try {
    const parsed = await zmianyOsobyWBazie(userId, start);
    return findOverlappingShift(parsed, userId, start, end, excludeId);
  } catch (e) {
    return null;
  }
};

// Niezakończona zmiana tej osoby, którą wpisywany właśnie odcinek [start, end)
// w praktyce OPISUJE — czyli ta sama praca, tylko wpisana drugi raz.
//
// 25.09.2026: Natalia odbiła start o 09:00 i nie odbiła końca. Po progu lokalu
// zmiana przestała być "trwającą", więc formularz nie proponował już
// "Zakończ", tylko nową zmianę. Wpisała całą 09:00–18:00 (poza oknem, więc
// poszło do kierownika jako korekta BEZ shift_id), kierownik zatwierdził i
// powstał drugi wiersz — a pierwszy dalej wisiał w "Zmianach bez zakończenia".
// findOverlappingShift tego nie widzi, bo zmian bez końca świadomie nie liczy.
//
// ⚠️ Warunek to "start otwartej zmiany leży W ŚRODKU wpisu" (z zapasem
// ZAPAS_PRZED_STARTEM_MIN, bo odbicie o 09:10 i wpis od 09:00 to ta sama
// praca), a NIE zwykłe nakładanie się z otwartą zmianą do końca doby. Przy
// zmianie dzielonej rano zostaje porzucone 09:00, a wieczorem ktoś wpisuje
// 18:00–22:00 — to druga część dnia, nie zakończenie porannej.
//
// Pomija zmiany rozstrzygnięte przez kierownika (`rozliczenie`) — odrzucona
// "nie było jej" i nowy wpis niczego nie dubluje.
const ZAPAS_PRZED_STARTEM_MIN = 120;

export const znajdzOtwartaDoZakonczenia = (shifts, userId, start, end) => {
  if (!userId || !start) return null;
  const koniec = end || koniecDoby(start);
  const najwczesniej = start.getTime() - ZAPAS_PRZED_STARTEM_MIN * 60000;
  const pasujace = (shifts || []).filter(
    (s) =>
      String(s.user_id) === String(userId) &&
      !s.end_time &&
      !s.is_urlop &&
      !s.rozliczenie &&
      s.start_time.getTime() >= najwczesniej &&
      s.start_time < koniec
  );
  pasujace.sort(
    (a, b) =>
      Math.abs(a.start_time - start) - Math.abs(b.start_time - start)
  );
  return pasujace[0] || null;
};

// To samo zadane BAZIE (kierownik zatwierdza korektę z danymi sprzed pollu).
// Błąd sieci = null: wtedy zostaje dotychczasowe zachowanie.
export const znajdzOtwartaWBazie = async ({ userId, start, end }) => {
  if (!userId || !start) return null;
  try {
    const parsed = await zmianyOsobyWBazie(userId, start);
    return znajdzOtwartaDoZakonczenia(parsed, userId, start, end);
  } catch (e) {
    return null;
  }
};
