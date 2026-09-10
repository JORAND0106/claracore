"""Tests unitarios — placeholders y plantilla PDF RRHH (sin DB ni Azure)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rrhh_contrato_pdf import construir_contexto_placeholders, generar_pdf_contrato_laboral


def test_placeholders_nombre_trabajador():
    ctx = construir_contexto_placeholders(
        trabajador={
            "nombres": "Ana María",
            "apellidos": "Pérez López",
            "tipo_documento": "CC",
            "numero_documento": "123456",
            "salario": 1_500_000,
            "subsidio_transporte": True,
            "empresa_nombre": "Consorcio Demo",
            "empresa_nit": "900.111.222-3",
            "cargo_aspira": "Auxiliar de obra",
            "eps": "Sura",
        },
        tipo_contrato={"nombre": "Término fijo"},
        contrato_obra={"numero": "IDU-1", "objeto": "Obra demo"},
        numero_contrato_laboral="CL-01",
        fecha_inicio="2026-01-15",
        fecha_fin="2026-12-31",
    )
    assert ctx["{{NOMBRE_TRABAJADOR}}"] == "Ana María Pérez López"
    assert ctx["{{TIPO_CONTRATO}}"] == "Término fijo"
    assert ctx["{{SUBSIDIO_TRANSPORTE}}"] == "SÍ"
    assert "1.500.000" in ctx["{{SALARIO}}"] or "1,500,000" in ctx["{{SALARIO}}"] or "1500000" in ctx["{{SALARIO}}"].replace(".", "").replace(",", "")


def test_generar_pdf_bytes():
    pdf = generar_pdf_contrato_laboral(
        trabajador={
            "nombres": "Ana",
            "apellidos": "Pérez",
            "tipo_documento": "CC",
            "numero_documento": "123",
            "salario": 1_200_000,
            "subsidio_transporte": False,
            "empresa_nombre": "Consorcio X",
            "empresa_nit": "900",
            "cargo_aspira": "Ayudante",
            "eps": "Sura",
            "pension": "Porvenir",
            "cesantias": "Porvenir",
            "arl": "Sura",
            "caja_compensacion": "Compensar",
        },
        tipo_contrato={"nombre": "Obra o labor"},
        contrato_obra={"numero": "C-1", "objeto": "Obra"},
        numero_contrato_laboral="CL-9",
        fecha_inicio="2026-02-01",
        fecha_fin=None,
    )
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 500
