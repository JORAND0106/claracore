"""Tests — preparación de PDF (firma certificada + compresión + tope técnico)."""
from __future__ import annotations

import io

import pytest
from pypdf import PdfWriter

from pdf_prepare import (
    PDF_TECHNICAL_MAX_BYTES,
    PdfPrepareError,
    pdf_has_certified_signature,
    prepare_pdf_for_storage,
)


def _minimal_pdf_bytes() -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def _pdf_with_fake_sig_dict() -> bytes:
    """PDF mínimo + marcadores binarios típicos de firma PKCS#7 (sin campo AcroForm real)."""
    base = _minimal_pdf_bytes()
    # Anexar comentario PDF con diccionario de firma (detección por /Type /Sig y SubFilter)
    trailer = (
        b"\n% faux signature markers for tests\n"
        b"<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached "
        b"/ByteRange [0 1 2 3] /Contents <00> >>\n"
    )
    return base + trailer


def _pdf_with_embedded_jpeg() -> bytes:
    """PDF con una imagen JPEG grande embebida (para ejercitar compresión)."""
    try:
        import fitz
        from PIL import Image
    except ImportError:
        pytest.skip("pymupdf/Pillow no disponibles")

    # Imagen ruidosa grande → JPEG poco eficiente
    img = Image.new("RGB", (2400, 1800), color=(180, 40, 40))
    for x in range(0, 2400, 17):
        for y in range(0, 1800, 19):
            img.putpixel((x, y), ((x * 3) % 256, (y * 5) % 256, 90))
    img_buf = io.BytesIO()
    img.save(img_buf, format="JPEG", quality=95)
    jpeg = img_buf.getvalue()

    doc = fitz.open()
    page = doc.new_page(width=600, height=450)
    page.insert_image(page.rect, stream=jpeg)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


def test_minimal_pdf_no_signature():
    data = _minimal_pdf_bytes()
    assert pdf_has_certified_signature(data) is False
    prep = prepare_pdf_for_storage(data)
    assert prep.had_certified_signature is False
    assert prep.final_size == len(prep.data)
    assert prep.data[:5] == b"%PDF-"


def test_detects_certified_signature_markers():
    data = _pdf_with_fake_sig_dict()
    assert pdf_has_certified_signature(data) is True
    prep = prepare_pdf_for_storage(data)
    assert prep.had_certified_signature is True
    assert prep.compressed is False
    assert prep.data == data
    assert prep.final_size == prep.original_size


def test_rejects_non_pdf():
    with pytest.raises(PdfPrepareError):
        prepare_pdf_for_storage(b"not-a-pdf")


def test_rejects_over_technical_max():
    huge = b"%PDF-1.4\n" + (b"0" * (PDF_TECHNICAL_MAX_BYTES + 10))
    with pytest.raises(PdfPrepareError, match="máximo técnico"):
        prepare_pdf_for_storage(huge)


def test_compresses_image_heavy_pdf_when_unsigned():
    data = _pdf_with_embedded_jpeg()
    assert pdf_has_certified_signature(data) is False
    assert len(data) > 50_000
    prep = prepare_pdf_for_storage(data)
    assert prep.had_certified_signature is False
    assert prep.final_size <= prep.original_size
    # Debe reducir de forma apreciable un JPEG de alta calidad embebido
    assert prep.final_size < prep.original_size * 0.9
    assert prep.compressed is True


def test_signed_pdf_skips_compression_even_if_large_markers():
    # Base con imagen + marcadores de firma → no debe tocarse
    try:
        base = _pdf_with_embedded_jpeg()
    except pytest.skip.Exception:
        raise
    signed = (
        base
        + b"\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached "
        b"/ByteRange [0 1 2 3] /Contents <00> >>\n"
    )
    assert pdf_has_certified_signature(signed) is True
    prep = prepare_pdf_for_storage(signed)
    assert prep.compressed is False
    assert prep.data == signed
