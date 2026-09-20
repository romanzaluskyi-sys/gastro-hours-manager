#!/usr/bin/env python3
"""Zakłada konta w Supabase Auth dla tych, którzy się faktycznie logują.

Etap 3a planu infrastruktury. Migracja 0025 musi być zastosowana PRZED tym
skryptem (dokłada `users.auth_id`).

Kto dostaje konto:
  * kierownicy i tablety (`admin`/`manager`/`manager_lokalu`/`kiosk`) —
    e-mail + 6-cyfrowy `pin`, hasłem zostaje ten PIN;
  * pracownicy z dostępem z prywatnego telefonu (`open` z e-mailem) —
    hasłem zostaje `kiosk_pin`.
Pozostali pracownicy NIE dostają konta i nie potrzebują go: obsługuje ich
tablet, który jest już zalogowany.

⚠️ PIN-Y KRÓTSZE NIŻ 6 ZNAKÓW SĄ PODNOSZONE (Supabase Auth wymaga 6).
Do istniejącego dopisywane jest "01" — decyzja właściciela z 2026-09-20.
Robimy to dla WSZYSTKICH `kiosk_pin`, także tych bez e-maila, żeby na
tablecie nie powstała mieszanka: jednym 4 cyfry, drugim 6. Skrypt wypisuje
zmienione PIN-y — to jedyne miejsce, w którym je zobaczysz, więc przepisz je,
zanim zamkniesz terminal, i powiedz tym osobom.

⚠️ Wymaga klucza SERVICE ROLE (nie publishable). Ten klucz omija RLS i może
wszystko — nie wkładaj go do repozytorium ani do zmiennych Vercela:

    export SUPABASE_SERVICE_KEY=eyJ...
    python3 scripts/utworz-konta-auth.py --url https://xxx.supabase.co
    python3 scripts/utworz-konta-auth.py --url https://xxx.supabase.co --wykonaj

Domyślnie SUCHY PRZEBIEG — niczego nie zmienia, tylko drukuje plan (ta sama
konwencja co scripts/migrate.py i scripts/import-grafik.py).

Skrypt jest idempotentny: konto z ustawionym `auth_id` pomija, a gdy konto w
Auth już istnieje na ten e-mail, dowiązuje je zamiast tworzyć drugie.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

MIN_HASLA = 6
ROLE_Z_PINEM = {"admin", "manager", "manager_lokalu", "kiosk"}


def zapytanie(url, klucz, sciezka, metoda="GET", dane=None, naglowki=None):
    h = {
        "apikey": klucz,
        "Authorization": f"Bearer {klucz}",
        "Content-Type": "application/json",
        "User-Agent": "gastro-auth/1.0",
    }
    h.update(naglowki or {})
    req = urllib.request.Request(
        url.rstrip("/") + sciezka,
        method=metoda,
        data=json.dumps(dane).encode() if dane is not None else None,
        headers=h,
    )
    try:
        with urllib.request.urlopen(req) as r:
            tresc = r.read().decode()
            return json.loads(tresc) if tresc.strip() else None
    except urllib.error.HTTPError as e:
        tresc = e.read().decode()
        podpowiedz = {
            401: "  Klucz odrzucony — czy na pewno SERVICE ROLE, nie publishable?",
            404: "  Nie ma takiej ścieżki — sprawdź adres projektu.",
        }.get(e.code, "")
        print(f"\n  BŁĄD {e.code} przy {metoda} {sciezka}:\n  {tresc}\n{podpowiedz}", file=sys.stderr)
        raise SystemExit(1)


def podnies(pin):
    """Dopisuje '01', aż PIN ma wymaganą długość. Zwraca (nowy, czy_zmieniony).

    ⚠️ Pusty PIN zostaje pusty. Brak PIN-u to nie jest PIN do podniesienia —
    "01" wygenerowane z niczego byłoby poświadczeniem, którego nikt nie zna, a
    wyglądałoby na ustawione.
    """
    nowy = (pin or "").strip()
    if not nowy or len(nowy) >= MIN_HASLA:
        return nowy, False
    while len(nowy) < MIN_HASLA:
        nowy += "01"
    return nowy, True


def poswiadczenia(u, podnos=False):
    """Czym ta osoba się loguje: (email, haslo, {kolumna: nowa_wartosc}).

    Zwraca (None, None, {}), jeśli nie loguje się wcale albo jeśli jej PIN jest
    za krótki, a `podnos` jest wyłączone.

    ⚠️ `podnos` domyślnie WYŁĄCZONE, bo podniesienie PIN-u jest zmianą widoczną
    dla ludzi w lokalu, a nie szczegółem technicznym. Tablet ma dziś zaszyte
    `length === 4` i zatwierdza sam na czwartej cyfrze (KioskDashboard.tsx),
    więc PIN podniesiony do sześciu cyfr ZABLOKOWAŁBY tym osobom wejście na
    tablecie — nazajutrz rano, przed zmianą. Podnosimy dopiero razem z Etapem
    3b, który zmienia klawiaturę.

    ⚠️ Podnoszenie PIN-u siedzi TUTAJ, a nie w pętli zapisującej kolumny.
    Pierwsza wersja liczyła to w dwóch miejscach — kolumna szła z podniesionej
    wartości, a hasło z tego, co akurat było w słowniku. Dopóki kolejność
    kroków się zgadzała, wychodziło to samo; przestawienie ich zostawiłoby
    cztery osoby z hasłem innym niż PIN, który mają wpisywać na tablecie, i
    nikt by tego nie zauważył aż do pierwszej próby logowania.
    """
    email = (u.get("email") or "").strip().lower()
    zmiany = {}

    if podnos:
        # Oba PIN-y podnosimy niezależnie od tego, czy dana osoba się loguje —
        # `kiosk_pin` jest też blokadą na tablecie i ma tam być jednej długości
        # u wszystkich, żeby klawiatura mogła zatwierdzać sama.
        for kolumna in ("pin", "kiosk_pin"):
            nowy, zmieniony = podnies(u.get(kolumna))
            if zmieniony:
                zmiany[kolumna] = nowy

    pin = zmiany.get("pin", (u.get("pin") or "").strip())
    kiosk_pin = zmiany.get("kiosk_pin", (u.get("kiosk_pin") or "").strip())

    if not email:
        return None, None, zmiany
    if u.get("role") in ROLE_Z_PINEM and pin:
        haslo = pin
    elif u.get("role") == "open" and kiosk_pin:
        haslo = kiosk_pin
    else:
        return None, None, zmiany

    if len(haslo) < MIN_HASLA:
        # Auth takiego hasła nie przyjmie, a podnosić nie wolno bez zgody —
        # patrz komentarz wyżej. Konto poczeka na Etap 3b.
        return None, None, zmiany
    return email, haslo, zmiany


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True, help="https://<ref>.supabase.co")
    p.add_argument("--wykonaj", action="store_true", help="bez tego tylko plan")
    p.add_argument(
        "--podnies-piny",
        action="store_true",
        help="podnieś PIN-y krótsze niż 6 znaków (dopisując '01'). "
             "⚠️ Dopiero razem z Etapem 3b — wcześniej zablokuje tym osobom tablet.",
    )
    args = p.parse_args()

    klucz = os.environ.get("SUPABASE_SERVICE_KEY")
    if not klucz:
        print("Ustaw SUPABASE_SERVICE_KEY (Supabase → Settings → API → service_role).", file=sys.stderr)
        return 1

    tryb = "ZAPIS" if args.wykonaj else "SUCHY PRZEBIEG (nic nie zmieniam)"
    print(f"\n=== {tryb} ===\n")

    users = zapytanie(
        args.url, klucz,
        "/rest/v1/users?select=id,name,email,pin,role,kiosk_pin,auth_id,default_lokal"
        "&archived=eq.false&active=eq.true&order=role.asc",
    )

    # --- 1. PIN-y na tablecie: wszystkie do co najmniej 6 znaków ---
    # Robimy to przed zakładaniem kont, żeby hasło w Auth i kolumna w bazie
    # powstały z tej samej wartości. Odwrotna kolejność zostawiłaby cztery
    # osoby z hasłem innym niż PIN, który mają wpisywać na tablecie.
    podniesione = []
    for u in users:
        _, _, zmiany = poswiadczenia(u, args.podnies_piny)
        for kolumna, nowy in zmiany.items():
            podniesione.append((u["name"], kolumna, (u.get(kolumna) or "").strip(), nowy))
            u[kolumna] = nowy
        if zmiany and args.wykonaj:
            zapytanie(args.url, klucz, f"/rest/v1/users?id=eq.{u['id']}", "PATCH", zmiany)

    if podniesione:
        print("PIN-y podniesione do 6 znaków (PRZEPISZ i powiedz tym osobom):")
        for imie, kolumna, stary, nowy in podniesione:
            print(f"  {imie:<24} {kolumna:<10} {stary} → {nowy}")
        print()

    # --- 2. Konta w Auth ---
    istniejace = {}
    strona = 1
    while True:
        odp = zapytanie(args.url, klucz, f"/auth/v1/admin/users?page={strona}&per_page=200")
        lista = (odp or {}).get("users", [])
        for a in lista:
            if a.get("email"):
                istniejace[a["email"].strip().lower()] = a["id"]
        if len(lista) < 200:
            break
        strona += 1

    # E-mail musi być unikalny — w Auth jest kluczem. Dwie osoby na ten sam
    # adres to nie jest sytuacja, którą skrypt ma rozstrzygać za człowieka.
    widziane = {}
    for u in users:
        email, _, _ = poswiadczenia(u, args.podnies_piny)
        if email:
            widziane.setdefault(email, []).append(u["name"])
    duplikaty = {e: n for e, n in widziane.items() if len(n) > 1}
    if duplikaty:
        print("PRZERYWAM — ten sam e-mail na kilku kontach:")
        for e, n in duplikaty.items():
            print(f"  {e}: {', '.join(n)}")
        print("\nPopraw e-maile w karcie pracownika i uruchom ponownie.")
        return 1

    zalozone = powiazane = pominiete = 0
    for u in users:
        email, haslo, _ = poswiadczenia(u, args.podnies_piny)
        if not email:
            pominiete += 1
            continue
        if u.get("auth_id"):
            print(f"  jest już       {u['name']:<24} {email}")
            continue

        auth_id = istniejace.get(email)
        if auth_id:
            akcja, licznik = "dowiązuję     ", "powiazane"
        else:
            akcja, licznik = "zakładam      ", "zalozone"

        print(f"  {akcja} {u['name']:<24} {email:<32} rola={u['role']}")
        if args.wykonaj:
            if not auth_id:
                nowe = zapytanie(
                    args.url, klucz, "/auth/v1/admin/users", "POST",
                    {
                        "email": email,
                        "password": haslo,
                        "email_confirm": True,
                        "user_metadata": {"name": u["name"], "rola": u["role"]},
                    },
                )
                auth_id = nowe["id"]
            zapytanie(args.url, klucz, f"/rest/v1/users?id=eq.{u['id']}", "PATCH", {"auth_id": auth_id})
        if licznik == "zalozone":
            zalozone += 1
        else:
            powiazane += 1

    czekaja = [
        u["name"]
        for u in users
        if (u.get("email") or "").strip()
        and not poswiadczenia(u, args.podnies_piny)[0]
        and ((u.get("pin") or "").strip() or (u.get("kiosk_pin") or "").strip())
    ]
    print(
        f"\nDo założenia: {zalozone}, do dowiązania: {powiazane}, "
        f"bez logowania (obsługa z tabletu): {pominiete}."
    )
    if czekaja:
        print(
            f"\nCzeka na Etap 3b (PIN krótszy niż {MIN_HASLA} znaków): "
            + ", ".join(czekaja)
            + "\n  Podniesienie PIN-u zablokowałoby tym osobom tablet, dopóki\n"
              "  klawiatura kiosku ma zaszyte 4 cyfry. Wtedy: --podnies-piny."
        )
    if not args.wykonaj:
        print("To był suchy przebieg. Powtórz z --wykonaj, żeby zapisać.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
