import os, io
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from xhtml2pdf import pisa
import jwt as pyjwt

router = APIRouter(tags=["informes"])

# ── Cliente Supabase independiente (evita import circular con main.py) ──────────
_SB_URL = os.getenv("SUPABASE_URL", "")
_SB_KEY = os.getenv("SUPABASE_KEY", "")
_sb     = create_client(_SB_URL, _SB_KEY) if (_SB_URL and _SB_KEY) else None

_JWT_SECRET = os.getenv("JWT_SECRET", "")
_bearer     = HTTPBearer()

def _get_user(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    try:
        payload = pyjwt.decode(creds.credentials, _JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

# ── REGISTRO DE FORMATOS ────────────────────────────────────────────────────────
# CC-SUB-001 : Corte Subcontratista
# CC-SUB-002 : Memorias Corte Subcontratista (por ítem)

# ── Selectores ────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/subcontratistas")
def inf_subcontratistas(contrato_id: int, current_user=Depends(_get_user)):
    rows = _sb.table("subcontratistas")\
        .select("id, razon_social, nit, nombre_contacto, telefono")\
        .eq("contrato_id", contrato_id)\
        .eq("activo", True)\
        .order("razon_social").execute().data
    return rows or []

@router.get("/{contrato_id}/cortes/{sub_id}")
def inf_cortes(contrato_id: int, sub_id: int, current_user=Depends(_get_user)):
    rows = _sb.table("subcontratista_cortes").select("*")\
        .eq("subcontratista_id", sub_id)\
        .eq("contrato_id", contrato_id)\
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

    html      = _html_corte_sub(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo)
    pdf_bytes = _to_pdf(html)
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

# ── Utilidades ─────────────────────────────────────────────────────────────────

def _to_pdf(html: str) -> bytes:
    buf = io.BytesIO()
    pisa.CreatePDF(io.StringIO(html), dest=buf)
    buf.seek(0)
    return buf.read()

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
    margin: 1.5cm 1.5cm 2cm 1.5cm;
}
body { font-family: Arial, sans-serif; font-size: 8pt; color: #1a1a2e; }
table { border-collapse: collapse; }
.w100 { width: 100%; }
.hdr-outer { width: 100%; border: 2px solid #0077B6; margin-bottom: 8px; }
.hdr-logo  { width: 110px; border-right: 1px solid #0077B6; padding: 6px; text-align: center; vertical-align: middle; }
.hdr-logo img { max-width: 100px; max-height: 55px; }
.hdr-main  { padding: 6px 10px; vertical-align: top; }
.doc-title { font-size: 12pt; font-weight: bold; color: #0077B6; }
.doc-code  { font-size: 7pt; color: #888; letter-spacing: 1px; margin: 2px 0 5px 0; }
.lbl { color: #555; font-weight: normal; }
.val { font-weight: bold; color: #1a1a2e; }
.section-bar {
    background: #0077B6; color: white;
    font-size: 8pt; font-weight: bold;
    padding: 3px 8px; margin: 6px 0 3px 0;
}
.data-th {
    background: #dbeafe; color: #1e40af;
    font-weight: bold; padding: 4px 5px;
    border: 1px solid #93c5fd; text-align: center;
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
    background: #0077B6; color: white;
    font-weight: bold; padding: 4px 5px;
    border: 1px solid #005a8e; font-size: 7.5pt;
}
.firma-linea { border-top: 1px solid #333; margin-top: 55px; margin-bottom: 4px; }
.firma-nombre { font-weight: bold; font-size: 8pt; }
.firma-cargo  { font-size: 7pt; color: #555; }
.firma-dato   { font-size: 7pt; color: #333; }
.foto-caption { font-size: 7pt; color: #555; margin-top: 3px; text-align: center; }
.sep { border: none; border-top: 1px solid #e2e8f0; margin: 4px 0; }
"""

# ── Template CC-SUB-001 ────────────────────────────────────────────────────────

def _html_corte_sub(contrato, sub, corte, items, total_costo, usuario_nombre, usuario_cargo):
    now      = datetime.now().strftime("%d/%m/%Y %H:%M")
    logo_td  = f'<img src="{contrato["logo_contratista"]}" />' if contrato.get("logo_contratista") else "<span style='font-size:7pt;color:#0077B6'>SIN LOGO</span>"

    filas = ""
    for i, item in enumerate(items):
        cls = "even" if i % 2 == 0 else ""
        filas += f"""<tr class="{cls}">
            <td class="data-td" style="text-align:center">{item['item_numero']}</td>
            <td class="data-td">{item['item_descripcion']}</td>
            <td class="data-td" style="text-align:center">{item['unidad']}</td>
            <td class="data-td" style="text-align:right">{_fn(item['cantidad'])}</td>
            <td class="data-td" style="text-align:right">{_fm(item['vlr_unitario_sub'])}</td>
            <td class="data-td" style="text-align:right">{_fm(item['costo_directo'])}</td>
        </tr>"""

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>{BASE_CSS}
.firmas-section {{ page-break-before: always; }}
</style></head><body>

<!-- ENCABEZADO -->
<table class="w100 hdr-outer"><tr>
  <td class="hdr-logo">{logo_td}</td>
  <td class="hdr-main">
    <div class="doc-title">CORTE SUBCONTRATISTA</div>
    <div class="doc-code">CC-SUB-001 &nbsp;|&nbsp; {now}</div>
    <hr class="sep"/>
    <table class="w100"><tr>
      <td><span class="lbl">CONTRATO: </span><span class="val">{contrato.get('numero','')}</span></td>
      <td><span class="lbl">CONTRATISTA: </span><span class="val">{contrato.get('contratista','')}</span></td>
      <td><span class="lbl">NIT: </span><span class="val">{contrato.get('nit','')}</span></td>
    </tr><tr>
      <td><span class="lbl">INTERVENTORÍA: </span><span class="val">{contrato.get('interventoria','')}</span></td>
      <td><span class="lbl">SUBCONTRATISTA: </span><span class="val">{sub.get('razon_social','')}</span></td>
      <td><span class="lbl">NIT SUB: </span><span class="val">{sub.get('nit','')}</span></td>
    </tr><tr>
      <td><span class="lbl">N° CORTE: </span><span class="val">{corte.get('consecutivo','')}</span></td>
      <td colspan="2"><span class="lbl">PERÍODO: </span><span class="val">{_fd(corte.get('fecha_inicio'))} → {_fd(corte.get('fecha_fin'))}</span>
        &nbsp;&nbsp;<span class="lbl">TIPO: </span><span class="val">{(corte.get('tipo_periodo','') or '').upper()}</span></td>
    </tr></table>
  </td>
</tr></table>

<!-- CANTIDADES -->
<div class="section-bar">CANTIDADES APROBADAS POR SUBCONTRATISTA</div>
<table class="w100">
  <tr>
    <th class="data-th" style="width:8%">ÍTEM</th>
    <th class="data-th" style="width:36%">DESCRIPCIÓN</th>
    <th class="data-th" style="width:6%">UND</th>
    <th class="data-th" style="width:10%">CANTIDAD</th>
    <th class="data-th" style="width:18%">VLR UNIT SUB</th>
    <th class="data-th" style="width:18%">COSTO DIRECTO SUB</th>
  </tr>
  {filas}
  <tr>
    <td class="total-td" colspan="5" style="text-align:right;padding-right:10px">TOTAL COSTO DIRECTO SUBCONTRATISTA</td>
    <td class="total-td" style="text-align:right">{_fm(total_costo)}</td>
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

</body></html>"""

# ── Template CC-SUB-002 ────────────────────────────────────────────────────────

def _html_memoria_item(contrato, sub, corte, item_info, registros, usuario_nombre, usuario_cargo):
    now     = datetime.now().strftime("%d/%m/%Y %H:%M")
    logo_td = f'<img src="{contrato["logo_contratista"]}" />' if contrato.get("logo_contratista") else "<span style='font-size:7pt;color:#0077B6'>SIN LOGO</span>"

    total_cant = sum(float(r.get("cantidad_total") or 0) for r in registros)

    ROWS_PER_PAGE  = 25
    FOTOS_PER_PAGE = 6

    fotos = [r for r in registros if r.get("foto_url")]

    def encabezado():
        return f"""<table class="w100 hdr-outer"><tr>
  <td class="hdr-logo">{logo_td}</td>
  <td class="hdr-main">
    <div class="doc-title">MEMORIAS CORTE SUBCONTRATISTA</div>
    <div class="doc-code">CC-SUB-002 &nbsp;|&nbsp; {now}</div>
    <hr class="sep"/>
    <table class="w100"><tr>
      <td><span class="lbl">CONTRATO: </span><span class="val">{contrato.get('numero','')}</span></td>
      <td><span class="lbl">CONTRATISTA: </span><span class="val">{contrato.get('contratista','')}</span></td>
      <td><span class="lbl">NIT: </span><span class="val">{contrato.get('nit','')}</span></td>
    </tr><tr>
      <td><span class="lbl">INTERVENTORÍA: </span><span class="val">{contrato.get('interventoria','')}</span></td>
      <td><span class="lbl">SUBCONTRATISTA: </span><span class="val">{sub.get('razon_social','')}</span></td>
      <td><span class="lbl">N° CORTE: </span><span class="val">{corte.get('consecutivo','')} &nbsp; PERÍODO: {_fd(corte.get('fecha_inicio'))} → {_fd(corte.get('fecha_fin'))}</span></td>
    </tr><tr>
      <td colspan="3"><span class="lbl">ÍTEM: </span><span class="val">{item_info['item_numero']} — {item_info['item_descripcion']}</span>
      &nbsp;&nbsp;<span class="lbl">UND: </span><span class="val">{item_info['unidad']}</span></td>
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

    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>{BASE_CSS}</style></head><body>
{body}
</body></html>"""