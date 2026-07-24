"""
Integridad de firmas CCD (Informes): hash canónico del contenido fuente
y marcador visual de invalidación en el PDF.

No borra registros de firma ni bloquea descargas: si el hash actual difiere
del guardado al firmar, el slot muestra texto en lugar de la imagen.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, Iterable, List, Mapping, Optional

# Valor especial que `_firma_data_uri_para_slot_*` devuelve cuando hay drift.
FIRMA_INVALIDADA_MARKER = "__FIRMA_INVALIDADA__"

TEXTO_FIRMA_INVALIDADA = (
    "Firma invalidada por modificación posterior. Solicite nueva firma."
)

# Versión del esquema del payload canónico (bump si cambia el conjunto de campos).
CANON_VERSION = 1


def es_marcador_firma_invalidada(valor: Optional[str]) -> bool:
    return (valor or "").strip() == FIRMA_INVALIDADA_MARKER


def hash_canonico(payload: Mapping[str, Any]) -> str:
    """SHA-256 hex de JSON estable (sorted keys, sin espacios)."""
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _norm_txt(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v if v is not None else "").strip())


def _norm_num(v: Any) -> str:
    """Normaliza números a string estable (evita 1.0 vs 1)."""
    if v is None or v == "":
        return ""
    try:
        f = float(v)
        if not (f == f) or f in (float("inf"), float("-inf")):  # NaN / inf
            return ""
        if abs(f - round(f)) < 1e-12:
            return str(int(round(f)))
        return f"{f:.8f}".rstrip("0").rstrip(".")
    except (TypeError, ValueError):
        return _norm_txt(v)


def fila_registro_canonica(r: Mapping[str, Any]) -> Dict[str, str]:
    """Campos de so_registros que afectan el PDF (cantidades, estados, medios)."""
    return {
        "id": _norm_txt(r.get("id")),
        "item_numero": _norm_txt(r.get("item_numero")),
        "item_descripcion": _norm_txt(r.get("item_descripcion")),
        "unidad": _norm_txt(r.get("unidad")),
        "capitulo": _norm_txt(r.get("capitulo")),
        "cantidad_total": _norm_num(r.get("cantidad_total")),
        "vlr_unitario": _norm_num(r.get("vlr_unitario") if r.get("vlr_unitario") is not None else r.get("vlr_unitario_subcontratista")),
        "vlr_unitario_subcontratista": _norm_num(r.get("vlr_unitario_subcontratista")),
        "sub_estado": _norm_txt(r.get("sub_estado")),
        "nivel1_estado": _norm_txt(r.get("nivel1_estado")),
        "nivel2_estado": _norm_txt(r.get("nivel2_estado")),
        "nivel3_estado": _norm_txt(r.get("nivel3_estado")),
        "bloqueado": "1" if r.get("bloqueado") is True else ("0" if r.get("bloqueado") is False else ""),
        "foto_url": _norm_txt(r.get("foto_url")),
        "foto_numero": _norm_txt(r.get("foto_numero")),
        "grafico_url": _norm_txt(r.get("grafico_url")),
        "grafico_numero": _norm_txt(r.get("grafico_numero")),
        "abs_inicio": _norm_txt(r.get("abs_inicio")),
        "abs_final": _norm_txt(r.get("abs_final")),
    }


def item_agregado_canonico(it: Mapping[str, Any]) -> Dict[str, str]:
    return {
        "item_numero": _norm_txt(it.get("item_numero")),
        "item_descripcion": _norm_txt(it.get("item_descripcion")),
        "unidad": _norm_txt(it.get("unidad")),
        "capitulo": _norm_txt(it.get("capitulo")),
        "cantidad": _norm_num(it.get("cantidad")),
        "vlr_unitario": _norm_num(
            it.get("vlr_unitario")
            if it.get("vlr_unitario") is not None
            else it.get("vlr_unitario_sub")
        ),
        "costo_directo": _norm_num(it.get("costo_directo")),
    }


def payload_desde_registros(
    *,
    formato_codigo: str,
    contexto_tipo: str,
    contexto_id: int,
    registros: Iterable[Mapping[str, Any]],
    extra: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    filas = [fila_registro_canonica(r) for r in registros]
    filas.sort(key=lambda x: (x.get("item_numero") or "", x.get("id") or ""))
    out: Dict[str, Any] = {
        "v": CANON_VERSION,
        "formato": _norm_txt(formato_codigo),
        "contexto_tipo": _norm_txt(contexto_tipo),
        "contexto_id": int(contexto_id),
        "registros": filas,
    }
    if extra:
        out["extra"] = dict(extra)
    return out


def payload_desde_items_agregados(
    *,
    formato_codigo: str,
    contexto_tipo: str,
    contexto_id: int,
    items: Iterable[Mapping[str, Any]],
    total_costo: Any = None,
    extra: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    aggs = [item_agregado_canonico(it) for it in items]
    aggs.sort(key=lambda x: x.get("item_numero") or "")
    out: Dict[str, Any] = {
        "v": CANON_VERSION,
        "formato": _norm_txt(formato_codigo),
        "contexto_tipo": _norm_txt(contexto_tipo),
        "contexto_id": int(contexto_id),
        "items": aggs,
        "total_costo": _norm_num(total_costo),
    }
    if extra:
        out["extra"] = dict(extra)
    return out


def html_caja_firma_invalidada(*, box_pt: str, memoria_compact: bool = False) -> str:
    """
    HTML del área de imagen de firma sustituida por el texto de invalidación.
    Mantiene altura fija del cage para no romper el layout del PDF.
    """
    import html as _html_mod

    fs = "5.5pt" if memoria_compact else "6pt"
    txt = _html_mod.escape(TEXTO_FIRMA_INVALIDADA)
    return (
        f'<table class="ccd-firma-img-cage" cellspacing="0" cellpadding="0" width="100%" '
        f'style="border-collapse:collapse;table-layout:fixed;margin:{"0" if memoria_compact else "1px 0 2px 0"};">'
        f'<tr><td style="height:{box_pt};max-height:{box_pt};min-height:{box_pt};overflow:hidden;'
        f'vertical-align:middle;text-align:center;padding:2px 3px;border:none;'
        f'font-size:{fs};line-height:1.15;font-weight:bold;color:#b91c1c;white-space:normal;">'
        f"{txt}</td></tr></table>"
    )


def html_fo_eo04_firma_invalidada(*, box_pt: str) -> str:
    import html as _html_mod

    txt = _html_mod.escape(TEXTO_FIRMA_INVALIDADA)
    return (
        f'<div style="height:{box_pt};max-height:{box_pt};min-height:{box_pt};overflow:hidden;'
        f'display:table;width:100%;">'
        f'<div style="display:table-cell;vertical-align:middle;text-align:center;'
        f'font-size:5.5pt;line-height:1.1;font-weight:bold;color:#b91c1c;padding:1px 2px;">'
        f"{txt}</div></div>"
    )
