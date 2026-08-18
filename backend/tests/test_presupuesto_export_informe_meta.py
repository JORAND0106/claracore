"""Export informe presupuesto: orden natural de ítems + meta en vivo desde listado."""
from unittest.mock import MagicMock, patch

import main as m


def test_orden_item_presupuesto_natural():
    items = ["3.10", "3.2", "3.1", "3.11", "3.9"]
    ordered = sorted(items, key=m._orden_item_presupuesto)
    assert ordered == ["3.1", "3.2", "3.9", "3.10", "3.11"]


def test_orden_resumen_capitulo_luego_item_natural():
    keys = [
        ("3. CAP", "3.10"),
        ("3. CAP", "3.2"),
        ("1. CAP", "1.02"),
        ("1. CAP", "1.1"),
    ]
    ordered = sorted(
        keys,
        key=lambda x: (m._orden_capitulo_presupuesto(x[0]), m._orden_item_presupuesto(x[1])),
    )
    assert ordered == [
        ("1. CAP", "1.1"),
        ("1. CAP", "1.02"),
        ("3. CAP", "3.2"),
        ("3. CAP", "3.10"),
    ]


def test_exportar_informe_aplica_overlay_meta_vivo():
    """Causa del nombre stale: export no hacía overlay; ahora debe llamar meta en vivo."""
    body = MagicMock()
    body.formato = "informe"
    body.modo = "presupuesto_obra"
    body.tipo_ejecucion = "Presupuesto de Obra"
    body.version_id = None

    rows_stale = [
        {
            "id": 1,
            "capitulo": "3. CAP",
            "item": "3.2",
            "descripcion": "Nombre viejo",
            "und": "M2",
            "vlr_unitario": 10,
            "cant_total": 2,
            "costo_directo": 20,
            "pk_id": "",
            "infraestructura": "",
        },
        {
            "id": 2,
            "capitulo": "3. CAP",
            "item": "3.10",
            "descripcion": "Otro viejo",
            "und": "M2",
            "vlr_unitario": 5,
            "cant_total": 1,
            "costo_directo": 5,
            "pk_id": "",
            "infraestructura": "",
        },
    ]
    rows_vivo = [
        {**rows_stale[0], "descripcion": "Nombre actualizado listado", "_listado_meta_vivo": True},
        {**rows_stale[1], "descripcion": "Otro actualizado", "_listado_meta_vivo": True},
    ]

    with patch.object(m, "_presupuesto_fetch_export_rows", return_value=rows_stale):
        with patch.object(m, "_overlay_presupuesto_meta_vivo", return_value=rows_vivo) as mock_ov:
            with patch.object(m, "_pk_ids_ubicacion_por_codigo", return_value={}):
                with patch(
                    "presupuesto_graficos_routes.attach_graficos_a_items_export",
                    return_value=None,
                ):
                    out = m.exportar_presupuesto_informe(2, body, current_user={"id": 1})

    mock_ov.assert_called_once()
    assert out["formato"] == "informe"
    items = [r["item"] for r in out["resumen"]]
    assert items == ["3.2", "3.10"]  # natural, no 3.10 antes de 3.2
    by_item = {r["item"]: r["descripcion"] for r in out["resumen"]}
    assert by_item["3.2"] == "Nombre actualizado listado"
    assert by_item["3.10"] == "Otro actualizado"
    mem_by_item = {r["item"]: r["descripcion"] for r in out["items"]}
    assert mem_by_item["3.2"] == "Nombre actualizado listado"
    assert "competencia" in out["items"][0]["registros"][0]
    assert "resumen_competencias" in out
    assert isinstance(out["resumen_competencias"], list)


def test_exportar_informe_resumen_competencias_dinamico():
    """Desglose por competencia en Resumen + campo en registros de memorias."""
    body = MagicMock()
    body.formato = "informe"
    body.modo = "presupuesto_obra"
    body.tipo_ejecucion = "Presupuesto de Obra"
    body.version_id = None

    rows = [
        {
            "id": 1,
            "capitulo": "1. CAP",
            "item": "1.1",
            "descripcion": "A",
            "und": "M2",
            "vlr_unitario": 10,
            "cant_total": 2,
            "costo_directo": 20,
            "competencia": "IDU",
            "pk_id": "",
            "infraestructura": "",
            "tipo_entidad": "Área",
        },
        {
            "id": 2,
            "capitulo": "1. CAP",
            "item": "1.1",
            "descripcion": "A",
            "und": "M2",
            "vlr_unitario": 10,
            "cant_total": 3,
            "costo_directo": 30,
            "competencia": "ETB",
            "pk_id": "",
            "infraestructura": "",
            "tipo_entidad": "Área",
        },
        {
            "id": 3,
            "capitulo": "1. CAP",
            "item": "1.2",
            "descripcion": "B",
            "und": "M",
            "vlr_unitario": 5,
            "cant_total": 1,
            "costo_directo": 5,
            "competencia": "IDU",
            "pk_id": "",
            "infraestructura": "",
            "tipo_entidad": "Longitud",
        },
    ]

    with patch.object(m, "_presupuesto_fetch_export_rows", return_value=rows):
        with patch.object(m, "_overlay_presupuesto_meta_vivo", side_effect=lambda _cid, rs: rs):
            with patch.object(m, "_pk_ids_ubicacion_por_codigo", return_value={}):
                with patch(
                    "presupuesto_graficos_routes.attach_graficos_a_items_export",
                    return_value=None,
                ):
                    out = m.exportar_presupuesto_informe(9, body, current_user={"id": 1})

    comps = out["resumen_competencias"]
    assert [(c["competencia"], c["cantidad"], c["costo_directo"]) for c in comps] == [
        ("ETB", 3.0, 30),
        ("IDU", 3.0, 25),
    ]
    regs = out["items"][0]["registros"]
    assert {r["competencia"] for r in regs} == {"IDU", "ETB"}
    # Subtotal capítulo vía resumen ítems = suma competencias
    assert sum(r["costo_directo"] for r in out["resumen"]) == sum(c["costo_directo"] for c in comps)
