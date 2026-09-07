// @ts-nocheck
// Konfiguracja wpisów dnia — co trzeba wpisywać w tym lokalu.
//
// Osobny widok wewnątrz zakładki Puls, tak samo jak Konfiguracja w Grafiku:
// codzienna praca i ustawienia nie mieszają się na jednym ekranie.
//
// Zestaw startowy (SZABLONY_STARTOWE) jest tu najważniejszy. W gastronomii
// mierzy się wszędzie to samo — lodówka, zamrażarka, dostawa, wydanie — więc
// nowy lokal ma być gotowy na dwa kliknięcia, a nie na kwadrans wpisywania.
import React, { useState } from "react";
import { api } from "../../api/supabase";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import {
  sectionCardCls,
  sectionHeaderCls,
  pageTitleCls,
  btnPrimaryCls,
  btnSecondaryCls,
  lokalTabCls,
} from "./designTokens";
import {
  SZABLONY_STARTOWE,
  TYPY_WPISU,
  TYPY_POLA,
  PORY,
  slugKlucza,
  zapiszSzablon,
  archiwizujSzablon,
  polaSzablonu,
  opisNormy,
} from "../../utils/dziennik";

const DNI = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[15px] bg-white";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

const pustySzablon = () => ({
  nazwa: "",
  typ: "temperatura",
  pora: "ogolne",
  days_of_week: null,
  wymagany: true,
  pola: [{ label: "", typ: "number", jednostka: "", min: "", max: "" }],
});

