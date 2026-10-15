"""Reglas de obligatoriedad usadas por consolidado / avance / informe."""
from __future__ import annotations

from rrhh_docs_obligatoriedad import (
    AFILIACION_OBLIGATORIAS,
    DOC_OPCIONALES,
    doc_aplica_checklist,
    es_doc_opcional,
)


def test_afiliacion_obligatorias_siempre_aplican():
    trab = {"eps": "", "pension": "", "arl": "", "cesantias": ""}
    for tipo in AFILIACION_OBLIGATORIAS:
        assert doc_aplica_checklist(trab, "afiliacion", tipo) is True
        assert not es_doc_opcional("afiliacion", tipo)


def test_opcionales_conjunto():
    assert DOC_OPCIONALES == frozenset({
        ("soporte", "hoja_vida"),
        ("soporte", "certificados"),
        ("afiliacion", "cert_caja"),
    })
    assert es_doc_opcional("afiliacion", "cert_caja")
    assert doc_aplica_checklist({}, "afiliacion", "cert_caja") is True
