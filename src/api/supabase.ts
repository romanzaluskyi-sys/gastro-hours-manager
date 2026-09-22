// @ts-nocheck
import { SUPABASE_URL, SUPABASE_KEY } from "../config";
import { token, odswiezPoBledzie } from "./auth";

// --- API SUPABASE (REST) ---
//
// ⚠️ Od 0.42.0 `Authorization` niesie token ZALOGOWANEGO UŻYTKOWNIKA, a nie
// klucz publishable. Klucz zostaje w `apikey` (PostgREST wymaga go zawsze) i
// w `Authorization` tylko wtedy, gdy nikt nie jest zalogowany — ekran
// logowania nie ma jeszcze czym się przedstawić.
//
// Dopóki polityki RLS są otwarte, jedno i drugie daje ten sam dostęp, więc ta
// zmiana niczego nie odcina. Robimy ją osobno właśnie dlatego: gdy polityki
// zaczną odróżniać kto pyta (Etap 3c), transport ma już działać i być
// sprawdzony.
const naglowki = async (dodatkowe) => {
  const t = await token();
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${t || SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...(dodatkowe || {}),
  };
};

// ⚠️ Jedna próba odświeżenia po 401 i powtórzenie żądania. Powód jest ten sam,
// dla którego `odswiezPoBledzie` w ogóle istnieje: zegar tabletu bywa
// przestawiony, więc token "ważny jeszcze 40 minut" według urządzenia potrafi
// być martwy według serwera. Bez tego pracownik zobaczyłby "błąd zapisu" przy
// odbijaniu zmiany i nie miałby co z tym zrobić.
//
// ⚠️ Dokładnie JEDNA próba. Pętla ponawiania przy odmowie, która nie wynika z
// wygaśnięcia (np. polityka RLS mówi "nie wolno"), zamieniłaby jeden czytelny
// błąd w nieskończone kręcenie się aplikacji.
const wyslij = async (url, opcje = {}, dodatkoweNaglowki) => {
  const res = await fetch(url, { ...opcje, headers: await naglowki(dodatkoweNaglowki) });
  if (res.status !== 401) return res;
  const swiezy = await odswiezPoBledzie();
  if (!swiezy) return res;
  return fetch(url, { ...opcje, headers: await naglowki(dodatkoweNaglowki) });
};

export const api = {
  get: async (table, filter) => {
    const pageSize = 1000;
    let allRows = [];
    let from = 0;
    while (true) {
      const res = await wyslij(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc` +
          (filter ? `&${filter}` : ""),
        {},
        { Range: `${from}-${from + pageSize - 1}` }
      );
      const json = await res.json();
      if (!res.ok)
        throw new Error(
          json.message || json.error_description || `Błąd pobierania z ${table}`
        );
      if (!Array.isArray(json)) return json;
      allRows = allRows.concat(json);
      if (json.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  },
  post: async (table, data) => {
    const res = await wyslij(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd zapisu");
    return json[0];
  },
  patch: async (table, id, data) => {
    const res = await wyslij(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd aktualizacji");
    return json[0];
  },
  delete: async (table, id) => {
    // Bez tego pusty/niezdefiniowany id leci do PostgREST jako literalne
    // "undefined" i wraca 400 "invalid input syntax for type uuid" — a
    // użytkownik widział tylko "Błąd usuwania" i nie było jak zgadnąć, czy to
    // uprawnienia, sieć, czy wiersz bez id.
    if (id == null || id === "") {
      throw new Error(`Nie mam id wiersza do usunięcia (${table}).`);
    }
    const res = await wyslij(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      let powod = "";
      try {
        powod = (await res.json()).message || "";
      } catch {
        powod = "";
      }
      throw new Error(
        `Błąd usuwania (${table}, ${res.status})${powod ? `: ${powod}` : ""}`
      );
    }
    return true;
  },
  // Wywołanie funkcji w bazie (PostgREST `/rpc/`). Istnieje po to, żeby
  // pytanie dało się zadać BEZ pobierania danych, na których odpowiedź się
  // opiera — pierwszym takim pytaniem jest "czy ten PIN blokady jest dobry"
  // (patrz `sprawdz_kiosk_pin`, migracje 0025 i 0027).
  //
  // ⚠️ Błąd sieci i odpowiedź "nie" to DWIE RÓŻNE rzeczy i ta funkcja ich nie
  // skleja: przy problemie rzuca wyjątek, a `false` zwraca tylko wtedy, gdy
  // baza faktycznie odpowiedziała "nie". Wywołujący musi to rozróżnić, inaczej
  // zerwane wi-fi pokaże się człowiekowi jako "niepoprawny PIN".
  rpc: async (nazwa, args) => {
    const res = await wyslij(`${SUPABASE_URL}/rest/v1/rpc/${nazwa}`, {
      method: "POST",
      body: JSON.stringify(args || {}),
    });
    const json = await res.json();
    if (!res.ok)
      throw new Error(
        json.message || json.error_description || `Błąd wywołania ${nazwa}`
      );
    return json;
  },
  patchByFilter: async (table, filterQuery, data) => {
    const res = await wyslij(`${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Błąd aktualizacji");
    return true;
  },
};
