"""
PDF Bitácora de Obra — landscape compacto con paleta del contrato.
Hoja Diario: encabezado + panel 3 cols + materiales/obs | fotos 2×2.
Hoja Eventos (solo si hay): cada evento con fotos inmediatamente después.
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

# Compactación: ~40% menos altura de logos vs. 36pt previos.
_LOGO_H = 22
_LOGO_W = 72.0
_FOTO_BOX_W = 118.0
_FOTO_BOX_H = 78.0
_FOTO_MAX_DIARIO = 4

_EVENTO_LABELS = {
    "visita_terceros": "Visita de terceros",
    "incidente_sst": "Incidente de seguridad SST",
    "reporte_actividades": "Reporte de actividades",
    "novedades": "Novedades",
}

_DEFAULT_PALETTE = {
    "encabezado": {"bg": "#DDEFF8", "text": "#0F2942"},
    "titulo_1": {"bg": "#EEF7FB", "text": "#0F2942"},
    "titulo_2": {"bg": "#E5F4FA", "text": "#1F4E70"},
    "linea_principal": {"bg": "#FFFFFF", "text": "#0F2942"},
    "linea_secundaria": {"bg": "#F8FAFC", "text": "#0F2942"},
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


def _palette(contrato: dict) -> dict:
    raw = contrato.get("export_palette") if isinstance(contrato, dict) else None
    if not isinstance(raw, dict):
        return {k: dict(v) for k, v in _DEFAULT_PALETTE.items()}
    out = {}
    for key, def_t in _DEFAULT_PALETTE.items():
        block = raw.get(key)
        if isinstance(block, dict):
            out[key] = {
                "bg": str(block.get("bg") or def_t["bg"]),
                "text": str(block.get("text") or def_t["text"]),
            }
        else:
            out[key] = dict(def_t)
    return out


def _logo_uri(url: Optional[str]) -> str:
    if not url or not str(url).strip():
        return ""
    try:
        return firma_url_a_data_uri(str(url).strip()) or ""
    except Exception:
        return ""


def _fit_pt(uri: str, max_w: float, max_h: float) -> Tuple[float, float]:
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


def _logo_cell(url: Optional[str], placeholder: str, pal: dict) -> str:
    uri = _logo_uri(url)
    muted = pal["titulo_2"]["text"]
    if uri:
        w, h = _fit_pt(uri, _LOGO_W, float(_LOGO_H))
        return (
            f'<div style="text-align:center;line-height:0;">'
            f'<img src="{uri}" style="width:{w}pt;height:{h}pt;border:0;"/>'
            f"</div>"
        )
    return (
        f'<div style="border:0.3pt dashed {muted};min-height:{_LOGO_H}pt;'
        f'text-align:center;padding:1pt;font-size:4.5pt;color:{muted};">{_esc(placeholder)}</div>'
    )


def _resolve_img_uri(im: dict, contrato_id: int) -> str:
    if not isinstance(im, dict):
        return ""
    uri = str(im.get("data_uri") or "").strip()
    if uri.startswith("data:image"):
        try:
            return firma_url_a_data_uri(uri) or uri
        except Exception:
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
        from almacen_firma_pdf import _data_uri_from_bytes
        return _data_uri_from_bytes(data, mime or "image/png")
    except Exception:
        return ""


def _section_title(text: str, pal: dict) -> str:
    t2 = pal["titulo_2"]
    return (
        f'<div style="background:{t2["bg"]};color:{t2["text"]};font-size:7pt;font-weight:bold;'
        f'padding:2pt 5pt;margin:3pt 0 2pt;">{_esc(text)}</div>'
    )


def _mini_table(
    headers: List[str],
    rows: List[List[str]],
    pal: dict,
    col_widths: Optional[List[str]] = None,
    compact: bool = False,
) -> str:
    t2 = pal["titulo_2"]
    lp = pal["linea_principal"]
    ls = pal["linea_secundaria"]
    pad = "1pt 2pt" if compact else "1.5pt 2.5pt"
    fs = "5.5pt" if compact else "6pt"
    ths = []
    for i, h in enumerate(headers):
        w = f' width="{col_widths[i]}"' if col_widths and i < len(col_widths) else ""
        ths.append(
            f'<th{w} style="background:{t2["bg"]};color:{t2["text"]};font-size:{fs};padding:{pad};'
            f'border:0.25pt solid {t2["text"]};text-align:left;">{_esc(h)}</th>'
        )
    body = []
    for ri, r in enumerate(rows):
        tier = ls if ri % 2 else lp
        tds = []
        for i, cell in enumerate(r):
            w = f' width="{col_widths[i]}"' if col_widths and i < len(col_widths) else ""
            tds.append(
                f'<td{w} style="font-size:{fs};padding:{pad};border:0.2pt solid {t2["bg"]};'
                f'color:{tier["text"]};background:{tier["bg"]};vertical-align:top;">{cell}</td>'
            )
        body.append(f"<tr>{''.join(tds)}</tr>")
    if not body:
        body.append(
            f'<tr><td colspan="{len(headers)}" style="font-size:{fs};padding:3pt;color:{t2["text"]};'
            f'border:0.2pt solid {t2["bg"]};">Sin registros</td></tr>'
        )
    return (
        f'<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">'
        f'<thead><tr>{"".join(ths)}</tr></thead><tbody>{"".join(body)}</tbody></table>'
    )


def _encabezado(contrato: dict, fecha: Optional[str], pal: dict, *, mostrar_fecha: bool = True) -> str:
    """Encabezado institucional compacto (~40% menos altura)."""
    enc = pal["encabezado"]
    t1 = pal["titulo_1"]
    entidad = contrato.get("entidad_otra") or contrato.get("entidad") or "Entidad"
    titulo = "Bitácora de Obra"
    if mostrar_fecha and fecha:
        titulo = f"Bitácora de Obra · {_esc(fecha)}"
    return f"""
