"""Salidas de material — validación y roles receptor."""
from unittest.mock import MagicMock

import pytest

from almacen_permissions import es_rol_receptor_obra
from almacen_service import (
    _alerta_proximidad_consumo,
    _disponible_entrada_item,
    _pk_id_coincide,
    create_salida,
    entradas_disponibles_por_pk,
)


def test_pk_id_coincide_digitos():
    assert _pk_id_coincide("120350", "120350") is True
    assert _pk_id_coincide("PK 120350", "120350") is True
    assert _pk_id_coincide("120350", "120351") is False


def test_entradas_disponibles_por_pk_desde_solicitud_sin_pk_cabecera(monkeypatch):
    """Entrada con pk_id NULL en cabecera pero PK en solicitud/OC debe aparecer."""
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            q.select.return_value.eq.return_value.execute.return_value.data = [{
                "id": 27,
                "contrato_id": 3,
                "numero_entrada": 1,
                "pk_id": None,
                "tramo": None,
                "fecha_entrada": "2026-07-13",
                "tipo": "recibo",
            }]
        elif name == "almacen_entrada_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 29,
                "entrada_id": 27,
                "cantidad_recibida": 235,
                "orden_compra_item_id": 3,
                "presupuesto_id": 1,
            }]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 29,
                "cantidad_recibida": 235,
            }]
        elif name == "almacen_orden_compra_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 3,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "orden_compra_id": 2,
                "solicitud_item_id": 8,
                "presupuesto_id": 1,
                "cantidad": 235,
            }]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 3,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "orden_compra_id": 2,
                "solicitud_item_id": 8,
                "presupuesto_id": 1,
                "cantidad": 235,
            }]
        elif name == "almacen_solicitud_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 8,
                "pk_id": "120350",
                "tramo": "TRAMO 5",
                "costado": "Derecha",
                "abscisa_inicial": None,
                "abscisa_final": None,
                "capitulo": "01",
                "item": "02",
                "insumo_id": 5,
            }]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 8,
                "capitulo": "01",
                "item": "02",
                "insumo_id": 5,
            }]
        elif name == "almacen_orden_compra":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"numero_oc": 2}]
        elif name == "almacen_insumo":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"codigo": "INS-01"}]
        elif name == "almacen_salida":
            q.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "presupuesto":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "capitulo": "01", "item": "02", "contrato_id": 3,
            }]
        else:
            q.select.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)

    rows = entradas_disponibles_por_pk(3, "120350")
    assert len(rows) == 1
    assert rows[0]["entrada_item_id"] == 29
    assert rows[0]["pk_id"] == "120350"
    assert float(rows[0]["cantidad_disponible"]) == 235.0


def test_entradas_disponibles_usa_cantidad_recibida_no_oc_total(monkeypatch):
    """OC autoriza 235 pero la entrada solo recibió 100 → disponible = 100."""
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            q.select.return_value.eq.return_value.execute.return_value.data = [{
                "id": 27,
                "contrato_id": 3,
                "numero_entrada": 1,
                "pk_id": "120350",
                "tramo": "TRAMO 5",
                "fecha_entrada": "2026-07-13",
                "tipo": "recibo",
            }]
        elif name == "almacen_entrada_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 29,
                "entrada_id": 27,
                "cantidad_recibida": 100,
                "orden_compra_item_id": 3,
                "presupuesto_id": 1,
            }]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 29,
                "cantidad_recibida": 100,
            }]
        elif name == "almacen_orden_compra_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 3,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "orden_compra_id": 2,
                "solicitud_item_id": 8,
                "presupuesto_id": 1,
                "cantidad": 235,
            }]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 3,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "orden_compra_id": 2,
                "solicitud_item_id": 8,
                "presupuesto_id": 1,
                "cantidad": 235,
            }]
        elif name == "almacen_solicitud_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 8,
                "pk_id": "120350",
                "tramo": "TRAMO 5",
                "costado": "Derecha",
                "abscisa_inicial": None,
                "abscisa_final": None,
                "capitulo": "01",
                "item": "02",
                "insumo_id": 5,
            }]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 8,
                "capitulo": "01",
                "item": "02",
                "insumo_id": 5,
            }]
        elif name == "almacen_orden_compra":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"numero_oc": 2}]
        elif name == "almacen_insumo":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"codigo": "INS-01"}]
        elif name == "almacen_salida":
            q.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "presupuesto":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "capitulo": "01", "item": "02", "contrato_id": 3,
            }]
        else:
            q.select.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)

    rows = entradas_disponibles_por_pk(3, "120350")
    assert len(rows) == 1
    assert float(rows[0]["cantidad_recibida_entrada"]) == 100.0
    assert float(rows[0]["cantidad_disponible"]) == 100.0
    assert float(rows[0]["cantidad_oc_autorizada"]) == 235.0


