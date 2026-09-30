// @ts-nocheck
// Grafik → Konfiguracja. Trzy zakładki: Obsada (wymagania obsady + godziny
// otwarcia), Budżet (GrafikBudzetKonfiguracja.tsx) i Wyjątki (święta, niedziele
// handlowe). Wyjątek nadpisuje godziny otwarcia i obsadę, dlatego mieszkają
// razem.
//
// ⚠️ Układ z makiety właściciela (0.68.0, ScheduleConfigObsada /
// ScheduleConfigExceptions / ScheduleConfigNewException / ScheduleConfigMobile).
// Zmienił się WYGLĄD, zapis jest ten sam co wcześniej — ta sama semantyka:
// wyjątek BEZ własnych wymagań dalej znaczy „obsada jak zwykle” (tak liczy
// `getRulesForDate`), więc „Zacznij od” w nowym wyjątku ma dwa warianty, a nie
// trzy z makiety. Siatka dni × godziny, os·h i „start przed otwarciem” są
// LICZONE z tych samych wymagań i niczego nie zapisują.
//
// Cała logika "co obowiązuje danego dnia" żyje w utils/grafik.ts — tutaj
// jest wyłącznie UI i zapis. Pełna specyfikacja: docs/GRAFIK.md.
import React, { useState, useMemo } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api } from "../../api/supabase";
import { trimTime, parseDays, findRuleSetForDate, toLocalYMD } from "../../utils/grafik";
import { stanowiskoShort, stanowiskoBadgeStyle } from "../../utils/stanowiska";
import { zl } from "../../utils/budzet";
import GrafikBudzetKonfiguracja from "./GrafikBudzetKonfiguracja";
import {
  etykietaCls,
  poleCls,
  notaCls,
  btnObrysCls,
  btnGlownyCls,
  btnUsunCls,
  btnMalyCls,
  ikonaBtnCls,
  dodajCls,
  DNI,
  f1,
  naMinuty,
  dlugoscMin,
  miesiacKrotko,
  dniTekst,
  kafelDaty,
  osobyTekst,
  ileWGodzinie,
  osGodzinDnia,
  Panel,
  PasekWersji,
  Zakladki,
} from "./grafikKonfigWspolne";

// ⚠️ `parseDays` zwraca null przy pustej wartości, a null tu znaczy
// "codziennie", nie "nigdy" (tak też czyta to cała kontrola obsady). Formularz
// trzyma tablicę, więc null musi wrócić jako pełny tydzień — inaczej wejście w
// edycję po cichu odznaczałoby wszystkie dni.
const parseDni = (raw) => parseDays(raw) || DNI.map((d) => d.idx);

const emptyRuleForm = () => ({
  id: null,
  stanowisko: "",
  days: [1, 2, 3, 4, 5, 6, 0],
  start_time: "",
  end_time: "",
  required_count: 1,
});

