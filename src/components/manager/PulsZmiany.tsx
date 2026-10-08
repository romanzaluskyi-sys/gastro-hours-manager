// @ts-nocheck
// Zamknięcie dnia przez osobę z prawem `puls_do`, na Tablecie Służbowym albo
// prywatnym telefonie. Układ z makiety właściciela (0.73.0,
// EmployeeCloseDayMobile / EmployeeCloseDayTablet).
//
// To nie jest okrojona karta dnia — to inny ekran dla innej roli: tylko pola
// do wpisania. Bez warstwy automatycznej (godziny, koszt pracy, obsada,
// zadania), bez kosztów i stawek, bez prognozy, historii i innych lokali.
// Stąd „Coś nietypowego dziś?” zamiast „Powód odchylenia” — bez prognozy nie
// ma od czego się odchylać.
//
// Rzeczy, których nie widać:
// - Utarg, paragony, chip i notatka zapisują się SAME (po opuszczeniu pola /
//   dotknięciu chipu), KOLEJKĄ — pierwszy zapis zakłada kartę, dwa równoległe
//   założyłyby dwie. Ten sam mechanizm co w KartaDnia.tsx.
// - Wpis dnia powstaje dopiero przyciskiem „Zapisz” przy wpisie. Zapis to NOWY
//   wiersz `day_log_entries`, a jego zmiana to poprawka z powodem — zapis przy
//   każdym dotknięciu − / + zostawiłby w dzienniku HACCP serię poprawek.
//   Zapisanego wpisu pracownik nie zmienia; poprawia kierownik.
// - Pomiar poza normą wymaga „Co zrobiono?” (`_dzialanie` w payloadzie) — bez
//   tego nie da się go zapisać. „Dziś nie było dostawy” to wpis z `_brak`.
// - Pola liczbowe i tak/nie są wymagane, tekstowe („Uwagi”) nie — chyba że
//   wpis nie ma innych pól.
// - „Zamknij dzień” jest nieaktywny, dopóki brakuje utargu, OBOWIĄZKOWYCH
//   wpisów (`wymagany !== false`) albo coś wpisano i nie zapisano — przycisk
//   mówi, czego brakuje. Potem pyta drugi raz: zamkniętego dnia nie otwieramy.
//
// Prawo jest na czas (`users.puls_do`), więc wygasa samo. Zamknięcie idzie do
// kierownika lokalu jako powiadomienie. Ekran pobiera własne dane zamiast brać
// je przez propsy z App — patrz CLAUDE.md, błąd #16. Ramę (Shell z nagłówkiem
// i stopką) podaje rodzic przez `rama(tresc, stopka)`.
import React, { useEffect, useRef, useState } from "react";
import {
  Lock,
  Plus,
  Minus,
  Check,
  X,
  AlertTriangle,
  Thermometer,
  Truck,
  Sparkles,
  FileText,
  StickyNote,
} from "lucide-react";
import { api } from "../../api/supabase";
import { createManagerNotification } from "../../api/notifications";
import {
  znajdzKarte,
  wpisyDlaDnia,
  szablonyNaDzien,
  polaSzablonu,
  opisNormy,
  pozaNorma,
  zapiszKarte,
  zamknijDzien,
  zapiszWpis,
  opisPoprawki,
  czyZdarzenie,
  wartosciWpisu,
  KLUCZ_DZIALANIA,
  KLUCZ_BRAKU,
  KATEGORIE_ZDARZENIA,
  toLocalYMD,
} from "../../utils/dziennik";
import { pozaNormaPola } from "../../utils/pola";
import { liczbaZ, zl, godzTxt, dzienTxt } from "./pulsWspolne";
import SladPoprawki from "./SladPoprawki";
import ZdarzenieModal from "./ZdarzenieModal";

// Prawo obowiązuje do końca dnia zapisanego w users.puls_do włącznie.
export const mozeZamykacPuls = (user) =>
  !!(user && user.puls_do && user.puls_do >= toLocalYMD(new Date()));

// Chipy „Coś nietypowego dziś?” — klucze to słownik `day_logs.obrot_powod`
// (POWODY_UTARGU), etykiety mówią językiem sali.
const NIETYPOWE = [
  { key: "pogoda", label: "Pogoda" },
  { key: "wydarzenie", label: "Impreza obok" },
  { key: "awaria", label: "Awaria" },
  { key: "personel", label: "Mało ludzi" },
  { key: "inne", label: "Inne" },
];

const GRUPY = [
  { typy: ["temperatura"], nazwa: "Temperatury", Ikona: Thermometer },
  { typy: ["dostawa"], nazwa: "Dostawa", Ikona: Truck },
  { typy: ["sprzatanie"], nazwa: "Na koniec dnia", Ikona: Sparkles },
];

