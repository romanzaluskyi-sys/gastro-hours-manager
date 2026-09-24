#!/usr/bin/env python3
"""Zakłada PIERWSZE konto właściciela w pustej bazie nowego klienta.

Bez tego skryptu nowego klienta nie da się uruchomić. Od 0.42.0 logowanie idzie
przez Supabase Auth, a od migracji 0026 anonim nie może zapisać niczego do
`users` — więc na pustej bazie nie ma kim się zalogować, żeby dodać
kogokolwiek. Kolejne konta (kierownicy, tablety, pracownicy) zakłada już
właściciel w aplikacji: karta pracownika woła `api/admin/ustaw-haslo.js`,
który tworzy konto w Auth razem z PIN-em.

Co robi:
  1. sprawdza, że migracje są zastosowane (`users.auth_id` istnieje);
  2. PRZERYWA, jeśli w bazie jest już aktywny admin — to narzędzie do pustej
     bazy, nie do dokładania adminów istniejącemu klientowi;
  3. losuje 6-cyfrowy PIN, zakłada konto w Auth z tym PIN-em jako hasłem;
  4. dopisuje wiersz do `users` (rola `admin`, `auth_id`, ten sam PIN).

⚠️ PIN jest LOSOWANY i wypisywany RAZ, na końcu. Nie przyjmujemy go z linii
poleceń, bo zostałby w historii powłoki. Właściciel zmienia go potem sam w
swojej karcie (Pracownicy), a `ustaw-haslo.js` zmienia hasło razem z nim.

⚠️ Kolejność jest celowa: najpierw Auth, potem `users`. Gdy przebieg padnie w
połowie, zostaje konto w Auth bez kartoteki — ponowne uruchomienie je znajdzie
po e-mailu, nada mu nowy PIN i dokończy. Odwrotna kolejność zostawiłaby wiersz
admina bez `auth_id`, a krok 2 zablokowałby każdą kolejną próbę.

⚠️ Wymaga klucza SERVICE ROLE (nie publishable) — tego samego, co
scripts/utworz-konta-auth.py. Omija RLS i może wszystko; nigdy do repo:

    export SUPABASE_SERVICE_KEY=sb_secret_...
    python3 scripts/pierwszy-admin.py --url https://xxx.supabase.co \\
        --imie "Anna Kowalska" --email anna@example.pl
    # to samo z --wykonaj, żeby zapisać

Domyślnie SUCHY PRZEBIEG — niczego nie zmienia, tylko drukuje plan (ta sama
konwencja co scripts/migrate.py i scripts/utworz-konta-auth.py).
"""
import argparse
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

DLUGOSC_PIN = 6


class BladHttp(Exception):
    def __init__(self, kod, tresc):
        super().__init__(f"{kod}: {tresc}")
        self.kod = kod
        self.tresc = tresc


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
        raise BladHttp(e.code, e.read().decode())


def albo_koniec(fn, *args, **kwargs):
    """Wywołanie, którego błąd kończy skrypt z czytelnym komunikatem."""
    try:
        return fn(*args, **kwargs)
    except BladHttp as e:
        podpowiedz = {
            401: "  Klucz odrzucony — czy na pewno SERVICE ROLE, nie publishable?",
            404: "  Nie ma takiej ścieżki — sprawdź adres projektu.",
        }.get(e.kod, "")
        print(f"\n  BŁĄD {e.kod}:\n  {e.tresc}\n{podpowiedz}", file=sys.stderr)
        raise SystemExit(1)


