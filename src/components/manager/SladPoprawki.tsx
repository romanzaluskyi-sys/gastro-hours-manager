// @ts-nocheck
// Ślad poprawki wpisu: stara wartość, powód i kto zmienił.
//
// Osobny plik, tak jak ModalWpisu, bo używają go wszystkie miejsca
// pokazujące wartość pomiaru — karta dnia, ekran kierownika zmiany, panel
// zadań i checklista pracownika. Poprawka zrobiona na Tablecie Służbowym musi
// być widoczna w Pulsie: sam wiersz w bazie, którego nikt nie widzi, nie
// spełnia celu, dla którego powstał.
import React from "react";
import { COLORS } from "./designTokens";

export default function SladPoprawki({ opis }) {
  if (!opis) return null;
  return (
    <div className="w-full text-[12px] text-[#8F8E86] mt-1 flex flex-wrap items-center gap-x-2">
      <span
        className="text-[10.5px] font-bold uppercase tracking-wider border-[1.5px] rounded px-1.5 py-0.5"
        style={{ borderColor: COLORS.accent, color: COLORS.accent }}
      >
        {opis.ile > 1 ? `poprawione ${opis.ile}×` : "poprawione"}
      </span>
      <span>
        było {opis.bylo}
        {opis.ktoStary ? ` (${opis.ktoStary})` : ""}
      </span>
      {opis.kto && <span>· poprawił/a {opis.kto}</span>}
      {opis.powod && <span>· {opis.powod}</span>}
    </div>
  );
}
