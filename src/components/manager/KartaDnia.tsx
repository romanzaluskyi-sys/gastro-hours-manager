// @ts-nocheck
// Karta dnia ("Puls") — zamknięcie dnia przez kierownika.
//
// Ekran jest tak ułożony, żeby dało się go domknąć w 60–90 sekund: najpierw
// pasek liczb, których NIE trzeba wpisywać (godziny, koszt, obsada, zadania,
// pogoda), potem krótka lista tego, co trzeba. Jeśli wypełnianie zacznie
// zajmować więcej, ludzie zaczną klikać karty wstecz i zmyślać — a wtedy cała
// analityka z Etapu E stoi na wymyślonych danych.
//
// Cała arytmetyka siedzi w utils/dziennik.ts. Tutaj tylko rysowanie.
import React, { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import {
  cardCls,
  statTileCls,
  statLabelCls,
  statValueCls,
  statSubCls,
  sectionCardCls,
  sectionHeaderCls,
  pageTitleCls,
  btnPrimaryCls,
  btnSecondaryCls,
  lokalTabCls,
  COLORS,
} from "./designTokens";
import PulsSzablony from "./PulsSzablony";
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
  zapiszKarte,
  zamknijDzien,
  zapiszWpis,
  trafnoscPrognozy,
  prognozaNaDzien,
  wartoscPola,
  toLocalYMD,
} from "../../utils/dziennik";

const przesun = (dateStr, delta) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toLocalYMD(d);
};

