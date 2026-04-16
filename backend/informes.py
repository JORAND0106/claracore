import io
import logging
import html
import math
import os as _os
import re
from datetime import datetime
from typing import Any, Dict, Optional

_log = logging.getLogger("uvicorn.error")
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from xhtml2pdf import pisa
from main import get_current_user as _get_user
from supabase import create_client as _create_client

# ClaraCore Documentación (CCD): código único por tipo de formato (gestión documental).
CODIGO_FORMATO_CCD_CC_SUB_001 = "CC-SUB-001"
_sb = _create_client(
    _os.getenv("SUPABASE_URL", ""),
    _os.getenv("SUPABASE_KEY", "")
)

router = APIRouter(tags=["informes"])


def _safe_filename_part(s: object) -> str:
    """Nombre de archivo seguro para Content-Disposition: solo ASCII (HTTP/latin-1).
    Antes se usaba \\w (Unicode); un acento en razón social rompía el envío de cabeceras → 500 genérico."""
    raw = str(s if s is not None else "").strip()
    t = re.sub(r"[^A-Za-z0-9._\-]+", "_", raw)
    return (t or "x")[:80]


def _nombre_archivo_cc_sub_001(corte: dict, sub: dict, corte_id: int) -> str:
    """Patrón CCD: {CODIGO}_Corte_{n}_{Subcontratista}.pdf (ASCII seguro)."""
    co = corte.get("consecutivo")
    if co is None or co == "":
        co = corte.get("id") if corte.get("id") is not None else corte_id
    try:
        num = f"{int(float(str(co))):02d}"
    except Exception:
        num = _safe_filename_part(str(co))[:12] or "00"
    sub_nom = _safe_filename_part((sub.get("razon_social") or "sub")[:56])
    base = f"{CODIGO_FORMATO_CCD_CC_SUB_001}_Corte_{num}_{sub_nom}.pdf"
    return _safe_filename_part(base.replace(".pdf", "")) + ".pdf"


def _html_logo_contratista(contrato: dict) -> str:
    """Logo del contratista (URL en BD). xhtml2pdf intenta cargar la URL; si falla, queda placeholder."""
    url = contrato.get("logo_contratista")
    if url is None or str(url).strip() == "":
        return (
            '<div style="width:100%;height:100px;display:flex;align-items:center;justify-content:center;'
            'font-size:6.5pt;color:#94a3b8;border:1px dashed #cbd5e1;">LOGO</div>'
        )
    u = html.escape(str(url).strip(), quote=True)
    return (
        f'<img src="{u}" alt="" style="width:100%;max-width:100%;max-height:100px;display:block;margin:0 auto;'
        'object-fit:contain;" />'
    )


def _row(table: str, select: str, **eq: Any) -> Optional[Dict[str, Any]]:
    """Una fila o None; evita excepciones de PostgREST por `.single()` sin resultados."""
    q = _sb.table(table).select(select)
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data or []
    return rows[0] if rows else None


# ── REGISTRO DE FORMATOS ────────────────────────────────────────────────────────
# CC-SUB-001 : Corte Subcontratista
# CC-SUB-002 : Memorias Corte Subcontratista (por ítem)

# ── Selectores ────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/subcontratistas")
def inf_subcontratistas(contrato_id: int, current_user=Depends(_get_user)):
    rows = _sb.table("subcontratistas")\
        .select("id, razon_social, nit, nombre_contacto, telefono")\
        .order("razon_social").execute().data
    return rows or []

@router.get("/{contrato_id}/cortes/{sub_id}")
def inf_cortes(contrato_id: int, sub_id: int, current_user=Depends(_get_user)):
    rows = _sb.table("subcontratista_cortes").select("*")\
        .eq("subcontratista_id", sub_id)\
        .order("consecutivo").execute().data
    return rows or []

@router.get("/{contrato_id}/items-corte/{corte_id}")
def inf_items_corte(contrato_id: int, corte_id: int, current_user=Depends(_get_user)):
    """Ítems únicos aprobados por el sub en un corte dado."""
    rows = _sb.table("so_registros")\
        .select("item_numero, item_descripcion, unidad")\
        .eq("contrato_id", contrato_id)\
        .eq("corte_id", corte_id)\
        .eq("sub_estado", "Aprobado")\
        .execute().data or []
    seen = {}
    for r in rows:
        k = r.get("item_numero")
        if k and k not in seen:
            seen[k] = r
    return list(seen.values())


