// @ts-nocheck
// Zamknięcie dnia przez KIEROWNIKA ZMIANY, na Tablecie Służbowym.
//
// To nie jest okrojona karta dnia — to inny ekran dla innej roli. Kierownik
// zmiany wpisuje to, co sam widział na sali, i nic poza tym:
//   - bez warstwy automatycznej (godziny, koszt pracy, obsada, zadania),
//   - bez kosztów pracy i stawek — to nie jest informacja dla tej roli,
//   - bez historii i bez innych lokali: tylko dzisiaj, tylko jego lokal.
//
// Prawo jest na czas (`users.puls_do`), więc wygasa samo. Zamknięcie idzie do
// kierownika lokalu jako powiadomienie — odpowiedzialność zostaje przy nim,
// obecność przestaje być potrzebna.
//
// Ekran pobiera własne dane (dzisiejsza karta, wpisy, szablony jednego lokalu)
// zamiast brać je przez propsy z App — patrz CLAUDE.md, błąd #16.
import React, { useEffect, useState } from "react";
import { Lock, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../../api/supabase";
import { createManagerNotification } from "../../api/notifications";
import {
  sectionCardCls,
  sectionHeaderCls,
  btnPrimaryCls,
  btnSecondaryCls,
  COLORS,
} from "./designTokens";
import {
  znajdzKarte,
  wpisyDlaDnia,
  szablonyNaDzien,
  polaSzablonu,
  opisNormy,
  pozaNorma,
  wartoscPola,
  sredniCzek,
  zapiszKarte,
  zamknijDzien,
  zapiszWpis,
  POWODY_UTARGU,
  toLocalYMD,
} from "../../utils/dziennik";
import ModalWpisu from "./ModalWpisu";
import ZdarzenieModal from "./ZdarzenieModal";

const inputCls =
  "w-full border-[2px] border-[#171714] rounded px-3 py-2 text-[16px] bg-white disabled:bg-[#F1F1EE] disabled:text-[#6E6E66]";
const labelCls = "text-[11px] font-bold tracking-wider uppercase text-[#8F8E86] mb-1 block";

// Prawo obowiązuje do końca dnia zapisanego w users.puls_do włącznie.
export const mozeZamykacPuls = (user) =>
  !!(user && user.puls_do && user.puls_do >= toLocalYMD(new Date()));

export default function PulsZmiany({ currentUser, lokal, showMsg, onBack }) {
  const dzis = toLocalYMD(new Date());
  const [karty, setKarty] = useState([]);
  const [wpisy, setWpisy] = useState([]);
  const [szablony, setSzablony] = useState([]);
  const [laduje, setLaduje] = useState(true);
  const [zapisuje, setZapisuje] = useState(false);
  const [form, setForm] = useState({});
  const [nowyWpis, setNowyWpis] = useState(null);
  const [zdarzenie, setZdarzenie] = useState(false);

  const odswiez = async () => {
    const [k, w, s] = await Promise.all([
      api.get("day_logs", `lokal=eq.${encodeURIComponent(lokal)}&date=eq.${dzis}`),
      api.get("day_log_entries", `lokal=eq.${encodeURIComponent(lokal)}&date=eq.${dzis}`),
      api.get("day_log_templates", `lokal=eq.${encodeURIComponent(lokal)}`),
    ]);
    setKarty(Array.isArray(k) ? k : []);
    setWpisy(Array.isArray(w) ? w : []);
    setSzablony(Array.isArray(s) ? s : []);
  };

  useEffect(() => {
    odswiez()
      .catch((e) => showMsg(e.message || "Nie udało się pobrać dziennika", "error"))
      .finally(() => setLaduje(false));
  }, [lokal]);

  const karta = znajdzKarte(karty, lokal, dzis);
  const zamkniety = karta && karta.status === "zamkniety";
  const pole = (k) =>
    form[k] !== undefined ? form[k] : karta && karta[k] != null ? karta[k] : "";
  const ustaw = (k, v) => setForm({ ...form, [k]: v });

  const naDzis = szablonyNaDzien(szablony, lokal, dzis);
  const wpisyDnia = wpisyDlaDnia(wpisy, lokal, dzis);
  const wpisDlaSzablonu = (klucz) => wpisyDnia.find((w) => w.template_key === klucz);
  const zrobione = naDzis.filter((s) => wpisDlaSzablonu(s.klucz)).length;
  const czek = sredniCzek(pole("obrot"), pole("liczba_paragonow"));

  const polaDoZapisu = () => ({
    obrot: pole("obrot") === "" ? null : Number(pole("obrot")),
    liczba_paragonow:
      pole("liczba_paragonow") === "" ? null : Number(pole("liczba_paragonow")),
    obrot_powod: pole("obrot_powod") || null,
    obrot_komentarz: pole("obrot_komentarz") || null,
    handover: pole("handover") || null,
    notatka: pole("notatka") || null,
  });

  const zapisz = async (zamykamy) => {
    setZapisuje(true);
    try {
      const wspolne = {
        karta, lokal, dateStr: dzis, pola: polaDoZapisu(),
        dayLogs: karty, setDayLogs: setKarty,
      };
      if (zamykamy) {
        await zamknijDzien({ ...wspolne, kto: currentUser.name });
        // Kierownik lokalu ma się dowiedzieć od razu — to on odpowiada za dzień,
        // nawet jeśli zamknął go ktoś inny.
        await createManagerNotification(
          lokal,
          // Bez odmiany przez rodzaj: "zamknął(-ęła)" czyta się źle, a strona
          // bierna mówi dokładnie to samo.
          `Puls za ${dzis.split("-").reverse().join(".")} zamknięty przez ${currentUser.name}` +
            (polaDoZapisu().obrot != null ? ` · utarg ${polaDoZapisu().obrot} zł` : ""),
          "puls"
        ).catch(() => {});
      } else {
        await zapiszKarte(wspolne);
      }
      await odswiez();
      setForm({});
      showMsg(zamykamy ? "Dzień zamknięty" : "Zapisano", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
    setZapisuje(false);
  };

  const dodajWpis = async (typ, templateKey, payload) => {
    try {
      await zapiszWpis({
        lokal, dateStr: dzis, karta, typ, templateKey, payload,
        kto: currentUser.name, entries: wpisy, setEntries: setWpisy,
      });
      await odswiez();
      setNowyWpis(null);
      setZdarzenie(false);
      showMsg("Zapisano", "success");
    } catch (e) {
      showMsg(e.message || "Błąd zapisu", "error");
    }
  };

  if (laduje) return <div className="p-4 text-[15px] text-[#6E6E66]">Ładowanie…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <div className="font-['Archivo'] font-extrabold text-[19px]">Zamknięcie dnia</div>
          <div className="text-[13px] text-[#6E6E66]">
            {lokal} · {dzis.split("-").reverse().join(".")}
          </div>
        </div>
        {onBack && (
          <button className={btnSecondaryCls + " ml-auto"} onClick={onBack}>
            Wróć
          </button>
        )}
      </div>

      {zamkniety && (
        <div className="flex items-center gap-2 bg-[#E3F0E9] border-[2px] border-[#171714] rounded-xl px-4 py-2.5 text-[14px]">
          <Lock size={16} />
          Zamknięte przez {karta.closed_by}. Poprawki wprowadza kierownik lokalu.
        </div>
      )}

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>Utarg i notatki</div>
        <div className="p-4 flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Utarg brutto (zł)</label>
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                disabled={zamkniety}
                value={pole("obrot")}
                onChange={(e) => ustaw("obrot", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Liczba paragonów</label>
              <input
                type="number"
                inputMode="numeric"
                className={inputCls}
                disabled={zamkniety}
                value={pole("liczba_paragonow")}
                onChange={(e) => ustaw("liczba_paragonow", e.target.value)}
              />
              <div className="text-[12px] text-[#6E6E66] mt-1">
                {czek != null ? `średni paragon ${czek} zł` : "policzy się sam"}
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Powód odchylenia</label>
              <select
                className={inputCls}
                disabled={zamkniety}
                value={pole("obrot_powod")}
                onChange={(e) => ustaw("obrot_powod", e.target.value)}
              >
                <option value="">— nie dotyczy —</option>
                {POWODY_UTARGU.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Komentarz</label>
              <input
                className={inputCls}
                disabled={zamkniety}
                placeholder="co konkretnie się stało"
                value={pole("obrot_komentarz")}
                onChange={(e) => ustaw("obrot_komentarz", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notatka dla następnej zmiany</label>
            <textarea
              rows={3}
              className={inputCls}
              disabled={zamkniety}
              placeholder="Co następna zmiana musi wiedzieć"
              value={pole("handover")}
              onChange={(e) => ustaw("handover", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Wpisy dnia</span>
          <span className="text-[12px] font-normal text-[#6E6E66]">
            {zrobione}/{naDzis.length}
          </span>
        </div>
        {!naDzis.length && (
          <div className="p-4 text-[14px] text-[#6E6E66]">
            Na dziś nie ma nic do wpisania.
          </div>
        )}
        {naDzis.map((s) => {
          const wpis = wpisDlaSzablonu(s.klucz);
          const alarm = wpis && pozaNorma(s, wpis.payload);
          return (
            <div
              key={s.id}
              className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0 flex flex-wrap items-center gap-3"
            >
              <div className="flex-1 min-w-[150px]">
                <div className="font-['Archivo'] font-bold text-[15px]">{s.nazwa}</div>
                <div className="text-[12px] text-[#6E6E66]">
                  {polaSzablonu(s)
                    .map((p) => [p.label, opisNormy(p)].filter(Boolean).join(" "))
                    .join(" · ")}
                </div>
              </div>
              {wpis ? (
                <div className="flex items-center gap-2">
                  <span
                    className="font-['Archivo'] font-extrabold text-[17px]"
                    style={{ color: alarm ? COLORS.accent : COLORS.ink }}
                  >
                    {polaSzablonu(s).map((p) => wartoscPola(p, wpis.payload)).join(" / ")}
                  </span>
                  {alarm ? (
                    <AlertTriangle size={18} color={COLORS.accent} />
                  ) : (
                    <CheckCircle2 size={18} color="#2C6A4F" />
                  )}
                </div>
              ) : (
                <button
                  className={btnSecondaryCls}
                  disabled={zamkniety}
                  onClick={() => setNowyWpis({ szablon: s })}
                >
                  <Plus size={14} className="inline mr-1" />
                  Wpisz
                </button>
              )}
            </div>
          );
        })}
      </div>

      {wpisyDnia.filter((w) => !w.template_key).length > 0 && (
        <div className={sectionCardCls}>
          <div className={sectionHeaderCls}>Zdarzenia</div>
          {wpisyDnia
            .filter((w) => !w.template_key)
            .map((w) => (
              <div key={w.id} className="px-4 py-3 border-b-[2px] border-[#171714] last:border-b-0">
                <div className="text-[15px]">{w.payload?.opis || "(bez opisu)"}</div>
                <div className="text-[12px] text-[#8F8E86]">{w.recorded_by}</div>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <button
          className={btnSecondaryCls}
          disabled={zamkniety}
          onClick={() => setZdarzenie(true)}
        >
          <AlertTriangle size={14} className="inline mr-1" />
          Zgłoś zdarzenie
        </button>
        <div className="ml-auto flex flex-wrap gap-3">
          <button className={btnSecondaryCls} disabled={zapisuje || zamkniety} onClick={() => zapisz(false)}>
            Zapisz
          </button>
          <button className={btnPrimaryCls} disabled={zapisuje || zamkniety} onClick={() => zapisz(true)}>
            <Lock size={14} className="inline mr-1" />
            Zamknij dzień
          </button>
        </div>
      </div>

      {nowyWpis && (
        <ModalWpisu
          szablon={nowyWpis.szablon}
          onClose={() => setNowyWpis(null)}
          onSave={dodajWpis}
        />
      )}
      {zdarzenie && (
        <ZdarzenieModal
          dateStr={dzis}
          osobyNaZmianie={[]}
          onClose={() => setZdarzenie(false)}
          onSave={dodajWpis}
        />
      )}
    </div>
  );
}
