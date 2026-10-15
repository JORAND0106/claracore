"""Tests — auditoría documental RRHH (inventario + tabla)."""
from __future__ import annotations

from rrhh_auditoria_docs import (
    auditoria_fue_ejecutada,
    auditoria_tiene_discrepancias,
    construir_filas_informe,
    indexar_adjuntos,
    slots_checklist_auditoria,
    ubicacion_tipo,
)


def test_ubicacion_tipo():
    assert ubicacion_tipo("soporte", "Cédula") == "Documentos de soporte · Cédula"
    assert ubicacion_tipo("contrato_laboral", "Contrato laboral").startswith("Contrato")


def test_slots_incluyen_contrato_y_cedula():
    slots = slots_checklist_auditoria({})
    keys = {(s["categoria"], s["tipo"]) for s in slots}
    assert ("contrato_laboral", "contrato_laboral") in keys
    assert ("soporte", "cedula") in keys
    assert ("afiliacion", "cert_eps") in keys


def test_documento_cargado_nunca_es_no_cargado_aunque_ia_diga_no_encontrado():
    slots = [
        {
            "categoria": "soporte",
            "tipo": "cedula",
            "label": "Cédula",
            "ubicacion": "Documentos de soporte · Cédula",
            "opcional": False,
        },
        {
            "categoria": "contrato_laboral",
            "tipo": "contrato_laboral",
            "label": "Contrato laboral",
            "ubicacion": "Contrato · Contrato laboral",
            "opcional": False,
        },
    ]
    adjuntos = indexar_adjuntos([
        {
            "categoria": "soporte",
            "tipo": "cedula",
            "nombre_archivo": "cedula.pdf",
            "version_label": "Original",
        },
        {
            "categoria": "contrato_laboral",
            "tipo": "contrato_laboral",
            "nombre_archivo": "contrato_laboral_v1.pdf",
            "version_num": 1,
        },
    ])
    hallazgos_ia = [
        {"campo": "cedula", "estado": "NO ENCONTRADO", "valor_bd": "CC 1", "valor_pdf": None, "detalle": ""},
        {"campo": "tipo_contrato", "estado": "NO ENCONTRADO", "valor_bd": "Obra o labor", "valor_pdf": None, "detalle": ""},
    ]
    filas = construir_filas_informe(slots, adjuntos, hallazgos_ia=hallazgos_ia)
    by_tipo = {f["tipo"]: f for f in filas}
    assert by_tipo["cedula"]["estado"] != "NO_CARGADO"
    assert by_tipo["cedula"]["archivo"] == "cedula.pdf"
    assert "no cargado" not in by_tipo["cedula"]["hallazgo"].lower()
    assert by_tipo["contrato_laboral"]["estado"] != "NO_CARGADO"
    assert by_tipo["contrato_laboral"]["archivo"] == "contrato_laboral_v1.pdf"


def test_sin_archivo_es_documento_no_cargado():
    slots = [{
        "categoria": "soporte",
        "tipo": "cedula",
        "label": "Cédula",
        "ubicacion": "Documentos de soporte · Cédula",
        "opcional": False,
    }]
    filas = construir_filas_informe(slots, {}, hallazgos_ia=[])
    assert filas[0]["estado"] == "NO_CARGADO"
    assert filas[0]["hallazgo"] == "Documento no cargado"
    assert filas[0]["archivo"] == "—"


def test_sin_diferencias_aparece_en_tabla():
    slots = [{
        "categoria": "soporte",
        "tipo": "cedula",
        "label": "Cédula",
        "ubicacion": "Documentos de soporte · Cédula",
        "opcional": False,
    }]
    adj = indexar_adjuntos([{
        "categoria": "soporte",
        "tipo": "cedula",
        "nombre_archivo": "cc.pdf",
        "version_label": "Original",
    }])
    hallazgos = [
        {"campo": "cedula", "estado": "OK", "valor_bd": "CC 1", "valor_pdf": "CC 1", "detalle": ""},
    ]
    filas = construir_filas_informe(slots, adj, hallazgos_ia=hallazgos)
    assert filas[0]["hallazgo"] == "Sin diferencias"
    assert filas[0]["estado"] == "OK"


def test_discrepancia_en_hallazgo():
    slots = [{
        "categoria": "contrato_laboral",
        "tipo": "contrato_laboral",
        "label": "Contrato laboral",
        "ubicacion": "Contrato · Contrato laboral",
        "opcional": False,
    }]
    adj = indexar_adjuntos([{
        "categoria": "contrato_laboral",
        "tipo": "contrato_laboral",
        "nombre_archivo": "cto.pdf",
        "version_num": 2,
    }])
    hallazgos = [{
        "campo": "tipo_contrato",
        "estado": "DISCREPANCIA",
        "valor_bd": "Obra o labor",
        "valor_pdf": "Término fijo",
        "detalle": "No coincide",
    }]
    filas = construir_filas_informe(slots, adj, hallazgos_ia=hallazgos)
    assert filas[0]["estado"] == "DISCREPANCIA"
    assert "Diferencia encontrada" in filas[0]["hallazgo"]
    assert filas[0]["version"] == "v2"


def test_auditoria_fue_ejecutada():
    assert auditoria_fue_ejecutada({}) is False
    assert auditoria_fue_ejecutada({"doc_auditoria_en": "2026-10-15T00:00:00Z"}) is True
    assert auditoria_fue_ejecutada({"doc_auditoria_informe_id": 9}) is True
    # ok=false pero con fecha → sí se ejecutó
    assert auditoria_fue_ejecutada({
        "doc_auditoria_ok": False,
        "doc_auditoria_en": "2026-10-15T00:00:00Z",
    }) is True


def test_tiene_discrepancias_con_filas():
    assert auditoria_tiene_discrepancias({
        "filas": [{"estado": "OK", "opcional": False}],
    }) is False
    assert auditoria_tiene_discrepancias({
        "filas": [{"estado": "DISCREPANCIA", "opcional": False}],
    }) is True
    assert auditoria_tiene_discrepancias({
        "filas": [{"estado": "NO_CARGADO", "opcional": True}],
    }) is False
    assert auditoria_tiene_discrepancias({
        "filas": [{"estado": "NO_CARGADO", "opcional": False}],
    }) is True
