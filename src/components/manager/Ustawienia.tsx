// @ts-nocheck
// Ustawienia konta właściciela: lokale, stanowiska, dane firmy i subskrypcja.
//
// Lokale i Stanowiska stały wcześniej jako dwie dodatkowe pigułki w zakładce
// Pracownicy. To były ustawienia sieci wciśnięte między kartoteki ludzi, a
// edycja lokalu była modalem, który po kolejnych dopiskach (bloki telefonu,
// płace, progi zmian) przestał mieścić się w oknie — przycisk "Zapisz" lądował
// pod krawędzią ekranu i z modala nie dało się wyjść.
//
// Dlatego tutaj:
//   - DODANIE lokalu to mała modalka z nazwą i miastem. Reszta ma sensowne
//     wartości domyślne (puste pole = domyślnie), a po zapisie od razu
//     otwiera się karta nowego lokalu;
//   - EDYCJA to karta obok listy (jak karta pracownika), podzielona na
//     zwijane sekcje, z przyciskami przyklejonymi do dołu — widocznymi
//     zawsze, niezależnie od tego, ile sekcji jest rozwiniętych.
//
// ⚠️ Zapis dalej idzie przez handleSaveDict w ManagerDashboard.tsx, a tam
// payload powstaje z JAWNEJ listy pól. Pole dopisane tylko tutaj przepadnie
// przy zapisie bez żadnego błędu (patrz błąd #18 w CLAUDE.md).
//
// Widzi to wyłącznie właściciel (rola `admin`) — decyzja właściciela z
// 2026-09-24. Filtr stoi w ManagerShell (menu) i w ManagerDashboard (render).
import React, { useState } from "react";
import {
  Plus,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  Edit2,
  MapPin,
} from "lucide-react";
import {
  pageTitleCls,
  cardCls,
  btnPrimaryCls,
  btnSecondaryCls,
  statLabelCls,
  statValueCls,
  statSubCls,
} from "./designTokens";
import { BLOKI_PRACOWNIKA, blokiLokalu } from "../../utils/grafik";
import { TOLERANCJA_PO_GRAFIKU_H, MAX_DLUGOSC_ZMIANY_H } from "../../utils/porzucone";
import { TRYBY_WPISU, regulyWpisu, opisOkna } from "../../utils/wpisy";
import { PRODUKT, TENANT } from "../../config";

const labelCls = "text-xs font-bold text-[#6E6E66]";
const inputCls = "w-full p-2 border-[2px] border-[#171714] rounded";
const helpCls = "text-[11px] text-[#6E6E66] mt-1";

const pillCls = (active) =>
  `px-3 py-2 rounded text-sm font-bold border-[2px] ${
    active
      ? "bg-[#171714] text-white border-[#171714]"
      : "bg-white text-[#171714] border-[#B7B6AE]"
  }`;

const SEKCJE = [
  { key: "lokale", label: "Lokale" },
  { key: "stanowiska", label: "Stanowiska" },
  { key: "firma", label: "Firma" },
  { key: "subskrypcja", label: "Subskrypcja" },
];

