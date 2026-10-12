"""
Calificación automática de tareas asignadas y compromisos.

ÚNICO LUGAR DE AJUSTE DE PORCENTAJES: CALIFICACION_CONFIG.
Cambiar aquí no requiere tocar el resto del flujo.

Reglas:
- Solo se califican ítems asignados a otra persona (no tareas personales).
- Cancelado: no califica ni entra en promedios.
- Abierto / en_progreso / reprogramado (aún abiertos): no puntúan hasta cerrar o vencer.
- Nota final = min(resultado, tope_fecha).
- Excepción por tercero aprobada → tope_fecha = 100.
- No se recalifica lo ya cerrado (calificacion_en presente).
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional

# ═══════════════════════════════════════════════════════════════════════════
# AJUSTE DE PORCENTAJES — editar solo este bloque
# ═══════════════════════════════════════════════════════════════════════════
CALIFICACION_CONFIG: Dict[str, Any] = {
    "resultado": {
        "cumplido": 100.0,
        "parcial": 60.0,
        "vencido": 0.0,
        # cancelado → None (excluido)
    },
    "tope_fecha": {
        "a_tiempo": 100.0,
        "reprogramada_antes_de_vencer": 80.0,
        "despues_de_vencida_o_reprog_tarde": 60.0,
    },
    "excepcion_tercero_tope": 100.0,
}
# ═══════════════════════════════════════════════════════════════════════════


ESTADOS_CERRADOS_CALIFICABLES = frozenset({"cumplido", "parcial", "vencido"})
ESTADOS_EXCLUIDOS = frozenset({"cancelado"})
ESTADOS_ABIERTOS = frozenset({"abierto", "en_progreso", "reprogramado"})


def get_calificacion_config() -> dict:
    """Copia segura del config (API / UI de ajuste)."""
    cfg = CALIFICACION_CONFIG
    return {
        "resultado": dict(cfg["resultado"]),
        "tope_fecha": dict(cfg["tope_fecha"]),
        "excepcion_tercero_tope": float(cfg["excepcion_tercero_tope"]),
    }


def es_tarea_personal(item: dict) -> bool:
    """Personal = origen tarea, sin asignación formal a otro, sin padre o con creador=asignado."""
    if (item.get("origen") or "") != "tarea":
        return False
    relacion = (item.get("relacion_destinatario") or "").strip().lower()
    if relacion == "asignacion":
        return False
    if relacion == "referencia":
        # Referencia: el creador sigue siendo responsable → personal del creador
        return True
    try:
        creator = int(item.get("created_by") or 0)
        assignee = int(item.get("asignado_a_id") or 0)
    except (TypeError, ValueError):
        return True
    if not assignee or not creator:
        return True
    return creator == assignee


def es_calificable(item: dict) -> bool:
    """True si el ítem puede recibir nota (asignado a otro; no cancelado)."""
    if not item:
        return False
    origen = (item.get("origen") or "").strip().lower()
    if origen not in ("tarea", "compromiso"):
        return False
    estado = (item.get("estado_gestion") or "").strip().lower()
    if estado in ESTADOS_EXCLUIDOS:
        return False
    if origen == "tarea" and es_tarea_personal(item):
        return False
    # Compromiso: siempre es asignación a alguien (puede ser el mismo elaborador;
    # se califica si hay responsable distinto del elaborador/solicitante cuando exista).
    if origen == "compromiso":
        try:
            asignado = int(item.get("asignado_a_id") or 0)
            solicitante = int(item.get("solicitante_id") or item.get("created_by") or 0)
        except (TypeError, ValueError):
            return bool(item.get("asignado_a_id"))
        if not asignado:
            return False
        # Si el elaborador se autoasignó, no califica (equivalente a personal).
        if solicitante and asignado == solicitante:
            return False
        return True
    return True


def _parse_date(raw) -> Optional[date]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw)[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def clasificar_tope_fecha(
    item: dict,
    *,
    excepcion_aprobada: bool = False,
) -> tuple[float, str]:
    """
    Devuelve (tope_pct, codigo).

    Equivalencia compromisos:
    - «a_tiempo»: cumplido sin vencido_at y sin reprogramación tardía.
    - «reprogramada_antes_de_vencer»: se_reprogramo y no se_reprogramo_tras_vencer
      (cambio de fecha / justificación aprobada antes de gracia).
    - «despues_de_vencida_o_reprog_tarde»: vencido_at presente, o cumplido tras
      fecha_vencimiento, o se_reprogramo_tras_vencer (reprog después de gracia).
    """
    cfg = CALIFICACION_CONFIG["tope_fecha"]
    if excepcion_aprobada:
        return float(CALIFICACION_CONFIG["excepcion_tercero_tope"]), "excepcion_tercero"

    estado = (item.get("estado_gestion") or "").strip().lower()
    se_reprog = bool(item.get("se_reprogramo"))
    se_reprog_tarde = bool(item.get("se_reprogramo_tras_vencer"))
    vencido_at = item.get("vencido_at")

    if se_reprog_tarde or (vencido_at and estado in ("cumplido", "parcial", "vencido")):
        return float(cfg["despues_de_vencida_o_reprog_tarde"]), "despues_de_vencida_o_reprog_tarde"

    if estado == "vencido":
        return float(cfg["despues_de_vencida_o_reprog_tarde"]), "despues_de_vencida_o_reprog_tarde"

    # Cumplido/parcial: ¿después de la fecha de vencimiento?
    fv = _parse_date(item.get("fecha_vencimiento"))
    if estado in ("cumplido", "parcial") and fv:
        cierre = None
        if item.get("calificacion_en"):
            cierre = _parse_date(item.get("calificacion_en"))
        if cierre is None and item.get("updated_at"):
            cierre = _parse_date(item.get("updated_at"))
        if cierre and cierre > fv:
            return float(cfg["despues_de_vencida_o_reprog_tarde"]), "despues_de_vencida_o_reprog_tarde"

    if se_reprog and not se_reprog_tarde:
        return float(cfg["reprogramada_antes_de_vencer"]), "reprogramada_antes_de_vencer"

    return float(cfg["a_tiempo"]), "a_tiempo"


def resultado_pct(estado: str) -> Optional[float]:
    e = (estado or "").strip().lower()
    if e in ESTADOS_EXCLUIDOS:
        return None
    if e in ESTADOS_ABIERTOS:
        return None
    res = CALIFICACION_CONFIG["resultado"]
    if e in res:
        return float(res[e])
    return None


def calcular_nota(
    item: dict,
    *,
    excepcion_aprobada: bool = False,
) -> Optional[dict]:
    """
    Calcula la nota. Retorna None si no aplica (personal, cancelado, aún abierta).
    No escribe en BD.
    """
    if not es_calificable(item):
        return None
    estado = (item.get("estado_gestion") or "").strip().lower()
    res = resultado_pct(estado)
    if res is None:
        return None
    tope, tope_codigo = clasificar_tope_fecha(item, excepcion_aprobada=excepcion_aprobada)
    nota = min(res, tope)
    return {
        "nota": round(nota, 2),
        "resultado_pct": round(res, 2),
        "tope_fecha_pct": round(tope, 2),
        "tope_codigo": tope_codigo,
        "estado": estado,
        "excepcion_tercero": bool(excepcion_aprobada),
    }


def promedio(notas: list) -> Optional[float]:
    vals = [float(n) for n in (notas or []) if n is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 2)
