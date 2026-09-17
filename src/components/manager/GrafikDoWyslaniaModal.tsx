// @ts-nocheck
// "Co czeka na wysłanie" — pełna lista niewysłanych zmian, zanim kierownik
// kliknie "Wyślij grafik".
//
// Po co: publikacja obejmuje WSZYSTKO od dziś w przód, ze wszystkich lokali
// kierownika (patrz publishGrafik w utils/grafik.ts) — także zmiany wpisane
// trzy tygodnie naprzód i te wpisane z siatki jednego lokalu do drugiego.
// Kropka przy kafelku i licznik przy nazwie lokalu mówią, ŻE coś czeka, ale
// nie mówią CO — a licznik "37" nad przyciskiem, który wyśle ludziom
// powiadomienia, jest dokładnie tą sytuacją, w której chce się najpierw
// zobaczyć listę.
//
// ⚠️ Modal niczego nie zmienia. Wysyła dopiero "Wyślij grafik" w pasku — jedno
// miejsce publikacji zostaje jedno.
import React from "react";
import { X, Send, Trash2 } from "lucide-react";
import { btnPrimaryCls, btnSecondaryCls, statLabelCls } from "./designTokens";
import { trimTime, shiftHours } from "../../utils/grafik";

const DZIEN = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];

const dataLabel = (d) => {
  const dt = new Date(d + "T00:00:00");
  return `${dt.toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}, ${DZIEN[dt.getDay()]}`;
};

const hLiczba = (h) => Math.round((h || 0) * 10) / 10;

export default function GrafikDoWyslaniaModal({ zmiany, onClose, onPublish, publishing }) {
  const lista = [...(zmiany || [])].sort((a, b) =>
    a.date === b.date
      ? a.lokal === b.lokal
        ? trimTime(a.start_time).localeCompare(trimTime(b.start_time))
        : a.lokal.localeCompare(b.lokal, "pl")
      : a.date.localeCompare(b.date)
  );

  // Grupujemy po DNIU, nie po lokalu ani osobie: pracownik dostanie
  // powiadomienie o swoich dniach, a kierownik przegląda to jako kalendarz.
  const dni = [];
  lista.forEach((s) => {
    const ostatni = dni[dni.length - 1];
    if (ostatni && ostatni.date === s.date) ostatni.zmiany.push(s);
    else dni.push({ date: s.date, zmiany: [s] });
  });

  // Do usunięcia to osobna kategoria: wiersz zniknął już z siatki, ale skasuje
  // się dopiero przy publikacji, która powie o tym pracownikowi. Bez tego
  // podpisu lista pokazywałaby zmiany, których kierownik u siebie nie widzi.
  const doUsuniecia = lista.filter((s) => s.deleted_at).length;
  const osoby = new Set(lista.map((s) => s.user_name)).size;
  const godziny = lista
    .filter((s) => !s.deleted_at)
    .reduce((sum, s) => sum + shiftHours(s), 0);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start md:items-center justify-center p-3 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#FAFAF7] border-[2.5px] border-[#171714] rounded-xl w-full max-w-3xl my-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b-[2px] border-[#171714] flex items-center gap-3">
          <h3 className="font-['Archivo'] font-extrabold text-[17px]">
            Do wysłania: {lista.length}
          </h3>
          <span className="text-[13px] text-[#6E6E66]">
            {osoby} {osoby === 1 ? "osoba" : "osób"} · {hLiczba(godziny)} h
            {doUsuniecia > 0 ? ` · ${doUsuniecia} do usunięcia` : ""}
          </span>
          <button onClick={onClose} className="ml-auto text-[#6E6E66] hover:text-[#171714]">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-[#6E6E66] text-sm">
              Wszystko wysłane — nic nie czeka w wersji roboczej.
            </p>
          ) : (
            dni.map((d) => (
              <div key={d.date} className="border-b-[2px] border-[#E7E7E2] last:border-b-0">
                <div className="px-4 py-2 bg-[#F1F1EE] flex items-baseline gap-2">
                  <span className="font-['Archivo'] font-bold text-[14px]">
                    {dataLabel(d.date)}
                  </span>
                  <span className="text-[12px] text-[#6E6E66]">
                    {d.zmiany.length} {d.zmiany.length === 1 ? "zmiana" : "zmian"}
                  </span>
                </div>
                {d.zmiany.map((s) => (
                  <div
                    key={s.id}
                    className="px-4 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[#EFEFEA]"
                  >
                    <span
                      className={`font-bold text-[14px] ${
                        s.deleted_at ? "line-through text-[#8F8E86]" : ""
                      }`}
                    >
                      {s.user_name}
                    </span>
                    <span className="text-[13px] text-[#6E6E66]">
                      {trimTime(s.start_time)}–{trimTime(s.end_time)}
                    </span>
                    <span className="text-[13px] text-[#6E6E66]">
                      {s.stanowisko || "bez stanowiska"} · {s.lokal}
                    </span>
                    {s.deleted_at ? (
                      <span
                        className="ml-auto text-[11px] font-extrabold text-[#8A3A2B] bg-[#FAEAE6] rounded px-1.5 py-0.5 flex items-center gap-1"
                        title="Zmiana zdjęta z grafiku — skasuje się przy wysyłce, a pracownik dostanie o tym wiadomość"
                      >
                        <Trash2 size={11} /> do usunięcia
                      </span>
                    ) : (
                      <span
                        className="ml-auto text-[11px] font-extrabold text-[#DE3A22]"
                        title="Nowa albo zmieniona po ostatniej wysyłce"
                      >
                        {s.published_at ? "zmieniona" : "nowa"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t-[2px] border-[#171714] flex flex-wrap items-center gap-3">
          <button onClick={onClose} className={btnSecondaryCls}>
            Zamknij
          </button>
          <button
            onClick={onPublish}
            disabled={publishing || lista.length === 0}
            className={btnPrimaryCls}
          >
            <Send size={15} className="inline -mt-0.5 mr-1" /> Wyślij grafik
          </button>
          <span className={`${statLabelCls} flex-1 min-w-[220px] normal-case tracking-normal`}>
            Wysyłamy wszystko od dziś w przód, ze wszystkich Twoich lokali. Każda
            osoba dostanie jedno powiadomienie.
          </span>
        </div>
      </div>
    </div>
  );
}