<table width="100%" cellspacing="0" cellpadding="0"
  style="border-collapse:collapse;border:0.6pt solid {enc['text']};margin:0 0 3pt;background:{enc['bg']};">
  <tr>
    <td width="16%" style="padding:2pt;border-right:0.3pt solid {t1['bg']};vertical-align:middle;">
      {_logo_cell(contrato.get("logo_contratista"), "Contratista", pal)}
    </td>
    <td width="16%" style="padding:2pt;border-right:0.3pt solid {t1['bg']};vertical-align:middle;">
      {_logo_cell(contrato.get("logo_interventoria"), "Interventoría", pal)}
    </td>
    <td width="52%" style="padding:2pt 5pt;vertical-align:middle;background:{t1['bg']};">
      <div style="font-size:8pt;font-weight:bold;color:{enc['text']};line-height:1.15;">{titulo}</div>
      <div style="font-size:5.5pt;color:{t1['text']};margin-top:1pt;line-height:1.2;">
        Contrato {_esc(contrato.get("numero"))}
        {(" · " + _esc(contrato.get("numero_interventoria"))) if contrato.get("numero_interventoria") else ""}
      </div>
      <div style="font-size:5pt;color:{t1['text']};margin-top:0.5pt;line-height:1.15;">
        {_esc(contrato.get("contratista") or "—")} · {_esc(contrato.get("interventoria") or "—")} · {_esc(entidad)}
      </div>
    </td>
    <td width="16%" style="padding:2pt;border-left:0.3pt solid {t1['bg']};vertical-align:middle;">
      {_logo_cell(contrato.get("logo_entidad"), "Entidad", pal)}
    </td>
  </tr>
