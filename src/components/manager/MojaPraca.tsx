// @ts-nocheck
// Moja praca — kierownik jest też pracownikiem i sam zapisuje swoje godziny.
// Układ z makiety właściciela (0.69.0, MyWorkDesktop / MyWorkMobile): z lewej
// zapis zmiany (przyklejony), z prawej miesiąc — JEDNA lista „grafik vs
// faktycznie” zamiast osobnego raportu i osobnego grafiku.
//
// Rzeczy, których nie widać:
//   - zapis zmiany to ta sama logika co wcześniej (kolizje w stanie i w
//     BAZIE, arkusz Google). Kafle „Zaczynam teraz” / „Cała zmiana” idą za
//     sposobem wpisu LOKALU (`tryb_wpisu`) — tak samo jak na ekranie Zmiana
//     pracownika. Okien tolerancji kierownik nie ma: to on je rozstrzyga;
//   - parowanie grafiku z faktem jest takie jak w Rejestrze godzin: per dzień,
//     i-ta zmiana dnia z i-tym wpisem grafiku, różnica od 15 min;
//   - „brak zapisu” = opublikowana zmiana z grafiku w dniu, który MINĄŁ, bez
//     żadnego odbicia. Dziś się nie liczy — od tego jest karta z lewej;
//   - „Dopisz” otwiera to samo okno wpisu co Rejestr (`onDopisz` →
//     WpisGodzinModal), z godzinami z grafiku. Zapis idzie `zapiszWpisGodzin`,
//     czyli z kontrolą kolizji i śladem w `shift_edits`.
import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Plus,
} from "lucide-react";
import { api } from "../../api/supabase";
import { sendToGoogleSheets } from "../../api/googleSheets";
import { findOverlappingShift, opisKolidujacej, znajdzKolizjeWBazie } from "../../utils/shifts";
import { getDayOfWeek, odmianaZmian, getMonthName } from "../../utils/format";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import {
  publishedShiftsFor,
  nextShiftFrom,
  shiftHours,
  faktIPlanMiesiaca,
  trimTime,
  toLocalYMD,
} from "../../utils/grafik";
import { podsumowanieMiesiaca } from "../../utils/umowy";
import { regulyWpisu, wymuszonaCalaZmiana, opisGdzie } from "../../utils/wpisy";
import { PoleGodziny, fmtHHMM } from "../employeeSessionShared";

// Różnica, od której wiersz jest „inaczej niż grafik” — ta sama co w Rejestrze.
const PROG_H = 0.25;
const MIESIACE_KROTKO = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const DNI_KROTKO = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];

const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");
const godzinyZmiany = (s) => (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0);
const dataZYMD = (ymd) => new Date(ymd + "T00:00:00");
const dzienTekst = (ymd, dzisYMD) => {
  const d = dataZYMD(ymd);
  const jutro = new Date(dataZYMD(dzisYMD));
  jutro.setDate(jutro.getDate() + 1);
  const opis = `${DNI_KROTKO[d.getDay()]} ${d.getDate()} ${MIESIACE_KROTKO[d.getMonth()]}`;
  if (ymd === dzisYMD) return `dziś, ${opis}`;
  if (ymd === toLocalYMD(jutro)) return `jutro, ${opis}`;
  return opis;
};

const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl p-3 md:p-4";
const etykietaCls = "block text-[13px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66] mx-0.5 mb-1.5";
const przyciskGlownyCls =
  "w-full min-h-[56px] flex items-center justify-center gap-2 rounded-lg bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[18px] px-4 mt-1.5 disabled:opacity-60";

// Pasek z lewej wiersza: zielony — zgodnie, czarny — inaczej niż grafik albo
// poza grafikiem, bursztynowy — brak zapisu. Reszta bez koloru.
const PASEK = {
  ok: "border-l-[#1F7A4A]",
  diff: "border-l-[#171714]",
  extra: "border-l-[#171714]",
  miss: "border-l-[#8A5300] bg-[#FDF0D8]",
  bezkonca: "border-l-[#8A5300]",
  trwa: "border-l-[#1F7A4A]",
  urlop: "border-l-[#DEDCD4]",
  plan: "border-l-[#DEDCD4]",
};

