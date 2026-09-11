"""
Consolidación documental RRHH: auditoría, validación, PDF consolidado y bloqueo.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_rrhh_doc_consolidado,
    upload_blob_private,
)
from rrhh_auditoria_docs import ejecutar_auditoria_documentacion
from rrhh_docs_service import DOC_TIPO_LABEL, assert_documentacion_editable, list_documentos
from rrhh_service import get_trabajador, trabajador_display_nombre

_log = logging.getLogger("claracore.rrhh.doc_consolidacion")

_TABLE = "rrhh_trabajadores"
_TABLE_DOCS = "rrhh_trabajador_documentos"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(current_user) -> Optional[int]:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError, AttributeError):
        return None


def _docs_vigentes_pdf(sb, contrato_id: int, trabajador_id: int) -> List[dict]:
    docs = list_documentos(sb, contrato_id, trabajador_id)
    out = []
    for d in docs:
        if not d.get("vigente"):
            continue
        mime = (d.get("mime_type") or "").lower()
        path = d.get("azure_blob_path")
        if not path:
            continue
        if "pdf" not in mime and not str(d.get("nombre_archivo") or "").lower().endswith(".pdf"):
            # Incluir imágenes también en consolidado (convertidas después)
            out.append(d)
        else:
            out.append(d)
    return out


def _cargar_blobs(docs: List[dict]) -> List[Tuple[dict, bytes]]:
    pairs = []
    for d in docs:
        try:
            data = download_blob_bytes_private(d["azure_blob_path"])
            if data:
                pairs.append((d, data))
        except Exception as exc:
            _log.warning("No se pudo descargar doc %s: %s", d.get("id"), exc)
    return pairs


def consolidar_documentacion(
    sb,
    contrato_id: int,
    trabajador_id: int,
    current_user=None,
) -> dict:
    """
    Ejecuta auditoría Claude sobre los documentos vigentes.
    Guarda el resultado; NO cambia el estado de validación.
    """
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    assert_documentacion_editable(trab)

    docs = [d for d in _docs_vigentes_pdf(sb, contrato_id, trabajador_id)]
    pairs = _cargar_blobs(docs)
    pdf_blobs = []
    for d, data in pairs:
        mime = (d.get("mime_type") or "").lower()
        if data[:5] == b"%PDF-" or "pdf" in mime:
            pdf_blobs.append(data)
        else:
            # Imágenes: empaquetar como PDF de una página vía reportlab/xhtml no; usar pypdf image?
            # Convert simple: wrap as PDF with fitz if available
            try:
                import fitz
                doc = fitz.open()
                page = doc.new_page()
                page.insert_image(page.rect, stream=data)
                pdf_blobs.append(doc.tobytes())
                doc.close()
            except Exception:
                _log.warning("Omitiendo imagen no convertible doc=%s", d.get("id"))

    if not pdf_blobs:
        raise ValueError("No hay documentos vigentes para consolidar/auditar.")

    audit = ejecutar_auditoria_documentacion(trabajador=trab, pdf_blobs=pdf_blobs)
    observaciones = []
    for h in (audit["resultado"].get("hallazgos") or []):
        est = str(h.get("estado") or "").upper()
        if est in ("DISCREPANCIA", "NO ENCONTRADO"):
            observaciones.append(
                f"{h.get('campo')}: {est} — BD=«{h.get('valor_bd')}» PDF=«{h.get('valor_pdf')}» "
                f"({h.get('detalle') or ''})"
            )
    for a in (audit["resultado"].get("alertas_criticas") or []):
        observaciones.append(str(a))

    obs_text = "\n".join(observaciones) if observaciones else None
    upd = {
        "doc_auditoria_ok": bool(audit["ok"]),
        "doc_auditoria_resultado": audit["resultado"],
        "doc_auditoria_observaciones": obs_text,
        "doc_auditoria_en": _now_iso(),
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
    trab2 = rows[0] if rows else {**trab, **upd}
    return {
        "trabajador": trab2,
        "auditoria": {
            "ok": audit["ok"],
            "tiene_discrepancias": audit["tiene_discrepancias"],
            "resultado": audit["resultado"],
            "observaciones": obs_text,
            "documentos_auditados": len(pdf_blobs),
        },
    }


def _build_portada_html(
    *,
    trab: dict,
    checklist: List[dict],
    foto_data_url: Optional[str],
    firma_data_url: Optional[str],
) -> str:
    import html as html_mod

    def esc(v):
        return html_mod.escape(str(v if v is not None else "—"))

    nombre = trabajador_display_nombre(trab)
    rows = ""
    for item in checklist:
        rows += (
            f"<tr><td>{esc(item['label'])}</td>"
            f"<td style='text-align:center'>{esc(item['estado'])}</td></tr>"
        )
    foto_html = (
        f'<img src="{foto_data_url}" style="width:120px;height:140px;object-fit:cover;border:1px solid #cbd5e1;" />'
        if foto_data_url else '<div style="width:120px;height:140px;border:1px dashed #94a3b8;"></div>'
    )
    firma_html = (
        f'<img src="{firma_data_url}" style="max-width:220px;max-height:80px;" />'
        if firma_data_url else '<div style="height:60px;border-top:1px solid #334155;width:200px;margin-top:40px;"></div>'
    )
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
@page {{ size: letter; margin: 1.5cm; }}
body {{ font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #0f172a; }}
h1 {{ color: #0077B6; text-align: center; font-size: 14pt; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 12pt; }}
th, td {{ border: 1px solid #cbd5e1; padding: 5pt 7pt; }}
th {{ background: #e0f2fe; }}
.meta td {{ border: none; padding: 2pt 6pt; }}
</style></head><body>
<h1>Certificado de cumplimiento documental</h1>
<div style="text-align:center;margin:10pt 0;">{foto_html}</div>
<table class="meta">
<tr><td><b>Colaborador</b></td><td>{esc(nombre)}</td>
<td><b>Documento</b></td><td>{esc(trab.get('tipo_documento'))} {esc(trab.get('numero_documento'))}</td></tr>
<tr><td><b>Cargo</b></td><td>{esc(trab.get('cargo_aspira'))}</td>
<td><b>Fecha ingreso</b></td><td>{esc(trab.get('fecha_ingreso'))}</td></tr>
</table>
<p>Checklist de documentación adjunta:</p>
<table><tr><th>Documento</th><th>Estado</th></tr>{rows}</table>
<div style="margin-top:36pt;text-align:center;">
{firma_html}
<div style="font-size:8.5pt;color:#64748b;margin-top:4pt;">Firma del colaborador</div>
</div>
<p style="margin-top:18pt;font-size:8pt;color:#64748b;text-align:center;">
ClaraCore — Recursos Humanos · Documento generado automáticamente
</p>
</body></html>"""


