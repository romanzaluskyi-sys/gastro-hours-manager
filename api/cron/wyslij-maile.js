// Kopia wiadomości pracownika na e-mail (0.70.0).
//
// Wiadomości powstają w DWÓCH miejscach — w przeglądarce (api/notifications.ts)
// i w cronach — a jedyne, co mają wspólne, to tabela `notifications`. Dlatego
// wysyłka idzie stąd, po wierszach bazy, a nie z przeglądarki: klucz Brevo nie
// może trafić do paczki, a tablet w kuchni gubi wi-fi w połowie zapisu.
//
// ⚠️ WYWOŁUJE TO SUPABASE, NIE VERCEL. Vercel Cron na planie Hobby chodzi
// najwyżej raz dziennie, a odpowiedź kierownika na korektę ma dojść po
// minutach, nie jutro. Harmonogram co 5 minut stoi w bazie (pg_cron + pg_net),
// zapytanie do wklejenia: docs/sql/tools/email-harmonogram.sql.
//
// Kolejka = `email_at is null` (migracja 0039). Każdy wiersz kończy z
// `email_at` i opisem w `email_info` — wysłano / pominięto (powód) / błąd.
// Wyjątek: chwilowa awaria Brevo zostawia wiersz w kolejce i następny przebieg
// spróbuje znowu, ale najwyżej przez dobę od powstania wiadomości.
//
// Zwykły CommonJS .js, bez importów z src/ (patrz CLAUDE.md, sekcja "Cron").

const { brakBazy, pobierz, zmien, zakoduj } = require("../_lib/baza");
const { brakPoczty, wyslij } = require("../_lib/poczta");
const { mailPracownika } = require("../_lib/wiadomosci");
const C = require("../_lib/czas");

// Wiadomość musi chwilę "odleżeć": publikacja grafiku SKLEJA kolejne
// wysyłki w jeden wiersz (upsertGrafikNotification) — bez odstępu pracownik
// dostałby mail po pierwszym "Wyślij" i żadnego po kolejnych.
const ODSTEP_MIN = 2;
const NAJSTARSZE_H = 24;
const NA_PRZEBIEG = 60;

// Kto dostaje kopię: ta sama osoba co w aplikacji (po imieniu — tak
// `notifications` wskazuje pracownika), z adresem, aktywna i bez wyłączonej
// zgody. Tablet ma e-mail do logowania, ale to nie jest człowiek.
const odbiorca = (users, nazwa) => {
  const pasujace = users.filter(
    (u) => u.name === nazwa && u.active && !u.archived && u.role !== "kiosk"
  );
  if (!pasujace.length) return { powod: "brak aktywnego konta" };
  const zAdresem = pasujace.filter((u) => String(u.email || "").trim());
  if (!zAdresem.length) return { powod: "brak adresu e-mail" };
  // Dwie osoby o tym samym imieniu: wiadomość wskazuje tylko imię, więc nie
  // wiemy, do której należy — lepiej nie wysłać niż wysłać cudzą.
  const adresy = new Set(zAdresem.map((u) => u.email.trim().toLowerCase()));
  if (adresy.size > 1) return { powod: "kilka osób o tym imieniu" };
  const user = zAdresem[0];
  if (user.email_powiadomienia === false) return { powod: "e-maile wyłączone" };
  return { user, adres: user.email.trim() };
};

module.exports = async function handler(req, res) {
  // Sekret PRZED porównaniem — `Bearer undefined` nie może otwierać endpointu
  // (patrz check-odbicia.js).
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: "CRON_SECRET nie jest ustawiony w tym projekcie Vercel." });
  }
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const brak = [...brakBazy(), ...brakPoczty()];
  if (brak.length) {
    return res.status(500).json({
      error: `Brak zmiennych środowiskowych: ${brak.join(", ")} (procedura: docs/NOWY-KLIENT.md).`,
    });
  }

  const teraz = Date.now();
  const granicaStara = new Date(teraz - NAJSTARSZE_H * 3600000).toISOString();
  const granicaSwieza = new Date(teraz - ODSTEP_MIN * 60000).toISOString();
  const dlaPracownika = "or=(audience.is.null,audience.eq.employee)";
  const wynik = { wyslano: 0, pominieto: 0, bledy: 0, zostaje: 0 };

  try {
    // Starsze niż doba i wciąż bez maila — za późno, żeby pisać. Zamykamy je,
    // żeby kolejka (indeks częściowy) nie rosła bez końca.
    await zmien(
      "notifications",
      `email_at=is.null&${dlaPracownika}&created_at=lt.${zakoduj(granicaStara)}`,
      { email_at: new Date().toISOString(), email_info: "pominięto: starsze niż doba" }
    );

    const kolejka = await pobierz(
      `notifications?select=*&email_at=is.null&${dlaPracownika}` +
        `&created_at=gte.${zakoduj(granicaStara)}&created_at=lte.${zakoduj(granicaSwieza)}` +
        `&order=created_at.asc&limit=${NA_PRZEBIEG}`
    );
    if (!kolejka.length) return res.status(200).json(wynik);

    const users = await pobierz(
      "users?select=id,name,email,role,active,archived,default_lokal,email_powiadomienia"
    );
    const dzis = C.ymd();
    const poczatekMiesiaca = `${dzis.slice(0, 8)}01`;

    for (const n of kolejka) {
      const zamknij = (info) =>
        zmien("notifications", `id=eq.${zakoduj(n.id)}&email_at=is.null`, {
          email_at: new Date().toISOString(),
          email_info: info.slice(0, 300),
        });
      try {
        const o = odbiorca(users, n.user_name);
        if (!o.user) {
          await zamknij(`pominięto: ${o.powod}`);
          wynik.pominieto += 1;
          continue;
        }
        // Publikacja grafiku mówi tylko "masz nowe zmiany" — szczegóły
        // (najbliższa zmiana, godziny miesiąca) bierzemy z grafiku w chwili
        // wysyłki, czyli z tego, co pracownik naprawdę zobaczy.
        let grafik = [];
        if (n.type === "grafik") {
          grafik = await pobierz(
            `grafik_shifts?select=date,start_time,end_time,lokal,stanowisko` +
              `&user_id=eq.${zakoduj(o.user.id)}&published_at=not.is.null&deleted_at=is.null` +
              `&date=gte.${poczatekMiesiaca}&order=date.asc`
          );
        }
        const mail = mailPracownika({ n, user: o.user, grafik, dzis });
        await wyslij({
          adres: o.adres,
          imie: o.user.name,
          temat: mail.temat,
          html: mail.html,
          tekst: mail.tekst,
          userId: o.user.id,
          tag: mail.tag,
        });
        await zamknij("wysłano");
        wynik.wyslano += 1;
      } catch (e) {
        if (e.trwaly) {
          await zamknij(`błąd: ${e.message}`).catch(() => {});
          wynik.bledy += 1;
        } else {
          // Chwilowa awaria — zapisujemy przyczynę, ale zostawiamy w kolejce.
          await zmien("notifications", `id=eq.${zakoduj(n.id)}`, {
            email_info: `błąd (ponowię): ${e.message}`.slice(0, 300),
          }).catch(() => {});
          wynik.zostaje += 1;
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ error: e.message, ...wynik });
  }
  return res.status(200).json(wynik);
};
