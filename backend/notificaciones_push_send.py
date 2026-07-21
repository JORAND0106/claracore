"""Envío Web Push (VAPID) para notificaciones automáticas ClaraCore."""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

_log = logging.getLogger("claracore.notificaciones_push")

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover
    WebPushException = Exception  # type: ignore
    webpush = None  # type: ignore


def vapid_configured() -> bool:
    return bool(vapid_public_key() and vapid_private_key())


def vapid_public_key() -> str:
    return (os.getenv("CLARACORE_VAPID_PUBLIC_KEY") or "").strip()


def vapid_private_key() -> str:
    return (os.getenv("CLARACORE_VAPID_PRIVATE_KEY") or "").strip()


def vapid_subject() -> str:
    return (
        os.getenv("CLARACORE_VAPID_SUBJECT")
        or os.getenv("CLARACORE_CONTACTO_FROM_EMAIL")
        or "mailto:contactenos@claracore.co"
    ).strip()


def plataforma_url() -> str:
    return (os.getenv("CLARACORE_APP_URL") or "https://app.claracore.co").strip().rstrip("/")


def push_body_from_email_text(text: str) -> str:
    """Primer párrafo útil del cuerpo de correo (sin saludo ni URL)."""
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    body_parts: list[str] = []
    for line in lines:
        low = line.lower()
        if low.startswith("hola "):
            continue
        if low.startswith("http://") or low.startswith("https://"):
            break
        body_parts.append(line)
    body = " ".join(body_parts).strip()
    return (body[:240] + "…") if len(body) > 240 else body


def subscription_info_from_row(row: dict) -> dict:
    return {
        "endpoint": row["endpoint"],
        "keys": {
            "p256dh": row["p256dh"],
            "auth": row["auth_key"],
        },
    }


def _is_subscription_gone(exc: Exception) -> bool:
    if WebPushException is Exception:
        return False
    if not isinstance(exc, WebPushException):
        return False
    code = getattr(getattr(exc, "response", None), "status_code", None)
    return code in (404, 410)


def try_send_web_push(subscription_row: dict, title: str, body: str) -> Optional[bool]:
    """
    Envía push a una suscripción.
    Retorna True si OK, False si fallo, None si VAPID no configurado.
    """
    if not vapid_configured() or webpush is None:
        return None
    endpoint = (subscription_row.get("endpoint") or "").strip()
    if not endpoint:
        return False
    payload = json.dumps(
        {
            "title": (title or "ClaraCore")[:120],
            "body": (body or "")[:240],
            "url": plataforma_url(),
        },
        ensure_ascii=False,
    )
    try:
        webpush(
            subscription_info=subscription_info_from_row(subscription_row),
            data=payload,
            vapid_private_key=vapid_private_key(),
            vapid_claims={"sub": vapid_subject()},
            timeout=20,
        )
        return True
    except Exception as exc:
        if _is_subscription_gone(exc):
            _log.info("Suscripción push expirada: %s", endpoint[:80])
            return False
        _log.warning("Push falló %s: %s", endpoint[:60], str(exc)[:200])
        return False


def subscription_is_gone(exc: Exception) -> bool:
    return _is_subscription_gone(exc)
