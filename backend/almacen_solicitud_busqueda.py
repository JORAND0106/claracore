"""Búsqueda de la grilla de solicitudes.

Varias palabras exigen que todas aparezcan, en cualquier orden.
No distingue mayúsculas ni tildes. El texto de líneas y mensajes no viaja
en la respuesta: solo la frase que dice dónde coincidió, si no fue en el nombre.
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Callable, Dict, Iterable, List, Optional

from almacen_agrupar import etiqueta_estado
from almacen_datetime import fmt_fecha_bogota

_log = logging.getLogger("claracore.almacen.busqueda")

_ZONAS = ("nombre", "linea", "mensaje", "persona", "persona_visible", "tramo", "pk")
_HINT_ORDER = ("linea", "mensaje", "tramo", "pk", "persona")
_HINT_LABEL = {
    "linea": "una línea",
    "mensaje": "un mensaje",
    "tramo": "el tramo",
    "pk": "el PK-ID",
    "persona": "una persona",
}

_HEAD_SELECTS = (
    "id, contrato_id, consecutivo, titulo, estado, created_at, created_by, "
    "validada_by, validada_at, enviada_at, observaciones, motivo_rechazo",
    "id, contrato_id, consecutivo, titulo, estado, created_at, created_by, "
    "validada_by, validada_at, enviada_at",
)
_ITEM_SELECTS = (
    "id, solicitud_id, capitulo, item, material_descripcion, descripcion_solicitada, "
    "observacion_residente, justificacion_autor_nombre, proveedor_seleccionado_nombre, "
    "tramo, pk_id, insumo_id",
    "id, solicitud_id, capitulo, item, material_descripcion, descripcion_solicitada, "
    "observacion_residente, proveedor_seleccionado_nombre, tramo, pk_id, insumo_id",
    "id, solicitud_id, capitulo, item, material_descripcion, tramo, pk_id, insumo_id",
)
_INSUMO_SELECTS = (
    "id, codigo, descripcion",
    "id, codigo",
)
_MENSAJE_SELECTS = (
    "id, solicitud_id, texto, remitente_nombre, linea_etiqueta",
    "id, solicitud_id, texto, remitente_nombre",
)
_DEST_SELECTS = (
    "solicitud_id, destinatario_nombre",
    "solicitud_id, destinatario_id",
)


def norm_busqueda(value) -> str:
    """Minúsculas y sin tildes. Misma idea que normTxt del frontend."""
    s = unicodedata.normalize("NFD", str(value or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.casefold().strip()


def tokens_busqueda(q: Optional[str]) -> List[str]:
    raw = norm_busqueda(q)
    if not raw:
        return []
    vistos = []
    for tok in raw.split():
        if tok and tok not in vistos:
            vistos.append(tok)
        if len(vistos) >= 20:
            break
    return vistos


def frase_coincide(zonas: Iterable[str]) -> str:
    labels = [_HINT_LABEL[z] for z in zonas if z in _HINT_LABEL]
    if not labels:
        return ""
    if len(labels) == 1:
        return f"coincide en {labels[0]}"
    if len(labels) == 2:
        return f"coincide en {labels[0]} y en {labels[1]}"
    return "coincide en " + ", en ".join(labels[:-1]) + f" y en {labels[-1]}"


def evaluar_busqueda(zonas: Dict[str, str], tokens: List[str]) -> Optional[str]:
    """None si falta alguna palabra. Cadena vacía si el nombre ya las cubre.

    La frase solo nombra zonas que no se ven en el nombre de la solicitud.
    Quien generó, aprobó o rechazó se ve en la grilla, así que no se anuncia.
    """
    if not tokens:
        return ""
    folded = {k: norm_busqueda(zonas.get(k) or "") for k in _ZONAS}
    hint: List[str] = []
    for tok in tokens:
        found = [k for k in _ZONAS if tok in folded.get(k, "")]
        if not found:
            return None
        if "nombre" in found:
            continue
        for k in _HINT_ORDER:
            if k == "persona":
                if k in found and "persona_visible" not in found and k not in hint:
                    hint.append(k)
                continue
            if k in found and k not in hint:
                hint.append(k)
    ordered = [z for z in _HINT_ORDER if z in hint]
    return frase_coincide(ordered)


def _txt(*parts) -> str:
    return " ".join(str(p).strip() for p in parts if p not in (None, ""))


def zonas_de_solicitud(
    sol: dict,
    items: List[dict],
    insumos: Dict[int, dict],
    mensajes: List[dict],
    destinatarios: List[dict],
    nombres: Dict[int, str],
    enviadores: Dict[int, List[str]],
) -> Dict[str, str]:
    sid = int(sol.get("id") or 0)
    fecha = fmt_fecha_bogota(sol.get("created_at")) if sol.get("created_at") else ""
    estado = etiqueta_estado(sol.get("estado"))
    nombre = _txt(
        sol.get("titulo"),
        sol.get("consecutivo"),
        fecha,
        estado,
        sol.get("estado"),
    )
    linea: List[str] = []
    tramos: List[str] = []
    pks: List[str] = []
    ocultas_linea: List[str] = []
    for it in items:
        if int(it.get("solicitud_id") or 0) != sid:
            continue
        ins = None
        if it.get("insumo_id"):
            try:
                ins = insumos.get(int(it["insumo_id"]))
            except (TypeError, ValueError):
                ins = None
        linea.append(_txt(
            it.get("capitulo"),
            it.get("item"),
            it.get("material_descripcion"),
            it.get("descripcion_solicitada"),
            it.get("observacion_residente"),
            it.get("proveedor_seleccionado_nombre"),
            (ins or {}).get("codigo"),
            (ins or {}).get("descripcion"),
        ))
        if it.get("justificacion_autor_nombre"):
            ocultas_linea.append(str(it.get("justificacion_autor_nombre")))
        if it.get("tramo"):
            tramos.append(str(it.get("tramo")))
        if it.get("pk_id"):
            pks.append(str(it.get("pk_id")))
    linea.append(_txt(sol.get("observaciones"), sol.get("motivo_rechazo")))

    msgs: List[str] = []
    ocultas: List[str] = []
    for m in mensajes:
        if int(m.get("solicitud_id") or 0) != sid:
            continue
        msgs.append(_txt(m.get("texto"), m.get("linea_etiqueta")))
        if m.get("remitente_nombre"):
            ocultas.append(str(m.get("remitente_nombre")))
    for d in destinatarios:
        if int(d.get("solicitud_id") or 0) != sid:
            continue
        if d.get("destinatario_nombre"):
            ocultas.append(str(d.get("destinatario_nombre")))
    for nom in enviadores.get(sid) or []:
        if nom:
            ocultas.append(str(nom))

    visibles: List[str] = []
    for key in ("created_by", "validada_by"):
        uid = sol.get(key)
        if not uid:
            continue
        try:
            nom = nombres.get(int(uid))
        except (TypeError, ValueError):
            nom = None
        if nom:
            visibles.append(nom)
    ocultas.extend(ocultas_linea)

    return {
        "nombre": nombre,
        "linea": _txt(*linea),
        "mensaje": _txt(*msgs),
        "persona": _txt(*ocultas),
        "persona_visible": _txt(*visibles),
        "tramo": _txt(*tramos),
        "pk": _txt(*pks),
    }


def _ausente(exc: BaseException) -> bool:
    low = str(exc or "").lower()
    return any(tok in low for tok in (
        "pgrst204", "pgrst205", "42703", "42p01", "schema cache",
        "could not find", "does not exist",
    ))


def _trozos(seq, n: int = 120):
    lista = list(seq or [])
    paso = max(1, int(n))
    for i in range(0, len(lista), paso):
        yield lista[i:i + paso]


def _paginar(make, page: int = 1000) -> List[dict]:
    out: List[dict] = []
    start = 0
    while start < 200000:
        q = make()
        ranger = getattr(q, "range", None)
        if callable(ranger):
            q = ranger(start, start + page - 1)
        rows = q.execute().data or []
        out.extend(rows)
        if not callable(ranger) or len(rows) < page:
            break
        start += page
    return out


def _select_in(sb, table: str, selects: tuple, col: str, ids: List[int]) -> List[dict]:
    if not ids:
        return []
    last: Optional[BaseException] = None
    for select in selects:
        try:
            rows: List[dict] = []
            for chunk in _trozos(ids):
                rows.extend(
                    sb.table(table).select(select).in_(col, list(chunk)).execute().data or []
                )
            return rows
        except Exception as exc:
            last = exc
            if not _ausente(exc):
                _log.warning("Búsqueda %s: %s", table, exc)
                return []
    if last:
        _log.warning("Búsqueda %s sin columnas: %s", table, last)
    return []


def _nombres_usuarios(sb, user_ids: List[int]) -> Dict[int, str]:
    ids = []
    for raw in user_ids:
        try:
            n = int(raw)
        except (TypeError, ValueError):
            continue
        if n and n not in ids:
            ids.append(n)
    if not ids:
        return {}
    rows = _select_in(
        sb,
        "usuarios",
        ("id, nombre, apellidos", "id, nombre, apellido", "id, nombre"),
        "id",
        ids,
    )
    out: Dict[int, str] = {}
    for r in rows:
        try:
            uid = int(r["id"])
        except (TypeError, ValueError, KeyError):
            continue
        nom = _txt(r.get("nombre"), r.get("apellidos") or r.get("apellido"))
        out[uid] = nom or f"Usuario #{uid}"
    return out


def _enviadores(sb, ids: List[int]) -> Dict[int, List[str]]:
    """Quien envió la solicitud queda en el log (no hay columna enviada_by)."""
    out: Dict[int, List[str]] = {}
    if not ids:
        return out
    try:
        rows: List[dict] = []
        for chunk in _trozos(ids):
            q = (
                sb.table("logs")
                .select("entidad_id, usuario_nombre, accion, modulo, entidad_tipo")
                .eq("modulo", "ALMACEN")
                .eq("entidad_tipo", "solicitud")
                .eq("accion", "ENVIAR")
                .in_("entidad_id", list(chunk))
            )
            rows.extend(q.execute().data or [])
    except Exception as exc:
        _log.warning("Búsqueda sin log de envío: %s", exc)
        return {}
    for r in rows:
        if str(r.get("modulo") or "").upper() not in ("", "ALMACEN"):
            continue
        if str(r.get("entidad_tipo") or "") not in ("", "solicitud"):
            continue
        if str(r.get("accion") or "").upper() not in ("", "ENVIAR"):
            continue
        try:
            sid = int(r.get("entidad_id") or 0)
        except (TypeError, ValueError):
            continue
        nom = str(r.get("usuario_nombre") or "").strip()
        if sid and nom:
            out.setdefault(sid, []).append(nom)
    return out


def _ordenar(rows: List[dict]) -> List[dict]:
    def clave(r):
        return (str(r.get("created_at") or ""), int(r.get("id") or 0))
    return sorted(rows, key=clave, reverse=True)


def coincidencias_solicitudes(
    sb,
    contrato_id: int,
    tokens: List[str],
    *,
    estado: Optional[str] = None,
    nombres_fn: Optional[Callable] = None,
) -> List[dict]:
    """Solicitudes del contrato que contienen todas las palabras, más recientes primero."""
    if not tokens:
        return []

    def make():
        q = (
            sb.table("almacen_solicitud")
            .select(_HEAD_SELECTS[0])
            .eq("contrato_id", int(contrato_id))
        )
        if estado:
            q = q.eq("estado", estado)
        order = getattr(q, "order", None)
        if callable(order):
            q = order("created_at", desc=True)
        return q

    try:
        heads = _paginar(make)
    except Exception as exc:
        if not _ausente(exc):
            raise
        def make_corto():
            q = (
                sb.table("almacen_solicitud")
                .select(_HEAD_SELECTS[1])
                .eq("contrato_id", int(contrato_id))
            )
            if estado:
                q = q.eq("estado", estado)
            return q
        heads = _paginar(make_corto)

    heads = [r for r in heads if r.get("id")]
    ids = [int(r["id"]) for r in heads]
    items = _select_in(sb, "almacen_solicitud_item", _ITEM_SELECTS, "solicitud_id", ids)
    insumo_ids: List[int] = []
    for it in items:
        if not it.get("insumo_id"):
            continue
        try:
            iid = int(it["insumo_id"])
        except (TypeError, ValueError):
            continue
        if iid not in insumo_ids:
            insumo_ids.append(iid)
    insumos: Dict[int, dict] = {}
    for row in _select_in(sb, "almacen_insumo", _INSUMO_SELECTS, "id", insumo_ids):
        try:
            insumos[int(row["id"])] = row
        except (TypeError, ValueError, KeyError):
            continue
    mensajes = _select_in(sb, "almacen_solicitud_mensaje", _MENSAJE_SELECTS, "solicitud_id", ids)
    destinatarios = _select_in(
        sb, "almacen_solicitud_mensaje_destinatario", _DEST_SELECTS, "solicitud_id", ids,
    )
    user_ids: List[int] = []
    for r in heads:
        for key in ("created_by", "validada_by"):
            if r.get(key):
                user_ids.append(r.get(key))
    if nombres_fn:
        nombres = nombres_fn(sb, user_ids) or {}
    else:
        nombres = _nombres_usuarios(sb, user_ids)
    enviadores = _enviadores(sb, ids)

    out: List[dict] = []
    for sol in _ordenar(heads):
        zonas = zonas_de_solicitud(
            sol, items, insumos, mensajes, destinatarios, nombres, enviadores,
        )
        donde = evaluar_busqueda(zonas, tokens)
        if donde is None:
            continue
        out.append({"solicitud": sol, "donde": donde})
    return out
