"""Contenido HTML del correo de resumen inicio/fin de jornada (matriz, riesgo, Ppto vs Cobro)."""

from __future__ import annotations

import html
from typing import Any, Dict, List, Optional, Sequence, Tuple

MATRIZ_TABLAS = (
    ("obra_ejecutada_directo_sin_aiu", "Obra ejecutada directo sin AIU"),
    ("ensayos_sondeos_directo_sin_iva", "Ensayos y sondeos directo sin IVA"),
)

MATRIZ_FILAS = (
    ("aprobado", "APROBADO", "#DCFCE7", False, False),
    ("pendiente", "PENDIENTES", "#FEF9C3", False, False),
    ("pendiente_item", "PENDIENTE N", "#DBEAFE", False, True),
    ("no_revisado", "NO REVISADOS", "#E9D5FF", False, False),
    ("rechazado", "RECHAZADOS", "#FECACA", False, False),
    ("habilitado", "HABILITADO VALIDACIÓN", "#374151", True, False),
    ("otras_actas", "PENDIENTES OTRAS ACTAS", "#FEF9C3", False, False),
)

RIESGO_ESTADOS = ("pendiente", "pendiente_item", "no_revisado", "rechazado")

_TH = (
    "text-align:left;padding:6px 8px;border:1px solid #cbd5e1;"
    "background:#f1f5f9;font-size:12px;text-transform:uppercase;color:#475569;"
)
_TH_R = _TH.replace("left", "right")
_TD = "padding:6px 8px;border:1px solid #cbd5e1;font-size:13px;"
_TD_R = _TD + "text-align:right;white-space:nowrap;"


def _format_cop(n: float) -> str:
    try:
        return f"${int(round(float(n))):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "$0"


def _matriz_valor(bloque: dict, fila: str, nivel: int) -> float:
    row = bloque.get(fila) if isinstance(bloque, dict) else None
    if not isinstance(row, dict):
        return 0.0
    col = f"nivel{nivel}"
    if row.get(col) is not None:
        return float(row.get(col) or 0)
    legacy = {1: "inspector", 2: "residente", 3: "interventoria"}
    leg = legacy.get(nivel, "interventoria")
    return float(row.get(leg) or 0)


def _encabezado_nivel(niveles_info: dict, n: int) -> str:
    for row in niveles_info.get("niveles") or []:
        if int(row.get("nivel") or 0) == n:
            base = (row.get("encabezado") or "").strip() or f"Nivel {n}"
            if f"(N{n})" in base or f"N{n}" in base:
                return base
            return f"{base} (N{n})"
    return f"Nivel {n}"


def _merge_matriz_bloque(bloque: Optional[dict], cols: Sequence[int]) -> dict:
    empty = lambda: {f"nivel{n}": 0.0 for n in cols}
    out = {k: empty() for k, *_ in MATRIZ_FILAS}
    if not isinstance(bloque, dict):
        return out
    for k in out:
        src = bloque.get(k)
        if isinstance(src, dict):
            out[k] = {**out[k], **src}
    return out


def _matriz_tabla_html(bloque: dict, titulo: str, cols: Sequence[int], niveles_info: dict) -> str:
    b = _merge_matriz_bloque(bloque, cols)
    n_min = min(cols) if cols else 1
    parts = [
        f'<p style="margin:16px 0 8px;font-weight:700;font-size:14px;">{html.escape(titulo)}</p>',
        '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">',
        "<thead><tr>",
        f'<th style="{_TH}">Estado</th>',
    ]
    for n in cols:
        parts.append(f'<th style="{_TH_R}">{html.escape(_encabezado_nivel(niveles_info, n))}</th>')
    parts.append("</tr></thead><tbody>")
    for key, label, bg, dark, dyn in MATRIZ_FILAS:
        tc = "#f9fafb" if dark else "#0f172a"
        lbl = f"PENDIENTE N{n_min}" if dyn else label
        parts.append(f'<tr style="background:{bg};">')
        parts.append(f'<td style="{_TD}font-weight:700;color:{tc};">{html.escape(lbl)}</td>')
        for n in cols:
            val = _matriz_valor(b, key, n)
            parts.append(f'<td style="{_TD_R}color:{tc};">{html.escape(_format_cop(val))}</td>')
        parts.append("</tr>")
    parts.append("</tbody></table>")
    return "".join(parts)


