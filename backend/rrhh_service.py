"""
Servicio RRHH — trabajadores, tipos de contrato y empresas contratantes.
Sin integración con Bitácora ni con el módulo Subcontratistas (solo lectura de nombres).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("claracore.rrhh")

_TABLE_TIPOS = "rrhh_tipos_contrato"
_TABLE_TRAB = "rrhh_trabajadores"

TIPOS_CONTRATO_DEFAULT = (
    "Término fijo",
    "Término indefinido",
    "Obra o labor",
    "Prestación de servicios",
)

DOCUMENTO_TIPOS = ("CC", "CE", "TI", "PA", "NIT", "OTRO")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(current_user) -> Optional[int]:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        return None


def _trim(val: Any, *, max_len: int = 500) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    return s[:max_len]


def _require_str(val: Any, label: str, *, min_len: int = 1, max_len: int = 300) -> str:
    s = _trim(val, max_len=max_len)
    if not s or len(s) < min_len:
        raise ValueError(f"{label} es obligatorio.")
    return s


def _parse_bool(val: Any, default: bool = False) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("1", "true", "si", "sí", "yes", "y"):
        return True
    if s in ("0", "false", "no", "n"):
        return False
    return default


def _parse_money(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        n = float(val)
    except (TypeError, ValueError) as exc:
        raise ValueError("Salario inválido.") from exc
    if n < 0:
        raise ValueError("El salario no puede ser negativo.")
    return round(n, 2)


def ensure_tipos_contrato_default(sb, contrato_id: int, current_user=None) -> List[dict]:
    """Crea tipos por defecto si el catálogo del contrato está vacío."""
    cid = int(contrato_id)
    existing = (
        sb.table(_TABLE_TIPOS)
        .select("id")
        .eq("contrato_id", cid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return list_tipos_contrato(sb, cid, solo_activos=False)
    uid = _uid(current_user) if current_user else None
    rows = []
    for i, nombre in enumerate(TIPOS_CONTRATO_DEFAULT):
        payload = {
            "contrato_id": cid,
            "nombre": nombre,
            "descripcion": None,
            "activo": True,
            "orden": i + 1,
            "created_by": uid,
        }
        ins = sb.table(_TABLE_TIPOS).insert(payload).execute().data
        if ins:
            rows.append(ins[0])
    return rows or list_tipos_contrato(sb, cid, solo_activos=False)


def list_tipos_contrato(sb, contrato_id: int, *, solo_activos: bool = False) -> List[dict]:
    q = (
        sb.table(_TABLE_TIPOS)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .order("orden")
        .order("nombre")
    )
    if solo_activos:
        q = q.eq("activo", True)
    return q.execute().data or []


def create_tipo_contrato(sb, contrato_id: int, body: dict, current_user) -> dict:
    nombre = _require_str(body.get("nombre"), "Nombre del tipo de contrato", min_len=2, max_len=200)
    payload = {
        "contrato_id": int(contrato_id),
        "nombre": nombre,
        "descripcion": _trim(body.get("descripcion"), max_len=1000),
        "activo": _parse_bool(body.get("activo"), True),
        "orden": int(body.get("orden") or 0),
        "created_by": _uid(current_user),
    }
    try:
        rows = sb.table(_TABLE_TIPOS).insert(payload).execute().data or []
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            raise ValueError("Ya existe un tipo de contrato con ese nombre.") from exc
        raise
    if not rows:
        raise ValueError("No se pudo crear el tipo de contrato.")
    return rows[0]


def update_tipo_contrato(sb, contrato_id: int, tipo_id: int, body: dict, current_user) -> dict:
    rows = (
        sb.table(_TABLE_TIPOS)
        .select("*")
        .eq("id", int(tipo_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Tipo de contrato no encontrado.")
    patch: Dict[str, Any] = {
        "updated_at": _now_iso(),
        "updated_by": _uid(current_user),
    }
    if "nombre" in body:
        patch["nombre"] = _require_str(body.get("nombre"), "Nombre del tipo de contrato", min_len=2, max_len=200)
    if "descripcion" in body:
        patch["descripcion"] = _trim(body.get("descripcion"), max_len=1000)
    if "activo" in body:
        patch["activo"] = _parse_bool(body.get("activo"), True)
    if "orden" in body and body.get("orden") is not None:
        patch["orden"] = int(body["orden"])
    try:
        updated = (
            sb.table(_TABLE_TIPOS)
            .update(patch)
            .eq("id", int(tipo_id))
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            raise ValueError("Ya existe un tipo de contrato con ese nombre.") from exc
        raise
    if not updated:
        raise ValueError("No se pudo actualizar el tipo de contrato.")
    return updated[0]


def get_tipo_contrato(sb, contrato_id: int, tipo_id: int) -> Optional[dict]:
    rows = (
        sb.table(_TABLE_TIPOS)
        .select("*")
        .eq("id", int(tipo_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def list_empresas_contratantes(sb, contrato_id: int) -> dict:
    """
    Opciones de empresa contratante:
    - Consorcio / contratista principal (desde contratos.contratista)
    - Subcontratistas registrados (lectura de tabla; sin acoplar módulo Subcontratistas)
    """
    cid = int(contrato_id)
    crows = (
        sb.table("contratos")
        .select("id, contratista, nit, numero")
        .eq("id", cid)
        .limit(1)
        .execute()
        .data
        or []
    )
    c = crows[0] if crows else {}
    consorcio = {
        "tipo": "consorcio",
        "id": None,
        "nombre": (c.get("contratista") or "Consorcio / Contratista principal").strip()
        or "Consorcio / Contratista principal",
        "nit": (c.get("nit") or "").strip() or None,
        "label": f"Consorcio — {(c.get('contratista') or 'Contratista principal').strip()}",
    }
    subs = (
        sb.table("subcontratistas")
        .select("id, razon_social, nit, activo")
        .eq("contrato_id", cid)
        .order("razon_social")
        .execute()
        .data
        or []
    )
    sub_opts = []
    for s in subs:
        if s.get("activo") is False:
            continue
        nombre = (s.get("razon_social") or "").strip()
        if not nombre:
            continue
        sub_opts.append(
            {
                "tipo": "subcontratista",
                "id": s.get("id"),
                "nombre": nombre,
                "nit": (s.get("nit") or "").strip() or None,
                "label": f"Subcontratista — {nombre}",
            }
        )
    return {"consorcio": consorcio, "subcontratistas": sub_opts, "opciones": [consorcio, *sub_opts]}


def _resolve_empresa(sb, contrato_id: int, body: dict) -> Dict[str, Any]:
    empresas = list_empresas_contratantes(sb, contrato_id)
    tipo = _trim(body.get("empresa_tipo"), max_len=40) or "consorcio"
    tipo = tipo.lower()
    if tipo not in ("consorcio", "subcontratista"):
        raise ValueError("empresa_tipo debe ser «consorcio» o «subcontratista».")

    if tipo == "consorcio":
        c = empresas["consorcio"]
        return {
            "empresa_tipo": "consorcio",
            "empresa_nombre": c["nombre"],
            "empresa_nit": c.get("nit"),
            "empresa_subcontratista_id": None,
        }

    sub_id = body.get("empresa_subcontratista_id")
    if sub_id is None or str(sub_id).strip() == "":
        raise ValueError("Seleccione el subcontratista contratante.")
    try:
        sid = int(sub_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("Subcontratista inválido.") from exc
    match = next((s for s in empresas["subcontratistas"] if int(s["id"]) == sid), None)
    if not match:
        # Fallback: permitir nombre explícito si el sub ya no está activo
        nombre = _trim(body.get("empresa_nombre"), max_len=300)
        if not nombre:
            raise ValueError("Subcontratista no encontrado o inactivo.")
        return {
            "empresa_tipo": "subcontratista",
            "empresa_nombre": nombre,
            "empresa_nit": _trim(body.get("empresa_nit"), max_len=80),
            "empresa_subcontratista_id": sid,
        }
    return {
        "empresa_tipo": "subcontratista",
        "empresa_nombre": match["nombre"],
        "empresa_nit": match.get("nit"),
        "empresa_subcontratista_id": sid,
    }


def _payload_trabajador(sb, contrato_id: int, body: dict, *, partial: bool = False) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    def set_req(key: str, label: str, **kw):
        if key in body or not partial:
            out[key] = _require_str(body.get(key), label, **kw)

    def set_opt(key: str, max_len: int = 300):
        if key in body or not partial:
            out[key] = _trim(body.get(key), max_len=max_len)

    set_req("nombres", "Nombres", max_len=200)
    set_req("apellidos", "Apellidos", max_len=200)

    if "tipo_documento" in body or not partial:
        td = (_trim(body.get("tipo_documento"), max_len=20) or "CC").upper()
        out["tipo_documento"] = td

    set_req("numero_documento", "Número de documento", min_len=3, max_len=40)

    for k in (
        "fecha_nacimiento",
        "genero",
        "direccion",
        "ciudad",
        "telefono",
        "email",
        "emergencia_nombre",
        "emergencia_parentesco",
        "emergencia_telefono",
        "eps",
        "pension",
        "cesantias",
        "arl",
        "caja_compensacion",
        "cargo_aspira",
        "notas",
    ):
        max_len = 1000 if k in ("direccion", "notas") else 300
        set_opt(k, max_len=max_len)

    if "salario" in body or not partial:
        out["salario"] = _parse_money(body.get("salario"))

    if "subsidio_transporte" in body or not partial:
        out["subsidio_transporte"] = _parse_bool(body.get("subsidio_transporte"), False)

    if "estado" in body:
        est = (_trim(body.get("estado"), max_len=20) or "activo").lower()
        if est not in ("activo", "inactivo", "retirado"):
            raise ValueError("Estado inválido.")
        out["estado"] = est
    elif not partial:
        out["estado"] = "activo"

    if "tipo_contrato_id" in body or not partial:
        tid = body.get("tipo_contrato_id")
        if tid is None or tid == "":
            out["tipo_contrato_id"] = None
        else:
            tipo = get_tipo_contrato(sb, contrato_id, int(tid))
            if not tipo:
                raise ValueError("Tipo de contrato no encontrado.")
            out["tipo_contrato_id"] = int(tipo["id"])

    if (
        "empresa_tipo" in body
        or "empresa_subcontratista_id" in body
        or "empresa_nombre" in body
        or not partial
    ):
        out.update(_resolve_empresa(sb, contrato_id, body if (body.get("empresa_tipo") or not partial) else {
            **body,
            "empresa_tipo": body.get("empresa_tipo") or "consorcio",
        }))

    return out


def list_trabajadores(
    sb,
    contrato_id: int,
    *,
    q: Optional[str] = None,
    estado: Optional[str] = None,
) -> List[dict]:
    query = (
        sb.table(_TABLE_TRAB)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("apellidos")
        .order("nombres")
    )
    if estado:
        query = query.eq("estado", estado.strip().lower())
    rows = query.execute().data or []
    needle = (q or "").strip().lower()
    if needle:
        rows = [
            r
            for r in rows
            if needle in f"{r.get('nombres') or ''} {r.get('apellidos') or ''}".lower()
            or needle in str(r.get("numero_documento") or "").lower()
            or needle in str(r.get("cargo_aspira") or "").lower()
            or needle in str(r.get("empresa_nombre") or "").lower()
        ]
    return rows


def get_trabajador(sb, contrato_id: int, trabajador_id: int) -> dict:
    rows = (
        sb.table(_TABLE_TRAB)
        .select("*")
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Trabajador no encontrado.")
    return rows[0]


def create_trabajador(sb, contrato_id: int, body: dict, current_user) -> dict:
    ensure_tipos_contrato_default(sb, contrato_id, current_user)
    payload = _payload_trabajador(sb, contrato_id, body or {}, partial=False)
    payload["contrato_id"] = int(contrato_id)
    payload["created_by"] = _uid(current_user)
    try:
        rows = sb.table(_TABLE_TRAB).insert(payload).execute().data or []
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            raise ValueError("Ya existe un trabajador con ese documento en este contrato.") from exc
        raise
    if not rows:
        raise ValueError("No se pudo registrar el trabajador.")
    return rows[0]


def update_trabajador(sb, contrato_id: int, trabajador_id: int, body: dict, current_user) -> dict:
    get_trabajador(sb, contrato_id, trabajador_id)
    payload = _payload_trabajador(sb, contrato_id, body or {}, partial=True)
    payload["updated_at"] = _now_iso()
    payload["updated_by"] = _uid(current_user)
    try:
        rows = (
            sb.table(_TABLE_TRAB)
            .update(payload)
            .eq("id", int(trabajador_id))
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            raise ValueError("Ya existe un trabajador con ese documento en este contrato.") from exc
        raise
    if not rows:
        raise ValueError("No se pudo actualizar el trabajador.")
    return rows[0]


def soft_delete_trabajador(sb, contrato_id: int, trabajador_id: int, current_user) -> dict:
    get_trabajador(sb, contrato_id, trabajador_id)
    rows = (
        sb.table(_TABLE_TRAB)
        .update(
            {
                "eliminado_en": _now_iso(),
                "eliminado_por": _uid(current_user),
                "updated_at": _now_iso(),
                "updated_by": _uid(current_user),
                "estado": "inactivo",
            }
        )
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("No se pudo eliminar el trabajador.")
    return rows[0]


def trabajador_display_nombre(trab: dict) -> str:
    return f"{(trab.get('nombres') or '').strip()} {(trab.get('apellidos') or '').strip()}".strip()
