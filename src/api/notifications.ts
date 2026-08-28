// @ts-nocheck
import { api } from "./supabase";

// Ogólna funkcja do powiadamiania kierowników (admin + manager_lokalu)
// o zdarzeniach dotyczących danego lokalu. Współdzieli tabelę "notifications"
// z powiadomieniami dla pracowników o edycji/usunięciu zmiany — odróżnia je
// pole audience: "manager". Przeznaczona do reużycia w przyszłych modułach
// (Sanepid, Zadania/Sprzątanie), które będą wywoływać ją z różnym `type`.
export const createManagerNotification = async (lokal, message, type) => {
  return api.post("notifications", {
    audience: "manager",
    lokal,
    message,
    type,
    is_read: false,
  });
};