// Zwijana sekcja karty lokalu. Podsumowanie stoi w nagłówku, żeby zwinięta
// sekcja dalej mówiła, co w niej jest ustawione — bez tego trzeba by
// rozwijać każdą po kolei, żeby sprawdzić jedną liczbę.
function Sekcja({ tytul, podsumowanie, otwarta, onToggle, children }) {
  return (
    <div className="border-b-[2px] border-[#E7E7E2] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="font-['Archivo'] font-bold text-[15px] text-[#171714]">{tytul}</p>
          {!otwarta && podsumowanie && (
            <p className="text-xs text-[#6E6E66] truncate">{podsumowanie}</p>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`flex-shrink-0 text-[#6E6E66] transition-transform ${
            otwarta ? "rotate-180" : ""
          }`}
        />
      </button>
      {otwarta && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  );
}

// Modal, który nie może urosnąć ponad ekran: treść przewija się w środku,
// przyciski zostają na dole. Wspólny dla "Dodaj lokal" i stanowisk.
function MalyModal({ tytul, onSubmit, onCancel, children, zapiszLabel = "Zapisz" }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={onSubmit}
        className="bg-white rounded-xl border-[2px] border-[#171714] w-full max-w-sm max-h-[90vh] flex flex-col"
      >
        <h3 className="font-['Archivo'] font-extrabold text-lg px-6 pt-5 pb-3">{tytul}</h3>
        <div className="px-6 pb-4 space-y-3 overflow-y-auto min-h-0">{children}</div>
        <div className="flex gap-2 px-6 py-4 border-t-[2px] border-[#E7E7E2]">
          <button type="button" onClick={onCancel} className={btnSecondaryCls}>
            Anuluj
          </button>
          <button type="submit" className={btnPrimaryCls}>
            {zapiszLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Ustawienia({
  currentUser,
  lokale = [],
  stanowiska = [],
  users = [],
  editingDict,
  setEditingDict,
  onSaveDict,
  onArchive,
}) {
  const [sekcja, setSekcja] = useState("lokale");
  const [pokazArchiwum, setPokazArchiwum] = useState(false);
  // Która sekcja karty lokalu jest rozwinięta. Domyślnie tylko podstawowe —
  // karta ma się mieścić na ekranie, a resztę otwiera się, gdy jest po co.
  const [otwarte, setOtwarte] = useState({ podstawowe: true });
  const toggle = (k) => setOtwarte((o) => ({ ...o, [k]: !o[k] }));

  const aktywneLokale = lokale.filter((l) => !l.archived);
  const archiwalneLokale = lokale.filter((l) => l.archived);
  const aktywneStanowiska = stanowiska.filter((s) => !s.archived);
  const archiwalneStanowiska = stanowiska.filter((s) => s.archived);

  // editingDict jest wspólny dla lokali i stanowisk (jeden handleSaveDict),
  // więc przy zmianie sekcji musi się wyczyścić — inaczej otwarty lokal
  // zapisałby się jako stanowisko.
  const przejdz = (k) => {
    setEditingDict(null);
    setPokazArchiwum(false);
    setSekcja(k);
  };

  const otworzLokal = (l) => {
    setOtwarte({ podstawowe: true });
    setEditingDict({ ...l });
  };

  const zapiszNowyLokal = async (e) => {
    const zapisany = await onSaveDict(e, "lokale");
    // Po dodaniu od razu karta nowego lokalu — dalsze ustawienia i tak
    // trzeba przejrzeć, a szukanie go na liście to zbędny krok.
    if (zapisany) otworzLokal(zapisany);
  };

  const edytowanyLokal = sekcja === "lokale" && editingDict && editingDict.id ? editingDict : null;
  const nowyLokal = sekcja === "lokale" && editingDict && !editingDict.id;
  const set = (pole, wartosc) => setEditingDict({ ...editingDict, [pole]: wartosc });
  const blokiEdytowane = edytowanyLokal ? blokiLokalu(edytowanyLokal) : [];

  const aktywniPracownicy = users.filter(
    (u) => u.active !== false && !u.archived && u.role !== "kiosk"
  );
  const tablety = users.filter((u) => u.active !== false && !u.archived && u.role === "kiosk");

  // ---------------------------------------------------------------- Lokale
  const renderLokale = () => {
    const lista = pokazArchiwum ? archiwalneLokale : aktywneLokale;
    return (
      <div className="grid md:grid-cols-[300px_1fr] gap-5 items-start">
        {/* Lista — na telefonie znika, gdy karta jest otwarta. */}
        <div className={edytowanyLokal ? "hidden md:block" : ""}>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setEditingDict({ id: null, name: "", miasto: "" })}
              className={`${btnPrimaryCls} flex items-center gap-1.5`}
            >
              <Plus size={15} /> Dodaj lokal
            </button>
            <button
              onClick={() => {
                setEditingDict(null);
                setPokazArchiwum((v) => !v);
              }}
              className="text-xs font-bold text-[#6E6E66] underline ml-auto"
            >
              {pokazArchiwum ? "Pokaż aktywne" : `Archiwum · ${archiwalneLokale.length}`}
            </button>
          </div>
          {lista.length === 0 && (
            <p className="text-sm text-[#8F8E86]">
              {pokazArchiwum ? "Archiwum puste." : "Brak lokali — dodaj pierwszy."}
            </p>
          )}
          <div className="space-y-2">
            {lista.map((l) => {
              const aktywny = edytowanyLokal && edytowanyLokal.id === l.id;
              // Lokal z archiwum się nie edytuje, tylko przywraca — więc to
              // nie jest przycisk, a przywracanie ma własny.
              const Wiersz = pokazArchiwum ? "div" : "button";
              return (
                <Wiersz
                  key={l.id}
                  onClick={pokazArchiwum ? undefined : () => otworzLokal(l)}
                  className={`w-full text-left p-3 rounded-xl border-[2px] flex items-center justify-between gap-2 ${
                    aktywny
                      ? "border-[#DE3A22] bg-[#FAEAE6]"
                      : "border-[#171714] bg-white hover:bg-[#F1F1EE]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-['Archivo'] font-bold truncate">{l.name}</p>
                    <p className="text-xs text-[#6E6E66] flex items-center gap-1">
                      <MapPin size={11} /> {l.miasto || "miasto nieustawione"}
                    </p>
                  </div>
                  {pokazArchiwum && (
                    <button
                      onClick={() => onArchive("lokale", l.id, false)}
                      className="w-8 h-8 border-[2px] border-[#171714] rounded flex items-center justify-center flex-shrink-0"
                      title="Przywróć z archiwum"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                  )}
                </Wiersz>
              );
            })}
          </div>
        </div>

        {edytowanyLokal ? (
          renderKartaLokalu()
        ) : (
          <div className={`${cardCls} hidden md:block text-sm text-[#8F8E86]`}>
            Wybierz lokal z listy, żeby zmienić jego ustawienia.
          </div>
        )}
      </div>
    );
  };

  const renderKartaLokalu = () => {
    const d = edytowanyLokal;
    const liczbaBlokow = blokiEdytowane.length;
    const narzutOpis = `narzut ${d.narzut_umowa || 0}% / ${d.narzut_zlecenie || 0}%`;
    return (
      <form
        onSubmit={(e) => onSaveDict(e, "lokale")}
        className="bg-white rounded-xl border-[2px] border-[#171714] flex flex-col"
      >
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingDict(null)}
            className="md:hidden w-8 h-8 border-[2px] border-[#B7B6AE] rounded flex items-center justify-center"
            title="Wróć do listy"
          >
            <ChevronLeft size={16} />
          </button>
          <h3 className="font-['Archivo'] font-extrabold text-lg truncate">
            {d.name || "Lokal"}
          </h3>
        </div>

        <div className="px-5">
          <Sekcja
            tytul="Podstawowe"
            podsumowanie={`${d.miasto || "bez miasta"} · wypłata ${d.dzien_wyplaty || 10}.`}
            otwarta={!!otwarte.podstawowe}
            onToggle={() => toggle("podstawowe")}
          >
            <div>
              <label className={labelCls}>Nazwa</label>
              <input
                type="text"
                value={d.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Miasto (do pogody)</label>
                <input
                  type="text"
                  value={d.miasto || ""}
                  onChange={(e) => set("miasto", e.target.value)}
                  placeholder="np. Koszalin"
                  className={inputCls}
                />
              </div>
              <div>
                {/* Dzień wypłaty zmienia ruch w gastronomii na tyle, że Puls
                    pokazuje go przy dniu — inaczej nietypowy utarg wygląda na
                    zagadkę. Puste = 10. */}
                <label className={labelCls}>Dzień wypłaty</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={d.dzien_wyplaty ?? ""}
                  onChange={(e) =>
                    set("dzien_wyplaty", e.target.value === "" ? null : Number(e.target.value))
                  }
                  placeholder="10"
                  className={inputCls}
                />
              </div>
            </div>
          </Sekcja>

          <Sekcja
            tytul="Telefon pracownika"
            podsumowanie={`${liczbaBlokow} z ${BLOKI_PRACOWNIKA.length} bloków`}
            otwarta={!!otwarte.telefon}
            onToggle={() => toggle("telefon")}
          >
            <p className="text-[11px] text-[#6E6E66]">
              Co widzi pracownik tego lokalu na swoim prywatnym telefonie. Tablet
              Służbowy zawsze ma wszystko. Dostęp na telefonie ma tylko osoba z
              ustawionym PIN-em blokady i e-mailem.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BLOKI_PRACOWNIKA.map((b) => {
                const wybrane = blokiEdytowane.includes(b.key);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() =>
                      set(
                        "dostepne_bloki",
                        wybrane
                          ? blokiEdytowane.filter((x) => x !== b.key)
                          : [...blokiEdytowane, b.key]
                      )
                    }
                    className={`px-2.5 py-1 rounded border-[2px] text-[13px] font-bold text-left ${
                      wybrane
                        ? "bg-[#171714] text-white border-[#171714]"
                        : "bg-white text-[#171714] border-[#B7B6AE]"
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </Sekcja>

          {/* Ustawienia płacowe lokalu. Świadomie tutaj, a nie w karcie
              pracownika: to decyzje organizacyjne, jednakowe dla całej załogi.
              Skopiowane do kilkudziesięciu kart rozjechałyby się przy
              pierwszej pomyłce. */}
          <Sekcja
            tytul="Płace i koszty"
            podsumowanie={`okres ${d.okres_rozliczeniowy || 1} mies. · ${narzutOpis}`}
            otwarta={!!otwarte.place}
            onToggle={() => toggle("place")}
          >
            <div>
              <label className={labelCls}>Okres rozliczeniowy (miesiące)</label>
              <select
                value={d.okres_rozliczeniowy ?? ""}
                onChange={(e) =>
                  set(
                    "okres_rozliczeniowy",
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
                className={inputCls}
              >
                <option value="">1 miesiąc (domyślnie)</option>
                <option value="1">1 miesiąc</option>
                <option value="3">3 miesiące</option>
                <option value="4">4 miesiące</option>
              </select>
              <p className={helpCls}>
                W tym oknie pracownik na umowie o pracę może odrobić niewykorzystane
                godziny. Z końcem okresu bilans zeruje się.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Narzut — umowa o pracę (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={d.narzut_umowa ?? ""}
                  onChange={(e) => set("narzut_umowa", e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Narzut — zlecenie (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={d.narzut_zlecenie ?? ""}
                  onChange={(e) => set("narzut_zlecenie", e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>
            <p className={helpCls}>
              Koszty pracodawcy ponad wynagrodzenie (ZUS itd.). Puste = 0, czyli koszt
              liczy się z samej wypłaty.
            </p>
          </Sekcja>

          {/* Jak w tym lokalu wpisuje się godziny (utils/wpisy.ts, migracja
              0037) i kiedy niezakończona zmiana przestaje uchodzić za trwającą
              (utils/porzucone.ts, 0023). Jedna sekcja, bo to jedno pytanie:
              co pracownik może zapisać sam, a co trafia do kierownika.
              Wszystko puste = zachowanie sprzed tych ustawień. */}
          <Sekcja
            tytul="Rejestracja godzin"
            podsumowanie={(() => {
              const rw = regulyWpisu([d], d.name);
              const tryb = TRYBY_WPISU.find((x) => x.key === rw.tryb)?.label;
              return `${tryb} · start ${opisOkna(rw.startWstecz)} · koniec ${opisOkna(
                rw.koniecWstecz
              )}`;
            })()}
            otwarta={!!otwarte.wpisy}
            onToggle={() => toggle("wpisy")}
          >
            <div>
              <label className={labelCls}>Sposób wpisu</label>
              <div className="grid sm:grid-cols-3 gap-1.5 mt-1">
                {TRYBY_WPISU.map((tr) => {
                  const wybrany = (d.tryb_wpisu || null) === tr.key;
                  return (
                    <button
                      key={tr.label}
                      type="button"
                      onClick={() => set("tryb_wpisu", tr.key)}
                      className={`p-2 rounded border-[2px] text-left ${
                        wybrany
                          ? "bg-[#171714] text-white border-[#171714]"
                          : "bg-white text-[#171714] border-[#B7B6AE]"
                      }`}
                    >
                      <span className="block text-[13px] font-bold">{tr.label}</span>
                      <span
                        className={`block text-[11px] leading-snug mt-0.5 ${
                          wybrany ? "text-white/75" : "text-[#6E6E66]"
                        }`}
                      >
                        {tr.opis}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Spóźniony start (min)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={d.start_wstecz_min ?? ""}
                  onChange={(e) => set("start_wstecz_min", e.target.value)}
                  placeholder="bez limitu"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Spóźniony koniec (min)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={d.koniec_wstecz_min ?? ""}
                  onChange={(e) => set("koniec_wstecz_min", e.target.value)}
                  placeholder="bez limitu"
                  className={inputCls}
                />
              </div>
            </div>
            <p className={helpCls}>
              O ile minut po fakcie pracownik może sam wpisać godzinę rozpoczęcia i
              zakończenia (przy „całej zmianie” liczy się koniec). Puste = bez limitu,
              0 = tylko „teraz”. Godzina spoza okna nie przepada — pracownik wysyła ją
              do Ciebie i zatwierdzasz ją w Zatwierdzaniu zmian.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className={labelCls}>Zamknięcie: po grafiku (godz.)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={d.tolerancja_po_grafiku_h ?? ""}
                  onChange={(e) => set("tolerancja_po_grafiku_h", e.target.value)}
                  placeholder={String(TOLERANCJA_PO_GRAFIKU_H)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Zamknięcie: bez grafiku (godz.)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={d.max_dlugosc_zmiany_h ?? ""}
                  onChange={(e) => set("max_dlugosc_zmiany_h", e.target.value)}
                  placeholder={String(MAX_DLUGOSC_ZMIANY_H)}
                  className={inputCls}
                />
              </div>
            </div>
            <p className={helpCls}>
              Do kiedy niezakończoną zmianę można jeszcze zamknąć samemu: tyle godzin po
              końcu z grafiku albo — bez grafiku — od startu. Potem zmiana przestaje być
              trwającą i trafia do Zatwierdzania zmian; godziny do Twojej decyzji liczą
              się jako zero. Puste = {TOLERANCJA_PO_GRAFIKU_H} godz. po grafiku i{" "}
              {MAX_DLUGOSC_ZMIANY_H} godz. bez grafiku.
            </p>
          </Sekcja>
        </div>

        {/* Przyklejone do dołu przewijanej treści panelu — widoczne zawsze,
            także przy wszystkich sekcjach rozwiniętych. `md:-bottom-6`
            zjada dolny padding <main> (p-6), inaczej pod paskiem prześwituje
            pas treści; na telefonie ten pas i tak zakrywa dolna nawigacja. */}
        <div className="sticky bottom-0 md:-bottom-6 bg-white rounded-b-xl border-t-[2px] border-[#171714] px-5 py-3 flex items-center gap-2">
          <button type="submit" className={btnPrimaryCls}>
            Zapisz
          </button>
          <button type="button" onClick={() => setEditingDict(null)} className={btnSecondaryCls}>
            Anuluj
          </button>
          <button
            type="button"
            onClick={async () => {
              // onArchive pyta o potwierdzenie — kartę zamykamy tylko wtedy,
              // gdy lokal faktycznie trafił do archiwum.
              if (await onArchive("lokale", d.id, true)) setEditingDict(null);
            }}
            className="ml-auto text-xs font-bold text-[#6E6E66] underline flex items-center gap-1"
          >
            <Archive size={13} /> Do archiwum
          </button>
        </div>
      </form>
    );
  };

  // ------------------------------------------------------------ Stanowiska
  const renderStanowiska = () => {
    const lista = pokazArchiwum ? archiwalneStanowiska : aktywneStanowiska;
    // Grupowanie po lokalu: nazwy stanowisk powtarzają się między lokalami
    // ("Kucharz" jest wszędzie), więc płaska lista mówiła mało.
    const grupy = {};
    for (const s of lista) {
      const k = s.lokal_name || "—";
      if (!grupy[k]) grupy[k] = [];
      grupy[k].push(s);
    }
    const nazwyLokali = Object.keys(grupy).sort((a, b) => a.localeCompare(b, "pl"));
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() =>
              setEditingDict({
                id: null,
                name: "",
                lokal_name: aktywneLokale.length > 0 ? aktywneLokale[0].name : "",
              })
            }
            className={`${btnPrimaryCls} flex items-center gap-1.5`}
          >
            <Plus size={15} /> Dodaj stanowisko
          </button>
          <button
            onClick={() => setPokazArchiwum((v) => !v)}
            className="text-xs font-bold text-[#6E6E66] underline ml-auto"
          >
            {pokazArchiwum ? "Pokaż aktywne" : `Archiwum · ${archiwalneStanowiska.length}`}
          </button>
        </div>
        {lista.length === 0 && (
          <p className="text-sm text-[#8F8E86]">
            {pokazArchiwum ? "Archiwum puste." : "Brak stanowisk."}
          </p>
        )}
        <div className="space-y-5">
          {nazwyLokali.map((lokal) => (
            <div key={lokal}>
              <p className={`${statLabelCls} mb-2`}>{lokal}</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {grupy[lokal]
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "pl"))
                  .map((s) => (
                    <div
                      key={s.id}
                      className="bg-white p-3 rounded-xl border-[2px] border-[#171714] flex justify-between items-center gap-2"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {s.kolor && (
                          <span
                            className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                            style={{ backgroundColor: s.kolor }}
                          />
                        )}
                        <p className="font-['Archivo'] font-bold truncate">
                          {s.name}
                          {s.skrot ? ` (${s.skrot})` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {pokazArchiwum ? (
                          <button
                            onClick={() => onArchive("stanowiska", s.id, false)}
                            className="w-8 h-8 border-[2px] border-[#171714] rounded flex items-center justify-center"
                            title="Przywróć z archiwum"
                          >
                            <ArchiveRestore size={14} />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingDict({ ...s })}
                              className="w-8 h-8 border-[2px] border-[#171714] rounded flex items-center justify-center"
                              title="Edytuj"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => onArchive("stanowiska", s.id, true)}
                              className="w-8 h-8 border-[2px] border-[#B7B6AE] rounded flex items-center justify-center text-[#6E6E66] hover:border-[#171714] hover:text-[#171714]"
                              title="Do archiwum"
                            >
                              <Archive size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {editingDict && sekcja === "stanowiska" && (
          <MalyModal
            tytul={`${editingDict.id ? "Edytuj" : "Dodaj"} stanowisko`}
            onSubmit={(e) => onSaveDict(e, "stanowiska")}
            onCancel={() => setEditingDict(null)}
          >
            <div>
              <label className={labelCls}>Nazwa</label>
              <input
                type="text"
                value={editingDict.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
                required
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Lokal</label>
              <select
                value={editingDict.lokal_name}
                onChange={(e) => set("lokal_name", e.target.value)}
                className={inputCls}
                required
              >
                {aktywneLokale.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Skrót (np. "KUCH")</label>
                <input
                  type="text"
                  value={editingDict.skrot || ""}
                  onChange={(e) => set("skrot", e.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="opcjonalnie"
                  className={`${inputCls} uppercase`}
                />
              </div>
              <div>
                <label className={labelCls}>Kolor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editingDict.kolor || "#DE3A22"}
                    onChange={(e) => set("kolor", e.target.value)}
                    className="w-11 h-[38px] border-[2px] border-[#171714] rounded cursor-pointer"
                  />
                  {editingDict.kolor && (
                    <button
                      type="button"
                      onClick={() => set("kolor", "")}
                      className="text-xs font-bold text-[#8F8E86] underline"
                    >
                      Wyczyść
                    </button>
                  )}
                </div>
              </div>
            </div>
          </MalyModal>
        )}
      </div>
    );
  };

  // ----------------------------------------------------------------- Firma
  const renderFirma = () => (
    <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
      <div className={cardCls}>
        <p className={statLabelCls}>Sieć</p>
        <p className="font-['Archivo'] font-extrabold text-xl mt-1">
          {TENANT || <span className="text-[#DE3A22]">&#9888; brak REACT_APP_TENANT</span>}
        </p>
        <p className={helpCls}>
          Nazwa sieci jest częścią konfiguracji wdrożenia {PRODUKT}. Jeśli trzeba ją
          zmienić, zgłoś to nam — nie da się jej zmienić z tego ekranu.
        </p>
      </div>
      <div className={cardCls}>
        <p className={statLabelCls}>Konto właściciela</p>
        <p className="font-['Archivo'] font-extrabold text-xl mt-1">{currentUser?.name}</p>
        <p className="text-sm text-[#6E6E66]">{currentUser?.email || "—"}</p>
        <p className={helpCls}>
          Imię, e-mail i PIN zmienisz w swojej karcie w zakładce Pracownicy.
        </p>
      </div>
    </div>
  );

  // ----------------------------------------------------------- Subskrypcja
  // Na razie tylko miejsce na przyszłość (ustalenie właściciela 2026-09-24).
  // Subskrypcji nie da się trzymać w bazie klienta — w modelu silo klient
  // mógłby ją sobie sam "przedłużyć" — więc gdy powstanie, jej stan przyjdzie
  // z zewnątrz. Liczniki niżej pokazują to, za co najpewniej będzie się płacić.
  const renderSubskrypcja = () => (
    <div className="max-w-3xl space-y-4">
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3">
          <p className={statLabelCls}>Plan</p>
          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#E7E7E2] text-[#6E6E66]">
            wkrótce
          </span>
        </div>
        <p className="text-sm text-[#6E6E66] mt-2">
          Tu pojawi się Twój plan, faktury i zmiana zakresu subskrypcji.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className={cardCls}>
          <p className={statLabelCls}>Lokale</p>
          <p className={statValueCls}>{aktywneLokale.length}</p>
          <p className={statSubCls}>aktywne</p>
        </div>
        <div className={cardCls}>
          <p className={statLabelCls}>Pracownicy</p>
          <p className={statValueCls}>{aktywniPracownicy.length}</p>
          <p className={statSubCls}>aktywne konta</p>
        </div>
        <div className={cardCls}>
          <p className={statLabelCls}>Tablety</p>
          <p className={statValueCls}>{tablety.length}</p>
          <p className={statSubCls}>Tablet Służbowy</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className={pageTitleCls}>Ustawienia</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {SEKCJE.map((s) => (
            <button key={s.key} onClick={() => przejdz(s.key)} className={pillCls(sekcja === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {sekcja === "lokale" && renderLokale()}
      {sekcja === "stanowiska" && renderStanowiska()}
      {sekcja === "firma" && renderFirma()}
      {sekcja === "subskrypcja" && renderSubskrypcja()}

      {nowyLokal && (
        <MalyModal
          tytul="Dodaj lokal"
          onSubmit={zapiszNowyLokal}
          onCancel={() => setEditingDict(null)}
          zapiszLabel="Dodaj"
        >
          <div>
            <label className={labelCls}>Nazwa</label>
            <input
              type="text"
              value={editingDict.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputCls}
              required
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Miasto (do pogody)</label>
            <input
              type="text"
              value={editingDict.miasto || ""}
              onChange={(e) => set("miasto", e.target.value)}
              placeholder="np. Koszalin"
              className={inputCls}
            />
          </div>
          <p className={helpCls}>
            Resztę (bloki na telefonie, płace, progi zmian) ustawisz w karcie lokalu,
            która otworzy się po dodaniu. Puste pola działają z wartościami domyślnymi.
          </p>
        </MalyModal>
      )}
    </div>
  );
}
