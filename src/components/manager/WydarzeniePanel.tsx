// @ts-nocheck
// Panel wydarzenia — nowe i edycja. Układ z makiety właściciela (0.74.0,
// ScheduleEventPanel / ScheduleEventPanelEdit): panel z boku, na telefonie
// arkusz od dołu. Logika i zapis w utils/wydarzenia.ts.
//
// Rzeczy, których nie widać:
// - Wydarzenie zapisuje się i powiadamia OD RAZU, bez publikacji grafiku.
// - Lista uczestników = kandydaci z pól (lokal, stanowiska, kogo powiadomić,
//   dzień) MINUS odznaczeni PLUS dopisani ręcznie. Zmiana pól przelicza
//   kandydatów, ale odznaczenia i dopisania zostają.
// - Przy edycji punkt wyjścia to zapisani uczestnicy: kto nie był na liście,
//   wchodzi jako odznaczony, kogo dopisano ręcznie — jako dopisany.
// - Minione i odwołane otwierają się tylko do odczytu.
// - „Cała sieć” tylko dla właściciela (`admin`/`manager`) — baza i tak nie
//   przyjmie jej od kierownika lokalu (migracja 0043).
import React, { useMemo, useState } from "react";
import { Check, Info, Plus, CalendarDays, AlertTriangle, Bell, Users as IkonaLudzi } from "lucide-react";
import {
  TYPY_WYDARZEN,
  kandydaciWydarzenia,
  stanowiskaWydarzenia,
  uczestnicyWydarzenia,
  uwagiUczestnika,
  kosztWydarzenia,
  wierszWydarzenia,
  zapiszWydarzenie,
  odwolajWydarzenie,
  dzienKrotko,
  ROLE_UCZESTNIKOW,
} from "../../utils/wydarzenia";
import { publishedShiftsFor, trimTime, toLocalYMD } from "../../utils/grafik";
import { PanelBoczny, Pole, Chip, inputCls, podpowiedzCls, btnObrysCls, btnGlownyCls, zl } from "./pulsWspolne";
import PoleCzasu from "./PoleCzasu";
import { IkonaTypu } from "./wydarzeniaWspolne";

const toggleCls = (on) =>
  `relative w-11 h-[26px] rounded-full border-[2px] flex-shrink-0 transition-colors ${
    on ? "bg-[#1F7A4A] border-[#1F7A4A]" : "bg-[#ECEBE6] border-[#171714]"
  }`;
const Przelacznik = ({ on, onClick, disabled, children, dane = {} }) => (
  <button type="button" onClick={onClick} disabled={disabled} className="flex items-center gap-3 text-left text-[14px] font-bold disabled:opacity-40" {...dane}>
    <span className={toggleCls(on)}>
      <i className={`absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all ${on ? "left-[20px] bg-white" : "left-[2px] bg-[#171714]"}`} />
    </span>
    {children}
  </button>
);
const tonUwagi = { bad: "text-[#B3321C]", warn: "text-[#8A5300]", info: "text-[#6E6E66]" };

const pustyFormularz = (data, lokal) => ({
  tytul: "",
  typ: "zebranie",
  data,
  godz_od: "15:00",
  godz_do: "16:00",
  calyDzien: false,
  lokal,
  stanowiska: [],
  zakres: "wszyscy",
  opis: "",
  liczba_gosci: "",
  platne: false,
});
const zWiersza = (w) => ({
  tytul: w.tytul || "",
  typ: w.typ || "inne",
  data: w.data,
  godz_od: trimTime(w.godz_od) || "15:00",
  godz_do: trimTime(w.godz_do) || "16:00",
  calyDzien: !(w.godz_od && w.godz_do),
  lokal: w.lokal || null,
  stanowiska: stanowiskaWydarzenia(w) || [],
  zakres: w.zakres || "wszyscy",
  opis: w.opis || "",
  liczba_gosci: w.liczba_gosci ?? "",
  platne: !!w.platne,
});

