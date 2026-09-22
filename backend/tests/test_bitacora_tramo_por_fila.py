"""Tests — tramo por fila y merge de diarios multi-tramo."""
from bitacora_service import (
    _merge_diarios_mismo_dia,
    _stamp_tramo_en_filas,
    _validar_tramos_filas_diario,
    _normalizar_materiales,
)
import pytest


def test_stamp_tramo_solo_si_falta():
    rows = _stamp_tramo_en_filas(
        [{"nombre": "A", "tramo": "Norte"}, {"nombre": "B"}],
        "Sur",
    )
    assert rows[0]["tramo"] == "Norte"
    assert rows[1]["tramo"] == "Sur"


def test_merge_diarios_mismo_dia_estampa_y_concatena():
    merged = _merge_diarios_mismo_dia([
        {
            "id": 2,
            "tramo": "B",
            "asistencia_colaboradores": [{"nombre": "Juan"}],
            "materiales": [{"tipo_material": "Grava"}],
            "personal": [{"cargo": "Oficial", "cantidad": 1}],
            "eventos": [{"id": "e2"}],
            "imagenes": [],
            "equipos_uso": [{"equipo_nombre": "Retro"}],
        },
        {
            "id": 1,
            "tramo": "A",
            "asistencia_colaboradores": [{"nombre": "Ana", "tramo": "A"}],
            "materiales": [],
            "personal": [],
            "eventos": [{"id": "e1"}],
            "imagenes": [{"nombre": "f1"}],
            "equipos_uso": [],
        },
    ])
    assert merged["id"] == 1  # keeper = min id
    assert merged["tramo"] is None
    assert merged["_merged_from_ids"] == [1, 2]
    names = [a["nombre"] for a in merged["asistencia_colaboradores"]]
    assert names == ["Ana", "Juan"]
    assert merged["asistencia_colaboradores"][1]["tramo"] == "B"
    assert merged["equipos_uso"][0]["tramo"] == "B"
    assert len(merged["eventos"]) == 2
    assert len(merged["imagenes"]) == 1


def test_validar_tramos_filas_exige():
    with pytest.raises(ValueError, match="Personal"):
        _validar_tramos_filas_diario(
            asistencia=[{"nombre": "X", "tramo": None}],
        )
    with pytest.raises(ValueError, match="Maquinaria"):
        _validar_tramos_filas_diario(
            equipos_uso=[{"equipo_nombre": "Retro", "tramo": ""}],
        )
    with pytest.raises(ValueError, match="Materiales"):
        _validar_tramos_filas_diario(
            materiales=[{"tipo_material": "Grava", "tramo": None}],
        )
    _validar_tramos_filas_diario(
        asistencia=[{"nombre": "X", "tramo": "Norte"}],
        equipos_uso=[{"equipo_nombre": "Retro", "tramo": "Norte"}],
        materiales=[{"tipo_material": "Grava", "tramo": "Norte"}],
    )


def test_normalizar_asistencia_conserva_misma_persona_en_distinto_tramo():
    from bitacora_service import _normalizar_asistencia_colaboradores
    out = _normalizar_asistencia_colaboradores([
        {
            "nombre": "Juan Pérez",
            "documento_numero": "123",
            "rrhh_trabajador_id": 9,
            "cargo": "Oficial",
            "tramo": "Tramo A",
            "estado": "activo",
        },
        {
            "nombre": "Juan Pérez",
            "documento_numero": "123",
            "rrhh_trabajador_id": 9,
            "cargo": "Oficial",
            "tramo": "Tramo B",
            "estado": "activo",
        },
        {
            "nombre": "Juan Pérez",
            "documento_numero": "123",
            "rrhh_trabajador_id": 9,
            "cargo": "Oficial",
            "tramo": "Tramo A",  # duplicado exacto
            "estado": "activo",
        },
    ])
    assert len(out) == 2
    tramos = sorted(r["tramo"] for r in out)
    assert tramos == ["Tramo A", "Tramo B"]
