// @ts-nocheck
// Skrzynka — Zgłoszenia i Powiadomienia w jednym miejscu (makieta właściciela
// z 2026-09-25, InboxDesktop / InboxMobile). Jedna pozycja w menu, jeden
// licznik, trzy zakładki:
//   - Do zrobienia — coś czeka na ruch kierownika, a akcja stoi przy pozycji
//     (Zatwierdź / Odrzuć wniosek, Rozwiązane, Zamknij Puls, Rozstrzygnij);
//   - Informacje — powiadomienia do przeczytania, bez akcji;
//   - Archiwum — rozwiązane: z tym, kto i jak.
//
// ⚠️ "Do zrobienia" jest LICZONE z danych, nie z powiadomień. Powiadomienie
// mówi "wczoraj coś było"; pozycja w Do zrobienia mówi "to dalej czeka". Dzięki
// temu sprawa rozstrzygnięta gdzie indziej (np. w Zatwierdzaniu) znika stąd
// sama, a nie wisi, dopóki ktoś nie kliknie "przeczytane".
//
// ⚠️ Liczbę pozycji "Do zrobienia" liczy `zbierzSprawy` — ta sama funkcja daje
// znaczek w menu (ManagerDashboard) i listę tutaj. Dokładając rodzaj sprawy,
// dopisz go TYLKO tam.
import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardPlus,
  Flag,
  Info,
  Lock,
  Palmtree,
  X,
} from "lucide-react";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { toLocalYMD } from "../../utils/grafik";
import { stanKartDnia } from "../../utils/dziennik";
import { zmianyPorzucone } from "../../utils/porzucone";
import { zmianyBezOdbicia } from "../../utils/odbicia";
import { czekaNaKoniecOdKierownika } from "../../utils/wpisy";
import { pad, odmiana } from "../../utils/czas";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";

// Powiadomienia starsze niż tyle dni idą z Informacji do Archiwum.
const DNI_W_INFORMACJACH = 14;
// Puls pytamy o tyle dni wstecz — dalej nikt nie pamięta utargu.
const DNI_PULSU = 7;

const MIES = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const DNI = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dm = (ymd) => `${ymd.slice(8)}.${ymd.slice(5, 7)}`;

// "1–6 lis 2026", "28 lis – 3 gru 2026", "sob 12 gru 2026" — daty ludzkie,
// bez przeliczania w głowie, który to dzień tygodnia.
export const zakresLudzki = (od, doD) => {
  const a = new Date(`${od}T00:00:00`);
  const b = new Date(`${doD || od}T00:00:00`);
  if (od === (doD || od)) return `${DNI[a.getDay()]} ${a.getDate()} ${MIES[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()}–${b.getDate()} ${MIES[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${MIES[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : ""} – ${b.getDate()} ${MIES[b.getMonth()]} ${b.getFullYear()}`;
};

// "3 h temu", "wczoraj 09:41", "11.09, 10:59".
export const kiedyLudzkie = (d, teraz = new Date()) => {
  if (!d || isNaN(d)) return "";
  const min = Math.floor((teraz - d) / 60000);
  if (min < 1) return "przed chwilą";
  if (min < 60) return `${min} min temu`;
  const dzis = toLocalYMD(teraz);
  const ymd = toLocalYMD(d);
  if (ymd === dzis) return min < 6 * 60 ? `${Math.floor(min / 60)} h temu` : `dziś ${hhmm(d)}`;
  const wczoraj = toLocalYMD(new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() - 1));
  if (ymd === wczoraj) return `wczoraj ${hhmm(d)}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}, ${hhmm(d)}`;
};

const listaDat = (lista) =>
  lista.length === 1
    ? lista[0]
    : `${lista.slice(0, -1).join(", ")} i ${lista[lista.length - 1]}`;

const TYP_POWIADOMIENIA = {
  absence_request: ["req", "Wniosek"],
  swap_offer: ["req", "Giełda"],
  swap_accepted: ["req", "Giełda"],
  probny: ["req", "Na próbę"],
  puls: ["sys", "Puls"],
  porzucona: ["sys", "System"],
  odbicie: ["sys", "System"],
  sanepid: ["sys", "Termin"],
  umowa: ["sys", "Termin"],
};

