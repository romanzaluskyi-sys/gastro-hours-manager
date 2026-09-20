// @ts-nocheck
import React from "react";
import { AlertTriangle } from "lucide-react";
import { PRODUKT, brakujaceZmienne } from "../config";
import ShiftroMark from "./ShiftroMark";

// Ekran "to wdrożenie nie ma konfiguracji".
//
// ⚠️ Istnieje po to, żeby NIE istniał fallback na bazę pierwszego klienta.
// Do 0.40.0 projekt Vercel bez ustawionych zmiennych po cichu podłączał się
// pod bazę "Gastro Emka" i wyglądał na działający — aż ktoś zobaczyłby w nim
// cudzych pracowników. Wybór jest między awarią widoczną a awarią cichą;
// przy danych osobowych czterech lokali to nie jest wybór.
//
// Ten ekran jest świadomie po polsku i techniczny: nie zobaczy go pracownik
// ani kierownik, tylko ten, kto właśnie stawia nowe wdrożenie.
export default function KonfiguracjaBrak() {
  return (
    <div className="min-h-screen bg-[#F1F1EE] flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl border-[2.5px] border-[#171714] w-full max-w-xl">
        <div className="flex justify-center mb-2">
          <ShiftroMark size={44} />
        </div>
        <h1 className="font-['Archivo'] font-extrabold text-2xl text-center mb-1 text-[#171714]">
          {PRODUKT}
        </h1>
        <p className="text-center text-[13px] text-[#8F8E86] mb-6">
          wdrożenie nieskonfigurowane
        </p>

        <div className="bg-[#FAEAE6] border-l-4 border-[#DE3A22] p-4 rounded mb-5">
          <p className="font-bold text-[#8A3A2B] flex items-center gap-2 mb-2">
            <AlertTriangle size={18} /> Brakuje zmiennych środowiskowych
          </p>
          <ul className="text-sm font-mono text-[#8A3A2B] space-y-1">
            {brakujaceZmienne.map((z) => (
              <li key={z}>· {z}</li>
            ))}
          </ul>
        </div>

        <p className="text-[14px] text-[#3C3C36] mb-3">
          Ta aplikacja nie ma wpisanego w kodzie adresu żadnej bazy — każdy
          klient ma własną. Dopóki zmienne nie są ustawione, nie ma z czym się
          połączyć i <strong>tak ma być</strong>: gdyby tu stał adres
          zapasowy, to wdrożenie pokazywałoby dane innego klienta.
        </p>

        <ol className="text-[14px] text-[#3C3C36] space-y-2 mb-5 list-decimal pl-5">
          <li>
            Vercel → Project Settings → Environment Variables — ustaw brakujące
            zmienne dla <strong>Production, Preview i Development</strong>.
          </li>
          <li>
            Zrób <strong>redeploy</strong>. Zmienne <code>REACT_APP_*</code>{" "}
            trafiają do paczki na etapie builda, więc samo ich zapisanie nic
            nie zmienia w już zbudowanej aplikacji.
          </li>
          <li>
            Po wejściu sprawdź, czy pod nazwą produktu stoi nazwa{" "}
            <strong>właściwego klienta</strong>.
          </li>
        </ol>

        <p className="text-[13px] text-[#6E6E66]">
          Pełna procedura uruchomienia nowego klienta:{" "}
          <span className="font-mono">docs/NOWY-KLIENT.md</span>
        </p>
      </div>
    </div>
  );
}
