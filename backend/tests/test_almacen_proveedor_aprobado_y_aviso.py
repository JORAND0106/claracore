"""Cambio de proveedor en línea aprobada y cierre del aviso de mensajes."""
import pytest

import almacen_service as svc
from almacen_permissions import puede_cambiar_proveedor_linea_aprobada
from almacen_solicitud_mensajes import decidir_cierre_envio


def test_pueden_cambiar_proveedor_aprobado_solo_los_tres():
    gerencia = {"rol_nombre": "Contratista Gerencial", "cargo_nombre": "Residente"}
    admin = {"rol_nombre": "Administrativo", "cargo_nombre": "Administrador"}
    dev = {"rol_nombre": "Desarrollador", "cargo_nombre": "Analista"}
    residente = {"rol_nombre": "Contratista", "cargo_nombre": "Residente Administrativo"}
    operativo = {"rol_nombre": "Operativo", "cargo_nombre": "Almacenista"}
    inter = {"rol_nombre": "Interventoría", "cargo_nombre": "Administrador"}

    assert puede_cambiar_proveedor_linea_aprobada(gerencia) is True
    assert puede_cambiar_proveedor_linea_aprobada(admin) is True
    assert puede_cambiar_proveedor_linea_aprobada(dev) is True
    assert puede_cambiar_proveedor_linea_aprobada(residente) is False
    assert puede_cambiar_proveedor_linea_aprobada(operativo) is False
    assert puede_cambiar_proveedor_linea_aprobada(inter) is False


def test_cambiar_proveedor_conserva_aprobado_y_bloquea_oc(monkeypatch):
    item = {
        "id": 9,
        "solicitud_id": 3,
        "estado_validacion": "aprobado",
        "insumo_id": 10,
        "proveedor_seleccionado_id": 1,
        "proveedor_seleccionado_nombre": "Viejo",
        "cotizacion_numero_seleccionada": "C1",
        "valor_compra_unitario": 100,
    }
    stored = {}

    class Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": [dict(item)]})()

    class SB:
        def table(self, _name):
            return Q()

    monkeypatch.setattr(svc, "_sb", lambda: SB())
    monkeypatch.setattr(svc, "_exigir_agrupacion_libre", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_fetch_solicitud_head", lambda *_a, **_k: {"estado": "aprobada"})
    monkeypatch.setattr(svc, "_fetch_ocs_de_solicitud", lambda *_a, **_k: [])
    monkeypatch.setattr(svc, "_resolver_proveedor_mapeo", lambda *_a, **_k: {
        "aplicar": True,
        "proveedor_seleccionado_id": 8,
        "proveedor_seleccionado_nombre": "Nuevo",
        "cotizacion_numero_seleccionada": "C9",
        "valor": 40,
    })
    monkeypatch.setattr(svc, "_persistir_cotizacion_elegida", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_update_solicitud_item_row", lambda _sb, _iid, patch: stored.update(patch=patch))
    monkeypatch.setattr(svc, "_sincronizar_titulo_solicitud", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {"id": 3, "estado": "aprobada"})

    _sol, meta = svc.cambiar_proveedor_linea_aprobada(1, 3, 9, 4, {
        "proveedor_seleccionado_id": 8,
        "proveedor_seleccionado_nombre": "Nuevo",
    }, ver_economicos=False)
    assert meta["cambio"] is True
    assert meta["despues"]["estado_validacion"] == "aprobado"
    assert "estado_validacion" not in stored["patch"]
    assert stored["patch"]["proveedor_seleccionado_nombre"] == "Nuevo"
    assert stored["patch"]["valor_compra_unitario"] == 40

    monkeypatch.setattr(svc, "_fetch_ocs_de_solicitud", lambda *_a, **_k: [{"id": 70}])
    monkeypatch.setattr(svc, "_solicitud_item_ids_en_ocs", lambda *_a, **_k: {9})
    with pytest.raises(ValueError, match="orden de compra"):
        svc.cambiar_proveedor_linea_aprobada(1, 3, 9, 4, {
            "proveedor_seleccionado_id": 8,
            "proveedor_seleccionado_nombre": "Nuevo",
        })


def test_mismo_proveedor_actualiza_el_precio_si_la_cotizacion_cambio(monkeypatch):
    item = {
        "id": 9,
        "solicitud_id": 3,
        "estado_validacion": "aprobado",
        "insumo_id": 10,
        "proveedor_seleccionado_id": 1,
        "proveedor_seleccionado_nombre": "Viejo",
        "cotizacion_numero_seleccionada": "C1",
        "valor_compra_unitario": 100,
    }
    stored = {}

    class Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": [dict(item)]})()

    class SB:
        def table(self, _name):
            return Q()

    monkeypatch.setattr(svc, "_sb", lambda: SB())
    monkeypatch.setattr(svc, "_exigir_agrupacion_libre", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_fetch_solicitud_head", lambda *_a, **_k: {"estado": "aprobada"})
    monkeypatch.setattr(svc, "_fetch_ocs_de_solicitud", lambda *_a, **_k: [])
    monkeypatch.setattr(svc, "_resolver_proveedor_mapeo", lambda *_a, **_k: {
        "aplicar": True,
        "proveedor_seleccionado_id": 1,
        "proveedor_seleccionado_nombre": "Viejo",
        "cotizacion_numero_seleccionada": "C1",
        "valor": 40,
    })
    monkeypatch.setattr(svc, "_persistir_cotizacion_elegida", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_update_solicitud_item_row", lambda _sb, _iid, patch: stored.update(patch=patch))
    monkeypatch.setattr(svc, "_sincronizar_titulo_solicitud", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {"id": 3, "estado": "aprobada"})

    _sol, meta = svc.cambiar_proveedor_linea_aprobada(1, 3, 9, 4, {
        "proveedor_seleccionado_id": 1,
        "proveedor_seleccionado_nombre": "Viejo",
    }, ver_economicos=True)
    assert meta["cambio"] is True
    assert stored["patch"]["valor_compra_unitario"] == 40
    assert stored["patch"]["proveedor_seleccionado_id"] == 1


def test_si_nadie_recibe_el_aviso_el_envio_se_revierte():
    assert decidir_cierre_envio([2, 3], 1, []) == "revertir"
    assert decidir_cierre_envio([2, 3], 1, [2]) == "parcial"
    assert decidir_cierre_envio([2, 3], 1, [2, 3]) == "ok"
    assert decidir_cierre_envio([1], 1, []) == "ok"
