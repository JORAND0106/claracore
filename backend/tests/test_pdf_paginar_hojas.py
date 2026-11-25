"""Empaque de hojas PDF: sin saltos forzados ni huecos injustificados."""
from pdf_paginar_hojas import HojaEmpaque, empacar_filas, merge_pdf_bytes


def test_empacar_todo_en_una_hoja_cuando_cabe():
    hojas = empacar_filas(
        10,
        overhead_primera_pt=118,
        overhead_cont_pt=18,
        fila_pt=11.3,
        cierre_pt=62,
    )
    assert hojas == [HojaEmpaque(0, 10, True, True)]


def test_empacar_reserva_cierre_en_ultima():
    # Capacidad primera ≈ 600-118 = 482 → ~42 filas sin cierre; con cierre ~37
    hojas = empacar_filas(
        50,
        overhead_primera_pt=118,
        overhead_cont_pt=18,
        fila_pt=11.3,
        cierre_pt=62,
    )
    assert len(hojas) >= 2
    assert hojas[0].con_encabezado is True
    assert hojas[0].con_cierre is False
    assert hojas[-1].con_cierre is True
    assert hojas[-1].fin == 50
    # Continuidad sin huecos de índice
    assert hojas[0].inicio == 0
    for a, b in zip(hojas, hojas[1:]):
        assert a.fin == b.inicio


def test_merge_pdf_bytes_una_parte():
    from topografia_utils import to_pdf_bytes

    raw = to_pdf_bytes(
        "<html><body><p>hola</p></body></html>", landscape=True,
    )
    assert merge_pdf_bytes([raw])[:4] == b"%PDF"
    merged = merge_pdf_bytes([raw, raw])
    assert merged[:4] == b"%PDF"
    from pypdf import PdfReader
    import io
    assert len(PdfReader(io.BytesIO(merged)).pages) == 2
