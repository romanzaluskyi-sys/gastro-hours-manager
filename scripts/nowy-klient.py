#!/usr/bin/env python3
"""Uruchomienie nowego klienta (model silo) jednym poleceniem.

Robi wszystko, co da się zrobić bez człowieka, w kolejności z
docs/NOWY-KLIENT.md:

   1. projekt Supabase — czy żyje i stoi we Frankfurcie
   2. klucze API (publishable + secret) — pobiera, a gdy ich nie ma, zakłada
   3. Auth — wyłącza samodzielną rejestrację, ustawia adres aplikacji
   4. migracje (ten sam kod co scripts/migrate.py)
   5. CRON_SECRET w Vault + harmonogram wysyłki maili (pg_cron)
   6. projekt Vercel z tego samego repozytorium
   7. zmienne środowiskowe — wszystkie, dla wszystkich trzech środowisk
   8. domena <klient>.shiftro.pl
   9. deploy produkcyjny (gdy coś się zmieniło) i czekanie, aż wstanie
  10. pierwsze konto właściciela (scripts/pierwszy-admin.py)
  11. sprawdzenie: /api/zdrowie, wersja, czy paczka patrzy na TĘ bazę
  12. wpis do rejestru klientów (klienci.json)

Ręcznie zostaje to, czego API nie powinno robić samo albo nie umie:
  - założenie projektu Supabase (to jest koszt — decyzja człowieka), region
    Frankfurt (eu-central-1);
  - konto Brevo i weryfikacja nadawcy (daje BREVO_API_KEY);
  - umowa powierzenia danych (DPA) — PRZED wpisaniem prawdziwych danych;
  - przekazanie PIN-u właścicielowi i dane startowe w aplikacji.

Domyślnie SUCHY PRZEBIEG — niczego nie zmienia, tylko mówi, co zrobi. Zapis
z --wykonaj. Każdy krok jest powtarzalny: drugie uruchomienie po przerwanym
przebiegu dokańcza to, czego brakuje, i nie psuje tego, co już jest.

    export SUPABASE_PAT=sbp_...          # Supabase → Account → Access Tokens
    export VERCEL_TOKEN=...              # Vercel → Account Settings → Tokens
    export BREVO_API_KEY=xkeysib-...     # Brevo klienta (opcjonalnie, patrz niżej)

    python3 scripts/nowy-klient.py --klient sloneczna --nazwa "Słoneczna Sp. z o.o." \\
        --projekt abcdefghijklmnop --admin-imie "Anna Kowalska" --admin-email anna@sloneczna.pl
    # to samo z --wykonaj

Wersja demonstracyjna (demo.shiftro.pl) to ZWYKŁY klient z flagą --demo:

    python3 scripts/nowy-klient.py --klient demo --demo --projekt <REF>

Różnice: zmienne DEMO/REACT_APP_DEMO, funkcje z docs/sql/demo/demo.sql w bazie,
bez konta właściciela (konta demo zakłada reset), a na końcu pierwszy reset,
który wypełnia bazę danymi przykładowymi. Pełny opis: docs/DEMO.md.

Bez BREVO_API_KEY wszystko inne się wykona, a maile zostaną wyłączone; po
założeniu konta w Brevo wystarczy uruchomić skrypt jeszcze raz z kluczem.

⚠️ Żaden sekret nie jest wypisywany ani zapisywany na dysku. CRON_SECRET żyje
w Vault bazy klienta i w Vercelu; klucze Supabase pobiera się z API przy
każdym przebiegu. Jedyny wyjątek to PIN właściciela — wypisany RAZ, przez
pierwszy-admin.py.
"""
import argparse
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.parse
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import migrate  # noqa: E402
from shiftro_ops import (  # noqa: E402
    ROOT, BladApi, http, klient, sb, sekret_crona_z_vault, sql, vc,
    wczytaj_rejestr, wersja_lokalna, wymagaj_env, zapisz_rejestr, zdrowie,
)