// ---------------------------------------------------------------------------
// Wszystkie pozycje skrzynki jako DANE (bez JSX) — z tego liczy się też
// znaczek w menu. `akcje` to opisy: { id, etykieta, glowna }.
// ---------------------------------------------------------------------------
export const zbierzSprawy = ({
  issues = [],
  users = [],
  tasks = [],
  absences = [],
  notifications = [],
  shifts = [],
  planShifts = [],
  lokale = [],
  dayLogs = [],
  lokaleNames = [],
  lokalOk,
  teraz = new Date(),
}) => {
  const sprawy = [];
  const lokalOsoby = (userId) => users.find((u) => u.id === userId)?.default_lokal || "";

  // --- Wnioski o wolne ---
  const granicaArchiwum = new Date(teraz.getTime() - 60 * 86400000);
  absences
    .filter((a) => a.requested_by !== "manager" && lokalOk(a.lokal))
    .forEach((a) => {
      const urlop = a.type === "urlop";
      const dni = countWorkdays(a.start_date, a.end_date);
      const wspolne = {
        klucz: `wolne:${a.id}`,
        rodzaj: "req",
        typ: "Wniosek",
        kiedy: new Date(a.created_at),
        kto: a.user_name,
        lokal: a.lokal,
        tytul: `${urlop ? "Urlop" : "Niedostępność"} · ${zakresLudzki(a.start_date, a.end_date)}`,
        tekst: urlop
          ? { mocno: `${dni} ${odmiana(dni, ["dzień roboczy", "dni robocze", "dni roboczych"])} · +${dni * URLOP_HOURS_PER_DAY} h`, reszta: " do rozliczenia." }
          : { reszta: "Blokuje termin w Grafiku, nie dodaje godzin." },
        notatka: a.note || "",
        absence: a,
      };
      if (a.status === "pending") {
        sprawy.push({
          ...wspolne,
          box: "todo",
          nowe: teraz - wspolne.kiedy < 86400000,
          akcje: [
            { id: "zatwierdz_wolne", etykieta: "Zatwierdź", glowna: true },
            { id: "odrzuc_wolne", etykieta: "Odrzuć" },
          ],
        });
      } else if (a.decided_at && new Date(a.decided_at) >= granicaArchiwum) {
        sprawy.push({
          ...wspolne,
          box: "arch",
          rozwiazanie: `${a.status === "approved" ? "Zatwierdzone" : "Odrzucone"}${
            a.decided_by ? ` · ${a.decided_by}` : ""
          } · ${kiedyLudzkie(new Date(a.decided_at), teraz)}`,
        });
      }
    });

  // --- Zgłoszenia pracowników ---
  issues
    .filter((i) => (i.type || "problem") === "problem")
    .forEach((i) => {
      const lokal = i.user_id ? lokalOsoby(i.user_id) : "";
      // Anonimowe nie mają lokalu — widzi je każdy kierownik (CLAUDE.md, 0033).
      if (i.user_id && !lokalOk(lokal)) return;
      const anonim = i.is_anonymous || !i.user_id;
      const zadanie = tasks.some((t) => t.source_issue_id === i.id);
      const otwarte = i.status === "nowe";
      sprawy.push({
        klucz: `zgl:${i.id}`,
        box: otwarte ? "todo" : "arch",
        rodzaj: "rep",
        typ: "Zgłoszenie",
        kiedy: new Date(i.created_at),
        nowe: otwarte && teraz - new Date(i.created_at) < 86400000,
        kto: anonim ? "Anonim" : i.user_name,
        lokal,
        // Zgłoszenie anonimowe bywa o innej osobie — treść chowamy do "Pokaż",
        // żeby nie przeczytał jej ktoś, kto akurat stoi za kierownikiem.
        tytul: anonim ? "Zgłoszenie anonimowe" : i.issue_text,
        ukryte: anonim ? i.issue_text : "",
        rozwiazanie: otwarte ? "" : `Rozwiązane${zadanie ? " · zadanie utworzone" : ""}`,
        issue: i,
        lokalZadania: lokal,
        akcje: [
          ...(otwarte ? [{ id: "rozwiaz", etykieta: "Rozwiązane", glowna: true }] : []),
          ...(zadanie ? [] : [{ id: "zadanie", etykieta: "Utwórz zadanie" }]),
        ],
      });
    });

  // --- System: Puls niezamknięty (liczony z kart dni, nie z przypomnień) ---
  const dni = Array.from({ length: DNI_PULSU }, (_, k) =>
    toLocalYMD(new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() - DNI_PULSU + k))
  );
  lokaleNames.filter(lokalOk).forEach((lokal) => {
    // Dzień bez ani jednego odbicia to zwykle dzień zamknięty — nie ma czego
    // zamykać i przypomnienie byłoby alarmem o niczym.
    const otwarteDni = dni.filter(
      (ymd) =>
        shifts.some((s) => s.lokal === lokal && toLocalYMD(s.start_time) === ymd) &&
        !stanKartDnia({ dayLogs, lokaleNames: [lokal], dateStr: ymd })[0].zamkniety
    );
    if (!otwarteDni.length) return;
    const przypomnienia = notifications.filter(
      (n) => n.type === "puls" && n.lokal === lokal && !/zamknięty/.test(n.message || "")
    );
    sprawy.push({
      klucz: `puls:${lokal}`,
      box: "todo",
      rodzaj: "sys",
      typ: "System",
      kiedy: przypomnienia.length
        ? new Date(Math.max(...przypomnienia.map((n) => new Date(n.created_at))))
        : new Date(`${otwarteDni[otwarteDni.length - 1]}T23:59:00`),
      nowe: przypomnienia.some((n) => !n.is_read),
      razy: przypomnienia.length,
      lokal,
      tytul: `Puls niezamknięty · ${listaDat(otwarteDni.map(dm))}`,
      tekst: { reszta: "Brak karty dnia — utarg i wpisy nie są potwierdzone." },
      pulsDzien: otwarteDni[0],
      akcje: [{ id: "puls", etykieta: "Zamknij Puls", glowna: true }],
    });
  });

  // --- System: zmiany bez odbitego końca (każda osobno) ---
  zmianyPorzucone({ shifts, planShifts, lokale, users, lokalOk, now: teraz })
    .filter((poz) => !czekaNaKoniecOdKierownika(poz.shift, issues))
    .forEach((poz) => {
      const s = poz.shift;
      sprawy.push({
        klucz: `porzucona:${s.id}`,
        box: "todo",
        rodzaj: "sys",
        typ: "System",
        kiedy: new Date(poz.prog),
        kto: s.user_name,
        lokal: s.lokal,
        tytul: `Zmiana ${dm(toLocalYMD(s.start_time))} bez odbitego końca`,
        tekst: {
          reszta: `Wejście ${hhmm(s.start_time)}${
            poz.koniecPlanu ? `, w grafiku do ${hhmm(poz.koniecPlanu)}` : ", bez zmiany w grafiku"
          }. Bez decyzji godziny nie trafią na wypłatę.`,
        },
        akcje: [{ id: "rozstrzygnij", etykieta: "Rozstrzygnij", glowna: true }],
      });
    });

  // --- System: zmiany z grafiku bez odbicia — jedną pozycją, bo bywa ich
  // kilkanaście, a rozstrzyga się je i tak w Zatwierdzaniu. ---
  const braki = zmianyBezOdbicia({ planShifts, shifts, users, absences, lokalOk });
  if (braki.length) {
    const najstarsza = braki.slice().sort((a, b) => a.plan.date.localeCompare(b.plan.date))[0];
    sprawy.push({
      klucz: "odbicia",
      box: "todo",
      rodzaj: "sys",
      typ: "System",
      kiedy: new Date(`${najstarsza.plan.date}T23:59:00`),
      tytul: `${braki.length} ${odmiana(braki.length, [
        "zmiana z grafiku bez odbicia",
        "zmiany z grafiku bez odbicia",
        "zmian z grafiku bez odbicia",
      ])}`,
      tekst: {
        reszta: `Najstarsza: ${najstarsza.user.name} · ${dm(najstarsza.plan.date)}. Bez decyzji godziny nie trafią na wypłatę.`,
      },
      akcje: [{ id: "rozstrzygnij", etykieta: "Rozstrzygnij", glowna: true }],
    });
  }

  // --- Powiadomienia: Informacje (świeże) i Archiwum (starsze). Te same
  // wiadomości łączymy w jedną pozycję z "×N" — cron przypominający codziennie
  // o tym samym robił z listy ścianę powtórzeń. ---
  const granica = new Date(teraz.getTime() - DNI_W_INFORMACJACH * 86400000);
  const grupy = new Map();
  notifications
    .filter((n) => !n.lokal || lokalOk(n.lokal))
    .forEach((n) => {
      const stare = new Date(n.created_at) < granica;
      const k = `${stare ? "a" : "i"}|${n.type}|${n.lokal}|${n.message}`;
      if (!grupy.has(k)) grupy.set(k, { stare, lista: [] });
      grupy.get(k).lista.push(n);
    });
  grupy.forEach(({ stare, lista }, k) => {
    const n0 = lista.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const [rodzaj, typ] = TYP_POWIADOMIENIA[n0.type] || ["sys", "Powiadomienie"];
    sprawy.push({
      klucz: `pow:${k}`,
      box: stare ? "arch" : "info",
      rodzaj: rodzaj === "req" ? "info" : rodzaj,
      typ,
      kiedy: new Date(n0.created_at),
      nowe: lista.some((n) => !n.is_read),
      razy: lista.length,
      lokal: n0.lokal,
      tytul: n0.message || "",
      idsPowiadomien: lista.map((n) => n.id),
    });
  });

  return sprawy.sort((a, b) => b.kiedy - a.kiedy);
};

