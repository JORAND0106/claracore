"""Pruebas del margen de gracia en días hábiles (Seguimiento)."""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from prog_obra_calendar import CalendarioNoHabilesCache
from seguimiento_service import calcular_fecha_limite_gracia

BOGOTA = ZoneInfo("America/Bogota")


def _cache_vacio():
    return CalendarioNoHabilesCache(loader=lambda _cid, _d0, _d1: [])


def test_gracia_dia_habil_siguiente():
    # Vence jueves 2026-07-23 → gracia = viernes 2026-07-24 23:59:59 Bogotá
    limite = calcular_fecha_limite_gracia(1, date(2026, 7, 23), _cache_vacio())
    assert isinstance(limite, datetime)
    assert limite.tzinfo is not None
    local = limite.astimezone(BOGOTA)
    assert local.date() == date(2026, 7, 24)
    assert local.hour == 23 and local.minute == 59


def test_gracia_salta_fin_de_semana():
    # Vence viernes 2026-07-24 → siguiente hábil lunes 2026-07-27
    limite = calcular_fecha_limite_gracia(1, date(2026, 7, 24), _cache_vacio())
    local = limite.astimezone(BOGOTA)
    assert local.date() == date(2026, 7, 27)


def test_gracia_respeta_no_habil_contrato():
    # Vence jueves; viernes marcado no hábil → gracia el lunes
    fest = date(2026, 7, 24)

    def loader(_cid, _d0, _d1):
        return [{"fecha": fest.isoformat(), "tipo": "regional", "contrato_id": 1}]

    cache = CalendarioNoHabilesCache(loader=loader)
    limite = calcular_fecha_limite_gracia(1, date(2026, 7, 23), cache)
    assert limite.astimezone(BOGOTA).date() == date(2026, 7, 27)
