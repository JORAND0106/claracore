"""Informe semanal consolidado de validación (matriz día a día + curvas de desviación)."""

from __future__ import annotations

import html
from datetime import date, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from notificaciones_email_resumen import (
    MATRIZ_TABLAS,
    RIESGO_ESTADOS,
    _aprobado_nivel,
    _encabezado_nivel,
    _format_cop,
    _matriz_valor,
    _suma_riesgo,
)

_DIAS = (
    ("lun", "Lunes"),
    ("mar", "Martes"),
    ("mie", "Miércoles"),
    ("jue", "Jueves"),
    ("vie", "Viernes"),
    ("sab", "Sábado"),
    ("dom", "Domingo"),
)

_TH = (
    "text-align:left;padding:6px 8px;border:1px solid #cbd5e1;"
    "background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#475569;"
)
_TH_C = _TH.replace("left", "center")
_TD = "padding:6px 8px;border:1px solid #cbd5e1;font-size:12px;"
_TD_C = _TD + "text-align:center;white-space:nowrap;"
_TD_R = _TD + "text-align:right;white-space:nowrap;"


def semana_anterior_lunes_domingo(ref: date) -> Tuple[date, date]:
    """
    Semana Mon–Sun anterior a `ref`.
    Si ref es lunes, reporta la semana que terminó el domingo anterior.
    """
    # weekday: Mon=0 … Sun=6
    lunes_actual = ref - timedelta(days=ref.weekday())
    domingo_ant = lunes_actual - timedelta(days=1)
    lunes_ant = domingo_ant - timedelta(days=6)
    return lunes_ant, domingo_ant


def fechas_semana(lunes: date) -> List[date]:
    return [lunes + timedelta(days=i) for i in range(7)]


