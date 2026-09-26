// @ts-nocheck
// Wspólna logika zatwierdzania/poprawiania korekt godzin (issues.type ===
// "correction") — używana przez ZatwierdzanieZmian.tsx i inline akcje w
// Rejestr Godzin (ManagerDashboard.tsx), żeby nie duplikować tego samego
// zapisu do shifts/issues/shift_edits + powiadomienia w dwóch miejscach.
import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";
import { sendToGoogleSheets } from "../api/googleSheets";
import { toLocalYMD } from "../api/googleSheets";
import { znajdzKolizjeWBazie } from "./shifts";

const fmtHHMM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`
    : "";

const buildLocalDate = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
};

const fmtPL = (dateStr) =>
  dateStr
    ? new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

// `finalValues`: { date, lokal, stanowisko, start, end } — albo propozycja
// pracownika bez zmian (Zatwierdź), albo dane poprawione przez kierownika
// (Popraw, wtedy podać też `reason`, widoczny dla pracownika).
export const resolveCorrection = async ({
  issue,
  shifts,
  editorName,
  finalValues,
  reason,
}) => {
  const startD = buildLocalDate(finalValues.date, finalValues.start);
  if (!startD) throw new Error("Brak daty lub godziny rozpoczęcia.");

  const existingShift = issue.shift_id
    ? shifts.find((s) => s.id === issue.shift_id)
    : null;

  // ⚠️ Puste "end" przy ISTNIEJĄCEJ zmianie znaczy "koniec bez zmian", nie
  // "skasuj koniec". Prośba o wcześniejszy start (wpis poza oknem tolerancji
  // lokalu, utils/wpisy.ts) powstaje, gdy zmiana dopiero się zaczyna — zanim
  // kierownik ją zatwierdzi, pracownik zwykle zdąży ją zakończyć. Patch z
  // `end_time: null` otworzyłby ją z powrotem i wyzerował godziny.
  const zachowanyKoniec =
    !finalValues.end && existingShift && existingShift.end_time
      ? new Date(existingShift.end_time)
      : null;
  let endD = finalValues.end
    ? buildLocalDate(finalValues.date, finalValues.end)
    : zachowanyKoniec;
  if (endD && !zachowanyKoniec && endD < startD) endD.setDate(endD.getDate() + 1);
  if (zachowanyKoniec && zachowanyKoniec <= startD) {
    throw new Error("Nowa godzina rozpoczęcia wypada po zakończeniu zmiany.");
  }
  const godzin = endD
    ? parseFloat(((endD - startD) / 3600000).toFixed(2))
    : null;

  let savedShift;
  if (existingShift) {
    savedShift = await api.patch("shifts", existingShift.id, {
      start_time: startD.toISOString(),
      end_time: endD ? endD.toISOString() : null,
      lokal: finalValues.lokal,
      stanowisko: finalValues.stanowisko,
      godzin,
    });
    sendToGoogleSheets(
      { ...savedShift, start_time: startD, end_time: endD },
      "EDIT_SHIFT"
    );
  } else {
    // ⚠️ Zgłoszenie "Zapomniałem odbić" tworzy NOWY wiersz godzin, więc dwa
    // wywołania tego samego zatwierdzenia dają dwa wpisy — dokładnie to, co
    // 08.09.2026 zdarzyło się w kolejce braków odbicia. Pytamy bazy, zanim
    // dopiszemy: jeśli ta zmiana już tam jest, przyjmujemy ją zamiast tworzyć
    // drugą, a zgłoszenie i tak zostanie rozwiązane niżej.
    const juzJest = await znajdzKolizjeWBazie({
      userId: issue.user_id,
      start: startD,
      end: endD,
      excludeId: null,
    });
    if (juzJest) {
      // Wiersz już jest — bierzemy istniejący zamiast tworzyć drugi. Reszta
      // (ślad w shift_edits, rozwiązanie zgłoszenia, powiadomienie) musi się
      // wykonać normalnie: wcześniejsze wyjście zostawiłoby zgłoszenie w
      // stanie "nowe" i wróciłoby ono do kolejki następnego dnia.
      savedShift = juzJest;
    } else {
      savedShift = await api.post("shifts", {
        user_id: issue.user_id,
        user_name: issue.user_name,
        lokal: finalValues.lokal,
        stanowisko: finalValues.stanowisko,
        start_time: startD.toISOString(),
        end_time: endD ? endD.toISOString() : null,
        godzin,
      });
      sendToGoogleSheets(
        { ...savedShift, start_time: startD, end_time: endD },
        "ADD_SHIFT"
      );
    }
  }

  await api.patch("issues", issue.id, { status: "rozwiazane" });

  const shiftEdit = await api.post("shift_edits", {
    shift_id: savedShift.id,
    issue_id: issue.id,
    editor_name: editorName,
    reason: reason || null,
    old_date: existingShift ? toLocalYMD(existingShift.start_time) : null,
    old_lokal: existingShift ? existingShift.lokal : null,
    old_stanowisko: existingShift ? existingShift.stanowisko : null,
    old_start_time: existingShift ? fmtHHMM(existingShift.start_time) : null,
    old_end_time: existingShift ? fmtHHMM(existingShift.end_time) : null,
    new_date: finalValues.date,
    new_lokal: finalValues.lokal,
    new_stanowisko: finalValues.stanowisko,
    new_start_time: finalValues.start,
    new_end_time: finalValues.end || (zachowanyKoniec ? fmtHHMM(zachowanyKoniec) : null),
    source: reason ? "correction_adjusted" : "correction_approved",
  });

  const koniecOpis =
    finalValues.end || (zachowanyKoniec ? fmtHHMM(zachowanyKoniec) : "");
  const zakres = `${finalValues.start}${koniecOpis ? "–" + koniecOpis : ""}`;
  const msg = reason
    ? `${editorName} poprawił(a) zgłoszoną przez Ciebie zmianę z dnia ${fmtPL(
        finalValues.date
      )} (${zakres}). Powód: ${reason}`
    : `${editorName} zatwierdził(a) Twoją poprawkę zmiany z dnia ${fmtPL(
        finalValues.date
      )} (${zakres}).`;
  if (issue.user_name) {
    await createEmployeeNotification(
      issue.user_name,
      msg,
      "correction_resolved"
    );
  }

  return {
    shift: { ...savedShift, start_time: startD, end_time: endD },
    shiftEdit,
  };
};

// Zamknięcie korekty BEZ zmiany godzin — dziś tylko dla duplikatu (ta sama
// prośba wysłana dwa razy, zwykle podwójne dotknięcie na tablecie). Bez
// powiadomienia: pracownik dostaje odpowiedź na pierwszą, identyczną prośbę,
// a druga wiadomość o tym samym tylko by go myliła. Bez śladu w shift_edits,
// bo niczego w godzinach nie zmieniamy.
export const odrzucKorekte = async (issue) => {
  await api.patch("issues", issue.id, { status: "rozwiazane" });
};

// "Zapytaj" — kierownik prosi pracownika o doprecyzowanie, bez rozwiązywania zgłoszenia.
export const askAboutCorrection = async (issue, editorName) => {
  if (!issue.user_name) return;
  await createEmployeeNotification(
    issue.user_name,
    `${editorName} pyta o szczegóły Twojego zgłoszenia korekty zmiany${
      issue.proposed_date ? ` z dnia ${fmtPL(issue.proposed_date)}` : ""
    }. Odpowiedz w Wiadomościach albo popraw zgłoszenie.`,
    "correction_query"
  );
};

// Propozycja pracownika w kształcie `finalValues` dla resolveCorrection —
// "Zatwierdź" bez żadnej poprawki. Woła ją i "Do decyzji", i szybkie ✓ na
// Pulpicie; oba mają zapisać dokładnie to samo.
export const propozycjaKorekty = (issue) => ({
  date: issue.proposed_date,
  lokal: issue.proposed_lokal,
  stanowisko: issue.proposed_stanowisko,
  start: issue.proposed_start_time,
  end: issue.proposed_end_time,
});

// Po resolveCorrection: zgłoszenie rozwiązane, zmiana podmieniona (albo
// dopisana, gdy to "Zapomniałem odbić"), ślad w historii. `shiftEdit` bywa
// pusty, gdy wiersz godzin już istniał i nie tworzyliśmy go drugi raz —
// patrz znajdzKolizjeWBazie wyżej.
export const wlozKorekteDoStanu = (issueId, { shift, shiftEdit }, { setIssues, setShifts, setShiftEdits }) => {
  setIssues((prev) =>
    prev.map((iss) => (iss.id === issueId ? { ...iss, status: "rozwiazane" } : iss))
  );
  setShifts((prev) => {
    const exists = prev.some((s) => s.id === shift.id);
    return exists ? prev.map((s) => (s.id === shift.id ? shift : s)) : [...prev, shift];
  });
  if (shiftEdit && setShiftEdits) setShiftEdits((prev) => [...prev, shiftEdit]);
};

// Ta sama prośba wysłana dwa razy (podwójne dotknięcie na tablecie, dwa
// urządzenia). Zwraca id KOLEJNYCH kopii — pierwsza zostaje zwykłą korektą.
// `issues` mają być posortowane od najstarszej, inaczej "pierwsza" znaczy
// cokolwiek.
export const duplikatyKorekt = (issues) => {
  const odcisk = (iss) =>
    [
      iss.user_id,
      iss.proposed_date,
      iss.proposed_start_time,
      iss.proposed_end_time || "",
      iss.shift_id || "",
    ].join("|");
  const widziane = new Set();
  const duplikaty = new Set();
  for (const iss of issues || []) {
    const k = odcisk(iss);
    if (widziane.has(k)) duplikaty.add(iss.id);
    widziane.add(k);
  }
  return duplikaty;
};

// Ślad RĘCZNEJ zmiany wpisu z Rejestru godzin (od 0.50.0): dodanie, edycja,
// usunięcie. Do 0.49.0 w `shift_edits` lądowały tylko korekty zatwierdzone w
// "Do decyzji", a kierownik poprawiający godziny wprost w Rejestrze nie
// zostawiał żadnego śladu — "kto i dlaczego zmienił mi godziny" nie miało
// odpowiedzi. `stara`/`nowa` to wiersze `shifts` (start_time/end_time jako
// Date) albo null.
//
// ⚠️ NIE rzuca: godziny są już zapisane, a wyjątek pokazałby "Błąd zapisu"
// po operacji, która się udała. Zwraca wiersz albo null.
export const zapiszSladRecznejZmiany = async ({ stara, nowa, editorName, reason, source }) => {
  const opis = (s, przedrostek) =>
    s
      ? {
          [`${przedrostek}_date`]: toLocalYMD(s.start_time),
          [`${przedrostek}_lokal`]: s.lokal,
          [`${przedrostek}_stanowisko`]: s.stanowisko,
          [`${przedrostek}_start_time`]: fmtHHMM(s.start_time),
          [`${przedrostek}_end_time`]: s.end_time ? fmtHHMM(s.end_time) : null,
        }
      : {};
  try {
    return await api.post("shift_edits", {
      shift_id: String((nowa || stara).id),
      issue_id: null,
      editor_name: editorName,
      reason: reason || null,
      ...opis(stara, "old"),
      ...opis(nowa, "new"),
      source,
    });
  } catch (e) {
    console.error("Nie zapisano śladu zmiany:", e);
    return null;
  }
};
