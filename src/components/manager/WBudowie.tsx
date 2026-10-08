// @ts-nocheck
// Siatka bezpieczeństwa dla zakładki bez własnego widoku — klucz w NAV_ITEMS,
// którego nie ma w TABY_Z_WLASNYM_WIDOKIEM (ManagerDashboard.tsx). Zamiast
// pustego ekranu stoi wtedy nazwa zakładki i zdanie, że funkcja jest w budowie.
import React from "react";
import { Construction } from "lucide-react";
import { pageTitleCls } from "./designTokens";

export default function WBudowie({ label }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-24">
      <div className="w-16 h-16 rounded-full bg-[#F1F1EE] border-[2px] border-[#171714] flex items-center justify-center mx-auto mb-5">
        <Construction size={26} className="text-[#DE3A22]" />
      </div>
      <h2 className={`${pageTitleCls} mb-2`}>{label}</h2>
      <p className="text-[#6E6E66]">Ta funkcja jest jeszcze w budowie — wkrótce dostępna.</p>
    </div>
  );
}