def _contexto_corte_sub(contrato_id: int, corte_id: int, current_user: dict) -> Dict[str, Any]:
    """Datos compartidos por vista previa (JSON) y PDF."""
    if not isinstance(current_user, dict):
        try:
            current_user = dict(current_user)
        except Exception:
            current_user = {}

    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")

    corte = _row("subcontratista_cortes", "*", id=corte_id)
    if not corte:
        raise HTTPException(404, "Corte no encontrado")

    sub_id = corte.get("subcontratista_id")
    if sub_id is None:
        raise HTTPException(400, "Corte sin subcontratista asociado (subcontratista_id nulo)")

    sub = _row(
        "subcontratistas",
        "razon_social, nit, nombre_contacto, objeto_contrato",
        id=sub_id,
    ) or {}

    try:
        try:
            registros = _sb.table("so_registros")\
                .select("item_numero, item_descripcion, unidad, cantidad_total, vlr_unitario_subcontratista, capitulo")\
                .eq("contrato_id", contrato_id)\
                .eq("corte_id", corte_id)\
                .eq("sub_estado", "Aprobado")\
                .execute().data or []
        except Exception as e0:
            err = str(e0).lower()
            if "capitulo" in err or "column" in err or "schema cache" in err:
                _log.warning("so_registros sin columna capitulo; reintento sin ella: %s", e0)
                registros = _sb.table("so_registros")\
                    .select("item_numero, item_descripcion, unidad, cantidad_total, vlr_unitario_subcontratista")\
                    .eq("contrato_id", contrato_id)\
                    .eq("corte_id", corte_id)\
                    .eq("sub_estado", "Aprobado")\
                    .execute().data or []
            else:
                raise
    except Exception as e:
        _log.exception("so_registros corte sub")
        raise HTTPException(503, f"No se pudieron leer las cantidades aprobadas: {e!s}") from e

    items_map = {}
    for r in registros:
        k = r.get("item_numero") or "SIN_ITEM"
        if k not in items_map:
            items_map[k] = {
                "item_numero":      r.get("item_numero", ""),
                "item_descripcion": r.get("item_descripcion", ""),
                "unidad":           r.get("unidad", ""),
                "cantidad":         0.0,
                "vlr_unitario_sub": 0.0,
                "costo_directo":    0.0,
                "capitulo":         "",
            }
        cap = str(r.get("capitulo") or "").strip()
        if cap and not items_map[k].get("capitulo"):
            items_map[k]["capitulo"] = cap
        items_map[k]["cantidad"] += _sf(r.get("cantidad_total"), 0.0)
        vu = _sf(r.get("vlr_unitario_subcontratista"), 0.0)
        if items_map[k]["vlr_unitario_sub"] == 0.0 and vu != 0.0:
            items_map[k]["vlr_unitario_sub"] = vu

    for _k, it in items_map.items():
        cd = _sf(it.get("cantidad"), 0.0) * _sf(it.get("vlr_unitario_sub"), 0.0)
        if not math.isfinite(cd):
            cd = 0.0
        it["costo_directo"] = cd

    items = list(items_map.values())
    total_costo = sum(_sf(i.get("costo_directo"), 0.0) for i in items)
    if not math.isfinite(total_costo):
        total_costo = 0.0

    usuario_nombre = f"{current_user.get('nombre','')} {current_user.get('apellidos','')}".strip() or "—"
    usuario_cargo = current_user.get("cargo_nombre", "—") or "—"

    return {
        "contrato": contrato,
        "sub": sub,
        "corte": corte,
        "items": items,
        "total_costo": total_costo,
        "usuario_nombre": usuario_nombre,
        "usuario_cargo": usuario_cargo,
    }


def _contexto_memoria_item(
    contrato_id: int, corte_id: int, item_numero: str, current_user: dict
) -> Dict[str, Any]:
    if not isinstance(current_user, dict):
        try:
            current_user = dict(current_user)
        except Exception:
            current_user = {}

    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")

    corte = _row("subcontratista_cortes", "*", id=corte_id)
    if not corte:
        raise HTTPException(404, "Corte no encontrado")

    mem_sub_id = corte.get("subcontratista_id")
    if mem_sub_id is None:
        raise HTTPException(400, "Corte sin subcontratista asociado (subcontratista_id nulo)")

    sub = _row(
        "subcontratistas",
        "razon_social, nit, nombre_contacto, objeto_contrato",
        id=mem_sub_id,
    ) or {}

    registros = _sb.table("so_registros")\
        .select("numero_registro, abs_inicio, abs_final, pk_id_id, pk_ids(pk_id), calzada, longitud, ancho, espesor, cantidad, cantidad_total, observacion, foto_url, foto_numero, item_numero, item_descripcion, unidad")\
        .eq("contrato_id", contrato_id)\
        .eq("corte_id", corte_id)\
        .eq("sub_estado", "Aprobado")\
        .ilike("item_numero", f"%{item_numero}%")\
        .order("numero_registro")\
        .execute().data or []

    if not registros:
        raise HTTPException(404, "No hay registros aprobados para este ítem en el corte")

    item_info = {
        "item_numero":      registros[0].get("item_numero", item_numero),
        "item_descripcion": registros[0].get("item_descripcion", ""),
        "unidad":           registros[0].get("unidad", ""),
    }

    usuario_nombre = f"{current_user.get('nombre','')} {current_user.get('apellidos','')}".strip() or "—"
    usuario_cargo = current_user.get("cargo_nombre", "—") or "—"

    return {
        "contrato": contrato,
        "sub": sub,
        "corte": corte,
        "item_info": item_info,
        "registros": registros,
        "usuario_nombre": usuario_nombre,
        "usuario_cargo": usuario_cargo,
    }


# ── CC-SUB-001 : Corte Subcontratista ─────────────────────────────────────────

def _respuesta_json_corte(contrato_id: int, corte_id: int, current_user: dict) -> Dict[str, Any]:
    ctx = _contexto_corte_sub(contrato_id, corte_id, current_user)
    return {"formato": "CC-SUB-001", **ctx}


def _respuesta_json_memoria(contrato_id: int, corte_id: int, item_numero: str, current_user: dict) -> Dict[str, Any]:
    ctx = _contexto_memoria_item(contrato_id, corte_id, item_numero, current_user)
    return {"formato": "CC-SUB-002", **ctx}


# Rutas JSON de vista previa: definidas en main.py (evita duplicar y asegura registro en la app).

@router.get("/test-sin-auth")
def test_sin_auth():
    return {"ok": True}

@router.get("/{contrato_id}/pdf/corte-subcontratista/{corte_id}", dependencies=[])
def pdf_corte_sub(contrato_id: int, corte_id: int, current_user: dict = {}):
    try:
        try:
            ctx = _contexto_corte_sub(contrato_id, corte_id, current_user)
        except HTTPException:
            raise
        except Exception as e:
            _log.exception("pdf_corte_sub: contexto")
            raise HTTPException(503, f"No se pudieron cargar los datos del informe: {e!s}") from e

        contrato = ctx["contrato"]
        sub = ctx["sub"]
        corte = ctx["corte"]
        items = ctx["items"]
        total_costo = ctx["total_costo"]
        usuario_nombre = ctx["usuario_nombre"]
        usuario_cargo = ctx["usuario_cargo"]

        # 1º plantilla v1 plana (sin BASE_CSS, sin pdf:nextpage) — máxima estabilidad con xhtml2pdf.
        # 2º modo seguro · 3º mínima · 4º PDF genérico si pisa falla con todo lo anterior.
        errs: list[str] = []
        pdf_bytes: bytes | None = None
        for name, fn in (
            ("v1_plana", lambda: _html_cc_sub_v1_plain(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo)),
            ("modo_seguro", lambda: _html_corte_sub_fallback(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo)),
            ("minima", lambda: _html_corte_sub_minima(
                contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo, "prev", "prev",
            )),
        ):
            try:
                pdf_bytes = _to_pdf(fn())
                break
            except Exception as e:
                errs.append(f"{name}:{e!s}"[:220])
                _log.warning("pdf_corte_sub falló %s: %s", name, e)

        if pdf_bytes is None:
            try:
                # Importante: construir HTML dentro del try; si falla (p. ej. tipo raro en BD), no debe escapar sin HTTPException.
                html_last = _html_cc_sub_v1_plain(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo)
                pdf_bytes = _to_pdf_corte_garantizado(html_last)
            except Exception as e:
                _log.exception("pdf_corte_sub: sin PDF tras cadena de respaldo")
                raise HTTPException(
                    status_code=500,
                    detail="PDF corte: " + " | ".join(errs)[:900] + f" | garantizado: {e!s}"[:1200],
                ) from e

        fname = _nombre_archivo_cc_sub_001(corte, sub, corte_id)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print("ERROR pdf_corte_sub:", tb, flush=True)
        raise HTTPException(status_code=500, detail=f"PDF corte: {type(e).__name__}: {e!s} | {tb[-500:]}") from e

