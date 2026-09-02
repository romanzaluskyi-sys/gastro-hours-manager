// @ts-nocheck
// Krótki przewodnik po panelu — statyczna treść, po jednej sekcji na
// zakładkę. Aktualizować przy każdej większej zmianie w danej zakładce.
import React from "react";
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
import { pageTitleCls, sectionCardCls, sectionHeaderCls } from "./designTokens";

const SECTIONS = [
  {
    Icon: Home,
    title: "Pulpit",
    body: "Ekran startowy. Godziny dziś/w tym tygodniu, koszt miesiąca (jeśli pracownikom ustawiono stawkę), skrót do zgłoszeń czekających na decyzję, kto teraz pracuje i czyje terminy sanepid/umowy się kończą. To dobre miejsce, żeby zacząć dzień.",
  },
  {
    Icon: CheckCircle2,
    title: "Zatwierdzanie zmian",
    body: "Tu trafiają poprawki godzin zgłoszone przez pracowników przez „Zgłoś → Popraw zmianę”. Dla każdej: Zatwierdź (przyjmujesz dane tak, jak podał pracownik), Popraw (wpisujesz własne godziny + podajesz powód — pracownik go zobaczy), albo Zapytaj (gdy zgłoszenie jest niekompletne, np. brak godziny zakończenia). Zatwierdzone zmiany od razu trafiają do Rejestru Godzin.",
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
    body: "Lista + karta szczegółów. Klikasz osobę z listy po lewej, edytujesz po prawej. Lokal i stanowisko są wymagane (poza kontem typu „Tablet lokalu”); przy koncie logującym się samodzielnie — też email i PIN. Stawka/etat/notatki są opcjonalne. „PIN blokady na kiosku” dotyczy tylko kont typu „Otwarte Konto” używanych na wspólnym tablecie. Usunięcie na zawsze jest możliwe tylko z zakładki Archiwum — najpierw zarchiwizuj, potem usuń. Lokale i Stanowiska (przyciski przy Aktywni/Archiwum, tylko dla Szefa) to osobny, rzadko używany słownik nazw.",
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
  return (
    <div className="max-w-3xl mx-auto">
      <h2 className={`${pageTitleCls} mb-2`}>Przewodnik</h2>
      <p className="text-sm text-[#6E6E66] mb-6">
        Krótko o tym, co robi każda zakładka Panelu Kierownika.
      </p>
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
    </div>
  );
}
