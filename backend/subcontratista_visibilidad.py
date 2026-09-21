"""
Visibilidad y aislamiento para usuarios con cargo «subcontratista».

- Cada usuario subcontratista se vincula a un solo registro de `subcontratistas`.
- Sin vínculo: no ve información de ningún subcontratista ni economía del contrato.
- Con vínculo: solo su subcontratista (cantidades/precios pactados propios);
  nunca economía del contrato principal ni datos de otros subcontratistas.

Helpers puros (testeables) + utilidades de query/redacción.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

# Id imposible para forzar resultado vacío en PostgREST (.eq).
_SUBCONTRATISTA_ID_VACIO = -1

# Campos económicos del contrato principal que el subcontratista no debe ver.
CAMPOS_ECONOMICOS_CONTRATO = (
    "vlr_unitario",
    "precio_unitario",
    "costo_directo",
    "costo_directo_validacion",
    "costo_directo_calc",
    "costo_total",
    "costo",
    "precio",
    "valor_unitario",
    "valor_total",
    "vlr_unitario_listado",
    "aiu",
    "iva",
    "anticipo",
    "amortizacion_pct",
)


def es_cargo_subcontratista(cargo_nombre: Optional[str]) -> bool:
    return (cargo_nombre or "").strip().lower() == "subcontratista"


def parse_subcontratista_id(raw: Any) -> Optional[int]:
    if raw is None or raw is False:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw if raw > 0 else None
    if isinstance(raw, float):
        if raw != raw:  # NaN
            return None
        return int(raw) if raw > 0 else None
    s = str(raw).strip()
    if not s or s.lower() in ("none", "null", "undefined", "nan", ""):
        return None
    try:
        n = int(s)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def scope_subcontratista(
    cargo_nombre: Optional[str],
    subcontratista_id: Any,
) -> Tuple[bool, Optional[int]]:
    """
    (restricted, forced_id).

    - restricted=False → sin filtro por cargo subcontratista.
    - restricted=True, forced_id=int → forzar ese subcontratista_id.
    - restricted=True, forced_id=None → sin vínculo: resultado vacío.
    """
    if not es_cargo_subcontratista(cargo_nombre):
        return False, None
    return True, parse_subcontratista_id(subcontratista_id)


def scope_from_user_dict(current_user: Optional[dict]) -> Tuple[bool, Optional[int]]:
    """Lee cargo_nombre y subcontratista_id del JWT / dict de usuario."""
    u = current_user or {}
    cargo = u.get("cargo_nombre")
    sid = u.get("subcontratista_id")
    if sid is None:
        sid = u.get("sub_id")
    return scope_subcontratista(cargo, sid)


def apply_subcontratista_filter_q(q, restricted: bool, forced_id: Optional[int]):
    """Aplica .eq(subcontratista_id, …) o id vacío si restricted sin vínculo."""
    if not restricted:
        return q
    if forced_id is None:
        return q.eq("subcontratista_id", _SUBCONTRATISTA_ID_VACIO)
    return q.eq("subcontratista_id", int(forced_id))


def resolver_filtro_subcontratista_solicitado(
    restricted: bool,
    forced_id: Optional[int],
    solicitado: Optional[int],
) -> Optional[int]:
    """
    Para endpoints con query param subcontratista_id.
    Si restricted: siempre el propio (o vacío); rechaza pedir otro.
    Retorna el id a usar en la query (puede ser None solo si no restricted).
    Lanza ValueError con mensaje si intenta ver otro.
    """
    if not restricted:
        return solicitado
    if forced_id is None:
        return _SUBCONTRATISTA_ID_VACIO
    if solicitado is not None and int(solicitado) != int(forced_id):
        raise ValueError("No puede consultar información de otro subcontratista.")
    return int(forced_id)


def usuario_ve_valores_economicos_contrato(
    cargo_nombre: Optional[str],
    rol_nombre: Optional[str] = None,
) -> bool:
    """
    False para operativos/apoyo (legacy) y para cargo subcontratista
    (economía del contrato principal).
    """
    cargo = (cargo_nombre or "").strip().lower()
    if es_cargo_subcontratista(cargo):
        return False
    rol = (rol_nombre or "").strip().lower().replace("í", "i")
    if rol in ("operativo contratista", "operativo interventoria"):
        return False
    return True


def ocultar_costo_directo_reportes(
    cargo_nombre: Optional[str],
    rol_nombre: Optional[str],
) -> bool:
    """Alineado con grilla SICOE: operativos + cargo subcontratista."""
    rol = (rol_nombre or "").strip().lower().replace("í", "i")
    if rol in ("operativo contratista", "operativo interventoria"):
        return True
    return es_cargo_subcontratista(cargo_nombre)


def redactar_valores_economicos_contrato(row: Any) -> Any:
    """Anula montos/VU del contrato principal en un dict (in-place copy)."""
    if not isinstance(row, dict):
        return row
    out = dict(row)
    for k in CAMPOS_ECONOMICOS_CONTRATO:
        if k in out:
            out[k] = None
    return out


def redactar_filas_economicos_contrato(rows: Optional[Iterable[Any]]) -> List[Any]:
    if not rows:
        return []
    return [redactar_valores_economicos_contrato(r) for r in rows]


def validar_vinculo_subcontratista_en_contrato(
    *,
    cargo_nombre: Optional[str],
    subcontratista_id: Any,
    subcontratista_contrato_id: Any,
    usuario_contrato_id: Any,
) -> Optional[str]:
    """
    Valida asignación en Gestión de usuarios.
    Retorna mensaje de error o None si OK.
    """
    if not es_cargo_subcontratista(cargo_nombre):
        return None
    sid = parse_subcontratista_id(subcontratista_id)
    if sid is None:
        return "El cargo Subcontratista requiere asignar un subcontratista del contrato."
    try:
        scid = int(subcontratista_contrato_id) if subcontratista_contrato_id is not None else None
    except (TypeError, ValueError):
        scid = None
    try:
        ucid = int(usuario_contrato_id) if usuario_contrato_id is not None else None
    except (TypeError, ValueError):
        ucid = None
    if ucid is None:
        return "Asigne un contrato principal antes de vincular el subcontratista."
    if scid is None or scid != ucid:
        return "El subcontratista seleccionado no pertenece al contrato del usuario."
    return None
