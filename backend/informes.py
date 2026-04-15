import io
import base64
import urllib.request
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from xhtml2pdf import pisa
from main import get_current_user as _get_user
from supabase import create_client as _create_client
import os as _os
_sb = _create_client(
    _os.getenv("SUPABASE_URL", ""),
    _os.getenv("SUPABASE_KEY", "")
)

router = APIRouter(tags=["informes"])

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

# ── CC-SUB-001 : Corte Subcontratista ─────────────────────────────────────────

@router.get("/{contrato_id}/pdf/corte-subcontratista/{corte_id}")
def pdf_corte_sub(contrato_id: int, corte_id: int, current_user=Depends(_get_user)):
    contrato = _sb.table("contratos")\
        .select("numero, objeto, contratista, nit, interventoria, logo_contratista")\
        .eq("id", contrato_id).single().execute().data
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")

    corte = _sb.table("subcontratista_cortes").select("*")\
        .eq("id", corte_id).single().execute().data
    if not corte:
        raise HTTPException(404, "Corte no encontrado")

    sub = _sb.table("subcontratistas")\
        .select("razon_social, nit, nombre_contacto, objeto_contrato")\
        .eq("id", corte["subcontratista_id"]).single().execute().data or {}

    registros = _sb.table("so_registros")\
        .select("item_numero, item_descripcion, unidad, cantidad_total, vlr_unitario_sub, costo_directo_sub")\
        .eq("contrato_id", contrato_id)\
        .eq("corte_id", corte_id)\
        .eq("sub_estado", "Aprobado")\
        .execute().data or []

    # Agrupar por ítem
    items_map = {}
    for r in registros:
        k = r.get("item_numero") or "SIN_ITEM"
        if k not in items_map:
            items_map[k] = {
                "item_numero":      r.get("item_numero", ""),
                "item_descripcion": r.get("item_descripcion", ""),
                "unidad":           r.get("unidad", ""),
                "cantidad":         0.0,
                "vlr_unitario_sub": float(r.get("vlr_unitario_sub") or 0),
                "costo_directo":    0.0,
            }
        items_map[k]["cantidad"]      += float(r.get("cantidad_total") or 0)
        items_map[k]["costo_directo"] += float(r.get("costo_directo_sub") or 0)

    items       = list(items_map.values())
    total_costo = sum(i["costo_directo"] for i in items)

    usuario_nombre = f"{current_user.get('nombre','')} {current_user.get('apellidos','')}".strip() or "—"
    usuario_cargo  = current_user.get("cargo_nombre", "—") or "—"

    try:
        html      = _html_corte_sub(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo)
        pdf_bytes = _to_pdf(html)
    except Exception as e:
        raise HTTPException(500, f"Error generando PDF corte: {str(e)}")
    sub_safe  = (sub.get("razon_social","sub") or "sub")[:20].replace(" ","_")
    filename  = f"CC-SUB-001_Corte{corte['consecutivo']}_{sub_safe}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})

# ── CC-SUB-002 : Memorias Corte Subcontratista ─────────────────────────────────

@router.get("/{contrato_id}/pdf/memoria-item/{corte_id}")
def pdf_memoria_item(
    contrato_id: int,
    corte_id:    int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user)
):
    contrato = _sb.table("contratos")\
        .select("numero, objeto, contratista, nit, interventoria, logo_contratista")\
        .eq("id", contrato_id).single().execute().data
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")

    corte = _sb.table("subcontratista_cortes").select("*")\
        .eq("id", corte_id).single().execute().data
    if not corte:
        raise HTTPException(404, "Corte no encontrado")

    sub = _sb.table("subcontratistas")\
        .select("razon_social, nit, nombre_contacto, objeto_contrato")\
        .eq("id", corte["subcontratista_id"]).single().execute().data or {}

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
    usuario_cargo  = current_user.get("cargo_nombre", "—") or "—"

    html      = _html_memoria_item(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo)
    pdf_bytes = _to_pdf(html)
    item_safe = item_numero.replace("/","-").replace(" ","")
    filename  = f"CC-SUB-002_Corte{corte['consecutivo']}_{item_safe}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})

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
        {"item_numero": "NP-491", "item_descripcion": "PERFORACIÓN PREBARRENADO EN DIAMETRO 3\" HASTA 12M", "unidad": "ML", "cantidad": 144.0, "vlr_unitario_sub": 144716, "costo_directo": 20839104},
        {"item_numero": "NP-492", "item_descripcion": "EXCAVACIÓN MANUAL EN MATERIAL COMÚN", "unidad": "M3", "cantidad": 38.5, "vlr_unitario_sub": 85000, "costo_directo": 3272500},
        {"item_numero": "NP-493", "item_descripcion": "RELLENO COMPACTADO CON MATERIAL SELECCIONADO", "unidad": "M3", "cantidad": 22.0, "vlr_unitario_sub": 120000, "costo_directo": 2640000},
        {"item_numero": "NP-494", "item_descripcion": "SUMINISTRO E INSTALACIÓN TUBERÍA PVC D=8\"", "unidad": "ML", "cantidad": 65.0, "vlr_unitario_sub": 195000, "costo_directo": 12675000},
        {"item_numero": "NP-495", "item_descripcion": "CONCRETO DE LIMPIEZA f'c=140 kg/cm2", "unidad": "M3", "cantidad": 8.2, "vlr_unitario_sub": 380000, "costo_directo": 3116000},
    ]
    total_costo = sum(i["costo_directo"] for i in items)
    html = _html_corte_sub(contrato, sub, corte, items, total_costo, "Jorge Andrés Jaimes", "Desarrollador / Controlador de Obra")
    pdf_bytes = _to_pdf(html)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "inline; filename=preview_CC-SUB-001.pdf"})

