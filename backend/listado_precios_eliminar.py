"""Reglas para eliminar un precio del listado solo si no está en uso.

Un ítem está en uso cuando hay cantidades de presupuesto (Presupuesto de Obra
u Obra Ejecutada, no dadas de baja) o cantidades cobradas (registros SICOE
aprobados en el nivel máximo, o filas de la tabla histórica ``cobro``).

El respaldo del precio eliminado no vive aquí: la ruta guarda la fila completa
en ``valor_anterior`` del log, igual que el resto de bajas auditadas.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from sicoe_valor_canonico import norm_capitulo, norm_item

USO_LISTA_TOPE = 200

_TIPOS_PRESUPUESTO = {
    "presupuesto de obra": "Presupuesto de Obra",
    "obra ejecutada": "Obra Ejecutada",
}

MENSAJE_EN_USO = (
    "No se puede eliminar este precio porque tiene cantidades en presupuesto "
    "o cantidades cobradas."
)


def _txt(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _dado_de_baja(row: dict) -> bool:
    value = row.get("dado_de_baja")
    if value is True or value == 1:
        return True
    if isinstance(value, str) and value.strip().lower() in ("true", "t", "1", "si", "sí"):
        return True
    return False


def _tipo_presupuesto(row: dict) -> Optional[str]:
    return _TIPOS_PRESUPUESTO.get(_txt(row.get("tipo_ejecucion")).lower())


def _coincide(precio: dict, row: dict, item_field: str) -> bool:
    """Mismo ítem (normalizado) y, si el precio los trae, capítulo y competencia."""
    item = norm_item(precio.get("item_numero"))
    if not item or norm_item(row.get(item_field)) != item:
        return False
    capitulo = norm_capitulo(precio.get("capitulo"))
    if capitulo and norm_capitulo(row.get("capitulo")) != capitulo:
        return False
    competencia = _txt(precio.get("competencia"))
    if competencia and _txt(row.get("competencia")) != competencia:
        return False
    return True


def _base(row: dict, *, origen: str, tipo: str, item: Any, cantidad: Any, unidad: Any) -> dict:
    return {
        "id": row.get("id"),
        "origen": origen,
        "tipo": tipo,
        "item": _txt(item),
        "capitulo": _txt(row.get("capitulo")),
        "competencia": _txt(row.get("competencia")),
        "descripcion": "",
        "pk": "",
        "id_pol": "",
        "numero_registro": "",
        "reporte_id": row.get("reporte_id"),
        "acta": "",
        "registro": "",
        "tramo": _txt(row.get("tramo")),
        "calzada": _txt(row.get("calzada")),
        "abs_inicio": row.get("abs_inicio"),
        "abs_final": row.get("abs_final"),
        "cantidad": cantidad,
        "unidad": _txt(unidad),
    }


def _pub_presupuesto(row: dict) -> dict:
    out = _base(
        row,
        origen="presupuesto",
        tipo=_tipo_presupuesto(row) or _txt(row.get("tipo_ejecucion")),
        item=row.get("item"),
        cantidad=row.get("cant_total"),
        unidad=row.get("und"),
    )
    out["descripcion"] = _txt(row.get("descripcion"))
    out["pk"] = _txt(row.get("pk_id"))
    out["id_pol"] = _txt(row.get("id_pol"))
    out["abs_inicio"] = row.get("abs_inicio")
    out["abs_final"] = row.get("abs_final")
    return out


def _pub_sicoe(row: dict) -> dict:
    out = _base(
        row,
        origen="sicoe",
        tipo="Cantidad cobrada",
        item=row.get("item_numero"),
        cantidad=row.get("cantidad_total"),
        unidad=row.get("unidad"),
    )
    out["descripcion"] = _txt(row.get("item_descripcion"))
    pk = _txt(row.get("_pk_label"))
    if not pk and row.get("pk_id_id") is not None:
        pk = _txt(row.get("pk_id_id"))
    out["pk"] = pk
    out["numero_registro"] = _txt(row.get("numero_registro"))
    out["reporte_id"] = row.get("reporte_id")
    acta = _txt(row.get("_acta_label"))
    if not acta and row.get("acta_rpo_id") is not None:
        acta = _txt(row.get("acta_rpo_id"))
    out["acta"] = acta
    return out


def _pub_cobro(row: dict) -> dict:
    out = _base(
        row,
        origen="cobro",
        tipo="Cobro",
        item=row.get("item"),
        cantidad=row.get("cantidad"),
        unidad=row.get("und"),
    )
    out["descripcion"] = _txt(row.get("descripcion"))
    out["pk"] = _txt(row.get("pk_id"))
    out["registro"] = _txt(row.get("registro"))
    acta = row.get("acta")
    out["acta"] = "" if acta is None else _txt(acta)
    out["abs_inicio"] = row.get("abs_inicial")
    out["abs_final"] = row.get("abs_final")
    return out


def clasificar_uso_precio(
    precio: dict,
    presupuesto_rows: Optional[List[dict]],
    sicoe_rows: Optional[List[dict]],
    cobro_rows: Optional[List[dict]],
    *,
    es_cobrado: Callable[[dict], bool],
) -> Dict[str, Any]:
    """Arma las dos listas que ve el popup. No elimina nada."""
    presupuesto: List[dict] = []
    cobrados: List[dict] = []
    for row in presupuesto_rows or []:
        if _dado_de_baja(row) or not _tipo_presupuesto(row):
            continue
        if not _coincide(precio, row, "item"):
            continue
        presupuesto.append(_pub_presupuesto(row))
    for row in sicoe_rows or []:
        if not _coincide(precio, row, "item_numero"):
            continue
        if not es_cobrado(row):
            continue
        cobrados.append(_pub_sicoe(row))
    for row in cobro_rows or []:
        if not _coincide(precio, row, "item"):
            continue
        cobrados.append(_pub_cobro(row))

    return {
        "puede_eliminar": not presupuesto and not cobrados,
        "presupuesto_total": len(presupuesto),
        "cobrados_total": len(cobrados),
        "presupuesto": presupuesto[:USO_LISTA_TOPE],
        "cobrados": cobrados[:USO_LISTA_TOPE],
        "presupuesto_truncado": len(presupuesto) > USO_LISTA_TOPE,
        "cobrados_truncado": len(cobrados) > USO_LISTA_TOPE,
    }
