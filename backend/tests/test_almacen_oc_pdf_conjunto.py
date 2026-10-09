"""PDF con todas las OC y generación solo de los proveedores elegidos."""
from almacen_orden_compra_pdf import generar_pdf_orden_compra, html_varias_ordenes
from almacen_service import _proveedores_de_esta_oc, lineas_fuera_de_oc


def _html_oc(numero, material, proveedor):
    return generar_pdf_orden_compra(
        contrato={"numero": "CT-1", "contratista": "Vías"},
        orden_compra={
            "numero_oc": numero,
            "proveedor_nombre": proveedor,
            "items": [{
                "solicitud_item_id": numero,
                "cantidad": 2,
                "valor_unitario": 119,
                "unidad": "m",
                "material_descripcion": material,
            }],
        },
        solicitud={
            "consecutivo": 8,
            "items": [{
                "id": numero,
                "insumo_id": numero,
                "insumo_codigo": f"CC-{numero}",
            }],
        },
        proveedores=[{"razon_social": proveedor, "nit": "900"}],
        insumo_map={
            numero: {"codigo": f"CC-{numero}", "tipo_impuesto": "iva", "impuesto_porcentaje": 19},
        },
        solo_html=True,
    )


def test_el_pdf_pone_cada_oc_en_su_hoja_sin_mezclar_lineas():
    html = html_varias_ordenes([
        _html_oc(10, "Arena", "Aceros"),
        _html_oc(11, "Cemento", "Canteras"),
    ])
    assert "page-break-before" in html
    assert html.count('class="oc-hoja oc-hoja-nueva"') == 1
    primera, segunda = html.split('class="oc-hoja oc-hoja-nueva"', 1)
    assert "N.° 10" in primera
    assert "Arena" in primera
    assert "Cemento" not in primera
    assert "N.° 11" in segunda
    assert "Cemento" in segunda
    assert "Arena" not in segunda
    assert "Subtotal (antes de IVA)" in primera
    assert "Subtotal (antes de IVA)" in segunda


def test_el_bloque_para_no_lista_otro_proveedor():
    oc = {"proveedor_id": 2, "proveedor_nombre": "Canteras"}
    out = _proveedores_de_esta_oc(oc, [
        {"id": 1, "razon_social": "Aceros"},
        {"id": 2, "razon_social": "Canteras", "nit": "900"},
    ])
    assert [p["razon_social"] for p in out] == ["Canteras"]


def test_lineas_de_otro_proveedor_siguen_fuera_de_la_oc():
    items = [
        {"id": 1, "estado_validacion": "aprobado"},
        {"id": 2, "estado_validacion": "pendiente"},
        {"id": 3, "estado_validacion": "rechazado"},
    ]
    fuera = lineas_fuera_de_oc(items, [1])
    assert [it["id"] for it in fuera] == [2]
