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
        destinatarios_resumen_jornada: Callable[[Optional[int]], List[int]],
        fetch_matriz_validacion_email: Callable[[int], dict],
        fetch_capitulos_financiero_email: Callable[[int], dict],
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
        self._resumen_dest = destinatarios_resumen_jornada
        self._fetch_matriz = fetch_matriz_validacion_email
        self._fetch_capitulos = fetch_capitulos_financiero_email
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
        to_addr = (to_addr or "").strip()
        if not to_addr:
            return False
        res = try_send_notification_email(to_addr, subject, text, html_body)
        if res is None:
            _log.warning("SMTP no configurado; omitiendo %s → %s", tipo, to_addr)
            return False
        self._registrar_envio(tipo, slot_key, usuario_id, contrato_id, to_addr, bool(res), meta=meta)
        return bool(res)

    def _enviar_canales(
        self,
        tipo: str,
        slot_key: str,
        usuario_id: int,
        contrato_id: Optional[int],
        to_addr: Optional[str],
        subject: str,
        text: str,
        html_body: str,
        meta: Optional[dict] = None,
    ) -> tuple[int, int]:
        email_n = 0
        if (to_addr or "").strip() and smtp_configured():
            if self._enviar(
                tipo, slot_key, usuario_id, contrato_id, to_addr.strip(), subject, text, html_body, meta=meta
            ):
                email_n = 1
        return email_n, 0

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
        push_enviados = 0
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
                en, pn = self._enviar_canales(
                    "informe_no_copiado",
                    log_key,
                    uid,
                    cid,
                    (u.get("email") or "").strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"slot_id": slot_id},
                )
                enviados += en
                push_enviados += pn
        return {
            "contratos_evaluados": len(contratos),
            "enviados": enviados,
            "push_enviados": push_enviados,
            "omitidos_ya_copiaron": omitidos,
        }

    def run_sin_item_asignado(self, log_key: str) -> dict:
        enviados = 0
        push_enviados = 0
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
                en, pn = self._enviar_canales(
                    "sin_item_asignado",
                    log_key,
                    uid,
                    cid,
                    (u.get("email") or "").strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"n_sin_item": n},
                )
                enviados += en
                push_enviados += pn
        return {
            "contratos_evaluados": len(contratos),
            "enviados": enviados,
            "push_enviados": push_enviados,
        }

    def run_validacion_pendiente(self, log_key: str) -> dict:
        enviados = 0
        push_enviados = 0
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
                en, pn = self._enviar_canales(
                    "validacion_pendiente",
                    log_key,
                    uid,
                    cid,
                    (u.get("email") or "").strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"nivel": nivel, "n_pendientes": n},
                )
                enviados += en
                push_enviados += pn
        return {
            "contratos_evaluados": len(contratos),
            "enviados": enviados,
            "push_enviados": push_enviados,
        }

    def _admin_resumen_cargar_contrato(self, contrato_id: int) -> tuple[str, dict, dict]:
        """Número de contrato + datos matriz/capítulos (misma lógica que envío programado)."""
        rows = (
            self.supabase.table("contratos")
            .select("id, numero")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise LookupError("contrato_no_encontrado")
        cnum = str(rows[0].get("numero") or contrato_id)
        try:
            matriz = self._fetch_matriz(int(contrato_id)) or {}
        except Exception:
            _log.exception("Matriz validación falló contrato %s", contrato_id)
            matriz = {
                "niveles_activos": self._niveles_contrato(int(contrato_id)),
                "acta_rpo": None,
            }
        try:
            capitulos = self._fetch_capitulos(int(contrato_id)) or {}
        except Exception:
            _log.exception("Capítulos financiero falló contrato %s", contrato_id)
            capitulos = {}
        return cnum, matriz, capitulos

    def run_admin_resumen_prueba_temp(
        self,
        contrato_id: int,
        periodo: str,
        to_email: str,
        to_nombre: str,
    ) -> dict:
        """
        TEMPORAL — envío bajo demanda del resumen jornada a un único correo de prueba.
        No notifica destinatarios reales ni Web Push. Eliminar con el endpoint temp.
        """
        periodo_efectivo = "manana" if periodo == "manana" else "tarde"
        cnum, matriz, capitulos = self._admin_resumen_cargar_contrato(contrato_id)
        subj, txt, html_b = email_admin_resumen(
            to_nombre,
            cnum,
            periodo_efectivo,
            matriz,
            capitulos,
        )
        to_addr = (to_email or "").strip()
        if not to_addr:
            return {
                "temp_prueba": True,
                "contrato_id": int(contrato_id),
                "contrato_numero": cnum,
                "periodo": periodo_efectivo,
                "destinatario": None,
                "acta_rpo": matriz.get("acta_rpo"),
                "enviado": False,
                "error": "correo_destino_vacio",
                "smtp_configurado": smtp_configured(),
            }
        if not smtp_configured():
            return {
                "temp_prueba": True,
                "contrato_id": int(contrato_id),
                "contrato_numero": cnum,
                "periodo": periodo_efectivo,
                "destinatario": to_addr,
                "acta_rpo": matriz.get("acta_rpo"),
                "enviado": False,
                "error": "smtp_no_configurado",
                "smtp_configurado": False,
            }
        res = try_send_notification_email(to_addr, subj, txt, html_b)
        return {
            "temp_prueba": True,
            "contrato_id": int(contrato_id),
            "contrato_numero": cnum,
            "periodo": periodo_efectivo,
            "destinatario": to_addr,
            "acta_rpo": matriz.get("acta_rpo"),
            "asunto": subj,
            "enviado": bool(res),
            "smtp_configurado": True,
        }

    def run_admin_resumen(self, fecha: str, periodo: str, log_key: str) -> dict:
        enviados = 0
        push_enviados = 0
        periodo_efectivo = "manana" if periodo == "manana" else "tarde"
        contratos = self._fetch_contratos_activos()
        for c in contratos:
            try:
                cid = int(c["id"])
            except (TypeError, ValueError):
                continue
            dest_ids = self._resumen_dest(cid)
            if not dest_ids:
                continue

            try:
                cnum, matriz, capitulos = self._admin_resumen_cargar_contrato(cid)
            except LookupError:
                continue

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
                if not urows:
                    continue
                u = urows[0]
                subj, txt, html_b = email_admin_resumen(
                    _usuario_display_name(u),
                    cnum,
                    periodo_efectivo,
                    matriz,
                    capitulos,
                )
                en, pn = self._enviar_canales(
                    "admin_resumen",
                    log_key,
                    int(u["id"]),
                    cid,
                    (u.get("email") or "").strip(),
                    subj,
                    txt,
                    html_b,
                    meta={"periodo": periodo_efectivo, "acta_rpo": matriz.get("acta_rpo")},
                )
                enviados += en
                push_enviados += pn
        return {
            "contratos_evaluados": len(contratos),
            "enviados": enviados,
            "push_enviados": push_enviados,
        }

    def run_due_jobs(self, dt: Optional[datetime] = None) -> dict:
        dt = dt or _bogota_now()
        if not smtp_configured():
            return {"skipped": "sin_canales_configurados", "jobs": []}

        fecha = dt.strftime("%Y-%m-%d")
        results: List[dict] = []

        if not is_weekday_bogota(dt):
            return {"skipped": "fin_de_semana", "jobs": []}

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
        destinatarios_resumen_jornada=m._destinatarios_resumen_jornada,
        fetch_matriz_validacion_email=m._fetch_matriz_validacion_vigente_email,
        fetch_capitulos_financiero_email=m._fetch_capitulos_financiero_email,
        ids_cargo_por_nombre=m._ids_cargo_por_nombre,
        usuarios_activos_por_cargos=m._usuarios_activos_por_cargos,
        usuario_vinculado_contrato=m._usuario_vinculado_a_contrato,
    )