SRODOWISKA = ["production", "preview", "development"]
REGION = "eu-central-1"
NAZWA_SEKRETU = "shiftro_cron_secret"
ZADANIE_MAILI = "shiftro-wyslij-maile"


# --- Wypisywanie -------------------------------------------------------------

class Raport:
    def __init__(self, wykonaj):
        self.wykonaj = wykonaj
        self.reczne = []

    def krok(self, nr, tytul):
        print(f"\n[{nr}] {tytul}")

    def ok(self, txt):
        print(f"    ✓ {txt}")

    def zrobie(self, txt):
        print(f"    {'→' if self.wykonaj else '·'} {txt}" + ("" if self.wykonaj else "  (suchy przebieg)"))

    def uwaga(self, txt, recznie=None):
        print(f"    ! {txt}")
        if recznie:
            self.reczne.append(recznie)

    def stop(self, txt):
        print(f"\n  PRZERYWAM: {txt}\n", file=sys.stderr)
        raise SystemExit(1)


def repo_z_gita():
    url = subprocess.run(["git", "-C", str(ROOT), "remote", "get-url", "origin"],
                         capture_output=True, text=True).stdout.strip()
    m = re.search(r"github\.com[:/](.+?)/(.+?)(?:\.git)?$", url)
    if not m:
        sys.exit(f"Nie rozpoznaję repozytorium GitHub z `git remote`: {url!r}")
    return f"{m.group(1)}/{m.group(2)}"


# --- Kroki Supabase ----------------------------------------------------------

def krok_projekt(r, pat, ref):
    r.krok(1, "Projekt Supabase")
    try:
        p = sb(pat, "GET", f"/v1/projects/{ref}")
    except BladApi as e:
        r.stop(f"nie widzę projektu {ref} ({e.kod}). Sprawdź ref i to, czy "
               "SUPABASE_PAT ma dostęp do organizacji, w której go założono.")
    if p.get("status") != "ACTIVE_HEALTHY":
        r.stop(f"projekt {ref} ma status {p.get('status')} — poczekaj, aż wstanie.")
    r.ok(f"{p.get('name')} · {p.get('region')} · aktywny")
    if p.get("region") != REGION:
        r.uwaga(f"region {p.get('region')}, a nie {REGION} (Frankfurt) — dane polskich "
                "pracowników powinny leżeć w UE najbliżej Polski. Regionu nie da się "
                "zmienić; to decyzja przed wpisaniem danych.")


def krok_klucze(r, pat, ref):
    r.krok(2, "Klucze API")
    klucze = sb(pat, "GET", f"/v1/projects/{ref}/api-keys?reveal=true") or []
    wynik = {}
    for typ in ("publishable", "secret"):
        k = next((k for k in klucze if k.get("type") == typ and k.get("api_key")), None)
        if k:
            wynik[typ] = k["api_key"]
            r.ok(f"{typ}: {k.get('name')}")
            continue
        r.zrobie(f"założę klucz {typ}")
        if r.wykonaj:
            nowy = sb(pat, "POST", f"/v1/projects/{ref}/api-keys?reveal=true",
                      {"type": typ, "name": "shiftro"})
            wynik[typ] = nowy["api_key"]
    return wynik


def krok_auth(r, pat, ref, domena):
    r.krok(3, "Auth")
    cfg = sb(pat, "GET", f"/v1/projects/{ref}/config/auth") or {}
    zmiany = {}
    # ⚠️ Domyślnie Supabase pozwala KAŻDEMU, kto ma klucz publishable (czyli
    # każdemu, kto otworzył stronę), założyć sobie konto. Takie konto to rola
    # `authenticated`, a część polityk wpuszcza zapis z `with check (true)`
    # (powiadomienia, zgłoszenia). Konta zakłada u nas wyłącznie kierownik
    # (api/admin/ustaw-haslo.js, admin API) i pierwszy-admin.py — rejestracja
    # z zewnątrz nie ma tu żadnego zastosowania.
    if cfg.get("disable_signup") is not True:
        zmiany["disable_signup"] = True
    adres = f"https://{domena}"
    if cfg.get("site_url") != adres:
        zmiany["site_url"] = adres
    if not zmiany:
        r.ok("rejestracja z zewnątrz wyłączona, adres aplikacji ustawiony")
        return
    for k, v in zmiany.items():
        r.zrobie(f"{k} → {v}")
    if r.wykonaj:
        sb(pat, "PATCH", f"/v1/projects/{ref}/config/auth", zmiany)


