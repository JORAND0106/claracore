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
