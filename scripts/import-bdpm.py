"""Build the local drug catalogue from the official BDPM CIS and COMPO files."""

import argparse
import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path


def rows(path):
    data = path.read_bytes()
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
    return csv.reader(text.splitlines(), delimiter="\t", quoting=csv.QUOTE_NONE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("specialties", type=Path, help="Official CIS_bdpm.txt")
    parser.add_argument("composition", type=Path, help="Official CIS_COMPO_bdpm.txt")
    parser.add_argument("--specialties-date", type=date.fromisoformat, required=True)
    parser.add_argument("--composition-date", type=date.fromisoformat, required=True)
    args = parser.parse_args()

    substances = defaultdict(list)
    for cis, _, _, substance, _, _, nature, _ in rows(args.composition):
        if nature == "SA" and substance not in substances[cis]:
            substances[cis].append(substance)

    specialties = []
    seen = set()
    for row in rows(args.specialties):
        cis, name, form, routes, authorization, _, market = row[:7]
        if len(cis) != 8 or not cis.isascii() or not cis.isdecimal() or cis in seen:
            raise ValueError(f"Code CIS invalide ou dupliqué : {cis!r}")
        seen.add(cis)
        specialties.append([cis, name, form, routes, authorization, market, substances[cis]])

    if len(specialties) < 10_000:
        raise ValueError("Le fichier des spécialités semble incomplet.")

    catalogue = {
        "specialtiesDate": str(args.specialties_date),
        "compositionDate": str(args.composition_date),
        "specialties": specialties,
    }
    target = Path(__file__).resolve().parents[1] / "dist" / "assets" / "medicaments-bdpm.json"
    target.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
