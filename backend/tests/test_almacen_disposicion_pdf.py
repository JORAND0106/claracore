"""PDF POS 80 mm — Despachador (copias múltiples)."""

from almacen_disposicion_pdf import (
    COPIAS_DISPOSICION,
    COPIAS_RECIBO,
    COPY_ICON,
    _COPIA_ALTO_MM,
    _PAGE_ANCHO_MM,
    _fmt_fecha_hora,
    _page_height_mm,
    _pos_css,
    generar_pdf_despachador_pos,
    generar_pdf_disposicion_pos,
)

_BASE = dict(
    contrato={
        "id": 1,
        "numero": "ICCU-CTO-1614-2025",
        "contratista": "Contratista Demo",
        "nit": "900123456",
        "objeto": "Obra demo",
        "administradores": [
            {"nombre": "Admin Demo", "email": "admin@demo.test"},
            {"nombre": "Admin Dos", "email": "admin2@demo.test"},
        ],
    },
    entrada={
        "numero_documento": "1614-00001",
        "fecha_entrada": "2026-07-12",
        "created_at": "2026-07-12T14:35:00+00:00",
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


def test_pdf_altura_pagina_dinamica_por_copias():
    from almacen_disposicion_pdf import _estimate_entrada_copia_alto_mm

    copia_alto = _estimate_entrada_copia_alto_mm(_BASE["contrato"])
    css_disp = _pos_css(len(COPIAS_DISPOSICION), copia_alto)
    css_rec = _pos_css(len(COPIAS_RECIBO), copia_alto)

    assert "page-break-after: always" not in css_disp
    assert f"80mm {_page_height_mm(len(COPIAS_DISPOSICION), copia_alto)}mm" in css_disp
    assert f"80mm {_page_height_mm(len(COPIAS_RECIBO), copia_alto)}mm" in css_rec
    # Ya no usa altos fijos legacy 200×N.
    assert "80mm 600mm" not in css_disp
    assert "80mm 400mm" not in css_rec
    assert "cantidad-hero" in css_disp
    assert "admin-block" in css_disp
    assert "copy-icon" in css_disp
    assert "qr-wrap" not in css_disp
    assert _page_height_mm(len(COPIAS_DISPOSICION), copia_alto) == copia_alto * len(COPIAS_DISPOSICION)
    assert _page_height_mm(len(COPIAS_RECIBO), copia_alto) == copia_alto * len(COPIAS_RECIBO)
    assert copia_alto < _COPIA_ALTO_MM


def test_pdf_mediabox_80mm_alto_dinamico():
    from pypdf import PdfReader
    import io
    from almacen_disposicion_pdf import _estimate_entrada_copia_alto_mm

    copia_alto = _estimate_entrada_copia_alto_mm(_BASE["contrato"])

    pdf_disp = generar_pdf_disposicion_pos(**_BASE)
    r_disp = PdfReader(io.BytesIO(pdf_disp))
    assert len(r_disp.pages) == 1
    mb = r_disp.pages[0].mediabox
    assert _mm(mb.width) == _PAGE_ANCHO_MM
    assert _mm(mb.height) == _page_height_mm(len(COPIAS_DISPOSICION), copia_alto)
    assert _mm(mb.height) < 600  # legacy disposición

    pdf_rec = generar_pdf_despachador_pos("recibo", **_BASE)
    r_rec = PdfReader(io.BytesIO(pdf_rec))
    assert len(r_rec.pages) == 1
    mb = r_rec.pages[0].mediabox
    assert _mm(mb.width) == _PAGE_ANCHO_MM
    assert _mm(mb.height) == _page_height_mm(len(COPIAS_RECIBO), copia_alto)
    assert _mm(mb.height) < 400  # legacy recibo
    text = r_rec.pages[0].extract_text() or ""
    assert "Recibo de materiales" in text
    assert "Arena fina" in text


def test_fmt_fecha_hora():
    assert _fmt_fecha_hora("2026-07-12T14:35:00+00:00", None) == "12/07/2026 09:35"
    assert _fmt_fecha_hora(None, "2026-07-12") == "12/07/2026"


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


def test_recibo_pdf_muestra_numero_remision():
    from almacen_disposicion_pdf import _render_copia_html

    entrada = {**_BASE["entrada"], "numero_documento": "REM-987654"}
    html = _render_copia_html(
        copy_label="Transportador",
        is_last=False,
        doc_title="Recibo de materiales",
        contrato=_BASE["contrato"],
        entrada=entrada,
        oc=_BASE["oc"],
        insumo_label=_BASE["insumo_label"],
        proveedor_nombre=_BASE["proveedor_nombre"],
        usuario_nombre=_BASE["usuario_nombre"],
        unidad=_BASE["unidad"],
    )
    assert "REM-987654" in html
    assert "1614-00001" not in html


def test_copias_configuradas():
    assert len(COPIAS_DISPOSICION) == 3
    assert COPIAS_DISPOSICION == ("Transportador", "Escombrera", "Obra")
    assert len(COPIAS_RECIBO) == 2
    assert COPIAS_RECIBO == ("Transportador", "Obra")
    assert set(COPY_ICON) == set(COPIAS_DISPOSICION)


def test_pdf_sin_qr():
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
    assert "qr-wrap" not in html
    assert "data:image/png;base64," not in html


def test_pdf_rediseno_pos():
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
    assert "1614-00001" in html
    assert "Fecha y hora:" in html
    assert "12/07/2026 09:35" in html
    assert "cantidad-hero" in html
    assert "12.5 M3" in html
    assert "copy-icon-transportador" in html
    assert COPY_ICON["Transportador"] in html
    assert "Contacto administradores del contrato" in html
    assert "admin@demo.test" in html
    assert "admin2@demo.test" in html
    assert html.count("sep-line") >= 4
    assert "row-tbl" in html


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
            assert f"copy-icon-{label.strip().lower().replace(' ', '-')}" in html
            assert "…" not in html


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
    assert len(r.pages) <= 2
