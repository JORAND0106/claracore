"""OC por proveedor, PDF IVA discriminado y orden por insumo."""
from pathlib import Path

import almacen_orden_compra_pdf as pdf
import almacen_service as svc


def test_proveedor_de_item_recurrente_y_catalogo():
    cat_map = {10: {"proveedor_id": 5}}
    prov_nombres = {5: "Acme SAS"}
    key, pid, nombre = svc._proveedor_de_item(
        {"es_recurrente": True}, cat_map, prov_nombres,
    )
    assert key == "recurrente"
    assert pid is None
    assert nombre == "Compra recurrente"

    key2, pid2, nombre2 = svc._proveedor_de_item(
        {"insumo_id": 10, "es_recurrente": False}, cat_map, prov_nombres,
    )
    assert key2 == "id:5"
    assert pid2 == 5
    assert nombre2 == "Acme SAS"


def test_oc_match_proveedor_por_id_y_nombre():
    oc = {"proveedor_id": 7, "proveedor_nombre": "Beta"}
    assert svc._oc_match_proveedor(oc, "id:7", 7, "Beta")
    assert not svc._oc_match_proveedor(oc, "id:8", 8, "Otro")

    oc2 = {"proveedor_id": None, "proveedor_nombre": "Gamma Ltda"}
    assert svc._oc_match_proveedor(oc2, "nombre:gamma ltda", None, "Gamma Ltda")


def test_aprobar_solicitud_usa_ocs_plural():
    src = Path(svc.__file__).read_text(encoding="utf-8")
    assert "existing_ocs" in src
    assert "_agrupar_items_por_proveedor" in src
    assert "_crear_oc_con_items" in src
    assert "ordenes_compra_generadas" in src
    assert "return append_aprobados_a_oc" in src


def test_sql_oc_por_proveedor_existe():
    sql = Path(__file__).resolve().parents[1] / "sql" / "almacen_oc_por_proveedor.sql"
    text = sql.read_text(encoding="utf-8")
    assert "proveedor_id" in text
    assert "solicitud_id" in text
    assert "DROP CONSTRAINT" in text


def test_pdf_lineas_antes_de_iva_y_orden_por_codigo():
    items = [
        {"solicitud_item_id": 2, "cantidad": 2, "valor_unitario": 119, "unidad": "m", "material_descripcion": "B"},
        {"solicitud_item_id": 1, "cantidad": 1, "valor_unitario": 119, "unidad": "m", "material_descripcion": "A"},
    ]
    sol_items = {
        1: {"id": 1, "insumo_id": 101, "insumo_codigo": "CC-1614-002"},
        2: {"id": 2, "insumo_id": 100, "insumo_codigo": "CC-1614-001"},
    }
    insumo_map = {
        100: {"codigo": "CC-1614-001", "tipo_impuesto": "iva", "impuesto_porcentaje": 19},
        101: {"codigo": "CC-1614-002", "tipo_impuesto": "iva", "impuesto_porcentaje": 19},
    }
    rows_html, tot = pdf._lineas_y_totales(items, sol_items, insumo_map)
    # Orden: 001 antes que 002
    assert rows_html.index("CC-1614-001") < rows_html.index("CC-1614-002")
    # Totales de línea sin IVA (100 * cant): 200 y 100
    assert "$ 200" in rows_html or "$ 200".replace(" ", "\xa0") in rows_html or "200" in rows_html
    assert "Subtotal (antes de IVA)" in tot["rows_html"]
    assert "Total (IVA incluido)" in tot["rows_html"]
    assert "IVA 19%" in tot["rows_html"]
    # Subtotal = 100*2 + 100*1 = 300; IVA = 19*2 + 19*1 = 57; Total = 357
    assert abs(tot["subtotal"] - 300) < 0.01
    assert abs(tot["total"] - 357) < 0.01


def test_pdf_columnas_sin_iva_en_html():
    src = Path(pdf.__file__).read_text(encoding="utf-8")
    assert "Precio unit. (sin IVA)" in src
    assert "Total (sin IVA)" in src
    assert "_ordenar_items_oc_por_insumo" in src
