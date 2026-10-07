"""
Versión del motor de cálculo — Planillas de Tubería.

- altura_v1: descuento Roca/Otros por altura promedio (pre PR #784).
- volumen_v1: descuento por volumen L×A×E sobre EXC|TRI|REL (desde #784).

Las planillas selladas se muestran con el cálculo congelado (calculo_snapshot).
Si falta el snapshot, se reconstruye en memoria con el motor correspondiente
sin escribir a base de datos.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

# Deploy / merge PR #784 — cambio altura → volumen.
CORTE_MOTOR_VOLUMEN_UTC = datetime(2026, 10, 5, 2, 25, 23, tzinfo=timezone.utc)

MOTOR_ALTURA_V1 = "altura_v1"
MOTOR_VOLUMEN_V1 = "volumen_v1"
MOTOR_VIGENTE = MOTOR_VOLUMEN_V1

META_MOTOR_KEY = "motor_calculo_version"


def _parse_dt(raw: Any) -> Optional[datetime]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        dt = raw
    else:
        s = str(raw).strip()
        if not s:
            return None
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def motor_desde_meta(planilla: Optional[dict]) -> Optional[str]:
    if not isinstance(planilla, dict):
        return None
    meta = planilla.get("meta_cabecera")
    if not isinstance(meta, dict):
        return None
    raw = str(meta.get(META_MOTOR_KEY) or "").strip()
    if raw in (MOTOR_ALTURA_V1, MOTOR_VOLUMEN_V1):
        return raw
    snap = planilla.get("calculo_snapshot")
    if isinstance(snap, dict):
        sv = str(snap.get("motor_calculo_version") or "").strip()
        if sv in (MOTOR_ALTURA_V1, MOTOR_VOLUMEN_V1):
            return sv
    return None


def resolver_motor_calculo(planilla: Optional[dict]) -> str:
    """
    Motor con el que se debe interpretar / reconstruir la planilla.
    Selladas anteriores al corte sin versión explícita → altura_v1.
    Abiertas / posteriores → volumen_v1 (vigente).
    """
    explicito = motor_desde_meta(planilla)
    if explicito:
        return explicito
    if planilla_tuberia_sellada(planilla):
        cierre = _parse_dt(
            (planilla or {}).get("cerrado_at")
            or (planilla or {}).get("validado_at")
        )
        if cierre is not None and cierre < CORTE_MOTOR_VOLUMEN_UTC:
            return MOTOR_ALTURA_V1
    return MOTOR_VOLUMEN_V1


def planilla_tuberia_sellada(planilla: Optional[dict]) -> bool:
    """Sellada = cerrada/validada o interventoría (N2) Aprobado."""
    if not isinstance(planilla, dict):
        return False
    est = str(planilla.get("estado") or "").lower()
    if est in ("cerrado", "validado"):
        return True
    return str(planilla.get("nivel2_estado") or "") == "Aprobado"


def snapshot_completo(calculo: Any) -> bool:
    """
    True si calculo_snapshot trae Resumen (cantidades) y Descuentos
    línea a línea (long/ancho/espesor/cantidad) más netos.
    """
    if not isinstance(calculo, dict) or not calculo:
        return False
    cantidades = calculo.get("cantidades")
    descuentos = calculo.get("descuentos")
    netos = calculo.get("netos")
    if not isinstance(cantidades, list) or not isinstance(netos, list):
        return False
    if not isinstance(descuentos, list):
        return False
    if not netos:
        # Plantilla vacía sellada es anómala; exigir al menos netos.
        return False
    # Al menos una línea de cantidades con dims o cantidad.
    ok_cant = False
    for c in cantidades:
        if not isinstance(c, dict):
            continue
        if c.get("codigo"):
            ok_cant = True
            break
    if not ok_cant:
        return False
    # Netos con codigo + neto/bruto
    for n in netos:
        if isinstance(n, dict) and n.get("codigo"):
            return True
    return False


def stamp_motor_en_calculo(calculo: dict, motor: str) -> dict:
    out = dict(calculo or {})
    out["motor_calculo_version"] = motor
    return out


def merge_motor_en_meta(meta: Any, motor: str) -> dict:
    base = dict(meta) if isinstance(meta, dict) else {}
    base[META_MOTOR_KEY] = motor
    return base


def cantidades_comparables(calculo: Optional[dict]) -> list[dict[str, Any]]:
    """Líneas de Resumen (netos) + descuentos específicos + detalle altura/volumen."""
    if not isinstance(calculo, dict):
        return []
    out: list[dict[str, Any]] = []
    for n in calculo.get("netos") or []:
        if not isinstance(n, dict) or not n.get("codigo"):
            continue
        cant = n.get("neto")
        if cant is None:
            cant = n.get("cantidad")
        if cant is None:
            cant = n.get("bruto")
        out.append({
            "origen": "cantidades",
            "codigo": str(n.get("codigo")),
            "nombre": n.get("nombre"),
            "cantidad": cant,
            "long": n.get("long"),
            "ancho": n.get("ancho"),
            "espesor": n.get("espesor"),
            "unidad": n.get("unidad"),
        })
    for d in calculo.get("descuentos") or []:
        if not isinstance(d, dict) or not d.get("codigo"):
            continue
        out.append({
            "origen": "descuentos",
            "codigo": str(d.get("codigo")),
            "nombre": d.get("nombre"),
            "cantidad": d.get("cantidad"),
            "long": d.get("long"),
            "ancho": d.get("ancho"),
            "espesor": d.get("espesor"),
            "unidad": d.get("unidad") or "m³",
        })
    detalle = (
        calculo.get("descuentos_volumen_detalle")
        or calculo.get("descuentos_altura_detalle")
        or []
    )
    for d in detalle:
        if not isinstance(d, dict) or not d.get("codigo"):
            continue
        out.append({
            "origen": "descuentos",
            "codigo": str(d.get("codigo")),
            "nombre": d.get("nombre"),
            "cantidad": d.get("cantidad"),
            "long": d.get("long"),
            "ancho": d.get("ancho"),
            "espesor": d.get("espesor"),
            "unidad": d.get("unidad") or "m³",
        })
    return out


def calculo_coincide_con_snapshot(mostrado: Any, snapshot: Any, *, eps: float = 0.015) -> bool:
    """
    True si el cálculo mostrado coincide con el snapshot en códigos y cantidades.
    Usado por tests de blindaje ante cambios de fórmula.
    """
    if not snapshot_completo(snapshot):
        return False
    if not isinstance(mostrado, dict):
        return False
    a = {f"{x['origen']}:{x['codigo']}": x for x in cantidades_comparables(mostrado)}
    b = {f"{x['origen']}:{x['codigo']}": x for x in cantidades_comparables(snapshot)}
    if set(a) != set(b):
        # Permitir alias DESC_ALT_* ↔ DESC_VOL_* solo si cantidades iguales — no:
        # sellada debe ser idéntica al snapshot, mismos códigos.
        return False
    for key, row_b in b.items():
        row_a = a.get(key)
        if not row_a:
            return False
        try:
            va = float(row_a.get("cantidad") if row_a.get("cantidad") is not None else 0)
            vb = float(row_b.get("cantidad") if row_b.get("cantidad") is not None else 0)
        except (TypeError, ValueError):
            return False
        if abs(va - vb) > eps:
            return False
    return True
