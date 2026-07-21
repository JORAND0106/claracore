"""Endpoint temporal de prueba — resumen jornada bajo demanda."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from notificaciones_email_service import NotificacionesEmailRunner
from notificaciones_email_routes import _resolver_destinatario_prueba_temp


def test_resolver_destinatario_cron_requiere_email(monkeypatch):
    monkeypatch.setattr(
        "notificaciones_email_routes._cron_secret_ok",
        lambda s: s == "ok",
    )
    with pytest.raises(HTTPException) as exc:
        _resolver_destinatario_prueba_temp(
            email_param=None,
            x_cron_secret="ok",
            current_user=None,
        )
    assert exc.value.status_code == 422


def test_resolver_destinatario_cron_con_email(monkeypatch):
    monkeypatch.setattr(
        "notificaciones_email_routes._cron_secret_ok",
        lambda s: s == "ok",
    )
    email, nombre = _resolver_destinatario_prueba_temp(
        email_param=" tester@example.com ",
        x_cron_secret="ok",
        current_user=None,
    )
    assert email == "tester@example.com"
    assert nombre == "Usuario prueba"


def test_run_admin_resumen_prueba_temp_envia_solo_destino(runner, monkeypatch):
    r, sb, sent = runner
    out = r.run_admin_resumen_prueba_temp(2, "manana", "dev@test.local", "Dev Test")
    assert out["temp_prueba"] is True
    assert out["contrato_id"] == 2
    assert out["periodo"] == "manana"
    assert out["destinatario"] == "dev@test.local"
    assert out["enviado"] is True
    assert len(sent) == 1
    assert sent[0][0] == "dev@test.local"
    assert "inicio de jornada" in sent[0][1]


def test_run_admin_resumen_prueba_temp_contrato_inexistente(runner, monkeypatch):
    r, sb, sent = runner

    def _fail(cid):
        raise LookupError("contrato_no_encontrado")

    monkeypatch.setattr(r, "_admin_resumen_cargar_contrato", _fail)
    with pytest.raises(LookupError):
        r.run_admin_resumen_prueba_temp(9999, "tarde", "dev@test.local", "Dev")


@pytest.fixture
def runner(monkeypatch):
    from tests.test_notificaciones_email_multicontrato import _FakeSupabase, _supabase_execute

    sb = _FakeSupabase()

    _matriz_stub = {
        "acta_rpo": 10,
        "niveles_activos": [1, 2],
        "nivel_maximo": 2,
        "niveles": [],
        "obra_ejecutada_directo_sin_aiu": {},
        "ensayos_sondeos_directo_sin_iva": {},
    }
    _cap_stub = {
        "capitulos_aiu": [],
        "totales_aiu": {"claracore": 0, "cobrado": 0, "delta": 0},
        "capitulos_iva": [],
        "totales_iva": {"claracore": 0, "cobrado": 0, "delta": 0},
    }

    r = NotificacionesEmailRunner(
        sb,
        _supabase_execute,
        permiso_reporte_cantidades_user_id=lambda *a: False,
        nivel_validacion_usuario=lambda uid: None,
        niveles_activos_contrato=lambda cid: [1, 2],
        acta_rpo_vigente_row=lambda cid: {"id": 1},
        es_desarrollador_user_id=lambda uid: False,
        destinatarios_resumen_jornada=lambda cid: [],
        fetch_matriz_validacion_email=lambda cid: _matriz_stub,
        fetch_capitulos_financiero_email=lambda cid: _cap_stub,
        ids_cargo_por_nombre=lambda n: [],
        usuarios_activos_por_cargos=lambda ids: [],
        usuario_vinculado_contrato=lambda uid, cid: False,
    )

    sent: list = []

    def _fake_send(to, subj, txt, html):
        sent.append((to, subj))
        return True

    monkeypatch.setattr(
        "notificaciones_email_service.try_send_notification_email",
        _fake_send,
    )
    monkeypatch.setattr("notificaciones_email_service.smtp_configured", lambda: True)
    return r, sb, sent