def krok_migracje(r, pat, ref):
    r.krok(4, "Migracje")
    return migrate.migruj(ref, pat, r.wykonaj, kto=os.environ.get("USER", "nowy-klient.py"))


def krok_sekret_i_harmonogram(r, pat, ref, domena, z_mailami):
    r.krok(5, "CRON_SECRET (Vault) i harmonogram wysyłki maili")
    sekret = sekret_crona_z_vault(pat, ref)
    if sekret:
        r.ok("CRON_SECRET jest już w Vault — używam go (nie generuję nowego, "
             "inaczej rozjechałby się z Vercelem)")
    else:
        sekret = secrets.token_urlsafe(32)
        r.zrobie("wygeneruję CRON_SECRET i zapiszę w Vault")
        if r.wykonaj:
            # token_urlsafe = [A-Za-z0-9_-], więc wstawienie w literał jest bezpieczne.
            sql(pat, ref, f"select vault.create_secret('{sekret}', '{NAZWA_SEKRETU}');")

    if not z_mailami:
        r.uwaga("bez BREVO_API_KEY nie planuję wysyłki maili (endpoint i tak "
                "odpowiadałby 500 co 5 minut)",
                "Brevo: konto klienta, weryfikacja nadawcy, potem ten skrypt jeszcze raz z BREVO_API_KEY")
        return sekret

    jest = sql(pat, ref,
               "select exists(select 1 from pg_extension where extname = 'pg_cron') as c, "
               "exists(select 1 from pg_extension where extname = 'pg_net') as n;")[0]
    adres_zadania = f"https://{domena}/api/cron/wyslij-maile"
    zadanie = []
    if jest["c"]:
        zadanie = sql(pat, ref, f"select command from cron.job where jobname = '{ZADANIE_MAILI}';")
    if zadanie and adres_zadania in zadanie[0]["command"]:
        r.ok(f"pg_cron: {ZADANIE_MAILI} co 5 min → {domena}")
        return sekret
    r.zrobie(f"pg_cron/pg_net + zadanie {ZADANIE_MAILI} co 5 min → {adres_zadania}")
    if r.wykonaj:
        # Ta sama treść co docs/sql/tools/email-harmonogram.sql. cron.schedule z
        # istniejącą nazwą PODMIENIA zadanie, więc powtórka jest bezpieczna.
        # Domena przeszła walidację w main() — tylko [a-z0-9.-].
        sql(pat, ref, f"""
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  '{ZADANIE_MAILI}',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := '{adres_zadania}',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '{NAZWA_SEKRETU}')
    ),
    timeout_milliseconds := 30000
  );
  $job$
);""")
    return sekret


def krok_demo_sql(r, pat, ref):
    r.krok("4a", "Baza demo — znacznik, czyszczenie, ochrona kont (docs/sql/demo/demo.sql)")
    jest = sql(pat, ref, "select to_regprocedure('public.demo_znacznik()') is not null as j;")
    # Plik jest powtarzalny (create or replace), więc puszczamy go ZAWSZE —
    # poprawka w nim ma trafić do bazy przy najbliższym przebiegu.
    r.zrobie(("odświeżę" if jest and jest[0]["j"] else "zainstaluję") + " funkcje demo w bazie")
    if r.wykonaj:
        sql(pat, ref, (ROOT / "docs" / "sql" / "demo" / "demo.sql").read_text())


