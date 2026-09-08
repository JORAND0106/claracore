"""Kill-switch: envío SMTP de notificaciones desactivado; histórico intacto."""
from datetime import datetime
from unittest.mock import MagicMock

import pytz

from notificaciones_email_config import TZ_BOGOTA
from notificaciones_email_mail import (
    NOTIFICACIONES_EMAIL_ENVIO_ACTIVO,
    email_envio_activo,
    send_notification_email,
    smtp_configured,
    try_send_notification_email,
)
from notificaciones_email_service import jobs_due_now, NotificacionesEmailRunner


def test_kill_switch_envio_desactivado_por_defecto():
    assert NOTIFICACIONES_EMAIL_ENVIO_ACTIVO is False
    assert email_envio_activo() is False


def test_smtp_configured_false_con_kill_switch(monkeypatch):
    monkeypatch.setenv("CLARACORE_CONTACTO_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("CLARACORE_CONTACTO_SMTP_USER", "u")
    monkeypatch.setenv("CLARACORE_CONTACTO_SMTP_PASSWORD", "p")
    assert smtp_configured() is False


def test_try_send_no_abre_smtp_con_kill_switch(monkeypatch):
    called = {"n": 0}

    def _boom(*_a, **_k):
        called["n"] += 1
        raise AssertionError("no debe llamar SMTP real")

    monkeypatch.setattr("notificaciones_email_mail.smtplib.SMTP", _boom)
    monkeypatch.setenv("CLARACORE_CONTACTO_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("CLARACORE_CONTACTO_SMTP_USER", "u")
    monkeypatch.setenv("CLARACORE_CONTACTO_SMTP_PASSWORD", "p")
    assert try_send_notification_email("a@b.co", "Asunto", "txt", "<p>x</p>") is None
    assert send_notification_email("a@b.co", "Asunto", "txt", "<p>x</p>") is False
    assert called["n"] == 0


def test_cron_0900_sigue_programando_matriz_snapshot():
    """Aunque el correo esté off, el schedule conserva snapshot 09:00 (histórico)."""
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 3, 9, 2))
    due = jobs_due_now(dt)
    assert any(j.job_type == "matriz_snapshot" and j.slot_key == "apertura" for j in due)


def test_run_due_jobs_solo_snapshot_cuando_email_off(monkeypatch):
    """Sin push y con kill-switch: solo corre matriz_snapshot (guarda histórico)."""
    sb = MagicMock()
    runner = NotificacionesEmailRunner(
        sb,
        lambda fn: fn(),
        permiso_reporte_cantidades_user_id=lambda *_a, **_k: False,
        nivel_validacion_usuario=lambda *_a, **_k: 0,
        niveles_activos_contrato=lambda *_a, **_k: [1],
        acta_rpo_vigente_row=lambda *_a, **_k: None,
        es_desarrollador_user_id=lambda *_a, **_k: False,
        destinatarios_resumen_jornada=lambda *_a, **_k: [],
        destinatarios_informe_validacion=lambda *_a, **_k: [],
        fetch_matriz_validacion_email=lambda *_a, **_k: {},
        fetch_capitulos_financiero_email=lambda *_a, **_k: {},
        ids_cargo_por_nombre=lambda *_a, **_k: {},
        usuarios_activos_por_cargos=lambda *_a, **_k: [],
        usuario_vinculado_contrato=lambda *_a, **_k: True,
    )
    monkeypatch.setattr(runner._push, "configured", lambda: False)
    monkeypatch.setattr(
        runner,
        "run_matriz_snapshot",
        lambda fecha, periodo, log_key: {
            "contratos_evaluados": 1,
            "snapshots_guardados": 1,
            "periodo": "apertura",
        },
    )
    # 08:02 lunes: normalmente habría sin_item/validacion + no snapshot
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 3, 8, 2))
    out = runner.run_due_jobs(dt)
    # Sin canales: jobs de correo omitidos → skipped si no hay snapshot a esa hora
    assert out.get("skipped") in (
        "envio_email_desactivado_sin_push",
        "sin_canales_configurados",
    ) or out.get("jobs") == []

    # 09:02: snapshot apertura debe ejecutarse
    dt2 = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 3, 9, 2))
    out2 = runner.run_due_jobs(dt2)
    assert out2.get("skipped") is None
    assert any(j.get("job") == "matriz_snapshot" for j in out2.get("jobs") or [])
