// Wygląd raportu kierownika (0.70.0) — makieta "Raport tygodniowy · Cała
// sieć". Dzienny ma ten sam język i kolejność: najpierw zdanie z wnioskiem,
// kafelki, "Wymaga uwagi", potem szczegóły. Liczby przychodzą gotowe z
// raport.js (`policz`); tu niczego się nie liczy poza formatowaniem.

const S = require("./szablon");
const C = require("./czas");
const { link, linkUstawien, TENANT } = require("./poczta");

const ZNAK_PP = (v) => `${v >= 0 ? "+" : "−"}${String(Math.abs(Math.round(v * 10) / 10)).replace(".", ",")} pp`;
const proc0 = (v) => `${Math.round(Math.abs(v))}%`;

const naglowek = (m) => {
  const r = m.razem;
  const wczoraj = m.rodzaj === "dzien";
  if (r.utarg != null && r.vsCel != null) {
    const ponad = r.vsCel >= 0;
    return wczoraj
      ? `Wczoraj: utarg ${proc0(r.vsCel)} ${ponad ? "ponad plan" : "poniżej planu"}`
      : ponad
      ? `Dobry tydzień: utarg ${proc0(r.vsCel)} ponad cel`
      : `Tydzień: utarg ${proc0(r.vsCel)} poniżej celu`;
  }
  if (r.utarg != null) return `${wczoraj ? "Wczoraj" : "Tydzień"}: utarg ${C.zl(r.utarg)}`;
  if (r.godziny) return `${wczoraj ? "Wczoraj" : "Tydzień"}: ${C.godz(r.godziny)} pracy`;
  return wczoraj ? "Wczoraj bez zapisanych godzin" : "Tydzień bez zapisanych godzin";
};

const podsumowanie = (m) => {
  const zdania = [];
  const zCelem = m.perLokal.filter((l) => l.kosztPct != null && l.celPct != null);
  if (zCelem.length) {
    const wNormie = zCelem.filter((l) => l.kosztPct <= l.celPct).length;
    zdania.push(
      zCelem.length === 1
        ? `Koszt pracy ${wNormie ? "w normie" : "ponad cel"}${m.perLokal.length > 1 ? ` w lokalu ${zCelem[0].lokal}` : ""}.`
        : `Koszt pracy w normie w ${wNormie} z ${zCelem.length} lokali.`
    );
  }
  const doZrobienia = [];
  if (m.decyzjiRazem) doZrobienia.push(`${m.decyzjiRazem} ${C.odmiana(m.decyzjiRazem, ["decyzji", "decyzji", "decyzji"])}`);
  if (m.bezOdbiciaRazem)
    doZrobienia.push(`${m.bezOdbiciaRazem} ${C.odmiana(m.bezOdbiciaRazem, ["brakującego zapisu", "brakujących zapisów", "brakujących zapisów"])} godzin`);
  if (doZrobienia.length) zdania.push(`Najpierw zajrzyj do ${doZrobienia.join(" i ")}.`);
  else zdania.push("Nic nie czeka na Twoją decyzję.");
  if (m.pulsOtwarty.length) zdania.push(`Puls niezamknięty: ${m.pulsOtwarty.join(", ")}.`);
  return zdania.join(" ");
};

const kafelkiRaportu = (m) => {
  const r = m.razem;
  const wczoraj = m.rodzaj === "dzien";
  return S.kafelki([
    {
      etykieta: "Utarg",
      wartosc: r.utarg == null ? "—" : C.zl(r.utarg),
      pod:
        r.vsCel != null
          ? `${r.vsCel >= 0 ? "▲" : "▼"} ${proc0(r.vsCel)} vs ${wczoraj ? "plan" : "cel"} ${C.kwota(r.celUtarg)}`
          : r.utarg == null
          ? "nie wpisano"
          : "bez celu",
      tonPod: r.vsCel == null ? null : r.vsCel >= 0 ? "ok" : "no",
    },
    {
      etykieta: "Koszt pracy",
      wartosc: r.kosztPct == null ? "—" : `${r.niepelny ? "~" : ""}${C.procent(r.kosztPct)}`,
      pod:
        r.kosztPct != null && r.celPct != null
          ? `cel ${C.procent(r.celPct)} · ${ZNAK_PP(r.kosztPct - r.celPct)}`
          : r.niepelny
          ? "brak stawek części osób"
          : "",
      tonPod: r.kosztPct != null && r.celPct != null ? (r.kosztPct <= r.celPct ? "ok" : "warn") : null,
    },
    {
      etykieta: "Godziny",
      wartosc: C.godz(r.godziny),
      pod: `grafik ${C.godz(r.godzinyPlan)}`,
    },
    {
      etykieta: "Zmiany",
      wartosc: String(r.zmian),
      pod: m.bezZapisuWOkresie ? `${m.bezZapisuWOkresie} bez zapisu` : "wszystkie zapisane",
      tonPod: m.bezZapisuWOkresie ? "warn" : null,
    },
  ]);
};

