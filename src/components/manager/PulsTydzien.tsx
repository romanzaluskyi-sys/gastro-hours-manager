// @ts-nocheck
// Puls → Analityka. Układ z makiety właściciela (0.57.0, PulseAnalytics):
// zdrowie tygodnia jednego lokalu — utarg wobec planu i poprzedniego tygodnia,
// koszt pracy %, godziny wobec planu, średni paragon; wykres dzień po dniu;
// wnioski z akcjami; dyscyplina zamykania; "Co się działo"; ludzie (grafik vs
// fakt); poprzednie tygodnie.
//
// ⚠️ Raport NIE jest przechowywany. Liczy się z tych samych wierszy co lista
// dni (`wierszDnia`), więc nie może powiedzieć czegoś innego niż dni.
// ⚠️ Porównanie z poprzednim tygodniem jest like-for-like: te same dni
// tygodnia, które w tym tygodniu mają utarg — ta sama zasada co na Pulpicie.
// ⚠️ Wnioski są LICZONE, nie zapisane; każdy ma akcję albo go nie ma.
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Thermometer, Tag, Clock, AlertTriangle, ArrowRight, Users, Cloud } from "lucide-react";
import { mondayOf, addDaysYMD } from "../../utils/grafik";
import {
  wierszDnia,
  raportTygodnia,
  listaTagow,
  godzinaZamkniecia,
  pozneZamkniecie,
  pomiaryPozaNorma,
  sygnalyDnia,
  zdarzeniaTygodnia,
  ludzieTygodnia,
  TYPY_ZDARZEN_TYGODNIA,
  trafnoscPrognozy,
  przesun,
  wartoscPola,
  opisNormy,
} from "../../utils/dziennik";
import { celDnia } from "../../utils/budzet";
import { kartaCls, podpowiedzCls, btnMalyCls, zl, f1, pctTxt, znak, dzienTxt, Kafelek, Kafelki, Panel, Chip, MiniTag } from "./pulsWspolne";