def krok_dane_demo(r, domena, nazwa_vercel, sekret):
    r.krok("10", "Dane demo — pierwszy reset (api/cron/demo-reset)")
    r.zrobie("wywołam reset: konta demo + dane przykładowe od dzisiejszej daty")
    if not r.wykonaj:
        return
    # Domena bywa jeszcze bez DNS — wtedy adres z Vercela.
    for host in (domena, f"{nazwa_vercel}.vercel.app"):
        try:
            _, odp = http("GET", f"https://{host}/api/cron/demo-reset",
                          {"Authorization": f"Bearer {sekret}"}, timeout=120)
        except BladApi as e:
            r.uwaga(f"{host}: {e.kod} {e.tresc[:300]}")
            continue
        except Exception as e:  # noqa: BLE001 — brak DNS, timeout
            r.uwaga(f"{host}: {e}")
            continue
        if isinstance(odp, dict) and odp.get("tabele"):
            suma = sum(odp["tabele"].values())
            r.ok(f"{host}: {suma} wierszy w {len(odp['tabele'])} tabelach; konta: "
                 + (", ".join(odp.get("konta") or []) or "bez zmian"))
            return
        r.uwaga(f"{host}: {json.dumps(odp, ensure_ascii=False)[:300]}")
    r.uwaga("reset nie przeszedł — dane wypełni nocny cron albo ponowne uruchomienie skryptu",
            "dane demo: ten skrypt jeszcze raz z --wykonaj (krok 10)")


# --- Kroki Vercel --------------------------------------------------------------

def krok_vercel_projekt(r, tok, team, nazwa, repo, wzor_id):
    r.krok(6, f"Projekt Vercel „{nazwa}”")
    try:
        p = vc(tok, team, "GET", f"/v9/projects/{nazwa}")
        r.ok(f"istnieje ({p['id']})")
        return p, False
    except BladApi as e:
        if e.kod != 404:
            raise
    wzor = vc(tok, team, "GET", f"/v9/projects/{wzor_id}") if wzor_id else {}
    r.zrobie(f"założę projekt z repozytorium {repo} (framework: create-react-app"
             + (f", Node {wzor.get('nodeVersion')} jak u pierwszego klienta" if wzor.get("nodeVersion") else "")
             + ")")
    if not r.wykonaj:
        return None, True
    try:
        p = vc(tok, team, "POST", "/v11/projects", {
            "name": nazwa,
            "framework": wzor.get("framework") or "create-react-app",
            "gitRepository": {"type": "github", "repo": repo},
        })
    except BladApi as e:
        if e.kod != 403:
            raise
        # 2026-10-08 (demo): token czytał projekt pierwszego klienta, ale nie
        # widział projektu założonego ręcznie i nie mógł założyć nowego — czyli
        # nie ma pełnego dostępu do zespołu, choć GET na jeden projekt przechodzi.
        r.stop(f"Vercel odmówił założenia projektu (403). VERCEL_TOKEN nie ma pełnego "
               f"dostępu do zespołu {team}: utwórz nowy token (Account Settings → Tokens, "
               f"Scope: ten zespół) i sprawdź rolę Owner w Team Settings → Members. "
               f"Projekt założony ręcznie w panelu musi się nazywać dokładnie „{nazwa}”.")
    if wzor.get("nodeVersion") and p.get("nodeVersion") != wzor["nodeVersion"]:
        vc(tok, team, "PATCH", f"/v9/projects/{p['id']}", {"nodeVersion": wzor["nodeVersion"]})
    return p, True