// ---------------------------------------------------------------------------
// Klasy
// ---------------------------------------------------------------------------
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[40px] px-4 rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-50";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const IKONA = {
  req: [Palmtree, "bg-[#E3EEFB] text-[#1D5FA8]"],
  rep: [Flag, "bg-[#ECEBE6] text-[#171714]"],
  sys: [AlertTriangle, "bg-[#FDF0D8] text-[#8A5300]"],
  info: [Info, "bg-[#E3EEFB] text-[#1D5FA8]"],
};

// Na poziomie modułu (błąd #10 w CLAUDE.md) — w pozycji siedzi pole tytułu
// zadania, które inaczej traciłoby fokus przy każdym renderze rodzica.
function Pozycja({ s, teraz, pokazane, onPokaz, onAkcja, formularzZadania, ustawFormularz, onZapiszZadanie }) {
  const [Ikona, ikonaCls] = IKONA[s.rodzaj] || IKONA.sys;
  const arch = s.box === "arch";
  return (
    <div
      className="grid grid-cols-[10px_40px_minmax(0,1fr)] md:grid-cols-[10px_40px_minmax(0,1fr)_auto] gap-x-3 gap-y-3 px-4 md:px-5 py-4 border-t-[1.5px] border-[#DEDCD4] first:border-t-0"
      data-sprawa-skrzynki={s.klucz}
    >
      <span className={`w-2.5 h-2.5 rounded-full mt-4 ${s.nowe ? "bg-[#DE3A22]" : ""}`} />
      <span className={`w-10 h-10 rounded-lg grid place-items-center ${ikonaCls}`}>
        <Ikona size={19} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-[#6E6E66]">
          <span className="text-[12px] font-extrabold tracking-[0.06em] uppercase">{s.typ}</span>
          {s.kto && <b className="text-[15px] text-[#171714] ml-1">{s.kto}</b>}
          {s.lokal && <span>· {s.lokal}</span>}
          <span>· {kiedyLudzkie(s.kiedy, teraz)}</span>
          {s.razy > 1 && (
            <span className="ml-1 inline-flex items-center h-5 px-1.5 rounded-md bg-[#ECEBE6] text-[#171714] text-[12px] font-extrabold">
              ×{s.razy}
            </span>
          )}
        </div>
        <div
          className={`font-['Archivo'] font-bold text-[17px] leading-6 mt-0.5 break-words ${
            arch ? "text-[#6E6E66]" : "text-[#171714]"
          }`}
        >
          {s.tytul}
        </div>
        {s.tekst && (
          <div className="text-sm text-[#6E6E66] mt-0.5">
            {s.tekst.mocno && <b className="text-[#171714]">{s.tekst.mocno}</b>}
            {s.tekst.reszta}
          </div>
        )}
        {s.notatka && <div className="text-sm text-[#6E6E66] mt-0.5 italic">„{s.notatka}”</div>}
        {s.ukryte &&
          (pokazane ? (
            <div className="text-sm text-[#171714] mt-1">„{s.ukryte}”</div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-[#6E6E66] mt-1">
              <Lock size={15} /> Zgłoszenie anonimowe — treść ukryta
              <button type="button" onClick={onPokaz} className="font-bold text-[#171714] underline underline-offset-2">
                Pokaż
              </button>
            </div>
          ))}
        {s.rozwiazanie && (
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#1F7A4A] mt-1.5">
            <Check size={14} strokeWidth={2.5} /> {s.rozwiazanie}
          </div>
        )}
        {formularzZadania != null && (
          <div className="flex flex-wrap gap-2 mt-3">
            <input
              value={formularzZadania}
              onChange={(e) => ustawFormularz(e.target.value)}
              className="flex-1 min-w-[200px] h-11 px-3 border-[2px] border-[#171714] rounded-md text-[15px]"
              aria-label="Tytuł zadania"
            />
            <button
              type="button"
              className={btnGlownyCls}
              disabled={!formularzZadania.trim()}
              onClick={onZapiszZadanie}
            >
              Zapisz zadanie
            </button>
            <button type="button" className={btnObrysCls} onClick={() => ustawFormularz(null)}>
              Anuluj
            </button>
          </div>
        )}
      </div>
      {(s.akcje || []).length > 0 && formularzZadania == null && (
        <div className="col-span-3 md:col-span-1 md:col-start-4 flex gap-2 md:self-start md:justify-end">
          {s.akcje.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAkcja(s, a.id)}
              className={`${a.glowna ? btnGlownyCls : btnObrysCls} flex-1 md:flex-none`}
              data-akcja={a.id}
            >
              {["zatwierdz_wolne", "rozwiaz", "puls"].includes(a.id) && <Check size={17} />}
              {a.id === "odrzuc_wolne" && <X size={17} />}
              {a.id === "zadanie" && <ClipboardPlus size={17} />}
              {a.etykieta}
              {a.id === "rozstrzygnij" && <ArrowRight size={17} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Skrzynka({
  dane, // argumenty zbierzSprawy — ten sam obiekt, z którego liczy się znaczek
  startowaZakladka = "todo",
  onResolveAbsence,
  onResolveIssue,
  onCreateTaskFromIssue,
  onMarkRead,
  onOpenPuls,
  onGoToApprovals,
  fallbackLokal,
  showMsg = () => {},
}) {
  const [zakladka, setZakladka] = useState(startowaZakladka);
  const [rodzaj, setRodzaj] = useState("all");
  const [pokazane, setPokazane] = useState({});
  const [zadanieDla, setZadanieDla] = useState(null); // { klucz, tytul }
  const teraz = new Date();

  const wolne = async (absence, decyzja) => {
    try {
      await onResolveAbsence(absence, decyzja);
    } catch (e) {
      showMsg(`${absence.user_name}: ${e.message || "błąd zapisu"}`, "error");
    }
  };
  const rozwiaz = async (issue) => {
    try {
      await onResolveIssue(issue.id);
    } catch (e) {
      showMsg(e.message || "Błąd zapisu zgłoszenia.", "error");
    }
  };
  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({ wolne, rozwiaz });

  const wszystkie = zbierzSprawy({ ...dane, teraz }).filter((s) => !odlozone[s.klucz]);
  const liczby = { todo: 0, info: 0, arch: 0 };
  wszystkie.forEach((s) => liczby[s.box]++);
  const RODZAJE = { req: ["req"], rep: ["rep"], sys: ["sys", "info"] };
  const lista = wszystkie.filter(
    (s) => s.box === zakladka && (rodzaj === "all" || RODZAJE[rodzaj].includes(s.rodzaj))
  );
  const nieprzeczytane = wszystkie.filter((s) => s.nowe && s.idsPowiadomien).flatMap((s) => s.idsPowiadomien);

  const akcja = (s, id) => {
    if (id === "zatwierdz_wolne" || id === "odrzuc_wolne") {
      const tak = id === "zatwierdz_wolne";
      return decyduj(
        [{ klucz: s.klucz, zadanie: ["wolne", [s.absence, tak ? "approved" : "rejected"]] }],
        `${tak ? "Zatwierdzono" : "Odrzucono"}: ${s.kto} · ${s.tytul}`
      );
    }
    if (id === "rozwiaz")
      return decyduj([{ klucz: s.klucz, zadanie: ["rozwiaz", [s.issue]] }], `Rozwiązane: zgłoszenie · ${s.kto}`);
    if (id === "zadanie") return setZadanieDla({ klucz: s.klucz, tytul: (s.issue.issue_text || "").slice(0, 80) });
    if (id === "puls") return onOpenPuls(s.lokal, s.pulsDzien);
    if (id === "rozstrzygnij") return onGoToApprovals();
  };

  return (
    <div className="max-w-[1060px] mx-auto flex flex-col gap-5" data-skrzynka>
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="font-['Archivo'] text-[26px] md:text-[30px] leading-9 font-extrabold text-[#171714]">
            Skrzynka
          </h2>
          <p className="text-[#6E6E66] mt-1">Wnioski, zgłoszenia pracowników i alerty systemu w jednym miejscu</p>
        </div>
        {nieprzeczytane.length > 0 && (
          <button
            type="button"
            onClick={() => onMarkRead(nieprzeczytane)}
            className="min-h-[40px] px-3 rounded-lg font-bold text-[15px] text-[#171714] hover:bg-[#ECEBE6]"
          >
            Oznacz wszystko jako przeczytane
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]">
          {[
            ["todo", "Do zrobienia"],
            ["info", "Informacje"],
            ["arch", "Archiwum"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setZakladka(k)}
              className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-[15px] whitespace-nowrap ${
                zakladka === k
                  ? "bg-[#171714] border-[#171714] text-white"
                  : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
              }`}
              data-zakladka-skrzynki={k}
            >
              {l}
              <span className={`tabular-nums font-semibold ${zakladka === k ? "text-white/70" : "text-[#6E6E66]"}`}>
                {liczby[k]}
              </span>
            </button>
          ))}
        </div>
        <span className="hidden md:block flex-1" />
        <span className="hidden md:block text-[12px] font-bold tracking-[0.06em] uppercase text-[#6E6E66]">Typ</span>
        <div className="hidden md:flex border-[2px] border-[#171714] rounded-lg overflow-hidden bg-white">
          {[
            ["all", "Wszystko"],
            ["req", "Wnioski"],
            ["rep", "Zgłoszenia"],
            ["sys", "System"],
          ].map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRodzaj(k)}
              className={`h-10 px-4 font-['Archivo'] font-bold text-[15px] ${
                rodzaj === k ? "bg-[#171714] text-white" : "text-[#171714] hover:bg-[#F6F5F1]"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="text-center py-12 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
          <b className="block text-[#171714] text-lg mb-1">{zakladka === "todo" ? "Nic do zrobienia" : "Pusto"}</b>
          {zakladka === "todo"
            ? "Wszystko rozwiązane. Nowe sprawy pojawią się tutaj."
            : "Brak wpisów w tej zakładce."}
        </div>
      ) : (
        <div className="bg-white border-[2px] border-[#171714] rounded-xl overflow-hidden" data-lista-skrzynki>
          {lista.map((s) => (
            <Pozycja
              key={s.klucz}
              s={s}
              teraz={teraz}
              pokazane={!!pokazane[s.klucz]}
              onPokaz={() => setPokazane((p) => ({ ...p, [s.klucz]: true }))}
              onAkcja={akcja}
              formularzZadania={zadanieDla?.klucz === s.klucz ? zadanieDla.tytul : null}
              ustawFormularz={(t) => setZadanieDla(t == null ? null : { klucz: s.klucz, tytul: t })}
              onZapiszZadanie={async () => {
                await onCreateTaskFromIssue(s.issue, zadanieDla.tytul, s.lokalZadania || fallbackLokal);
                setZadanieDla(null);
              }}
            />
          ))}
        </div>
      )}

      {zakladka === "todo" && (
        <div className="hidden md:flex gap-2.5 items-start text-sm text-[#6E6E66]">
          <Info size={18} className="flex-shrink-0 mt-0.5" />
          <span>
            Sprawy rozwiązane gdzie indziej (np. w Zatwierdzaniu) znikają stąd same. Powtarzające się alerty łączymy w
            jeden wpis.
          </span>
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
