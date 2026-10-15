"""
Auditoría documental RRHH — inventario real del expediente + Claude.

Causa histórica de falsos «faltantes»:
  El contrato laboral vive en `rrhh_contratos_generados` (generado o PDF
  cargado) y NO se incluía en los blobs enviados al modelo. La cédula y
  demás soporte sí estaban en `rrhh_trabajador_documentos`, pero el informe
  se basaba en hallazgos por *campo* (NO ENCONTRADO) sin contrastar contra
  el inventario real de archivos.

Reglas:
  - Un documento solo es «no cargado» si no hay archivo vigente en el expediente.
  - Contrato generado y contrato PDF adjunto se tratan igual.
  - El informe es una tabla: Ubicación·Tipo | Archivo | Versión | Hallazgo.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

_log = logging.getLogger("claracore.rrhh.auditoria_docs")

_ANTHROPIC_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
_ANTHROPIC_MODEL = (os.getenv("ANTHROPIC_MODEL") or "claude-sonnet-4-6").strip()

PANEL_LABEL = {
    "contrato_laboral": "Contrato",
    "soporte": "Documentos de soporte",
    "ingreso": "Documentos de ingreso",
    "bancario": "Documentación bancaria",
    "afiliacion": "Certificaciones de afiliación",
}

# Campo IA → (categoria, tipo) del checklist
_CAMPO_A_SLOT = {
    "nombre": ("soporte", "cedula"),
    "cedula": ("soporte", "cedula"),
    "cargo": ("contrato_laboral", "contrato_laboral"),
    "tipo_contrato": ("contrato_laboral", "contrato_laboral"),
    "fecha_ingreso": ("contrato_laboral", "contrato_laboral"),
    "eps": ("afiliacion", "cert_eps"),
    "pension": ("afiliacion", "cert_pension"),
    "cesantias": ("afiliacion", "cert_cesantias"),
    "arl": ("afiliacion", "cert_arl"),
    "caja_compensacion": ("afiliacion", "cert_caja"),
    "arl_nivel_riesgo": ("afiliacion", "cert_arl"),
    "banco_entidad": ("bancario", "certificacion_bancaria"),
    "banco_tipo_cuenta": ("bancario", "certificacion_bancaria"),
    "banco_numero_cuenta": ("bancario", "certificacion_bancaria"),
    "email": ("soporte", "hoja_vida"),
    "telefono": ("soporte", "hoja_vida"),
}

_RRHH_AUDITOR_KEYS = (
    "nombre, cedula, cargo, tipo_contrato, fecha_ingreso, "
    "eps, pension, cesantias, arl, caja_compensacion, arl_nivel_riesgo, "
    "banco_entidad, banco_tipo_cuenta, banco_numero_cuenta, email, telefono"
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
    """True si hay filas con diferencia o docs obligatorios no cargados."""
    for fila in (resultado.get("filas") or []):
        est = str(fila.get("estado") or "").upper()
        if est in ("DISCREPANCIA", "NO_CARGADO"):
            # Opcionales no cargados no cuentan como discrepancia bloqueante
            # (la aprobación ya no se bloquea por hallazgos; esto es informativo).
            if est == "NO_CARGADO" and fila.get("opcional"):
                continue
            return True
    # Compat: resultado IA antiguo sin filas
    for h in (resultado.get("hallazgos") or []):
        est = str(h.get("estado") or "").upper()
        if est in ("DISCREPANCIA", "NO ENCONTRADO"):
            return True
    if resultado.get("coincide_con_bd") is False:
        return True
    return bool(resultado.get("alertas_criticas") or [])


def auditoria_fue_ejecutada(trab: dict) -> bool:
    """Hubo al menos una auditoría registrada (fecha o informe_id)."""
    if trab.get("doc_auditoria_en"):
        return True
    if trab.get("doc_auditoria_informe_id"):
        return True
    return False


def ubicacion_tipo(categoria: str, label: str) -> str:
    panel = PANEL_LABEL.get((categoria or "").strip().lower(), categoria or "Documentación")
    return f"{panel} · {label}"


# Tipos base (alineados con rrhh_docs_service; sin importar azure).
_TIPOS_SOPORTE = (
    ("cedula", "Cédula / Documento de identidad"),
    ("hoja_vida", "Hoja de vida"),
    ("certificados", "Certificados"),
)
_TIPOS_INGRESO = (
    ("induccion", "Constancia de inducción"),
    ("reglamento", "Entrega de reglamentos"),
    ("examen_medico", "Examen médico de ingreso"),
)
_TIPOS_BANCARIO = (
    ("certificacion_bancaria", "Certificación bancaria"),
)
_TIPOS_AFILIACION = (
    ("cert_eps", "Certificación EPS"),
    ("cert_pension", "Certificación Pensión / AFP"),
    ("cert_arl", "Certificación ARL"),
    ("cert_cesantias", "Certificación Cesantías"),
    ("cert_caja", "Certificación Caja de Compensación"),
)


def slots_checklist_auditoria(
    trab: dict,
    *,
    custom_tipos: Optional[Sequence[Tuple[str, str, str]]] = None,
) -> List[dict]:
    """
    Slots del informe (incluye contrato laboral + checklist documental).
    custom_tipos: [(categoria, tipo_slug, label), ...]
    """
    from rrhh_docs_obligatoriedad import es_doc_opcional

    del trab  # reservado para reglas futuras por colaborador
    slots: List[dict] = []
    seen = set()

    def add(cat: str, tipo: str, label: str) -> None:
        if tipo == "otro":
            return
        key = (cat, tipo)
        if key in seen:
            return
        seen.add(key)
        slots.append({
            "categoria": cat,
            "tipo": tipo,
            "label": label,
            "panel": PANEL_LABEL.get(cat, cat),
            "ubicacion": ubicacion_tipo(cat, label),
            "opcional": es_doc_opcional(cat, tipo),
        })

    add("contrato_laboral", "contrato_laboral", "Contrato laboral")
    for cat, tipos in (
        ("soporte", _TIPOS_SOPORTE),
        ("ingreso", _TIPOS_INGRESO),
        ("bancario", _TIPOS_BANCARIO),
        ("afiliacion", _TIPOS_AFILIACION),
    ):
        for tipo, label in tipos:
            add(cat, tipo, label)
    for cat, tipo, label in (custom_tipos or ()):
        add(cat, tipo, label)
    return slots


def indexar_adjuntos(adjuntos: Sequence[dict]) -> Dict[Tuple[str, str], dict]:
    """
    Primer adjunto vigente por (categoria, tipo).
    Cada adjunto: categoria, tipo, nombre_archivo, version_label|version_num, ...
    """
    by: Dict[Tuple[str, str], dict] = {}
    for a in adjuntos or []:
        cat = str(a.get("categoria") or "").strip().lower()
        tipo = str(a.get("tipo") or "").strip().lower()
        if not cat or not tipo:
            continue
        key = (cat, tipo)
        if key not in by:
            by[key] = a
    return by


def _version_texto(adj: Optional[dict]) -> str:
    if not adj:
        return "—"
    if adj.get("version_label"):
        return str(adj["version_label"])
    vn = adj.get("version_num")
    if vn is not None:
        return f"v{vn}"
    return "Vigente"


def construir_filas_informe(
    slots: Sequence[dict],
    adjuntos_by_key: Dict[Tuple[str, str], dict],
    *,
    hallazgos_ia: Optional[Sequence[dict]] = None,
) -> List[dict]:
    """
    Tabla del informe. Un documento cargado NUNCA aparece como «no cargado»,
    aunque la IA diga NO ENCONTRADO en un campo.
    """
    hallazgos_ia = list(hallazgos_ia or [])
    por_slot: Dict[Tuple[str, str], List[dict]] = {}
    for h in hallazgos_ia:
        campo = str(h.get("campo") or "").strip().lower()
        slot_key = _CAMPO_A_SLOT.get(campo)
        if not slot_key:
            continue
        por_slot.setdefault(slot_key, []).append(h)

    filas: List[dict] = []
    for slot in slots:
        key = (slot["categoria"], slot["tipo"])
        adj = adjuntos_by_key.get(key)
        base = {
            "ubicacion": slot["ubicacion"],
            "categoria": slot["categoria"],
            "tipo": slot["tipo"],
            "label": slot["label"],
            "opcional": bool(slot.get("opcional")),
        }
        if not adj:
            filas.append({
                **base,
                "archivo": "—",
                "version": "—",
                "hallazgo": "Documento no cargado",
                "estado": "NO_CARGADO",
            })
            continue

        archivo = str(adj.get("nombre_archivo") or adj.get("nombre") or "archivo").strip() or "archivo"
        version = _version_texto(adj)
        related = por_slot.get(key) or []
        diffs = [
            h for h in related
            if str(h.get("estado") or "").upper() == "DISCREPANCIA"
        ]
        if diffs:
            partes = []
            for h in diffs:
                campo = h.get("campo") or "dato"
                det = (h.get("detalle") or "").strip()
                partes.append(
                    f"{campo}: BD «{h.get('valor_bd')}» / PDF «{h.get('valor_pdf')}»"
                    + (f" — {det}" if det else "")
                )
            filas.append({
                **base,
                "archivo": archivo,
                "version": version,
                "hallazgo": "Diferencia encontrada: " + "; ".join(partes),
                "estado": "DISCREPANCIA",
            })
        else:
            # NO ENCONTRADO de IA con archivo presente → no marcar faltante
            illegible = [
                h for h in related
                if str(h.get("estado") or "").upper() in ("NO ENCONTRADO", "NO_ENCONTRADO")
            ]
            if illegible:
                campos = ", ".join(str(h.get("campo") or "") for h in illegible)
                hallazgo = (
                    f"Documento cargado; no se pudo contrastar en el PDF "
                    f"({campos}). Revise calidad/escaneo."
                )
                estado = "OK_PARCIAL"
            else:
                hallazgo = "Sin diferencias"
                estado = "OK"
            filas.append({
                **base,
                "archivo": archivo,
                "version": version,
                "hallazgo": hallazgo,
                "estado": estado,
            })
    return filas


def _system_prompt() -> str:
    return (
        "Eres auditor documental de Recursos Humanos en Colombia. "
        "Comparas datos del colaborador en el sistema con los PDFs/imágenes del expediente.\n"
        "Responde SOLO JSON válido UTF-8, sin markdown.\n\n"
        "IMPORTANTE:\n"
        "- Recibes un INVENTARIO de archivos realmente adjuntos. "
        "NO digas que un documento falta si está en ese inventario.\n"
        "- Contrato laboral generado en plataforma y contrato PDF cargado son equivalentes.\n"
        "- «NO ENCONTRADO» solo aplica a un *dato* que no pudiste leer en el PDF, "
        "nunca para afirmar que el archivo no existe.\n\n"
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


def _llamar_claude(
    *,
    trabajador: dict,
    inventario: List[dict],
    pdf_blobs: List[bytes],
) -> Tuple[dict, Optional[int], Optional[int]]:
    if not _ANTHROPIC_KEY:
        raise ValueError("Auditoría no disponible: falta ANTHROPIC_API_KEY.")
    if not pdf_blobs:
        return {
            "hallazgos": [],
            "resumen": "Sin archivos PDF/imagen para contrastar contra la BD.",
            "documentos_encontrados": [],
            "documentos_faltantes": [],
        }, None, None

    from modulos_experimentales_routes import _ingest_pdfs_for_audit
    import anthropic

    imagenes = _ingest_pdfs_for_audit(pdf_blobs)
    if not imagenes:
        raise ValueError("No se pudieron extraer páginas de los PDFs.")

    datos = _datos_sistema(trabajador)
    inv_lines = []
    for i, item in enumerate(inventario, start=1):
        inv_lines.append(
            f"{i}. [{item.get('categoria')}/{item.get('tipo')}] "
            f"{item.get('ubicacion') or item.get('label')} — "
            f"archivo «{item.get('nombre_archivo')}» "
            f"versión «{_version_texto(item)}»"
        )
    inv_txt = "\n".join(inv_lines) if inv_lines else "(vacío)"

    contenido: List[dict] = [{
        "type": "text",
        "text": (
            f"DATOS SISTEMA RRHH:\n{json.dumps(datos, ensure_ascii=False, indent=2)}\n\n"
            f"INVENTARIO DE ARCHIVOS ADJUNTOS ({len(inventario)}):\n{inv_txt}\n\n"
            f"A continuación hay {len(pdf_blobs)} documento(s) del expediente "
            f"(mismo orden que el inventario cuando aplica)."
        ),
    }]
    max_imgs = int(os.getenv("AUDITOR_MAX_IMAGES_MSG") or "32")
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
        system=_system_prompt(),
        messages=[{"role": "user", "content": contenido}],
    )
    raw = respuesta.content[0].text
    resultado = _parse_resultado(raw)
    return (
        resultado,
        getattr(respuesta.usage, "input_tokens", None),
        getattr(respuesta.usage, "output_tokens", None),
    )


def ejecutar_auditoria_documentacion(
    *,
    trabajador: dict,
    slots: Sequence[dict],
    adjuntos: Sequence[dict],
    pdf_blobs: List[bytes],
) -> Dict[str, Any]:
    """
    Ejecuta auditoría y construye filas de tabla.
    `adjuntos` debe incluir contrato laboral (si existe) y docs de soporte/etc.
    `pdf_blobs` en el mismo orden preferible que adjuntos con bytes.
    """
    by_key = indexar_adjuntos(adjuntos)
    inventario = [
        {
            **a,
            "ubicacion": ubicacion_tipo(a.get("categoria") or "", a.get("label") or a.get("tipo") or ""),
        }
        for a in adjuntos
        if a.get("azure_blob_path") or a.get("nombre_archivo")
    ]

    resultado_ia: dict = {"hallazgos": []}
    tokens_in = tokens_out = None
    if pdf_blobs:
        resultado_ia, tokens_in, tokens_out = _llamar_claude(
            trabajador=trabajador,
            inventario=inventario,
            pdf_blobs=pdf_blobs,
        )

    filas = construir_filas_informe(
        slots, by_key, hallazgos_ia=resultado_ia.get("hallazgos") or [],
    )
    resultado = {
        **resultado_ia,
        "filas": filas,
        "inventario": [
            {
                "categoria": a.get("categoria"),
                "tipo": a.get("tipo"),
                "nombre_archivo": a.get("nombre_archivo"),
                "version": _version_texto(a),
            }
            for a in inventario
        ],
    }
    tiene_diff = auditoria_tiene_discrepancias(resultado)
    return {
        "resultado": resultado,
        "filas": filas,
        "ok": not tiene_diff,
        "tiene_discrepancias": tiene_diff,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "ejecutado_en": _now_iso(),
        "documentos_auditados": len(pdf_blobs),
    }
