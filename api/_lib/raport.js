// Raport kierownika e-mailem: dzienny i tygodniowy (0.70.0, makieta
// właściciela "Raport tygodniowy · Cała sieć").
//
// ⚠️ Z src/ NIE WOLNO tu importować (CLAUDE.md, sekcja "Cron"), więc reguły
// liczenia są tu PRZEPISANE z:
//   utils/umowy.ts      — typUmowy, normaMiesiaca, stawkaEfektywna, narzutDla
//   utils/budzet.ts     — kosztGodziny, celDnia
//   utils/kalendarz.ts  — wielkanoc, swietaRoku, wymiarCzasuPracy
//   utils/odbicia.ts    — zmianyBezOdbicia
//   utils/porzucone.ts  — progi i czyPorzucona
//   utils/wpisy.ts      — czekaNaKoniecOdKierownika
//   ManagerDashboard    — kolejki "Do decyzji" i hasAccessToLokal
//   utils/dziennik.ts   — koszt dnia jak w autoPodsumowanie (Puls)
// harness-email.html liczy te same przypadki OBOMA kodami i porównuje wyniki.
// Zmieniając regułę w src/, popraw ją tutaj — inaczej mail powie kierownikowi
// co innego niż aplikacja, a to kosztuje więcej zaufania niż brak maila.

const C = require("./czas");

// --- liczby i umowy (utils/umowy.ts, utils/budzet.ts) --------------------
const liczba = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

const typUmowy = (user) => {
  if (!user) return null;
  if (user.typ_umowy) return user.typ_umowy;
  if (user.etat === "zlecenie") return "zlecenie";
  if (user.etat === "pełny" || user.etat === "część") return "umowa_o_prace";
  return null;
};
const naEtacie = (u) => typUmowy(u) === "umowa_o_prace";
const naZleceniu = (u) => typUmowy(u) === "zlecenie";

const wielkanoc = (rok) => {
  const a = rok % 19;
  const b = Math.floor(rok / 100);
  const c = rok % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mies = Math.floor((h + l - 7 * m + 114) / 31);
  const dzien = ((h + l - 7 * m + 114) % 31) + 1;
  return `${rok}-${String(mies).padStart(2, "0")}-${String(dzien).padStart(2, "0")}`;
};
const swietaRoku = (rok) => {
  const w = wielkanoc(rok);
  const s = (m, d) => `${rok}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Set([
    s(1, 1), s(1, 6), w, C.dodajDni(w, 1), s(5, 1), s(5, 3), C.dodajDni(w, 49),
    C.dodajDni(w, 60), s(8, 15), s(11, 1), s(11, 11), s(12, 25), s(12, 26),
  ]);
};
const wymiarCzasuPracy = (rok, mies) => {
  const dni = new Date(Date.UTC(rok, mies, 0)).getUTCDate();
  const swieta = swietaRoku(rok);
  let robocze = 0;
  let swietaPozaNiedziela = 0;
  for (let d = 1; d <= dni; d++) {
    const dzien = `${rok}-${String(mies).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = C.dzienTygodnia(dzien);
    if (dow >= 1 && dow <= 5) robocze++;
    if (swieta.has(dzien) && dow !== 0) swietaPozaNiedziela++;
  }
  return (robocze - swietaPozaNiedziela) * 8;
};
const normaMiesiaca = (user, rok, mies) => {
  if (!naEtacie(user)) return null;
  const wymiar = liczba(user.wymiar_etatu);
  if (wymiar == null) return null;
  return Math.round(wymiarCzasuPracy(rok, mies) * wymiar * 10) / 10;
};
const stawkaEfektywna = (user, rok, mies) => {
  if (naZleceniu(user) || typUmowy(user) === "b2b") return liczba(user.stawka);
  if (naEtacie(user)) {
    const norma = normaMiesiaca(user, rok, mies);
    const kwota = liczba(user.wynagrodzenie_mies);
    if (!norma || kwota == null) return liczba(user.stawka);
    return Math.round((kwota / norma) * 100) / 100;
  }
  return liczba(user.stawka);
};
const narzutDla = (user, lokalRow) => {
  if (!lokalRow) return 0;
  const n = liczba(naZleceniu(user) ? lokalRow.narzut_zlecenie : lokalRow.narzut_umowa);
  return n == null ? 0 : n;
};
const kosztGodziny = (user, lokalRow, rok, mies) => {
  const st = stawkaEfektywna(user, rok, mies);
  if (st == null) return null;
  return st * (1 + narzutDla(user, lokalRow) / 100);
};

