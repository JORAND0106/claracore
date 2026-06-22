"""Azure Application Insights (OpenTelemetry) para el backend ClaraCore."""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

_log = logging.getLogger("claracore.appinsights")

_configured = False


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
