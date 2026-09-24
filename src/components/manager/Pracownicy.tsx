// @ts-nocheck
// Nowy wygląd dawnego "Przewodnik" → zakładka Pracownicy: lista + karta
// szczegółów obok siebie (zamiast modala), z nowymi polami (stawka, etat,
// notatki + kto/kiedy, kiosk_pin) i usuwaniem na zawsze tylko z Archiwum.
// Lokale/Stanowiska stały tu do 0.44.0 jako dodatkowe widoki `view` —
// przeniesione do zakładki Ustawienia (manager/Ustawienia.tsx), widocznej
// tylko dla właściciela.
//
// Wymagane pola (ustalone w sesji): imię, lokal, stanowisko (obie poza
// rolą "kiosk", która ich nie ma), typ konta; przy roli innej niż "open"
// dodatkowo email+PIN. Reszta — stawka/etat/notatki/kiosk_pin/terminy —
// opcjonalna.
import React, { useState, useEffect } from "react";
import {
  Plus,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronLeft,
  AlertTriangle,
  Palmtree,
} from "lucide-react";
import { pageTitleCls, cardCls, btnPrimaryCls, btnSecondaryCls, statLabelCls } from "./designTokens";
import { czekaNaDecyzje } from "../../utils/probni";
import { getMonthName } from "../../utils/format";
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

// Powtarzały się w kilkudziesięciu miejscach tej karty — po przebudowie
// formularza na bloki tym bardziej.
const labelCls = "text-xs font-bold text-[#6E6E66]";
const inputCls = "w-full p-2 border-[2px] border-[#171714] rounded";
const fmtH = (n) => (Math.round((n || 0) * 10) / 10).toString().replace(".", ",");
// Polska odmiana: 1 miesiąc, 2–4 miesiące, 5+ miesięcy (z wyjątkiem 12–14).
const miesiaceLabel = (n) => {
  const ost = n % 10;
  const dwie = n % 100;
  if (n === 1) return "1 miesiąc";
  if (ost >= 2 && ost <= 4 && !(dwie >= 12 && dwie <= 14)) return `${n} miesiące`;
  return `${n} miesięcy`;
};

const roleLabel = (role) =>
  ({
    closed: "Konto prywatne",
    open: "Konto otwarte (kiosk)",
    kiosk: "Tablet służbowy",
    manager_lokalu: "Kierownik lokalu",
    admin: "Szef (Admin)",
  }[role] || role);

