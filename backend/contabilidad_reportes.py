"""
Reportes agregados — módulo Contabilidad (datos para gráficos y exportación Excel).
"""
from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from contabilidad_documentos_service import alertas_vencimiento_documentos
from contabilidad_service import (
    CAPITALIZACION_TASA,
    _d,
    _money,
    _parse_date,
    list_transacciones,
)

MESES_ES = (
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
)


def _label_mes(anio: int, mes: int) -> str:
    m = max(1, min(12, int(mes)))
    return f"{MESES_ES[m]} {int(anio)}"


def _label_mes_corto(anio: int, mes: int) -> str:
    return f"{int(anio):04d}-{int(mes):02d}"


def _periodos_entre(
    fecha_desde: Optional[str],
    fecha_hasta: Optional[str],
    *,
    anio: Optional[int] = None,
) -> Tuple[str, str, List[Tuple[int, int]]]:
    hoy = date.today()
    if anio is not None:
        a = int(anio)
        ini = f"{a:04d}-01-01"
        fin = f"{a:04d}-12-31"
        periodos = [(a, m) for m in range(1, 13)]
        return ini, fin, periodos

    fin_d = _parse_date(fecha_hasta) if fecha_hasta else hoy
    ini_d = _parse_date(fecha_desde) if fecha_desde else date(fin_d.year - 1, fin_d.month, 1)
    if ini_d > fin_d:
        ini_d, fin_d = fin_d, ini_d

    ini = ini_d.isoformat()
    fin = fin_d.isoformat()
    periodos: List[Tuple[int, int]] = []
    y, m = ini_d.year, ini_d.month
    while (y, m) <= (fin_d.year, fin_d.month):
        periodos.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return ini, fin, periodos


def reporte_evolucion_mensual(
    sb,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    anio: Optional[int] = None,
) -> dict:
    ini, fin, periodos = _periodos_entre(fecha_desde, fecha_hasta, anio=anio)
    res = list_transacciones(sb, fecha_desde=ini, fecha_hasta=fin, estado="activa", limit=5000)
    txs = res.get("items") or []

    bucket: Dict[Tuple[int, int], dict] = {}
    for y, m in periodos:
        bucket[(y, m)] = {
            "anio": y,
            "mes": m,
            "periodo": _label_mes_corto(y, m),
            "periodo_label": _label_mes(y, m),
            "ingresos_brutos": 0.0,
            "egresos_brutos": 0.0,
            "ingresos_neto": 0.0,
            "egresos_neto": 0.0,
            "utilidad_neta": 0.0,
            "transacciones": 0,
        }

    for tx in txs:
        f = _parse_date(tx.get("fecha"))
        key = (f.year, f.month)
        if key not in bucket:
            bucket[key] = {
                "anio": f.year,
                "mes": f.month,
                "periodo": _label_mes_corto(f.year, f.month),
                "periodo_label": _label_mes(f.year, f.month),
                "ingresos_brutos": 0.0,
                "egresos_brutos": 0.0,
                "ingresos_neto": 0.0,
                "egresos_neto": 0.0,
                "utilidad_neta": 0.0,
                "transacciones": 0,
            }
        row = bucket[key]
        bruto = float(_money(_d(tx.get("valor_bruto"))))
        neto = float(_money(_d(tx.get("valor_neto"))))
        tipo = (tx.get("tipo") or "").strip().lower()
        row["transacciones"] += 1
        if tipo == "ingreso":
            row["ingresos_brutos"] += bruto
            row["ingresos_neto"] += neto
        elif tipo == "egreso":
            row["egresos_brutos"] += bruto
            row["egresos_neto"] += neto

    series = []
    for key in sorted(bucket.keys()):
        row = bucket[key]
        row["utilidad_neta"] = float(
            _money(_d(row["ingresos_neto"]) - _d(row["egresos_neto"]))
        )
        series.append(row)

    return {
        "fecha_desde": ini,
        "fecha_hasta": fin,
        "series": series,
    }


