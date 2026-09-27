// @ts-nocheck
// Karta jednego dnia — zamknięcie dnia przez kierownika. Układ z makiety
// właściciela (0.57.0, PulseCard / PulseClosed / PulseMobile).
//
// Zamknięcie ma zająć ~90 sekund, więc karta to TRZY KROKI: (1) utarg i
// paragony, (2) wpisy dnia wpisywane w wierszu — bez okienka na każdą lodówkę,
// (3) notatka dla następnej zmiany i tagi. Zdarzenia stoją osobno, z boku, i
// nie blokują zamknięcia. Nad krokami cztery liczby, których NIE trzeba
// wpisywać (utarg vs plan, koszt pracy %, godziny vs plan, zadania · pogoda).
//
// ⚠️ Utarg, paragony, notatka i tagi zapisują się SAME (po opuszczeniu pola /
// kliknięciu tagu) — przycisku "Zapisz" nie ma. Zapisy idą KOLEJKĄ
// (`kolejka`), bo pierwszy zapis zakłada kartę, a dwa równoległe założyłyby
// dwie (unikalność `(lokal, date)` odrzuciłaby drugi).
// ⚠️ "Zamknij dzień" wymaga utargu (może być 0) i pyta drugi raz — po
// zamknięciu danych nie da się edytować, tylko poprawić (`poprawZamknietyDzien`,
// ślad w day_log_entries). Zamkniętego dnia nie otwieramy z powrotem.
// ⚠️ Wpis HACCP poprawia się NOWYM wierszem z powodem (`poprawWpis`) — także
// w dniu zamkniętym.
//
// Dane i ich odświeżanie należą do Puls.tsx. Tutaj rysowanie i zapisy.
import React, { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Check,
  AlertTriangle,
  Plus,
  Thermometer,
  Truck,
  Sparkles,
  FileText,
  Flag,
  Users,
  History,
  Coins,
  ListChecks,
  Pencil,
} from "lucide-react";
import { describeWeatherCode } from "../../utils/weather";
import {
  autoPodsumowanie,
  znajdzKarte,
  wpisyDlaDnia,
  szablonyNaDzien,
  polaSzablonu,
  opisNormy,
  pozaNorma,
  sredniCzek,
  labourCostPct,
  prognozaUtargu,
  zapiszKarte,
  zamknijDzien,
  zapiszWpis,
  poprawWpis,
  prognozaNaDzien,
  wartoscPola,
  opisPoprawki,
  przesun,
  PORY,
  POWODY_UTARGU,
  POLA_KOREKTY,
  KATEGORIE_ZDARZENIA,
  korektyDnia,
  poprawZamknietyDzien,
  zespolDnia,
  czyZdarzenie,
  listaTagow,
  tagiTekst,
  TAGI_PODPOWIEDZI,
} from "../../utils/dziennik";
import { kontekstDnia, kontekstKrotko } from "../../utils/kalendarz";
import { celDnia, zapiszNadpisanieDnia } from "../../utils/budzet";
import { czyWpisZadania, zadanieWpisu, polaZadania } from "../../utils/tasks";
import { pozaNormaPola } from "../../utils/pola";
import { maZadanieZe } from "../../utils/mojeZadania";
import ZdarzenieModal from "./ZdarzenieModal";
import ModalWpisu from "./ModalWpisu";
import SladPoprawki from "./SladPoprawki";
import {
  inputCls,
  podpowiedzCls,
  btnObrysCls,
  btnGlownyCls,
  btnMalyCls,
  btnMalyGlownyCls,
  btnDuchCls,
  linkCls,
  zl,
  f1,
  pctTxt,
  znak,
  liczbaZ,
  dzienTxt,
  godzTxt,
  Kafelek,
  Kafelki,
  Panel,
  Chip,
  MiniTag,
  Pole,
  PanelBoczny,
} from "./pulsWspolne";

const IKONA_TYPU = { temperatura: Thermometer, dostawa: Truck, sprzatanie: Sparkles };
const POWODY_POPRAWKI = ["pomyłka przy wpisie", "terminal doliczył później", "zwrot / storno", "inne"];
const PROG_ODCHYLENIA_PCT = 10;

