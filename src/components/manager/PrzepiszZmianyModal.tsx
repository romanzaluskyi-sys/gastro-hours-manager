// @ts-nocheck
// "A odchodzi, B wchodzi na jego miejsce" — co zrobić z jego zmianami.
//
// Zamiast window.confirm z jednym wyjściem ("zdejmij") kierownik dostaje ten
// wybór, którego naprawdę potrzebuje. Przepisywanie kilkunastu pozycji ręcznie
// zawsze kończy się tym, że któraś zostaje na starym nazwisku i dzień kłamie,
// że jest obsadzony.
import React, { useState } from "react";
import { AlertTriangle, ArrowLeftRight, Trash2 } from "lucide-react";
import {
  sectionHeaderCls,
  btnPrimaryCls,
  btnSecondaryCls,
  COLORS,
} from "./designTokens";
import { trimTime } from "../../utils/grafik";

const inputCls = "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

export default function PrzepiszZmianyModal({
  odchodzacy,
  zmiany,
  kandydaci,
  onPrzepisz,
  onZdejmij,
  onClose,
  pracuje,
}) {
  const [naKogo, setNaKogo] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[560px] my-6">
        <div className={sectionHeaderCls}>Zmiany w grafiku</div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" color={COLORS.accent} />
            <p className="text-[15px]">
              <b>{odchodzacy?.name}</b> ma jeszcze <b>{zmiany.length}</b>{" "}
              {zmiany.length === 1 ? "zmianę" : "zmian"} w grafiku od dziś. Zostawione bez
              decyzji liczyłyby się jako obsada, na którą nikt nie przyjdzie.
            </p>
          </div>

          <div className="border-[2px] border-[#B7B6AE] rounded max-h-[180px] overflow-y-auto">
            {zmiany.map((z) => (
              <div
                key={z.id}
                className="px-3 py-2 border-b border-[#E7E7E2] last:border-b-0 text-[13px] flex justify-between gap-3"
              >
                <span>
                  {z.date.split("-").reverse().slice(0, 2).join(".")} · {z.lokal}
                </span>
                <span className="text-[#6E6E66]">
                  {z.stanowisko} · {trimTime(z.start_time)}–{trimTime(z.end_time)}
                </span>
              </div>
            ))}
          </div>

          <div>
            <label className={labelCls}>Przepisz na</label>
            <select
              className={inputCls}
              value={naKogo}
              onChange={(e) => setNaKogo(e.target.value)}
            >
              <option value="">— wybierz osobę —</option>
              {kandydaci.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.default_stanowisko ? ` · ${u.default_stanowisko}` : ""}
                </option>
              ))}
            </select>
            <p className="text-[12px] text-[#6E6E66] mt-1">
              Dni, w których ta osoba ma wolne, kończy pracę albo ma już zmianę w tych
              godzinach, zostaną pominięte — powiemy które.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button className={btnSecondaryCls} disabled={pracuje} onClick={onClose}>
              Anuluj
            </button>
            <button className={btnSecondaryCls} disabled={pracuje} onClick={onZdejmij}>
              <Trash2 size={14} className="inline mr-1" />
              Zdejmij z grafiku
            </button>
            <button
              className={btnPrimaryCls}
              disabled={pracuje || !naKogo}
              onClick={() => onPrzepisz(naKogo)}
            >
              <ArrowLeftRight size={14} className="inline mr-1" />
              Przepisz
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
