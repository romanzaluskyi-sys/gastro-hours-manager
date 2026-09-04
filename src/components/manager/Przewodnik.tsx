// @ts-nocheck
// Krótki przewodnik po panelu — statyczna treść, po jednej sekcji na
// zakładkę. Aktualizować przy każdej większej zmianie w danej zakładce.
//
// Druga mini-zakładka "Historia wersji" — skrócone podsumowanie
// CHANGELOG.md w repo (ten plik zostaje pełnym źródłem prawdy; tu tylko
// ostatnie kilka wersji, żeby dało się zobaczyć "co nowego" bez wychodzenia
// z apki). ⚠️ Aktualizować ręcznie razem z CHANGELOG.md przy każdym bumpie
// APP_VERSION — patrz CLAUDE.md "Wersjonowanie i CHANGELOG".
import React, { useState } from "react";
import {
  Home,
  CheckCircle2,
  FileText,
  Clock,
  Flag,
  Users,
  BarChart3,
  User,
} from "lucide-react";
import { APP_VERSION } from "../../config";
import { pageTitleCls, sectionCardCls, sectionHeaderCls } from "./designTokens";

const CHANGELOG = [
  {
    version: "0.17.0",
    date: "2026-09-03",
    items: [
      "Grafik — tryb Edycja: '+ dodaj' w pustych komórkach, okno przypisania zmiany z podpowiadanymi godzinami, 'Przypisz i dodaj następną'.",
      "Blokujemy tylko nachodzące godziny, urlop i zgłoszony brak dostępności — zmiana dzielona między lokalami jest dozwolona.",
      "'Kopiuj z poprzedniego tygodnia' i 'Wyślij grafik pracownikom' — do wysłania grafik jest wersją roboczą.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-09-03",
    items: [
      "Grafik — widok tygodnia: pracownicy w wierszach, siedem dni w kolumnach, osobna tabela na lokal. Urlopy, brak dostępności i praca w innym lokalu widoczne w komórkach.",
      "Dni z niepełną obsadą oznaczone na czerwono — najedź na liczbę, żeby zobaczyć na jakim stanowisku i w jakich godzinach brakuje ludzi.",
      "Sortowanie pracowników, legenda stanowisk i eksport tygodnia do CSV.",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-09-03",
    items: [
      "Nowa zakładka Grafik — na razie sekcja Konfiguracja: godziny otwarcia lokalu, wymagania obsady na stanowisko (dni, godziny, ile osób) i wyjątki na konkretne daty.",
      "Wymagania obsady obowiązują od wybranego miesiąca — można je skopiować na kolejny zamiast wpisywać od nowa.",
      "W karcie pracownika: lista innych stanowisk, na których umie pracować.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-09-03",
    items: [
      "Wnioski o urlop i niedostępność — pracownik wysyła w Zgłoś, kierownik zatwierdza w Zatwierdzanie zmian. Zatwierdzony urlop wpisuje się jako godziny automatycznie.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-09-03",
    items: [
      "Pogoda w pasku kierownika i na Pulpicie pracownika — aktualna temperatura dla miasta lokalu (Pracownicy → Lokale).",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-09-03",
    items: [
      "Stanowiska mają teraz własny skrót i kolor (Pracownicy → Stanowiska) — widoczne jako plakietka przy godzinach w koncie pracownika, Rejestrze Godzin i Mojej Pracy.",
    ],
  },
  {
    version: "0.11.1",
    date: "2026-09-04",
    items: [
      "Poprawka: strzałki nawigacji dat w Zadaniach i sprzątaniu nie przesuwają się już pod przycisk „Dziś” — kliknięcie daty pozwala też wybrać konkretny dzień.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-09-04",
    items: [
      "Zadania przypisane do stanowiska są teraz wspólne — odhaczenie przez jedną osobę liczy się dla wszystkich z tym stanowiskiem.",
      "Nowy formularz zadania: lokal i odbiorca razem, cała konfiguracja terminu w jednym miejscu, typ „Ogólne” domyślny.",
      "Kafelek „Zadania dziś” na Pulpicie kierownika już nie zależy od tego, czy ktoś odbił zmianę.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-09-03",
    items: [
      "Zadania: priorytet (niski/średni/wysoki) i dowolny wybór dni tygodnia zamiast jednego dnia, plus typ „Ogólne” na dowolną porę dnia.",
      "Panel kierownika: sekcja „Niewykonane dzisiaj”, pełna lista zadań z filtrem po lokalu/stanowisku, kafelek „Zadania dziś” na Pulpicie.",
      "Zgłoszenie można od razu zamienić w zadanie dla kierownika.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-09-02",
    items: [
      "Nowa zakładka Zadania i sprzątanie — checklisty na zmianę (poranne/obiadowe/wieczorne) i zadania cykliczne, wspólne dla lokalu albo osobne dla każdego pracownika.",
      "Panel „Kontrola wykonania po osobach” — kierownik widzi na bieżąco postęp każdego pracownika i zadania wspólne dla lokalu.",
      "Pracownik widzi swoje zadania na dziś, z paskiem postępu w trakcie zmiany i podsumowaniem po jej zakończeniu.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-09-02",
    items: [
      "Nowy Panel Kierownika — Pulpit, Zatwierdzanie zmian, Rejestr Godzin, Aktywni, Zgłoszenia, Pracownicy, Raporty i koszty w nowym, spójnym stylu.",
      "Poprawka godzin od pracownika trafia do prawdziwej kolejki decyzji (Zatwierdzanie zmian) zamiast tylko zgłoszenia tekstowego.",
      "Karta pracownika: stawka, etat, notatki kierownika, PIN blokady na kiosku ustawiane wprost w formularzu.",
      "Raport godzin i kosztów per pracownik + historia poprawek każdej zmiany.",
      "Nowy ekran logowania i pasek „dostępna nowa wersja”.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-08-31",
    items: [
      "Ten sam nowy wygląd co na kiosku, teraz też na osobistym telefonie pracownika.",
      "Małe podkreślone „Wyloguj” w zakładce Więcej.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-08-31",
    items: [
      "Nowy wygląd Tabletu Służbowego — wybór siebie z listy, potem własny pulpit.",
      "Blokada profilu na kiosku 4-cyfrowym PIN-em.",
      "„Zgłoś” można wysłać anonimowo i przypiąć do konkretnej zmiany.",
      "Urządzenie samo wraca do ekranu logowania po aktualizacji aplikacji.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-08-28",
    items: [
      "Nie da się już zapisać dwóch nakładających się zmian.",
      "Przypomnienie o już zarejestrowanych dziś zmianach.",
      "Naprawiono błąd zapisu nowego pracownika z pustymi terminami.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-08-28",
    items: [
      "Zapisywanie zmiany jest teraz natychmiastowe (bez czekania na Google Sheets).",
      "Zalogowanie przetrwa odświeżenie strony.",
    ],
  },
];

const SECTIONS = [
  {
    Icon: Home,
    title: "Pulpit",
    body: "Ekran startowy. Godziny dziś/w tym tygodniu, koszt miesiąca (jeśli pracownikom ustawiono stawkę), skrót do zgłoszeń czekających na decyzję, kto teraz pracuje i czyje terminy sanepid/umowy się kończą. To dobre miejsce, żeby zacząć dzień.",
  },
  {
    Icon: CheckCircle2,
    title: "Zatwierdzanie zmian",
    body: "Tu trafiają poprawki godzin zgłoszone przez pracowników przez „Zgłoś → Popraw zmianę”. Dla każdej: Zatwierdź (przyjmujesz dane tak, jak podał pracownik), Popraw (wpisujesz własne godziny + podajesz powód — pracownik go zobaczy), albo Zapytaj (gdy zgłoszenie jest niekompletne, np. brak godziny zakończenia). Zatwierdzone zmiany od razu trafiają do Rejestru Godzin. Nad tą kolejką: osobna sekcja „Wnioski o wolne” — urlop albo dni niedostępności zgłoszone przez pracowników przez „Zgłoś → Wolne / urlop”. Zatwierdzony urlop od razu wpisuje się jako godziny (8h za dzień roboczy) we wszystkich raportach.",
  },
  {
    Icon: FileText,
    title: "Rejestr Godzin",
    body: "Wszystkie zapisane zmiany, pogrupowane po stanowisku. Szukaj po imieniu/stanowisku/dacie/godzinie, sortuj, dodawaj wpis ręcznie (+ Dodaj wpis) dla dowolnego pracownika. Ikona zegara (Historia) przy wierszu pokazuje, kto i kiedy poprawił daną zmianę oraz dlaczego. Eksport CSV zapisuje aktualnie widoczny (przefiltrowany) miesiąc.",
  },
  {
    Icon: Clock,
    title: "Aktywni",
    body: "Kto w tej chwili pracuje, z licznikiem czasu na żywo (podświetla się na czerwono po 8h). „Zakończ zmianę” zamyka zmianę ręcznie — przydaje się, gdy ktoś zapomniał odbić wyjście.",
  },
  {
    Icon: Flag,
    title: "Zgłoszenia",
    body: "Wolne zgłoszenia od pracowników (nie poprawki godzin — te są w Zatwierdzanie zmian) — awarie, braki, uwagi, czasem anonimowe. „Oznacz jako rozwiązane” zamyka temat.",
  },
  {
    Icon: Users,
    title: "Pracownicy",
    body: "Lista + karta szczegółów. Klikasz osobę z listy po lewej, edytujesz po prawej. Lokal i stanowisko są wymagane (poza kontem typu „Tablet lokalu”); przy koncie logującym się samodzielnie — też email i PIN. Stawka/etat/notatki są opcjonalne. „PIN blokady na kiosku” dotyczy tylko kont typu „Otwarte Konto” używanych na wspólnym tablecie. Sekcja „Urlop” pozwala od razu wpisać urlop pracownikowi (od-do), bez czekania na wniosek — zatwierdzony automatycznie. Usunięcie na zawsze jest możliwe tylko z zakładki Archiwum — najpierw zarchiwizuj, potem usuń. Lokale i Stanowiska (przyciski przy Aktywni/Archiwum, tylko dla Szefa) to osobny, rzadko używany słownik nazw.",
  },
  {
    Icon: BarChart3,
    title: "Raporty i koszty",
    body: "Zestawienie miesięczne wg lokalu i wg pracownika. Kliknij pracownika po lewej, żeby zobaczyć jego pełny raport (zmiany, godziny, koszt) po prawej — to samo miejsce, do którego prowadzi kliknięcie imienia w Rejestr Godzin i Aktywni.",
  },
  {
    Icon: User,
    title: "Moja Praca",
    body: "Kierownik też odbija godziny — to Twój własny „Zmiana”/„Raport”, dokładnie jak u pracownika. Ikonka osoby przy dzwoneczku u góry prowadzi tu z każdej zakładki.",
  },
];

export default function Przewodnik() {
  const [view, setView] = useState("instrukcja"); // "instrukcja" | "wersje"

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className={pageTitleCls}>Przewodnik</h2>
          <p className="text-sm text-[#6E6E66] mt-1">
            {view === "instrukcja"
              ? "Krótko o tym, co robi każda zakładka."
              : "Skrót zmian — pełna historia w CHANGELOG.md."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("instrukcja")}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              view === "instrukcja"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Jak korzystać
          </button>
          <button
            onClick={() => setView("wersje")}
            className={`px-3 py-2 rounded text-sm font-bold border-[2px] ${
              view === "wersje"
                ? "bg-[#171714] text-white border-[#171714]"
                : "bg-white text-[#171714] border-[#B7B6AE]"
            }`}
          >
            Historia wersji
          </button>
        </div>
      </div>

      {view === "instrukcja" && (
        <div className="space-y-4">
          {SECTIONS.map(({ Icon, title, body }) => (
            <div key={title} className={sectionCardCls}>
              <div className={sectionHeaderCls}>
                <span className="flex items-center gap-2">
                  <Icon size={17} />
                  {title}
                </span>
              </div>
              <p className="p-4 text-[14px] text-[#171714] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      )}

      {view === "wersje" && (
        <div className="space-y-4">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className={sectionCardCls}>
              <div className={sectionHeaderCls}>
                <span className="flex items-center gap-2">
                  v{entry.version}
                  {entry.version === APP_VERSION && (
                    <span className="bg-[#DE3A22] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                      bieżąca
                    </span>
                  )}
                </span>
                <span className="text-xs font-normal text-[#8F8E86]">{entry.date}</span>
              </div>
              <ul className="p-4 space-y-1.5 text-[14px] text-[#171714] list-disc list-inside">
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