export default function KartaDnia({
  currentUser, lokal, lokalRow, miasto, dzis,
  shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
  staffingRules, staffingRuleSets, grafikWyjatki,
  karty, wpisy: wszystkieWpisy, szablony: wszystkieSzablony, weatherForecasts,
  budzetCele, budzetDni, setBudzetDni,
  setKarty, setWpisy, odswiez, showMsg,
  zadaniaMoje, dodajDoMoich,
  data, setData,
}) {
  const [busy, setBusy] = useState(false);
  const [potwierdz, setPotwierdz] = useState(false);
  const [zdarzenie, setZdarzenie] = useState(false);
  const [korekta, setKorekta] = useState(null); // { pole, nowa, powod, chip }
  const [poprawkaWpisu, setPoprawkaWpisu] = useState(null); // { wpis, szablon: {nazwa, typ, klucz, pola} }
  const [wartosciWpisu, setWartosciWpisu] = useState({}); // { klucz_szablonu: { pole: wartosc } }
  const [planEdycja, setPlanEdycja] = useState(null); // { utarg, pct }
  const [nowyTag, setNowyTag] = useState("");

  const karta = znajdzKarte(karty, lokal, data);
  const zamkniety = !!karta && karta.status === "zamkniety";

  // Pola formularza trzymamy lokalnie — zapis idzie po opuszczeniu pola.
  const [form, setForm] = useState({});
  const kluczForm = `${lokal}|${data}`;
  const [kluczOstatni, setKluczOstatni] = useState(kluczForm);
  if (kluczOstatni !== kluczForm) {
    setKluczOstatni(kluczForm);
    setForm({});
    setWartosciWpisu({});
    setPotwierdz(false);
    setPlanEdycja(null);
  }
  const pole = (k) => (form[k] !== undefined ? form[k] : karta && karta[k] != null ? String(karta[k]) : "");
  const ustaw = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Kolejka zapisów karty — patrz nagłówek pliku.
  const kartaRef = useRef(karta);
  const kartyRef = useRef(karty);
  kartyRef.current = karty;
  if (!kartaRef.current || (karta && kartaRef.current.id === karta.id) || kartaRef.current.date !== data || kartaRef.current.lokal !== lokal)
    kartaRef.current = karta;
  const kolejka = useRef(Promise.resolve());

  const auto = useMemo(
    () =>
      autoPodsumowanie({
        shifts, planShifts, users, lokalRow, tasks, taskBlocks, taskCompletions,
        staffingRules, staffingRuleSets, grafikWyjatki, lokal, dateStr: data,
      }),
    [shifts, planShifts, users, lokalRow, tasks, taskBlocks, taskCompletions, staffingRules, staffingRuleSets, grafikWyjatki, lokal, data]
  );
  const zespol = useMemo(() => zespolDnia({ shifts, planShifts, lokal, dateStr: data }), [shifts, planShifts, lokal, data]);

  const fakt = prognozaNaDzien(weatherForecasts, miasto, data, 0);
  const pogodaTydzien = prognozaNaDzien(weatherForecasts, miasto, przesun(data, -7), 0);
  const szablony = szablonyNaDzien(wszystkieSzablony, lokal, data);
  const wpisy = wpisyDlaDnia(wszystkieWpisy, lokal, data);
  const wpisDlaSzablonu = (klucz) => wpisy.find((w) => w.template_key === klucz);
  const wpisyZadan = wpisy.filter((w) => czyWpisZadania(w));
  const zdarzenia = wpisy.filter(czyZdarzenie);
  const korekty = korektyDnia(wszystkieWpisy, lokal, data);

  // ⚠️ DWIE różne liczby: `cel.utarg` to plan wpisany w Grafiku (decyzja),
  // `prognoza` to średnia z czterech takich dni tygodnia (obserwacja).
  // Odniesieniem utargu jest plan; gdy go nie ma — "zwykle".
  const cel = celDnia({ cele: budzetCele, budzetDni }, lokal, data);
  const celPct = cel && cel.pct != null ? cel.pct : null;
  const prognoza = prognozaUtargu(karty, lokal, data);
  const odniesienie = cel && cel.utarg != null ? { kwota: cel.utarg, nazwa: "plan" } : prognoza ? { kwota: prognoza.kwota, nazwa: "zwykle" } : null;

  const obrot = liczbaZ(pole("obrot"));
  const paragony = liczbaZ(pole("liczba_paragonow"));
  const czek = sredniCzek(obrot, paragony);
  const lcPct = labourCostPct(auto.koszt, obrot);
  const odchylenie = obrot != null && odniesienie && odniesienie.kwota ? ((obrot - odniesienie.kwota) / odniesienie.kwota) * 100 : null;
  const tagi = listaTagow(pole("tagi"));

  const polaDoZapisu = () => ({
    obrot: liczbaZ(pole("obrot")),
    liczba_paragonow: liczbaZ(pole("liczba_paragonow")),
    obrot_powod: pole("obrot_powod") || null,
    obrot_komentarz: pole("obrot_komentarz") || null,
    handover: pole("handover") || null,
    tagi: pole("tagi") || null,
    // Migawka pogody: raport sprzed pół roku ma pokazywać to, co było wtedy.
    pogoda_temp: fakt ? fakt.temp_max : karta ? karta.pogoda_temp : null,
    pogoda_kod: fakt ? fakt.kod : karta ? karta.pogoda_kod : null,
  });

  const zapiszWKolejce = (zmiany) => {
    kolejka.current = kolejka.current
      .then(async () => {
        const zapisana = await zapiszKarte({
          karta: kartaRef.current,
          lokal,
          dateStr: data,
          pola: {
            ...zmiany,
            pogoda_temp: fakt ? fakt.temp_max : kartaRef.current ? kartaRef.current.pogoda_temp : null,
            pogoda_kod: fakt ? fakt.kod : kartaRef.current ? kartaRef.current.pogoda_kod : null,
          },
          dayLogs: kartyRef.current,
          setDayLogs: (lista) => {
            kartyRef.current = lista;
            setKarty(lista);
          },
        });
        kartaRef.current = zapisana;
      })
      .catch((e) => showMsg(e.message || "Błąd zapisu karty dnia", "error"));
    return kolejka.current;
  };

  const NUMERYCZNE = ["obrot", "liczba_paragonow"];
  const zapiszPole = (k, wartosc) => {
    if (zamkniety) return;
    const v = wartosc !== undefined ? wartosc : pole(k);
    const nowa = NUMERYCZNE.includes(k) ? liczbaZ(v) : v || null;
    const stara = karta ? karta[k] ?? null : null;
    if (String(nowa ?? "") === String(stara ?? "")) return;
    zapiszWKolejce({ [k]: nowa });
  };

  const zamknij = async () => {
    setBusy(true);
    try {
      await kolejka.current;
      await zamknijDzien({
        karta: kartaRef.current,
        lokal,
        dateStr: data,
        pola: polaDoZapisu(),
        kto: currentUser.name,
        dayLogs: kartyRef.current,
        setDayLogs: setKarty,
      });
      await odswiez();
      setForm({});
      setPotwierdz(false);
      showMsg("Dzień zamknięty", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zamknięcia dnia", "error");
    }
    setBusy(false);
  };

  // --- plan dnia (grafik_budzet_dni — ta sama tabela co w Grafiku) --------
  const zapiszPlan = async () => {
    const baza = cel ? cel.baza : { utarg: null, pct: null };
    const u = liczbaZ(planEdycja.utarg);
    const p = liczbaZ(planEdycja.pct);
    // Wartość równa tej z zestawu nie jest nadpisaniem.
    const rowna = (a, b) => a != null && b != null && Math.abs(a - b) < 0.0001;
    setBusy(true);
    try {
      await zapiszNadpisanieDnia({
        lokal,
        dateStr: data,
        oczekiwany_utarg: rowna(u, baza.utarg) ? null : u,
        cel_koszt_pct: rowna(p, baza.pct) ? null : p,
        autor: currentUser?.name,
        budzetDni,
        setBudzetDni,
      });
      setPlanEdycja(null);
    } catch (err) {
      showMsg(`Błąd zapisu planu dnia: ${err.message || "nieznany błąd"}`, "error");
    }
    setBusy(false);
  };

  // --- wpisy -----------------------------------------------------------
  const dodajWpis = async (typ, templateKey, payload) => {
    setBusy(true);
    try {
      const w = await zapiszWpis({
        lokal, dateStr: data, karta: kartaRef.current, typ, templateKey, payload,
        kto: currentUser.name, entries: wszystkieWpisy, setEntries: setWpisy,
      });
      await odswiez();
      return w;
    } catch (e) {
      showMsg(e.message || "Błąd zapisu wpisu", "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const brakujacePola = (s) =>
    polaSzablonu(s).filter((p) => p.typ !== "bool" && !String((wartosciWpisu[s.klucz] || {})[p.klucz] ?? "").trim());

  const zapiszWpisInline = async (s) => {
    if (brakujacePola(s).length) return;
    const wart = wartosciWpisu[s.klucz] || {};
    const payload = {};
    polaSzablonu(s).forEach((p) => {
      const v = wart[p.klucz];
      payload[p.klucz] = p.typ === "bool" ? v === true : p.typ === "number" ? String(v).replace(",", ".").trim() : v;
    });
    const w = await dodajWpis(s.typ, s.klucz, payload);
    if (w) setWartosciWpisu((x) => ({ ...x, [s.klucz]: {} }));
  };

  const zapiszPoprawkeWpisu = async (typ, klucz, payload, powod) => {
    setBusy(true);
    try {
      await poprawWpis({ stary: poprawkaWpisu.wpis, payload, powod, kto: currentUser.name, entries: wszystkieWpisy, setEntries: setWpisy });
      await odswiez();
      setPoprawkaWpisu(null);
      showMsg("Poprawka zapisana — stara wartość została w dzienniku.", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu poprawki", "error");
    }
    setBusy(false);
  };

  const doMoich = async (tytul, zrodloId, zrodloOpis) => {
    setBusy(true);
    try {
      await dodajDoMoich({ tytul, lokal, zrodloId, zrodloOpis });
      showMsg("Dodano do Moich zadań", "success");
    } catch (e) {
      showMsg(e.message || "Nie udało się dodać zadania.", "error");
    }
    setBusy(false);
  };

  const zapiszKorekte = async () => {
    const def = POLA_KOREKTY.find((p) => p.klucz === korekta.pole) || POLA_KOREKTY[0];
    const powod = [korekta.chip, korekta.powod.trim()].filter(Boolean).join(" — ");
    setBusy(true);
    try {
      await poprawZamknietyDzien({
        karta,
        pole: korekta.pole,
        nowaWartosc: def.typ === "number" ? liczbaZ(korekta.nowa) : korekta.nowa,
        powod,
        kto: currentUser.name,
        dayLogs: karty,
        setDayLogs: setKarty,
        entries: wszystkieWpisy,
        setEntries: setWpisy,
      });
      await odswiez();
      setKorekta(null);
      showMsg("Poprawka zapisana — oryginał został w historii.", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu poprawki", "error");
    }
    setBusy(false);
  };

  // --- wspólne: nawigacja dnia i kafelki -------------------------------
  const kontekst = kontekstKrotko(kontekstDnia(data, { dzienWyplaty: lokalRow && lokalRow.dzien_wyplaty }));
  const pogoda = fakt ? describeWeatherCode(fakt.kod) : null;

  const nawigacja = (
    <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3">
      <div className="flex items-center gap-1 flex-1 md:flex-none">
        <button type="button" className="w-10 h-10 rounded-lg grid place-items-center hover:bg-[#ECEBE6]" onClick={() => setData(przesun(data, -1))} aria-label="Poprzedni dzień">
          <ChevronLeft size={18} />
        </button>
        <span className="flex-1 md:flex-none md:min-w-[150px] text-center font-['Archivo'] font-extrabold text-[16px]" data-dzien-karty>
          {dzienTxt(data)}
          {data === dzis ? " · dziś" : ""}
        </span>
        <button
          type="button"
          className="w-10 h-10 rounded-lg grid place-items-center hover:bg-[#ECEBE6] disabled:opacity-30"
          disabled={data >= dzis}
          onClick={() => setData(przesun(data, 1))}
          aria-label="Następny dzień"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      {zamkniety ? (
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#E2F3E9] text-[#1F7A4A] text-[13px] font-bold" data-status-karty="zamkniety">
          <Lock size={13} /> Zamknięty {godzTxt(karta.closed_at)} · {karta.closed_by}
        </span>
      ) : (
        <span className="inline-flex items-center h-8 px-3 rounded-full bg-[#FDF0D8] text-[#8A5300] text-[13px] font-bold" data-status-karty="otwarty">
          Otwarty{data === dzis ? " · zamknij do 23:59" : " · do zamknięcia"}
        </span>
      )}
      {kontekst && <span className="text-[13px] font-bold text-[#8A3A2B]">{kontekst}</span>}
    </div>
  );

  const kafelki = (
    <Kafelki>
      <Kafelek
        id="utarg"
        etykieta="Utarg"
        duza={obrot != null ? zl(obrot) : "—"}
        pod={
          odniesienie
            ? `${odniesienie.nazwa} ${zl(odniesienie.kwota)}${odchylenie != null ? ` · ${znak(odchylenie, "%")}` : ""}`
            : "brak planu w Grafiku"
        }
      />
      <Kafelek
        id="koszt"
        etykieta="Koszt pracy · % utargu"
        duza={lcPct != null ? pctTxt(lcPct) : zl(auto.koszt)}
        ton={lcPct != null && lcPct > (celPct != null ? celPct : 35) ? "warn" : null}
        pod={
          auto.bezStawki.length
            ? `bez danych o wynagrodzeniu: ${auto.bezStawki.join(", ")}`
            : lcPct != null
            ? `${zl(auto.koszt)} · cel ${celPct != null ? pctTxt(celPct) : "25–35%"}`
            : "wpisz utarg, policzę %"
        }
      />
      <Kafelek
        id="godziny"
        etykieta="Godziny"
        duza={f1(auto.godzinyFakt)}
        maly=" h"
        pod={`${auto.godzinyPlan ? `plan ${f1(auto.godzinyPlan)} h · ${znak(auto.godzinyFakt - auto.godzinyPlan, "h")}` : "brak grafiku"} · ${auto.osoby.length} os.`}
      />
      <Kafelek
        id="zadania"
        etykieta="Zadania · pogoda"
        duza={auto.zadaniaZrobione}
        maly={`/${auto.zadaniaRazem}`}
        pod={
          fakt && fakt.temp_max != null
            ? `${pogoda ? pogoda.icon + " " : ""}${Math.round(fakt.temp_max)}°${
                pogodaTydzien && pogodaTydzien.temp_max != null ? ` · tydzień temu ${Math.round(pogodaTydzien.temp_max)}°` : ""
              }`
            : auto.otwarcie
            ? `otwarcie ${auto.otwarcie}${auto.zamkniecie ? ` · zamknięcie ${auto.zamkniecie}` : ""}`
            : miasto
            ? "brak pogody"
            : "brak miasta lokalu"
        }
      />
    </Kafelki>
  );

  // --- wiersz wpisu ----------------------------------------------------
  const wierszWpisu = (s) => {
    const wpis = wpisDlaSzablonu(s.klucz);
    const pola = polaSzablonu(s);
    const alarm = wpis && pozaNorma(s, wpis.payload);
    const Ikona = IKONA_TYPU[s.typ] || FileText;
    const poprawka = wpis ? opisPoprawki(wpis, wszystkieWpisy, pola) : null;
    const wart = wartosciWpisu[s.klucz] || {};
    const juzWMoich = wpis && maZadanieZe(zadaniaMoje, [], wpis.id);
    return (
      <div
        key={s.id || s.klucz}
        className={`grid grid-cols-[32px_1fr] md:grid-cols-[32px_minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2 items-center px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] ${
          alarm ? "bg-[#FFF3EF]" : ""
        }`}
        data-wpis-dnia={s.klucz}
        data-stan={wpis ? (alarm ? "poza" : "ok") : "pusty"}
      >
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${wpis ? (alarm ? "bg-[#FAEAE6] text-[#DE3A22]" : "bg-[#E2F3E9] text-[#1F7A4A]") : "bg-[#ECEBE6]"}`}>
          <Ikona size={16} />
        </span>
        <div className="min-w-0">
          <b className="block text-[15px]">{s.nazwa}</b>
          <span className="block text-[12px] text-[#6E6E66]">
            {pola.map((p) => [p.label !== s.nazwa ? p.label : "", opisNormy(p) ? `norma ${opisNormy(p)}` : ""].filter(Boolean).join(" ")).filter(Boolean).join(" · ") || "wpis dnia"}
          </span>
        </div>
        {wpis ? (
          <>
            <div className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-2 md:justify-end">
              <b className={`font-['Archivo'] text-[16px] tabular-nums ${alarm ? "text-[#DE3A22]" : ""}`}>
                {pola.map((p) => wartoscPola(p, wpis.payload)).join(" / ")}
              </b>
              {alarm && (
                <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#DE3A22]">
                  <AlertTriangle size={13} /> poza normą
                </span>
              )}
              <span className="text-[12px] text-[#6E6E66]">
                {wpis.recorded_by} · {godzTxt(wpis.recorded_at || wpis.created_at)}
              </span>
              {poprawka && <SladPoprawki opis={poprawka} />}
            </div>
            <div className="col-start-2 md:col-start-auto flex gap-1.5 md:justify-end">
              {alarm && !juzWMoich && (
                <button
                  type="button"
                  className={btnMalyCls}
                  disabled={busy}
                  onClick={() =>
                    doMoich(
                      `${s.nazwa} · ${pola.map((p) => wartoscPola(p, wpis.payload)).join(" / ")} — sprawdzić`,
                      wpis.id,
                      `Pomiar poza normą · ${wpis.recorded_by || "?"} ${godzTxt(wpis.recorded_at || wpis.created_at)}`
                    )
                  }
                  data-do-zadan
                >
                  <Plus size={15} /> Do zadań
                </button>
              )}
              {alarm && juzWMoich && (
                <span className="text-[13px] font-bold text-[#1F7A4A] inline-flex items-center gap-1">
                  <Check size={13} /> w Moich zadaniach
                </span>
              )}
              <button
                type="button"
                className={btnDuchCls}
                disabled={busy}
                onClick={() => setPoprawkaWpisu({ wpis, szablon: { nazwa: s.nazwa, typ: s.typ, klucz: s.klucz, pola: s.pola } })}
              >
                Popraw
              </button>
            </div>
          </>
        ) : zamkniety ? (
          <span className="col-start-2 md:col-start-auto md:col-span-2 text-[13px] text-[#6E6E66] md:text-right">nie wpisano</span>
        ) : (
          <>
            <div className="col-start-2 md:col-start-auto flex flex-wrap items-center gap-2 md:justify-end">
              {pola.map((p) =>
                p.typ === "bool" ? (
                  <span key={p.klucz} className="flex items-center gap-1.5">
                    {pola.length > 1 && <span className="text-[12px] font-bold">{p.label}</span>}
                    {[
                      [true, "Tak"],
                      [false, "Nie"],
                    ].map(([v, l]) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setWartosciWpisu((x) => ({ ...x, [s.klucz]: { ...(x[s.klucz] || {}), [p.klucz]: v } }))}
                        className={`h-10 px-3 rounded-md border-[2px] font-bold text-[14px] ${
                          (wart[p.klucz] === true) === v ? "bg-[#171714] text-white border-[#171714]" : "bg-white border-[#171714]"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </span>
                ) : (
                  <span key={p.klucz} className={`relative inline-block ${p.typ === "number" ? "w-[124px]" : "w-[170px]"}`}>
                    <input
                      className={`${inputCls} h-10 md:h-10 tabular-nums ${p.jednostka ? "pr-10" : ""}`}
                      inputMode={p.typ === "number" ? "decimal" : "text"}
                      placeholder={p.typ === "number" ? opisNormy(p) || p.label : p.label}
                      aria-label={p.label}
                      value={wart[p.klucz] ?? ""}
                      onChange={(e) => setWartosciWpisu((x) => ({ ...x, [s.klucz]: { ...(x[s.klucz] || {}), [p.klucz]: e.target.value } }))}
                      onKeyDown={(e) => e.key === "Enter" && zapiszWpisInline(s)}
                      data-pole-wpisu={p.klucz}
                    />
                    {p.jednostka && (
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6E6E66] font-bold pointer-events-none text-[13px]">{p.jednostka}</span>
                    )}
                  </span>
                )
              )}
            </div>
            <div className="col-start-2 md:col-start-auto flex md:justify-end">
              <button
                type="button"
                className={btnMalyCls}
                disabled={busy || brakujacePola(s).length > 0}
                onClick={() => zapiszWpisInline(s)}
                aria-label={`Zapisz: ${s.nazwa}`}
                data-zapisz-wpis
              >
                <Check size={15} />
                {pola.every((p) => p.typ === "bool") ? "Zrobione" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const wierszZadania = (w) => {
    const zad = zadanieWpisu(w, tasks);
    const pola = zad ? polaZadania(zad, wszystkieSzablony) : [];
    const alarm = pozaNormaPola(pola, w.payload || {});
    const poprawka = opisPoprawki(w, wszystkieWpisy, pola);
    const juzWMoich = maZadanieZe(zadaniaMoje, [], w.id);
    return (
      <div key={w.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] ${alarm ? "bg-[#FFF3EF]" : ""}`}>
        <ListChecks size={16} className="text-[#6E6E66]" />
        <span className="font-bold text-[15px]">{zad ? zad.title : "Pomiar z zadania"}</span>
        <b className={`tabular-nums ${alarm ? "text-[#DE3A22]" : ""}`}>{pola.length ? pola.map((p) => wartoscPola(p, w.payload || {})).join(" · ") : "—"}</b>
        {alarm && <MiniTag ton="bad">poza normą</MiniTag>}
        <span className="text-[12px] text-[#6E6E66] ml-auto">
          {w.recorded_by || "?"} · {godzTxt(w.recorded_at || w.created_at)}
        </span>
        {alarm && !zamkniety && !juzWMoich && (
          <button
            type="button"
            className={btnMalyCls}
            disabled={busy}
            onClick={() => doMoich(`${zad ? zad.title : "Pomiar"} · ${pola.map((p) => wartoscPola(p, w.payload || {})).join(" / ")} — sprawdzić`, w.id, `Pomiar poza normą · ${w.recorded_by || "?"} ${godzTxt(w.recorded_at)}`)}
          >
            <Plus size={15} /> Do zadań
          </button>
        )}
        {poprawka && <SladPoprawki opis={poprawka} />}
      </div>
    );
  };

  const listaWpisow = (
    <>
      {!szablony.length && (
        <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>
          Ten lokal nie ma jeszcze zdefiniowanych wpisów — dodasz je w Konfiguracji (sześć typowych pozycji jednym kliknięciem).
        </p>
      )}
      {PORY.map((p) => {
        const lista = szablony.filter((s) => (s.pora || "ogolne") === p.key);
        if (!lista.length) return null;
        return (
          <div key={p.key}>
            <div className="px-4 md:px-[18px] pt-3 pb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[#6E6E66]">{p.label}</div>
            {lista.map(wierszWpisu)}
          </div>
        );
      })}
      {wpisyZadan.length > 0 && (
        <div>
          <div className="px-4 md:px-[18px] pt-3 pb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[#6E6E66]">Z checklisty</div>
          {wpisyZadan.map(wierszZadania)}
        </div>
      )}
    </>
  );

  const panelZdarzen = (
    <Panel id="zdarzenia" ikona={Flag} tytul="Zdarzenia dnia" prawo={zdarzenia.length}>
      {zdarzenia.length ? (
        zdarzenia.map((w) => {
          const pl = w.payload || {};
          const kat = (KATEGORIE_ZDARZENIA.find((k) => k.key === pl.kategoria) || {}).label || "Zdarzenie";
          return (
            <div key={w.id} className="flex gap-3 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-zdarzenie-dnia>
              <span className="w-8 h-8 rounded-lg bg-[#FDF0D8] text-[#8A5300] grid place-items-center flex-shrink-0">
                <Flag size={15} />
              </span>
              <div className="min-w-0 text-[14px]">
                <b>
                  {kat}
                  {pl.czas ? ` · ${pl.czas}` : ""}
                  {pl.miejsce ? ` · ${pl.miejsce}` : ""}
                </b>
                <div>{pl.opis || "(bez opisu)"}</div>
                {pl.dzialania && <div className="text-[13px] text-[#6E6E66]">Zrobiono: {pl.dzialania}</div>}
                {(pl.wplyw_kwota != null || pl.status === "eskalacja" || pl.wymaga_prowadzenia) && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {pl.wplyw_kwota != null && <MiniTag>skutek {zl(-Math.abs(pl.wplyw_kwota))}</MiniTag>}
                    {pl.status === "eskalacja" && <MiniTag ton="bad">do eskalacji</MiniTag>}
                    {pl.wymaga_prowadzenia && <MiniTag ton="warn">w toku</MiniTag>}
                  </div>
                )}
                <div className="text-[12px] text-[#6E6E66] mt-0.5">
                  {w.recorded_by} · {godzTxt(w.recorded_at)}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>
          Brak zdarzeń. Reklamacja, awaria, wypadek, kradzież — opisz osobno, nie w notatce.
        </p>
      )}
      {!zamkniety && (
        <div className="flex flex-wrap items-center gap-2.5 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4]">
          <button type="button" className={btnMalyCls} onClick={() => setZdarzenie(true)} data-zglos-zdarzenie>
            <Plus size={15} /> Zgłoś zdarzenie
          </button>
          <span className={podpowiedzCls}>nie blokuje zamknięcia</span>
        </div>
      )}
    </Panel>
  );

  const panelZespolu = (
    <Panel
      id="zespol"
      ikona={Users}
      tytul={data === dzis ? "Zespół dziś" : "Zespół tego dnia"}
      prawo={`${zespol.filter((z) => z.fakt).length} os. · ${f1(auto.godzinyFakt)} h`}
    >
      {zespol.length === 0 ? (
        <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>Nikt nie był w grafiku ani nie odbił zmiany.</p>
      ) : (
        zespol.map((z) => (
          <div key={z.name} className="flex items-start gap-3 px-4 md:px-[18px] py-2.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-osoba-dnia={z.name}>
            <div className="min-w-0 flex-1">
              <b className="block text-[15px]">{z.name}</b>
              <span className="block text-[12px] text-[#6E6E66]">
                {z.plan ? `grafik ${z.plan}` : "poza grafikiem"}
                {z.fakt ? ` · fakt ${z.fakt}` : ""}
              </span>
            </div>
            <div className="text-right">
              <b className="block tabular-nums">{z.fakt ? `${f1(z.godziny)} h` : "—"}</b>
              <small
                className={`block text-[12px] ${z.spoznienie || z.poGrafiku || z.bezOdbicia ? "text-[#8A5300] font-bold" : "text-[#6E6E66]"}`}
              >
                {z.bezOdbicia
                  ? "bez odbicia"
                  : [z.spoznienie ? `spóźnienie ${z.spoznienie} min` : "", z.poGrafiku ? `+${z.poGrafiku} min po grafiku` : ""].filter(Boolean).join(" · ") ||
                    (z.pozaGrafikiem ? "bez grafiku" : "zgodnie z grafikiem")}
              </small>
            </div>
          </div>
        ))
      )}
      <div className="px-4 md:px-[18px] py-2.5 border-t-[1.5px] border-[#DEDCD4] text-[12px] text-[#6E6E66]">
        Pracownik widzi tylko swoje dane. Pełny obraz zespołu — tylko kierownik.
      </div>
    </Panel>
  );

  const planTekst =
    cel && (cel.utarg != null || celPct != null)
      ? `Plan dnia: ${cel.utarg != null ? zl(cel.utarg) : "—"} · cel kosztu ${celPct != null ? pctTxt(celPct) : "—"}${
          cel.nadpisane && (cel.nadpisane.utarg || cel.nadpisane.pct) ? " (zmienione na ten dzień)" : ""
        }`
      : "Brak planu dnia — cel wpisuje się w Grafik → Konfiguracja → Budżet";

  // =====================================================================
  // DZIEŃ ZAMKNIĘTY — tylko odczyt + poprawka
  // =====================================================================
  if (zamkniety) {
    const poprawione = new Set(korekty.map((k) => k.payload?.pole));
    const wierszRo = (klucz, etykieta, wartosc, bezPoprawki) => (
      <div key={klucz} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-pole-ro={klucz}>
        <span className="text-[14px] text-[#6E6E66]">{etykieta}</span>
        <b className="text-right tabular-nums">
          {wartosc}
          {poprawione.has(klucz) && (
            <span className="ml-1.5 align-middle">
              <MiniTag ton="warn">poprawione</MiniTag>
            </span>
          )}
        </b>
        {bezPoprawki ? (
          <span />
        ) : (
          <button
            type="button"
            className={linkCls}
            onClick={() => setKorekta({ pole: klucz, nowa: karta[klucz] == null ? "" : String(karta[klucz]), powod: "", chip: "" })}
            data-poprawka={klucz}
          >
            Poprawka
          </button>
        )}
      </div>
    );
    const powodLabel = (POWODY_UTARGU.find((x) => x.key === karta.obrot_powod) || {}).label;
    return (
      <div className="flex flex-col" data-karta-dnia="zamknieta">
        {nawigacja}
        {kafelki}
        <div className="flex items-start gap-3 rounded-xl bg-[#F6F5F1] border-[2px] border-[#DEDCD4] px-4 py-3 my-4 text-[14px]" data-tylko-odczyt>
          <Lock size={17} className="mt-0.5 flex-shrink-0" />
          <span>
            <b>Tylko do odczytu.</b> Zamknięte przez {karta.closed_by} o {godzTxt(karta.closed_at)}. Zmiana = poprawka z powodem — oryginał zostaje w historii.
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <Panel id="utarg-ro" ikona={Coins} tytul="Utarg">
              {wierszRo("obrot", "Utarg brutto", karta.obrot != null ? zl(Number(karta.obrot)) : "—")}
              {wierszRo("liczba_paragonow", "Liczba paragonów", karta.liczba_paragonow ?? "—")}
              {wierszRo("sredni", "Średni paragon", czek != null ? `${String(czek).replace(".", ",")} zł` : "—", true)}
              {(karta.obrot_powod || karta.obrot_komentarz) && wierszRo("obrot_powod", "Powód odchylenia", powodLabel || "—")}
              {karta.obrot_komentarz && wierszRo("obrot_komentarz", "Komentarz do utargu", karta.obrot_komentarz)}
              <div className="px-4 md:px-[18px] py-2.5 border-t-[1.5px] border-[#DEDCD4] text-[12px] text-[#6E6E66]">{planTekst}</div>
            </Panel>
            <Panel id="wpisy-ro" ikona={Thermometer} tytul="Wpisy dnia" prawo={`${szablony.filter((s) => wpisDlaSzablonu(s.klucz)).length}/${szablony.length}`}>
              {listaWpisow}
            </Panel>
            <Panel id="notatka-ro" ikona={FileText} tytul="Notatka i tagi">
              {wierszRo("handover", "Dla następnej zmiany", karta.handover || "—")}
              {wierszRo("tagi", "Tagi dnia", tagi.length ? tagi.join(", ") : "—")}
              {karta.notatka && wierszRo("notatka", "Opis zdarzenia (stary zapis)", karta.notatka)}
            </Panel>
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <Panel id="poprawki" ikona={History} tytul="Poprawki" prawo={korekty.length}>
              {korekty.length ? (
                korekty.map((k) => (
                  <div key={k.id} className="flex gap-3 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 text-[14px]" data-korekta-dnia>
                    <History size={16} className="mt-0.5 flex-shrink-0 text-[#6E6E66]" />
                    <div className="min-w-0">
                      <b>
                        {k.payload?.label}: <s className="text-[#6E6E66] font-semibold">{String(k.payload?.stare ?? "—")}</s> → {String(k.payload?.nowe ?? "—")}
                      </b>
                      <div className="text-[13px] text-[#6E6E66]">
                        „{k.payload?.powod}” · {k.recorded_by} · {new Date(k.recorded_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>Brak poprawek — dane jak przy zamknięciu.</p>
              )}
            </Panel>
            {panelZdarzen}
            {panelZespolu}
          </div>
        </div>

        {korekta && (() => {
          const def = POLA_KOREKTY.find((p) => p.klucz === korekta.pole) || POLA_KOREKTY[0];
          const stare = karta[korekta.pole];
          const staryTekst =
            korekta.pole === "obrot" && stare != null
              ? zl(Number(stare))
              : korekta.pole === "obrot_powod"
              ? (POWODY_UTARGU.find((x) => x.key === stare) || {}).label || "—"
              : stare == null || stare === ""
              ? "—"
              : String(stare);
          const kompletny = String(korekta.nowa).trim() !== "" && (korekta.chip || korekta.powod.trim().length >= 3);
          return (
            <PanelBoczny
              id="poprawka"
              tytul="Wyślij poprawkę"
              podtytul={`${dzienTxt(data)} · dzień zamknięty`}
              onClose={() => setKorekta(null)}
              stopka={
                <>
                  <span className="flex-1" />
                  <button type="button" className={btnObrysCls} onClick={() => setKorekta(null)}>
                    Anuluj
                  </button>
                  <button type="button" className={btnGlownyCls} disabled={busy || !kompletny} onClick={zapiszKorekte} data-wyslij-poprawke>
                    <History size={17} /> Wyślij poprawkę
                  </button>
                </>
              }
            >
              <Pole etykieta="Co poprawiasz">
                <select
                  className={`${inputCls} font-semibold`}
                  value={korekta.pole}
                  onChange={(e) => setKorekta({ ...korekta, pole: e.target.value, nowa: karta[e.target.value] == null ? "" : String(karta[e.target.value]) })}
                >
                  {POLA_KOREKTY.filter((p) => p.klucz !== "notatka" || karta.notatka).map((p) => (
                    <option key={p.klucz} value={p.klucz}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Pole>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Pole etykieta="Było">
                  <div className="h-12 md:h-11 rounded-md border-[2px] border-[#DEDCD4] bg-[#F6F5F1] px-3 flex items-center text-[#6E6E66]">
                    <s>{staryTekst}</s>
                  </div>
                </Pole>
                <Pole etykieta="Powinno być">
                  {korekta.pole === "obrot_powod" ? (
                    <select className={`${inputCls} font-semibold`} value={korekta.nowa} onChange={(e) => setKorekta({ ...korekta, nowa: e.target.value })}>
                      <option value="">— wybierz —</option>
                      {POWODY_UTARGU.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={`${inputCls} ${def.typ === "number" ? "tabular-nums" : ""}`}
                      inputMode={def.typ === "number" ? "decimal" : "text"}
                      value={korekta.nowa}
                      onChange={(e) => setKorekta({ ...korekta, nowa: e.target.value })}
                      data-nowa-wartosc
                    />
                  )}
                </Pole>
              </div>
              <Pole etykieta="Powód · wymagany">
                <div className="flex gap-1.5 flex-wrap">
                  {POWODY_POPRAWKI.map((c) => (
                    <Chip key={c} wlaczony={korekta.chip === c} onClick={() => setKorekta({ ...korekta, chip: korekta.chip === c ? "" : c })} data-powod-poprawki={c}>
                      {c}
                    </Chip>
                  ))}
                </div>
                <input className={inputCls} placeholder="co konkretnie (opcjonalnie przy wybranym powodzie)" value={korekta.powod} onChange={(e) => setKorekta({ ...korekta, powod: e.target.value })} />
              </Pole>
              <div className="rounded-lg bg-[#F6F5F1] px-3.5 py-3 text-[13px] flex gap-2">
                <History size={15} className="mt-0.5 flex-shrink-0" />
                Oryginał zostaje w historii. Poprawka pojawi się przy dniu z Twoim imieniem, datą i powodem, a raporty przeliczą się od nowa.
              </div>
            </PanelBoczny>
          );
        })()}

        {poprawkaWpisu && (
          <ModalWpisu
            szablon={poprawkaWpisu.szablon}
            wartosciStartowe={{ ...(poprawkaWpisu.wpis.payload || {}) }}
            powodWymagany
            onClose={() => setPoprawkaWpisu(null)}
            onSave={zapiszPoprawkeWpisu}
          />
        )}
      </div>
    );
  }

  // =====================================================================
  // DZIEŃ OTWARTY — trzy kroki i zamknięcie
  // =====================================================================
  const wymaganeBrak = szablony.filter((s) => s.wymagany !== false && !wpisDlaSzablonu(s.klucz)).length;
  const brakuje = [obrot == null ? "utarg" : null, wymaganeBrak ? `${wymaganeBrak} ${wymaganeBrak === 1 ? "wpis" : wymaganeBrak < 5 ? "wpisy" : "wpisów"}` : null].filter(Boolean);
  const wpisyZrobione = szablony.filter((s) => wpisDlaSzablonu(s.klucz)).length;

  return (
    <div className="flex flex-col" data-karta-dnia="otwarta">
      {nawigacja}
      {kafelki}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start mt-4">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel id="krok-utarg" krok={1} zrobiony={obrot != null} tytul="Utarg" prawo="~20 s">
            <div className="px-4 md:px-[18px] py-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Pole etykieta="Utarg brutto" podpowiedz={odniesienie ? `${odniesienie.nazwa === "plan" ? "plan z Grafiku" : "zwykle w ten dzień"} ${zl(odniesienie.kwota)}` : "brak planu w Grafiku"}>
                  <div className="relative">
                    <input
                      className={`${inputCls} !h-14 !text-[22px] font-['Archivo'] font-extrabold tabular-nums pr-12`}
                      inputMode="decimal"
                      placeholder={odniesienie ? String(Math.round(odniesienie.kwota)) : "0"}
                      value={pole("obrot")}
                      onChange={(e) => ustaw("obrot", e.target.value)}
                      onBlur={() => zapiszPole("obrot")}
                      data-pole-karty="obrot"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E66] font-bold pointer-events-none">zł</span>
                  </div>
                </Pole>
                <Pole etykieta="Liczba paragonów" podpowiedz={czek != null ? `średni paragon ${String(czek).replace(".", ",")} zł` : "średni paragon policzę sam"}>
                  <input
                    className={`${inputCls} !h-14 !text-[22px] font-['Archivo'] font-extrabold tabular-nums`}
                    inputMode="numeric"
                    value={pole("liczba_paragonow")}
                    onChange={(e) => ustaw("liczba_paragonow", e.target.value)}
                    onBlur={() => zapiszPole("liczba_paragonow")}
                    data-pole-karty="liczba_paragonow"
                  />
                </Pole>
              </div>
              {obrot != null && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg bg-[#F6F5F1] px-3.5 py-2.5 text-[14px]" data-wyliczenie-utargu>
                  {odchylenie != null && (
                    <span>
                      vs {odniesienie.nazwa} <b className={odchylenie <= -PROG_ODCHYLENIA_PCT ? "text-[#DE3A22]" : ""}>{znak(odchylenie, "%")}</b>
                    </span>
                  )}
                  {lcPct != null && (
                    <span>
                      koszt pracy{" "}
                      <b className={lcPct > (celPct != null ? celPct : 35) ? "text-[#8A5300]" : "text-[#1F7A4A]"}>{pctTxt(lcPct)}</b>
                      {celPct != null ? ` (cel ${pctTxt(celPct)})` : ""}
                    </span>
                  )}
                  {celPct != null && (
                    <span>
                      zapas do celu <b>{zl((obrot * celPct) / 100 - auto.koszt)}</b>
                    </span>
                  )}
                </div>
              )}
              {odchylenie != null && Math.abs(odchylenie) >= PROG_ODCHYLENIA_PCT && (
                <Pole etykieta={`Dlaczego ${odchylenie < 0 ? "mniej" : "więcej"} niż ${odniesienie.nazwa}? · pomaga czytać liczby w Analityce`}>
                  <div className="flex gap-1.5 flex-wrap">
                    {POWODY_UTARGU.map((x) => (
                      <Chip
                        key={x.key}
                        wlaczony={pole("obrot_powod") === x.key}
                        onClick={() => {
                          const v = pole("obrot_powod") === x.key ? "" : x.key;
                          ustaw("obrot_powod", v);
                          zapiszPole("obrot_powod", v);
                        }}
                        data-powod-utargu={x.key}
                      >
                        {x.label}
                      </Chip>
                    ))}
                  </div>
                  <input
                    className={inputCls}
                    placeholder="co konkretnie się stało (opcjonalnie)"
                    value={pole("obrot_komentarz")}
                    onChange={(e) => ustaw("obrot_komentarz", e.target.value)}
                    onBlur={() => zapiszPole("obrot_komentarz")}
                  />
                </Pole>
              )}
              {planEdycja ? (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border-[2px] border-[#DEDCD4] px-3.5 py-3" data-plan-dnia>
                  <Pole etykieta="Plan utargu na ten dzień">
                    <input className={`${inputCls} w-[150px] tabular-nums`} inputMode="decimal" value={planEdycja.utarg} onChange={(e) => setPlanEdycja({ ...planEdycja, utarg: e.target.value })} />
                  </Pole>
                  <Pole etykieta="Cel kosztu pracy %">
                    <input className={`${inputCls} w-[110px] tabular-nums`} inputMode="decimal" value={planEdycja.pct} onChange={(e) => setPlanEdycja({ ...planEdycja, pct: e.target.value })} />
                  </Pole>
                  <button type="button" className={btnMalyGlownyCls} disabled={busy} onClick={zapiszPlan}>
                    <Check size={15} /> Zapisz
                  </button>
                  <button type="button" className={btnMalyCls} onClick={() => setPlanEdycja(null)}>
                    Anuluj
                  </button>
                  <span className={`${podpowiedzCls} w-full`}>Zmiana tylko na ten dzień — ta sama liczba co w siatce Grafiku (Wg budżetu).</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#6E6E66]">
                  <span>{planTekst}</span>
                  <button
                    type="button"
                    className={`${linkCls} !text-[13px] inline-flex items-center gap-1`}
                    onClick={() => setPlanEdycja({ utarg: cel && cel.utarg != null ? String(cel.utarg) : "", pct: celPct != null ? String(celPct) : "" })}
                  >
                    <Pencil size={12} /> Zmień na ten dzień
                  </button>
                </div>
              )}
            </div>
          </Panel>

          <Panel id="krok-wpisy" krok={2} zrobiony={szablony.length > 0 && wpisyZrobione === szablony.length} tytul="Wpisy dnia" prawo={`${wpisyZrobione}/${szablony.length} · zapisują się od razu`}>
            {listaWpisow}
          </Panel>

          <Panel id="krok-notatka" krok={3} zrobiony={!!pole("handover")} tytul="Notatka i tagi" prawo="opcjonalnie">
            <div className="px-4 md:px-[18px] py-4 flex flex-col gap-4">
              <Pole etykieta="Dla następnej zmiany">
                <textarea
                  className={`${inputCls} h-20 py-2`}
                  placeholder="Co jutrzejsza zmiana musi wiedzieć"
                  value={pole("handover")}
                  onChange={(e) => ustaw("handover", e.target.value)}
                  onBlur={() => zapiszPole("handover")}
                  data-pole-karty="handover"
                />
                {pole("handover") &&
                  (maZadanieZe(zadaniaMoje, [], `handover:${lokal}:${data}`) ? (
                    <span className="text-[13px] font-bold text-[#1F7A4A] inline-flex items-center gap-1">
                      <Check size={13} /> w Moich zadaniach
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`${linkCls} self-start inline-flex items-center gap-1`}
                      onClick={() => {
                        const t = pole("handover").trim();
                        doMoich(t.length > 90 ? `${t.slice(0, 87)}…` : t, `handover:${lokal}:${data}`, `Karta dnia ${data.slice(8, 10)}.${data.slice(5, 7)}`);
                      }}
                      data-notatka-do-zadan
                    >
                      <Plus size={14} /> Zrób z tego zadanie
                    </button>
                  ))}
              </Pole>
              <Pole etykieta="Tagi dnia · wyjaśniają liczby w Analityce">
                <div className="flex gap-1.5 flex-wrap">
                  {[...new Set([...TAGI_PODPOWIEDZI, ...tagi])].map((t) => (
                    <Chip
                      key={t}
                      wlaczony={tagi.includes(t)}
                      onClick={() => {
                        const v = tagiTekst(tagi.includes(t) ? tagi.filter((x) => x !== t) : [...tagi, t]);
                        ustaw("tagi", v);
                        zapiszPole("tagi", v);
                      }}
                      data-tag-dnia={t}
                    >
                      {t}
                    </Chip>
                  ))}
                  <input
                    className="h-[34px] w-[150px] rounded-full border-[1.5px] border-dashed border-[#B7B6AE] px-3 text-[13px]"
                    placeholder="+ własny tag"
                    value={nowyTag}
                    onChange={(e) => setNowyTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || !nowyTag.trim()) return;
                      const v = tagiTekst([...tagi, nowyTag.trim()]);
                      ustaw("tagi", v);
                      zapiszPole("tagi", v);
                      setNowyTag("");
                    }}
                  />
                </div>
              </Pole>
              {karta && karta.notatka && (
                <div className="text-[13px] text-[#6E6E66]">
                  <b className="text-[#171714]">Opis zdarzenia (stary zapis):</b> {karta.notatka}
                </div>
              )}
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          {panelZdarzen}
          {panelZespolu}
        </div>
      </div>

      <div
        className="sticky bottom-0 z-20 mt-4 -mx-4 md:mx-0 px-4 md:px-[18px] py-2.5 md:py-3 bg-white border-t-[2px] md:border-[2px] border-[#171714] md:rounded-xl flex items-center gap-2 md:gap-3 shadow-[0_-6px_20px_rgba(0,0,0,0.06)]"
        data-pasek-zamkniecia
      >
        <span className="flex-1 min-w-0 text-[13px] md:text-[14px] leading-[18px]">
          {brakuje.length ? (
            <>
              Do zamknięcia brakuje: <b>{brakuje.join(", ")}</b>
            </>
          ) : (
            <b>Wszystko wpisane · gotowe do zamknięcia</b>
          )}
          <small className={`${potwierdz ? "block" : "hidden md:block"} text-[12px] text-[#6E6E66]`}>
            {potwierdz ? "Po zamknięciu danych nie da się edytować — tylko wysłać poprawkę." : "Utarg, wpisy, notatka i tagi zapisują się na bieżąco."}
          </small>
        </span>
        {potwierdz ? (
          <>
            <button type="button" className={btnObrysCls} onClick={() => setPotwierdz(false)}>
              Wróć
            </button>
            <button type="button" className={btnGlownyCls} disabled={busy} onClick={zamknij} data-potwierdz-zamkniecie>
              <Lock size={16} /> Tak, zamknij
            </button>
          </>
        ) : (
          <button
            type="button"
            className={btnGlownyCls}
            disabled={busy || obrot == null}
            title={obrot == null ? "Najpierw utarg" : ""}
            onClick={() => setPotwierdz(true)}
            data-zamknij-dzien
          >
            <Lock size={16} /> Zamknij dzień
          </button>
        )}
      </div>

      {zdarzenie && (
        <ZdarzenieModal
          dateStr={data}
          osobyNaZmianie={auto.osoby}
          onClose={() => setZdarzenie(false)}
          onSave={async (typ, klucz, payload) => {
            const w = await dodajWpis(typ, klucz, payload);
            if (!w) return;
            setZdarzenie(false);
            // "Wymaga dalszego prowadzenia" = sprawa do Moich zadań.
            if (payload.wymaga_prowadzenia) {
              const kat = (KATEGORIE_ZDARZENIA.find((k) => k.key === payload.kategoria) || {}).label || "Zdarzenie";
              const opis = String(payload.opis || "").trim();
              await doMoich(`${kat}: ${opis.length > 70 ? `${opis.slice(0, 67)}…` : opis}`, w.id, `Zdarzenie ${data.slice(8, 10)}.${data.slice(5, 7)}`);
            } else showMsg("Zapisano zdarzenie", "success");
          }}
        />
      )}

      {poprawkaWpisu && (
        <ModalWpisu
          szablon={poprawkaWpisu.szablon}
          wartosciStartowe={{ ...(poprawkaWpisu.wpis.payload || {}) }}
          powodWymagany
          onClose={() => setPoprawkaWpisu(null)}
          onSave={zapiszPoprawkeWpisu}
        />
      )}
    </div>
  );
}