const wymagaUwagi = (m) => {
  const pozycje = [];
  if (m.decyzjiRazem) {
    pozycje.push(
      S.uwaga({
        ton: "warn",
        tytul: `${m.decyzjiRazem} ${C.odmiana(m.decyzjiRazem, ["decyzja czeka", "decyzje czekają", "decyzji czeka"])}`,
        pod: m.decyzje.map(([nazwa, n]) => `${nazwa} (${n})`).join(", "),
        akcja: "Zatwierdź",
        href: link("zatwierdzanie"),
      })
    );
  }
  if (m.bezOdbiciaRazem) {
    const osoby = Object.entries(m.bezOdbiciaOsoby).sort((a, b) => b[1] - a[1]);
    pozycje.push(
      S.uwaga({
        ton: "warn",
        tytul: `${m.bezOdbiciaRazem} ${C.odmiana(m.bezOdbiciaRazem, ["zmiana", "zmiany", "zmian"])} bez zapisu godzin`,
        pod: osoby.slice(0, 4).map(([n, k]) => `${n} (${k})`).join(" · ") + (osoby.length > 4 ? ` · +${osoby.length - 4}` : ""),
        akcja: "Uzupełnij",
        href: link("zatwierdzanie"),
      })
    );
  }
  m.ponadBudzet.slice(0, 2).forEach((k) => {
    pozycje.push(
      S.uwaga({
        ton: "no",
        tytul: `${m.rodzaj === "dzien" ? "Wczoraj" : C.DNI_PELNE[C.dzienTygodnia(k.dzien)].replace(/^./, (z) => z.toUpperCase())} ponad budżet`,
        pod: `obsada ${C.godz(k.godziny)} przy budżecie ${C.godz(k.budzetH)} · koszt ${C.procent(k.pct)} przy celu ${C.procent(k.cel.pct)} · ${k.lokal}`,
        akcja: "Konfiguracja",
        href: link("grafik"),
      })
    );
  });
  if (m.pulsOtwarty.length) {
    pozycje.push(
      S.uwaga({
        ton: "neutral",
        tytul: "Wczorajszy dzień niezamknięty",
        pod: m.pulsOtwarty.join(" · "),
        akcja: "Zamknij",
        href: link("puls"),
      })
    );
  }
  if (!pozycje.length) return "";
  return S.naglowekSekcji("Wymaga uwagi", String(pozycje.length)) + pozycje.join("");
};

const utargDniami = (m) => {
  if (m.rodzaj !== "tydzien" || !m.perDzien.some((d) => d.utarg != null)) return "";
  return (
    S.naglowekSekcji("Utarg dzień po dniu", "fakt / cel, zł") +
    S.slupki(
      m.perDzien.map((d) => ({
        etykieta: C.DNI_DWULITEROWO[C.dzienTygodnia(d.dzien)],
        fakt: d.utarg,
        cel: d.cel,
        faktTxt: C.kwota(d.utarg),
        celTxt: C.kwota(d.cel),
      }))
    )
  );
};

