// @ts-nocheck
// Widok „Wydarzenia” w Grafiku — lista nadchodzących i minionych. Układ z
// makiety właściciela (0.74.0, ScheduleEventsList). Wiersz otwiera panel
// (minione i odwołane tylko do odczytu). Logika w utils/wydarzenia.ts.
//
// Rzeczy, których nie widać:
// - Zakres lokali idzie za górnym paskiem (jak reszta Grafiku), a filtr
//   „Lokal” tylko go zawęża. Wydarzenia „Cała sieć” są zawsze.
// - Odwołane zostają na liście (przekreślone) — z siatki znikają.
// - „Do rozliczenia” (płatne, po czasie, bez zapisanej obecności) prowadzi do
//   „Do decyzji” — rozliczenie to etap W4.
import React, { useState } from "react";
import { ChevronRight, Plus, Users as IkonaLudzi, AlertTriangle } from "lucide-react";
import {
  TYPY_WYDARZEN,
  typWydarzenia,
  sortujWydarzenia,
  uczestnicyWydarzenia,
  godzinyTekst,
  dzienKrotko,
  doRozliczenia,
} from "../../utils/wydarzenia";
import { toLocalYMD } from "../../utils/grafik";
import { IkonaTypu, TagWydarzenia } from "./wydarzeniaWspolne";

const osobOdm = (n) => (n === 1 ? "osoba" : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? "osoby" : "osób");
const selectCls =
  "h-11 min-w-[170px] border-[2px] border-[#171714] rounded-lg bg-white font-bold text-[15px] px-2.5";

