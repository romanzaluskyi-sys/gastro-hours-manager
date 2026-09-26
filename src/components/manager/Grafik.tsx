// @ts-nocheck
// Grafik — host zakładki: jeden pasek narzędzi (widok, okres, Podgląd/Edycja,
// Konfiguracja, Opublikuj · N), pasek szkicu i routing do podwidoków. Układ z
// makiety właściciela z 2026-09-25 (ScheduleWeek / ScheduleDraft /
// ScheduleMobile).
//
// Zakres lokali bierzemy z górnego paska ManagerShell (selectedLokal) — nie
// powtarzamy wyboru lokalu wewnątrz zakładki.
//
// ⚠️ "Szkic" to NIE nowa tabela ani nowy stan — to dokładnie to, co było
// "niewysłane": wiersze grafik_shifts bez published_at, poprawione po
// publikacji (updated_at > published_at) albo zdjęte po publikacji
// (deleted_at). Publikacja i powiadomienia zostają w publishGrafik.
import React, { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Pencil, Send, SlidersHorizontal } from "lucide-react";
import GrafikWymagania from "./GrafikWymagania";
import GrafikTydzien from "./GrafikTydzien";
import GrafikMiesiac from "./GrafikMiesiac";
import GrafikDoWyslaniaModal, { rodzajSzkicu } from "./GrafikDoWyslaniaModal";
import { api } from "../../api/supabase";
import { toLocalYMD, mondayOf, addDaysYMD, isUnpublished, publishGrafik } from "../../utils/grafik";

