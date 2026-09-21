"""Bridge Planilla de Tubería → so_reportes / so_registros (SICOE Obra).

No altera el motor de cálculo ni la lógica core de SICOE: solo arma cabecera +
líneas «Sin Asignar Ítem» a partir del resumen de cantidades/descuentos.
"""
from __future__ import annotations

from typing import Any, Optional

PLANILLA_ORIGEN_MARKER_PREFIX = "claracore:planilla-tuberia:"


def marker_origen_planilla(planilla_id: str) -> str:
    return f"{PLANILLA_ORIGEN_MARKER_PREFIX}{planilla_id}"


def planilla_id_desde_enlace_soporte(enlace_soporte: Any) -> Optional[str]:
    """Extrae el UUID de planilla embebido en enlace_soporte (lista JSON o str)."""
    raw_items: list[str] = []
    if enlace_soporte is None or enlace_soporte == "":
        return None
    if isinstance(enlace_soporte, list):
        raw_items = [str(x) for x in enlace_soporte]
    elif isinstance(enlace_soporte, str):
        s = enlace_soporte.strip()
        if s.startswith("["):
            try:
                import json
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    raw_items = [str(x) for x in parsed]
                else:
                    raw_items = [s]
            except Exception:
                raw_items = [s]
        else:
            raw_items = [s]
    for it in raw_items:
        if it.startswith(PLANILLA_ORIGEN_MARKER_PREFIX):
            pid = it[len(PLANILLA_ORIGEN_MARKER_PREFIX) :].strip()
            if pid:
                return pid
    return None


def abscisas_minmax_cartera(filas_campo: list[dict]) -> tuple[Optional[float], Optional[float]]:
    vals: list[float] = []
    for f in filas_campo or []:
        raw = f.get("abscisa")
        if raw is None or raw == "":
            continue
        try:
            vals.append(float(raw))
        except (TypeError, ValueError):
            continue
    if not vals:
        return None, None
    return min(vals), max(vals)


def _f(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def lineas_registros_desde_calculo(calculo: dict) -> list[dict]:
    """Una línea so_registros por neto/descuento con cantidad ≠ 0; sin item_numero."""
    out: list[dict] = []
    for n in (calculo or {}).get("netos") or []:
        cant = _f(n.get("neto"))
        if cant is None or abs(cant) < 1e-9:
            continue
        nombre = str(n.get("nombre") or n.get("codigo") or "Cantidad").strip()
        out.append({
            "nombre": nombre,
            "descripcion": nombre,
            "observacion": nombre,
            "longitud": _f(n.get("long")),
            "ancho": _f(n.get("ancho")),
            "espesor": _f(n.get("espesor")),
            "cantidad": round(cant, 4),
            "cantidad_total": round(cant, 4),
            "unidad": n.get("unidad") or None,
            "origen_codigo": n.get("codigo"),
            "origen_grupo": "cantidades",
        })
    for d in (calculo or {}).get("descuentos") or []:
        if not d.get("nombre"):
            continue
        cant = _f(d.get("cantidad"))
        if cant is None or abs(cant) < 1e-9:
            continue
        nombre = str(d.get("nombre")).strip()
        label = f"Descuento · {nombre}"
        out.append({
            "nombre": label,
            "descripcion": label,
            "observacion": label,
            "longitud": _f(d.get("long")),
            "ancho": _f(d.get("ancho")),
            "espesor": _f(d.get("espesor")),
            "cantidad": round(cant, 4),
            "cantidad_total": round(cant, 4),
            "unidad": d.get("unidad") or None,
            "origen_codigo": d.get("codigo"),
            "origen_grupo": "descuentos",
        })
    return out
