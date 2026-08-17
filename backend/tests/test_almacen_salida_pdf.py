"""PDF POS salida — firma al 50% del tamaño base."""
import base64
import io

from PIL import Image

from almacen_salida_pdf import (
    _FIRMA_H_MM,
    _FIRMA_H_PT,
    _FIRMA_W_MM,
    _firma_celda,
    _firma_img_cage_html,
    _resize_firma_bytes,
    generar_pdf_salida_pos,
)


def _large_png_data_uri() -> str:
    img = Image.new("RGB", (800, 400), color=(20, 20, 20))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def test_firma_tamano_objetivo_50_porciento():
    assert _FIRMA_W_MM == 14.0
    assert _FIRMA_H_MM == 7.0


def test_resize_firma_bytes_acota_imagen_grande():
    img = Image.new("RGB", (800, 400), color=(10, 10, 10))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out = _resize_firma_bytes(buf.getvalue())
    with Image.open(io.BytesIO(out)) as resized:
        max_w = int(_FIRMA_W_MM / 25.4 * 120) + 1
        max_h = int(_FIRMA_H_MM / 25.4 * 120) + 1
        assert resized.width <= max_w
        assert resized.height <= max_h


def test_firma_celda_usa_jaula_altura_fija():
    html = _firma_celda("Recibe en obra", "Juan Pérez", _large_png_data_uri())
    assert f"height:{_FIRMA_H_PT}pt" in html
    assert "firma-img-cage" in html
    assert "firma-block" in html
    assert html.strip().startswith('<div class="firma-block">')


def test_generar_pdf_salida_pos_bytes():
    contrato = {
        "numero": "CT-001",
        "contratista": "Contratista Demo",
        "nit": "900123456",
        "objeto": "Obra demo",
        "administradores": [],
    }
    salida = {
        "numero_salida": 3,
        "fecha_hora_salida": "2026-07-13T14:30:00+00:00",
        "pk_id": "PK-001",
        "tramo": "Tramo 1",
        "costado": "Derecha",
        "abscisa_inicial": "0+100",
        "abscisa_final": "0+120",
        "cantidad_salida": 12.5,
    }
    pdf = generar_pdf_salida_pos(
        contrato,
        salida,
        "42",
        "INS-01 — Arena fina",
        "Cap 01 · Item 02",
        "M3",
        "María López",
        _large_png_data_uri(),
        "Pedro Gómez",
        _large_png_data_uri(),
    )
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"

    from pypdf import PdfReader
    import io
    from almacen_pos_pdf_common import PAGE_ANCHO_MM, needs_pos_regen
    from almacen_salida_pdf import _estimate_salida_copia_alto_mm, COPIAS_SALIDA

    r = PdfReader(io.BytesIO(pdf))
    assert len(r.pages) == 1
    mb = r.pages[0].mediabox
    w_mm = round(float(mb.width) * 25.4 / 72, 1)
    h_mm = round(float(mb.height) * 25.4 / 72, 1)
    assert w_mm == PAGE_ANCHO_MM
    expected = _estimate_salida_copia_alto_mm(contrato, salida) * len(COPIAS_SALIDA)
    assert h_mm == expected
    assert h_mm < 440  # legacy fijo 220×2
    assert not needs_pos_regen(pdf)
    text = r.pages[0].extract_text() or ""
    assert "Salida de material" in text
    assert "María López" in text


def test_salida_pdf_incluye_devolucion_si_aplica():
    from almacen_salida_pdf import _render_copia_html

    contrato = {"numero": "CT-1", "contratista": "X", "nit": "1", "objeto": "O", "administradores": []}
    salida = {
        "numero_salida": 1,
        "fecha_hora_salida": "2026-07-13T14:30:00+00:00",
        "cantidad_salida": 10,
        "cantidad_devuelta": 2.5,
        "cantidad_neta": 7.5,
        "pk_id": "PK",
    }
    html = _render_copia_html(
        copy_label="Obra",
        is_last=True,
        contrato=contrato,
        salida=salida,
        oc_num="1",
        insumo_label="Arena",
        presupuesto_label="1.1",
        unidad="M3",
        receptor_nombre="R",
        receptor_firma=None,
        despachador_nombre="D",
        despachador_firma=None,
    )
    assert "Devuelto:" in html
    assert "Cant. neta:" in html
    assert "firmas-stack" in html
    assert "firma-block" in html
