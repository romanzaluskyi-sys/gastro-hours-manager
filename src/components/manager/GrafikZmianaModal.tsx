// @ts-nocheck
// Grafik → przypisanie zmiany w PANELU z boku (na telefonie arkusz od dołu),
// zamiast modala — układ z makiety właściciela z 2026-09-25 (ScheduleAssign).
// W tym samym pliku zostaje GrafikBlokadaModal (odmowa przy kolizji / wolnym).
//
// Kolejność pytań jest kolejnością, w jakiej układa się grafik:
//   1. stanowisko (w tym lokalu),
//   2. godziny — z szybkimi przyciskami z wymagań obsady i z klikniętej luki,
//   3. dni (przy nowej zmianie można zaznaczyć kilka — powstaje N osobnych
//      wierszy, NIE reguła powtarzania),
//   4. KTO — kandydaci z tego lokalu posortowani od najmniejszej liczby
//      godzin w miesiącu, potem osoby z innych lokali, które mają to
//      stanowisko. Zajęci / niedostępni stoją wyszarzeni z powodem.
// Pod spodem skutek (ile luk zamyka, ile kosztuje) i pełna lista uwag
// (`uwagiPrzypisania` w utils/kodeks.ts). ⚠️ Uwagi to sygnał, nie blokada —
// przycisk zmienia się na "Przypisz mimo uwag".
//
// Zapis idzie przez onSave/onDelete z GrafikTydzien — panel sam nie pisze do
// bazy. Reguły (kolizje, godziny z wymagań, obsada) żyją w utils/grafik.ts.
import React, { useState, useEffect } from "react";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import {
  trimTime,
  timeToMin,
  defaultHoursForStanowisko,
  getRulesForDate,
  knowsStanowisko,
  checkDayCoverage,
  shiftLengthMin,
  krotkaGodzina,
} from "../../utils/grafik";
import { uwagiPrzypisania } from "../../utils/kodeks";
import { naEtacie, normaMiesiaca } from "../../utils/umowy";
import { kosztGodziny, zl } from "../../utils/budzet";
import PoleCzasu from "./PoleCzasu";

