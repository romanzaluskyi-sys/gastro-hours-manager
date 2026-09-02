// @ts-nocheck
// Wspólna logika zatwierdzania/poprawiania korekt godzin (issues.type ===
// "correction") — używana przez ZatwierdzanieZmian.tsx i inline akcje w
// Rejestr Godzin (ManagerDashboard.tsx), żeby nie duplikować tego samego
// zapisu do shifts/issues/shift_edits + powiadomienia w dwóch miejscach.
import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";
import { sendToGoogleSheets } from "../api/googleSheets";
import { toLocalYMD } from "../api/googleSheets";

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
  let endD = finalValues.end
    ? buildLocalDate(finalValues.date, finalValues.end)
    : null;
  if (endD && endD < startD) endD.setDate(endD.getDate() + 1);
  const godzin = endD
    ? parseFloat(((endD - startD) / 3600000).toFixed(2))
    : null;

  const existingShift = issue.shift_id
    ? shifts.find((s) => s.id === issue.shift_id)
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

  await api.patch("issues", issue.id, { status: "rozwiazane" });

  await api.post("shift_edits", {
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
    new_end_time: finalValues.end || null,
    source: reason ? "correction_adjusted" : "correction_approved",
  });

  const zakres = `${finalValues.start}${
    finalValues.end ? "–" + finalValues.end : ""
  }`;
  const msg = reason
    ? `Kierownik poprawił zgłoszoną przez Ciebie zmianę z dnia ${fmtPL(
        finalValues.date
      )} (${zakres}). Powód: ${reason}`
    : `Kierownik zatwierdził Twoją poprawkę zmiany z dnia ${fmtPL(
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
    ...savedShift,
    start_time: startD,
    end_time: endD,
  };
};

// "Zapytaj" — kierownik prosi pracownika o doprecyzowanie, bez rozwiązywania zgłoszenia.
export const askAboutCorrection = async (issue) => {
  if (!issue.user_name) return;
  await createEmployeeNotification(
    issue.user_name,
    `Kierownik pyta o szczegóły Twojego zgłoszenia korekty zmiany${
      issue.proposed_date ? ` z dnia ${fmtPL(issue.proposed_date)}` : ""
    }. Odpowiedz w Wiadomościach albo popraw zgłoszenie.`,
    "correction_query"
  );
};
