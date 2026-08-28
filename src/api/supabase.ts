// @ts-nocheck
import { SUPABASE_URL, SUPABASE_KEY } from "../config";

// --- API SUPABASE (REST) ---
export const api = {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  get: async (table) => {
    const pageSize = 1000;
    let allRows = [];
    let from = 0;
    while (true) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`,
        {
          headers: {
            ...api.headers,
            Range: `${from}-${from + pageSize - 1}`,
          },
        }
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: api.headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd zapisu");
    return json[0];
  },
  patch: async (table, id, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: api.headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "Błąd aktualizacji");
    return json[0];
  },
  delete: async (table, id) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: api.headers,
    });
    if (!res.ok) throw new Error("Błąd usuwania");
    return true;
  },
  patchByFilter: async (table, filterQuery, data) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`, {
      method: "PATCH",
      headers: api.headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Błąd aktualizacji");
    return true;
  },
};
