// @ts-nocheck
// Zgłoszenie zdarzenia — skarga, konflikt, wypadek, awaria, kontrola.
//
// Poprzednia wersja miała jedno pole "co się wydarzyło" i dlatego nie
// wypełniał go nikt: żeby taki opis był do czegoś przydatny miesiąc później,
// trzeba było z siebie wykrzesać całą strukturę za każdym razem. Tutaj
// strukturę daje formularz, a kierownik tylko odpowiada.
//
// Wymagamy dokładnie trzech rzeczy: kategorii, opisu i statusu. Reszta bywa
// nieznana w chwili zdarzenia, a formularz, którego nie da się zamknąć bez
// kompletu, kończy tak samo jak poprzedni — pusty.
import React, { useState } from "react";
import { sectionHeaderCls, btnPrimaryCls, btnSecondaryCls, COLORS } from "./designTokens";
import { KATEGORIE_ZDARZENIA } from "../../utils/dziennik";

const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

const TYPY_WPLYWU = [
  { key: "", label: "brak" },
  { key: "rekompensata", label: "Rekompensata dla gościa" },
  { key: "zwrot", label: "Zwrot za rachunek" },
  { key: "szkoda", label: "Koszt szkody" },
];

export default function ZdarzenieModal({ dateStr, osobyNaZmianie = [], onClose, onSave }) {
  const [f, setF] = useState({
    kategoria: "",
    czas: "",
    miejsce: "",
    personel: [],
    gosc: "",
    opis: "",
    dzialania: "",
    wplyw_typ: "",
    wplyw_kwota: "",
    status: "zamkniete",
    dowod: "",
    wymaga_prowadzenia: false,
  });
  const [zapisuje, setZapisuje] = useState(false);
  const ustaw = (k, v) => setF({ ...f, [k]: v });

  const brakujace = [
    !f.kategoria && "kategoria",
    !f.opis.trim() && "opis sytuacji",
  ].filter(Boolean);
  const kompletny = !brakujace.length;

  const przelaczOsobe = (imie) =>
    ustaw(
      "personel",
      f.personel.includes(imie)
        ? f.personel.filter((x) => x !== imie)
        : [...f.personel, imie]
    );

  const zapisz = async () => {
    if (!kompletny) return;
    setZapisuje(true);
    await onSave("incydent", null, {
      ...f,
      personel: f.personel.join(", "),
      wplyw_kwota: f.wplyw_kwota === "" ? null : Number(f.wplyw_kwota),
      // Zostawiamy datę zdarzenia obok karty dnia: zdarzenie z nocnej zmiany
      // bywa wpisywane nazajutrz i wtedy godzina bez daty myli.
      data: dateStr,
    });
    setZapisuje(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[640px] my-6">
        <div className={sectionHeaderCls}>Zdarzenie — {dateStr.split("-").reverse().join(".")}</div>
        <div className="p-4 flex flex-col gap-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className={labelCls}>Kategoria</label>
              <select
                className={inputCls}
                value={f.kategoria}
                onChange={(e) => ustaw("kategoria", e.target.value)}
              >
                <option value="">— wybierz —</option>
                {KATEGORIE_ZDARZENIA.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Godzina</label>
              <input
                type="time"
                className={inputCls}
                value={f.czas}
                onChange={(e) => ustaw("czas", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Miejsce w lokalu</label>
              <input
                className={inputCls}
                placeholder="sala, kuchnia, zaplecze"
                value={f.miejsce}
                onChange={(e) => ustaw("miejsce", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Kto brał udział</label>
            {osobyNaZmianie.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {osobyNaZmianie.map((imie) => (
                  <button
                    key={imie}
                    onClick={() => przelaczOsobe(imie)}
                    className={`px-3 py-1.5 rounded border-[2px] text-[14px] font-bold ${
                      f.personel.includes(imie)
                        ? "bg-[#171714] text-white border-[#171714]"
                        : "bg-white text-[#171714] border-[#B7B6AE]"
                    }`}
                  >
                    {imie}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#6E6E66] mb-2">
                Nikt nie odbił tego dnia zmiany — wpisz uczestników w opisie.
              </p>
            )}
            <input
              className={inputCls}
              placeholder="gość — bez danych osobowych, np. „gość przy stoliku 4”"
              value={f.gosc}
              onChange={(e) => ustaw("gosc", e.target.value)}
            />
            {/* Dziennik nie jest miejscem na dane osobowe gościa: do wyjaśnienia
                sprawy wystarczy, przy którym stoliku siedział, a nazwisko byłoby
                przetwarzaniem bez podstawy. */}
            <p className="text-[12px] text-[#8F8E86] mt-1">
              Nie zapisuj nazwiska ani telefonu gościa — do wyjaśnienia sprawy nie są
              potrzebne.
            </p>
          </div>

          <div>
            <label className={labelCls}>Co się wydarzyło</label>
            <textarea
              rows={3}
              className={inputCls}
              value={f.opis}
              onChange={(e) => ustaw("opis", e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>Co zrobiono na miejscu</label>
            <textarea
              rows={2}
              className={inputCls}
              placeholder="przeprosiny, wymiana dania, wezwanie serwisu"
              value={f.dzialania}
              onChange={(e) => ustaw("dzialania", e.target.value)}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className={labelCls}>Skutek finansowy</label>
              <select
                className={inputCls}
                value={f.wplyw_typ}
                onChange={(e) => ustaw("wplyw_typ", e.target.value)}
              >
                {TYPY_WPLYWU.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Kwota (zł)</label>
              <input
                type="number"
                className={inputCls}
                disabled={!f.wplyw_typ}
                value={f.wplyw_kwota}
                onChange={(e) => ustaw("wplyw_kwota", e.target.value)}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={f.status}
                onChange={(e) => ustaw("status", e.target.value)}
              >
                <option value="zamkniete">Zamknięte na miejscu</option>
                <option value="eskalacja">Wymaga eskalacji</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Dowody</label>
              <input
                className={inputCls}
                placeholder="nr nagrania z kamery, link, oświadczenie"
                value={f.dowod}
                onChange={(e) => ustaw("dowod", e.target.value)}
              />
              {/* Same pliki dojdą razem z załącznikami w karcie dnia; na razie
                  wystarczy wskazać, gdzie dowód jest, żeby dało się go znaleźć. */}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              className="w-5 h-5"
              checked={f.wymaga_prowadzenia}
              onChange={(e) => ustaw("wymaga_prowadzenia", e.target.checked)}
            />
            wymaga dalszego prowadzenia
          </label>

          <div className="flex flex-wrap gap-2 justify-end items-center">
            {!kompletny && (
              <span className="text-[13px] mr-auto" style={{ color: COLORS.muted }}>
                Wypełnij: {brakujace.join(", ")}
              </span>
            )}
            <button className={btnSecondaryCls} onClick={onClose}>
              Anuluj
            </button>
            <button className={btnPrimaryCls} disabled={zapisuje || !kompletny} onClick={zapisz}>
              Zapisz zdarzenie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
