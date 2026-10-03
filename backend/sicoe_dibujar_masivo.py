"""
Clasificación de resultados del dibujo masivo de huellas (SicoeObra).
Puro / sin I/O — misma semántica que el endpoint dibujar-masivo.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def resumen_vacio() -> dict:
    return {
        "precisos": 0,
        "aproximados": 0,
        "no_dibujados": 0,
        "con_inconsistencia": 0,
        "hallazgos": 0,
        "procesados": 0,
        "omitidos_ya_dibujados": 0,
    }


def clasificar_resultado_dibujo(fr: Optional[dict]) -> str:
    """
    Retorna: preciso | aproximado | no_dibujado
    """
    if not fr or fr.get("omitido") or not fr.get("huella"):
        return "no_dibujado"
    prec = str(fr.get("precision") or "").strip().lower()
    if prec == "precisa":
        return "preciso"
    return "aproximado"


def acumular_resultado(
    resumen: dict,
    fr: Optional[dict],
    *,
    ya_dibujado: bool = False,
) -> dict:
    """Mutates and returns resumen."""
    out = resumen if resumen is not None else resumen_vacio()
    if ya_dibujado:
        out["omitidos_ya_dibujados"] = int(out.get("omitidos_ya_dibujados") or 0) + 1
        return out
    out["procesados"] = int(out.get("procesados") or 0) + 1
    clase = clasificar_resultado_dibujo(fr)
    if clase == "preciso":
        out["precisos"] = int(out.get("precisos") or 0) + 1
    elif clase == "aproximado":
        out["aproximados"] = int(out.get("aproximados") or 0) + 1
    else:
        out["no_dibujados"] = int(out.get("no_dibujados") or 0) + 1
    hall = list((fr or {}).get("hallazgos") or [])
    out["hallazgos"] = int(out.get("hallazgos") or 0) + len(hall)
    if hall:
        out["con_inconsistencia"] = int(out.get("con_inconsistencia") or 0) + 1
    return out


def merge_resumenes(a: dict, b: dict) -> dict:
    keys = set(resumen_vacio()) | set(a or {}) | set(b or {})
    return {k: int((a or {}).get(k) or 0) + int((b or {}).get(k) or 0) for k in keys}
