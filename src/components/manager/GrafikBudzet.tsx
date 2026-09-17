// @ts-nocheck
// Grafik → warstwa budżetu: trzy karty nad siatką i wiersze wskaźników w
// układzie "Wg budżetu".
//
// ⚠️ Ten plik NIE rysuje nagłówka dni — robi to dalej `LokalSection` w
// GrafikTydzien.tsx, ten sam kod co w układach "Wg osób" i "Wg stanowisk".
// Świadome ustalenie właściciela: szapka ma być identyczna we wszystkich
// trzech układach, a dwie kopie tego nagłówka rozjechałyby się przy pierwszej
// poprawce godzin albo pogody.
//
// Cała arytmetyka siedzi w utils/budzet.ts — tutaj jest wyłącznie rysowanie i
// jedno pole do wpisania nadpisania dnia.
import React, { useState } from "react";
import { AlertTriangle, Pencil, RotateCcw } from "lucide-react";
import { statLabelCls } from "./designTokens";
import { zl, pct0, pct1, zapiszNadpisanieDnia } from "../../utils/budzet";

const DZIEN_SKROT = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

const skrotDnia = (d) => DZIEN_SKROT[new Date(d + "T00:00:00").getDay()];

// Zaokrąglenie takie samo jak `cardCls`/`statTileCls` w designTokens — karty
// budżetu miały `rounded` i odcinały się kanciastością od reszty panelu.
// ⚠️ Kwadratowy bez zaokrągleń zostaje tylko znak Shiftro (ShiftroMark.tsx).
const kartaCls = "border-[2.5px] border-[#171714] rounded-xl px-3 py-2 bg-white";

// Polska odmiana: 1 dzień, 2+ dni — "1 dni" w podpisie karty wygląda na błąd
// w liczbie nad nim.
const dniLabel = (n) => (n === 1 ? "1 dzień" : `${n} dni`);

// Różnica dwóch procentów to PUNKTY PROCENTOWE, nie procenty — "o 30,2%
// poniżej celu 33%" czyta się jako 33 minus 30% z 33, czyli zupełnie inną
// liczbę niż ta, o którą chodzi.
const punkty = (v) =>
  `${(Math.round(v * 10) / 10).toString().replace(".", ",")} pkt proc.`;

