// @ts-nocheck
import React from "react";
import { PRODUKT, APP_VERSION, TENANT } from "../config";
import { zapiszBlad } from "../api/errors";

// Ostatnia siatka pod całą aplikacją.
//
// Bez niej wyjątek przy renderowaniu gasi CAŁE drzewo Reacta i zostaje biała
// strona — na tablecie w kuchni, w środku zmiany, bez żadnej wskazówki co
// robić. Biała strona jest przy tym nie do odróżnienia od zepsutego internetu,
// więc pierwszą reakcją bywa restart routera.
//
// ⚠️ To musi być komponent KLASOWY — `componentDidCatch` nie ma odpowiednika
// w hookach i nie da się tego napisać jako funkcji.
//
// ⚠️ Świadomie NIE ma tu przycisku "spróbuj ponownie" (reset stanu błędu).
// Render, który się wywalił, wywali się drugi raz na tych samych danych, a
// przycisk, który nic nie zmienia, uczy ludzi, że klikanie nie pomaga.
// Odświeżenie strony pobiera dane od nowa i jest jedyną drogą, która czasem
// naprawdę pomaga.
export default class ErrorBoundary extends React.Component<
  { children?: React.ReactNode },
  { blad: any }
> {
  constructor(props) {
    super(props);
    this.state = { blad: null };
  }

  static getDerivedStateFromError(blad) {
    return { blad };
  }

  componentDidCatch(blad, info) {
    zapiszBlad("render", blad, info && info.componentStack);
  }

  render() {
    if (!this.state.blad) return this.props.children;

    return (
      <div className="min-h-screen bg-[#F1F1EE] flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-xl border-[2.5px] border-[#171714] w-full max-w-md">
          <h1 className="font-['Archivo'] font-extrabold text-xl text-[#171714] mb-2">
            Coś się zepsuło
          </h1>
          <p className="text-[15px] text-[#3C3C36] mb-4">
            Ten ekran się nie wyświetlił. Odśwież stronę — jeśli błąd wróci,
            powiedz o tym kierownikowi.{" "}
            <strong>Twoje godziny są bezpieczne</strong>: wszystko, co zostało
            zapisane przed tym momentem, jest w bazie.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="w-full bg-[#DE3A22] text-white font-['Archivo'] font-bold py-3 rounded-lg border-[2.5px] border-[#171714] mb-4"
          >
            Odśwież stronę
          </button>

          {/* Techniczne szczegóły małym drukiem: pracownik ich nie czyta, ale
              kierownik może je przeczytać przez telefon, a to skraca diagnozę
              z "nie działa" do konkretu. */}
          <p className="text-[11px] text-[#8F8E86] font-mono break-words">
            {PRODUKT} {APP_VERSION}
            {TENANT ? ` · ${TENANT}` : ""} ·{" "}
            {String(this.state.blad.message || this.state.blad).slice(0, 200)}
          </p>
        </div>
      </div>
    );
  }
}