export default function PulsSzablony({
  lokal,
  lokaleNames,
  onZmienLokal,
  dayLogTemplates,
  setDayLogTemplates,
  onWroc,
  showMsg,
}) {
  const [edytowany, setEdytowany] = useState(null);
  const [zapisuje, setZapisuje] = useState(false);

  // Ten ekran trzyma własną listę i po każdym zapisie czyta ją z bazy.
  // Wcześniej polegał wyłącznie na setterze podanym z góry przez cztery
  // poziomy propsów — a wtedy jedno zgubione po drodze ogniwo wywracało
  // zapis, mimo że wiersz był już w bazie. Stan rodzica aktualizujemy
  // dodatkowo, żeby karta dnia od razu zobaczyła nowe wpisy; gdy settera
  // nie ma, konfiguracja i tak działa.
  const [szablony, setSzablony] = useState(dayLogTemplates || []);
  const odswiez = async () => {
    const wiersze = await api.get("day_log_templates");
    const lista = Array.isArray(wiersze) ? wiersze : [];
    setSzablony(lista);
    if (typeof setDayLogTemplates === "function") setDayLogTemplates(lista);
  };

  const moje = (szablony || [])
    .filter((s) => s.lokal === lokal && !s.archived)
    .sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
  const mamKlucz = (k) => moje.some((s) => s.klucz === k);
  const brakujace = SZABLONY_STARTOWE.filter((s) => !mamKlucz(s.klucz));

  const dodajStartowy = async (wzor) => {
    setZapisuje(true);
    try {
      await zapiszSzablon({
        szablon: { ...wzor, kolejnosc: moje.length },
        lokal,
        templates: szablony,
        setTemplates: setSzablony,
      });
      await odswiez();
      showMsg(`Dodano: ${wzor.nazwa}`, "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu szablonu", "error");
    }
    setZapisuje(false);
  };

  const zapisz = async () => {
    if (!edytowany.nazwa.trim()) return showMsg("Wpisz nazwę", "error");
    const pola = (edytowany.pola || [])
      .filter((p) => p.label.trim())
      .map((p) => ({
        klucz: p.klucz || slugKlucza(p.label),
        label: p.label.trim(),
        typ: p.typ,
        ...(p.jednostka ? { jednostka: p.jednostka } : {}),
        ...(p.min !== "" && p.min != null ? { min: Number(p.min) } : {}),
        ...(p.max !== "" && p.max != null ? { max: Number(p.max) } : {}),
      }));
    if (!pola.length) return showMsg("Dodaj przynajmniej jedno pole", "error");
    setZapisuje(true);
    try {
      await zapiszSzablon({
        szablon: { ...edytowany, pola },
        lokal,
        templates: szablony,
        setTemplates: setSzablony,
      });
      await odswiez();
      setEdytowany(null);
      showMsg("Zapisano", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu szablonu", "error");
    }
    setZapisuje(false);
  };

  const usun = async (s) => {
    try {
      await archiwizujSzablon({
        szablon: s,
        templates: szablony,
        setTemplates: setSzablony,
      });
      await odswiez();
      showMsg("Usunięto z listy", "success");
    } catch (e) {
      showMsg(e.message || "Błąd", "error");
    }
  };

  const dni = edytowany && edytowany.days_of_week
    ? edytowany.days_of_week.split(",").map(Number)
    : null;
  const przelaczDzien = (d) => {
    const teraz = dni || [0, 1, 2, 3, 4, 5, 6];
    const nowe = teraz.includes(d) ? teraz.filter((x) => x !== d) : [...teraz, d].sort();
    setEdytowany({
      ...edytowany,
      // Wszystkie dni zaznaczone = "codziennie", zapisujemy jako brak
      // ograniczenia (null), tak samo jak w zadaniach.
      days_of_week: nowe.length === 7 ? null : nowe.join(","),
    });
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnSecondaryCls} onClick={onWroc}>
          <ArrowLeft size={15} className="inline -mt-0.5 mr-1" />
          Karta dnia
        </button>
        <h2 className={pageTitleCls}>Wpisy dnia — konfiguracja</h2>
      </div>

      {lokaleNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {lokaleNames.map((n) => (
            <button key={n} className={lokalTabCls(n === lokal)} onClick={() => onZmienLokal(n)}>
              {n}
            </button>
          ))}
        </div>
      )}

      {brakujace.length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>
            <span>Szybki start</span>
            <span className="text-[12px] font-normal text-[#6E6E66]">
              typowe wpisy — kliknij, żeby dodać
            </span>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {brakujace.map((s) => (
              <button
                key={s.klucz}
                className={btnSecondaryCls}
                disabled={zapisuje}
                onClick={() => dodajStartowy(s)}
              >
                <Plus size={14} className="inline mr-1" />
                {s.nazwa}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Wpisy w lokalu {lokal}</span>
          <span className="text-[12px] font-normal text-[#6E6E66]">{moje.length}</span>
        </div>
        {!moje.length && (
          <div className="p-4 text-[14px] text-[#6E6E66]">
            Nic jeszcze nie zdefiniowano — karta dnia zbiera tylko utarg i notatki.
          </div>
        )}
        {moje.map((s) => (
          <div
            key={s.id}
            className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0 flex flex-wrap items-center gap-3"
          >
            <div className="flex-1 min-w-[220px]">
              <div className="font-['Archivo'] font-bold text-[15px]">{s.nazwa}</div>
              <div className="text-[12px] text-[#6E6E66]">
                {polaSzablonu(s)
                  .map((p) => [p.label, opisNormy(p)].filter(Boolean).join(" "))
                  .join(" · ")}
              </div>
            </div>
            <div className="text-[12px] text-[#6E6E66] w-[150px]">
              {(PORY.find((p) => p.key === s.pora) || {}).label || "Dowolna pora"}
              {s.days_of_week
                ? " · " + s.days_of_week.split(",").map((d) => DNI[Number(d)]).join(" ")
                : " · codziennie"}
            </div>
            <button className={btnSecondaryCls} onClick={() => setEdytowany(s)}>
              Zmień
            </button>
            <button
              className="text-[#DE3A22] px-2"
              title="Usuń z listy"
              onClick={() => usun(s)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="p-4">
          <button className={btnPrimaryCls} onClick={() => setEdytowany(pustySzablon())}>
            <Plus size={14} className="inline mr-1" />
            Własny wpis
          </button>
        </div>
      </div>

      {edytowany && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl border-[2.5px] border-[#171714] w-full max-w-[620px] my-6">
            <div className={sectionHeaderCls}>
              {edytowany.id ? "Zmień wpis" : "Nowy wpis"}
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className={labelCls}>Nazwa</label>
                  <input
                    className={inputCls}
                    placeholder="Lodówka w barze"
                    value={edytowany.nazwa}
                    onChange={(e) => setEdytowany({ ...edytowany, nazwa: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Rodzaj</label>
                  <select
                    className={inputCls}
                    value={edytowany.typ}
                    onChange={(e) => setEdytowany({ ...edytowany, typ: e.target.value })}
                  >
                    {TYPY_WPISU.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Kiedy</label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={inputCls + " w-auto"}
                    value={edytowany.pora}
                    onChange={(e) => setEdytowany({ ...edytowany, pora: e.target.value })}
                  >
                    {PORY.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {DNI.map((etykieta, d) => {
                    const wlaczony = !dni || dni.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => przelaczDzien(d)}
                        className={`w-10 h-10 rounded border-[2px] font-bold text-[13px] ${
                          wlaczony
                            ? "bg-[#171714] text-white border-[#171714]"
                            : "bg-white text-[#8F8E86] border-[#B7B6AE]"
                        }`}
                      >
                        {etykieta}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={labelCls}>Co się wpisuje</label>
                <div className="flex flex-col gap-2">
                  {(edytowany.pola || []).map((p, i) => (
                    <div key={i} className="flex flex-wrap gap-2 items-center">
                      <input
                        className={inputCls + " flex-1 min-w-[140px]"}
                        placeholder="Nazwa pola, np. Temperatura"
                        value={p.label}
                        onChange={(e) => {
                          const pola = [...edytowany.pola];
                          pola[i] = { ...p, label: e.target.value };
                          setEdytowany({ ...edytowany, pola });
                        }}
                      />
                      <select
                        className={inputCls + " w-auto"}
                        value={p.typ}
                        onChange={(e) => {
                          const pola = [...edytowany.pola];
                          pola[i] = { ...p, typ: e.target.value };
                          setEdytowany({ ...edytowany, pola });
                        }}
                      >
                        {TYPY_POLA.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      {p.typ === "number" && (
                        <>
                          <input
                            className={inputCls + " w-[70px]"}
                            placeholder="jedn."
                            value={p.jednostka || ""}
                            onChange={(e) => {
                              const pola = [...edytowany.pola];
                              pola[i] = { ...p, jednostka: e.target.value };
                              setEdytowany({ ...edytowany, pola });
                            }}
                          />
                          <input
                            className={inputCls + " w-[70px]"}
                            type="number"
                            placeholder="od"
                            value={p.min ?? ""}
                            onChange={(e) => {
                              const pola = [...edytowany.pola];
                              pola[i] = { ...p, min: e.target.value };
                              setEdytowany({ ...edytowany, pola });
                            }}
                          />
                          <input
                            className={inputCls + " w-[70px]"}
                            type="number"
                            placeholder="do"
                            value={p.max ?? ""}
                            onChange={(e) => {
                              const pola = [...edytowany.pola];
                              pola[i] = { ...p, max: e.target.value };
                              setEdytowany({ ...edytowany, pola });
                            }}
                          />
                        </>
                      )}
                      <button
                        className="text-[#DE3A22] px-1"
                        onClick={() =>
                          setEdytowany({
                            ...edytowany,
                            pola: edytowany.pola.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="text-[13px] underline text-[#6E6E66] mt-2"
                  onClick={() =>
                    setEdytowany({
                      ...edytowany,
                      pola: [
                        ...(edytowany.pola || []),
                        { label: "", typ: "number", jednostka: "", min: "", max: "" },
                      ],
                    })
                  }
                >
                  + kolejne pole
                </button>
                <p className="text-[12px] text-[#6E6E66] mt-2">
                  „od” i „do” to normy — wartość poza nimi zaświeci się w karcie dnia
                  na czerwono. Zostaw puste, jeśli normy nie ma.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button className={btnSecondaryCls} onClick={() => setEdytowany(null)}>
                  Anuluj
                </button>
                <button className={btnPrimaryCls} disabled={zapisuje} onClick={zapisz}>
                  Zapisz
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
