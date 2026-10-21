// @ts-nocheck
// PIN — reguły wspólne dla karty pracownika i ekranu „Nowy PIN” (0.77.0).
//
// PIN ma DOKŁADNIE sześć cyfr: klawiatura tabletu zatwierdza sama na szóstej
// cyfrze, a Supabase Auth nie przyjmie krótszego hasła. Tę samą regułę
// sprawdza serwer (api/admin/ustaw-haslo.js) i baza (trigger `chron_piny`,
// migracja 0046) — tu jest po to, żeby człowiek dowiedział się o tym przed
// wysłaniem, a nie z komunikatu błędu.

export const DLUGOSC_PINU = 6;

export const poprawnyPin = (pin) => /^[0-9]{6}$/.test(String(pin || ""));

// PIN łatwy do zgadnięcia: jedna cyfra, ciąg (123456, 654321) albo powtarzany
// wzór (121212, 123123). Na tablecie stojącym na sali to pierwsze, co ktoś
// spróbuje. To ostrzeżenie, nie zakaz.
export const slabyPin = (pin) => {
  const p = String(pin || "");
  if (!poprawnyPin(p)) return false;
  if (/^(\d)\1+$/.test(p)) return true;
  const cyfry = p.split("").map(Number);
  const rosnaco = cyfry.every((c, i) => i === 0 || c === (cyfry[i - 1] + 1) % 10);
  const malejaco = cyfry.every((c, i) => i === 0 || c === (cyfry[i - 1] + 9) % 10);
  if (rosnaco || malejaco) return true;
  return p.slice(0, 2).repeat(3) === p || p.slice(0, 3).repeat(2) === p;
};
