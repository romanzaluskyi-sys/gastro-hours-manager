// @ts-nocheck
// Grafik → siatka tygodnia (i dnia) — układ z makiety właściciela z
// 2026-09-25 (design system "Shiftro", ScheduleWeek / ScheduleMobile).
//
// Jedna sekcja na lokal (wybór lokalu robi górny pasek ManagerShell). W
// sekcji: cztery kafelki (koszt tygodnia, koszt wobec prognozy, braki obsady,
// nadmiar), potem siatka ludzie × dni. Nad sekcjami pasek „Giełda zmian” z
// prośbami czekającymi na zgodę kierownika.
//
// Rzeczy, których nie widać:
//   • Nagłówek dnia mówi, ile osób, ile godzin, ile kosztuje i jaki to
//     procent prognozy, a pod spodem stoją etykiety obsady: czerwona „−1 KUCH
//     14–19” jest PRZYCISKIEM, który otwiera panel przypisania z tą luką;
//     bursztynowa „+2 …” tylko ostrzega („?” = poza wymaganiami).
//   • Kratka pokazuje stan szkicu: nowa zmiana (nigdy niewysłana) ma
//     przerywaną czerwoną ramkę, zmieniona po wysłaniu — bursztynowe tło,
//     usunięta po wysłaniu — przekreślenie do publikacji (kliknięcie w Edycji
//     przywraca). Zmiana w innym lokalu to kreskowany „duch”.
//   • Usunięcie zmiany idzie z 6 s „Cofnij” (useOdlozoneDecyzje) — bez
//     window.confirm. Zapis rusza dopiero po 6 s.
//   • Na telefonie siatka tygodnia nie mieści się, więc jest pasek siedmiu
//     dni (kropka czerwona = brak, bursztynowa = nadmiar) i widok JEDNEGO dnia.
//
// Cała arytmetyka (dziury w obsadzie, godziny zmian, przez północ, koszt)
// żyje w utils/grafik.ts, utils/budzet.ts i utils/kodeks.ts.
import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CopyPlus,
  Download,
  Plus,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "../../api/supabase";
import { createEmployeeNotification } from "../../api/notifications";
import GrafikZmianaModal, { GrafikBlokadaModal } from "./GrafikZmianaModal";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";
import {
  trimTime,
  shiftHours,
  checkDayCoverage,
  getRulesForDate,
  addDaysYMD,
  toLocalYMD,
  findOverlappingPlanShift,
  findBlockingAbsence,
  poOstatnimDniu,
  buildCopyFromPreviousWeek,
  storedStanowiskaArr,
  isUnpublished,
  problemyObsady,
  isSameUser,
  absenceOn,
  krotkaGodzina,
} from "../../utils/grafik";
import { budzetDnia, budzetTygodnia, zl, pct0, pct1 } from "../../utils/budzet";
import { WierszeBudzetu } from "./GrafikBudzet";
import { activeSwapFor, pendingSwapDelta, wycofajOfertyDlaZmian, wzajemnaZmiana } from "../../utils/swaps";
import { addUrlopDirectly, addNiedostepnoscDirectly } from "../../utils/absences";
import { stanowiskoShort, findStanowisko } from "../../utils/stanowiska";
import { normaMiesiaca } from "../../utils/umowy";
import { ostrzezeniaKodeksu } from "../../utils/kodeks";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { fetchDailyForecast, describeWeatherCode } from "../../utils/weather";

const KOL_PRACOWNIK = 210;
const KOL_DZIEN = 140;

const DNI = ["nd", "pn", "wt", "śr", "czw", "pt", "sob"];
const hLiczba = (h) => String(Math.round((h || 0) * 10) / 10).replace(".", ",");
const fmtH = (h) => `${hLiczba(h)} h`;
const fmtDay = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
const dzienKrotko = (d) => `${DNI[new Date(d + "T00:00:00").getDay()]} ${fmtDay(d)}`;

// Polska odmiana: 1 zmianę, 2–4 zmiany, 5+ zmian (poza 12–14).
const zmianyLabel = (n) => {
  const ost = n % 10;
  const dwie = n % 100;
  if (n === 1) return "1 zmianę";
  if (ost >= 2 && ost <= 4 && !(dwie >= 12 && dwie <= 14)) return `${n} zmiany`;
  return `${n} zmian`;
};

// Pełny, nasycony kolor stanowiska z Ustawień (zarezerwowany właśnie dla
// Grafiku — patrz "stanowiska" w CLAUDE.md). Bez koloru: szary znacznik.
const znacznikStyle = (activeStanowiska, lokal, nazwa) => {
  const st = findStanowisko(activeStanowiska, lokal, nazwa) || findStanowisko(activeStanowiska, null, nazwa);
  return st && st.kolor ? { backgroundColor: st.kolor, color: "#fff" } : { backgroundColor: "#ECEBE6", color: "#171714" };
};

// Stan zmiany w szkicu: "nowa" (nigdy niewysłana), "zmieniona" (po wysłaniu)
// albo null (wysłana i bez zmian). Usunięte przychodzą osobną listą.
const stanSzkicu = (s) => (!s.published_at ? "nowa" : isUnpublished(s) ? "zmieniona" : null);

// Podpowiedź pod kursorem przy nazwisku — liczby, które nie zmieściły się w
// kolumnie osoby.
const opisOsoby = (meta) => {
  const czesci = [`${hLiczba(meta.hours)} h w miesiącu`, `${meta.zmian} zmian`];
  if (meta.koszt != null) czesci.push(`${Math.round(meta.koszt)} zł`);
  if (Math.abs(meta.swapDelta) > 0.01) {
    czesci.push(`${meta.swapDelta > 0 ? "+" : "−"}${hLiczba(Math.abs(meta.swapDelta))} h po zatwierdzeniu zamian z giełdy`);
  }
  if (meta.innyLokal.length) czesci.push(`pracuje też w: ${meta.innyLokal.join(", ")}`);
  return czesci.join(" · ");
};

// Godziny urlopu w danym miesiącu — urlop nie jest zmianą w planie, ale liczy
// się jako 8 h za każdy dzień roboczy (ta sama formuła co
// buildUrlopShiftDrafts w utils/absences.ts).
const urlopHoursInMonth = (absences, user, monthPrefix) =>
  (absences || [])
    .filter(
      (a) =>
        a.status === "approved" &&
        a.type === "urlop" &&
        (a.user_id ? String(a.user_id) === String(user.id) : a.user_name === user.name)
    )
    .reduce((sum, a) => {
      const from = a.start_date < `${monthPrefix}-01` ? `${monthPrefix}-01` : a.start_date;
      const monthEnd = toLocalYMD(new Date(Number(monthPrefix.slice(0, 4)), Number(monthPrefix.slice(5, 7)), 0));
      const to = a.end_date > monthEnd ? monthEnd : a.end_date;
      if (from > to) return sum;
      return sum + countWorkdays(from, to) * URLOP_HOURS_PER_DAY;
    }, 0);

const godzinyMiesiacaOsoby = (planShifts, absences, user, monthPrefix) =>
  (planShifts || [])
    .filter((s) => s.date.startsWith(monthPrefix) && isSameUser(s, user))
    .reduce((sum, s) => sum + shiftHours(s), 0) + urlopHoursInMonth(absences, user, monthPrefix);

// --- klasy (tokeny "Shiftro") ---
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const btnMalyCls =
  "inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#F6F5F1]";
const btnMalyGlownyCls =
  "inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#B8321A]";
const miniTagCls = (ton) =>
  `inline-flex items-center h-[18px] px-[5px] rounded text-[11px] font-extrabold ${
    ton === "warn" ? "bg-[#FDF0D8] text-[#8A5300]" : ton === "bad" ? "bg-[#FAEAE6] text-[#8A3A2B]" : "bg-[#ECEBE6] text-[#171714]"
  }`;

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md — nagłówek przerysowuje
// się co sekundę przez żywy zegar w ManagerShell).
// ---------------------------------------------------------------------------

// Etykieta obsady nad dniem. Brak = przycisk (w Edycji otwiera panel z luką),
// nadmiar = sama informacja.
function EtykietaObsady({ p, activeStanowiska, lokal, onLuka, duza = false }) {
  const tekst = `${p.typ === "brak" ? "−" : "+"}${p.ile} ${stanowiskoShort(activeStanowiska, lokal, p.stanowisko)} ${krotkaGodzina(
    p.from
  )}–${krotkaGodzina(p.to)}`;
  const rozmiar = duza ? "text-sm px-2.5 py-2 w-full" : "text-[12px] px-1.5 py-[3px]";
  if (p.typ === "brak") {
    return (
      <button
        type="button"
        onClick={() => onLuka && onLuka(p)}
        className={`flex items-center gap-1 rounded-[5px] font-extrabold text-left tabular-nums bg-[#DE3A22] text-white hover:bg-[#B8321A] ${rozmiar}`}
        title={`${p.stanowisko}, ${p.from}–${p.to}: brakuje ${p.ile} os. (potrzeba ${p.required}, jest ${p.actual}) — kliknij, żeby obsadzić`}
        data-luka={`${p.stanowisko}|${p.from}|${p.to}`}
      >
        <Plus size={12} strokeWidth={3} className="flex-shrink-0" />
        <span className="truncate">{tekst}</span>
      </button>
    );
  }
  return (
    <span
      className={`flex items-center rounded-[5px] font-extrabold tabular-nums bg-[#FDF0D8] text-[#8A5300] ${rozmiar}`}
      title={
        p.required === 0
          ? `${p.stanowisko}, ${p.from}–${p.to}: ${p.actual} os. poza wymaganiami — czy to potrzebne?`
          : `${p.stanowisko}, ${p.from}–${p.to}: ${p.ile} os. więcej, niż wymaga obsada`
      }
      data-nadmiar
    >
      <span className="truncate">
        {tekst}
        {p.required === 0 ? " ?" : ""}
      </span>
    </span>
  );
}