const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 md:px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] enabled:hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white enabled:hover:bg-[#B8321A]`;
const segCls = (on) =>
  `inline-flex items-center gap-1.5 h-full px-3.5 font-bold text-[15px] ${on ? "bg-[#171714] text-white" : "bg-white text-[#171714] hover:bg-[#F6F5F1]"}`;
const zmianOdm = (n) => (n === 1 ? "zmiana" : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? "zmiany" : "zmian");

// Krótko ("21–27 wrz", "29 wrz – 5 paź"), żeby wybór tygodnia miał stałą
// szerokość i na telefonie nie przeskakiwał do drugiej linii zależnie od
// tego, jak długo nazywają się miesiące.
const MIES_KR = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const fmtZakres = (od, doDnia) => {
  const a = new Date(od + "T00:00:00");
  const b = new Date(doDnia + "T00:00:00");
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MIES_KR[b.getMonth()]}`
    : `${a.getDate()} ${MIES_KR[a.getMonth()]} – ${b.getDate()} ${MIES_KR[b.getMonth()]}`;
};

export default function Grafik({
  currentUser,
  selectedLokal,
  availableLokaleForManager,
  lokale,
  users,
  setUsers,
  activeStanowiska,
  planShifts,
  setPlanShifts,
  shiftSwaps,
  onResolveSwap,
  absences,
  setAbsences,
  setShifts,
  staffingRules,
  setStaffingRules,
  staffingRuleSets,
  setStaffingRuleSets,
  lokaleGodziny,
  setLokaleGodziny,
  grafikWyjatki,
  setGrafikWyjatki,
  budzetCele,
  setBudzetCele,
  budzetDni,
  setBudzetDni,
  dayLogs,
  onNewEmployee,
  showMsg,
}) {
  const [view, setView] = useState("tydzien");
  // Trzy sposoby czytania tej samej siatki: "osoby" (ile kto ma godzin),
  // "stanowiska" (kto stoi na barze w sobotę), "budzet" (ile to kosztuje).
  const [ukladSiatki, setUkladSiatki] = useState("osoby");
  const [weekStart, setWeekStart] = useState(() => mondayOf(toLocalYMD(new Date())));
  // Widok dnia ma własną kotwicę: przeskakiwanie tydzień <-> dzień nie może
  // gubić daty, na którą kierownik właśnie patrzy.
  const [dayStart, setDayStart] = useState(() => toLocalYMD(new Date()));
  const [sortBy, setSortBy] = useState("stanowisko");
  const [lokalOverride, setLokalOverride] = useState(null);
  const [mode, setMode] = useState("podglad");
  const [month, setMonth] = useState(() => addDaysYMD(mondayOf(toLocalYMD(new Date())), 3).slice(0, 7));
  const [publishing, setPublishing] = useState(false);
  const [pokazSzkic, setPokazSzkic] = useState(false);

  const lokaleNames = selectedLokal !== "ALL" ? [selectedLokal] : (availableLokaleForManager || []).map((l) => l.name);
  // Wszystkie lokale kierownika — do przypisania zmiany w innym lokalu i do
  // publikacji (patrz niżej).
  const wszystkieLokaleNames = (availableLokaleForManager || []).map((l) => l.name);
  const lokalKonfiguracji = (lokaleNames.includes(lokalOverride) && lokalOverride) || lokaleNames[0] || null;

  const siatka = view === "tydzien" || view === "dzien";
  const weekEnd = addDaysYMD(weekStart, 6);
  const dzisYMD = toLocalYMD(new Date());
  // Liczymy i publikujemy po WSZYSTKICH lokalach kierownika, od dziś w przód —
  // zmiana wpisana z siatki jednego lokalu do drugiego inaczej nigdy by nie
  // poszła i po cichu zostawała wersją roboczą.
  const nieaktywniIds = new Set((users || []).filter((u) => u.archived || u.active === false).map((u) => String(u.id)));
  const zywePlanShifts = (planShifts || [])
    .filter((s) => !s.deleted_at)
    .map((s) => (nieaktywniIds.has(String(s.user_id)) ? { ...s, __nieaktywny: true } : s));
  const usuniete = (planShifts || []).filter((s) => s.deleted_at);
  const szkic = (planShifts || []).filter((s) => wszystkieLokaleNames.includes(s.lokal) && s.date >= dzisYMD && isUnpublished(s));
  const niewyslane = szkic.length;
  const pozaTygodniem = szkic.filter((s) => s.date < weekStart || s.date > weekEnd).length;

  const opublikuj = async (zPytaniem) => {
    if (
      zPytaniem &&
      !window.confirm(
        `Opublikować grafik? W szkicu: ${niewyslane} ${zmianOdm(niewyslane)}` +
          (pozaTygodniem > 0 ? ` (w tym ${pozaTygodniem} poza oglądanym tygodniem)` : "") +
          ". Publikujemy wszystko od dziś w przód, ze wszystkich Twoich lokali. Każda osoba dostanie jedno powiadomienie."
      )
    )
      return;
    setPublishing(true);
    try {
      const { updated, powiadomieni } = await publishGrafik({
        planShifts,
        lokaleNames: wszystkieLokaleNames,
        from: dzisYMD,
        actorName: currentUser?.name,
      });
      const mapa = new Map(updated.map((s) => [s.id, s]));
      // Wiersze usunięte przy publikacji znikają z listy — publishGrafik je
      // skasował, a w `updated` ich nie ma.
      const skasowane = new Set(
        szkic.filter((s) => s.deleted_at).map((s) => String(s.id))
      );
      setPlanShifts((prev) => (prev || []).filter((s) => !skasowane.has(String(s.id))).map((s) => (mapa.has(s.id) ? { ...s, ...mapa.get(s.id) } : s)));
      setPokazSzkic(false);
      showMsg(`Opublikowano. Powiadomionych osób: ${powiadomieni}.`);
    } catch (err) {
      showMsg(`Błąd publikacji grafiku: ${err.message || "nieznany błąd"}`, "error");
    }
    setPublishing(false);
  };

  // "Cofnij" w szkicu: nową zmianę kasujemy, usuniętą przywracamy (jako
  // zmienioną — patrz handleRestore w GrafikTydzien).
  const cofnijSzkic = async (s) => {
    try {
      if (rodzajSzkicu(s) === "nowa") {
        await api.delete("grafik_shifts", s.id);
        setPlanShifts((prev) => (prev || []).filter((x) => x.id !== s.id));
        showMsg(`Cofnięto: ${s.user_name} ${s.date}.`);
      } else if (rodzajSzkicu(s) === "usunieta") {
        const z = await api.patch("grafik_shifts", s.id, { deleted_at: null, updated_at: new Date().toISOString() });
        setPlanShifts((prev) => (prev || []).map((x) => (x.id === z.id ? { ...x, ...z } : x)));
        showMsg(`Przywrócono: ${s.user_name} ${s.date}.`);
      }
    } catch (err) {
      showMsg(`Nie udało się cofnąć: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const krok = view === "dzien" ? 1 : 7;
  const kotwica = view === "dzien" ? dayStart : weekStart;
  const ustawKotwice = view === "dzien" ? setDayStart : setWeekStart;
  const etykietaOkresu =
    view === "dzien"
      ? `${["nd", "pn", "wt", "śr", "czw", "pt", "sob"][new Date(dayStart + "T00:00:00").getDay()]} ${Number(dayStart.slice(8))} ${
          MIES_KR[Number(dayStart.slice(5, 7)) - 1]
        }`
      : fmtZakres(weekStart, weekEnd);

  if (!lokalKonfiguracji) {
    return (
      <div className="max-w-3xl mx-auto bg-white border-[2px] border-[#171714] rounded-xl p-5 text-[#6E6E66]">
        Brak lokalu, do którego masz dostęp — lokale dodaje właściciel w zakładce Ustawienia → Lokale.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5 max-w-[1600px] mx-auto" data-grafik>
      {/* Rząd 1: widok, okres, tryb, konfiguracja, publikacja. Na telefonie
          trzy STAŁE rzędy (kolejność przez `order-*`): okres na górze, pod nim
          Podgląd/Edycja z Konfiguracją, na końcu Tydzień/Miesiąc — przy
          jednym zawijanym rzędzie przełącznik trybu raz był widać, a raz
          spadał poza ekran, zależnie od długości nazwy tygodnia. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="hidden md:block m-0 mr-1.5 font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714]">Grafik</h2>
        <div className="order-3 md:order-none w-full md:w-auto inline-flex h-11 border-[2px] border-[#171714] rounded-lg overflow-hidden [&>button]:flex-1 [&>button]:justify-center md:[&>button]:flex-none">
          <button type="button" className={segCls(view === "tydzien")} onClick={() => setView("tydzien")} data-widok-grafiku="tydzien">
            Tydzień
          </button>
          <button
            type="button"
            className={`${segCls(view === "dzien")} !hidden md:!inline-flex`}
            onClick={() => {
              if (view === "tydzien" && (dayStart < weekStart || dayStart > weekEnd)) setDayStart(weekStart);
              setView("dzien");
            }}
            data-widok-grafiku="dzien"
          >
            Dzień
          </button>
          <button
            type="button"
            className={segCls(view === "miesiac")}
            onClick={() => {
              setMonth((view === "dzien" ? dayStart : addDaysYMD(weekStart, 3)).slice(0, 7));
              setView("miesiac");
            }}
            data-widok-grafiku="miesiac"
          >
            Miesiąc
          </button>
        </div>
        {siatka && (
          <div className="order-1 md:order-none w-full md:w-auto flex items-center gap-2">
            <div className="flex-1 md:flex-none inline-flex items-center h-11 border-[2px] border-[#171714] rounded-lg bg-white">
              <button
                type="button"
                onClick={() => ustawKotwice(addDaysYMD(kotwica, -krok))}
                aria-label={view === "dzien" ? "Poprzedni dzień" : "Poprzedni tydzień"}
                className="w-10 h-full grid place-items-center hover:bg-[#F6F5F1] rounded-l-md"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="flex-1 md:flex-none px-2 md:min-w-[150px] text-center font-extrabold text-[15px] whitespace-nowrap" data-okres-grafiku>
                {etykietaOkresu}
              </span>
              <button
                type="button"
                onClick={() => ustawKotwice(addDaysYMD(kotwica, krok))}
                aria-label={view === "dzien" ? "Następny dzień" : "Następny tydzień"}
                className="w-10 h-full grid place-items-center hover:bg-[#F6F5F1] rounded-r-md"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => (view === "dzien" ? setDayStart(dzisYMD) : setWeekStart(mondayOf(dzisYMD)))}
              className="px-1 text-sm font-bold underline underline-offset-[3px] hover:text-[#DE3A22]"
            >
              Dziś
            </button>
          </div>
        )}
        <span className="hidden md:block flex-1" />
        {siatka && (
          <div className="order-2 md:order-none inline-flex h-11 border-[2px] border-[#171714] rounded-lg overflow-hidden flex-1 md:flex-none">
            <button
              type="button"
              className={`${segCls(mode === "podglad")} flex-1 justify-center`}
              onClick={() => setMode("podglad")}
              data-tryb-grafiku="podglad"
            >
              <Eye size={17} /> Podgląd
            </button>
            <button
              type="button"
              className={`${segCls(mode === "edycja")} flex-1 justify-center`}
              onClick={() => setMode("edycja")}
              data-tryb-grafiku="edycja"
            >
              <Pencil size={17} /> Edycja
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setView(view === "konfiguracja" ? "tydzien" : "konfiguracja")}
          className={`order-2 md:order-none ${btnObrysCls} ${view === "konfiguracja" ? "!bg-[#171714] !text-white" : ""}`}
          title="Konfiguracja: wymagania obsady, godziny otwarcia, wyjątki, budżet"
        >
          <SlidersHorizontal size={17} /> <span className="hidden 2xl:inline">Konfiguracja</span>
        </button>
        {siatka && (
          <button
            type="button"
            onClick={() => opublikuj(true)}
            disabled={publishing || niewyslane === 0}
            className={`${btnGlownyCls} hidden md:inline-flex`}
            data-opublikuj
          >
            <Send size={17} /> {niewyslane > 0 ? `Opublikuj · ${niewyslane}` : "Opublikowane"}
          </button>
        )}
        {(view === "konfiguracja" || view === "miesiac") && lokaleNames.length > 1 && (
          <select
            value={lokalKonfiguracji}
            onChange={(e) => setLokalOverride(e.target.value)}
            className="order-2 md:order-none flex-1 md:flex-none h-11 px-3 border-[2px] border-[#171714] rounded-lg bg-white font-bold text-sm"
          >
            {lokaleNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Rząd 2: układ siatki i sortowanie */}
      {siatka && (
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
            {[
              ["osoby", "Wg osób"],
              ["stanowiska", "Wg stanowisk"],
              ["budzet", "Wg budżetu"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setUkladSiatki(k)}
                className={`hidden md:inline-flex items-center h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
                  ukladSiatki === k ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                }`}
                data-uklad-grafiku={k}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {ukladSiatki === "osoby" && (
            <label className="hidden md:flex items-center gap-2 text-[12px] font-bold tracking-[0.06em] uppercase text-[#6E6E66]">
              Sortuj
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-10 px-2 border-[2px] border-[#DEDCD4] rounded-lg bg-white text-sm font-bold normal-case tracking-normal text-[#171714]"
              >
                <option value="stanowisko">Stanowisko</option>
                <option value="godziny">Godziny w miesiącu</option>
                <option value="nazwisko">Nazwisko</option>
              </select>
            </label>
          )}
        </div>
      )}

      {/* Szkic — to, czego pracownicy jeszcze nie widzą */}
      {siatka && niewyslane > 0 && (
        <div
          className="hidden md:flex items-center gap-2.5 flex-wrap bg-[#FDF0D8] text-[#8A5300] rounded-lg py-2 pr-2 pl-3.5 font-bold text-sm"
          data-pasek-szkicu
        >
          <AlertTriangle size={17} />
          <span>
            Szkic: {niewyslane} {zmianOdm(niewyslane)} — pracownicy ich jeszcze nie widzą.
            {pozaTygodniem > 0 && <span className="font-semibold"> W tym {pozaTygodniem} poza tym tygodniem — publikacja i tak je obejmie.</span>}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setPokazSzkic(true)}
            className="inline-flex items-center h-9 px-3 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-sm"
            data-zobacz-szkic
          >
            Zobacz szkic
          </button>
          <button
            type="button"
            onClick={() => opublikuj(true)}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-sm disabled:opacity-40"
          >
            <Send size={15} /> Opublikuj
          </button>
        </div>
      )}
      {siatka && mode === "podglad" && (
        <p className="md:hidden -mt-1 text-[13px] text-[#6E6E66]">
          Podgląd — nic nie zmienisz przypadkiem. Przełącz na Edycję, żeby dodawać zmiany.
        </p>
      )}

      {view === "miesiac" && (
        <GrafikMiesiac
          lokal={lokalKonfiguracji}
          miasto={(lokale || []).find((l) => l.name === lokalKonfiguracji)?.miasto || null}
          activeStanowiska={activeStanowiska}
          planShifts={zywePlanShifts}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          users={users}
          absences={absences}
          month={month}
          setMonth={setMonth}
          onBackToWeek={() => setView("tydzien")}
        />
      )}

      {view === "konfiguracja" ? (
        <GrafikWymagania
          lokal={lokalKonfiguracji}
          activeStanowiska={activeStanowiska}
          staffingRules={staffingRules}
          setStaffingRules={setStaffingRules}
          staffingRuleSets={staffingRuleSets}
          setStaffingRuleSets={setStaffingRuleSets}
          lokaleGodziny={lokaleGodziny}
          setLokaleGodziny={setLokaleGodziny}
          grafikWyjatki={grafikWyjatki}
          setGrafikWyjatki={setGrafikWyjatki}
          budzetCele={budzetCele}
          setBudzetCele={setBudzetCele}
          budzetDni={budzetDni}
          setBudzetDni={setBudzetDni}
          dayLogs={dayLogs}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      ) : siatka ? (
        <GrafikTydzien
          lokaleNames={lokaleNames}
          allLokaleNames={wszystkieLokaleNames}
          lokale={lokale}
          users={users}
          setUsers={setUsers}
          activeStanowiska={activeStanowiska}
          planShifts={zywePlanShifts}
          usuniete={usuniete}
          setPlanShifts={setPlanShifts}
          absences={absences}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          grafikWyjatki={grafikWyjatki}
          weekStart={view === "dzien" ? dayStart : weekStart}
          trybDnia={view === "dzien"}
          uklad={ukladSiatki}
          onNewEmployee={onNewEmployee}
          sortBy={sortBy}
          mode={mode}
          shiftSwaps={shiftSwaps}
          onResolveSwap={onResolveSwap}
          setAbsences={setAbsences}
          setShifts={setShifts}
          budzetCele={budzetCele}
          budzetDni={budzetDni}
          setBudzetDni={setBudzetDni}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      ) : null}

      {/* Telefon: ciemny pasek szkicu nad dolną nawigacją */}
      {siatka && niewyslane > 0 && !pokazSzkic && (
        <div
          className="md:hidden fixed left-3 right-3 bottom-[84px] z-30 flex items-center gap-2 bg-[#171714] text-white rounded-xl py-2.5 pr-2.5 pl-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
          data-pasek-szkicu-mobile
        >
          <span className="flex-1 text-sm">
            <b>Szkic · {niewyslane}</b> nieopubl.
          </span>
          <button
            type="button"
            onClick={() => setPokazSzkic(true)}
            className="h-10 px-3 rounded-lg border-[2px] border-white font-['Archivo'] font-bold text-sm"
          >
            Zobacz
          </button>
          <button
            type="button"
            onClick={() => opublikuj(true)}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg bg-[#DE3A22] font-['Archivo'] font-bold text-sm disabled:opacity-40"
          >
            <Send size={15} /> Opublikuj
          </button>
        </div>
      )}

      {pokazSzkic && (
        <GrafikDoWyslaniaModal
          zmiany={szkic}
          publishing={publishing}
          onPublish={() => opublikuj(false)}
          onCofnij={cofnijSzkic}
          onClose={() => setPokazSzkic(false)}
        />
      )}
    </div>
  );
}
