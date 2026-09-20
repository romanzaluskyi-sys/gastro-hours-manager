// @ts-nocheck
import { SUPABASE_URL, SUPABASE_KEY } from "../config";

// Logowanie przez Supabase Auth (GoTrue), pisane ręcznie na fetchu.
//
// ⚠️ Świadomie BEZ `@supabase/supabase-js`. W tym repo nie ma żadnego SDK, a
// nowej zależności nie da się tu ani zbudować, ani sprawdzić (nie ma Node —
// patrz CLAUDE.md, "Sprawdziany bez Node"). Cały potrzebny kawałek GoTrue to
// trzy endpointy i arytmetyka wygasania; SDK dołożyłby do tego kilkaset
// kilobajtów i własny model sesji, który i tak trzeba by okiełznać.
//
// Stan trzymamy w localStorage, bo tablet w lokalu stoi zalogowany tygodniami
// i musi przeżyć odświeżenie strony oraz restart urządzenia.

const KLUCZ_SESJI = "shiftro_auth";

// Ile sekund PRZED wygaśnięciem zaczynamy odświeżać. Dwie minuty, nie
// sekunda: żądanie wysłane z tokenem ważnym jeszcze 0,5 s dojdzie do Supabase
// już nieważne, a użytkownik zobaczy wylogowanie w środku zmiany.
const MARGINES_S = 120;

const naglowkiAuth = {
  apikey: SUPABASE_KEY,
  "Content-Type": "application/json",
};

const teraz = () => Math.floor(Date.now() / 1000);

export const wczytajSesje = () => {
  try {
    const raw = localStorage.getItem(KLUCZ_SESJI);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    // Tryb prywatny albo zablokowane dane stron — sesja nie przeżyje
    // odświeżenia, ale aplikacja ma działać.
    return null;
  }
};

const zapiszSesje = (s) => {
  try {
    localStorage.setItem(KLUCZ_SESJI, JSON.stringify(s));
  } catch (e) {
    /* jw. */
  }
};

export const wyczyscSesje = () => {
  try {
    localStorage.removeItem(KLUCZ_SESJI);
  } catch (e) {
    /* jw. */
  }
};

const zSesji = (odp) => ({
  access_token: odp.access_token,
  refresh_token: odp.refresh_token,
  // GoTrue podaje `expires_at` (epoch) w nowszych wersjach, a `expires_in`
  // (sekundy) zawsze. Bierzemy to pierwsze, gdy jest — liczone po stronie
  // serwera nie zależy od zegara tabletu, który potrafi się rozjechać.
  expires_at: odp.expires_at || teraz() + (odp.expires_in || 3600),
  user_id: odp.user?.id || null,
  email: odp.user?.email || null,
});

export const zaloguj = async (email, haslo) => {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: naglowkiAuth,
      body: JSON.stringify({ email, password: haslo }),
    }
  );
  const odp = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Komunikat GoTrue jest po angielsku i mówi "Invalid login credentials"
    // także wtedy, gdy konto w ogóle nie istnieje — i tak ma zostać, bo
    // rozróżnienie podpowiadałoby, które adresy są w systemie.
    const e = new Error(
      res.status === 400
        ? "Nieprawidłowe dane, brak dostępu lub konto nieaktywne."
        : `Błąd logowania (${res.status}). Spróbuj ponownie za chwilę.`
    );
    e.status = res.status;
    throw e;
  }
  const sesja = zSesji(odp);
  zapiszSesje(sesja);
  return sesja;
};

// ⚠️ JEDNO odświeżenie naraz. Refresh tokeny w Supabase ROTUJĄ: drugie
// wywołanie ze zużytym tokenem unieważnia całą sesję. App.tsx startuje od
// `Promise.all` z pięcioma zapytaniami, więc bez tego pięć równoległych
// odświeżeń wylogowałoby użytkownika dokładnie przy wejściu do aplikacji.
let trwajaceOdswiezenie = null;

export const odswiez = async () => {
  if (trwajaceOdswiezenie) return trwajaceOdswiezenie;

  const sesja = wczytajSesje();
  if (!sesja?.refresh_token) return null;

  trwajaceOdswiezenie = (async () => {
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: naglowkiAuth,
        body: JSON.stringify({ refresh_token: sesja.refresh_token }),
      });
    } catch (e) {
      // ⚠️ Sieć padła — to NIE jest powód do wylogowania. Tablet w kuchni
      // traci wi-fi po kilka razy dziennie, a wylogowanie w środku zmiany
      // oznacza, że ktoś musi znać hasło urządzenia, żeby wrócić do pracy.
      // Zostawiamy sesję i stary token; następne żądanie spróbuje znowu.
      return sesja;
    }

    if (!res.ok) {
      // Odpowiedź serwera, że token jest nieważny, to co innego niż brak
      // odpowiedzi: tu sesji już nie ma i trzymanie jej tylko przedłuża
      // udawanie, że użytkownik jest zalogowany.
      wyczyscSesje();
      return null;
    }

    const odp = await res.json().catch(() => ({}));
    if (!odp.access_token) {
      wyczyscSesje();
      return null;
    }
    const nowa = zSesji(odp);
    zapiszSesje(nowa);
    return nowa;
  })();

  try {
    return await trwajaceOdswiezenie;
  } finally {
    trwajaceOdswiezenie = null;
  }
};

// Token do włożenia w nagłówek. Odświeża z wyprzedzeniem, więc wołający nie
// musi nic wiedzieć o wygasaniu.
export const token = async () => {
  const sesja = wczytajSesje();
  if (!sesja?.access_token) return null;
  if (sesja.expires_at - teraz() > MARGINES_S) return sesja.access_token;
  const odswiezona = await odswiez();
  return odswiezona?.access_token || null;
};

// Wołane przez api/supabase.ts, gdy Supabase odpowie 401 mimo pozornie
// ważnego tokenu. ⚠️ Potrzebne osobno, bo zegar urządzenia bywa przestawiony
// — token "ważny jeszcze 40 minut" według tabletu może być dawno martwy
// według serwera, a wtedy samo `token()` nigdy by go nie odświeżyło.
export const odswiezPoBledzie = async () => {
  const odswiezona = await odswiez();
  return odswiezona?.access_token || null;
};

export const wyloguj = async () => {
  const sesja = wczytajSesje();
  wyczyscSesje();
  if (!sesja?.access_token) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { ...naglowkiAuth, Authorization: `Bearer ${sesja.access_token}` },
    });
  } catch (e) {
    // Sesja lokalnie już wyczyszczona — to, że serwer się o tym nie
    // dowiedział, nie może zatrzymać wylogowania.
  }
};

export const idZalogowanego = () => wczytajSesje()?.user_id || null;
