"""
PDF Bitácora de Obra — exportación del día (landscape, compacto).
Hoja 1: Reporte Diario · Hoja 2: Eventos · Hoja 3+: Fotografías.
Encabezado institucional con 3 logos (entidad, contratista, interventoría).
"""
from __future__ import annotations

import base64
import html
import re
from typing import Any, Dict, List, Optional, Tuple

from almacen_firma_pdf import firma_url_a_data_uri
from bitacora_service import (
    consultar_clima_slots_3h,
    contrato_meta_bitacora,
    list_entradas_del_dia,
    leer_media_bitacora,
)
from topografia_utils import to_pdf_bytes

_COLOR = "#0f172a"
_BORDE = "#334155"
_BORDE_SUAVE = "#94a3b8"
_BG_H = "#1e293b"
_FG_H = "#ffffff"
_MUTED = "#64748b"

# Cajas horizontales para fotos (contain, sin deformar).
_FOTO_BOX_W = 220.0
_FOTO_BOX_H = 130.0
_LOGO_H = 36
_LOGO_W = 100.0

_EVENTO_LABELS = {
    "visita_terceros": "Visita de terceros",
    "incidente_sst": "Incidente de seguridad (SST)",
    "reporte_actividades": "Reporte de actividades",
    "novedades": "Novedades/Observaciones generales",
}


def _label_evento(value) -> str:
    return _EVENTO_LABELS.get(str(value or "").strip(), str(value or "Evento"))


def _esc(val) -> str:
    return html.escape(str(val or ""))


def _plain_from_html(raw) -> str:
    s = str(raw or "")
    s = re.sub(r"(?is)<br\s*/?>", "\n", s)
    s = re.sub(r"(?is)</p>", "\n", s)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()


def _logo_uri(url: Optional[str]) -> str:
    if not url or not str(url).strip():
        return ""
    try:
        return firma_url_a_data_uri(str(url).strip()) or ""
    except Exception:
        return ""


def _fit_pt(uri: str, max_w: float, max_h: float) -> Tuple[float, float]:
    """Escala contain sin deformar (misma idea que seguimiento_pdf)."""
    try:
        from PIL import Image
        import io

        m = re.match(r"data:image/[^;]+;base64,(.+)$", uri, re.I | re.S)
        if not m:
            return round(max_w * 0.55, 2), round(max_h, 2)
        raw = base64.b64decode(m.group(1))
        im = Image.open(io.BytesIO(raw))
        px_w, px_h = im.size
        if not px_w or not px_h:
            return round(max_w * 0.55, 2), round(max_h, 2)
        nat_w = px_w * 72.0 / 96.0
        nat_h = px_h * 72.0 / 96.0
        scale = min(max_h / nat_h, max_w / nat_w, 1.0)
        return round(nat_w * scale, 2), round(nat_h * scale, 2)
    except Exception:
        return round(max_w * 0.55, 2), round(max_h, 2)


def _logo_cell(url: Optional[str], placeholder: str) -> str:
    uri = _logo_uri(url)
    if uri:
        w, h = _fit_pt(uri, _LOGO_W, float(_LOGO_H))
        return (
            f'<div style="text-align:center;line-height:0;">'
            f'<img src="{uri}" style="width:{w}pt;height:{h}pt;border:0;"/>'
            f"</div>"
        )
    return (
        f'<div style="border:0.4pt dashed {_BORDE_SUAVE};min-height:{_LOGO_H}pt;'
        f'text-align:center;padding:2pt;font-size:5pt;color:#94a3b8;">{_esc(placeholder)}</div>'
    )


def _resolve_img_uri(im: dict, contrato_id: int) -> str:
    if not isinstance(im, dict):
        return ""
    uri = str(im.get("data_uri") or "").strip()
    if uri.startswith("data:image"):
        return uri
    url = str(im.get("url") or "").strip()
    if url:
        try:
            return firma_url_a_data_uri(url) or ""
        except Exception:
            pass
    path = str(im.get("blob_path") or "").strip()
    if not path:
        return ""
    try:
        data, mime = leer_media_bitacora(contrato_id, path)
        if not data or len(data) > 6_000_000:
            return ""
        return f"data:{mime or 'image/png'};base64,{base64.b64encode(data).decode('ascii')}"
    except Exception:
        return ""


def _section_title(text: str) -> str:
    return (
        f'<div style="background:{_BG_H};color:{_FG_H};font-size:8pt;font-weight:bold;'
        f'padding:3pt 6pt;margin:6pt 0 3pt;">{_esc(text)}</div>'
    )