const DNI = ["nd", "pn", "wt", "śr", "czw", "pt", "sob"];
const dzienKrotko = (d) => {
  const dt = new Date(d + "T00:00:00");
  return `${DNI[dt.getDay()]} ${dt.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`;
};
const hLiczba = (h) => String(Math.round((h || 0) * 10) / 10).replace(".", ",");
const inicjaly = (n) =>
  String(n || "?")
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const chipCls = (on) =>
  `inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-[1.5px] text-[13px] font-semibold whitespace-nowrap ${
    on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
  }`;
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-4 rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] enabled:hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white enabled:hover:bg-[#B8321A]`;

export function GrafikBlokadaModal({ powod, onClose, onNotify }) {
  if (!powod) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl border-[2px] border-[#DE3A22] w-full max-w-lg" data-blokada-zmiany>
        <div className="px-5 py-4 border-b-[2px] border-[#DE3A22] flex items-center justify-between gap-3">
          <h3 className="font-['Archivo'] font-extrabold text-lg">Nie można wpisać zmiany</h3>
          <button onClick={onClose} className="w-10 h-10 grid place-items-center rounded-lg hover:bg-[#F6F5F1]" aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[15px]">{powod.tekst}</p>
          {powod.podpowiedz && <p className="text-[13px] text-[#6E6E66]">{powod.podpowiedz}</p>}
          <div className="flex gap-2 pt-1 flex-wrap">
            <button onClick={() => onNotify(powod)} className={btnObrysCls}>
              Napisz do pracownika
            </button>
            <button onClick={onClose} className={btnObrysCls}>
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GrafikZmianaModal({
  ctx,
  users,
  activeStanowiska,
  lokaleNames,
  lokale = [],
  absences,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  planShifts,
  weekDays,
  przeszkodaDnia,
  godzinyMiesiaca,
  onSave,
  onDelete,
  onAddStanowisko,
  onAddAbsence,
  onClose,
}) {
  const edycja = !!ctx.shift;
  const [lokal, setLokal] = useState(ctx.shift?.lokal || ctx.lokal);
  const [dni, setDni] = useState([ctx.shift?.date || ctx.date]);
  const date = dni[0];
  const [userId, setUserId] = useState(ctx.shift?.user_id || ctx.user?.id || null);
  const [stanowisko, setStanowisko] = useState(
    ctx.shift?.stanowisko || ctx.stanowisko || ctx.user?.default_stanowisko || ""
  );
  const [start, setStart] = useState(trimTime(ctx.shift?.start_time) || ctx.luka?.from || "");
  const [end, setEnd] = useState(trimTime(ctx.shift?.end_time) || ctx.luka?.to || "");
  const [saving, setSaving] = useState(false);
  const [dopisywanie, setDopisywanie] = useState(false);
  const [pokazWszystkich, setPokazWszystkich] = useState(false);
  const [wolneForm, setWolneForm] = useState(null);
  // Godziny ruszone ręcznie nie są nadpisywane przy zmianie stanowiska.
  const [godzinyRuszone, setGodzinyRuszone] = useState(edycja || !!ctx.luka);

  const user = (users || []).find((u) => String(u.id) === String(userId)) || (userId ? ctx.user : null);
  const rulesForDay = getRulesForDate(
    { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki },
    lokal,
    date
  );

  useEffect(() => {
    if (godzinyRuszone) return;
    const domyslne = defaultHoursForStanowisko(rulesForDay, stanowisko);
    if (domyslne) {
      setStart(domyslne.start);
      setEnd(domyslne.end);
    }
  }, [stanowisko, lokal, date]);

  // Stanowiska lokalu, na który wpisujemy (edytowane stanowisko zostaje,
  // nawet gdy zniknęło ze słownika — inaczej nie dałoby się go zapisać).
  const stanowiskaLokalu = [
    ...new Map(
      (activeStanowiska || []).filter((s) => s.lokal_name === lokal).map((s) => [s.name, s])
    ).values(),
  ];
  if (stanowisko && !stanowiskaLokalu.some((s) => s.name === stanowisko)) {
    stanowiskaLokalu.push({ name: stanowisko, lokal_name: lokal });
  }

  // Szybkie godziny: pary z wymagań obsady tego stanowiska, a na początku
  // luka, z której otwarto panel ("Brak · 14:00–19:00").
  const presety = [];
  if (ctx.luka) presety.push({ from: ctx.luka.from, to: ctx.luka.to, luka: true });
  (rulesForDay || [])
    .filter((r) => r.stanowisko === stanowisko)
    .forEach((r) => {
      const p = { from: trimTime(r.start_time), to: trimTime(r.end_time) };
      if (!presety.some((x) => x.from === p.from && x.to === p.to)) presety.push(p);
    });

  const dlugoscMin =
    start && end ? shiftLengthMin({ start_time: start, end_time: end }) : 0;
  const dodaneH = (dni.length * dlugoscMin) / 60;
  const [rok, mies] = (date || "").split("-").map(Number);

  const probne = (u) =>
    dni.map((d) => ({
      id: `__kandydat-${d}`,
      user_id: u.id,
      user_name: u.name,
      lokal,
      stanowisko,
      date: d,
      start_time: start,
      end_time: end,
    }));

  // Godziny w miesiącu PO tej zmianie. Przy edycji odejmujemy starą wersję,
  // o ile należała do tej samej osoby — inaczej policzylibyśmy ją dwa razy.
  const godzinyPo = (u) => {
    const baza = godzinyMiesiaca ? godzinyMiesiaca(u) : 0;
    const stara =
      edycja && String(ctx.shift.user_id) === String(u.id) ? shiftLengthMin(ctx.shift) / 60 : 0;
    return baza - stara + dodaneH;
  };

  const opisNormy = (u) => {
    const norma = normaMiesiaca(u, rok, mies);
    const po = godzinyPo(u);
    if (norma == null) return { norma: null, po, ponad: 0 };
    const r = Math.round((po - norma) * 10) / 10;
    return {
      norma,
      po,
      ponad: r > 0 ? r : 0,
      tekst: r > 0.05 ? `+${hLiczba(r)} h ponad normą` : r < -0.05 ? `do normy brakuje ${hLiczba(-r)} h` : "równo z normą",
    };
  };

  const przeszkodaDla = (u) => {
    if (!przeszkodaDnia || !start || !end) return null;
    for (const d of dni) {
      const b = przeszkodaDnia(
        { id: ctx.shift?.id || null, user_id: u.id, user_name: u.name, start_time: start, end_time: end },
        d
      );
      if (b) return `${b.krotko} · ${dzienKrotko(d)}`;
    }
    return null;
  };

  const uwagiDla = (u) =>
    !start || !end
      ? []
      : uwagiPrzypisania({
          user: u,
          kandydaci: probne(u),
          planShifts,
          absences,
          stanowisko,
          ponadNorme: opisNormy(u).ponad,
          pomijajId: ctx.shift?.id || null,
        });

  // --- kandydaci ---
  const aktywni = (users || []).filter((u) => !u.archived && u.active !== false && u.role !== "kiosk");
  const zTegoLokalu = (u) =>
    u.default_lokal === lokal || String(u.allowed_lokale || "").split(",").map((x) => x.trim()).includes(lokal);
  const umie = (u) => !stanowisko || knowsStanowisko(u, stanowisko);
  const zawsze = (u) => String(u.id) === String(ctx.user?.id) || String(u.id) === String(ctx.shift?.user_id);
  const lista = aktywni.map((u) => ({
    u,
    przeszkoda: przeszkodaDla(u),
    godziny: godzinyPo(u),
  }));
  const sortuj = (a, b) => (a.przeszkoda ? 1 : 0) - (b.przeszkoda ? 1 : 0) || a.godziny - b.godziny;
  const lokalni = lista.filter((k) => zTegoLokalu(k.u) && (umie(k.u) || zawsze(k.u))).sort(sortuj);
  const obcy = lista.filter((k) => !zTegoLokalu(k.u) && umie(k.u) && !zawsze(k.u)).sort(sortuj);
  const reszta = lista.filter((k) => !lokalni.includes(k) && !obcy.includes(k)).sort(sortuj);

  // --- skutek ---
  const planBez = (planShifts || []).filter((s) => String(s.id) !== String(ctx.shift?.id));
  const lukiPrzed = dni.flatMap((d) =>
    (checkDayCoverage(
      { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki, planShifts: planBez },
      lokal,
      d
    ).gaps || []).filter((g) => g.stanowisko === stanowisko)
  );
  const lukiPo =
    user && start && end
      ? dni.flatMap((d) =>
          (checkDayCoverage(
            {
              rules: staffingRules,
              ruleSets: staffingRuleSets,
              wyjatki: grafikWyjatki,
              planShifts: [...planBez, ...probne(user)],
            },
            lokal,
            d
          ).gaps || []).filter((g) => g.stanowisko === stanowisko)
        )
      : lukiPrzed;
  // Brak liczymy w OSOBOGODZINACH, nie w odcinkach: przy luce na cztery osoby
  // dopisanie jednej nie zmienia liczby odcinków, a jednak zmniejsza brak.
  const minutyBraku = (luki) => luki.reduce((a, g) => a + (g.minutes || 0) * (g.missing || 0), 0);
  const brakPrzed = minutyBraku(lukiPrzed);
  const brakPo = minutyBraku(lukiPo);
  const lokalRow = (lokale || []).find((l) => l.name === lokal) || null;
  const stawkaH = user ? kosztGodziny(user, lokalRow, rok, mies) : null;
  const uwagi = user ? uwagiDla(user) : [];
  const maBad = uwagi.some((x) => x.ton === "bad");

  const zapisz = async (dodajNastepna) => {
    if (!user || !stanowisko || !start || !end) return;
    setSaving(true);
    const ok = await onSave({
      id: ctx.shift?.id || null,
      lokal,
      user_id: user.id,
      user_name: user.name,
      stanowisko,
      date,
      dni,
      start_time: start,
      end_time: end,
      dodajNastepna,
    });
    setSaving(false);
    if (ok && dodajNastepna) setUserId(null);
  };

  // Funkcja, a nie komponent — zdefiniowany tu komponent byłby przy każdym
  // renderze nowym typem i React montowałby listę od nowa (błąd #10).
  const kandydatRzad = (k) => {
    const { u, przeszkoda } = k;
    const n = opisNormy(u);
    const uw = przeszkoda ? [] : uwagiDla(u);
    const bad = uw.some((x) => x.ton === "bad");
    const on = String(u.id) === String(userId);
    return (
      <button
        key={u.id}
        type="button"
        disabled={!!przeszkoda}
        onClick={() => setUserId(u.id)}
        className={`grid grid-cols-[36px_1fr_auto] gap-2.5 items-center px-2.5 py-2 rounded-lg border-[2px] text-left w-full ${
          on
            ? "bg-[#171714] border-[#171714] text-white"
            : przeszkoda
            ? "border-dashed border-[#DEDCD4] opacity-50 cursor-not-allowed"
            : "border-[#DEDCD4] bg-white hover:border-[#171714]"
        }`}
        data-kandydat={u.name}
        aria-pressed={on}
      >
        <span
          className={`w-9 h-9 rounded-full grid place-items-center text-[13px] font-extrabold ${
            on ? "bg-white/15" : "bg-[#ECEBE6] text-[#171714]"
          }`}
        >
          {inicjaly(u.name)}
        </span>
        <span className="min-w-0">
          <span className="block font-extrabold truncate">{u.name}</span>
          <span className={`block text-[12px] leading-4 truncate ${on ? "text-white/80" : "text-[#6E6E66]"}`}>
            {przeszkoda
              ? przeszkoda
              : `${!zTegoLokalu(u) ? `${u.default_lokal || "inny lokal"} · ` : ""}${
                  umie(u) ? u.default_stanowisko || "bez stanowiska" : `nie ma „${stanowisko}”`
                }`}
          </span>
        </span>
        <span className={`text-[12px] font-extrabold text-right tabular-nums ${!on && n.ponad > 0 ? "text-[#8A5300]" : ""}`}>
          {n.norma != null ? `${hLiczba(n.po)}/${hLiczba(n.norma)} h` : `${hLiczba(n.po)} h`}
          <span className={`block font-medium ${on ? "text-white/80" : "text-[#6E6E66]"}`}>
            {n.norma != null ? n.tekst : "zlecenie · bez normy"}
          </span>
          {uw.length > 0 && (
            <span
              className={`inline-flex items-center gap-1 mt-0.5 text-[11px] ${
                on ? "text-white" : bad ? "text-[#DE3A22]" : "text-[#8A5300]"
              }`}
            >
              <AlertTriangle size={12} /> {uw.length} {uw.length === 1 ? "uwaga" : "uwagi"}
            </span>
          )}
        </span>
      </button>
    );
  };

  const obcyLokal = lokal !== ctx.lokal;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={edycja ? "Edytuj zmianę" : "Przypisz zmianę"}
        className="fixed z-50 bg-white flex flex-col inset-x-0 bottom-0 top-12 rounded-t-2xl border-t-[2px] md:inset-y-0 md:right-0 md:left-auto md:top-0 md:w-[520px] md:rounded-none md:border-t-0 md:border-l-[2px] border-[#171714]"
        data-panel-zmiany
      >
        <div className="flex items-start gap-3 px-4 md:px-5 py-4 border-b-[2px] border-[#171714]">
          <div className="min-w-0">
            <h3 className="m-0 font-['Archivo'] text-xl font-extrabold">
              {edycja ? "Edytuj zmianę" : "Przypisz zmianę"}
            </h3>
            <div className="text-sm text-[#6E6E66] truncate">
              {lokal}
              {edycja ? ` · ${ctx.shift.user_name} · ${dzienKrotko(ctx.shift.date)}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-10 h-10 grid place-items-center rounded-lg hover:bg-[#F6F5F1] flex-shrink-0"
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4 flex flex-col gap-4">
          {ctx.oferta && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#E3EEFB] text-[#1D5FA8] text-[13px] font-semibold">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Ta zmiana jest na giełdzie
                {ctx.oferta.taker_user_name
                  ? ` — ${ctx.oferta.taker_user_name} chce ją przejąć. Zgoda albo odmowa: w pasku „Giełda zmian” nad siatką.`
                  : " — nikt jeszcze się po nią nie zgłosił."}
              </span>
            </div>
          )}

          {(lokaleNames || []).length > 1 && (
            <label className="flex flex-col gap-1.5">
              <span className={etykietaCls}>Lokal</span>
              <select
                value={lokal}
                onChange={(e) => {
                  setLokal(e.target.value);
                  setStanowisko("");
                }}
                className="h-11 border-[2px] border-[#171714] rounded-md bg-white px-3 font-semibold"
              >
                {lokaleNames.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              {obcyLokal && (
                <span className="text-[13px] font-bold text-[#8A5300]">
                  Ta zmiana trafi do lokalu {lokal}. W grafiku {ctx.lokal} pojawi się jako zmiana w innym lokalu.
                </span>
              )}
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <span className={etykietaCls}>Stanowisko</span>
            <div className="flex gap-1.5 flex-wrap">
              {stanowiskaLokalu.length === 0 && (
                <span className="text-sm text-[#6E6E66]">
                  Lokal {lokal} nie ma stanowisk — dodaje je właściciel w Ustawienia → Stanowiska.
                </span>
              )}
              {stanowiskaLokalu.map((s) => {
                const styl = stanowiskoBadgeStyle(activeStanowiska, lokal, s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStanowisko(s.name)}
                    className={chipCls(stanowisko === s.name)}
                    data-stanowisko-panelu={s.name}
                  >
                    <span
                      className="px-1.5 rounded text-[11px] font-extrabold"
                      style={styl || { backgroundColor: "#E7E7E2", color: "#171714" }}
                    >
                      {stanowiskoShort(activeStanowiska, lokal, s.name)}
                    </span>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={etykietaCls}>Godziny</span>
            <div className="grid grid-cols-2 gap-2">
              <PoleCzasu
                value={start}
                onChange={(v) => {
                  setStart(v);
                  setGodzinyRuszone(true);
                }}
                aria="Od"
                szerokie
              />
              <PoleCzasu
                value={end}
                onChange={(v) => {
                  setEnd(v);
                  setGodzinyRuszone(true);
                }}
                aria="Do"
                szerokie
              />
            </div>
            {presety.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {presety.map((p) => (
                  <button
                    key={`${p.from}-${p.to}-${p.luka ? "l" : ""}`}
                    type="button"
                    onClick={() => {
                      setStart(p.from);
                      setEnd(p.to);
                      setGodzinyRuszone(true);
                    }}
                    className={chipCls(start === p.from && end === p.to)}
                    data-preset-godzin
                  >
                    {p.luka ? "Brak · " : ""}
                    {p.from}–{p.to}
                  </button>
                ))}
              </div>
            )}
            <span className="text-[13px] text-[#6E6E66]">
              {presety.length > 0
                ? "Szybkie godziny pochodzą z wymagań obsady na ten dzień."
                : "Brak wymagań obsady dla tego stanowiska w tym dniu — wpisz godziny ręcznie."}
              {start && end && timeToMin(end) <= timeToMin(start) ? " Koniec przed początkiem — zmiana przez północ." : ""}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={etykietaCls}>{edycja ? "Dzień" : "Dni · zaznacz kilka, żeby powtórzyć"}</span>
            <div className="flex gap-1.5 flex-wrap">
              {(weekDays || []).map((d) => {
                const on = dni.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={edycja && !on}
                    onClick={() => {
                      if (edycja) return;
                      if (on) {
                        if (dni.length > 1) setDni(dni.filter((x) => x !== d));
                      } else setDni([...dni, d].sort());
                    }}
                    className={`min-w-[48px] h-10 px-2 rounded-lg border-[2px] font-extrabold text-sm ${
                      on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714]"
                    } disabled:opacity-35 disabled:line-through`}
                    data-dzien-panelu={d}
                    title={dzienKrotko(d)}
                  >
                    {DNI[new Date(d + "T00:00:00").getDay()]}
                  </button>
                );
              })}
            </div>
            {!edycja && dni.length > 1 && (
              <span className="text-[13px] text-[#6E6E66]">
                Powstanie {dni.length} osobnych zmian. Dni z urlopem, kolizją albo po ostatnim dniu pracy zostaną
                pominięte.
              </span>
            )}
          </div>

          {[
            [lokalni, "Z tego lokalu · najmniej godzin na górze"],
            [obcy, `Z innych lokali · ${stanowisko ? `mają „${stanowisko}”` : "pozostali"}`],
          ].map(([l, tytul]) =>
            l.length === 0 ? null : (
              <div key={tytul} className="flex flex-col gap-1.5" data-kandydaci>
                <span className={etykietaCls}>{tytul}</span>
                <div className="flex flex-col gap-1.5">
                  {l.map((k) => kandydatRzad(k))}
                </div>
              </div>
            )
          )}
          {reszta.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPokazWszystkich((v) => !v)}
                className="self-start text-sm font-bold underline underline-offset-[3px] text-[#6E6E66] hover:text-[#171714]"
              >
                {pokazWszystkich ? "Ukryj pozostałych" : `Pokaż pozostałych (${reszta.length}) — bez tego stanowiska`}
              </button>
              {pokazWszystkich && reszta.map((k) => kandydatRzad(k))}
            </div>
          )}

          <div className="rounded-lg px-3 py-2.5 text-sm flex flex-col gap-1 bg-[#F6F5F1]" data-skutek>
            <span>
              Razem <b className="tabular-nums">{hLiczba(dodaneH)} h</b>
              {user && stawkaH != null && (
                <>
                  {" "}
                  · ok. <b className="tabular-nums">{zl(stawkaH * dodaneH)}</b>
                </>
              )}
              {user && stawkaH == null && <span className="text-[#6E6E66]"> · koszt nieznany (brak stawki w karcie)</span>}
            </span>
            {!user ? (
              <span className="text-[#6E6E66]">Wybierz osobę</span>
            ) : brakPo < brakPrzed ? (
              <span className={`font-bold ${brakPo === 0 ? "text-[#1F7A4A]" : "text-[#8A5300]"}`} data-pokryje>
                <Check size={14} className="inline -mt-0.5" />{" "}
                {brakPo === 0
                  ? `Pokryje brak obsady (${hLiczba((brakPrzed - brakPo) / 60)} h)`
                  : `Pokryje ${hLiczba((brakPrzed - brakPo) / 60)} h z braków · nadal brak: ${lukiPo
                      .map((g) => `${stanowiskoShort(activeStanowiska, lokal, g.stanowisko)} ${krotkaGodzina(g.from)}–${krotkaGodzina(g.to)}`)
                      .join(", ")}`}
              </span>
            ) : lukiPo.length > 0 ? (
              <span className="font-bold text-[#8A5300]">
                Nadal brak:{" "}
                {lukiPo.map((g) => `${stanowiskoShort(activeStanowiska, lokal, g.stanowisko)} ${krotkaGodzina(g.from)}–${krotkaGodzina(g.to)}`).join(", ")}
              </span>
            ) : rulesForDay.some((r) => r.stanowisko === stanowisko) ? (
              <span className="font-bold text-[#1F7A4A]">Obsada bez braków</span>
            ) : null}
          </div>

          {user && start && end && (
            uwagi.length === 0 ? (
              <div className="rounded-lg px-3 py-2.5 bg-[#E2F3E9] text-[#1F7A4A] font-bold text-sm flex items-center gap-1.5" data-uwagi-zmiany="0">
                <Check size={16} /> Zgodne z limitami czasu pracy
              </div>
            ) : (
              <div className="rounded-lg px-3 py-2.5 border-[2px] border-[#8A5300] bg-[#FDF0D8] text-sm" data-uwagi-zmiany={uwagi.length}>
                <b className="flex items-center gap-1.5 text-[#8A5300]">
                  <AlertTriangle size={16} /> Sprawdź przed przypisaniem
                </b>
                <ul className="mt-1.5 mb-1 pl-[18px] list-disc flex flex-col gap-1">
                  {uwagi.map((x, i) => (
                    <li key={i} className={x.ton === "bad" ? "text-[#DE3A22] font-bold" : "text-[#171714]"}>
                      {x.tekst}
                    </li>
                  ))}
                </ul>
                {!naEtacie(user) && (
                  <span className="text-[13px] text-[#6E6E66]">
                    Umowa zlecenie: to nie są limity Kodeksu pracy, tylko zalecenia bezpieczeństwa.
                  </span>
                )}
                {stanowisko && !knowsStanowisko(user, stanowisko) && onAddStanowisko && (
                  <button
                    type="button"
                    disabled={dopisywanie}
                    onClick={async () => {
                      setDopisywanie(true);
                      await onAddStanowisko(user, stanowisko);
                      setDopisywanie(false);
                    }}
                    className="mt-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-[2px] border-[#8A5300] text-[#8A5300] text-[13px] font-bold hover:bg-white disabled:opacity-50"
                  >
                    <Plus size={14} /> Dopisz „{stanowisko}” do karty: {user.name}
                  </button>
                )}
              </div>
            )
          )}

          {wolneForm && user && (
            <div className="p-3 rounded-lg border-[2px] border-[#171714] bg-[#F6F5F1] flex flex-col gap-3" data-wolne-panelu>
              <b className="font-['Archivo']">Wolne / urlop · {user.name}</b>
              <div className="flex gap-1.5">
                {[
                  { key: "urlop", label: "Urlop" },
                  { key: "niedostepnosc", label: "Niedostępność" },
                ].map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setWolneForm({ ...wolneForm, typ: o.key })}
                    className={chipCls(wolneForm.typ === o.key)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className={etykietaCls}>Od dnia</span>
                  <input
                    type="date"
                    value={wolneForm.od}
                    onChange={(e) => setWolneForm({ ...wolneForm, od: e.target.value })}
                    className="h-11 border-[2px] border-[#171714] rounded-md px-2 bg-white"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={etykietaCls}>Do dnia</span>
                  <input
                    type="date"
                    value={wolneForm.doDnia}
                    onChange={(e) => setWolneForm({ ...wolneForm, doDnia: e.target.value })}
                    className="h-11 border-[2px] border-[#171714] rounded-md px-2 bg-white"
                  />
                </label>
              </div>
              <input
                type="text"
                value={wolneForm.note}
                onChange={(e) => setWolneForm({ ...wolneForm, note: e.target.value })}
                placeholder="Notatka (opcjonalnie)"
                className="h-11 border-[2px] border-[#171714] rounded-md px-3 bg-white"
              />
              <span className="text-[13px] text-[#6E6E66]">
                {wolneForm.typ === "urlop"
                  ? "Urlop od razu zapisze się jako godziny (8 h za dzień roboczy), a pracownik dostanie powiadomienie."
                  : "Niedostępność nie generuje godzin — blokuje tylko wpisywanie zmian w te dni."}
              </span>
              <div className="flex gap-2">
                <button type="button" className={btnObrysCls} onClick={() => setWolneForm(null)}>
                  Wróć do zmiany
                </button>
                <button
                  type="button"
                  className={btnGlownyCls}
                  disabled={saving || !wolneForm.od || !wolneForm.doDnia || wolneForm.doDnia < wolneForm.od}
                  onClick={async () => {
                    setSaving(true);
                    await onAddAbsence({ user, ...wolneForm });
                    setSaving(false);
                  }}
                >
                  Zapisz wolne
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 md:px-5 py-3 border-t-[2px] border-[#171714] pb-[max(12px,env(safe-area-inset-bottom))]">
          {edycja ? (
            <button
              type="button"
              onClick={() => onDelete(ctx.shift)}
              disabled={saving}
              className="text-[#DE3A22] font-bold text-sm underline underline-offset-[3px] w-full md:w-auto text-left"
              data-usun-zmiane
            >
              Usuń zmianę
            </button>
          ) : (
            <button
              type="button"
              disabled={!user}
              title={user ? "" : "Najpierw wybierz osobę"}
              onClick={() => setWolneForm({ typ: "urlop", od: date, doDnia: date, note: "" })}
              className="text-sm font-bold underline underline-offset-[3px] text-[#171714] disabled:opacity-40 w-full md:w-auto text-left"
            >
              Wolne / urlop
            </button>
          )}
          <span className="hidden md:block flex-1" />
          <button type="button" onClick={onClose} className={`${btnObrysCls} flex-1 md:flex-none`}>
            Anuluj
          </button>
          {!edycja && (
            <button
              type="button"
              onClick={() => zapisz(true)}
              disabled={saving || !user || !stanowisko || !start || !end}
              className={`${btnObrysCls} flex-1 md:flex-none`}
            >
              + Następna
            </button>
          )}
          <button
            type="button"
            onClick={() => zapisz(false)}
            disabled={saving || !user || !stanowisko || !start || !end}
            className={`${btnGlownyCls} basis-full md:basis-auto order-last md:order-none`}
            data-zapisz-zmiane
          >
            <Check size={18} />
            {maBad ? (edycja ? "Zapisz mimo uwag" : "Przypisz mimo uwag") : edycja ? "Zapisz" : dni.length > 1 ? `Przypisz ×${dni.length}` : "Przypisz"}
          </button>
        </div>
      </aside>
    </>
  );
}