const DN = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
const MIES = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const zakresTxt = (od) => {
  const a = new Date(`${od}T00:00:00`);
  const b = new Date(`${addDaysYMD(od, 6)}T00:00:00`);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MIES[b.getMonth()]}`
    : `${a.getDate()} ${MIES[a.getMonth()]} – ${b.getDate()} ${MIES[b.getMonth()]}`;
};
const dnTxt = (ymd) => DN[new Date(`${ymd}T00:00:00`).getDay()];

export default function PulsTydzien({
  lokal, lokalRow, miasto, dzis,
  shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
  karty, wpisy, szablony, weatherForecasts, budzetCele, budzetDni,
  data, setData, onOtworzDzien, onWidok,
}) {
  const [filtr, setFiltr] = useState("all");
  const [pokazPogode, setPokazPogode] = useState(false);
  const poniedzialek = mondayOf(data);

  const policz = (od) =>
    Array.from({ length: 7 }, (_, i) => addDaysYMD(od, i)).map((dateStr) => {
      const w = wierszDnia({
        shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
        dayLogs: karty, dayLogEntries: wpisy, dayLogTemplates: szablony,
        weatherForecasts, lokal, lokalRow, miasto, dateStr,
      });
      const cel = celDnia({ cele: budzetCele, budzetDni }, lokal, dateStr);
      const plan = cel && cel.utarg != null ? cel.utarg : null;
      return {
        ...w,
        plan,
        celPct: cel && cel.pct != null ? cel.pct : null,
        przyszly: dateStr > dzis,
        dzis: dateStr === dzis,
        // Do sum wchodzą dni miniony i dzisiejszy zamknięty — dzień, który
        // trwa, dopiero zbiera liczby.
        liczony: dateStr < dzis || (dateStr === dzis && w.zamkniety),
        paragony: w.karta && w.karta.liczba_paragonow != null ? Number(w.karta.liczba_paragonow) : null,
        tagi: listaTagow(w.karta && w.karta.tagi),
      };
    });

  const dni = useMemo(() => policz(poniedzialek), [poniedzialek, karty, wpisy, szablony, shifts, planShifts, lokal, budzetCele, budzetDni, dzis]);
  const poprzedni = useMemo(() => policz(addDaysYMD(poniedzialek, -7)), [poniedzialek, karty, wpisy, szablony, shifts, planShifts, lokal, budzetCele, budzetDni, dzis]);

  const liczone = dni.filter((d) => d.liczony);
  const zUtargiem = liczone.filter((d) => d.obrot != null);
  const suma = (lista, f) => lista.reduce((s, d) => s + (f(d) || 0), 0);
  const obrot = suma(zUtargiem, (d) => d.obrot);
  const kosztUt = suma(zUtargiem, (d) => d.koszt);
  const planUt = zUtargiem.filter((d) => d.plan != null);
  const planSuma = suma(planUt, (d) => d.plan);
  const obrotPlanowanych = suma(planUt, (d) => d.obrot);
  // like-for-like: te same dni tygodnia tydzień wcześniej
  const indeksy = new Set(zUtargiem.map((d) => dni.indexOf(d)));
  const poprzedniePodobne = poprzedni.filter((_, i) => indeksy.has(i) && poprzedni[i].obrot != null);
  const obrotPoprz = suma(poprzedniePodobne, (d) => d.obrot);
  const lcPct = obrot ? (kosztUt / obrot) * 100 : null;
  const zCelem = zUtargiem.filter((d) => d.plan != null && d.celPct != null);
  const celWazony = zCelem.length ? suma(zCelem, (d) => d.plan * d.celPct) / suma(zCelem, (d) => d.plan) : null;
  const godz = suma(liczone, (d) => d.godziny);
  const godzPlan = suma(liczone, (d) => d.godzinyPlan);
  const zParag = zUtargiem.filter((d) => d.paragony);
  const czek = zParag.length ? suma(zParag, (d) => d.obrot) / suma(zParag, (d) => d.paragony) : null;
  const zParagPoprz = poprzedniePodobne.filter((d) => d.paragony);
  const czekPoprz = zParagPoprz.length ? suma(zParagPoprz, (d) => d.obrot) / suma(zParagPoprz, (d) => d.paragony) : null;

  // --- wnioski -----------------------------------------------------------
  const wnioski = useMemo(() => {
    const lista = [];
    const pomiary = new Map();
    liczone.forEach((d) =>
      pomiaryPozaNorma({ entries: wpisy, templates: szablony, tasks, lokal, dateStr: d.date }).forEach((m) => {
        const o = pomiary.get(m.nazwa) || { nazwa: m.nazwa, dni: [], ostatni: null };
        if (!o.dni.includes(d.date)) o.dni.push(d.date);
        o.ostatni = m;
        pomiary.set(m.nazwa, o);
      })
    );
    [...pomiary.values()]
      .sort((a, b) => b.dni.length - a.dni.length)
      .slice(0, 2)
      .forEach((o) =>
        lista.push({
          ton: "warn",
          Ikona: Thermometer,
          tytul: `${o.nazwa} poza normą ${o.dni.length} ${o.dni.length === 1 ? "dzień" : "dni"} z ${liczone.length}`,
          opis: `Ostatnio ${o.ostatni.pola.map((p) => wartoscPola(p, o.ostatni.wpis.payload || {})).join(" / ")}${
            o.ostatni.pola.some((p) => opisNormy(p)) ? ` przy normie ${o.ostatni.pola.map((p) => opisNormy(p)).filter(Boolean).join(" / ")}` : ""
          } (${o.dni.map(dzienTxt).join(", ")}).`,
          akcja: { etykieta: "Karta dnia", dzien: o.dni[o.dni.length - 1] },
        })
      );
    const odchylone = zUtargiem
      .map((d) => {
        const odn = d.plan != null ? d.plan : d.prognozaUtargu ? d.prognozaUtargu.kwota : null;
        return { d, odch: odn ? ((d.obrot - odn) / odn) * 100 : null, nazwa: d.plan != null ? "plan" : "zwykle" };
      })
      .filter((x) => x.odch != null && Math.abs(x.odch) >= 10)
      .sort((a, b) => Math.abs(b.odch) - Math.abs(a.odch));
    if (odchylone[0]) {
      const { d, odch, nazwa } = odchylone[0];
      lista.push({
        ton: "neu",
        Ikona: Tag,
        tytul: `${dzienTxt(d.date)} ${znak(odch, "%")} vs ${nazwa}${d.tagi.length ? ` — tagi: ${d.tagi.join(", ")}` : ""}`,
        opis: d.tagi.length
          ? "Tagi wyjaśniają liczbę — przy następnym takim dniu warto pomyśleć o obsadzie."
          : "Bez tagu nie będzie wiadomo, dlaczego. Dopisz tag albo powód na karcie dnia.",
        akcja: { etykieta: "Karta dnia", dzien: d.date },
      });
    }
    liczone
      .filter((d) => pozneZamkniecie(d.karta))
      .slice(0, 1)
      .forEach((d) =>
        lista.push({
          ton: "warn",
          Ikona: AlertTriangle,
          tytul: `${dzienTxt(d.date)} zamknięty o ${godzinaZamkniecia(d.karta)}`,
          opis: `Zamykał(a): ${d.karta.closed_by}. Prawo zamykania na dziś lub tydzień nadasz w Konfiguracji.`,
          akcja: { etykieta: "Konfiguracja", widok: "konfiguracja" },
        })
      );
    const otwarte = dni.filter((d) => d.date < dzis && !d.zamkniety && (d.godziny > 0 || d.obrot != null));
    if (otwarte.length)
      lista.push({
        ton: "warn",
        Ikona: Lock,
        tytul: `${otwarte.length} ${otwarte.length === 1 ? "dzień niezamknięty" : "dni niezamknięte"}`,
        opis: `${otwarte.map((d) => dzienTxt(d.date)).join(", ")} — liczby tych dni mogą się jeszcze zmienić.`,
        akcja: { etykieta: "Karta dnia", dzien: otwarte[0].date },
      });
    if (godzPlan > 0 && godz - godzPlan >= 3 && (godz - godzPlan) / godzPlan >= 0.1)
      lista.push({
        ton: "info",
        Ikona: Clock,
        tytul: `Godziny ${znak(godz - godzPlan, "h")} ponad plan`,
        opis: `${f1(godz)} h przy planie ${f1(godzPlan)} h — sprawdź w Ludziach, u kogo.`,
        akcja: null,
      });
    if (lcPct != null && celWazony != null && lcPct > celWazony + 0.5)
      lista.push({
        ton: "warn",
        Ikona: AlertTriangle,
        tytul: `Koszt pracy ${pctTxt(lcPct)} przy celu ${pctTxt(celWazony)}`,
        opis: `Przekroczenie o ${zl(kosztUt - (obrot * celWazony) / 100)} w dniach z utargiem.`,
        akcja: null,
      });
    return lista;
  }, [dni, wpisy, szablony, tasks, lokal, dzis]);

  const feed = useMemo(
    () => zdarzeniaTygodnia({ dni: dni.filter((d) => !d.przyszly).map((d) => d.date), dayLogs: karty, entries: wpisy, templates: szablony, tasks, lokal }),
    [dni, karty, wpisy, szablony, tasks, lokal]
  );
  const ludzie = useMemo(
    () => ludzieTygodnia({ dni: dni.filter((d) => !d.przyszly).map((d) => d.date), shifts, planShifts, lokal }),
    [dni, shifts, planShifts, lokal]
  );
  const sygn = liczone.map((d) => sygnalyDnia({ entries: wpisy, templates: szablony, tasks, lokal, dateStr: d.date }));
  const wpisyZ = suma(liczone, (d) => d.wpisyZrobione);
  const wpisyR = suma(liczone, (d) => d.wpisyRazem);
  const historia = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => addDaysYMD(poniedzialek, -7 * (i + 1))).map((od) => {
        const w = policz(od).filter((d) => d.liczony);
        return { od, r: raportTygodnia(w), razem: w.length };
      }),
    [poniedzialek, karty, wpisy, szablony, shifts, planShifts, lokal, dzis]
  );
  const trafnosc = useMemo(() => (pokazPogode ? trafnoscPrognozy(weatherForecasts, miasto, przesun(dzis, -90)) : []), [pokazPogode, weatherForecasts, miasto, dzis]);

  const max = Math.max(1, ...dni.map((d) => Math.max(d.obrot || 0, d.plan || (d.prognozaUtargu ? d.prognozaUtargu.kwota : 0), d.koszt || 0)));
  const widoczneFeed = feed.filter((f) => filtr === "all" || f.typ === filtr);

  return (
    <div className="flex flex-col gap-4" data-puls-analityka>
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className="w-10 h-10 rounded-lg grid place-items-center hover:bg-[#ECEBE6]" onClick={() => setData(addDaysYMD(poniedzialek, -7))} aria-label="Poprzedni tydzień">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[130px] text-center font-['Archivo'] font-extrabold text-[16px]" data-zakres-tygodnia>
            {zakresTxt(poniedzialek)}
          </span>
          <button
            type="button"
            className="w-10 h-10 rounded-lg grid place-items-center hover:bg-[#ECEBE6] disabled:opacity-30"
            disabled={addDaysYMD(poniedzialek, 7) > dzis}
            onClick={() => setData(addDaysYMD(poniedzialek, 7))}
            aria-label="Następny tydzień"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <span className="text-[13px] text-[#6E6E66]">
          {liczone.filter((d) => d.zamkniety).length} z {liczone.length} dni zamkniętych · porównanie z {zakresTxt(addDaysYMD(poniedzialek, -7))}
        </span>
      </div>

      <Kafelki>
        <Kafelek
          hero
          id="utarg-tyg"
          etykieta={`Utarg · ${zUtargiem.length ? `${dnTxt(zUtargiem[0].date)}–${dnTxt(zUtargiem[zUtargiem.length - 1].date)}` : "brak"}`}
          duza={zl(obrot)}
          pod={
            <>
              {planSuma ? `plan ${zl(planSuma)} · ${znak(((obrotPlanowanych - planSuma) / planSuma) * 100, "%")}` : "brak planu w Grafiku"}
              <br />
              {obrotPoprz ? `tydzień wcześniej te dni ${zl(obrotPoprz)} · ${obrot >= obrotPoprz ? "▲" : "▼"} ${pctTxt(Math.abs(((obrot - obrotPoprz) / obrotPoprz) * 100))}` : "tydzień wcześniej: brak utargu"}
            </>
          }
        />
        <Kafelek
          id="koszt-tyg"
          etykieta="Koszt pracy · % utargu"
          duza={lcPct != null ? pctTxt(lcPct) : "—"}
          ton={lcPct != null && lcPct > (celWazony != null ? celWazony : 35) ? "warn" : null}
          pod={`${zl(kosztUt)}${celWazony != null ? ` · cel ${pctTxt(celWazony)} · zapas ${zl((obrot * celWazony) / 100 - kosztUt)}` : ""}`}
        />
        <Kafelek id="godziny-tyg" etykieta="Godziny" duza={f1(godz)} maly=" h" pod={godzPlan ? `plan ${f1(godzPlan)} h · ${znak(godz - godzPlan, "h")}` : "brak grafiku"} />
        <Kafelek
          id="czek-tyg"
          etykieta="Średni paragon"
          duza={czek != null ? czek.toFixed(2).replace(".", ",") : "—"}
          maly={czek != null ? " zł" : null}
          pod={`${suma(zParag, (d) => d.paragony)} paragonów${czekPoprz != null && czek != null ? ` · ${czek >= czekPoprz ? "▲" : "▼"} ${Math.abs(czek - czekPoprz).toFixed(2).replace(".", ",")} zł` : ""}`}
        />
      </Kafelki>

      <Panel
        id="wykres"
        tytul="Dzień po dniu"
        prawo={
          <span className="inline-flex flex-wrap gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1">
              <i className="w-3 h-3 rounded-sm bg-[#171714]" /> utarg
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="w-3 h-0 border-t-[2px] border-dashed border-[#171714]" /> plan
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="w-3 h-3 rounded-sm bg-[#DE3A22]" /> koszt pracy
            </span>
          </span>
        }
      >
        <div className="grid grid-cols-7 gap-1.5 md:gap-3 px-3 md:px-[18px] pt-4 pb-3">
          {dni.map((d) => {
            const odn = d.plan != null ? d.plan : d.prognozaUtargu ? d.prognozaUtargu.kwota : null;
            return (
              <button
                key={d.date}
                type="button"
                disabled={d.przyszly}
                onClick={() => onOtworzDzien(d.date)}
                className={`flex flex-col items-center gap-1 rounded-lg py-1 hover:bg-[#F6F5F1] disabled:hover:bg-transparent ${d.przyszly ? "opacity-40" : ""}`}
                data-slupek-dnia={d.date}
              >
                <div className="relative w-full h-[150px] md:h-[180px] flex items-end justify-center gap-1">
                  {odn != null && <i className="absolute left-1 right-1 border-t-[2px] border-dashed border-[#171714]" style={{ bottom: `${(odn / max) * 100}%` }} />}
                  <i className="w-[38%] max-w-[26px] rounded-t bg-[#171714] relative" style={{ height: `${((d.obrot || 0) / max) * 100}%` }}>
                    {d.obrot != null && (
                      <em className="hidden md:block not-italic absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold whitespace-nowrap">
                        {(d.obrot / 1000).toFixed(1).replace(".", ",")} tys.
                      </em>
                    )}
                  </i>
                  <i className="w-[38%] max-w-[26px] rounded-t bg-[#DE3A22]" style={{ height: `${((d.koszt || 0) / max) * 100}%` }} />
                </div>
                <b className="text-[13px]">
                  {dnTxt(d.date)} {d.date.slice(8, 10)}
                </b>
                <span className={`text-[12px] tabular-nums ${d.lcPct != null && d.celPct != null && d.lcPct > d.celPct ? "text-[#8A5300] font-bold" : "text-[#6E6E66]"}`}>
                  {d.lcPct != null ? pctTxt(d.lcPct) : d.dzis ? "dziś" : "—"}
                </span>
                {d.tagi[0] && <span className="hidden md:block text-[11px] text-[#6E6E66] truncate max-w-full">{d.tagi[0]}</span>}
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Panel id="wnioski" tytul="Na co zwrócić uwagę" prawo={wnioski.length}>
          {wnioski.length === 0 ? (
            <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>Nic niepokojącego w tym tygodniu.</p>
          ) : (
            wnioski.map((x, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr] sm:grid-cols-[32px_1fr_auto] gap-3 items-start px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-wniosek-pulsu>
                <span
                  className={`w-8 h-8 rounded-lg grid place-items-center ${
                    x.ton === "warn" ? "bg-[#FDF0D8] text-[#8A5300]" : x.ton === "info" ? "bg-[#E3EEFB] text-[#1D5FA8]" : "bg-[#ECEBE6]"
                  }`}
                >
                  <x.Ikona size={15} />
                </span>
                <div className="min-w-0">
                  <b className="block text-[14px]">{x.tytul}</b>
                  <span className="block text-[13px] text-[#6E6E66]">{x.opis}</span>
                </div>
                {x.akcja ? (
                  <button
                    type="button"
                    className={`${btnMalyCls} col-start-2 sm:col-start-auto justify-self-start`}
                    onClick={() => (x.akcja.dzien ? onOtworzDzien(x.akcja.dzien) : onWidok(x.akcja.widok))}
                  >
                    {x.akcja.etykieta} <ArrowRight size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))
          )}
        </Panel>
        <Panel id="dyscyplina" ikona={Lock} tytul="Dyscyplina zamykania">
          <div className="px-4 md:px-[18px] py-4 flex flex-col gap-4">
            <div className="grid grid-cols-7 gap-1.5">
              {dni.map((d) => {
                const g = godzinaZamkniecia(d.karta);
                const late = pozneZamkniecie(d.karta);
                return (
                  <span
                    key={d.date}
                    className={`flex flex-col items-center gap-0.5 rounded-lg py-2 text-[12px] ${
                      d.przyszly
                        ? "bg-[#F6F5F1] text-[#B7B6AE]"
                        : g
                        ? late
                          ? "bg-[#FDF0D8] text-[#8A5300]"
                          : "bg-[#E2F3E9] text-[#1F7A4A]"
                        : "bg-[#FFF3EF] text-[#DE3A22]"
                    }`}
                    data-kropka-dnia={d.date}
                  >
                    <b>{dnTxt(d.date)}</b>
                    <span className="tabular-nums">{g || (d.przyszly ? "—" : d.dzis ? "otwarty" : "otwarty")}</span>
                  </span>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="font-['Archivo'] font-extrabold text-[22px] tabular-nums">
                  {liczone.filter((d) => d.zamkniety).length}
                  <small className="text-[14px] text-[#6E6E66]">/{liczone.length}</small>
                </div>
                <div className={podpowiedzCls}>dni zamkniętych</div>
              </div>
              <div>
                <div className="font-['Archivo'] font-extrabold text-[22px] tabular-nums">
                  {wpisyZ}
                  <small className="text-[14px] text-[#6E6E66]">/{wpisyR}</small>
                </div>
                <div className={podpowiedzCls}>wpisów dnia w tygodniu</div>
              </div>
              <div>
                <div className="font-['Archivo'] font-extrabold text-[22px] tabular-nums">{suma(sygn, (s) => s.poprawki)}</div>
                <div className={podpowiedzCls}>poprawek po zamknięciu</div>
              </div>
              <div>
                <div className="font-['Archivo'] font-extrabold text-[22px] tabular-nums">{suma(sygn, (s) => s.zdarzenia)}</div>
                <div className={podpowiedzCls}>zdarzeń</div>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr] items-start">
        <Panel id="feed" tytul="Co się działo w tygodniu" prawo={feed.length}>
          <div className="flex gap-1.5 overflow-x-auto px-4 md:px-[18px] pt-3 [scrollbar-width:none]">
            <Chip wlaczony={filtr === "all"} onClick={() => setFiltr("all")}>
              Wszystko
            </Chip>
            {TYPY_ZDARZEN_TYGODNIA.filter((t) => feed.some((f) => f.typ === t.key)).map((t) => (
              <Chip key={t.key} wlaczony={filtr === t.key} onClick={() => setFiltr(t.key)} data-filtr-feed={t.key}>
                {t.label}
              </Chip>
            ))}
          </div>
          <div className="px-4 md:px-[18px] py-3 flex flex-col gap-2">
            {widoczneFeed.length === 0 && <p className={`${podpowiedzCls} m-0`}>Nic do pokazania.</p>}
            {widoczneFeed.map((f, i) => (
              <React.Fragment key={i}>
                {(i === 0 || widoczneFeed[i - 1].date !== f.date) && (
                  <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#6E6E66] pt-1">{dzienTxt(f.date)}</div>
                )}
                <div className="text-[14px]" data-wpis-feed={f.typ}>
                  <b>{f.tytul}</b>
                  {f.kto ? <span className="text-[#6E6E66]"> · {f.kto}</span> : null}
                  <div className="text-[13px]">{f.opis}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </Panel>
        <Panel id="ludzie" ikona={Users} tytul="Ludzie w tygodniu" prawo="grafik vs fakt">
          <div className="grid grid-cols-[1fr_60px_60px_70px] gap-2 px-4 md:px-[18px] py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#6E6E66] border-b-[1.5px] border-[#DEDCD4]">
            <span>Osoba</span>
            <span className="text-right">Grafik</span>
            <span className="text-right">Fakt</span>
            <span className="text-right">Różnica</span>
          </div>
          {ludzie.length === 0 && <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>Nikt nie pracował w tym tygodniu.</p>}
          {ludzie.map((o) => {
            const r = o.fakt - o.plan;
            return (
              <div key={o.name} className="grid grid-cols-[1fr_60px_60px_70px] gap-2 items-center px-4 md:px-[18px] py-2 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 text-[14px] tabular-nums" data-osoba-tygodnia={o.name}>
                <span className="min-w-0">
                  <b>{o.name}</b> {o.spoznienia > 0 && <MiniTag ton="warn">{o.spoznienia}× spóźnienie</MiniTag>}
                </span>
                <span className="text-right">{f1(o.plan)}</span>
                <span className="text-right">{f1(o.fakt)}</span>
                <span className={`text-right ${Math.abs(r) >= 5 ? "text-[#DE3A22] font-bold" : ""}`}>{Math.abs(r) < 0.3 ? "≈" : znak(r, "h")}</span>
              </div>
            );
          })}
        </Panel>
      </div>

      <Panel id="historia" tytul="Poprzednie tygodnie">
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr] gap-2 px-4 md:px-[18px] py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#6E6E66] border-b-[1.5px] border-[#DEDCD4]">
              <span>Tydzień</span>
              <span>Utarg</span>
              <span>Koszt %</span>
              <span>Godziny</span>
              <span>Zamknięte</span>
            </div>
            {historia.map(({ od, r, razem }) => (
              <button
                key={od}
                type="button"
                onClick={() => setData(od)}
                className="w-full text-left grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr] gap-2 px-4 md:px-[18px] py-2.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 text-[14px] tabular-nums hover:bg-[#F6F5F1]"
              >
                <b>{zakresTxt(od)}</b>
                <span>{r.dniZUtargiem ? zl(r.obrot) : "—"}</span>
                <span>{r.lcPct != null ? pctTxt(r.lcPct) : "—"}</span>
                <span>{f1(r.godziny)}</span>
                <span>
                  {r.dniZamkniete}/{razem}
                </span>
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className={`${kartaCls} px-4 md:px-[18px] py-3`}>
        <button type="button" className="inline-flex items-center gap-2 text-[14px] font-bold" onClick={() => setPokazPogode((v) => !v)}>
          <Cloud size={16} /> {pokazPogode ? "Ukryj trafność prognozy pogody" : "Ile warta jest prognoza pogody?"}
        </button>
        {pokazPogode && (
          <div className="mt-3 overflow-x-auto">
            {trafnosc.length === 0 ? (
              <p className={`${podpowiedzCls} m-0`}>{miasto ? "Za mało danych z ostatnich 90 dni." : "Lokal nie ma ustawionego miasta (Ustawienia → Lokale)."}</p>
            ) : (
              <table className="w-full text-[13px] min-w-[420px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#6E6E66]">
                    <th className="pb-1.5">Wyprzedzenie</th>
                    <th className="pb-1.5">Błąd temp.</th>
                    <th className="pb-1.5">Deszcz trafiony</th>
                    <th className="pb-1.5">Fałszywy alarm</th>
                  </tr>
                </thead>
                <tbody>
                  {trafnosc.map((tr) => (
                    <tr key={tr.horyzont} className="border-t border-[#DEDCD4]">
                      <td className="py-1.5 font-bold">{tr.horyzont} dni</td>
                      <td>{tr.bladTemp != null ? `${tr.bladTemp} °C` : "—"}</td>
                      <td>{tr.deszczTrafiony != null ? `${tr.deszczTrafiony}%` : "—"}</td>
                      <td>{tr.falszywyAlarm != null ? `${tr.falszywyAlarm}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={`${podpowiedzCls} mt-2`}>Ostatnie 90 dni{miasto ? `, ${miasto}` : ""}. Im dalej, tym mniej sensu ma układanie obsady „bo zapowiadali deszcz”.</p>
          </div>
        )}
      </div>
    </div>
  );
}
