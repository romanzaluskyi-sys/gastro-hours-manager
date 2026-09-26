// @ts-nocheck
// "Kto jest teraz w pracy" — układ z makiety właściciela z 2026-09-25
// (ActiveDesktop / ActiveMobile). Najpierw problemy, potem lista:
//   1. Pasek podsumowania: na zmianie · po czasie · nie odbili się · lokale.
//   2. "Wymaga uwagi": kto jest w grafiku, a nie odbił wejścia (Zadzwoń /
//      Dopisz wejście) i kto pracuje dłużej, niż stało w grafiku.
//   3. Lokale: każda osoba z paskiem postępu zmiany, "w pracy …" i
//      "zostało …" albo "po czasie +…".
//   4. "Zakończ" to przycisk obrysowany, nie ściana czerwieni. Pyta o godzinę
//      (teraz albo koniec z grafiku, gdy ktoś jest po czasie), ±5 min, a na
//      głównym przycisku stoi wynik w godzinach. 6 s na "Cofnij".
//
// ⚠️ Zmiana bez zakończenia (porzucona) NIE jest "na zmianie" — stoi w osobnej
// liście na dole (utils/porzucone.ts). Ekran "kto jest w lokalu" nie może
// liczyć ludzi, których dawno nie ma.
import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, Hourglass, Phone, Plus, Square } from "lucide-react";
import { zmianaTrwa } from "../../utils/porzucone";
import { czekaNaKoniecOdKierownika } from "../../utils/wpisy";
import { toLocalYMD, trimTime, isSameUser, absenceOn } from "../../utils/grafik";
import { pad, naMin, zMin, odmiana } from "../../utils/czas";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";

// Kto jest w grafiku, a jeszcze nie odbił — dopiero po tylu minutach od
// planowanego startu. Ten sam margines co na Pulpicie.
const MARGINES_ODBICIA_MIN = 10;

const hhmm = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
const ileMin = (min) => {
  const a = Math.max(0, Math.round(Math.abs(min)));
  const h = Math.floor(a / 60);
  return h ? `${h} h ${a % 60} min` : `${a} min`;
};
// Planowany koniec jako data — zmiana przez północ kończy się następnego dnia.
const koniecPlanu = (p) => {
  const s = new Date(`${p.date}T${trimTime(p.start_time)}:00`);
  const k = new Date(`${p.date}T${trimTime(p.end_time)}:00`);
  if (k <= s) k.setDate(k.getDate() + 1);
  return k;
};

const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[40px] px-4 rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const chipCls = (on) =>
  `inline-flex items-center h-10 md:h-9 px-3 rounded-full border-[1.5px] text-sm font-semibold whitespace-nowrap ${
    on ? "border-[#171714] bg-[#171714] text-white" : "border-[#DEDCD4] bg-white text-[#171714] hover:border-[#171714]"
  }`;

