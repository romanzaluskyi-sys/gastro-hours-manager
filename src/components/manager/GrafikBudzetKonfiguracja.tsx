// @ts-nocheck
// Grafik → Konfiguracja → "Budżet": oczekiwany utarg i docelowy % kosztu pracy
// na każdy dzień tygodnia, wersjonowane miesięcznie — dokładnie tak samo jak
// wymagania obsady obok, bo to ta sama decyzja podejmowana w tym samym rytmie.
//
// Dwa poziomy, i tylko dwa:
//   ZESTAW   — reguła na typowy wtorek, obowiązuje od swojego miesiąca w przód
//   WYJĄTEK  — jedna konkretna data, np. sylwester albo koncert w mieście
//
// Wyjątek nadpisuje POLE PO POLU: można zmienić sam utarg i zostawić procent z
// zestawu. Ta sama tabela zasila olówek w siatce "Wg budżetu" — dzień zmieniony
// tam pokazuje się tutaj i odwrotnie, bo to jedna rzecz, a nie dwie.
import React, { useState } from "react";
import { Plus, Trash2, Copy, History } from "lucide-react";
import {
  sectionCardCls,
  sectionHeaderCls,
  btnPrimaryCls,
  btnSecondaryCls,
  statLabelCls,
} from "./designTokens";
import {
  utworzZestaw,
  usunZestaw,
  zapiszCel,
  zapiszNadpisanieDnia,
  usunNadpisanieDnia,
  budzetSetyLokalu,
  findBudzetSetForDate,
  wierszeZestawu,
  sredniUtargDnia,
  zl,
} from "../../utils/budzet";
import { addDaysYMD, toLocalYMD } from "../../utils/grafik";

const DNI = [
  { idx: 1, label: "Pon" },
  { idx: 2, label: "Wt" },
  { idx: 3, label: "Śr" },
  { idx: 4, label: "Czw" },
  { idx: 5, label: "Pt" },
  { idx: 6, label: "Sob" },
  { idx: 0, label: "Nd" },
];

// ⚠️ Safari i Firefox degradują <input type="month"> do zwykłego tekstu, więc
// miesiąc wybiera się dwoma <select> — ta sama ostrożność co w GrafikWymagania.
const MIESIACE = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

const monthLabel = (ymd) =>
  ymd ? new Date(ymd + "T00:00:00").toLocaleDateString("pl-PL", { month: "long", year: "numeric" }) : "";

