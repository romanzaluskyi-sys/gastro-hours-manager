// Raz dziennie: zmiany, które ktoś zaczął i nie zakończył.
//
// Kolejka u kierownika (zakładka Zatwierdzanie zmian) liczy się w kodzie, na
// żywo — ten cron NIE jest jej źródłem i nie musi nic "zamykać". Jego jedynym
// zadaniem jest powiedzieć o tym obu stronom: pracownikowi, bo to jego godziny
// i tylko on pamięta, o której naprawdę wyszedł, oraz kierownikowi lokalu, bo
// to on podejmie decyzję.
//
// ⚠️ Niczego nie dopisujemy i nie zgadujemy. Godzina zakończenia wpisana przez
// automat to czyjaś wypłata policzona przez program, który przy tym nie był.
//
// `porzucona_powiadomiono_at` pilnuje tylko tego, żeby ta sama zmiana nie
// wracała codziennie — inaczej po tygodniu nikt by tych wiadomości nie czytał.
//
// Zwykły CommonJS .js — powód identyczny jak w check-document-terms.js: Vercel
// buduje api/ osobnym, legacy tsc, który przewraca się na starym `typescript`
// z package.json. Bez importów z src/ (progi i arytmetyka są tu zduplikowane
// świadomie, żywy odpowiednik stoi w src/utils/porzucone.ts).

// ⚠️ Model silo: adres bazy NIE MOŻE stać w kodzie — jedno repozytorium
// obsługuje N projektów Vercel, każdy z własnym projektem Supabase. Zmienne
// ustawia się w Vercel → Project Settings → Environment Variables, obok
// istniejącego CRON_SECRET.
//
// ⚠️ NIE MA TU FALLBACKU i nie wolno go dopisywać. Do 0.41.0 stał tu adres i
// klucz pierwszego klienta — bezpiecznik na czas wdrażania modelu silo, żeby
// zmiana z 0.33.0 nie zgasiła działającego crona, zanim ktokolwiek ustawi
// zmienne. Skutek uboczny był gorszy niż problem, który rozwiązywał: projekt
// NOWEGO klienta bez ustawionych zmiennych pisałby powiadomienia i prognozy do
// bazy PIERWSZEGO. Front ma na taki wypadek nazwę najemcy na ekranie logowania;
// cron nie ma ekranu, więc nikt by tego nie zobaczył. Brak zmiennej kończy się
// teraz błędem 500 z wyjaśnieniem — cron widoczny jako czerwony w Vercelu jest
// nieporównanie lepszy niż cron piszący po cichu do cudzej bazy.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Wołane w handlerze PO autoryzacji: komu z ulicy nic do tego, czego nam brakuje.
const brakKonfiguracji = () => {
  const brak = [];
  if (!SUPABASE_URL) brak.push("SUPABASE_URL");
  if (!SUPABASE_KEY) brak.push("SUPABASE_KEY");
  if (!brak.length) return null;
  return (
    `Brak zmiennych środowiskowych: ${brak.join(", ")}. ` +
    "Ustaw je w Vercel → Project Settings → Environment Variables " +
    "(procedura: docs/NOWY-KLIENT.md)."
  );
};

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// ⚠️ Vercel uruchamia funkcje w UTC, a lokale stoją w Polsce. Bez jawnej
// strefy zmiana zaczęta o 00:30 wypadałaby "wczoraj" i szukalibyśmy jej planu
// w złym dniu grafiku — czyli akurat przy zmianach nocnych, gdzie zapomniane
// odbicie zdarza się najczęściej.
const TZ = "Europe/Warsaw";
const ymdPL = (d) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
const hhmmPL = (d) =>
  d.toLocaleTimeString("pl-PL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const offsetPL = (d) => {
  const wUTC = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const wPL = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  return wPL - wUTC;
};

// Moment odpowiadający dacie z grafiku i godzinie "po polsku".
const chwilaPL = (dateStr, minuty) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const przyblizenie = new Date(Date.UTC(y, m - 1, d, 0, 0) + minuty * 60000);
  return new Date(przyblizenie.getTime() - offsetPL(przyblizenie));
};

const naMinuty = (t) => {
  if (typeof t !== "string") return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

// Domyślne progi — te same liczby co TOLERANCJA_PO_GRAFIKU_H i
// MAX_DLUGOSC_ZMIANY_H w src/utils/porzucone.ts. Lokal może je nadpisać.
const TOLERANCJA_H = 4;
const MAKS_H = 17;
const progiLokalu = (lokal) => {
  const dodatnia = (v, dom) => {
    const n = v === "" || v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : dom;
  };
  return {
    tolerancja: dodatnia(lokal?.tolerancja_po_grafiku_h, TOLERANCJA_H),
    maks: dodatnia(lokal?.max_dlugosc_zmiany_h, MAKS_H),
  };
};

// ⚠️ PostgREST oddaje maksymalnie 1000 wierszy na żądanie i robi to BEZ
// ostrzeżenia — patrz błąd #1 w CLAUDE.md i komentarz w check-odbicia.js.
const STRONA = 1000;
const pobierz = async (sciezka) => {
  const wynik = [];
  for (let od = 0; ; od += STRONA) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${sciezka}`, {
      headers: { ...headers, Range: `${od}-${od + STRONA - 1}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || `Błąd pobierania ${sciezka}`);
    wynik.push(...json);
    if (json.length < STRONA) return wynik;
  }
};