// Liczba do pola: bez spacji i ze zwykłą kropką, żeby dało się ją wpisać z
// klawiatury numerycznej, a przecinek nie wywracał parsowania.
const doPola = (v) => (v == null ? "" : String(v).replace(".", ","));
const zPola = (v) => {
  const t = String(v || "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
};

// --- TRZY KARTY NAD SIATKĄ ----------------------------------------------
// Pierwsza karta ma pełną ramkę, dwie pozostałe przerywaną i znaczek
// "PROPOZYCJA": koszt pracy jest FAKTEM wynikającym z wpisanego grafiku, a
// minimalny utarg to liczba wyprowadzona z celu, którego nikt jeszcze nie
// obiecał utargować.
export function KartyBudzetu({ suma, trybDnia }) {
  if (!suma) return null;
  const okres = trybDnia ? "DZIEŃ" : "TYDZIEŃ";
  const czesci = [];
  if (suma.zlecenia > 0) czesci.push(`${zl(suma.zlecenia)} zlecenia`);
  // "~" przy etatach nie jest ozdobą: przy umowie o pracę to ALOKACJA stałej
  // pensji na godziny tego tygodnia, a nie kwota, którą lokal wyda dodatkowo.
  if (suma.etaty > 0) czesci.push(`~${zl(suma.etaty)} etaty`);
  // Wyjaśnienie znaku "~" zeszło do podpowiedzi: w podpisie łamało kartę na
  // dodatkową linijkę, a tłumaczy rzecz, którą czyta się raz.
  const opisSkladu =
    suma.etaty > 0
      ? "Przy umowie o pracę to część miesięcznej pensji przypadająca na godziny tego okresu (alokacja), a nie wydatek dodatkowy — stąd znak ~."
      : "Koszt godzin z wpisanego grafiku, z narzutem pracodawcy.";

  return (
    <div
      className={`px-4 py-2.5 border-b-[2px] border-[#171714] grid gap-2 sm:grid-cols-2 ${
        trybDnia ? "lg:grid-cols-3" : "lg:grid-cols-4"
      }`}
    >
      <div className={kartaCls}>
        <div className={statLabelCls}>Koszt pracy · {okres}</div>
        <div className="font-['Archivo'] font-extrabold text-[22px] leading-none mt-0.5">
          {zl(suma.koszt)}
        </div>
        <div className="text-[11px] text-[#6E6E66] leading-tight mt-1 truncate" title={opisSkladu}>
          {czesci.length > 0 ? czesci.join(" + ") : "brak zmian w grafiku"}
        </div>
        {suma.bezDanych.length > 0 && (
          <div
            className="text-[11px] font-bold text-[#8A3A2B] leading-tight truncate"
            title={`Koszt zaniżony — te osoby nie mają ani stawki godzinowej, ani kwoty z umowy: ${suma.bezDanych.join(", ")}`}
          >
            <AlertTriangle size={11} className="inline -mt-0.5 mr-1" />
            bez wynagrodzenia: {suma.bezDanych.join(", ")}
          </div>
        )}
      </div>

      {/* Druga karta stoi między kosztem a propozycjami świadomie: to jedyna
          liczba w tym rzędzie, która łączy obie strony równania i jest DOKŁADNA
          — koszt jest z grafiku, prognoza z konfiguracji, nic tu nie jest
          proponowane. Dlatego pełna ramka, jak przy koszcie, a nie przerywana. */}
      <div className={kartaCls}>
        <div className={statLabelCls}>Koszt pracy / utarg · {okres}</div>
        <div
          className={`font-['Archivo'] font-extrabold text-[22px] leading-none mt-0.5 ${
            suma.celPct != null && suma.kosztPct != null && suma.kosztPct > suma.celPct
              ? "text-[#DE3A22]"
              : "text-[#171714]"
          }`}
        >
          {pct1(suma.kosztPct)}
        </div>
        <div className="text-[11px] text-[#6E6E66] leading-tight mt-1">
          {suma.kosztPct == null
            ? "wpisz prognozowany utarg w Konfiguracji"
            : suma.celPct == null
            ? "brak docelowego procentu do porównania"
            : `cel ${pct1(suma.celPct)} — ${
                suma.kosztPct > suma.celPct
                  ? `o ${punkty(suma.kosztPct - suma.celPct)} powyżej`
                  : `o ${punkty(suma.celPct - suma.kosztPct)} poniżej`
              }`}
        </div>
      </div>

      <KartaPropozycji
        label={`Min. utarg · ${okres}`}
        wartosc={suma.minUtarg}
        opis={
          suma.minUtarg == null
            ? "wpisz docelowy % kosztu pracy w Konfiguracji"
            : "przy docelowym % kosztu pracy z konfiguracji"
        }
      />
      {/* W trybie dnia trzecia karta powtarzałaby drugą co do grosza — jeden
          dzień jest własną średnią. */}
      {!trybDnia && (
        <KartaPropozycji
          label="Min. utarg · średnio/dzień"
          wartosc={suma.minUtargSredni}
          opis={
            suma.minUtargSredni == null
              ? "brak celu albo brak obsady w grafiku"
              : `różni się dzień do dnia wg obsady (${dniLabel(suma.minUtargDni)})`
          }
        />
      )}
    </div>
  );
}

function KartaPropozycji({ label, wartosc, opis }) {
  return (
    <div className="relative border-[2.5px] border-dashed border-[#DE3A22] rounded-xl px-3 py-2 bg-white">
      <span className="absolute -top-2 right-3 bg-[#DE3A22] text-white text-[9px] font-extrabold tracking-wider px-1.5 py-0.5 rounded">
        PROPOZYCJA
      </span>
      <div className={statLabelCls}>{label}</div>
      <div className="font-['Archivo'] font-extrabold text-[22px] leading-none mt-0.5 text-[#DE3A22]">
        {zl(wartosc)}
      </div>
      <div className="text-[11px] text-[#6E6E66] leading-tight mt-1">{opis}</div>
    </div>
  );
}

// --- WIERSZE WSKAŹNIKÓW --------------------------------------------------
export function WierszeBudzetu({
  lokal,
  dni,
  suma,
  edycja,
  budzetDni,
  setBudzetDni,
  currentUser,
  showMsg,
}) {
  // { date, pole } — co właśnie poprawiamy. Jedna komórka naraz: dwa otwarte
  // pola w jednym wierszu dają dwa różne "zapisz" i pierwszy z nich kasuje
  // drugi, bo obie wartości idą jednym wierszem do tej samej daty.
  const [edytowana, setEdytowana] = useState(null);
  const [wartosc, setWartosc] = useState("");
  const [zapisuje, setZapisuje] = useState(false);

  const otworz = (date, pole, aktualna) => {
    setEdytowana({ date, pole });
    setWartosc(doPola(aktualna));
  };

  const zapisz = async () => {
    if (!edytowana || zapisuje) return;
    const { date, pole } = edytowana;
    const dzien = dni.find((d) => d.date === date);
    const nowa = zPola(wartosc);
    const cel = dzien && dzien.cel;
    const baza = cel ? cel.baza : { utarg: null, pct: null };
    const nadpis = cel && cel.nadpisRow ? cel.nadpisRow : null;

    // Drugie pole zostaje takie, jakie było w nadpisaniu (a nie takie, jakie
    // widać — widać może być wartość z zestawu, a jej przepisanie do wyjątku
    // zamroziłoby ją na zawsze przy zmianie zestawu).
    const payload = {
      oczekiwany_utarg: nadpis ? nadpis.oczekiwany_utarg : null,
      cel_koszt_pct: nadpis ? nadpis.cel_koszt_pct : null,
    };
    // Wartość równa tej z zestawu NIE jest nadpisaniem. Bez tego dzień
    // dostawałby czerwony podpis "zmienione na ten tydzień" mimo że nic się
    // nie zmieniło, a taki podpis przy niezmienionym dniu uczy go ignorować.
    const bazowa = pole === "utarg" ? baza.utarg : baza.pct;
    const rownaBazie = nowa != null && bazowa != null && Math.abs(nowa - bazowa) < 0.0001;
    payload[pole === "utarg" ? "oczekiwany_utarg" : "cel_koszt_pct"] = rownaBazie ? null : nowa;

    setZapisuje(true);
    try {
      await zapiszNadpisanieDnia({
        lokal,
        dateStr: date,
        oczekiwany_utarg: payload.oczekiwany_utarg,
        cel_koszt_pct: payload.cel_koszt_pct,
        autor: currentUser?.name,
        budzetDni,
        setBudzetDni,
      });
      setEdytowana(null);
    } catch (err) {
      showMsg(`Błąd zapisu budżetu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  // "Cofnij" kasuje TYLKO to pole, które jest nadpisane w tym wierszu — nie cały
  // wyjątek dnia. Gdyby kasowało oba, cofnięcie zmienionego procentu zdejmowałoby
  // przy okazji wpisany ręcznie utarg, a kierownik zobaczyłby to dopiero po
  // fakcie, w innym wierszu tabeli.
  const przywroc = async (date, pole) => {
    const dzien = dni.find((d) => d.date === date);
    const nadpis = dzien && dzien.cel ? dzien.cel.nadpisRow : null;
    if (!nadpis) return;
    setZapisuje(true);
    try {
      await zapiszNadpisanieDnia({
        lokal,
        dateStr: date,
        oczekiwany_utarg: pole === "utarg" ? null : nadpis.oczekiwany_utarg,
        cel_koszt_pct: pole === "pct" ? null : nadpis.cel_koszt_pct,
        autor: currentUser?.name,
        budzetDni,
        setBudzetDni,
      });
    } catch (err) {
      showMsg(`Błąd zapisu budżetu: ${err.message || "nieznany błąd"}`, "error");
    }
    setZapisuje(false);
  };

  const komorkaEdytowalna = (dzien, pole, tekst, nadpisane) => {
    const otwarta =
      edytowana && edytowana.date === dzien.date && edytowana.pole === pole;
    if (otwarta) {
      return (
        <input
          autoFocus
          value={wartosc}
          onChange={(e) => setWartosc(e.target.value)}
          onBlur={zapisz}
          onKeyDown={(e) => {
            if (e.key === "Enter") zapisz();
            if (e.key === "Escape") setEdytowana(null);
          }}
          className="w-full border-[2px] border-[#171714] rounded px-1.5 py-0.5 text-[13px] bg-white"
          placeholder="—"
        />
      );
    }
    const wartoscDnia = pole === "utarg" ? dzien.utarg : dzien.pct;
    return (
      <div>
        <button
          type="button"
          disabled={!edycja}
          onClick={() => otworz(dzien.date, pole, wartoscDnia)}
          className={`text-[13px] text-left ${
            edycja ? "group cursor-text" : "cursor-default"
          }`}
          title={
            edycja
              ? "Kliknij, aby zmienić tę wartość tylko na ten dzień"
              : "Zmiana wartości wymaga trybu Edycja"
          }
        >
          <span
            className={`font-bold ${
              nadpisane
                ? "text-[#DE3A22] border-b-[2px] border-dashed border-[#DE3A22]"
                : "border-b-[2px] border-dashed border-[#B7B6AE]"
            }`}
          >
            {tekst}
          </span>
          {edycja && (
            <Pencil
              size={11}
              className="inline -mt-0.5 ml-1 text-[#B7B6AE] group-hover:text-[#171714]"
            />
          )}
        </button>
        {/* Podpis stoi przy POLU, którego dotyczy. Jeden wspólny podpis pod
            wierszem utargu twierdził, że zmieniono utarg, także wtedy gdy
            zmieniony był procent w wierszu wyżej. */}
        {nadpisane && (
          <div className="text-[10px] text-[#DE3A22] leading-tight mt-0.5">
            zmienione na ten dzień
            {edycja && (
              <button
                type="button"
                onClick={() => przywroc(dzien.date, pole)}
                disabled={zapisuje}
                className="ml-1 underline hover:no-underline"
                title="Wróć do wartości z zestawu w Konfiguracji"
              >
                <RotateCcw size={10} className="inline -mt-0.5" /> cofnij
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const stanowiska = [
    ...new Set(dni.flatMap((d) => Object.keys(d.wgStanowisk))),
  ].sort((a, b) => a.localeCompare(b, "pl"));

  const naglowekWiersza = (tekst, podpis) => (
    <td className="px-3 py-2 border-r-[2px] border-[#171714] align-top">
      <div className="font-['Archivo'] font-bold text-[13px]">{tekst}</div>
      {podpis && <div className="text-[11px] text-[#8F8E86] leading-tight">{podpis}</div>}
    </td>
  );

  const komorka = (dzien, dzieci, extra = "") => (
    <td
      key={dzien.date}
      className={`px-3 py-2 border-r-[2px] border-[#E7E7E2] last:border-r-0 align-top ${extra}`}
    >
      {dzieci}
    </td>
  );

  return (
    <tbody>
      <tr className="border-t-[2px] border-[#E7E7E2]">
        {naglowekWiersza("Cel % kosztu pracy")}
        {dni.map((d) =>
          komorka(
            d,
            komorkaEdytowalna(d, "pct", pct0(d.pct), d.cel && d.cel.nadpisane.pct)
          )
        )}
      </tr>

      <tr className="border-t-[2px] border-[#E7E7E2]">
        {naglowekWiersza("Prognozowany utarg")}
        {dni.map((d) =>
          komorka(
            d,
            komorkaEdytowalna(d, "utarg", zl(d.utarg), d.cel && d.cel.nadpisane.utarg)
          )
        )}
      </tr>

      <tr className="border-t-[2px] border-[#E7E7E2] bg-[#FAFAF7]">
        {naglowekWiersza("Koszt pracy", "z wpisanych zmian")}
        {dni.map((d) =>
          komorka(
            d,
            <div className="font-['Archivo'] font-extrabold text-[14px]">{zl(d.koszt)}</div>
          )
        )}
      </tr>

      {stanowiska.map((st) => (
        <tr key={st} className="border-t border-[#EFEFEA] bg-[#FAFAF7]">
          {naglowekWiersza(`· ${st}`)}
          {dni.map((d) =>
            komorka(
              d,
              <span className="text-[12px] text-[#6E6E66]">
                {d.wgStanowisk[st] ? zl(d.wgStanowisk[st]) : zl(0)}
              </span>
            )
          )}
        </tr>
      ))}

      <tr className="border-t-[2px] border-[#171714]">
        {naglowekWiersza("Zapas do celu", "utarg × cel − koszt")}
        {dni.map((d) =>
          komorka(
            d,
            d.zapas == null ? (
              <span className="text-[13px] text-[#8F8E86]">—</span>
            ) : d.zapas < 0 ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-extrabold text-[#DE3A22] bg-[#FAEAE6] rounded px-1.5 py-0.5">
                <AlertTriangle size={12} />
                {zl(d.zapas)}
              </span>
            ) : (
              <span className="text-[13px] font-bold text-[#2F7A2A]">+{zl(d.zapas)}</span>
            )
          )
        )}
      </tr>

      <tr>
        <td colSpan={dni.length + 1} className="px-4 py-3 bg-[#F1F1EE] border-t-[2px] border-[#171714]">
          <PodsumowanieBudzetu suma={suma} dni={dni} />
        </td>
      </tr>
    </tbody>
  );
}

function PodsumowanieBudzetu({ suma, dni }) {
  if (!suma) return null;
  const ponizej = suma.dniPonizej.map(skrotDnia);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span className="text-[#6E6E66]">
        Razem: <strong className="text-[#171714]">{zl(suma.koszt)}</strong> kosztu
        {suma.maPrognoze ? (
          <>
            {" "}
            przy <strong className="text-[#171714]">{zl(suma.prognoza)}</strong> prognozy
          </>
        ) : null}
        {suma.zapas != null ? (
          <>
            {" "}
            —{" "}
            <strong className={suma.zapas < 0 ? "text-[#DE3A22]" : "text-[#2F7A2A]"}>
              {suma.zapas >= 0 ? "+" : ""}
              {zl(suma.zapas)}
            </strong>{" "}
            zapasu ogółem
          </>
        ) : null}
      </span>
      {ponizej.length > 0 && (
        <span className="text-[12px] font-bold text-[#DE3A22] bg-[#FAEAE6] rounded px-2 py-0.5">
          {dniLabel(ponizej.length)} poniżej celu — {ponizej.join(", ")}
        </span>
      )}
      {dni.every((d) => d.cel == null) && (
        <span className="text-[12px] text-[#6E6E66]">
          Budżet dla tego lokalu nie jest jeszcze ustawiony — wpisz oczekiwany utarg i
          docelowy % kosztu pracy w Konfiguracji → Budżet.
        </span>
      )}
    </div>
  );
}
