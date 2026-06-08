"""CPM: construcción de nodos agrupador sin fechas manuales."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_service import _duracion_cpm_agrupador, _nodo_cpm_desde_agrupador
from prog_obra_calendar import add_dias_habiles


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_duracion_default_cuando_falta():
    assert _duracion_cpm_agrupador({}) == 1
    assert _duracion_cpm_agrupador({"duracion_dias_habiles": 0}) == 1
    assert _duracion_cpm_agrupador({"duracion_dias_habiles": 5}) == 5


def test_nodo_agrupador_sin_fecha_manual_usa_inicio_version():
    cache = _cache()
    ver_ini = date(2025, 5, 5)
    row = {
        "pk_id": "PK7",
        "capitulo": "03",
        "agrupador_id": 42,
        "fecha_inicio": None,
        "fecha_fin_calculada": None,
        "duracion_dias_habiles": 4,
        "override_manual": False,
    }
    nodo = _nodo_cpm_desde_agrupador(row, ver_ini, 1, cache, add_dias_habiles)
    assert nodo is not None
    assert nodo.es_ancla is False
    assert nodo.fecha_inicio_base == ver_ini
    assert nodo.duracion == 4
    assert nodo.fecha_fin_base >= ver_ini


def test_nodo_agrupador_requiere_inicio_version_si_sin_fecha_manual():
    cache = _cache()
    row = {
        "pk_id": "PK7",
        "capitulo": "03",
        "agrupador_id": 42,
        "duracion_dias_habiles": 3,
        "override_manual": False,
    }
    assert _nodo_cpm_desde_agrupador(row, None, 1, cache, add_dias_habiles) is None


def test_nodo_agrupador_ignora_fecha_cpm_si_no_es_ancla_manual():
    cache = _cache()
    ver_ini = date(2025, 5, 5)
    cpm_fecha = date(2026, 6, 9)
    row = {
        "pk_id": "PK7",
        "capitulo": "03",
        "agrupador_id": 42,
        "fecha_inicio": cpm_fecha.isoformat(),
        "fecha_fin_calculada": cpm_fecha.isoformat(),
        "duracion_dias_habiles": 15,
        "override_manual": False,
    }
    nodo = _nodo_cpm_desde_agrupador(row, ver_ini, 1, cache, add_dias_habiles)
    assert nodo is not None
    assert nodo.fecha_inicio_base == ver_ini
    assert nodo.duracion == 15


def test_nodo_ancla_manual_no_usa_inicio_version():
    cache = _cache()
    manual = date(2025, 6, 1)
    row = {
        "pk_id": "PK7",
        "capitulo": "03",
        "agrupador_id": 42,
        "fecha_inicio": manual.isoformat(),
        "duracion_dias_habiles": 2,
        "override_manual": True,
    }
    nodo = _nodo_cpm_desde_agrupador(row, date(2025, 1, 1), 1, cache, add_dias_habiles)
    assert nodo is not None
    assert nodo.es_ancla is True
    assert nodo.fecha_inicio_base == manual
