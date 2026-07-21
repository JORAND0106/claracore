"""Envío Web Push reutilizando ventanas y destinatarios de notificaciones email."""

from __future__ import annotations

import logging
from typing import List, Optional

from notificaciones_push_send import (
    push_body_from_email_text,
    try_send_web_push,
    vapid_configured,
)

_log = logging.getLogger("claracore.notificaciones_push")


class NotificacionesPushSender:
    def __init__(self, supabase):
        self.supabase = supabase

    def configured(self) -> bool:
        return vapid_configured()

    def _subscriptions(self, usuario_id: int) -> List[dict]:
        try:
            rows = (
                self.supabase.table("push_subscriptions")
                .select("id, endpoint, p256dh, auth_key")
                .eq("usuario_id", int(usuario_id))
                .eq("activo", True)
                .execute()
                .data
                or []
            )
            return rows
        except Exception:
            _log.exception("No se pudieron listar push_subscriptions uid=%s", usuario_id)
            return []

    def _deactivate(self, sub_id: int) -> None:
        try:
            self.supabase.table("push_subscriptions").update({"activo": False}).eq("id", sub_id).execute()
        except Exception:
            _log.exception("No se pudo desactivar push_subscription id=%s", sub_id)

    def _ya_enviado(
        self, tipo: str, slot_key: str, usuario_id: Optional[int], contrato_id: Optional[int]
    ) -> bool:
        q = (
            self.supabase.table("notificaciones_push_envio")
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
        return bool(q.limit(1).execute().data)

    def _registrar_envio(
        self,
        tipo: str,
        slot_key: str,
        usuario_id: Optional[int],
        contrato_id: Optional[int],
        destinatario: str,
        exito: bool,
        meta: Optional[dict] = None,
    ) -> None:
        row = {
            "tipo": tipo,
            "slot_key": slot_key,
            "usuario_id": usuario_id,
            "contrato_id": contrato_id,
            "destinatario": destinatario,
            "exito": bool(exito),
            "error_detalle": None,
            "meta": meta or {},
        }
        try:
            self.supabase.table("notificaciones_push_envio").upsert(
                row, on_conflict="tipo,slot_key,usuario_id,contrato_id"
            ).execute()
        except Exception:
            _log.exception("No se pudo registrar notificaciones_push_envio")

    def enviar_a_usuario(
        self,
        usuario_id: int,
        contrato_id: Optional[int],
        tipo: str,
        slot_key: str,
        title: str,
        email_text: str,
        meta: Optional[dict] = None,
    ) -> int:
        """Envía push a todas las suscripciones activas del usuario. Retorna cantidad exitosa."""
        if not self.configured():
            return 0
        if self._ya_enviado(tipo, slot_key, usuario_id, contrato_id):
            return 0
        subs = self._subscriptions(usuario_id)
        if not subs:
            return 0
        body = push_body_from_email_text(email_text)
        ok_count = 0
        gone_ids: List[int] = []
        for sub in subs:
            res = try_send_web_push(sub, title, body)
            if res is True:
                ok_count += 1
            elif res is False:
                gone_ids.append(int(sub["id"]))
        for sid in gone_ids:
            self._deactivate(sid)
        if ok_count > 0:
            self._registrar_envio(
                tipo,
                slot_key,
                usuario_id,
                contrato_id,
                f"{ok_count} dispositivo(s)",
                True,
                meta={**(meta or {}), "dispositivos": ok_count, "intentos": len(subs)},
            )
        return ok_count

    def enviar_prueba(self, usuario_id: int) -> dict:
        subs = self._subscriptions(usuario_id)
        if not subs:
            return {"enviados": 0, "error": "sin_suscripciones"}
        title = "ClaraCore — Notificación de prueba"
        body = "Web Push configurado correctamente."
        ok = 0
        for sub in subs:
            if try_send_web_push(sub, title, body) is True:
                ok += 1
        return {"enviados": ok, "dispositivos": len(subs)}
