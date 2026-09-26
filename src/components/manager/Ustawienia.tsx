// @ts-nocheck
// Ustawienia konta właściciela — układ z makiety właściciela z 2026-09-25
// (design system "Shiftro", SettingsDesktop / SettingsMobile /
// SettingsPositions). Cztery zakładki: Lokale · Stanowiska · Firma ·
// Subskrypcja. Zasady:
//   1. Karta lokalu to lista + karta obok (na telefonie jedno po drugim), a w
//      karcie ZWIJANE sekcje. Podsumowanie stoi w nagłówku sekcji ZAWSZE — też
//      rozwiniętej — żeby jedną liczbę dało się sprawdzić bez rozwijania.
//   2. Przełączniki zamiast dwuznacznych pigułek (bloki telefonu), karty
//      wyboru zamiast listy (sposób wpisu), pola z jednostką i szybkimi
//      wartościami (min, godz., %), a przy regułach wpisu — oś czasu na
//      przykładzie, bo "4 godz. tolerancji" samo nic nie mówi.
//   3. Pasek "Niezapisane zmiany" pojawia się tylko po zmianie. Zapis zostawia
//      kartę otwartą.
//   4. Archiwizacja lokalu w osobnej sekcji, z potwierdzeniem NA MIEJSCU (bez
//      drugiego okna przeglądarki). Stanowisko archiwizuje się z 6 s "Cofnij".
//   5. Stanowiska edytuje się w miejscu (nazwa, skrót, lokal, kolor z palety),
//      nie w modalu.
//
// ⚠️ Zapis dalej idzie przez handleSaveDict w ManagerDashboard.tsx, a tam
// payload powstaje z JAWNEJ listy pól. Pole dopisane tylko tutaj przepadnie
// przy zapisie bez żadnego błędu (patrz błąd #18 w CLAUDE.md).
//
// Widzi to wyłącznie właściciel (rola `admin` albo stara `manager`, patrz
// jestWlascicielem w ManagerDashboard) — decyzja właściciela z 2026-09-24.
// Filtr stoi w ManagerShell (menu) i w ManagerDashboard (render).
import React, { useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Home,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Smartphone,
} from "lucide-react";
import { BLOKI_PRACOWNIKA, blokiLokalu } from "../../utils/grafik";
import { TOLERANCJA_PO_GRAFIKU_H, MAX_DLUGOSC_ZMIANY_H } from "../../utils/porzucone";
import { TRYBY_WPISU, regulyWpisu, opisOkna } from "../../utils/wpisy";
import { stanowiskoShort } from "../../utils/stanowiska";
import { zl } from "../../utils/budzet";
import { pad, odmiana } from "../../utils/czas";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";
import { PRODUKT, TENANT } from "../../config";

const SEKCJE = [
  { key: "lokale", label: "Lokale" },
  { key: "stanowiska", label: "Stanowiska" },
  { key: "firma", label: "Firma" },
  { key: "subskrypcja", label: "Subskrypcja" },
];

// Krótka nazwa i jedno zdanie o tym, co blok daje pracownikowi — sama nazwa
// ("Raport godzin") nie mówiła, że razem z nim znika "Popraw zmianę".
const OPISY_BLOKOW = {
  WPISY: ["Wpisy", "Rozpoczynanie i kończenie zmiany"],
  RAPORT: ["Raport godzin", "Razem z „Popraw zmianę”"],
  GRAFIK: ["Grafik", "Swoje zmiany i zespołu"],
  ZADANIA: ["Zadania", "Lista zadań lokalu"],
  WIADOMOSCI: ["Wiadomości", "Komunikaty od kierownika"],
  ZGLOS_PROBLEM: ["Zgłoś problem", "Zgłoszenia do Skrzynki"],
  WOLNE: ["Wniosek o wolne / urlop", "Trafia do Zatwierdzania"],
};

// Stała paleta stanowisk — dwanaście kolorów, które da się odróżnić w siatce
// Grafiku. Dowolny kolor z pipety dawał dwa prawie identyczne czerwienie.
const PALETA = ["#3FBF3A", "#A0703A", "#8B2FC0", "#4A7A2A", "#E03A1E", "#1A4F6A",
  "#E0604A", "#1A4FE0", "#9AA020", "#6B6B6B", "#E040E0", "#1C1B19"];

const MIES_KROTKO = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

// Pola karty lokalu, które porównujemy, żeby wiedzieć, czy pokazać pasek
// "Niezapisane zmiany". Ta sama lista co payload w handleSaveDict.
const POLA_LOKALU = [
  "name", "miasto", "dzien_wyplaty", "okres_rozliczeniowy", "narzut_umowa",
  "narzut_zlecenie", "tolerancja_po_grafiku_h", "max_dlugosc_zmiany_h",
  "tryb_wpisu", "start_wstecz_min", "koniec_wstecz_min",
];
// null = "" = puste; "20,5" = "20.5" = 20.5 — inaczej pasek zapisu świeciłby
// po samym przepisaniu tej samej liczby.
const norm = (v) => {
  if (v == null || v === "") return "";
  const s = String(v).trim().replace(",", ".");
  return s !== "" && !Number.isNaN(Number(s)) ? String(Number(s)) : s;
};
const liczbaLubNull = (v) => (norm(v) === "" || Number.isNaN(Number(norm(v))) ? null : Number(norm(v)));
const rozniSieLokal = (a, b) =>
  POLA_LOKALU.some((k) => norm(a?.[k]) !== norm(b?.[k])) ||
  blokiLokalu(a).slice().sort().join(",") !== blokiLokalu(b).slice().sort().join(",");

const procent = (v) => `${String(liczbaLubNull(v) ?? 0).replace(".", ",")}%`;
const godzinaZMinut = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
const najblizszaWyplata = (dzien) => {
  const t = new Date();
  let y = t.getFullYear();
  let m = t.getMonth();
  const w = (yy, mm) => Math.min(dzien, new Date(yy, mm + 1, 0).getDate());
  if (t.getDate() > w(y, m)) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return `${w(y, m)} ${MIES_KROTKO[m]} ${y}`;
};
const maskujEmail = (e) => {
  if (!e || !e.includes("@")) return e || "—";
  const [lok, dom] = e.split("@");
  return `${lok.slice(0, Math.min(7, Math.max(1, lok.length - 2)))}••••••@${dom}`;
};

