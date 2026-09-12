// @ts-nocheck
// --- LOGIKA ZMIAN (nakładanie się, zmiany "dziś") ---

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