const celDnia = (cele, budzetDni, lokal, dzien) => {
  const zestawy = [...new Set(cele.filter((c) => c.lokal === lokal).map((c) => c.obowiazuje_od))].sort(
    (a, b) => (a < b ? 1 : -1)
  );
  const od = zestawy.find((z) => z <= dzien) || null;
  const dow = C.dzienTygodnia(dzien);
  const wiersz = od
    ? cele.find((c) => c.lokal === lokal && c.obowiazuje_od === od && Number(c.day_of_week) === dow)
    : null;
  const nadpis = budzetDni.find((d) => d.lokal === lokal && d.date === dzien) || null;
  const nadUtarg = liczba(nadpis && nadpis.oczekiwany_utarg);
  const nadPct = liczba(nadpis && nadpis.cel_koszt_pct);
  const utarg = nadUtarg != null ? nadUtarg : liczba(wiersz && wiersz.oczekiwany_utarg);
  const pct = nadPct != null ? nadPct : liczba(wiersz && wiersz.cel_koszt_pct);
  if (utarg == null && pct == null) return null;
  return { utarg, pct };
};

// --- tożsamość i dostęp -------------------------------------------------
// Jak publishedShiftsFor/findBlockingAbsence: po id, gdy obie strony je mają,
// inaczej po imieniu.
const tenSam = (wiersz, user) =>
  wiersz.user_id && user.id != null
    ? String(wiersz.user_id) === String(user.id)
    : wiersz.user_name === user.name;

const znajdzOsobe = (users, id, nazwa) =>
  users.find((u) => (id != null && String(u.id) === String(id)) || (nazwa && u.name === nazwa)) || null;

const ROLE_KIEROWNIKA = ["admin", "manager", "manager_lokalu"];

