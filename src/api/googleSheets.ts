// @ts-nocheck
import { GOOGLE_SCRIPT_URL } from "../config";

// --- API GOOGLE SHEETS (DODANO UUID I AKCJE) ---
export const toLocalYMD = (d) => {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const sendToGoogleSheets = async (shift, actionType = "ADD_SHIFT") => {
  if (!GOOGLE_SCRIPT_URL.includes("script.google.com")) return;
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: actionType,
        shift_id: shift.id, // Ważne dla edycji i usuwania!
        pracownik: shift.user_name,
        lokal: shift.lokal,
        dataPracy: toLocalYMD(shift.start_time),
        start: new Date(shift.start_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        koniec: shift.end_time
          ? new Date(shift.end_time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
      }),
    });
  } catch (err) {
    console.error("Błąd wysyłania do Google Sheets:", err);
  }
};