</table>
"""


def _html_panel_superior(diario: Optional[dict], slots: List[dict], pal: dict) -> str:
    """Clima | Personal | Maquinaria en 3 columnas; filas ~30% más compactas."""
    clima_rows = []
    for s in slots:
        marca = " ★" if s.get("manual") else ""
        temp = s.get("clima_temp_c")
        temp_s = f"{temp:.0f}°" if isinstance(temp, (int, float)) else "—"
        clima_rows.append([
            _esc(s.get("hora")),
            _esc((s.get("clima_descripcion") or "—") + marca),
            _esc(temp_s),
        ])
    personal = (diario or {}).get("personal") or []
    pers_rows = [
        [_esc(p.get("cargo")), _esc(p.get("cantidad"))]
        for p in personal if isinstance(p, dict) and (p.get("cantidad") or 0)
    ]
    usos = (diario or {}).get("equipos_uso") or []
    uso_rows = []
    for u in usos:
        if not isinstance(u, dict):
            continue
        n_pre = len(u.get("preoperacionales") or []) if isinstance(u.get("preoperacionales"), list) else 0
        uso_rows.append([
            _esc(u.get("equipo_nombre")),
            _esc(u.get("operador") or "—"),
            _esc(f"{n_pre}" if n_pre else "—"),
        ])
    left = _section_title("Clima", pal) + _mini_table(
        ["Hora", "Condición", "T"], clima_rows, pal, ["22%", "58%", "20%"], compact=True,
    )
    mid = _section_title("Personal", pal) + _mini_table(
        ["Cargo", "Cant."], pers_rows, pal, ["75%", "25%"], compact=True,
    )
    right = _section_title("Maquinaria", pal) + _mini_table(
        ["Equipo", "Operador", "Pre."], uso_rows, pal, ["48%", "36%", "16%"], compact=True,
    )
    t1 = pal["titulo_1"]
    hora = ""
    if diario and diario.get("hora_inicio_labores"):
        hora = f" · Inicio {_esc(str(diario.get('hora_inicio_labores') or '')[:5])}"
    return f"""
<div style="font-size:6pt;color:{t1['text']};margin:0 0 2pt;">
  <b>Reporte Diario</b>{hora}
</div>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:0.4pt solid {t1['bg']};">
  <tr>
    <td width="34%" style="vertical-align:top;padding:2pt;border-right:0.3pt solid {t1['bg']};">{left}</td>
    <td width="28%" style="vertical-align:top;padding:2pt;border-right:0.3pt solid {t1['bg']};">{mid}</td>
    <td width="38%" style="vertical-align:top;padding:2pt;">{right}</td>
  </tr>
