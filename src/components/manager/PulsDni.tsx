// @ts-nocheck
// Puls → Dni. Układ z makiety właściciela (0.57.0, PulseDays): tabela
// ostatnich dni — kto i kiedy zamknął, utarg i odchylenie od planu, koszt i %,
// godziny wobec planu, zadania · wpisy, sygnały (zdarzenia, poprawki, pomiary
// poza normą, tagi). Kliknięcie wiersza otwiera kartę dnia.
//
// Liczby idą z `wierszDnia` (utils/dziennik.ts) — tej samej funkcji co
// Analityka, więc tydzień nie może powiedzieć czegoś innego niż dni.
// Dziś jest na liście jako "otwarty", ale jego liczby dopiero się zbierają.
import React, { useMemo, useState } from "react";
import { Lock, ChevronRight, Flag, History, Thermometer } from "lucide-react";
import { wierszDnia, przesun, sygnalyDnia, listaTagow, godzinaZamkniecia } from "../../utils/dziennik";
import { celDnia } from "../../utils/budzet";
import { kontekstDnia, kontekstKrotko } from "../../utils/kalendarz";
import { kartaCls, btnMalyCls, zl, f1, pctTxt, znak, dzienTxt, MiniTag } from "./pulsWspolne";

const KROK_DNI = 14;

