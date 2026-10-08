// @ts-nocheck
// Znacznik „DEMO” nad aplikacją w wersji demonstracyjnej (0.72.0) — mała
// zakładka przy prawej krawędzi ekranu, po dotknięciu panel z podpowiedzią,
// zmianą roli, otwarciem innej roli w nowej karcie i przywróceniem danych.
//
// ⚠️ Zakładka jest PRZY KRAWĘDZI, a nie paskiem na górze: panel kierownika i
// ekrany pracownika mają `h-screen` — pasek doklejony nad nimi przesunąłby
// dolny pasek zakładek pod krawędź ekranu na telefonie.
//
// „Przywróć dane demo” widzi tylko konto „Panel kierownika” i woła ten sam
// endpoint co nocny cron (api/cron/demo-reset.js), który sam sprawdza token w
// Supabase. Przycisk jest dla prowadzącego prezentację: ktoś przed nim mógł
// pozmieniać grafik i zamknąć wszystkie sprawy w „Do decyzji”.
import React, { useState } from "react";
import { X, RotateCcw, LogOut, RefreshCw } from "lucide-react";
import { KONTA_DEMO, podpowiedzDlaRoli } from "../demo";
import { token } from "../api/auth";

const DemoPasek = ({ currentUser, onZmienRole }) => {
  const [otwarty, setOtwarty] = useState(false);
  const [potwierdz, setPotwierdz] = useState(false);
  const [trwa, setTrwa] = useState(false);
  const [blad, setBlad] = useState("");

  if (!currentUser) return null;
  const jestWlascicielem = currentUser.email === KONTA_DEMO[0].email;

  const przywroc = async () => {
    setTrwa(true);
    setBlad("");
    try {
      const t = await token();
      const res = await fetch("/api/cron/demo-reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      });
      const odp = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(odp.error || `Błąd ${res.status}`);
      window.location.reload();
    } catch (e) {
      setBlad(e.message || "Nie udało się przywrócić danych.");
      setTrwa(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOtwarty(true)}
        data-demo-pasek
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[150] bg-[#DE3A22] text-white font-['Archivo'] font-extrabold text-[11px] tracking-[0.18em] px-1.5 py-3 rounded-l-lg shadow-lg"
        style={{ writingMode: "vertical-rl" }}
        title="Wersja demonstracyjna"
      >
        DEMO
      </button>
      {otwarty && (
        <div className="fixed inset-0 z-[160] bg-black/30 flex justify-end" onClick={() => setOtwarty(false)}>
          <div
            className="bg-white w-full max-w-sm h-full overflow-y-auto p-5 border-l-[2.5px] border-[#171714]"
            onClick={(e) => e.stopPropagation()}
            data-demo-panel
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.18em] text-[#DE3A22]">WERSJA DEMO</p>
                <p className="font-['Archivo'] font-extrabold text-lg text-[#171714] mt-1">
                  {currentUser.name}
                </p>
              </div>
              <button type="button" onClick={() => setOtwarty(false)} className="p-1 text-[#6B6A63]" aria-label="Zamknij">
                <X size={20} />
              </button>
            </div>
            <p className="text-[14px] text-[#3A3A35] leading-relaxed mt-3">
              {podpowiedzDlaRoli(currentUser.role)}
            </p>
            <p className="text-[13px] text-[#6B6A63] leading-relaxed mt-3">
              Dane są wymyślone i wracają do stanu początkowego co noc. E-maile w demo nie wychodzą.
            </p>

            <p className="text-[11px] font-bold tracking-[0.12em] text-[#8F8E86] mt-6 mb-2">INNA ROLA</p>
            <div className="grid gap-2">
              {KONTA_DEMO.filter((k) => k.email !== currentUser.email).map((k) => (
                <a
                  key={k.klucz}
                  href={`?jako=${k.klucz}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-2 border-[#E4E4DE] rounded-lg px-3 py-2.5 text-[14px] font-bold text-[#171714] hover:border-[#171714]"
                >
                  {k.tytul} <span className="text-[#8F8E86] font-normal">· w nowej karcie ↗</span>
                </a>
              ))}
              <button
                type="button"
                onClick={onZmienRole}
                className="border-2 border-[#171714] rounded-lg px-3 py-2.5 text-[14px] font-bold text-[#171714] flex items-center gap-2"
              >
                <LogOut size={16} /> Wróć do wyboru roli
              </button>
            </div>

            {jestWlascicielem && (
              <>
                <p className="text-[11px] font-bold tracking-[0.12em] text-[#8F8E86] mt-6 mb-2">PREZENTACJA</p>
                {!potwierdz ? (
                  <button
                    type="button"
                    onClick={() => setPotwierdz(true)}
                    className="w-full border-2 border-[#E4E4DE] rounded-lg px-3 py-2.5 text-[14px] font-bold text-[#171714] flex items-center gap-2 hover:border-[#171714]"
                  >
                    <RotateCcw size={16} /> Przywróć dane demo
                  </button>
                ) : (
                  <div className="border-2 border-[#DE3A22] rounded-lg p-3">
                    <p className="text-[13px] text-[#3A3A35] leading-snug">
                      Wszystko, co ktokolwiek wpisał dziś w demo, zniknie — także w innych kartach i
                      na innych urządzeniach. Potrwa to kilkanaście sekund.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        disabled={trwa}
                        onClick={przywroc}
                        className="flex-1 bg-[#DE3A22] text-white rounded-lg px-3 py-2 text-[14px] font-bold flex items-center justify-center gap-2"
                      >
                        {trwa ? <RefreshCw size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                        {trwa ? "Przywracam…" : "Tak, przywróć"}
                      </button>
                      <button
                        type="button"
                        disabled={trwa}
                        onClick={() => setPotwierdz(false)}
                        className="border-2 border-[#171714] rounded-lg px-3 py-2 text-[14px] font-bold"
                      >
                        Nie
                      </button>
                    </div>
                  </div>
                )}
                {blad && <p className="text-[13px] font-bold text-[#DE3A22] mt-2">{blad}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default DemoPasek;
