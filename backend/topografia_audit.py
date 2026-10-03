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

from typing import Any, Dict, Iterable, List, Optional

from main import registrar_log

MODULO_TOPOGRAFIA = "TOPOGRAFIA"

ENTIDAD_PLANILLA_TUBERIA = "topo_planilla_tuberia"
ENTIDAD_POLIGONAL = "topo_poligonal"
ENTIDAD_NIVELACION = "topo_nivelacion"

# Campos de cartera de campo auditables (no columnas calculadas).
_CARTERA_CAMPOS = (
    "abscisa",
    "terreno_natural",
    "subrasante_via",
    "terminado_filtro",
    "cota_lomo",
    "cota_fondo_excavacion",
    "norte",
    "este",
    "observacion",
)

# Dimensiones / attrs editables en Resumen y Descuentos.
_LINEA_EDITABLE_CAMPOS = (
    "long", "ancho", "espesor", "nombre", "cantidad", "descontar_de",
)


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


def _audit_scalar(v: Any) -> Any:
    """Normaliza escalares para diff estable (números finitos, strings trim)."""
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return v
        if f != f:  # NaN
            return None
        if abs(f - round(f)) < 1e-9:
            return int(round(f))
        return round(f, 6)
    if isinstance(v, str):
        s = v.strip()
        return s if s else None
    return v


def _abs_token(v: Any) -> str:
    n = _audit_scalar(v)
    if n is None:
        return "sin_abs"
    return str(n).replace(".", "_").replace("-", "m")


def _fila_cartera_key(f: dict) -> str:
    try:
        orden = int(f.get("orden") or 0)
    except (TypeError, ValueError):
        orden = 0
    return f"fila_{orden}_abs_{_abs_token(f.get('abscisa'))}"


def _pick_linea_editable(row: Optional[dict]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    if not isinstance(row, dict):
        return out
    for k in _LINEA_EDITABLE_CAMPOS:
        if k not in row:
            continue
        val = _audit_scalar(row.get(k))
        if val is not None:
            out[k] = val
    return out


def snapshot_tablas_planilla_tuberia(
    *,
    filas: Optional[Iterable[dict]] = None,
    cantidades_manuales: Optional[Iterable[dict]] = None,
    descuentos_manuales: Optional[Iterable[dict]] = None,
) -> Dict[str, Any]:
    """
    Snapshot anidado de Cartera / Resumen / Descuentos para diff Campo/Anterior/Nuevo.

    Usa dicts indexados por fila/ítem (no listas) para que `camposModificados` del
    frontend expanda ruta a ruta (p.ej. cartera.fila_2_abs_10.terreno_natural).
    """
    cartera: Dict[str, Any] = {}
    for f in filas or []:
        if not isinstance(f, dict):
            continue
        key = _fila_cartera_key(f)
        row: Dict[str, Any] = {}
        try:
            row["orden"] = int(f.get("orden") or 0)
        except (TypeError, ValueError):
            row["orden"] = 0
        for c in _CARTERA_CAMPOS:
            val = _audit_scalar(f.get(c))
            if val is not None:
                row[c] = val
        cartera[key] = row

    resumen: Dict[str, Any] = {}
    for c in cantidades_manuales or []:
        if not isinstance(c, dict):
            continue
        cod = str(c.get("codigo") or "").strip().upper()
        if not cod:
            continue
        linea = _pick_linea_editable(c)
        if linea:
            resumen[cod] = linea

    descuentos: Dict[str, Any] = {}
    for d in descuentos_manuales or []:
        if not isinstance(d, dict):
            continue
        cod = str(d.get("codigo") or "").strip().upper()
        if not cod:
            continue
        if cod == "DESC_OTROS":
            cod = "DESC_OTROS_1"
        linea = _pick_linea_editable(d)
        if linea:
            descuentos[cod] = linea

    return {
        "cartera": cartera,
        "resumen_cantidades": resumen,
        "descuentos_especificos": descuentos,
    }


def snapshot_edicion_planilla_tuberia(
    planilla: Optional[dict],
    *,
    filas: Optional[Iterable[dict]] = None,
    cantidades_manuales: Optional[Iterable[dict]] = None,
    descuentos_manuales: Optional[Iterable[dict]] = None,
) -> Dict[str, Any]:
    """Cabecera planilla + tablas editables (para valor_anterior / valor_nuevo)."""
    out: Dict[str, Any] = dict(snapshot_planilla_tuberia(planilla) or {})
    out.update(snapshot_tablas_planilla_tuberia(
        filas=filas,
        cantidades_manuales=cantidades_manuales,
        descuentos_manuales=descuentos_manuales,
    ))
    return out


def contar_campos_modificados(valor_anterior: Any, valor_nuevo: Any) -> int:
    """Cuenta hojas distintas (misma semántica que el diff del frontend)."""
    def _walk(a, b) -> int:
        if isinstance(a, dict) or isinstance(b, dict):
            left = a if isinstance(a, dict) else {}
            right = b if isinstance(b, dict) else {}
            keys = set(left) | set(right)
            return sum(_walk(left.get(k), right.get(k)) for k in keys)
        if a is None and b is None:
            return 0
        try:
            if a == b:
                return 0
        except Exception:
            pass
        return 0 if a == b else 1

    return _walk(valor_anterior, valor_nuevo)


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
