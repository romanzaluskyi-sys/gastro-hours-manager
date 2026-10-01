// Klocki e-maila w języku wizualnym Shiftro (0.70.0, makiety właściciela z
// 2026-10-01: dziewięć wiadomości pracownika i raport tygodniowy kierownika).
//
// ⚠️ To NIE jest strona WWW. Gmail wycina <style>, <svg> i większość
// pozycjonowania, Outlook rysuje HTML silnikiem Worda. Stąd tabele, style
// wpisane w każdy element i znak Shiftro złożony z trzech <div>-ów zamiast SVG.
// Dokładając klocek, trzymaj się tego samego: żadnych klas, żadnego flexa.
//
// ⚠️ Każdy tekst z bazy przechodzi przez `esc()`. Imię, treść zgłoszenia czy
// odpowiedź kierownika wpisuje człowiek — bez tego `<` w zgłoszeniu psuje maila,
// a w gorszym razie wstrzykuje link.

const { PRODUKT, TENANT } = require("./poczta");

const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const FONT = "'Archivo', 'Helvetica Neue', Arial, sans-serif";
const K = {
  tlo: "#ECEBE7",
  karta: "#FFFFFF",
  ramka: "#E2E0DA",
  ciemny: "#1C1A17",
  tekst: "#171714",
  drugi: "#2E2D2A",
  szary: "#6E6E66",
  pole: "#F5F4F0",
  akcent: "#DE3A22",
};

// Tony etykiet i pasków "Wymaga uwagi" — te same znaczenia co w aplikacji:
// ok = zielone, warn = bursztynowe, no = czerwone, info = niebieskie.
const TONY = {
  info: { tlo: "#E6EEF9", tekst: "#2457A6" },
  ok: { tlo: "#E3F3E8", tekst: "#1E7A3E" },
  warn: { tlo: "#FBF0DC", tekst: "#9A5B00" },
  no: { tlo: "#FBE6E2", tekst: "#B3261E" },
  neutral: { tlo: "#ECEBE6", tekst: "#2E2D2A" },
};

// Znak Shiftro (wariant 1a "Zsuw", tone="dark") — trzy pasy na jasnym
// kwadracie, proporcje z ShiftroMark.tsx przeliczone na 24 px.
const znak = () =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="24" style="width:24px;height:24px;background:#F1F1EE;border-collapse:collapse"><tr><td style="height:24px;vertical-align:top;padding:6px 0 0 0;font-size:0;line-height:0">` +
  `<div style="height:4px;width:12px;margin-left:4px;background:#171714;font-size:0;line-height:0">&nbsp;</div>` +
  `<div style="height:4px;width:12px;margin:1px 0 0 7px;background:#DE3A22;font-size:0;line-height:0">&nbsp;</div>` +
  `<div style="height:4px;width:7px;margin:1px 0 0 4px;background:#171714;font-size:0;line-height:0">&nbsp;</div>` +
  `</td></tr></table>`;

// Cała koperta: szare tło, biała karta, ciemny nagłówek, stopka.
// `prawo` — podpis w nagłówku (lokal albo "Raport tygodniowy · Cała sieć").
// `stopka` — zdanie "Dostajesz tę wiadomość, bo …" (bez kropki).
const koperta = ({ temat, zajawka, prawo, tresc, stopka, ustawieniaUrl }) => `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(temat)}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${K.tlo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${K.tlo}">${esc(zajawka || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${K.tlo}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${K.karta};border:1px solid ${K.ramka};border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td style="background:${K.ciemny};padding:18px 24px;border-radius:11px 11px 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="width:24px;vertical-align:middle">${znak()}</td>
<td style="padding-left:10px;vertical-align:middle;font-family:${FONT};font-size:20px;font-weight:800;color:#FFFFFF">${esc(PRODUKT)}</td>
<td align="right" style="vertical-align:middle;font-family:${FONT};font-size:13px;color:#D6D3CC">${esc(prawo || "")}</td>
</tr></table></td></tr>
<tr><td style="padding:24px 24px 8px 24px;font-family:${FONT};color:${K.tekst}">${tresc}</td></tr>
<tr><td style="padding:16px 24px 22px 24px;border-top:1px solid ${K.ramka};font-family:${FONT};font-size:12px;line-height:1.6;color:${K.szary}">
${esc(stopka)}.${ustawieniaUrl ? ` <a href="${esc(ustawieniaUrl)}" style="color:${K.tekst};font-weight:700">Ustawienia powiadomień</a>` : ""}<br>
${esc([TENANT, PRODUKT].filter(Boolean).join(" · "))} — nie odpowiadaj na ten e-mail, napisz w aplikacji.
</td></tr>
</table></td></tr></table>
</body></html>`;

const etykieta = (tekst, ton = "info", ikona = "") => {
  const t = TONY[ton] || TONY.info;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0"><tr><td style="background:${t.tlo};color:${t.tekst};border-radius:6px;padding:5px 10px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">${ikona ? `${esc(ikona)}&nbsp;&nbsp;` : ""}${esc(tekst)}</td></tr></table>`;
};