// hasAccessToLokal z ManagerDashboard: kierownik lokalu widzi swoje
// allowed_lokale, właściciel (admin / stara rola manager) — wszystko.
const dostepKierownika = (kierownik) => {
  if (kierownik.role !== "manager_lokalu") return () => true;
  const lista = String(kierownik.allowed_lokale || "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  return (lokal) => lista.includes(lokal);
};

// --- kolejki (utils/odbicia.ts, porzucone.ts, wpisy.ts) -----------------
const OKNO_DNI = 14;

const zmianyBezOdbicia = ({ plan, shifts, users, absences, dzis, lokalOk }) => {
  const od = C.dodajDni(dzis, -OKNO_DNI);
  return plan
    .filter((s) => s.published_at && !s.deleted_at && !s.rozliczenie && s.date >= od && s.date < dzis && lokalOk(s.lokal))
    .map((s) => ({ plan: s, user: users.find((u) => String(u.id) === String(s.user_id)) }))
    .filter(({ plan: p, user }) => {
      if (!user || user.archived) return false;
      // poOstatnimDniu — jak w utils/odbicia.ts (0.70.1).
      if (user.ostatni_dzien && p.date > user.ostatni_dzien) return false;
      const wolne = absences.some(
        (a) => a.status === "approved" && a.start_date <= p.date && p.date <= a.end_date && tenSam(a, user)
      );
      if (wolne) return false;
      return !shifts.some(
        (f) => f.start_time && !f.is_urlop && C.ymd(f.start_time) === p.date && tenSam(f, user)
      );
    });
};

const progiLokalu = (lokale, nazwa) => {
  const row = lokale.find((l) => l.name === nazwa);
  const albo = (v, d) => {
    const n = liczba(v);
    return n != null && n > 0 ? n : d;
  };
  return { tolerancja: albo(row && row.tolerancja_po_grafiku_h, 4), maks: albo(row && row.max_dlugosc_zmiany_h, 17) };
};

const planowanyKoniec = (plan, user, start) => {
  const dzien = C.ymd(start);
  let najpozniej = null;
  plan
    .filter((s) => s.published_at && !s.deleted_at && s.date === dzien && tenSam(s, user))
    .forEach((s) => {
      const od = C.minuty(s.start_time);
      const doG = C.minuty(s.end_time);
      if (od == null || doG == null) return;
      const koniec = C.chwila(doG > od ? s.date : C.dodajDni(s.date, 1), String(s.end_time).slice(0, 5));
      if (!najpozniej || koniec > najpozniej) najpozniej = koniec;
    });
  return najpozniej;
};

const czyPorzucona = ({ shift, plan, lokale, users, teraz }) => {
  if (!shift || shift.end_time || shift.is_urlop || shift.rozliczenie) return false;
  const user = znajdzOsobe(users, shift.user_id, null) || { id: shift.user_id, name: shift.user_name };
  const start = new Date(shift.start_time);
  const { tolerancja, maks } = progiLokalu(lokale, shift.lokal);
  const koniec = planowanyKoniec(plan, user, start);
  const prog =
    koniec && koniec > start
      ? new Date(koniec.getTime() + tolerancja * 3600000)
      : new Date(start.getTime() + maks * 3600000);
  return teraz >= prog;
};

const czekaNaKoniecOdKierownika = (shift, issues) =>
  issues.some(
    (i) => i.type === "correction" && i.status !== "rozwiazane" && String(i.shift_id) === String(shift.id) && !!i.proposed_end_time
  );

// --- liczenie dla jednego kierownika ------------------------------------
//
// `dane` — wszystko pobrane raz dla całej sieci (pobierzDane w endpoincie).
// `rodzaj` — 'dzien' (wczoraj) albo 'tydzien' (ubiegły pon–ndz).
const policz = ({ dane, kierownik, rodzaj, dzis, teraz = new Date() }) => {
  const { lokale, users, shifts, plan, dayLogs, cele, budzetDni, issues, absences, swaps, wyjatki, powiadomienia } = dane;
  const dostep = dostepKierownika(kierownik);
  const lokaleZakresu = lokale.filter((l) => !l.archived && dostep(l.name));
  const nazwyZakresu = lokaleZakresu.map((l) => l.name);
  const wZakresie = (lokal) => nazwyZakresu.includes(lokal);
  const zakresNazwa =
    kierownik.role !== "manager_lokalu"
      ? "Cała sieć"
      : nazwyZakresu.length === 1
      ? nazwyZakresu[0]
      : "Wszystkie moje";

  const wczoraj = C.dodajDni(dzis, -1);
  const od = rodzaj === "tydzien" ? C.dodajDni(C.poniedzialek(dzis), -7) : wczoraj;
  const doDnia = rodzaj === "tydzien" ? C.dodajDni(od, 6) : wczoraj;
  const dni = [];
  for (let d = od; d <= doDnia; d = C.dodajDni(d, 1)) dni.push(d);

  const fakt = shifts.filter((s) => s.start_time && !s.is_urlop);

  // Dzień × lokal — ta sama reguła co autoPodsumowanie w Pulsie: zmiany
  // faktu po dacie startu, koszt = godziny × koszt godziny osoby w lokalu
  // tego dnia; plan = wszystkie nieusunięte zmiany grafiku tego dnia.
  const komorki = [];
  dni.forEach((dzien) => {
    const [rok, mies] = dzien.split("-").map(Number);
    lokaleZakresu.forEach((l) => {
      const zmiany = fakt.filter((s) => s.lokal === l.name && C.ymd(s.start_time) === dzien);
      let godziny = 0;
      let koszt = 0;
      const bezStawki = new Set();
      zmiany.forEach((s) => {
        if (!s.end_time) return;
        const h = C.godzinyFaktu(s);
        godziny += h;
        const u = znajdzOsobe(users, s.user_id, s.user_name);
        const st = u ? kosztGodziny(u, l, rok, mies) : null;
        if (st != null) koszt += h * st;
        else bezStawki.add(s.user_name);
      });
      const godzinyPlan = plan
        .filter((p) => p.lokal === l.name && p.date === dzien && !p.deleted_at)
        .reduce((a, p) => a + C.godzinyPlanu(p), 0);
      const karta = dayLogs.find((k) => k.lokal === l.name && k.date === dzien);
      komorki.push({
        dzien,
        lokal: l.name,
        zmian: zmiany.length,
        godziny,
        godzinyPlan,
        koszt,
        bezStawki: [...bezStawki],
        utarg: karta ? liczba(karta.obrot) : null,
        zamkniety: !!karta && karta.status === "zamkniety",
        cel: celDnia(cele, budzetDni, l.name, dzien),
      });
    });
  });

  // Suma grupy komórek. Udział kosztu liczymy z SUM i tylko z dni, w których
  // jest utarg — dzień bez wpisanego utargu dawałby koszt bez mianownika.
  // Cel udziału ważymy utargiem (planowanym, a gdy go brak — faktycznym), z
  // tego samego powodu co budżet tygodnia w Grafiku.
  const suma = (lista) => {
    const zUtargiem = lista.filter((k) => k.utarg != null);
    const utarg = zUtargiem.reduce((a, k) => a + k.utarg, 0);
    const kosztZUtargiem = zUtargiem.reduce((a, k) => a + k.koszt, 0);
    const porownywalne = zUtargiem.filter((k) => k.cel && k.cel.utarg != null);
    const utargPor = porownywalne.reduce((a, k) => a + k.utarg, 0);
    const celPor = porownywalne.reduce((a, k) => a + k.cel.utarg, 0);
    const zPct = zUtargiem.filter((k) => k.cel && k.cel.pct != null);
    const waga = zPct.reduce((a, k) => a + (k.cel.utarg != null ? k.cel.utarg : k.utarg), 0);
    const celPct = waga
      ? zPct.reduce((a, k) => a + k.cel.pct * (k.cel.utarg != null ? k.cel.utarg : k.utarg), 0) / waga
      : null;
    return {
      utarg: zUtargiem.length ? utarg : null,
      celUtarg: porownywalne.length ? celPor : null,
      vsCel: celPor ? ((utargPor - celPor) / celPor) * 100 : null,
      kosztPct: utarg ? (kosztZUtargiem / utarg) * 100 : null,
      celPct,
      niepelny: zUtargiem.some((k) => k.bezStawki.length),
      godziny: lista.reduce((a, k) => a + k.godziny, 0),
      godzinyPlan: lista.reduce((a, k) => a + k.godzinyPlan, 0),
      zmian: lista.reduce((a, k) => a + k.zmian, 0),
    };
  };
  const razem = suma(komorki);
  const perLokal = lokaleZakresu.map((l) => ({ lokal: l.name, ...suma(komorki.filter((k) => k.lokal === l.name)) }));
  // Słupek dnia: cel pokazujemy tylko wtedy, gdy KAŻDY lokal z utargiem ma
  // tego dnia plan. Inaczej utarg całej sieci stałby obok planu jednego lokalu
  // i "4 000 / 2 800" wyglądałoby na rekord, a jest porównaniem jabłek z
  // gruszkami.
  const perDzien = dni.map((d) => {
    const dnia = komorki.filter((k) => k.dzien === d);
    const s = suma(dnia);
    const zUtargiem = dnia.filter((k) => k.utarg != null);
    const pelny = zUtargiem.length > 0 && zUtargiem.every((k) => k.cel && k.cel.utarg != null);
    return { dzien: d, utarg: s.utarg, cel: pelny ? zUtargiem.reduce((a, k) => a + k.cel.utarg, 0) : null };
  });

  // Dni ponad budżet: udział kosztu wyższy niż cel (komórka dzień × lokal).
  // "Budżet w godzinach" = cel% × utarg / średni koszt godziny tego dnia —
  // tak jak w makiecie ("obsada 35 h przy budżecie 32,8 h").
  const ponadBudzet = komorki
    .filter((k) => k.utarg && k.cel && k.cel.pct != null && k.godziny && k.koszt)
    .map((k) => ({ ...k, pct: (k.koszt / k.utarg) * 100 }))
    .filter((k) => k.pct > k.cel.pct)
    .map((k) => ({ ...k, budzetH: ((k.cel.pct / 100) * k.utarg) / (k.koszt / k.godziny) }))
    .sort((a, b) => b.pct - b.cel.pct - (a.pct - a.cel.pct));

  // --- kolejki "Do decyzji" (stan NA TERAZ, jak znaczek w menu) ---
  const zmianaPoId = (id) => shifts.find((s) => String(s.id) === String(id));
  const korekty = issues.filter((i) => {
    if (i.type !== "correction" || i.status !== "nowe") return false;
    const z = i.shift_id ? zmianaPoId(i.shift_id) : null;
    return dostep(z ? z.lokal : i.proposed_lokal);
  });
  const wolne = absences.filter((a) => a.status === "pending" && dostep(a.lokal));
  const zamiany = swaps.filter((s) => s.status === "przyjeta" && dostep(s.lokal));
  const probni = users.filter((u) => u.probny_status === "oczekuje" && !u.archived && dostep(u.default_lokal));
  const bezKonca = shifts
    .filter((s) => dostep(s.lokal) && czyPorzucona({ shift: s, plan, lokale, users, teraz }))
    .filter((s) => !czekaNaKoniecOdKierownika(s, issues));
  const decyzje = [
    ["korekty", korekty.length],
    ["wolne", wolne.length],
    [zamiany.length === 1 ? "zamiana" : "zamiany", zamiany.length],
    ["na próbę", probni.length],
    ["bez zakończenia", bezKonca.length],
  ].filter(([, n]) => n > 0);
  const decyzjiRazem = decyzje.reduce((a, [, n]) => a + n, 0);

  const bezOdbicia = zmianyBezOdbicia({ plan, shifts, users, absences, dzis, lokalOk: dostep });
  const bezOdbiciaOsoby = {};
  bezOdbicia.forEach(({ user }) => {
    bezOdbiciaOsoby[user.name] = (bezOdbiciaOsoby[user.name] || 0) + 1;
  });
  const bezZapisuWOkresie = bezOdbicia.filter(({ plan: p }) => p.date >= od && p.date <= doDnia).length;

  const pulsOtwarty = rodzaj === "dzien"
    ? komorki.filter((k) => k.zmian > 0 && !k.zamkniety).map((k) => k.lokal)
    : [];

  // --- ludzie, grafik, najbliższe dni ---
  const godzinyOsob = {};
  fakt
    .filter((s) => s.end_time && wZakresie(s.lokal) && C.ymd(s.start_time) >= od && C.ymd(s.start_time) <= doDnia)
    .forEach((s) => {
      godzinyOsob[s.user_name] = (godzinyOsob[s.user_name] || 0) + C.godzinyFaktu(s);
    });
  const najwiecej = Object.entries(godzinyOsob).sort((a, b) => b[1] - a[1])[0] || null;

  // Ponad normę: miesiąc dnia `doDnia`, fakt + urlop ze WSZYSTKICH lokali
  // (godziny osoby to fakt płacowy, nie fakt lokalu — patrz Raporty i koszty),
  // zliczane od 1. dnia do `doDnia`. Pokazujemy tylko przekroczenie PEŁNEJ
  // normy miesiąca — "do normy brakuje" w połowie miesiąca nic nie znaczy.
  const [rokM, miesM] = doDnia.split("-").map(Number);
  const pierwszy = `${doDnia.slice(0, 8)}01`;
  const ponadNorme = users
    .filter((u) => u.active && !u.archived && naEtacie(u) && dostep(u.default_lokal))
    .map((u) => {
      const norma = normaMiesiaca(u, rokM, miesM);
      if (!norma) return null;
      const h = shifts
        .filter((s) => s.end_time && tenSam(s, u) && C.ymd(s.start_time) >= pierwszy && C.ymd(s.start_time) <= doDnia)
        .reduce((a, s) => a + C.godzinyFaktu(s), 0);
      return h > norma + 0.5 ? { name: u.name, ponad: h - norma } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.ponad - a.ponad);

  const problemy = issues.filter((i) => {
    if ((i.type || "problem") === "correction") return false;
    const d = i.created_at ? C.ymd(i.created_at) : null;
    if (!d || d < od || d > doDnia) return false;
    if (!i.user_id) return true; // anonimowe — każdy kierownik (patrz 0033)
    const u = users.find((x) => String(x.id) === String(i.user_id));
    return dostep((u && u.default_lokal) || "");
  });

  const swapyOkresu = swaps.filter((s) => {
    const d = s.created_at ? C.ymd(s.created_at) : null;
    return d && d >= od && d <= doDnia && dostep(s.lokal);
  });
  const skierowane = swapyOkresu.filter((s) => (s.typ || "gielda") !== "gielda");
  const gielda = swapyOkresu.filter((s) => (s.typ || "gielda") === "gielda");

  // Grafik na przyszły tydzień (po bieżącym) — czy już wysłany.
  const nastPon = C.dodajDni(C.poniedzialek(dzis), 7);
  const nastNd = C.dodajDni(nastPon, 6);
  const opublikowaneNast = plan.filter(
    (p) => p.published_at && !p.deleted_at && wZakresie(p.lokal) && p.date >= nastPon && p.date <= nastNd
  ).length;

  // Najbliższe dni: urlopy i wyjątki. Tydzień — 7 dni od dziś, dzień — dziś.
  const horyzont = rodzaj === "tydzien" ? C.dodajDni(dzis, 6) : dzis;
  const urlopy = absences
    .filter((a) => a.status === "approved" && a.start_date <= horyzont && a.end_date >= dzis && dostep(a.lokal))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const wyjatkiBliskie = wyjatki
    .filter((w) => wZakresie(w.lokal) && w.date_from <= horyzont && w.date_to >= dzis)
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const dzisWGrafiku = lokaleZakresu
    .map((l) => {
      const z = plan.filter((p) => p.published_at && !p.deleted_at && p.lokal === l.name && p.date === dzis);
      if (!z.length) return null;
      const osoby = new Set(z.map((p) => p.user_id || p.user_name)).size;
      const pierwsza = z.map((p) => String(p.start_time).slice(0, 5)).sort()[0];
      return { lokal: l.name, osoby, pierwsza };
    })
    .filter(Boolean);

  // Powiadomienia kierownika z ostatniej doby, sklejone jak w Skrzynce ("×N").
  const doba = new Date(teraz.getTime() - 24 * 3600000).toISOString();
  const sklejone = {};
  (powiadomienia || [])
    .filter((n) => n.audience === "manager" && n.created_at >= doba && (!n.lokal || dostep(n.lokal)))
    .forEach((n) => {
      const klucz = `${n.type}|${n.lokal}|${n.message}`;
      if (!sklejone[klucz]) sklejone[klucz] = { message: n.message, lokal: n.lokal, ile: 0 };
      sklejone[klucz].ile += 1;
    });

  return {
    rodzaj,
    dzis,
    od,
    doDnia,
    zakresNazwa,
    lokaleZakresu: nazwyZakresu,
    razem,
    perLokal,
    perDzien,
    ponadBudzet,
    decyzje,
    decyzjiRazem,
    bezOdbiciaOsoby,
    bezOdbiciaRazem: bezOdbicia.length,
    bezZapisuWOkresie,
    pulsOtwarty,
    najwiecej,
    ponadNorme,
    probni,
    problemy,
    skierowane,
    gielda,
    nastPon,
    nastNd,
    opublikowaneNast,
    urlopy,
    wyjatkiBliskie,
    dzisWGrafiku,
    informacje: Object.values(sklejone),
  };
};

// Pusty dzień nie zasługuje na maila: nic się nie działo i nic nie czeka.
const czyPusty = (m) =>
  m.razem.zmian === 0 && m.decyzjiRazem === 0 && m.bezOdbiciaRazem === 0 && m.informacje.length === 0;

module.exports = {
  policz,
  czyPusty,
  ROLE_KIEROWNIKA,
  // eksport dla harness-email.html — porównanie z src/utils
  _test: { typUmowy, normaMiesiaca, stawkaEfektywna, kosztGodziny, wymiarCzasuPracy, celDnia, zmianyBezOdbicia, czyPorzucona },
};