// res.ok sprawdzamy zawsze — cichy 400 wyglądałby jak "wszyscy odbili koniec"
// (patrz błąd #8 w CLAUDE.md).
const powiadom = async (wiersz) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers,
    body: JSON.stringify(wiersz),
  });
  if (!res.ok) throw new Error(`Błąd zapisu powiadomienia: ${res.status}`);
};

const oznacz = async (shiftId, kiedy) => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/shifts?id=eq.${encodeURIComponent(shiftId)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ porzucona_powiadomiono_at: kiedy }),
    }
  );
  if (!res.ok) throw new Error(`Błąd oznaczania zmiany: ${res.status}`);
};

module.exports = async function handler(req, res) {
  // ⚠️ Sprawdzenie PRZED porównaniem nagłówka, nie po. Przy nieustawionym
  // CRON_SECRET `Bearer ${process.env.CRON_SECRET}` daje dosłowny string
  // "Bearer undefined" — i każdy, kto wyśle taki nagłówek, przechodzi
  // autoryzację. Brakująca zmienna otwierała więc endpoint zamiast go zamknąć.
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({
      error:
        "CRON_SECRET nie jest ustawiony w tym projekcie Vercel — " +
        "bez niego nie da się odróżnić wywołania z harmonogramu od cudzego " +
        "(procedura: docs/NOWY-KLIENT.md).",
    });
  }
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const brak = brakKonfiguracji();
  if (brak) return res.status(500).json({ error: brak });

  const teraz = new Date();
  // Dalej niż 60 dni wstecz nie ma po co sięgać: takie wiersze albo zostały
  // już rozstrzygnięte, albo nikt ich nie rozstrzygnie po jednej wiadomości.
  const od = new Date(teraz.getTime() - 60 * 86400000).toISOString();
  const failures = [];
  let znalezione = 0;

  try {
    const otwarte = await pobierz(
      `shifts?select=*&end_time=is.null&rozliczenie=is.null` +
        `&porzucona_powiadomiono_at=is.null&start_time=gte.${od}`
    );
    if (!otwarte.length) return res.status(200).json({ znalezione: 0 });

    const [lokale, users, plan] = await Promise.all([
      pobierz(`lokale?select=name,tolerancja_po_grafiku_h,max_dlugosc_zmiany_h`),
      pobierz(`users?select=id,name,active,archived`),
      pobierz(
        `grafik_shifts?select=user_id,user_name,date,start_time,end_time` +
          `&deleted_at=is.null&published_at=not.is.null&date=gte.${od.slice(0, 10)}`
      ),
    ]);

    for (const zm of otwarte) {
      if (zm.is_urlop) continue;
      const user = users.find((u) => String(u.id) === String(zm.user_id));
      if (!user || user.archived) continue;

      const start = new Date(zm.start_time);
      const dzien = ymdPL(start);
      const { tolerancja, maks } = progiLokalu(
        lokale.find((l) => l.name === zm.lokal)
      );

      // Najpóźniejszy planowany koniec tego dnia — przy zmianie dzielonej
      // pierwszy zrzynałby zmianę w środku drugiej części.
      let koniecPlanu = null;
      for (const p of plan) {
        if (p.date !== dzien) continue;
        const ten = p.user_id
          ? String(p.user_id) === String(zm.user_id)
          : p.user_name === zm.user_name;
        if (!ten) continue;
        const odMin = naMinuty(p.start_time);
        const doMin = naMinuty(p.end_time);
        if (odMin == null || doMin == null) continue;
        const k = chwilaPL(p.date, doMin > odMin ? doMin : doMin + 1440);
        if (!koniecPlanu || k > koniecPlanu) koniecPlanu = k;
      }

      // Grafik liczy się tylko wtedy, gdy planowany koniec wypada PO starcie:
      // kto odbił się długo po swoim planie, pracuje faktycznie poza nim.
      const zGrafiku = koniecPlanu && koniecPlanu > start;
      const prog = zGrafiku
        ? new Date(koniecPlanu.getTime() + tolerancja * 3600000)
        : new Date(start.getTime() + maks * 3600000);
      if (teraz < prog) continue;

      znalezione += 1;
      const dataPL = dzien.split("-").reverse().join(".");
      // Każda pozycja osobno: błąd jednej nie może uciszyć pozostałych, a
      // nieoznaczona zmiana wróci jutro — to jest zachowanie, o które chodzi.
      try {
        await powiadom({
          audience: "employee",
          user_name: zm.user_name,
          type: "porzucona",
          message:
            `Zmiana z ${dataPL} (${zm.lokal}, od ${hhmmPL(start)}) nie ma odbitego końca. ` +
            "Te godziny nie policzą się, dopóki kierownik ich nie potwierdzi — " +
            "jeśli pamiętasz, o której skończyłeś(-aś), powiedz mu.",
        });
        await powiadom({
          audience: "manager",
          lokal: zm.lokal,
          type: "porzucona",
          message:
            `${zm.user_name}: zmiana z ${dataPL} (${zm.lokal}, od ${hhmmPL(start)}) ` +
            `bez odbitego końca${zGrafiku ? " — wg grafiku miała się skończyć wcześniej" : ""}. ` +
            "Do rozstrzygnięcia w zakładce Zatwierdzanie zmian.",
        });
        await oznacz(zm.id, teraz.toISOString());
      } catch (e) {
        failures.push({ zmiana: zm.id, error: e.message });
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  return res.status(200).json({ znalezione, failures });
};
