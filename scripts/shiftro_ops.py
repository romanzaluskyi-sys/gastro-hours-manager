"""Wspólne klocki skryptów operacyjnych: rejestr klientów, API Supabase i Vercela.

Importują go `migrate.py`, `nowy-klient.py` i `klienci.py`. Nazwa bez myślnika,
bo inaczej `import` go nie znajdzie.

⚠️ Żadna funkcja tutaj NIE wypisuje sekretów. Klucze, tokeny i CRON_SECRET
przechodzą przez pamięć i trafiają tylko tam, gdzie mają trafić (Vercel, Vault).
Dokładając funkcję, która coś drukuje, sprawdź, czy nie drukuje wartości.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ⚠️ Rejestr klientów jest POZA gitem (.gitignore). To dane operacyjne, nie kod:
# lista firm, które płacą, nie ma czego szukać w repozytorium, a w razie utraty
# odtwarza się ją z panelu Supabase i Vercela. Wzór: klienci.example.json.
REJESTR = pathlib.Path(os.environ.get("SHIFTRO_KLIENCI", ROOT / "klienci.json"))

# Cloudflare przed api.supabase.com odrzuca domyślne "Python-urllib/3.x"
# błędem 403 / "error code: 1010" — to nie jest problem z tokenem, tylko z
# User-Agentem. Ta sama pułapka co w migrate.py.
UA = "shiftro-ops/1.0"


class BladApi(Exception):
    def __init__(self, kod, tresc, gdzie):
        super().__init__(f"{gdzie}: {kod} {tresc[:300]}")
        self.kod = kod
        self.tresc = tresc
        self.gdzie = gdzie


def http(metoda, url, naglowki=None, dane=None, timeout=60):
    """Zwraca (status, json|tekst|None). Rzuca BladApi przy kodzie >= 400."""
    h = {"User-Agent": UA, "Accept": "application/json"}
    if dane is not None:
        h["Content-Type"] = "application/json"
    h.update(naglowki or {})
    req = urllib.request.Request(
        url, method=metoda, headers=h,
        data=json.dumps(dane).encode() if dane is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read().decode()
            try:
                return r.status, (json.loads(txt) if txt.strip() else None)
            except json.JSONDecodeError:
                return r.status, txt
    except urllib.error.HTTPError as e:
        gdzie = f"{metoda} {urllib.parse.urlsplit(url).netloc}{urllib.parse.urlsplit(url).path}"
        raise BladApi(e.code, e.read().decode(errors="replace"), gdzie)


def wymagaj_env(nazwa, po_co):
    v = os.environ.get(nazwa, "").strip()
    if not v:
        sys.exit(f"Brak {nazwa} w środowisku — {po_co}")
    return v


# --- Rejestr klientów -------------------------------------------------------

def wczytaj_rejestr(wymagany=True):
    if not REJESTR.exists():
        if wymagany:
            sys.exit(f"Nie ma rejestru klientów: {REJESTR}\n"
                     "Skopiuj klienci.example.json do klienci.json i uzupełnij.")
        return {"klienci": []}
    return json.loads(REJESTR.read_text())


def zapisz_rejestr(rej):
    REJESTR.write_text(json.dumps(rej, ensure_ascii=False, indent=2) + "\n")


def klient(rej, slug):
    for k in rej.get("klienci", []):
        if k["slug"] == slug:
            return k
    return None


# --- Supabase Management API -------------------------------------------------

SUPABASE_API = "https://api.supabase.com"


def sb(token, metoda, sciezka, dane=None):
    return http(metoda, SUPABASE_API + sciezka,
                {"Authorization": f"Bearer {token}"}, dane)[1]


def sql(token, ref, zapytanie):
    """SQL jako właściciel bazy, przez to samo API, którego używa migrate.py."""
    return sb(token, "POST", f"/v1/projects/{ref}/database/query", {"query": zapytanie}) or []


def sekret_crona_z_vault(token, ref):
    """CRON_SECRET tego klienta albo None.

    ⚠️ Źródłem prawdy jest VAULT w bazie klienta, nie plik na dysku: pg_cron i
    tak musi go tam mieć, a dzięki temu `klienci.py sprawdz` i ponowne
    uruchomienie `nowy-klient.py` znają sekret bez przechowywania go lokalnie.
    """
    w = sql(token, ref,
            "select decrypted_secret as s from vault.decrypted_secrets "
            "where name = 'shiftro_cron_secret' limit 1;")
    return w[0]["s"] if w else None


# --- Vercel API ----------------------------------------------------------------

VERCEL_API = "https://api.vercel.com"


def vc(token, team, metoda, sciezka, dane=None, query=None):
    q = dict(query or {})
    if team:
        q["teamId"] = team
    url = VERCEL_API + sciezka + ("?" + urllib.parse.urlencode(q) if q else "")
    return http(metoda, url, {"Authorization": f"Bearer {token}"}, dane)[1]


# --- Zdrowie wdrożenia -------------------------------------------------------

def zdrowie(domena, cron_secret):
    """Odpowiedź /api/zdrowie (patrz api/zdrowie.js) albo opis błędu."""
    try:
        status, odp = http("GET", f"https://{domena}/api/zdrowie",
                           {"Authorization": f"Bearer {cron_secret}"}, timeout=30)
        return odp if isinstance(odp, dict) else {"ok": False, "blad": f"{status}: {odp}"}
    except BladApi as e:
        try:
            odp = json.loads(e.tresc)
            if isinstance(odp, dict):
                odp.setdefault("ok", False)
                odp.setdefault("kod", e.kod)
                return odp
        except json.JSONDecodeError:
            pass
        return {"ok": False, "kod": e.kod, "blad": e.tresc[:200]}
    except (urllib.error.URLError, TimeoutError) as e:
        return {"ok": False, "blad": f"brak połączenia: {e}"}


def wersja_lokalna():
    return json.loads((ROOT / "public" / "version.json").read_text())["version"]
