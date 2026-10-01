// Raport kierownika e-mailem (0.70.0): codziennie rano raport dnia
// (wczoraj), a w poniedziałek ZAMIAST niego raport tygodnia (ubiegły
// pon–ndz). Dwa maile o tej samej porze to dokładnie to, czego kierownik
// nauczyłby się nie czytać — tygodniowy i tak zawiera "Wymaga uwagi".
//
// Vercel Cron (vercel.json) raz dziennie — to wystarcza i mieści się w planie
// Hobby. Godzina w harmonogramie jest w UTC: "0 5 * * *" = 7:00 latem i 6:00
// zimą w Polsce.
//
// Podgląd bez wysyłki: ten sam adres z `?u=<id>&t=<podpis>` (podpis jak w
// linku "Ustawienia powiadomień" z maila tej osoby) oraz opcjonalnie
// `&rodzaj=dzien|tydzien&dzis=RRRR-MM-DD` — zwraca HTML raportu w
// przeglądarce. Do sprawdzenia, co dostanie kierownik, bez czekania do rana.
//
// Zwykły CommonJS .js, bez importów z src/ (patrz CLAUDE.md, sekcja "Cron").

const { brakBazy, pobierz, zmien, dodajJesliNowy, zakoduj } = require("../_lib/baza");
const { brakPoczty, wyslij, podpisOk } = require("../_lib/poczta");
const { policz, czyPusty, ROLE_KIEROWNIKA } = require("../_lib/raport");
const { mailRaportu } = require("../_lib/raportMail");
const C = require("../_lib/czas");

// Wszystko dla całej sieci naraz — raport każdego kierownika to filtr na tych
// samych wierszach, więc dwóch kierowników nie zobaczy dwóch wersji prawdy.
const pobierzDane = async ({ dzis }) => {
  const poniedzialekTygodnia = C.dodajDni(C.poniedzialek(dzis), -7);
  // Najwcześniejszy dzień, którego dotyczy cokolwiek w raporcie: ubiegły
  // tydzień, okno kolejki "bez odbicia" (14 dni) i 1. dzień miesiąca (norma).
  const doMiesiaca = `${C.dodajDni(dzis, -1).slice(0, 8)}01`;
  const odDnia = [poniedzialekTygodnia, C.dodajDni(dzis, -15), doMiesiaca].sort()[0];
  const odChwili = C.chwila(C.dodajDni(odDnia, -1)).toISOString();
  const doDnia = C.dodajDni(dzis, 21);
  const doba = new Date(Date.now() - 24 * 3600000).toISOString();

  const [lokale, users, shiftsOkno, otwarte, plan, dayLogs, cele, budzetDni, issues, absences, swaps, wyjatki, powiadomienia] =
    await Promise.all([
      pobierz("lokale?select=*"),
      pobierz("users?select=*"),
      pobierz(
        `shifts?select=id,user_id,user_name,lokal,stanowisko,start_time,end_time,is_urlop,rozliczenie` +
          `&start_time=gte.${zakoduj(odChwili)}`
      ),
      // Zmiany bez końca — w każdym wieku (kolejka "bez zakończenia" nie ma okna).
      pobierz(
        `shifts?select=id,user_id,user_name,lokal,stanowisko,start_time,end_time,is_urlop,rozliczenie` +
          `&end_time=is.null&rozliczenie=is.null`
      ),
      pobierz(`grafik_shifts?select=*&date=gte.${odDnia}&date=lte.${doDnia}&deleted_at=is.null`),
      pobierz(`day_logs?select=lokal,date,obrot,status&date=gte.${odDnia}`),
      pobierz("grafik_budzet_cele?select=*"),
      pobierz(`grafik_budzet_dni?select=*&date=gte.${odDnia}`),
      pobierz(
        `issues?select=*&or=(status.eq.nowe,created_at.gte.${zakoduj(C.chwila(poniedzialekTygodnia).toISOString())})`
      ),
      pobierz(`absences?select=*&end_date=gte.${odDnia}`),
      pobierz(`shift_swaps?select=*&or=(status.eq.przyjeta,created_at.gte.${zakoduj(C.chwila(poniedzialekTygodnia).toISOString())})`),
      pobierz(`grafik_wyjatki?select=*&date_to=gte.${dzis}`),
      pobierz(`notifications?select=audience,lokal,message,type,created_at&audience=eq.manager&created_at=gte.${zakoduj(doba)}`),
    ]);

  // Korekty wskazują zmianę po id — także starszą niż okno; jej lokal decyduje,
  // który kierownik widzi korektę.
  const znane = new Set([...shiftsOkno, ...otwarte].map((s) => String(s.id)));
  const brakujace = issues
    .filter((i) => i.type === "correction" && i.status === "nowe" && i.shift_id && !znane.has(String(i.shift_id)))
    .map((i) => i.shift_id);
  const dociagniete = brakujace.length
    ? await pobierz(`shifts?select=id,user_id,user_name,lokal,stanowisko,start_time,end_time,is_urlop,rozliczenie&id=in.(${brakujace.join(",")})`)
    : [];
  const shifts = [...shiftsOkno];
  [...otwarte, ...dociagniete].forEach((s) => {
    if (!shifts.some((x) => String(x.id) === String(s.id))) shifts.push(s);
  });
  return { lokale, users, shifts, plan, dayLogs, cele, budzetDni, issues, absences, swaps, wyjatki, powiadomienia };
};

