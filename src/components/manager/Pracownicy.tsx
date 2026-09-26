// @ts-nocheck
// Pracownicy — lista po lewej, karta osoby po prawej (makieta właściciela z
// 2026-09-25, PeopleDesktop / PeopleMobile). WSZYSTKIE pola dotychczasowej
// karty zostają; zmienia się kolejność, grupowanie i stany:
//   - lista: Aktywni / Archiwum, szukanie, filtr "Braki w danych", inicjały,
//     krótkie znaczniki "brak: sanepid / umowa / stawka"; Tablety Służbowe w
//     osobnej grupie "Urządzenia";
//   - nagłówek karty: imię, stanowisko · lokal, "Konto aktywne" jako
//     przełącznik i JEDNO podsumowanie braków z "Uzupełnij" (skok do pola);
//   - skróty do sekcji przyklejone u góry przy przewijaniu;
//   - sekcje jako osobne karty;
//   - puste daty wyglądają na puste, brakujące terminy są bursztynowe;
//   - pasek "Niezapisane zmiany · Anuluj · Zapisz zmiany" pojawia się TYLKO po
//     zmianie i trzyma się dołu ekranu; przejście do innej osoby z
//     niezapisanymi zmianami pyta, zanim cokolwiek porzuci.
//
// Lokale/Stanowiska stały tu do 0.44.0 — dziś są w Ustawieniach.
//
// Wymagane pola: imię, lokal, stanowisko (poza tabletem, który ich nie ma),
// typ konta; przy roli innej niż "open" dodatkowo e-mail + PIN. Reszta
// opcjonalna.
import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Palmtree,
  Plus,
  Search,
  Star,
  Tablet,
  Trash2,
} from "lucide-react";
import { czekaNaDecyzje } from "../../utils/probni";
import { getMonthName } from "../../utils/format";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { odmiana } from "../../utils/czas";
import {
  TYPY_UMOWY,
  WYMIARY_ETATU,
  typUmowy,
  naEtacie,
  normaMiesiaca,
  stawkaEfektywna,
  kosztMiesiaca,
  nadwyzkaPonadNorme,
  bilansOkresu,
  opisBilansu,
} from "../../utils/umowy";
import { zakresLudzki } from "./Skrzynka";
import { useOdlozoneDecyzje, PasekCofnij } from "./odlozoneDecyzje";

// ---------------------------------------------------------------------------
// Klasy (tokeny "Shiftro")
// ---------------------------------------------------------------------------
const kartaCls = "bg-white border-[2px] border-[#171714] rounded-xl";
const etykietaCls = "block text-[12px] leading-4 font-bold tracking-[0.06em] uppercase text-[#6E6E66] mb-1.5";
const poleCls =
  "w-full h-12 md:h-11 px-3 border-[2px] border-[#171714] rounded-md bg-white text-[15px] text-[#171714] disabled:bg-[#F6F5F1] disabled:text-[#8F8E86]";
const polePusteCls = "border-[#8A5300] bg-[#FDF0D8]";
const podpisCls = "text-[12px] leading-4 text-[#6E6E66] mt-1.5";
const btnCls =
  "inline-flex items-center justify-center gap-2 min-h-[48px] md:min-h-[44px] px-4 rounded-lg border-[2px] font-['Archivo'] font-bold text-[15px] whitespace-nowrap disabled:opacity-50";
const btnObrysCls = `${btnCls} border-[#171714] bg-white text-[#171714] hover:bg-[#F6F5F1]`;
const btnGlownyCls = `${btnCls} border-[#DE3A22] bg-[#DE3A22] text-white hover:bg-[#B8321A] hover:border-[#B8321A]`;
const brakTagCls =
  "inline-flex items-center h-5 px-1.5 rounded bg-[#FDF0D8] text-[#8A5300] text-[11px] font-bold whitespace-nowrap";

const fmtH = (n) => (Math.round((n || 0) * 10) / 10).toString().replace(".", ",");
const miesiaceLabel = (n) => `${n} ${odmiana(n, ["miesiąc", "miesiące", "miesięcy"])}`;
const dzisYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const roleLabel = (role) =>
  ({
    closed: "Konto prywatne",
    open: "Konto otwarte (kiosk)",
    kiosk: "Tablet służbowy",
    manager_lokalu: "Kierownik lokalu",
    manager: "Właściciel",
    admin: "Szef (Admin)",
  }[role] || role);

const inicjaly = (imie) => {
  const slowa = String(imie || "").trim().split(/\s+/).filter(Boolean);
  if (slowa.length >= 2) return (slowa[0][0] + slowa[1][0]).toUpperCase();
  return (slowa[0] || "?").slice(0, 2).toUpperCase();
};

const allowedArr = (u) =>
  Array.isArray(u.allowed_lokale)
    ? u.allowed_lokale
    : u.allowed_lokale
    ? u.allowed_lokale.split(",").map((s) => s.trim())
    : [];

// allowed_stanowiska — ten sam format co allowed_lokale (tekst po przecinku,
// NIE tablica Postgresa). Bez default_stanowisko, bo ono zawsze liczy się jako
// "umie" i jest doklejane dopiero przy odczycie (allowedStanowiskaArr w
// utils/grafik.ts).
const allowedStanArr = (u) =>
  Array.isArray(u.allowed_stanowiska)
    ? u.allowed_stanowiska
    : u.allowed_stanowiska
    ? u.allowed_stanowiska.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

// Czego brakuje w karcie — to samo mówi znacznik na liście, filtr "Braki w
// danych" i pasek w nagłówku karty. Umowa bezterminowa nie ma terminu, bo go
// nie ma — to co innego niż termin, którego nikt nie wpisał.
const brakiOsoby = (u) => {
  if (!u || u.role === "kiosk" || czekaNaDecyzje(u)) return [];
  const braki = [];
  if (!u.sanepid_expiry) braki.push({ klucz: "sanepid", tag: "sanepid", opis: "termin sanepid", pole: "pole-sanepid", termin: true });
  if (!u.umowa_expiry && !u.umowa_bezterminowa)
    braki.push({ klucz: "umowa", tag: "umowa", opis: "termin umowy", pole: "pole-umowa", termin: true });
  const bezKwoty = naEtacie(u)
    ? u.wynagrodzenie_mies == null || u.wynagrodzenie_mies === ""
    : u.stawka == null || u.stawka === "";
  if (bezKwoty)
    braki.push({
      klucz: "stawka",
      tag: naEtacie(u) ? "wynagrodzenie" : "stawka",
      opis: naEtacie(u) ? "wynagrodzenie" : "stawka",
      pole: "pole-stawka",
    });
  return braki;
};

// PIN łatwy do zgadnięcia: jedna cyfra, ciąg (123456, 654321) albo powtarzany
// wzór (121212, 123123). Na tablecie stojącym na sali to pierwsze, co ktoś
// spróbuje.
const slabyPin = (pin) => {
  const p = String(pin || "");
  if (!/^\d{6}$/.test(p)) return false;
  if (/^(\d)\1+$/.test(p)) return true;
  const cyfry = p.split("").map(Number);
  const rosnaco = cyfry.every((c, i) => i === 0 || c === (cyfry[i - 1] + 1) % 10);
  const malejaco = cyfry.every((c, i) => i === 0 || c === (cyfry[i - 1] + 9) % 10);
  if (rosnaco || malejaco) return true;
  return p.slice(0, 2).repeat(3) === p || p.slice(0, 3).repeat(2) === p;
};

