"""Orquestación de notificaciones automáticas por correo (lun–vie, America/Bogota)."""

from __future__ import annotations

import html
import logging
from datetime import datetime, timedelta
from typing import Callable, List, Optional, Set

import pytz

from notificaciones_email_config import (
    CRON_MATCH_WINDOW_MIN,
    JobRunSpec,
    TZ_BOGOTA,
    all_scheduled_jobs,
    temp_test_admin_jobs_due_now,
)
from notificaciones_email_mail import (
    email_admin_resumen,
    email_informe_no_copiado,
    email_sin_item_asignado,
    email_validacion_pendiente,
    smtp_configured,
    try_send_notification_email,
)

_log = logging.getLogger("claracore.notificaciones_email")


def _bogota_now() -> datetime:
    return datetime.now(pytz.timezone(TZ_BOGOTA))


def is_weekday_bogota(dt: Optional[datetime] = None) -> bool:
    dt = dt or _bogota_now()
    return dt.weekday() < 5


def _minutes_since_midnight(dt: datetime) -> int:
    return dt.hour * 60 + dt.minute


def jobs_due_now(dt: Optional[datetime] = None) -> List[JobRunSpec]:
    dt = dt or _bogota_now()
    if not is_weekday_bogota(dt):
        return []
    now_m = _minutes_since_midnight(dt)
    due: List[JobRunSpec] = []
    for job in all_scheduled_jobs():
        target = job.hour * 60 + job.minute
        if target <= now_m < target + CRON_MATCH_WINDOW_MIN:
            due.append(job)
    return due


def _slot_log_key(fecha: str, job: JobRunSpec) -> str:
    return f"{fecha}_{job.slot_key}"


def _format_cop(n: float) -> str:
    try:
        return f"${int(round(float(n))):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "$0"


def _usuario_display_name(row: dict) -> str:
    nom = f"{row.get('nombre') or ''} {row.get('apellidos') or ''}".strip()
    return nom or (row.get("email") or "Usuario")


