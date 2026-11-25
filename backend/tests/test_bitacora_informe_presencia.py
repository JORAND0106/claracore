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


def test_matriz_asistencia_todas_empresas_subtotales(monkeypatch):
    from bitacora_horas_extra_export import EMPRESA_TODAS_KEY, EMPRESA_TODAS_LABEL

    diarios = [
        {
            "tipo": "diario",
            "fecha": "2026-11-10",
            "asistencia_colaboradores": [
                {
                    "nombre": "Ana Perez",
                    "documento_numero": "222",
                    "cargo": "Oficial",
                    "subcontratista_nombre": "Empresa A",
                    "rrhh_trabajador_id": 1,
                },
                {
                    "nombre": "Luis Mora",
                    "documento_numero": "333",
                    "cargo": "Ayudante",
                    "subcontratista_nombre": "Empresa B",
                    "rrhh_trabajador_id": 2,
                },
            ],
        },
        {
            "tipo": "diario",
            "fecha": "2026-11-11",
            "asistencia_colaboradores": [{
                "nombre": "Ana Perez",
                "documento_numero": "222",
                "cargo": "Oficial",
                "subcontratista_nombre": "Empresa A",
                "rrhh_trabajador_id": 1,
            }],
        },
    ]
    trabs = [
        {
            "id": 1, "nombres": "Ana", "apellidos": "Perez",
            "numero_documento": "222", "cargo_aspira": "Oficial",
            "empresa_nombre": "Empresa A", "estado": "activo",
        },
        {
            "id": 2, "nombres": "Luis", "apellidos": "Mora",
            "numero_documento": "333", "cargo_aspira": "Ayudante",
            "empresa_nombre": "Empresa B", "estado": "activo",
        },
    ]
    monkeypatch.setattr(
        "bitacora_informe_presencia.list_diarios_rango",
        lambda *_a, **_k: diarios,
    )
    import rrhh_service as rrhh_mod
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabs)

    data = construir_matriz_asistencia(
        None, 3,
        fecha_desde="2026-11-10",
        fecha_hasta="2026-11-11",
        empresa_key=EMPRESA_TODAS_KEY,
    )
    assert data["empresa"] == EMPRESA_TODAS_LABEL
    tipos = [r["tipo"] for r in data["filas"]]
    assert tipos[0] == "empresa"
    assert "subtotal_empresa" in tipos and tipos[-1] == "total"
    # No continuo: Ana=1, Luis=2
    detalle = [r for r in data["filas"] if r["tipo"] == "detalle"]
    assert [r["no"] for r in detalle] == [1, 2]
    sub_a = next(r for r in data["filas"] if r["tipo"] == "subtotal_empresa" and r["nombre"] == "Empresa A")
    sub_b = next(r for r in data["filas"] if r["tipo"] == "subtotal_empresa" and r["nombre"] == "Empresa B")
    assert sub_a["total"] == 2 and sub_a["marcas"] == ["1", "1"]
    assert sub_b["total"] == 1 and sub_b["marcas"] == ["1", ""]
    tot = data["filas"][-1]
    assert tot["total"] == 3 and tot["marcas"] == ["2", "1"]

    # Una empresa: igual que antes
    solo = construir_matriz_asistencia(
        None, 3,
        fecha_desde="2026-11-10",
        fecha_hasta="2026-11-11",
        empresa_key="Empresa A",
    )
    assert len([r for r in solo["filas"] if r.get("tipo") == "detalle" or r.get("no")]) >= 1
    assert solo["empresa"] == "Empresa A"
    assert all(r.get("tipo") != "empresa" for r in solo["filas"])


def test_matriz_maquinaria_todas_empresas(monkeypatch):
    from bitacora_horas_extra_export import EMPRESA_TODAS_KEY

    diarios = [{
        "tipo": "diario",
        "fecha": "2026-11-10",
        "equipos_uso": [
            {
                "equipo_id": 10, "equipo_nombre": "Retro 01", "tipo": "maquina",
                "operador_rrhh_id": 1, "operador": "Ana Perez",
            },
            {
                "equipo_id": 20, "equipo_nombre": "Mixer 02", "tipo": "maquina",
                "operador_rrhh_id": 2, "operador": "Luis Mora",
            },
        ],
    }]
    trabs = [
        {"id": 1, "nombres": "Ana", "apellidos": "Perez",
         "empresa_nombre": "Empresa A", "estado": "activo"},
        {"id": 2, "nombres": "Luis", "apellidos": "Mora",
         "empresa_nombre": "Empresa B", "estado": "activo"},
    ]
    monkeypatch.setattr(
        "bitacora_informe_presencia.list_diarios_rango",
        lambda *_a, **_k: diarios,
    )
    import rrhh_service as rrhh_mod
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabs)

    data = construir_matriz_maquinaria(
        None, 3,
        fecha_desde="2026-11-10",
        fecha_hasta="2026-11-10",
        empresa_key=EMPRESA_TODAS_KEY,
    )
    tipos = [r["tipo"] for r in data["filas"]]
    assert tipos.count("empresa") == 2
    assert tipos.count("subtotal_empresa") == 2
    assert tipos[-1] == "total"
    assert data["filas"][-1]["total"] == 2
    assert data["filas"][-1]["marcas"] == ["2"]


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