def krok_zmienne(r, tok, team, projekt, zmienne):
    r.krok(7, "Zmienne środowiskowe (Production, Preview, Development)")
    if not projekt:
        for k in zmienne:
            r.zrobie(f"ustawię {k}")
        return True
    obecne = {}
    try:
        lista = vc(tok, team, "GET", f"/v10/projects/{projekt['id']}/env",
                   query={"decrypt": "true"}).get("envs", [])
        for e in lista:
            obecne.setdefault(e["key"], []).append(e)
    except BladApi:
        pass

    def aktualna(k, v):
        wpisy = obecne.get(k, [])
        cele = {t for e in wpisy if e.get("value") == v for t in (e.get("target") or [])}
        return set(SRODOWISKA) <= cele

    do_zmiany = [k for k, v in zmienne.items() if not aktualna(k, v)]
    for k in zmienne:
        if k in do_zmiany:
            r.zrobie(f"{k}" + (" (zmieniam)" if k in obecne else ""))
    if not do_zmiany:
        r.ok(f"wszystkie {len(zmienne)} ustawione")
        return False
    if len(do_zmiany) < len(zmienne):
        r.ok(f"bez zmian: {len(zmienne) - len(do_zmiany)}")
    if r.wykonaj:
        odp = vc(tok, team, "POST", f"/v10/projects/{projekt['id']}/env",
                 [{"key": k, "value": zmienne[k], "type": "encrypted", "target": SRODOWISKA}
                  for k in do_zmiany],
                 query={"upsert": "true"})
        if odp and odp.get("failed"):
            r.stop("Vercel nie przyjął części zmiennych: "
                   + ", ".join(str(f.get("error", f)) for f in odp["failed"]))
    # ⚠️ REACT_APP_* wchodzą do paczki przy BUILDZIE, a funkcje dostają zmienne
    # z chwili deployu — bez nowego deployu zmiana nie działa nigdzie.
    return True


def krok_domena(r, tok, team, projekt, domena):
    r.krok(8, f"Domena {domena}")
    if not projekt:
        r.zrobie(f"dodam {domena} do projektu")
        return
    domeny = vc(tok, team, "GET", f"/v9/projects/{projekt['id']}/domains").get("domains", [])
    d = next((x for x in domeny if x["name"] == domena), None)
    if not d:
        r.zrobie(f"dodam {domena} do projektu")
        if not r.wykonaj:
            return
        d = vc(tok, team, "POST", f"/v10/projects/{projekt['id']}/domains", {"name": domena})
    cfg = {}
    try:
        cfg = vc(tok, team, "GET", f"/v6/domains/{domena}/config")
    except BladApi:
        pass
    if d.get("verified") and not cfg.get("misconfigured"):
        r.ok("podpięta i zweryfikowana")
    else:
        r.uwaga("domena czeka na DNS — dopóki nie zadziała, sprawdzenie w kroku 11 się nie uda",
                f"DNS: rekord dla {domena} (Vercel → projekt → Settings → Domains pokazuje, jaki)")


def krok_deploy(r, tok, team, projekt, nazwa, repo, potrzebny):
    r.krok(9, "Deploy produkcyjny")
    if projekt and not potrzebny:
        gotowe = vc(tok, team, "GET", "/v6/deployments", query={
            "projectId": projekt["id"], "target": "production", "state": "READY", "limit": "1",
        }).get("deployments", [])
        if gotowe:
            r.ok("konfiguracja bez zmian i jest działający deploy — nie przebudowuję")
            return
    r.zrobie("zbuduję main jako produkcję i poczekam, aż wstanie (zwykle 1–3 min)")
    if not r.wykonaj or not projekt:
        return
    org, nazwa_repo = repo.split("/", 1)
    d = vc(tok, team, "POST", "/v13/deployments", {
        "name": nazwa,
        "project": projekt["id"],
        "target": "production",
        "gitSource": {"type": "github", "org": org, "repo": nazwa_repo, "ref": "main"},
    })
    start = time.time()
    while True:
        stan = vc(tok, team, "GET", f"/v13/deployments/{d['id']}").get("readyState")
        if stan == "READY":
            r.ok(f"gotowe po {int(time.time() - start)} s")
            return
        if stan in ("ERROR", "CANCELED"):
            r.stop(f"deploy skończył się stanem {stan} — logi: Vercel → {nazwa} → Deployments")
        if time.time() - start > 900:
            r.stop("deploy trwa ponad 15 minut — sprawdź w Vercelu i uruchom skrypt ponownie")
        time.sleep(10)