def _mini_table(headers: List[str], rows: List[List[str]], col_widths: Optional[List[str]] = None) -> str:
    ths = []
    for i, h in enumerate(headers):
        w = f' width="{col_widths[i]}"' if col_widths and i < len(col_widths) else ""
        ths.append(
            f'<th{w} style="background:{_BG_H};color:{_FG_H};font-size:6.5pt;padding:2pt 3pt;'
            f'border:0.3pt solid {_BORDE};text-align:left;">{_esc(h)}</th>'
        )
    body = []
    for r in rows:
        tds = []
        for i, cell in enumerate(r):
            w = f' width="{col_widths[i]}"' if col_widths and i < len(col_widths) else ""
            tds.append(
                f'<td{w} style="font-size:6.5pt;padding:2pt 3pt;border:0.3pt solid {_BORDE_SUAVE};'
                f'color:{_COLOR};vertical-align:top;">{cell}</td>'
            )
        body.append(f"<tr>{''.join(tds)}</tr>")
    if not body:
        body.append(
            f'<tr><td colspan="{len(headers)}" style="font-size:6.5pt;padding:4pt;color:{_MUTED};'
            f'border:0.3pt solid {_BORDE_SUAVE};">Sin registros</td></tr>'
        )
    return (
        f'<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">'
        f'<thead><tr>{"".join(ths)}</tr></thead><tbody>{"".join(body)}</tbody></table>'
    )


def _encabezado(contrato: dict, fecha: str) -> str:
    entidad = contrato.get("entidad_otra") or contrato.get("entidad") or "Entidad"
    return f"""
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1pt solid {_BORDE};margin:0 0 4pt;">
  <tr>
    <td width="18%" style="padding:3pt;border-right:0.4pt solid {_BORDE_SUAVE};vertical-align:middle;">
      {_logo_cell(contrato.get("logo_contratista"), "Logo contratista")}
    </td>
    <td width="18%" style="padding:3pt;border-right:0.4pt solid {_BORDE_SUAVE};vertical-align:middle;">
      {_logo_cell(contrato.get("logo_interventoria"), "Logo interventoría")}
    </td>
    <td width="46%" style="padding:3pt 6pt;vertical-align:middle;">
      <div style="font-size:9pt;font-weight:bold;color:{_COLOR};">Bitácora de Obra · {_esc(fecha)}</div>
      <div style="font-size:6.5pt;color:{_MUTED};margin-top:2pt;">
        Contrato {_esc(contrato.get("numero"))}
        {(" · Interventoría " + _esc(contrato.get("numero_interventoria"))) if contrato.get("numero_interventoria") else ""}
      </div>
      <div style="font-size:6pt;color:{_MUTED};margin-top:1pt;">{_esc((contrato.get("objeto") or "")[:160])}</div>
      <div style="font-size:6pt;color:{_MUTED};margin-top:1pt;">
        Contratista: {_esc(contrato.get("contratista") or "—")} ·
        Interventoría: {_esc(contrato.get("interventoria") or "—")} ·
        {_esc(entidad)}
      </div>
    </td>
    <td width="18%" style="padding:3pt;border-left:0.4pt solid {_BORDE_SUAVE};vertical-align:middle;">
      {_logo_cell(contrato.get("logo_entidad"), "Logo entidad")}
    </td>
  </tr>
</table>
"""


def _html_personal_y_preop(diario: Optional[dict]) -> str:
    personal = (diario or {}).get("personal") or []
    usos = (diario or {}).get("equipos_uso") or []
    pers_rows = [
        [_esc(p.get("cargo")), _esc(p.get("cantidad"))]
        for p in personal if isinstance(p, dict) and (p.get("cantidad") or 0)
    ]
    uso_rows = []
    for u in usos:
        if not isinstance(u, dict):
            continue
        n_pre = len(u.get("preoperacionales") or []) if isinstance(u.get("preoperacionales"), list) else 0
        uso_rows.append([
            _esc(u.get("equipo_nombre")),
            _esc(u.get("operador") or "—"),
            _esc(u.get("hora_inicio") or "—")[:5],
            _esc(u.get("hora_fin") or "—")[:5],
            _esc(f"{n_pre} adj." if n_pre else "—"),
        ])
    left = (
        _section_title("Personal en obra")
        + _mini_table(["Cargo", "Cant."], pers_rows, ["75%", "25%"])
    )
    right = (
        _section_title("Maquinaria / equipos · Preoperacional")
        + _mini_table(
            ["Equipo", "Operador", "Inicio", "Fin", "Preop."],
            uso_rows,
            ["34%", "22%", "14%", "14%", "16%"],
        )
    )
    return f"""
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
  <tr>
    <td width="38%" style="vertical-align:top;padding-right:4pt;">{left}</td>
    <td width="62%" style="vertical-align:top;">{right}</td>
  </tr>
</table>
"""


