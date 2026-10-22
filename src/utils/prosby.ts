// @ts-nocheck
// „Zapytaj” (0.80.0, migracja 0049) — prośba kierownika o JEDNĄ zmianę dla
// osoby, która w dyspozycji tego dnia nie może (albo może w innych godzinach).
// Jedyne miejsce, które zakłada, wycofuje i odpowiada na prośby — ekrany
// tylko z niego korzystają. Pełny opis: docs/DYSPOZYCJA.md (etap D3).
//
// ⚠️ Prośba to NIE wiersz `grafik_shifts`. Zmiana powstaje dopiero przy
// „Mogę” — robi to baza (RPC `odpowiedz_na_prosbe`), bo pracownik nie ma
// prawa zapisu do grafiku. Do tego czasu prośba nie liczy się do obsady.
//
// ⚠️ Zdania wiadomości („Kierownik pyta, czy możesz:”, „Kierownik wycofał
// pytanie o zmianę:”) rozpoznają `opisWiadomosci` (employeeSessionShared.tsx)
// i api/_lib/wiadomosci.js — zmieniając je tutaj, popraw tamte miejsca.

import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";
import { dzienKrotki } from "./czas";
import { timeToMin, trimTime } from "./grafik";

const GODZINA_MS = 3600 * 1000;

// Kiedy prośba wygasa: 24 h przed zmianą (decyzja właściciela). Gdy do zmiany
// zostało mniej, dajemy czas do godziny przed startem — prośba na jutro rano
// też bywa potrzebna. Zwraca ISO albo null, gdy na pytanie jest już za późno.
export const wygasaDla = (date, start_time, teraz = new Date()) => {
  const start = new Date(`${date}T${trimTime(start_time)}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const doby = start.getTime() - 24 * GODZINA_MS;
  const godzinaPrzed = start.getTime() - GODZINA_MS;
  const t = teraz.getTime();
  const kiedy = doby > t + GODZINA_MS ? doby : godzinaPrzed;
  return kiedy > t ? new Date(kiedy).toISOString() : null;
};

// Stan prośby z czasem: „czeka” po terminie to „wygasła”.
export const stanProsby = (p, teraz = new Date()) =>
  p.status === "czeka" && new Date(p.wygasa_at).getTime() <= teraz.getTime() ? "wygasla" : p.status;

const zakres = (p) => {
  const a = timeToMin(p.start_time);
  const b0 = timeToMin(p.end_time);
  const b = b0 <= a ? b0 + 1440 : b0;
  return [a, b];
};
const nachodza = (x, y) => {
  const [a, b] = zakres(x);
  const [c, d] = zakres(y);
  return a < d && c < b;
};

// Prośby, które kierownik ma widzieć w siatce danego dnia i lokalu:
// czekające, wygasłe bez odpowiedzi i odmowy. Zgoda jest już zmianą w grafiku.
export const prosbyDnia = (prosby, lokal, date, teraz = new Date()) =>
  (prosby || []).filter(
    (p) => p.lokal === lokal && p.date === date && ["czeka", "wygasla", "odmowa"].includes(stanProsby(p, teraz))
  );

// Jedno pytanie naraz o tę samą zmianę: czekająca prośba na to samo
// stanowisko, dzień, lokal i nachodzące godziny.
export const czekajacaNaZmiane = (prosby, slot, teraz = new Date()) =>
  (prosby || []).find(
    (p) =>
      stanProsby(p, teraz) === "czeka" &&
      p.lokal === slot.lokal &&
      p.date === slot.date &&
      (p.stanowisko || "") === (slot.stanowisko || "") &&
      nachodza(p, slot)
  ) || null;

const tejOsoby = (p, user) => !!user && String(p.user_id) === String(user.id);

// Prośby czekające na odpowiedź tej osoby (ekran Dyspozycji, Pulpit).
export const prosbyDoOdpowiedzi = (prosby, user, teraz = new Date()) =>
  (prosby || [])
    .filter((p) => tejOsoby(p, user) && stanProsby(p, teraz) === "czeka")
    .sort((a, b) => (a.date + a.start_time < b.date + b.start_time ? -1 : 1));

// Odpowiedzi z ostatnich trzech dni — „Odpowiedziałaś: Mogę”.
export const ostatnieOdpowiedzi = (prosby, user, teraz = new Date()) =>
  (prosby || [])
    .filter(
      (p) =>
        tejOsoby(p, user) &&
        ["zgoda", "odmowa"].includes(p.status) &&
        p.odpowiedz_at &&
        teraz.getTime() - new Date(p.odpowiedz_at).getTime() < 3 * 24 * GODZINA_MS
    )
    .sort((a, b) => (a.odpowiedz_at < b.odpowiedz_at ? 1 : -1));

export const opisProsby = (p) =>
  `${dzienKrotki(p.date)}, ${trimTime(p.start_time)}–${trimTime(p.end_time)}${p.stanowisko ? `, ${p.stanowisko}` : ""} · ${p.lokal}`;

export const tekstProsby = (p) => `Kierownik pyta, czy możesz: ${opisProsby(p)}. Odpowiedz w Dyspozycji.`;
export const tekstWycofania = (p) => `Kierownik wycofał pytanie o zmianę: ${opisProsby(p)}.`;

// Kierownik pyta. Zwraca zapisaną prośbę.
export const zapytaj = async ({ user, lokal, stanowisko, date, start_time, end_time, kierownik, teraz = new Date() }) => {
  const wygasa_at = wygasaDla(date, start_time, teraz);
  if (!wygasa_at) throw new Error("Na pytanie jest już za późno — zmiana zaczyna się za mniej niż godzinę.");
  const prosba = await api.post("prosby_o_zmiane", {
    user_id: user.id,
    user_name: user.name,
    lokal,
    stanowisko: stanowisko || null,
    date,
    start_time: trimTime(start_time),
    end_time: trimTime(end_time),
    status: "czeka",
    wygasa_at,
    kto_pyta: kierownik?.name || null,
    kto_pyta_id: kierownik?.id || null,
  });
  // Wiadomość (i e-mail z kolejki) — prośba bez wiadomości czekałaby, aż
  // ktoś przypadkiem otworzy Dyspozycję. Nieudana wysyłka nie cofa prośby.
  try {
    await createEmployeeNotification(user.name, tekstProsby(prosba), "dyspozycja");
  } catch (e) {
    // świadomie cicho — prośba jest zapisana i widać ją w Dyspozycji
  }
  return prosba;
};

// Kierownik wycofuje czekającą prośbę.
export const wycofaj = async (prosba) => {
  const zapisana = await api.patch("prosby_o_zmiane", prosba.id, { status: "wycofana" });
  try {
    await createEmployeeNotification(prosba.user_name, tekstWycofania(prosba), "dyspozycja");
  } catch (e) {
    // jw.
  }
  return zapisana || { ...prosba, status: "wycofana" };
};

// Pracownik odpowiada. Zwraca { prosba, zmiana } — zmiana tylko przy zgodzie.
export const odpowiedz = async ({ prosba, zgoda, powod }) => {
  const wynik = await api.rpc("odpowiedz_na_prosbe", {
    p_id: prosba.id,
    p_zgoda: !!zgoda,
    p_powod: powod ? String(powod).trim() || null : null,
  });
  return { prosba: wynik?.prosba || { ...prosba, status: zgoda ? "zgoda" : "odmowa" }, zmiana: wynik?.zmiana || null };
};

// Podmiana jednej prośby w liście (po zapisie).
export const podmienProsbe = (lista, p) => [...(lista || []).filter((x) => x.id !== p.id), p];
