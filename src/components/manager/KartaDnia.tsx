// @ts-nocheck
// Karta jednego dnia — zamknięcie dnia przez kierownika.
//
// Ekran jest tak ułożony, żeby dało się go domknąć w 60–90 sekund: najpierw
// pasek liczb, których NIE trzeba wpisywać, potem obok siebie dwa bloki tego,
// co trzeba — utarg i wpisy. Jeśli wypełnianie zacznie zajmować więcej, ludzie
// zaczną klikać karty wstecz i zmyślać, a analityka stanie na wymyślonych
// danych.
//
// Każdy blok zapisuje się osobno i BEZ zamykania dnia: kierownik wpisuje utarg
// rano, wpisy w ciągu dnia, a zamyka wieczorem. Zamknięcie to osobna decyzja —
// i da się ją cofnąć.
//
// Dane i ich odświeżanie należą do Puls.tsx. Tutaj tylko rysowanie i zapisy.
import React, { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Users,
  Save,
  Pencil,
  Cloud,
} from "lucide-react";
import {
  cardCls,
  statTileCls,
  statLabelCls,
  statValueCls,
  statSubCls,
  sectionCardCls,
  sectionHeaderCls,
  btnPrimaryCls,
  btnSecondaryCls,
  COLORS,
} from "./designTokens";
import { describeWeatherCode } from "../../utils/weather";
import { getDayOfWeek } from "../../utils/format";
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
  otworzPonownie,
  zapiszWpis,
  trafnoscPrognozy,
  prognozaNaDzien,
  wartoscPola,
  przesun,
  POWODY_UTARGU,
  POLA_KOREKTY,
  KATEGORIE_ZDARZENIA,
  korektyDnia,
  poprawZamknietyDzien,
} from "../../utils/dziennik";
import { kontekstDnia, kontekstKrotko } from "../../utils/kalendarz";
import ZdarzenieModal from "./ZdarzenieModal";

const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white disabled:bg-[#F1F1EE] disabled:text-[#6E6E66]";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";
const zl = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("pl-PL")} zł`);
const znak = (n, j = "") =>
  n == null ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 10) / 10)}${j}`;