</table>
"""


def _ubicacion_material(m: dict) -> str:
    """Ubicación de material: PK + tramo/costado/infra; lat/lng solo como respaldo."""
    pk = str(m.get("ubicacion_pk") or m.get("pk_label") or m.get("pk") or "").strip()
    if pk:
        partes = [f"PK {pk}" if not pk.upper().startswith("PK ") else pk]
        tramo = str(m.get("ubicacion_tramo") or "").strip()
        costado = str(m.get("ubicacion_costado") or "").strip()
        infra = str(m.get("ubicacion_infraestructura") or "").strip()
        if tramo:
            partes.append(tramo)
        if costado:
            partes.append(costado)
        if infra:
            partes.append(infra)
        return " · ".join(partes)
    lat, lng = m.get("ubicacion_lat"), m.get("ubicacion_lng")
    if lat is not None and lng is not None:
        return f"{lat}, {lng}"
    return "—"


def _html_materiales(diario: Optional[dict], pal: dict) -> str:
    mats = (diario or {}).get("materiales") or []
    rows = []
    for m in mats:
        if not isinstance(m, dict):
            continue
        n_adj = len(m.get("adjuntos") or []) if isinstance(m.get("adjuntos"), list) else 0
        rows.append([
            _esc((m.get("movimiento") or "").capitalize()),
            _esc(m.get("tipo_material")),
            _esc(m.get("proveedor") or "—"),
            _esc(m.get("cantidad")),
            _esc(m.get("numeros_vale") or "—"),
            _esc(_ubicacion_material(m)),
            _esc(str(n_adj) if n_adj else "—"),
        ])
    return _section_title("Materiales", pal) + _mini_table(
        ["Mov.", "Tipo", "Proveedor", "Cant.", "Vale(s)", "PK", "Adj."],
        rows,
        pal,
        ["8%", "20%", "16%", "8%", "18%", "18%", "7%"],
        compact=True,
    )


def _html_observaciones(diario: Optional[dict], pal: dict) -> str:
    txt = _plain_from_html((diario or {}).get("cuerpo_html"))
    elaborador = (diario or {}).get("created_by_nombre") or "—"
    lp = pal["linea_principal"]
    t2 = pal["titulo_2"]
    return (
        _section_title("Observaciones", pal)
        + f'<div style="font-size:6pt;color:{lp["text"]};white-space:pre-wrap;border:0.25pt solid {t2["bg"]};'
        f'padding:3pt 4pt;min-height:28pt;background:{lp["bg"]};">{_esc(txt or "—")}</div>'
        + f'<div style="font-size:5pt;color:{t2["text"]};margin-top:1pt;">Elaborado por: {_esc(elaborador)}</div>'
    )


def _foto_cell(im: dict, contrato_id: int, pie: str, pal: dict) -> str:
    uri = _resolve_img_uri(im, contrato_id)
    t2 = pal["titulo_2"]
    if not uri:
        return (
            f'<td width="50%" style="padding:2pt;vertical-align:top;">'
            f'<div style="width:{_FOTO_BOX_W}pt;height:{_FOTO_BOX_H}pt;border:0.25pt dashed {t2["bg"]};'
            f'margin:0 auto;"></div>'
            f'<div style="font-size:5pt;color:{t2["text"]};text-align:center;margin-top:1pt;">{_esc(pie)}</div>'
            f"</td>"
        )
    w, h = _fit_pt(uri, _FOTO_BOX_W, _FOTO_BOX_H)
    return (
        f'<td width="50%" style="padding:2pt;vertical-align:top;page-break-inside:avoid;">'
        f'<div style="width:{_FOTO_BOX_W}pt;height:{_FOTO_BOX_H}pt;border:0.25pt solid {t2["bg"]};'
        f'margin:0 auto;text-align:center;line-height:{_FOTO_BOX_H}pt;overflow:hidden;">'
        f'<img src="{uri}" style="width:{w}pt;height:{h}pt;border:0;vertical-align:middle;"/>'
        f"</div>"
        f'<div style="font-size:5pt;color:{t2["text"]};text-align:center;margin-top:1pt;">{_esc(pie)}</div>'
        f"</td>"
    )


def _html_registro_fotografico(fotos: List[dict], contrato_id: int, pal: dict, max_n: int = _FOTO_MAX_DIARIO) -> str:
    seleccion = [f for f in (fotos or []) if isinstance(f, dict)][:max_n]
    title = _section_title("Registro Fotográfico", pal)
    if not seleccion:
        t2 = pal["titulo_2"]
        return title + f'<div style="font-size:6pt;color:{t2["text"]};padding:4pt;">Sin fotografías.</div>'
    cells = [_foto_cell(im, contrato_id, im.get("_pie") or "Reporte Diario", pal) for im in seleccion]
    while len(cells) < 4 and len(seleccion) > 0:
        # completar grilla 2×2 solo con huecos vacíos si hay <4
        break
    rows_html = []
    for i in range(0, max(len(cells), 1), 2):
        pair = cells[i:i + 2]
        if len(pair) == 1:
            pair.append('<td width="50%"></td>')
        rows_html.append(f"<tr>{''.join(pair)}</tr>")
    return title + f'<table width="100%" cellspacing="0" cellpadding="0">{"".join(rows_html)}</table>'


def _fotos_diario(diario: Optional[dict]) -> List[dict]:
    out: List[dict] = []
    if not diario:
        return out
    for im in diario.get("imagenes") or []:
        if isinstance(im, dict):
            out.append({**im, "_pie": "Reporte Diario"})
    for m in diario.get("materiales") or []:
        if not isinstance(m, dict):
            continue
        for im in m.get("adjuntos") or []:
            if isinstance(im, dict):
                out.append({**im, "_pie": "Reporte Diario"})
    for u in diario.get("equipos_uso") or []:
        if not isinstance(u, dict):
            continue
        for im in u.get("preoperacionales") or []:
            if isinstance(im, dict):
                out.append({**im, "_pie": "Reporte Diario"})
    return out


def _html_mitad_diario(diario: Optional[dict], contrato_id: int, pal: dict) -> str:
    left = _html_materiales(diario, pal) + _html_observaciones(diario, pal)
    right = _html_registro_fotografico(_fotos_diario(diario), contrato_id, pal)
    return f"""
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:3pt;">
  <tr>
    <td width="52%" style="vertical-align:top;padding-right:4pt;">{left}</td>
    <td width="48%" style="vertical-align:top;">{right}</td>
  </tr>
