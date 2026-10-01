// Koniec współpracy: dzień PO "Ostatnim dniu pracy" konto staje się
// nieaktywne — ale NIE trafia do archiwum (0.70.1, ustalenie właściciela).
//
// Do 0.70.0 pole `users.ostatni_dzien` tylko blokowało wpisywanie zmian w
// Grafiku i uciszało przypomnienia o umowie. Osoba, która odeszła, dalej stała
// na liście Tabletu Służbowego i mogła odbić zmianę. Sprawdzić tego w samej
// aplikacji się nie da: tablet NIE WIDZI `ostatni_dzien` cudzych kont
// (users_widok, poziom "własne albo kierownik", 0.43.0) — widzi tylko
// `active`. Dlatego zmiana idzie w bazie, w kolumnie, na którą patrzą
// wszystkie ekrany i logowanie (api/auth.ts odrzuca nieaktywne konto).
//
// Nieaktywne, nie zarchiwizowane: karta zostaje pod ręką (zakładka Aktywni ->
// filtr), godziny i dane zostają, a archiwizacja i przepisanie przyszłych zmian
// na następcę dalej są decyzją kierownika (PrzepiszZmianyModal).
//
// Vercel Cron "15 23 * * *" (UTC) = 01:15 latem i 00:15 zimą w Polsce — zawsze
// już PO północy polskiego czasu, więc "wczoraj był ostatni dzień" jest prawdą.
// Tę samą regułę stosuje zapis karty (handleSaveUser) dla daty wpisanej wstecz.
//
// Zwykły CommonJS .js, bez importów z src/ (patrz CLAUDE.md, sekcja "Cron").

const { brakBazy, pobierz, zmien, dodajJesliNowy, zakoduj } = require("../_lib/baza");
const C = require("../_lib/czas");

const dataPL = (d) => d.split("-").reverse().join(".");

module.exports = async function handler(req, res) {
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: "CRON_SECRET nie jest ustawiony w tym projekcie Vercel." });
  }
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized" });
  const brak = brakBazy();
  if (brak.length) {
    return res.status(500).json({
      error: `Brak zmiennych środowiskowych: ${brak.join(", ")} (procedura: docs/NOWY-KLIENT.md).`,
    });
  }

  const dzis = C.ymd();
  const wynik = { dzis, wylaczone: [], bledy: [] };
  let doWylaczenia;
  try {
    doWylaczenia = await pobierz(
      `users?select=id,name,default_lokal,allowed_lokale,ostatni_dzien` +
        `&active=eq.true&archived=not.is.true&ostatni_dzien=lt.${dzis}`
    );
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  for (const u of doWylaczenia) {
    try {
      // Filtr `active=eq.true` w samym zapisie: gdyby kierownik w tej chwili
      // zmieniał kartę, nie nadpiszemy niczego poza tym jednym polem.
      await zmien("users", `id=eq.${zakoduj(u.id)}&active=eq.true`, { active: false });
      wynik.wylaczone.push(u.name);
      // Wiadomość dla kierownika lokalu — trafia do Skrzynki i do porannego
      // raportu e-mail ("Co się działo"). Błąd wiadomości nie cofa wyłączenia.
      const lokal = u.default_lokal || String(u.allowed_lokale || "").split(",")[0].trim() || null;
      // Zmiany w Grafiku po ostatnim dniu nie znikają same (to plan, decyzja
      // kierownika: przepisać na kogoś czy zdjąć) — ale kierownik musi o nich
      // wiedzieć, inaczej dzień wygląda na obsadzony do chwili, gdy nikt nie
      // przyjdzie. W siatce stoją przekreślone z "KONTO WYŁĄCZONE".
      let poKoncu = 0;
      try {
        poKoncu = (
          await pobierz(
            `grafik_shifts?select=id&user_id=eq.${zakoduj(u.id)}&deleted_at=is.null&date=gt.${u.ostatni_dzien}`
          )
        ).length;
      } catch (e) {
        poKoncu = 0;
      }
      const ile =
        poKoncu === 1
          ? "została 1 zmiana"
          : `${C.odmiana(poKoncu, ["została", "zostały", "zostało"])} ${poKoncu} ${C.odmiana(poKoncu, ["zmiana", "zmiany", "zmian"])}`;
      const zmianyTxt = poKoncu ? ` W Grafiku ${ile} po tej dacie — przepisz je na kogoś albo zdejmij.` : "";
      await dodajJesliNowy("notifications", {
        audience: "manager",
        lokal,
        type: "koniec_pracy",
        is_read: false,
        message:
          `${u.name}: ostatni dzień pracy ${dataPL(u.ostatni_dzien)} — konto jest teraz nieaktywne ` +
          "(nie zniknie z kartoteki, nie ma go w archiwum). Nie pojawi się już na Tablecie." +
          zmianyTxt,
      }).catch((e) => wynik.bledy.push(`${u.name}: wiadomość — ${e.message}`));
    } catch (e) {
      wynik.bledy.push(`${u.name}: ${e.message}`);
    }
  }
  return res.status(wynik.bledy.length ? 207 : 200).json(wynik);
};
