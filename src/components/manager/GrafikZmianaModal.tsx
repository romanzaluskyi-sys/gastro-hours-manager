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
import { AlertTriangle, Trash2, Plus } from "lucide-react";
import { btnPrimaryCls, btnSecondaryCls, statLabelCls } from "./designTokens";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import {
  trimTime,
  defaultHoursForStanowisko,
  getRulesForDate,
  knowsStanowisko,
  findBlockingAbsence,
  allowedStanowiskaArr,
} from "../../utils/grafik";

const DZIEN_PELNY = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

const fmtNaglowek = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  return `${DZIEN_PELNY[d.getDay()]} ${d.toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  })}`;
};

// Kafelek wyboru "stanowisko + lokal". Lokal dopisujemy tylko wtedy, gdy
// jest inny niż tabela, z której otwarto modal — inaczej byłby szumem przy
// każdym kafelku.
function ParaKafelek({ para, wybrana, obcyLokal, activeStanowiska, onClick }) {
  const style = stanowiskoBadgeStyle(activeStanowiska, para.lokal, para.stanowisko);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1.5 rounded border-[2px] flex items-center gap-1.5 ${
        wybrana ? "border-[#171714] bg-[#F1F1EE]" : "border-[#B7B6AE] bg-white"
      }`}
    >
      <span
        className="px-1.5 py-0.5 rounded text-[11px] font-extrabold"
        style={style || { backgroundColor: "#E7E7E2", color: "#171714" }}
      >
        {stanowiskoShort(activeStanowiska, para.lokal, para.stanowisko)}
      </span>
      <span className="text-[13px] font-bold">{para.stanowisko}</span>
      {obcyLokal && (
        <span className="text-[12px] font-normal text-[#8A3A2B]">· {para.lokal}</span>
      )}
    </button>
  );
}

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
  weekDays,
  onSave,
  onDelete,
  onAddStanowisko,
  onClose,
}) {
  // Otwarcie z nagłówka tabeli ("Dodaj pracownika") nie zna jeszcze dnia —
  // wtedy modal pokazuje wybór dnia z bieżącego tygodnia. Z komórki dzień
  // jest znany i pozostaje stały.
  const [date, setDate] = useState(ctx.date);
  const [userId, setUserId] = useState(ctx.user?.id || null);
  const [stanowisko, setStanowisko] = useState(
    ctx.shift?.stanowisko || ctx.user?.default_stanowisko || ""
  );
  const [lokal, setLokal] = useState(ctx.shift?.lokal || ctx.lokal);
  const [start, setStart] = useState(trimTime(ctx.shift?.start_time) || "");
  const [end, setEnd] = useState(trimTime(ctx.shift?.end_time) || "");
  const [saving, setSaving] = useState(false);
  const [dopisywanie, setDopisywanie] = useState(false);
  // Czy kierownik sam wskazał stanowisko. Jeśli tak, wybór osoby go już nie
  // nadpisuje — przy dobieraniu ludzi "po stanowisku" (osoba z innego lokalu
  // na Barmana) nadpisywanie kasowałoby właśnie to, co się wybrało.
  const [stanowiskoRuszone, setStanowiskoRuszone] = useState(false);
  const [pokazPozostale, setPokazPozostale] = useState(false);
  const [zrodloGodzin, setZrodloGodzin] = useState(null);

  const user = (users || []).find((u) => String(u.id) === String(userId)) || ctx.user;
  const rulesForDay = getRulesForDate(
    { rules: staffingRules, ruleSets: staffingRuleSets, wyjatki: grafikWyjatki },
    lokal,
    date
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
  }, [stanowisko, lokal, date]);

  // Osoby wolne tego dnia w tym lokalu — plus ta, która jest już wpisana,
  // żeby dało się edytować istniejącą zmianę bez znikania jej autora.
  // Zawsze cała sieć, swoi pierwsi. Wypożyczanie ludzi między lokalami to
  // u właściciela normalna praktyka, a nie wyjątek — ograniczanie listy do
  // stałej obsady lokalu tylko by przeszkadzało. Rozpoznanie "kto może"
  // idzie przez stanowisko, nie przez lokal.
  const kandydaci = (users || [])
    .filter((u) => !u.archived && u.active !== false && u.role !== "kiosk")
    .sort((a, b) => {
      const swoj = (u) => (u.default_lokal === lokal ? 0 : 1);
      if (swoj(a) !== swoj(b)) return swoj(a) - swoj(b);
      return a.name.localeCompare(b.name, "pl");
    });

  // Kafelek wyboru to para STANOWISKO + LOKAL, nie samo stanowisko. Dzięki
  // temu z grafiku lokalu 1 da się od razu oddać człowieka na jeden dzień do
  // lokalu 2 — bez przechodzenia na drugą zakładkę i szukania go tam.
  // Domyślnie pokazujemy WYŁĄCZNIE stanowiska z karty pracownika; resztę
  // trzeba rozwinąć świadomie (i wtedy dojdzie ostrzeżenie + "Dopisz").
  const znaneStanowiska = user ? allowedStanowiskaArr(user) : [];
  const wszystkieParty = [];
  (lokaleNames || []).forEach((l) => {
    (activeStanowiska || [])
      .filter((s) => s.lokal_name === l)
      .forEach((s) => {
        if (!wszystkieParty.some((p) => p.lokal === l && p.stanowisko === s.name)) {
          wszystkieParty.push({ lokal: l, stanowisko: s.name, id: `${l}|${s.name}` });
        }
      });
  });
  const sortujPary = (a, b) => {
    const domowy = (p) => (p.lokal === (user?.default_lokal || ctx.lokal) ? 0 : 1);
    if (domowy(a) !== domowy(b)) return domowy(a) - domowy(b);
    const glowne = (p) => (p.stanowisko === user?.default_stanowisko ? 0 : 1);
    if (glowne(a) !== glowne(b)) return glowne(a) - glowne(b);
    if (a.lokal !== b.lokal) return a.lokal.localeCompare(b.lokal, "pl");
    return a.stanowisko.localeCompare(b.stanowisko, "pl");
  };
  const paryZKarty = wszystkieParty
    .filter((p) => znaneStanowiska.includes(p.stanowisko))
    .sort(sortujPary);
  const paryPozostale = wszystkieParty
    .filter((p) => !znaneStanowiska.includes(p.stanowisko))
    .sort(sortujPary);
  const obceStanowisko = user && stanowisko && !knowsStanowisko(user, stanowisko);
  const wolneUzytkownika = user ? findBlockingAbsence(absences, user, date) : null;

  const zapisz = async (dodajNastepna) => {
    if (!user || !stanowisko || !start || !end) return;
    setSaving(true);
    const ok = await onSave({
      id: ctx.shift?.id || null,
      lokal,
      user_id: user.id,
      user_name: user.name,
      stanowisko,
      date,
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
              {fmtNaglowek(date)}
              {user ? ` · ${user.name}` : " · wybierz osobę"}
            </h3>
          </div>
          <button onClick={onClose} className={btnSecondaryCls}>
            Zamknij
          </button>
        </div>

        <div className="p-5 space-y-4">
          {ctx.pickDate && (
            <div>
              <label className={statLabelCls}>Dzień</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(weekDays || []).map((d) => {
                  const wybrany = d === date;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDate(d)}
                      className={`px-2.5 py-1.5 rounded border-[2px] text-[13px] font-bold ${
                        wybrany
                          ? "bg-[#171714] text-white border-[#171714]"
                          : "bg-white text-[#171714] border-[#B7B6AE] hover:border-[#171714]"
                      }`}
                    >
                      {fmtNaglowek(d)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className={statLabelCls}>Pracownik</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {kandydaci.map((u) => {
                const zajety = findBlockingAbsence(absences, u, date);
                const wybrany = String(u.id) === String(userId);
                const umie = !stanowisko || knowsStanowisko(u, stanowisko);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setUserId(u.id);
                      if (!ctx.shift && !stanowiskoRuszone) {
                        if (u.default_stanowisko) setStanowisko(u.default_stanowisko);
                        setLokal(ctx.lokal);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded border-[2px] text-[13px] font-bold ${
                      wybrany
                        ? "bg-[#171714] text-white border-[#171714]"
                        : "bg-white text-[#171714] border-[#B7B6AE] hover:border-[#171714]"
                    } ${zajety || !umie ? "opacity-50" : ""}`}
                    title={
                      zajety
                        ? zajety.type === "urlop"
                          ? "Ma urlop tego dnia"
                          : "Zgłosił brak dostępności"
                        : !umie
                        ? `Nie ma zaznaczonego stanowiska ${stanowisko}`
                        : ""
                    }
                  >
                    {u.name}
                    {u.default_lokal !== lokal && (
                      <span className="font-normal opacity-70"> · {u.default_lokal}</span>
                    )}
                    {zajety ? " ·" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={statLabelCls}>Stanowisko i lokal na tę zmianę</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {paryZKarty.length === 0 && (
                <p className="text-[13px] text-[#6E6E66]">
                  {user
                    ? `${user.name} nie ma jeszcze ustawionych stanowisk — rozwiń "Pozostałe stanowiska" poniżej.`
                    : "Najpierw wybierz pracownika."}
                </p>
              )}
              {paryZKarty.map((p) => (
                <ParaKafelek
                  key={p.id}
                  para={p}
                  wybrana={p.stanowisko === stanowisko && p.lokal === lokal}
                  obcyLokal={p.lokal !== ctx.lokal}
                  activeStanowiska={activeStanowiska}
                  onClick={() => {
                    setStanowisko(p.stanowisko);
                    setLokal(p.lokal);
                    setStanowiskoRuszone(true);
                  }}
                />
              ))}
            </div>

            {paryPozostale.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setPokazPozostale((v) => !v)}
                  className="text-[12px] font-bold underline text-[#6E6E66]"
                >
                  {pokazPozostale ? "Ukryj" : "Pozostałe stanowiska"} ({paryPozostale.length})
                </button>
                {pokazPozostale && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 opacity-70">
                    {paryPozostale.map((p) => (
                      <ParaKafelek
                        key={p.id}
                        para={p}
                        wybrana={p.stanowisko === stanowisko && p.lokal === lokal}
                        obcyLokal={p.lokal !== ctx.lokal}
                        activeStanowiska={activeStanowiska}
                        onClick={() => {
                          setStanowisko(p.stanowisko);
                          setLokal(p.lokal);
                          setStanowiskoRuszone(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {lokal !== ctx.lokal && (
              <p className="mt-2 text-[13px] font-bold text-[#8A3A2B] bg-[#FAEAE6] border-[2px] border-[#DE3A22] rounded px-3 py-2">
                Ta zmiana trafi do lokalu <strong>{lokal}</strong>. W grafiku{" "}
                {ctx.lokal} pojawi się jako "w {lokal}".
              </p>
            )}
          </div>

          {obceStanowisko && (
            <div className="flex items-start gap-2 p-3 rounded border-[2px] border-[#DE3A22] bg-[#FAEAE6]">
              <AlertTriangle size={16} className="text-[#8A3A2B] flex-shrink-0 mt-0.5" />
              <div className="text-[13px] text-[#8A3A2B]">
                <p>
                  <strong>{user.name}</strong> nie ma zaznaczonego stanowiska{" "}
                  <strong>{stanowisko}</strong> jako "umie pracować". Możesz wpisać tę
                  zmianę mimo to — decyzja należy do Ciebie.
                </p>
                <button
                  type="button"
                  disabled={dopisywanie}
                  onClick={async () => {
                    setDopisywanie(true);
                    await onAddStanowisko(user, stanowisko);
                    setDopisywanie(false);
                  }}
                  className="mt-2 px-2.5 py-1.5 rounded border-[2px] border-[#8A3A2B] text-[#8A3A2B] text-[12px] font-bold hover:bg-white disabled:opacity-50"
                >
                  <Plus size={13} className="inline -mt-0.5 mr-1" />
                  Dopisz {stanowisko} do umiejętności {user.name}
                </button>
              </div>
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

          <div className="grid md:grid-cols-2 gap-3">
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
