// E-mail pracownika z wiersza `notifications` (0.70.0, makiety właściciela:
// Grafik, Giełda, Prośba o zamianę, Zamiana zatwierdzona, Korekta
// zatwierdzona, Wniosek o wolne, Brak zapisu godzin, Odpowiedź na zgłoszenie).
//
// ⚠️ Rodzaj wiadomości rozpoznajemy TAK SAMO jak `opisWiadomosci` w
// src/components/employeeSessionShared.tsx — po `type` i po treści, którą
// piszą utils/swaps.ts, corrections.ts, absences.ts, odbicia.ts, porzucone.ts
// i crony. Zmieniając tam zdanie albo dokładając typ, popraw OBA miejsca
// (z src/ nie wolno tu importować). Nieznane spada na "Wiadomość" i dalej
// wychodzi — z samą treścią.
//
// Treść wiadomości (`message`) jest zawsze w mailu, gdy nie ma lepszego
// opisu: e-mail ma mówić to samo, co aplikacja, nie coś innego.

const S = require("./szablon");
const C = require("./czas");
const { link, linkUstawien } = require("./poczta");

const imie = (pelne) => String(pelne || "").trim().split(/\s+/)[0] || "";

// Cel przycisku → słownik `?otworz=` z src/utils/linki.ts.
const CTA = {
  grafik: ["Zobacz grafik", "grafik"],
  raport: ["Zobacz Raport", "raport"],
  wiadomosci: ["Zobacz w Wiadomościach", "wiadomosci"],
  korekta: ["Popraw zmianę", "korekta"],
  wolne: ["Złóż nowy wniosek", "wolne"],
  prosba: ["Odpowiedz na prośbę", "grafik"],
  aplikacja: ["Otwórz Shiftro", "wiadomosci"],
};

// Najbliższe zmiany z OPUBLIKOWANEGO grafiku (podaje wywołujący) — dla
// wiadomości o publikacji, która sama mówi tylko "masz nowe zmiany".
const opisGrafiku = (n, user, grafik, dzis) => {
  const t = n.message || "";
  const przyszle = (grafik || []).filter((s) => s.date >= dzis).sort((a, b) =>
    `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`)
  );
  const najblizsza = przyszle[0];
  if (/koliduje/.test(t)) {
    return {
      ton: "warn",
      etykieta: "Zmiana w grafiku",
      tytul: "Zmiana koliduje z Twoim wnioskiem",
      lead: S.esc(t),
      cta: CTA.grafik,
    };
  }
  if (!najblizsza) {
    return {
      ton: "warn",
      etykieta: "Zmiana w grafiku",
      tytul: "Twój grafik się zmienił",
      lead: S.esc(t),
      cta: CTA.grafik,
    };
  }
  const [rok, mies] = najblizsza.date.split("-").map(Number);
  const prefiks = `${rok}-${String(mies).padStart(2, "0")}`;
  const wMiesiacu = (grafik || []).filter((s) => s.date.startsWith(prefiks));
  const godzin = wMiesiacu.reduce((a, s) => a + C.godzinyPlanu(s), 0);
  const ile = wMiesiacu.length;
  return {
    ton: "info",
    ikona: "■",
    etykieta: "Grafik",
    tytul: `Grafik na ${C.MIES_MIANOWNIK[mies - 1]} jest gotowy`,
    lead:
      `Cześć ${S.esc(imie(user.name))}, kierownik opublikował grafik. Masz <b>${ile} ${C.odmiana(ile, ["zmianę", "zmiany", "zmian"])}</b> w ${C.MIES_MIEJSCOWNIK[mies - 1]}.` +
      (/usunięto/.test(t) ? " Część Twoich zmian zdjęto z grafiku — szczegóły w zakładce Grafik." : ""),
    wiersze: [
      {
        e: "Najbliższa",
        w: `${C.krotkaData(najblizsza.date)} · ${String(najblizsza.start_time).slice(0, 5)}–${String(najblizsza.end_time).slice(0, 5)}`,
      },
      { e: "Lokal · stanowisko", w: `${najblizsza.lokal} · ${najblizsza.stanowisko}` },
      { e: "Razem w miesiącu", w: C.godz(godzin) },
    ],
    cta: CTA.grafik,
    lokal: najblizsza.lokal,
    powod: `jesteś w grafiku lokalu ${najblizsza.lokal}`,
  };
};

