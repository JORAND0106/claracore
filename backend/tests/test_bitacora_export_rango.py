"""Tests exportación consolidada de Bitácora por rango."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest

import bitacora_export_rango as exp


def test_parse_rango_ok():
    d0, d1 = exp._parse_rango("2025-08-01", "2025-08-15")
    assert d0 == date(2025, 8, 1)
    assert d1 == date(2025, 8, 15)


def test_parse_rango_invertido():
    with pytest.raises(ValueError, match="posterior"):
        exp._parse_rango("2025-08-15", "2025-08-01")


def test_parse_rango_max_dias():
    with pytest.raises(ValueError, match="120"):
        exp._parse_rango("2025-01-01", "2025-06-01")


def test_markdown_bloque_basico():
    diario = {
        "fecha": "2025-08-26",
        "tramo": "1",
        "estado": "abierto",
        "hora_inicio_labores": "07:00:00",
        "clima_descripcion": "Nublado",
        "clima_temp_c": 18.5,
        "created_by_nombre": "Ana",
        "personal": [{"cargo": "Oficial", "cantidad": 3}],
        "asistencia_colaboradores": [],
        "equipos_uso": [{"equipo_nombre": "Retro", "operador": "Luis", "cantidad": 1}],
        "materiales": [{"movimiento": "entrada", "tipo_material": "Arena", "cantidad": 10}],
        "cuerpo_html": "<p>Observación de prueba</p>",
        "imagenes": [{"pie": "Foto A", "blob_path": "a/b.jpg"}],
        "eventos": [{
            "evento_tipo": "reporte_actividades",
            "cuerpo_html": "<p>Avance</p>",
            "evento_detalle": {
                "actividades": [{"actividad": "Excavar", "cantidad": "12", "unidad": "m3"}],
            },
        }],
    }
    md = exp._bloque_md_diario(diario)
    assert "## 2025-08-26" in md
    assert "Oficial" in md
    assert "Retro" in md
    assert "Arena" in md
    assert "Observación de prueba" in md
    assert "Excavar" in md
    assert "Foto A" in md


def test_generar_markdown_rango_vacio():
    with patch.object(exp, "list_diarios_rango", return_value=[]):
        with pytest.raises(ValueError, match="No hay Reportes"):
            exp.generar_markdown_bitacora_rango(MagicMock(), 1, "2025-08-01", "2025-08-05")


def test_generar_markdown_rango_ok():
    diarios = [{
        "id": 1,
        "fecha": "2025-08-26",
        "tramo": None,
        "estado": "cerrado",
        "personal": [],
        "eventos": [],
        "imagenes": [],
    }]
    with patch.object(exp, "list_diarios_rango", return_value=diarios):
        md = exp.generar_markdown_bitacora_rango(MagicMock(), 9, "2025-08-26", "2025-08-26")
    assert "# Bitácora consolidada" in md
    assert "Contrato ID:** 9" in md
    assert "2025-08-26" in md


def test_exportar_formato_invalido():
    with pytest.raises(ValueError, match="Formato"):
        exp.exportar_bitacora_rango(MagicMock(), 1, "2025-08-01", "2025-08-02", formato="xls")


def test_exportar_md_bytes():
    diarios = [{
        "id": 2,
        "fecha": "2025-08-10",
        "tramo": "A",
        "estado": "abierto",
        "personal": [],
        "eventos": [],
        "imagenes": [],
    }]
    with patch.object(exp, "list_diarios_rango", return_value=diarios):
        data, media, name = exp.exportar_bitacora_rango(
            MagicMock(), 3, "2025-08-10", "2025-08-12", formato="md",
        )
    assert media.startswith("text/markdown")
    assert name.endswith(".md")
    assert b"Bit" in data or "Bitácora".encode("utf-8") in data


def test_exportar_docx_si_disponible():
    pytest.importorskip("docx")
    diarios = [{
        "id": 2,
        "fecha": "2025-08-10",
        "tramo": "A",
        "estado": "abierto",
        "personal": [{"cargo": "Ayudante", "cantidad": 2}],
        "eventos": [],
        "imagenes": [],
        "cuerpo_html": "<p>Nota</p>",
    }]
    with patch.object(exp, "list_diarios_rango", return_value=diarios):
        data, media, name = exp.exportar_bitacora_rango(
            MagicMock(), 3, "2025-08-10", "2025-08-12", formato="docx",
        )
    assert "wordprocessingml" in media
    assert name.endswith(".docx")
    assert data[:2] == b"PK"


def test_atrasado_normal_coexiste_con_export():
    """Sanity: helpers de rango no alteran la regla de atrasados."""
    import bitacora_service as svc
    from datetime import datetime, timedelta, timezone

    hoy = svc.hoy_bogota()
    vieja = hoy - timedelta(days=15)
    created = datetime(hoy.year, hoy.month, hoy.day, 8, 0, tzinfo=svc.BOGOTA).astimezone(
        timezone.utc
    ).isoformat()
    entrada = {
        "tipo": "diario",
        "estado": "abierto",
        "fecha": vieja.isoformat(),
        "created_at": created,
    }
    assert svc.es_reporte_atrasado(entrada) is True
    assert svc.momento_cierre_efectivo(entrada).date() == hoy
