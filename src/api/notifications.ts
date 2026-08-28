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

// Lustrzane odbicie powyższej funkcji, dla powiadomień samego pracownika
// (np. "Twój termin książeczki sanepid kończy się..."). Trafia do tej samej
// zakładki Wiadomości co powiadomienia o edycji/usunięciu zmiany.
export const createEmployeeNotification = async (userName, message, type) => {
  return api.post("notifications", {
    audience: "employee",
    user_name: userName,
    message,
    type,
    is_read: false,
  });
};