const lokaleTabela = (m) => {
  const aktywne = m.perLokal.filter((l) => l.godziny || l.utarg != null || l.godzinyPlan);
  if (aktywne.length < 2) return "";
  return (
    S.naglowekSekcji("Lokale", "utarg · koszt pracy · godziny fakt / grafik") +
    S.tabela(
      aktywne.map((l) => ({
        nazwa: l.lokal,
        kolumny: [
          { w: l.utarg == null ? "—" : C.zl(l.utarg) },
          {
            w: l.kosztPct == null ? "—" : `${l.niepelny ? "~" : ""}${proc0(l.kosztPct)}`,
            ton: l.kosztPct != null && l.celPct != null ? (l.kosztPct <= l.celPct ? "ok" : "warn") : null,
          },
          { w: `${Math.round(l.godziny)} / ${Math.round(l.godzinyPlan)} h` },
        ],
      }))
    )
  );
};

const grafikIZmiany = (m) => {
  if (m.rodzaj !== "tydzien") return "";
  const zatwierdzone = m.skierowane.filter((s) => s.status === "zatwierdzona").length;
  const wziete = m.gielda.filter((s) => s.taker_user_name || ["przyjeta", "zatwierdzona"].includes(s.status)).length;
  const poz = [
    {
      e: `Grafik na ${C.zakresDat(m.nastPon, m.nastNd).replace(/ \d{4}$/, "")}`,
      w: m.opublikowaneNast ? "opublikowany" : "jeszcze nie wysłany",
      ton: m.opublikowaneNast ? "ok" : "warn",
    },
  ];
  if (m.skierowane.length) poz.push({ e: "Zamiany zmian", w: `${m.skierowane.length} · ${zatwierdzone} zatwierdzone` });
  if (m.gielda.length) poz.push({ e: "Giełda — wzięte zmiany", w: `${wziete} z ${m.gielda.length}` });
  return S.naglowekSekcji("Grafik i zmiany") + S.lista(poz);
};

const ludzie = (m) => {
  if (m.rodzaj !== "tydzien") return "";
  const poz = [];
  if (m.najwiecej) poz.push({ e: `Najwięcej godzin: ${m.najwiecej[0]}`, w: C.godz(m.najwiecej[1]) });
  m.ponadNorme.slice(0, 3).forEach((p) =>
    poz.push({ e: `Ponad normą (etat): ${p.name}`, w: `+${C.godz(p.ponad)} w ${C.MIES_KROTKO[Number(m.doDnia.slice(5, 7)) - 1]}`, ton: "warn" })
  );
  m.probni.forEach((u) => poz.push({ e: `Nowa osoba na próbę: ${u.name}`, w: "czeka na decyzję", ton: "warn" }));
  if (m.problemy.length) {
    const anon = m.problemy.filter((i) => i.is_anonymous || !i.user_id).length;
    poz.push({ e: "Zgłoszenia problemów", w: `${m.problemy.length}${anon ? ` · ${anon} anonimowe` : ""}` });
  }
  return poz.length ? S.naglowekSekcji("Ludzie") + S.lista(poz) : "";
};

const najblizsze = (m) => {
  const poz = [];
  if (m.rodzaj === "dzien") {
    m.dzisWGrafiku.forEach((d) =>
      poz.push({ e: d.lokal, w: `${d.osoby} ${C.odmiana(d.osoby, ["osoba", "osoby", "osób"])} od ${d.pierwsza}` })
    );
  }
  m.urlopy.slice(0, 6).forEach((a) =>
    poz.push({
      e: `${C.krotkaData(a.start_date < m.dzis ? m.dzis : a.start_date)} · ${a.type === "urlop" ? "urlop" : "wolne"}: ${a.user_name}`,
      w: a.end_date === a.start_date ? "1 dzień" : `do ${C.krotkaData(a.end_date)}`,
    })
  );
  m.wyjatkiBliskie.forEach((w) =>
    poz.push({
      e: `${C.krotkaData(w.date_from < m.dzis ? m.dzis : w.date_from)} · ${w.note || "wyjątek"} · ${w.lokal}`,
      w: w.zamkniete
        ? "lokal zamknięty"
        : w.open_time && w.close_time
        ? `${String(w.open_time).slice(0, 5)}–${String(w.close_time).slice(0, 5)}`
        : "wyjątek",
      ton: w.zamkniete ? "no" : null,
    })
  );
  if (!poz.length) return "";
  return S.naglowekSekcji(m.rodzaj === "dzien" ? "Dziś" : "Najbliższy tydzień") + S.lista(poz);
};