def test_enriquecer_entradas_listado_cantidad_y_saldo(monkeypatch):
    from almacen_service import _enriquecer_entradas_listado

    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 10,
                "entrada_id": 5,
                "cantidad_recibida": 100,
                "orden_compra_item_id": 7,
            }]
            q.select.return_value.eq.return_value.execute.return_value.data = []
        elif name == "almacen_orden_compra_item":
            q.select.return_value.in_.return_value.execute.return_value.data = [{
                "id": 7,
                "cantidad": 235,
                "cantidad_recibida": 100,
                "unidad": "M3",
            }]
        else:
            q.select.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)

    rows = [{"id": 5, "created_at": "2026-07-13T10:00:00Z"}]
    _enriquecer_entradas_listado(sb, rows)
    assert rows[0]["cantidad_recibida_total"] == 100.0
    assert rows[0]["cantidad_recibida_unidad"] == "M3"
    assert rows[0]["saldo_oc_pendiente_despues"] == 135.0


def test_es_rol_receptor_obra_contratista():
    assert es_rol_receptor_obra("Contratista") is True
    assert es_rol_receptor_obra("Operativo Contratista") is True
    assert es_rol_receptor_obra("Contratista Gerencial") is True


def test_es_rol_receptor_obra_excluye_interventoria():
    assert es_rol_receptor_obra("Interventoría") is False
    assert es_rol_receptor_obra("Operativo Interventoría") is False
    assert es_rol_receptor_obra("Interventoría Gerencial") is False
    assert es_rol_receptor_obra("Supervisor Externo") is False


def test_disponible_entrada_item():
    assert _disponible_entrada_item(100, 30) == 70
    assert _disponible_entrada_item(10, 12) == 0
    # Ejemplo crítico: 1500 recibidos, despacho parcial 100 → queda 1400
    assert _disponible_entrada_item(1500, 100) == 1400
    assert _disponible_entrada_item(1500, 0) == 1500


def test_alerta_proximidad_consumo():
    assert _alerta_proximidad_consumo(100, 15) is True
    assert _alerta_proximidad_consumo(100, 50) is False


def test_create_salida_rechaza_cantidad_mayor_disponible(monkeypatch):
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 10,
                "entrada_id": 5,
                "cantidad_recibida": 50,
                "presupuesto_id": 1,
                "orden_compra_item_id": 7,
            }]
        elif name == "almacen_entrada":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "pk_id": "PK-001",
                "tramo": "T1",
            }]
        elif name == "almacen_salida":
            q.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "usuarios":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 2,
                "nombre": "Juan",
                "apellidos": "Pérez",
                "activo": True,
                "rol_id": 3,
                "contrato_id": 1,
                "firma_imagen_url": None,
            }]
        elif name == "roles":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"nombre": "Contratista"}]
        elif name == "usuario_contratos":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": 1}]
        else:
            q.select.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)

    with pytest.raises(ValueError, match="Máximo permitido"):
        create_salida(1, 99, {
            "pk_id": "PK-001",
            "receptor_usuario_id": 2,
            "entrada_item_id": 10,
            "cantidad_salida": 60,
        })


