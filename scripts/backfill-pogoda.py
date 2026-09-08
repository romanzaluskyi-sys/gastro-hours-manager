#!/usr/bin/env python3
"""Uzupełnienie archiwum prognoz o to, co da się odzyskać wstecz.

Domyślnie SUCHY PRZEBIEG — niczego nie zapisuje, tylko drukuje raport.
Zapis dopiero z --wykonaj (ta sama konwencja co import-grafik.py i migrate.py).

    python3 scripts/backfill-pogoda.py                    # raport
    python3 scripts/backfill-pogoda.py --dni 60 --wykonaj # zapis

Co potrafi, a czego nie:
  Open-Meteo trzyma dawne przebiegi modelu (previous-runs API) najwyżej
  7 dni wstecz — czyli horyzonty 1..7 da się odtworzyć od ręki, razem ze
  stanem faktycznym. Horyzontu 8..14 NIE da się odzyskać w żaden sposób;
  te powstają wyłącznie z codziennego crona api/cron/capture-weather.js.

Wiersze wstawiane są z Prefer: resolution=ignore-duplicates — to, co zebrał
cron, jest źródłem prawdy i backfill go nie nadpisuje, tylko zapełnia dziury.
"""
import argparse, collections, datetime, json, sys, urllib.parse, urllib.request

SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co"
SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S"
HORYZONTY = [1, 2, 3, 4, 5, 6, 7]   # więcej niż prosił właściciel (3 i 7) —
                                    # pełna krzywa pokazuje, GDZIE prognoza się
                                    # psuje, a nie tylko że w dwóch punktach

def rest(sciezka, metoda="GET", body=None, prefer=None):
    naglowki = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        naglowki["Prefer"] = prefer
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{sciezka}", method=metoda,
        data=json.dumps(body).encode() if body is not None else None,
        headers=naglowki,
    )
    with urllib.request.urlopen(req) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None


def pobierz(url):
    with urllib.request.urlopen(url) as r:
        return json.loads(r.read().decode())


def geocode(miasto):
    j = pobierz("https://geocoding-api.open-meteo.com/v1/search?count=1&language=pl"
                "&country=PL&name=" + urllib.parse.quote(miasto))
    w = (j.get("results") or [None])[0]
    if not w:
        raise SystemExit(f"Nie znaleziono miasta: {miasto}")
    return w["latitude"], w["longitude"]


def dobowe(godzinowe, czasy):
    """Godzina po godzinie -> max/min/suma na dobę lokalną."""
    po_dniach = collections.defaultdict(list)
    for t, v in zip(czasy, godzinowe):
        if v is not None:
            po_dniach[t[:10]].append(v)
    return po_dniach


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dni", type=int, default=60, help="ile dni wstecz (domyślnie 60)")
    ap.add_argument("--wykonaj", action="store_true")
    args = ap.parse_args()

    miasta = sorted({(l.get("miasto") or "").strip()
                     for l in rest("lokale?select=miasto&archived=is.false")} - {""})
    if not miasta:
        raise SystemExit("Żaden lokal nie ma ustawionego miasta (Pracownicy → Lokale).")

    print(f"\n  Miasta: {', '.join(miasta)}")
    print(f"  Tryb:   {'ZAPIS' if args.wykonaj else 'suchy przebieg'}\n")

    zmienne = ["temperature_2m", "precipitation"]
    for h in HORYZONTY:
        zmienne += [f"temperature_2m_previous_day{h}", f"precipitation_previous_day{h}"]

    for miasto in miasta:
        lat, lon = geocode(miasto)
        j = pobierz(
            "https://previous-runs-api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&hourly={','.join(zmienne)}"
            f"&past_days={args.dni}&forecast_days=0&timezone=Europe%2FWarsaw"
        )
        h = j["hourly"]
        czasy = h["time"]

        wiersze = []
        for horyzont in [0] + HORYZONTY:
            suf = "" if horyzont == 0 else f"_previous_day{horyzont}"
            temp = dobowe(h[f"temperature_2m{suf}"], czasy)
            opad = dobowe(h[f"precipitation{suf}"], czasy)
            for dzien, temps in temp.items():
                if len(temps) < 20:      # niepełna doba — nie liczymy z niej maksimum
                    continue
                wiersze.append({
                    "miasto": miasto,
                    "target_date": dzien,
                    "horizon_days": horyzont,
                    "temp_max": round(max(temps), 1),
                    "temp_min": round(min(temps), 1),
                    "opady_mm": round(sum(opad.get(dzien, [])), 2),
                    "kod": None,          # previous-runs nie podaje weather_code wstecz
                    "zrodlo": "previous_runs",
                })

        print(f"  {miasto}: {len(wiersze)} wierszy "
              f"({len(set(w['target_date'] for w in wiersze))} dni × {len(HORYZONTY)+1} horyzontów)")
        if args.wykonaj:
            for i in range(0, len(wiersze), 500):
                rest("weather_forecasts?on_conflict=miasto,target_date,horizon_days",
                     "POST", wiersze[i:i + 500],
                     prefer="resolution=ignore-duplicates")
            print("      zapisano")

    if not args.wykonaj:
        print("\n  To był suchy przebieg. Dodaj --wykonaj, żeby zapisać.\n")


if __name__ == "__main__":
    main()
