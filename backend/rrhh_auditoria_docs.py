"""
Auditoría documental RRHH — reutiliza ingestión/visión del Auditor SST (Claude).
No modifica el módulo SST; solo lo invoca internamente.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("claracore.rrhh.auditoria_docs")

_ANTHROPIC_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
_ANTHROPIC_MODEL = (os.getenv("ANTHROPIC_MODEL") or "claude-sonnet-4-6").strip()

_RRHH_AUDITOR_KEYS = (
    "nombre, cedula, cargo, tipo_contrato, fecha_ingreso, "
    "eps, pension, cesantias, arl, caja_compensacion, arl_nivel_riesgo, "
    "banco_entidad, banco_tipo_cuenta, banco_numero_cuenta, email, telefono"
)

_SYSTEM = (
    "Eres auditor documental de Recursos Humanos en Colombia. "
    "Comparas datos del colaborador en el sistema con los PDFs del expediente de contratación.\n"
    "Responde SOLO JSON válido UTF-8, sin markdown.\n\n"
    'En cada "hallazgos":\n'
    '- "campo": una de: ' + _RRHH_AUDITOR_KEYS + ".\n"
    '- "estado": OK | DISCREPANCIA | NO ENCONTRADO.\n'
    '- "valor_bd", "valor_pdf", "detalle".\n\n'
    "REGLAS: LITERAL estricto en nombre, cédula, fechas y número de cuenta; "
    "CORRELACIÓN razonable en EPS/ARL/AFP/banco/caja (siglas vs razón social → OK).\n"
    "Esquema:\n"
    '{"colaborador_identificado":"","cedula_identificada":"","coincide_con_bd":true,"puntuacion":0,'
    '"resumen":"","documentos_encontrados":[],"documentos_faltantes":[],'
    '"hallazgos":[{"campo":"nombre","estado":"OK","valor_bd":"","valor_pdf":null,"detalle":""}],'
    '"alertas_criticas":[],"conclusion":""}'
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_resultado(raw: str) -> dict:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if not m:
            raise ValueError("La auditoría no devolvió JSON válido.")
        data = json.loads(m.group(0))
    if not isinstance(data, dict):
        raise ValueError("Resultado de auditoría inválido.")
    data.setdefault("hallazgos", [])
    return data


def _datos_sistema(trab: dict) -> dict:
    return {
        "nombre": f"{trab.get('nombres') or ''} {trab.get('apellidos') or ''}".strip(),
        "cedula": f"{trab.get('tipo_documento') or 'CC'} {trab.get('numero_documento') or ''}".strip(),
        "cargo": trab.get("cargo_aspira"),
        "tipo_contrato": trab.get("tipo_contrato"),
        "fecha_ingreso": trab.get("fecha_ingreso"),
        "eps": trab.get("eps"),
        "pension": trab.get("pension"),
        "cesantias": trab.get("cesantias"),
        "arl": trab.get("arl"),
        "caja_compensacion": trab.get("caja_compensacion"),
        "arl_nivel_riesgo": trab.get("arl_nivel_riesgo"),
        "banco_entidad": trab.get("banco_entidad"),
        "banco_tipo_cuenta": trab.get("banco_tipo_cuenta"),
        "banco_numero_cuenta": trab.get("banco_numero_cuenta"),
        "email": trab.get("email"),
        "telefono": trab.get("telefono"),
    }


def auditoria_tiene_discrepancias(resultado: dict) -> bool:
    hallazgos = resultado.get("hallazgos") or []
    for h in hallazgos:
        est = str(h.get("estado") or "").upper()
        if est in ("DISCREPANCIA", "NO ENCONTRADO"):
            return True
    if resultado.get("coincide_con_bd") is False:
        return True
    alertas = resultado.get("alertas_criticas") or []
    return bool(alertas)


def ejecutar_auditoria_documentacion(
    *,
    trabajador: dict,
    pdf_blobs: List[bytes],
) -> Dict[str, Any]:
    if not _ANTHROPIC_KEY:
        raise ValueError("Auditoría no disponible: falta ANTHROPIC_API_KEY.")
    if not pdf_blobs:
        raise ValueError("No hay documentos PDF para auditar.")

    from modulos_experimentales_routes import _ingest_pdfs_for_audit
    import anthropic

    imagenes = _ingest_pdfs_for_audit(pdf_blobs)
    if not imagenes:
        raise ValueError("No se pudieron extraer páginas de los PDFs.")

    datos = _datos_sistema(trabajador)
    contenido: List[dict] = [{
        "type": "text",
        "text": f"DATOS SISTEMA RRHH:\n{json.dumps(datos, ensure_ascii=False, indent=2)}\n\n"
                f"Analiza {len(pdf_blobs)} documento(s) del expediente.",
    }]
    max_imgs = int(os.getenv("AUDITOR_MAX_IMAGES_MSG") or "24")
    for img in imagenes[:max_imgs]:
        if isinstance(img, dict) and img.get("tipo") == "texto":
            contenido.append({"type": "text", "text": f"[TEXTO PDF]:\n{img.get('contenido','')}"})
        else:
            contenido.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": img},
            })
    contenido.append({"type": "text", "text": "Devuelve el JSON de auditoría solicitado."})

    client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
    respuesta = client.messages.create(
        model=_ANTHROPIC_MODEL,
        max_tokens=int(os.getenv("AUDITOR_MAX_OUTPUT_TOKENS") or "4096"),
        system=_SYSTEM,
        messages=[{"role": "user", "content": contenido}],
    )
    raw = respuesta.content[0].text
    resultado = _parse_resultado(raw)
    tiene_diff = auditoria_tiene_discrepancias(resultado)
    return {
        "resultado": resultado,
        "ok": not tiene_diff,
        "tiene_discrepancias": tiene_diff,
        "tokens_in": getattr(respuesta.usage, "input_tokens", None),
        "tokens_out": getattr(respuesta.usage, "output_tokens", None),
        "ejecutado_en": _now_iso(),
    }
