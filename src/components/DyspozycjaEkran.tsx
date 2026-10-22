// @ts-nocheck
// Ekran „Dyspozycja” pracownika (0.79.0, makieta EmployeeDispositionMobile /
// EmployeeDispositionTablet). Rama (Shell) zostaje w employeeSessionShared.tsx
// — tu jest tylko treść. Cała arytmetyka w utils/dyspozycja.ts.
//
// ⚠️ Komponent na poziomie modułu, nie w środku EmployeeSessionScreens: rama
// ma żywy zegar i przerysowuje się co sekundę — komponent zdefiniowany w
// środku gubiłby wpisane godziny i otwarty arkusz (błąd #10 w CLAUDE.md).
//
// Zapis idzie OD RAZU (zanim ktokolwiek naciśnie „Wyślij”) — tablet w kuchni
// gubi wi-fi, a dyspozycja na cały miesiąc to kilkanaście dotknięć. Przed
// wysłaniem miesiąca kierownik jej nie bierze pod uwagę (szkic).

import React, { useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Lock, Palmtree, Plus, RotateCcw, X } from "lucide-react";
import { getMonthName } from "../utils/format";
import { dzienKrotki } from "../utils/czas";
import { addDaysYMD, mondayOf, trimTime } from "../utils/grafik";
import {
  bladGodzin,
  dniMiesiaca,
  dniPozostale,
  dyspozycjaNa,
  dzienZablokowany,
  godzinyTekst,
  miesiacDnia,
  opisDyspozycji,
  podsumowanieMiesiaca,
  przesunMiesiac,
  urlopNa,
  wpisMiesiaca,
  wyslijMiesiac,
  zakresyCiagle,
  zapiszDni,
  zmianaOpublikowanaNa,
} from "../utils/dyspozycja";

const DNI_NAGLOWEK = ["pn", "wt", "śr", "czw", "pt", "sob", "nd"];

const nazwaMiesiaca = (miesiac) => getMonthName(Number(miesiac.slice(5, 7)) - 1).toLowerCase();
const dzienNr = (d) => Number(d.slice(8, 10));
const dataKrotka = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Wygląd komórki dnia — jedno miejsce dla kalendarza, widoku tygodnia i legendy.
const WYGLAD = {
  moge: "bg-[#E2F3E9] border-[#1F7A4A] text-[#14532D]",
  godziny: "bg-[#F3FAF6] border-[#1F7A4A] border-dashed text-[#14532D]",
  nie: "bg-[#DEDCD4] border-[#6E6E66] text-[#3A3A35]",
  urlop: "bg-[#E3EEFB] border-[#1D5FA8] border-dashed text-[#1D5FA8]",
  urlopOk: "bg-[#1D5FA8] border-[#1D5FA8] text-white",
  pusty: "bg-white border-[#DEDCD4] text-[#171714]",
};

const LEGENDA = [
  ["moge", "Mogę cały dzień"],
  ["godziny", "Mogę w godzinach"],
  ["nie", "Nie mogę"],
  ["pusty", "Bez zaznaczenia — wolne do planowania"],
  ["urlop", "Urlop · czeka na kierownika"],
  ["urlopOk", "Urlop · zatwierdzony"],
];

const PUSTY_FORMULARZ = { stan: null, od1: "", do1: "", od2: "", do2: "", drugi: false, notatka: "" };

