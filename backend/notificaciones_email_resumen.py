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


def _nivel_matriz_values(matriz: dict, nivel: int) -> Dict[tuple, float]:
    """Todos los valores de una columna de nivel en la matriz (tablas × filas)."""
    out: Dict[tuple, float] = {}
    for table_key, _ in MATRIZ_TABLAS:
        bloque = matriz.get(table_key) or {}
        for row_key, *_ in MATRIZ_FILAS:
            out[(table_key, row_key)] = _matriz_valor(bloque, row_key, nivel)
    return out


def _aprobado_nivel(matriz: dict, nivel: int) -> float:
    total = 0.0
    for table_key, _ in MATRIZ_TABLAS:
        total += _matriz_valor(matriz.get(table_key) or {}, "aprobado", nivel)
    return total


def compute_comparacion_jornada(
    matriz_manana: dict,
    matriz_tarde: dict,
    capitulos_manana: dict,
    capitulos_tarde: dict,
) -> dict:
    """Diferencias entre snapshot de inicio y valores actuales de fin de jornada."""
    na = sorted(
        {
            int(x)
            for x in (
                (matriz_tarde.get("niveles_activos") or [])
                + (matriz_manana.get("niveles_activos") or [])
                + [1, 2, 3]
            )
            if 1 <= int(x) <= 6
        }
    )
    if not na:
        na = [1, 2, 3]

    aprobado_delta = {
        n: _aprobado_nivel(matriz_tarde, n) - _aprobado_nivel(matriz_manana, n) for n in na
    }
    sin_avance = [
        n
        for n in na
        if _nivel_matriz_values(matriz_manana, n) == _nivel_matriz_values(matriz_tarde, n)
    ]

    def _cap_rows_diff(cap_m: dict, cap_t: dict, key_rows: str, key_tot: str) -> dict:
        rows_m = {
            (r.get("capitulo") or "").strip(): r
            for r in (cap_m.get(key_rows) or [])
            if isinstance(r, dict)
        }
        rows_t = {
            (r.get("capitulo") or "").strip(): r
            for r in (cap_t.get(key_rows) or [])
            if isinstance(r, dict)
        }
        caps = sorted(set(rows_m) | set(rows_t))
        filas: List[dict] = []
        for cap in caps:
            rm = rows_m.get(cap) or {}
            rt = rows_t.get(cap) or {}
            cc_m = float(rm.get("claracore") or 0)
            co_m = float(rm.get("cobrado") or 0)
            d_m = float(rm.get("delta") if rm.get("delta") is not None else cc_m - co_m)
            cc_t = float(rt.get("claracore") or 0)
            co_t = float(rt.get("cobrado") or 0)
            d_t = float(rt.get("delta") if rt.get("delta") is not None else cc_t - co_t)
            filas.append(
                {
                    "capitulo": cap or "—",
                    "delta_claracore": cc_t - cc_m,
                    "delta_cobrado": co_t - co_m,
                    "delta_delta": d_t - d_m,
                }
            )
        tm = cap_m.get(key_tot) or {}
        tt = cap_t.get(key_tot) or {}
        t_cc_m = float(tm.get("claracore") or 0)
        t_co_m = float(tm.get("cobrado") or 0)
        t_d_m = float(tm.get("delta") if tm.get("delta") is not None else t_cc_m - t_co_m)
        t_cc_t = float(tt.get("claracore") or 0)
        t_co_t = float(tt.get("cobrado") or 0)
        t_d_t = float(tt.get("delta") if tt.get("delta") is not None else t_cc_t - t_co_t)
        return {
            "filas": filas,
            "totales": {
                "delta_claracore": t_cc_t - t_cc_m,
                "delta_cobrado": t_co_t - t_co_m,
                "delta_delta": t_d_t - t_d_m,
            },
        }

    return {
        "niveles_activos": na,
        "niveles": matriz_tarde.get("niveles") or matriz_manana.get("niveles") or [],
        "aprobado_delta": aprobado_delta,
        "niveles_sin_avance": sin_avance,
        "capitulos_aiu": _cap_rows_diff(
            capitulos_manana, capitulos_tarde, "capitulos_aiu", "totales_aiu"
        ),
        "capitulos_iva": _cap_rows_diff(
            capitulos_manana, capitulos_tarde, "capitulos_iva", "totales_iva"
        ),
    }


def _format_delta_cop(n: float) -> str:
    sign = "+" if n > 0 else ""
    return f"{sign}{_format_cop(n)}"