// ---------------------------------------------------------------------------
// Na poziomie modułu (błąd #10 w CLAUDE.md) — Aktywni ma zegar.
// ---------------------------------------------------------------------------
function Kropka({ ton }) {
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-2 ${
        ton === "brak" ? "border-[2px] border-[#8A5300]" : ton === "po" ? "bg-[#8A5300]" : "bg-[#1F7A4A]"
      }`}
    />
  );
}

function Osoba({ nazwa, meta, onNameClick }) {
  return (
    <div className="min-w-0">
      <button type="button" onClick={onNameClick} className="font-['Archivo'] font-bold text-[17px] text-[#171714] text-left hover:underline">
        {nazwa}
      </button>
      <div className="text-[13px] text-[#6E6E66] truncate">{meta}</div>
    </div>
  );
}

function Pasek({ pct, po }) {
  return (
    <div className="h-2 rounded bg-[#ECEBE6] overflow-hidden my-1.5">
      <i
        className={`block h-full rounded ${po ? "bg-[#8A5300]" : "bg-[#1F7A4A]"}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

// Wybór godziny przed zapisem — wspólny dla "Zakończ" i "Dopisz wejście".
// Nic nie zapisuje się jednym kliknięciem: najpierw godzina (teraz albo z
// grafiku, ±5 min), a wynik stoi na głównym przycisku.
function WyborGodziny({ pytanie, godzina, setGodzina, teraz, planGodzina, najpierwGrafik, etykietaOk, onAnuluj, onOk, ...reszta }) {
  const poprawna = naMin(godzina) != null;
  const krok = (d) => setGodzina(zMin((naMin(godzina) ?? naMin(hhmm(teraz))) + d));
  const chipTeraz = (
    <button key="t" type="button" className={chipCls(godzina === hhmm(teraz))} onClick={() => setGodzina(hhmm(teraz))}>
      Teraz · {hhmm(teraz)}
    </button>
  );
  const chipGrafik = planGodzina && (
    <button key="g" type="button" className={chipCls(godzina === planGodzina)} onClick={() => setGodzina(planGodzina)}>
      Wg grafiku · {planGodzina}
    </button>
  );
  return (
    <div className="col-span-full flex flex-wrap items-center gap-2.5 bg-[#F6F5F1] rounded-lg p-3 mt-1" {...reszta}>
      <span className="font-bold text-[#171714]">{pytanie}</span>
      <span className="inline-flex items-stretch h-10 border-[2px] border-[#171714] rounded-md bg-white overflow-hidden">
        <button type="button" onClick={() => krok(-5)} aria-label="−5 min" className="w-9 text-lg font-bold text-[#6E6E66] hover:bg-[#F6F5F1]">
          −
        </button>
        <input
          value={godzina}
          onChange={(e) => setGodzina(e.target.value)}
          inputMode="numeric"
          aria-label={pytanie}
          className="w-16 text-center text-[17px] font-bold tabular-nums outline-none"
        />
        <button type="button" onClick={() => krok(5)} aria-label="+5 min" className="w-9 text-lg font-bold text-[#6E6E66] hover:bg-[#F6F5F1]">
          +
        </button>
      </span>
      {najpierwGrafik ? [chipGrafik, chipTeraz] : [chipTeraz, chipGrafik]}
      <span className="hidden md:block flex-1" />
      <div className="flex gap-2 w-full md:w-auto">
        <button type="button" className={`${btnObrysCls} flex-1 md:flex-none`} onClick={onAnuluj}>
          Anuluj
        </button>
        <button
          type="button"
          className={`${btnGlownyCls} flex-[2] md:flex-none`}
          disabled={!poprawna}
          onClick={() => onOk(zMin(naMin(godzina)))}
          data-godzina-ok
        >
          <Check size={17} /> {etykietaOk(poprawna ? zMin(naMin(godzina)) : null)}
        </button>
      </div>
    </div>
  );
}

// Ile godzin wyjdzie, gdy zmiana zaczęta o `start` skończy się o "HH:MM".
const minutyDo = (start, godzina) => {
  const m = naMin(godzina);
  if (m == null) return null;
  const koniec = new Date(start);
  koniec.setHours(Math.floor(m / 60), m % 60, 0, 0);
  if (koniec <= start) koniec.setDate(koniec.getDate() + 1);
  return Math.round((koniec - start) / 60000);
};

// ---------------------------------------------------------------------------
export default function Aktywni({
  shifts,
  planShifts = [],
  lokale = [],
  users = [],
  absences = [],
  issues = [],
  matchesFilter,
  zakres = "Cała sieć",
  onEndShift, // otwiera okno wpisu (zmiany bez zakończenia)
  onZakoncz, // async (shift, "HH:MM") => true, gdy zapisano
  onDopiszWejscie, // async (plan, user, "HH:MM") => true
  onNameClick,
}) {
  const [teraz, setTeraz] = useState(new Date());
  const [potwierdzenie, setPotwierdzenie] = useState(null); // { id, godzina }
  // Filtr z paska podsumowania: null | "zmiana" | "po" | "brak" | "lokal:<nazwa>".
  const [filtr, setFiltr] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setTeraz(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({
    zakoncz: (shift, godzina) => onZakoncz(shift, godzina),
    wejscie: (plan, user, godzina) => onDopiszWejscie(plan, user, godzina),
  });

  const dzis = toLocalYMD(teraz);
  const planDzis = planShifts.filter((p) => p.published_at && !p.deleted_at && p.date === dzis);
  // Zmiana z grafiku, do której należy to odbicie: najpierw ten sam lokal,
  // potem planowany start NAJBLIŻEJ faktycznego — przy zmianie dzielonej
  // (12:00–16:00 i 18:00–22:00) pierwsza z brzegu dawałaby zły koniec.
  const odStartu = (p, s) => Math.abs(new Date(`${p.date}T${trimTime(p.start_time)}:00`) - s.start_time);
  const planOsoby = (s) =>
    planDzis
      .filter((p) => (p.user_id ? String(p.user_id) === String(s.user_id) : p.user_name === s.user_name))
      .sort(
        (a, b) =>
          (a.lokal === s.lokal ? 0 : 1) - (b.lokal === s.lokal ? 0 : 1) || odStartu(a, s) - odStartu(b, s)
      )[0] || null;

  const otwarte = shifts
    .filter((s) => !s.end_time && !s.rozliczenie && matchesFilter(s.lokal) && !odlozone[`koniec:${s.id}`])
    .sort((a, b) => a.start_time - b.start_time);
  const trwa = (s) =>
    zmianaTrwa({ shift: s, planShifts, lokale, users, now: teraz }) && !czekaNaKoniecOdKierownika(s, issues);
  const aktywni = otwarte.filter(trwa).map((s) => {
    const plan = planOsoby(s);
    const koniec = plan ? koniecPlanu(plan) : null;
    return { s, plan, koniec, po: !!koniec && teraz > koniec };
  });
  const porzucone = otwarte.filter((s) => !trwa(s));

  // Kto w grafiku, a bez odbicia — ta sama reguła co na Pulpicie.
  const bezWejscia = [];
  const juzJest = new Set();
  planDzis
    .filter((p) => matchesFilter(p.lokal) && !odlozone[`wejscie:${p.id}`])
    .forEach((p) => {
      const start = new Date(`${p.date}T${trimTime(p.start_time)}:00`);
      if (+teraz < +start + MARGINES_ODBICIA_MIN * 60000 || teraz >= koniecPlanu(p)) return;
      const user = users.find((u) => isSameUser(p, u)) || { id: p.user_id, name: p.user_name };
      const k = String(user.id || user.name);
      if (juzJest.has(k) || user.archived || user.active === false) return;
      if (absenceOn(absences, user, p.date)) return;
      const odbil = shifts.some(
        (s) =>
          (s.user_id ? String(s.user_id) === String(user.id) : s.user_name === user.name) &&
          toLocalYMD(s.start_time) === p.date
      );
      if (odbil) return;
      juzJest.add(k);
      bezWejscia.push({ p, user, start });
    });

  const poCzasie = aktywni.filter((a) => a.po);
  // Lokale w pasku: te, w których ktoś jest na zmianie ALBO ktoś nie odbił
  // wejścia — inaczej nie dałoby się zawęzić do lokalu, gdzie brakuje ludzi.
  const lokaleZOsobami = [...new Set([...aktywni.map((a) => a.s.lokal), ...bezWejscia.map((b) => b.p.lokal)])]
    .map((lokal) => ({ lokal, lista: aktywni.filter((a) => a.s.lokal === lokal) }))
    .sort((a, b) => b.lista.length - a.lista.length || a.lokal.localeCompare(b.lokal));

  const zakoncz = (a, godzina) => {
    setPotwierdzenie(null);
    decyduj(
      [{ klucz: `koniec:${a.s.id}`, zadanie: ["zakoncz", [a.s, godzina]] }],
      `Zakończono: ${a.s.user_name} o ${godzina} · ${ileMin(minutyDo(a.s.start_time, godzina))}`
    );
  };
  const dopisz = (p, user, godzina) => {
    setPotwierdzenie(null);
    decyduj(
      [{ klucz: `wejscie:${p.id}`, zadanie: ["wejscie", [p, user, godzina]] }],
      `Dopisano wejście: ${user.name} od ${godzina}`
    );
  };

  // --- filtr z paska podsumowania ---
  const lokalFiltra = filtr && filtr.startsWith("lokal:") ? filtr.slice(6) : null;
  const pokazBrak = (lokal) => !filtr || filtr === "brak" || lokalFiltra === lokal;
  const pokazPo = (lokal) => !filtr || filtr === "po" || filtr === "zmiana" || lokalFiltra === lokal;
  const pokazWToku = (lokal) => !filtr || filtr === "zmiana" || lokalFiltra === lokal;

  const wiersz = (a, zLokalem) => {
    const { s, plan, koniec, po } = a;
    const wPracy = Math.floor((teraz - s.start_time) / 60000);
    const calosc = koniec ? Math.round((koniec - s.start_time) / 60000) : null;
    const otwarty = potwierdzenie?.id === s.id;
    return (
      <div
        key={s.id}
        className={`grid grid-cols-[10px_minmax(0,1fr)] md:grid-cols-[10px_minmax(160px,1fr)_minmax(0,1.3fr)_auto] gap-x-4 gap-y-2 items-start px-4 md:px-5 py-3.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 ${
          otwarty ? "bg-[#FBFAF7]" : ""
        }`}
        data-aktywny={s.id}
      >
        <Kropka ton={po ? "po" : "ok"} />
        <Osoba
          nazwa={s.user_name}
          meta={zLokalem ? `${s.stanowisko} · ${s.lokal}` : s.stanowisko}
          onNameClick={() => s.user_id && onNameClick(s.user_id, s.start_time)}
        />
        <div className="col-start-2 md:col-start-auto min-w-0">
          <div className="flex justify-between gap-3 text-sm">
            <b className="tabular-nums text-[#171714]">
              {hhmm(s.start_time)} → {koniec ? hhmm(koniec) : "?"}
            </b>
            {po ? (
              <span className="font-bold text-[#8A5300]">po czasie +{ileMin((teraz - koniec) / 60000)}</span>
            ) : koniec ? (
              <span className="text-[#6E6E66]">zostało {ileMin((koniec - teraz) / 60000)}</span>
            ) : (
              <span className="text-[#6E6E66]">bez zmiany w grafiku</span>
            )}
          </div>
          <Pasek pct={calosc ? (wPracy / calosc) * 100 : 0} po={po} />
          <div className="text-sm text-[#6E6E66]">w pracy {ileMin(wPracy)}</div>
        </div>
        {!otwarty && (
          <div className="col-start-2 md:col-start-auto md:self-center">
            <button
              type="button"
              className={`${btnObrysCls} w-full md:w-auto`}
              onClick={() => setPotwierdzenie({ id: s.id, godzina: hhmm(po ? koniec : teraz) })}
              data-zakoncz
            >
              <Square size={15} /> Zakończ
            </button>
          </div>
        )}
        {otwarty && (
          <WyborGodziny
            data-zakonczenie
            pytanie="Zakończ zmianę o"
            godzina={potwierdzenie.godzina}
            setGodzina={(g) => setPotwierdzenie({ id: s.id, godzina: g })}
            teraz={teraz}
            planGodzina={plan ? hhmm(koniec) : null}
            najpierwGrafik={po}
            etykietaOk={(g) => (g ? `Zakończ · ${ileMin(minutyDo(s.start_time, g))}` : "Zakończ")}
            onAnuluj={() => setPotwierdzenie(null)}
            onOk={(g) => zakoncz(a, g)}
          />
        )}
      </div>
    );
  };

  const panelCls = "bg-white border-[2px] border-[#171714] rounded-xl overflow-hidden";
  const naglowekCls = "flex items-center gap-2.5 px-4 md:px-5 py-3.5 border-b-[2px]";
  const bezWejsciaWidoczne = bezWejscia.filter((b) => pokazBrak(b.p.lokal));
  const poCzasieWidoczne = poCzasie.filter((a) => pokazPo(a.s.lokal));
  const porzuconeWidoczne = porzucone.filter((s) => !filtr || lokalFiltra === s.lokal);
  const uwaga = bezWejsciaWidoczne.length + poCzasieWidoczne.length;

  // Pozycja paska podsumowania = filtr. Drugie kliknięcie zdejmuje filtr.
  const chip = (klucz, liczba, tekst, ton) => {
    const wlaczony = filtr === klucz;
    return (
      <button
        key={klucz || "wszyscy"}
        type="button"
        aria-pressed={wlaczony}
        onClick={() => setFiltr(wlaczony ? null : klucz)}
        className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full text-[15px] font-semibold whitespace-nowrap border-[2px] ${
          wlaczony
            ? "bg-[#171714] border-[#171714] text-white"
            : ton === "warn"
            ? "bg-[#FDF0D8] border-[#FDF0D8] text-[#8A5300] hover:border-[#8A5300]"
            : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
        }`}
        data-filtr-aktywnych={klucz || "wszyscy"}
      >
        {liczba != null && <b className="font-['Archivo'] text-[17px] tabular-nums">{liczba}</b>} {tekst}
      </button>
    );
  };

  return (
    <div className="max-w-[1120px] mx-auto flex flex-col gap-5" data-aktywni>
      <div className="hidden md:block">
        <h2 className="font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714]">
          Kto jest teraz w pracy
        </h2>
        <p className="text-[#6E6E66] mt-1">
          {zakres} · aktualizacja na żywo · {hhmm(teraz)}
        </p>
      </div>

      {/* Podsumowanie — każda pozycja zawęża listę (klik jeszcze raz = wszyscy).
          Na telefonie przewija się w bok. */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap [scrollbar-width:none]" data-podsumowanie>
        {filtr && chip(null, null, "Wszyscy")}
        {chip("zmiana", aktywni.length, "na zmianie")}
        {poCzasie.length > 0 && chip("po", poCzasie.length, "po czasie", "warn")}
        {/* "bez wejścia", nie "nie odbiła się" — nie zgadujemy rodzaju z imienia. */}
        {bezWejscia.length > 0 && chip("brak", bezWejscia.length, "bez wejścia", "warn")}
        {lokaleZOsobami.map(({ lokal, lista }) => chip(`lokal:${lokal}`, null, (
          <>
            {lokal} <b className="font-['Archivo'] text-[17px] tabular-nums">{lista.length}</b>
          </>
        )))}
      </div>

      {uwaga > 0 && (
        <div className="bg-white border-[2px] border-[#8A5300] rounded-xl overflow-hidden" data-wymaga-uwagi>
          <div className={`${naglowekCls} bg-[#FDF0D8] border-[#8A5300]`}>
            <AlertTriangle size={19} className="text-[#8A5300]" />
            <h3 className="font-['Archivo'] font-extrabold text-[17px] text-[#171714]">Wymaga uwagi</h3>
            <span className="ml-auto text-sm font-bold text-[#6E6E66]">{uwaga}</span>
          </div>
          {bezWejsciaWidoczne.map(({ p, user, start }) => {
            const tel = users.find((u) => String(u.id) === String(user.id))?.telefon;
            const otwarty = potwierdzenie?.id === `w:${p.id}`;
            return (
              <div
                key={`b-${p.id}`}
                className="grid grid-cols-[10px_minmax(0,1fr)] md:grid-cols-[10px_minmax(160px,1fr)_minmax(0,1.3fr)_auto] gap-x-4 gap-y-2 items-start px-4 md:px-5 py-3.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0"
                data-bez-wejscia={user.name}
              >
                <Kropka ton="brak" />
                <Osoba
                  nazwa={user.name}
                  meta={`${p.stanowisko} · ${p.lokal}`}
                  onNameClick={() => user.id && onNameClick(user.id, start)}
                />
                <div className="col-start-2 md:col-start-auto min-w-0">
                  <div className="flex justify-between gap-3 text-sm">
                    <b className="text-[#171714]">brak wejścia</b>
                    <span className="font-bold text-[#8A5300] text-right">
                      grafik od {trimTime(p.start_time)} · {ileMin((teraz - start) / 60000)} temu
                    </span>
                  </div>
                  <Pasek pct={0} />
                </div>
                {!otwarty && (
                <div className="col-start-2 md:col-start-auto flex gap-2 md:self-center">
                  {/* Telefon jest w kartotece tylko u kierownika (users_widok) —
                      bez numeru przycisk nie ma dokąd zadzwonić, więc go nie ma. */}
                  {tel && (
                    <a href={`tel:${String(tel).replace(/\s/g, "")}`} className={`${btnObrysCls} flex-1 md:flex-none`}>
                      <Phone size={16} /> Zadzwoń
                    </a>
                  )}
                  <button
                    type="button"
                    className={`${btnObrysCls} flex-1 md:flex-none`}
                    data-dopisz-wejscie
                    onClick={() => setPotwierdzenie({ id: `w:${p.id}`, godzina: trimTime(p.start_time) })}
                  >
                    <Plus size={16} /> Dopisz wejście
                  </button>
                </div>
                )}
                {/* Najpierw godzina (wg grafiku albo teraz), dopiero potem zapis. */}
                {otwarty && (
                  <WyborGodziny
                    data-dopisz-wejscie-godzina
                    pytanie="Wejście o"
                    godzina={potwierdzenie.godzina}
                    setGodzina={(g) => setPotwierdzenie({ id: `w:${p.id}`, godzina: g })}
                    teraz={teraz}
                    planGodzina={trimTime(p.start_time)}
                    najpierwGrafik
                    etykietaOk={(g) => (g ? `Dopisz wejście · ${g}` : "Dopisz wejście")}
                    onAnuluj={() => setPotwierdzenie(null)}
                    onOk={(g) => dopisz(p, user, g)}
                  />
                )}
              </div>
            );
          })}
          {poCzasieWidoczne.map((a) => wiersz(a, true))}
        </div>
      )}

      {aktywni.length === 0 && bezWejscia.length === 0 && (
        <div className="text-center py-12 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
          <b className="block text-[#171714] text-lg mb-1">Nikt teraz nie pracuje</b>
          Kto odbije wejście, pojawi się tutaj.
        </div>
      )}

      {filtr && uwaga === 0 && !lokaleZOsobami.some(({ lokal, lista }) => pokazWToku(lokal) && lista.some((a) => !a.po)) && (
        <div className="text-center py-8 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
          Nikogo w tym widoku.
        </div>
      )}

      {lokaleZOsobami.map(({ lokal, lista }) => {
        const wToku = lista.filter((a) => !a.po);
        if (!wToku.length || !pokazWToku(lokal)) return null;
        return (
          <div key={lokal} className={panelCls} data-lokal-aktywnych={lokal}>
            <div className={`${naglowekCls} border-[#171714]`}>
              <h3 className="font-['Archivo'] font-extrabold text-[17px] text-[#171714]">{lokal}</h3>
              <span className="ml-auto text-sm font-bold text-[#6E6E66]">
                {wToku.length} {odmiana(wToku.length, ["osoba", "osoby", "osób"])}
              </span>
            </div>
            {wToku.map((a) => wiersz(a, false))}
          </div>
        );
      })}

      {/* Te zmiany nie są już "w toku" — ktoś wyszedł i nie odbił końca.
          Godzin nikomu nie dopisujemy, więc dopóki kierownik nie zdecyduje,
          liczą się jako zero. Decyzja żyje w Zatwierdzaniu zmian; tutaj jest
          tylko po to, żeby ekran "kto jest w lokalu" nie kłamał. */}
      {porzuconeWidoczne.length > 0 && (
        <div className={panelCls} data-bez-zakonczenia>
          <div className={`${naglowekCls} border-[#171714]`}>
            <Hourglass size={18} />
            <h3 className="font-['Archivo'] font-extrabold text-[17px] text-[#171714]">Bez zakończenia</h3>
            <span className="ml-auto text-sm font-bold text-[#6E6E66]">{porzuconeWidoczne.length}</span>
          </div>
          <p className="px-4 md:px-5 pt-3 text-[13px] text-[#6E6E66] max-w-[70ch]">
            Zmiana zaczęta i nieodbita do końca. Te godziny nie liczą się nikomu, dopóki nie rozstrzygniesz ich w
            Zatwierdzaniu zmian — albo nie uzupełnisz tutaj.
          </p>
          {porzuconeWidoczne.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center px-4 md:px-5 py-3 border-t-[1.5px] border-[#DEDCD4]"
            >
              <Osoba
                nazwa={s.user_name}
                meta={`${s.stanowisko} · ${s.lokal} · ${pad(s.start_time.getDate())}.${pad(
                  s.start_time.getMonth() + 1
                )} od ${hhmm(s.start_time)}`}
                onNameClick={() => s.user_id && onNameClick(s.user_id, s.start_time)}
              />
              <button type="button" className={btnObrysCls} onClick={() => onEndShift(s)}>
                Uzupełnij godziny
              </button>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="sticky bottom-0 z-30">
          <PasekCofnij opis={toast.opis} onCofnij={cofnij} />
        </div>
      )}
    </div>
  );
}