def _html_materiales(diario: Optional[dict]) -> str:
    mats = (diario or {}).get("materiales") or []
    rows = []
    for m in mats:
        if not isinstance(m, dict):
            continue
        lat, lng = m.get("ubicacion_lat"), m.get("ubicacion_lng")
        ubic = "—"
        if lat is not None and lng is not None:
            ubic = f"{lat}, {lng}"
        n_adj = len(m.get("adjuntos") or []) if isinstance(m.get("adjuntos"), list) else 0
        rows.append([
            _esc((m.get("movimiento") or "").capitalize()),
            _esc(m.get("tipo_material")),
            _esc(m.get("proveedor") or "—"),
            _esc(m.get("cantidad")),
            _esc(m.get("placa") or "—"),
            _esc(m.get("numeros_vale") or "—"),
            _esc(ubic),
            _esc(str(n_adj) if n_adj else "—"),
        ])
    return _section_title("Materiales (ingreso / salida)") + _mini_table(
        ["Mov.", "Tipo", "Proveedor", "Cant.", "Placa", "Vale(s)", "Ubicación", "Adj."],
        rows,
        ["8%", "18%", "14%", "8%", "10%", "14%", "20%", "8%"],
    )


def _html_clima(slots: List[dict]) -> str:
    rows = []
    for s in slots:
        marca = " ★" if s.get("manual") else ""
        temp = s.get("clima_temp_c")
        temp_s = f"{temp:.1f} °C" if isinstance(temp, (int, float)) else "—"
        rows.append([
            _esc(s.get("hora")),
            _esc((s.get("clima_descripcion") or "—") + marca),
            _esc(temp_s),
            _esc("Manual" if s.get("manual") else "Open-Meteo"),
        ])
    return (
        _section_title("Estado del clima cada 3 horas (ubicación del contrato)")
        + _mini_table(["Hora", "Condición", "Temp.", "Fuente"], rows, ["12%", "48%", "15%", "25%"])
        + f'<div style="font-size:5.5pt;color:{_MUTED};margin-top:2pt;">'
        f"★ Valor manual del Reporte Diario tiene prioridad en su tramo horario.</div>"
    )


def _html_observaciones(diario: Optional[dict]) -> str:
    txt = _plain_from_html((diario or {}).get("cuerpo_html"))
    elaborador = (diario or {}).get("created_by_nombre") or "—"
    return (
        _section_title("Observaciones y novedades del Reporte Diario")
        + f'<div style="font-size:7pt;color:{_COLOR};white-space:pre-wrap;border:0.3pt solid {_BORDE_SUAVE};'
        f'padding:4pt 6pt;min-height:40pt;">{_esc(txt or "—")}</div>'
        + f'<div style="font-size:6pt;color:{_MUTED};margin-top:2pt;">Elaborado por: {_esc(elaborador)}</div>'
    )


def _html_eventos(eventos: List[dict]) -> str:
    rows = []
    for ev in eventos:
        if not isinstance(ev, dict):
            continue
        tipo = _label_evento(ev.get("evento_tipo"))
        desc = _plain_from_html(ev.get("cuerpo_html"))[:280]
        dest = ev.get("dirigido_a") or "—"
        elab = ev.get("created_by_nombre") or "—"
        n_img = len(ev.get("imagenes") or []) if isinstance(ev.get("imagenes"), list) else 0
        rows.append([
            _esc(ev.get("fecha")),
            _esc(tipo),
            _esc(desc or "—"),
            _esc(dest),
            _esc(elab),
            _esc(str(n_img) if n_img else "—"),
        ])
    return (
        _section_title("Reportes de Evento del día")
        + _mini_table(
            ["Fecha", "Tipo", "Descripción", "Dirigido a", "Elaborado por", "Fotos"],
            rows,
            ["10%", "18%", "34%", "14%", "16%", "8%"],
        )
    )


def _collect_fotos(diario: Optional[dict], eventos: List[dict]) -> List[dict]:
    out: List[dict] = []
    if diario:
        for im in diario.get("imagenes") or []:
            if isinstance(im, dict):
                out.append({**im, "_origen": "Diario"})
        for m in diario.get("materiales") or []:
            if not isinstance(m, dict):
                continue
            for im in m.get("adjuntos") or []:
                if isinstance(im, dict):
                    out.append({**im, "_origen": f"Material · {m.get('tipo_material') or 'remisión'}"})
        for u in diario.get("equipos_uso") or []:
            if not isinstance(u, dict):
                continue
            for im in u.get("preoperacionales") or []:
                if isinstance(im, dict):
                    out.append({**im, "_origen": f"Preop. · {u.get('equipo_nombre') or 'equipo'}"})
    for ev in eventos or []:
        if not isinstance(ev, dict):
            continue
        label = _label_evento(ev.get("evento_tipo"))
        for im in ev.get("imagenes") or []:
            if isinstance(im, dict):
                out.append({**im, "_origen": f"Evento · {label}"})
    return out