def _fmt_fecha(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def titulo_semana(lunes: date, domingo: date) -> str:
    return f"Semana {_fmt_fecha(lunes)} - {_fmt_fecha(domingo)}"


def build_semana_snapshots(
    snapshots_by_fecha_periodo: Dict[Tuple[str, str], dict],
    lunes: date,
) -> dict:
    """
    Estructura:
      {
        "acumulado_anterior": {apertura/cierre matriz…} | None,
        "dias": [
          {"key","label","fecha","apertura","cierre"},
          ...
        ]
      }
    Acumulado anterior = apertura del lunes (estado al iniciar la semana),
    o cierre del domingo previo si no hay apertura.
    """
    dias = []
    for i, (key, label) in enumerate(_DIAS):
        f = lunes + timedelta(days=i)
        fs = f.isoformat()
        apert = snapshots_by_fecha_periodo.get((fs, "apertura"))
        cierre = snapshots_by_fecha_periodo.get((fs, "cierre"))
        dias.append(
            {
                "key": key,
                "label": label,
                "fecha": fs,
                "apertura": apert,
                "cierre": cierre,
            }
        )

    acum = None
    if dias and dias[0].get("apertura"):
        acum = dias[0]["apertura"]
    else:
        prev_dom = (lunes - timedelta(days=1)).isoformat()
        acum = snapshots_by_fecha_periodo.get((prev_dom, "cierre"))

    return {"acumulado_anterior": acum, "dias": dias}


def _matriz_de(snap: Optional[dict]) -> dict:
    if not snap or not isinstance(snap, dict):
        return {}
    m = snap.get("matriz")
    return m if isinstance(m, dict) else {}


def _kpi_dia(snap_a: Optional[dict], snap_c: Optional[dict], niveles: Sequence[int]) -> dict:
    ma = _matriz_de(snap_a)
    mc = _matriz_de(snap_c) or ma
    aprobado_ini = sum(_aprobado_nivel(ma, n) for n in niveles) if ma else None
    aprobado_fin = sum(_aprobado_nivel(mc, n) for n in niveles) if mc else None
    pendiente_ini = _suma_riesgo(ma, niveles) if ma else None
    pendiente_fin = _suma_riesgo(mc, niveles) if mc else None
    validado = None
    if aprobado_ini is not None and aprobado_fin is not None:
        validado = aprobado_fin - aprobado_ini
    desviacion = None
    if validado is not None and pendiente_ini is not None:
        desviacion = validado - pendiente_ini
    return {
        "aprobado_ini": aprobado_ini,
        "aprobado_fin": aprobado_fin,
        "pendiente_ini": pendiente_ini,
        "pendiente_fin": pendiente_fin,
        "validado": validado,
        "desviacion": desviacion,
    }


def _niveles_de_semana(semana: dict) -> List[int]:
    na: List[int] = []
    snaps = []
    if semana.get("acumulado_anterior"):
        snaps.append(semana["acumulado_anterior"])
    for d in semana.get("dias") or []:
        if d.get("apertura"):
            snaps.append(d["apertura"])
        if d.get("cierre"):
            snaps.append(d["cierre"])
    for s in snaps:
        m = _matriz_de(s)
        for x in m.get("niveles_activos") or []:
            try:
                n = int(x)
            except (TypeError, ValueError):
                continue
            if 1 <= n <= 6 and n not in na:
                na.append(n)
    return sorted(na) or [1, 2, 3]


def _cell_kpi_html(kpi: dict) -> str:
    if kpi.get("aprobado_ini") is None and kpi.get("aprobado_fin") is None:
        return f'<td style="{_TD_C};color:#94a3b8;">—</td>'
    ai = kpi.get("aprobado_ini")
    af = kpi.get("aprobado_fin")
    pi = kpi.get("pendiente_ini")
    pf = kpi.get("pendiente_fin")
    parts = []
    if ai is not None or af is not None:
        parts.append(
            f"<div><strong>Aprob.</strong><br/>"
            f"{html.escape(_format_cop(ai or 0))} → {html.escape(_format_cop(af or 0))}</div>"
        )
    if pi is not None or pf is not None:
        parts.append(
            f"<div style='margin-top:4px;'><strong>Pend.</strong><br/>"
            f"{html.escape(_format_cop(pi or 0))} → {html.escape(_format_cop(pf or 0))}</div>"
        )
    return f'<td style="{_TD_C}">{"".join(parts)}</td>'


def build_matriz_semanal_html(semana: dict) -> str:
    """Tabla Acumulado anterior | Lun…Dom con apertura→cierre por día."""
    niveles = _niveles_de_semana(semana)
    dias = semana.get("dias") or []
    acum = semana.get("acumulado_anterior")
    acum_kpi = _kpi_dia(acum, acum, niveles)

    parts = [
        '<div style="margin:16px 0;">',
        '<p style="margin:0 0 8px;font-size:13px;color:#475569;">'
        "Cada columna muestra cómo <strong>inició</strong> y cómo <strong>cerró</strong> "
        "la plataforma ese día (Aprobado y Pendientes de riesgo), con el mismo criterio "
        "de los antiguos informes de apertura/cierre.</p>",
        '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">',
        "<thead><tr>",
        f'<th style="{_TH}">Métrica</th>',
        f'<th style="{_TH_C}">Acumulado anterior</th>',
    ]
    for d in dias:
        label = d.get("label") or ""
        fshort = (d.get("fecha") or "")[5:]  # MM-DD
        parts.append(f'<th style="{_TH_C}">{html.escape(label)}<br/><span style="font-weight:400;">{html.escape(fshort)}</span></th>')
    parts.append("</tr></thead><tbody>")

    # Fila resumen
    parts.append("<tr>")
    parts.append(f'<td style="{_TD}font-weight:700;">Apertura → Cierre</td>')
    parts.append(_cell_kpi_html(acum_kpi))
    for d in dias:
        parts.append(_cell_kpi_html(_kpi_dia(d.get("apertura"), d.get("cierre"), niveles)))
    parts.append("</tr>")

    # Filas por nivel: desviación
    niveles_info = {"niveles": []}
    for snap in [acum] + [d.get("cierre") or d.get("apertura") for d in dias]:
        m = _matriz_de(snap)
        if m.get("niveles"):
            niveles_info["niveles"] = m["niveles"]
            break

    for n in niveles:
        parts.append("<tr>")
        enc = _encabezado_nivel(niveles_info, n)
        parts.append(f'<td style="{_TD}">Desv. {html.escape(enc)}</td>')
        # acumulado: sin validado del día
        parts.append(f'<td style="{_TD_C};color:#94a3b8;">—</td>')
        for d in dias:
            kpi = _kpi_dia_nivel(d.get("apertura"), d.get("cierre"), n)
            desv = kpi.get("desviacion")
            if desv is None:
                parts.append(f'<td style="{_TD_C};color:#94a3b8;">—</td>')
            else:
                color = "#16a34a" if desv >= 0 else "#dc2626"
                parts.append(
                    f'<td style="{_TD_R}color:{color};font-weight:700;">'
                    f"{html.escape(_format_cop(desv))}</td>"
                )
        parts.append("</tr>")

    parts.append("</tbody></table></div>")
    return "".join(parts)


def _kpi_dia_nivel(snap_a: Optional[dict], snap_c: Optional[dict], nivel: int) -> dict:
    ma = _matriz_de(snap_a)
    mc = _matriz_de(snap_c) or ma
    if not ma and not mc:
        return {"desviacion": None, "validado": None, "pendiente_ini": None}
    aprobado_ini = _aprobado_nivel(ma, nivel) if ma else 0.0
    aprobado_fin = _aprobado_nivel(mc, nivel) if mc else aprobado_ini
    pendiente_ini = 0.0
    if ma:
        for fila in RIESGO_ESTADOS:
            for table_key, _ in MATRIZ_TABLAS:
                pendiente_ini += _matriz_valor(ma.get(table_key) or {}, fila, nivel)
    validado = aprobado_fin - aprobado_ini
    return {
        "validado": validado,
        "pendiente_ini": pendiente_ini,
        "desviacion": validado - pendiente_ini,
    }


def _desviaciones_por_nivel(semana: dict, nivel: int) -> List[Optional[float]]:
    out: List[Optional[float]] = []
    for d in semana.get("dias") or []:
        kpi = _kpi_dia_nivel(d.get("apertura"), d.get("cierre"), nivel)
        out.append(kpi.get("desviacion"))
    return out


def build_curva_desviacion_svg(
    valores: Sequence[Optional[float]],
    titulo: str,
    width: int = 520,
    height: int = 160,
) -> str:
    """SVG inline (email-safe) de la curva de desviación Lun→Dom."""
    pad_l, pad_r, pad_t, pad_b = 40, 16, 24, 28
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    nums = [float(v) for v in valores if v is not None]
    if not nums:
        return (
            f'<div style="margin:12px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;">'
            f'<p style="margin:0;font-weight:700;font-size:13px;">{html.escape(titulo)}</p>'
            f'<p style="margin:8px 0 0;color:#94a3b8;font-size:12px;">Sin datos suficientes en la semana.</p>'
            f"</div>"
        )
    lo = min(nums + [0.0])
    hi = max(nums + [0.0])
    span = hi - lo or 1.0
    n = max(len(valores), 1)

    def xy(i: int, v: float) -> Tuple[float, float]:
        x = pad_l + (plot_w * i / max(n - 1, 1))
        y = pad_t + plot_h * (1 - (v - lo) / span)
        return x, y

    # zero line
    zero_y = pad_t + plot_h * (1 - (0 - lo) / span)
    pts = []
    circles = []
    for i, v in enumerate(valores):
        if v is None:
            continue
        x, y = xy(i, float(v))
        pts.append(f"{x:.1f},{y:.1f}")
        color = "#16a34a" if v >= 0 else "#dc2626"
        circles.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{color}" />'
        )

    poly = (
        f'<polyline fill="none" stroke="#2563eb" stroke-width="2" points="{" ".join(pts)}" />'
        if len(pts) >= 2
        else ""
    )
    labels = []
    for i, (_, lab) in enumerate(_DIAS):
        x = pad_l + (plot_w * i / max(n - 1, 1))
        labels.append(
            f'<text x="{x:.1f}" y="{height - 8}" text-anchor="middle" '
            f'font-size="10" fill="#64748b">{html.escape(lab[:3])}</text>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(titulo)}">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'<text x="{pad_l}" y="16" font-size="12" font-weight="700" fill="#0f172a">'
        f"{html.escape(titulo)}</text>"
        f'<line x1="{pad_l}" y1="{zero_y:.1f}" x2="{width - pad_r}" y2="{zero_y:.1f}" '
        f'stroke="#cbd5e1" stroke-dasharray="4 3"/>'
        f"{poly}{''.join(circles)}{''.join(labels)}"
        f'<text x="4" y="{zero_y + 4:.1f}" font-size="9" fill="#94a3b8">0</text>'
        f"</svg>"
    )
    return f'<div style="margin:12px 0;">{svg}</div>'