# ── CC-SUB-002 : Memorias Corte Subcontratista ─────────────────────────────────

@router.get("/{contrato_id}/pdf/memoria-item/{corte_id}")
def pdf_memoria_item(
    contrato_id: int,
    corte_id:    int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user)
):
    try:
        ctx = _contexto_memoria_item(contrato_id, corte_id, item_numero, current_user)
        contrato = ctx["contrato"]
        sub = ctx["sub"]
        corte = ctx["corte"]
        item_info = ctx["item_info"]
        registros = ctx["registros"]
        usuario_nombre = ctx["usuario_nombre"]
        usuario_cargo = ctx["usuario_cargo"]

        try:
            html = _html_memoria_item(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo)
            pdf_bytes = _to_pdf(html)
        except Exception as e:
            _log.exception("pdf_memoria_item: fallo HTML/PDF, intento plantilla mínima")
            try:
                html_min = _html_memoria_minima(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo, str(e))
                pdf_bytes = _to_pdf(html_min)
            except Exception as e2:
                raise HTTPException(500, f"Error generando PDF memoria: {e!s} | mínima: {e2!s}") from e2

        item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
        fname = _safe_filename_part(f"CC-SUB-002_Corte{corte.get('consecutivo', '')}_{item_safe}.pdf")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("pdf_memoria_item: error no controlado")
        raise HTTPException(500, f"Error interno memoria PDF: {repr(e)}")

# ── Preview / desarrollo ───────────────────────────────────────────────────────

@router.get("/preview/corte-sub-001")
def preview_corte_sub():
    contrato = {
        "numero": "IDU-1551-2017",
        "objeto": "Mantenimiento y rehabilitación de la malla vial local",
        "contratista": "CONSORCIO CONCRESCOL INZIGNIA",
        "nit": "901.234.567-8",
        "interventoria": "SETEC INGENIEROS CONSULTORES",
        "logo_contratista": None
    }
    sub = {
        "razon_social": "SOILING SAS",
        "nit": "900.512.882-1",
        "nombre_contacto": "Carlos Soiling",
        "objeto_contrato": "Excavaciones y perforaciones"
    }
    corte = {
        "consecutivo": 5,
        "fecha_inicio": "2026-03-18",
        "fecha_fin": "2026-04-01",
        "tipo_periodo": "quincenal"
    }
    items = [
        {"capitulo": "IV", "item_numero": "NP-491", "item_descripcion": "PERFORACIÓN PREBARRENADO EN DIAMETRO 3\" HASTA 12M", "unidad": "ML", "cantidad": 144.0, "vlr_unitario_sub": 144716, "costo_directo": 20839104},
        {"capitulo": "IV", "item_numero": "NP-492", "item_descripcion": "EXCAVACIÓN MANUAL EN MATERIAL COMÚN", "unidad": "M3", "cantidad": 38.5, "vlr_unitario_sub": 85000, "costo_directo": 3272500},
        {"capitulo": "IV", "item_numero": "NP-493", "item_descripcion": "RELLENO COMPACTADO CON MATERIAL SELECCIONADO", "unidad": "M3", "cantidad": 22.0, "vlr_unitario_sub": 120000, "costo_directo": 2640000},
        {"capitulo": "IV", "item_numero": "NP-494", "item_descripcion": "SUMINISTRO E INSTALACIÓN TUBERÍA PVC D=8\"", "unidad": "ML", "cantidad": 65.0, "vlr_unitario_sub": 195000, "costo_directo": 12675000},
        {"capitulo": "IV", "item_numero": "NP-495", "item_descripcion": "CONCRETO DE LIMPIEZA f'c=140 kg/cm2", "unidad": "M3", "cantidad": 8.2, "vlr_unitario_sub": 380000, "costo_directo": 3116000},
    ]
    total_costo = sum(i["costo_directo"] for i in items)
    html = _html_cc_sub_v1_plain(contrato, sub, corte, items, total_costo, "Jorge Andrés Jaimes", "Desarrollador / Controlador de Obra")
    pdf_bytes = _to_pdf(html)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "inline; filename=preview_CC-SUB-001.pdf"})

# ── Utilidades ─────────────────────────────────────────────────────────────────

def _to_pdf(html: str) -> bytes:
    """Genera PDF. xhtml2pdf a veces marca `err` por advertencias aun con salida válida."""
    buf = io.BytesIO()
    # StringIO + caracteres raros en Windows puede fallar; UTF-8 explícito reduce errores 500.
    src = io.BytesIO(html.encode("utf-8", errors="replace"))
    result = pisa.CreatePDF(src, dest=buf, encoding="utf-8")
    buf.seek(0)
    out = buf.read()
    if not out:
        raise ValueError("xhtml2pdf no produjo bytes (PDF vacío)")
    if getattr(result, "err", 0):
        _log.warning("xhtml2pdf reportó advertencias (err=%s); se devuelve PDF de %s bytes", result.err, len(out))
    return out


