"""Telemetría App Insights: enriquecimiento de usuario autenticado."""
from unittest.mock import MagicMock, patch

import application_insights as ai


def test_enrich_sets_enduser_id_and_email():
    span = MagicMock()
    span.is_recording.return_value = True
    with patch("opentelemetry.trace.get_current_span", return_value=span):
        with patch.object(ai, "_enduser_id_attribute", return_value="enduser.id"):
            ai.enrich_authenticated_user_telemetry("42", "dev@claracore.co")
    calls = {c[0][0]: c[0][1] for c in span.set_attribute.call_args_list}
    assert calls.get("enduser.id") == "42"
    assert calls.get("user.email") == "dev@claracore.co"


def test_enrich_skips_empty():
    span = MagicMock()
    with patch("opentelemetry.trace.get_current_span", return_value=span):
        ai.enrich_authenticated_user_telemetry("", "")
    span.set_attribute.assert_not_called()