function Kafelek({ etykieta, duza, pod, czerwony = false, ...reszta }) {
  return (
    <div
      className={`bg-white border-[2px] rounded-xl px-4 py-3 flex flex-col gap-0.5 min-w-[62%] sm:min-w-[40%] md:min-w-0 snap-start ${
        czerwony ? "border-[#DE3A22]" : "border-[#171714]"
      }`}
      {...reszta}
    >
      <span className={etykietaCls}>{etykieta}</span>
      <span
        className={`font-['Archivo'] text-[24px] md:text-[28px] leading-[34px] font-extrabold tabular-nums whitespace-nowrap ${
          czerwony ? "text-[#DE3A22]" : "text-[#171714]"
        }`}
      >
        {duza}
      </span>
      <span className="text-[13px] leading-[18px] text-[#6E6E66]">{pod}</span>
    </div>
  );
}

// Opis prośby z giełdy — wspólny dla paska nad siatką i widoku dnia.
const opisProsby = (sw, planShifts, weekHoursOf) => {
  const zm = (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id));
  const kto = sw.author_user_name || zm?.user_name || "?";
  const biorca = sw.taker_user_name || sw.target_user_name || "?";
  const dzien = zm ? `${dzienKrotko(zm.date)} · ${zm.stanowisko || ""} ${trimTime(zm.start_time)}–${trimTime(zm.end_time)}` : "";
  if (sw.typ === "zamiana") {
    const druga = wzajemnaZmiana(sw, planShifts);
    return {
      zm,
      tytul: `Zamiana: ${kto} ↔ ${biorca}`,
      opis: `${dzien}${druga ? ` ⇄ ${dzienKrotko(druga.date)} ${trimTime(druga.start_time)}–${trimTime(druga.end_time)}` : ""}`,
    };
  }
  const poZmianie = zm && weekHoursOf ? weekHoursOf(sw.taker_user_id, sw.taker_user_name, zm) : null;
  return {
    zm,
    tytul: sw.typ === "oddanie" || sw.target_user_name ? `${kto} oddaje zmianę → ${biorca}` : `${kto} oddaje zmianę każdemu`,
    opis: `${dzien}${sw.typ === "oddanie" || sw.target_user_name ? "" : ` · zgłoszenie: ${biorca}`}${
      poZmianie != null ? ` · ${biorca}: po zmianie ${fmtH(poZmianie)} w tygodniu` : ""
    }`,
  };
};

