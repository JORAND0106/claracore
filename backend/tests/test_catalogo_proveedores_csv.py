"""Tests — plantilla e importación CSV de proveedores (catálogo)."""
from catalogo_insumos_service import (
    PROV_CSV_COLUMN_ALIASES,
    PROV_CSV_REQUIRED,
    PROV_CSV_TEMPLATE,
    _prov_csv_columns_error,
    _resolve_csv_columns,
    get_csv_template_proveedores,
)


def test_plantilla_proveedores_tiene_columnas_requeridas():
    tpl = get_csv_template_proveedores()
    header = tpl.strip().splitlines()[0]
    cols = [c.strip() for c in header.split(",")]
    for req in PROV_CSV_REQUIRED:
        assert req in cols
    assert "contacto_email" in cols
    assert tpl == PROV_CSV_TEMPLATE


def test_resolve_proveedores_aliases():
    col_map = _resolve_csv_columns(
        ["Proveedor", "NIT", "Correo", "Nombre contacto", "Teléfono"],
        PROV_CSV_COLUMN_ALIASES,
    )
    assert col_map["razon_social"] == "Proveedor"
    assert col_map["nit"] == "NIT"
    assert col_map["contacto_email"] == "Correo"
    assert col_map["contacto_nombre"] == "Nombre contacto"
    assert col_map["contacto_telefono"] == "Teléfono"


def test_prov_csv_columns_error_missing():
    try:
        _prov_csv_columns_error({"razon_social": "x"})
        assert False, "debía fallar sin nit"
    except ValueError as exc:
        assert "nit" in str(exc).lower()
