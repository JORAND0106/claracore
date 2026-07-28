"""Generación PDF — actas de reunión y llamados de atención (Seguimiento)."""
from __future__ import annotations

import hashlib
import html
from typing import Any, Dict, List, Optional

from almacen_datetime import fmt_fecha_bogota, fmt_fecha_hora_bogota
from almacen_firma_pdf import firma_url_a_data_uri
from topografia_utils import _html_logo_pdf, to_pdf_bytes

_COLOR = "#0f172a"
_BORDE = "#334155"
_BORDE_SUAVE = "#94a3b8"
_BG_H = "#f8fafc"


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
            str(i.get("orden") if i.get("orden") is not None else ""),
        ]))
    for ap in apartados or []:
        parts.append("|".join([str(ap.get("titulo") or ""), str(ap.get("contenido") or "")]))
    raw = "\n".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _nl2br(text: str) -> str:
    """Convierte saltos de línea a <br/> (xhtml2pdf pagina mejor que white-space:pre-wrap)."""
    return _esc(text).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br/>")


def _logo_cell(url: Optional[str], placeholder: str, *, max_h: int = 48) -> str:
    """Logo embebido (data-URI) o placeholder con borde."""
    uri = ""
    if url and str(url).strip():
        try:
            uri = firma_url_a_data_uri(str(url).strip()) or ""
        except Exception:
            uri = ""
    if uri:
        return (
            f'<div style="text-align:center;padding:4pt;">'
            f'<img src="{uri}" style="max-height:{max_h}pt;max-width:100%;object-fit:contain;"/>'
            f"</div>"
        )
    return (
        f'<div style="border:0.6pt dashed {_BORDE_SUAVE};min-height:{max_h}pt;'
        f'text-align:center;padding:10pt 4pt;font-size:7pt;color:#94a3b8;">'
        f"{_esc(placeholder)}</div>"
    )


def _box_row(cells_html: str) -> str:
    return (
        f'<table class="sec-outer" width="100%" cellspacing="0" cellpadding="0" '
        f'style="border-collapse:collapse;margin:0 0 0;border:1pt solid {_BORDE};">'
        f"<tr>{cells_html}</tr></table>"
    )


def _section(title: str, body: str) -> str:
    # Div+borde (no tabla anidada): xhtml2pdf falla con tablas anidadas y contenido largo.
    return (
        f'<div class="sec" style="border:1pt solid {_BORDE};margin:6pt 0 0;page-break-inside:auto;">'
        f'<div style="background:{_BG_H};border-bottom:1pt solid {_BORDE};'
        f'padding:4pt 6pt;font-size:9pt;font-weight:700;color:{_COLOR};">{_esc(title)}</div>'
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

    num_ct = _esc((contrato or {}).get("numero") or (contrato or {}).get("id") or "—")
    objeto = _esc((contrato or {}).get("objeto") or "—")
    consec = acta.get("consecutivo") or "—"
    fecha = fmt_fecha_bogota(acta.get("fecha_reunion"))
    tipo_raw = str(acta.get("tipo_acta") or "").lower()
    tipo_paren = "(Interna)" if tipo_raw == "interna" else ("(Externa)" if tipo_raw == "externa" else "")
    titulo = f"Acta de Comité de Seguimiento {tipo_paren}".strip()

    logo_contratista = _logo_cell((contrato or {}).get("logo_contratista"), "Logo contratista")
    logo_entidad = _logo_cell((contrato or {}).get("logo_entidad"), "Logo entidad")

    header = _box_row(
        _cell(logo_contratista, width="22%", align="center", valign="middle")
        + _cell(
            f'<div style="font-size:13pt;font-weight:700;text-align:center;line-height:1.25;">'
            f"{_esc(titulo)}</div>",
            width="56%",
            align="center",
            valign="middle",
            pad="10pt 8pt",
        )
        + _cell(logo_entidad, width="22%", border_right=False, align="center", valign="middle")
    )

    meta_fecha = _box_row(
        _cell(f"<b>Fecha del acta:</b> {fecha}", width="50%")
        + _cell(f"<b>Nº de acta:</b> {_esc(consec)}", width="50%", border_right=False)
    )
    meta_contrato = _box_row(
        _cell(f"<b>Nº de contrato:</b> {num_ct}", width="28%")
        + _cell(f"<b>Objeto del contrato:</b> {objeto}", width="72%", border_right=False)
    )

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
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;'>Nombre</th>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;'>Cargo</th>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;'>Empresa</th>"
        f"<th style='padding:4pt 5pt;border:0.5pt solid {_BORDE};text-align:left;'>Correo</th>"
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
        # Consecutivo visible = posición por orden (1-based), no el id de BD.
        num = int(idea.get("orden") if idea.get("orden") is not None else idx - 1) + 1
        quien = (idea.get("quien_dijo") or idea.get("interviniente") or "").strip()
        quien_line = (
            f"<div style='font-size:8pt;color:#475569;margin:1pt 0 3pt;'>"
            f"Interviniente: {_esc(quien)}</div>"
            if quien else ""
        )
        ideas_html += (
            f"<div class='pdf-idea' style='margin:0 0 8pt;padding-bottom:6pt;"
            f"border-bottom:0.4pt solid {_BORDE_SUAVE};'>"
            f"<div style='font-size:9pt;font-weight:700;'>Idea {num}</div>"
            f"{quien_line}"
            f"<div style='font-size:9pt;'>{_nl2br(idea.get('texto') or '')}</div>"
            f"</div>"
        )
    if not ideas_html:
        ideas_html = "<div style='color:#94a3b8;font-size:9pt;'>Sin ideas centrales.</div>"

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
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;'>Compromiso</th>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;'>Asignado</th>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;'>Vence</th>"
            f"<th style='padding:3pt 4pt;border:0.5pt solid {_BORDE};text-align:left;'>Estado</th>"
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
{header}
<div style="height:4pt;"></div>
{meta_fecha}
<div style="height:0;"></div>
{meta_contrato}

{_section("Asistentes", asis_table)}
{_section("Orden del día", _orden_del_dia_html(acta.get("orden_del_dia")))}
{_section(
    "Compromisos abiertos de actas anteriores",
    _comp_table(compromisos_previos, "No hay compromisos abiertos de actas anteriores."),
)}
{_section(f"Ideas centrales o temas nuevos tratados ({n_ideas})", ideas_html)}
{_section(
    "Compromisos generados",
    _comp_table(compromisos, "Sin compromisos generados en esta acta."),
)}
{_section("Apartados o temas adicionales", apartados_html)}
{_section("Firmas", firmas_html)}
{_section("Próxima reunión (reserva)", proxima_html)}
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
