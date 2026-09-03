// @ts-nocheck
// Wnioski o wolne (urlop / niedostępność) — patrz CLAUDE.md "Urlopy i
// niedostępność". Jedyne miejsce, które tworzy/zatwierdza wnioski i
// materializuje godziny urlopu w shifts — nie duplikuj tej logiki w
// employeeSessionShared.tsx, ZatwierdzanieZmian.tsx ani Pracownicy.tsx.
import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";

export const URLOP_HOURS_PER_DAY = 8;
// 09:00–17:00 lokalnie — dowolna stała godzina, liczy się tylko różnica 8h
// dla podsumowań; realny czas pracy urlopu i tak nie istnieje.
const URLOP_START_HOUR = 9;

// Liczba dni kalendarzowych wniosku (włącznie z sobotą/niedzielą) — to,
// co pracownik naturalnie ma na myśli mówiąc "biorę 5 dni wolnego".
// Osobne od countWorkdays() niżej, które liczy tylko dni robocze (do
// godzin urlopu, patrz "8 godzin za dzień roboczy" w CLAUDE.md).
export const countCalendarDays = (startDate, endDate) => {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  return Math.round((end - start) / 86400000) + 1;
};

// Liczba dni roboczych (pon–pt) w zakresie — ten sam licznik co pętla w
// buildUrlopShiftDrafts() niżej, wydzielony osobno do samego liczenia bez
// budowania wpisów shifts (używane np. do podglądu godzin przed
// zatwierdzeniem wniosku).
export const countWorkdays = (startDate, endDate) => {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  let count = 0;
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

const fmtPL = (dateStr) =>
  dateStr
    ? new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

// Buduje wpisy shifts (jeden na dzień roboczy pon–pt, 8h, oznaczone
// is_urlop) dla zakresu [startDate, endDate] — sobota/niedziela pomijane,
// standardowa formuła "8 godzin za dzień roboczy" ustalona z właścicielem.
// Tylko dla type="urlop" — "niedostepnosc" jest nieodpłatna, nie generuje
// żadnych godzin (patrz resolveAbsenceRequest niżej).
export const buildUrlopShiftDrafts = ({ user, lokal, startDate, endDate, absenceId }) => {
  const drafts = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cursor <= end) {
    const dow = cursor.getDay(); // 0=niedziela..6=sobota
    if (dow !== 0 && dow !== 6) {
      const start = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        URLOP_START_HOUR,
        0,
        0
      );
      const stop = new Date(start);
      stop.setHours(stop.getHours() + URLOP_HOURS_PER_DAY);
      drafts.push({
        user_id: user.id,
        user_name: user.name,
        lokal,
        stanowisko: "Urlop",
        start_time: start.toISOString(),
        end_time: stop.toISOString(),
        godzin: URLOP_HOURS_PER_DAY,
        is_urlop: true,
        absence_id: absenceId,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return drafts;
};

// POST po jednym wpisie — api.post (patrz api/supabase.ts) nie ma
// batchowego insertu wielu wierszy naraz w tym projekcie.
const createUrlopShifts = async (drafts) => {
  const created = [];
  for (const draft of drafts) {
    const shift = await api.post("shifts", draft);
    created.push({
      ...shift,
      start_time: new Date(shift.start_time),
      end_time: new Date(shift.end_time),
    });
  }
  return created;
};

// Zatwierdzenie/odrzucenie wniosku z kolejki (Zatwierdzanie zmian). Przy
// zatwierdzeniu urlopu materializuje godziny w shifts — niedostępność
// zostaje tylko wpisem w absences, bez godzin (nieodpłatna, tylko blokada
// terminu na przyszły Grafik, patrz CLAUDE.md).
export const resolveAbsenceRequest = async ({ absence, user, editorName, decision }) => {
  const updated = await api.patch("absences", absence.id, {
    status: decision,
    decided_by: editorName,
    decided_at: new Date().toISOString(),
  });

  let createdShifts = [];
  if (decision === "approved" && absence.type === "urlop" && user) {
    const drafts = buildUrlopShiftDrafts({
      user,
      lokal: absence.lokal || user.default_lokal,
      startDate: absence.start_date,
      endDate: absence.end_date,
      absenceId: absence.id,
    });
    createdShifts = await createUrlopShifts(drafts);
  }

  if (absence.user_name) {
    const zakres = `${fmtPL(absence.start_date)}–${fmtPL(absence.end_date)}`;
    const rodzaj = absence.type === "urlop" ? "urlop" : "dni niedostępności";
    const msg =
      decision === "approved"
        ? `${editorName} zatwierdził(a) Twój wniosek o ${rodzaj} (${zakres}).`
        : `${editorName} odrzucił(a) Twój wniosek o ${rodzaj} (${zakres}).`;
    await createEmployeeNotification(absence.user_name, msg, "absence_resolved");
  }

  return { absence: updated, createdShifts };
};

// Bezpośredni wpis urlopu przez kierownika w karcie pracownika (Pracownicy)
// — od razu zatwierdzony, bez kolejki. Ten sam mechanizm materializacji
// godzin co resolveAbsenceRequest powyżej.
export const addUrlopDirectly = async ({ user, startDate, endDate, editorName, note }) => {
  const absence = await api.post("absences", {
    user_id: user.id,
    user_name: user.name,
    lokal: user.default_lokal || null,
    start_date: startDate,
    end_date: endDate,
    type: "urlop",
    status: "approved",
    note: note || null,
    requested_by: "manager",
    decided_by: editorName,
    decided_at: new Date().toISOString(),
  });
  const drafts = buildUrlopShiftDrafts({
    user,
    lokal: user.default_lokal,
    startDate,
    endDate,
    absenceId: absence.id,
  });
  const createdShifts = await createUrlopShifts(drafts);
  return { absence, createdShifts };
};

// Anulowanie wpisu (np. pomyłka kierownika) — kasuje wniosek i wszystkie
// powiązane wpisy godzin (dopasowane po absence_id, luźne odwołanie bez
// FK — ten sam wzorzec co shift_edits/task_completions).
export const deleteAbsence = async (absence, shifts) => {
  const relatedShifts = shifts.filter((s) => s.absence_id === absence.id);
  for (const s of relatedShifts) {
    await api.delete("shifts", s.id);
  }
  await api.delete("absences", absence.id);
  return { deletedShiftIds: relatedShifts.map((s) => s.id) };
};