export default function PulsDni({
  lokal, miasto, dzis, lokalRow,
  shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
  karty, wpisy, szablony, weatherForecasts, budzetCele, budzetDni,
  onOtworzDzien,
}) {
  const [ile, setIle] = useState(KROK_DNI);

  const wiersze = useMemo(() => {
    const dni = [];
    for (let i = 0; i < ile; i += 1) dni.push(przesun(dzis, -i));
    return dni.map((dateStr) => {
      const w = wierszDnia({
        shifts, planShifts, users, tasks, taskBlocks, taskCompletions,
        dayLogs: karty, dayLogEntries: wpisy, dayLogTemplates: szablony,
        weatherForecasts, lokal, lokalRow, miasto, dateStr,
      });
      const cel = celDnia({ cele: budzetCele, budzetDni }, lokal, dateStr);
      const odn = cel && cel.utarg != null ? cel.utarg : w.prognozaUtargu ? w.prognozaUtargu.kwota : null;
      return {
        ...w,
        cel,
        odniesienie: odn,
        odchylenie: w.obrot != null && odn ? ((w.obrot - odn) / odn) * 100 : null,
        sygnaly: sygnalyDnia({ entries: wpisy, templates: szablony, tasks, lokal, dateStr }),
        tagi: listaTagow(w.karta && w.karta.tagi),
        zamknietoO: godzinaZamkniecia(w.karta),
      };
    });
  }, [ile, dzis, shifts, planShifts, users, tasks, taskBlocks, taskCompletions, karty, wpisy, szablony, weatherForecasts, lokal, miasto, budzetCele, budzetDni]);

  const przeszle = wiersze.filter((w) => w.date < dzis);
  const zamkniete = przeszle.filter((w) => w.zamkniety);
  const sredniaZamkniecia = (() => {
    const minuty = zamkniete
      .map((w) => w.zamknietoO)
      .filter(Boolean)
      .map((g) => {
        const [h, m] = g.split(":").map(Number);
        return (h < 6 ? h + 24 : h) * 60 + m;
      });
    if (!minuty.length) return null;
    const sr = Math.round(minuty.reduce((a, b) => a + b, 0) / minuty.length) % 1440;
    return `${String(Math.floor(sr / 60)).padStart(2, "0")}:${String(sr % 60).padStart(2, "0")}`;
  })();

  const sygnaly = (w) => (
    <span className="flex flex-wrap gap-1">
      {w.sygnaly.zdarzenia > 0 && (
        <MiniTag>
          <Flag size={11} /> {w.sygnaly.zdarzenia}
        </MiniTag>
      )}
      {w.sygnaly.poprawki > 0 && (
        <MiniTag>
          <History size={11} /> poprawka
        </MiniTag>
      )}
      {w.sygnaly.pozaNorma > 0 && (
        <MiniTag ton="warn">
          <Thermometer size={11} /> {w.sygnaly.pozaNorma}
        </MiniTag>
      )}
      {w.tagi.map((t) => (
        <MiniTag key={t}>{t}</MiniTag>
      ))}
    </span>
  );

  const status = (w) =>
    w.zamkniety ? (
      <span className="inline-flex items-center gap-1 text-[12px] text-[#6E6E66]">
        <Lock size={11} /> {w.zamknietoO} · {w.karta.closed_by}
      </span>
    ) : (
      <span className="text-[12px] font-bold text-[#8A5300]">{w.date === dzis ? "otwarty · dziś" : "otwarty"}</span>
    );

  return (
    <div className="flex flex-col gap-3" data-puls-dni>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className="font-['Archivo'] font-extrabold text-[18px]">Ostatnie dni · {lokal}</b>
        <span className="text-[13px] text-[#6E6E66] md:ml-auto">
          zamknięte {zamkniete.length} z {przeszle.length}
          {sredniaZamkniecia ? ` · średnio o ${sredniaZamkniecia}` : ""}
        </span>
      </div>
      <div className={`${kartaCls} overflow-hidden`}>
        <div className="hidden lg:grid grid-cols-[150px_110px_110px_150px_110px_120px_minmax(0,1fr)_24px] gap-3 px-[18px] py-2.5 border-b-[1.5px] border-[#DEDCD4] text-[12px] font-bold uppercase tracking-[0.06em] text-[#6E6E66]">
          <span>Dzień</span>
          <span>Utarg</span>
          <span>vs plan</span>
          <span>Koszt · %</span>
          <span>Godziny</span>
          <span>Zadania · wpisy</span>
          <span>Sygnały</span>
          <span />
        </div>
        {wiersze.map((w) => {
          const kontekst = kontekstKrotko(kontekstDnia(w.date, { dzienWyplaty: lokalRow && lokalRow.dzien_wyplaty }));
          return (
            <button
              key={w.date}
              type="button"
              onClick={() => onOtworzDzien(w.date)}
              className="w-full text-left border-t-[1.5px] border-[#DEDCD4] first:border-t-0 hover:bg-[#F6F5F1] px-4 lg:px-[18px] py-3"
              data-wiersz-dnia={w.date}
              data-zamkniety={w.zamkniety ? "tak" : "nie"}
            >
              {/* telefon / wąski ekran */}
              <div className="lg:hidden grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                <div>
                  <b className="font-['Archivo'] font-extrabold">{dzienTxt(w.date)}</b> {status(w)}
                  {kontekst && <span className="ml-1 text-[12px] font-bold text-[#8A3A2B]">{kontekst}</span>}
                </div>
                <div className="text-right font-['Archivo'] font-extrabold tabular-nums">{w.obrot != null ? zl(w.obrot) : "—"}</div>
                <div className="text-[12px] text-[#6E6E66]">
                  koszt {w.lcPct != null ? pctTxt(w.lcPct) : zl(w.koszt)} · {f1(w.godziny)} h · zadania {w.zadaniaZrobione}/{w.zadaniaRazem}
                </div>
                <div className="text-right text-[12px] text-[#6E6E66] tabular-nums">{w.odchylenie != null ? znak(w.odchylenie, "%") : ""}</div>
                <div className="col-span-2">{sygnaly(w)}</div>
              </div>
              {/* desktop */}
              <div className="hidden lg:grid grid-cols-[150px_110px_110px_150px_110px_120px_minmax(0,1fr)_24px] gap-3 items-center text-[14px]">
                <span className="min-w-0">
                  <b className="block">{dzienTxt(w.date)}</b>
                  {status(w)}
                  {kontekst && <span className="block text-[12px] font-bold text-[#8A3A2B]">{kontekst}</span>}
                </span>
                <b className="tabular-nums">{w.obrot != null ? zl(w.obrot) : "—"}</b>
                <span
                  className={`tabular-nums ${w.odchylenie != null && w.odchylenie <= -5 ? "text-[#DE3A22] font-bold" : w.odchylenie != null && w.odchylenie >= 5 ? "text-[#1F7A4A] font-bold" : ""}`}
                >
                  {w.odchylenie != null ? znak(w.odchylenie, "%") : <span className="text-[#6E6E66]">{w.odniesienie ? `plan ${zl(w.odniesienie)}` : "—"}</span>}
                </span>
                <span className="tabular-nums">
                  {zl(w.koszt)} ·{" "}
                  <b className={w.lcPct != null && w.cel && w.cel.pct != null && w.lcPct > w.cel.pct ? "text-[#8A5300]" : ""}>{w.lcPct != null ? pctTxt(w.lcPct) : "—"}</b>
                </span>
                <span className="tabular-nums">
                  {f1(w.godziny)} <span className="text-[#6E6E66]">/ {f1(w.godzinyPlan)}</span>
                </span>
                <span className="tabular-nums">
                  {w.zadaniaZrobione}/{w.zadaniaRazem} · {w.wpisyZrobione}/{w.wpisyRazem}
                </span>
                {sygnaly(w)}
                <ChevronRight size={16} className="text-[#6E6E66]" />
              </div>
            </button>
          );
        })}
      </div>
      <button type="button" className={`${btnMalyCls} self-start`} onClick={() => setIle((n) => n + KROK_DNI)}>
        Pokaż starsze dni
      </button>
    </div>
  );
}