export default function WydarzeniePanel({
  wydarzenie = null,
  domyslnaData,
  domyslnyLokal,
  lokaleKierownika,
  lokale,
  activeStanowiska,
  users,
  planShifts,
  absences,
  uczestnicy,
  setWydarzenia,
  setUczestnicy,
  currentUser,
  showMsg,
  onClose,
}) {
  const dzis = toLocalYMD(new Date());
  const jestWlascicielem = ["admin", "manager"].includes(currentUser?.role);
  const [f, setF] = useState(() => (wydarzenie ? zWiersza(wydarzenie) : pustyFormularz(domyslnaData || dzis, domyslnyLokal || null)));
  const ustaw = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const zapisani = useMemo(() => (wydarzenie ? uczestnicyWydarzenia(uczestnicy, wydarzenie.id) : []), [wydarzenie, uczestnicy]);
  const tylkoOdczyt = !!wydarzenie && (!!wydarzenie.odwolane_at || wydarzenie.data < dzis);

  // Punkt wyjścia list odznaczonych i dopisanych — patrz nagłówek pliku.
  const [odznaczeni, setOdznaczeni] = useState(() => {
    if (!wydarzenie) return new Set();
    const ids = new Set(zapisani.map((u) => String(u.user_id)));
    return new Set(kandydaciWydarzenia({ wydarzenie, users, planShifts }).map((u) => String(u.id)).filter((id) => !ids.has(id)));
  });
  const [dopisani, setDopisani] = useState(() => {
    if (!wydarzenie) return [];
    const kand = new Set(kandydaciWydarzenia({ wydarzenie, users, planShifts }).map((u) => String(u.id)));
    return zapisani.map((u) => String(u.user_id)).filter((id) => !kand.has(id));
  });
  const [dodawanie, setDodawanie] = useState(false);
  const [powiadomOZmianie, setPowiadomOZmianie] = useState(true);
  const [odwolanie, setOdwolanie] = useState(false);
  const [zapisuje, setZapisuje] = useState(false);

  const dane = wierszWydarzenia(f);
  const kandydaci = kandydaciWydarzenia({ wydarzenie: dane, users, planShifts });
  const poId = (id) => (users || []).find((u) => String(u.id) === String(id));
  // Osoba już zapisana, a usunięta z kartoteki, dalej ma stać na liście.
  const zListy = (id) =>
    poId(id) || (zapisani.find((u) => String(u.user_id) === id) && { id, name: zapisani.find((u) => String(u.user_id) === id).user_name });
  const naLiscie = [...kandydaci, ...dopisani.filter((id) => !kandydaci.some((k) => String(k.id) === id)).map(zListy).filter(Boolean)];
  const wybrani = naLiscie.filter((u) => !odznaczeni.has(String(u.id)));
  const koszt = f.platne ? kosztWydarzenia({ wydarzenie: dane, osoby: wybrani, planShifts, lokale }) : null;
  const uwagiOsob = Object.fromEntries(
    wybrani.map((u) => [String(u.id), uwagiUczestnika({ wydarzenie: dane, user: u, planShifts, absences })])
  );
  const ileUwag = Object.values(uwagiOsob).filter((l) => l.some((x) => x.ton !== "info")).length;
  const pozaListaDoDodania = (users || [])
    .filter((u) => u.active !== false && !u.archived && ROLE_UCZESTNIKOW.includes(u.role) && !naLiscie.some((x) => String(x.id) === String(u.id)))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pl"));

  const przelacz = (id) =>
    setOdznaczeni((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const braki = [
    !dane.tytul && "tytuł",
    !dane.data && "dzień",
    !f.calyDzien && (!dane.godz_od || !dane.godz_do) && "godziny",
  ].filter(Boolean);
  const ileWiadomosci = wydarzenie
    ? wybrani.filter((u) => !zapisani.some((z) => String(z.user_id) === String(u.id))).length +
      zapisani.filter((z) => !wybrani.some((u) => String(u.id) === String(z.user_id))).length +
      (powiadomOZmianie ? zapisani.filter((z) => wybrani.some((u) => String(u.id) === String(z.user_id))).length : 0)
    : wybrani.length;

  const zapisz = async () => {
    if (braki.length) return;
    setZapisuje(true);
    try {
      const { powiadomieni, niewyslane } = await zapiszWydarzenie({
        dane,
        stare: wydarzenie,
        stareUczestnicy: zapisani,
        osoby: wybrani,
        powiadomOZmianie,
        kto: currentUser?.name,
        setWydarzenia,
        setUczestnicy,
      });
      showMsg(
        niewyslane
          ? `Zapisano, ale ${niewyslane} wiadomości nie wyszło — sprawdź połączenie.`
          : powiadomieni
          ? `Zapisano. Powiadomionych: ${powiadomieni}.`
          : "Zapisano.",
        niewyslane ? "error" : "success"
      );
      onClose();
    } catch (e) {
      showMsg(`Nie udało się zapisać wydarzenia: ${e.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const odwolaj = async () => {
    setZapisuje(true);
    try {
      const { powiadomieni } = await odwolajWydarzenie({ wydarzenie, uczestnicy, kto: currentUser?.name, setWydarzenia });
      showMsg(`Odwołano. Powiadomionych: ${powiadomieni}.`, "success");
      onClose();
    } catch (e) {
      showMsg(`Nie udało się odwołać: ${e.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const wierszOsoby = (u) => {
    const id = String(u.id);
    const zaznaczony = !odznaczeni.has(id);
    const zmiany = publishedShiftsFor(planShifts, u).filter((s) => s.date === dane.data);
    const opis = [
      u.default_stanowisko,
      zmiany.length ? `w grafiku ${zmiany.map((s) => `${trimTime(s.start_time)}–${trimTime(s.end_time)}`).join(", ")}` : "tego dnia wolne",
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <label
        key={id}
        className={`flex items-start gap-3 px-3 py-2.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 ${tylkoOdczyt ? "" : "cursor-pointer"}`}
        data-uczestnik={u.name}
      >
        <input
          type="checkbox"
          className="mt-1 w-5 h-5 accent-[#DE3A22] flex-none"
          checked={zaznaczony}
          disabled={tylkoOdczyt}
          onChange={() => przelacz(id)}
        />
        <span className="min-w-0">
          <b className="block text-[15px]">{u.name}</b>
          <span className="block text-[13px] text-[#6E6E66]">{opis}</span>
          {zaznaczony &&
            (uwagiOsob[id] || []).map((x, i) => (
              <span key={i} className={`flex items-start gap-1 text-[13px] font-semibold mt-0.5 ${tonUwagi[x.ton] || tonUwagi.warn}`}>
                {x.ton === "info" ? <Info size={13} className="mt-[3px] flex-none" /> : <AlertTriangle size={13} className="mt-[3px] flex-none" />}
                {x.tekst}
              </span>
            ))}
        </span>
      </label>
    );
  };

  const opcjeLokali = [
    ...(lokaleKierownika || []).map((l) => ({ key: l.name, label: l.name })),
    ...(jestWlascicielem ? [{ key: null, label: "Cała sieć", opis: "wszystkie lokale · np. mecz, święto miasta" }] : []),
  ];

  const stopka = tylkoOdczyt ? (
    <>
      <span className={`${podpowiedzCls} mr-auto`}>
        {wydarzenie.odwolane_at ? `Odwołane${wydarzenie.odwolal ? ` · ${wydarzenie.odwolal}` : ""}` : "Wydarzenie minęło — tylko do odczytu."}
      </span>
      <button type="button" className={btnObrysCls} onClick={onClose}>
        Zamknij
      </button>
    </>
  ) : odwolanie ? (
    <div className="flex flex-col gap-2.5 w-full" data-potwierdz-odwolanie>
      <p className="m-0 rounded-lg bg-[#FBEAE6] text-[#B3321C] px-3 py-2.5 text-[14px] font-semibold">
        Odwołać „{wydarzenie.tytul}”? {zapisani.length} {zapisani.length === 1 ? "osoba dostanie" : "osób dostanie"} wiadomość o odwołaniu
        {wydarzenie.platne ? ", a płatny czas zniknie z ich grafiku" : ""}.
      </p>
      <div className="flex gap-2 justify-end">
        <button type="button" className={btnObrysCls} onClick={() => setOdwolanie(false)} disabled={zapisuje}>
          Nie, zostaw
        </button>
        <button type="button" className={btnGlownyCls} onClick={odwolaj} disabled={zapisuje} data-odwolaj-tak>
          Odwołaj i powiadom
        </button>
      </div>
    </div>
  ) : (
    <>
      {wydarzenie ? (
        <button
          type="button"
          className="mr-auto text-[14px] font-bold text-[#B3321C] underline underline-offset-[3px]"
          onClick={() => setOdwolanie(true)}
          data-odwolaj-wydarzenie
        >
          Odwołaj wydarzenie
        </button>
      ) : (
        <span className={`${podpowiedzCls} mr-auto`}>{braki.length ? `Wypełnij: ${braki.join(", ")}` : ""}</span>
      )}
      {wydarzenie && zapisani.length > 0 && (
        <label className="flex items-center gap-1.5 text-[13px] font-semibold">
          <input type="checkbox" className="w-4 h-4 accent-[#DE3A22]" checked={powiadomOZmianie} onChange={(e) => setPowiadomOZmianie(e.target.checked)} />
          Powiadom o zmianie
        </label>
      )}
      <button type="button" className={btnObrysCls} onClick={onClose}>
        Anuluj
      </button>
      <button type="button" className={btnGlownyCls} disabled={zapisuje || braki.length > 0} onClick={zapisz} data-zapisz-wydarzenie>
        {ileWiadomosci > 0 ? <Bell size={17} /> : <Check size={17} />}
        {ileWiadomosci > 0 ? "Zapisz i powiadom" : "Zapisz"}
      </button>
    </>
  );

  return (
    <PanelBoczny
      id="wydarzenie"
      tytul={wydarzenie ? wydarzenie.tytul : "Nowe wydarzenie"}
      podtytul={
        wydarzenie
          ? `${TYPY_WYDARZEN.find((t) => t.key === wydarzenie.typ)?.krotko || "Wydarzenie"} · ${dzienKrotko(wydarzenie.data)}${
              wydarzenie.utworzyl ? ` · dodał(a) ${wydarzenie.utworzyl}` : ""
            }`
          : "Grafik"
      }
      onClose={onClose}
      stopka={stopka}
    >
      {!wydarzenie && (
        <p className="m-0 flex items-center gap-2 rounded-lg bg-[#E3EEFB] text-[#1D5FA8] px-3 py-2.5 text-[14px] font-bold">
          <Info size={16} className="flex-none" /> Zapisze się i powiadomi od razu — bez publikowania grafiku.
        </p>
      )}
      <fieldset disabled={tylkoOdczyt} className="contents">
        <Pole etykieta="Tytuł">
          <input
            className={`${inputCls} h-12 text-[17px] font-bold`}
            placeholder="np. Zebranie zespołu"
            value={f.tytul}
            onChange={(e) => ustaw("tytul", e.target.value)}
            data-tytul-wydarzenia
          />
        </Pole>
        <Pole etykieta="Typ">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {TYPY_WYDARZEN.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => ustaw("typ", t.key)}
                className={`flex items-center gap-2 min-h-[48px] px-2 py-1.5 rounded-lg border-[2px] text-left text-[13px] font-bold leading-4 ${
                  f.typ === t.key ? "border-[#171714] bg-[#FFF3EF] shadow-[inset_0_0_0_1px_#171714]" : "border-[#DEDCD4] bg-white hover:border-[#171714]"
                }`}
                data-typ-wydarzenia={t.key}
              >
                <IkonaTypu typ={t.key} />
                {t.label}
              </button>
            ))}
          </div>
        </Pole>
        <Pole etykieta="Kiedy">
          <div className="grid grid-cols-1 gap-2">
            <span className="flex items-center gap-1.5 border-[2px] border-[#171714] rounded-md px-2 h-11 bg-white">
              <CalendarDays size={16} className="flex-none" />
              <input
                type="date"
                className="flex-1 min-w-0 bg-transparent font-bold text-[15px]"
                value={f.data}
                onChange={(e) => ustaw("data", e.target.value)}
                data-data-wydarzenia
              />
            </span>
            {f.calyDzien ? (
              <span className="flex items-center justify-center h-11 rounded-md bg-[#F6F5F1] font-bold text-[#6E6E66]">cały dzień</span>
            ) : (
              <span className="grid grid-cols-2 gap-1.5">
                <PoleCzasu value={f.godz_od} onChange={(v) => ustaw("godz_od", v)} aria="Od" szerokie />
                <PoleCzasu value={f.godz_do} onChange={(v) => ustaw("godz_do", v)} aria="Do" szerokie />
              </span>
            )}
          </div>
          <Przelacznik
            on={f.calyDzien}
            onClick={() => setF((x) => ({ ...x, calyDzien: !x.calyDzien, platne: x.calyDzien ? x.platne : false }))}
            dane={{ "data-caly-dzien": true }}
          >
            Cały dzień
          </Przelacznik>
        </Pole>
        <Pole etykieta="Lokal">
          <div className="flex flex-col gap-1.5">
            {opcjeLokali.map((o) => (
              <button
                key={o.key || "siec"}
                type="button"
                onClick={() => ustaw("lokal", o.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-[2px] text-left ${
                  (f.lokal || null) === o.key ? "border-[#171714] bg-white" : "border-[#DEDCD4] bg-white hover:border-[#171714]"
                }`}
                data-lokal-wydarzenia={o.key || "siec"}
              >
                <span
                  className={`w-5 h-5 rounded-full border-[2px] border-[#171714] grid place-items-center flex-none ${
                    (f.lokal || null) === o.key ? "after:content-[''] after:w-2.5 after:h-2.5 after:rounded-full after:bg-[#DE3A22]" : ""
                  }`}
                />
                <span>
                  <b className="block text-[15px]">{o.label}</b>
                  {o.opis && <span className={podpowiedzCls}>{o.opis}</span>}
                </span>
              </button>
            ))}
          </div>
        </Pole>
        <Pole etykieta="Dla kogo">
          <div className="flex gap-1.5 flex-wrap">
            <Chip wlaczony={!f.stanowiska.length} onClick={() => ustaw("stanowiska", [])} data-stanowisko-wydarzenia="*">
              Wszystkie stanowiska
            </Chip>
            {[...new Set((activeStanowiska || []).filter((s) => !f.lokal || s.lokal_name === f.lokal).map((s) => s.name))].map((n) => (
              <Chip
                key={n}
                wlaczony={f.stanowiska.includes(n)}
                onClick={() => ustaw("stanowiska", f.stanowiska.includes(n) ? f.stanowiska.filter((x) => x !== n) : [...f.stanowiska, n])}
                data-stanowisko-wydarzenia={n}
              >
                {n}
              </Chip>
            ))}
          </div>
        </Pole>
        <Pole etykieta="Kogo powiadomić">
          <div className="flex flex-col gap-1.5">
            {[
              ["wszyscy", "Wszystkich z tymi stanowiskami w lokalu", "także tych, którzy tego dnia mają wolne"],
              ["grafik", "Tylko tych, którzy tego dnia są w grafiku", `${dzienKrotko(f.data)} · według aktualnego grafiku`],
            ].map(([k, l, o]) => (
              <button
                key={k}
                type="button"
                onClick={() => ustaw("zakres", k)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-[2px] text-left ${
                  f.zakres === k ? "border-[#171714]" : "border-[#DEDCD4] hover:border-[#171714]"
                }`}
                data-zakres-wydarzenia={k}
              >
                <span
                  className={`w-5 h-5 rounded-full border-[2px] border-[#171714] grid place-items-center flex-none ${
                    f.zakres === k ? "after:content-[''] after:w-2.5 after:h-2.5 after:rounded-full after:bg-[#DE3A22]" : ""
                  }`}
                />
                <span>
                  <b className="block text-[15px]">{l}</b>
                  <span className={podpowiedzCls}>{o}</span>
                </span>
              </button>
            ))}
          </div>
        </Pole>
      </fieldset>
      <Pole etykieta="Uczestnicy">
        <div className="flex items-center justify-between -mt-1">
          <span className={podpowiedzCls}>odznaczona osoba nie dostanie wiadomości</span>
          <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-[#DE3A22]" data-licznik-uczestnikow>
            <IkonaLudzi size={14} /> {wydarzenie ? `${wybrani.length} os.` : `Powiadomimy ${wybrani.length} ${wybrani.length === 1 ? "osobę" : "osób"}`}
          </span>
        </div>
        <div className="border-[2px] border-[#171714] rounded-lg overflow-hidden">
          {naLiscie.length ? naLiscie.map(wierszOsoby) : <p className="m-0 px-3 py-3 text-[14px] text-[#6E6E66]">Nikogo nie pasuje — dopisz osoby ręcznie albo zmień „Dla kogo”.</p>}
          {!tylkoOdczyt &&
            (dodawanie ? (
              <div className="px-3 py-2.5 border-t-[1.5px] border-[#DEDCD4]">
                <select
                  className={inputCls}
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    setDopisani((d) => [...d, id]);
                    setOdznaczeni((s) => {
                      const n = new Set(s);
                      n.delete(id);
                      return n;
                    });
                    setDodawanie(false);
                  }}
                  data-dopisz-osobe
                >
                  <option value="">— wybierz osobę —</option>
                  {pozaListaDoDodania.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.default_lokal ? ` · ${u.default_lokal}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDodawanie(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 border-t-[1.5px] border-[#DEDCD4] text-[14px] font-bold bg-[#F6F5F1] hover:bg-[#ECEBE6]"
              >
                <Plus size={16} /> dodaj osobę spoza listy
              </button>
            ))}
        </div>
      </Pole>
      <fieldset disabled={tylkoOdczyt} className="contents">
        <Pole etykieta="Opis · opcjonalnie">
          <textarea
            className={`${inputCls} h-20 py-2`}
            placeholder="np. jesienne menu, BHP przy frytownicy"
            value={f.opis}
            onChange={(e) => ustaw("opis", e.target.value)}
          />
        </Pole>
        {f.typ === "grupa" && (
          <Pole etykieta="Liczba gości">
            <input
              className={`${inputCls} w-[140px] tabular-nums`}
              inputMode="numeric"
              placeholder="np. 40"
              value={f.liczba_gosci}
              onChange={(e) => ustaw("liczba_gosci", e.target.value.replace(/[^0-9]/g, ""))}
            />
          </Pole>
        )}
        <div
          className={`rounded-xl border-[2px] p-3.5 flex flex-col gap-2 ${f.platne ? "border-[#1F7A4A] bg-white" : "border-[#DEDCD4] bg-white"}`}
          data-platne-wydarzenie
        >
          <Przelacznik on={f.platne} disabled={f.calyDzien} onClick={() => ustaw("platne", !f.platne)} dane={{ "data-przelacznik-platne": true }}>
            <span>
              <b className="block text-[15px]">Płatny czas pracy</b>
              <span className={`${podpowiedzCls} font-normal`}>
                {f.calyDzien ? "wymaga godzin od–do" : "wejdzie uczestnikom do grafiku, po wydarzeniu rozliczysz obecność"}
              </span>
            </span>
          </Przelacznik>
          {f.platne && koszt && (
            <div className="rounded-lg bg-[#F6F5F1] px-3 py-2 text-[13px]" data-koszt-wydarzenia>
              <b className="text-[14px]">
                Wpisze się uczestnikom do grafiku · {koszt.koszt > 0 ? `≈ ${zl(koszt.koszt)}` : "bez dodatkowego kosztu"}
              </b>
              <span className="block text-[#6E6E66]">
                {wybrani.length} os. · {String(koszt.godziny).replace(".", ",")} h poza zmianami · nie liczy się do obsady
                {koszt.bezDanych.length ? ` · bez stawki: ${koszt.bezDanych.join(", ")}` : ""}
              </span>
              {ileUwag > 0 && (
                <span className="flex items-center gap-1 mt-1 font-bold text-[#8A5300]">
                  <AlertTriangle size={13} /> {ileUwag} {ileUwag === 1 ? "uwaga" : "uwagi"} przy osobach — sprawdź listę wyżej
                </span>
              )}
            </div>
          )}
        </div>
      </fieldset>
    </PanelBoczny>
  );
}