const MIES_PELNE = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export default function GrafikWymagania({
  lokal,
  lokale,
  users,
  activeStanowiska,
  staffingRules,
  setStaffingRules,
  staffingRuleSets,
  setStaffingRuleSets,
  lokaleGodziny,
  setLokaleGodziny,
  grafikWyjatki,
  setGrafikWyjatki,
  budzetCele,
  setBudzetCele,
  budzetDni,
  setBudzetDni,
  dayLogs,
  currentUser,
  showMsg,
  onZamknij,
}) {
  const [zakladka, setZakladka] = useState("obsada"); // obsada | budzet | wyjatki
  const [selectedSetId, setSelectedSetId] = useState(null);
  // Jeden formularz wymagania na raz: dla którego stanowiska (albo "__nowe")
  // jest otwarty. Który wiersz jest poprawiany, mówi `ruleForm.id`.
  const [ruleForm, setRuleForm] = useState(emptyRuleForm());
  const [formGrupa, setFormGrupa] = useState(null);
  const [saving, setSaving] = useState(false);
  const [godzinyEdycja, setGodzinyEdycja] = useState(false);
  const [godzinyDraft, setGodzinyDraft] = useState(null);
  // Wyjątki: nowy (okno), rozwinięty (edycja w miejscu) i formularz jego obsady.
  const [nowyWyjatek, setNowyWyjatek] = useState(null);
  const [openWyjatekId, setOpenWyjatekId] = useState(null);
  const [wyjatekDraft, setWyjatekDraft] = useState(null);
  const [wyjatekRuleForm, setWyjatekRuleForm] = useState(emptyRuleForm());
  const [wyjatekFormOtwarty, setWyjatekFormOtwarty] = useState(false);
  const [pokazMinione, setPokazMinione] = useState(false);
  const [kalMies, setKalMies] = useState(0);

  const todayStr = toLocalYMD(new Date());

  const setsForLokal = useMemo(
    () =>
      (staffingRuleSets || [])
        .filter((s) => s.lokal === lokal)
        .sort((a, b) => (a.obowiazuje_od < b.obowiazuje_od ? 1 : -1)),
    [staffingRuleSets, lokal]
  );

  // Domyślnie zestaw obowiązujący dziś, a nie najnowszy — kierownik może mieć
  // przygotowany zestaw na przyszły miesiąc, który jeszcze nie działa.
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
    .sort((a, b) => (a.date_from < b.date_from ? -1 : 1));

  // --- ZESTAWY ---------------------------------------------------------
  const zamknijFormularz = () => {
    setRuleForm(emptyRuleForm());
    setFormGrupa(null);
  };

  const handleCreateSet = async (obowiazuje_od, kopiuj) => {
    const copyFrom = kopiuj ? activeSet : null;
    if (!/^\d{4}-\d{2}-01$/.test(obowiazuje_od || "")) {
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
      zamknijFormularz();
      showMsg(copyFrom ? `Utworzono zestaw i skopiowano ${newRules.length} wymagań.` : "Utworzono nowy zestaw wymagań.");
    } catch (err) {
      showMsg(`Błąd zapisu zestawu: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  // ⚠️ Kasowanie zestawu OBOWIĄZUJĄCEGO zmienia to, co widać w siatce już od
  // następnego renderu: dni spadają na zestaw wcześniejszy albo — gdy nie ma
  // żadnego — zostają bez wymagań i kontrola dziur milknie. Dlatego pasek
  // potwierdzenia mówi skutek, zanim ktoś kliknie „Usuń zestaw”.
  const wczesniejszyZestaw = activeSet
    ? setsForLokal
        .filter((x) => x.id !== activeSet.id && x.obowiazuje_od <= todayStr)
        .sort((a, b) => (a.obowiazuje_od < b.obowiazuje_od ? 1 : -1))[0]
    : null;
  const skutekUsunieciaZestawu = !activeSet
    ? ""
    : activeSet.id !== effectiveSet?.id
    ? "Ten zestaw jeszcze nie obowiązuje, więc siatka się nie zmieni."
    : wczesniejszyZestaw
    ? `Od teraz wrócą wymagania z „od ${miesiacKrotko(wczesniejszyZestaw.obowiazuje_od)}”.`
    : "To jedyny obowiązujący zestaw — lokal zostanie BEZ wymagań obsady i kontrola dziur przestanie cokolwiek pokazywać.";

  const handleDeleteSet = async () => {
    if (!activeSet) return;
    const own = (staffingRules || []).filter((r) => r.set_id === activeSet.id);
    setSaving(true);
    try {
      for (const r of own) await api.delete("staffing_rules", r.id);
      await api.delete("staffing_rule_sets", activeSet.id);
      setStaffingRules((staffingRules || []).filter((r) => r.set_id !== activeSet.id));
      setStaffingRuleSets((staffingRuleSets || []).filter((x) => x.id !== activeSet.id));
      // Formularz z regułą ze skasowanego zestawu zapisałby ją z powrotem pod
      // nieistniejącym set_id — czyścimy go razem z zestawem.
      zamknijFormularz();
      setSelectedSetId(null);
      showMsg("Usunięto zestaw wymagań.");
    } catch (err) {
      showMsg(`Błąd usuwania zestawu: ${err.message || "nieznany błąd"}`, "error");
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
      const payload = {
        set_id: wyjatekId ? null : activeSet.id,
        wyjatek_id: wyjatekId || null,
        stanowisko: form.stanowisko,
        // Wyjątek dotyczy konkretnych dat, więc dni tygodnia go nie dotyczą.
        days_of_week: wyjatekId ? null : form.days.join(","),
        start_time: form.start_time,
        end_time: form.end_time,
        required_count: Number(form.required_count) || 1,
      };
      if (form.id) {
        const zapisana = await api.patch("staffing_rules", form.id, payload);
        setStaffingRules((staffingRules || []).map((r) => (r.id === zapisana.id ? zapisana : r)));
        showMsg("Zapisano wymaganie.");
      } else {
        const created = await api.post("staffing_rules", payload);
        setStaffingRules([...(staffingRules || []), created]);
        showMsg("Dodano wymaganie.");
      }
      if (wyjatekId) {
        setWyjatekRuleForm(emptyRuleForm());
        setWyjatekFormOtwarty(false);
      } else zamknijFormularz();
    } catch (err) {
      showMsg(`Błąd zapisu wymagania: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  // Wczytanie reguły do formularza. `days_of_week` wraca jako tekst po
  // przecinku (albo null przy wyjątku), a formularz trzyma tablicę liczb.
  const doFormularza = (rule) => ({
    id: rule.id,
    stanowisko: rule.stanowisko || "",
    days: parseDni(rule.days_of_week),
    start_time: trimTime(rule.start_time) || "",
    end_time: trimTime(rule.end_time) || "",
    required_count: rule.required_count || 1,
  });

  const deleteRule = async (rule) => {
    if (!window.confirm("Usunąć to wymaganie?")) return;
    try {
      await api.delete("staffing_rules", rule.id);
      setStaffingRules((staffingRules || []).filter((r) => r.id !== rule.id));
      // Formularz z regułą, której już nie ma, zapisałby ją z powrotem pod
      // starym id — czyścimy go razem z wierszem.
      if (ruleForm.id === rule.id) zamknijFormularz();
      if (wyjatekRuleForm.id === rule.id) {
        setWyjatekRuleForm(emptyRuleForm());
        setWyjatekFormOtwarty(false);
      }
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  // --- GODZINY OTWARCIA ------------------------------------------------
  const godzinyZapisane = DNI.map((d) => {
    const row = (lokaleGodziny || []).find((g) => g.lokal === lokal && g.day_of_week === d.idx);
    return {
      day_of_week: d.idx,
      id: row?.id || null,
      open_time: trimTime(row?.open_time) || "",
      close_time: trimTime(row?.close_time) || "",
      zamkniete: !!row?.zamkniete,
      ustawione: !!row,
    };
  });
  const godzinyRows = godzinyDraft || godzinyZapisane;

  const updateGodzinyRow = (idx, patch) =>
    setGodzinyDraft(godzinyRows.map((r) => (r.day_of_week === idx ? { ...r, ...patch } : r)));

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
        const res = row.id ? await api.patch("lokale_godziny", row.id, payload) : await api.post("lokale_godziny", payload);
        saved.push(res);
      }
      setLokaleGodziny([...(lokaleGodziny || []).filter((g) => g.lokal !== lokal), ...saved]);
      setGodzinyDraft(null);
      setGodzinyEdycja(false);
      showMsg("Zapisano godziny otwarcia.");
    } catch (err) {
      showMsg(`Błąd zapisu godzin: ${err.message || "nieznany błąd"}`, "error");
    }
    setSaving(false);
  };

  // „Pn–Sb 09:00–21:00 · Nd 10:00–21:00” — kolejne dni z tymi samymi godzinami.
  const podsumowanieGodzin = () => {
    if (!godzinyZapisane.some((r) => r.ustawione)) return "nie ustawione";
    const odcinki = [];
    godzinyZapisane.forEach((r) => {
      const d = DNI.find((x) => x.idx === r.day_of_week);
      const o = r.zamkniete ? "zamknięte" : r.open_time && r.close_time ? `${r.open_time}–${r.close_time}` : "—";
      const ost = odcinki[odcinki.length - 1];
      if (ost && ost.opis === o) ost.do = d.label;
      else odcinki.push({ od: d.label, do: null, opis: o });
    });
    return odcinki.map((o) => `${o.od}${o.do ? `–${o.do}` : ""} ${o.opis}`).join(" · ");
  };

  // --- WYJĄTKI ---------------------------------------------------------
  const zapiszWyjatek = async (dane) => {
    if (!dane.date_from || !dane.date_to) {
      showMsg("Podaj zakres dat wyjątku.", "error");
      return null;
    }
    if (dane.date_to < dane.date_from) {
      showMsg("Data końcowa jest wcześniejsza niż początkowa.", "error");
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        lokal,
        date_from: dane.date_from,
        date_to: dane.date_to,
        zamkniete: !!dane.zamkniete,
        open_time: dane.zamkniete || !dane.open_time ? null : dane.open_time,
        close_time: dane.zamkniete || !dane.close_time ? null : dane.close_time,
        note: dane.note || null,
        created_by: currentUser?.name || null,
      };
      const zapisany = dane.id
        ? await api.patch("grafik_wyjatki", dane.id, payload)
        : await api.post("grafik_wyjatki", payload);
      setGrafikWyjatki([...(grafikWyjatki || []).filter((w) => w.id !== zapisany.id), zapisany]);
      showMsg("Zapisano wyjątek.");
      setSaving(false);
      return zapisany;
    } catch (err) {
      showMsg(`Błąd zapisu wyjątku: ${err.message || "nieznany błąd"}`, "error");
      setSaving(false);
      return null;
    }
  };

  const deleteWyjatek = async (w) => {
    if (!window.confirm("Usunąć ten wyjątek razem z jego wymaganiami?")) return;
    try {
      const own = (staffingRules || []).filter((r) => r.wyjatek_id === w.id);
      for (const r of own) await api.delete("staffing_rules", r.id);
      await api.delete("grafik_wyjatki", w.id);
      setStaffingRules((staffingRules || []).filter((r) => r.wyjatek_id !== w.id));
      setGrafikWyjatki((grafikWyjatki || []).filter((x) => x.id !== w.id));
      if (openWyjatekId === w.id) setOpenWyjatekId(null);
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  const doDraftu = (w) => ({ ...w, open_time: trimTime(w.open_time) || "", close_time: trimTime(w.close_time) || "" });
  const otworzWyjatek = (w, zawsze = false) => {
    if (openWyjatekId === w.id && !zawsze) {
      setOpenWyjatekId(null);
      return;
    }
    setOpenWyjatekId(w.id);
    setWyjatekDraft(doDraftu(w));
    // Kalendarz obok przechodzi na miesiąc tego wyjątku.
    const t = new Date();
    const d = new Date(w.date_from + "T00:00:00");
    setKalMies((d.getFullYear() - t.getFullYear()) * 12 + d.getMonth() - t.getMonth());
    setWyjatekRuleForm(emptyRuleForm());
    setWyjatekFormOtwarty(false);
  };

  // ===================================================================
  // RENDER
  // ===================================================================
  const znaczekStanowiska = (nazwa) => (
    <span
      className="text-[12px] font-extrabold px-1.5 py-0.5 rounded-md bg-[#ECEBE6] text-[#6E6E66] flex-none"
      style={stanowiskoBadgeStyle(activeStanowiska, lokal, nazwa) || {}}
    >
      {stanowiskoShort(activeStanowiska, lokal, nazwa)}
    </span>
  );
  const godzinyDnia = (dow) => {
    const r = godzinyZapisane.find((x) => x.day_of_week === dow);
    if (!r || !r.ustawione) return null;
    if (r.zamkniete) return { zamkniete: true };
    if (!r.open_time || !r.close_time) return null;
    return { od: naMinuty(r.open_time), doM: naMinuty(r.open_time) + dlugoscMin(r.open_time, r.close_time) };
  };

  // --- siatka dni × godziny ---
  const siatka = (reguly, kompakt) => {
    let h0 = 8;
    let h1 = 22;
    const godzOtw = DNI.map((d) => godzinyDnia(d.idx)).filter((g) => g && !g.zamkniete);
    if (godzOtw.length) {
      h0 = Math.floor(Math.min(...godzOtw.map((g) => g.od)) / 60);
      h1 = Math.ceil(Math.max(...godzOtw.map((g) => g.doM)) / 60);
    }
    reguly.forEach((r) => {
      const od = naMinuty(r.start_time);
      h0 = Math.min(h0, Math.floor(od / 60));
      h1 = Math.max(h1, Math.ceil((od + dlugoscMin(r.start_time, r.end_time)) / 60));
    });
    h0 = Math.max(0, h0);
    h1 = Math.min(24, Math.max(h1, h0 + 1));
    const godziny = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
    const kolumny = `${kompakt ? 24 : 34}px repeat(${godziny.length}, minmax(0, 1fr)) ${kompakt ? 32 : 54}px`;
    const kolor = (n) =>
      n >= 4 ? "bg-[#1F5F31] text-white" : n === 3 ? "bg-[#3F8F53] text-white" : n === 2 ? "bg-[#8CC49A]" : n === 1 ? "bg-[#CFE6D3]" : "bg-[#ECEBE6]";
    const kreski = { backgroundImage: "repeating-linear-gradient(135deg, rgba(0,0,0,.09) 0 3px, transparent 3px 7px)" };
    return (
      <div data-siatka-obsady>
        <div className="grid gap-[3px]">
          <div className="grid gap-[3px] items-center" style={{ gridTemplateColumns: kolumny }}>
            <span />
            {godziny.map((g) => (
              <span key={g} className="text-[11px] md:text-[12px] font-bold text-[#6E6E66] tabular-nums">
                {kompakt && g % 2 ? "" : g}
              </span>
            ))}
            <span className="text-[11px] md:text-[13px] font-extrabold text-[#6E6E66] text-right">os·h</span>
          </div>
          {DNI.map((d) => {
            const otw = godzinyDnia(d.idx);
            return (
              <div key={d.idx} className="grid gap-[3px] items-center" style={{ gridTemplateColumns: kolumny }} data-siatka-dzien={d.idx}>
                <b className="text-[13px] md:text-[14px]">{d.label}</b>
                {godziny.map((g) => {
                  const n = ileWGodzinie(reguly, d.idx, g);
                  const poza = otw && (otw.zamkniete || g * 60 < otw.od || g * 60 >= otw.doM);
                  return (
                    <i
                      key={g}
                      title={`${d.label} ${g}:00 · ${n} os.`}
                      className={`not-italic ${kompakt ? "h-7 text-[12px]" : "h-[34px] text-[14px]"} rounded-[5px] grid place-items-center font-extrabold tabular-nums ${
                        n === 0 && poza ? "bg-[#F1F0EC]" : kolor(n)
                      }`}
                      style={poza ? kreski : undefined}
                    >
                      {n || ""}
                    </i>
                  );
                })}
                <span className="text-[12px] md:text-[13px] font-extrabold text-right text-[#6E6E66] tabular-nums">
                  {f1(osGodzinDnia(reguly, d.idx))}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3.5 mt-2.5 text-[13px] text-[#6E6E66]">
          {[
            ["bg-[#CFE6D3]", "1"],
            ["bg-[#8CC49A]", "2"],
            ["bg-[#3F8F53]", "3"],
            ["bg-[#1F5F31]", "4+ osób"],
          ].map(([k, t]) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <i className={`w-4 h-4 rounded ${k}`} /> {t}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <i className="w-4 h-4 rounded bg-[#F1F0EC] border border-[#B7B6AE]" style={kreski} /> poza godzinami otwarcia
          </span>
        </div>
      </div>
    );
  };

  // --- godziny otwarcia (karta z boku) ---
  const kartaGodzin = () =>
    !godzinyEdycja ? (
      <div className="grid grid-cols-[40px_1fr] gap-2.5 bg-white border-[2px] border-[#B7B6AE] rounded-xl p-3.5" data-godziny-otwarcia>
        <span className="w-10 h-10 rounded-full bg-[#ECEBE6] grid place-items-center">
          <Clock size={22} />
        </span>
        <div className="min-w-0">
          <span className={etykietaCls}>Godziny otwarcia</span>
          <b className="block text-[16px] leading-[22px] text-[#171714]">{podsumowanieGodzin()}</b>
          <small className="block text-[13px] leading-[18px] text-[#6E6E66] mt-1">
            Wyznaczają oś czasu w Grafiku i pokazują wymagania poza godzinami.
          </small>
        </div>
        <button type="button" className={`${btnObrysCls} col-span-2`} onClick={() => setGodzinyEdycja(true)} data-zmien-godziny>
          <Pencil size={16} /> Zmień
        </button>
      </div>
    ) : (
      <div className="bg-white border-[2px] border-[#171714] rounded-xl p-3.5 flex flex-col gap-1.5" data-godziny-otwarcia>
        <span className={etykietaCls}>Godziny otwarcia</span>
        {godzinyRows.map((row) => {
          const d = DNI.find((x) => x.idx === row.day_of_week);
          return (
            <div key={row.day_of_week} className="grid grid-cols-[30px_1fr_10px_1fr] gap-1.5 items-center" data-godziny-dnia={row.day_of_week}>
              <b className="text-[14px]">{d.label}</b>
              {row.zamkniete ? (
                <span className="col-span-3 text-[14px] text-[#6E6E66] h-10 flex items-center">zamknięte</span>
              ) : (
                <>
                  <input
                    type="time"
                    value={row.open_time}
                    onChange={(e) => updateGodzinyRow(row.day_of_week, { open_time: e.target.value })}
                    className={`${poleCls} !h-10 !text-[15px] !px-1.5 w-full`}
                    aria-label={`${d.label} otwarcie`}
                  />
                  <span className="text-[#6E6E66] text-center">–</span>
                  <input
                    type="time"
                    value={row.close_time}
                    onChange={(e) => updateGodzinyRow(row.day_of_week, { close_time: e.target.value })}
                    className={`${poleCls} !h-10 !text-[15px] !px-1.5 w-full`}
                    aria-label={`${d.label} zamknięcie`}
                  />
                </>
              )}
              <label className="col-start-2 col-span-3 flex items-center gap-1.5 text-[13px] text-[#6E6E66] -mt-0.5">
                <input
                  type="checkbox"
                  checked={row.zamkniete}
                  onChange={(e) => updateGodzinyRow(row.day_of_week, { zamkniete: e.target.checked })}
                />
                zamknięte
              </label>
            </div>
          );
        })}
        <div className="flex gap-2 mt-1">
          <button type="button" className={`${btnGlownyCls} flex-1`} onClick={saveGodziny} disabled={saving} data-zapisz-godziny>
            Zapisz godziny
          </button>
          <button
            type="button"
            className={btnObrysCls}
            onClick={() => {
              setGodzinyDraft(null);
              setGodzinyEdycja(false);
            }}
          >
            Anuluj
          </button>
        </div>
      </div>
    );

  // --- formularz wymagania (w miejscu) ---
  // Podgląd: ilu ludzi będzie na tym stanowisku po zapisie, w najtłoczniejszej
  // godzinie wybranych dni — wymagania się sumują i to ma być widać od razu.
  const podgladFormularza = (form, reguly) => {
    if (!form.stanowisko || !form.start_time || !form.end_time) return null;
    const dni = form.days && form.days.length ? form.days : DNI.map((d) => d.idx);
    const inne = reguly.filter((r) => r.stanowisko === form.stanowisko && r.id !== form.id);
    const nowa = { ...form, days_of_week: dni.join(",") };
    const od = naMinuty(form.start_time);
    const doM = od + dlugoscMin(form.start_time, form.end_time);
    let max = 0;
    dni.forEach((dow) => {
      for (let h = Math.floor(od / 60); h * 60 < doM; h++) max = Math.max(max, ileWGodzinie([...inne, nowa], dow, h % 24));
    });
    const sam = Number(form.required_count) || 1;
    return (
      <p className="col-span-2 md:col-span-full flex items-center gap-2 text-[15px] text-[#171714] m-0" data-podglad-wymagania>
        <Users size={18} className="text-[#1F7A4A] flex-none" />
        <span>
          Podgląd: {dniTekst(dni)} {form.start_time}–{form.end_time} — najwięcej{" "}
          <b>
            {max} {osobyTekst(max)}
          </b>{" "}
          na {form.stanowisko}
          {max > sam ? ` (${sam} z tego wymagania + ${max - sam} z innych)` : ""}. Wymagania się sumują.
        </span>
      </p>
    );
  };

  const formularzWymagania = (form, setForm, { wyjatekId, reguly, nowaGrupa, onAnuluj }) => (
    <form
      onSubmit={(e) => submitRule(e, { wyjatekId })}
      className={`grid grid-cols-2 ${
        wyjatekId ? "md:grid-cols-[130px_130px_150px_auto]" : "md:grid-cols-[1fr_130px_130px_150px_auto]"
      } gap-3 items-end p-3.5 border-[2px] border-[#171714] rounded-lg bg-[#F1F0EC]`}
      data-formularz-wymagania={wyjatekId ? "wyjatek" : "zestaw"}
    >
      {(nowaGrupa || wyjatekId) && (
        <label className="col-span-2 md:col-span-full flex flex-col">
          <span className={etykietaCls}>Stanowisko</span>
          <select
            value={form.stanowisko}
            onChange={(e) => setForm({ ...form, stanowisko: e.target.value })}
            className={`${poleCls} font-semibold`}
            required
          >
            <option value="">— wybierz —</option>
            {stanowiskaLokalu.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!wyjatekId && (
        <div className="col-span-2 md:col-span-1 flex flex-col">
          <span className={etykietaCls}>Dni</span>
          <div className="flex flex-wrap gap-1">
            {DNI.map((d) => {
              const on = form.days.includes(d.idx);
              return (
                <button
                  key={d.idx}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== d.idx) : [...form.days, d.idx] })}
                  className={`min-w-[44px] h-11 rounded-lg border-[2px] text-[15px] font-extrabold ${
                    on ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#B7B6AE] text-[#171714]"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setForm({ ...form, days: form.days.length === 7 ? [] : DNI.map((d) => d.idx) })}
              className="h-11 px-2.5 rounded-lg border-[2px] border-[#B7B6AE] bg-white text-[15px] font-bold"
            >
              {form.days.length === 7 ? "Wyczyść" : "Cały tydzień"}
            </button>
          </div>
        </div>
      )}
      <label className="flex flex-col">
        <span className={etykietaCls}>Od</span>
        <input
          type="time"
          value={form.start_time}
          onChange={(e) => setForm({ ...form, start_time: e.target.value })}
          className={`${poleCls} w-full`}
          required
        />
      </label>
      <label className="flex flex-col">
        <span className={etykietaCls}>Do</span>
        <input
          type="time"
          value={form.end_time}
          onChange={(e) => setForm({ ...form, end_time: e.target.value })}
          className={`${poleCls} w-full`}
          required
        />
      </label>
      <div className="flex flex-col">
        <span className={etykietaCls}>Ile osób</span>
        <div className="grid grid-cols-[44px_1fr_44px] h-12 border-[2px] border-[#171714] rounded-md overflow-hidden bg-white">
          <button
            type="button"
            className="bg-[#ECEBE6] grid place-items-center"
            aria-label="Mniej osób"
            onClick={() => setForm({ ...form, required_count: Math.max(1, (Number(form.required_count) || 1) - 1) })}
          >
            <span className="text-[22px] font-bold leading-none">−</span>
          </button>
          <b className="grid place-items-center text-[20px] tabular-nums" data-ile-osob>
            {form.required_count}
          </b>
          <button
            type="button"
            className="bg-[#ECEBE6] grid place-items-center"
            aria-label="Więcej osób"
            onClick={() => setForm({ ...form, required_count: Math.min(20, (Number(form.required_count) || 0) + 1) })}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button type="submit" disabled={saving} className={`${btnGlownyCls} flex-1 md:flex-none`} data-zapisz-wymaganie>
          {form.id ? "Zapisz" : (
            <>
              <Plus size={17} /> Dodaj
            </>
          )}
        </button>
        <button type="button" className={btnObrysCls} onClick={onAnuluj}>
          Anuluj
        </button>
      </div>
      {!wyjatekId && podgladFormularza(form, reguly)}
    </form>
  );

  // --- wiersz wymagania ---
  const wierszWymagania = (r, i, { wyjatek, onEdytuj }) => {
    const dni = parseDays(r.days_of_week);
    const otwarcia = (dni || DNI.map((d) => d.idx)).map(godzinyDnia).filter((g) => g && !g.zamkniete);
    const przedOtwarciem = !wyjatek && otwarcia.length > 0 && naMinuty(r.start_time) < Math.min(...otwarcia.map((g) => g.od));
    const edytowany = (wyjatek ? wyjatekRuleForm.id : ruleForm.id) === r.id;
    return (
      <div
        key={r.id}
        className={`grid grid-cols-[auto_1fr_auto] ${
          wyjatek ? "md:grid-cols-[110px_1fr_auto]" : "md:grid-cols-[110px_1fr_1fr_auto]"
        } gap-x-3 gap-y-1 items-center min-h-[56px] px-3 py-1.5 border-[2px] rounded-lg mb-1.5 ${
          edytowany ? "border-[#171714] bg-[#FDF3D4]" : "border-[#ECEBE6] bg-white"
        }`}
        data-wymaganie={r.id}
      >
        <span className="text-[22px] font-extrabold tabular-nums text-[#171714] whitespace-nowrap">
          {i && !wyjatek ? "+" : ""}
          {r.required_count} <small className="text-[14px] font-bold text-[#6E6E66]">{osobyTekst(r.required_count)}</small>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-bold tabular-nums text-[#171714] min-w-0">
          {wyjatek && (
            <>
              {znaczekStanowiska(r.stanowisko)} <span className="font-semibold text-[15px]">{r.stanowisko}</span>
            </>
          )}
          {trimTime(r.start_time)}–{trimTime(r.end_time)}
          {przedOtwarciem && (
            <em className="not-italic inline-flex items-center gap-1 text-[12px] font-bold text-[#6E6E66] bg-[#ECEBE6] px-1.5 py-0.5 rounded-md">
              <Clock size={13} /> start przed otwarciem
            </em>
          )}
        </span>
        {!wyjatek && (
          <span className="order-4 md:order-none col-span-2 md:col-span-1 text-[15px] md:text-[16px] font-semibold text-[#6E6E66]">
            {dniTekst(dni)}
          </span>
        )}
        <span className="row-span-2 md:row-span-1 flex gap-1.5 justify-self-end">
          <button type="button" className={btnMalyCls} onClick={onEdytuj} aria-label="Edytuj wymaganie">
            <Pencil size={15} /> <span className="hidden sm:inline">Edytuj</span>
          </button>
          <button
            type="button"
            className={`${ikonaBtnCls} !text-[#DE3A22] hover:!border-[#DE3A22]`}
            onClick={() => deleteRule(r)}
            aria-label="Usuń wymaganie"
          >
            <Trash2 size={16} />
          </button>
        </span>
      </div>
    );
  };

  // --- OBSADA ---
  const grupy = [];
  rulesOfSet.forEach((r) => {
    let g = grupy.find((x) => x.stanowisko === r.stanowisko);
    if (!g) {
      g = { stanowisko: r.stanowisko, reguly: [] };
      grupy.push(g);
    }
    g.reguly.push(r);
  });
  const osGodzinTydzien = (reguly) =>
    reguly.reduce((s, r) => {
      const dni = parseDays(r.days_of_week);
      return s + (dlugoscMin(r.start_time, r.end_time) / 60) * (Number(r.required_count) || 1) * (dni ? dni.length : 7);
    }, 0);

  const obsada = () => (
    <>
      <PasekWersji
        etykieta="Zestaw wymagań"
        wersje={setsForLokal.map((x) => x.obowiazuje_od)}
        aktywna={activeSet?.obowiazuje_od || null}
        obowiazujaca={effectiveSet?.obowiazuje_od || null}
        dzis={todayStr}
        onWybierz={(od) => {
          // Zmiana zestawu w trakcie poprawiania reguły przeniosłaby ją po cichu
          // do innego zestawu (payload niesie set_id aktywnego), więc edycję
          // przerywamy.
          zamknijFormularz();
          const x = setsForLokal.find((z) => z.obowiazuje_od === od);
          if (x) setSelectedSetId(x.id);
        }}
        onUtworz={handleCreateSet}
        onUsun={handleDeleteSet}
        skutekUsuniecia={skutekUsunieciaZestawu}
        opisKopii={`${rulesOfSet.length} ${rulesOfSet.length === 1 ? "wymaganie" : "wymagań"}`}
        zapisuje={saving}
      />
      <div className="grid md:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <Panel
          tytul="Ilu ludzi potrzeba — suma wymagań"
          prawa={activeSet && <span className="text-[14px] text-[#6E6E66] font-bold">od {miesiacKrotko(activeSet.obowiazuje_od)}</span>}
        >
          <div className="px-3 md:px-[18px] py-3.5">
            {activeSet ? (
              <>
                <div className="hidden md:block">{siatka(rulesOfSet, false)}</div>
                <div className="md:hidden">{siatka(rulesOfSet, true)}</div>
              </>
            ) : (
              <p className={`${notaCls} m-0`}>Najpierw utwórz zestaw wymagań dla tego lokalu — „Nowy zestaw od…” wyżej.</p>
            )}
          </div>
        </Panel>
        {kartaGodzin()}
      </div>
      {activeSet && (
        <Panel
          tytul="Wymagania wg stanowisk"
          prawa={<span className="text-[14px] text-[#6E6E66] font-bold">{rulesOfSet.length} wymagań</span>}
          dane={{ "data-wymagania-zestawu": activeSet.id }}
        >
          <div className="px-3 md:px-[18px] py-3.5">
            {grupy.map((g) => (
              <section key={g.stanowisko} className="pb-3.5 mb-3 border-b-[1.5px] border-[#ECEBE6]" data-grupa-stanowiska={g.stanowisko}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {znaczekStanowiska(g.stanowisko)}
                  <b className="text-[18px] text-[#171714]">{g.stanowisko}</b>
                  <small className="ml-auto text-[14px] font-bold text-[#6E6E66]">{f1(osGodzinTydzien(g.reguly))} os·h / tydzień</small>
                </div>
                {g.reguly.map((r, i) =>
                  formGrupa === g.stanowisko && ruleForm.id === r.id ? (
                    <div key={r.id} className="mb-1.5">
                      {formularzWymagania(ruleForm, setRuleForm, { reguly: rulesOfSet, onAnuluj: zamknijFormularz })}
                    </div>
                  ) : (
                    wierszWymagania(r, i, {
                      onEdytuj: () => {
                        setRuleForm(doFormularza(r));
                        setFormGrupa(g.stanowisko);
                      },
                    })
                  )
                )}
                {formGrupa === g.stanowisko && !ruleForm.id ? (
                  formularzWymagania(ruleForm, setRuleForm, { reguly: rulesOfSet, onAnuluj: zamknijFormularz })
                ) : (
                  <button
                    type="button"
                    className={dodajCls}
                    onClick={() => {
                      setRuleForm({ ...emptyRuleForm(), stanowisko: g.stanowisko });
                      setFormGrupa(g.stanowisko);
                    }}
                    data-dodaj-wymaganie={g.stanowisko}
                  >
                    <Plus size={18} /> Dodaj wymaganie dla {g.stanowisko}
                  </button>
                )}
              </section>
            ))}
            {grupy.length === 0 && <p className={`${notaCls} mt-0 mb-3`}>Brak wymagań w tym zestawie.</p>}
            {formGrupa === "__nowe" ? (
              formularzWymagania(ruleForm, setRuleForm, { reguly: rulesOfSet, nowaGrupa: true, onAnuluj: zamknijFormularz })
            ) : (
              <button
                type="button"
                className={`${dodajCls} w-full justify-center`}
                onClick={() => {
                  setRuleForm(emptyRuleForm());
                  setFormGrupa("__nowe");
                }}
                data-dodaj-stanowisko
              >
                <Plus size={18} /> Dodaj stanowisko do wymagań
              </button>
            )}
          </div>
        </Panel>
      )}
    </>
  );

  // --- WYJĄTKI ---
  const budzetWDniach = (w) =>
    (budzetDni || []).filter((d) => d.lokal === lokal && d.date >= w.date_from && d.date <= (w.date_to || w.date_from));
  const nadchodzace = wyjatkiLokalu.filter((w) => (w.date_to || w.date_from) >= todayStr);
  const minione = wyjatkiLokalu.filter((w) => (w.date_to || w.date_from) < todayStr).reverse();

  const anulujFormularzWyjatku = () => {
    setWyjatekRuleForm(emptyRuleForm());
    setWyjatekFormOtwarty(false);
  };

  const wyjatekPozycja = (w) => {
    const own = (staffingRules || []).filter((r) => r.wyjatek_id === w.id);
    const otwarty = openWyjatekId === w.id;
    const [dzien, pod] = kafelDaty(w.date_from, w.date_to);
    const budzet = budzetWDniach(w);
    const d = otwarty ? wyjatekDraft : null;
    const tagCls = "not-italic inline-flex items-center gap-1 text-[13px] font-bold px-2 py-0.5 rounded-md";
    return (
      <article key={w.id} className={`border-b-[1.5px] border-[#ECEBE6] ${otwarty ? "bg-[#F1F0EC]" : ""}`} data-wyjatek={w.id}>
        <button
          type="button"
          onClick={() => otworzWyjatek(w)}
          aria-expanded={otwarty}
          className="w-full grid grid-cols-[76px_1fr_22px] gap-3.5 items-center px-3.5 md:px-[18px] py-3 text-left"
        >
          <span className={`text-center border-[2px] rounded-[10px] py-1 ${w.zamkniete ? "border-[#B7B6AE] text-[#6E6E66]" : "border-[#171714]"}`}>
            <b className="block text-[16px] leading-[22px]">{dzien}</b>
            <small className="text-[13px] font-bold text-[#6E6E66]">{pod}</small>
          </span>
          <span className="min-w-0">
            <b className="block text-[17px] text-[#171714]">{w.note || "Wyjątek"}</b>
            <span className="flex flex-wrap gap-1.5 mt-1">
              {w.zamkniete ? (
                <em className={`${tagCls} bg-[#FBEAE6] text-[#DE3A22]`}>
                  <Lock size={14} /> lokal zamknięty
                </em>
              ) : (
                <>
                  <em className={`${tagCls} bg-[#ECEBE6] tabular-nums`}>
                    <Clock size={14} /> {trimTime(w.open_time) || "?"}–{trimTime(w.close_time) || "?"}
                  </em>
                  <em className={`${tagCls} bg-[#ECEBE6]`}>
                    <Users size={14} /> {own.length ? `${own.length} ${own.length === 1 ? "wymaganie" : "wymagania"}` : "obsada jak zwykle"}
                  </em>
                  {budzet.length ? (
                    <em className={`${tagCls} bg-[#ECEBE6]`}>
                      <Wallet size={14} />
                      {budzet[0].oczekiwany_utarg != null ? zl(budzet[0].oczekiwany_utarg) : "utarg jak zwykle"}
                      {budzet[0].cel_koszt_pct != null ? ` · ${budzet[0].cel_koszt_pct}%` : ""}
                    </em>
                  ) : (
                    <em className={`${tagCls} !px-0 text-[#6E6E66]`}>
                      <Wallet size={14} /> budżet jak zwykle
                    </em>
                  )}
                </>
              )}
            </span>
          </span>
          {otwarty ? <ChevronDown size={20} className="text-[#6E6E66]" /> : <ChevronRight size={20} className="text-[#6E6E66]" />}
        </button>
        {otwarty && d && (
          <div className="px-3.5 md:pl-[108px] md:pr-[18px] pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col min-w-0">
                <span className={etykietaCls}>Od dnia</span>
                <input type="date" value={d.date_from} onChange={(e) => setWyjatekDraft({ ...d, date_from: e.target.value })} className={`${poleCls} w-full`} />
              </label>
              <label className="flex flex-col min-w-0">
                <span className={etykietaCls}>Do dnia</span>
                <input type="date" value={d.date_to} onChange={(e) => setWyjatekDraft({ ...d, date_to: e.target.value })} className={`${poleCls} w-full`} />
              </label>
              <label className="col-span-2 flex flex-col">
                <span className={etykietaCls}>Nazwa</span>
                <input
                  type="text"
                  value={d.note || ""}
                  onChange={(e) => setWyjatekDraft({ ...d, note: e.target.value })}
                  placeholder="np. Boże Narodzenie, niedziela handlowa"
                  className={`${poleCls} !font-semibold w-full`}
                />
              </label>
              <label className="col-span-2 flex items-center gap-2 text-[15px] font-bold">
                <input type="checkbox" checked={!!d.zamkniete} onChange={(e) => setWyjatekDraft({ ...d, zamkniete: e.target.checked })} className="w-5 h-5" />
                Lokal zamknięty w tych dniach
              </label>
              {!d.zamkniete && (
                <div className="col-span-2 flex flex-col">
                  <span className={etykietaCls}>Godziny otwarcia</span>
                  <div className="flex items-center gap-1.5">
                    <input type="time" value={d.open_time || ""} onChange={(e) => setWyjatekDraft({ ...d, open_time: e.target.value })} className={`${poleCls} flex-1`} />
                    <span className="text-[#6E6E66]">–</span>
                    <input type="time" value={d.close_time || ""} onChange={(e) => setWyjatekDraft({ ...d, close_time: e.target.value })} className={`${poleCls} flex-1`} />
                  </div>
                </div>
              )}
            </div>
            <div>
              <button
                type="button"
                className={btnGlownyCls}
                disabled={saving}
                onClick={async () => {
                  const z = await zapiszWyjatek(d);
                  if (z) setWyjatekDraft(doDraftu(z));
                }}
                data-zapisz-wyjatek
              >
                Zapisz zmiany
              </button>
            </div>
            {!w.zamkniete && (
              <div>
                <span className={etykietaCls}>
                  Obsada tego dnia{" "}
                  <small className="normal-case tracking-normal font-semibold ml-1.5">
                    {own.length ? "zastępuje zwykłe wymagania" : "bez własnych — obowiązują zwykłe wymagania"}
                  </small>
                </span>
                {own.map((r, i) =>
                  wyjatekFormOtwarty && wyjatekRuleForm.id === r.id ? (
                    <div key={r.id} className="mb-1.5">
                      {formularzWymagania(wyjatekRuleForm, setWyjatekRuleForm, { wyjatekId: w.id, reguly: own, onAnuluj: anulujFormularzWyjatku })}
                    </div>
                  ) : (
                    wierszWymagania(r, i, {
                      wyjatek: true,
                      onEdytuj: () => {
                        setWyjatekRuleForm(doFormularza(r));
                        setWyjatekFormOtwarty(true);
                      },
                    })
                  )
                )}
                {wyjatekFormOtwarty && !wyjatekRuleForm.id ? (
                  formularzWymagania(wyjatekRuleForm, setWyjatekRuleForm, { wyjatekId: w.id, reguly: own, onAnuluj: anulujFormularzWyjatku })
                ) : (
                  <button
                    type="button"
                    className={dodajCls}
                    onClick={() => {
                      setWyjatekRuleForm(emptyRuleForm());
                      setWyjatekFormOtwarty(true);
                    }}
                    data-dodaj-wymaganie-wyjatku
                  >
                    <Plus size={18} /> Dodaj wymaganie
                  </button>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" className={btnUsunCls} onClick={() => deleteWyjatek(w)} data-usun-wyjatek>
                <Trash2 size={16} /> Usuń wyjątek
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };

  const kalendarz = () => {
    const pierwszy = new Date();
    pierwszy.setDate(1);
    pierwszy.setMonth(pierwszy.getMonth() + kalMies);
    const rok = pierwszy.getFullYear();
    const mies = pierwszy.getMonth();
    const dniMies = new Date(rok, mies + 1, 0).getDate();
    const przes = (pierwszy.getDay() + 6) % 7;
    return (
      <div className="bg-white border-[2px] border-[#B7B6AE] rounded-xl p-3" data-kalendarz-wyjatkow>
        <div className="grid grid-cols-[40px_1fr_40px] items-center text-center mb-1.5">
          <button type="button" onClick={() => setKalMies(kalMies - 1)} className="h-10 rounded-lg border-[2px] border-[#B7B6AE] grid place-items-center" aria-label="Poprzedni miesiąc">
            <ChevronLeft size={18} />
          </button>
          <b className="text-[17px]">
            {MIES_PELNE[mies]} {rok}
          </b>
          <button type="button" onClick={() => setKalMies(kalMies + 1)} className="h-10 rounded-lg border-[2px] border-[#B7B6AE] grid place-items-center" aria-label="Następny miesiąc">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-[3px]">
          {DNI.map((d) => (
            <span key={d.idx} className={`text-[12px] font-extrabold text-center ${d.idx === 0 || d.idx === 6 ? "text-[#DE3A22]" : "text-[#6E6E66]"}`}>
              {d.label}
            </span>
          ))}
          {Array.from({ length: przes }, (_, i) => (
            <span key={`p${i}`} />
          ))}
          {Array.from({ length: dniMies }, (_, i) => i + 1).map((dz) => {
            const ymd = `${rok}-${String(mies + 1).padStart(2, "0")}-${String(dz).padStart(2, "0")}`;
            const w = wyjatkiLokalu.find((x) => ymd >= x.date_from && ymd <= (x.date_to || x.date_from));
            const dow = new Date(rok, mies, dz).getDay();
            return (
              <button
                key={ymd}
                type="button"
                disabled={!w}
                onClick={() => w && otworzWyjatek(w, true)}
                data-dzien-kalendarza={ymd}
                className={`h-9 rounded-lg text-[15px] font-bold grid place-items-center tabular-nums ${
                  w
                    ? w.zamkniete
                      ? "bg-[#FBEAE6] text-[#DE3A22] line-through"
                      : "bg-[#171714] text-white"
                    : dow === 0 || dow === 6
                    ? "text-[#DE3A22]"
                    : "text-[#171714]"
                }`}
              >
                {dz}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] text-[#6E6E66] mt-2">
          <span className="inline-flex items-center gap-1">
            <i className="w-3 h-3 rounded-[3px] bg-[#171714]" /> inne godziny / obsada
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="w-3 h-3 rounded-[3px] bg-[#FBEAE6] border border-[#DE3A22]" /> zamknięte
          </span>
        </div>
      </div>
    );
  };

  const wyjatki = () => (
    <>
      <div className="grid md:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="order-2 md:order-none min-w-0">
          <Panel
            tytul="Wyjątki"
            prawa={
              <>
                <span className="text-[14px] text-[#6E6E66] font-bold">{nadchodzace.length} nadchodzące</span>
                <button
                  type="button"
                  className={btnGlownyCls}
                  onClick={() => setNowyWyjatek({ date_from: "", date_to: "", note: "", zamkniete: false, open_time: "", close_time: "" })}
                  data-dodaj-wyjatek
                >
                  <Plus size={17} /> Dodaj wyjątek
                </button>
              </>
            }
          >
            <p className={`${notaCls} px-3.5 md:px-[18px] py-2.5 border-b-[1.5px] border-[#ECEBE6] m-0`}>
              Wyjątek na wskazane dni zastępuje <b className="text-[#171714]">godziny otwarcia i obsadę</b>. Czego nie ustawisz — zostaje jak
              zwykle. Budżet na konkretny dzień ustawisz w zakładce Budżet.
            </p>
            {nadchodzace.length === 0 && <p className={`${notaCls} px-3.5 md:px-[18px] py-3 m-0`}>Brak nadchodzących wyjątków.</p>}
            {nadchodzace.map(wyjatekPozycja)}
            {minione.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setPokazMinione(!pokazMinione)}
                  className="w-full text-left px-3.5 md:px-[18px] py-2.5 text-[14px] font-bold text-[#6E6E66] underline underline-offset-[3px]"
                >
                  {pokazMinione ? "Schowaj minione" : `Pokaż minione (${minione.length})`}
                </button>
                {pokazMinione && minione.map(wyjatekPozycja)}
              </>
            )}
          </Panel>
        </div>
        <div className="order-1 md:order-none">{kalendarz()}</div>
      </div>
      {nowyWyjatek && (
        <div className="fixed inset-0 bg-black/45 flex items-end md:items-start md:pt-16 justify-center z-50">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const z = await zapiszWyjatek(nowyWyjatek);
              if (z) {
                setNowyWyjatek(null);
                // Od razu rozwinięty — zwykle następny krok to obsada tego dnia.
                otworzWyjatek(z, true);
              }
            }}
            className="bg-white rounded-t-2xl md:rounded-xl w-full md:max-w-[620px] max-h-[90vh] overflow-y-auto px-5 md:px-[22px] py-5 flex flex-col gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.25)]"
            data-formularz-wyjatku
          >
            <div className="flex items-center justify-between">
              <h3 className="font-['Archivo'] font-extrabold text-[22px] m-0">Nowy wyjątek</h3>
              <button type="button" className={ikonaBtnCls} onClick={() => setNowyWyjatek(null)} aria-label="Zamknij">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col min-w-0">
                <span className={etykietaCls}>Od dnia</span>
                <input
                  type="date"
                  value={nowyWyjatek.date_from}
                  onChange={(e) => setNowyWyjatek({ ...nowyWyjatek, date_from: e.target.value, date_to: nowyWyjatek.date_to || e.target.value })}
                  className={`${poleCls} w-full`}
                  required
                />
              </label>
              <label className="flex flex-col min-w-0">
                <span className={etykietaCls}>Do dnia</span>
                <input
                  type="date"
                  value={nowyWyjatek.date_to}
                  onChange={(e) => setNowyWyjatek({ ...nowyWyjatek, date_to: e.target.value })}
                  className={`${poleCls} w-full`}
                  required
                />
              </label>
            </div>
            <label className="flex flex-col">
              <span className={etykietaCls}>Nazwa</span>
              <input
                type="text"
                value={nowyWyjatek.note}
                onChange={(e) => setNowyWyjatek({ ...nowyWyjatek, note: e.target.value })}
                placeholder="np. Boże Narodzenie, niedziela handlowa"
                className={`${poleCls} !font-semibold w-full`}
              />
            </label>
            <div>
              <span className={etykietaCls}>Zacznij od</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  [false, Users, "Obsada jak zwykle", "własne wymagania dodasz po zapisaniu"],
                  [true, Lock, "Lokal zamknięty", "bez obsady — nikogo nie da się przypisać"],
                ].map(([zamk, Ik, tytul, opis]) => (
                  <button
                    key={tytul}
                    type="button"
                    onClick={() => setNowyWyjatek({ ...nowyWyjatek, zamkniete: zamk })}
                    aria-pressed={!!nowyWyjatek.zamkniete === zamk}
                    className={`flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border-[2px] ${
                      !!nowyWyjatek.zamkniete === zamk ? "border-[#171714] shadow-[inset_0_0_0_2px_#171714]" : "border-[#B7B6AE]"
                    }`}
                  >
                    <Ik size={22} className="flex-none" />
                    <span>
                      <b className="block text-[15px]">{tytul}</b>
                      <small className="text-[13px] text-[#6E6E66]">{opis}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {!nowyWyjatek.zamkniete && (
              <div className="flex flex-col">
                <span className={etykietaCls}>Godziny otwarcia</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={nowyWyjatek.open_time}
                    onChange={(e) => setNowyWyjatek({ ...nowyWyjatek, open_time: e.target.value })}
                    className={`${poleCls} flex-1`}
                  />
                  <span className="text-[#6E6E66]">–</span>
                  <input
                    type="time"
                    value={nowyWyjatek.close_time}
                    onChange={(e) => setNowyWyjatek({ ...nowyWyjatek, close_time: e.target.value })}
                    className={`${poleCls} flex-1`}
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-1">
              <button type="submit" disabled={saving} className={btnGlownyCls} data-zapisz-nowy-wyjatek>
                {nowyWyjatek.zamkniete ? "Zapisz wyjątek" : "Zapisz i ustaw obsadę"}
              </button>
              <button type="button" className={btnObrysCls} onClick={() => setNowyWyjatek(null)}>
                Anuluj
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-[1180px] w-full mx-auto flex flex-col gap-3.5" data-konfiguracja-grafiku>
      <div className="hidden md:block">
        {onZamknij && (
          <button type="button" onClick={onZamknij} className="inline-flex items-center gap-1 text-[15px] font-bold text-[#6E6E66]">
            <ChevronLeft size={18} /> Grafik
          </button>
        )}
        <h2 className="font-['Archivo'] text-[30px] leading-9 font-extrabold text-[#171714] m-0">Konfiguracja grafiku</h2>
        <p className="text-[15px] text-[#6E6E66] m-0">{lokal} · na tym opiera się kontrola obsady i budżet w Grafiku</p>
      </div>
      <Zakladki
        zakladki={[
          { key: "obsada", label: "Obsada", Icon: Users },
          { key: "budzet", label: "Budżet", Icon: Wallet },
          { key: "wyjatki", label: "Wyjątki", Icon: CalendarDays, licznik: nadchodzace.length },
        ]}
        aktywna={zakladka}
        onWybierz={setZakladka}
      />
      {zakladka === "obsada" && obsada()}
      {zakladka === "budzet" && (
        <GrafikBudzetKonfiguracja
          lokal={lokal}
          lokale={lokale}
          users={users}
          budzetCele={budzetCele}
          setBudzetCele={setBudzetCele}
          budzetDni={budzetDni}
          setBudzetDni={setBudzetDni}
          staffingRules={staffingRules}
          staffingRuleSets={staffingRuleSets}
          dayLogs={dayLogs}
          currentUser={currentUser}
          showMsg={showMsg}
        />
      )}
      {zakladka === "wyjatki" && wyjatki()}
    </div>
  );
}