const opisWymiany = (n) => {
  const t = n.message || "";
  const d = n.dane || {};
  if (/zatwierdził\(a\) zamianę/.test(t)) {
    return {
      ton: "ok",
      ikona: "✓",
      etykieta: "Zamiana zatwierdzona",
      tytul: "Zamiana zatwierdzona",
      lead: "Kierownik zatwierdził Twoją zamianę. Grafik jest już zaktualizowany.",
      cta: CTA.grafik,
    };
  }
  if (/nie zgodził\(a\) się/.test(t)) {
    return { ton: "no", etykieta: "Giełda", tytul: "Zamiana odrzucona", lead: S.esc(t), cta: CTA.grafik };
  }
  if (/proponuje zamianę/.test(t)) {
    const autor = d.autor || t.split(" proponuje")[0];
    return {
      ton: "info",
      ikona: "⇄",
      etykieta: "Prośba o zamianę",
      tytul: `${autor} chce się z Tobą zamienić`,
      lead: "Odpowiedz w aplikacji — zamiana wejdzie po Twojej zgodzie i zatwierdzeniu kierownika.",
      cta: CTA.prosba,
    };
  }
  if (/chce oddać Ci/.test(t)) {
    const autor = d.autor || t.split(" chce oddać")[0];
    return {
      ton: "info",
      ikona: "⇄",
      etykieta: "Prośba o zamianę",
      tytul: `${autor} chce oddać Ci zmianę`,
      lead: "Odpowiedz w aplikacji — zmiana przejdzie na Ciebie po Twojej zgodzie i zatwierdzeniu kierownika.",
      cta: CTA.prosba,
    };
  }
  if (/zgodził\(a\) się na zamianę/.test(t)) {
    return { ton: "info", ikona: "+", etykieta: "Giełda", tytul: "Zgoda na zamianę", lead: S.esc(t), cta: CTA.grafik };
  }
  if (/zgłosił\(a\) się po Twoją/.test(t)) {
    return { ton: "ok", ikona: "+", etykieta: "Giełda", tytul: "Ktoś chce wziąć Twoją zmianę", lead: S.esc(t), cta: CTA.grafik };
  }
  if (/nieaktualna|wycofał\(a\)/.test(t)) {
    return { ton: "neutral", etykieta: "Giełda", tytul: "Oferta nieaktualna", lead: S.esc(t), cta: CTA.grafik };
  }
  return { ton: "info", etykieta: "Giełda", tytul: "Giełda zmian", lead: S.esc(t), cta: CTA.grafik };
};

// Stare powiadomienie o ręcznej edycji zmiany (pola action/old_*/new_*).
const opisEdycji = (n) => {
  const usun = n.action === "delete";
  const godziny = (a, b) => (a ? `${a}${b ? `–${b}` : ""}` : null);
  return {
    ton: "warn",
    etykieta: "Zmiana godzin",
    tytul: usun ? "Kierownik usunął Twoją zmianę" : "Kierownik zmienił Twoją zmianę",
    lead: n.message ? S.esc(n.message) : `${S.esc(n.actor_name || "Kierownik")} ${usun ? "usunął(a)" : "poprawił(a)"} wpis Twoich godzin.`,
    wiersze: [
      { e: "Dzień", w: n.shift_date ? C.krotkaData(String(n.shift_date).slice(0, 10)) : null },
      usun
        ? { e: "Usunięte godziny", w: godziny(n.old_start, n.old_end) }
        : { e: "Godziny", w: godziny(n.new_start, n.new_end), bylo: godziny(n.old_start, n.old_end) },
      { e: "Lokal", w: n.lokal },
    ],
    cta: CTA.raport,
  };
};

