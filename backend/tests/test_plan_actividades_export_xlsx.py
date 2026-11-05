"""Tests — Excel institucional Plan de actividades (calidad + multi-hoja)."""
from __future__ import annotations

from openpyxl import Workbook

import plan_actividades_service as pas
from plan_actividades_service import (
    PLAN_ACTIVIDADES_FORMATO,
    _EXPORT_HEADERS,
    _fmt_fecha_co,
    _sheet_title_safe,
    _strip_html,
    _targets_export,
    _write_plan_sheet,
)


def test_formato_calidad_plan_actividades():
    assert PLAN_ACTIVIDADES_FORMATO["codigo"] == "CC-SEG-PLAN-001"
    assert PLAN_ACTIVIDADES_FORMATO["version"] == "1.0"
    assert "plan" in PLAN_ACTIVIDADES_FORMATO["nombre"].lower()
    assert _EXPORT_HEADERS == [
        "Actividad",
        "Descripción",
        "Comentario comité",
        "Solicitante",
        "Asignado(s)",
        "Prioridad",
        "Estado",
        "Fecha inicio",
        "Fecha fin",
        "Periodicidad",
    ]


def test_sheet_title_safe_unique_and_bounded():
    used = set()
    a = _sheet_title_safe("Nombre con / caracteres * inválidos", used)
    b = _sheet_title_safe("Nombre con / caracteres * inválidos", used)
    assert a != b
    assert len(a) <= 31 and len(b) <= 31
    assert "/" not in a and "*" not in a


def test_fechas_colombia_y_html():
    assert _fmt_fecha_co("2026-11-05") == "05/11/2026"
    assert "texto" in _strip_html("<p>texto<br/>más</p>")


def test_write_plan_sheet_calidad_header_y_banda():
    wb = Workbook()
    ws = wb.active
    _write_plan_sheet(
        ws,
        [
            {
                "id": 9,
                "titulo": "Revisión de obra",
                "descripcion": "<i>Detalle</i>",
                "comentario_comite": "",
                "solicitante_nombre": "Ana",
                "asignado_a_nombre": "Luis",
                "prioridad": 2,
                "estado_gestion": "abierto",
                "fecha_inicio": "2026-04-01",
                "fecha_fin": "2026-04-03",
                "periodicidad": "ninguna",
                "grupo_nombre": "Calidad",
                "asignaciones": [{"usuario_id": 3}],
                "ocurrencias": [
                    {"fecha_inicio": "2026-04-01", "fecha_fin": "2026-04-03"},
                ],
            }
        ],
        contrato={"numero": "CT-99", "objeto": "Objeto", "logo_contratista": ""},
        colaborador={"nombre": "Luis Gómez", "cargo": "Residente"},
    )
    assert "PLAN DE ACTIVIDADES" in str(ws.cell(1, 2).value)
    assert "CC-SEG-PLAN-001" in str(ws.cell(1, 5).value)
    assert ws.cell(2, 2).value == "CT-99"
    assert ws.cell(3, 2).value == "Luis Gómez"
    assert ws.cell(5, 1).value == "Actividad"
    assert ws.cell(6, 1).value == "Calidad"
    assert ws.cell(7, 1).value == "Revisión de obra"
    assert ws.cell(7, 8).value == "01/04/2026"
    assert ws.page_setup.orientation == "landscape"


def test_write_plan_sheet_vacia_sigue_con_encabezado():
    wb = Workbook()
    ws = wb.active
    _write_plan_sheet(
        ws,
        [],
        contrato={"numero": "CT-1", "objeto": "Obj", "logo_contratista": ""},
        colaborador={"nombre": "Sin plan", "cargo": "Auxiliar"},
    )
    assert "PLAN DE ACTIVIDADES" in str(ws.cell(1, 2).value)
    assert ws.cell(3, 2).value == "Sin plan"
    assert "Sin actividades" in str(ws.cell(6, 1).value)


def test_targets_export_todos_une_catalogo_y_ids_cliente(monkeypatch):
    """«Todos» debe incluir a todos: catálogo remoto + IDs enviados por el cliente."""

    monkeypatch.setattr(pas, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(
        pas,
        "list_colaboradores_plan",
        lambda _sb, _cid: [
            {"id": 1, "nombre": "Ana", "apellidos": "Pérez", "cargo_nombre": "Residente"},
        ],
    )
    monkeypatch.setattr(
        pas,
        "_usuario_export_info",
        lambda _sb, uid: {"id": int(uid), "nombre": f"U{uid}", "cargo": ""},
    )

    out = _targets_export(
        None,
        10,
        99,
        {"id": 99},
        colaborador_id=None,
        colaborador_ids=[1, 2, 3],
        todos=True,
    )
    ids = [r["id"] for r in out]
    assert ids == [1, 2, 3, 99] or set(ids) >= {1, 2, 3}
    assert len(ids) >= 3
    assert 2 in ids and 3 in ids


def test_targets_export_parcial_exacto(monkeypatch):
    monkeypatch.setattr(pas, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(pas, "list_colaboradores_plan", lambda _sb, _cid: [])
    monkeypatch.setattr(
        pas,
        "_usuario_export_info",
        lambda _sb, uid: {"id": int(uid), "nombre": f"U{uid}", "cargo": ""},
    )
    out = _targets_export(
        None,
        10,
        1,
        {"id": 1},
        colaborador_id=None,
        colaborador_ids=[7, 8],
        todos=False,
    )
    assert [r["id"] for r in out] == [7, 8]