def _to_pdf_corte_garantizado(html: str) -> bytes:
    """Intenta PDF; si falla, HTML mínimo de una línea (siempre debe producir bytes)."""
    try:
        return _to_pdf(html)
    except Exception as e:
        _log.warning("pisa falló primer HTML (%s); intento mínimo", e)
        try:
            return _to_pdf(
                "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/></head><body>"
                "<p style=\"font-family:Arial\">ClaraCore: el informe no pudo renderizarse con la plantilla. "
                "Contacte soporte o reintente.</p></body></html>"
            )
        except Exception as e2:
            _log.exception("pisa falló incluso HTML mínimo: %s", e2)
            raise RuntimeError(f"pisa: {e!s} | minimo: {e2!s}") from e2

def _fd(d):
    """Formatea fecha ISO → dd/mm/yyyy."""
    if not d: return "—"
    try:    return datetime.fromisoformat(str(d)).strftime("%d/%m/%Y")
    except: return str(d)

def _fn(n, dec=2):
    """Formatea número con decimales (inf/nan no rompen el PDF: format ',.' falla con inf)."""
    if n is None: return "—"
    try:
        x = float(n)
        if math.isnan(x):
            return "—"
        if math.isinf(x):
            return "> max" if x > 0 else "< min"
        return f"{x:,.{dec}f}"
    except Exception:
        return str(n)

def _sf(n, default=0.0):
    """Convierte a float sin romper el endpoint (strings, comas, vacíos)."""
    if n is None or n == "":
        return float(default)
    try:
        return float(n)
    except Exception:
        try:
            return float(str(n).replace(",", "").replace(" ", "").strip())
        except Exception:
            return float(default)

def _fm(n):
    """Formatea como moneda colombiana (evita ValueError con inf en f'{x:,.0f}')."""
    if n is None: return "—"
    try:
        x = float(n)
        if math.isnan(x):
            return "—"
        if math.isinf(x):
            return "$ (valor fuera de rango)"
        return f"$ {x:,.0f}"
    except Exception:
        return str(n)

def _h(v):
    """Escape de caracteres especiales para HTML/PDF."""
    return html.escape("" if v is None else str(v), quote=True)

# ── CSS base (compatible xhtml2pdf) ────────────────────────────────────────────

BASE_CSS = """
@page {
    size: letter;
    margin: 1.2cm 1.2cm 1.4cm 1.2cm;
}
body { font-family: Arial, sans-serif; font-size: 8pt; color: #1a1a2e; }
table { border-collapse: collapse; }
.w100 { width: 100%; }
.hdr-outer { width: 100%; border: 1px solid #9ca3af; margin-bottom: 6px; }
.hdr-logo  { width: 150px; border-right: 1px solid #9ca3af; padding: 6px; text-align: center; vertical-align: middle; }
.hdr-logo img { max-width: 138px; max-height: 48px; }
.hdr-main  { padding: 5px 8px; vertical-align: middle; text-align: center; }
.doc-title { font-size: 10.5pt; font-weight: bold; color: #111827; text-transform: uppercase; }
.doc-code  { font-size: 10pt; font-weight: bold; color: #374151; margin: 2px 0 4px 0; text-align: center; }
.lbl { color: #555; font-weight: normal; }
.val { font-weight: bold; color: #1a1a2e; }
.section-bar {
    background: #e5e7eb; color: #111827;
    font-size: 8pt; font-weight: bold;
    border: 1px solid #9ca3af;
    padding: 3px 8px; margin: 6px 0 3px 0;
}
.data-th {
    background: #f3f4f6; color: #111827;
    font-weight: bold; padding: 4px 5px;
    border: 1px solid #9ca3af; text-align: center;
    font-size: 7.5pt;
}
.data-td {
    padding: 3px 5px;
    border: 1px solid #e2e8f0;
    font-size: 7.5pt;
    vertical-align: middle;
}
.even { background: #f8fafc; }
.total-td {
    background: #e5e7eb; color: #111827;
    font-weight: bold; padding: 4px 5px;
    border: 1px solid #9ca3af; font-size: 7.5pt;
}
.firma-linea { border-top: 1px solid #333; margin-top: 55px; margin-bottom: 4px; }
.firma-nombre { font-weight: bold; font-size: 8pt; }
.firma-cargo  { font-size: 7pt; color: #555; }
.firma-dato   { font-size: 7pt; color: #333; }
.foto-caption { font-size: 7pt; color: #555; margin-top: 3px; text-align: center; }
.sep { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
.doc-meta td { border: 1px solid #9ca3af; padding: 3px 5px; font-size: 7.4pt; vertical-align: top; }
.doc-footer {
    margin-top: 8px;
    border-top: 1px solid #9ca3af;
    padding-top: 4px;
    font-size: 6.7pt;
    color: #4b5563;
    text-align: center;
}
"""

# ── Template CC-SUB-001 (réplica maqueta institucional; sin <pdf:nextpage/>; tablas + estilos inline) ──

def _fmt_informe_fecha_generacion() -> str:
    """Ej.: 15 Abr 26, 02:04 pm (alineado a la maqueta)."""
    n = datetime.now()
    meses = ("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")
    h12 = n.strftime("%I").lstrip("0") or "12"
    mi = n.strftime("%M")
    ap = n.strftime("%p").lower()
    return f"{n.day:02d} {meses[n.month - 1]} {n.year % 100:02d}, {h12}:{mi} {ap}"


def _sello_verificado_por(usuario_nombre: str) -> str:
    nom = (usuario_nombre or "—").strip().upper()
    n = datetime.now()
    return f"Verificado y aprobado por: {nom} {n.strftime('%Y.%m.%d')} - {n.strftime('%H:%M:%S')}"


def _corte_consecutivo_fmt(corte: dict) -> str:
    co = corte.get("consecutivo")
    if co is None or co == "":
        return "—"
    try:
        return f"{int(float(str(co))):02d}"
    except Exception:
        return str(co)


