// @ts-nocheck
// Wydarzenia (Roadmap p.3, 0.74.0) — CAŁA logika: kto jest uczestnikiem,
// które wydarzenia stoją w danym dniu, godziny i koszt płatnych, teksty
// wiadomości. Komponenty tylko rysują. Specyfikacja: docs/WYDARZENIA.md.
//
// Rzeczy, których nie widać:
// - Wydarzenie jest NIEZALEŻNE od grafiku (właściciel, 2026-10-08): zapisuje
//   się i powiadamia od razu, bez publikacji, i nie liczy się do obsady.
// - Płatne wydarzenie NIE jest wierszem `grafik_shifts`. Jego godziny liczy
//   `platneMinutyOsoby` i doliczają je świadomie miejsca, które tego potrzebują
//   (wiersz osoby w siatce, budżet, Raport). Patrz migracja 0043.
// - Czas wydarzenia, który wypada W ZMIANIE osoby, liczy się RAZ — jako
//   zmiana. „Zebranie 15–16” u kogoś, kto pracuje 14–22, nie dokłada godziny
//   ani w planie, ani przy rozliczeniu (makieta: „w czasie zmiany — bez
//   dopisania”). Przy częściowym nakładaniu liczy się tylko część poza zmianą.
// - `lokal = NULL` to „Cała sieć” — wydarzenie stoi w KAŻDYM lokalu.
// - `stanowiska = NULL` to „wszystkie stanowiska” — ta sama konwencja co
//   `allowed_lokale` (tekst po przecinku, nie tablica Postgresa).
import { toLocalYMD } from "../api/googleSheets";
import {
  timeToMin,
  trimTime,
  planAbsRange,
  publishedShiftsFor,
  allowedStanowiskaArr,
  isSameUser,
  poOstatnimDniu,
  absenceOn,
} from "./grafik";
import { kosztGodziny } from "./budzet";
import { uwagiPrzypisania } from "./kodeks";
import { api } from "../api/supabase";
import { createEmployeeNotification } from "../api/notifications";

export const TYPY_WYDARZEN = [
  { key: "zebranie", label: "Zebranie / szkolenie", krotko: "Zebranie" },
  { key: "grupa", label: "Grupa / rezerwacja", krotko: "Grupa" },
  { key: "inwentaryzacja", label: "Inwentaryzacja", krotko: "Inwentaryzacja" },
  { key: "kontrola", label: "Kontrola", krotko: "Kontrola" },
  { key: "okolica", label: "W okolicy", krotko: "W okolicy" },
  { key: "inne", label: "Inne", krotko: "Inne" },
];
export const typWydarzenia = (key) => TYPY_WYDARZEN.find((t) => t.key === key) || TYPY_WYDARZEN[TYPY_WYDARZEN.length - 1];

// Role, które bywają uczestnikami z automatu. Tablet to urządzenie, a właściciel
// (`admin`/`manager`) tworzy wydarzenie — kierownik może dopisać każdego ręcznie.
export const ROLE_UCZESTNIKOW = ["open", "closed", "manager_lokalu"];

const lista = (raw) =>
  Array.isArray(raw) ? raw.filter(Boolean) : raw ? String(raw).split(",").map((s) => s.trim()).filter(Boolean) : [];

// NULL / "" = wszystkie stanowiska → zwraca null (nie pustą tablicę!).
export const stanowiskaWydarzenia = (w) => {
  const l = lista(w && w.stanowiska);
  return l.length ? l : null;
};
export const stanowiskaTekst = (tablica) => (tablica && tablica.length ? [...new Set(tablica)].join(",") : null);

export const odwolane = (w) => !!(w && w.odwolane_at);
export const calyDzien = (w) => !(w && w.godz_od && w.godz_do);

// Czy osoba należy do lokalu: lokal macierzysty albo jeden z `allowed_lokale`
// (tablety i kierownicy mają pusty `default_lokal` — patrz CLAUDE.md, 0033).
export const nalezyDoLokalu = (user, lokal) =>
  !lokal || user.default_lokal === lokal || lista(user.allowed_lokale).includes(lokal);

