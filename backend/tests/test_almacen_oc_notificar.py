"""Sí notifica y envía. No deja la OC como documento de sistema, sin correo."""

import pytest

from almacen_oc_email import (
    notificar_para_grupo,
    publicar_envios_oc,
    resolver_notificar_proveedores,
)


def test_sin_respuesta_no_hay_defecto():
    grupos = [
        {"key": "id:1", "proveedor_id": 1, "proveedor_nombre": "Aceros"},
        {"key": "id:2", "proveedor_id": 2, "proveedor_nombre": "Cementos"},
    ]
    try:
        resolver_notificar_proveedores(None, grupos)
        raise AssertionError("debía exigir la respuesta")
    except ValueError as exc:
        assert "notificar" in str(exc).lower()
    try:
        resolver_notificar_proveedores([
            {"proveedor_id": 1, "proveedor_nombre": "Aceros", "notificar": True},
        ], grupos)
        raise AssertionError("faltaba Cementos")
    except ValueError as exc:
        assert "Cementos" in str(exc)


def test_si_y_no_por_proveedor():
    grupos = [
        {"key": "id:1", "proveedor_id": 1, "proveedor_nombre": "Aceros"},
        {"key": "nombre:canteras", "proveedor_id": None, "proveedor_nombre": "Canteras"},
    ]
    out = resolver_notificar_proveedores([
        {"proveedor_id": 1, "proveedor_nombre": "Aceros", "notificar": True},
        {"proveedor_nombre": "Canteras", "notificar": False},
    ], grupos)
    assert out == {"id:1": True, "nombre:canteras": False}
    assert notificar_para_grupo(
        [{"proveedor_nombre": "Compra recurrente", "notificar": False}],
        proveedor_id=None,
        proveedor_nombre="Compra recurrente",
    ) is False


def test_documento_sistema_no_envia_correo(monkeypatch):
    import almacen_oc_email as mod

    enviados = []
    pdfs = []
    monkeypatch.setattr(mod, "enviar_oc_por_correo", lambda *a, **k: enviados.append(a) or {"resultado": "enviado"})
    monkeypatch.setattr(mod, "_publicar_pdf_sin_correo", lambda *a, **k: pdfs.append(a) or True)
    out = publicar_envios_oc(1, 2, 7, [
        {"id": 10, "numero_oc": 3, "proveedor_nombre": "Aceros", "documento_sistema": False},
        {"id": 11, "numero_oc": 4, "proveedor_nombre": "Cementos", "documento_sistema": True},
    ])
    assert len(enviados) == 1
    assert enviados[0][1] == 10
    assert len(pdfs) == 1
    assert out[1]["resultado"] == "sistema"
    assert out[1]["envio_estado"] is None
    assert "pendiente" not in out[1]["detalle"]
    assert out[1]["documento_sistema"] is True


def test_sin_respuesta_no_inserta_y_no_marca_por_defecto(monkeypatch):
    import almacen_service as svc

    inserts = []
    monkeypatch.setattr(svc, "_next_consecutivo", lambda *_a, **_k: 4)
    monkeypatch.setattr(svc, "_usuario_firma_url", lambda *_a, **_k: "https://cdn.test/firma.png")
    monkeypatch.setattr(
        svc, "_insert_orden_compra_row",
        lambda *_a, **_k: inserts.append(1) or [{"id": 1}],
    )
    with pytest.raises(ValueError, match="notificar"):
        svc._crear_oc_con_items(
            object(),
            contrato_id=1,
            solicitud_id=2,
            user_id=7,
            sol={"created_by": 3},
            body={},
            items=[{"id": 1}],
            proveedor_id=5,
            proveedor_nombre="Aceros",
            notificaciones=None,
        )
    assert inserts == []


