// @ts-nocheck
// Rejestr godzin — układ z makiety właściciela z 2026-09-25 (design system
// "Shiftro", RegisterDesktop / RegisterMobile). Zasady:
//   1. ZAWSZE obok grafiku: każdy wiersz ma Grafik i Fakt, różnica pokazuje
//      się dopiero od 15 min ("≈" poniżej). Wpis bez zmiany w grafiku to
//      "Poza grafikiem", a nie różnica równa całej zmianie.
//   2. Sumy się nie znoszą: "vs grafik" pokazuje osobno godziny ponad plan i
//      poniżej planu — +48 h i −49 h to nie "−1 h, wszystko w porządku".
//   3. Grupowanie po DNIU (suma dnia) albo po PRACOWNIKU (suma do wypłaty).
//   4. Status pokazuje tylko wyjątki: trwa teraz, bez końca, do decyzji, poza
//      grafikiem, korekta · kto. "Zatwierdzone" to stan domyślny i nie powtarza
//      się w każdym wierszu.
//   5. Cały wiersz otwiera okno wpisu (WpisGodzinModal) — bez kolumny ołówków.
//
// ⚠️ Parowanie z grafikiem jest per (osoba, dzień), kolejnością godzin: i-ta
// zmiana dnia z i-tym wpisem grafiku, z KAŻDEGO lokalu. Osoba przeniesiona
// do sąsiedniego lokalu dalej ma swój grafik, a nie "poza grafikiem".
// Grafik = wiersze bez `deleted_at` (także niewysłane) — ta sama reguła co
// buildPlanFactMap i kafelek "plan vs fakt" na Pulpicie.
import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, Pencil, Plus, Search } from "lucide-react";
import { toLocalYMD, trimTime } from "../../utils/grafik";
import { pad, dlugosc, odmiana, DNI_KROTKIE } from "../../utils/czas";

const PROG_MIN = 15;
const MIESIACE = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec",
  "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const NBSP = " ";

