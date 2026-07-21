"""Utilidades Web Push."""
from notificaciones_push_send import push_body_from_email_text


def test_push_body_from_email_text():
    text = (
        "Hola Ana,\n\n"
        "En el contrato IDU-1551-2017 hay 3 registro(s) sin ítem.\n\n"
        "https://app.claracore.co\n"
    )
    body = push_body_from_email_text(text)
    assert "IDU-1551-2017" in body
    assert "https://" not in body
    assert not body.lower().startswith("hola")
