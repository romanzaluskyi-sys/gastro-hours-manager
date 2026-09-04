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

    # URP z arkusza rozpada się na dwie różne rzeczy:
    #  * dzień z godzinami (09-17)          -> dzień urlopu
    #  * dzień zerowy w SOBOTĘ/NIEDZIELĘ    -> weekend w środku urlopu, wchodzi
    #                                          w zakres, godzin i tak nie daje
    #  * dzień zerowy w DZIEŃ ROBOCZY       -> NIE urlop: pracownik nie mógł
    #                                          przyjść, ale prawnie godzin nie
    #                                          było (ustalenie właściciela) ->
    #                                          zapisujemy jako niedostępność
    def scal(dni):
        """Ciągłe zakresy dat z posortowanej listy."""
        out = []
        if not dni:
            return out
        start = prev = dni[0]
        for x in dni[1:]:
            if (x - prev).days == 1:
                prev = x
            else:
                out.append((start, prev))
                start = prev = x
        out.append((start, prev))
        return out

    zakresy, zakresy_nd = [], []
    per = collections.defaultdict(list)
    for u in urlopy:
        per[u["user"]["name"]].append(u)
    for imie, lista in per.items():
        user = lista[0]["user"]
        lista.sort(key=lambda x: x["date"])
        dni_urlopu = sorted(
            x["date"] for x in lista if x["godzin"] or x["date"].weekday() >= 5
        )
        dni_nd = sorted(
            x["date"] for x in lista if not x["godzin"] and x["date"].weekday() < 5
        )
        # weekend na samym KOŃCU zakresu nie jest już urlopem — to po prostu
        # wolne, więc nie doklejamy go do zakresu (godzin i tak nie daje).
        dni_z_godzinami = {x["date"] for x in lista if x["godzin"]}
        while dni_urlopu and dni_urlopu[-1] not in dni_z_godzinami:
            dni_urlopu.pop()
        zakresy += [(user, a, b) for a, b in scal(dni_urlopu)]
        zakresy_nd += [(user, a, b) for a, b in scal(dni_nd)]

    print(f"CSV: {len(rows)} wierszy")
    print(f"  zmiany do grafik_shifts : {len(zmiany)}")
    print(f"  dni URP w arkuszu       : {len(urlopy)}")
    print(f"    -> urlop              : {len(zakresy)} zakresów")
    print(f"    -> niedostępność      : {len(zakresy_nd)} zakresów (dzień roboczy bez godzin)")
    print(f"  odrzucone               : {len(odrzucone)}")
    for r, powod in odrzucone[:10]:
        print("     ", powod, r)
    print("\n  wg lokalu:", dict(collections.Counter(z["lokal"] for z in zmiany)))
    print("  zakres dat:", min(z['date'] for z in zmiany), "→", max(z['date'] for z in zmiany))
    print("\n  urlopy (z godzinami 8h/dzień roboczy):")
    for user, od, do in zakresy:
        dni_rob = sum(
            1
            for i in range((do - od).days + 1)
            if (od + datetime.timedelta(days=i)).weekday() < 5
        )
        print(f"     {user['name']:10} {od} → {do}   ({dni_rob} dni rob. = {dni_rob * URLOP_HOURS} h)")
    if zakresy_nd:
        print("\n  niedostępność (bez godzin):")
        for user, od, do in zakresy_nd:
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
    for user, od, do in zakresy_nd:
        rest("absences", "POST", {
            "user_id": user["id"], "user_name": user["name"],
            "lokal": user.get("default_lokal") or None,
            "start_date": str(od), "end_date": str(do),
            "type": "niedostepnosc", "status": "approved",
            "requested_by": "manager", "decided_by": "Import z arkusza",
            "decided_at": teraz, "note": "Import z Google Sheets — dzień bez godzin",
        })
    print(f"  zapisano {len(zakresy)} urlopów i {len(zakresy_nd)} niedostępności")


if __name__ == "__main__":
    main()
