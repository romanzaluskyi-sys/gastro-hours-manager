// @ts-nocheck
// Zgłoszenia typu "problem" (wolny tekst, opcjonalnie anonimowe) — typu
// "correction" tu nie ma, te idą do Zatwierdzanie zmian. Świadomie bez
// priorytetu/odpowiedzialnego/przypisania z makiety — ustalone w sesji:
// zamknięty zakres, tylko "Oznacz jako rozwiązane", jak dotychczas.
import React, { useState } from "react";
import { Flag, Check, ClipboardPlus } from "lucide-react";
import { pageTitleCls, cardCls, btnPrimaryCls, btnSecondaryCls } from "./designTokens";

export default function Zgloszenia({
  issues,
  users,
  hasAccessToLokal,
  onResolve,
  tasks,
  onCreateTaskFromIssue,
  fallbackLokal,
}) {
  const [taskFormIssueId, setTaskFormIssueId] = useState(null);
  const [taskTitle, setTaskTitle] = useState("");
  const rows = issues
    .filter((iss) => (iss.type || "problem") !== "correction")
    .filter((iss) =>
      hasAccessToLokal(users.find((u) => u.id === iss.user_id)?.default_lokal || "")
    )
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const openCount = rows.filter((iss) => iss.status === "nowe").length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className={pageTitleCls}>Zgłoszenia</h2>
        <span className="text-sm text-[#6E6E66]">
          {openCount} {openCount === 1 ? "otwarte" : "otwartych"}
        </span>
      </div>

      {rows.length === 0 && (
        <div className="bg-white p-8 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
          Brak zgłoszeń.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((iss) => {
          const lokal = users.find((u) => u.id === iss.user_id)?.default_lokal;
          const resolved = iss.status !== "nowe";
          return (
            <div
              key={iss.id}
              className={`${cardCls} ${resolved ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Flag size={15} className="text-[#8F8E86] flex-shrink-0" />
                  <p className="font-bold">
                    {iss.user_name || "Anonim"}
                    {lokal && <span className="text-[#8F8E86] font-normal"> · {lokal}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#8F8E86]">
                    {new Date(iss.created_at).toLocaleString("pl-PL", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ${
                      resolved
                        ? "bg-[#EAF4EC] text-[#2E6B44]"
                        : "bg-[#FAEAE6] text-[#8A3A2B]"
                    }`}
                  >
                    {resolved ? "Rozwiązane" : "Nowe"}
                  </span>
                </div>
              </div>
              <p className="text-[#171714] mb-3">{iss.issue_text}</p>
              {taskFormIssueId === iss.id ? (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="flex-1 min-w-[200px] border-[2px] border-[#171714] rounded p-2 text-sm"
                  />
                  <button
                    onClick={() => {
                      onCreateTaskFromIssue(iss, taskTitle, lokal || fallbackLokal);
                      setTaskFormIssueId(null);
                    }}
                    disabled={!taskTitle.trim()}
                    className={btnPrimaryCls}
                  >
                    Zapisz zadanie
                  </button>
                  <button
                    onClick={() => setTaskFormIssueId(null)}
                    className={btnSecondaryCls}
                  >
                    Anuluj
                  </button>
                </div>
              ) : tasks.some((t) => t.source_issue_id === iss.id) ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2E6B44] mb-1">
                  <Check size={13} /> Zadanie utworzone
                </span>
              ) : (
                <button
                  onClick={() => {
                    setTaskFormIssueId(iss.id);
                    setTaskTitle(iss.issue_text.slice(0, 80));
                  }}
                  className={`${btnSecondaryCls} flex items-center gap-1.5 mr-2`}
                >
                  <ClipboardPlus size={15} /> Utwórz zadanie
                </button>
              )}
              {!resolved && (
                <button
                  onClick={() => onResolve(iss.id)}
                  className={`${btnPrimaryCls} flex items-center gap-1.5`}
                >
                  <Check size={15} /> Oznacz jako rozwiązane
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
