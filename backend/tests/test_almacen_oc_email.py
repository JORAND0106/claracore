"""Correo de la OC y quién puede generarla."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from almacen_oc_email import (
    _asunto_cuerpo,
    correo_de_cotizacion,
    correos_de_lineas,
    enviar_oc_por_correo,
)
from almacen_permissions import (
    puede_generar_orden_compra_almacen,
    puede_ver_valores_economicos_almacen,
    require_generar_orden_compra_almacen,
)


def test_cotizacion_elegida_sin_correo_no_usa_otra():
    detalle = [
        {
            "tipo": "insumo",
            "numero": "1",
            "proveedor_id": 1,
            "proveedor": "Aceros",
            "contacto_email": "aceros@obra.com",
            "es_ganadora": True,
        },
        {
            "tipo": "insumo",
            "numero": "2",
            "proveedor_id": 2,
            "proveedor": "Cementos",
            "contacto_email": "",
            "es_ganadora": False,
        },
    ]
    item = {
        "proveedor_seleccionado_id": 2,
        "cotizacion_numero_seleccionada": "2",
        "proveedor_seleccionado_nombre": "Cementos",
    }
    assert correo_de_cotizacion(detalle, item) is None


def test_eleccion_que_no_coincide_no_usa_la_ganadora():
    detalle = [
        {"numero": "1", "proveedor_id": 1, "contacto_email": "gana@obra.com", "es_ganadora": True},
    ]
    item = {"proveedor_seleccionado_id": 99, "cotizacion_numero_seleccionada": "8"}
    assert correo_de_cotizacion(detalle, item) is None


def test_sin_eleccion_usa_la_ganadora():
    detalle = [
        {"numero": "1", "contacto_email": "gana@obra.com", "es_ganadora": True},
        {"numero": "2", "contacto_email": "otra@obra.com", "es_ganadora": False},
    ]
    assert correo_de_cotizacion(detalle, {}) == "gana@obra.com"


def test_correos_distintos_por_linea():
    detalle = {
        10: [{"numero": "1", "proveedor_id": 1, "contacto_email": "a@obra.com", "es_ganadora": True}],
        11: [{"numero": "1", "proveedor_id": 2, "contacto_email": "b@obra.com", "es_ganadora": True}],
    }
    items = [
        {"insumo_id": 10, "proveedor_seleccionado_id": 1},
        {"insumo_id": 11, "proveedor_seleccionado_id": 2},
        {"insumo_id": 10, "proveedor_seleccionado_id": 1},
    ]
    assert correos_de_lineas(detalle, items) == ["a@obra.com", "b@obra.com"]


def test_asunto_incluye_oc_contrato_y_contacto():
    asunto, cuerpo = _asunto_cuerpo(
        {"numero_oc": 44},
        {"numero": "CT-9", "contratista": "Vías", "objeto": "Pavimento"},
        {"nombre": "Ana Ruiz", "email": "ana@obra.com", "telefono": "300"},
    )
    assert "44" in asunto
    assert "CT-9" in asunto
    assert "CT-9" in cuerpo
    assert "Ana Ruiz" in cuerpo
    assert "ana@obra.com" in cuerpo
    assert "300" in cuerpo
    assert "PDF" in cuerpo


def _parche_envio(monkeypatch, *, email, smtp_ok=True):
    import almacen_oc_email as mod
    import almacen_service as svc

    monkeypatch.setattr(mod, "_sb", lambda: object())
    monkeypatch.setattr(
        mod, "_contacto_generador",
        lambda _sb, _uid: {"nombre": "Ana Ruiz", "email": "ana@obra.com", "telefono": "300"},
    )
    monkeypatch.setattr(
        mod, "_contrato_breve",
        lambda _sb, _cid: {"numero": "CT-9", "contratista": "Vías", "objeto": "Pavimento"},
    )
    monkeypatch.setattr(
        mod, "_items_solicitud_de_oc",
        lambda _sb, _oc: [{
            "insumo_id": 5,
            "proveedor_seleccionado_id": 9,
            "cotizacion_numero_seleccionada": "3",
        }],
    )
    monkeypatch.setattr(
        mod, "_detalle_cotizaciones",
        lambda _sb, _ids: {
            5: [{
                "numero": "3",
                "proveedor_id": 9,
                "contacto_email": email,
                "es_ganadora": False,
            }],
        },
    )
    registrados = []
    estados = []

    def _registrar(_sb, **kw):
        registrados.append(kw)
        return True

    monkeypatch.setattr(mod, "_registrar_envio", _registrar)
    monkeypatch.setattr(
        mod, "_marcar_estado_oc",
        lambda _sb, _oc, estado, correo: estados.append((estado, correo)) or True,
    )
    enviados = []

    def _enviar(*args, **_k):
        if not smtp_ok:
            raise RuntimeError("SMTP rechazó el mensaje")
        enviados.append(args[0])

    monkeypatch.setattr(mod, "enviar_pdf_correo", _enviar)
    monkeypatch.setattr(
        svc, "get_orden_compra",
        lambda *_a, **_k: {
            "id": 8, "numero_oc": 12, "solicitud_id": 3,
            "proveedor_nombre": "Cementos", "pdf_nombre": "oc.pdf",
        },
    )
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {"id": 3, "consecutivo": 4})
    monkeypatch.setattr(
        svc, "generar_y_guardar_pdf_oc",
        lambda *_a, **_k: {"pdf_bytes": b"%PDF", "pdf_nombre": "oc.pdf"},
    )
    return registrados, estados, enviados


def test_sin_correo_la_oc_queda_pendiente(monkeypatch):
    registrados, estados, enviados = _parche_envio(monkeypatch, email="")
    out = enviar_oc_por_correo(1, 8, 7)
    assert out["resultado"] == "pendiente"
    assert out["envio_estado"] == "pendiente"
    assert enviados == []
    assert estados == [("pendiente", None)]
    assert registrados[0]["resultado"] == "pendiente"
    assert registrados[0]["user_id"] == 7


def test_envio_ok_registra_destinatario(monkeypatch):
    registrados, estados, enviados = _parche_envio(monkeypatch, email="prov@obra.com")
    out = enviar_oc_por_correo(1, 8, 7)
    assert out["resultado"] == "enviado"
    assert enviados == ["prov@obra.com"]
    assert estados == [("enviado", "prov@obra.com")]
    assert registrados[0]["destinatario"] == "prov@obra.com"
    assert registrados[0]["resultado"] == "enviado"


def test_fallo_smtp_no_deshace_y_queda_pendiente(monkeypatch):
    _registrados, estados, _enviados = _parche_envio(monkeypatch, email="prov@obra.com", smtp_ok=False)
    out = enviar_oc_por_correo(1, 8, 7)
    assert out["resultado"] == "error"
    assert out["envio_estado"] == "pendiente"
    assert "pendiente de envío" in out["detalle"]
    assert estados[0][0] == "pendiente"


def test_correo_corregido_se_usa_en_el_reintento(monkeypatch):
    _registrados, estados, enviados = _parche_envio(monkeypatch, email="")
    out = enviar_oc_por_correo(1, 8, 7, correo_override="nuevo@obra.com")
    assert out["resultado"] == "enviado"
    assert enviados == ["nuevo@obra.com"]
    assert estados == [("enviado", "nuevo@obra.com")]


def test_solo_administrador_o_desarrollador_generan_oc():
    admin = {"rol": "Operativo Campo", "cargo": "Administrador"}
    dev = {"rol": "Desarrollador", "cargo": "Dev"}
    gerencia = {"rol": "Contratista Gerencial", "cargo": "Gerente"}
    residente = {"rol": "Administrativo", "cargo": "Residente Administrativo"}
    inter = {"rol": "Interventoría", "cargo": "Administrador"}
    assert puede_generar_orden_compra_almacen(admin) is True
    require_generar_orden_compra_almacen(admin)
    assert puede_generar_orden_compra_almacen(dev) is True
    assert puede_generar_orden_compra_almacen(gerencia) is False
    assert puede_generar_orden_compra_almacen(residente) is False
    assert puede_ver_valores_economicos_almacen(residente) is True
    assert puede_ver_valores_economicos_almacen(admin) is False
    assert puede_generar_orden_compra_almacen(inter) is False
    with pytest.raises(HTTPException) as exc:
        require_generar_orden_compra_almacen(gerencia)
    assert exc.value.status_code == 403
