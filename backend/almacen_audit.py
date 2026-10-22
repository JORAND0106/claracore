"""
Auditoría Almacén — snapshots y helpers sobre `registrar_log` / tabla `logs`.

entidad_tipo:
  - solicitud
  - entrada_item  (historial por línea/insumo; no por remisión agregada)
  - salida
  - devolucion
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from main import registrar_log


def _pick(row: Optional[dict], keys: tuple) -> Optional[dict]:
    if not row:
        return None
    out: Dict[str, Any] = {}
    for k in keys:
        if k in row and row.get(k) is not None:
            out[k] = row.get(k)
    return out or None


def snapshot_solicitud(sol: Optional[dict]) -> Optional[dict]:
    return _pick(sol, (
        "id", "consecutivo", "titulo", "estado", "observaciones",
        "enviada_at", "validada_at", "validada_by", "motivo_rechazo",
        "created_by", "items_count",
    ))


def snapshot_entrada_cabecera(ent: Optional[dict]) -> Optional[dict]:
    return _pick(ent, (
        "id", "numero_entrada", "codigo", "tipo", "numero_documento",
        "fecha_entrada", "pk_id", "tramo", "costado",
        "abscisa_inicial", "abscisa_final", "proveedor_id",
        "orden_compra_id", "observaciones", "placa", "transportador",
    ))


def snapshot_entrada_item(item: Optional[dict], cabecera: Optional[dict] = None) -> Optional[dict]:
    if not item and not cabecera:
        return None
    base = snapshot_entrada_cabecera(cabecera) or {}
    line = _pick(item, (
        "id", "entrada_id", "orden_compra_item_id", "presupuesto_id",
        "cantidad_recibida", "valor_recibido", "lote", "fecha_vencimiento",
        "material_descripcion", "unidad",
    )) or {}
    # Preferir id de línea como identidad del snapshot de ítem.
    out = {**base, **line}
    if line.get("id") is not None:
        out["entrada_item_id"] = line["id"]
    if cabecera and cabecera.get("id") is not None:
        out["entrada_id"] = cabecera.get("id")
    return out or None


def snapshot_salida(sal: Optional[dict]) -> Optional[dict]:
    return _pick(sal, (
        "id", "numero_salida", "codigo", "fecha_hora_salida",
        "pk_id", "tramo", "costado", "abscisa_inicial", "abscisa_final",
        "entrada_item_id", "cantidad_salida", "cantidad_devuelta", "cantidad_neta",
        "receptor_usuario_id", "observaciones", "material_descripcion", "numero_oc",
    ))


def snapshot_devolucion(dev: Optional[dict]) -> Optional[dict]:
    return _pick(dev, (
        "id", "numero_devolucion", "codigo", "salida_id", "entrada_item_id",
        "cantidad", "fecha_hora_devolucion", "pk_id", "costado",
        "abscisa_inicial", "abscisa_final", "receptor_usuario_id", "observaciones",
    ))


def insertar_log_almacen(
    usuario,
    accion: str,
    entidad_tipo: str,
    entidad_id,
    detalle: Optional[dict] = None,
    *,
    valor_anterior=None,
    valor_nuevo=None,
) -> bool:
    """Escribe el log y dice si quedó guardado. El guardado de la solicitud no debe esperar esto."""
    try:
        from main import _default_severidad, _json_for_log, _logs_insert_row
    except Exception:
        return False
    try:
        usuario = usuario or {}
        uid = usuario.get("sub") or usuario.get("id")
        uid_int = None
        if uid is not None and str(uid).strip() != "":
            try:
                uid_int = int(str(uid).strip())
            except (ValueError, TypeError):
                uid_int = None
        row = {
            "usuario_id": uid_int,
            "usuario_nombre": usuario.get("nombre") or usuario.get("email", ""),
            "cargo_nombre": usuario.get("cargo_nombre") or "",
            "rol_nombre": usuario.get("rol_nombre"),
            "contrato_id": usuario.get("contrato_id"),
            "contrato_numero": usuario.get("contrato_numero"),
            "accion": accion,
            "modulo": "ALMACEN",
            "entidad_tipo": entidad_tipo,
            "entidad_id": str(entidad_id) if entidad_id is not None else None,
            "detalle": _json_for_log(detalle) if detalle is not None else {},
            "resultado": "ok",
            "valor_anterior": _json_for_log(valor_anterior),
            "valor_nuevo": _json_for_log(valor_nuevo),
            "ip": None,
            "categoria": "auditoria",
            "severidad": _default_severidad(accion, "ALMACEN", "ok"),
            "endpoint": None,
            "metodo_http": None,
            "stack_trace": None,
            "duracion_ms": None,
            "alerta_generada": False,
        }
        return bool(_logs_insert_row(row))
    except Exception:
        return False


def log_almacen(
    usuario,
    accion: str,
    entidad_tipo: str,
    entidad_id,
    detalle: Optional[dict] = None,
    *,
    valor_anterior=None,
    valor_nuevo=None,
) -> None:
    """Envuelve registrar_log; nunca propaga fallos de auditoría."""
    det = dict(detalle or {})
    if entidad_tipo == "orden_compra":
        numero = det.get("numero_oc")
        if numero not in (None, "") and not det.get("registro"):
            det["registro"] = f"OC #{numero}"
    try:
        registrar_log(
            usuario,
            accion,
            "ALMACEN",
            entidad_tipo,
            entidad_id,
            det,
            valor_anterior=valor_anterior,
            valor_nuevo=valor_nuevo,
        )
    except Exception:
        pass
