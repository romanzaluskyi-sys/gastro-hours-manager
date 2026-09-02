// @ts-nocheck
// Nowa "ramka" Panelu Kierownika (sidebar + pasek lokali) — zastępuje starą
// wersję w ManagerDashboard.tsx. Budujemy zakładki po kolei, w kolejności w
// jakiej przyszły makiety (patrz plan sesji) — `builtTabs` mówi, które mają
// już nowy wygląd; reszta renderuje WBudowie niezależnie od tego, czy pod
// spodem działa stara logika (patrz ManagerDashboard.tsx).
import React from "react";
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
} from "lucide-react";
import { shellSidebarCls, shellNavBtnCls, shellBadgeCls, lokalTabCls } from "./designTokens";

export const NAV_ITEMS = [
  { key: "pulpit", label: "Pulpit", Icon: Home },
  { key: "zatwierdzanie", label: "Zatwierdzanie zmian", Icon: CheckCircle2, badgeKey: "zatwierdzanie" },
  { key: "godziny", label: "Rejestr Godzin", Icon: FileText },
  { key: "aktywni", label: "Aktywni", Icon: Clock },
  { key: "zadania", label: "Zadania i sprzątanie", Icon: ClipboardCheck },
  { key: "grafik", label: "Grafik", Icon: Calendar },
  { key: "zgloszenia", label: "Zgłoszenia", Icon: Flag, badgeKey: "zgloszenia" },
  { key: "powiadomienia", label: "Powiadomienia", Icon: Bell, badgeKey: "powiadomienia" },
  { key: "pracownicy", label: "Pracownicy, umowy, sanepid", Icon: Users, badgeKey: "pracownicy" },
  { key: "raporty", label: "Raporty i koszty", Icon: BarChart3 },
  { key: "przewodnik", label: "Przewodnik", Icon: HelpCircle },
];

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

  return (
    <div className="min-h-screen bg-[#F1F1EE] flex flex-col md:flex-row">
      <aside className={`${shellSidebarCls} w-full md:w-72`}>
        <div className="p-5 border-b border-white/10">
          <p className="font-['Archivo'] font-extrabold text-xl">Godziny Gastro</p>
          <p className="text-xs text-[#B7B6AE] mt-1">
            {currentUser.name} ·{" "}
            {isLocalManager ? "kierownik lokalu" : "kierownik sieci"}
          </p>
        </div>
        <nav className="flex-grow flex md:flex-col overflow-x-auto">
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
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b-[2px] border-[#171714] px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap">
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
            <span className="capitalize">
              {dateLabel} · {timeLabel}
            </span>
            <button
              onClick={() => setActiveTab("powiadomienia")}
              className="relative border-[2px] border-[#B7B6AE] rounded w-9 h-9 flex items-center justify-center text-[#171714] hover:border-[#171714]"
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
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
