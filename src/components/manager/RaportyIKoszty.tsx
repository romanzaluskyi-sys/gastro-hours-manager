// @ts-nocheck
// Raporty i koszty — układ z makiety właściciela z 2026-09-25 (design system
// "Shiftro", ReportsDesktop / ReportsMobile). Strona otwierana raz, dwa razy w
// miesiącu, która ma odpowiedzieć na DWA pytania: "jak idzie biznes" i "czy
// mogę wysłać wypłaty". Dlatego wnioski stoją PRZED tabelami:
//   1. Kafelki — "Koszt pracy" na czarno jako główny, z uczciwym zastrzeżeniem,
//      gdy komuś brakuje wynagrodzenia; średni koszt godziny LICZONY, a nie "—".
//   2. "Na co zwrócić uwagę" — wnioski wygenerowane z danych, każdy z akcją.
//   3. "Gotowość do rozliczenia" — co BLOKUJE wysyłkę, a co jest tylko
//      ostrzeżeniem.
//   4. "Struktura kosztów" — pasek udziałów po lokalach, potem Lokale /
//      Stanowiska / Pracownicy z udziałem, godzinami, kosztem i zł/h.
//
// Imię pracownika w Rejestr Godzin/Aktywni nawiguje tu przez selectedUserId
// sterowany z ManagerDashboard.tsx — patrz goToEmployeeReport tam.
import React, { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Info,
  PieChart,
  Send,
  User,
  X,
} from "lucide-react";
import {
  buildPlanFactMap,
  sumujPlanFakt,
  toLocalYMD,
  PLAN_FAKT_PROG_H,
} from "../../utils/grafik";
import {
  kosztMiesiaca,
  nadwyzkaPonadNorme,
  naEtacie,
  typUmowy,
  TYPY_UMOWY,
} from "../../utils/umowy";
import { wymiarCzasuPracy } from "../../utils/kalendarz";
import { zl } from "../../utils/budzet";
import { pad, odmiana, DNI_KROTKIE } from "../../utils/czas";

const NBSP = " ";
const MIESIACE = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec",
  "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

// Wpis krótszy niż pół godziny prawie zawsze jest przypadkowym odbiciem
// (start i koniec jednym ruchem), a nie pracą.
const KROTKI_WPIS_H = 0.5;
// Od ilu godzin ponad normę pełnego etatu mówimy o przeciążeniu. Nadgodziny w
// gastronomii są normalne; 25% ponad pełny etat już nie.
const PRZECIAZENIE = 1.25;

// "3 912,6" — tysiące ze spacją, jedno miejsce po przecinku.
const liczba = (n, miejsc = 1) => {
  const r = Number(n || 0);
  const [c, d] = Math.abs(r).toFixed(miejsc).split(".");
  const cale = c.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${r < 0 && Math.abs(r) >= 0.05 ? "−" : ""}${cale}${d ? `,${d}` : ""}`;
};
const hh = (n) => `${liczba(n)}${NBSP}h`;
const kwota = (n) => liczba(Math.round(n || 0), 0);
const naGodzine = (koszt, godz) =>
  koszt == null || !godz ? "—" : (koszt / godz).toFixed(2).replace(".", ",");
const hhmm = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
const dzienMies = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
const hoursOf = (s) => (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0);

// Kolory w pasku udziałów. Lokal dostaje kolor po swojej pozycji w słowniku —
// NIE po miejscu w rankingu, inaczej ten sam lokal zmieniałby kolor z
// miesiąca na miesiąc. Stanowisko bierze swój `kolor` z Ustawień, gdy jest.
const PALETA = ["#D23F26", "#1C1B19", "#8A5300", "#1F4FB5", "#2F5A2A", "#9B3FB5", "#6B4A2A", "#A04A3A"];
const KOLOR_URLOPU = "#1D5FA8";
const KOLOR_INNY = "#6B6860";
const hashKoloru = (tekst) => {
  let h = 0;
  for (const z of String(tekst)) h = (h * 31 + z.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};

// --- klasy (tokeny "Shiftro", te same co w Rejestrze godzin) ---
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] enabled:hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white enabled:hover:bg-[#B8321A] enabled:hover:border-[#B8321A]`;
const btnMalyCls =
  "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-[2px] border-[#171714] bg-white font-['Archivo'] font-bold text-[14px] text-[#171714] whitespace-nowrap hover:bg-[#F6F5F1]";
const linkCls = "font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22]";
const znakZapytaniaCls =
  "inline-flex items-center h-5 px-1.5 rounded bg-[#FDF0D8] text-[#8A5300] text-[12px] font-extrabold ml-1";
// Siatka tabeli "Struktura kosztów" — nagłówek i wiersze MUSZĄ mieć tę samą.
const siatkaCls =
  "grid grid-cols-[18px_minmax(0,1fr)_64px_92px] lg:grid-cols-[24px_minmax(160px,1.4fr)_minmax(110px,1fr)_84px_116px_72px] gap-2 lg:gap-3 items-center px-3 lg:px-[18px] tabular-nums";
// Siatka listy zmian w szczegółach osoby.
const siatkaWpisuCls =
  "grid grid-cols-[78px_minmax(0,1fr)_52px] md:grid-cols-[96px_minmax(0,1fr)_120px_96px_56px_20px] gap-2 md:gap-2.5 items-center px-3 md:px-[18px] tabular-nums";

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md).
// ---------------------------------------------------------------------------

