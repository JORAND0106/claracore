"""Informe de horas extras del personal (Bitácora) — PDF / Word.

Filas: una por trabajador×fecha con tiempo extra > 0.
Reutiliza listado de diarios del rango, cálculo de horas extra y paleta/logos
institucionales de Bitácora / Informes.
"""
from __future__ import annotations

import html
import io
import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from bitacora_export_rango import list_diarios_rango
from bitacora_horario import calcular_horas_extra, get_horario_contrato, normalize_horario
from bitacora_pdf import _palette, _prefetch_logos
from bitacora_service import contrato_meta_bitacora
from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.bitacora.horas_extra")

CODIGO_FORMATO_HORAS_EXTRA = "CC-BIT-HE-001"
TITULO_FORMATO_HORAS_EXTRA = "INFORME DE HORAS EXTRAS DEL PERSONAL"
VERSION_FORMATO_HORAS_EXTRA = "1.0"

EMPRESA_SIN_NOMBRE = "Sin empresa"


def _esc(s: Any) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def _key_empresa(nombre: Any) -> str:
    raw = str(nombre or "").strip().lower()
    if not raw:
        return "__sin_empresa__"
    raw = unicodedata.normalize("NFKD", raw)
    raw = "".join(c for c in raw if not unicodedata.combining(c))
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw or "__sin_empresa__"


def _nombre_empresa_asistencia(row: dict) -> str:
    for k in ("subcontratista_nombre", "empresa_nombre", "empresa"):
        v = str((row or {}).get(k) or "").strip()
        if v:
            return v
    return EMPRESA_SIN_NOMBRE


