// @ts-nocheck
// Raport tygodnia — siedem dni złożone w jedną stronę.
//
// ⚠️ Raport NIE jest przechowywany. Liczy się z tych samych wierszy, co lista
// dni, więc nie może powiedzieć czegoś innego niż dni, z których powstał —
// a zapisana kopia zaczęłaby się z nimi rozjeżdżać przy pierwszej korekcie
// utargu. "Historia" to po prostu możliwość cofnięcia się o tydzień.
// Gdy dojdzie wysyłka mailem, zapisywać będziemy WYSYŁKI (kto, kiedy, do
// kogo), nie treść — treść zawsze da się odtworzyć z dni.
import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Lock, ClipboardCheck } from "lucide-react";
import {
  COLORS,
  statTileCls,
  statLabelCls,
  statValueCls,
  statSubCls,
  sectionCardCls,
  sectionHeaderCls,
  btnSecondaryCls,
} from "./designTokens";
import { getDayOfWeek } from "../../utils/format";
import { mondayOf, addDaysYMD } from "../../utils/grafik";
import { wierszDnia, raportTygodnia } from "../../utils/dziennik";

const zl = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("pl-PL")} zł`);
const znak = (n, j = "") =>
  n == null ? "" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n * 10) / 10)}${j}`;
const dzienMiesiaca = (d) => d.split("-").reverse().slice(0, 2).join(".");

