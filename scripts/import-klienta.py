#!/usr/bin/env python3
"""Import danych nowego klienta z arkusza: lokale, stanowiska, pracownicy,
grafik, przepracowane godziny, urlopy.

Dane przygotowuje się w arkuszu wg szablonu (docs/szablon-importu/), każdą
zakładkę pobiera jako CSV do jednego katalogu i podaje ten katalog:

    python3 scripts/import-klienta.py --klient sloneczna dane/sloneczna/
    python3 scripts/import-klienta.py --klient sloneczna dane/sloneczna/ --wykonaj

Domyślnie SUCHY PRZEBIEG. Najpierw sprawdza WSZYSTKIE pliki i wypisuje każdy
błąd z numerem wiersza; dopóki jest choć jeden błąd, nie zapisze niczego —
pół zaimportowanej załogi jest gorsze niż żadna.

Powtarzalny: drugi przebieg po poprawce w arkuszu dopisuje tylko to, czego w
bazie jeszcze nie ma (lokal po nazwie, stanowisko po lokalu i nazwie, osoba po
imieniu i nazwisku, zmiana w grafiku po osobie+dniu+godzinie, odbicie po
osobie+starcie). Istniejących wierszy NIE zmienia.

Baza: --klient <slug> (rejestr klienci.json + SUPABASE_PAT — klucz serwisowy
bierze z API) albo --url https://<ref>.supabase.co + SUPABASE_SERVICE_KEY.

⚠️ Konta do logowania (właściciel, kierownik, tablet) dostają losowy 6-cyfrowy
PIN, wypisany RAZ na końcu — przekaż je bezpiecznym kanałem. Pracownik z
tabletu nie potrzebuje ani e-maila, ani PIN-u.
"""
import argparse
import collections
import csv
import datetime as dt
import os
import pathlib
import re
import secrets
import sys
import unicodedata
import urllib.parse
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shiftro_ops import BladApi, http, klient, sb, wczytaj_rejestr  # noqa: E402

STREFA = ZoneInfo("Europe/Warsaw")
DLUGOSC_PIN = 6
URLOP_START, URLOP_H = 9, 8  # jak buildUrlopShiftDrafts w utils/absences.ts
AUTOR = "Import"

ROLE = {
    "wlasciciel": "admin", "właściciel": "admin", "admin": "admin",
    "kierownik": "manager_lokalu", "manager": "manager_lokalu",
    "tablet": "kiosk", "kiosk": "kiosk",
    "pracownik": "open", "": "open",
}
LOGUJE_SIE = {"admin", "manager_lokalu", "kiosk"}
UMOWY = {
    "umowa o pracę": "umowa_o_prace", "umowa o prace": "umowa_o_prace", "uop": "umowa_o_prace",
    "etat": "umowa_o_prace", "umowa_o_prace": "umowa_o_prace",
    "zlecenie": "zlecenie", "umowa zlecenie": "zlecenie", "uz": "zlecenie",
    "b2b": "b2b", "inna": "inna", "": None,
}
PUSTE = {"", "-", "—", "wolne", "x"}


# --- Czytanie arkusza ----------------------------------------------------------

