"""Telemetría App Insights: enriquecimiento de usuario autenticado."""
import os
from unittest.mock import MagicMock, patch

import application_insights as ai


def test_enrich_sets_enduser_id_and_email():
    span = MagicMock()
    span.is_recording.return_value = True
    with patch("opentelemetry.trace.get_current_span", return_value=span):
        with patch.object(ai, "_enduser_id_attribute", return_value="enduser.id"):
            with patch.object(ai, "_enduser_pseudo_id_attribute", return_value="enduser.pseudo.id"):
                ai.enrich_authenticated_user_telemetry("42", "dev@claracore.co")
    calls = {c[0][0]: c[0][1] for c in span.set_attribute.call_args_list}
    assert calls.get("enduser.id") == "42"
    assert calls.get("enduser.pseudo.id") == "42"
    assert calls.get("user.email") == "dev@claracore.co"


def test_apply_user_attributes_on_explicit_span():
    span = MagicMock()
    span.is_recording.return_value = True
    ai._apply_user_attributes_to_span(span, "7", "u@test.com")
    calls = {c[0][0]: c[0][1] for c in span.set_attribute.call_args_list}
    assert calls.get("enduser.id") == "7"
    assert calls.get("enduser.pseudo.id") == "7"
    assert calls.get("user.email") == "u@test.com"


def test_enrich_skips_empty():
    span = MagicMock()
    with patch("opentelemetry.trace.get_current_span", return_value=span):
        ai.enrich_authenticated_user_telemetry("", "")
    span.set_attribute.assert_not_called()


def test_register_telemetry_user_middleware_registers_on_app():
    app = MagicMock()
    with patch.dict(os.environ, {"SECRET_KEY": "test-secret", "ALGORITHM": "HS256"}):
        ai.register_telemetry_user_middleware(app)
    app.middleware.assert_called_once_with("http")


def test_schedule_fastapi_instrumentation_registers_startup():
    app = MagicMock()
    ai._schedule_fastapi_instrumentation(app)
    app.on_event.assert_called_once_with("startup")
