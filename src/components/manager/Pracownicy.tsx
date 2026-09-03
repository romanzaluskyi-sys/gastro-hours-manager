// @ts-nocheck
// Nowy wygląd dawnego "Przewodnik" → zakładka Pracownicy: lista + karta
// szczegółów obok siebie (zamiast modala), z nowymi polami (stawka, etat,
// notatki + kto/kiedy, kiosk_pin) i usuwaniem na zawsze tylko z Archiwum.
// Lokale/Stanowiska (dawne podzakładki Przewodnika, admin-only) żyją tu
// dalej jako dodatkowe widoki `view` — nie były w kolejce makiet, więc
// zostały tylko lekko przemalowane pod nowe tokeny, bez zmiany logiki
// (ta sama handleSaveDict/editingDict z ManagerDashboard.tsx).
//
// Wymagane pola (ustalone w sesji): imię, lokal, stanowisko (obie poza
// rolą "kiosk", która ich nie ma), typ konta; przy roli innej niż "open"
// dodatkowo email+PIN. Reszta — stawka/etat/notatki/kiosk_pin/terminy —
// opcjonalna.
import React, { useState } from "react";
import {
  Plus,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronLeft,
  AlertTriangle,
  Edit2,
} from "lucide-react";
import { pageTitleCls, cardCls, btnPrimaryCls, btnSecondaryCls, statLabelCls } from "./designTokens";

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
    if (!u.umowa_expiry) missing.push("umowa");
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
  editingDict,
  setEditingDict,
  onSaveDict,
}) {
  const [view, setView] = useState("aktywni"); // "aktywni" | "archiwum" | "lokale" | "stanowiska"

  const isNew = editingUser && editingUser.id === null;
  const isEmailPinRequired = editingUser && editingUser.role !== "open";
  const showTermWarnings = editingUser && !!editingUser.id;

  const dostepneStanowiska = editingUser
    ? activeStanowiska.filter((s) => s.lokal_name === editingUser.default_lokal)
    : [];

  const now = new Date();
  const monthShifts = editingUser?.id
    ? shifts.filter(
        (s) =>
          s.user_id === editingUser.id &&
          s.start_time.getMonth() === now.getMonth() &&
          s.start_time.getFullYear() === now.getFullYear()
      )
    : [];
  const monthHours = monthShifts.reduce(
    (a, s) => a + (s.end_time ? (s.end_time - s.start_time) / 3600000 : 0),
    0
  );
  const monthCost =
    editingUser?.stawka != null && editingUser.stawka !== ""
      ? monthHours * Number(editingUser.stawka)
      : null;

  const allowedArr = (u) =>
    Array.isArray(u.allowed_lokale)
      ? u.allowed_lokale
      : u.allowed_lokale
      ? u.allowed_lokale.split(",").map((s) => s.trim())
      : [];

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
          {!isLocalManager && (
            <>
              <button
                onClick={() => setView("lokale")}
                className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
                  view === "lokale"
                    ? "bg-[#171714] text-white border-[#171714]"
                    : "bg-white text-[#6E6E66] border-[#B7B6AE]"
                }`}
              >
                Lokale
              </button>
              <button
                onClick={() => setView("stanowiska")}
                className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
                  view === "stanowiska"
                    ? "bg-[#171714] text-white border-[#171714]"
                    : "bg-white text-[#6E6E66] border-[#B7B6AE]"
                }`}
              >
                Stanowiska
              </button>
            </>
          )}
          {view === "aktywni" && (
            <button onClick={onNewUser} className={`${btnPrimaryCls} flex items-center gap-1.5`}>
              <Plus size={15} /> Dodaj pracownika
            </button>
          )}
          {(view === "lokale" || view === "stanowiska") && (
            <button
              onClick={() =>
                setEditingDict({
                  id: null,
                  name: "",
                  lokal_name: activeLokale.length > 0 ? activeLokale[0].name : "",
                })
              }
              className={`${btnPrimaryCls} flex items-center gap-1.5`}
            >
              <Plus size={15} /> Dodaj {view === "lokale" ? "lokal" : "stanowisko"}
            </button>
          )}
        </div>
      </div>

      {(view === "lokale" || view === "stanowiska") && (
        <div>
          {editingDict && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <form
                onSubmit={(e) => onSaveDict(e, view)}
                className="bg-white p-6 rounded-xl border-[2px] border-[#171714] w-full max-w-sm"
              >
                <h3 className="font-['Archivo'] font-extrabold text-lg mb-4">
                  {editingDict.id ? "Edytuj" : "Dodaj"} {view === "lokale" ? "lokal" : "stanowisko"}
                </h3>
                <div className="mb-4 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">Nazwa</label>
                    <input
                      type="text"
                      value={editingDict.name}
                      onChange={(e) => setEditingDict({ ...editingDict, name: e.target.value })}
                      className="w-full p-2 border-[2px] border-[#171714] rounded"
                      required
                      autoFocus
                    />
                  </div>
                  {view === "stanowiska" && (
                    <div>
                      <label className="text-xs font-bold text-[#6E6E66]">Lokal</label>
                      <select
                        value={editingDict.lokal_name}
                        onChange={(e) =>
                          setEditingDict({ ...editingDict, lokal_name: e.target.value })
                        }
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
                        required
                      >
                        {activeLokale.map((l) => (
                          <option key={l.id} value={l.name}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {view === "lokale" && (
                    <div>
                      <label className="text-xs font-bold text-[#6E6E66]">
                        Miasto (do pogody)
                      </label>
                      <input
                        type="text"
                        value={editingDict.miasto || ""}
                        onChange={(e) =>
                          setEditingDict({ ...editingDict, miasto: e.target.value })
                        }
                        placeholder="np. Koszalin"
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
                      />
                    </div>
                  )}
                  {view === "stanowiska" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-[#6E6E66]">
                          Skrót (np. "KUCH")
                        </label>
                        <input
                          type="text"
                          value={editingDict.skrot || ""}
                          onChange={(e) =>
                            setEditingDict({
                              ...editingDict,
                              skrot: e.target.value.toUpperCase(),
                            })
                          }
                          maxLength={4}
                          placeholder="opcjonalnie"
                          className="w-full p-2 border-[2px] border-[#171714] rounded uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-[#6E6E66]">Kolor</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={editingDict.kolor || "#DE3A22"}
                            onChange={(e) =>
                              setEditingDict({ ...editingDict, kolor: e.target.value })
                            }
                            className="w-11 h-[38px] border-[2px] border-[#171714] rounded cursor-pointer"
                          />
                          {editingDict.kolor && (
                            <button
                              type="button"
                              onClick={() => setEditingDict({ ...editingDict, kolor: "" })}
                              className="text-xs font-bold text-[#8F8E86] underline"
                            >
                              Wyczyść
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingDict(null)}
                    className={btnSecondaryCls}
                  >
                    Anuluj
                  </button>
                  <button type="submit" className={btnPrimaryCls}>
                    Zapisz
                  </button>
                </div>
              </form>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            {(view === "lokale" ? activeLokale : activeStanowiska).map((item) => (
              <div
                key={item.id}
                className="bg-white p-3.5 rounded-xl border-[2px] border-[#171714] flex justify-between items-center"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    {view === "stanowiska" && item.kolor && (
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                        style={{ backgroundColor: item.kolor }}
                      />
                    )}
                    <p className="font-['Archivo'] font-bold">
                      {item.name}
                      {view === "stanowiska" && item.skrot ? ` (${item.skrot})` : ""}
                    </p>
                  </div>
                  {view === "stanowiska" && (
                    <p className="text-xs text-[#6E6E66]">Lokal: {item.lokal_name}</p>
                  )}
                  {view === "lokale" && (
                    <p className="text-xs text-[#6E6E66]">
                      Miasto: {item.miasto || "— nie ustawiono"}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setEditingDict({ ...item })}
                    className="w-8 h-8 border-[2px] border-[#171714] rounded flex items-center justify-center"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => onArchive(view, item.id, true)}
                    className="w-8 h-8 border-[2px] border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                    title="Do archiwum"
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  {view === "aktywni" && missing.length > 0 && (
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

              <p className={`${statLabelCls} mb-2`}>Dane podstawowe</p>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs font-bold text-[#6E6E66]">Imię i nazwisko</label>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="w-full p-2 border-[2px] border-[#171714] rounded"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#6E6E66]">Typ konta</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className="w-full p-2 border-[2px] border-[#171714] rounded font-bold"
                  >
                    <option value="closed">Pracownik (Aplikacja na telefon)</option>
                    <option value="open">Pracownik (Otwarte Konto - Kiosk)</option>
                    {!isLocalManager && <option value="kiosk">Konto Służbowe (Tablet lokalu)</option>}
                    {!isLocalManager && <option value="manager_lokalu">Kierownik Lokalu</option>}
                    {!isLocalManager && <option value="admin">Szef (Admin)</option>}
                  </select>
                </div>

                {isEmailPinRequired ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-[#6E6E66]">Email / Login</label>
                      <input
                        type="email"
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#6E6E66]">PIN (6 cyfr)</label>
                      <input
                        type="text"
                        value={editingUser.pin}
                        onChange={(e) => setEditingUser({ ...editingUser, pin: e.target.value })}
                        maxLength="6"
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">
                      PIN blokady na kiosku (4 cyfry, opcjonalnie)
                    </label>
                    <input
                      type="text"
                      value={editingUser.kiosk_pin || ""}
                      onChange={(e) => setEditingUser({ ...editingUser, kiosk_pin: e.target.value })}
                      maxLength="4"
                      placeholder="brak — kiosk nie pyta o PIN"
                      className="w-full p-2 border-[2px] border-[#171714] rounded"
                    />
                  </div>
                )}

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
                      <label className="text-xs font-bold text-[#6E6E66]">Lokal</label>
                      <select
                        value={editingUser.default_lokal || ""}
                        onChange={(e) =>
                          setEditingUser({
                            ...editingUser,
                            default_lokal: e.target.value,
                            default_stanowisko: "",
                          })
                        }
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
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
                      <label className="text-xs font-bold text-[#6E6E66]">Stanowisko</label>
                      <select
                        value={editingUser.default_stanowisko || ""}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, default_stanowisko: e.target.value })
                        }
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">Stawka (zł/h)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingUser.stawka ?? ""}
                      onChange={(e) => setEditingUser({ ...editingUser, stawka: e.target.value })}
                      placeholder="opcjonalnie"
                      className="w-full p-2 border-[2px] border-[#171714] rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">Etat</label>
                    <select
                      value={editingUser.etat || ""}
                      onChange={(e) => setEditingUser({ ...editingUser, etat: e.target.value })}
                      className="w-full p-2 border-[2px] border-[#171714] rounded"
                    >
                      <option value="">-- nieustalone --</option>
                      <option value="pełny">Pełny etat</option>
                      <option value="część">Część etatu</option>
                      <option value="zlecenie">Umowa zlecenie</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingUser.active}
                    onChange={(e) => setEditingUser({ ...editingUser, active: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="font-bold text-sm">Konto aktywne</span>
                </label>
              </div>

              {editingUser.role !== "kiosk" && (
                <>
                  <p className={`${statLabelCls} mb-2`}>Sanepid i umowa</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div>
                      <label className="text-xs font-bold text-[#6E6E66]">
                        Termin książeczki sanepid
                      </label>
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
                    <div>
                      <label className="text-xs font-bold text-[#6E6E66]">Termin umowy</label>
                      <input
                        type="date"
                        value={editingUser.umowa_expiry || ""}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, umowa_expiry: e.target.value })
                        }
                        className={`w-full p-2 border-[2px] rounded ${
                          showTermWarnings && !editingUser.umowa_expiry
                            ? "border-[#DE3A22] bg-[#FAEAE6]"
                            : "border-[#171714]"
                        }`}
                      />
                      {showTermWarnings && !editingUser.umowa_expiry && (
                        <p className="text-xs text-[#DE3A22] mt-1">
                          Brak terminu — przypomnienia wyłączone
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!isNew && editingUser.role !== "kiosk" && (
                <>
                  <p className={`${statLabelCls} mb-2`}>Godziny i koszt (ten miesiąc)</p>
                  <div className="flex gap-6 mb-5">
                    <div>
                      <p className="font-['Archivo'] font-extrabold text-xl">
                        {monthHours.toFixed(1).replace(".", ",")} h
                      </p>
                    </div>
                    <div>
                      <p className="font-['Archivo'] font-extrabold text-xl">
                        {monthCost != null ? `${monthCost.toFixed(0)} zł` : "—"}
                      </p>
                      {monthCost == null && (
                        <p className="text-[11px] text-[#8F8E86]">brak stawki</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <p className={`${statLabelCls} mb-2`}>Notatki kierownika</p>
              <textarea
                value={editingUser.notatki || ""}
                onChange={(e) => setEditingUser({ ...editingUser, notatki: e.target.value })}
                placeholder="Opcjonalnie — widoczne tylko dla kierowników"
                className="w-full p-2 border-[2px] border-[#171714] rounded min-h-[70px] mb-1"
              />
              {editingUser.notatki_updated_by && (
                <p className="text-[11px] text-[#8F8E86] mb-5">
                  Ostatnia zmiana: {editingUser.notatki_updated_by},{" "}
                  {new Date(editingUser.notatki_updated_at).toLocaleDateString("pl-PL")}
                </p>
              )}

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
