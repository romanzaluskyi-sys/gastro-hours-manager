// @ts-nocheck
// Puls → Konfiguracja. Układ z makiety właściciela (0.57.0, PulseConfig):
// dwie zakładki — "Wpisy dnia" (co się codziennie mierzy, pogrupowane po porze,
// edycja w panelu z boku) i "Kto zamyka dzień" (prawo na czas: na dziś / na
// tydzień, wygasa samo).
//
// Zestaw startowy (SZABLONY_STARTOWE) — w gastronomii mierzy się wszędzie to
// samo, więc nowy lokal ma być gotowy na dwa kliknięcia.
//
// ⚠️ Prawo do zamykania dnia to `users.puls_do` — to samo pole co w karcie
// pracownika (drugie wejście, bo nadawanie na dziś to decyzja podejmowana co
// rano). Pracownik z tym prawem widzi na Tablecie tylko dzisiejsze wpisy i
// utarg, bez historii i finansów (PulsZmiany.tsx).
// ⚠️ Szablon się ARCHIWIZUJE, nie kasuje — wpisy sprzed miesięcy odwołują się
// do niego przez template_key.
import React, { useState } from "react";
import { api } from "../../api/supabase";
import { Plus, Trash2, Copy, Pencil, Thermometer, Check } from "lucide-react";
import { toLocalYMD } from "../../utils/dziennik";
import { mozeZamykacPuls } from "./PulsZmiany";
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
import {
  kartaCls,
  inputCls,
  podpowiedzCls,
  btnObrysCls,
  btnGlownyCls,
  btnMalyCls,
  Panel,
  Chip,
  MiniTag,
  Pole,
  PanelBoczny,
} from "./pulsWspolne";

const DNI_UI = [1, 2, 3, 4, 5, 6, 0];
const DN = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
const ikonaBtnCls =
  "w-10 h-10 rounded-lg border-[2px] border-[#DEDCD4] bg-white grid place-items-center text-[#171714] hover:border-[#171714] flex-shrink-0 disabled:opacity-30";

const pustePole = () => ({ label: "", typ: "number", jednostka: "°C", min: "", max: "" });
const pustySzablon = () => ({
  nazwa: "",
  typ: "temperatura",
  pora: "poranne",
  days_of_week: null,
  wymagany: true,
  pola: [pustePole()],
});
const dniTxt = (d) => {
  if (!d) return "codziennie";
  const lista = String(d).split(",").map(Number);
  if (lista.length === 7) return "codziennie";
  return DNI_UI.filter((x) => lista.includes(x)).map((x) => DN[x]).join(", ");
};

