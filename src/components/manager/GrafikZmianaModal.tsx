// @ts-nocheck
// Dwa modale trybu Edycja w Grafiku:
//  • GrafikZmianaModal — wpisanie/edycja jednej zmiany (klik w komórkę),
//  • GrafikBlokadaModal — odmowa, gdy godziny kolidują albo pracownik ma
//    zatwierdzone wolne.
// Trzymane razem, bo jedno prowadzi do drugiego i dzielą ten sam kontekst.
//
// Zapis idzie przez onSave/onDelete z GrafikTydzien — modal sam nie pisze
// do bazy. Reguły (kolizje, podpowiadane godziny) żyją w utils/grafik.ts.
import React, { useState, useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { btnPrimaryCls, btnSecondaryCls, statLabelCls } from "./designTokens";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import {
  trimTime,
  defaultHoursForStanowisko,
  getRulesForDate,
  knowsStanowisko,
  findBlockingAbsence,
} from "../../utils/grafik";

const DZIEN_PELNY = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

const fmtNaglowek = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  return `${DZIEN_PELNY[d.getDay()]} ${d.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  })}`;
};

export function GrafikBlokadaModal({ powod, onClose, onNotify }) {
  if (!powod) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl border-[2px] border-[#DE3A22] w-full max-w-lg">
        <div className="px-5 py-4 border-b-[2px] border-[#DE3A22] flex items-center justify-between">
          <h3 className="font-['Archivo'] font-extrabold text-lg">
            Nie można wpisać zmiany
          </h3>
          <button onClick={onClose} className={btnSecondaryCls}>
            Zamknij
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[15px]">{powod.tekst}</p>
          {powod.podpowiedz && (
            <p className="text-[13px] text-[#6E6E66]">{powod.podpowiedz}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onNotify(powod)} className={btnSecondaryCls}>
              Napisz do pracownika
            </button>
            <button onClick={onClose} className={btnSecondaryCls}>
              Anuluj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GrafikZmianaModal({
  ctx,
  users,
  activeStanowiska,
  lokaleNames,
  absences,
  staffingRules,
  staffingRuleSets,
  grafikWyjatki,
  planShifts,
  onSave,
  onDelete,
  onClose,
}) {
  const [userId, setUserId] = useState(ctx.user?.id || null);
  const [stanowisko, setStanowisko] = useState(
    ctx.shift?.stanowisko || ctx.user?.default_stanowisko || ""
  );
  const [lokal, setLokal] = useState(ctx.shift?.lokal || ctx.lokal);
  const [start, setStart] = useState(trimTime(ctx.shift?.start_time) || "");
  const [end, setEnd] = useState(trimTime(ctx.shift?.end_time) || "");
  const [saving, setSaving] = useState(false);
  const [zrodloGodzin, setZrodloGodzin] = useState(null);

  const user = (users || []).find((u) => String(u.id) === String(userId)) || ctx.user;
  const rulesForDay = getRulesForDate(
    { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki },
    lokal,
    ctx.date
  );

  // Godziny podstawiamy ze standardu stanowiska, ale tylko dopóki kierownik
  // ich sam nie ruszył i tylko przy nowej zmianie — nadpisywanie ręcznie
  // wpisanych godzin przy każdej zmianie stanowiska byłoby wredne.
  useEffect(() => {
    if (ctx.shift) return;
    const domyslne = defaultHoursForStanowisko(rulesForDay, stanowisko);
    if (domyslne) {
      setStart(domyslne.start);
      setEnd(domyslne.end);
      setZrodloGodzin(`${stanowisko} (${domyslne.start}–${domyslne.end})`);
    } else {
      setZrodloGodzin(null);
    }
  }, [stanowisko, lokal]);

  // Osoby wolne tego dnia w tym lokalu — plus ta, która jest już wpisana,
  // żeby dało się edytować istniejącą zmianę bez znikania jej autora.
  const kandydaci = (users || [])
    .filter(
      (u) =>
        !u.archived &&
        u.active !== false &&
        u.role !== "kiosk" &&
        (u.default_lokal === lokal ||
          (planShifts || []).some(
            (s) => s.lokal === lokal && String(s.user_id) === String(u.id)
          ))
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));

  const stanowiskaLokalu = (activeStanowiska || []).filter((s) => s.lokal_name === lokal);
  const obceStanowisko = user && stanowisko && !knowsStanowisko(user, stanowisko);
  const wolneUzytkownika = user ? findBlockingAbsence(absences, user, ctx.date) : null;

  const zapisz = async (dodajNastepna) => {
    if (!user || !stanowisko || !start || !end) return;
    setSaving(true);
    const ok = await onSave({
      id: ctx.shift?.id || null,
      lokal,
      user_id: user.id,
      user_name: user.name,
      stanowisko,
      date: ctx.date,
      start_time: start,
      end_time: end,
      dodajNastepna,
    });
    setSaving(false);
    if (ok && dodajNastepna) {
      setUserId(null);
      setStanowisko("");
      setStart("");
      setEnd("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl border-[2px] border-[#171714] w-full max-w-2xl my-8">
        <div className="px-5 py-4 border-b-[2px] border-[#171714] flex items-start justify-between">
          <div>
            <div className={statLabelCls}>
              {ctx.shift ? "Edytuj zmianę" : "Przypisz zmianę"}
            </div>
            <h3 className="font-['Archivo'] font-extrabold text-xl">
              {fmtNaglowek(ctx.date)}
              {user ? ` · ${user.name}` : ""}
            </h3>
          </div>
          <button onClick={onClose} className={btnSecondaryCls}>
            Zamknij
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={statLabelCls}>Pracownik</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {kandydaci.map((u) => {
                const zajety = findBlockingAbsence(absences, u, ctx.date);
                const wybrany = String(u.id) === String(userId);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setUserId(u.id);
                      if (!ctx.shift && u.default_stanowisko) setStanowisko(u.default_stanowisko);
                    }}
                    className={`px-2.5 py-1.5 rounded border-[2px] text-[13px] font-bold ${
                      wybrany
                        ? "bg-[#171714] text-white border-[#171714]"
                        : "bg-white text-[#171714] border-[#B7B6AE] hover:border-[#171714]"
                    } ${zajety ? "opacity-50" : ""}`}
                    title={
                      zajety
                        ? zajety.type === "urlop"
                          ? "Ma urlop tego dnia"
                          : "Zgłosił brak dostępności"
                        : ""
                    }
                  >
                    {u.name}
                    {zajety ? " ·" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={statLabelCls}>Stanowisko na tę zmianę</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {stanowiskaLokalu.map((s) => {
                const wybrane = s.name === stanowisko;
                const style = stanowiskoBadgeStyle(activeStanowiska, lokal, s.name);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStanowisko(s.name)}
                    className={`px-2 py-1.5 rounded border-[2px] flex items-center gap-1.5 ${
                      wybrane ? "border-[#171714] bg-[#F1F1EE]" : "border-[#B7B6AE] bg-white"
                    }`}
                  >
                    <span
                      className="px-1.5 py-0.5 rounded text-[11px] font-extrabold"
                      style={style || { backgroundColor: "#E7E7E2", color: "#171714" }}
                    >
                      {stanowiskoShort(activeStanowiska, lokal, s.name)}
                    </span>
                    <span className="text-[13px] font-bold">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {obceStanowisko && (
            <div className="flex items-start gap-2 p-3 rounded border-[2px] border-[#DE3A22] bg-[#FAEAE6]">
              <AlertTriangle size={16} className="text-[#8A3A2B] flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-[#8A3A2B]">
                <strong>{user.name}</strong> nie ma zaznaczonego stanowiska{" "}
                <strong>{stanowisko}</strong> jako "umie pracować". Możesz wpisać tę
                zmianę mimo to — decyzja należy do Ciebie.
              </p>
            </div>
          )}

          {wolneUzytkownika && (
            <div className="flex items-start gap-2 p-3 rounded border-[2px] border-[#171714] bg-[#F1F1EE]">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <p className="text-[13px]">
                {wolneUzytkownika.type === "urlop"
                  ? "Ta osoba ma tego dnia zatwierdzony urlop."
                  : "Ta osoba zgłosiła na ten dzień brak dostępności."}{" "}
                Zapis zostanie zablokowany.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className={statLabelCls}>Od</label>
              <input
                type="time"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setZrodloGodzin(null);
                }}
                className="w-full p-2 border-[2px] border-[#171714] rounded"
              />
            </div>
            <div>
              <label className={statLabelCls}>Do</label>
              <input
                type="time"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setZrodloGodzin(null);
                }}
                className="w-full p-2 border-[2px] border-[#171714] rounded"
              />
            </div>
            <div>
              <label className={statLabelCls}>Lokal</label>
              <select
                value={lokal}
                onChange={(e) => setLokal(e.target.value)}
                className="w-full p-2 border-[2px] border-[#171714] rounded bg-white"
              >
                {lokaleNames.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-[12px] text-[#6E6E66]">
            {zrodloGodzin
              ? `Godziny podstawiono ze standardu stanowiska ${zrodloGodzin}. Możesz je nadpisać.`
              : "Brak wymagań obsady dla tego stanowiska w tym dniu — wpisz godziny ręcznie."}
            {end && start && end <= start
              ? " Godzina końca jest wcześniejsza niż początku — zmiana przez północ."
              : ""}
          </p>
        </div>

        <div className="px-5 py-4 border-t-[2px] border-[#171714] flex flex-wrap gap-2">
          <button
            onClick={() => zapisz(false)}
            disabled={saving || !user || !stanowisko || !start || !end}
            className={btnPrimaryCls}
          >
            {ctx.shift ? "Zapisz zmianę" : "Przypisz zmianę"}
          </button>
          {!ctx.shift && (
            <button
              onClick={() => zapisz(true)}
              disabled={saving || !user || !stanowisko || !start || !end}
              className={btnSecondaryCls}
            >
              Przypisz i dodaj następną
            </button>
          )}
          {ctx.shift && (
            <button
              onClick={() => onDelete(ctx.shift)}
              disabled={saving}
              className="ml-auto text-[#DE3A22] font-bold text-sm px-3 py-2.5 border-[2px] border-[#B7B6AE] rounded hover:border-[#DE3A22]"
            >
              <Trash2 size={15} className="inline -mt-0.5 mr-1" /> Usuń zmianę
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
