"""
Diagnóstico: registros «vacíos» típicos de líneas de plantilla no diligenciadas.
No elimina ni modifica: solo clasifica.
Heurística: tiene nombre; sin dims/cantidad_total; sin observación; sin foto.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def _empty(v: Any) -> bool:
    return v is None or v == ""


def _sin_dims(row: dict) -> bool:
    return (
        _empty(row.get("longitud"))
        and _empty(row.get("ancho"))
        and _empty(row.get("espesor"))
        and _empty(row.get("cantidad"))
        and _empty(row.get("cantidad_total"))
    )


def _sin_obs(row: dict) -> bool:
    return not str(row.get("observacion") or "").strip()


def _sin_foto(row: dict) -> bool:
    if row.get("foto_url"):
        return False
    hist = row.get("fotos_historial")
    if isinstance(hist, list) and any(isinstance(f, dict) and f.get("url") for f in hist):
        return False
    return True


def registro_vacio_tipo_plantilla(row: Optional[dict]) -> bool:
    if not isinstance(row, dict):
        return False
    if not str(row.get("nombre") or "").strip():
        return False
    return _sin_dims(row) and _sin_obs(row) and _sin_foto(row)


def resumir_registros_vacios_plantilla(rows: List[dict]) -> Dict[str, Any]:
    vacios = [r for r in (rows or []) if registro_vacio_tipo_plantilla(r)]
    por_reporte: Dict[Any, list] = {}
    for r in vacios:
        rid = r.get("reporte_id")
        por_reporte.setdefault(rid, []).append(
            {
                "id": r.get("id"),
                "numero_registro": r.get("numero_registro"),
                "nombre": r.get("nombre"),
            }
        )
    reportes = [
        {
            "reporte_id": rid,
            "count": len(items),
            "registros": items,
        }
        for rid, items in sorted(
            por_reporte.items(),
            key=lambda kv: (kv[0] is None, kv[0] if kv[0] is not None else 0),
        )
    ]
    return {
        "count": len(vacios),
        "reportes": reportes,
        "nota": (
            "Heurística: nombre con dims/obs/foto vacíos (típico de línea de plantilla "
            "subida sin diligenciar). No se eliminan ni modifican."
        ),
    }
