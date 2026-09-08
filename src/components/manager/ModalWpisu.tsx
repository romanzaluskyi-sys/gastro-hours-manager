// @ts-nocheck
// Wpisanie jednej pozycji dziennika (temperatura, dostawa, sprzątanie).
//
// Osobny plik, bo używa go i karta dnia w Panelu Kierownika, i ekran
// kierownika zmiany na Tablecie Służbowym. To ta sama czynność i ma wyglądać
// tak samo w obu miejscach.
import React, { useState } from "react";
import { sectionHeaderCls, btnPrimaryCls, btnSecondaryCls } from "./designTokens";
import { polaSzablonu, opisNormy } from "../../utils/dziennik";

const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

export default function ModalWpisu({ szablon, onClose, onSave }) {
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
                    onChange={(e) => setWartosci({ ...wartosci, [p.klucz]: e.target.checked })}
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
            <button className={btnPrimaryCls} disabled={zapisuje || !kompletny} onClick={zapisz}>
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