function LokalSection({
  lokal,
  miasto,
  weekDays,
  dzisYMD,
  users,
  activeStanowiska,
  planShifts,
  usuniete,
  absences,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  sortBy,
  monthPrefix,
  trybDnia,
  mode,
  pokazNaglowek,
  mobileDay,
  onCellClick,
  onRestore,
  onLuka,
  onCopyPrevWeek,
  onClearRange,
  onAddEmployee,
  onAddAtStanowisko,
  uklad = "osoby",
  shiftSwaps,
  onResolveSwap,
  lokalRow,
  budzetCele,
  budzetDni,
  setBudzetDni,
  currentUser,
  showMsg,
}) {
  const [forecast, setForecast] = useState({});
  useEffect(() => {
    let cancelled = false;
    setForecast({});
    if (!miasto) return;
    fetchDailyForecast(miasto)
      .then((data) => {
        if (!cancelled) setForecast(data || {});
      })
      .catch(() => {
        if (!cancelled) setForecast({});
      });
    return () => {
      cancelled = true;
    };
  }, [miasto]);

  const edycja = mode === "edycja";
  const weekFrom = weekDays[0];
  // ⚠️ Ostatni dzień z DŁUGOŚCI tablicy, nie ze stałego [6] — w trybie dnia
  // `weekDays` ma jeden element (błąd z 5c w CLAUDE.md).
  const weekTo = weekDays[weekDays.length - 1];
  const planWeek = (planShifts || []).filter((s) => s.date >= weekFrom && s.date <= weekTo);
  const usunieteTydzien = (usuniete || []).filter((s) => s.lokal === lokal && s.date >= weekFrom && s.date <= weekTo);

  // Wiersze: przypisani do lokalu + każdy, kto ma tu w tym tygodniu zmianę.
  // Osoba z wyłączonym kontem zostaje, dopóki wiszą jej zmiany.
  const rows = (users || []).filter((u) => {
    if (u.role === "kiosk") return false;
    const maTuZmiany =
      planWeek.some((s) => s.lokal === lokal && isSameUser(s, u)) ||
      usunieteTydzien.some((s) => isSameUser(s, u));
    const wylaczone = u.archived || u.active === false;
    if (wylaczone) return maTuZmiany;
    return u.default_lokal === lokal || maTuZmiany;
  });

  const [nrRok, nrMies] = monthPrefix.split("-").map(Number);
  const rowMeta = rows.map((u) => {
    const monthShifts = (planShifts || []).filter((s) => s.date.startsWith(monthPrefix) && isSameUser(s, u));
    const hours = godzinyMiesiacaOsoby(planShifts, absences, u, monthPrefix);
    const stawka = u.stawka === "" || u.stawka == null ? null : Number(u.stawka);
    const norma = normaMiesiaca(u, nrRok, nrMies);
    const lokaleOsoby = [...new Set(monthShifts.map((s) => s.lokal))];
    return {
      user: u,
      wylaczone: u.archived || u.active === false,
      hours,
      weekHours: planWeek.filter((s) => isSameUser(s, u)).reduce((a, s) => a + shiftHours(s), 0),
      swapDelta: pendingSwapDelta(shiftSwaps, planShifts, u, monthPrefix),
      zmian: monthShifts.length,
      ostrzezenia: ostrzezeniaKodeksu({ planShifts, absences, user: u, od: weekFrom, doDnia: weekTo }),
      norma,
      koszt: stawka != null ? hours * stawka : null,
      innyLokal: lokaleOsoby.filter((l) => l !== lokal),
    };
  });

  const sorted = [...rowMeta].sort((a, b) => {
    if (sortBy === "godziny") return b.hours - a.hours;
    if (sortBy === "nazwisko") return a.user.name.localeCompare(b.user.name, "pl");
    const sa = a.user.default_stanowisko || "";
    const sb = b.user.default_stanowisko || "";
    if (sa !== sb) return sa.localeCompare(sb, "pl");
    return a.user.name.localeCompare(b.user.name, "pl");
  });

  const ctxObsady = { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki, planShifts };
  const dayStats = weekDays.map((d) => checkDayCoverage(ctxObsady, lokal, d));
  const maWymagania = weekDays.map(
    (d) => getRulesForDate({ rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki }, lokal, d).length > 0
  );
  const weekHours = dayStats.reduce((sum, s) => sum + s.hours, 0);
  const brakow = dayStats.reduce((a, s) => a + (s.gaps || []).length, 0);
  const nadmiarow = dayStats.reduce((a, s) => a + (s.nadmiary || []).length, 0);
  const zmianTu = planWeek.filter((s) => s.lokal === lokal).length;

  // Warstwa budżetu — koszt dnia i jego udział w prognozie stoją w nagłówku
  // każdego układu. Gdy budżetu nie skonfigurowano, `cel` jest null.
  const dniBudzetu = weekDays.map((d) =>
    budzetDnia({ cele: budzetCele, budzetDni, planShifts, users, lokalRow, lokal, dateStr: d })
  );
  const sumaBudzetu = budzetTygodnia(dniBudzetu);

  // --- układ "wg stanowisk" ---
  const stanowiskaWiersze = [
    ...new Set([
      ...(activeStanowiska || []).filter((st) => st.lokal_name === lokal).map((st) => st.name),
      ...planWeek.filter((s) => s.lokal === lokal && s.stanowisko).map((s) => s.stanowisko),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pl"));
  const wymaganiaOpis = (stanowisko) => {
    const reguly = getRulesForDate(
      { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki },
      lokal,
      weekDays[0]
    ).filter((r) => r.stanowisko === stanowisko);
    return reguly.map((r) => `${r.required_count}× ${trimTime(r.start_time)}–${trimTime(r.end_time)}`).join(", ");
  };

  const exportCsv = () => {
    const head = ["Pracownik", "Stanowisko", ...weekDays];
    const lines = [head.join(";")];
    sorted.forEach(({ user }) => {
      const cells = weekDays.map((d) => {
        const own = planWeek.filter((s) => s.lokal === lokal && s.date === d && isSameUser(s, user));
        if (own.length > 0) return own.map((s) => `${trimTime(s.start_time)}-${trimTime(s.end_time)} ${s.stanowisko || ""}`).join(" | ");
        const abs = absenceOn(absences, user, d);
        if (abs) return abs.type === "urlop" ? "URLOP" : "NIEDOSTEPNY";
        const gdzie = planWeek.find((s) => s.date === d && isSameUser(s, user));
        return gdzie ? `w ${gdzie.lokal}` : "";
      });
      lines.push([user.name, user.default_stanowisko || "", ...cells].join(";"));
    });
    lines.push(["RAZEM", "", ...dayStats.map((s) => `${s.hours} h / ${s.people} os.`)].join(";"));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grafik-${lokal.replace(/\s+/g, "-").toLowerCase()}-${weekFrom}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- kratka ---
  const chipZmiany = (s, user, dateStr) => {
    const stan = stanSzkicu(s);
    const oferta = activeSwapFor(shiftSwaps, s.id);
    const Wrapper = edycja ? "button" : "div";
    return (
      <div key={s.id} className="flex flex-col gap-1">
        <Wrapper
          type={edycja ? "button" : undefined}
          onClick={edycja ? () => onCellClick(user, dateStr, s, oferta) : undefined}
          className={`grid grid-cols-[auto_1fr] gap-x-1.5 items-center rounded-md border-[2px] px-1.5 py-1 text-[13px] font-bold tabular-nums text-left w-full ${
            s.__nieaktywny
              ? "border-[#DE3A22] bg-[#FAEAE6] line-through decoration-[#8A3A2B]"
              : stan === "nowa"
              ? "border-dashed border-[#DE3A22] bg-white"
              : stan === "zmieniona"
              ? "border-[#8A5300] bg-[#FDF0D8]"
              : "border-[#171714] bg-white"
          } ${edycja ? "hover:bg-[#F6F5F1] cursor-pointer" : ""}`}
          title={edycja ? "Kliknij, aby edytować" : s.stanowisko || ""}
          data-zmiana-grafiku={s.id}
          data-stan={stan || "wyslana"}
        >
          <span className="text-[11px] font-extrabold px-[5px] py-px rounded" style={znacznikStyle(activeStanowiska, lokal, s.stanowisko)}>
            {stanowiskoShort(activeStanowiska, lokal, s.stanowisko)}
          </span>
          <span className="whitespace-nowrap">
            {trimTime(s.start_time)}–{trimTime(s.end_time)}
          </span>
          <span className="col-start-2 text-[11px] font-semibold text-[#6E6E66]">{fmtH(shiftHours(s))}</span>
          {stan === "nowa" && (
            <span className="col-span-2 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#DE3A22]">nowa</span>
          )}
          {s.__nieaktywny && (
            <span className="col-span-2 text-[10px] font-extrabold uppercase text-[#8A3A2B] no-underline">konto wyłączone</span>
          )}
        </Wrapper>
        {oferta &&
          (oferta.status === "przyjeta" ? (
            <div className="rounded-md bg-[#E3EEFB] text-[#1D5FA8] px-1.5 py-1 text-[12px] leading-4 font-bold flex flex-col gap-1" data-oferta-w-kratce>
              <span className="flex items-start gap-1">
                <ArrowLeftRight size={13} className="flex-shrink-0 mt-px" />
                <span>
                  {oferta.typ === "zamiana" ? "Zamiana ↔ " : "Oddaje → "}
                  <u>{oferta.taker_user_name || oferta.target_user_name}</u>
                </span>
              </span>
              {onResolveSwap && (
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onResolveSwap(oferta, "approve")}
                    className="flex-1 h-7 rounded-[5px] border-[1.5px] border-[#1D5FA8] bg-[#1D5FA8] text-white text-[12px] font-extrabold inline-flex items-center justify-center gap-0.5"
                  >
                    <Check size={13} /> Zgoda
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolveSwap(oferta, "reject")}
                    className="flex-1 h-7 rounded-[5px] border-[1.5px] border-[#1D5FA8] bg-white text-[#1D5FA8] text-[12px] font-extrabold inline-flex items-center justify-center gap-0.5"
                  >
                    <X size={13} /> Nie
                  </button>
                </span>
              )}
            </div>
          ) : (
            <span className="rounded-md bg-[#F6F5F1] text-[#6E6E66] px-1.5 py-0.5 text-[11px] font-bold">
              <ArrowLeftRight size={11} className="inline -mt-0.5" />{" "}
              {oferta.target_user_name ? `czeka na: ${oferta.target_user_name}` : "na giełdzie"}
            </span>
          ))}
      </div>
    );
  };

  const renderCell = (user, dateStr) => {
    const own = planWeek
      .filter((s) => s.lokal === lokal && s.date === dateStr && isSameUser(s, user))
      .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));
    const skreslone = usunieteTydzien.filter((s) => s.date === dateStr && isSameUser(s, user));
    const gdzieIndziej = planWeek.filter((s) => s.date === dateStr && s.lokal !== lokal && isSameUser(s, user));
    const przychodzace = (shiftSwaps || [])
      .filter((sw) => sw.status === "przyjeta" && String(sw.taker_user_id) === String(user.id))
      .map((sw) => (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id)))
      .filter((p) => p && p.lokal === lokal && p.date === dateStr);
    const abs = own.length === 0 ? absenceOn(absences, user, dateStr) : null;
    const cokolwiek = own.length + gdzieIndziej.length + przychodzace.length + skreslone.length;

    return (
      <div className="flex flex-col gap-[5px] min-h-[56px]">
        {abs && !cokolwiek ? (
          <div
            className={`rounded-md px-1.5 py-1.5 text-[12px] font-bold text-center ${
              abs.type === "urlop" ? "bg-[#E3EEFB] text-[#1D5FA8]" : "bg-[#ECEBE6] text-[#6E6E66]"
            }`}
            data-nieobecnosc
          >
            {abs.type === "urlop" ? "urlop" : "niedostępność"}
          </div>
        ) : null}
        {own.map((s) => chipZmiany(s, user, dateStr))}
        {skreslone.map((s) => {
          const W = edycja ? "button" : "div";
          return (
            <W
              key={`del-${s.id}`}
              type={edycja ? "button" : undefined}
              onClick={edycja ? () => onRestore(s) : undefined}
              className="grid grid-cols-[auto_1fr] gap-x-1.5 items-center rounded-md border-[2px] border-dashed border-[#B7B6AE] px-1.5 py-1 text-[13px] font-bold tabular-nums text-left w-full opacity-60 line-through"
              title={edycja ? "Usunięta w szkicu — kliknij, żeby przywrócić" : "Usunięta — zniknie po publikacji"}
              data-zmiana-usunieta={s.id}
            >
              <span className="text-[11px] font-extrabold px-[5px] rounded bg-[#ECEBE6]">
                {stanowiskoShort(activeStanowiska, lokal, s.stanowisko)}
              </span>
              <span className="whitespace-nowrap">
                {trimTime(s.start_time)}–{trimTime(s.end_time)}
              </span>
            </W>
          );
        })}
        {przychodzace.map((p) => (
          <div
            key={`in-${p.id}`}
            className="rounded-md border border-dashed border-[#1D5FA8] bg-[#E3EEFB]/50 px-1.5 py-0.5 text-[11px] text-[#1D5FA8] font-bold"
            title={`Przejmuje od: ${p.user_name} — czeka na Twoją decyzję`}
          >
            ⇄ {trimTime(p.start_time)}–{trimTime(p.end_time)} od {p.user_name}
          </div>
        ))}
        {gdzieIndziej.map((s) => {
          const W = edycja ? "button" : "div";
          return (
            <W
              key={`inny-${s.id}`}
              type={edycja ? "button" : undefined}
              onClick={edycja ? () => onCellClick(user, dateStr, s) : undefined}
              className="text-left rounded-md px-1.5 py-1 text-[12px] leading-4 text-[#6E6E66] tabular-nums"
              style={{ background: "repeating-linear-gradient(135deg,#F6F5F1 0 6px,transparent 6px 12px)" }}
              title={edycja ? `Kliknij, aby edytować zmianę w ${s.lokal}` : `Zmiana w lokalu ${s.lokal}`}
              data-zmiana-gdzie-indziej
            >
              <b className="block text-[#171714] font-bold truncate">
                {s.lokal.split(" ")[0]} · {stanowiskoShort(activeStanowiska, s.lokal, s.stanowisko)}
              </b>
              {trimTime(s.start_time)}–{trimTime(s.end_time)}
              {stanSzkicu(s) && <span className="text-[#DE3A22] font-extrabold"> •</span>}
            </W>
          );
        })}
        {/* Komórki z urlopem/niedostępnością świadomie bez "+ dodaj" — tam
            nie wolno nikogo obsadzić. */}
        {edycja && !(abs && !cokolwiek) && (
          <button
            type="button"
            onClick={() => onCellClick(user, dateStr, null)}
            className={`rounded-md border-dashed text-[#6E6E66] font-bold hover:border-[#171714] hover:text-[#171714] ${
              own.length ? "min-h-[24px] text-[12px] border-[1.5px] border-[#DEDCD4]" : "min-h-[32px] text-[13px] border-[2px] border-[#DEDCD4]"
            }`}
            data-dodaj-w-kratce
          >
            + {own.length ? "druga zmiana" : "dodaj"}
          </button>
        )}
      </div>
    );
  };

  // --- kolumna osoby ---
  const kolumnaOsoby = (meta) => {
    const u = meta.user;
    const r = meta.norma != null ? Math.round((meta.hours - meta.norma) * 10) / 10 : null;
    const ponad = r != null && r > 0.05;
    return (
      <div className="flex flex-col gap-0.5 min-w-0" title={opisOsoby(meta)}>
        <span className="font-extrabold flex gap-1.5 items-center flex-wrap min-w-0">
          <span className="truncate">{u.name}</span>
          {meta.innyLokal.length > 0 && (
            <span className={miniTagCls()} title={`Pracuje też w: ${meta.innyLokal.join(", ")}`}>
              {meta.innyLokal.length + 1} lokale
            </span>
          )}
          {u.default_lokal && u.default_lokal !== lokal && (
            <span className={miniTagCls()}>{u.default_lokal.split(" ")[0]}</span>
          )}
          {meta.wylaczone && <span className={miniTagCls("bad")}>wył.</span>}
          {meta.ostrzezenia.length > 0 && (
            <span className="text-[#8A5300]" title={meta.ostrzezenia.map((o) => o.tekst).join("\n")}>
              <AlertTriangle size={13} className="inline -mt-0.5" />
            </span>
          )}
        </span>
        {meta.norma != null ? (
          <>
            <span className="text-[12px] leading-4 text-[#6E6E66] tabular-nums">
              tydz. <b className="text-[#171714]">{fmtH(meta.weekHours)}</b> · mies. {hLiczba(meta.hours)}/{hLiczba(meta.norma)} h
            </span>
            <span className={`text-[12px] font-extrabold ${ponad ? "text-[#8A5300]" : "text-[#171714]"}`} data-norma-osoby>
              {ponad ? `+${hLiczba(r)} h ponad normą` : r < -0.05 ? `do normy brakuje ${hLiczba(-r)} h` : "równo z normą"}
            </span>
            <span className="relative h-[5px] rounded bg-[#ECEBE6] overflow-hidden mt-[3px]">
              <i
                className={`absolute left-0 top-0 bottom-0 rounded ${ponad ? "bg-[#8A5300]" : "bg-[#171714]"}`}
                style={{ width: `${Math.min(100, (meta.hours / Math.max(1, meta.norma)) * 100)}%` }}
              />
            </span>
          </>
        ) : (
          <>
            <span className="text-[12px] leading-4 text-[#6E6E66] tabular-nums">
              tydz. <b className="text-[#171714]">{fmtH(meta.weekHours)}</b> · mies. {hLiczba(meta.hours)} h
            </span>
            {meta.koszt != null && <span className="text-[12px] leading-4 text-[#6E6E66]">{zl(meta.koszt)}</span>}
          </>
        )}
        {Math.abs(meta.swapDelta) > 0.01 && (
          <span className={`text-[12px] font-extrabold ${meta.swapDelta > 0 ? "text-[#1F7A4A]" : "text-[#DE3A22]"}`}>
            {meta.swapDelta > 0 ? "+" : "−"}
            {hLiczba(Math.abs(meta.swapDelta))} h po giełdzie
          </span>
        )}
      </div>
    );
  };

  // --- nagłówek dnia ---
  const naglowekDnia = (d, i) => {
    const stat = dayStats[i];
    const b = dniBudzetu[i];
    const pogoda = forecast[d];
    const problemy = problemyObsady(stat);
    return (
      <th
        key={d}
        className={`align-top text-left font-normal p-2 border-l-[1.5px] border-[#DEDCD4] ${d === dzisYMD ? "bg-[#FFF3EF]" : "bg-[#F6F5F1]"}`}
        data-naglowek-dnia={d}
      >
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-baseline gap-1">
            <b className="text-[15px] font-extrabold uppercase">{DNI[new Date(d + "T00:00:00").getDay()]}</b>
            <span className="text-[13px] font-bold text-[#6E6E66] whitespace-nowrap">
              {pogoda && pogoda.temp != null && (
                <span className="font-normal mr-1" title={describeWeatherCode(pogoda.code).label}>
                  {describeWeatherCode(pogoda.code).icon}
                  {Math.round(pogoda.temp)}°
                </span>
              )}
              {fmtDay(d)}
            </span>
          </div>
          <div className="flex justify-between text-[13px] text-[#6E6E66] tabular-nums">
            <span>
              <b className="text-[#171714]">{stat.people}</b> os. · <b className="text-[#171714]">{fmtH(stat.hours)}</b>
            </span>
          </div>
          {b.koszt > 0 && (
            <div className="flex justify-between text-[13px] text-[#6E6E66] tabular-nums" data-koszt-dnia>
              <span>{zl(b.koszt)}</span>
              {b.kosztPct != null && (
                <span
                  className={b.ponizejCelu ? "text-[#8A5300] font-extrabold" : ""}
                  title={b.pct != null ? `Cel: ${pct0(b.pct)} kosztu pracy` : ""}
                >
                  {pct1(b.kosztPct)}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col gap-[3px]" data-obsada-dnia>
            {problemy.map((p, pi) => (
              <EtykietaObsady
                key={`${p.stanowisko}-${p.from}-${p.typ}-${pi}`}
                p={p}
                activeStanowiska={activeStanowiska}
                lokal={lokal}
                onLuka={(pp) => onLuka(d, pp)}
              />
            ))}
            {problemy.length === 0 && maWymagania[i] && (
              <span className="flex items-center gap-1 rounded-[5px] px-1.5 py-[3px] text-[12px] font-extrabold bg-[#E2F3E9] text-[#1F7A4A]">
                <Check size={12} strokeWidth={3} /> obsada OK
              </span>
            )}
          </div>
        </div>
      </th>
    );
  };

  // --- widok dnia na telefonie ---
  const mobilnyDzien = () => {
    const i = weekDays.indexOf(mobileDay);
    if (i < 0) return null;
    const d = mobileDay;
    const stat = dayStats[i];
    const b = dniBudzetu[i];
    const problemy = problemyObsady(stat);
    const zmianyDnia = planWeek
      .filter((s) => s.lokal === lokal && s.date === d)
      .concat(usunieteTydzien.filter((s) => s.date === d).map((s) => ({ ...s, __usunieta: true })))
      .sort((a, b2) => (a.stanowisko || "").localeCompare(b2.stanowisko || "", "pl") || trimTime(a.start_time).localeCompare(trimTime(b2.start_time)));
    const niedostepni = rows.filter((u) => absenceOn(absences, u, d) && !planWeek.some((s) => s.date === d && isSameUser(s, u)));
    const prosby = (shiftSwaps || []).filter((sw) => {
      if (sw.status !== "przyjeta") return false;
      const zm = (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id));
      return zm && zm.lokal === lokal && zm.date === d;
    });
    return (
      <div className="md:hidden flex flex-col gap-3" data-dzien-mobilny>
        <div className="grid grid-cols-2 gap-2">
          <div className={`${kartaCls} px-3 py-2.5`}>
            <span className={etykietaCls}>Obsada</span>
            <div className="font-['Archivo'] text-[22px] leading-7 font-extrabold">{stat.people} os.</div>
            <div className="text-[13px] text-[#6E6E66]">{fmtH(stat.hours)}</div>
          </div>
          <div className={`${kartaCls} px-3 py-2.5`}>
            <span className={etykietaCls}>Koszt · % utargu</span>
            <div className={`font-['Archivo'] text-[22px] leading-7 font-extrabold ${b.ponizejCelu ? "text-[#8A5300]" : ""}`}>
              {b.kosztPct != null ? pct0(b.kosztPct) : "—"}
            </div>
            <div className="text-[13px] text-[#6E6E66]">
              {zl(b.koszt)}
              {b.utarg != null ? ` / ${zl(b.utarg)}` : ""}
            </div>
          </div>
        </div>
        {problemy.length > 0 && (
          <div className={`${kartaCls} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b-[2px] border-[#171714] font-['Archivo'] font-extrabold">Obsada</div>
            <div className="p-3 flex flex-col gap-1.5">
              {problemy.map((p, pi) => (
                <EtykietaObsady key={pi} p={p} activeStanowiska={activeStanowiska} lokal={lokal} onLuka={(pp) => onLuka(d, pp)} duza />
              ))}
            </div>
          </div>
        )}
        {prosby.length > 0 && (
          <div className={`${kartaCls} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b-[2px] border-[#171714] font-['Archivo'] font-extrabold flex items-center gap-2">
              <ArrowLeftRight size={16} /> Giełda zmian
            </div>
            {prosby.map((sw) => {
              const o = opisProsby(sw, planShifts, null);
              return (
                <div key={sw.id} className="px-3.5 py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0">
                  <div className="font-bold">{o.tytul}</div>
                  <div className="text-[13px] text-[#6E6E66]">{o.opis}</div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" className={btnMalyGlownyCls} onClick={() => onResolveSwap(sw, "approve")}>
                      <Check size={15} /> Zgoda
                    </button>
                    <button type="button" className={btnMalyCls} onClick={() => onResolveSwap(sw, "reject")}>
                      Odrzuć
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className={`${kartaCls} overflow-hidden`}>
          <div className="px-3.5 py-2.5 border-b-[2px] border-[#171714] font-['Archivo'] font-extrabold flex">
            Zmiany · {dzienKrotko(d)}
            <span className="ml-auto text-sm font-bold text-[#6E6E66]">{zmianyDnia.filter((s) => !s.__usunieta).length}</span>
          </div>
          {zmianyDnia.length === 0 && <p className="px-3.5 py-3 text-sm text-[#6E6E66]">Brak zmian tego dnia.</p>}
          {zmianyDnia.map((s) => {
            const u = (users || []).find((x) => isSameUser(s, x)) || { id: s.user_id, name: s.user_name };
            const stan = s.__usunieta ? "usunieta" : stanSzkicu(s);
            const W = edycja ? "button" : "div";
            return (
              <W
                key={`${s.id}${s.__usunieta ? "-d" : ""}`}
                type={edycja ? "button" : undefined}
                onClick={edycja ? () => (s.__usunieta ? onRestore(s) : onCellClick(u, d, s, activeSwapFor(shiftSwaps, s.id))) : undefined}
                className={`w-full text-left grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 items-center px-3.5 py-2.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 ${
                  stan === "usunieta" ? "opacity-55 line-through" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="font-extrabold">{s.user_name}</span>{" "}
                  <span className={miniTagCls()} style={znacznikStyle(activeStanowiska, lokal, s.stanowisko)}>
                    {stanowiskoShort(activeStanowiska, lokal, s.stanowisko)}
                  </span>
                  {stan && (
                    <>
                      {" "}
                      <span className={miniTagCls("warn")}>{stan === "nowa" ? "nowa" : stan === "zmieniona" ? "zmieniona" : "usunięta"}</span>
                    </>
                  )}
                  <span className="block text-[13px] text-[#6E6E66]">{fmtH(shiftHours(s))}</span>
                </span>
                <span className="font-extrabold tabular-nums">
                  {trimTime(s.start_time)}–{trimTime(s.end_time)}
                </span>
              </W>
            );
          })}
        </div>
        {niedostepni.length > 0 && (
          <p className="text-sm text-[#6E6E66]">Niedostępni: {niedostepni.map((u) => u.name).join(", ")}</p>
        )}
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-3" data-lokal-grafiku={lokal}>
      {(pokazNaglowek || edycja) && (
        <div className="flex flex-wrap items-center gap-2">
          {pokazNaglowek && <h3 className="m-0 font-['Archivo'] font-extrabold text-lg mr-1">{lokal}</h3>}
          <span className="hidden md:block flex-1" />
          {edycja && !trybDnia && (
            <button onClick={() => onCopyPrevWeek(lokal)} className={`${btnMalyCls} hidden md:inline-flex`}>
              <CopyPlus size={16} /> Kopiuj poprzedni tydzień
            </button>
          )}
          {edycja && (
            <button
              onClick={() => onClearRange(lokal)}
              className={`${btnMalyCls} hidden md:inline-flex !border-[#DEDCD4] text-[#8A3A2B]`}
              title={`Usuwa grafik tylko tego lokalu (${lokal}) za oglądany zakres`}
            >
              <Trash2 size={16} /> {trybDnia ? "Wyczyść dzień" : "Wyczyść tydzień"}
            </button>
          )}
          <button onClick={exportCsv} className={`${btnMalyCls} hidden md:inline-flex`}>
            <Download size={16} /> Eksport
          </button>
        </div>
      )}

      {/* Kafelki — na telefonie widok dnia ma własne, więc tu tylko od md */}
      <div className="hidden md:grid grid-cols-2 xl:grid-cols-4 gap-3" data-kafelki-grafiku>
        <Kafelek
          etykieta={`Koszt pracy · ${trybDnia ? "dzień" : "tydzień"}`}
          duza={zl(sumaBudzetu.koszt)}
          pod={
            <>
              z {zmianTu} {zmianTu === 1 ? "zmiany" : "zmian"}
              {sumaBudzetu.bezDanych.length > 0 && (
                <span className="block text-[#8A5300] font-bold">
                  {sumaBudzetu.bezDanych.length} os. bez stawki — koszt zaniżony
                </span>
              )}
            </>
          }
        />
        <Kafelek
          etykieta="Koszt / prognoza utargu"
          duza={sumaBudzetu.kosztPct != null ? pct1(sumaBudzetu.kosztPct) : "—"}
          pod={
            sumaBudzetu.maPrognoze
              ? `${sumaBudzetu.celPct != null ? `cel ${pct0(sumaBudzetu.celPct)} · ` : ""}prognoza ${zl(sumaBudzetu.prognoza)}`
              : "ustaw cel w Konfiguracji → Budżet"
          }
        />
        <Kafelek
          etykieta="Braki obsady"
          duza={brakow}
          czerwony={brakow > 0}
          pod={
            brakow > 0
              ? edycja
                ? "kliknij czerwoną etykietę nad dniem"
                : "włącz Edycję i kliknij etykietę"
              : maWymagania.some(Boolean)
              ? "wszystko obsadzone"
              : "brak wymagań obsady"
          }
          data-kafelek-braki={brakow}
        />
        <Kafelek etykieta="Nadmiar · do sprawdzenia" duza={nadmiarow} pod="więcej osób niż wymaga obsada" />
      </div>

      {mobileDay && mobilnyDzien()}

      <div className={`${kartaCls} overflow-auto hidden md:block`}>
        <table className={`w-full border-collapse table-fixed ${trybDnia ? "min-w-[360px]" : "min-w-[1190px]"}`}>
          <colgroup>
            <col style={{ width: KOL_PRACOWNIK }} />
            {weekDays.map((d) => (
              <col key={d} style={trybDnia ? undefined : { minWidth: KOL_DZIEN }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="align-top text-left font-normal p-2 bg-[#F6F5F1]">
                <div className="flex flex-col gap-2 items-start">
                  <span className={etykietaCls}>
                    {uklad === "budzet" ? "Wskaźnik" : uklad === "stanowiska" ? "Stanowisko" : "Pracownik"}
                  </span>
                  {uklad === "osoby" && edycja && (
                    <>
                      <button
                        type="button"
                        onClick={() => onCellClick(null, weekDays[0], null)}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border-[2px] border-[#171714] bg-white text-[13px] font-bold hover:bg-white/60"
                        data-dodaj-zmiane
                      >
                        <Plus size={14} /> Dodaj zmianę
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddEmployee(lokal)}
                        className="inline-flex items-center gap-1 text-[12px] font-bold text-[#6E6E66] underline underline-offset-2 hover:text-[#171714]"
                        title="Zakłada nowego pracownika w systemie i otwiera jego kartę"
                      >
                        <UserPlus size={13} /> Nowy pracownik
                      </button>
                    </>
                  )}
                </div>
              </th>
              {weekDays.map((d, i) => naglowekDnia(d, i))}
            </tr>
          </thead>
          {uklad === "budzet" ? (
            <WierszeBudzetu
              lokal={lokal}
              dni={dniBudzetu}
              suma={sumaBudzetu}
              edycja={edycja}
              budzetDni={budzetDni}
              setBudzetDni={setBudzetDni}
              currentUser={currentUser}
              showMsg={showMsg}
            />
          ) : (
            <tbody>
              {uklad === "stanowiska" &&
                (stanowiskaWiersze.length === 0 ? (
                  <tr>
                    <td colSpan={weekDays.length + 1} className="px-4 py-6 text-center text-[#6E6E66] text-sm border-t-[1.5px] border-[#DEDCD4]">
                      Ten lokal nie ma zdefiniowanych stanowisk. Dodaje je właściciel w Ustawienia → Stanowiska.
                    </td>
                  </tr>
                ) : (
                  stanowiskaWiersze.map((stanowisko) => {
                    const godz = planWeek
                      .filter((s) => s.lokal === lokal && (s.stanowisko || "") === stanowisko)
                      .reduce((a, s) => a + shiftHours(s), 0);
                    const wym = wymaganiaOpis(stanowisko);
                    return (
                      <tr key={stanowisko}>
                        <td className="align-top p-2 border-t-[1.5px] border-[#DEDCD4]">
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="text-[11px] font-extrabold px-1.5 py-0.5 rounded flex-shrink-0"
                              style={znacznikStyle(activeStanowiska, lokal, stanowisko)}
                            >
                              {stanowiskoShort(activeStanowiska, lokal, stanowisko)}
                            </span>
                            <b className="truncate">{stanowisko || "bez stanowiska"}</b>
                          </span>
                          <span className="block text-[12px] leading-4 text-[#6E6E66] mt-0.5">
                            {fmtH(godz)} w tygodniu{wym ? ` · wymagane ${wym}` : ""}
                          </span>
                        </td>
                        {weekDays.map((d, di) => {
                          const zm = planWeek
                            .filter((s) => s.lokal === lokal && s.date === d && (s.stanowisko || "") === stanowisko)
                            .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));
                          const luki = problemyObsady(dayStats[di]).filter((p) => p.typ === "brak" && p.stanowisko === stanowisko);
                          return (
                            <td key={d} className="align-top p-2 border-t-[1.5px] border-l-[1.5px] border-[#DEDCD4]">
                              <div className="flex flex-col gap-[5px] min-h-[56px]">
                                {zm.map((sh) => {
                                  const W = edycja ? "button" : "div";
                                  const stan = stanSzkicu(sh);
                                  return (
                                    <W
                                      key={sh.id}
                                      type={edycja ? "button" : undefined}
                                      onClick={
                                        edycja
                                          ? () =>
                                              onCellClick(
                                                (users || []).find((u) => isSameUser(sh, u)) || { id: sh.user_id, name: sh.user_name },
                                                d,
                                                sh,
                                                activeSwapFor(shiftSwaps, sh.id)
                                              )
                                          : undefined
                                      }
                                      className={`text-left rounded-md border-[2px] px-1.5 py-1 text-[13px] font-bold ${
                                        stan === "nowa"
                                          ? "border-dashed border-[#DE3A22]"
                                          : stan === "zmieniona"
                                          ? "border-[#8A5300] bg-[#FDF0D8]"
                                          : "border-[#171714]"
                                      } ${sh.__nieaktywny ? "line-through bg-[#FAEAE6]" : ""}`}
                                    >
                                      <span className="block truncate">{sh.user_name}</span>
                                      <span className="block text-[11px] font-semibold text-[#6E6E66] tabular-nums">
                                        {trimTime(sh.start_time)}–{trimTime(sh.end_time)}
                                      </span>
                                    </W>
                                  );
                                })}
                                {luki.map((p, pi) => (
                                  <EtykietaObsady key={pi} p={p} activeStanowiska={activeStanowiska} lokal={lokal} onLuka={(pp) => onLuka(d, pp)} />
                                ))}
                                {edycja && (
                                  <button
                                    type="button"
                                    onClick={() => onAddAtStanowisko(stanowisko, d)}
                                    className="min-h-[24px] rounded-md border-[1.5px] border-dashed border-[#DEDCD4] text-[12px] font-bold text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                                  >
                                    + dodaj
                                  </button>
                                )}
                                {!zm.length && !luki.length && !edycja && (
                                  <span className="text-[12px] text-[#6E6E66]">nie wymagane</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ))}

              {uklad === "osoby" && sorted.length === 0 && (
                <tr>
                  <td colSpan={weekDays.length + 1} className="px-4 py-6 text-center text-[#6E6E66] text-sm border-t-[1.5px] border-[#DEDCD4]">
                    Nikt nie jest przypisany do tego lokalu.
                  </td>
                </tr>
              )}
              {uklad === "osoby" &&
                sorted.map((meta) => (
                  <tr key={meta.user.id} data-wiersz-grafiku={meta.user.name}>
                    <td className="align-top p-2 border-t-[1.5px] border-[#DEDCD4]">{kolumnaOsoby(meta)}</td>
                    {weekDays.map((d) => (
                      <td key={d} className="align-top p-2 border-t-[1.5px] border-l-[1.5px] border-[#DEDCD4]">
                        {renderCell(meta.user, d)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          )}
          {uklad !== "budzet" && (
            <tfoot>
              <tr className="bg-[#F6F5F1]">
                <td className="p-2 border-t-[1.5px] border-[#DEDCD4] text-[13px]">
                  <span className={etykietaCls}>Razem</span>
                  <b className="block text-[15px] tabular-nums">{fmtH(weekHours)}</b>
                </td>
                {dayStats.map((stat, i) => (
                  <td key={stat.date} className="p-2 border-t-[1.5px] border-l-[1.5px] border-[#DEDCD4] text-[13px] tabular-nums">
                    <b className="text-[15px]">{fmtH(stat.hours)}</b>
                    <span className="block text-[#6E6E66]">{dniBudzetu[i].koszt > 0 ? zl(dniBudzetu[i].koszt) : "—"}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export default function GrafikTydzien({
  lokaleNames,
  allLokaleNames,
  lokale,
  users,
  activeStanowiska,
  planShifts,
  usuniete = [],
  setPlanShifts,
  absences,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  setUsers,
  weekStart,
  sortBy,
  trybDnia = false,
  uklad = "osoby",
  mode,
  onNewEmployee,
  shiftSwaps,
  onResolveSwap,
  setAbsences,
  setShifts,
  budzetCele,
  budzetDni,
  setBudzetDni,
  currentUser,
  showMsg,
}) {
  const [modalCtx, setModalCtx] = useState(null);
  const [blokada, setBlokada] = useState(null);
  const weekDays = (trybDnia ? [0] : [0, 1, 2, 3, 4, 5, 6]).map((i) => addDaysYMD(weekStart, i));
  const dzisYMD = toLocalYMD(new Date());
  // Na telefonie oglądamy jeden dzień tygodnia — domyślnie dziś, jeśli wypada
  // w tym tygodniu. Kotwica przeskakuje razem z tygodniem.
  const [mobileDay, setMobileDay] = useState(null);
  const dzienMobilny = weekDays.includes(mobileDay)
    ? mobileDay
    : weekDays.includes(dzisYMD)
    ? dzisYMD
    : weekDays[0];
  // Tydzień na przełomie miesięcy przypisujemy do miesiąca swojego czwartku.
  const monthPrefix = (trybDnia ? weekDays[0] : weekDays[3]).slice(0, 7);
  const edycja = mode === "edycja";

  // Usunięcie idzie z 6 s "Cofnij": zmiana znika z widoku od razu, zapis
  // rusza po 6 s (ten sam mechanizm co "Do decyzji").
  const usunTeraz = async (shift) => {
    const bylaWyslana = !!shift.published_at;
    try {
      if (bylaWyslana) {
        // Wysłana zmiana zostaje w bazie z deleted_at — publikacja powie o
        // tym pracownikowi i dopiero wtedy ją skasuje.
        const teraz = new Date().toISOString();
        const zapisana = await api.patch("grafik_shifts", shift.id, { deleted_at: teraz, updated_at: teraz });
        setPlanShifts((prev) => (prev || []).map((s) => (s.id === zapisana.id ? { ...s, ...zapisana } : s)));
      } else {
        await api.delete("grafik_shifts", shift.id);
        setPlanShifts((prev) => (prev || []).filter((s) => s.id !== shift.id));
      }
      const { bledy } = await wycofajOfertyDlaZmian({ swaps: shiftSwaps, shiftIds: [shift.id] });
      if (bledy.length > 0) showMsg("Zmiana usunięta, ale nie udało się wycofać jej oferty z giełdy.", "error");
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };
  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({ usunTeraz });
  const widocznePlan = (planShifts || []).filter((s) => !odlozone[`del:${s.id}`]);

  const openCell = (user, dateStr, shift, lokal, oferta) =>
    setModalCtx({ user, date: dateStr, shift, lokal, oferta: oferta || null });

  const openAddNaStanowisko = (stanowisko, dateStr, lokal) =>
    setModalCtx({ user: null, date: dateStr, shift: null, lokal, stanowisko });

  // Luka z nagłówka dnia: panel z ustawionym stanowiskiem i godzinami luki.
  const openLuka = (lokal, dateStr, p) => {
    if (!edycja) {
      showMsg("Włącz Edycję, żeby obsadzić brak.", "error");
      return;
    }
    setModalCtx({
      user: null,
      date: dateStr,
      shift: null,
      lokal,
      stanowisko: p.stanowisko,
      luka: { from: trimTime(p.from), to: trimTime(p.to) },
    });
  };

  // Co stoi na przeszkodzie, żeby wpisać tę zmianę w TEN dzień. Kolejność:
  // ostatni dzień pracy, zatwierdzone wolne, nakładające się godziny. Praca w
  // dwóch lokalach i druga zmiana tego samego dnia są DOZWOLONE.
  const przeszkodaDnia = (data, dateStr) => {
    const user = (users || []).find((u) => String(u.id) === String(data.user_id));
    if (poOstatnimDniu(user, dateStr)) {
      return {
        krotko: "koniec pracy",
        tekst: `${data.user_name} kończy pracę ${user.ostatni_dzien} — ta zmiana wypada później.`,
        podpowiedz: "Jeśli data odejścia się zmieniła, popraw ją w karcie pracownika (Pracownicy).",
      };
    }
    const wolne = user ? findBlockingAbsence(absences, user, dateStr) : null;
    if (wolne) {
      return {
        krotko: wolne.type === "urlop" ? "urlop" : "niedostępność",
        tekst:
          wolne.type === "urlop"
            ? `${data.user_name} ma tego dnia zatwierdzony urlop (${wolne.start_date} – ${wolne.end_date}).`
            : `${data.user_name} zgłosił(a) brak dostępności na ten dzień (${wolne.start_date} – ${wolne.end_date}).`,
        podpowiedz: "Dostępność zgłasza pracownik w swojej aplikacji. Aby to obejść, poproś o wycofanie zgłoszenia.",
      };
    }
    const kolizja = findOverlappingPlanShift(widocznePlan, {
      user_id: data.user_id,
      user_name: data.user_name,
      date: dateStr,
      start_time: data.start_time,
      end_time: data.end_time,
      excludeId: data.id,
    });
    if (kolizja) {
      return {
        krotko: `zmiana ${trimTime(kolizja.start_time)}–${trimTime(kolizja.end_time)}${
          kolizja.lokal !== data.lokal ? ` (${kolizja.lokal.split(" ")[0]})` : ""
        }`,
        tekst: `${data.user_name} ma już zmianę w lokalu ${kolizja.lokal} (${trimTime(kolizja.start_time)} – ${trimTime(
          kolizja.end_time
        )}, ${kolizja.date}), która nachodzi na te godziny.`,
        podpowiedz:
          "Blokujemy tylko nachodzące godziny — zmianę dzieloną (np. do 14:00 tu, od 14:00 gdzie indziej) można wpisać normalnie.",
      };
    }
    return null;
  };

  const handleSave = async (data) => {
    const dni = data.id ? [data.date] : [...new Set(data.dni && data.dni.length ? data.dni : [data.date])].sort();
    // Jeden dzień = pełne wyjaśnienie w oknie blokady. Przy kilku dniach
    // pojedyncza przeszkoda nie przerywa całej operacji — dzień odpada.
    if (dni.length === 1) {
      const b = przeszkodaDnia(data, dni[0]);
      if (b) {
        setBlokada({ userName: data.user_name, tekst: b.tekst, podpowiedz: b.podpowiedz });
        return false;
      }
    }
    const doZapisu = [];
    const pominiete = [];
    for (const d of dni) {
      const b = dni.length === 1 ? null : przeszkodaDnia(data, d);
      if (b) pominiete.push(`${DNI[new Date(d + "T00:00:00").getDay()]} (${b.krotko})`);
      else doZapisu.push(d);
    }
    if (doZapisu.length === 0) {
      showMsg(`Nie dodano żadnej zmiany. Pominięto: ${pominiete.join(", ")}.`, "error");
      return false;
    }
    try {
      const bazowy = {
        lokal: data.lokal,
        user_id: data.user_id,
        user_name: data.user_name,
        stanowisko: data.stanowisko,
        start_time: data.start_time,
        end_time: data.end_time,
        updated_at: new Date().toISOString(),
      };
      if (data.id) {
        const zapisana = await api.patch("grafik_shifts", data.id, { ...bazowy, date: data.date });
        setPlanShifts((prev) => (prev || []).map((s) => (s.id === zapisana.id ? { ...s, ...zapisana } : s)));
        showMsg(`Zapisano w szkicu: ${data.user_name} ${data.start_time}–${data.end_time}.`);
      } else {
        const nowe = [];
        for (const d of doZapisu) nowe.push(await api.post("grafik_shifts", { ...bazowy, date: d }));
        setPlanShifts((prev) => [...(prev || []), ...nowe]);
        showMsg(
          `Przypisano: ${data.user_name} · ${zmianyLabel(nowe.length).replace("zmianę", "zmiana")} w szkicu.` +
            (pominiete.length ? ` Pominięto: ${pominiete.join(", ")}.` : "")
        );
      }
      if (!data.dodajNastepna) setModalCtx(null);
      return true;
    } catch (err) {
      showMsg(`Błąd zapisu zmiany: ${err.message || "nieznany błąd"}`, "error");
      return false;
    }
  };

  const handleDelete = (shift) => {
    setModalCtx(null);
    decyduj(
      [{ klucz: `del:${shift.id}`, zadanie: ["usunTeraz", [shift]] }],
      shift.published_at
        ? `Usunięcie w szkicu: ${shift.user_name} — zniknie po publikacji`
        : `Usunięto nową zmianę: ${shift.user_name}`
    );
  };

  // Przywrócenie zmiany usuniętej w szkicu. ⚠️ Zostaje jako "zmieniona"
  // (updated_at = teraz): nie wiemy, czy przed usunięciem ktoś jej nie
  // poprawił, a zmiana oznaczona jako wysłana schowałaby taką poprawkę przed
  // pracownikiem. Jedno zbędne powiadomienie jest tańsze.
  const handleRestore = async (shift) => {
    try {
      const zapisana = await api.patch("grafik_shifts", shift.id, {
        deleted_at: null,
        updated_at: new Date().toISOString(),
      });
      setPlanShifts((prev) => (prev || []).map((s) => (s.id === zapisana.id ? { ...s, ...zapisana } : s)));
      showMsg(`Przywrócono zmianę: ${shift.user_name}.`);
    } catch (err) {
      showMsg(`Błąd przywracania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const handleCopyPrevWeek = async (lokal) => {
    const { drafts, skipped } = buildCopyFromPreviousWeek({ planShifts: widocznePlan, absences, users, lokal, weekStart });
    if (drafts.length === 0) {
      showMsg("Poprzedni tydzień jest pusty — nie ma czego skopiować.", "error");
      return;
    }
    if (
      !window.confirm(
        `Skopiować ${drafts.length} zmian z poprzedniego tygodnia do ${lokal}?` +
          (skipped.length > 0 ? `\n\nPominiętych: ${skipped.length} (wolne albo kolizja godzin).` : "")
      )
    )
      return;
    try {
      const utworzone = [];
      for (const d of drafts) utworzone.push(await api.post("grafik_shifts", { ...d, updated_at: new Date().toISOString() }));
      setPlanShifts((prev) => [...(prev || []), ...utworzone]);
      showMsg(`Skopiowano ${utworzone.length} zmian do szkicu.` + (skipped.length > 0 ? ` Pominięto ${skipped.length}.` : ""));
    } catch (err) {
      showMsg(`Błąd kopiowania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // Dopisanie stanowiska prosto z grafiku — to stanowisko, a nie lokal,
  // decyduje, kto może wejść na zmianę.
  const handleAddStanowisko = async (user, stanowisko) => {
    try {
      const lista = [...new Set([...storedStanowiskaArr(user), stanowisko])].filter((n) => n && n !== user.default_stanowisko);
      const zapisany = await api.patch("users", user.id, { allowed_stanowiska: lista.length > 0 ? lista.join(",") : null });
      setUsers((users || []).map((u) => (u.id === zapisany.id ? zapisany : u)));
      showMsg(`${stanowisko} dopisane do karty: ${user.name}.`);
    } catch (err) {
      showMsg(`Nie udało się dopisać stanowiska: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // Wolne/urlop wpisane wprost z grafiku (utils/absences.ts).
  const handleAddAbsence = async ({ user, typ, od, doDnia, note }) => {
    try {
      const fn = typ === "urlop" ? addUrlopDirectly : addNiedostepnoscDirectly;
      const { absence, createdShifts } = await fn({ user, startDate: od, endDate: doDnia, editorName: currentUser?.name, note });
      setAbsences([...(absences || []), absence]);
      if (createdShifts && createdShifts.length > 0 && setShifts) setShifts((prev) => [...prev, ...createdShifts]);
      setModalCtx(null);
      showMsg(typ === "urlop" ? "Urlop zapisany." : "Niedostępność zapisana.");
      return true;
    } catch (err) {
      showMsg(`Błąd zapisu wolnego: ${err.message || "nieznany błąd"}`, "error");
      return false;
    }
  };

  // Wyczyszczenie oglądanego zakresu w JEDNYM lokalu — ta sama zasada co
  // pojedyncze usunięcie: wysłane zostają z deleted_at, niewysłane znikają.
  const handleClearRange = async (lokal) => {
    const doUsuniecia = widocznePlan.filter(
      (s) => s.lokal === lokal && !s.deleted_at && s.date >= weekDays[0] && s.date <= weekDays[weekDays.length - 1]
    );
    if (doUsuniecia.length === 0) {
      showMsg("W tym zakresie nie ma czego usuwać.", "error");
      return;
    }
    const wyslanych = doUsuniecia.filter((s) => s.published_at).length;
    const zakres = weekDays.length === 1 ? weekDays[0] : `${weekDays[0]} – ${weekDays[weekDays.length - 1]}`;
    if (
      !window.confirm(
        `Usunąć CAŁY grafik lokalu ${lokal} za ${zakres}?\n\nZmian do usunięcia: ${doUsuniecia.length}` +
          (wyslanych > 0
            ? `, w tym ${wyslanych} już wysłanych — pracownicy dowiedzą się o tym przy najbliższej publikacji.`
            : ".") +
          `\n\nTej operacji nie da się cofnąć.`
      )
    )
      return;
    try {
      const teraz = new Date().toISOString();
      const zmienione = new Map();
      const skasowane = new Set();
      for (const zm of doUsuniecia) {
        if (zm.published_at) {
          const up = await api.patch("grafik_shifts", zm.id, { deleted_at: teraz, updated_at: teraz });
          zmienione.set(String(up.id), up);
        } else {
          await api.delete("grafik_shifts", zm.id);
          skasowane.add(String(zm.id));
        }
      }
      setPlanShifts((prev) => (prev || []).filter((s) => !skasowane.has(String(s.id))).map((s) => (zmienione.has(String(s.id)) ? { ...s, ...zmienione.get(String(s.id)) } : s)));
      const { bledy } = await wycofajOfertyDlaZmian({ swaps: shiftSwaps, shiftIds: doUsuniecia.map((z) => z.id) });
      showMsg(
        `Usunięto ${doUsuniecia.length} zmian.` +
          (wyslanych > 0 ? " Opublikuj grafik, żeby pracownicy o tym wiedzieli." : "") +
          (bledy.length > 0 ? ` ⚠ Nie udało się wycofać ${bledy.length} ofert z giełdy.` : ""),
        bledy.length > 0 ? "error" : undefined
      );
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const handleNotify = async (powod) => {
    try {
      await createEmployeeNotification(
        powod.userName,
        `Kierownik próbował wpisać Ci zmianę, ale koliduje ona z Twoim zgłoszeniem. ${powod.tekst}`,
        "grafik"
      );
      showMsg("Wysłano wiadomość do pracownika.");
      setBlokada(null);
    } catch (err) {
      showMsg(`Nie udało się wysłać: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // --- Giełda zmian: prośby czekające na zgodę (status "przyjeta") ---
  const prosby = (shiftSwaps || []).filter((sw) => {
    if (sw.status !== "przyjeta") return false;
    const zm = (planShifts || []).find((p) => String(p.id) === String(sw.grafik_shift_id));
    const lokal = zm ? zm.lokal : sw.lokal;
    return lokaleNames.includes(lokal) && (!zm || zm.date >= dzisYMD);
  });
  const godzinyTygodniaPo = (userId, userName, zm) => {
    const pon = addDaysYMD(zm.date, -((new Date(zm.date + "T00:00:00").getDay() + 6) % 7));
    const nd = addDaysYMD(pon, 6);
    const u = { id: userId, name: userName };
    return (
      widocznePlan.filter((s) => s.date >= pon && s.date <= nd && isSameUser(s, u)).reduce((a, s) => a + shiftHours(s), 0) +
      shiftHours(zm)
    );
  };

  // Kropki na pasku dni (telefon): czerwona = brak, bursztynowa = nadmiar.
  const kropkaDnia = (d) => {
    let brak = false;
    let nadmiar = false;
    lokaleNames.forEach((l) => {
      const st = checkDayCoverage(
        { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki, planShifts: widocznePlan },
        l,
        d
      );
      brak = brak || st.hasGap;
      nadmiar = nadmiar || st.hasNadmiar;
    });
    return brak ? "brak" : nadmiar ? "nadmiar" : null;
  };

  return (
    <div className="flex flex-col gap-4" data-grafik-tydzien>
      {/* Pasek siedmiu dni — tylko telefon */}
      {!trybDnia && (
        <div className="md:hidden grid grid-cols-7 gap-1 -mx-1" data-pasek-dni>
          {weekDays.map((d) => {
            const k = kropkaDnia(d);
            const on = d === dzienMobilny;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setMobileDay(d)}
                className={`relative flex flex-col items-center gap-px py-1.5 rounded-lg border-[2px] font-extrabold ${
                  on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714]"
                }`}
              >
                {k && (
                  <i className={`absolute top-[3px] right-[5px] w-[7px] h-[7px] rounded-full ${k === "brak" ? "bg-[#DE3A22]" : "bg-[#8A5300]"}`} />
                )}
                {DNI[new Date(d + "T00:00:00").getDay()]}
                <small className={`text-[11px] font-bold ${on ? "text-white/75" : "text-[#6E6E66]"}`}>{Number(d.slice(8))}</small>
              </button>
            );
          })}
        </div>
      )}

      {uklad !== "budzet" && prosby.length > 0 && (
        <div className={`${kartaCls} overflow-hidden hidden md:block`} data-gielda-grafiku>
          <div className="flex items-center gap-2.5 px-[18px] py-3 border-b-[2px] border-[#171714]">
            <ArrowLeftRight size={18} />
            <h3 className="m-0 font-['Archivo'] text-[17px] font-extrabold">Giełda zmian</h3>
            <span className="ml-auto text-sm font-bold text-[#6E6E66]">{prosby.length} do decyzji</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3">
            {prosby.map((sw) => {
              const o = opisProsby(sw, widocznePlan, godzinyTygodniaPo);
              return (
                <div
                  key={sw.id}
                  className="grid grid-cols-[36px_1fr] gap-3 px-[18px] py-3.5 border-t-[1.5px] lg:border-t-0 lg:border-l-[1.5px] border-[#DEDCD4] lg:first:border-l-0"
                  data-prosba-gieldy={sw.id}
                >
                  <span className="w-9 h-9 rounded-lg grid place-items-center bg-[#E3EEFB] text-[#1D5FA8]">
                    <ArrowLeftRight size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold leading-[21px]">{o.tytul}</div>
                    <div className="text-sm leading-5 text-[#6E6E66] mt-0.5">{o.opis}</div>
                    <div className="flex gap-1.5 mt-2">
                      <button type="button" className={btnMalyGlownyCls} onClick={() => onResolveSwap(sw, "approve")}>
                        <Check size={15} /> Zgoda
                      </button>
                      <button type="button" className={btnMalyCls} onClick={() => onResolveSwap(sw, "reject")}>
                        Odrzuć
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-[18px] py-2.5 border-t-[1.5px] border-[#DEDCD4] text-[13px] text-[#6E6E66]">
            Trzy sposoby: oddanie konkretnej osobie, oddanie każdemu (pierwszy chętny), zamiana zmian. Każda wymaga Twojej
            zgody.
          </div>
        </div>
      )}

      {lokaleNames.map((lokal) => (
        <LokalSection
          key={lokal}
          lokal={lokal}
          miasto={(lokale || []).find((l) => l.name === lokal)?.miasto || null}
          weekDays={weekDays}
          dzisYMD={dzisYMD}
          users={users}
          activeStanowiska={activeStanowiska}
          planShifts={widocznePlan}
          usuniete={usuniete}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          sortBy={sortBy}
          monthPrefix={monthPrefix}
          trybDnia={trybDnia}
          mode={mode}
          pokazNaglowek={lokaleNames.length > 1}
          mobileDay={trybDnia ? weekDays[0] : dzienMobilny}
          onCellClick={(user, dateStr, shift, oferta) => openCell(user, dateStr, shift, lokal, oferta)}
          onRestore={handleRestore}
          onLuka={(dateStr, p) => openLuka(lokal, dateStr, p)}
          onAddAtStanowisko={(stanowisko, dateStr) => openAddNaStanowisko(stanowisko, dateStr, lokal)}
          onCopyPrevWeek={handleCopyPrevWeek}
          onClearRange={handleClearRange}
          uklad={uklad}
          onAddEmployee={() => onNewEmployee && onNewEmployee(lokal)}
          shiftSwaps={shiftSwaps}
          onResolveSwap={onResolveSwap}
          lokalRow={(lokale || []).find((l) => l.name === lokal) || null}
          budzetCele={budzetCele}
          budzetDni={budzetDni}
          setBudzetDni={setBudzetDni}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      ))}

      <div className="hidden md:flex gap-x-3.5 gap-y-2 flex-wrap text-[13px] text-[#6E6E66] items-center">
        <span className="inline-flex gap-1.5 items-center">
          <span className="rounded-[5px] px-1.5 py-[3px] text-[12px] font-extrabold bg-[#DE3A22] text-white">−1 KUCH 14–19</span>
          brakuje osoby — w Edycji kliknij, żeby obsadzić
        </span>
        <span className="inline-flex gap-1.5 items-center">
          <span className="rounded-[5px] px-1.5 py-[3px] text-[12px] font-extrabold bg-[#FDF0D8] text-[#8A5300]">+2 KUCH 8:30–9</span>
          więcej niż wymaga obsada (? = poza wymaganiami)
        </span>
        <span className="inline-flex gap-1.5 items-center">
          <span
            className="rounded-md px-1.5 py-0.5 text-[12px] text-[#6E6E66]"
            style={{ background: "repeating-linear-gradient(135deg,#F6F5F1 0 6px,transparent 6px 12px)" }}
          >
            Lokal · SKR
          </span>
          zmiana w innym lokalu
        </span>
        <span className="inline-flex gap-1.5 items-center">
          <span className="rounded-md border-[2px] border-dashed border-[#DE3A22] px-1.5 text-[12px] font-bold">nowa</span>
          <span className="rounded-md border-[2px] border-[#8A5300] bg-[#FDF0D8] px-1.5 text-[12px] font-bold">zmieniona</span>
          szkic — pracownicy jeszcze nie widzą
        </span>
      </div>

      {/* FAB "Dodaj zmianę" na telefonie, tylko w Edycji */}
      {edycja && !modalCtx && uklad !== "budzet" && (
        <button
          type="button"
          onClick={() => openCell(null, trybDnia ? weekDays[0] : dzienMobilny, null, lokaleNames[0])}
          className="md:hidden fixed right-4 bottom-[152px] z-30 inline-flex items-center gap-2 h-12 px-4 rounded-full bg-[#DE3A22] text-white font-['Archivo'] font-bold shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          data-fab-dodaj
        >
          <Plus size={18} /> Dodaj zmianę
        </button>
      )}

      {toast && (
        <div className="sticky bottom-0 z-30 pb-1">
          <PasekCofnij opis={toast.opis} onCofnij={cofnij} />
        </div>
      )}

      {modalCtx && (
        <GrafikZmianaModal
          ctx={modalCtx}
          users={users}
          activeStanowiska={activeStanowiska}
          lokaleNames={allLokaleNames || lokaleNames}
          lokale={lokale}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          planShifts={widocznePlan}
          weekDays={weekDays}
          przeszkodaDnia={przeszkodaDnia}
          godzinyMiesiaca={(u) => godzinyMiesiacaOsoby(widocznePlan, absences, u, monthPrefix)}
          onSave={handleSave}
          onDelete={handleDelete}
          onAddStanowisko={handleAddStanowisko}
          onAddAbsence={handleAddAbsence}
          onClose={() => setModalCtx(null)}
        />
      )}
      <GrafikBlokadaModal powod={blokada} onClose={() => setBlokada(null)} onNotify={handleNotify} />
    </div>
  );
}