const informacje = (m) => {
  if (m.rodzaj !== "dzien" || !m.informacje.length) return "";
  const poz = m.informacje.slice(0, 8).map((i) => ({ e: i.message, w: i.ile > 1 ? `×${i.ile}` : "" }));
  const reszta = m.informacje.length - poz.length;
  if (reszta > 0) poz.push({ e: `i ${reszta} więcej w Skrzynce`, w: "" });
  return S.naglowekSekcji("Co się działo — ostatnia doba") + S.lista(poz);
};

// { temat, html, tekst }
const mailRaportu = (m, kierownik) => {
  const tydzien = m.rodzaj === "tydzien";
  const tytul = naglowek(m);
  const okres = tydzien
    ? `Tydzień ${C.numerTygodnia(m.od)} · ${C.zakresDat(m.od, m.doDnia)}`
    : `${C.DNI_PELNE[C.dzienTygodnia(m.od)]} · ${C.zakresDat(m.od, m.od).replace(/^(\d+)–\1/, "$1")}`;
  const lead = podsumowanie(m);
  const tresc =
    `<div style="font-family:'Archivo',Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${S.K.szary};margin:0 0 6px 0">${S.esc(okres)}</div>` +
    S.tytul(tytul) +
    S.akapit(S.esc(lead), { margines: "0 0 4px 0" }) +
    kafelkiRaportu(m) +
    wymagaUwagi(m) +
    utargDniami(m) +
    lokaleTabela(m) +
    grafikIZmiany(m) +
    ludzie(m) +
    informacje(m) +
    najblizsze(m) +
    S.przyciski(
      [
        { tekst: tydzien ? "Otwórz pełny raport" : "Otwórz Pulpit", href: link(tydzien ? "raporty" : "pulpit") },
        m.decyzjiRazem
          ? {
              tekst: `Zatwierdź ${m.decyzjiRazem} ${C.odmiana(m.decyzjiRazem, ["decyzję", "decyzje", "decyzji"])}`,
              href: link("zatwierdzanie"),
              drugi: true,
            }
          : null,
      ].filter(Boolean)
    );
  const kto =
    kierownik.role === "manager_lokalu"
      ? `jesteś kierownikiem lokalu ${m.lokaleZakresu.join(", ")}`
      : `jesteś kierownikiem sieci${TENANT ? ` ${TENANT}` : ""}`;
  const html = S.koperta({
    temat: tytul,
    zajawka: lead,
    prawo: `${tydzien ? "Raport tygodniowy" : "Raport dnia"} · ${m.zakresNazwa}`,
    tresc,
    stopka: `Dostajesz tę wiadomość, bo ${kto} — raport dnia przychodzi codziennie rano, a w poniedziałek zamiast niego tygodniowy`,
    ustawieniaUrl: linkUstawien(kierownik.id),
  });
  const r = m.razem;
  const tekst = [
    okres,
    tytul,
    lead,
    "",
    `Utarg: ${r.utarg == null ? "—" : C.zl(r.utarg)}${r.vsCel != null ? ` (${r.vsCel >= 0 ? "+" : "−"}${proc0(r.vsCel)} vs cel)` : ""}`,
    `Koszt pracy: ${r.kosztPct == null ? "—" : C.procent(r.kosztPct)}${r.celPct != null ? ` (cel ${C.procent(r.celPct)})` : ""}`,
    `Godziny: ${C.godz(r.godziny)} (grafik ${C.godz(r.godzinyPlan)})`,
    `Zmiany: ${r.zmian}`,
    m.decyzjiRazem ? `Decyzje: ${m.decyzje.map(([n, k]) => `${n} (${k})`).join(", ")}` : null,
    m.bezOdbiciaRazem ? `Bez zapisu godzin: ${m.bezOdbiciaRazem}` : null,
    "",
    `Otwórz: ${link(tydzien ? "raporty" : "pulpit")}`,
    `Ustawienia powiadomień: ${linkUstawien(kierownik.id)}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  const temat = tydzien ? `Raport tygodnia ${C.numerTygodnia(m.od)} · ${tytul}` : `${tytul} · ${m.zakresNazwa}`;
  return { temat, html, tekst };
};

module.exports = { mailRaportu };