class NotificacionesEmailRunner:
    """Ejecuta jobs de correo usando helpers de main.py (inyectados)."""

    def __init__(
        self,
        supabase,
        supabase_execute: Callable,
        *,
        permiso_reporte_cantidades_user_id: Callable[[int, str, Optional[int]], bool],
        nivel_validacion_usuario: Callable[[int], Optional[int]],
        niveles_activos_contrato: Callable[[int], List[int]],
        acta_rpo_vigente_row: Callable[[int], Optional[dict]],
        es_desarrollador_user_id: Callable[[int], bool],
        destinatarios_admin_contrato: Callable[[Optional[int]], List[int]],
        ids_cargo_por_nombre: Callable[[str], List[int]],
        usuarios_activos_por_cargos: Callable[[List[int]], List[dict]],
        usuario_vinculado_contrato: Callable[[int, int], bool],
    ):
        self.supabase = supabase
        self.supabase_execute = supabase_execute
        self._permiso_rc = permiso_reporte_cantidades_user_id
        self._nivel_usuario = nivel_validacion_usuario
        self._niveles_contrato = niveles_activos_contrato
        self._acta_vigente = acta_rpo_vigente_row
        self._es_dev = es_desarrollador_user_id
        self._admin_dest = destinatarios_admin_contrato
        self._ids_cargo = ids_cargo_por_nombre
        self._usuarios_cargo = usuarios_activos_por_cargos
        self._vinculado = usuario_vinculado_contrato

    def _fetch_contratos_activos(self) -> List[dict]:
        """Todos los contratos registrados en la plataforma (sin filtro por id)."""
        return (
            self.supabase.table("contratos")
            .select("id, numero")
            .execute()
            .data
            or []
        )

    def _usuarios_vinculados_contrato(self, contrato_id: int) -> List[dict]:
        uid_set: Set[int] = set()
        try:
            prim = (
                self.supabase.table("usuarios")
                .select("id")
                .eq("contrato_id", contrato_id)
                .eq("activo", True)
                .execute()
                .data
                or []
            )
            for r in prim:
                uid_set.add(int(r["id"]))
        except (TypeError, ValueError):
            pass
        try:
            uc = (
                self.supabase.table("usuario_contratos")
                .select("usuario_id")
                .eq("contrato_id", contrato_id)
                .execute()
                .data
                or []
            )
            for r in uc:
                uid_set.add(int(r["usuario_id"]))
        except (TypeError, ValueError):
            pass
        if not uid_set:
            return []
        rows = (
            self.supabase.table("usuarios")
            .select("id, email, nombre, apellidos, cargo_id, contrato_id, activo, estado")
            .in_("id", list(uid_set))
            .eq("activo", True)
            .execute()
            .data
            or []
        )
        out: List[dict] = []
        for r in rows:
            if (r.get("estado") or "").lower() == "rechazado":
                continue
            if not (r.get("email") or "").strip():
                continue
            uid = int(r["id"])
            if not self._vinculado(uid, contrato_id):
                continue
            out.append(r)
        return out

    def _ya_enviado(self, tipo: str, slot_key: str, usuario_id: Optional[int], contrato_id: Optional[int]) -> bool:
        q = (
            self.supabase.table("notificaciones_email_envio")
            .select("id")
            .eq("tipo", tipo)
            .eq("slot_key", slot_key)
        )
        if usuario_id is not None:
            q = q.eq("usuario_id", usuario_id)
        else:
            q = q.is_("usuario_id", "null")
        if contrato_id is not None:
            q = q.eq("contrato_id", contrato_id)
        else:
            q = q.is_("contrato_id", "null")
        rows = q.limit(1).execute().data or []
        return bool(rows)

    def _registrar_envio(
        self,
        tipo: str,
        slot_key: str,
        usuario_id: Optional[int],
        contrato_id: Optional[int],
        destinatario: str,
        exito: bool,
        error: Optional[str] = None,
        meta: Optional[dict] = None,
    ) -> None:
        row = {
            "tipo": tipo,
            "slot_key": slot_key,
            "usuario_id": usuario_id,
            "contrato_id": contrato_id,
            "destinatario": destinatario,
            "exito": bool(exito),
            "error_detalle": (error or "")[:500] or None,
            "meta": meta or {},
        }
        try:
            self.supabase.table("notificaciones_email_envio").upsert(
                row, on_conflict="tipo,slot_key,usuario_id,contrato_id"
            ).execute()
        except Exception:
            _log.exception("No se pudo registrar notificaciones_email_envio")

    def _enviar(
        self,
        tipo: str,
        slot_key: str,
        usuario_id: Optional[int],
        contrato_id: Optional[int],
        to_addr: str,
        subject: str,
        text: str,
        html_body: str,
        meta: Optional[dict] = None,
    ) -> bool:
        if self._ya_enviado(tipo, slot_key, usuario_id, contrato_id):
            return False
        res = try_send_notification_email(to_addr, subject, text, html_body)
        if res is None:
            _log.warning("SMTP no configurado; omitiendo %s → %s", tipo, to_addr)
            return False
        self._registrar_envio(tipo, slot_key, usuario_id, contrato_id, to_addr, bool(res), meta=meta)
        return bool(res)

    def _rpc_count(self, fn: str, params: dict) -> int:
        def _q():
            return self.supabase.rpc(fn, params).execute().data

        data = self.supabase_execute(_q)
        if data is None:
            return 0
        if isinstance(data, list):
            if not data:
                return 0
            row = data[0]
            if isinstance(row, dict):
                for k in row:
                    if row[k] is not None:
                        return int(row[k])
                return 0
            return int(row)
        return int(data)

    def _informe_slot_label(self, slot_hora: str) -> str:
        if len(slot_hora) == 4:
            return f"{slot_hora[:2]}:{slot_hora[2:]}"
        return slot_hora

    def run_informe_no_copiado(self, fecha: str, slot_hora: str, log_key: str) -> dict:
        slot_id = f"{fecha}_{slot_hora}"
        enviados = 0
        omitidos = 0
        contratos = self._fetch_contratos_activos()
        label = self._informe_slot_label(slot_hora)
        for c in contratos:
            try:
                cid = int(c["id"])
            except (TypeError, ValueError):
                continue
            cnum = str(c.get("numero") or cid)
            for u in self._usuarios_vinculados_contrato(cid):
                uid = int(u["id"])
                if not self._permiso_rc(uid, "editar", cid):
                    continue

                def _copiado():
                    return (
                        self.supabase.table("informe_periodico_copia")
                        .select("id")
                        .eq("usuario_id", uid)
                        .eq("contrato_id", cid)
                        .eq("slot_id", slot_id)
                        .limit(1)
                        .execute()
                        .data
                    )

                if self.supabase_execute(_copiado):
                    omitidos += 1
                    continue
                subj, txt, html_b = email_informe_no_copiado(
                    _usuario_display_name(u), cnum, label
                )
                if self._enviar(
                    "informe_no_copiado",
                    log_key,
                    uid,
                    cid,
                    u["email"].strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"slot_id": slot_id},
                ):
                    enviados += 1
        return {
            "contratos_evaluados": len(contratos),
            "enviados": enviados,
            "omitidos_ya_copiaron": omitidos,
        }

    def run_sin_item_asignado(self, log_key: str) -> dict:
        enviados = 0
        contratos = self._fetch_contratos_activos()
        for c in contratos:
            try:
                cid = int(c["id"])
            except (TypeError, ValueError):
                continue
            n = self._rpc_count("notif_email_count_sin_item", {"p_contrato_id": cid})
            if n <= 0:
                continue
            cnum = str(c.get("numero") or cid)
            for u in self._usuarios_vinculados_contrato(cid):
                uid = int(u["id"])
                if not self._permiso_rc(uid, "editar", cid):
                    continue
                subj, txt, html_b = email_sin_item_asignado(_usuario_display_name(u), cnum, n)
                if self._enviar(
                    "sin_item_asignado",
                    log_key,
                    uid,
                    cid,
                    u["email"].strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"n_sin_item": n},
                ):
                    enviados += 1
        return {"contratos_evaluados": len(contratos), "enviados": enviados}

    def run_validacion_pendiente(self, log_key: str) -> dict:
        enviados = 0
        contratos = self._fetch_contratos_activos()
        for c in contratos:
            try:
                cid = int(c["id"])
            except (TypeError, ValueError):
                continue
            na = self._niveles_contrato(cid)
            if not na:
                continue
            cnum = str(c.get("numero") or cid)
            for u in self._usuarios_vinculados_contrato(cid):
                uid = int(u["id"])
                if not self._permiso_rc(uid, "validar", cid):
                    continue
                nivel = self._nivel_usuario(uid)
                if nivel is None or nivel < 1 or nivel not in na:
                    continue
                n = self._rpc_count(
                    "notif_email_count_pendiente_nivel",
                    {
                        "p_contrato_id": cid,
                        "p_nivel": nivel,
                        "p_niveles_activos": na,
                    },
                )
                if n <= 0:
                    continue
                subj, txt, html_b = email_validacion_pendiente(
                    _usuario_display_name(u), cnum, nivel, n
                )
                if self._enviar(
                    "validacion_pendiente",
                    log_key,
                    uid,
                    cid,
                    u["email"].strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"nivel": nivel, "n_pendientes": n},
                ):
                    enviados += 1
        return {"contratos_evaluados": len(contratos), "enviados": enviados}

    def run_admin_resumen(self, fecha: str, periodo: str, log_key: str) -> dict:
        enviados = 0
        # prueba_temp usa el mismo contenido que resumen de mañana
        periodo_efectivo = "manana" if periodo == "prueba_temp" else periodo
        periodo_label = "mañana" if periodo_efectivo == "manana" else "fin de jornada"
        contratos = self._fetch_contratos_activos()
        for c in contratos:
            try:
                cid = int(c["id"])
            except (TypeError, ValueError):
                continue
            cnum = str(c.get("numero") or cid)
            dest_ids = self._admin_dest(cid)
            if not dest_ids:
                continue

            def _dia():
                return self.supabase.rpc(
                    "notif_email_registros_dia",
                    {"p_contrato_id": cid, "p_fecha": fecha},
                ).execute().data

            dia_rows = self.supabase_execute(_dia) or []
            n_rep = 0
            val_rep = 0.0
            if dia_rows:
                row0 = dia_rows[0] if isinstance(dia_rows[0], dict) else {}
                n_rep = int(row0.get("n_reg") or 0)
                val_rep = float(row0.get("total_valor") or 0)

            vig = self._acta_vigente(cid)
            acta_id = int(vig["id"]) if vig and vig.get("id") is not None else None
            na = self._niveles_contrato(cid)

            niveles_lines: List[str] = []
            niveles_html_parts: List[str] = ["<table style='border-collapse:collapse;font-size:14px;'>"]
            niveles_html_parts.append(
                "<tr><th style='text-align:left;padding:4px 8px;'>Nivel</th>"
                "<th style='padding:4px 8px;'>Aprob. hoy</th>"
                "<th style='padding:4px 8px;'>Acum. acta vigente</th></tr>"
            )
            for n in sorted(na):
                def _apr(nivel=n):
                    return self.supabase.rpc(
                        "notif_email_aprobados_nivel",
                        {
                            "p_contrato_id": cid,
                            "p_fecha": fecha,
                            "p_acta_id": acta_id,
                            "p_nivel": nivel,
                        },
                    ).execute().data

                apr_rows = self.supabase_execute(_apr) or []
                dia_n = acum_n = 0
                if apr_rows and isinstance(apr_rows[0], dict):
                    dia_n = int(apr_rows[0].get("aprobado_dia") or 0)
                    acum_n = int(apr_rows[0].get("aprobado_acum") or 0)
                niveles_lines.append(f"N{n}: aprobados hoy {dia_n}, acumulado acta {acum_n}")
                niveles_html_parts.append(
                    f"<tr><td style='padding:4px 8px;'>N{n}</td>"
                    f"<td style='text-align:center;padding:4px 8px;'>{dia_n}</td>"
                    f"<td style='text-align:center;padding:4px 8px;'>{acum_n}</td></tr>"
                )
            niveles_html_parts.append("</table>")
            niveles_html = "".join(niveles_html_parts)
            niveles_text = "\n".join(niveles_lines)

            for uid in dest_ids:
                urows = (
                    self.supabase.table("usuarios")
                    .select("id, email, nombre, apellidos")
                    .eq("id", uid)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if not urows or not (urows[0].get("email") or "").strip():
                    continue
                u = urows[0]
                subj, txt, html_b = email_admin_resumen(
                    _usuario_display_name(u),
                    cnum,
                    periodo_label,
                    n_rep,
                    _format_cop(val_rep),
                    niveles_html,
                )
                txt = txt.replace(niveles_html, niveles_text)
                if self._enviar(
                    "admin_resumen",
                    log_key,
                    int(u["id"]),
                    cid,
                    u["email"].strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"periodo": periodo, "n_reportados": n_rep},
                ):
                    enviados += 1
        return {"contratos_evaluados": len(contratos), "enviados": enviados}

    def run_due_jobs(self, dt: Optional[datetime] = None) -> dict:
        dt = dt or _bogota_now()
        if not smtp_configured():
            return {"skipped": "smtp_no_configurado", "jobs": []}

        fecha = dt.strftime("%Y-%m-%d")
        results: List[dict] = []

        # TEMPORAL — prueba sáb 2026-07-18 23:32–23:40: admin_resumen sin restricción fin de semana
        for job in temp_test_admin_jobs_due_now(dt):
            log_key = _slot_log_key(fecha, job)
            try:
                stats = self.run_admin_resumen(fecha, job.slot_key, log_key)
                results.append(
                    {
                        "job": job.job_type,
                        "slot": job.slot_key,
                        "temp_test": True,
                        **stats,
                    }
                )
            except Exception as exc:
                _log.exception("Job prueba temp %s falló", job.slot_key)
                results.append(
                    {
                        "job": job.job_type,
                        "slot": job.slot_key,
                        "temp_test": True,
                        "error": str(exc)[:200],
                    }
                )

        if not is_weekday_bogota(dt):
            if not results:
                return {"skipped": "fin_de_semana", "jobs": []}
            return {
                "fecha": fecha,
                "hora_bogota": dt.strftime("%H:%M"),
                "fin_de_semana": True,
                "jobs": results,
            }

        for job in jobs_due_now(dt):
            log_key = _slot_log_key(fecha, job)
            try:
                if job.job_type == "informe_no_copiado":
                    stats = self.run_informe_no_copiado(fecha, job.slot_key, log_key)
                elif job.job_type == "sin_item_asignado":
                    stats = self.run_sin_item_asignado(log_key)
                elif job.job_type == "validacion_pendiente":
                    stats = self.run_validacion_pendiente(log_key)
                elif job.job_type == "admin_resumen":
                    stats = self.run_admin_resumen(fecha, job.slot_key, log_key)
                else:
                    stats = {"error": "tipo_desconocido"}
                results.append({"job": job.job_type, "slot": job.slot_key, **stats})
            except Exception as exc:
                _log.exception("Job %s/%s falló", job.job_type, job.slot_key)
                results.append(
                    {"job": job.job_type, "slot": job.slot_key, "error": str(exc)[:200]}
                )
        return {"fecha": fecha, "hora_bogota": dt.strftime("%H:%M"), "jobs": results}


def build_runner_from_main(main_module) -> NotificacionesEmailRunner:
    m = main_module

    def _es_dev_uid(uid: int) -> bool:
        return m._es_desarrollador({"sub": str(uid)})

    return NotificacionesEmailRunner(
        m.supabase,
        m.supabase_execute,
        permiso_reporte_cantidades_user_id=m._cargo_permiso_reporte_cantidades_user_id,
        nivel_validacion_usuario=m._sicoe_db_nivel_validacion_usuario,
        niveles_activos_contrato=m._get_niveles_activos_contrato,
        acta_rpo_vigente_row=m._acta_rpo_vigente_row,
        es_desarrollador_user_id=_es_dev_uid,
        destinatarios_admin_contrato=m._destinatarios_notif_nuevo_registro,
        ids_cargo_por_nombre=m._ids_cargo_por_nombre,
        usuarios_activos_por_cargos=m._usuarios_activos_por_cargos,
        usuario_vinculado_contrato=m._usuario_vinculado_a_contrato,
    )
