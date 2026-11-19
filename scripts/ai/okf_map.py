#!/usr/bin/env python3
"""Genera okf/maps/repo-map.md desde el árbol real de ProcesosSW."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("okf-map: falta PyYAML.\n")
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "okf"
OUTPUT = BUNDLE / "maps" / "repo-map.md"


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def js_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.rglob("*.js") if p.is_file())


def count_lines(paths: list[Path]) -> int:
    total = 0
    for path in paths:
        total += read(path).count("\n")
    return total


def table(headers: list[str], rows: list[list[Any]]) -> str:
    out = ["| " + " | ".join(headers) + " |"]
    out.append("|" + "|".join("---" for _ in headers) + "|")
    for row in rows:
        out.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(out)


def concept_counts() -> Counter[str]:
    counts: Counter[str] = Counter()
    if not BUNDLE.is_dir():
        return counts
    for path in BUNDLE.rglob("*.md"):
        if path.name in ("index.md", "log.md"):
            continue
        text = read(path)
        if not text.startswith("---\n"):
            continue
        end = text.find("\n---\n", 4)
        if end == -1:
            continue
        try:
            meta = yaml.safe_load(text[4:end])
        except yaml.YAMLError:
            continue
        if isinstance(meta, dict) and isinstance(meta.get("type"), str):
            counts[meta["type"]] += 1
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera el mapa OKF de ProcesosSW")
    parser.add_argument("--check", action="store_true", help="falla si el mapa no está actualizado")
    args = parser.parse_args()

    pkg = json.loads(read(ROOT / "package.json") or "{}")
    version = pkg.get("version", "?")

    js_dirs = ["servidor", "cliente", "compartido"]
    areas = []
    all_js: list[Path] = []
    for d in js_dirs:
        files = js_files(ROOT / d)
        all_js.extend(files)
        areas.append([f"`{d}/`", len(files), count_lines(files)])

    test_files = sorted((ROOT / "servidor").glob("*Spec.js")) + sorted((ROOT / "e2e").glob("*.spec.js"))
    tests = sum(read(f).count("it(") + read(f).count("test(") for f in test_files)

    largest = sorted(all_js, key=lambda p: read(p).count("\n"), reverse=True)[:10]
    largest_rows = [[f"`{p.relative_to(ROOT)}`", read(p).count("\n")] for p in largest]

    info_rows = [
        ["Node", "20+"],
        ["Versión", version],
        ["Tests Jasmine", str(len(list((ROOT / "servidor").glob("*Spec.js"))))],
        ["Tests e2e", str(len(list((ROOT / "e2e").glob("*.spec.js"))))],
    ]

    type_rows = [[name, count] for name, count in sorted(concept_counts().items())]

    today = date.today()
    generated_at = f"{today.isoformat()}T00:00:00Z"
    stale_after = (today + timedelta(days=180)).isoformat()

    parts = [
        "---",
        "type: Map",
        "title: Mapa del repositorio",
        "description: Estadísticas generadas desde el árbol real. No editar a mano.",
        "resource: repo://.",
        "tags: [mapa, generado, estadisticas]",
        "module: repo",
        f"generated: {{ by: tool:okf-map/1.0, at: {generated_at} }}",
        "status: stable",
        f"stale_after: {stale_after}",
        "---",
        "",
        "# Cómo se genera",
        "",
        "```bash",
        "python3 scripts/ai/okf_map.py",
        "python3 scripts/ai/okf_check.py",
        "```",
        "",
        "# Módulos y código",
        "",
        table(["Área", "Ficheros `.js`", "Líneas"], areas),
        "",
        "# Tests",
        "",
        f"- Jasmine: {len(list((ROOT / 'servidor').glob('*Spec.js')))} ficheros spec",
        f"- Playwright: {len(list((ROOT / 'e2e').glob('*.spec.js')))} ficheros spec",
        f"- Total aproximado de casos: {tests}",
        "",
        "# Ficheros más grandes",
        "",
        table(["Fichero", "Líneas"], largest_rows),
        "",
        "# Versiones y contratos",
        "",
        table(["Clave", "Valor"], info_rows),
        "",
        "# Conceptos del bundle por tipo",
        "",
        table(["Tipo", "Conceptos"], type_rows),
        "",
    ]
    content = "\n".join(parts)

    if args.check:
        if not OUTPUT.is_file():
            print("okf-map: falta el mapa", file=sys.stderr)
            return 1
        # simple check: regenerate and compare normalized
        current = read(OUTPUT)
        if current.strip() != content.strip():
            print("okf-map: mapa desfasado", file=sys.stderr)
            return 1
        print("okf-map: mapa actualizado")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"okf-map: escrito {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
