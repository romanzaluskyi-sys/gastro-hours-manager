// @ts-nocheck
// Okno wpisu godzin — dodanie i edycja jednego wiersza `shifts`. Układ z
// makiety właściciela (RegisterEntryPanel), z jedną zmianą na prośbę
// właściciela z 2026-09-25: na komputerze to OKNO NA ŚRODKU o ograniczonym
// rozmiarze, a nie panel na całą wysokość z prawej. Na telefonie — arkusz od
// dołu, jak "Popraw" w "Do decyzji".
//
// Otwierają je Rejestr godzin, Aktywni ("Zakończ zmianę") i Raporty — zapis
// robi `onSave` z ManagerDashboard (ten sam, który był za starym modalem), tu
// jest tylko formularz.
//
// Zasady z makiety:
//   - wybór osoby przy nowym wpisie podstawia jej lokal i stanowisko, a gdy
//     tego dnia stoi w grafiku — także godziny z grafiku;
//   - godziny zmienione względem grafiku robią się bursztynowe;
//   - POWÓD jest wymagany, gdy zmieniamy coś, co już było zapisane — widzi go
//     pracownik w powiadomieniu. Dopisanie brakującego wyjścia do zmiany bez
//     końca (np. "Zakończ zmianę" w Aktywnych) powodu nie wymaga;
//   - historia wpisu: kto, kiedy, było → jest i dlaczego (`shift_edits`);
//   - "Usuń wpis" to link z LEWEJ, daleko od "Zapisz", z 6 s na "Cofnij".
import React, { useEffect, useState } from "react";
import { Check, Clock, Search, X } from "lucide-react";
import PoleCzasu from "./PoleCzasu";
import { naMin, dlugosc, godzTekst, pad } from "../../utils/czas";
import { trimTime, toLocalYMD } from "../../utils/grafik";

const POWODY = ["Zapomniany tablet", "Potwierdzone z kierownikiem", "Błąd odbicia"];
const DNI = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];

const hhmm = (d) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "");
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const poleCls =
  "w-full h-12 md:h-11 px-3 border-[2px] border-[#171714] rounded-md bg-white text-[15px] text-[#171714]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-50";
const chipCls = (on) =>
  `inline-flex items-center h-[34px] px-3 rounded-full border-[1.5px] text-sm font-semibold whitespace-nowrap ${
    on
      ? "border-[#171714] bg-[#171714] text-white"
      : "border-[#DEDCD4] bg-white text-[#171714] hover:border-[#171714]"
  }`;

// Zmiana z grafiku tej osoby tego dnia. Przy kilku — najpierw w wybranym
// lokalu, potem najwcześniejsza.
const planOsoby = (planShifts, user, date, lokal) => {
  if (!user || !date) return null;
  const lista = (planShifts || [])
    .filter(
      (p) =>
        !p.deleted_at &&
        p.date === date &&
        (p.user_id ? String(p.user_id) === String(user.id) : p.user_name === user.name)
    )
    .sort(
      (a, b) =>
        (a.lokal === lokal ? 0 : 1) - (b.lokal === lokal ? 0 : 1) ||
        trimTime(a.start_time).localeCompare(trimTime(b.start_time))
    );
  return lista[0] || null;
};

const opisSladu = (se) => {
  const zakres = (od, doG) => (od ? `${od}–${doG || "…"}` : "—");
  const zrodlo = {
    manual_add: "Dodany ręcznie",
    manual_edit: "Zmiana ręczna",
    manual_delete: "Usunięty",
    correction_approved: "Zatwierdzona prośba pracownika",
    correction_adjusted: "Prośba pracownika poprawiona",
  }[se.source];
  const przedPo =
    se.source === "manual_add"
      ? zakres(se.new_start_time, se.new_end_time)
      : `${zakres(se.old_start_time, se.old_end_time)} → ${zakres(se.new_start_time, se.new_end_time)}`;
  const miejsce =
    se.old_lokal && se.new_lokal && (se.old_lokal !== se.new_lokal || se.old_stanowisko !== se.new_stanowisko)
      ? ` · ${se.new_lokal} · ${se.new_stanowisko}`
      : "";
  return { zrodlo, tekst: `${przedPo}${miejsce}`, powod: se.reason };
};