def _html_cc_sub_v1_plain(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo) -> str:
    """CC-SUB-001 compacto: encabezado y metadatos reducidos, tabla optimizada y 3 firmas."""
    bd = "border:1px solid #9ca3af"
    bd_blk = "border:1px solid #1f2937"
    codigo_ccd = CODIGO_FORMATO_CCD_CC_SUB_001
    logo_html = _html_logo_contratista(contrato)
    filas: list[str] = []
    for item in items:
        cap = (item.get("capitulo") or "").strip() or "—"
        desc = str(item.get("item_descripcion", "") or "").lower()
        filas.append(
            "<tr>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;vertical-align:top\">{_h(cap)}</td>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;vertical-align:top\">{_h(item.get('item_numero', ''))}</td>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:left\">{_h(desc)}</td>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:center\">{_h(item.get('unidad', ''))}</td>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fm(item.get('vlr_unitario_sub'))}</td>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fn(item.get('cantidad'))}</td>"
            f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fm(item.get('costo_directo'))}</td>"
            "</tr>"
        )
    body_rows = "".join(filas) if filas else (
        f"<tr><td colspan=\"7\" style=\"{bd};padding:5px;font-size:7pt;color:#6b7280\">"
        "Sin ítems con estado Aprobado en este corte.</td></tr>"
    )

    fecha_gen = _fmt_informe_fecha_generacion()
    corte_lbl = _corte_consecutivo_fmt(corte)
    contratista_nom = _h(str(contrato.get("contratista") or ""))
    interv = _h(str(contrato.get("interventoria") or ""))
    nit_raw = str(contrato.get("nit") or "").strip()
    nit_en_valor = f' <span style="font-size:6.5pt;color:#444;">(NIT: {_h(nit_raw)})</span>' if nit_raw else ""
    rep_sub = _h(str(sub.get("nombre_contacto") or sub.get("razon_social") or "—"))
    linea_firma = "border-top:1px solid #111;margin-top:20px;padding-top:2px;min-height:16px"
    lbl = "font-size:6pt;font-weight:bold;color:#111;text-transform:uppercase;letter-spacing:0.2px;"
    und = "border-bottom:1px solid #1f2937;font-size:7pt;padding:1px 0 2px 0;margin-top:1px;"

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>{codigo_ccd}</title>
<style type="text/css">
@page {{ size: letter; margin: 8mm 10mm; }}
</style></head>
<body style="margin:0;padding:4px;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#111;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;height:252mm;">
<tr><td style="vertical-align:top;padding:0;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd_blk}">
<tr>
<td style="width:20%;{bd_blk};vertical-align:middle;padding:3px;text-align:center;background:#fff;height:64px;">
{logo_html}
</td>
<td style="width:48%;{bd_blk};vertical-align:middle;text-align:center;font-weight:bold;font-size:8.2pt;padding:3px 5px;line-height:1.1;height:64px;">
INFORME CORTE DE SUB CONTRATISTA
</td>
<td style="width:32%;{bd_blk};vertical-align:middle;text-align:center;padding:3px 5px;height:64px;">
<div style="color:#1e3a8a;font-weight:bold;font-size:12.5pt;letter-spacing:0.5px;line-height:1;">{_h(codigo_ccd)}</div>
<div style="font-size:8.5pt;color:#1e3a8a;font-weight:bold;margin-top:2px;">CCD · ClaraCore</div>
</td>
</tr>
<tr><td colspan="3" style="padding:0;border:none;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd_blk};background:#fff">
<tr><td style="padding:2px 6px;border:none;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:none;">
<tr>
<td style="width:25%;padding:0 5px 2px 0;border:none;vertical-align:top;">
<div style="{lbl}">CONTRATO</div>
<div style="{und}">{_h(contrato.get('numero', ''))}</div>
</td>
<td style="width:25%;padding:0 5px 2px 0;border:none;vertical-align:top;">
<div style="{lbl}">FECHA</div>
<div style="{und}">{_h(fecha_gen)}</div>
</td>
<td style="width:25%;padding:0 5px 2px 0;border:none;vertical-align:top;">
<div style="{lbl}">SUB CONTRATISTA</div>
<div style="{und}">{_h(sub.get('razon_social', ''))}</div>
</td>
<td style="width:25%;padding:0 0 2px 0;border:none;vertical-align:top;">
<div style="{lbl}">CORTE</div>
<div style="{und}">{_h(corte_lbl)}</div>
</td>
</tr>
<tr>
<td colspan="2" style="padding:3px 5px 1px 0;border:none;vertical-align:top;">
<div style="{lbl}">CONTRATISTA</div>
<div style="{und}">{contratista_nom}{nit_en_valor}</div>
</td>
<td colspan="2" style="padding:3px 0 1px 0;border:none;vertical-align:top;">
<div style="{lbl}">INTERVENTORÍA</div>
<div style="{und}">{interv}</div>
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>
<tr><td colspan="3" style="padding:0;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<thead>
<tr style="background:#e8e8e8;">
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:16%;">CAPITULO</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:8%;">ITEM</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:left;width:40%;">DESCRIPCIÓN</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:6%;">UNIDAD</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:10%;">VALOR UNIT.</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:9%;">CANTIDAD</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:11%;">COSTO DIR</th>
</tr>
</thead>
<tbody>
{body_rows}
<tr style="background:#dbeafe;">
<td colspan="5" style="{bd};text-align:right;padding:4px 6px;font-weight:bold;font-size:7.5pt;">SUB TOTAL:</td>
<td colspan="2" style="{bd};text-align:right;padding:4px 6px;font-weight:bold;font-size:7.5pt;">{_fm(total_costo)}</td>
</tr>
</tbody>
</table>
</td></tr>
</table>
</td></tr>
<tr><td style="vertical-align:bottom;padding:0;">
  <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd_blk};">
    <tr>
      <td style="width:33.33%;{bd};padding:6px 5px;vertical-align:top;font-size:6.5pt;">
        <div style="font-weight:bold;margin-bottom:2px;">Residente de Costos:</div>
        <div style="{linea_firma}"></div>
        <div style="margin-top:3px;font-size:7pt;font-weight:bold;">{_h(usuario_nombre)}</div>
      </td>
      <td style="width:33.33%;{bd};padding:6px 5px;vertical-align:top;font-size:6.5pt;">
        <div style="font-weight:bold;margin-bottom:2px;">Residente de Obra:</div>
        <div style="{linea_firma}"></div>
      </td>
      <td style="width:33.33%;{bd};padding:6px 5px;vertical-align:top;font-size:6.5pt;">
        <div style="font-weight:bold;margin-bottom:2px;">Sub Contratista:</div>
        <div style="{linea_firma}"></div>
        <div style="margin-top:3px;font-size:7pt;">{rep_sub}</div>
      </td>
    </tr>
  </table>
  <p style="font-size:6pt;color:#64748b;margin-top:6px;text-align:center;">
