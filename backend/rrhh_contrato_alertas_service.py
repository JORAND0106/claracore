"""
Alertas de ciclo de vida del contrato laboral RRHH.

Umbrales:
  - Término fijo: 35 días antes del vencimiento (gestionar cancelación).
  - Término fijo: 10 días antes si no hubo renovación/otrosí tras la alerta de 35.
  - Período de prueba: 5 días antes de cumplirse.

Reutiliza el buzón `notificaciones` (tipo SISTEMA, módulo RRHH) con flags
de deduplicación en `rrhh_trabajadores`.
"""
from __future__ import annotations

import logging
import os
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("claracore.rrhh.contrato_alertas")

_TABLE_TRAB = "rrhh_trabajadores"
_TABLE_CONTRATOS = "rrhh_contratos_generados"

DIAS_ALERTA_VENC_1 = 35
DIAS_ALERTA_VENC_2 = 10
DIAS_ALERTA_PRUEBA = 5

PERIODICIDADES_RENOVACION = frozenset(
    {"mensual", "bimestral", "trimestral", "semestral", "anual"}
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def es_contrato_termino_fijo(tipo_contrato: Optional[str]) -> bool:
    n = _norm(tipo_contrato or "")
    if not n:
        return False
    if "indefinido" in n:
        return False
    return "termino fijo" in n or n in ("fijo", "a termino fijo", "contrato a termino fijo")


def parse_fecha(valor: Any) -> Optional[date]:
    if valor is None:
        return None
    if isinstance(valor, date) and not isinstance(valor, datetime):
        return valor
    s = str(valor).strip()[:10]
    if len(s) < 10:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def fecha_fin_periodo_prueba(
    fecha_ingreso: Any, periodo_prueba_dias: Any
) -> Optional[date]:
    fi = parse_fecha(fecha_ingreso)
    try:
        dias = int(periodo_prueba_dias) if periodo_prueba_dias is not None else None
    except (TypeError, ValueError):
        dias = None
    if not fi or not dias or dias < 1:
        return None
    return fi + timedelta(days=int(dias))


def clasificar_alerta_vencimiento(
    *,
    tipo_contrato: Optional[str],
    fecha_fin: Any,
    hoy: Optional[date] = None,
    alerta_35_enviada_at: Any = None,
    alerta_10_enviada_at: Any = None,
    hubo_renovacion_tras_alerta_35: bool = False,
) -> Optional[str]:
    """
    Retorna 'vencimiento_35' | 'vencimiento_10' | None.
    La alerta de 10 días solo aplica si ya se envió la de 35 y no hubo
    renovación/otrosí posterior.
    """
    if not es_contrato_termino_fijo(tipo_contrato):
        return None
    fin = parse_fecha(fecha_fin)
    if not fin:
        return None
    base = hoy or date.today()
    dias = (fin - base).days
    if dias < 0:
        return None
    if dias <= DIAS_ALERTA_VENC_2:
        if alerta_10_enviada_at:
            return None
        if not alerta_35_enviada_at:
            # Aún no se emitió la de 35: emitir esa primero si estamos en ventana
            if dias <= DIAS_ALERTA_VENC_1 and not alerta_35_enviada_at:
                return "vencimiento_35"
            return None
        if hubo_renovacion_tras_alerta_35:
            return None
        return "vencimiento_10"
    if dias <= DIAS_ALERTA_VENC_1:
        if alerta_35_enviada_at:
            return None
        return "vencimiento_35"
    return None


def clasificar_alerta_periodo_prueba(
    *,
    fecha_ingreso: Any,
    periodo_prueba_dias: Any,
    hoy: Optional[date] = None,
    alerta_enviada_at: Any = None,
) -> bool:
    if alerta_enviada_at:
        return False
    fin = fecha_fin_periodo_prueba(fecha_ingreso, periodo_prueba_dias)
    if not fin:
        return False
    base = hoy or date.today()
    dias = (fin - base).days
    return 0 <= dias <= DIAS_ALERTA_PRUEBA


def _nombre_trab(t: dict) -> str:
    return f"{(t.get('nombres') or '').strip()} {(t.get('apellidos') or '').strip()}".strip() or "Colaborador"


def _hubo_renovacion_tras(sb, trabajador_id: int, desde_iso: str) -> bool:
    rows = (
        sb.table(_TABLE_CONTRATOS)
        .select("id, created_at")
        .eq("trabajador_id", int(trabajador_id))
        .is_("eliminado_en", "null")
        .gt("created_at", desde_iso)
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def _vigente_contrato(sb, trabajador_id: int) -> Optional[dict]:
    rows = (
        sb.table(_TABLE_CONTRATOS)
        .select("id, fecha_fin, fecha_inicio, created_at, numero_contrato_laboral, vigente, origen")
        .eq("trabajador_id", int(trabajador_id))
        .eq("vigente", True)
        .is_("eliminado_en", "null")
        .order("version_num", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def listar_candidatos_alerta(sb, contrato_id: Optional[int] = None) -> List[dict]:
    q = (
        sb.table(_TABLE_TRAB)
        .select(
            "id, contrato_id, nombres, apellidos, tipo_documento, numero_documento, "
            "tipo_contrato, fecha_ingreso, periodo_prueba_dias, estado, "
            "alerta_vencimiento_35_enviada_at, alerta_vencimiento_10_enviada_at, "
            "alerta_periodo_prueba_enviada_at"
        )
        .is_("eliminado_en", "null")
        .eq("estado", "activo")
    )
    if contrato_id is not None:
        q = q.eq("contrato_id", int(contrato_id))
    return q.execute().data or []


def evaluar_alertas_trabajador(
    sb,
    trab: dict,
    *,
    hoy: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """Lista de alertas pendientes para un trabajador (sin emitir)."""
    out: List[Dict[str, Any]] = []
    base = hoy or date.today()
    tid = int(trab["id"])
    tipo = trab.get("tipo_contrato")
    vigente = _vigente_contrato(sb, tid) if es_contrato_termino_fijo(tipo) else None
    fecha_fin = vigente.get("fecha_fin") if vigente else None
    hubo = False
    if trab.get("alerta_vencimiento_35_enviada_at"):
        hubo = _hubo_renovacion_tras(sb, tid, trab["alerta_vencimiento_35_enviada_at"])

    kind = clasificar_alerta_vencimiento(
        tipo_contrato=tipo,
        fecha_fin=fecha_fin,
        hoy=base,
        alerta_35_enviada_at=trab.get("alerta_vencimiento_35_enviada_at"),
        alerta_10_enviada_at=trab.get("alerta_vencimiento_10_enviada_at"),
        hubo_renovacion_tras_alerta_35=hubo,
    )
    if kind:
        fin = parse_fecha(fecha_fin)
        dias = (fin - base).days if fin else None
        out.append({
            "kind": kind,
            "trabajador_id": tid,
            "contrato_id": int(trab["contrato_id"]),
            "nombre": _nombre_trab(trab),
            "documento": f"{trab.get('tipo_documento') or ''} {trab.get('numero_documento') or ''}".strip(),
            "fecha_fin": str(fin) if fin else None,
            "dias_para_vencer": dias,
            "numero_contrato_laboral": (vigente or {}).get("numero_contrato_laboral"),
        })

    if clasificar_alerta_periodo_prueba(
        fecha_ingreso=trab.get("fecha_ingreso"),
        periodo_prueba_dias=trab.get("periodo_prueba_dias"),
        hoy=base,
        alerta_enviada_at=trab.get("alerta_periodo_prueba_enviada_at"),
    ):
        fin_p = fecha_fin_periodo_prueba(trab.get("fecha_ingreso"), trab.get("periodo_prueba_dias"))
        dias_p = (fin_p - base).days if fin_p else None
        out.append({
            "kind": "periodo_prueba",
            "trabajador_id": tid,
            "contrato_id": int(trab["contrato_id"]),
            "nombre": _nombre_trab(trab),
            "documento": f"{trab.get('tipo_documento') or ''} {trab.get('numero_documento') or ''}".strip(),
            "fecha_fin_prueba": str(fin_p) if fin_p else None,
            "dias_para_cumplir": dias_p,
        })
    return out


def _mensaje_alerta(item: dict) -> Tuple[str, str]:
    nombre = item.get("nombre") or "Colaborador"
    kind = item.get("kind")
    if kind == "vencimiento_35":
        asunto = f"Contrato a término fijo por vencer (35d) — {nombre}"
        mensaje = (
            f"El contrato laboral a término fijo de {nombre} "
            f"({item.get('documento') or 's/d'}) vence el {item.get('fecha_fin')} "
            f"(en {item.get('dias_para_vencer')} día(s)). "
            "Debe gestionarse la cancelación si así se requiere."
        )
        return asunto, mensaje
    if kind == "vencimiento_10":
        asunto = f"Renovación/otrosí pendiente (10d) — {nombre}"
        mensaje = (
            f"El contrato laboral a término fijo de {nombre} "
            f"({item.get('documento') or 's/d'}) vence el {item.get('fecha_fin')} "
            f"(en {item.get('dias_para_vencer')} día(s)) y no se ha generado "
            "renovación u otrosí tras la alerta previa. "
            "Debe generarse la renovación/otrosí correspondiente."
        )
        return asunto, mensaje
    # periodo_prueba
    asunto = f"Período de prueba por cumplirse (5d) — {nombre}"
    mensaje = (
        f"El período de prueba de {nombre} "
        f"({item.get('documento') or 's/d'}) culmina el {item.get('fecha_fin_prueba')} "
        f"(en {item.get('dias_para_cumplir')} día(s))."
    )
    return asunto, mensaje


def _flag_for_kind(kind: str) -> str:
    if kind == "vencimiento_35":
        return "alerta_vencimiento_35_enviada_at"
    if kind == "vencimiento_10":
        return "alerta_vencimiento_10_enviada_at"
    return "alerta_periodo_prueba_enviada_at"


def destinatarios_rrhh_contrato(sb, contrato_id: int) -> List[int]:
    """Usuarios activos del contrato con permiso RRHH (editar/validar/crear) o admin/dev."""
    ids: List[int] = []
    try:
        ucs = (
            sb.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
        uids = [int(u["usuario_id"]) for u in ucs if u.get("usuario_id") is not None]
        if not uids:
            return []
        users = (
            sb.table("usuarios")
            .select("id, activo, estado, rol_nombre, cargo_id, cargo_nombre")
            .in_("id", uids)
            .eq("activo", True)
            .execute()
            .data
            or []
        )
        from usuarios_notif_elegibilidad import filtrar_usuarios_para_notificaciones_automaticas

        users = filtrar_usuarios_para_notificaciones_automaticas(users)

        # Resolver función RRHH
        funcs = (
            sb.table("funciones")
            .select("id, nombre, codigo")
            .execute()
            .data
            or []
        )
        rrhh_fids = set()
        for f in funcs:
            nom = _norm(f.get("nombre") or "")
            cod = str(f.get("codigo") or "").strip().upper()
            if nom in {"rrhh", "recursos humanos", "recursos_humanos"} or cod == "RRHH":
                rrhh_fids.add(int(f["id"]))

        for u in users:
            rol = _norm(u.get("rol_nombre") or "")
            cargo = _norm(u.get("cargo_nombre") or "")
            if "desarrollador" in rol or "desarrollador" in cargo or "admin" in rol:
                ids.append(int(u["id"]))
                continue
            cargo_id = u.get("cargo_id")
            if cargo_id is None or not rrhh_fids:
                continue
            try:
                perms = (
                    sb.table("permisos")
                    .select("funcion_id, editar, crear, validar, ver")
                    .eq("cargo_id", int(cargo_id))
                    .eq("contrato_id", int(contrato_id))
                    .execute()
                    .data
                    or []
                )
                if not perms:
                    perms = (
                        sb.table("permisos")
                        .select("funcion_id, editar, crear, validar, ver")
                        .eq("cargo_id", int(cargo_id))
                        .is_("contrato_id", "null")
                        .execute()
                        .data
                        or []
                    )
                for p in perms:
                    if int(p.get("funcion_id") or 0) not in rrhh_fids:
                        continue
                    if p.get("editar") or p.get("crear") or p.get("validar") or p.get("ver"):
                        ids.append(int(u["id"]))
                        break
            except Exception:
                continue
    except Exception:
        _log.exception("destinatarios alertas contrato laboral contrato=%s", contrato_id)
    return sorted(set(ids))


def emitir_notificaciones_contrato_laboral(
    sb,
    *,
    contrato_id: Optional[int] = None,
    destinatario_ids: Optional[List[int]] = None,
    remitente_id: Optional[int] = None,
    remitente_nombre: str = "Sistema",
    hoy: Optional[date] = None,
) -> Dict[str, Any]:
    """
    Evalúa y emite notificaciones SISTEMA deduplicadas.
    Si contrato_id es None, procesa todos los contratos con trabajadores activos.
    """
    candidatos = listar_candidatos_alerta(sb, contrato_id)
    por_contrato: Dict[int, List[dict]] = {}
    for t in candidatos:
        cid = int(t["contrato_id"])
        por_contrato.setdefault(cid, []).append(t)

    enviadas = 0
    alertas: List[dict] = []
    for cid, trabs in por_contrato.items():
        dest = list(destinatario_ids) if destinatario_ids is not None else destinatarios_rrhh_contrato(sb, cid)
        for trab in trabs:
            pending = evaluar_alertas_trabajador(sb, trab, hoy=hoy)
            for item in pending:
                alertas.append(item)
                if not dest:
                    continue
                asunto, mensaje = _mensaje_alerta(item)
                flag = _flag_for_kind(item["kind"])
                # Re-check flag por carrera
                fresh = (
                    sb.table(_TABLE_TRAB)
                    .select(f"id, {flag}")
                    .eq("id", int(item["trabajador_id"]))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if not fresh or fresh[0].get(flag):
                    continue
                rows = []
                for did in dest:
                    rows.append({
                        "remitente_id": remitente_id,
                        "remitente_nombre": remitente_nombre or "Sistema",
                        "destinatario_id": int(did),
                        "asunto": asunto,
                        "mensaje": mensaje,
                        "tipo": "SISTEMA",
                        "modulo": "RRHH",
                        "contrato_id": int(cid),
                        "entidad_tipo": "rrhh_trabajador_contrato",
                        "entidad_id": str(item["trabajador_id"]),
                        "leido": False,
                    })
                try:
                    if rows:
                        sb.table("notificaciones").insert(rows).execute()
                        sb.table(_TABLE_TRAB).update({flag: _now_iso()}).eq(
                            "id", int(item["trabajador_id"])
                        ).execute()
                        enviadas += len(rows)
                except Exception:
                    _log.exception(
                        "No se pudieron emitir alertas contrato laboral trab=%s kind=%s",
                        item.get("trabajador_id"),
                        item.get("kind"),
                    )

    return {
        "alertas": alertas,
        "notificaciones_enviadas": enviadas,
        "total_alertas": len(alertas),
    }


def reset_flags_alerta_vencimiento(sb, trabajador_id: int) -> None:
    """Al generar/cargar renovación u otrosí, reinicia flags de vencimiento."""
    sb.table(_TABLE_TRAB).update({
        "alerta_vencimiento_35_enviada_at": None,
        "alerta_vencimiento_10_enviada_at": None,
    }).eq("id", int(trabajador_id)).execute()


def _cron_secret_ok(x_cron_secret: Optional[str]) -> bool:
    expected = (
        os.getenv("CRON_SECRET")
        or os.getenv("INTERNAL_CRON_SECRET")
        or os.getenv("CLARACORE_CRON_SECRET")
        or ""
    ).strip()
    if not expected:
        return False
    return (x_cron_secret or "").strip() == expected


# Export for routes
cron_secret_ok = _cron_secret_ok