</table>
"""


def _html_eventos_con_fotos(eventos: List[dict], contrato_id: int, pal: dict) -> str:
    parts = [_section_title("Reportes de Evento", pal)]
    t2 = pal["titulo_2"]
    lp = pal["linea_principal"]
    for ev in eventos or []:
        if not isinstance(ev, dict):
            continue
        tipo = _label_evento(ev.get("evento_tipo"))
        desc = _plain_from_html(ev.get("cuerpo_html"))
        dest = ev.get("dirigido_a") or "—"
        elab = ev.get("created_by_nombre") or "—"
        parts.append(
            f'<div style="border:0.3pt solid {t2["bg"]};padding:3pt 4pt;margin:3pt 0;page-break-inside:avoid;">'
            f'<div style="font-size:7pt;font-weight:bold;color:{t2["text"]};">{_esc(tipo)}</div>'
            f'<div style="font-size:5.5pt;color:{lp["text"]};margin-top:1pt;">'
            f'{_esc(ev.get("fecha") or "")} · {_esc(elab)} · Dirigido a: {_esc(dest)}</div>'
            f'<div style="font-size:6pt;color:{lp["text"]};margin-top:2pt;white-space:pre-wrap;">'
            f'{_esc(desc or "—")}</div>'
            f"</div>"
        )
        imgs = [im for im in (ev.get("imagenes") or []) if isinstance(im, dict)]
        if imgs:
            cells = [
                _foto_cell(im, contrato_id, "Reporte de Evento", pal)
                for im in imgs[:4]
            ]
            rows_html = []
            for i in range(0, len(cells), 2):
                pair = cells[i:i + 2]
                if len(pair) == 1:
                    pair.append('<td width="50%"></td>')
                rows_html.append(f"<tr>{''.join(pair)}</tr>")
            parts.append(
                f'<div style="margin:0 0 4pt 8pt;">'
                f'{_section_title("Registro Fotográfico", pal)}'
                f'<table width="100%" cellspacing="0" cellpadding="0">{"".join(rows_html)}</table>'
                f"</div>"
            )
    return "".join(parts)


def generar_pdf_bitacora_dia(sb, contrato_id: int, fecha: str) -> bytes:
    """Genera PDF landscape del día de bitácora para el contrato."""
    contrato = contrato_meta_bitacora(sb, contrato_id)
    pal = _palette(contrato)
    dia = list_entradas_del_dia(sb, contrato_id, fecha)
    diario = dia.get("diario")
    eventos = [e for e in (dia.get("eventos") or []) if isinstance(e, dict)]
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

    hdr = _encabezado(contrato, fecha_iso, pal, mostrar_fecha=True)
    hoja1 = (
        hdr
        + _html_panel_superior(diario, slots, pal)
        + _html_mitad_diario(diario, int(contrato_id), pal)
    )

    body_parts = [hoja1]
    if eventos:
        hdr_ev = _encabezado(contrato, None, pal, mostrar_fecha=False)
        body_parts.append('<div class="break"></div>')
        body_parts.append(hdr_ev + _html_eventos_con_fotos(eventos, int(contrato_id), pal))

    text_color = pal["linea_principal"]["text"]
    doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Bitácora {_esc(fecha_iso)}</title>
<style>
  @page {{ size: letter landscape; margin: 7mm 7mm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; color: {text_color}; font-size: 7pt; }}
  .break {{ page-break-before: always; }}
</style>
</head><body>
{''.join(body_parts)}
</body></html>"""
    return to_pdf_bytes(doc, landscape=True)
