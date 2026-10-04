"""
Escrituras resilientes cuando faltan columnas opcionales (PGRST204 / 42703).

Causa de producción: el cliente envía coords_geojson / geometria_tipo / dibujo_* /
perimetro_geojson antes de aplicar las migraciones SQL → PostgREST rechaza el write.
"""
from __future__ import annotations

import re
import threading
from typing import Any, Callable, Dict, List, Optional, Set

_SO_REGISTROS_OMIT_COLUMNS: Set[str] = set()
_SO_REGISTROS_OMIT_LOCK = threading.Lock()
_SO_REPORTES_OMIT_COLUMNS: Set[str] = set()
_SO_REPORTES_OMIT_LOCK = threading.Lock()

SO_REGISTROS_OPTIONAL_COLUMNS = frozenset({
    "coords_geojson",
    "geometria_tipo",
    "huella_geojson",
    "huella_tipo",
    "huella_precision",
    "coord_lat_fin",
    "coord_lng_fin",
    "sector",
})

SO_REPORTES_OPTIONAL_COLUMNS = frozenset({
    "perimetro_geojson",
    "dibujo_geojson",
    "dibujo_escena",
    "dibujo_actualizado_en",
    "dibujo_por",
})


def so_registros_pgrst_unknown_column(err: BaseException) -> Optional[str]:
    """Extrae columna ausente (PGRST204 / 42703) en escrituras PostgREST."""
    text = str(err or "")
    low = text.lower()
    if not any(x in low for x in ("pgrst204", "schema cache", "could not find", "does not exist", "42703")):
        return None
    m = re.search(r"Could not find the '([^']+)' column", text)
    if m:
        return m.group(1)
    m = re.search(r'Could not find the "([^"]+)" column', text)
    if m:
        return m.group(1)
    m = re.search(r'column\s+[a-z0-9_]+\.([a-z0-9_]+)\s+does not exist', text, re.I)
    if m:
        return m.group(1)
    m = re.search(r'column\s+"([^"]+)"\s+(?:of relation|does not exist)', text, re.I)
    if m:
        return m.group(1)
    m = re.search(r"column\s+'([^']+)'\s+(?:of relation|does not exist)", text, re.I)
    if m:
        return m.group(1)
    return None


def _remember_omit(cache: Set[str], lock: threading.Lock, col: str) -> None:
    if not col:
        return
    with lock:
        cache.add(col)


def _strip_omitted(payload: Optional[Dict[str, Any]], cache: Set[str], lock: threading.Lock) -> Dict[str, Any]:
    data = dict(payload or {})
    with lock:
        omit = set(cache)
    for col in omit:
        data.pop(col, None)
    return data


def so_registros_remember_omit(col: str) -> None:
    _remember_omit(_SO_REGISTROS_OMIT_COLUMNS, _SO_REGISTROS_OMIT_LOCK, col)


def so_registros_clear_omit_cache() -> None:
    with _SO_REGISTROS_OMIT_LOCK:
        _SO_REGISTROS_OMIT_COLUMNS.clear()


def so_registros_omit_cache_snapshot() -> Set[str]:
    with _SO_REGISTROS_OMIT_LOCK:
        return set(_SO_REGISTROS_OMIT_COLUMNS)


