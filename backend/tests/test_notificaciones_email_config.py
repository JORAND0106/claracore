"""Horarios de notificaciones email (America/Bogota)."""
from datetime import datetime

import pytz

from notificaciones_email_config import TZ_BOGOTA, temp_test_admin_jobs_due_now
from notificaciones_email_service import is_weekday_bogota, jobs_due_now

def test_weekday_bogota():
    # 2026-07-20 lunes
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 20, 10, 0))
    assert is_weekday_bogota(dt) is True


def test_weekend_skipped():
    # 2026-07-18 sábado
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 18, 10, 45))
    assert is_weekday_bogota(dt) is False
    assert jobs_due_now(dt) == []


def test_informe_job_at_1045():
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 20, 10, 46))
    due = jobs_due_now(dt)
    assert any(j.job_type == "informe_no_copiado" and j.slot_key == "1030" for j in due)


def test_temp_prueba_sabado_2332_bogota():
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 18, 23, 35))
    due = temp_test_admin_jobs_due_now(dt)
    assert len(due) == 1
    assert due[0].job_type == "admin_resumen"
    assert due[0].slot_key == "prueba_temp"


def test_temp_prueba_ventana_hasta_2340():
    dt_in = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 18, 23, 32))
    dt_out = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 18, 23, 40))
    assert len(temp_test_admin_jobs_due_now(dt_in)) == 1
    assert temp_test_admin_jobs_due_now(dt_out) == []


def test_temp_prueba_no_dispara_otro_dia():
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 19, 23, 24))
    assert temp_test_admin_jobs_due_now(dt) == []


def test_temp_prueba_no_dispara_fuera_ventana():
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 18, 23, 10))
    assert temp_test_admin_jobs_due_now(dt) == []
