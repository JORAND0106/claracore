"""
OCR de certificación bancaria RRHH — Claude visión (mismo stack que Auditor SST).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, Optional

_log = logging.getLogger("claracore.rrhh.banco_ocr")

_ANTHROPIC_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
_ANTHROPIC_MODEL = (os.getenv("ANTHROPIC_MODEL") or "claude-sonnet-4-6").strip()


def banco_ocr_configured() -> bool:
    return bool(_ANTHROPIC_KEY)


def _extract_json(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise ValueError("No se pudo interpretar la respuesta del OCR bancario.")


def ocr_certificacion_bancaria(
    archivo_bytes: bytes,
    content_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extrae entidad bancaria, tipo de cuenta y número de cuenta del documento.
    Retorna { ok, sugerencias: {banco_entidad, banco_tipo_cuenta, banco_numero_cuenta}, mensaje }.
    """
    if not archivo_bytes:
        return {"ok": False, "sugerencias": {}, "mensaje": "Archivo vacío."}
    if not banco_ocr_configured():
        return {
            "ok": False,
            "sugerencias": {},
            "mensaje": "OCR no configurado (falta ANTHROPIC_API_KEY).",
            "configured": False,
        }

    mime = (content_type or "application/pdf").split(";")[0].strip().lower()
    imagenes: list = []
    try:
        from modulos_experimentales_routes import _ingest_pdfs_for_audit

        if mime == "application/pdf" or archivo_bytes[:5] == b"%PDF-":
            imagenes = _ingest_pdfs_for_audit([archivo_bytes])
        else:
            import base64

            imagenes = [base64.b64encode(archivo_bytes).decode("ascii")]
    except Exception as exc:
        _log.exception("ingest banco ocr")
        return {"ok": False, "sugerencias": {}, "mensaje": f"No se pudo leer el documento: {exc}"}

    if not imagenes:
        return {"ok": False, "sugerencias": {}, "mensaje": "No se extrajo contenido del documento."}

    import anthropic

    contenido: list = [{
        "type": "text",
        "text": (
            "Eres un extractor de datos de certificaciones bancarias colombianas. "
            "Responde SOLO JSON UTF-8 con este esquema:\n"
            '{"banco_entidad":"","banco_tipo_cuenta":"ahorros|corriente|null","banco_numero_cuenta":"","confianza":0.0}\n'
            "Normaliza tipo de cuenta a exactamente «ahorros» o «corriente» si es posible."
        ),
    }]
    for img in imagenes[:6]:
        if isinstance(img, dict) and img.get("tipo") == "texto":
            contenido.append({"type": "text", "text": f"[TEXTO]:\n{img.get('contenido','')}"})
        else:
            contenido.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": img},
            })

    try:
        client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
        resp = client.messages.create(
            model=_ANTHROPIC_MODEL,
            max_tokens=800,
            messages=[{"role": "user", "content": contenido}],
        )
        raw = resp.content[0].text
        data = _extract_json(raw)
    except Exception as exc:
        _log.exception("claude banco ocr")
        return {"ok": False, "sugerencias": {}, "mensaje": f"OCR falló: {exc}"}

    tipo = (data.get("banco_tipo_cuenta") or "").strip().lower() or None
    if tipo and tipo not in ("ahorros", "corriente"):
        if "ahor" in tipo:
            tipo = "ahorros"
        elif "corr" in tipo:
            tipo = "corriente"
        else:
            tipo = None

    sug = {
        "banco_entidad": (data.get("banco_entidad") or "").strip() or None,
        "banco_tipo_cuenta": tipo,
        "banco_numero_cuenta": (data.get("banco_numero_cuenta") or "").strip() or None,
    }
    filled = sum(1 for v in sug.values() if v)
    return {
        "ok": filled > 0,
        "sugerencias": sug,
        "mensaje": f"OCR detectó {filled} campo(s). Revise antes de guardar.",
        "configured": True,
    }
