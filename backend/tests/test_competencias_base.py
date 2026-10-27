"""Catálogo base de competencias del contrato (COMPETENCIAS_BASE)."""
from __future__ import annotations

import ast
from pathlib import Path


def _load_competencias_base() -> list[str]:
    """Lee COMPETENCIAS_BASE sin importar main.py (pesado / side-effects)."""
    src = (Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
    marker = "COMPETENCIAS_BASE ="
    start = src.index(marker) + len(marker)
    # Lista literal hasta el cierre de corchete de primer nivel
    i = start
    while i < len(src) and src[i] != "[":
        i += 1
    depth = 0
    end = i
    for j in range(i, len(src)):
        if src[j] == "[":
            depth += 1
        elif src[j] == "]":
            depth -= 1
            if depth == 0:
                end = j + 1
                break
    return list(ast.literal_eval(src[i:end]))


def test_competencias_base_incluye_red_matriz_idu():
    base = _load_competencias_base()
    assert "Red Matriz IDU" in base
    assert base.count("Red Matriz IDU") == 1
    # Nombre exacto: mayúsculas/espacios (sin variantes)
    assert "Red matriz IDU" not in base
    assert "RED MATRIZ IDU" not in base
    assert "RedMatriz IDU" not in base


def test_competencias_base_conserva_existentes():
    base = set(_load_competencias_base())
    for nombre in (
        "Alumbrado P.",
        "EAB",
        "ENEL-CODENSA",
        "ETB",
        "Gas Natural",
        "ICCU",
        "IDU",
        "MOVISTAR",
    ):
        assert nombre in base