const kierownicy = (users) =>
  users.filter(
    (u) =>
      ROLE_KIEROWNIKA.includes(u.role) &&
      u.active &&
      !u.archived &&
      String(u.email || "").trim() &&
      u.email_powiadomienia !== false
  );

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const podglad = !!q.u;

  if (podglad) {
    if (!podpisOk(q.u, q.t)) return res.status(403).send("Nieprawidłowy link.");
  } else {
    if (!process.env.CRON_SECRET) {
      return res.status(500).json({ error: "CRON_SECRET nie jest ustawiony w tym projekcie Vercel." });
    }
    const auth = req.headers.authorization || req.headers.Authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized" });
  }
  const brak = [...brakBazy(), ...brakPoczty()];
  if (brak.length) {
    return res.status(500).json({
      error: `Brak zmiennych środowiskowych: ${brak.join(", ")} (procedura: docs/NOWY-KLIENT.md).`,
    });
  }

  const dzis = /^\d{4}-\d{2}-\d{2}$/.test(q.dzis || "") && podglad ? q.dzis : C.ymd();
  const rodzaj =
    podglad && ["dzien", "tydzien"].includes(q.rodzaj)
      ? q.rodzaj
      : C.dzienTygodnia(dzis) === 1
      ? "tydzien"
      : "dzien";
  // Okres raportu — klucz w email_raporty: dzień raportu dziennego albo
  // poniedziałek raportowanego tygodnia.
  const okres = rodzaj === "tydzien" ? C.dodajDni(C.poniedzialek(dzis), -7) : C.dodajDni(dzis, -1);

  let dane;
  try {
    dane = await pobierzDane({ dzis });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (podglad) {
    const kierownik = dane.users.find((u) => String(u.id) === String(q.u));
    if (!kierownik || !ROLE_KIEROWNIKA.includes(kierownik.role)) {
      return res.status(404).send("Raport jest tylko dla kierowników.");
    }
    const mail = mailRaportu(policz({ dane, kierownik, rodzaj, dzis }), kierownik);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(mail.html);
  }

  const wynik = { rodzaj, okres, wyslano: 0, pominieto: [], bledy: [] };
  for (const kierownik of kierownicy(dane.users)) {
    try {
      const model = policz({ dane, kierownik, rodzaj, dzis });
      if (rodzaj === "dzien" && czyPusty(model)) {
        wynik.pominieto.push(`${kierownik.name}: nic się nie działo`);
        continue;
      }
      // Najpierw rezerwacja, potem wysyłka: drugie wywołanie crona trafi na
      // istniejący wiersz i nie wyśle tego samego raportu jeszcze raz.
      const nowy = await dodajJesliNowy("email_raporty", {
        user_id: kierownik.id,
        rodzaj,
        okres,
        status: "wysyłam",
      });
      if (!nowy) {
        wynik.pominieto.push(`${kierownik.name}: już wysłany`);
        continue;
      }
      const filtr = `user_id=eq.${zakoduj(kierownik.id)}&rodzaj=eq.${rodzaj}&okres=eq.${okres}`;
      try {
        const mail = mailRaportu(model, kierownik);
        await wyslij({
          adres: kierownik.email.trim(),
          imie: kierownik.name,
          temat: mail.temat,
          html: mail.html,
          tekst: mail.tekst,
          userId: kierownik.id,
          tag: `raport-${rodzaj}`,
        });
        await zmien("email_raporty", filtr, { status: "wysłano" });
        wynik.wyslano += 1;
      } catch (e) {
        await zmien("email_raporty", filtr, { status: `błąd: ${e.message}`.slice(0, 300) }).catch(() => {});
        throw e;
      }
    } catch (e) {
      // Jeden kierownik nie może uciszyć pozostałych.
      wynik.bledy.push(`${kierownik.name}: ${e.message}`);
    }
  }
  return res.status(wynik.bledy.length ? 207 : 200).json(wynik);
};
