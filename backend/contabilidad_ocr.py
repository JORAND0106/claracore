"""
OCR de facturas vía Azure Document Intelligence (prebuilt-invoice).

Variables:
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  AZURE_DOCUMENT_INTELLIGENCE_KEY

Si faltan o falla el análisis, se devuelve un resultado vacío (sin error al usuario).
"""
from __future__ import annotations

import base64
import logging
import os
import re
import time
from typing import Any, Dict, Optional

import httpx

_log = logging.getLogger("claracore.contabilidad.ocr")

API_VERSION = "2024-11-30"
MODEL_ID = "prebuilt-invoice"
POLL_INTERVAL_SEC = 0.8
MAX_WAIT_SEC = 25.0


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


def _empty_result(*, configured: bool, status: str = "skipped") -> dict:
    return {
        "ok": False,
        "configured": configured,
        "status": status,
        "sugerencias": {},
        "campos_detectados": [],
    }


def analyze_invoice_bytes(data: bytes, content_type: Optional[str] = None) -> dict:
    """
    Analiza imagen/PDF con prebuilt-invoice.
    Nunca lanza al caller de negocio: errores → resultado vacío.
    """
    if not data:
        return _empty_result(configured=ocr_configured(), status="empty")
    if not ocr_configured():
        return _empty_result(configured=False, status="not_configured")

    endpoint = _endpoint()
    key = _key()
    url = (
        f"{endpoint}/documentintelligence/documentModels/{MODEL_ID}:analyze"
        f"?api-version={API_VERSION}&locale=es-CO"
    )
    headers = {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/json",
    }
    body = {"base64Source": base64.b64encode(data).decode("ascii")}

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, headers=headers, json=body)
            if resp.status_code not in (200, 202):
                _log.warning("DI analyze HTTP %s: %s", resp.status_code, resp.text[:300])
                return _empty_result(configured=True, status="analyze_failed")

            op_url = resp.headers.get("Operation-Location") or resp.headers.get("operation-location")
            if not op_url:
                # Algunas respuestas síncronas (raro)
                payload = resp.json() if resp.content else {}
            else:
                payload = None
                deadline = time.monotonic() + MAX_WAIT_SEC
                while time.monotonic() < deadline:
                    poll = client.get(op_url, headers={"Ocp-Apim-Subscription-Key": key})
                    if poll.status_code != 200:
                        time.sleep(POLL_INTERVAL_SEC)
                        continue
                    payload = poll.json()
                    st = (payload.get("status") or "").lower()
                    if st in {"succeeded", "failed", "canceled"}:
                        break
                    time.sleep(POLL_INTERVAL_SEC)
                if not payload or (payload.get("status") or "").lower() != "succeeded":
                    return _empty_result(configured=True, status="timeout_or_failed")

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

        # Retención: no siempre viene tipada; buscar en campos conocidos / contenido
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

        return {
            "ok": bool(sugerencias),
            "configured": True,
            "status": "succeeded",
            "sugerencias": sugerencias,
            "campos_detectados": list(sugerencias.keys()),
        }
    except Exception as exc:
        _log.warning("DI analyze exception: %s", exc)
        return _empty_result(configured=True, status="exception")
