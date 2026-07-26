"""Generación PDF — actas de reunión y llamados de atención (Seguimiento)."""
from __future__ import annotations

import hashlib
import html
from typing import Any, Dict, List, Optional

from almacen_datetime import fmt_fecha_bogota, fmt_fecha_hora_bogota
from almacen_firma_pdf import firma_url_a_data_uri
from topografia_utils import _html_logo_pdf, to_pdf_bytes

_COLOR = "#0f766e"
_BORDE = "#cbd5e1"


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
    ]
    for a in asistentes or []:
        parts.append("|".join([
            str(a.get("nombre") or ""),
            str(a.get("cargo") or ""),
            str(a.get("entidad") or ""),
            str(a.get("email") or ""),
        ]))
    for i in ideas or []:
        parts.append(str(i.get("texto") or ""))
    for ap in apartados or []:
        parts.append("|".join([str(ap.get("titulo") or ""), str(ap.get("contenido") or "")]))
    raw = "\n".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _firma_celda(lbl: str, nombre: str, cargo: str, entidad: str, firma_uri: str = "") -> str:
    if firma_uri:
        img = (
            f'<div style="height:28pt;text-align:center;">'
            f'<img src="{firma_uri}" style="max-height:28pt;max-width:100%;"/>'
            f"</div>"
        )
    else:
        img = '<div style="height:28pt;border-bottom:0.5pt solid #94a3b8;"></div>'
    return (
        f'<td style="width:33%;padding:6pt;vertical-align:top;">'
        f'<div style="font-size:7pt;color:#64748b;font-weight:700;">{_esc(lbl)}</div>'
        f"{img}"
        f'<div style="font-size:8pt;font-weight:700;margin-top:2pt;">{_esc(nombre)}</div>'
        f'<div style="font-size:7pt;color:#475569;">{_esc(cargo)}</div>'
        f'<div style="font-size:7pt;color:#64748b;">{_esc(entidad)}</div>'
        f"</td>"
    )


