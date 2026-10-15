"""Agrupación del Resumen de Cantidades (PDF/Excel) — solo presentación."""
from __future__ import annotations

from typing import Any, Callable, Optional

from topografia_planilla_tuberia import es_codigo_otros, nombre_triturado_por_tipo

GRUPOS_RESUMEN = (
    {"id": "excavacion", "titulo": "Excavación", "base": "EXC"},
    {"id": "tuberia", "titulo": "Tubería", "base": "TUB"},
    {"id": "triturado", "titulo": "Mat. granular", "base": "TRI"},
    {"id": "relleno", "titulo": "Relleno granular", "base": "REL"},
    {"id": "geotextil", "titulo": "Geotextil", "base": "GEO"},
    {"id": "otros", "titulo": "Otros", "base": None},
)

_BASE_A_GRUPO = {
    "EXC": "excavacion",
    "EXC_ROC": "excavacion",
    "TUB": "tuberia",
    "TRI": "triturado",
    "REL": "relleno",
    "GEO": "geotextil",
}

_GRUPO_ALIAS = {
    "exc": "excavacion",
    "excavacion": "excavacion",
    "tub": "tuberia",
    "tuberia": "tuberia",
    "tri": "triturado",
    "triturado": "triturado",
    "rel": "relleno",
    "relleno": "relleno",
    "geo": "geotextil",
    "geotextil": "geotextil",
    "otros": "otros",
}


def titulo_grupo_resumen(grupo_id: str, tipo: Optional[str] = None) -> str:
    if grupo_id == "triturado":
        return nombre_triturado_por_tipo(tipo)
    for g in GRUPOS_RESUMEN:
        if g["id"] == grupo_id:
            return str(g["titulo"])
    return str(grupo_id or "")


def grupo_id_de_linea(codigo: Any, override: Optional[dict] = None) -> str:
    cod = str(codigo or "").strip().upper()
    if cod in _BASE_A_GRUPO:
        return _BASE_A_GRUPO[cod]
    if es_codigo_otros(cod):
        raw = str((override or {}).get("grupo") or "").strip().lower()
        if raw and raw in _GRUPO_ALIAS:
            return _GRUPO_ALIAS[raw]
        return "otros"
    return "otros"


def agrupar_netos_resumen(
    netos: Optional[list],
    *,
    tipo: Optional[str] = None,
    display_neto: Optional[Callable[[dict], Any]] = None,
) -> list[dict[str, Any]]:
    """Total de grupo = suma de netos visibles (informativo; no altera fórmulas)."""

    def _neto(n: dict) -> float:
        if display_neto is not None:
            try:
                return float(display_neto(n) or 0)
            except (TypeError, ValueError):
                return 0.0
        raw = n.get("neto")
        if raw is None:
            raw = n.get("cantidad")
        try:
            return float(raw or 0)
        except (TypeError, ValueError):
            return 0.0

    buckets: dict[str, list] = {g["id"]: [] for g in GRUPOS_RESUMEN}
    for n in netos or []:
        if not isinstance(n, dict):
            continue
        gid = grupo_id_de_linea(n.get("codigo"), n)
        buckets.setdefault(gid, []).append(n)

    out: list[dict[str, Any]] = []
    for g in GRUPOS_RESUMEN:
        lineas = buckets.get(g["id"]) or []
        total = round(sum(_neto(n) for n in lineas), 2)
        out.append({
            "id": g["id"],
            "titulo": titulo_grupo_resumen(g["id"], tipo),
            "base": g["base"],
            "total": total,
            "lineas": lineas,
        })
    return out