export default function KartaDnia({
  currentUser, lokal, lokalRow, miasto, dzis,
  shifts, planShifts, users, tasks, taskCompletions,
  staffingRules, staffingRuleSets, grafikWyjatki,
  karty, wpisy: wszystkieWpisy, szablony: wszystkieSzablony, weatherForecasts,
  setKarty, setWpisy, odswiez, showMsg,
  data, setData,
}) {
  const [zapisuje, setZapisuje] = useState(false);
  const [pokazTrafnosc, setPokazTrafnosc] = useState(false);
  const [nowyWpis, setNowyWpis] = useState(null); // { szablon }
  const [zdarzenie, setZdarzenie] = useState(false);
  const [korekta, setKorekta] = useState(null); // { pole }

  const karta = znajdzKarte(karty, lokal, data);
  const zamkniety = karta && karta.status === "zamkniety";

  // Pola formularza trzymamy lokalnie, żeby wpisywanie nie strzelało zapisem
  // po każdej literze; do bazy idzie jedno kliknięcie.
  const [form, setForm] = useState({});
  const kluczForm = `${lokal}|${data}`;
  const [kluczOstatni, setKluczOstatni] = useState(kluczForm);
  if (kluczOstatni !== kluczForm) {
    setKluczOstatni(kluczForm);
    setForm({});
  }
  const pole = (k) =>
    form[k] !== undefined ? form[k] : karta && karta[k] != null ? karta[k] : "";
  const ustaw = (k, v) => setForm({ ...form, [k]: v });

  const auto = useMemo(
    () =>
      autoPodsumowanie({
        shifts, planShifts, users, tasks, taskCompletions,
        staffingRules, staffingRuleSets, grafikWyjatki,
        lokal, dateStr: data,
      }),
    [shifts, planShifts, users, tasks, taskCompletions, staffingRules, staffingRuleSets, grafikWyjatki, lokal, data]
  );

  const fakt = prognozaNaDzien(weatherForecasts, miasto, data, 0);
  const trafnosc = useMemo(
    () => trafnoscPrognozy(weatherForecasts, miasto, przesun(dzis, -90)),
    [weatherForecasts, miasto, dzis]
  );

  const szablony = szablonyNaDzien(wszystkieSzablony, lokal, data);
  const wpisy = wpisyDlaDnia(wszystkieWpisy, lokal, data);
  const wpisDlaSzablonu = (klucz) => wpisy.find((w) => w.template_key === klucz);

  const czek = sredniCzek(pole("obrot"), pole("liczba_paragonow"));
  const lcPct = labourCostPct(auto.koszt, pole("obrot"));
  const prognoza = prognozaUtargu(karty, lokal, data);
  const obrotLiczba = pole("obrot") === "" ? null : Number(pole("obrot"));

  const polaDoZapisu = () => ({
    obrot: pole("obrot") === "" ? null : Number(pole("obrot")),
    liczba_paragonow:
      pole("liczba_paragonow") === "" ? null : Number(pole("liczba_paragonow")),
    obrot_powod: pole("obrot_powod") || null,
    obrot_komentarz: pole("obrot_komentarz") || null,
    notatka: pole("notatka") || null,
    handover: pole("handover") || null,
    tagi: pole("tagi") || null,
    cos_nadzwyczajnego: pole("cos_nadzwyczajnego") === true,
    // Migawka pogody: raport sprzed pół roku ma pokazywać to, co było wtedy,
    // a nie to, co dziś zwróci API.
    pogoda_temp: fakt ? fakt.temp_max : karta ? karta.pogoda_temp : null,
    pogoda_kod: fakt ? fakt.kod : karta ? karta.pogoda_kod : null,
  });

  const zapisz = async (zamykamy) => {
    setZapisuje(true);
    try {
      const wspolne = {
        karta, lokal, dateStr: data, pola: polaDoZapisu(),
        dayLogs: karty, setDayLogs: setKarty,
      };
      if (zamykamy) await zamknijDzien({ ...wspolne, kto: currentUser.name });
      else await zapiszKarte(wspolne);
      await odswiez();
      setForm({});
      showMsg(zamykamy ? "Dzień zamknięty" : "Zapisano", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu karty dnia", "error");
    }
    setZapisuje(false);
  };

  const otworz = async () => {
    setZapisuje(true);
    try {
      await otworzPonownie({ karta, dayLogs: karty, setDayLogs: setKarty });
      await odswiez();
      showMsg("Dzień otwarty ponownie", "success");
    } catch (e) {
      showMsg(e.message || "Błąd", "error");
    }
    setZapisuje(false);
  };

  const dodajWpis = async (typ, templateKey, payload) => {
    try {
      await zapiszWpis({
        lokal, dateStr: data, karta, typ, templateKey, payload,
        kto: currentUser.name, entries: wszystkieWpisy, setEntries: setWpisy,
      });
      await odswiez();
      setNowyWpis(null);
      showMsg("Zapisano wpis", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu wpisu", "error");
    }
  };

  const kontekst = kontekstDnia(data, { dzienWyplaty: lokalRow && lokalRow.dzien_wyplaty });
  const kontekstTekst = kontekstKrotko(kontekst);
  const korekty = korektyDnia(wszystkieWpisy, lokal, data);
  const pogodaOpis = fakt ? describeWeatherCode(fakt.kod) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnSecondaryCls} onClick={() => setData(przesun(data, -1))}>
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-[180px]">
          <div className="font-['Archivo'] font-extrabold text-[17px]">
            {data.split("-").reverse().join(".")}
          </div>
          <div className="text-[12px] text-[#6E6E66]">
            {getDayOfWeek(new Date(data + "T00:00:00"))}
            {data === dzis && " · dziś"}
          </div>
        </div>
        <button
          className={btnSecondaryCls}
          disabled={data >= dzis}
          onClick={() => setData(przesun(data, 1))}
        >
          <ChevronRight size={16} />
        </button>
        <button className={btnSecondaryCls} onClick={() => setData(przesun(dzis, -1))}>
          Wczoraj
        </button>
        {zamkniety && (
          <div className="flex flex-wrap items-center gap-3 ml-auto text-[13px]">
            <span className="flex items-center gap-1.5">
              <Lock size={14} />
              Zamknięty przez {karta.closed_by} ·{" "}
              {new Date(karta.closed_at).toLocaleString("pl-PL")}
            </span>
            <button className={btnSecondaryCls} disabled={zapisuje} onClick={otworz}>
              Otwórz ponownie
            </button>
          </div>
        )}
      </div>

      {kontekstTekst && (
        <div className="text-[13px] text-[#6E6E66] -mt-1">
          <span className="font-bold text-[#171714]">{kontekstTekst}</span> — warto o tym
          pamiętać przy porównywaniu tego dnia z innymi.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <div className={statTileCls}>
          <div className={statLabelCls}>Godziny</div>
          <div className={statValueCls}>{auto.godzinyFakt}</div>
          <div
            className={statSubCls}
            style={{
              color:
                auto.godzinyPlan && Math.abs(auto.godzinyFakt - auto.godzinyPlan) >= 0.5
                  ? COLORS.accent
                  : COLORS.muted,
            }}
          >
            {auto.godzinyPlan
              ? `plan ${auto.godzinyPlan} · ${znak(auto.godzinyFakt - auto.godzinyPlan, " h")}`
              : "brak grafiku"}
            {` · ${auto.osoby.length} os.`}
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Koszt pracy</div>
          <div className={statValueCls}>{zl(auto.koszt)}</div>
          <div
            className={statSubCls}
            // Czerwone znaczy "przekroczyliśmy plan", a nie "planu nie ma" —
            // bez grafiku nie ma czego przekroczyć.
            style={{
              color:
                auto.kosztPlan && auto.koszt > auto.kosztPlan ? COLORS.accent : COLORS.muted,
            }}
          >
            {auto.bezStawki.length
              ? `bez stawki: ${auto.bezStawki.join(", ")}`
              : auto.kosztPlan
              ? `plan ${zl(auto.kosztPlan)} · ${znak(auto.koszt - auto.kosztPlan, " zł")}`
              : "brak grafiku"}
          </div>
        </div>
        {/* Kontrolę obsady świadomie tu usunięto: dla dnia, który już był, nie
            zmienia niczyjej decyzji. Jej miejsce zajmuje liczba, która zmienia. */}
        <div className={statTileCls}>
          <div className={statLabelCls}>Koszt pracy / utarg</div>
          <div
            className={statValueCls}
            style={{ color: lcPct != null && lcPct > 35 ? COLORS.accent : COLORS.ink }}
          >
            {lcPct != null ? `${lcPct}%` : "—"}
          </div>
          <div className={statSubCls}>
            {lcPct != null ? "zdrowy zakres 25–35%" : "wpisz utarg, policzę"}
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Zadania</div>
          <div className={statValueCls}>
            {auto.zadaniaZrobione}/{auto.zadaniaRazem}
          </div>
          <div className={statSubCls}>
            {auto.otwarcie ? `otwarcie ${auto.otwarcie}` : "nikt nie odbił"}
            {auto.zamkniecie ? ` · zamknięcie ${auto.zamkniecie}` : ""}
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Pogoda</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[20px]">{pogodaOpis ? pogodaOpis.icon : "—"}</span>
            <span className={statValueCls}>
              {fakt && fakt.temp_max != null ? `${Math.round(fakt.temp_max)}°` : "—"}
            </span>
          </div>
          {/* Horyzont 14 dni zbieramy dalej (cron), ale w karcie go nie ma:
              przy tej trafności to szum, a miejsce w kafelku jest drogie. */}
          <div className={statSubCls}>
            {[3, 7]
              .map((h) => {
                const pr = prognozaNaDzien(weatherForecasts, miasto, data, h);
                if (!pr || pr.temp_max == null || !fakt || fakt.temp_max == null) return null;
                return `${h} dni: ${znak(Number(pr.temp_max) - Number(fakt.temp_max), "°")}`;
              })
              .filter(Boolean)
              .join(" · ") || (miasto ? "brak prognoz" : "brak miasta")}
          </div>
          {trafnosc.length > 0 && (
            <button
              className="text-[12px] underline text-[#6E6E66] mt-1"
              onClick={() => setPokazTrafnosc(!pokazTrafnosc)}
            >
              {pokazTrafnosc ? "Ukryj trafność" : "Ile warta jest prognoza?"}
            </button>
          )}
        </div>
      </div>

      {pokazTrafnosc && trafnosc.length > 0 && (
        <div className={cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[420px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#8F8E86]">
                  <th className="pb-1.5">Wyprzedzenie</th>
                  <th className="pb-1.5">Błąd temp.</th>
                  <th className="pb-1.5">Deszcz trafiony</th>
                  <th className="pb-1.5">Fałszywy alarm</th>
                </tr>
              </thead>
              <tbody>
                {trafnosc.map((tr) => (
                  <tr key={tr.horyzont} className="border-t border-[#E7E7E2]">
                    <td className="py-1.5 font-bold">{tr.horyzont} dni</td>
                    <td>{tr.bladTemp != null ? `${tr.bladTemp} °C` : "—"}</td>
                    <td>{tr.deszczTrafiony != null ? `${tr.deszczTrafiony}%` : "—"}</td>
                    <td>{tr.falszywyAlarm != null ? `${tr.falszywyAlarm}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[#6E6E66] mt-2">
            Ostatnie 90 dni, {miasto}. Im dalej w prawo, tym mniej sensu ma układanie
            obsady „bo zapowiadali deszcz”.
          </p>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Utarg i notatki</span>
            {zamkniety ? (
              <button
                className="text-[13px] font-normal underline text-[#6E6E66]"
                onClick={() => setKorekta({ pole: "obrot" })}
              >
                <Pencil size={13} className="inline -mt-0.5 mr-1" />
                Popraw dane
              </button>
            ) : (
              <button
                className="text-[13px] font-normal underline text-[#6E6E66] disabled:opacity-40"
                disabled={zapisuje}
                onClick={() => zapisz(false)}
              >
                <Save size={13} className="inline -mt-0.5 mr-1" />
                Zapisz
              </button>
            )}
          </div>
          <div className="p-4 grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Utarg brutto (zł)</label>
              <input
                type="number"
                className={inputCls}
                disabled={zamkniety}
                value={pole("obrot")}
                onChange={(e) => ustaw("obrot", e.target.value)}
              />
              {prognoza && (
                <div
                  className="text-[12px] mt-1"
                  style={{
                    color:
                      obrotLiczba != null && obrotLiczba < prognoza.kwota
                        ? COLORS.accent
                        : COLORS.muted,
                  }}
                >
                  zwykle {zl(prognoza.kwota)}
                  {obrotLiczba != null && ` · ${znak(obrotLiczba - prognoza.kwota, " zł")}`}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Liczba paragonów</label>
              <input
                type="number"
                className={inputCls}
                disabled={zamkniety}
                value={pole("liczba_paragonow")}
                onChange={(e) => ustaw("liczba_paragonow", e.target.value)}
              />
              <div className="text-[12px] text-[#6E6E66] mt-1">
                {czek != null ? `średni paragon ${czek} zł` : "średni paragon policzy się sam"}
              </div>
            </div>
            {/* Powód pytamy zawsze, ale podpowiadamy dopiero przy odchyleniu —
                przy zwykłym dniu nie ma czego tłumaczyć i pole tylko przeszkadza. */}
            <div>
              <label className={labelCls}>Powód odchylenia</label>
              <select
                className={inputCls}
                disabled={zamkniety}
                value={pole("obrot_powod")}
                onChange={(e) => ustaw("obrot_powod", e.target.value)}
              >
                <option value="">— nie dotyczy —</option>
                {POWODY_UTARGU.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Komentarz do utargu</label>
              <input
                className={inputCls}
                disabled={zamkniety}
                placeholder="co konkretnie się stało"
                value={pole("obrot_komentarz")}
                onChange={(e) => ustaw("obrot_komentarz", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Notatka dla następnej zmiany</label>
              <textarea
                rows={2}
                className={inputCls}
                disabled={zamkniety}
                placeholder="Co następna zmiana musi wiedzieć"
                value={pole("handover")}
                onChange={(e) => ustaw("handover", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Tagi dnia</label>
              <input
                className={inputCls}
                disabled={zamkniety}
                placeholder="autobus turystów, awaria frytkownicy"
                value={pole("tagi")}
                onChange={(e) => ustaw("tagi", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  disabled={zamkniety}
                  checked={pole("cos_nadzwyczajnego") === true}
                  onChange={(e) => ustaw("cos_nadzwyczajnego", e.target.checked)}
                />
                wydarzyło się coś nadzwyczajnego
              </label>
              {pole("cos_nadzwyczajnego") === true && (
                <textarea
                  rows={2}
                  className={inputCls + " mt-2"}
                  disabled={zamkniety}
                  value={pole("notatka")}
                  onChange={(e) => ustaw("notatka", e.target.value)}
                />
              )}
            </div>
          </div>
        </div>

        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Wpisy dnia</span>
            <span className="text-[12px] font-normal text-[#6E6E66]">
              {szablony.filter((s) => wpisDlaSzablonu(s.klucz)).length}/{szablony.length} ·
              zapisują się osobno
            </span>
          </div>
          {!szablony.length && (
            <div className="p-4 text-[14px] text-[#6E6E66]">
              Ten lokal nie ma jeszcze zdefiniowanych wpisów. Dodasz je w Konfiguracji —
              sześć typowych pozycji wchodzi jednym kliknięciem.
            </div>
          )}
          {szablony.map((s) => {
            const wpis = wpisDlaSzablonu(s.klucz);
            const alarm = wpis && pozaNorma(s, wpis.payload);
            return (
              <div
                key={s.id}
                className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="font-['Archivo'] font-bold text-[15px]">{s.nazwa}</div>
                  <div className="text-[12px] text-[#6E6E66]">
                    {polaSzablonu(s)
                      .map((p) => [p.label, opisNormy(p)].filter(Boolean).join(" "))
                      .join(" · ")}
                  </div>
                </div>
                {wpis ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="font-['Archivo'] font-extrabold text-[17px]"
                      style={{ color: alarm ? COLORS.accent : COLORS.ink }}
                    >
                      {polaSzablonu(s)
                        .map((p) => wartoscPola(p, wpis.payload))
                        .join(" / ")}
                    </div>
                    {alarm ? (
                      <AlertTriangle size={18} color={COLORS.accent} />
                    ) : (
                      <CheckCircle2 size={18} color="#2C6A4F" />
                    )}
                    <div className="text-[11px] text-[#8F8E86] w-[92px]">
                      {wpis.recorded_by} ·{" "}
                      {new Date(wpis.recorded_at).toLocaleTimeString("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ) : (
                  <button
                    className={btnSecondaryCls}
                    disabled={zamkniety}
                    onClick={() => setNowyWpis({ szablon: s })}
                  >
                    <Plus size={14} className="inline mr-1" />
                    Wpisz
                  </button>
                )}
              </div>
            );
          })}
          <div className="p-4">
            <button
              className={btnSecondaryCls}
              disabled={zamkniety}
              onClick={() => setZdarzenie(true)}
            >
              <AlertTriangle size={14} className="inline mr-1" />
              Zgłoś zdarzenie
            </button>
          </div>
        </div>
      </div>

      {wpisy.filter((w) => !w.template_key).length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>Zdarzenia</div>
          {wpisy
            .filter((w) => !w.template_key)
            .map((w) => {
              const pl = w.payload || {};
              const kat = (KATEGORIE_ZDARZENIA.find((k) => k.key === pl.kategoria) || {}).label;
              return (
                <div
                  key={w.id}
                  className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {kat && (
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-[#F1F1EE] border border-[#B7B6AE] rounded px-2 py-0.5">
                        {kat}
                      </span>
                    )}
                    {pl.status === "eskalacja" && (
                      <span
                        className="text-[11px] font-bold uppercase tracking-wider rounded px-2 py-0.5 text-white"
                        style={{ backgroundColor: COLORS.accent }}
                      >
                        do eskalacji
                      </span>
                    )}
                    {pl.wymaga_prowadzenia && (
                      <span className="text-[11px] font-bold uppercase tracking-wider border-[2px] rounded px-2 py-0.5" style={{ borderColor: COLORS.accent, color: COLORS.accent }}>
                        w toku
                      </span>
                    )}
                    {pl.czas && <span className="text-[12px] text-[#6E6E66]">{pl.czas}</span>}
                    {pl.miejsce && <span className="text-[12px] text-[#6E6E66]">· {pl.miejsce}</span>}
                  </div>
                  <div className="text-[15px]">{pl.opis || "(bez opisu)"}</div>
                  {pl.dzialania && (
                    <div className="text-[13px] text-[#6E6E66] mt-1">
                      Zrobiono: {pl.dzialania}
                    </div>
                  )}
                  {(pl.personel || pl.gosc) && (
                    <div className="text-[13px] text-[#6E6E66]">
                      Udział: {[pl.personel, pl.gosc].filter(Boolean).join(", ")}
                    </div>
                  )}
                  {pl.wplyw_typ && (
                    <div className="text-[13px] text-[#6E6E66]">
                      Skutek finansowy: {pl.wplyw_typ}
                      {pl.wplyw_kwota != null ? ` · ${pl.wplyw_kwota} zł` : ""}
                    </div>
                  )}
                  {pl.dowod && (
                    <div className="text-[13px] text-[#6E6E66]">Dowód: {pl.dowod}</div>
                  )}
                  <div className="text-[12px] text-[#8F8E86] mt-1">
                    {w.recorded_by} · {new Date(w.recorded_at).toLocaleString("pl-PL")}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Historia poprawek zamkniętego dnia. Stoi osobno i zawsze, bo jej sens
          polega właśnie na tym, że nie da się jej pominąć ani nadpisać. */}
      {korekty.length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>Poprawki po zamknięciu</div>
          {korekty.map((k) => (
            <div key={k.id} className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0">
              <div className="text-[15px]">
                <b>{k.payload?.label}</b>: {String(k.payload?.stare ?? "—")} →{" "}
                <b>{String(k.payload?.nowe ?? "—")}</b>
              </div>
              <div className="text-[13px] text-[#6E6E66]">{k.payload?.powod}</div>
              <div className="text-[12px] text-[#8F8E86]">
                {k.recorded_by} · {new Date(k.recorded_at).toLocaleString("pl-PL")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Miejsce na moduł zespołu (Etap D w planie rozwoju). Stoi puste celowo:
          dzień i ludzie tego dnia należą do jednej karty, więc lepiej zostawić
          im miejsce teraz, niż doklejać je później gdzie indziej. */}
      <div className="rounded-xl border-[2px] border-dashed border-[#B7B6AE] p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Users size={16} color={COLORS.mutedLight} />
          <span className="font-['Archivo'] font-bold text-[15px] text-[#6E6E66]">
            Zespół tego dnia
          </span>
          <span className="text-[11px] uppercase tracking-wider text-[#8F8E86] border border-[#B7B6AE] rounded px-1.5 py-0.5">
            w budowie
          </span>
        </div>
        <p className="text-[13px] text-[#6E6E66] max-w-[70ch]">
          Tu trafią sygnały o ludziach: kto był na zmianie i jak wypadł względem
          grafiku, nastrój zespołu, kto prosił o zamianę, czyje godziny odbiegają od
          etatu. Wszystko, co zobaczy tu kierownik, pracownik zobaczy o sobie — inaczej
          to nadzór, nie opieka.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-end">
        <button
          className={btnSecondaryCls}
          disabled={zapisuje || zamkniety}
          onClick={() => zapisz(false)}
        >
          Zapisz bez zamykania
        </button>
        <button
          className={btnPrimaryCls}
          disabled={zapisuje || zamkniety}
          onClick={() => zapisz(true)}
        >
          <Lock size={14} className="inline mr-1" />
          Zamknij dzień
        </button>
      </div>

      {nowyWpis && (
        <ModalWpisu
          szablon={nowyWpis.szablon}
          onClose={() => setNowyWpis(null)}
          onSave={dodajWpis}
        />
      )}

      {zdarzenie && (
        <ZdarzenieModal
          dateStr={data}
          osobyNaZmianie={auto.osoby}
          onClose={() => setZdarzenie(false)}
          onSave={async (typ, klucz, payload) => {
            await dodajWpis(typ, klucz, payload);
            setZdarzenie(false);
          }}
        />
      )}

      {korekta && (
        <ModalKorekty
          karta={karta}
          onClose={() => setKorekta(null)}
          onSave={async (pole, nowaWartosc, powod) => {
            try {
              await poprawZamknietyDzien({
                karta, pole, nowaWartosc, powod, kto: currentUser.name,
                dayLogs: karty, setDayLogs: setKarty,
                entries: wszystkieWpisy, setEntries: setWpisy,
              });
              await odswiez();
              setKorekta(null);
              showMsg("Poprawka zapisana", "success");
            } catch (e) {
              showMsg(e.message || "Błąd zapisu poprawki", "error");
            }
          }}
        />
      )}
    </div>
  );
}

// Jeden modal obsługuje i wpis z szablonu, i wolne zdarzenie — z punktu
// widzenia użytkownika to ta sama czynność.
function ModalWpisu({ szablon, onClose, onSave }) {
  const pola = polaSzablonu(szablon);
  const [wartosci, setWartosci] = useState({});
  const [zapisuje, setZapisuje] = useState(false);

  // Pola tak/nie są zawsze "odpowiedziane" — niezaznaczone znaczy "nie".
  // Reszta musi mieć wartość: temperatura, której nikt nie zmierzył, zapisana
  // jako pusta, jest gorsza niż jej brak, bo liczy się jako wykonana.
  const brakujace = pola.filter(
    (p) => p.typ !== "bool" && !String(wartosci[p.klucz] ?? "").trim()
  );
  const kompletny = !brakujace.length;

  const zapisz = async () => {
    if (!kompletny) return;
    setZapisuje(true);
    await onSave(szablon.typ, szablon.klucz, wartosci);
    setZapisuje(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[460px]">
        <div className={sectionHeaderCls}>{szablon.nazwa}</div>
        <div className="p-4 flex flex-col gap-3">
          {pola.map((p) => (
              <div key={p.klucz}>
                <label className={labelCls}>
                  {p.label}
                  {p.jednostka ? ` (${p.jednostka})` : ""}
                  {opisNormy(p) ? ` · norma ${opisNormy(p)}` : ""}
                </label>
                {p.typ === "bool" ? (
                  <label className="flex items-center gap-2 text-[15px] pt-1">
                    <input
                      type="checkbox"
                      className="w-5 h-5"
                      checked={wartosci[p.klucz] === true}
                      onChange={(e) =>
                        setWartosci({ ...wartosci, [p.klucz]: e.target.checked })
                      }
                    />
                    tak
                  </label>
                ) : (
                  <input
                    type={p.typ === "number" ? "number" : "text"}
                    step="any"
                    className={inputCls}
                    value={wartosci[p.klucz] ?? ""}
                    onChange={(e) => setWartosci({ ...wartosci, [p.klucz]: e.target.value })}
                  />
                )}
              </div>
          ))}
          <div className="flex flex-wrap gap-2 justify-end items-center pt-1">
            {!kompletny && (
              <span className="text-[13px] text-[#6E6E66] mr-auto">
                Wypełnij: {brakujace.map((p) => p.label).join(", ")}
              </span>
            )}
            <button className={btnSecondaryCls} onClick={onClose}>
              Anuluj
            </button>
            <button
              className={btnPrimaryCls}
              disabled={zapisuje || !kompletny}
              onClick={zapisz}
            >
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Poprawka zamkniętego dnia. Osobny ekran, nie edycja w miejscu: stara
// wartość, nowa i powód zostają w dzienniku na zawsze. Bez tego liczba sprzed
// miesiąca nic nie znaczy — nie wiadomo, czy tak było, czy ktoś ją podmienił.
function ModalKorekty({ karta, onClose, onSave }) {
  const [pole, setPole] = useState("obrot");
  const [wartosc, setWartosc] = useState("");
  const [powod, setPowod] = useState("");
  const [zapisuje, setZapisuje] = useState(false);

  const definicja = POLA_KOREKTY.find((p) => p.klucz === pole) || POLA_KOREKTY[0];
  const stare = karta ? karta[pole] : null;
  const kompletny = String(wartosc).trim() !== "" && powod.trim().length >= 3;

  const zapisz = async () => {
    if (!kompletny) return;
    setZapisuje(true);
    await onSave(pole, definicja.typ === "number" ? Number(wartosc) : wartosc, powod.trim());
    setZapisuje(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[520px]">
        <div className={sectionHeaderCls}>Poprawka zamkniętego dnia</div>
        <div className="p-4 flex flex-col gap-3">
          <div>
            <label className={labelCls}>Co poprawiamy</label>
            <select
              className={inputCls}
              value={pole}
              onChange={(e) => {
                setPole(e.target.value);
                setWartosc("");
              }}
            >
              {POLA_KOREKTY.map((p) => (
                <option key={p.klucz} value={p.klucz}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Było</label>
              <div className="border-[2px] border-[#B7B6AE] rounded px-3 py-2 text-[15px] bg-[#F1F1EE] text-[#6E6E66]">
                {stare == null || stare === "" ? "—" : String(stare)}
              </div>
            </div>
            <div>
              <label className={labelCls}>Ma być</label>
              <input
                type={definicja.typ === "number" ? "number" : "text"}
                className={inputCls}
                value={wartosc}
                onChange={(e) => setWartosc(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Dlaczego</label>
            <textarea
              rows={2}
              className={inputCls}
              placeholder="np. pomyłka przy przepisywaniu z kasy"
              value={powod}
              onChange={(e) => setPowod(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-end items-center">
            {!kompletny && (
              <span className="text-[13px] text-[#6E6E66] mr-auto">
                Podaj nową wartość i powód — bez powodu poprawka nic nie wyjaśnia.
              </span>
            )}
            <button className={btnSecondaryCls} onClick={onClose}>
              Anuluj
            </button>
            <button className={btnPrimaryCls} disabled={zapisuje || !kompletny} onClick={zapisz}>
              Zapisz poprawkę
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