# --- Konto właściciela i sprawdzenie ----------------------------------------

def krok_admin(r, ref, klucz_secret, imie, email):
    r.krok(10, "Konto właściciela")
    url = f"https://{ref}.supabase.co"
    if klucz_secret:
        try:
            _, admini = http("GET", f"{url}/rest/v1/users?select=email&role=eq.admin&active=eq.true",
                             {"apikey": klucz_secret, "Authorization": f"Bearer {klucz_secret}"})
            if admini:
                r.ok("w bazie jest już aktywny admin: " + ", ".join(a.get("email") or "?" for a in admini))
                return
        except BladApi:
            pass  # pusta baza w suchym przebiegu — tabeli jeszcze nie ma
    if not email:
        r.uwaga("w bazie nie ma admina, a nie podano --admin-email — pomijam",
                "konto właściciela: ten skrypt z --admin-imie i --admin-email")
        return
    r.zrobie(f"założę konto {email} ({imie}) — PIN wypisze pierwszy-admin.py")
    if not r.wykonaj:
        return
    env = dict(os.environ, SUPABASE_SERVICE_KEY=klucz_secret)
    wynik = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "pierwszy-admin.py"),
         "--url", url, "--imie", imie, "--email", email, "--wykonaj"],
        env=env,
    )
    if wynik.returncode != 0:
        r.stop("pierwszy-admin.py nie założył konta (komunikat wyżej)")
    r.reczne.append(f"przekaż PIN właścicielowi ({email}) bezpiecznym kanałem")


def krok_sprawdzenie(r, ref, domena, sekret):
    r.krok(11, "Sprawdzenie wdrożenia")
    if not r.wykonaj:
        r.zrobie(f"zapytam https://{domena}/api/zdrowie i sprawdzę paczkę")
        return
    z = zdrowie(domena, sekret)
    if z.get("ok"):
        r.ok(f"/api/zdrowie: wersja {z.get('wersja')}, najemca „{z.get('najemca')}”, "
             f"migracji {(z.get('baza') or {}).get('migracji')}, Brevo {z.get('brevo')}")
    else:
        r.uwaga("/api/zdrowie: " + json.dumps(z, ensure_ascii=False))
    if z.get("wersja") and z["wersja"] != wersja_lokalna():
        r.uwaga(f"wdrożona wersja {z['wersja']} ≠ lokalna {wersja_lokalna()} "
                "(lokalne repo w tyle albo na innej gałęzi?)")

    # Paczka frontu: czy w środku stoi adres TEJ bazy. Ekran logowania i tak
    # pokazuje nazwę najemcy, ale nazwę da się wpisać dobrze przy złym adresie.
    try:
        _, html = http("GET", f"https://{domena}/")
        m = re.search(r'src="(/static/js/main\.[^"]+\.js)"', html or "")
        if not m:
            r.uwaga("nie znalazłem paczki main.*.js w index.html")
            return
        _, js = http("GET", f"https://{domena}{m.group(1)}")
        if f"{ref}.supabase.co" in (js or ""):
            r.ok(f"paczka frontu patrzy na {ref}.supabase.co")
        else:
            r.uwaga(f"w paczce frontu NIE MA {ref}.supabase.co — front patrzy na inną bazę "
                    "albo zbudowano go przed ustawieniem zmiennych")
    except BladApi as e:
        r.uwaga(f"nie pobrałem strony ({e.kod}) — domena jeszcze nie działa?")


