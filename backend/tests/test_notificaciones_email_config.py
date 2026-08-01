"""Horarios de notificaciones email (America/Bogota)."""
from datetime import datetime

import pytz

from notificaciones_email_config import TZ_BOGOTA, all_scheduled_jobs
from notificaciones_email_service import is_weekday_bogota, jobs_due_now


def test_weekday_bogota():
    # 2026-08-03 lunes
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 3, 10, 0))
    assert is_weekday_bogota(dt) is True


def test_weekend_sin_jobs_operativos():
    # 2026-08-01 sábado 10:45 — sin sin_item / validacion / semanal
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 1, 10, 45))
    assert is_weekday_bogota(dt) is False
    assert jobs_due_now(dt) == []


def test_no_informe_no_copiado_jobs():
    assert not any(j.job_type == "informe_no_copiado" for j in all_scheduled_jobs())


def test_no_admin_resumen_diario_jobs():
    assert not any(j.job_type == "admin_resumen" for j in all_scheduled_jobs())


def test_snapshot_apertura_0900():
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 3, 9, 2))
    due = jobs_due_now(dt)
    assert any(j.job_type == "matriz_snapshot" and j.slot_key == "apertura" for j in due)


def test_snapshot_cierre_1800_incluye_fin_semana():
    # sábado 18:02 — snapshot sí, resto no
    dt = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 1, 18, 2))
    due = jobs_due_now(dt)
    assert any(j.job_type == "matriz_snapshot" and j.slot_key == "cierre" for j in due)
    assert not any(j.job_type == "admin_resumen_semanal" for j in due)


def test_admin_resumen_semanal_solo_lunes_0800():
    lunes = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 3, 8, 2))
    due_lun = jobs_due_now(lunes)
    assert any(j.job_type == "admin_resumen_semanal" and j.slot_key == "lunes_0800" for j in due_lun)

    martes = pytz.timezone(TZ_BOGOTA).localize(datetime(2026, 8, 4, 8, 2))
    due_mar = jobs_due_now(martes)
    assert not any(j.job_type == "admin_resumen_semanal" for j in due_mar)