Período del corte: {_h(_fd(corte.get('fecha_inicio')))} — {_h(_fd(corte.get('fecha_fin')))} · Generado ClaraCore · {_h(usuario_cargo)}
  </p>
</td></tr>
</table>
</body></html>"""


def _html_corte_sub(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo):
    now = datetime.now().strftime("%d %b %y, %I:%M %p")
    # Sin logo en PDF: evita descargas y <img> (xhtml2pdf es frágil con imágenes/data URI largas).
    logo_td = "<span style='font-size:7pt;color:#6b7280'>LOGO CONTRATISTA</span>"

    ROWS_PER_PAGE = 40

    def bloque_encabezado():
        return f"""
<table class="w100 hdr-outer">
  <tr>
    <td class="hdr-logo">{logo_td}</td>
    <td class="hdr-main" style="border-right:1px solid #9ca3af"><div class="doc-title">INFORME CORTE DE SUB CONTRATISTA</div></td>
    <td class="hdr-main" style="width:190px;border-right:1px solid #9ca3af"><div class="doc-code">UNION TEMPORAL MURCON</div></td>
    <td class="hdr-main" style="width:95px"><div class="doc-code">SICOE</div></td>
  </tr>
</table>
<table class="w100 doc-meta">
  <tr>
    <td style="width:25%"><span class="lbl">CONTRATO</span><br/><span class="val">{_h(contrato.get('numero',''))}</span></td>
    <td style="width:20%"><span class="lbl">FECHA:</span><br/><span class="val">{_h(now)}</span></td>
    <td style="width:40%"><span class="lbl">SUB CONTRATISTA:</span><br/><span class="val">{_h((sub.get('razon_social','') or '').upper())}</span></td>
    <td style="width:15%"><span class="lbl">CORTE</span><br/><span class="val">{_h(corte.get('consecutivo',''))}</span></td>
  </tr>
  <tr>
    <td colspan="2"><span class="lbl">CONTRATISTA:</span><br/><span class="val">{_h(contrato.get('contratista',''))}</span></td>
    <td colspan="2"><span class="lbl">INTERVENTORÍA:</span><br/><span class="val">{_h(contrato.get('interventoria',''))}</span></td>
  </tr>
  <tr>
    <td colspan="4"><span class="lbl">NIT SUB:</span><br/><span class="val">{_h(sub.get('nit',''))}</span></td>
  </tr>
</table>
"""

    chunks = [items[i:i + ROWS_PER_PAGE] for i in range(0, len(items), ROWS_PER_PAGE)] or [[]]
    tablas = ""
    for ci, chunk in enumerate(chunks):
        if ci > 0:
            tablas += "<pdf:nextpage />"
        tablas += bloque_encabezado()
        tablas += """
<div class="section-bar">CANTIDADES APROBADAS POR SUBCONTRATISTA</div>
<table class="w100">
  <tr>
    <th class="data-th" style="width:10%">ITEM</th>
    <th class="data-th" style="width:8%">UNIDAD</th>
    <th class="data-th" style="width:12%">CANTIDAD</th>
    <th class="data-th" style="width:16%">VALOR UNIT.</th>
    <th class="data-th" style="width:18%">COSTO DIR.</th>
    <th class="data-th" style="width:36%">DESCRIPCIÓN</th>
  </tr>
"""
        for i, item in enumerate(chunk):
            cls = "even" if i % 2 == 0 else ""
            tablas += f"""<tr class="{cls}">
            <td class="data-td" style="text-align:center">{_h(item.get('item_numero',''))}</td>
            <td class="data-td" style="text-align:center">{_h(item.get('unidad',''))}</td>
            <td class="data-td" style="text-align:right">{_fn(item.get('cantidad'))}</td>
            <td class="data-td" style="text-align:right">{_fm(item.get('vlr_unitario_sub'))}</td>
            <td class="data-td" style="text-align:right">{_fm(item.get('costo_directo'))}</td>
            <td class="data-td">{_h(item.get('item_descripcion',''))}</td>
        </tr>"""
        if ci == len(chunks) - 1:
            tablas += f"""
  <tr>
    <td class="total-td" colspan="4" style="text-align:right;padding-right:10px">SUB TOTAL:</td>
    <td class="total-td" style="text-align:right">{_fm(total_costo)}</td>
    <td class="total-td"></td>
  </tr>
"""
        tablas += "</table>"

    # Sin bloque de firmas (xhtml2pdf es inestable con saltos extra + tablas de firmas). Se reintroducirá en una versión posterior.
    pie_periodo = (
        f"Período del corte: {_fd(corte.get('fecha_inicio'))} — {_fd(corte.get('fecha_fin'))}. "
        f"Generado en sesión: {_h(usuario_nombre)} ({_h(usuario_cargo)})."
    )

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>{BASE_CSS}
</style></head><body>
{tablas}

<p style="font-size:7.5pt;color:#555;margin:10px 0 6px 0">{pie_periodo}</p>
<div class="doc-footer">
  Documento institucional de control interno. Prohibida su reproduccion parcial o total sin autorizacion escrita.
</div>

</body></html>"""