def build_matriz_html(matriz: dict) -> str:
    na = sorted({int(x) for x in (matriz.get("niveles_activos") or [1, 2, 3]) if 1 <= int(x) <= 6})
    if not na:
        na = [1, 2, 3]
    cols = sorted(na, reverse=True)
    niveles_info = {
        "niveles": matriz.get("niveles") or [{"nivel": n, "encabezado": f"Nivel {n}"} for n in na],
    }
    chunks = ['<div style="margin:20px 0;">']
    for key, titulo in MATRIZ_TABLAS:
        chunks.append(_matriz_tabla_html(matriz.get(key) or {}, titulo, cols, niveles_info))
    chunks.append("</div>")
    return "".join(chunks)


def _suma_riesgo(matriz: dict, niveles: Sequence[int]) -> float:
    total = 0.0
    for bloque_key, _ in MATRIZ_TABLAS:
        bloque = matriz.get(bloque_key) or {}
        for fila in RIESGO_ESTADOS:
            for n in niveles:
                total += _matriz_valor(bloque, fila, n)
    return total


def build_narrativa_riesgo(matriz: dict) -> str:
    na = sorted({int(x) for x in (matriz.get("niveles_activos") or [1, 2, 3]) if 1 <= int(x) <= 6})
    if not na:
        na = [1, 2, 3]
    n_max = int(matriz.get("nivel_maximo") or max(na))
    intermedios = [n for n in na if n != n_max]
    parts: List[str] = ['<div style="margin:20px 0;">']
    intro = _suma_riesgo(matriz, na)
    if intro <= 0:
        parts.append(
            "<p>No se identifican riesgos de validación relevantes en este momento.</p>"
        )
        parts.append("</div>")
        return "".join(parts)

    sum_inter = _suma_riesgo(matriz, intermedios) if intermedios else 0.0
    sum_max = _suma_riesgo(matriz, [n_max])

    if sum_inter > 0:
        ns = ", ".join(f"N{n}" for n in intermedios)
        parts.append(
            f"<p><strong>Riesgo en niveles intermedios ({ns}):</strong> "
            f"existen valores en estado pendiente, rechazado o sin revisar "
            f"por un total de <strong>{html.escape(_format_cop(sum_inter))}</strong>. "
            f"De no resolverse oportunamente, estos registros no avanzarán hacia "
            f"interventoría y podrían quedar fuera del flujo de aprobación del acta vigente.</p>"
        )
    if sum_max > 0:
        parts.append(
            f"<p><strong>Riesgo en nivel máximo (N{n_max}):</strong> "
            f"existen valores pendientes, rechazados o sin revisar por "
            f"<strong>{html.escape(_format_cop(sum_max))}</strong>. "
            f"Este es el último punto de control antes del cierre de validación; "
            f"conviene atenderlos con prioridad.</p>"
        )
    if sum_inter <= 0 and sum_max <= 0:
        parts.append(
            "<p>No se identifican riesgos de validación relevantes en este momento.</p>"
        )
    parts.append("</div>")
    return "".join(parts)


