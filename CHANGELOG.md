# Changelog

Historia widocznych zmian w aplikacji. Numer wersji wyświetla się na
ekranie logowania (`Godziny Gastro Emka v{APP_VERSION}` — stała w
`src/config.ts`). Zasady wersjonowania i kto aktualizuje ten plik: patrz
CLAUDE.md, sekcja "Wersjonowanie i CHANGELOG".

## 0.4.0 — 2026-08-28

- **Zapisywanie zmiany jest teraz natychmiastowe.** Wcześniej formularz
  czekał na odpowiedź od Google Sheets (bywało to nawet do pół minuty,
  najbardziej dotkliwe pod koniec zmiany, gdy kilka osób zapisuje się pod
  rząd na jednym tablecie) zanim pokazał "Zapisano". Supabase (prawdziwe
  źródło danych) zapisuje się od razu, a synchronizacja z Google Sheets
  leci teraz w tle.
- **Zalogowanie przetrwa odświeżenie strony.** Wcześniej każde odświeżenie
  (albo nowy deploy aplikacji) wylogowywało i trzeba było logować się od
  nowa. Teraz sesja zostaje zapamiętana w przeglądarce do czasu ręcznego
  wylogowania.

## 0.3.4 — 2026-08-28

- Na kiosku (Tablet Służbowy) powiadomienie o zbliżającym się terminie
  sanepid/umowy teraz pokazuje, którego pracownika dotyczy — wcześniej przy
  kilku osobach na jednym urządzeniu nie było wiadomo, do kogo należy.

## 0.3.3 — 2026-08-28

- Powiadomienie dla kierownika o zbliżającym się/przeterminowanym terminie
  sanepid/umowy zawiera teraz imię pracownika, stanowisko, lokal, dokładną
  datę i liczbę dni — nie trzeba wchodzić do aplikacji, żeby wiedzieć, o co
  chodzi.

## 0.3.2 — 2026-08-28

- Naprawiono ciche gubienie powiadomień o terminach sanepid/umowy (baza
  odrzucała zapis, a system mimo to oznaczał sprawę jako "obsłużoną").

## 0.3.1 — 2026-08-28

- Naprawiono awarię codziennej weryfikacji terminów sanepid/umowy tuż po
  wdrożeniu (błąd techniczny w funkcji, zero wpływu na resztę aplikacji).

## 0.3.0 — 2026-08-28

- **Terminy dokumentów pracownika.** Karta pracownika ma teraz dwa pola:
  termin książeczki sanepid i termin umowy. Puste pole jest podświetlone,
  żeby zwrócić uwagę kierownika. Codziennie automatycznie sprawdzane —
  powiadomienie do kierownika lokalu i do samego pracownika miesiąc przed,
  2 tygodnie przed, codziennie w ostatnim tygodniu i codziennie po
  przeterminowaniu, aż termin zostanie zaktualizowany.

## 0.2.0 — 2026-08-28

- Kierownicy dostali własną zakładkę **Powiadomienia** (wcześniej
  powiadomienia widzieli tylko pracownicy).
- Wewnętrzna reorganizacja kodu (bez zmian w działaniu aplikacji) — mniejsze
  ryzyko przy każdej kolejnej zmianie.

## 0.1.2 i wcześniej

Historia sprzed wprowadzenia tego pliku nie została spisana wstecznie.
