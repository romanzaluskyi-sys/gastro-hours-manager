// @ts-nocheck
// "Szkic grafiku" — wszystko, co czeka na publikację, w panelu z boku (na
// telefonie arkusz od dołu). Układ z makiety właściciela (ScheduleDraft).
//
// Po co: publikacja obejmuje WSZYSTKO od dziś w przód, ze wszystkich lokali
// kierownika (publishGrafik w utils/grafik.ts) — także zmiany wpisane trzy
// tygodnie naprzód i te wpisane z siatki jednego lokalu do drugiego. Licznik
// "Opublikuj · 37" nad przyciskiem, który wyśle ludziom powiadomienia, jest
// dokładnie tą chwilą, w której chce się najpierw zobaczyć listę.
//
// Trzy rodzaje wierszy (wynikają z published_at / updated_at / deleted_at):
//   Dodana    — nigdy niewysłana. "Cofnij" kasuje ją od razu.
//   Zmieniona — wysłana i poprawiona po wysłaniu. ⚠️ BEZ "Cofnij": baza nie
//               trzyma poprzedniej wersji, więc cofnięcie musiałoby zgadywać.
//   Usunięta  — wysłana i zdjęta. "Cofnij" przywraca (jako zmienioną).
// ⚠️ "Odrzuć cały szkic" z makiety świadomie nie istnieje — z tego samego
// powodu co brak "Cofnij" przy zmienionej.
import React from "react";
import { Send, X } from "lucide-react";
import { trimTime, isUnpublished } from "../../utils/grafik";

const DNI = ["nd", "pn", "wt", "śr", "czw", "pt", "sob"];
const dzien = (d) => {
  const dt = new Date(d + "T00:00:00");
  return `${DNI[dt.getDay()]} ${dt.toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`;
};
export const rodzajSzkicu = (s) => (s.deleted_at ? "usunieta" : !s.published_at ? "nowa" : isUnpublished(s) ? "zmieniona" : null);
const ETYKIETY = {
  nowa: ["Dodana", "text-[#1F7A4A]"],
  zmieniona: ["Zmieniona", "text-[#8A5300]"],
  usunieta: ["Usunięta", "text-[#DE3A22]"],
};

export default function GrafikDoWyslaniaModal({ zmiany, onClose, onPublish, publishing, onCofnij }) {
  const lista = [...(zmiany || [])].sort((a, b) =>
    a.date === b.date ? trimTime(a.start_time).localeCompare(trimTime(b.start_time)) : a.date.localeCompare(b.date)
  );
  const kto = [...new Set(lista.map((s) => s.user_name).filter(Boolean))];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Szkic grafiku"
        className="fixed z-50 bg-white flex flex-col inset-x-0 bottom-0 top-12 rounded-t-2xl border-t-[2px] md:inset-y-0 md:right-0 md:left-auto md:top-0 md:w-[520px] md:rounded-none md:border-t-0 md:border-l-[2px] border-[#171714]"
        data-szkic-grafiku
      >
        <div className="flex items-start gap-3 px-4 md:px-5 py-4 border-b-[2px] border-[#171714]">
          <div>
            <h3 className="m-0 font-['Archivo'] text-xl font-extrabold">Szkic grafiku</h3>
            <div className="text-sm text-[#6E6E66]">
              {lista.length} {lista.length === 1 ? "zmiana" : lista.length < 5 ? "zmiany" : "zmian"} · pracownicy ich jeszcze nie
              widzą
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-10 h-10 grid place-items-center rounded-lg hover:bg-[#F6F5F1]"
            aria-label="Zamknij"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-3 flex flex-col gap-3">
          {lista.length === 0 ? (
            <p className="text-sm text-[#6E6E66] py-3">Szkic jest pusty — wszystko opublikowane.</p>
          ) : (
            <div>
              {lista.map((s) => {
                const r = rodzajSzkicu(s) || "zmieniona";
                const [etykieta, kolor] = ETYKIETY[r];
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-[88px_1fr_auto] gap-2.5 items-center py-2.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 text-sm"
                    data-wiersz-szkicu={r}
                  >
                    <span className={`text-[12px] font-extrabold uppercase tracking-[0.05em] ${kolor}`}>{etykieta}</span>
                    <span className={`min-w-0 ${r === "usunieta" ? "line-through text-[#6E6E66]" : ""}`}>
                      <b>{s.user_name}</b> · {dzien(s.date)} · {s.stanowisko || "—"} {trimTime(s.start_time)}–
                      {trimTime(s.end_time)}
                      <span className="block text-[12px] text-[#6E6E66]">{s.lokal}</span>
                    </span>
                    {r === "zmieniona" ? (
                      <span className="text-[12px] text-[#6E6E66] max-w-[90px] text-right" title="Poprzednia wersja nie jest zapisana — popraw zmianę w siatce">
                        popraw w siatce
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onCofnij(s)}
                        className="h-9 px-3 rounded-lg font-bold text-[#6E6E66] hover:bg-[#F6F5F1] hover:text-[#171714]"
                        data-cofnij-szkic
                      >
                        Cofnij
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {kto.length > 0 && (
            <div className="rounded-lg px-3 py-2.5 text-sm bg-[#F6F5F1]">
              Po publikacji powiadomienie dostanie: <b>{kto.join(", ")}</b>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-t-[2px] border-[#171714] pb-[max(12px,env(safe-area-inset-bottom))]">
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center min-h-[48px] md:min-h-[44px] px-4 rounded-lg border-[2px] border-[#171714] bg-white font-['Archivo'] font-bold text-[15px]"
          >
            Zamknij
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing || lista.length === 0}
            className="inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-4 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[15px] disabled:opacity-40"
            data-opublikuj-szkic
          >
            <Send size={17} /> Opublikuj · {lista.length}
          </button>
        </div>
      </aside>
    </>
  );
}