def konto_auth_po_emailu(url, klucz, email):
    strona = 1
    while True:
        odp = albo_koniec(zapytanie, url, klucz, f"/auth/v1/admin/users?page={strona}&per_page=200")
        lista = (odp or {}).get("users", [])
        for a in lista:
            if (a.get("email") or "").strip().lower() == email:
                return a["id"]
        if len(lista) < 200:
            return None
        strona += 1


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", required=True, help="https://<ref>.supabase.co")
    p.add_argument("--imie", required=True, help="imię i nazwisko właściciela")
    p.add_argument("--email", required=True, help="e-mail do logowania")
    p.add_argument("--wykonaj", action="store_true", help="bez tego tylko plan")
    args = p.parse_args()

    klucz = os.environ.get("SUPABASE_SERVICE_KEY")
    if not klucz:
        print("Ustaw SUPABASE_SERVICE_KEY (Supabase → Settings → API → service_role).", file=sys.stderr)
        return 1

    imie = args.imie.strip()
    email = args.email.strip().lower()
    if not imie:
        print("Puste --imie.", file=sys.stderr)
        return 1
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        print(f"To nie wygląda na e-mail: {args.email!r}", file=sys.stderr)
        return 1

    tryb = "ZAPIS" if args.wykonaj else "SUCHY PRZEBIEG (nic nie zmieniam)"
    print(f"\n=== {tryb} ===\n")

    # --- 1. Czy baza ma schemat ---
    # Bez migracji nie ma kolumny `auth_id`, a konto bez niej nie zaloguje się
    # nigdy (App szuka kartoteki po `auth_id`). Lepiej przerwać tutaj niż
    # zostawić konto w Auth, którego nic nie zna.
    try:
        admini = zapytanie(
            args.url, klucz,
            "/rest/v1/users?select=id,name,email,auth_id&role=eq.admin"
            "&active=eq.true&archived=eq.false",
        )
    except BladHttp as e:
        if e.kod in (400, 404):
            print(
                "Baza nie ma tabeli `users` albo kolumny `auth_id` — migracje nie są\n"
                "zastosowane. Najpierw:\n"
                "  python3 scripts/migrate.py --projekt <REF> --wykonaj\n"
                f"\n(odpowiedź: {e.kod} {e.tresc})",
                file=sys.stderr,
            )
            return 1
        print(f"\n  BŁĄD {e.kod}:\n  {e.tresc}", file=sys.stderr)
        return 1

    # --- 2. Czy baza jest pusta ---
    if admini:
        print("PRZERYWAM — w tej bazie jest już aktywny admin:")
        for a in admini:
            print(f"  {a['name']:<24} {a.get('email') or '(bez e-maila)'}")
        print(
            "\nTo narzędzie jest do PUSTEJ bazy nowego klienta. Kolejne konta zakłada\n"
            "się w aplikacji (Pracownicy → karta pracownika)."
        )
        return 1

    zajety = albo_koniec(
        zapytanie, args.url, klucz,
        f"/rest/v1/users?select=name,role&email=eq.{urllib.parse.quote(email)}",
    )
    if zajety:
        print(f"PRZERYWAM — e-mail {email} ma już konto w kartotece: "
              + ", ".join(f"{z['name']} ({z['role']})" for z in zajety))
        return 1

    # --- 3. Konto w Auth ---
    auth_id = konto_auth_po_emailu(args.url, klucz, email)
    if auth_id:
        print(f"  w Auth jest już konto na {email} (pewnie z przerwanego przebiegu)")
        print("  — dostanie nowy PIN i zostanie dowiązane")
    else:
        print(f"  zakładam konto w Auth   {email}")
    print(f"  dopisuję do kartoteki   {imie}, rola=admin")

    if not args.wykonaj:
        print("\nTo był suchy przebieg. Powtórz z --wykonaj, żeby zapisać.")
        return 0

    # Zero z przodu jest w porządku — PIN to tekst, nie liczba.
    pin = f"{secrets.randbelow(10 ** DLUGOSC_PIN):0{DLUGOSC_PIN}d}"

    if auth_id:
        albo_koniec(
            zapytanie, args.url, klucz, f"/auth/v1/admin/users/{auth_id}", "PUT",
            {"password": pin, "email_confirm": True},
        )
    else:
        nowe = albo_koniec(
            zapytanie, args.url, klucz, "/auth/v1/admin/users", "POST",
            {
                "email": email,
                "password": pin,
                "email_confirm": True,
                "user_metadata": {"name": imie, "rola": "admin"},
            },
        )
        auth_id = nowe["id"]

    # --- 4. Kartoteka ---
    # `pin` w kartotece i hasło w Auth to ta sama rzecz — pilnuje tego potem
    # `ustaw-haslo.js`, a tutaj ten skrypt. Puste `allowed_lokale` u admina
    # znaczy „wszystkie" (moje_lokale / hasAccessToLokal).
    albo_koniec(
        zapytanie, args.url, klucz, "/rest/v1/users", "POST",
        {
            "name": imie,
            "email": email,
            "pin": pin,
            "role": "admin",
            "active": True,
            "archived": False,
            "auth_id": auth_id,
        },
        {"Prefer": "return=minimal"},
    )

    print(
        "\nGOTOWE. Dane do pierwszego logowania (wypisane tylko ten jeden raz):\n"
        f"\n    e-mail: {email}\n    PIN:    {pin}\n"
        "\nPrzekaż je właścicielowi bezpiecznym kanałem. Dalej, w aplikacji:\n"
        "  Pracownicy → Lokale, Stanowiska, reszta załogi (docs/NOWY-KLIENT.md §5)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
