"""Endpoint temporal de prueba — resumen jornada bajo demanda."""
from __future__ import annotations

from datetime import datetime

import pytest
import pytz
from fastapi import HTTPException

from notificaciones_email_config import TZ_BOGOTA
from notificaciones_email_service import NotificacionesEmailRunner
from notificaciones_email_routes import _destinatario_prueba_temp_desarrollador


def test_destinatario_requiere_jwt():
    with pytest.raises(HTTPException) as exc:
        _destinatario_prueba_temp_desarrollador(None)
    assert exc.value.status_code == 403


def test_destinatario_rechaza_no_desarrollador(monkeypatch):
    monkeypatch.setattr(
        "main._es_desarrollador",
        lambda u: False,
    )
    with pytest.raises(HTTPException) as exc:
        _destinatario_prueba_temp_desarrollador({"sub": "1"})
    assert exc.value.status_code == 403


def test_destinatario_usa_correo_usuario_autenticado(monkeypatch):
    import main as m

    monkeypatch.setattr(m, "_es_desarrollador", lambda u: True)

    class _Q:
        def select(self, *_):
            return self

        def eq(self, *_):
            return self

        def limit(self, *_):
            return self

        def execute(self):
            class _R:
                data = [{"email": " dev@clara.test ", "nombre": "Dev", "apellidos": "Test"}]

            return _R()

    monkeypatch.setattr(m.supabase, "table", lambda _n: _Q())

    email, nombre = _destinatario_prueba_temp_desarrollador({"sub": "42"})
    assert email == "dev@clara.test"
    assert nombre == "Dev Test"


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


def test_run_admin_resumen_prueba_temp_guarda_y_lee_snapshot(runner, monkeypatch):
    r, sb, sent = runner
    captured_html: list[str] = []
    fecha = "2026-07-21"

    monkeypatch.setattr(
        "notificaciones_email_service._bogota_now",
        lambda: datetime(2026, 7, 21, 10, 0, tzinfo=pytz.timezone(TZ_BOGOTA)),
    )

    def _fake_send(to, subj, txt, html):
        sent.append((to, subj))
        captured_html.append(html)
        return True

    monkeypatch.setattr(
        "notificaciones_email_service.try_send_notification_email",
        _fake_send,
    )

    out = r.run_admin_resumen_prueba_temp(2, "manana", "dev@test.local", "Dev Test")
    assert out["enviado"] is True
    assert (2, fecha) in sb.resumen_snapshots
    assert "Avance durante la jornada" not in captured_html[0]

    captured_html.clear()
    sent.clear()
    out = r.run_admin_resumen_prueba_temp(2, "tarde", "dev@test.local", "Dev Test")
    assert out["enviado"] is True
    assert "Avance durante la jornada" in captured_html[0]
    assert "No hay registro de inicio de jornada" not in captured_html[0]


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