def _html_fotos(fotos: List[dict], contrato_id: int) -> str:
    if not fotos:
        return (
            _section_title("Fotografías del día")
            + f'<div style="font-size:7pt;color:{_MUTED};padding:6pt;">Sin fotografías registradas.</div>'
        )
    cells = []
    for im in fotos:
        uri = _resolve_img_uri(im, contrato_id)
        if not uri:
            continue
        w, h = _fit_pt(uri, _FOTO_BOX_W, _FOTO_BOX_H)
        caption = _esc(im.get("_origen") or im.get("nombre") or "Foto")
        cells.append(
            f'<td width="50%" style="padding:4pt;vertical-align:top;page-break-inside:avoid;">'
            f'<div style="width:{_FOTO_BOX_W}pt;height:{_FOTO_BOX_H}pt;border:0.3pt solid {_BORDE_SUAVE};'
            f'margin:0 auto;text-align:center;line-height:{_FOTO_BOX_H}pt;overflow:hidden;">'
            f'<img src="{uri}" style="width:{w}pt;height:{h}pt;border:0;vertical-align:middle;"/>'
            f'</div>'
            f'<div style="font-size:6pt;color:{_MUTED};text-align:center;margin-top:2pt;">{caption}</div>'
            f"</td>"
        )
    if not cells:
        return (
            _section_title("Fotografías del día")
            + f'<div style="font-size:7pt;color:{_MUTED};padding:6pt;">Sin fotografías disponibles.</div>'
        )
    # Pares en filas de 2 (horizontal)
    rows_html = []
    for i in range(0, len(cells), 2):
        pair = cells[i:i + 2]
        if len(pair) == 1:
            pair.append('<td width="50%"></td>')
        rows_html.append(f"<tr>{''.join(pair)}</tr>")
    return (
        _section_title("Fotografías del día (formato horizontal · verticales ajustadas sin deformar)")
        + f'<table width="100%" cellspacing="0" cellpadding="0">{"".join(rows_html)}</table>'
    )


def generar_pdf_bitacora_dia(sb, contrato_id: int, fecha: str) -> bytes:
    """Genera PDF landscape del día de bitácora para el contrato."""
    # Evitar import circular: label helper local si no existe en service
    contrato = contrato_meta_bitacora(sb, contrato_id)
    dia = list_entradas_del_dia(sb, contrato_id, fecha)
    diario = dia.get("diario")
    eventos = dia.get("eventos") or []
    fecha_iso = dia.get("fecha") or str(fecha)[:10]

    manual = None
    if diario and diario.get("clima_editado_manual"):
        manual = {
            "clima_editado_manual": True,
            "clima_codigo": diario.get("clima_codigo"),
            "clima_temp_c": diario.get("clima_temp_c"),
            "clima_descripcion": diario.get("clima_descripcion"),
            "hora_inicio_labores": diario.get("hora_inicio_labores"),
        }
    slots = consultar_clima_slots_3h(
        float(contrato["geo_lat"]),
        float(contrato["geo_lng"]),
        fecha_iso,
        manual=manual,
    )

    hdr = _encabezado(contrato, fecha_iso)
    hoja1 = (
        hdr
        + f'<div style="font-size:7pt;margin:2pt 0 4pt;color:{_COLOR};">'
        f"<b>Fecha del reporte:</b> {_esc(fecha_iso)}"
        + (
            f" · Hora inicio labores: {_esc(str(diario.get('hora_inicio_labores') or '')[:5])}"
            if diario else " · Sin Reporte Diario registrado"
        )
        + "</div>"
        + _html_clima(slots)
        + _html_personal_y_preop(diario)
        + _html_materiales(diario)
        + _html_observaciones(diario)
    )
    hoja2 = hdr + _html_eventos(eventos)
    hoja3 = hdr + _html_fotos(_collect_fotos(diario, eventos), int(contrato_id))

    doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Bitácora {_esc(fecha_iso)}</title>
<style>
  @page {{ size: letter landscape; margin: 8mm 8mm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; color: {_COLOR}; font-size: 8pt; }}
  .break {{ page-break-before: always; }}
</style>
</head><body>
{hoja1}
<div class="break"></div>
{hoja2}
<div class="break"></div>
{hoja3}
</body></html>"""
    return to_pdf_bytes(doc, landscape=True)