def generar_pdf_acta(
    contrato: dict,
    acta: dict,
    asistentes: List[dict],
    ideas: List[dict],
    apartados: List[dict],
    firmas: Optional[List[dict]] = None,
    compromisos: Optional[List[dict]] = None,
) -> bytes:
    firmas = firmas or []
    compromisos = compromisos or []
    firma_by_asistente = {int(f["asistente_id"]): f for f in firmas if f.get("asistente_id") is not None}

    logo = ""
    try:
        logo = _html_logo_pdf(contrato or {}, max_h=40) or ""
    except Exception:
        logo = ""
    num_ct = _esc((contrato or {}).get("numero") or (contrato or {}).get("id"))
    consec = acta.get("consecutivo") or "—"
    fecha = fmt_fecha_bogota(acta.get("fecha_reunion"))
    tipo = _esc({"interna": "Interna", "externa": "Externa"}.get(
        str(acta.get("tipo_acta") or "").lower(), acta.get("tipo_acta") or "—"
    ))
    estado_lbl = _esc({"borrador": "Borrador", "realizada": "Realizada", "firmada": "Firmada"}.get(
        str(acta.get("estado") or "").lower(), acta.get("estado") or "—"
    ))

    asis_rows = "".join(
        f"<tr>"
        f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{_esc(a.get('nombre'))}</td>"
        f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{_esc(a.get('cargo'))}</td>"
        f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{_esc(a.get('entidad'))}</td>"
        f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{_esc(a.get('email'))}</td>"
        f"</tr>"
        for a in (asistentes or [])
    ) or (
        f"<tr><td colspan='4' style='padding:4pt;border:0.4pt solid {_BORDE};color:#94a3b8;'>"
        "Sin asistentes registrados</td></tr>"
    )

    ideas_html = ""
    for idx, idea in enumerate(ideas or [], start=1):
        ideas_html += (
            f"<div style='margin:6pt 0;'>"
            f"<div style='font-size:9pt;font-weight:700;color:{_COLOR};'>Idea central {idx}</div>"
            f"<div style='font-size:9pt;white-space:pre-wrap;'>{_esc(idea.get('texto'))}</div>"
            f"</div>"
        )
    if not ideas_html:
        ideas_html = "<div style='color:#94a3b8;font-size:9pt;'>Sin ideas centrales.</div>"

    apartados_html = ""
    for ap in apartados or []:
        tit = ap.get("titulo") or "Apartado"
        apartados_html += (
            f"<div style='margin:6pt 0;'>"
            f"<div style='font-size:9pt;font-weight:700;'>{_esc(tit)}</div>"
            f"<div style='font-size:9pt;white-space:pre-wrap;'>{_esc(ap.get('contenido'))}</div>"
            f"</div>"
        )

    comp_html = ""
    if compromisos:
        rows = "".join(
            f"<tr>"
            f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{_esc(c.get('titulo'))}</td>"
            f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{_esc(c.get('asignado_a_nombre'))}</td>"
            f"<td style='padding:3pt 4pt;border:0.4pt solid {_BORDE};'>{fmt_fecha_bogota(c.get('fecha_vencimiento'))}</td>"
            f"</tr>"
            for c in compromisos
        )
        comp_html = (
            f"<h3 style='color:{_COLOR};font-size:11pt;margin:12pt 0 4pt;'>Compromisos generados</h3>"
            f"<table width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;font-size:8pt;'>"
            f"<tr style='background:#f1f5f9;'>"
            f"<th style='padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;'>Compromiso</th>"
            f"<th style='padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;'>Asignado</th>"
            f"<th style='padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;'>Vence</th>"
            f"</tr>{rows}</table>"
        )

    firma_cells = []
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
        firma_cells.append(_firma_celda("Firma", a.get("nombre"), a.get("cargo"), a.get("entidad"), uri))

    firmas_rows = ""
    for i in range(0, max(len(firma_cells), 1), 3):
        chunk = firma_cells[i : i + 3]
        while len(chunk) < 3:
            chunk.append("<td style='width:33%;'></td>")
        firmas_rows += f"<tr>{''.join(chunk)}</tr>"

    doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
@page {{ size: letter portrait; margin: 14mm 12mm; }}
body {{ font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 9pt; }}
h1 {{ color: {_COLOR}; font-size: 14pt; margin: 0 0 4pt; }}
h2 {{ color: {_COLOR}; font-size: 11pt; margin: 12pt 0 4pt; border-bottom: 1pt solid {_COLOR}; padding-bottom: 2pt; }}
</style></head><body>
<table width="100%" cellspacing="0" cellpadding="0"><tr>
  <td width="80">{logo}</td>
  <td>
    <h1>Acta de reunión Nº { _esc(consec) }</h1>
    <div style="font-size:8pt;color:#475569;">Contrato {_esc(num_ct)} · {fecha} · {tipo} · {estado_lbl}</div>
  </td>
</tr></table>

<table width="100%" style="margin-top:10pt;font-size:9pt;">
<tr><td><b>Ubicación:</b> {_esc(acta.get('ubicacion') or '—')}</td>
<td><b>Elaborador:</b> {_esc(acta.get('elaborador_nombre') or '—')}</td></tr>
</table>

<h2>Orden del día</h2>
{_orden_del_dia_html(acta.get('orden_del_dia'))}

<h2>Asistentes</h2>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:8pt;">
<tr style="background:#f1f5f9;">
<th style="padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;">Nombre</th>
<th style="padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;">Cargo</th>
<th style="padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;">Entidad / Empresa</th>
<th style="padding:3pt 4pt;border:0.4pt solid {_BORDE};text-align:left;">Correo</th>
</tr>
{asis_rows}
</table>

<h2>Ideas centrales</h2>
{ideas_html}

{comp_html}

{('<h2>Apartados adicionales</h2>' + apartados_html) if apartados_html else ''}

<h2>Firmas de asistentes</h2>
<table width="100%" cellspacing="0" cellpadding="0">{firmas_rows}</table>
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