# ── Utilidades ─────────────────────────────────────────────────────────────────

def _to_pdf(html: str) -> bytes:
    buf = io.BytesIO()
    pisa.CreatePDF(io.StringIO(html), dest=buf)
    buf.seek(0)
    return buf.read()

def _logo_data_uri(url: Optional[str]) -> Optional[str]:
    """Descarga logo remoto y lo convierte a data URI; si falla, retorna None."""
    if not url:
        return None
    u = str(url).strip()
    if not (u.startswith("http://") or u.startswith("https://")):
        return None
    try:
        with urllib.request.urlopen(u, timeout=4) as r:
            content_type = (r.headers.get("Content-Type") or "").lower()
            if "png" in content_type:
                mime = "image/png"
            elif "jpeg" in content_type or "jpg" in content_type:
                mime = "image/jpeg"
            elif "gif" in content_type:
                mime = "image/gif"
            elif "webp" in content_type:
                mime = "image/webp"
            else:
                mime = "image/png"
            raw = r.read()
            if not raw:
                return None
            b64 = base64.b64encode(raw).decode("ascii")
            return f"data:{mime};base64,{b64}"
    except Exception:
        return None

def _fd(d):
    """Formatea fecha ISO → dd/mm/yyyy."""
    if not d: return "—"
    try:    return datetime.fromisoformat(str(d)).strftime("%d/%m/%Y")
    except: return str(d)

def _fn(n, dec=2):
    """Formatea número con decimales."""
    if n is None: return "—"
    try:    return f"{float(n):,.{dec}f}"
    except: return str(n)

def _fm(n):
    """Formatea como moneda colombiana."""
    if n is None: return "—"
    try:    return f"$ {float(n):,.0f}"
    except: return str(n)

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

# ── Template CC-SUB-001 ────────────────────────────────────────────────────────

def _html_corte_sub(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo):
    now      = datetime.now().strftime("%d %b %y, %I:%M %p")
    logo_src = _logo_data_uri(contrato.get("logo_contratista"))
    logo_td  = f'<img src="{logo_src}" />' if logo_src else "<span style='font-size:7pt;color:#6b7280'>LOGO CONTRATISTA</span>"

    filas = ""
    for i, item in enumerate(items):
        cls = "even" if i % 2 == 0 else ""
        filas += f"""<tr class="{cls}">
            <td class="data-td" style="text-align:center">{item['item_numero']}</td>
            <td class="data-td" style="text-align:center">{item['unidad']}</td>
            <td class="data-td" style="text-align:right">{_fn(item['cantidad'])}</td>
            <td class="data-td" style="text-align:right">{_fm(item['vlr_unitario_sub'])}</td>
            <td class="data-td" style="text-align:right">{_fm(item['costo_directo'])}</td>
            <td class="data-td">{item['item_descripcion']}</td>
        </tr>"""

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>{BASE_CSS}
.firmas-section {{ page-break-before: always; }}
</style></head><body>

<!-- ENCABEZADO -->
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
    <td style="width:25%"><span class="lbl">CONTRATO</span><br/><span class="val">{contrato.get('numero','')}</span></td>
    <td style="width:20%"><span class="lbl">FECHA:</span><br/><span class="val">{now}</span></td>
    <td style="width:40%"><span class="lbl">SUB CONTRATISTA:</span><br/><span class="val">{(sub.get('razon_social','') or '').upper()}</span></td>
    <td style="width:15%"><span class="lbl">CORTE</span><br/><span class="val">{corte.get('consecutivo','')}</span></td>
  </tr>
</table>

<!-- CANTIDADES -->
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
  {filas}
  <tr>
    <td class="total-td" colspan="4" style="text-align:right;padding-right:10px">SUB TOTAL:</td>
    <td class="total-td" style="text-align:right">{_fm(total_costo)}</td>
    <td class="total-td"></td>
  </tr>
</table>

