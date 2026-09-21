#!/usr/bin/env python3
"""Co widzi i co może zmienić ktoś, kto ma sam klucz z paczki (Etap 3c).

Klucz publishable jedzie w bundlu do każdego, kto otworzy stronę — to jest
normalne i tak ma być. Pytanie brzmi: co ten klucz otwiera. Do 0.42.0 wszystkie
polityki RLS były `using (true)`, czyli otwierał wszystko: stawki, daty
urodzenia, PIN-y, godziny. Aplikacja przestała z niego korzystać po
zalogowaniu (0.42.0), ale sam dostęp został — i to zdejmuje dopiero 3c.

Ten skrypt jest regresją tamtej zmiany. Uruchamiany PRZED nią daje zdjęcie
stanu wyjściowego, uruchamiany PO — sprawdza, czy odmowa faktycznie działa:

    python3 scripts/sprawdz-dostep.py --url https://xxx.supabase.co --etap przed
    python3 scripts/sprawdz-dostep.py --url https://xxx.supabase.co --etap po

W trybie `po` skrypt kończy się błędem, jeśli cokolwiek jest otwarte wbrew
oczekiwaniom — nadaje się do CI klienta.

⚠️ NICZEGO NIE ZAPISUJE. Prawo do zapisu sprawdzamy `PATCH`-em z filtrem,
który nie pasuje do żadnego wiersza (`id=eq.<zerowy uuid>`): gdy polityka
pozwala, PostgREST odpowiada sukcesem i zmienia ZERO wierszy; gdy nie
pozwala — odmawia. Dostajemy odpowiedź na pytanie "czy wolno", nie ruszając
danych. Inaczej trzeba by pisać do produkcyjnej bazy, żeby sprawdzić, czy da
się do niej pisać.

Opcjonalnie sprawdza też, co widzi KONKRETNE zalogowane konto — wtedy poda mu
się poświadczenia przez środowisko (nie przez argumenty, żeby PIN nie został
w historii powłoki):

    export SPRAWDZ_EMAIL=... SPRAWDZ_PIN=...
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ZEROWY_UUID = "00000000-0000-0000-0000-000000000000"

# Tabele z danymi, które nie mają prawa wyjść do nikogo z ulicy. Kolejność jak
# w CLAUDE.md, od najbardziej wrażliwych.
# WSZYSTKIE tabele wystawione przez PostgREST, nie tylko te, o których się
# pamięta. Pierwsza wersja tego skryptu sprawdzała trzynaście z dwudziestu
# czterech — i akurat pominięte byłyby te najnowsze, najmniej sprawdzone.
# Lista pochodzi z `create table` we wszystkich migracjach:
#   grep -rhio "create table [a-z_]*" docs/sql/migrations/*.sql
TABELE = [
    ("users", "imiona, e-maile, stawki, daty urodzenia, PIN-y"),
    ("shifts", "kto i ile godzin przepracował"),
    ("grafik_shifts", "kto kiedy pracuje w przyszłości"),
    ("shift_swaps", "giełda zmian"),
    ("shift_edits", "historia korekt godzin"),
    ("day_logs", "utargi dzienne"),
    ("day_log_entries", "wpisy HACCP"),
    ("day_log_templates", "co się mierzy w lokalu"),
    ("issues", "zgłoszenia, w tym anonimowe"),
    ("notifications", "wiadomości do ludzi"),
    ("absences", "urlopy i niedostępność"),
    ("tasks", "definicje zadań"),
    ("task_blocks", "bloki zadań"),
    ("task_completions", "kto co wykonał"),
    ("staffing_rules", "wymagania obsady"),
    ("staffing_rule_sets", "zestawy wymagań"),
    ("grafik_wyjatki", "wyjątki w grafiku"),
    ("grafik_budzet_cele", "cele finansowe"),
    ("grafik_budzet_dni", "budżet konkretnych dni"),
    ("lokale_godziny", "godziny otwarcia"),
    ("weather_forecasts", "archiwum prognoz"),
    ("app_errors", "dziennik błędów"),
    ("lokale", "nazwy lokali"),
    ("stanowiska", "nazwy stanowisk"),
]

# Czego oczekujemy PO migracji 0026: anonim nie czyta NICZEGO.
#
# ⚠️ Także `lokale` i `stanowiska`, choć to same nazwy bez danych osobowych.
# Pierwsza wersja zostawiała je otwarte "bo ekran logowania ich potrzebuje" —
# nieprawda od 0.42.0: dane pobierają się dopiero po zalogowaniu, a samo
# logowanie idzie przez GoTrue, nie przez PostgREST. Wyjątek bez powodu to
# wyjątek, który zostaje na zawsze.
OCZEKIWANE_PO = {t: False for t, _ in TABELE}

def zapytanie(url, klucz, sciezka, metoda="GET", token=None, dane=None):
    req = urllib.request.Request(
        url.rstrip("/") + sciezka,
        method=metoda,
        data=json.dumps(dane).encode() if dane is not None else None,
        headers={
            "apikey": klucz,
            "Authorization": f"Bearer {token or klucz}",
            "Content-Type": "application/json",
            "User-Agent": "gastro-dostep/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            tresc = r.read().decode()
            return r.status, tresc
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except urllib.error.URLError as e:
        return 0, str(e)


def czyta(url, klucz, tabela, token=None, kolumny="*"):
    kod, tresc = zapytanie(url, klucz, f"/rest/v1/{tabela}?select={kolumny}&limit=1", token=token)
    if kod == 200:
        return True, ("1 wiersz" if tresc.strip() not in ("[]", "") else "0 wierszy")
    return False, f"HTTP {kod}"


def pisze(url, klucz, tabela, token=None):
    # PATCH z filtrem, który nie trafia w nic — zero zmienionych wierszy.
    kod, tresc = zapytanie(
        url, klucz, f"/rest/v1/{tabela}?id=eq.{ZEROWY_UUID}", "PATCH",
        token=token, dane={},
    )
    if kod in (200, 204):
        return True, "wolno"
    return False, f"HTTP {kod}"


def zaloguj(url, klucz, email, haslo):
    kod, tresc = zapytanie(
        url, klucz, "/auth/v1/token?grant_type=password", "POST",
        dane={"email": email, "password": haslo},
    )
    if kod != 200:
        print(f"  Logowanie nie przeszło (HTTP {kod}). Sprawdzam tylko dostęp anonimowy.\n")
        return None
    return json.loads(tresc).get("access_token")


def sekcja(url, klucz, tytul, token=None):
    print(f"\n=== {tytul} ===\n")
    print(f"  {'tabela':<18} {'odczyt':<14} {'zapis':<12} co tam jest")
    wynik = {}
    for tabela, opis in TABELE:
        mozna_czytac, jak = czyta(url, klucz, tabela, token)
        mozna_pisac, jak_pisac = pisze(url, klucz, tabela, token)
        wynik[tabela] = mozna_czytac
        print(
            f"  {tabela:<18} {('TAK ' + jak) if mozna_czytac else ('nie ' + jak):<14} "
            f"{('TAK') if mozna_pisac else ('nie ' + jak_pisac):<12} {opis}"
        )
    return wynik


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    p.add_argument("--klucz", help="publishable; domyślnie z REACT_APP_SUPABASE_KEY")
    p.add_argument("--etap", choices=["przed", "po"], default="przed")
    p.add_argument(
        "--sprawdz-wpis-bledu",
        action="store_true",
        help="dopisze JEDEN wiersz do app_errors, żeby sprawdzić, czy wyjątek "
             "dla niezalogowanych działa (awaria na ekranie logowania musi mieć "
             "gdzie się zapisać). Domyślnie wyłączone — to jedyny zapis, jaki "
             "ten skrypt w ogóle potrafi zrobić.",
    )
    args = p.parse_args()

    klucz = args.klucz or os.environ.get("REACT_APP_SUPABASE_KEY") or os.environ.get("SUPABASE_KEY")
    if not klucz:
        print("Podaj --klucz (publishable) albo ustaw REACT_APP_SUPABASE_KEY.", file=sys.stderr)
        return 1

    print(f"\nBaza: {args.url}\nEtap: {args.etap}")

    # 1. Ktoś z ulicy — sam klucz z paczki, bez logowania.
    anon = sekcja(args.url, klucz, "ANONIM (sam klucz z bundla, nikt nie zalogowany)")

    # 2. Opcjonalnie: konkretne zalogowane konto.
    email = os.environ.get("SPRAWDZ_EMAIL")
    haslo = os.environ.get("SPRAWDZ_PIN")
    if email and haslo:
        token = zaloguj(args.url, klucz, email.strip().lower(), haslo)
        if token:
            sekcja(args.url, klucz, f"ZALOGOWANY: {email}", token)
    else:
        print("\n(SPRAWDZ_EMAIL / SPRAWDZ_PIN nieustawione — pomijam część zalogowaną)")

    # 2b. Wyjątek: anonim MUSI móc zapisać błąd (patrz migracja 0026).
    if args.sprawdz_wpis_bledu:
        kod, tresc = zapytanie(
            args.url, klucz, "/rest/v1/app_errors", "POST",
            dane={
                "typ": "window",
                "komunikat": "sprawdzenie dostępu (scripts/sprawdz-dostep.py)",
                "ekran": "probe",
            },
        )
        ok = kod in (200, 201, 204)
        print(f"\n  Wpis do dziennika błędów bez logowania: {'działa' if ok else f'HTTP {kod}'}")
        if not ok:
            print("  ⚠️ Awaria na ekranie logowania nie zostawi teraz śladu.")

    # 3. Werdykt — tylko w trybie "po".
    if args.etap == "przed":
        print("\nZdjęcie stanu wyjściowego. Powtórz z --etap po po zawężeniu polityk.")
        return 0

    zle = [t for t, otwarte in anon.items() if otwarte and not OCZEKIWANE_PO[t]]
    if zle:
        print("\nWCIĄŻ OTWARTE DLA KAŻDEGO: " + ", ".join(zle))
        print("Polityka na tych tabelach nie zadziałała — sprawdź, czy RLS jest włączone")
        print("(przy WYŁĄCZONYM RLS Postgres IGNORUJE polityki, patrz migracja 0011).")
        return 1
    print("\nOK — anonim nie czyta niczego, co nie powinno być publiczne.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
