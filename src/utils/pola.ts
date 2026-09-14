// @ts-nocheck
// Pola do wpisania — wspólna definicja dla dziennika ("Puls") i dla zadań z
// pomiarem. Osobny, malutki plik, bo potrzebują tego OBA moduły, a
// utils/dziennik.ts już importuje z utils/tasks.ts — gdyby tasks.ts sięgnęło z
// powrotem po polaSzablonu, powstałby cykl importów (ten sam powód, dla którego
// przesun() mieszka w dziennik.ts, a nie w komponencie Puls).
//
// Kształt pola:
//   { klucz, label, typ: 'number'|'text'|'bool', jednostka, min, max }

export const TYPY_POLA = [
  { key: "number", label: "Liczba" },
  { key: "text", label: "Tekst" },
  { key: "bool", label: "Tak / nie" },
];

// Klucz robimy z etykiety, żeby kierownik nigdy go nie widział ani nie
// wymyślał. Musi być stabilny — po nim czytamy wartości z payloadu.
export const slugKlucza = (tekst) =>
  (tekst || "")
    .toLowerCase()
    .replace(/ą/g, "a").replace(/ć/g, "c").replace(/ę/g, "e")
    .replace(/ł/g, "l").replace(/ń/g, "n").replace(/ó/g, "o")
    .replace(/ś/g, "s").replace(/ż/g, "z").replace(/ź/g, "z")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "pole";

// jsonb potrafi przyjechać i jako tablica, i jako tekst — zależnie od tego, czy
// wiersz przeszedł przez PostgREST, czy leży w stanie lokalnym po zapisie.
export const parsePola = (wartosc) => {
  try {
    const p = typeof wartosc === "string" ? JSON.parse(wartosc) : wartosc;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

export const polaSzablonu = (szablon) => parsePola(szablon && szablon.pola);

// Wartość poza normą (min/max) — lodówka na 12 °C ma się rzucać w oczy, a nie
// leżeć w tabeli jako zwykła liczba.
export const pozaNormaPola = (pola, payload) =>
  (pola || []).some((pole) => {
    const v = payload && payload[pole.klucz];
    if (v === "" || v == null || pole.typ !== "number") return false;
    const n = Number(v);
    if (Number.isNaN(n)) return false;
    return (pole.min != null && n < pole.min) || (pole.max != null && n > pole.max);
  });

// Podpis normy pod nazwą pola. Sam myślnik ("–4 °C") czytał się jak liczba
// ujemna, gdy zdefiniowano tylko górną granicę.
export const opisNormy = (pole) => {
  const j = pole.jednostka || "";
  // Przy wartościach ujemnych "-25–-18" jest nieczytelne — myślnik zlewa się
  // z minusem. Wtedy piszemy słowami.
  if (pole.min != null && pole.max != null)
    return pole.min < 0 || pole.max < 0
      ? `od ${pole.min}${j} do ${pole.max}${j}`
      : `${pole.min}–${pole.max}${j}`;
  if (pole.max != null) return `do ${pole.max}${j}`;
  if (pole.min != null) return `od ${pole.min}${j}`;
  return "";
};

// Wartość do pokazania w wierszu ("4 °C", "tak", "—").
export const wartoscPolaTekst = (pole, payload) => {
  const v = payload ? payload[pole.klucz] : undefined;
  if (pole.typ === "bool") return v === true || v === "true" ? "tak" : "nie";
  if (v === "" || v == null) return "—";
  return `${v}${pole.jednostka || ""}`;
};