def test_create_salida_rechaza_2000_cuando_disponible_1500(monkeypatch):
    """Tope estricto: 2000 KG > 1500 KG disponibles no debe guardarse."""
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_entrada_item":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 10,
                "entrada_id": 5,
                "cantidad_recibida": 1500,
                "presupuesto_id": 1,
                "orden_compra_item_id": 7,
            }]
        elif name == "almacen_entrada":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "pk_id": "PK-001",
                "tramo": "T1",
            }]
        elif name == "almacen_salida":
            q.select.return_value.in_.return_value.execute.return_value.data = []
        elif name == "usuarios":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 2,
                "nombre": "Juan",
                "apellidos": "Pérez",
                "activo": True,
                "rol_id": 3,
                "contrato_id": 1,
                "firma_imagen_url": None,
            }]
        elif name == "roles":
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"nombre": "Contratista"}]
        elif name == "usuario_contratos":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": 1}]
        else:
            q.select.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    monkeypatch.setattr(
        "almacen_service._cantidad_recibida_entrada_item",
        lambda *_a, **_k: 1500.0,
    )
    monkeypatch.setattr(
        "almacen_service._ubicacion_efectiva_entrada_items",
        lambda *_a, **_k: {10: {"pk_id": "PK-001"}},
    )
    monkeypatch.setattr(
        "almacen_service._validar_receptor_obra",
        lambda *_a, **_k: {"id": 2},
    )

    with pytest.raises(ValueError, match="Máximo permitido: 1500"):
        create_salida(1, 99, {
            "pk_id": "PK-001",
            "receptor_usuario_id": 2,
            "entrada_item_id": 10,
            "cantidad_salida": 2000,
        })


def test_download_salida_pdf_reutiliza_blob(monkeypatch):
    """Si ya hay blob, no regenerar (mismo patrón que download_pdf_oc)."""
    import almacen_service as svc

    sal = {
        "id": 12,
        "salida_pdf_blob_path": "almacen-soportes/1/salidas/12/salida-12.pdf",
        "salida_pdf_nombre": "salida-12.pdf",
    }
    monkeypatch.setattr(svc, "get_salida", lambda *_a, **_k: dict(sal))
    monkeypatch.setattr(svc, "download_soporte", lambda path: (b"%PDF-salida", "application/pdf"))

    def _no_gen(*_a, **_k):
        raise AssertionError("no debe regenerar PDF si ya hay blob")

    monkeypatch.setattr(svc, "_generar_pdf_salida", _no_gen)
    monkeypatch.setattr(svc, "_pdf_ctx_for_salida", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no ctx")))

    data, fname = svc.download_salida_pdf(1, 12)
    assert data == b"%PDF-salida"
    assert fname == "salida-12.pdf"


def test_get_salida_no_lista_todas(monkeypatch):
    """get_salida enriquece solo la fila pedida (no list_salidas completo)."""
    import almacen_service as svc

    sb = MagicMock()

    def table(name):
        q = MagicMock()
        if name == "almacen_salida":
            q.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
                "id": 5,
                "contrato_id": 1,
                "numero_salida": 3,
                "codigo": "Sal-CC-00003",
                "entrada_item_id": None,
                "receptor_usuario_id": None,
                "created_by": None,
                "salida_pdf_blob_path": None,
            }]
        else:
            q.select.return_value.execute.return_value.data = []
            q.select.return_value.in_.return_value.execute.return_value.data = []
        return q

    sb.table.side_effect = table
    monkeypatch.setattr(svc, "_sb", lambda: sb)

    called = {"list": 0}

    def _boom(*_a, **_k):
        called["list"] += 1
        raise AssertionError("get_salida no debe llamar list_salidas")

    monkeypatch.setattr(svc, "list_salidas", _boom)

    out = svc.get_salida(1, 5)
    assert out["id"] == 5
    assert out["codigo"] == "Sal-CC-00003"
    assert out["tiene_pdf_salida"] is False
    assert called["list"] == 0