const tytul = (tekst) =>
  `<h1 style="margin:0 0 8px 0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;color:${K.tekst}">${esc(tekst)}</h1>`;

// `html` — już bezpieczny HTML (złożony z esc() i <b>), nie surowy tekst.
const akapit = (html, { kursywa = false, margines = "0 0 16px 0" } = {}) =>
  `<p style="margin:${margines};font-family:${FONT};font-size:16px;line-height:1.55;color:${K.drugi}${kursywa ? ";font-style:italic" : ""}">${html}</p>`;

// Wiersze "Etykieta | wartość". `bylo` — stara wartość przekreślona przed
// strzałką ("08:30–13:32 → 08:30–21:00"); pomijana, gdy taka sama jak nowa.
const wiersze = (lista) => {
  const pozycje = (lista || []).filter((w) => w && w.e && w.w != null && w.w !== "");
  if (!pozycje.length) return "";
  const r = pozycje
    .map((w, i) => {
      const bylo =
        w.bylo && w.bylo !== w.w
          ? `<span style="color:${K.szary};text-decoration:line-through;font-weight:700">${esc(w.bylo)}</span>&nbsp;<span style="color:${K.szary}">→</span>&nbsp;`
          : "";
      return `<tr><td style="width:38%;padding:10px 14px;border-top:${i ? `1px solid ${K.ramka}` : "0"};font-family:${FONT};font-size:13px;color:${K.szary};vertical-align:top">${esc(w.e)}</td><td style="padding:10px 14px;border-top:${i ? `1px solid ${K.ramka}` : "0"};font-family:${FONT};font-size:15px;font-weight:700;color:${K.tekst};vertical-align:top">${bylo}${esc(w.w)}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${K.pole};border-top:1px solid ${K.ramka};border-radius:0 0 8px 8px;margin:0 0 20px 0">${r}</table>`;
};

const przycisk = (tekst, href, { drugi = false } = {}) =>
  drugi
    ? `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border:2px solid ${K.tekst};border-radius:8px;background:#FFFFFF;color:${K.tekst};font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none">${esc(tekst)}</a>`
    : `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:13px 20px;border-radius:8px;background:${K.akcent};color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:700;text-decoration:none">${esc(tekst)}&nbsp;→</a>`;

const notka = (tekst) =>
  `<p style="margin:6px 0 16px 0;font-family:${FONT};font-size:12px;color:${K.szary}">${esc(tekst)}</p>`;

// --- klocki raportu kierownika -----------------------------------------

const naglowekSekcji = (tekst, prawo = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 10px 0"><tr><td style="font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${K.szary}">${esc(tekst)}</td><td align="right" style="font-family:${FONT};font-size:12px;color:${K.szary}">${esc(prawo)}</td></tr></table>`;

// Cztery kafelki w rzędzie. `pod` — drobny podpis, `tonPod` — jego kolor.
const kafelki = (lista) => {
  const kom = lista
    .map(
      (k, i) => `<td width="${Math.floor(100 / lista.length)}%" style="padding:0 ${i === lista.length - 1 ? 0 : 4}px 0 ${i === 0 ? 0 : 4}px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${K.ramka};border-radius:8px"><tr><td style="padding:12px 12px 12px 12px;font-family:${FONT}">
<div style="font-size:12px;color:${K.szary}">${esc(k.etykieta)}</div>
<div style="font-size:22px;font-weight:800;color:${K.tekst};white-space:nowrap;padding:2px 0">${esc(k.wartosc)}</div>
<div style="font-size:12px;font-weight:700;color:${(TONY[k.tonPod] || {}).tekst || K.szary}">${esc(k.pod || "")}</div>
</td></tr></table></td>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0"><tr>${kom}</tr></table>`;
};

// Pasek "Wymaga uwagi": kolorowe tło, pogrubiony tytuł, podpis, link z prawej.
const uwaga = ({ ton = "warn", tytul: t, pod, akcja, href }) => {
  const c = TONY[ton] || TONY.warn;
  const kolorTytulu = ton === "neutral" ? K.tekst : c.tekst;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.tlo};border-radius:8px;margin:0 0 8px 0"><tr>
<td style="padding:11px 14px;font-family:${FONT}"><div style="font-size:15px;font-weight:800;color:${kolorTytulu}">${esc(t)}</div>${pod ? `<div style="font-size:13px;color:${K.drugi};padding-top:2px">${esc(pod)}</div>` : ""}</td>
${akcja ? `<td align="right" style="padding:11px 14px;font-family:${FONT};white-space:nowrap"><a href="${esc(href)}" style="font-size:13px;font-weight:800;color:${K.tekst}">${esc(akcja)}&nbsp;→</a></td>` : ""}
</tr></table>`;
};

// Słupki dnia: etykieta, pasek (szerokość względem największej wartości),
// "fakt / cel". Zielony, gdy fakt ≥ cel; brązowy, gdy poniżej; szary bez celu.
const slupki = (dni) => {
  const max = Math.max(1, ...dni.map((d) => Math.max(d.fakt || 0, d.cel || 0)));
  const r = dni
    .map((d) => {
      const szer = d.fakt ? Math.max(2, Math.round((d.fakt / max) * 100)) : 0;
      const kolor = d.cel == null ? "#8B8A83" : d.fakt >= d.cel ? "#1E7A3E" : "#8A5300";
      const pasek = szer
        ? `<table role="presentation" width="${szer}%" cellpadding="0" cellspacing="0"><tr><td style="height:10px;background:${kolor};border-radius:5px;font-size:0;line-height:0">&nbsp;</td></tr></table>`
        : `<span style="font-family:${FONT};font-size:12px;color:${K.szary}">brak utargu</span>`;
      return `<tr><td style="width:34px;padding:4px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${K.tekst}">${esc(d.etykieta)}</td><td style="padding:4px 12px 4px 0">${pasek}</td><td align="right" style="width:120px;padding:4px 0;font-family:${FONT};font-size:12px;white-space:nowrap"><b style="color:${K.tekst}">${esc(d.fakt == null ? "—" : d.faktTxt)}</b>${d.cel != null ? `<span style="color:${K.szary}"> / ${esc(d.celTxt)}</span>` : ""}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${r}</table>`;
};

// Lista "etykieta ............ wartość" z kreską nad każdym wierszem.
const lista = (pozycje) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${pozycje
    .map(
      (p) =>
        `<tr><td style="padding:8px 0;border-top:1px solid ${K.ramka};font-family:${FONT};font-size:14px;color:${K.drugi}">${esc(p.e)}</td><td align="right" style="padding:8px 0;border-top:1px solid ${K.ramka};font-family:${FONT};font-size:14px;font-weight:800;color:${(TONY[p.ton] || {}).tekst || K.tekst}">${esc(p.w)}</td></tr>`
    )
    .join("")}</table>`;

// Tabela lokali: nazwa + kolumny liczb.
const tabela = (wiersze) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${wiersze
    .map(
      (w) =>
        `<tr><td style="padding:10px 0;border-top:1px solid ${K.ramka};font-family:${FONT};font-size:15px;font-weight:800;color:${K.tekst}">${esc(w.nazwa)}</td>${w.kolumny
          .map(
            (k) =>
              `<td align="right" style="padding:10px 0 10px 12px;border-top:1px solid ${K.ramka};font-family:${FONT};font-size:14px;white-space:nowrap;font-weight:${k.ton ? 800 : 400};color:${(TONY[k.ton] || {}).tekst || K.drugi}">${esc(k.w)}</td>`
          )
          .join("")}</tr>`
    )
    .join("")}</table>`;

const przyciski = (lista) =>
  `<div style="margin:26px 0 14px 0">${lista.map((p) => przycisk(p.tekst, p.href, p)).join("")}</div>`;

module.exports = {
  esc,
  K,
  TONY,
  koperta,
  etykieta,
  tytul,
  akapit,
  wiersze,
  przycisk,
  przyciski,
  notka,
  naglowekSekcji,
  kafelki,
  uwaga,
  slupki,
  lista,
  tabela,
};
