"""PDF POS 80 mm — Despachador (copias múltiples)."""

from almacen_disposicion_pdf import (
    COPIAS_DISPOSICION,
    COPIAS_RECIBO,
    _COPIA_ALTO_MM,
    _PAGE_ANCHO_MM,
    _build_qr_payload,
    _page_height_mm,
    _pos_css,
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
        "administrador_nombre": "Admin Demo",
        "administrador_email": "admin@demo.test",
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


def _count_pdf_pages(pdf_bytes: bytes) -> int:
    """Cuenta páginas aproximando /Type /Page en el PDF."""
    marker = b"/Type /Page"
    count = pdf_bytes.count(marker)
    return max(1, count - 1) if count > 0 else 0


def _mm(val_pt: float) -> float:
    return round(float(val_pt) * 25.4 / 72, 1)


def test_generar_pdf_disposicion_pagina_continua():
    pdf = generar_pdf_disposicion_pos(**_BASE)
    assert _count_pdf_pages(pdf) == 1


def test_generar_pdf_recibo_pagina_continua():
    pdf = generar_pdf_despachador_pos("recibo", **_BASE)
    assert _count_pdf_pages(pdf) == 1


def test_pdf_altura_pagina_por_copias():
    css_disp = _pos_css(len(COPIAS_DISPOSICION))
    css_rec = _pos_css(len(COPIAS_RECIBO))

    assert "page-break-after: always" not in css_disp
    assert "80mm 600mm" in css_disp
    assert "80mm 400mm" in css_rec
    assert "doc-sheet" not in css_disp
    assert "font-size: 12.75pt" in css_disp
    assert "qr-wrap" in css_disp
    assert _page_height_mm(len(COPIAS_DISPOSICION)) == 600
    assert _page_height_mm(len(COPIAS_RECIBO)) == 400
    assert _page_height_mm(len(COPIAS_DISPOSICION)) == _COPIA_ALTO_MM * len(COPIAS_DISPOSICION)


def test_pdf_mediabox_exacto():
    from pypdf import PdfReader
    import io

    pdf_disp = generar_pdf_disposicion_pos(**_BASE)
    r_disp = PdfReader(io.BytesIO(pdf_disp))
    assert len(r_disp.pages) == 1
    mb = r_disp.pages[0].mediabox
    assert _mm(mb.width) == _PAGE_ANCHO_MM
    assert _mm(mb.height) == _page_height_mm(len(COPIAS_DISPOSICION))

    pdf_rec = generar_pdf_despachador_pos("recibo", **_BASE)
    r_rec = PdfReader(io.BytesIO(pdf_rec))
    assert len(r_rec.pages) == 1
    mb = r_rec.pages[0].mediabox
    assert _mm(mb.width) == _PAGE_ANCHO_MM
    assert _mm(mb.height) == _page_height_mm(len(COPIAS_RECIBO))


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


def test_qr_payload_datos_planos():
    payload = _build_qr_payload(_BASE["contrato"])
    assert "Contrato: CTO-001" in payload
    assert "Contratista: Contratista Demo" in payload
    assert "Objeto: Obra demo" in payload
    assert "Administrador: Admin Demo" in payload
    assert "Email: admin@demo.test" in payload


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
    assert "qr-wrap" in html
    assert "data:image/png;base64," in html
    assert "hdr-mini" not in html


def test_todas_las_copias_encabezado_completo():
    from almacen_disposicion_pdf import _copias_por_tipo, _render_copia_html

    objeto_largo = (
        "MEJORAMIENTO DE LA VIA QUE COMUNICA A LOS MUNICIPIOS DE SILVANIA Y TIBACUY, "
        "TRAMO CUMACA - TIBACUY - CLUB EL BOSQUE, DEPARTAMENTO DE CUNDINAMARCA"
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
            assert "qr-wrap" in html
            assert "…" not in html
            assert "hdr-mini" not in html


def test_objeto_largo_una_sola_pagina():
    from pypdf import PdfReader
    import io

    objeto_largo = (
        "MEJORAMIENTO DE LA VIA QUE COMUNICA A LOS MUNICIPIOS DE SILVANIA Y TIBACUY, "
        "TRAMO CUMACA - TIBACUY - CLUB EL BOSQUE, DEPARTAMENTO DE CUNDINAMARCA"
    )
    contrato = {**_BASE["contrato"], "objeto": objeto_largo}
    pdf = generar_pdf_disposicion_pos(**{**_BASE, "contrato": contrato})
    r = PdfReader(io.BytesIO(pdf))
    assert len(r.pages) == 1
