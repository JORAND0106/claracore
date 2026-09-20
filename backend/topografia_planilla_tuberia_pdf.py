"""
Fragmentos HTML/SVG para el PDF de Planillas de Tubería.

Cabecera (logo + INFORMACION DEL CONTRATO), franja de tramo/tubería,
sección típica y perfil longitudinal según el inventario XLSM —
sin abrir el .xlsm en runtime.
"""
from __future__ import annotations

import html
from typing import Any, Optional

# Colores aproximados del inventario (theme Office → RGB).
_FILL_ABS = "#BDD7EE"  # theme 4 tint ~0.4 — Abs/PK_ID/Costado
_FILL_HDR = "#D9D9D9"  # theme 0 tint -0.15 — cabeceras geo/params
_FILL_CALC = "#F2F2F2"  # celdas calculadas


def _fmt(v: Any, d: int = 3) -> str:
    if v is None:
        return ""
    try:
        return f"{float(v):.{d}f}"
    except Exception:
        return html.escape(str(v))


def _num(v: Any, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _esc(v: Any) -> str:
    if v is None:
        return ""
    return html.escape(str(v))


def _th(text: str, *, fill: str = _FILL_HDR, colspan: int = 1) -> str:
    cs = f' colspan="{colspan}"' if colspan > 1 else ""
    return (
        f'<th{cs} style="background:{fill};border:0.4pt solid #64748b;padding:0 2px;'
        f'font-size:6pt;font-weight:700;text-align:center;vertical-align:middle;line-height:1.1;">{text}</th>'
    )


def _td(text: str, *, fill: str = "#FFFFFF", align: str = "center") -> str:
    return (
        f'<td style="background:{fill};border:0.4pt solid #64748b;padding:0 2px;'
        f'font-size:6.5pt;text-align:{align};vertical-align:middle;line-height:1.1;">{text}</td>'
    )


def html_cabecera_planilla_tuberia(
    *,
    contrato: dict,
    meta: dict,
    titulo: str,
    codigo_doc: str = "INF-ING - TOP - 001 - V0",
) -> str:
    """Logo contratista + partes + banda INFORMACION DEL CONTRATO (inventario G5:N8)."""
    from topografia_utils import _html_logo_pdf

    logo = _html_logo_pdf(contrato, max_h=22, placeholder_pt=5)
    contratista = html.escape(
        str(meta.get("contratista") or contrato.get("contratista") or "")
    )
    interventoria = html.escape(
        str(meta.get("interventoria") or contrato.get("interventoria") or "")
    )
    apoyo = html.escape(str(meta.get("apoyo_supervision") or ""))
    numero = html.escape(str(contrato.get("numero") or ""))
    objeto = html.escape(str(contrato.get("objeto") or ""))
    info_raw = meta.get("info_contrato") or f"{contrato.get('numero') or ''}\n{contrato.get('objeto') or ''}".strip()
    info = html.escape(str(info_raw)).replace("\n", "<br/>")
    codigo = html.escape(str(meta.get("codigo_documento") or codigo_doc))
    fecha = html.escape(str(meta.get("fecha_elaboracion") or ""))

    return f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:2px;">
      <tr>
        <td width="9%" align="center" style="border:0.4pt solid #334155;padding:1px;vertical-align:middle;">
          {logo}
        </td>
        <td width="62%" style="border:0.4pt solid #334155;padding:1px 4px;vertical-align:middle;">
          <div style="font-size:9pt;font-weight:700;text-align:center;">{html.escape(titulo)}</div>
        </td>
        <td width="29%" style="border:0.4pt solid #334155;padding:1px 4px;vertical-align:top;font-size:6.5pt;">
          <div style="text-align:right;font-weight:700;">{codigo}</div>
          <div style="margin-top:1px;color:#475569;">Fecha: {fecha or "—"}</div>
        </td>
      </tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:2px;font-size:6.5pt;">
      <tr>
        <td width="50%" style="border:0.4pt solid #64748b;padding:1px 4px;vertical-align:top;line-height:1.15;">
          <div><b>Contratista:</b> {contratista}</div>
          <div><b>Interventoría:</b> {interventoria}</div>
          <div><b>Apoyo a la Supervisión:</b> {apoyo}</div>
          <div><b>FECHA DE ELABORACIÓN:</b> {fecha or "—"}</div>
        </td>
        <td width="50%" style="border:0.4pt solid #64748b;padding:0;vertical-align:top;">
          <div style="background:#7F7F7F;color:#fff;font-weight:700;padding:1px 4px;text-align:center;font-size:6.5pt;">
            INFORMACION DEL CONTRATO
          </div>
          <div style="padding:1px 4px;line-height:1.15;">
            <div><b>Nº:</b> {numero}</div>
            <div><b>Objeto:</b> {objeto}</div>
            <div>{info}</div>
          </div>
        </td>
      </tr>
    </table>
    """


def html_franja_tramo_tuberia(
    *,
    planilla: dict,
    calculo: Optional[dict] = None,
    meta: Optional[dict] = None,
) -> str:
    """
    Franja de identificación de tramo/tubería (inventario filas 10–15).

    Sub-bloques:
      - Abs Inicial / Abs Final / PK_ID / Costado (franja azul)
      - Georreferenciación B12:G13
      - Parámetros de tubería I12:M13
      - Area 1 / Area 2 / Altura Atraque / Altura Relleno / Cama Triturado / Anc. Excavación
    """
    calc = calculo or {}
    meta = meta if isinstance(meta, dict) else {}
    sec = calc.get("seccion") or {}
    st = calc.get("seccion_tipica") or {}
    tot = (calc.get("cartera") or {}).get("totales") or {}
    tipo = (planilla.get("tipo") or sec.get("tipo") or "ALCANTARILLA").upper()

    abs_ini = meta.get("abscisa_inicial")
    if abs_ini is None:
        abs_ini = tot.get("abscisa_inicial")
    abs_fin = meta.get("abscisa_final")
    if abs_fin is None:
        abs_fin = tot.get("abscisa_final")

    n_ini = meta.get("norte_abs_inicial", planilla.get("norte_ref"))
    e_ini = meta.get("este_abs_inicial", planilla.get("este_ref"))
    n_fin = meta.get("norte_abs_final")
    e_fin = meta.get("este_abs_final")

    diam = planilla.get("diametro_m")
    if diam is None:
        diam = sec.get("diametro_m")
    esp = planilla.get("espesor_m")
    if esp is None:
        esp = sec.get("espesor_m")
    area_tub = sec.get("area_tuberia_m2") or st.get("area_tuberia_m2")
    material = planilla.get("material") or meta.get("material") or ""
    tipo_red = "FILTRO" if tipo == "FILTRO" else "ALCANTARILLA"

    area_1 = sec.get("area_1_m2")
    if area_1 is None:
        area_1 = st.get("area_1_m2")
    area_2 = sec.get("area_2_m2")
    if area_2 is None:
        area_2 = st.get("area_2_m2")
    rel = planilla.get("relacion_atraque") or sec.get("relacion_atraque") or "1:3"
    h_relleno = sec.get("altura_relleno_m")
    if h_relleno is None:
        h_relleno = st.get("altura_relleno_m")
    cama = meta.get("cama_triturado_m")
    if cama is None:
        cama = sec.get("cama_triturado_m")
        if cama is None:
            cama = st.get("cama_triturado_m")
    ancho_exc = planilla.get("ancho_excavacion_m")
    if ancho_exc is None:
        ancho_exc = sec.get("ancho_excavacion_m")

    cama_hdr = "Cama Triturado" if tipo != "FILTRO" else ""
    cama_val = _fmt(cama) if tipo != "FILTRO" else ""

    # Fila Abs / PK / Costado (I10:M11 del inventario).
    abs_strip = f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:1px 0 2px;">
      <tr>
        {_th("Abs Inicial", fill=_FILL_ABS)}
        {_th("Abs Final", fill=_FILL_ABS)}
        <td style="border:none;width:8%;"></td>
        {_th("PK_ID", fill=_FILL_ABS)}
        {_th("Costado", fill=_FILL_ABS)}
      </tr>
      <tr>
        {_td(_fmt(abs_ini, 2), fill=_FILL_CALC)}
        {_td(_fmt(abs_fin, 2), fill=_FILL_CALC)}
        <td style="border:none;"></td>
        {_td(_esc(planilla.get("pk_id")), fill="#FFFFFF")}
        {_td(_esc(planilla.get("costado")), fill="#FFFFFF")}
      </tr>
    </table>
    """

    # Georref (B12:G13) + parámetros tubería (I12:M13) en la misma franja.
    geo_tub = f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 2px;">
      <tr>
        {_th("Abscisa Inicial")}
        {_th("Norte Abs Inicial")}
        {_th("Este Abs Incial")}
        {_th("Abscisa Final")}
        {_th("Norte Abs Final")}
        {_th("Este Abs Final")}
        {_th("D. TUBERÍA<br/>(Mts)")}
        {_th("ESP. TUBERÍA")}
        {_th("AREA TUBERÍA")}
        {_th("MATERIAL")}
        {_th("TIPO DE RED")}
      </tr>
      <tr>
        {_td(_fmt(abs_ini, 2), fill=_FILL_CALC)}
        {_td(_fmt(n_ini, 3))}
        {_td(_fmt(e_ini, 3))}
        {_td(_fmt(abs_fin, 2), fill=_FILL_CALC)}
        {_td(_fmt(n_fin, 3))}
        {_td(_fmt(e_fin, 3))}
        {_td(_fmt(diam))}
        {_td(_fmt(esp))}
        {_td(_fmt(area_tub), fill=_FILL_CALC)}
        {_td(_esc(material))}
        {_td(tipo_red, fill=_FILL_CALC)}
      </tr>
    </table>
    """

    # Areas / atraque / excavación (B14:G15).
    atr = f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 2px;">
      <tr>
        {_th("Area 1")}
        {_th("Area 2")}
        {_th("Altura Atraque")}
        {_th("Altura Relleno")}
        {_th(cama_hdr or "&nbsp;")}
        {_th("Anc. Excavación")}
      </tr>
      <tr>
        {_td(_fmt(area_1), fill=_FILL_CALC)}
        {_td(_fmt(area_2), fill=_FILL_CALC)}
        {_td(_esc(rel))}
        {_td(_fmt(h_relleno), fill=_FILL_CALC)}
        {_td(cama_val)}
        {_td(_fmt(ancho_exc))}
      </tr>
    </table>
    """

    return abs_strip + geo_tub + atr


def svg_seccion_tipica_pdf(seccion_tipica: Optional[dict], *, width: int = 320, height: int = 220) -> str:
    """SVG paramétrico del panel GRAFICO (diámetro, espesor, ancho excavación, alturas)."""
    st = seccion_tipica or {}
    B = max(_num(st.get("ancho_excavacion_m"), 1.2), 0.4)
    D = max(_num(st.get("diametro_externo_m"), 0.6), 0.2)
    h_rel = max(_num(st.get("altura_relleno_m"), 0.2), 0.05)
    h_exc = max(_num(st.get("prom_altura_excavacion"), B), 0.5)
    cama = max(_num(st.get("cama_triturado_m"), 0.0), 0.0)
    tipo = str(st.get("tipo") or "ALCANTARILLA")
    rel = html.escape(str(st.get("relacion_atraque") or ""))

    scale = min(180 / B, 140 / max(h_exc, D + h_rel + cama + 0.3))
    cx = width / 2
    trench_w = B * scale
    trench_h = h_exc * scale
    top = 28
    left = cx - trench_w / 2
    pipe_r = (D / 2) * scale
    bed_h = max((h_rel + cama) * scale, 4.0)
    pipe_cy = top + trench_h - bed_h - pipe_r * 0.1
    fill_pipe = "#7dd3fc" if tipo == "FILTRO" else "#94a3b8"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>
  <text x="{cx}" y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#334155">GRAFICO — Sección típica</text>
  <rect x="{left:.1f}" y="{top}" width="{trench_w:.1f}" height="{trench_h:.1f}" fill="#f1f5f9" stroke="#334155" stroke-width="1.5"/>
  <rect x="{left:.1f}" y="{top + trench_h - bed_h:.1f}" width="{trench_w:.1f}" height="{bed_h:.1f}" fill="#fde68a" stroke="#b45309" stroke-width="1" opacity="0.9"/>
  <circle cx="{cx}" cy="{pipe_cy:.1f}" r="{pipe_r:.1f}" fill="{fill_pipe}" stroke="#0f172a" stroke-width="1.5"/>
  <line x1="{left - 10:.1f}" y1="{top}" x2="{left - 10:.1f}" y2="{top + trench_h:.1f}" stroke="#0ea5e9" stroke-width="1.2"/>
  <text x="{left - 14:.1f}" y="{top + trench_h / 2:.1f}" font-size="8" fill="#0369a1" text-anchor="end" dominant-baseline="middle">h_exc {_fmt(h_exc, 2)}</text>
  <text x="{cx}" y="{top + trench_h + 16:.1f}" font-size="8" fill="#475569" text-anchor="middle">B={_fmt(B, 2)} m · Øext={_fmt(D, 3)} m · h_atr={_fmt(h_rel, 3)} m ({rel})</text>
  <text x="{cx}" y="{height - 8}" font-size="8" fill="#64748b" text-anchor="middle">A1={_fmt(st.get("area_1_m2"), 4)} m² · A2={_fmt(st.get("area_2_m2"), 4)} m²</text>
</svg>"""


def svg_perfil_longitudinal_pdf(perfil: Optional[dict], *, width: int = 520, height: int = 200) -> str:
    """SVG del ScatterChart: Terreno Natural / Terminado Filtro|Cota Lomo / Cota Fondo."""
    p = perfil or {}
    abs_ = list(p.get("abscisas") or [])
    tn = list(p.get("terreno_natural") or [])
    nv = list(p.get("nivel_referencia") or [])
    cfe = list(p.get("cota_fondo_excavacion") or [])
    etiqueta = html.escape(str(p.get("etiqueta_nivel") or "Nivel"))
    titulo = html.escape(str(p.get("titulo_grafico") or "Perfil Longitudinal de Tubería"))

    def nums(vals):
        out = []
        for v in vals:
            try:
                if v is None:
                    continue
                out.append(float(v))
            except Exception:
                continue
        return out

    abs_n = nums(abs_)
    all_y = nums(tn) + nums(nv) + nums(cfe)

    pad_l, pad_r, pad_t, pad_b = 40, 12, 28, 28
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="#ffffff"/>',
        f'<text x="{pad_l}" y="14" font-size="10" font-weight="700" fill="#334155">{titulo}</text>',
        f'<line x1="{pad_l}" y1="{pad_t}" x2="{pad_l}" y2="{height - pad_b}" stroke="#94a3b8"/>',
        f'<line x1="{pad_l}" y1="{height - pad_b}" x2="{width - pad_r}" y2="{height - pad_b}" stroke="#94a3b8"/>',
        f'<text x="{pad_l}" y="24" font-size="8" fill="#166534">Terreno Natural</text>',
        f'<text x="{pad_l + 100}" y="24" font-size="8" fill="#1d4ed8">{etiqueta}</text>',
        f'<text x="{pad_l + 220}" y="24" font-size="8" fill="#b45309">Cota Fondo Excavación</text>',
    ]

    if len(abs_n) < 2 or len(all_y) < 2:
        parts.append(
            f'<text x="{width / 2}" y="{height / 2}" text-anchor="middle" font-size="9" fill="#94a3b8">'
            f"Sin series — plantilla de perfil longitudinal</text>"
        )
        parts.append("</svg>")
        return "".join(parts)

    min_a, max_a = min(abs_n), max(abs_n)
    min_y, max_y = min(all_y), max(all_y)
    dx = max(max_a - min_a, 1e-6)
    dy = max(max_y - min_y, 1e-6)

    def poly(vals, color: str) -> str:
        chunks: list[list[str]] = []
        cur: list[str] = []
        for i, a in enumerate(abs_):
            v = vals[i] if i < len(vals) else None
            try:
                if a is None or v is None:
                    if cur:
                        chunks.append(cur)
                        cur = []
                    continue
                af, vf = float(a), float(v)
            except Exception:
                if cur:
                    chunks.append(cur)
                    cur = []
                continue
            x = pad_l + (af - min_a) / dx * plot_w
            y = (height - pad_b) - (vf - min_y) / dy * plot_h
            cur.append(f"{x:.1f},{y:.1f}")
        if cur:
            chunks.append(cur)
        return "".join(
            f'<polyline points="{" ".join(c)}" fill="none" stroke="{color}" stroke-width="1.6"/>'
            for c in chunks
        )

    parts.append(poly(tn, "#166534"))
    parts.append(poly(nv, "#1d4ed8"))
    parts.append(poly(cfe, "#b45309"))
    parts.append(
        f'<text x="{pad_l}" y="{height - 8}" font-size="8" fill="#64748b">{_fmt(min_a, 2)}</text>'
    )
    parts.append(
        f'<text x="{width - pad_r}" y="{height - 8}" font-size="8" fill="#64748b" text-anchor="end">{_fmt(max_a, 2)}</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def html_bloque_graficos_pdf(
    calculo: dict,
    *,
    sec_w: int = 180,
    sec_h: int = 105,
    perfil_w: int = 300,
    perfil_h: int = 105,
) -> str:
    """Panel GRAFICO + Perfil longitudinal embebidos (xhtml2pdf).

    Los tamaños por defecto están compactos para caber en una sola página landscape.
    No altera la geometría SVG; solo el tamaño de incrustación.
    """
    from topografia_utils import svg_embed_pdf

    st = calculo.get("seccion_tipica") or calculo.get("seccion") or {}
    sec = svg_seccion_tipica_pdf(st, width=sec_w, height=sec_h)
    perfil = svg_perfil_longitudinal_pdf(
        calculo.get("perfil") or {}, width=perfil_w, height=perfil_h
    )
    return f"""
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:1px 0;">
      <tr>
        <td width="38%" valign="top" style="border:0.4pt solid #94a3b8;padding:1px;">
          {svg_embed_pdf(sec, sec_w, sec_h)}
        </td>
        <td width="62%" valign="top" style="border:0.4pt solid #94a3b8;padding:1px;">
          {svg_embed_pdf(perfil, perfil_w, perfil_h)}
        </td>
      </tr>
    </table>
    """
