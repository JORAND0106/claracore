"""Correo al quedar vencido un compromiso / actividad del Plan."""
from __future__ import annotations

from seguimiento_vencimiento_email import JOB_TIPO, enviar_email_vencida


def test_job_tipo_vencimiento():
    assert JOB_TIPO == "seguimiento_vencimiento"


def test_enviar_email_vencida_sin_smtp(monkeypatch):
    monkeypatch.setattr(
        "seguimiento_asignacion_email._contacto_smtp_configured",
        lambda: False,
    )
    out = enviar_email_vencida(
        None,
        item={
            "id": 1,
            "titulo": "Entregar planos",
            "origen": "plan_actividad",
            "fecha_vencimiento": "2026-10-01",
            "solicitante_id": 3,
            "asignado_a_id": 4,
        },
    )
    assert out.get("ok") is False
    assert out.get("reason") == "smtp"


def test_enviar_email_vencida_a_solicitante_y_asignados(monkeypatch):
    sent = []
    registros = []

    class FakeSmtp:
        def __init__(self, *_a, **_k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

        def starttls(self):
            return None

        def login(self, *_a):
            return None

        def send_message(self, msg):
            sent.append(msg)

    users = {
        3: {"id": 3, "nombre": "Sol", "apellidos": "A", "email": "sol@ex.com", "activo": True, "estado": "activo"},
        4: {"id": 4, "nombre": "Asig", "apellidos": "B", "email": "asig@ex.com", "activo": True, "estado": "activo"},
        5: {"id": 5, "nombre": "Otro", "apellidos": "C", "email": "otro@ex.com", "activo": True, "estado": "activo"},
    }

    monkeypatch.setattr(
        "seguimiento_asignacion_email._contacto_smtp_configured",
        lambda: True,
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._smtp_settings_contacto",
        lambda: {
            "host": "localhost",
            "port": 25,
            "use_tls": False,
            "user": "",
            "password": "",
            "from": "contactenos@claracore.co",
        },
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._load_usuario",
        lambda _sb, uid: users.get(int(uid)),
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._usuario_elegible",
        lambda u: bool(u and u.get("email")),
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._nombre_usuario_row",
        lambda u: f"{u.get('nombre')} {u.get('apellidos')}".strip() if u else "",
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._firma_html",
        lambda: "<p>firma</p>",
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._fmt_fecha_es",
        lambda d: "01/10/2026" if d else "",
    )
    monkeypatch.setattr(
        "seguimiento_asignacion_email._registrar_envio",
        lambda *_a, **kw: registros.append(kw) or True,
    )
    monkeypatch.setattr("smtplib.SMTP", FakeSmtp)

    out = enviar_email_vencida(
        None,
        item={
            "id": 99,
            "titulo": "Entregar planos",
            "origen": "plan_actividad",
            "fecha_fin": "2026-10-01",
            "solicitante_id": 3,
            "asignado_a_id": 4,
            "campos_libres": {
                "asignaciones": [{"usuario_id": 5}],
            },
        },
    )
    assert out.get("ok") is True
    assert out.get("enviados") == 3
    assert len(sent) == 3
    assert all(m["From"] == "contactenos@claracore.co" for m in sent)
    dests = {m["To"] for m in sent}
    assert dests == {"sol@ex.com", "asig@ex.com", "otro@ex.com"}
    assert any("Vencida" in (m["Subject"] or "") or "vencid" in (m["Subject"] or "").lower() for m in sent)
