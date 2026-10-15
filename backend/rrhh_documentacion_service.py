"""
Consolidación documental RRHH: auditoría, validación, PDF consolidado y bloqueo.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_rrhh_doc_consolidado,
    upload_blob_private,
)
from rrhh_auditoria_docs import (
    auditoria_fue_ejecutada,
    ejecutar_auditoria_documentacion,
    slots_checklist_auditoria,
)
from rrhh_docs_service import (
    DOC_TIPO_LABEL,
    assert_documentacion_editable,
    list_contratos_generados,
    list_documentos,
)
from rrhh_service import get_trabajador, list_catalogo, trabajador_display_nombre

_log = logging.getLogger("claracore.rrhh.doc_consolidacion")

_TABLE = "rrhh_trabajadores"
_TABLE_DOCS = "rrhh_trabajador_documentos"
_TABLE_AUDITORIA = "rrhh_auditoria_informes"

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
_CERT_PLANTILLA = os.path.join(_ASSETS_DIR, "rrhh_certificado_documental_plantilla.txt")
_PLACEHOLDER_RE = re.compile(r"\{\{[A-Z_0-9]+\}\}")

# Caja de foto en el certificado (px). La firma usa la mitad de la altura.
_FOTO_W = 120
_FOTO_H = 140
_FIRMA_H = _FOTO_H // 2
_FIRMA_MAX_W = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(current_user) -> Optional[int]:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError, AttributeError):
        return None


def _fecha_firma_bogota() -> str:
    meses = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
    }
    try:
        import pytz
        now = datetime.now(pytz.timezone("America/Bogota"))
    except Exception:
        now = datetime.now(timezone.utc)
    return f"{now.day} de {meses[now.month]} de {now.year}"


def _cargar_plantilla_certificado() -> str:
    """Plantilla editable en backend/assets/rrhh_certificado_documental_plantilla.txt."""
    if not os.path.isfile(_CERT_PLANTILLA):
        raise ValueError(
            "No se encontró la plantilla del certificado documental "
            "(backend/assets/rrhh_certificado_documental_plantilla.txt)."
        )
    with open(_CERT_PLANTILLA, "r", encoding="utf-8") as fh:
        return fh.read()


def _aplicar_placeholders_cert(texto: str, ctx: Dict[str, str]) -> str:
    out = texto
    for k, v in ctx.items():
        out = out.replace(k, v)
    restantes = _PLACEHOLDER_RE.findall(out)
    if restantes:
        _log.warning("Placeholders sin reemplazar en certificado documental: %s", restantes)
    return out


def _contexto_certificado(trab: dict, contrato_obra: Optional[dict] = None) -> Dict[str, str]:
    obra = contrato_obra or {}
    nombre = trabajador_display_nombre(trab) or "________________"
    vacio = "________________"

    def campo(v):
        s = str(v or "").strip()
        return s if s else vacio

    empleador = campo(trab.get("empresa_nombre") or obra.get("contratista"))
    nit = campo(trab.get("empresa_nit") or obra.get("nit"))
    return {
        "{{NOMBRE_COLABORADOR}}": campo(nombre),
        "{{TIPO_DOCUMENTO}}": campo(trab.get("tipo_documento") or "CC"),
        "{{NUMERO_DOCUMENTO}}": campo(trab.get("numero_documento")),
        "{{CARGO}}": campo(trab.get("cargo_aspira")),
        "{{NUMERO_CONTRATO}}": campo(obra.get("numero")),
        "{{OBJETO_CONTRATO}}": campo(obra.get("objeto")),
        "{{EMPLEADOR}}": empleador,
        "{{NIT_EMPLEADOR}}": nit,
        # Alias legacy por si una plantilla antigua aún usa {{EMPRESA}}
        "{{EMPRESA}}": empleador,
        "{{FECHA_FIRMA}}": _fecha_firma_bogota(),
    }


def _cargar_contrato_obra(sb, contrato_id: int) -> dict:
    try:
        rows = (
            sb.table("contratos")
            .select("id, numero, objeto, contratista, nit")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else {}
    except Exception as exc:
        _log.warning("contrato obra %s: %s", contrato_id, exc)
        return {}


def _pil_cover_jpeg(data: bytes, target_w: int, target_h: int) -> bytes:
    """Recorte centrado preservando proporción, luego resize exacto (sin deformar)."""
    from PIL import Image

    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)
    img = Image.open(io.BytesIO(data))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    src_w, src_h = img.size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("imagen vacía")
    target_ratio = target_w / float(target_h)
    src_ratio = src_w / float(src_h)
    if src_ratio > target_ratio:
        new_w = int(round(src_h * target_ratio))
        left = max(0, (src_w - new_w) // 2)
        img = img.crop((left, 0, left + new_w, src_h))
    elif src_ratio < target_ratio:
        new_h = int(round(src_w / target_ratio))
        top = max(0, (src_h - new_h) // 2)
        img = img.crop((0, top, src_w, top + new_h))
    img = img.resize((target_w, target_h), resample)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue()


def _pil_fit_height_png(data: bytes, max_h: int, max_w: int) -> Tuple[bytes, int, int]:
    """Escala preservando proporción para caber en max_h (y max_w)."""
    from PIL import Image

    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.LANCZOS)
    img = Image.open(io.BytesIO(data))
    if img.mode not in ("RGBA", "RGB"):
        img = img.convert("RGBA")
    src_w, src_h = img.size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("imagen vacía")
    scale = min(max_h / float(src_h), max_w / float(src_w), 1.0)
    new_w = max(1, int(round(src_w * scale)))
    new_h = max(1, int(round(src_h * scale)))
    if (new_w, new_h) != (src_w, src_h):
        img = img.resize((new_w, new_h), resample)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), new_w, new_h


def _foto_data_url(sb_path: Optional[str], mime: str) -> Optional[str]:
    if not sb_path:
        return None
    try:
        raw = download_blob_bytes_private(sb_path)
        try:
            jpeg = _pil_cover_jpeg(raw, _FOTO_W, _FOTO_H)
            b64 = base64.b64encode(jpeg).decode("ascii")
            return f"data:image/jpeg;base64,{b64}"
        except Exception:
            b64 = base64.b64encode(raw).decode("ascii")
            return f"data:{mime or 'image/jpeg'};base64,{b64}"
    except Exception:
        return None


def _firma_data_url(sb_path: Optional[str], mime: str) -> Tuple[Optional[str], int, int]:
    """Retorna (data_url, width_px, height_px) con altura ≈ mitad de la foto."""
    if not sb_path:
        return None, _FIRMA_MAX_W, _FIRMA_H
    try:
        raw = download_blob_bytes_private(sb_path)
        try:
            png, w, h = _pil_fit_height_png(raw, _FIRMA_H, _FIRMA_MAX_W)
            b64 = base64.b64encode(png).decode("ascii")
            return f"data:image/png;base64,{b64}", w, h
        except Exception:
            b64 = base64.b64encode(raw).decode("ascii")
            return f"data:{mime or 'image/png'};base64,{b64}", _FIRMA_MAX_W, _FIRMA_H
    except Exception:
        return None, _FIRMA_MAX_W, _FIRMA_H


def _texto_certificacion_html(trab: dict, contrato_obra: Optional[dict]) -> str:
    """Renderiza la plantilla con datos dinámicos en mayúsculas y negrita."""
    import html as html_mod

    plantilla = _cargar_plantilla_certificado()
    ctx = _contexto_certificado(trab, contrato_obra)

    def render_block(block: str) -> str:
        parts = re.split(r"(\{\{[A-Z_0-9]+\}\})", block)
        out = []
        for part in parts:
            if not part:
                continue
            if part in ctx:
                val = html_mod.escape(str(ctx[part]).upper())
                out.append(f'<b class="dyn">{val}</b>')
            elif _PLACEHOLDER_RE.fullmatch(part):
                out.append(f'<b class="dyn">{html_mod.escape(part)}</b>')
            else:
                out.append(html_mod.escape(part))
        return "".join(out)

    paras = []
    for block in re.split(r"\n\s*\n", plantilla.strip()):
        line = " ".join(ln.strip() for ln in block.splitlines() if ln.strip())
        if line:
            paras.append(f'<p class="cert-text">{render_block(line)}</p>')
    return "\n".join(paras)


def _docs_vigentes_pdf(sb, contrato_id: int, trabajador_id: int) -> List[dict]:
    docs = list_documentos(sb, contrato_id, trabajador_id)
    out = []
    for d in docs:
        if not d.get("vigente"):
            continue
        path = d.get("azure_blob_path")
        if not path:
            continue
        out.append(d)
    return out


def _contrato_laboral_vigente_meta(sb, contrato_id: int, trabajador_id: int) -> Optional[dict]:
    """
    Contrato laboral vigente (generado en plataforma o PDF cargado).
    Ambos viven en rrhh_contratos_generados — se tratan igual.
    """
    try:
        rows = list_contratos_generados(sb, contrato_id, trabajador_id) or []
    except Exception as exc:
        _log.warning("list contratos auditoría: %s", exc)
        return None
    vigente = next((r for r in rows if r.get("vigente") and not r.get("eliminado_en")), None)
    if not vigente:
        vigente = next((r for r in rows if not r.get("eliminado_en") and r.get("azure_blob_path")), None)
    if not vigente or not vigente.get("azure_blob_path"):
        return None
    label = "Contrato laboral"
    origen = str(vigente.get("origen") or vigente.get("estado") or "").strip().lower()
    if origen == "cargado":
        label = "Contrato laboral (PDF cargado)"
    elif origen == "generado":
        label = "Contrato laboral (generado)"
    return {
        "id": vigente.get("id"),
        "categoria": "contrato_laboral",
        "tipo": "contrato_laboral",
        "label": label,
        "nombre_archivo": vigente.get("nombre_archivo") or f"contrato_laboral_v{vigente.get('version_num') or 1}.pdf",
        "version_num": vigente.get("version_num"),
        "version_label": f"v{vigente.get('version_num')}" if vigente.get("version_num") is not None else None,
        "mime_type": vigente.get("mime_type") or "application/pdf",
        "azure_blob_path": vigente["azure_blob_path"],
        "origen": origen or "contrato",
    }


def _custom_tipos_auditoria(sb, contrato_id: int) -> List[Tuple[str, str, str]]:
    out: List[Tuple[str, str, str]] = []
    try:
        from rrhh_docs_service import slug_tipo_documento
    except Exception:
        return out
    for cat, catalog_key in (("soporte", "doc_soporte"), ("ingreso", "doc_ingreso")):
        try:
            rows = list_catalogo(sb, int(contrato_id), catalog_key) or []
        except Exception:
            rows = []
        for r in rows:
            label = str(r.get("valor") or "").strip()
            if label:
                out.append((cat, slug_tipo_documento(label), label))
    return out


def _expediente_adjuntos_meta(sb, contrato_id: int, trabajador_id: int) -> List[dict]:
    """Inventario de archivos del expediente (contrato + docs vigentes)."""
    adjuntos: List[dict] = []
    cto = _contrato_laboral_vigente_meta(sb, contrato_id, trabajador_id)
    if cto:
        adjuntos.append(cto)
    for d in _docs_vigentes_pdf(sb, contrato_id, trabajador_id):
        cat = str(d.get("categoria") or "").strip().lower()
        tipo = str(d.get("tipo") or "").strip().lower()
        if not cat or not tipo or tipo == "otro":
            continue
        label = (
            d.get("tipo_otro_texto")
            or DOC_TIPO_LABEL.get(tipo)
            or tipo
        )
        adjuntos.append({
            "id": d.get("id"),
            "categoria": cat,
            "tipo": tipo,
            "label": label,
            "nombre_archivo": d.get("nombre_archivo") or "documento",
            "version_label": d.get("version_label"),
            "version_num": d.get("version_num"),
            "mime_type": d.get("mime_type"),
            "azure_blob_path": d.get("azure_blob_path"),
        })
    return adjuntos


def _cargar_blobs(docs: List[dict]) -> List[Tuple[dict, bytes]]:
    pairs = []
    for d in docs:
        path = d.get("azure_blob_path")
        if not path:
            continue
        try:
            data = download_blob_bytes_private(path)
            if data:
                pairs.append((d, data))
        except Exception as exc:
            _log.warning("No se pudo descargar doc %s: %s", d.get("id"), exc)
    return pairs


def _blob_a_pdf_bytes(meta: dict, data: bytes) -> Optional[bytes]:
    mime = (meta.get("mime_type") or "").lower()
    if data[:5] == b"%PDF-" or "pdf" in mime:
        return data
    try:
        import fitz
        doc = fitz.open()
        page = doc.new_page()
        page.insert_image(page.rect, stream=data)
        out = doc.tobytes()
        doc.close()
        return out
    except Exception:
        _log.warning("Omitiendo imagen no convertible doc=%s", meta.get("id"))
        return None


def consolidar_documentacion(
    sb,
    contrato_id: int,
    trabajador_id: int,
    current_user=None,
) -> dict:
    """
    Ejecuta auditoría sobre el expediente (docs + contrato laboral).
    Guarda resultado e historial; NO cambia el estado de validación.
    """
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    assert_documentacion_editable(trab)

    adjuntos_meta = _expediente_adjuntos_meta(sb, contrato_id, trabajador_id)
    pairs = _cargar_blobs(adjuntos_meta)
    pdf_blobs: List[bytes] = []
    adjuntos_ok: List[dict] = []
    for meta, data in pairs:
        pdf = _blob_a_pdf_bytes(meta, data)
        if pdf:
            pdf_blobs.append(pdf)
            adjuntos_ok.append(meta)

    slots = slots_checklist_auditoria(
        trab, custom_tipos=_custom_tipos_auditoria(sb, contrato_id),
    )
    # Permitir auditar aunque no haya PDFs: la tabla marcará «no cargado».
    audit = ejecutar_auditoria_documentacion(
        trabajador=trab,
        slots=slots,
        adjuntos=adjuntos_ok,
        pdf_blobs=pdf_blobs,
    )

    observaciones = []
    for fila in (audit.get("filas") or []):
        est = str(fila.get("estado") or "").upper()
        if est in ("DISCREPANCIA", "NO_CARGADO"):
            if est == "NO_CARGADO" and fila.get("opcional"):
                continue
            observaciones.append(
                f"{fila.get('ubicacion')}: {fila.get('hallazgo')}"
            )
    for a in (audit["resultado"].get("alertas_criticas") or []):
        observaciones.append(str(a))
    obs_text = "\n".join(observaciones) if observaciones else None

    informe_id = None
    try:
        ins = (
            sb.table(_TABLE_AUDITORIA)
            .insert({
                "contrato_id": int(contrato_id),
                "trabajador_id": int(trabajador_id),
                "filas": audit.get("filas") or [],
                "resultado_ia": audit.get("resultado") or {},
                "tiene_discrepancias": bool(audit.get("tiene_discrepancias")),
                "documentos_auditados": int(audit.get("documentos_auditados") or 0),
                "observaciones": obs_text,
                "tokens_in": audit.get("tokens_in"),
                "tokens_out": audit.get("tokens_out"),
                "ejecutado_en": audit.get("ejecutado_en") or _now_iso(),
                "ejecutado_por": _uid(current_user),
            })
            .execute()
            .data
            or []
        )
        if ins:
            informe_id = ins[0].get("id")
    except Exception as exc:
        _log.warning("No se pudo persistir historial de auditoría: %s", exc)

    upd = {
        "doc_auditoria_ok": bool(audit["ok"]),
        "doc_auditoria_resultado": {
            **(audit.get("resultado") or {}),
            "filas": audit.get("filas") or [],
        },
        "doc_auditoria_observaciones": obs_text,
        "doc_auditoria_en": audit.get("ejecutado_en") or _now_iso(),
        "updated_at": _now_iso(),
        "updated_by": _uid(current_user),
    }
    if informe_id is not None:
        upd["doc_auditoria_informe_id"] = informe_id

    rows = (
        sb.table(_TABLE)
        .update(upd)
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    trab2 = rows[0] if rows else {**trab, **upd}
    return {
        "trabajador": trab2,
        "auditoria": {
            "ok": audit["ok"],
            "tiene_discrepancias": audit["tiene_discrepancias"],
            "resultado": audit["resultado"],
            "filas": audit.get("filas") or [],
            "observaciones": obs_text,
            "documentos_auditados": audit.get("documentos_auditados") or 0,
            "informe_id": informe_id,
            "ejecutado_en": audit.get("ejecutado_en"),
        },
    }


def _build_portada_html(
    *,
    trab: dict,
    checklist: List[dict],
    foto_data_url: Optional[str],
    firma_data_url: Optional[str],
    firma_w: int,
    firma_h: int,
    contrato_obra: Optional[dict] = None,
) -> str:
    import html as html_mod

    def esc(v):
        return html_mod.escape(str(v if v is not None else "—"))

    nombre = trabajador_display_nombre(trab)
    doc_txt = f"{esc(trab.get('tipo_documento'))} {esc(trab.get('numero_documento'))}".strip()
    rows = ""
    for item in checklist:
        estado = str(item.get("estado") or "").upper()
        if estado == "VERIFICADO":
            estado_html = (
                "<span style='color:#166534;font-weight:700;'>"
                "<span style='font-size:9pt;'>✓</span> VERIFICADO</span>"
            )
        elif estado == "NO ADJUNTO":
            estado_html = (
                "<span style='color:#991b1b;font-weight:700;'>"
                "<span style='font-size:9pt;'>✗</span> NO ADJUNTO</span>"
            )
        else:
            estado_html = (
                "<span style='color:#64748b;font-weight:600;'>"
                "<span style='font-size:9pt;'>—</span> NO APLICA</span>"
            )
        rows += (
            f"<tr><td>{esc(item['label'])}</td>"
            f"<td style='text-align:center'>{estado_html}</td></tr>"
        )
    foto_html = (
        f'<img src="{foto_data_url}" width="{_FOTO_W}" height="{_FOTO_H}" '
        f'style="width:{_FOTO_W}px;height:{_FOTO_H}px;border:1px solid #94a3b8;" />'
        if foto_data_url
        else (
            f'<div style="width:{_FOTO_W}px;height:{_FOTO_H}px;border:1px dashed #94a3b8;'
            f'display:inline-block;"></div>'
        )
    )
    fw = max(1, int(firma_w or _FIRMA_MAX_W))
    fh = max(1, int(firma_h or _FIRMA_H))
    if firma_data_url:
        firma_html = (
            f'<img src="{firma_data_url}" width="{fw}" height="{fh}" '
            f'style="width:{fw}px;height:{fh}px;" />'
        )
    else:
        firma_html = (
            f'<div style="height:{_FIRMA_H}px;border-bottom:1px solid #334155;'
            f'width:{_FIRMA_MAX_W}px;"></div>'
        )
    cert_html = _texto_certificacion_html(trab, contrato_obra)
    meta_extra = ""
    if trab.get("empresa_nombre"):
        meta_extra += (
            f"<tr><td class='lbl'>Empresa</td><td>{esc(trab.get('empresa_nombre'))}</td></tr>"
        )
    if trab.get("empresa_nit"):
        meta_extra += (
            f"<tr><td class='lbl'>NIT empleador</td><td>{esc(trab.get('empresa_nit'))}</td></tr>"
        )
    if trab.get("tipo_contrato"):
        meta_extra += (
            f"<tr><td class='lbl'>Tipo contrato</td><td>{esc(trab.get('tipo_contrato'))}</td></tr>"
        )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
@page {{ size: letter; margin: 1.4cm; }}
body {{ font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #0f172a; }}
h1 {{ color: #0077B6; text-align: center; font-size: 13pt; margin: 0 0 10pt 0; }}
table.top {{ width: 100%; border-collapse: collapse; margin-bottom: 10pt; }}
table.top td {{ vertical-align: top; border: none; padding: 0; }}
table.datos {{
  width: 100%;
  border-collapse: collapse;
  border: 1.5pt solid #64748b;
}}
table.datos td {{
  border: none;
  padding: 3pt 6pt;
  font-size: 9.5pt;
  line-height: 1.25;
}}
table.datos td.lbl {{
  width: 32%;
  font-weight: bold;
  color: #475569;
}}
table.docs {{ width: 100%; border-collapse: collapse; margin: 4pt 0 8pt 0; }}
table.docs th, table.docs td {{
  border: 0.5pt solid #cbd5e1;
  padding: 1pt 4pt;
  font-size: 8pt;
  line-height: 1.1;
  vertical-align: middle;
}}
table.docs th {{
  background: #f1f5f9;
  font-size: 7.5pt;
  font-weight: 700;
  color: #475569;
  padding: 2pt 4pt;
}}
.cert-text {{
  text-align: justify;
  font-size: 9pt;
  line-height: 1.35;
  margin: 0 0 7pt 0;
  color: #0f172a;
}}
.cert-text .dyn {{ font-weight: bold; text-transform: uppercase; }}
.firma-block {{ margin-top: 14pt; text-align: left; }}
.firma-label {{ font-size: 8pt; color: #64748b; margin-top: 3pt; }}
.firma-meta {{ font-size: 9pt; margin-top: 4pt; color: #0f172a; }}
</style></head><body>
<h1>Certificado de cumplimiento documental</h1>
<table class="top"><tr>
<td style="width:{_FOTO_W + 16}px;padding-right:10pt;">{foto_html}</td>
<td>
<table class="datos">
<tr><td class="lbl">Colaborador</td><td>{esc(nombre)}</td></tr>
<tr><td class="lbl">Documento</td><td>{doc_txt}</td></tr>
<tr><td class="lbl">Cargo</td><td>{esc(trab.get('cargo_aspira'))}</td></tr>
<tr><td class="lbl">Fecha ingreso</td><td>{esc(trab.get('fecha_ingreso'))}</td></tr>
{meta_extra}
</table>
</td>
</tr></table>
{cert_html}
<p style="margin:10pt 0 2pt 0;font-size:9pt;font-weight:bold;">Documentación adjunta</p>
<table class="docs"><tr><th>Documento</th><th style="width:24%">Estado</th></tr>{rows or '<tr><td colspan="2" style="text-align:center;color:#64748b;">Sin documentos contemplados</td></tr>'}</table>
<div class="firma-block">
{firma_html}
<div class="firma-label">Firma del colaborador</div>
<div class="firma-meta"><b>{esc(nombre)}</b><br/>{doc_txt}</div>
</div>
<p style="margin-top:14pt;font-size:7.5pt;color:#64748b;text-align:center;">
ClaraCore — Recursos Humanos · Documento generado automáticamente
</p>
</body></html>"""


