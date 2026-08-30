// @ts-nocheck
// --- LOGIKA ZMIAN (nakładanie się, zmiany "dziś") ---

// Zwraca istniejącą zmianę danego pracownika, która nakłada się czasowo na
// [start, end) — albo null. Brak końca (end=null, zmiana otwarta) traktujemy
// jako "trwa w nieskończoność" dla porównania. Bierzemy pod uwagę tylko już
// ZAKOŃCZONE zmiany (end_time ustawiony) — nowa/otwarta zmiana tego samego
// pracownika jest już wykluczona wcześniej (formularz przechodzi w tryb
// "zakończ trwającą zmianę", zamiast pozwolić założyć drugą).
// excludeId pozwala pominąć samą edytowaną zmianę (np. w edycji przez kierownika).
export const findOverlappingShift = (shifts, userId, start, end, excludeId) => {
  const newEnd = end || new Date(8640000000000000);
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

// Zmiany danego pracownika, które zaczęły się dzisiaj (wg lokalnej daty) —
// do przypomnienia "dziś już zarejestrowano..." przy zakładce Wpisz.
export const getTodaysShiftsForUser = (shifts, userId) => {
  const today = new Date().toDateString();
  return shifts
    .filter((s) => s.user_id === userId && s.start_time.toDateString() === today)
    .sort((a, b) => a.start_time - b.start_time);
};
