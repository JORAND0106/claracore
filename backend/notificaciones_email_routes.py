"""Endpoint interno para cron de notificaciones por correo."""

from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException

router = APIRouter(tags=["cron-notificaciones-email"])


def _cron_secret_ok(x_cron_secret: str | None) -> bool:
    expected = (os.getenv("CLARACORE_CRON_SECRET") or "").strip()
    if not expected:
        return False
    return (x_cron_secret or "").strip() == expected


@router.post("/internal/cron/notificaciones-email/run")
def cron_notificaciones_email_run(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    """
    Dispara jobs de correo cuya ventana horaria coincide con ahora (America/Bogota, lun–vie).
    Protegido por CLARACORE_CRON_SECRET. Invocar cada ~5 min (p. ej. pg_cron + pg_net).
    """
    if not _cron_secret_ok(x_cron_secret):
        raise HTTPException(status_code=403, detail="Cron secret inválido o no configurado")
    import main as m
    from notificaciones_email_service import build_runner_from_main

    runner = build_runner_from_main(m)
    return runner.run_due_jobs()


@router.post("/internal/cron/notificaciones-email/run-dev")
def cron_notificaciones_email_run_dev(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    """Igual que /run pero permite forzar en entorno dev con secret (sin bypass fin de semana en query)."""
    if not _cron_secret_ok(x_cron_secret):
        raise HTTPException(status_code=403, detail="Cron secret inválido o no configurado")
    import main as m
    from notificaciones_email_service import build_runner_from_main

    runner = build_runner_from_main(m)
    return runner.run_due_jobs()
