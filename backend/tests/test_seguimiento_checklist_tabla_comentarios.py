"""Normalización de tabla y comentarios por sub-ítem en checklist de tareas."""
from seguimiento_service import _normalizar_checklist_tarea


def test_normaliza_tabla_y_comentarios_subitem():
    out = _normalizar_checklist_tarea([{
        "id": "c1",
        "texto": "Sub",
        "estado_gestion": "abierto",
        "tabla": {
            "rows": 2,
            "cols": 2,
            "cells": [["a", "b"], ["c"]],
        },
        "comentarios": [
            {"id": "cm1", "mensaje": "Hola", "autor_nombre": "Ana", "autor_id": 7},
            {"mensaje": "  ", "autor_nombre": "X"},  # vacío → omitido
            {"mensaje": "Segundo", "autor": "Luis"},
        ],
    }])
    assert len(out) == 1
    it = out[0]
    assert it["tabla"]["rows"] == 2
    assert it["tabla"]["cols"] == 2
    assert it["tabla"]["cells"] == [["a", "b"], ["c", ""]]
    assert len(it["comentarios"]) == 2
    assert it["comentarios"][0]["mensaje"] == "Hola"
    assert it["comentarios"][0]["autor_id"] == 7
    assert it["comentarios"][1]["autor_nombre"] == "Luis"


def test_tabla_invalida_queda_null():
    out = _normalizar_checklist_tarea([{
        "texto": "Sin tabla",
        "tabla": {"rows": 2},
    }])
    assert out[0]["tabla"] is None
    assert out[0]["comentarios"] == []
