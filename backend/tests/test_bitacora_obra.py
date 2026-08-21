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


def test_debe_autocerrar_a_las_235959():
    hoy = svc.hoy_bogota()
    ayer = hoy - timedelta(days=1)
    entrada_ayer = {"tipo": "diario", "estado": "abierto", "fecha": ayer.isoformat()}
    assert svc._debe_autocerrar(entrada_ayer) is True

    entrada_hoy = {"tipo": "diario", "estado": "abierto", "fecha": hoy.isoformat()}
    antes = svc.momento_cierre_diario(hoy).replace(hour=23, minute=59, second=58)
    assert svc._debe_autocerrar(entrada_hoy, ahora=antes) is False
    justo = svc.momento_cierre_diario(hoy)
    assert svc._debe_autocerrar(entrada_hoy, ahora=justo) is True
    manana = justo + timedelta(seconds=1)
    assert svc._debe_autocerrar(entrada_hoy, ahora=manana) is True
    assert svc._debe_autocerrar(
        {"tipo": "evento", "estado": "cerrado", "fecha": ayer.isoformat()},
    ) is False


def test_cerrar_manual_deshabilitado():
    with pytest.raises(ValueError, match="cierre manual"):
        svc.cerrar_reporte_diario(
            MagicMock(), 1, 9, 1, current_user={"rol_nombre": "Contratista"},
        )


def test_sync_tipos_material_desde_materiales(monkeypatch):
    called = []

    def fake_upsert(sb, cid, nombre, user_id=None):
        called.append((cid, nombre, user_id))
        return {"id": len(called), "nombre": nombre}

    monkeypatch.setattr(svc, "upsert_tipo_material", fake_upsert)
    svc.sync_tipos_material_desde_materiales(
        MagicMock(),
        7,
        [{"tipo_material": "Grava"}, {"tipo_material": ""}, {"tipo_material": "Arena"}],
        user_id=3,
    )
    assert called == [(7, "Grava", 3), (7, "Arena", 3)]
    assert svc._norm_nombre_tipo_material("  Concreto   3000 ") == "concreto 3000"


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


def test_enrich_imagen_no_descarga_azure():
    """Regresión perf: preview no embebe data_uri ni toca Azure."""
    out = svc._enrich_imagen_preview({
        "nombre": "f.png",
        "blob_path": "seguimiento-bitacora/1/x.png",
        "mime_type": "image/png",
    })
    assert out["blob_path"].endswith("x.png")
    assert "data_uri" not in out


def test_assert_blob_path_contrato():
    assert svc.assert_blob_path_del_contrato(5, "seguimiento-bitacora/5/a.png").endswith("a.png")
    with pytest.raises(ValueError):
        svc.assert_blob_path_del_contrato(5, "seguimiento-bitacora/9/a.png")
    with pytest.raises(ValueError):
        svc.assert_blob_path_del_contrato(5, "../etc/passwd")