// Lista osób, które powinny dostać wiadomość — PROPOZYCJA do panelu. Zapisuje
// się to, co kierownik zostawi zaznaczone (`wydarzenia_uczestnicy`).
//   zakres 'wszyscy' — wszyscy z tymi stanowiskami w lokalu (zebranie:
//                      przychodzi się też w wolny dzień);
//   zakres 'grafik'  — tylko ci, którzy tego dnia mają opublikowaną zmianę w
//                      tym lokalu na jednym z tych stanowisk (grupa).
// Pomijamy: nieaktywnych, archiwalnych, osoby na próbę czekające na decyzję i
// tych po ostatnim dniu pracy.
export const kandydaciWydarzenia = ({ wydarzenie, users, planShifts }) => {
  const w = wydarzenie || {};
  const st = stanowiskaWydarzenia(w);
  const ludzie = (users || []).filter(
    (u) =>
      u.active !== false &&
      !u.archived &&
      ROLE_UCZESTNIKOW.includes(u.role) &&
      u.probny_status !== "oczekuje" &&
      !(w.data && poOstatnimDniu(u, w.data))
  );
  let wynik;
  if (w.zakres === "grafik") {
    const zmiany = (planShifts || []).filter(
      (s) =>
        s.published_at &&
        !s.deleted_at &&
        s.date === w.data &&
        (!w.lokal || s.lokal === w.lokal) &&
        (!st || st.includes(s.stanowisko))
    );
    wynik = ludzie.filter((u) => zmiany.some((s) => isSameUser(s, u)));
  } else {
    wynik = ludzie.filter(
      (u) => nalezyDoLokalu(u, w.lokal) && (!st || allowedStanowiskaArr(u).some((x) => st.includes(x)))
    );
  }
  return wynik.sort((a, b) => (a.name || "").localeCompare(b.name || "", "pl"));
};

// --- czas -----------------------------------------------------------------

export const minutyWydarzenia = (w) => {
  if (calyDzien(w)) return 0;
  const s = timeToMin(w.godz_od);
  const e = timeToMin(w.godz_do);
  if (s == null || e == null) return 0;
  return e > s ? e - s : 1440 - s + e;
};

// [początek, koniec] w minutach od epoki, liczone od LOKALNEJ północy dnia —
// ta sama skala co `planAbsRange` w utils/grafik.ts i `Date.getTime()/60000`.
export const zakresWydarzenia = (w) =>
  calyDzien(w) ? null : planAbsRange({ date: w.data, start_time: w.godz_od, end_time: w.godz_do });

// Odcinek [a, b] minus suma zajętych odcinków. Zwraca listę rozłącznych
// kawałków, które zostają (może być pusta albo mieć dwa kawałki, gdy zmiana
// wypada w środku wydarzenia).
export const odcinkiPoza = ([a, b], zajete) => {
  let wynik = [[a, b]];
  for (const z of zajete || []) {
    if (!z) continue;
    const [x, y] = z;
    const nast = [];
    for (const [p, k] of wynik) {
      if (y <= p || x >= k) {
        nast.push([p, k]);
        continue;
      }
      if (x > p) nast.push([p, x]);
      if (y < k) nast.push([y, k]);
    }
    wynik = nast;
  }
  return wynik.filter(([p, k]) => k > p);
};
const suma = (odcinki) => odcinki.reduce((s, [p, k]) => s + (k - p), 0);

// Minuty PŁATNEGO wydarzenia, które osoba ma doliczone do PLANU — bez czasu,
// który już stoi w jej opublikowanej zmianie (dowolny lokal).
export const platneMinutyOsoby = (w, user, planShifts) => {
  if (!w || !w.platne || odwolane(w)) return 0;
  const zakres = zakresWydarzenia(w);
  if (!zakres) return 0;
  const zajete = publishedShiftsFor(planShifts, user).map(planAbsRange);
  return suma(odcinkiPoza(zakres, zajete));
};

// Czy wydarzenie u tej osoby wypada (choćby częściowo) w czasie jej zmiany —
// podpis „w czasie zmiany” w panelu i przy rozliczeniu.
export const wCzasieZmiany = (w, user, planShifts) => {
  const zakres = zakresWydarzenia(w);
  if (!zakres) return false;
  return minutyWydarzenia(w) > suma(odcinkiPoza(zakres, publishedShiftsFor(planShifts, user).map(planAbsRange)));
};