// Porównanie karty z tym, co jest zapisane — od tego zależy pasek "Zapisz".
// Pola techniczne i wyliczane pomijamy; tablica i tekst po przecinku to ta
// sama wartość; puste, null i false też.
const POMIJANE = ["ma_kiosk_pin", "notatki_updated_by", "notatki_updated_at", "created_at"];
const norm = (v) => {
  if (v == null || v === false) return "";
  if (Array.isArray(v)) return v.filter(Boolean).map(String).sort().join(",");
  const s = String(v);
  return s.includes(",") ? s.split(",").map((x) => x.trim()).filter(Boolean).sort().join(",") : s;
};
const rozniSie = (a, b) => {
  if (!a || !b) return false;
  const klucze = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...klucze].some((k) => !POMIJANE.includes(k) && norm(a[k]) !== norm(b[k]));
};

// ---------------------------------------------------------------------------
// Komponenty na poziomie modułu (błąd #10 w CLAUDE.md).
// ---------------------------------------------------------------------------
function Sekcja({ id, tytul, prawa, children }) {
  return (
    <section id={id} className={`${kartaCls} p-4 md:p-5 scroll-mt-16`} data-sekcja={id}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-['Archivo'] font-extrabold text-[17px] text-[#171714] flex items-center gap-2">
          {tytul}
        </h3>
        {prawa && <span className="ml-auto">{prawa}</span>}
      </div>
      {children}
    </section>
  );
}

function Pole({ etykieta, podpis, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {etykieta && <label className={etykietaCls}>{etykieta}</label>}
      {children}
      {podpis}
    </div>
  );
}

function Przelacznik({ wlaczony, onZmiana, etykieta, ...reszta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!wlaczony}
      onClick={() => onZmiana(!wlaczony)}
      className="inline-flex items-center gap-2.5 font-bold text-[15px] text-[#171714]"
      {...reszta}
    >
      <span
        className={`relative w-11 h-6 rounded-full border-[2px] transition-colors ${
          wlaczony ? "bg-[#1F7A4A] border-[#1F7A4A]" : "bg-white border-[#171714]"
        }`}
      >
        <i
          className={`absolute top-[2px] w-4 h-4 rounded-full transition-all ${
            wlaczony ? "left-[22px] bg-white" : "left-[2px] bg-[#171714]"
          }`}
        />
      </span>
      {etykieta}
    </button>
  );
}

function BrakTerminu() {
  return (
    <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#8A5300] mt-1.5">
      <AlertTriangle size={14} /> Brak terminu — przypomnienia wyłączone
    </p>
  );
}

