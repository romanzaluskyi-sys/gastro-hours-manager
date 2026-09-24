// @ts-nocheck
// Kolejka decyzji kierownika dla issues.type === "correction" (poprawka
// godzin / "zapomniałem odbić" zgłoszone przez pracownika w Zgłoś). Biржа
// zmian z Grafiku — świadomie poza zakresem, patrz plan realizacji.
import React, { useRef, useState } from "react";
import {
  Check,
  Edit2,
  HelpCircle,
  AlertCircle,
  X,
  Palmtree,
  ArrowLeftRight,
  Clock,
  Hourglass,
  UserPlus,
} from "lucide-react";
import { resolveCorrection, askAboutCorrection } from "../../utils/corrections";
import { countWorkdays, URLOP_HOURS_PER_DAY } from "../../utils/absences";
import { trimTime, shiftHours, toLocalYMD } from "../../utils/grafik";
import { monthPlanHours, typWymiany, wzajemnaZmiana } from "../../utils/swaps";
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

// Podpowiedź godziny zakończenia dla zmiany bez odbitego końca: to, co stało
// w grafiku. Gdy grafiku nie było, pole zostaje PUSTE — podstawiona "teraz"
// albo "start + 8 h" wyglądałaby jak liczba, którą ktoś sprawdził.
const domyslnyKoniec = (poz) => (poz.koniecPlanu ? fmtHHMM(poz.koniecPlanu) : "");

// Jak dawno minął próg — po to, żeby pozycja sprzed trzech dni wyglądała
// inaczej niż ta sprzed godziny.
const odKiedyCzeka = (prog, teraz = new Date()) => {
  const godz = Math.floor((teraz - prog) / 3600000);
  if (godz < 1) return "przed chwilą";
  if (godz < 24) return `${godz} godz. temu`;
  const dni = Math.floor(godz / 24);
  return dni === 1 ? "wczoraj" : `${dni} dni temu`;
};

import { zmianyBezOdbicia, rozliczBrakOdbicia } from "../../utils/odbicia";
import { zmianyPorzucone, rozliczPorzucona } from "../../utils/porzucone";
import { czekaNaKoniecOdKierownika } from "../../utils/wpisy";
import {
  probniDoDecyzji,
  zatwierdzProbnego,
  odrzucProbnego,
  godzinyProbnego,
} from "../../utils/probni";

