"""PDF de entrada con varias líneas y domicilio."""
from almacen_disposicion_pdf import _lineas_insumos_html, _render_copia_html


def test_lineas_insumos_html_multi():
    html = _lineas_insumos_html(
        [
            {"material_descripcion": "Arena", "unidad": "m³", "cantidad_recibida": 2},
            {"material_descripcion": "Cemento", "unidad": "kg", "cantidad_recibida": 50},
        ],
        insumo_label="—",
        unidad="",
        cantidad=0,
    )
    assert "Arena" in html
    assert "Cemento" in html
    assert "2" in html
    assert "50" in html


def test_render_copia_domicilio():
    html = _render_copia_html(
        copy_label="Obra",
        is_last=True,
        doc_title="Recibo",
        contrato={"numero": "1", "objeto": "Obra", "contratista": "X", "nit": "1"},
        entrada={
            "numero_documento": "Ent-X-00001",
            "fecha_entrada": "2026-11-02",
            "llegada_domicilio": True,
            "cantidad_recibida": 3,
        },
        oc={"numero_oc": 9},
        insumo_label="Arena",
        proveedor_nombre="Prov",
        usuario_nombre="User",
        unidad="m³",
        lineas=[{"material_descripcion": "Arena", "unidad": "m³", "cantidad_recibida": 3}],
    )
    assert "Domicilio" in html
    assert "Arena" in html
