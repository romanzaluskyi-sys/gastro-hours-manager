// @ts-nocheck
// "Kto jest teraz w pracy" — lista trwających zmian z żywym licznikiem
// czasu. Kolumna GRAFIK z makiety świadomie pominięta — wymaga
// zaplanowanych godzin z modułu Grafik, którego jeszcze nie ma (patrz plan
// sesji, "Poza zakresem").
import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { pageTitleCls, sectionCardCls } from "./designTokens";

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

export default function Aktywni({ shifts, matchesFilter, onEndShift }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const active = shifts
    .filter((s) => !s.end_time && matchesFilter(s.lokal))
    .sort((a, b) => a.start_time - b.start_time);

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
                <div className="flex-1 min-w-0">
                  <p className="font-['Archivo'] font-bold text-[13px] md:text-base truncate">
                    {s.user_name}
                  </p>
                  <p className="hidden md:block text-xs text-[#6E6E66]">
                    {s.lokal} · {s.stanowisko}
                  </p>
                </div>
                <span className="hidden md:inline text-sm text-[#6E6E66] w-16 flex-shrink-0">
                  od {fmtHM(s.start_time)}
                </span>
                <span
                  className={`font-['Archivo'] font-extrabold text-[13px] md:text-lg tabular-nums w-12 md:w-16 flex-shrink-0 text-right ${
                    long ? "text-[#DE3A22]" : "text-[#171714]"
                  }`}
                  title={`Od ${fmtHM(s.start_time)}`}
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
    </div>
  );
}