def _checklist_items(trab: dict, docs: List[dict]) -> List[dict]:
    vigentes = {(d.get("categoria"), d.get("tipo")) for d in docs if d.get("vigente")}
    items = []
    # Soporte / ingreso / bancario / afiliación base
    from rrhh_docs_service import (
        DOC_TIPOS_AFILIACION,
        DOC_TIPOS_BANCARIO,
        DOC_TIPOS_INGRESO,
        DOC_TIPOS_SOPORTE,
    )
    for cat, tipos in (
        ("soporte", DOC_TIPOS_SOPORTE),
        ("ingreso", DOC_TIPOS_INGRESO),
        ("bancario", DOC_TIPOS_BANCARIO),
        ("afiliacion", DOC_TIPOS_AFILIACION),
    ):
        for tipo, label in tipos:
            if tipo == "otro":
                continue
            items.append({
                "label": label,
                "estado": "Cumple" if (cat, tipo) in vigentes else "No aplica",
            })
    # Tipos «otro» / ext_*
    for d in docs:
        if not d.get("vigente"):
            continue
        t = d.get("tipo") or ""
        if t.startswith("ext_") or d.get("tipo_otro_texto"):
            label = d.get("tipo_otro_texto") or DOC_TIPO_LABEL.get(t) or t
            items.append({"label": label, "estado": "Cumple"})
    return items


def _blob_to_data_url(sb_path: Optional[str], mime: str) -> Optional[str]:
    if not sb_path:
        return None
    try:
        import base64
        data = download_blob_bytes_private(sb_path)
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


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
    Cambia estado de validación. Aprobado solo si auditoría OK;
    genera PDF consolidado, elimina adjuntos individuales y bloquea.
    """
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    est = (estado or "").strip().lower()
    if est not in ("pendiente", "aprobado", "rechazado"):
        raise ValueError("Estado de validación inválido.")

    if trab.get("doc_bloqueado") and est != trab.get("doc_validacion_estado"):
        raise ValueError("La documentación está bloqueada; no se puede cambiar la validación.")

    if est == "aprobado":
        if not trab.get("doc_auditoria_ok"):
            raise ValueError(
                "No se puede aprobar: ejecute «Consolidar documentación» y "
                "corrija las diferencias hasta que la auditoría no encuentre discrepancias."
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


def build_pdf_consolidado_bytes(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    trab: Optional[dict] = None,
) -> Tuple[bytes, str, int]:
    """
    Genera el PDF consolidado con los documentos vigentes actuales.
    No modifica storage ni estado de validación.
    Retorna (pdf_bytes, filename, n_adjuntos).
    """
    from topografia_utils import to_pdf_bytes

    trabajador = trab or get_trabajador(sb, contrato_id, trabajador_id)
    docs = [d for d in list_documentos(sb, contrato_id, trabajador_id) if d.get("vigente")]
    pairs = _cargar_blobs(docs)
    adjuntos_pdf: List[bytes] = []
    for d, data in pairs:
        if data[:5] == b"%PDF-":
            adjuntos_pdf.append(data)
        else:
            try:
                import fitz
                doc = fitz.open()
                page = doc.new_page()
                page.insert_image(page.rect, stream=data)
                adjuntos_pdf.append(doc.tobytes())
                doc.close()
            except Exception:
                pass

    checklist = _checklist_items(trabajador, docs)
    foto_url = _blob_to_data_url(
        trabajador.get("foto_blob_path"), trabajador.get("foto_mime_type") or "image/jpeg"
    )
    firma_url = _blob_to_data_url(
        trabajador.get("firma_blob_path"), trabajador.get("firma_mime_type") or "image/png"
    )
    html = _build_portada_html(
        trab=trabajador,
        checklist=checklist,
        foto_data_url=foto_url,
        firma_data_url=firma_url,
    )
    portada = to_pdf_bytes(html)
    consolidado = _merge_pdfs(portada, adjuntos_pdf)
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
