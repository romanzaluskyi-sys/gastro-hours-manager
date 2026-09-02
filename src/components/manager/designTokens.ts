// @ts-nocheck
// Ten sam język wizualny co employeeSessionShared.tsx (patrz stałe tam:
// fieldLabelCls, ctaPrimaryCls itd.) — tu wersja pod desktopowy Panel
// Kierownika: te same kolory/font, inny layout (sidebar, tabele, karty
// w gridzie zamiast pełnoekranowych ekranów mobile).
export const COLORS = {
  ink: "#171714",
  accent: "#DE3A22",
  accentSoft: "#FAEAE6",
  accentSoftText: "#8A3A2B",
  surface: "#F1F1EE",
  surfaceAlt: "#E7E7E2",
  border: "#B7B6AE",
  muted: "#6E6E66",
  mutedLight: "#8F8E86",
};

export const shellSidebarCls = "bg-[#171714] text-white flex flex-col flex-shrink-0";
export const shellNavBtnCls = (active) =>
  `w-full text-left px-4 py-3 flex items-center gap-2.5 font-['Archivo'] font-bold text-[14px] border-l-[3px] whitespace-nowrap ${
    active
      ? "border-[#DE3A22] bg-white/5 text-white"
      : "border-transparent text-[#B7B6AE] hover:bg-white/5 hover:text-white"
  }`;
export const shellBadgeCls =
  "ml-auto bg-[#DE3A22] text-white text-[11px] font-extrabold min-w-[20px] h-5 rounded flex items-center justify-center px-1.5";
export const lokalTabCls = (active) =>
  `px-4 py-2.5 rounded font-['Archivo'] font-bold text-sm border-[2px] whitespace-nowrap ${
    active
      ? "bg-[#171714] text-white border-[#171714]"
      : "bg-white text-[#171714] border-[#B7B6AE] hover:border-[#171714]"
  }`;
export const cardCls = "bg-white rounded-xl border-[2px] border-[#171714] p-4";
export const statTileCls = "bg-white rounded-xl border-[2px] border-[#171714] p-4";
export const statLabelCls =
  "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]";
export const statValueCls = "font-['Archivo'] font-extrabold text-[28px] text-[#171714]";
export const statSubCls = "text-[13px] text-[#6E6E66] mt-0.5";
export const sectionCardCls =
  "bg-white rounded-xl border-[2px] border-[#171714] overflow-hidden";
export const sectionHeaderCls =
  "px-4 py-3 border-b-[2px] border-[#171714] font-['Archivo'] font-extrabold text-[15px] flex items-center justify-between";
export const pageTitleCls = "font-['Archivo'] font-extrabold text-2xl text-[#171714]";
export const btnPrimaryCls =
  "bg-[#DE3A22] text-white font-['Archivo'] font-bold text-sm px-4 py-2.5 rounded hover:opacity-90 disabled:opacity-50";
export const btnSecondaryCls =
  "bg-white text-[#171714] font-['Archivo'] font-bold text-sm px-4 py-2.5 rounded border-[2px] border-[#171714] hover:bg-[#F1F1EE] disabled:opacity-50";

// Zadania i sprzątanie — pasek postępu i wiersz zadania na desktopie
// (kiosk/konto osobiste mają własny checkboxRowCls w employeeSessionShared.tsx,
// to jest gęstszy odpowiednik pod Panel Kierownika).
export const progressTrackCls = "h-2.5 rounded-full bg-[#E7E7E2] overflow-hidden";
export const progressFillStyle = (pct) => ({
  width: `${Math.max(0, Math.min(100, pct))}%`,
  backgroundColor: COLORS.ink,
});
export const taskRowCls =
  "flex items-start gap-3 px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0";
