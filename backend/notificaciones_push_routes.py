"""Suscripciones Web Push y prueba de envío."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from main import get_current_user

router = APIRouter(tags=["notificaciones-push"])


class PushSubscribeBody(BaseModel):
    endpoint: str = Field(..., min_length=8, max_length=2048)
    keys: dict = Field(...)
    user_agent: Optional[str] = Field(default=None, max_length=512)


class PushUnsubscribeBody(BaseModel):
    endpoint: str = Field(..., min_length=8, max_length=2048)


@router.get("/notificaciones/push/config")
def push_config_public():
    from notificaciones_push_send import vapid_configured, vapid_public_key

    return {
        "enabled": vapid_configured(),
        "publicKey": vapid_public_key() if vapid_configured() else None,
    }


@router.post("/notificaciones/push/subscribe")
def push_subscribe(body: PushSubscribeBody, current_user=Depends(get_current_user)):
    import main as m
    from notificaciones_push_send import vapid_configured

    if not vapid_configured():
        raise HTTPException(status_code=503, detail="Web Push no configurado en el servidor")
    uid = int(current_user["sub"])
    if not m._usuario_puede_suscribirse_push(uid):
        raise HTTPException(status_code=403, detail="Sin permiso para suscribirse a notificaciones push")
    p256dh = (body.keys.get("p256dh") or body.keys.get("p256Dh") or "").strip()
    auth = (body.keys.get("auth") or "").strip()
    endpoint = body.endpoint.strip()
    if not endpoint or not p256dh or not auth:
        raise HTTPException(status_code=400, detail="Suscripción push incompleta")
    row = {
        "usuario_id": uid,
        "endpoint": endpoint,
        "p256dh": p256dh,
        "auth_key": auth,
        "user_agent": (body.user_agent or "")[:512] or None,
        "activo": True,
    }
    try:
        m.supabase.table("push_subscriptions").upsert(row, on_conflict="endpoint").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo guardar suscripción: {exc}") from exc
    return {"ok": True}


@router.delete("/notificaciones/push/unsubscribe")
def push_unsubscribe(body: PushUnsubscribeBody, current_user=Depends(get_current_user)):
    import main as m

    uid = int(current_user["sub"])
    endpoint = body.endpoint.strip()
    try:
        m.supabase.table("push_subscriptions").update({"activo": False}).eq(
            "endpoint", endpoint
        ).eq("usuario_id", uid).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)[:200]) from exc
    return {"ok": True}


@router.post("/notificaciones/push/test")
def push_test(current_user=Depends(get_current_user)):
    """Envía notificación de prueba a las suscripciones del usuario autenticado."""
    import main as m
    from notificaciones_push_service import NotificacionesPushSender
    from notificaciones_push_send import vapid_configured

    if not vapid_configured():
        raise HTTPException(status_code=503, detail="Web Push no configurado")
    uid = int(current_user["sub"])
    sender = NotificacionesPushSender(m.supabase)
    result = sender.enviar_prueba(uid)
    if result.get("enviados", 0) <= 0:
        raise HTTPException(
            status_code=400,
            detail=result.get("error") or "No se pudo enviar la prueba",
        )
    return result
