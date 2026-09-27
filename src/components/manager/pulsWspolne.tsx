// @ts-nocheck
// Wspólne klocki zakładki Puls (0.57.0, makieta PulseCard / PulseDays /
// PulseAnalytics / PulseClosed / PulseConfig / PulseMobile): klasy, kafelek,
// panel z nagłówkiem, krok, chip, panel boczny. Na poziomie modułu, nie w
// komponentach — błąd #10 w CLAUDE.md.
import React from "react";
import { Check, X } from "lucide-react";

export const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
export const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
export const inputCls =
  "w-full h-12 md:h-11 border-[2px] border-[#171714] rounded-md bg-white px-3 text-[15px] text-[#171714] disabled:bg-[#F6F5F1] disabled:text-[#6E6E66] disabled:border-[#DEDCD4]";
export const podpowiedzCls = "text-[13px] leading-[18px] text-[#6E6E66]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40";
export const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
export const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
export const btnMalyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#F6F5F1] disabled:opacity-40";
export const btnMalyGlownyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#B8321A] disabled:opacity-40";
export const btnDuchCls =
  "inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-[13px] font-bold text-[#6E6E66] hover:bg-[#F6F5F1] hover:text-[#171714] disabled:opacity-40";
export const linkCls = "text-sm font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22]";

const grupuj = (n) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const zl = (n) => (n == null || Number.isNaN(n) ? "—" : `${n < 0 ? "−" : ""}${grupuj(n)} zł`);
export const f1 = (n) => (n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1).replace(".", ",").replace(",0", ""));
export const pctTxt = (n) => (n == null ? "—" : `${(Math.round(n * 10) / 10).toFixed(1).replace(".", ",")}%`);
// Różnica ze znakiem: "+14%", "−0,6 h", "+620 zł".
export const znak = (n, jednostka = "") => {
  if (n == null || Number.isNaN(n)) return "";
  const s = n > 0 ? "+" : n < 0 ? "−" : "±";
  if (jednostka === "zł") return `${s}${grupuj(n)} zł`;
  return `${s}${f1(Math.abs(n))}${jednostka ? (jednostka === "%" ? "%" : ` ${jednostka}`) : ""}`;
};
// Liczba wpisana z przecinkiem albo spacjami ("5 480,50").
export const liczbaZ = (tekst) => {
  const t = String(tekst ?? "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

const DNI = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
export const dzienTxt = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return `${DNI[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const godzTxt = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function Kafelek({ etykieta, duza, maly, pod, ton, hero, id }) {
  const kolor = ton === "bad" ? "#DE3A22" : ton === "warn" ? "#8A5300" : null;
  return (
    <div
      className={`${hero ? "bg-[#171714] text-white border-[2px] border-[#171714] rounded-xl" : kartaCls} px-4 md:px-5 py-4 flex flex-col gap-1.5 min-w-[200px] md:min-w-0 snap-start`}
      data-kafelek-pulsu={id}
    >
      <span className={`${etykietaCls} ${hero ? "!text-white/70" : ""}`}>{etykieta}</span>
      <span
        className="font-['Archivo'] text-[26px] leading-8 font-extrabold tabular-nums whitespace-nowrap"
        style={kolor ? { color: kolor } : undefined}
      >
        {duza}
        {maly != null && <small className={`text-[16px] font-bold ${hero ? "text-white/70" : "text-[#6E6E66]"}`}>{maly}</small>}
      </span>
      <span className={`text-[13px] leading-[18px] ${hero ? "text-white/75" : "text-[#6E6E66]"}`}>{pod}</span>
    </div>
  );
}

export function Kafelki({ children }) {
  return (
    <div className="flex md:grid md:grid-cols-4 gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 md:scroll-px-0 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
      {children}
    </div>
  );
}

export function Panel({ ikona: Ikona, tytul, prawo, children, krok, zrobiony, id, className = "", ramka }) {
  return (
    <div className={`${kartaCls} overflow-hidden ${className}`} style={ramka ? { borderColor: ramka } : undefined} data-panel-pulsu={id}>
      <div className="flex items-center gap-2.5 px-4 md:px-[18px] py-3 border-b-[1.5px] border-[#DEDCD4]">
        {krok != null && (
          <span
            className={`w-7 h-7 rounded-full grid place-items-center text-[13px] font-extrabold flex-shrink-0 ${
              zrobiony ? "bg-[#1F7A4A] text-white" : "bg-[#171714] text-white"
            }`}
          >
            {zrobiony ? <Check size={15} strokeWidth={3} /> : krok}
          </span>
        )}
        {Ikona && <Ikona size={17} className="flex-shrink-0" />}
        <h3 className="m-0 font-['Archivo'] font-extrabold text-base">{tytul}</h3>
        {prawo != null && <span className="ml-auto text-[13px] font-semibold text-[#6E6E66] text-right">{prawo}</span>}
      </div>
      {children}
    </div>
  );
}

export function Chip({ wlaczony, children, ...reszta }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center h-[34px] px-3 rounded-full border-[1.5px] text-[13px] font-semibold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
        wlaczony ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
      }`}
      {...reszta}
    >
      {children}
    </button>
  );
}

export function MiniTag({ children, ton }) {
  const kolor =
    ton === "warn" ? "bg-[#FDF0D8] text-[#8A5300]" : ton === "bad" ? "bg-[#FAEAE6] text-[#8A3A2B]" : ton === "ok" ? "bg-[#E2F3E9] text-[#1F7A4A]" : "bg-[#ECEBE6] text-[#171714]";
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-semibold whitespace-nowrap ${kolor}`}>{children}</span>
  );
}

export function Pole({ etykieta, children, podpowiedz }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={etykietaCls}>{etykieta}</span>
      {children}
      {podpowiedz && <span className={podpowiedzCls}>{podpowiedz}</span>}
    </div>
  );
}

// Panel z boku (na telefonie arkusz od dołu) — ten sam kształt co w Grafiku
// i Zadaniach.
export function PanelBoczny({ tytul, podtytul, onClose, stopka, children, id }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={tytul}
        className="fixed z-50 bg-white flex flex-col inset-x-0 bottom-0 top-12 rounded-t-2xl border-t-[2px] md:inset-y-0 md:right-0 md:left-auto md:top-0 md:w-[560px] md:rounded-none md:border-t-0 md:border-l-[2px] border-[#171714]"
        data-panel-boczny={id}
      >
        <div className="flex items-start gap-3 px-4 md:px-5 py-4 border-b-[2px] border-[#171714]">
          <div className="min-w-0">
            <h3 className="m-0 font-['Archivo'] text-xl font-extrabold">{tytul}</h3>
            {podtytul && <div className="text-sm text-[#6E6E66]">{podtytul}</div>}
          </div>
          <button type="button" onClick={onClose} className="ml-auto w-10 h-10 grid place-items-center rounded-lg hover:bg-[#F6F5F1]" aria-label="Zamknij">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-5 py-4 flex flex-col gap-4">{children}</div>
        <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-t-[2px] border-[#171714] pb-[max(12px,env(safe-area-inset-bottom))]">
          {stopka}
        </div>
      </aside>
    </>
  );
}