export default function WpisGodzinModal({
  shift, // id === null → nowy wpis
  users = [],
  lokale = [],
  stanowiska = [],
  planShifts = [],
  shiftEdits = [],
  onClose,
  onSave, // async (form) => true, gdy zapisano
  onDelete, // (shift) => void — usunięcie z "Cofnij" robi rodzic
}) {
  const nowy = !shift?.id;
  const [form, setForm] = useState(() => ({
    userId: shift?.user_id || "",
    q: shift?.user_name || "",
    date: toLocalYMD(shift?.start_time || new Date()),
    lokal: shift?.lokal || lokale[0]?.name || "",
    stanowisko: shift?.stanowisko || "",
    start: shift?.id ? hhmm(shift.start_time) : "",
    end: shift?.end_time ? hhmm(shift.end_time) : "",
    reason: "",
  }));
  const [listaOsob, setListaOsob] = useState(nowy);
  const [blad, setBlad] = useState(null);
  const [zapisuje, setZapisuje] = useState(false);
  const ustaw = (zmiany) => {
    setBlad(null);
    setForm((f) => ({ ...f, ...zmiany }));
  };

  // Escape zamyka, a tło strony nie przewija się pod oknem.
  useEffect(() => {
    const klawisz = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", klawisz);
    return () => window.removeEventListener("keydown", klawisz);
  }, [onClose]);

  const osoba =
    users.find((u) => String(u.id) === String(form.userId)) ||
    (shift?.user_name ? { id: shift.user_id, name: shift.user_name } : null);
  const plan = planOsoby(planShifts, osoba, form.date, form.lokal);
  const planOd = plan ? trimTime(plan.start_time) : "";
  const planDo = plan ? trimTime(plan.end_time) : "";
  const jakWGrafiku = plan && form.start === planOd && form.end === planDo;

  const wybierzOsobe = (u) => {
    const p = planOsoby(planShifts, u, form.date, null);
    ustaw({
      userId: u.id,
      q: u.name,
      lokal: p?.lokal || u.default_lokal || form.lokal,
      stanowisko: p?.stanowisko || u.default_stanowisko || "",
      ...(p ? { start: trimTime(p.start_time), end: trimTime(p.end_time) } : {}),
    });
    setListaOsob(false);
  };

  // Lokal i stanowisko w jednym polu, jak w makiecie. ⚠️ Wartość selecta
  // MUSI być wśród opcji (CLAUDE.md, "Popraw zmianę") — stanowisko spoza
  // słownika, które wisi w starej zmianie, dokładamy do listy.
  const opcje = [];
  lokale.forEach((l) =>
    stanowiska
      .filter((s) => s.lokal_name === l.name)
      .forEach((s) => opcje.push([`${l.name}|${s.name}`, `${l.name} · ${s.name}`]))
  );
  const biezaca = `${form.lokal}|${form.stanowisko}`;
  if (form.lokal && form.stanowisko && !opcje.some(([v]) => v === biezaca)) {
    opcje.unshift([biezaca, `${form.lokal} · ${form.stanowisko}`]);
  }

  const minuty = form.start && form.end ? dlugosc(form.start, form.end) : null;
  const przezPolnoc = minuty != null && naMin(form.end) <= naMin(form.start);

  // Co się zmieniło względem zapisu — od tego zależy, czy powód jest wymagany.
  const bylo = shift?.id
    ? {
        date: toLocalYMD(shift.start_time),
        lokal: shift.lokal,
        stanowisko: shift.stanowisko,
        start: hhmm(shift.start_time),
        end: shift.end_time ? hhmm(shift.end_time) : "",
      }
    : null;
  const zmiana =
    !!bylo &&
    (bylo.date !== form.date ||
      bylo.lokal !== form.lokal ||
      bylo.stanowisko !== form.stanowisko ||
      bylo.start !== form.start ||
      bylo.end !== form.end);
  const powodWymagany =
    !!bylo &&
    (bylo.date !== form.date ||
      bylo.lokal !== form.lokal ||
      bylo.stanowisko !== form.stanowisko ||
      bylo.start !== form.start ||
      (bylo.end !== "" && bylo.end !== form.end));

  const zapisz = async (e) => {
    e.preventDefault();
    if (nowy && !form.userId) return setBlad("Wybierz pracownika z listy.");
    if (!form.date || !form.start) return setBlad("Podaj dzień i godzinę wejścia.");
    if (nowy && !form.end) return setBlad("Podaj wejście i wyjście.");
    if (!form.lokal || !form.stanowisko) return setBlad("Wybierz lokal i stanowisko.");
    if (powodWymagany && !form.reason.trim())
      return setBlad("Podaj powód — pracownik zobaczy go w powiadomieniu o zmianie.");
    if (bylo && !zmiana) return onClose();
    setZapisuje(true);
    const ok = await onSave({ ...form, reason: form.reason.trim() });
    setZapisuje(false);
    if (ok) onClose();
  };

  const historia = shift?.id
    ? shiftEdits
        .filter((se) => String(se.shift_id) === String(shift.id))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  const q = form.q.trim().toLowerCase();
  const kandydaci = users
    .filter((u) => u.role !== "kiosk" && u.active !== false && !u.archived)
    .filter((u) => !q || u.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);

  const tytul = nowy
    ? "Nowy wpis"
    : `${shift.user_name} · ${DNI[shift.start_time.getDay()]} ${pad(shift.start_time.getDate())}.${pad(
        shift.start_time.getMonth() + 1
      )}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={tytul}
      data-wpis-godzin
    >
      <div className="absolute inset-0 bg-[#171714]/45" onClick={onClose} />
      <form
        onSubmit={zapisz}
        className="relative w-full md:max-w-[560px] max-h-[92vh] md:max-h-[min(760px,90vh)] flex flex-col bg-white rounded-t-[20px] md:rounded-xl border-t-[2px] md:border-[2px] border-[#171714] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
      >
        <div className="md:hidden w-11 h-[5px] rounded bg-[#DEDCD4] mx-auto mt-2.5" />
        <div className="flex items-start gap-3 px-5 md:px-6 pt-4 md:pt-5 pb-3 border-b-[1.5px] border-[#DEDCD4]">
          <div className="min-w-0">
            <h3 className="font-['Archivo'] font-extrabold text-[21px] leading-7 text-[#171714] truncate">
              {tytul}
            </h3>
            <p className="text-sm text-[#6E6E66]">
              {nowy ? "Ręczny wpis godzin" : `${shift.stanowisko} · ${shift.lokal}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="ml-auto w-10 h-10 -mr-2 grid place-items-center rounded-lg text-[#171714] hover:bg-[#F6F5F1]"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 md:px-6 py-4 flex flex-col gap-4">
          {nowy && (
            <div className="flex flex-col gap-1.5 relative">
              <span className={etykietaCls}>Pracownik</span>
              <span className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6E6E66]" />
                <input
                  value={form.q}
                  onChange={(e) => {
                    ustaw({ q: e.target.value, userId: "" });
                    setListaOsob(true);
                  }}
                  onFocus={() => setListaOsob(true)}
                  placeholder="Wpisz imię…"
                  autoComplete="off"
                  className={`${poleCls} pl-10`}
                  data-pole-osoby
                />
              </span>
              {listaOsob && (
                <div className="border-[2px] border-[#171714] rounded-lg overflow-hidden max-h-[216px] overflow-y-auto">
                  {kandydaci.length === 0 && (
                    <p className="px-3 py-2.5 text-sm text-[#6E6E66]">Nikogo takiego nie ma.</p>
                  )}
                  {kandydaci.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => wybierzOsobe(u)}
                      className="w-full text-left px-3 py-2 flex items-baseline gap-2 hover:bg-[#F6F5F1] border-t-[1.5px] border-[#DEDCD4] first:border-t-0"
                    >
                      <b className="text-[#171714]">{u.name}</b>
                      <span className="text-[13px] text-[#6E6E66] truncate">
                        {[u.default_stanowisko, u.default_lokal].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className={etykietaCls}>Dzień</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => ustaw({ date: e.target.value })}
                className={poleCls}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className={etykietaCls}>Lokal · stanowisko</span>
              <select
                value={form.lokal && form.stanowisko ? biezaca : ""}
                onChange={(e) => {
                  const [lokal, stanowisko] = e.target.value.split("|");
                  ustaw({ lokal, stanowisko });
                }}
                className={poleCls}
              >
                {!(form.lokal && form.stanowisko) && <option value="">— wybierz —</option>}
                {opcje.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {osoba && (
            <div className="flex items-center gap-2.5 bg-[#F6F5F1] rounded-lg px-3 py-2.5 text-sm text-[#171714]">
              <Clock size={17} className="flex-shrink-0" />
              {plan ? (
                <>
                  <span>
                    W grafiku{plan.lokal !== form.lokal ? ` (${plan.lokal})` : ""}:{" "}
                    <b className="tabular-nums">
                      {planOd}–{planDo}
                    </b>
                  </span>
                  {jakWGrafiku ? (
                    <span className="ml-auto inline-flex items-center gap-1 h-[26px] px-2 rounded-md text-[13px] font-bold bg-[#E2F3E9] text-[#1F7A4A]">
                      <Check size={14} strokeWidth={2.5} /> jak w grafiku
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => ustaw({ start: planOd, end: planDo })}
                      className={`${btnCls} ml-auto min-h-[36px] md:min-h-[36px] px-3 text-sm border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`}
                    >
                      Wstaw
                    </button>
                  )}
                </>
              ) : (
                <span>Brak zmiany w grafiku tego dnia — wpis będzie „poza grafikiem”.</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className={etykietaCls}>Wejście</span>
              <PoleCzasu
                szerokie
                value={form.start}
                onChange={(v) => ustaw({ start: v })}
                zmienione={!!plan && form.start !== planOd}
                bazowa={planOd || "09:00"}
                aria="Wejście"
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className={etykietaCls}>Wyjście</span>
              <PoleCzasu
                szerokie
                mozePuste={!nowy}
                value={form.end}
                onChange={(v) => ustaw({ end: v })}
                zmienione={!!plan && form.end !== planDo}
                bazowa={planDo || form.start || "17:00"}
                aria="Wyjście"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-[2px] border-[#171714] rounded-lg px-4 py-2.5">
            <span className="text-sm text-[#6E6E66]">
              {minuty == null
                ? "Razem — zmiana bez wyjścia się nie liczy"
                : `Razem${przezPolnoc ? " · kończy się następnego dnia" : ""}`}
            </span>
            <b className="font-['Archivo'] text-[22px] font-extrabold tabular-nums text-[#171714]">
              {minuty == null ? "—" : godzTekst(minuty)}
            </b>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={etykietaCls}>
              Powód{powodWymagany ? " · wymagany przy zmianie" : ""} · widzi go pracownik
            </span>
            <input
              value={form.reason}
              onChange={(e) => ustaw({ reason: e.target.value })}
              placeholder="Np. zapomniany tablet"
              className={`${poleCls} ${blad && powodWymagany && !form.reason.trim() ? "border-[#DE3A22]" : ""}`}
              data-pole-powodu
            />
            <div className="flex flex-wrap gap-2">
              {POWODY.map((p) => (
                <button key={p} type="button" className={chipCls(form.reason === p)} onClick={() => ustaw({ reason: p })}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {blad && (
            <p className="text-sm font-bold text-[#DE3A22]" role="alert" data-blad-wpisu>
              {blad}
            </p>
          )}

          {!nowy && (
            <div className="border-t-[1.5px] border-[#DEDCD4] pt-3.5">
              <span className={etykietaCls}>Historia wpisu</span>
              <ol className="mt-2 flex flex-col gap-2.5">
                {historia.length === 0 && (
                  <li className="flex gap-2.5 text-sm">
                    <span className="w-2 h-2 rounded-full bg-[#6E6E66] mt-1.5 flex-shrink-0" />
                    <span>
                      <b>Odbicie</b>
                      <span className="block text-[#171714]">
                        Wejście {bylo.start}
                        {bylo.end ? ` · wyjście ${bylo.end}` : " · bez wyjścia"} — bez zmian ręcznych
                      </span>
                    </span>
                  </li>
                )}
                {historia.map((se) => {
                  const o = opisSladu(se);
                  return (
                    <li key={se.id} className="flex gap-2.5 text-sm">
                      <span className="w-2 h-2 rounded-full bg-[#6E6E66] mt-1.5 flex-shrink-0" />
                      <span className="min-w-0">
                        <b>{se.editor_name || "—"}</b>
                        <span className="text-[13px] text-[#6E6E66]">
                          {" "}
                          ·{" "}
                          {new Date(se.created_at).toLocaleString("pl-PL", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {o.zrodlo ? ` · ${o.zrodlo}` : ""}
                        </span>
                        <span className="block tabular-nums text-[#171714]">
                          {o.tekst}
                          {o.powod ? ` · „${o.powod}”` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 px-5 md:px-6 py-3.5 border-t-[1.5px] border-[#DEDCD4] pb-[max(14px,env(safe-area-inset-bottom))]">
          {!nowy && (
            <button
              type="button"
              onClick={() => onDelete(shift)}
              className="text-[15px] font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22] mr-auto"
              data-usun-wpis
            >
              Usuń wpis
            </button>
          )}
          <span className={nowy ? "flex-1" : "hidden"} />
          <button
            type="button"
            onClick={onClose}
            className={`${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`}
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={zapisuje}
            className={`${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A]`}
            data-zapisz-wpis
          >
            <Check size={18} /> {nowy ? "Dodaj wpis" : "Zapisz"}
          </button>
        </div>
      </form>
    </div>
  );
}
