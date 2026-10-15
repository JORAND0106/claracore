"""Orden alfabético de colaboradores (grilla e informe RRHH)."""
from __future__ import annotations

from rrhh_estado_documental_informe import _filtrar_trabajadores, _ordenar_trabajadores_informe
from rrhh_service import (
    fold_sort_key,
    sort_key_empresa_luego_nombre,
    sort_key_nombre_colaborador,
)


def test_fold_sort_key_ignora_tildes_y_mayusculas():
    assert fold_sort_key("Ángela") == fold_sort_key("angela")
    assert fold_sort_key("Pérez") == fold_sort_key("perez")
    assert fold_sort_key("  Ana  ") == "ana"
    assert fold_sort_key(None) == ""


def test_sort_key_nombre_colaborador_orden_natural():
    rows = [
        {"id": 3, "nombres": "ángela", "apellidos": "Zapata"},
        {"id": 1, "nombres": "Ana", "apellidos": "López"},
        {"id": 2, "nombres": "ANDRÉS", "apellidos": "Bermúdez"},
        {"id": 4, "nombres": "Beatriz", "apellidos": "Álvarez"},
    ]
    ordered = sorted(rows, key=sort_key_nombre_colaborador)
    assert [r["id"] for r in ordered] == [1, 2, 3, 4]
    # Ana < Andrés < Ángela < Beatriz (sin tilde / case)


def test_sort_key_empresa_luego_nombre():
    rows = [
        {"id": 1, "empresa_nombre": "Zeta SAS", "nombres": "Ana", "apellidos": "A"},
        {"id": 2, "empresa_nombre": "Águila Ltda", "nombres": "Zoe", "apellidos": "Z"},
        {"id": 3, "empresa_nombre": "aguila ltda", "nombres": "Ana", "apellidos": "A"},
        {"id": 4, "empresa_nombre": "Beta", "nombres": "Carlos", "apellidos": "C"},
    ]
    ordered = sorted(rows, key=sort_key_empresa_luego_nombre)
    # Águila/aguila juntos (fold), Ana antes que Zoe; luego Beta; luego Zeta
    assert [r["id"] for r in ordered] == [3, 2, 4, 1]


def test_filtrar_preserva_orden_empresa_nombre_en_todos_los_filtros():
    rows = [
        {
            "id": 10,
            "empresa_nombre": "Beta",
            "nombres": "Zoe",
            "apellidos": "Z",
            "doc_validacion_estado": "aprobado",
        },
        {
            "id": 11,
            "empresa_nombre": "Alpha",
            "nombres": "Ana",
            "apellidos": "A",
            "doc_validacion_estado": "pendiente",
        },
        {
            "id": 12,
            "empresa_nombre": "Alpha",
            "nombres": "Bruno",
            "apellidos": "B",
            "doc_validacion_estado": "aprobado",
        },
        {
            "id": 13,
            "empresa_nombre": "alpha",
            "nombres": "ángela",
            "apellidos": "C",
            "doc_validacion_estado": "rechazado",
        },
    ]
    todos = _filtrar_trabajadores(rows, "todos")
    assert [r["id"] for r in todos] == [11, 13, 12, 10]

    aprob = _filtrar_trabajadores(rows, "aprobado")
    assert [r["id"] for r in aprob] == [12, 10]

    sin = _filtrar_trabajadores(rows, "sin_aprobar")
    assert [r["id"] for r in sin] == [11, 13]


def test_ordenar_trabajadores_informe_vacio():
    assert _ordenar_trabajadores_informe([]) == []
    assert _ordenar_trabajadores_informe(None) == []
