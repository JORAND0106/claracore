"""Azure Application Insights (OpenTelemetry) para el backend ClaraCore."""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

_log = logging.getLogger("claracore.appinsights")

_configured = False
_instrumented_app_ids: set[int] = set()


def _enduser_id_attribute() -> str:
    try:
        from opentelemetry.semconv.trace import SpanAttributes

        return SpanAttributes.ENDUSER_ID
    except Exception:
        return "enduser.id"


def _enduser_pseudo_id_attribute() -> str:
    """App Insights mapea enduser.pseudo.id → columna user_Id en requests."""
    try:
        from opentelemetry.semconv._incubating.attributes.enduser_attributes import (
            ENDUSER_PSEUDO_ID,
        )

        return ENDUSER_PSEUDO_ID
    except Exception:
        return "enduser.pseudo.id"


def _apply_user_attributes_to_span(span: Any, user_id: str, email: Optional[str] = None) -> None:
    """Escribe atributos OTel que App Insights expone como user_Id y user_AuthenticatedId."""
    if span is None or not span.is_recording():
        return
    uid = str(user_id or "").strip()
    mail = str(email or "").strip() if email else ""
    if not uid and not mail:
        return
    if uid:
        auth_attr = _enduser_id_attribute()
        pseudo_attr = _enduser_pseudo_id_attribute()
        span.set_attribute(auth_attr, uid)
        if auth_attr != "enduser.id":
            span.set_attribute("enduser.id", uid)
        span.set_attribute(pseudo_attr, uid)
        if pseudo_attr != "enduser.pseudo.id":
            span.set_attribute("enduser.pseudo.id", uid)
    if mail:
        span.set_attribute("user.email", mail)


def enrich_authenticated_user_telemetry(
    user_id: str,
    email: Optional[str] = None,
    span: Any = None,
) -> None:
    """Enriquece el span HTTP con user_Id (pseudo) y user_AuthenticatedId (enduser.id)."""
    try:
        from opentelemetry import trace

        target = span if span is not None else trace.get_current_span()
        _apply_user_attributes_to_span(target, user_id, email)
    except Exception:
        pass


def _actor_from_bearer(auth_header: str, secret: str, algorithm: str) -> tuple[str, Optional[str]]:
    auth = (auth_header or "").strip()
    if not auth.startswith("Bearer "):
        return "", None
    try:
        from jose import JWTError, jwt

        payload = jwt.decode(auth[7:], secret, algorithms=[algorithm])
        uid = str(payload.get("sub") or payload.get("id") or "").strip()
        email = payload.get("email")
        return uid, email
    except Exception:
        return "", None


def _server_request_hook(span: Any, scope: dict) -> None:
    """Hook de FastAPIInstrumentor: enriquece el span servidor al crearse (antes del handler)."""
    if scope.get("type") != "http" or scope.get("method") == "OPTIONS":
        return
    secret = (os.getenv("SECRET_KEY") or "").strip()
    if not secret:
        return
    algorithm = (os.getenv("ALGORITHM") or "HS256").strip()
    raw_headers = scope.get("headers") or []
    auth = ""
    for key, value in raw_headers:
        if key.decode("latin-1").lower() == "authorization":
            auth = value.decode("latin-1")
            break
    uid, email = _actor_from_bearer(auth, secret, algorithm)
    if uid or email:
        _apply_user_attributes_to_span(span, uid, email)


def _instrument_fastapi_app_once(app: Any) -> None:
    """Instrumenta la instancia FastAPI concreta (no el patch global de configure_azure_monitor)."""
    app_id = id(app)
    if app_id in _instrumented_app_ids:
        return
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls="healthz,healthcheck",
            server_request_hook=_server_request_hook,
        )
        _instrumented_app_ids.add(app_id)
        _log.info("FastAPI instrument_app registrado para requests entrantes en App Insights.")
    except Exception as exc:
        _log.warning("No se pudo instrumentar FastAPI (instrument_app): %s", exc)


def _schedule_fastapi_instrumentation(app: Any) -> None:
    """
    Diferir instrument_app al startup: main.py llama setup_application_insights antes
    de registrar routers/middlewares y luego envuelve app en ASGI (_OutermostCorsPreflightASGI).
    El patch global de configure_azure_monitor no cubre una instancia ya creada.
    """
    @app.on_event("startup")
    async def _instrument_fastapi_on_startup() -> None:
        _instrument_fastapi_app_once(app)


def register_telemetry_user_middleware(app: Any) -> None:
    """
    Respaldo si server_request_hook no aplica: enriquece el span HTTP activo antes del handler.
    Escribe enduser.id, enduser.pseudo.id (→ user_Id) y user.email.
    """
    secret = (os.getenv("SECRET_KEY") or "").strip()
    algorithm = (os.getenv("ALGORITHM") or "HS256").strip()
    if not secret:
        _log.info("SECRET_KEY ausente; middleware de telemetría de usuario omitido.")
        return
    try:
        from fastapi import Request
    except ImportError as exc:
        _log.warning("No se pudo registrar middleware de usuario App Insights: %s", exc)
        return

    @app.middleware("http")
    async def telemetry_user_enrichment(request: Request, call_next):
        uid = ""
        email = None
        if request.method != "OPTIONS":
            auth = request.headers.get("authorization") or ""
            uid, email = _actor_from_bearer(auth, secret, algorithm)
            if uid or email:
                enrich_authenticated_user_telemetry(uid, email)
        return await call_next(request)


def setup_application_insights(app: Optional[Any] = None) -> bool:
    """
    Exporta telemetría a Application Insights cuando existe
    APPLICATIONINSIGHTS_CONNECTION_STRING (p. ej. en Azure App Service).
    """
    global _configured
    if _configured:
        return True

    conn = (os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING") or "").strip()
    if not conn:
        _log.info("APPLICATIONINSIGHTS_CONNECTION_STRING no definida; telemetría desactivada.")
        return False

    try:
        from azure.core.settings import settings
        from azure.monitor.opentelemetry import configure_azure_monitor

        configure_azure_monitor(
            connection_string=conn,
            enable_live_metrics=True,
            instrumentation_options={"fastapi": {"enabled": False}},
        )

        # Azure Blob Storage y demás SDKs de Azure (dependencias salientes).
        settings.tracing_implementation = "opentelemetry"

        # Supabase usa httpx; no viene en el distro de azure-monitor-opentelemetry.
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

            HTTPXClientInstrumentor().instrument()
        except Exception as exc:
            _log.warning("No se pudo instrumentar httpx: %s", exc)

        if app is not None:
            _schedule_fastapi_instrumentation(app)
            register_telemetry_user_middleware(app)

        _configured = True
        _log.info("Application Insights configurado.")
        return True
    except Exception as exc:
        _log.warning("Error configurando Application Insights: %s", exc)
        return False