def _html_corte_sub_fallback(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo):
    """Plantilla simple y estable (sin logo ni layout complejo) para no bloquear operación."""
    filas = ""
    for item in items:
        filas += f"""<tr>
          <td style="border:1px solid #999;padding:4px">{_h(item.get('item_numero',''))}</td>
          <td style="border:1px solid #999;padding:4px">{_h(item.get('item_descripcion',''))}</td>
          <td style="border:1px solid #999;padding:4px;text-align:center">{_h(item.get('unidad',''))}</td>
          <td style="border:1px solid #999;padding:4px;text-align:right">{_fn(item.get('cantidad',0))}</td>
          <td style="border:1px solid #999;padding:4px;text-align:right">{_fm(item.get('vlr_unitario_sub',0))}</td>
          <td style="border:1px solid #999;padding:4px;text-align:right">{_fm(item.get('costo_directo',0))}</td>
        </tr>"""

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;font-size:9pt;color:#111">
  <h2 style="margin:0 0 6px 0">INFORME CORTE DE SUB CONTRATISTA (MODO SEGURO)</h2>
  <div style="margin-bottom:8px">
    <b>Contrato:</b> {_h(contrato.get('numero',''))} &nbsp;|&nbsp;
    <b>Subcontratista:</b> {_h(sub.get('razon_social',''))} &nbsp;|&nbsp;
    <b>Corte:</b> {_h(corte.get('consecutivo',''))}
  </div>
  <table style="width:100%;border-collapse:collapse">
    <tr style="background:#eee">
      <th style="border:1px solid #999;padding:4px">Item</th>
      <th style="border:1px solid #999;padding:4px">Descripcion</th>
      <th style="border:1px solid #999;padding:4px">Und</th>
      <th style="border:1px solid #999;padding:4px">Cantidad</th>
      <th style="border:1px solid #999;padding:4px">Vlr Unit.</th>
      <th style="border:1px solid #999;padding:4px">Costo Dir.</th>
    </tr>
    {filas}
    <tr>
      <td colspan="5" style="border:1px solid #999;padding:4px;text-align:right"><b>SUB TOTAL</b></td>
      <td style="border:1px solid #999;padding:4px;text-align:right"><b>{_fm(total_costo)}</b></td>
    </tr>
  </table>
  <div style="margin-top:14px">
    <b>Generado por:</b> {_h(usuario_nombre)} - {_h(usuario_cargo)}
  </div>
  <div style="margin-top:10px;font-size:7pt;color:#555">
    Documento institucional de control interno. Prohibida su reproduccion parcial o total sin autorizacion escrita.
  </div>
</body></html>"""


def _html_corte_sub_minima(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo, err1: str, err2: str) -> str:
    """Último recurso CC-SUB-001: tabla simple sin estilos complejos ni firmas multipágina."""
    filas = ""
    for item in items:
        filas += f"""<tr>
          <td>{_h(item.get("item_numero", ""))}</td>
          <td>{_h(item.get("unidad", ""))}</td>
          <td>{_fn(item.get("cantidad"))}</td>
          <td>{_fm(item.get("vlr_unitario_sub"))}</td>
          <td>{_fm(item.get("costo_directo"))}</td>
          <td>{_h(item.get("item_descripcion", ""))}</td>
        </tr>"""
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;font-size:9pt">
  <p style="color:#b45309;font-size:8pt">Vista simplificada CC-SUB-001. Motivo: {_h((err1 + " | " + err2)[:500])}</p>
  <p><b>Contrato</b> {_h(contrato.get("numero", ""))} · <b>Sub</b> {_h(sub.get("razon_social", ""))} · <b>Corte</b> {_h(corte.get("consecutivo", ""))}</p>
  <table border="1" cellpadding="4" style="border-collapse:collapse;width:100%">
    <tr><th>Ítem</th><th>Und</th><th>Cant</th><th>Vlr u.</th><th>Costo</th><th>Descripción</th></tr>
    {filas}
    <tr><td colspan="4" align="right"><b>Subtotal</b></td><td colspan="2"><b>{_fm(total_costo)}</b></td></tr>
  </table>
  <p>{_h(usuario_nombre)} — {_h(usuario_cargo)}</p>
</body></html>"""


def _html_memoria_minima(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo, err_note: str) -> str:
    """Si la plantilla completa falla (datos raros / xhtml2pdf), al menos un PDF legible."""
    filas = ""
    for r in registros:
        filas += f"""<tr>
          <td style="border:1px solid #999;padding:4px">{_h(r.get("numero_registro"))}</td>
          <td style="border:1px solid #999;padding:4px">{_h(r.get("abs_inicio"))}</td>
          <td style="border:1px solid #999;padding:4px">{_h(r.get("abs_final"))}</td>
          <td style="border:1px solid #999;padding:4px">{_fn(r.get("cantidad_total"))}</td>
          <td style="border:1px solid #999;padding:4px">{_h((r.get("observacion") or "")[:300])}</td>
        </tr>"""
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;font-size:9pt;color:#111">
  <p style="color:#b45309;font-size:8pt">Vista simplificada (hubo un problema al armar el formato completo): {_h(err_note[:400])}</p>
  <h2 style="margin:0 0 8px 0">CC-SUB-002 · {_h(item_info.get("item_numero", ""))}</h2>
  <p><b>Contrato:</b> {_h(contrato.get("numero", ""))} &nbsp; <b>Sub:</b> {_h(sub.get("razon_social", ""))} &nbsp; <b>Corte:</b> {_h(corte.get("consecutivo", ""))}</p>
  <p><b>Usuario:</b> {_h(usuario_nombre)} — {_h(usuario_cargo)}</p>
  <table style="width:100%;border-collapse:collapse">{filas}</table>