// --- klasy (tokeny "Shiftro", te same co w Rejestrze i Raportach) ---
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66]";
const inputCls =
  "w-full h-12 md:h-11 border-[2px] border-[#171714] rounded-md bg-white px-3 text-[15px] text-[#171714]";
const selectCls = `${inputCls} font-semibold`;
const podpowiedzCls = "text-[13px] leading-[18px] text-[#6E6E66]";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-[18px] rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-40";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const btnMalyGlownyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#DE3A22] bg-[#DE3A22] text-white font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#B8321A]";
const btnMalyCls =
  "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border-[2px] border-[#171714] bg-white text-[#171714] font-['Archivo'] font-bold text-[14px] whitespace-nowrap hover:bg-[#F6F5F1]";
const linkCls = "text-sm font-bold text-[#171714] underline underline-offset-[3px] hover:text-[#DE3A22]";
const ikonaBtnCls =
  "w-10 h-10 rounded-lg border-[2px] border-[#DEDCD4] bg-white grid place-items-center text-[#171714] hover:border-[#171714] flex-shrink-0";

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md).
// ---------------------------------------------------------------------------
function Pole({ etykieta, children, podpowiedz }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className={etykietaCls}>{etykieta}</span>
      {children}
      {podpowiedz && <span className={podpowiedzCls}>{podpowiedz}</span>}
    </label>
  );
}

function ZSufiksem({ sufiks, ...reszta }) {
  return (
    <div className="relative">
      <input type="text" className={`${inputCls} pr-14 tabular-nums`} {...reszta} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E66] font-bold pointer-events-none">
        {sufiks}
      </span>
    </div>
  );
}

function Ostrzezenie({ children }) {
  return (
    <span className="flex gap-1.5 items-start text-[13px] font-bold text-[#8A5300]">
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </span>
  );
}

// Zwijana sekcja karty lokalu. Podsumowanie stoi w nagłówku ZAWSZE.
function Akordeon({ id, ikona: Ikona, tytul, podsumowanie, otwarta, onToggle, children }) {
  return (
    <div className={`${kartaCls} overflow-hidden`} data-sekcja-lokalu={id}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={otwarta}
        className="w-full grid grid-cols-[36px_1fr_auto] gap-3 items-center px-3.5 md:px-[18px] py-3 md:py-3.5 text-left hover:bg-[#F6F5F1]"
      >
        <span className="w-9 h-9 rounded-lg bg-[#ECEBE6] grid place-items-center">
          <Ikona size={18} />
        </span>
        <span className="min-w-0">
          <span className="block font-['Archivo'] font-extrabold text-base text-[#171714]">{tytul}</span>
          <span className="block text-[13px] leading-[18px] text-[#6E6E66]">{podsumowanie}</span>
        </span>
        <ChevronRight
          size={18}
          className={`text-[#6E6E66] transition-transform ${otwarta ? "rotate-90" : ""}`}
        />
      </button>
      {otwarta && (
        <div className="flex flex-col gap-4 px-3.5 md:px-[18px] pt-4 pb-5 border-t-[1.5px] border-[#DEDCD4]">
          {children}
        </div>
      )}
    </div>
  );
}

function Przelacznik({ wlaczony }) {
  return (
    <span
      className={`relative w-11 h-[26px] rounded-full border-[2px] flex-shrink-0 transition-colors ${
        wlaczony ? "bg-[#1F7A4A] border-[#1F7A4A]" : "bg-[#ECEBE6] border-[#171714]"
      }`}
    >
      <i
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all ${
          wlaczony ? "left-[20px] bg-white" : "left-[2px] bg-[#171714]"
        }`}
      />
    </span>
  );
}

function Chip({ wlaczony, children, ...reszta }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center h-[30px] px-3 rounded-full border-[1.5px] text-[13px] font-semibold whitespace-nowrap ${
        wlaczony
          ? "bg-[#171714] border-[#171714] text-white"
          : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
      }`}
      {...reszta}
    >
      {children}
    </button>
  );
}

