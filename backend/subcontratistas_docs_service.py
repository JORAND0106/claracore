"""
Documentación y pólizas de subcontratistas (ClaraCore).

- Pólizas con historial (renovación no borra la anterior).
- Documentos requeridos para corte: contrato firmado, propuesta económica, seguridad social.
- Regla de bloqueo de generación automática de cortes si falta documentación.
- Alertas de vencimiento de pólizas (umbrales configurables, default 30 y 15 días).
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_subcontratista_documento,
    path_subcontratista_poliza,
    upload_blob_private,
)

_log = logging.getLogger("claracore.subcontratistas.docs")

POLIZA_TIPOS = frozenset({"garantia", "responsabilidad_civil", "otro"})
DOC_TIPOS = frozenset({"contrato_firmado", "propuesta_economica", "seguridad_social"})
DOC_TIPOS_VERSIONADOS = frozenset({"contrato_firmado", "propuesta_economica"})
DOC_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})
MAX_DOC_BYTES = 20 * 1024 * 1024

_TABLE_POLIZAS = "subcontratista_polizas"
_TABLE_DOCS = "subcontratista_documentos"
_TABLE_ALERTA_CFG = "subcontratista_poliza_alerta_config"

DEFAULT_DIAS_ALERTA = (30, 15)

POLIZA_TIPO_LABEL = {
    "garantia": "Garantía",
    "responsabilidad_civil": "Responsabilidad Civil y Extracontractual",
    "otro": "Otro",
}

DOC_TIPO_LABEL = {
    "contrato_firmado": "Contrato Firmado",
    "propuesta_economica": "Propuesta Económica",
    "seguridad_social": "Pago de Seguridad Social",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_mime(content_type: Optional[str]) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    s = str(value).strip()[:10]
    if not s:
        return None
    return date.fromisoformat(s)


def validate_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > MAX_DOC_BYTES:
        raise ValueError(f"El archivo supera el máximo de {MAX_DOC_BYTES // (1024 * 1024)} MB.")
    mime = _normalize_mime(content_type)
    if mime not in DOC_MIMES:
        raise ValueError("Formato no permitido. Use PDF o imagen (JPEG, PNG, WebP).")
    return mime


def _validate_poliza_tipo(tipo: str, tipo_otro_texto: Optional[str]) -> Tuple[str, Optional[str]]:
    t = (tipo or "").strip().lower()
    if t not in POLIZA_TIPOS:
        raise ValueError(
            "Tipo de póliza inválido. Opciones: Garantía, Responsabilidad Civil y Extracontractual, Otro."
        )
    otro = (tipo_otro_texto or "").strip() or None
    if t == "otro":
        if not otro:
            raise ValueError("Indique el nombre del tipo de póliza cuando elige «Otro».")
        return t, otro[:200]
    return t, None


def periodo_corte(fecha_inicio: Any, fecha_fin: Any = None) -> str:
    """YYYY-MM del período de seguridad social asociado al corte (mes de fecha_inicio)."""
    fi = _parse_date(fecha_inicio)
    if not fi:
        raise ValueError("Fecha de inicio de corte inválida.")
    return f"{fi.year:04d}-{fi.month:02d}"


def get_alerta_config(sb, contrato_id: int) -> dict:
    rows = (
        sb.table(_TABLE_ALERTA_CFG)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        d1 = int(rows[0].get("dias_alerta_1") or DEFAULT_DIAS_ALERTA[0])
        d2 = int(rows[0].get("dias_alerta_2") or DEFAULT_DIAS_ALERTA[1])
        return {
            "contrato_id": int(contrato_id),
            "dias_alerta_1": max(d1, d2),
            "dias_alerta_2": min(d1, d2),
        }
    return {
        "contrato_id": int(contrato_id),
        "dias_alerta_1": DEFAULT_DIAS_ALERTA[0],
        "dias_alerta_2": DEFAULT_DIAS_ALERTA[1],
    }


def upsert_alerta_config(sb, contrato_id: int, dias_alerta_1: int, dias_alerta_2: int, user_id: Optional[int]) -> dict:
    d1 = max(1, min(int(dias_alerta_1), 365))
    d2 = max(1, min(int(dias_alerta_2), 365))
    if d1 < d2:
        d1, d2 = d2, d1
    row = {
        "contrato_id": int(contrato_id),
        "dias_alerta_1": d1,
        "dias_alerta_2": d2,
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }
    sb.table(_TABLE_ALERTA_CFG).upsert(row, on_conflict="contrato_id").execute()
    return get_alerta_config(sb, contrato_id)


# ── Checklist documentos para corte ──────────────────────────────────────────

def _docs_visibles(sb, subcontratista_id: int, tipo: Optional[str] = None) -> List[dict]:
    q = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("subcontratista_id", int(subcontratista_id))
        .is_("eliminado_en", "null")
        .order("created_at", desc=True)
    )
    if tipo:
        q = q.eq("tipo", tipo)
    return q.execute().data or []


def tiene_documento_vigente(sb, subcontratista_id: int, tipo: str) -> bool:
    if tipo not in DOC_TIPOS_VERSIONADOS:
        return False
    rows = _docs_visibles(sb, subcontratista_id, tipo)
    return any(bool(r.get("vigente")) for r in rows)


def tiene_seguridad_social_periodo(sb, subcontratista_id: int, periodo: str) -> bool:
    per = (periodo or "").strip()
    if not re.match(r"^\d{4}-\d{2}$", per):
        return False
    rows = _docs_visibles(sb, subcontratista_id, "seguridad_social")
    return any(str(r.get("periodo") or "") == per for r in rows)


def checklist_docs_corte(
    sb,
    subcontratista_id: int,
    *,
    fecha_inicio: Any,
    fecha_fin: Any = None,
    corte_id: Optional[int] = None,
) -> dict:
    """
    Evalúa los 3 documentos requeridos para permitir generación/uso de un corte.
    Seguridad social se valida por período YYYY-MM del corte (fecha_inicio).
    """
    periodo = periodo_corte(fecha_inicio, fecha_fin)
    contrato_ok = tiene_documento_vigente(sb, subcontratista_id, "contrato_firmado")
    propuesta_ok = tiene_documento_vigente(sb, subcontratista_id, "propuesta_economica")
    ss_ok = tiene_seguridad_social_periodo(sb, subcontratista_id, periodo)
    if not ss_ok and corte_id is not None:
        rows = _docs_visibles(sb, subcontratista_id, "seguridad_social")
        ss_ok = any(int(r.get("corte_id") or 0) == int(corte_id) for r in rows)

    faltantes: List[str] = []
    if not contrato_ok:
        faltantes.append("contrato_firmado")
    if not propuesta_ok:
        faltantes.append("propuesta_economica")
    if not ss_ok:
        faltantes.append("seguridad_social")

    return {
        "ok": len(faltantes) == 0,
        "periodo_seguridad_social": periodo,
        "contrato_firmado": contrato_ok,
        "propuesta_economica": propuesta_ok,
        "seguridad_social": ss_ok,
        "faltantes": faltantes,
        "faltantes_labels": [DOC_TIPO_LABEL.get(f, f) for f in faltantes],
    }


def puede_generar_corte_automatico(
    sb,
    subcontratista_id: int,
    *,
    fecha_inicio: Any,
    fecha_fin: Any = None,
) -> Tuple[bool, dict]:
    chk = checklist_docs_corte(
        sb, subcontratista_id, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin
    )
    return bool(chk["ok"]), chk


# ── Pólizas ──────────────────────────────────────────────────────────────────

def list_polizas(sb, subcontratista_id: int, *, incluir_historico: bool = True) -> List[dict]:
    q = (
        sb.table(_TABLE_POLIZAS)
        .select("*")
        .eq("subcontratista_id", int(subcontratista_id))
        .order("fecha_vencimiento", desc=True)
        .order("created_at", desc=True)
    )
    rows = q.execute().data or []
    if not incluir_historico:
        rows = [r for r in rows if (r.get("estado") or "") == "vigente"]
    hoy = date.today()
    out = []
    for r in rows:
        item = dict(r)
        item["tipo_label"] = _poliza_tipo_label(r)
        fv = _parse_date(r.get("fecha_vencimiento"))
        estado = (r.get("estado") or "vigente").strip().lower()
        if estado == "vigente" and fv and fv < hoy:
            item["estado_efectivo"] = "vencida"
            item["dias_para_vencer"] = (fv - hoy).days
        elif estado == "vigente" and fv:
            item["estado_efectivo"] = "vigente"
            item["dias_para_vencer"] = (fv - hoy).days
        else:
            item["estado_efectivo"] = estado
            item["dias_para_vencer"] = (fv - hoy).days if fv else None
        out.append(item)
    return out


def _poliza_tipo_label(row: dict) -> str:
    t = (row.get("tipo") or "").strip().lower()
    if t == "otro":
        return (row.get("tipo_otro_texto") or "Otro").strip() or "Otro"
    return POLIZA_TIPO_LABEL.get(t, t)


def create_poliza(
    sb,
    *,
    subcontratista_id: int,
    contrato_id: int,
    tipo: str,
    tipo_otro_texto: Optional[str],
    fecha_vencimiento: str,
    valor_asegurado: Optional[float],
    data: Optional[bytes],
    content_type: Optional[str],
    nombre_archivo: Optional[str],
    user_id: Optional[int],
    replaces_id: Optional[int] = None,
    notas: Optional[str] = None,
) -> dict:
    tipo_n, otro = _validate_poliza_tipo(tipo, tipo_otro_texto)
    fv = _parse_date(fecha_vencimiento)
    if not fv:
        raise ValueError("La fecha de vencimiento es obligatoria.")
    valor = None
    if valor_asegurado is not None and str(valor_asegurado).strip() != "":
        valor = float(valor_asegurado)
        if valor < 0:
            raise ValueError("El valor asegurado no puede ser negativo.")

    blob_path = None
    mime = None
    file_name = None
    size = None
    if data is not None:
        mime = validate_upload(content_type, len(data))
        file_name = (nombre_archivo or "poliza").strip()[:255] or "poliza"
        blob_path = path_subcontratista_poliza(contrato_id, subcontratista_id, file_name)
        upload_blob_private(blob_path, data, mime, overwrite=True)
        size = len(data)

    if replaces_id is not None:
        prev = (
            sb.table(_TABLE_POLIZAS)
            .select("*")
            .eq("id", int(replaces_id))
            .eq("subcontratista_id", int(subcontratista_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not prev:
            raise ValueError("La póliza a renovar no existe.")
        if (prev[0].get("estado") or "") == "reemplazada":
            raise ValueError("Esa póliza ya fue reemplazada.")

    row = {
        "subcontratista_id": int(subcontratista_id),
        "contrato_id": int(contrato_id),
        "tipo": tipo_n,
        "tipo_otro_texto": otro,
        "fecha_vencimiento": fv.isoformat(),
        "valor_asegurado": valor,
        "azure_blob_path": blob_path,
        "nombre_archivo": file_name,
        "mime_type": mime,
        "tamano_bytes": size,
        "estado": "vigente",
        "replaces_id": int(replaces_id) if replaces_id is not None else None,
        "notas": (notas or "").strip() or None,
        "created_by": user_id,
    }
    ins = sb.table(_TABLE_POLIZAS).insert(row).execute()
    nuevo = (ins.data or [row])[0]

    if replaces_id is not None:
        sb.table(_TABLE_POLIZAS).update({
            "estado": "reemplazada",
            "replaced_by_id": nuevo.get("id"),
            "updated_at": _now_iso(),
            "updated_by": user_id,
        }).eq("id", int(replaces_id)).execute()

    return nuevo


def update_poliza_meta(
    sb,
    poliza_id: int,
    subcontratista_id: int,
    patch: dict,
    user_id: Optional[int],
) -> dict:
    rows = (
        sb.table(_TABLE_POLIZAS)
        .select("*")
        .eq("id", int(poliza_id))
        .eq("subcontratista_id", int(subcontratista_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Póliza no encontrada.")
    cur = rows[0]
    if (cur.get("estado") or "") == "reemplazada":
        raise ValueError("No se puede editar una póliza histórica reemplazada. Cree una renovación.")

    upd: Dict[str, Any] = {"updated_at": _now_iso(), "updated_by": user_id}
    if "tipo" in patch or "tipo_otro_texto" in patch:
        tipo_n, otro = _validate_poliza_tipo(
            patch.get("tipo", cur.get("tipo")),
            patch.get("tipo_otro_texto", cur.get("tipo_otro_texto")),
        )
        upd["tipo"] = tipo_n
        upd["tipo_otro_texto"] = otro
    if "fecha_vencimiento" in patch:
        fv = _parse_date(patch.get("fecha_vencimiento"))
        if not fv:
            raise ValueError("Fecha de vencimiento inválida.")
        upd["fecha_vencimiento"] = fv.isoformat()
        # Reiniciar flags de alerta si cambia la fecha
        upd["alerta_30_enviada_at"] = None
        upd["alerta_15_enviada_at"] = None
        upd["alerta_vencida_enviada_at"] = None
    if "valor_asegurado" in patch:
        v = patch.get("valor_asegurado")
        upd["valor_asegurado"] = float(v) if v is not None and str(v).strip() != "" else None
    if "notas" in patch:
        upd["notas"] = (patch.get("notas") or "").strip() or None

    sb.table(_TABLE_POLIZAS).update(upd).eq("id", int(poliza_id)).execute()
    refreshed = (
        sb.table(_TABLE_POLIZAS).select("*").eq("id", int(poliza_id)).limit(1).execute().data or []
    )
    return refreshed[0] if refreshed else {**cur, **upd}


def replace_archivo_poliza(
    sb,
    poliza_id: int,
    subcontratista_id: int,
    contrato_id: int,
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
    user_id: Optional[int],
) -> dict:
    rows = (
        sb.table(_TABLE_POLIZAS)
        .select("*")
        .eq("id", int(poliza_id))
        .eq("subcontratista_id", int(subcontratista_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Póliza no encontrada.")
    cur = rows[0]
    if (cur.get("estado") or "") == "reemplazada":
        raise ValueError("No se puede reemplazar el archivo de una póliza histórica.")

    mime = validate_upload(content_type, len(data))
    file_name = (nombre_archivo or "poliza").strip()[:255] or "poliza"
    blob_path = path_subcontratista_poliza(contrato_id, subcontratista_id, file_name)
    upload_blob_private(blob_path, data, mime, overwrite=True)
    old_path = cur.get("azure_blob_path")
    sb.table(_TABLE_POLIZAS).update({
        "azure_blob_path": blob_path,
        "nombre_archivo": file_name,
        "mime_type": mime,
        "tamano_bytes": len(data),
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(poliza_id)).execute()
    if old_path and old_path != blob_path:
        try:
            delete_blob_private(old_path)
        except Exception:
            _log.warning("No se pudo borrar blob anterior de póliza %s", old_path)
    refreshed = (
        sb.table(_TABLE_POLIZAS).select("*").eq("id", int(poliza_id)).limit(1).execute().data or []
    )
    return refreshed[0] if refreshed else cur


def download_poliza(sb, poliza_id: int, subcontratista_id: int) -> Tuple[bytes, str, str]:
    rows = (
        sb.table(_TABLE_POLIZAS)
        .select("*")
        .eq("id", int(poliza_id))
        .eq("subcontratista_id", int(subcontratista_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or not rows[0].get("azure_blob_path"):
        raise ValueError("Archivo de póliza no encontrado.")
    row = rows[0]
    data = download_blob_bytes_private(row["azure_blob_path"])
    return data, row.get("mime_type") or "application/octet-stream", row.get("nombre_archivo") or "poliza"


def marcar_polizas_vencidas(sb, contrato_id: Optional[int] = None) -> int:
    """Pasa a estado=vencida las pólizas vigentes cuya fecha ya pasó."""
    hoy = date.today().isoformat()
    q = (
        sb.table(_TABLE_POLIZAS)
        .select("id")
        .eq("estado", "vigente")
        .lt("fecha_vencimiento", hoy)
    )
    if contrato_id is not None:
        q = q.eq("contrato_id", int(contrato_id))
    rows = q.execute().data or []
    n = 0
    for r in rows:
        sb.table(_TABLE_POLIZAS).update({
            "estado": "vencida",
            "updated_at": _now_iso(),
        }).eq("id", r["id"]).eq("estado", "vigente").execute()
        n += 1
    return n


def resumen_alerta_polizas_sub(sb, subcontratista_id: int, cfg: Optional[dict] = None) -> dict:
    """Indicador visual por subcontratista: peor estado entre pólizas vigentes."""
    hoy = date.today()
    rows = list_polizas(sb, subcontratista_id, incluir_historico=False)
    if not rows:
        return {"nivel": None, "label": None, "dias_min": None, "count": 0}
    dias_1 = int((cfg or {}).get("dias_alerta_1") or DEFAULT_DIAS_ALERTA[0])
    peor = None  # (prioridad, dias)
    for r in rows:
        fv = _parse_date(r.get("fecha_vencimiento"))
        if not fv:
            continue
        dias = (fv - hoy).days
        if dias < 0:
            pri = 0
        elif dias <= dias_1:
            pri = 1
        else:
            continue
        if peor is None or pri < peor[0] or (pri == peor[0] and dias < peor[1]):
            peor = (pri, dias)
    if peor is None:
        return {"nivel": "ok", "label": "Pólizas al día", "dias_min": None, "count": len(rows)}
    if peor[0] == 0:
        return {"nivel": "vencida", "label": "Póliza vencida", "dias_min": peor[1], "count": len(rows)}
    return {"nivel": "por_vencer", "label": f"Póliza vence en {peor[1]}d", "dias_min": peor[1], "count": len(rows)}


def alertas_polizas_contrato(sb, contrato_id: int) -> dict:
    cfg = get_alerta_config(sb, contrato_id)
    marcar_polizas_vencidas(sb, contrato_id)
    hoy = date.today()
    d1 = int(cfg["dias_alerta_1"])
    d2 = int(cfg["dias_alerta_2"])
    limite = hoy + timedelta(days=d1)

    rows = (
        sb.table(_TABLE_POLIZAS)
        .select("*, subcontratistas(razon_social)")
        .eq("contrato_id", int(contrato_id))
        .in_("estado", ["vigente", "vencida"])
        .lte("fecha_vencimiento", limite.isoformat())
        .order("fecha_vencimiento")
        .execute()
        .data
        or []
    )

    vencidas: List[dict] = []
    por_vencer: List[dict] = []
    for r in rows:
        fv = _parse_date(r.get("fecha_vencimiento"))
        if not fv:
            continue
        dias = (fv - hoy).days
        sub = r.get("subcontratistas") or {}
        item = {
            "id": r["id"],
            "subcontratista_id": r["subcontratista_id"],
            "razon_social": sub.get("razon_social") or "",
            "tipo": r.get("tipo"),
            "tipo_label": _poliza_tipo_label(r),
            "fecha_vencimiento": fv.isoformat(),
            "dias_para_vencer": dias,
            "valor_asegurado": r.get("valor_asegurado"),
            "estado": r.get("estado"),
            "umbral": "vencida" if dias < 0 else ("alerta_2" if dias <= d2 else "alerta_1"),
        }
        if dias < 0:
            vencidas.append(item)
        else:
            por_vencer.append(item)

    return {
        "contrato_id": int(contrato_id),
        "dias_alerta_1": d1,
        "dias_alerta_2": d2,
        "fecha_consulta": hoy.isoformat(),
        "total_vencidas": len(vencidas),
        "total_por_vencer": len(por_vencer),
        "total_alertas": len(vencidas) + len(por_vencer),
        "vencidas": vencidas,
        "por_vencer": por_vencer,
    }


def emitir_notificaciones_polizas(
    sb,
    contrato_id: int,
    destinatario_ids: List[int],
    *,
    remitente_id: Optional[int] = None,
    remitente_nombre: str = "Sistema",
) -> int:
    """
    Inserta notificaciones SISTEMA para pólizas en umbrales 30/15/vencida.
    Deduplica con flags alerta_*_enviada_at en la fila de póliza.
    """
    if not destinatario_ids:
        return 0
    cfg = get_alerta_config(sb, contrato_id)
    alertas = alertas_polizas_contrato(sb, contrato_id)
    d1 = int(cfg["dias_alerta_1"])
    d2 = int(cfg["dias_alerta_2"])
    enviadas = 0

    def _flag_for(item: dict) -> Optional[str]:
        dias = int(item.get("dias_para_vencer") or 0)
        if dias < 0:
            return "alerta_vencida_enviada_at"
        if dias <= d2:
            return "alerta_15_enviada_at"
        if dias <= d1:
            return "alerta_30_enviada_at"
        return None

    items = list(alertas.get("vencidas") or []) + list(alertas.get("por_vencer") or [])
    for item in items:
        flag = _flag_for(item)
        if not flag:
            continue
        pol = (
            sb.table(_TABLE_POLIZAS)
            .select(f"id, {flag}")
            .eq("id", int(item["id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not pol or pol[0].get(flag):
            continue

        dias = int(item.get("dias_para_vencer") or 0)
        if dias < 0:
            asunto = f"Póliza vencida — {item.get('razon_social') or 'Subcontratista'}"
            mensaje = (
                f"La póliza «{item.get('tipo_label')}» del subcontratista "
                f"{item.get('razon_social')} venció el {item.get('fecha_vencimiento')} "
                f"(hace {abs(dias)} día(s))."
            )
        else:
            asunto = f"Póliza por vencer ({dias}d) — {item.get('razon_social') or 'Subcontratista'}"
            mensaje = (
                f"La póliza «{item.get('tipo_label')}» del subcontratista "
                f"{item.get('razon_social')} vence el {item.get('fecha_vencimiento')} "
                f"(en {dias} día(s))."
            )

        rows = []
        for did in destinatario_ids:
            rows.append({
                "remitente_id": remitente_id,
                "remitente_nombre": remitente_nombre or "Sistema",
                "destinatario_id": int(did),
                "asunto": asunto,
                "mensaje": mensaje,
                "tipo": "SISTEMA",
                "modulo": "SUBCONTRATISTAS",
                "contrato_id": int(contrato_id),
                "entidad_tipo": "subcontratista_poliza",
                "entidad_id": str(item["id"]),
                "leido": False,
            })
        if rows:
            try:
                sb.table("notificaciones").insert(rows).execute()
                sb.table(_TABLE_POLIZAS).update({flag: _now_iso()}).eq("id", int(item["id"])).execute()
                enviadas += len(rows)
            except Exception:
                _log.exception("No se pudieron emitir notificaciones de póliza %s", item.get("id"))

    return enviadas


# ── Documentos ───────────────────────────────────────────────────────────────

def list_documentos(
    sb,
    subcontratista_id: int,
    *,
    tipo: Optional[str] = None,
) -> List[dict]:
    rows = _docs_visibles(sb, subcontratista_id, tipo)
    # Orden jerárquico: contrato, seguridad social, propuesta
    order = {"contrato_firmado": 0, "seguridad_social": 1, "propuesta_economica": 2}
    rows.sort(key=lambda r: (
        order.get(r.get("tipo") or "", 9),
        str(r.get("periodo") or ""),
        str(r.get("created_at") or ""),
    ), reverse=False)
    # Dentro de cada tipo versionado, más reciente primero
    versionados = [r for r in rows if r.get("tipo") in DOC_TIPOS_VERSIONADOS]
    versionados.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    ss = [r for r in rows if r.get("tipo") == "seguridad_social"]
    ss.sort(key=lambda r: str(r.get("periodo") or ""), reverse=True)
    # Reconstruir: contrato (hist), ss (hist), propuesta (hist)
    out: List[dict] = []
    for t in ("contrato_firmado", "seguridad_social", "propuesta_economica"):
        if t == "seguridad_social":
            chunk = ss
        else:
            chunk = [r for r in versionados if r.get("tipo") == t]
        for r in chunk:
            item = dict(r)
            item["tipo_label"] = DOC_TIPO_LABEL.get(r.get("tipo") or "", r.get("tipo"))
            out.append(item)
    if tipo:
        out = [r for r in out if r.get("tipo") == tipo]
    return out


def create_documento(
    sb,
    *,
    subcontratista_id: int,
    contrato_id: int,
    tipo: str,
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
    user_id: Optional[int],
    version_label: Optional[str] = None,
    periodo: Optional[str] = None,
    corte_id: Optional[int] = None,
    notas: Optional[str] = None,
    marcar_vigente: bool = True,
) -> dict:
    t = (tipo or "").strip().lower()
    if t not in DOC_TIPOS:
        raise ValueError("Tipo de documento inválido.")

    mime = validate_upload(content_type, len(data))
    file_name = (nombre_archivo or "documento").strip()[:255] or "documento"
    blob_path = path_subcontratista_documento(contrato_id, subcontratista_id, t, file_name)
    upload_blob_private(blob_path, data, mime, overwrite=True)

    per = None
    label = (version_label or "").strip() or None
    if t == "seguridad_social":
        per = (periodo or "").strip()
        if not re.match(r"^\d{4}-\d{2}$", per):
            raise ValueError("El período de seguridad social debe ser YYYY-MM.")
        vigente = True
    else:
        vigente = bool(marcar_vigente)
        if not label:
            label = "Original"
        if vigente:
            prev = _docs_visibles(sb, subcontratista_id, t)
            for p in prev:
                if p.get("vigente"):
                    sb.table(_TABLE_DOCS).update({"vigente": False}).eq("id", p["id"]).execute()

    row = {
        "subcontratista_id": int(subcontratista_id),
        "contrato_id": int(contrato_id),
        "tipo": t,
        "version_label": label if t in DOC_TIPOS_VERSIONADOS else label,
        "periodo": per,
        "corte_id": int(corte_id) if corte_id is not None else None,
        "vigente": vigente,
        "azure_blob_path": blob_path,
        "nombre_archivo": file_name,
        "mime_type": mime,
        "tamano_bytes": len(data),
        "hash_sha256": _sha256_hex(data),
        "notas": (notas or "").strip() or None,
        "created_by": user_id,
    }

    ins = sb.table(_TABLE_DOCS).insert(row).execute()
    return (ins.data or [row])[0]


def soft_delete_documento(sb, doc_id: int, subcontratista_id: int, user_id: Optional[int]) -> dict:
    rows = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("id", int(doc_id))
        .eq("subcontratista_id", int(subcontratista_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Documento no encontrado.")
    sb.table(_TABLE_DOCS).update({
        "eliminado_en": _now_iso(),
        "eliminado_por": user_id,
        "vigente": False,
    }).eq("id", int(doc_id)).execute()
    return {"ok": True, "id": int(doc_id)}


def download_documento(sb, doc_id: int, subcontratista_id: int) -> Tuple[bytes, str, str]:
    rows = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("id", int(doc_id))
        .eq("subcontratista_id", int(subcontratista_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Documento no encontrado.")
    row = rows[0]
    data = download_blob_bytes_private(row["azure_blob_path"])
    return data, row.get("mime_type") or "application/octet-stream", row.get("nombre_archivo") or "documento"


def set_documento_vigente(sb, doc_id: int, subcontratista_id: int, user_id: Optional[int]) -> dict:
    rows = (
        sb.table(_TABLE_DOCS)
        .select("*")
        .eq("id", int(doc_id))
        .eq("subcontratista_id", int(subcontratista_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Documento no encontrado.")
    doc = rows[0]
    t = doc.get("tipo")
    if t not in DOC_TIPOS_VERSIONADOS:
        raise ValueError("Solo contrato firmado y propuesta económica marcan versión vigente.")
    prev = _docs_visibles(sb, subcontratista_id, t)
    for p in prev:
        sb.table(_TABLE_DOCS).update({"vigente": int(p["id"]) == int(doc_id)}).eq("id", p["id"]).execute()
    return {"ok": True, "id": int(doc_id)}
