"""Endpoint interno para cron de notificaciones por correo."""

from __future__ import annotations

import os
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request

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
    Dispara jobs de correo y Web Push cuya ventana horaria coincide con ahora (America/Bogota, lun–vie).
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


# ---------------------------------------------------------------------------
# TEMPORAL — prueba bajo demanda del correo resumen jornada.
# Eliminar _jwt_user_from_request, _resolver_destinatario_prueba_temp,
# temp_prueba_resumen_jornada y run_admin_resumen_prueba_temp tras validar.
# ---------------------------------------------------------------------------


def _jwt_user_from_request(request: Request) -> Optional[dict]:
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return None
    import main as m
    from jose import JWTError, jwt

    try:
        return jwt.decode(auth[7:].strip(), m.SECRET_KEY, algorithms=[m.ALGORITHM])
    except JWTError:
        return None


def _resolver_destinatario_prueba_temp(
    *,
    email_param: str | None,
    x_cron_secret: str | None,
    current_user: Optional[dict],
) -> tuple[str, str]:
    """JWT desarrollador → su correo; X-Cron-Secret → email explícito."""
    from notificaciones_email_service import _usuario_display_name

    if _cron_secret_ok(x_cron_secret):
        dest = (email_param or "").strip()
        if not dest:
            raise HTTPException(
                status_code=422,
                detail="Indique el parámetro email= con X-Cron-Secret",
            )
        return dest, "Usuario prueba"

    if current_user:
        import main as m

        if not m._es_desarrollador(current_user):
            raise HTTPException(
                status_code=403,
                detail="Solo desarrollador puede probar el correo de resumen",
            )
        try:
            uid = int(current_user.get("sub"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Token inválido")
        urows = (
            m.supabase.table("usuarios")
            .select("email, nombre, apellidos")
            .eq("id", uid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not urows:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        dest = (urows[0].get("email") or "").strip()
        if not dest:
            raise HTTPException(status_code=422, detail="Su usuario no tiene correo configurado")
        return dest, _usuario_display_name(urows[0])

    raise HTTPException(
        status_code=403,
        detail="Requiere Authorization Bearer (desarrollador) o X-Cron-Secret",
    )


@router.post("/internal/temp/notificaciones-email/prueba-resumen-jornada")
def temp_prueba_resumen_jornada(
    request: Request,
    contrato_id: int = Query(..., description="ID del contrato a incluir en el correo"),
    periodo: Literal["manana", "tarde"] = Query(
        ...,
        description="manana = inicio de jornada (9:00); tarde = fin de jornada (18:00)",
    ),
    email: str | None = Query(
        None,
        description="Correo destino; obligatorio si usa X-Cron-Secret (ignorado con JWT)",
    ),
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
):
    """
    TEMPORAL — dispara un envío real del correo de resumen jornada rediseñado.

    Contenido idéntico al envío programado (matriz, riesgo, Ppto vs Cobro).
    Solo envía al correo del solicitante, no a Contratista Gerencial ni Desarrolladores.

    Auth: JWT de desarrollador (correo del usuario) o X-Cron-Secret + email=.
    """
    import main as m
    from notificaciones_email_service import build_runner_from_main

    current_user = _jwt_user_from_request(request)
    dest_email, dest_nombre = _resolver_destinatario_prueba_temp(
        email_param=email,
        x_cron_secret=x_cron_secret,
        current_user=current_user,
    )
    runner = build_runner_from_main(m)
    try:
        return runner.run_admin_resumen_prueba_temp(
            int(contrato_id),
            periodo,
            dest_email,
            dest_nombre,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