// Modal, który nie może urosnąć ponad ekran. Tylko "Dodaj lokal" — nazwa i
// miasto, resztę ustawia się w karcie, która otwiera się zaraz po dodaniu.
function MalyModal({ tytul, onSubmit, onCancel, children, zapiszLabel = "Zapisz" }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center md:p-4 z-50">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-t-2xl md:rounded-xl border-[2px] border-[#171714] w-full md:max-w-sm max-h-[90vh] flex flex-col"
      >
        <h3 className="font-['Archivo'] font-extrabold text-lg px-5 pt-5 pb-3">{tytul}</h3>
        <div className="px-5 pb-4 flex flex-col gap-3 overflow-y-auto min-h-0">{children}</div>
        <div className="flex gap-2 px-5 py-4 border-t-[2px] border-[#DEDCD4]">
          <button type="button" onClick={onCancel} className={`${btnObrysCls} flex-1`}>
            Anuluj
          </button>
          <button type="submit" className={`${btnGlownyCls} flex-1`}>
            {zapiszLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function KartaInfo({ etykieta, duza, children, akcja }) {
  return (
    <div className={`${kartaCls} px-5 py-[18px] flex flex-col gap-1.5`}>
      <span className={etykietaCls}>{etykieta}</span>
      {duza != null && <span className="font-['Archivo'] text-[26px] leading-8 font-extrabold">{duza}</span>}
      {children}
      {akcja}
    </div>
  );
}

export default function Ustawienia({
  currentUser,
  lokale = [],
  stanowiska = [],
  users = [],
  editingDict,
  setEditingDict,
  onSaveDict,
  onArchive,
  onOpenEmployee,
}) {
  const [sekcja, setSekcja] = useState("lokale");
  const [pokazArchiwum, setPokazArchiwum] = useState(false);
  // Która sekcja karty lokalu jest rozwinięta. Domyślnie tylko podstawowe —
  // karta ma się mieścić na ekranie, a resztę otwiera się, gdy jest po co.
  const [otwarte, setOtwarte] = useState({ podstawowe: true });
  const [potwierdzArchiwum, setPotwierdzArchiwum] = useState(false);
  // Karta "jak zapisana" — z nią porównujemy, czy pokazać pasek zapisu.
  // Własna kopia, a nie wiersz z `lokale`: świeżo dodany lokal trafia do
  // listy dopiero, gdy dojdzie stan rodzica, a karta otwiera się od razu.
  const [oryginal, setOryginal] = useState(null);
  const toggle = (k) => setOtwarte((o) => ({ ...o, [k]: !o[k] }));

  // Archiwizacja stanowiska z 6 s "Cofnij" — ten sam mechanizm co "Do decyzji".
  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({
    archiwizujStanowisko: (id) => onArchive("stanowiska", id, true, { potwierdzone: true }),
  });

  const aktywneLokale = lokale.filter((l) => !l.archived);
  const archiwalneLokale = lokale.filter((l) => l.archived);
  const aktywneStanowiska = stanowiska.filter((s) => !s.archived && !odlozone[`st:${s.id}`]);
  const archiwalneStanowiska = stanowiska.filter((s) => s.archived);

  const edytowanyLokal = sekcja === "lokale" && editingDict && editingDict.id ? editingDict : null;
  const nowyLokal = sekcja === "lokale" && editingDict && !editingDict.id;
  const zapisanyLokal = edytowanyLokal
    ? oryginal && oryginal.id === edytowanyLokal.id
      ? oryginal
      : lokale.find((l) => l.id === edytowanyLokal.id) || null
    : null;
  const zmieniony = !!(edytowanyLokal && zapisanyLokal && rozniSieLokal(edytowanyLokal, zapisanyLokal));
  const set = (pole, wartosc) => setEditingDict({ ...editingDict, [pole]: wartosc });

  // Porzucenie niezapisanych zmian pyta raz — zmiana lokalu, zakładki albo
  // "Dodaj lokal" przy otwartej, zmienionej karcie.
  const moznaPorzucic = () =>
    !zmieniony ||
    window.confirm(`Masz niezapisane zmiany w „${zapisanyLokal.name}”. Porzucić je?`);

  // editingDict jest wspólny dla lokali i stanowisk (jeden handleSaveDict),
  // więc przy zmianie zakładki musi się wyczyścić — inaczej otwarty lokal
  // zapisałby się jako stanowisko.
  const przejdz = (k) => {
    if (!moznaPorzucic()) return;
    setEditingDict(null);
    setPokazArchiwum(false);
    setSekcja(k);
  };

  const otworzLokal = (l) => {
    if (edytowanyLokal && edytowanyLokal.id === l.id) return;
    if (!moznaPorzucic()) return;
    setOtwarte({ podstawowe: true });
    setPotwierdzArchiwum(false);
    setOryginal({ ...l });
    setEditingDict({ ...l });
  };

  const zapiszLokal = async (e) => {
    const zapisany = await onSaveDict(e, "lokale");
    // Po zapisie karta zostaje otwarta — tak jak karta pracownika. Dalsze
    // ustawienia przegląda się zwykle od razu, a lista nie jest celem.
    if (zapisany) {
      setOryginal({ ...zapisany });
      setEditingDict({ ...zapisany });
    }
  };

  const zapiszNowyLokal = async (e) => {
    const zapisany = await onSaveDict(e, "lokale");
    if (zapisany) {
      setOtwarte({ podstawowe: true });
      setOryginal({ ...zapisany });
      setEditingDict({ ...zapisany });
    }
  };

  const aktywniPracownicy = users.filter((u) => u.active !== false && !u.archived && u.role !== "kiosk");
  const tablety = users.filter((u) => u.active !== false && !u.archived && u.role === "kiosk");

  // ---------------------------------------------------------------- Lokale
  const renderLokale = () => {
    const lista = pokazArchiwum ? archiwalneLokale : aktywneLokale;
    return (
      <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        {/* Lista — na telefonie znika, gdy karta jest otwarta. */}
        <div className={`${edytowanyLokal ? "hidden md:block" : ""} ${kartaCls} overflow-hidden md:sticky md:top-4`}>
          <div className="flex items-center gap-2 p-3 border-b-[2px] border-[#171714]">
            {!pokazArchiwum && (
              <button
                type="button"
                onClick={() => {
                  if (!moznaPorzucic()) return;
                  setEditingDict({ id: null, name: "", miasto: "" });
                }}
                className={btnMalyGlownyCls}
              >
                <Plus size={16} /> Dodaj lokal
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!moznaPorzucic()) return;
                setEditingDict(null);
                setPokazArchiwum((v) => !v);
              }}
              className={`${linkCls} ml-auto`}
            >
              {pokazArchiwum ? "‹ Aktywne" : `Archiwum · ${archiwalneLokale.length}`}
            </button>
          </div>
          {lista.length === 0 && (
            <p className="p-4 text-sm text-[#6E6E66]">
              {pokazArchiwum ? "Archiwum puste." : "Brak lokali — dodaj pierwszy."}
            </p>
          )}
          {lista.map((l) => {
            const aktywny = edytowanyLokal && edytowanyLokal.id === l.id;
            const nStanowisk = stanowiska.filter((s) => !s.archived && s.lokal_name === l.name).length;
            const nBlokow = blokiLokalu(aktywny ? edytowanyLokal : l).length;
            return (
              <div
                key={l.id}
                role={pokazArchiwum ? undefined : "button"}
                tabIndex={pokazArchiwum ? undefined : 0}
                onClick={pokazArchiwum ? undefined : () => otworzLokal(l)}
                onKeyDown={(e) => {
                  if (!pokazArchiwum && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    otworzLokal(l);
                  }
                }}
                className={`grid grid-cols-[40px_1fr_auto] gap-3 items-center px-3.5 py-2.5 border-t-[1.5px] border-[#DEDCD4] first:border-t-0 border-l-4 ${
                  pokazArchiwum ? "border-l-transparent" : "cursor-pointer"
                } ${aktywny ? "bg-[#FFF3EF] border-l-[#DE3A22]" : "border-l-transparent hover:bg-[#F6F5F1]"}`}
                data-lokal-listy={l.name}
              >
                <span className="w-10 h-10 rounded-lg bg-[#ECEBE6] grid place-items-center">
                  <Home size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold truncate">{l.name}</span>
                  <span className="block text-[13px] leading-[18px] text-[#6E6E66]">
                    {l.miasto || "miasto nieustawione"} · {nStanowisk}{" "}
                    {odmiana(nStanowisk, ["stanowisko", "stanowiska", "stanowisk"])} · telefon {nBlokow}/
                    {BLOKI_PRACOWNIKA.length}
                  </span>
                </span>
                {pokazArchiwum ? (
                  <button
                    type="button"
                    onClick={() => onArchive("lokale", l.id, false, { potwierdzone: true })}
                    className={btnMalyCls}
                    title="Przywróć z archiwum"
                  >
                    <ArchiveRestore size={16} /> Przywróć
                  </button>
                ) : (
                  <ChevronRight size={18} className="text-[#6E6E66]" />
                )}
              </div>
            );
          })}
        </div>

        {edytowanyLokal ? (
          renderKartaLokalu()
        ) : (
          <div className="hidden md:block text-center py-12 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
            Wybierz lokal z listy, żeby zmienić jego ustawienia.
          </div>
        )}
      </div>
    );
  };

  const renderKartaLokalu = () => {
    const d = edytowanyLokal;
    const bloki = blokiLokalu(d);
    const dzien = liczbaLubNull(d.dzien_wyplaty) || 10;
    const rw = regulyWpisu([d], d.name);
    const trybLabel = TRYBY_WPISU.find((x) => x.key === rw.tryb)?.label;
    const zeroUmowa = !liczbaLubNull(d.narzut_umowa);
    const zeroZlecenie = !liczbaLubNull(d.narzut_zlecenie);
    const poGrafiku = liczbaLubNull(d.tolerancja_po_grafiku_h) ?? TOLERANCJA_PO_GRAFIKU_H;
    const bezGrafiku = liczbaLubNull(d.max_dlugosc_zmiany_h) ?? MAX_DLUGOSC_ZMIANY_H;
    // Oś czasu: 24 h na 84% szerokości, od 8%. Zmiana 10:00–18:00, po niej
    // okno, w którym pracownik może ją jeszcze sam zamknąć.
    const skala = (h) => `${8 + (h / 24) * 84}%`;
    const koniecOkna = godzinaZMinut((18 + poGrafiku) * 60);
    const opcjeOkresu = [1, 2, 3, 4, 6, 12];
    const dniWyplaty = Array.from({ length: 28 }, (_, i) => i + 1);
    if (liczbaLubNull(d.dzien_wyplaty) > 28) dniWyplaty.push(liczbaLubNull(d.dzien_wyplaty));

    return (
      <form onSubmit={zapiszLokal} className="flex flex-col gap-3 min-w-0" data-karta-lokalu>
        <button
          type="button"
          onClick={() => {
            if (!moznaPorzucic()) return;
            setEditingDict(null);
          }}
          className="md:hidden inline-flex items-center gap-1 font-bold text-[#171714] self-start py-1"
        >
          <ChevronLeft size={18} /> Lokale
        </button>
        <div className={`${kartaCls} px-4 md:px-5 py-4 flex items-center gap-3.5`}>
          <span className="w-14 h-14 rounded-lg bg-[#ECEBE6] grid place-items-center flex-shrink-0">
            <Home size={24} />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 font-['Archivo'] text-[22px] md:text-[26px] leading-8 font-extrabold truncate">
              {d.name || "Lokal"}
            </h2>
            <div className="text-[#6E6E66] flex items-center gap-1 text-sm">
              <MapPin size={14} /> {d.miasto || "miasto nieustawione"} · wypłata {dzien}. dnia miesiąca
            </div>
          </div>
        </div>

        <Akordeon
          id="podstawowe"
          ikona={Home}
          tytul="Podstawowe"
          podsumowanie={`${d.name || "bez nazwy"} · ${d.miasto || "bez miasta"} · wypłata ${dzien}.`}
          otwarta={!!otwarte.podstawowe}
          onToggle={() => toggle("podstawowe")}
        >
          <Pole etykieta="Nazwa">
            <input
              type="text"
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              required
            />
          </Pole>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Pole etykieta="Miasto (do pogody)">
              <input
                type="text"
                value={d.miasto || ""}
                onChange={(e) => set("miasto", e.target.value)}
                placeholder="np. Koszalin"
                className={inputCls}
              />
            </Pole>
            {/* Dzień wypłaty zmienia ruch w gastronomii na tyle, że Puls
                pokazuje go przy dniu — inaczej nietypowy utarg wygląda na
                zagadkę. Puste = 10. */}
            <Pole etykieta="Dzień wypłaty" podpowiedz={`Najbliższa wypłata: ${najblizszaWyplata(dzien)}`}>
              <select
                value={d.dzien_wyplaty ?? ""}
                onChange={(e) => set("dzien_wyplaty", e.target.value === "" ? null : Number(e.target.value))}
                className={selectCls}
              >
                <option value="">10. dzień miesiąca (domyślnie)</option>
                {dniWyplaty.map((n) => (
                  <option key={n} value={n}>
                    {n}. dzień miesiąca
                  </option>
                ))}
              </select>
            </Pole>
          </div>
        </Akordeon>

        <Akordeon
          id="telefon"
          ikona={Smartphone}
          tytul="Telefon pracownika"
          podsumowanie={`${bloki.length} z ${BLOKI_PRACOWNIKA.length} bloków włączonych`}
          otwarta={!!otwarte.telefon}
          onToggle={() => toggle("telefon")}
        >
          <span className={podpowiedzCls}>
            Co widzi pracownik tego lokalu na swoim prywatnym telefonie. Tablet Służbowy zawsze ma wszystko.
            Dostęp na telefonie ma tylko osoba z ustawionym PIN-em blokady i e-mailem.
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BLOKI_PRACOWNIKA.map((b) => {
              const wl = bloki.includes(b.key);
              const [nazwa, opis] = OPISY_BLOKOW[b.key] || [b.label, ""];
              return (
                <button
                  key={b.key}
                  type="button"
                  role="switch"
                  aria-checked={wl}
                  onClick={() =>
                    set("dostepne_bloki", wl ? bloki.filter((x) => x !== b.key) : [...bloki, b.key])
                  }
                  className={`grid grid-cols-[1fr_auto] gap-x-3 items-center text-left px-3 py-2.5 rounded-lg border-[2px] ${
                    wl ? "border-[#171714]" : "border-[#DEDCD4]"
                  }`}
                  data-blok={b.key}
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-sm text-[#171714]">{nazwa}</span>
                    {opis && <span className="block text-[12px] leading-4 text-[#6E6E66]">{opis}</span>}
                  </span>
                  <Przelacznik wlaczony={wl} />
                </button>
              );
            })}
          </div>
          {!bloki.includes("WPISY") && (
            <Ostrzezenie>Bez „Wpisów” pracownik odbija zmianę tylko na tablecie w lokalu.</Ostrzezenie>
          )}
        </Akordeon>

        {/* Ustawienia płacowe lokalu. Świadomie tutaj, a nie w karcie
            pracownika: to decyzje organizacyjne, jednakowe dla całej załogi. */}
        <Akordeon
          id="place"
          ikona={Coins}
          tytul="Płace i koszty"
          podsumowanie={`okres ${d.okres_rozliczeniowy || 1} mies. · narzut ${procent(d.narzut_umowa)} / ${procent(
            d.narzut_zlecenie
          )}`}
          otwarta={!!otwarte.place}
          onToggle={() => toggle("place")}
        >
          <Pole
            etykieta="Okres rozliczeniowy"
            podpowiedz="W tym oknie pracownik na umowie o pracę może odrobić niewykorzystane godziny. Z końcem okresu bilans zeruje się."
          >
            <select
              value={d.okres_rozliczeniowy ?? ""}
              onChange={(e) => set("okres_rozliczeniowy", e.target.value === "" ? null : Number(e.target.value))}
              className={selectCls}
            >
              <option value="">1 miesiąc (domyślnie)</option>
              {opcjeOkresu.map((p) => (
                <option key={p} value={p}>
                  {p} {odmiana(p, ["miesiąc", "miesiące", "miesięcy"])}
                </option>
              ))}
            </select>
          </Pole>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Pole etykieta="Narzut — umowa o pracę">
              <ZSufiksem
                sufiks="%"
                inputMode="decimal"
                value={d.narzut_umowa ?? ""}
                onChange={(e) => set("narzut_umowa", e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder="0"
              />
            </Pole>
            <Pole etykieta="Narzut — zlecenie">
              <ZSufiksem
                sufiks="%"
                inputMode="decimal"
                value={d.narzut_zlecenie ?? ""}
                onChange={(e) => set("narzut_zlecenie", e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder="0"
              />
            </Pole>
          </div>
          <span className={podpowiedzCls}>
            Koszty pracodawcy ponad wynagrodzenie (ZUS itd.). Puste = 0, czyli koszt liczy się z samej wypłaty.
          </span>
          {zeroUmowa || zeroZlecenie ? (
            <Ostrzezenie>
              Przy 0% ({[zeroUmowa && "umowa o pracę", zeroZlecenie && "zlecenie"].filter(Boolean).join(", ")})
              Raporty i koszty pokazują tylko wypłaty, bez kosztów pracodawcy.
            </Ostrzezenie>
          ) : (
            <span className={podpowiedzCls}>
              Przykład: 4 700 zł na umowie o pracę ={" "}
              <b className="text-[#171714]">{zl(4700 * (1 + liczbaLubNull(d.narzut_umowa) / 100))}</b> kosztu.
            </span>
          )}
        </Akordeon>

        {/* Jak w tym lokalu wpisuje się godziny (utils/wpisy.ts, migracja
            0036) i kiedy niezakończona zmiana przestaje uchodzić za trwającą
            (utils/porzucone.ts, 0023). Jedna sekcja, bo to jedno pytanie:
            co pracownik może zapisać sam, a co trafia do kierownika.
            Wszystko puste = zachowanie sprzed tych ustawień. */}
        <Akordeon
          id="wpisy"
          ikona={Clock}
          tytul="Rejestracja godzin"
          podsumowanie={`${trybLabel} · start ${opisOkna(rw.startWstecz)} · koniec ${opisOkna(rw.koniecWstecz)}`}
          otwarta={!!otwarte.wpisy}
          onToggle={() => toggle("wpisy")}
        >
          <div className="flex flex-col gap-1.5">
            <span className={etykietaCls}>Sposób wpisu</span>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2" role="radiogroup">
              {TRYBY_WPISU.map((tr) => {
                const wybrany = (d.tryb_wpisu || null) === tr.key;
                return (
                  <button
                    key={tr.label}
                    type="button"
                    role="radio"
                    aria-checked={wybrany}
                    onClick={() => set("tryb_wpisu", tr.key)}
                    className={`text-left p-3 rounded-lg border-[2px] flex flex-col gap-1 ${
                      wybrany
                        ? "bg-[#171714] border-[#171714] text-white"
                        : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                    }`}
                    data-tryb-wpisu={tr.key || "oba"}
                  >
                    <span className="font-extrabold flex items-center gap-2">
                      <span className="w-[18px] h-[18px] rounded-full border-[2px] border-current grid place-items-center flex-shrink-0">
                        {wybrany && <i className="w-2 h-2 rounded-full bg-current" />}
                      </span>
                      {tr.label}
                    </span>
                    <span className="text-[13px] leading-[18px] opacity-80">{tr.opis}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ["start_wstecz_min", "Spóźniony start"],
              ["koniec_wstecz_min", "Spóźniony koniec"],
            ].map(([pole, etykieta]) => (
              <div key={pole} className="flex flex-col gap-1.5">
                <Pole etykieta={etykieta}>
                  <ZSufiksem
                    sufiks="min"
                    inputMode="numeric"
                    value={d[pole] ?? ""}
                    onChange={(e) => set(pole, e.target.value.replace(/\D/g, ""))}
                    placeholder="bez limitu"
                  />
                </Pole>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    ["", "bez limitu"],
                    ["0", "tylko teraz"],
                    ["15", "15"],
                    ["30", "30"],
                    ["60", "60"],
                  ].map(([v, l]) => (
                    <Chip key={v || "brak"} wlaczony={norm(d[pole]) === v} onClick={() => set(pole, v)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <span className={podpowiedzCls}>
            O ile minut po fakcie pracownik może sam wpisać godzinę rozpoczęcia i zakończenia (przy „całej
            zmianie” liczy się koniec). Godzina spoza okna nie przepada — pracownik wysyła ją do Ciebie i
            zatwierdzasz ją w Zatwierdzaniu zmian.
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Pole etykieta="Zamknięcie: po grafiku">
              <ZSufiksem
                sufiks="godz."
                inputMode="decimal"
                value={d.tolerancja_po_grafiku_h ?? ""}
                onChange={(e) => set("tolerancja_po_grafiku_h", e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder={String(TOLERANCJA_PO_GRAFIKU_H)}
              />
            </Pole>
            <Pole etykieta="Zamknięcie: bez grafiku">
              <ZSufiksem
                sufiks="godz."
                inputMode="decimal"
                value={d.max_dlugosc_zmiany_h ?? ""}
                onChange={(e) => set("max_dlugosc_zmiany_h", e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder={String(MAX_DLUGOSC_ZMIANY_H)}
              />
            </Pole>
          </div>
          <div className="bg-[#F6F5F1] rounded-lg px-3.5 py-3" data-os-czasu>
            <span className={etykietaCls}>Jak to działa · przykład</span>
            <div className="relative h-[34px] mt-2.5 mb-1">
              <span className="absolute left-0 right-0 top-[13px] h-2 rounded bg-[#ECEBE6]" />
              <span
                className="absolute top-[9px] h-4 rounded bg-[#171714]"
                style={{ left: skala(10), width: `${(8 / 24) * 84}%` }}
              />
              <span
                className="absolute top-[9px] h-4 rounded-r border-[1.5px] border-l-0 border-dashed border-[#8A5300]"
                style={{
                  left: skala(18),
                  width: `${(Math.min(poGrafiku, 14) / 24) * 84}%`,
                  background: "repeating-linear-gradient(135deg,#FDF0D8 0 6px,#F2D9A8 6px 12px)",
                }}
              />
              {[
                [10, "10:00"],
                [18, "18:00"],
                [18 + Math.min(poGrafiku, 14), koniecOkna],
              ].map(([h, t]) => (
                <span
                  key={t + h}
                  className="absolute top-7 -translate-x-1/2 text-[11px] font-bold text-[#6E6E66] whitespace-nowrap"
                  style={{ left: skala(h) }}
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="text-[13px] leading-[18px] text-[#6E6E66] mt-3.5 [&_b]:text-[#171714]">
              Zmiana w grafiku <b>10:00–18:00</b>: pracownik może ją sam zamknąć do <b>{koniecOkna}</b>. Bez
              grafiku — do <b>{String(bezGrafiku).replace(".", ",")} h od startu</b>. Potem zmiana przestaje być
              trwającą i trafia do Zatwierdzania zmian; godziny do Twojej decyzji liczą się jako zero.
            </p>
          </div>
        </Akordeon>

        {/* Archiwizacja w osobnej sekcji, daleko od "Zapisz" — z
            potwierdzeniem na miejscu zamiast okna przeglądarki. */}
        <div className="bg-white border-[2px] border-[#DEDCD4] rounded-xl px-4 md:px-5 py-4 flex flex-wrap gap-3 items-center mt-1">
          <div className="flex-1 min-w-[200px]">
            <b className="block text-[#171714]">Przenieś lokal do archiwum</b>
            <span className={podpowiedzCls}>
              Znika z wyboru u góry i z Grafiku. Historia godzin i kosztów zostaje.
            </span>
          </div>
          {potwierdzArchiwum ? (
            <>
              <button type="button" className={btnObrysCls} onClick={() => setPotwierdzArchiwum(false)}>
                Anuluj
              </button>
              <button
                type="button"
                className={btnGlownyCls}
                data-archiwizuj-lokal-tak
                onClick={async () => {
                  setPotwierdzArchiwum(false);
                  if (await onArchive("lokale", d.id, true, { potwierdzone: true })) setEditingDict(null);
                }}
              >
                <Archive size={18} /> Tak, do archiwum
              </button>
            </>
          ) : (
            <button
              type="button"
              className={btnObrysCls}
              onClick={() => setPotwierdzArchiwum(true)}
              data-archiwizuj-lokal
            >
              <Archive size={18} /> Do archiwum
            </button>
          )}
        </div>

        {zmieniony && (
          <div
            className="sticky bottom-0 z-30 flex flex-wrap items-center gap-3 p-2.5 pl-4 bg-[#171714] text-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
            data-pasek-zapisu-lokalu
          >
            <span className="font-bold w-full md:w-auto md:mr-auto">
              Niezapisane zmiany
              <small className="font-medium opacity-75 text-sm ml-1.5">{zapisanyLokal.name}</small>
            </span>
            <button
              type="button"
              onClick={() => setEditingDict({ ...zapisanyLokal })}
              className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg border-[2px] border-white/80 font-bold text-[15px] flex-1 md:flex-none"
            >
              Anuluj
            </button>
            <button type="submit" className={`${btnGlownyCls} flex-1 md:flex-none`}>
              <Check size={18} /> Zapisz
            </button>
          </div>
        )}
      </form>
    );
  };

  // ------------------------------------------------------------ Stanowiska
  const formularzStanowiska = () => {
    const d = editingDict;
    const kolory = d.kolor && !PALETA.includes(String(d.kolor).toUpperCase()) ? [d.kolor, ...PALETA] : PALETA;
    return (
      <form
        onSubmit={(e) => onSaveDict(e, "stanowiska")}
        className="md:col-span-2 bg-[#F6F5F1] border-[2px] border-[#171714] rounded-xl p-3.5 flex flex-col gap-3"
        data-edycja-stanowiska
      >
        {!d.id && <b className="font-['Archivo'] text-base">Nowe stanowisko</b>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Pole etykieta="Nazwa">
            <input
              type="text"
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              required
              autoFocus
            />
          </Pole>
          <Pole etykieta="Skrót (np. „KUCH”)" podpowiedz="Puste = z pierwszych liter nazwy.">
            <input
              type="text"
              value={d.skrot || ""}
              onChange={(e) => set("skrot", e.target.value.toUpperCase())}
              maxLength={4}
              placeholder={d.name ? stanowiskoShort([], null, d.name) : "opcjonalnie"}
              className={`${inputCls} uppercase`}
            />
          </Pole>
        </div>
        <Pole etykieta="Lokal">
          <select
            value={d.lokal_name}
            onChange={(e) => set("lokal_name", e.target.value)}
            className={selectCls}
            required
          >
            {/* Stanowisko z lokalu w archiwum musi dać się zapisać bez
                przenosin — jego lokal zostaje na liście. */}
            {!aktywneLokale.some((l) => l.name === d.lokal_name) && d.lokal_name && (
              <option value={d.lokal_name}>{d.lokal_name} (archiwum)</option>
            )}
            {aktywneLokale.map((l) => (
              <option key={l.id} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </Pole>
        <div className="flex flex-col gap-1.5">
          <span className={etykietaCls}>Kolor w Grafiku</span>
          <div className="flex gap-1.5 flex-wrap">
            {kolory.map((c) => {
              const wybrany = String(d.kolor || "").toUpperCase() === String(c).toUpperCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("kolor", c)}
                  aria-label={`Kolor ${c}`}
                  aria-pressed={wybrany}
                  className={`w-8 h-8 rounded-full border-[3px] border-white ${
                    wybrany ? "shadow-[0_0_0_2px_#171714]" : "shadow-[0_0_0_2px_#DEDCD4]"
                  }`}
                  style={{ background: c }}
                  data-kolor={c}
                />
              );
            })}
            <button
              type="button"
              onClick={() => set("kolor", "")}
              aria-pressed={!d.kolor}
              className={`h-8 px-3 rounded-full border-[2px] text-[13px] font-bold ${
                !d.kolor ? "border-[#171714] bg-white" : "border-[#DEDCD4] bg-white text-[#6E6E66]"
              }`}
            >
              bez koloru
            </button>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className={btnObrysCls} onClick={() => setEditingDict(null)}>
            Anuluj
          </button>
          <button type="submit" className={btnGlownyCls}>
            <Check size={18} /> Zapisz
          </button>
        </div>
      </form>
    );
  };

  const renderStanowiska = () => {
    const lista = pokazArchiwum ? archiwalneStanowiska : aktywneStanowiska;
    const edytowane = sekcja === "stanowiska" && editingDict ? editingDict : null;
    // Grupy po lokalu: nazwy stanowisk powtarzają się między lokalami
    // ("Kucharz" jest wszędzie). Najpierw lokale czynne, potem te z
    // archiwum i nieistniejące — oznaczone, bo takie stanowisko nie pojawi
    // się w Grafiku.
    const grupy = {};
    for (const s of lista) {
      const k = s.lokal_name || "—";
      (grupy[k] = grupy[k] || []).push(s);
    }
    const stanLokalu = (nazwa) =>
      aktywneLokale.some((l) => l.name === nazwa) ? "ok" : archiwalneLokale.some((l) => l.name === nazwa) ? "archiwum" : "brak";
    const nazwyLokali = Object.keys(grupy).sort(
      (a, b) =>
        ["ok", "archiwum", "brak"].indexOf(stanLokalu(a)) - ["ok", "archiwum", "brak"].indexOf(stanLokalu(b)) ||
        a.localeCompare(b, "pl")
    );
    const osierocone = pokazArchiwum
      ? []
      : nazwyLokali.filter((n) => stanLokalu(n) !== "ok").flatMap((n) => grupy[n]);

    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 flex-wrap">
          {!pokazArchiwum && (
            <button
              type="button"
              className={btnMalyGlownyCls}
              onClick={() =>
                setEditingDict({
                  id: null,
                  name: "",
                  skrot: "",
                  kolor: "",
                  lokal_name: aktywneLokale.length > 0 ? aktywneLokale[0].name : "",
                })
              }
              data-dodaj-stanowisko
            >
              <Plus size={16} /> Dodaj stanowisko
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditingDict(null);
              setPokazArchiwum((v) => !v);
            }}
            className={`${linkCls} ml-auto`}
          >
            {pokazArchiwum ? "‹ Aktywne" : `Archiwum · ${archiwalneStanowiska.length}`}
          </button>
        </div>

        {edytowane && !edytowane.id && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">{formularzStanowiska()}</div>
        )}

        {lista.length === 0 && (
          <p className="text-sm text-[#6E6E66]">{pokazArchiwum ? "Archiwum puste." : "Brak stanowisk."}</p>
        )}
        {nazwyLokali.map((lokal) => (
          <div key={lokal} data-grupa-stanowisk={lokal}>
            <h3 className="m-0 mb-2 text-[13px] font-extrabold tracking-[0.06em] uppercase text-[#6E6E66] flex items-center gap-2 flex-wrap">
              {lokal}
              {stanLokalu(lokal) !== "ok" && (
                <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-[#FDF0D8] text-[#8A5300] text-[11px] font-bold normal-case tracking-normal">
                  {stanLokalu(lokal) === "archiwum" ? "lokal w archiwum" : "lokalu nie ma"}
                </span>
              )}
              <span className="font-semibold">· {grupy[lokal].length}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 items-start">
              {grupy[lokal]
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "pl"))
                .map((s) =>
                  edytowane && edytowane.id === s.id ? (
                    <React.Fragment key={s.id}>{formularzStanowiska()}</React.Fragment>
                  ) : (
                    <div
                      key={s.id}
                      className={`${kartaCls} grid grid-cols-[14px_1fr_auto] gap-2.5 items-center pl-3.5 pr-2 py-2 min-h-[60px]`}
                      data-stanowisko={s.name}
                    >
                      <span
                        className={`w-3 h-3 rounded-full ${s.kolor ? "" : "border-[2px] border-[#DEDCD4]"}`}
                        style={s.kolor ? { background: s.kolor } : undefined}
                      />
                      <span className="min-w-0 font-bold truncate">
                        {s.name}
                        <span className="ml-1.5 text-[12px] font-extrabold px-1.5 py-0.5 rounded bg-[#ECEBE6]">
                          {stanowiskoShort(stanowiska, s.lokal_name, s.name)}
                        </span>
                      </span>
                      <span className="flex gap-1.5">
                        {pokazArchiwum ? (
                          <button
                            type="button"
                            className={btnMalyCls}
                            onClick={() => onArchive("stanowiska", s.id, false, { potwierdzone: true })}
                          >
                            <ArchiveRestore size={16} /> Przywróć
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={ikonaBtnCls}
                              aria-label={`Edytuj ${s.name}`}
                              onClick={() => setEditingDict({ ...s })}
                              data-edytuj-stanowisko
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              className={ikonaBtnCls}
                              aria-label={`Do archiwum: ${s.name}`}
                              onClick={() =>
                                decyduj(
                                  [{ klucz: `st:${s.id}`, zadanie: ["archiwizujStanowisko", [s.id]] }],
                                  `Zarchiwizowano: ${s.name} (${s.lokal_name || "bez lokalu"})`
                                )
                              }
                              data-archiwizuj-stanowisko
                            >
                              <Archive size={16} />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  )
                )}
            </div>
          </div>
        ))}

        {osierocone.length > 0 && (
          <p className="flex gap-2 items-start text-sm text-[#6E6E66]">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              {osierocone.map((s) => `${s.name} (${s.lokal_name || "bez lokalu"})`).join(", ")}{" "}
              {osierocone.length === 1 ? "należy" : "należą"} do lokalu, którego nie ma w wyborze — nie{" "}
              {osierocone.length === 1 ? "pojawia" : "pojawiają"} się w Grafiku. Możesz przenieść albo
              zarchiwizować.
            </span>
          </p>
        )}

        {toast && (
          <div className="sticky bottom-0 z-30 pb-1">
            <PasekCofnij opis={toast.opis} onCofnij={cofnij} />
          </div>
        )}
      </div>
    );
  };

  // ----------------------------------------------------------------- Firma
  const renderFirma = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <KartaInfo
        etykieta="Sieć"
        duza={TENANT || <span className="text-[#DE3A22]">&#9888; brak REACT_APP_TENANT</span>}
      >
        <span className="text-sm text-[#6E6E66]">
          Nazwa sieci jest częścią konfiguracji wdrożenia {PRODUKT}. Jeśli trzeba ją zmienić, zgłoś to nam —
          nie da się jej zmienić z tego ekranu.
        </span>
      </KartaInfo>
      <KartaInfo
        etykieta="Konto właściciela"
        duza={currentUser?.name || "—"}
        akcja={
          onOpenEmployee && currentUser?.id ? (
            <button
              type="button"
              className={`${btnMalyCls} self-start mt-1.5`}
              onClick={() => onOpenEmployee(currentUser.id)}
            >
              Otwórz moją kartę <ArrowRight size={16} />
            </button>
          ) : null
        }
      >
        <span className="text-sm text-[#171714]">{maskujEmail(currentUser?.email)}</span>
        <span className="text-sm text-[#6E6E66]">
          Imię, e-mail i PIN zmienisz w swojej karcie w zakładce Pracownicy.
        </span>
      </KartaInfo>
    </div>
  );

  // ----------------------------------------------------------- Subskrypcja
  // Na razie tylko miejsce na przyszłość (ustalenie właściciela 2026-09-24).
  // Subskrypcji nie da się trzymać w bazie klienta — w modelu silo klient
  // mógłby ją sobie sam "przedłużyć" — więc gdy powstanie, jej stan przyjdzie
  // z zewnątrz. Liczniki niżej pokazują to, za co najpewniej będzie się płacić.
  const renderSubskrypcja = () => (
    <div className="max-w-4xl flex flex-col gap-4">
      <KartaInfo
        etykieta={
          <span className="flex items-center gap-2.5">
            Plan
            <span className="ml-auto inline-flex items-center h-[26px] px-2 rounded-md bg-[#ECEBE6] text-[#171714] text-[13px] font-bold normal-case tracking-normal">
              Wkrótce
            </span>
          </span>
        }
      >
        <span className="text-sm text-[#6E6E66]">Tu pojawi się Twój plan, faktury i zmiana zakresu subskrypcji.</span>
      </KartaInfo>
      <h2 className="m-0 mt-2 text-[13px] font-extrabold tracking-[0.07em] uppercase text-[#6E6E66]">Wykorzystanie</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <KartaInfo etykieta="Lokale" duza={aktywneLokale.length}>
          <span className="text-sm text-[#6E6E66]">
            aktywne{archiwalneLokale.length > 0 ? ` · ${archiwalneLokale.length} w archiwum` : ""}
          </span>
        </KartaInfo>
        <KartaInfo etykieta="Pracownicy" duza={aktywniPracownicy.length}>
          <span className="text-sm text-[#6E6E66]">aktywne konta</span>
        </KartaInfo>
        <KartaInfo etykieta="Tablety" duza={tablety.length}>
          <span className="text-sm text-[#6E6E66]">Tablet Służbowy</span>
        </KartaInfo>
      </div>
    </div>
  );

  const liczniki = { lokale: aktywneLokale.length, stanowiska: aktywneStanowiska.length };

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col" data-ustawienia>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <h2 className="hidden md:block m-0 font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714]">
          Ustawienia
        </h2>
        <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#ECEBE6] text-[13px] font-bold md:ml-auto">
          <Lock size={14} /> Widzi tylko właściciel
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-[18px] [scrollbar-width:none]">
        {SEKCJE.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => przejdz(s.key)}
            className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border-[2px] font-bold text-sm whitespace-nowrap ${
              sekcja === s.key
                ? "bg-[#171714] border-[#171714] text-white"
                : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
            }`}
            data-zakladka-ustawien={s.key}
          >
            {s.label}
            {liczniki[s.key] != null && (
              <span className={`tabular-nums ${sekcja === s.key ? "text-white/75" : "text-[#6E6E66]"}`}>
                {liczniki[s.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {sekcja === "lokale" && renderLokale()}
      {sekcja === "stanowiska" && renderStanowiska()}
      {sekcja === "firma" && renderFirma()}
      {sekcja === "subskrypcja" && renderSubskrypcja()}

      {nowyLokal && (
        <MalyModal
          tytul="Dodaj lokal"
          onSubmit={zapiszNowyLokal}
          onCancel={() => setEditingDict(null)}
          zapiszLabel="Dodaj"
        >
          <Pole etykieta="Nazwa">
            <input
              type="text"
              value={editingDict.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              required
              autoFocus
            />
          </Pole>
          <Pole etykieta="Miasto (do pogody)">
            <input
              type="text"
              value={editingDict.miasto || ""}
              onChange={(e) => set("miasto", e.target.value)}
              placeholder="np. Koszalin"
              className={inputCls}
            />
          </Pole>
          <span className={podpowiedzCls}>
            Resztę (bloki na telefonie, płace, progi zmian) ustawisz w karcie lokalu, która otworzy się po
            dodaniu. Puste pola działają z wartościami domyślnymi.
          </span>
        </MalyModal>
      )}
    </div>
  );
}