def _doc_aplica_al_colaborador(trab: dict, categoria: str, tipo: str) -> bool:
    """
    Relevancia del tipo en el checklist del colaborador.
    EPS / ARL / Pensión / Cesantías siempre aplican (nunca «No aplica»).
    Opcionales (hoja de vida, certificados, caja) también figuran en el
    checklist; el estado NO APLICA se resuelve al no estar cargados.
    """
    from rrhh_docs_obligatoriedad import doc_aplica_checklist

    return doc_aplica_checklist(trab, categoria, tipo)


def _estado_documento_checklist(
    *,
    aplica: bool,
    adjunto: bool,
    auditoria_ok: Optional[bool],
    opcional: bool = False,
) -> str:
    """
    NO APLICA | NO ADJUNTO | VERIFICADO
    VERIFICADO: aplica, está cargado y la auditoría no falló
    (ok=True, o aún no ejecutada: ok is None — la aprobación real exige ok=True).
    Opcional sin adjunto → NO APLICA (no cuenta como faltante).
    """
    if opcional and not adjunto:
        return "NO APLICA"
    if not aplica:
        return "NO APLICA"
    if not adjunto:
        return "NO ADJUNTO"
    if auditoria_ok is False:
        return "NO ADJUNTO"
    return "VERIFICADO"