// ---------------------------------------------------------------------------
export default function Pracownicy({
  visibleUsers,
  archivedUsers,
  editingUser,
  setEditingUser,
  onNewUser,
  onSave,
  onArchive,
  onPermanentDelete,
  isLocalManager,
  availableLokaleForManager,
  activeLokale,
  activeStanowiska,
  shifts,
  absences = [],
  // Lokal z górnego paska panelu ("ALL" = cała sieć / wszystkie moje).
  wybranyLokal = "ALL",
  onAddUrlop,
  onDeleteAbsence,
  showMsg,
}) {
  const [view, setView] = useState("aktywni"); // "aktywni" | "archiwum"
  const [szukaj, setSzukaj] = useState("");
  const [tylkoBraki, setTylkoBraki] = useState(false);
  const [pokazPin, setPokazPin] = useState(false);
  const [potwierdzArchiwum, setPotwierdzArchiwum] = useState(false);
  const [urlopFrom, setUrlopFrom] = useState("");
  const [urlopTo, setUrlopTo] = useState("");
  const [urlopSaving, setUrlopSaving] = useState(false);

  useEffect(() => {
    setUrlopFrom("");
    setUrlopTo("");
    setPokazPin(false);
    setPotwierdzArchiwum(false);
  }, [editingUser?.id]);

  // Usunięcie wpisu urlopu — z 6 s na "Cofnij" zamiast window.confirm.
  const { odlozone, toast, decyduj, cofnij } = useOdlozoneDecyzje({
    usunUrlop: async (a) => {
      try {
        await onDeleteAbsence(a);
      } catch (err) {
        showMsg?.(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
      }
    },
  });

  const handleAddUrlopClick = async () => {
    if (!urlopFrom || !urlopTo) return showMsg?.("Podaj daty od-do!", "error");
    if (urlopTo < urlopFrom)
      return showMsg?.("Data „do” nie może być wcześniejsza niż „od”.", "error");
    setUrlopSaving(true);
    try {
      await onAddUrlop(editingUser, urlopFrom, urlopTo);
      setUrlopFrom("");
      setUrlopTo("");
      showMsg?.("Urlop zapisany!");
    } catch (err) {
      showMsg?.(`Błąd zapisu urlopu: ${err.message || "nieznany błąd"}`, "error");
    }
    setUrlopSaving(false);
  };

  const isNew = editingUser && editingUser.id === null;
  const isEmailPinRequired = editingUser && editingUser.role !== "open";
  const showTermWarnings = editingUser && !!editingUser.id;
  const tablet = editingUser?.role === "kiosk";
  const ustaw = (zmiany) => setEditingUser({ ...editingUser, ...zmiany });

  // Co było zapisane — bez tego nie wiadomo, czy pokazać pasek "Zapisz".
  const oryginal = editingUser?.id
    ? [...visibleUsers, ...archivedUsers].find((u) => u.id === editingUser.id) || null
    : null;
  const zmieniony = !!editingUser && (isNew || rozniSie(editingUser, oryginal));
  const moznaPorzucic = () =>
    !zmieniony ||
    window.confirm(
      `Karta ${editingUser.name || "nowego pracownika"} ma niezapisane zmiany. Porzucić je?`
    );
  const wybierz = (u) => {
    if (editingUser && u && editingUser.id === u.id) return;
    if (!moznaPorzucic()) return;
    setEditingUser(u ? { ...u } : null);
  };
  const anulujZmiany = () => {
    if (isNew || !oryginal) return setEditingUser(null);
    setEditingUser({ ...oryginal });
  };

  const dostepneStanowiska = editingUser
    ? activeStanowiska.filter((s) => s.lokal_name === editingUser.default_lokal)
    : [];

  const now = new Date();
  // Godziny tej osoby w dowolnym miesiącu — bilans okresu rozliczeniowego
  // potrzebuje ich dla kilku miesięcy wstecz, nie tylko dla bieżącego.
  const godzinyWMiesiacu = (rok, mies) =>
    editingUser?.id
      ? shifts
          .filter(
            (s) =>
              s.user_id === editingUser.id &&
              s.start_time.getFullYear() === rok &&
              s.start_time.getMonth() === mies - 1
          )
          .reduce((a, s) => a + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0), 0)
      : 0;
  const monthHours = godzinyWMiesiacu(now.getFullYear(), now.getMonth() + 1);

  // Okres rozliczeniowy i narzut pracodawcy są ustawieniem lokalu, nie
  // pracownika (patrz migracja 0018) — bierzemy je z jego lokalu macierzystego.
  const lokalPracownika = editingUser
    ? activeLokale.find((l) => l.name === editingUser.default_lokal) || null
    : null;
  const normaBiezaca = editingUser
    ? normaMiesiaca(editingUser, now.getFullYear(), now.getMonth() + 1)
    : null;
  const stawkaEfekt = editingUser
    ? stawkaEfektywna(editingUser, now.getFullYear(), now.getMonth() + 1)
    : null;
  // Godziny ponad normę lokal dopłaca po stawce z umowy — podpis pod kwotą
  // musi to powiedzieć, inaczej liczba wygląda na niezgodną z umową.
  const nadwyzkaMies = editingUser
    ? nadwyzkaPonadNorme(editingUser, monthHours, now.getFullYear(), now.getMonth() + 1)
    : null;
  const monthCost = editingUser
    ? kosztMiesiaca({
        user: editingUser,
        godziny: monthHours,
        lokalRow: lokalPracownika,
        rok: now.getFullYear(),
        mies: now.getMonth() + 1,
      })
    : null;
  const bilans = editingUser
    ? bilansOkresu({ user: editingUser, godzinyMiesiaca: godzinyWMiesiacu, lokalRow: lokalPracownika })
    : null;
  const opisBilansuTekst = opisBilansu(bilans);

  // Nazwy stanowisk powtarzają się między lokalami (osobny wiersz na lokal),
  // a pracownik bywa przypisany do kilku lokali — dla tej listy liczy się
  // sama nazwa, więc deduplikujemy.
  const wszystkieNazwyStanowisk = [...new Set(activeStanowiska.map((s) => s.name))].sort((a, b) =>
    a.localeCompare(b, "pl")
  );

  // Lista idzie za lokalem z górnego paska, jak reszta panelu (prośba
  // właściciela z 2026-09-25). Do lokalu należy osoba, która ma go jako
  // default_lokal ALBO w allowed_lokale — tablety i kierownicy mają pusty
  // default_lokal i bez drugiego warunku znikałyby z listy własnego lokalu
  // (ta sama pułapka, którą naprawiała migracja 0034, patrz CLAUDE.md).
  const lokaleOsoby = (u) => [u.default_lokal, ...allowedArr(u)].filter(Boolean);
  const wLokalu = (u) => wybranyLokal === "ALL" || lokaleOsoby(u).includes(wybranyLokal);
  // Sortowanie po lokalu, potem po nazwisku: przy "Cała sieć" lista układa
  // się w grupy z nagłówkami. Osoby bez lokalu (konto właściciela) na końcu.
  const lokalDoSortu = (u) => (wybranyLokal !== "ALL" ? wybranyLokal : lokaleOsoby(u)[0] || "");
  const posortuj = (lista) =>
    lista
      .filter(wLokalu)
      .sort(
        (a, b) =>
          (lokalDoSortu(a) === "") - (lokalDoSortu(b) === "") ||
          lokalDoSortu(a).localeCompare(lokalDoSortu(b), "pl") ||
          (a.name || "").localeCompare(b.name || "", "pl")
      );
  const aktywniWLokalu = posortuj(visibleUsers);
  const archiwumWLokalu = posortuj(archivedUsers);
  const list = view === "aktywni" ? aktywniWLokalu : archiwumWLokalu;
  const q = szukaj.trim().toLowerCase();
  const pasuje = (u) =>
    !q || `${u.name} ${u.default_stanowisko || ""} ${u.default_lokal || ""}`.toLowerCase().includes(q);
  const osobyWszystkie = list.filter((u) => u.role !== "kiosk");
  const zBrakami = osobyWszystkie.filter((u) => brakiOsoby(u).length > 0);
  const osoby = osobyWszystkie.filter(pasuje).filter((u) => !tylkoBraki || brakiOsoby(u).length > 0);
  // Tablety nie mają terminów ani stawek — przy filtrze "Braki w danych" znikają.
  const urzadzenia = tylkoBraki ? [] : list.filter((u) => u.role === "kiosk").filter(pasuje);
  const liczbaUrzadzen = list.filter((u) => u.role === "kiosk").length;

  const zakres = wybranyLokal !== "ALL" ? wybranyLokal : isLocalManager ? "Wszystkie moje" : "Cała sieć";
  const braki = brakiOsoby(editingUser);
  const brakiTerminow = braki.filter((b) => b.termin);
  const brakiInne = braki.filter((b) => !b.termin);
  const idzDo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el.focus && el.focus(), 350);
  };

  // Skróty do sekcji — tylko tych, które ta karta ma.
  const skroty = editingUser
    ? [
        ["sekcja-dane", "Dane"],
        ["sekcja-logowanie", "Logowanie"],
        ["sekcja-miejsce", "Miejsce pracy"],
        ...(!tablet ? [["sekcja-umowa", "Umowa"], ["sekcja-dokumenty", "Dokumenty"]] : []),
        ...(!tablet && !isNew ? [["sekcja-urlopy", "Urlopy"]] : []),
        ["sekcja-koniec", tablet ? "Notatki" : "Koniec i notatki"],
      ]
    : [];

  const pin = editingUser ? (editingUser.role === "open" ? editingUser.kiosk_pin : editingUser.pin) || "" : "";
  const pinZaKrotki = pin.length > 0 && pin.length !== 6;

  const urlopy = editingUser?.id
    ? absences
        .filter((a) => a.user_id === editingUser.id && !odlozone[`urlop:${a.id}`])
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    : [];
  const dniRoboczeWybrane =
    urlopFrom && urlopTo && urlopTo >= urlopFrom ? countWorkdays(urlopFrom, urlopTo) : null;

  const wierszListy = (u, urzadzenie = false) => {
    const wybrany = editingUser && editingUser.id === u.id;
    const b = view === "aktywni" ? brakiOsoby(u) : [];
    return (
      <button
        key={u.id}
        type="button"
        onClick={() => wybierz(u)}
        className={`w-full text-left grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center px-4 py-3 border-t-[1.5px] border-[#DEDCD4] border-l-[3px] ${
          wybrany ? "bg-[#FFF3EF] border-l-[#DE3A22]" : "border-l-transparent hover:bg-[#F6F5F1]"
        }`}
        data-osoba-listy={u.name}
      >
        <span
          className={`w-10 h-10 rounded-full grid place-items-center font-['Archivo'] font-extrabold text-[14px] ${
            urzadzenie ? "rounded-lg bg-[#F6F5F1] border-[2px] border-[#DEDCD4]" : "bg-[#ECEBE6] text-[#171714]"
          }`}
        >
          {urzadzenie ? <Tablet size={18} /> : inicjaly(u.name)}
        </span>
        <span className="min-w-0">
          <span className="block font-['Archivo'] font-bold text-[15px] text-[#171714] truncate">{u.name}</span>
          <span className="block text-[12px] text-[#6E6E66] truncate">
            {urzadzenie
              ? "Tablet służbowy"
              : [u.default_stanowisko || roleLabel(u.role), u.default_lokal].filter(Boolean).join(" · ")}
          </span>
          {(czekaNaDecyzje(u) || b.length > 0) && (
            <span className="flex flex-wrap gap-1 mt-1">
              {czekaNaDecyzje(u) && <span className={brakTagCls}>na próbę</span>}
              {b.map((x) => (
                <span key={x.klucz} className={brakTagCls}>
                  brak: {x.tag}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronRight size={16} className="md:hidden text-[#6E6E66]" />
      </button>
    );
  };

  // Grupy osób: przy jednym lokalu jedna ("Osoby"), przy całej sieci — po lokalu.
  const grupyOsob = [];
  osoby.forEach((u) => {
    const nazwa = wybranyLokal === "ALL" ? lokalDoSortu(u) || "Bez lokalu" : "Osoby";
    const g = grupyOsob.find((x) => x.nazwa === nazwa);
    if (g) g.lista.push(u);
    else grupyOsob.push({ nazwa, lista: [u] });
  });
  const naglowekGrupyCls =
    "flex justify-between px-4 py-2 bg-[#F6F5F1] border-t-[1.5px] border-[#DEDCD4] text-[12px] font-extrabold tracking-[0.06em] uppercase text-[#6E6E66]";

  return (
    <div className="max-w-[1180px] mx-auto" data-pracownicy>
      {/* Na telefonie otwarta karta zajmuje cały ekran — nagłówek listy
          zjadałby miejsce nad nią (wraca się linkiem "‹ Pracownicy"). */}
      <div className={`${editingUser ? "hidden md:flex" : "flex"} flex-wrap items-end gap-3 mb-5`}>
        <div className="mr-auto">
          <h2 className="font-['Archivo'] text-[26px] md:text-[30px] leading-9 font-extrabold text-[#171714]">
            Pracownicy
          </h2>
          <p className="text-[#6E6E66] mt-1">
            {zakres} · {osobyWszystkie.length} {odmiana(osobyWszystkie.length, ["osoba", "osoby", "osób"])}
            {liczbaUrzadzen > 0 &&
              `, ${liczbaUrzadzen} ${odmiana(liczbaUrzadzen, ["urządzenie", "urządzenia", "urządzeń"])}`}
          </p>
        </div>
        {view === "aktywni" && (
          <button type="button" onClick={() => moznaPorzucic() && onNewUser()} className={btnGlownyCls}>
            <Plus size={18} /> Dodaj pracownika
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[330px_minmax(0,1fr)] gap-5 items-start">
        {/* --- Lista --- */}
        <div className={`${!editingUser ? "block" : "hidden md:block"} ${kartaCls} overflow-hidden md:sticky md:top-0`}>
          <div className="p-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 border-[2px] border-[#171714] rounded-lg overflow-hidden">
              {[
                ["aktywni", `Aktywni · ${aktywniWLokalu.length}`],
                ["archiwum", `Archiwum · ${archiwumWLokalu.length}`],
              ].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (view === k || !moznaPorzucic()) return;
                    setView(k);
                    setEditingUser(null);
                  }}
                  className={`h-10 font-['Archivo'] font-bold text-[14px] ${
                    view === k ? "bg-[#171714] text-white" : "bg-white text-[#171714] hover:bg-[#F6F5F1]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="relative">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6E6E66]" />
              <input
                value={szukaj}
                onChange={(e) => setSzukaj(e.target.value)}
                placeholder="Szukaj osoby lub stanowiska…"
                className="w-full h-11 pl-10 pr-3 border-[2px] border-[#171714] rounded-md text-[15px]"
              />
            </span>
            {view === "aktywni" && zBrakami.length > 0 && (
              <button
                type="button"
                aria-pressed={tylkoBraki}
                onClick={() => setTylkoBraki((v) => !v)}
                className={`self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-[2px] text-sm font-bold ${
                  tylkoBraki
                    ? "bg-[#171714] border-[#171714] text-white"
                    : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                }`}
                data-filtr-braki
              >
                <AlertTriangle size={14} /> Braki w danych · {zBrakami.length}
              </button>
            )}
          </div>
          {osoby.length === 0 && urzadzenia.length === 0 && (
            <p className="px-4 py-6 text-sm text-[#6E6E66] text-center border-t-[1.5px] border-[#DEDCD4]">
              {q || tylkoBraki
                ? "Nikt nie pasuje do wyszukiwania."
                : view === "aktywni"
                ? `Brak pracowników${wybranyLokal !== "ALL" ? ` w lokalu ${wybranyLokal}` : ""}.`
                : "Archiwum puste."}
            </p>
          )}
          {grupyOsob.map((g) => (
            <div key={g.nazwa}>
              <div className={naglowekGrupyCls} data-grupa-listy={g.nazwa}>
                <span>{g.nazwa}</span>
                <span>{g.lista.length}</span>
              </div>
              {g.lista.map((u) => wierszListy(u))}
            </div>
          ))}
          {urzadzenia.length > 0 && (
            <div>
              <div className={naglowekGrupyCls} data-grupa-listy="Urządzenia">
                <span>Urządzenia</span>
                <span>{urzadzenia.length}</span>
              </div>
              {urzadzenia.map((u) => wierszListy(u, true))}
            </div>
          )}
        </div>

        {/* --- Karta --- */}
        <div className={editingUser ? "block min-w-0" : "hidden md:block"}>
          {!editingUser && (
            <div className="text-center py-16 px-5 border-[2px] border-dashed border-[#DEDCD4] rounded-xl text-[#6E6E66]">
              <b className="block text-[#171714] text-lg mb-1">Wybierz osobę z listy</b>
              albo dodaj nowego pracownika.
            </div>
          )}
          {editingUser && (
            <form onSubmit={onSave} className="flex flex-col gap-4" data-karta-pracownika>
              <button
                type="button"
                onClick={() => wybierz(null)}
                className="md:hidden self-start flex items-center gap-1 text-[15px] font-bold text-[#171714]"
              >
                <ChevronLeft size={18} /> Pracownicy
              </button>

              {/* Nagłówek karty */}
              <div className={`${kartaCls} p-4 md:p-5`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-14 h-14 rounded-full bg-[#ECEBE6] grid place-items-center font-['Archivo'] font-extrabold text-lg text-[#171714] flex-shrink-0">
                    {tablet ? <Tablet size={22} /> : inicjaly(editingUser.name || "Nowy")}
                  </span>
                  <div className="min-w-0 mr-auto">
                    <h3 className="font-['Archivo'] font-extrabold text-[24px] leading-8 text-[#171714] truncate">
                      {isNew ? "Nowy pracownik" : editingUser.name || "—"}
                    </h3>
                    <p className="text-sm text-[#6E6E66] truncate">
                      {tablet
                        ? `Tablet służbowy${allowedArr(editingUser).length ? ` · ${allowedArr(editingUser).join(", ")}` : ""}`
                        : [editingUser.default_stanowisko || roleLabel(editingUser.role), editingUser.default_lokal]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                  </div>
                  <Przelacznik
                    wlaczony={editingUser.active}
                    onZmiana={(v) => ustaw({ active: v })}
                    etykieta="Konto aktywne"
                    data-konto-aktywne
                  />
                </div>

                {/* Karta wygląda tak samo dla każdego, więc bez tego paska nie
                    widać, że ta osoba nie jest jeszcze przyjęta — a od tego
                    zależy, czy w ogóle warto uzupełniać resztę pól. */}
                {czekaNaDecyzje(editingUser) && (
                  <div className="mt-4 p-3 rounded-lg bg-[#FDF0D8] text-[13px] text-[#8A5300]">
                    <strong>Dodany(-a) na próbę z Tabletu Służbowego</strong>
                    {editingUser.probny_od ? ` ${editingUser.probny_od.split("-").reverse().join(".")}` : ""}
                    {editingUser.probny_przez ? ` przez: ${editingUser.probny_przez}` : ""}. Odbija godziny, ale nie
                    ma jej w Grafiku i nie może się nigdzie zalogować. Decyzja czeka w zakładce Zatwierdzanie zmian.
                  </div>
                )}

                {showTermWarnings && braki.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[#FDF0D8]" data-braki-karty>
                    <AlertTriangle size={18} className="text-[#8A5300] flex-shrink-0" />
                    <span className="flex-1 min-w-[200px] text-[14px] font-bold text-[#8A5300]">
                      Brakuje:{" "}
                      {[
                        brakiTerminow.length
                          ? `${brakiTerminow.map((b) => b.opis).join(", ")} — przypomnienia wyłączone`
                          : "",
                        brakiInne.length ? `${brakiInne.map((b) => b.opis).join(", ")} — koszt niepełny` : "",
                      ]
                        .filter(Boolean)
                        .join("; ")}
                    </span>
                    <button
                      type="button"
                      className={`${btnObrysCls} min-h-[40px] md:min-h-[36px] px-3 text-sm bg-transparent`}
                      onClick={() => idzDo(braki[0].pole)}
                    >
                      Uzupełnij
                    </button>
                  </div>
                )}
              </div>

              {/* Skróty do sekcji — przyklejone u góry przy przewijaniu */}
              <nav className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#F1F0EC] flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {skroty.map(([id, l]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => idzDo(id)}
                    className="inline-flex items-center h-9 px-3 rounded-full border-[2px] border-[#DEDCD4] bg-white text-sm font-semibold text-[#171714] whitespace-nowrap hover:border-[#171714]"
                  >
                    {l}
                  </button>
                ))}
              </nav>

              {/* --- Dane podstawowe --- */}
              <Sekcja id="sekcja-dane" tytul="Dane podstawowe">
                <div className="grid md:grid-cols-2 gap-3">
                  <Pole etykieta="Imię i nazwisko">
                    <input
                      type="text"
                      value={editingUser.name}
                      onChange={(e) => ustaw({ name: e.target.value })}
                      className={poleCls}
                      required
                    />
                  </Pole>
                  <Pole etykieta="Typ pracownika">
                    <select value={editingUser.role} onChange={(e) => ustaw({ role: e.target.value })} className={poleCls}>
                      <option value="closed">Pracownik (Aplikacja na telefon)</option>
                      <option value="open">Pracownik (Otwarte Konto - Kiosk)</option>
                      {!isLocalManager && <option value="kiosk">Konto Służbowe (Tablet lokalu)</option>}
                      {!isLocalManager && <option value="manager_lokalu">Kierownik Lokalu</option>}
                      {!isLocalManager && <option value="admin">Szef (Admin)</option>}
                      {/* Stara rola właściciela — nie do nadania, ale select musi
                          ją mieć wśród opcji, inaczej pokazuje się pusty. */}
                      {editingUser.role === "manager" && <option value="manager">Właściciel</option>}
                    </select>
                  </Pole>
                </div>
                {!tablet && (
                  <div className="grid md:grid-cols-3 gap-3 mt-3">
                    <Pole etykieta="Telefon">
                      <input
                        type="tel"
                        value={editingUser.telefon || ""}
                        onChange={(e) => ustaw({ telefon: e.target.value })}
                        placeholder="opcjonalnie"
                        className={poleCls}
                      />
                    </Pole>
                    <Pole etykieta="Data urodzenia">
                      <input
                        type="date"
                        value={editingUser.data_urodzenia || ""}
                        onChange={(e) => ustaw({ data_urodzenia: e.target.value || null })}
                        className={poleCls}
                      />
                    </Pole>
                    <Pole etykieta="Początek pracy">
                      <input
                        type="date"
                        value={editingUser.data_zatrudnienia || ""}
                        onChange={(e) => ustaw({ data_zatrudnienia: e.target.value || null })}
                        className={poleCls}
                      />
                    </Pole>
                  </div>
                )}
              </Sekcja>

              {/* --- Kontakt i logowanie --- */}
              <Sekcja id="sekcja-logowanie" tytul="Kontakt i logowanie">
                <div className="grid md:grid-cols-2 gap-3">
                  <Pole
                    etykieta={isEmailPinRequired ? "PIN (6 cyfr)" : "PIN blokady (6 cyfr)"}
                    podpis={
                      <>
                        {slabyPin(pin) && (
                          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#8A5300] mt-1.5" data-slaby-pin>
                            <AlertTriangle size={14} /> Łatwy do zgadnięcia PIN — ustaw inny
                          </p>
                        )}
                        {pinZaKrotki && (
                          <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#8A5300] mt-1.5">
                            <AlertTriangle size={14} /> PIN ma mieć dokładnie 6 cyfr
                          </p>
                        )}
                        <p className={podpisCls}>
                          {isEmailPinRequired
                            ? "Tym PIN-em i e-mailem ta osoba loguje się do aplikacji."
                            : "Ten sam PIN otwiera profil na tablecie i loguje na prywatnym telefonie."}
                        </p>
                      </>
                    }
                  >
                    <span className="flex gap-2">
                      {/* PIN ukryty do "Pokaż" — karta bywa otwierana przy
                          ludziach. `new-password`, żeby przeglądarka nie
                          proponowała zapisania go jako hasła kierownika.
                          ⚠️ maxLength 6: do 0.41.1 stało tu 4 i nie dało się
                          wpisać szóstej cyfry (CLAUDE.md, "Logowanie"). */}
                      <input
                        type={pokazPin ? "text" : "password"}
                        inputMode="numeric"
                        autoComplete="new-password"
                        value={pin}
                        onChange={(e) =>
                          ustaw(editingUser.role === "open" ? { kiosk_pin: e.target.value } : { pin: e.target.value })
                        }
                        maxLength="6"
                        placeholder={isEmailPinRequired ? "" : "brak — kiosk nie pyta o PIN"}
                        className={`${poleCls} tracking-[0.2em] ${slabyPin(pin) || pinZaKrotki ? polePusteCls : ""}`}
                        required={isEmailPinRequired}
                      />
                      <button
                        type="button"
                        onClick={() => setPokazPin((v) => !v)}
                        className={`${btnObrysCls} px-3 flex-shrink-0`}
                        aria-label={pokazPin ? "Ukryj PIN" : "Pokaż PIN"}
                      >
                        {pokazPin ? <EyeOff size={17} /> : <Eye size={17} />} {pokazPin ? "Ukryj" : "Pokaż"}
                      </button>
                    </span>
                  </Pole>
                  <Pole
                    etykieta={isEmailPinRequired ? "Email / login" : "Email (do logowania na własnym telefonie)"}
                    podpis={
                      !isEmailPinRequired && (
                        /* Dostęp z prywatnego telefonu wymaga OBU pól naraz —
                           mówimy o tym wprost, bo samo wpisanie jednego z nich
                           nie daje nic i wyglądałoby na awarię. */
                        <p className={podpisCls}>
                          {editingUser.kiosk_pin && editingUser.email
                            ? "Ta osoba może zalogować się na swoim telefonie: tym e-mailem i PIN-em blokady. Zakres widocznych bloków ustawia właściciel w Ustawienia → Lokale."
                            : editingUser.kiosk_pin || editingUser.email
                            ? "Do logowania na własnym telefonie potrzebne są OBA pola — PIN blokady i e-mail. Na razie działa tylko Tablet Służbowy."
                            : "Bez PIN-u i e-maila pracownik korzysta wyłącznie z Tabletu Służbowego."}
                        </p>
                      )
                    }
                  >
                    <input
                      type="email"
                      value={editingUser.email || ""}
                      onChange={(e) => ustaw({ email: e.target.value })}
                      placeholder={isEmailPinRequired ? "" : "opcjonalnie"}
                      className={poleCls}
                      required={isEmailPinRequired}
                    />
                  </Pole>
                </div>
              </Sekcja>

              {/* --- Miejsce pracy --- */}
              <Sekcja id="sekcja-miejsce" tytul="Miejsce pracy">
                {(tablet || editingUser.role === "manager_lokalu") && (
                  <Pole etykieta="Dozwolone lokale" className="mb-3">
                    <div className="flex flex-wrap gap-2">
                      {activeLokale.map((l) => {
                        const on = allowedArr(editingUser).includes(l.name);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() =>
                              ustaw({
                                allowed_lokale: on
                                  ? allowedArr(editingUser).filter((x) => x !== l.name)
                                  : [...allowedArr(editingUser), l.name],
                              })
                            }
                            className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border-[2px] text-sm font-bold ${
                              on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                            }`}
                          >
                            {on && <Check size={15} />} {l.name}
                          </button>
                        );
                      })}
                    </div>
                  </Pole>
                )}
                {!tablet && (
                  <>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Pole etykieta="Lokal">
                        <select
                          value={editingUser.default_lokal || ""}
                          onChange={(e) => ustaw({ default_lokal: e.target.value, default_stanowisko: "" })}
                          className={poleCls}
                          required
                        >
                          <option value="">— wybierz —</option>
                          {availableLokaleForManager.map((l) => (
                            <option key={l.id} value={l.name}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </Pole>
                      <Pole etykieta="Stanowisko główne">
                        <select
                          value={editingUser.default_stanowisko || ""}
                          onChange={(e) => ustaw({ default_stanowisko: e.target.value })}
                          className={poleCls}
                          required
                        >
                          <option value="">— wybierz —</option>
                          {dostepneStanowiska.map((s) => (
                            <option key={s.id} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </Pole>
                    </div>
                    {wszystkieNazwyStanowisk.length > 0 && (
                      <div className="mt-4">
                        <label className={etykietaCls}>Dodatkowe stanowiska, na których umie pracować</label>
                        <p className="text-[13px] text-[#6E6E66] -mt-0.5 mb-2.5">
                          Używane w Grafiku: wpisanie zmiany na stanowisko spoza tej listy pokaże ostrzeżenie, ale
                          nadal będzie możliwe.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {wszystkieNazwyStanowisk.map((name) => {
                            const glowne = name === editingUser.default_stanowisko;
                            const on = allowedStanArr(editingUser).includes(name);
                            return (
                              <button
                                key={name}
                                type="button"
                                disabled={glowne}
                                onClick={() =>
                                  ustaw({
                                    allowed_stanowiska: on
                                      ? allowedStanArr(editingUser).filter((x) => x !== name)
                                      : [...allowedStanArr(editingUser), name],
                                  })
                                }
                                className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border-[2px] text-sm font-bold ${
                                  glowne
                                    ? "bg-[#DE3A22] border-[#DE3A22] text-white cursor-default"
                                    : on
                                    ? "bg-[#171714] border-[#171714] text-white"
                                    : "bg-white border-[#DEDCD4] text-[#171714] hover:border-[#171714]"
                                }`}
                                title={glowne ? "Stanowisko główne — zawsze zaznaczone" : ""}
                                data-stanowisko={name}
                              >
                                {glowne ? <Star size={14} /> : on ? <Check size={15} /> : null} {name}
                              </button>
                            );
                          })}
                        </div>
                        <p className={`${podpisCls} flex items-center gap-1`}>
                          <Star size={12} /> = stanowisko główne · zaznaczone: {allowedStanArr(editingUser).filter((x) => x !== editingUser.default_stanowisko).length}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Sekcja>

              {!tablet && (
                /* --- Umowa i wynagrodzenie ---
                   Rodzaj umowy decyduje o tym, JAK liczy się koszt, więc
                   dopiero po jego wybraniu pokazujemy właściwe pola: zlecenie —
                   stawka za godzinę, umowa o pracę — wymiar etatu i kwota z
                   umowy. Termin (albo "bezterminowa") zostaje wspólny dla obu. */
                <Sekcja id="sekcja-umowa" tytul="Umowa i wynagrodzenie">
                  <div className="grid md:grid-cols-2 gap-3">
                    <Pole etykieta="Typ umowy">
                      <select
                        value={typUmowy(editingUser) || ""}
                        onChange={(e) => ustaw({ typ_umowy: e.target.value || null })}
                        className={poleCls}
                      >
                        <option value="">— nieustalony —</option>
                        {TYPY_UMOWY.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Pole>
                    {naEtacie(editingUser) ? (
                      <Pole etykieta="Wymiar etatu">
                        <select
                          value={editingUser.wymiar_etatu ?? ""}
                          onChange={(e) =>
                            ustaw({ wymiar_etatu: e.target.value === "" ? null : Number(e.target.value) })
                          }
                          className={poleCls}
                        >
                          <option value="">— nieustalony —</option>
                          {WYMIARY_ETATU.map((w) => (
                            <option key={w.key} value={w.key}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </Pole>
                    ) : (
                      <Pole etykieta="Stawka (zł/h)">
                        <input
                          id="pole-stawka"
                          type="number"
                          step="0.01"
                          value={editingUser.stawka ?? ""}
                          onChange={(e) => ustaw({ stawka: e.target.value })}
                          placeholder="opcjonalnie"
                          className={`${poleCls} ${showTermWarnings && (editingUser.stawka == null || editingUser.stawka === "") ? polePusteCls : ""}`}
                        />
                      </Pole>
                    )}
                    {naEtacie(editingUser) && (
                      <>
                        <Pole etykieta="Wynagrodzenie miesięczne (zł)">
                          <input
                            id="pole-stawka"
                            type="number"
                            step="0.01"
                            value={editingUser.wynagrodzenie_mies ?? ""}
                            onChange={(e) => ustaw({ wynagrodzenie_mies: e.target.value })}
                            placeholder="kwota z umowy"
                            className={`${poleCls} ${
                              showTermWarnings && (editingUser.wynagrodzenie_mies == null || editingUser.wynagrodzenie_mies === "")
                                ? polePusteCls
                                : ""
                            }`}
                          />
                        </Pole>
                        <Pole
                          etykieta="Stawka w tym miesiącu"
                          podpis={
                            <p className={podpisCls}>
                              {normaBiezaca != null
                                ? `Norma na ${getMonthName(now.getMonth()).toLowerCase()}: ${fmtH(normaBiezaca)} h. Liczymy ją z kalendarza co miesiąc — nie wpisujesz jej ręcznie.`
                                : "Wpisz wymiar etatu, żeby aplikacja policzyła miesięczną normę godzin."}
                            </p>
                          }
                        >
                          <div className="h-12 md:h-11 px-3 flex items-center rounded-md bg-[#F6F5F1] border-[2px] border-[#DEDCD4] font-bold tabular-nums text-[#171714]">
                            {stawkaEfekt != null ? `${stawkaEfekt.toFixed(2).replace(".", ",")} zł/h` : "—"}
                          </div>
                        </Pole>
                      </>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 mt-4 items-start">
                    <Pole
                      etykieta="Termin umowy"
                      podpis={showTermWarnings && !editingUser.umowa_expiry && !editingUser.umowa_bezterminowa && <BrakTerminu />}
                    >
                      <input
                        id="pole-umowa"
                        type="date"
                        disabled={!!editingUser.umowa_bezterminowa}
                        value={editingUser.umowa_expiry || ""}
                        onChange={(e) => ustaw({ umowa_expiry: e.target.value })}
                        className={`${poleCls} ${
                          showTermWarnings && !editingUser.umowa_expiry && !editingUser.umowa_bezterminowa ? polePusteCls : ""
                        }`}
                      />
                    </Pole>
                    <div className="md:pt-8">
                      <Przelacznik
                        wlaczony={!!editingUser.umowa_bezterminowa}
                        etykieta="Umowa bezterminowa"
                        onZmiana={(v) =>
                          // Termin i "bezterminowa" wykluczają się — trzymanie
                          // starej daty obok zaznaczonego pola prosi się o to,
                          // żeby ktoś kiedyś zaczął jej ufać.
                          ustaw({ umowa_bezterminowa: v, umowa_expiry: v ? null : editingUser.umowa_expiry })
                        }
                      />
                    </div>
                  </div>

                  {!isNew && (
                    /* Odczyt tego, co wpisano wyżej. Dla umowy o pracę koszt
                       to kwota z umowy — nie godziny × stawka — bo lokal wydaje
                       ją niezależnie od tego, ile godzin z niej wykorzystał. */
                    <div className="mt-5">
                      <label className={etykietaCls}>Ten miesiąc</label>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="rounded-lg bg-[#F6F5F1] p-4">
                          <p className="font-['Archivo'] font-extrabold text-[24px] tabular-nums text-[#171714]">
                            {fmtH(monthHours)}
                            <small className="text-[15px] font-bold text-[#6E6E66]">
                              {normaBiezaca != null ? ` z ${fmtH(normaBiezaca)} h` : " h"}
                            </small>
                          </p>
                          <p className="text-[13px] text-[#6E6E66]">
                            {normaBiezaca != null ? "przepracowane z normy" : "przepracowane"}
                          </p>
                          {normaBiezaca != null && normaBiezaca > 0 && (
                            <div className="h-2 rounded bg-[#ECEBE6] overflow-hidden mt-2">
                              <i
                                className="block h-full rounded bg-[#171714]"
                                style={{ width: `${Math.min(100, (monthHours / normaBiezaca) * 100)}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="rounded-lg bg-[#F6F5F1] p-4">
                          <p className="font-['Archivo'] font-extrabold text-[24px] tabular-nums text-[#171714]">
                            {monthCost != null ? `${Math.round(monthCost)} zł` : "—"}
                          </p>
                          <p className="text-[13px] text-[#6E6E66]">
                            {monthCost == null
                              ? "brak danych o wynagrodzeniu"
                              : !naEtacie(editingUser)
                              ? "koszt lokalu (godziny × stawka)"
                              : nadwyzkaMies && nadwyzkaMies.godzin > 0
                              ? `koszt lokalu (umowa + ${fmtH(nadwyzkaMies.godzin)} h ponad normą)`
                              : "koszt lokalu (kwota z umowy)"}
                          </p>
                        </div>
                      </div>
                      {opisBilansuTekst && (
                        <p className="text-[13px] text-[#6E6E66] mt-3">
                          Okres rozliczeniowy, policzone {miesiaceLabel(bilans.miesiace.length)}:{" "}
                          <b className="text-[#171714]">{opisBilansuTekst}</b>. Bilans obejmuje tylko miesiące już
                          zakończone i zeruje się z końcem okresu.
                          {bilans.pominiete.length > 0 &&
                            ` Pominięto ${miesiaceLabel(bilans.pominiete.length)} bez żadnych zapisanych godzin.`}
                        </p>
                      )}
                    </div>
                  )}
                </Sekcja>
              )}

              {!tablet && (
                <Sekcja id="sekcja-dokumenty" tytul="Dokumenty i uprawnienia">
                  <div className="grid md:grid-cols-2 gap-3 items-start">
                    <Pole
                      etykieta="Termin książeczki sanepid"
                      podpis={showTermWarnings && !editingUser.sanepid_expiry && <BrakTerminu />}
                    >
                      <input
                        id="pole-sanepid"
                        type="date"
                        value={editingUser.sanepid_expiry || ""}
                        onChange={(e) => ustaw({ sanepid_expiry: e.target.value })}
                        className={`${poleCls} ${showTermWarnings && !editingUser.sanepid_expiry ? polePusteCls : ""}`}
                      />
                    </Pole>
                    {/* Prawo na czas zamiast nowej roli: kierownik zmiany może
                        zamknąć Puls swojego lokalu z Tabletu Służbowego do tego
                        dnia włącznie. Wygasa samo — uprawnień, które trzeba
                        pamiętać odebrać, nikt nie odbiera. */}
                    <Pole
                      etykieta="Może zamykać Puls (kierownik zmiany) — do dnia"
                      podpis={
                        <p className={podpisCls}>
                          {!editingUser.puls_do
                            ? "Brak uprawnienia."
                            : editingUser.puls_do < dzisYMD()
                            ? "Uprawnienie wygasło."
                            : `Może zamykać Puls do ${editingUser.puls_do.split("-").reverse().join(".")} włącznie.`}
                        </p>
                      }
                    >
                      <input
                        type="date"
                        value={editingUser.puls_do || ""}
                        onChange={(e) => ustaw({ puls_do: e.target.value || null })}
                        className={poleCls}
                      />
                      <span className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => ustaw({ puls_do: dzisYMD() })}
                          className={`${btnObrysCls} min-h-[40px] md:min-h-[36px] px-3 text-sm`}
                        >
                          Na dziś
                        </button>
                        {editingUser.puls_do && (
                          <button
                            type="button"
                            onClick={() => ustaw({ puls_do: null })}
                            className="min-h-[40px] md:min-h-[36px] px-3 rounded-lg text-sm font-bold text-[#6E6E66] hover:bg-[#ECEBE6]"
                          >
                            Odbierz
                          </button>
                        )}
                      </span>
                    </Pole>
                  </div>
                </Sekcja>
              )}

              {!tablet && !isNew && (
                <Sekcja
                  id="sekcja-urlopy"
                  tytul={
                    <>
                      <Palmtree size={18} /> Urlop i dni wolne
                    </>
                  }
                  prawa={
                    <span className="inline-flex items-center h-6 px-2 rounded-md bg-[#ECEBE6] text-[12px] font-extrabold text-[#171714]">
                      {urlopy.length} {odmiana(urlopy.length, ["wpis", "wpisy", "wpisów"])}
                    </span>
                  }
                >
                  {/* Urlop zapisuje się od razu (osobnym przyciskiem), a nie
                      paskiem "Zapisz zmiany" — to osobny wpis z godzinami,
                      nie pole karty. */}
                  <div className="rounded-lg bg-[#F6F5F1] p-3">
                    <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                      {[
                        ["Od", urlopFrom, setUrlopFrom],
                        ["Do", urlopTo, setUrlopTo],
                      ].map(([l, v, set]) => (
                        <Pole key={l} etykieta={l}>
                          <span className="flex items-center gap-1 bg-white border-[2px] border-[#171714] rounded-md pr-1">
                            <input
                              type="date"
                              value={v}
                              onChange={(e) => set(e.target.value)}
                              className="flex-1 min-w-0 h-11 md:h-10 px-3 bg-transparent text-[15px] outline-none"
                            />
                            {v && (
                              <button type="button" onClick={() => set("")} className="text-[12px] font-bold text-[#6E6E66] px-1.5">
                                Wyczyść
                              </button>
                            )}
                          </span>
                        </Pole>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddUrlopClick}
                        disabled={urlopSaving || !urlopFrom || !urlopTo}
                        className={`${btnObrysCls} col-span-2 md:col-span-1`}
                      >
                        <Plus size={17} /> Dodaj urlop
                      </button>
                    </div>
                    <p className="text-[12px] text-[#6E6E66] mt-2">
                      {dniRoboczeWybrane != null ? (
                        <>
                          ={" "}
                          <b className="text-[#171714]">
                            {dniRoboczeWybrane} {odmiana(dniRoboczeWybrane, ["dzień roboczy", "dni robocze", "dni roboczych"])}{" "}
                            · {dniRoboczeWybrane * URLOP_HOURS_PER_DAY} h
                          </b>{" "}
                          ({URLOP_HOURS_PER_DAY} h za dzień roboczy, weekendy pomijamy)
                        </>
                      ) : (
                        `Wybierz daty — liczymy ${URLOP_HOURS_PER_DAY} h za dzień roboczy, weekendy pomijamy.`
                      )}
                    </p>
                  </div>
                  {urlopy.length === 0 ? (
                    <p className="text-sm text-[#6E6E66] mt-4">Brak urlopów i dni wolnych.</p>
                  ) : (
                    <div className="mt-2">
                      {urlopy.map((a) => {
                        const dni =
                          Math.round((new Date(`${a.end_date}T00:00:00`) - new Date(`${a.start_date}T00:00:00`)) / 86400000) + 1;
                        return (
                          <div
                            key={a.id}
                            className="flex flex-wrap items-center gap-2 py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0"
                            data-urlop={a.id}
                          >
                            <div className="mr-auto min-w-0">
                              <p className="font-bold text-[#171714]">{zakresLudzki(a.start_date, a.end_date)}</p>
                              <p className="text-[13px] text-[#6E6E66]">
                                {dni} {odmiana(dni, ["dzień", "dni", "dni"])}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold ${
                                a.type === "urlop" ? "bg-[#E3EEFB] text-[#1D5FA8]" : "bg-[#ECEBE6] text-[#171714]"
                              }`}
                            >
                              {a.type === "urlop" ? "Urlop" : "Niedostępność"}
                            </span>
                            <span
                              className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold ${
                                a.status === "approved"
                                  ? "bg-[#E2F3E9] text-[#1F7A4A]"
                                  : a.status === "pending"
                                  ? "bg-[#FDF0D8] text-[#8A5300]"
                                  : "bg-[#ECEBE6] text-[#6E6E66] line-through"
                              }`}
                            >
                              {a.status === "approved" ? "Zatwierdzony" : a.status === "pending" ? "Oczekuje" : "Odrzucony"}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                decyduj(
                                  [{ klucz: `urlop:${a.id}`, zadanie: ["usunUrlop", [a]] }],
                                  `Usunięto: ${a.type === "urlop" ? "urlop" : "niedostępność"} ${zakresLudzki(a.start_date, a.end_date)}`
                                )
                              }
                              className="w-9 h-9 grid place-items-center rounded-lg text-[#6E6E66] hover:bg-[#ECEBE6] hover:text-[#DE3A22]"
                              title="Usuń — razem z godzinami urlopu"
                              aria-label="Usuń wpis"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Sekcja>
              )}

              <Sekcja id="sekcja-koniec" tytul={tablet ? "Notatki" : "Koniec współpracy i notatki"}>
                {!tablet && (
                  /* Znany ostatni dzień pracy. Grafik po tej dacie nie da wpisać
                     zmiany, a przypomnienia o umowie milkną. */
                  <Pole
                    etykieta="Ostatni dzień pracy (jeśli znany)"
                    className="md:max-w-[50%] mb-4"
                    podpis={<p className={podpisCls}>Po tej dacie osoba nie pojawi się w Grafiku.</p>}
                  >
                    <input
                      type="date"
                      value={editingUser.ostatni_dzien || ""}
                      onChange={(e) => ustaw({ ostatni_dzien: e.target.value || null })}
                      className={poleCls}
                    />
                  </Pole>
                )}
                <Pole
                  etykieta="Notatki kierownika · widoczne tylko dla kierowników"
                  podpis={
                    editingUser.notatki_updated_by && (
                      <p className={podpisCls}>
                        Ostatnia zmiana: {editingUser.notatki_updated_by},{" "}
                        {new Date(editingUser.notatki_updated_at).toLocaleDateString("pl-PL")}
                      </p>
                    )
                  }
                >
                  <textarea
                    value={editingUser.notatki || ""}
                    onChange={(e) => ustaw({ notatki: e.target.value })}
                    placeholder="Opcjonalnie"
                    className="w-full min-h-[90px] p-3 border-[2px] border-[#171714] rounded-md text-[15px]"
                  />
                </Pole>
              </Sekcja>

              {/* Archiwizacja / przywrócenie — osobno, z krokiem potwierdzenia */}
              {!isNew && view === "aktywni" && (
                <div className={`${kartaCls} border-[#DEDCD4] p-4 md:p-5 flex flex-wrap items-center gap-3`}>
                  <div className="mr-auto min-w-[220px]">
                    <p className="font-['Archivo'] font-extrabold text-[#171714]">Archiwizuj pracownika</p>
                    <p className="text-[13px] text-[#6E6E66]">
                      Znika z list i Grafiku. Godziny i historia zostają — można przywrócić z Archiwum.
                    </p>
                  </div>
                  {!potwierdzArchiwum ? (
                    <button type="button" className={btnObrysCls} onClick={() => setPotwierdzArchiwum(true)} data-archiwizuj>
                      <Archive size={17} /> Archiwizuj
                    </button>
                  ) : (
                    <span className="flex gap-2">
                      <button type="button" className={btnObrysCls} onClick={() => setPotwierdzArchiwum(false)}>
                        Anuluj
                      </button>
                      <button
                        type="button"
                        className={btnGlownyCls}
                        onClick={async () => {
                          const ok = await onArchive("users", editingUser.id, true, { potwierdzone: true });
                          if (ok !== false) setEditingUser(null);
                        }}
                        data-archiwizuj-tak
                      >
                        <Archive size={17} /> Tak, archiwizuj
                      </button>
                    </span>
                  )}
                </div>
              )}
              {!isNew && view === "archiwum" && (
                <div className={`${kartaCls} border-[#DEDCD4] p-4 md:p-5 flex flex-wrap items-center gap-3`}>
                  <p className="mr-auto text-[13px] text-[#6E6E66] min-w-[220px]">
                    Osoba w archiwum. Przywrócenie oddaje ją listom i Grafikowi; usunięcie na zawsze kasuje kartę.
                  </p>
                  <button
                    type="button"
                    className={btnObrysCls}
                    onClick={() => {
                      onArchive("users", editingUser.id, false);
                      setEditingUser(null);
                    }}
                  >
                    <ArchiveRestore size={17} /> Przywróć
                  </button>
                  <button
                    type="button"
                    className={`${btnCls} border-[#DE3A22] text-[#DE3A22] bg-white hover:bg-[#FFF3EF]`}
                    onClick={() => {
                      onPermanentDelete("users", editingUser.id);
                      setEditingUser(null);
                    }}
                  >
                    <Trash2 size={17} /> Usuń na zawsze
                  </button>
                </div>
              )}

              {/* Pasek na dole: "Cofnij" usunięcia urlopu i "Zapisz" — ten
                  drugi tylko wtedy, gdy coś się zmieniło. */}
              {(toast || zmieniony) && (
                <div className="sticky bottom-0 z-30 flex flex-col gap-2 pb-1">
                  {toast && <PasekCofnij opis={toast.opis} onCofnij={cofnij} />}
                  {zmieniony && (
                    <div
                      className="flex flex-wrap items-center gap-3 p-2.5 pl-4 bg-[#171714] text-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
                      data-pasek-zapisu
                    >
                      <span className="font-bold w-full md:w-auto md:mr-auto">
                        {isNew ? "Nowy pracownik" : "Niezapisane zmiany"}
                        <small className="font-medium opacity-75 text-sm ml-1.5">{editingUser.name}</small>
                      </span>
                      <button
                        type="button"
                        onClick={anulujZmiany}
                        className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg border-[2px] border-white/80 font-bold text-[15px] flex-1 md:flex-none"
                      >
                        Anuluj
                      </button>
                      <button type="submit" className={`${btnGlownyCls} flex-1 md:flex-none`} data-zapisz-karte>
                        <Check size={18} /> {isNew ? "Dodaj pracownika" : "Zapisz zmiany"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
