"""Resumen ejecutivo del PDF de programación de obra."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from prog_obra_curva_s import (
    _aggregate_cronograma_por_capitulo,
    _prog_estado_display,
    build_resumen_ejecutivo_data,
)


def test_prog_estado_display():
    assert _prog_estado_display("borrador") == "Borrador"
    assert _prog_estado_display("en_validacion") == "En validación"
    assert _prog_estado_display("sellada") == "Sellada"


def test_aggregate_cronograma_por_capitulo():
    cronograma = [
        {
            "pk_id": "PK1",
            "capitulos": [
                {
                    "capitulo": "01",
                    "agrupadores": [
                        {"fecha_inicio": "2026-06-01", "fecha_fin": "2026-06-10"},
                        {"fecha_inicio": "2026-06-05", "fecha_fin": "2026-06-15"},
                    ],
                }
            ],
        },
        {
            "pk_id": "PK2",
            "capitulos": [
                {
                    "capitulo": "01",
                    "agrupadores": [
                        {"fecha_inicio": "2026-07-01", "fecha_fin": "2026-07-05"},
                    ],
                },
                {
                    "capitulo": "02",
                    "agrupadores": [
                        {"fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-05"},
                    ],
                },
            ],
        },
    ]
    agg = _aggregate_cronograma_por_capitulo(cronograma)
    assert agg["01"]["agrupadores"] == 3
    assert min(agg["01"]["fechas_ini"]) == "2026-06-01"
    assert max(agg["01"]["fechas_fin"]) == "2026-07-05"
    assert agg["02"]["agrupadores"] == 1


@patch("prog_obra_curva_s._fetch_distinct_capitulos_presupuesto")
@patch("prog_obra_service.make_prog_calendar_loader")
def test_build_resumen_ejecutivo_data_cpm_y_desfases(mock_loader, mock_caps):
    mock_caps.return_value = ["01", "02"]
    mock_loader.return_value = lambda _cid, _d0, _d1: []

    cronograma = [
        {
            "pk_id": "PK1",
            "capitulos": [
                {
                    "capitulo": "01",
                    "agrupadores": [
                        {"fecha_inicio": "2026-06-02", "fecha_fin": "2026-06-06"},
                    ],
                },
                {"capitulo": "02", "agrupadores": []},
            ],
        }
    ]
    cpm_export = {
        "resultados": [
            {
                "es_ruta_critica": True,
                "agrupador_label": "2.1 · Excavación",
                "fecha_inicio_temprana": "2026-06-02",
                "fecha_fin_temprana": "2026-06-06",
                "holgura_total": 0,
            },
            {
                "es_ruta_critica": False,
                "agrupador_label": "3.1 · Pavimento",
                "fecha_inicio_temprana": "2026-06-01",
                "fecha_fin_temprana": "2026-06-20",
                "holgura_total": 5,
            },
        ]
    }
    prog_meta = {
        "numero_version": 2,
        "tipo": "vigente",
        "estado": "borrador",
        "fecha_inicio": "2026-06-01",
        "fecha_fin": "2026-06-10",
        "cpm_dirty": False,
    }

    data = build_resumen_ejecutivo_data(
        MagicMock(),
        1,
        version_ppto_id="ppto-1",
        pk_ids={"PK1"},
        cronograma=cronograma,
        cpm_export=cpm_export,
        prog_meta=prog_meta,
    )

    assert data["tiene_cpm"] is True
    assert len(data["criticos"]) == 1
    assert data["criticos"][0]["nombre"] == "2.1 · Excavación"
    assert len(data["desfases"]) == 1
    assert data["desfases"][0]["nombre"] == "3.1 · Pavimento"
    assert data["desfases"][0]["dias_exceso"] >= 1
    caps = {r["capitulo"]: r for r in data["capitulos"]}
    assert caps["01"]["sin_programar"] is False
    assert caps["01"]["num_agrupadores"] == 1
    assert caps["02"]["sin_programar"] is True
    assert data["version"]["cpm_estado"] == "Vigente"
    assert data["version"]["estado"] == "Borrador"


@patch("prog_obra_curva_s._fetch_distinct_capitulos_presupuesto")
@patch("prog_obra_service.make_prog_calendar_loader")
def test_build_resumen_sin_cpm(mock_loader, mock_caps):
    mock_caps.return_value = ["01"]
    mock_loader.return_value = lambda _cid, _d0, _d1: []

    data = build_resumen_ejecutivo_data(
        MagicMock(),
        1,
        cronograma=[],
        cpm_export={"resultados": []},
        prog_meta={"numero_version": 1, "estado": "borrador"},
    )
    assert data["tiene_cpm"] is False
    assert data["criticos"] == []
    assert data["version"]["cpm_estado"] is None