def test_respuesta_no_guarda_documento_sistema(monkeypatch):
    import almacen_service as svc

    rows = []
    monkeypatch.setattr(svc, "_next_consecutivo", lambda *_a, **_k: 4)
    monkeypatch.setattr(svc, "_usuario_firma_url", lambda *_a, **_k: "https://cdn.test/firma.png")
    monkeypatch.setattr(svc, "_insertar_items_en_oc", lambda *_a, **_k: None)

    def _ins(_sb, row):
        rows.append(row)
        return [{"id": 11}]

    monkeypatch.setattr(svc, "_insert_orden_compra_row", _ins)
    out = svc._crear_oc_con_items(
        object(),
        contrato_id=1,
        solicitud_id=2,
        user_id=7,
        sol={"created_by": 3},
        body={},
        items=[{"id": 1}],
        proveedor_id=None,
        proveedor_nombre="Cementos",
        notificaciones=[{"proveedor_nombre": "Cementos", "notificar": False}],
    )
    assert rows[0]["documento_sistema"] is True
    assert "envio_estado" not in rows[0]
    assert out["notificar"] is False
    assert out["documento_sistema"] is True


def test_log_registra_decision_y_envio_posterior():
    from pathlib import Path

    src = Path(__file__).resolve().parents[1].joinpath("almacen_routes.py").read_text(encoding="utf-8")
    assert "NOTIFICAR_PROVEEDOR_OC" in src
    assert '"decision": "si" if oc.get("notificar") else "no"' in src
    assert "ENVIAR_OC_PROVEEDOR" in src


def test_enviar_despues_quita_la_marca(monkeypatch):
    import almacen_oc_email as mod

    quitados = []
    monkeypatch.setattr(mod, "_sb", lambda: object())
    monkeypatch.setattr(mod, "_quitar_documento_sistema", lambda _sb, oc_id: quitados.append(oc_id) or True)
    monkeypatch.setattr(mod, "_contacto_generador", lambda *_a, **_k: {"nombre": "Ana"})
    monkeypatch.setattr(mod, "_contrato_breve", lambda *_a, **_k: {"numero": "CT"})
    monkeypatch.setattr(mod, "_items_solicitud_de_oc", lambda *_a, **_k: [])
    monkeypatch.setattr(mod, "_detalle_cotizaciones", lambda *_a, **_k: {})
    monkeypatch.setattr(mod, "_registrar_envio", lambda *_a, **_k: True)
    monkeypatch.setattr(mod, "_marcar_estado_oc", lambda *_a, **_k: True)
    monkeypatch.setattr(mod, "enviar_pdf_correo", lambda *a, **k: None)
    import almacen_service as svc
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: {
        "id": 8, "numero_oc": 4, "solicitud_id": 1, "proveedor_nombre": "Cementos",
        "documento_sistema": True,
    })
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {"id": 1})
    monkeypatch.setattr(svc, "generar_y_guardar_pdf_oc", lambda *_a, **_k: {
        "pdf_bytes": b"%PDF", "pdf_nombre": "oc.pdf",
    })
    from almacen_oc_email import enviar_oc_por_correo
    out = enviar_oc_por_correo(1, 8, 7, correo_override="prov@obra.com")
    assert quitados == [8]
    assert out["resultado"] == "enviado"


def test_lanzar_pdfs_oc_responde_sin_esperar_el_correo(monkeypatch):
    import almacen_service as svc

    lanzados = []

    class _Hilo:
        def __init__(self, target=None, name=None, daemon=None):
            lanzados.append({"target": target, "name": name, "daemon": daemon})

        def start(self):
            lanzados[-1]["started"] = True

    monkeypatch.setattr(svc.threading, "Thread", _Hilo)
    monkeypatch.setattr(
        "almacen_oc_email.publicar_envios_oc",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no debe correr en la petición")),
    )
    out = svc._lanzar_pdfs_oc(1, 2, 7, [{
        "id": 8, "numero_oc": 4, "proveedor_nombre": "Aceros", "notificar": True,
    }])
    assert out[0]["resultado"] == "en_proceso"
    assert out[0]["numero_oc"] == 4
    assert lanzados[0]["started"] is True
    assert lanzados[0]["daemon"] is True
    sistema = svc._resumen_envio_oc_inmediato({
        "id": 9, "numero_oc": 5, "documento_sistema": True,
    })
    assert sistema["resultado"] == "sistema"
