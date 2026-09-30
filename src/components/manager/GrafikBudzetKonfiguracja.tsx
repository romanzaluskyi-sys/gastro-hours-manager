// @ts-nocheck
// Grafik → Konfiguracja → "Budżet": oczekiwany utarg i docelowy % kosztu pracy
// na każdy dzień tygodnia, wersjonowane miesięcznie — dokładnie tak samo jak
// wymagania obsady obok, bo to ta sama decyzja podejmowana w tym samym rytmie.
//
// Dwa poziomy, i tylko dwa:
//   ZESTAW   — reguła na typowy wtorek, obowiązuje od swojego miesiąca w przód
//   WYJĄTEK  — jedna konkretna data, np. sylwester albo koncert w mieście
//
// Wyjątek nadpisuje POLE PO POLU: można zmienić sam utarg i zostawić procent z
// zestawu. Ta sama tabela zasila olówek w siatce "Wg budżetu" — dzień zmieniony
// tam pokazuje się tutaj i odwrotnie, bo to jedna rzecz, a nie dwie.
//
// ⚠️ Układ z makiety właściciela (0.68.0, ScheduleConfigBudget /
// ScheduleConfigMobile). Zapis bez zmian. Kolumny „Budżet pracy” i „Obsada
// wymaga” są LICZONE i niczego nie zapisują: budżet w godzinach = utarg × % ÷
// średni koszt godziny osób z tego lokalu (`kosztGodziny`, ta sama reguła co w
// Grafiku), obsada = osobogodziny zestawu wymagań obowiązującego w tym czasie.
// Budżet na konkretne dni zostaje TUTAJ (makieta przenosiła go do Wyjątków),
// bo w bazie to osobna tabela, niezwiązana z wyjątkiem godzin i obsady.
import React, { useState } from "react";
import { AlertTriangle, Check, History, Plus, Trash2 } from "lucide-react";
import {
  utworzZestaw,
  usunZestaw,
  zapiszCel,
  zapiszNadpisanieDnia,
  usunNadpisanieDnia,
  budzetSetyLokalu,
  findBudzetSetForDate,
  wierszeZestawu,
  sredniUtargDnia,
  kosztGodziny,
  zl,
} from "../../utils/budzet";
import { addDaysYMD, toLocalYMD, findRuleSetForDate } from "../../utils/grafik";
import {
  etykietaCls,
  poleCls,
  notaCls,
  btnObrysCls,
  btnGlownyCls,
  ikonaBtnCls,
  dodajCls,
  DNI,
  f1,
  miesiacKrotko,
  kafelDaty,
  osGodzinDnia,
  Panel,
  PasekWersji,
} from "./grafikKonfigWspolne";