def so_registros_strip_omitted(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Quita columnas ya conocidas como ausentes en el esquema PostgREST de so_registros."""
    return _strip_omitted(payload, _SO_REGISTROS_OMIT_COLUMNS, _SO_REGISTROS_OMIT_LOCK)


def so_registros_strip_omitted_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [so_registros_strip_omitted(r) for r in (rows or [])]


def so_reportes_remember_omit(col: str) -> None:
    _remember_omit(_SO_REPORTES_OMIT_COLUMNS, _SO_REPORTES_OMIT_LOCK, col)


def so_reportes_clear_omit_cache() -> None:
    with _SO_REPORTES_OMIT_LOCK:
        _SO_REPORTES_OMIT_COLUMNS.clear()


def so_reportes_omit_cache_snapshot() -> Set[str]:
    with _SO_REPORTES_OMIT_LOCK:
        return set(_SO_REPORTES_OMIT_COLUMNS)


def so_reportes_strip_omitted(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Quita columnas ya conocidas como ausentes en so_reportes (dibujo_*/perimetro)."""
    return _strip_omitted(payload, _SO_REPORTES_OMIT_COLUMNS, _SO_REPORTES_OMIT_LOCK)


def _pgrst_write_omit_missing(
    write_fn: Callable[[Dict[str, Any]], Any],
    payload: Dict[str, Any],
    *,
    optional_columns: frozenset,
    strip_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
    remember_fn: Callable[[str], None],
    operacion: str = "write",
) -> Any:
    del operacion  # reservado para logs futuros
    data = strip_fn(payload)
    last_exc: Optional[BaseException] = None
    for _attempt in range(12):
        try:
            return write_fn(data)
        except Exception as exc:
            last_exc = exc
            col = so_registros_pgrst_unknown_column(exc)
            if col and col in data:
                remember_fn(col)
                data.pop(col, None)
                continue
            stripped = False
            low = str(exc or "").lower()
            is_schema = any(
                tip in low for tip in ("pgrst204", "schema cache", "could not find", "does not exist")
            )
            for known in optional_columns:
                if known not in data:
                    continue
                if col == known or (is_schema and known in low):
                    remember_fn(known)
                    data.pop(known, None)
                    stripped = True
            if stripped:
                continue
            raise
    if last_exc:
        raise last_exc
    return None


def so_registros_write_omit_missing(
    write_fn: Callable[[Dict[str, Any]], Any],
    payload: Dict[str, Any],
    *,
    operacion: str = "write",
) -> Any:
    """
    Ejecuta insert/update en so_registros omitiendo columnas que PostgREST reporta ausentes.
    """
    return _pgrst_write_omit_missing(
        write_fn,
        payload,
        optional_columns=SO_REGISTROS_OPTIONAL_COLUMNS,
        strip_fn=so_registros_strip_omitted,
        remember_fn=so_registros_remember_omit,
        operacion=operacion,
    )


def so_reportes_write_omit_missing(
    write_fn: Callable[[Dict[str, Any]], Any],
    payload: Dict[str, Any],
    *,
    operacion: str = "write",
) -> Any:
    """Update so_reportes omitiendo dibujo_*/perimetro_geojson si aún no están migradas."""
    return _pgrst_write_omit_missing(
        write_fn,
        payload,
        optional_columns=SO_REPORTES_OPTIONAL_COLUMNS,
        strip_fn=so_reportes_strip_omitted,
        remember_fn=so_reportes_remember_omit,
        operacion=operacion,
    )


def so_registros_insert_rows_omit_missing(
    insert_fn: Callable[[List[Dict[str, Any]]], Any],
    rows: List[Dict[str, Any]],
) -> Any:
    """
    Insert batch omitiendo columnas opcionales ausentes.
    `insert_fn` recibe la lista ya saneada (p. ej. lambda chunk: sb.table(...).insert(chunk)...).
    """
    chunk = so_registros_strip_omitted_rows(rows)
    last_exc: Optional[BaseException] = None
    for _attempt in range(12):
        try:
            return insert_fn(chunk)
        except Exception as exc:
            last_exc = exc
            col = so_registros_pgrst_unknown_column(exc)
            if not col:
                low = str(exc or "").lower()
                col = next((k for k in SO_REGISTROS_OPTIONAL_COLUMNS if k in low), None)
                if not col or not any(
                    tip in low for tip in ("pgrst204", "schema cache", "could not find", "does not exist")
                ):
                    raise
            present = any(col in (r or {}) for r in chunk)
            if not present:
                raise
            so_registros_remember_omit(col)
            chunk = [{k: v for k, v in (r or {}).items() if k != col} for r in chunk]
            continue
    if last_exc:
        raise last_exc
    return None
