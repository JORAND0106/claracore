"""Tests unitarios Bitácora de Obra (inmutabilidad, autocierre, personal)."""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock

import pytest

import bitacora_service as svc


def test_entrada_evento_inmutable_salvo_dev():
    entrada = {"tipo": "evento", "estado": "cerrado", "fecha": "2026-08-20"}
    with pytest.raises(ValueError, match="inmutable"):
        svc.assert_puede_editar_entrada(entrada, {"rol_nombre": "Contratista"})
    svc.assert_puede_editar_entrada(entrada, {"cargo_nombre": "Desarrollador"})


def test_diario_cerrado_inmutable_salvo_dev():
    entrada = {"tipo": "diario", "estado": "cerrado", "fecha": "2026-08-20"}
    with pytest.raises(ValueError, match="cerrado"):
        svc.assert_puede_editar_entrada(entrada, {"rol_nombre": "Interventoría"})
    svc.assert_puede_editar_entrada(entrada, {"rol_nombre": "Desarrollador"})


def test_diario_abierto_hoy_editable():
    hoy = svc.hoy_bogota().isoformat()
    entrada = {"tipo": "diario", "estado": "abierto", "fecha": hoy}
    svc.assert_puede_editar_entrada(entrada, {"rol_nombre": "Contratista"})


def test_debe_autocerrar_cuando_cambia_dia():
    ayer = (svc.hoy_bogota() - timedelta(days=1)).isoformat()
    entrada = {"tipo": "diario", "estado": "abierto", "fecha": ayer}
    assert svc._debe_autocerrar(entrada) is True
    hoy = svc.hoy_bogota().isoformat()
    assert svc._debe_autocerrar({"tipo": "diario", "estado": "abierto", "fecha": hoy}) is False
    assert svc._debe_autocerrar({"tipo": "evento", "estado": "cerrado", "fecha": ayer}) is False


def test_diario_vencido_bloquea_edicion_no_dev():
    ayer = (svc.hoy_bogota() - timedelta(days=1)).isoformat()
    entrada = {"tipo": "diario", "estado": "abierto", "fecha": ayer}
    with pytest.raises(ValueError, match="automáticamente"):
        svc.assert_puede_editar_entrada(entrada, {"rol_nombre": "Contratista"})
    svc.assert_puede_editar_entrada(entrada, {"cargo_nombre": "Desarrollador"})


def test_normalizar_personal_otro_cargo():
    raw = [
        {"cargo": "Oficial", "cantidad": 3},
        {"cargo": "Otro", "cantidad": 1, "cargo_otro": "Soldador"},
        {"cargo": "", "cantidad": 5},
    ]
    out = svc._normalizar_personal(raw)
    assert len(out) == 2
    assert out[0]["cargo"] == "Oficial" and out[0]["cantidad"] == 3
    assert out[1]["cargo_otro"] == "Soldador"


def test_normalizar_personal_cargos_nuevos():
    out = svc._normalizar_personal([
        {"cargo": "Boal", "cantidad": 2},
        {"cargo": "Ing. SST", "cantidad": 1},
        {"cargo": "Insp. Tráfico", "cantidad": 3},
    ])
    assert [x["cargo"] for x in out] == ["Boal", "Ing. SST", "Insp. Tráfico"]


def test_normalizar_imagenes_max_4():
    raw = [{"nombre": f"f{i}.png", "data_uri": f"data:image/png;base64,xx{i}"} for i in range(6)]
    out = svc._normalizar_imagenes(raw)
    assert len(out) == svc.MAX_IMAGENES_BITACORA == 4


def test_clima_label_conocido():
    assert "Despejado" in svc.clima_label(0)
    assert svc.clima_label(None) == ""


def test_normalizar_materiales_con_vales():
    raw = [
        {
            "movimiento": "salida",
            "tipo_material": "Acero",
            "proveedor": "Acerías",
            "cantidad": 12,
            "placa": "ABC123",
            "numeros_vale": "10, 11",
            "adjuntos": [{"nombre": "rem.png", "data_uri": "data:image/png;base64,xx"}],
        },
        {"tipo_material": "", "proveedor": "", "numeros_vale": ""},
    ]
    out = svc._normalizar_materiales(raw)
    assert len(out) == 1
    assert out[0]["movimiento"] == "salida"
    assert out[0]["placa"] == "ABC123"
    assert out[0]["numeros_vale"] == "10, 11"
    assert len(out[0]["adjuntos"]) == 1


def test_normalizar_materiales_legacy_vales_adjuntos():
    raw = [{
        "tipo_material": "Arena",
        "proveedor": "X",
        "vales": [{"nombre": "v1.png", "data_uri": "data:image/png;base64,aa"}],
    }]
    out = svc._normalizar_materiales(raw)
    assert len(out) == 1
    assert out[0]["numeros_vale"] == ""
    assert len(out[0]["adjuntos"]) == 1


def test_expandir_personal_otro():
    out = svc._expandir_personal_otro([
        {"cargo": "Oficial", "cantidad": 2},
        {"cargo": "Otro", "cantidad": 1, "cargo_otro": "Soldador"},
    ])
    assert out[1]["cargo"] == "Soldador"
    assert "cargo_otro" not in out[1]


def test_strip_autocompletar_excluye_materiales():
    entrada = {
        "id": 3,
        "fecha": "2026-08-20",
        "personal": [{"cargo": "Oficial", "cantidad": 4}],
        "equipos_uso": [{
            "equipo_nombre": "Retro",
            "operador": "Juan",
            "cantidad": 1,
            "preoperacionales": [{"nombre": "p.png", "data_uri": "data:x"}],
        }],
        "materiales": [{
            "movimiento": "ingreso",
            "tipo_material": "Grava",
            "proveedor": "Y",
            "cantidad": 5,
            "placa": "XYZ99",
            "numeros_vale": "55",
            "adjuntos": [{"nombre": "r.png", "data_uri": "data:x"}],
        }],
    }
    out = svc._strip_para_autocompletar(entrada)
    assert out["personal"][0]["cantidad"] == 4
    assert out["equipos_uso"][0]["preoperacionales"] == []
    assert out["equipos_uso"][0]["equipo_nombre"] == "Retro"
    assert out["materiales"] == []
    assert out.get("fuente_fecha") == "2026-08-20"


def test_asegurar_autocierre_llama_cierre(monkeypatch):
    ayer = (svc.hoy_bogota() - timedelta(days=1)).isoformat()
    entrada = {"id": 9, "tipo": "diario", "estado": "abierto", "fecha": ayer}
    called = {}

    def fake_cierre(sb, eid, uid, motivo):
        called["eid"] = eid
        called["motivo"] = motivo
        return {"estado": "cerrado", "cierre_motivo": motivo}

    monkeypatch.setattr(svc, "_aplicar_cierre", fake_cierre)
    out = svc.asegurar_autocierre_entrada(MagicMock(), entrada)
    assert called["eid"] == 9
    assert called["motivo"] == "automatico_dia"
    assert out["estado"] == "cerrado"
