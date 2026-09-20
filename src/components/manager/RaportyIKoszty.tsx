// @ts-nocheck
// Raporty i koszty — świadomie BEZ starej siatki dzień×pracownik z Pulpitu
// (Roman poprosił: pomiń na razie, zrób lepszy raport per pracownik
// zamiast tego). Układ lista+karta jak w Pracownicy.tsx: po lewej
// pracownicy posortowani wg kosztu/godzin w okresie, po prawej pełny
// raport wybranej osoby (godziny, koszt, lista zmian z edycją). Imię
// pracownika w Rejestr Godzin/Aktywni nawiguje tu przez selectedUserId
// sterowany z ManagerDashboard.tsx — patrz onNameClick tam.
import React, { useState, useEffect } from "react";
import { Edit2, Download } from "lucide-react";
import { getDayOfWeek, getMonthName } from "../../utils/format";
import {
  buildPlanFactMap,
  sumujPlanFakt,
  toLocalYMD,
  PLAN_FAKT_PROG_H,
} from "../../utils/grafik";
import {
  kosztMiesiaca,
  nadwyzkaPonadNorme,
  naEtacie,
  typUmowy,
  TYPY_UMOWY,
} from "../../utils/umowy";
import { zl } from "../../utils/budzet";
import { stanowiskoBadgeStyle } from "../../utils/stanowiska";
import {
  pageTitleCls,
  sectionCardCls,
  sectionHeaderCls,
  statTileCls,
  statLabelCls,
  statSubCls,
  statValueCls,
  btnSecondaryCls,
  cardCls,
} from "./designTokens";

const fmtHM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";

const fmtH = (n) => (n || 0).toFixed(1).replace(".", ",");
// Kwoty formatuje `zl` z utils/budzet — to samo, co w Grafiku i w Pulsie.
// Własny `toFixed(0) + " zł"` nie grupował tysięcy i w jednej kolumnie stało
// "6266 zł" obok "11086 zł", czyli liczby wyglądające na ten sam rząd.
const fmtZl = (n) => zl(n);

// Rozbicie godzin i kosztu na wymiary: lokal ("gdzie wydaliśmy") i stanowisko
// ("na co"). Jeden komponent dla obu, bo obie sekcje odpowiadają tą samą miarą
// i tym samym podziałem — dwie kopie rozjechałyby się przy pierwszej poprawce.
const Rozbicie = ({ tytul, dane, badge = null, pusto }) => {
  const wpisy = Object.entries(dane || {}).sort((a, b) => b[1].hours - a[1].hours);
  const maAlokacje = wpisy.some(([, v]) => v.alokacja);
  const maBraki = wpisy.some(([, v]) => v.brakKosztu);
  return (
    <div className={`${sectionCardCls} mb-6`}>
      <div className={sectionHeaderCls}>{tytul}</div>
      <div className="divide-y divide-[#B7B6AE]">
        {wpisy.length === 0 && <p className="p-4 text-sm text-[#8F8E86]">{pusto}</p>}
        {wpisy.map(([klucz, v]) => (
          <div
            key={klucz}
            className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
          >
            <span className="font-bold flex items-center gap-2 min-w-0">
              {badge && badge(klucz)}
              <span className="truncate">{klucz}</span>
            </span>
            <span className="flex items-baseline gap-3 flex-shrink-0">
              {/* "~" znaczy ALOKACJA: wynagrodzenie etatowca jest miesięczne i
                  rozkłada się proporcją godzin, a nie dlatego, że tyle tam
                  wydano. */}
              <span className="text-[#6E6E66] tabular-nums whitespace-nowrap">
                {v.brakKosztu && v.cost === 0
                  ? "brak wynagrodzenia"
                  : `${v.alokacja ? "~" : ""}${fmtZl(v.cost)}${v.brakKosztu ? " +?" : ""}`}
              </span>
              <span className="font-['Archivo'] font-bold tabular-nums whitespace-nowrap">
                {fmtH(v.hours)} h
              </span>
            </span>
          </div>
        ))}
      </div>
      {(maAlokacje || maBraki) && (
        <p className="px-4 py-2 text-[11px] text-[#6E6E66] border-t border-[#B7B6AE]">
          {maAlokacje && (
            <>
              „~" — wynagrodzenie z umowy o pracę rozłożone proporcją godzin;
              suma zgadza się z kafelkiem „Koszt" wyżej.{" "}
            </>
          )}
          {maBraki && '„+?" — jest tu ktoś bez wpisanego wynagrodzenia w karcie.'}
        </p>
      )}
    </div>
  );
};

