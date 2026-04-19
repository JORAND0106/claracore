import io
import json
import logging
import html
import hashlib
import base64
import difflib
import math
import os as _os
import re
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("uvicorn.error")
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from pydantic import BaseModel
from xhtml2pdf import pisa
from main import get_current_user as _get_user
from mail_smtp import try_send_text_email
from supabase import create_client as _create_client
from ccd_conciliacion import (
    aggregate_items_conciliacion,
    fetch_registros_conciliacion,
    fetch_registros_memoria_conciliacion,
)

# ClaraCore Documentación (CCD): código único por tipo de formato (gestión documental).
CODIGO_FORMATO_CCD_CC_SUB_001 = "CC-SUB-001"
CODIGO_FORMATO_CCD_CC_SUB_002 = "CC-SUB-002"
CODIGO_FORMATO_CCD_CC_SEM_001 = "CC-SEM-001"
CODIGO_FORMATO_CCD_CC_SEM_002 = "CC-SEM-002"
CODIGO_FORMATO_CCD_CC_MES_001 = "CC-MES-001"
CODIGO_FORMATO_CCD_CC_MES_002 = "CC-MES-002"
# Formato contractual entidad contratante (IDU — gestión documental ClaraCore).
CODIGO_FORMATO_IDU_FO_EO_04_V2 = "FO-IDU-EO-04-V2"
_sb = _create_client(
    _os.getenv("SUPABASE_URL", ""),
    _os.getenv("SUPABASE_KEY", "")
)

router = APIRouter(tags=["informes"])

# ── Biblioteca CCD (gestión documental): metadatos por código de formato ─────
# Más adelante el contrato podrá elegir qué códigos aplican; las plantillas siguen en código.
FORMATOS_CCD: Dict[str, Dict[str, Any]] = {
    CODIGO_FORMATO_CCD_CC_SUB_001: {
        "titulo": "Informe corte de subcontratista",
        "descripcion": "Preacta / corte de cantidades aprobadas por subcontratista",
        "plantilla_html": "cc_sub_001_v1_plain",
        "motor_pdf": "xhtml2pdf",
        "layout": {
            "encabezado_institucional_solo_primera_hoja": True,
            "tabla_items_continua_en_siguientes_hojas": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        # Misma estructura de slots para futuros formatos (Elaboró / Revisó configurables; Aprobó según reglas del formato).
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
            {"id": "aprobo", "label": "Aprobó", "origen": "subcontratista"},
        ],
        # Si False, perfiles de interventoría pueden ocultar el formato en la biblioteca (UI).
        "acceso_interventoria": False,
    },
    CODIGO_FORMATO_CCD_CC_SUB_002: {
        "titulo": "Memoria por ítem (corte subcontratista)",
        "descripcion": "Detalle de cantidades aprobadas y registro fotográfico por ítem",
        "plantilla_html": "memoria_item",
        "motor_pdf": "xhtml2pdf",
        "layout": {
            "orientacion": "landscape",
            "encabezado_institucional_solo_primera_hoja": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
            {"id": "aprobo", "label": "Aprobó", "origen": "subcontratista"},
        ],
        "acceso_interventoria": False,
    },
    CODIGO_FORMATO_CCD_CC_SEM_001: {
        "titulo": "Informe ejecución semanal (conciliación interventoría–contratista)",
        "descripcion": "Cantidades nivel 3 aprobadas y bloqueadas, filtradas por semana de aprobación (so_semanas).",
        "plantilla_html": "cc_conc_sem_001_v1",
        "motor_pdf": "xhtml2pdf",
        "layout": {
            "encabezado_institucional_solo_primera_hoja": True,
            "tabla_items_continua_en_siguientes_hojas": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
            {"id": "aprobo", "label": "Aprobó", "origen": "configuracion"},
        ],
        "acceso_interventoria": True,
    },
    CODIGO_FORMATO_CCD_CC_SEM_002: {
        "titulo": "Memoria por ítem — semanal (conciliación)",
        "descripcion": "Detalle y anexo fotográfico por ítem; mismo criterio de filtro que CC-SEM-001.",
        "plantilla_html": "memoria_item_conc_sem",
        "motor_pdf": "xhtml2pdf",
        "layout": {
            "orientacion": "landscape",
            "encabezado_institucional_solo_primera_hoja": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
            {"id": "aprobo", "label": "Aprobó", "origen": "configuracion"},
        ],
        "acceso_interventoria": True,
    },
    CODIGO_FORMATO_CCD_CC_MES_001: {
        "titulo": "Informe ejecución mensual (conciliación interventoría–contratista)",
        "descripcion": "Cantidades nivel 3 aprobadas y bloqueadas, filtradas por acta RPO.",
        "plantilla_html": "cc_conc_mes_001_v1",
        "motor_pdf": "xhtml2pdf",
        "layout": {
            "encabezado_institucional_solo_primera_hoja": True,
            "tabla_items_continua_en_siguientes_hojas": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
            {"id": "aprobo", "label": "Aprobó", "origen": "configuracion"},
        ],
        "acceso_interventoria": True,
    },
    CODIGO_FORMATO_CCD_CC_MES_002: {
        "titulo": "Memoria por ítem — mensual (conciliación)",
        "descripcion": "Detalle y anexo fotográfico por ítem; mismo criterio de filtro que CC-MES-001.",
        "plantilla_html": "memoria_item_conc_mes",
        "motor_pdf": "xhtml2pdf",
        "layout": {
            "orientacion": "landscape",
            "encabezado_institucional_solo_primera_hoja": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
            {"id": "aprobo", "label": "Aprobó", "origen": "configuracion"},
        ],
        "acceso_interventoria": True,
    },
    CODIGO_FORMATO_IDU_FO_EO_04_V2: {
        "titulo": "Memorias IDU FO-EO-04 V2.0",
        "descripcion": "Memoria de cálculo de cantidades de obra — Instituto de Desarrollo Urbano (IDU).",
        "plantilla_html": "idu_memoria_fo_eo_04_v2",
        "motor_pdf": "xhtml2pdf",
        "grupo_ccd": "entidades_externas",
        "layout": {
            "orientacion": "portrait",
            "encabezado_institucional_solo_primera_hoja": True,
            "firmas_solo_ultima_hoja": True,
            "firmas_bloque_inferior": True,
        },
        "slots_firma": [
            {"id": "elaboro", "label": "Elaboró", "origen": "configuracion"},
            {"id": "reviso", "label": "Revisó", "origen": "configuracion"},
        ],
        "acceso_interventoria": True,
    },
}


def _safe_filename_part(s: object) -> str:
    """Nombre de archivo seguro para Content-Disposition: solo ASCII (HTTP/latin-1).
    Antes se usaba \\w (Unicode); un acento en razón social rompía el envío de cabeceras → 500 genérico."""
    raw = str(s if s is not None else "").strip()
    t = re.sub(r"[^A-Za-z0-9._\-]+", "_", raw)
    return (t or "x")[:80]


def _natural_sort_key_cadena(s: object) -> Tuple[Any, ...]:
    """Orden natural por trozos numéricos vs texto: 1.10.1 < 1.10.2; NP-004 < NP-205; 4.01. < 4.26."""
    t = str(s if s is not None else "").strip()
    if not t:
        return (2, ())
    parts: List[Tuple[int, Any]] = []
    for part in re.split(r"(\d+)", t):
        if not part:
            continue
        if part.isdigit():
            parts.append((0, int(part)))
        else:
            parts.append((1, part.lower()))
    return (0, tuple(parts))


def _capitulo_sort_key_asc(s: object) -> Tuple[Any, ...]:
    """Primer entero al inicio del texto de capítulo (1.PRELIMIN… → 1; 16. ZONA… → 16). Sin número: antes que vacío."""
    t = str(s if s is not None else "").strip()
    if not t:
        return (2, 0, "")
    m = re.match(r"^\s*(\d+)", t)
    if m:
        try:
            return (0, int(m.group(1)), t.lower())
        except ValueError:
            pass
    return (1, t.lower())


def _capitulos_por_item_numero_desde_items(items: List[dict]) -> Dict[str, str]:
    """Un capítulo por código de ítem (prioriza el primero no vacío al fusionar)."""
    m: Dict[str, str] = {}
    for it in items or []:
        k = (it.get("item_numero") or "").strip()
        if not k:
            continue
        cap = str(it.get("capitulo") or "").strip()
        if k not in m:
            m[k] = cap
        elif cap and not m[k]:
            m[k] = cap
    return m


def _sort_identificadores_item_asc(
    identificadores: List[str],
    capitulos_por_item: Optional[Dict[str, str]] = None,
) -> List[str]:
    if capitulos_por_item:
        return sorted(
            identificadores,
            key=lambda k: (
                _capitulo_sort_key_asc((capitulos_por_item or {}).get(k, "")),
                _natural_sort_key_cadena(k),
            ),
        )
    return sorted(identificadores, key=_natural_sort_key_cadena)


def _sort_items_corte_por_item_numero_asc(items: List[dict]) -> None:
    """Orden in-place: primero por capítulo (número inicial), luego por código de ítem (orden natural)."""
    items.sort(
        key=lambda it: (
            _capitulo_sort_key_asc(it.get("capitulo")),
            _natural_sort_key_cadena(it.get("item_numero")),
        )
    )


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


def _html_logo_contratista(contrato: dict, compact: bool = False, compact_box_height: str = "") -> str:
    """Logo del contratista (URL en BD). xhtml2pdf intenta cargar la URL; si falla, queda placeholder.
    compact=True: CC-SUB-002; si compact_box_height (p.ej. \"1.28cm\") el logo llena ese rectángulo (object-fit: contain)."""
    url = contrato.get("logo_contratista")
    box = (compact_box_height or "").strip()
    if url is None or str(url).strip() == "":
        h = box if (compact and box) else ("40px" if compact else "84px")
        fs = "5.5pt" if compact else "6.5pt"
        # display:table + table-cell: xhtml2pdf maneja mejor que flex el centrado del placeholder.
        return (
            f'<div style="width:100%;height:{h};display:table;box-sizing:border-box;border:1px dashed #cbd5e1;">'
            f'<div style="display:table-cell;width:100%;height:{h};vertical-align:middle;text-align:center;'
            f'font-size:{fs};color:#94a3b8;">LOGO</div></div>'
        )
    u = html.escape(str(url).strip(), quote=True)
    if compact and box:
        return (
            f'<div style="width:100%;height:{box};min-height:{box};box-sizing:border-box;padding:0;margin:0;'
            'display:table;table-layout:fixed;overflow:hidden;">'
            f'<div style="display:table-cell;width:100%;height:{box};vertical-align:middle;text-align:center;padding:0;">'
            f'<img src="{u}" alt="" style="max-width:100%;max-height:100%;width:auto;height:auto;display:inline-block;'
            'object-fit:contain;vertical-align:middle;margin:0;" />'
            "</div></div>"
        )
    if compact:
        return (
            f'<img src="{u}" alt="" style="max-width:118px;max-height:40px;display:block;margin:0 auto;'
            'object-fit:contain;" />'
        )
    return (
        f'<img src="{u}" alt="" style="max-width:132px;max-height:92px;display:block;margin:0 auto;'
        'object-fit:contain;" />'
    )


def _row(table: str, select: str, **eq: Any) -> Optional[Dict[str, Any]]:
    """Una fila o None; evita excepciones de PostgREST por `.single()` sin resultados."""
    q = _sb.table(table).select(select)
    for k, v in eq.items():
        q = q.eq(k, v)
    rows = q.limit(1).execute().data or []
    return rows[0] if rows else None


class CcdEstiloPdfBody(BaseModel):
    """Colores PDF por formato (hex #RRGGBB). Vacío = defaults del backend."""

    section_bar_bg: Optional[str] = None
    section_bar_text: Optional[str] = None
    thead_bg: Optional[str] = None
    row_even_bg: Optional[str] = None
    row_odd_bg: Optional[str] = None
    subtotal_bg: Optional[str] = None
    capitulo_subtotal_bg: Optional[str] = None


class CcdFirmaConfigBody(BaseModel):
    elaboro_nombre: Optional[str] = None
    elaboro_cargo: Optional[str] = None
    reviso_nombre: Optional[str] = None
    reviso_cargo: Optional[str] = None
    aprobo_nombre: Optional[str] = None
    aprobo_cargo: Optional[str] = None
    elaboro_usuario_id: Optional[int] = None
    reviso_usuario_id: Optional[int] = None
    aprobo_usuario_id: Optional[int] = None
    estilo_pdf: Optional[CcdEstiloPdfBody] = None


def _sanitize_ccd_hex_color(val: object, default: str) -> str:
    """Acepta #RGB / #RRGGBB; si es inválido devuelve default."""
    d = (default or "#000000").strip()
    if val is None:
        return d
    s = str(val).strip()
    if not s:
        return d
    if not s.startswith("#"):
        s = "#" + s
    if re.match(r"^#[0-9A-Fa-f]{3}$", s):
        r, g, b = s[1], s[2], s[3]
        s = f"#{r}{r}{g}{g}{b}{b}"
    if re.match(r"^#[0-9A-Fa-f]{6}$", s):
        return s.lower()
    return d


def _default_estilo_pdf(formato_codigo: str) -> Dict[str, str]:
    """Valores por defecto alineados a las plantillas actuales (CC-SUB-001 / CC-SUB-002)."""
    if formato_codigo in (
        CODIGO_FORMATO_CCD_CC_SUB_001,
        CODIGO_FORMATO_CCD_CC_SEM_001,
        CODIGO_FORMATO_CCD_CC_MES_001,
    ):
        d: Dict[str, str] = {
            "section_bar_bg": "#e5e7eb",
            "section_bar_text": "#111827",
            "thead_bg": "#e8e8e8",
            "row_even_bg": "#ffffff",
            "row_odd_bg": "#f9fafb",
            "subtotal_bg": "#dbeafe",
        }
        if formato_codigo in (CODIGO_FORMATO_CCD_CC_SEM_001, CODIGO_FORMATO_CCD_CC_MES_001):
            d["capitulo_subtotal_bg"] = "#93c5fd"
        return d
    if formato_codigo in (
        CODIGO_FORMATO_CCD_CC_SUB_002,
        CODIGO_FORMATO_CCD_CC_SEM_002,
        CODIGO_FORMATO_CCD_CC_MES_002,
    ):
        return {
            "section_bar_bg": "#e5e7eb",
            "section_bar_text": "#111827",
            "thead_bg": "#f3f4f6",
            "row_even_bg": "#f8fafc",
            "row_odd_bg": "#ffffff",
            "subtotal_bg": "#e5e7eb",
        }
    return {
        "section_bar_bg": "#e5e7eb",
        "section_bar_text": "#111827",
        "thead_bg": "#f3f4f6",
        "row_even_bg": "#f8fafc",
        "row_odd_bg": "#ffffff",
        "subtotal_bg": "#e5e7eb",
    }


def _merge_estilo_pdf(raw: Any, formato_codigo: str) -> Dict[str, str]:
    base = _default_estilo_pdf(formato_codigo)
    if raw is None:
        return base
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return base
    if not isinstance(raw, dict):
        return base
    out = dict(base)
    for k in base:
        if k in raw and raw[k] is not None and str(raw[k]).strip() != "":
            out[k] = _sanitize_ccd_hex_color(raw[k], base[k])
    return out


def _estilo_pdf_from_body(body: Optional[CcdEstiloPdfBody], formato_codigo: str) -> Dict[str, str]:
    if body is None:
        return _default_estilo_pdf(formato_codigo)
    d = body.model_dump(exclude_none=True)
    return _merge_estilo_pdf(d, formato_codigo)


def _resolve_estilo_for_upsert(
    body: CcdFirmaConfigBody, contrato_id: int, formato_codigo: str
) -> Dict[str, str]:
    """Si el cliente no envía estilo_pdf, conserva el guardado (no resetea a defaults)."""
    if body.estilo_pdf is not None:
        return _estilo_pdf_from_body(body.estilo_pdf, formato_codigo)
    prev = _get_ccd_firma_config(contrato_id, formato_codigo)
    raw = prev.get("estilo_pdf")
    if isinstance(raw, dict) and raw:
        return _merge_estilo_pdf(raw, formato_codigo)
    return _merge_estilo_pdf(None, formato_codigo)


def _is_ccd_formato_firma_table_missing(exc: BaseException) -> bool:
    s = str(exc).lower()
    return "pgrst205" in s or ("could not find the table" in s and "ccd_formato_firma" in s)


def _opt_usuario_id(val: Any) -> Optional[int]:
    if val is None:
        return None
    try:
        i = int(val)
        return i if i > 0 else None
    except (TypeError, ValueError):
        return None


def _ccd_config_from_row(r: Dict[str, Any], formato_codigo: str) -> Dict[str, Any]:
    return {
        "elaboro_nombre": str(r.get("elaboro_nombre") or "").strip(),
        "elaboro_cargo": str(r.get("elaboro_cargo") or "").strip(),
        "reviso_nombre": str(r.get("reviso_nombre") or "").strip(),
        "reviso_cargo": str(r.get("reviso_cargo") or "").strip(),
        "aprobo_nombre": str(r.get("aprobo_nombre") or "").strip(),
        "aprobo_cargo": str(r.get("aprobo_cargo") or "").strip(),
        "elaboro_usuario_id": _opt_usuario_id(r.get("elaboro_usuario_id")),
        "reviso_usuario_id": _opt_usuario_id(r.get("reviso_usuario_id")),
        "aprobo_usuario_id": _opt_usuario_id(r.get("aprobo_usuario_id")),
        "estilo_pdf": _merge_estilo_pdf(r.get("estilo_pdf"), formato_codigo),
    }