// Porównanie z poprzednim okresem — neutralny znaczek ze strzałką, BEZ zieleni
// i czerwieni. Wyższy koszt przy wyższym utargu nie jest porażką, a więcej
// godzin nie jest ani dobre, ani złe samo z siebie.
function Trend({ teraz, przed, opis, hero = false }) {
  if (przed == null || przed <= 0) return null;
  const pct = ((teraz - przed) / przed) * 100;
  const znak = Math.abs(pct) < 0.5 ? "=" : pct > 0 ? "▲" : "▼";
  return (
    <div
      className={`flex items-center gap-2 text-sm mt-auto pt-2 flex-wrap ${hero ? "text-white/75" : "text-[#6E6E66]"}`}
      data-trend
    >
      <span
        className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[13px] font-extrabold tabular-nums ${
          hero ? "bg-white/15 text-white" : "bg-[#ECEBE6] text-[#171714]"
        }`}
      >
        {znak} {Math.abs(pct) < 0.5 ? "bez zmian" : `${liczba(Math.abs(pct))}%`}
      </span>
      <span>{opis}</span>
    </div>
  );
}

function Kafelek({ etykieta, hero = false, children, ...reszta }) {
  return (
    <div
      className={`${
        hero
          ? "bg-[#171714] text-white border-[2px] border-[#171714] rounded-xl"
          : `${kartaCls} text-[#171714]`
      } px-[18px] pt-4 pb-[18px] flex flex-col gap-1 min-w-[76%] sm:min-w-[46%] md:min-w-0 snap-start`}
      {...reszta}
    >
      <span className={`${etykietaCls} ${hero ? "!text-white/75" : ""}`}>{etykieta}</span>
      {children}
    </div>
  );
}

function Duza({ children, jednostka, hero }) {
  return (
    <span className="font-['Archivo'] text-[30px] md:text-[34px] leading-10 font-extrabold tabular-nums whitespace-nowrap">
      {children}
      {jednostka && (
        <small className={`text-[18px] font-bold ml-[3px] ${hero ? "text-white/70" : "text-[#6E6E66]"}`}>
          {jednostka}
        </small>
      )}
    </span>
  );
}

function Flaga({ children, hero, ikona: Ikona = AlertTriangle }) {
  return (
    <span
      className={`inline-flex gap-1.5 items-start text-[13px] font-bold leading-[18px] ${
        hero ? "text-[#F2B85C]" : "text-[#8A5300]"
      }`}
    >
      <Ikona size={14} strokeWidth={2.5} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </span>
  );
}

function Panel({ tytul, licznik, children, ...reszta }) {
  return (
    <div className={`${kartaCls} overflow-hidden`} {...reszta}>
      <div className="flex items-center gap-2.5 px-[18px] py-3.5 border-b-[2px] border-[#171714]">
        <h3 className="m-0 font-['Archivo'] text-[17px] font-extrabold text-[#171714]">{tytul}</h3>
        {licznik != null && <span className="ml-auto text-sm font-bold text-[#6E6E66] whitespace-nowrap">{licznik}</span>}
      </div>
      {children}
    </div>
  );
}

const TONY_WNIOSKU = {
  warn: "bg-[#FDF0D8] text-[#8A5300]",
  info: "bg-[#E3EEFB] text-[#1D5FA8]",
  neu: "bg-[#ECEBE6] text-[#171714]",
};

function Wniosek({ w }) {
  const Ikona = w.ikona;
  return (
    <div
      className="grid grid-cols-[32px_1fr] md:grid-cols-[36px_1fr_auto] gap-3 items-start px-3.5 md:px-[18px] py-3 md:py-3.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0"
      data-wniosek={w.klucz}
    >
      <span className={`w-8 h-8 md:w-9 md:h-9 rounded-lg grid place-items-center ${TONY_WNIOSKU[w.ton]}`}>
        <Ikona size={18} strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <div className="font-bold leading-[21px] text-[#171714]">{w.tytul}</div>
        <div className="text-sm leading-5 text-[#6E6E66] mt-0.5 [&_b]:text-[#171714]">{w.opis}</div>
      </div>
      {w.akcja ? (
        <div className="col-start-2 md:col-start-auto">
          <button type="button" className={btnMalyCls} onClick={w.akcja.onClick}>
            {w.akcja.etykieta} <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <span className="hidden md:block" />
      )}
    </div>
  );
}

const STANY_GOTOWOSCI = {
  ok: { cls: "bg-[#E2F3E9] text-[#1F7A4A]", Ikona: Check },
  bad: { cls: "bg-[#DE3A22] text-white", Ikona: X },
  warn: { cls: "bg-[#FDF0D8] text-[#8A5300]", Ikona: AlertTriangle },
};

function PunktGotowosci({ p }) {
  const { cls, Ikona } = STANY_GOTOWOSCI[p.stan];
  return (
    <div
      className="grid grid-cols-[26px_1fr_auto] gap-2.5 items-center px-3.5 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0"
      data-gotowosc-punkt={p.klucz}
      data-stan={p.stan}
    >
      <span className={`w-6 h-6 rounded-full grid place-items-center ${cls}`}>
        <Ikona size={14} strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <div className="font-bold text-sm leading-[19px] text-[#171714]">{p.tytul}</div>
        {p.opis && <div className="text-[13px] leading-[18px] text-[#6E6E66]">{p.opis}</div>}
      </div>
      {p.akcja ? (
        <button type="button" className={btnMalyCls} onClick={p.akcja.onClick}>
          {p.akcja.etykieta}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function Udzial({ pct, kolor }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded bg-[#ECEBE6] overflow-hidden">
        <i className="block h-full rounded" style={{ width: `${Math.max(1, pct)}%`, background: kolor }} />
      </div>
      <span className="text-[13px] text-[#6E6E66] w-9 text-right">{pct}%</span>
    </div>
  );
}

// Koszt grupy: "~" = wynagrodzenie etatowca rozłożone proporcją godzin,
// "+?" = ktoś tu nie ma wpisanego wynagrodzenia.
function KosztGrupy({ g }) {
  if (g.brakKosztu && g.cost === 0) return <span className="text-[#6E6E66]">brak wynagr.</span>;
  return (
    <span className="whitespace-nowrap">
      {g.alokacja ? "~" : ""}
      {zl(g.cost)}
      {g.brakKosztu && (
        <span className={znakZapytaniaCls} title="Ktoś tu nie ma wpisanego wynagrodzenia">
          +?
        </span>
      )}
    </span>
  );
}

function TabelaGrup({ tytul, grupy, suma, otwarte, przelacz, onOsoba }) {
  return (
    <div className={`${kartaCls} overflow-hidden`} data-tabela-kosztow>
      <div className={`${siatkaCls} min-h-[38px] bg-[#F6F5F1] ${etykietaCls}`}>
        <span />
        <span>{tytul}</span>
        <span className="hidden lg:block">Udział w koszcie</span>
        <span className="text-right">Godz.</span>
        <span className="text-right">Koszt</span>
        <span className="hidden lg:block text-right">zł/h</span>
      </div>
      {grupy.length === 0 && (
        <p className="px-[18px] py-4 text-sm text-[#6E6E66] border-t-[1.5px] border-[#DEDCD4]">
          Brak danych w tym miesiącu.
        </p>
      )}
      {grupy.map((g) => {
        const otwarta = !!otwarte[g.klucz];
        const pct = suma > 0 ? Math.round((g.miara / suma) * 100) : 0;
        return (
          <div key={g.klucz}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={otwarta}
              onClick={() => przelacz(g.klucz)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  przelacz(g.klucz);
                }
              }}
              className={`${siatkaCls} min-h-[52px] border-t-[1.5px] border-[#DEDCD4] font-bold cursor-pointer hover:bg-[#F6F5F1]`}
              data-grupa-kosztu={g.klucz}
            >
              <span
                className={`grid place-items-center text-[#6E6E66] transition-transform ${otwarta ? "rotate-90" : ""}`}
              >
                <ChevronRight size={18} />
              </span>
              <span className="min-w-0 flex items-center">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-2" style={{ background: g.kolor }} />
                <span className="truncate">{g.klucz}</span>
                <small className="text-[13px] font-semibold text-[#6E6E66] ml-1.5 flex-shrink-0">
                  {g.osoby.length} os.
                </small>
              </span>
              <span className="hidden lg:block">
                <Udzial pct={pct} kolor={g.kolor} />
              </span>
              <span className="text-right">{hh(g.hours)}</span>
              <span className="text-right">
                <KosztGrupy g={g} />
              </span>
              <span className="hidden lg:block text-right text-[#6E6E66] font-medium">
                {g.hoursKoszt > 0 ? naGodzine(g.cost, g.hoursKoszt) : "—"}
              </span>
            </div>
            {otwarta &&
              [...g.osoby]
                .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.hours - a.hours)
                .map((o) => (
                  <div
                    key={o.uid}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOsoba(o.uid)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onOsoba(o.uid);
                    }}
                    className={`${siatkaCls} min-h-[40px] bg-[#F6F5F1] text-sm border-t-[1.5px] border-[#DEDCD4] cursor-pointer hover:bg-[#ECEBE6]`}
                    data-osoba-grupy={o.name}
                  >
                    <span />
                    <span className="truncate pl-1 font-medium underline-offset-2 hover:underline">{o.name}</span>
                    <span className="hidden lg:block">
                      {o.cost == null ? (
                        <span className={`${znakZapytaniaCls} !ml-0`}>brak wynagrodzenia</span>
                      ) : (
                        <Udzial pct={g.cost > 0 ? Math.round((o.cost / g.cost) * 100) : 0} kolor={g.kolor} />
                      )}
                    </span>
                    <span className="text-right">{hh(o.hours)}</span>
                    <span className="text-right">
                      {o.cost == null ? <span className="text-[#6E6E66]">—</span> : zl(o.cost)}
                    </span>
                    <span className="hidden lg:block text-right text-[#6E6E66]">
                      {naGodzine(o.cost, o.hours)}
                    </span>
                  </div>
                ))}
          </div>
        );
      })}
      <div className="px-3.5 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] text-[13px] text-[#6E6E66]">
        „~” — wynagrodzenie z umowy o pracę rozłożone proporcją godzin; suma zgadza się z kafelkiem
        „Koszt pracy”. <span className={`${znakZapytaniaCls} !ml-0`}>+?</span> — jest tu ktoś bez
        wpisanego wynagrodzenia w karcie. Udział = część kosztu wszystkich widocznych osób.
      </div>
    </div>
  );
}

