"""Tests — informe Estado documental de colaboradores (RRHH)."""
from __future__ import annotations

from rrhh_estado_documental_informe import (
    ESTADO_DOCUMENTAL_FORMATO,
    _celda_doc,
    _columnas_checklist,
    _documento_identidad,
    _es_aprobado,
    _filtrar_trabajadores,
    _filtro_label,
    _nombre_completo,
    _slug_tipo,
    build_estado_documental_pdf,
    build_estado_documental_xlsx,
)


def test_formato_calidad_ajustable():
    assert ESTADO_DOCUMENTAL_FORMATO["codigo"] == "CC-RRHH-DOC-001"
    assert ESTADO_DOCUMENTAL_FORMATO["version"] == "1.0"
    assert "documental" in ESTADO_DOCUMENTAL_FORMATO["nombre"].lower()


def test_slug_tipo_otro():
    assert _slug_tipo("Carta de recomendación") == "ext_carta_de_recomendacion"
    assert _slug_tipo("  ").startswith("ext_")


def test_filtrar_trabajadores_tres_opciones():
    rows = [
        {"id": 1, "doc_validacion_estado": "aprobado"},
        {"id": 2, "doc_validacion_estado": "pendiente"},
        {"id": 3, "doc_validacion_estado": "rechazado"},
        {"id": 4, "doc_validacion_estado": "Aprobado"},
    ]
    assert [r["id"] for r in _filtrar_trabajadores(rows, "todos")] == [1, 2, 3, 4]
    assert [r["id"] for r in _filtrar_trabajadores(rows, "aprobado")] == [1, 4]
    assert [r["id"] for r in _filtrar_trabajadores(rows, "sin_aprobar")] == [2, 3]
    assert _filtro_label("sin_aprobar") == "Personal sin aprobar"


def test_identidad_helpers():
    t = {
        "nombres": "Ana",
        "apellidos": "López",
        "tipo_documento": "CC",
        "numero_documento": "123",
        "doc_validacion_estado": "aprobado",
    }
    assert _nombre_completo(t) == "Ana López"
    assert _documento_identidad(t) == "CC 123"
    assert _es_aprobado(t) is True
    assert _es_aprobado({"doc_validacion_estado": "pendiente"}) is False


def test_columnas_checklist_incluye_custom_otro_sin_slot_ui():
    custom = [
        ("soporte", "ext_carta", "Carta laboral"),
        ("ingreso", "ext_carnet", "Carnet obra"),
    ]
    cols = _columnas_checklist(custom)
    keys = [c["key"] for c in cols]
    assert keys[0] == "contrato_laboral"
    assert "soporte:cedula" in keys
    assert "soporte:ext_carta" in keys
    assert "ingreso:ext_carnet" in keys
    assert "afiliacion:cert_eps" in keys
    # El slot UI «otro» no es columna del informe
    assert not any(c["tipo"] == "otro" for c in cols)
    # Orden de grupos: contrato → soporte → ingreso → afiliación
    cats = [c["categoria"] for c in cols]
    assert cats.index("contrato_laboral") < cats.index("soporte")
    assert cats.index("soporte") < cats.index("ingreso")
    assert cats.index("ingreso") < cats.index("afiliacion")


def test_celda_cargado_falta_na():
    trab = {"eps": "Sura", "pension": "", "arl": "Positiva", "cesantias": "X", "caja_compensacion": "Y"}
    col_contrato = {"categoria": "contrato_laboral", "tipo": "contrato_laboral"}
    col_cedula = {"categoria": "soporte", "tipo": "cedula"}
    col_eps = {"categoria": "afiliacion", "tipo": "cert_eps"}
    col_pension = {"categoria": "afiliacion", "tipo": "cert_pension"}

    assert _celda_doc(trab, col_contrato, vigentes=set(), tiene_contrato=True, aprobado=False) == "Sí"
    assert _celda_doc(trab, col_contrato, vigentes=set(), tiene_contrato=False, aprobado=False) == "Falta"
    assert _celda_doc(
        trab, col_cedula, vigentes={("soporte", "cedula")}, tiene_contrato=False, aprobado=False,
    ) == "Sí"
    assert _celda_doc(trab, col_cedula, vigentes=set(), tiene_contrato=False, aprobado=False) == "Falta"
    assert _celda_doc(trab, col_eps, vigentes=set(), tiene_contrato=False, aprobado=False) == "Falta"
    assert _celda_doc(trab, col_pension, vigentes=set(), tiene_contrato=False, aprobado=False) == "N/A"
    # Aprobado → Sí aunque falte el archivo (post-consolidación)
    assert _celda_doc(trab, col_cedula, vigentes=set(), tiene_contrato=False, aprobado=True) == "Sí"


def _sample_matrix():
    return {
        "formato": dict(ESTADO_DOCUMENTAL_FORMATO),
        "filtro": "todos",
        "fecha_calidad": "15/10/2026",
        "contrato": {
            "numero": "C-001",
            "contratista": "Consorcio Demo",
            "nit": "900",
            "objeto": "Obra demo",
        },
        "identity_columns": [
            {"key": "nombre", "label": "Nombre y Apellido"},
            {"key": "cargo", "label": "Cargo"},
            {"key": "documento", "label": "Documento de identidad"},
        ],
        "doc_columns": [
            {"key": "contrato_laboral", "label": "Contrato laboral", "categoria": "contrato_laboral", "tipo": "contrato_laboral"},
            {"key": "soporte:cedula", "label": "Cédula", "categoria": "soporte", "tipo": "cedula"},
        ],
        "rows": [
            {
                "id": 1,
                "nombre": "Ana López",
                "cargo": "Auxiliar",
                "documento": "CC 1",
                "celdas": {"contrato_laboral": "Sí", "soporte:cedula": "Falta"},
            },
        ],
        "total": 1,
    }


def test_xlsx_incluye_codigo_y_titulo():
    data, fname = build_estado_documental_xlsx(_sample_matrix())
    assert fname.startswith("CC-RRHH-DOC-001_")
    assert fname.endswith(".xlsx")
    assert data[:2] == b"PK"  # zip/xlsx

    from openpyxl import load_workbook
    from io import BytesIO

    wb = load_workbook(BytesIO(data))
    ws = wb.active
    # Encabezado institucional: título en B1, código en E1
    assert "ESTADO DOCUMENTAL" in str(ws.cell(1, 2).value or "").upper()
    cal = str(ws.cell(1, 5).value or "")
    assert "CC-RRHH-DOC-001" in cal
    assert "Versión" in cal
    # Headers de matriz
    assert ws.cell(6, 1).value == "Nombre y Apellido"
    assert ws.cell(6, 4).value == "Contrato laboral"
    assert ws.cell(7, 1).value == "Ana López"
    assert ws.cell(7, 5).value == "Falta"


def test_pdf_genera_bytes():
    data, fname = build_estado_documental_pdf(_sample_matrix())
    assert fname.endswith(".pdf")
    assert data[:4] == b"%PDF"
    assert b"CC-RRHH-DOC-001" in data or b"ESTADO DOCUMENTAL" in data or len(data) > 500
