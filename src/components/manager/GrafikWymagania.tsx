// @ts-nocheck
// Grafik → "Wymagania obsady": trzy powiązane widoki w jednym miejscu —
// wymagania obsady (wersjonowane miesięcznie), godziny otwarcia lokalu i
// wyjątki (święta, niedziela handlowa). Wyjątek nadpisuje i jedno, i
// drugie, dlatego mieszkają razem, a nie w trzech osobnych zakładkach.
//
// Cała logika "co obowiązuje danego dnia" żyje w utils/grafik.ts — tutaj
// jest wyłącznie UI i zapis. Pełna specyfikacja: docs/GRAFIK.md.
import React, { useState, useMemo } from "react";
import { Plus, Trash2, Copy, CalendarDays, Clock, AlertTriangle } from "lucide-react";
import { api } from "../../api/supabase";
import {
  pageTitleCls,
  sectionCardCls,
  sectionHeaderCls,
  btnPrimaryCls,
  btnSecondaryCls,
  statLabelCls,
} from "./designTokens";
import { trimTime, parseDays, findRuleSetForDate } from "../../utils/grafik";

// Kolejność wyświetlania — tydzień po polsku zaczyna się od poniedziałku,
// ale same indeksy to zwykłe JS Date.getDay() (0=niedziela), tak samo jak
// w tasks.days_of_week. Nie wprowadzamy własnego mapowania.
const DNI = [
  { idx: 1, label: "Pon" },
  { idx: 2, label: "Wt" },
  { idx: 3, label: "Śr" },
  { idx: 4, label: "Czw" },
  { idx: 5, label: "Pt" },
  { idx: 6, label: "Sob" },
  { idx: 0, label: "Nd" },
];

// Safari i Firefox NIE obsługują <input type="month"> — degradują je do
// zwykłego pola tekstowego, więc kierownik wpisywał tam "Wrzesień" i do
// bazy szło "Wrzesień-01" (invalid input syntax for type date). Dlatego
// miesiąc i rok wybiera się dwoma zwykłymi <select>. Ta sama ostrożność
// dotyczy każdego przyszłego pola daty w tym module — type="date" i
// type="time" są bezpieczne, type="month" nie.
const MIESIACE = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

const monthLabel = (ymd) => {
  if (!ymd) return "";
  const d = new Date(ymd + "T00:00:00");
  return d.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
};

const daysLabel = (raw) => {
  const days = parseDays(raw);
  if (!days || days.length === 7) return "Codziennie";
  return DNI.filter((d) => days.includes(d.idx))
    .map((d) => d.label)
    .join(", ");
};

const emptyRuleForm = () => ({
  stanowisko: "",
  days: [1, 2, 3, 4, 5, 6, 0],
  start_time: "",
  end_time: "",
  required_count: 1,
});