const hhmm = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
// "10,6" — godziny z jednym miejscem, tysiące ze spacją.
const liczba1 = (min) => {
  const r = Math.round(((min || 0) / 60) * 10) / 10;
  const [c, d] = Math.abs(r).toFixed(1).split(".");
  return `${r < 0 ? "−" : ""}${c.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)},${d}`;
};
const roznica = (min) => {
  const a = Math.abs(min);
  return `${min > 0 ? "+" : "−"}${a < 60 ? `${a} min` : `${liczba1(a)} h`}`;
};
const dzienEtykieta = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return `${DNI_KROTKIE[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};
const kluczOsoby = (x) => String(x.user_id || x.user_name || "");

// --- klasy (tokeny "Shiftro") ---
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const linkCls = "text-sm font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22]";
const tagCls = (ton) =>
  `inline-flex items-center gap-1.5 h-[26px] px-2 rounded-md text-[13px] font-bold whitespace-nowrap ${
    {
      warn: "bg-[#FDF0D8] text-[#8A5300]",
      info: "bg-[#E3EEFB] text-[#1D5FA8]",
      neutral: "bg-[#ECEBE6] text-[#171714]",
    }[ton]
  }`;
// Kolumny tabeli na komputerze — nagłówek i wiersze MUSZĄ mieć tę samą siatkę.
const siatkaCls =
  "md:grid md:grid-cols-[minmax(140px,1.2fr)_minmax(110px,1fr)_104px_104px_60px_88px_minmax(150px,1.3fr)_20px] md:gap-x-3 md:items-center";

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md).
// ---------------------------------------------------------------------------
function Kafelek({ etykieta, children, ...reszta }) {
  return (
    <div
      className={`${kartaCls} px-[18px] pt-4 pb-[18px] flex flex-col gap-1 min-w-[80%] sm:min-w-[46%] md:min-w-0 snap-start`}
      {...reszta}
    >
      <span className={etykietaCls}>{etykieta}</span>
      {children}
    </div>
  );
}

function Duza({ children, jednostka, ton }) {
  return (
    <span
      className={`font-['Archivo'] text-[30px] md:text-[34px] leading-10 font-extrabold tabular-nums whitespace-nowrap ${
        ton === "up" ? "text-[#8A5300]" : ton === "down" ? "text-[#1D5FA8]" : "text-[#171714]"
      }`}
    >
      {children}
      {jednostka && <small className="text-[18px] font-bold ml-[3px] opacity-70">{jednostka}</small>}
    </span>
  );
}

function RoznicaZnak({ w }) {
  if (w.urlop) return <span className="text-[#6E6E66]">—</span>;
  if (w.delta == null || Math.abs(w.delta) < PROG_MIN) {
    return <span className="text-[#6E6E66]">{w.delta == null ? "—" : "≈"}</span>;
  }
  return (
    <span
      className={`inline-flex items-center h-[26px] px-2 rounded-md text-[14px] font-extrabold tabular-nums whitespace-nowrap ${
        w.delta < 0 ? "bg-[#E3EEFB] text-[#1D5FA8]" : "bg-[#FDF0D8] text-[#8A5300]"
      }`}
    >
      {roznica(w.delta)}
    </span>
  );
}

function Statusy({ w }) {
  return (
    <span className="flex flex-wrap gap-1.5 items-center">
      {w.live && (
        <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[#1F7A4A] whitespace-nowrap">
          <i className="w-2 h-2 rounded-full bg-[#1F7A4A]" />
          teraz · {Math.floor(w.minuty / 60)} h {w.minuty % 60} min
        </span>
      )}
      {w.bezKonca && <span className={tagCls("warn")}>Bez końca</span>}
      {w.decyzja && (
        <span className={tagCls("warn")}>
          <Clock size={14} strokeWidth={2.5} /> Do decyzji
        </span>
      )}
      {w.urlop && <span className={tagCls("info")}>Urlop</span>}
      {w.poza && <span className={tagCls("neutral")}>Poza grafikiem</span>}
      {w.korekta && (
        <span className={tagCls("neutral")}>
          <Pencil size={13} strokeWidth={2.5} /> Korekta · {w.korekta}
        </span>
      )}
    </span>
  );
}

function Wiersz({ w, onOpen, pierwszaKolumna }) {
  const s = w.s;
  const fakt = s.is_urlop ? "urlop" : `${hhmm(s.start_time)}–${s.end_time ? hhmm(s.end_time) : "…"}`;
  const otworz = () => onOpen(s);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={otworz}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          otworz();
        }
      }}
      className={`${siatkaCls} px-4 py-2.5 md:py-2 border-t-[1.5px] border-[#DEDCD4] cursor-pointer hover:bg-[#F6F5F1] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[#DE3A22]`}
      data-wiersz-rejestru={s.id}
    >
      {/* Telefon: dwie linijki + znaczniki pod spodem. */}
      <div className="md:hidden">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#171714] truncate">{pierwszaKolumna}</div>
            <div className="text-[13px] text-[#6E6E66] truncate">
              {s.stanowisko} · {s.lokal}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-bold tabular-nums text-[#171714]">
              {w.live || !s.end_time ? "—" : `${liczba1(w.minuty)} h`}
            </div>
            <div className="text-[13px] text-[#6E6E66] tabular-nums">
              {s.is_urlop ? "urlop" : `${hhmm(s.start_time)}–${s.end_time ? hhmm(s.end_time) : "teraz"}`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5 empty:hidden">
          {!w.urlop && w.delta != null && Math.abs(w.delta) >= PROG_MIN && <RoznicaZnak w={w} />}
          <Statusy w={w} />
        </div>
      </div>

      {/* Komputer: jedna linia w siatce kolumn. */}
      <div className="hidden md:block min-w-0">
        <div className="font-bold text-[#171714] truncate">{pierwszaKolumna}</div>
        <div className="text-[13px] leading-4 text-[#6E6E66] truncate">{s.stanowisko}</div>
      </div>
      <div className="hidden md:block text-sm text-[#171714] truncate">{s.lokal}</div>
      <div className="hidden md:block text-sm tabular-nums text-[#6E6E66]">
        {w.plan ? (
          `${trimTime(w.plan.start_time)}–${trimTime(w.plan.end_time)}`
        ) : (
          <i className="text-[13px]">{w.urlop ? "—" : "brak w grafiku"}</i>
        )}
      </div>
      <div className="hidden md:block text-sm font-bold tabular-nums text-[#171714]">{fakt}</div>
      <div className="hidden md:block text-right font-bold tabular-nums text-[#171714]">
        {w.live || !s.end_time ? <span className="text-[#6E6E66]">—</span> : liczba1(w.minuty)}
      </div>
      <div className="hidden md:flex justify-end">
        <RoznicaZnak w={w} />
      </div>
      <div className="hidden md:block min-w-0">
        <Statusy w={w} />
      </div>
      <ChevronRight size={18} className="hidden md:block text-[#6E6E66]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function RejestrGodzin({
  shifts,
  planShifts = [],
  issues = [],
  shiftEdits = [],
  matchesFilter,
  onEditShift,
  onNewShift,
  onNameClick,
  onGoToApprovals,
  ukryte = {}, // wpisy usuwane w tej chwili ("Cofnij" jeszcze możliwe)
}) {
  const dzis = new Date();
  const [month, setMonth] = useState(dzis.getMonth());
  const [year, setYear] = useState(dzis.getFullYear());
  const [search, setSearch] = useState("");
  const [grupa, setGrupa] = useState("dzien");
  const [filtr, setFiltr] = useState("wszystkie");

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth());
    setYear(d.getFullYear());
  };
  const isCurrentMonth = month === dzis.getMonth() && year === dzis.getFullYear();
  // Następny miesiąc po bieżącym nie ma jeszcze ani jednego faktu.
  const jestPrzyszly = year > dzis.getFullYear() || (year === dzis.getFullYear() && month >= dzis.getMonth());

  // --- decyzje i ślad ---
  const pendingByShiftId = {};
  issues
    .filter((iss) => iss.type === "correction" && iss.status === "nowe" && iss.shift_id)
    .forEach((iss) => (pendingByShiftId[iss.shift_id] = true));
  const edycje = {};
  shiftEdits.forEach((se) => {
    if (!se.shift_id) return;
    (edycje[se.shift_id] = edycje[se.shift_id] || []).push(se);
  });
  const ostatniaKorekta = (id) => {
    const lista = edycje[id];
    if (!lista || !lista.length) return null;
    return lista.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].editor_name || "—";
  };

  // --- parowanie z grafikiem, per (osoba, dzień) ---
  const odYMD = toLocalYMD(new Date(year, month, 1));
  const doYMD = toLocalYMD(new Date(year, month + 1, 0));
  const planDnia = {};
  planShifts.forEach((p) => {
    if (p.deleted_at || p.date < odYMD || p.date > doYMD) return;
    const k = `${kluczOsoby(p)}|${p.date}`;
    (planDnia[k] = planDnia[k] || []).push(p);
  });
  Object.values(planDnia).forEach((l) =>
    l.sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)))
  );
  const faktDnia = {};
  shifts.forEach((s) => {
    if (s.is_urlop || s.start_time.getMonth() !== month || s.start_time.getFullYear() !== year) return;
    const k = `${kluczOsoby(s)}|${toLocalYMD(s.start_time)}`;
    (faktDnia[k] = faktDnia[k] || []).push(s);
  });
  const planDla = {};
  Object.entries(faktDnia).forEach(([k, lista]) => {
    const plany = planDnia[k] || [];
    lista
      .slice()
      .sort((a, b) => a.start_time - b.start_time)
      .forEach((s, i) => (planDla[s.id] = plany[i] || null));
  });

  const dzisYMD = toLocalYMD(dzis);
  const wiersze = shifts
    .filter(
      (s) =>
        !ukryte[`usun:${s.id}`] &&
        matchesFilter(s.lokal) &&
        s.start_time.getMonth() === month &&
        s.start_time.getFullYear() === year
    )
    .map((s) => {
      const ymd = toLocalYMD(s.start_time);
      const plan = s.is_urlop ? null : planDla[s.id] || null;
      const live = !s.end_time && ymd === dzisYMD;
      const minuty = s.end_time
        ? Math.round((s.end_time - s.start_time) / 60000)
        : live
        ? Math.max(0, Math.floor((dzis - s.start_time) / 60000))
        : 0;
      const delta =
        plan && s.end_time
          ? minuty - (dlugosc(trimTime(plan.start_time), trimTime(plan.end_time)) || 0)
          : null;
      return {
        s,
        ymd,
        plan,
        live,
        minuty,
        delta,
        urlop: !!s.is_urlop,
        bezKonca: !s.end_time && !live,
        poza: !s.is_urlop && !plan,
        decyzja: !!pendingByShiftId[s.id],
        korekta: ostatniaKorekta(s.id),
      };
    });

  // --- filtr, wyszukiwanie ---
  const kategoria = {
    wszystkie: () => true,
    roznice: (w) => w.poza || (w.delta != null && Math.abs(w.delta) >= PROG_MIN),
    poza: (w) => w.poza,
    reczne: (w) => !!w.korekta,
    decyzja: (w) => w.decyzja,
  };
  const liczby = Object.fromEntries(
    Object.entries(kategoria).map(([k, f]) => [k, wiersze.filter(f).length])
  );
  const q = search.trim().toLowerCase();
  const widoczne = wiersze
    .filter(kategoria[filtr])
    .filter((w) => {
      if (!q) return true;
      const s = w.s;
      return `${s.user_name} ${s.stanowisko} ${s.lokal} ${dzienEtykieta(w.ymd)} ${w.ymd} ${hhmm(
        s.start_time
      )} ${hhmm(s.end_time)}`
        .toLowerCase()
        .includes(q);
    });

  // --- kafelki ---
  const zamkniete = wiersze.filter((w) => w.s.end_time);
  const minPracy = zamkniete.filter((w) => !w.urlop).reduce((a, w) => a + w.minuty, 0);
  const minUrlopu = zamkniete.filter((w) => w.urlop).reduce((a, w) => a + w.minuty, 0);
  const plus = wiersze.reduce((a, w) => a + (w.delta > 0 ? w.delta : 0), 0);
  const minus = wiersze.reduce((a, w) => a + (w.delta < 0 ? w.delta : 0), 0);
  const minPoza = zamkniete.filter((w) => w.poza).reduce((a, w) => a + w.minuty, 0);
  const wczoraj = new Date(dzis.getFullYear(), dzis.getMonth(), dzis.getDate() - 1);

  // Prośby pracowników o poprawkę — przypięte do wpisów tego miesiąca i te o
  // całkiem brakujący wpis ("Zapomniałem odbić").
  const czekaNaDecyzje =
    liczby.decyzja +
    issues.filter(
      (iss) =>
        iss.type === "correction" &&
        iss.status === "nowe" &&
        !iss.shift_id &&
        iss.proposed_date >= odYMD &&
        iss.proposed_date <= doYMD &&
        matchesFilter(iss.proposed_lokal)
    ).length;

  // --- CSV: lista wpisów z grafikiem obok, jak w tabeli ---
  const handleExportCsv = () => {
    const header = ["Data", "Pracownik", "Lokal", "Stanowisko", "Grafik", "Wejście", "Wyjście", "Godziny", "Różnica vs grafik (min)"];
    const lines = [header.join(";")];
    wiersze
      .slice()
      .sort((a, b) => a.s.start_time - b.s.start_time)
      .forEach((w) => {
        const s = w.s;
        lines.push(
          [
            s.start_time.toLocaleDateString("pl-PL"),
            s.user_name,
            s.lokal,
            s.stanowisko,
            w.plan ? `${trimTime(w.plan.start_time)}–${trimTime(w.plan.end_time)}` : "",
            hhmm(s.start_time),
            hhmm(s.end_time),
            s.end_time ? ((s.end_time - s.start_time) / 3600000).toFixed(2).replace(".", ",") : "",
            w.delta == null ? "" : w.delta,
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(";")
        );
      });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rejestr-godzin-${year}-${pad(month + 1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- grupy ---
  const naglowekDniaCls =
    "flex items-center gap-2 px-4 py-2.5 bg-[#F6F5F1] border-t-[2px] border-[#171714] first:border-t-0 font-bold text-[#171714]";
  const tabela = () => {
    if (widoczne.length === 0) {
      return (
        <div className="text-center py-12 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
          <b className="block text-[#171714] text-lg mb-1">Brak wpisów</b>
          {wiersze.length === 0 ? "W tym miesiącu nikt nic nie odbił." : "Zmień filtr albo wyszukiwanie."}
        </div>
      );
    }
    const naglowek = (
      <div className={`hidden ${siatkaCls} px-4 py-3 border-b-[2px] border-[#171714] ${etykietaCls}`}>
        <span>Pracownik</span>
        <span>Lokal</span>
        <span>Grafik</span>
        <span>Fakt</span>
        <span className="text-right">Godz.</span>
        <span className="text-right">vs grafik</span>
        <span>Status</span>
        <span />
      </div>
    );
    if (grupa === "dzien") {
      const dni = [...new Set(widoczne.map((w) => w.ymd))].sort().reverse();
      return (
        <div className={`${kartaCls} overflow-hidden`} data-tabela-rejestru>
          {naglowek}
          {dni.map((ymd) => {
            const lista = widoczne.filter((w) => w.ymd === ymd).sort((a, b) => a.s.start_time - b.s.start_time);
            const osob = new Set(lista.map((w) => kluczOsoby(w.s))).size;
            const suma = lista.reduce((a, w) => a + (w.s.end_time ? w.minuty : 0), 0);
            return (
              <div key={ymd}>
                <div className={naglowekDniaCls} data-dzien-rejestru={ymd}>
                  <span>{dzienEtykieta(ymd)}</span>
                  <span className="font-semibold text-[#6E6E66]">
                    · {osob} {odmiana(osob, ["osoba", "osoby", "osób"])}
                  </span>
                  <span className="ml-auto tabular-nums">
                    {lista.every((w) => w.live) ? "w toku" : `${liczba1(suma)} h`}
                  </span>
                </div>
                {lista.map((w) => (
                  <Wiersz key={w.s.id} w={w} onOpen={onEditShift} pierwszaKolumna={w.s.user_name} />
                ))}
              </div>
            );
          })}
        </div>
      );
    }
    const osoby = [...new Set(widoczne.map((w) => kluczOsoby(w.s)))]
      .map((k) => widoczne.filter((w) => kluczOsoby(w.s) === k))
      .sort((a, b) => a[0].s.user_name.localeCompare(b[0].s.user_name));
    return (
      <div className={`${kartaCls} overflow-hidden`} data-tabela-rejestru>
        {naglowek}
        {osoby.map((lista) => {
          const s0 = lista[0].s;
          const suma = lista.reduce((a, w) => a + (w.s.end_time ? w.minuty : 0), 0);
          const delta = lista.reduce((a, w) => a + (w.delta || 0), 0);
          const dni = new Set(lista.map((w) => w.ymd)).size;
          return (
            <div key={kluczOsoby(s0)}>
              <div
                className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 md:gap-x-8 items-center px-4 py-3 bg-[#F6F5F1] border-t-[2px] border-[#171714] first:border-t-0"
                data-osoba-rejestru={s0.user_name}
              >
                <div className="min-w-0">
                  <div className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] truncate">
                    {s0.user_name}
                  </div>
                  <div className="text-[13px] text-[#6E6E66] truncate">
                    {s0.stanowisko} · {s0.lokal}
                    {s0.user_id && onNameClick && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-[#DE3A22]"
                          onClick={() => onNameClick(s0.user_id, s0.start_time)}
                        >
                          raport
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {[
                  ["Dni", dni],
                  ["vs grafik", Math.abs(delta) < PROG_MIN ? "≈" : roznica(delta)],
                  ["Suma", `${liczba1(suma)} h`],
                ].map(([e, v]) => (
                  <div key={e} className="text-right">
                    <small className={`${etykietaCls} block`}>{e}</small>
                    <b className="tabular-nums text-[#171714]">{v}</b>
                  </div>
                ))}
              </div>
              {lista
                .slice()
                .sort((a, b) => b.s.start_time - a.s.start_time)
                .map((w) => (
                  <Wiersz key={w.s.id} w={w} onOpen={onEditShift} pierwszaKolumna={dzienEtykieta(w.ymd)} />
                ))}
            </div>
          );
        })}
      </div>
    );
  };

  const FILTRY = [
    ["wszystkie", "Wszystkie"],
    ["roznice", `Różnice > ${PROG_MIN} min`],
    ["poza", "Poza grafikiem"],
    ["reczne", "Korekty ręczne"],
    ["decyzja", "Do decyzji"],
  ];

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col gap-5" data-rejestr>
      {/* Nagłówek: tytuł, miesiąc, eksport, dodaj */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="hidden md:block font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714] mr-2">
          Rejestr godzin
        </h2>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex-1 md:flex-none flex items-center h-12 md:h-11 border-[2px] border-[#171714] rounded-lg bg-white">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Poprzedni miesiąc"
              className="w-11 h-full grid place-items-center text-[#171714] hover:bg-[#F6F5F1] rounded-l-md"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="flex-1 md:w-[150px] text-center font-['Archivo'] font-bold text-[15px] text-[#171714]" data-miesiac-rejestru>
              {MIESIACE[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Następny miesiąc"
              disabled={jestPrzyszly}
              className="w-11 h-full grid place-items-center text-[#171714] hover:bg-[#F6F5F1] rounded-r-md disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {/* Powrót do bieżącego miesiąca (prośba właściciela z 2026-09-25) —
              tylko wtedy, gdy oglądamy inny. */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => {
                setMonth(dzis.getMonth());
                setYear(dzis.getFullYear());
              }}
              className={`${btnObrysCls} px-3.5`}
              data-biezacy-miesiac
            >
              Bieżący miesiąc
            </button>
          )}
        </div>
        <span className="hidden md:block flex-1" />
        <button type="button" onClick={handleExportCsv} className={`${btnObrysCls} hidden md:inline-flex`}>
          <Download size={18} /> Eksport CSV
        </button>
        <button type="button" onClick={onNewShift} className={`${btnGlownyCls} hidden md:inline-flex`}>
          <Plus size={18} /> Dodaj wpis
        </button>
      </div>

      {/* Kafelki — na telefonie karuzela, jak na Pulpicie */}
      <div
        className="flex md:grid md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]"
        data-kafelki-rejestru
      >
        <Kafelek etykieta="Przepracowane">
          <Duza jednostka="h">{liczba1(minPracy)}</Duza>
          <span className="text-sm text-[#6E6E66]">
            {minUrlopu > 0 ? (
              <>
                + urlop <b className="text-[#171714] tabular-nums">{liczba1(minUrlopu)} h</b> ={" "}
                {liczba1(minPracy + minUrlopu)} h
              </>
            ) : (
              "bez urlopów w tym miesiącu"
            )}
          </span>
          <span className="text-[13px] text-[#6E6E66]">
            {isCurrentMonth
              ? `dane do ${pad(wczoraj.getDate())}.${pad(wczoraj.getMonth() + 1)} · dziś w toku`
              : "cały miesiąc"}
          </span>
        </Kafelek>
        <Kafelek etykieta="vs grafik">
          <span className="flex gap-4 items-baseline">
            <Duza jednostka="h" ton="up">
              +{liczba1(plus)}
            </Duza>
            <Duza jednostka="h" ton="down">
              −{liczba1(Math.abs(minus))}
            </Duza>
          </span>
          <span className="text-sm text-[#6E6E66]">ponad plan · poniżej planu</span>
          <button type="button" className={`${linkCls} self-start mt-auto pt-1`} onClick={() => setFiltr("roznice")}>
            {liczby.roznice} {odmiana(liczby.roznice, ["wpis", "wpisy", "wpisów"])} &gt; {PROG_MIN} min
          </button>
        </Kafelek>
        <Kafelek etykieta="Poza grafikiem">
          <Duza jednostka="h">{liczba1(minPoza)}</Duza>
          <span className="text-sm text-[#6E6E66]">wpisy bez zmiany w grafiku</span>
          <button type="button" className={`${linkCls} self-start mt-auto pt-1`} onClick={() => setFiltr("poza")}>
            Pokaż {liczby.poza}
          </button>
        </Kafelek>
        <Kafelek etykieta="Korekty ręczne">
          <Duza>{liczby.reczne}</Duza>
          <span className="text-sm text-[#6E6E66]">kto i dlaczego — w historii wpisu</span>
          <button type="button" className={`${linkCls} self-start mt-auto pt-1`} onClick={() => setFiltr("reczne")}>
            Pokaż
          </button>
        </Kafelek>
      </div>

      {czekaNaDecyzje > 0 && (
        <div className={`${kartaCls} flex items-center gap-3 px-4 py-3`} data-rejestr-decyzje>
          <Clock size={20} className="flex-shrink-0" />
          <span className="flex-1 text-[15px] text-[#171714]">
            <b>
              {czekaNaDecyzje} {odmiana(czekaNaDecyzje, ["wpis czeka", "wpisy czekają", "wpisów czeka"])} na
              decyzję
            </b>
            <span className="hidden md:inline">
              {" "}
              — zgłoszone poprawki nie trafią do rozliczenia, dopóki ich nie zatwierdzisz.
            </span>
          </span>
          {onGoToApprovals && (
            <button
              type="button"
              onClick={onGoToApprovals}
              className={`${btnObrysCls} min-h-[40px] md:min-h-[40px] px-3 text-sm`}
            >
              Zatwierdzanie <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}

      {/* Wyszukiwanie, grupowanie, filtry */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="hidden md:block relative flex-1 min-w-[240px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6E6E66]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj: imię, stanowisko, data, godzina…"
            className="w-full h-11 pl-10 pr-3 border-[2px] border-[#171714] rounded-lg bg-white text-[15px]"
          />
        </span>
        <span className={`hidden md:block ${etykietaCls}`}>Grupuj</span>
        <div className="flex border-[2px] border-[#171714] rounded-lg overflow-hidden bg-white">
          {[
            ["dzien", "Dzień"],
            ["pracownik", "Pracownik"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setGrupa(k)}
              className={`h-11 px-4 font-['Archivo'] font-bold text-[15px] ${
                grupa === k ? "bg-[#171714] text-white" : "text-[#171714] hover:bg-[#F6F5F1]"
              }`}
              data-grupa={k}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="w-full flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap [scrollbar-width:none]">
          {FILTRY.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltr(k)}
              className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
                filtr === k
                  ? "bg-[#171714] border-[#171714] text-white"
                  : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-filtr={k}
            >
              {l}{" "}
              <span className={`tabular-nums ${filtr === k ? "text-white/70" : "text-[#6E6E66]"}`}>
                {liczby[k]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {tabela()}

      <div className="hidden md:flex gap-2.5 items-start text-sm text-[#6E6E66]">
        <Clock size={18} className="flex-shrink-0 mt-0.5" />
        <span>
          Różnica liczona od zmiany w Grafiku; poniżej {PROG_MIN} min pokazujemy „≈”. Każda zmiana zapisuje, kto,
          kiedy i dlaczego.
        </span>
      </div>

      {/* Telefon: "Dodaj wpis" pod kciukiem, nad dolnym paskiem zakładek. */}
      <button
        type="button"
        onClick={onNewShift}
        className={`${btnGlownyCls} md:hidden fixed right-4 bottom-24 z-30 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.22)]`}
      >
        <Plus size={18} /> Dodaj wpis
      </button>
    </div>
  );
}
