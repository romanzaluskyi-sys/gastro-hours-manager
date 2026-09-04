// @ts-nocheck
// Grafik → widok tygodnia w trybie Podgląd: jedna tabela na lokal,
// pracownicy w wierszach, siedem dni w kolumnach. Tryb Edycja (wpisywanie
// zmian) dochodzi w kolejnym etapie — tutaj niczego się nie zapisuje.
//
// Wybór lokalu celowo NIE jest powtórzony w środku: górny pasek
// ManagerShell ("Cała sieć" + zakładki lokali) już to robi i stoi nad
// treścią, co daje układ ustalony z właścicielem — lokale nad okresem.
//
// Cała arytmetyka (dziury w obsadzie, godziny zmian, zmiany przez północ)
// żyje w utils/grafik.ts — tu jest wyłącznie prezentacja.
import React, { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  AlertTriangle,
  Plus,
  CopyPlus,
  UserPlus,
} from "lucide-react";
import { api } from "../../api/supabase";
import { createEmployeeNotification } from "../../api/notifications";
import GrafikZmianaModal, { GrafikBlokadaModal } from "./GrafikZmianaModal";
import {
  sectionCardCls,
  btnPrimaryCls,
  btnSecondaryCls,
  statLabelCls,
} from "./designTokens";
import {
  trimTime,
  shiftHours,
  checkDayCoverage,
  addDaysYMD,
  toLocalYMD,
  mondayOf,
  findOverlappingPlanShift,
  findBlockingAbsence,
  buildCopyFromPreviousWeek,
  storedStanowiskaArr,
} from "../../utils/grafik";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { fetchDailyForecast, describeWeatherCode } from "../../utils/weather";

const DZIEN_SKROT = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

const fmtDay = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });

const fmtRange = (from, to) => {
  const a = new Date(from + "T00:00:00");
  const b = new Date(to + "T00:00:00");
  const opts = { day: "numeric", month: "long" };
  return `${a.toLocaleDateString("pl-PL", opts)} – ${b.toLocaleDateString("pl-PL", opts)}`;
};

const fmtH = (h) => `${Math.round(h * 10) / 10} h`;

// Wniosek o wolne obowiązujący danego dnia. Tylko zatwierdzone — odrzucone
// i oczekujące nie blokują niczego w grafiku.
const absenceOn = (absences, user, dateStr) =>
  (absences || []).find(
    (a) =>
      a.status === "approved" &&
      a.start_date <= dateStr &&
      dateStr <= a.end_date &&
      (a.user_id ? String(a.user_id) === String(user.id) : a.user_name === user.name)
  ) || null;

const isSameUser = (planShift, user) =>
  planShift.user_id
    ? String(planShift.user_id) === String(user.id)
    : planShift.user_name === user.name;

// Godziny urlopu w danym miesiącu — urlop nie jest zmianą w planie, ale
// liczy się jako 8 h za każdy dzień roboczy (ustalenie właściciela, ta
// sama formuła co buildUrlopShiftDrafts w utils/absences.ts). Liczba zmian
// świadomie go NIE obejmuje.
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
      const lastDay = new Date(
        Number(monthPrefix.slice(0, 4)),
        Number(monthPrefix.slice(5, 7)),
        0
      );
      const monthEnd = toLocalYMD(lastDay);
      const to = a.end_date > monthEnd ? monthEnd : a.end_date;
      if (from > to) return sum;
      return sum + countWorkdays(from, to) * URLOP_HOURS_PER_DAY;
    }, 0);