def _custom_tipos_catalogo(sb, contrato_id: int) -> List[Tuple[str, str, str]]:
    """[(categoria, tipo_slug, label), ...] desde catálogo doc_soporte / doc_ingreso."""
    if sb is None or not contrato_id:
        return []
    try:
        from rrhh_docs_service import slug_tipo_documento
        from rrhh_service import list_catalogo
    except Exception:
        return []
    out: List[Tuple[str, str, str]] = []
    for cat, catalog_key in (("soporte", "doc_soporte"), ("ingreso", "doc_ingreso")):
        try:
            rows = list_catalogo(sb, contrato_id, catalog_key)
        except Exception:
            rows = []
        for r in rows or []:
            label = str(r.get("valor") or "").strip()
            if not label:
                continue
            out.append((cat, slug_tipo_documento(label), label))
    return out


def _checklist_items(
    trab: dict,
    docs: List[dict],
    *,
    sb=None,
    contrato_id: Optional[int] = None,
) -> List[dict]:
    """
    Lista completa de documentos contemplados (siempre), con estado individual:
    NO ADJUNTO | VERIFICADO | NO APLICA.
    No depende de que el colaborador esté Aprobado.
    """
    vigentes = {
        (d.get("categoria"), d.get("tipo"))
        for d in docs
        if d.get("vigente") and not d.get("eliminado_en")
    }
    # Tras consolidación los blobs se eliminan; si hay PDF consolidado y auditoría OK,
    # los tipos que constaban en la auditoría/checklist previo se tratan como adjuntos.
    auditoria_ok = trab.get("doc_auditoria_ok")
    if trab.get("doc_consolidado_blob_path") and auditoria_ok and not vigentes:
        # No inventar adjuntos: sin vigentes reales → NO ADJUNTO salvo NO APLICA
        pass

    items: List[dict] = []
    from rrhh_docs_obligatoriedad import es_doc_opcional
    from rrhh_docs_service import (
        DOC_TIPOS_AFILIACION,
        DOC_TIPOS_BANCARIO,
        DOC_TIPOS_INGRESO,
        DOC_TIPOS_SOPORTE,
    )

    seen: set = set()

    def add_item(cat: str, tipo: str, label: str) -> None:
        key = (cat, tipo)
        if tipo == "otro" or key in seen:
            return
        seen.add(key)
        aplica = _doc_aplica_al_colaborador(trab, cat, tipo)
        adjunto = key in vigentes
        estado = _estado_documento_checklist(
            aplica=aplica,
            adjunto=adjunto,
            auditoria_ok=auditoria_ok if isinstance(auditoria_ok, bool) else None,
            opcional=es_doc_opcional(cat, tipo),
        )
        items.append({"label": label, "estado": estado, "categoria": cat, "tipo": tipo})

    for cat, tipos in (
        ("soporte", DOC_TIPOS_SOPORTE),
        ("ingreso", DOC_TIPOS_INGRESO),
        ("bancario", DOC_TIPOS_BANCARIO),
        ("afiliacion", DOC_TIPOS_AFILIACION),
    ):
        for tipo, label in tipos:
            add_item(cat, tipo, label)

    for cat, tipo, label in _custom_tipos_catalogo(sb, int(contrato_id or 0) or 0):
        add_item(cat, tipo, label)

    for d in docs:
        if not d.get("vigente"):
            continue
        t = d.get("tipo") or ""
        cat = d.get("categoria") or "soporte"
        if t.startswith("ext_") or d.get("tipo_otro_texto"):
            label = d.get("tipo_otro_texto") or DOC_TIPO_LABEL.get(t) or t
            add_item(cat, t, label)

    return items


