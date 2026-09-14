// @ts-nocheck
// Konfiguracja bloków zadań — osobny widok wewnątrz zakładki Zadania, tak samo
// jak Konfiguracja w Grafiku i w Pulsie: codzienna praca i ustawienia nie
// mieszają się na jednym ekranie.
//
// Lokal ustawia bloki RAZ, pod swój proces, i potem zmienia je wyjątkowo —
// dlatego zestaw startowy (BLOKI_STARTOWE w utils/tasks.ts) jest tu
// najważniejszy: otwarcie, HACCP, mycie sprzętu i zamknięcie wyglądają w
// gastronomii wszędzie podobnie, a kwadrans wpisywania per lokal to dokładnie
// ta praca, która rozciąga wdrożenie u klienta.
import React, { useState } from "react";
import { Plus, ArrowLeft, Archive, ChevronUp, ChevronDown, Thermometer } from "lucide-react";
import {
  BLOKI_STARTOWE,
  dodajBlokStartowy,
  zapiszBlok,
  zapiszZadanie,
  archiwizujBlok,
  archiwizujZadanie,
  zadaniaBloku,
  parseStanowiska,
  polaZadania,
  PORY_BLOKU,
  dniBlokuLabel,
} from "../../utils/tasks";
import { TYPY_POLA, slugKlucza, opisNormy } from "../../utils/pola";
import { TYPY_WPISU } from "../../utils/dziennik";
import {
  pageTitleCls,
  btnPrimaryCls,
  btnSecondaryCls,
  lokalTabCls,
  sectionCardCls,
  sectionHeaderCls,
} from "./designTokens";

const DNI = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
const WSZYSTKIE_DNI = [0, 1, 2, 3, 4, 5, 6];
const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

const pustyBlok = (lokal) => ({
  lokal,
  nazwa: "",
  opis: "",
  schedule_type: "ogolne",
  cycle_days: 3,
  days_of_week: [...WSZYSTKIE_DNI],
  stanowiska: [],
  deadline_time: "",
  for_manager: false,
});

const pusteZadanie = (blok) => ({
  lokal: blok.lokal,
  block_id: blok.id,
  title: "",
  description: "",
  priority: "sredni",
  deadline_time: "",
  cycle_days: "",
  typ: "temperatura",
  template_key: "",
  pomiarTryb: "brak", // brak | szablon | wlasne
  pola: [{ label: "", typ: "number", jednostka: "", min: "", max: "" }],
  for_manager: !!blok.for_manager,
});