// Rodzaj → { ton, ikona, etykieta, tytul, lead (bezpieczny HTML), wiersze,
// cta: [tekst, cel], notka, rozmowa }.
const opisz = (n, user, grafik, dzis) => {
  const t = n.message || "";
  const d = n.dane || {};
  const typ = n.type || (n.action ? "edycja" : "");
  if (n.action) return opisEdycji(n);
  switch (typ) {
    case "grafik":
      return opisGrafiku(n, user, grafik, dzis);
    case "swap":
    case "swap_accepted":
      return opisWymiany(n);
    case "correction_resolved":
      return /poprawił\(a\)/.test(t)
        ? {
            ton: "warn",
            ikona: "⚑",
            etykieta: "Korekta poprawiona",
            tytul: "Kierownik poprawił Twoją korektę",
            lead: "Godziny w Raporcie są już zapisane — z poprawką kierownika.",
            cta: CTA.raport,
          }
        : {
            ton: "ok",
            ikona: "⚑",
            etykieta: "Korekta zatwierdzona",
            tytul: "Twoja korekta godzin jest zatwierdzona",
            lead: "Godziny w Raporcie są już poprawione.",
            cta: CTA.raport,
          };
    case "correction_query":
      return { ton: "warn", etykieta: "Korekta", tytul: "Kierownik pyta o Twoją korektę", lead: S.esc(t), cta: CTA.korekta };
    case "issue_reply": {
      const rozmowa = d.odpowiedz
        ? S.akapit(`Twoje zgłoszenie: „${S.esc(d.cytat || "")}”`, { kursywa: true, margines: "0 0 14px 0" }) +
          S.akapit(`<b style="color:#171714">${S.esc(d.odpowiedz.kto)}:</b> ${S.esc(d.odpowiedz.tekst)}`, { margines: "0 0 22px 0" })
        : null;
      return {
        ton: "info",
        ikona: "✉",
        etykieta: "Odpowiedź na zgłoszenie",
        tytul: "Kierownik odpowiedział na Twoje zgłoszenie",
        lead: rozmowa ? null : S.esc(t),
        rozmowa,
        cta: CTA.wiadomosci,
      };
    }
    case "absence_resolved":
      if (/odrzucił\(a\)/.test(t)) {
        return {
          ton: "no",
          ikona: "✳",
          etykieta: "Wniosek o wolne",
          tytul: "Wniosek o wolne odrzucony",
          lead: "Kierownik nie zatwierdził wolnego w tych dniach. Porozmawiajcie — może znajdzie się inny termin.",
          cta: CTA.wolne,
        };
      }
      if (/zapisał\(a\) Ci urlop/.test(t)) {
        return { ton: "ok", ikona: "✳", etykieta: "Urlop", tytul: "Kierownik wpisał Ci urlop", lead: S.esc(t), cta: CTA.raport };
      }
      if (/zapisał\(a\) Ci dni niedostępności/.test(t)) {
        return { ton: "info", ikona: "✳", etykieta: "Wolne", tytul: "Kierownik wpisał Ci niedostępność", lead: S.esc(t), cta: CTA.grafik };
      }
      return {
        ton: "ok",
        ikona: "✳",
        etykieta: "Wniosek o wolne",
        tytul: /o urlop/.test(t) ? "Urlop zatwierdzony" : "Wniosek o wolne zatwierdzony",
        lead: S.esc(t),
        cta: CTA.grafik,
      };
    case "odbicie":
      return /dopisana/.test(t)
        ? { ton: "ok", etykieta: "Godziny dopisane", tytul: "Zmiana dopisana z grafiku", lead: S.esc(t), cta: CTA.raport }
        : {
            ton: "warn",
            ikona: "!",
            etykieta: "Brak zapisu godzin",
            tytul: "Nie widzimy Twoich godzin z wczoraj",
            lead: "W grafiku miałeś(-aś) zmianę, ale nie ma jej wśród zapisanych godzin. Jeśli pracowałeś(-aś) inaczej niż w grafiku — popraw to dziś.",
            cta: CTA.korekta,
            notka: "Bez poprawki kierownik zatwierdzi godziny wg grafiku.",
            powod: "masz konto w Shiftro",
          };
    case "porzucona":
      if (/zapisał\(a\) ją/.test(t)) return { ton: "ok", etykieta: "Koniec zmiany", tytul: "Koniec zmiany zapisany", lead: S.esc(t), cta: CTA.raport };
      if (/odrzucona/.test(t)) return { ton: "no", etykieta: "Koniec zmiany", tytul: "Zmiana bez końca odrzucona", lead: S.esc(t), cta: CTA.korekta };
      return { ton: "warn", ikona: "!", etykieta: "Zmiana bez zakończenia", tytul: "Twoja zmiana nie ma zakończenia", lead: S.esc(t), cta: CTA.korekta };
    // Wydarzenia (0.74.0) — zdania z src/utils/wydarzenia.ts: „Nowe wydarzenie:”,
    // „Zmiana w wydarzeniu:”, „Wydarzenie odwołane:”. Szczegóły (Kiedy / Gdzie
    // albo było → jest) niesie `dane.wiersze`, opis — `dane.cytat`.
    case "wydarzenie": {
      const nazwa = t.replace(/^(Nowe wydarzenie|Zmiana w wydarzeniu|Wydarzenie odwołane): /, "").split(" — ")[0];
      const opis = d.cytat ? S.akapit(`„${S.esc(d.cytat)}”`, { kursywa: true, margines: "0 0 18px 0" }) : null;
      const cta = ["Zobacz w grafiku", "grafik"];
      if (/^Wydarzenie odwołane/.test(t))
        return {
          ton: "no",
          ikona: "×",
          etykieta: "Wydarzenie odwołane",
          tytul: `Odwołane: ${nazwa}`,
          lead: "Nie musisz przychodzić. Twoje zmiany w grafiku zostają bez zmian.",
          cta,
        };
      if (/^Zmiana w wydarzeniu/.test(t))
        return { ton: "warn", ikona: "!", etykieta: "Zmiana w wydarzeniu", tytul: `Zmiana: ${nazwa}`, lead: S.esc(t), rozmowa: opis, cta };
      return {
        ton: /płatny czas pracy/.test(t) ? "ok" : "info",
        ikona: "+",
        etykieta: /płatny czas pracy/.test(t) ? "Wydarzenie · czas pracy" : "Nowe wydarzenie",
        tytul: nazwa,
        lead: /płatny czas pracy/.test(t)
          ? "Płatny czas pracy — godziny są już w Twoim grafiku."
          : "Informacja od kierownika — sprawdź szczegóły poniżej.",
        rozmowa: opis,
        cta,
      };
    }
    case "sanepid":
      return { ton: "warn", ikona: "!", etykieta: "Termin", tytul: "Termin książeczki sanepid", lead: S.esc(t), cta: CTA.aplikacja };
    case "umowa":
      return { ton: "warn", ikona: "!", etykieta: "Termin", tytul: "Termin umowy", lead: S.esc(t), cta: CTA.aplikacja };
    default:
      return { ton: "neutral", etykieta: "Wiadomość", tytul: "Nowa wiadomość w Shiftro", lead: S.esc(t), cta: CTA.aplikacja };
  }
};