def klucz_kolumny(s):
    s = unicodedata.normalize("NFKD", s.strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("ł", "l")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def czytaj(katalog, nazwa):
    """Lista (nr_wiersza, {kolumna: wartość}) albo None, gdy pliku nie ma.

    Excel w polskich ustawieniach zapisuje CSV ze średnikiem i z BOM-em, Google
    Sheets z przecinkiem — rozpoznajemy oba.
    """
    p = pathlib.Path(katalog) / f"{nazwa}.csv"
    if not p.exists():
        return None
    tekst = p.read_text(encoding="utf-8-sig")
    pierwsza = tekst.splitlines()[0] if tekst.strip() else ""
    sep = ";" if pierwsza.count(";") > pierwsza.count(",") else ","
    r = csv.reader(tekst.splitlines(), delimiter=sep)
    naglowek = None
    wynik = []
    for nr, wiersz in enumerate(r, 1):
        if not any(c.strip() for c in wiersz) or wiersz[0].strip().startswith("#"):
            continue
        if naglowek is None:
            naglowek = [klucz_kolumny(c) for c in wiersz]
            continue
        wynik.append((nr, {k: (wiersz[i].strip() if i < len(wiersz) else "")
                           for i, k in enumerate(naglowek) if k}))
    return {"plik": p.name, "naglowek": naglowek or [], "wiersze": wynik}


def data(s):
    s = s.strip()
    for f in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return dt.datetime.strptime(s, f).date()
        except ValueError:
            pass
    raise ValueError(f"nie rozumiem daty „{s}” (RRRR-MM-DD albo DD.MM.RRRR)")


def godzina(s):
    m = re.fullmatch(r"(\d{1,2})(?:[:.](\d{2}))?", s.strip())
    if not m or int(m.group(1)) > 24 or int(m.group(2) or 0) > 59:
        raise ValueError(f"nie rozumiem godziny „{s}” (np. 8, 8:30, 16:00)")
    h, mi = int(m.group(1)), int(m.group(2) or 0)
    return dt.time(0, mi) if h == 24 else dt.time(h, mi)


def liczba(s):
    s = s.replace("zł", "").replace("zl", "").replace(" ", "").replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        raise ValueError(f"nie rozumiem liczby „{s}”")


def lista(s):
    return [x.strip() for x in re.split(r"[;|\n]", s or "") if x.strip()]


def zakres(od, do, dzien):
    """(start, koniec) jako aware datetime w Warszawie; koniec ≤ start = przez północ."""
    s = dt.datetime.combine(dzien, od, STREFA)
    e = dt.datetime.combine(dzien, do, STREFA)
    if e <= s:
        e += dt.timedelta(days=1)
    return s, e


# --- Baza ---------------------------------------------------------------------

class Baza:
    def __init__(self, url, klucz):
        self.url = url.rstrip("/")
        self.h = {"apikey": klucz, "Authorization": f"Bearer {klucz}"}

    def get(self, sciezka):
        wynik, od = [], 0
        while True:
            _, strona = http("GET", f"{self.url}/rest/v1/{sciezka}",
                             {**self.h, "Range": f"{od}-{od + 999}"})
            wynik += strona or []
            if len(strona or []) < 1000:
                return wynik
            od += 1000

    def post(self, tabela, wiersze, zwroc=False):
        out = []
        for i in range(0, len(wiersze), 500):
            _, odp = http("POST", f"{self.url}/rest/v1/{tabela}",
                          {**self.h, "Prefer": "return=representation" if zwroc else "return=minimal"},
                          wiersze[i:i + 500])
            out += odp or []
        return out

    def patch(self, tabela, filtr, dane):
        http("PATCH", f"{self.url}/rest/v1/{tabela}?{filtr}",
             {**self.h, "Prefer": "return=minimal"}, dane)

    def auth(self, metoda, sciezka, dane=None):
        return http(metoda, f"{self.url}/auth/v1/admin/{sciezka}", self.h, dane)[1]


def polacz(a):
    if a.klient:
        rej = wczytaj_rejestr()
        k = klient(rej, a.klient)
        if not k:
            sys.exit(f"Nie ma klienta {a.klient} w rejestrze (klienci.json).")
        pat = os.environ.get("SUPABASE_PAT", "").strip()
        if not pat:
            sys.exit("--klient wymaga SUPABASE_PAT (klucz serwisowy bierzemy z API).")
        klucze = sb(pat, "GET", f"/v1/projects/{k['supabase_ref']}/api-keys?reveal=true") or []
        sekret = next((x["api_key"] for x in klucze if x.get("type") == "secret" and x.get("api_key")), None)
        if not sekret:
            sys.exit("Projekt nie ma klucza typu secret — uruchom najpierw nowy-klient.py.")
        return Baza(f"https://{k['supabase_ref']}.supabase.co", sekret), f"{k['slug']} · {k.get('nazwa', '')}"
    klucz = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not a.url or not klucz:
        sys.exit("Podaj --klient <slug> albo --url https://<ref>.supabase.co z SUPABASE_SERVICE_KEY.")
    return Baza(a.url, klucz), a.url


# --- Sprawdzenie ----------------------------------------------------------------

class Wynik:
    def __init__(self):
        self.bledy, self.uwagi = [], []

    def blad(self, plik, nr, msg):
        self.bledy.append(f"{plik}:{nr}  {msg}")

    def uwaga(self, plik, nr, msg):
        self.uwagi.append(f"{plik}:{nr}  {msg}" if nr else f"{plik}  {msg}")


def sprawdz(katalog, stan, w, godziny_od):
    """Buduje plan zapisu. Nie dotyka bazy — `stan` to to, co w niej już jest."""
    plan = {"lokale": [], "stanowiska": [], "osoby": [], "grafik": [], "godziny": [], "urlopy": []}

    pliki = {n: czytaj(katalog, n) for n in
             ("lokale", "stanowiska", "pracownicy", "grafik", "godziny", "urlopy")}
    for wymagany in ("lokale", "stanowiska", "pracownicy"):
        if pliki[wymagany] is None:
            w.blad(f"{wymagany}.csv", 0, "brak pliku (wymagany)")
    if w.bledy:
        return plan

    def pole(plik, nr, r, k, wymagane=True):
        v = r.get(k, "")
        if wymagane and not v:
            w.blad(plik, nr, f"puste pole „{k}”")
        return v

    # Lokale
    lokale = {x["name"] for x in stan["lokale"]}
    f = pliki["lokale"]
    for nr, r in f["wiersze"]:
        n = pole(f["plik"], nr, r, "nazwa")
        if not n:
            continue
        if n in {x["name"] for x in plan["lokale"]}:
            w.blad(f["plik"], nr, f"lokal „{n}” drugi raz")
        elif n not in lokale:
            plan["lokale"].append({"name": n, "miasto": r.get("miasto") or None})
        lokale.add(n)

    def lokal_ok(plik, nr, n):
        if n not in lokale:
            w.blad(plik, nr, f"lokal „{n}” nie istnieje (dopisz go w lokale.csv)")
            return False
        return True

    # Stanowiska
    stanowiska = {(x["lokal_name"], x["name"]) for x in stan["stanowiska"] if not x.get("archived")}
    f = pliki["stanowiska"]
    for nr, r in f["wiersze"]:
        lok, n = pole(f["plik"], nr, r, "lokal"), pole(f["plik"], nr, r, "nazwa")
        if not lok or not n or not lokal_ok(f["plik"], nr, lok):
            continue
        if (lok, n) in {(x["lokal_name"], x["name"]) for x in plan["stanowiska"]}:
            w.blad(f["plik"], nr, f"stanowisko „{n}” w „{lok}” drugi raz")
        elif (lok, n) not in stanowiska:
            plan["stanowiska"].append({"lokal_name": lok, "name": n, "skrot": r.get("skrot") or None})
        stanowiska.add((lok, n))
    nazwy_stanowisk = {n for _, n in stanowiska}

    def stanowisko_ok(plik, nr, lok, n):
        if n not in nazwy_stanowisk:
            w.blad(plik, nr, f"stanowisko „{n}” nie istnieje w żadnym lokalu (dopisz w stanowiska.csv)")
            return False
        if lok and (lok, n) not in stanowiska:
            # Grafik przypisuje stanowisko PO NAZWIE i pozwala na stanowisko z
            # innego lokalu (wypożyczenie), więc to tylko uwaga.
            w.uwaga(plik, nr, f"stanowisko „{n}” nie jest przypisane do lokalu „{lok}”")
        return True

    # Pracownicy
    w_bazie = {u["name"]: u for u in stan["users"] if not u.get("archived")}
    maile = {(u.get("email") or "").lower(): u for u in stan["users"] if u.get("email")}
    osoby = {}  # imię -> wpis planu albo istniejący użytkownik
    f = pliki["pracownicy"]
    for nr, r in f["wiersze"]:
        p = f["plik"]
        imie = pole(p, nr, r, "imie_nazwisko")
        if not imie:
            continue
        if imie in osoby:
            w.blad(p, nr, f"„{imie}” drugi raz — wszystko w bazie wiąże się z osobą po imieniu "
                          "i nazwisku, więc muszą być unikalne (dopisz np. inicjał)")
            continue
        rola_txt = r.get("rola", "").lower()
        if rola_txt not in ROLE:
            w.blad(p, nr, f"rola „{r.get('rola')}” — dozwolone: pracownik, kierownik, tablet, właściciel")
            continue
        rola = ROLE[rola_txt]
        email = (r.get("email") or "").strip().lower()
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            w.blad(p, nr, f"e-mail „{email}” wygląda na błędny")
            continue
        if rola in LOGUJE_SIE and not email:
            w.blad(p, nr, f"rola „{rola_txt}” loguje się — potrzebny e-mail")
            continue

        lok_txt = r.get("lokal", "")
        if rola in ("manager_lokalu", "admin") and lok_txt.lower() in ("", "wszystkie", "*"):
            lokale_osoby = []  # puste allowed_lokale = wszystkie (moje_lokale)
        else:
            lokale_osoby = lista(lok_txt)
            if not lokale_osoby:
                w.blad(p, nr, "puste pole „lokal”")
                continue
            if not all(lokal_ok(p, nr, x) for x in lokale_osoby):
                continue

        stan_glowne = r.get("stanowisko", "")
        if rola == "open" and not stan_glowne:
            w.blad(p, nr, "pracownik potrzebuje stanowiska (od niego zależy grafik)")
            continue
        inne = lista(r.get("inne_stanowiska", ""))
        if not all(stanowisko_ok(p, nr, lokale_osoby[0] if lokale_osoby else None, x)
                   for x in ([stan_glowne] if stan_glowne else []) + inne):
            continue

        try:
            typ = UMOWY[(r.get("typ_umowy") or "").lower()]
        except KeyError:
            w.blad(p, nr, f"typ umowy „{r.get('typ_umowy')}” — dozwolone: umowa o pracę, zlecenie, b2b, inna")
            continue
        try:
            wymiar = liczba(r.get("wymiar_etatu", ""))
            stawka = liczba(r.get("stawka", ""))
            wynagr = liczba(r.get("wynagrodzenie", ""))
            zatr = data(r["data_zatrudnienia"]) if r.get("data_zatrudnienia") else None
            sanepid = data(r["sanepid_do"]) if r.get("sanepid_do") else None
            umowa_txt = (r.get("umowa_do") or "").lower()
            bezterminowa = umowa_txt in ("bezterminowa", "bezterminowo", "nieokreslony", "nieokreślony")
            umowa = data(umowa_txt) if umowa_txt and not bezterminowa else None
        except ValueError as e:
            w.blad(p, nr, str(e))
            continue
        if wymiar is not None and wymiar > 1:
            w.blad(p, nr, f"wymiar etatu {wymiar} — podaj ułamek (1, 0,75, 0,5)")
            continue
        if typ == "umowa_o_prace" and wynagr is None:
            w.uwaga(p, nr, "umowa o pracę bez wynagrodzenia — koszt tej osoby będzie „brak danych”")
        if typ in ("zlecenie", "b2b") and stawka is None:
            w.uwaga(p, nr, "zlecenie bez stawki — koszt tej osoby będzie „brak danych”")
        pin_tab = (r.get("pin_tabletu") or "").strip()
        if pin_tab and not re.fullmatch(r"\d{6}", pin_tab):
            # Klawiatura tabletu zatwierdza się sama na 6. cyfrze — krótszego
            # PIN-u nie da się wpisać wcale (CLAUDE.md, „Logowanie”).
            w.blad(p, nr, "pin_tabletu musi mieć dokładnie 6 cyfr")
            continue

        if imie in w_bazie:
            osoby[imie] = {"istnieje": w_bazie[imie]}
            continue
        if email and email in maile:
            w.blad(p, nr, f"e-mail {email} ma już w bazie „{maile[email]['name']}”")
            continue

        wiersz = {
            "name": imie, "role": rola, "active": True, "archived": False,
            "email": email or None, "telefon": r.get("telefon") or None,
            "default_lokal": lokale_osoby[0] if (rola == "open" and lokale_osoby) else
                             (lokale_osoby[0] if rola == "manager_lokalu" and len(lokale_osoby) == 1 else None),
            "allowed_lokale": ",".join(lokale_osoby) if rola in ("kiosk", "manager_lokalu") else None,
            "default_stanowisko": stan_glowne or None,
            "allowed_stanowiska": ",".join(dict.fromkeys(([stan_glowne] if stan_glowne else []) + inne)) or None,
            "typ_umowy": typ, "wymiar_etatu": wymiar, "stawka": stawka, "wynagrodzenie_mies": wynagr,
            "data_zatrudnienia": str(zatr) if zatr else None,
            "sanepid_expiry": str(sanepid) if sanepid else None,
            "umowa_expiry": str(umowa) if umowa else None,
            "umowa_bezterminowa": bezterminowa,
            "kiosk_pin": pin_tab or None,
        }
        osoby[imie] = {"nowy": wiersz}
        plan["osoby"].append(wiersz)

    def osoba(plik, nr, imie):
        if imie not in osoby and imie not in w_bazie:
            w.blad(plik, nr, f"„{imie}” nie ma w pracownicy.csv")
            return None
        return osoby.get(imie) or {"istnieje": w_bazie[imie]}

    def domyslne(o):
        x = o.get("nowy") or o.get("istnieje")
        return x.get("default_lokal"), x.get("default_stanowisko")

    # Grafik — długi (wiersz = zmiana) albo szeroki (wiersz = osoba, kolumny = dni)
    f = pliki["grafik"]
    if f:
        dni_kol = []
        for k in f["naglowek"]:
            try:
                dni_kol.append((k, data(k.replace("_", "-"))))
            except ValueError:
                pass
        szeroki = len(dni_kol) > 0
        for nr, r in f["wiersze"]:
            imie = pole(f["plik"], nr, r, "pracownik")
            o = osoba(f["plik"], nr, imie) if imie else None
            if not o:
                continue
            d_lok, d_st = domyslne(o)
            if szeroki:
                komorki = [(dz, r.get(k, "")) for k, dz in dni_kol]
            else:
                try:
                    komorki = [(data(r.get("data", "")), f"{r.get('od', '')}-{r.get('do', '')}")]
                except ValueError as e:
                    w.blad(f["plik"], nr, str(e))
                    continue
            lok = r.get("lokal") or d_lok
            st = r.get("stanowisko") or d_st
            for dzien, kom in komorki:
                for kawalek in re.split(r"[/\n]", kom):
                    kawalek = kawalek.strip()
                    if kawalek.lower() in PUSTE:
                        continue
                    if kawalek.lower() in ("u", "urlop", "l4"):
                        w.uwaga(f["plik"], nr, f"{dzien} „{kawalek}” pominięte — urlopy wpisz w urlopy.csv")
                        continue
                    m = re.fullmatch(r"(\S+?)\s*-\s*(\S+)", kawalek)
                    try:
                        if not m:
                            raise ValueError(f"nie rozumiem „{kawalek}” (np. 10-18 albo 10:00-18:00)")
                        od, do = godzina(m.group(1)), godzina(m.group(2))
                    except ValueError as e:
                        w.blad(f["plik"], nr, f"{dzien}: {e}")
                        continue
                    if not lok or not lokal_ok(f["plik"], nr, lok):
                        if not lok:
                            w.blad(f["plik"], nr, f"{imie}: nie wiem, w którym lokalu (kolumna „lokal”)")
                        continue
                    if not st or not stanowisko_ok(f["plik"], nr, lok, st):
                        if not st:
                            w.blad(f["plik"], nr, f"{imie}: nie wiem, na jakim stanowisku")
                        continue
                    plan["grafik"].append({"_nr": nr, "_imie": imie, "lokal": lok, "stanowisko": st,
                                           "date": dzien, "od": od, "do": do})

    # Godziny przepracowane
    f = pliki["godziny"]
    if f:
        for nr, r in f["wiersze"]:
            imie = pole(f["plik"], nr, r, "pracownik")
            o = osoba(f["plik"], nr, imie) if imie else None
            if not o:
                continue
            d_lok, d_st = domyslne(o)
            lok, st = r.get("lokal") or d_lok, r.get("stanowisko") or d_st
            try:
                dzien = data(r.get("data", ""))
                if r.get("od"):
                    od, do = godzina(r["od"]), godzina(pole(f["plik"], nr, r, "do"))
                elif r.get("godzin"):
                    # Ewidencja bywa samą liczbą godzin. Aplikacja liczy godziny z
                    # różnicy końca i startu, więc start jest umowny — mówimy o tym.
                    h = liczba(r["godzin"])
                    if not h or h <= 0 or h > 24:
                        raise ValueError(f"godzin {r['godzin']} poza zakresem 0–24")
                    od = godziny_od
                    koniec = dt.datetime.combine(dzien, od) + dt.timedelta(hours=h)
                    do = koniec.time()
                else:
                    raise ValueError("podaj od i do albo godzin")
            except ValueError as e:
                w.blad(f["plik"], nr, str(e))
                continue
            if not lok or not lokal_ok(f["plik"], nr, lok) or not st or not stanowisko_ok(f["plik"], nr, lok, st):
                if not lok or not st:
                    w.blad(f["plik"], nr, f"{imie}: brak lokalu albo stanowiska (ani w wierszu, ani w karcie)")
                continue
            s, e = zakres(od, do, dzien)
            if e - s > dt.timedelta(hours=17):
                w.uwaga(f["plik"], nr, f"{imie} {dzien}: zmiana dłuższa niż 17 h")
            if s > dt.datetime.now(STREFA):
                w.blad(f["plik"], nr, f"{dzien}: godziny w przyszłości — to raczej grafik")
                continue
            plan["godziny"].append({"_nr": nr, "_imie": imie, "lokal": lok, "stanowisko": st,
                                    "start": s, "end": e, "umowne": not r.get("od")})
        if any(g["umowne"] for g in plan["godziny"]):
            w.uwaga("godziny.csv", 0, f"wiersze z samą liczbą godzin dostały umowny start "
                                      f"{godziny_od.strftime('%H:%M')} (--godziny-od)")

    # Nachodzące zmiany tej samej osoby (aplikacja ich nie dopuszcza)
    for rodzaj, klucz in (("grafik", "grafik.csv"), ("godziny", "godziny.csv")):
        po_osobie = collections.defaultdict(list)
        for z in plan[rodzaj]:
            if rodzaj == "grafik":
                s, e = zakres(z["od"], z["do"], z["date"])
            else:
                s, e = z["start"], z["end"]
            po_osobie[z["_imie"]].append((s, e, z["_nr"]))
        for imie, zm in po_osobie.items():
            zm.sort()
            for (s1, e1, n1), (s2, e2, n2) in zip(zm, zm[1:]):
                if s2 < e1:
                    w.blad(klucz, n2, f"{imie}: nachodzi na zmianę z wiersza {n1}")

    # Urlopy
    f = pliki["urlopy"]
    if f:
        for nr, r in f["wiersze"]:
            imie = pole(f["plik"], nr, r, "pracownik")
            o = osoba(f["plik"], nr, imie) if imie else None
            if not o:
                continue
            try:
                od, do = data(r.get("od_dnia", "")), data(r.get("do_dnia", ""))
            except ValueError as e:
                w.blad(f["plik"], nr, str(e))
                continue
            if do < od:
                w.blad(f["plik"], nr, "do_dnia przed od_dnia")
                continue
            rodzaj = (r.get("rodzaj") or "urlop").lower()
            if rodzaj not in ("urlop", "niedostepnosc", "niedostępność"):
                w.blad(f["plik"], nr, f"rodzaj „{rodzaj}” — urlop albo niedostępność")
                continue
            plan["urlopy"].append({"_imie": imie, "od": od, "do": do,
                                   "type": "urlop" if rodzaj == "urlop" else "niedostepnosc",
                                   "lokal": domyslne(o)[0]})
    return plan


# --- Zapis -------------------------------------------------------------------------

def zapisz(b, plan, stan):
    teraz = dt.datetime.now(dt.timezone.utc).isoformat()
    piny = []

    if plan["lokale"]:
        b.post("lokale", plan["lokale"])
        print(f"  lokale: +{len(plan['lokale'])}")
    if plan["stanowiska"]:
        b.post("stanowiska", plan["stanowiska"])
        print(f"  stanowiska: +{len(plan['stanowiska'])}")

    ids = {u["name"]: u["id"] for u in stan["users"] if not u.get("archived")}
    if plan["osoby"]:
        for u in b.post("users", plan["osoby"], zwroc=True):
            ids[u["name"]] = u["id"]
        print(f"  pracownicy: +{len(plan['osoby'])}")

    # Konta do logowania. Kolejność jak w pierwszy-admin.py: najpierw Auth, potem
    # kartoteka — przerwany przebieg zostawia konto w Auth, które następny
    # przebieg znajdzie po e-mailu, zamiast admina bez auth_id.
    istniejace_auth = {}
    strona = 1
    while True:
        odp = b.auth("GET", f"users?page={strona}&per_page=200") or {}
        for x in odp.get("users", []):
            istniejace_auth[(x.get("email") or "").lower()] = x["id"]
        if len(odp.get("users", [])) < 200:
            break
        strona += 1
    for u in plan["osoby"]:
        # Pracownik z e-mailem I pin_tabletu loguje się też z prywatnego telefonu
        # — hasłem w Auth jest wtedy jego kiosk_pin (api/admin/ustaw-haslo.js).
        prywatny = u["role"] == "open" and u["email"] and u["kiosk_pin"]
        if u["role"] not in LOGUJE_SIE and not prywatny:
            continue
        pin = u["kiosk_pin"] if prywatny else f"{secrets.randbelow(10 ** DLUGOSC_PIN):0{DLUGOSC_PIN}d}"
        aid = istniejace_auth.get(u["email"])
        if aid:
            b.auth("PUT", f"users/{aid}", {"password": pin, "email_confirm": True})
        else:
            aid = b.auth("POST", "users", {"email": u["email"], "password": pin, "email_confirm": True,
                                           "user_metadata": {"name": u["name"], "rola": u["role"]}})["id"]
        b.patch("users", f"id=eq.{ids[u['name']]}", {"auth_id": aid} if prywatny else {"pin": pin, "auth_id": aid})
        if not prywatny:  # PIN z arkusza osoba już zna
            piny.append((u["name"], u["role"], u["email"], pin))

    def kto(imie):
        return {"user_id": ids[imie], "user_name": imie}

    if plan["grafik"]:
        b.post("grafik_shifts", [{
            **kto(z["_imie"]), "lokal": z["lokal"], "stanowisko": z["stanowisko"],
            "date": str(z["date"]), "start_time": z["od"].strftime("%H:%M"),
            "end_time": z["do"].strftime("%H:%M"),
            # Opublikowany od razu: pracownik ma widzieć swój grafik pierwszego
            # dnia. Bez powiadomień — wiadomość „nowy grafik” do całej załogi w
            # dniu startu byłaby szumem.
            "published_at": teraz, "updated_at": teraz, "created_by": AUTOR,
        } for z in plan["grafik"]])
        print(f"  grafik: +{len(plan['grafik'])} zmian (opublikowane)")

    if plan["godziny"]:
        b.post("shifts", [{
            **kto(z["_imie"]), "lokal": z["lokal"], "stanowisko": z["stanowisko"],
            "start_time": z["start"].isoformat(), "end_time": z["end"].isoformat(),
            "godzin": round((z["end"] - z["start"]).total_seconds() / 3600, 2),
        } for z in plan["godziny"]])
        print(f"  godziny: +{len(plan['godziny'])} zmian")

    for u in plan["urlopy"]:
        a = b.post("absences", [{
            **kto(u["_imie"]), "lokal": u["lokal"], "start_date": str(u["od"]), "end_date": str(u["do"]),
            "type": u["type"], "status": "approved", "requested_by": "manager",
            "decided_by": AUTOR, "decided_at": teraz, "note": "Import danych klienta",
        }], zwroc=True)[0]
        if u["type"] != "urlop":
            continue
        # Urlop to godziny (8 h za dzień roboczy) — dokładnie jak
        # buildUrlopShiftDrafts, żeby liczył się w normie i kosztach.
        dni, d = [], u["od"]
        while d <= u["do"]:
            if d.weekday() < 5:
                s = dt.datetime.combine(d, dt.time(URLOP_START), STREFA)
                dni.append({**kto(u["_imie"]), "lokal": u["lokal"], "stanowisko": "Urlop",
                            "start_time": s.isoformat(),
                            "end_time": (s + dt.timedelta(hours=URLOP_H)).isoformat(),
                            "godzin": URLOP_H, "is_urlop": True, "absence_id": a["id"]})
            d += dt.timedelta(days=1)
        if dni:
            b.post("shifts", dni)
    if plan["urlopy"]:
        print(f"  urlopy: +{len(plan['urlopy'])}")
    return piny


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("katalog", help="katalog z plikami CSV (lokale.csv, stanowiska.csv, …)")
    ap.add_argument("--klient", help="slug z klienci.json (wymaga SUPABASE_PAT)")
    ap.add_argument("--url", help="https://<ref>.supabase.co (z SUPABASE_SERVICE_KEY)")
    ap.add_argument("--godziny-od", default="9:00",
                    help="umowny start dla wierszy godziny.csv z samą liczbą godzin")
    ap.add_argument("--wykonaj", action="store_true", help="bez tego tylko sprawdzenie i plan")
    a = ap.parse_args()

    b, opis = polacz(a)
    print(f"\n=== Import do: {opis} · {'ZAPIS' if a.wykonaj else 'SUCHY PRZEBIEG (nic nie zmieniam)'} ===\n")
    try:
        stan = {
            "lokale": b.get("lokale?select=name"),
            "stanowiska": b.get("stanowiska?select=name,lokal_name,archived"),
            "users": b.get("users?select=id,name,email,role,archived,default_lokal,default_stanowisko,auth_id"),
            "grafik": b.get("grafik_shifts?select=user_id,date,start_time&deleted_at=is.null"),
            "shifts": b.get("shifts?select=user_id,start_time"),
            "absences": b.get("absences?select=user_id,start_date,end_date,type"),
        }
    except BladApi as e:
        sys.exit(f"Nie odczytałem bazy ({e.kod}). Migracje zastosowane? Klucz serwisowy?\n{e.tresc[:300]}")
    print(f"  w bazie już: {len(stan['lokale'])} lokali, {len(stan['users'])} osób, "
          f"{len(stan['grafik'])} zmian w grafiku, {len(stan['shifts'])} odbić\n")

    w = Wynik()
    plan = sprawdz(a.katalog, stan, w, godzina(a.godziny_od))

    # Powtórny przebieg: pomijamy to, co już jest w bazie (dla osób już istniejących).
    id_po_imieniu = {u["name"]: u["id"] for u in stan["users"] if not u.get("archived")}
    w_grafiku = {(g["user_id"], g["date"], g["start_time"][:5]) for g in stan["grafik"]}
    odbite = {(s["user_id"], dt.datetime.fromisoformat(s["start_time"].replace("Z", "+00:00"))) for s in stan["shifts"]}
    przed = (len(plan["grafik"]), len(plan["godziny"]))
    plan["grafik"] = [z for z in plan["grafik"] if (id_po_imieniu.get(z["_imie"]), str(z["date"]),
                                                     z["od"].strftime("%H:%M")) not in w_grafiku]
    plan["godziny"] = [z for z in plan["godziny"] if (id_po_imieniu.get(z["_imie"]), z["start"]) not in odbite]
    wolne = {(x["user_id"], x["start_date"], x["end_date"], x["type"]) for x in stan["absences"]}
    plan["urlopy"] = [u for u in plan["urlopy"] if (id_po_imieniu.get(u["_imie"]), str(u["od"]),
                                                    str(u["do"]), u["type"]) not in wolne]
    pominiete = (przed[0] - len(plan["grafik"]), przed[1] - len(plan["godziny"]))

    print("  Do zapisu:")
    print(f"    lokale       +{len(plan['lokale'])}")
    print(f"    stanowiska   +{len(plan['stanowiska'])}")
    role = collections.Counter(u["role"] for u in plan["osoby"])
    print(f"    pracownicy   +{len(plan['osoby'])}  " + ", ".join(f"{k}: {v}" for k, v in role.items()))
    if plan["grafik"] or pominiete[0]:
        dni = [z["date"] for z in plan["grafik"]]
        print(f"    grafik       +{len(plan['grafik'])}"
              + (f"  ({min(dni)} → {max(dni)})" if dni else "")
              + (f", już w bazie: {pominiete[0]}" if pominiete[0] else ""))
    if plan["godziny"] or pominiete[1]:
        dni = [z["start"].date() for z in plan["godziny"]]
        suma = sum((z["end"] - z["start"]).total_seconds() / 3600 for z in plan["godziny"])
        print(f"    godziny      +{len(plan['godziny'])} zmian, {suma:.1f} h"
              + (f"  ({min(dni)} → {max(dni)})" if dni else "")
              + (f", już w bazie: {pominiete[1]}" if pominiete[1] else ""))
    if plan["urlopy"]:
        print(f"    urlopy       +{len(plan['urlopy'])}")
    loguja = [u for u in plan["osoby"] if u["role"] in LOGUJE_SIE]
    if loguja:
        print(f"    konta do logowania (PIN wypisany na końcu): "
              + ", ".join(f"{u['name']} ({u['email']})" for u in loguja))

    if w.uwagi:
        print(f"\n  Uwagi ({len(w.uwagi)}) — nie blokują importu:")
        for x in w.uwagi[:40]:
            print(f"    · {x}")
        if len(w.uwagi) > 40:
            print(f"    … i {len(w.uwagi) - 40} więcej")
    if w.bledy:
        print(f"\n  BŁĘDY ({len(w.bledy)}) — popraw w arkuszu i uruchom ponownie. "
              "Nic nie zostało zapisane.")
        for x in w.bledy[:60]:
            print(f"    ✗ {x}")
        if len(w.bledy) > 60:
            print(f"    … i {len(w.bledy) - 60} więcej")
        print()
        return 1

    if not a.wykonaj:
        print("\n  Bez błędów. To był suchy przebieg — powtórz z --wykonaj.\n")
        return 0

    print("\n  Zapisuję…")
    try:
        piny = zapisz(b, plan, stan)
    except BladApi as e:
        print(f"\n  BŁĄD ZAPISU {e.kod} ({e.gdzie}):\n  {e.tresc[:400]}\n"
              "  Uruchom ponownie po poprawce — to, co już weszło, zostanie pominięte.\n", file=sys.stderr)
        return 1
    if piny:
        print("\n  Dane do logowania — wypisane TYLKO TERAZ, przekaż bezpiecznym kanałem:\n")
        for imie, rola, email, pin in piny:
            print(f"    {imie:<28} {rola:<15} {email:<32} PIN {pin}")
    print("\n  Gotowe. Sprawdź w aplikacji: Pracownicy, Grafik (tydzień startu), Rejestr godzin.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