export default function ZadaniaKonfiguracja({
  tasks,
  setTasks,
  taskBlocks,
  setTaskBlocks,
  dayLogTemplates,
  availableLokale,
  activeStanowiska,
  defaultLokal,
  showMsg,
  onWroc,
}) {
  const lokaleNames = (availableLokale || []).map((l) => l.name);
  const [lokal, setLokal] = useState(defaultLokal || lokaleNames[0] || "");
  const [blokForm, setBlokForm] = useState(null);
  const [zadanieForm, setZadanieForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const bloki = (taskBlocks || [])
    .filter((b) => b.lokal === lokal && !b.archived)
    .sort(
      (a, b) =>
        (a.kolejnosc || 0) - (b.kolejnosc || 0) ||
        String(a.nazwa).localeCompare(String(b.nazwa), "pl")
    );

  const stanowiskaLokalu = (activeStanowiska || []).filter((s) => s.lokal_name === lokal);
  const szablonyLokalu = (dayLogTemplates || []).filter(
    (s) => s.lokal === lokal && !s.archived
  );

  const brakujaceStartowe = BLOKI_STARTOWE.filter(
    (w) => !bloki.some((b) => b.nazwa === w.nazwa)
  );

  // Zadania bez bloku — siatka bezpieczeństwa. Po migracji 0019 ma tu być pusto;
  // gdy nie jest, kierownik widzi to wprost, zamiast gubić zadanie po cichu.
  const bezBloku = (tasks || []).filter(
    (t) =>
      t.lokal === lokal &&
      !t.archived &&
      !(taskBlocks || []).some((b) => String(b.id) === String(t.block_id))
  );

  const odswiezBloki = (nowy) =>
    setTaskBlocks((prev) => {
      const lista = prev || [];
      return lista.some((b) => b.id === nowy.id)
        ? lista.map((b) => (b.id === nowy.id ? nowy : b))
        : [...lista, nowy];
    });

  const odswiezZadanie = (nowe) =>
    setTasks((prev) => {
      const lista = prev || [];
      return lista.some((t) => t.id === nowe.id)
        ? lista.map((t) => (t.id === nowe.id ? nowe : t))
        : [...lista, nowe];
    });

  const dodajStartowy = async (wzor) => {
    setBusy(true);
    try {
      const { blok, zadania } = await dodajBlokStartowy(wzor, lokal, bloki.length);
      odswiezBloki(blok);
      zadania.forEach(odswiezZadanie);
      showMsg(`Dodano blok „${wzor.nazwa}” (${zadania.length} zadań)`);
    } catch (e) {
      showMsg(e.message || "Błąd zapisu bloku", "error");
    }
    setBusy(false);
  };

  const zapiszBlokForm = async () => {
    if (!blokForm.nazwa.trim()) return showMsg("Podaj nazwę bloku.", "error");
    setBusy(true);
    try {
      const zapisany = await zapiszBlok({
        ...blokForm,
        kolejnosc: blokForm.kolejnosc ?? bloki.length,
      });
      odswiezBloki(zapisany);
      setBlokForm(null);
      showMsg("Blok zapisany!");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu bloku", "error");
    }
    setBusy(false);
  };

  const zapiszZadanieForm = async () => {
    if (!zadanieForm.title.trim()) return showMsg("Podaj tytuł zadania.", "error");
    const pola =
      zadanieForm.pomiarTryb === "wlasne"
        ? zadanieForm.pola
            .filter((p) => p.label.trim())
            .map((p) => ({
              klucz: p.klucz || slugKlucza(p.label),
              label: p.label.trim(),
              typ: p.typ,
              jednostka: p.jednostka || undefined,
              min: p.min === "" || p.min == null ? undefined : Number(p.min),
              max: p.max === "" || p.max == null ? undefined : Number(p.max),
            }))
        : [];
    if (zadanieForm.pomiarTryb === "wlasne" && !pola.length) {
      return showMsg("Pomiar bez pól — dodaj pole albo wybierz „bez pomiaru”.", "error");
    }
    if (zadanieForm.pomiarTryb === "szablon" && !zadanieForm.template_key) {
      return showMsg("Wybierz pozycję z konfiguracji Pulsu.", "error");
    }
    // Przy pozycji z Pulsu typ wpisu bierzemy z SZABLONU — inaczej ten sam
    // pomiar trafiałby do dziennika raz jako 'temperatura', raz jako to, co
    // akurat zostało w formularzu.
    const szablonWybrany = szablonyLokalu.find((x) => x.klucz === zadanieForm.template_key);
    setBusy(true);
    try {
      const zapisane = await zapiszZadanie({
        ...zadanieForm,
        pola,
        template_key: zadanieForm.pomiarTryb === "szablon" ? zadanieForm.template_key : null,
        typ:
          zadanieForm.pomiarTryb === "brak"
            ? null
            : zadanieForm.pomiarTryb === "szablon"
            ? (szablonWybrany && szablonWybrany.typ) || "inne"
            : zadanieForm.typ,
        kolejnosc:
          zadanieForm.kolejnosc ??
          zadaniaBloku(tasks, { id: zadanieForm.block_id }).length,
      });
      odswiezZadanie(zapisane);
      setZadanieForm(null);
      showMsg("Zadanie zapisane!");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu zadania", "error");
    }
    setBusy(false);
  };

  const archiwizuj = async (blok) => {
    const ile = zadaniaBloku(tasks, blok).length;
    if (
      !window.confirm(
        `Zarchiwizować blok „${blok.nazwa}” i ${ile} zadań w nim? Historia wykonań i zapisane pomiary zostają.`
      )
    )
      return;
    setBusy(true);
    try {
      const { blok: zapisany, zadania } = await archiwizujBlok(blok, tasks);
      odswiezBloki(zapisany);
      setTasks((prev) =>
        (prev || []).map((t) => (zadania.includes(t.id) ? { ...t, archived: true } : t))
      );
    } catch (e) {
      showMsg(e.message || "Błąd archiwizacji", "error");
    }
    setBusy(false);
  };

  const archiwizujPozycje = async (task) => {
    if (!window.confirm(`Zarchiwizować zadanie „${task.title}”?`)) return;
    setBusy(true);
    try {
      const zapisane = await archiwizujZadanie(task);
      odswiezZadanie(zapisane);
    } catch (e) {
      showMsg(e.message || "Błąd archiwizacji", "error");
    }
    setBusy(false);
  };

  const przesunBlok = async (blok, kierunek) => {
    const i = bloki.findIndex((b) => b.id === blok.id);
    const j = i + kierunek;
    if (j < 0 || j >= bloki.length) return;
    setBusy(true);
    try {
      odswiezBloki(await zapiszBlok({ ...bloki[i], kolejnosc: j }));
      odswiezBloki(await zapiszBlok({ ...bloki[j], kolejnosc: i }));
    } catch (e) {
      showMsg(e.message || "Błąd zmiany kolejności", "error");
    }
    setBusy(false);
  };

  const przelaczDzien = (d) =>
    setBlokForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(d)
        ? f.days_of_week.filter((x) => x !== d)
        : [...f.days_of_week, d].sort(),
    }));

  const przelaczStanowisko = (nazwa) =>
    setBlokForm((f) => ({
      ...f,
      stanowiska: f.stanowiska.includes(nazwa)
        ? f.stanowiska.filter((x) => x !== nazwa)
        : [...f.stanowiska, nazwa],
    }));

  const edytujBlok = (b) =>
    setBlokForm({
      ...b,
      opis: b.opis || "",
      // ⚠️ null w days_of_week znaczy CODZIENNIE — do formularza musi wrócić
      // PEŁEN tydzień, inaczej wejście w edycję po cichu odznaczyłoby wszystkie
      // dni, a zapis zawęziłby blok do niczego (ta sama pułapka co w Grafiku).
      days_of_week: b.days_of_week
        ? String(b.days_of_week).split(",").map(Number)
        : [...WSZYSTKIE_DNI],
      stanowiska: parseStanowiska(b) || [],
      deadline_time: b.deadline_time ? b.deadline_time.slice(0, 5) : "",
      cycle_days: b.cycle_days || 3,
    });

  const edytujZadanie = (t, blok) => {
    const pola = polaZadania(t, dayLogTemplates);
    setZadanieForm({
      ...t,
      description: t.description || "",
      deadline_time: t.deadline_time ? t.deadline_time.slice(0, 5) : "",
      cycle_days: t.cycle_days || "",
      template_key: t.template_key || "",
      typ: t.typ || "temperatura",
      pomiarTryb: t.template_key ? "szablon" : pola.length ? "wlasne" : "brak",
      pola: pola.length
        ? pola.map((p) => ({
            klucz: p.klucz,
            label: p.label,
            typ: p.typ,
            jednostka: p.jednostka || "",
            min: p.min ?? "",
            max: p.max ?? "",
          }))
        : pusteZadanie(blok).pola,
      for_manager: !!blok.for_manager,
    });
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnSecondaryCls} onClick={onWroc}>
          <ArrowLeft size={15} className="inline -mt-0.5 mr-1" />
          Checklisty
        </button>
        <h2 className={pageTitleCls}>Bloki zadań — konfiguracja</h2>
      </div>

      {lokaleNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lokaleNames.map((n) => (
            <button key={n} className={lokalTabCls(n === lokal)} onClick={() => setLokal(n)}>
              {n}
            </button>
          ))}
        </div>
      )}

      {brakujaceStartowe.length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Szybki start</span>
            <span className="text-[12px] font-normal text-[#6E6E66]">
              gotowe bloki — kliknij, żeby dodać razem z zadaniami
            </span>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {brakujaceStartowe.map((w) => (
              <button
                key={w.nazwa}
                className={btnSecondaryCls}
                disabled={busy}
                onClick={() => dodajStartowy(w)}
              >
                <Plus size={14} className="inline mr-1" />
                {w.nazwa}
                <span className="text-[11px] text-[#8F8E86] ml-1">
                  ({w.zadania.length})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {bezBloku.length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>Zadania bez bloku</div>
          <div className="p-4 text-[14px] text-[#6E6E66]">
            {bezBloku.length} zadań nie należy do żadnego bloku — pokazują się
            codziennie. Przypisz je do bloku albo zarchiwizuj.
            <div className="mt-2 flex flex-wrap gap-2">
              {bezBloku.map((t) => (
                <span
                  key={t.id}
                  className="text-[13px] border-[2px] border-[#B7B6AE] rounded px-2 py-1"
                >
                  {t.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button className={btnPrimaryCls} onClick={() => setBlokForm(pustyBlok(lokal))}>
          <Plus size={14} className="inline mr-1" />
          Nowy blok
        </button>
      </div>

      {blokForm && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            {blokForm.id ? "Edytuj blok" : "Nowy blok"}
          </div>
          <div className="p-4 grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>Nazwa bloku</label>
              <input
                className={inputCls}
                value={blokForm.nazwa}
                onChange={(e) => setBlokForm({ ...blokForm, nazwa: e.target.value })}
                placeholder="np. Otwarcie lokalu"
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Opis (opcjonalnie)</label>
              <input
                className={inputCls}
                value={blokForm.opis}
                onChange={(e) => setBlokForm({ ...blokForm, opis: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Pora</label>
              <select
                className={inputCls}
                value={blokForm.schedule_type}
                onChange={(e) =>
                  setBlokForm({ ...blokForm, schedule_type: e.target.value })
                }
              >
                {PORY_BLOKU.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            {blokForm.schedule_type === "cykliczne" && (
              <div>
                <label className={labelCls}>Co ile dni</label>
                <input
                  type="number"
                  min="1"
                  className={inputCls}
                  value={blokForm.cycle_days}
                  onChange={(e) =>
                    setBlokForm({ ...blokForm, cycle_days: e.target.value })
                  }
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Termin (opcjonalnie)</label>
              <input
                type="time"
                className={inputCls}
                value={blokForm.deadline_time}
                onChange={(e) =>
                  setBlokForm({ ...blokForm, deadline_time: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Dni tygodnia</label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={lokalTabCls(blokForm.days_of_week.length === 7)}
                  onClick={() =>
                    setBlokForm({
                      ...blokForm,
                      days_of_week:
                        blokForm.days_of_week.length === 7 ? [] : [...WSZYSTKIE_DNI],
                    })
                  }
                >
                  Cały tydzień
                </button>
                {DNI.map((d, i) => (
                  <button
                    key={d}
                    className={lokalTabCls(blokForm.days_of_week.includes(i))}
                    onClick={() => przelaczDzien(i)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Dla kogo (puste = wszyscy na zmianie)</label>
              <div className="flex flex-wrap gap-2">
                {stanowiskaLokalu.map((s) => (
                  <button
                    key={s.id}
                    className={lokalTabCls(blokForm.stanowiska.includes(s.name))}
                    onClick={() => przelaczStanowisko(s.name)}
                  >
                    {s.name}
                  </button>
                ))}
                {!stanowiskaLokalu.length && (
                  <span className="text-[13px] text-[#6E6E66]">
                    Ten lokal nie ma jeszcze stanowisk.
                  </span>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  checked={blokForm.for_manager}
                  onChange={(e) =>
                    setBlokForm({ ...blokForm, for_manager: e.target.checked })
                  }
                />
                Blok kierownika — widoczny tylko w panelu, nie u pracowników
              </label>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button className={btnSecondaryCls} onClick={() => setBlokForm(null)}>
                Anuluj
              </button>
              <button className={btnPrimaryCls} disabled={busy} onClick={zapiszBlokForm}>
                Zapisz blok
              </button>
            </div>
          </div>
        </div>
      )}

      {bloki.map((b, i) => {
        const zadania = zadaniaBloku(tasks, b);
        const stanowiska = parseStanowiska(b);
        const dni = dniBlokuLabel(b);
        return (
          <div key={b.id} className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <span>{b.nazwa}</span>
              <span className="flex items-center gap-1">
                <button
                  className={btnSecondaryCls}
                  disabled={busy || i === 0}
                  onClick={() => przesunBlok(b, -1)}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className={btnSecondaryCls}
                  disabled={busy || i === bloki.length - 1}
                  onClick={() => przesunBlok(b, 1)}
                >
                  <ChevronDown size={14} />
                </button>
                <button className={btnSecondaryCls} onClick={() => edytujBlok(b)}>
                  Edytuj
                </button>
                <button className={btnSecondaryCls} onClick={() => archiwizuj(b)}>
                  <Archive size={14} />
                </button>
              </span>
            </div>
            <div className="px-4 py-2 text-[12px] text-[#6E6E66] flex flex-wrap gap-x-3 gap-y-1 border-b-[2px] border-[#171714]">
              <span className="font-semibold text-[#171714]">
                {(PORY_BLOKU.find((p) => p.key === b.schedule_type) || {}).label}
              </span>
              {b.schedule_type === "cykliczne" && <span>co {b.cycle_days || 1} dni</span>}
              {/* Przy bloku cyklicznym "codziennie" obok "co 3 dni" czytało się
                  jak sprzeczność — dni tygodnia pokazujemy tam tylko, gdy są
                  faktycznie zawężone. */}
              {dni ? (
                <span>tylko {dni}</span>
              ) : b.schedule_type !== "cykliczne" ? (
                <span>codziennie</span>
              ) : null}
              <span>· {stanowiska ? stanowiska.join(", ") : "wszyscy"}</span>
              {b.deadline_time && <span>· do {b.deadline_time.slice(0, 5)}</span>}
              {b.for_manager && <span>· blok kierownika</span>}
              {b.opis && <span className="w-full text-[#8F8E86]">{b.opis}</span>}
            </div>

            {zadania.map((t) => {
              const pola = polaZadania(t, dayLogTemplates);
              return (
                <div
                  key={t.id}
                  className="px-4 py-2.5 border-b-[2px] border-[#171714] last:border-b-0 flex flex-wrap items-start gap-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-['Archivo'] font-bold text-[15px] flex items-center gap-2">
                      {t.title}
                      {pola.length > 0 && <Thermometer size={13} className="text-[#8F8E86]" />}
                    </div>
                    {t.description && (
                      <div className="text-[12.5px] text-[#6E6E66] whitespace-pre-line mt-0.5">
                        {t.description}
                      </div>
                    )}
                    <div className="text-[12px] text-[#8F8E86] mt-0.5 flex flex-wrap gap-x-2">
                      {t.cycle_days && <span>co {t.cycle_days} dni</span>}
                      {t.deadline_time && <span>do {t.deadline_time.slice(0, 5)}</span>}
                      {t.priority === "wysoki" && <span>ważne</span>}
                      {pola.map((p) => (
                        <span key={p.klucz}>
                          {p.label}
                          {opisNormy(p) ? ` (${opisNormy(p)})` : ""}
                        </span>
                      ))}
                      {t.template_key && <span>· pozycja dziennika: {t.template_key}</span>}
                    </div>
                  </div>
                  <button className={btnSecondaryCls} onClick={() => edytujZadanie(t, b)}>
                    Edytuj
                  </button>
                  <button className={btnSecondaryCls} onClick={() => archiwizujPozycje(t)}>
                    <Archive size={14} />
                  </button>
                </div>
              );
            })}

            {!zadania.length && (
              <div className="px-4 py-3 text-[13px] text-[#6E6E66]">
                Blok jest pusty — dodaj pierwsze zadanie.
              </div>
            )}

            <div className="p-3">
              <button
                className={btnSecondaryCls}
                onClick={() => setZadanieForm(pusteZadanie(b))}
              >
                <Plus size={14} className="inline mr-1" />
                Dodaj zadanie
              </button>
            </div>
          </div>
        );
      })}

      {zadanieForm && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[560px] my-8">
            <div className={sectionHeaderCls}>
              {zadanieForm.id ? "Edytuj zadanie" : "Nowe zadanie"}
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className={labelCls}>Tytuł</label>
                <input
                  className={inputCls}
                  value={zadanieForm.title}
                  onChange={(e) =>
                    setZadanieForm({ ...zadanieForm, title: e.target.value })
                  }
                  placeholder="np. Temperatura lodówki kuchennej"
                />
              </div>
              <div>
                <label className={labelCls}>Opis / procedura (opcjonalnie)</label>
                <textarea
                  className={`${inputCls} h-24`}
                  value={zadanieForm.description}
                  onChange={(e) =>
                    setZadanieForm({ ...zadanieForm, description: e.target.value })
                  }
                  placeholder="Jak to zrobić — pracownik zobaczy ten tekst pod zadaniem."
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Priorytet</label>
                  <select
                    className={inputCls}
                    value={zadanieForm.priority}
                    onChange={(e) =>
                      setZadanieForm({ ...zadanieForm, priority: e.target.value })
                    }
                  >
                    <option value="niski">Niski</option>
                    <option value="sredni">Średni</option>
                    <option value="wysoki">Wysoki</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Termin</label>
                  <input
                    type="time"
                    className={inputCls}
                    value={zadanieForm.deadline_time}
                    onChange={(e) =>
                      setZadanieForm({ ...zadanieForm, deadline_time: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={labelCls}>Co ile dni</label>
                  <input
                    type="number"
                    min="1"
                    className={inputCls}
                    value={zadanieForm.cycle_days}
                    onChange={(e) =>
                      setZadanieForm({ ...zadanieForm, cycle_days: e.target.value })
                    }
                    placeholder="co dzień"
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Co zapisujemy przy wykonaniu</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[
                    { key: "brak", label: "Bez pomiaru" },
                    { key: "szablon", label: "Pozycja z Pulsu" },
                    { key: "wlasne", label: "Własne pola" },
                  ].map((o) => (
                    <button
                      key={o.key}
                      className={lokalTabCls(zadanieForm.pomiarTryb === o.key)}
                      onClick={() =>
                        setZadanieForm({ ...zadanieForm, pomiarTryb: o.key })
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {zadanieForm.pomiarTryb === "szablon" && (
                  <>
                    <select
                      className={inputCls}
                      value={zadanieForm.template_key}
                      onChange={(e) =>
                        setZadanieForm({ ...zadanieForm, template_key: e.target.value })
                      }
                    >
                      <option value="">— wybierz pozycję —</option>
                      {szablonyLokalu.map((s) => (
                        <option key={s.klucz} value={s.klucz}>
                          {s.nazwa}
                        </option>
                      ))}
                    </select>
                    <p className="text-[12px] text-[#6E6E66] mt-1">
                      Wpisana tu wartość zamyka tę pozycję na karcie dnia — nikt nie
                      będzie jej mierzył drugi raz przy zamknięciu.
                    </p>
                    {!szablonyLokalu.length && (
                      <p className="text-[12px] text-[#6E6E66] mt-1">
                        Ten lokal nie ma jeszcze pozycji dziennika (Puls → Konfiguracja).
                      </p>
                    )}
                  </>
                )}

                {zadanieForm.pomiarTryb === "wlasne" && (
                  <div className="flex flex-col gap-2">
                    <select
                      className={inputCls}
                      value={zadanieForm.typ}
                      onChange={(e) =>
                        setZadanieForm({ ...zadanieForm, typ: e.target.value })
                      }
                    >
                      {TYPY_WPISU.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {zadanieForm.pola.map((p, idx) => (
                      <div key={idx} className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <input
                          className={inputCls}
                          placeholder="Nazwa pola"
                          value={p.label}
                          onChange={(e) => {
                            const pola = [...zadanieForm.pola];
                            pola[idx] = { ...p, label: e.target.value };
                            setZadanieForm({ ...zadanieForm, pola });
                          }}
                        />
                        <select
                          className={inputCls}
                          value={p.typ}
                          onChange={(e) => {
                            const pola = [...zadanieForm.pola];
                            pola[idx] = { ...p, typ: e.target.value };
                            setZadanieForm({ ...zadanieForm, pola });
                          }}
                        >
                          {TYPY_POLA.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className={inputCls}
                          placeholder="jedn."
                          value={p.jednostka}
                          onChange={(e) => {
                            const pola = [...zadanieForm.pola];
                            pola[idx] = { ...p, jednostka: e.target.value };
                            setZadanieForm({ ...zadanieForm, pola });
                          }}
                        />
                        <input
                          className={inputCls}
                          placeholder="min"
                          type="number"
                          disabled={p.typ !== "number"}
                          value={p.min}
                          onChange={(e) => {
                            const pola = [...zadanieForm.pola];
                            pola[idx] = { ...p, min: e.target.value };
                            setZadanieForm({ ...zadanieForm, pola });
                          }}
                        />
                        <input
                          className={inputCls}
                          placeholder="max"
                          type="number"
                          disabled={p.typ !== "number"}
                          value={p.max}
                          onChange={(e) => {
                            const pola = [...zadanieForm.pola];
                            pola[idx] = { ...p, max: e.target.value };
                            setZadanieForm({ ...zadanieForm, pola });
                          }}
                        />
                      </div>
                    ))}
                    <button
                      className={btnSecondaryCls}
                      onClick={() =>
                        setZadanieForm({
                          ...zadanieForm,
                          pola: [
                            ...zadanieForm.pola,
                            { label: "", typ: "number", jednostka: "", min: "", max: "" },
                          ],
                        })
                      }
                    >
                      <Plus size={14} className="inline mr-1" />
                      Dodaj pole
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button className={btnSecondaryCls} onClick={() => setZadanieForm(null)}>
                  Anuluj
                </button>
                <button className={btnPrimaryCls} disabled={busy} onClick={zapiszZadanieForm}>
                  Zapisz zadanie
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