export default function GrafikWydarzenia({ wydarzenia, uczestnicy, lokaleNames, onOtworz, onNowe, onDoDecyzji }) {
  const dzis = toLocalYMD(new Date());
  const [zakladka, setZakladka] = useState("nadchodzace");
  const [filtrLokal, setFiltrLokal] = useState("");
  const [filtrTyp, setFiltrTyp] = useState("");

  const moje = (wydarzenia || []).filter((w) => !w.lokal || (lokaleNames || []).includes(w.lokal));
  const pasuje = (w) => (!filtrLokal || !w.lokal || w.lokal === filtrLokal) && (!filtrTyp || w.typ === filtrTyp);
  const nadchodzace = sortujWydarzenia(moje.filter((w) => w.data >= dzis));
  const minione = sortujWydarzenia(moje.filter((w) => w.data < dzis)).reverse();
  const lista = (zakladka === "nadchodzace" ? nadchodzace : minione).filter(pasuje);
  const czekajace = doRozliczenia(moje);
  const czeka = (w) => czekajace.some((x) => x.id === w.id);

  const tagi = (w) => (
    <>
      {w.platne && <TagWydarzenia ton="paid">płatne</TagWydarzenia>}
      {w.odwolane_at && <TagWydarzenia ton="no">odwołane</TagWydarzenia>}
      {czeka(w) && <TagWydarzenia ton="warn">do rozliczenia</TagWydarzenia>}
      {w.liczba_gosci ? <TagWydarzenia>{w.liczba_gosci} gości</TagWydarzenia> : null}
    </>
  );
  const ileOsob = (w) => uczestnicyWydarzenia(uczestnicy, w.id).length;
  const przekreslone = (w) => (w.odwolane_at ? "line-through text-[#6E6E66]" : "");

  return (
    <div className="flex flex-col gap-3.5" data-lista-wydarzen>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {[
            ["nadchodzace", "Nadchodzące", nadchodzace.length],
            ["minione", "Minione", minione.length],
          ].map(([k, l, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setZakladka(k)}
              className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm ${
                zakladka === k ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-zakladka-wydarzen={k}
            >
              {l} <span className="opacity-70 tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {(lokaleNames || []).length > 1 && (
          <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#6E6E66]">
            Lokal
            <select className={selectCls} value={filtrLokal} onChange={(e) => setFiltrLokal(e.target.value)}>
              <option value="">Wszystkie lokale</option>
              {lokaleNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#6E6E66]">
          Typ
          <select className={selectCls} value={filtrTyp} onChange={(e) => setFiltrTyp(e.target.value)}>
            <option value="">Wszystkie typy</option>
            {TYPY_WYDARZEN.map((t) => (
              <option key={t.key} value={t.key}>
                {t.krotko}
              </option>
            ))}
          </select>
        </label>
      </div>

      {czekajace.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-[#FDF0D8] text-[#8A5300] px-3.5 py-2.5 text-sm" data-do-rozliczenia>
          <AlertTriangle size={17} className="flex-none" />
          <span className="flex-1">
            <b>
              {czekajace.length} {czekajace.length === 1 ? "wydarzenie do rozliczenia" : "wydarzenia do rozliczenia"}
            </b>{" "}
            · {czekajace[0].tytul}, {dzienKrotko(czekajace[0].data)} — zaznacz, kto był, a godziny trafią do Rejestru
          </span>
          {onDoDecyzji && (
            <button type="button" onClick={onDoDecyzji} className="font-bold underline underline-offset-[3px]">
              Do decyzji
            </button>
          )}
        </div>
      )}

      {!lista.length ? (
        <div className="bg-white border-[2px] border-[#171714] rounded-xl p-6 text-center text-[#6E6E66]">
          {zakladka === "nadchodzace" ? "Brak zaplanowanych wydarzeń." : "Brak minionych wydarzeń."}
          {zakladka === "nadchodzace" && onNowe && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onNowe}
                className="inline-flex items-center gap-1.5 h-11 px-4 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold"
              >
                <Plus size={17} /> Wydarzenie
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border-[2px] border-[#171714] rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[110px_110px_150px_minmax(0,1fr)_140px_90px_28px] gap-3 px-4 py-2.5 bg-[#F6F5F1] text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#6E6E66]">
            <span>Data</span>
            <span>Godziny</span>
            <span>Typ</span>
            <span>Wydarzenie</span>
            <span>Lokal</span>
            <span>Osoby</span>
            <span />
          </div>
          {lista.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => onOtworz(w)}
              className="w-full text-left border-t-[1.5px] border-[#DEDCD4] first:border-t-0 md:first:border-t-[1.5px] hover:bg-[#F6F5F1] px-4 py-3 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[110px_110px_150px_minmax(0,1fr)_140px_90px_28px] gap-x-3 gap-y-1 items-center text-[14px] tabular-nums"
              data-wiersz-wydarzenia={w.id}
            >
              <b className={`font-extrabold ${przekreslone(w)} md:col-auto`}>
                {dzienKrotko(w.data)}
                <span className="md:hidden font-bold text-[#6E6E66]"> · {godzinyTekst(w)}</span>
              </b>
              <span className={`hidden md:block font-bold ${przekreslone(w)}`}>{godzinyTekst(w)}</span>
              <span className="hidden md:flex items-center gap-2 font-semibold">
                <IkonaTypu typ={w.typ} /> {typWydarzenia(w.typ).krotko}
              </span>
              <span className="col-span-2 md:col-span-1 flex items-center gap-1.5 flex-wrap min-w-0 order-3 md:order-none">
                <span className="md:hidden">
                  <IkonaTypu typ={w.typ} size={24} />
                </span>
                <b className={`text-[15px] font-extrabold mr-1 ${przekreslone(w)}`}>{w.tytul}</b>
                {tagi(w)}
              </span>
              <span className={`hidden md:block ${w.lokal ? "" : "font-bold"}`}>{w.lokal || "Cała sieć"}</span>
              <span className="flex items-center gap-1 font-bold text-[#6E6E66] justify-end md:justify-start">
                <IkonaLudzi size={15} /> {ileOsob(w)} <span className="hidden md:inline">{osobOdm(ileOsob(w))}</span>
              </span>
              <ChevronRight size={18} className="hidden md:block text-[#6E6E66]" />
            </button>
          ))}
        </div>
      )}
      <p className="m-0 text-[13px] text-[#6E6E66]">
        Wydarzenie zapisuje się i powiadamia od razu — nie czeka na publikację grafiku. Nie liczy się do obsady.
      </p>
    </div>
  );
}