def reporte_ingresos_centro_costo(
    sb,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    anio: Optional[int] = None,
) -> dict:
    ini, fin, _ = _periodos_entre(fecha_desde, fecha_hasta, anio=anio)
    res = list_transacciones(
        sb, fecha_desde=ini, fecha_hasta=fin, tipo="ingreso", estado="activa", limit=5000,
    )
    txs = res.get("items") or []

    agg: Dict[str, dict] = {}
    total = Decimal("0")
    for tx in txs:
        bruto = _d(tx.get("valor_bruto"))
        total += bruto
        if (tx.get("centro_costo_tipo") or "").strip().lower() == "contrato" and tx.get("contrato_id"):
            key = f"contrato:{tx['contrato_id']}"
            label = None
            c = tx.get("contrato") or {}
            if c:
                label = f"Contrato {c.get('numero') or tx['contrato_id']}"
            else:
                label = f"Contrato #{tx['contrato_id']}"
        else:
            key = "empresa"
            label = "Empresa general"
        if key not in agg:
            agg[key] = {
                "clave": key,
                "centro_costo_tipo": "contrato" if key.startswith("contrato:") else "empresa",
                "contrato_id": tx.get("contrato_id"),
                "label": label,
                "ingresos_brutos": 0.0,
                "transacciones": 0,
            }
        agg[key]["ingresos_brutos"] += float(_money(bruto))
        agg[key]["transacciones"] += 1

    items = sorted(agg.values(), key=lambda x: -x["ingresos_brutos"])
    for it in items:
        it["porcentaje"] = float(
            _money(_d(it["ingresos_brutos"]) / total * 100) if total else Decimal("0")
        )

    return {
        "fecha_desde": ini,
        "fecha_hasta": fin,
        "total_ingresos_brutos": float(_money(total)),
        "items": items,
    }


def reporte_cuentas_especiales_historico(
    sb,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    anio: Optional[int] = None,
) -> dict:
    ini, fin, periodos = _periodos_entre(fecha_desde, fecha_hasta, anio=anio)
    movs = (
        sb.table("contabilidad_cuenta_movimiento")
        .select("fecha, cuenta_tipo, subcuenta, monto")
        .gte("fecha", ini)
        .lte("fecha", fin)
        .order("fecha")
        .execute()
        .data
        or []
    )

    # Acumulado inicial (movimientos antes del rango)
    prev = (
        sb.table("contabilidad_cuenta_movimiento")
        .select("cuenta_tipo, subcuenta, monto")
        .lt("fecha", ini)
        .execute()
        .data
        or []
    )
    acum: Dict[str, Decimal] = {
        "operativa": Decimal("0"),
        "capitalizacion_lic": Decimal("0"),
        "capitalizacion_srv": Decimal("0"),
        "impuestos_iva_neto": Decimal("0"),
        "impuestos_retencion": Decimal("0"),
    }
    for r in prev:
        ct = (r.get("cuenta_tipo") or "").strip().lower()
        sc = (r.get("subcuenta") or "").strip().lower()
        m = _d(r.get("monto"))
        if ct == "operativa":
            acum["operativa"] += m
        elif ct == "capitalizacion":
            if sc == "licenciamiento":
                acum["capitalizacion_lic"] += m
            elif sc == "servicios":
                acum["capitalizacion_srv"] += m
        elif ct == "impuestos":
            if sc == "iva_recaudado":
                acum["impuestos_iva_neto"] += m
            elif sc == "iva_pagado":
                acum["impuestos_iva_neto"] -= m
            elif sc == "retencion_fuente":
                acum["impuestos_retencion"] += m

    bucket: Dict[Tuple[int, int], Dict[str, Decimal]] = {}
    for y, m in periodos:
        bucket[(y, m)] = dict(acum)

    movs_por_mes: Dict[Tuple[int, int], list] = defaultdict(list)
    for mv in movs:
        f = _parse_date(mv.get("fecha"))
        movs_por_mes[(f.year, f.month)].append(mv)

    running = dict(acum)
    series = []
    for key in sorted(set(list(bucket.keys()) + list(movs_por_mes.keys()))):
        y, m = key
        for mv in movs_por_mes.get(key, []):
            ct = (mv.get("cuenta_tipo") or "").strip().lower()
            sc = (mv.get("subcuenta") or "").strip().lower()
            amt = _d(mv.get("monto"))
            if ct == "operativa":
                running["operativa"] += amt
            elif ct == "capitalizacion":
                if sc == "licenciamiento":
                    running["capitalizacion_lic"] += amt
                elif sc == "servicios":
                    running["capitalizacion_srv"] += amt
            elif ct == "impuestos":
                if sc == "iva_recaudado":
                    running["impuestos_iva_neto"] += amt
                elif sc == "iva_pagado":
                    running["impuestos_iva_neto"] -= amt
                elif sc == "retencion_fuente":
                    running["impuestos_retencion"] += amt
        series.append({
            "anio": y,
            "mes": m,
            "periodo": _label_mes_corto(y, m),
            "periodo_label": _label_mes(y, m),
            "operativa": float(_money(running["operativa"])),
            "capitalizacion_lic": float(_money(running["capitalizacion_lic"])),
            "capitalizacion_srv": float(_money(running["capitalizacion_srv"])),
            "capitalizacion_total": float(
                _money(running["capitalizacion_lic"] + running["capitalizacion_srv"])
            ),
            "impuestos_iva_neto": float(_money(running["impuestos_iva_neto"])),
            "impuestos_retencion": float(_money(running["impuestos_retencion"])),
        })

    return {
        "fecha_desde": ini,
        "fecha_hasta": fin,
        "capitalizacion_tasa": float(CAPITALIZACION_TASA),
        "series": series,
    }


