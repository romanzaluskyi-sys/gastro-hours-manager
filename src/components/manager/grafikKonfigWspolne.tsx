// @ts-nocheck
// Wspólne klocki Konfiguracji Grafiku — układ z makiety właściciela (0.68.0,
// ScheduleConfigObsada / ScheduleConfigBudget / ScheduleConfigExceptions /
// ScheduleConfigNewException / ScheduleConfigMobile). Używają ich
// GrafikWymagania.tsx (Obsada, Wyjątki) i GrafikBudzetKonfiguracja.tsx (Budżet).
//
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md) — wewnątrz rodzica
// traciłyby fokus pól przy każdym renderze.
import React, { useState } from "react";
import { AlertTriangle, ChevronRight, Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { trimTime, parseDays } from "../../utils/grafik";

// --- klasy (tokeny "Shiftro", te same co w Ustawieniach) ---
export const panelCls = "bg-white border-[2px] border-[#171714] rounded-xl overflow-hidden";
export const etykietaCls = "block text-[12px] leading-4 font-extrabold tracking-[0.06em] uppercase text-[#6E6E66] mb-1.5";
export const poleCls =
  "h-12 border-[2px] border-[#171714] rounded-md bg-white px-3 text-[17px] font-bold text-[#171714] tabular-nums min-w-0";
export const notaCls = "text-[14px] leading-5 text-[#6E6E66]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40";
export const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] enabled:hover:bg-[#F6F5F1]`;
export const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white enabled:hover:bg-[#B8321A] enabled:hover:border-[#B8321A]`;
export const btnUsunCls = `${btnCls} border-[#DE3A22] bg-white text-[#DE3A22] enabled:hover:bg-[#FBEAE6]`;
export const btnMalyCls =
  "inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#F6F5F1] disabled:opacity-40";
export const ikonaBtnCls =
  "w-10 h-10 rounded-lg border-[2px] border-[#DEDCD4] bg-white grid place-items-center text-[#171714] hover:border-[#171714] flex-shrink-0";
export const dodajCls =
  "inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border-[2px] border-dashed border-[#B7B6AE] bg-transparent font-bold text-[15px] text-[#171714] hover:border-[#171714]";

// Tydzień od poniedziałku; indeksy to Date.getDay() (0 = niedziela), tak samo
// jak w tasks.days_of_week i staffing_rules.days_of_week.
export const DNI = [
  { idx: 1, label: "Pn", pelna: "Poniedziałek" },
  { idx: 2, label: "Wt", pelna: "Wtorek" },
  { idx: 3, label: "Śr", pelna: "Środa" },
  { idx: 4, label: "Cz", pelna: "Czwartek" },
  { idx: 5, label: "Pt", pelna: "Piątek" },
  { idx: 6, label: "Sb", pelna: "Sobota" },
  { idx: 0, label: "Nd", pelna: "Niedziela" },
];
const MIES_KROTKO = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MIES_PELNE = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

export const f1 = (x) => (Math.round((x || 0) * 10) / 10).toFixed(1).replace(".", ",");
export const naMinuty = (t) => {
  const [h, m] = String(trimTime(t) || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
// Koniec przed startem = przez północ (tak liczy kontrola obsady).
export const dlugoscMin = (od, doG) => {
  let r = naMinuty(doG) - naMinuty(od);
  if (r <= 0) r += 1440;
  return r;
};
// „wrz 2026” — krótka etykieta zestawu.
export const miesiacKrotko = (ymd) => {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  return `${MIES_KROTKO[d.getMonth()]} ${d.getFullYear()}`;
};
// „codziennie”, „Pn–Pt”, „Śr–Nd”, „Sb”, „Pn, Śr, Pt”.
export const dniTekst = (dni) => {
  if (!dni || dni.length === 7) return "codziennie";
  const kolej = DNI.map((d) => d.idx).filter((i) => dni.includes(i));
  const poz = kolej.map((i) => DNI.findIndex((d) => d.idx === i));
  const ciag = poz.length > 2 && poz[poz.length - 1] - poz[0] === poz.length - 1;
  if (ciag) return `${DNI[poz[0]].label}–${DNI[poz[poz.length - 1]].label}`;
  return poz.map((p) => DNI[p].label).join(", ");
};
// Kafel daty: „17 paź” + „sob”, zakres „24–26 gru”.
const DNI_TYG = ["nd", "pn", "wt", "śr", "cz", "pt", "sob"];
export const kafelDaty = (od, doD) => {
  const a = new Date(od + "T00:00:00");
  const b = new Date((doD || od) + "T00:00:00");
  if (!doD || doD === od) return [`${a.getDate()} ${MIES_KROTKO[a.getMonth()]}`, DNI_TYG[a.getDay()]];
  if (a.getMonth() === b.getMonth()) return [`${a.getDate()}–${b.getDate()} ${MIES_KROTKO[b.getMonth()]}`, `${Math.round((b - a) / 86400000) + 1} dni`];
  return [`${a.getDate()} ${MIES_KROTKO[a.getMonth()]}–${b.getDate()} ${MIES_KROTKO[b.getMonth()]}`, `${Math.round((b - a) / 86400000) + 1} dni`];
};
export const osobyTekst = (n) => {
  const ost = n % 10;
  const dwie = n % 100;
  if (n === 1) return "osoba";
  if (ost >= 2 && ost <= 4 && !(dwie >= 12 && dwie <= 14)) return "osoby";
  return "osób";
};

// Ile osób potrzeba w godzinie [h, h+1) w dzień `dow` — wymagania się SUMUJĄ.
export const ileWGodzinie = (reguly, dow, h) =>
  reguly.reduce((n, r) => {
    const dni = parseDays(r.days_of_week);
    if (dni && !dni.includes(dow)) return n;
    const od = naMinuty(r.start_time);
    const doM = od + dlugoscMin(r.start_time, r.end_time);
    return od < (h + 1) * 60 && doM > h * 60 ? n + (Number(r.required_count) || 1) : n;
  }, 0);

// Osobogodziny wymagań w dzień `dow` — liczy je siatka Obsady i zakładka Budżet.
export const osGodzinDnia = (reguly, dow) =>
  reguly.reduce((s, r) => {
    const dni = parseDays(r.days_of_week);
    if (dni && !dni.includes(dow)) return s;
    return s + (dlugoscMin(r.start_time, r.end_time) / 60) * (Number(r.required_count) || 1);
  }, 0);

export function Panel({ tytul, prawa, children, dane, klasa = "" }) {
  return (
    <section className={`${panelCls} ${klasa}`} {...dane}>
      {tytul && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 md:px-[18px] py-3 border-b-[1.5px] border-[#DEDCD4]">
          <h3 className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] mr-auto">{tytul}</h3>
          {prawa}
        </header>
      )}
      {children}
    </section>
  );
}

// Pasek wersji: chipy „od wrz 2026 · obowiązuje” › „od paź 2026 · od 1 paź”,
// „Nowy zestaw od…” (miesiąc + Kopia bieżącego / Pusty) i menu ⋯ z usuwaniem,
// potwierdzanym w pasku pod spodem (ze skutkiem, zamiast okna przeglądarki).
export function PasekWersji({
  etykieta,
  wersje, // ["2026-09-01", …]
  aktywna,
  obowiazujaca,
  dzis,
  onWybierz,
  onUtworz, // (obowiazujeOd, kopiuj) => Promise
  onUsun, // () => Promise (już po potwierdzeniu)
  skutekUsuniecia, // tekst: co się stanie
  opisKopii, // „3 wymagania”, „7 dni”
  zapisuje,
}) {
  const [nowy, setNowy] = useState(null); // { od, kopiuj }
  const [menu, setMenu] = useState(false);
  const [pytanie, setPytanie] = useState(false);
  const posortowane = [...wersje].sort();
  const miesiace = Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }).filter((od) => !posortowane.includes(od));
  return (
    <>
      <div
        className="grid grid-cols-[1fr_auto] md:grid-cols-[auto_1fr_auto] gap-x-3.5 gap-y-2 items-center bg-white border-[2px] border-[#B7B6AE] rounded-xl px-3 md:px-3.5 py-2.5"
        data-pasek-wersji
      >
        <span className={`${etykietaCls} !mb-0 col-span-2 md:col-span-1`}>{etykieta}</span>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {posortowane.map((od, i) => {
            const on = od === aktywna;
            const stan = od === obowiazujaca ? "obowiązuje" : od > dzis ? `od 1 ${miesiacKrotko(od).split(" ")[0]}` : "archiwalny";
            return (
              <React.Fragment key={od}>
                <button
                  type="button"
                  onClick={() => onWybierz(od)}
                  aria-pressed={on}
                  data-wersja={od}
                  className={`text-left px-3 py-1.5 rounded-lg border-[2px] ${
                    on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#B7B6AE] text-[#171714] hover:border-[#171714]"
                  }`}
                >
                  <span className={`text-[13px] ${on ? "text-white/80" : "text-[#6E6E66]"}`}>od </span>
                  <b className="text-[16px]">{miesiacKrotko(od)}</b>
                  <span
                    className={`block text-[12px] font-bold ${
                      on ? "text-white/80" : od === obowiazujaca ? "text-[#1F7A4A]" : "text-[#6E6E66]"
                    }`}
                  >
                    {stan}
                  </span>
                </button>
                {i < posortowane.length - 1 && <ChevronRight size={16} className="text-[#6E6E66]" />}
              </React.Fragment>
            );
          })}
          <button
            type="button"
            onClick={() => setNowy(nowy ? null : { od: miesiace[0] || "", kopiuj: !!aktywna })}
            className={`${dodajCls} !min-h-[44px]`}
            data-nowy-zestaw
          >
            <Plus size={17} /> Nowy zestaw od…
          </button>
        </div>
        {aktywna && (
          <div className="relative row-start-2 col-start-2 md:row-start-auto md:col-start-auto">
            <button type="button" onClick={() => setMenu(!menu)} className={ikonaBtnCls} aria-label="Więcej" data-menu-wersji>
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="absolute right-0 top-[46px] z-20 min-w-[260px] bg-white border-[2px] border-[#171714] rounded-lg p-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    setPytanie(true);
                  }}
                  className="w-full flex items-center gap-2 min-h-[44px] px-2.5 rounded-md text-left font-bold text-[15px] text-[#DE3A22] hover:bg-[#ECEBE6]"
                  data-usun-zestaw
                >
                  <Trash2 size={18} /> Usuń zestaw od {miesiacKrotko(aktywna)}
                </button>
              </div>
            )}
          </div>
        )}
        {nowy && (
          <div className="col-span-full grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 md:gap-x-4 items-end pt-2.5 border-t-[1.5px] border-[#DEDCD4]">
            <label className="flex flex-col">
              <span className={etykietaCls}>Od miesiąca</span>
              <select value={nowy.od} onChange={(e) => setNowy({ ...nowy, od: e.target.value })} className={`${poleCls} font-semibold`}>
                {miesiace.map((od) => {
                  const d = new Date(od + "T00:00:00");
                  return (
                    <option key={od} value={od}>
                      {MIES_PELNE[d.getMonth()]} {d.getFullYear()}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="flex flex-col">
              <span className={etykietaCls}>Zacznij od</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  [true, Copy, "Kopia bieżącego", aktywna ? `${opisKopii} z „od ${miesiacKrotko(aktywna)}”` : "nie ma z czego kopiować"],
                  [false, Plus, "Pusty", "wszystko od zera"],
                ].map(([kop, Ik, tytul, opis]) => (
                  <button
                    key={tytul}
                    type="button"
                    disabled={kop && !aktywna}
                    onClick={() => setNowy({ ...nowy, kopiuj: kop })}
                    aria-pressed={nowy.kopiuj === kop}
                    className={`flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border-[2px] disabled:opacity-40 ${
                      nowy.kopiuj === kop ? "border-[#171714] shadow-[inset_0_0_0_2px_#171714]" : "border-[#B7B6AE]"
                    }`}
                  >
                    <Ik size={20} className="flex-none" />
                    <span>
                      <b className="block text-[15px]">{tytul}</b>
                      <small className="text-[13px] text-[#6E6E66]">{opis}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnGlownyCls}
                disabled={zapisuje || !nowy.od}
                onClick={async () => {
                  await onUtworz(nowy.od, nowy.kopiuj);
                  setNowy(null);
                }}
                data-utworz-zestaw
              >
                Utwórz zestaw
              </button>
              <button type="button" className={btnObrysCls} onClick={() => setNowy(null)}>
                Anuluj
              </button>
            </div>
            <p className={`${notaCls} md:col-span-2 !mt-0`}>
              Zestaw obowiązuje od swojego miesiąca, aż pojawi się nowszy — nie trzeba wypełniać każdego miesiąca.
            </p>
          </div>
        )}
      </div>
      {pytanie && (
        <div
          className="flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 border-[2px] border-[#DE3A22] rounded-lg bg-[#FBEAE6] text-[15px]"
          data-pytanie-usun-zestaw
        >
          <AlertTriangle size={20} className="text-[#DE3A22] flex-none" />
          <span className="flex-1 min-w-[220px]">
            Usunąć zestaw <b>od {miesiacKrotko(aktywna)}</b>? {skutekUsuniecia}
          </span>
          <button type="button" className={btnObrysCls} onClick={() => setPytanie(false)}>
            Anuluj
          </button>
          <button
            type="button"
            className={btnUsunCls}
            disabled={zapisuje}
            onClick={async () => {
              await onUsun();
              setPytanie(false);
            }}
            data-potwierdz-usun-zestaw
          >
            Usuń zestaw
          </button>
        </div>
      )}
    </>
  );
}

// Zakładki Obsada · Budżet · Wyjątki — podkreślenie czerwoną kreską.
export function Zakladki({ zakladki, aktywna, onWybierz }) {
  return (
    <div className="flex gap-0 md:gap-2 border-b-[2px] border-[#B7B6AE] -mx-4 px-2 md:mx-0 md:px-0">
      {zakladki.map(({ key, label, Icon, licznik }) => {
        const on = aktywna === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onWybierz(key)}
            aria-pressed={on}
            data-zakladka-konfiguracji={key}
            className={`flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 md:gap-2 h-12 px-1 md:px-4 -mb-[2px] border-b-[3px] font-['Archivo'] font-extrabold text-[15px] md:text-[17px] ${
              on ? "border-[#DE3A22] text-[#171714]" : "border-transparent text-[#6E6E66]"
            }`}
          >
            <Icon size={20} />
            {label}
            {licznik > 0 && (
              <i className="not-italic text-[12px] min-w-[20px] h-5 rounded-full bg-[#ECEBE6] text-[#171714] grid place-items-center px-1.5">
                {licznik}
              </i>
            )}
          </button>
        );
      })}
    </div>
  );
}