def _ccd_formato_firma_row_get(contrato_id: int, formato_codigo: str) -> Optional[Dict[str, Any]]:
    """Lee fila; reintenta con menos columnas si el esquema aún no tiene aprobo_* o estilo_pdf."""
    selects = (
        "elaboro_nombre, elaboro_cargo, reviso_nombre, reviso_cargo, aprobo_nombre, aprobo_cargo, estilo_pdf, elaboro_usuario_id, reviso_usuario_id, aprobo_usuario_id",
        "elaboro_nombre, elaboro_cargo, reviso_nombre, reviso_cargo, estilo_pdf, elaboro_usuario_id, reviso_usuario_id, aprobo_usuario_id",
        "elaboro_nombre, elaboro_cargo, reviso_nombre, reviso_cargo, estilo_pdf, elaboro_usuario_id, reviso_usuario_id",
        "elaboro_nombre, elaboro_cargo, reviso_nombre, reviso_cargo, estilo_pdf",
        "elaboro_nombre, elaboro_cargo, reviso_nombre, reviso_cargo",
    )
    last_exc: Optional[BaseException] = None
    for sel in selects:
        try:
            rows = (
                _sb.table("ccd_formato_firma")
                .select(sel)
                .eq("contrato_id", contrato_id)
                .eq("formato_codigo", formato_codigo)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not rows:
                return None
            r = dict(rows[0])
            if "estilo_pdf" not in r:
                r["estilo_pdf"] = None
            return r
        except Exception as e:
            last_exc = e
            continue
    if last_exc:
        _log.warning("ccd_formato_firma_row_get: %s", last_exc)
    return None


def _get_ccd_firma_from_contrato_json(contrato_id: int, formato_codigo: str) -> Dict[str, Any]:
    """Fallback: contratos.ccd_firma_config[formato_codigo] (firmas + estilo_pdf opcional)."""
    try:
        rows = (
            _sb.table("contratos")
            .select("ccd_firma_config")
            .eq("id", contrato_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return {
                "elaboro_nombre": "",
                "elaboro_cargo": "",
                "reviso_nombre": "",
                "reviso_cargo": "",
                "aprobo_nombre": "",
                "aprobo_cargo": "",
                "elaboro_usuario_id": None,
                "reviso_usuario_id": None,
                "aprobo_usuario_id": None,
                "estilo_pdf": _merge_estilo_pdf(None, formato_codigo),
            }
        raw = rows[0].get("ccd_firma_config")
        if raw is None:
            return {
                "elaboro_nombre": "",
                "elaboro_cargo": "",
                "reviso_nombre": "",
                "reviso_cargo": "",
                "aprobo_nombre": "",
                "aprobo_cargo": "",
                "elaboro_usuario_id": None,
                "reviso_usuario_id": None,
                "aprobo_usuario_id": None,
                "estilo_pdf": _merge_estilo_pdf(None, formato_codigo),
            }
        if isinstance(raw, str):
            raw = json.loads(raw)
        if not isinstance(raw, dict):
            return {
                "elaboro_nombre": "",
                "elaboro_cargo": "",
                "reviso_nombre": "",
                "reviso_cargo": "",
                "aprobo_nombre": "",
                "aprobo_cargo": "",
                "elaboro_usuario_id": None,
                "reviso_usuario_id": None,
                "aprobo_usuario_id": None,
                "estilo_pdf": _merge_estilo_pdf(None, formato_codigo),
            }
        block = raw.get(formato_codigo)
        if not isinstance(block, dict):
            return {
                "elaboro_nombre": "",
                "elaboro_cargo": "",
                "reviso_nombre": "",
                "reviso_cargo": "",
                "aprobo_nombre": "",
                "aprobo_cargo": "",
                "elaboro_usuario_id": None,
                "reviso_usuario_id": None,
                "aprobo_usuario_id": None,
                "estilo_pdf": _merge_estilo_pdf(None, formato_codigo),
            }
        return {
            "elaboro_nombre": str(block.get("elaboro_nombre") or "").strip(),
            "elaboro_cargo": str(block.get("elaboro_cargo") or "").strip(),
            "reviso_nombre": str(block.get("reviso_nombre") or "").strip(),
            "reviso_cargo": str(block.get("reviso_cargo") or "").strip(),
            "aprobo_nombre": str(block.get("aprobo_nombre") or "").strip(),
            "aprobo_cargo": str(block.get("aprobo_cargo") or "").strip(),
            "elaboro_usuario_id": _opt_usuario_id(block.get("elaboro_usuario_id")),
            "reviso_usuario_id": _opt_usuario_id(block.get("reviso_usuario_id")),
            "aprobo_usuario_id": _opt_usuario_id(block.get("aprobo_usuario_id")),
            "estilo_pdf": _merge_estilo_pdf(block.get("estilo_pdf"), formato_codigo),
        }
    except Exception as e:
        _log.warning("ccd_firma_config en contratos no disponible: %s", e)
        return {
            "elaboro_nombre": "",
            "elaboro_cargo": "",
            "reviso_nombre": "",
            "reviso_cargo": "",
            "aprobo_nombre": "",
            "aprobo_cargo": "",
            "elaboro_usuario_id": None,
            "reviso_usuario_id": None,
            "aprobo_usuario_id": None,
            "estilo_pdf": _merge_estilo_pdf(None, formato_codigo),
        }


def _get_ccd_firma_config(contrato_id: int, formato_codigo: str) -> Dict[str, Any]:
    """Lee Elaboró/Revisó y estilo_pdf desde ccd_formato_firma o contratos.ccd_firma_config."""
    try:
        row = _ccd_formato_firma_row_get(contrato_id, formato_codigo)
    except Exception as e:
        if _is_ccd_formato_firma_table_missing(e):
            _log.info("ccd_formato_firma ausente; usando contratos.ccd_firma_config si existe")
            return _get_ccd_firma_from_contrato_json(contrato_id, formato_codigo)
        _log.warning("ccd_formato_firma: %s", e)
        return _get_ccd_firma_from_contrato_json(contrato_id, formato_codigo)
    if row:
        cfg = _ccd_config_from_row(row, formato_codigo)
        jcfg = _get_ccd_firma_from_contrato_json(contrato_id, formato_codigo)
        if cfg.get("elaboro_usuario_id") is None and jcfg.get("elaboro_usuario_id") is not None:
            cfg["elaboro_usuario_id"] = jcfg.get("elaboro_usuario_id")
        if cfg.get("reviso_usuario_id") is None and jcfg.get("reviso_usuario_id") is not None:
            cfg["reviso_usuario_id"] = jcfg.get("reviso_usuario_id")
        if cfg.get("aprobo_usuario_id") is None and jcfg.get("aprobo_usuario_id") is not None:
            cfg["aprobo_usuario_id"] = jcfg.get("aprobo_usuario_id")
        if not (cfg.get("aprobo_nombre") or "").strip() and (jcfg.get("aprobo_nombre") or "").strip():
            cfg["aprobo_nombre"] = jcfg.get("aprobo_nombre") or ""
        if not (cfg.get("aprobo_cargo") or "").strip() and (jcfg.get("aprobo_cargo") or "").strip():
            cfg["aprobo_cargo"] = jcfg.get("aprobo_cargo") or ""
        ep = row.get("estilo_pdf")
        if ep in (None, "", {}):
            cfg["estilo_pdf"] = jcfg.get("estilo_pdf") or cfg["estilo_pdf"]
        return cfg
    return _get_ccd_firma_from_contrato_json(contrato_id, formato_codigo)


def _list_firmantes_candidatos_contrato(contrato_id: int) -> List[Dict[str, Any]]:
    """Usuarios del contrato (principal + usuario_contratos) con cargo para elegir Elaboró/Revisó."""
    try:
        uc = _sb.table("usuario_contratos").select("usuario_id").eq("contrato_id", contrato_id).execute().data or []
        ids_uc = [r["usuario_id"] for r in uc]
        pr = (
            _sb.table("usuarios")
            .select("id, nombre, apellidos, cargo_id")
            .eq("contrato_id", contrato_id)
            .execute()
            .data
            or []
        )
        ids_principal = [u["id"] for u in pr]
        todos_ids = list(dict.fromkeys(ids_uc + ids_principal))
        if not todos_ids:
            return []
        rows = (
            _sb.table("usuarios")
            .select("id, nombre, apellidos, cargo_id, estado")
            .in_("id", todos_ids)
            .execute()
            .data
            or []
        )
        rows_ap = [r for r in rows if (r.get("estado") or "").lower() == "aprobado"]
        rows = rows_ap if rows_ap else rows
        carg_rows = _sb.table("cargos").select("id, nombre").execute().data or []
        cmap = {c["id"]: (c.get("nombre") or "").strip() for c in carg_rows}
        out: List[Dict[str, Any]] = []
        for r in rows:
            nom = f"{r.get('nombre') or ''} {r.get('apellidos') or ''}".strip()
            cid = r.get("cargo_id")
            out.append(
                {
                    "id": r.get("id"),
                    "nombre_completo": nom or "—",
                    "cargo": cmap.get(cid, "—"),
                }
            )
        out.sort(key=lambda x: (x.get("nombre_completo") or "").lower())
        return out
    except Exception as e:
        _log.warning("firmantes candidatos: %s", e)
        return []


def _upsert_ccd_firma_in_contrato_json(contrato_id: int, formato_codigo: str, body: CcdFirmaConfigBody) -> None:
    est = _resolve_estilo_for_upsert(body, contrato_id, formato_codigo)
    patch = {
        "elaboro_nombre": (body.elaboro_nombre or "").strip() or None,
        "elaboro_cargo": (body.elaboro_cargo or "").strip() or None,
        "reviso_nombre": (body.reviso_nombre or "").strip() or None,
        "reviso_cargo": (body.reviso_cargo or "").strip() or None,
        "aprobo_nombre": (body.aprobo_nombre or "").strip() or None,
        "aprobo_cargo": (body.aprobo_cargo or "").strip() or None,
        "elaboro_usuario_id": body.elaboro_usuario_id,
        "reviso_usuario_id": body.reviso_usuario_id,
        "aprobo_usuario_id": body.aprobo_usuario_id,
        "estilo_pdf": est,
    }
    rows = (
        _sb.table("contratos").select("ccd_firma_config").eq("id", contrato_id).limit(1).execute().data or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    raw = rows[0].get("ccd_firma_config")
    if raw is None:
        cfg: Dict[str, Any] = {}
    elif isinstance(raw, str):
        cfg = json.loads(raw) if raw.strip() else {}
    elif isinstance(raw, dict):
        cfg = dict(raw)
    else:
        cfg = {}
    cfg[formato_codigo] = patch
    _sb.table("contratos").update({"ccd_firma_config": cfg}).eq("id", contrato_id).execute()


def _upsert_ccd_firma_config(contrato_id: int, formato_codigo: str, body: CcdFirmaConfigBody) -> Dict[str, Any]:
    est = _resolve_estilo_for_upsert(body, contrato_id, formato_codigo)
    row = {
        "contrato_id": contrato_id,
        "formato_codigo": formato_codigo,
        "elaboro_nombre": (body.elaboro_nombre or "").strip() or None,
        "elaboro_cargo": (body.elaboro_cargo or "").strip() or None,
        "reviso_nombre": (body.reviso_nombre or "").strip() or None,
        "reviso_cargo": (body.reviso_cargo or "").strip() or None,
        "aprobo_nombre": (body.aprobo_nombre or "").strip() or None,
        "aprobo_cargo": (body.aprobo_cargo or "").strip() or None,
        "elaboro_usuario_id": body.elaboro_usuario_id,
        "reviso_usuario_id": body.reviso_usuario_id,
        "aprobo_usuario_id": body.aprobo_usuario_id,
        "estilo_pdf": est,
    }
    try:
        ex = (
            _sb.table("ccd_formato_firma")
            .select("id")
            .eq("contrato_id", contrato_id)
            .eq("formato_codigo", formato_codigo)
            .limit(1)
            .execute()
            .data
            or []
        )
        row_write = dict(row)

        def _err_txt(exc: BaseException) -> str:
            return f"{exc!s} {repr(exc)}".lower()

        def _do_write(rw: Dict[str, Any]) -> None:
            if ex:
                upd = {k: v for k, v in rw.items() if k not in ("contrato_id", "formato_codigo")}
                _sb.table("ccd_formato_firma").update(upd).eq("id", ex[0]["id"]).execute()
            else:
                _sb.table("ccd_formato_firma").insert(rw).execute()

        def _missing_schema_err(exc: BaseException) -> bool:
            et = _err_txt(exc)
            return any(
                x in et
                for x in (
                    "pgrst204",
                    "schema cache",
                    "could not find",
                    "column",
                    "42703",
                    "does not exist",
                )
            )

        _RM_APROBO = ("aprobo_nombre", "aprobo_cargo", "aprobo_usuario_id")
        _RM_UIDS = ("elaboro_usuario_id", "reviso_usuario_id", "aprobo_usuario_id")
        _RM_ESTILO = ("estilo_pdf",)

        try:
            _do_write(row_write)
        except Exception as e2:
            if not _missing_schema_err(e2):
                raise
            last_strip_exc: Optional[BaseException] = e2
            wrote = False
            for rm in (
                _RM_APROBO,
                _RM_UIDS,
                tuple(set(_RM_APROBO) | set(_RM_UIDS)),
                tuple(set(_RM_APROBO) | set(_RM_UIDS) | set(_RM_ESTILO)),
            ):
                rm_set = set(rm)
                rw = {k: v for k, v in row_write.items() if k not in rm_set}
                try:
                    _do_write(rw)
                    wrote = True
                    if rm_set:
                        _log.info(
                            "ccd_formato_firma: columnas omitidas en tabla %s; copia completa en contratos.ccd_firma_config",
                            sorted(rm_set),
                        )
                    _upsert_ccd_firma_in_contrato_json(contrato_id, formato_codigo, body)
                    break
                except Exception as ex:
                    last_strip_exc = ex
                    if not _missing_schema_err(ex):
                        raise
                    continue
            if not wrote:
                _upsert_ccd_firma_in_contrato_json(contrato_id, formato_codigo, body)
                _log.warning(
                    "ccd_formato_firma: solo contratos.ccd_firma_config (tabla no aceptó el registro). Último error: %s",
                    last_strip_exc,
                )
    except Exception as e:
        if _is_ccd_formato_firma_table_missing(e):
            try:
                _upsert_ccd_firma_in_contrato_json(contrato_id, formato_codigo, body)
            except HTTPException:
                raise
            except Exception as e2:
                _log.exception("upsert ccd_firma_config en contratos")
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "No se pudo guardar la configuración de firmas en la base de datos. "
                        "Esto no tiene que ver con el subcontratista vacío: solo se guardan Elaboró y Revisó; "
                        "Aprobó se toma del subcontratista al generar el PDF. "
                        "En Supabase → SQL Editor, ejecuta el archivo backend/sql/ccd_formato_firma.sql "
                        "(incluye ALTER TABLE … ccd_firma_config y CREATE TABLE ccd_formato_firma). "
                        f"Detalle: {e2!s}"
                    ),
                ) from e2
            return _get_ccd_firma_config(contrato_id, formato_codigo)
        try:
            _upsert_ccd_firma_in_contrato_json(contrato_id, formato_codigo, body)
            _log.warning(
                "ccd_formato_firma: guardado degradado en contratos.ccd_firma_config tras error en tabla: %s",
                e,
            )
            return _get_ccd_firma_config(contrato_id, formato_codigo)
        except HTTPException:
            raise
        except Exception as e3:
            _log.exception("upsert ccd_formato_firma; JSON contratos también falló")
            raise HTTPException(
                status_code=503,
                detail="No se pudo guardar la configuración de firmas. ¿Existe la tabla ccd_formato_firma? "
                f"Ver backend/sql/ccd_formato_firma.sql (incluye columnas aprobo_*). Detalle tabla: {e!s}. JSON: {e3!s}",
            ) from e3
    return _get_ccd_firma_config(contrato_id, formato_codigo)


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
    try:
        rows = _sb.table("so_registros")\
            .select("item_numero, item_descripcion, unidad, capitulo")\
            .eq("contrato_id", contrato_id)\
            .eq("corte_id", corte_id)\
            .eq("sub_estado", "Aprobado")\
            .execute().data or []
    except Exception as e0:
        err = str(e0).lower()
        if "capitulo" in err or "column" in err or "schema cache" in err:
            _log.warning("so_registros sin columna capitulo (items-corte); reintento sin ella: %s", e0)
            rows = _sb.table("so_registros")\
                .select("item_numero, item_descripcion, unidad")\
                .eq("contrato_id", contrato_id)\
                .eq("corte_id", corte_id)\
                .eq("sub_estado", "Aprobado")\
                .execute().data or []
        else:
            raise
    seen = {}
    for r in rows:
        k = r.get("item_numero")
        if k and k not in seen:
            seen[k] = r
    out = list(seen.values())
    _sort_items_corte_por_item_numero_asc(out)
    return out


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
    _sort_items_corte_por_item_numero_asc(items)
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
    contrato_id: int,
    corte_id: int,
    item_numero: str,
    current_user: dict,
    *,
    item_exacto: bool = False,
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

    q = (
        _sb.table("so_registros")
        .select(
            "numero_registro, abs_inicio, abs_final, pk_id_id, pk_ids(pk_id), calzada, longitud, ancho, espesor, cantidad, cantidad_total, observacion, foto_url, foto_numero, item_numero, item_descripcion, unidad"
        )
        .eq("contrato_id", contrato_id)
        .eq("corte_id", corte_id)
        .eq("sub_estado", "Aprobado")
    )
    if item_exacto:
        q = q.eq("item_numero", (item_numero or "").strip())
    else:
        q = q.ilike("item_numero", f"%{item_numero}%")
    registros = q.order("numero_registro").execute().data or []

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


def _list_item_numeros_memoria_corte(contrato_id: int, corte_id: int) -> List[str]:
    """Ítems distintos con al menos un registro aprobado en el corte.

    Orden: capítulo (número inicial) ascendente, luego código de ítem (orden natural), alineado a CC-SUB-001.
    """
    try:
        rows = (
            _sb.table("so_registros")
            .select("item_numero, capitulo")
            .eq("contrato_id", contrato_id)
            .eq("corte_id", corte_id)
            .eq("sub_estado", "Aprobado")
            .order("numero_registro")
            .execute()
            .data
            or []
        )
    except Exception as e0:
        err = str(e0).lower()
        if "capitulo" in err or "column" in err or "schema cache" in err:
            _log.warning("so_registros sin columna capitulo (memoria ítems); reintento sin ella: %s", e0)
            rows = (
                _sb.table("so_registros")
                .select("item_numero")
                .eq("contrato_id", contrato_id)
                .eq("corte_id", corte_id)
                .eq("sub_estado", "Aprobado")
                .order("numero_registro")
                .execute()
                .data
                or []
            )
        else:
            raise
    seen: set[str] = set()
    out: List[str] = []
    caps: Dict[str, str] = {}
    for r in rows:
        k = (r.get("item_numero") or "").strip()
        if k and k not in seen:
            seen.add(k)
            out.append(k)
        if k:
            cap = str(r.get("capitulo") or "").strip()
            if k not in caps:
                caps[k] = cap
            elif cap and not caps[k]:
                caps[k] = cap
    return _sort_identificadores_item_asc(out, caps if caps else None)


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


@router.get("/formatos-ccd")
def listar_formatos_ccd(current_user=Depends(_get_user)):
    """Biblioteca de formatos ClaraCore Documentación (CCD); convive con asignación futura por contrato."""
    return [{"codigo": k, **v} for k, v in FORMATOS_CCD.items()]


@router.get("/{contrato_id}/ccd/biblioteca")
def ccd_biblioteca_contrato(contrato_id: int, current_user=Depends(_get_user)):
    """Formatos CCD con slots de firma y configuración guardada (Elaboró/Revisó) para este contrato."""
    out: List[Dict[str, Any]] = []
    for codigo, meta in FORMATOS_CCD.items():
        cfg = _get_ccd_firma_config(contrato_id, codigo)
        out.append({"codigo": codigo, **meta, "config_firma": cfg})
    return out


@router.get("/{contrato_id}/ccd/firmantes-candidatos")
def ccd_firmantes_candidatos(contrato_id: int, current_user=Depends(_get_user)):
    """Usuarios del contrato con cargo — para asignar Elaboró y Revisó en la biblioteca CCD."""
    return _list_firmantes_candidatos_contrato(contrato_id)


@router.get("/{contrato_id}/ccd/config-firma/{formato_codigo}")
def ccd_get_config_firma(contrato_id: int, formato_codigo: str, current_user=Depends(_get_user)):
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    return _get_ccd_firma_config(contrato_id, formato_codigo)


@router.put("/{contrato_id}/ccd/config-firma/{formato_codigo}")
def ccd_put_config_firma(
    contrato_id: int,
    formato_codigo: str,
    body: CcdFirmaConfigBody,
    current_user=Depends(_get_user),
):
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    return _upsert_ccd_firma_config(contrato_id, formato_codigo, body)


def _corte_pertenece_contrato(contrato_id: int, corte_id: int) -> bool:
    c = _row("subcontratista_cortes", "id, subcontratista_id", id=corte_id)
    if not c:
        return False
    sid = c.get("subcontratista_id")
    if sid is None:
        return False
    s = _row("subcontratistas", "id, contrato_id", id=sid)
    return bool(s and int(s.get("contrato_id") or 0) == int(contrato_id))


_SLOT_FIRMA_ES = {"elaboro": "Elaboró", "reviso": "Revisó", "aprobo": "Aprobó"}


def _ccd_enviar_correo_confirmacion_firma(
    current_user: dict,
    contrato_id: int,
    formato_codigo: str,
    slot: str,
    *,
    corte_id: Optional[int] = None,
    contexto_ref: Optional[str] = None,
) -> None:
    """Correo al usuario que firmó (misma cuenta). SMTP opcional vía mail_smtp; fallos no bloquean."""
    email = (current_user.get("email") or "").strip()
    if not email:
        return
    slot_es = _SLOT_FIRMA_ES.get(slot, slot)
    num_contrato = ""
    try:
        cr = _row("contratos", "numero", id=contrato_id)
        num_contrato = str((cr or {}).get("numero") or "").strip() or f"id {contrato_id}"
    except Exception:
        num_contrato = f"id {contrato_id}"
    ref_doc = ""
    if contexto_ref:
        ref_doc = str(contexto_ref).strip()
    elif corte_id is not None:
        try:
            cor = _row("subcontratista_cortes", "consecutivo", id=corte_id)
            ref_doc = f"Corte N°: {str((cor or {}).get('consecutivo') or '').strip() or '—'}"
        except Exception:
            ref_doc = "Corte N°: —"
    ahora = datetime.now(ZoneInfo("America/Bogota")).strftime("%d/%m/%Y %H:%M %Z")
    ref_line = (f"{ref_doc}\n" if ref_doc else "")
    body = (
        f"ClaraCore — Confirmación de firma registrada\n\n"
        f"Se registró tu firma digital en el documento CCD asociado a tu cuenta.\n\n"
        f"Rol en el PDF: {slot_es}\n"
        f"Formato: {formato_codigo}\n"
        f"Contrato: {num_contrato}\n"
        f"{ref_line}"
        f"Fecha y hora (registro): {ahora}\n\n"
        f"Si no fuiste tú quien firmó, cambia tu contraseña y avisa al administrador del contrato.\n"
    )
    subj = f"ClaraCore: firma registrada ({slot_es} · {formato_codigo})"
    r = try_send_text_email(email, subj, body)
    if r is None:
        _log.debug("CCD firma: correo no enviado (SMTP no configurado)")
    elif r is False:
        _log.warning("CCD firma: no se pudo enviar correo de confirmación a %s", email)


@router.post("/{contrato_id}/ccd/corte/{corte_id}/registrar-firma/{formato_codigo}")
def ccd_registrar_firma_corte(
    contrato_id: int,
    corte_id: int,
    formato_codigo: str,
    current_user: dict = Depends(_get_user),
):
    """Guarda la URL de firma del perfil para Elaboró o Revisó según asignación en biblioteca CCD."""
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    uid = _uid_session(current_user)
    if not uid:
        raise HTTPException(status_code=401, detail="Sesión requerida")
    if not _corte_pertenece_contrato(contrato_id, corte_id):
        raise HTTPException(status_code=404, detail="Corte no encontrado en este contrato")
    fc = _get_ccd_firma_config(contrato_id, formato_codigo)
    slot = _slot_firma_usuario_en_config(fc, uid, current_user)
    if not slot:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tu usuario no coincide con Elaboró ni Revisó en la biblioteca CCD para este formato. "
                "Elige al usuario en los desplegables (no solo el texto) y guarda, o revisa que el nombre "
                "coincida con tu perfil."
            ),
        )
    if formato_codigo in (CODIGO_FORMATO_CCD_CC_SUB_001, CODIGO_FORMATO_CCD_CC_SUB_002) and slot == "aprobo":
        raise HTTPException(
            status_code=400,
            detail="En CC-SUB el Aprobó corresponde al subcontratista en el PDF; aquí solo se registra firma para Elaboró o Revisó.",
        )
    url = _firma_imagen_url_usuario(uid)
    if not url:
        raise HTTPException(status_code=400, detail="Configura la imagen de firma en tu perfil antes de registrar.")
    row_ins = {
        "contrato_id": contrato_id,
        "corte_id": corte_id,
        "formato_codigo": formato_codigo,
        "slot": slot,
        "usuario_id": uid,
        "firma_imagen_url": url,
    }
    try:
        _sb.table("ccd_corte_firma_registro").upsert(row_ins, on_conflict="corte_id,formato_codigo,slot").execute()
    except Exception as e:
        _log.exception("ccd_corte_firma_registro upsert")
        raise HTTPException(
            status_code=503,
            detail=(
                "No se pudo registrar la firma. Si la tabla no existe, ejecuta en Supabase el archivo "
                "backend/sql/ccd_corte_firma_registro.sql. "
                f"Detalle: {e!s}"
            ),
        ) from e
    _ccd_enviar_correo_confirmacion_firma(
        current_user, contrato_id, formato_codigo, slot, corte_id=corte_id
    )
    return {"ok": True, "slot": slot, "corte_id": corte_id, "formato_codigo": formato_codigo}


@router.get("/{contrato_id}/ccd/corte/{corte_id}/firmas-registradas/{formato_codigo}")
def ccd_firmas_registradas_corte(
    contrato_id: int,
    corte_id: int,
    formato_codigo: str,
    current_user: dict = Depends(_get_user),
):
    """Quién ya registró firma en este corte (Elaboró / Revisó)."""
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    if not _corte_pertenece_contrato(contrato_id, corte_id):
        raise HTTPException(status_code=404, detail="Corte no encontrado en este contrato")
    try:
        rows = (
            _sb.table("ccd_corte_firma_registro")
            .select("slot, usuario_id, firma_imagen_url, created_at")
            .eq("corte_id", corte_id)
            .eq("formato_codigo", formato_codigo)
            .execute()
            .data
            or []
        )
    except Exception as e:
        _log.debug("firmas registradas: %s", e)
        return {"elaboro": None, "reviso": None, "tabla_disponible": False}
    out_e = None
    out_r = None
    for r in rows:
        sl = (r.get("slot") or "").strip()
        item = {
            "usuario_id": r.get("usuario_id"),
            "created_at": r.get("created_at"),
            "registrada": True,
        }
        if sl == "elaboro":
            out_e = item
        elif sl == "reviso":
            out_r = item
    return {"elaboro": out_e, "reviso": out_r, "tabla_disponible": True}


def _semana_pertenece_contrato(contrato_id: int, semana_id: int) -> bool:
    r = _row("so_semanas", "id, contrato_id", id=semana_id)
    return bool(r and int(r.get("contrato_id") or 0) == int(contrato_id))


def _acta_pertenece_contrato(contrato_id: int, acta_id: int) -> bool:
    r = _row("actas", "id, contrato_id", id=acta_id)
    return bool(r and int(r.get("contrato_id") or 0) == int(contrato_id))


def _distinct_semana_ids_nivel3_rpc(contrato_id: int) -> Optional[set[int]]:
    """Una sola llamada Postgres (distinct). Requiere backend/sql/ccd_distinct_semanas_nivel3_rpc.sql."""
    try:
        res = _sb.rpc(
            "ccd_distinct_semanas_nivel3_aprobado",
            {"p_contrato_id": int(contrato_id)},
        ).execute()
        raw = getattr(res, "data", None)
        if raw is None:
            return set()
        out: set[int] = set()
        if isinstance(raw, list):
            for x in raw:
                if x is None:
                    continue
                try:
                    out.add(int(x))
                except (TypeError, ValueError):
                    continue
            return out
    except Exception as e:
        _log.info("ccd_distinct_semanas_nivel3_aprobado RPC: %s", e)
    return None


def _distinct_semana_ids_nivel3_fallback_paginado(contrato_id: int, *, max_pages: int = 20) -> set[int]:
    """Reserva si no existe la RPC: pagina so_registros (lento; acotado en páginas)."""
    out: set[int] = set()
    chunk = 1000
    start = 0
    pages = 0
    while pages < max_pages:
        try:
            page = (
                _sb.table("so_registros")
                .select("semana_id")
                .eq("contrato_id", contrato_id)
                .eq("nivel3_estado", "Aprobado")
                .range(start, start + chunk - 1)
                .execute()
                .data
                or []
            )
        except Exception as e:
            _log.warning("ccd semanas: paginación registros nivel3: %s", e)
            break
        if not page:
            break
        for r in page:
            sid = r.get("semana_id")
            if sid is None:
                continue
            try:
                out.add(int(sid))
            except (TypeError, ValueError):
                continue
        pages += 1
        if len(page) < chunk:
            break
        start += chunk
    if pages >= max_pages:
        _log.warning(
            "ccd semanas: límite de paginación (%s páginas); despliega la RPC ccd_distinct_semanas_nivel3_aprobado en Supabase.",
            max_pages,
        )
    return out


def _distinct_semana_ids_nivel3_aprobado_interventoria(contrato_id: int) -> set[int]:
    """IDs de so_semanas con al menos un registro nivel 3 «Aprobado» (interventoría)."""
    s = _distinct_semana_ids_nivel3_rpc(contrato_id)
    if s is not None:
        return s
    return _distinct_semana_ids_nivel3_fallback_paginado(contrato_id)


def _fetch_semanas_rows_por_ids(contrato_id: int, sem_ids: List[int]) -> List[Dict[str, Any]]:
    """PostgREST limita el tamaño del filtro `in`; partimos en lotes."""
    if not sem_ids:
        return []
    batch_size = 120
    rows: List[Dict[str, Any]] = []
    for i in range(0, len(sem_ids), batch_size):
        part = sem_ids[i : i + batch_size]
        try:
            chunk = (
                _sb.table("so_semanas")
                .select("id, numero_semana, fecha_inicio, fecha_fin, estado")
                .eq("contrato_id", contrato_id)
                .in_("id", part)
                .execute()
                .data
                or []
            )
            rows.extend(chunk)
        except Exception as e:
            _log.warning("ccd semanas: fetch so_semanas batch: %s", e)
    return rows


@router.get("/{contrato_id}/ccd/semanas")
def ccd_listar_semanas(contrato_id: int, current_user=Depends(_get_user)):
    sem_ids = _distinct_semana_ids_nivel3_aprobado_interventoria(contrato_id)
    if not sem_ids:
        return []
    rows = _fetch_semanas_rows_por_ids(contrato_id, list(sem_ids))
    # Más reciente primero: fecha_fin descendente, luego número de semana descendente
    def _sort_key(r: Dict[str, Any]) -> tuple:
        ff = str(r.get("fecha_fin") or "")
        fi = str(r.get("fecha_inicio") or "")
        try:
            nsem = int(r.get("numero_semana") or 0)
        except (TypeError, ValueError):
            nsem = 0
        return (ff, fi, nsem)

    rows.sort(key=_sort_key, reverse=True)
    return rows


@router.get("/{contrato_id}/ccd/actas-rpo")
def ccd_listar_actas_rpo(contrato_id: int, current_user=Depends(_get_user)):
    """Actas de cobro RPO (excluye administrativas u otros grupos)."""
    rows = (
        _sb.table("actas")
        .select("id, numero_rpo, consecutivo")
        .eq("contrato_id", contrato_id)
        .eq("tipo_grupo", "RPO")
        .order("consecutivo", desc=True)
        .execute()
        .data
        or []
    )
    return rows


@router.get("/{contrato_id}/ccd/conciliacion/semana/{semana_id}/items")
def ccd_items_conciliacion_semana(contrato_id: int, semana_id: int, current_user=Depends(_get_user)):
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    caps = _capitulos_por_item_numero_desde_items(items)
    nums = _sort_identificadores_item_asc(
        list({(it.get("item_numero") or "").strip() for it in items if (it.get("item_numero") or "").strip()}),
        caps,
    )
    return {"items": items, "total_costo": total, "item_numeros": nums, "registros_raw": len(reg)}


@router.get("/{contrato_id}/ccd/conciliacion/acta/{acta_id}/items")
def ccd_items_conciliacion_acta(contrato_id: int, acta_id: int, current_user=Depends(_get_user)):
    if not _acta_pertenece_contrato(contrato_id, acta_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, acta_rpo_id=acta_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    caps = _capitulos_por_item_numero_desde_items(items)
    nums = _sort_identificadores_item_asc(
        list({(it.get("item_numero") or "").strip() for it in items if (it.get("item_numero") or "").strip()}),
        caps,
    )
    return {"items": items, "total_costo": total, "item_numeros": nums, "registros_raw": len(reg)}


@router.post("/{contrato_id}/ccd/contexto/{contexto_tipo}/{contexto_id}/registrar-firma/{formato_codigo}")
def ccd_registrar_firma_contexto(
    contrato_id: int,
    contexto_tipo: str,
    contexto_id: int,
    formato_codigo: str,
    current_user: dict = Depends(_get_user),
):
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    if contexto_tipo not in ("semana", "acta_rpo"):
        raise HTTPException(400, "contexto_tipo debe ser semana o acta_rpo")
    uid = _uid_session(current_user)
    if not uid:
        raise HTTPException(status_code=401, detail="Sesión requerida")
    if contexto_tipo == "semana" and not _semana_pertenece_contrato(contrato_id, contexto_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    if contexto_tipo == "acta_rpo" and not _acta_pertenece_contrato(contrato_id, contexto_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    fc = _get_ccd_firma_config(contrato_id, formato_codigo)
    slot = _slot_firma_usuario_en_config(fc, uid, current_user)
    if not slot:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tu usuario no coincide con Elaboró, Revisó ni Aprobó configurados en la biblioteca CCD para este formato. "
                "Vuelve a guardar la biblioteca (asigna tu usuario en el desplegable o revisa nombres). "
                "Si al guardar falla el servidor, ejecuta en Supabase los ALTER de aprobo_* en backend/sql/ccd_formato_firma.sql."
            ),
        )
    url = _firma_imagen_url_usuario(uid)
    if not url:
        raise HTTPException(status_code=400, detail="Configura la imagen de firma en tu perfil antes de registrar.")
    row_ins = {
        "contrato_id": contrato_id,
        "formato_codigo": formato_codigo,
        "contexto_tipo": contexto_tipo,
        "contexto_id": contexto_id,
        "slot": slot,
        "usuario_id": uid,
        "firma_imagen_url": url,
    }
    try:
        _sb.table("ccd_firma_registro").upsert(
            row_ins,
            on_conflict="contrato_id,formato_codigo,contexto_tipo,contexto_id,slot",
        ).execute()
    except Exception as e:
        _log.exception("ccd_firma_registro upsert")
        raise HTTPException(
            status_code=503,
            detail=(
                "No se pudo registrar la firma. Ejecuta en Supabase backend/sql/ccd_firma_registro_contexto.sql. "
                f"Detalle: {e!s}"
            ),
        ) from e
    ref = ""
    if contexto_tipo == "semana":
        sm = _row("so_semanas", "numero_semana", id=contexto_id)
        ref = f"Semana N°: {str((sm or {}).get('numero_semana') or contexto_id)}"
    elif contexto_tipo == "acta_rpo":
        ac = _row("actas", "numero_rpo, consecutivo", id=contexto_id)
        ref = f"Acta RPO: {str((ac or {}).get('numero_rpo') or (ac or {}).get('consecutivo') or contexto_id)}"
    _ccd_enviar_correo_confirmacion_firma(
        current_user, contrato_id, formato_codigo, slot, contexto_ref=ref
    )
    return {"ok": True, "slot": slot, "contexto_tipo": contexto_tipo, "contexto_id": contexto_id, "formato_codigo": formato_codigo}


@router.get("/{contrato_id}/ccd/contexto/{contexto_tipo}/{contexto_id}/firmas-registradas/{formato_codigo}")
def ccd_firmas_registradas_contexto(
    contrato_id: int,
    contexto_tipo: str,
    contexto_id: int,
    formato_codigo: str,
    current_user: dict = Depends(_get_user),
):
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    if contexto_tipo not in ("semana", "acta_rpo"):
        raise HTTPException(400, "contexto_tipo debe ser semana o acta_rpo")
    if contexto_tipo == "semana" and not _semana_pertenece_contrato(contrato_id, contexto_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    if contexto_tipo == "acta_rpo" and not _acta_pertenece_contrato(contrato_id, contexto_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    try:
        rows = (
            _sb.table("ccd_firma_registro")
            .select("slot, usuario_id, firma_imagen_url, created_at")
            .eq("contrato_id", contrato_id)
            .eq("contexto_tipo", contexto_tipo)
            .eq("contexto_id", contexto_id)
            .eq("formato_codigo", formato_codigo)
            .execute()
            .data
            or []
        )
    except Exception as e:
        _log.debug("firmas contexto: %s", e)
        return {"elaboro": None, "reviso": None, "aprobo": None, "tabla_disponible": False}
    out: Dict[str, Any] = {"elaboro": None, "reviso": None, "aprobo": None, "tabla_disponible": True}
    for r in rows:
        sl = (r.get("slot") or "").strip()
        item = {"usuario_id": r.get("usuario_id"), "created_at": r.get("created_at"), "registrada": True}
        if sl in out:
            out[sl] = item
    return out


def _pdf_bytes_conciliacion_informe_v1(
    contrato_id: int,
    current_user: dict,
    *,
    formato_codigo: str,
    contexto_tipo: str,
    contexto_id: int,
    titulo_documento: str,
    c3_label: str,
    c3_value: str,
    c4_label: str,
    c4_value: str,
    pie_contexto: str,
    items: List[dict],
    total_costo: float,
) -> bytes:
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    u = current_user if isinstance(current_user, dict) else dict(current_user)
    usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
    usuario_cargo = u.get("cargo_nombre", "—") or "—"
    firma_cfg = _get_ccd_firma_config(contrato_id, formato_codigo)
    fc = firma_cfg or {}
    e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
    r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
    a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
    enom = str(fc.get("elaboro_nombre") or "").strip()
    rnom = str(fc.get("reviso_nombre") or "").strip()
    anom = str(fc.get("aprobo_nombre") or "").strip()
    elaboro_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, contexto_tipo, contexto_id, formato_codigo, "elaboro", e_uid, enom, current_user
    )
    reviso_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, contexto_tipo, contexto_id, formato_codigo, "reviso", r_uid, rnom, current_user
    )
    aprobo_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, contexto_tipo, contexto_id, formato_codigo, "aprobo", a_uid, anom, current_user
    )
    html = _html_cc_conciliacion_informe_v1(
        contrato,
        items,
        total_costo,
        usuario_nombre,
        usuario_cargo,
        codigo_ccd=formato_codigo,
        titulo_documento=titulo_documento,
        c3_label=c3_label,
        c3_value=c3_value,
        c4_label=c4_label,
        c4_value=c4_value,
        pie_contexto=pie_contexto,
        firma_cfg=firma_cfg,
        elaboro_firma_data_uri=elaboro_uri,
        reviso_firma_data_uri=reviso_uri,
        aprobo_firma_data_uri=aprobo_uri,
        estilo_formato_codigo=formato_codigo,
    )
    return _to_pdf(html)