const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl p-4 md:p-5";
const inputPoleCls =
  "w-full h-12 border-[2px] border-[#171714] rounded-lg bg-white px-3 text-[16px] text-[#171714] placeholder:text-[#B5B3AA]";
const etykCls = "block text-[14px] font-bold text-[#171714] mb-1.5";
const optCls = "font-normal text-[#8F8E86]";
const chipCls = (on) =>
  `inline-flex items-center gap-1 h-10 px-3.5 rounded-full border-[2px] text-[14px] font-bold whitespace-nowrap ${
    on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714]"
  }`;
const wyborCls = (on, ton) =>
  `flex-1 min-w-[120px] h-12 rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] inline-flex items-center justify-center gap-1.5 ${
    on
      ? ton === "zly"
        ? "bg-[#DE3A22] border-[#DE3A22] text-white"
        : "bg-[#171714] border-[#171714] text-white"
      : "bg-white border-[#171714] text-[#171714]"
  }`;

function Sekcja({ nr, gotowe, tytul, prawo, children, id }) {
  return (
    <section className={kartaCls} data-sekcja-zamkniecia={id}>
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className={`w-8 h-8 rounded-full grid place-items-center font-['Archivo'] font-extrabold text-[15px] flex-shrink-0 ${
            gotowe ? "bg-[#1F7A4A] text-white" : "bg-[#171714] text-white"
          }`}
        >
          {gotowe ? <Check size={17} strokeWidth={3} /> : nr}
        </span>
        <h2 className="font-['Archivo'] font-extrabold text-[20px] text-[#171714] m-0">{tytul}</h2>
        {prawo && <span className="ml-auto text-[13px] text-[#6E6E66]">{prawo}</span>}
      </div>
      {children}
    </section>
  );
}

// Które pola wpisu trzeba wypełnić, żeby dało się go zapisać.
const wymaganePola = (pola) => {
  const twarde = pola.filter((p) => p.typ === "number" || p.typ === "bool");
  return twarde.length ? twarde : pola;
};
const pusta = (v) => v === undefined || v === null || String(v).trim() === "";

