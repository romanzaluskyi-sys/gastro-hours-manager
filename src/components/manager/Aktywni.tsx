// @ts-nocheck
// "Kto jest teraz w pracy" — lista trwających zmian z żywym licznikiem
// czasu. Kolumna GRAFIK z makiety świadomie pominięta — wymaga
// zaplanowanych godzin z modułu Grafik, którego jeszcze nie ma (patrz plan
// sesji, "Poza zakresem").
import React, { useEffect, useState } from "react";
import { Clock, Hourglass } from "lucide-react";
import { pageTitleCls, sectionCardCls } from "./designTokens";
import { zmianaTrwa } from "../../utils/porzucone";

const fmtHM = (d) =>
  d
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : "";

const fmtElapsed = (ms) => {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};

export default function Aktywni({
  shifts,
  planShifts = [],
  lokale = [],
  users = [],
  matchesFilter,
  onEndShift,
  onNameClick,
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // ⚠️ Dwie listy, nie jedna. Zmiana, której nikt nie zakończył, wisiała tu
  // razem z prawdziwymi — czerwony licznik po ośmiu godzinach był jedyną
  // różnicą, więc ekran "Kto jest teraz w pracy" mówił nieprawdę o tym,
  // ile osób jest w lokalu. Próg liczy utils/porzucone.ts.
  const otwarte = shifts
    .filter((s) => !s.end_time && !s.rozliczenie && matchesFilter(s.lokal))
    .sort((a, b) => a.start_time - b.start_time);
  const active = otwarte.filter((s) =>
    zmianaTrwa({ shift: s, planShifts, lokale, users, now })
  );
  const porzucone = otwarte.filter(
    (s) => !zmianaTrwa({ shift: s, planShifts, lokale, users, now })
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className={pageTitleCls}>Kto jest teraz w pracy</h2>
        <span className="text-sm text-[#6E6E66]">{active.length} osób</span>
      </div>

      {active.length === 0 && (
        <div className="bg-white p-8 rounded-xl border-[2px] border-[#171714] text-center text-[#8F8E86]">
          Nikt teraz nie pracuje.
        </div>
      )}

      {active.length > 0 && (
      <div className={sectionCardCls}>
        <div className="divide-y divide-[#B7B6AE]">
          {active.map((s) => {
            const elapsedMs = Math.max(0, now - s.start_time);
            const long = elapsedMs > 8 * 3600000;
            return (
              <div
                key={s.id}
                className="px-4 py-3 flex items-center flex-nowrap gap-2 md:gap-4"
              >
                <div className="w-8 h-8 rounded-full bg-[#EAF4EC] text-[#2E6B44] flex items-center justify-center flex-shrink-0">
                  <Clock size={15} />
                </div>
                <button
                  type="button"
                  onClick={() => s.user_id && onNameClick(s.user_id, s.start_time)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="font-['Archivo'] font-bold text-[13px] md:text-base truncate hover:underline hover:text-[#DE3A22]">
                    {s.user_name}
                  </p>
                  <p className="text-[11px] md:text-xs text-[#6E6E66] truncate">
                    {s.lokal} · {s.stanowisko}
                  </p>
                </button>
                <span className="bg-[#FAEAE6] text-[#8A3A2B] text-[10px] md:text-xs font-bold uppercase tracking-wide whitespace-nowrap rounded px-2 py-1 flex-shrink-0">
                  od {fmtHM(s.start_time)}
                </span>
                <span
                  className={`font-['Archivo'] font-extrabold text-[13px] md:text-lg tabular-nums flex-shrink-0 text-right ${
                    long ? "text-[#DE3A22]" : "text-[#171714]"
                  }`}
                >
                  {fmtElapsed(elapsedMs)}
                </span>
                <button
                  onClick={() => onEndShift(s)}
                  className="bg-[#DE3A22] text-white font-['Archivo'] font-bold rounded hover:opacity-90 px-2.5 py-1.5 text-[11px] md:px-4 md:py-2.5 md:text-sm flex-shrink-0 whitespace-nowrap"
                >
                  Zakończ zmianę
                </button>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Te zmiany nie są już "w toku" — ktoś wyszedł i nie odbił końca.
          Godzin nikomu nie dopisujemy, więc dopóki kierownik nie zdecyduje,
          liczą się jako zero. Decyzja żyje w Zatwierdzaniu zmian; tutaj jest
          tylko po to, żeby ekran "kto jest w lokalu" nie kłamał. */}
      {porzucone.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h3 className="font-['Archivo'] font-extrabold text-lg flex items-center gap-2">
              <Hourglass size={18} /> Bez zakończenia · {porzucone.length}
            </h3>
          </div>
          <p className="text-[13px] text-[#6E6E66] mb-3 max-w-[70ch]">
            Zmiana zaczęta i nieodbita do końca. Te godziny nie liczą się
            nikomu, dopóki nie rozstrzygniesz ich w zakładce Zatwierdzanie zmian
            — albo nie uzupełnisz tutaj.
          </p>
          <div className={sectionCardCls}>
            <div className="divide-y divide-[#B7B6AE]">
              {porzucone.map((s) => (
                <div
                  key={s.id}
                  className="px-4 py-3 flex items-center flex-nowrap gap-2 md:gap-4"
                >
                  <div className="w-8 h-8 rounded-full bg-[#FAEAE6] text-[#8A3A2B] flex items-center justify-center flex-shrink-0">
                    <Hourglass size={15} />
                  </div>
                  <button
                    type="button"
                    onClick={() => s.user_id && onNameClick(s.user_id, s.start_time)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="font-['Archivo'] font-bold text-[13px] md:text-base truncate hover:underline hover:text-[#DE3A22]">
                      {s.user_name}
                    </p>
                    <p className="text-[11px] md:text-xs text-[#6E6E66] truncate">
                      {s.lokal} · {s.stanowisko}
                    </p>
                  </button>
                  <span className="bg-[#EAEAE5] text-[#4A4A43] text-[10px] md:text-xs font-bold uppercase tracking-wide whitespace-nowrap rounded px-2 py-1 flex-shrink-0">
                    {s.start_time.toLocaleDateString("pl-PL", {
                      day: "2-digit",
                      month: "2-digit",
                    })}{" "}
                    od {fmtHM(s.start_time)}
                  </span>
                  <button
                    onClick={() => onEndShift(s)}
                    className="bg-white border-[2px] border-[#171714] font-['Archivo'] font-bold rounded px-2.5 py-1.5 text-[11px] md:px-4 md:py-2.5 md:text-sm flex-shrink-0 whitespace-nowrap"
                  >
                    Uzupełnij godziny
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
