"""
Auditoría Topografía — wrappers sobre `registrar_log` / tabla `logs`.

Reutiliza el mismo sistema de trazabilidad de Almacén/Presupuesto/SICOE.
No crea tablas ni flujos paralelos.

entidad_tipo:
  - topo_planilla_tuberia
  - topo_poligonal
  - topo_nivelacion
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from main import registrar_log

MODULO_TOPOGRAFIA = "TOPOGRAFIA"

ENTIDAD_PLANILLA_TUBERIA = "topo_planilla_tuberia"
ENTIDAD_POLIGONAL = "topo_poligonal"
ENTIDAD_NIVELACION = "topo_nivelacion"


def _pick(row: Optional[dict], keys: tuple) -> Optional[dict]:
    if not row:
        return None
    out: Dict[str, Any] = {}
    for k in keys:
        if k in row and row.get(k) is not None:
            out[k] = row.get(k)
    return out or None


def snapshot_planilla_tuberia(p: Optional[dict]) -> Optional[dict]:
    return _pick(p, (
        "id", "contrato_id", "nombre", "tipo", "estado", "pk_id", "costado",
        "version", "nivel1_estado", "nivel2_estado", "cerrado_at", "validado_at",
    ))


def snapshot_poligonal(p: Optional[dict]) -> Optional[dict]:
    return _pick(p, (
        "id", "contrato_id", "nombre", "tipo", "estado",
        "nivel1_estado", "nivel2_estado", "ajustada_at", "biblioteca_at",
    ))


def snapshot_nivelacion(n: Optional[dict]) -> Optional[dict]:
    return _pick(n, (
        "id", "contrato_id", "nombre", "estado", "tipo_nivel",
        "nivel1_estado", "nivel2_estado", "biblioteca_at", "abierto_at",
    ))


def log_topo(
    usuario,
    accion: str,
    entidad_tipo: str,
    entidad_id,
    detalle: Optional[dict] = None,
    *,
    valor_anterior=None,
    valor_nuevo=None,
) -> None:
    """Envuelve registrar_log(modulo=TOPOGRAFIA); nunca propaga fallos de auditoría."""
    try:
        registrar_log(
            usuario,
            accion,
            MODULO_TOPOGRAFIA,
            entidad_tipo,
            entidad_id,
            detalle or {},
            valor_anterior=valor_anterior,
            valor_nuevo=valor_nuevo,
        )
    except Exception:
        pass
