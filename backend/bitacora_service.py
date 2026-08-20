"""
Servicio Bitácora de Obra — Reporte Diario y Reporte de Evento.
Hilo cronológico compartido por contrato (Contratista + Interventoría).
"""
from __future__ import annotations

import base64
import hashlib
import logging
import re
from datetime import date, datetime, time, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

BOGOTA = ZoneInfo("America/Bogota")
MAX_IMAGENES_BITACORA = 4
CARGOS_PERSONAL_PLANTILLA = (
    "Oficial",
    "Ayudante",
    "Maestro de obra",
    "Cadenero",
    "Topógrafo",
    "Conductor",
    "Otro",
)
EVENTO_TIPOS = frozenset({
    "visita_terceros",
    "incidente_sst",
    "reporte_actividades",
    "novedades",
})

_log = logging.getLogger("claracore.bitacora")

WMO_LABELS = {
    0: "Despejado",
    1: "Mayormente despejado",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Niebla",
    48: "Niebla con escarcha",
    51: "Llovizna ligera",
    53: "Llovizna",
    55: "Llovizna intensa",
    61: "Lluvia ligera",
    63: "Lluvia",
    65: "Lluvia intensa",
    71: "Nieve ligera",
    73: "Nieve",
    75: "Nieve intensa",
    80: "Chubascos ligeros",
    81: "Chubascos",
    82: "Chubascos intensos",
    95: "Tormenta",
    96: "Tormenta con granizo",
    99: "Tormenta fuerte con granizo",
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hoy_bogota() -> date:
    return datetime.now(BOGOTA).date()


def es_desarrollador_bitacora(current_user: Optional[dict] = None) -> bool:
    if not current_user:
        return False
    try:
        from main import _es_desarrollador

        return bool(_es_desarrollador(current_user))
    except Exception:
        pass
    cargo = str(current_user.get("cargo_nombre") or current_user.get("cargo") or "").strip().lower()
    rol = str(current_user.get("rol_nombre") or current_user.get("rol") or "").strip().lower()
    return cargo == "desarrollador" or rol == "desarrollador"


def _usuario_row(sb, user_id: int) -> Optional[dict]:
    rows = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, rol_id, cargo_id")
        .eq("id", int(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def _nombre_usuario(u: Optional[dict]) -> str:
    if not u:
        return ""
    parts = [str(u.get("nombre") or "").strip(), str(u.get("apellidos") or "").strip()]
    return " ".join(p for p in parts if p).strip()


def _rol_nombre(sb, u: Optional[dict], current_user: Optional[dict] = None) -> str:
    if current_user and (current_user.get("rol_nombre") or current_user.get("rol")):
        return str(current_user.get("rol_nombre") or current_user.get("rol") or "").strip()
    if not u or u.get("rol_id") is None:
        return ""
    try:
        rows = sb.table("roles").select("nombre").eq("id", int(u["rol_id"])).limit(1).execute().data or []
        return str((rows[0] or {}).get("nombre") or "").strip() if rows else ""
    except Exception:
        return ""


def _parse_fecha(val) -> date:
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    s = str(val or "").strip()[:10]
    if not s:
        raise ValueError("La fecha es obligatoria")
    try:
        return date.fromisoformat(s)
    except ValueError as exc:
        raise ValueError(f"Fecha inválida: {s}") from exc


def _parse_hora(val) -> Optional[str]:
    if val is None or val == "":
        return None
    if isinstance(val, time):
        return val.strftime("%H:%M:%S")
    s = str(val).strip()
    if not s:
        return None
    # HH:MM or HH:MM:SS
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", s)
    if not m:
        raise ValueError(f"Hora inválida: {s}")
    hh, mm, ss = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if hh > 23 or mm > 59 or ss > 59:
        raise ValueError(f"Hora inválida: {s}")
    return f"{hh:02d}:{mm:02d}:{ss:02d}"


def _norm_nombre_equipo(nombre: str) -> str:
    s = str(nombre or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def clima_label(codigo: Optional[int]) -> str:
    if codigo is None:
        return ""
    try:
        c = int(codigo)
    except (TypeError, ValueError):
        return ""
    if c in WMO_LABELS:
        return WMO_LABELS[c]
    # nearest known
    for k in sorted(WMO_LABELS.keys(), key=lambda x: abs(x - c)):
        return WMO_LABELS[k]
    return f"Código {c}"


def _normalizar_personal(raw) -> List[dict]:
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        cargo = str(item.get("cargo") or "").strip()
        if not cargo:
            continue
        try:
            cantidad = float(item.get("cantidad") or 0)
        except (TypeError, ValueError):
            cantidad = 0
        if cantidad < 0:
            cantidad = 0
        row = {"cargo": cargo, "cantidad": cantidad}
        otro = str(item.get("cargo_otro") or "").strip()
        if cargo.lower().startswith("otro") and otro:
            row["cargo_otro"] = otro
        out.append(row)
    return out


def _normalizar_horas_intermedias(raw) -> List[dict]:
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        hora = _parse_hora(item.get("hora"))
        if not hora:
            continue
        nota = str(item.get("nota") or "").strip()
        row = {"hora": hora[:5]}  # HH:MM
        if nota:
            row["nota"] = nota
        out.append(row)
    return out


def _normalizar_imagen_ref(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict):
        return None
    blob_path = raw.get("blob_path") or None
    data_uri = raw.get("data_uri") or None
    url = raw.get("url") or None
    if not blob_path and not data_uri and not url:
        return None
    out = {
        "nombre": str(raw.get("nombre") or "foto.png")[:200],
        "blob_path": blob_path,
        "mime_type": str(raw.get("mime_type") or "image/png"),
        "created_at": raw.get("created_at") or _now_utc().isoformat(),
        "origen": str(raw.get("origen") or "archivo")[:40],
        "kind": str(raw.get("kind") or "foto")[:40],
    }
    if raw.get("content_hash"):
        out["content_hash"] = str(raw["content_hash"]).lower()
    if url and not blob_path and not data_uri:
        out["url"] = url
    if data_uri and not blob_path:
        out["data_uri"] = data_uri
    return out


def _normalizar_imagenes(raw) -> List[dict]:
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        ref = _normalizar_imagen_ref(item) if isinstance(item, dict) else None
        if ref:
            out.append(ref)
        if len(out) >= MAX_IMAGENES_BITACORA:
            break
    return out


def _enrich_imagen_preview(ref: dict) -> Optional[dict]:
    if not isinstance(ref, dict):
        return None
    out = dict(ref)
    if out.get("data_uri") or out.get("url"):
        return out
    path = (out.get("blob_path") or "").strip()
    if not path:
        return out
    try:
        from azure_blob_storage import download_blob_bytes_private

        data = download_blob_bytes_private(path)
        if data:
            mime = out.get("mime_type") or "image/png"
            b64 = base64.b64encode(data).decode("ascii")
            out["data_uri"] = f"data:{mime};base64,{b64}"
    except Exception as exc:
        _log.debug("bitacora imagen preview %s: %s", path, exc)
    return out


def _store_imagen_bytes(entrada_id: int, nombre: str, content: bytes, mime: str, prefix: str) -> dict:
    from azure_blob_storage import upload_blob_private

    safe = re.sub(r"[^\w.\-]+", "_", nombre or "foto.png")[:80]
    ts = int(_now_utc().timestamp() * 1000)
    blob_path = f"{prefix}/{int(entrada_id)}/{ts}_{safe}"
    stored_path = None
    try:
        upload_blob_private(blob_path, content, content_type=mime or "image/png", overwrite=True)
        stored_path = blob_path
    except Exception as exc:
        _log.warning("bitacora upload blob falló, data_uri fallback: %s", exc)
    digest = hashlib.sha256(content).hexdigest()
    b64 = base64.b64encode(content).decode("ascii")
    data_uri = f"data:{mime or 'image/png'};base64,{b64}"
    return {
        "nombre": nombre or "foto.png",
        "blob_path": stored_path,
        "mime_type": mime or "image/png",
        "created_at": _now_utc().isoformat(),
        "content_hash": digest,
        "data_uri": data_uri,
        "kind": "foto",
    }


def entrada_esta_cerrada(entrada: Optional[dict]) -> bool:
    if not entrada:
        return True
    return str(entrada.get("estado") or "").strip().lower() == "cerrado"


def _debe_autocerrar(entrada: dict, hoy: Optional[date] = None) -> bool:
    if str(entrada.get("tipo") or "") != "diario":
        return False
    if entrada_esta_cerrada(entrada):
        return False
    try:
        f = _parse_fecha(entrada.get("fecha"))
    except ValueError:
        return False
    return f < (hoy or hoy_bogota())


def _aplicar_cierre(sb, entrada_id: int, user_id: Optional[int], motivo: str) -> dict:
    payload = {
        "estado": "cerrado",
        "cerrado_en": _now_utc().isoformat(),
        "cierre_motivo": motivo,
        "updated_at": _now_utc().isoformat(),
    }
    if user_id is not None:
        payload["cerrado_por"] = int(user_id)
    sb.table("seguimiento_bitacora_entrada").update(payload).eq("id", int(entrada_id)).execute()
    rows = (
        sb.table("seguimiento_bitacora_entrada")
        .select("*")
        .eq("id", int(entrada_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else payload


def asegurar_autocierre_entrada(sb, entrada: dict, *, user_id: Optional[int] = None) -> dict:
    """Si el Reporte Diario quedó abierto al cambiar el día, lo cierra automáticamente."""
    if not _debe_autocerrar(entrada):
        return entrada
    closed = _aplicar_cierre(sb, int(entrada["id"]), user_id, "automatico_dia")
    return {**entrada, **closed}


def assert_puede_editar_entrada(
    entrada: dict,
    current_user: Optional[dict] = None,
) -> None:
    """
    Diario abierto: editable con permiso Editar (caller).
    Diario cerrado o Evento: inmutable salvo Desarrollador.
    """
    es_dev = es_desarrollador_bitacora(current_user)
    tipo = str(entrada.get("tipo") or "")
    if tipo == "evento":
        if not es_dev:
            raise ValueError(
                "El Reporte de Evento es inmutable desde su creación. "
                "Solo el rol Desarrollador puede modificarlo."
            )
        return
    # diario
    if _debe_autocerrar(entrada) and not es_dev:
        raise ValueError(
            "El Reporte Diario quedó bloqueado automáticamente al cambiar el día. "
            "Solo el rol Desarrollador puede modificarlo."
        )
    if entrada_esta_cerrada(entrada) and not es_dev:
        raise ValueError(
            "El Reporte Diario está cerrado y es inmutable. "
            "Solo el rol Desarrollador puede modificarlo."
        )


# ── Catálogo de equipos ───────────────────────────────────────────────────────

def list_equipos(sb, contrato_id: int, q: str = "") -> List[dict]:
    query = (
        sb.table("seguimiento_bitacora_equipo")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("activo", True)
        .order("nombre")
    )
    rows = query.execute().data or []
    needle = _norm_nombre_equipo(q)
    if needle:
        rows = [r for r in rows if needle in _norm_nombre_equipo(r.get("nombre") or "")]
    return rows


def upsert_equipo(
    sb,
    contrato_id: int,
    nombre: str,
    *,
    tipo: str = "equipo",
    user_id: Optional[int] = None,
) -> dict:
    nombre_limpio = str(nombre or "").strip()
    if not nombre_limpio:
        raise ValueError("El nombre del equipo/máquina es obligatorio")
    nombre_norm = _norm_nombre_equipo(nombre_limpio)
    tipo_ok = str(tipo or "equipo").strip().lower()
    if tipo_ok not in ("maquina", "equipo", "volqueta", "otro"):
        tipo_ok = "equipo"

    existentes = (
        sb.table("seguimiento_bitacora_equipo")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("nombre_norm", nombre_norm)
        .limit(5)
        .execute()
        .data
        or []
    )
    for row in existentes:
        if row.get("activo"):
            return row
        # reactivar
        updated = (
            sb.table("seguimiento_bitacora_equipo")
            .update({
                "activo": True,
                "nombre": nombre_limpio,
                "tipo": tipo_ok,
                "updated_at": _now_utc().isoformat(),
            })
            .eq("id", int(row["id"]))
            .execute()
            .data
            or []
        )
        return updated[0] if updated else {**row, "activo": True, "nombre": nombre_limpio}

    payload = {
        "contrato_id": int(contrato_id),
        "nombre": nombre_limpio,
        "nombre_norm": nombre_norm,
        "tipo": tipo_ok,
        "activo": True,
        "created_by": int(user_id) if user_id is not None else None,
        "created_at": _now_utc().isoformat(),
        "updated_at": _now_utc().isoformat(),
    }
    inserted = sb.table("seguimiento_bitacora_equipo").insert(payload).execute().data or []
    if not inserted:
        raise ValueError("No se pudo registrar el equipo")
    return inserted[0]


# ── Usos de equipo ────────────────────────────────────────────────────────────

def _list_usos(sb, entrada_id: int) -> List[dict]:
    return (
        sb.table("seguimiento_bitacora_equipo_uso")
        .select("*")
        .eq("entrada_id", int(entrada_id))
        .order("orden")
        .execute()
        .data
        or []
    )


def _sync_usos(
    sb,
    contrato_id: int,
    entrada_id: int,
    usos: List[dict],
    *,
    user_id: Optional[int] = None,
) -> List[dict]:
    # Replace-all strategy for simplicity and consistency with open diario edits.
    sb.table("seguimiento_bitacora_equipo_uso").delete().eq("entrada_id", int(entrada_id)).execute()
    if not isinstance(usos, list) or not usos:
        return []
    rows_out = []
    for i, item in enumerate(usos):
        if not isinstance(item, dict):
            continue
        nombre = str(item.get("equipo_nombre") or item.get("nombre") or "").strip()
        if not nombre:
            continue
        equipo_id = item.get("equipo_id")
        if equipo_id is None:
            cat = upsert_equipo(
                sb,
                contrato_id,
                nombre,
                tipo=str(item.get("tipo") or "equipo"),
                user_id=user_id,
            )
            equipo_id = cat.get("id")
            nombre = cat.get("nombre") or nombre
        else:
            # Ensure catalog entry stays reusable
            try:
                upsert_equipo(sb, contrato_id, nombre, tipo=str(item.get("tipo") or "equipo"), user_id=user_id)
            except Exception:
                pass
        try:
            cantidad = float(item.get("cantidad") or 1)
        except (TypeError, ValueError):
            cantidad = 1.0
        if cantidad <= 0:
            cantidad = 1.0
        payload = {
            "entrada_id": int(entrada_id),
            "equipo_id": int(equipo_id) if equipo_id is not None else None,
            "equipo_nombre": nombre,
            "operador": str(item.get("operador") or "").strip() or None,
            "cantidad": cantidad,
            "hora_inicio": _parse_hora(item.get("hora_inicio")),
            "hora_fin": _parse_hora(item.get("hora_fin")),
            "horas_intermedias": _normalizar_horas_intermedias(item.get("horas_intermedias")),
            "orden": int(item.get("orden") if item.get("orden") is not None else i),
            "created_at": _now_utc().isoformat(),
        }
        inserted = sb.table("seguimiento_bitacora_equipo_uso").insert(payload).execute().data or []
        if inserted:
            rows_out.append(inserted[0])
    return rows_out


def _enrich_entrada(sb, row: dict) -> dict:
    out = dict(row)
    out["personal"] = _normalizar_personal(out.get("personal"))
    out["imagenes"] = [
        _enrich_imagen_preview(x) or x
        for x in _normalizar_imagenes(out.get("imagenes"))
    ]
    if not isinstance(out.get("evento_detalle"), dict):
        out["evento_detalle"] = {}
    out["equipos_uso"] = _list_usos(sb, int(out["id"])) if out.get("id") is not None else []
    out["inmutable"] = entrada_esta_cerrada(out) or str(out.get("tipo") or "") == "evento"
    out["puede_autocerrar"] = _debe_autocerrar(out)
    if out.get("clima_codigo") is not None and not out.get("clima_descripcion"):
        out["clima_descripcion"] = clima_label(out.get("clima_codigo"))
    return out


# ── CRUD entradas ─────────────────────────────────────────────────────────────

def list_entradas(
    sb,
    contrato_id: int,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    tipo: Optional[str] = None,
    q: Optional[str] = None,
) -> List[dict]:
    query = (
        sb.table("seguimiento_bitacora_entrada")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .order("fecha", desc=True)
        .order("created_at", desc=True)
    )
    if fecha_desde:
        query = query.gte("fecha", str(fecha_desde)[:10])
    if fecha_hasta:
        query = query.lte("fecha", str(fecha_hasta)[:10])
    if tipo in ("diario", "evento"):
        query = query.eq("tipo", tipo)
    rows = query.execute().data or []

    out = []
    for row in rows:
        row = asegurar_autocierre_entrada(sb, row)
        enriched = _enrich_entrada(sb, row)
        if q:
            needle = str(q).strip().lower()
            blob = " ".join([
                str(enriched.get("cuerpo_html") or ""),
                str(enriched.get("evento_tipo") or ""),
                str(enriched.get("created_by_nombre") or ""),
                str(enriched.get("clima_descripcion") or ""),
            ]).lower()
            if needle and needle not in blob:
                continue
        out.append(enriched)
    return out


def get_entrada(sb, contrato_id: int, entrada_id: int) -> dict:
    rows = (
        sb.table("seguimiento_bitacora_entrada")
        .select("*")
        .eq("id", int(entrada_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Entrada de bitácora no encontrada")
    row = asegurar_autocierre_entrada(sb, rows[0])
    return _enrich_entrada(sb, row)


def get_diario_por_fecha(sb, contrato_id: int, fecha: str) -> Optional[dict]:
    f = _parse_fecha(fecha)
    rows = (
        sb.table("seguimiento_bitacora_entrada")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("tipo", "diario")
        .eq("fecha", f.isoformat())
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    row = asegurar_autocierre_entrada(sb, rows[0])
    return _enrich_entrada(sb, row)


def crear_reporte_diario(
    sb,
    contrato_id: int,
    data: dict,
    user_id: int,
    *,
    current_user: Optional[dict] = None,
) -> dict:
    fecha = _parse_fecha(data.get("fecha") or hoy_bogota().isoformat())
    hoy = hoy_bogota()
    if fecha > hoy:
        raise ValueError("No se puede crear un Reporte Diario con fecha futura")
    if fecha < hoy and not es_desarrollador_bitacora(current_user):
        raise ValueError(
            "No se puede crear un Reporte Diario para una fecha ya pasada; "
            "quedaría bloqueado automáticamente."
        )

    existing = get_diario_por_fecha(sb, contrato_id, fecha.isoformat())
    if existing:
        raise ValueError(
            f"Ya existe un Reporte Diario para el {fecha.isoformat()}. "
            "Ábralo para complementar mientras esté abierto."
        )

    u = _usuario_row(sb, user_id)
    hora_inicio = _parse_hora(data.get("hora_inicio_labores"))
    if not hora_inicio:
        # default: now Bogotá
        hora_inicio = datetime.now(BOGOTA).strftime("%H:%M:%S")

    clima_codigo = data.get("clima_codigo")
    try:
        clima_codigo = int(clima_codigo) if clima_codigo is not None and clima_codigo != "" else None
    except (TypeError, ValueError):
        clima_codigo = None
    clima_temp = data.get("clima_temp_c")
    try:
        clima_temp = float(clima_temp) if clima_temp is not None and clima_temp != "" else None
    except (TypeError, ValueError):
        clima_temp = None
    clima_desc = str(data.get("clima_descripcion") or "").strip() or clima_label(clima_codigo)

    payload = {
        "contrato_id": int(contrato_id),
        "tipo": "diario",
        "fecha": fecha.isoformat(),
        "estado": "abierto",
        "hora_inicio_labores": hora_inicio,
        "clima_codigo": clima_codigo,
        "clima_temp_c": clima_temp,
        "clima_descripcion": clima_desc or None,
        "clima_editado_manual": bool(data.get("clima_editado_manual")),
        "personal": _normalizar_personal(data.get("personal")),
        "cuerpo_html": str(data.get("cuerpo_html") or ""),
        "imagenes": [],
        "created_by": int(user_id),
        "created_by_nombre": _nombre_usuario(u) or str(current_user.get("nombre") or "") if current_user else _nombre_usuario(u),
        "created_by_rol": _rol_nombre(sb, u, current_user),
        "created_at": _now_utc().isoformat(),
        "updated_at": _now_utc().isoformat(),
    }
    inserted = sb.table("seguimiento_bitacora_entrada").insert(payload).execute().data or []
    if not inserted:
        raise ValueError("No se pudo crear el Reporte Diario")
    entrada = inserted[0]
    usos = data.get("equipos_uso") or data.get("maquinaria") or []
    if usos:
        _sync_usos(sb, contrato_id, int(entrada["id"]), usos, user_id=user_id)
    return get_entrada(sb, contrato_id, int(entrada["id"]))


def crear_reporte_evento(
    sb,
    contrato_id: int,
    data: dict,
    user_id: int,
    *,
    current_user: Optional[dict] = None,
) -> dict:
    fecha = _parse_fecha(data.get("fecha") or hoy_bogota().isoformat())
    evento_tipo = str(data.get("evento_tipo") or "").strip()
    if evento_tipo not in EVENTO_TIPOS:
        raise ValueError(
            "Tipo de evento inválido. Use: visita_terceros, incidente_sst, "
            "reporte_actividades o novedades."
        )
    detalle = data.get("evento_detalle") if isinstance(data.get("evento_detalle"), dict) else {}
    if evento_tipo == "incidente_sst":
        # Campos mínimos SST (independientes del Auditor SST IA)
        detalle = {
            "descripcion_incidente": str(detalle.get("descripcion_incidente") or "").strip(),
            "lugar": str(detalle.get("lugar") or "").strip(),
            "personas_involucradas": str(detalle.get("personas_involucradas") or "").strip(),
            "acciones_inmediatas": str(detalle.get("acciones_inmediatas") or "").strip(),
            "gravedad": str(detalle.get("gravedad") or "leve").strip() or "leve",
            "requiere_seguimiento": bool(detalle.get("requiere_seguimiento")),
        }
    elif evento_tipo == "visita_terceros":
        detalle = {
            "visitantes": str(detalle.get("visitantes") or "").strip(),
            "entidad": str(detalle.get("entidad") or "").strip(),
            "motivo": str(detalle.get("motivo") or "").strip(),
        }
    else:
        detalle = {k: v for k, v in detalle.items() if v is not None}

    u = _usuario_row(sb, user_id)
    payload = {
        "contrato_id": int(contrato_id),
        "tipo": "evento",
        "fecha": fecha.isoformat(),
        "estado": "cerrado",
        "cerrado_en": _now_utc().isoformat(),
        "cerrado_por": int(user_id),
        "cierre_motivo": "creacion_evento",
        "evento_tipo": evento_tipo,
        "evento_detalle": detalle,
        "cuerpo_html": str(data.get("cuerpo_html") or ""),
        "imagenes": [],
        "personal": [],
        "created_by": int(user_id),
        "created_by_nombre": _nombre_usuario(u) or (
            str(current_user.get("nombre") or "") if current_user else ""
        ),
        "created_by_rol": _rol_nombre(sb, u, current_user),
        "created_at": _now_utc().isoformat(),
        "updated_at": _now_utc().isoformat(),
    }
    inserted = sb.table("seguimiento_bitacora_entrada").insert(payload).execute().data or []
    if not inserted:
        raise ValueError("No se pudo crear el Reporte de Evento")
    entrada_id = int(inserted[0]["id"])

    # Adjuntar imágenes en el mismo acto de creación (el evento queda inmutable después).
    pending_imgs = data.get("imagenes") if isinstance(data.get("imagenes"), list) else []
    stored_imgs: List[dict] = []
    for im in pending_imgs[:MAX_IMAGENES_BITACORA]:
        if not isinstance(im, dict):
            continue
        data_uri = im.get("data_uri") or im.get("data_base64")
        if data_uri:
            try:
                adjuntar_imagen_entrada(
                    sb,
                    contrato_id,
                    entrada_id,
                    user_id,
                    str(im.get("nombre") or "foto.png"),
                    str(data_uri),
                    str(im.get("mime_type") or "image/png"),
                    origen=str(im.get("origen") or "archivo"),
                    current_user=current_user,
                    force_during_create=True,
                )
            except Exception as exc:
                _log.warning("bitacora evento imagen create: %s", exc)
            continue
        # Referencia ya persistida (galería): copiar metadatos
        ref = _normalizar_imagen_ref(im)
        if ref:
            store = {
                "nombre": ref.get("nombre"),
                "blob_path": ref.get("blob_path"),
                "mime_type": ref.get("mime_type"),
                "created_at": ref.get("created_at") or _now_utc().isoformat(),
                "origen": str(im.get("origen") or "galeria")[:40],
                "kind": "foto",
            }
            if ref.get("content_hash"):
                store["content_hash"] = ref["content_hash"]
            if not store.get("blob_path") and ref.get("data_uri"):
                store["data_uri"] = ref["data_uri"]
            if ref.get("url") and not store.get("blob_path"):
                store["url"] = ref["url"]
            stored_imgs.append(store)

    if stored_imgs:
        # Merge with any already attached via adjuntar_imagen_entrada
        current = get_entrada(sb, contrato_id, entrada_id)
        actuales = current.get("imagenes") if isinstance(current.get("imagenes"), list) else []
        merged = _normalizar_imagenes([
            {k: v for k, v in im.items() if k != "data_uri" or not im.get("blob_path")}
            for im in actuales if isinstance(im, dict)
        ] + stored_imgs)
        sb.table("seguimiento_bitacora_entrada").update({
            "imagenes": [
                {k: v for k, v in im.items() if k != "data_uri" or not im.get("blob_path")}
                for im in merged
            ],
            "updated_at": _now_utc().isoformat(),
        }).eq("id", entrada_id).execute()

    return get_entrada(sb, contrato_id, entrada_id)


def update_entrada(
    sb,
    contrato_id: int,
    entrada_id: int,
    data: dict,
    user_id: int,
    *,
    current_user: Optional[dict] = None,
) -> dict:
    entrada = get_entrada(sb, contrato_id, entrada_id)
    # Autocierre may have just applied inside get_entrada
    assert_puede_editar_entrada(entrada, current_user)

    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    tipo = str(entrada.get("tipo") or "")

    if "cuerpo_html" in data:
        patch["cuerpo_html"] = str(data.get("cuerpo_html") or "")

    if tipo == "diario":
        if "hora_inicio_labores" in data:
            patch["hora_inicio_labores"] = _parse_hora(data.get("hora_inicio_labores"))
        if "clima_codigo" in data:
            try:
                patch["clima_codigo"] = (
                    int(data["clima_codigo"])
                    if data.get("clima_codigo") is not None and data.get("clima_codigo") != ""
                    else None
                )
            except (TypeError, ValueError):
                patch["clima_codigo"] = None
        if "clima_temp_c" in data:
            try:
                patch["clima_temp_c"] = (
                    float(data["clima_temp_c"])
                    if data.get("clima_temp_c") is not None and data.get("clima_temp_c") != ""
                    else None
                )
            except (TypeError, ValueError):
                patch["clima_temp_c"] = None
        if "clima_descripcion" in data:
            patch["clima_descripcion"] = str(data.get("clima_descripcion") or "").strip() or None
        if "clima_editado_manual" in data:
            patch["clima_editado_manual"] = bool(data.get("clima_editado_manual"))
        if "personal" in data:
            patch["personal"] = _normalizar_personal(data.get("personal"))
        if "equipos_uso" in data or "maquinaria" in data:
            usos = data.get("equipos_uso") if "equipos_uso" in data else data.get("maquinaria")
            _sync_usos(sb, contrato_id, entrada_id, usos or [], user_id=user_id)
    else:
        # evento — solo Dev llega aquí
        if "evento_detalle" in data and isinstance(data.get("evento_detalle"), dict):
            patch["evento_detalle"] = data["evento_detalle"]
        if "evento_tipo" in data:
            et = str(data.get("evento_tipo") or "").strip()
            if et in EVENTO_TIPOS:
                patch["evento_tipo"] = et

    if "imagenes" in data:
        imgs = _normalizar_imagenes(data.get("imagenes"))
        if len(imgs) > MAX_IMAGENES_BITACORA:
            raise ValueError(f"Máximo {MAX_IMAGENES_BITACORA} fotografías por entrada de bitácora")
        # Persist without heavy data_uri when blob_path exists
        store = []
        for im in imgs:
            row = {
                "nombre": im.get("nombre"),
                "blob_path": im.get("blob_path"),
                "mime_type": im.get("mime_type"),
                "created_at": im.get("created_at"),
                "origen": im.get("origen"),
                "kind": im.get("kind"),
            }
            if im.get("content_hash"):
                row["content_hash"] = im["content_hash"]
            if not row.get("blob_path") and im.get("data_uri"):
                row["data_uri"] = im["data_uri"]
            if im.get("url") and not row.get("blob_path"):
                row["url"] = im["url"]
            store.append(row)
        patch["imagenes"] = store

    sb.table("seguimiento_bitacora_entrada").update(patch).eq("id", int(entrada_id)).execute()
    return get_entrada(sb, contrato_id, entrada_id)


def cerrar_reporte_diario(
    sb,
    contrato_id: int,
    entrada_id: int,
    user_id: int,
    *,
    current_user: Optional[dict] = None,
) -> dict:
    entrada = get_entrada(sb, contrato_id, entrada_id)
    if str(entrada.get("tipo") or "") != "diario":
        raise ValueError("Solo un Reporte Diario puede cerrarse con esta acción")
    if entrada_esta_cerrada(entrada):
        return entrada
    assert_puede_editar_entrada(entrada, current_user)
    _aplicar_cierre(sb, entrada_id, user_id, "manual")
    return get_entrada(sb, contrato_id, entrada_id)


def revertir_cierre_diario(
    sb,
    contrato_id: int,
    entrada_id: int,
    user_id: int,
    *,
    current_user: Optional[dict] = None,
) -> dict:
    """Excepción Desarrollador: reabre un Reporte Diario cerrado."""
    if not es_desarrollador_bitacora(current_user):
        raise ValueError("Solo el rol Desarrollador puede reabrir un Reporte Diario cerrado")
    entrada = get_entrada(sb, contrato_id, entrada_id)
    if str(entrada.get("tipo") or "") != "diario":
        raise ValueError("Solo aplica a Reportes Diarios")
    sb.table("seguimiento_bitacora_entrada").update({
        "estado": "abierto",
        "cerrado_en": None,
        "cerrado_por": None,
        "cierre_motivo": None,
        "updated_at": _now_utc().isoformat(),
    }).eq("id", int(entrada_id)).execute()
    return get_entrada(sb, contrato_id, entrada_id)


def eliminar_entrada(
    sb,
    contrato_id: int,
    entrada_id: int,
    *,
    current_user: Optional[dict] = None,
) -> None:
    if not es_desarrollador_bitacora(current_user):
        raise ValueError("Solo el rol Desarrollador puede eliminar entradas de bitácora")
    get_entrada(sb, contrato_id, entrada_id)  # 404 if missing
    sb.table("seguimiento_bitacora_entrada").delete().eq("id", int(entrada_id)).eq(
        "contrato_id", int(contrato_id)
    ).execute()


def adjuntar_imagen_entrada(
    sb,
    contrato_id: int,
    entrada_id: int,
    user_id: int,
    nombre: str,
    data_b64: str,
    mime: str = "image/png",
    *,
    origen: str = "archivo",
    current_user: Optional[dict] = None,
    force_during_create: bool = False,
) -> dict:
    entrada = get_entrada(sb, contrato_id, entrada_id)
    if not force_during_create:
        assert_puede_editar_entrada(entrada, current_user)

    raw = data_b64 or ""
    if "," in raw and raw.strip().startswith("data:"):
        header, raw = raw.split(",", 1)
        m = re.search(r"data:([^;]+)", header)
        if m:
            mime = m.group(1)
    try:
        content = base64.b64decode(raw)
    except Exception as exc:
        raise ValueError("Imagen inválida") from exc
    if len(content) > 8_000_000:
        raise ValueError("La imagen supera 8 MB")
    if not (mime or "").startswith("image/"):
        raise ValueError("Solo se permiten archivos de imagen")

    actuales = entrada.get("imagenes") if isinstance(entrada.get("imagenes"), list) else []
    # Strip enrich-only fields for count of stored
    if len(actuales) >= MAX_IMAGENES_BITACORA:
        raise ValueError(f"Máximo {MAX_IMAGENES_BITACORA} fotografías por entrada de bitácora")

    digest = hashlib.sha256(content).hexdigest()
    # Duplicate detection within contract bitácora
    dups = (
        sb.table("seguimiento_bitacora_foto_hash")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("content_hash", digest)
        .limit(1)
        .execute()
        .data
        or []
    )
    if dups:
        raise ValueError(
            "Esta fotografía ya fue cargada en la Bitácora de este contrato. "
            "Úsala desde la galería en lugar de subirla de nuevo."
        )

    ref = _store_imagen_bytes(
        int(entrada_id),
        nombre or "foto.png",
        content,
        mime or "image/png",
        prefix=f"seguimiento-bitacora/{int(contrato_id)}",
    )
    ref["origen"] = str(origen or "archivo")[:40]
    persist = {
        "nombre": ref.get("nombre") or "foto.png",
        "blob_path": ref.get("blob_path"),
        "mime_type": ref.get("mime_type") or "image/png",
        "created_at": ref.get("created_at") or _now_utc().isoformat(),
        "origen": ref["origen"],
        "kind": "foto",
        "content_hash": digest,
    }
    if not persist.get("blob_path") and ref.get("data_uri"):
        persist["data_uri"] = ref["data_uri"]

    nuevos = list(_normalizar_imagenes([
        {k: v for k, v in im.items() if k != "data_uri" or not im.get("blob_path")}
        for im in actuales
        if isinstance(im, dict)
    ])) + [persist]
    if len(nuevos) > MAX_IMAGENES_BITACORA:
        raise ValueError(f"Máximo {MAX_IMAGENES_BITACORA} fotografías por entrada de bitácora")

    sb.table("seguimiento_bitacora_entrada").update({
        "imagenes": [
            {k: v for k, v in im.items() if k != "data_uri" or not im.get("blob_path")}
            for im in nuevos
        ],
        "updated_at": _now_utc().isoformat(),
    }).eq("id", int(entrada_id)).execute()

    try:
        sb.table("seguimiento_bitacora_foto_hash").insert({
            "contrato_id": int(contrato_id),
            "content_hash": digest,
            "blob_path": persist.get("blob_path"),
            "entrada_id": int(entrada_id),
            "created_at": _now_utc().isoformat(),
        }).execute()
    except Exception as exc:
        _log.debug("bitacora foto hash insert: %s", exc)

    out = get_entrada(sb, contrato_id, entrada_id)
    # Ensure immediate preview of last image
    if ref.get("data_uri") and out.get("imagenes"):
        last = out["imagenes"][-1]
        if isinstance(last, dict) and not last.get("data_uri"):
            last["data_uri"] = ref["data_uri"]
    return out


def list_galeria(sb, contrato_id: int, q: str = "") -> List[dict]:
    """Galería de fotos ya usadas en bitácora del contrato (para reutilizar)."""
    rows = (
        sb.table("seguimiento_bitacora_entrada")
        .select("id, fecha, tipo, imagenes, created_at")
        .eq("contrato_id", int(contrato_id))
        .order("fecha", desc=True)
        .limit(80)
        .execute()
        .data
        or []
    )
    out = []
    needle = str(q or "").strip().lower()
    for row in rows:
        imgs = row.get("imagenes") if isinstance(row.get("imagenes"), list) else []
        for im in imgs:
            if not isinstance(im, dict):
                continue
            enriched = _enrich_imagen_preview(im) or im
            item = {
                **enriched,
                "entrada_id": row.get("id"),
                "fecha": row.get("fecha"),
                "tipo_entrada": row.get("tipo"),
            }
            if needle:
                blob = f"{item.get('nombre') or ''} {item.get('fecha') or ''}".lower()
                if needle not in blob:
                    continue
            out.append(item)
    return out


def cerrar_diarios_vencidos(sb, contrato_id: Optional[int] = None) -> dict:
    """Cierre automático por cambio de día (cron o lazy batch)."""
    hoy = hoy_bogota().isoformat()
    query = (
        sb.table("seguimiento_bitacora_entrada")
        .select("id, contrato_id, fecha, estado, tipo")
        .eq("tipo", "diario")
        .eq("estado", "abierto")
        .lt("fecha", hoy)
    )
    if contrato_id is not None:
        query = query.eq("contrato_id", int(contrato_id))
    rows = query.execute().data or []
    cerrados = 0
    for row in rows:
        try:
            _aplicar_cierre(sb, int(row["id"]), None, "automatico_dia")
            cerrados += 1
        except Exception as exc:
            _log.warning("autocierre bitacora %s: %s", row.get("id"), exc)
    return {"cerrados": cerrados, "revisados": len(rows), "fecha_corte": hoy}
