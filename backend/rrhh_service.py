"""
Servicio RRHH — trabajadores, catálogo reutilizable y empresas contratantes.
Lectura de Subcontratistas solo para listar empresas/NIT (sin modificar ese módulo).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("claracore.rrhh")

_TABLE_CATALOGO = "rrhh_catalogo_opciones"
_TABLE_TRAB = "rrhh_trabajadores"

CATALOG_CATEGORIAS = frozenset({
    "eps",
    "pension",
    "cesantias",
    "arl",
    "caja_compensacion",
    "cargo",
    "tipo_contrato",
    "parentesco",
})

CATALOG_DEFAULTS = {
    "tipo_contrato": (
        "Término fijo",
        "Término indefinido",
        "Obra o labor",
        "Prestación de servicios",
    ),
    "eps": (
        "Nueva EPS",
        "Sura",
        "Sanitas",
        "Compensar",
        "Famisanar",
        "Salud Total",
        "Coomeva",
        "Aliansalud",
    ),
    "pension": (
        "Colpensiones",
        "Porvenir",
        "Protección",
        "Colfondos",
        "Skandia",
    ),
    "cesantias": (
        "Porvenir",
        "Protección",
        "Colfondos",
        "FNA",
        "Skandia",
    ),
    "arl": (
        "Sura",
        "Positiva",
        "Colmena",
        "Bolívar",
        "Equidad",
        "AXA Colpatria",
    ),
    "caja_compensacion": (
        "Compensar",
        "Cafam",
        "Colsubsidio",
        "Comfenalco",
        "Comfama",
    ),
    "cargo": (),
    "parentesco": (
        "Padre",
        "Madre",
        "Cónyuge",
        "Hijo",
        "Hija",
        "Hermano",
        "Hermana",
        "Abuelo",
        "Abuela",
        "Tío",
        "Tía",
        "Primo",
        "Prima",
        "Suegro",
        "Suegra",
        "Amigo",
        "Amiga",
    ),
}

TIPOS_SANGRE = frozenset({"O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"})


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


def _norm_valor(valor: str) -> str:
    s = str(valor or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _validate_categoria(categoria: str) -> str:
    cat = (categoria or "").strip().lower()
    if cat not in CATALOG_CATEGORIAS:
        raise ValueError(
            "Categoría de catálogo inválida. Use: eps, pension, cesantias, arl, "
            "caja_compensacion, cargo, tipo_contrato, parentesco."
        )
    return cat


def list_catalogo(sb, contrato_id: int, categoria: str) -> List[dict]:
    cat = _validate_categoria(categoria)
    ensure_catalogo_defaults(sb, contrato_id, cat)
    return (
        sb.table(_TABLE_CATALOGO)
        .select("id, categoria, valor, activo")
        .eq("contrato_id", int(contrato_id))
        .eq("categoria", cat)
        .eq("activo", True)
        .order("valor")
        .execute()
        .data
        or []
    )


def list_catalogo_todos(sb, contrato_id: int) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {c: [] for c in sorted(CATALOG_CATEGORIAS)}
    for cat in CATALOG_CATEGORIAS:
        ensure_catalogo_defaults(sb, contrato_id, cat)
    rows = (
        sb.table(_TABLE_CATALOGO)
        .select("categoria, valor")
        .eq("contrato_id", int(contrato_id))
        .eq("activo", True)
        .order("valor")
        .execute()
        .data
        or []
    )
    for r in rows:
        cat = r.get("categoria")
        val = (r.get("valor") or "").strip()
        if cat in out and val and val not in out[cat]:
            out[cat].append(val)
    return out


def ensure_catalogo_defaults(sb, contrato_id: int, categoria: str, current_user=None) -> None:
    cat = _validate_categoria(categoria)
    defaults = CATALOG_DEFAULTS.get(cat) or ()
    if not defaults:
        return
    existing = (
        sb.table(_TABLE_CATALOGO)
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("categoria", cat)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return
    uid = _uid(current_user) if current_user else None
    for valor in defaults:
        try:
            add_catalogo_opcion(sb, contrato_id, cat, valor, current_user={"sub": uid} if uid else {})
        except Exception:
            pass


def add_catalogo_opcion(sb, contrato_id: int, categoria: str, valor: str, current_user=None) -> dict:
    cat = _validate_categoria(categoria)
    v = _require_str(valor, "Valor", min_len=1, max_len=200)
    norm = _norm_valor(v)
    existing = (
        sb.table(_TABLE_CATALOGO)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("categoria", cat)
        .eq("valor_norm", norm)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        row = existing[0]
        if not row.get("activo"):
            updated = (
                sb.table(_TABLE_CATALOGO)
                .update({"activo": True, "valor": v})
                .eq("id", row["id"])
                .execute()
                .data
                or []
            )
            return updated[0] if updated else {**row, "activo": True, "valor": v}
        return row
    payload = {
        "contrato_id": int(contrato_id),
        "categoria": cat,
        "valor": v,
        "valor_norm": norm,
        "activo": True,
        "created_by": _uid(current_user) if current_user else None,
    }
    try:
        rows = sb.table(_TABLE_CATALOGO).insert(payload).execute().data or []
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            again = (
                sb.table(_TABLE_CATALOGO)
                .select("*")
                .eq("contrato_id", int(contrato_id))
                .eq("categoria", cat)
                .eq("valor_norm", norm)
                .limit(1)
                .execute()
                .data
                or []
            )
            if again:
                return again[0]
            raise ValueError("Esa opción ya existe en el catálogo.") from exc
        raise
    if not rows:
        raise ValueError("No se pudo agregar la opción al catálogo.")
    return rows[0]


def list_empresas_contratantes(sb, contrato_id: int) -> dict:
    """
    Consorcio (contratos.contratista/nit) + subcontratistas registrados.
    Un solo listado para el selector de empresa contratante.
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
    consorcio_nombre = (c.get("contratista") or "Consorcio / Contratista principal").strip() or (
        "Consorcio / Contratista principal"
    )
    consorcio = {
        "key": "consorcio",
        "tipo": "consorcio",
        "id": None,
        "nombre": consorcio_nombre,
        "nit": (c.get("nit") or "").strip() or None,
        "label": f"Consorcio — {consorcio_nombre}",
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
        sid = s.get("id")
        sub_opts.append(
            {
                "key": f"sub:{sid}",
                "tipo": "subcontratista",
                "id": sid,
                "nombre": nombre,
                "nit": (s.get("nit") or "").strip() or None,
                "label": f"Subcontratista — {nombre}",
            }
        )
    return {"consorcio": consorcio, "subcontratistas": sub_opts, "opciones": [consorcio, *sub_opts]}


def _resolve_empresa(sb, contrato_id: int, body: dict) -> Dict[str, Any]:
    empresas = list_empresas_contratantes(sb, contrato_id)
    # Prefer explicit key (consorcio | sub:ID)
    key = _trim(body.get("empresa_key"), max_len=80)
    if key:
        match = next((e for e in empresas["opciones"] if e.get("key") == key), None)
        if not match:
            raise ValueError("Empresa contratante no encontrada.")
        return {
            "empresa_tipo": match["tipo"],
            "empresa_nombre": match["nombre"],
            "empresa_nit": match.get("nit"),
            "empresa_subcontratista_id": match.get("id"),
        }

    tipo = (_trim(body.get("empresa_tipo"), max_len=40) or "consorcio").lower()
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
        raise ValueError("Seleccione la empresa contratante (subcontratista).")
    try:
        sid = int(sub_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("Subcontratista inválido.") from exc
    match = next((s for s in empresas["subcontratistas"] if int(s["id"]) == sid), None)
    if not match:
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


def _maybe_persist_catalog_values(sb, contrato_id: int, payload: dict, current_user) -> None:
    """Persiste valores elegidos/nuevos en el catálogo reutilizable (sin duplicar)."""
    mapping = (
        ("eps", payload.get("eps")),
        ("pension", payload.get("pension")),
        ("cesantias", payload.get("cesantias")),
        ("arl", payload.get("arl")),
        ("caja_compensacion", payload.get("caja_compensacion")),
        ("cargo", payload.get("cargo_aspira")),
        ("tipo_contrato", payload.get("tipo_contrato")),
        ("parentesco", payload.get("emergencia_parentesco")),
    )
    for cat, valor in mapping:
        if valor and str(valor).strip():
            try:
                add_catalogo_opcion(sb, contrato_id, cat, str(valor), current_user)
            except Exception as exc:
                _log.debug("catalog persist %s: %s", cat, exc)


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
        "lugar_expedicion",
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
        "tipo_contrato",
        "notas",
    ):
        max_len = 4000 if k == "notas" else (1000 if k == "direccion" else 300)
        set_opt(k, max_len=max_len)

    if "tipo_sangre" in body or not partial:
        ts = _trim(body.get("tipo_sangre"), max_len=8)
        if ts:
            ts_up = ts.upper().replace(" ", "")
            if ts_up not in TIPOS_SANGRE:
                raise ValueError("Tipo de sangre inválido.")
            out["tipo_sangre"] = ts_up
        else:
            out["tipo_sangre"] = None

    if "salario" in body or not partial:
        out["salario"] = _parse_money(body.get("salario"))

    if "salario_liquidable" in body or not partial:
        out["salario_liquidable"] = _parse_bool(body.get("salario_liquidable"), True)

    if "subsidio_transporte" in body or not partial:
        out["subsidio_transporte"] = _parse_bool(body.get("subsidio_transporte"), False)

    if "estado" in body:
        est = (_trim(body.get("estado"), max_len=20) or "activo").lower()
        if est not in ("activo", "inactivo", "retirado"):
            raise ValueError("Estado inválido.")
        out["estado"] = est
    elif not partial:
        out["estado"] = "activo"

    if (
        "empresa_key" in body
        or "empresa_tipo" in body
        or "empresa_subcontratista_id" in body
        or "empresa_nombre" in body
        or not partial
    ):
        out.update(_resolve_empresa(sb, contrato_id, body if (body.get("empresa_tipo") or body.get("empresa_key") or not partial) else {
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
    payload = _payload_trabajador(sb, contrato_id, body or {}, partial=False)
    payload["contrato_id"] = int(contrato_id)
    payload["created_by"] = _uid(current_user)
    _maybe_persist_catalog_values(sb, contrato_id, payload, current_user)
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
    _maybe_persist_catalog_values(sb, contrato_id, payload, current_user)
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


_IMG_MIMES = frozenset({"image/jpeg", "image/png", "image/webp"})
_MAX_IMG_BYTES = 8 * 1024 * 1024


def _normalize_img_mime(content_type: Optional[str]) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def _validate_imagen(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > _MAX_IMG_BYTES:
        raise ValueError("La imagen supera el máximo de 8 MB.")
    mime = _normalize_img_mime(content_type)
    if mime not in _IMG_MIMES:
        raise ValueError("Formato no permitido. Use JPEG, PNG o WebP.")
    return mime


def set_trabajador_imagen(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    kind: str,
    archivo_bytes: bytes,
    nombre_archivo: str,
    content_type: Optional[str],
    current_user,
) -> dict:
    """Guarda foto o firma del trabajador en blob privado y actualiza columnas."""
    from azure_blob_storage import (
        delete_blob_private,
        path_rrhh_trabajador_firma,
        path_rrhh_trabajador_foto,
        upload_blob_private,
    )

    kind_n = (kind or "").strip().lower()
    if kind_n not in ("foto", "firma"):
        raise ValueError("Tipo de imagen inválido.")
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    mime = _validate_imagen(content_type, len(archivo_bytes or b""))
    if kind_n == "foto":
        blob_path = path_rrhh_trabajador_foto(
            int(contrato_id), int(trabajador_id), nombre_archivo or "foto.jpg"
        )
        path_key, mime_key, name_key = "foto_blob_path", "foto_mime_type", "foto_nombre_archivo"
        old_path = trab.get("foto_blob_path")
    else:
        blob_path = path_rrhh_trabajador_firma(
            int(contrato_id), int(trabajador_id), nombre_archivo or "firma.png"
        )
        path_key, mime_key, name_key = "firma_blob_path", "firma_mime_type", "firma_nombre_archivo"
        old_path = trab.get("firma_blob_path")

    upload_blob_private(blob_path, archivo_bytes, content_type=mime)
    payload = {
        path_key: blob_path,
        mime_key: mime,
        name_key: (nombre_archivo or ("foto.jpg" if kind_n == "foto" else "firma.png"))[:200],
        "updated_at": _now_iso(),
        "updated_by": _uid(current_user),
    }
    rows = (
        sb.table(_TABLE_TRAB)
        .update(payload)
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    if not rows:
        try:
            delete_blob_private(blob_path)
        except Exception:
            pass
        raise ValueError("No se pudo guardar la imagen del trabajador.")
    if old_path and old_path != blob_path:
        try:
            delete_blob_private(old_path)
        except Exception:
            pass
    return rows[0]


def clear_trabajador_imagen(
    sb,
    contrato_id: int,
    trabajador_id: int,
    *,
    kind: str,
    current_user,
) -> dict:
    from azure_blob_storage import delete_blob_private

    kind_n = (kind or "").strip().lower()
    if kind_n not in ("foto", "firma"):
        raise ValueError("Tipo de imagen inválido.")
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    if kind_n == "foto":
        old_path = trab.get("foto_blob_path")
        payload = {
            "foto_blob_path": None,
            "foto_mime_type": None,
            "foto_nombre_archivo": None,
            "updated_at": _now_iso(),
            "updated_by": _uid(current_user),
        }
    else:
        old_path = trab.get("firma_blob_path")
        payload = {
            "firma_blob_path": None,
            "firma_mime_type": None,
            "firma_nombre_archivo": None,
            "updated_at": _now_iso(),
            "updated_by": _uid(current_user),
        }
    rows = (
        sb.table(_TABLE_TRAB)
        .update(payload)
        .eq("id", int(trabajador_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("No se pudo quitar la imagen.")
    if old_path:
        try:
            delete_blob_private(old_path)
        except Exception:
            pass
    return rows[0]


def download_trabajador_imagen(
    sb, contrato_id: int, trabajador_id: int, *, kind: str
) -> tuple[bytes, dict]:
    from azure_blob_storage import download_blob_bytes_private

    kind_n = (kind or "").strip().lower()
    if kind_n not in ("foto", "firma"):
        raise ValueError("Tipo de imagen inválido.")
    trab = get_trabajador(sb, contrato_id, trabajador_id)
    path = trab.get("foto_blob_path") if kind_n == "foto" else trab.get("firma_blob_path")
    if not path:
        raise ValueError("Imagen no encontrada.")
    data = download_blob_bytes_private(path)
    return data, trab
