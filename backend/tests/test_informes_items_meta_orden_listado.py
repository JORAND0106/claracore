"""
Causa raíz (ítems solo-Actualizadas incompletos y al final):

1. ``enriquecer_items_bloques`` materializaba stubs con descripción/unidad/capítulo
   vacíos cuando el ítem no venía en ``items_presente`` (solo en cant_actualizadas).
2. Tras filtrar, ``_sort_items_corte_por_item_numero_asc`` ordenaba por capítulo:
   capítulo vacío → clave (2,…) → al final de la tabla.

Corrección: meta + orden del listado de precios (contrato / sub).
Formato cantidades informe: entero sin decimales; si no, 2 decimales.
"""
from __future__ import annotations

from corte_sub_conciliacion import (
    enriquecer_items_bloques,
    filtrar_items_con_cantidades,
    sort_items_por_orden_listado,
)


def test_causa_stub_vacio_queda_completo_con_meta_listado():
    presente = [
        {
            "item_numero": "1.1",
            "item_descripcion": "Exc",
            "unidad": "M3",
            "capitulo": "1. PRELIMINARES",
            "cantidad": 2.0,
            "vlr_unitario_sub": 1000.0,
        }
    ]
    meta = {
        "1.1": {
            "capitulo": "1. PRELIMINARES",
            "descripcion": "Exc",
            "unidad": "M3",
            "vlr_unitario": 1000.0,
            "orden_listado": 0,
        },
        "1.3": {
            "capitulo": "1. PRELIMINARES",
            "descripcion": "Limpieza",
            "unidad": "M2",
            "vlr_unitario": 2085.0,
            "orden_listado": 1,
        },
        "NP-02": {
            "capitulo": "16. NO PREVISTOS",
            "descripcion": "Ítem no previsto 02",
            "unidad": "GL",
            "vlr_unitario": 5000.0,
            "orden_listado": 50,
        },
        "2.4": {
            "capitulo": "2. MOVIMIENTO",
            "descripcion": "Excavación mecánica",
            "unidad": "M3",
            "vlr_unitario": 42000.0,
            "orden_listado": 10,
        },
    }
    items = enriquecer_items_bloques(
        presente,
        cant_actualizadas={"1.1": 10, "1.3": 5, "2.4": 3, "NP-02": 1},
        cant_acum_anterior={},
        vu_por_item={k: v["vlr_unitario"] for k, v in meta.items()},
        meta_por_item=meta,
    )
    items = filtrar_items_con_cantidades(items)
    by = {it["item_numero"]: it for it in items}

    # Completos
    assert by["1.3"]["item_descripcion"] == "Limpieza"
    assert by["1.3"]["unidad"] == "M2"
    assert by["1.3"]["capitulo"] == "1. PRELIMINARES"
    assert by["1.3"]["cant_presente"] == 0
    assert by["NP-02"]["item_descripcion"] == "Ítem no previsto 02"
    assert by["2.4"]["capitulo"] == "2. MOVIMIENTO"

    # Orden capítulo+ítem (ignora orden_listado): 1.1, 1.3, 2.4, NP-02
    orden = [it["item_numero"] for it in items]
    assert orden == ["1.1", "1.3", "2.4", "NP-02"]


def test_sort_listado_no_manda_capitulo_vacio_al_final():
    items = [
        {"item_numero": "NP-07", "capitulo": "", "orden_listado": 3},
        {"item_numero": "1.1", "capitulo": "1. PRELIMINARES", "orden_listado": 0},
        {"item_numero": "2.4", "capitulo": "", "orden_listado": 1},
    ]
    out = sort_items_por_orden_listado(items)
    assert [i["item_numero"] for i in out] == ["1.1", "2.4", "NP-07"]


def test_fn_cant_informe_entero_o_dos_decimales():
    from test_corte_sub_001_excel_filtro import _import_informes_with_stubs

    inf = _import_informes_with_stubs()
    assert inf._fn_cant_informe(432903) == "432,903"
    assert inf._fn_cant_informe(432903.0) == "432,903"
    assert inf._fn_cant_informe(21.14) == "21.14"
    assert inf._fn_cant_informe(0) == "0"
    assert "770" not in inf._fn_cant_informe(432903.77) or inf._fn_cant_informe(432903.77) == "432,903.77"
    assert inf._fn_cant_informe(432903.77) == "432,903.77"
