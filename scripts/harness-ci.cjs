// Uruchamia harness-*.html w przeglądarce bez głowy i zwraca błąd, jeśli
// którykolwiek nie doszedł do końca albo zgłosił oblany przypadek.
//
// Po co: harnessy są w tym repo jedyną formą testów (nie ma Node ani npm na
// maszynie, na której powstaje kod — patrz CLAUDE.md, "Sprawdziany bez Node"),
// ale uruchamia się je RĘCZNIE, w przeglądarce. Sprawdzian, który trzeba sobie
// przypomnieć, jest sprawdzianem tylko do pierwszego pośpiechu.
//
// ⚠️ Kontrakt, na którym to stoi — każdy harness musi go trzymać:
//   1. kończy pracę, zmieniając tekst `#status` (ekrany) albo dopisując do
//      `#out` linię "ZDANYCH n, OBLANYCH m" (arytmetyka);
//   2. awarię oznacza klasą "zle" na elemencie ALBO słowem "BŁĄD" w treści.
// Dokładając nowy harness, trzymaj się tego, a CI podniesie go sam.
//
// ⚠️ harness-karta.html jest ŚWIADOMIE pominięty: jako jedyny rozmawia z
// prawdziwą bazą (window.__SHIFTRO_ENV). Testy nie mają chodzić po danych
// produkcyjnych klienta, a przebieg zależny od sieci i cudzych danych i tak
// nie powiedziałby nic pewnego.

const { chromium } = require("playwright");

const POMIJANE = new Set(["harness-karta.html"]);
// ⚠️ To GÓRNA granica — harness, który skończył, wychodzi od razu. Ile trwa
// najdłuższy: harness-panel.html przeklikuje cały panel i ma ~78 s samych
// pauz (`czekaj`) plus ładowanie modułów przez Babel. Przy 90 s wystarczyło
// dopisać kilka sprawdzianów (0.77.0, PIN-y), żeby wypadł za limit i wyglądał
// na zepsuty („ładowanie…”). Stąd zapas, a w wyniku — czas każdego przebiegu.
const LIMIT_MS = 180000;
const ADRES = process.env.HARNESS_URL || "http://127.0.0.1:8765";

const fs = require("fs");
const path = require("path");

const czyGotowy = () => {
  const status = document.getElementById("status");
  const out = document.getElementById("out");
  const tekstStatus = status ? status.textContent.trim() : "";
  const tekstOut = out ? out.textContent : "";
  // Harnessy ekranowe: status przestaje mówić "ładowanie…".
  // Harnessy arytmetyczne: w #out pojawia się podsumowanie.
  const gotowy =
    (status && tekstStatus && !tekstStatus.startsWith("ładowanie")) ||
    /ZDANYCH\s+\d+/.test(tekstOut);
  return {
    gotowy,
    zle: document.querySelectorAll(".zle").length,
    blad: document.body.innerText.includes("BŁĄD"),
    podsumowanie:
      (/ZDANYCH\s+\d+,\s*OBLANYCH\s+\d+/.exec(tekstOut) || [])[0] ||
      tekstStatus.slice(0, 120),
    oblanych: Number((/OBLANYCH\s+(\d+)/.exec(tekstOut) || [])[1] || 0),
  };
};

(async () => {
  const pliki = fs
    .readdirSync(path.join(__dirname, ".."))
    .filter((f) => f.startsWith("harness-") && f.endsWith(".html"))
    .filter((f) => !POMIJANE.has(f))
    .sort();

  if (!pliki.length) {
    console.error("Nie znalazłem żadnego harness-*.html — to samo w sobie jest błędem.");
    process.exit(1);
  }

  const przegladarka = await chromium.launch();
  const kontekst = await przegladarka.newContext({ locale: "pl-PL" });
  const wyniki = [];

  for (const plik of pliki) {
    const strona = await kontekst.newPage();
    const konsola = [];
    strona.on("console", (m) => {
      if (m.type() === "error") konsola.push(m.text().slice(0, 300));
    });
    strona.on("pageerror", (e) => konsola.push("pageerror: " + e.message.slice(0, 300)));

    let stan = null;
    const start = Date.now();
    try {
      await strona.goto(`${ADRES}/${plik}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const doKiedy = Date.now() + LIMIT_MS;
      while (Date.now() < doKiedy) {
        stan = await strona.evaluate(czyGotowy);
        if (stan.gotowy) break;
        await strona.waitForTimeout(500);
      }
    } catch (e) {
      stan = { gotowy: false, podsumowanie: "wyjątek: " + e.message.slice(0, 200) };
    }

    const sekundy = Math.round((Date.now() - start) / 1000);
    const zdany =
      stan && stan.gotowy && !stan.zle && !stan.blad && !stan.oblanych;
    wyniki.push({ plik, zdany, stan, konsola });
    console.log(
      `${zdany ? "  OK  " : " BŁĄD "} ${plik.padEnd(26)} ${String(sekundy).padStart(3)} s  ${
        stan && !stan.gotowy && !stan.zle && !stan.blad
          ? `nie doszedł do końca w ${LIMIT_MS / 1000} s (stan: ${stan.podsumowanie || "—"})`
          : (stan && stan.podsumowanie) || "nie doszedł do końca w limicie czasu"
      }`
    );
    if (!zdany && konsola.length) {
      konsola.slice(0, 5).forEach((l) => console.log(`         konsola: ${l}`));
    }
    await strona.close();
  }

  await przegladarka.close();

  const oblane = wyniki.filter((w) => !w.zdany);
  console.log(
    `\n${wyniki.length - oblane.length}/${wyniki.length} harnessów przeszło.`
  );
  process.exit(oblane.length ? 1 : 0);
})();