export default function PulsSzablony({ lokal, dayLogTemplates, onZmiana, users = [], setUsers, currentUser, showMsg }) {
  const [zakladka, setZakladka] = useState("wpisy");
  const [edytowany, setEdytowany] = useState(null);
  const [zapisuje, setZapisuje] = useState(false);
  // Ten ekran trzyma własną listę i po każdym zapisie czyta ją z bazy, a wynik
  // oddaje rodzicowi jednym krokiem (onZmiana).
  const [szablony, setSzablony] = useState(dayLogTemplates || []);
  const odswiez = async () => {
    const wiersze = await api.get("day_log_templates");
    const lista = Array.isArray(wiersze) ? wiersze : [];
    setSzablony(lista);
    if (typeof onZmiana === "function") onZmiana(lista);
  };

  const [ludzieLokalni, setLudzieLokalni] = useState(null);
  const ludzie = ludzieLokalni || users || [];
  const [dostepBusy, setDostepBusy] = useState(null);
  const zespol = ludzie
    .filter(
      (u) =>
        u.active &&
        !u.archived &&
        u.role !== "kiosk" &&
        !["admin", "manager", "manager_lokalu"].includes(u.role) &&
        (u.default_lokal === lokal || String(u.allowed_lokale || "").split(",").map((x) => x.trim()).includes(lokal))
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const dzis = toLocalYMD(new Date());
  // "Na tydzień" = do niedzieli tego tygodnia (w niedzielę — do niedzieli za tydzień).
  const doNiedzieli = (() => {
    const d = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? 7 : 7 - dow));
    return toLocalYMD(d);
  })();
  const zmienDostep = async (u, doDnia) => {
    setDostepBusy(u.id);
    try {
      const zapisany = await api.patch("users", u.id, { puls_do: doDnia });
      const nowa = ludzie.map((x) => (x.id === u.id ? { ...x, ...zapisany } : x));
      setLudzieLokalni(nowa);
      if (typeof setUsers === "function") setUsers(nowa);
      showMsg(doDnia ? `${u.name} może zamykać dzień do ${doDnia.split("-").reverse().join(".")}` : `${u.name} nie może już zamykać dnia`, "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
    setDostepBusy(null);
  };
  const opisPrawa = (u) =>
    u.puls_do === dzis
      ? "na dziś · do 23:59"
      : `do ${["nd", "pn", "wt", "śr", "czw", "pt", "sob"][new Date(`${u.puls_do}T00:00:00`).getDay()]} ${u.puls_do.slice(8, 10)}.${u.puls_do.slice(5, 7)}`;

  const moje = (szablony || []).filter((s) => s.lokal === lokal && !s.archived).sort((a, b) => (a.kolejnosc || 0) - (b.kolejnosc || 0));
  const brakujace = SZABLONY_STARTOWE.filter((s) => !moje.some((m) => m.klucz === s.klucz));

  const dodajStartowy = async (wzor) => {
    setZapisuje(true);
    try {
      await zapiszSzablon({ szablon: { ...wzor, kolejnosc: moje.length }, lokal, templates: szablony, setTemplates: setSzablony });
      await odswiez();
      showMsg(`Dodano: ${wzor.nazwa}`, "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu szablonu", "error");
    }
    setZapisuje(false);
  };

  const otworz = (s) =>
    setEdytowany({
      ...s,
      pola: polaSzablonu(s).length
        ? polaSzablonu(s).map((p) => ({ ...p, jednostka: p.jednostka || "", min: p.min ?? "", max: p.max ?? "" }))
        : [pustePole()],
    });

  const zapisz = async () => {
    if (!edytowany.nazwa.trim()) return showMsg("Wpisz nazwę", "error");
    const pola = (edytowany.pola || [])
      .filter((p) => String(p.label || "").trim())
      .map((p) => ({
        klucz: p.klucz || slugKlucza(p.label),
        label: p.label.trim(),
        typ: p.typ,
        ...(p.jednostka ? { jednostka: p.jednostka } : {}),
        ...(p.typ === "number" && p.min !== "" && p.min != null ? { min: Number(String(p.min).replace(",", ".")) } : {}),
        ...(p.typ === "number" && p.max !== "" && p.max != null ? { max: Number(String(p.max).replace(",", ".")) } : {}),
      }));
    if (!pola.length) return showMsg("Dodaj przynajmniej jedno pole", "error");
    setZapisuje(true);
    try {
      await zapiszSzablon({ szablon: { ...edytowany, pola }, lokal, templates: szablony, setTemplates: setSzablony });
      await odswiez();
      setEdytowany(null);
      showMsg("Zapisano", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu szablonu", "error");
    }
    setZapisuje(false);
  };

  const archiwizuj = async () => {
    setZapisuje(true);
    try {
      await archiwizujSzablon({ szablon: edytowany, templates: szablony, setTemplates: setSzablony });
      await odswiez();
      setEdytowany(null);
      showMsg("Wpis zarchiwizowany — historia zostaje.", "success");
    } catch (e) {
      showMsg(e.message || "Błąd", "error");
    }
    setZapisuje(false);
  };

  const dni = edytowany && edytowany.days_of_week ? String(edytowany.days_of_week).split(",").map(Number) : [0, 1, 2, 3, 4, 5, 6];
  const przelaczDzien = (d) => {
    const nowe = dni.includes(d) ? (dni.length > 1 ? dni.filter((x) => x !== d) : dni) : [...dni, d].sort();
    // Wszystkie dni = "codziennie" = null, tak samo jak w zadaniach.
    setEdytowany({ ...edytowany, days_of_week: nowe.length === 7 ? null : nowe.join(",") });
  };
  const zmienPole = (idx, zmiany) => {
    const pola = [...edytowany.pola];
    pola[idx] = { ...pola[idx], ...zmiany };
    setEdytowany({ ...edytowany, pola });
  };

  const aktywni = zespol.filter(mozeZamykacPuls);
  const reszta = zespol.filter((u) => !mozeZamykacPuls(u));

  return (
    <div className="flex flex-col gap-4" data-puls-konfiguracja>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border-[2px] border-[#171714] overflow-hidden">
          {[
            ["wpisy", `Wpisy dnia · ${moje.length}`],
            ["kto", "Kto zamyka dzień"],
          ].map(([k, l], i) => (
            <button
              key={k}
              type="button"
              onClick={() => setZakladka(k)}
              className={`h-10 px-4 text-[14px] font-bold ${i ? "border-l-[2px] border-[#171714]" : ""} ${
                zakladka === k ? "bg-[#171714] text-white" : "bg-white hover:bg-[#F6F5F1]"
              }`}
              data-zakladka-cfg-pulsu={k}
            >
              {l}
            </button>
          ))}
        </div>
        {zakladka === "wpisy" && (
          <button type="button" className={`${btnGlownyCls} ml-auto`} onClick={() => setEdytowany(pustySzablon())} data-wlasny-wpis>
            <Plus size={17} /> Własny wpis
          </button>
        )}
      </div>

      {zakladka === "wpisy" ? (
        <>
          <p className={`${podpowiedzCls} m-0`}>
            Wpisy to rzeczy mierzone codziennie (temperatury, dostawy). Zadanie z Zadań może zamykać wpis — wtedy nikt nie mierzy drugi raz.
          </p>
          {!moje.length && (
            <div className={`${kartaCls} px-5 py-8 text-center`}>
              <b className="block font-['Archivo'] font-extrabold text-lg">Brak wpisów</b>
              <span className={podpowiedzCls}>Karta dnia zbiera wtedy tylko utarg i notatki. Zacznij od gotowego zestawu niżej.</span>
            </div>
          )}
          {PORY.map((p) => {
            const lista = moje.filter((s) => (s.pora || "ogolne") === p.key);
            if (!lista.length) return null;
            return (
              <Panel key={p.key} tytul={p.label} prawo={lista.length} id={`pora-${p.key}`}>
                {lista.map((s) => (
                  <div key={s.id} className="flex items-start gap-3 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-szablon-cfg={s.klucz}>
                    <div className="flex-1 min-w-0">
                      <b className="text-[15px]">{s.nazwa}</b>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {polaSzablonu(s).map((pl) => (
                          <MiniTag key={pl.klucz}>
                            {s.typ === "temperatura" && <Thermometer size={11} />}
                            {pl.label}
                            {opisNormy(pl) ? ` · norma ${opisNormy(pl)}` : ""}
                          </MiniTag>
                        ))}
                        <MiniTag>{dniTxt(s.days_of_week)}</MiniTag>
                        {s.wymagany === false && <MiniTag>nieobowiązkowy</MiniTag>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={ikonaBtnCls}
                      title="Kopiuj wpis"
                      aria-label="Kopiuj wpis"
                      onClick={() =>
                        // Kilka lodówek o tych samych normach — kopia oszczędza
                        // wpisywanie po raz piąty. Bez id i klucza = nowa pozycja.
                        otworz({ ...s, id: undefined, klucz: undefined, nazwa: `${s.nazwa} (kopia)`, kolejnosc: moje.length })
                      }
                    >
                      <Copy size={15} />
                    </button>
                    <button type="button" className={ikonaBtnCls} aria-label="Edytuj wpis" onClick={() => otworz(s)} data-edytuj-szablon>
                      <Pencil size={15} />
                    </button>
                  </div>
                ))}
              </Panel>
            );
          })}
          {brakujace.length > 0 && (
            <Panel tytul="Szybki start" prawo="typowe wpisy">
              <div className="flex gap-2 flex-wrap px-4 md:px-[18px] py-3.5">
                {brakujace.map((s) => (
                  <button key={s.klucz} type="button" className={btnMalyCls} disabled={zapisuje} onClick={() => dodajStartowy(s)}>
                    <Plus size={15} /> {s.nazwa}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </>
      ) : (
        <>
          <Panel tytul="Mogą zamykać dzień" prawo="prawo wygasa samo" id="moga-zamykac">
            <div className="flex items-center gap-3 px-4 md:px-[18px] py-3">
              <div className="flex-1">
                <b>{currentUser?.name || "Kierownik"}</b> <MiniTag>kierownik</MiniTag>
                <div className={podpowiedzCls}>zawsze · widzi finanse i historię</div>
              </div>
            </div>
            {aktywni.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4]" data-prawo-zamykania={u.name}>
                <div className="flex-1 min-w-0">
                  <b>{u.name}</b>
                  <div className="text-[13px] font-bold text-[#1F7A4A]">{opisPrawa(u)}</div>
                </div>
                <button type="button" className={btnMalyCls} disabled={dostepBusy === u.id} onClick={() => zmienDostep(u, null)} data-odbierz-prawo>
                  Odbierz
                </button>
              </div>
            ))}
          </Panel>
          <Panel tytul="Dodaj prawo" prawo="tablet lub własny telefon · tylko wpisy i utarg dnia, bez historii" id="dodaj-prawo">
            {reszta.length === 0 && <p className={`${podpowiedzCls} m-0 px-4 md:px-[18px] py-3`}>Wszyscy z lokalu mają już prawo.</p>}
            {reszta.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 md:px-[18px] py-3 border-t-[1.5px] border-[#DEDCD4] first:border-t-0" data-bez-prawa={u.name}>
                <div className="flex-1 min-w-[140px]">
                  <b>{u.name}</b>
                  {u.puls_do && <div className={podpowiedzCls}>prawo wygasło {u.puls_do.split("-").reverse().join(".")}</div>}
                </div>
                <button type="button" className={btnMalyCls} disabled={dostepBusy === u.id} onClick={() => zmienDostep(u, dzis)} data-nadaj-dzis>
                  Na dziś
                </button>
                <button type="button" className={btnMalyCls} disabled={dostepBusy === u.id} onClick={() => zmienDostep(u, doNiedzieli)} data-nadaj-tydzien>
                  Na tydzień
                </button>
              </div>
            ))}
          </Panel>
        </>
      )}

      {edytowany && (
        <PanelBoczny
          id="szablon"
          tytul={edytowany.id ? "Zmień wpis" : "Własny wpis"}
          podtytul={lokal}
          onClose={() => setEdytowany(null)}
          stopka={
            <>
              {edytowany.id && (
                <button type="button" onClick={archiwizuj} disabled={zapisuje} className="h-10 px-2 rounded-lg text-[14px] font-bold text-[#DE3A22] hover:bg-[#FAEAE6]">
                  Archiwizuj
                </button>
              )}
              <span className="flex-1" />
              <button type="button" className={btnObrysCls} onClick={() => setEdytowany(null)}>
                Anuluj
              </button>
              <button type="button" className={btnGlownyCls} disabled={zapisuje} onClick={zapisz} data-zapisz-szablon>
                <Check size={17} /> Zapisz
              </button>
            </>
          }
        >
          <Pole etykieta="Nazwa">
            <input className={inputCls} value={edytowany.nazwa} onChange={(e) => setEdytowany({ ...edytowany, nazwa: e.target.value })} placeholder="np. Lodówka 1 (sosy)" />
          </Pole>
          <Pole etykieta="Rodzaj">
            <div className="flex gap-1.5 flex-wrap">
              {TYPY_WPISU.filter((t) => t.key !== "incydent").map((t) => (
                <Chip key={t.key} wlaczony={edytowany.typ === t.key} onClick={() => setEdytowany({ ...edytowany, typ: t.key })}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </Pole>
          <Pole etykieta={`Kiedy · ${dniTxt(edytowany.days_of_week)}`}>
            <div className="flex w-full rounded-lg border-[2px] border-[#171714] overflow-hidden">
              {PORY.map((p, i) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setEdytowany({ ...edytowany, pora: p.key })}
                  className={`flex-1 h-11 px-1 text-[13px] font-bold ${i ? "border-l-[2px] border-[#171714]" : ""} ${
                    (edytowany.pora || "ogolne") === p.key ? "bg-[#171714] text-white" : "bg-white hover:bg-[#F6F5F1]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DNI_UI.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => przelaczDzien(d)}
                  className={`h-11 rounded-lg border-[2px] font-bold text-[14px] ${
                    dni.includes(d) ? "bg-[#171714] border-[#171714] text-white" : "bg-white border-[#171714] hover:bg-[#F6F5F1]"
                  }`}
                >
                  {DN[d]}
                </button>
              ))}
            </div>
          </Pole>
          <button
            type="button"
            onClick={() => setEdytowany({ ...edytowany, wymagany: edytowany.wymagany === false })}
            className="flex items-center gap-3 text-left text-[14px] font-semibold"
          >
            <span
              className={`relative w-11 h-[26px] rounded-full border-[2px] flex-shrink-0 transition-colors ${
                edytowany.wymagany !== false ? "bg-[#1F7A4A] border-[#1F7A4A]" : "bg-[#ECEBE6] border-[#171714]"
              }`}
            >
              <i
                className={`absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all ${
                  edytowany.wymagany !== false ? "left-[20px] bg-white" : "left-[2px] bg-[#171714]"
                }`}
              />
            </span>
            Obowiązkowy — bez niego pasek zamknięcia pokazuje, że czegoś brakuje
          </button>
          <Pole etykieta="Pola i norma" podpowiedz="Wartość poza min–max świeci się na czerwono i jednym kliknięciem trafia do Moich zadań.">
            {edytowany.pola.map((p, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_110px_70px_70px_70px_40px] gap-2 items-center">
                <input className={inputCls} placeholder="Nazwa pola, np. Temperatura" value={p.label} onChange={(e) => zmienPole(idx, { label: e.target.value })} />
                <select className={inputCls} value={p.typ} onChange={(e) => zmienPole(idx, { typ: e.target.value })}>
                  {TYPY_POLA.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input className={inputCls} placeholder="°C" value={p.jednostka} onChange={(e) => zmienPole(idx, { jednostka: e.target.value })} />
                <input className={`${inputCls} tabular-nums`} placeholder="min" inputMode="decimal" disabled={p.typ !== "number"} value={p.min} onChange={(e) => zmienPole(idx, { min: e.target.value })} />
                <input className={`${inputCls} tabular-nums`} placeholder="max" inputMode="decimal" disabled={p.typ !== "number"} value={p.max} onChange={(e) => zmienPole(idx, { max: e.target.value })} />
                <button
                  type="button"
                  className={ikonaBtnCls}
                  disabled={edytowany.pola.length < 2}
                  onClick={() => setEdytowany({ ...edytowany, pola: edytowany.pola.filter((_, i) => i !== idx) })}
                  aria-label="Usuń pole"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className={`${btnMalyCls} self-start`} onClick={() => setEdytowany({ ...edytowany, pola: [...edytowany.pola, pustePole()] })}>
              <Plus size={15} /> Dodaj pole
            </button>
          </Pole>
        </PanelBoczny>
      )}
    </div>
  );
}
