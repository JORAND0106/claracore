"""
OCR de recibos de caja menor vía Azure Document Intelligence.
Independiente del OCR de Contabilidad: no importa ese módulo.

Variables (las mismas de la plataforma, no un almacén de datos compartido):
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  AZURE_DOCUMENT_INTELLIGENCE_KEY
"""
from __future__ import annotations

import base64
import logging
import os
import re
from typing import Any, Optional

_log = logging.getLogger("claracore.caja_menor.ocr")

API_VERSION = "2024-11-30"
MODEL_ID = "prebuilt-invoice"
POLL_INTERVAL_SEC = 0.8
MAX_WAIT_SEC = 45.0


def ocr_configured() -> bool:
    return bool(_endpoint() and _key())


def _endpoint() -> str:
    return (os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT") or "").strip().rstrip("/")


def _key() -> str:
    return (os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY") or "").strip()


def _compacto(texto: str) -> str:
    return re.sub(r"[\s\-–—·•|/]+", "", str(texto or "")).upper()


def _dehyphen_lineas(texto: str) -> str:
    limpio = str(texto or "").replace("\u00ad", "")
    return re.sub(r"-\s*[\r\n]+\s*", "", limpio)


def recuperar_razon_social(nombre: str, contenido: str = "") -> str:
    """Devuelve la razón social con las palabras de la factura, sin cortes de línea."""
    base = re.sub(r"\s+", " ", str(nombre or "")).strip()
    if not base:
        return ""
    clave = _compacto(base)
    texto = _dehyphen_lineas(contenido)
    for raw in texto.splitlines():
        tokens = raw.strip().split()
        acc = []
        for tok in tokens:
            acc.append(tok)
            junto = " ".join(acc)
            if _compacto(junto) == clave:
                return junto.strip()[:200]
            if len(_compacto(junto)) > len(clave):
                break
    return re.sub(r"\s+", " ", base).strip(" -·•")[:200]


def limpiar_item(texto: str) -> str:
    t = _dehyphen_lineas(texto)
    t = re.sub(r"[\s]*[·•|]+[\s]*", " ", t)
    t = re.sub(r"(?:^|\s)-\s+", " ", t)
    t = re.sub(r"\s+-\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip(" -·•|")
    return t


def limpiar_descripcion(partes) -> Optional[str]:
    limpios = []
    for parte in partes or []:
        item = limpiar_item(parte)
        if item:
            limpios.append(item)
    if not limpios:
        return None
    return "; ".join(limpios)[:500]


def _field(fields: dict, name: str) -> Any:
    f = fields.get(name) or {}
    if not isinstance(f, dict):
        return None
    if f.get("valueString") not in (None, ""):
        return str(f["valueString"]).strip()
    if f.get("valueDate"):
        return str(f["valueDate"]).strip()[:10]
    cur = f.get("valueCurrency")
    if isinstance(cur, dict) and cur.get("amount") is not None:
        return cur.get("amount")
    if f.get("valueNumber") is not None:
        return f.get("valueNumber")
    if f.get("content"):
        return str(f["content"]).strip()
    return None


def _monto(valor) -> Optional[int]:
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float)):
        n = float(valor)
        return int(round(n)) if n >= 0 else None
    texto = str(valor).strip()
    texto = texto.replace("$", "").replace("COP", "").replace(" ", "")
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", texto):
        texto = texto.replace(".", "")
    elif "," in texto and "." in texto:
        if texto.rfind(",") > texto.rfind("."):
            texto = texto.replace(".", "").replace(",", ".")
        else:
            texto = texto.replace(",", "")
    elif "," in texto:
        partes = texto.split(",")
        texto = texto.replace(".", "").replace(",", ".") if len(partes[-1]) != 3 else texto.replace(",", "")
    elif texto.count(".") > 1:
        texto = texto.replace(".", "")
    texto = re.sub(r"[^\d.]", "", texto)
    if not texto:
        return None
    try:
        n = float(texto)
    except ValueError:
        return None
    if n < 0:
        return None
    return int(round(n))


def _buscar_etiqueta(texto: str, etiquetas: tuple) -> Optional[int]:
    if not texto:
        return None
    plano = texto.lower()
    for et in etiquetas:
        m = re.search(rf"{et}[^\d]{{0,40}}(\$?\s?[\d][\d.,]*)", plano, flags=re.I)
        if m:
            valor = _monto(m.group(1))
            if valor:
                return valor
    return None


def mapear_analisis(analyze: dict) -> dict:
    """Traduce el JSON de Document Intelligence a campos del gasto. No guarda nada."""
    docs = (analyze or {}).get("documents") or []
    fields = (docs[0].get("fields") if docs else None) or {}
    content = (analyze or {}).get("content") or ""

    tercero_crudo = _field(fields, "VendorName") or _field(fields, "MerchantName")
    tercero_contenido = ""
    for nombre in ("VendorName", "MerchantName"):
        campo = fields.get(nombre) or {}
        if isinstance(campo, dict) and campo.get("content"):
            tercero_contenido = str(campo.get("content"))
            break
    tercero = recuperar_razon_social(tercero_crudo or "", f"{tercero_contenido}\n{content}")
    nit = _field(fields, "VendorTaxId") or _field(fields, "VendorAddressRecipient")
    if nit and not re.search(r"\d", str(nit)):
        nit = None
    if not nit:
        m = re.search(r"\bNIT[:\s]*([\d.\-]+)", content, flags=re.I)
        if not m:
            m = re.search(r"\b(?:C\.?C\.?|c[eé]dula)[:\s]*([\d.\-]+)", content, flags=re.I)
        nit = m.group(1) if m else None

    fecha = _field(fields, "InvoiceDate") or _field(fields, "TransactionDate")
    documento = _field(fields, "InvoiceId") or _field(fields, "ReceiptNumber")
    bruto = _monto(_field(fields, "SubTotal"))
    iva = _monto(_field(fields, "TotalTax"))
    total = _monto(_field(fields, "InvoiceTotal") or _field(fields, "AmountDue") or _field(fields, "Total"))

    if iva is None:
        iva = _buscar_etiqueta(content, ("iva", "i\\.v\\.a"))
    retenciones = None
    for nombre in ("WithholdingTax", "TaxWithheld"):
        retenciones = _monto(_field(fields, nombre))
        if retenciones is not None:
            break
    if retenciones is None:
        retenciones = _buscar_etiqueta(content, ("retenci[oó]n", "retefuente", "reteica", "reteiva"))
    impoconsumo = _buscar_etiqueta(content, ("impoconsumo", "impuesto al consumo", "impoconsumo"))
    otros = _buscar_etiqueta(content, ("otros deducibles", "otras deducciones", "descuento"))

    items = []
    arr = fields.get("Items") or {}
    for item in (arr.get("valueArray") or []) if isinstance(arr, dict) else []:
        obj = (item or {}).get("valueObject") or {}
        desc = _field(obj, "Description") or _field(obj, "ProductCode")
        if desc:
            items.append(str(desc))
    descripcion = limpiar_descripcion(items)

    if bruto is None and total is not None:
        bruto = total - (iva or 0) - (impoconsumo or 0) + (retenciones or 0) + (otros or 0)
        if bruto < 0:
            bruto = total

    sugerencias = {}
    if fecha:
        sugerencias["fecha"] = str(fecha)[:10]
    if tercero:
        sugerencias["tercero_razon_social"] = str(tercero)[:200]
    if nit:
        sugerencias["tercero_documento"] = str(nit)[:40]
    if descripcion:
        sugerencias["descripcion"] = descripcion
    if documento:
        sugerencias["documento_no"] = str(documento)[:80]
    if bruto is not None:
        sugerencias["valor_bruto"] = bruto
    if iva is not None:
        sugerencias["iva"] = iva
    if retenciones is not None:
        sugerencias["retenciones"] = retenciones
    if impoconsumo is not None:
        sugerencias["impuesto_consumo"] = impoconsumo
    if otros is not None:
        sugerencias["otros_deducibles"] = otros
    if total is not None:
        sugerencias["total_leido"] = total

    return {
        "ok": bool(sugerencias),
        "configured": True,
        "mensaje": "Revise los datos antes de guardar." if sugerencias else "No se leyeron datos. Complételos.",
        "sugerencias": sugerencias,
        "campos_detectados": [k for k in sugerencias.keys() if k != "total_leido"],
    }


def url_analisis() -> str:
    return (
        f"{_endpoint()}/documentintelligence/documentModels/{MODEL_ID}:analyze"
        f"?api-version={API_VERSION}&locale=es-ES"
    )


def cuerpo_analisis(data: bytes) -> dict:
    return {"base64Source": base64.b64encode(data).decode("ascii")}


def analyze_recibo_bytes(data: bytes, content_type: str = "image/jpeg") -> dict:
    if not data:
        return {"ok": False, "configured": ocr_configured(), "mensaje": "Falta la imagen.", "sugerencias": {}, "campos_detectados": []}
    if not ocr_configured():
        return {
            "ok": False,
            "configured": False,
            "mensaje": "El lector no está disponible. Complete los datos.",
            "sugerencias": {},
            "campos_detectados": [],
        }
    try:
        import time

        import httpx
    except ImportError:
        return {
            "ok": False,
            "configured": False,
            "mensaje": "El lector no está disponible. Complete los datos.",
            "sugerencias": {},
            "campos_detectados": [],
        }

    _ = content_type
    url = url_analisis()
    headers = {
        "Ocp-Apim-Subscription-Key": _key(),
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=MAX_WAIT_SEC + 5) as client:
            res = client.post(url, json=cuerpo_analisis(data), headers=headers)
            if res.status_code not in (200, 202):
                _log.warning("ocr caja menor status %s", res.status_code)
                return {
                    "ok": False,
                    "configured": True,
                    "mensaje": "No se pudo leer el recibo. Complete los datos.",
                    "sugerencias": {},
                    "campos_detectados": [],
                }
            op = res.headers.get("operation-location") or res.headers.get("Operation-Location")
            if not op:
                body = res.json() if res.content else {}
                return mapear_analisis(body.get("analyzeResult") or body)
            deadline = time.time() + MAX_WAIT_SEC
            while time.time() < deadline:
                time.sleep(POLL_INTERVAL_SEC)
                poll = client.get(op, headers={"Ocp-Apim-Subscription-Key": _key()})
                body = poll.json() if poll.content else {}
                status = (body.get("status") or "").lower()
                if status == "succeeded":
                    return mapear_analisis(body.get("analyzeResult") or {})
                if status in ("failed", "canceled"):
                    break
    except Exception as exc:
        _log.warning("ocr caja menor: %s", exc)
    return {
        "ok": False,
        "configured": True,
        "mensaje": "No se pudo leer el recibo. Complete los datos.",
        "sugerencias": {},
        "campos_detectados": [],
    }