export default function PulsZmiany({
  currentUser,
  lokal,
  showMsg,
  rama,
  osobyNaZmianie = [],
  onPoprawka = null,
  onWroc = null,
}) {
  const dzis = toLocalYMD(new Date());
  const [karty, setKarty] = useState([]);
  const [wpisy, setWpisy] = useState([]);
  const [szablony, setSzablony] = useState([]);
  const [laduje, setLaduje] = useState(true);
  const [form, setForm] = useState({});
  const [szkice, setSzkice] = useState({}); // { klucz_szablonu: { pole: wartosc, _dzialanie } }
  const [zapisujeWpis, setZapisujeWpis] = useState(null);
  const [zdarzenie, setZdarzenie] = useState(false);
  const [potwierdz, setPotwierdz] = useState(false);
  const [zamyka, setZamyka] = useState(false);

  const odswiez = async () => {
    const [k, w, s] = await Promise.all([
      api.get("day_logs", `lokal=eq.${encodeURIComponent(lokal)}&date=eq.${dzis}`),
      api.get("day_log_entries", `lokal=eq.${encodeURIComponent(lokal)}&date=eq.${dzis}`),
      api.get("day_log_templates", `lokal=eq.${encodeURIComponent(lokal)}`),
    ]);
    setKarty(Array.isArray(k) ? k : []);
    setWpisy(Array.isArray(w) ? w : []);
    setSzablony(Array.isArray(s) ? s : []);
  };

  useEffect(() => {
    odswiez()
      .catch((e) => showMsg(e.message || "Nie udało się pobrać dziennika", "error"))
      .finally(() => setLaduje(false));
  }, [lokal]);

  const karta = znajdzKarte(karty, lokal, dzis);
  const zamkniety = karta && karta.status === "zamkniety";
  const pole = (k) => (form[k] !== undefined ? form[k] : karta && karta[k] != null ? String(karta[k]) : "");
  const ustaw = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // --- kolejka zapisów karty (patrz nagłówek) ------------------------------
  const kartaRef = useRef(karta);
  const kartyRef = useRef(karty);
  kartyRef.current = karty;
  if (!kartaRef.current || (karta && kartaRef.current.id === karta.id)) kartaRef.current = karta;
  const kolejka = useRef(Promise.resolve());

  const zapiszWKolejce = (zmiany) => {
    kolejka.current = kolejka.current
      .then(async () => {
        kartaRef.current = await zapiszKarte({
          karta: kartaRef.current,
          lokal,
          dateStr: dzis,
          pola: zmiany,
          dayLogs: kartyRef.current,
          setDayLogs: (lista) => {
            kartyRef.current = lista;
            setKarty(lista);
          },
        });
      })
      .catch((e) => showMsg(e.message || "Błąd zapisu", "error"));
    return kolejka.current;
  };

  const NUMERYCZNE = ["obrot", "liczba_paragonow"];
  const zapiszPole = (k, wartosc) => {
    if (zamkniety) return;
    const v = wartosc !== undefined ? wartosc : pole(k);
    const nowa = NUMERYCZNE.includes(k) ? liczbaZ(v) : String(v ?? "").trim() || null;
    const stara = karta ? karta[k] ?? null : null;
    if (String(nowa ?? "") === String(stara ?? "")) return;
    zapiszWKolejce({ [k]: nowa });
  };

  // --- wpisy dnia --------------------------------------------------------
  const naDzis = szablonyNaDzien(szablony, lokal, dzis);
  const wpisyDnia = wpisyDlaDnia(wpisy, lokal, dzis);
  const wpisDla = (klucz) => wpisyDnia.find((w) => w.template_key === klucz);
  const zdarzenia = wpisyDnia.filter(czyZdarzenie);

  const szkic = (s) => szkice[s.klucz] || {};
  const ustawSzkic = (s, k, v) => setSzkice((x) => ({ ...x, [s.klucz]: { ...(x[s.klucz] || {}), [k]: v } }));
  const payloadSzkicu = (s) => {
    const sz = szkic(s);
    const payload = {};
    polaSzablonu(s).forEach((p) => {
      const v = sz[p.klucz];
      payload[p.klucz] =
        p.typ === "bool" ? v === true : p.typ === "number" ? String(v ?? "").replace(",", ".").trim() : String(v ?? "").trim();
    });
    return payload;
  };
  const maCos = (s) => Object.values(szkic(s)).some((v) => !pusta(v));
  // 'pusty' | 'todo' | 'ok' | 'zly' (poza normą)
  const stanSzkicu = (s) => {
    const pola = polaSzablonu(s);
    const sz = szkic(s);
    if (!maCos(s)) return "pusty";
    if (wymaganePola(pola).some((p) => pusta(sz[p.klucz]))) return "todo";
    return pozaNormaPola(pola, payloadSzkicu(s)) ? "zly" : "ok";
  };
  const gotowyDoZapisu = (s) => {
    const st = stanSzkicu(s);
    return st === "ok" || (st === "zly" && !pusta(szkic(s)[KLUCZ_DZIALANIA]));
  };

  const zapiszWpisDnia = async (s, payload) => {
    setZapisujeWpis(s.klucz);
    try {
      await kolejka.current;
      await zapiszWpis({
        lokal, dateStr: dzis, karta: kartaRef.current, typ: s.typ, templateKey: s.klucz, payload,
        kto: currentUser.name, entries: wpisy, setEntries: setWpisy,
      });
      setSzkice((x) => {
        const n = { ...x };
        delete n[s.klucz];
        return n;
      });
      await odswiez();
    } catch (e) {
      showMsg(e.message || "Błąd zapisu wpisu", "error");
    }
    setZapisujeWpis(null);
  };
  const zapiszZeSzkicu = (s) => {
    if (!gotowyDoZapisu(s)) return;
    const payload = payloadSzkicu(s);
    if (stanSzkicu(s) === "zly") payload[KLUCZ_DZIALANIA] = String(szkic(s)[KLUCZ_DZIALANIA]).trim();
    zapiszWpisDnia(s, payload);
  };

  const dodajZdarzenie = async (typ, templateKey, payload) => {
    try {
      await kolejka.current;
      await zapiszWpis({
        lokal, dateStr: dzis, karta: kartaRef.current, typ, templateKey, payload,
        kto: currentUser.name, entries: wpisy, setEntries: setWpisy,
      });
      if (payload.wymaga_prowadzenia) {
        const kat = (KATEGORIE_ZDARZENIA.find((k) => k.key === payload.kategoria) || {}).label || "Zdarzenie";
        const opis = String(payload.opis || "").trim();
        await createManagerNotification(
          lokal,
          `${kat} — ${currentUser.name} przekazuje do wyjaśnienia: ${opis.length > 140 ? opis.slice(0, 140) + "…" : opis}`,
          "puls"
        ).catch(() => {});
      }
      await odswiez();
      setZdarzenie(false);
      showMsg("Zdarzenie zapisane", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
  };

  // --- postęp i zamknięcie -----------------------------------------------
  const obrot = liczbaZ(pole("obrot"));
  const zapisane = naDzis.filter((s) => wpisDla(s.klucz)).length;
  const razem = naDzis.length + 1;
  const zrobione = zapisane + (obrot != null ? 1 : 0);
  const wymaganeBrak = naDzis.filter((s) => s.wymagany !== false && !wpisDla(s.klucz)).length;
  const niezapisane = naDzis.filter((s) => !wpisDla(s.klucz) && maCos(s)).length;
  const brakuje = [
    obrot == null ? "utarg" : null,
    wymaganeBrak ? `${wymaganeBrak} ${wymaganeBrak === 1 ? "wpis" : wymaganeBrak < 5 ? "wpisy" : "wpisów"}` : null,
    niezapisane ? `${niezapisane} niezapisane` : null,
  ].filter(Boolean);

  const zamknij = async () => {
    setZamyka(true);
    try {
      await kolejka.current;
      const pola = {
        obrot,
        liczba_paragonow: liczbaZ(pole("liczba_paragonow")),
        obrot_powod: pole("obrot_powod") || null,
        obrot_komentarz: pole("obrot_komentarz").trim() || null,
        handover: pole("handover").trim() || null,
      };
      await zamknijDzien({
        karta: kartaRef.current, lokal, dateStr: dzis, pola, kto: currentUser.name,
        dayLogs: kartyRef.current, setDayLogs: setKarty,
      });
      // Kierownik lokalu ma się dowiedzieć od razu — to on odpowiada za dzień,
      // nawet jeśli zamknął go ktoś inny. Strona bierna: bez odmiany przez rodzaj.
      await createManagerNotification(
        lokal,
        `Puls za ${dzis.split("-").reverse().join(".")} zamknięty przez ${currentUser.name}` +
          (obrot != null ? ` · utarg ${obrot} zł` : ""),
        "puls"
      ).catch(() => {});
      await odswiez();
      setForm({});
      setPotwierdz(false);
      showMsg("Dzień zamknięty", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zamknięcia dnia", "error");
    }
    setZamyka(false);
  };

  if (laduje) return rama(<div className="p-4 text-[15px] text-[#6E6E66]">Ładowanie…</div>, null);

  const dataTxt = dzienTxt(dzis);

  // --- dzień zamknięty ---------------------------------------------------
  if (zamkniety) {
    const pozaNormaWpisy = naDzis.filter((s) => {
      const w = wpisDla(s.klucz);
      return w && pozaNorma(s, w.payload);
    });
    const zOpisem = pozaNormaWpisy.every((s) => !pusta(wpisDla(s.klucz).payload?.[KLUCZ_DZIALANIA]));
    const kafel = (etykieta, wartosc, ostrzezenie) => (
      <div className="bg-[#F6F5F1] rounded-lg px-3.5 py-3">
        <span className="block text-[13px] text-[#6E6E66]">{etykieta}</span>
        <b className={`block font-['Archivo'] text-[19px] tabular-nums ${ostrzezenie ? "text-[#B8321A]" : "text-[#171714]"}`}>{wartosc}</b>
      </div>
    );
    return rama(
      <div className="max-w-[560px] w-full mx-auto flex flex-col items-center text-center pt-4" data-dzien-zamkniety>
        <span className="w-16 h-16 rounded-full bg-[#1F7A4A] text-white grid place-items-center">
          <Check size={34} strokeWidth={3} />
        </span>
        <h2 className="font-['Archivo'] font-extrabold text-[26px] text-[#171714] mt-3 mb-1">Dzień zamknięty</h2>
        <p className="text-[15px] text-[#6E6E66] m-0">
          {dataTxt} · {lokal} · zamknięte przez {karta.closed_by || "—"}
          {karta.closed_at ? ` o ${godzTxt(karta.closed_at)}` : ""}
        </p>
        <div className="grid grid-cols-2 gap-2.5 w-full mt-5 text-left">
          {kafel("Utarg", karta.obrot != null ? zl(Number(karta.obrot)) : "—")}
          {kafel("Wpisy", `${zapisane} z ${naDzis.length}`)}
          {kafel(
            "Poza normą",
            pozaNormaWpisy.length ? `${pozaNormaWpisy.length}${zOpisem ? " · z opisem" : ""}` : "0",
            pozaNormaWpisy.length > 0
          )}
          {kafel("Zdarzenia", zdarzenia.length)}
        </div>
        <p className="flex items-start gap-2 text-left text-[14px] text-[#3A3A35] bg-white border-[2px] border-[#DEDCD4] rounded-lg px-3.5 py-3 mt-4 w-full">
          <Lock size={17} className="flex-shrink-0 mt-0.5" />
          Zapisanych danych nie można zmienić. Jeśli coś się nie zgadza, wyślij poprawkę — kierownik ją zobaczy.
        </p>
        <div className="flex flex-col gap-2.5 w-full mt-4">
          {onPoprawka && (
            <button
              type="button"
              className="h-12 rounded-lg border-[2px] border-[#171714] bg-white font-['Archivo'] font-bold text-[16px]"
              onClick={() => onPoprawka(`Zamknięcie dnia ${dataTxt} (${lokal}) — poprawka: `)}
              data-wyslij-poprawke
            >
              Wyślij poprawkę
            </button>
          )}
          {onWroc && (
            <button
              type="button"
              className="h-12 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[16px]"
              onClick={onWroc.onClick}
            >
              {onWroc.label}
            </button>
          )}
        </div>
      </div>,
      null
    );
  }

  // --- formularz ---------------------------------------------------------
  const gotowyUtarg = obrot != null;
  const sekcjaUtarg = (
    <Sekcja nr="1" gotowe={gotowyUtarg} tytul="Utarg" id="utarg">
      <label className="block">
        <span className={etykCls}>Utarg brutto z kasy</span>
        <span className="relative block">
          <input
            className="w-full h-16 border-[2px] border-[#171714] rounded-lg bg-white pl-4 pr-14 font-['Archivo'] font-extrabold text-[38px] leading-none tabular-nums text-[#171714] placeholder:text-[#C9C6BD]"
            inputMode="decimal"
            placeholder="0"
            value={pole("obrot")}
            onChange={(e) => ustaw("obrot", e.target.value)}
            onBlur={() => zapiszPole("obrot")}
            data-pole-utarg
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-['Archivo'] font-bold text-[20px] text-[#6E6E66] pointer-events-none">
            zł
          </span>
        </span>
      </label>
      <label className="block mt-4">
        <span className={etykCls}>
          Liczba paragonów <span className={optCls}>· opcjonalnie, z raportu dobowego</span>
        </span>
        <input
          className={inputPoleCls}
          inputMode="numeric"
          placeholder="np. 214"
          value={pole("liczba_paragonow")}
          onChange={(e) => ustaw("liczba_paragonow", e.target.value)}
          onBlur={() => zapiszPole("liczba_paragonow")}
        />
      </label>
      <div className="mt-4">
        <span className={etykCls}>
          Coś nietypowego dziś? <span className={optCls}>· opcjonalnie</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {NIETYPOWE.map((n) => {
            const on = pole("obrot_powod") === n.key;
            return (
              <button
                key={n.key}
                type="button"
                className={chipCls(on)}
                onClick={() => {
                  const v = on ? "" : n.key;
                  ustaw("obrot_powod", v);
                  zapiszPole("obrot_powod", v);
                }}
                data-nietypowe={n.key}
              >
                {on && <Check size={15} strokeWidth={3} />}
                {n.label}
              </button>
            );
          })}
        </div>
        {pole("obrot_powod") && (
          <input
            className={`${inputPoleCls} mt-2.5`}
            placeholder="Co konkretnie? np. ulewa od 17:00, pusta sala"
            value={pole("obrot_komentarz")}
            onChange={(e) => ustaw("obrot_komentarz", e.target.value)}
            onBlur={() => zapiszPole("obrot_komentarz")}
          />
        )}
      </div>
    </Sekcja>
  );

  const poleLiczbowe = (s, p) => {
    const v = szkic(s)[p.klucz] ?? "";
    const krok = (d) => {
      const n = liczbaZ(v);
      const start =
        p.min != null && p.max != null ? Math.round((p.min + p.max) / 2) : p.min != null ? p.min : p.max != null ? p.max : 0;
      ustawSzkic(s, p.klucz, String(n == null ? start : Math.round((n + d) * 10) / 10).replace(".", ","));
    };
    return (
      <div className="flex items-center gap-2" key={p.klucz}>
        <button type="button" className="w-12 h-12 rounded-lg border-[2px] border-[#171714] bg-white grid place-items-center flex-shrink-0" onClick={() => krok(-1)} aria-label="mniej">
          <Minus size={20} />
        </button>
        <span className="relative flex-1 min-w-0 max-w-[180px]">
          <input
            className={`${inputPoleCls} text-center font-['Archivo'] font-extrabold text-[22px] tabular-nums ${p.jednostka ? "pr-10" : ""}`}
            inputMode="decimal"
            placeholder="—"
            aria-label={p.label}
            value={v}
            onChange={(e) => ustawSzkic(s, p.klucz, e.target.value)}
            data-pole-wpisu={p.klucz}
          />
          {p.jednostka && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[15px] font-bold text-[#6E6E66] pointer-events-none">{p.jednostka}</span>
          )}
        </span>
        <button type="button" className="w-12 h-12 rounded-lg border-[2px] border-[#171714] bg-white grid place-items-center flex-shrink-0" onClick={() => krok(1)} aria-label="więcej">
          <Plus size={20} />
        </button>
      </div>
    );
  };

  const wierszWpisu = (s) => {
    const pola = polaSzablonu(s);
    const wpis = wpisDla(s.klucz);
    const norma = pola.map((p) => opisNormy(p)).filter(Boolean);
    if (wpis) {
      const alarm = pozaNorma(s, wpis.payload);
      const poprawka = opisPoprawki(wpis, wpisy, pola);
      return (
        <div
          key={s.id || s.klucz}
          className={`rounded-lg border-[2px] px-3.5 py-3 ${alarm ? "border-[#E8A08F] bg-[#FFF3EF]" : "border-[#DEDCD4] bg-white"}`}
          data-wpis-dnia={s.klucz}
          data-stan="zapisany"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] text-[#171714]">{s.nazwa}</b>
              <span className="block text-[13px] text-[#6E6E66]">
                {wpis.recorded_by} · {godzTxt(wpis.recorded_at || wpis.created_at)}
              </span>
            </div>
            <b className={`font-['Archivo'] text-[17px] tabular-nums text-right ${alarm ? "text-[#DE3A22]" : "text-[#171714]"}`}>
              {wartosciWpisu(pola, wpis.payload)}
            </b>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {alarm ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#DE3A22]">
                <AlertTriangle size={14} /> poza normą
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#1F7A4A]">
                <Check size={14} strokeWidth={3} /> zapisane
              </span>
            )}
            {!pusta(wpis.payload?.[KLUCZ_DZIALANIA]) && (
              <span className="text-[13px] text-[#3A3A35]">· {wpis.payload[KLUCZ_DZIALANIA]}</span>
            )}
            {poprawka && <SladPoprawki opis={poprawka} />}
          </div>
        </div>
      );
    }

    const st = stanSzkicu(s);
    const sz = szkic(s);
    const tylkoJednoBool = pola.length > 0 && pola.filter((p) => p.typ !== "text").length === 1 && pola.find((p) => p.typ === "bool");
    return (
      <div
        key={s.id || s.klucz}
        className={`rounded-lg border-[2px] px-3.5 py-3 ${
          st === "zly" ? "border-[#E8A08F] bg-[#FFF3EF]" : st === "ok" ? "border-[#9CCBB0] bg-white" : "border-[#DEDCD4] bg-white"
        }`}
        data-wpis-dnia={s.klucz}
        data-stan={st}
      >
        <div className="mb-2.5">
          <b className="block text-[15px] text-[#171714]">
            {s.nazwa}
            {s.wymagany === false && <span className={`${optCls} text-[13px]`}> · opcjonalnie</span>}
          </b>
          {norma.length > 0 && <span className="block text-[13px] text-[#6E6E66]">norma {norma.join(" · ")}</span>}
        </div>
        <div className="flex flex-col gap-2.5">
          {pola.map((p) =>
            p.typ === "number" ? (
              <div key={p.klucz}>
                {pola.length > 1 && <span className="block text-[13px] font-bold text-[#3A3A35] mb-1">{p.label}</span>}
                {poleLiczbowe(s, p)}
              </div>
            ) : p.typ === "bool" ? (
              <div key={p.klucz}>
                {!tylkoJednoBool && <span className="block text-[13px] font-bold text-[#3A3A35] mb-1">{p.label}</span>}
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className={wyborCls(sz[p.klucz] === true)} onClick={() => ustawSzkic(s, p.klucz, true)}>
                    <Check size={17} strokeWidth={3} /> {tylkoJednoBool ? p.label : "Tak"}
                  </button>
                  <button type="button" className={wyborCls(sz[p.klucz] === false, "zly")} onClick={() => ustawSzkic(s, p.klucz, false)}>
                    <X size={17} strokeWidth={3} /> Nie
                  </button>
                </div>
              </div>
            ) : (
              <label key={p.klucz} className="block">
                <span className="block text-[13px] font-bold text-[#3A3A35] mb-1">
                  {p.label}
                  {wymaganePola(pola).includes(p) ? "" : <span className={optCls}> · opcjonalnie</span>}
                </span>
                <input className={inputPoleCls} value={sz[p.klucz] ?? ""} onChange={(e) => ustawSzkic(s, p.klucz, e.target.value)} data-pole-wpisu={p.klucz} />
              </label>
            )
          )}
        </div>
        {st === "ok" && pola.some((p) => p.typ === "number") && (
          <span className="mt-2 flex items-center gap-1.5 text-[13px] font-bold text-[#1F7A4A] bg-[#E2F3E9] rounded-md px-2.5 py-1.5">
            <Check size={14} strokeWidth={3} /> w normie
          </span>
        )}
        {st === "zly" && (
          <label className="mt-2.5 block">
            <span className="flex items-center gap-1.5 text-[14px] font-bold text-[#B8321A] mb-1">
              <AlertTriangle size={16} /> Poza normą. Co zrobiono?
            </span>
            <input
              className={`${inputPoleCls} border-[#DE3A22]`}
              placeholder="np. drzwi były otwarte, przeniesiono towar, wezwano serwis"
              value={sz[KLUCZ_DZIALANIA] ?? ""}
              onChange={(e) => ustawSzkic(s, KLUCZ_DZIALANIA, e.target.value)}
              data-co-zrobiono
            />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {(st === "ok" || st === "zly") && (
            <button
              type="button"
              className="h-11 px-4 rounded-lg border-[2px] border-[#171714] bg-[#171714] text-white font-['Archivo'] font-bold text-[15px] inline-flex items-center gap-1.5 disabled:opacity-40"
              disabled={!gotowyDoZapisu(s) || zapisujeWpis === s.klucz}
              onClick={() => zapiszZeSzkicu(s)}
              data-zapisz-wpis
            >
              <Check size={16} strokeWidth={3} /> {zapisujeWpis === s.klucz ? "Zapisuję…" : "Zapisz"}
            </button>
          )}
          {s.typ === "dostawa" && (
            <button
              type="button"
              className="h-11 px-1 text-[14px] font-bold text-[#171714] underline underline-offset-[3px] disabled:opacity-40"
              disabled={zapisujeWpis === s.klucz}
              onClick={() => zapiszWpisDnia(s, { [KLUCZ_BRAKU]: true })}
              data-brak-dostawy
            >
              Dziś nie było dostawy
            </button>
          )}
        </div>
      </div>
    );
  };

  const grupy = [
    ...GRUPY.map((g) => ({ ...g, szablony: naDzis.filter((s) => g.typy.includes(s.typ)) })),
    {
      nazwa: "Pozostałe",
      Ikona: FileText,
      szablony: naDzis.filter((s) => !GRUPY.some((g) => g.typy.includes(s.typ))),
    },
  ].filter((g) => g.szablony.length);

  const sekcjaWpisy = (
    <Sekcja nr="2" gotowe={naDzis.length > 0 && zapisane === naDzis.length} tytul="Wpisy dnia" prawo={naDzis.length ? `${zapisane} z ${naDzis.length}` : null} id="wpisy">
      {!naDzis.length && <p className="text-[15px] text-[#6E6E66] m-0">Na dziś nie ma nic do wpisania.</p>}
      <div className="flex flex-col gap-5">
        {grupy.map(({ nazwa, Ikona, szablony: lista }) => (
          <div key={nazwa}>
            <h3 className="flex items-center gap-2 text-[13px] font-bold tracking-[0.06em] uppercase text-[#6E6E66] mb-2.5 mt-0">
              <Ikona size={16} /> {nazwa}
            </h3>
            <div className="flex flex-col gap-2.5">{lista.map(wierszWpisu)}</div>
          </div>
        ))}
      </div>
    </Sekcja>
  );

  const sekcjaNotatka = (
    <section className={kartaCls} data-sekcja-zamkniecia="notatka">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-8 h-8 rounded-full grid place-items-center bg-[#ECEBE6] text-[#171714] flex-shrink-0">
          <StickyNote size={16} />
        </span>
        <h2 className="font-['Archivo'] font-extrabold text-[20px] text-[#171714] m-0">Dla następnej zmiany</h2>
        <span className="ml-auto text-[13px] text-[#8F8E86]">opcjonalnie</span>
      </div>
      <textarea
        rows={3}
        className="w-full border-[2px] border-[#171714] rounded-lg bg-white px-3 py-2.5 text-[16px] placeholder:text-[#B5B3AA]"
        placeholder="np. kończy się sos czosnkowy, rano przyjdzie serwis do zmywarki"
        value={pole("handover")}
        onChange={(e) => ustaw("handover", e.target.value)}
        onBlur={() => zapiszPole("handover")}
      />
    </section>
  );

  const sekcjaZdarzenia = (
    <section className={kartaCls} data-sekcja-zamkniecia="zdarzenia">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-3">
        <span className="w-8 h-8 rounded-full grid place-items-center bg-[#ECEBE6] text-[#171714] flex-shrink-0">
          <AlertTriangle size={16} />
        </span>
        <h2 className="font-['Archivo'] font-extrabold text-[20px] text-[#171714] m-0">Zdarzenia</h2>
        <span className="basis-full md:basis-auto md:ml-auto text-[13px] text-[#8F8E86]">zapisują się osobno, nie blokują zamknięcia</span>
      </div>
      {zdarzenia.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {zdarzenia.map((w) => {
            const p = w.payload || {};
            const kat = (KATEGORIE_ZDARZENIA.find((k) => k.key === p.kategoria) || {}).label || "Zdarzenie";
            const doKierownika = p.wymaga_prowadzenia || p.status === "eskalacja";
            return (
              <div key={w.id} className="flex items-start gap-3 border-[2px] border-[#DEDCD4] rounded-lg px-3 py-2.5">
                <span className="font-['Archivo'] font-bold text-[14px] tabular-nums text-[#6E6E66] pt-0.5">
                  {p.czas || godzTxt(w.recorded_at || w.created_at)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[15px]">{kat}</b>
                  <span className="block text-[13px] text-[#6E6E66] truncate">{p.opis || "(bez opisu)"}</span>
                </div>
                <span
                  className={`text-[12px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                    doKierownika ? "bg-[#FAEAE6] text-[#B8321A]" : "bg-[#ECEBE6] text-[#3A3A35]"
                  }`}
                >
                  {doKierownika ? "do kierownika" : "zamknięte"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        className="w-full rounded-lg border-[2px] border-dashed border-[#171714] bg-white px-4 py-3 text-left flex items-center gap-3"
        onClick={() => setZdarzenie(true)}
        data-zglos-zdarzenie
      >
        <Plus size={20} />
        <span>
          <b className="block font-['Archivo'] text-[16px]">Zgłoś zdarzenie</b>
          <span className="block text-[13px] text-[#6E6E66]">skarga gościa, awaria, uraz, kontrola…</span>
        </span>
      </button>
    </section>
  );

  const pasekPostepu = (
    // Przyklejony do góry przewijanej kolumny; ujemny `top` = górny odstęp
    // `main` w Shellu, inaczej przewijana treść prześwitywałaby nad paskiem.
    <div className="sticky -top-4 z-10 -mx-3.5 md:-mx-6 -mt-4 px-3.5 md:px-6 pt-4 pb-3 bg-[#F1F0EC]" data-postep-zamkniecia>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[14px] text-[#6E6E66] truncate">
          {lokal} · {dataTxt}
        </span>
        <b className="ml-auto font-['Archivo'] text-[16px] text-[#171714] whitespace-nowrap">
          {zrobione === razem ? "Wszystko wpisane" : `Zostało ${razem - zrobione} z ${razem}`}
        </b>
      </div>
      <div className="h-2 rounded-full bg-[#DEDCD4] overflow-hidden">
        <i className="block h-full bg-[#1F7A4A] rounded-full transition-all" style={{ width: `${(zrobione / razem) * 100}%` }} />
      </div>
    </div>
  );

  const stopka = (
    <div className="flex-shrink-0 px-3.5 md:px-6 pt-2 pb-2.5 bg-[#F1F0EC] border-t-[2px] border-[#DEDCD4] md:flex md:justify-end">
      {potwierdz ? (
        <div className="flex gap-2 md:w-[440px]" data-potwierdz-zamkniecie>
          <button
            type="button"
            className="flex-1 min-h-[56px] rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[17px] disabled:opacity-50"
            disabled={zamyka}
            onClick={zamknij}
          >
            {zamyka ? "Zamykam…" : "Tak, zamknij dzień"}
          </button>
          <button
            type="button"
            className="min-h-[56px] px-5 rounded-lg border-[2px] border-[#171714] bg-white font-['Archivo'] font-bold text-[16px]"
            disabled={zamyka}
            onClick={() => setPotwierdz(false)}
          >
            Nie
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="w-full md:w-[440px] min-h-[56px] rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white flex flex-col items-center justify-center py-1.5 disabled:bg-[#ECEBE6] disabled:border-[#DEDCD4] disabled:text-[#8F8E86]"
          disabled={brakuje.length > 0}
          onClick={() => setPotwierdz(true)}
          data-zamknij-dzien
        >
          <span className="font-['Archivo'] font-extrabold text-[17px] inline-flex items-center gap-1.5">
            <Lock size={16} /> Zamknij dzień
          </span>
          <small className="text-[13px] font-semibold">
            {brakuje.length ? `brakuje: ${brakuje.join(", ")}` : "po zamknięciu nie można edytować"}
          </small>
        </button>
      )}
    </div>
  );

  return rama(
    <>
      {pasekPostepu}
      {/* Telefon: kolumna w kolejności z makiety (utarg, wpisy, notatka,
          zdarzenia). Tablet: z lewej utarg, notatka i zdarzenia, z prawej
          wpisy — ostatni wiersz `1fr` zbiera nadmiar wysokości, żeby karty z
          lewej nie rozjeżdżały się, gdy wpisów jest dużo. */}
      <div className="flex flex-col gap-3.5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-rows-[auto_auto_auto_1fr] md:gap-5 md:items-start pt-1">
        <div className="md:col-start-1 md:row-start-1">{sekcjaUtarg}</div>
        <div className="md:col-start-2 md:row-start-1 md:row-span-4">{sekcjaWpisy}</div>
        <div className="md:col-start-1 md:row-start-2">{sekcjaNotatka}</div>
        <div className="md:col-start-1 md:row-start-3">{sekcjaZdarzenia}</div>
      </div>
      {zdarzenie && (
        <ZdarzenieModal
          prosty
          dateStr={dzis}
          osobyNaZmianie={osobyNaZmianie}
          onClose={() => setZdarzenie(false)}
          onSave={dodajZdarzenie}
        />
      )}
    </>,
    stopka
  );
}