// { temat, html, tekst, tag }
const mailPracownika = ({ n, user, grafik = [], dzis = C.ymd() }) => {
  const o = opisz(n, user, grafik, dzis);
  const wierszeMaila = o.wiersze || (n.dane && n.dane.wiersze) || [];
  const [ctaTekst, ctaCel] = o.cta || CTA.aplikacja;
  const href = link(ctaCel);
  const tresc =
    S.etykieta(o.etykieta, o.ton, o.ikona) +
    S.tytul(o.tytul) +
    (o.lead ? S.akapit(o.lead) : "") +
    (o.rozmowa || "") +
    S.wiersze(wierszeMaila) +
    S.przycisk(ctaTekst, href) +
    S.notka(o.notka || "Przycisk otworzy Shiftro od razu we właściwym miejscu.");
  const ustawieniaUrl = linkUstawien(user.id);
  const html = S.koperta({
    temat: o.tytul,
    zajawka: (n.message || o.tytul).slice(0, 140),
    prawo: o.lokal || user.default_lokal || "",
    tresc,
    stopka: `Dostajesz tę wiadomość, bo ${o.powod || "masz konto w Shiftro"}`,
    ustawieniaUrl,
  });
  const tekst = [
    o.tytul,
    "",
    n.message || "",
    ...wierszeMaila
      .filter((w) => w && w.e && w.w)
      .map((w) => `${w.e}: ${w.bylo && w.bylo !== w.w ? `${w.bylo} → ` : ""}${w.w}`),
    "",
    `${ctaTekst}: ${href}`,
    "",
    `Ustawienia powiadomień: ${ustawieniaUrl}`,
  ].join("\n");
  return { temat: o.tytul, html, tekst, tag: `pracownik-${n.type || "inne"}` };
};

module.exports = { mailPracownika, opisz };
