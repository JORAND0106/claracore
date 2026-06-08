"""Exportación CPM: etiquetas de estado y nodos de dependencia."""
from __future__ import annotations

from prog_obra_service import _cpm_estado_label, _dep_nodo_label


def test_cpm_estado_label_ruta_critica():
    assert _cpm_estado_label({"es_ruta_critica": True, "holgura_total": 0, "tiene_sucesores": True}) == "Ruta crítica"


def test_cpm_estado_label_final_tramo():
    assert _cpm_estado_label({"es_actividad_final_tramo": True, "holgura_total": 0}) == "Actividad final tramo"


def test_cpm_estado_label_con_holgura():
    assert _cpm_estado_label({"holgura_total": 3, "tiene_sucesores": True}) == "Con holgura"


def test_dep_nodo_label_con_agrupador():
    ag_meta = {42: {"codigo_wbs": "2.1", "nombre": "Excavación"}}
    lbl = _dep_nodo_label(
        {
            "pk_id_origen": "PK-01",
            "capitulo_origen": "01",
            "agrupador_id_origen": 42,
        },
        "orig",
        ag_meta,
    )
    assert "PK-01" in lbl
    assert "2.1" in lbl
    assert "Excavación" in lbl
