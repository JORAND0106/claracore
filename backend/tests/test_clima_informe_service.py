"""Informe de clima (Inicio) — validación, etiquetas WMO y Excel institucional."""
from __future__ import annotations

from datetime import date, timedelta
from io import BytesIO

import pytest
from openpyxl import load_workbook

import clima_informe_service as cis
from clima_informe_service import (
    CLIMA_INFORME_FORMATO,
    ClimaInformeError,
    construir_xlsx,
    estado_clima_label,
    fmt_fecha_con_dia,
    validar_rango,
)


def test_formato_calidad():
    assert CLIMA_INFORME_FORMATO["codigo"] == "CC-INI-CLIMA-001"
    assert CLIMA_INFORME_FORMATO["version"] == "1.0"
    assert "clima" in CLIMA_INFORME_FORMATO["nombre"].lower()


def test_estado_clima_palabras_claras():
    assert estado_clima_label(0) == "Soleado"
    assert estado_clima_label(2) == "Parcialmente nublado"
    assert estado_clima_label(3) == "Nublado"
    assert "Lluvioso" in estado_clima_label(63)
    assert estado_clima_label(95) == "Tormenta"
    assert estado_clima_label(None) == "Sin dato"


def test_fmt_fecha_incluye_dia_semana():
    # 2026-11-05 fue jueves
    s = fmt_fecha_con_dia(date(2026, 11, 5))
    assert "05/11/2026" in s
    assert "jueves" in s


def test_validar_rango_rechaza_futuro(monkeypatch):
    hoy = date(2026, 11, 6)
    monkeypatch.setattr(cis, "_hoy_bogota", lambda: hoy)
    with pytest.raises(ClimaInformeError) as ei:
        validar_rango("2026-11-01", "2026-11-10")
    assert "futur" in str(ei.value).lower() or "hoy" in str(ei.value).lower()


def test_validar_rango_ok(monkeypatch):
    hoy = date(2026, 11, 6)
    monkeypatch.setattr(cis, "_hoy_bogota", lambda: hoy)
    d0, d1 = validar_rango("2026-11-01", "2026-11-05")
    assert d0 == date(2026, 11, 1)
    assert d1 == date(2026, 11, 5)


def test_validar_rango_invertido(monkeypatch):
    hoy = date(2026, 11, 6)
    monkeypatch.setattr(cis, "_hoy_bogota", lambda: hoy)
    with pytest.raises(ClimaInformeError):
        validar_rango("2026-11-05", "2026-11-01")


def test_construir_xlsx_encabezado_tabla_total_y_pie():
    filas = [
        {"fecha": "2026-11-01", "estado": "Soleado", "horas_lluvia": 0},
        {"fecha": "2026-11-02", "estado": "Lluvioso", "horas_lluvia": 3.5},
        {"fecha": "2026-11-03", "estado": "Tormenta", "horas_lluvia": 2},
    ]
    data, fname = construir_xlsx(
        contrato={
            "id": 7,
            "numero": "CT-100",
            "objeto": "Mejoramiento vial",
            "logo_contratista": "",
        },
        lat=4.71100,
        lng=-74.07210,
        desde=date(2026, 11, 1),
        hasta=date(2026, 11, 3),
        filas=filas,
    )
    assert fname.startswith("informe_clima_CT-100_")
    assert fname.endswith(".xlsx")
    wb = load_workbook(BytesIO(data))
    ws = wb.active
    assert "INFORME DE CLIMA" in str(ws.cell(1, 2).value)
    assert "CC-INI-CLIMA-001" in str(ws.cell(1, 3).value)
    assert ws.cell(2, 2).value == "CT-100"
    # Encabezados de tabla
    texts = [str(ws.cell(r, c).value or "") for r in range(1, 20) for c in range(1, 4)]
    assert any("Fecha" == t for t in texts)
    assert any("Estado del clima" == t for t in texts)
    assert any("Horas de lluvia" == t for t in texts)
    assert any("Total horas de lluvia" in t for t in texts)
    assert any("Open-Meteo" in t for t in texts)
    # Total 5.5
    assert any(ws.cell(r, 3).value == 5.5 for r in range(1, 25))


def test_resolver_coords_sin_plano(monkeypatch):
    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type(
                "R",
                (),
                {
                    "data": [
                        {
                            "id": 1,
                            "numero": "X",
                            "objeto": "Y",
                            "logo_contratista": "",
                            "centro_lat": None,
                            "centro_lng": None,
                            "plano_geojson": None,
                        }
                    ]
                },
            )()

    class _Sb:
        def table(self, _n):
            return _Q()

    with pytest.raises(ClimaInformeError) as ei:
        cis.resolver_coords_obra(_Sb(), 1)
    assert "plano" in str(ei.value).lower()


def test_fetch_completa_dias_faltantes(monkeypatch):
    import sys
    import types

    hoy = date(2026, 11, 6)
    monkeypatch.setattr(cis, "_hoy_bogota", lambda: hoy)

    class FakeResp:
        status_code = 200

        def json(self):
            return {
                "daily": {
                    "time": ["2026-11-01", "2026-11-03"],
                    "weather_code": [0, 63],
                    "precipitation_hours": [0, 4],
                }
            }

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, *_a, **_k):
            return FakeResp()

    fake_httpx = types.ModuleType("httpx")
    fake_httpx.Timeout = lambda *a, **k: None
    fake_httpx.Client = FakeClient
    monkeypatch.setitem(sys.modules, "httpx", fake_httpx)

    rows = cis._fetch_daily_open_meteo(
        4.7, -74.0, date(2026, 11, 1), date(2026, 11, 3)
    )
    assert len(rows) == 3
    assert rows[0]["estado"] == "Soleado"
    assert rows[1]["estado"] == "Sin dato"  # día faltante en respuesta
    assert rows[2]["horas_lluvia"] == 4.0
