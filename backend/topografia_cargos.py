"""Helpers de cargos / operadores de topografía."""
from __future__ import annotations

import unicodedata


def normalizar_texto_cargo(valor: str | None) -> str:
    """Minúsculas sin acentos para comparar nombres de cargo."""
    s = unicodedata.normalize("NFD", (valor or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def es_cargo_topografia(nombre_cargo: str | None) -> bool:
    """True si el cargo pertenece a la disciplina de topografía.

    Incluye Topógrafo, Coordinador/Auxiliar de Topografía, Cadenero y
    Desarrollador (soporte interno). La comparación ignora acentos
    (p. ej. «Topógrafo» → topografo).
    """
    n = normalizar_texto_cargo(nombre_cargo)
    if not n:
        return False
    return (
        "topograf" in n
        or "cadenero" in n
        or "desarrollador" in n
    )
