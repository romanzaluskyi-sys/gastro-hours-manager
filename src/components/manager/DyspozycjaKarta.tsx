// @ts-nocheck
// Dyspozycja w karcie pracownika (0.82.0, etap D4) — sekcja w Pracownicy.tsx.
// Kalendarz miesiąca: kierownik ustawia dzień PUSTY albo wpisany wcześniej
// przez kierownika. Dzień wpisany przez pracownika jest tylko do odczytu —
// zmienia go wyłącznie on, a kierownik może zapytać o jedną zmianę w Grafiku
// („Zapytaj”). Zapis i wiadomość: `ustawDzienZaPracownika` w utils/dyspozycja.ts.
//
// Komponent na poziomie modułu (błąd #10 w CLAUDE.md) — Pracownicy.tsx ma
// stan zmieniający się przy każdym wpisaniu litery w karcie.

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthName } from "../../utils/format";
import { dzienKrotki } from "../../utils/czas";
import { trimTime } from "../../utils/grafik";
import {
  bladGodzin,
  dniMiesiaca,
  dyspozycjaNa,
  godzinyTekst,
  miesiacDnia,
  moznaZmienicZaPracownika,
  niedostepnoscNa,
  opisDyspozycji,
  przesunMiesiac,
  urlopNa,
  ustawDzienZaPracownika,
  wpisMiesiaca,
  zmianaOpublikowanaNa,
} from "../../utils/dyspozycja";

const DNI = ["pn", "wt", "śr", "czw", "pt", "sob", "nd"];

// Te same kolory co ekran pracownika (DyspozycjaEkran.tsx).
const WYGLAD = {
  moge: "bg-[#E2F3E9] border-[#1F7A4A] text-[#14532D]",
  godziny: "bg-[#F3FAF6] border-[#1F7A4A] border-dashed text-[#14532D]",
  nie: "bg-[#DEDCD4] border-[#6E6E66] text-[#3A3A35]",
  urlop: "bg-[#E3EEFB] border-[#1D5FA8] border-dashed text-[#1D5FA8]",
  pusty: "bg-white border-[#DEDCD4] text-[#171714]",
};

const ddmm = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const btnCls =
  "min-h-[40px] px-3 rounded-lg border-[2px] text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed";