// Porównanie z poprzednim miesiącem — świadomie BEZ zieleni i czerwieni.
// Wyższy koszt przy wyższym utargu nie jest porażką, a więcej godzin nie jest
// ani dobre, ani złe samo z siebie. To ma być punkt odniesienia, nie ocena —
// ta sama zasada co przy plan vs fakt.
const Roznica = ({ teraz, przed, format }) => {
  if (przed == null || przed === 0) return <b className="tabular-nums">{format(teraz)}</b>;
  const pct = ((teraz - przed) / przed) * 100;
  const bliskoZera = Math.abs(pct) < 0.5;
  return (
    <>
      <b className="tabular-nums">{format(teraz)}</b>{" "}
      <span className="text-[#8F8E86]">
        z {format(przed)} ·{" "}
        {bliskoZera
          ? "bez zmian"
          : `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")}%`}
      </span>
    </>
  );
};

export default function RaportyIKoszty({
  users,
  shifts,
  lokale = [],
  stanowiska = [],
  matchesFilter,
  hasAccessToLokal,
  onEditShift,
  selectedUserId,
  setSelectedUserId,
  skok = null,
  planShifts = [],
}) {
  // ⚠️ Startujemy na miesiącu POPRZEDNIM, nie bieżącym. Na tę stronę wchodzi
  // się raz na miesiąc i po to, żeby przejrzeć miesiąc ZAMKNIĘTY przed
  // wypłatą — otwarta na bieżącym pokazywała połowę danych i wyglądała, jakby
  // brakowało w niej informacji. Powrót jest jednym kliknięciem ("Bieżący
  // miesiąc"), a wybrany miesiąc stoi w czarnej plakietce w nagłówku.
  const [month, setMonth] = useState(() => (new Date().getMonth() + 11) % 12);
  const [year, setYear] = useState(() => {
    const d = new Date();
    return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  });

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };
  const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();

  // Dwa zakresy, celowo:
  // - `periodShifts` słucha górnego paska (nawigacja: kogo i co widzę w tym
  //   lokalu, sumy lokalu, sekcja "Według lokalu");
  // - `periodShiftsAll` bierze wszystkie lokale, do których kierownik ma
  //   dostęp, i służy WYŁĄCZNIE do liczb per osoba.
  //
  // Godziny i koszt jednej osoby to fakt płacowy, nie fakt lokalu. Liczone per
  // zakładka, pracownik wypożyczony między lokalami pokazywał się dwa razy, w
  // każdej z częścią swoich godzin, i żadna nie mówiła, ile mu się w sumie
  // należy.
  const widoczny = hasAccessToLokal || matchesFilter;
  const hoursOf = (s) => (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0);

  // Narzut pracodawcy jest ustawieniem LOKALU, nie osoby — bierzemy go z
  // lokalu macierzystego, tak samo jak karta pracownika.
  const lokalRowFor = (u) =>
    (lokale || []).find((l) => l.name === u?.default_lokal) || null;

  // ⚠️ Koszt liczy `kosztMiesiaca`, a NIE `godziny × users.stawka`. Przy umowie
  // o pracę lokal płaci kwotę z umowy niezależnie od godzin, a ta strona
  // odpowiada na pytanie "ile lokal wydał". Do 0.40.0 stała tu goła
  // `users.stawka`, więc KAŻDY etatowiec miał koszt `null`, wypadał z kafelka
  // i cały miesiąc świecił "dane niepełne" — ta sama pomyłka, którą w 0.39.0
  // naprawiono w Pulsie (`autoPodsumowanie`).
  const kosztOsoby = (u, godziny, rok, miesIdx) =>
    u
      ? kosztMiesiaca({
          user: u,
          godziny,
          lokalRow: lokalRowFor(u),
          rok,
          mies: miesIdx + 1,
        })
      : null;

  // Cała arytmetyka miesiąca w JEDNYM miejscu, żeby dało się ją policzyć drugi
  // raz dla miesiąca poprzedniego (pasek porównania) bez powtarzania reguł —
  // zwłaszcza reguły o dwóch zakresach, którą najłatwiej zgubić przy kopiowaniu.
  //
  // Dwa zakresy, celowo:
  // - `pShifts` słucha górnego paska (nawigacja: kogo widzę w tym lokalu);
  // - `pAll` bierze wszystkie lokale kierownika i służy do liczb per osoba.
  // Godziny i koszt jednej osoby to fakt płacowy, nie fakt lokalu. Liczone per
  // zakładka, pracownik wypożyczony między lokalami pokazywał się dwa razy, w
  // każdej z częścią godzin, i żadna nie mówiła, ile mu się w sumie należy.
  const agreguj = (rok, miesIdx) => {
    const wM = (s) =>
      s.start_time.getMonth() === miesIdx && s.start_time.getFullYear() === rok;
    const pShifts = shifts.filter((s) => matchesFilter(s.lokal) && wM(s));
    const pAll = shifts.filter((s) => widoczny(s.lokal) && wM(s));

    // Ile godzin przypada na oglądany lokal — pokazujemy pod spodem, gdy różni
    // się od całości, żeby liczba w wierszu nie wyglądała na pomyłkę.
    const wTymLokalu = {};
    pShifts.forEach((s) => {
      if (!s.user_id) return;
      wTymLokalu[s.user_id] = (wTymLokalu[s.user_id] || 0) + hoursOf(s);
    });

    // Etatowiec, który w tym lokalu nie odbił ani jednej godziny, i tak
    // kosztował pełną kwotę z umowy. Bez tego wiersza strona "ile lokal wydał"
    // po cichu gubi ten wydatek — a to prawie zawsze znak, że coś wymaga
    // wyjaśnienia (choroba, urlop bezpłatny, nieodbite zmiany). Kogo jeszcze
    // nie zatrudniono albo kto już odszedł, pomijamy: jego zero nic nie znaczy.
    const poczatekM = toLocalYMD(new Date(rok, miesIdx, 1));
    const koniecM = toLocalYMD(new Date(rok, miesIdx + 1, 0));
    // ⚠️ ...ale TYLKO w miesiącu, w którym cokolwiek się działo. Miesiąc bez
    // ani jednej zmiany to prawie zawsze miesiąc sprzed wdrożenia systemu, a
    // nie miesiąc, w którym cała załoga siedziała w domu na pełnej pensji.
    // Widmowa lista płac za taki miesiąc psuje też pasek porównania: pokazywał
    // "bez zmian" wobec lipca, w którym nie było żadnych danych. Ta sama
    // zasada co pomijanie pustych miesięcy w `bilansOkresu`.
    const bezGodzin = (pShifts.length === 0 ? [] : users || []).filter(
      (u) =>
        !wTymLokalu[u.id] &&
        !u.archived &&
        naEtacie(u) &&
        matchesFilter(u.default_lokal) &&
        kosztOsoby(u, 0, rok, miesIdx) != null &&
        !(u.data_zatrudnienia && u.data_zatrudnienia > koniecM) &&
        !(u.ostatni_dzien && u.ostatni_dzien < poczatekM)
    );

    const widoczneOsoby = new Set([
      ...pShifts.map((s) => s.user_id).filter(Boolean),
      ...bezGodzin.map((u) => u.id),
    ]);
    const zakres = pAll.filter((s) => s.user_id && widoczneOsoby.has(s.user_id));

    const byUser = {};
    zakres.forEach((s) => {
      const w = (byUser[s.user_id] = byUser[s.user_id] || {
        hours: 0,
        urlop: 0,
        count: 0,
        bezKonca: 0,
      });
      w.hours += hoursOf(s);
      w.count += 1;
      if (s.is_urlop) w.urlop += hoursOf(s);
      // Zmiana bez odbitego końca to godziny, których nikomu nie policzono —
      // czyli dokładnie to, co trzeba zobaczyć PRZED wypłatą, a nie po niej.
      if (!s.end_time && !s.rozliczenie) w.bezKonca += 1;
    });

    const rows = [...widoczneOsoby]
      .map((uid) => users.find((x) => x.id === uid))
      .filter(Boolean)
      .map((u) => {
        const w = byUser[u.id] || { hours: 0, urlop: 0, count: 0, bezKonca: 0 };
        return {
          uid: u.id,
          user: u,
          hours: w.hours,
          urlop: w.urlop,
          hoursTuLokal: wTymLokalu[u.id] || 0,
          count: w.count,
          bezKonca: w.bezKonca,
          cost: kosztOsoby(u, w.hours, rok, miesIdx),
        };
      })
      .sort((a, b) => (b.cost ?? b.hours) - (a.cost ?? a.hours));

    const totalHours = rows.reduce((a, r) => a + r.hours, 0);
    const totalCost = rows.reduce((a, r) => a + (r.cost || 0), 0);
    const costIncomplete = rows.some((r) => r.cost == null);
    // Urlop jest zwykłym wierszem w shifts (8 h za dzień roboczy), więc wchodzi
    // do sum automatycznie — i tak ma być. Ale kierownik musi widzieć, ILE z
    // tych godzin to urlop, bo to nie jest czas na sali.
    const urlopHours = rows.reduce((a, r) => a + r.urlop, 0);

    // Koszt per lokal to ALOKACJA, nie wydatek tego jednego miejsca:
    // wynagrodzenie etatowca jest miesięczne i nie da się go rozciąć po
    // lokalach inaczej niż proporcją godzin. Dzielimy właśnie tak, żeby
    // rozbicie sumowało się DOKŁADNIE do kafelka wyżej — dwie liczby o tym
    // samym miesiącu, które się nie zgadzają, kosztują więcej zaufania, niż
    // warta jest ta precyzja. Urlopu nie przypisujemy do lokalu: pracownik go
    // tam nie przepracował.
    const byLokal = {};
    const byStanowisko = {};
    const dodaj = (mapa, klucz, godziny, koszt, alokacja) => {
      const w = (mapa[klucz] = mapa[klucz] || {
        hours: 0,
        cost: 0,
        brakKosztu: false,
        alokacja: false,
      });
      w.hours += godziny;
      if (koszt == null) w.brakKosztu = true;
      else w.cost += koszt;
      if (alokacja) w.alokacja = true;
    };
    // Ta sama proporcja godzin, dwa różne klucze: lokal ("gdzie wydaliśmy") i
    // stanowisko ("na co wydaliśmy"). Jedna pętla, bo dwie rozjechałyby się
    // przy pierwszej poprawce reguły podziału.
    rows.forEach((r) => {
      const moje = zakres.filter((s) => s.user_id === r.uid);
      const rozbij = (mapa, kluczOf, domyslny) => {
        const wg = {};
        moje.forEach((s) => {
          const klucz = kluczOf(s);
          wg[klucz] = (wg[klucz] || 0) + hoursOf(s);
        });
        const suma = Object.values(wg).reduce((a, h) => a + h, 0);
        if (suma <= 0) {
          // Zero godzin i zero kosztu nie jest niczyim wierszem — ktoś z samą
          // zmianą bez zakończenia dorzucałby pustą pozycję "—" i znak "+?"
          // przy stanowisku, w którym nic się nie wydarzyło. Wiersz zostaje
          // TYLKO dla kosztu, który naprawdę trzeba gdzieś położyć: etatowca
          // bez ani jednej odbitej godziny.
          if (r.cost > 0) dodaj(mapa, domyslny || "—", 0, r.cost, false);
          return;
        }
        // Znak "~" tylko tam, gdzie naprawdę było co dzielić: etatowiec w
        // jednym miejscu kosztował je całą kwotą i żadnego szacunku tam nie ma.
        const dzielone = naEtacie(r.user) && Object.keys(wg).length > 1;
        Object.entries(wg).forEach(([klucz, h]) => {
          dodaj(mapa, klucz, h, r.cost == null ? null : (r.cost * h) / suma, dzielone);
        });
      };
      rozbij(byLokal, (s) => (s.is_urlop ? "Urlop" : s.lokal), r.user.default_lokal);
      // Urlop świadomie NIE trafia na stanowisko: pracownik go tam nie
      // przepracował, a doliczony zawyżałby obsadę konkretnej roli — ta sama
      // zasada co przy lokalach.
      rozbij(
        byStanowisko,
        (s) => (s.is_urlop ? "Urlop" : s.stanowisko || "—"),
        r.user.default_stanowisko
      );
    });

    return {
      pShifts,
      pAll,
      rows,
      totalHours,
      totalCost,
      costIncomplete,
      urlopHours,
      byLokal,
      byStanowisko,
    };
  };

  const M = agreguj(year, month);
  const poprzedniData = new Date(year, month - 1, 1);
  const poprz = agreguj(poprzedniData.getFullYear(), poprzedniData.getMonth());

  const periodShifts = M.pShifts;
  const periodShiftsAll = M.pAll;
  const employeeRows = M.rows;
  const totalHours = M.totalHours;
  const totalCost = M.totalCost;
  const costIncomplete = M.costIncomplete;
  const urlopHours = M.urlopHours;
  const pracaHours = totalHours - urlopHours;
  const byLokal = M.byLokal;
  const byStanowisko = M.byStanowisko;

  // Plan vs fakt za oglądany miesiąc — dla analityki, nie dla oceny. Urlop jest
  // z tego wyłączony po stronie faktu (nie ma go w grafiku), więc porównujemy
  // tylko realnie przepracowany czas.
  //
  // Porównujemy WYŁĄCZNIE dni zamknięte: plan na cały miesiąc zestawiony z
  // faktem za pięć dni dawałby "−82%" i nie znaczyłby nic. Dzisiejszy dzień też
  // pomijamy — połowa ludzi jeszcze nie skończyła zmiany.
  const wczorajYMD = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalYMD(d);
  })();
  const okresOd = toLocalYMD(new Date(year, month, 1));
  const koniecMiesiaca = toLocalYMD(new Date(year, month + 1, 0));
  const okresDo = koniecMiesiaca < wczorajYMD ? koniecMiesiaca : wczorajYMD;
  const okresPusty = okresDo < okresOd;
  const planFaktMapa = buildPlanFactMap({
    planShifts,
    factShifts: shifts,
    from: okresOd,
    to: okresDo,
    lokalOk: widoczny,
  });
  const pf = sumujPlanFakt(planFaktMapa);
  const pfOsoby = {};
  planFaktMapa.forEach((v) => {
    const r = (pfOsoby[v.userKey] = pfOsoby[v.userKey] || { planH: 0, faktH: 0 });
    r.planH += v.planH;
    r.faktH += v.faktH;
  });

  useEffect(() => {
    if (selectedUserId && !users.find((u) => u.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [selectedUserId]);

  // Wejście z imienia w Rejestrze Godzin albo w Aktywnych przenosi też na
  // miesiąc tamtej zmiany — inaczej ta strona, otwarta domyślnie na miesiącu
  // zamkniętym, pokazywałaby pustą kartę osoby stojącej właśnie na zmianie.
  // `seq` jest po to, żeby dwa kliknięcia w ten sam miesiąc też zadziałały.
  useEffect(() => {
    if (!skok) return;
    setMonth(skok.mies);
    setYear(skok.rok);
  }, [skok?.seq]);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;
  const selectedShifts = selectedUserId
    ? periodShiftsAll
        .filter((s) => s.user_id === selectedUserId)
        .sort((a, b) => a.start_time - b.start_time)
    : [];
  const selectedHours = selectedShifts.reduce((a, s) => a + hoursOf(s), 0);
  const selectedPF = selectedUserId ? pfOsoby[String(selectedUserId)] : null;
  // Różnica konkretnego DNIA (nie pojedynczego wpisu), żeby w liście zmian
  // było widać, który dzień się rozjechał — ten sam znacznik co w Rejestrze
  // Godzin. Przy dwóch zmianach jednego dnia pokazujemy go raz.
  const diffDnia = (s) =>
    planFaktMapa.get(
      `${String(s.user_id || s.user_name || "")}|${toLocalYMD(s.start_time)}`
    );
  const pokazaneRoznice = new Set();
  const selectedUrlop = selectedShifts
    .filter((s) => s.is_urlop)
    .reduce((a, s) => a + hoursOf(s), 0);
  const selectedCost = kosztOsoby(selectedUser, selectedHours, year, month);
  // Przy umowie o pracę ta kwota nie jest iloczynem godzin i stawki: do normy
  // to wynagrodzenie z umowy, a ponad normę dochodzą dopłacone godziny. Bez
  // tego podpisu pierwsze pytanie brzmi "dlaczego się nie zgadza".
  const selectedNadwyzka = selectedUser
    ? nadwyzkaPonadNorme(selectedUser, selectedHours, year, month + 1)
    : null;

  // Podsumowanie osób, nie lista zmian — tamtą eksportuje Rejestr Godzin i
  // powielanie jej tutaj dałoby dwa pliki o tej samej nazwie w głowie
  // odbiorcy. Stąd wychodzi to, po co się na tę stronę wchodzi: godziny,
  // urlop i koszt na osobę za zamknięty miesiąc.
  const handleExportCsv = () => {
    const naglowek = [
      "Pracownik",
      "Stanowisko",
      "Lokal macierzysty",
      "Typ umowy",
      "Godziny",
      "w tym w wybranym lokalu",
      "w tym urlop",
      "Liczba zmian",
      "Koszt (zl)",
    ];
    const etykietaUmowy = (u) =>
      (TYPY_UMOWY.find((x) => x.key === typUmowy(u)) || {}).label || "";
    const lines = [naglowek.join(";")];
    employeeRows.forEach((r) => {
      lines.push(
        [
          r.user.name,
          r.user.default_stanowisko || "",
          r.user.default_lokal || "",
          etykietaUmowy(r.user),
          r.hours.toFixed(2),
          r.hoursTuLokal.toFixed(2),
          r.urlop.toFixed(2),
          r.count,
          // Pusto, a nie zero: brak wynagrodzenia w karcie to nie jest koszt
          // zerowy i nie wolno go zsumować jak zera.
          r.cost == null ? "" : r.cost.toFixed(2),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";")
      );
    });
    // BOM, żeby Excel nie rozsypał polskich znaków.
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koszty-${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={pageTitleCls}>Raporty i koszty</h2>
          <span className="inline-block bg-[#171714] text-white font-['Archivo'] font-extrabold text-base px-3 py-1 rounded mt-1.5">
            {getMonthName(month)} {year}
          </span>
          {/* Bez tego zdania kierownik szukałby, czemu liczby nie zmieniają się
              przy przełączaniu lokalu w górnym pasku. */}
          <p className="text-[13px] text-[#6E6E66] mt-1.5 max-w-[62ch]">
            Wybór lokalu u góry decyduje, kogo widzisz. Godziny i koszt osoby są
            zawsze pełne — ze wszystkich Twoich lokali, bo tyle się jej należy.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => shiftMonth(-1)} className={btnSecondaryCls}>
            ← Poprzedni
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => {
                setMonth(new Date().getMonth());
                setYear(new Date().getFullYear());
              }}
              className={btnSecondaryCls}
            >
              Bieżący miesiąc
            </button>
          )}
          <button onClick={() => shiftMonth(1)} className={btnSecondaryCls}>
            Następny →
          </button>
          <button
            onClick={handleExportCsv}
            disabled={employeeRows.length === 0}
            className={`${btnSecondaryCls} ${
              employeeRows.length === 0 ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <Download size={15} className="inline -mt-0.5 mr-1" /> Eksport CSV
          </button>
          <button disabled title="Wkrótce" className={`${btnSecondaryCls} opacity-50 cursor-not-allowed`}>
            Wyślij do księgowej
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        <div className={statTileCls}>
          <p className={statLabelCls}>Godziny</p>
          <p className={statValueCls}>{totalHours.toFixed(1).replace(".", ",")}</p>
          {urlopHours > 0 && (
            <p className={statSubCls}>
              w tym urlop {urlopHours.toFixed(1).replace(".", ",")} h ·{" "}
              <strong>bez urlopu {pracaHours.toFixed(1).replace(".", ",")} h</strong>
            </p>
          )}
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Koszt</p>
          <p className={statValueCls}>{fmtZl(totalCost)}</p>
          {costIncomplete && (
            <p className="text-[11px] text-[#DE3A22] mt-0.5">
              bez części osób — brak wynagrodzenia w karcie
            </p>
          )}
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Pracownicy</p>
          <p className={statValueCls}>{employeeRows.length}</p>
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Plan vs fakt</p>
          {okresPusty || (pf.planH === 0 && pf.faktH === 0) ? (
            <>
              <p className={statValueCls}>—</p>
              <p className={statSubCls}>brak zamkniętych dni w tym okresie</p>
            </>
          ) : (
            <>
              <p
                className={`${statValueCls} ${
                  Math.abs(pf.diff) < PLAN_FAKT_PROG_H
                    ? ""
                    : pf.diff > 0
                    ? "text-[#2F7A2A]"
                    : "text-[#DE3A22]"
                }`}
              >
                {pf.diff >= 0 ? "+" : "−"}
                {Math.abs(pf.diff).toFixed(1).replace(".", ",")} h
              </p>
              <p className={statSubCls}>
                plan {pf.planH.toFixed(1).replace(".", ",")} h · fakt{" "}
                {pf.faktH.toFixed(1).replace(".", ",")} h
                {pf.planH > 0
                  ? ` (${((pf.diff / pf.planH) * 100).toFixed(1).replace(".", ",")}%)`
                  : ""}
              </p>
              <p className={statSubCls}>za dni do {okresDo.slice(8)}.{okresDo.slice(5, 7)}</p>
            </>
          )}
        </div>
        <div className={statTileCls}>
          <p className={statLabelCls}>Śr. koszt/h</p>
          <p className={statValueCls}>
            {totalHours > 0 && !costIncomplete
              ? `${(totalCost / totalHours).toFixed(1).replace(".", ",")} zł`
              : "—"}
          </p>
        </div>
      </div>

      {/* Punkt odniesienia dla wszystkiego wyżej. Bez niego kafelki mówią, ile
          było, ale nie mówią, czy to dużo. */}
      {(poprz.totalHours > 0 || poprz.totalCost > 0) && (
        <div className="bg-white rounded-xl border-[2px] border-[#171714] px-4 py-2.5 mb-6 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-[13px]">
          <span className={statLabelCls}>
            vs {getMonthName(poprzedniData.getMonth())} {poprzedniData.getFullYear()}
          </span>
          <span>
            godziny <Roznica teraz={totalHours} przed={poprz.totalHours} format={(n) => `${fmtH(n)} h`} />
          </span>
          {/* Koszt porównujemy tylko wtedy, gdy OBA miesiące są policzone do
              końca — inaczej spadek znaczyłby tylko tyle, że komuś nie wpisano
              wynagrodzenia. */}
          {!costIncomplete && !poprz.costIncomplete && (
            <>
              <span>
                koszt <Roznica teraz={totalCost} przed={poprz.totalCost} format={fmtZl} />
              </span>
              {totalHours > 0 && poprz.totalHours > 0 && (
                <span>
                  koszt/h{" "}
                  <Roznica
                    teraz={totalCost / totalHours}
                    przed={poprz.totalCost / poprz.totalHours}
                    format={(n) => `${n.toFixed(1).replace(".", ",")} zł`}
                  />
                </span>
              )}
            </>
          )}
        </div>
      )}

      <Rozbicie
        tytul="Według lokalu"
        dane={byLokal}
        pusto="Brak danych w tym okresie."
      />

      {/* Drugi wymiar tych samych pieniędzy: nie "gdzie", tylko "na co".
          Przy planowaniu obsady to jest pytanie, które zadaje się najpierw —
          ile kosztuje kuchnia, a ile sala. */}
      <Rozbicie
        tytul="Według stanowiska"
        dane={byStanowisko}
        pusto="Brak danych w tym okresie."
        badge={(nazwa) => {
          const styl = stanowiskoBadgeStyle(stanowiska, null, nazwa);
          return (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-[#B7B6AE]"
              style={styl ? { backgroundColor: styl.color, borderColor: styl.color } : undefined}
            />
          );
        }}
      />

      <div className="grid md:grid-cols-[360px_1fr] gap-5">
        {/* --- Lista pracowników --- */}
        <div className={`${!selectedUser ? "block" : "hidden md:block"} ${sectionCardCls}`}>
          <div className={sectionHeaderCls}>Według pracownika</div>
          <div className="divide-y divide-[#B7B6AE]">
            {employeeRows.length === 0 && (
              <p className="p-4 text-sm text-[#8F8E86]">Brak zmian w tym okresie.</p>
            )}
            {employeeRows.map((r) => (
              <button
                key={r.uid}
                onClick={() => setSelectedUserId(r.uid)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-[#F1F1EE] ${
                  selectedUserId === r.uid ? "bg-[#F1F1EE]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{r.user.name}</p>
                  <p className="text-xs text-[#6E6E66] truncate">
                    {r.user.default_stanowisko || "—"} · {r.count} zmiany
                  </p>
                  {/* Dwa RÓŻNE powody zera i nie wolno ich zlepić w jeden
                      komunikat. Etatowiec bez ani jednej zmiany kosztował pełną
                      kwotę z umowy i to pytanie o nieobecność, której nikt nie
                      wpisał. Zmiana bez odbitego końca to co innego: człowiek
                      był, tylko jego godziny czekają na decyzję kierownika. */}
                  {r.count === 0 && (
                    <p className="text-xs text-[#8A3A2B] font-bold truncate">
                      brak odbitych godzin w tym miesiącu
                    </p>
                  )}
                  {r.bezKonca > 0 && (
                    <p className="text-xs text-[#8A3A2B] font-bold truncate">
                      {r.bezKonca === 1
                        ? "zmiana bez zakończenia — godziny nierozliczone"
                        : `${r.bezKonca} zmiany bez zakończenia — godziny nierozliczone`}
                    </p>
                  )}
                  {/* Gdy część godzin przypada na inny lokal, mówimy to wprost —
                      inaczej liczba w wierszu wygląda na niezgodną z sumą lokalu. */}
                  {Math.abs(r.hours - r.hoursTuLokal) > 0.01 && (
                    <p className="text-xs text-[#8F8E86] truncate">
                      w tym {r.hoursTuLokal.toFixed(1).replace(".", ",")} h w tym lokalu
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-['Archivo'] font-bold text-sm tabular-nums">
                    {r.hours.toFixed(1).replace(".", ",")} h
                  </p>
                  <p className="text-xs text-[#6E6E66]">
                    {r.cost != null ? fmtZl(r.cost) : "brak wynagrodzenia"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* --- Raport wybranego pracownika --- */}
        <div className={selectedUser ? "block" : "hidden md:block"}>
          {!selectedUser && (
            <div className="bg-white p-10 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
              Wybierz pracownika z listy, żeby zobaczyć jego raport.
            </div>
          )}
          {selectedUser && (
            <div className={cardCls}>
              <button
                onClick={() => setSelectedUserId(null)}
                className="md:hidden text-sm font-bold text-[#6E6E66] mb-3"
              >
                ← Wróć do listy
              </button>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-['Archivo'] font-extrabold text-lg">{selectedUser.name}</h3>
                {/* Suma godzin z powrotem w jednej linii; szczegóły (plan vs
                    fakt, urlop) po LEWEJ, żeby liczba główna została na
                    swoim miejscu i nie rozpychała nagłówka. */}
                <div className="flex items-baseline gap-4 ml-auto">
                  <div className="text-right text-[12px] leading-tight">
                    {selectedPF &&
                      Math.abs(selectedPF.faktH - selectedPF.planH) >= PLAN_FAKT_PROG_H && (
                        <div>
                          wg grafiku {selectedPF.planH.toFixed(1).replace(".", ",")} h ·{" "}
                          <span
                            className={
                              selectedPF.faktH > selectedPF.planH
                                ? "text-[#2F7A2A] font-bold"
                                : "text-[#DE3A22] font-bold"
                            }
                          >
                            {selectedPF.faktH > selectedPF.planH ? "+" : "−"}
                            {Math.abs(selectedPF.faktH - selectedPF.planH)
                              .toFixed(1)
                              .replace(".", ",")}{" "}
                            h
                          </span>
                        </div>
                      )}
                    {selectedUrlop > 0 && (
                      <div className="text-[#6E6E66]">
                        urlop {selectedUrlop.toFixed(1).replace(".", ",")} h · bez urlopu{" "}
                        {(selectedHours - selectedUrlop).toFixed(1).replace(".", ",")} h
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-['Archivo'] font-extrabold text-xl tabular-nums whitespace-nowrap">
                      {selectedHours.toFixed(1).replace(".", ",")} h
                    </p>
                    <p className="text-xs text-[#6E6E66]">
                      {selectedCost != null ? fmtZl(selectedCost) : "brak wynagrodzenia"}
                      {selectedCost != null && selectedNadwyzka && (
                        <span className="block text-[11px] text-[#8F8E86]">
                          {selectedNadwyzka.godzin > 0
                            ? `umowa + ${fmtH(selectedNadwyzka.godzin)} h ponad normą ${fmtH(
                                selectedNadwyzka.norma
                              )} h`
                            : `wg umowy · norma ${fmtH(selectedNadwyzka.norma)} h`}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pb-2.5 border-b-[1.5px] border-[#B7B6AE] text-[10.5px] font-bold tracking-wider uppercase text-[#8F8E86]">
                <span className="w-14 flex-shrink-0">Data</span>
                <span className="w-20 flex-shrink-0">Lokal</span>
                <span className="flex-1">Od – Do</span>
                <span className="w-16 flex-shrink-0 text-right">Godz.</span>
                <span className="w-9 flex-shrink-0" />
              </div>
              {selectedShifts.length === 0 && (
                <p className="text-center py-8 text-sm text-[#8F8E86]">Brak zmian w tym miesiącu.</p>
              )}
              {selectedShifts.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-3 border-b border-[#B7B6AE]">
                  <span className="w-14 flex-shrink-0 font-['Archivo'] font-bold text-[13px]">
                    {String(s.start_time.getDate()).padStart(2, "0")}.
                    {String(s.start_time.getMonth() + 1).padStart(2, "0")}
                    <span className="text-[#8F8E86] font-semibold ml-1">
                      {getDayOfWeek(s.start_time)}
                    </span>
                  </span>
                  <span className="w-20 flex-shrink-0 text-xs truncate">
                    {s.is_urlop ? (
                      <span className="font-extrabold text-[#8A3A2B]">Urlop</span>
                    ) : (
                      <span className="text-[#6E6E66]">{s.lokal}</span>
                    )}
                  </span>
                  <span className="flex-1 text-[13.5px] tabular-nums">
                    {s.is_urlop ? (
                      <span className="text-[#6E6E66]">dzień urlopu</span>
                    ) : (
                      <>
                        {fmtHM(s.start_time)} –{" "}
                        {s.end_time ? (
                          fmtHM(s.end_time)
                        ) : (
                          <span className="text-[#DE3A22] font-bold">trwa</span>
                        )}
                      </>
                    )}
                  </span>
                  {/* Różnica PRZED liczbą godzin i w stałej szerokości —
                      dzięki temu kolumna godzin stoi w jednej linii we
                      wszystkich wierszach, także tych bez różnicy. */}
                  <span className="w-[62px] flex-shrink-0 text-right">
                    {(() => {
                      if (s.is_urlop) return null;
                      const d = diffDnia(s);
                      if (!d || Math.abs(d.diff) < PLAN_FAKT_PROG_H) return null;
                      const klucz = `${d.userKey}|${d.date}`;
                      if (pokazaneRoznice.has(klucz)) return null;
                      pokazaneRoznice.add(klucz);
                      return (
                        <span
                          className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded ${
                            d.diff > 0
                              ? "bg-[#E4F3E0] text-[#2F5E2A]"
                              : "bg-[#FAEAE6] text-[#8A3A2B]"
                          }`}
                          title={`Ten dzień: grafik ${d.planH
                            .toFixed(1)
                            .replace(".", ",")} h, odbito ${d.faktH
                            .toFixed(1)
                            .replace(".", ",")} h`}
                        >
                          {d.diff > 0 ? "+" : "−"}
                          {Math.abs(d.diff).toFixed(1).replace(".", ",")} h
                        </span>
                      );
                    })()}
                  </span>
                  <span className="w-16 flex-shrink-0 text-right font-['Archivo'] font-extrabold text-[14px] tabular-nums">
                    {s.end_time ? hoursOf(s).toFixed(1).replace(".", ",") : "-"}
                  </span>
                  <button
                    onClick={() => onEditShift(s)}
                    className="w-9 h-[30px] flex-shrink-0 border-[2px] border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
