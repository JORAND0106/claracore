"""Tests exportación Microsoft Project XML."""
from datetime import date

from prog_obra_export_project import (
    LINK_TYPE,
    _build_task_tree,
    _duration_h,
    _link_lag,
    export_filename,
)


def test_link_type_mapping():
    assert LINK_TYPE["FS"] == 1
    assert LINK_TYPE["SS"] == 3
    assert LINK_TYPE["FF"] == 0
    assert LINK_TYPE["SF"] == 2


def test_duration_and_lag():
    assert _duration_h(5) == "PT40H0M0S"
    assert _link_lag(2) == 9600


def test_build_task_tree_hierarchy():
    agrupadores = [
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "agrupador_id": 10,
            "codigo_wbs": "2.A",
            "nombre": "Subrasante",
            "fecha_inicio": date(2026, 1, 6),
            "fecha_fin": date(2026, 1, 20),
            "duracion_dias_habiles": 10,
            "costo_directo": 1000000.0,
            "es_ruta_critica": True,
        },
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "agrupador_id": 11,
            "codigo_wbs": "2.B",
            "nombre": "Base",
            "fecha_inicio": date(2026, 1, 21),
            "fecha_fin": date(2026, 2, 5),
            "duracion_dias_habiles": 12,
            "costo_directo": 2000000.0,
            "es_ruta_critica": False,
        },
    ]
    tasks, uid_map = _build_task_tree(agrupadores)
    assert len(tasks) == 5  # root + pk + cap + 2 agrupadores
    assert tasks[0].summary is True
    assert tasks[0].outline_level == 0
    leaf = [t for t in tasks if not t.summary]
    assert len(leaf) == 2
    assert "PK1 · 2.A · Subrasante" in leaf[0].name
    assert leaf[0].fields.get("critical") is True
    assert uid_map[("PK1", "02", "10")] == leaf[0].uid


def test_export_filename():
    assert export_filename(42).startswith("programacion_42_")
