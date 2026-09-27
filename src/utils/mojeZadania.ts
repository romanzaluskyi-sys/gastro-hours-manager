// @ts-nocheck
// "Moje zadania" — lista spraw kierownika (tabela `zadania_moje`, migracja
// 0038). Jedyne miejsce, które do niej pisze — wołają je Zadania (dodanie
// ręczne, "Do moich zadań" przy pomiarze poza normą), Skrzynka ("Utwórz
// zadanie" przy zgłoszeniu) i karta dnia w Pulsie.
//
// ⚠️ To NIE są checklisty. Pozycja checklisty wraca według dni bloku i ma
// jedno wykonanie na dzień (task_completions); sprawa kierownika jest
// jednorazowa: ma termin i jest zrobiona albo nie.
import { api } from "../api/supabase";
import { toLocalYMD } from "../api/googleSheets";
import { dzienKrotki, pad } from "./czas";

export const TABELA_MOICH = "zadania_moje";

const dzisYMD = () => toLocalYMD(new Date());
const przesunYMD = (ymd, dni) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + dni);
  return toLocalYMD(d);
};

// Szybkie terminy z pola "Nowe zadanie". "W tym tygodniu" = niedziela tego
// tygodnia (w niedzielę — ta sama niedziela, czyli dziś).
export const KIEDY = [
  { key: "dzis", label: "dziś" },
  { key: "jutro", label: "jutro" },
  { key: "tydzien", label: "w tym tygodniu" },
];
export const terminZ = (kiedy, dzis = dzisYMD()) => {
  if (kiedy === "jutro") return przesunYMD(dzis, 1);
  if (kiedy === "tydzien") {
    const dow = new Date(`${dzis}T00:00:00`).getDay(); // 0 = niedziela
    return przesunYMD(dzis, dow === 0 ? 0 : 7 - dow);
  }
  return dzis;
};

// Zadanie bez właściciela widzą wszyscy kierownicy (tak wyglądają zadania
// przeniesione z `tasks` w 0038). Baza pilnuje tego samego polityką.
export const widoczneDla = (lista, currentUser) =>
  (lista || []).filter(
    (z) => !z.archived && (!z.wlasciciel_id || String(z.wlasciciel_id) === String(currentUser?.id))
  );

// Grupa na liście: zaległe / dziś / później / zrobione. Bez terminu → później.
export const grupaMojego = (z, dzis = dzisYMD()) => {
  if (z.zrobione_at) return "zrobione";
  if (!z.termin) return "pozniej";
  if (z.termin < dzis) return "zalegle";
  if (z.termin === dzis) return "dzis";
  return "pozniej";
};

export const GRUPY_MOICH = [
  { key: "zalegle", label: "Zaległe" },
  { key: "dzis", label: "Dziś" },
  { key: "pozniej", label: "Później" },
];

// "dziś", "jutro", "pn 28.09"; po terminie sama data ("24.09").
export const opisTerminu = (termin, dzis = dzisYMD()) => {
  if (!termin) return "bez terminu";
  if (termin === dzis) return "dziś";
  if (termin === przesunYMD(dzis, 1)) return "jutro";
  if (termin < dzis) {
    const d = new Date(`${termin}T00:00:00`);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  }
  return dzienKrotki(termin);
};

// Otwarte na dziś (zaległe + dziś) — licznik przy "Moje zadania na dziś".
export const naDzis = (lista, dzis = dzisYMD()) =>
  (lista || []).filter((z) => ["zalegle", "dzis"].includes(grupaMojego(z, dzis)));

export const dodajMojeZadanie = ({
  tytul,
  lokal = null,
  termin = null,
  zrodlo = "wlasne",
  zrodloId = null,
  zrodloOpis = null,
  currentUser,
}) =>
  api.post(TABELA_MOICH, {
    tytul: String(tytul || "").trim(),
    lokal: lokal || null,
    termin: termin || null,
    zrodlo,
    zrodlo_id: zrodloId ? String(zrodloId) : null,
    zrodlo_opis: zrodloOpis || null,
    wlasciciel_id: currentUser?.id || null,
    wlasciciel_name: currentUser?.name || null,
  });

export const ustawZrobione = (z, zrobione, currentUser) =>
  api.patch(TABELA_MOICH, z.id, {
    zrobione_at: zrobione ? new Date().toISOString() : null,
    zrobione_przez: zrobione ? currentUser?.name || null : null,
  });

export const ustawTermin = (z, termin) => api.patch(TABELA_MOICH, z.id, { termin });

export const naJutro = (z, dzis = dzisYMD()) => ustawTermin(z, przesunYMD(dzis, 1));

// Czy ze zgłoszenia / wpisu już powstało zadanie — żeby nie proponować
// drugiego. Stare zadania ze zgłoszeń (sprzed 0038) leżały w `tasks`.
export const maZadanieZe = (moje, tasks, zrodloId) =>
  (moje || []).some((z) => !z.archived && String(z.zrodlo_id) === String(zrodloId)) ||
  (tasks || []).some((t) => String(t.source_issue_id) === String(zrodloId));