export default function RaportyIKoszty({
  users,
  shifts,
  lokale = [],
  stanowiska = [],
  matchesFilter,
  hasAccessToLokal,
  onEditShift,
  selectedUserId,
  setSelectedUserId,
  skok = null,
  planShifts = [],
  shiftEdits = [],
  doDecyzji = null,
  onGoToApprovals,
  onGoToRegister,
  onOpenEmployee,
}) {
  const dzis = new Date();
  // ⚠️ Startujemy na miesiącu POPRZEDNIM, nie bieżącym. Na tę stronę wchodzi
  // się raz na miesiąc i po to, żeby przejrzeć miesiąc ZAMKNIĘTY przed
  // wypłatą — otwarta na bieżącym pokazywała połowę danych i wyglądała, jakby
  // brakowało w niej informacji. Powrót jest jednym kliknięciem.
  const [month, setMonth] = useState(() => (new Date().getMonth() + 11) % 12);
  const [year, setYear] = useState(() => {
    const d = new Date();
    return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  });
  // Który przekrój oglądamy. Domyślnie lokale — to pytanie, od którego
  // zaczyna się przegląd miesiąca; do konkretnej osoby schodzi się później.
  const [widok, setWidok] = useState("lokale");
  const [otwarte, setOtwarte] = useState({});
  const [sortuj, setSortuj] = useState("koszt");
  const sekcjaOsob = useRef(null);

  const shiftMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth());
    setYear(d.getFullYear());
  };
  const isCurrentMonth = month === dzis.getMonth() && year === dzis.getFullYear();
  const jestPrzyszly = year > dzis.getFullYear() || (year === dzis.getFullYear() && month >= dzis.getMonth());

  const widoczny = hasAccessToLokal || matchesFilter;

  // Narzut pracodawcy jest ustawieniem LOKALU, nie osoby — bierzemy go z
  // lokalu macierzystego, tak samo jak karta pracownika.
  const lokalRowFor = (u) => (lokale || []).find((l) => l.name === u?.default_lokal) || null;

  // ⚠️ Koszt liczy `kosztMiesiaca`, a NIE `godziny × users.stawka`. Przy umowie
  // o pracę lokal płaci kwotę z umowy niezależnie od godzin, a ta strona
  // odpowiada na pytanie "ile lokal wydał". Do 0.40.0 stała tu goła
  // `users.stawka`, więc KAŻDY etatowiec miał koszt `null`.
  const kosztOsoby = (u, godziny, rok, miesIdx) =>
    u ? kosztMiesiaca({ user: u, godziny, lokalRow: lokalRowFor(u), rok, mies: miesIdx + 1 }) : null;

  // Cała arytmetyka miesiąca w JEDNYM miejscu, żeby dało się ją policzyć drugi
  // raz dla miesiąca poprzedniego (porównanie w kafelkach) bez powtarzania
  // reguł — zwłaszcza reguły o dwóch zakresach, którą najłatwiej zgubić.
  //
  // Dwa zakresy, celowo:
  // - `pShifts` słucha górnego paska (nawigacja: kogo widzę w tym lokalu);
  // - `zakres` bierze wszystkie lokale kierownika i służy do liczb per osoba.
  // Godziny i koszt jednej osoby to fakt płacowy, nie fakt lokalu. Liczone per
  // zakładka, pracownik wypożyczony między lokalami pokazywał się dwa razy, w
  // każdej z częścią godzin, i żadna nie mówiła, ile mu się w sumie należy.
  //
  // `doDnia` — porównanie like-for-like: bieżący miesiąc (1–25) zestawiamy z
  // 1–25 poprzedniego, a nie z całym. Niepełny okres wobec pełnego zawsze
  // wygląda na spadek.
  const agreguj = (rok, miesIdx, doDnia = 31) => {
    const wM = (s) =>
      s.start_time.getMonth() === miesIdx &&
      s.start_time.getFullYear() === rok &&
      s.start_time.getDate() <= doDnia;
    const pShifts = shifts.filter((s) => matchesFilter(s.lokal) && wM(s));
    const pAll = shifts.filter((s) => widoczny(s.lokal) && wM(s));

    const wTymLokalu = {};
    pShifts.forEach((s) => {
      if (!s.user_id) return;
      wTymLokalu[s.user_id] = (wTymLokalu[s.user_id] || 0) + hoursOf(s);
    });

    // ⚠️ W raporcie są WYŁĄCZNIE osoby z zarejestrowanymi godzinami w tym
    // miesiącu — nikogo nie dopisujemy z listy pracowników. Dopisywanie
    // etatowców bez godzin WYMYŚLAŁO ludzi (osoba zatrudniona we wrześniu
    // pokazywała się z pełną kwotą w każdym wcześniejszym miesiącu). Jedynym
    // twardym śladem obecności w miesiącu jest odbita zmiana.
    const widoczneOsoby = new Set(pShifts.map((s) => s.user_id).filter(Boolean));
    const zakres = pAll.filter((s) => s.user_id && widoczneOsoby.has(s.user_id));

    const byUser = {};
    zakres.forEach((s) => {
      const w = (byUser[s.user_id] = byUser[s.user_id] || {
        hours: 0,
        urlop: 0,
        count: 0,
        zmianPracy: 0,
        dni: new Set(),
        bezKonca: 0,
      });
      w.hours += hoursOf(s);
      w.count += 1;
      if (s.is_urlop) w.urlop += hoursOf(s);
      else {
        w.zmianPracy += 1;
        w.dni.add(toLocalYMD(s.start_time));
      }
      // Zmiana bez odbitego końca to godziny, których nikomu nie policzono —
      // czyli dokładnie to, co trzeba zobaczyć PRZED wypłatą, a nie po niej.
      if (!s.end_time && !s.rozliczenie) w.bezKonca += 1;
    });

    const rows = [...widoczneOsoby]
      .map((uid) => users.find((x) => x.id === uid))
      .filter(Boolean)
      .map((u) => {
        const w = byUser[u.id] || { hours: 0, urlop: 0, count: 0, zmianPracy: 0, dni: new Set(), bezKonca: 0 };
        return {
          uid: u.id,
          user: u,
          hours: w.hours,
          urlop: w.urlop,
          hoursTuLokal: wTymLokalu[u.id] || 0,
          count: w.count,
          zmianPracy: w.zmianPracy,
          dni: w.dni.size,
          bezKonca: w.bezKonca,
          cost: kosztOsoby(u, w.hours, rok, miesIdx),
        };
      });

    const totalHours = rows.reduce((a, r) => a + r.hours, 0);
    const totalCost = rows.reduce((a, r) => a + (r.cost || 0), 0);
    const bezWynagrodzenia = rows.filter((r) => r.cost == null);
    // Godziny osób, których koszt znamy — mianownik średniego kosztu godziny.
    // Dzielenie całego kosztu przez WSZYSTKIE godziny zaniżałoby średnią o
    // każdą godzinę kogoś bez wynagrodzenia w karcie.
    const hoursZKosztem = rows.reduce((a, r) => a + (r.cost == null ? 0 : r.hours), 0);
    // Urlop jest zwykłym wierszem w shifts (8 h za dzień roboczy), więc wchodzi
    // do sum automatycznie — ale to nie jest czas na sali.
    const urlopHours = rows.reduce((a, r) => a + r.urlop, 0);

    // Koszt per lokal / stanowisko to ALOKACJA proporcją godzin, żeby rozbicie
    // sumowało się DOKŁADNIE do kafelka wyżej. Urlopu nie przypisujemy ani do
    // lokalu, ani do stanowiska: pracownik go tam nie przepracował.
    const byLokal = {};
    const byStanowisko = {};
    const dodaj = (mapa, klucz, godziny, koszt, alokacja, osoba) => {
      const w = (mapa[klucz] = mapa[klucz] || {
        hours: 0,
        hoursKoszt: 0,
        cost: 0,
        brakKosztu: false,
        alokacja: false,
        osoby: [],
      });
      w.hours += godziny;
      if (koszt == null) w.brakKosztu = true;
      else {
        w.cost += koszt;
        w.hoursKoszt += godziny;
      }
      if (alokacja) w.alokacja = true;
      w.osoby.push({ ...osoba, hours: godziny, cost: koszt });
    };
    rows.forEach((r) => {
      const moje = zakres.filter((s) => s.user_id === r.uid);
      const rozbij = (mapa, kluczOf, domyslny) => {
        const wg = {};
        moje.forEach((s) => {
          const klucz = kluczOf(s);
          wg[klucz] = (wg[klucz] || 0) + hoursOf(s);
        });
        const suma = Object.values(wg).reduce((a, h) => a + h, 0);
        const kto = { uid: r.uid, name: r.user.name };
        if (suma <= 0) {
          // Zero godzin i zero kosztu nie jest niczyim wierszem. Wiersz zostaje
          // TYLKO dla kosztu, który trzeba gdzieś położyć.
          if (r.cost > 0) dodaj(mapa, domyslny || "—", 0, r.cost, false, kto);
          return;
        }
        // "~" tylko tam, gdzie naprawdę było co dzielić.
        const dzielone = naEtacie(r.user) && Object.keys(wg).length > 1;
        Object.entries(wg).forEach(([klucz, h]) => {
          dodaj(mapa, klucz, h, r.cost == null ? null : (r.cost * h) / suma, dzielone, kto);
        });
      };
      rozbij(byLokal, (s) => (s.is_urlop ? "Urlop" : s.lokal), r.user.default_lokal);
      rozbij(byStanowisko, (s) => (s.is_urlop ? "Urlop" : s.stanowisko || "—"), r.user.default_stanowisko);
    });

    return {
      pShifts,
      pAll,
      zakres,
      rows,
      totalHours,
      totalCost,
      hoursZKosztem,
      bezWynagrodzenia,
      costIncomplete: bezWynagrodzenia.length > 0,
      urlopHours,
      byLokal,
      byStanowisko,
    };
  };

  const M = agreguj(year, month);
  // Porównanie: miesiąc zamknięty z całym poprzednim, bieżący — z tym samym
  // kawałkiem poprzedniego (1–N).
  const poprzedniData = new Date(year, month - 1, 1);
  const poprz = agreguj(
    poprzedniData.getFullYear(),
    poprzedniData.getMonth(),
    isCurrentMonth ? dzis.getDate() : 31
  );
  const opisPoprzedniego = isCurrentMonth
    ? `vs 1–${dzis.getDate()}.${pad(poprzedniData.getMonth() + 1)}`
    : `vs ${MIESIACE[poprzedniData.getMonth()].toLowerCase()}`;

  const {
    rows: employeeRows,
    totalHours,
    totalCost,
    costIncomplete,
    urlopHours,
    byLokal,
    byStanowisko,
    bezWynagrodzenia,
  } = M;
  const pracaHours = totalHours - urlopHours;

  // Plan vs fakt — WYŁĄCZNIE dni zamknięte: plan na cały miesiąc zestawiony z
  // faktem za pięć dni dawałby "−82%" i nie znaczyłby nic. Dzisiejszy dzień też
  // pomijamy — połowa ludzi jeszcze nie skończyła zmiany.
  const wczoraj = new Date(dzis.getFullYear(), dzis.getMonth(), dzis.getDate() - 1);
  const wczorajYMD = toLocalYMD(wczoraj);
  const okresOd = toLocalYMD(new Date(year, month, 1));
  const koniecMiesiaca = toLocalYMD(new Date(year, month + 1, 0));
  const okresDo = koniecMiesiaca < wczorajYMD ? koniecMiesiaca : wczorajYMD;
  const okresPusty = okresDo < okresOd;
  const planFaktMapa = okresPusty
    ? new Map()
    : buildPlanFactMap({ planShifts, factShifts: shifts, from: okresOd, to: okresDo, lokalOk: widoczny });
  const pf = sumujPlanFakt(planFaktMapa);
  const pfOsoby = {};
  let pozaGrafikiemH = 0;
  let dniZRoznica = 0;
  planFaktMapa.forEach((v) => {
    const r = (pfOsoby[v.userKey] = pfOsoby[v.userKey] || { planH: 0, faktH: 0 });
    r.planH += v.planH;
    r.faktH += v.faktH;
    if (v.planH === 0 && v.faktH > 0) pozaGrafikiemH += v.faktH;
    else if (v.planH > 0 && Math.abs(v.diff) >= PLAN_FAKT_PROG_H) dniZRoznica += 1;
  });

  // Kliknięcie osoby w rozbiciu albo we wniosku prowadzi do jej szczegółów —
  // bez tego rozbicie kończy się na liczbie i tę samą osobę trzeba szukać
  // ręcznie w trzecim przekroju.
  const pokazOsobe = (uid) => {
    setSelectedUserId(uid);
    setWidok("pracownicy");
    setTimeout(() => {
      if (sekcjaOsob.current && sekcjaOsob.current.scrollIntoView) {
        sekcjaOsob.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  };

  useEffect(() => {
    if (selectedUserId && !users.find((u) => u.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [selectedUserId]);

  // Wejście z imienia w Rejestrze Godzin albo w Aktywnych przenosi też na
  // miesiąc tamtej zmiany. `seq` jest po to, żeby dwa kliknięcia w ten sam
  // miesiąc też zadziałały.
  useEffect(() => {
    if (!skok) return;
    setMonth(skok.mies);
    setYear(skok.rok);
    setWidok("pracownicy");
  }, [skok?.seq]);

  // --- Wpisy do sprawdzenia: bardzo krótkie (prawie zawsze przypadkowe
  // odbicie) — ta sama lista dla wniosku i dla gotowości.
  const krotkie = M.zakres
    .filter((s) => !s.is_urlop && s.end_time && hoursOf(s) < KROTKI_WPIS_H)
    .sort((a, b) => a.start_time - b.start_time);

  // --- Sprawy do decyzji z TEGO miesiąca. Każda z nich zmieni godziny, więc
  // rozliczenie przed decyzją byłoby rozliczeniem liczb, które się zmienią.
  const wMiesiacu = (d) => {
    if (!d) return false;
    const x = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T12:00:00`);
    return x.getFullYear() === year && x.getMonth() === month;
  };
  const sprawy = doDecyzji || {};
  const korektyMies = (sprawy.korekty || []).filter((i) => {
    const s = i.shift_id ? shifts.find((x) => x.id === i.shift_id) : null;
    return wMiesiacu(s ? s.start_time : i.proposed_date);
  }).length;
  const brakiMies = (sprawy.braki || []).filter((b) => wMiesiacu(b.plan && b.plan.date)).length;
  const porzuconeMies = (sprawy.porzucone || []).filter((p) => wMiesiacu(p.shift && p.shift.start_time)).length;
  const doDecyzjiMies = korektyMies + brakiMies + porzuconeMies;
  const korektyKierownika = (shiftEdits || []).filter(
    (e) => wMiesiacu(e.new_date || e.old_date) && widoczny(e.new_lokal || e.old_lokal)
  ).length;

  // --- "Na co zwrócić uwagę" ------------------------------------------------
  const normaPelna = wymiarCzasuPracy(year, month + 1);
  const wnioski = [];
  const przeciazeni = employeeRows
    .filter((r) => normaPelna > 0 && r.hours - r.urlop > normaPelna * PRZECIAZENIE)
    .sort((a, b) => b.hours - b.urlop - (a.hours - a.urlop));
  if (przeciazeni.length > 0) {
    const r = przeciazeni[0];
    const praca = r.hours - r.urlop;
    const krotnosc = praca / normaPelna;
    wnioski.push({
      klucz: "przeciazenie",
      ton: "warn",
      ikona: User,
      tytul: `${r.user.name}: ${hh(praca)} w miesiącu`,
      opis: (
        <>
          <b>
            {r.zmianPracy} {odmiana(r.zmianPracy, ["zmiana", "zmiany", "zmian"])} w {r.dni}{" "}
            {odmiana(r.dni, ["dzień", "dni", "dni"])}
          </b>{" "}
          (średnio {hh(praca / Math.max(1, r.zmianPracy))} na zmianę) —{" "}
          {krotnosc >= 2 ? "ponad dwa etaty" : krotnosc >= 1.5 ? "ponad półtora etatu" : "wyraźnie ponad etat"}{" "}
          (pełny etat w tym miesiącu to {normaPelna} h).
          {r.cost != null && (
            <>
              {" "}
              Koszt <b>{zl(r.cost)}</b>.
            </>
          )}{" "}
          Sprawdź obciążenie i czy wszystkie zmiany należą do tej osoby.
          {przeciazeni.length > 1 && (
            <>
              {" "}
              Też:{" "}
              {przeciazeni.slice(1, 4).map((o, i) => (
                <React.Fragment key={o.uid}>
                  {i > 0 && ", "}
                  <button type="button" className={linkCls} onClick={() => pokazOsobe(o.uid)}>
                    {o.user.name} ({hh(o.hours - o.urlop)})
                  </button>
                </React.Fragment>
              ))}
              {przeciazeni.length > 4 && ` i ${przeciazeni.length - 4} więcej`}.
            </>
          )}
        </>
      ),
      akcja: { etykieta: "Pokaż zmiany", onClick: () => pokazOsobe(r.uid) },
    });
  }
  if (!okresPusty && pf.faktH > 0) {
    if (pf.planH === 0) {
      wnioski.push({
        klucz: "grafik",
        ton: "warn",
        ikona: Calendar,
        tytul: "W tym miesiącu nie ma grafiku",
        opis: "Odbito godziny, ale żadnej zmiany nie zaplanowano — porównanie z planem nic tu nie powie.",
        akcja: onGoToRegister ? { etykieta: "Rejestr godzin", onClick: onGoToRegister } : null,
      });
    } else if (pozaGrafikiemH / pf.faktH >= 0.05) {
      wnioski.push({
        klucz: "grafik",
        ton: "warn",
        ikona: Calendar,
        tytul: `Grafik nie pokrywa ${liczba((pozaGrafikiemH / pf.faktH) * 100)}% godzin`,
        opis: (
          <>
            <b>{hh(pozaGrafikiemH)}</b> to dni bez zmiany w grafiku (fakt {hh(pf.faktH)} przy planie{" "}
            {hh(pf.planH)}). W „Plan vs fakt” liczą się w całości jako nadwyżka — porównanie jest przez
            to zawyżone.
          </>
        ),
        akcja: onGoToRegister ? { etykieta: "Rejestr godzin", onClick: onGoToRegister } : null,
      });
    }
  }
  const lokaleZKosztem = Object.entries(byLokal)
    .filter(([k, v]) => k !== "Urlop" && k !== "—" && v.cost > 0)
    .map(([k, v]) => ({ klucz: k, ...v }));
  if (lokaleZKosztem.length >= 2 && totalCost > 0) {
    const top = [...lokaleZKosztem].sort((a, b) => b.cost - a.cost)[0];
    const zStawka = lokaleZKosztem.filter((l) => l.hoursKoszt > 0);
    const poStawce = [...zStawka].sort((a, b) => b.cost / b.hoursKoszt - a.cost / a.hoursKoszt);
    const najdrozszy = poStawce[0];
    const najtanszy = poStawce[poStawce.length - 1];
    wnioski.push({
      klucz: "koncentracja",
      ton: "neu",
      ikona: PieChart,
      tytul: `${top.klucz} to ${Math.round((top.cost / totalCost) * 100)}% kosztów`,
      opis: (
        <>
          <b>{zl(top.cost)}</b> z {zl(totalCost)} przy{" "}
          {totalHours > 0 ? Math.round((top.hours / totalHours) * 100) : 0}% godzin.
          {poStawce.length >= 2 && (
            <>
              {" "}
              Najdroższa godzina:{" "}
              <b>
                {najdrozszy.klucz} ≈ {naGodzine(najdrozszy.cost, najdrozszy.hoursKoszt)} zł/h
              </b>
              {najdrozszy.brakKosztu ? " (niepełna)" : ""}; najtańsza: {najtanszy.klucz} ≈{" "}
              {naGodzine(najtanszy.cost, najtanszy.hoursKoszt)} zł/h
              {najtanszy.brakKosztu ? " (niepełna)" : ""}.
            </>
          )}
        </>
      ),
      akcja: null,
    });
  }
  if (krotkie.length > 0) {
    wnioski.push({
      klucz: "krotkie",
      ton: "info",
      ikona: Clock,
      tytul: `Podejrzanie ${krotkie.length === 1 ? "krótki wpis" : "krótkie wpisy"}`,
      opis: (
        <>
          {krotkie.slice(0, 4).map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && ", "}
              <button type="button" className={linkCls} onClick={() => onEditShift(s)}>
                {s.user_name} {dzienMies(s.start_time)} · {hh(hoursOf(s))}
              </button>
            </React.Fragment>
          ))}
          {krotkie.length > 4 && ` i ${krotkie.length - 4} więcej`} — prawdopodobnie przypadkowe odbicie.
        </>
      ),
      akcja: { etykieta: "Sprawdź", onClick: () => onEditShift(krotkie[0]) },
    });
  }

  // --- "Gotowość do rozliczenia" -------------------------------------------
  const punkty = [];
  if (isCurrentMonth) {
    // Rozliczać miesiąc, który trwa, to rozliczać liczby, które się zmienią.
    punkty.push({
      klucz: "trwa",
      stan: "bad",
      tytul: "Miesiąc jeszcze trwa",
      opis: `Rozliczenie po ${koniecMiesiaca.slice(8)}.${koniecMiesiaca.slice(5, 7)} — do tego czasu liczby się zmienią.`,
    });
  }
  punkty.push(
    bezWynagrodzenia.length > 0
      ? {
          klucz: "wynagrodzenia",
          stan: "bad",
          tytul: `${bezWynagrodzenia.length} ${odmiana(bezWynagrodzenia.length, [
            "osoba",
            "osoby",
            "osób",
          ])} bez wynagrodzenia w karcie`,
          opis: `${bezWynagrodzenia
            .slice(0, 4)
            .map((r) => `${r.user.name} (${hh(r.hours)})`)
            .join(", ")}${bezWynagrodzenia.length > 4 ? ` i ${bezWynagrodzenia.length - 4} więcej` : ""} — ${
            bezWynagrodzenia.length === 1 ? "koszt tej osoby nie jest liczony" : "ich koszt nie jest liczony"
          }.`,
          akcja: onOpenEmployee
            ? { etykieta: "Uzupełnij", onClick: () => onOpenEmployee(bezWynagrodzenia[0].uid) }
            : null,
        }
      : {
          klucz: "wynagrodzenia",
          stan: "ok",
          tytul: "Każdy ma wpisane wynagrodzenie",
          opis: "Koszt policzony dla wszystkich osób ze zmianą w tym miesiącu.",
        }
  );
  const bezKoncaMies = employeeRows.reduce((a, r) => a + r.bezKonca, 0);
  punkty.push(
    doDecyzjiMies > 0
      ? {
          klucz: "decyzje",
          stan: "bad",
          tytul: `${doDecyzjiMies} ${odmiana(doDecyzjiMies, ["sprawa czeka", "sprawy czekają", "spraw czeka"])} na decyzję`,
          opis: [
            korektyMies > 0 && `korekty: ${korektyMies}`,
            brakiMies > 0 && `bez odbicia: ${brakiMies}`,
            porzuconeMies > 0 && `bez zakończenia: ${porzuconeMies}`,
          ]
            .filter(Boolean)
            .concat("każda zmieni godziny")
            .join(" · "),
          akcja: onGoToApprovals ? { etykieta: "Do decyzji", onClick: onGoToApprovals } : null,
        }
      : {
          klucz: "decyzje",
          stan: bezKoncaMies > 0 ? "warn" : "ok",
          tytul: bezKoncaMies > 0 ? "Zmiany bez zakończenia jeszcze trwają" : "Wszystkie wpisy rozstrzygnięte",
          opis:
            bezKoncaMies > 0
              ? `${bezKoncaMies} ${odmiana(bezKoncaMies, ["zmiana", "zmiany", "zmian"])} bez odbitego końca — godziny się jeszcze nie liczą.`
              : `Do decyzji: 0 · zmiany kierownika: ${korektyKierownika}`,
        }
  );
  if (dniZRoznica > 0) {
    punkty.push({
      klucz: "roznice",
      stan: "warn",
      tytul: `${dniZRoznica} ${odmiana(dniZRoznica, ["dzień różni", "dni różnią", "dni różni"])} się od grafiku`,
      opis: `O ${Math.round(PLAN_FAKT_PROG_H * 60)} min i więcej. Nie blokuje rozliczenia — warto przejrzeć.`,
      akcja: onGoToRegister ? { etykieta: "Przejrzyj", onClick: onGoToRegister } : null,
    });
  }
  if (krotkie.length > 0) {
    punkty.push({
      klucz: "krotkie",
      stan: "warn",
      tytul: `${krotkie.length} ${odmiana(krotkie.length, ["wpis krótszy", "wpisy krótsze", "wpisów krótszych"])} niż 30 min`,
      opis: `${[...new Set(krotkie.map((s) => s.user_name))].slice(0, 4).join(", ")} — sprawdź przed rozliczeniem.`,
      akcja: { etykieta: "Sprawdź", onClick: () => onEditShift(krotkie[0]) },
    });
  }
  const blokuje = punkty.filter((p) => p.stan === "bad").length;
  const powodBlokady = blokuje
    ? punkty
        .filter((p) => p.stan === "bad")
        .map((p) =>
          p.klucz === "trwa"
            ? "poczekaj do końca miesiąca"
            : p.klucz === "wynagrodzenia"
            ? "uzupełnij wynagrodzenia"
            : "rozstrzygnij sprawy do decyzji"
        )
        .join(", ")
    : "";

  // --- Szczegóły wybranej osoby --------------------------------------------
  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : null;
  const selectedRow = employeeRows.find((r) => r.uid === selectedUserId) || null;
  const selectedShifts = selectedUserId
    ? M.pAll.filter((s) => s.user_id === selectedUserId).sort((a, b) => a.start_time - b.start_time)
    : [];
  const selectedHours = selectedShifts.reduce((a, s) => a + hoursOf(s), 0);
  const selectedUrlop = selectedShifts.filter((s) => s.is_urlop).reduce((a, s) => a + hoursOf(s), 0);
  const selectedPF = selectedUserId ? pfOsoby[String(selectedUserId)] : null;
  const selectedCost = kosztOsoby(selectedUser, selectedHours, year, month);
  // Przy umowie o pracę kwota nie jest iloczynem godzin i stawki — bez tego
  // podpisu pierwsze pytanie brzmi "dlaczego się nie zgadza".
  const selectedNadwyzka = selectedUser ? nadwyzkaPonadNorme(selectedUser, selectedHours, year, month + 1) : null;
  const diffDnia = (s) =>
    planFaktMapa.get(`${String(s.user_id || s.user_name || "")}|${toLocalYMD(s.start_time)}`);

  // Lista zmian osoby: urlop sklejony w JEDEN wiersz na ciąg dni ("17–28.08 ·
  // 10 dni urlopu"), bo dziesięć identycznych wierszy 8,0 h zasłania pracę.
  const wpisyOsoby = [];
  selectedShifts.forEach((s) => {
    const ostatni = wpisyOsoby[wpisyOsoby.length - 1];
    if (s.is_urlop && ostatni && ostatni.urlop) {
      ostatni.do = s.start_time;
      ostatni.dni += 1;
      ostatni.godz += hoursOf(s);
      return;
    }
    wpisyOsoby.push(
      s.is_urlop ? { urlop: true, od: s.start_time, do: s.start_time, dni: 1, godz: hoursOf(s), id: s.id } : { s }
    );
  });
  const pokazaneDni = new Set();

  // Lista osób, posortowana wg wybranej miary.
  const stawkaOsoby = (r) => (r.cost == null || !r.hours ? -1 : r.cost / r.hours);
  const osobyPosortowane = [...employeeRows].sort((a, b) =>
    sortuj === "godz"
      ? b.hours - a.hours
      : sortuj === "stawka"
      ? stawkaOsoby(b) - stawkaOsoby(a)
      : (b.cost ?? -1) - (a.cost ?? -1) || b.hours - a.hours
  );

  // --- Struktura kosztów ----------------------------------------------------
  const kolorLokalu = (nazwa) => {
    if (nazwa === "Urlop") return KOLOR_URLOPU;
    const i = (lokale || []).findIndex((l) => l.name === nazwa);
    return i < 0 ? KOLOR_INNY : PALETA[i % PALETA.length];
  };
  const kolorStanowiska = (nazwa) => {
    if (nazwa === "Urlop") return KOLOR_URLOPU;
    if (nazwa === "—") return KOLOR_INNY;
    const s = (stanowiska || []).find((x) => x.name === nazwa && x.kolor);
    return s ? s.kolor : hashKoloru(nazwa);
  };
  // Udział liczymy z KOSZTU; gdy kosztu nie ma wcale (nikt nie ma
  // wynagrodzenia), z godzin — pusty pasek nie mówi nic.
  const miaraUdzialu = totalCost > 0 ? "cost" : "hours";
  const sumaUdzialu = totalCost > 0 ? totalCost : totalHours;
  const grupy = (mapa, kolor) =>
    Object.entries(mapa)
      .map(([klucz, v]) => ({ klucz, ...v, kolor: kolor(klucz), miara: v[miaraUdzialu] }))
      .sort((a, b) => b.miara - a.miara || b.hours - a.hours);
  const grupyLokali = grupy(byLokal, kolorLokalu);
  const grupyStanowisk = grupy(byStanowisko, kolorStanowiska);
  const przelacz = (klucz) => setOtwarte((o) => ({ ...o, [`${widok}:${klucz}`]: !o[`${widok}:${klucz}`] }));
  const otwarteWidoku = Object.fromEntries(
    Object.entries(otwarte)
      .filter(([k]) => k.startsWith(`${widok}:`))
      .map(([k, v]) => [k.slice(widok.length + 1), v])
  );

  const nUoP = employeeRows.filter((r) => typUmowy(r.user) === "umowa_o_prace").length;

  // Podsumowanie osób, nie lista zmian — tamtą eksportuje Rejestr Godzin.
  const handleExportCsv = () => {
    const naglowek = [
      "Pracownik",
      "Stanowisko",
      "Lokal macierzysty",
      "Typ umowy",
      "Godziny",
      "w tym w wybranym lokalu",
      "w tym urlop",
      "Liczba zmian",
      "Koszt (zl)",
    ];
    const etykietaUmowy = (u) => (TYPY_UMOWY.find((x) => x.key === typUmowy(u)) || {}).label || "";
    const lines = [naglowek.join(";")];
    osobyPosortowane.forEach((r) => {
      lines.push(
        [
          r.user.name,
          r.user.default_stanowisko || "",
          r.user.default_lokal || "",
          etykietaUmowy(r.user),
          r.hours.toFixed(2),
          r.hoursTuLokal.toFixed(2),
          r.urlop.toFixed(2),
          r.count,
          // Pusto, a nie zero: brak wynagrodzenia w karcie to nie jest koszt
          // zerowy i nie wolno go zsumować jak zera.
          r.cost == null ? "" : r.cost.toFixed(2),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";")
      );
    });
    // BOM, żeby Excel nie rozsypał polskich znaków.
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koszty-${year}-${pad(month + 1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const PRZEKROJE = [
    ["lokale", "Lokale", grupyLokali.length],
    ["stanowiska", "Stanowiska", grupyStanowisk.length],
    ["pracownicy", "Pracownicy", employeeRows.length],
  ];

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col" data-raporty>
      {/* Nagłówek: tytuł, miesiąc, eksport, wysyłka */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="hidden md:block font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714] mr-2">
          Raporty i koszty
        </h2>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex-1 md:flex-none flex items-center h-12 md:h-11 border-[2px] border-[#171714] rounded-lg bg-white">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Poprzedni miesiąc"
              className="w-11 h-full grid place-items-center text-[#171714] hover:bg-[#F6F5F1] rounded-l-md"
            >
              <ChevronLeft size={18} />
            </button>
            <span
              className="flex-1 md:w-[160px] text-center font-['Archivo'] font-extrabold text-[15px] text-[#171714]"
              data-miesiac-raportu
            >
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
          {!isCurrentMonth && (
            <button
              type="button"
              className={`${linkCls} text-sm whitespace-nowrap`}
              onClick={() => {
                setMonth(dzis.getMonth());
                setYear(dzis.getFullYear());
              }}
              data-biezacy-miesiac
            >
              Bieżący miesiąc
            </button>
          )}
        </div>
        <span className="hidden md:block flex-1" />
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={employeeRows.length === 0}
          className={`${btnObrysCls} hidden md:inline-flex`}
        >
          <Download size={18} /> Eksport CSV
        </button>
        {/* Wysyłki jeszcze nie ma — przycisk stoi, żeby było widać, co go
            zablokuje, kiedy już będzie. Powód w podpowiedzi i w "Gotowości". */}
        <button
          type="button"
          disabled
          title={blokuje ? `Najpierw: ${powodBlokady}` : "Wysyłka do księgowej będzie dostępna wkrótce"}
          className={`${btnGlownyCls} hidden md:inline-flex`}
        >
          <Send size={18} /> Wyślij do księgowej
        </button>
      </div>
      {/* Bez tego zdania kierownik szukałby, czemu liczby nie zmieniają się
          przy przełączaniu lokalu w górnym pasku. */}
      <p className="text-sm text-[#6E6E66] max-w-[720px] mt-2 mb-5">
        Wybór lokalu u góry decyduje, kogo widzisz. Godziny i koszt osoby są zawsze pełne — ze wszystkich
        Twoich lokali, bo tyle się jej należy.
      </p>

      {/* Kafelki — na telefonie karuzela, koszt pierwszy */}
      <div
        className="flex md:grid md:grid-cols-2 xl:grid-cols-[1.3fr_repeat(4,1fr)] gap-3.5 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-4 md:scroll-px-0 -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none]"
        data-kafelki-raportu
      >
        <Kafelek etykieta={`Koszt pracy · ${MIESIACE[month].toLowerCase()}`} hero data-kafelek-koszt>
          <Duza jednostka="zł" hero>
            {kwota(totalCost)}
          </Duza>
          <span className="text-sm text-white/75">godziny × stawka + umowy o pracę</span>
          {costIncomplete && (
            <Flaga hero>
              Zaniżony: {bezWynagrodzenia.length}{" "}
              {odmiana(bezWynagrodzenia.length, ["osoba", "osoby", "osób"])} bez wynagrodzenia w karcie
            </Flaga>
          )}
          {/* Koszt porównujemy tylko wtedy, gdy OBA okresy są policzone do
              końca — inaczej spadek znaczyłby tylko tyle, że komuś nie
              wpisano wynagrodzenia. */}
          {!costIncomplete && !poprz.costIncomplete && (
            <Trend hero teraz={totalCost} przed={poprz.totalCost} opis={`${opisPoprzedniego} ${zl(poprz.totalCost)}`} />
          )}
        </Kafelek>
        <Kafelek etykieta="Godziny">
          <Duza jednostka="h">{liczba(totalHours)}</Duza>
          <span className="text-sm text-[#6E6E66] [&_b]:text-[#171714]">
            praca <b className="tabular-nums">{hh(pracaHours)}</b>
            {urlopHours > 0 && (
              <>
                {" "}
                · urlop <b className="tabular-nums">{hh(urlopHours)}</b>
              </>
            )}
          </span>
          <Trend teraz={totalHours} przed={poprz.totalHours} opis={`${opisPoprzedniego} ${hh(poprz.totalHours)}`} />
        </Kafelek>
        <Kafelek etykieta="Śr. koszt godziny">
          <Duza jednostka="zł/h">{M.hoursZKosztem > 0 ? `≈ ${naGodzine(totalCost, M.hoursZKosztem)}` : "—"}</Duza>
          <span className="text-sm text-[#6E6E66]">
            {M.hoursZKosztem > 0 ? `${zl(totalCost)} ÷ ${hh(M.hoursZKosztem)}` : "nikt nie ma wpisanego wynagrodzenia"}
          </span>
          {(costIncomplete || (isCurrentMonth && nUoP > 0)) && M.hoursZKosztem > 0 && (
            <span className="mt-auto pt-1 flex flex-col gap-1">
              {costIncomplete && <Flaga ikona={Info}>bez osób bez wynagrodzenia</Flaga>}
              {/* Pensja z umowy o pracę wchodzi w całości od pierwszego dnia,
                  a godzin przybywa do końca miesiąca — w trakcie miesiąca ta
                  średnia jest zawyżona i spada z każdym dniem. */}
              {isCurrentMonth && nUoP > 0 && (
                <Flaga ikona={Info}>miesiąc trwa — umowy o pracę liczone w całości</Flaga>
              )}
            </span>
          )}
        </Kafelek>
        <Kafelek etykieta="Pracownicy">
          <Duza>{employeeRows.length}</Duza>
          <span className="text-sm text-[#6E6E66]">ze zmianą w tym miesiącu</span>
          {employeeRows.length > 0 && (
            <span className="text-[13px] text-[#6E6E66]">
              {nUoP} na umowie o pracę · {employeeRows.length - nUoP} inne
            </span>
          )}
        </Kafelek>
        <Kafelek etykieta="Plan vs fakt" data-kafelek-plan>
          {okresPusty || (pf.planH === 0 && pf.faktH === 0) ? (
            <>
              <Duza>—</Duza>
              <span className="text-sm text-[#6E6E66]">brak zamkniętych dni w tym okresie</span>
            </>
          ) : (
            <>
              <Duza jednostka="h">
                {pf.diff >= 0 ? "+" : "−"}
                {liczba(Math.abs(pf.diff))}
              </Duza>
              <span className="text-sm text-[#6E6E66] [&_b]:text-[#171714]">
                plan <b className="tabular-nums">{hh(pf.planH)}</b> · fakt <b className="tabular-nums">{hh(pf.faktH)}</b>
                {pf.planH > 0 && ` (${pf.diff >= 0 ? "+" : "−"}${liczba(Math.abs((pf.diff / pf.planH) * 100))}%)`} · do{" "}
                {okresDo.slice(8)}.{okresDo.slice(5, 7)}
              </span>
              {pozaGrafikiemH > 0 && (
                <span className="mt-auto pt-1">
                  <Flaga>w tym {hh(pozaGrafikiemH)} bez grafiku</Flaga>
                </span>
              )}
            </>
          )}
        </Kafelek>
      </div>

      {/* Wnioski i gotowość do rozliczenia */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4 items-start mt-4">
        <Panel tytul="Na co zwrócić uwagę" licznik={wnioski.length || null} data-uwagi>
          {wnioski.length === 0 ? (
            <p className="px-[18px] py-4 text-sm text-[#6E6E66]">
              Nic nie odstaje: nikt nie pracuje ponad miarę, grafik pokrywa godziny, brak podejrzanych wpisów.
            </p>
          ) : (
            wnioski.map((w) => <Wniosek key={w.klucz} w={w} />)
          )}
        </Panel>
        <Panel
          tytul="Gotowość do rozliczenia"
          licznik={blokuje ? `${blokuje} ${odmiana(blokuje, ["blokuje", "blokują", "blokuje"])}` : "gotowe"}
          data-gotowosc
          data-blokuje={blokuje}
        >
          {punkty.map((p) => (
            <PunktGotowosci key={p.klucz} p={p} />
          ))}
          <div className="px-3.5 md:px-[18px] pt-3.5 pb-4 border-t-[2px] border-[#171714] flex gap-2.5 items-center flex-wrap">
            <span className="flex-1 min-w-[160px] text-sm text-[#6E6E66]">
              {blokuje ? (
                <>
                  <b className="block text-[15px] text-[#171714]">Wysyłka do księgowej zablokowana</b>
                  Najpierw: {powodBlokady}. Reszta to ostrzeżenia.
                </>
              ) : (
                <>
                  <b className="block text-[15px] text-[#171714]">Gotowe do rozliczenia</b>
                  Wysyłka do księgowej będzie dostępna wkrótce — na razie pobierz CSV.
                </>
              )}
            </span>
            {blokuje ? (
              <button type="button" disabled className={btnGlownyCls}>
                <Send size={18} /> Wyślij do księgowej
              </button>
            ) : (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={employeeRows.length === 0}
                className={btnObrysCls}
              >
                <Download size={18} /> Eksport CSV
              </button>
            )}
          </div>
        </Panel>
      </div>

      {/* Struktura kosztów */}
      <section className="mt-7" ref={sekcjaOsob} data-struktura>
        <h2 className="m-0 mb-3 text-[13px] font-extrabold tracking-[0.07em] uppercase text-[#6E6E66]">
          Struktura kosztów
        </h2>
        {widok === "lokale" && grupyLokali.length > 0 && sumaUdzialu > 0 && (
          <>
            <div className="flex h-9 rounded-lg overflow-hidden gap-0.5 bg-white" data-pasek-udzialow>
              {grupyLokali.map((g) => {
                const p = (g.miara / sumaUdzialu) * 100;
                return (
                  <i
                    key={g.klucz}
                    title={`${g.klucz} · ${Math.round(p)}%`}
                    className="flex items-center px-2.5 not-italic text-[13px] font-extrabold whitespace-nowrap overflow-hidden min-w-[4px] text-white"
                    style={{ width: `${p}%`, background: g.kolor }}
                  >
                    {p > 12 ? `${g.klucz} · ${Math.round(p)}%` : ""}
                  </i>
                );
              })}
            </div>
            <div className="flex gap-x-4 gap-y-1.5 flex-wrap mt-2.5 text-[13px] text-[#6E6E66]">
              {grupyLokali.map((g) => (
                <span key={g.klucz} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.kolor }} />
                  {g.klucz}{" "}
                  <b className="text-[#171714] tabular-nums">
                    {g.alokacja ? "~" : ""}
                    {miaraUdzialu === "cost" ? zl(g.cost) : hh(g.hours)}
                  </b>
                </span>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mt-4 mb-3 [scrollbar-width:none]">
          {PRZEKROJE.map(([k, l, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setWidok(k)}
              className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
                widok === k
                  ? "bg-[#171714] border-[#171714] text-white"
                  : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-przekroj={k}
            >
              {l} <span className={`tabular-nums ${widok === k ? "text-white/75" : "text-[#6E6E66]"}`}>{n}</span>
            </button>
          ))}
        </div>

        {widok === "lokale" && (
          <TabelaGrup
            tytul="Lokal"
            grupy={grupyLokali}
            suma={sumaUdzialu}
            otwarte={otwarteWidoku}
            przelacz={przelacz}
            onOsoba={pokazOsobe}
          />
        )}
        {widok === "stanowiska" && (
          <TabelaGrup
            tytul="Stanowisko"
            grupy={grupyStanowisk}
            suma={sumaUdzialu}
            otwarte={otwarteWidoku}
            przelacz={przelacz}
            onOsoba={pokazOsobe}
          />
        )}

        {widok === "pracownicy" && (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4 items-start">
            {/* --- Lista osób --- */}
            <div className={`${selectedUser ? "hidden xl:block" : "block"} ${kartaCls} overflow-hidden`} data-lista-kosztow>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b-[2px] border-[#171714]">
                <h3 className="m-0 font-['Archivo'] text-[17px] font-extrabold">Według pracownika</h3>
                <div className="ml-auto flex border-[2px] border-[#171714] rounded-lg overflow-hidden h-9">
                  {[
                    ["koszt", "Koszt"],
                    ["godz", "Godz."],
                    ["stawka", "zł/h"],
                  ].map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSortuj(k)}
                      className={`px-2.5 text-[13px] font-bold ${
                        sortuj === k ? "bg-[#171714] text-white" : "bg-white text-[#171714]"
                      }`}
                      data-sortuj={k}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {osobyPosortowane.length === 0 && (
                <p className="p-4 text-sm text-[#6E6E66]">Brak zmian w tym miesiącu.</p>
              )}
              {osobyPosortowane.map((r) => (
                <div
                  key={r.uid}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedUserId(r.uid)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelectedUserId(r.uid);
                  }}
                  className={`grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 px-4 py-[11px] border-t-[1.5px] border-[#DEDCD4] first:border-t-0 border-l-4 cursor-pointer ${
                    selectedUserId === r.uid
                      ? "bg-[#FFF3EF] border-l-[#DE3A22]"
                      : "border-l-transparent hover:bg-[#F6F5F1]"
                  }`}
                  data-osoba-kosztu={r.user.name}
                >
                  <div className="min-w-0">
                    <div className="font-bold truncate">{r.user.name}</div>
                    <div className="text-[13px] text-[#6E6E66] truncate">
                      {r.user.default_stanowisko || "—"} · {r.count} {odmiana(r.count, ["zmiana", "zmiany", "zmian"])}
                    </div>
                    {/* Zero godzin przy istniejącej zmianie znaczy jedno: nikt
                        nie odbił jej końca. Człowiek był, godziny czekają. */}
                    {r.bezKonca > 0 && (
                      <div className="text-[13px] text-[#8A5300] font-bold truncate">
                        {r.bezKonca} bez zakończenia — godziny nierozliczone
                      </div>
                    )}
                    {/* Część godzin w innym lokalu — inaczej liczba wygląda na
                        niezgodną z sumą lokalu. */}
                    {Math.abs(r.hours - r.hoursTuLokal) > 0.01 && (
                      <div className="text-[13px] text-[#6E6E66] truncate">
                        w tym {hh(r.hoursTuLokal)} w tym lokalu
                      </div>
                    )}
                  </div>
                  <div className="text-right font-extrabold tabular-nums">
                    {sortuj === "stawka"
                      ? r.cost == null
                        ? "—"
                        : `${naGodzine(r.cost, r.hours)} zł/h`
                      : sortuj === "godz"
                      ? hh(r.hours)
                      : r.cost == null
                      ? <span className={`${znakZapytaniaCls} !ml-0`}>brak wynagr.</span>
                      : zl(r.cost)}
                    <small className="block font-medium text-[13px] text-[#6E6E66]">
                      {sortuj === "koszt"
                        ? `${hh(r.hours)}${r.cost != null ? ` · ${naGodzine(r.cost, r.hours)} zł/h` : ""}`
                        : r.cost == null
                        ? "brak wynagrodzenia"
                        : zl(r.cost)}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            {/* --- Szczegóły osoby --- */}
            <div className={`min-w-0 ${selectedUser ? "block" : "hidden xl:block"}`}>
              {!selectedUser && (
                <div className="text-center py-12 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
                  Wybierz osobę z listy, żeby zobaczyć jej godziny, koszt i zmiany.
                </div>
              )}
              {selectedUser && (
                <div className={`${kartaCls} overflow-hidden`} data-szczegoly-osoby>
                  <div className="flex items-start gap-2.5 px-4 md:px-[18px] py-3.5 border-b-[2px] border-[#171714] flex-wrap">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(null)}
                        className="xl:hidden inline-flex items-center gap-1 text-sm font-bold text-[#6E6E66] mb-1"
                      >
                        <ChevronLeft size={16} /> Wszyscy pracownicy
                      </button>
                      <h3 className="m-0 font-['Archivo'] text-[20px] font-extrabold">{selectedUser.name}</h3>
                      <div className="text-[13px] text-[#6E6E66]">
                        {selectedUser.default_stanowisko || "—"} · {selectedShifts.length}{" "}
                        {odmiana(selectedShifts.length, ["zmiana", "zmiany", "zmian"])} ·{" "}
                        {MIESIACE[month].toLowerCase()} {year}
                      </div>
                    </div>
                    {onOpenEmployee && (
                      <button
                        type="button"
                        className={`${btnMalyCls} ml-auto`}
                        onClick={() => onOpenEmployee(selectedUser.id)}
                      >
                        Karta pracownika <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-3 md:px-[18px] py-3.5 border-b-[2px] border-[#171714]">
                    {[
                      [
                        hh(selectedHours),
                        selectedUrlop > 0 ? `praca ${hh(selectedHours - selectedUrlop)} · urlop ${hh(selectedUrlop)}` : "przepracowane",
                      ],
                      [
                        selectedCost == null ? "—" : zl(selectedCost),
                        selectedCost == null
                          ? "brak wynagrodzenia w karcie"
                          : selectedNadwyzka
                          ? selectedNadwyzka.godzin > 0
                            ? `umowa + ${hh(selectedNadwyzka.godzin)} ponad normą ${liczba(selectedNadwyzka.norma)} h`
                            : `wg umowy · norma ${liczba(selectedNadwyzka.norma)} h`
                          : "godziny × stawka",
                      ],
                      [
                        selectedPF && selectedPF.planH > 0 ? hh(selectedPF.planH) : "—",
                        selectedPF && selectedPF.planH > 0 ? (
                          <>
                            wg grafiku
                            {Math.abs(selectedPF.faktH - selectedPF.planH) >= PLAN_FAKT_PROG_H && (
                              <b className="text-[#171714]">
                                {" "}
                                · {selectedPF.faktH > selectedPF.planH ? "+" : "−"}
                                {liczba(Math.abs(selectedPF.faktH - selectedPF.planH))} h
                              </b>
                            )}
                            {isCurrentMonth && ` · do ${okresDo.slice(8)}.${okresDo.slice(5, 7)}`}
                          </>
                        ) : (
                          "brak zmian w grafiku"
                        ),
                      ],
                      [naGodzine(selectedCost, selectedHours), "zł za godzinę"],
                    ].map(([duza, pod], i) => (
                      <div key={i} className="bg-[#F6F5F1] rounded-lg px-3 py-2.5 min-w-0">
                        <div className="font-['Archivo'] text-[20px] md:text-[22px] leading-7 font-extrabold tabular-nums whitespace-nowrap">
                          {duza}
                        </div>
                        <div className="text-[12px] leading-4 text-[#6E6E66]">{pod}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`${siatkaWpisuCls} min-h-[36px] bg-[#F6F5F1] ${etykietaCls}`}>
                    <span>Data</span>
                    <span className="hidden md:block">Lokal</span>
                    <span>Od – do</span>
                    <span className="hidden md:block text-right">vs grafik</span>
                    <span className="text-right">Godz.</span>
                    <span className="hidden md:block" />
                  </div>
                  {wpisyOsoby.length === 0 && (
                    <p className="text-center py-8 text-sm text-[#6E6E66]">Brak zmian w tym miesiącu.</p>
                  )}
                  {wpisyOsoby.map((w) => {
                    if (w.urlop) {
                      const zakresDni =
                        w.dni === 1
                          ? dzienMies(w.od)
                          : `${pad(w.od.getDate())}–${dzienMies(w.do)}`;
                      return (
                        <div
                          key={`u${w.id}`}
                          className={`${siatkaWpisuCls} min-h-[46px] border-t-[1.5px] border-[#DEDCD4] bg-[#E3EEFB]`}
                          data-wpis-raportu="urlop"
                        >
                          <span className="font-extrabold">{zakresDni}</span>
                          <span className="hidden md:block font-bold text-[#1D5FA8]">Urlop</span>
                          <span className="text-[#1D5FA8] md:text-[#171714]">
                            {w.dni} {odmiana(w.dni, ["dzień", "dni", "dni"])} urlopu
                          </span>
                          <span className="hidden md:block" />
                          <span className="text-right font-extrabold">{liczba(w.godz)}</span>
                          <span className="hidden md:block" />
                        </div>
                      );
                    }
                    const s = w.s;
                    const d = diffDnia(s);
                    const kluczDnia = toLocalYMD(s.start_time);
                    const pierwszyWDniu = !pokazaneDni.has(kluczDnia);
                    pokazaneDni.add(kluczDnia);
                    let roznica = null;
                    if (d && pierwszyWDniu) {
                      if (d.planH === 0) {
                        roznica = (
                          <span className="inline-flex items-center h-[22px] px-2 rounded-md text-[11px] font-bold bg-[#ECEBE6] text-[#171714] whitespace-nowrap">
                            poza grafikiem
                          </span>
                        );
                      } else if (Math.abs(d.diff) < PLAN_FAKT_PROG_H) {
                        roznica = <span className="text-[#6E6E66]">≈</span>;
                      } else {
                        roznica = (
                          <span
                            className={`inline-flex items-center h-[22px] px-2 rounded-md text-[12px] font-extrabold whitespace-nowrap ${
                              d.diff < 0 ? "bg-[#E3EEFB] text-[#1D5FA8]" : "bg-[#FDF0D8] text-[#8A5300]"
                            }`}
                            title={`Ten dzień: grafik ${liczba(d.planH)} h, odbito ${liczba(d.faktH)} h`}
                          >
                            {d.diff > 0 ? "+" : "−"}
                            {liczba(Math.abs(d.diff))} h
                          </span>
                        );
                      }
                    }
                    return (
                      <div
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onEditShift(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onEditShift(s);
                        }}
                        title="Otwórz wpis"
                        className={`${siatkaWpisuCls} min-h-[46px] border-t-[1.5px] border-[#DEDCD4] cursor-pointer hover:bg-[#F6F5F1]`}
                        data-wpis-raportu={s.id}
                      >
                        <span className="whitespace-nowrap">
                          <b className="font-extrabold">{dzienMies(s.start_time)}</b>
                          <span className="text-[13px] text-[#6E6E66] ml-1">{DNI_KROTKIE[s.start_time.getDay()]}</span>
                        </span>
                        <span className="hidden md:block truncate">{s.lokal}</span>
                        <span className="whitespace-nowrap">
                          {hhmm(s.start_time)} –{" "}
                          {s.end_time ? hhmm(s.end_time) : <span className="text-[#8A5300] font-bold">bez końca</span>}
                        </span>
                        <span className="hidden md:block text-right">{roznica}</span>
                        <span className="text-right font-extrabold">{s.end_time ? liczba(hoursOf(s)) : "—"}</span>
                        <span className="hidden md:grid place-items-center text-[#6E6E66]">
                          <ChevronRight size={16} />
                        </span>
                      </div>
                    );
                  })}
                  {selectedRow && selectedRow.bezKonca > 0 && (
                    <div className="px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] text-[13px] text-[#6E6E66]">
                      Zmiana „bez końca” liczy zero godzin, dopóki nikt jej nie rozstrzygnie w Zatwierdzaniu zmian.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
