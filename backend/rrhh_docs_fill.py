"""
Avance documental por colaborador (4 grupos) para la grilla RRHH.

Grupos (orden de la barra):
  1. contrato   — contrato laboral generado/cargado
  2. soporte    — documentos de soporte (+ tipos «Otro» del checklist)
  3. ingreso    — documentos de ingreso (+ tipos «Otro»)
  4. afiliacion — certificaciones de afiliación (EPS/ARL/Pensión/Cesantías
                  obligatorias; Caja opcional). En prestación de servicios
                  mide la planilla de pago en lugar de las certificaciones.

Cálculo en lote sobre la página de la grilla (sin N+1).
Opcionales no cargados (hoja de vida, certificados, caja) no restan avance.
Si el colaborador ya está Aprobado, todas las secciones se muestran llenas
(los adjuntos individuales se eliminan al consolidar).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from rrhh_docs_obligatoriedad import es_doc_opcional

_log = logging.getLogger("uvicorn.error")

DOCS_FILL_GROUPS = ("contrato", "soporte", "ingreso", "afiliacion")

_EMPTY_SEG = {"filled": 0, "total": 0, "ratio": 0.0}


def _ratio(filled: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(min(1.0, max(0.0, float(filled) / float(total))), 4)


def _seg(filled: int, total: int) -> dict:
    f = max(0, int(filled))
    t = max(0, int(total))
    if t > 0:
        f = min(f, t)
    return {"filled": f, "total": t, "ratio": _ratio(f, t)}


def empty_docs_fill() -> dict:
    return {g: dict(_EMPTY_SEG) for g in DOCS_FILL_GROUPS}


def _slug_tipo_documento(label: str) -> str:
    """Slug estable (misma regla que rrhh_docs_service.slug_tipo_documento)."""
    import re
    import unicodedata

    s = unicodedata.normalize("NFD", str(label or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    if not s:
        s = "documento"
    return f"ext_{s[:72]}"


def _custom_tipos_por_categoria(sb, contrato_id: int) -> Dict[str, Set[str]]:
    """Tipos extendidos (ext_*) del catálogo doc_soporte / doc_ingreso."""
    out: Dict[str, Set[str]] = {"soporte": set(), "ingreso": set()}
    try:
        from rrhh_service import list_catalogo
    except Exception:
        return out
    for cat, catalog_key in (("soporte", "doc_soporte"), ("ingreso", "doc_ingreso")):
        try:
            rows = list_catalogo(sb, int(contrato_id), catalog_key) or []
        except Exception as exc:
            _log.debug("docs_fill catalogo %s: %s", catalog_key, exc)
            rows = []
        for r in rows:
            label = str(r.get("valor") or "").strip()
            if not label:
                continue
            out[cat].add(_slug_tipo_documento(label))
    return out


# Tipos base (sin el slot UI «otro»). Alineados con rrhh_docs_service.
_BUILTIN_SOPORTE = frozenset({"cedula", "hoja_vida", "certificados"})
_BUILTIN_INGRESO = frozenset({"induccion", "reglamento", "examen_medico"})
_BUILTIN_AFILIACION = frozenset({
    "cert_eps", "cert_pension", "cert_arl", "cert_cesantias", "cert_caja",
})
_BUILTIN_PLANILLA = frozenset({"planilla_pago"})


def _builtin_tipos(categoria: str) -> Set[str]:
    if categoria == "soporte":
        return set(_BUILTIN_SOPORTE)
    if categoria == "ingreso":
        return set(_BUILTIN_INGRESO)
    if categoria == "afiliacion":
        return set(_BUILTIN_AFILIACION)
    return set()


def _fetch_docs_batch(sb, contrato_id: int, ids: List[int]) -> Dict[int, List[Tuple[str, str]]]:
    """trabajador_id → [(categoria, tipo), ...] vigentes."""
    by_id: Dict[int, List[Tuple[str, str]]] = {i: [] for i in ids}
    if not ids:
        return by_id
    try:
        rows = (
            sb.table("rrhh_trabajador_documentos")
            .select("trabajador_id, categoria, tipo")
            .eq("contrato_id", int(contrato_id))
            .in_("trabajador_id", ids)
            .eq("vigente", True)
            .is_("eliminado_en", "null")
            .in_("categoria", ["soporte", "ingreso", "afiliacion"])
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("docs_fill docs batch: %s", exc)
        return by_id
    for r in rows:
        try:
            tid = int(r["trabajador_id"])
        except (TypeError, ValueError, KeyError):
            continue
        cat = str(r.get("categoria") or "").strip().lower()
        tipo = str(r.get("tipo") or "").strip().lower()
        if not cat or not tipo or tipo == "otro":
            continue
        if tid in by_id:
            by_id[tid].append((cat, tipo))
    return by_id


def _fetch_contratos_batch(sb, contrato_id: int, ids: List[int]) -> Set[int]:
    """IDs con al menos un contrato laboral vigente."""
    if not ids:
        return set()
    try:
        rows = (
            sb.table("rrhh_contratos_generados")
            .select("trabajador_id")
            .eq("contrato_id", int(contrato_id))
            .in_("trabajador_id", ids)
            .eq("vigente", True)
            .is_("eliminado_en", "null")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        # Columna/tabla puede faltar en entornos viejos: no tumbar la grilla.
        _log.warning("docs_fill contratos batch: %s", exc)
        return set()
    out: Set[int] = set()
    for r in rows:
        try:
            out.add(int(r["trabajador_id"]))
        except (TypeError, ValueError, KeyError):
            continue
    return out


def _fill_for_trabajador(
    trab: dict,
    docs: List[Tuple[str, str]],
    *,
    tiene_contrato: bool,
    custom: Dict[str, Set[str]],
) -> dict:
    if str(trab.get("doc_validacion_estado") or "").strip().lower() == "aprobado":
        # Tras aprobación los adjuntos individuales se eliminan; la barra refleja 100%.
        return {
            "contrato": _seg(1, 1),
            "soporte": _seg(1, 1),
            "ingreso": _seg(1, 1),
            "afiliacion": _seg(1, 1),
        }

    from rrhh_docs_obligatoriedad import trabajador_es_prestacion_servicios

    vigentes = set(docs)
    prestacion = trabajador_es_prestacion_servicios(trab)

    # Contrato: 0/1
    contrato = _seg(1 if tiene_contrato else 0, 1)

    def group_fill(cat: str) -> dict:
        if cat == "afiliacion" and prestacion:
            expected = set(_BUILTIN_PLANILLA)
        else:
            expected = set(_builtin_tipos(cat))
            if cat == "afiliacion":
                expected -= set(_BUILTIN_PLANILLA)
        if cat in ("soporte", "ingreso"):
            expected |= set(custom.get(cat) or ())
            # Tipos «Otro» cargados (ext_*) aunque aún no figuren en catálogo.
            for c, t in vigentes:
                if c == cat and t.startswith("ext_"):
                    expected.add(t)
        # Denominador: solo obligatorios (+ opcionales que sí estén cargados).
        # Opcionales vacíos no restan ni cuentan como faltantes.
        contables: Set[str] = set()
        filled = 0
        for t in expected:
            cargado = (cat, t) in vigentes
            if es_doc_opcional(cat, t) and not cargado:
                continue
            contables.add(t)
            if cargado:
                filled += 1
        if not contables:
            # Solo opcionales vacíos en la sección → 0/0 (no marca completa ni resta).
            return _seg(0, 0)
        return _seg(filled, len(contables))

    return {
        "contrato": contrato,
        "soporte": group_fill("soporte"),
        "ingreso": group_fill("ingreso"),
        "afiliacion": group_fill("afiliacion"),
    }


def attach_docs_fill(
    sb,
    contrato_id: int,
    items: Iterable[dict],
) -> List[dict]:
    """
    Anexa `docs_fill` a cada trabajador de la página.
    Dos consultas batch + catálogo una vez. No modifica filas ajenas.
    """
    rows = list(items or [])
    if not rows:
        return rows
    ids: List[int] = []
    for r in rows:
        try:
            ids.append(int(r["id"]))
        except (TypeError, ValueError, KeyError):
            continue
    if not ids:
        for r in rows:
            r["docs_fill"] = empty_docs_fill()
        return rows

    custom = _custom_tipos_por_categoria(sb, int(contrato_id))
    docs_by = _fetch_docs_batch(sb, int(contrato_id), ids)
    con_contrato = _fetch_contratos_batch(sb, int(contrato_id), ids)

    for r in rows:
        try:
            tid = int(r["id"])
        except (TypeError, ValueError, KeyError):
            r["docs_fill"] = empty_docs_fill()
            continue
        r["docs_fill"] = _fill_for_trabajador(
            r,
            docs_by.get(tid) or [],
            tiene_contrato=tid in con_contrato,
            custom=custom,
        )
    return rows