const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white disabled:bg-[#F1F1EE] disabled:text-[#6E6E66]";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

export default function KartaDnia({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  lokale,
  shifts,
  planShifts,
  users,
  tasks,
  taskCompletions,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  dayLogs,
  setDayLogs,
  dayLogEntries,
  setDayLogEntries,
  dayLogTemplates,
  setDayLogTemplates,
  weatherForecasts,
  showMsg,
  // Ustawiane, gdy kierownik przyszedł tu z paska "dzień niezamknięty"
  // na Pulpicie — otwieramy dokładnie ten lokal i ten dzień.
  initialLokal,
  initialDate,
}) {
  const dzis = toLocalYMD(new Date());
  // Domyślnie wczoraj: dzień zamyka się po jego zakończeniu, a nie w trakcie.
  const [data, setData] = useState(initialDate || przesun(dzis, -1));

  // availableLokaleForManager to wiersze tabeli `lokale`, NIE nazwy, a
  // selectedLokal przy "Cała sieć" ma wartość "ALL" — ta sama konwencja co
  // w Grafik.tsx. Wzięcie tego za listę stringów dawało obiekt w JSX i biały
  // ekran zamiast zakładki.
  const lokaleNames = (availableLokaleForManager || []).map((l) => l.name);
  const konkretny =
    selectedLokal && selectedLokal !== "ALL" && lokaleNames.includes(selectedLokal)
      ? selectedLokal
      : null;
  const [lokalWybrany, setLokalWybrany] = useState(initialLokal || "");
  // Gdy górny pasek stoi na "Cała sieć", karta pokazuje pierwszy dostępny
  // lokal, dopóki kierownik sam nie wybierze innego.
  const lokal = konkretny || lokalWybrany || lokaleNames[0] || "";

  const [zapisuje, setZapisuje] = useState(false);
  const [pokazTrafnosc, setPokazTrafnosc] = useState(false);
  const [nowyWpis, setNowyWpis] = useState(null); // { szablon } | { typ }
  // Konfiguracja wpisów siedzi w tej samej zakładce, osobnym ekranem —
  // ten sam układ co Konfiguracja w Grafiku.
  const [widok, setWidok] = useState("karta");

  const karta = znajdzKarte(dayLogs, lokal, data);
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
        shifts,
        planShifts,
        users,
        tasks,
        taskCompletions,
        staffingRules,
        staffingRuleSets,
        grafikWyjatki,
        lokal,
        dateStr: data,
      }),
    [shifts, planShifts, users, tasks, taskCompletions, staffingRules, staffingRuleSets, grafikWyjatki, lokal, data]
  );

  const miasto = (lokale || []).find((l) => l.name === lokal)?.miasto || "";
  const fakt = prognozaNaDzien(weatherForecasts, miasto, data, 0);
  const trafnosc = useMemo(
    () => trafnoscPrognozy(weatherForecasts, miasto, przesun(dzis, -90)),
    [weatherForecasts, miasto, dzis]
  );

  const szablony = szablonyNaDzien(dayLogTemplates, lokal, data);
  const wpisy = wpisyDlaDnia(dayLogEntries, lokal, data);
  const wpisDlaSzablonu = (klucz) => wpisy.find((w) => w.template_key === klucz);

  const czek = sredniCzek(pole("obrot"), pole("liczba_paragonow"));
  const lcPct = labourCostPct(auto.koszt, pole("obrot"));

  const polaDoZapisu = () => ({
    obrot: pole("obrot") === "" ? null : Number(pole("obrot")),
    liczba_paragonow:
      pole("liczba_paragonow") === "" ? null : Number(pole("liczba_paragonow")),
    notatka: pole("notatka") || null,
    handover: pole("handover") || null,
    tagi: pole("tagi") || null,
    cos_nadzwyczajnego: pole("cos_nadzwyczajnego") === true || pole("cos_nadzwyczajnego") === "tak",
    // Migawka pogody: raport sprzed pół roku ma pokazywać to, co było wtedy,
    // a nie to, co dziś zwróci API.
    pogoda_temp: fakt ? fakt.temp_max : karta ? karta.pogoda_temp : null,
    pogoda_kod: fakt ? fakt.kod : karta ? karta.pogoda_kod : null,
  });

  const zapisz = async (zamykamy) => {
    setZapisuje(true);
    try {
      const wspolne = {
        karta,
        lokal,
        dateStr: data,
        pola: polaDoZapisu(),
        dayLogs,
        setDayLogs,
      };
      if (zamykamy) await zamknijDzien({ ...wspolne, kto: currentUser.name });
      else await zapiszKarte(wspolne);
      setForm({});
      showMsg(zamykamy ? "Dzień zamknięty" : "Zapisano", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu karty dnia", "error");
    }
    setZapisuje(false);
  };

  const dodajWpis = async (typ, templateKey, payload) => {
    try {
      await zapiszWpis({
        lokal,
        dateStr: data,
        karta,
        typ,
        templateKey,
        payload,
        kto: currentUser.name,
        entries: dayLogEntries,
        setEntries: setDayLogEntries,
      });
      setNowyWpis(null);
      showMsg("Zapisano wpis", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu wpisu", "error");
    }
  };

  if (!lokal) {
    return (
      <div className={cardCls}>
        Żaden lokal nie jest przypisany do Twojego konta — karty dnia nie ma dla czego
        prowadzić.
      </div>
    );
  }

  if (widok === "konfiguracja") {
    return (
      <PulsSzablony
        lokal={lokal}
        lokaleNames={lokaleNames}
        onZmienLokal={setLokalWybrany}
        dayLogTemplates={dayLogTemplates}
        setDayLogTemplates={setDayLogTemplates}
        onWroc={() => setWidok("karta")}
        showMsg={showMsg}
      />
    );
  }

  const pogodaOpis = fakt ? describeWeatherCode(fakt.kod) : null;

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      {/* nagłówek: data i lokal */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={pageTitleCls}>Karta dnia</h2>
        <div className="flex items-center gap-2 ml-auto">
          <button className={btnSecondaryCls} onClick={() => setData(przesun(data, -1))}>
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[190px]">
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
          <button className={btnSecondaryCls} onClick={() => setWidok("konfiguracja")}>
            <SlidersHorizontal size={15} className="inline -mt-0.5 mr-1" />
            Konfiguracja
          </button>
        </div>
      </div>

      {!konkretny && lokaleNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lokaleNames.map((n) => (
            <button
              key={n}
              className={lokalTabCls(n === lokal)}
              onClick={() => setLokalWybrany(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {zamkniety && (
        <div className="flex items-center gap-2 bg-[#E3F0E9] border-[2px] border-[#171714] rounded-xl px-4 py-2.5 text-[14px]">
          <Lock size={16} />
          Dzień zamknięty przez {karta.closed_by} ·{" "}
          {new Date(karta.closed_at).toLocaleString("pl-PL")}
        </div>
      )}

      {/* --- warstwa automatyczna: nic do wpisywania --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={statTileCls}>
          <div className={statLabelCls}>Godziny</div>
          <div className={statValueCls}>{auto.godzinyFakt}</div>
          <div className={statSubCls}>
            {auto.godzinyPlan ? `wg grafiku ${auto.godzinyPlan}` : "brak grafiku"} ·{" "}
            {auto.osoby.length} os.
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Koszt pracy</div>
          <div className={statValueCls}>{auto.koszt} zł</div>
          <div className={statSubCls}>
            {auto.bezStawki.length
              ? `bez stawki: ${auto.bezStawki.join(", ")}`
              : lcPct != null
              ? `${lcPct}% utargu`
              : "wpisz utarg, policzę udział"}
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Obsada</div>
          <div className={statValueCls}>
            {auto.problemy.length ? auto.problemy.length : "OK"}
          </div>
          <div className={statSubCls}>
            {auto.problemy.length
              ? auto.problemy
                  .slice(0, 2)
                  .map((p) => `${p.typ === "brak" ? "brakuje" : "nadmiar"} ${p.stanowisko}`)
                  .join(", ")
              : "zgodnie z wymaganiami"}
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
      </div>

      {/* --- pogoda: fakt i to, co prognoza mówiła wcześniej --- */}
      {miasto && (
        <div className={cardCls}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[22px]">{pogodaOpis ? pogodaOpis.icon : "—"}</span>
              <div>
                <div className="font-['Archivo'] font-bold text-[15px]">
                  {fakt ? `${Math.round(fakt.temp_max)}°C` : "brak danych"}
                  {fakt && fakt.opady_mm != null ? ` · ${fakt.opady_mm} mm` : ""}
                </div>
                <div className="text-[12px] text-[#6E6E66]">
                  {miasto}
                  {pogodaOpis ? ` · ${pogodaOpis.label}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 text-[13px]">
              {[3, 7, 14].map((h) => {
                const p = prognozaNaDzien(weatherForecasts, miasto, data, h);
                const roznica =
                  p && fakt && p.temp_max != null && fakt.temp_max != null
                    ? Number(p.temp_max) - Number(fakt.temp_max)
                    : null;
                return (
                  <div key={h}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#8F8E86]">
                      {h} dni wcześniej
                    </div>
                    <div className="font-['Archivo'] font-bold">
                      {p ? `${Math.round(p.temp_max)}°C` : "—"}
                      {roznica != null && (
                        <span
                          className="ml-1 text-[12px]"
                          style={{ color: Math.abs(roznica) >= 2 ? COLORS.accent : COLORS.muted }}
                        >
                          {roznica > 0 ? "+" : ""}
                          {Math.round(roznica * 10) / 10}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {trafnosc.length > 0 && (
              <button
                className="ml-auto text-[13px] underline text-[#6E6E66]"
                onClick={() => setPokazTrafnosc(!pokazTrafnosc)}
              >
                {pokazTrafnosc ? "Ukryj" : "Ile warta jest prognoza?"}
              </button>
            )}
          </div>

          {pokazTrafnosc && (
            <div className="mt-3 pt-3 border-t-[2px] border-[#171714] overflow-x-auto">
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
                  {trafnosc.map((t) => (
                    <tr key={t.horyzont} className="border-t border-[#E7E7E2]">
                      <td className="py-1.5 font-bold">{t.horyzont} dni</td>
                      <td>{t.bladTemp != null ? `${t.bladTemp} °C` : "—"}</td>
                      <td>{t.deszczTrafiony != null ? `${t.deszczTrafiony}%` : "—"}</td>
                      <td>{t.falszywyAlarm != null ? `${t.falszywyAlarm}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[12px] text-[#6E6E66] mt-2">
                Ostatnie 90 dni, {miasto}. Im dalej w prawo, tym mniej sensu ma układanie
                obsady „bo zapowiadali deszcz”.
              </p>
            </div>
          )}
        </div>
      )}

      {/* --- warstwo ręczna: standardowe wskaźniki --- */}
      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>Utarg i zamknięcie dnia</div>
        <div className="p-4 grid md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Utarg brutto (zł)</label>
            <input
              type="number"
              className={inputCls}
              disabled={zamkniety}
              value={pole("obrot")}
              onChange={(e) => ustaw("obrot", e.target.value)}
            />
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
          </div>
          <div>
            <label className={labelCls}>Średni paragon</label>
            <div className="font-['Archivo'] font-extrabold text-[22px] pt-1">
              {czek != null ? `${czek} zł` : "—"}
            </div>
            <div className="text-[12px] text-[#6E6E66]">
              {lcPct != null ? `koszt pracy: ${lcPct}% utargu` : "liczy się sam"}
            </div>
          </div>
          <div className="md:col-span-3">
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
          <div>
            <label className={labelCls}>Coś nadzwyczajnego?</label>
            <label className="flex items-center gap-2 pt-2 text-[15px]">
              <input
                type="checkbox"
                className="w-5 h-5"
                disabled={zamkniety}
                checked={pole("cos_nadzwyczajnego") === true}
                onChange={(e) => ustaw("cos_nadzwyczajnego", e.target.checked)}
              />
              tak, opiszę niżej
            </label>
          </div>
          {pole("cos_nadzwyczajnego") === true && (
            <div className="md:col-span-3">
              <label className={labelCls}>Opis</label>
              <textarea
                rows={2}
                className={inputCls}
                disabled={zamkniety}
                value={pole("notatka")}
                onChange={(e) => ustaw("notatka", e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* --- wpisy wymagane (HACCP) --- */}
      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Wpisy dnia</span>
          <span className="text-[12px] font-normal text-[#6E6E66]">
            {szablony.filter((s) => wpisDlaSzablonu(s.klucz)).length}/{szablony.length}
          </span>
        </div>
        {!szablony.length && (
          <div className="p-4 text-[14px] text-[#6E6E66]">
            Ten lokal nie ma jeszcze zdefiniowanych wpisów (temperatury, dostawy).
            Dopóki ich nie ma, karta dnia zbiera tylko utarg i notatki.
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
              <div className="flex-1 min-w-[180px]">
                <div className="font-['Archivo'] font-bold text-[15px]">{s.nazwa}</div>
                <div className="text-[12px] text-[#6E6E66]">
                  {polaSzablonu(s)
                    .map((p) => [p.label, opisNormy(p)].filter(Boolean).join(" "))
                    .join(" · ")}
                </div>
              </div>
              {wpis ? (
                <div className="flex items-center gap-3">
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
                  <div className="text-[11px] text-[#8F8E86] w-[110px]">
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
      </div>

      {/* --- zdarzenia poza szablonem --- */}
      {wpisy.filter((w) => !w.template_key).length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>Zdarzenia</div>
          {wpisy
            .filter((w) => !w.template_key)
            .map((w) => (
              <div
                key={w.id}
                className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0"
              >
                <div className="text-[15px]">{w.payload?.opis || "(bez opisu)"}</div>
                <div className="text-[12px] text-[#8F8E86]">
                  {w.typ} · {w.recorded_by} ·{" "}
                  {new Date(w.recorded_at).toLocaleString("pl-PL")}
                  {w.corrected_from ? " · korekta wcześniejszego wpisu" : ""}
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          className={btnSecondaryCls}
          disabled={zamkniety}
          onClick={() => setNowyWpis({ typ: "incydent" })}
        >
          <AlertTriangle size={14} className="inline mr-1" />
          Zgłoś zdarzenie
        </button>
        <div className="ml-auto flex gap-3">
          <button className={btnSecondaryCls} disabled={zapisuje || zamkniety} onClick={() => zapisz(false)}>
            Zapisz
          </button>
          <button className={btnPrimaryCls} disabled={zapisuje || zamkniety} onClick={() => zapisz(true)}>
            <Lock size={14} className="inline mr-1" />
            Zamknij dzień
          </button>
        </div>
      </div>

      {nowyWpis && (
        <ModalWpisu
          szablon={nowyWpis.szablon}
          typ={nowyWpis.typ}
          onClose={() => setNowyWpis(null)}
          onSave={dodajWpis}
        />
      )}
    </div>
  );
}

// Jeden modal obsługuje i wpis z szablonu (pola z definicji), i wolne
// zdarzenie (jedno pole opisu) — to ta sama czynność z punktu widzenia
// użytkownika, więc nie ma powodu na dwa różne ekrany.
function ModalWpisu({ szablon, typ, onClose, onSave }) {
  const pola = szablon ? polaSzablonu(szablon) : [];
  const [wartosci, setWartosci] = useState({});
  const [zapisuje, setZapisuje] = useState(false);

  const zapisz = async () => {
    setZapisuje(true);
    if (szablon) await onSave(szablon.typ, szablon.klucz, wartosci);
    else await onSave(typ || "inne", null, { opis: wartosci.opis || "" });
    setZapisuje(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[460px]">
        <div className={sectionHeaderCls}>{szablon ? szablon.nazwa : "Zdarzenie"}</div>
        <div className="p-4 flex flex-col gap-3">
          {szablon ? (
            pola.map((p) => (
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
            ))
          ) : (
            <div>
              <label className={labelCls}>Co się wydarzyło</label>
              <textarea
                rows={3}
                className={inputCls}
                value={wartosci.opis ?? ""}
                onChange={(e) => setWartosci({ ...wartosci, opis: e.target.value })}
              />
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button className={btnSecondaryCls} onClick={onClose}>
              Anuluj
            </button>
            <button className={btnPrimaryCls} disabled={zapisuje} onClick={zapisz}>
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
