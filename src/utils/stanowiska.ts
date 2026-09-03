// @ts-nocheck
// Skrót i kolor stanowiska — ustawiane ręcznie przez kierownika w
// Pracownicy → Stanowiska (kolumny stanowiska.skrot/stanowiska.kolor).
// Skrót zastępuje auto-generowany getShort() tam, gdzie jest ustawiony;
// kolor renderujemy dziś jako jasny odcień (plakietki), pełny nasycony
// kolor jest zarezerwowany na przyszły Grafik — patrz CLAUDE.md.
import { getShort } from "./format";

export const findStanowisko = (stanowiska, lokal, name) =>
  (stanowiska || []).find(
    (s) => s.name === name && (!lokal || s.lokal_name === lokal)
  );

export const stanowiskoShort = (stanowiska, lokal, name) => {
  const st = findStanowisko(stanowiska, lokal, name);
  return (st && st.skrot) || getShort(name);
};

const hexToRgb = (hex) => {
  const raw = (hex || "").trim().replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const mixHex = (hex, target, amount) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const [tr, tg, tb] = target;
  const nr = Math.round(r + (tr - r) * amount);
  const ng = Math.round(g + (tg - g) * amount);
  const nb = Math.round(b + (tb - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
};

// Jasny odcień (85% w stronę bieli) na tło plakietki + przyciemniony
// (35% w stronę czerni) na tekst, żeby zachować kontrast niezależnie od
// tego, jak jasny/ciemny kolor wybrał kierownik.
export const stanowiskoBadgeStyle = (stanowiska, lokal, name) => {
  const st = findStanowisko(stanowiska, lokal, name);
  if (!st || !st.kolor) return null;
  const backgroundColor = mixHex(st.kolor, [255, 255, 255], 0.85);
  const color = mixHex(st.kolor, [0, 0, 0], 0.35);
  if (!backgroundColor || !color) return null;
  return { backgroundColor, color };
};
