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
//
// `dane` (0.70.0, migracja 0039) — szczegóły w kształcie do pokazania w
// e-mailu: `{ wiersze: [{ e, w, bylo }], cytat, odpowiedz: { kto, tekst } }`.
// Aplikacja ich NIE czyta — w Wiadomościach dalej stoi `message`. Bez `dane`
// e-mail pokaże samą treść, więc to dodatek, nie warunek.
//
// ⚠️ Zapis z `dane` na bazie bez 0039 padłby w CAŁOŚCI (PostgREST odrzuca
// nieznaną kolumnę: "Could not find the 'dane' column…"), a pracownik nie
// dostałby wiadomości wcale. Dlatego wtedy drugi zapis bez `dane` — kopia w
// e-mailu jest mniej ważna niż wiadomość. Tylko przy TYM błędzie: ponowienie
// po zerwanym połączeniu mogłoby zapisać wiadomość dwa razy.
export const createEmployeeNotification = async (userName, message, type, dane = null) => {
  const wiersz = {
    audience: "employee",
    user_name: userName,
    message,
    type,
    is_read: false,
  };
  if (!dane) return api.post("notifications", wiersz);
  try {
    return await api.post("notifications", { ...wiersz, dane });
  } catch (e) {
    if (!/dane/.test(String(e && e.message))) throw e;
    return api.post("notifications", wiersz);
  }
};

// Opis dnia i zmiany tak, jak stoją w e-mailu ("czw 1 paź · 08:30–21:00").
// Liczone tu, przy tworzeniu wiadomości, bo tylko tu wiadomo, o którą zmianę
// chodzi — serwer dostaje gotowy tekst.
const DNI_KROTKO = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
const MIES_KROTKO = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
export const opisDnia = (ymd) => {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const data = new Date(y, m - 1, d);
  return `${DNI_KROTKO[data.getDay()]} ${d} ${MIES_KROTKO[m - 1]}`;
};
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
export const opisZmiany = (ymd, start, end) =>
  `${opisDnia(ymd)} · ${hhmm(start)}${end ? `–${hhmm(end)}` : ""}`;

// Powiadomienie o grafiku, które NIE mnoży się przy kolejnych publikacjach.
//
// Kierownik układa grafik tydzień po tygodniu i klika "Wyślij" po każdym —
// 13.09 Kamila dostała przez to PIĘĆ wiadomości w 22 minuty, każdą o innym
// zakresie dat. Powiadomienia są jedynym kanałem, którym aplikacja dociera do
// pracownika; zalane grafikiem przestają być czytane, a wtedy giną te, które
// naprawdę wymagają reakcji (zmiana bez odbicia, rozstrzygnięta korekta,
// termin sanepidu).
//
// Warunkiem sklejenia jest NIEPRZECZYTANA wiadomość o grafiku. Skoro pracownik
// jeszcze jej nie otworzył, druga mówiąca to samo nic nie dodaje — wystarczy
// odświeżyć tę, którą ma. Gdy przeczytał, nowa zmiana dostaje własny wpis, bo
// o niej jeszcze nie wie.
//
// ⚠️ Przy sklejaniu NIE podajemy zakresu dat. Nie znamy dat z poprzedniej
// wiadomości bez parsowania polskiego tekstu, a wpisanie tam samego nowego
// zakresu skasowałoby informację o wcześniejszym. Zdanie ogólne jest prawdziwe
// niezależnie od tego, ile publikacji się złożyło; pojedyncza publikacja —
// przypadek najczęstszy — zachowuje dokładny zakres jak dotąd.
export const upsertGrafikNotification = async (userName, message, ogolne) => {
  let istniejace = [];
  try {
    istniejace = await api.get(
      "notifications",
      `audience=eq.employee&type=eq.grafik&is_read=eq.false&user_name=eq.${encodeURIComponent(
        userName
      )}`
    );
  } catch (e) {
    // Odczyt nie może zablokować wysyłki — w najgorszym razie wróci stare
    // zachowanie, czyli jedna wiadomość więcej.
    istniejace = [];
  }
  const ostatnie = (istniejace || [])
    .filter(
      (n) =>
        n &&
        n.type === "grafik" &&
        !n.is_read &&
        (n.audience || "employee") === "employee" &&
        n.user_name === userName
    )
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .pop();
  if (ostatnie) {
    return api.patch("notifications", ostatnie.id, {
      message: ogolne,
      created_at: new Date().toISOString(),
    });
  }
  return createEmployeeNotification(userName, message, "grafik");
};
