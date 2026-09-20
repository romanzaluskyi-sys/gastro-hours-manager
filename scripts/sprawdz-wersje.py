#!/usr/bin/env python3
"""Czy numer wersji stoi w czterech miejscach ten sam.

CLAUDE.md ("Wersjonowanie i CHANGELOG") każe przy każdym wydaniu zmienić
cztery pliki naraz. Zapomniany `public/version.json` nie psuje niczego
widocznie — pasek "dostępna nowa wersja" po prostu nigdy się nie pokaże albo
pokaże się bez powodu. Taka usterka nie boli od razu, więc potrafi przeżyć
kilka wydań; to jest dokładnie ten rodzaj rzeczy, którego nie pilnuje się
głową, tylko skryptem.

Uruchamiany przez CI (.github/workflows/ci.yml) i ręcznie:

    python3 scripts/sprawdz-wersje.py
"""
import json
import pathlib
import re
import sys

KORZEN = pathlib.Path(__file__).resolve().parent.parent


def z_configu():
    t = (KORZEN / "src" / "config.ts").read_text()
    m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', t)
    return m.group(1) if m else None


def z_version_json():
    t = (KORZEN / "public" / "version.json").read_text()
    try:
        return json.loads(t).get("version")
    except json.JSONDecodeError:
        return None


def z_changelog():
    t = (KORZEN / "CHANGELOG.md").read_text()
    m = re.search(r"^## (\d+\.\d+\.\d+)", t, re.MULTILINE)
    return m.group(1) if m else None


def z_przewodnika():
    t = (KORZEN / "src" / "components" / "manager" / "Przewodnik.tsx").read_text()
    m = re.search(r'version:\s*"([^"]+)"', t)
    return m.group(1) if m else None


ZRODLA = {
    "src/config.ts (APP_VERSION)": z_configu,
    "public/version.json": z_version_json,
    "CHANGELOG.md (pierwsza sekcja)": z_changelog,
    "Przewodnik.tsx (pierwszy wpis)": z_przewodnika,
}


def main():
    znalezione = {}
    for opis, czytaj in ZRODLA.items():
        try:
            znalezione[opis] = czytaj()
        except FileNotFoundError:
            znalezione[opis] = None

    for opis, wartosc in znalezione.items():
        print(f"  {wartosc or '(nie znaleziono)':<12} {opis}")

    brakujace = [o for o, w in znalezione.items() if not w]
    if brakujace:
        print("\nNie udało się odczytać wersji z: " + ", ".join(brakujace))
        return 1

    unikalne = set(znalezione.values())
    if len(unikalne) > 1:
        print(
            "\nROZJAZD WERSJI: " + ", ".join(sorted(unikalne)) + "\n"
            "Wszystkie cztery miejsca muszą mieć tę samą wartość — patrz\n"
            'CLAUDE.md, sekcja "Wersjonowanie i CHANGELOG".'
        )
        return 1

    print(f"\nOK — wszędzie {unikalne.pop()}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
