// @ts-nocheck
// Decyzje odłożone o 6 s ("Cofnij") — wspólne dla "Do decyzji"
// (ZatwierdzanieZmian.tsx) i Pulpitu (szybkie ✓ przy korekcie, "Zamknij" dzień).
//
// Pozycja znika z ekranu od razu, ale zapis rusza dopiero po
// CZAS_NA_COFNIECIE_MS. "Cofnij" w tym czasie po prostu anuluje zapis — nic w
// bazie nie trzeba odkręcać. Najgorszy przypadek (przeglądarka zamknięta w
// tych 6 s mimo pytania) zostawia sprawę tam, gdzie była — bezpieczniej niż
// zapis, którego nie dałoby się cofnąć.
//
// ⚠️ Zapis woła funkcję z NAJNOWSZEGO renderu (akcjeRef), a nie z chwili
// kliknięcia: w ciągu 6 s poll potrafi podmienić `shifts`, a funkcja ze starą
// listą nadpisałaby w stanie świeże wiersze starymi. Argumenty (godziny,
// powód) są za to zamrożone w chwili decyzji.
//
// ⚠️ Wyjście z ekranu zapisuje wszystko, co czeka (cleanup efektu), a
// zamknięcie karty przeglądarki pyta o potwierdzenie (`beforeunload`).
import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export const CZAS_NA_COFNIECIE_MS = 6000;

// akcje: { nazwaFunkcji: async (...args) => {} } — z bieżącego renderu.
// decyduj(pozycje, opis), gdzie pozycje: [{ klucz, zadanie: [nazwa, args] }].
export function useOdlozoneDecyzje(akcje) {
  const akcjeRef = useRef(akcje);
  akcjeRef.current = akcje;
  const kolejka = useRef([]);
  const [odlozone, setOdlozone] = useState({});
  const [toast, setToast] = useState(null);

  const wykonajPartie = async (partia) => {
    const i = kolejka.current.indexOf(partia);
    if (i < 0) return;
    kolejka.current.splice(i, 1);
    clearTimeout(partia.timer);
    setToast((t) => (t && t.partia === partia ? null : t));
    for (const [nazwa, args] of partia.zadania) {
      await akcjeRef.current[nazwa](...args);
    }
    setOdlozone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => delete n[k]);
      return n;
    });
  };

  const decyduj = (pozycje, opis) => {
    if (!pozycje.length) return;
    const partia = {
      klucze: pozycje.map((p) => p.klucz),
      zadania: pozycje.map((p) => p.zadanie),
    };
    partia.timer = setTimeout(() => wykonajPartie(partia), CZAS_NA_COFNIECIE_MS);
    kolejka.current.push(partia);
    setOdlozone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => (n[k] = true));
      return n;
    });
    setToast({ partia, opis });
  };

  const cofnij = () => {
    const partia = toast?.partia;
    if (!partia) return;
    clearTimeout(partia.timer);
    kolejka.current = kolejka.current.filter((p) => p !== partia);
    setOdlozone((prev) => {
      const n = { ...prev };
      partia.klucze.forEach((k) => delete n[k]);
      return n;
    });
    setToast(null);
  };

  useEffect(() => {
    const przyWyjsciu = (e) => {
      if (!kolejka.current.length) return;
      kolejka.current.slice().forEach((p) => wykonajPartie(p));
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", przyWyjsciu);
    return () => {
      window.removeEventListener("beforeunload", przyWyjsciu);
      kolejka.current.slice().forEach((p) => wykonajPartie(p));
    };
  }, []);

  return { odlozone, toast, decyduj, cofnij };
}

export function PasekCofnij({ opis, onCofnij }) {
  return (
    <div
      role="status"
      data-pasek-cofnij
      className="flex items-center gap-3 p-2.5 pl-3.5 bg-[#171714] text-white rounded-lg font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.22)] max-w-[560px]"
    >
      <span className="w-[26px] h-[26px] rounded-full bg-[#E2F3E9] text-[#1F7A4A] flex items-center justify-center flex-shrink-0">
        <Check size={15} strokeWidth={3} />
      </span>
      <span className="min-w-0">{opis}</span>
      <button
        type="button"
        onClick={onCofnij}
        className="ml-auto px-2.5 py-2 font-extrabold underline underline-offset-[3px]"
      >
        Cofnij
      </button>
    </div>
  );
}
