"""Filtro inverso ClaraCAD: handles del plano → registros de presupuesto.

El Loader envía al Agent la operación IPC ``filtrar_registros`` con
``{"handles": ["3E377", ...]}`` (entidad y, si aplica, texto). El Agent
hace ``POST /cad-queue/{contrato_id}/filtro-handles``. Esta capa resuelve
qué filas de ``presupuesto`` coinciden y arma la operación ``filtro_activo``.
"""
from __future__ import annotations

import json
import re
from typing import Any, Iterable, Optional

_HANDLE_RE = re.compile(r"^[0-9A-F]+$")
_MAX_HANDLES = 2000
_CHUNK = 40

MSG_SIN_SELECCION = (
    "No hay entidades seleccionadas en el plano. "
    "Seleccione una o varias y vuelva a ejecutar CLARAFILTRO."
)
MSG_SIN_COINCIDENCIAS = (
    "Ninguna entidad seleccionada en el plano corresponde a un registro del presupuesto."
)
MSG_SIN_VISIBLES = (
    "Las entidades del plano no corresponden a registros visibles en su presupuesto."
)


def normalizar_handles(handles: Any, *, limite: int = _MAX_HANDLES) -> list[str]:
    """Handles hex de AutoCAD, únicos, en mayúsculas. Descarta vacíos y no hex."""
    if isinstance(handles, str):
        handles = [handles]
    if not isinstance(handles, (list, tuple)):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in handles:
        if raw is None or isinstance(raw, bool):
            continue
        s = str(raw).strip()
        if s.lower().startswith("handle:"):
            s = s.split(":", 1)[1].strip()
        s = s.strip("{}()").strip().upper()
        if not s or s in seen or not _HANDLE_RE.match(s):
            continue
        if len(s) > 64:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= limite:
            break
    return out


def _dado_de_baja(row: dict) -> bool:
    v = row.get("dado_de_baja")
    if v is True or v == 1:
        return True
    return str(v).strip().lower() == "true"


def buscar_ids_por_handles(
    rows: Iterable[dict],
    handles: Any,
    contrato_id: Optional[int] = None,
) -> list[int]:
    """IDs de presupuesto cuyo ent_handle o txt_handle está en la selección.

    Un registro seleccionado por geometría y por texto cuenta una sola vez.
    No incluye filas dadas de baja.
    """
    wanted = set(normalizar_handles(handles))
    if not wanted:
        return []
    found: list[int] = []
    seen: set[int] = set()
    for row in rows or []:
        if not isinstance(row, dict) or _dado_de_baja(row):
            continue
        if contrato_id is not None and row.get("contrato_id") is not None:
            try:
                if int(row.get("contrato_id")) != int(contrato_id):
                    continue
            except (TypeError, ValueError):
                continue
        ent = str(row.get("ent_handle") or "").strip().upper()
        txt = str(row.get("txt_handle") or "").strip().upper()
        if ent not in wanted and txt not in wanted:
            continue
        try:
            rid = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        if rid <= 0 or rid in seen:
            continue
        seen.add(rid)
        found.append(rid)
    return found


def consulta_or_handles(handles: list[str]) -> str:
    """Filtro PostgREST: coincidencia exacta sin distinguir mayúsculas."""
    parts: list[str] = []
    for h in handles:
        parts.append(f"ent_handle.ilike.{h}")
        parts.append(f"txt_handle.ilike.{h}")
    return ",".join(parts)


def trozos_handles(handles: list[str], n: int = _CHUNK) -> list[list[str]]:
    if n < 1:
        n = _CHUNK
    return [handles[i : i + n] for i in range(0, len(handles), n)]


def mensaje_filtro(ids: list[int], n_handles: int, *, sin_visibles: bool = False) -> Optional[str]:
    if ids:
        return None
    if sin_visibles:
        return MSG_SIN_VISIBLES
    if n_handles <= 0:
        return MSG_SIN_SELECCION
    return MSG_SIN_COINCIDENCIAS


def payload_filtro_activo(ids: list[int], usuario_id: int, n_handles: int) -> dict:
    return {
        "ids": list(ids),
        "usuario_id": int(usuario_id),
        "sin_coincidencias": len(ids) == 0,
        "handles_consultados": int(n_handles),
    }


def _payload_dict(payload: Any) -> dict:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, str) and payload.strip():
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def usuario_de_fila_cad(row: dict) -> int:
    payload = _payload_dict(row.get("payload"))
    for raw in (row.get("usuario_id"), payload.get("usuario_id")):
        try:
            n = int(raw)
        except (TypeError, ValueError):
            continue
        if n > 0:
            return n
    return 0


def ids_desde_payload(payload: Any) -> list[int]:
    raw = _payload_dict(payload).get("ids") or []
    if not isinstance(raw, (list, tuple)):
        return []
    out: list[int] = []
    seen: set[int] = set()
    for x in raw:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen:
            continue
        seen.add(n)
        out.append(n)
    return out


def fila_pertenece_a_usuario(row: dict, usuario_id: int) -> bool:
    try:
        uid = int(usuario_id)
    except (TypeError, ValueError):
        return False
    return uid > 0 and usuario_de_fila_cad(row) == uid


def elegir_filtro_pendiente(rows: Iterable[dict], usuario_id: int) -> Optional[dict]:
    """La operación ``filtro_activo`` pendiente más reciente de ese usuario."""
    mejor: Optional[dict] = None
    mejor_id = -1
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("tipo") or "") != "filtro_activo":
            continue
        if str(row.get("estado") or "") != "pendiente":
            continue
        if not fila_pertenece_a_usuario(row, usuario_id):
            continue
        try:
            rid = int(row.get("id") or 0)
        except (TypeError, ValueError):
            continue
        if rid >= mejor_id:
            mejor = row
            mejor_id = rid
    return mejor


def ids_a_cerrar(rows: Iterable[dict], usuario_id: int) -> list[int]:
    out: list[int] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("tipo") or "") != "filtro_activo":
            continue
        if str(row.get("estado") or "") != "pendiente":
            continue
        if not fila_pertenece_a_usuario(row, usuario_id):
            continue
        try:
            rid = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        if rid > 0:
            out.append(rid)
    return out


def resolver_usuario_filtro(jwt_user: Any, body_usuario_id: Any, query_usuario_id: Any) -> int:
    """JWT de ClaraCore si viene; si no, el usuario_id de claracore_prefs (Agent)."""
    if isinstance(jwt_user, dict):
        try:
            uid = int(jwt_user.get("sub") or jwt_user.get("id") or 0)
        except (TypeError, ValueError):
            uid = 0
        if uid > 0:
            return uid
    for raw in (body_usuario_id, query_usuario_id):
        try:
            n = int(raw or 0)
        except (TypeError, ValueError):
            continue
        if n > 0:
            return n
    return 0
