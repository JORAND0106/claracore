"""Helpers compartidos PDF POS 80 mm."""
from almacen_pos_pdf_common import (
    PAGE_ANCHO_MM,
    estimate_copia_alto_mm,
    mediabox_mm,
    needs_pos_regen,
    page_height_mm,
    page_size_css,
)


def test_page_size_css():
    assert page_size_css(80, 300) == "80mm 300mm"


def test_estimate_base_menor_que_legacy():
    h = estimate_copia_alto_mm()
    assert 110 <= h < 200
    # Con extras típicos de salida aún puede superar el legacy por copia;
    # lo importante es no usar 200/220 fijos cuando el contenido es corto.
    assert estimate_copia_alto_mm(has_firmas=False, n_admins=0) < 180


def test_estimate_con_firmas_y_devol():
    base = estimate_copia_alto_mm()
    full = estimate_copia_alto_mm(has_firmas=True, has_devol=True, has_obs=True, n_admins=2)
    assert full > base


def test_page_height_suma():
    assert page_height_mm([150, 150]) == 300


def test_needs_pos_regen_legacy_heights():
    # Construye PDF mínimo no aplica; usa mediabox mock vía generar.
    from almacen_disposicion_pdf import generar_pdf_despachador_pos

    # PDF nuevo dinámico no debe pedir regen.
    pdf = generar_pdf_despachador_pos(
        "recibo",
        {"numero": "1", "contratista": "C", "nit": "1", "objeto": "O", "administradores": []},
        {
            "numero_documento": "R1",
            "fecha_entrada": "2026-07-12",
            "cantidad_recibida": 1,
            "pk_id": "PK",
        },
        {"numero_oc": 1},
        "Insumo",
        "Prov",
        "User",
        "M3",
    )
    dims = mediabox_mm(pdf)
    assert dims is not None
    assert abs(dims[0] - PAGE_ANCHO_MM) < 1
    assert abs(dims[1] - 400) > 1  # no legacy recibo
    assert not needs_pos_regen(pdf)
    assert needs_pos_regen(b"")
    assert needs_pos_regen(b"%PDF-1.4 not a real pdf")
