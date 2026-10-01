// Wysyłka e-maili przez Brevo (0.70.0).
//
// Dlaczego Brevo: darmowy plan to ~300 maili dziennie (decyzja właściciela,
// 2026-10-01). Przy ~20 wiadomościach dziennie na sieć i raporcie dla kilku
// kierowników to wystarcza z zapasem. W modelu silo KAŻDY klient ma własny
// klucz — a więc i własny limit — w zmiennych swojego projektu Vercel.
//
// Zmienne (Vercel → Project Settings → Environment Variables, wszystkie trzy
// środowiska — patrz docs/NOWY-KLIENT.md):
//   BREVO_API_KEY  — klucz API z Brevo (SMTP & API → API Keys)
//   EMAIL_FROM     — nadawca zweryfikowany w Brevo, np. powiadomienia@shiftro.pl
//   APP_URL        — adres aplikacji tego klienta (linki w mailach); gdy brak,
//                    bierzemy domenę produkcyjną, którą podaje sam Vercel
// Nazwy produktu i klienta czytamy z tych samych zmiennych co front
// (REACT_APP_PRODUKT, REACT_APP_TENANT) — Vercel podaje je także funkcjom.

const crypto = require("crypto");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const PRODUKT = process.env.PRODUKT || process.env.REACT_APP_PRODUKT || "Shiftro";
const TENANT = process.env.TENANT || process.env.REACT_APP_TENANT || "";

const adresAplikacji = () => {
  const jawny = process.env.APP_URL;
  if (jawny) return jawny.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : null;
};

const brakPoczty = () => {
  const brak = [];
  if (!BREVO_API_KEY) brak.push("BREVO_API_KEY");
  if (!EMAIL_FROM) brak.push("EMAIL_FROM");
  if (!adresAplikacji()) brak.push("APP_URL");
  if (!process.env.CRON_SECRET) brak.push("CRON_SECRET");
  return brak;
};

// Link, który otwiera aplikację od razu we właściwym miejscu. Front czyta
// `?otworz=` (src/utils/linki.ts) — słownik celów musi się z nim zgadzać.
const link = (cel) => `${adresAplikacji()}/${cel ? `?otworz=${encodeURIComponent(cel)}` : ""}`;

// Podpis linku "Ustawienia powiadomień". Bez logowania — wiele osób dostaje
// maile, choć do aplikacji się nie loguje (17 z 29 kont). HMAC z CRON_SECRET:
// zgadnięcie cudzego podpisu jest niewykonalne, a zmiana sekretu unieważnia
// stare linki, co jest w porządku.
const podpis = (userId) =>
  crypto
    .createHmac("sha256", process.env.CRON_SECRET || "")
    .update(`email:${userId}`)
    .digest("base64")
    .replace(/[+/=]/g, (z) => ({ "+": "-", "/": "_", "=": "" }[z]))
    .slice(0, 32);

const podpisOk = (userId, t) => {
  if (!userId || !t || !process.env.CRON_SECRET) return false;
  const a = Buffer.from(podpis(userId));
  const b = Buffer.from(String(t));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const linkUstawien = (userId) =>
  `${adresAplikacji()}/api/email/ustawienia?u=${encodeURIComponent(userId)}&t=${podpis(userId)}`;

// Błąd z `trwaly = true` to odmowa, która się nie zmieni (zły adres, odrzucony
// nadawca) — nie ma sensu ponawiać co 5 minut przez dobę. 429 i 5xx to
// chwilowe kłopoty Brevo: wtedy wiersz zostaje w kolejce.
const wyslij = async ({ adres, imie, temat, html, tekst, userId, tag }) => {
  const naglowki = {};
  if (userId) {
    naglowki["List-Unsubscribe"] = `<${linkUstawien(userId)}>`;
    naglowki["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  let res;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: EMAIL_FROM, name: TENANT ? `${PRODUKT} · ${TENANT}` : PRODUKT },
        to: [{ email: adres, name: imie || undefined }],
        subject: temat,
        htmlContent: html,
        textContent: tekst,
        headers: naglowki,
        tags: tag ? [tag] : undefined,
      }),
    });
  } catch (e) {
    const blad = new Error(`Brevo: brak połączenia (${e.message})`);
    blad.trwaly = false;
    throw blad;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    const blad = new Error(`Brevo ${res.status}: ${t.slice(0, 200)}`);
    blad.trwaly = res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 401;
    throw blad;
  }
  return res.json().catch(() => ({}));
};

module.exports = {
  PRODUKT,
  TENANT,
  adresAplikacji,
  brakPoczty,
  link,
  linkUstawien,
  podpis,
  podpisOk,
  wyslij,
};
