// "Ustawienia powiadomień" — link z każdego maila (0.70.0).
//
// Bez logowania, bo maile dostają też osoby, które do aplikacji się nie
// logują (wybierają się z listy na tablecie). Zamiast hasła — podpis w linku
// (HMAC z CRON_SECRET, api/_lib/poczta.js): link działa tylko dla tej jednej
// osoby, której przyszedł mail.
//
// ⚠️ GET niczego NIE zmienia — pokazuje stan i przycisk. Skanery linków w
// skrzynkach (Outlook, antywirusy) otwierają każdy link z maila; gdyby samo
// wejście wyłączało maile, ludzie traciliby je bez dotykania czegokolwiek.
// Zmiana idzie POST-em: z formularza na tej stronie albo jednym kliknięciem
// "Wypisz" w Gmailu (nagłówek List-Unsubscribe-Post, RFC 8058).
//
// Docelowo to ustawienie będzie też w aplikacji, na ekranie "Więcej" — prośba
// właściciela z 2026-10-01. Kolumna jest ta sama (users.email_powiadomienia).
//
// Zwykły CommonJS .js, bez importów z src/ (patrz CLAUDE.md, sekcja "Cron").

const { brakBazy, pobierz, zmien, zakoduj } = require("../_lib/baza");
const { podpisOk, PRODUKT, TENANT } = require("../_lib/poczta");
const { esc, K } = require("../_lib/szablon");

const strona = (tytul, tresc) => `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tytul)} · ${esc(PRODUKT)}</title>
<style>
  body{margin:0;background:${K.tlo};font-family:'Helvetica Neue',Arial,sans-serif;color:${K.tekst}}
  .k{max-width:480px;margin:40px auto;background:#fff;border:1px solid ${K.ramka};border-radius:12px;overflow:hidden}
  .n{background:${K.ciemny};color:#fff;padding:16px 22px;font-weight:800;font-size:19px}
  .t{padding:22px}
  h1{font-size:22px;margin:0 0 10px}
  p{line-height:1.55;color:${K.drugi};margin:0 0 16px}
  button{font:inherit;font-weight:700;font-size:16px;padding:12px 18px;border-radius:8px;cursor:pointer}
  .g{background:${K.akcent};color:#fff;border:0}
  .d{background:#fff;color:${K.tekst};border:2px solid ${K.tekst}}
  .s{font-size:13px;color:${K.szary}}
  @media (prefers-color-scheme: dark){body{background:#151412}}
  @media (max-width:520px){.k{margin:16px}}
</style></head>
<body><div class="k"><div class="n">${esc(PRODUKT)}${TENANT ? ` · ${esc(TENANT)}` : ""}</div><div class="t">${tresc}</div></div></body></html>`;

const imie = (u) => String(u.name || "").split(/\s+/)[0];

module.exports = async function handler(req, res) {
  const q = req.query || {};
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Strona z danymi osoby — nikt jej nie powinien cache'ować ani indeksować.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  if (brakBazy().length) {
    return res.status(500).send(strona("Błąd", "<h1>Ustawienia chwilowo niedostępne</h1><p>Wdrożenie nie jest skonfigurowane.</p>"));
  }
  if (!podpisOk(q.u, q.t)) {
    return res
      .status(403)
      .send(strona("Nieprawidłowy link", "<h1>Ten link nie działa</h1><p>Otwórz „Ustawienia powiadomień” z najnowszego maila.</p>"));
  }

  let user;
  try {
    [user] = await pobierz(`users?select=id,name,email_powiadomienia&id=eq.${zakoduj(q.u)}`);
  } catch (e) {
    return res.status(500).send(strona("Błąd", `<h1>Nie udało się wczytać ustawień</h1><p>${esc(e.message)}</p>`));
  }
  if (!user) return res.status(404).send(strona("Brak konta", "<h1>Nie znaleziono konta</h1>"));

  if (req.method === "POST") {
    const body = req.body || {};
    // Gmail "Wypisz" wysyła samo `List-Unsubscribe=One-Click` — to znaczy "wyłącz".
    const wlacz = body.akcja === "wlacz";
    try {
      await zmien("users", `id=eq.${zakoduj(user.id)}`, { email_powiadomienia: wlacz });
    } catch (e) {
      return res.status(500).send(strona("Błąd", `<h1>Nie udało się zapisać</h1><p>${esc(e.message)}</p>`));
    }
    user.email_powiadomienia = wlacz;
  }

  const wlaczone = user.email_powiadomienia !== false;
  const akcja = `?u=${encodeURIComponent(q.u)}&t=${encodeURIComponent(q.t)}`;
  const tresc = wlaczone
    ? `<h1>Cześć ${esc(imie(user))}, e-maile są włączone</h1>
<p>${req.method === "POST" ? "Zapisane. " : ""}Dostajesz na e-mail kopię wiadomości z aplikacji: grafik, zamiany, korekty, wnioski o wolne. Kierownicy dostają też raport dnia i tygodnia.</p>
<form method="post" action="${akcja}"><input type="hidden" name="akcja" value="wylacz"><button class="d" type="submit">Wyłącz e-maile</button></form>
<p class="s" style="margin-top:16px">Wiadomości w aplikacji zostają bez zmian.</p>`
    : `<h1>E-maile są wyłączone</h1>
<p>${req.method === "POST" ? "Zapisane. " : ""}Nie wyślemy Ci już żadnego maila. Wiadomości w aplikacji zostają bez zmian.</p>
<form method="post" action="${akcja}"><input type="hidden" name="akcja" value="wlacz"><button class="g" type="submit">Włącz z powrotem</button></form>`;
  return res.status(200).send(strona("Ustawienia powiadomień", tresc));
};
