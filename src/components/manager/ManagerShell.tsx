// @ts-nocheck
// Nowa "ramka" Panelu Kierownika (sidebar na desktopie, dolny pasek na
// mobile) — zastępuje starą wersję w ManagerDashboard.tsx. Budujemy
// zakładki po kolei, w kolejności w jakiej przyszły makiety — reszta
// renderuje WBudowie niezależnie od tego, czy pod spodem działa stara
// logika (patrz ManagerDashboard.tsx).
//
// Mobile: pasek na dole jak w employeeSessionShared.tsx (Shell) — 4
// najczęstsze zakładki + "Więcej" z resztą, zamiast poziomego scrolla po
// wszystkich 11 pozycjach (to był pierwszy feedback po wdrożeniu: scroll
// w bok jest niewygodny na telefonie).
import React, { useState } from "react";
import {
  Home,
  CheckCircle2,
  FileText,
  Clock,
  ClipboardCheck,
  Calendar,
  Flag,
  Bell,
  Users,
  BarChart3,
  HelpCircle,
  LogOut,
  MoreHorizontal,
  User,
  Cloud,
} from "lucide-react";
import { shellSidebarCls, shellNavBtnCls, shellBadgeCls, lokalTabCls } from "./designTokens";
import { APP_VERSION } from "../../config";

export const NAV_ITEMS = [
  { key: "pulpit", label: "Pulpit", shortLabel: "Pulpit", Icon: Home },
  {
    key: "zatwierdzanie",
    label: "Zatwierdzanie zmian",
    shortLabel: "Decyzje",
    Icon: CheckCircle2,
    badgeKey: "zatwierdzanie",
  },
  { key: "godziny", label: "Rejestr Godzin", shortLabel: "Rejestr", Icon: FileText },
  { key: "aktywni", label: "Aktywni", shortLabel: "Aktywni", Icon: Clock },
  {
    key: "zadania",
    label: "Zadania i sprzątanie",
    shortLabel: "Zadania",
    Icon: ClipboardCheck,
    badgeKey: "zadania",
  },
  { key: "moja_praca", label: "Moja Praca", Icon: User },
  { key: "grafik", label: "Grafik", Icon: Calendar },
  { key: "zgloszenia", label: "Zgłoszenia", Icon: Flag, badgeKey: "zgloszenia" },
  { key: "powiadomienia", label: "Powiadomienia", Icon: Bell, badgeKey: "powiadomienia" },
  { key: "pracownicy", label: "Pracownicy", Icon: Users, badgeKey: "pracownicy" },
  { key: "raporty", label: "Raporty i koszty", Icon: BarChart3 },
  { key: "przewodnik", label: "Przewodnik", Icon: HelpCircle },
];

// Te 4 zostają zawsze widoczne w dolnym pasku na mobile (ten sam rytm co
// Pulpit/Zmiana/Raport/Zadania/Więcej u pracownika), reszta chowa się pod
// "Więcej" — Rejestr Godzin świadomie NIE jest tu, bo pełny rejestr z
// filtrami to bardziej biurkowe zadanie niż coś sprawdzane w biegu z
// telefonu; Aktywni (kto teraz pracuje, zakończ zmianę) jest bardziej
// "mobilne". Do ustalenia ponownie, jeśli w praktyce okaże się inaczej.
const MOBILE_PRIMARY_KEYS = ["pulpit", "zatwierdzanie", "aktywni", "zadania"];

