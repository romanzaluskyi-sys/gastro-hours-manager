// @ts-nocheck
// Przypomnienie na Pulpicie pracownika: "dziś Ty zamykasz dzień".
//
// Prawo kierownika zmiany jest jednodniowe, więc łatwo o nim zapomnieć — a
// zapomniany dzień zostaje niewpisany i nazajutrz wpisuje się go z pamięci,
// czyli zmyśla. Dlatego przypomnienie stoi tam, gdzie pracownik i tak patrzy.
//
// Znika, gdy dzień jest już zamknięty: przypomnienie o zrobionej rzeczy uczy
// ludzi ignorować przypomnienia.
//
// Pobiera swój jeden wiersz sam — nie ma sensu ciągnąć całego dziennika przez
// propsy do ekranu pracownika (patrz CLAUDE.md, błąd #16).
import React, { useEffect, useState } from "react";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { api } from "../../api/supabase";
import { toLocalYMD } from "../../utils/dziennik";
import { mozeZamykacPuls } from "./PulsZmiany";

export default function PulsPrzypomnienie({ employee, lokal, onOtworz }) {
  const [karta, setKarta] = useState(undefined); // undefined = jeszcze nie wiemy
  const dzis = toLocalYMD(new Date());
  const maPrawo = mozeZamykacPuls(employee);

  useEffect(() => {
    if (!maPrawo || !lokal) return;
    api
      .get("day_logs", `lokal=eq.${encodeURIComponent(lokal)}&date=eq.${dzis}`)
      .then((k) => setKarta(Array.isArray(k) ? k[0] || null : null))
      .catch(() => setKarta(null));
  }, [maPrawo, lokal, dzis]);

  if (!maPrawo || !lokal) return null;
  const zamkniety = karta && karta.status === "zamkniety";

  if (zamkniety) {
    return (
      <div className="border-[2px] border-[#B7B6AE] rounded-xl px-4 py-3 mb-3 flex items-center gap-2.5 text-[#6E6E66]">
        <CheckCircle2 size={20} strokeWidth={2.3} color="#2C6A4F" />
        <span className="text-[15px]">
          Dzień zamknięty przez {karta.closed_by}. Dziękujemy.
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={onOtworz}
      className="w-full text-left border-[2.5px] border-[#171714] bg-[#FDF3D4] rounded-xl px-4 py-3 mb-3 flex items-center gap-3"
    >
      <BookOpen size={22} strokeWidth={2.3} className="flex-shrink-0" />
      <span className="flex-1">
        <span className="block font-['Archivo'] font-extrabold text-[16px] text-[#171714]">
          Dziś Ty zamykasz dzień
        </span>
        <span className="block text-[13px] text-[#6E6E66]">
          Przed wyjściem wpisz utarg i wpisy dnia — {lokal}
        </span>
      </span>
      <span className="flex-shrink-0 text-[13px] font-bold px-3 py-1.5 rounded bg-[#171714] text-white">
        Otwórz
      </span>
    </button>
  );
}