// Rozliczenie płatnego wydarzenia: kawałki, które trzeba DOPISAĆ do `shifts`
// tej osobie — bez czasu, który już jest w jej odbitych zmianach (fakt, nie
// plan: ktoś mógł przyjść na zmianę wcześniej). Zmiana bez końca nie zajmuje
// niczego — nie wiadomo, kiedy się skończyła.
export const odcinkiDoRozliczenia = (w, user, shifts) => {
  const zakres = zakresWydarzenia(w);
  if (!zakres) return [];
  const zajete = (shifts || [])
    .filter((s) => s.end_time && (s.user_id ? String(s.user_id) === String(user.id) : s.user_name === user.name))
    .map((s) => [new Date(s.start_time).getTime() / 60000, new Date(s.end_time).getTime() / 60000]);
  return odcinkiPoza(zakres, zajete).map(([p, k]) => ({ start: new Date(p * 60000), end: new Date(k * 60000) }));
};

export const koniecWydarzenia = (w) => {
  const z = zakresWydarzenia(w);
  if (z) return new Date(z[1] * 60000);
  const d = new Date(`${w.data}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d;
};

// Płatne, nieodwołane, nierozliczone i już zakończone → sprawa w „Do decyzji”.
export const doRozliczenia = (wydarzenia, teraz = new Date()) =>
  (wydarzenia || []).filter((w) => w.platne && !odwolane(w) && !w.rozliczone_at && koniecWydarzenia(w) <= teraz);

// --- listy ------------------------------------------------------------------

const klucz = (w) => `${w.data} ${calyDzien(w) ? "00:00" : trimTime(w.godz_od)}`;
export const sortujWydarzenia = (l) => [...(l || [])].sort((a, b) => (klucz(a) < klucz(b) ? -1 : klucz(a) > klucz(b) ? 1 : 0));

// Wydarzenia lokalu w danym dniu (bez odwołanych). `lokal` puste = wszystkie
// lokale; wydarzenie „Cała sieć” stoi zawsze.
export const wydarzeniaNaDzien = (wydarzenia, lokal, data) =>
  sortujWydarzenia(
    (wydarzenia || []).filter((w) => !odwolane(w) && w.data === data && (!lokal || !w.lokal || w.lokal === lokal))
  );

export const wydarzeniaWOkresie = (wydarzenia, lokal, od, doDnia) =>
  sortujWydarzenia(
    (wydarzenia || []).filter(
      (w) => !odwolane(w) && w.data >= od && w.data <= doDnia && (!lokal || !w.lokal || w.lokal === lokal)
    )
  );

export const uczestnicyWydarzenia = (uczestnicy, wydarzenieId) =>
  (uczestnicy || []).filter((u) => String(u.wydarzenie_id) === String(wydarzenieId));

export const jestUczestnikiem = (uczestnicy, wydarzenieId, user) =>
  !!user && uczestnicyWydarzenia(uczestnicy, wydarzenieId).some((u) => String(u.user_id) === String(user.id));

// Wydarzenia, w których osoba jest uczestnikiem („Ja” w grafiku pracownika).
export const wydarzeniaOsoby = (wydarzenia, uczestnicy, user) =>
  sortujWydarzenia((wydarzenia || []).filter((w) => !odwolane(w) && jestUczestnikiem(uczestnicy, w.id, user)));

// Grafik pracownika, widok „Ja”: wydarzenia, w których jest uczestnikiem, PLUS
// wydarzenia całego lokalu (grupa, kontrola, w okolicy, dla wszystkich
// stanowisk) w dniu, w którym ma tam opublikowaną zmianę — „wesele 40 os.”
// zmienia mu pracę, nawet jeśli nie dostał wiadomości. Makieta
// EmployeeScheduleEventMobile, ekran 2.
export const wydarzeniaPracownikaNaDzien = ({ wydarzenia, uczestnicy, user, planShifts, data }) => {
  const moje = publishedShiftsFor(planShifts, user).filter((s) => s.date === data);
  return wydarzeniaNaDzien(wydarzenia, null, data).filter(
    (w) =>
      jestUczestnikiem(uczestnicy, w.id, user) ||
      (dlaCalegoLokalu(w) && moje.some((s) => !w.lokal || s.lokal === w.lokal))
  );
};

// Pasek „Dziś w lokalu” na tablecie — tylko to, co dotyczy CAŁEGO lokalu:
// grupa, kontrola, wydarzenie w okolicy albo wydarzenie dla wszystkich
// stanowisk. Zebranie wybranych osób widzą tylko one, po wybraniu siebie.
export const dlaCalegoLokalu = (w) => ["grupa", "kontrola", "okolica"].includes(w.typ) || !stanowiskaWydarzenia(w);

// --- godziny i koszt płatnych ----------------------------------------------

// Godziny płatnych wydarzeń osoby w okresie [od, doDnia] (YYYY-MM-DD),
// doliczane do planu (wiersz w siatce, norma, „z grafikiem wyjdzie”).
export const godzinyWydarzenOsoby = ({ wydarzenia, uczestnicy, user, planShifts, od, doDnia }) =>
  Math.round(
    ((wydarzenia || [])
      .filter((w) => w.platne && !odwolane(w) && w.data >= od && w.data <= doDnia && jestUczestnikiem(uczestnicy, w.id, user))
      .reduce((s, w) => s + platneMinutyOsoby(w, user, planShifts), 0) /
      60) *
      100
  ) / 100;

// Koszt płatnego wydarzenia dla listy osób — „≈ 180 zł” w panelu. Lokal
// kosztu: lokal wydarzenia, a przy „Cała sieć” — lokal macierzysty osoby.
// Osoba bez stawki/wynagrodzenia NIE liczy się jako 0 — trafia do `bezDanych`.
export const kosztWydarzenia = ({ wydarzenie, osoby, planShifts, lokale }) => {
  const w = wydarzenie;
  const [rok, mies] = (w.data || toLocalYMD(new Date())).split("-").map(Number);
  let koszt = 0;
  let minuty = 0;
  const bezDanych = [];
  for (const u of osoby || []) {
    const m = platneMinutyOsoby({ ...w, platne: true }, u, planShifts);
    if (!m) continue;
    minuty += m;
    const lokalRow = (lokale || []).find((l) => l.name === (w.lokal || u.default_lokal)) || null;
    const k = kosztGodziny(u, lokalRow, rok, mies);
    if (k == null) bezDanych.push(u.name);
    else koszt += (m / 60) * k;
  }
  return { koszt: Math.round(koszt), godziny: Math.round((minuty / 60) * 100) / 100, bezDanych };
};

// --- teksty -----------------------------------------------------------------

const DNI = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
export const dzienKrotko = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return `${DNI[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const godzinyTekst = (w) => (calyDzien(w) ? "cały dzień" : `${trimTime(w.godz_od)}–${trimTime(w.godz_do)}`);
export const lokalTekst = (w) => w.lokal || "cała sieć";
export const opisTerminu = (w) => `${dzienKrotko(w.data)} · ${godzinyTekst(w)} · ${lokalTekst(w)}`;

// ⚠️ Początki zdań („Nowe wydarzenie:”, „Zmiana w wydarzeniu:”, „Wydarzenie
// odwołane:”) rozpoznaje `opisWiadomosci` w employeeSessionShared.tsx i
// api/_lib/wiadomosci.js. Zmieniając je, popraw tamte miejsca.
export const tekstNowego = (w) =>
  `Nowe wydarzenie: ${w.tytul} — ${opisTerminu(w)}${w.platne ? " (płatny czas pracy, wpisany do grafiku)" : ""}.`;
export const tekstOdwolania = (w) => `Wydarzenie odwołane: ${w.tytul} — ${opisTerminu(w)}.`;

// Pola, których zmiana jest dla uczestnika ISTOTNA (wiadomość „było → jest”).
export const zmienionePola = (stare, nowe) => {
  const z = [];
  if (stare.data !== nowe.data) z.push({ e: "Dzień", bylo: dzienKrotko(stare.data), w: dzienKrotko(nowe.data) });
  if (godzinyTekst(stare) !== godzinyTekst(nowe)) z.push({ e: "Godziny", bylo: godzinyTekst(stare), w: godzinyTekst(nowe) });
  if ((stare.lokal || null) !== (nowe.lokal || null)) z.push({ e: "Gdzie", bylo: lokalTekst(stare), w: lokalTekst(nowe) });
  if (!!stare.platne !== !!nowe.platne)
    z.push({ e: "Czas pracy", bylo: stare.platne ? "płatny" : "nie", w: nowe.platne ? "płatny" : "nie" });
  return z;
};
export const tekstZmiany = (stare, nowe) => {
  const z = zmienionePola(stare, nowe);
  return z.length
    ? `Zmiana w wydarzeniu: ${nowe.tytul} — ${z.map((x) => `${x.e.toLowerCase()}: ${x.bylo} → ${x.w}`).join(", ")}.`
    : `Zmiana w wydarzeniu: ${nowe.tytul} — ${opisTerminu(nowe)}.`;
};

// Kto dochodzi, kto wypada, kto zostaje — przy edycji listy uczestników.
export const roznicaUczestnikow = (stareIds, noweIds) => {
  const s = new Set((stareIds || []).map(String));
  const n = new Set((noweIds || []).map(String));
  return {
    dodani: [...n].filter((x) => !s.has(x)),
    usunieci: [...s].filter((x) => !n.has(x)),
    zostali: [...n].filter((x) => s.has(x)),
  };
};

// `notifications.dane` dla maila (kształt z 0039: { wiersze: [{ e, w, bylo }], cytat }).
export const daneDoMaila = (w, zmiany = null) => ({
  wiersze: zmiany && zmiany.length
    ? zmiany
    : [
        { e: "Kiedy", w: `${dzienKrotko(w.data)} · ${godzinyTekst(w)}` },
        { e: "Gdzie", w: lokalTekst(w) },
        ...(w.platne ? [{ e: "Czas pracy", w: "płatny — wpisany do grafiku" }] : []),
      ],
  cytat: w.opis || null,
});

// --- uwagi przy uczestnikach płatnego wydarzenia ----------------------------

// Te same uwagi co w panelu przypisania zmiany (utils/kodeks.ts), plus dwie
// własne: czas wydarzenia w zmianie osoby i wolne tego dnia. Sygnał, nie
// blokada — tak jak w Grafiku.
export const uwagiUczestnika = ({ wydarzenie, user, planShifts, absences }) => {
  const w = wydarzenie;
  const out = [];
  const wolne = w.data ? absenceOn(absences, user, w.data) : null;
  if (wolne) {
    out.push({
      ton: "warn",
      tekst: `${wolne.type === "urlop" ? "urlop" : "niedostępność"} ${dzienKrotko(wolne.start_date)}–${dzienKrotko(
        wolne.end_date
      )} — dostanie wiadomość, sprawdź, czy ma przyjść`,
    });
  }
  if (!w.platne || calyDzien(w)) return out;
  const moje = publishedShiftsFor(planShifts, user).filter((s) => s.date === w.data);
  const poza = platneMinutyOsoby(w, user, planShifts);
  const razem = minutyWydarzenia(w);
  if (poza < razem) {
    const z = moje.find((s) => s.start_time) || {};
    out.push({
      ton: "info",
      tekst:
        poza === 0
          ? `ma zmianę ${trimTime(z.start_time)}–${trimTime(z.end_time)} — czas już w zmianie, nie dopiszemy drugi raz`
          : `część w czasie zmiany ${trimTime(z.start_time)}–${trimTime(z.end_time)} — dopiszemy ${poza} min`,
    });
  }
  if (poza > 0) {
    uwagiPrzypisania({
      user,
      kandydaci: [{ id: "__wydarzenie", user_id: user.id, user_name: user.name, date: w.data, start_time: w.godz_od, end_time: w.godz_do, published_at: "x" }],
      planShifts: (planShifts || []).filter((s) => s.published_at),
      absences,
      stanowisko: null,
    }).forEach((u) => out.push(u));
  }
  return out;
};

// --- zapis -------------------------------------------------------------------

// Pola formularza → wiersz `wydarzenia`. Puste godziny = cały dzień; liczba
// gości tylko przy grupie; stanowiska jako tekst po przecinku (NULL = wszystkie).
export const wierszWydarzenia = (f) => ({
  lokal: f.lokal || null,
  data: f.data,
  godz_od: f.calyDzien ? null : f.godz_od || null,
  godz_do: f.calyDzien ? null : f.godz_do || null,
  typ: f.typ || "inne",
  tytul: String(f.tytul || "").trim(),
  opis: String(f.opis || "").trim() || null,
  stanowiska: stanowiskaTekst(f.stanowiska),
  zakres: f.zakres === "grafik" ? "grafik" : "wszyscy",
  liczba_gosci: f.typ === "grupa" && String(f.liczba_gosci ?? "").trim() !== "" ? Number(f.liczba_gosci) : null,
  platne: !!f.platne && !f.calyDzien,
});

const powiadom = async (lista) => {
  const wyniki = await Promise.allSettled(lista.map(([imie, tekst, dane]) => createEmployeeNotification(imie, tekst, "wydarzenie", dane)));
  return wyniki.filter((r) => r.status === "rejected").length;
};

// JEDYNE miejsce, które zapisuje wydarzenie i jego uczestników. Wiadomości:
//   nowe wydarzenie        → „Nowe wydarzenie” do wszystkich;
//   edycja, nowi           → „Nowe wydarzenie”;
//   edycja, odznaczeni     → „Wydarzenie odwołane” (dla nich);
//   edycja, ci sami        → „Zmiana w wydarzeniu” tylko z `powiadomOZmianie`.
// Błąd wysłania wiadomości NIE cofa zapisu — wydarzenie jest, a liczba
// niewysłanych wraca w `niewyslane`, żeby ekran mógł to powiedzieć.
export const zapiszWydarzenie = async ({
  dane,
  stare = null,
  stareUczestnicy = [],
  osoby,
  powiadomOZmianie = true,
  kto,
  setWydarzenia,
  setUczestnicy,
}) => {
  const teraz = new Date().toISOString();
  const zapisane = stare
    ? await api.patch("wydarzenia", stare.id, { ...dane, zmienil: kto, updated_at: teraz })
    : await api.post("wydarzenia", { ...dane, utworzyl: kto, zmienil: kto });
  const { dodani, usunieci, zostali } = roznicaUczestnikow(
    stareUczestnicy.map((u) => u.user_id),
    (osoby || []).map((u) => u.id)
  );
  const doUsuniecia = stareUczestnicy.filter((u) => usunieci.includes(String(u.user_id)));
  await Promise.all(doUsuniecia.map((u) => api.delete("wydarzenia_uczestnicy", u.id)));
  const nowi = await Promise.all(
    (osoby || [])
      .filter((u) => dodani.includes(String(u.id)))
      .map((u) =>
        api.post("wydarzenia_uczestnicy", { wydarzenie_id: zapisane.id, user_id: u.id, user_name: u.name, powiadomiono_at: teraz })
      )
  );
  const wiadomosci = [
    ...nowi.map((u) => [u.user_name, tekstNowego(zapisane), daneDoMaila(zapisane)]),
    ...doUsuniecia.map((u) => [u.user_name, tekstOdwolania(zapisane), daneDoMaila(zapisane)]),
  ];
  const zmiany = stare ? zmienionePola(stare, zapisane) : [];
  if (stare && powiadomOZmianie) {
    stareUczestnicy
      .filter((u) => zostali.includes(String(u.user_id)))
      .forEach((u) => wiadomosci.push([u.user_name, tekstZmiany(stare, zapisane), daneDoMaila(zapisane, zmiany)]));
  }
  const niewyslane = await powiadom(wiadomosci);
  if (setWydarzenia)
    setWydarzenia((prev) => [...(prev || []).filter((w) => String(w.id) !== String(zapisane.id)), zapisane]);
  if (setUczestnicy) {
    const usunieteId = new Set(doUsuniecia.map((u) => String(u.id)));
    setUczestnicy((prev) => [...(prev || []).filter((u) => !usunieteId.has(String(u.id))), ...nowi]);
  }
  return { wydarzenie: zapisane, powiadomieni: wiadomosci.length - niewyslane, niewyslane };
};

// Odwołanie: wiersz zostaje (lista, historia, Puls), znika z grafiku, każdy
// uczestnik dostaje „Wydarzenie odwołane”.
export const odwolajWydarzenie = async ({ wydarzenie, uczestnicy, kto, setWydarzenia }) => {
  const zapisane = await api.patch("wydarzenia", wydarzenie.id, {
    odwolane_at: new Date().toISOString(),
    odwolal: kto,
    updated_at: new Date().toISOString(),
  });
  const lista = uczestnicyWydarzenia(uczestnicy, wydarzenie.id);
  const niewyslane = await powiadom(lista.map((u) => [u.user_name, tekstOdwolania(zapisane), daneDoMaila(zapisane)]));
  if (setWydarzenia) setWydarzenia((prev) => (prev || []).map((w) => (String(w.id) === String(zapisane.id) ? zapisane : w)));
  return { wydarzenie: zapisane, powiadomieni: lista.length - niewyslane, niewyslane };
};
