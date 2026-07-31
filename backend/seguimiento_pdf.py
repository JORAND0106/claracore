"""Generación PDF — actas de reunión y llamados de atención (Seguimiento)."""
from __future__ import annotations

import base64
import hashlib
import html
import re
from typing import Any, Dict, List, Optional, Tuple

from almacen_datetime import fmt_fecha_bogota, fmt_fecha_hora_bogota
from almacen_firma_pdf import firma_url_a_data_uri
from topografia_utils import _html_logo_pdf, to_pdf_bytes

_COLOR = "#0f172a"
_BORDE = "#334155"
_BORDE_SUAVE = "#94a3b8"
# Encabezados de tabla / sección: oscuro institucional (texto claro).
_BG_H = "#1e293b"
_FG_H = "#ffffff"
# Encabezado compacto (~50% menos altura que la versión previa).
_LOGO_MAX_H = 11  # pt — logo contratista / default
_LOGO_MAX_W_PCT = 88  # % del recuadro
# Entidad (acta externa): ~40% del tamaño del logo estándar, misma proporción.
_LOGO_ENTIDAD_MAX_H = max(4, int(round(_LOGO_MAX_H * 0.4)))  # 4 pt
_LOGO_ENTIDAD_MAX_W_PCT = max(20, int(round(_LOGO_MAX_W_PCT * 0.4)))  # 35%
# Ancho estimado del recuadro Entidad (30% del área útil letter portrait).
_LOGO_ENTIDAD_CELL_W_PT = 150.0
_LOGO_CONTRATISTA_CELL_W_PT = 90.0
_HDR_TITLE_FS = "7.5pt"
_HDR_META_FS = "6pt"
_HDR_PAD = "1pt 2pt"
_HDR_PAD_CELL = "2pt"

# Bump al cambiar plantilla/estilos del PDF (invalida pdf_blob_path cacheado).
PDF_ACTA_TEMPLATE_VERSION = "2026-07-31.2-logo-entidad-explicit"


def pdf_acta_cache_key(contenido_hash: str, *, template_version: str = PDF_ACTA_TEMPLATE_VERSION) -> str:
    """Clave de caché: versión de plantilla + hash de contenido del acta."""
    h = (contenido_hash or "").strip()
    return f"{template_version}:{h}"