export default function MojaPraca({
  currentUser,
  lokale,
  stanowiska,
  shifts,
  setShifts,
  planShifts,
  showMsg,
  onEditShift,
  onDopisz,
}) {
  const [teraz, setTeraz] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTeraz(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const dzisYMD = toLocalYMD(teraz);
  const mojGrafik = publishedShiftsFor(planShifts, currentUser);
  const planDzis = mojGrafik
    .filter((s) => s.date === dzisYMD)
    .sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));

  // --- ZAPIS ZMIANY ------------------------------------------------------
  // Domyślnie lokal i stanowisko z dzisiejszego grafiku, potem z karty.
  const lokalStartowy = () => {
    const zGrafiku = planDzis.find((p) => lokale.some((l) => l.name === p.lokal));
    if (zGrafiku) return zGrafiku.lokal;
    if (lokale.some((l) => l.name === currentUser?.default_lokal)) return currentUser.default_lokal;
    return lokale[0]?.name || "";
  };
  const [lokal, setLokal] = useState(lokalStartowy);
  const stanowiskoDla = (l) => {
    const lista = stanowiska.filter((s) => s.lokal_name === l);
    const zGrafiku = planDzis.find((p) => p.lokal === l);
    if (zGrafiku && lista.some((s) => s.name === zGrafiku.stanowisko)) return zGrafiku.stanowisko;
    if (lista.some((s) => s.name === currentUser?.default_stanowisko)) return currentUser.default_stanowisko;
    return lista[0]?.name || "";
  };
  const [stanowisko, setStanowisko] = useState(() => stanowiskoDla(lokalStartowy()));
  const dostepneStanowiska = stanowiska.filter((s) => s.lokal_name === lokal);
  useEffect(() => {
    if (!dostepneStanowiska.some((s) => s.name === stanowisko)) setStanowisko(stanowiskoDla(lokal));
  }, [lokal, stanowiska]);

  const [knowsEnd, setKnowsEnd] = useState(false);
  const wymuszona = wymuszonaCalaZmiana(regulyWpisu(lokale, lokal));
  const calaZmiana = wymuszona ?? knowsEnd;
  const [innyStart, setInnyStart] = useState(null); // null = „teraz”
  const [date, setDate] = useState(dzisYMD);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [innyKoniec, setInnyKoniec] = useState(null);
  const [saving, setSaving] = useState(false);

  const openShift = shifts.find((s) => s.user_id === currentUser.id && !s.end_time && !s.rozliczenie);
  const dzisZapisane = shifts
    .filter((s) => s.user_id === currentUser.id && s.end_time && toLocalYMD(s.start_time) === dzisYMD)
    .sort((a, b) => a.start_time - b.start_time);

  const razem =
    calaZmiana && startTime && endTime
      ? (() => {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          let mins = eh * 60 + em - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          return f1(mins / 60);
        })()
      : null;

  const handleCreateShift = async () => {
    const start = calaZmiana ? startTime : innyStart ?? fmtHHMM(new Date());
    const dzien = calaZmiana ? date : toLocalYMD(new Date());
    if (!lokal || !stanowisko || !dzien || !start || (calaZmiana && !endTime)) {
      return showMsg("Wypełnij wymagane pola!", "error");
    }
    setSaving(true);
    const [year, month, day] = dzien.split("-").map(Number);
    const [startH, startM] = start.split(":").map(Number);
    const startD = new Date(year, month - 1, day, startH, startM);
    let endD = null;
    let hrs = null;
    if (calaZmiana) {
      const [endH, endM] = endTime.split(":").map(Number);
      endD = new Date(year, month - 1, day, endH, endM);
      if (endD < startD) endD.setDate(endD.getDate() + 1);
      hrs = parseFloat(((endD - startD) / 3600000).toFixed(2));
    }
    const overlapping = findOverlappingShift(shifts, currentUser.id, startD, endD, null);
    if (overlapping) {
      setSaving(false);
      return showMsg(`Ta zmiana nakłada się na już zapisaną (${opisKolidujacej(overlapping)}).`, "error");
    }
    const wBazie = await znajdzKolizjeWBazie({ userId: currentUser.id, start: startD, end: endD, excludeId: null });
    if (wBazie) {
      setSaving(false);
      return showMsg(`Ta zmiana jest już zapisana (${opisKolidujacej(wBazie)}).`, "error");
    }
    try {
      const created = await api.post("shifts", {
        user_id: currentUser.id,
        user_name: currentUser.name,
        lokal,
        stanowisko,
        start_time: startD.toISOString(),
        end_time: endD ? endD.toISOString() : null,
        godzin: hrs,
      });
      const parsed = {
        ...created,
        start_time: new Date(created.start_time),
        end_time: created.end_time ? new Date(created.end_time) : null,
      };
      setShifts((prev) => [...prev, parsed]);
      sendToGoogleSheets(parsed, "ADD_SHIFT");
      showMsg(calaZmiana ? "Zmiana zapisana!" : "Rozpoczęto zmianę!");
      setInnyStart(null);
      setStartTime("");
      setEndTime("");
      setKnowsEnd(false);
    } catch (err) {
      showMsg(`Błąd zapisu do bazy: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  const handleCloseShift = async () => {
    const koniec = innyKoniec ?? fmtHHMM(new Date());
    setSaving(true);
    const [endH, endM] = koniec.split(":").map(Number);
    const endD = new Date(openShift.start_time);
    endD.setHours(endH, endM, 0, 0);
    if (endD < openShift.start_time) endD.setDate(endD.getDate() + 1);
    const hrs = parseFloat(((endD - openShift.start_time) / 3600000).toFixed(2));
    try {
      const updated = await api.patch("shifts", openShift.id, { end_time: endD.toISOString(), godzin: hrs });
      const parsed = { ...updated, start_time: new Date(updated.start_time), end_time: new Date(updated.end_time) };
      setShifts((prev) => prev.map((s) => (s.id === openShift.id ? parsed : s)));
      sendToGoogleSheets(parsed, "EDIT_SHIFT");
      setInnyKoniec(null);
      showMsg("Zmiana zakończona pomyślnie!");
    } catch (err) {
      showMsg(`Błąd połączenia z bazą: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  // Trwająca zmiana — ile już i ile do końca wg grafiku.
  const planNaTrwajaca = openShift
    ? mojGrafik.find((s) => s.date === toLocalYMD(openShift.start_time) && s.lokal === openShift.lokal) ||
      mojGrafik.find((s) => s.date === toLocalYMD(openShift.start_time))
    : null;
  const naZmianieMin = openShift ? Math.max(0, Math.round((teraz - openShift.start_time) / 60000)) : null;
  const doKoncaMin = (() => {
    if (!openShift || !planNaTrwajaca?.end_time) return null;
    const [h, m] = trimTime(planNaTrwajaca.end_time).split(":").map(Number);
    const koniec = new Date(openShift.start_time);
    koniec.setHours(h, m, 0, 0);
    if (koniec < openShift.start_time) koniec.setDate(koniec.getDate() + 1);
    return Math.round((koniec - teraz) / 60000);
  })();
  const najblizsza = nextShiftFrom(planShifts, currentUser, dzisYMD);

  const selectLokalStanowisko = (
    <div className="grid grid-cols-2 gap-2.5">
      {[
        ["Lokal", lokal, setLokal, lokale, null],
        ["Stanowisko", stanowisko, setStanowisko, dostepneStanowiska, "Brak stanowisk"],
      ].map(([etykieta, wartosc, ustaw, opcje, pusto]) => (
        <label key={etykieta} className="block min-w-0">
          <span className="block text-[15px] text-[#6E6E66] mx-0.5 mb-1.5">{etykieta}</span>
          <span className="relative block">
            <select
              value={wartosc}
              onChange={(e) => ustaw(e.target.value)}
              className="w-full h-12 appearance-none bg-white border-2 border-[#171714] rounded-lg pl-3 pr-8 text-[16px] font-bold text-[#171714] truncate"
            >
              {opcje.length === 0 && pusto && <option value="">{pusto}</option>}
              {opcje.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={18}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#171714]"
            />
          </span>
        </label>
      ))}
    </div>
  );

  const kartaZmiany = (
    <section className={kartaCls} data-karta-zmiany>
      {openShift ? (
        <>
          <span className={etykietaCls}>Na zmianie od {fmtHHMM(openShift.start_time)}</span>
          <div className="font-['Archivo'] font-extrabold text-[40px] leading-tight text-[#171714] tabular-nums">
            {Math.floor(naZmianieMin / 60)} godz. {naZmianieMin % 60} min
          </div>
          <div className="text-[15px] text-[#6E6E66]">
            {openShift.stanowisko} · {openShift.lokal}
          </div>
          {doKoncaMin != null && (
            <div
              className={`mt-3 rounded-lg px-3 py-2.5 ${
                doKoncaMin < 0 ? "bg-[#FDF0D8] text-[#8A5300]" : "bg-[#ECEBE6] text-[#171714]"
              }`}
            >
              <span className="block text-[13px] font-bold">
                {doKoncaMin < 0 ? "Po planowanym końcu" : "Do końca zmiany"} · wg grafiku{" "}
                {trimTime(planNaTrwajaca.start_time)}–{trimTime(planNaTrwajaca.end_time)}
              </span>
              <b className="font-['Archivo'] text-[22px] tabular-nums">
                {Math.floor(Math.abs(doKoncaMin) / 60)} godz. {Math.abs(doKoncaMin) % 60} min
              </b>
            </div>
          )}
          <div className="mt-4">
            <span className={etykietaCls}>Zakończenie · {dzienTekst(dzisYMD, dzisYMD)}</span>
            <PoleGodziny
              wartosc={innyKoniec}
              teraz={fmtHHMM(teraz)}
              onZmiana={setInnyKoniec}
              onTeraz={() => setInnyKoniec(null)}
              etykieta="Godzina zakończenia"
            />
          </div>
          <button onClick={handleCloseShift} disabled={saving} className={`${przyciskGlownyCls} mt-3`} data-zakoncz-zmiane>
            Zakończ zmianę o {innyKoniec ?? fmtHHMM(teraz)}
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[24px_1fr] gap-2.5 p-3 rounded-lg bg-[#ECEBE6] mb-3.5" data-najblizsza-zmiana>
            <CalendarDays size={22} className="text-[#6E6E66] mt-0.5" />
            <div className="min-w-0">
              <span className="block text-[12px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66]">
                Najbliższa zmiana
              </span>
              {najblizsza ? (
                <>
                  <b className="block font-['Archivo'] text-[18px] text-[#171714]">
                    {dzienTekst(najblizsza.date, dzisYMD)} · {trimTime(najblizsza.start_time)}–
                    {trimTime(najblizsza.end_time)}
                  </b>
                  <small className="text-[14px] text-[#6E6E66]">
                    {najblizsza.stanowisko} · {najblizsza.lokal}
                  </small>
                </>
              ) : (
                <b className="block text-[16px] text-[#171714]">Brak zmian w grafiku</b>
              )}
            </div>
          </div>
          {wymuszona === null ? (
            <div className="grid grid-cols-2 gap-2 mb-3.5">
              {[
                [false, "Zaczynam teraz", "koniec później", Clock],
                [true, "Cała zmiana", "start i koniec", CalendarDays],
              ].map(([wartosc, tytul, pod, Ikona]) => (
                <button
                  key={tytul}
                  type="button"
                  onClick={() => setKnowsEnd(wartosc)}
                  data-sposob-wpisu={wartosc ? "cala" : "start"}
                  className={`min-h-[56px] flex items-center gap-2 px-2.5 py-2 rounded-lg border-2 text-left ${
                    knowsEnd === wartosc
                      ? "bg-[#171714] border-[#171714] text-white"
                      : "bg-white border-[#171714] text-[#171714]"
                  }`}
                >
                  <Ikona size={22} className="flex-shrink-0" />
                  <span>
                    <b className="block text-[16px]">{tytul}</b>
                    <small
                      className={`block text-[12px] leading-[15px] ${
                        knowsEnd === wartosc ? "text-white/75" : "text-[#6E6E66]"
                      }`}
                    >
                      {pod}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-[#6E6E66] mb-3.5 mx-0.5">
              {opisGdzie(lokal)}{" "}
              {wymuszona
                ? "wpisuje się całą zmianę naraz — po jej zakończeniu."
                : "odbija się osobno: start teraz, koniec po pracy."}
            </p>
          )}
          {selectLokalStanowisko}
          {calaZmiana ? (
            <>
              <label className="block mt-3.5">
                <span className={etykietaCls}>Data</span>
                <input
                  type="date"
                  value={date}
                  max={dzisYMD}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-12 bg-white border-2 border-[#171714] rounded-lg px-3 text-[16px] font-bold text-[#171714]"
                />
              </label>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-1 gap-2.5 mt-3.5">
                <div>
                  <span className={etykietaCls}>Od</span>
                  <PoleGodziny wartosc={startTime} onZmiana={setStartTime} etykieta="Godzina rozpoczęcia" />
                </div>
                <div>
                  <span className={etykietaCls}>Do</span>
                  <PoleGodziny wartosc={endTime} onZmiana={setEndTime} etykieta="Godzina zakończenia" />
                </div>
              </div>
              <div className="flex justify-between items-baseline px-3.5 py-3 rounded-lg bg-[#ECEBE6] mt-3.5">
                <span className="text-[15px] text-[#6E6E66]">Razem</span>
                <b className="font-['Archivo'] text-[24px] font-extrabold tabular-nums text-[#171714]">
                  {razem ? `${razem} godz.` : "—"}
                </b>
              </div>
              <button onClick={handleCreateShift} disabled={saving} className={`${przyciskGlownyCls} mt-3`} data-zapisz-zmiane>
                Zapisz całą zmianę
              </button>
            </>
          ) : (
            <>
              <div className="mt-3.5">
                <span className={etykietaCls}>Rozpoczęcie · {dzienTekst(dzisYMD, dzisYMD)}</span>
                <PoleGodziny
                  wartosc={innyStart}
                  teraz={fmtHHMM(teraz)}
                  onZmiana={setInnyStart}
                  onTeraz={() => setInnyStart(null)}
                  etykieta="Godzina rozpoczęcia"
                />
              </div>
              <p className="text-[15px] leading-[21px] text-[#6E6E66] mt-2 mx-0.5">
                Zapiszemy tylko start. Koniec zapiszesz później tutaj albo w Aktywnych.
              </p>
              <button onClick={handleCreateShift} disabled={saving} className={`${przyciskGlownyCls} mt-3`} data-zapisz-zmiane>
                Rozpocznij zmianę o {innyStart ?? fmtHHMM(teraz)}
              </button>
            </>
          )}
          {dzisZapisane.length > 0 && (
            <p className="text-[14px] text-[#6E6E66] mt-3 mx-0.5">
              Dziś już zapisane:{" "}
              <b className="text-[#171714] tabular-nums">
                {dzisZapisane.map((s) => `${fmtHHMM(s.start_time)}–${fmtHHMM(s.end_time)}`).join(", ")}
              </b>
            </p>
          )}
        </>
      )}
    </section>
  );

  // --- MIESIĄC: GRAFIK VS FAKTYCZNIE ---------------------------------------
  const [mies, setMies] = useState(() => ({ rok: teraz.getFullYear(), m: teraz.getMonth() }));
  const [filtr, setFiltr] = useState("wszystkie");
  const klucz = `${mies.rok}-${String(mies.m + 1).padStart(2, "0")}`;
  const kluczDzis = dzisYMD.slice(0, 7);
  const przesunMies = (o) =>
    setMies(({ rok, m }) => {
      const d = new Date(rok, m + o, 1);
      return { rok: d.getFullYear(), m: d.getMonth() };
    });
  // Dalej niż bieżący miesiąc tylko wtedy, gdy grafik już tam coś ma.
  const maDalej = klucz < kluczDzis || mojGrafik.some((s) => s.date.slice(0, 7) > klucz);

  const planDnia = {};
  mojGrafik
    .filter((s) => s.date.slice(0, 7) === klucz)
    .forEach((s) => (planDnia[s.date] = [...(planDnia[s.date] || []), s]));
  const faktDnia = {};
  shifts
    .filter((s) => s.user_id === currentUser.id && s.start_time && toLocalYMD(s.start_time).slice(0, 7) === klucz)
    .forEach((s) => {
      const k = toLocalYMD(s.start_time);
      faktDnia[k] = [...(faktDnia[k] || []), s];
    });

  const wiersze = [];
  new Set([...Object.keys(planDnia), ...Object.keys(faktDnia)]).forEach((ymd) => {
    const plany = (planDnia[ymd] || []).sort((a, b) => trimTime(a.start_time).localeCompare(trimTime(b.start_time)));
    const fakty = (faktDnia[ymd] || []).sort((a, b) => a.start_time - b.start_time);
    const praca = fakty.filter((s) => !s.is_urlop);
    fakty
      .filter((s) => s.is_urlop)
      .forEach((s) => wiersze.push({ klucz: s.id, ymd, fakt: s, plan: null, status: "urlop", sort: "00:00" }));
    praca.forEach((s, i) => {
      const plan = plany[i] || null;
      let status;
      if (!s.end_time) status = ymd === dzisYMD ? "trwa" : "bezkonca";
      else if (!plan) status = "extra";
      else status = Math.abs(godzinyZmiany(s) - shiftHours(plan)) >= PROG_H ? "diff" : "ok";
      wiersze.push({ klucz: s.id, ymd, fakt: s, plan, status, sort: fmtHHMM(s.start_time) });
    });
    plany.slice(praca.length).forEach((p) =>
      wiersze.push({ klucz: `p-${p.id}`, ymd, fakt: null, plan: p, status: ymd < dzisYMD ? "miss" : "plan", sort: trimTime(p.start_time) })
    );
  });
  wiersze.sort((a, b) => (a.ymd === b.ymd ? a.sort.localeCompare(b.sort) : a.ymd.localeCompare(b.ymd)));

  const przepracowane = wiersze.reduce((a, w) => a + (w.fakt ? godzinyZmiany(w.fakt) : 0), 0);
  const urlopH = wiersze.reduce((a, w) => a + (w.status === "urlop" ? godzinyZmiany(w.fakt) : 0), 0);
  const zmianPracy = wiersze.filter((w) => w.fakt && w.status !== "urlop").length;
  const planowe = wiersze.filter((w) => w.plan);
  const planH = planowe.reduce((a, w) => a + shiftHours(w.plan), 0);
  const braki = wiersze.filter((w) => w.status === "miss");
  const saPrzeszleDni = klucz < kluczDzis || (klucz === kluczDzis && Number(dzisYMD.slice(8)) > 1);
  const widoczne = filtr === "braki" ? braki : wiersze;
  useEffect(() => {
    if (filtr === "braki" && braki.length === 0) setFiltr("wszystkie");
  }, [klucz, braki.length]);

  // Norma — to samo zdanie co w Raporcie pracownika i z tej samej funkcji.
  const rozbicie = faktIPlanMiesiaca({ shifts, planShifts, user: currentUser, rok: mies.rok, mies: mies.m + 1, dzis: teraz });
  const podsumowanie = podsumowanieMiesiaca({
    user: currentUser,
    przepracowane: rozbicie.fakt,
    zaplanowane: rozbicie.plan,
    rok: mies.rok,
    mies: mies.m + 1,
    biezacy: rozbicie.biezacy,
  });

  const znacznik = (s) => (
    <span
      className="text-[11px] font-extrabold px-1.5 py-[3px] rounded-[5px] flex-none bg-[#ECEBE6] text-[#6E6E66]"
      style={s.is_urlop ? {} : stanowiskoBadgeStyle(stanowiska, s.lokal, s.stanowisko) || {}}
    >
      {s.is_urlop ? "URL" : stanowiskoShort(stanowiska, s.lokal, s.stanowisko)}
    </span>
  );

  const wiersz = (w) => {
    const d = dataZYMD(w.ymd);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const zrodlo = w.fakt || w.plan;
    const f = w.fakt ? godzinyZmiany(w.fakt) : 0;
    const roznica = w.status === "diff" ? f - shiftHours(w.plan) : w.status === "extra" ? f : null;
    return (
      <div
        key={w.klucz}
        data-wiersz-dnia={w.ymd}
        data-status={w.status}
        className={`grid grid-cols-[50px_1fr_auto] md:grid-cols-[64px_1.3fr_1fr_1.1fr_64px_96px] gap-x-2 md:gap-x-2.5 gap-y-0.5 items-center px-2 md:px-2.5 py-2 md:min-h-[52px] border-b border-[#DEDCD4] border-l-4 ${PASEK[w.status]}`}
      >
        <div className="row-span-2 md:row-span-1">
          <b className="block text-[16px] font-['Archivo'] tabular-nums text-[#171714]">
            {w.ymd.slice(8, 10)}.{w.ymd.slice(5, 7)}
          </b>
          <span className={`text-[13px] font-bold ${weekend ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
            {getDayOfWeek(d)}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 min-w-0">
          {znacznik(zrodlo)}
          <small className="text-[13px] text-[#6E6E66] truncate">{zrodlo.lokal}</small>
        </div>
        <div className="col-start-2 row-start-2 md:col-start-auto md:row-start-auto text-[13px] md:text-[15px] text-[#6E6E66] tabular-nums">
          <span className="md:hidden">grafik </span>
          {w.plan ? (
            `${trimTime(w.plan.start_time)}–${trimTime(w.plan.end_time)}`
          ) : (
            <em className="not-italic text-[13px]">{w.status === "urlop" ? "—" : "poza grafikiem"}</em>
          )}
        </div>
        <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto min-w-0">
          {w.status === "urlop" ? (
            <b className="text-[16px] text-[#171714]">Urlop</b>
          ) : w.fakt ? (
            <b className="text-[16px] tabular-nums text-[#171714]">
              {fmtHHMM(w.fakt.start_time)}–
              {w.fakt.end_time ? (
                fmtHHMM(w.fakt.end_time)
              ) : w.status === "trwa" ? (
                <span className="text-[#1F7A4A]">trwa</span>
              ) : (
                <span className="text-[#8A5300]">bez końca</span>
              )}
            </b>
          ) : w.status === "miss" ? (
            <em className="not-italic inline-flex items-center gap-1 text-[14px] font-extrabold text-[#8A5300]">
              <AlertTriangle size={15} />
              brak zapisu
            </em>
          ) : (
            <span className="text-[14px] text-[#6E6E66]">{w.ymd === dzisYMD ? "dziś w grafiku" : "w grafiku"}</span>
          )}
        </div>
        <div className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto text-right tabular-nums whitespace-nowrap">
          {w.fakt && w.fakt.end_time ? (
            <>
              <b className="inline md:block text-[17px] font-['Archivo'] text-[#171714]">{f1(f)}</b>
              {roznica != null && (
                <small
                  className={`ml-1 md:ml-0 text-[12px] font-extrabold ${roznica > 0 ? "text-[#171714]" : "text-[#8A5300]"}`}
                >
                  {roznica > 0 ? "+" : "−"}
                  {f1(Math.abs(roznica))}
                </small>
              )}
            </>
          ) : w.plan ? (
            <span className="text-[15px] text-[#6E6E66]">{f1(shiftHours(w.plan))}</span>
          ) : (
            <span className="text-[15px] text-[#6E6E66]">—</span>
          )}
        </div>
        <div className="col-start-3 row-start-2 md:col-start-auto md:row-start-auto flex justify-end">
          {w.fakt ? (
            <button
              onClick={() => onEditShift(w.fakt)}
              aria-label="Popraw zapis"
              title="Popraw zapis"
              className="w-9 h-9 rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center text-[#171714] hover:bg-[#F1F1EE]"
            >
              <Edit2 size={15} />
            </button>
          ) : w.status === "miss" ? (
            <button
              onClick={() => onDopisz(w.plan)}
              data-dopisz={w.ymd}
              className="inline-flex items-center gap-1 min-h-[32px] md:min-h-[36px] px-2 md:px-3 rounded-lg border-2 border-[#171714] bg-[#171714] text-white text-[13px] md:text-[14px] font-bold"
            >
              <Plus size={15} />
              Dopisz
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const przeszle = widoczne.filter((w) => w.ymd < dzisYMD);
  const odDzis = widoczne.filter((w) => w.ymd >= dzisYMD);
  const pokazDzis = klucz === kluczDzis && filtr !== "braki";
  const dzisTekst = dzienTekst(dzisYMD, dzisYMD).replace("dziś, ", "");

  const kartaMiesiaca = (
    <section className={kartaCls} data-miesiac-pracy>
      <div className="grid grid-cols-[40px_1fr_40px] items-center text-center mb-3">
        <button
          onClick={() => przesunMies(-1)}
          aria-label="Poprzedni miesiąc"
          className="w-10 h-10 rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <b className="block font-['Archivo'] text-[20px] text-[#171714]" data-miesiac>
            {getMonthName(mies.m)} {mies.rok}
          </b>
          <small className="text-[13px] text-[#6E6E66]">{currentUser.name} · kierownik</small>
        </div>
        <button
          onClick={() => przesunMies(1)}
          disabled={!maDalej}
          aria-label="Następny miesiąc"
          className="w-10 h-10 rounded-lg border-2 border-[#171714] bg-white flex items-center justify-center disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-2">
        <div className="border-2 border-[#DEDCD4] rounded-lg px-3 py-2.5">
          <span className="block text-[13px] font-bold text-[#6E6E66]">Przepracowane</span>
          <b className="block font-['Archivo'] text-[22px] md:text-[26px] tabular-nums text-[#171714]" data-kafel-przepracowane>
            {f1(przepracowane)} h
          </b>
          <small className="text-[13px] text-[#6E6E66]">
            {zmianPracy} {odmianaZmian(zmianPracy)}
            {urlopH > 0 ? ` · w tym urlop ${f1(urlopH)} h` : ""}
          </small>
        </div>
        <div className="border-2 border-[#DEDCD4] rounded-lg px-3 py-2.5">
          <span className="block text-[13px] font-bold text-[#6E6E66]">W grafiku</span>
          <b className="block font-['Archivo'] text-[22px] md:text-[26px] tabular-nums text-[#171714]">{f1(planH)} h</b>
          <small className="text-[13px] text-[#6E6E66]">
            {planowe.length} {odmianaZmian(planowe.length)}
          </small>
        </div>
        {saPrzeszleDni &&
          (braki.length > 0 ? (
            <div className="col-span-2 md:col-span-1 border-2 border-[#8A5300] bg-[#FDF0D8] rounded-lg px-3 py-2.5" data-kafel-brak>
              <span className="block text-[13px] font-bold text-[#8A5300]">Bez zapisu godzin</span>
              <b className="block font-['Archivo'] text-[22px] md:text-[26px] tabular-nums text-[#8A5300]">
                {braki.length} {odmianaZmian(braki.length)}
              </b>
              <button
                onClick={() => setFiltr("braki")}
                className="inline-flex items-center gap-0.5 text-[13px] font-extrabold text-[#171714] underline"
              >
                Pokaż i dopisz <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <div className="col-span-2 md:col-span-1 border-2 border-[#1F7A4A] bg-[#E2F3E9] rounded-lg px-3 py-2.5 text-[#1F7A4A]" data-kafel-brak="0">
              <span className="block text-[13px] font-bold">Wszystko zapisane</span>
              <Check size={26} className="mt-1" />
            </div>
          ))}
      </div>
      {podsumowanie.opis && <p className="text-[13px] text-[#6E6E66] mb-2 mx-0.5">{podsumowanie.opis}</p>}

      <div className="flex items-center gap-1.5 flex-wrap mb-2 mt-3">
        {[
          ["wszystkie", "Wszystkie dni"],
          ["braki", "Bez zapisu"],
        ].map(([k, t]) => (
          <button
            key={k}
            onClick={() => setFiltr(k)}
            disabled={k === "braki" && braki.length === 0}
            data-filtr-dni={k}
            className={`min-h-[36px] px-3 rounded-full border-2 text-[14px] font-bold inline-flex items-center gap-1.5 disabled:opacity-40 ${
              filtr === k ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#171714] text-[#171714]"
            }`}
          >
            {t}
            {k === "braki" && braki.length > 0 && (
              <i className="not-italic bg-[#8A5300] text-white rounded-full text-[12px] px-1.5">{braki.length}</i>
            )}
          </button>
        ))}
        <span className="hidden md:flex ml-auto items-center gap-1.5 text-[12px] text-[#6E6E66]">
          <i className="w-2.5 h-2.5 rounded-[3px] bg-[#1F7A4A]" />
          zgodnie
          <i className="w-2.5 h-2.5 rounded-[3px] bg-[#171714] ml-1" />
          inaczej niż grafik
          <i className="w-2.5 h-2.5 rounded-[3px] bg-[#8A5300] ml-1" />
          brak zapisu
        </span>
      </div>

      <div className="hidden md:grid grid-cols-[64px_1.3fr_1fr_1.1fr_64px_96px] gap-x-2.5 px-2.5 py-2 text-[12px] font-extrabold tracking-[.05em] uppercase text-[#6E6E66] border-b-2 border-[#171714]">
        <span>Data</span>
        <span>Stanowisko</span>
        <span>Grafik</span>
        <span>Faktycznie</span>
        <span className="text-right">Godz.</span>
        <span />
      </div>
      {wiersze.length === 0 && (
        <p className="text-center py-8 text-[15px] text-[#6E6E66]">Ani zmian w grafiku, ani zapisanych godzin w tym miesiącu.</p>
      )}
      {przeszle.map(wiersz)}
      {pokazDzis && (
        <div className="text-center my-2.5" data-znacznik-dzis>
          <span className="inline-block text-[12px] font-extrabold text-white bg-[#DE3A22] px-2.5 py-[3px] rounded-full">
            dziś · {dzisTekst}
          </span>
        </div>
      )}
      {odDzis.map(wiersz)}
    </section>
  );

  return (
    <div className="max-w-[1240px] mx-auto" data-moja-praca>
      <div className="hidden md:block mb-5">
        <h2 className="font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714]">Moja praca</h2>
        <p className="text-[15px] text-[#6E6E66]">Zapis godzin, raport i grafik w jednym miejscu</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-3 xl:gap-5 items-start">
        <div className="xl:sticky xl:top-0 max-w-[560px] w-full mx-auto xl:max-w-none">{kartaZmiany}</div>
        <div className="min-w-0">{kartaMiesiaca}</div>
      </div>
    </div>
  );
}