def test_crear_diario_no_relee_ni_descarga(monkeypatch):
    """Crear diario: respuesta desde insert + usos, sin get_entrada."""
    hoy = svc.hoy_bogota().isoformat()

    class FakeTable:
        def __init__(self, name):
            self.name = name
            self._payload = None

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def insert(self, payload):
            self._payload = payload
            return self

        def execute(self):
            if self.name == "seguimiento_bitacora_entrada" and self._payload:
                row = {"id": 77, **self._payload}
                return MagicMock(data=[row])
            return MagicMock(data=[])

    class FakeSb:
        def table(self, name):
            return FakeTable(name)

    monkeypatch.setattr(svc, "_usuario_row", lambda *_a, **_k: {"nombre": "Ana", "apellidos": "P"})
    monkeypatch.setattr(svc, "_rol_nombre", lambda *_a, **_k: "Residente")
    monkeypatch.setattr(svc, "sync_cargos_desde_personal", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_diario_existe_fecha", lambda *_a, **_k: False)

    def no_get(*_a, **_k):
        raise AssertionError("crear no debe llamar get_entrada")

    monkeypatch.setattr(svc, "get_entrada", no_get)

    out = svc.crear_reporte_diario(
        FakeSb(),
        1,
        {"fecha": hoy, "hora_inicio_labores": "07:00", "personal": [], "materiales": [], "cuerpo_html": ""},
        10,
        current_user={"nombre": "Ana", "rol_nombre": "Residente"},
    )
    assert out["id"] == 77
    assert out["tipo"] == "diario"
    assert isinstance(out.get("_perf_ms"), dict)
    assert out["_perf_ms"].get("total", 99999) < 5000
    assert "insert_db" in out["_perf_ms"]


def test_list_usos_batch_agrupa():
    class FakeTable:
        def select(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=[
                {"entrada_id": 1, "equipo_nombre": "A", "orden": 0},
                {"entrada_id": 2, "equipo_nombre": "B", "orden": 0},
                {"entrada_id": 1, "equipo_nombre": "C", "orden": 1},
            ])

    class FakeSb:
        def table(self, _name):
            return FakeTable()

    out = svc._list_usos_batch(FakeSb(), [1, 2, 3])
    assert len(out[1]) == 2
    assert len(out[2]) == 1
    assert out[3] == []


def test_normalizar_materiales_ubicacion():
    out = svc._normalizar_materiales([{
        "movimiento": "ingreso",
        "tipo_material": "Grava",
        "cantidad": 2,
        "ubicacion_lat": "4.7110001",
        "ubicacion_lng": "-74.0720002",
    }])
    assert len(out) == 1
    assert out[0]["ubicacion_lat"] == 4.7110001
    assert out[0]["ubicacion_lng"] == -74.0720002


def test_normalizar_materiales_ubicacion_pk():
    out = svc._normalizar_materiales([{
        "movimiento": "salida",
        "tipo_material": "Asfalto",
        "cantidad": 1,
        "ubicacion_pk": "PK 2+050",
        "ubicacion_pk_id": "42",
        "ubicacion_tramo": "Tramo Norte",
        "ubicacion_costado": "Derecho",
        "ubicacion_infraestructura": "Calzada",
        "ubicacion_lat": 4.7,
        "ubicacion_lng": -74.0,
    }])
    assert out[0]["ubicacion_pk"] == "PK 2+050"
    assert out[0]["ubicacion_pk_id"] == 42
    assert out[0]["ubicacion_tramo"] == "Tramo Norte"
    assert out[0]["ubicacion_costado"] == "Derecho"
    assert out[0]["ubicacion_infraestructura"] == "Calzada"
    assert out[0]["ubicacion_lat"] == 4.7

    out2 = svc._normalizar_materiales([{
        "movimiento": "ingreso",
        "tipo_material": "Arena",
        "cantidad": 1,
        "ubicacion_pk": "   ",
    }])
    assert "ubicacion_pk" not in out2[0]
    assert "ubicacion_tramo" not in out2[0]
    assert "ubicacion_costado" not in out2[0]
    assert "ubicacion_infraestructura" not in out2[0]


def test_ubicacion_material_pdf_incluye_tramo_costado_infra():
    from bitacora_pdf import _ubicacion_material

    assert _ubicacion_material({"ubicacion_pk": "12+000"}) == "PK 12+000"
    assert (
        _ubicacion_material({
            "ubicacion_pk": "12+000",
            "ubicacion_tramo": "Norte",
            "ubicacion_costado": "Izquierdo",
            "ubicacion_infraestructura": "Berma",
        })
        == "PK 12+000 · Norte · Izquierdo · Berma"
    )


def test_slot_3h_desde_hora():
    assert svc._slot_3h_desde_hora("07:30") == 6
    assert svc._slot_3h_desde_hora("12:00") == 12
    assert svc._slot_3h_desde_hora("23:10") == 21
    assert svc._slot_3h_desde_hora(None) == 12


def test_consultar_clima_prioridad_manual(monkeypatch):
    import sys
    import types

    svc.clear_clima_slots_cache_for_tests()

    def fake_get(url, params=None):
        class R:
            status_code = 200

            def json(self):
                return {
                    "hourly": {
                        "time": [f"2026-08-20T{h:02d}:00" for h in range(0, 24)],
                        "temperature_2m": [20.0] * 24,
                        "weather_code": [0] * 24,
                    }
                }
        return R()

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None):
            return fake_get(url, params)

    fake_httpx = types.ModuleType("httpx")
    fake_httpx.Client = FakeClient
    fake_httpx.Timeout = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "httpx", fake_httpx)

    slots = svc.consultar_clima_slots_3h(
        4.7, -74.0, "2026-08-20",
        manual={
            "clima_editado_manual": True,
            "hora_inicio_labores": "07:15",
            "clima_codigo": 61,
            "clima_temp_c": 18.5,
            "clima_descripcion": "Lluvia ligera (obra)",
        },
    )
    assert len(slots) == 8
    slot6 = next(s for s in slots if s["hora_num"] == 6)
    assert slot6["manual"] is True
    assert slot6["clima_codigo"] == 61
    assert "Lluvia" in slot6["clima_descripcion"]
    slot0 = next(s for s in slots if s["hora_num"] == 0)
    assert slot0["manual"] is False
    assert slot0["clima_codigo"] == 0


def test_consultar_clima_usa_cache(monkeypatch):
    import sys
    import types

    svc.clear_clima_slots_cache_for_tests()
    calls = {"n": 0}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None):
            calls["n"] += 1

            class R:
                status_code = 200

                def json(self):
                    return {
                        "hourly": {
                            "time": [f"2026-08-19T{h:02d}:00" for h in (0, 3, 6, 9, 12, 15, 18, 21)],
                            "temperature_2m": [21.0] * 8,
                            "weather_code": [1] * 8,
                        }
                    }
            return R()

    fake_httpx = types.ModuleType("httpx")
    fake_httpx.Client = FakeClient
    fake_httpx.Timeout = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "httpx", fake_httpx)

    a = svc.consultar_clima_slots_3h(4.71, -74.01, "2026-08-19")
    b = svc.consultar_clima_slots_3h(4.71, -74.01, "2026-08-19")
    assert calls["n"] == 1
    assert a[0]["clima_temp_c"] == b[0]["clima_temp_c"] == 21.0
    # Mutar resultado no contamina caché
    a[0]["clima_temp_c"] = 99.0
    c = svc.consultar_clima_slots_3h(4.71, -74.01, "2026-08-19")
    assert c[0]["clima_temp_c"] == 21.0
    assert calls["n"] == 1
