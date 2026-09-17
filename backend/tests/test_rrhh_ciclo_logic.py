"""Tests unitarios — ciclo laboral RRHH (sin DB)."""
from __future__ import annotations

from datetime import date, timedelta

from rrhh_ciclo_logic import (
    agrupar_por_empresa,
    clasificar_documento_existente,
    CLAUSULA_LEY_1581,
    debe_alertar_periodo_prueba,
    debe_alertar_vencimiento_10,
    debe_alertar_vencimiento_35,
    es_termino_fijo,
    fecha_fin_periodo_prueba,
    payload_listado,
    puede_ver_salario,
)


def test_es_termino_fijo_catalogo():
    assert es_termino_fijo("Término fijo")
    assert es_termino_fijo("termino_fijo")
    assert not es_termino_fijo("Término indefinido")
    assert not es_termino_fijo("Obra o labor")


def test_alerta_35_y_10():
    hoy = date(2026, 9, 1)
    fin = hoy + timedelta(days=30)
    assert debe_alertar_vencimiento_35(
        tipo_contrato="Término fijo",
        fecha_fin=fin,
        ya_enviada=False,
        hoy=hoy,
    )
    assert not debe_alertar_vencimiento_35(
        tipo_contrato="Término indefinido",
        fecha_fin=fin,
        ya_enviada=False,
        hoy=hoy,
    )
    assert debe_alertar_vencimiento_10(
        tipo_contrato="Término fijo",
        fecha_fin=hoy + timedelta(days=8),
        tiene_renovacion_u_otrosi=False,
        ya_enviada=False,
        hoy=hoy,
    )
    assert not debe_alertar_vencimiento_10(
        tipo_contrato="Término fijo",
        fecha_fin=hoy + timedelta(days=8),
        tiene_renovacion_u_otrosi=True,
        ya_enviada=False,
        hoy=hoy,
    )


def test_alerta_periodo_prueba_5_dias():
    hoy = date(2026, 9, 1)
    fin = hoy + timedelta(days=4)
    assert debe_alertar_periodo_prueba(fecha_fin_prueba=fin, ya_enviada=False, hoy=hoy)
    assert not debe_alertar_periodo_prueba(fecha_fin_prueba=fin, ya_enviada=True, hoy=hoy)
    assert fecha_fin_periodo_prueba("2026-03-01", 60) == date(2026, 4, 30)


def test_reingreso_por_cedula():
    assert clasificar_documento_existente(None) is None
    assert clasificar_documento_existente({"estado": "activo"}) == "activo"
    assert clasificar_documento_existente({"estado": "retirado"}) == "reingreso"


def test_ley_1581_y_salario():
    assert "Ley 1581 de 2012" in CLAUSULA_LEY_1581
    assert puede_ver_salario({"cargo_nombre": "Administrativo"})
    assert puede_ver_salario({"cargo_nombre": "Desarrollador"})
    assert puede_ver_salario({"cargo_nombre": "Administrador"})
    assert not puede_ver_salario({"cargo_nombre": "Residente"})


def test_agrupar_empresas_y_listado_liviano():
    rows = [
        {
            "id": 1,
            "empresa_tipo": "consorcio",
            "empresa_nombre": "Consorcio Demo",
            "cargo_aspira": "Oficial",
            "estado": "activo",
            "salario": 2_000_000,
            "foto_blob_path": "x",
            "nombres": "Ana",
            "apellidos": "Pérez",
        },
        {
            "id": 2,
            "empresa_tipo": "subcontratista",
            "empresa_nombre": "Sub A",
            "empresa_subcontratista_id": 9,
            "cargo_aspira": "Ayudante",
            "estado": "retirado",
            "salario": 1_500_000,
            "nombres": "Luis",
            "apellidos": "Díaz",
        },
    ]
    grupos = agrupar_por_empresa(rows, ver_salario=True)
    assert grupos[0]["empresa_key"] == "consorcio"
    assert grupos[0]["total_nomina"] == 2_000_000
    hidden = agrupar_por_empresa(rows, ver_salario=False)
    assert hidden[0]["total_nomina"] is None
    lite = payload_listado(rows[0], ver_salario=False)
    assert "salario" not in lite
    assert lite["salario_oculto"] is True
    assert "foto_blob_path" not in lite