def parse_pdf_acta_cache_key(raw: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Devuelve (template_version, contenido_hash) o (None, raw) si es legacy sin versión."""
    s = (raw or "").strip()
    if not s:
        return None, None
    if ":" in s:
        ver, rest = s.split(":", 1)
        if ver and rest:
            return ver, rest
    return None, s


def _esc(val) -> str:
    return html.escape(str(val or ""))


def _orden_del_dia_html(raw) -> str:
    """Renderiza checklist JSON o texto libre legacy."""
    import json

    items = None
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str) and raw.strip().startswith("["):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                items = parsed
        except Exception:
            items = None
    if items is not None:
        rows = []
        for it in items:
            if isinstance(it, dict):
                texto = it.get("texto") or it.get("titulo") or ""
                done = bool(it.get("hecho") or it.get("checked") or it.get("done"))
            else:
                texto = str(it)
                done = False
            mark = "☑" if done else "☐"
            rows.append(f"<div style='margin:2pt 0;'>{mark} {_esc(texto)}</div>")
        return "".join(rows) or "<div style='color:#94a3b8;'>—</div>"
    return f"<div style='white-space:pre-wrap;'>{_esc(raw or '—')}</div>"


def contenido_hash_acta(acta: dict, asistentes: list, ideas: list, apartados: list) -> str:
    """Hash canónico del contenido del acta (integridad previa a firma)."""
    parts = [
        str(acta.get("consecutivo") or ""),
        str(acta.get("fecha_reunion") or ""),
        str(acta.get("ubicacion") or ""),
        str(acta.get("orden_del_dia") or ""),
        str(acta.get("elaborador_nombre") or ""),
        str(acta.get("proxima_fecha") or ""),
        str(acta.get("proxima_hora") or ""),
        str(acta.get("proxima_lugar") or ""),
        str(acta.get("hora_inicio") or ""),
        str(acta.get("hora_fin") or ""),
    ]
    for a in asistentes or []:
        parts.append("|".join([
            str(a.get("nombre") or ""),
            str(a.get("cargo") or ""),
            str(a.get("entidad") or ""),
            str(a.get("email") or ""),
        ]))
    for i in ideas or []:
        parts.append("|".join([
            str(i.get("texto") or ""),
            str(i.get("quien_dijo") or i.get("interviniente") or ""),
            str(i.get("titulo") or ""),
            str(i.get("orden") if i.get("orden") is not None else ""),
        ]))
    for ap in apartados or []:
        parts.append("|".join([str(ap.get("titulo") or ""), str(ap.get("contenido") or "")]))
    raw = "\n".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _nl2br(text: str) -> str:
    """Convierte saltos de línea a <br/> (xhtml2pdf pagina mejor que white-space:pre-wrap)."""
    return _esc(text).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")


def _anio_contrato(numero: str, fecha_reunion=None) -> str:
    """Año del contrato: último 20xx del número, o año de la fecha de reunión."""
    years = re.findall(r"20\d{2}", str(numero or ""))
    if years:
        return years[-1]
    s = str(fecha_reunion or "")[:10]
    if len(s) >= 4 and s[:4].isdigit():
        return s[:4]
    try:
        from datetime import date as _date

        return str(_date.today().year)
    except Exception:
        return "—"


def _fecha_partes_dia_mes_anio(fecha_raw) -> tuple:
    """Desglosa fecha de reunión en (día, mes, año) para el encabezado oficial."""
    s = str(fecha_raw or "")[:10]
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return s[8:10], s[5:7], s[0:4]
    # Fallback vía formateo Bogotá
    fmt = fmt_fecha_bogota(fecha_raw)
    if fmt and fmt != "—" and "/" in fmt:
        parts = fmt.split("/")
        if len(parts) == 3:
            return parts[0], parts[1], parts[2]
    return "—", "—", "—"


def _numero_interventoria(contrato: dict) -> str:
    raw = (
        (contrato or {}).get("numero_interventoria")
        or (contrato or {}).get("numero_contrato_interventoria")
        or ""
    )
    return str(raw).strip() or "—"


def _titulo_seguimiento_contrato(contrato: dict, acta: dict) -> str:
    numero = str((contrato or {}).get("numero") or (contrato or {}).get("id") or "—").strip()
    anio = _anio_contrato(numero, acta.get("fecha_reunion"))
    return f"Seguimiento al Contrato de obra No. {numero} DE {anio}"


def _encabezado_oficial_html(
    contrato: dict,
    acta: dict,
    *,
    logo_contratista: str,
    logo_entidad: str,
) -> str:
    """Encabezado tipo formato oficial: logos según tipo + título + tabla lateral + objeto.

    Interna: solo identidad contratista (un logo).
    Externa: tres recuadros (contratista | título | entidad) + meta debajo.
    Dimensiones compactas (~50% de la altura previa) sin perder legibilidad.
    """
    titulo = _titulo_seguimiento_contrato(contrato, acta)
    tipo_raw = str(acta.get("tipo_acta") or "").lower()
    es_externa = tipo_raw == "externa"
    tipo_lbl = {"interna": "Interna", "externa": "Externa"}.get(tipo_raw, "")
    consec = acta.get("consecutivo") or "—"
    dia, mes, anio = _fecha_partes_dia_mes_anio(acta.get("fecha_reunion"))
    hora_ini = _esc((acta.get("hora_inicio") or "").strip() or "—")
    hora_fin = _esc((acta.get("hora_fin") or "").strip() or "—")
    cto_interv = _esc(_numero_interventoria(contrato))
    objeto = _esc((contrato or {}).get("objeto") or "—")
    tipo_line = (
        f'<div style="font-size:5.5pt;color:#475569;margin-top:1pt;line-height:1.1;">'
        f"Acta {_esc(tipo_lbl)}</div>"
        if tipo_lbl else ""
    )

    # Tabla lateral en 4 filas (Fecha y Hora en una sola fila cada una) → menos altura.
    th = (
        f"border:0.5pt solid {_BORDE};padding:{_HDR_PAD};font-weight:700;"
        f"background:{_BG_H};color:{_FG_H};vertical-align:middle;"
    )
    td = f"border:0.5pt solid {_BORDE};padding:{_HDR_PAD};text-align:center;vertical-align:middle;"
    meta = (
        f'<table width="100%" cellspacing="0" cellpadding="0" '
        f'style="border-collapse:collapse;font-size:{_HDR_META_FS};line-height:1.15;">'
        f'<tr>'
        f'<td style="{th}width:34%;">Acta No.</td>'
        f'<td colspan="3" style="{td}">{_esc(consec)}</td>'
        f'</tr>'
        f'<tr>'
        f'<td style="{th}">Fecha</td>'
        f'<td style="{td}"><span style="font-size:5pt;color:#64748b;">Día</span><br/>{_esc(dia)}</td>'
        f'<td style="{td}"><span style="font-size:5pt;color:#64748b;">Mes</span><br/>{_esc(mes)}</td>'
        f'<td style="{td}"><span style="font-size:5pt;color:#64748b;">Año</span><br/>{_esc(anio)}</td>'
        f'</tr>'
        f'<tr>'
        f'<td style="{th}">Hora</td>'
        f'<td colspan="2" style="{td}"><span style="font-size:5pt;color:#64748b;">Inicio</span><br/>{hora_ini}</td>'
        f'<td style="{td}"><span style="font-size:5pt;color:#64748b;">Fin</span><br/>{hora_fin}</td>'
        f'</tr>'
        f'<tr>'
        f'<td style="{th}">Cto. Interventoría</td>'
        f'<td colspan="3" style="{td}font-size:5.5pt;">{cto_interv}</td>'
        f'</tr>'
        f'</table>'
    )

    titulo_html = (
        f'<div style="font-size:{_HDR_TITLE_FS};font-weight:700;text-align:center;'
        f'line-height:1.15;">{_esc(titulo)}</div>{tipo_line}'
    )

    if es_externa:
        # Tres recuadros compactos: contratista | título | entidad.
        header = (
            f'<table width="100%" cellspacing="0" cellpadding="0" '
            f'style="border-collapse:collapse;border:0.8pt solid {_BORDE};">'
            f'<tr>'
            f'<td style="width:18%;border-right:0.8pt solid {_BORDE};padding:{_HDR_PAD_CELL};'
            f'vertical-align:middle;text-align:center;">'
            f'<div style="font-size:5pt;color:#64748b;margin-bottom:1pt;line-height:1;">Contratista</div>'
            f'{logo_contratista}</td>'
            f'<td style="width:52%;border-right:0.8pt solid {_BORDE};padding:2pt 4pt;'
            f'vertical-align:middle;">{titulo_html}</td>'
            f'<td style="width:30%;padding:{_HDR_PAD_CELL};vertical-align:middle;text-align:center;">'
            f'<div style="font-size:5pt;color:#64748b;margin-bottom:1pt;line-height:1;">Entidad</div>'
            f'{logo_entidad}</td>'
            f'</tr>'
            f'</table>'
            f'<div style="height:1pt;"></div>'
            f'{meta}'
        )
    else:
        # Interna: unificada bajo identidad del contratista (sin bloque entidad).
        header = (
            f'<table width="100%" cellspacing="0" cellpadding="0" '
            f'style="border-collapse:collapse;border:0.8pt solid {_BORDE};">'
            f'<tr>'
            f'<td style="width:16%;border-right:0.8pt solid {_BORDE};padding:{_HDR_PAD_CELL};'
            f'vertical-align:middle;text-align:center;">{logo_contratista}</td>'
            f'<td style="width:46%;border-right:0.8pt solid {_BORDE};padding:2pt 4pt;'
            f'vertical-align:middle;">{titulo_html}</td>'
            f'<td style="width:38%;padding:1pt 2pt;vertical-align:middle;">{meta}</td>'
            f'</tr>'
            f'</table>'
        )

    objeto_row = (
        f'<table width="100%" cellspacing="0" cellpadding="0" '
        f'style="border-collapse:collapse;border:0.8pt solid {_BORDE};'
        f'{"border-top:none;" if not es_externa else "margin-top:1pt;"}margin:0;">'
        f'<tr>'
        f'<td style="padding:2pt 4pt;font-size:7pt;line-height:1.2;">'
        f'<b>Objeto del contrato:</b> {objeto}</td>'
        f'</tr>'
        f'</table>'
    )
    return header + objeto_row


def _data_uri_pixel_size(uri: str) -> Tuple[Optional[int], Optional[int]]:
    """Lee ancho/alto en px de un data-URI PNG/JPEG (sin dependencia externa)."""
    try:
        if not uri or not uri.startswith("data:image"):
            return None, None
        header, b64 = uri.split(",", 1)
        raw = base64.b64decode(b64, validate=False)
        hdr = header.lower()
        if "png" in hdr and len(raw) >= 24 and raw[:8] == b"\x89PNG\r\n\x1a\n":
            w = int.from_bytes(raw[16:20], "big")
            h = int.from_bytes(raw[20:24], "big")
            return w, h
        if ("jpeg" in hdr or "jpg" in hdr) and raw[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(raw):
                if raw[i] != 0xFF:
                    break
                marker = raw[i + 1]
                if marker == 0xD9:
                    break
                if marker in (0xC0, 0xC1, 0xC2, 0xC3):
                    h = int.from_bytes(raw[i + 5 : i + 7], "big")
                    w = int.from_bytes(raw[i + 7 : i + 9], "big")
                    return w, h
                if marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0x01) or marker == 0xDA:
                    break
                seglen = int.from_bytes(raw[i + 2 : i + 4], "big")
                i += 2 + seglen
        return None, None
    except Exception:
        return None, None


def _fit_logo_pt(
    uri: str,
    *,
    max_h_pt: float,
    max_w_pt: float,
) -> Tuple[float, float]:
    """Dimensiones en pt que caben en el recuadro, conservando proporción.

    xhtml2pdf ignora max-height/max-width en <img>; hay que fijar width/height explícitos.
    """
    max_h_pt = max(1.0, float(max_h_pt))
    max_w_pt = max(1.0, float(max_w_pt))
    px_w, px_h = _data_uri_pixel_size(uri)
    if not px_w or not px_h:
        # Sin metadatos: forzar altura (xhtml2pdf respeta height en pt).
        return round(max_w_pt * 0.5, 2), round(max_h_pt, 2)
    # Asumir 96 dpi → pt = px * 72/96
    nat_w = px_w * 72.0 / 96.0
    nat_h = px_h * 72.0 / 96.0
    scale = min(max_h_pt / nat_h, max_w_pt / nat_w, 1.0)
    return round(nat_w * scale, 2), round(nat_h * scale, 2)


def _logo_cell(
    url: Optional[str],
    placeholder: str,
    *,
    max_h: int = None,
    max_w_pct: int = None,
    cell_width_pt: float = None,
) -> str:
    """Logo embebido (data-URI) o placeholder con borde.

    Usa width/height explícitos en pt (xhtml2pdf no respeta max-height/max-width).
    """
    if max_h is None:
        max_h = _LOGO_MAX_H
    if max_w_pct is None:
        max_w_pct = _LOGO_MAX_W_PCT
    if cell_width_pt is None:
        cell_width_pt = _LOGO_CONTRATISTA_CELL_W_PT
    max_w_pt = max(4.0, float(cell_width_pt) * (float(max_w_pct) / 100.0))
    uri = ""
    if url and str(url).strip():
        try:
            uri = firma_url_a_data_uri(str(url).strip()) or ""
        except Exception:
            uri = ""
    if uri:
        w_pt, h_pt = _fit_logo_pt(uri, max_h_pt=float(max_h), max_w_pt=max_w_pt)
        return (
            f'<div style="text-align:center;padding:0;line-height:0;">'
            f'<img src="{uri}" width="{w_pt}" height="{h_pt}" '
            f'style="width:{w_pt}pt;height:{h_pt}pt;border:0;"/>'
            f"</div>"
        )
    # Placeholder acotado al tope del logo (no inflar el encabezado).
    return (
        f'<div style="border:0.4pt dashed {_BORDE_SUAVE};min-height:{max_h}pt;'
        f'text-align:center;padding:1pt;font-size:5pt;color:#94a3b8;line-height:1.1;">'
        f"{_esc(placeholder)}</div>"
    )


def _box_row(cells_html: str) -> str:
    return (
        f'<table class="sec-outer" width="100%" cellspacing="0" cellpadding="0" '
        f'style="border-collapse:collapse;margin:0 0 0;border:1pt solid {_BORDE};">'
        f"<tr>{cells_html}</tr></table>"
    )


def _section(title: str, body: str, *, bordered: bool = True) -> str:
    """Sección con encabezado oscuro. bordered=False suaviza el marco (acta interna)."""
    border = f"border:1pt solid {_BORDE};" if bordered else f"border-bottom:0.6pt solid {_BORDE_SUAVE};"
    return (
        f'<div class="sec" style="{border}margin:6pt 0 0;page-break-inside:auto;">'
        f'<div style="background:{_BG_H};border-bottom:1pt solid {_BORDE};'
        f'padding:4pt 6pt;font-size:9pt;font-weight:700;color:{_FG_H};">{_esc(title)}</div>'
        f'<div style="padding:6pt;font-size:9pt;">{body}</div>'
        f"</div>"
    )


def _cell(content: str, *, width: str = "", border_right: bool = True, align: str = "left",
          pad: str = "5pt 6pt", bg: str = "", valign: str = "middle", bold: bool = False) -> str:
    br = f"border-right:1pt solid {_BORDE};" if border_right else ""
    w = f"width:{width};" if width else ""
    bgs = f"background:{bg};" if bg else ""
    fw = "font-weight:700;" if bold else ""
    return (
        f'<td style="{w}{br}{bgs}padding:{pad};vertical-align:{valign};'
        f'text-align:{align};font-size:9pt;{fw}">{content}</td>'
    )


def _titulo_tema_fallback(texto: str) -> str:
    """Título corto local si la idea aún no tiene titulo Clara."""
    t = " ".join((texto or "").strip().split())
    if not t:
        return ""
    for sep in (".", ";", ":", "\n"):
        if sep in t[:110]:
            cand = t.split(sep, 1)[0].strip()
            if len(cand) >= 8:
                t = cand
                break
    if len(t) > 72:
        t = t[:72].rsplit(" ", 1)[0].strip() + "…"
    return t


def generar_pdf_acta(
    contrato: dict,
    acta: dict,
    asistentes: List[dict],
    ideas: List[dict],
    apartados: List[dict],
    firmas: Optional[List[dict]] = None,
    compromisos: Optional[List[dict]] = None,
    compromisos_previos: Optional[List[dict]] = None,
) -> bytes:
    firmas = firmas or []
    compromisos = compromisos or []
    compromisos_previos = compromisos_previos or []
    firma_by_asistente = {int(f["asistente_id"]): f for f in firmas if f.get("asistente_id") is not None}

    tipo_raw = str((acta or {}).get("tipo_acta") or "").lower()
    es_externa = tipo_raw == "externa"
    logo_contratista = _logo_cell(
        (contrato or {}).get("logo_contratista"),
        "Logo contratista",
        cell_width_pt=_LOGO_CONTRATISTA_CELL_W_PT,
    )
    logo_entidad = (
        _logo_cell(
            (contrato or {}).get("logo_entidad"),
            "Logo entidad",
            max_h=_LOGO_ENTIDAD_MAX_H,
            max_w_pct=_LOGO_ENTIDAD_MAX_W_PCT,
            cell_width_pt=_LOGO_ENTIDAD_CELL_W_PT,
        )
        if es_externa
        else ""
    )
    header_block = _encabezado_oficial_html(
        contrato or {},
        acta or {},
        logo_contratista=logo_contratista,
        logo_entidad=logo_entidad,
    )
    sec_border = es_externa  # Externa: secciones delimitadas; Interna: flujo unificado.

    asis_rows = "".join(
        f"<tr>"
        f"<td style='padding:4pt 5pt;border:0.5pt solid {_BORDE};width:28%;'>{_esc(a.get('nombre'))}</td>"
        f"<td style='padding:4pt 5pt;border:0.5pt solid {_BORDE};width:22%;'>{_esc(a.get('cargo'))}</td>"
        f"<td style='padding:4pt 5pt;border:0.5pt solid {_BORDE};width:22%;'>{_esc(a.get('entidad'))}</td>"
        f"<td style='padding:4pt 5pt;border:0.5pt solid {_BORDE};width:28%;'>{_esc(a.get('email'))}</td>"
        f"</tr>"
        for a in (asistentes or [])
    ) or (
        f"<tr><td colspan='4' style='padding:6pt;border:0.5pt solid {_BORDE};color:#94a3b8;'>"
        "Sin asistentes registrados</td></tr>"
    )
    asis_table = (
        f"<table width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;font-size:8.5pt;'>"
        f"<tr style='background:{_BG_H};'>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Nombre</th>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Cargo</th>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Empresa</th>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Correo</th>"
        f"</tr>{asis_rows}</table>"
    )

    ideas_sorted = sorted(
        list(ideas or []),
        key=lambda x: (
            int(x.get("orden") if x.get("orden") is not None else 10**9),
            int(x.get("id") or 0),
        ),
    )
    ideas_html = ""
    for idx, idea in enumerate(ideas_sorted, start=1):
        num = int(idea.get("orden") if idea.get("orden") is not None else idx - 1) + 1
        titulo_tema = (idea.get("titulo") or "").strip()
        if not titulo_tema:
            titulo_tema = _titulo_tema_fallback(idea.get("texto") or "") or f"Tema {num}"
        quien = (idea.get("quien_dijo") or idea.get("interviniente") or "").strip()
        quien_line = (
            f"<div style='font-size:8pt;color:#475569;margin:1pt 0 3pt;'>"
            f"Interviniente: {_esc(quien)}</div>"
            if quien else ""
        )
        ideas_html += (
            f"<div class='pdf-idea' style='margin:0 0 8pt;padding-bottom:6pt;"
            f"border-bottom:0.4pt solid {_BORDE_SUAVE};'>"
            f"<div style='font-size:9pt;font-weight:700;'>Tema {num}: {_esc(titulo_tema)}</div>"
            f"{quien_line}"
            f"<div style='font-size:9pt;'>{_nl2br(idea.get('texto') or '')}</div>"
            f"</div>"
        )
    if not ideas_html:
        ideas_html = "<div style='color:#94a3b8;font-size:9pt;'>Sin temas registrados.</div>"

    def _comp_table(rows_src: list, empty_msg: str) -> str:
        if not rows_src:
            return f"<div style='color:#94a3b8;font-size:9pt;'>{_esc(empty_msg)}</div>"
        rows = "".join(
            f"<tr>"
            f"<td style='padding:3pt 4pt;border:0.5pt solid {_BORDE};'>{_esc(c.get('titulo'))}</td>"
            f"<td style='padding:3pt 4pt;border:0.5pt solid {_BORDE};'>{_esc(c.get('asignado_a_nombre'))}</td>"
            f"<td style='padding:3pt 4pt;border:0.5pt solid {_BORDE};'>"
            f"{fmt_fecha_bogota(c.get('fecha_vencimiento'))}</td>"
            f"<td style='padding:3pt 4pt;border:0.5pt solid {_BORDE};'>{_esc(c.get('estado_gestion') or '')}</td>"
            f"</tr>"
            for c in rows_src
        )
        return (
            f"<table width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;font-size:8pt;'>"
            f"<tr style='background:{_BG_H};'>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Compromiso</th>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Asignado</th>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Vence</th>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;color:{_FG_H};'>Estado</th>"
            f"</tr>{rows}</table>"
        )

    apartados_html = ""
    for ap in apartados or []:
        tit = ap.get("titulo") or "Apartado"
        apartados_html += (
            f"<div style='margin:0 0 8pt;'>"
            f"<div style='font-size:9pt;font-weight:700;'>{_esc(tit)}</div>"
            f"<div style='font-size:9pt;'>{_nl2br(ap.get('contenido') or '')}</div>"
            f"</div>"
        )
    if not apartados_html:
        apartados_html = "<div style='color:#94a3b8;font-size:9pt;'>Sin apartados adicionales.</div>"

    # Firmas en 2 columnas: Nombre | Cargo | Empresa | Email | Firma
    firma_blocks = []
    for a in asistentes or []:
        fr = None
        try:
            fr = firma_by_asistente.get(int(a["id"])) if a.get("id") is not None else None
        except Exception:
            fr = None
        uri = ""
        if fr and fr.get("firma_imagen_url"):
            try:
                uri = firma_url_a_data_uri(fr.get("firma_imagen_url")) or ""
            except Exception:
                uri = ""
        if uri:
            firma_img = (
                f'<div style="height:36pt;text-align:center;margin-top:4pt;">'
                f'<img src="{uri}" style="max-height:36pt;max-width:95%;"/></div>'
            )
        else:
            firma_img = (
                '<div style="height:36pt;border-bottom:0.6pt solid #64748b;margin:8pt 4pt 0;"></div>'
            )
        meta = " | ".join([
            _esc(a.get("nombre") or "—"),
            _esc(a.get("cargo") or "—"),
            _esc(a.get("entidad") or "—"),
            _esc(a.get("email") or "—"),
            "Firma",
        ])
        firma_blocks.append(
            f'<div class="pdf-firma" style="margin:0 0 22pt;padding:4pt 6pt;">'
            f'<div style="font-size:8pt;line-height:1.35;">{meta}</div>'
            f"{firma_img}</div>"
        )

    firmas_left = ""
    firmas_right = ""
    for i, block in enumerate(firma_blocks):
        if i % 2 == 0:
            firmas_left += block
        else:
            firmas_right += block
    if not firma_blocks:
        firmas_left = "<div style='color:#94a3b8;font-size:9pt;'>Sin firmantes.</div>"

    firmas_html = (
        f"<table width='100%' cellspacing='0' cellpadding='0'>"
        f"<tr>"
        f"<td style='width:50%;vertical-align:top;padding-right:8pt;'>{firmas_left}</td>"
        f"<td style='width:50%;vertical-align:top;padding-left:8pt;'>{firmas_right}</td>"
        f"</tr></table>"
    )

    prox_parts = []
    if acta.get("proxima_fecha"):
        prox_parts.append(f"<b>Fecha:</b> {fmt_fecha_bogota(acta.get('proxima_fecha'))}")
    if acta.get("proxima_hora"):
        prox_parts.append(f"<b>Hora:</b> {_esc(acta.get('proxima_hora'))}")
    if acta.get("proxima_lugar"):
        prox_parts.append(f"<b>Lugar:</b> {_esc(acta.get('proxima_lugar'))}")
    proxima_html = (
        " &nbsp;·&nbsp; ".join(prox_parts)
        if prox_parts
        else "<span style='color:#94a3b8;'>Sin información reservada para la próxima reunión.</span>"
    )

    n_ideas = len(ideas_sorted)
    doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
@page {{ size: letter portrait; margin: 12mm 10mm; }}
body {{ font-family: Helvetica, Arial, sans-serif; color: {_COLOR}; font-size: 9pt; }}
.pdf-idea {{ page-break-inside: auto; }}
.pdf-firma {{ page-break-inside: avoid; }}
.sec {{ page-break-inside: auto; }}
</style></head><body>
{header_block}

{_section("Asistentes", asis_table, bordered=sec_border)}
{_section("TEMAS A TRATAR EN PRESENTE ACTA", _orden_del_dia_html(acta.get("orden_del_dia")), bordered=sec_border)}
{_section(
    "Compromisos abiertos de actas anteriores",
    _comp_table(compromisos_previos, "No hay compromisos abiertos de actas anteriores."),
    bordered=sec_border,
)}
{_section(f"TEMAS TRATADOS EN PRESENTE ACTA ({n_ideas})", ideas_html, bordered=sec_border)}
{_section(
    "Compromisos generados",
    _comp_table(compromisos, "Sin compromisos generados en esta acta."),
    bordered=sec_border,
)}
{_section("Apartados o temas adicionales", apartados_html, bordered=sec_border)}
{_section("Firmas", firmas_html, bordered=sec_border)}
{_section("Próxima reunión (reserva)", proxima_html, bordered=sec_border)}
</body></html>"""
    return to_pdf_bytes(doc, landscape=False)


def generar_pdf_llamado_atencion(
    contrato: dict,
    item: dict,
    *,
    generado_at: Any = None,
) -> bytes:
    logo = _html_logo_pdf(contrato or {}, max_h=40)
    num_ct = _esc((contrato or {}).get("numero") or "")
    fecha_gen = fmt_fecha_hora_bogota(generado_at) if generado_at else "—"
    doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
@page {{ size: letter portrait; margin: 16mm; }}
body {{ font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10pt; }}
h1 {{ color: #b91c1c; font-size: 14pt; }}
.box {{ border: 1pt solid #fecaca; background: #fef2f2; padding: 10pt; margin: 10pt 0; }}
</style></head><body>
<table width="100%"><tr><td width="80">{logo}</td>
<td><h1>Llamado de atención</h1>
<div style="font-size:8pt;color:#64748b;">Contrato {num_ct} · Generado {fecha_gen}</div></td></tr></table>

<div class="box">
<p>Se genera automáticamente este llamado de atención porque el compromiso asignado
no registra respuesta ni justificación aprobada tras el vencimiento y el margen de gracia
de veinticuatro horas en días hábiles (calendario de Programación de obra, hora de Bogotá).</p>
</div>

<p><b>Compromiso:</b> {_esc(item.get('titulo'))}</p>
<p><b>Descripción:</b></p>
<div style="white-space:pre-wrap;">{_esc(item.get('descripcion') or '—')}</div>
<p><b>Responsable:</b> {_esc(item.get('asignado_a_nombre'))}</p>
<p><b>Solicitante:</b> {_esc(item.get('solicitante_nombre'))}</p>
<p><b>Fecha de vencimiento:</b> {fmt_fecha_bogota(item.get('fecha_vencimiento'))}</p>
<p><b>Límite de gracia:</b> {fmt_fecha_hora_bogota(item.get('fecha_limite_gracia'))}</p>
<p style="margin-top:16pt;font-size:8pt;color:#64748b;">Documento generado por ClaraCore · Módulo Seguimiento</p>
</body></html>"""
    return to_pdf_bytes(doc, landscape=False)
