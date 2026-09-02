// @ts-nocheck
// Wspólny placeholder dla zakładek, które czekają na swoją kolej w redesignie
// (budujemy po kolei, w kolejności w jakiej przyszły makiety — patrz plan
// sesji). `hasOldContent` zmienia tekst: dla zakładek z działającą starą
// wersją mówimy że funkcja działa i czeka tylko na nowy wygląd, dla
// modułów których jeszcze w ogóle nie ma (Grafik, Zadania) — że to
// przyszły punkt Roadmapy.
import React from "react";
import { Construction } from "lucide-react";
import { pageTitleCls } from "./designTokens";

export default function WBudowie({ label, hasOldContent = false }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-24">
      <div className="w-16 h-16 rounded-full bg-[#F1F1EE] border-[2px] border-[#171714] flex items-center justify-center mx-auto mb-5">
        <Construction size={26} className="text-[#DE3A22]" />
      </div>
      <h2 className={`${pageTitleCls} mb-2`}>{label}</h2>
      <p className="text-[#6E6E66]">
        {hasOldContent
          ? "Ta zakładka już działa, ale w nowym wyglądzie jeszcze do niej nie doszliśmy — wracamy po kolei, zgodnie z makietami."
          : "Ta funkcja jest jeszcze w budowie — wkrótce dostępna."}
      </p>
    </div>
  );
}
