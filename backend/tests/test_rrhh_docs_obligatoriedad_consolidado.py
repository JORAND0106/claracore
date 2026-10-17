"""Reglas de obligatoriedad usadas por consolidado / avance / informe."""
from __future__ import annotations

from rrhh_docs_obligatoriedad import (
    AFILIACION_OBLIGATORIAS,
    DOC_OPCIONALES,
    PLANILLA_PAGO_TIPO,
    doc_aplica_checklist,
    es_doc_opcional,
)


def test_afiliacion_obligatorias_siempre_aplican():
    trab = {"eps": "", "pension": "", "arl": "", "cesantias": "", "tipo_contrato": "Término fijo"}
    for tipo in AFILIACION_OBLIGATORIAS:
        assert doc_aplica_checklist(trab, "afiliacion", tipo) is True
        assert not es_doc_opcional("afiliacion", tipo)
    assert doc_aplica_checklist(trab, "afiliacion", PLANILLA_PAGO_TIPO) is False


def test_opcionales_conjunto():
    assert DOC_OPCIONALES == frozenset({
        ("soporte", "hoja_vida"),
        ("soporte", "certificados"),
        ("afiliacion", "cert_caja"),
    })
    assert es_doc_opcional("afiliacion", "cert_caja")
    assert doc_aplica_checklist({}, "afiliacion", "cert_caja") is True


def test_prestacion_servicios_planilla_no_afiliacion():
    trab = {"tipo_contrato": "Prestación de servicios"}
    for tipo in AFILIACION_OBLIGATORIAS:
        assert doc_aplica_checklist(trab, "afiliacion", tipo) is False
    assert doc_aplica_checklist(trab, "afiliacion", "cert_caja") is False
    assert doc_aplica_checklist(trab, "afiliacion", PLANILLA_PAGO_TIPO) is True
    assert not es_doc_opcional("afiliacion", PLANILLA_PAGO_TIPO)
    # Soporte/ingreso no cambian
    assert doc_aplica_checklist(trab, "soporte", "cedula") is True