def reporte_deducciones_tributarias(
    sb,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    anio: Optional[int] = None,
) -> dict:
    ini, fin, periodos = _periodos_entre(fecha_desde, fecha_hasta, anio=anio)
    res = list_transacciones(sb, fecha_desde=ini, fecha_hasta=fin, estado="activa", limit=5000)
    txs = res.get("items") or []

    bucket: Dict[Tuple[int, int], dict] = {}
    for y, m in periodos:
        bucket[(y, m)] = {
            "anio": y,
            "mes": m,
            "periodo": _label_mes_corto(y, m),
            "periodo_label": _label_mes(y, m),
            "retencion_fuente": 0.0,
            "iva_recaudado": 0.0,
            "iva_pagado": 0.0,
            "iva_neto": 0.0,
            "total_deducciones": 0.0,
        }

    for tx in txs:
        f = _parse_date(tx.get("fecha"))
        key = (f.year, f.month)
        if key not in bucket:
            bucket[key] = {
                "anio": f.year,
                "mes": f.month,
                "periodo": _label_mes_corto(f.year, f.month),
                "periodo_label": _label_mes(f.year, f.month),
                "retencion_fuente": 0.0,
                "iva_recaudado": 0.0,
                "iva_pagado": 0.0,
                "iva_neto": 0.0,
                "total_deducciones": 0.0,
            }
        row = bucket[key]
        ret = float(_money(_d(tx.get("retencion_fuente_valor"))))
        iva = float(_money(_d(tx.get("iva_valor"))))
        sentido = (tx.get("iva_sentido") or "").strip().lower()
        row["retencion_fuente"] += ret
        if sentido == "recaudado":
            row["iva_recaudado"] += iva
        elif sentido == "pagado":
            row["iva_pagado"] += iva

    series = []
    for key in sorted(bucket.keys()):
        row = bucket[key]
        row["iva_neto"] = float(
            _money(_d(row["iva_recaudado"]) - _d(row["iva_pagado"]))
        )
        row["total_deducciones"] = float(
            _money(_d(row["retencion_fuente"]) + _d(row["iva_recaudado"]))
        )
        series.append(row)

    return {
        "fecha_desde": ini,
        "fecha_hasta": fin,
        "series": series,
    }


def reporte_resumen_dashboard(
    sb,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    anio: Optional[int] = None,
) -> dict:
    """Payload unificado para el panel de reportes del frontend."""
    return {
        "evolucion_mensual": reporte_evolucion_mensual(
            sb, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, anio=anio,
        ),
        "ingresos_centro_costo": reporte_ingresos_centro_costo(
            sb, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, anio=anio,
        ),
        "cuentas_especiales": reporte_cuentas_especiales_historico(
            sb, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, anio=anio,
        ),
        "deducciones_tributarias": reporte_deducciones_tributarias(
            sb, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, anio=anio,
        ),
        "alertas_documentos": alertas_vencimiento_documentos(sb),
    }


REPORTE_TIPOS = frozenset({
    "evolucion-mensual",
    "ingresos-centro-costo",
    "cuentas-especiales",
    "deducciones-tributarias",
    "resumen",
})


def obtener_reporte(sb, tipo: str, **kwargs) -> dict:
    t = (tipo or "").strip().lower()
    if t not in REPORTE_TIPOS:
        raise ValueError(f"Tipo de reporte inválido: {tipo}")
    if t == "evolucion-mensual":
        return reporte_evolucion_mensual(sb, **kwargs)
    if t == "ingresos-centro-costo":
        return reporte_ingresos_centro_costo(sb, **kwargs)
    if t == "cuentas-especiales":
        return reporte_cuentas_especiales_historico(sb, **kwargs)
    if t == "deducciones-tributarias":
        return reporte_deducciones_tributarias(sb, **kwargs)
    return reporte_resumen_dashboard(sb, **kwargs)


EXPORT_TIPOS = REPORTE_TIPOS | frozenset({"transacciones", "cierre", "completo"})
