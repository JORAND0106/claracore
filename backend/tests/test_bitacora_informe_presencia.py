"""Tests — informes consolidados asistencia / maquinaria."""
from datetime import date

from bitacora_informe_presencia import (
    CODIGO_ASISTENCIA,
    DIAS_POR_BLOQUE,
    _bloques,
    _html_informe,
    construir_matriz_asistencia,
    construir_matriz_maquinaria,
    generar_pdf_presencia,
    meta_dias,
)


def test_meta_dias_festivo_y_domingo():
    # 2026-11-16 lunes festivo; 2026-11-15 domingo
    metas = meta_dias([date(2026, 11, 15), date(2026, 11, 16), date(2026, 11, 17)])
    assert metas[0]["especial"] is True and metas[0]["inicial"] == "D"
    assert metas[1]["especial"] is True and metas[1]["label"] == "16L"
    assert metas[2]["especial"] is False


def test_bloques_parten_periodos_largos():
    dias = meta_dias([date(2026, 1, 1) + __import__("datetime").timedelta(days=i) for i in range(40)])
    bl = _bloques(dias, size=28)
    assert len(bl) == 2
    assert len(bl[0]) == 28 and len(bl[1]) == 12


def test_matriz_asistencia_marcas_y_totales(monkeypatch):
    diarios = [
        {
            "tipo": "diario",
            "fecha": "2026-11-10",
            "asistencia_colaboradores": [{
                "nombre": "Ana Perez",
                "documento_numero": "222",
                "cargo": "Oficial",
                "subcontratista_nombre": "Empresa A",
                "rrhh_trabajador_id": 1,
            }],
        },
        {
            "tipo": "diario",
            "fecha": "2026-11-12",
            "asistencia_colaboradores": [{
                "nombre": "Ana Perez",
                "documento_numero": "222",
                "cargo": "Oficial",
                "subcontratista_nombre": "Empresa A",
                "rrhh_trabajador_id": 1,
            }],
        },
    ]
    trabs = [{
        "id": 1,
        "nombres": "Ana",
        "apellidos": "Perez",
        "numero_documento": "222",
        "cargo_aspira": "Oficial",
        "empresa_nombre": "Empresa A",
        "estado": "activo",
    }, {
        "id": 2,
        "nombres": "Luis",
        "apellidos": "Mora",
        "numero_documento": "333",
        "cargo_aspira": "Ayudante",
        "empresa_nombre": "Empresa A",
        "estado": "activo",
    }]

    monkeypatch.setattr(
        "bitacora_informe_presencia.list_diarios_rango",
        lambda *_a, **_k: diarios,
    )

    import rrhh_service as rrhh_mod
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabs)

    data = construir_matriz_asistencia(
        None, 3,
        fecha_desde="2026-11-10",
        fecha_hasta="2026-11-12",
        empresa_key="Empresa A",
    )
    assert len(data["dias"]) == 3
    # Orden: cargo Ayudante luego Oficial
    assert data["filas"][0]["nombre"] == "Luis Mora"
    assert data["filas"][0]["total"] == 0
    assert data["filas"][0]["marcas"] == ["", "", ""]
    assert data["filas"][1]["nombre"] == "Ana Perez"
    assert data["filas"][1]["total"] == 2
    assert data["filas"][1]["marcas"] == ["X", "", "X"]


def test_matriz_maquinaria_por_operador_empresa(monkeypatch):
    diarios = [{
        "tipo": "diario",
        "fecha": "2026-11-10",
        "equipos_uso": [{
            "equipo_id": 10,
            "equipo_nombre": "Retro 01",
            "tipo": "maquina",
            "operador_rrhh_id": 1,
            "operador": "Ana Perez",
        }],
    }, {
        "tipo": "diario",
        "fecha": "2026-11-11",
        "equipos_uso": [{
            "equipo_id": 10,
            "equipo_nombre": "Retro 01",
            "tipo": "maquina",
            "operador_rrhh_id": 1,
        }],
    }]
    trabs = [{
        "id": 1,
        "nombres": "Ana",
        "apellidos": "Perez",
        "empresa_nombre": "Empresa A",
        "estado": "activo",
    }]
    monkeypatch.setattr(
        "bitacora_informe_presencia.list_diarios_rango",
        lambda *_a, **_k: diarios,
    )
    import rrhh_service as rrhh_mod
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabs)

    data = construir_matriz_maquinaria(
        None, 3,
        fecha_desde="2026-11-10",
        fecha_hasta="2026-11-11",
        empresa_key="Empresa A",
    )
    assert len(data["filas"]) == 1
    assert data["filas"][0]["nombre"] == "Retro 01"
    assert data["filas"][0]["identificacion"] == "10"
    assert data["filas"][0]["marcas"] == ["X", "X"]
    assert data["filas"][0]["total"] == 2


def test_pdf_asistencia_sombrea_festivo_y_parte_bloques():
    dias = meta_dias([date(2026, 11, d) for d in range(1, 31)])  # nov 2026 incluye festivo 16
    assert any(d["especial"] and d["dia"] == 16 for d in dias)
    filas = [{
        "no": 1,
        "nombre": "Ana Perez",
        "documento": "222",
        "cargo": "Oficial",
        "marcas": ["X" if i % 2 == 0 else "" for i in range(len(dias))],
        "total": 15,
    }]
    # Forzar 2 bloques
    assert len(_bloques(dias, DIAS_POR_BLOQUE)) >= 1
    payload = {
        "tipo": "personal",
        "contrato": {"numero": "CTO-3", "objeto": "Obra", "contratista": "X"},
        "empresa": "Empresa A",
        "fecha_desde": "2026-11-01",
        "fecha_hasta": "2026-11-30",
        "dias": dias,
        "filas": filas,
        "formato": {
            "codigo": CODIGO_ASISTENCIA,
            "version": "1.0",
            "titulo": "INFORME DE ASISTENCIA DE PERSONAL",
        },
    }
    html = _html_informe(payload)
    assert "INFORME DE ASISTENCIA" in html
    assert "FED7AA" in html  # sombreado festivo
    assert "margin: 2mm" in html
    pdf = generar_pdf_presencia(payload)
    assert pdf[:4] == b"%PDF"
