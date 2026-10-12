"""
Tarea madre con partes + migración desde checklist + aplicación de calificación.

Cada parte es un seguimiento_item completo (origen=tarea, padre_id=madre).
La madre no tiene checklist: agrupa partes y deriva estado/avance.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from seguimiento_calificacion import (
    calcular_nota,
    es_calificable,
    es_tarea_personal,
    promedio,
)

_log = logging.getLogger("claracore.seguimiento.tarea_partes")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(raw) -> Optional[date]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw)[:10]
    try:
        y, m, d = s.split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _norm_hora(raw) -> Optional[str]:
    if not raw:
        return None
    t = str(raw).strip()[:5]
    return t if len(t) >= 4 else None


def schema_tiene_padre(sb) -> bool:
    try:
        sb.table("seguimiento_item").select("id,padre_id").limit(1).execute()
        return True
    except Exception as exc:
        msg = str(exc).lower()
        if "padre_id" in msg or "pgrst204" in msg:
            return False
        return True


def listar_partes(sb, padre_id: int) -> List[dict]:
    if not schema_tiene_padre(sb):
        return []
    try:
        rows = (
            sb.table("seguimiento_item")
            .select("*")
            .eq("padre_id", int(padre_id))
            .order("created_at")
            .execute()
            .data
            or []
        )
        return list(rows)
    except Exception as exc:
        _log.warning("listar_partes %s: %s", padre_id, exc)
        return []


def _avance_desde_partes(partes: List[dict]) -> Tuple[Optional[int], str]:
    """Misma lógica de agregación que el checklist histórico."""
    if not partes:
        return None, "abierto"
    estados = [(p.get("estado_gestion") or "abierto").strip().lower() for p in partes]
    validos = [e for e in estados if e != "cancelado"]
    if not estados:
        return None, "abierto"
    if not validos:
        return None, "cancelado"
    cumplidos = sum(1 for e in validos if e == "cumplido")
    pct = int(round(100.0 * cumplidos / len(validos)))
    if pct >= 100:
        return pct, "cumplido"
    if cumplidos > 0 or any(e == "parcial" for e in validos):
        return pct, "parcial"
    if any(e in ("en_progreso", "reprogramado", "vencido") for e in validos):
        return pct, "en_progreso"
    return pct, "abierto"


def resumen_avance_partes(partes: List[dict]) -> dict:
    counts = {
        "cumplidas": 0,
        "en_curso": 0,
        "pendientes": 0,
        "vencidas": 0,
        "canceladas": 0,
        "total": len(partes or []),
    }
    for p in partes or []:
        e = (p.get("estado_gestion") or "abierto").strip().lower()
        if e == "cumplido":
            counts["cumplidas"] += 1
        elif e == "vencido":
            counts["vencidas"] += 1
        elif e == "cancelado":
            counts["canceladas"] += 1
        elif e in ("en_progreso", "parcial", "reprogramado"):
            counts["en_curso"] += 1
        else:
            counts["pendientes"] += 1
    pct, estado = _avance_desde_partes(partes)
    counts["avance_pct"] = pct
    counts["estado_madre"] = estado
    return counts


def sincronizar_madre_desde_partes(sb, padre_id: int) -> Optional[dict]:
    """Actualiza estado/fecha/avance de la madre según sus partes."""
    from seguimiento_service import get_item  # evita ciclo al importar módulo

    partes = listar_partes(sb, padre_id)
    pct, estado = _avance_desde_partes(partes)
    fechas = [_parse_date(p.get("fecha_vencimiento")) for p in partes]
    fechas = [f for f in fechas if f]
    fv = min(fechas).isoformat() if fechas else None
    # Hora del más próximo
    hora = None
    if fv:
        best = None
        for p in partes:
            f = _parse_date(p.get("fecha_vencimiento"))
            if not f or f.isoformat() != fv:
                continue
            h = _norm_hora(p.get("hora_vencimiento")) or "23:59"
            if best is None or h < best:
                best = h
                hora = _norm_hora(p.get("hora_vencimiento"))
    libres_patch = {}
    try:
        madre = get_item(sb, int(padre_id))
    except Exception:
        madre = None
    if madre:
        libres = dict(madre.get("campos_libres") or {}) if isinstance(madre.get("campos_libres"), dict) else {}
        libres["avance_pct"] = pct
        libres["es_madre_partes"] = True
        # Quitar checklist legado
        if "checklist" in libres:
            libres.pop("checklist", None)
        libres_patch = libres
    patch = {
        "estado_gestion": estado,
        "fecha_vencimiento": fv,
        "hora_vencimiento": hora,
        "updated_at": _now_iso(),
    }
    if libres_patch:
        patch["campos_libres"] = libres_patch
    try:
        sb.table("seguimiento_item").update(patch).eq("id", int(padre_id)).execute()
    except Exception as exc:
        _log.warning("sync madre %s: %s", padre_id, exc)
        return None
    try:
        return get_item(sb, int(padre_id))
    except Exception:
        return None


def enriquecer_item_con_partes(sb, item: dict) -> dict:
    if not item or (item.get("origen") or "") != "tarea":
        return item
    if item.get("padre_id"):
        item["es_parte"] = True
        return item
    partes = listar_partes(sb, int(item["id"]))
    if not partes:
        # Checklist legado aún no migrado
        libres = item.get("campos_libres") if isinstance(item.get("campos_libres"), dict) else {}
        ck = libres.get("checklist") if isinstance((libres or {}).get("checklist"), list) else []
        item["es_madre_partes"] = False
        item["partes"] = []
        item["tiene_checklist_legado"] = bool(ck)
        return item
    item["es_madre_partes"] = True
    item["partes"] = partes
    item["avance_partes"] = resumen_avance_partes(partes)
    notas = [p.get("calificacion_nota") for p in partes if p.get("calificacion_nota") is not None]
    item["calificacion_promedio_partes"] = promedio(notas)
    return item


def _contenido_desde_checklist_item(it: dict) -> dict:
    return {
        "notas": it.get("notas") or "",
        "enlace": it.get("enlace") or "",
        "imagen": it.get("imagen"),
        "esquema": it.get("esquema"),
        "tabla": it.get("tabla"),
        "comentarios": it.get("comentarios") or [],
        "checklist_id_origen": it.get("id"),
    }


def migrar_checklist_a_partes(sb, item_id: int, *, force: bool = False) -> dict:
    """
    Convierte subtareas del checklist en partes (filas hijas) sin perder contenido.
    Idempotente: si ya tiene partes y no force, solo limpia checklist residual.
    """
    from seguimiento_service import get_item, _nombre_usuario, _usuario_row, _registrar_evento

    if not schema_tiene_padre(sb):
        raise HTTPException(
            status_code=503,
            detail="Falta columna padre_id. Ejecute la migración de partes/calificación.",
        )
    item = get_item(sb, int(item_id))
    if (item.get("origen") or "") != "tarea":
        raise ValueError("Solo aplica a tareas")
    if item.get("padre_id"):
        raise ValueError("Una parte no puede migrar checklist")

    existentes = listar_partes(sb, int(item_id))
    libres = dict(item.get("campos_libres") or {}) if isinstance(item.get("campos_libres"), dict) else {}
    checklist = libres.get("checklist") if isinstance(libres.get("checklist"), list) else []

    if existentes and not force:
        if checklist:
            libres.pop("checklist", None)
            libres["es_madre_partes"] = True
            libres["migrado_checklist_at"] = libres.get("migrado_checklist_at") or _now_iso()
            sb.table("seguimiento_item").update({
                "campos_libres": libres,
                "updated_at": _now_iso(),
            }).eq("id", int(item_id)).execute()
        return enriquecer_item_con_partes(sb, get_item(sb, int(item_id)))

    if not checklist:
        return enriquecer_item_con_partes(sb, item)

    # Responsable de cada parte = responsable de la tarea original
    asignado_id = item.get("asignado_a_id")
    asignado_nombre = item.get("asignado_a_nombre")
    creador = int(item.get("created_by") or 0)
    relacion = item.get("relacion_destinatario")
    referido_id = item.get("referido_a_id")
    referido_nombre = item.get("referido_a_nombre")

    created = []
    for it in checklist:
        if not isinstance(it, dict):
            continue
        texto = (it.get("texto") or "").strip() or "Parte"
        estado = (it.get("estado_gestion") or ("cumplido" if it.get("hecho") else "abierto")).strip().lower()
        if estado not in (
            "abierto", "en_progreso", "parcial", "reprogramado", "cumplido", "vencido", "cancelado",
        ):
            estado = "abierto"
        fv = _parse_date(it.get("fecha") or it.get("fecha_vencimiento"))
        hora = _norm_hora(it.get("hora") or it.get("hora_vencimiento"))
        contenido = _contenido_desde_checklist_item(it)
        # Notificar a del checklist → campos de referencia informativa en la parte
        notif_id = it.get("notificar_a_id")
        notif_nombre = it.get("notificar_a_nombre") or ""
        notif_rel = (it.get("relacion_notificacion") or "").strip().lower() or None
        if isinstance(it.get("notificar_a"), dict):
            notif_id = notif_id or it["notificar_a"].get("id")
            notif_nombre = notif_nombre or it["notificar_a"].get("nombre") or ""
            notif_rel = notif_rel or (it["notificar_a"].get("relacion") or "").strip().lower() or None
        if notif_id:
            contenido["notificar_a_id"] = int(notif_id)
            contenido["notificar_a_nombre"] = notif_nombre
            contenido["relacion_notificacion"] = notif_rel or "referencia"

        row = {
            "origen": "tarea",
            "titulo": texto[:500],
            "descripcion": texto,
            "estado_gestion": estado,
            "asignado_a_id": asignado_id,
            "asignado_a_nombre": asignado_nombre,
            "created_by": creador,
            "contrato_id": item.get("contrato_id"),
            "fecha_vencimiento": fv.isoformat() if fv else None,
            "hora_vencimiento": hora,
            "fecha_vencimiento_inicial": fv.isoformat() if fv else None,
            "padre_id": int(item_id),
            "relacion_destinatario": relacion,
            "referido_a_id": referido_id,
            "referido_a_nombre": referido_nombre,
            "campos_libres": contenido,
            "imagenes": [],
            "updated_at": _now_iso(),
        }
        # Si el notificado era asignación a nivel subtarea y no había asignado distinto,
        # mantener el de la madre (requisito: responsable = el de la tarea original).
        try:
            ins = sb.table("seguimiento_item").insert(row).execute().data or []
        except Exception as exc:
            # Schema sin fecha_vencimiento_inicial aún
            if "fecha_vencimiento_inicial" in str(exc).lower():
                row.pop("fecha_vencimiento_inicial", None)
                ins = sb.table("seguimiento_item").insert(row).execute().data or []
            else:
                raise
        if ins:
            created.append(ins[0])
            try:
                _registrar_evento(sb, int(ins[0]["id"]), "parte_creada_migracion", creador, {
                    "padre_id": int(item_id),
                    "checklist_id": it.get("id"),
                })
            except Exception:
                pass

    libres.pop("checklist", None)
    libres["es_madre_partes"] = True
    libres["migrado_checklist_at"] = _now_iso()
    libres["partes_migradas"] = len(created)
    sb.table("seguimiento_item").update({
        "campos_libres": libres,
        "updated_at": _now_iso(),
    }).eq("id", int(item_id)).execute()
    sincronizar_madre_desde_partes(sb, int(item_id))
    return enriquecer_item_con_partes(sb, get_item(sb, int(item_id)))


def crear_parte(
    sb,
    padre_id: int,
    data: dict,
    user_id: int,
    current_user: Optional[dict] = None,
) -> dict:
    from seguimiento_service import (
        get_item,
        _nombre_usuario,
        _usuario_row,
        _registrar_evento,
        es_desarrollador_seguimiento,
        _try_email_asignacion_inmediata,
        _notificar,
    )

    if not schema_tiene_padre(sb):
        raise HTTPException(status_code=503, detail="Falta columna padre_id.")
    madre = get_item(sb, int(padre_id))
    if (madre.get("origen") or "") != "tarea":
        raise ValueError("Solo se agregan partes a tareas")
    if madre.get("padre_id"):
        raise ValueError("Las partes no pueden tener partes (un solo nivel)")
    es_dev = es_desarrollador_seguimiento(current_user)
    if (
        not es_dev
        and int(madre.get("created_by") or 0) != int(user_id)
        and int(madre.get("asignado_a_id") or 0) != int(user_id)
    ):
        raise ValueError("No puede agregar partes a esta tarea")

    titulo = (data.get("titulo") or data.get("texto") or "").strip()
    if not titulo:
        raise ValueError("Indique el título de la parte")
    asignado_id = data.get("asignado_a_id")
    if asignado_id is None:
        asignado_id = madre.get("asignado_a_id") or user_id
    asignado_id = int(asignado_id)
    dest = _usuario_row(sb, asignado_id)
    if not dest:
        raise ValueError("Responsable no encontrado")
    asignado_nombre = data.get("asignado_a_nombre") or _nombre_usuario(dest)
    fv = _parse_date(data.get("fecha_vencimiento") or data.get("fecha"))
    hora = _norm_hora(data.get("hora_vencimiento") or data.get("hora"))
    relacion = "asignacion" if int(madre.get("created_by") or 0) != asignado_id else None
    contenido = {
        "notas": data.get("notas") or "",
        "enlace": data.get("enlace") or "",
        "imagen": data.get("imagen"),
        "esquema": data.get("esquema"),
        "tabla": data.get("tabla"),
        "comentarios": data.get("comentarios") or [],
    }
    if data.get("notificar_a_id"):
        contenido["notificar_a_id"] = int(data["notificar_a_id"])
        contenido["notificar_a_nombre"] = data.get("notificar_a_nombre") or ""
        contenido["relacion_notificacion"] = data.get("relacion_notificacion") or "referencia"

    row = {
        "origen": "tarea",
        "titulo": titulo[:500],
        "descripcion": (data.get("descripcion") or titulo).strip(),
        "estado_gestion": (data.get("estado_gestion") or "abierto").strip().lower(),
        "asignado_a_id": asignado_id,
        "asignado_a_nombre": asignado_nombre,
        "created_by": int(madre.get("created_by") or user_id),
        "contrato_id": madre.get("contrato_id"),
        "fecha_vencimiento": fv.isoformat() if fv else None,
        "hora_vencimiento": hora,
        "fecha_vencimiento_inicial": fv.isoformat() if fv else None,
        "padre_id": int(padre_id),
        "relacion_destinatario": relacion,
        "campos_libres": contenido,
        "imagenes": data.get("imagenes") or [],
        "updated_at": _now_iso(),
    }
    try:
        ins = sb.table("seguimiento_item").insert(row).execute().data or []
    except Exception as exc:
        if "fecha_vencimiento_inicial" in str(exc).lower():
            row.pop("fecha_vencimiento_inicial", None)
            ins = sb.table("seguimiento_item").insert(row).execute().data or []
        else:
            raise
    if not ins:
        raise ValueError("No se pudo crear la parte")
    parte = ins[0]
    _registrar_evento(sb, int(parte["id"]), "parte_creada", user_id, {"padre_id": int(padre_id)})

    # Correo/aviso solo a la parte (no a la madre)
    if relacion == "asignacion" and asignado_id != int(user_id):
        _notificar(
            sb,
            destinatario_id=asignado_id,
            remitente_id=user_id,
            asunto=f"Tarea (parte): {titulo[:80]}",
            mensaje=f"Se le asignó la parte «{titulo}» de «{madre.get('titulo')}».",
            contrato_id=madre.get("contrato_id"),
            entidad_tipo="seguimiento_tarea",
            entidad_id=str(parte["id"]),
        )
        _try_email_asignacion_inmediata(
            sb,
            destinatario_id=asignado_id,
            remitente_id=user_id,
            tipo="tarea",
            titulo=titulo,
            item_id=parte["id"],
            fecha_vencimiento=fv.isoformat() if fv else None,
            hora_vencimiento=hora,
            detalle=row.get("descripcion"),
            es_personal=False,
        )

    # Marcar madre
    libres = dict(madre.get("campos_libres") or {}) if isinstance(madre.get("campos_libres"), dict) else {}
    libres.pop("checklist", None)
    libres["es_madre_partes"] = True
    sb.table("seguimiento_item").update({
        "campos_libres": libres,
        "updated_at": _now_iso(),
    }).eq("id", int(padre_id)).execute()
    sincronizar_madre_desde_partes(sb, int(padre_id))
    return get_item(sb, int(parte["id"]))


def aplicar_calificacion_si_corresponde(sb, item_id: int, *, force: bool = False) -> Optional[dict]:
    """Calcula y persiste la nota si el ítem cerró/venció y aún no está calificado."""
    from seguimiento_service import get_item

    try:
        item = get_item(sb, int(item_id))
    except Exception:
        return None
    # No calificar madres (promedio de partes se calcula al vuelo)
    if (item.get("origen") or "") == "tarea" and not item.get("padre_id"):
        partes = listar_partes(sb, int(item_id))
        if partes:
            return None
    if item.get("calificacion_en") and not force:
        return {
            "nota": item.get("calificacion_nota"),
            "resultado_pct": item.get("calificacion_resultado_pct"),
            "tope_fecha_pct": item.get("calificacion_tope_fecha_pct"),
            "ya_calificada": True,
        }
    if not es_calificable(item):
        return None
    excepcion_ok = _tiene_excepcion_aprobada(sb, int(item_id))
    calc = calcular_nota(item, excepcion_aprobada=excepcion_ok)
    if not calc:
        return None
    patch = {
        "calificacion_nota": calc["nota"],
        "calificacion_resultado_pct": calc["resultado_pct"],
        "calificacion_tope_fecha_pct": calc["tope_fecha_pct"],
        "calificacion_en": _now_iso(),
        "calificacion_detalle": {
            "tope_codigo": calc["tope_codigo"],
            "excepcion_tercero": calc["excepcion_tercero"],
            "estado": calc["estado"],
        },
        "updated_at": _now_iso(),
    }
    try:
        sb.table("seguimiento_item").update(patch).eq("id", int(item_id)).execute()
    except Exception as exc:
        _log.warning("persistir calificación %s: %s", item_id, exc)
        return calc
    return calc


def _tiene_excepcion_aprobada(sb, item_id: int) -> bool:
    try:
        rows = (
            sb.table("seguimiento_calificacion_excepcion")
            .select("id,estado")
            .eq("item_id", int(item_id))
            .eq("estado", "aprobada")
            .limit(1)
            .execute()
            .data
            or []
        )
        return bool(rows)
    except Exception:
        return False


def marcar_reprogramacion(sb, item: dict, nueva_fecha: date) -> dict:
    """Actualiza flags de reprogramación para el tope de fecha."""
    hoy = date.today()
    fv_actual = _parse_date(item.get("fecha_vencimiento"))
    patch = {
        "se_reprogramo": True,
        "fecha_vencimiento": nueva_fecha.isoformat(),
        "updated_at": _now_iso(),
    }
    # Tras vencer: ya pasó la fecha actual o tiene vencido_at
    tras = bool(item.get("vencido_at")) or (fv_actual is not None and fv_actual < hoy)
    if tras:
        patch["se_reprogramo_tras_vencer"] = True
    if not item.get("fecha_vencimiento_inicial") and fv_actual:
        patch["fecha_vencimiento_inicial"] = fv_actual.isoformat()
    try:
        sb.table("seguimiento_item").update(patch).eq("id", int(item["id"])).execute()
    except Exception as exc:
        # Columnas nuevas pueden faltar
        for k in ("se_reprogramo", "se_reprogramo_tras_vencer", "fecha_vencimiento_inicial"):
            if k in str(exc).lower():
                patch.pop(k, None)
        try:
            sb.table("seguimiento_item").update(patch).eq("id", int(item["id"])).execute()
        except Exception as exc2:
            _log.warning("marcar_reprogramacion: %s", exc2)
    return patch


def asegurar_fecha_inicial(sb, item: dict) -> None:
    if item.get("fecha_vencimiento_inicial"):
        return
    fv = _parse_date(item.get("fecha_vencimiento"))
    if not fv:
        return
    try:
        sb.table("seguimiento_item").update({
            "fecha_vencimiento_inicial": fv.isoformat(),
        }).eq("id", int(item["id"])).execute()
    except Exception:
        pass


def listar_cumplimiento_persona(
    sb,
    contrato_id: int,
    *,
    usuario_id: Optional[int] = None,
) -> List[dict]:
    """Promedio de notas por responsable (ítems ya calificados del contrato)."""
    q = (
        sb.table("seguimiento_item")
        .select(
            "id,origen,titulo,asignado_a_id,asignado_a_nombre,estado_gestion,"
            "calificacion_nota,calificacion_en,padre_id,contrato_id,created_by,"
            "relacion_destinatario,solicitante_id"
        )
        .eq("contrato_id", int(contrato_id))
        .not_.is_("calificacion_nota", "null")
        .limit(2000)
    )
    if usuario_id is not None:
        q = q.eq("asignado_a_id", int(usuario_id))
    try:
        rows = q.execute().data or []
    except Exception as exc:
        _log.warning("cumplimiento persona: %s", exc)
        return []

    by_user: Dict[int, dict] = {}
    for r in rows:
        # Excluir madres (sin nota propia normalmente) y personales residuales
        if r.get("padre_id") is None and (r.get("origen") or "") == "tarea":
            # Madre: saltar; las notas están en partes
            continue
        try:
            uid = int(r.get("asignado_a_id") or 0)
        except (TypeError, ValueError):
            continue
        if not uid:
            continue
        bucket = by_user.setdefault(uid, {
            "usuario_id": uid,
            "nombre": r.get("asignado_a_nombre") or f"Usuario #{uid}",
            "notas": [],
            "items": [],
        })
        nota = r.get("calificacion_nota")
        if nota is not None:
            bucket["notas"].append(float(nota))
            bucket["items"].append({
                "id": r.get("id"),
                "origen": r.get("origen"),
                "titulo": r.get("titulo"),
                "estado_gestion": r.get("estado_gestion"),
                "nota": float(nota),
                "padre_id": r.get("padre_id"),
            })
    out = []
    for uid, b in by_user.items():
        out.append({
            "usuario_id": uid,
            "nombre": b["nombre"],
            "promedio": promedio(b["notas"]),
            "n_calificadas": len(b["notas"]),
            "items": b["items"],
        })
    out.sort(key=lambda x: (x["promedio"] is None, -(x["promedio"] or 0), x["nombre"]))
    return out


def solicitar_excepcion_tercero(
    sb,
    item_id: int,
    user_id: int,
    *,
    motivo: str,
    soporte_nombre: Optional[str] = None,
    soporte_blob_path: Optional[str] = None,
    soporte_mime: Optional[str] = None,
) -> dict:
    from seguimiento_service import get_item, _nombre_usuario, _usuario_row, _notificar

    item = get_item(sb, int(item_id))
    if not es_calificable(item):
        raise ValueError("Solo aplica a tareas/compromisos asignados a otra persona")
    # Solicitante = responsable asignado
    if int(item.get("asignado_a_id") or 0) != int(user_id):
        raise ValueError("Solo el responsable asignado puede solicitar la excepción")
    motivo_c = (motivo or "").strip()
    if len(motivo_c) < 8:
        raise ValueError("Describa la causa del tercero (mín. 8 caracteres)")
    if not soporte_blob_path and not soporte_nombre:
        raise ValueError("Adjunte el soporte documental de la causa de tercero")
    u = _usuario_row(sb, user_id)
    row = {
        "item_id": int(item_id),
        "solicitante_id": int(user_id),
        "solicitante_nombre": _nombre_usuario(u),
        "estado": "pendiente",
        "motivo": motivo_c[:4000],
        "soporte_nombre": soporte_nombre,
        "soporte_blob_path": soporte_blob_path,
        "soporte_mime": soporte_mime,
        "created_at": _now_iso(),
    }
    try:
        ins = sb.table("seguimiento_calificacion_excepcion").insert(row).execute().data or []
    except Exception as exc:
        if "unique" in str(exc).lower() or "duplicate" in str(exc).lower():
            raise ValueError("Ya hay una solicitud pendiente para este ítem") from exc
        raise
    if not ins:
        raise ValueError("No se pudo registrar la solicitud")
    # Aviso a quien asignó (creador / solicitante del compromiso)
    aprobador = int(item.get("created_by") or item.get("solicitante_id") or 0)
    if (item.get("origen") or "") == "compromiso":
        aprobador = int(item.get("solicitante_id") or item.get("created_by") or 0)
    if aprobador and aprobador != int(user_id):
        _notificar(
            sb,
            destinatario_id=aprobador,
            remitente_id=user_id,
            asunto=f"Excepción de calificación: {item.get('titulo')}",
            mensaje=(
                f"{_nombre_usuario(u)} solicita excepción por causa de tercero "
                f"en «{item.get('titulo')}». Revise y apruebe o rechace."
            ),
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_item",
            entidad_id=str(item_id),
        )
    return ins[0]


def decidir_excepcion_tercero(
    sb,
    excepcion_id: int,
    user_id: int,
    current_user: Optional[dict],
    *,
    aprobar: bool,
    decision_nota: str = "",
) -> dict:
    from seguimiento_service import (
        get_item,
        es_desarrollador_seguimiento,
        _notificar,
        _nombre_usuario,
        _usuario_row,
    )

    rows = (
        sb.table("seguimiento_calificacion_excepcion")
        .select("*")
        .eq("id", int(excepcion_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Solicitud no encontrada")
    exc_row = rows[0]
    if (exc_row.get("estado") or "") != "pendiente":
        raise ValueError("La solicitud ya fue resuelta")
    item = get_item(sb, int(exc_row["item_id"]))
    es_dev = es_desarrollador_seguimiento(current_user)
    aprobador_ok = False
    if (item.get("origen") or "") == "compromiso":
        aprobador_ok = int(item.get("solicitante_id") or 0) == int(user_id)
    else:
        aprobador_ok = int(item.get("created_by") or 0) == int(user_id)
    if not es_dev and not aprobador_ok:
        raise ValueError("Solo quien asignó la tarea (o Desarrollador) puede decidir")
    estado = "aprobada" if aprobar else "rechazada"
    patch = {
        "estado": estado,
        "aprobador_id": int(user_id),
        "decision_nota": (decision_nota or "").strip()[:2000],
        "resolved_at": _now_iso(),
    }
    sb.table("seguimiento_calificacion_excepcion").update(patch).eq("id", int(excepcion_id)).execute()
    # Si ya estaba calificada y se aprueba, recalcular con force
    if aprobar and item.get("calificacion_en"):
        aplicar_calificacion_si_corresponde(sb, int(item["id"]), force=True)
    sol = int(exc_row.get("solicitante_id") or 0)
    if sol:
        u = _usuario_row(sb, user_id)
        _notificar(
            sb,
            destinatario_id=sol,
            remitente_id=user_id,
            asunto=f"Excepción {estado}: {item.get('titulo')}",
            mensaje=(
                f"{_nombre_usuario(u)} {estado} su solicitud de excepción "
                f"por causa de tercero en «{item.get('titulo')}»."
            ),
            contrato_id=item.get("contrato_id"),
            entidad_tipo="seguimiento_item",
            entidad_id=str(item["id"]),
        )
    out = {**exc_row, **patch}
    return out


def listar_excepciones_item(sb, item_id: int) -> List[dict]:
    try:
        return (
            sb.table("seguimiento_calificacion_excepcion")
            .select("*")
            .eq("item_id", int(item_id))
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )
    except Exception:
        return []


def es_madre_con_partes(sb, item: dict) -> bool:
    if not item or item.get("padre_id"):
        return False
    if (item.get("origen") or "") != "tarea":
        return False
    return bool(listar_partes(sb, int(item["id"])))


def migrar_checklist_pendientes_contrato(sb, contrato_id: int, *, limit: int = 200) -> dict:
    """Migra en lote tareas del contrato que aún tienen checklist."""
    try:
        rows = (
            sb.table("seguimiento_item")
            .select("id,campos_libres,padre_id,origen")
            .eq("contrato_id", int(contrato_id))
            .eq("origen", "tarea")
            .is_("padre_id", "null")
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc), "migradas": 0}
    migradas = 0
    errores = []
    for r in rows:
        libres = r.get("campos_libres") if isinstance(r.get("campos_libres"), dict) else {}
        ck = libres.get("checklist") if isinstance((libres or {}).get("checklist"), list) else []
        if not ck:
            continue
        try:
            migrar_checklist_a_partes(sb, int(r["id"]))
            migradas += 1
        except Exception as exc:
            errores.append({"id": r["id"], "error": str(exc)[:200]})
    return {"ok": True, "migradas": migradas, "errores": errores}
