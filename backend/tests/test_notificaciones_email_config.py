"""Horarios de notificaciones email (America/Bogota)."""
from datetime import datetime

import pytz

from notificaciones_email_config import TZ_BOGOTA
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


def test_admin_resumen_manana_0900():
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 7, 20, 9, 2))
    due = jobs_due_now(dt)
    assert any(j.job_type == "admin_resumen" and j.slot_key == "manana" for j in due)