def _fmt_hora(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s:
        return "—"
    return s[:5]


def _fmt_extra(n: float) -> str:
    try:
        v = float(n)
    except (TypeError, ValueError):
        return "0.00"
    if v <= 0:
        return "0.00"
    return f"{v:.2f}"


def _fmt_fecha_es(iso: str) -> str:
    s = str(iso or "").strip()[:10]
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if not m:
        return s or "—"
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"


def _usuario_nombre(u: Optional[dict]) -> str:
    if not isinstance(u, dict):
        return "—"
    full = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
    return full or str(u.get("email") or "").strip() or "—"


def _usuario_cargo(u: Optional[dict]) -> str:
    if not isinstance(u, dict):
        return ""
    return str(u.get("cargo_nombre") or u.get("cargo") or "").strip()


def _extra_de_fila(row: dict, *, horario, fecha_iso: str) -> float:
    stored = row.get("horas_extra")
    try:
        if stored is not None and stored != "":
            v = float(stored)
            if v > 0:
                return round(v, 2)
    except (TypeError, ValueError):
        pass
    try:
        return float(calcular_horas_extra(
            hora_ingreso=row.get("hora_ingreso"),
            hora_salida=row.get("hora_salida"),
            horario=horario,
            fecha_iso=fecha_iso,
        ) or 0)
    except Exception:
        return 0.0


def _justificacion(row: dict) -> str:
    return str(
        row.get("justificacion_horas_extra")
        or row.get("justificacion_extra")
        or row.get("justificacion")
        or row.get("observacion")
        or ""
    ).strip()


def construir_filas_horas_extra(
    diarios: List[dict],
    *,
    empresa_key: Optional[str] = None,
    horario_contrato=None,
) -> List[dict]:
    """Filas con tiempo extra > 0, orden fecha → nombre."""
    emp_filtro = _key_empresa(empresa_key) if empresa_key else None
    if emp_filtro == "__sin_empresa__" and not str(empresa_key or "").strip():
        emp_filtro = None

    out: List[dict] = []
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        if str(d.get("tipo") or "diario").lower() != "diario":
            continue
        fecha = str(d.get("fecha") or "").strip()[:10]
        if not fecha:
            continue
        try:
            if d.get("horario_aplicado"):
                horario = normalize_horario(d.get("horario_aplicado"))
            else:
                horario = horario_contrato
        except Exception:
            horario = horario_contrato

        asistencia = d.get("asistencia_colaboradores")
        if not isinstance(asistencia, list):
            asistencia = []
        for a in asistencia:
            if not isinstance(a, dict):
                continue
            nombre = str(a.get("nombre") or "").strip()
            if not nombre:
                continue
            empresa = _nombre_empresa_asistencia(a)
            if emp_filtro and _key_empresa(empresa) != emp_filtro:
                continue
            extra = _extra_de_fila(a, horario=horario, fecha_iso=fecha)
            if extra <= 0:
                continue
            out.append({
                "nombre": nombre,
                "documento": re.sub(r"\D+", "", str(a.get("documento_numero") or "")) or "—",
                "fecha": fecha,
                "hora_inicio": _fmt_hora(a.get("hora_ingreso")),
                "hora_fin": _fmt_hora(a.get("hora_salida")),
                "tiempo_extra": extra,
                "observacion": _justificacion(a) or "—",
                "empresa": empresa,
                "empresa_key": _key_empresa(empresa),
            })

    out.sort(key=lambda r: (r["fecha"], r["nombre"].lower(), r.get("documento") or ""))
    return out


def empresas_con_personal_reportado(diarios: List[dict]) -> List[dict]:
    """Empresas que aparecen en asistencia de los diarios (para el selector)."""
    seen: Dict[str, str] = {}
    for d in diarios or []:
        if not isinstance(d, dict):
            continue
        for a in d.get("asistencia_colaboradores") or []:
            if not isinstance(a, dict):
                continue
            if not str(a.get("nombre") or "").strip():
                continue
            nombre = _nombre_empresa_asistencia(a)
            key = _key_empresa(nombre)
            if key not in seen:
                seen[key] = nombre
    items = [{"key": k, "nombre": n} for k, n in seen.items()]
    items.sort(key=lambda x: (x["nombre"] == EMPRESA_SIN_NOMBRE, x["nombre"].lower()))
    return items


def opciones_informe_horas_extra(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
) -> dict:
    from seguimiento_service import list_usuarios_contrato_enriquecidos

    diarios = list_diarios_rango(sb, contrato_id, fecha_desde, fecha_hasta)
    usuarios = list_usuarios_contrato_enriquecidos(sb, int(contrato_id)) or []
    usuarios_out = []
    for u in usuarios:
        if not isinstance(u, dict):
            continue
        # Solo usuarios reales del contrato para firmas / responsable.
        if u.get("es_externo"):
            continue
        usuarios_out.append({
            "id": u.get("id"),
            "nombre": _usuario_nombre(u),
            "cargo": _usuario_cargo(u),
            "email": u.get("email") or "",
        })
    return {
        "empresas": empresas_con_personal_reportado(diarios),
        "usuarios": usuarios_out,
        "diarios_count": len(diarios),
        "formato": {
            "codigo": CODIGO_FORMATO_HORAS_EXTRA,
            "version": VERSION_FORMATO_HORAS_EXTRA,
            "titulo": TITULO_FORMATO_HORAS_EXTRA,
        },
    }


def _resolver_usuario(usuarios: List[dict], usuario_id: Optional[int]) -> Optional[dict]:
    if usuario_id is None:
        return None
    try:
        uid = int(usuario_id)
    except (TypeError, ValueError):
        return None
    for u in usuarios or []:
        try:
            if int(u.get("id")) == uid:
                return u
        except (TypeError, ValueError):
            continue
    return None


def construir_informe_horas_extra(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: str,
    responsable_id: Optional[int] = None,
    elaborador_id: Optional[int] = None,
    aprobador_id: Optional[int] = None,
) -> dict:
    """Arma el payload del informe o lanza ValueError si no hay filas."""
    from seguimiento_service import list_usuarios_contrato_enriquecidos

    if not str(empresa_key or "").strip():
        raise ValueError("Seleccione la empresa a la cual se genera el tiempo extra.")

    diarios = list_diarios_rango(sb, contrato_id, fecha_desde, fecha_hasta)
    try:
        horario_contrato = get_horario_contrato(sb, int(contrato_id))
    except Exception:
        horario_contrato = None

    filas = construir_filas_horas_extra(
        diarios,
        empresa_key=empresa_key,
        horario_contrato=horario_contrato,
    )
    if not filas:
        raise ValueError(
            "No hay tiempo extra registrado para el rango y la empresa seleccionados."
        )

    contrato = contrato_meta_bitacora(sb, int(contrato_id)) or {}
    usuarios = list_usuarios_contrato_enriquecidos(sb, int(contrato_id)) or []
    resp = _resolver_usuario(usuarios, responsable_id)
    elaboro = _resolver_usuario(usuarios, elaborador_id)
    aprobo = _resolver_usuario(usuarios, aprobador_id)

    emp_nombre = next(
        (e["nombre"] for e in empresas_con_personal_reportado(diarios)
         if e["key"] == _key_empresa(empresa_key)),
        None,
    )
    if not emp_nombre:
        emp_nombre = filas[0].get("empresa") or EMPRESA_SIN_NOMBRE

    return {
        "contrato": contrato,
        "fecha_desde": str(fecha_desde)[:10],
        "fecha_hasta": str(fecha_hasta)[:10],
        "empresa": emp_nombre,
        "empresa_key": _key_empresa(empresa_key),
        "responsable": {
            "nombre": _usuario_nombre(resp),
            "cargo": _usuario_cargo(resp),
        },
        "elaboro": {
            "nombre": _usuario_nombre(elaboro),
            "cargo": _usuario_cargo(elaboro) or "Elaboró",
        },
        "aprobo": {
            "nombre": _usuario_nombre(aprobo),
            "cargo": _usuario_cargo(aprobo) or "Aprobó",
        },
        "filas": filas,
        "formato": {
            "codigo": CODIGO_FORMATO_HORAS_EXTRA,
            "version": VERSION_FORMATO_HORAS_EXTRA,
            "titulo": TITULO_FORMATO_HORAS_EXTRA,
        },
    }


def _html_informe(payload: dict) -> str:
    contrato = payload.get("contrato") or {}
    pal = _palette(contrato)
    t1 = pal.get("titulo_1") or {"bg": "#0077B6", "text": "#FFFFFF"}
    t2 = pal.get("titulo_2") or {"bg": "#E5F4FA", "text": "#1F4E70"}
    fmt = payload.get("formato") or {}
    filas = payload.get("filas") or []

    logo_uris = {}
    try:
        logo_uris = _prefetch_logos(contrato) or {}
    except Exception as exc:
        _log.debug("logos horas extra: %s", exc)
    logo_uri = logo_uris.get("logo_contratista") or ""
    if logo_uri:
        logo_html = (
            f'<img src="{_esc(logo_uri)}" style="max-height:42pt;max-width:90pt;'
            f'object-fit:contain;" alt="Logo"/>'
        )
    else:
        logo_html = (
            f'<div style="font-size:9pt;font-weight:bold;color:{t1["text"]};">'
            f'{_esc(contrato.get("contratista") or "ClaraCore")}</div>'
        )

    body_rows = []
    for i, r in enumerate(filas, 1):
        bg = "#FFFFFF" if i % 2 else "#F8FAFC"
        body_rows.append(
            "<tr style=\"background:%s;\">"
            "<td style=\"text-align:center;\">%s</td>"
            "<td>%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;\">%s</td>"
            "<td style=\"text-align:center;font-weight:bold;\">%s</td>"
            "<td>%s</td>"
            "</tr>" % (
                bg,
                i,
                _esc(r.get("nombre")),
                _esc(r.get("documento")),
                _esc(_fmt_fecha_es(r.get("fecha"))),
                _esc(r.get("hora_inicio")),
                _esc(r.get("hora_fin")),
                _esc(_fmt_extra(r.get("tiempo_extra"))),
                _esc(r.get("observacion")),
            )
        )

    elaboro = payload.get("elaboro") or {}
    aprobo = payload.get("aprobo") or {}
    responsable = payload.get("responsable") or {}

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page {{
    size: letter landscape;
    margin: 12mm 10mm 14mm 10mm;
    @frame header_frame {{
      -pdf-frame-content: page_header;
      top: 4mm; left: 10mm; right: 10mm; height: 0mm;
    }}
  }}
  body {{ font-family: Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #0F2942; }}
  .hdr {{ width: 100%; border-collapse: collapse; margin-bottom: 8pt; }}
  .hdr td {{
    border: 1pt solid {t1["bg"]};
    background: {t1["bg"]};
    color: {t1["text"]};
    padding: 8pt;
    vertical-align: middle;
  }}
  .hdr .logo {{ width: 18%; text-align: center; background: #FFFFFF; }}
  .hdr .title {{ width: 52%; text-align: center; font-size: 12pt; font-weight: bold; }}
  .hdr .calidad {{ width: 30%; text-align: center; font-size: 8pt; white-space: pre-line; }}
  .meta {{ width: 100%; border-collapse: collapse; margin-bottom: 8pt; font-size: 8pt; }}
  .meta td {{ border: 0.6pt solid #94A3B8; padding: 4pt 6pt; }}
  .meta .lbl {{ font-weight: bold; background: {t2["bg"]}; color: {t2["text"]}; width: 18%; }}
  table.grid {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  table.grid th, table.grid td {{
    border: 0.6pt solid #64748B;
    padding: 3pt 4pt;
    word-wrap: break-word;
    vertical-align: top;
  }}
  table.grid th {{
    background: {t2["bg"]};
    color: {t2["text"]};
    font-size: 7.5pt;
    font-weight: bold;
  }}
  table.grid thead {{ display: table-header-group; }}
  table.grid tbody {{ display: table-row-group; }}
  .firmas {{
    width: 100%;
    border-collapse: collapse;
    margin-top: 18pt;
    page-break-inside: avoid;
  }}
  .firmas td {{
    width: 50%;
    vertical-align: top;
    padding: 6pt 10pt;
    border: 0.6pt solid #94A3B8;
  }}
  .firmas .lbl {{ font-size: 8pt; font-weight: bold; color: {t2["text"]}; margin-bottom: 10pt; }}
  .firmas .line {{ border-bottom: 0.8pt solid #64748B; height: 36pt; margin-bottom: 6pt; }}
  .firmas .nom {{ font-size: 8.5pt; font-weight: bold; }}
  .firmas .cargo {{ font-size: 7.5pt; color: #475569; }}
</style></head><body>
<table class="hdr"><tr>
  <td class="logo">{logo_html}</td>
  <td class="title">{_esc(fmt.get("titulo") or TITULO_FORMATO_HORAS_EXTRA)}</td>
  <td class="calidad">{_esc(fmt.get("codigo") or CODIGO_FORMATO_HORAS_EXTRA)}
Versión {_esc(fmt.get("version") or VERSION_FORMATO_HORAS_EXTRA)}
{_esc(_fmt_fecha_es(payload.get("fecha_hasta")))}</td>
</tr></table>

<table class="meta">
<tr>
  <td class="lbl">Contrato</td>
  <td>{_esc(contrato.get("numero") or "—")}</td>
  <td class="lbl">Objeto</td>
  <td colspan="3">{_esc(contrato.get("objeto") or "—")}</td>
</tr>
<tr>
  <td class="lbl">Empresa (tiempo extra)</td>
  <td>{_esc(payload.get("empresa") or "—")}</td>
  <td class="lbl">Responsable de obra</td>
  <td>{_esc(responsable.get("nombre") or "—")}</td>
  <td class="lbl">Periodo</td>
  <td>{_esc(_fmt_fecha_es(payload.get("fecha_desde")))} – {_esc(_fmt_fecha_es(payload.get("fecha_hasta")))}</td>
</tr>
</table>

<table class="grid">
<thead>
<tr>
  <th style="width:5%;">No</th>
  <th style="width:20%;">Nombre colaborador</th>
  <th style="width:11%;">No. Documento</th>
  <th style="width:9%;">Fecha</th>
  <th style="width:11%;">Hora de inicio de jornada</th>
  <th style="width:11%;">Hora fin de jornada</th>
  <th style="width:9%;">Tiempo extra</th>
  <th style="width:24%;">Observación</th>
</tr>
</thead>
<tbody>
{''.join(body_rows)}
</tbody>
</table>

<table class="firmas">
<tr>
  <td>
    <div class="lbl">Elaboró</div>
    <div class="line"></div>
    <div class="nom">{_esc(elaboro.get("nombre") or "—")}</div>
    <div class="cargo">{_esc(elaboro.get("cargo") or "")}</div>
  </td>
  <td>
    <div class="lbl">Aprobó</div>
    <div class="line"></div>
    <div class="nom">{_esc(aprobo.get("nombre") or "—")}</div>
    <div class="cargo">{_esc(aprobo.get("cargo") or "")}</div>
  </td>
</tr>
</table>
</body></html>"""


def generar_pdf_horas_extra(payload: dict) -> bytes:
    html_doc = _html_informe(payload)
    return to_pdf_bytes(html_doc, landscape=True)


def generar_docx_horas_extra(payload: dict) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.shared import Cm, Pt, RGBColor

    doc = Document()
    section = doc.sections[0]
    section.orientation = 1  # landscape
    section.page_width = Cm(27.94)
    section.page_height = Cm(21.59)
    section.left_margin = Cm(1.2)
    section.right_margin = Cm(1.2)
    section.top_margin = Cm(1.2)
    section.bottom_margin = Cm(1.2)

    fmt = payload.get("formato") or {}
    contrato = payload.get("contrato") or {}

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run(str(fmt.get("titulo") or TITULO_FORMATO_HORAS_EXTRA))
    run.bold = True
    run.font.size = Pt(14)

    meta = doc.add_paragraph()
    meta.add_run(
        f"Código: {fmt.get('codigo') or CODIGO_FORMATO_HORAS_EXTRA}  ·  "
        f"Versión: {fmt.get('version') or VERSION_FORMATO_HORAS_EXTRA}"
    ).font.size = Pt(9)

    for label, value in (
        ("Contrato", contrato.get("numero") or "—"),
        ("Objeto", contrato.get("objeto") or "—"),
        ("Empresa (tiempo extra)", payload.get("empresa") or "—"),
        ("Responsable de obra", (payload.get("responsable") or {}).get("nombre") or "—"),
        (
            "Periodo",
            f"{_fmt_fecha_es(payload.get('fecha_desde'))} – {_fmt_fecha_es(payload.get('fecha_hasta'))}",
        ),
    ):
        p = doc.add_paragraph()
        r = p.add_run(f"{label}: ")
        r.bold = True
        r.font.size = Pt(9)
        p.add_run(str(value)).font.size = Pt(9)

    headers = [
        "No", "Nombre colaborador", "No. Documento", "Fecha",
        "Hora de inicio de jornada", "Hora fin de jornada", "Tiempo extra", "Observación",
    ]
    filas = payload.get("filas") or []
    table = doc.add_table(rows=1 + len(filas), cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(8)
        try:
            tc_pr = cell._tc.get_or_add_tcPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:fill"), "E5F4FA")
            shd.set(qn("w:val"), "clear")
            tc_pr.append(shd)
        except Exception:
            pass

    for ri, r in enumerate(filas):
        vals = [
            str(ri + 1),
            r.get("nombre") or "",
            r.get("documento") or "",
            _fmt_fecha_es(r.get("fecha")),
            r.get("hora_inicio") or "",
            r.get("hora_fin") or "",
            _fmt_extra(r.get("tiempo_extra")),
            r.get("observacion") or "",
        ]
        for ci, val in enumerate(vals):
            cell = table.rows[ri + 1].cells[ci]
            cell.text = str(val)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(8)

    # Repeat header on each page
    try:
        tbl = table._tbl
        tr = tbl.tr_lst[0]
        trPr = tr.get_or_add_trPr()
        tblHeader = OxmlElement("w:tblHeader")
        trPr.append(tblHeader)
    except Exception:
        pass

    doc.add_paragraph("")
    firmas = doc.add_table(rows=1, cols=2)
    firmas.style = "Table Grid"
    elaboro = payload.get("elaboro") or {}
    aprobo = payload.get("aprobo") or {}
    for idx, (lbl, person) in enumerate((("Elaboró", elaboro), ("Aprobó", aprobo))):
        cell = firmas.rows[0].cells[idx]
        cell.text = ""
        p0 = cell.paragraphs[0]
        r0 = p0.add_run(lbl)
        r0.bold = True
        r0.font.size = Pt(9)
        cell.add_paragraph("")
        cell.add_paragraph("")
        p1 = cell.add_paragraph()
        r1 = p1.add_run(str(person.get("nombre") or "—"))
        r1.bold = True
        r1.font.size = Pt(9)
        p2 = cell.add_paragraph()
        r2 = p2.add_run(str(person.get("cargo") or ""))
        r2.font.size = Pt(8)
        r2.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def exportar_informe_horas_extra(
    sb,
    contrato_id: int,
    *,
    fecha_desde: str,
    fecha_hasta: str,
    empresa_key: str,
    formato: str = "pdf",
    responsable_id: Optional[int] = None,
    elaborador_id: Optional[int] = None,
    aprobador_id: Optional[int] = None,
) -> Tuple[bytes, str, str]:
    """
    Returns (bytes, media_type, filename).
    Raises ValueError with user-facing message when empty / invalid.
    """
    payload = construir_informe_horas_extra(
        sb,
        contrato_id,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        empresa_key=empresa_key,
        responsable_id=responsable_id,
        elaborador_id=elaborador_id,
        aprobador_id=aprobador_id,
    )
    fmt = str(formato or "pdf").strip().lower()
    d0 = str(fecha_desde)[:10]
    d1 = str(fecha_hasta)[:10]
    if fmt in ("docx", "word", "doc"):
        data = generar_docx_horas_extra(payload)
        return (
            data,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            f"{CODIGO_FORMATO_HORAS_EXTRA}_horas_extra_{d0}_{d1}.docx",
        )
    data = generar_pdf_horas_extra(payload)
    return data, "application/pdf", f"{CODIGO_FORMATO_HORAS_EXTRA}_horas_extra_{d0}_{d1}.pdf"