<!-- FIRMAS — siempre en nueva hoja -->
<div class="firmas-section">
  <div class="section-bar">FIRMAS Y APROBACIONES — CORTE N° {corte.get('consecutivo','')}</div>
  <p style="font-size:7.5pt;color:#555;margin:6px 0 0 0">
    El presente corte certifica las cantidades de obra ejecutadas y aprobadas por el subcontratista
    en el período comprendido entre el {_fd(corte.get('fecha_inicio'))} y el {_fd(corte.get('fecha_fin'))}.
  </p>
  <table class="w100" style="margin-top:20px"><tr>
    <td style="width:33%;text-align:center;padding:0 12px">
      <div class="firma-linea"></div>
      <div class="firma-nombre">{usuario_nombre}</div>
      <div class="firma-cargo">{usuario_cargo}</div>
    </td>
    <td style="width:33%;text-align:center;padding:0 12px">
      <div class="firma-linea"></div>
      <div class="firma-nombre">&nbsp;</div>
      <div class="firma-cargo">RESIDENTE DE OBRA</div>
    </td>
    <td style="width:33%;text-align:center;padding:0 12px">
      <div class="firma-linea"></div>
      <div class="firma-nombre">{sub.get('nombre_contacto','')}</div>
      <div class="firma-cargo">SUBCONTRATISTA</div>
      <div class="firma-dato">{sub.get('razon_social','')}</div>
    </td>
  </tr></table>
</div>
<div class="doc-footer">
  Documento institucional de control interno. Prohibida su reproduccion parcial o total sin autorizacion escrita.
</div>

</body></html>"""

# ── Template CC-SUB-002 ────────────────────────────────────────────────────────

def _html_memoria_item(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo):
    now     = datetime.now().strftime("%d %b %Y")
    logo_td = f'<img src="{contrato["logo_contratista"]}" />' if contrato.get("logo_contratista") else "<span style='font-size:7pt;color:#0077B6'>SIN LOGO</span>"

    total_cant = sum(float(r.get("cantidad_total") or 0) for r in registros)

    ROWS_PER_PAGE  = 25
    FOTOS_PER_PAGE = 6

    fotos = [r for r in registros if r.get("foto_url")]

    def encabezado():
        return f"""<table class="w100 hdr-outer"><tr>
  <td class="hdr-logo">{logo_td}</td>
  <td class="hdr-main">
    <div class="doc-title">RESUMEN DE ACTIVIDADES DE CONCILIACION CORTE SUB CONTRATISTA {contrato.get('numero','')}</div>
    <div class="doc-code">CC-SUB-002</div>
    <table class="w100 doc-meta"><tr>
      <td style="width:27%"><span class="lbl">CONTRATO</span><br/><span class="val">{contrato.get('numero','')}</span></td>
      <td style="width:25%"><span class="lbl">SUB CONTRATISTA</span><br/><span class="val">{sub.get('razon_social','')}</span></td>
      <td style="width:25%"><span class="lbl">SUPERVISOR</span><br/><span class="val">{sub.get('nombre_contacto','')}</span></td>
      <td style="width:23%"><span class="lbl">FECHA</span><br/><span class="val">{now}</span></td>
    </tr><tr>
      <td><span class="lbl">ITEM</span><br/><span class="val">{item_info['item_numero']}</span></td>
      <td><span class="lbl">UND</span><br/><span class="val">{item_info['unidad']}</span></td>
      <td><span class="lbl">CORTE</span><br/><span class="val">{corte.get('consecutivo','')}</span></td>
      <td><span class="lbl">PERIODO</span><br/><span class="val">{_fd(corte.get('fecha_inicio'))} - {_fd(corte.get('fecha_fin'))}</span></td>
    </tr><tr>
      <td colspan="4"><span class="lbl">DESCRIPCION</span><br/><span class="val">{item_info['item_descripcion']}</span></td>
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
            body += f"""<tr class="{cls}">
                <td class="data-td" style="text-align:center">{r.get('numero_registro','')}</td>
                <td class="data-td" style="text-align:center">{r.get('abs_inicio') or '—'}</td>
                <td class="data-td" style="text-align:center">{r.get('abs_final') or '—'}</td>
                <td class="data-td" style="text-align:center">{(r.get('pk_ids') or {}).get('pk_id') or '—'}</td>
                <td class="data-td" style="text-align:center">{r.get('calzada') or '—'}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('longitud'))}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('ancho'))}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('espesor'))}</td>
                <td class="data-td" style="text-align:right">{_fn(r.get('cantidad'))}</td>
                <td class="data-td" style="text-align:right;font-weight:bold">{_fn(r.get('cantidad_total'))}</td>
                <td class="data-td" style="font-size:6.5pt">{obs[:80]}</td>
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
            body += f'<div class="section-bar">REGISTRO FOTOGRÁFICO — ÍTEM {item_info["item_numero"]} | Corte N° {corte.get("consecutivo","")}</div>'
            foto_chunk = chunks_foto[ci]
            body += '<table class="w100">'
            for row_start in range(0, len(foto_chunk), 3):
                body += "<tr>"
                fila = foto_chunk[row_start:row_start+3]
                for r in fila:
                    obs_f = (r.get("observacion") or "")[:60]
                    body += f"""<td style="width:33%;text-align:center;padding:8px;vertical-align:top">
                        <img src="{r['foto_url']}" style="max-width:155px;max-height:115px;border:1px solid #dee2e6"/>
                        <div class="foto-caption">Foto {r.get('foto_numero','')} — Reg. {r.get('numero_registro','')}</div>
                        <div style="font-size:6pt;color:#666;margin-top:2px">{obs_f}</div>
                    </td>"""
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