const dataLabel = (ymd) =>
  ymd ? new Date(ymd + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : "";

const inputCls = "w-full p-2 border-[2px] border-[#171714] rounded bg-white text-right";

const doPola = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));
const zPola = (v) => {
  const t = String(v || "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

const pustyWyjatek = () => ({
  date_from: "",
  date_to: "",
  oczekiwany_utarg: "",
  cel_koszt_pct: "",
});

export default function GrafikBudzetKonfiguracja({
  lokal,
  budzetCele,
  setBudzetCele,
  budzetDni,
  setBudzetDni,
  dayLogs,
  currentUser,
  showMsg,
}) {
  const dzis = toLocalYMD(new Date());
  const nastepny = new Date();
  nastepny.setDate(1);
  nastepny.setMonth(nastepny.getMonth() + 1);

  const [wybranyOd, setWybranyOd] = useState(null);
  const [nowyRok, setNowyRok] = useState(nastepny.getFullYear());
  const [nowyMiesiac, setNowyMiesiac] = useState(nastepny.getMonth());
  const [draft, setDraft] = useState(null);
  const [zapisuje, setZapisuje] = useState(false);
  const [wyjatek, setWyjatek] = useState(null);

  const zestawy = budzetSetyLokalu(budzetCele, lokal);
  // Domyślnie pokazujemy zestaw obowiązujący DZIŚ, a nie po prostu najnowszy —
  // kierownik może mieć przygotowany zestaw na przyszły miesiąc, który jeszcze
  // nie działa (ta sama zasada co przy wymaganiach obsady).
  const obowiazujacy = findBudzetSetForDate(budzetCele, lokal, dzis);
  const aktywnyOd =
    (zestawy.includes(wybranyOd) && wybranyOd) || obowiazujacy || zestawy[0] || null;
  const wiersze = aktywnyOd ? wierszeZestawu(budzetCele, lokal, aktywnyOd) : [];

  const rows =
    draft ||
    DNI.map((d) => {
      const w = wiersze.find((r) => Number(r.day_of_week) === d.idx);
      return {
        day_of_week: d.idx,
        id: w ? w.id : null,
        oczekiwany_utarg: doPola(w && w.oczekiwany_utarg),
        cel_koszt_pct: doPola(w && w.cel_koszt_pct),
      };
    });

  const ustaw = (idx, patch) =>
    setDraft(rows.map((r) => (r.day_of_week === idx ? { ...r, ...patch } : r)));

  const utworz = async (kopiuj) => {
    const obowiazujeOd = `${nowyRok}-${String(nowyMiesiac + 1).padStart(2, "0")}-01`;
    if (zestawy.includes(obowiazujeOd)) {
      showMsg("Zestaw na ten miesiąc już istnieje.", "error");
      return;
    }
    setZapisuje(true);
    try {
      const nowe = await utworzZestaw({
        lokal,
        obowiazujeOd,
        zrodlo: kopiuj ? wiersze : null,
        autor: currentUser?.name,
      });
      setBudzetCele([...(budzetCele || []), ...nowe]);
      setWybranyOd(obowiazujeOd);
      setDraft(null);
      showMsg(kopiuj ? "Utworzono zestaw z kopii bieżącego." : "Utworzono pusty zestaw.");
    } catch (err) {
      showMsg(`Błąd zapisu zestawu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  // ⚠️ Kasowanie zestawu OBOWIĄZUJĄCEGO zmienia liczby w siatce od razu: dni
  // spadają na zestaw wcześniejszy albo — gdy nie ma żadnego — tracą cel i cała
  // warstwa budżetu milknie. Mówimy o tym wprost, zanim zapytamy.
  const usun = async () => {
    if (!aktywnyOd) return;
    const wczesniejszy = zestawy
      .filter((od) => od !== aktywnyOd && od <= dzis)
      .sort()
      .reverse()[0];
    const skutek =
      aktywnyOd !== obowiazujacy
        ? "Ten zestaw jeszcze nie obowiązuje, więc w siatce nic się nie zmieni."
        : wczesniejszy
        ? `Od teraz obowiązywać będzie zestaw od ${monthLabel(wczesniejszy)}.`
        : "To jedyny obowiązujący zestaw — po usunięciu lokal zostanie bez celu finansowego, a widok „Wg budżetu” przestanie pokazywać liczby.";
    if (
      !window.confirm(
        `Usunąć zestaw celów od ${monthLabel(aktywnyOd)}?\n\n${skutek}\n\nWyjątki na konkretne dni zostają — kasuje się je osobno. Tego nie da się cofnąć.`
      )
    )
      return;
    setZapisuje(true);
    try {
      await usunZestaw({ cele: budzetCele, setCele: setBudzetCele, lokal, obowiazujeOd: aktywnyOd });
      setDraft(null);
      setWybranyOd(null);
      showMsg("Usunięto zestaw celów.");
    } catch (err) {
      showMsg(`Błąd usuwania zestawu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const zapisz = async () => {
    if (!aktywnyOd) return;
    setZapisuje(true);
    try {
      const zapisane = [];
      for (const r of rows) {
        const wiersz = wiersze.find((w) => Number(w.day_of_week) === r.day_of_week);
        if (!wiersz) continue;
        zapisane.push(
          await zapiszCel({
            wiersz,
            patch: {
              oczekiwany_utarg: zPola(r.oczekiwany_utarg),
              cel_koszt_pct: zPola(r.cel_koszt_pct),
            },
          })
        );
      }
      const mapa = new Map(zapisane.map((x) => [x.id, x]));
      setBudzetCele((budzetCele || []).map((c) => mapa.get(c.id) || c));
      setDraft(null);
      showMsg("Zapisano cel finansowy.");
    } catch (err) {
      showMsg(`Błąd zapisu celu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  // --- WYJĄTKI ----------------------------------------------------------
  const wyjatkiLokalu = (budzetDni || [])
    .filter((d) => d.lokal === lokal)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const zapiszWyjatek = async (e) => {
    e.preventDefault();
    const od = wyjatek.date_from;
    const doDnia = wyjatek.date_to || od;
    if (!od) {
      showMsg("Podaj datę wyjątku.", "error");
      return;
    }
    if (doDnia < od) {
      showMsg("Data końcowa jest wcześniejsza niż początkowa.", "error");
      return;
    }
    const u = zPola(wyjatek.oczekiwany_utarg);
    const p = zPola(wyjatek.cel_koszt_pct);
    if (u == null && p == null) {
      showMsg("Wpisz utarg albo procent — inaczej wyjątek niczego nie zmienia.", "error");
      return;
    }
    setZapisuje(true);
    try {
      // Zakres rozpisujemy na pojedyncze dni. Dzięki temu "który dzień jest
      // zmieniony" ma jedną, trywialną odpowiedź — i w tej liście, i w siatce,
      // gdzie olówek pisze do tych samych wierszy.
      let biezaca = od;
      let lista = budzetDni || [];
      // ⚠️ Kolejny dzień liczy `addDaysYMD`, a NIE `toISOString().slice(0,10)` —
      // to drugie zamienia lokalną północ na czas UTC i w Polsce cofa datę o
      // jeden dzień (błąd #2 w CLAUDE.md).
      while (biezaca <= doDnia) {
        await zapiszNadpisanieDnia({
          lokal,
          dateStr: biezaca,
          oczekiwany_utarg: u,
          cel_koszt_pct: p,
          autor: currentUser?.name,
          budzetDni: lista,
          setBudzetDni: (nowa) => {
            lista = typeof nowa === "function" ? nowa(lista) : nowa;
          },
        });
        biezaca = addDaysYMD(biezaca, 1);
      }
      setBudzetDni(lista);
      setWyjatek(null);
      showMsg("Zapisano wyjątek budżetu.");
    } catch (err) {
      showMsg(`Błąd zapisu wyjątku: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const usunWyjatek = async (w) => {
    try {
      await usunNadpisanieDnia({ wiersz: w, budzetDni, setBudzetDni });
    } catch (err) {
      showMsg(`Błąd usuwania: ${err.message || "nieznany błąd"}`, "error");
    }
  };

  return (
    <>
      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Cel finansowy — dni tygodnia</span>
        </div>

        <div className="p-4 flex flex-wrap items-end gap-3 border-b-[2px] border-[#171714]">
          <div>
            <label className={statLabelCls}>Wersja celu</label>
            <select
              value={aktywnyOd || ""}
              onChange={(e) => {
                setDraft(null);
                setWybranyOd(e.target.value);
              }}
              className="p-2 border-[2px] border-[#171714] rounded bg-white min-w-[240px]"
              disabled={zestawy.length === 0}
            >
              {zestawy.length === 0 && <option value="">brak zestawów</option>}
              {zestawy.map((od) => (
                <option key={od} value={od}>
                  Od {monthLabel(od)}
                  {od === obowiazujacy ? " (obowiązuje dziś)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={statLabelCls}>Nowy zestaw od miesiąca</label>
            <div className="flex gap-2">
              <select
                value={nowyMiesiac}
                onChange={(e) => setNowyMiesiac(Number(e.target.value))}
                className="p-2 border-[2px] border-[#171714] rounded bg-white"
              >
                {MIESIACE.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={nowyRok}
                onChange={(e) => setNowyRok(Number(e.target.value))}
                className="p-2 border-[2px] border-[#171714] rounded bg-white"
              >
                {[nastepny.getFullYear() - 1, nastepny.getFullYear(), nastepny.getFullYear() + 1].map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
          <button onClick={() => utworz(false)} disabled={zapisuje} className={btnSecondaryCls}>
            <Plus size={15} className="inline -mt-0.5 mr-1" /> Pusty
          </button>
          <button
            onClick={() => utworz(true)}
            disabled={zapisuje || wiersze.length === 0}
            className={btnPrimaryCls}
            title={
              wiersze.length === 0
                ? "Nie ma jeszcze zestawu, z którego można kopiować"
                : "Skopiuje wszystkie wartości z oglądanego zestawu"
            }
          >
            <Copy size={15} className="inline -mt-0.5 mr-1" /> Kopiuj bieżący
          </button>
          <button
            onClick={usun}
            disabled={zapisuje || !aktywnyOd}
            className="bg-white text-[#DE3A22] font-['Archivo'] font-bold text-sm px-4 py-2.5 rounded border-[2px] border-[#DE3A22] hover:bg-[#FAEAE6] disabled:opacity-40"
            title="Usuwa oglądany zestaw celów (siedem dni tygodnia)"
          >
            <Trash2 size={15} className="inline -mt-0.5 mr-1" /> Usuń zestaw
          </button>
        </div>

        {zestawy.length === 0 ? (
          <p className="p-4 text-[#6E6E66] text-sm">
            Ten lokal nie ma jeszcze celu finansowego. Utwórz pusty zestaw — zestaw
            obowiązuje od swojego miesiąca aż do pojawienia się nowszego, więc każdy
            kolejny miesiąc wypełniać trzeba tylko wtedy, gdy coś się zmienia.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#F1F1EE] text-left">
                  <th className="px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]">
                    Dzień
                  </th>
                  <th className="px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]">
                    Oczekiwany utarg
                  </th>
                  <th className="px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-[#8F8E86]">
                    Docelowy % kosztu pracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const historia = sredniUtargDnia(dayLogs, lokal, r.day_of_week);
                  return (
                    <tr key={r.day_of_week} className="border-t-[2px] border-[#E7E7E2]">
                      <td className="px-4 py-2 font-['Archivo'] font-bold text-[14px]">
                        {DNI.find((d) => d.idx === r.day_of_week).label}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={r.oczekiwany_utarg}
                            onChange={(e) =>
                              ustaw(r.day_of_week, { oczekiwany_utarg: e.target.value })
                            }
                            className={`${inputCls} max-w-[160px]`}
                            placeholder="—"
                            inputMode="decimal"
                          />
                          <span className="text-[13px] text-[#6E6E66]">zł</span>
                          {historia && (
                            <button
                              type="button"
                              onClick={() =>
                                ustaw(r.day_of_week, {
                                  oczekiwany_utarg: String(historia.kwota),
                                })
                              }
                              className="text-[12px] text-[#6E6E66] underline hover:text-[#171714]"
                              title={`Średnia z ${historia.zIlu} ostatnich takich dni w Pulsie — wstawia liczbę do pola, nic nie zapisuje`}
                            >
                              <History size={12} className="inline -mt-0.5 mr-0.5" />
                              z historii: {zl(historia.kwota)}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={r.cel_koszt_pct}
                            onChange={(e) =>
                              ustaw(r.day_of_week, { cel_koszt_pct: e.target.value })
                            }
                            className={`${inputCls} max-w-[110px]`}
                            placeholder="—"
                            inputMode="decimal"
                          />
                          <span className="text-[13px] text-[#6E6E66]">%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="p-4 border-t-[2px] border-[#171714] flex flex-wrap items-center gap-3">
              <button onClick={zapisz} disabled={zapisuje || !draft} className={btnPrimaryCls}>
                Zapisz cel
              </button>
              {draft && (
                <button onClick={() => setDraft(null)} className={btnSecondaryCls}>
                  Anuluj
                </button>
              )}
              <p className="text-[12px] text-[#6E6E66] leading-snug flex-1 min-w-[280px]">
                Oczekiwany utarg to Twój szacunek na typowy dzień tygodnia, nie cel
                odgórny. Docelowy % kosztu pracy może różnić się dzień do dnia — wyżej w
                spokojny wtorek, gdzie koszty stałe ważą więcej, niżej w sobotę, gdzie
                wyższy utarg pozwala na niższy procent. Obu używa Grafik w widoku „Wg
                budżetu”; tam da się je nadpisać na konkretny dzień.
              </p>
            </div>
          </>
        )}
      </div>

      <div className={sectionCardCls}>
        <div className={sectionHeaderCls}>
          <span>Wyjątki — konkretne dni</span>
          <button
            onClick={() => setWyjatek(wyjatek ? null : pustyWyjatek())}
            className="text-[13px] font-bold text-[#DE3A22] hover:opacity-70"
          >
            {wyjatek ? "Anuluj" : "+ Dodaj wyjątek"}
          </button>
        </div>

        {wyjatek && (
          <form
            onSubmit={zapiszWyjatek}
            className="p-4 border-b-[2px] border-[#171714] bg-[#F1F1EE] grid md:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label className={statLabelCls}>Od dnia</label>
              <input
                type="date"
                value={wyjatek.date_from}
                onChange={(e) => setWyjatek({ ...wyjatek, date_from: e.target.value })}
                className="w-full p-2 border-[2px] border-[#171714] rounded"
                required
              />
            </div>
            <div>
              <label className={statLabelCls}>Do dnia (puste = jeden dzień)</label>
              <input
                type="date"
                value={wyjatek.date_to}
                onChange={(e) => setWyjatek({ ...wyjatek, date_to: e.target.value })}
                className="w-full p-2 border-[2px] border-[#171714] rounded"
              />
            </div>
            <div>
              <label className={statLabelCls}>Utarg (zł)</label>
              <input
                value={wyjatek.oczekiwany_utarg}
                onChange={(e) => setWyjatek({ ...wyjatek, oczekiwany_utarg: e.target.value })}
                className={inputCls}
                placeholder="bez zmian"
                inputMode="decimal"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className={statLabelCls}>Cel (%)</label>
                <input
                  value={wyjatek.cel_koszt_pct}
                  onChange={(e) => setWyjatek({ ...wyjatek, cel_koszt_pct: e.target.value })}
                  className={inputCls}
                  placeholder="bez zmian"
                  inputMode="decimal"
                />
              </div>
              <button type="submit" disabled={zapisuje} className={btnPrimaryCls}>
                Zapisz
              </button>
            </div>
          </form>
        )}

        {wyjatkiLokalu.length === 0 ? (
          <p className="p-4 text-[#6E6E66] text-sm">
            Brak wyjątków. Wyjątek zmienia utarg albo procent na konkretny dzień —
            sylwester, koncert w mieście, remont ulicy. To te same wiersze, które
            powstają po kliknięciu w liczbę w siatce „Wg budżetu”.
          </p>
        ) : (
          wyjatkiLokalu.map((w) => (
            <div
              key={w.id}
              className="px-4 py-2.5 border-t-[2px] border-[#E7E7E2] flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <span className="font-['Archivo'] font-bold text-[14px]">{dataLabel(w.date)}</span>
              <span className="text-[13px] text-[#6E6E66]">
                {w.oczekiwany_utarg != null ? `utarg ${zl(w.oczekiwany_utarg)}` : "utarg bez zmian"}
                {" · "}
                {w.cel_koszt_pct != null ? `cel ${w.cel_koszt_pct}%` : "cel bez zmian"}
              </span>
              {w.autor && <span className="text-[12px] text-[#8F8E86]">wpisał: {w.autor}</span>}
              <button
                onClick={() => usunWyjatek(w)}
                className="ml-auto text-[#DE3A22] hover:opacity-70"
                title="Usuń wyjątek — dzień wróci do wartości z zestawu"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
