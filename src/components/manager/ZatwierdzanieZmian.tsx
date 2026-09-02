// @ts-nocheck
// Kolejka decyzji kierownika dla issues.type === "correction" (poprawka
// godzin / "zapomniałem odbić" zgłoszone przez pracownika w Zgłoś). Biржа
// zmian z Grafiku — świadomie poza zakresem, patrz plan realizacji.
import React, { useState } from "react";
import { Check, Edit2, HelpCircle, AlertCircle } from "lucide-react";
import { resolveCorrection, askAboutCorrection } from "../../utils/corrections";

const fmtHHMM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`
    : "";

const fmtPL = (dateStr) =>
  dateStr
    ? new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
      })
    : "";

const diffCls = (a, b) => (a !== b ? "text-[#DE3A22] font-bold" : "text-[#171714]");

export default function ZatwierdzanieZmian({
  currentUser,
  shifts,
  setShifts,
  issues,
  setIssues,
  shiftEdits,
  setShiftEdits,
  hasAccessToLokal,
  availableLokale,
  activeStanowiska,
  showMsg,
}) {
  const [selected, setSelected] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = issues
    .filter((iss) => iss.type === "correction" && iss.status === "nowe")
    .map((iss) => {
      const existingShift = iss.shift_id
        ? shifts.find((s) => s.id === iss.shift_id)
        : null;
      const lokal = existingShift ? existingShift.lokal : iss.proposed_lokal;
      return { issue: iss, existingShift, lokal };
    })
    .filter((r) => hasAccessToLokal(r.lokal))
    .sort(
      (a, b) => new Date(a.issue.created_at) - new Date(b.issue.created_at)
    );

  const onSaved = (issueId, { shift, shiftEdit }) => {
    setIssues(
      issues.map((iss) =>
        iss.id === issueId ? { ...iss, status: "rozwiazane" } : iss
      )
    );
    setShifts((prev) => {
      const exists = prev.some((s) => s.id === shift.id);
      return exists
        ? prev.map((s) => (s.id === shift.id ? shift : s))
        : [...prev, shift];
    });
    setShiftEdits((prev) => [...prev, shiftEdit]);
  };

  const handleZatwierdz = async (row) => {
    setBusy(true);
    try {
      const saved = await resolveCorrection({
        issue: row.issue,
        shifts,
        editorName: currentUser.name,
        finalValues: {
          date: row.issue.proposed_date,
          lokal: row.issue.proposed_lokal,
          stanowisko: row.issue.proposed_stanowisko,
          start: row.issue.proposed_start_time,
          end: row.issue.proposed_end_time,
        },
      });
      onSaved(row.issue.id, saved);
      showMsg("Zmiana zatwierdzona!");
    } catch (err) {
      showMsg(`Błąd zatwierdzania: ${err.message || "nieznany błąd"}`, "error");
    }
    setBusy(false);
  };

  const handleZatwierdzWybrane = async () => {
    const toApprove = rows.filter((r) => selected[r.issue.id]);
    if (toApprove.length === 0) return;
    setBusy(true);
    for (const row of toApprove) {
      try {
        const saved = await resolveCorrection({
          issue: row.issue,
          shifts,
          editorName: currentUser.name,
          finalValues: {
            date: row.issue.proposed_date,
            lokal: row.issue.proposed_lokal,
            stanowisko: row.issue.proposed_stanowisko,
            start: row.issue.proposed_start_time,
            end: row.issue.proposed_end_time,
          },
        });
        onSaved(row.issue.id, saved);
      } catch (err) {
        showMsg(
          `Błąd przy ${row.issue.user_name}: ${err.message || "nieznany błąd"}`,
          "error"
        );
      }
    }
    setSelected({});
    setBusy(false);
    showMsg("Wybrane zmiany zatwierdzone!");
  };

  const openPopraw = (row) => {
    setEditingId(row.issue.id);
    setEditForm({
      date: row.issue.proposed_date || "",
      lokal: row.issue.proposed_lokal || row.lokal || availableLokale[0]?.name || "",
      stanowisko: row.issue.proposed_stanowisko || "",
      start: row.issue.proposed_start_time || "",
      end: row.issue.proposed_end_time || "",
      reason: "",
    });
  };

  const handleZapiszIZatwierdz = async (row) => {
    if (!editForm.reason.trim()) {
      return showMsg("Podaj powód korekty — pracownik go zobaczy.", "error");
    }
    setBusy(true);
    try {
      const saved = await resolveCorrection({
        issue: row.issue,
        shifts,
        editorName: currentUser.name,
        finalValues: editForm,
        reason: editForm.reason.trim(),
      });
      onSaved(row.issue.id, saved);
      setEditingId(null);
      setEditForm(null);
      showMsg("Zmiana poprawiona i zatwierdzona!");
    } catch (err) {
      showMsg(`Błąd zapisu: ${err.message || "nieznany błąd"}`, "error");
    }
    setBusy(false);
  };

  const handleZapytaj = async (row) => {
    setBusy(true);
    try {
      await askAboutCorrection(row.issue);
      showMsg("Wysłano pytanie do pracownika.");
    } catch (err) {
      showMsg("Błąd wysyłki pytania.", "error");
    }
    setBusy(false);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          {rows.length} {rows.length === 1 ? "zmiana czeka" : "zmiany czekają"}{" "}
          na decyzję
        </h2>
        {selectedCount > 0 && (
          <button
            onClick={handleZatwierdzWybrane}
            disabled={busy}
            className="bg-[#DE3A22] text-white px-4 py-2 rounded font-bold hover:opacity-90"
          >
            Zatwierdź wybrane · {selectedCount}
          </button>
        )}
      </div>

      {rows.length === 0 && (
        <div className="bg-white p-8 rounded-xl shadow border text-center text-gray-400">
          Brak zmian oczekujących na decyzję.
        </div>
      )}

      <div className="space-y-4">
        {rows.map((row) => {
          const { issue: iss, existingShift } = row;
          const isEditing = editingId === iss.id;
          const proposedH =
            iss.proposed_start_time && iss.proposed_end_time
              ? (() => {
                  const [sh, sm] = iss.proposed_start_time.split(":").map(Number);
                  const [eh, em] = iss.proposed_end_time.split(":").map(Number);
                  let mins = eh * 60 + em - (sh * 60 + sm);
                  if (mins < 0) mins += 24 * 60;
                  return mins / 60;
                })()
              : null;
          const currentH = existingShift
            ? existingShift.end_time
              ? (existingShift.end_time - existingShift.start_time) / 3600000
              : null
            : null;
          const delta =
            proposedH != null && currentH != null ? proposedH - currentH : null;

          return (
            <div
              key={iss.id}
              className="bg-white rounded-xl shadow border-2 border-[#171714] p-4"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5 w-4 h-4"
                    checked={!!selected[iss.id]}
                    onChange={(e) =>
                      setSelected({ ...selected, [iss.id]: e.target.checked })
                    }
                  />
                  <div>
                    <p className="font-bold text-lg">
                      {iss.user_name || "Anonim"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {row.lokal} · {fmtPL(iss.proposed_date)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-8 text-sm">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">
                      Grafik
                    </p>
                    {existingShift ? (
                      <p className="font-['Archivo'] font-bold">
                        {fmtHHMM(existingShift.start_time)}–
                        {existingShift.end_time
                          ? fmtHHMM(existingShift.end_time)
                          : "trwa"}
                      </p>
                    ) : (
                      <p className="text-gray-400">Brak — nowy wpis</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">
                      Zgłoszone
                    </p>
                    <p>
                      <span
                        className={diffCls(
                          existingShift ? fmtHHMM(existingShift.start_time) : "",
                          iss.proposed_start_time
                        )}
                      >
                        {iss.proposed_start_time || "—"}
                      </span>
                      –
                      <span
                        className={diffCls(
                          existingShift && existingShift.end_time
                            ? fmtHHMM(existingShift.end_time)
                            : "",
                          iss.proposed_end_time || ""
                        )}
                      >
                        {iss.proposed_end_time || "brak"}
                      </span>
                      {delta != null && delta !== 0 && (
                        <span className="text-[#DE3A22] font-bold ml-2">
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(2)}h
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {!isEditing && (
                  <div className="flex gap-2 flex-shrink-0">
                    {iss.proposed_end_time ? (
                      <button
                        onClick={() => handleZatwierdz(row)}
                        disabled={busy}
                        className="bg-[#DE3A22] text-white px-4 py-2 rounded font-bold flex items-center gap-1.5"
                      >
                        <Check size={16} /> Zatwierdź
                      </button>
                    ) : (
                      <button
                        onClick={() => handleZapytaj(row)}
                        disabled={busy}
                        className="border-2 border-[#171714] px-4 py-2 rounded font-bold flex items-center gap-1.5"
                      >
                        <HelpCircle size={16} /> Zapytaj
                      </button>
                    )}
                    <button
                      onClick={() => openPopraw(row)}
                      disabled={busy}
                      className="border-2 border-[#171714] px-4 py-2 rounded font-bold flex items-center gap-1.5"
                    >
                      <Edit2 size={16} /> Popraw
                    </button>
                  </div>
                )}
              </div>

              {iss.issue_text && (
                <p className="text-sm text-gray-500 mt-3 italic">
                  „{iss.issue_text}”
                </p>
              )}

              {isEditing && (
                <div className="mt-4 pt-4 border-t-2 border-[#171714] grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="text-xs font-bold text-gray-500">Data</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, date: e.target.value })
                      }
                      className="w-full border-2 rounded p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">Lokal</label>
                    <select
                      value={editForm.lokal}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lokal: e.target.value })
                      }
                      className="w-full border-2 rounded p-2 text-sm"
                    >
                      {availableLokale.map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Stanowisko
                    </label>
                    <select
                      value={editForm.stanowisko}
                      onChange={(e) =>
                        setEditForm({ ...editForm, stanowisko: e.target.value })
                      }
                      className="w-full border-2 rounded p-2 text-sm"
                    >
                      {activeStanowiska
                        .filter((s) => s.lokal_name === editForm.lokal)
                        .map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Wejście
                    </label>
                    <input
                      type="time"
                      value={editForm.start}
                      onChange={(e) =>
                        setEditForm({ ...editForm, start: e.target.value })
                      }
                      className="w-full border-2 rounded p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">
                      Wyjście
                    </label>
                    <input
                      type="time"
                      value={editForm.end}
                      onChange={(e) =>
                        setEditForm({ ...editForm, end: e.target.value })
                      }
                      className="w-full border-2 rounded p-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-6">
                    <label className="text-xs font-bold text-gray-500">
                      Powód korekty (widoczny dla pracownika)
                    </label>
                    <input
                      type="text"
                      value={editForm.reason}
                      onChange={(e) =>
                        setEditForm({ ...editForm, reason: e.target.value })
                      }
                      placeholder="Np. potwierdzone z kierownikiem zmiany"
                      className="w-full border-2 rounded p-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-6 flex gap-2">
                    <button
                      onClick={() => handleZapiszIZatwierdz(row)}
                      disabled={busy}
                      className="bg-[#DE3A22] text-white px-4 py-2 rounded font-bold"
                    >
                      Zapisz i zatwierdź
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditForm(null);
                      }}
                      className="border-2 border-[#171714] px-4 py-2 rounded font-bold"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-2 text-sm text-gray-500">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          Zatwierdzone zmiany trafiają do Rejestru godzin i do arkusza
          rozliczeniowego. Każda korekta zapisuje kto i kiedy zmienił godzinę.
        </p>
      </div>
    </div>
  );
}
