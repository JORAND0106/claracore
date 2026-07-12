"""PDF POS 80 mm — Despachador (copias múltiples)."""

from almacen_disposicion_pdf import (
    COPIAS_DISPOSICION,
    COPIAS_RECIBO,
    generar_pdf_despachador_pos,
    generar_pdf_disposicion_pos,
)

_BASE = dict(
    contrato={
        "id": 1,
        "numero": "CTO-001",
        "contratista": "Contratista Demo",
        "nit": "900123456",
        "objeto": "Obra demo",
    },
    entrada={
        "numero_documento": "00001",
        "fecha_entrada": "2026-07-12",
        "cantidad_recibida": 12.5,
        "pk_id": "PK-001",
        "tramo": "TRAMO 1",
        "costado": "D",
        "abscisa_inicial": "0+000",
        "abscisa_final": "0+100",
        "placa": "ABC-123",
        "transportador": "Juan Pérez",
    },
    oc={"numero_oc": 42},
    insumo_label="Arena fina",
    proveedor_nombre="Cantera el Vínculo",
    usuario_nombre="Operador Demo",
    unidad="M3",
)


def test_generar_pdf_disposicion_tres_copias():
    pdf = generar_pdf_disposicion_pos(**_BASE)
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1500


def test_generar_pdf_recibo_dos_copias():
    pdf = generar_pdf_despachador_pos("recibo", **_BASE)
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_copias_configuradas():
    assert len(COPIAS_DISPOSICION) == 3
    assert COPIAS_DISPOSICION == ("Transportador", "Escombrera", "Obra")
    assert len(COPIAS_RECIBO) == 2
    assert COPIAS_RECIBO == ("Transportador", "Obra")


def test_pdf_usa_separadores_tabla():
    from almacen_disposicion_pdf import _render_copia_html

    html = _render_copia_html(
        copy_label="Transportador",
        is_last=False,
        doc_title="Disposición de material",
        contrato=_BASE["contrato"],
        entrada=_BASE["entrada"],
        oc=_BASE["oc"],
        insumo_label=_BASE["insumo_label"],
        proveedor_nombre=_BASE["proveedor_nombre"],
        usuario_nombre=_BASE["usuario_nombre"],
        unidad=_BASE["unidad"],
    )
    assert html.count("sep-line") >= 4
    assert "row-tbl" in html
    assert 'class="row"' not in html
    assert "NIT:" in html
    assert "Obra demo" in html
    assert "hdr-mini" not in html


def test_todas_las_copias_encabezado_completo():
    from almacen_disposicion_pdf import _copias_por_tipo, _render_copia_html

    objeto_largo = (
        "Construcción, mejoramiento y mantenimiento de la infraestructura vial "
        "del municipio incluyendo obras complementarias y señalización."
    )
    contrato = {**_BASE["contrato"], "objeto": objeto_largo}

    for tipo in ("disposicion", "recibo"):
        for label in _copias_por_tipo(tipo):
            html = _render_copia_html(
                copy_label=label,
                is_last=False,
                doc_title="Disposición de material",
                contrato=contrato,
                entrada=_BASE["entrada"],
                oc=_BASE["oc"],
                insumo_label=_BASE["insumo_label"],
                proveedor_nombre=_BASE["proveedor_nombre"],
                usuario_nombre=_BASE["usuario_nombre"],
                unidad=_BASE["unidad"],
            )
            assert "NIT:" in html
            assert objeto_largo in html
            assert 'class="objeto"' in html
            assert "…" not in html
            assert "hdr-mini" not in html
