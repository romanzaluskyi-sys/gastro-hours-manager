// Dziennik przebiegów cronów (0.77.0, migracja 0046) — monitoring.
//
// Każdy cron owija swój handler: `module.exports = zPrzebiegiem("nazwa", handler)`.
// Po odpowiedzi zapisujemy do `cron_przebiegi`, jak poszło (status HTTP,
// czas, skrót odpowiedzi), a /api/zdrowie sprawdza, czy każdy oczekiwany cron
// miał UDANY przebieg w swoim oknie. Bez tego dziennika cron, który przestał
// się wywoływać, nie zostawiał żadnego śladu.
//
// ⚠️ Zapis NIGDY nie rzuca i nie zmienia odpowiedzi crona — monitoring, który
// wywraca to, co monitoruje, jest gorszy niż żaden. Baza bez 0046 = brak zapisu.
//
// ⚠️ Liczymy tylko wywołania z poprawnym `Bearer CRON_SECRET` — czyli z
// harmonogramu (Vercel Cron, pg_cron) albo ręczne z sekretem. Podgląd raportu
// z linku w mailu (podpis zamiast sekretu) i przypadkowe wejścia na adres
// (401) przebiegiem nie są.

const { brakBazy, dodajJesliNowy, usun } = require("./baza");

const TRZYMAJ_DNI = 30;

const skrot = (odp) => {
  if (odp == null) return null;
  if (typeof odp === "string") return odp.slice(0, 300);
  if (odp.error) return String(odp.error).slice(0, 300);
  try {
    return JSON.stringify(odp).slice(0, 300);
  } catch (e) {
    return null;
  }
};

const zapisz = async (wiersz) => {
  try {
    if (brakBazy().length) return;
    await dodajJesliNowy("cron_przebiegi", wiersz);
    const granica = new Date(Date.now() - TRZYMAJ_DNI * 86400000).toISOString();
    await usun(
      "cron_przebiegi",
      `nazwa=eq.${encodeURIComponent(wiersz.nazwa)}&start_at=lt.${encodeURIComponent(granica)}`
    );
  } catch (e) {
    console.error(`przebieg ${wiersz.nazwa}: nie zapisano (${e.message})`);
  }
};

const zPrzebiegiem = (nazwa, handler) =>
  async function zPrzebiegiemHandler(req, res) {
    const sekret = process.env.CRON_SECRET;
    const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
    const zHarmonogramu = !!sekret && auth === `Bearer ${sekret}`;
    if (!zHarmonogramu) return handler(req, res);

    const start = Date.now();
    let kod = 200;
    let odp = null;
    const status = res.status;
    const json = res.json;
    res.status = function (k) {
      kod = k;
      return status.call(this, k);
    };
    res.json = function (j) {
      odp = j;
      return json.call(this, j);
    };
    try {
      return await handler(req, res);
    } catch (e) {
      kod = 500;
      odp = { error: e && e.message ? e.message : String(e) };
      throw e;
    } finally {
      await zapisz({
        nazwa,
        start_at: new Date(start).toISOString(),
        czas_ms: Date.now() - start,
        kod,
        ok: kod < 300,
        info: skrot(odp),
      });
    }
  };

module.exports = { zPrzebiegiem };