export default function ManagerShell({
  currentUser,
  isLocalManager,
  lokaleForTabs,
  selectedLokal,
  setSelectedLokal,
  activeTab,
  setActiveTab,
  badges = {},
  onLogout,
  children,
}) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const now = new Date();
  const dateLabel = now.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const timeLabel = now.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const primaryItems = NAV_ITEMS.filter((n) => MOBILE_PRIMARY_KEYS.includes(n.key));
  const overflowItems = NAV_ITEMS.filter((n) => !MOBILE_PRIMARY_KEYS.includes(n.key));
  const overflowBadgeSum = overflowItems.reduce(
    (sum, n) => sum + (n.badgeKey ? badges[n.badgeKey] || 0 : 0),
    0
  );

  const goTab = (key) => {
    setMobileMoreOpen(false);
    setActiveTab(key);
  };

  return (
    <div className="h-screen bg-[#F1F1EE] flex flex-col md:flex-row overflow-hidden">
      {/* --- Sidebar: tylko desktop --- */}
      <aside className={`${shellSidebarCls} hidden md:flex md:w-72`}>
        <div className="p-5 border-b border-white/10">
          <p className="font-['Archivo'] font-extrabold text-xl">Godziny Gastro</p>
          <p className="text-xs text-[#B7B6AE] mt-1">
            {currentUser.name} ·{" "}
            {isLocalManager ? "kierownik lokalu" : "kierownik sieci"}
          </p>
        </div>
        <nav className="flex-grow flex flex-col overflow-y-auto">
          {NAV_ITEMS.map(({ key, label, Icon, badgeKey }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={shellNavBtnCls(activeTab === key)}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span className="truncate">{label}</span>
              {badgeKey && badges[badgeKey] > 0 && (
                <span className={shellBadgeCls}>{badges[badgeKey]}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          onClick={onLogout}
          className="p-4 flex items-center gap-2.5 text-[#B7B6AE] hover:text-white font-['Archivo'] font-bold text-sm border-t border-white/10"
        >
          <LogOut size={17} /> Wyloguj
        </button>
        <p className="text-[10.5px] text-white/30 text-center pb-2.5">
          Wersja {APP_VERSION}
        </p>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <header className="bg-white border-b-[2px] border-[#171714] px-4 md:px-6 py-3 md:py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {lokaleForTabs.map((l) => (
              <button
                key={l.key}
                onClick={() => setSelectedLokal(l.key)}
                className={lokalTabCls(selectedLokal === l.key)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-sm text-[#6E6E66] flex-shrink-0">
            <span
              className="hidden lg:flex items-center gap-1 text-[#B7B6AE]"
              title="Pogoda — wkrótce"
            >
              <Cloud size={16} /> --°C
            </span>
            <span className="capitalize hidden sm:inline">
              {dateLabel} · {timeLabel}
            </span>
            <button
              onClick={() => setActiveTab("moja_praca")}
              title="Moja Praca — moje własne godziny"
              className={`relative border-[2px] rounded w-9 h-9 flex items-center justify-center flex-shrink-0 ${
                activeTab === "moja_praca"
                  ? "border-[#171714] bg-[#171714] text-white"
                  : "border-[#B7B6AE] text-[#171714] hover:border-[#171714]"
              }`}
            >
              <User size={16} />
            </button>
            <button
              onClick={() => setActiveTab("powiadomienia")}
              className="relative border-[2px] border-[#B7B6AE] rounded w-9 h-9 flex items-center justify-center text-[#171714] hover:border-[#171714] flex-shrink-0"
            >
              <Bell size={16} />
              {badges.powiadomienia > 0 && (
                <span className={`${shellBadgeCls} absolute -top-2 -right-2 ml-0`}>
                  {badges.powiadomienia}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 p-4 md:p-6 pb-24 md:pb-6 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* --- Dolny pasek: tylko mobile, jak Shell w employeeSessionShared.tsx --- */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t-[1.5px] border-[#B7B6AE] flex z-30">
        {primaryItems.map(({ key, label, shortLabel, Icon, badgeKey }) => {
          const active = activeTab === key && !mobileMoreOpen;
          return (
            <button
              key={key}
              onClick={() => goTab(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 pb-3 relative border-t-[2.5px] ${
                active ? "text-[#DE3A22] border-[#DE3A22]" : "text-[#8F8E86] border-transparent"
              }`}
            >
              <Icon size={19} />
              <span className="text-[10.5px] font-semibold">{shortLabel || label}</span>
              {badgeKey && badges[badgeKey] > 0 && (
                <span className="absolute top-1 right-[20%] bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[9.5px] min-w-[15px] h-[15px] rounded-[3px] flex items-center justify-center px-0.5">
                  {badges[badgeKey]}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setMobileMoreOpen((v) => !v)}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 pb-3 relative border-t-[2.5px] ${
            mobileMoreOpen ? "text-[#DE3A22] border-[#DE3A22]" : "text-[#8F8E86] border-transparent"
          }`}
        >
          <MoreHorizontal size={19} />
          <span className="text-[10.5px] font-semibold">Więcej</span>
          {overflowBadgeSum > 0 && (
            <span className="absolute top-1 right-[20%] bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[9.5px] min-w-[15px] h-[15px] rounded-[3px] flex items-center justify-center px-0.5">
              {overflowBadgeSum}
            </span>
          )}
        </button>
      </nav>

      {/* --- Ekran "Więcej": tylko mobile, pełnoekranowa lista reszty zakładek --- */}
      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-white flex flex-col">
          <header className="px-5 pt-6 pb-4 bg-[#F1F1EE] border-b-[1.5px] border-[#B7B6AE] flex-shrink-0">
            <span className="font-['Archivo'] font-extrabold text-[19px] text-[#171714]">
              Więcej
            </span>
          </header>
          <div className="flex-1 overflow-y-auto px-5 pt-5 pb-6">
            {overflowItems.map(({ key, label, Icon, badgeKey }) => (
              <button
                key={key}
                onClick={() => goTab(key)}
                className="border-2 border-[#B7B6AE] rounded bg-[#F1F1EE] p-4 flex items-center gap-3.5 w-full text-left mb-3.5"
              >
                <Icon size={20} className="text-[#171714] flex-shrink-0" />
                <span className="text-[15.5px] font-semibold text-[#171714] flex-1">
                  {label}
                </span>
                {badgeKey && badges[badgeKey] > 0 && (
                  <span className="bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[11px] min-w-[18px] h-[18px] rounded flex items-center justify-center px-1">
                    {badges[badgeKey]}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={onLogout}
              className="text-sm text-[#6E6E66] underline mt-2"
            >
              Wyloguj
            </button>
            <p className="text-[11px] text-[#B7B6AE] mt-1.5">Wersja {APP_VERSION}</p>
          </div>
        </div>
      )}
    </div>
  );
}