def krok_rejestr(r, rej, wpis):
    r.krok(12, "Rejestr klientów")
    stary = klient(rej, wpis["slug"])
    if stary and all(stary.get(k) == v for k, v in wpis.items() if k != "dodano"):
        r.ok("wpis aktualny")
        return
    r.zrobie(("zaktualizuję" if stary else "dopiszę") + f" {wpis['slug']} w klienci.json")
    if not r.wykonaj:
        return
    if stary:
        wpis["dodano"] = stary.get("dodano", wpis["dodano"])
        rej["klienci"] = [wpis if k["slug"] == wpis["slug"] else k for k in rej["klienci"]]
    else:
        rej["klienci"].append(wpis)
    zapisz_rejestr(rej)


# --- main ---------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--klient", required=True, help="krótki identyfikator, np. sloneczna")
    ap.add_argument("--nazwa", help="nazwa klienta na ekranie logowania (REACT_APP_TENANT)")
    ap.add_argument("--projekt", help="ref projektu Supabase (z adresu https://<REF>.supabase.co)")
    ap.add_argument("--domena", help="domyślnie <klient>.shiftro.pl")
    ap.add_argument("--admin-imie")
    ap.add_argument("--admin-email")
    ap.add_argument("--email-from", default="powiadomienia@shiftro.pl")
    ap.add_argument("--produkt", default="Shiftro")
    ap.add_argument("--demo", action="store_true",
                    help="wersja demonstracyjna (demo.shiftro.pl) — patrz docs/DEMO.md")
    ap.add_argument("--wykonaj", action="store_true", help="bez tego tylko plan")
    a = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,30}", a.klient):
        sys.exit("--klient: małe litery, cyfry i myślnik, 2–31 znaków")

    rej = wczytaj_rejestr(wymagany=False)
    byly = klient(rej, a.klient) or {}
    # Raz demo, zawsze demo: ponowny przebieg bez --demo nie może po cichu
    # zdjąć zmiennych DEMO z projektu (reset przestałby działać) ani założyć
    # konta właściciela w bazie, którą co noc się czyści.
    demo = a.demo or bool(byly.get("demo"))
    nazwa = a.nazwa or byly.get("nazwa") or ("Shiftro · wersja demonstracyjna" if demo else None)
    ref = a.projekt or byly.get("supabase_ref")
    domena = (a.domena or byly.get("domena") or f"{a.klient}.shiftro.pl").lower()
    if not nazwa or not ref:
        sys.exit("Pierwsze uruchomienie dla klienta wymaga --nazwa i --projekt.")
    if not re.fullmatch(r"[a-z]{20}", ref):
        sys.exit(f"--projekt {ref!r} nie wygląda na ref Supabase (20 małych liter)")
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", domena):
        sys.exit(f"--domena {domena!r} nie wygląda na domenę")
    if a.admin_email and not a.admin_imie:
        sys.exit("--admin-email wymaga --admin-imie")
    # Inny klient z tą samą bazą to dokładnie ta pomyłka, przed którą chroni silo.
    for k in rej.get("klienci", []):
        if k["slug"] != a.klient and (k.get("supabase_ref") == ref or k.get("domena") == domena):
            sys.exit(f"Baza {ref} albo domena {domena} należy już do klienta {k['slug']}!")

    pat = wymagaj_env("SUPABASE_PAT", "Supabase → Account → Access Tokens")
    vtok = wymagaj_env("VERCEL_TOKEN", "Vercel → Account Settings → Tokens")
    brevo = os.environ.get("BREVO_API_KEY", "").strip()
    team = rej.get("vercel_team") or os.environ.get("VERCEL_TEAM_ID", "").strip()
    if not team:
        sys.exit("Nie znam zespołu Vercel: wpisz \"vercel_team\" w klienci.json "
                 "albo ustaw VERCEL_TEAM_ID.")
    repo = rej.get("repo") or repo_z_gita()
    projekt_nazwa = byly.get("vercel_nazwa") or f"shiftro-{a.klient}"
    wzor_id = next((k.get("vercel_projekt") for k in rej.get("klienci", [])
                    if k["slug"] != a.klient and k.get("vercel_projekt")), None)

    r = Raport(a.wykonaj)
    print(f"\n=== {a.klient} · {nazwa} · {domena} · "
          f"{'ZAPIS' if a.wykonaj else 'SUCHY PRZEBIEG (nic nie zmieniam)'} ===")

    krok_projekt(r, pat, ref)
    klucze = krok_klucze(r, pat, ref)
    krok_auth(r, pat, ref, domena)
    krok_migracje(r, pat, ref)
    if demo:
        krok_demo_sql(r, pat, ref)
    # Demo nie wysyła maili — nawet gdyby w środowisku wisiał BREVO_API_KEY.
    if demo:
        brevo = ""
    sekret = krok_sekret_i_harmonogram(r, pat, ref, domena, bool(brevo))

    url = f"https://{ref}.supabase.co"
    zmienne = {
        "REACT_APP_SUPABASE_URL": url,
        "REACT_APP_SUPABASE_KEY": klucze.get("publishable", "<publishable>"),
        "REACT_APP_TENANT": nazwa,
        "REACT_APP_PRODUKT": a.produkt,
        "SUPABASE_URL": url,
        "SUPABASE_SERVICE_KEY": klucze.get("secret", "<secret>"),
        "SUPABASE_KEY": klucze.get("publishable", "<publishable>"),
        "CRON_SECRET": sekret,
        "EMAIL_FROM": a.email_from,
        "APP_URL": f"https://{domena}",
    }
    if brevo:
        zmienne["BREVO_API_KEY"] = brevo
    if demo:
        zmienne["DEMO"] = "tak"
        zmienne["REACT_APP_DEMO"] = "tak"
    if os.environ.get("GOOGLE_SCRIPT_URL", "").strip() and not demo:
        zmienne["REACT_APP_GOOGLE_SCRIPT_URL"] = os.environ["GOOGLE_SCRIPT_URL"].strip()

    projekt, nowy = krok_vercel_projekt(r, vtok, team, projekt_nazwa, repo, wzor_id)
    zmienione = krok_zmienne(r, vtok, team, projekt, zmienne)
    krok_domena(r, vtok, team, projekt, domena)
    krok_deploy(r, vtok, team, projekt, projekt_nazwa, repo, nowy or zmienione)
    if demo:
        krok_dane_demo(r, domena, projekt_nazwa, sekret)
    else:
        krok_admin(r, ref, klucze.get("secret"), a.admin_imie, a.admin_email)
    krok_sprawdzenie(r, ref, domena, sekret)

    if a.wykonaj and not rej.get("vercel_team"):
        rej["vercel_team"] = team
    if a.wykonaj and not rej.get("repo"):
        rej["repo"] = repo
    wpis = {
        "slug": a.klient,
        "nazwa": nazwa,
        "supabase_ref": ref,
        "vercel_nazwa": projekt_nazwa,
        "vercel_projekt": (projekt or {}).get("id"),
        "domena": domena,
        "dodano": date.today().isoformat(),
    }
    if demo:
        wpis["demo"] = True
    krok_rejestr(r, rej, wpis)

    print("\n=== Zostaje ręcznie ===")
    reszta = [
        "umowa powierzenia danych (DPA) — PRZED wpisaniem danych pracowników",
        "dane startowe w aplikacji: Lokale → Stanowiska → Pracownicy → "
        "Wymagania obsady → Puls (docs/NOWY-KLIENT.md §5)",
    ]
    if demo:
        reszta = [f"otwórz https://{domena} i przejdź trzy role (docs/DEMO.md, „Sprawdzenie”)"]
    for x in r.reczne + reszta:
        print(f"  - {x}")
    if not a.wykonaj:
        print("\nTo był suchy przebieg. Powtórz z --wykonaj.\n")
    else:
        print()


if __name__ == "__main__":
    main()