function LokalSection({
  lokal,
  miasto,
  weekDays,
  users,
  activeStanowiska,
  planShifts,
  absences,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  sortBy,
  monthPrefix,
  mode,
  onCellClick,
  onCopyPrevWeek,
  onAddEmployee,
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
      .catch((err) => {
        console.error(`Brak prognozy pogody dla "${miasto}":`, err.message || err);
        if (!cancelled) setForecast({});
      });
    return () => {
      cancelled = true;
    };
  }, [miasto]);

  // Open-Meteo daje maksymalnie 16 dni w przód (i 7 wstecz) — dla dat poza
  // tym oknem nie ma czego pokazać, więc zostawiamy pusto zamiast mylnie
  // wyglądającego "—", które sugerowałoby awarię.
  const forecastKeys = Object.keys(forecast);
  const forecastFrom = forecastKeys.length > 0 ? forecastKeys[0] : null;
  const forecastTo =
    forecastKeys.length > 0 ? forecastKeys[forecastKeys.length - 1] : null;
  const wZasieguProgozy = (d) =>
    forecastFrom != null && d >= forecastFrom && d <= forecastTo;

  const weekFrom = weekDays[0];
  const weekTo = weekDays[6];
  const planWeek = (planShifts || []).filter(
    (s) => s.date >= weekFrom && s.date <= weekTo
  );

  // Wiersze: wszyscy przypisani do lokalu + każdy, kto ma tu w tym tygodniu
  // zaplanowaną zmianę (np. wyjątkowo, mimo innego lokalu domyślnego).
  const rows = (users || []).filter(
    (u) =>
      !u.archived &&
      u.active !== false &&
      u.role !== "kiosk" &&
      (u.default_lokal === lokal ||
        planWeek.some((s) => s.lokal === lokal && isSameUser(s, u)))
  );

  const monthPlanFor = (u) =>
    (planShifts || []).filter((s) => s.date.startsWith(monthPrefix) && isSameUser(s, u));

  const rowMeta = rows.map((u) => {
    const monthShifts = monthPlanFor(u);
    const hours =
      monthShifts.reduce((sum, s) => sum + shiftHours(s), 0) +
      urlopHoursInMonth(absences, u, monthPrefix);
    const stawka = u.stawka === "" || u.stawka == null ? null : Number(u.stawka);
    const lokaleOsoby = [...new Set(monthShifts.map((s) => s.lokal))];
    const stanowiskaOsoby = [...new Set(monthShifts.map((s) => s.stanowisko).filter(Boolean))];
    return {
      user: u,
      hours,
      zmian: monthShifts.length,
      koszt: stawka != null ? hours * stawka : null,
      wieleLokali: lokaleOsoby.length > 1,
      wieleStanowisk: stanowiskaOsoby.length > 1,
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

  const dayStats = weekDays.map((d) =>
    checkDayCoverage(
      { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki, planShifts },
      lokal,
      d
    )
  );
  const weekHours = dayStats.reduce((sum, s) => sum + s.hours, 0);
  const osobyWTygodniu = new Set(
    planWeek.filter((s) => s.lokal === lokal).map((s) => s.user_name)
  ).size;
  const dniPodMinimum = dayStats.filter((s) => s.hasGap).length;

  const exportCsv = () => {
    const head = ["Pracownik", "Stanowisko", ...weekDays.map((d) => `${d}`)];
    const lines = [head.join(";")];
    sorted.forEach(({ user }) => {
      const cells = weekDays.map((d) => {
        const own = planWeek.filter(
          (s) => s.lokal === lokal && s.date === d && isSameUser(s, user)
        );
        if (own.length > 0) {
          return own
            .map((s) => `${trimTime(s.start_time)}-${trimTime(s.end_time)} ${s.stanowisko || ""}`)
            .join(" | ");
        }
        const abs = absenceOn(absences, user, d);
        if (abs) return abs.type === "urlop" ? "URLOP" : "NIEDOSTEPNY";
        const gdzie = planWeek.find((s) => s.date === d && isSameUser(s, user));
        return gdzie ? `w ${gdzie.lokal}` : "";
      });
      lines.push([user.name, user.default_stanowisko || "", ...cells].join(";"));
    });
    lines.push(
      ["RAZEM", "", ...dayStats.map((s) => `${s.hours} h / ${s.people} os.`)].join(";")
    );
    // Ten sam wzorzec eksportu co RejestrGodzin.tsx — BOM, żeby Excel nie
    // rozjechał polskich znaków; bez żadnej dodatkowej biblioteki.
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grafik-${lokal.replace(/\s+/g, "-").toLowerCase()}-${weekFrom}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const edycja = mode === "edycja";

  const renderCell = (user, dateStr) => {
    const own = planWeek.filter(
      (s) => s.lokal === lokal && s.date === dateStr && isSameUser(s, user)
    );
    if (own.length > 0) {
      return (
        <div className="space-y-1">
          {own.map((s) => {
            const style = stanowiskoBadgeStyle(activeStanowiska, lokal, s.stanowisko);
            const Wrapper = edycja ? "button" : "div";
            return (
              <Wrapper
                key={s.id}
                onClick={edycja ? () => onCellClick(user, dateStr, s) : undefined}
                className={`flex items-center gap-1.5 w-full text-left ${
                  edycja ? "hover:bg-[#F1F1EE] rounded px-1 -mx-1" : ""
                }`}
                title={edycja ? "Kliknij, aby edytować" : ""}
              >
                <span
                  className="px-1.5 py-0.5 rounded text-[11px] font-extrabold flex-shrink-0"
                  style={style || { backgroundColor: "#E7E7E2", color: "#171714" }}
                  title={s.stanowisko || ""}
                >
                  {stanowiskoShort(activeStanowiska, lokal, s.stanowisko)}
                </span>
                <span className="text-[12px] tabular-nums whitespace-nowrap">
                  {trimTime(s.start_time)} – {trimTime(s.end_time)}
                </span>
              </Wrapper>
            );
          })}
          {edycja && (
            <button
              onClick={() => onCellClick(user, dateStr, null)}
              className="text-[11px] text-[#8F8E86] hover:text-[#171714] underline"
            >
              + druga zmiana
            </button>
          )}
        </div>
      );
    }

    const abs = absenceOn(absences, user, dateStr);
    if (abs) {
      const urlop = abs.type === "urlop";
      return (
        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-extrabold ${
              urlop ? "bg-[#DE3A22] text-white" : "bg-[#E7E7E2] text-[#6E6E66]"
            }`}
          >
            {urlop ? "URP" : "NIE"}
          </span>
          <span className="text-[12px] text-[#6E6E66]">
            {urlop ? "urlop" : "brak dostępności"}
          </span>
        </div>
      );
    }

    const gdzieIndziej = planWeek.find((s) => s.date === dateStr && isSameUser(s, user));
    if (gdzieIndziej) {
      return (
        <span className="text-[12px] text-[#8F8E86]">— w {gdzieIndziej.lokal}</span>
      );
    }
    // Komórki z URP/NIE i "w innym lokalu" świadomie NIE dostają "+ dodaj":
    // pierwszych nie wolno obsadzić, drugie to cudzy plan.
    if (edycja) {
      return (
        <button
          onClick={() => onCellClick(user, dateStr, null)}
          className="w-full text-[12px] text-[#8F8E86] border-[2px] border-dashed border-[#B7B6AE] rounded px-2 py-1 hover:border-[#171714] hover:text-[#171714]"
        >
          <Plus size={12} className="inline -mt-0.5" /> dodaj
        </button>
      );
    }
    return null;
  };

  return (
    <div className={sectionCardCls}>
      <div className="px-4 py-3 border-b-[2px] border-[#171714] flex flex-wrap items-center gap-3">
        <h3 className="font-['Archivo'] font-extrabold text-[16px]">{lokal}</h3>
        <span className="text-[13px] text-[#6E6E66]">
          {osobyWTygodniu} osób · {fmtH(weekHours)} w tygodniu
        </span>
        {dniPodMinimum > 0 && (
          <span className="text-[13px] font-bold text-[#DE3A22] flex items-center gap-1">
            <AlertTriangle size={14} />
            {dniPodMinimum} {dniPodMinimum === 1 ? "dzień" : "dni"} pod minimum
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {mode === "edycja" && (
            <button onClick={() => onCopyPrevWeek(lokal)} className={btnSecondaryCls}>
              <CopyPlus size={15} className="inline -mt-0.5 mr-1" /> Kopiuj z poprzedniego tygodnia
            </button>
          )}
          <button onClick={exportCsv} className={btnSecondaryCls}>
            <Download size={15} className="inline -mt-0.5 mr-1" /> Eksport lokalu
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1040px]">
          <thead>
            <tr className="bg-[#F1F1EE]">
              <th className="text-left px-3 py-2 border-r-[2px] border-[#171714] w-[190px] min-w-[190px] align-top">
                <span className={statLabelCls}>Pracownik</span>
                <div className="text-[11px] text-[#8F8E86] font-normal normal-case">
                  godziny i zmiany w miesiącu
                </div>
                {mode === "edycja" && (
                  <button
                    onClick={() => onAddEmployee(lokal)}
                    className="mt-1.5 w-full px-2 py-1 rounded border-[2px] border-[#DE3A22] text-[#DE3A22] text-[12px] font-bold hover:bg-[#FAEAE6]"
                  >
                    <UserPlus size={13} className="inline -mt-0.5 mr-1" /> Dodaj pracownika
                  </button>
                )}
              </th>
              {weekDays.map((d, i) => {
                const stat = dayStats[i];
                const pogoda = forecast[d];
                return (
                  <th
                    key={d}
                    className="px-3 py-2 text-left border-r-[2px] border-[#E7E7E2] last:border-r-0 align-top"
                  >
                    <div className="font-['Archivo'] font-extrabold text-[19px] leading-none text-[#8F8E86]">
                      {DZIEN_SKROT[new Date(d + "T00:00:00").getDay()]}
                    </div>
                    <div className="font-['Archivo'] font-extrabold text-[15px] mt-1">
                      {fmtDay(d)}
                    </div>
                    {/* Stała wysokość, żeby dni bez prognozy nie rozjeżdżały
                        wyrównania nagłówków; "—" zamiast pustki, bo pusty
                        wiersz nie odróżnia "brak danych" od "nie działa". */}
                    <div
                      className="text-[11px] text-[#8F8E86] h-[15px] leading-[15px] whitespace-nowrap"
                      title={
                        pogoda && pogoda.temp != null
                          ? describeWeatherCode(pogoda.code).label
                          : wZasieguProgozy(d)
                          ? "Brak prognozy dla tego dnia"
                          : "Prognoza sięga 16 dni w przód"
                      }
                    >
                      {pogoda && pogoda.temp != null
                        ? `${describeWeatherCode(pogoda.code).icon} ${Math.round(pogoda.temp)}°`
                        : wZasieguProgozy(d)
                        ? "—"
                        : ""}
                    </div>
                    <div
                      className={`flex items-center justify-between gap-2 text-[12px] font-bold mt-1 ${
                        stat.hasGap ? "text-[#DE3A22]" : "text-[#171714]"
                      }`}
                      title={
                        stat.hasGap
                          ? stat.gaps
                              .map(
                                (g) =>
                                  `${g.stanowisko}: ${g.from}–${g.to}, brakuje ${g.missing}`
                              )
                              .join("\n")
                          : ""
                      }
                    >
                      <span>{stat.people} os.</span>
                      <span>
                        {fmtH(stat.hours)}
                        {stat.hasGap ? " ⚠" : ""}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-[#6E6E66] text-sm"
                >
                  Nikt nie jest przypisany do tego lokalu.
                </td>
              </tr>
            )}
            {sorted.map((meta) => (
              <tr key={meta.user.id} className="border-t-[2px] border-[#E7E7E2]">
                <td className="px-3 py-2 border-r-[2px] border-[#171714] align-top">
                  <div className="flex items-start gap-1.5">
                    {(meta.wieleLokali || meta.wieleStanowisk) && (
                      <span
                        className="w-[3px] self-stretch bg-[#DE3A22] rounded flex-shrink-0"
                        title={
                          meta.wieleLokali
                            ? `Pracuje też w: ${meta.innyLokal.join(", ")}`
                            : "Pracuje na kilku stanowiskach"
                        }
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-['Archivo'] font-bold text-[14px] truncate">
                        {meta.user.name}
                      </div>
                      <div className="text-[11px] text-[#6E6E66] truncate">
                        {meta.user.default_stanowisko || "bez stanowiska"}
                      </div>
                      <div className="text-[12px] mt-0.5">
                        <strong>{fmtH(meta.hours)}</strong>{" "}
                        <span className="text-[#6E6E66]">· {meta.zmian} zmian</span>
                      </div>
                      <div className="text-[11px] text-[#6E6E66]">
                        {meta.koszt != null
                          ? `${Math.round(meta.koszt)} zł`
                          : "brak stawki"}
                      </div>
                    </div>
                  </div>
                </td>
                {weekDays.map((d) => (
                  <td
                    key={d}
                    className="px-3 py-2 border-r-[2px] border-[#E7E7E2] last:border-r-0 align-top"
                  >
                    {renderCell(meta.user, d)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#F1F1EE] border-t-[2px] border-[#171714]">
              <td className="px-3 py-2 border-r-[2px] border-[#171714]">
                <span className={statLabelCls}>Razem</span>
                <div className="font-['Archivo'] font-extrabold text-[15px]">
                  {fmtH(weekHours)}
                </div>
              </td>
              {dayStats.map((stat) => (
                <td
                  key={stat.date}
                  className="px-3 py-2 border-r-[2px] border-[#E7E7E2] last:border-r-0"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-[#6E6E66]">{stat.people} os.</span>
                    <span className="font-['Archivo'] font-extrabold text-[14px]">
                      {fmtH(stat.hours)}
                    </span>
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function GrafikTydzien({
  lokaleNames,
  allLokaleNames,
  lokale,
  users,
  activeStanowiska,
  planShifts,
  setPlanShifts,
  absences,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  setUsers,
  weekStart,
  setWeekStart,
  sortBy,
  setSortBy,
  mode,
  showMsg,
}) {
  const [modalCtx, setModalCtx] = useState(null);
  const [blokada, setBlokada] = useState(null);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysYMD(weekStart, i));
  // Tydzień na przełomie miesięcy przypisujemy do miesiąca swojego czwartku
  // (ta sama zasada co w ISO 8601 dla numeru tygodnia) — inaczej "31 sie –
  // 6 wrz" liczyłoby sumy miesięczne z sierpnia, mimo że sześć z siedmiu
  // dni to wrzesień.
  const monthPrefix = weekDays[3].slice(0, 7);

  const openCell = (user, dateStr, shift, lokal) =>
    setModalCtx({ user, date: dateStr, shift, lokal });

  // "Dodaj pracownika" z nagłówka tabeli: ten sam modal, ale bez wybranej
  // osoby i bez wybranego dnia — lokal jest już znany z tabeli, w której
  // kliknięto. Po zapisaniu zmiany osoba pojawia się w siatce sama.
  const openAddEmployee = (lokal) =>
    setModalCtx({ user: null, date: weekStart, shift: null, lokal, pickDate: true });

  // Jedyne miejsce, które zapisuje zaplanowaną zmianę. Kolejność sprawdzeń
  // jest istotna: najpierw zatwierdzone wolne (twarda odmowa), potem
  // nakładające się godziny. Praca w dwóch lokalach jednego dnia i druga
  // zmiana tego samego dnia są DOZWOLONE — patrz docs/GRAFIK.md.
  const handleSave = async (data) => {
    const user = (users || []).find((u) => String(u.id) === String(data.user_id));
    const wolne = user ? findBlockingAbsence(absences, user, data.date) : null;
    if (wolne) {
      setBlokada({
        userName: data.user_name,
        tekst:
          wolne.type === "urlop"
            ? `${data.user_name} ma tego dnia zatwierdzony urlop (${wolne.start_date} – ${wolne.end_date}).`
            : `${data.user_name} zgłosił(a) brak dostępności na ten dzień (${wolne.start_date} – ${wolne.end_date}).`,
        podpowiedz:
          "Dostępność zgłasza pracownik w swojej aplikacji. Aby to obejść, poproś o wycofanie zgłoszenia.",
      });
      return false;
    }

    const kolizja = findOverlappingPlanShift(planShifts, {
      user_id: data.user_id,
      user_name: data.user_name,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      excludeId: data.id,
    });
    if (kolizja) {
      setBlokada({
        userName: data.user_name,
        tekst: `${data.user_name} ma już zmianę w lokalu ${kolizja.lokal} (${trimTime(
          kolizja.start_time
        )} – ${trimTime(kolizja.end_time)}, ${kolizja.date}), która nachodzi na te godziny.`,
        podpowiedz:
          "Blokujemy tylko nachodzące godziny — zmianę dzieloną (np. do 14:00 tu, od 14:00 gdzie indziej) można wpisać normalnie.",
      });
      return false;
    }

    try {
      const payload = {
        lokal: data.lokal,
        user_id: data.user_id,
        user_name: data.user_name,
        stanowisko: data.stanowisko,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        updated_at: new Date().toISOString(),
      };
      if (data.id) {
        const zapisana = await api.patch("grafik_shifts", data.id, payload);
        setPlanShifts((planShifts || []).map((s) => (s.id === zapisana.id ? zapisana : s)));
      } else {
        const zapisana = await api.post("grafik_shifts", payload);
        setPlanShifts([...(planShifts || []), zapisana]);
      }
      if (!data.dodajNastepna) setModalCtx(null);
      return true;
    } catch (err) {
      showMsg(`Błąd zapisu zmiany: ${err.message || "nieznany błąd"}`, "error");
      return false;
    }
  };

  const handleDelete = async (shift) => {
    if (!window.confirm("Usunąć tę zmianę z grafiku?")) return;
    try {
      await api.delete("grafik_shifts", shift.id);
      setPlanShifts((planShifts || []).filter((s) => s.id !== shift.id));
      setModalCtx(null);
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const handleCopyPrevWeek = async (lokal) => {
    const { drafts, skipped } = buildCopyFromPreviousWeek({
      planShifts,
      absences,
      users,
      lokal,
      weekStart,
    });
    if (drafts.length === 0) {
      showMsg("Poprzedni tydzień jest pusty — nie ma czego skopiować.", "error");
      return;
    }
    if (
      !window.confirm(
        `Skopiować ${drafts.length} zmian z poprzedniego tygodnia do ${lokal}?` +
          (skipped.length > 0
            ? `\n\nPominiętych: ${skipped.length} (wolne albo kolizja godzin).`
            : "")
      )
    )
      return;
    try {
      const utworzone = [];
      for (const d of drafts) {
        utworzone.push(
          await api.post("grafik_shifts", { ...d, updated_at: new Date().toISOString() })
        );
      }
      setPlanShifts([...(planShifts || []), ...utworzone]);
      showMsg(
        `Skopiowano ${utworzone.length} zmian.` +
          (skipped.length > 0 ? ` Pominięto ${skipped.length}.` : "")
      );
    } catch (err) {
      showMsg(`Błąd kopiowania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // Dopisanie stanowiska prosto z grafiku — u właściciela ludzie krążą
  // między lokalami i to stanowisko, a nie lokal, decyduje kto może wejść
  // na zmianę. Chodzenie za każdym razem do karty pracownika tylko po to,
  // żeby odhaczyć jeden checkbox, byłoby stratą czasu.
  const handleAddStanowisko = async (user, stanowisko) => {
    try {
      const lista = [...new Set([...storedStanowiskaArr(user), stanowisko])].filter(
        (n) => n && n !== user.default_stanowisko
      );
      const zapisany = await api.patch("users", user.id, {
        allowed_stanowiska: lista.length > 0 ? lista.join(",") : null,
      });
      setUsers((users || []).map((u) => (u.id === zapisany.id ? zapisany : u)));
      showMsg(`${stanowisko} dopisane do umiejętności: ${user.name}.`);
    } catch (err) {
      showMsg(`Nie udało się dopisać stanowiska: ${err.message || "nieznany błąd"}`, "error");
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

  const legenda = [
    ...new Map(
      (activeStanowiska || [])
        .filter((s) => lokaleNames.includes(s.lokal_name))
        .map((s) => [s.name, s])
    ).values(),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setWeekStart(addDaysYMD(weekStart, -7))}
          className={btnSecondaryCls}
          title="Poprzedni tydzień"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-['Archivo'] font-extrabold text-[16px] min-w-[220px] text-center">
          {fmtRange(weekDays[0], weekDays[6])}
        </span>
        <button
          onClick={() => setWeekStart(addDaysYMD(weekStart, 7))}
          className={btnSecondaryCls}
          title="Następny tydzień"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => setWeekStart(mondayOf(toLocalYMD(new Date())))}
          className={btnPrimaryCls}
        >
          Dziś
        </button>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
          className="p-2 border-[2px] border-[#171714] rounded"
          title="Skocz do tygodnia z tą datą"
        />

        <div className="ml-auto flex items-center gap-2">
          <span className={statLabelCls}>Sortuj</span>
          {[
            { key: "stanowisko", label: "Stanowisko" },
            { key: "godziny", label: "Godziny" },
            { key: "nazwisko", label: "Nazwisko" },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setSortBy(o.key)}
              className={`px-3 py-1.5 rounded border-[2px] text-[13px] font-bold ${
                sortBy === o.key
                  ? "bg-[#171714] text-white border-[#171714]"
                  : "bg-white text-[#171714] border-[#B7B6AE]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {legenda.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={statLabelCls}>Legenda</span>
          {legenda.map((s) => {
            const style = stanowiskoBadgeStyle(activeStanowiska, s.lokal_name, s.name);
            return (
              <span key={s.name} className="flex items-center gap-1.5 text-[12px]">
                <span
                  className="px-1.5 py-0.5 rounded text-[11px] font-extrabold"
                  style={style || { backgroundColor: "#E7E7E2", color: "#171714" }}
                >
                  {stanowiskoShort(activeStanowiska, s.lokal_name, s.name)}
                </span>
                {s.name}
              </span>
            );
          })}
        </div>
      )}

      {lokaleNames.map((lokal) => (
        <LokalSection
          key={lokal}
          lokal={lokal}
          miasto={(lokale || []).find((l) => l.name === lokal)?.miasto || null}
          weekDays={weekDays}
          users={users}
          activeStanowiska={activeStanowiska}
          planShifts={planShifts}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          sortBy={sortBy}
          monthPrefix={monthPrefix}
          mode={mode}
          onCellClick={(user, dateStr, shift) => openCell(user, dateStr, shift, lokal)}
          onCopyPrevWeek={handleCopyPrevWeek}
          onAddEmployee={openAddEmployee}
        />
      ))}

      <p className="text-[12px] text-[#6E6E66]">
        <strong>URP</strong> — urlop zatwierdzony · <strong>NIE</strong> — pracownik
        zgłosił brak dostępności, nie da się tu wpisać zmiany · czerwony pasek przy
        nazwisku — kilka lokali lub stanowisk · szare "w ..." — tego dnia osoba ma
        zmianę w innym lokalu.{" "}
        {mode === "edycja"
          ? "Tryb edycji — zmiany nie są jeszcze wysłane pracownikom."
          : "Tryb podglądu — przełącz na Edycję, żeby wpisywać zmiany."}
      </p>

      {modalCtx && (
        <GrafikZmianaModal
          ctx={modalCtx}
          users={users}
          activeStanowiska={activeStanowiska}
          lokaleNames={allLokaleNames || lokaleNames}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          planShifts={planShifts}
          weekDays={weekDays}
          onSave={handleSave}
          onDelete={handleDelete}
          onAddStanowisko={handleAddStanowisko}
          onClose={() => setModalCtx(null)}
        />
      )}
      <GrafikBlokadaModal
        powod={blokada}
        onClose={() => setBlokada(null)}
        onNotify={handleNotify}
      />
    </div>
  );
}