export default function GrafikWymagania({
  lokal,
  activeStanowiska,
  staffingRules,
  setStaffingRules,
  staffingRuleSets,
  setStaffingRuleSets,
  lokaleGodziny,
  setLokaleGodziny,
  grafikWyjatki,
  setGrafikWyjatki,
  currentUser,
  showMsg,
}) {
  const [view, setView] = useState("wymagania"); // wymagania | godziny | wyjatki
  const [selectedSetId, setSelectedSetId] = useState(null);
  const nextMonth = new Date();
  nextMonth.setDate(1);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const [newSetYear, setNewSetYear] = useState(nextMonth.getFullYear());
  const [newSetMonthNum, setNewSetMonthNum] = useState(nextMonth.getMonth());
  const [ruleForm, setRuleForm] = useState(emptyRuleForm());
  const [saving, setSaving] = useState(false);
  const [godzinyDraft, setGodzinyDraft] = useState(null);
  const [wyjatekForm, setWyjatekForm] = useState(null);
  const [openWyjatekId, setOpenWyjatekId] = useState(null);
  const [wyjatekRuleForm, setWyjatekRuleForm] = useState(emptyRuleForm());

  const todayStr = new Date().toISOString().slice(0, 10);

  const setsForLokal = useMemo(
    () =>
      (staffingRuleSets || [])
        .filter((s) => s.lokal === lokal)
        .sort((a, b) => (a.obowiazuje_od < b.obowiazuje_od ? 1 : -1)),
    [staffingRuleSets, lokal]
  );

  // Domyślnie pokazujemy zestaw obowiązujący dziś, a nie po prostu
  // najnowszy — kierownik może mieć przygotowany zestaw na przyszły
  // miesiąc, który jeszcze nie działa.
  const effectiveSet = findRuleSetForDate(staffingRuleSets, lokal, todayStr);
  const activeSet =
    setsForLokal.find((s) => s.id === selectedSetId) || effectiveSet || setsForLokal[0] || null;

  const rulesOfSet = (staffingRules || [])
    .filter((r) => activeSet && r.set_id === activeSet.id)
    .sort((a, b) =>
      a.stanowisko === b.stanowisko
        ? trimTime(a.start_time).localeCompare(trimTime(b.start_time))
        : a.stanowisko.localeCompare(b.stanowisko, "pl")
    );

  const stanowiskaLokalu = (activeStanowiska || []).filter((s) => s.lokal_name === lokal);
  const wyjatkiLokalu = (grafikWyjatki || [])
    .filter((w) => w.lokal === lokal)
    .sort((a, b) => (a.date_from < b.date_from ? 1 : -1));

  // --- ZESTAWY ---------------------------------------------------------
  const handleCreateSet = async (copyFrom) => {
    const obowiazuje_od = `${newSetYear}-${String(newSetMonthNum + 1).padStart(2, "0")}-01`;
    if (!/^\d{4}-\d{2}-01$/.test(obowiazuje_od)) {
      showMsg("Wybierz miesiąc, od którego zestaw ma obowiązywać.", "error");
      return;
    }
    if (setsForLokal.some((s) => s.obowiazuje_od === obowiazuje_od)) {
      showMsg("Zestaw na ten miesiąc już istnieje.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post("staffing_rule_sets", {
        lokal,
        obowiazuje_od,
        created_by: currentUser?.name || null,
      });
      let newRules = [];
      if (copyFrom) {
        const source = (staffingRules || []).filter((r) => r.set_id === copyFrom.id);
        for (const r of source) {
          const copy = await api.post("staffing_rules", {
            set_id: created.id,
            stanowisko: r.stanowisko,
            days_of_week: r.days_of_week,
            start_time: r.start_time,
            end_time: r.end_time,
            required_count: r.required_count,
          });
          newRules.push(copy);
        }
      }
      setStaffingRuleSets([...(staffingRuleSets || []), created]);
      if (newRules.length > 0) setStaffingRules([...(staffingRules || []), ...newRules]);
      setSelectedSetId(created.id);
      showMsg(
        copyFrom
          ? `Utworzono zestaw i skopiowano ${newRules.length} wymagań.`
          : "Utworzono nowy zestaw wymagań."
      );
    } catch (err) {
      showMsg(`Błąd zapisu zestawu: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  // --- WYMAGANIA -------------------------------------------------------
  const submitRule = async (e, { wyjatekId }) => {
    e.preventDefault();
    const form = wyjatekId ? wyjatekRuleForm : ruleForm;
    if (!form.stanowisko || !form.start_time || !form.end_time) {
      showMsg("Uzupełnij stanowisko i godziny.", "error");
      return;
    }
    if (!wyjatekId && form.days.length === 0) {
      showMsg("Zaznacz przynajmniej jeden dzień tygodnia.", "error");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post("staffing_rules", {
        set_id: wyjatekId ? null : activeSet.id,
        wyjatek_id: wyjatekId || null,
        stanowisko: form.stanowisko,
        // Wyjątek dotyczy konkretnych dat, więc dni tygodnia go nie dotyczą.
        days_of_week: wyjatekId ? null : form.days.join(","),
        start_time: form.start_time,
        end_time: form.end_time,
        required_count: Number(form.required_count) || 1,
      });
      setStaffingRules([...(staffingRules || []), created]);
      if (wyjatekId) setWyjatekRuleForm(emptyRuleForm());
      else setRuleForm({ ...emptyRuleForm(), stanowisko: form.stanowisko });
      showMsg("Dodano wymaganie.");
    } catch (err) {
      showMsg(`Błąd zapisu wymagania: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  const deleteRule = async (rule) => {
    if (!window.confirm("Usunąć to wymaganie?")) return;
    try {
      await api.delete("staffing_rules", rule.id);
      setStaffingRules((staffingRules || []).filter((r) => r.id !== rule.id));
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // --- GODZINY OTWARCIA ------------------------------------------------
  const godzinyRows =
    godzinyDraft ||
    DNI.map((d) => {
      const row = (lokaleGodziny || []).find(
        (g) => g.lokal === lokal && g.day_of_week === d.idx
      );
      return {
        day_of_week: d.idx,
        id: row?.id || null,
        open_time: trimTime(row?.open_time) || "",
        close_time: trimTime(row?.close_time) || "",
        zamkniete: !!row?.zamkniete,
      };
    });

  const updateGodzinyRow = (idx, patch) =>
    setGodzinyDraft(
      godzinyRows.map((r) => (r.day_of_week === idx ? { ...r, ...patch } : r))
    );

  const saveGodziny = async () => {
    setSaving(true);
    try {
      const saved = [];
      for (const row of godzinyRows) {
        const payload = {
          lokal,
          day_of_week: row.day_of_week,
          // Puste "" Postgres odrzuca dla kolumny time — ta sama pułapka co
          // przy polach date w karcie pracownika (błąd #9 w CLAUDE.md).
          open_time: row.zamkniete || !row.open_time ? null : row.open_time,
          close_time: row.zamkniete || !row.close_time ? null : row.close_time,
          zamkniete: row.zamkniete,
        };
        const res = row.id
          ? await api.patch("lokale_godziny", row.id, payload)
          : await api.post("lokale_godziny", payload);
        saved.push(res);
      }
      setLokaleGodziny([
        ...(lokaleGodziny || []).filter((g) => g.lokal !== lokal),
        ...saved,
      ]);
      setGodzinyDraft(null);
      showMsg("Zapisano godziny otwarcia.");
    } catch (err) {
      showMsg(`Błąd zapisu godzin: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  // --- WYJĄTKI ---------------------------------------------------------
  const saveWyjatek = async (e) => {
    e.preventDefault();
    if (!wyjatekForm.date_from || !wyjatekForm.date_to) {
      showMsg("Podaj zakres dat wyjątku.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        lokal,
        date_from: wyjatekForm.date_from,
        date_to: wyjatekForm.date_to,
        zamkniete: !!wyjatekForm.zamkniete,
        open_time: wyjatekForm.zamkniete || !wyjatekForm.open_time ? null : wyjatekForm.open_time,
        close_time: wyjatekForm.zamkniete || !wyjatekForm.close_time ? null : wyjatekForm.close_time,
        note: wyjatekForm.note || null,
        created_by: currentUser?.name || null,
      };
      const created = wyjatekForm.id
        ? await api.patch("grafik_wyjatki", wyjatekForm.id, payload)
        : await api.post("grafik_wyjatki", payload);
      setGrafikWyjatki([
        ...(grafikWyjatki || []).filter((w) => w.id !== created.id),
        created,
      ]);
      setWyjatekForm(null);
      showMsg("Zapisano wyjątek.");
    } catch (err) {
      showMsg(`Błąd zapisu wyjątku: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  const deleteWyjatek = async (w) => {
    if (!window.confirm("Usunąć ten wyjątek razem z jego wymaganiami?")) return;
    try {
      const own = (staffingRules || []).filter((r) => r.wyjatek_id === w.id);
      for (const r of own) await api.delete("staffing_rules", r.id);
      await api.delete("grafik_wyjatki", w.id);
      setStaffingRules((staffingRules || []).filter((r) => r.wyjatek_id !== w.id));
      setGrafikWyjatki((grafikWyjatki || []).filter((x) => x.id !== w.id));
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // --- RENDER ----------------------------------------------------------
  const renderRuleForm = (form, setForm, wyjatekId) => (
    <form
      onSubmit={(e) => submitRule(e, { wyjatekId })}
      className="p-4 border-t-[2px] border-[#171714] bg-[#F1F1EE] space-y-3"
    >
      <div className="grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className={statLabelCls}>Stanowisko</label>
          <select
            value={form.stanowisko}
            onChange={(e) => setForm({ ...form, stanowisko: e.target.value })}
            className="w-full p-2 border-[2px] border-[#171714] rounded bg-white"
            required
          >
            <option value="">-- wybierz --</option>
            {stanowiskaLokalu.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={statLabelCls}>Od</label>
          <input
            type="time"
            value={form.start_time}
            onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            className="w-full p-2 border-[2px] border-[#171714] rounded"
            required
          />
        </div>
        <div>
          <label className={statLabelCls}>Do</label>
          <input
            type="time"
            value={form.end_time}
            onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            className="w-full p-2 border-[2px] border-[#171714] rounded"
            required
          />
        </div>
      </div>

      {!wyjatekId && (
        <div>
          <label className={statLabelCls}>Dni tygodnia</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  days: form.days.length === 7 ? [] : DNI.map((d) => d.idx),
                })
              }
              className="px-2.5 py-1 rounded border-[2px] border-[#171714] bg-white text-[13px] font-bold"
            >
              Cały tydzień
            </button>
            {DNI.map((d) => {
              const on = form.days.includes(d.idx);
              return (
                <button
                  key={d.idx}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      days: on
                        ? form.days.filter((x) => x !== d.idx)
                        : [...form.days, d.idx],
                    })
                  }
                  className={`px-2.5 py-1 rounded border-[2px] text-[13px] font-bold ${
                    on
                      ? "bg-[#171714] text-white border-[#171714]"
                      : "bg-white text-[#171714] border-[#B7B6AE]"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={statLabelCls}>Ile osób</label>
          <input
            type="number"
            min="1"
            max="20"
            value={form.required_count}
            onChange={(e) => setForm({ ...form, required_count: e.target.value })}
            className="w-24 p-2 border-[2px] border-[#171714] rounded"
            required
          />
        </div>
        <button type="submit" disabled={saving} className={btnPrimaryCls}>
          <Plus size={15} className="inline -mt-0.5 mr-1" /> Dodaj wymaganie
        </button>
        <p className="text-[12px] text-[#6E6E66] flex-1 min-w-[220px]">
          Wymagania się <strong>sumują</strong>: "2 osoby 09:00–21:00" plus
          "1 osoba 14:00–19:00" daje trzy osoby między 14:00 a 19:00.
        </p>
      </div>
    </form>
  );

  const renderRulesTable = (rows, emptyText) => (
    <div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[#6E6E66] text-sm">{emptyText}</p>
      ) : (
        rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-4 py-2.5 border-b-[2px] border-[#E7E7E2] last:border-b-0"
          >
            <span className="font-['Archivo'] font-bold text-[14px] min-w-[150px]">
              {r.stanowisko}
            </span>
            <span className="text-[14px] tabular-nums">
              {trimTime(r.start_time)} – {trimTime(r.end_time)}
            </span>
            <span className="text-[13px] px-2 py-0.5 rounded bg-[#F1F1EE] font-bold">
              {r.required_count} {r.required_count === 1 ? "osoba" : "osób"}
            </span>
            {r.days_of_week != null && (
              <span className="text-[13px] text-[#6E6E66]">{daysLabel(r.days_of_week)}</span>
            )}
            <button
              onClick={() => deleteRule(r)}
              className="ml-auto text-[#DE3A22] hover:opacity-70"
              title="Usuń wymaganie"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={pageTitleCls}>Wymagania obsady</h2>
        <span className="text-[15px] text-[#6E6E66]">· {lokal}</span>
        <div className="ml-auto flex gap-2">
          {[
            { key: "wymagania", label: "Wymagania", Icon: CalendarDays },
            { key: "godziny", label: "Godziny otwarcia", Icon: Clock },
            { key: "wyjatki", label: "Wyjątki", Icon: AlertTriangle },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={view === key ? btnPrimaryCls : btnSecondaryCls}
            >
              <Icon size={15} className="inline -mt-0.5 mr-1" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "wymagania" && (
        <>
          <div className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <span>Zestaw obowiązujący</span>
            </div>
            <div className="p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className={statLabelCls}>Wersja wymagań</label>
                <select
                  value={activeSet?.id || ""}
                  onChange={(e) => setSelectedSetId(e.target.value)}
                  className="p-2 border-[2px] border-[#171714] rounded bg-white min-w-[220px]"
                  disabled={setsForLokal.length === 0}
                >
                  {setsForLokal.length === 0 && <option value="">brak zestawów</option>}
                  {setsForLokal.map((s) => (
                    <option key={s.id} value={s.id}>
                      Od {monthLabel(s.obowiazuje_od)}
                      {s.id === effectiveSet?.id ? " (obowiązuje dziś)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={statLabelCls}>Nowy zestaw od miesiąca</label>
                <div className="flex gap-2">
                  <select
                    value={newSetMonthNum}
                    onChange={(e) => setNewSetMonthNum(Number(e.target.value))}
                    className="p-2 border-[2px] border-[#171714] rounded bg-white"
                  >
                    {MIESIACE.map((m, i) => (
                      <option key={m} value={i}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newSetYear}
                    onChange={(e) => setNewSetYear(Number(e.target.value))}
                    className="p-2 border-[2px] border-[#171714] rounded bg-white"
                  >
                    {[0, 1, 2].map((offset) => {
                      const y = new Date().getFullYear() + offset;
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <button
                onClick={() => handleCreateSet(null)}
                disabled={saving}
                className={btnSecondaryCls}
              >
                <Plus size={15} className="inline -mt-0.5 mr-1" /> Pusty
              </button>
              <button
                onClick={() => handleCreateSet(activeSet)}
                disabled={saving || !activeSet}
                className={btnPrimaryCls}
              >
                <Copy size={15} className="inline -mt-0.5 mr-1" /> Kopiuj bieżący
              </button>
              <p className="text-[12px] text-[#6E6E66] w-full">
                Zestaw obowiązuje od swojego miesiąca aż do pojawienia się
                nowszego — nie trzeba wypełniać każdego miesiąca od nowa.
              </p>
            </div>
          </div>

          <div className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <span>
                Wymagania{activeSet ? ` — od ${monthLabel(activeSet.obowiazuje_od)}` : ""}
              </span>
              <span className="text-[13px] font-normal text-[#6E6E66]">
                {rulesOfSet.length} pozycji
              </span>
            </div>
            {!activeSet ? (
              <p className="px-4 py-6 text-center text-[#6E6E66] text-sm">
                Najpierw utwórz zestaw wymagań dla tego lokalu.
              </p>
            ) : (
              <>
                {renderRulesTable(
                  rulesOfSet,
                  "Brak wymagań w tym zestawie — dodaj pierwsze poniżej."
                )}
                {renderRuleForm(ruleForm, setRuleForm, null)}
              </>
            )}
          </div>
        </>
      )}

      {view === "godziny" && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Godziny otwarcia — {lokal}</span>
          </div>
          <div>
            {godzinyRows.map((row) => {
              const dzien = DNI.find((d) => d.idx === row.day_of_week);
              return (
                <div
                  key={row.day_of_week}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b-[2px] border-[#E7E7E2] last:border-b-0"
                >
                  <span className="font-['Archivo'] font-bold text-[14px] w-12">
                    {dzien?.label}
                  </span>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.zamkniete}
                      onChange={(e) =>
                        updateGodzinyRow(row.day_of_week, { zamkniete: e.target.checked })
                      }
                    />
                    Zamknięte
                  </label>
                  {!row.zamkniete && (
                    <>
                      <input
                        type="time"
                        value={row.open_time}
                        onChange={(e) =>
                          updateGodzinyRow(row.day_of_week, { open_time: e.target.value })
                        }
                        className="p-2 border-[2px] border-[#171714] rounded"
                      />
                      <span className="text-[#6E6E66]">–</span>
                      <input
                        type="time"
                        value={row.close_time}
                        onChange={(e) =>
                          updateGodzinyRow(row.day_of_week, { close_time: e.target.value })
                        }
                        className="p-2 border-[2px] border-[#171714] rounded"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t-[2px] border-[#171714] flex items-center gap-3">
            <button onClick={saveGodziny} disabled={saving} className={btnPrimaryCls}>
              Zapisz godziny
            </button>
            {godzinyDraft && (
              <button onClick={() => setGodzinyDraft(null)} className={btnSecondaryCls}>
                Anuluj zmiany
              </button>
            )}
          </div>
        </div>
      )}

      {view === "wyjatki" && (
        <div className="space-y-4">
          <div className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <span>Wyjątki — święta, niedziela handlowa</span>
              <button
                onClick={() =>
                  setWyjatekForm({
                    date_from: "",
                    date_to: "",
                    zamkniete: false,
                    open_time: "",
                    close_time: "",
                    note: "",
                  })
                }
                className={btnPrimaryCls}
              >
                <Plus size={15} className="inline -mt-0.5 mr-1" /> Dodaj wyjątek
              </button>
            </div>
            <p className="px-4 py-3 text-[12px] text-[#6E6E66] border-b-[2px] border-[#E7E7E2]">
              Wyjątek nadpisuje na wskazane dni <strong>i godziny otwarcia, i
              wymagania obsady</strong>. Jeśli nie dodasz mu własnych wymagań,
              obowiązują zwykłe wymagania miesięczne.
            </p>
            {wyjatkiLokalu.length === 0 ? (
              <p className="px-4 py-6 text-center text-[#6E6E66] text-sm">
                Brak wyjątków.
              </p>
            ) : (
              wyjatkiLokalu.map((w) => {
                const own = (staffingRules || []).filter((r) => r.wyjatek_id === w.id);
                const isOpen = openWyjatekId === w.id;
                return (
                  <div key={w.id} className="border-b-[2px] border-[#E7E7E2] last:border-b-0">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="font-['Archivo'] font-bold text-[14px]">
                        {w.date_from === w.date_to
                          ? w.date_from
                          : `${w.date_from} – ${w.date_to}`}
                      </span>
                      {w.zamkniete ? (
                        <span className="text-[13px] px-2 py-0.5 rounded bg-[#FAEAE6] text-[#8A3A2B] font-bold">
                          Zamknięte
                        </span>
                      ) : (
                        <span className="text-[14px] tabular-nums">
                          {trimTime(w.open_time)} – {trimTime(w.close_time)}
                        </span>
                      )}
                      {w.note && (
                        <span className="text-[13px] text-[#6E6E66]">{w.note}</span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {!w.zamkniete && (
                          <button
                            onClick={() => setOpenWyjatekId(isOpen ? null : w.id)}
                            className="text-[13px] font-bold underline"
                          >
                            Wymagania ({own.length})
                          </button>
                        )}
                        <button
                          onClick={() => setWyjatekForm({ ...w, open_time: trimTime(w.open_time), close_time: trimTime(w.close_time) })}
                          className="text-[13px] font-bold underline"
                        >
                          Edytuj
                        </button>
                        <button
                          onClick={() => deleteWyjatek(w)}
                          className="text-[#DE3A22] hover:opacity-70"
                          title="Usuń wyjątek"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {isOpen && !w.zamkniete && (
                      <div className="bg-white border-t-[2px] border-[#E7E7E2]">
                        {renderRulesTable(
                          own,
                          "Brak własnych wymagań — obowiązują zwykłe wymagania miesięczne."
                        )}
                        {renderRuleForm(wyjatekRuleForm, setWyjatekRuleForm, w.id)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {wyjatekForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <form
                onSubmit={saveWyjatek}
                className="bg-white p-6 rounded-xl border-[2px] border-[#171714] w-full max-w-md space-y-3"
              >
                <h3 className="font-['Archivo'] font-extrabold text-lg">
                  {wyjatekForm.id ? "Edytuj wyjątek" : "Nowy wyjątek"}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={statLabelCls}>Od dnia</label>
                    <input
                      type="date"
                      value={wyjatekForm.date_from}
                      onChange={(e) =>
                        setWyjatekForm({
                          ...wyjatekForm,
                          date_from: e.target.value,
                          date_to: wyjatekForm.date_to || e.target.value,
                        })
                      }
                      className="w-full p-2 border-[2px] border-[#171714] rounded"
                      required
                    />
                  </div>
                  <div>
                    <label className={statLabelCls}>Do dnia</label>
                    <input
                      type="date"
                      value={wyjatekForm.date_to}
                      onChange={(e) =>
                        setWyjatekForm({ ...wyjatekForm, date_to: e.target.value })
                      }
                      className="w-full p-2 border-[2px] border-[#171714] rounded"
                      required
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!wyjatekForm.zamkniete}
                    onChange={(e) =>
                      setWyjatekForm({ ...wyjatekForm, zamkniete: e.target.checked })
                    }
                  />
                  Lokal zamknięty w tych dniach
                </label>
                {!wyjatekForm.zamkniete && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={statLabelCls}>Otwarcie</label>
                      <input
                        type="time"
                        value={wyjatekForm.open_time || ""}
                        onChange={(e) =>
                          setWyjatekForm({ ...wyjatekForm, open_time: e.target.value })
                        }
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
                      />
                    </div>
                    <div>
                      <label className={statLabelCls}>Zamknięcie</label>
                      <input
                        type="time"
                        value={wyjatekForm.close_time || ""}
                        onChange={(e) =>
                          setWyjatekForm({ ...wyjatekForm, close_time: e.target.value })
                        }
                        className="w-full p-2 border-[2px] border-[#171714] rounded"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className={statLabelCls}>Notatka</label>
                  <input
                    type="text"
                    value={wyjatekForm.note || ""}
                    onChange={(e) => setWyjatekForm({ ...wyjatekForm, note: e.target.value })}
                    placeholder="np. Boże Narodzenie, niedziela handlowa"
                    className="w-full p-2 border-[2px] border-[#171714] rounded"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={saving} className={btnPrimaryCls}>
                    Zapisz
                  </button>
                  <button
                    type="button"
                    onClick={() => setWyjatekForm(null)}
                    className={btnSecondaryCls}
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
