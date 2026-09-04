// @ts-nocheck
// Kolejka decyzji kierownika dla issues.type === "correction" (poprawka
// godzin / "zapomniałem odbić" zgłoszone przez pracownika w Zgłoś). Biржа
// zmian z Grafiku — świadomie poza zakresem, patrz plan realizacji.
import React, { useState } from "react";
import {
  Check,
  Edit2,
  HelpCircle,
  AlertCircle,
  X,
  Palmtree,
  ArrowLeftRight,
} from "lucide-react";
import { resolveCorrection, askAboutCorrection } from "../../utils/corrections";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { trimTime, shiftHours } from "../../utils/grafik";
import { monthPlanHours } from "../../utils/swaps";
import { pageTitleCls, statLabelCls, btnPrimaryCls, btnSecondaryCls } from "./designTokens";

const fmtPLAbs = (dateStr) =>
  dateStr
    ? new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";

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
  pendingAbsences = [],
  onResolveAbsence,
  pendingSwaps = [],
  planShifts = [],
  onResolveSwap,
  showMsg,
}) {
  const [selected, setSelected] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [absenceBusyId, setAbsenceBusyId] = useState(null);
  const [swapBusyId, setSwapBusyId] = useState(null);

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
      await askAboutCorrection(row.issue, currentUser.name);
      showMsg("Wysłano pytanie do pracownika.");
    } catch (err) {
      showMsg("Błąd wysyłki pytania.", "error");
    }
    setBusy(false);
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const handleAbsenceDecision = async (absence, decision) => {
    setAbsenceBusyId(absence.id);
    try {
      await onResolveAbsence(absence, decision);
      showMsg(decision === "approved" ? "Wniosek zatwierdzony!" : "Wniosek odrzucony.");
    } catch (err) {
      showMsg(`Błąd zapisu: ${err.message || "nieznany błąd"}`, "error");
    }
    setAbsenceBusyId(null);
  };

  const handleSwapDecision = async (swap, decision) => {
    setSwapBusyId(swap.id);
    await onResolveSwap(swap, decision);
    setSwapBusyId(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {pendingSwaps.length > 0 && (
        <div className="mb-8">
          <h3 className="font-['Archivo'] font-extrabold text-lg mb-3 flex items-center gap-2">
            <ArrowLeftRight size={18} /> Giełda zmian · {pendingSwaps.length}
          </h3>
          <div className="space-y-3">
            {pendingSwaps.map((sw) => {
              const ps = planShifts.find(
                (p) => String(p.id) === String(sw.grafik_shift_id)
              );
              return (
                <div
                  key={sw.id}
                  className="bg-white rounded-xl border-[2px] border-[#171714] p-4 flex items-start justify-between gap-4 flex-wrap"
                >
                  <div>
                    <div className="font-['Archivo'] font-extrabold text-[15px]">
                      {sw.taker_user_name} przejmuje zmianę od: {sw.author_user_name}
                    </div>
                    <div className="text-[14px] text-[#6E6E66] mt-0.5">
                      {ps
                        ? `${fmtPLAbs(ps.date)} · ${trimTime(ps.start_time)}–${trimTime(
                            ps.end_time
                          )} · ${ps.stanowisko} · ${ps.lokal}`
                        : `${fmtPLAbs(sw.date)} · ${sw.lokal} · zmiana już nie istnieje`}
                    </div>
                    {sw.note && (
                      <div className="text-[13px] text-[#6E6E66] mt-1">{sw.note}</div>
                    )}
                    {ps &&
                      (() => {
                        // Różnica godzin w miesiącu dla obu stron — bez tego
                        // nie da się odpowiedzialnie zdecydować, gdy ktoś
                        // pracuje na etat. (Sam etat to osobny temat; tutaj
                        // pokazujemy wyłącznie liczby.)
                        const mies = ps.date.slice(0, 7);
                        const h = shiftHours(ps);
                        const strony = [
                          {
                            osoba: sw.taker_user_name,
                            teraz: monthPlanHours(
                              planShifts,
                              { id: sw.taker_user_id, name: sw.taker_user_name },
                              mies
                            ),
                            delta: h,
                          },
                          {
                            osoba: sw.author_user_name,
                            teraz: monthPlanHours(
                              planShifts,
                              { id: sw.author_user_id, name: sw.author_user_name },
                              mies
                            ),
                            delta: -h,
                          },
                        ];
                        return (
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                            {strony.map((r) => (
                              <span key={r.osoba} className="tabular-nums">
                                <span className="font-bold">{r.osoba}</span>{" "}
                                {Math.round(r.teraz * 10) / 10} h →{" "}
                                {Math.round((r.teraz + r.delta) * 10) / 10} h{" "}
                                <span
                                  className={`font-extrabold ${
                                    r.delta > 0 ? "text-[#2F7A2A]" : "text-[#DE3A22]"
                                  }`}
                                >
                                  ({r.delta > 0 ? "+" : "−"}
                                  {Math.round(Math.abs(r.delta) * 10) / 10} h)
                                </span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSwapDecision(sw, "approve")}
                      disabled={swapBusyId === sw.id || !ps}
                      className={btnPrimaryCls}
                    >
                      Zatwierdź
                    </button>
                    <button
                      onClick={() => handleSwapDecision(sw, "reject")}
                      disabled={swapBusyId === sw.id}
                      className={btnSecondaryCls}
                    >
                      Odrzuć
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingAbsences.length > 0 && (
        <div className="mb-8">
          <h3 className="font-['Archivo'] font-extrabold text-lg mb-3 flex items-center gap-2">
            <Palmtree size={18} /> Wnioski o wolne · {pendingAbsences.length}
          </h3>
          <div className="space-y-3">
            {pendingAbsences.map((a) => {
              const dniRobocze = countWorkdays(a.start_date, a.end_date);
              const godziny =
                a.type === "urlop" ? dniRobocze * URLOP_HOURS_PER_DAY : null;
              return (
              <div
                key={a.id}
                className="bg-white rounded-xl border-[2px] border-[#171714] p-4 flex items-start justify-between gap-4 flex-wrap"
              >
                <div>
                  <p className="font-['Archivo'] font-bold text-lg">
                    {a.user_name || "Pracownik"}
                  </p>
                  <p className="text-sm text-[#6E6E66]">
                    {a.lokal} · {a.type === "urlop" ? "Urlop" : "Niedostępność"} ·{" "}
                    {fmtPLAbs(a.start_date)}–{fmtPLAbs(a.end_date)} ·{" "}
                    <span className="font-bold text-[#171714]">
                      {dniRobocze} {dniRobocze === 1 ? "dzień roboczy" : "dni robocze"}
                    </span>
                    {godziny != null && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="font-bold text-[#171714]">{godziny}h</span>
                      </>
                    )}
                  </p>
                  {a.note && (
                    <p className="text-sm text-[#6E6E66] mt-1.5 italic">„{a.note}”</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAbsenceDecision(a, "approved")}
                    disabled={absenceBusyId === a.id}
                    className={`${btnPrimaryCls} flex items-center gap-1.5`}
                  >
                    <Check size={16} /> Zatwierdź
                  </button>
                  <button
                    onClick={() => handleAbsenceDecision(a, "rejected")}
                    disabled={absenceBusyId === a.id}
                    className={`${btnSecondaryCls} flex items-center gap-1.5`}
                  >
                    <X size={16} /> Odrzuć
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className={pageTitleCls}>
          {rows.length} {rows.length === 1 ? "zmiana czeka" : "zmiany czekają"}{" "}
          na decyzję
        </h2>
        {selectedCount > 0 && (
          <button onClick={handleZatwierdzWybrane} disabled={busy} className={btnPrimaryCls}>
            Zatwierdź wybrane · {selectedCount}
          </button>
        )}
      </div>

      {rows.length === 0 && (
        <div className="bg-white p-8 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
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
              className="bg-white rounded-xl border-[2px] border-[#171714] p-4"
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
                    <p className="font-['Archivo'] font-bold text-lg">
                      {iss.user_name || "Anonim"}
                    </p>
                    <p className="text-sm text-[#6E6E66]">
                      {row.lokal} · {fmtPL(iss.proposed_date)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-8 text-sm">
                  <div>
                    <p className={statLabelCls}>Grafik</p>
                    {existingShift ? (
                      <p className="font-['Archivo'] font-bold">
                        {fmtHHMM(existingShift.start_time)}–
                        {existingShift.end_time
                          ? fmtHHMM(existingShift.end_time)
                          : "trwa"}
                      </p>
                    ) : (
                      <p className="text-[#8F8E86]">Brak — nowy wpis</p>
                    )}
                  </div>
                  <div>
                    <p className={statLabelCls}>Zgłoszone</p>
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
                        className={`${btnPrimaryCls} flex items-center gap-1.5`}
                      >
                        <Check size={16} /> Zatwierdź
                      </button>
                    ) : (
                      <button
                        onClick={() => handleZapytaj(row)}
                        disabled={busy}
                        className={`${btnSecondaryCls} flex items-center gap-1.5`}
                      >
                        <HelpCircle size={16} /> Zapytaj
                      </button>
                    )}
                    <button
                      onClick={() => openPopraw(row)}
                      disabled={busy}
                      className={`${btnSecondaryCls} flex items-center gap-1.5`}
                    >
                      <Edit2 size={16} /> Popraw
                    </button>
                  </div>
                )}
              </div>

              {iss.issue_text && (
                <p className="text-sm text-[#6E6E66] mt-3 italic">
                  „{iss.issue_text}”
                </p>
              )}

              {isEditing && (
                <div className="mt-4 pt-4 border-t-2 border-[#171714] grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">Data</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) =>
                        setEditForm({ ...editForm, date: e.target.value })
                      }
                      className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">Lokal</label>
                    <select
                      value={editForm.lokal}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lokal: e.target.value })
                      }
                      className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                    >
                      {availableLokale.map((l) => (
                        <option key={l.id} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">
                      Stanowisko
                    </label>
                    <select
                      value={editForm.stanowisko}
                      onChange={(e) =>
                        setEditForm({ ...editForm, stanowisko: e.target.value })
                      }
                      className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
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
                    <label className="text-xs font-bold text-[#6E6E66]">
                      Wejście
                    </label>
                    <input
                      type="time"
                      value={editForm.start}
                      onChange={(e) =>
                        setEditForm({ ...editForm, start: e.target.value })
                      }
                      className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#6E6E66]">
                      Wyjście
                    </label>
                    <input
                      type="time"
                      value={editForm.end}
                      onChange={(e) =>
                        setEditForm({ ...editForm, end: e.target.value })
                      }
                      className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-6">
                    <label className="text-xs font-bold text-[#6E6E66]">
                      Powód korekty (widoczny dla pracownika)
                    </label>
                    <input
                      type="text"
                      value={editForm.reason}
                      onChange={(e) =>
                        setEditForm({ ...editForm, reason: e.target.value })
                      }
                      placeholder="Np. potwierdzone z kierownikiem zmiany"
                      className="w-full border-[2px] border-[#171714] rounded p-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2 md:col-span-6 flex gap-2">
                    <button
                      onClick={() => handleZapiszIZatwierdz(row)}
                      disabled={busy}
                      className={btnPrimaryCls}
                    >
                      Zapisz i zatwierdź
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditForm(null);
                      }}
                      className={btnSecondaryCls}
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

      <div className="mt-6 flex items-start gap-2 text-sm text-[#6E6E66]">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          Zatwierdzone zmiany trafiają do Rejestru godzin i do arkusza
          rozliczeniowego. Każda korekta zapisuje kto i kiedy zmienił godzinę.
        </p>
      </div>
    </div>
  );
}
