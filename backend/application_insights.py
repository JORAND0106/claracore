"""Azure Application Insights (OpenTelemetry) para el backend ClaraCore."""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

_log = logging.getLogger("claracore.appinsights")

_configured = False


def _enduser_id_attribute() -> str:
    try:
        from opentelemetry.semconv.trace import SpanAttributes

        return SpanAttributes.ENDUSER_ID
    except Exception:
        return "enduser.id"


def enrich_authenticated_user_telemetry(user_id: str, email: Optional[str] = None) -> None:
    """Enriquece el span HTTP activo con user_AuthenticatedId y user.email en App Insights."""
    uid = str(user_id or "").strip()
    mail = str(email or "").strip() if email else ""
    if not uid and not mail:
        return
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span is None or not span.is_recording():
            return
        if uid:
            attr = _enduser_id_attribute()
            span.set_attribute(attr, uid)
            if attr != "enduser.id":
                span.set_attribute("enduser.id", uid)
        if mail:
            span.set_attribute("user.email", mail)
    except Exception:
        pass


def register_telemetry_user_middleware(app: Any) -> None:
    """
    Tras validar JWT (Bearer), añade enduser.id → user_AuthenticatedId y user.email.
    Sin token o token inválido: no enriquece (endpoints públicos / anónimos).
    """
    secret = (os.getenv("SECRET_KEY") or "").strip()
    algorithm = (os.getenv("ALGORITHM") or "HS256").strip()
    if not secret:
        _log.info("SECRET_KEY ausente; middleware de telemetría de usuario omitido.")
        return
    try:
        from fastapi import Request
        from jose import JWTError, jwt
    except ImportError as exc:
        _log.warning("No se pudo registrar middleware de usuario App Insights: %s", exc)
        return

    @app.middleware("http")
    async def telemetry_user_enrichment(request: Request, call_next):
        if request.method != "OPTIONS":
            auth = request.headers.get("authorization") or ""
            if auth.startswith("Bearer "):
                try:
                    payload = jwt.decode(auth[7:], secret, algorithms=[algorithm])
                    uid = payload.get("sub") or payload.get("id")
                    email = payload.get("email")
                    if uid or email:
                        enrich_authenticated_user_telemetry(str(uid or ""), email)
                except JWTError:
                    pass
                except Exception:
                    pass
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

        # FastAPI se instrumenta manualmente: main.py importa FastAPI antes de load_dotenv.
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
            instrument_fastapi_app(app)
            register_telemetry_user_middleware(app)

        _configured = True
        _log.info("Application Insights configurado.")
        return True
    except Exception as exc:
        _log.warning("Error configurando Application Insights: %s", exc)
        return False


def instrument_fastapi_app(app: Any) -> None:
    """Peticiones entrantes: duración, código de estado y excepciones no manejadas."""
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls="healthz,healthcheck",
        )
    except Exception as exc:
        _log.warning("No se pudo instrumentar FastAPI: %s", exc)
