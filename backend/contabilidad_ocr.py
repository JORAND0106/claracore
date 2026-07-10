"""
OCR de facturas vía Azure Document Intelligence (prebuilt-invoice).

Variables:
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  AZURE_DOCUMENT_INTELLIGENCE_KEY
"""
from __future__ import annotations

import base64
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

_log = logging.getLogger("claracore.contabilidad.ocr")

API_VERSION = "2024-11-30"
MODEL_ID = "prebuilt-invoice"
POLL_INTERVAL_SEC = 0.8
MAX_WAIT_SEC = 45.0


def _endpoint() -> str:
    return (os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT") or "").strip().rstrip("/")


def _key() -> str:
    return (os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY") or "").strip()


def ocr_configured() -> bool:
    return bool(_endpoint() and _key())


def _field_value(fields: dict, name: str) -> Any:
    f = fields.get(name) or {}
    if not isinstance(f, dict):
        return None
    v = f.get("valueString")
    if v is not None:
        return str(v).strip() or None
    v = f.get("valueDate")
    if v is not None:
        return str(v).strip()[:10] or None
    cur = f.get("valueCurrency")
    if isinstance(cur, dict) and cur.get("amount") is not None:
        try:
            return float(cur["amount"])
        except (TypeError, ValueError):
            pass
    v = f.get("valueNumber")
    if v is not None:
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    content = f.get("content")
    if content:
        return str(content).strip() or None
    return None


def _money_or_none(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        n = float(v)
        if n < 0:
            return None
        return round(n)
    except (TypeError, ValueError):
        return None


def _normalize_nit(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = re.sub(r"[^\d\-]", "", str(raw))
    digits = re.sub(r"\D", "", s)
    if len(digits) < 5:
        return None
    if "-" in s:
        parts = s.split("-")
        base = re.sub(r"\D", "", parts[0])
        dv = re.sub(r"\D", "", parts[-1])[:1] if len(parts) > 1 else ""
        if base and dv:
            return f"{base}-{dv}"
        return base or None
    if len(digits) >= 6:
        return f"{digits[:-1]}-{digits[-1]}"
    return digits


def _result(
    *,
    ok: bool,
    configured: bool,
    status: str,
    mensaje: str,
    sugerencias: Optional[dict] = None,
    crop: Optional[dict] = None,
    error_detalle: Optional[str] = None,
) -> dict:
    sug = sugerencias or {}
    return {
        "ok": ok,
        "configured": configured,
        "status": status,
        "mensaje": mensaje,
        "error_detalle": error_detalle,
        "sugerencias": sug,
        "campos_detectados": list(sug.keys()),
        "crop": crop,
    }


def _collect_polygons(analyze: dict) -> Tuple[Optional[dict], List[List[float]]]:
    """Devuelve (page_meta, lista de polígonos [x1,y1,...]) de la página 1."""
    pages = analyze.get("pages") or []
    page_meta = None
    if pages:
        p0 = pages[0] or {}
        page_meta = {
            "pageNumber": int(p0.get("pageNumber") or 1),
            "width": float(p0.get("width") or 0),
            "height": float(p0.get("height") or 0),
            "unit": (p0.get("unit") or "inch"),
        }

    polys: List[List[float]] = []

    def add_regions(regions):
        for br in regions or []:
            if int(br.get("pageNumber") or 1) != 1:
                continue
            poly = br.get("polygon") or []
            if isinstance(poly, list) and len(poly) >= 8:
                try:
                    polys.append([float(x) for x in poly])
                except (TypeError, ValueError):
                    pass

    for doc in analyze.get("documents") or []:
        add_regions(doc.get("boundingRegions"))
        fields = doc.get("fields") or {}
        for f in fields.values():
            if isinstance(f, dict):
                add_regions(f.get("boundingRegions"))

    # Fallback: palabras de la página
    if not polys and pages:
        for w in (pages[0].get("words") or []):
            poly = w.get("polygon") or []
            if isinstance(poly, list) and len(poly) >= 8:
                try:
                    polys.append([float(x) for x in poly])
                except (TypeError, ValueError):
                    pass

    return page_meta, polys


def _crop_from_polygons(page_meta: Optional[dict], polys: List[List[float]]) -> Optional[dict]:
    """
    Bounding box normalizado 0–1 relativo al ancho/alto de la página.
    El front lo aplica sobre la imagen original.
    """
    if not page_meta or not polys:
        return None
    pw = float(page_meta.get("width") or 0)
    ph = float(page_meta.get("height") or 0)
    if pw <= 0 or ph <= 0:
        return None

    xs: List[float] = []
    ys: List[float] = []
    for poly in polys:
        for i in range(0, len(poly) - 1, 2):
            xs.append(poly[i])
            ys.append(poly[i + 1])
    if not xs or not ys:
        return None

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    # padding 3%
    pad_x = pw * 0.03
    pad_y = ph * 0.03
    min_x = max(0.0, min_x - pad_x)
    min_y = max(0.0, min_y - pad_y)
    max_x = min(pw, max_x + pad_x)
    max_y = min(ph, max_y + pad_y)
    w = max_x - min_x
    h = max_y - min_y
    if w <= 0 or h <= 0:
        return None
    area = (w * h) / (pw * ph)
    if area < 0.12 or area > 0.98:
        return None

    return {
        "x": min_x / pw,
        "y": min_y / ph,
        "w": w / pw,
        "h": h / ph,
        "unit": "normalized",
        "pageNumber": page_meta.get("pageNumber") or 1,
    }


def analyze_invoice_bytes(data: bytes, content_type: Optional[str] = None) -> dict:
    """
    Analiza imagen/PDF con prebuilt-invoice.
    Siempre incluye `mensaje` legible para el usuario.
    """
    _ = content_type
    if not data:
        return _result(
            ok=False, configured=ocr_configured(), status="empty",
            mensaje="No se recibió archivo para analizar.",
        )
    if not ocr_configured():
        return _result(
            ok=False, configured=False, status="not_configured",
            mensaje="OCR no configurado: faltan AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT o KEY en el servidor.",
        )

    endpoint = _endpoint()
    key = _key()
    url = (
        f"{endpoint}/documentintelligence/documentModels/{MODEL_ID}:analyze"
        f"?api-version={API_VERSION}&locale=es-ES"
    )
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
    }
    body = {"base64Source": base64.b64encode(data).decode("ascii")}

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, headers=headers, json=body)
            if resp.status_code not in (200, 202):
                detail = (resp.text or "")[:400]
                _log.warning("DI analyze HTTP %s: %s", resp.status_code, detail)
                return _result(
                    ok=False, configured=True, status="analyze_failed",
                    mensaje=f"Azure Document Intelligence rechazó el análisis (HTTP {resp.status_code}).",
                    error_detalle=detail or None,
                )

            op_url = resp.headers.get("Operation-Location") or resp.headers.get("operation-location")
            if not op_url:
                payload = resp.json() if resp.content else {}
            else:
                payload = None
                deadline = time.monotonic() + MAX_WAIT_SEC
                last_status = "running"
                while time.monotonic() < deadline:
                    poll = client.get(op_url, headers={"Ocp-Apim-Subscription-Key": key})
                    if poll.status_code != 200:
                        time.sleep(POLL_INTERVAL_SEC)
                        continue
                    payload = poll.json()
                    last_status = (payload.get("status") or "").lower()
                    if last_status in {"succeeded", "failed", "canceled"}:
                        break
                    time.sleep(POLL_INTERVAL_SEC)
                if not payload or last_status != "succeeded":
                    err = None
                    if payload:
                        err = str(payload.get("error") or payload.get("status") or "")[:300]
                    return _result(
                        ok=False, configured=True, status="timeout_or_failed",
                        mensaje="El OCR no terminó a tiempo o falló en Azure. Intente de nuevo o complete los campos manualmente.",
                        error_detalle=err,
                    )

        analyze = payload.get("analyzeResult") or {}
        docs = analyze.get("documents") or []
        fields = (docs[0].get("fields") if docs else {}) or {}

        vendor = _field_value(fields, "VendorName")
        vendor_tax = _field_value(fields, "VendorTaxId")
        invoice_date = _field_value(fields, "InvoiceDate")
        subtotal = _money_or_none(_field_value(fields, "SubTotal"))
        total_tax = _money_or_none(_field_value(fields, "TotalTax"))
        invoice_total = _money_or_none(_field_value(fields, "InvoiceTotal"))
        amount_due = _money_or_none(_field_value(fields, "AmountDue"))

        retencion = None
        for key_name in ("WithholdingTax", "TaxWithheld", "Retencion", "Retention"):
            retencion = _money_or_none(_field_value(fields, key_name))
            if retencion is not None:
                break

        nit = _normalize_nit(str(vendor_tax) if vendor_tax is not None else None)

        sugerencias: Dict[str, Any] = {}
        if vendor:
            sugerencias["proveedor_razon_social"] = str(vendor)[:255]
        if nit:
            sugerencias["proveedor_nit"] = nit
        if invoice_date:
            sugerencias["fecha"] = str(invoice_date)[:10]
        if subtotal is not None:
            sugerencias["valor_bruto"] = subtotal
        elif invoice_total is not None and total_tax is not None:
            sugerencias["valor_bruto"] = max(0, round(invoice_total - total_tax))
        if total_tax is not None:
            sugerencias["iva_valor"] = total_tax
            if sugerencias.get("valor_bruto"):
                try:
                    pct = round(100 * total_tax / float(sugerencias["valor_bruto"]), 2)
                    if 0 < pct <= 100:
                        sugerencias["iva_pct"] = pct
                except Exception:
                    pass
        if retencion is not None:
            sugerencias["retencion_fuente_valor"] = retencion
        if invoice_total is not None:
            sugerencias["total_detectado"] = invoice_total
        elif amount_due is not None:
            sugerencias["total_detectado"] = amount_due

        page_meta, polys = _collect_polygons(analyze)
        crop = _crop_from_polygons(page_meta, polys)

        if sugerencias:
            return _result(
                ok=True, configured=True, status="succeeded",
                mensaje=f"OCR detectó {len(sugerencias)} campo(s). Revise los valores resaltados.",
                sugerencias=sugerencias,
                crop=crop,
            )
        return _result(
            ok=False, configured=True, status="no_fields",
            mensaje="OCR terminó pero no detectó campos de factura. Complete el formulario manualmente.",
            crop=crop,
        )
    except Exception as exc:
        _log.warning("DI analyze exception: %s", exc)
        return _result(
            ok=False, configured=True, status="exception",
            mensaje="Error al contactar Azure Document Intelligence. Complete el formulario manualmente.",
            error_detalle=str(exc)[:300],
        )