export default function DyspozycjaKarta({
  user,
  dzis,
  dyspozycja = [],
  setDyspozycja,
  miesiace = [],
  absences = [],
  planShifts = [],
  kierownik,
  showMsg,
}) {
  const [miesiac, setMiesiac] = useState(() => miesiacDnia(dzis));
  const [dzien, setDzien] = useState(null);
  const [godziny, setGodziny] = useState({ od1: "", do1: "" });
  const [zajety, setZajety] = useState(false);

  const minM = miesiacDnia(dzis);
  const maxM = przesunMiesiac(minM, 3);
  const wpisM = wpisMiesiaca(miesiace, user, miesiac);
  const dni = dniMiesiaca(miesiac);
  const pustych = (new Date(`${dni[0]}T00:00:00`).getDay() + 6) % 7;
  const wiersze = (dyspozycja || []).filter((w) => String(w.user_id) === String(user.id) && w.date.startsWith(miesiac.slice(0, 7)));
  const ostatni = [...wiersze].sort((a, b) => ((a.zmieniono_at || "") < (b.zmieniono_at || "") ? 1 : -1))[0];

  const stan = (d) => {
    const wpis = dyspozycjaNa(dyspozycja, user, d);
    const urlop = urlopNa(absences, user, d);
    const stara = !wpis && !urlop ? niedostepnoscNa(absences, user, d) : null;
    const klucz = urlop ? "urlop" : wpis ? wpis.stan : stara ? "nie" : "pusty";
    return { wpis, urlop, stara, klucz, zmiana: zmianaOpublikowanaNa(planShifts, user, d) };
  };

  const wybierz = (d) => {
    if (d < dzis) return;
    const s = stan(d);
    if (s.urlop) return showMsg?.(`${dzienKrotki(d)}: urlop — zmienia się go w sekcji „Urlop i dni wolne”.`, "error");
    if (!moznaZmienicZaPracownika(s.wpis)) {
      setDzien(null);
      return showMsg?.(`${dzienKrotki(d)}: wpisał pracownik — zmiana tylko przez „Zapytaj” w Grafiku.`, "error");
    }
    setDzien(d);
    setGodziny({ od1: trimTime(s.wpis?.od1) || "", do1: trimTime(s.wpis?.do1) || "" });
  };

  const zapisz = async (nowyStan) => {
    if (!dzien) return;
    if (nowyStan === "godziny") {
      const blad = bladGodzin({ od1: godziny.od1, do1: godziny.do1 });
      if (blad) return showMsg?.(blad, "error");
    }
    setZajety(true);
    try {
      const lista = await ustawDzienZaPracownika({
        user,
        dateStr: dzien,
        stan: nowyStan,
        godziny,
        dyspozycja,
        kierownik,
      });
      setDyspozycja && setDyspozycja(lista);
      showMsg?.(`${dzienKrotki(dzien)}: ${nowyStan ? "zapisano" : "wyczyszczono"} · ${user.name} dostał(a) wiadomość.`);
      setDzien(null);
    } catch (e) {
      showMsg?.(e.message || "Nie udało się zapisać.", "error");
    }
    setZajety(false);
  };

  const wybrany = dzien ? stan(dzien) : null;

  return (
    <div className="flex flex-col gap-3" data-dyspozycja-karta>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Poprzedni miesiąc"
          disabled={miesiac <= minM}
          onClick={() => setMiesiac(przesunMiesiac(miesiac, -1))}
          className="w-9 h-9 rounded-lg border-[2px] border-[#171714] grid place-items-center disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <b className="flex-1 text-center text-[15px] font-extrabold">
          {getMonthName(Number(miesiac.slice(5, 7)) - 1)} {miesiac.slice(0, 4)}
        </b>
        <button
          type="button"
          aria-label="Następny miesiąc"
          disabled={miesiac >= maxM}
          onClick={() => setMiesiac(przesunMiesiac(miesiac, 1))}
          className="w-9 h-9 rounded-lg border-[2px] border-[#171714] grid place-items-center disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <p className="text-[13px] text-[#6E6E66]" data-stan-wysylki-karta>
        {wpisM?.wyslano_at ? `Wysłał(a) ${ddmm(wpisM.wyslano_at)}` : "Jeszcze nie wysłano — szkic pracownika nie wiąże"}
        {ostatni?.zmieniono_at ? ` · ostatnio zmienił(a): ${ostatni.autor_name || (ostatni.autor === "kierownik" ? "kierownik" : user.name)}, ${ddmm(ostatni.zmieniono_at)}` : ""}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {DNI.map((n) => (
          <div key={n} className="text-center text-[11px] font-bold uppercase text-[#6E6E66]">
            {n}
          </div>
        ))}
        {Array.from({ length: pustych }, (_, i) => (
          <div key={`p${i}`} />
        ))}
        {dni.map((d) => {
          const s = stan(d);
          const pracownika = s.wpis && s.wpis.autor !== "kierownik";
          return (
            <button
              key={d}
              type="button"
              onClick={() => wybierz(d)}
              disabled={d < dzis}
              data-dzien-karty={d}
              data-stan={s.klucz}
              title={`${dzienKrotki(d)}: ${s.urlop ? "urlop" : s.stara ? "Nie mogę" : opisDyspozycji(s.wpis)}${pracownika ? " · wpisał pracownik" : ""}${s.zmiana ? " · zmiana w grafiku" : ""}`}
              className={`relative min-h-[44px] rounded-md border-[2px] px-1 pt-0.5 text-left flex flex-col ${WYGLAD[s.klucz]} ${
                d < dzis ? "opacity-35" : ""
              } ${dzien === d ? "ring-[3px] ring-[#DE3A22] ring-offset-1" : ""}`}
            >
              <span className="text-[13px] font-extrabold leading-none mt-0.5">{Number(d.slice(8, 10))}</span>
              {s.wpis?.stan === "godziny" && <span className="text-[9px] leading-[11px] font-bold">{godzinyTekst(s.wpis)}</span>}
              {(s.wpis?.autor === "kierownik" || s.stara) && (
                <span className="absolute top-0.5 right-1 text-[9px] font-extrabold">K</span>
              )}
              {s.zmiana && <span className="absolute bottom-0.5 right-1 w-1.5 h-1.5 rounded-full bg-[#171714]" />}
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-[#6E6E66]">
        K — wpisał kierownik · kropka — zmiana w grafiku. Dni wpisane przez pracownika zmienia tylko on.
      </p>
      {wybrany && (
        <div className="rounded-lg bg-[#F6F5F1] p-3 flex flex-col gap-2" data-edycja-dnia-karty={dzien}>
          <b className="text-[15px]">
            {dzienKrotki(dzien)} · teraz: {wybrany.stara ? "Nie mogę (stara niedostępność)" : opisDyspozycji(wybrany.wpis)}
          </b>
          {wybrany.zmiana && (
            <span className="text-[13px] text-[#8A5300]">
              Ma w grafiku zmianę {trimTime(wybrany.zmiana.start_time)}–{trimTime(wybrany.zmiana.end_time)} — grafik obowiązuje.
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={zajety} onClick={() => zapisz("moge")} className={`${btnCls} border-[#1F7A4A] bg-white`} data-karta-stan="moge">
              Może cały dzień
            </button>
            <button type="button" disabled={zajety} onClick={() => zapisz("nie")} className={`${btnCls} border-[#171714] bg-white`} data-karta-stan="nie">
              Nie może
            </button>
            {wybrany.wpis && (
              <button type="button" disabled={zajety} onClick={() => zapisz(null)} className={`${btnCls} border-[#DEDCD4] bg-white text-[#6E6E66]`} data-karta-stan="wyczysc">
                Wyczyść
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {[
              ["od1", "Od"],
              ["do1", "Do"],
            ].map(([k, t]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase text-[#6E6E66]">{t}</span>
                <input
                  type="time"
                  value={godziny[k]}
                  onChange={(e) => setGodziny((g) => ({ ...g, [k]: e.target.value }))}
                  className="h-10 px-2 rounded-lg border-[2px] border-[#171714] bg-white font-bold"
                  data-karta-godzina={k}
                />
              </label>
            ))}
            <button type="button" disabled={zajety} onClick={() => zapisz("godziny")} className={`${btnCls} border-[#1F7A4A] bg-white border-dashed`} data-karta-stan="godziny">
              Może w tych godzinach
            </button>
          </div>
          <span className="text-[12px] text-[#6E6E66]">Wpis kierownika wiąże od razu. {user.name} dostanie wiadomość.</span>
        </div>
      )}
    </div>
  );
}
