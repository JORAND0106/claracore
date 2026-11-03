"""
Visibilidad y aislamiento por empresa del usuario (Gestión de usuarios).

Regla:
- Si la empresa asignada es un subcontratista (`subcontratista_id` o
  `empresa_tipo=subcontratista`), se aplica aislamiento: solo datos de ese
  subcontratista, sin economía del contrato principal. Independiente del cargo
  y del rol (incluido operativo del contratista).
- Si la empresa es contratista o interventoría, este campo no activa
  restricciones propias (rigen permisos/roles habituales).
- El cargo «Subcontratista» sigue exigiendo empresa subcontratista (obligatorio).

Helpers puros (testeables) + utilidades de query/redacción.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple

# Id imposible para forzar resultado vacío en PostgREST (.eq).
_SUBCONTRATISTA_ID_VACIO = -1

EMPRESA_TIPOS = ("contratista", "interventoria", "subcontratista")

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


def normalizar_empresa_tipo(empresa_tipo: Optional[str]) -> Optional[str]:
    t = (empresa_tipo or "").strip().lower().replace("í", "i")
    if not t:
        return None
    if t in ("interventoria", "interventoría"):
        return "interventoria"
    if t in ("contratista", "consorcio"):
        return "contratista"
    if t == "subcontratista":
        return "subcontratista"
    return None


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
    empresa_tipo: Optional[str] = None,
) -> Tuple[bool, Optional[int]]:
    """
    (restricted, forced_id).

    Aislamiento por empresa subcontratista (no por cargo/rol):
    - empresa contratista/interventoría → sin restricción por este campo.
    - subcontratista_id válido → forzar ese id.
    - empresa_tipo=subcontratista sin id, o cargo Subcontratista sin vínculo →
      restricted vacío.
    """
    tipo = normalizar_empresa_tipo(empresa_tipo)
    if tipo in ("contratista", "interventoria"):
        return False, None

    sid = parse_subcontratista_id(subcontratista_id)
    if sid is not None:
        return True, sid

    if tipo == "subcontratista" or es_cargo_subcontratista(cargo_nombre):
        return True, None

    return False, None


def scope_from_user_dict(current_user: Optional[dict]) -> Tuple[bool, Optional[int]]:
    """Lee cargo_nombre, empresa_tipo y subcontratista_id del JWT / dict de usuario."""
    u = current_user or {}
    cargo = u.get("cargo_nombre")
    sid = u.get("subcontratista_id")
    if sid is None:
        sid = u.get("sub_id")
    empresa_tipo = u.get("empresa_tipo")
    return scope_subcontratista(cargo, sid, empresa_tipo=empresa_tipo)


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
    subcontratista_id: Any = None,
    empresa_tipo: Optional[str] = None,
) -> bool:
    """
    False si hay aislamiento por empresa subcontratista, o roles operativos/apoyo
    (legacy: sin economía del contrato principal).
    """
    restricted, _ = scope_subcontratista(
        cargo_nombre, subcontratista_id, empresa_tipo=empresa_tipo
    )
    if restricted:
        return False
    rol = (rol_nombre or "").strip().lower().replace("í", "i")
    if rol in ("operativo contratista", "operativo interventoria"):
        return False
    return True


def ocultar_costo_directo_reportes(
    cargo_nombre: Optional[str],
    rol_nombre: Optional[str],
    subcontratista_id: Any = None,
    empresa_tipo: Optional[str] = None,
) -> bool:
    """Alineado con grilla SICOE: operativos + aislamiento por empresa sub."""
    rol = (rol_nombre or "").strip().lower().replace("í", "i")
    if rol in ("operativo contratista", "operativo interventoria"):
        return True
    restricted, _ = scope_subcontratista(
        cargo_nombre, subcontratista_id, empresa_tipo=empresa_tipo
    )
    return restricted


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
    empresa_tipo: Optional[str] = None,
) -> Optional[str]:
    """
    Valida asignación de Empresa en Gestión de usuarios.
    Retorna mensaje de error o None si OK.

    - Cargo Subcontratista → empresa subcontratista obligatoria del mismo contrato.
    - Otros cargos → empresa opcional; si es subcontratista, debe pertenecer al contrato.
    - empresa_tipo contratista/interventoría → no debe llevar subcontratista_id.
    """
    tipo = normalizar_empresa_tipo(empresa_tipo)
    sid = parse_subcontratista_id(subcontratista_id)

    if tipo in ("contratista", "interventoria"):
        if sid is not None:
            return "Con empresa contratista o interventoría no debe asignarse un subcontratista."
        return None

    requiere_sub = es_cargo_subcontratista(cargo_nombre) or tipo == "subcontratista"
    if not requiere_sub and sid is None:
        return None

    if sid is None:
        if es_cargo_subcontratista(cargo_nombre):
            return "El cargo Subcontratista requiere asignar una empresa subcontratista del contrato."
        return "Seleccione el subcontratista de la empresa asignada."

    try:
        scid = int(subcontratista_contrato_id) if subcontratista_contrato_id is not None else None
    except (TypeError, ValueError):
        scid = None
    try:
        ucid = int(usuario_contrato_id) if usuario_contrato_id is not None else None
    except (TypeError, ValueError):
        ucid = None
    if ucid is None:
        return "Asigne un contrato principal antes de vincular la empresa."
    if scid is None or scid != ucid:
        return "El subcontratista seleccionado no pertenece al contrato del usuario."
    return None


def resolver_empresa_desde_key(empresa_key: Optional[str]) -> Tuple[Optional[str], Optional[int]]:
    """
    Interpreta claves del selector: 'contratista' | 'interventoria' | 'sub:{id}'.
    Retorna (empresa_tipo, subcontratista_id).
    """
    key = (empresa_key or "").strip()
    if not key:
        return None, None
    low = key.lower().replace("í", "i")
    if low in ("contratista", "consorcio"):
        return "contratista", None
    if low == "interventoria":
        return "interventoria", None
    if low.startswith("sub:"):
        return "subcontratista", parse_subcontratista_id(low[4:])
    # Id numérico crudo → subcontratista
    sid = parse_subcontratista_id(key)
    if sid is not None:
        return "subcontratista", sid
    return None, None