def build_narrativa_sin_avance(comparacion: dict) -> str:
    sin = comparacion.get("niveles_sin_avance") or []
    if not sin:
        return ""
    niveles_info = {"niveles": comparacion.get("niveles") or []}
    labels = [html.escape(_encabezado_nivel(niveles_info, n)) for n in sin]
    ns = ", ".join(labels)
    return (
        f"<p><strong>Sin actividad de revisión en la jornada:</strong> "
        f"en {ns} los valores de validación permanecieron idénticos al inicio "
        f"de la jornada. Esto indica que no hubo movimiento de revisión en "
        f"esos niveles durante todo el día, lo cual constituye un riesgo "
        f"adicional a los señalados arriba.</p>"
    )


def _comparacion_capitulos_tabla_html(
    diff: dict,
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
        f'<th style="{th_r}">Δ ClaraCore</th>',
        f'<th style="{th_r}">Δ Cobrado</th>',
        f'<th style="{th_r}">Δ Δ</th>',
        "</tr></thead><tbody>",
    ]
    for r in diff.get("filas") or []:
        parts.append("<tr>")
        parts.append(f'<td style="{_TD}">{html.escape(r.get("capitulo") or "—")}</td>')
        parts.append(
            f'<td style="{_TD_R}">{html.escape(_format_delta_cop(float(r.get("delta_claracore") or 0)))}</td>'
        )
        parts.append(
            f'<td style="{_TD_R}">{html.escape(_format_delta_cop(float(r.get("delta_cobrado") or 0)))}</td>'
        )
        parts.append(
            f'<td style="{_TD_R}">{html.escape(_format_delta_cop(float(r.get("delta_delta") or 0)))}</td>'
        )
        parts.append("</tr>")
    tot = diff.get("totales") or {}
    parts.append(
        f'<tr style="background:#f1f5f9;font-weight:700;">'
        f'<td style="{_TD}">{html.escape(footer_label)}</td>'
        f'<td style="{_TD_R}">{html.escape(_format_delta_cop(float(tot.get("delta_claracore") or 0)))}</td>'
        f'<td style="{_TD_R}">{html.escape(_format_delta_cop(float(tot.get("delta_cobrado") or 0)))}</td>'
        f'<td style="{_TD_R}">{html.escape(_format_delta_cop(float(tot.get("delta_delta") or 0)))}</td>'
        f"</tr>"
    )
    parts.append("</tbody></table>")
    return "".join(parts)


def build_comparacion_jornada_html(comparacion: dict) -> Tuple[str, str]:
    """HTML y texto plano de la comparación inicio vs fin de jornada."""
    na = comparacion.get("niveles_activos") or [1, 2, 3]
    cols = sorted(na, reverse=True)
    niveles_info = {
        "niveles": comparacion.get("niveles")
        or [{"nivel": n, "encabezado": f"Nivel {n}"} for n in na],
    }
    deltas = comparacion.get("aprobado_delta") or {}

    parts = [
        '<div style="margin:20px 0;">',
        "<p>Comparación entre el resumen de <strong>inicio de jornada (9:00)</strong> "
        "y el estado actual al <strong>cierre (18:00)</strong>:</p>",
        '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">',
        "<thead><tr>",
        f'<th style="{_TH}">Nivel</th>',
        f'<th style="{_TH_R}">Aprobado adicional (Δ jornada)</th>',
        "</tr></thead><tbody>",
    ]
    for n in cols:
        d = float(deltas.get(n) or 0)
        parts.append("<tr>")
        parts.append(
            f'<td style="{_TD}">{html.escape(_encabezado_nivel(niveles_info, n))}</td>'
        )
        parts.append(
            f'<td style="{_TD_R}">{html.escape(_format_delta_cop(d))}</td>'
        )
        parts.append("</tr>")
    parts.append("</tbody></table>")
    parts.append(
        _comparacion_capitulos_tabla_html(
            comparacion.get("capitulos_aiu") or {"filas": [], "totales": {}},
            "Δ Ppto vs Cobro por capítulo (AIU)",
            "TOTAL OBRA (AIU)",
            "#4472C4",
        )
    )
    parts.append(
        _comparacion_capitulos_tabla_html(
            comparacion.get("capitulos_iva") or {"filas": [], "totales": {}},
            "Δ Ppto vs Cobro · IVA",
            "TOTAL IVA",
            "#7C3AED",
        )
    )
    parts.append("</div>")
    html_out = "".join(parts)
    text = (
        "Comparación inicio vs fin de jornada: aprobado adicional por nivel "
        "y cambios en Ppto vs Cobro por capítulo."
    )
    return html_out, text


def build_comparacion_no_disponible_html() -> str:
    return (
        '<p style="margin:20px 0;color:#64748b;font-style:italic;">'
        "No hay registro de inicio de jornada para este contrato en la fecha "
        "indicada (por ejemplo, si el correo de las 9:00 no se envió). "
        "No es posible mostrar la comparación con la mañana."
        "</p>"
    )