export default function PulsTydzien({
  lokal, miasto, dzis,
  shifts, planShifts, users, tasks, taskCompletions,
  karty, wpisy, szablony, weatherForecasts,
  data, setData, onOtworzDzien,
}) {
  const poniedzialek = mondayOf(data);
  const dniTygodnia = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysYMD(poniedzialek, i)),
    [poniedzialek]
  );

  const policzTydzien = (od) =>
    Array.from({ length: 7 }, (_, i) => addDaysYMD(od, i))
      // Dni, które jeszcze nie minęły, nie wchodzą do raportu — inaczej
      // "wykonanie 40%" w środę znaczyłoby tylko tyle, że jest środa.
      .filter((d) => d < dzis)
      .map((dateStr) =>
        wierszDnia({
          shifts, planShifts, users, tasks, taskCompletions,
          dayLogs: karty, dayLogEntries: wpisy, dayLogTemplates: szablony,
          weatherForecasts, lokal, miasto, dateStr,
        })
      );

  const wiersze = useMemo(() => policzTydzien(poniedzialek), [poniedzialek, karty, wpisy, szablony, shifts, planShifts, lokal]);
  const r = raportTygodnia(wiersze);

  const historia = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => addDaysYMD(poniedzialek, -7 * (i + 1))).map((od) => ({
        od,
        raport: raportTygodnia(policzTydzien(od)),
      })),
    [poniedzialek, karty, wpisy, szablony, shifts, planShifts, lokal]
  );

  const zakres = `${dzienMiesiaca(poniedzialek)}–${dzienMiesiaca(addDaysYMD(poniedzialek, 6))}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnSecondaryCls} onClick={() => setData(addDaysYMD(poniedzialek, -7))}>
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-[150px]">
          <div className="font-['Archivo'] font-extrabold text-[17px]">{zakres}</div>
          <div className="text-[12px] text-[#6E6E66]">
            {r.dni} {r.dni === 1 ? "dzień" : "dni"} zakończonych
          </div>
        </div>
        <button
          className={btnSecondaryCls}
          disabled={addDaysYMD(poniedzialek, 7) > dzis}
          onClick={() => setData(addDaysYMD(poniedzialek, 7))}
        >
          <ChevronRight size={16} />
        </button>
        <button className={btnSecondaryCls} onClick={() => setData(dzis)}>
          Ten tydzień
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={statTileCls}>
          <div className={statLabelCls}>Utarg</div>
          <div className={statValueCls}>{zl(r.obrot)}</div>
          <div className={statSubCls}>
            {r.dniZUtargiem < r.dni
              ? `wpisany w ${r.dniZUtargiem} z ${r.dni} dni`
              : "wszystkie dni wpisane"}
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Koszt pracy</div>
          <div className={statValueCls}>{zl(r.koszt)}</div>
          <div
            className={statSubCls}
            style={{ color: r.kosztPlan && r.koszt > r.kosztPlan ? COLORS.accent : COLORS.muted }}
          >
            {r.kosztPlan ? `plan ${zl(r.kosztPlan)} · ${znak(r.koszt - r.kosztPlan, " zł")}` : "brak grafiku"}
          </div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Koszt pracy / utarg</div>
          <div
            className={statValueCls}
            style={{ color: r.lcPct != null && r.lcPct > 35 ? COLORS.accent : COLORS.ink }}
          >
            {r.lcPct != null ? `${r.lcPct}%` : "—"}
          </div>
          <div className={statSubCls}>zdrowy zakres to 25–35%</div>
        </div>
        <div className={statTileCls}>
          <div className={statLabelCls}>Godziny</div>
          <div className={statValueCls}>{r.godziny}</div>
          <div className={statSubCls}>
            {r.godzinyPlan ? `plan ${r.godzinyPlan} · ${znak(r.godziny - r.godzinyPlan, " h")}` : "brak grafiku"}
          </div>
        </div>
      </div>

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Dzień po dniu</span>
          <span className="text-[12px] font-normal text-[#6E6E66] flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Lock size={12} /> {r.dniZamkniete}/{r.dni}
            </span>
            <span className="flex items-center gap-1">
              <ClipboardCheck size={12} /> {r.zadaniaZrobione}/{r.zadaniaRazem} zadań
              {r.wpisyRazem ? ` · ${r.wpisyZrobione}/${r.wpisyRazem} wpisów` : ""}
            </span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] min-w-[620px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#8F8E86]">
                <th className="px-4 py-2">Dzień</th>
                <th className="px-2 py-2">Utarg</th>
                <th className="px-2 py-2">Koszt pracy</th>
                <th className="px-2 py-2">%</th>
                <th className="px-2 py-2">Godziny</th>
                <th className="px-2 py-2">Wykonanie</th>
                <th className="px-2 py-2">Pogoda</th>
              </tr>
            </thead>
            <tbody>
              {dniTygodnia.map((d) => {
                const w = wiersze.find((x) => x.date === d);
                if (!w) {
                  return (
                    <tr key={d} className="border-t-[2px] border-[#E7E7E2] text-[#B7B6AE]">
                      <td className="px-4 py-2">
                        {dzienMiesiaca(d)} {getDayOfWeek(new Date(d + "T00:00:00"))}
                      </td>
                      <td className="px-2 py-2" colSpan={6}>
                        jeszcze nie minął
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={d}
                    onClick={() => onOtworzDzien(d)}
                    className="border-t-[2px] border-[#171714] cursor-pointer hover:bg-[#F1F1EE]"
                  >
                    <td className="px-4 py-2 font-bold">
                      {dzienMiesiaca(d)} {getDayOfWeek(new Date(d + "T00:00:00"))}{" "}
                      {!w.zamkniety && (
                        <span className="text-[11px]" style={{ color: COLORS.accent }}>
                          otwarty
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-['Archivo'] font-bold">{zl(w.obrot)}</td>
                    <td className="px-2 py-2">{zl(w.koszt)}</td>
                    <td className="px-2 py-2">{w.lcPct != null ? `${w.lcPct}%` : "—"}</td>
                    <td className="px-2 py-2">{w.godziny}</td>
                    <td className="px-2 py-2">
                      {w.zadaniaZrobione}/{w.zadaniaRazem}
                      {w.wpisyRazem ? ` · ${w.wpisyZrobione}/${w.wpisyRazem}` : ""}
                    </td>
                    <td className="px-2 py-2">
                      {w.pogodaFakt && w.pogodaFakt.temp_max != null
                        ? `${Math.round(w.pogodaFakt.temp_max)}°`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(r.najlepszy || r.najslabszy) && (
          <div className="px-4 py-3 border-t-[2px] border-[#171714] text-[13px] text-[#6E6E66]">
            Najmocniejszy dzień: <b>{dzienMiesiaca(r.najlepszy.date)}</b> ({zl(r.najlepszy.obrot)})
            {r.najslabszy && r.najslabszy.date !== r.najlepszy.date && (
              <>
                {" · "}najsłabszy: <b>{dzienMiesiaca(r.najslabszy.date)}</b> ({zl(r.najslabszy.obrot)})
              </>
            )}
          </div>
        )}
      </div>

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Poprzednie tygodnie</span>
          <span className="text-[12px] font-normal text-[#6E6E66]">kliknij, żeby otworzyć</span>
        </div>
        {historia.map(({ od, raport }) => (
          <button
            key={od}
            onClick={() => setData(od)}
            className="w-full text-left px-4 py-2.5 border-b-[2px] border-[#171714] last:border-b-0 hover:bg-[#F1F1EE] flex flex-wrap items-baseline gap-x-6 gap-y-1"
          >
            <span className="font-bold w-[110px]">
              {dzienMiesiaca(od)}–{dzienMiesiaca(addDaysYMD(od, 6))}
            </span>
            <span className="font-['Archivo'] font-bold">{zl(raport.obrot)}</span>
            <span className="text-[13px] text-[#6E6E66]">koszt {zl(raport.koszt)}</span>
            <span
              className="text-[13px]"
              style={{ color: raport.lcPct != null && raport.lcPct > 35 ? COLORS.accent : COLORS.muted }}
            >
              {raport.lcPct != null ? `${raport.lcPct}%` : "—"}
            </span>
            <span className="text-[13px] text-[#6E6E66] ml-auto">
              {raport.dniZamkniete}/{raport.dni} zamkniętych
            </span>
          </button>
        ))}
      </div>

      <p className="text-[12px] text-[#6E6E66]">
        Raport liczy się z kart dni — poprawka utargu sprzed tygodnia od razu zmienia
        tę stronę. Wysyłka mailem dojdzie później; wtedy zapisywać będziemy same
        wysyłki, nie treść.
      </p>
    </div>
  );
}
