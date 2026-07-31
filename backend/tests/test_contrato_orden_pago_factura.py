"""Tests unitarios — factura emitida adjunta a orden de pago."""
from __future__ import annotations

import sys
from unittest.mock import MagicMock

import pytest

# azure SDK no está en el entorno mínimo de tests unitarios
for _name in (
    "azure",
    "azure.core",
    "azure.core.exceptions",
    "azure.storage",
    "azure.storage.blob",
):
    sys.modules.setdefault(_name, MagicMock())

from azure_blob_storage import path_contrato_orden_pago_factura  # noqa: E402
from contrato_orden_pago_service import (  # noqa: E402
    FACTURA_MIMES,
    MAX_FACTURA_BYTES,
    _nombre_factura_safe,
    validate_factura_upload,
)


def test_path_factura_bajo_mismo_corte():
    p = path_contrato_orden_pago_factura(12, 3, "Factura Cliente.pdf")
    assert p.startswith("contratos-ordenes-pago/12/corte-0003/factura_")
    assert p.endswith("_Factura_Cliente.pdf")


def test_validate_factura_pdf_y_imagenes():
    assert validate_factura_upload("application/pdf", 100) == "application/pdf"
    assert validate_factura_upload("image/jpeg", 100) == "image/jpeg"
    assert validate_factura_upload("image/jpg", 100) == "image/jpeg"
    assert validate_factura_upload("image/png", 50) == "image/png"
    assert validate_factura_upload("image/webp", 50) == "image/webp"


def test_validate_factura_rechaza_mime_y_vacio():
    with pytest.raises(ValueError, match="vacío"):
        validate_factura_upload("application/pdf", 0)
    with pytest.raises(ValueError, match="no permitido"):
        validate_factura_upload("application/zip", 100)
    with pytest.raises(ValueError, match="máximo"):
        validate_factura_upload("application/pdf", MAX_FACTURA_BYTES + 1)


def test_nombre_factura_safe_agrega_extension():
    assert _nombre_factura_safe("soporte", "application/pdf").endswith(".pdf")
    assert _nombre_factura_safe("foto.JPG", "image/jpeg").endswith(".jpg")
    assert "application/pdf" in FACTURA_MIMES
