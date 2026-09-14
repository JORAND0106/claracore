"""Regresión del conocimiento de AVI (Clara) en avi_prompt.py.

No llama a Anthropic: valida que el system prompt y los contextos de sesión
contengan los hechos operativos actuales de los módulos críticos.
"""
from __future__ import annotations

import pytest

from avi_prompt import (
    MODULOS_VALIDOS,
    AVI_SYSTEM_PROMPT_STATIC,
    build_avi_system_blocks,
    _normalizar_modulo,
)


@pytest.mark.parametrize(
    "slug",
    ["topografia", "almacen", "admin", "seguimiento", "rrhh", "presupuesto"],
)
def test_modulos_validos_y_bloques(slug: str):
    assert slug in MODULOS_VALIDOS
    blocks = build_avi_system_blocks(slug)
    assert len(blocks) == 2
    assert blocks[0].get("cache_control", {}).get("type") == "ephemeral"
    assert f"modulo_actual: {slug}" in blocks[1]["text"]


def test_aliases_rrhh_bitacora():
    assert _normalizar_modulo("recursos_humanos") == "rrhh"
    assert _normalizar_modulo("bitacora") == "seguimiento"


@pytest.mark.parametrize(
    "slug,question,needles",
    [
        ("rrhh", "registrar colaborador", ["Registrar colaborador", "Documentación"]),
        ("seguimiento", "tres componentes", ["Tareas", "Actas", "Bitácora de Obra"]),
        ("seguimiento", "gracia bitácora", ["D+1"]),
        ("almacen", "pestañas", ["Solicitudes", "Entradas", "Salidas", "Inventario"]),
        ("almacen", "cascada", ["Desarrollador", "cascada"]),
        ("almacen", "umbrales", ["10%", "20%"]),
        ("almacen", "POS", ["POS", "80 mm"]),
        ("topografia", "biblioteca al terminar", ["Terminar", "biblioteca"]),
        ("topografia", "excel", ["Excel", "fórmulas"]),
        ("topografia", "reabrir", ["Desarrollador", "Reabrir"]),
        ("topografia", "formato angular", ["GG.MMSS", "GG°MM'SS.SS\""]),
        ("topografia", "bowditch", ["Bowditch"]),
        ("presupuesto", "crear subcontratista", ["Panel Admin", "Subcontratistas"]),
        ("admin", "catálogo", ["Almacén", "Insumos"]),
    ],
)
def test_conocimiento_representativo(slug: str, question: str, needles: list[str]):
    blocks = build_avi_system_blocks(slug)
    blob = (blocks[0]["text"] + "\n" + blocks[1]["text"]).lower()
    missing = [n for n in needles if n.lower() not in blob]
    assert not missing, f"{question}: faltan {missing}"


def test_static_prompt_no_niega_excel_poligonal():
    s = AVI_SYSTEM_PROMPT_STATIC.lower()
    assert "no invente export excel" not in s
    assert "excel" in s and "poligonal" in s


def test_static_prompt_catalogo_no_es_tab_admin():
    s = AVI_SYSTEM_PROMPT_STATIC
    assert "**NO** es pestaña del Panel Admin en la UI actual." in s
    assert "**Almacén** → botón **Insumos**" in s
