"""
Servicio RRHH — nómina, novedades, horas extras y liquidación.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from azure_blob_storage import (
    download_blob_bytes_private,
    path_rrhh_desprendible,
    path_rrhh_liquidacion_pdf,
    path_rrhh_nomina_xlsx,
    upload_blob_private,
)
from rrhh_nomina_calc import (
    calcular_item_colaborador,
    calcular_liquidacion,
    periodo_fechas,
)
from rrhh_nomina_email import (
    NominaEmailError,
    nomina_smtp_configured,
    send_desprendible_email,
    send_liquidacion_email,
)
from rrhh_nomina_params import money, params_for_year
from rrhh_nomina_pdf import build_desprendible_pdf, build_liquidacion_pdf
from rrhh_nomina_xlsx import build_nomina_xlsx
from rrhh_service import get_trabajador, list_trabajadores

_log = logging.getLogger("claracore.rrhh.nomina")

_TABLE_NOV = "rrhh_novedades"
_TABLE_HE = "rrhh_horas_extras"
_TABLE_NOM = "rrhh_nominas"
_TABLE_ITEMS = "rrhh_nomina_items"
_TABLE_PROV = "rrhh_provisiones_acumuladas"
_TABLE_LIQ = "rrhh_liquidaciones"

TIPOS_NOVEDAD = frozenset({"ausencia", "incapacidad", "licencia"})
TIPOS_HORA = frozenset({
    "extra_diurna", "extra_nocturna", "recargo_nocturno",
    "dominical_diurna", "dominical_nocturna",
    "extra_dominical_diurna", "extra_dominical_nocturna",
    "bonificacion",
})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uid(current_user) -> Optional[int]:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError, AttributeError):
        return None


def _trim(val: Any, *, max_len: int = 500) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    return s[:max_len]


def _parse_date(val: Any, label: str = "Fecha") -> str:
    s = _trim(val, max_len=10)
    if not s:
        raise ValueError(f"{label} es obligatoria.")
    try:
        datetime.strptime(s[:10], "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"{label} inválida.") from exc
    return s[:10]


def _safe_name(s: str) -> str:
    return re.sub(r"[^\w.\-]", "_", (s or "doc").strip())[:80]


# ── Novedades ────────────────────────────────────────────────────────────────

def list_novedades(
    sb,
    contrato_id: int,
    *,
    trabajador_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> List[dict]:
    q = (
        sb.table(_TABLE_NOV)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("fecha_inicio", desc=True)
    )
    if trabajador_id is not None:
        q = q.eq("trabajador_id", int(trabajador_id))
    rows = q.execute().data or []
    if fecha_desde:
        rows = [r for r in rows if str(r.get("fecha_fin") or "")[:10] >= fecha_desde[:10]]
    if fecha_hasta:
        rows = [r for r in rows if str(r.get("fecha_inicio") or "")[:10] <= fecha_hasta[:10]]
    return rows


def create_novedad(sb, contrato_id: int, body: dict, current_user) -> dict:
    tid = int(body.get("trabajador_id") or 0)
    if tid <= 0:
        raise ValueError("trabajador_id es obligatorio.")
    get_trabajador(sb, contrato_id, tid)
    tipo = (_trim(body.get("tipo"), max_len=40) or "").lower()
    if tipo not in TIPOS_NOVEDAD:
        raise ValueError("Tipo de novedad inválido.")
    fi = _parse_date(body.get("fecha_inicio"), "Fecha inicio")
    ff = _parse_date(body.get("fecha_fin"), "Fecha fin")
    if ff < fi:
        raise ValueError("La fecha fin debe ser >= fecha inicio.")
    dias = float(body.get("dias") or 0)
    if dias <= 0:
        from datetime import date as _d
        d0 = _d.fromisoformat(fi)
        d1 = _d.fromisoformat(ff)
        dias = float((d1 - d0).days + 1)
    pct = float(body.get("porcentaje_pago") if body.get("porcentaje_pago") is not None else 0)
    if pct < 0 or pct > 100:
        raise ValueError("porcentaje_pago debe estar entre 0 y 100.")
    # Defaults: incapacidad 66.67% primeros días (simplificado: usuario define)
    payload = {
        "contrato_id": int(contrato_id),
        "trabajador_id": tid,
        "tipo": tipo,
        "fecha_inicio": fi,
        "fecha_fin": ff,
        "dias": dias,
        "porcentaje_pago": pct,
        "notas": _trim(body.get("notas"), max_len=2000),
        "created_by": _uid(current_user),
    }
    rows = sb.table(_TABLE_NOV).insert(payload).execute().data or []
    if not rows:
        raise RuntimeError("No se pudo crear la novedad.")
    return rows[0]


def soft_delete_novedad(sb, contrato_id: int, novedad_id: int, current_user) -> None:
    rows = (
        sb.table(_TABLE_NOV)
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("id", int(novedad_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Novedad no encontrada.")
    sb.table(_TABLE_NOV).update({
        "eliminado_en": _now_iso(),
        "eliminado_por": _uid(current_user),
    }).eq("id", int(novedad_id)).execute()


# ── Horas extras ─────────────────────────────────────────────────────────────

def list_horas_extras(
    sb,
    contrato_id: int,
    *,
    trabajador_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> List[dict]:
    q = (
        sb.table(_TABLE_HE)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("fecha", desc=True)
    )
    if trabajador_id is not None:
        q = q.eq("trabajador_id", int(trabajador_id))
    rows = q.execute().data or []
    if fecha_desde:
        rows = [r for r in rows if str(r.get("fecha") or "")[:10] >= fecha_desde[:10]]
    if fecha_hasta:
        rows = [r for r in rows if str(r.get("fecha") or "")[:10] <= fecha_hasta[:10]]
    return rows


def create_hora_extra(sb, contrato_id: int, body: dict, current_user) -> dict:
    tid = int(body.get("trabajador_id") or 0)
    if tid <= 0:
        raise ValueError("trabajador_id es obligatorio.")
    get_trabajador(sb, contrato_id, tid)
    tipo = (_trim(body.get("tipo"), max_len=40) or "").lower()
    if tipo not in TIPOS_HORA:
        raise ValueError("Tipo de hora extra/recargo inválido.")
    fecha = _parse_date(body.get("fecha"), "Fecha")
    horas = float(body.get("cantidad_horas") or 0)
    valor_fijo = body.get("valor_fijo")
    if tipo == "bonificacion":
        if valor_fijo is None or float(valor_fijo) < 0:
            raise ValueError("Bonificación requiere valor_fijo >= 0.")
    elif horas < 0:
        raise ValueError("cantidad_horas inválida.")
    payload = {
        "contrato_id": int(contrato_id),
        "trabajador_id": tid,
        "tipo": tipo,
        "fecha": fecha,
        "cantidad_horas": horas,
        "valor_fijo": float(valor_fijo) if valor_fijo is not None else None,
        "notas": _trim(body.get("notas"), max_len=2000),
        "created_by": _uid(current_user),
    }
    rows = sb.table(_TABLE_HE).insert(payload).execute().data or []
    if not rows:
        raise RuntimeError("No se pudo registrar la hora extra.")
    return rows[0]


def soft_delete_hora_extra(sb, contrato_id: int, he_id: int, current_user) -> None:
    rows = (
        sb.table(_TABLE_HE)
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("id", int(he_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Registro de horas extras no encontrado.")
    sb.table(_TABLE_HE).update({
        "eliminado_en": _now_iso(),
        "eliminado_por": _uid(current_user),
    }).eq("id", int(he_id)).execute()


# ── Nóminas ──────────────────────────────────────────────────────────────────

def list_nominas(sb, contrato_id: int) -> List[dict]:
    return (
        sb.table(_TABLE_NOM)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("anio", desc=True)
        .order("mes", desc=True)
        .order("quincena", desc=True)
        .execute()
        .data
        or []
    )


def get_nomina(sb, contrato_id: int, nomina_id: int) -> dict:
    rows = (
        sb.table(_TABLE_NOM)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("id", int(nomina_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Nómina no encontrada.")
    return rows[0]


def list_nomina_items(sb, contrato_id: int, nomina_id: int) -> List[dict]:
    get_nomina(sb, contrato_id, nomina_id)
    return (
        sb.table(_TABLE_ITEMS)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("nomina_id", int(nomina_id))
        .order("id")
        .execute()
        .data
        or []
    )


def _contrato_label(sb, contrato_id: int) -> str:
    try:
        rows = (
            sb.table("contratos")
            .select("id, numero_contrato, nombre")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            r = rows[0]
            return (r.get("numero_contrato") or r.get("nombre") or f"Contrato {contrato_id}")
    except Exception:
        _log.debug("No se pudo leer etiqueta de contrato %s", contrato_id, exc_info=True)
    return f"Contrato {contrato_id}"


def generar_nomina(
    sb,
    contrato_id: int,
    *,
    periodicidad: str,
    anio: int,
    mes: int,
    quincena: Optional[int] = None,
    current_user=None,
    notas: Optional[str] = None,
) -> dict:
    per = (periodicidad or "").strip().lower()
    if per not in ("quincenal", "mensual"):
        raise ValueError("periodicidad debe ser quincenal o mensual.")
    y, m = int(anio), int(mes)
    if m < 1 or m > 12:
        raise ValueError("Mes inválido.")
    q = int(quincena) if per == "quincenal" else None
    if per == "quincenal" and q not in (1, 2):
        raise ValueError("quincena debe ser 1 o 2.")

    # Evitar duplicados activos
    conflicto = [
        e for e in (
            sb.table(_TABLE_NOM)
            .select("*")
            .eq("contrato_id", int(contrato_id))
            .eq("periodicidad", per)
            .eq("anio", y)
            .eq("mes", m)
            .is_("eliminado_en", "null")
            .neq("estado", "anulada")
            .execute()
            .data
            or []
        )
        if (e.get("quincena") == q) or (q is None and e.get("quincena") is None)
    ]
    if conflicto:
        raise ValueError("Ya existe una nómina para ese periodo.")

    fi, ff = periodo_fechas(anio=y, mes=m, periodicidad=per, quincena=q)
    params = params_for_year(y)

    activos = list_trabajadores(sb, contrato_id, estado="activo")
    activos = [
        t for t in activos
        if (t.get("periodicidad") or "mensual").strip().lower() == per
    ]
    if not activos:
        raise ValueError(
            f"No hay colaboradores activos con periodicidad {per}."
        )

    payload_nom = {
        "contrato_id": int(contrato_id),
        "periodicidad": per,
        "anio": y,
        "mes": m,
        "quincena": q,
        "fecha_inicio": fi.isoformat(),
        "fecha_fin": ff.isoformat(),
        "estado": "borrador",
        "smmlv_usado": params.smmlv,
        "notas": _trim(notas, max_len=2000),
        "created_by": _uid(current_user),
        "updated_by": _uid(current_user),
        "updated_at": _now_iso(),
    }
    nom_rows = sb.table(_TABLE_NOM).insert(payload_nom).execute().data or []
    if not nom_rows:
        raise RuntimeError("No se pudo crear la nómina.")
    nomina = nom_rows[0]
    nomina_id = int(nomina["id"])

    fi_s, ff_s = fi.isoformat(), ff.isoformat()
    all_nov = list_novedades(sb, contrato_id, fecha_desde=fi_s, fecha_hasta=ff_s)
    all_he = list_horas_extras(sb, contrato_id, fecha_desde=fi_s, fecha_hasta=ff_s)

    tot_dev = tot_ded = tot_neto = tot_pat = tot_prov = 0.0
    items_payload: List[dict] = []

    for trab in activos:
        tid = int(trab["id"])
        novs = [n for n in all_nov if int(n.get("trabajador_id") or 0) == tid]
        hes = [h for h in all_he if int(h.get("trabajador_id") or 0) == tid]
        calc = calcular_item_colaborador(
            trab,
            params=params,
            periodicidad=per,
            anio=y,
            mes=m,
            fecha_inicio=fi,
            fecha_fin=ff,
            novedades=novs,
            horas_extras=hes,
        )
        row = calc.as_row()
        row["nomina_id"] = nomina_id
        row["contrato_id"] = int(contrato_id)
        # Remove non-column
        row.pop("ibc", None)
        items_payload.append(row)
        tot_dev = money(tot_dev + calc.total_devengado)
        tot_ded = money(tot_ded + calc.total_deducciones)
        tot_neto = money(tot_neto + calc.neto_pagar)
        tot_pat = money(tot_pat + calc.total_aportes_patronales)
        tot_prov = money(tot_prov + calc.total_provisiones)

    if items_payload:
        sb.table(_TABLE_ITEMS).insert(items_payload).execute()

    upd = {
        "total_devengado": tot_dev,
        "total_deducciones": tot_ded,
        "total_neto": tot_neto,
        "total_aportes_patronales": tot_pat,
        "total_provisiones": tot_prov,
        "updated_at": _now_iso(),
        "updated_by": _uid(current_user),
    }
    nomina = (
        sb.table(_TABLE_NOM)
        .update(upd)
        .eq("id", nomina_id)
        .execute()
        .data or [nomina]
    )[0]
    return {"nomina": nomina, "items": list_nomina_items(sb, contrato_id, nomina_id)}


def regenerar_nomina_borrador(
    sb, contrato_id: int, nomina_id: int, current_user=None
) -> dict:
    """Recalcula ítems de una nómina en borrador (p. ej. tras cargar novedades)."""
    nomina = get_nomina(sb, contrato_id, nomina_id)
    if nomina.get("estado") != "borrador":
        raise ValueError("Solo se puede regenerar una nómina en borrador.")
    # Soft approach: delete items and recreate
    sb.table(_TABLE_ITEMS).delete().eq("nomina_id", int(nomina_id)).execute()
    # Reuse generar logic by updating in place
    per = nomina["periodicidad"]
    y, m = int(nomina["anio"]), int(nomina["mes"])
    q = nomina.get("quincena")
    fi, ff = periodo_fechas(anio=y, mes=m, periodicidad=per, quincena=q)
    params = params_for_year(y)
    activos = [
        t for t in list_trabajadores(sb, contrato_id, estado="activo")
        if (t.get("periodicidad") or "mensual").strip().lower() == per
    ]
    fi_s, ff_s = fi.isoformat(), ff.isoformat()
    all_nov = list_novedades(sb, contrato_id, fecha_desde=fi_s, fecha_hasta=ff_s)
    all_he = list_horas_extras(sb, contrato_id, fecha_desde=fi_s, fecha_hasta=ff_s)

    tot_dev = tot_ded = tot_neto = tot_pat = tot_prov = 0.0
    items_payload = []
    for trab in activos:
        tid = int(trab["id"])
        calc = calcular_item_colaborador(
            trab,
            params=params,
            periodicidad=per,
            anio=y,
            mes=m,
            fecha_inicio=fi,
            fecha_fin=ff,
            novedades=[n for n in all_nov if int(n.get("trabajador_id") or 0) == tid],
            horas_extras=[h for h in all_he if int(h.get("trabajador_id") or 0) == tid],
        )
        row = calc.as_row()
        row["nomina_id"] = int(nomina_id)
        row["contrato_id"] = int(contrato_id)
        row.pop("ibc", None)
        items_payload.append(row)
        tot_dev = money(tot_dev + calc.total_devengado)
        tot_ded = money(tot_ded + calc.total_deducciones)
        tot_neto = money(tot_neto + calc.neto_pagar)
        tot_pat = money(tot_pat + calc.total_aportes_patronales)
        tot_prov = money(tot_prov + calc.total_provisiones)

    if items_payload:
        sb.table(_TABLE_ITEMS).insert(items_payload).execute()

    nomina = (
        sb.table(_TABLE_NOM)
        .update({
            "smmlv_usado": params.smmlv,
            "fecha_inicio": fi.isoformat(),
            "fecha_fin": ff.isoformat(),
            "total_devengado": tot_dev,
            "total_deducciones": tot_ded,
            "total_neto": tot_neto,
            "total_aportes_patronales": tot_pat,
            "total_provisiones": tot_prov,
            "updated_at": _now_iso(),
            "updated_by": _uid(current_user),
        })
        .eq("id", int(nomina_id))
        .execute()
        .data or [nomina]
    )[0]
    return {"nomina": nomina, "items": list_nomina_items(sb, contrato_id, nomina_id)}


def _upsert_provisiones(sb, contrato_id: int, item: dict) -> None:
    tid = int(item["trabajador_id"])
    existing = (
        sb.table(_TABLE_PROV)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("trabajador_id", tid)
        .limit(1)
        .execute()
        .data
        or []
    )
    add = {
        "cesantias": money(float(item.get("prov_cesantias") or 0)),
        "interes_cesantias": money(float(item.get("prov_interes_cesantias") or 0)),
        "prima": money(float(item.get("prov_prima") or 0)),
        "vacaciones": money(float(item.get("prov_vacaciones") or 0)),
    }
    if existing:
        cur = existing[0]
        sb.table(_TABLE_PROV).update({
            "cesantias": money(float(cur.get("cesantias") or 0) + add["cesantias"]),
            "interes_cesantias": money(float(cur.get("interes_cesantias") or 0) + add["interes_cesantias"]),
            "prima": money(float(cur.get("prima") or 0) + add["prima"]),
            "vacaciones": money(float(cur.get("vacaciones") or 0) + add["vacaciones"]),
            "updated_at": _now_iso(),
        }).eq("id", cur["id"]).execute()
    else:
        sb.table(_TABLE_PROV).insert({
            "contrato_id": int(contrato_id),
            "trabajador_id": tid,
            **add,
            "updated_at": _now_iso(),
        }).execute()


def cerrar_nomina(sb, contrato_id: int, nomina_id: int, current_user=None) -> dict:
    """
    Cierra/aprueba la nómina: genera PDFs, envía correos, acumula provisiones
    y genera el .xlsx consolidado.
    """
    nomina = get_nomina(sb, contrato_id, nomina_id)
    if nomina.get("estado") != "borrador":
        raise ValueError("Solo se puede cerrar una nómina en borrador.")

    items = list_nomina_items(sb, contrato_id, nomina_id)
    if not items:
        raise ValueError("La nómina no tiene colaboradores.")

    label = _contrato_label(sb, contrato_id)
    trabajadores = list_trabajadores(sb, contrato_id)
    by_id = {int(t["id"]): t for t in trabajadores}

    per_label = f"{nomina.get('periodicidad')} {nomina.get('mes')}/{nomina.get('anio')}"
    if nomina.get("quincena"):
        per_label = f"Q{nomina['quincena']} {nomina.get('mes')}/{nomina.get('anio')}"

    smtp_ok = nomina_smtp_configured()
    email_results = []

    for item in items:
        tid = int(item["trabajador_id"])
        trab = by_id.get(tid) or get_trabajador(sb, contrato_id, tid)
        pdf_bytes = build_desprendible_pdf(
            nomina=nomina, item=item, trabajador=trab, contrato_label=label
        )
        nombre_pdf = _safe_name(
            f"desprendible_{trab.get('numero_documento') or tid}_{nomina.get('anio')}"
            f"{int(nomina.get('mes') or 0):02d}.pdf"
        )
        blob_path = path_rrhh_desprendible(
            int(contrato_id), int(nomina_id), tid, nombre_pdf
        )
        upload_blob_private(blob_path, pdf_bytes, content_type="application/pdf")

        email_estado = "sin_correo"
        email_en = None
        to_email = (trab.get("email") or "").strip()
        if to_email and smtp_ok:
            try:
                send_desprendible_email(
                    to_email=to_email,
                    colaborador_nombre=f"{trab.get('nombres') or ''} {trab.get('apellidos') or ''}".strip(),
                    periodo_label=per_label,
                    pdf_bytes=pdf_bytes,
                    pdf_filename=nombre_pdf,
                )
                email_estado = "enviado"
                email_en = _now_iso()
            except NominaEmailError as exc:
                email_estado = f"error: {exc}"
                _log.warning("Email desprendible falló tid=%s: %s", tid, exc)
        elif to_email and not smtp_ok:
            email_estado = "smtp_no_configurado"
        elif not to_email:
            email_estado = "sin_correo"

        sb.table(_TABLE_ITEMS).update({
            "desprendible_blob_path": blob_path,
            "desprendible_nombre": nombre_pdf,
            "email_enviado_en": email_en,
            "email_estado": email_estado,
        }).eq("id", item["id"]).execute()

        _upsert_provisiones(sb, contrato_id, item)
        email_results.append({"trabajador_id": tid, "email_estado": email_estado})

    # XLSX consolidado
    # Refresh items with blob paths
    items = list_nomina_items(sb, contrato_id, nomina_id)
    xlsx_bytes = build_nomina_xlsx(
        nomina, items, trabajadores=trabajadores, contrato_label=label
    )
    xlsx_name = _safe_name(
        f"nomina_{nomina.get('anio')}{int(nomina.get('mes') or 0):02d}"
        f"{('_q' + str(nomina.get('quincena'))) if nomina.get('quincena') else ''}.xlsx"
    )
    xlsx_path = path_rrhh_nomina_xlsx(int(contrato_id), int(nomina_id), xlsx_name)
    upload_blob_private(
        xlsx_path,
        xlsx_bytes,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    nomina = (
        sb.table(_TABLE_NOM)
        .update({
            "estado": "cerrada",
            "xlsx_blob_path": xlsx_path,
            "xlsx_nombre": xlsx_name,
            "cerrada_en": _now_iso(),
            "cerrada_por": _uid(current_user),
            "updated_at": _now_iso(),
            "updated_by": _uid(current_user),
        })
        .eq("id", int(nomina_id))
        .execute()
        .data or [nomina]
    )[0]

    return {
        "nomina": nomina,
        "items": items,
        "emails": email_results,
    }


def anular_nomina(sb, contrato_id: int, nomina_id: int, current_user=None) -> dict:
    nomina = get_nomina(sb, contrato_id, nomina_id)
    if nomina.get("estado") == "anulada":
        return nomina
    if nomina.get("estado") == "cerrada":
        raise ValueError(
            "No se puede anular una nómina cerrada (afectaría provisiones y desprendibles)."
        )
    rows = (
        sb.table(_TABLE_NOM)
        .update({
            "estado": "anulada",
            "eliminado_en": _now_iso(),
            "eliminado_por": _uid(current_user),
            "updated_at": _now_iso(),
            "updated_by": _uid(current_user),
        })
        .eq("id", int(nomina_id))
        .execute()
        .data
        or []
    )
    return rows[0] if rows else nomina


def download_nomina_xlsx(sb, contrato_id: int, nomina_id: int) -> tuple[bytes, str]:
    nomina = get_nomina(sb, contrato_id, nomina_id)
    path = nomina.get("xlsx_blob_path")
    if not path:
        # Generar al vuelo si aún no está cerrada
        items = list_nomina_items(sb, contrato_id, nomina_id)
        trabajadores = list_trabajadores(sb, contrato_id)
        label = _contrato_label(sb, contrato_id)
        data = build_nomina_xlsx(
            nomina, items, trabajadores=trabajadores, contrato_label=label
        )
        name = nomina.get("xlsx_nombre") or f"nomina_{nomina_id}.xlsx"
        return data, name
    data = download_blob_bytes_private(path)
    return data, nomina.get("xlsx_nombre") or f"nomina_{nomina_id}.xlsx"


def download_desprendible(
    sb, contrato_id: int, nomina_id: int, item_id: int
) -> tuple[bytes, str]:
    get_nomina(sb, contrato_id, nomina_id)
    rows = (
        sb.table(_TABLE_ITEMS)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("nomina_id", int(nomina_id))
        .eq("id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Ítem de nómina no encontrado.")
    item = rows[0]
    path = item.get("desprendible_blob_path")
    if not path:
        raise ValueError("El desprendible aún no ha sido generado (cierre la nómina).")
    data = download_blob_bytes_private(path)
    return data, item.get("desprendible_nombre") or f"desprendible_{item_id}.pdf"


# ── Provisiones / Liquidación ────────────────────────────────────────────────

def get_provisiones(sb, contrato_id: int, trabajador_id: int) -> dict:
    rows = (
        sb.table(_TABLE_PROV)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("trabajador_id", int(trabajador_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]
    return {
        "contrato_id": int(contrato_id),
        "trabajador_id": int(trabajador_id),
        "cesantias": 0,
        "interes_cesantias": 0,
        "prima": 0,
        "vacaciones": 0,
    }


def list_liquidaciones(sb, contrato_id: int) -> List[dict]:
    return (
        sb.table(_TABLE_LIQ)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .is_("eliminado_en", "null")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def get_liquidacion(sb, contrato_id: int, liq_id: int) -> dict:
    rows = (
        sb.table(_TABLE_LIQ)
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .eq("id", int(liq_id))
        .is_("eliminado_en", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Liquidación no encontrada.")
    return rows[0]


def generar_liquidacion(
    sb,
    contrato_id: int,
    body: dict,
    current_user=None,
) -> dict:
    tid = int(body.get("trabajador_id") or 0)
    if tid <= 0:
        raise ValueError("trabajador_id es obligatorio.")
    trab = get_trabajador(sb, contrato_id, tid)
    fecha_retiro = _parse_date(body.get("fecha_retiro"), "Fecha de retiro")
    from datetime import date as _d
    fr = _d.fromisoformat(fecha_retiro)
    causa = _trim(body.get("causa"), max_len=500)
    indem = float(body.get("indemnizacion") or 0)
    sal_pend = float(body.get("salario_pendiente") or 0)
    dias_vac = body.get("dias_vacaciones_pendientes")
    dias_vac_f = float(dias_vac) if dias_vac is not None and dias_vac != "" else None

    prov = get_provisiones(sb, contrato_id, tid)
    calc = calcular_liquidacion(
        trab,
        fecha_retiro=fr,
        causa=causa,
        indemnizacion=indem,
        provisiones=prov,
        salario_pendiente=sal_pend,
        dias_vacaciones_pendientes=dias_vac_f,
        params=params_for_year(fr.year),
    )

    payload = {
        "contrato_id": int(contrato_id),
        "trabajador_id": tid,
        "fecha_retiro": fecha_retiro,
        "causa": causa,
        "salario_pendiente": calc.salario_pendiente,
        "vacaciones_dinero": calc.vacaciones_dinero,
        "cesantias": calc.cesantias,
        "interes_cesantias": calc.interes_cesantias,
        "prima_proporcional": calc.prima_proporcional,
        "indemnizacion": calc.indemnizacion,
        "total_liquidacion": calc.total_liquidacion,
        "detalle_json": calc.detalle,
        "estado": "generada",
        "created_by": _uid(current_user),
    }
    rows = sb.table(_TABLE_LIQ).insert(payload).execute().data or []
    if not rows:
        raise RuntimeError("No se pudo crear la liquidación.")
    liq = rows[0]

    label = _contrato_label(sb, contrato_id)
    pdf_bytes = build_liquidacion_pdf(
        liquidacion={**liq, "detalle": calc.detalle},
        trabajador=trab,
        contrato_label=label,
    )
    pdf_name = _safe_name(
        f"liquidacion_{trab.get('numero_documento') or tid}_{fecha_retiro}.pdf"
    )
    blob_path = path_rrhh_liquidacion_pdf(
        int(contrato_id), tid, int(liq["id"]), pdf_name
    )
    upload_blob_private(blob_path, pdf_bytes, content_type="application/pdf")

    email_estado = "sin_correo"
    email_en = None
    to_email = (trab.get("email") or "").strip()
    if to_email and nomina_smtp_configured():
        try:
            send_liquidacion_email(
                to_email=to_email,
                colaborador_nombre=f"{trab.get('nombres') or ''} {trab.get('apellidos') or ''}".strip(),
                fecha_retiro=fecha_retiro,
                pdf_bytes=pdf_bytes,
                pdf_filename=pdf_name,
            )
            email_estado = "enviado"
            email_en = _now_iso()
        except NominaEmailError as exc:
            email_estado = f"error: {exc}"
    elif to_email:
        email_estado = "smtp_no_configurado"

    liq = (
        sb.table(_TABLE_LIQ)
        .update({
            "pdf_blob_path": blob_path,
            "pdf_nombre": pdf_name,
            "email_enviado_en": email_en,
            "email_estado": email_estado,
        })
        .eq("id", liq["id"])
        .execute()
        .data or [liq]
    )[0]

    # Marcar colaborador como retirado y fijar fecha_retiro
    try:
        from rrhh_service import update_trabajador
        update_trabajador(
            sb,
            contrato_id,
            tid,
            {"estado": "retirado", "fecha_retiro": fecha_retiro},
            current_user,
        )
    except Exception:
        _log.exception("No se pudo actualizar estado del colaborador tras liquidación")
        sb.table("rrhh_trabajadores").update({
            "estado": "retirado",
            "fecha_retiro": fecha_retiro,
            "updated_at": _now_iso(),
        }).eq("id", tid).eq("contrato_id", int(contrato_id)).execute()

    # Reset provisiones (ya liquidadas)
    if prov.get("id"):
        sb.table(_TABLE_PROV).update({
            "cesantias": 0,
            "interes_cesantias": 0,
            "prima": 0,
            "vacaciones": 0,
            "updated_at": _now_iso(),
        }).eq("id", prov["id"]).execute()

    return liq


def download_liquidacion_pdf(
    sb, contrato_id: int, liq_id: int
) -> tuple[bytes, str]:
    liq = get_liquidacion(sb, contrato_id, liq_id)
    path = liq.get("pdf_blob_path")
    if not path:
        raise ValueError("PDF de liquidación no disponible.")
    data = download_blob_bytes_private(path)
    return data, liq.get("pdf_nombre") or f"liquidacion_{liq_id}.pdf"
