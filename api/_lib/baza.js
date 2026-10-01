// Supabase dla funkcji wysyłających e-maile (0.70.0).
//
// ⚠️ Model silo i brak fallbacku — dokładnie jak w api/cron/check-odbicia.js:
// adres i klucz bazy biorą się WYŁĄCZNIE ze zmiennych środowiskowych, a ich
// brak kończy się błędem 500 z nazwą zmiennej. Klucz SERVICE ROLE, bo od
// Etapu 3c anonim nie widzi nic.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const brakBazy = () => {
  const brak = [];
  if (!SUPABASE_URL) brak.push("SUPABASE_URL");
  if (!SUPABASE_KEY) brak.push("SUPABASE_SERVICE_KEY");
  return brak;
};

// ⚠️ PostgREST oddaje maksymalnie 1000 wierszy i robi to BEZ ostrzeżenia
// (błąd #1 w CLAUDE.md) — paginacja w pętli, aż strona wróci niepełna.
const STRONA = 1000;
const pobierz = async (sciezka) => {
  const wynik = [];
  for (let od = 0; ; od += STRONA) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${sciezka}`, {
      headers: { ...headers, Range: `${od}-${od + STRONA - 1}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${json.message || "Błąd pobierania"} (${sciezka.split("?")[0]})`);
    wynik.push(...json);
    if (json.length < STRONA) return wynik;
  }
};

// res.ok sprawdzamy ZAWSZE — cichy 400 to fałszywy sukces (błąd #8).
const zmien = async (tabela, filtr, dane) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${filtr}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(dane),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Błąd zapisu ${tabela}: ${res.status} ${t.slice(0, 200)}`);
  }
};

// INSERT, który przy konflikcie unikalności zwraca `false` zamiast rzucać —
// tak raport kierownika poznaje, że ten sam raport już poszedł.
const dodajJesliNowy = async (tabela, dane) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(dane),
  });
  if (res.status === 409) return false;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Błąd zapisu ${tabela}: ${res.status} ${t.slice(0, 200)}`);
  }
  return true;
};

const zakoduj = (v) => encodeURIComponent(v);

module.exports = { brakBazy, pobierz, zmien, dodajJesliNowy, zakoduj };