def build_curvas_desviacion_html(semana: dict) -> str:
    niveles = _niveles_de_semana(semana)
    niveles_info = {"niveles": []}
    for d in semana.get("dias") or []:
        m = _matriz_de(d.get("cierre") or d.get("apertura"))
        if m.get("niveles"):
            niveles_info["niveles"] = m["niveles"]
            break
    chunks = [
        '<div style="margin:20px 0;">',
        '<h2 style="font-size:16px;margin:0 0 8px;">Curvas de desviación por rol</h2>',
        '<p style="margin:0 0 12px;font-size:13px;color:#475569;">'
        "Desviación = cantidad validada en el día − pendiente al inicio del día. "
        "Valores positivos indican puesta al día; negativos, atraso.</p>",
    ]
    for n in niveles:
        enc = _encabezado_nivel(niveles_info, n)
        vals = _desviaciones_por_nivel(semana, n)
        chunks.append(build_curva_desviacion_svg(vals, f"N{n} · {enc}"))
    chunks.append("</div>")
    return "".join(chunks)


def build_informe_semanal_contenido(
    nombre: str,
    contrato_num: str,
    lunes: date,
    domingo: date,
    semana: dict,
) -> Tuple[str, str, str, str]:
    """
    Retorna (subject, text, title_html, body_html_inner) del informe semanal.
    El wrapping SMTP lo aplica notificaciones_email_mail.
    """
    titulo = titulo_semana(lunes, domingo)
    subject = f"ClaraCore — Informe semanal de validación · {contrato_num} · {titulo}"
    matriz_html = build_matriz_semanal_html(semana)
    curvas_html = build_curvas_desviacion_html(semana)
    acta = None
    for d in semana.get("dias") or []:
        m = _matriz_de(d.get("cierre") or d.get("apertura"))
        if m.get("acta_rpo") is not None:
            acta = m.get("acta_rpo")
            break
    acta_txt = str(acta) if acta is not None else "—"

    text = (
        f"Hola {nombre},\n\n"
        f"Informe semanal de validación · Contrato {contrato_num}\n"
        f"{titulo}\n"
        f"Acta RPO #{acta_txt}\n\n"
        f"Consulte el HTML del correo para la matriz día a día y las curvas de desviación.\n"
    )
    title_html = f"Informe semanal · {contrato_num}"
    body_inner = (
        f"<p>Hola <strong>{html.escape(nombre)}</strong>,</p>"
        f"<p>Contrato <strong>{html.escape(contrato_num)}</strong> · "
        f"Acta RPO <strong>#{html.escape(acta_txt)}</strong></p>"
        f'<h1 style="font-size:18px;margin:20px 0 8px;">{html.escape(titulo)}</h1>'
        f'<h2 style="font-size:16px;margin:24px 0 8px;">Matriz semanal · apertura / cierre</h2>'
        f"{matriz_html}"
        f"{curvas_html}"
    )
    return subject, text, title_html, body_inner
