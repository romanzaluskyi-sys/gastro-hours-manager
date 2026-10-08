// @ts-nocheck
// Zgłoszenie zdarzenia — skarga, konflikt, wypadek, awaria, kontrola.
// Od 0.57.0 panel z boku (na telefonie arkusz od dołu), makieta PulseCard.
//
// Poprzednia wersja miała jedno pole "co się wydarzyło" i dlatego nie
// wypełniał go nikt: żeby taki opis był do czegoś przydatny miesiąc później,
// trzeba było z siebie wykrzesać całą strukturę za każdym razem. Tutaj
// strukturę daje formularz, a kierownik tylko odpowiada.
//
// Wymagamy dwóch rzeczy: kategorii i opisu. Reszta bywa nieznana w chwili
// zdarzenia, a formularz, którego nie da się zamknąć bez kompletu, kończy tak
// samo jak poprzedni — pusty.
//
// ⚠️ Używa go też ekran zamknięcia dnia na Tablecie (PulsZmiany.tsx) —
// kształt onSave("incydent", null, payload) i pola payloadu się nie zmieniają.
// Tam idzie z `prosty` (0.73.0, makieta EmployeeCloseDayMobile): skutek
// finansowy chipami, bez „Status” i „Dowody”, a przełącznik prowadzenia to
// „Przekaż kierownikowi” — ustawia OBA pola (status „eskalacja” i
// wymaga_prowadzenia), bo osoba z sali nie rozróżnia tych dwóch rzeczy.
import React, { useState } from "react";
import { Check } from "lucide-react";
import { KATEGORIE_ZDARZENIA } from "../../utils/dziennik";
import { PanelBoczny, Pole, Chip, inputCls, podpowiedzCls, btnObrysCls, btnGlownyCls } from "./pulsWspolne";

const TYPY_WPLYWU = [
  { key: "", label: "brak" },
  { key: "rekompensata", label: "Rekompensata dla gościa" },
  { key: "zwrot", label: "Zwrot za rachunek" },
  { key: "szkoda", label: "Koszt szkody" },
];
const MIEJSCA = ["sala", "kuchnia", "zaplecze", "na zewnątrz"];

