// @ts-nocheck
// Pasek "dostępna nowa wersja" — dotyczy WSZYSTKICH ról (kiosk, konto
// osobiste, kierownik), więc żyje w App.tsx, nie w ManagerDashboard.
//
// Mechanizm: `public/version.json` to statyczny plik, deployowany razem z
// resztą apki. Otwarta karta ma w pamięci STARY bundle (i starą wartość
// APP_VERSION ze src/config.ts) nawet po nowym deployu, więc porównujemy ją
// z version.json pobieranym na bieżąco (z cache-bustingiem) — różnica
// oznacza, że ktoś zdeployował nowszą wersję, a ta karta o tym nie wie.
//
// ⚠️ WAŻNE przy każdym bumpie APP_VERSION (patrz CLAUDE.md "Wersjonowanie i
// CHANGELOG"): zaktualizuj też public/version.json na tę samą wartość —
// inaczej ten pasek nigdy się nie pokaże (albo pokaże się od razu po
// starym deployu, jeśli zapomnisz zaktualizować przy poprzednim bumpie).
import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { APP_VERSION } from "../config";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function UpdateBanner() {
  const [newVersion, setNewVersion] = useState(null);

  useEffect(() => {
    const check = () => {
      fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.version && data.version !== APP_VERSION) {
            setNewVersion(data.version);
          }
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  if (!newVersion) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[200] bg-[#171714] text-white px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap text-sm">
      <span>
        Dostępna nowa wersja <b>{newVersion}</b> — odśwież stronę, żeby ją zobaczyć.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="bg-[#DE3A22] text-white font-bold px-3 py-1.5 rounded flex items-center gap-1.5 flex-shrink-0"
      >
        <RefreshCw size={14} /> Odśwież teraz
      </button>
    </div>
  );
}
