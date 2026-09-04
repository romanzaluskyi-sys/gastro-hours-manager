#!/usr/bin/env python3
"""Import grafiku z arkusza Google (CSV) do Supabase.

Domyślnie SUCHY PRZEBIEG — niczego nie zapisuje, tylko drukuje raport.
Zapis dopiero z --wykonaj.

    python3 scripts/import-grafik.py plik.csv                  # raport
    python3 scripts/import-grafik.py plik.csv --wykonaj        # zapis

Decyzje sterowane flagami (patrz docs/GRAFIK.md, sekcja "Import"):
  --lokal-z-kodu / --lokal-z-kolumny   co wygrywa przy rozjeździe (domyślnie: z kodu)
  --od RRRR-MM-DD                      importuj tylko od tej daty (domyślnie: wszystko)
  --urlop-godziny / --urlop-bez-godzin materializować urlop w shifts (domyślnie: bez)
"""
import argparse, csv, datetime, json, sys, urllib.request, collections

SUPABASE_URL = "https://gdzossvaauznqsrfqovw.supabase.co"
SUPABASE_KEY = "sb_publishable_4SuEM6I6VujiuBtqGze1Nw_vFoeoM3S"
URLOP_START_HOUR, URLOP_HOURS = 9, 8


def rest(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(req) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--wykonaj", action="store_true")
    ap.add_argument("--lokal-z-kolumny", action="store_true")
    ap.add_argument("--od")
    ap.add_argument("--urlop-godziny", action="store_true")
    a = ap.parse_args()

    users = rest("users?select=id,name,default_lokal,archived")
    stan = rest("stanowiska?select=name,skrot,lokal_name,archived")
    po_imieniu = {u["name"]: u for u in users}

    def krotko(n):
        return "".join(w[0] for w in n.split())[:3].upper()

    kod_do_stanowiska = {}
    for s in stan:
        if s.get("archived"):
            continue
        kod_do_stanowiska[(s.get("skrot") or krotko(s["name"])).upper()] = s

    rows = list(csv.DictReader(open(a.csv, encoding="utf-8")))
    zmiany, urlopy, odrzucone = [], [], []

    for r in rows:
        try:
            dzien = datetime.date(int(r["Rok"]), int(r["Miesiąc"]), int(r["Dzien"]))
        except ValueError:
            odrzucone.append((r, "zła data"))
            continue
        if a.od and str(dzien) < a.od:
            continue
        user = po_imieniu.get(r["Pracownik"])
        if not user:
            odrzucone.append((r, "nieznany pracownik"))
            continue

        if r["Stanowisko"].upper() == "URP":
            urlopy.append({"user": user, "date": dzien, "godzin": r["Początek"] != r["Koniec"]})
            continue

        st = kod_do_stanowiska.get(r["Stanowisko"].upper())
        if not st:
            odrzucone.append((r, f"nieznane stanowisko {r['Stanowisko']}"))
            continue
        lokal = r["Lokal"] if (a.lokal_z_kolumny and r["Lokal"]) else st["lokal_name"]
        zmiany.append({
            "lokal": lokal,
            "user_id": user["id"],
            "user_name": user["name"],
            "stanowisko": st["name"],
            "date": str(dzien),
            "start_time": r["Początek"][:5],
            "end_time": r["Koniec"][:5],
        })

    # urlopy -> ciągłe zakresy per osoba
    zakresy = []
    per = collections.defaultdict(list)
    for u in urlopy:
        per[u["user"]["name"]].append(u)
    for imie, lista in per.items():
        lista.sort(key=lambda x: x["date"])
        start = prev = lista[0]
        for x in lista[1:]:
            if (x["date"] - prev["date"]).days == 1:
                prev = x
            else:
                zakresy.append((lista[0]["user"], start["date"], prev["date"]))
                start = prev = x
        zakresy.append((lista[0]["user"], start["date"], prev["date"]))

    print(f"CSV: {len(rows)} wierszy")
    print(f"  zmiany do grafik_shifts : {len(zmiany)}")
    print(f"  dni urlopu              : {len(urlopy)}  ->  {len(zakresy)} zakresów")
    print(f"  odrzucone               : {len(odrzucone)}")
    for r, powod in odrzucone[:10]:
        print("     ", powod, r)
    print("\n  wg lokalu:", dict(collections.Counter(z["lokal"] for z in zmiany)))
    print("  zakres dat:", min(z['date'] for z in zmiany), "→", max(z['date'] for z in zmiany))
    print("\n  urlopy:")
    for user, od, do in zakresy:
        print(f"     {user['name']:10} {od} → {do}")

    if not a.wykonaj:
        print("\nSUCHY PRZEBIEG — nic nie zapisano. Dodaj --wykonaj, żeby zapisać.")
        return

    teraz = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for i, z in enumerate(zmiany, 1):
        rest("grafik_shifts", "POST", {**z, "published_at": teraz, "updated_at": teraz})
        if i % 100 == 0:
            print(f"  zapisano {i}/{len(zmiany)} zmian...")
    print(f"  zapisano {len(zmiany)} zmian")

    for user, od, do in zakresy:
        abs_row = rest("absences", "POST", {
            "user_id": user["id"], "user_name": user["name"],
            "lokal": user.get("default_lokal") or None,
            "start_date": str(od), "end_date": str(do),
            "type": "urlop", "status": "approved",
            "requested_by": "manager", "decided_by": "Import z arkusza",
            "decided_at": teraz, "note": "Import z Google Sheets",
        })[0]
        if a.urlop_godziny:
            cur = od
            while cur <= do:
                if cur.weekday() < 5:
                    s = datetime.datetime(cur.year, cur.month, cur.day, URLOP_START_HOUR)
                    e = s + datetime.timedelta(hours=URLOP_HOURS)
                    rest("shifts", "POST", {
                        "user_id": user["id"], "user_name": user["name"],
                        "lokal": user.get("default_lokal"), "stanowisko": "Urlop",
                        "start_time": s.isoformat(), "end_time": e.isoformat(),
                        "godzin": URLOP_HOURS, "is_urlop": True, "absence_id": abs_row["id"],
                    })
                cur += datetime.timedelta(days=1)
    print(f"  zapisano {len(zakresy)} urlopów")


if __name__ == "__main__":
    main()
