#!/usr/bin/env python3
"""Valida el bundle OKF v0.2 de ProcesosSW."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("okf-check: falta PyYAML.\n")
    raise SystemExit(2)

RESERVED = {"index.md", "log.md"}
STATUSES = {"draft", "stable", "deprecated"}
TYPES = {
    "System",
    "Domain Concept",
    "Data Format",
    "Decision",
    "Playbook",
    "Constraint",
    "Reference",
    "Map",
    "Proposal",
}
MODULES = {"servidor", "cliente", "compartido", "repo", "okf"}
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
FOOTNOTE_REF_RE = re.compile(r"\[\^([^\]]+)\]")
FOOTNOTE_DEF_RE = re.compile(r"^\[\^([^\]]+)\]:", re.MULTILINE)
DATE_HEADING_RE = re.compile(r"^## (\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE)


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.concepts = 0

    def error(self, path: Path, message: str) -> None:
        self.errors.append(f"{path}: {message}")

    def warn(self, path: Path, message: str) -> None:
        self.warnings.append(f"{path}: {message}")


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def split_frontmatter(text: str) -> tuple[str | None, str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return None, text
    return text[4:end], text[end + 5 :]


def parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def repo_path(resource: str) -> Path | None:
    if not resource.startswith("repo://"):
        return None
    raw = resource[len("repo://") :].strip()
    if raw in ("", "."):
        return Path(".")
    return Path(raw)


def link_target(raw: str) -> str:
    target = raw.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()
    if " " in target and not target.startswith(("http://", "https://")):
        target = target.split(" ", 1)[0]
    return target


def normalize_target(raw: str) -> str | None:
    target = link_target(raw)
    if not target:
        return None
    if target.startswith(("http://", "https://", "mailto:", "tel:", "#")):
        return None
    target = target.split("#", 1)[0].strip()
    return target or None


def check_bundle(bundle: Path) -> Report:
    report = Report()
    root = bundle
    if not root.is_dir():
        report.error(root, "no existe el directorio del bundle")
        return report

    index = root / "index.md"
    if not index.is_file():
        report.error(index, "falta index.md raíz")
    else:
        raw, body = split_frontmatter(index.read_text(encoding="utf-8"))
        meta = yaml.safe_load(raw) if raw else None
        if not isinstance(meta, dict):
            report.error(index, "index.md raíz sin frontmatter")
        elif str(meta.get("okf_version", "")) != "0.2":
            report.error(index, "index.md raíz debe declarar okf_version: \"0.2\"")

    files = sorted(p for p in root.rglob("*.md") if p.is_file())
    if not files:
        report.error(root, "el bundle no contiene ficheros Markdown")
        return report

    concept_ids: set[str] = set()
    graph: dict[str, set[str]] = {}
    today = date.today()
    titles: dict[str, str] = {}

    for path in files:
        name = path.name
        text = path.read_text(encoding="utf-8")
        raw, body = split_frontmatter(text)
        concept_id = str(path.relative_to(root).with_suffix(""))
        concept_ids.add(concept_id)

        links: set[str] = set()
        for match in LINK_RE.finditer(body):
            target = normalize_target(match.group(1))
            if target is None:
                continue
            resolved = (root / target.lstrip("/")) if target.startswith("/") else (path.parent / target)
            resolved = resolved.resolve()
            if not resolved.exists():
                report.error(path, f"enlace roto: {match.group(1)}")
                continue
            try:
                linked_id = str(resolved.relative_to(root.resolve()).with_suffix(""))
            except ValueError:
                continue
            if resolved.suffix == ".md":
                links.add(linked_id)
        graph[concept_id] = links

        if name == "log.md":
            dates = DATE_HEADING_RE.findall(body)
            parsed = [parse_date(d) for d in dates]
            if not dates:
                report.warn(path, "log.md sin entradas fechadas")
            if any(p is None for p in parsed):
                report.error(path, "log.md tiene una fecha con formato inválido")
            elif parsed != sorted(parsed, reverse=True):
                report.error(path, "log.md debe ordenar las fechas de más reciente a más antigua")
            continue

        if name == "index.md":
            if not re.search(r"^#\s+\S", body, re.MULTILINE):
                report.error(index, "index.md sin encabezado")
            continue

        report.concepts += 1
        meta = yaml.safe_load(raw) if raw else None
        if not isinstance(meta, dict):
            report.error(path, "concepto sin frontmatter YAML parseable")
            continue

        concept_type = meta.get("type")
        if not isinstance(concept_type, str) or not concept_type.strip():
            report.error(path, "falta 'type' no vacío")
        elif concept_type not in TYPES:
            report.warn(path, f"type fuera de la convención del repo: {concept_type!r}")

        for field in ("title", "description"):
            value = meta.get(field)
            if not isinstance(value, str) or not value.strip():
                report.error(path, f"falta '{field}' no vacío")

        title = meta.get("title")
        if isinstance(title, str) and title.strip():
            # track duplicates loosely
            pass

        status = meta.get("status")
        if status is None:
            report.warn(path, "sin 'status' (usa draft|stable|deprecated)")
        elif status not in STATUSES:
            report.error(path, f"status inválido: {status!r}")

        module = meta.get("module")
        if module is not None and module not in MODULES:
            report.error(path, f"module inválido: {module!r}")

        generated = meta.get("generated")
        if not isinstance(generated, dict):
            report.warn(path, "sin 'generated: { by, at }'")
        else:
            if not isinstance(generated.get("by"), str) or not generated["by"].strip():
                report.error(path, "generated.by debe ser una cadena no vacía")
            if parse_datetime(generated.get("at")) is None:
                report.error(path, "generated.at debe ser ISO-8601")

        verified = meta.get("verified")
        if verified is not None:
            if not isinstance(verified, dict):
                report.error(path, "verified debe ser un objeto { by, at }")
            else:
                by = str(verified.get("by", ""))
                if by.startswith("agent:"):
                    report.error(path, "un agente no puede firmar 'verified'")
                if parse_datetime(verified.get("at")) is None:
                    report.error(path, "verified.at debe ser ISO-8601")

        stale = meta.get("stale_after")
        if stale is None:
            report.warn(path, "sin 'stale_after'")
        else:
            parsed_stale = parse_date(stale)
            if parsed_stale is None:
                report.error(path, "stale_after debe ser YYYY-MM-DD")
            elif parsed_stale < date.today() and status != "deprecated":
                report.error(path, f"concepto caducado (stale_after {stale})")

        resource = meta.get("resource")
        if isinstance(resource, str):
            target = repo_path(resource)
            if target is not None and not target.exists():
                report.error(path, f"resource no existe: {resource}")

        sources = meta.get("sources")
        if sources is not None:
            if not isinstance(sources, list):
                report.error(path, "sources debe ser una lista")
            else:
                for source in sources:
                    if not isinstance(source, dict):
                        report.error(path, "cada source debe ser un objeto")
                        continue
                    source_resource = source.get("resource")
                    if not isinstance(source_resource, str) or not source_resource:
                        report.error(path, "source sin 'resource'")
                        continue
                    target = repo_path(source_resource)
                    if target is not None and not target.exists():
                        report.error(path, f"source no existe: {source_resource}")

        tests = meta.get("tests")
        if tests is not None:
            values = [tests] if isinstance(tests, str) else tests
            if not isinstance(values, list):
                report.error(path, "tests debe ser una lista de rutas o una ruta")
            else:
                for value in values:
                    if not isinstance(value, str) or not Path(value).exists():
                        report.error(path, "test declarado no existe: {value!r}")

        refs = set(FOOTNOTE_REF_RE.findall(body))
        defs = set(FOOTNOTE_DEF_RE.findall(body))
        for ref in sorted(refs - defs):
            report.error(path, f"nota al pie sin definición: [^{ref}]")
        for definition in sorted(defs - refs):
            report.warn(path, f"nota al pie sin referencia: [^{definition}]")

    if "index" in graph:
        seen: set[str] = set()
        stack = ["index"]
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            stack.extend(graph.get(current, set()) - seen)
        for concept_id in sorted(concept_ids - seen):
            if concept_id in ("index", "log"):
                continue
            report.error(root / f"{concept_id}.md", "concepto no enlazado desde index.md")

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida el bundle OKF de ProcesosSW")
    parser.add_argument("--bundle", default="okf", help="directorio del bundle (default: okf)")
    args = parser.parse_args()

    report = check_bundle(Path(args.bundle))
    for warning in report.warnings:
        print(f"aviso: {warning}")
    for error in report.errors:
        print(f"error: {error}", file=sys.stderr)

    print(
        f"okf-check: {report.concepts} conceptos, "
        f"{len(report.errors)} errores, {len(report.warnings)} avisos"
    )
    return 1 if report.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
