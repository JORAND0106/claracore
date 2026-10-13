"""Política de escritura por tema (expositor + elaborador) en actas nuevas.

Actas con ``flujo_tabs.v >= 2`` o ``temas_escritura_expositor: true``.
Las actas anteriores siguen con edición exclusiva del elaborador.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set


def acta_usa_escritura_expositor(acta: Optional[dict]) -> bool:
    if not isinstance(acta, dict):
        return False
    flujo = acta.get("flujo_tabs")
    if isinstance(flujo, str):
        import json
        try:
            flujo = json.loads(flujo)
        except Exception:
            flujo = {}
    if not isinstance(flujo, dict):
        return False
    if flujo.get("temas_escritura_expositor"):
        return True
    try:
        v = int(flujo.get("v")) if flujo.get("v") is not None else 0
    except (TypeError, ValueError):
        v = 0
    return v >= 2


def _uid(raw) -> Optional[int]:
    if raw is None or raw == "" or raw == 0 or raw == "0":
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def expositor_id_desde_orden(acta: dict, idea: dict) -> Optional[int]:
    """Resuelve expositor_usuario_id desde la idea o el punto del orden del día."""
    if not isinstance(idea, dict):
        return None
    direct = _uid(idea.get("expositor_usuario_id") or idea.get("expositor_id"))
    if direct:
        return direct
    orden = acta.get("orden_del_dia") if isinstance(acta, dict) else None
    if isinstance(orden, str):
        import json
        try:
            orden = json.loads(orden)
        except Exception:
            orden = None
    # orden puede ser lista o {orden: [...]} / checklist
    items: List[dict] = []
    if isinstance(orden, list):
        items = [x for x in orden if isinstance(x, dict)]
    elif isinstance(orden, dict):
        inner = orden.get("orden") or orden.get("items") or orden.get("checklist")
        if isinstance(inner, list):
            items = [x for x in inner if isinstance(x, dict)]
    titulo = (idea.get("titulo") or "").strip().lower()
    clave = str(idea.get("_claveGrabacion") or idea.get("clave_grabacion") or "").strip().lower()
    for i, it in enumerate(items):
        exp = _uid(it.get("expositor_usuario_id") or it.get("expositor_id"))
        if not exp:
            continue
        it_titulo = str(it.get("texto") or it.get("titulo") or "").strip().lower()
        if titulo and it_titulo and titulo == it_titulo:
            return exp
        # od-N
        if clave and clave == f"od-{i + 1}":
            return exp
    return None


def puede_editar_tema(
    acta: dict,
    idea: Optional[dict],
    user_id: int,
    current_user: Optional[dict] = None,
    *,
    es_desarrollador: bool = False,
) -> bool:
    """True si el usuario puede modificar texto/compromisos de este tema."""
    if es_desarrollador:
        return True
    if not acta_usa_escritura_expositor(acta):
        # Legacy: quien ya pasó _assert_puede_editar_acta (elaborador) puede todo.
        elab = _uid(acta.get("elaborador_id"))
        return elab is not None and elab == int(user_id)
    elab = _uid(acta.get("elaborador_id"))
    if elab is not None and elab == int(user_id):
        return True
    exp = expositor_id_desde_orden(acta, idea or {})
    if exp is not None and exp == int(user_id):
        return True
    # Expositor externo / sin usuario → solo elaborador (ya cubierto arriba).
    return False


def usuario_puede_guardar_algun_tema(
    acta: dict,
    ideas: List[dict],
    user_id: int,
    *,
    es_desarrollador: bool = False,
) -> bool:
    if es_desarrollador:
        return True
    if not acta_usa_escritura_expositor(acta):
        elab = _uid(acta.get("elaborador_id"))
        return elab is not None and elab == int(user_id)
    elab = _uid(acta.get("elaborador_id"))
    if elab is not None and elab == int(user_id):
        return True
    for idea in ideas or []:
        if puede_editar_tema(acta, idea, user_id, es_desarrollador=False):
            return True
    return False


def filtrar_ideas_para_sync(
    acta: dict,
    ideas_payload: list,
    ideas_existentes: List[dict],
    user_id: int,
    *,
    es_desarrollador: bool = False,
) -> Dict[str, Any]:
    """
    Para expositor (no elaborador): solo actualiza sus temas; no inserta ni borra.

    Returns dict with keys: ideas (list to apply), skip_deletes (bool),
    forbidden (bool if tried to change others).
    """
    if es_desarrollador or not acta_usa_escritura_expositor(acta):
        return {"ideas": list(ideas_payload or []), "skip_deletes": False, "expositor_only": False}
    elab = _uid(acta.get("elaborador_id"))
    if elab is not None and elab == int(user_id):
        return {"ideas": list(ideas_payload or []), "skip_deletes": False, "expositor_only": False}

    by_id = {int(r["id"]): r for r in (ideas_existentes or []) if r.get("id") is not None}
    out = []
    forbidden = False
    for idea in ideas_payload or []:
        if not isinstance(idea, dict):
            continue
        iid = idea.get("id")
        if iid is None:
            # Solo elaborador crea temas nuevos
            forbidden = True
            continue
        try:
            iid_i = int(iid)
        except (TypeError, ValueError):
            continue
        existing = by_id.get(iid_i) or {}
        merged = {**existing, **idea}
        if not puede_editar_tema(acta, merged, user_id, es_desarrollador=False):
            forbidden = True
            continue
        out.append(idea)
    return {"ideas": out, "skip_deletes": True, "expositor_only": True, "forbidden": forbidden}