export default function DyspozycjaEkran({
  employee,
  dzis,
  dyspozycja = [],
  setDyspozycja,
  miesiace = [],
  setMiesiace,
  absences = [],
  planShifts = [],
  moznaUrlop,
  onUrlop,
  showMsg,
  ktoWysyla,
}) {
  // Domyślnie następny miesiąc — dyspozycję składa się z wyprzedzeniem.
  const [miesiac, setMiesiac] = useState(() => przesunMiesiac(miesiacDnia(dzis), 1));
  const [widok, setWidok] = useState("miesiac");
  const [tydzien, setTydzien] = useState(() => mondayOf(dzis));
  const [wybor, setWybor] = useState(false);
  const [wybrane, setWybrane] = useState([]);
  const [arkusz, setArkusz] = useState(null); // { dni: [...] }
  const [form, setForm] = useState(PUSTY_FORMULARZ);
  const [wysylka, setWysylka] = useState(null); // { pozostale }
  const [powtorz, setPowtorz] = useState(false);
  const [zajety, setZajety] = useState(false);

  const minMiesiac = miesiacDnia(dzis);
  const maxMiesiac = przesunMiesiac(minMiesiac, 3);
  // Miesiąc, którego dotyczy pasek i „Wyślij” — w widoku tygodnia to miesiąc
  // jego czwartku (tydzień ISO), tak samo jak w Grafiku pracownika.
  const miesiacWidoku = widok === "miesiac" ? miesiac : miesiacDnia(addDaysYMD(tydzien, 3));
  const wpisM = wpisMiesiaca(miesiace, employee, miesiacWidoku);
  const wyslany = !!wpisM?.wyslano_at;

  const stanDnia = (d) => {
    const wpis = dyspozycjaNa(dyspozycja, employee, d);
    const urlop = urlopNa(absences, employee, d);
    const zmiana = zmianaOpublikowanaNa(planShifts, employee, d);
    const blokada = dzienZablokowany({ dateStr: d, dzis, planShifts, user: employee });
    const klucz = urlop ? (urlop.status === "approved" ? "urlopOk" : "urlop") : wpis ? wpis.stan : "pusty";
    return { wpis, urlop, zmiana, blokada, klucz };
  };

  const ustaw = (z) => setForm((f) => ({ ...f, ...z }));

  const otworzArkusz = (dni) => {
    const pierwszy = dni.length === 1 ? dyspozycjaNa(dyspozycja, employee, dni[0]) : null;
    setForm(
      pierwszy
        ? {
            stan: pierwszy.stan,
            od1: trimTime(pierwszy.od1),
            do1: trimTime(pierwszy.do1),
            od2: trimTime(pierwszy.od2),
            do2: trimTime(pierwszy.do2),
            drugi: !!pierwszy.od2,
            notatka: pierwszy.notatka || "",
          }
        : PUSTY_FORMULARZ
    );
    setArkusz({ dni: [...dni].sort() });
  };

  const dotknijDnia = (d) => {
    const s = stanDnia(d);
    if (s.blokada === "minął") return;
    if (s.blokada === "w grafiku") {
      showMsg(
        `Na ${dzienKrotki(d)} masz już zmianę w grafiku (${trimTime(s.zmiana.start_time)}–${trimTime(
          s.zmiana.end_time
        )}). Grafik obowiązuje — jeśli nie możesz przyjść, daj znać kierownikowi.`,
        "error"
      );
      return;
    }
    if (wybor) {
      setWybrane((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));
      return;
    }
    otworzArkusz([d]);
  };

  const zamknijArkusz = () => {
    setArkusz(null);
    setWybor(false);
    setWybrane([]);
  };

  const zapiszArkusz = async (wyczysc = false) => {
    if (!arkusz) return;
    const { dni } = arkusz;
    if (!wyczysc && !form.stan) return showMsg("Wybierz, czy możesz pracować.", "error");
    if (!wyczysc && form.stan === "godziny") {
      const blad = bladGodzin({ od1: form.od1, do1: form.do1, od2: form.drugi ? form.od2 : "", do2: form.drugi ? form.do2 : "" });
      if (blad) return showMsg(blad, "error");
    }
    setZajety(true);
    try {
      if (!wyczysc && form.stan === "urlop") {
        // Urlop to wniosek do kierownika (absences), po jednym na ciągły zakres.
        // Dyspozycję tych dni zdejmujemy, żeby dzień nie mówił dwóch rzeczy.
        const lista = await zapiszDni({ user: employee, dni, stan: null, dyspozycja });
        setDyspozycja(lista);
        for (const z of zakresyCiagle(dni)) await onUrlop({ od: z.od, do: z.do, note: form.notatka });
        showMsg("Wniosek o urlop wysłany · czeka na kierownika.");
      } else {
        const lista = await zapiszDni({
          user: employee,
          dni,
          stan: wyczysc ? null : form.stan,
          godziny: {
            od1: form.od1,
            do1: form.do1,
            od2: form.drugi ? form.od2 : "",
            do2: form.drugi ? form.do2 : "",
          },
          notatka: form.notatka,
          dyspozycja,
        });
        setDyspozycja(lista);
        showMsg(wyczysc ? "Zaznaczenie usunięte." : `Zapisano ${dni.length === 1 ? "dzień" : `${dni.length} dni`}.`);
      }
      zamknijArkusz();
    } catch (err) {
      showMsg(`Nie udało się zapisać: ${err.message || "nieznany błąd"}`, "error");
    }
    setZajety(false);
  };

  // „Powtórz ten tydzień na cały miesiąc” — kopiuje stan z dni wybranego
  // tygodnia na ten sam dzień tygodnia w reszcie miesiąca, TYLKO w puste dni.
  const tygodnieMiesiaca = (() => {
    const wynik = [];
    dniMiesiaca(miesiac).forEach((d) => {
      const pn = mondayOf(d);
      if (!wynik.includes(pn)) wynik.push(pn);
    });
    return wynik;
  })();
  const powtorzTydzien = async (pn) => {
    const wzor = {};
    for (let i = 0; i < 7; i++) {
      const d = addDaysYMD(pn, i);
      const w = dyspozycjaNa(dyspozycja, employee, d);
      if (w) wzor[new Date(`${d}T00:00:00`).getDay()] = w;
    }
    const cele = dniMiesiaca(miesiac).filter((d) => {
      const s = stanDnia(d);
      return mondayOf(d) !== pn && !s.blokada && !s.wpis && !s.urlop && wzor[new Date(`${d}T00:00:00`).getDay()];
    });
    if (cele.length === 0) {
      setPowtorz(false);
      return showMsg("Nie ma pustych dni do uzupełnienia.", "error");
    }
    setZajety(true);
    try {
      let lista = dyspozycja;
      for (const d of cele) {
        const w = wzor[new Date(`${d}T00:00:00`).getDay()];
        lista = await zapiszDni({
          user: employee,
          dni: [d],
          stan: w.stan,
          godziny: { od1: trimTime(w.od1), do1: trimTime(w.do1), od2: trimTime(w.od2), do2: trimTime(w.do2) },
          notatka: w.notatka,
          dyspozycja: lista,
        });
      }
      setDyspozycja(lista);
      showMsg(`Uzupełniono ${cele.length} dni.`);
    } catch (err) {
      showMsg(`Nie udało się zapisać: ${err.message || "nieznany błąd"}`, "error");
    }
    setZajety(false);
    setPowtorz(false);
  };

  const pozostale = dniPozostale({ miesiac: miesiacWidoku, dzis, user: employee, dyspozycja, absences, planShifts });
  const wyslij = async () => {
    setZajety(true);
    try {
      const wynik = await wyslijMiesiac({
        user: employee,
        miesiac: miesiacWidoku,
        pozostale: wysylka.pozostale,
        dzis,
        dyspozycja,
        miesiace,
        absences,
        planShifts,
        ktoWysyla,
      });
      setDyspozycja(wynik.dyspozycja);
      setMiesiace(wynik.miesiace);
      setWysylka(null);
      showMsg(`Dyspozycja na ${nazwaMiesiaca(miesiacWidoku)} wysłana.`);
    } catch (err) {
      showMsg(`Nie udało się wysłać: ${err.message || "nieznany błąd"}`, "error");
    }
    setZajety(false);
  };

  // ---------- kawałki ----------
  const komorka = (d) => {
    const s = stanDnia(d);
    const zaznaczony = wybrane.includes(d);
    const podpis = s.urlop
      ? "urlop"
      : s.wpis?.stan === "godziny"
      ? godzinyTekst(s.wpis)
      : s.wpis?.stan === "nie"
      ? "nie"
      : "";
    return (
      <button
        key={d}
        type="button"
        onClick={() => dotknijDnia(d)}
        disabled={s.blokada === "minął"}
        aria-pressed={zaznaczony}
        aria-label={`${dzienKrotki(d)}: ${s.urlop ? "urlop" : opisDyspozycji(s.wpis)}${s.zmiana ? ", zmiana w grafiku" : ""}`}
        data-dzien-dyspozycji={d}
        data-stan={s.klucz}
        className={`relative min-h-[54px] md:min-h-[72px] rounded-lg border-2 px-1 pt-1 pb-1 flex flex-col items-start text-left ${
          WYGLAD[s.klucz]
        } ${s.blokada === "minął" ? "opacity-35" : ""} ${zaznaczony ? "ring-[3px] ring-[#DE3A22] ring-offset-1" : ""}`}
      >
        <span className="text-[14px] md:text-[16px] font-extrabold leading-none">{dzienNr(d)}</span>
        {podpis && <span className="text-[10px] md:text-[12px] leading-[13px] font-bold mt-0.5 break-words">{podpis}</span>}
        {s.zmiana && (
          <span className="mt-auto inline-flex items-center gap-0.5 text-[10px] md:text-[12px] font-bold text-[#171714]">
            <Lock size={10} /> {trimTime(s.zmiana.start_time).replace(/:00$/, "")}
          </span>
        )}
        {s.wpis?.autor === "kierownik" && (
          <span className="absolute top-1 right-1 text-[9px] font-extrabold" title="wpisał kierownik">
            K
          </span>
        )}
      </button>
    );
  };

  const kalendarz = () => {
    const dni = dniMiesiaca(miesiac);
    const pierwszy = new Date(`${dni[0]}T00:00:00`).getDay();
    const pustych = (pierwszy + 6) % 7;
    return (
      <div className="grid grid-cols-7 gap-1 md:gap-1.5" role="grid" aria-label={`${nazwaMiesiaca(miesiac)} ${miesiac.slice(0, 4)}`}>
        {DNI_NAGLOWEK.map((n) => (
          <div key={n} className="text-center text-[12px] font-bold text-[#6E6E66] uppercase">
            {n}
          </div>
        ))}
        {Array.from({ length: pustych }, (_, i) => (
          <div key={`p${i}`} />
        ))}
        {dni.map(komorka)}
      </div>
    );
  };

  const listaTygodnia = () => (
    <div className="flex flex-col gap-1.5" data-tydzien-dyspozycji>
      {Array.from({ length: 7 }, (_, i) => addDaysYMD(tydzien, i)).map((d) => {
        const s = stanDnia(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => dotknijDnia(d)}
            disabled={s.blokada === "minął"}
            data-dzien-dyspozycji={d}
            data-stan={s.klucz}
            className={`flex items-center gap-3 min-h-[56px] px-3 rounded-lg border-2 text-left ${WYGLAD[s.klucz]} ${
              s.blokada === "minął" ? "opacity-35" : ""
            } ${wybrane.includes(d) ? "ring-[3px] ring-[#DE3A22] ring-offset-1" : ""}`}
          >
            <b className="w-[74px] text-[15px] font-extrabold">{dzienKrotki(d)}</b>
            <span className="flex-1 text-[15px] font-semibold">
              {s.urlop ? (s.urlop.status === "approved" ? "Urlop · zatwierdzony" : "Urlop · czeka") : opisDyspozycji(s.wpis)}
              {s.wpis?.autor === "kierownik" && <small className="block text-[12px] font-medium">wpisał kierownik</small>}
            </span>
            {s.zmiana && (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold">
                <Lock size={13} /> {trimTime(s.zmiana.start_time)}–{trimTime(s.zmiana.end_time)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const opcja = (stan, etykieta, podpis, extra) => (
    <div
      className={`rounded-lg border-2 ${form.stan === stan ? "border-[#171714] bg-[#F6F5F1]" : "border-[#DEDCD4] bg-white"}`}
      data-opcja-dyspozycji={stan}
    >
      <button
        type="button"
        onClick={() => ustaw({ stan })}
        aria-pressed={form.stan === stan}
        className="w-full min-h-[52px] flex items-center gap-3 px-3.5 text-left"
      >
        <span className={`w-5 h-5 rounded border-2 ${WYGLAD[stan === "urlop" ? "urlop" : stan]}`} />
        <span className="flex-1">
          <b className="text-[16px] font-extrabold text-[#171714]">{etykieta}</b>
          {podpis && <small className="block text-[13px] text-[#6E6E66]">{podpis}</small>}
        </span>
        {form.stan === stan && <Check size={18} />}
      </button>
      {form.stan === stan && extra}
    </div>
  );

  const poleCzasu = (etykieta, klucz) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[12px] font-bold uppercase text-[#6E6E66]">{etykieta}</span>
      <input
        type="time"
        value={form[klucz]}
        onChange={(e) => ustaw({ [klucz]: e.target.value })}
        className="h-11 px-2.5 rounded-lg border-2 border-[#171714] bg-white text-[17px] font-bold w-full"
        data-pole-dyspozycji={klucz}
      />
    </label>
  );

  const arkuszTresc = () => {
    if (!arkusz) return null;
    const { dni } = arkusz;
    const maWpis = dni.some((d) => dyspozycjaNa(dyspozycja, employee, d));
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end">
        <div className="absolute inset-0 bg-black/45" onClick={zamknijArkusz} />
        <div
          role="dialog"
          aria-label="Ustaw dyspozycję"
          data-arkusz-dyspozycji
          className="relative bg-white w-full md:w-[440px] max-h-[88vh] md:max-h-none overflow-y-auto rounded-t-[22px] md:rounded-none border-t-2 md:border-t-0 md:border-l-2 border-[#171714] px-4 pt-4 pb-6 flex flex-col gap-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <h3 className="font-['Archivo'] text-[21px] font-extrabold text-[#171714]">
                {dni.length <= 3 ? dni.map((d) => dzienKrotki(d)).join(", ") : `${dni.length} dni`}
              </h3>
              <span className="text-[14px] text-[#6E6E66]">
                {dni.length > 1 ? `${dni.length} dni · jeden stan dla wszystkich` : "Kiedy możesz pracować?"}
              </span>
            </div>
            <button type="button" onClick={zamknijArkusz} aria-label="Zamknij" className="p-1">
              <X size={22} />
            </button>
          </div>
          {opcja("moge", "Mogę cały dzień")}
          {opcja(
            "godziny",
            "Mogę w godzinach",
            null,
            <div className="px-3.5 pb-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {poleCzasu("Od", "od1")}
                {poleCzasu("Do", "do1")}
              </div>
              {form.drugi ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {poleCzasu("Od", "od2")}
                    {poleCzasu("Do", "do2")}
                  </div>
                  <button
                    type="button"
                    onClick={() => ustaw({ drugi: false, od2: "", do2: "" })}
                    className="self-start text-[14px] font-bold underline"
                  >
                    Usuń drugi przedział
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => ustaw({ drugi: true })} className="self-start text-[14px] font-bold underline inline-flex items-center gap-1">
                  <Plus size={14} /> drugi przedział
                </button>
              )}
            </div>
          )}
          {opcja("nie", "Nie mogę")}
          {moznaUrlop
            ? opcja("urlop", "Urlop", "wymaga zatwierdzenia kierownika · 8 h za dzień roboczy")
            : (
              <p className="text-[13px] text-[#1D5FA8] bg-[#E3EEFB] rounded-lg px-3 py-2" data-bez-urlopu>
                Umowa zlecenie — bez urlopu. Dni, w które Cię nie będzie, zaznacz jako „Nie mogę”.
              </p>
            )}
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold uppercase text-[#6E6E66]">Notatka · opcjonalnie</span>
            <input
              type="text"
              value={form.notatka}
              onChange={(e) => ustaw({ notatka: e.target.value })}
              placeholder="np. zajęcia na uczelni do 15:00"
              className="h-11 px-3 rounded-lg border-2 border-[#DEDCD4] focus:border-[#171714] outline-none text-[16px]"
            />
          </label>
          <div className="grid grid-cols-[1fr_1.4fr] gap-2 mt-1">
            <button type="button" onClick={zamknijArkusz} className="min-h-[52px] rounded-lg border-2 border-[#171714] font-extrabold">
              Anuluj
            </button>
            <button
              type="button"
              disabled={zajety || !form.stan}
              onClick={() => zapiszArkusz(false)}
              className="min-h-[52px] rounded-lg bg-[#DE3A22] text-white font-extrabold disabled:opacity-50"
              data-zapisz-dyspozycje
            >
              {form.stan === "urlop" ? "Wyślij wniosek" : `Zapisz ${dni.length === 1 ? "dzień" : `${dni.length} dni`}`}
            </button>
          </div>
          {maWpis && (
            <button
              type="button"
              disabled={zajety}
              onClick={() => zapiszArkusz(true)}
              className="self-center inline-flex items-center gap-1 text-[14px] font-bold text-[#6E6E66] underline"
              data-wyczysc-dyspozycje
            >
              <RotateCcw size={14} /> Wyczyść zaznaczenie
            </button>
          )}
        </div>
      </div>
    );
  };

  const wysylkaTresc = () => {
    if (!wysylka) return null;
    const p = podsumowanieMiesiaca({ miesiac: miesiacWidoku, user: employee, dyspozycja, absences });
    const kafel = (liczba, etykieta, pod, kolor) => (
      <div className={`rounded-lg px-2.5 py-2 flex flex-col ${kolor}`}>
        <b className="text-[24px] leading-7 font-extrabold tabular-nums">{liczba}</b>
        <span className="text-[13px] font-bold">{etykieta}</span>
        <span className="text-[12px] opacity-80">{pod}</span>
      </div>
    );
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
        <div className="absolute inset-0 bg-black/45" onClick={() => setWysylka(null)} />
        <div
          role="dialog"
          aria-label="Wyślij dyspozycję"
          data-wysylka-dyspozycji
          className="relative bg-white w-full md:max-w-[480px] max-h-[88vh] overflow-y-auto rounded-t-[22px] md:rounded-[22px] px-4 pt-4 pb-6 flex flex-col gap-3"
        >
          <h3 className="font-['Archivo'] text-[21px] font-extrabold text-[#171714]">Wysłać dyspozycję na {nazwaMiesiaca(miesiacWidoku)}?</h3>
          <span className="text-[14px] text-[#6E6E66] -mt-2">Kierownik zobaczy ją od razu. Zmienisz ją także później.</span>
          {pozostale.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[12px] font-bold uppercase text-[#6E6E66]">Pozostałe dni (nie zaznaczone) · {pozostale.length}</span>
              <span className="text-[13px] text-[#6E6E66] leading-[18px]">{pozostale.map((d) => dzienKrotki(d).split(" ")[0] + " " + dzienNr(d)).join(", ")}</span>
              {[
                ["bez", "Bez ograniczeń", "kierownik może planować Cię w te dni"],
                ["nie", "Nie mogę", "wpisze Cię tylko po pytaniu — na jeden dzień"],
              ].map(([k, t, pod]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setWysylka({ pozostale: k })}
                  aria-pressed={wysylka.pozostale === k}
                  data-pozostale={k}
                  className={`flex items-start gap-3 min-h-[52px] px-3.5 py-2.5 rounded-lg border-2 text-left ${
                    wysylka.pozostale === k ? "border-[#171714] bg-[#F6F5F1]" : "border-[#DEDCD4]"
                  }`}
                >
                  <span className={`mt-1 w-4 h-4 rounded-full border-2 border-[#171714] ${wysylka.pozostale === k ? "bg-[#171714]" : ""}`} />
                  <span>
                    <b className="text-[16px] font-extrabold">{t}</b>
                    <small className="block text-[13px] text-[#6E6E66]">{pod}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {kafel(p.moge, "dni mogę", `${p.cale} cały · ${p.wGodzinach} w godz.`, "bg-[#E2F3E9] text-[#14532D]")}
            {kafel(
              p.nie + (wysylka.pozostale === "nie" ? pozostale.length : 0),
              "dni nie mogę",
              wysylka.pozostale === "nie" ? `+ ${pozostale.length} z pozostałych` : "",
              "bg-[#ECEBE6] text-[#171714]"
            )}
            {kafel(p.urlop, "dni urlopu", "wnioski osobno", "bg-[#E3EEFB] text-[#1D5FA8]")}
          </div>
          <div className="grid grid-cols-[1fr_1.6fr] gap-2 mt-1">
            <button type="button" onClick={() => setWysylka(null)} className="min-h-[52px] rounded-lg border-2 border-[#171714] font-extrabold">
              Wróć
            </button>
            <button
              type="button"
              disabled={zajety}
              onClick={wyslij}
              className="min-h-[52px] rounded-lg bg-[#DE3A22] text-white font-extrabold disabled:opacity-50"
              data-wyslij-dyspozycje-tak
            >
              Wyślij dyspozycję
            </button>
          </div>
        </div>
      </div>
    );
  };

  const moje = (absences || [])
    .filter(
      (a) =>
        a.type === "urlop" &&
        (a.user_id ? String(a.user_id) === String(employee.id) : a.user_name === employee.name) &&
        a.end_date >= addDaysYMD(dzis, -30)
    )
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const TAG = {
    pending: ["czeka", "bg-[#E3EEFB] text-[#1D5FA8]"],
    approved: ["zatwierdzony", "bg-[#E2F3E9] text-[#1F7A4A]"],
    rejected: ["odrzucony", "bg-[#FBEAE6] text-[#B8321A]"],
  };

  return (
    <div className="w-full max-w-[760px] mx-auto flex flex-col gap-4" data-dyspozycja>
      {/* okres */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={widok === "miesiac" ? "Poprzedni miesiąc" : "Poprzedni tydzień"}
          disabled={widok === "miesiac" ? miesiac <= minMiesiac : tydzien <= mondayOf(dzis)}
          onClick={() => (widok === "miesiac" ? setMiesiac(przesunMiesiac(miesiac, -1)) : setTydzien(addDaysYMD(tydzien, -7)))}
          className="w-11 h-11 rounded-lg border-2 border-[#171714] bg-white grid place-items-center disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <b className="flex-1 text-center text-[19px] font-extrabold text-[#171714]" data-okres-dyspozycji>
          {widok === "miesiac"
            ? `${getMonthName(Number(miesiac.slice(5, 7)) - 1)} ${miesiac.slice(0, 4)}`
            : `${dzienKrotki(tydzien)} – ${dzienKrotki(addDaysYMD(tydzien, 6))}`}
        </b>
        <button
          type="button"
          aria-label={widok === "miesiac" ? "Następny miesiąc" : "Następny tydzień"}
          disabled={widok === "miesiac" ? miesiac >= maxMiesiac : addDaysYMD(tydzien, 7) > `${maxMiesiac.slice(0, 7)}-28`}
          onClick={() => (widok === "miesiac" ? setMiesiac(przesunMiesiac(miesiac, 1)) : setTydzien(addDaysYMD(tydzien, 7)))}
          className="w-11 h-11 rounded-lg border-2 border-[#171714] bg-white grid place-items-center disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-2 rounded-lg border-2 border-[#171714] overflow-hidden">
        {[
          ["miesiac", "Miesiąc"],
          ["tydzien", "Tydzień"],
        ].map(([k, t]) => (
          <button
            key={k}
            type="button"
            aria-pressed={widok === k}
            onClick={() => {
              if (k === "tydzien") {
                // Tydzień startuje w oglądanym miesiącu (albo od dziś).
                const start = miesiac > minMiesiac ? mondayOf(miesiac) : mondayOf(dzis);
                setTydzien(start < mondayOf(dzis) ? mondayOf(dzis) : start);
              } else setMiesiac(miesiacDnia(addDaysYMD(tydzien, 3)) < minMiesiac ? minMiesiac : miesiacDnia(addDaysYMD(tydzien, 3)));
              setWidok(k);
            }}
            className={`min-h-[44px] font-extrabold ${widok === k ? "bg-[#171714] text-white" : "bg-white text-[#171714]"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* pasek informacyjny — nie ostrzeżenie */}
      <div className="flex gap-2.5 items-start rounded-lg bg-[#ECEBE6] px-3.5 py-3" data-pasek-dyspozycji>
        <CalendarDays size={20} className="flex-none mt-0.5" />
        <div className="flex flex-col gap-0.5 text-[15px]">
          <span>
            <b>Dyspozycja na {nazwaMiesiaca(miesiacWidoku)}</b>
          </span>
          <span className="text-[14px] text-[#6E6E66]" data-stan-wysylki>
            {wyslany
              ? `Wysłano ${dataKrotka(wpisM.wyslano_at)} · zmiany zapisują się od razu`
              : "Jeszcze nie wysłano · zapisujemy na bieżąco, kierownik zobaczy po wysłaniu"}
          </span>
        </div>
      </div>

      {/* kalendarz */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold uppercase text-[#6E6E66]">Twoja dyspozycja</span>
          {!wybor ? (
            <button
              type="button"
              onClick={() => {
                setWybor(true);
                setWybrane([]);
              }}
              className="min-h-[40px] px-3 rounded-lg border-2 border-[#171714] bg-white text-[14px] font-extrabold"
              data-zaznacz-kilka
            >
              Zaznacz kilka dni
            </button>
          ) : null}
        </div>
        {wybor && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#171714] text-white" data-pasek-wyboru>
            <b>{wybrane.length === 0 ? "Dotknij dni" : `Wybrano ${wybrane.length} ${wybrane.length === 1 ? "dzień" : "dni"}`}</b>
            <span className="flex gap-2">
              <button type="button" onClick={zamknijArkusz} className="min-h-[36px] px-3 rounded-lg border-2 border-white text-[14px] font-bold">
                Anuluj
              </button>
              <button
                type="button"
                disabled={wybrane.length === 0}
                onClick={() => otworzArkusz(wybrane)}
                className="min-h-[36px] px-3 rounded-lg bg-white text-[#171714] text-[14px] font-extrabold disabled:opacity-40"
                data-gotowe-wybor
              >
                Gotowe
              </button>
            </span>
          </div>
        )}
        {!wybor && (
          <span className="text-[14px] text-[#6E6E66] leading-[19px]">
            Dotknij dnia, żeby ustawić, kiedy możesz. Dni bez zaznaczenia kierownik może planować.
          </span>
        )}
        {widok === "miesiac" ? kalendarz() : listaTygodnia()}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[#171714]">
          {LEGENDA.map(([k, t]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className={`w-3.5 h-3.5 rounded border-2 ${WYGLAD[k]}`} /> {t}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} /> zmiana w grafiku
          </span>
          <span className="inline-flex items-center gap-1.5">
            <b className="text-[11px]">K</b> wpisał kierownik
          </span>
        </div>
        {widok === "miesiac" && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPowtorz((v) => !v)}
              className="w-full flex items-center gap-2.5 min-h-[52px] px-3.5 rounded-lg border-2 border-[#171714] bg-white text-left"
              data-powtorz-tydzien
            >
              <RotateCcw size={18} />
              <span className="flex-1">
                <b className="text-[15px] font-extrabold">Powtórz tydzień na cały miesiąc</b>
                <small className="block text-[13px] text-[#6E6E66]">wybierz tydzień, uzupełni tylko puste dni</small>
              </span>
            </button>
            {powtorz && (
              <div className="flex flex-wrap gap-2" data-wybor-tygodnia>
                {tygodnieMiesiaca.map((pn) => (
                  <button
                    key={pn}
                    type="button"
                    disabled={zajety}
                    onClick={() => powtorzTydzien(pn)}
                    className="min-h-[40px] px-3 rounded-lg border-2 border-[#DEDCD4] bg-white text-[14px] font-bold hover:border-[#171714]"
                  >
                    {dzienKrotki(pn).split(" ")[1]}–{dzienKrotki(addDaysYMD(pn, 6)).split(" ")[1]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* wnioski urlopowe */}
      <section className="flex flex-col gap-2">
        <span className="text-[13px] font-bold uppercase text-[#6E6E66]">Moje wnioski</span>
        {moje.length === 0 ? (
          <span className="text-[14px] text-[#6E6E66]">
            Brak wniosków.{moznaUrlop ? " Urlop zaznaczysz w kalendarzu — trafi do kierownika do zatwierdzenia." : ""}
          </span>
        ) : (
          <div className="rounded-lg border-2 border-[#DEDCD4] bg-white divide-y-2 divide-[#ECEBE6]">
            {moje.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5" data-wniosek-urlop={a.id}>
                <Palmtree size={18} className="flex-none" />
                <span className="flex-1">
                  <b className="text-[15px]">
                    Urlop {a.start_date === a.end_date ? dzienKrotki(a.start_date) : `${dzienKrotki(a.start_date)} – ${dzienKrotki(a.end_date)}`}
                  </b>
                  {a.status !== "pending" && a.decided_by && (
                    <small className="block text-[13px] text-[#6E6E66]">
                      {a.status === "approved" ? "zatwierdził(a)" : "odrzucił(a)"} {a.decided_by}
                    </small>
                  )}
                </span>
                <span className={`text-[12px] font-extrabold px-2 py-1 rounded ${(TAG[a.status] || TAG.pending)[1]}`}>
                  {(TAG[a.status] || TAG.pending)[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {!wyslany ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setWysylka({ pozostale: "bez" })}
            className="w-full min-h-[58px] rounded-lg bg-[#DE3A22] text-white text-[18px] font-extrabold"
            data-wyslij-dyspozycje
          >
            Wyślij dyspozycję na {nazwaMiesiaca(miesiacWidoku)}
          </button>
          <span className="text-center text-[13px] text-[#6E6E66]">Możesz ją zmieniać także po wysłaniu.</span>
        </div>
      ) : (
        <p className="text-center text-[14px] text-[#1F7A4A] font-bold" data-dyspozycja-wyslana>
          <Check size={16} className="inline -mt-0.5" /> Dyspozycja wysłana. Każdą zmianę zapiszemy od razu.
        </p>
      )}

      {arkuszTresc()}
      {wysylkaTresc()}
    </div>
  );
}