const doPola = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));
const zPola = (v) => {
  const t = String(v || "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

const pustyWyjatek = () => ({
  date_from: "",
  date_to: "",
  oczekiwany_utarg: "",
  cel_koszt_pct: "",
});

export default function GrafikBudzetKonfiguracja({
  lokal,
  lokale,
  users,
  budzetCele,
  setBudzetCele,
  budzetDni,
  setBudzetDni,
  staffingRules,
  staffingRuleSets,
  dayLogs,
  currentUser,
  showMsg,
}) {
  const dzis = toLocalYMD(new Date());
  const [wybranyOd, setWybranyOd] = useState(null);
  const [draft, setDraft] = useState(null);
  const [zapisuje, setZapisuje] = useState(false);
  const [wyjatek, setWyjatek] = useState(null);

  const zestawy = budzetSetyLokalu(budzetCele, lokal);
  // Domyślnie zestaw obowiązujący DZIŚ, a nie najnowszy — kierownik może mieć
  // przygotowany zestaw na przyszły miesiąc, który jeszcze nie działa.
  const obowiazujacy = findBudzetSetForDate(budzetCele, lokal, dzis);
  const aktywnyOd = (zestawy.includes(wybranyOd) && wybranyOd) || obowiazujacy || zestawy[0] || null;
  const wiersze = aktywnyOd ? wierszeZestawu(budzetCele, lokal, aktywnyOd) : [];

  const zapisane = DNI.map((d) => {
    const w = wiersze.find((r) => Number(r.day_of_week) === d.idx);
    return {
      day_of_week: d.idx,
      id: w ? w.id : null,
      oczekiwany_utarg: doPola(w && w.oczekiwany_utarg),
      cel_koszt_pct: doPola(w && w.cel_koszt_pct),
    };
  });
  const rows = draft || zapisane;
  const ustaw = (idx, patch) => setDraft(rows.map((r) => (r.day_of_week === idx ? { ...r, ...patch } : r)));

  // Co zmieniono względem zapisanego — „Sb 28%, Pt 4 500 zł”.
  const zmiany = draft
    ? draft.flatMap((r) => {
        const z = zapisane.find((x) => x.day_of_week === r.day_of_week);
        const d = DNI.find((x) => x.idx === r.day_of_week).label;
        const out = [];
        if (zPola(r.oczekiwany_utarg) !== zPola(z.oczekiwany_utarg))
          out.push(`${d} ${zPola(r.oczekiwany_utarg) == null ? "utarg —" : zl(zPola(r.oczekiwany_utarg))}`);
        if (zPola(r.cel_koszt_pct) !== zPola(z.cel_koszt_pct))
          out.push(`${d} ${zPola(r.cel_koszt_pct) == null ? "% —" : `${doPola(zPola(r.cel_koszt_pct))}%`}`);
        return out;
      })
    : [];

  // Średni koszt godziny osób z tego lokalu — z kart w Pracownikach, ta sama
  // reguła co koszt w Grafiku (stawka / wynagrodzenie ÷ norma, z narzutem).
  const teraz = new Date();
  const lokalRow = (lokale || []).find((l) => l.name === lokal);
  const koszty = (users || [])
    .filter(
      (u) =>
        u.active !== false &&
        !u.archived &&
        u.role !== "kiosk" &&
        u.probny_status !== "oczekuje" &&
        u.default_lokal === lokal
    )
    .map((u) => kosztGodziny(u, lokalRow, teraz.getFullYear(), teraz.getMonth() + 1))
    .filter((k) => k != null && k > 0);
  const sredniKoszt = koszty.length ? koszty.reduce((s, k) => s + k, 0) / koszty.length : null;

  // Obsada: zestaw wymagań obowiązujący w czasie oglądanego celu.
  const dataObsady = aktywnyOd && aktywnyOd > dzis ? aktywnyOd : dzis;
  const zestawObsady = findRuleSetForDate(staffingRuleSets, lokal, dataObsady);
  const regulyObsady = (staffingRules || []).filter((r) => zestawObsady && r.set_id === zestawObsady.id);

  const utworz = async (obowiazujeOd, kopiuj) => {
    if (zestawy.includes(obowiazujeOd)) {
      showMsg("Zestaw na ten miesiąc już istnieje.", "error");
      return;
    }
    setZapisuje(true);
    try {
      const nowe = await utworzZestaw({ lokal, obowiazujeOd, zrodlo: kopiuj ? wiersze : null, autor: currentUser?.name });
      setBudzetCele([...(budzetCele || []), ...nowe]);
      setWybranyOd(obowiazujeOd);
      setDraft(null);
      showMsg(kopiuj ? "Utworzono zestaw z kopii bieżącego." : "Utworzono pusty zestaw.");
    } catch (err) {
      showMsg(`Błąd zapisu zestawu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  // ⚠️ Kasowanie zestawu OBOWIĄZUJĄCEGO zmienia liczby w siatce od razu: dni
  // spadają na zestaw wcześniejszy albo tracą cel i cała warstwa budżetu
  // milknie. Pasek potwierdzenia mówi to, zanim ktoś kliknie.
  const wczesniejszy = aktywnyOd ? zestawy.filter((od) => od !== aktywnyOd && od <= dzis).sort().reverse()[0] : null;
  const skutek = !aktywnyOd
    ? ""
    : aktywnyOd !== obowiazujacy
    ? "Ten zestaw jeszcze nie obowiązuje, więc w siatce nic się nie zmieni."
    : wczesniejszy
    ? `Od teraz wróci cel z „od ${miesiacKrotko(wczesniejszy)}”. Budżet na konkretne dni zostaje.`
    : "To jedyny obowiązujący zestaw — lokal zostanie bez celu, a widok „Wg budżetu” przestanie pokazywać liczby.";
  const usun = async () => {
    if (!aktywnyOd) return;
    setZapisuje(true);
    try {
      await usunZestaw({ cele: budzetCele, setCele: setBudzetCele, lokal, obowiazujeOd: aktywnyOd });
      setDraft(null);
      setWybranyOd(null);
      showMsg("Usunięto zestaw celów.");
    } catch (err) {
      showMsg(`Błąd usuwania zestawu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const zapisz = async () => {
    if (!aktywnyOd) return;
    setZapisuje(true);
    try {
      const nowe = [];
      for (const r of rows) {
        const wiersz = wiersze.find((w) => Number(w.day_of_week) === r.day_of_week);
        if (!wiersz) continue;
        nowe.push(
          await zapiszCel({
            wiersz,
            patch: { oczekiwany_utarg: zPola(r.oczekiwany_utarg), cel_koszt_pct: zPola(r.cel_koszt_pct) },
          })
        );
      }
      const mapa = new Map(nowe.map((x) => [x.id, x]));
      setBudzetCele((budzetCele || []).map((c) => mapa.get(c.id) || c));
      setDraft(null);
      showMsg("Zapisano cel finansowy.");
    } catch (err) {
      showMsg(`Błąd zapisu celu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  // --- BUDŻET NA KONKRETNE DNI ---------------------------------------------
  const dniLokalu = (budzetDni || []).filter((d) => d.lokal === lokal).sort((a, b) => (a.date < b.date ? -1 : 1));
  const nadchodzaceDni = dniLokalu.filter((d) => d.date >= dzis);

  const zapiszWyjatek = async (e) => {
    e.preventDefault();
    const od = wyjatek.date_from;
    const doDnia = wyjatek.date_to || od;
    if (!od) {
      showMsg("Podaj datę.", "error");
      return;
    }
    if (doDnia < od) {
      showMsg("Data końcowa jest wcześniejsza niż początkowa.", "error");
      return;
    }
    const u = zPola(wyjatek.oczekiwany_utarg);
    const p = zPola(wyjatek.cel_koszt_pct);
    if (u == null && p == null) {
      showMsg("Wpisz utarg albo procent — inaczej ten dzień niczym się nie różni.", "error");
      return;
    }
    setZapisuje(true);
    try {
      // Zakres rozpisujemy na pojedyncze dni — „który dzień jest zmieniony” ma
      // wtedy jedną odpowiedź, i tu, i w siatce, gdzie olówek pisze do tych
      // samych wierszy.
      let biezaca = od;
      let lista = budzetDni || [];
      // ⚠️ Kolejny dzień liczy `addDaysYMD`, a NIE `toISOString().slice(0,10)` —
      // to drugie cofa w Polsce datę o dzień (błąd #2 w CLAUDE.md).
      while (biezaca <= doDnia) {
        await zapiszNadpisanieDnia({
          lokal,
          dateStr: biezaca,
          oczekiwany_utarg: u,
          cel_koszt_pct: p,
          autor: currentUser?.name,
          budzetDni: lista,
          setBudzetDni: (nowa) => {
            lista = typeof nowa === "function" ? nowa(lista) : nowa;
          },
        });
        biezaca = addDaysYMD(biezaca, 1);
      }
      setBudzetDni(lista);
      setWyjatek(null);
      showMsg("Zapisano budżet na wybrane dni.");
    } catch (err) {
      showMsg(`Błąd zapisu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const usunWyjatek = async (w) => {
    try {
      await usunNadpisanieDnia({ wiersz: w, budzetDni, setBudzetDni });
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // --- wiersz dnia: liczby wspólne dla tabeli i kart na telefonie ---
  const liczDzien = (r) => {
    const utarg = zPola(r.oczekiwany_utarg);
    const pct = zPola(r.cel_koszt_pct);
    const budzetZl = utarg != null && pct != null ? (utarg * pct) / 100 : null;
    const budzetH = budzetZl != null && sredniKoszt ? budzetZl / sredniKoszt : null;
    const obsadaH = osGodzinDnia(regulyObsady, r.day_of_week);
    const ponad = budzetH != null && obsadaH > budzetH + 0.05;
    const historia = sredniUtargDnia(dayLogs, lokal, r.day_of_week);
    const daleko = historia && utarg ? Math.abs(historia.kwota - utarg) / utarg > 0.4 : false;
    return { utarg, pct, budzetZl, budzetH, obsadaH, ponad, historia, daleko };
  };
  const poleKwotyCls = `${poleCls} !h-11 !w-[110px] text-right`;
  const pH = (x) => (x == null ? "—" : `${f1(x)} h`);

  const status = (l) =>
    l.budzetH == null ? (
      <span className="text-[14px] text-[#6E6E66]">—</span>
    ) : l.ponad ? (
      <span className="inline-flex items-center gap-1 text-[14px] font-extrabold text-[#8A5300] whitespace-nowrap">
        <AlertTriangle size={16} /> +{f1(l.obsadaH - l.budzetH)} h ponad
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[14px] font-bold text-[#1F7A4A] whitespace-nowrap">
        <Check size={16} /> mieści się · {f1(l.budzetH - l.obsadaH)} h zapasu
      </span>
    );

  const przyciskHistorii = (r, l) =>
    l.historia ? (
      <span className="inline-flex flex-col">
        <button
          type="button"
          onClick={() => ustaw(r.day_of_week, { oczekiwany_utarg: String(l.historia.kwota) })}
          className={`inline-flex items-center gap-1.5 h-9 pl-2.5 pr-1 rounded-full border-[1.5px] bg-white text-[14px] font-bold ${
            l.daleko ? "border-[#8A5300]" : "border-[#B7B6AE]"
          }`}
          title={`Średnia z ${l.historia.zIlu} ostatnich takich dni w Pulsie — wstawia liczbę do pola, nic nie zapisuje`}
          data-uzyj-historii={r.day_of_week}
        >
          <History size={15} className="text-[#6E6E66]" />
          {zl(l.historia.kwota)}
          <span className="bg-[#171714] text-white rounded-full px-2.5 py-0.5 text-[12px]">Użyj</span>
        </button>
        {l.daleko && (
          <small className="text-[12px] font-bold text-[#8A5300] mt-0.5 ml-1">
            {l.historia.kwota < l.utarg ? "dużo niżej niż cel" : "dużo wyżej niż cel"}
          </small>
        )}
      </span>
    ) : (
      <span className="text-[14px] text-[#6E6E66]">brak historii</span>
    );

  const tabela = () => {
    let sumaUtarg = 0;
    let sumaBudzetH = 0;
    let sumaObsada = 0;
    let saBudzety = false;
    const wiersze = rows.map((r) => {
      const l = liczDzien(r);
      sumaUtarg += l.utarg || 0;
      sumaObsada += l.obsadaH;
      if (l.budzetH != null) {
        saBudzety = true;
        sumaBudzetH += l.budzetH;
      }
      return { r, l, d: DNI.find((x) => x.idx === r.day_of_week) };
    });
    return (
      <>
        {/* Tablet/komputer: tabela. */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse" data-tabela-budzetu>
            <thead>
              <tr className="bg-[#F1F0EC] text-left">
                {["Dzień", "Oczekiwany utarg", "Średnia z Pulsu", "% kosztu pracy", "Budżet pracy", "Obsada wymaga", ""].map((t) => (
                  <th key={t} className="px-3 py-2.5 text-[12px] font-extrabold tracking-[0.05em] uppercase text-[#6E6E66]">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wiersze.map(({ r, l, d }) => (
                <tr key={r.day_of_week} className={`border-t-[1.5px] border-[#ECEBE6] ${l.ponad ? "bg-[#FDF0D8]" : ""}`} data-dzien-budzetu={r.day_of_week}>
                  <th className="px-3 py-2.5 text-left text-[17px] font-extrabold w-[50px]">{d.label}</th>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <input
                      value={r.oczekiwany_utarg}
                      onChange={(e) => ustaw(r.day_of_week, { oczekiwany_utarg: e.target.value })}
                      className={poleKwotyCls}
                      placeholder="—"
                      inputMode="decimal"
                      aria-label={`${d.pelna} — oczekiwany utarg`}
                    />
                    <i className="not-italic ml-1.5 text-[#6E6E66]">zł</i>
                  </td>
                  <td className="px-3 py-2.5">{przyciskHistorii(r, l)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <input
                      value={r.cel_koszt_pct}
                      onChange={(e) => ustaw(r.day_of_week, { cel_koszt_pct: e.target.value })}
                      className={`${poleCls} !h-11 !w-16 text-right`}
                      placeholder="—"
                      inputMode="decimal"
                      aria-label={`${d.pelna} — procent kosztu pracy`}
                    />
                    <i className="not-italic ml-1.5 text-[#6E6E66]">%</i>
                  </td>
                  <td className="px-3 py-2.5">
                    <b className="block text-[16px] tabular-nums">{l.budzetZl != null ? zl(l.budzetZl) : "—"}</b>
                    {l.budzetH != null && <small className="text-[13px] text-[#6E6E66]">≈ {f1(l.budzetH)} h</small>}
                  </td>
                  <td className="px-3 py-2.5">
                    <b className="text-[16px] tabular-nums">{pH(l.obsadaH)}</b>
                  </td>
                  <td className="px-3 py-2.5">{status(l)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F1F0EC] border-t-[1.5px] border-[#DEDCD4]">
                <th className="px-3 py-2.5 text-left text-[15px]">Tydzień</th>
                <td className="px-3 py-2.5">
                  <b>{zl(sumaUtarg)}</b>
                </td>
                <td />
                <td />
                <td className="px-3 py-2.5">
                  <b>{saBudzety ? `≈ ${f1(sumaBudzetH)} h` : "—"}</b>
                </td>
                <td className="px-3 py-2.5">
                  <b>{pH(sumaObsada)}</b>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {/* Telefon: karta na dzień. */}
        <div className="md:hidden flex flex-col gap-2 p-3">
          {wiersze.map(({ r, l, d }) => (
            <div
              key={r.day_of_week}
              className={`border-[2px] rounded-xl p-3 flex flex-col gap-2 ${l.ponad ? "border-[#8A5300] bg-[#FDF0D8]" : "border-[#ECEBE6] bg-white"}`}
              data-dzien-budzetu={r.day_of_week}
            >
              <div className="flex items-center justify-between gap-2">
                <b className="text-[17px]">{d.pelna}</b>
                {l.ponad && (
                  <em className="not-italic inline-flex items-center gap-1 text-[13px] font-extrabold text-[#8A5300]">
                    <AlertTriangle size={15} /> obsada ponad budżet
                  </em>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col">
                  <span className={etykietaCls}>Utarg</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      value={r.oczekiwany_utarg}
                      onChange={(e) => ustaw(r.day_of_week, { oczekiwany_utarg: e.target.value })}
                      className={`${poleCls} !h-11 w-full text-right`}
                      placeholder="—"
                      inputMode="decimal"
                    />
                    <i className="not-italic text-[#6E6E66]">zł</i>
                  </span>
                </label>
                <label className="flex flex-col">
                  <span className={etykietaCls}>Koszt pracy</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      value={r.cel_koszt_pct}
                      onChange={(e) => ustaw(r.day_of_week, { cel_koszt_pct: e.target.value })}
                      className={`${poleCls} !h-11 w-full text-right`}
                      placeholder="—"
                      inputMode="decimal"
                    />
                    <i className="not-italic text-[#6E6E66]">%</i>
                  </span>
                </label>
              </div>
              <div>{przyciskHistorii(r, l)}</div>
              <div className="flex justify-between text-[14px] text-[#6E6E66]">
                <span>
                  Budżet <b className="text-[#171714]">{l.budzetH != null ? pH(l.budzetH) : l.budzetZl != null ? zl(l.budzetZl) : "—"}</b>
                </span>
                <span>
                  Obsada <b className="text-[#171714]">{pH(l.obsadaH)}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <PasekWersji
        etykieta="Zestaw budżetu"
        wersje={zestawy}
        aktywna={aktywnyOd}
        obowiazujaca={obowiazujacy}
        dzis={dzis}
        onWybierz={(od) => {
          setDraft(null);
          setWybranyOd(od);
        }}
        onUtworz={utworz}
        onUsun={usun}
        skutekUsuniecia={skutek}
        opisKopii="7 dni"
        zapisuje={zapisuje}
      />

      <Panel
        tytul="Cel na typowy dzień tygodnia"
        prawa={
          <span className="text-[14px] text-[#6E6E66]">
            {sredniKoszt ? (
              <>
                średni koszt godziny pracy: <b className="text-[#171714]">{zl(sredniKoszt)}/h</b> · z Pracowników ({koszty.length})
              </>
            ) : (
              "brak stawek w kartach — budżet tylko w zł"
            )}
          </span>
        }
        dane={{ "data-cel-budzetu": aktywnyOd || "" }}
      >
        {zestawy.length === 0 ? (
          <p className={`${notaCls} px-3.5 md:px-[18px] py-4 m-0`}>
            Ten lokal nie ma jeszcze celu finansowego. Utwórz zestaw („Nowy zestaw od…” wyżej) — obowiązuje od swojego miesiąca, aż
            pojawi się nowszy.
          </p>
        ) : (
          <>
            {tabela()}
            <div className="flex flex-wrap items-center gap-3 px-3.5 md:px-[18px] py-3.5 border-t-[2px] border-[#B7B6AE]">
              <button type="button" onClick={zapisz} disabled={zapisuje || !draft} className={btnGlownyCls} data-zapisz-cel>
                Zapisz cel
              </button>
              {draft && (
                <button type="button" onClick={() => setDraft(null)} className={btnObrysCls}>
                  Anuluj
                </button>
              )}
              {zmiany.length > 0 && (
                <span className="text-[14px] font-bold text-[#8A5300]" data-zmiany-celu>
                  Zmieniono: {zmiany.join(", ")}
                </span>
              )}
              <p className={`${notaCls} basis-full m-0`}>
                Budżet pracy = utarg × % kosztu{sredniKoszt ? ", w godzinach ÷ średni koszt godziny" : ""}. Grafik pokazuje go w widoku
                „Wg budżetu”; na konkretny dzień nadpiszesz go niżej albo ołówkiem w siatce.
              </p>
            </div>
          </>
        )}
      </Panel>

      <Panel
        tytul="Budżet na konkretne dni"
        prawa={
          <button type="button" onClick={() => setWyjatek(wyjatek ? null : pustyWyjatek())} className={dodajCls} data-dodaj-budzet-dnia>
            <Plus size={17} /> {wyjatek ? "Anuluj" : "Dodaj dzień"}
          </button>
        }
      >
        {wyjatek && (
          <form
            onSubmit={zapiszWyjatek}
            className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end p-3.5 border-b-[1.5px] border-[#DEDCD4] bg-[#F1F0EC]"
          >
            <label className="flex flex-col min-w-0">
              <span className={etykietaCls}>Od dnia</span>
              <input type="date" value={wyjatek.date_from} onChange={(e) => setWyjatek({ ...wyjatek, date_from: e.target.value })} className={`${poleCls} w-full`} required />
            </label>
            <label className="flex flex-col min-w-0">
              <span className={etykietaCls}>Do dnia (puste = jeden)</span>
              <input type="date" value={wyjatek.date_to} onChange={(e) => setWyjatek({ ...wyjatek, date_to: e.target.value })} className={`${poleCls} w-full`} />
            </label>
            <label className="flex flex-col min-w-0">
              <span className={etykietaCls}>Utarg (zł)</span>
              <input
                value={wyjatek.oczekiwany_utarg}
                onChange={(e) => setWyjatek({ ...wyjatek, oczekiwany_utarg: e.target.value })}
                className={`${poleCls} w-full text-right`}
                placeholder="jak zwykle"
                inputMode="decimal"
              />
            </label>
            <label className="flex flex-col min-w-0">
              <span className={etykietaCls}>Koszt pracy (%)</span>
              <input
                value={wyjatek.cel_koszt_pct}
                onChange={(e) => setWyjatek({ ...wyjatek, cel_koszt_pct: e.target.value })}
                className={`${poleCls} w-full text-right`}
                placeholder="jak zwykle"
                inputMode="decimal"
              />
            </label>
            <button type="submit" disabled={zapisuje} className={`${btnGlownyCls} col-span-2 md:col-span-1`}>
              Zapisz
            </button>
          </form>
        )}
        {nadchodzaceDni.length === 0 ? (
          <p className={`${notaCls} px-3.5 md:px-[18px] py-3.5 m-0`}>
            Brak nadchodzących dni z innym budżetem — sylwester, koncert w mieście, remont ulicy. To te same wiersze, które powstają po
            kliknięciu w liczbę w siatce „Wg budżetu”.
          </p>
        ) : (
          nadchodzaceDni.map((w) => {
            const [dzien, pod] = kafelDaty(w.date);
            return (
              <div
                key={w.id}
                className="grid grid-cols-[76px_1fr_auto] gap-3.5 items-center px-3.5 md:px-[18px] py-2.5 border-b-[1.5px] border-[#ECEBE6] last:border-b-0"
                data-budzet-dnia={w.date}
              >
                <span className="text-center border-[2px] border-[#171714] rounded-[10px] py-1">
                  <b className="block text-[16px] leading-[22px]">{dzien}</b>
                  <small className="text-[13px] font-bold text-[#6E6E66]">{pod}</small>
                </span>
                <span className="min-w-0 text-[15px]">
                  <b>{w.oczekiwany_utarg != null ? zl(w.oczekiwany_utarg) : "utarg jak zwykle"}</b>
                  {" · "}
                  {w.cel_koszt_pct != null ? `${w.cel_koszt_pct}% kosztu` : "% jak zwykle"}
                  {w.autor && <small className="block text-[13px] text-[#6E6E66]">wpisał(a): {w.autor}</small>}
                </span>
                <button
                  type="button"
                  onClick={() => usunWyjatek(w)}
                  className={`${ikonaBtnCls} !text-[#DE3A22] hover:!border-[#DE3A22]`}
                  title="Usuń — dzień wróci do wartości z zestawu"
                  aria-label="Usuń budżet dnia"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })
        )}
      </Panel>
    </>
  );
}