export default function ZdarzenieModal({ dateStr, osobyNaZmianie = [], onClose, onSave, prosty = false }) {
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
  const ustaw = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const brakujace = [!f.kategoria && "kategoria", !f.opis.trim() && "opis"].filter(Boolean);
  const kompletny = !brakujace.length;

  const przelaczOsobe = (imie) =>
    ustaw("personel", f.personel.includes(imie) ? f.personel.filter((x) => x !== imie) : [...f.personel, imie]);

  const zapisz = async () => {
    if (!kompletny) return;
    setZapisuje(true);
    await onSave("incydent", null, {
      ...f,
      personel: f.personel.join(", "),
      wplyw_kwota: f.wplyw_kwota === "" ? null : Number(String(f.wplyw_kwota).replace(",", ".")),
      // Zostawiamy datę zdarzenia obok karty dnia: zdarzenie z nocnej zmiany
      // bywa wpisywane nazajutrz i wtedy godzina bez daty myli.
      data: dateStr,
    });
    setZapisuje(false);
  };

  return (
    <PanelBoczny
      id="zdarzenie"
      srodek={prosty}
      tytul="Zgłoś zdarzenie"
      podtytul={`${dateStr.split("-").reverse().join(".")} · zapisuje się osobno, nie blokuje zamknięcia dnia`}
      onClose={onClose}
      stopka={
        <>
          <span className={`${podpowiedzCls} mr-auto`}>{kompletny ? "" : `Wypełnij: ${brakujace.join(", ")}`}</span>
          <button type="button" className={btnObrysCls} onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className={btnGlownyCls} disabled={zapisuje || !kompletny} onClick={zapisz} data-zapisz-zdarzenie>
            <Check size={17} /> Zapisz zdarzenie
          </button>
        </>
      }
    >
      <Pole etykieta={prosty ? "Co się stało" : "Kategoria"}>
        <div className="flex gap-1.5 flex-wrap">
          {KATEGORIE_ZDARZENIA.map((k) => (
            <Chip key={k.key} wlaczony={f.kategoria === k.key} onClick={() => ustaw("kategoria", k.key)} data-kategoria-zdarzenia={k.key}>
              {k.label}
            </Chip>
          ))}
        </div>
      </Pole>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4">
        <Pole etykieta="Godzina">
          <input type="time" className={`${inputCls} tabular-nums`} value={f.czas} onChange={(e) => ustaw("czas", e.target.value)} />
        </Pole>
        <Pole etykieta="Miejsce">
          <div className="flex gap-1.5 flex-wrap">
            {MIEJSCA.map((m) => (
              <Chip key={m} wlaczony={f.miejsce === m} onClick={() => ustaw("miejsce", f.miejsce === m ? "" : m)}>
                {m}
              </Chip>
            ))}
          </div>
        </Pole>
      </div>
      <Pole
        etykieta="Kto brał udział"
        podpowiedz="Gość bez danych osobowych — np. „gość przy stoliku 4”. Nazwisko ani telefon nie są potrzebne do wyjaśnienia sprawy."
      >
        {osobyNaZmianie.length > 0 ? (
          <div className="flex gap-1.5 flex-wrap">
            {osobyNaZmianie.map((imie) => (
              <Chip key={imie} wlaczony={f.personel.includes(imie)} onClick={() => przelaczOsobe(imie)}>
                {imie}
              </Chip>
            ))}
          </div>
        ) : (
          <span className={podpowiedzCls}>Nikt nie odbił tego dnia zmiany — wpisz uczestników w opisie.</span>
        )}
        <input className={inputCls} placeholder="gość, np. „gość przy stoliku 4”" value={f.gosc} onChange={(e) => ustaw("gosc", e.target.value)} />
      </Pole>
      <Pole etykieta={prosty ? "Opis" : "Co się wydarzyło"}>
        <textarea className={`${inputCls} h-24 py-2`} value={f.opis} onChange={(e) => ustaw("opis", e.target.value)} data-opis-zdarzenia />
      </Pole>
      <Pole etykieta={prosty ? "Co zrobiono na miejscu · opcjonalnie" : "Co zrobiono na miejscu"}>
        <input
          className={inputCls}
          placeholder="przeprosiny, wymiana dania, wezwanie serwisu"
          value={f.dzialania}
          onChange={(e) => ustaw("dzialania", e.target.value)}
        />
      </Pole>
      {prosty ? (
        <Pole etykieta="Skutek finansowy">
          <div className="flex gap-1.5 flex-wrap">
            {TYPY_WPLYWU.map((w) => (
              <Chip
                key={w.key || "brak"}
                wlaczony={f.wplyw_typ === w.key}
                onClick={() => setF((x) => ({ ...x, wplyw_typ: w.key, wplyw_kwota: w.key ? x.wplyw_kwota : "" }))}
              >
                {w.label}
              </Chip>
            ))}
          </div>
          {f.wplyw_typ && (
            <div className="relative w-[160px]">
              <input
                className={`${inputCls} pr-10 tabular-nums`}
                inputMode="decimal"
                placeholder="kwota"
                value={f.wplyw_kwota}
                onChange={(e) => ustaw("wplyw_kwota", e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E66] font-bold pointer-events-none">zł</span>
            </div>
          )}
        </Pole>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
        <Pole etykieta="Skutek finansowy">
          <select className={`${inputCls} font-semibold`} value={f.wplyw_typ} onChange={(e) => ustaw("wplyw_typ", e.target.value)}>
            {TYPY_WPLYWU.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </Pole>
        <Pole etykieta="Kwota">
          <div className="relative">
            <input
              className={`${inputCls} pr-10 tabular-nums`}
              inputMode="decimal"
              disabled={!f.wplyw_typ}
              value={f.wplyw_kwota}
              onChange={(e) => ustaw("wplyw_kwota", e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6E6E66] font-bold pointer-events-none">zł</span>
          </div>
        </Pole>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Pole etykieta="Status">
          <div className="flex gap-1.5 flex-wrap">
            <Chip wlaczony={f.status === "zamkniete"} onClick={() => ustaw("status", "zamkniete")}>
              zamknięte na miejscu
            </Chip>
            <Chip wlaczony={f.status === "eskalacja"} onClick={() => ustaw("status", "eskalacja")}>
              wymaga eskalacji
            </Chip>
          </div>
        </Pole>
        <Pole etykieta="Dowody">
          <input className={inputCls} placeholder="nr nagrania, zdjęcie, link" value={f.dowod} onChange={(e) => ustaw("dowod", e.target.value)} />
        </Pole>
      </div>
      </>
      )}
      {prosty ? (
        <button
          type="button"
          onClick={() =>
            setF((x) => ({
              ...x,
              wymaga_prowadzenia: !x.wymaga_prowadzenia,
              status: x.wymaga_prowadzenia ? "zamkniete" : "eskalacja",
            }))
          }
          className={`flex items-start gap-3 text-left rounded-xl border-[2px] px-3.5 py-3 ${
            f.wymaga_prowadzenia ? "border-[#171714] bg-[#F6F5F1]" : "border-[#DEDCD4] bg-white"
          }`}
          data-przekaz-kierownikowi
        >
          <span
            className={`mt-0.5 w-6 h-6 rounded-md border-[2px] border-[#171714] grid place-items-center flex-shrink-0 ${
              f.wymaga_prowadzenia ? "bg-[#171714] text-white" : "bg-white"
            }`}
          >
            {f.wymaga_prowadzenia && <Check size={15} strokeWidth={3} />}
          </span>
          <span>
            <b className="block text-[15px]">Przekaż kierownikowi</b>
            <span className={podpowiedzCls}>
              dostanie wiadomość i sprawa trafi do jego zadań; bez tego zgłoszenie jest zamknięte na miejscu
            </span>
          </span>
        </button>
      ) : (
      <button
        type="button"
        onClick={() => ustaw("wymaga_prowadzenia", !f.wymaga_prowadzenia)}
        className="flex items-center gap-3 text-left text-[14px] font-semibold"
        data-wymaga-prowadzenia
      >
        <span
          className={`relative w-11 h-[26px] rounded-full border-[2px] flex-shrink-0 transition-colors ${
            f.wymaga_prowadzenia ? "bg-[#1F7A4A] border-[#1F7A4A]" : "bg-[#ECEBE6] border-[#171714]"
          }`}
        >
          <i
            className={`absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all ${
              f.wymaga_prowadzenia ? "left-[20px] bg-white" : "left-[2px] bg-[#171714]"
            }`}
          />
        </span>
        Wymaga dalszego prowadzenia — w panelu trafi do Moich zadań
      </button>
      )}
    </PanelBoczny>
  );
}