</body></html>"""


# ── Template CC-SUB-002 ────────────────────────────────────────────────────────

def _html_memoria_item(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo):
    now = datetime.now().strftime("%d %b %Y")
    # Sin logo remoto en PDF (URLs en <img> suelen romper el renderizado).
    logo_td = "<span style='font-size:7pt;color:#6b7280'>LOGO CONTRATISTA</span>"

    total_cant = sum(_sf(r.get("cantidad_total"), 0.0) for r in registros)

    ROWS_PER_PAGE  = 25
    FOTOS_PER_PAGE = 6

    fotos = [r for r in registros if r.get("foto_url")]

    def encabezado():
        return f"""<table class="w100 hdr-outer"><tr>
  <td class="hdr-logo">{logo_td}</td>
  <td class="hdr-main">
    <div class="doc-title">RESUMEN DE ACTIVIDADES DE CONCILIACION CORTE SUB CONTRATISTA {_h(contrato.get('numero',''))}</div>
    <div class="doc-code">CC-SUB-002</div>
    <table class="w100 doc-meta"><tr>
      <td style="width:27%"><span class="lbl">CONTRATO</span><br/><span class="val">{_h(contrato.get('numero',''))}</span></td>
      <td style="width:25%"><span class="lbl">SUB CONTRATISTA</span><br/><span class="val">{_h(sub.get('razon_social',''))}</span></td>
      <td style="width:25%"><span class="lbl">SUPERVISOR</span><br/><span class="val">{_h(sub.get('nombre_contacto',''))}</span></td>
      <td style="width:23%"><span class="lbl">FECHA</span><br/><span class="val">{_h(now)}</span></td>
    </tr><tr>
      <td><span class="lbl">ITEM</span><br/><span class="val">{_h(item_info.get('item_numero',''))}</span></td>
      <td><span class="lbl">UND</span><br/><span class="val">{_h(item_info.get('unidad',''))}</span></td>
      <td><span class="lbl">CORTE</span><br/><span class="val">{_h(corte.get('consecutivo',''))}</span></td>
      <td><span class="lbl">PERIODO</span><br/><span class="val">{_h(_fd(corte.get('fecha_inicio')))} - {_h(_fd(corte.get('fecha_fin')))}</span></td>
    </tr><tr>
      <td colspan="4"><span class="lbl">DESCRIPCION</span><br/><span class="val">{_h(item_info.get('item_descripcion',''))}</span></td>
    </tr></table>
  </td>
</tr></table>"""

    chunks_reg  = [registros[i:i+ROWS_PER_PAGE]  for i in range(0, len(registros),  ROWS_PER_PAGE)]
    chunks_foto = [fotos[i:i+FOTOS_PER_PAGE]      for i in range(0, len(fotos),      FOTOS_PER_PAGE)]

    body = ""
    for ci, chunk in enumerate(chunks_reg):
        if ci > 0:
            body += '<pdf:nextpage />'
        body += encabezado()
        body += '<div class="section-bar">DETALLE DE CANTIDADES APROBADAS</div>'
        body += """<table class="w100"><tr>
            <th class="data-th" style="width:5%">N°</th>
            <th class="data-th" style="width:12%">ABS INI</th>
            <th class="data-th" style="width:12%">ABS FIN</th>
            <th class="data-th" style="width:7%">PK ID</th>
            <th class="data-th" style="width:8%">COSTADO</th>
            <th class="data-th" style="width:7%">LONG</th>
            <th class="data-th" style="width:7%">ANCHO</th>
            <th class="data-th" style="width:7%">ESP</th>
            <th class="data-th" style="width:9%">CANT</th>
            <th class="data-th" style="width:9%">CANT TOT</th>
            <th class="data-th" style="width:17%">OBSERVACIÓN</th>
        </tr>"""

        for i, r in enumerate(chunk):
            cls = "even" if i % 2 == 0 else ""
            obs = r.get("observacion") or ""
            fn  = r.get("foto_numero")
            if fn:
                obs = f"{obs} [Foto {fn}]".strip()
            pkv = (r.get("pk_ids") or {}).get("pk_id")
            body += f"""<tr class="{cls}">
                <td class="data-td" style="text-align:center">{_h(r.get('numero_registro',''))}</td>
                <td class="data-td" style="text-align:center">{_h(r.get('abs_inicio') or '—')}</td>
                <td class="data-td" style="text-align:center">{_h(r.get('abs_final') or '—')}</td>
                <td class="data-td" style="text-align:center">{_h(pkv if pkv is not None else '—')}</td>
                <td class="data-td" style="text-align:center">{_h(r.get('calzada') or '—')}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('longitud'))}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('ancho'))}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('espesor'))}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('cantidad'))}</td>
                <td class="data-td" style="text-align:right;font-weight:bold">{_fn(r.get('cantidad_total'))}</td>
                <td class="data-td" style="font-size:6.5pt">{_h((obs or '')[:500])}</td>
            </tr>"""

        # Total solo en el último chunk de registros
        if ci == len(chunks_reg) - 1:
            body += f"""<tr>
                <td class="total-td" colspan="9" style="text-align:right;padding-right:8px">CANTIDAD TOTAL DEL ÍTEM</td>
                <td class="total-td" style="text-align:right">{_fn(total_cant)}</td>
                <td class="total-td"></td>
            </tr>"""
        body += "</table>"
        body += '<div class="doc-footer">Documento institucional de control interno. Prohibida su reproduccion parcial o total sin autorizacion escrita.</div>'

        # Página de fotos correspondiente a este bloque
        if ci < len(chunks_foto):
            body += '<pdf:nextpage />'
            body += encabezado()
            body += f'<div class="section-bar">REGISTRO FOTOGRÁFICO — ÍTEM {_h(item_info.get("item_numero",""))} | Corte N° {_h(corte.get("consecutivo",""))}</div>'
            foto_chunk = chunks_foto[ci]
            body += '<table class="w100">'
            for row_start in range(0, len(foto_chunk), 3):
                body += "<tr>"
                fila = foto_chunk[row_start:row_start+3]
                for r in fila:
                    obs_f = (r.get("observacion") or "")[:120]
                    fu = (r.get("foto_url") or "").strip()
                    if fu:
                        body += f"""<td style="width:33%;text-align:center;padding:8px;vertical-align:top">
                        <img src="{_h(fu)}" style="max-width:155px;max-height:115px;border:1px solid #dee2e6"/>
                        <div class="foto-caption">Foto {_h(r.get('foto_numero',''))} — Reg. {_h(r.get('numero_registro',''))}</div>
                        <div style="font-size:6pt;color:#666;margin-top:2px">{_h(obs_f)}</div>
                    </td>"""
                    else:
                        body += """<td style="width:33%;text-align:center;padding:8px;vertical-align:top;color:#888">Sin foto</td>"""
                # Completar fila si tiene menos de 3
                for _ in range(3 - len(fila)):
                    body += '<td style="width:33%"></td>'
                body += "</tr>"
            body += "</table>"
            body += '<div class="doc-footer">Documento institucional de control interno. Prohibida su reproduccion parcial o total sin autorizacion escrita.</div>'

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>{BASE_CSS}</style></head><body>
{body}
</body></html>"""