def _merge_pdfs(portada: bytes, adjuntos: List[bytes]) -> bytes:
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    for blob in [portada, *adjuntos]:
        try:
            reader = PdfReader(io.BytesIO(blob), strict=False)
            for page in reader.pages:
                writer.add_page(page)
        except Exception as exc:
            _log.warning("omit pdf page merge: %s", exc)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def set_validacion(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    estado: str,
    observacion: Optional[str] = None,
    current_user=None,
) -> dict:
    """
    Cambia estado de validación.
    Aprobado exige haber ejecutado al menos una auditoría (los hallazgos
    NO bloquean: la decisión queda bajo responsabilidad de quien aprueba).
    """
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    est = (estado or "").strip().lower()
    if est not in ("pendiente", "aprobado", "rechazado"):
        raise ValueError("Estado de validación inválido.")

    if trab.get("doc_bloqueado") and est != trab.get("doc_validacion_estado"):
        raise ValueError("La documentación está bloqueada; no se puede cambiar la validación.")

    if est == "aprobado":
        if not auditoria_fue_ejecutada(trab):
            raise ValueError(
                "No se puede aprobar: ejecute primero la auditoría documental "
                "al menos una vez. Los hallazgos no impiden aprobar, pero la "
                "plataforma debe haber alertado lo encontrado."
            )
        return _aprobar_y_consolidar_pdf(
            sb, contrato_id, trabajador_id, trab,
            observacion=observacion, current_user=current_user,
        )

    if est in ("pendiente", "rechazado") and not (observacion or "").strip():
        # observación recomendada; obligatoria para rechazado
        if est == "rechazado":
            raise ValueError("Indique la causal/observación del rechazo.")

    upd = {
        "doc_validacion_estado": est,
        "doc_validacion_observacion": (observacion or "").strip()[:4000] or None,
        "doc_validacion_en": _now_iso(),
        "doc_validacion_por": _uid(current_user),
        "updated_at": _now_iso(),
        "updated_by": _uid(current_user),
    }
    rows = (
        sb.table(_TABLE)
        .update(upd)
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {**trab, **upd}


def _aprobar_y_consolidar_pdf(
    sb,
    contrato_id: int,
    trabajador_id: int,
    trab: dict,
    *,
    observacion: Optional[str],
    current_user,
) -> dict:
    consolidado, nombre_base, _n = build_pdf_consolidado_bytes(
        sb, contrato_id, trabajador_id, trab=trab
    )
    nombre = f"documentacion_consolidada_{trab.get('numero_documento') or trabajador_id}.pdf"
    blob_path = path_rrhh_doc_consolidado(int(contrato_id), int(trabajador_id), nombre)
    upload_blob_private(blob_path, consolidado, content_type="application/pdf")

    docs = [d for d in list_documentos(sb, contrato_id, trabajador_id) if d.get("vigente")]
    # Eliminar adjuntos individuales del storage y soft-delete DB
    for d in docs:
        path = d.get("azure_blob_path")
        if path:
            try:
                delete_blob_private(path)
            except Exception as exc:
                _log.warning("delete blob %s: %s", path, exc)
        sb.table(_TABLE_DOCS).update({
            "eliminado_en": _now_iso(),
            "eliminado_por": _uid(current_user),
            "vigente": False,
            "notas": ((d.get("notas") or "") + " | Eliminado tras consolidación").strip(" |"),
        }).eq("id", d["id"]).execute()

    upd = {
        "doc_validacion_estado": "aprobado",
        "doc_validacion_observacion": (observacion or "").strip()[:4000] or None,
        "doc_validacion_en": _now_iso(),
        "doc_validacion_por": _uid(current_user),
        "doc_consolidado_blob_path": blob_path,
        "doc_consolidado_nombre": nombre,
        "doc_bloqueado": True,
        "updated_at": _now_iso(),
        "updated_by": _uid(current_user),
    }
    rows = (
        sb.table(_TABLE)
        .update(upd)
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {**trab, **upd}


def download_doc_consolidado(sb, contrato_id: int, trabajador_id: int) -> Tuple[bytes, str]:
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    path = trab.get("doc_consolidado_blob_path")
    if not path:
        raise ValueError("No hay PDF consolidado para este colaborador.")
    data = download_blob_bytes_private(path)
    return data, trab.get("doc_consolidado_nombre") or "documentacion_consolidada.pdf"


def _filas_ultima_auditoria(sb, trab: dict) -> List[dict]:
    """Filas del último informe (tabla) — desde historial o resultado embebido."""
    informe_id = trab.get("doc_auditoria_informe_id")
    if informe_id:
        try:
            rows = (
                sb.table(_TABLE_AUDITORIA)
                .select("filas, ejecutado_en, ejecutado_por")
                .eq("id", int(informe_id))
                .limit(1)
                .execute()
                .data
                or []
            )
            if rows and isinstance(rows[0].get("filas"), list):
                return list(rows[0]["filas"])
        except Exception as exc:
            _log.warning("leer informe auditoría %s: %s", informe_id, exc)
    res = trab.get("doc_auditoria_resultado") or {}
    if isinstance(res, dict) and isinstance(res.get("filas"), list):
        return list(res["filas"])
    return []


def _build_auditoria_tabla_html(trab: dict, filas: List[dict]) -> str:
    """Última sección del consolidado: informe de auditoría en formato tabla."""
    import html as html_mod

    def esc(v):
        return html_mod.escape(str(v if v is not None else "—"))

    fecha = trab.get("doc_auditoria_en") or "—"
    body = ""
    for f in filas or []:
        body += (
            "<tr>"
            f"<td>{esc(f.get('ubicacion'))}</td>"
            f"<td>{esc(f.get('archivo'))}</td>"
            f"<td style='text-align:center'>{esc(f.get('version'))}</td>"
            f"<td>{esc(f.get('hallazgo'))}</td>"
            "</tr>"
        )
    if not body:
        body = (
            "<tr><td colspan='4' style='text-align:center;color:#64748b;'>"
            "Sin filas de auditoría registradas.</td></tr>"
        )
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page {{ size: letter; margin: 14mm; }}
  body {{ font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: #0F2942; }}
  h1 {{ font-size: 13pt; margin: 0 0 6px 0; color: #0F2942; }}
  .meta {{ font-size: 8pt; color: #64748b; margin-bottom: 10px; }}
  table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  th, td {{ border: 1px solid #94A3B8; padding: 5px 6px; vertical-align: top; word-wrap: break-word; }}
  th {{ background: #DDEFF8; font-size: 8pt; text-align: left; }}
  th.ver {{ width: 12%; text-align: center; }}
  td {{ font-size: 8pt; }}
</style></head><body>
<h1>Informe de auditoría documental</h1>
<div class="meta">Última ejecución: {esc(fecha)} · Constancia al momento de la aprobación</div>
<table>
<thead>
<tr>
  <th style="width:28%">Ubicación - Tipo de documento</th>
  <th style="width:22%">Archivo</th>
  <th class="ver">Versión</th>
  <th style="width:38%">Hallazgo</th>
</tr>
</thead>
<tbody>
{body}
</tbody>
</table>
</body></html>"""


def build_pdf_consolidado_bytes(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    trab: Optional[dict] = None,
) -> Tuple[bytes, str, int]:
    """
    Genera el PDF consolidado con los documentos vigentes actuales
    (incluye contrato laboral generado/cargado) y el último informe de
    auditoría como sección final.
    No modifica storage ni estado de validación.
    Retorna (pdf_bytes, filename, n_adjuntos).
    """
    from topografia_utils import to_pdf_bytes

    trabajador = trab or get_trabajador(sb, contrato_id, trabajador_id)
    # Expediente completo: docs de soporte/… + contrato laboral
    adjuntos_meta = _expediente_adjuntos_meta(sb, contrato_id, trabajador_id)
    pairs = _cargar_blobs(adjuntos_meta)
    adjuntos_pdf: List[bytes] = []
    for meta, data in pairs:
        pdf = _blob_a_pdf_bytes(meta, data)
        if pdf:
            adjuntos_pdf.append(pdf)

    docs = [d for d in list_documentos(sb, contrato_id, trabajador_id) if d.get("vigente")]
    checklist = _checklist_items(
        trabajador, docs, sb=sb, contrato_id=contrato_id
    )
    obra = _cargar_contrato_obra(sb, contrato_id)
    foto_url = _foto_data_url(
        trabajador.get("foto_blob_path"), trabajador.get("foto_mime_type") or "image/jpeg"
    )
    firma_url, firma_w, firma_h = _firma_data_url(
        trabajador.get("firma_blob_path"), trabajador.get("firma_mime_type") or "image/png"
    )
    html = _build_portada_html(
        trab=trabajador,
        checklist=checklist,
        foto_data_url=foto_url,
        firma_data_url=firma_url,
        firma_w=firma_w,
        firma_h=firma_h,
        contrato_obra=obra,
    )
    portada = to_pdf_bytes(html, landscape=False)
    partes = list(adjuntos_pdf)

    filas_audit = _filas_ultima_auditoria(sb, trabajador)
    if filas_audit or trabajador.get("doc_auditoria_en"):
        try:
            audit_html = _build_auditoria_tabla_html(trabajador, filas_audit)
            partes.append(to_pdf_bytes(audit_html, landscape=False))
        except Exception as exc:
            _log.warning("sección auditoría en consolidado: %s", exc)

    consolidado = _merge_pdfs(portada, partes)
    nombre = (
        f"preview_documentacion_{trabajador.get('numero_documento') or trabajador_id}.pdf"
    )
    return consolidado, nombre, len(adjuntos_pdf)


def preview_pdf_consolidado(
    sb,
    contrato_id: int,
    trabajador_id: int,
) -> Tuple[bytes, str]:
    """
    Vista previa para Desarrollador: PDF consolidado con docs existentes,
    sin borrar adjuntos ni alterar validación.
    """
    data, nombre, _n = build_pdf_consolidado_bytes(sb, contrato_id, trabajador_id)
    return data, nombre


def eliminar_tipo_documento_otro(
    sb,
    contrato_id: int,
    *,
    categoria: str,
    label: str,
    current_user=None,
) -> dict:
    """Elimina un tipo «otro» del checklist (catálogo) y soft-borra docs de ese tipo."""
    from rrhh_docs_service import slug_tipo_documento
    from rrhh_service import soft_delete_catalogo_opcion

    cat = (categoria or "").strip().lower()
    if cat not in ("soporte", "ingreso"):
        raise ValueError("Solo se pueden eliminar tipos «otro» de soporte o ingreso.")
    catalog_key = "doc_soporte" if cat == "soporte" else "doc_ingreso"
    row = soft_delete_catalogo_opcion(sb, contrato_id, catalog_key, label, current_user)
    slug = slug_tipo_documento(label)
    docs = (
        sb.table(_TABLE_DOCS)
        .select("id, azure_blob_path")
        .eq("contrato_id", int(contrato_id))
        .eq("categoria", cat)
        .eq("tipo", slug)
        .is_("eliminado_en", "null")
        .execute()
        .data
        or []
    )
    for d in docs:
        if d.get("azure_blob_path"):
            try:
                delete_blob_private(d["azure_blob_path"])
            except Exception:
                pass
        sb.table(_TABLE_DOCS).update({
            "eliminado_en": _now_iso(),
            "eliminado_por": _uid(current_user),
            "vigente": False,
        }).eq("id", d["id"]).execute()
    return {"catalogo": row, "documentos_eliminados": len(docs), "tipo": slug}
