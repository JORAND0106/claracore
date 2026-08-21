"""
Servicio Bitácora de Obra — Reporte Diario y Reporte de Evento.
Hilo cronológico compartido por contrato (Contratista + Interventoría).
"""
from __future__ import annotations

import base64
import hashlib
import logging
import re
import threading
import time
from contextlib import contextmanager
from datetime import date, datetime, time as dt_time, timezone
from typing import Any, Dict, List, Optional, Tuple
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
    "Boal",
    "Tráficos",
    "Insp. SST",
    "Insp. Tráfico",
    "Ing. Obra",
    "Ing. SST",
    "Ing. Ambiental",
    "Otro",
)
EVENTO_TIPOS = frozenset({
    "visita_terceros",
    "incidente_sst",
    "reporte_actividades",
    "novedades",
})

_log = logging.getLogger("claracore.bitacora")


@contextmanager
def _stage_timer(stages: Dict[str, float], name: str):
    """Registra duración ms de una etapa del flujo de guardado."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        stages[name] = round((time.perf_counter() - t0) * 1000.0, 1)

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


def ahora_bogota() -> datetime:
    return datetime.now(BOGOTA)


def momento_cierre_diario(fecha: date) -> datetime:
    """Cierre automático exacto: 23:59:59 (America/Bogota) de la fecha del reporte."""
    return datetime(fecha.year, fecha.month, fecha.day, 23, 59, 59, tzinfo=BOGOTA)


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
    if isinstance(val, dt_time):
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


def _expandir_personal_otro(personal: List[dict]) -> List[dict]:
    """Convierte filas «Otro + cargo_otro» en el nombre custom definitivo."""
    out = []
    for item in personal or []:
        if not isinstance(item, dict):
            continue
        cargo = str(item.get("cargo") or "").strip()
        otro = str(item.get("cargo_otro") or "").strip()
        if cargo.lower().startswith("otro") and otro:
            out.append({"cargo": otro, "cantidad": item.get("cantidad") or 0})
        else:
            row = {"cargo": cargo, "cantidad": item.get("cantidad") or 0}
            out.append(row)
    return out


def _normalizar_adjuntos_flex(raw, *, max_n: int = 20) -> List[dict]:
    """Adjuntos genéricos (vales, preoperacionales) sin tope de fotos de bitácora."""
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        ref = _normalizar_imagen_ref(item) if isinstance(item, dict) else None
        if ref:
            out.append(ref)
        if len(out) >= max_n:
            break
    return out


def _normalizar_materiales(raw) -> List[dict]:
    """
    Materiales de obra (ingreso/salida).
    Shape:
      movimiento: ingreso|salida
      tipo_material, proveedor, cantidad, placa (legacy; UI oculta placa)
      numeros_vale: texto libre (números de vale del día)
      adjuntos: máx. 2 (foto remisión / soporte)
      ubicacion_pk / ubicacion_pk_id: PK del plano (Cantidades/Presupuesto)
      ubicacion_lat / ubicacion_lng: opcional (meta del clic en mapa)
    Compat: si vienen `vales` como lista de adjuntos (diseño anterior), se migran a adjuntos.
    """
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        mov = str(item.get("movimiento") or item.get("tipo_movimiento") or "ingreso").strip().lower()
        if mov not in ("ingreso", "salida"):
            mov = "ingreso"
        tipo = str(item.get("tipo_material") or item.get("tipo") or "").strip()
        proveedor = str(item.get("proveedor") or "").strip()
        placa = str(item.get("placa") or item.get("placa_vehiculo") or "").strip()
        numeros_vale = str(item.get("numeros_vale") or item.get("numero_vale") or "").strip()
        try:
            cantidad = float(item.get("cantidad") or 0)
        except (TypeError, ValueError):
            cantidad = 0.0
        if cantidad < 0:
            cantidad = 0.0

        adjuntos_raw = item.get("adjuntos")
        if not isinstance(adjuntos_raw, list):
            legacy = item.get("vales")
            if isinstance(legacy, list) and legacy and isinstance(legacy[0], dict):
                adjuntos_raw = legacy
            else:
                adjuntos_raw = []
        if not numeros_vale and isinstance(item.get("vales"), str):
            numeros_vale = str(item.get("vales") or "").strip()

        adjuntos = _normalizar_adjuntos_flex(adjuntos_raw, max_n=2)

        ubicacion_pk = str(
            item.get("ubicacion_pk") or item.get("pk_label") or item.get("pk") or ""
        ).strip() or None
        ubicacion_pk_id = item.get("ubicacion_pk_id") or item.get("pk_id_id") or item.get("pk_id")
        if ubicacion_pk_id is not None and ubicacion_pk_id != "":
            try:
                ubicacion_pk_id = int(ubicacion_pk_id)
            except (TypeError, ValueError):
                ubicacion_pk_id = str(ubicacion_pk_id).strip() or None
        else:
            ubicacion_pk_id = None

        ubicacion_tramo = str(
            item.get("ubicacion_tramo") or item.get("tramo") or ""
        ).strip() or None
        ubicacion_costado = str(
            item.get("ubicacion_costado") or item.get("costado") or item.get("calzada") or ""
        ).strip() or None
        ubicacion_infraestructura = str(
            item.get("ubicacion_infraestructura") or item.get("infraestructura") or ""
        ).strip() or None

        ubicacion_lat = None
        ubicacion_lng = None
        for key_lat, key_lng in (
            ("ubicacion_lat", "ubicacion_lng"),
            ("lat", "lng"),
            ("coord_lat", "coord_lng"),
        ):
            raw_lat = item.get(key_lat)
            raw_lng = item.get(key_lng)
            if raw_lat is None or raw_lng is None or raw_lat == "" or raw_lng == "":
                continue
            try:
                ubicacion_lat = float(raw_lat)
                ubicacion_lng = float(raw_lng)
            except (TypeError, ValueError):
                ubicacion_lat = None
                ubicacion_lng = None
                continue
            if not (-90.0 <= ubicacion_lat <= 90.0 and -180.0 <= ubicacion_lng <= 180.0):
                ubicacion_lat = None
                ubicacion_lng = None
                continue
            break

        if not any([
            tipo, proveedor, placa, numeros_vale, adjuntos, cantidad,
            ubicacion_pk, ubicacion_pk_id is not None, ubicacion_lat is not None,
            ubicacion_tramo, ubicacion_costado, ubicacion_infraestructura,
        ]):
            continue
        row = {
            "movimiento": mov,
            "tipo_material": tipo,
            "proveedor": proveedor,
            "cantidad": cantidad,
            "placa": placa,
            "numeros_vale": numeros_vale,
            "adjuntos": adjuntos,
        }
        if ubicacion_pk:
            row["ubicacion_pk"] = ubicacion_pk
        if ubicacion_pk_id is not None:
            row["ubicacion_pk_id"] = ubicacion_pk_id
        if ubicacion_tramo:
            row["ubicacion_tramo"] = ubicacion_tramo
        if ubicacion_costado:
            row["ubicacion_costado"] = ubicacion_costado
        if ubicacion_infraestructura:
            row["ubicacion_infraestructura"] = ubicacion_infraestructura
        if ubicacion_lat is not None and ubicacion_lng is not None:
            row["ubicacion_lat"] = round(ubicacion_lat, 7)
            row["ubicacion_lng"] = round(ubicacion_lng, 7)
        out.append(row)
    return out


def _persist_materiales(mats: List[dict]) -> List[dict]:
    return [
        {
            **{k: v for k, v in m.items() if k != "adjuntos"},
            "adjuntos": _persist_adjuntos_sin_data_uri(m.get("adjuntos") or []),
        }
        for m in mats
    ]


def _persist_adjuntos_sin_data_uri(refs: List[dict]) -> List[dict]:
    store = []
    for im in refs:
        if not isinstance(im, dict):
            continue
        row = {
            "nombre": im.get("nombre"),
            "blob_path": im.get("blob_path"),
            "mime_type": im.get("mime_type"),
            "created_at": im.get("created_at"),
            "origen": im.get("origen"),
            "kind": im.get("kind") or "adjunto",
        }
        if im.get("content_hash"):
            row["content_hash"] = im["content_hash"]
        if not row.get("blob_path") and im.get("data_uri"):
            row["data_uri"] = im["data_uri"]
        if im.get("url") and not row.get("blob_path"):
            row["url"] = im["url"]
        store.append(row)
    return store


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
    """
    Metadatos de imagen para la API.

    No descarga blobs de Azure ni embebe data_uri: eso multiplicaba segundos
    (o decenas de segundos) en cada get/list/guardado. La UI obtiene bytes
    bajo demanda vía GET .../bitacora/media?path=...
    """
    if not isinstance(ref, dict):
        return None
    return dict(ref)


def assert_blob_path_del_contrato(contrato_id: int, blob_path: str) -> str:
    """Valida que el path pertenezca al prefijo de bitácora del contrato."""
    path = str(blob_path or "").strip().lstrip("/")
    if not path or ".." in path or path.startswith("/"):
        raise ValueError("Ruta de archivo no válida")
    prefix = f"seguimiento-bitacora/{int(contrato_id)}/"
    if not path.startswith(prefix):
        raise ValueError("Ruta de archivo no válida para este contrato")
    return path


def leer_media_bitacora(contrato_id: int, blob_path: str) -> Tuple[bytes, str]:
    """Lee bytes de un adjunto privado de bitácora (auth en la ruta HTTP)."""
    path = assert_blob_path_del_contrato(contrato_id, blob_path)
    from azure_blob_storage import download_blob_bytes_private

    data = download_blob_bytes_private(path)
    if not data:
        raise ValueError("Archivo no encontrado")
    lower = path.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        mime = "image/jpeg"
    elif lower.endswith(".webp"):
        mime = "image/webp"
    elif lower.endswith(".gif"):
        mime = "image/gif"
    else:
        mime = "image/png"
    return data, mime


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


def _debe_autocerrar(entrada: dict, ahora: Optional[datetime] = None) -> bool:
    """True cuando ya llegó (o pasó) las 23:59:59 de la fecha del Reporte Diario."""
    if str(entrada.get("tipo") or "") != "diario":
        return False
    if entrada_esta_cerrada(entrada):
        return False
    try:
        f = _parse_fecha(entrada.get("fecha"))
    except ValueError:
        return False
    now = ahora or ahora_bogota()
    if now.tzinfo is None:
        now = now.replace(tzinfo=BOGOTA)
    return now >= momento_cierre_diario(f)


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
    """Cierra el Reporte Diario al llegar a las 23:59:59 de su fecha (lazy ensure)."""
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
            "El Reporte Diario se cerró automáticamente a las 23:59:59 de su fecha "
            "y es inmutable. Solo el rol Desarrollador puede modificarlo."
        )
    if entrada_esta_cerrada(entrada) and not es_dev:
        raise ValueError(
            "El Reporte Diario está cerrado y es inmutable. "
            "Solo el rol Desarrollador puede modificarlo."
        )


# ── Catálogo de cargos personalizados ─────────────────────────────────────────

def _norm_nombre_cargo(nombre: str) -> str:
    s = str(nombre or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def list_cargos_custom(sb, contrato_id: int) -> List[dict]:
    try:
        return (
            sb.table("seguimiento_bitacora_cargo")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("activo", True)
            .order("nombre")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.debug("list_cargos_custom: %s", exc)
        return []


def upsert_cargo_custom(
    sb,
    contrato_id: int,
    nombre: str,
    *,
    user_id: Optional[int] = None,
) -> Optional[dict]:
    nombre_limpio = str(nombre or "").strip()
    if not nombre_limpio:
        return None
    # No duplicar plantilla fija
    plantilla_norm = {_norm_nombre_cargo(c) for c in CARGOS_PERSONAL_PLANTILLA if c != "Otro"}
    nombre_norm = _norm_nombre_cargo(nombre_limpio)
    if nombre_norm in plantilla_norm or nombre_norm == "otro":
        return None
    try:
        existentes = (
            sb.table("seguimiento_bitacora_cargo")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("nombre_norm", nombre_norm)
            .limit(5)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("upsert_cargo_custom select: %s", exc)
        return None
    for row in existentes:
        if row.get("activo"):
            return row
        updated = (
            sb.table("seguimiento_bitacora_cargo")
            .update({
                "activo": True,
                "nombre": nombre_limpio,
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
        "activo": True,
        "created_by": int(user_id) if user_id is not None else None,
        "created_at": _now_utc().isoformat(),
        "updated_at": _now_utc().isoformat(),
    }
    try:
        inserted = sb.table("seguimiento_bitacora_cargo").insert(payload).execute().data or []
        return inserted[0] if inserted else None
    except Exception as exc:
        _log.warning("upsert_cargo_custom insert: %s", exc)
        return None


def sync_cargos_desde_personal(
    sb,
    contrato_id: int,
    personal: List[dict],
    *,
    user_id: Optional[int] = None,
) -> None:
    """Persiste cargos escritos en «Otro: ¿Cuál?» al catálogo del contrato."""
    for item in personal or []:
        if not isinstance(item, dict):
            continue
        cargo = str(item.get("cargo") or "").strip()
        otro = str(item.get("cargo_otro") or "").strip()
        if cargo.lower().startswith("otro") and otro:
            upsert_cargo_custom(sb, contrato_id, otro, user_id=user_id)
        elif cargo and _norm_nombre_cargo(cargo) not in {
            _norm_nombre_cargo(c) for c in CARGOS_PERSONAL_PLANTILLA
        }:
            # Cargo ya persistido como fila propia (no plantilla)
            upsert_cargo_custom(sb, contrato_id, cargo, user_id=user_id)


def plantilla_personal_contrato(sb, contrato_id: int) -> List[dict]:
    """Plantilla fija + cargos custom del contrato (sin «Otro» al final de los custom)."""
    base = list(CARGOS_PERSONAL_PLANTILLA)
    # Insertar custom antes de «Otro»
    custom = list_cargos_custom(sb, contrato_id)
    nombres_base = {_norm_nombre_cargo(c) for c in base}
    extras = []
    for row in custom:
        n = str(row.get("nombre") or "").strip()
        if n and _norm_nombre_cargo(n) not in nombres_base:
            extras.append(n)
            nombres_base.add(_norm_nombre_cargo(n))
    if "Otro" in base:
        idx = base.index("Otro")
        merged = base[:idx] + extras + base[idx:]
    else:
        merged = base + extras
    return [{"cargo": c, "cantidad": 0, "cargo_otro": ""} for c in merged]


# ── Catálogo de tipo de material ──────────────────────────────────────────────

def _norm_nombre_tipo_material(nombre: str) -> str:
    s = str(nombre or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _norm_nombre_visitante(nombre: str) -> str:
    s = str(nombre or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def list_tipos_material(sb, contrato_id: int, q: str = "") -> List[dict]:
    try:
        rows = (
            sb.table("seguimiento_bitacora_tipo_material")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("activo", True)
            .order("nombre")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.debug("list_tipos_material: %s", exc)
        return []
    needle = _norm_nombre_tipo_material(q)
    if not needle:
        return rows
    return [r for r in rows if needle in _norm_nombre_tipo_material(r.get("nombre") or "")]


def upsert_tipo_material(
    sb,
    contrato_id: int,
    nombre: str,
    *,
    user_id: Optional[int] = None,
) -> Optional[dict]:
    nombre_limpio = str(nombre or "").strip()
    if not nombre_limpio:
        return None
    nombre_norm = _norm_nombre_tipo_material(nombre_limpio)
    try:
        existentes = (
            sb.table("seguimiento_bitacora_tipo_material")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("nombre_norm", nombre_norm)
            .limit(5)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("upsert_tipo_material select: %s", exc)
        return None
    for row in existentes:
        if row.get("activo"):
            return row
        updated = (
            sb.table("seguimiento_bitacora_tipo_material")
            .update({
                "activo": True,
                "nombre": nombre_limpio,
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
        "activo": True,
        "created_by": int(user_id) if user_id is not None else None,
        "created_at": _now_utc().isoformat(),
        "updated_at": _now_utc().isoformat(),
    }
    try:
        inserted = sb.table("seguimiento_bitacora_tipo_material").insert(payload).execute().data or []
        return inserted[0] if inserted else None
    except Exception as exc:
        _log.warning("upsert_tipo_material insert: %s", exc)
        return None


def sync_tipos_material_desde_materiales(
    sb,
    contrato_id: int,
    materiales: List[dict],
    *,
    user_id: Optional[int] = None,
) -> None:
    """Persiste tipos nuevos escritos en Materiales al catálogo del contrato."""
    for item in materiales or []:
        if not isinstance(item, dict):
            continue
        tipo = str(item.get("tipo_material") or item.get("tipo") or "").strip()
        if tipo:
            upsert_tipo_material(sb, contrato_id, tipo, user_id=user_id)


def list_visitantes(sb, contrato_id: int, q: str = "") -> List[dict]:
    try:
        rows = (
            sb.table("seguimiento_bitacora_visitante")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("activo", True)
            .order("nombre")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.debug("list_visitantes: %s", exc)
        return []
    needle = _norm_nombre_visitante(q)
    if not needle:
        return rows
    return [
        r for r in rows
        if needle in _norm_nombre_visitante(r.get("nombre") or "")
        or needle in _norm_nombre_visitante(r.get("cargo") or "")
    ]


def upsert_visitante(
    sb,
    contrato_id: int,
    nombre: str,
    *,
    cargo: str = "",
    user_id: Optional[int] = None,
) -> Optional[dict]:
    nombre_limpio = str(nombre or "").strip()
    if not nombre_limpio:
        return None
    nombre_norm = _norm_nombre_visitante(nombre_limpio)
    cargo_limpio = str(cargo or "").strip()
    try:
        existentes = (
            sb.table("seguimiento_bitacora_visitante")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("nombre_norm", nombre_norm)
            .limit(5)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("upsert_visitante select: %s", exc)
        return None
    for row in existentes:
        patch = {
            "activo": True,
            "nombre": nombre_limpio,
            "updated_at": _now_utc().isoformat(),
        }
        if cargo_limpio:
            patch["cargo"] = cargo_limpio
        if row.get("activo") and (
            not cargo_limpio or str(row.get("cargo") or "").strip() == cargo_limpio
        ) and str(row.get("nombre") or "") == nombre_limpio:
            return row
        try:
            updated = (
                sb.table("seguimiento_bitacora_visitante")
                .update(patch)
                .eq("id", int(row["id"]))
                .execute()
                .data
                or []
            )
            return updated[0] if updated else {**row, **patch}
        except Exception as exc:
            _log.warning("upsert_visitante update: %s", exc)
            return {**row, **patch}
    payload = {
        "contrato_id": int(contrato_id),
        "nombre": nombre_limpio,
        "nombre_norm": nombre_norm,
        "cargo": cargo_limpio,
        "activo": True,
        "created_by": int(user_id) if user_id is not None else None,
        "created_at": _now_utc().isoformat(),
        "updated_at": _now_utc().isoformat(),
    }
    try:
        inserted = sb.table("seguimiento_bitacora_visitante").insert(payload).execute().data or []
        return inserted[0] if inserted else None
    except Exception as exc:
        _log.warning("upsert_visitante insert: %s", exc)
        return None


def _normalizar_visitantes_lista(raw) -> List[dict]:
    out: List[dict] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            nombre = str(item.get("nombre") or "").strip()
            if not nombre:
                continue
            cargo = str(item.get("cargo") or "").strip()
            vid = item.get("visitante_id") or item.get("id")
            try:
                vid_i = int(vid) if vid is not None and vid != "" else None
            except (TypeError, ValueError):
                vid_i = None
            out.append({
                "visitante_id": vid_i,
                "nombre": nombre,
                "cargo": cargo,
            })
        return out
    # Legacy: texto libre "Ana (Auditora), Luis"
    texto = str(raw or "").strip()
    if not texto:
        return out
    for part in re.split(r"[,;\n]+", texto):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(.+?)\s*\(([^)]*)\)\s*$", part)
        if m:
            out.append({"visitante_id": None, "nombre": m.group(1).strip(), "cargo": m.group(2).strip()})
        else:
            out.append({"visitante_id": None, "nombre": part, "cargo": ""})
    return out


def _fmt_visitantes_texto(lista: List[dict]) -> str:
    parts = []
    for v in lista or []:
        nombre = str(v.get("nombre") or "").strip()
        if not nombre:
            continue
        cargo = str(v.get("cargo") or "").strip()
        parts.append(f"{nombre} ({cargo})" if cargo else nombre)
    return ", ".join(parts)


def sync_visitantes_catalogo(
    sb,
    contrato_id: int,
    visitantes: List[dict],
    *,
    user_id: Optional[int] = None,
) -> List[dict]:
    """Upsert catálogo y devuelve snapshot inmutable para evento_detalle."""
    synced: List[dict] = []
    for item in visitantes or []:
        if not isinstance(item, dict):
            continue
        nombre = str(item.get("nombre") or "").strip()
        if not nombre:
            continue
        cargo = str(item.get("cargo") or "").strip()
        cat = upsert_visitante(
            sb, contrato_id, nombre, cargo=cargo, user_id=user_id,
        )
        synced.append({
            "visitante_id": int(cat["id"]) if cat and cat.get("id") is not None else item.get("visitante_id"),
            "nombre": str((cat or {}).get("nombre") or nombre),
            "cargo": cargo or str((cat or {}).get("cargo") or "").strip(),
        })
    return synced


def _strip_para_autocompletar(entrada: dict) -> dict:
    """Personal + maquinaria del día anterior. Materiales nunca se autocompletan."""
    personal = _normalizar_personal(entrada.get("personal"))
    usos = []
    for u in entrada.get("equipos_uso") or []:
        if not isinstance(u, dict):
            continue
        nombre = str(u.get("equipo_nombre") or "").strip()
        if not nombre:
            continue
        usos.append({
            "equipo_id": u.get("equipo_id"),
            "equipo_nombre": nombre,
            "operador": str(u.get("operador") or "").strip() or None,
            "cantidad": u.get("cantidad") if u.get("cantidad") is not None else 1,
            "hora_inicio": u.get("hora_inicio"),
            "hora_fin": u.get("hora_fin"),
            "horas_intermedias": _normalizar_horas_intermedias(u.get("horas_intermedias")),
            "preoperacionales": [],  # no arrastrar escáneres
            "orden": u.get("orden"),
        })
    return {
        "fuente_id": entrada.get("id"),
        "fuente_fecha": entrada.get("fecha"),
        "personal": personal,
        "equipos_uso": usos,
        "materiales": [],  # siempre vacío: movimientos son del día
    }


def plantilla_autocompletar_diario(sb, contrato_id: int) -> Optional[dict]:
    """
    Último Reporte Diario del contrato (preferir cerrado; si no, el más reciente).
    No incluye fecha/hora/clima.
    """
    # Preferir cerrado más reciente
    rows = (
        sb.table("seguimiento_bitacora_entrada")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("tipo", "diario")
        .eq("estado", "cerrado")
        .order("fecha", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        rows = (
            sb.table("seguimiento_bitacora_entrada")
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("tipo", "diario")
            .order("fecha", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not rows:
        return None
    enriched = _enrich_entrada(sb, rows[0])
    return _strip_para_autocompletar(enriched)


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


def _list_usos_batch(sb, entrada_ids: List[int]) -> Dict[int, List[dict]]:
    """Una sola query para usos de muchas entradas (evita N+1 en listados)."""
    ids = sorted({int(x) for x in entrada_ids if x is not None})
    out: Dict[int, List[dict]] = {i: [] for i in ids}
    if not ids:
        return out
    # PostgREST .in_ con listas grandes: trocear por seguridad
    chunk = 80
    for i in range(0, len(ids), chunk):
        part = ids[i : i + chunk]
        rows = (
            sb.table("seguimiento_bitacora_equipo_uso")
            .select("*")
            .in_("entrada_id", part)
            .order("orden")
            .execute()
            .data
            or []
        )
        for r in rows:
            eid = int(r.get("entrada_id") or 0)
            if eid in out:
                out[eid].append(r)
    return out


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
            "preoperacionales": _persist_adjuntos_sin_data_uri(
                _normalizar_adjuntos_flex(item.get("preoperacionales") or [])
            ),
            "orden": int(item.get("orden") if item.get("orden") is not None else i),
            "created_at": _now_utc().isoformat(),
        }
        try:
            inserted = sb.table("seguimiento_bitacora_equipo_uso").insert(payload).execute().data or []
        except Exception:
            # Columna preoperacionales puede no existir aún
            payload.pop("preoperacionales", None)
            inserted = sb.table("seguimiento_bitacora_equipo_uso").insert(payload).execute().data or []
        if inserted:
            rows_out.append(inserted[0])
    return rows_out


def _enrich_entrada(
    sb,
    row: dict,
    *,
    usos: Optional[List[dict]] = None,
    include_usos: bool = True,
) -> dict:
    """
    Normaliza JSON embebido y adjunta usos de equipo.

    No descarga blobs: las miniaturas van por endpoint /bitacora/media.
    """
    out = dict(row)
    out["personal"] = _normalizar_personal(out.get("personal"))
    out["imagenes"] = [
        _enrich_imagen_preview(x) or x
        for x in _normalizar_imagenes(out.get("imagenes"))
    ]
    mats = _normalizar_materiales(out.get("materiales"))
    for m in mats:
        m["adjuntos"] = [_enrich_imagen_preview(v) or v for v in (m.get("adjuntos") or [])]
    out["materiales"] = mats
    out["dirigido_a"] = str(out.get("dirigido_a") or "").strip()
    if not isinstance(out.get("evento_detalle"), dict):
        out["evento_detalle"] = {}
    if include_usos:
        if usos is not None:
            usos_list = list(usos)
        elif out.get("id") is not None:
            usos_list = _list_usos(sb, int(out["id"]))
        else:
            usos_list = []
    else:
        usos_list = []
    for u in usos_list:
        pre = u.get("preoperacionales") if isinstance(u.get("preoperacionales"), list) else []
        u["preoperacionales"] = [
            _enrich_imagen_preview(x) or x for x in _normalizar_adjuntos_flex(pre)
        ]
    out["equipos_uso"] = usos_list
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
    """
    Lista entradas del contrato. Visibilidad: cualquier usuario con permiso
    «Ver» de Bitácora (o Desarrollador) ve todas las entradas del contrato;
    no hay filtro adicional por elaborador, asistencia ni asignación.
    """
    t0 = time.perf_counter()
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

    # Autocierre lazy + batch de usos (evita N+1 round-trips a PostgREST)
    closed_rows = []
    for row in rows:
        closed_rows.append(asegurar_autocierre_entrada(sb, row))
    usos_map = _list_usos_batch(
        sb,
        [int(r["id"]) for r in closed_rows if r.get("id") is not None],
    )

    out = []
    for row in closed_rows:
        eid = int(row["id"]) if row.get("id") is not None else None
        enriched = _enrich_entrada(
            sb,
            row,
            usos=usos_map.get(eid, []) if eid is not None else [],
        )
        if q:
            needle = str(q).strip().lower()
            blob = " ".join([
                str(enriched.get("cuerpo_html") or ""),
                str(enriched.get("evento_tipo") or ""),
                str(enriched.get("created_by_nombre") or ""),
                str(enriched.get("clima_descripcion") or ""),
                str(enriched.get("dirigido_a") or ""),
            ]).lower()
            if needle and needle not in blob:
                continue
        out.append(enriched)
    _log.info(
        "bitacora.list contrato=%s rows=%s ms=%.1f",
        contrato_id, len(out), (time.perf_counter() - t0) * 1000.0,
    )
    return out


def _fetch_entrada_row(sb, contrato_id: int, entrada_id: int) -> dict:
    """SELECT + autocierre, sin enriquecer usos/media."""
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
    return asegurar_autocierre_entrada(sb, rows[0])


def get_entrada(sb, contrato_id: int, entrada_id: int) -> dict:
    row = _fetch_entrada_row(sb, contrato_id, entrada_id)
    return _enrich_entrada(sb, row)


def _diario_existe_fecha(sb, contrato_id: int, fecha_iso: str) -> bool:
    rows = (
        sb.table("seguimiento_bitacora_entrada")
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("tipo", "diario")
        .eq("fecha", str(fecha_iso)[:10])
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


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
    stages: Dict[str, float] = {}
    t_all = time.perf_counter()

    with _stage_timer(stages, "validar_fecha"):
        fecha = _parse_fecha(data.get("fecha") or hoy_bogota().isoformat())
        ahora = ahora_bogota()
        hoy = ahora.date()
        if fecha > hoy:
            raise ValueError("No se puede crear un Reporte Diario con fecha futura")
        if fecha < hoy and not es_desarrollador_bitacora(current_user):
            raise ValueError(
                "No se puede crear un Reporte Diario para una fecha ya pasada; "
                "el cierre automático a las 23:59:59 ya aplica."
            )
        if (
            fecha == hoy
            and ahora >= momento_cierre_diario(fecha)
            and not es_desarrollador_bitacora(current_user)
        ):
            raise ValueError(
                "El día del Reporte Diario ya cerró a las 23:59:59. "
                "Solo puede iniciarse el Reporte Diario de una fecha nueva."
            )
        if _diario_existe_fecha(sb, contrato_id, fecha.isoformat()):
            raise ValueError(
                f"Ya existe un Reporte Diario para el {fecha.isoformat()}. "
                "Ábralo para complementar mientras esté abierto."
            )

    with _stage_timer(stages, "usuario_meta"):
        u = _usuario_row(sb, user_id)
        hora_inicio = _parse_hora(data.get("hora_inicio_labores"))
        if not hora_inicio:
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
            "materiales": _persist_materiales(_normalizar_materiales(data.get("materiales"))),
            "cuerpo_html": str(data.get("cuerpo_html") or ""),
            "imagenes": [],
            "created_by": int(user_id),
            "created_by_nombre": _nombre_usuario(u) or str(current_user.get("nombre") or "") if current_user else _nombre_usuario(u),
            "created_by_rol": _rol_nombre(sb, u, current_user),
            "created_at": _now_utc().isoformat(),
            "updated_at": _now_utc().isoformat(),
        }
        payload["personal"] = _expandir_personal_otro(payload["personal"])

    with _stage_timer(stages, "sync_cargos"):
        sync_cargos_desde_personal(sb, contrato_id, payload["personal"], user_id=user_id)

    with _stage_timer(stages, "sync_tipos_material"):
        sync_tipos_material_desde_materiales(
            sb, contrato_id, payload.get("materiales") or [], user_id=user_id,
        )

    with _stage_timer(stages, "insert_db"):
        try:
            inserted = sb.table("seguimiento_bitacora_entrada").insert(payload).execute().data or []
        except Exception as exc:
            # Columna materiales ausente en esquemas antiguos: un reintento sin ella.
            _log.warning("bitacora.crear_diario insert con materiales falló: %s", exc)
            payload.pop("materiales", None)
            inserted = sb.table("seguimiento_bitacora_entrada").insert(payload).execute().data or []
        if not inserted:
            raise ValueError("No se pudo crear el Reporte Diario")
        entrada = inserted[0]

    with _stage_timer(stages, "sync_usos"):
        usos = data.get("equipos_uso") or data.get("maquinaria") or []
        usos_rows: List[dict] = []
        if usos:
            usos_rows = _sync_usos(sb, contrato_id, int(entrada["id"]), usos, user_id=user_id)

    with _stage_timer(stages, "enrich_respuesta"):
        # Respuesta desde la fila insertada + usos ya sincronizados (sin re-SELECT ni Azure).
        out = _enrich_entrada(sb, entrada, usos=usos_rows)

    stages["total"] = round((time.perf_counter() - t_all) * 1000.0, 1)
    _log.info(
        "bitacora.crear_diario contrato=%s id=%s stages_ms=%s",
        contrato_id, out.get("id"), stages,
    )
    out["_perf_ms"] = stages
    return out


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
        lista_in = detalle.get("visitantes_lista")
        if lista_in is None and detalle.get("visitantes") is not None:
            lista_in = detalle.get("visitantes")
        lista = _normalizar_visitantes_lista(lista_in)
        synced = sync_visitantes_catalogo(
            sb, contrato_id, lista, user_id=user_id,
        )
        detalle = {
            "visitantes_lista": synced,
            "visitantes": _fmt_visitantes_texto(synced) or str(detalle.get("visitantes") or "").strip(),
            "entidad": str(detalle.get("entidad") or "").strip(),
            "motivo": str(detalle.get("motivo") or "").strip(),
        }
    else:
        # Permitir visitantes_lista en cualquier evento si el cliente lo envía.
        if isinstance(detalle.get("visitantes_lista"), list):
            lista = _normalizar_visitantes_lista(detalle.get("visitantes_lista"))
            synced = sync_visitantes_catalogo(
                sb, contrato_id, lista, user_id=user_id,
            )
            detalle = {k: v for k, v in detalle.items() if v is not None}
            detalle["visitantes_lista"] = synced
            detalle["visitantes"] = _fmt_visitantes_texto(synced) or str(
                detalle.get("visitantes") or ""
            ).strip()
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
        "dirigido_a": str(data.get("dirigido_a") or "").strip() or None,
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
    try:
        inserted = sb.table("seguimiento_bitacora_entrada").insert(payload).execute().data or []
    except Exception:
        payload.pop("dirigido_a", None)
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
    stages: Dict[str, float] = {}
    t_all = time.perf_counter()

    with _stage_timer(stages, "cargar_entrada"):
        # Sin re-enrich de media/Azure: solo fila + autocierre.
        entrada = _fetch_entrada_row(sb, contrato_id, entrada_id)
        assert_puede_editar_entrada(entrada, current_user)

    patch: Dict[str, Any] = {"updated_at": _now_utc().isoformat()}
    tipo = str(entrada.get("tipo") or "")
    usos_rows: Optional[List[dict]] = None

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
            with _stage_timer(stages, "sync_cargos"):
                pers = _expandir_personal_otro(_normalizar_personal(data.get("personal")))
                patch["personal"] = pers
                sync_cargos_desde_personal(sb, contrato_id, pers, user_id=user_id)
        if "materiales" in data:
            mats = _persist_materiales(_normalizar_materiales(data.get("materiales")))
            patch["materiales"] = mats
            with _stage_timer(stages, "sync_tipos_material"):
                sync_tipos_material_desde_materiales(
                    sb, contrato_id, mats, user_id=user_id,
                )
        if "equipos_uso" in data or "maquinaria" in data:
            with _stage_timer(stages, "sync_usos"):
                usos = data.get("equipos_uso") if "equipos_uso" in data else data.get("maquinaria")
                usos_list = usos or []
                # Evitar DELETE+vacío cuando no hay usos nuevos ni existentes.
                if not usos_list:
                    existentes = _list_usos(sb, entrada_id)
                    if existentes:
                        usos_rows = _sync_usos(sb, contrato_id, entrada_id, [], user_id=user_id)
                    else:
                        usos_rows = []
                else:
                    usos_rows = _sync_usos(sb, contrato_id, entrada_id, usos_list, user_id=user_id)
    else:
        # evento — solo Dev llega aquí
        if "evento_detalle" in data and isinstance(data.get("evento_detalle"), dict):
            patch["evento_detalle"] = data["evento_detalle"]
        if "evento_tipo" in data:
            et = str(data.get("evento_tipo") or "").strip()
            if et in EVENTO_TIPOS:
                patch["evento_tipo"] = et
        if "dirigido_a" in data:
            patch["dirigido_a"] = str(data.get("dirigido_a") or "").strip() or None

    if "imagenes" in data:
        imgs = _normalizar_imagenes(data.get("imagenes"))
        if len(imgs) > MAX_IMAGENES_BITACORA:
            raise ValueError(f"Máximo {MAX_IMAGENES_BITACORA} fotografías por entrada de bitácora")
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

    with _stage_timer(stages, "update_db"):
        updated = (
            sb.table("seguimiento_bitacora_entrada")
            .update(patch)
            .eq("id", int(entrada_id))
            .execute()
            .data
            or []
        )
        row_out = updated[0] if updated else {**entrada, **patch}

    with _stage_timer(stages, "enrich_respuesta"):
        if usos_rows is None:
            out = _enrich_entrada(sb, row_out)
        else:
            out = _enrich_entrada(sb, row_out, usos=usos_rows)

    stages["total"] = round((time.perf_counter() - t_all) * 1000.0, 1)
    _log.info(
        "bitacora.update_entrada contrato=%s id=%s stages_ms=%s",
        contrato_id, entrada_id, stages,
    )
    out["_perf_ms"] = stages
    return out


def cerrar_reporte_diario(
    sb,
    contrato_id: int,
    entrada_id: int,
    user_id: int,
    *,
    current_user: Optional[dict] = None,
) -> dict:
    """Cierre manual deshabilitado: solo aplica el cierre automático a las 23:59:59."""
    raise ValueError(
        "El cierre manual del Reporte Diario fue deshabilitado. "
        "El reporte permanece editable hasta las 23:59:59 de su fecha, "
        "momento en el que se cierra automáticamente de forma permanente."
    )


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
    entrada = _fetch_entrada_row(sb, contrato_id, entrada_id)
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

    updated = (
        sb.table("seguimiento_bitacora_entrada")
        .update({
            "imagenes": [
                {k: v for k, v in im.items() if k != "data_uri" or not im.get("blob_path")}
                for im in nuevos
            ],
            "updated_at": _now_utc().isoformat(),
        })
        .eq("id", int(entrada_id))
        .execute()
        .data
        or []
    )

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

    row_out = updated[0] if updated else {**entrada, "imagenes": nuevos}
    out = _enrich_entrada(sb, row_out)
    # Preview inmediata de la última subida (ya en memoria; sin re-descargar Azure).
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
            # Sin descarga Azure: solo metadatos + blob_path (preview bajo demanda).
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
    """Cierre automático a las 23:59:59 de la fecha del reporte (cron o lazy batch)."""
    ahora = ahora_bogota()
    hoy = ahora.date().isoformat()
    query = (
        sb.table("seguimiento_bitacora_entrada")
        .select("id, contrato_id, fecha, estado, tipo")
        .eq("tipo", "diario")
        .eq("estado", "abierto")
        .lte("fecha", hoy)
    )
    if contrato_id is not None:
        query = query.eq("contrato_id", int(contrato_id))
    rows = query.execute().data or []
    cerrados = 0
    for row in rows:
        if not _debe_autocerrar(row, ahora=ahora):
            continue
        try:
            _aplicar_cierre(sb, int(row["id"]), None, "automatico_dia")
            cerrados += 1
        except Exception as exc:
            _log.warning("autocierre bitacora %s: %s", row.get("id"), exc)
    return {
        "cerrados": cerrados,
        "revisados": len(rows),
        "fecha_corte": hoy,
        "cierre_hora": "23:59:59",
        "ahora": ahora.isoformat(),
    }


# ── Exportación PDF / clima histórico ─────────────────────────────────────────

CLIMA_SLOTS_3H = (0, 3, 6, 9, 12, 15, 18, 21)
_CLIMA_SLOTS_CACHE: Dict[tuple, Tuple[float, List[dict]]] = {}
_CLIMA_SLOTS_CACHE_LOCK = threading.Lock()
_CLIMA_SLOTS_CACHE_TTL = 3600.0
_CLIMA_HTTP_TIMEOUT = 5.0


def _centroide_desde_geojson(geo) -> Optional[Tuple[float, float]]:
    try:
        import json

        g = json.loads(geo) if isinstance(geo, str) else geo
    except Exception:
        return None
    if not isinstance(g, dict):
        return None
    coords: List[Tuple[float, float]] = []

    def walk(obj):
        if obj is None:
            return
        if isinstance(obj, (list, tuple)) and len(obj) >= 2 and all(
            isinstance(x, (int, float)) for x in obj[:2]
        ):
            coords.append((float(obj[0]), float(obj[1])))
            return
        if isinstance(obj, list):
            for x in obj:
                walk(x)
        elif isinstance(obj, dict):
            if "coordinates" in obj:
                walk(obj["coordinates"])
            if "features" in obj:
                walk(obj["features"])
            if "geometry" in obj:
                walk(obj["geometry"])

    walk(g)
    if not coords:
        return None
    lng = sum(c[0] for c in coords) / len(coords)
    lat = sum(c[1] for c in coords) / len(coords)
    return lat, lng


def contrato_meta_bitacora(sb, contrato_id: int) -> dict:
    """Metadatos de contrato + logos + paleta + centroide para PDF/clima."""
    select_full = (
        "id, numero, objeto, contratista, interventoria, entidad, entidad_otra, "
        "logo_entidad, logo_contratista, logo_interventoria, "
        "centro_lat, centro_lng, plano_geojson, numero_interventoria, "
        "export_palette, ccd_firma_config"
    )
    select_basic = (
        "id, numero, objeto, contratista, interventoria, entidad, entidad_otra, "
        "logo_entidad, logo_contratista, logo_interventoria, "
        "centro_lat, centro_lng, plano_geojson, numero_interventoria"
    )
    rows = []
    try:
        rows = (
            sb.table("contratos")
            .select(select_full)
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.debug("contrato_meta_bitacora palette select: %s", exc)
        rows = (
            sb.table("contratos")
            .select(select_basic)
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    if not rows:
        raise ValueError("Contrato no encontrado")
    c = dict(rows[0])
    lat = c.get("centro_lat")
    lng = c.get("centro_lng")
    try:
        lat_f = float(lat) if lat is not None and lat != "" else None
        lng_f = float(lng) if lng is not None and lng != "" else None
    except (TypeError, ValueError):
        lat_f, lng_f = None, None
    if lat_f is None or lng_f is None:
        centro = _centroide_desde_geojson(c.get("plano_geojson"))
        if centro:
            lat_f, lng_f = centro
    if lat_f is None or lng_f is None:
        lat_f, lng_f = 4.711, -74.0721
    c["geo_lat"] = lat_f
    c["geo_lng"] = lng_f
    c["export_palette"] = _export_palette_contrato(c)
    return c


def _export_palette_contrato(row: dict) -> dict:
    """Paleta de exportación del contrato (misma forma que Contratos / Excel)."""
    defaults = {
        "encabezado": {"bg": "#DDEFF8", "text": "#0F2942"},
        "titulo_1": {"bg": "#EEF7FB", "text": "#0F2942"},
        "titulo_2": {"bg": "#E5F4FA", "text": "#1F4E70"},
        "linea_principal": {"bg": "#FFFFFF", "text": "#0F2942"},
        "linea_secundaria": {"bg": "#F8FAFC", "text": "#0F2942"},
    }

    def _hex(v) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        if not s.startswith("#"):
            s = f"#{s}"
        if re.match(r"^#[0-9A-Fa-f]{6}$", s):
            return s.upper()
        return None

    raw: dict = {}
    if isinstance(row.get("export_palette"), dict):
        raw = row["export_palette"]
    else:
        cfg = row.get("ccd_firma_config")
        if isinstance(cfg, dict) and isinstance(cfg.get("export_palette"), dict):
            raw = cfg["export_palette"]

    out = {}
    legacy_bg = {
        "encabezado": "encabezado",
        "titulo_1": "subtitulos",
        "titulo_2": "cuerpo_principal",
        "linea_principal": "cuerpo_principal",
        "linea_secundaria": "cuerpo_secundario",
    }
    for tier, def_t in defaults.items():
        block = raw.get(tier) if isinstance(raw, dict) else None
        bg = text = None
        if isinstance(block, dict):
            bg = _hex(block.get("bg"))
            text = _hex(block.get("text"))
        elif isinstance(block, str):
            bg = _hex(block)
        if not bg:
            bg = _hex(raw.get(legacy_bg.get(tier, "")))
        if not text:
            text = _hex(raw.get(f"{tier}_text"))
        out[tier] = {"bg": bg or def_t["bg"], "text": text or def_t["text"]}
    return out


def _slot_3h_desde_hora(hora_val) -> int:
    """Tramo de 3 h (0,3,…,21) que contiene la hora dada."""
    parsed = _parse_hora(hora_val)
    if not parsed:
        return 12
    hh = int(parsed.split(":")[0])
    return max(0, min(21, (hh // 3) * 3))


def consultar_clima_slots_3h(
    lat: float,
    lng: float,
    fecha_iso: str,
    *,
    manual: Optional[dict] = None,
) -> List[dict]:
    """
    Tabla de clima cada 3 h desde Open-Meteo (ubicación del contrato).
    Si `manual` trae clima_editado_manual + codigo/temp, sobrescribe el slot
    de hora_inicio_labores.

    Cache in-process por (lat, lng, fecha) para que vista previa / export PDF
    no reconsulten Open-Meteo en cada click (~segundos → milisegundos).
    """
    import copy
    import httpx

    fecha = str(fecha_iso)[:10]
    cache_key = (round(float(lat), 4), round(float(lng), 4), fecha)

    with _CLIMA_SLOTS_CACHE_LOCK:
        hit = _CLIMA_SLOTS_CACHE.get(cache_key)
        if hit is not None:
            exp, cached_slots = hit
            if exp > time.time():
                slots = copy.deepcopy(cached_slots)
            else:
                _CLIMA_SLOTS_CACHE.pop(cache_key, None)
                slots = None
        else:
            slots = None

    if slots is None:
        params = {
            "latitude": str(lat),
            "longitude": str(lng),
            "start_date": fecha,
            "end_date": fecha,
            "hourly": "temperature_2m,weather_code",
            "timezone": "America/Bogota",
        }
        hourly: dict = {}
        hoy = hoy_bogota().isoformat()
        urls = []
        if fecha >= hoy:
            urls.append("https://api.open-meteo.com/v1/forecast")
            urls.append("https://archive-api.open-meteo.com/v1/archive")
        else:
            urls.append("https://archive-api.open-meteo.com/v1/archive")
            urls.append("https://api.open-meteo.com/v1/forecast")

        timeout = httpx.Timeout(_CLIMA_HTTP_TIMEOUT, connect=min(3.0, _CLIMA_HTTP_TIMEOUT))
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                for url in urls:
                    try:
                        res = client.get(url, params=params)
                        if res.status_code >= 400:
                            continue
                        data = res.json() or {}
                        hourly = data.get("hourly") or {}
                        if hourly.get("time"):
                            break
                    except Exception as exc:
                        _log.warning("open-meteo clima bitácora %s: %s", url, exc)
        except Exception as exc:
            _log.warning("open-meteo cliente bitácora: %s", exc)

        by_hour: Dict[int, dict] = {}
        times = hourly.get("time") or []
        temps = hourly.get("temperature_2m") or []
        codes = hourly.get("weather_code") or []
        for i, ts in enumerate(times):
            try:
                hh = int(str(ts)[11:13])
            except (TypeError, ValueError):
                continue
            if hh not in CLIMA_SLOTS_3H:
                continue
            code = codes[i] if i < len(codes) else None
            temp = temps[i] if i < len(temps) else None
            try:
                code_i = int(code) if code is not None and code != "" else None
            except (TypeError, ValueError):
                code_i = None
            try:
                temp_f = float(temp) if temp is not None and temp != "" else None
            except (TypeError, ValueError):
                temp_f = None
            by_hour[hh] = {
                "hora": f"{hh:02d}:00",
                "hora_num": hh,
                "clima_codigo": code_i,
                "clima_temp_c": temp_f,
                "clima_descripcion": clima_label(code_i) if code_i is not None else "",
                "fuente": "open-meteo",
                "manual": False,
            }

        slots = []
        for hh in CLIMA_SLOTS_3H:
            row = by_hour.get(hh) or {
                "hora": f"{hh:02d}:00",
                "hora_num": hh,
                "clima_codigo": None,
                "clima_temp_c": None,
                "clima_descripcion": "—",
                "fuente": "sin-dato",
                "manual": False,
            }
            slots.append(row)

        with _CLIMA_SLOTS_CACHE_LOCK:
            _CLIMA_SLOTS_CACHE[cache_key] = (
                time.time() + _CLIMA_SLOTS_CACHE_TTL,
                copy.deepcopy(slots),
            )
            if len(_CLIMA_SLOTS_CACHE) > 256:
                now = time.time()
                dead = [k for k, (e, _) in _CLIMA_SLOTS_CACHE.items() if e < now]
                for k in dead:
                    _CLIMA_SLOTS_CACHE.pop(k, None)

    if manual and bool(manual.get("clima_editado_manual")):
        slot_h = _slot_3h_desde_hora(manual.get("hora_inicio_labores"))
        try:
            code_m = (
                int(manual["clima_codigo"])
                if manual.get("clima_codigo") is not None and manual.get("clima_codigo") != ""
                else None
            )
        except (TypeError, ValueError):
            code_m = None
        try:
            temp_m = (
                float(manual["clima_temp_c"])
                if manual.get("clima_temp_c") is not None and manual.get("clima_temp_c") != ""
                else None
            )
        except (TypeError, ValueError):
            temp_m = None
        desc_m = str(manual.get("clima_descripcion") or "").strip() or (
            clima_label(code_m) if code_m is not None else ""
        )
        for row in slots:
            if row["hora_num"] == slot_h:
                row.update({
                    "clima_codigo": code_m if code_m is not None else row.get("clima_codigo"),
                    "clima_temp_c": temp_m if temp_m is not None else row.get("clima_temp_c"),
                    "clima_descripcion": desc_m or row.get("clima_descripcion") or "—",
                    "fuente": "manual",
                    "manual": True,
                })
                break
    return slots


def clear_clima_slots_cache_for_tests() -> None:
    """Limpia caché de clima (solo tests)."""
    with _CLIMA_SLOTS_CACHE_LOCK:
        _CLIMA_SLOTS_CACHE.clear()


def list_entradas_del_dia(sb, contrato_id: int, fecha: str) -> Dict[str, Any]:
    """Diario + eventos del día (enriquecidos) para exportación PDF."""
    f = _parse_fecha(fecha).isoformat()
    rows = list_entradas(sb, contrato_id, fecha_desde=f, fecha_hasta=f)
    diario = next((r for r in rows if str(r.get("tipo") or "") == "diario"), None)
    eventos = [r for r in rows if str(r.get("tipo") or "") == "evento"]
    return {"fecha": f, "diario": diario, "eventos": eventos, "todas": rows}