const missingTerms = (u) => {
  const missing = [];
  if (u.role !== "kiosk") {
    if (!u.sanepid_expiry) missing.push("sanepid");
    // Umowa bezterminowa nie ma terminu, bo go nie ma — to co innego niż
    // termin, którego nikt nie wpisał, i nie może świecić tym samym ostrzeżeniem.
    if (!u.umowa_expiry && !u.umowa_bezterminowa) missing.push("umowa");
  }
  return missing;
};

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
  onAddUrlop,
  onDeleteAbsence,
  showMsg,
}) {
  const [view, setView] = useState("aktywni"); // "aktywni" | "archiwum"

  const [urlopFrom, setUrlopFrom] = useState("");
  const [urlopTo, setUrlopTo] = useState("");
  const [urlopSaving, setUrlopSaving] = useState(false);

  useEffect(() => {
    setUrlopFrom("");
    setUrlopTo("");
  }, [editingUser?.id]);

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

  const handleDeleteAbsenceClick = async (absence) => {
    if (!window.confirm("Usunąć ten wpis? Powiązane godziny urlopu też zostaną skasowane."))
      return;
    try {
      await onDeleteAbsence(absence);
      showMsg?.("Wpis usunięty.");
    } catch (err) {
      showMsg?.(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const isNew = editingUser && editingUser.id === null;
  const isEmailPinRequired = editingUser && editingUser.role !== "open";
  const showTermWarnings = editingUser && !!editingUser.id;

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
    ? bilansOkresu({
        user: editingUser,
        godzinyMiesiaca: godzinyWMiesiacu,
        lokalRow: lokalPracownika,
      })
    : null;
  const opisBilansuTekst = opisBilansu(bilans);

  const allowedArr = (u) =>
    Array.isArray(u.allowed_lokale)
      ? u.allowed_lokale
      : u.allowed_lokale
      ? u.allowed_lokale.split(",").map((s) => s.trim())
      : [];

  // allowed_stanowiska — ten sam format co allowed_lokale (tekst po
  // przecinku, NIE tablica Postgresa). Bez default_stanowisko, bo ono
  // zawsze liczy się jako "umie" i jest doklejane dopiero przy odczycie
  // (allowedStanowiskaArr w utils/grafik.ts).
  const allowedStanArr = (u) =>
    Array.isArray(u.allowed_stanowiska)
      ? u.allowed_stanowiska
      : u.allowed_stanowiska
      ? u.allowed_stanowiska.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  // Nazwy stanowisk powtarzają się między lokalami (osobny wiersz na lokal),
  // a pracownik bywa przypisany do kilku lokali — dla tej listy liczy się
  // sama nazwa, więc deduplikujemy.
  const wszystkieNazwyStanowisk = [
    ...new Set(activeStanowiska.map((s) => s.name)),
  ].sort((a, b) => a.localeCompare(b, "pl"));

  const list = view === "aktywni" ? visibleUsers : archivedUsers;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className={pageTitleCls}>Pracownicy</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("aktywni")}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              view === "aktywni"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Aktywni · {visibleUsers.length}
          </button>
          <button
            onClick={() => setView("archiwum")}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              view === "archiwum"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Archiwum · {archivedUsers.length}
          </button>
          {view === "aktywni" && (
            <button onClick={onNewUser} className={`${btnPrimaryCls} flex items-center gap-1.5`}>
              <Plus size={15} /> Dodaj pracownika
            </button>
          )}
        </div>
      </div>

      {(view === "aktywni" || view === "archiwum") && (

      <div className="grid md:grid-cols-[320px_1fr] gap-5">
        {/* --- Lista --- */}
        <div className={`${!editingUser ? "block" : "hidden md:block"}`}>
          <div className="space-y-2">
            {list.length === 0 && (
              <div className="bg-white p-6 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86] text-sm">
                {view === "aktywni" ? "Brak pracowników." : "Archiwum puste."}
              </div>
            )}
            {list.map((u) => {
              const missing = missingTerms(u);
              const selected = editingUser && editingUser.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => setEditingUser({ ...u })}
                  className={`w-full text-left bg-white p-3.5 rounded-xl border-[2px] ${
                    selected ? "border-[#DE3A22]" : "border-[#171714]"
                  }`}
                >
                  <p className="font-['Archivo'] font-bold text-[15px]">{u.name}</p>
                  <p className="text-xs text-[#6E6E66] mt-0.5">
                    {u.default_stanowisko || roleLabel(u.role)}
                    {u.default_lokal ? ` · ${u.default_lokal}` : ""}
                  </p>
                  {/* Osoba dodana z tabletu wygląda na liście dokładnie jak
                      reszta załogi, a nią jeszcze nie jest: nie ma umowy,
                      stawki ani miejsca w grafiku. */}
                  {czekaNaDecyzje(u) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8A6B1E] bg-[#FFF4D6] px-1.5 py-0.5 rounded mt-1.5 mr-1.5">
                      <AlertTriangle size={11} /> Na próbę — czeka na decyzję
                    </span>
                  )}
                  {view === "aktywni" && missing.length > 0 && !czekaNaDecyzje(u) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8A6B1E] bg-[#FFF4D6] px-1.5 py-0.5 rounded mt-1.5">
                      <AlertTriangle size={11} /> Brak terminu {missing.join(", ")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* --- Karta szczegółów --- */}
        <div className={editingUser ? "block" : "hidden md:block"}>
          {!editingUser && (
            <div className="bg-white p-10 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
              Wybierz pracownika z listy.
            </div>
          )}
          {editingUser && (
            <form onSubmit={onSave} className={cardCls}>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="md:hidden flex items-center gap-1 text-sm font-bold text-[#6E6E66] mb-3"
              >
                <ChevronLeft size={16} /> Wróć do listy
              </button>
              <h3 className="font-['Archivo'] font-extrabold text-lg mb-4">
                {isNew ? "Nowy pracownik" : editingUser.name}
              </h3>

              {/* Karta wygląda tak samo dla każdego, więc bez tego paska nie
                  widać, że ta osoba nie jest jeszcze przyjęta — a od tego
                  zależy, czy w ogóle warto uzupełniać resztę pól. */}
              {czekaNaDecyzje(editingUser) && (
                <div className="mb-4 p-3 rounded-xl border-[2px] border-[#8A6B1E] bg-[#FFF4D6] text-[13px] text-[#6B5415]">
                  <strong>Dodany(-a) na próbę z Tabletu Służbowego</strong>
                  {editingUser.probny_od
                    ? ` ${editingUser.probny_od.split("-").reverse().join(".")}`
                    : ""}
                  {editingUser.probny_przez ? ` przez: ${editingUser.probny_przez}` : ""}.
                  Odbija godziny, ale nie ma jej w Grafiku i nie może się nigdzie
                  zalogować. Decyzja czeka w zakładce Zatwierdzanie zmian.
                </div>
              )}

              {/* 1–2. Kim jest i jakim kontem się posługuje. */}
              <p className={`${statLabelCls} mb-2`}>Dane podstawowe</p>
              <div className="space-y-3 mb-5">
                <div>
                  <label className={labelCls}>Imię i nazwisko</label>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Typ pracownika</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className={`${inputCls} font-bold`}
                  >
                    <option value="closed">Pracownik (Aplikacja na telefon)</option>
                    <option value="open">Pracownik (Otwarte Konto - Kiosk)</option>
                    {!isLocalManager && <option value="kiosk">Konto Służbowe (Tablet lokalu)</option>}
                    {!isLocalManager && <option value="manager_lokalu">Kierownik Lokalu</option>}
                    {!isLocalManager && <option value="admin">Szef (Admin)</option>}
                  </select>
                </div>
              </div>

              {/* 3. Kontakt i logowanie. E-mail i PIN są wymagane tylko tam,
                  gdzie bez nich nie da się wejść do aplikacji; reszta —
                  telefon, data urodzenia, początek pracy — jest opcjonalna,
                  jak wszystkie pozostałe bloki tej karty. */}
              <p className={`${statLabelCls} mb-2`}>Kontakt i logowanie</p>
              <div className="space-y-3 mb-5">
                {isEmailPinRequired ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Email / Login</label>
                      <input
                        type="email"
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        className={inputCls}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelCls}>PIN (6 cyfr)</label>
                      <input
                        type="text"
                        value={editingUser.pin}
                        onChange={(e) => setEditingUser({ ...editingUser, pin: e.target.value })}
                        maxLength="6"
                        className={inputCls}
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#F1F1EE] border-[2px] border-[#171714] rounded">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-[#171714]">
                          PIN blokady (6 cyfr)
                        </label>
                        {/* ⚠️ Do 0.41.1 stało tu `maxLength="4"` i nie dało się
                            wpisać szóstej cyfry — czyli to pole blokowało
                            dokładnie tę zmianę, na którą przygotowana była
                            poprzednia wersja (Supabase Auth nie przyjmie hasła
                            krótszego niż 6 znaków, patrz CLAUDE.md, "Logowanie
                            i dostęp do danych"). Krótsze PIN-y sprzed tej
                            wersji działają dalej: klawiatura tabletu obsługuje
                            obie długości. */}
                        <input
                          type="text"
                          value={editingUser.kiosk_pin || ""}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, kiosk_pin: e.target.value })
                          }
                          maxLength="6"
                          placeholder="brak — kiosk nie pyta o PIN"
                          className={inputCls}
                        />
                        <div className="text-[11px] text-[#6E6E66] mt-1">
                          Ten sam PIN otwiera profil na tablecie i loguje na
                          prywatnym telefonie.
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#171714]">
                          Email (do logowania na własnym telefonie)
                        </label>
                        <input
                          type="email"
                          value={editingUser.email || ""}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, email: e.target.value })
                          }
                          placeholder="opcjonalnie"
                          className={inputCls}
                        />
                      </div>
                    </div>
                    {/* Dostęp z prywatnego telefonu wymaga OBU pól naraz —
                        mówimy o tym wprost, bo samo wpisanie jednego z nich
                        nie daje nic i wyglądałoby na awarię. */}
                    <p className="text-[11px] text-[#6E6E66] mt-2">
                      {editingUser.kiosk_pin && editingUser.email
                        ? "Ta osoba może zalogować się na swoim telefonie: tym e-mailem i PIN-em blokady. Zakres widocznych bloków ustawia właściciel w Ustawienia → Lokale."
                        : editingUser.kiosk_pin || editingUser.email
                        ? "Do logowania na własnym telefonie potrzebne są OBA pola — PIN blokady i e-mail. Na razie działa tylko Tablet Służbowy."
                        : "Bez PIN-u i e-maila pracownik korzysta wyłącznie z Tabletu Służbowego."}
                    </p>
                  </div>
                )}

                {editingUser.role !== "kiosk" && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Telefon</label>
                      <input
                        type="tel"
                        value={editingUser.telefon || ""}
                        onChange={(e) => setEditingUser({ ...editingUser, telefon: e.target.value })}
                        placeholder="opcjonalnie"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Data urodzenia</label>
                      <input
                        type="date"
                        value={editingUser.data_urodzenia || ""}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, data_urodzenia: e.target.value || null })
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Początek pracy</label>
                      <input
                        type="date"
                        value={editingUser.data_zatrudnienia || ""}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            data_zatrudnienia: e.target.value || null,
                          })
                        }
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 4–5. Gdzie i na czym pracuje. */}
              <p className={`${statLabelCls} mb-2`}>Miejsce pracy</p>
              <div className="space-y-3 mb-5">
                {(editingUser.role === "kiosk" || editingUser.role === "manager_lokalu") && (
                  <div className="p-3 bg-[#F1F1EE] border-[2px] border-[#171714] rounded">
                    <label className="text-xs font-bold text-[#171714] mb-2 block">
                      Dozwolone lokale
                    </label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {activeLokale.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={allowedArr(editingUser).includes(l.name)}
                            onChange={(e) => {
                              const now = e.target.checked
                                ? [...allowedArr(editingUser), l.name]
                                : allowedArr(editingUser).filter((x) => x !== l.name);
                              setEditingUser({ ...editingUser, allowed_lokale: now });
                            }}
                          />
                          {l.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {editingUser.role !== "kiosk" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Lokal</label>
                      <select
                        value={editingUser.default_lokal || ""}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            default_lokal: e.target.value,
                            default_stanowisko: "",
                          })
                        }
                        className={inputCls}
                        required
                      >
                        <option value="">-- wybierz --</option>
                        {availableLokaleForManager.map((l) => (
                          <option key={l.id} value={l.name}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Stanowisko</label>
                      <select
                        value={editingUser.default_stanowisko || ""}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, default_stanowisko: e.target.value })
                        }
                        className={inputCls}
                        required
                      >
                        <option value="">-- wybierz --</option>
                        {dostepneStanowiska.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {editingUser.role !== "kiosk" && wszystkieNazwyStanowisk.length > 0 && (
                  <div className="p-3 bg-[#F1F1EE] border-[2px] border-[#171714] rounded">
                    <label className="text-xs font-bold text-[#171714] block">
                      Dodatkowe stanowiska, na których umie pracować
                    </label>
                    <p className="text-[11px] text-[#6E6E66] mt-0.5 mb-2">
                      Używane w Grafiku: wpisanie zmiany na stanowisko spoza tej
                      listy pokaże ostrzeżenie, ale nadal będzie możliwe.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {wszystkieNazwyStanowisk.map((name) => {
                        const isDefault = name === editingUser.default_stanowisko;
                        const checked = isDefault || allowedStanArr(editingUser).includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            disabled={isDefault}
                            onClick={() => {
                              const cur = allowedStanArr(editingUser);
                              const next = cur.includes(name)
                                ? cur.filter((x) => x !== name)
                                : [...cur, name];
                              setEditingUser({ ...editingUser, allowed_stanowiska: next });
                            }}
                            className={`px-2.5 py-1 rounded border-[2px] text-[13px] font-bold ${
                              checked
                                ? "bg-[#171714] text-white border-[#171714]"
                                : "bg-white text-[#171714] border-[#B7B6AE] hover:border-[#171714]"
                            } ${isDefault ? "opacity-70 cursor-default" : ""}`}
                            title={isDefault ? "Stanowisko domyślne — zawsze zaznaczone" : ""}
                          >
                            {name}
                            {isDefault ? " ★" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {editingUser.role !== "kiosk" && (
                <>
                  {/* 6. Umowa. Rodzaj umowy decyduje o tym, JAK liczy się koszt,
                      więc dopiero po jego wybraniu pokazujemy właściwe pola:
                      zlecenie — stawka za godzinę, umowa o pracę — wymiar etatu
                      i kwota z umowy. Termin (albo "bezterminowa") zostaje
                      wspólny dla obu: umowa o pracę też bywa na czas określony. */}
                  <p className={`${statLabelCls} mb-2`}>Umowa i wynagrodzenie</p>
                  <div className="border-[2px] border-[#171714] rounded-lg p-3 mb-5 space-y-3">
                    <div>
                      <label className={labelCls}>Typ umowy</label>
                      <select
                        value={typUmowy(editingUser) || ""}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, typ_umowy: e.target.value || null })
                        }
                        className={`${inputCls} font-bold`}
                      >
                        <option value="">-- nieustalony --</option>
                        {TYPY_UMOWY.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {naEtacie(editingUser) ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Wymiar etatu</label>
                            <select
                              value={editingUser.wymiar_etatu ?? ""}
                              onChange={(e) =>
                                setEditingUser({
                                  ...editingUser,
                                  wymiar_etatu: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                              className={inputCls}
                            >
                              <option value="">-- nieustalony --</option>
                              {WYMIARY_ETATU.map((w) => (
                                <option key={w.key} value={w.key}>
                                  {w.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Wynagrodzenie miesięczne (zł)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editingUser.wynagrodzenie_mies ?? ""}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, wynagrodzenie_mies: e.target.value })
                              }
                              placeholder="kwota z umowy"
                              className={inputCls}
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-[#6E6E66]">
                          {normaBiezaca != null
                            ? `Norma na ${getMonthName(now.getMonth())}: ${fmtH(normaBiezaca)} h${
                                stawkaEfekt != null
                                  ? ` · to ${stawkaEfekt.toFixed(2).replace(".", ",")} zł za godzinę w tym miesiącu`
                                  : ""
                              }. Norma zmienia się co miesiąc — liczymy ją z kalendarza, nie wpisujesz jej ręcznie.`
                            : "Wpisz wymiar etatu, żeby aplikacja policzyła miesięczną normę godzin."}
                        </p>
                      </>
                    ) : (
                      <div>
                        <label className={labelCls}>Stawka (zł/h)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editingUser.stawka ?? ""}
                          onChange={(e) => setEditingUser({ ...editingUser, stawka: e.target.value })}
                          placeholder="opcjonalnie"
                          className={inputCls}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-1 border-t-[2px] border-[#E7E7E2]">
                      <div>
                        <label className={labelCls}>Termin umowy</label>
                        <input
                          type="date"
                          disabled={!!editingUser.umowa_bezterminowa}
                          value={editingUser.umowa_expiry || ""}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, umowa_expiry: e.target.value })
                          }
                          className={`w-full p-2 border-[2px] rounded disabled:bg-[#F1F1EE] disabled:text-[#8F8E86] ${
                            showTermWarnings &&
                            !editingUser.umowa_expiry &&
                            !editingUser.umowa_bezterminowa
                              ? "border-[#DE3A22] bg-[#FAEAE6]"
                              : "border-[#171714]"
                          }`}
                        />
                        {showTermWarnings &&
                          !editingUser.umowa_expiry &&
                          !editingUser.umowa_bezterminowa && (
                            <p className="text-xs text-[#DE3A22] mt-1">
                              Brak terminu — przypomnienia wyłączone
                            </p>
                          )}
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={!!editingUser.umowa_bezterminowa}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                umowa_bezterminowa: e.target.checked,
                                // Termin i "bezterminowa" wykluczają się — trzymanie
                                // starej daty obok zaznaczonego pola prosi się o to,
                                // żeby ktoś kiedyś zaczął jej ufać.
                                umowa_expiry: e.target.checked ? null : editingUser.umowa_expiry,
                              })
                            }
                          />
                          umowa bezterminowa
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isNew && editingUser.role !== "kiosk" && (
                <>
                  {/* Odczyt tego, co wpisano wyżej. Dla umowy o pracę koszt to
                      kwota z umowy — nie godziny × stawka — bo lokal wydaje ją
                      niezależnie od tego, ile godzin z niej wykorzystał. */}
                  <p className={`${statLabelCls} mb-2`}>Ten miesiąc</p>
                  <div className="border-[2px] border-[#171714] rounded-lg p-3 mb-5">
                    <div className="flex flex-wrap gap-x-8 gap-y-2">
                      <div>
                        <p className="font-['Archivo'] font-extrabold text-xl">
                          {fmtH(monthHours)}
                          {normaBiezaca != null && (
                            <span className="text-[#8F8E86] font-bold text-base">
                              {" "}
                              z {fmtH(normaBiezaca)}
                            </span>
                          )}{" "}
                          h
                        </p>
                        <p className="text-[11px] text-[#8F8E86]">
                          {normaBiezaca != null ? "przepracowane z normy" : "przepracowane"}
                        </p>
                      </div>
                      <div>
                        <p className="font-['Archivo'] font-extrabold text-xl">
                          {monthCost != null ? `${Math.round(monthCost)} zł` : "—"}
                        </p>
                        <p className="text-[11px] text-[#8F8E86]">
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
                      <p className="text-[12px] text-[#6E6E66] mt-3 pt-3 border-t-[2px] border-[#E7E7E2]">
                        Okres rozliczeniowy, policzone{" "}
                        {miesiaceLabel(bilans.miesiace.length)}: <b>{opisBilansuTekst}</b>. Bilans
                        obejmuje tylko miesiące już zakończone i zeruje się z końcem okresu.
                        {bilans.pominiete.length > 0 &&
                          ` Pominięto ${miesiaceLabel(
                            bilans.pominiete.length
                          )} bez żadnych zapisanych godzin.`}
                      </p>
                    )}
                  </div>
                </>
              )}

              {editingUser.role !== "kiosk" && (
                <>
                  {/* 7–8. Dokument i uprawnienie na czas. */}
                  <p className={`${statLabelCls} mb-2`}>Dokumenty i uprawnienia</p>
                  <div className="border-[2px] border-[#171714] rounded-lg p-3 mb-5 space-y-3">
                    <div>
                      <label className={labelCls}>Termin książeczki sanepid</label>
                      <input
                        type="date"
                        value={editingUser.sanepid_expiry || ""}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, sanepid_expiry: e.target.value })
                        }
                        className={`w-full p-2 border-[2px] rounded ${
                          showTermWarnings && !editingUser.sanepid_expiry
                            ? "border-[#DE3A22] bg-[#FAEAE6]"
                            : "border-[#171714]"
                        }`}
                      />
                      {showTermWarnings && !editingUser.sanepid_expiry && (
                        <p className="text-xs text-[#DE3A22] mt-1">
                          Brak terminu — przypomnienia wyłączone
                        </p>
                      )}
                    </div>
                    {/* Prawo na czas zamiast nowej roli: kierownik zmiany może
                        zamknąć Puls swojego lokalu z Tabletu Służbowego do tego
                        dnia włącznie. Wygasa samo — uprawnień, które trzeba
                        pamiętać odebrać, nikt nie odbiera. */}
                    <div>
                      <label className={labelCls}>
                        Może zamykać Puls (kierownik zmiany) — do dnia
                      </label>
                      <div className="flex flex-wrap gap-2 items-center mt-1">
                        <input
                          type="date"
                          value={editingUser.puls_do || ""}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, puls_do: e.target.value || null })
                          }
                          className="p-2 border-[2px] border-[#171714] rounded"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingUser({
                              ...editingUser,
                              puls_do: new Date().toISOString().slice(0, 10),
                            })
                          }
                          className="px-3 py-2 border-[2px] border-[#171714] rounded text-sm font-bold"
                        >
                          Na dziś
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUser({ ...editingUser, puls_do: null })}
                          className="px-3 py-2 border-[2px] border-[#B7B6AE] rounded text-sm text-[#6E6E66]"
                        >
                          Odbierz
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isNew && editingUser.role !== "kiosk" && (
                <>
                  {/* 9. Urlop i dni wolne. */}
                  <p className={`${statLabelCls} mb-2 flex items-center gap-1.5`}>
                    <Palmtree size={13} /> Urlop i dni wolne
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <label className={labelCls}>Od</label>
                      <input
                        type="date"
                        value={urlopFrom}
                        onChange={(e) => setUrlopFrom(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Do</label>
                      <input
                        type="date"
                        value={urlopTo}
                        onChange={(e) => setUrlopTo(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddUrlopClick}
                    disabled={urlopSaving}
                    className={`${btnSecondaryCls} mb-3`}
                  >
                    Dodaj urlop (8h/dzień roboczy)
                  </button>
                  {absences.filter((a) => a.user_id === editingUser.id).length > 0 && (
                    <div className="space-y-1.5 mb-5">
                      {absences
                        .filter((a) => a.user_id === editingUser.id)
                        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
                        .map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between text-sm bg-[#F1F1EE] rounded p-2"
                          >
                            <span>
                              {new Date(a.start_date + "T00:00:00").toLocaleDateString("pl-PL")}–
                              {new Date(a.end_date + "T00:00:00").toLocaleDateString("pl-PL")} ·{" "}
                              {a.type === "urlop" ? "Urlop" : "Niedostępność"} ·{" "}
                              {a.status === "pending"
                                ? "Oczekuje"
                                : a.status === "approved"
                                ? "Zatwierdzony"
                                : "Odrzucony"}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteAbsenceClick(a)}
                              className="text-[#8F8E86] hover:text-[#DE3A22]"
                              title="Usuń"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}

              {editingUser.role !== "kiosk" && (
                <>
                  {/* 10. Znany ostatni dzień pracy. Grafik po tej dacie nie da
                      wpisać zmiany, a przypomnienia o umowie milkną — nie ma
                      sensu gonić kogoś, kto i tak odchodzi. */}
                  <p className={`${statLabelCls} mb-2`}>Koniec współpracy</p>
                  <div className="mb-5">
                    <label className={labelCls}>Ostatni dzień pracy (jeśli znany)</label>
                    <input
                      type="date"
                      value={editingUser.ostatni_dzien || ""}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, ostatni_dzien: e.target.value || null })
                      }
                      className={inputCls}
                    />
                    {editingUser.ostatni_dzien && (
                      <p className="text-xs text-[#6E6E66] mt-1">
                        Po tej dacie Grafik nie pozwoli wpisać tej osobie zmiany.
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* 11. Notatki. */}
              <p className={`${statLabelCls} mb-2`}>Notatki kierownika</p>
              <textarea
                value={editingUser.notatki || ""}
                onChange={(e) => setEditingUser({ ...editingUser, notatki: e.target.value })}
                placeholder="Opcjonalnie — widoczne tylko dla kierowników"
                className="w-full p-2 border-[2px] border-[#171714] rounded min-h-[70px] mb-1"
              />
              {editingUser.notatki_updated_by && (
                <p className="text-[11px] text-[#8F8E86] mb-2">
                  Ostatnia zmiana: {editingUser.notatki_updated_by},{" "}
                  {new Date(editingUser.notatki_updated_at).toLocaleDateString("pl-PL")}
                </p>
              )}

              {/* 12. Stan konta i akcje — razem, bo to jedna decyzja: co robimy
                  z tą kartą po wyjściu. */}
              <label className="flex items-center gap-2 mb-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingUser.active}
                  onChange={(e) => setEditingUser({ ...editingUser, active: e.target.checked })}
                  className="w-5 h-5"
                />
                <span className="font-bold text-sm">Konto aktywne</span>
              </label>
              <div className="flex gap-2 pt-3 border-t-[2px] border-[#171714] flex-wrap">
                <button type="submit" className={btnPrimaryCls}>
                  Zapisz zmiany
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className={btnSecondaryCls}>
                  Anuluj
                </button>
                {!isNew && view === "aktywni" && (
                  <button
                    type="button"
                    onClick={() => {
                      onArchive("users", editingUser.id, true);
                      setEditingUser(null);
                    }}
                    className="ml-auto border-[2px] border-[#B7B6AE] text-[#6E6E66] px-4 py-2.5 rounded font-bold text-sm flex items-center gap-1.5 hover:border-[#171714] hover:text-[#171714]"
                  >
                    <Archive size={15} /> Archiwizuj
                  </button>
                )}
                {!isNew && view === "archiwum" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onArchive("users", editingUser.id, false);
                        setEditingUser(null);
                      }}
                      className="ml-auto border-[2px] border-[#171714] px-4 py-2.5 rounded font-bold text-sm flex items-center gap-1.5"
                    >
                      <ArchiveRestore size={15} /> Przywróć
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPermanentDelete("users", editingUser.id);
                        setEditingUser(null);
                      }}
                      className="border-[2px] border-[#DE3A22] text-[#DE3A22] px-4 py-2.5 rounded font-bold text-sm flex items-center gap-1.5"
                    >
                      <Trash2 size={15} /> Usuń na zawsze
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