def _generar_pdf_bytes_corte_sub_desde_ctx(
    ctx: Dict[str, Any],
    contrato_id: int,
    corte_id: int,
    current_user: Optional[dict] = None,
) -> bytes:
    """Mismo PDF que la vista previa CC-SUB-001. Firmas en Elaboró/Revisó según usuarios configurados y registros por corte."""
    contrato = ctx["contrato"]
    sub = ctx["sub"]
    corte = ctx["corte"]
    items = ctx["items"]
    total_costo = ctx["total_costo"]
    usuario_nombre = ctx["usuario_nombre"]
    usuario_cargo = ctx["usuario_cargo"]
    firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SUB_001)
    fmt001 = CODIGO_FORMATO_CCD_CC_SUB_001
    e_uid = _opt_usuario_id(firma_cfg.get("elaboro_usuario_id"))
    r_uid = _opt_usuario_id(firma_cfg.get("reviso_usuario_id"))
    enom = str(firma_cfg.get("elaboro_nombre") or "").strip()
    rnom = str(firma_cfg.get("reviso_nombre") or "").strip()
    elaboro_firma_uri = _firma_data_uri_para_slot_corte(
        contrato_id, corte_id, fmt001, "elaboro", e_uid, enom, current_user
    )
    reviso_firma_uri = _firma_data_uri_para_slot_corte(
        contrato_id, corte_id, fmt001, "reviso", r_uid, rnom, current_user
    )

    errs: list[str] = []
    pdf_bytes: bytes | None = None
    for name, fn in (
        (
            "v1_plana",
            lambda: _html_cc_sub_v1_plain(
                contrato,
                sub,
                corte,
                items,
                total_costo,
                usuario_nombre,
                usuario_cargo,
                firma_cfg=firma_cfg,
                elaboro_firma_data_uri=elaboro_firma_uri,
                reviso_firma_data_uri=reviso_firma_uri,
            ),
        ),
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
            html_last = _html_cc_sub_v1_plain(
                contrato,
                sub,
                corte,
                items,
                total_costo,
                usuario_nombre,
                usuario_cargo,
                firma_cfg=firma_cfg,
                elaboro_firma_data_uri=elaboro_firma_uri,
                reviso_firma_data_uri=reviso_firma_uri,
            )
            pdf_bytes = _to_pdf_corte_garantizado(html_last)
        except Exception as e:
            _log.exception("pdf_corte_sub: sin PDF tras cadena de respaldo")
            raise HTTPException(
                status_code=500,
                detail="PDF corte: " + " | ".join(errs)[:900] + f" | garantizado: {e!s}"[:1200],
            ) from e
    return pdf_bytes


def _merge_pdf_bytes(parte_principal: bytes, parte_anexa: bytes) -> bytes:
    from pypdf import PdfReader, PdfWriter
    w = PdfWriter()
    for page in PdfReader(io.BytesIO(parte_principal)).pages:
        w.add_page(page)
    for page in PdfReader(io.BytesIO(parte_anexa)).pages:
        w.add_page(page)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def _attachment_pdf_con_pagina_sello_usuario(
    pdf_main: bytes,
    current_user: dict,
    *,
    titulo_doc: str,
    formato_ccd: str,
    contrato_numero: str,
    nombre_archivo_pdf: str,
) -> Response:
    """
    Anexa la página de sello ClaraCore (firma de perfil, fecha, SHA-256 del PDF previo).
    Misma lógica que corte CC-SUB-001 /con-sello-firma.
    """
    uid = int(current_user.get("sub") or 0)
    if not uid:
        raise HTTPException(status_code=401, detail="Debes iniciar sesión para descargar el PDF firmado.")

    digest = hashlib.sha256(pdf_main).hexdigest()
    ufir = _usuario_datos_firma_sello(uid)
    if not ufir.get("firma_imagen_url"):
        raise HTTPException(
            status_code=400,
            detail="Configura tu imagen de firma en Perfil antes de descargar el PDF con sello.",
        )
    try:
        img_uri = _fetch_img_data_uri(ufir["firma_imagen_url"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo cargar la imagen de firma: {e!s}") from e

    tz = ZoneInfo("America/Bogota")
    ahora = datetime.now(tz)
    cuando = ahora.strftime("%Y-%m-%d %H:%M:%S %Z")

    html_sello = _html_pagina_sello_firma_claracore(
        titulo_doc=str(titulo_doc or "")[:280],
        digest_sha256_hex=digest,
        cuando_bogota=cuando,
        contrato_numero=str(contrato_numero or ""),
        formato_ccd=formato_ccd,
        nombre_firmante=ufir["nombre_completo"],
        cargo_firmante=ufir["cargo"],
        img_data_uri=img_uri,
    )
    pdf_sello = _to_pdf(html_sello)
    out = _merge_pdf_bytes(pdf_main, pdf_sello)
    base = nombre_archivo_pdf.strip() or "documento.pdf"
    fname = (base[:-4] + "_firmado.pdf") if base.lower().endswith(".pdf") else (base + "_firmado.pdf")
    return Response(
        content=out,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


def _usuario_datos_firma_sello(uid: int) -> Dict[str, Any]:
    rows = _sb.table("usuarios").select("nombre, apellidos, firma_imagen_url, cargo_id").eq("id", uid).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    row = rows[0]
    cargo_nom = "—"
    cid = row.get("cargo_id")
    if cid:
        cr = _sb.table("cargos").select("nombre").eq("id", cid).limit(1).execute().data or []
        if cr:
            cargo_nom = str(cr[0].get("nombre") or "—").strip() or "—"
    nombre = f"{row.get('nombre') or ''} {row.get('apellidos') or ''}".strip() or "—"
    return {
        "nombre_completo": nombre,
        "cargo": cargo_nom,
        "firma_imagen_url": (row.get("firma_imagen_url") or "").strip(),
    }


def _fetch_img_data_uri(url: str) -> str:
    import requests
    r = requests.get(url.strip(), timeout=25)
    r.raise_for_status()
    ct = (r.headers.get("content-type") or "image/png").split(";")[0].strip()
    if not ct.startswith("image/"):
        ct = "image/png"
    b64 = base64.b64encode(r.content).decode("ascii")
    return f"data:{ct};base64,{b64}"


def _firma_imagen_url_usuario(uid: int) -> Optional[str]:
    rows = _sb.table("usuarios").select("firma_imagen_url").eq("id", uid).limit(1).execute().data or []
    if not rows:
        return None
    u = (rows[0].get("firma_imagen_url") or "").strip()
    return u or None


def _uid_session(current_user: Optional[dict]) -> Optional[int]:
    if not current_user or not current_user.get("sub"):
        return None
    try:
        return int(current_user["sub"])
    except (TypeError, ValueError):
        return None


def _usuario_firma_img_data_uri_opcional(current_user: Optional[dict]) -> Optional[str]:
    """Data URI de la imagen de firma del usuario en sesión (perfil)."""
    uid = _uid_session(current_user)
    if not uid:
        return None
    url = _firma_imagen_url_usuario(uid)
    if not url:
        return None
    try:
        return _fetch_img_data_uri(url)
    except Exception as e:
        _log.warning("Firma de perfil omitida: %s", e)
        return None


def _ccd_firma_registro_get(corte_id: int, formato_codigo: str, slot: str) -> Optional[Dict[str, Any]]:
    try:
        rows = (
            _sb.table("ccd_corte_firma_registro")
            .select("firma_imagen_url, usuario_id, created_at")
            .eq("corte_id", corte_id)
            .eq("formato_codigo", formato_codigo)
            .eq("slot", slot)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception as e:
        _log.debug("ccd_corte_firma_registro: %s", e)
        return None


def _ccd_firma_registro_contexto_get(
    contrato_id: int,
    contexto_tipo: str,
    contexto_id: int,
    formato_codigo: str,
    slot: str,
) -> Optional[Dict[str, Any]]:
    try:
        rows = (
            _sb.table("ccd_firma_registro")
            .select("firma_imagen_url, usuario_id, created_at")
            .eq("contrato_id", contrato_id)
            .eq("contexto_tipo", contexto_tipo)
            .eq("contexto_id", contexto_id)
            .eq("formato_codigo", formato_codigo)
            .eq("slot", slot)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
    except Exception as e:
        _log.debug("ccd_firma_registro: %s", e)
        return None


def _firma_data_uri_para_slot_contexto(
    contrato_id: int,
    contexto_tipo: str,
    contexto_id: int,
    formato_codigo: str,
    slot: str,
    config_usuario_id: Optional[int],
    nombre_configurado: str,
    current_user: Optional[dict],
) -> Optional[str]:
    """Firma registrada en ccd_firma_registro o imagen de perfil si el usuario coincide con el slot."""
    reg = _ccd_firma_registro_contexto_get(contrato_id, contexto_tipo, contexto_id, formato_codigo, slot)
    if reg and reg.get("firma_imagen_url"):
        try:
            return _fetch_img_data_uri(reg["firma_imagen_url"])
        except Exception as e:
            _log.warning("Firma registrada contexto slot %s: %s", slot, e)
    cu = _opt_usuario_id(config_usuario_id)
    sess = _uid_session(current_user)
    if cu and sess and int(cu) == int(sess):
        return _usuario_firma_img_data_uri_opcional(current_user)
    if (not cu) and _nombre_coincide_firma_cfg(nombre_configurado, current_user):
        return _usuario_firma_img_data_uri_opcional(current_user)
    return None


def _normalizar_nombre_firma_txt(s: str) -> str:
    """Quita signos, colapsa espacios — útil cuando el config tiene «Jaime!» o el usuario «Jaimes»."""
    t = (s or "").lower().strip()
    t = re.sub(r"[!?.¡¿,;:]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _nombre_apellidos_usuario_sesion(current_user: Optional[dict]) -> str:
    """El JWT suele traer solo `sub`; completa nombre desde tabla usuarios si hace falta."""
    if not current_user:
        return ""
    n = f"{current_user.get('nombre', '')} {current_user.get('apellidos', '')}".strip()
    if n:
        return n
    uid = _uid_session(current_user)
    if not uid:
        return ""
    try:
        rows = _sb.table("usuarios").select("nombre, apellidos").eq("id", uid).limit(1).execute().data or []
        if rows:
            return f"{rows[0].get('nombre') or ''} {rows[0].get('apellidos') or ''}".strip()
    except Exception as e:
        _log.debug("nombre usuario sesión: %s", e)
    return ""


def _nombre_coincide_firma_cfg(nombre_en_config: str, current_user: Optional[dict]) -> bool:
    """Compatibilidad sin usuario_id: compara nombre del config con nombre/apellidos del usuario."""
    if not current_user:
        return False
    nc = _normalizar_nombre_firma_txt(nombre_en_config)
    if not nc or nc in ("—", "ej. elaboró", "ej. revisó"):
        return False
    nom = _normalizar_nombre_firma_txt(_nombre_apellidos_usuario_sesion(current_user))
    if not nom:
        return False
    if nom == nc or nom in nc or nc in nom:
        return True
    # Tipos «Jaime» vs «Jaimes», espacios o puntuación
    if difflib.SequenceMatcher(None, nom, nc).ratio() >= 0.82:
        return True
    return False


def _slot_firma_usuario_en_config(fc: Dict[str, Any], uid: int, current_user: dict) -> Optional[str]:
    """Elaboró / Revisó / Aprobó según ids guardados o, si faltan, por nombre (prioridad elaboro → reviso → aprobo)."""
    eid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
    rid = _opt_usuario_id(fc.get("reviso_usuario_id"))
    aid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
    if eid and int(eid) == int(uid):
        return "elaboro"
    if rid and int(rid) == int(uid):
        return "reviso"
    if aid and int(aid) == int(uid):
        return "aprobo"
    en = str(fc.get("elaboro_nombre") or "")
    rn = str(fc.get("reviso_nombre") or "")
    an = str(fc.get("aprobo_nombre") or "")
    m_el = _nombre_coincide_firma_cfg(en, current_user)
    m_rev = _nombre_coincide_firma_cfg(rn, current_user)
    m_ap = _nombre_coincide_firma_cfg(an, current_user)
    if m_el and m_rev and m_ap:
        return "elaboro"
    if m_el and m_rev:
        return "elaboro"
    if m_el and m_ap:
        return "elaboro"
    if m_rev and m_ap:
        return "reviso"
    if m_el:
        return "elaboro"
    if m_rev:
        return "reviso"
    if m_ap:
        return "aprobo"
    return None


def _firma_data_uri_para_slot_corte(
    contrato_id: int,
    corte_id: int,
    formato_codigo: str,
    slot: str,
    config_usuario_id: Optional[int],
    nombre_configurado: str,
    current_user: Optional[dict],
) -> Optional[str]:
    """
    Imagen para Elaboró o Revisó: primero firma registrada en BD; si no hay,
    el usuario asignado a ese slot ve su imagen de perfil al generar/descargar.
    Si no hay usuario_id en config (datos viejos), se intenta coincidencia por nombre.
    """
    _ = contrato_id  # reservado p. ej. validaciones futuras
    reg = _ccd_firma_registro_get(corte_id, formato_codigo, slot)
    if reg and reg.get("firma_imagen_url"):
        try:
            return _fetch_img_data_uri(reg["firma_imagen_url"])
        except Exception as e:
            _log.warning("Firma registrada slot %s: %s", slot, e)
    cu = _opt_usuario_id(config_usuario_id)
    sess = _uid_session(current_user)
    if cu and sess and int(cu) == int(sess):
        return _usuario_firma_img_data_uri_opcional(current_user)
    if (not cu) and _nombre_coincide_firma_cfg(nombre_configurado, current_user):
        return _usuario_firma_img_data_uri_opcional(current_user)
    return None


def _html_pagina_sello_firma_claracore(
    *,
    titulo_doc: str,
    digest_sha256_hex: str,
    cuando_bogota: str,
    contrato_numero: str,
    formato_ccd: str,
    nombre_firmante: str,
    cargo_firmante: str,
    img_data_uri: str,
) -> str:
    esc = lambda s: html.escape(str(s if s is not None else ""), quote=True)
    td0 = str(titulo_doc or "")
    doc_corto = td0[:120] + ("…" if len(td0) > 120 else "")
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    @page {{ size: A4; margin: 14mm 16mm; }}
    body {{ font-family: DejaVu Sans, Arial, Helvetica, sans-serif; font-size: 6.5pt; color: #0f172a; margin: 0; padding: 0; }}
    .box {{ border: 1px solid #0e7490; border-radius: 3px; padding: 5px 7px; background: #f0fdfa; page-break-inside: avoid; }}
    .t1 {{ font-size: 7pt; font-weight: bold; color: #0f766e; text-transform: uppercase; letter-spacing: 0.3px; margin: 0; padding: 0 0 3px 0; border-bottom: 1px solid #99f6e4; }}
    .muted {{ font-size: 5.5pt; color: #64748b; margin-top: 2px; line-height: 1.2; }}
    .hash {{ font-family: DejaVu Sans Mono, Consolas, monospace; font-size: 5pt; word-break: break-all; color: #334155; line-height: 1.15; margin-top: 1px; }}
    .sigwrap {{ height: 2.4cm; max-height: 2.4cm; overflow: hidden; text-align: center; line-height: 0; }}
    .sigwrap img {{ max-width: 100%; max-height: 2.2cm; width: auto; height: auto; display: block; margin: 0 auto; }}
    .sigcap {{ font-size: 5pt; color: #94a3b8; margin-top: 2px; }}
    </style></head><body>
    <div class="box">
      <div class="t1">Revisado y aprobado por</div>
      <table style="width:100%;margin-top:4px;border-collapse:collapse;">
        <tr>
          <td style="width:58%;vertical-align:top;padding-right:6px;">
            <div style="font-size:6.5pt;line-height:1.15;"><strong>{esc(cargo_firmante)}</strong></div>
            <div style="font-size:7pt;margin-top:1px;font-weight:bold;">{esc(nombre_firmante)}</div>
            <div class="muted">Doc.: {esc(doc_corto)} · {esc(formato_ccd)}</div>
            <div class="muted">Contrato: {esc(contrato_numero)}</div>
            <div class="muted">Firma (America/Bogotá): {esc(cuando_bogota)}</div>
            <div class="muted">SHA-256 (PDF previo al sello):</div>
            <div class="hash">{esc(digest_sha256_hex)}</div>
            <div class="muted" style="margin-top:3px;">
              Protocolo ClaraCore: huella de integridad del binario previo; no es firma electrónica avanzada (p. ej. Adobe Sign).
            </div>
          </td>
          <td style="width:42%;vertical-align:top;text-align:center;padding-left:4px;">
            <div class="sigwrap"><img src="{img_data_uri}" alt="Firma"/></div>
            <div class="sigcap">Imagen de firma del perfil</div>
          </td>
        </tr>
      </table>
    </div>
    </body></html>"""


@router.get("/{contrato_id}/pdf/corte-subcontratista/{corte_id}", dependencies=[])
def pdf_corte_sub(contrato_id: int, corte_id: int, current_user: dict = Depends(_get_user)):
    try:
        try:
            ctx = _contexto_corte_sub(contrato_id, corte_id, current_user)
        except HTTPException:
            raise
        except Exception as e:
            _log.exception("pdf_corte_sub: contexto")
            raise HTTPException(503, f"No se pudieron cargar los datos del informe: {e!s}") from e

        pdf_bytes = _generar_pdf_bytes_corte_sub_desde_ctx(ctx, contrato_id, corte_id, current_user)
        corte = ctx["corte"]
        sub = ctx["sub"]
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


@router.get("/{contrato_id}/pdf/corte-subcontratista/{corte_id}/con-sello-firma")
def pdf_corte_sub_con_sello_firma(
    contrato_id: int,
    corte_id: int,
    current_user: dict = Depends(_get_user),
):
    """
    PDF CC-SUB-001 + página final de sello: imagen de firma del usuario, cargo, nombre,
    fecha/hora (America/Bogotá), contrato, y SHA-256 del PDF del informe *antes* de añadir el sello.
    Requiere imagen de firma en perfil (firma_imagen_url).
    """
    try:
        ctx = _contexto_corte_sub(contrato_id, corte_id, current_user)
        pdf_main = _generar_pdf_bytes_corte_sub_desde_ctx(ctx, contrato_id, corte_id, current_user)
        contrato = ctx["contrato"]
        corte = ctx["corte"]
        sub = ctx["sub"]
        titulo = f"Informe corte subcontratista — Corte {_corte_consecutivo_fmt(corte)} — {sub.get('razon_social') or ''}"
        base = _nombre_archivo_cc_sub_001(corte, sub, corte_id)
        return _attachment_pdf_con_pagina_sello_usuario(
            pdf_main,
            current_user,
            titulo_doc=titulo,
            formato_ccd=CODIGO_FORMATO_CCD_CC_SUB_001,
            contrato_numero=str(contrato.get("numero") or ""),
            nombre_archivo_pdf=base,
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("pdf_corte_sub_con_sello_firma")
        raise HTTPException(status_code=500, detail=f"PDF firmado: {e!s}") from e


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
        firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SUB_002)
        fc = firma_cfg or {}
        fmt002 = CODIGO_FORMATO_CCD_CC_SUB_002
        e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
        r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
        enom = str(fc.get("elaboro_nombre") or "").strip()
        rnom = str(fc.get("reviso_nombre") or "").strip()
        elaboro_firma_uri = _firma_data_uri_para_slot_corte(
            contrato_id, corte_id, fmt002, "elaboro", e_uid, enom, current_user
        )
        reviso_firma_uri = _firma_data_uri_para_slot_corte(
            contrato_id, corte_id, fmt002, "reviso", r_uid, rnom, current_user
        )

        try:
            html = _html_memoria_item(
                contrato,
                sub,
                corte,
                item_info,
                registros,
                usuario_nombre,
                usuario_cargo,
                firma_cfg=firma_cfg,
                elaboro_firma_data_uri=elaboro_firma_uri,
                reviso_firma_data_uri=reviso_firma_uri,
            )
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


@router.get("/{contrato_id}/pdf/memoria-corte-completo/{corte_id}")
def pdf_memoria_corte_completo(
    contrato_id: int,
    corte_id: int,
    current_user=Depends(_get_user),
):
    """Un solo PDF CC-SUB-002: todos los ítems del corte (mismo formato que por ítem, separados con salto de página)."""
    try:
        numeros = _list_item_numeros_memoria_corte(contrato_id, corte_id)
        if not numeros:
            raise HTTPException(
                status_code=404,
                detail="No hay registros aprobados en este corte para generar memorias",
            )

        firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SUB_002)
        fc = firma_cfg or {}
        fmt002 = CODIGO_FORMATO_CCD_CC_SUB_002
        e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
        r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
        enom = str(fc.get("elaboro_nombre") or "").strip()
        rnom = str(fc.get("reviso_nombre") or "").strip()
        elaboro_firma_uri = _firma_data_uri_para_slot_corte(
            contrato_id, corte_id, fmt002, "elaboro", e_uid, enom, current_user
        )
        reviso_firma_uri = _firma_data_uri_para_slot_corte(
            contrato_id, corte_id, fmt002, "reviso", r_uid, rnom, current_user
        )
        est = _merge_estilo_pdf(fc.get("estilo_pdf"), CODIGO_FORMATO_CCD_CC_SUB_002)
        estilo_css = _memoria_pdf_estilo_css(est)

        parts: list[str] = []
        corte_out: dict = {}
        for i, item_numero in enumerate(numeros):
            ctx = _contexto_memoria_item(
                contrato_id,
                corte_id,
                item_numero,
                current_user,
                item_exacto=True,
            )
            contrato = ctx["contrato"]
            sub = ctx["sub"]
            corte = ctx["corte"]
            corte_out = corte
            item_info = ctx["item_info"]
            registros = ctx["registros"]
            usuario_nombre = ctx["usuario_nombre"]
            usuario_cargo = ctx["usuario_cargo"]
            inner = _html_memoria_item_body(
                contrato,
                sub,
                corte,
                item_info,
                registros,
                usuario_nombre,
                usuario_cargo,
                firma_cfg=firma_cfg,
                elaboro_firma_data_uri=elaboro_firma_uri,
                reviso_firma_data_uri=reviso_firma_uri,
            )
            if i > 0:
                parts.append("<pdf:nextpage />")
            parts.append(inner)

        html = _wrap_memoria_item_html("".join(parts), estilo_css)
        try:
            pdf_bytes = _to_pdf(html)
        except Exception as e:
            _log.exception("pdf_memoria_corte_completo: fallo PDF")
            raise HTTPException(500, f"Error generando PDF memoria completa: {e!s}") from e

        cons = corte_out.get("consecutivo", "")
        fname = _safe_filename_part(f"CC-SUB-002_Corte{cons}_todos-items.pdf")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("pdf_memoria_corte_completo: error no controlado")
        raise HTTPException(500, f"Error interno memoria PDF completa: {repr(e)}")


# ── CC-SEM / CC-MES : Conciliación interventoría–contratista ───────────────────


def _sub_corte_dummy_memoria() -> tuple:
    return ({"razon_social": "—", "nombre_contacto": "—"}, {"consecutivo": "—", "fecha_inicio": None, "fecha_fin": None})


@router.get("/{contrato_id}/pdf/cc-sem-001/semana/{semana_id}")
def pdf_cc_sem_001_semana(
    contrato_id: int,
    semana_id: int,
    current_user=Depends(_get_user),
):
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    sm = _row("so_semanas", "id, numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    pdf_bytes = _pdf_bytes_conciliacion_informe_v1(
        contrato_id,
        current_user,
        formato_codigo=CODIGO_FORMATO_CCD_CC_SEM_001,
        contexto_tipo="semana",
        contexto_id=semana_id,
        titulo_documento="INFORME EJECUCIÓN SEMANAL (CONCILIACIÓN INTERVENTORÍA–CONTRATISTA)",
        c3_label="SEMANA",
        c3_value=f"N° {nsem}",
        c4_label="VIGENCIA",
        c4_value=f"{fi} — {ff}",
        pie_contexto=f"Semana N° {nsem} · {fi} — {ff} · Registros nivel 3 aprobados y bloqueados",
        items=items,
        total_costo=total,
    )
    fname = _safe_filename_part(f"CC-SEM-001_semana_{nsem}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{contrato_id}/pdf/cc-mes-001/acta/{acta_id}")
def pdf_cc_mes_001_acta(
    contrato_id: int,
    acta_id: int,
    current_user=Depends(_get_user),
):
    if not _acta_pertenece_contrato(contrato_id, acta_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, acta_rpo_id=acta_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    ac = _row("actas", "id, numero_rpo, consecutivo", id=acta_id) or {}
    nrpo = str(ac.get("numero_rpo") or ac.get("consecutivo") or acta_id)
    cons = str(ac.get("consecutivo") or "—")
    fa = "—"
    pdf_bytes = _pdf_bytes_conciliacion_informe_v1(
        contrato_id,
        current_user,
        formato_codigo=CODIGO_FORMATO_CCD_CC_MES_001,
        contexto_tipo="acta_rpo",
        contexto_id=acta_id,
        titulo_documento="INFORME EJECUCIÓN MENSUAL (CONCILIACIÓN INTERVENTORÍA–CONTRATISTA)",
        c3_label="ACTA RPO",
        c3_value=nrpo,
        c4_label="FECHA ACTA",
        c4_value=fa,
        pie_contexto=f"Acta RPO {nrpo} · consecutivo {cons} · Registros nivel 3 aprobados y bloqueados",
        items=items,
        total_costo=total,
    )
    fname = _safe_filename_part(f"CC-MES-001_acta_{nrpo}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{contrato_id}/pdf/cc-sem-002/semana/{semana_id}")
def pdf_cc_sem_002_semana(
    contrato_id: int,
    semana_id: int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user),
):
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    registros = fetch_registros_memoria_conciliacion(
        _sb, contrato_id, item_numero, semana_id=semana_id, item_exacto=True
    )
    if not registros:
        raise HTTPException(404, "No hay registros para este ítem y semana")
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    u = current_user if isinstance(current_user, dict) else dict(current_user)
    usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
    usuario_cargo = u.get("cargo_nombre", "—") or "—"
    item_info = {
        "item_numero": registros[0].get("item_numero", item_numero),
        "item_descripcion": registros[0].get("item_descripcion", ""),
        "unidad": registros[0].get("unidad", ""),
    }
    sm = _row("so_semanas", "numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    conc_meta = {
        "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN SEMANAL (INTERVENTORÍA–CONTRATISTA)",
        "codigo": CODIGO_FORMATO_CCD_CC_SEM_002,
        "cells": [
            ("CONTRATO", str(contrato.get("numero") or "")),
            ("SEMANA", f"N° {nsem}"),
            ("VIGENCIA", f"{fi} — {ff}"),
            ("REFERENCIA", "Cantidades ejecutadas — conciliación"),
        ],
    }
    fmt = CODIGO_FORMATO_CCD_CC_SEM_002
    firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
    fc = firma_cfg or {}
    e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
    r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
    a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
    enom = str(fc.get("elaboro_nombre") or "").strip()
    rnom = str(fc.get("reviso_nombre") or "").strip()
    anom = str(fc.get("aprobo_nombre") or "").strip()
    elaboro_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "semana", semana_id, fmt, "elaboro", e_uid, enom, current_user
    )
    reviso_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "semana", semana_id, fmt, "reviso", r_uid, rnom, current_user
    )
    aprobo_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "semana", semana_id, fmt, "aprobo", a_uid, anom, current_user
    )
    sub, corte = _sub_corte_dummy_memoria()
    html = _html_memoria_item(
        contrato,
        sub,
        corte,
        item_info,
        registros,
        usuario_nombre,
        usuario_cargo,
        firma_cfg=firma_cfg,
        elaboro_firma_data_uri=elaboro_uri,
        reviso_firma_data_uri=reviso_uri,
        conc_meta=conc_meta,
        aprobo_firma_data_uri=aprobo_uri,
        aprobo_interventoria_desde_config=True,
        pie_fotos_contexto=f"Semana N° {nsem} · {fi} — {ff}",
        estilo_formato_codigo=fmt,
    )
    pdf_bytes = _to_pdf(html)
    item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
    fname = _safe_filename_part(f"CC-SEM-002_semana{nsem}_{item_safe}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{contrato_id}/pdf/cc-sem-002/semana/{semana_id}/completo")
def pdf_cc_sem_002_semana_completo(
    contrato_id: int,
    semana_id: int,
    current_user=Depends(_get_user),
):
    """Un solo PDF CC-SEM-002: todos los ítems de la semana (mismo formato que por ítem, salto entre ítems)."""
    try:
        if not _semana_pertenece_contrato(contrato_id, semana_id):
            raise HTTPException(404, "Semana no encontrada en este contrato")
        reg_agg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
        items_agg, _total = aggregate_items_conciliacion(reg_agg)
        _sort_items_corte_por_item_numero_asc(items_agg)
        numeros = [
            (it.get("item_numero") or "").strip()
            for it in items_agg
            if (it.get("item_numero") or "").strip()
        ]
        if not numeros:
            raise HTTPException(
                status_code=404,
                detail="No hay registros en esta semana para generar memorias",
            )

        contrato = _row(
            "contratos",
            "numero, objeto, contratista, nit, interventoria, logo_contratista",
            id=contrato_id,
        )
        if not contrato:
            raise HTTPException(404, "Contrato no encontrado")
        u = current_user if isinstance(current_user, dict) else dict(current_user)
        usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
        usuario_cargo = u.get("cargo_nombre", "—") or "—"
        sm = _row("so_semanas", "numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
        nsem = sm.get("numero_semana")
        fi = str(sm.get("fecha_inicio") or "—")
        ff = str(sm.get("fecha_fin") or "—")
        conc_meta = {
            "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN SEMANAL (INTERVENTORÍA–CONTRATISTA)",
            "codigo": CODIGO_FORMATO_CCD_CC_SEM_002,
            "cells": [
                ("CONTRATO", str(contrato.get("numero") or "")),
                ("SEMANA", f"N° {nsem}"),
                ("VIGENCIA", f"{fi} — {ff}"),
                ("REFERENCIA", "Cantidades ejecutadas — conciliación"),
            ],
        }
        fmt = CODIGO_FORMATO_CCD_CC_SEM_002
        firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
        fc = firma_cfg or {}
        e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
        r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
        a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
        enom = str(fc.get("elaboro_nombre") or "").strip()
        rnom = str(fc.get("reviso_nombre") or "").strip()
        anom = str(fc.get("aprobo_nombre") or "").strip()
        elaboro_uri = _firma_data_uri_para_slot_contexto(
            contrato_id, "semana", semana_id, fmt, "elaboro", e_uid, enom, current_user
        )
        reviso_uri = _firma_data_uri_para_slot_contexto(
            contrato_id, "semana", semana_id, fmt, "reviso", r_uid, rnom, current_user
        )
        aprobo_uri = _firma_data_uri_para_slot_contexto(
            contrato_id, "semana", semana_id, fmt, "aprobo", a_uid, anom, current_user
        )
        sub, corte = _sub_corte_dummy_memoria()
        est = _merge_estilo_pdf(fc.get("estilo_pdf"), fmt)
        estilo_css = _memoria_pdf_estilo_css(est)

        parts: list[str] = []
        for item_numero in numeros:
            registros = fetch_registros_memoria_conciliacion(
                _sb, contrato_id, item_numero, semana_id=semana_id, item_exacto=True
            )
            if not registros:
                continue
            item_info = {
                "item_numero": registros[0].get("item_numero", item_numero),
                "item_descripcion": registros[0].get("item_descripcion", ""),
                "unidad": registros[0].get("unidad", ""),
            }
            inner = _html_memoria_item_body(
                contrato,
                sub,
                corte,
                item_info,
                registros,
                usuario_nombre,
                usuario_cargo,
                firma_cfg=firma_cfg,
                elaboro_firma_data_uri=elaboro_uri,
                reviso_firma_data_uri=reviso_uri,
                conc_meta=conc_meta,
                aprobo_firma_data_uri=aprobo_uri,
                aprobo_interventoria_desde_config=True,
                pie_fotos_contexto=f"Semana N° {nsem} · {fi} — {ff}",
            )
            if parts:
                parts.append("<pdf:nextpage />")
            parts.append(inner)

        if not parts:
            raise HTTPException(
                status_code=404,
                detail="No hay registros aprobados por ítem en esta semana",
            )

        html = _wrap_memoria_item_html("".join(parts), estilo_css)
        try:
            pdf_bytes = _to_pdf(html)
        except Exception as e:
            _log.exception("pdf_cc_sem_002_semana_completo: fallo PDF")
            raise HTTPException(500, f"Error generando PDF memoria semanal completa: {e!s}") from e

        fname = _safe_filename_part(f"CC-SEM-002_semana{nsem}_todos-items.pdf")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("pdf_cc_sem_002_semana_completo: error no controlado")
        raise HTTPException(500, f"Error interno memoria PDF semanal completa: {repr(e)}")


@router.get("/{contrato_id}/pdf/cc-mes-002/acta/{acta_id}")
def pdf_cc_mes_002_acta(
    contrato_id: int,
    acta_id: int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user),
):
    if not _acta_pertenece_contrato(contrato_id, acta_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    registros = fetch_registros_memoria_conciliacion(
        _sb, contrato_id, item_numero, acta_rpo_id=acta_id, item_exacto=True
    )
    if not registros:
        raise HTTPException(404, "No hay registros para este ítem y acta")
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    u = current_user if isinstance(current_user, dict) else dict(current_user)
    usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
    usuario_cargo = u.get("cargo_nombre", "—") or "—"
    item_info = {
        "item_numero": registros[0].get("item_numero", item_numero),
        "item_descripcion": registros[0].get("item_descripcion", ""),
        "unidad": registros[0].get("unidad", ""),
    }
    ac = _row("actas", "numero_rpo, consecutivo", id=acta_id) or {}
    nrpo = str(ac.get("numero_rpo") or ac.get("consecutivo") or acta_id)
    cons = str(ac.get("consecutivo") or "—")
    fa = "—"
    conc_meta = {
        "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN MENSUAL (INTERVENTORÍA–CONTRATISTA)",
        "codigo": CODIGO_FORMATO_CCD_CC_MES_002,
        "cells": [
            ("CONTRATO", str(contrato.get("numero") or "")),
            ("ACTA RPO", nrpo),
            ("CONSECUTIVO", cons),
            ("FECHA ACTA", fa),
        ],
    }
    fmt = CODIGO_FORMATO_CCD_CC_MES_002
    firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
    fc = firma_cfg or {}
    e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
    r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
    a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
    enom = str(fc.get("elaboro_nombre") or "").strip()
    rnom = str(fc.get("reviso_nombre") or "").strip()
    anom = str(fc.get("aprobo_nombre") or "").strip()
    elaboro_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "acta_rpo", acta_id, fmt, "elaboro", e_uid, enom, current_user
    )
    reviso_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "acta_rpo", acta_id, fmt, "reviso", r_uid, rnom, current_user
    )
    aprobo_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "acta_rpo", acta_id, fmt, "aprobo", a_uid, anom, current_user
    )
    sub, corte = _sub_corte_dummy_memoria()
    html = _html_memoria_item(
        contrato,
        sub,
        corte,
        item_info,
        registros,
        usuario_nombre,
        usuario_cargo,
        firma_cfg=firma_cfg,
        elaboro_firma_data_uri=elaboro_uri,
        reviso_firma_data_uri=reviso_uri,
        conc_meta=conc_meta,
        aprobo_firma_data_uri=aprobo_uri,
        aprobo_interventoria_desde_config=True,
        pie_fotos_contexto=f"Acta RPO {nrpo} · cons. {cons}",
        estilo_formato_codigo=fmt,
    )
    pdf_bytes = _to_pdf(html)
    item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
    fname = _safe_filename_part(f"CC-MES-002_acta_{nrpo}_{item_safe}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{contrato_id}/pdf/cc-sem-001/semana/{semana_id}/con-sello-firma")
def pdf_cc_sem_001_semana_con_sello_firma(
    contrato_id: int,
    semana_id: int,
    current_user=Depends(_get_user),
):
    """Mismo PDF que CC-SEM-001 + página final de sello (firma de perfil, SHA-256, fecha)."""
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    sm = _row("so_semanas", "id, numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    pdf_bytes = _pdf_bytes_conciliacion_informe_v1(
        contrato_id,
        current_user,
        formato_codigo=CODIGO_FORMATO_CCD_CC_SEM_001,
        contexto_tipo="semana",
        contexto_id=semana_id,
        titulo_documento="INFORME EJECUCIÓN SEMANAL (CONCILIACIÓN INTERVENTORÍA–CONTRATISTA)",
        c3_label="SEMANA",
        c3_value=f"N° {nsem}",
        c4_label="VIGENCIA",
        c4_value=f"{fi} — {ff}",
        pie_contexto=f"Semana N° {nsem} · {fi} — {ff} · Registros nivel 3 aprobados y bloqueados",
        items=items,
        total_costo=total,
    )
    fname = _safe_filename_part(f"CC-SEM-001_semana_{nsem}.pdf")
    ctr = _row("contratos", "numero", id=contrato_id) or {}
    return _attachment_pdf_con_pagina_sello_usuario(
        pdf_bytes,
        current_user,
        titulo_doc=f"Informe ejecución semanal CC-SEM-001 — Semana N° {nsem} — {fi} — {ff}",
        formato_ccd=CODIGO_FORMATO_CCD_CC_SEM_001,
        contrato_numero=str(ctr.get("numero") or ""),
        nombre_archivo_pdf=fname,
    )


@router.get("/{contrato_id}/pdf/cc-mes-001/acta/{acta_id}/con-sello-firma")
def pdf_cc_mes_001_acta_con_sello_firma(
    contrato_id: int,
    acta_id: int,
    current_user=Depends(_get_user),
):
    """Mismo PDF que CC-MES-001 + página final de sello."""
    if not _acta_pertenece_contrato(contrato_id, acta_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, acta_rpo_id=acta_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    ac = _row("actas", "id, numero_rpo, consecutivo", id=acta_id) or {}
    nrpo = str(ac.get("numero_rpo") or ac.get("consecutivo") or acta_id)
    cons = str(ac.get("consecutivo") or "—")
    fa = "—"
    pdf_bytes = _pdf_bytes_conciliacion_informe_v1(
        contrato_id,
        current_user,
        formato_codigo=CODIGO_FORMATO_CCD_CC_MES_001,
        contexto_tipo="acta_rpo",
        contexto_id=acta_id,
        titulo_documento="INFORME EJECUCIÓN MENSUAL (CONCILIACIÓN INTERVENTORÍA–CONTRATISTA)",
        c3_label="ACTA RPO",
        c3_value=nrpo,
        c4_label="FECHA ACTA",
        c4_value=fa,
        pie_contexto=f"Acta RPO {nrpo} · consecutivo {cons} · Registros nivel 3 aprobados y bloqueados",
        items=items,
        total_costo=total,
    )
    fname = _safe_filename_part(f"CC-MES-001_acta_{nrpo}.pdf")
    ctr = _row("contratos", "numero", id=contrato_id) or {}
    return _attachment_pdf_con_pagina_sello_usuario(
        pdf_bytes,
        current_user,
        titulo_doc=f"Informe ejecución mensual CC-MES-001 — Acta RPO {nrpo}",
        formato_ccd=CODIGO_FORMATO_CCD_CC_MES_001,
        contrato_numero=str(ctr.get("numero") or ""),
        nombre_archivo_pdf=fname,
    )


@router.get("/{contrato_id}/pdf/cc-sem-002/semana/{semana_id}/con-sello-firma")
def pdf_cc_sem_002_semana_con_sello_firma(
    contrato_id: int,
    semana_id: int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user),
):
    """Misma memoria CC-SEM-002 que por ítem + página de sello."""
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    registros = fetch_registros_memoria_conciliacion(
        _sb, contrato_id, item_numero, semana_id=semana_id, item_exacto=True
    )
    if not registros:
        raise HTTPException(404, "No hay registros para este ítem y semana")
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    u = current_user if isinstance(current_user, dict) else dict(current_user)
    usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
    usuario_cargo = u.get("cargo_nombre", "—") or "—"
    item_info = {
        "item_numero": registros[0].get("item_numero", item_numero),
        "item_descripcion": registros[0].get("item_descripcion", ""),
        "unidad": registros[0].get("unidad", ""),
    }
    sm = _row("so_semanas", "numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    conc_meta = {
        "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN SEMANAL (INTERVENTORÍA–CONTRATISTA)",
        "codigo": CODIGO_FORMATO_CCD_CC_SEM_002,
        "cells": [
            ("CONTRATO", str(contrato.get("numero") or "")),
            ("SEMANA", f"N° {nsem}"),
            ("VIGENCIA", f"{fi} — {ff}"),
            ("REFERENCIA", "Cantidades ejecutadas — conciliación"),
        ],
    }
    fmt = CODIGO_FORMATO_CCD_CC_SEM_002
    firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
    fc = firma_cfg or {}
    e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
    r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
    a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
    enom = str(fc.get("elaboro_nombre") or "").strip()
    rnom = str(fc.get("reviso_nombre") or "").strip()
    anom = str(fc.get("aprobo_nombre") or "").strip()
    elaboro_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "semana", semana_id, fmt, "elaboro", e_uid, enom, current_user
    )
    reviso_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "semana", semana_id, fmt, "reviso", r_uid, rnom, current_user
    )
    aprobo_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "semana", semana_id, fmt, "aprobo", a_uid, anom, current_user
    )
    sub, corte = _sub_corte_dummy_memoria()
    html = _html_memoria_item(
        contrato,
        sub,
        corte,
        item_info,
        registros,
        usuario_nombre,
        usuario_cargo,
        firma_cfg=firma_cfg,
        elaboro_firma_data_uri=elaboro_uri,
        reviso_firma_data_uri=reviso_uri,
        conc_meta=conc_meta,
        aprobo_firma_data_uri=aprobo_uri,
        aprobo_interventoria_desde_config=True,
        pie_fotos_contexto=f"Semana N° {nsem} · {fi} — {ff}",
        estilo_formato_codigo=fmt,
    )
    pdf_bytes = _to_pdf(html)
    item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
    fname = _safe_filename_part(f"CC-SEM-002_semana{nsem}_{item_safe}.pdf")
    return _attachment_pdf_con_pagina_sello_usuario(
        pdf_bytes,
        current_user,
        titulo_doc=f"Memoria CC-SEM-002 — Ítem {item_numero} — Semana N° {nsem}",
        formato_ccd=CODIGO_FORMATO_CCD_CC_SEM_002,
        contrato_numero=str(contrato.get("numero") or ""),
        nombre_archivo_pdf=fname,
    )


@router.get("/{contrato_id}/pdf/cc-sem-002/semana/{semana_id}/completo/con-sello-firma")
def pdf_cc_sem_002_semana_completo_con_sello_firma(
    contrato_id: int,
    semana_id: int,
    current_user=Depends(_get_user),
):
    """Mismo PDF «todos los ítems» CC-SEM-002 + página de sello."""
    try:
        if not _semana_pertenece_contrato(contrato_id, semana_id):
            raise HTTPException(404, "Semana no encontrada en este contrato")
        reg_agg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
        items_agg, _total = aggregate_items_conciliacion(reg_agg)
        _sort_items_corte_por_item_numero_asc(items_agg)
        numeros = [
            (it.get("item_numero") or "").strip()
            for it in items_agg
            if (it.get("item_numero") or "").strip()
        ]
        if not numeros:
            raise HTTPException(
                status_code=404,
                detail="No hay registros en esta semana para generar memorias",
            )

        contrato = _row(
            "contratos",
            "numero, objeto, contratista, nit, interventoria, logo_contratista",
            id=contrato_id,
        )
        if not contrato:
            raise HTTPException(404, "Contrato no encontrado")
        u = current_user if isinstance(current_user, dict) else dict(current_user)
        usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
        usuario_cargo = u.get("cargo_nombre", "—") or "—"
        sm = _row("so_semanas", "numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
        nsem = sm.get("numero_semana")
        fi = str(sm.get("fecha_inicio") or "—")
        ff = str(sm.get("fecha_fin") or "—")
        conc_meta = {
            "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN SEMANAL (INTERVENTORÍA–CONTRATISTA)",
            "codigo": CODIGO_FORMATO_CCD_CC_SEM_002,
            "cells": [
                ("CONTRATO", str(contrato.get("numero") or "")),
                ("SEMANA", f"N° {nsem}"),
                ("VIGENCIA", f"{fi} — {ff}"),
                ("REFERENCIA", "Cantidades ejecutadas — conciliación"),
            ],
        }
        fmt = CODIGO_FORMATO_CCD_CC_SEM_002
        firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
        fc = firma_cfg or {}
        e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
        r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
        a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
        enom = str(fc.get("elaboro_nombre") or "").strip()
        rnom = str(fc.get("reviso_nombre") or "").strip()
        anom = str(fc.get("aprobo_nombre") or "").strip()
        elaboro_uri = _firma_data_uri_para_slot_contexto(
            contrato_id, "semana", semana_id, fmt, "elaboro", e_uid, enom, current_user
        )
        reviso_uri = _firma_data_uri_para_slot_contexto(
            contrato_id, "semana", semana_id, fmt, "reviso", r_uid, rnom, current_user
        )
        aprobo_uri = _firma_data_uri_para_slot_contexto(
            contrato_id, "semana", semana_id, fmt, "aprobo", a_uid, anom, current_user
        )
        sub, corte = _sub_corte_dummy_memoria()
        est = _merge_estilo_pdf(fc.get("estilo_pdf"), fmt)
        estilo_css = _memoria_pdf_estilo_css(est)

        parts: list[str] = []
        for item_numero in numeros:
            registros = fetch_registros_memoria_conciliacion(
                _sb, contrato_id, item_numero, semana_id=semana_id, item_exacto=True
            )
            if not registros:
                continue
            item_info = {
                "item_numero": registros[0].get("item_numero", item_numero),
                "item_descripcion": registros[0].get("item_descripcion", ""),
                "unidad": registros[0].get("unidad", ""),
            }
            inner = _html_memoria_item_body(
                contrato,
                sub,
                corte,
                item_info,
                registros,
                usuario_nombre,
                usuario_cargo,
                firma_cfg=firma_cfg,
                elaboro_firma_data_uri=elaboro_uri,
                reviso_firma_data_uri=reviso_uri,
                conc_meta=conc_meta,
                aprobo_firma_data_uri=aprobo_uri,
                aprobo_interventoria_desde_config=True,
                pie_fotos_contexto=f"Semana N° {nsem} · {fi} — {ff}",
            )
            if parts:
                parts.append("<pdf:nextpage />")
            parts.append(inner)

        if not parts:
            raise HTTPException(
                status_code=404,
                detail="No hay registros aprobados por ítem en esta semana",
            )

        html = _wrap_memoria_item_html("".join(parts), estilo_css)
        try:
            pdf_bytes = _to_pdf(html)
        except Exception as e:
            _log.exception("pdf_cc_sem_002_semana_completo_con_sello_firma: fallo PDF")
            raise HTTPException(500, f"Error generando PDF memoria semanal completa: {e!s}") from e

        fname = _safe_filename_part(f"CC-SEM-002_semana{nsem}_todos-items.pdf")
        return _attachment_pdf_con_pagina_sello_usuario(
            pdf_bytes,
            current_user,
            titulo_doc=f"Memorias CC-SEM-002 — Semana N° {nsem} — todos los ítems",
            formato_ccd=CODIGO_FORMATO_CCD_CC_SEM_002,
            contrato_numero=str(contrato.get("numero") or ""),
            nombre_archivo_pdf=fname,
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("pdf_cc_sem_002_semana_completo_con_sello_firma: error no controlado")
        raise HTTPException(500, f"Error interno memoria PDF semanal completa: {repr(e)}")


@router.get("/{contrato_id}/pdf/cc-mes-002/acta/{acta_id}/con-sello-firma")
def pdf_cc_mes_002_acta_con_sello_firma(
    contrato_id: int,
    acta_id: int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user),
):
    """Misma memoria CC-MES-002 + página de sello."""
    if not _acta_pertenece_contrato(contrato_id, acta_id):
        raise HTTPException(404, "Acta no encontrada en este contrato")
    registros = fetch_registros_memoria_conciliacion(
        _sb, contrato_id, item_numero, acta_rpo_id=acta_id, item_exacto=True
    )
    if not registros:
        raise HTTPException(404, "No hay registros para este ítem y acta")
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    u = current_user if isinstance(current_user, dict) else dict(current_user)
    usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
    usuario_cargo = u.get("cargo_nombre", "—") or "—"
    item_info = {
        "item_numero": registros[0].get("item_numero", item_numero),
        "item_descripcion": registros[0].get("item_descripcion", ""),
        "unidad": registros[0].get("unidad", ""),
    }
    ac = _row("actas", "numero_rpo, consecutivo", id=acta_id) or {}
    nrpo = str(ac.get("numero_rpo") or ac.get("consecutivo") or acta_id)
    cons = str(ac.get("consecutivo") or "—")
    fa = "—"
    conc_meta = {
        "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN MENSUAL (INTERVENTORÍA–CONTRATISTA)",
        "codigo": CODIGO_FORMATO_CCD_CC_MES_002,
        "cells": [
            ("CONTRATO", str(contrato.get("numero") or "")),
            ("ACTA RPO", nrpo),
            ("CONSECUTIVO", cons),
            ("FECHA ACTA", fa),
        ],
    }
    fmt = CODIGO_FORMATO_CCD_CC_MES_002
    firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
    fc = firma_cfg or {}
    e_uid = _opt_usuario_id(fc.get("elaboro_usuario_id"))
    r_uid = _opt_usuario_id(fc.get("reviso_usuario_id"))
    a_uid = _opt_usuario_id(fc.get("aprobo_usuario_id"))
    enom = str(fc.get("elaboro_nombre") or "").strip()
    rnom = str(fc.get("reviso_nombre") or "").strip()
    anom = str(fc.get("aprobo_nombre") or "").strip()
    elaboro_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "acta_rpo", acta_id, fmt, "elaboro", e_uid, enom, current_user
    )
    reviso_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "acta_rpo", acta_id, fmt, "reviso", r_uid, rnom, current_user
    )
    aprobo_uri = _firma_data_uri_para_slot_contexto(
        contrato_id, "acta_rpo", acta_id, fmt, "aprobo", a_uid, anom, current_user
    )
    sub, corte = _sub_corte_dummy_memoria()
    html = _html_memoria_item(
        contrato,
        sub,
        corte,
        item_info,
        registros,
        usuario_nombre,
        usuario_cargo,
        firma_cfg=firma_cfg,
        elaboro_firma_data_uri=elaboro_uri,
        reviso_firma_data_uri=reviso_uri,
        conc_meta=conc_meta,
        aprobo_firma_data_uri=aprobo_uri,
        aprobo_interventoria_desde_config=True,
        pie_fotos_contexto=f"Acta RPO {nrpo} · cons. {cons}",
        estilo_formato_codigo=fmt,
    )
    pdf_bytes = _to_pdf(html)
    item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
    fname = _safe_filename_part(f"CC-MES-002_acta_{nrpo}_{item_safe}.pdf")
    return _attachment_pdf_con_pagina_sello_usuario(
        pdf_bytes,
        current_user,
        titulo_doc=f"Memoria CC-MES-002 — Ítem {item_numero} — Acta RPO {nrpo}",
        formato_ccd=CODIGO_FORMATO_CCD_CC_MES_002,
        contrato_numero=str(contrato.get("numero") or ""),
        nombre_archivo_pdf=fname,
    )


_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/{contrato_id}/excel/memoria-item/{corte_id}")
def excel_memoria_item(
    contrato_id: int,
    corte_id: int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user),
):
    try:
        ctx = _contexto_memoria_item(contrato_id, corte_id, item_numero, current_user)
        firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SUB_002)
        xbytes = _memoria_item_excel_bytes(
            ctx["contrato"],
            ctx["sub"],
            ctx["corte"],
            ctx["item_info"],
            ctx["registros"],
            firma_cfg,
        )
        item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
        cons = (ctx["corte"] or {}).get("consecutivo", "")
        fname = _safe_filename_part(f"CC-SUB-002_Corte{cons}_{item_safe}.xlsx")
        return Response(
            content=xbytes,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("excel_memoria_item")
        raise HTTPException(500, f"Error generando Excel memoria: {repr(e)}") from e


@router.get("/{contrato_id}/excel/memoria-corte-completo/{corte_id}")
def excel_memoria_corte_completo(
    contrato_id: int,
    corte_id: int,
    current_user=Depends(_get_user),
):
    """Un libro con una hoja por ítem (orden ascendente por código, igual que el PDF completo)."""
    try:
        numeros = _list_item_numeros_memoria_corte(contrato_id, corte_id)
        if not numeros:
            raise HTTPException(
                status_code=404,
                detail="No hay registros aprobados en este corte para generar memorias",
            )
        firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SUB_002)
        xbytes = _memoria_corte_completo_excel_bytes(
            contrato_id, corte_id, numeros, current_user, firma_cfg
        )
        corte_row = _row("subcontratista_cortes", "consecutivo", id=corte_id) or {}
        cons = corte_row.get("consecutivo", "")
        fname = _safe_filename_part(f"CC-SUB-002_Corte{cons}_todos-items.xlsx")
        return Response(
            content=xbytes,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("excel_memoria_corte_completo")
        raise HTTPException(500, f"Error generando Excel memoria completa: {repr(e)}") from e


@router.get("/{contrato_id}/excel/corte-subcontratista/{corte_id}")
def excel_corte_subcontratista(
    contrato_id: int,
    corte_id: int,
    current_user=Depends(_get_user),
):
    """Excel CC-SUB-001: mismo contenido lógico que el informe de corte (PDF)."""
    try:
        ctx = _contexto_corte_sub(contrato_id, corte_id, current_user)
        firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SUB_001)
        xbytes = _corte_sub_001_excel_bytes(
            ctx["contrato"],
            ctx["sub"],
            ctx["corte"],
            ctx["items"],
            float(ctx["total_costo"] or 0.0),
            ctx["usuario_nombre"],
            ctx["usuario_cargo"],
            firma_cfg,
        )
        fname = _nombre_archivo_cc_sub_001(ctx["corte"], ctx["sub"], corte_id).replace(".pdf", ".xlsx")
        return Response(
            content=xbytes,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("excel_corte_subcontratista")
        raise HTTPException(500, f"Error generando Excel corte subcontratista: {repr(e)}") from e


@router.get("/{contrato_id}/excel/cc-sem-001/semana/{semana_id}")
def excel_cc_sem_001_semana(
    contrato_id: int,
    semana_id: int,
    current_user=Depends(_get_user),
):
    """Excel CC-SEM-001: mismo contenido lógico que el informe semanal (PDF)."""
    try:
        xbytes = _cc_sem_001_excel_bytes(contrato_id, semana_id, current_user)
        sm = _row("so_semanas", "numero_semana", id=semana_id) or {}
        nsem = sm.get("numero_semana")
        fname = _safe_filename_part(f"CC-SEM-001_semana_{nsem}.xlsx")
        return Response(
            content=xbytes,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("excel_cc_sem_001_semana")
        raise HTTPException(500, f"Error generando Excel CC-SEM-001: {repr(e)}") from e


@router.get("/{contrato_id}/excel/cc-sem-002/semana/{semana_id}")
def excel_cc_sem_002_semana(
    contrato_id: int,
    semana_id: int,
    item_numero: str = Query(...),
    current_user=Depends(_get_user),
):
    """Excel CC-SEM-002 por ítem: misma estructura que la memoria PDF semanal."""
    try:
        xbytes = _cc_sem_002_item_excel_bytes(contrato_id, semana_id, item_numero, current_user)
        sm = _row("so_semanas", "numero_semana", id=semana_id) or {}
        nsem = sm.get("numero_semana")
        item_safe = _safe_filename_part(item_numero.replace("/", "-").replace(" ", ""))
        fname = _safe_filename_part(f"CC-SEM-002_semana{nsem}_{item_safe}.xlsx")
        return Response(
            content=xbytes,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("excel_cc_sem_002_semana")
        raise HTTPException(500, f"Error generando Excel CC-SEM-002: {repr(e)}") from e


@router.get("/{contrato_id}/excel/cc-sem-002/semana/{semana_id}/completo")
def excel_cc_sem_002_semana_completo(
    contrato_id: int,
    semana_id: int,
    current_user=Depends(_get_user),
):
    """Excel CC-SEM-002: una hoja por ítem (todos los ítems de la semana)."""
    try:
        xbytes = _cc_sem_002_semana_completo_excel_bytes(contrato_id, semana_id, current_user)
        sm = _row("so_semanas", "numero_semana", id=semana_id) or {}
        nsem = sm.get("numero_semana")
        fname = _safe_filename_part(f"CC-SEM-002_semana{nsem}_todos-items.xlsx")
        return Response(
            content=xbytes,
            media_type=_XLSX_MEDIA,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("excel_cc_sem_002_semana_completo")
        raise HTTPException(500, f"Error generando Excel CC-SEM-002 completo: {repr(e)}") from e


# ── Preview / desarrollo ───────────────────────────────────────────────────────

def _html_idu_fo_eo_04_v2_plantilla_vacia() -> str:
    """Plantilla FO-EO-04 V2.0 (IDU): vista previa sin datos de obra — fondo blanco, bordes negros."""
    bd = "border:1px solid #000"
    z = "—"
    obs = (
        "Las dimensiones de la presente cantidad se soportan en los archivos que surgen de las respectivas "
        "conciliaciones semanales, realizadas entre contratista e interventoría. Toda esta información se adjunta "
        "en la entrega mensual para la verificación final del acta de recibo parcial de obra."
    )
    logo = (
        '<span style="font-size:16pt;font-weight:800;letter-spacing:0.5px;color:#0369a1;">i'
        '<span style="color:#dc2626;font-size:12pt;vertical-align:super;">●</span>'
        '<span style="color:#0369a1;">du</span></span>'
    )
    filas_vacias = 8
    filas_det = "".join(
        f'<tr style="height:14px;">'
        f'<td style="{bd};padding:2px 3px;font-size:6.5pt;">{z}</td>'
        f'<td style="{bd};padding:2px 3px;font-size:6.5pt;text-align:center;">{z}</td>'
        f'<td style="{bd};padding:2px 3px;font-size:6.5pt;text-align:center;">{z}</td>'
        f'<td style="{bd};padding:2px 3px;font-size:6.5pt;text-align:center;">{z}</td>'
        f'<td style="{bd};padding:2px 3px;font-size:6.5pt;text-align:center;">{z}</td>'
        f'<td style="{bd};padding:2px 3px;font-size:6.5pt;text-align:right;">{z}</td>'
        f"</tr>"
        for _ in range(filas_vacias)
    )
    tot_rows = [
        "TOTAL EJECUTADO PRESENTE ACTA",
        "TOTAL EJECUTADO ACTAS ANTERIORES",
        "TOTAL EJECUTADO ACUMULADO",
        "TOTAL POR EJECUTAR",
    ]
    tot_block = "".join(
        f'<tr><td colspan="4" style="{bd};padding:3px 4px;font-size:6.5pt;text-align:right;font-weight:bold;">'
        f"{_h(lbl)}</td>"
        f'<td colspan="2" style="{bd};padding:3px 4px;font-size:6.5pt;text-align:right;">{z}</td></tr>'
        for lbl in tot_rows
    )
    return f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>FO-EO-04 V2.0 — IDU</title>
<style type="text/css">
@page {{ size: letter portrait; margin: 10mm 12mm; }}
body {{ margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:7pt;color:#111;line-height:1.2; }}
.lbl {{ font-size:6pt;font-weight:bold;text-transform:uppercase; }}
.hint {{ font-size:5.5pt;color:#444;margin-top:1px; }}
</style></head><body>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd}">
<tr>
<td width="16%" style="vertical-align:top;{bd};padding:5px 6px;">
<div class="lbl">Código</div>
<div style="font-size:8pt;font-weight:bold;margin-top:2px;">FO-EO-04</div>
</td>
<td width="58%" style="vertical-align:middle;{bd};padding:6px 8px;text-align:center;">
<div style="font-size:8.5pt;font-weight:bold;letter-spacing:0.02em;">FORMATO MEMORIA DE CÁLCULO DE CANTIDADES DE OBRA</div>
<div style="font-size:6.5pt;margin-top:3px;font-weight:bold;">PROCESO CONSTRUCCIÓN DE PROYECTOS</div>
</td>
<td width="26%" style="vertical-align:middle;{bd};padding:4px 6px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
<tr>
<td style="vertical-align:middle;padding:2px 4px 2px 0;">
<div class="lbl">Versión</div>
<div style="font-size:9pt;font-weight:bold;">2.0</div>
</td>
<td style="text-align:right;vertical-align:middle;width:55%;">{logo}</td>
</tr>
</table>
</td>
</tr>
</table>
<div style="text-align:center;font-size:6.5pt;font-weight:bold;padding:4px 6px;{bd};border-top:none;">
SUBDIRECCIÓN GENERAL DE INFRAESTRUCTURA
</div>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd};border-top:none;">
<tr>
<td style="width:34%;{bd};padding:4px 6px;font-size:6.5pt;font-weight:bold;text-align:center;border-top:none;">DIRECCIÓN TÉCNICA DE CONSTRUCCIONES</td>
<td style="width:33%;{bd};padding:4px 6px;font-size:6.5pt;font-weight:bold;text-align:center;">SUBDIRECCIÓN TÉCNICA</td>
<td style="width:33%;{bd};padding:4px 6px;font-size:6.5pt;font-weight:bold;text-align:center;">DE EJECUCIÓN DEL SUBSISTEMA VIAL</td>
</tr>
</table>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd};border-top:none;">
<tr>
<td style="{bd};padding:4px 6px;border-top:none;">
<span style="font-weight:bold;">CONTRATO No</span>
<span style="border-bottom:1px solid #000;display:inline-block;min-width:42px;margin:0 4px;">&nbsp;</span>
<span style="font-weight:bold;">DE</span>
<span style="border-bottom:1px solid #000;display:inline-block;min-width:28px;margin:0 4px;">&nbsp;</span>
<div class="hint">Número de contrato &nbsp;&nbsp;&nbsp; Año de suscripción</div>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<div style="font-weight:bold;margin-bottom:3px;">OBJETO DEL CONTRATO</div>
<div style="min-height:36px;border-bottom:1px solid #ccc;">&nbsp;</div>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr>
<td style="width:38%;vertical-align:bottom;">
<span style="font-weight:bold;">RECIBO PARCIAL No</span>
<span style="border-bottom:1px solid #000;display:inline-block;min-width:48px;">&nbsp;</span>
</td>
<td style="width:37%;vertical-align:bottom;">
<span style="font-weight:bold;">CORRESPONDIENTE AL PERIODO DESDE</span>
<span style="border-bottom:1px solid #000;display:inline-block;min-width:56px;">&nbsp;</span>
</td>
<td style="width:25%;vertical-align:bottom;">
<span style="font-weight:bold;">HASTA</span>
<span style="border-bottom:1px solid #000;display:inline-block;min-width:56px;">&nbsp;</span>
</td>
</tr></table>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<table width="100%" cellspacing="0" cellpadding="0"><tr>
<td style="width:28%;"><span style="font-weight:bold;">ITEM No</span> <span style="border-bottom:1px solid #000;display:inline-block;min-width:52px;">&nbsp;</span></td>
<td style="width:22%;"><span style="font-weight:bold;">UNIDAD</span> <span style="border-bottom:1px solid #000;display:inline-block;min-width:36px;">&nbsp;</span></td>
<td style="width:50%;"><span style="font-weight:bold;">ESPECIFICACIÓN TÉCNICA</span> <span style="border-bottom:1px solid #000;display:inline-block;min-width:120px;">&nbsp;</span></td>
</tr></table>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<div style="font-weight:bold;margin-bottom:2px;">DESCRIPCIÓN DEL ÍTEM</div>
<div style="min-height:18px;border-bottom:1px solid #ccc;">&nbsp;</div>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<div style="font-weight:bold;">CONTRATISTA</div>
<div style="border-bottom:1px solid #000;min-height:14px;margin-top:2px;">&nbsp;</div>
<div class="hint">Escriba el nombre o razón social del contratista</div>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<div style="font-weight:bold;">INTERVENTORÍA</div>
<div style="border-bottom:1px solid #000;min-height:14px;margin-top:2px;">&nbsp;</div>
<div class="hint">Escriba el nombre o razón social del interventor</div>
</td>
</tr>
<tr>
<td style="{bd};padding:4px 6px;">
<div style="font-weight:bold;">SUPERVISOR(A)</div>
<div style="border-bottom:1px solid #000;min-height:14px;margin-top:2px;">&nbsp;</div>
<div class="hint">Escriba el nombre del Supervisor (a) delegado (a) por el IDU</div>
</td>
</tr>
</table>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd};border-top:none;margin-top:0;">
<tr style="background:#f3f4f6;">
<td style="{bd};padding:3px 4px;font-size:6.5pt;font-weight:bold;text-align:center;width:34%;">UBICACIÓN</td>
<td style="{bd};padding:3px 4px;font-size:6.5pt;font-weight:bold;text-align:center;width:11%;">LARGO</td>
<td style="{bd};padding:3px 4px;font-size:6.5pt;font-weight:bold;text-align:center;width:11%;">ANCHO</td>
<td style="{bd};padding:3px 4px;font-size:6.5pt;font-weight:bold;text-align:center;width:11%;">ALTO</td>
<td style="{bd};padding:3px 4px;font-size:6.5pt;font-weight:bold;text-align:center;width:11%;">CANTIDAD</td>
<td style="{bd};padding:3px 4px;font-size:6.5pt;font-weight:bold;text-align:center;width:22%;">TOTAL</td>
</tr>
{filas_det}
{tot_block}
</table>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px;{bd};border-top:none;">
<tr>
<td width="50%" style="vertical-align:top;{bd};padding:0;border-top:none;">
<div style="font-weight:bold;font-size:6.5pt;padding:3px 4px;{bd};border:none;border-bottom:1px solid #000;text-align:center;">PLANO/ESQUEMA</div>
<div style="min-height:78px;padding:6px;">&nbsp;</div>
</td>
<td width="50%" style="vertical-align:top;{bd};padding:0;border-top:none;border-left:none;">
<div style="font-weight:bold;font-size:6.5pt;padding:3px 4px;{bd};border:none;border-bottom:1px solid #000;text-align:center;">FOTOGRAFÍA</div>
<div style="min-height:78px;padding:6px;">&nbsp;</div>
</td>
</tr>
</table>
<div style="margin-top:6px;{bd};padding:4px 6px;">
<div style="font-weight:bold;margin-bottom:3px;">OBSERVACIONES</div>
<div style="font-size:6.5pt;text-align:justify;line-height:1.35;">{_h(obs)}</div>
</div>
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:8px;{bd};">
<tr>
<td width="50%" style="vertical-align:top;{bd};padding:8px 10px;">
<div style="font-weight:bold;text-align:center;margin-bottom:8px;">ELABORÓ</div>
<div style="min-height:28px;border-bottom:1px solid #000;margin-bottom:6px;">&nbsp;</div>
<div style="min-height:28px;border-bottom:1px solid #000;margin-bottom:4px;">&nbsp;</div>
<div class="hint" style="text-align:center;">Firma / nombre y cargo</div>
</td>
<td width="50%" style="vertical-align:top;{bd};padding:8px 10px;border-left:none;">
<div style="font-weight:bold;text-align:center;margin-bottom:8px;">REVISÓ</div>
<div style="min-height:28px;border-bottom:1px solid #000;margin-bottom:6px;">&nbsp;</div>
<div style="min-height:28px;border-bottom:1px solid #000;margin-bottom:4px;">&nbsp;</div>
<div class="hint" style="text-align:center;">Firma / nombre y cargo</div>
</td>
</tr>
</table>
<div style="font-size:5.5pt;text-align:center;margin-top:10px;padding:4px;color:#333;">
ORIGINAL: INTERVENTORÍA | 1ra COPIA: CONTRATISTA | 2da COPIA: DEPENDENCIA RESPONSABLE DEL CONTRATO
</div>
<div style="font-size:5.5pt;text-align:center;margin-top:4px;color:#64748b;">Vista previa ClaraCore · sin datos de obra · {CODIGO_FORMATO_IDU_FO_EO_04_V2}</div>
</body></html>"""


@router.get("/{contrato_id}/ccd/preview-plantilla-vacia/{formato_codigo}")
def ccd_preview_plantilla_vacia_pdf(
    contrato_id: int,
    formato_codigo: str,
    current_user=Depends(_get_user),
):
    """PDF de plantilla sin datos (vista previa de diseño) para formatos que la expongan."""
    del contrato_id  # reservado para permisos por contrato / marca de agua futura
    if formato_codigo not in FORMATOS_CCD:
        raise HTTPException(status_code=404, detail="Código de formato CCD desconocido")
    meta = FORMATOS_CCD[formato_codigo]
    if meta.get("plantilla_html") != "idu_memoria_fo_eo_04_v2":
        raise HTTPException(
            status_code=404,
            detail="Vista previa vacía no disponible para este formato",
        )
    html = _html_idu_fo_eo_04_v2_plantilla_vacia()
    pdf_bytes = _to_pdf(html)
    fname = _safe_filename_part(f"preview_{formato_codigo}_plantilla_vacia.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )


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
    html = _html_cc_sub_v1_plain(
        contrato,
        sub,
        corte,
        items,
        total_costo,
        "Jorge Andrés Jaimes",
        "Desarrollador / Controlador de Obra",
        firma_cfg={
            "elaboro_nombre": "Ej. Elaboró",
            "elaboro_cargo": "Cargo",
            "reviso_nombre": "Ej. Revisó",
            "reviso_cargo": "Cargo",
        },
    )
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


def _descripcion_memoria_compacta(s: object) -> str:
    """Descripción u observación en CC-SUB-002: minúsculas para PDF más compacto (la BD suele venir en mayúsculas)."""
    t = "" if s is None else str(s).strip()
    return t.lower()

# ── CSS base (compatible xhtml2pdf) ────────────────────────────────────────────
# CC-SUB-002 NO debe concatenar PAGE_CSS_PORTRAIT: xhtml2pdf aplica el primer @page a
# todas las hojas; un segundo @page no cambia orientación en páginas siguientes → queda
# vertical rota / columnas aplastadas. Memoria usa solo BASE_CSS_SHARED + MEMORIA002_CSS.

PAGE_CSS_LETTER_PORTRAIT = """
@page {
    size: letter;
    margin: 1.2cm 1.2cm 1.4cm 1.2cm;
}
"""

BASE_CSS_SHARED = """
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

BASE_CSS = PAGE_CSS_LETTER_PORTRAIT + BASE_CSS_SHARED

# CC-SUB-002: un único @page (landscape) + estilos; ir junto a BASE_CSS_SHARED, sin PAGE_CSS_PORTRAIT.
MEMORIA002_CSS = """
@page {
  size: letter landscape;
  margin: 0.85cm 0.8cm 0.95cm 0.8cm;
}
body.mem002-doc {
  font-family: Arial, sans-serif;
  font-size: 6pt;
  color: #1a1a2e;
}
body.mem002-doc .mem002-head-wrap {
  width: 100%;
  page-break-inside: avoid;
  page-break-after: avoid;
}
body.mem002-doc .mem002-section {
  page-break-after: avoid;
  margin-top: 1px;
  margin-bottom: 2px;
  font-size: 7pt;
  padding: 2px 6px;
}
body.mem002-doc .mem002-detail {
  width: 100%;
  border-collapse: collapse;
  /* auto: xhtml2pdf + colgroup/table-layout:fixed aplastaba OBSERVACIÓN; anchos en <th> */
  table-layout: auto;
}
body.mem002-doc .mem002-detail th.data-th {
  padding: 2px 2px;
  font-size: 6pt;
  line-height: 1.1;
}
body.mem002-doc .mem002-detail td.data-td {
  padding: 1px 2px;
  font-size: 6pt;
  line-height: 1.12;
  min-height: 0.26cm;
  vertical-align: middle;
}
body.mem002-doc .mem002-detail td.mem002-obs {
  vertical-align: top;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
body.mem002-doc .mem002-detail .total-td {
  font-size: 6pt;
  padding: 2px 3px;
}
/* Totales fuera de .mem002-detail: evita colspan que en xhtml2pdf deforma la última hoja del detalle */
body.mem002-doc .mem002-total-wrap {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
body.mem002-doc .mem002-total-wrap td.total-td {
  font-size: 6pt;
  padding: 2px 3px;
}
body.mem002-doc .doc-footer {
  margin-top: 4px;
  padding-top: 2px;
  font-size: 6pt;
}
body.mem002-doc .mem002-foto-grid td { vertical-align: top; }
/* Bloque firmas (misma lógica que CC-SUB-001: Elaboró / Revisó / Aprobó subcontratista) */
body.mem002-doc .mem002-firmas-wrap {
  margin-top: 2mm;
  page-break-inside: avoid;
}
body.mem002-doc .mem002-firmas-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; }
body.mem002-doc .mem002-firmas-tbl td {
  vertical-align: top !important;
  padding: 1px 3px !important;
}
body.mem002-doc .mem002-firma-slot-hdr {
  font-weight: bold;
  font-size: 6pt;
  margin: 0;
  padding: 0;
  color: #111;
  line-height: 1;
}
body.mem002-doc .mem002-firma-slot-body {
  height: 0.45cm;
  min-height: 0.45cm;
  max-height: 0.45cm;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}
body.mem002-doc .mem002-firma-line {
  border: none;
  border-top: 1px solid #111;
  width: 100%;
  height: 0;
  line-height: 0;
  font-size: 0;
  margin: 0 0 1px 0;
  padding: 0;
  overflow: hidden;
}
body.mem002-doc .mem002-firma-nombre {
  font-weight: bold;
  font-size: 6.5pt;
  line-height: 1.05;
  margin: 0;
  padding: 0;
  word-wrap: break-word;
}
body.mem002-doc .mem002-firma-cargo {
  font-size: 6pt;
  color: #444;
  line-height: 1.05;
  margin: 0;
  padding: 0;
  word-wrap: break-word;
}
body.mem002-doc .mem002-firma-rep {
  font-size: 6pt;
  color: #333;
  line-height: 1.05;
  margin: 0;
  padding: 0;
  word-wrap: break-word;
}
/* _html_cc_sub_td_firma_columna usa clases ccd-firma-* (no mem002-*). CC-SUB-001 incrusta estas
   reglas en su <style>; sin ellas xhtml2pdf estira .ccd-firma-slot-body / la línea y toda la fila
   de firmas queda desproporcionada (hueco entre imagen y nombre en CC-SEM/CC-MES memorias). */
body.mem002-doc .mem002-firmas-wrap .ccd-firma-slot-hdr {
  font-weight: bold;
  font-size: 6pt;
  margin: 0;
  padding: 0;
  color: #111;
  line-height: 1;
}
body.mem002-doc .mem002-firmas-wrap .ccd-firma-slot-body {
  /* Columnas sin imagen: más bajo que CC-SUB-001 para no estirar la fila frente a la columna con firma */
  height: 0.45cm;
  min-height: 0.45cm;
  max-height: 0.45cm;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}
body.mem002-doc .mem002-firmas-wrap .ccd-firma-line {
  border: none;
  border-top: 1px solid #111;
  width: 100%;
  height: 0;
  line-height: 0;
  font-size: 0;
  margin: 0 0 1px 0;
  padding: 0;
  overflow: hidden;
}
/* Memorias: jaula más baja que CC-SUB-001 (~22pt); !important gana estilos inline del HTML. */
body.mem002-doc .mem002-firmas-wrap table.ccd-firma-img-cage {
  height: 22pt !important;
  max-height: 22pt !important;
  margin: 0 !important;
  overflow: hidden !important;
}
body.mem002-doc .mem002-firmas-wrap .ccd-firma-img-cage td {
  overflow: hidden !important;
  padding: 0 !important;
  height: 22pt !important;
  max-height: 22pt !important;
  line-height: 0 !important;
  vertical-align: middle !important;
}
body.mem002-doc .mem002-firmas-wrap .ccd-firma-img-cage img {
  max-width: 100% !important;
  height: 20pt !important;
  max-height: 20pt !important;
  width: auto !important;
  display: block !important;
  margin: 0 auto !important;
}
body.mem002-doc .mem002-firmas-wrap .ccd-firma-nombre {
  word-wrap: break-word;
  font-weight: bold;
  font-size: 6.5pt;
  line-height: 1.05;
  margin: 0 !important;
  padding: 0;
}
body.mem002-doc .mem002-firmas-wrap .ccd-firma-cargo {
  word-wrap: break-word;
  font-size: 6pt;
  color: #444;
  line-height: 1.05;
  margin: 0 !important;
  padding: 0;
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


def _excel_sheet_name(item_numero: object) -> str:
    """Nombre de hoja Excel (máx. 31, sin caracteres prohibidos)."""
    raw = str(item_numero if item_numero is not None else "Item").strip() or "Item"
    t = re.sub(r"[\[\]\*\?\/\\:]", "_", raw)[:31]
    return t or "Item"


def _excel_unique_sheet_name(wb: Workbook, base: str) -> str:
    b = _excel_sheet_name(base)
    if b not in wb.sheetnames:
        return b
    for i in range(2, 500):
        suf = f"_{i}"
        t = (b[: 31 - len(suf)] + suf)[:31]
        if t not in wb.sheetnames:
            return t
    return f"H{len(wb.sheetnames)}"[:31]


def _fill_memoria_excel_ws(
    ws,
    contrato: dict,
    sub: dict,
    corte: dict,
    item_info: dict,
    registros: List[dict],
    firma_cfg: Optional[Dict[str, Any]],
    *,
    conc_meta: Optional[Dict[str, Any]] = None,
    pie_fotos_contexto: Optional[str] = None,
    aprobo_interventoria_desde_config: bool = False,
) -> None:
    """Hoja CC-SUB-002 / CC-SEM-002 / CC-MES-002: encabezado, detalle, total, fotos, firmas."""
    fc = firma_cfg or {}
    elaboro_n = str(fc.get("elaboro_nombre") or "").strip() or "—"
    elaboro_c = str(fc.get("elaboro_cargo") or "").strip() or "—"
    reviso_n = str(fc.get("reviso_nombre") or "").strip() or "—"
    reviso_c = str(fc.get("reviso_cargo") or "").strip() or "—"
    if aprobo_interventoria_desde_config:
        aprobo_emp = str(fc.get("aprobo_nombre") or "").strip() or "—"
        aprobo_rep = str(fc.get("aprobo_cargo") or "").strip() or "—"
    else:
        aprobo_emp = str(sub.get("razon_social") or "").strip() or "—"
        aprobo_rep = str(sub.get("nombre_contacto") or "").strip() or "—"

    thin = Side(style="thin", color="9CA3AF")
    bd = Border(left=thin, right=thin, top=thin, bottom=thin)
    fill_bar = PatternFill("solid", fgColor="E5E7EB")
    fill_th = PatternFill("solid", fgColor="F3F4F6")
    fill_tot = PatternFill("solid", fgColor="E5E7EB")

    for i, w in enumerate([5, 9, 9, 8, 10, 8, 8, 8, 9, 10, 36], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    total_cant = sum(_sf(r.get("cantidad_total"), 0.0) for r in registros)
    corte_lbl = _corte_consecutivo_fmt(corte)
    periodo = f"{_fd(corte.get('fecha_inicio'))} — {_fd(corte.get('fecha_fin'))}"

    titulo_h = "RESUMEN ACTIVIDADES CONCILIACIÓN CORTE SUBCONTRATISTA"
    codigo_h = "CC-SUB-002"
    if conc_meta:
        titulo_h = str(conc_meta.get("titulo") or titulo_h)
        codigo_h = str(conc_meta.get("codigo") or codigo_h)

    ws.merge_cells("A1:K1")
    c = ws["A1"]
    c.value = titulo_h
    c.font = Font(bold=True, size=12)
    c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.merge_cells("A2:K2")
    ws["A2"] = f"{codigo_h} · CCD · Memoria por ítem"
    ws["A2"].font = Font(bold=True, size=10, color="1E40AF")
    ws["A2"].alignment = Alignment(horizontal="center")

    if conc_meta:
        cells = list(conc_meta.get("cells") or [])
        while len(cells) < 4:
            cells.append(("", ""))
        ws["A3"] = str(cells[0][0] or "")
        ws["A3"].font = Font(size=8, color="64748B")
        ws.merge_cells("B3:E3")
        ws["B3"] = str(cells[0][1] or "—")
        ws["F3"] = str(cells[1][0] or "")
        ws["F3"].font = Font(size=8, color="64748B")
        ws.merge_cells("G3:K3")
        ws["G3"] = str(cells[1][1] or "—")
        ws["A4"] = str(cells[2][0] or "")
        ws["A4"].font = Font(size=8, color="64748B")
        ws.merge_cells("B4:E4")
        ws["B4"] = str(cells[2][1] or "—")
        ws["F4"] = str(cells[3][0] or "")
        ws["F4"].font = Font(size=8, color="64748B")
        ws.merge_cells("G4:K4")
        ws["G4"] = str(cells[3][1] or "—")
        for rr in (3, 4):
            for cc in (1, 2, 6, 7):
                ws.cell(row=rr, column=cc).border = bd
        ws["A5"], ws["B5"] = "ÍTEM", str(item_info.get("item_numero") or "—")
        ws.merge_cells("B5:C5")
        ws["D5"] = "DESCRIPCIÓN"
        ws["D5"].font = Font(size=8, color="64748B")
        ws.merge_cells("E5:I5")
        ws["E5"] = _descripcion_memoria_compacta(item_info.get("item_descripcion"))
        ws["E5"].alignment = Alignment(wrap_text=True, vertical="top")
        ws["J5"] = "UNIDAD"
        ws["J5"].font = Font(size=8, color="64748B")
        ws["K5"] = str(item_info.get("unidad") or "—")
        for cc in (1, 2, 4, 5, 10, 11):
            ws.cell(row=5, column=cc).border = bd
        r0 = 7
    else:
        ws["A3"], ws["B3"] = "CONTRATO", str(contrato.get("numero") or "—")
        ws.merge_cells("B3:E3")
        ws["F3"], ws["G3"] = "SUB CONTRATISTA", str(sub.get("razon_social") or "—")
        ws.merge_cells("G3:K3")
        for x in ("A3", "F3"):
            ws[x].font = Font(size=8, color="64748B")
            ws[x].alignment = Alignment(vertical="top")

        ws["A4"], ws["B4"] = "CORTE N°", corte_lbl
        ws.merge_cells("B4:E4")
        ws["F4"], ws["G4"] = "PERÍODO", periodo
        ws.merge_cells("G4:K4")
        for x in ("A4", "F4"):
            ws[x].font = Font(size=8, color="64748B")

        ws["A5"], ws["B5"] = "ÍTEM", str(item_info.get("item_numero") or "—")
        ws.merge_cells("B5:C5")
        ws["D5"] = "DESCRIPCIÓN"
        ws["D5"].font = Font(size=8, color="64748B")
        ws.merge_cells("E5:I5")
        ws["E5"] = _descripcion_memoria_compacta(item_info.get("item_descripcion"))
        ws["E5"].alignment = Alignment(wrap_text=True, vertical="top")
        ws["J5"] = "UNIDAD"
        ws["J5"].font = Font(size=8, color="64748B")
        ws["K5"] = str(item_info.get("unidad") or "—")
        for rr in (3, 4):
            for cc in (1, 2, 6, 7):
                ws.cell(row=rr, column=cc).border = bd
        for cc in (1, 2, 4, 5, 10, 11):
            ws.cell(row=5, column=cc).border = bd
        r0 = 7
    ws.merge_cells(start_row=r0, start_column=1, end_row=r0, end_column=11)
    bar = ws.cell(row=r0, column=1, value="DETALLE DE CANTIDADES APROBADAS")
    bar.fill = fill_bar
    bar.font = Font(bold=True, size=9)
    bar.alignment = Alignment(horizontal="center", vertical="center")
    bar.border = bd

    hdr = [
        "N°",
        "ABS INI",
        "ABS FIN",
        "PK ID",
        "COSTADO",
        "LONG",
        "ANCHO",
        "ESP",
        "CANT",
        "CANT TOT",
        "OBSERVACIÓN",
    ]
    hr = r0 + 1
    for col, h in enumerate(hdr, start=1):
        cell = ws.cell(row=hr, column=col, value=h)
        cell.fill = fill_th
        cell.font = Font(bold=True, size=8)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = bd

    data_row = hr + 1
    for i, r in enumerate(registros):
        obs = r.get("observacion") or ""
        fn = r.get("foto_numero")
        if fn:
            obs = f"{obs} [Foto {fn}]".strip()
        obs = _descripcion_memoria_compacta(obs)
        pkv = (r.get("pk_ids") or {}).get("pk_id")
        row = data_row + i
        vals = [
            r.get("numero_registro"),
            r.get("abs_inicio") or "—",
            r.get("abs_final") or "—",
            pkv if pkv is not None else "—",
            r.get("calzada") or "—",
            _fn(r.get("longitud")),
            _fn(r.get("ancho")),
            _fn(r.get("espesor")),
            _fn(r.get("cantidad")),
            _fn(r.get("cantidad_total")),
            (obs or "")[:500],
        ]
        for col, v in enumerate(vals, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = bd
            cell.font = Font(size=8)
            if col in (6, 7, 8, 9, 10):
                cell.alignment = Alignment(horizontal="right", vertical="center")
            elif col == 11:
                cell.alignment = Alignment(wrap_text=True, vertical="top")
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        if i % 2 == 0:
            for col in range(1, 12):
                ws.cell(row=row, column=col).fill = PatternFill("solid", fgColor="F8FAFC")

    tot_r = data_row + len(registros)
    ws.merge_cells(start_row=tot_r, start_column=1, end_row=tot_r, end_column=9)
    ws.cell(row=tot_r, column=1, value="CANTIDAD TOTAL DEL ÍTEM").alignment = Alignment(
        horizontal="right", vertical="center"
    )
    ws.cell(row=tot_r, column=1).font = Font(bold=True, size=9)
    c_tot = ws.cell(row=tot_r, column=10, value=_fn(total_cant))
    c_tot.font = Font(bold=True, size=9)
    c_tot.alignment = Alignment(horizontal="right")
    c_tot.border = bd
    c_tot.fill = fill_tot
    c_lab = ws.cell(row=tot_r, column=1)
    c_lab.border = bd
    c_lab.fill = fill_tot
    c_e = ws.cell(row=tot_r, column=11)
    c_e.border = bd
    c_e.fill = fill_tot

    fotos = [r for r in registros if (r.get("foto_url") or "").strip()]
    fr = tot_r + 2
    ws.merge_cells(start_row=fr, start_column=1, end_row=fr, end_column=11)
    cap_foto = f"REGISTRO FOTOGRÁFICO — ÍTEM {item_info.get('item_numero', '')} | Corte N° {corte.get('consecutivo', '')}"
    if conc_meta and (pie_fotos_contexto or "").strip():
        cap_foto = f"REGISTRO FOTOGRÁFICO — ÍTEM {item_info.get('item_numero', '')} | {pie_fotos_contexto}"
    fb = ws.cell(row=fr, column=1, value=cap_foto)
    fb.fill = fill_bar
    fb.font = Font(bold=True, size=9)
    fb.alignment = Alignment(horizontal="center", vertical="center")
    fb.border = bd

    fhdr = fr + 1
    ws.cell(row=fhdr, column=1, value="Reg.").fill = fill_th
    ws.cell(row=fhdr, column=1).font = Font(bold=True, size=8)
    ws.cell(row=fhdr, column=1).border = bd
    ws.cell(row=fhdr, column=2, value="Foto N°").fill = fill_th
    ws.cell(row=fhdr, column=2).font = Font(bold=True, size=8)
    ws.cell(row=fhdr, column=2).border = bd
    ws.merge_cells(start_row=fhdr, start_column=3, end_row=fhdr, end_column=8)
    c3 = ws.cell(row=fhdr, column=3, value="Enlace / URL")
    c3.fill = fill_th
    c3.font = Font(bold=True, size=8)
    c3.alignment = Alignment(horizontal="center", vertical="center")
    c3.border = bd
    ws.merge_cells(start_row=fhdr, start_column=9, end_row=fhdr, end_column=11)
    c9 = ws.cell(row=fhdr, column=9, value="Observación")
    c9.fill = fill_th
    c9.font = Font(bold=True, size=8)
    c9.alignment = Alignment(horizontal="center", vertical="center")
    c9.border = bd

    pr = fhdr + 1
    if not fotos:
        ws.merge_cells(start_row=pr, start_column=1, end_row=pr, end_column=11)
        sf = ws.cell(row=pr, column=1, value="Sin fotos en este ítem.")
        sf.font = Font(size=8, italic=True, color="64748B")
        sf.alignment = Alignment(horizontal="left")
        sf.border = bd
        pr += 1
    else:
        for r in fotos:
            fu = (r.get("foto_url") or "").strip()
            obs_f = _descripcion_memoria_compacta((r.get("observacion") or "")[:300])
            ws.cell(row=pr, column=1, value=r.get("numero_registro")).border = bd
            ws.cell(row=pr, column=2, value=r.get("foto_numero")).border = bd
            ws.merge_cells(start_row=pr, start_column=3, end_row=pr, end_column=8)
            fu_cell = fu if len(fu) < 8000 else fu[:7990] + "…"
            lc = ws.cell(row=pr, column=3, value=fu_cell)
            lc.font = Font(size=8, color="0563C1", underline="single")
            if fu.startswith(("http://", "https://")):
                lc.hyperlink = fu
            lc.alignment = Alignment(wrap_text=True, vertical="top")
            lc.border = bd
            ws.merge_cells(start_row=pr, start_column=9, end_row=pr, end_column=11)
            oc = ws.cell(row=pr, column=9, value=obs_f)
            oc.font = Font(size=8)
            oc.alignment = Alignment(wrap_text=True, vertical="top")
            oc.border = bd
            pr += 1

    sr = pr + 1
    ws.merge_cells(start_row=sr, start_column=1, end_row=sr, end_column=11)
    ws.cell(row=sr, column=1, value="FIRMAS").fill = fill_bar
    ws.cell(row=sr, column=1).font = Font(bold=True, size=9)
    ws.cell(row=sr, column=1).alignment = Alignment(horizontal="center")
    ws.cell(row=sr, column=1).border = bd

    fr0 = sr + 1
    ws.cell(row=fr0, column=1, value="Elaboró:").font = Font(size=8, bold=True)
    ws.merge_cells(start_row=fr0, start_column=2, end_row=fr0, end_column=4)
    ws.cell(row=fr0, column=2, value=f"{elaboro_n}\n{elaboro_c}").alignment = Alignment(wrap_text=True)
    ws.cell(row=fr0, column=2).font = Font(size=8)
    ws.cell(row=fr0, column=5, value="Revisó:").font = Font(size=8, bold=True)
    ws.merge_cells(start_row=fr0, start_column=6, end_row=fr0, end_column=8)
    ws.cell(row=fr0, column=6, value=f"{reviso_n}\n{reviso_c}").alignment = Alignment(wrap_text=True)
    ws.cell(row=fr0, column=6).font = Font(size=8)
    lbl_apro = "Aprobó (interventoría):" if aprobo_interventoria_desde_config else "Aprobó (subcontratista):"
    txt_apro = f"{aprobo_emp}\n{aprobo_rep}" if aprobo_interventoria_desde_config else f"{aprobo_emp}\nRepresentante: {aprobo_rep}"
    ws.cell(row=fr0, column=9, value=lbl_apro).font = Font(size=8, bold=True)
    ws.merge_cells(start_row=fr0, start_column=10, end_row=fr0, end_column=11)
    ws.cell(row=fr0, column=10, value=txt_apro).alignment = Alignment(wrap_text=True)
    ws.cell(row=fr0, column=10).font = Font(size=8)
    for cc in (1, 2, 5, 6, 9, 10):
        ws.cell(row=fr0, column=cc).border = bd

    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = 9
    ws.print_options.horizontalCentered = True


def _memoria_item_excel_bytes(
    contrato: dict,
    sub: dict,
    corte: dict,
    item_info: dict,
    registros: List[dict],
    firma_cfg: Optional[Dict[str, Any]],
) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = _excel_sheet_name(item_info.get("item_numero"))
    _fill_memoria_excel_ws(ws, contrato, sub, corte, item_info, registros, firma_cfg)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _memoria_corte_completo_excel_bytes(
    contrato_id: int,
    corte_id: int,
    numeros: List[str],
    current_user: dict,
    firma_cfg: Optional[Dict[str, Any]],
) -> bytes:
    wb = Workbook()
    first = True
    for item_numero in numeros:
        ctx = _contexto_memoria_item(
            contrato_id, corte_id, item_numero, current_user, item_exacto=True
        )
        contrato = ctx["contrato"]
        sub = ctx["sub"]
        corte = ctx["corte"]
        item_info = ctx["item_info"]
        registros = ctx["registros"]
        if first:
            ws = wb.active
            assert ws is not None
            ws.title = _excel_unique_sheet_name(wb, item_info.get("item_numero"))
            _fill_memoria_excel_ws(ws, contrato, sub, corte, item_info, registros, firma_cfg)
            first = False
        else:
            ws = wb.create_sheet(title=_excel_unique_sheet_name(wb, item_info.get("item_numero")))
            _fill_memoria_excel_ws(ws, contrato, sub, corte, item_info, registros, firma_cfg)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _cc_sem_002_item_excel_bytes(
    contrato_id: int,
    semana_id: int,
    item_numero: str,
    current_user: dict,
) -> bytes:
    """Excel CC-SEM-002 por ítem: mismo contenido lógico que el PDF semanal."""
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    registros = fetch_registros_memoria_conciliacion(
        _sb, contrato_id, item_numero, semana_id=semana_id, item_exacto=True
    )
    if not registros:
        raise HTTPException(404, "No hay registros para este ítem y semana")
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    item_info = {
        "item_numero": registros[0].get("item_numero", item_numero),
        "item_descripcion": registros[0].get("item_descripcion", ""),
        "unidad": registros[0].get("unidad", ""),
    }
    sm = _row("so_semanas", "numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    conc_meta = {
        "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN SEMANAL (INTERVENTORÍA–CONTRATISTA)",
        "codigo": CODIGO_FORMATO_CCD_CC_SEM_002,
        "cells": [
            ("CONTRATO", str(contrato.get("numero") or "")),
            ("SEMANA", f"N° {nsem}"),
            ("VIGENCIA", f"{fi} — {ff}"),
            ("REFERENCIA", "Cantidades ejecutadas — conciliación"),
        ],
    }
    fmt = CODIGO_FORMATO_CCD_CC_SEM_002
    firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
    sub, corte = _sub_corte_dummy_memoria()
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = _excel_sheet_name(item_info.get("item_numero"))
    _fill_memoria_excel_ws(
        ws,
        contrato,
        sub,
        corte,
        item_info,
        registros,
        firma_cfg,
        conc_meta=conc_meta,
        pie_fotos_contexto=f"Semana N° {nsem} · {fi} — {ff}",
        aprobo_interventoria_desde_config=True,
    )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _cc_sem_002_semana_completo_excel_bytes(contrato_id: int, semana_id: int, current_user: dict) -> bytes:
    """Excel CC-SEM-002: una hoja por ítem (misma lógica que PDF completo)."""
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    reg_agg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
    items_agg, _total = aggregate_items_conciliacion(reg_agg)
    _sort_items_corte_por_item_numero_asc(items_agg)
    numeros = [
        (it.get("item_numero") or "").strip()
        for it in items_agg
        if (it.get("item_numero") or "").strip()
    ]
    if not numeros:
        raise HTTPException(404, "No hay registros en esta semana para generar memorias")

    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    sm = _row("so_semanas", "numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    conc_meta = {
        "titulo": "RESUMEN ACTIVIDADES — CONCILIACIÓN SEMANAL (INTERVENTORÍA–CONTRATISTA)",
        "codigo": CODIGO_FORMATO_CCD_CC_SEM_002,
        "cells": [
            ("CONTRATO", str(contrato.get("numero") or "")),
            ("SEMANA", f"N° {nsem}"),
            ("VIGENCIA", f"{fi} — {ff}"),
            ("REFERENCIA", "Cantidades ejecutadas — conciliación"),
        ],
    }
    fmt = CODIGO_FORMATO_CCD_CC_SEM_002
    firma_cfg = _get_ccd_firma_config(contrato_id, fmt)
    sub, corte = _sub_corte_dummy_memoria()
    pie = f"Semana N° {nsem} · {fi} — {ff}"

    wb = Workbook()
    first = True
    for inum in numeros:
        registros = fetch_registros_memoria_conciliacion(
            _sb, contrato_id, inum, semana_id=semana_id, item_exacto=True
        )
        if not registros:
            continue
        item_info = {
            "item_numero": registros[0].get("item_numero", inum),
            "item_descripcion": registros[0].get("item_descripcion", ""),
            "unidad": registros[0].get("unidad", ""),
        }
        if first:
            ws = wb.active
            assert ws is not None
            ws.title = _excel_unique_sheet_name(wb, item_info.get("item_numero"))
            _fill_memoria_excel_ws(
                ws,
                contrato,
                sub,
                corte,
                item_info,
                registros,
                firma_cfg,
                conc_meta=conc_meta,
                pie_fotos_contexto=pie,
                aprobo_interventoria_desde_config=True,
            )
            first = False
        else:
            ws = wb.create_sheet(title=_excel_unique_sheet_name(wb, item_info.get("item_numero")))
            _fill_memoria_excel_ws(
                ws,
                contrato,
                sub,
                corte,
                item_info,
                registros,
                firma_cfg,
                conc_meta=conc_meta,
                pie_fotos_contexto=pie,
                aprobo_interventoria_desde_config=True,
            )
    if first:
        raise HTTPException(404, "No hay registros aprobados por ítem en esta semana")
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _ccd_hex_to_excel_rgb(h: str, default: str = "E8E8E8") -> str:
    t = _sanitize_ccd_hex_color(h, "#" + default).lstrip("#")
    return t if len(t) == 6 else default


def _fill_corte_sub_001_excel_ws(
    ws,
    contrato: dict,
    sub: dict,
    corte: dict,
    items: List[dict],
    total_costo: float,
    usuario_nombre: str,
    usuario_cargo: str,
    firma_cfg: Optional[Dict[str, Any]],
) -> None:
    """Hoja CC-SUB-001: encabezado, tabla de ítems (como PDF), subtotal, firmas, pie."""
    fc = firma_cfg or {}
    est = _merge_estilo_pdf(fc.get("estilo_pdf"), CODIGO_FORMATO_CCD_CC_SUB_001)
    thead_bg = _ccd_hex_to_excel_rgb(est.get("thead_bg"), "E8E8E8")
    row_even = _ccd_hex_to_excel_rgb(est.get("row_even_bg"), "F8FAFC")
    row_odd = _ccd_hex_to_excel_rgb(est.get("row_odd_bg"), "FFFFFF")
    subtotal_bg = _ccd_hex_to_excel_rgb(est.get("subtotal_bg"), "DBEAFE")

    elaboro_n = str(fc.get("elaboro_nombre") or "").strip() or "—"
    elaboro_c = str(fc.get("elaboro_cargo") or "").strip() or "—"
    reviso_n = str(fc.get("reviso_nombre") or "").strip() or "—"
    reviso_c = str(fc.get("reviso_cargo") or "").strip() or "—"
    aprobo_emp = str(sub.get("razon_social") or "").strip() or "—"
    aprobo_rep = str(sub.get("nombre_contacto") or "").strip() or "—"

    thin = Side(style="thin", color="9CA3AF")
    bd = Border(left=thin, right=thin, top=thin, bottom=thin)
    fill_bar = PatternFill("solid", fgColor="E5E7EB")
    fill_th = PatternFill("solid", fgColor=thead_bg)

    for i, w in enumerate([10, 9, 36, 8, 12, 11, 14], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    def meta_row(r: int, label: str, value: object) -> None:
        ws.cell(row=r, column=1, value=label).font = Font(size=8, bold=True, color="374151")
        ws.cell(row=r, column=1).alignment = Alignment(vertical="center")
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
        v = ws.cell(row=r, column=2, value=value if value is not None else "—")
        v.font = Font(size=8)
        v.alignment = Alignment(vertical="center", wrap_text=True)
        ws.cell(row=r, column=1).border = bd
        v.border = bd

    fecha_gen = _fmt_informe_fecha_generacion()
    corte_lbl = _corte_consecutivo_fmt(corte)
    nit_raw = str(contrato.get("nit") or "").strip()
    contratista_val = str(contrato.get("contratista") or "—")
    if nit_raw:
        contratista_val = f"{contratista_val} (NIT: {nit_raw})"
    periodo = f"{_fd(corte.get('fecha_inicio'))} — {_fd(corte.get('fecha_fin'))}"

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=7)
    t1 = ws.cell(row=1, column=1, value="INFORME CORTE DE SUB CONTRATISTA")
    t1.font = Font(bold=True, size=12)
    t1.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    t1.border = bd

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=7)
    t2 = ws.cell(row=2, column=1, value=f"{CODIGO_FORMATO_CCD_CC_SUB_001} · CCD · ClaraCore")
    t2.font = Font(bold=True, size=10, color="1E40AF")
    t2.alignment = Alignment(horizontal="center", vertical="center")
    t2.border = bd

    meta_row(3, "CONTRATO", str(contrato.get("numero") or "—"))
    meta_row(4, "FECHA", fecha_gen)
    meta_row(5, "SUB CONTRATISTA", str(sub.get("razon_social") or "—"))
    meta_row(6, "CORTE N°", corte_lbl)
    meta_row(7, "CONTRATISTA", contratista_val)
    meta_row(8, "INTERVENTORÍA", str(contrato.get("interventoria") or "—"))
    meta_row(9, "PERÍODO DEL CORTE", periodo)

    r0 = 11
    ws.merge_cells(start_row=r0, start_column=1, end_row=r0, end_column=7)
    br = ws.cell(row=r0, column=1, value="CANTIDADES APROBADAS POR ÍTEM")
    br.fill = fill_bar
    br.font = Font(bold=True, size=9)
    br.alignment = Alignment(horizontal="center", vertical="center")
    br.border = bd

    hdr = [
        "CAPÍTULO",
        "ÍTEM",
        "DESCRIPCIÓN",
        "UNIDAD",
        "VALOR UNIT.",
        "CANTIDAD",
        "COSTO DIRECTO",
    ]
    hr = r0 + 1
    for col, h in enumerate(hdr, start=1):
        cell = ws.cell(row=hr, column=col, value=h)
        cell.fill = fill_th
        cell.font = Font(bold=True, size=8)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = bd

    data0 = hr + 1
    item_list = list(items or [])
    for idx, it in enumerate(item_list):
        row = data0 + idx
        cap = (it.get("capitulo") or "").strip() or "—"
        desc = str(it.get("item_descripcion", "") or "").lower()
        bg = row_even if idx % 2 == 0 else row_odd
        vals = [
            cap,
            it.get("item_numero", ""),
            desc,
            it.get("unidad", ""),
            _fm(it.get("vlr_unitario_sub")),
            _fn(it.get("cantidad")),
            _fm(it.get("costo_directo")),
        ]
        for col, v in enumerate(vals, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = bd
            cell.font = Font(size=8)
            cell.fill = PatternFill("solid", fgColor=bg)
            if col == 3:
                cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
            elif col in (5, 6, 7):
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    tot_r = data0 + len(item_list)
    if not item_list:
        ws.merge_cells(start_row=tot_r, start_column=1, end_row=tot_r, end_column=7)
        emp = ws.cell(row=tot_r, column=1, value="Sin ítems con estado Aprobado en este corte.")
        emp.font = Font(size=8, italic=True, color="64748B")
        emp.alignment = Alignment(horizontal="left")
        emp.border = bd
        tot_r += 1

    st_r = tot_r
    ws.merge_cells(start_row=st_r, start_column=1, end_row=st_r, end_column=5)
    s1 = ws.cell(row=st_r, column=1, value="SUB TOTAL:")
    s1.font = Font(bold=True, size=9)
    s1.alignment = Alignment(horizontal="right", vertical="center")
    s1.fill = PatternFill("solid", fgColor=subtotal_bg)
    s1.border = bd
    ws.merge_cells(start_row=st_r, start_column=6, end_row=st_r, end_column=7)
    s2 = ws.cell(row=st_r, column=6, value=_fm(total_costo))
    s2.font = Font(bold=True, size=9)
    s2.alignment = Alignment(horizontal="right", vertical="center")
    s2.fill = PatternFill("solid", fgColor=subtotal_bg)
    s2.border = bd

    sr = st_r + 2
    ws.merge_cells(start_row=sr, start_column=1, end_row=sr, end_column=7)
    ws.cell(row=sr, column=1, value="FIRMAS").fill = fill_bar
    ws.cell(row=sr, column=1).font = Font(bold=True, size=9)
    ws.cell(row=sr, column=1).alignment = Alignment(horizontal="center")
    ws.cell(row=sr, column=1).border = bd

    def firma_block(r: int, lab: str, txt: str) -> None:
        ws.cell(row=r, column=1, value=lab).font = Font(size=8, bold=True)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
        c = ws.cell(row=r, column=2, value=txt)
        c.font = Font(size=8)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=r, column=1).border = bd
        c.border = bd

    firma_block(sr + 1, "Elaboró:", f"{elaboro_n}\n{elaboro_c}")
    firma_block(sr + 2, "Revisó:", f"{reviso_n}\n{reviso_c}")
    firma_block(sr + 3, "Aprobó (subcontratista):", f"{aprobo_emp}\nRepresentante: {aprobo_rep}")

    foot_r = sr + 5
    ws.merge_cells(start_row=foot_r, start_column=1, end_row=foot_r, end_column=7)
    pie = ws.cell(
        row=foot_r,
        column=1,
        value=(
            f"Período del corte: {periodo} · Generado ClaraCore · {usuario_cargo} · {usuario_nombre}"
        ),
    )
    pie.font = Font(size=7, color="64748B")
    pie.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    pie.border = bd

    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = 1
    ws.print_options.horizontalCentered = True


def _corte_sub_001_excel_bytes(
    contrato: dict,
    sub: dict,
    corte: dict,
    items: List[dict],
    total_costo: float,
    usuario_nombre: str,
    usuario_cargo: str,
    firma_cfg: Optional[Dict[str, Any]],
) -> bytes:
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "CC-SUB-001"
    _fill_corte_sub_001_excel_ws(
        ws,
        contrato,
        sub,
        corte,
        items,
        total_costo,
        usuario_nombre,
        usuario_cargo,
        firma_cfg,
    )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _fill_cc_conc_001_excel_ws(
    ws,
    contrato: dict,
    items: List[dict],
    total_costo: float,
    usuario_nombre: str,
    usuario_cargo: str,
    firma_cfg: Optional[Dict[str, Any]],
    *,
    titulo_documento: str,
    codigo_ccd: str,
    c3_label: str,
    c3_value: str,
    c4_label: str,
    c4_value: str,
    pie_contexto: str,
) -> None:
    """Hoja tipo CC-SEM-001 / CC-MES-001: encabezado conciliación, tabla de ítems, subtotal, firmas interventoría."""
    fc = firma_cfg or {}
    est = _merge_estilo_pdf(fc.get("estilo_pdf"), codigo_ccd)
    thead_bg = _ccd_hex_to_excel_rgb(est.get("thead_bg"), "E8E8E8")
    row_even = _ccd_hex_to_excel_rgb(est.get("row_even_bg"), "F8FAFC")
    row_odd = _ccd_hex_to_excel_rgb(est.get("row_odd_bg"), "FFFFFF")
    subtotal_bg = _ccd_hex_to_excel_rgb(est.get("subtotal_bg"), "DBEAFE")
    cap_sub_bg = _ccd_hex_to_excel_rgb(est.get("capitulo_subtotal_bg"), "93C5FD")

    elaboro_n = str(fc.get("elaboro_nombre") or "").strip() or "—"
    elaboro_c = str(fc.get("elaboro_cargo") or "").strip() or "—"
    reviso_n = str(fc.get("reviso_nombre") or "").strip() or "—"
    reviso_c = str(fc.get("reviso_cargo") or "").strip() or "—"
    aprobo_n = str(fc.get("aprobo_nombre") or "").strip() or "—"
    aprobo_c = str(fc.get("aprobo_cargo") or "").strip() or "—"

    thin = Side(style="thin", color="9CA3AF")
    bd = Border(left=thin, right=thin, top=thin, bottom=thin)
    fill_bar = PatternFill("solid", fgColor="E5E7EB")
    fill_th = PatternFill("solid", fgColor=thead_bg)

    for i, w in enumerate([10, 9, 36, 8, 12, 11, 14], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    def meta_row(r: int, label: str, value: object) -> None:
        ws.cell(row=r, column=1, value=label).font = Font(size=8, bold=True, color="374151")
        ws.cell(row=r, column=1).alignment = Alignment(vertical="center")
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
        v = ws.cell(row=r, column=2, value=value if value is not None else "—")
        v.font = Font(size=8)
        v.alignment = Alignment(vertical="center", wrap_text=True)
        ws.cell(row=r, column=1).border = bd
        v.border = bd

    fecha_gen = _fmt_informe_fecha_generacion()
    nit_raw = str(contrato.get("nit") or "").strip()
    contratista_val = str(contrato.get("contratista") or "—")
    if nit_raw:
        contratista_val = f"{contratista_val} (NIT: {nit_raw})"

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=7)
    t1 = ws.cell(row=1, column=1, value=str(titulo_documento or "").strip() or "—")
    t1.font = Font(bold=True, size=11)
    t1.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    t1.border = bd

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=7)
    t2 = ws.cell(row=2, column=1, value=f"{codigo_ccd} · CCD · ClaraCore")
    t2.font = Font(bold=True, size=10, color="1E40AF")
    t2.alignment = Alignment(horizontal="center", vertical="center")
    t2.border = bd

    meta_row(3, "CONTRATO", str(contrato.get("numero") or "—"))
    meta_row(4, "FECHA", fecha_gen)
    meta_row(5, str(c3_label or "").strip() or "—", str(c3_value or "").strip() or "—")
    meta_row(6, str(c4_label or "").strip() or "—", str(c4_value or "").strip() or "—")
    meta_row(7, "CONTRATISTA", contratista_val)
    meta_row(8, "INTERVENTORÍA", str(contrato.get("interventoria") or "—"))

    r0 = 10
    ws.merge_cells(start_row=r0, start_column=1, end_row=r0, end_column=7)
    br = ws.cell(row=r0, column=1, value="CANTIDADES APROBADAS POR ÍTEM")
    br.fill = fill_bar
    br.font = Font(bold=True, size=9)
    br.alignment = Alignment(horizontal="center", vertical="center")
    br.border = bd

    hdr = [
        "CAPÍTULO",
        "ÍTEM",
        "DESCRIPCIÓN",
        "UNIDAD",
        "VALOR UNIT.",
        "CANTIDAD",
        "COSTO DIRECTO",
    ]
    hr = r0 + 1
    for col, h in enumerate(hdr, start=1):
        cell = ws.cell(row=hr, column=col, value=h)
        cell.fill = fill_th
        cell.font = Font(bold=True, size=8)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = bd

    data0 = hr + 1
    item_list = list(items or [])
    row = data0
    data_idx = 0
    if not item_list:
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
        emp = ws.cell(row=row, column=1, value="Sin registros nivel 3 aprobados para este filtro.")
        emp.font = Font(size=8, italic=True, color="64748B")
        emp.alignment = Alignment(horizontal="left")
        emp.border = bd
        row += 1
    else:
        i = 0
        while i < len(item_list):
            cap = _capitulo_norm_conc(item_list[i])
            j = i
            sub_sum = 0.0
            while j < len(item_list) and _capitulo_norm_conc(item_list[j]) == cap:
                it = item_list[j]
                cap_cell = (it.get("capitulo") or "").strip() or "—"
                desc = str(it.get("item_descripcion", "") or "").lower()
                vu = it.get("vlr_unitario")
                if vu is None:
                    vu = it.get("vlr_unitario_sub")
                bg = row_even if data_idx % 2 == 0 else row_odd
                vals = [
                    cap_cell,
                    it.get("item_numero", ""),
                    desc,
                    it.get("unidad", ""),
                    _fm(vu),
                    _fn(it.get("cantidad")),
                    _fm(it.get("costo_directo")),
                ]
                for col, v in enumerate(vals, start=1):
                    cell = ws.cell(row=row, column=col, value=v)
                    cell.border = bd
                    cell.font = Font(size=8)
                    cell.fill = PatternFill("solid", fgColor=bg)
                    if col == 3:
                        cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
                    elif col in (5, 6, 7):
                        cell.alignment = Alignment(horizontal="right", vertical="center")
                    else:
                        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                sub_sum += _sf(it.get("costo_directo"))
                data_idx += 1
                row += 1
                j += 1
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
            cs1 = ws.cell(row=row, column=1, value=f"Subtotal capítulo — {cap}")
            cs1.font = Font(bold=True, size=8)
            cs1.alignment = Alignment(horizontal="right", vertical="center")
            cs1.fill = PatternFill("solid", fgColor=cap_sub_bg)
            cs1.border = bd
            ws.merge_cells(start_row=row, start_column=6, end_row=row, end_column=7)
            cs2 = ws.cell(row=row, column=6, value=_fm(sub_sum))
            cs2.font = Font(bold=True, size=9)
            cs2.alignment = Alignment(horizontal="right", vertical="center")
            cs2.fill = PatternFill("solid", fgColor=cap_sub_bg)
            cs2.border = bd
            row += 1
            i = j

    tot_r = row
    st_r = tot_r
    ws.merge_cells(start_row=st_r, start_column=1, end_row=st_r, end_column=5)
    s1 = ws.cell(row=st_r, column=1, value="SUB TOTAL:")
    s1.font = Font(bold=True, size=9)
    s1.alignment = Alignment(horizontal="right", vertical="center")
    s1.fill = PatternFill("solid", fgColor=subtotal_bg)
    s1.border = bd
    ws.merge_cells(start_row=st_r, start_column=6, end_row=st_r, end_column=7)
    s2 = ws.cell(row=st_r, column=6, value=_fm(total_costo))
    s2.font = Font(bold=True, size=9)
    s2.alignment = Alignment(horizontal="right", vertical="center")
    s2.fill = PatternFill("solid", fgColor=subtotal_bg)
    s2.border = bd

    sr = st_r + 2
    ws.merge_cells(start_row=sr, start_column=1, end_row=sr, end_column=7)
    ws.cell(row=sr, column=1, value="FIRMAS").fill = fill_bar
    ws.cell(row=sr, column=1).font = Font(bold=True, size=9)
    ws.cell(row=sr, column=1).alignment = Alignment(horizontal="center")
    ws.cell(row=sr, column=1).border = bd

    def firma_block(r: int, lab: str, txt: str) -> None:
        ws.cell(row=r, column=1, value=lab).font = Font(size=8, bold=True)
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=7)
        c = ws.cell(row=r, column=2, value=txt)
        c.font = Font(size=8)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.cell(row=r, column=1).border = bd
        c.border = bd

    firma_block(sr + 1, "Elaboró:", f"{elaboro_n}\n{elaboro_c}")
    firma_block(sr + 2, "Revisó:", f"{reviso_n}\n{reviso_c}")
    firma_block(sr + 3, "Aprobó (interventoría):", f"{aprobo_n}\n{aprobo_c}")

    foot_r = sr + 5
    ws.merge_cells(start_row=foot_r, start_column=1, end_row=foot_r, end_column=7)
    pie = ws.cell(
        row=foot_r,
        column=1,
        value=f"{pie_contexto} · Generado ClaraCore · {usuario_cargo} · {usuario_nombre}",
    )
    pie.font = Font(size=7, color="64748B")
    pie.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    pie.border = bd

    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = 1
    ws.print_options.horizontalCentered = True


def _cc_sem_001_excel_bytes(contrato_id: int, semana_id: int, current_user: dict) -> bytes:
    if not _semana_pertenece_contrato(contrato_id, semana_id):
        raise HTTPException(404, "Semana no encontrada en este contrato")
    reg = fetch_registros_conciliacion(_sb, contrato_id, semana_id=semana_id)
    items, total = aggregate_items_conciliacion(reg)
    _sort_items_corte_por_item_numero_asc(items)
    sm = _row("so_semanas", "id, numero_semana, fecha_inicio, fecha_fin", id=semana_id) or {}
    nsem = sm.get("numero_semana")
    fi = str(sm.get("fecha_inicio") or "—")
    ff = str(sm.get("fecha_fin") or "—")
    contrato = _row(
        "contratos",
        "numero, objeto, contratista, nit, interventoria, logo_contratista",
        id=contrato_id,
    )
    if not contrato:
        raise HTTPException(404, "Contrato no encontrado")
    u = current_user if isinstance(current_user, dict) else dict(current_user)
    usuario_nombre = f"{u.get('nombre','')} {u.get('apellidos','')}".strip() or "—"
    usuario_cargo = u.get("cargo_nombre", "—") or "—"
    firma_cfg = _get_ccd_firma_config(contrato_id, CODIGO_FORMATO_CCD_CC_SEM_001)
    wb = Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "CC-SEM-001"
    _fill_cc_conc_001_excel_ws(
        ws,
        contrato,
        items,
        float(total or 0.0),
        usuario_nombre,
        usuario_cargo,
        firma_cfg,
        titulo_documento="INFORME EJECUCIÓN SEMANAL (CONCILIACIÓN INTERVENTORÍA–CONTRATISTA)",
        codigo_ccd=CODIGO_FORMATO_CCD_CC_SEM_001,
        c3_label="SEMANA",
        c3_value=f"N° {nsem}",
        c4_label="VIGENCIA",
        c4_value=f"{fi} — {ff}",
        pie_contexto=f"Semana N° {nsem} · {fi} — {ff} · Registros nivel 3 aprobados y bloqueados",
    )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# Objetivo: ~26 ítems en la 1ª hoja (con encabezado + subtotal + firmas sin página casi vacía).
_CC_SUB_001_ROWS_PAGINA_1 = 26
_CC_SUB_001_ROWS_PAGINA_SIG = 32


def _cc_sub_001_chunk_items(items: List[dict]) -> List[List[dict]]:
    if not items:
        return [[]]
    out: List[List[dict]] = []
    i = 0
    out.append(items[i : i + _CC_SUB_001_ROWS_PAGINA_1])
    i += _CC_SUB_001_ROWS_PAGINA_1
    while i < len(items):
        out.append(items[i : i + _CC_SUB_001_ROWS_PAGINA_SIG])
        i += _CC_SUB_001_ROWS_PAGINA_SIG
    return out


def _html_cc_sub_001_tr_item(item: dict, bd: str, row_bg: str = "") -> str:
    cap = (item.get("capitulo") or "").strip() or "—"
    desc = str(item.get("item_descripcion", "") or "").lower()
    trs = f"background:{row_bg};" if row_bg else ""
    return (
        f"<tr style=\"{trs}\">"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;vertical-align:top\">{_h(cap)}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;vertical-align:top\">{_h(item.get('item_numero', ''))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:left\">{_h(desc)}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:center\">{_h(item.get('unidad', ''))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fm(item.get('vlr_unitario_sub'))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fn(item.get('cantidad'))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fm(item.get('costo_directo'))}</td>"
        "</tr>"
    )


def _html_cc_sub_001_thead_items(bd: str, thead_bg: str) -> str:
    th = _sanitize_ccd_hex_color(thead_bg, "#e8e8e8")
    return f"""<thead>
<tr style="background:{th};">
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:16%;">CAPITULO</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:8%;">ITEM</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:left;width:40%;">DESCRIPCIÓN</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:6%;">UNIDAD</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:10%;">VALOR UNIT.</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:9%;">CANTIDAD</th>
<th style="{bd};padding:3px 2px;font-size:6.5pt;font-weight:bold;text-align:center;width:11%;">COSTO DIR</th>
</tr>
</thead>"""

# Área de imagen de firma en PDFs CCD (~1,5 cm). xhtml2pdf respeta mejor pt que cm; altura fija en <td>
# evita que una columna estire TODA la fila de las tres firmas.
_CCD_FIRMA_BOX_PT = "28pt"  # ≈ 1 cm (más compacto que 42pt)
_CCD_FIRMA_IMG_INNER_PT = "26pt"
# Memorias CC-SUB-002 / CC-SEM / CC-MES (landscape): fila de firmas más baja que CC-SUB-001.
_CCD_FIRMA_MEM002_BOX_PT = "22pt"
_CCD_FIRMA_MEM002_IMG_INNER_PT = "20pt"


def _html_cc_sub_td_firma_columna(
    bd: str,
    etiqueta_hdr: str,
    nombre_h: str,
    cargo_h: str,
    firma_data_uri: Optional[str],
    *,
    memoria_compact: bool = False,
) -> str:
    """Una columna Elaboró o Revisó; si hay data URI, tabla con altura fija + img acotada (evita fila de firmas gigante)."""
    td_pad = "padding:1px 3px" if memoria_compact else "padding:3px 5px"
    fs = "6pt" if memoria_compact else "6.5pt"
    img_marg = "margin:0" if memoria_compact else "margin:1px 0 2px 0"
    if firma_data_uri:
        bp = _CCD_FIRMA_MEM002_BOX_PT if memoria_compact else _CCD_FIRMA_BOX_PT
        ip = _CCD_FIRMA_MEM002_IMG_INNER_PT if memoria_compact else _CCD_FIRMA_IMG_INNER_PT
        return f"""<td style="width:33.33%;{bd};{td_pad};font-size:{fs};vertical-align:top;">
<div class="ccd-firma-slot-hdr">{etiqueta_hdr}</div>
<div class="ccd-firma-line"></div>
<table class="ccd-firma-img-cage" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;table-layout:fixed;{img_marg};">
<tr><td style="height:{bp};max-height:{bp};min-height:{bp};overflow:hidden;vertical-align:middle;text-align:center;line-height:0;font-size:0;padding:0;border:none;">
<img src="{firma_data_uri}" alt="" style="display:block;margin:0 auto;max-width:100%;width:auto;height:{ip};max-height:{ip};border:0;padding:0;"/>
</td></tr>
</table>
<div class="ccd-firma-nombre">{nombre_h}</div>
<div class="ccd-firma-cargo">{cargo_h}</div>
</td>"""
    return f"""<td style="width:33.33%;{bd};{td_pad};font-size:{fs};vertical-align:top;">
<div class="ccd-firma-slot-hdr">{etiqueta_hdr}</div>
<div class="ccd-firma-slot-body">
<div class="ccd-firma-line"></div>
<div class="ccd-firma-nombre">{nombre_h}</div>
<div class="ccd-firma-cargo">{cargo_h}</div>
</div>
</td>"""


def _html_cc_sub_v1_plain(
    contrato,
    sub,
    corte,
    items,
    total_costo,
    usuario_nombre,
    usuario_cargo,
    firma_cfg: Optional[Dict[str, Any]] = None,
    elaboro_firma_data_uri: Optional[str] = None,
    reviso_firma_data_uri: Optional[str] = None,
) -> str:
    """CC-SUB-001: encabezado solo 1ª hoja; ítems paginados; firmas al cierre (Elaboró/Revisó configurables; Aprobó desde subcontratista)."""
    bd = "border:1px solid #9ca3af"
    bd_blk = "border:1px solid #1f2937"
    codigo_ccd = CODIGO_FORMATO_CCD_CC_SUB_001
    logo_html = _html_logo_contratista(contrato)
    fecha_gen = _fmt_informe_fecha_generacion()
    corte_lbl = _corte_consecutivo_fmt(corte)
    contratista_nom = _h(str(contrato.get("contratista") or ""))
    interv = _h(str(contrato.get("interventoria") or ""))
    nit_raw = str(contrato.get("nit") or "").strip()
    nit_en_valor = f' <span style="font-size:6.5pt;color:#444;">(NIT: {_h(nit_raw)})</span>' if nit_raw else ""
    fc = firma_cfg or {}
    est = _merge_estilo_pdf(fc.get("estilo_pdf"), CODIGO_FORMATO_CCD_CC_SUB_001)
    elaboro_n = _h(str(fc.get("elaboro_nombre") or "").strip() or "—")
    elaboro_c = _h(str(fc.get("elaboro_cargo") or "").strip() or "—")
    reviso_n = _h(str(fc.get("reviso_nombre") or "").strip() or "—")
    reviso_c = _h(str(fc.get("reviso_cargo") or "").strip() or "—")
    aprobo_empresa = _h(str(sub.get("razon_social") or "").strip() or "—")
    aprobo_rep = _h(str(sub.get("nombre_contacto") or "").strip() or "—")
    lbl = "font-size:6pt;font-weight:bold;color:#111;text-transform:uppercase;letter-spacing:0.2px;"
    und = "border-bottom:1px solid #1f2937;font-size:7pt;padding:1px 0 2px 0;margin-top:1px;"

    chunks = _cc_sub_001_chunk_items(list(items or []))
    nchunks = len(chunks)

    parts: list[str] = []
    parts.append(f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:pdf="http://www.xhtml2pdf.org/pdf">
<head><meta charset="UTF-8"/><title>{_h(codigo_ccd)}</title>
<style type="text/css">
@page {{ size: letter; margin: 8mm 10mm; }}
.cc001-tabla-items {{ width:100%; border-collapse:collapse; table-layout:fixed; }}
.cc001-tabla-items thead {{ display: table-header-group; }}
.ccd-cc001-firmas-wrap {{ margin-top: 5mm; page-break-inside: avoid; }}
.ccd-cc001-firmas-tbl {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
.ccd-cc001-firmas-tbl td {{ vertical-align: top; }}
/* Altura fija por columna (0.75cm, mitad de 1.5cm); overflow recorta texto muy largo. */
.ccd-firma-slot-hdr {{ font-weight: bold; font-size: 6.5pt; margin: 0 0 1px 0; padding: 0; color: #111; line-height: 1.1; }}
.ccd-firma-slot-body {{
  height: 0.75cm;
  min-height: 0.75cm;
  max-height: 0.75cm;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}}
/* xhtml2pdf: un div vacío con solo border-top a veces ocupa toda la altura del padre; forzar altura 0. */
.ccd-firma-line {{
  border: none;
  border-top: 1px solid #111;
  width: 100%;
  height: 0;
  line-height: 0;
  font-size: 0;
  margin: 0 0 2px 0;
  padding: 0;
  overflow: hidden;
}}
.ccd-firma-nombre {{ font-weight: bold; font-size: 7pt; line-height: 1.1; margin: 1px 0 0 0; padding: 0; word-wrap: break-word; }}
.ccd-firma-cargo {{ font-size: 6.5pt; color: #444; line-height: 1.08; margin: 0; padding: 0; word-wrap: break-word; }}
.ccd-firma-rep {{ font-size: 6.5pt; color: #333; line-height: 1.1; margin: 1px 0 0 0; padding: 0; word-wrap: break-word; }}
/* Refuerzo: tabla .ccd-firma-img-cage (altura en línea en el HTML). */
.ccd-firma-img-cage td {{
  overflow: hidden !important;
  padding: 0 !important;
}}
.ccd-firma-img-cage img {{
  max-width: 100% !important;
  height: {_CCD_FIRMA_IMG_INNER_PT} !important;
  max-height: {_CCD_FIRMA_IMG_INNER_PT} !important;
  width: auto !important;
  display: block !important;
  margin: 0 auto !important;
}}
</style></head>
<body style="margin:0;padding:4px;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#111;">
""")

    # ── Bloque encabezado (solo antes del primer corte de tabla de ítems = primera hoja) ──
    parts.append(f"""
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd_blk};table-layout:fixed;">
<tr>
<td style="width:20%;{bd_blk};vertical-align:middle;padding:2px;text-align:center;background:#fff">
{logo_html}
</td>
<td style="width:48%;{bd_blk};vertical-align:middle;text-align:center;font-weight:bold;font-size:8.2pt;padding:3px 5px;line-height:1.1;height:32px;">
INFORME CORTE DE SUB CONTRATISTA
</td>
<td style="width:32%;{bd_blk};vertical-align:middle;text-align:center;padding:3px 5px;">
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
</table>
""")

    for ci, chunk in enumerate(chunks):
        if ci > 0:
            parts.append('<pdf:nextpage />')
        parts.append(f'<table class="cc001-tabla-items" cellspacing="0" cellpadding="0">')
        parts.append(_html_cc_sub_001_thead_items(bd, est["thead_bg"]))
        parts.append("<tbody>")
        if not chunk and not items:
            parts.append(
                f"<tr><td colspan=\"7\" style=\"{bd};padding:5px;font-size:7pt;color:#6b7280\">"
                "Sin ítems con estado Aprobado en este corte.</td></tr>"
            )
        else:
            for idx, it in enumerate(chunk):
                row_bg = est["row_even_bg"] if idx % 2 == 0 else est["row_odd_bg"]
                parts.append(_html_cc_sub_001_tr_item(it, bd, row_bg))
        if ci == nchunks - 1:
            st = _sanitize_ccd_hex_color(est.get("subtotal_bg"), "#dbeafe")
            parts.append(
                f"""<tr style="background:{st};">
<td colspan="5" style="{bd};text-align:right;padding:4px 6px;font-weight:bold;font-size:7.5pt;">SUB TOTAL:</td>
<td colspan="2" style="{bd};text-align:right;padding:4px 6px;font-weight:bold;font-size:7.5pt;">{_fm(total_costo)}</td>
</tr>"""
            )
        parts.append("</tbody></table>")

    elaboro_td = _html_cc_sub_td_firma_columna(bd, "Elaboró:", elaboro_n, elaboro_c, elaboro_firma_data_uri)
    reviso_td = _html_cc_sub_td_firma_columna(bd, "Revisó:", reviso_n, reviso_c, reviso_firma_data_uri)

    # Firmas: solo tras cerrar la última tabla de ítems (última hoja). Izq=Elaboró, Centro=Revisó, Der=Aprobó (datos del sub en módulo administrativo).
    parts.append(f"""
<div class="ccd-cc001-firmas-wrap">
<table class="ccd-cc001-firmas-tbl" cellspacing="0" cellpadding="0">
<tr>
{elaboro_td}
{reviso_td}
<td style="width:33.33%;{bd};padding:3px 5px;font-size:6.5pt;vertical-align:top;">
<div class="ccd-firma-slot-hdr">Aprobó:</div>
<div class="ccd-firma-slot-body">
<div class="ccd-firma-line"></div>
<div class="ccd-firma-nombre">{aprobo_empresa}</div>
<div class="ccd-firma-rep">Representante: {aprobo_rep}</div>
</div>
</td>
</tr>
</table>
</div>
<p style="font-size:6pt;color:#64748b;margin-top:6px;text-align:center;">
Período del corte: {_h(_fd(corte.get('fecha_inicio')))} — {_h(_fd(corte.get('fecha_fin')))} · Generado ClaraCore · {_h(usuario_cargo)} · Sesión: {_h(usuario_nombre)}
</p>
</body></html>""")
    return "".join(parts)


def _capitulo_norm_conc(it: dict) -> str:
    return (it.get("capitulo") or "").strip() or "—"


def _cc_conc_plan_filas_con_subtotal_capitulo(items: List[dict]) -> List[tuple]:
    """Secuencia de filas: ('item', item, idx_paridad) o ('subcap', etiqueta_corta, total_costo_directo)."""
    items = list(items or [])
    if not items:
        return []
    out: List[tuple] = []
    idx = 0
    i = 0
    while i < len(items):
        cap = _capitulo_norm_conc(items[i])
        j = i
        tot = 0.0
        while j < len(items) and _capitulo_norm_conc(items[j]) == cap:
            tot += _sf(items[j].get("costo_directo"))
            out.append(("item", items[j], idx))
            idx += 1
            j += 1
        short = cap if len(cap) <= 56 else (cap[:53] + "…")
        out.append(("subcap", short, tot))
        i = j
    return out


def _html_cc_conc_001_tr_subtotal_capitulo(bd: str, cap_etiqueta: str, sum_cd: float, bg_hex: str) -> str:
    st = _sanitize_ccd_hex_color(bg_hex, "#93c5fd")
    return (
        f'<tr class="cc001-cap-sub" style="background:{st};">'
        f'<td colspan="5" style="{bd};padding:3px 6px;font-size:7pt;font-weight:bold;text-align:right;vertical-align:middle">'
        f"Subtotal capítulo — {_h(cap_etiqueta)}</td>"
        f'<td colspan="2" style="{bd};padding:3px 6px;font-size:7.5pt;font-weight:bold;text-align:right;vertical-align:middle">'
        f"{_fm(sum_cd)}</td>"
        "</tr>"
    )


def _html_cc_conc_001_tr_item(item: dict, bd: str, row_bg: str = "") -> str:
    cap = (item.get("capitulo") or "").strip() or "—"
    desc = str(item.get("item_descripcion", "") or "").lower()
    trs = f"background:{row_bg};" if row_bg else ""
    vu = item.get("vlr_unitario")
    if vu is None:
        vu = item.get("vlr_unitario_sub")
    return (
        f"<tr style=\"{trs}\">"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;vertical-align:top\">{_h(cap)}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;vertical-align:top\">{_h(item.get('item_numero', ''))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:left\">{_h(desc)}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:center\">{_h(item.get('unidad', ''))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fm(vu)}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fn(item.get('cantidad'))}</td>"
        f"<td style=\"{bd};padding:2px 3px;font-size:7pt;text-align:right\">{_fm(item.get('costo_directo'))}</td>"
        "</tr>"
    )


def _html_cc_conciliacion_informe_v1(
    contrato,
    items,
    total_costo,
    usuario_nombre,
    usuario_cargo,
    *,
    codigo_ccd: str,
    titulo_documento: str,
    c3_label: str,
    c3_value: str,
    c4_label: str,
    c4_value: str,
    pie_contexto: str,
    firma_cfg: Optional[Dict[str, Any]],
    elaboro_firma_data_uri: Optional[str],
    reviso_firma_data_uri: Optional[str],
    aprobo_firma_data_uri: Optional[str],
    estilo_formato_codigo: str,
) -> str:
    """Informe tipo CC-SEM-001 / CC-MES-001: sin subcontratista; Aprobó interventoría con firma opcional."""
    bd = "border:1px solid #9ca3af"
    bd_blk = "border:1px solid #1f2937"
    logo_html = _html_logo_contratista(contrato)
    fecha_gen = _fmt_informe_fecha_generacion()
    contratista_nom = _h(str(contrato.get("contratista") or ""))
    interv = _h(str(contrato.get("interventoria") or ""))
    nit_raw = str(contrato.get("nit") or "").strip()
    nit_en_valor = f' <span style="font-size:6.5pt;color:#444;">(NIT: {_h(nit_raw)})</span>' if nit_raw else ""
    fc = firma_cfg or {}
    est = _merge_estilo_pdf(fc.get("estilo_pdf"), estilo_formato_codigo)
    elaboro_n = _h(str(fc.get("elaboro_nombre") or "").strip() or "—")
    elaboro_c = _h(str(fc.get("elaboro_cargo") or "").strip() or "—")
    reviso_n = _h(str(fc.get("reviso_nombre") or "").strip() or "—")
    reviso_c = _h(str(fc.get("reviso_cargo") or "").strip() or "—")
    aprobo_n = _h(str(fc.get("aprobo_nombre") or "").strip() or "—")
    aprobo_c = _h(str(fc.get("aprobo_cargo") or "").strip() or "—")
    lbl = "font-size:6pt;font-weight:bold;color:#111;text-transform:uppercase;letter-spacing:0.2px;"
    und = "border-bottom:1px solid #1f2937;font-size:7pt;padding:1px 0 2px 0;margin-top:1px;"
    plan = _cc_conc_plan_filas_con_subtotal_capitulo(list(items or []))
    cap_st_bg = est.get("capitulo_subtotal_bg") or "#93c5fd"
    parts: list[str] = []
    parts.append(f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:pdf="http://www.xhtml2pdf.org/pdf">
<head><meta charset="UTF-8"/><title>{_h(codigo_ccd)}</title>
<style type="text/css">
@page {{ size: letter; margin: 8mm 10mm; }}
.cc001-tabla-items {{ width:100%; border-collapse:collapse; table-layout:fixed; }}
.cc001-tabla-items thead {{ display: table-header-group; }}
.cc001-tabla-items tr.cc001-cap-sub {{ page-break-inside: avoid; }}
.cc001-tabla-items tr.cc001-grand-sub {{ page-break-inside: avoid; }}
.ccd-cc001-firmas-wrap {{ margin-top: 5mm; page-break-inside: avoid; }}
.ccd-cc001-firmas-tbl {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
.ccd-cc001-firmas-tbl td {{ vertical-align: top; }}
.ccd-firma-slot-hdr {{ font-weight: bold; font-size: 6.5pt; margin: 0 0 1px 0; padding: 0; color: #111; line-height: 1.1; }}
.ccd-firma-slot-body {{
  height: 0.75cm;
  min-height: 0.75cm;
  max-height: 0.75cm;
  overflow: hidden;
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}}
.ccd-firma-line {{
  border: none;
  border-top: 1px solid #111;
  width: 100%;
  height: 0;
  line-height: 0;
  font-size: 0;
  margin: 0 0 2px 0;
  padding: 0;
  overflow: hidden;
}}
.ccd-firma-nombre {{ font-weight: bold; font-size: 7pt; line-height: 1.1; margin: 1px 0 0 0; padding: 0; word-wrap: break-word; }}
.ccd-firma-cargo {{ font-size: 6.5pt; color: #444; line-height: 1.08; margin: 0; padding: 0; word-wrap: break-word; }}
.ccd-firma-img-cage td {{
  overflow: hidden !important;
  padding: 0 !important;
}}
.ccd-firma-img-cage img {{
  max-width: 100% !important;
  height: {_CCD_FIRMA_IMG_INNER_PT} !important;
  max-height: {_CCD_FIRMA_IMG_INNER_PT} !important;
  width: auto !important;
  display: block !important;
  margin: 0 auto !important;
}}
</style></head>
<body style="margin:0;padding:4px;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#111;">
""")
    parts.append(f"""
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;{bd_blk};table-layout:fixed;">
<tr>
<td style="width:20%;{bd_blk};vertical-align:middle;padding:2px;text-align:center;background:#fff">
{logo_html}
</td>
<td style="width:48%;{bd_blk};vertical-align:middle;text-align:center;font-weight:bold;font-size:8.2pt;padding:3px 5px;line-height:1.1;height:32px;">
{_h(titulo_documento)}
</td>
<td style="width:32%;{bd_blk};vertical-align:middle;text-align:center;padding:3px 5px;">
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
<div style="{lbl}">{_h(c3_label)}</div>
<div style="{und}">{_h(c3_value)}</div>
</td>
<td style="width:25%;padding:0 0 2px 0;border:none;vertical-align:top;">
<div style="{lbl}">{_h(c4_label)}</div>
<div style="{und}">{_h(c4_value)}</div>
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
</table>
""")
    parts.append('<table class="cc001-tabla-items" cellspacing="0" cellpadding="0">')
    parts.append(_html_cc_sub_001_thead_items(bd, est["thead_bg"]))
    parts.append("<tbody>")
    if not items:
        parts.append(
            f"<tr><td colspan=\"7\" style=\"{bd};padding:5px;font-size:7pt;color:#6b7280\">"
            "Sin registros nivel 3 aprobados (y bloqueados) para este filtro.</td></tr>"
        )
    else:
        for row in plan:
            if row[0] == "item":
                _, it, idx = row
                row_bg = est["row_even_bg"] if idx % 2 == 0 else est["row_odd_bg"]
                parts.append(_html_cc_conc_001_tr_item(it, bd, row_bg))
            else:
                _, cap_lab, sub_amt = row
                parts.append(_html_cc_conc_001_tr_subtotal_capitulo(bd, cap_lab, sub_amt, cap_st_bg))
        st = _sanitize_ccd_hex_color(est.get("subtotal_bg"), "#dbeafe")
        parts.append(
            f"""<tr class="cc001-grand-sub" style="background:{st};">
<td colspan="5" style="{bd};text-align:right;padding:4px 6px;font-weight:bold;font-size:7.5pt;">SUB TOTAL:</td>
<td colspan="2" style="{bd};text-align:right;padding:4px 6px;font-weight:bold;font-size:7.5pt;">{_fm(total_costo)}</td>
</tr>"""
        )
    parts.append("</tbody></table>")
    elaboro_td = _html_cc_sub_td_firma_columna(bd, "Elaboró:", elaboro_n, elaboro_c, elaboro_firma_data_uri)
    reviso_td = _html_cc_sub_td_firma_columna(bd, "Revisó:", reviso_n, reviso_c, reviso_firma_data_uri)
    aprobo_td = _html_cc_sub_td_firma_columna(bd, "Aprobó:", aprobo_n, aprobo_c, aprobo_firma_data_uri)
    parts.append(f"""
<div class="ccd-cc001-firmas-wrap">
<table class="ccd-cc001-firmas-tbl" cellspacing="0" cellpadding="0">
<tr>
{elaboro_td}
{reviso_td}
{aprobo_td}
</tr>
</table>
</div>
<p style="font-size:6pt;color:#64748b;margin-top:6px;text-align:center;">
{_h(pie_contexto)} · Generado ClaraCore · {_h(usuario_cargo)} · Sesión: {_h(usuario_nombre)}
</p>
</body></html>""")
    return "".join(parts)


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


def _html_mem002_bloque_firmas(
    sub: dict,
    firma_cfg: Optional[Dict[str, Any]],
    elaboro_firma_data_uri: Optional[str] = None,
    reviso_firma_data_uri: Optional[str] = None,
    *,
    aprobo_firma_data_uri: Optional[str] = None,
    aprobo_interventoria_desde_config: bool = False,
) -> str:
    """Tres columnas Elaboró / Revisó / Aprobó: subcontratista (CC-SUB) o interventoría desde biblioteca (CC-SEM/MES)."""
    fc = firma_cfg or {}
    elaboro_n = _h(str(fc.get("elaboro_nombre") or "").strip() or "—")
    elaboro_c = _h(str(fc.get("elaboro_cargo") or "").strip() or "—")
    reviso_n = _h(str(fc.get("reviso_nombre") or "").strip() or "—")
    reviso_c = _h(str(fc.get("reviso_cargo") or "").strip() or "—")
    bd = "border:1px solid #9ca3af"
    elaboro_td = _html_cc_sub_td_firma_columna(
        bd, "Elaboró:", elaboro_n, elaboro_c, elaboro_firma_data_uri, memoria_compact=True
    )
    reviso_td = _html_cc_sub_td_firma_columna(
        bd, "Revisó:", reviso_n, reviso_c, reviso_firma_data_uri, memoria_compact=True
    )
    if aprobo_interventoria_desde_config:
        aprobo_n = _h(str(fc.get("aprobo_nombre") or "").strip() or "—")
        aprobo_c = _h(str(fc.get("aprobo_cargo") or "").strip() or "—")
        aprobo_td = _html_cc_sub_td_firma_columna(
            bd, "Aprobó:", aprobo_n, aprobo_c, aprobo_firma_data_uri, memoria_compact=True
        )
    else:
        aprobo_empresa = _h(str(sub.get("razon_social") or "").strip() or "—")
        aprobo_rep = _h(str(sub.get("nombre_contacto") or "").strip() or "—")
        aprobo_td = f"""<td style="width:33.33%;{bd};padding:1px 3px;font-size:6pt;vertical-align:top;">
<div class="mem002-firma-slot-hdr">Aprobó:</div>
<div class="mem002-firma-slot-body">
<div class="mem002-firma-line"></div>
<div class="mem002-firma-nombre">{aprobo_empresa}</div>
<div class="mem002-firma-rep">Representante: {aprobo_rep}</div>
</div>
</td>"""
    return f"""<div class="mem002-firmas-wrap">
<table class="mem002-firmas-tbl" cellspacing="0" cellpadding="0">
<tr>
{elaboro_td}
{reviso_td}
{aprobo_td}
</tr>
</table>
</div>"""


def _chunks_memoria_detalle(registros: List[Any], rows_primera_hoja: int, rows_hoja_siguiente: int) -> List[List[Any]]:
    """Trocea filas del detalle CC-SUB-002: la 1ª hoja lleva encabezado institucional (menos filas); el resto objetivo mayor.
    No fuerza “cuota” rígida en la última hoja: el último bloque puede ser más corto."""
    reg = list(registros or [])
    if not reg:
        return [[]]
    rp = max(1, rows_primera_hoja)
    rs = max(1, rows_hoja_siguiente)
    out: List[List[Any]] = []
    i = 0
    take = min(rp, len(reg) - i)
    out.append(reg[i : i + take])
    i += take
    while i < len(reg):
        take = min(rs, len(reg) - i)
        out.append(reg[i : i + take])
        i += take
    return out


def _memoria_pdf_estilo_css(est: Dict[str, str]) -> str:
    """CSS extra CC-SUB-002 según estilo guardado en biblioteca (colores ya validados)."""
    sb = _sanitize_ccd_hex_color(est.get("section_bar_bg"), "#e5e7eb")
    st = _sanitize_ccd_hex_color(est.get("section_bar_text"), "#111827")
    th = _sanitize_ccd_hex_color(est.get("thead_bg"), "#f3f4f6")
    ev = _sanitize_ccd_hex_color(est.get("row_even_bg"), "#f8fafc")
    od = _sanitize_ccd_hex_color(est.get("row_odd_bg"), "#ffffff")
    su = _sanitize_ccd_hex_color(est.get("subtotal_bg"), "#e5e7eb")
    return (
        f"body.mem002-doc .section-bar.mem002-section{{background:{sb}!important;color:{st}!important;}}"
        f"body.mem002-doc .mem002-detail th.data-th{{background:{th}!important;}}"
        f"body.mem002-doc .mem002-detail tr.even td{{background:{ev}!important;}}"
        f"body.mem002-doc .mem002-detail tr.odd td{{background:{od}!important;}}"
        f"body.mem002-doc .mem002-total-wrap td.total-td{{background:{su}!important;}}"
    )


def _wrap_memoria_item_html(body_html: str, estilo_css: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>{BASE_CSS_SHARED}{MEMORIA002_CSS}{estilo_css}</style></head><body class="mem002-doc">
{body_html}
</body></html>"""


# ── Template CC-SUB-002 ────────────────────────────────────────────────────────

def _html_memoria_item_body(
    contrato,
    sub,
    corte,
    item_info,
    registros,
    usuario_nombre,
    usuario_cargo,
    firma_cfg: Optional[Dict[str, Any]] = None,
    elaboro_firma_data_uri: Optional[str] = None,
    reviso_firma_data_uri: Optional[str] = None,
    *,
    conc_meta: Optional[Dict[str, Any]] = None,
    aprobo_firma_data_uri: Optional[str] = None,
    aprobo_interventoria_desde_config: bool = False,
    pie_fotos_contexto: Optional[str] = None,
):
    total_cant = sum(_sf(r.get("cantidad_total"), 0.0) for r in registros)

    # 1ª hoja: encabezado + barra consumen altura — objetivo ~26 filas para evitar 1 sola fila en página siguiente.
    ROWS_MEMORIA_PRIMERA_HOJA = 26
    ROWS_MEMORIA_SIGUIENTES = 30
    FOTOS_PER_PAGE = 6

    fotos = [r for r in registros if r.get("foto_url")]

    def encabezado():
        # CC-SUB-002: encabezado compacto en 3 filas (logo | título | código → contrato | sub | corte | período → ítem | descripción | und).
        # conc_meta: CC-SEM-002 / CC-MES-002 (sin sub/corte en metadatos).
        bd = "border:1px solid #9ca3af"
        titulo = "RESUMEN ACTIVIDADES CONCILIACIÓN CORTE SUBCONTRATISTA"
        codigo_h = _h("CC-SUB-002")
        num_contrato = _h(str(contrato.get("numero") or ""))
        sub_nom = _h(str(sub.get("razon_social") or ""))
        corte_lbl = _h(_corte_consecutivo_fmt(corte))
        periodo = f"{_h(_fd(corte.get('fecha_inicio')))} — {_h(_fd(corte.get('fecha_fin')))}"
        if conc_meta:
            titulo = str(conc_meta.get("titulo") or titulo)
            codigo_h = _h(str(conc_meta.get("codigo") or ""))
        it_num = _h(str(item_info.get("item_numero") or ""))
        it_desc = _h(_descripcion_memoria_compacta(item_info.get("item_descripcion")))
        it_und = _h(str(item_info.get("unidad") or ""))
        lbl = "font-size:6pt;color:#555;font-weight:normal;"
        val = "font-size:7pt;font-weight:bold;color:#1a1a2e;line-height:1.15;"
        # Descripción: +1 pt respecto a 5.5 pt anterior → 6.5 pt; interlineado ajustado para fila más baja.
        val_desc = (
            "font-size:6.5pt;font-weight:normal;color:#1a1a2e;line-height:1.04;"
            "text-transform:none;word-wrap:break-word;margin:1px 0 0 0;padding:0;display:block;"
        )
        fila1_h = "1.14cm"
        # Área útil del logo = altura de fila menos padding mínimo de celda.
        logo_box_h = "1.08cm"
        logo_html = _html_logo_contratista(contrato, compact=True, compact_box_height=logo_box_h)
        lbl_blk = "font-size:6pt;color:#555;font-weight:normal;display:block;margin:0;padding:0;line-height:1.05;"
        if conc_meta:
            cells = list(conc_meta.get("cells") or [])
            while len(cells) < 4:
                cells.append(("", ""))
            c4 = cells[:4]
            row2 = ""
            for lab, celval in c4:
                row2 += f"""<td style="width:25%;{bd};padding:3px 5px;vertical-align:top;">
<span style="{lbl}">{_h(str(lab))}</span><br/><span style="{val}">{_h(str(celval))}</span>
</td>"""
            return f"""<div class="mem002-head-wrap"><table class="w100" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;margin-bottom:3px;border:1px solid #9ca3af;">
<tr>
<td style="width:17%;{bd};padding:1px 2px;vertical-align:middle;text-align:center;height:{fila1_h};min-height:{fila1_h};">
{logo_html}
</td>
<td style="width:65%;{bd};padding:2px 6px;vertical-align:middle;text-align:center;height:{fila1_h};min-height:{fila1_h};">
<div style="font-size:6.8pt;font-weight:bold;color:#111827;text-transform:uppercase;line-height:1.08;">{_h(titulo)}</div>
</td>
<td style="width:18%;{bd};padding:2px;vertical-align:middle;text-align:center;height:{fila1_h};min-height:{fila1_h};">
<div style="font-size:10pt;font-weight:bold;color:#1e40af;line-height:1;">{codigo_h}</div>
<div style="font-size:6pt;color:#64748b;margin-top:1px;">CCD</div>
</td>
</tr>
<tr>
<td colspan="3" style="padding:0;">
<table class="w100" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;">
<tr>
{row2}
</tr>
</table>
</td>
</tr>
<tr>
<td colspan="3" style="padding:0;">
<table class="w100" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;">
<tr>
<td style="width:13%;{bd};padding:1px 4px;vertical-align:top;">
<span style="{lbl_blk}">ÍTEM</span><span style="{val};display:block;margin:1px 0 0 0;padding:0;">{it_num}</span>
</td>
<td style="width:74%;{bd};padding:1px 4px;vertical-align:top;">
<span style="{lbl_blk}">DESCRIPCIÓN</span><span style="{val_desc}">{it_desc}</span>
</td>
<td style="width:13%;{bd};padding:1px 4px;vertical-align:top;">
<span style="{lbl_blk}">UNIDAD</span><span style="{val};display:block;margin:1px 0 0 0;padding:0;">{it_und}</span>
</td>
</tr>
</table>
</td>
</tr>
</table></div>"""
        return f"""<div class="mem002-head-wrap"><table class="w100" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;margin-bottom:3px;border:1px solid #9ca3af;">
<tr>
<td style="width:17%;{bd};padding:1px 2px;vertical-align:middle;text-align:center;height:{fila1_h};min-height:{fila1_h};">
{logo_html}
</td>
<td style="width:65%;{bd};padding:2px 6px;vertical-align:middle;text-align:center;height:{fila1_h};min-height:{fila1_h};">
<div style="font-size:6.8pt;font-weight:bold;color:#111827;text-transform:uppercase;line-height:1.08;">{_h(titulo)}</div>
</td>
<td style="width:18%;{bd};padding:2px;vertical-align:middle;text-align:center;height:{fila1_h};min-height:{fila1_h};">
<div style="font-size:10pt;font-weight:bold;color:#1e40af;line-height:1;">{codigo_h}</div>
<div style="font-size:6pt;color:#64748b;margin-top:1px;">CCD</div>
</td>
</tr>
<tr>
<td colspan="3" style="padding:0;">
<table class="w100" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;">
<tr>
<td style="width:25%;{bd};padding:3px 5px;vertical-align:top;">
<span style="{lbl}">CONTRATO</span><br/><span style="{val}">{num_contrato}</span>
</td>
<td style="width:25%;{bd};padding:3px 5px;vertical-align:top;">
<span style="{lbl}">SUB CONTRATISTA</span><br/><span style="{val}">{sub_nom}</span>
</td>
<td style="width:25%;{bd};padding:3px 5px;vertical-align:top;">
<span style="{lbl}">CORTE N°</span><br/><span style="{val}">{corte_lbl}</span>
</td>
<td style="width:25%;{bd};padding:3px 5px;vertical-align:top;">
<span style="{lbl}">PERÍODO</span><br/><span style="{val}">{periodo}</span>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td colspan="3" style="padding:0;">
<table class="w100" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;width:100%;">
<tr>
<td style="width:13%;{bd};padding:1px 4px;vertical-align:top;">
<span style="{lbl_blk}">ÍTEM</span><span style="{val};display:block;margin:1px 0 0 0;padding:0;">{it_num}</span>
</td>
<td style="width:74%;{bd};padding:1px 4px;vertical-align:top;">
<span style="{lbl_blk}">DESCRIPCIÓN</span><span style="{val_desc}">{it_desc}</span>
</td>
<td style="width:13%;{bd};padding:1px 4px;vertical-align:top;">
<span style="{lbl_blk}">UNIDAD</span><span style="{val};display:block;margin:1px 0 0 0;padding:0;">{it_und}</span>
</td>
</tr>
</table>
</td>
</tr>
</table></div>"""

    chunks_foto = [fotos[i : i + FOTOS_PER_PAGE] for i in range(0, len(fotos), FOTOS_PER_PAGE)]
    chunks_reg = _chunks_memoria_detalle(registros, ROWS_MEMORIA_PRIMERA_HOJA, ROWS_MEMORIA_SIGUIENTES)

    thead_detalle = """<tr>
            <th class="data-th" style="width:4%">N°</th>
            <th class="data-th" style="width:5.5%">ABS INI</th>
            <th class="data-th" style="width:5.5%">ABS FIN</th>
            <th class="data-th" style="width:7%">PK ID</th>
            <th class="data-th" style="width:8%">COSTADO</th>
            <th class="data-th" style="width:7%">LONG</th>
            <th class="data-th" style="width:7%">ANCHO</th>
            <th class="data-th" style="width:7%">ESP</th>
            <th class="data-th" style="width:9%">CANT</th>
            <th class="data-th" style="width:9%">CANT TOT</th>
            <th class="data-th" style="width:38%">OBSERVACIÓN</th>
        </tr>"""

    body = ""
    row_offset = 0
    for ci, chunk in enumerate(chunks_reg):
        if ci > 0:
            body += "<pdf:nextpage />"
        if ci == 0:
            body += encabezado()
        body += '<div class="section-bar mem002-section">DETALLE DE CANTIDADES APROBADAS</div>'
        body += f"""<table class="w100 mem002-detail" cellspacing="0" cellpadding="0">{thead_detalle}"""

        for j, r in enumerate(chunk):
            i = row_offset + j
            cls = "even" if i % 2 == 0 else "odd"
            obs = r.get("observacion") or ""
            fn = r.get("foto_numero")
            if fn:
                obs = f"{obs} [Foto {fn}]".strip()
            obs = _descripcion_memoria_compacta(obs)
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
                <td class="data-td mem002-obs">{_h((obs or '')[:500])}</td>
            </tr>"""

        row_offset += len(chunk)
        body += "</table>"

    # Fila de total en tabla aparte (sin colspan): xhtml2pdf suele aplastar OBS/CANT TOT en la última página del detalle.
    body += f"""<table class="w100 mem002-total-wrap" cellspacing="0" cellpadding="0">
        <tr>
            <td class="total-td" style="width:60%;text-align:right;padding-right:8px">CANTIDAD TOTAL DEL ÍTEM</td>
            <td class="total-td" style="width:9%;text-align:right">{_fn(total_cant)}</td>
            <td class="total-td" style="width:31%">&nbsp;</td>
        </tr>
    </table>"""

    body += '<div class="doc-footer">Documento institucional de control interno. Prohibida su reproduccion parcial o total sin autorizacion escrita.</div>'

    # Firmas justo después del detalle (antes de fotos): visibles en vista previa sin pasar el anexo gráfico.
    body += _html_mem002_bloque_firmas(
        sub,
        firma_cfg,
        elaboro_firma_data_uri,
        reviso_firma_data_uri,
        aprobo_firma_data_uri=aprobo_firma_data_uri,
        aprobo_interventoria_desde_config=aprobo_interventoria_desde_config,
    )

    # Páginas de fotos después del bloque de firmas (sin encabezado repetido).
    if pie_fotos_contexto:
        pie_foto = _h(pie_fotos_contexto)
    else:
        pie_foto = f'Corte N° {_h(corte.get("consecutivo",""))}'
    for foto_chunk in chunks_foto:
        body += '<pdf:nextpage />'
        body += f'<div class="section-bar mem002-section">REGISTRO FOTOGRÁFICO — ÍTEM {_h(item_info.get("item_numero",""))} | {pie_foto}</div>'
        body += '<table class="w100 mem002-foto-grid">'
        for row_start in range(0, len(foto_chunk), 3):
            body += "<tr>"
            fila = foto_chunk[row_start:row_start+3]
            for r in fila:
                obs_f = _descripcion_memoria_compacta((r.get("observacion") or "")[:120])
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

    return body


def _html_memoria_item(
    contrato,
    sub,
    corte,
    item_info,
    registros,
    usuario_nombre,
    usuario_cargo,
    firma_cfg: Optional[Dict[str, Any]] = None,
    elaboro_firma_data_uri: Optional[str] = None,
    reviso_firma_data_uri: Optional[str] = None,
    *,
    conc_meta: Optional[Dict[str, Any]] = None,
    aprobo_firma_data_uri: Optional[str] = None,
    aprobo_interventoria_desde_config: bool = False,
    pie_fotos_contexto: Optional[str] = None,
    estilo_formato_codigo: str = CODIGO_FORMATO_CCD_CC_SUB_002,
):
    fc = firma_cfg or {}
    est = _merge_estilo_pdf(fc.get("estilo_pdf"), estilo_formato_codigo)
    estilo_css = _memoria_pdf_estilo_css(est)
    inner = _html_memoria_item_body(
        contrato,
        sub,
        corte,
        item_info,
        registros,
        usuario_nombre,
        usuario_cargo,
        firma_cfg,
        elaboro_firma_data_uri=elaboro_firma_data_uri,
        reviso_firma_data_uri=reviso_firma_data_uri,
        conc_meta=conc_meta,
        aprobo_firma_data_uri=aprobo_firma_data_uri,
        aprobo_interventoria_desde_config=aprobo_interventoria_desde_config,
        pie_fotos_contexto=pie_fotos_contexto,
    )
    return _wrap_memoria_item_html(inner, estilo_css)