def _capitulos_tabla_html(
    rows: List[dict],
    totales: dict,
    titulo: str,
    footer_label: str,
    header_bg: str,
) -> str:
    th = _TH.replace("#f1f5f9", header_bg).replace("#475569", "#ffffff")
    th_r = th.replace("left", "right")
    parts = [
        f'<p style="margin:16px 0 8px;font-weight:700;font-size:14px;">{html.escape(titulo)}</p>',
        '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px;">',
        "<thead><tr>",
        f'<th style="{th}">Capítulo</th>',
        f'<th style="{th_r}">Total ClaraCore</th>',
        f'<th style="{th_r}">Total Cobrado</th>',
        f'<th style="{th_r}">Δ</th>',
        "</tr></thead><tbody>",
    ]
    for r in rows:
        cap = (r.get("capitulo") or "").strip() or "—"
        cc = float(r.get("claracore") or 0)
        cob = float(r.get("cobrado") or 0)
        delta = float(r.get("delta") if r.get("delta") is not None else cc - cob)
        parts.append("<tr>")
        parts.append(f'<td style="{_TD}">{html.escape(cap)}</td>')
        parts.append(f'<td style="{_TD_R}">{html.escape(_format_cop(cc))}</td>')
        parts.append(f'<td style="{_TD_R}">{html.escape(_format_cop(cob))}</td>')
        parts.append(f'<td style="{_TD_R}">{html.escape(_format_cop(delta))}</td>')
        parts.append("</tr>")
    t_cc = float(totales.get("claracore") or 0)
    t_co = float(totales.get("cobrado") or 0)
    t_d = float(totales.get("delta") if totales.get("delta") is not None else t_cc - t_co)
    parts.append(
        f'<tr style="background:#f1f5f9;font-weight:700;">'
        f'<td style="{_TD}">{html.escape(footer_label)}</td>'
        f'<td style="{_TD_R}">{html.escape(_format_cop(t_cc))}</td>'
        f'<td style="{_TD_R}">{html.escape(_format_cop(t_co))}</td>'
        f'<td style="{_TD_R}">{html.escape(_format_cop(t_d))}</td>'
        f"</tr>"
    )
    parts.append("</tbody></table>")
    return "".join(parts)


def build_capitulos_html(capitulos: dict) -> Tuple[str, str]:
    expl = (
        "La siguiente tabla resume por capítulo el <strong>Total ClaraCore</strong> "
        "(valor registrado en plataforma), el <strong>Total Cobrado</strong> y la "
        "<strong>diferencia (Δ)</strong> entre ambos. Una Δ positiva indica valor en "
        "ClaraCore aún no reflejado en cobro; una Δ negativa indica cobro por encima "
        "del acumulado ClaraCore en ese capítulo."
    )
    html_body = "".join(
        [
            f'<p style="margin:20px 0 8px;">{expl}</p>',
            _capitulos_tabla_html(
                capitulos.get("capitulos_aiu") or capitulos.get("capitulos") or [],
                capitulos.get("totales_aiu") or capitulos.get("totales") or {},
                "Ppto vs Cobro por capítulo (AIU)",
                "TOTAL OBRA (AIU)",
                "#4472C4",
            ),
            _capitulos_tabla_html(
                capitulos.get("capitulos_iva") or [],
                capitulos.get("totales_iva") or {},
                "Ppto vs Cobro · IVA",
                "TOTAL IVA",
                "#7C3AED",
            ),
        ]
    )
    text = (
        "Ppto vs Cobro: Total ClaraCore, Total Cobrado y Δ por capítulo (AIU e IVA). "
        "Vista Obra Ejecutada."
    )
    return html_body, text


def build_intro_cierre(periodo: str) -> Tuple[str, str]:
    """Texto introductorio y cierre según inicio o fin de jornada."""
    if periodo == "manana":
        intro = (
            "Al iniciar la jornada, le compartimos el panorama de validación y "
            "ejecución financiera del contrato para orientar la revisión de pendientes del día."
        )
        cierre = (
            "Le invitamos a revisar los pendientes señalados y coordinar su atención "
            "durante la jornada."
        )
    else:
        intro = (
            "Al cierre de la jornada, le compartimos el resumen de validación y "
            "ejecución financiera del contrato con lo ocurrido en el día."
        )
        cierre = (
            "Gracias por su gestión. Quedamos atentos a la resolución de los pendientes "
            "identificados."
        )
    return intro, cierre


def build_saludo(nombre: str, acta_rpo: Optional[int]) -> str:
    acta_txt = str(acta_rpo) if acta_rpo is not None else "—"
    return (
        f"Estimado Ingeniero {html.escape(nombre)}, a continuación ClaraCore te informa "
        f"el estado de las validaciones del Acta #{html.escape(acta_txt)}."
    )