export default function ZatwierdzanieZmian({
  currentUser,
  shifts,
  setShifts,
  users = [],
  setUsers,
  lokale = [],
  absences = [],
  onOpenEmployee,
  setPlanShifts,
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
  // ⚠️ Zamek na REF, nie na stanie. Wszystkie decyzje na tej stronie pilnował
  // dotąd zwykły `useState` ("busy id"), a stan Reacta aktualizuje się
  // asynchronicznie: dwa wywołania w tym samym takcie widzą to samo `null` i
  // oba przechodzą dalej. 08.09.2026 jedno kliknięcie "Dopisz godziny" dało
  // przez to dwa wiersze godzin oddalone o 3,7 ms — czyli Dawidowi 20 h
  // zamiast 10. Ref zmienia się od razu, więc drugie wejście odpada.
  //
  // To jest zamek na czas jednego zapisu, a nie zabezpieczenie przed
  // duplikatem w ogóle — tym jest pytanie do bazy tuż przed zapisem
  // (znajdzKolizjeWBazie w utils/odbicia.ts i utils/corrections.ts).
  const wTrakcie = useRef(new Set());
  const zajmij = (klucz) => {
    if (wTrakcie.current.has(klucz)) return false;
    wTrakcie.current.add(klucz);
    return true;
  };
  const zwolnij = (klucz) => wTrakcie.current.delete(klucz);

  const [selected, setSelected] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [absenceBusyId, setAbsenceBusyId] = useState(null);
  const [swapBusyId, setSwapBusyId] = useState(null);
  const [odbicieBusyId, setOdbicieBusyId] = useState(null);
  // Poprawione godziny dla pozycji "był w grafiku, nie odbił" — trzymamy je
  // per pozycja, bo kierownik potrafi poprawiać kilka naraz.
  const [odbicieGodziny, setOdbicieGodziny] = useState({});

  const [porzuconeBusyId, setPorzuconeBusyId] = useState(null);
  // Godzina zakończenia wpisywana per pozycja — kierownik potrafi rozliczać
  // kilka naraz, tak samo jak przy brakach odbicia.
  const [porzuconeGodziny, setPorzuconeGodziny] = useState({});
  const [probnyBusyId, setProbnyBusyId] = useState(null);

  const brakiOdbicia = zmianyBezOdbicia({
    planShifts,
    shifts,
    users,
    absences,
    lokalOk: hasAccessToLokal,
  });

  // Zmiana, o której koniec pracownik już poprosił (wpis poza oknem
  // tolerancji lokalu), stoi w kolejce korekt z konkretną godziną. Druga
  // pozycja o tę samą zmianę tutaj kazałaby rozstrzygać ją dwa razy.
  const porzucone = zmianyPorzucone({
    shifts,
    planShifts,
    lokale,
    users,
    lokalOk: hasAccessToLokal,
  }).filter((poz) => !czekaNaKoniecOdKierownika(poz.shift, issues));

  const probni = probniDoDecyzji({ users, lokalOk: hasAccessToLokal });

  const rozliczZmiane = async (poz, decyzja) => {
    if (!zajmij(`porzucona:${poz.shift.id}`)) return;
    setPorzuconeBusyId(poz.shift.id);
    try {
      await rozliczPorzucona({
        shift: poz.shift,
        decyzja,
        end: porzuconeGodziny[poz.shift.id] ?? domyslnyKoniec(poz),
        kto: currentUser.name,
        shifts,
        setShifts,
      });
      showMsg(
        decyzja === "zapisano" ? "Godziny zapisane" : "Zmiana odrzucona — bez godzin"
      );
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
    zwolnij(`porzucona:${poz.shift.id}`);
    setPorzuconeBusyId(null);
  };

  const decyzjaOProbnym = async (user, decyzja) => {
    if (!zajmij(`probny:${user.id}`)) return;
    setProbnyBusyId(user.id);
    try {
      const zapisany =
        decyzja === "zatwierdzony"
          ? await zatwierdzProbnego(user)
          : await odrzucProbnego(user);
      setUsers((prev) => prev.map((u) => (u.id === zapisany.id ? zapisany : u)));
      showMsg(
        decyzja === "zatwierdzony"
          ? `${user.name} jest już zwykłym pracownikiem — uzupełnij kartę.`
          : `${user.name} odrzucony(-a). Konto poszło do archiwum, godziny zostają.`
      );
    } catch (e) {
      showMsg(`Błąd zapisu: ${e.message || "nieznany błąd"}`, "error");
    }
    zwolnij(`probny:${user.id}`);
    setProbnyBusyId(null);
  };

  const rozliczOdbicie = async (poz, decyzja) => {
    if (!zajmij(`odbicie:${poz.plan.id}`)) return;
    setOdbicieBusyId(poz.plan.id);
    try {
      const g = odbicieGodziny[poz.plan.id] || {};
      await rozliczBrakOdbicia({
        plan: poz.plan,
        user: poz.user,
        decyzja,
        start: g.start,
        end: g.end,
        kto: currentUser.name,
        shifts,
        setShifts,
        planShifts,
        setPlanShifts,
      });
      showMsg(
        decyzja === "zapisano" ? "Zmiana dopisana do godzin" : "Pozycja odrzucona",
        "success"
      );
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
    zwolnij(`odbicie:${poz.plan.id}`);
    setOdbicieBusyId(null);
  };

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
    // shiftEdit bywa pusty, gdy wiersz godzin już istniał i nie tworzyliśmy
    // go drugi raz — patrz znajdzKolizjeWBazie w utils/corrections.ts.
    if (shiftEdit) setShiftEdits((prev) => [...prev, shiftEdit]);
  };

  const handleZatwierdz = async (row) => {
    if (!zajmij(`korekta:${row.issue.id}`)) return;
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
    zwolnij(`korekta:${row.issue.id}`);
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
      // Prośba o sam start (wpis poza oknem tolerancji) nie ma końca — koniec
      // zostaje taki, jaki jest w zmianie, więc od niego zaczynamy.
      end:
        row.issue.proposed_end_time ||
        (row.existingShift && row.existingShift.end_time
          ? fmtHHMM(row.existingShift.end_time)
          : ""),
      reason: "",
    });
  };

  const handleZapiszIZatwierdz = async (row) => {
    if (!editForm.reason.trim()) {
      return showMsg("Podaj powód korekty — pracownik go zobaczy.", "error");
    }
    if (!zajmij(`korekta:${row.issue.id}`)) return;
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
    zwolnij(`korekta:${row.issue.id}`);
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
      {/* Najpierw osoby na próbę: dzień próbny trwa jeden dzień, a decyzja
          spóźniona o tydzień jest tyle samo warta co jej brak. */}
      {probni.length > 0 && (
        <div className="mb-8">
          <h3 className="font-['Archivo'] font-extrabold text-lg mb-3 flex items-center gap-2">
            <UserPlus size={18} /> Pracownicy na próbę · {probni.length}
          </h3>
          <p className="text-[13px] text-[#6E6E66] mb-3 max-w-[70ch]">
            Dodani z Tabletu Służbowego. Odbijają godziny, ale nie ma ich w
            Grafiku i nie mogą się nigdzie zalogować, dopóki nie zdecydujesz.
          </p>
          <div className="space-y-3">
            {probni.map((u) => {
              const godziny = godzinyProbnego(shifts, u);
              const zajety = probnyBusyId === u.id;
              return (
                <div
                  key={u.id}
                  className="bg-white rounded-xl border-[2px] border-[#171714] p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="min-w-[200px]">
                    <div className="font-['Archivo'] font-extrabold text-[16px]">
                      {u.name}
                    </div>
                    <div className="text-[13px] text-[#6E6E66]">
                      {u.default_lokal}
                      {u.default_stanowisko ? ` · ${u.default_stanowisko}` : ""}
                      {u.probny_od ? ` · od ${fmtPLAbs(u.probny_od)}` : ""}
                    </div>
                    {u.probny_przez && (
                      <div className="text-[12px] text-[#8F8E86] mt-0.5">
                        dodany(-a) na tablecie: {u.probny_przez}
                      </div>
                    )}
                  </div>
                  {/* Liczba godzin jest tu najważniejsza: od niej zależy, czy
                      odrzucenie kogokolwiek kosztuje pieniądze. */}
                  <span
                    className={`text-[13px] font-bold px-3 py-1.5 rounded ${
                      godziny > 0
                        ? "bg-[#FAEAE6] text-[#8A3A2B]"
                        : "bg-[#EAEAE5] text-[#4A4A43]"
                    }`}
                  >
                    {godziny > 0
                      ? `${godziny.toFixed(1).replace(".", ",")} godz. odbite`
                      : "bez godzin"}
                  </span>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    {onOpenEmployee && (
                      <button
                        type="button"
                        onClick={() => onOpenEmployee(u.id)}
                        className="px-4 py-2.5 rounded border-[2px] border-[#B7B6AE] font-['Archivo'] font-bold text-sm bg-white"
                      >
                        Otwórz kartę
                      </button>
                    )}
                    <button
                      disabled={zajety}
                      onClick={() => decyzjaOProbnym(u, "odrzucony")}
                      className="px-4 py-2.5 rounded border-[2px] border-[#171714] font-['Archivo'] font-bold text-sm bg-white disabled:opacity-50"
                    >
                      Odrzuć
                    </button>
                    <button
                      disabled={zajety}
                      onClick={() => decyzjaOProbnym(u, "zatwierdzony")}
                      className="px-4 py-2.5 rounded font-['Archivo'] font-bold text-sm bg-[#DE3A22] text-white disabled:opacity-50"
                    >
                      Zatwierdź
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {brakiOdbicia.length > 0 && (
        <div className="mb-8">
          <h3 className="font-['Archivo'] font-extrabold text-lg mb-3 flex items-center gap-2">
            <Clock size={18} /> Był w grafiku, nie odbił · {brakiOdbicia.length}
          </h3>
          <p className="text-[13px] text-[#6E6E66] mb-3 max-w-[70ch]">
            Zwykle to zapomniany tablet, nie nieobecność. Bez decyzji te godziny
            nie trafią ani do raportu, ani na wypłatę.
          </p>
          <div className="space-y-3">
            {brakiOdbicia.map((poz) => {
              const g = odbicieGodziny[poz.plan.id] || {};
              const zajety = odbicieBusyId === poz.plan.id;
              return (
                <div
                  key={poz.plan.id}
                  className="bg-white rounded-xl border-[2px] border-[#171714] p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="min-w-[190px]">
                    <div className="font-['Archivo'] font-extrabold text-[16px]">
                      {poz.user.name}
                    </div>
                    <div className="text-[13px] text-[#6E6E66]">
                      {poz.plan.date.split("-").reverse().join(".")} · {poz.plan.lokal}
                      {poz.plan.stanowisko ? ` · ${poz.plan.stanowisko}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={g.start ?? trimTime(poz.plan.start_time)}
                      onChange={(e) =>
                        setOdbicieGodziny({
                          ...odbicieGodziny,
                          [poz.plan.id]: { ...g, start: e.target.value },
                        })
                      }
                      className="p-2 border-[2px] border-[#171714] rounded"
                    />
                    <span className="text-[#6E6E66]">–</span>
                    <input
                      type="time"
                      value={g.end ?? trimTime(poz.plan.end_time)}
                      onChange={(e) =>
                        setOdbicieGodziny({
                          ...odbicieGodziny,
                          [poz.plan.id]: { ...g, end: e.target.value },
                        })
                      }
                      className="p-2 border-[2px] border-[#171714] rounded"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <button
                      disabled={zajety}
                      onClick={() => rozliczOdbicie(poz, "odrzucono")}
                      className="px-4 py-2.5 rounded border-[2px] border-[#171714] font-['Archivo'] font-bold text-sm bg-white disabled:opacity-50"
                    >
                      Nie było zmiany
                    </button>
                    <button
                      disabled={zajety}
                      onClick={() => rozliczOdbicie(poz, "zapisano")}
                      className="px-4 py-2.5 rounded font-['Archivo'] font-bold text-sm bg-[#DE3A22] text-white disabled:opacity-50"
                    >
                      Dopisz godziny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rodzeństwo sekcji wyżej: tam ktoś nie odbił NICZEGO, tutaj odbił
          start i nie odbił końca. Obie kończą się tą samą decyzją. */}
      {porzucone.length > 0 && (
        <div className="mb-8">
          <h3 className="font-['Archivo'] font-extrabold text-lg mb-3 flex items-center gap-2">
            <Hourglass size={18} /> Zmiany bez zakończenia · {porzucone.length}
          </h3>
          <p className="text-[13px] text-[#6E6E66] mb-3 max-w-[70ch]">
            Ktoś odbił start i wyszedł bez odbicia końca. Godzin nie zgadujemy —
            do czasu Twojej decyzji te zmiany liczą się jako zero godzin.
          </p>
          <div className="space-y-3">
            {porzucone.map((poz) => {
              const zajety = porzuconeBusyId === poz.shift.id;
              const koniec = porzuconeGodziny[poz.shift.id] ?? domyslnyKoniec(poz);
              return (
                <div
                  key={poz.shift.id}
                  className="bg-white rounded-xl border-[2px] border-[#171714] p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="min-w-[190px]">
                    <div className="font-['Archivo'] font-extrabold text-[16px]">
                      {poz.shift.user_name}
                    </div>
                    <div className="text-[13px] text-[#6E6E66]">
                      {fmtPLAbs(toLocalYMD(poz.shift.start_time))} · {poz.shift.lokal}
                      {poz.shift.stanowisko ? ` · ${poz.shift.stanowisko}` : ""}
                    </div>
                    <div className="text-[12px] text-[#8F8E86] mt-0.5">
                      {poz.powod === "grafik"
                        ? `wg grafiku do ${fmtHHMM(poz.koniecPlanu)}, minęło ${poz.tolerancja} godz. tolerancji`
                        : `poza grafikiem, zmiana przekroczyła ${poz.maks} godz.`}{" "}
                      · {odKiedyCzeka(poz.prog)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[#6E6E66]">
                      od <strong>{fmtHHMM(poz.shift.start_time)}</strong> do
                    </span>
                    <input
                      type="time"
                      value={koniec}
                      onChange={(e) =>
                        setPorzuconeGodziny({
                          ...porzuconeGodziny,
                          [poz.shift.id]: e.target.value,
                        })
                      }
                      className="p-2 border-[2px] border-[#171714] rounded"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <button
                      disabled={zajety}
                      onClick={() => rozliczZmiane(poz, "odrzucono")}
                      className="px-4 py-2.5 rounded border-[2px] border-[#171714] font-['Archivo'] font-bold text-sm bg-white disabled:opacity-50"
                    >
                      Nie było zmiany
                    </button>
                    <button
                      disabled={zajety || !koniec}
                      onClick={() => rozliczZmiane(poz, "zapisano")}
                      className="px-4 py-2.5 rounded font-['Archivo'] font-bold text-sm bg-[#DE3A22] text-white disabled:opacity-50"
                    >
                      Zapisz godziny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              const typ = typWymiany(sw);
              const wz = wzajemnaZmiana(sw, planShifts);
              return (
                <div
                  key={sw.id}
                  className="bg-white rounded-xl border-[2px] border-[#171714] p-4 flex items-start justify-between gap-4 flex-wrap"
                >
                  <div>
                    <div className="font-['Archivo'] font-extrabold text-[15px]">
                      {typ === "zamiana"
                        ? `${sw.taker_user_name} i ${sw.author_user_name} zamieniają się zmianami`
                        : `${sw.taker_user_name} przejmuje zmianę od: ${sw.author_user_name}`}
                      {typ === "oddanie" && (
                        <span className="ml-2 text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#F1F1EE] text-[#6E6E66]">
                          oddane wprost
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] text-[#6E6E66] mt-0.5">
                      {ps
                        ? `${fmtPLAbs(ps.date)} · ${trimTime(ps.start_time)}–${trimTime(
                            ps.end_time
                          )} · ${ps.stanowisko} · ${ps.lokal}`
                        : `${fmtPLAbs(sw.date)} · ${sw.lokal} · zmiana już nie istnieje`}
                    </div>
                    {/* Przy zamianie kierownik musi zobaczyć OBIE zmiany —
                        zatwierdza dwa przepisania naraz, a druga strona jest
                        tak samo wiążąca jak pierwsza. */}
                    {typ === "zamiana" && (
                      <div className="text-[14px] text-[#6E6E66] mt-0.5">
                        {wz ? (
                          <>
                            <span className="font-bold">w zamian: </span>
                            {`${fmtPLAbs(wz.date)} · ${trimTime(wz.start_time)}–${trimTime(
                              wz.end_time
                            )} · ${wz.stanowisko} · ${wz.lokal}`}{" "}
                            → {sw.author_user_name}
                          </>
                        ) : (
                          <span className="text-[#DE3A22] font-bold">
                            druga zmiana już nie istnieje — nie da się zatwierdzić
                          </span>
                        )}
                      </div>
                    )}
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
                        // Przy zamianie każda strona i bierze, i oddaje —
                        // pokazanie samej przejmowanej zmiany sugerowałoby
                        // wzrost godzin tam, gdzie realnie prawie nic się nie
                        // zmienia. Zmiana spoza tego miesiąca liczy się zerem.
                        const hw =
                          typ === "zamiana" && wz && wz.date.slice(0, 7) === mies
                            ? shiftHours(wz)
                            : 0;
                        const strony = [
                          {
                            osoba: sw.taker_user_name,
                            teraz: monthPlanHours(
                              planShifts,
                              { id: sw.taker_user_id, name: sw.taker_user_name },
                              mies
                            ),
                            delta: h - hw,
                          },
                          {
                            osoba: sw.author_user_name,
                            teraz: monthPlanHours(
                              planShifts,
                              { id: sw.author_user_id, name: sw.author_user_name },
                              mies
                            ),
                            delta: hw - h,
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
                                    r.delta === 0
                                      ? "text-[#6E6E66]"
                                      : r.delta > 0
                                      ? "text-[#2F7A2A]"
                                      : "text-[#DE3A22]"
                                  }`}
                                >
                                  ({r.delta === 0 ? "bez zmian" : ""}
                                  {r.delta !== 0 && (r.delta > 0 ? "+" : "−")}
                                  {r.delta !== 0
                                    ? `${Math.round(Math.abs(r.delta) * 10) / 10} h`
                                    : ""}
                                  )
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
                      disabled={swapBusyId === sw.id || !ps || (typ === "zamiana" && !wz)}
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
          // Bez proponowanego końca przy ISTNIEJĄCEJ zmianie koniec się nie
          // zmienia (resolveCorrection go zachowuje) — pokazujemy więc ten,
          // który jest, a nie "brak", który wyglądał jak prośba o skasowanie.
          const proposedEnd =
            iss.proposed_end_time ||
            (existingShift && existingShift.end_time
              ? fmtHHMM(existingShift.end_time)
              : "");
          const proposedH =
            iss.proposed_start_time && proposedEnd
              ? (() => {
                  const [sh, sm] = iss.proposed_start_time.split(":").map(Number);
                  const [eh, em] = proposedEnd.split(":").map(Number);
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
                          proposedEnd
                        )}
                      >
                        {proposedEnd || "brak"}
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
                    {/* Zatwierdzić da się także prośbę bez końca, gdy dotyczy
                        istniejącej zmiany — koniec zostaje wtedy nietknięty.
                        "Zapytaj" zostaje dla nowego wpisu bez końca. */}
                    {iss.proposed_end_time || existingShift ? (
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
