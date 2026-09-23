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


def policz(url, klucz, tabela, token=None):
    """Ile wierszy tej tabeli WIDZI pytający.

    ⚠️ To jest miara, bez której Etapu 3c-2 nie da się bezpiecznie wdrożyć.
    Zawężenie polityk nie wywala błędu — po prostu zwraca MNIEJ wierszy, a
    ekran z pustą listą wygląda tak samo jak ekran, na którym nic dziś nie ma.
    Liczba przed i po migracji mówi, co naprawdę zniknęło.
    """
    req = urllib.request.Request(
        url.rstrip("/") + f"/rest/v1/{tabela}?select=id&limit=1",
        headers={
            "apikey": klucz,
            "Authorization": f"Bearer {token or klucz}",
            "Prefer": "count=exact",
            "Range": "0-0",
            "User-Agent": "gastro-dostep/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            zakres = r.headers.get("Content-Range", "")
    except urllib.error.HTTPError as e:
        zakres = e.headers.get("Content-Range", "") if e.headers else ""
    except urllib.error.URLError:
        return None
    # "0-0/123" albo "*/0"
    if "/" not in zakres:
        return None
    ogon = zakres.rsplit("/", 1)[1]
    return int(ogon) if ogon.isdigit() else None


def predykat(url, klucz, nazwa, token=None):
    """Wynik funkcji z bazy (`jest_kierownikiem`, `widzi_wszystko`, `moje_lokale`).

    ⚠️ To zastąpiło próbę zapisu tam, gdzie o dostępie decyduje RLS. `PATCH` z
    filtrem, który nie trafia w żaden wiersz, mówi „wolno" ZAWSZE: polityka
    filtruje wiersze, a filtrować nie ma czego, więc zero zmienionych wierszy
    to sukces niezależnie od uprawnień. Ta sztuczka działała, dopóki odmowa
    szła z GRANT-a (anonim dostaje 401 od razu) — od Etapu 3c odmowa idzie z
    polityki i trzeba zapytać inaczej. 23.09.2026 stary probe ogłosił, że
    tablet „MOŻE pisać do kartoteki", choć nie mógł.
    """
    kod, tresc = zapytanie(url, klucz, f"/rest/v1/rpc/{nazwa}", "POST", token=token, dane={})
    if kod != 200:
        return None
    try:
        return json.loads(tresc)
    except ValueError:
        return None


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


# Kolumny, których kolega z sali widzieć NIE MOŻE (Etap 3c-3, migracja 0029).
# Widok `users_widok` maskuje je na null dla wszystkich poza kierownikiem i
# samym zainteresowanym.
ZAKRYTE_PRZED_KOLEGAMI = [
    "stawka", "wynagrodzenie_mies", "telefon", "data_urodzenia",
    "data_zatrudnienia", "pin", "kiosk_pin", "email",
    "sanepid_expiry", "umowa_expiry", "ostatni_dzien",
]
ZAKRYTE_PRZED_WSZYSTKIMI_POZA_KIEROWNIKIEM = [
    "notatki", "notatki_updated_by", "notatki_updated_at",
]


def kartoteka(url, klucz, token, email):
    """Czy `users_widok` faktycznie zakrywa cudze dane (Etap 3c-3).

    Ekran, na którym „lista pracowników jest", nie mówi nic o tym, CO w tej
    liście przyjechało. Ta sekcja pyta o to wprost: bierze kartotekę oczami
    zalogowanego i sprawdza wiersze INNYCH osób.
    """
    print("\n  KARTOTEKA (users_widok) — co widać o innych")
    print("  " + "-" * 58)

    kod, tresc = zapytanie(url, klucz, "/auth/v1/user", token=token)
    moje_auth = json.loads(tresc).get("id") if kod == 200 else None

    kod, tresc = zapytanie(url, klucz, "/rest/v1/users_widok?select=*&limit=200", token=token)
    if kod != 200:
        print(f"    AWARIA: widok nie oddaje kartoteki (HTTP {kod}) — "
              "aplikacja pokaże pustą listę osób.")
        return {"ok": False, "kierownik": False}
    wiersze = json.loads(tresc)
    if not isinstance(wiersze, list) or len(wiersze) == 0:
        print("    AWARIA: kartoteka pusta — na tablecie nie będzie kogo wybrać.")
        return {"ok": False, "kierownik": False}

    moje = [w for w in wiersze if moje_auth and w.get("auth_id") == moje_auth]
    cudze = [w for w in wiersze if not (moje_auth and w.get("auth_id") == moje_auth)]
    rola = (moje[0].get("role") if moje else "") or "?"
    lokale_moje = predykat(url, klucz, "moje_lokale", token)
    print(f"    wierszy: {len(wiersze)}, rola zalogowanego: {rola}")
    # ⚠️ Od tej listy zależy KAŻDE zawężenie per lokal. Gdy tabela nie
    # zmniejszyła się po migracji, pierwsze pytanie brzmi: ile lokali baza
    # przypisuje temu kontu — a nie „czy polityka się zapisała".
    print(f"    lokale wg bazy (moje_lokale): {lokale_moje}")

    kierownik = rola in ("admin", "manager", "manager_lokalu")
    if kierownik:
        print("    To konto PROWADZI kartotekę — ma widzieć wszystko. "
              "Żeby zmierzyć zakrycie, zaloguj się kontem tabletu albo pracownika.")
        return {"ok": True, "kierownik": True}

    def wycieki(kolumny):
        zle = {}
        for w in cudze:
            for k in kolumny:
                v = w.get(k)
                # '' i null znaczą tu to samo: nic nie wyszło.
                if v not in (None, ""):
                    zle.setdefault(k, 0)
                    zle[k] += 1
        return zle

    problem = False
    z1 = wycieki(ZAKRYTE_PRZED_KOLEGAMI)
    z2 = wycieki(ZAKRYTE_PRZED_WSZYSTKIMI_POZA_KIEROWNIKIEM)
    if z1 or z2:
        problem = True
        for k, ile in sorted({**z1, **z2}.items()):
            print(f"    WYCIEK: {k} widoczne w {ile} cudzych wierszach")
    else:
        print(f"    OK: w {len(cudze)} cudzych wierszach żadna z "
              f"{len(ZAKRYTE_PRZED_KOLEGAMI) + len(ZAKRYTE_PRZED_WSZYSTKIMI_POZA_KIEROWNIKIEM)} "
              "wrażliwych kolumn nie ma wartości")

    # Drugi bok: to, co widać, musi wystarczyć do pracy.
    braki = [k for k in ("id", "name", "role", "default_lokal") if not wiersze[0].get(k)]
    if braki and wiersze[0].get("name") is None:
        problem = True
        print(f"    AWARIA: w kartotece brakuje kolumn potrzebnych do pracy: {braki}")

    # Tabela `users` ma wydawać wyłącznie własny wiersz (migracja 0030).
    kod, tresc = zapytanie(url, klucz, "/rest/v1/users?select=id&limit=200", token=token)
    ile = len(json.loads(tresc)) if kod == 200 and tresc.strip().startswith("[") else None
    if kod != 200:
        print(f"    tabela users: odmowa (HTTP {kod}) — dobrze")
    elif ile is not None and ile <= 1:
        print(f"    tabela users: {ile} wiersz (własny) — dobrze")
    else:
        problem = True
        print(f"    WYCIEK: tabela users wydaje {ile} wierszy wprost — "
              "migracja 0030 nie zadziałała.")

    # Zapis do kartoteki ma być zamknięty — inaczej maskowanie jest teatrem.
    #
    # ⚠️ Pytamy o PREDYKAT, nie próbujemy pisać. Pod RLS próba zapisu w filtr,
    # który nie trafia w żaden wiersz, kończy się sukcesem zawsze — patrz
    # `predykat()` wyżej.
    kier = predykat(url, klucz, "jest_kierownikiem", token)
    if kier is None:
        print("    zapis do users: NIE WIEM — baza nie zna `jest_kierownikiem` "
              "(migracja 0031 nie poszła?)")
    elif kier:
        problem = True
        print("    WYCIEK: baza uważa to konto za kierownika — "
              "czyli wolno mu pisać do kartoteki i czytać cudze dane.")
    else:
        print("    zapis do users: zablokowany przez politykę — dobrze")

    return {"ok": not problem, "kierownik": False}


def sekcja(url, klucz, tytul, token=None):
    print(f"\n=== {tytul} ===\n")
    print(f"  {'tabela':<18} {'odczyt':<10} {'wierszy':>8}  {'zapis*':<10} co tam jest")
    wynik = {}
    for tabela, opis in TABELE:
        mozna_czytac, jak = czyta(url, klucz, tabela, token)
        mozna_pisac, jak_pisac = pisze(url, klucz, tabela, token)
        ile = policz(url, klucz, tabela, token) if mozna_czytac else 0
        wynik[tabela] = {"czyta": mozna_czytac, "pisze": mozna_pisac, "ile": ile}
        print(
            f"  {tabela:<18} {('TAK') if mozna_czytac else ('nie ' + jak):<10} "
            f"{('?' if ile is None else ile):>8}  "
            f"{('TAK') if mozna_pisac else ('nie ' + jak_pisac):<10} {opis}"
        )
    # ⚠️ Gwiazdka nie jest ozdobą. Kolumna „zapis" to PATCH w filtr, który nie
    # trafia w żaden wiersz — mierzy GRANT (anonim dostaje 401), ale NIE mierzy
    # polityki RLS: nie ma czego filtrować, więc wychodzi „TAK" nawet tam,
    # gdzie polityka by nie puściła. O prawa pod RLS pytamy predykatami,
    # patrz sekcja KARTOTEKA.
    if token:
        print("\n  * kolumna zapisu mierzy GRANT, nie politykę RLS — "
              "pod RLS wychodzi TAK także tam, gdzie zapis i tak by nie przeszedł.")
    return wynik


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True)
    p.add_argument("--klucz", help="publishable; domyślnie z REACT_APP_SUPABASE_KEY")
    p.add_argument("--etap", choices=["przed", "po"], default="przed")
    p.add_argument("--zapisz", metavar="PLIK",
                   help="zapisz pomiar do pliku JSON — zdjęcie stanu PRZED migracją")
    p.add_argument("--porownaj", metavar="PLIK",
                   help="porównaj z wcześniejszym pomiarem i wypisz, co zniknęło")
    p.add_argument(
        "--sprawdz-wpis-bledu",
        action="store_true",
        help="dopisze JEDEN wiersz do app_errors, żeby sprawdzić, czy wyjątek "
             "dla niezalogowanych działa (awaria na ekranie logowania musi mieć "
             "gdzie się zapisać). Domyślnie wyłączone — to jedyny zapis, jaki "
             "ten skrypt w ogóle potrafi zrobić.",
    )
    args = p.parse_args()

    kartoteka_ok = None
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
    zalogowany = None
    if email and haslo:
        token = zaloguj(args.url, klucz, email.strip().lower(), haslo)
        if token:
            zalogowany = sekcja(args.url, klucz, f"ZALOGOWANY: {email}", token)
            kartoteka_ok = kartoteka(args.url, klucz, token, email)
    else:
        print(
            "\n⚠️ SPRAWDZ_EMAIL / SPRAWDZ_PIN nieustawione — sprawdzam TYLKO\n"
            "   połowę zmiany. Ten skrypt widzi wyłącznie to, czego NIE WOLNO\n"
            "   anonimowi, i nie odróżni odmowy słusznej od tej, która zablokuje\n"
            "   kierownikowi zapis. Podaj konto, żeby zmierzyć drugą stronę."
        )

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

    # 2c. Zdjęcie stanu i porównanie.
    #
    # ⚠️ Przy Etapie 3c-2 to jest ważniejsze niż sam werdykt "TAK/nie".
    # Zawężenie polityk NIE daje błędu — daje mniej wierszy. Ekran z pustą
    # listą wygląda dokładnie jak ekran, na którym nic dziś nie ma, więc
    # jedyne, co odróżnia zawężenie zamierzone od przypadkowego, to liczba
    # sprzed migracji.
    pomiar = {"anon": anon, "zalogowany": zalogowany, "konto": email or None}
    if args.zapisz:
        with open(args.zapisz, "w", encoding="utf-8") as f:
            json.dump(pomiar, f, ensure_ascii=False, indent=1)
        print(f"\n  Zdjęcie stanu zapisane: {args.zapisz}")

    if args.porownaj:
        try:
            with open(args.porownaj, encoding="utf-8") as f:
                stare = json.load(f)
        except OSError as e:
            print(f"\n  Nie mogę wczytać {args.porownaj}: {e}")
            return 1
        if stare.get("konto") != pomiar["konto"]:
            print(f"\n  ⚠️ Zdjęcie robiono kontem {stare.get('konto')}, "
                  f"a teraz mierzę kontem {pomiar['konto']} — porównanie nic nie znaczy.")
            return 1
        print("\n=== CO SIĘ ZMIENIŁO DLA ZALOGOWANEGO ===\n")
        przed = (stare.get("zalogowany") or {})
        zmiany = 0
        for tabela, teraz in (zalogowany or {}).items():
            byl = przed.get(tabela)
            if not byl:
                continue
            a, b = byl.get("ile"), teraz.get("ile")
            if a == b and byl.get("pisze") == teraz.get("pisze"):
                continue
            zmiany += 1
            opis_zapisu = ""
            if byl.get("pisze") and not teraz.get("pisze"):
                opis_zapisu = "  + stracił ZAPIS"
            print(f"  {tabela:<20} {a} → {b}{opis_zapisu}")
        if zmiany == 0:
            print("  Nic się nie zmieniło — dla tego konta zawężenie nie zadziałało\n"
                  "  albo ono i tak widziało tylko swoje.")
        else:
            print("\n  Sprawdź, czy KAŻDA z tych pozycji jest zamierzona. Spadek do zera\n"
                  "  na tabeli, z której korzysta ekran tej roli, to awaria, nie sukces.")

    # 3. Werdykt — tylko w trybie "po".
    if args.etap == "przed":
        print("\nZdjęcie stanu wyjściowego. Powtórz z --etap po po zawężeniu polityk.")
        return 0

    zle = [t for t, w in anon.items() if w["czyta"] and not OCZEKIWANE_PO[t]]
    if zle:
        print("\nWCIĄŻ OTWARTE DLA KAŻDEGO: " + ", ".join(zle))
        print("Polityka na tych tabelach nie zadziałała — sprawdź, czy RLS jest włączone")
        print("(przy WYŁĄCZONYM RLS Postgres IGNORUJE polityki, patrz migracja 0011).")
        return 1
    # ⚠️ Druga połowa werdyktu: czy ZALOGOWANY nadal może pracować.
    #
    # 3c-1 nie zawęża niczego zalogowanym — jeśli więc kierownik czegoś nie
    # może, to nie jest "bezpieczniej", tylko zepsute. Sekcja powstała, bo
    # pierwsza wersja skryptu mierzyła sam dostęp anonima i na tej podstawie
    # orzekała "OK" o całej zmianie. Wystarczyłby jeden nieudany GRANT, żeby
    # to "OK" dotyczyło bazy, w której nikt nie może pracować.
    if zalogowany is None:
        print(
            "\nAnonim odcięty. ⚠️ Ale NIE WIEM, czy zalogowany dalej może pracować —\n"
            "   uruchom ponownie z SPRAWDZ_EMAIL i SPRAWDZ_PIN."
        )
        return 0

    bez_odczytu = [t for t, w in zalogowany.items() if not w["czyta"]]
    bez_zapisu = [t for t, w in zalogowany.items() if not w["pisze"]]

    # ⚠️ Od Etapu 3c-3 odmowa na `users` dla konta, które nie prowadzi
    # kartoteki, jest ZAMIERZONA — listę załogi ta osoba bierze z
    # `users_widok`. Bez tego wyjątku skrypt krzyczałby "awaria" dokładnie o
    # tej zmianie, którą miał potwierdzić. Sekcja KARTOTEKA wyżej ocenia to
    # osobno i po swojemu.
    if kartoteka_ok and not kartoteka_ok["kierownik"]:
        bez_odczytu = [x for x in bez_odczytu if x != "users"]
        bez_zapisu = [x for x in bez_zapisu if x != "users"]
    if bez_odczytu or bez_zapisu:
        if bez_odczytu:
            print("\nZALOGOWANY NIE CZYTA: " + ", ".join(bez_odczytu))
        if bez_zapisu:
            print("ZALOGOWANY NIE ZAPISZE: " + ", ".join(bez_zapisu))
        print(
            "To nie jest zabezpieczenie, tylko awaria — użytkownik zobaczy\n"
            '"permission denied" albo pustą listę. Sprawdź GRANT dla roli\n'
            "`authenticated` na tych tabelach."
        )
        return 1

    if kartoteka_ok is None:
        print("\nOK — anonim nic nie dostaje, zalogowany czyta i zapisuje wszystko.")
        return 0
    if not kartoteka_ok["ok"]:
        print("\nKARTOTEKA NIE JEST ZAKRYTA — patrz sekcja wyżej.")
        return 1
    if kartoteka_ok["kierownik"]:
        print("\nOK dla konta kierownika. ⚠️ Zakrycia kartoteki NIE zmierzyłem —\n"
              "   kierownik ma widzieć wszystko. Powtórz kontem tabletu albo pracownika.")
        return 0
    print("\nOK — anonim nic nie dostaje, zalogowany pracuje, a cudze stawki,\n"
          "   dane osobowe i PIN-y są dla niego zakryte.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
