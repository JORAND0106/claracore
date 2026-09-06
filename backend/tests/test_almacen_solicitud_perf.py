"""Optimizaciones de rendimiento — solicitudes de materiales."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import almacen_insumos_service as insumos
import almacen_service as svc


def test_listado_cache_evita_segunda_pasada(monkeypatch):
    insumos.clear_listado_cache()
    pages = [
        [{"capitulo": "1", "item_numero": "1.01", "precio_unitario": 100}],
    ]
    calls = {"n": 0}

    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def range(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            return MagicMock(data=pages[0])

    class _Sb:
        def table(self, _name):
            return _Q()

    monkeypatch.setattr(insumos, "_sb", lambda: _Sb())
    a = insumos.get_listado_precio_unitario(1, "1", "1.01")
    b = insumos.get_listado_precio_unitario(1, "1", "1.01")
    assert a == 100
    assert b == 100
    assert calls["n"] == 1  # una sola paginación gracias al TTL cache


def test_batch_cantidad_solicitada_una_query(monkeypatch):
    store_items = [
        {"cantidad": 3, "solicitud_id": 1, "pk_id": "A", "presupuesto_id": 10, "es_principal": True},
        {"cantidad": 2, "solicitud_id": 1, "pk_id": "B", "presupuesto_id": 10, "es_principal": True},
        {"cantidad": 5, "solicitud_id": 2, "pk_id": "A", "presupuesto_id": 11, "es_principal": True},
    ]
    store_sols = [
        {"id": 1, "estado": "enviada", "contrato_id": 7},
        {"id": 2, "estado": "rechazada", "contrato_id": 7},
    ]

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table):
            self.table = table
            self._in = None

        def select(self, *_a, **_k):
            return self

        def in_(self, col, vals):
            self._in = (col, list(vals))
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            if self.table == "almacen_solicitud_item":
                rows = [r for r in store_items if r["presupuesto_id"] in self._in[1]]
                return _Resp(rows)
            if self.table == "almacen_solicitud":
                rows = [r for r in store_sols if r["id"] in self._in[1]]
                return _Resp(rows)
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    totals = insumos.batch_cantidad_solicitada_acumulada(
        _Sb(), 7, [(10, "A"), (10, "B"), (11, "A")], exclude_solicitud_id=None
    )
    assert totals[(10, "A")] == 3
    assert totals[(10, "B")] == 2
    assert totals[(11, "A")] == 0  # solicitud rechazada


def test_batch_cantidad_excluye_asociados(monkeypatch):
    """S.PPTO solo suma principales: asociado no descuenta (caso -6)."""
    store_items = [
        {"cantidad": 4, "solicitud_id": 1, "pk_id": "PK-1", "presupuesto_id": 10, "es_principal": True},
        {"cantidad": 6, "solicitud_id": 1, "pk_id": "PK-1", "presupuesto_id": 10, "es_principal": False},
        {"cantidad": 2, "solicitud_id": 1, "pk_id": "PK-1", "presupuesto_id": 10, "es_principal": "false"},
    ]
    store_sols = [{"id": 1, "estado": "enviada", "contrato_id": 7}]

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table):
            self.table = table
            self._in = None

        def select(self, *_a, **_k):
            return self

        def in_(self, col, vals):
            self._in = (col, list(vals))
            return self

        def execute(self):
            if self.table == "almacen_solicitud_item":
                return _Resp([r for r in store_items if r["presupuesto_id"] in self._in[1]])
            if self.table == "almacen_solicitud":
                return _Resp(store_sols)
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    totals = insumos.batch_cantidad_solicitada_acumulada(
        _Sb(), 7, [(10, "PK-1")], exclude_solicitud_id=None
    )
    assert totals[(10, "PK-1")] == 4.0


def test_apply_saldo_flags_asociado_no_rompe_sppto(monkeypatch):
    monkeypatch.setattr(
        insumos,
        "batch_cantidad_solicitada_acumulada",
        lambda *_a, **_k: {(10, "PK-1"): 4.0},
    )
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "get_listado_precio_lookup", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no")))
    monkeypatch.setattr(insumos, "_sb", lambda: MagicMock())

    items = [
        {
            "presupuesto_id": 10,
            "pk_id": "PK-1",
            "capitulo": "1",
            "item": "1.01",
            "cantidad": 4,
            "cant_presupuestada": 4,
            "vlr_unitario_cobro": 1000,
            "es_principal": True,
        },
        {
            "presupuesto_id": 10,
            "pk_id": "PK-1",
            "capitulo": "1",
            "item": "1.01",
            "cantidad": 6,
            "cant_presupuestada": 4,
            "vlr_unitario_cobro": 1000,
            "es_principal": False,
        },
    ]
    insumos.apply_saldo_flags_batch(
        1, items, descontar_linea_actual=False, refresh_listado=False,
    )
    assert items[0]["contexto_presupuesto"]["saldo_disponible_despues"] == 0.0
    assert items[0]["supera_presupuesto"] is False
    assert items[1]["contexto_presupuesto"]["saldo_disponible_despues"] == 0.0
    assert items[1]["supera_presupuesto"] is False
    assert items[1]["contexto_presupuesto"]["es_principal"] is False


def test_insert_solicitud_items_batch_chunked():
    inserted = []

    class _Q:
        def insert(self, rows):
            inserted.append(list(rows))
            return self

        def execute(self):
            return MagicMock(data=inserted[-1])

    class _Sb:
        def table(self, _name):
            return _Q()

    rows = [{"solicitud_id": 1, "numero_linea": i} for i in range(1, 101)]
    svc._insert_solicitud_items_batch(_Sb(), rows, chunk_size=40)
    assert len(inserted) == 3
    assert len(inserted[0]) == 40
    assert len(inserted[2]) == 20


def test_apply_saldo_flags_skip_listado_no_llama_lookup(monkeypatch):
    """GET detalle no debe escanear listado_precios (causa raíz de ~5s)."""
    calls = {"lookup": 0}

    def _boom(*_a, **_k):
        calls["lookup"] += 1
        raise AssertionError("get_listado_precio_lookup no debe llamarse con refresh_listado=False")

    monkeypatch.setattr(insumos, "get_listado_precio_lookup", _boom)
    monkeypatch.setattr(
        insumos,
        "batch_cantidad_solicitada_acumulada",
        lambda *_a, **_k: {(10, "PK-1"): 4.0},
    )
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "_sb", lambda: MagicMock())

    items = [{
        "presupuesto_id": 10,
        "pk_id": "PK-1",
        "capitulo": "1",
        "item": "1.01",
        "cantidad": 4,
        "cant_presupuestada": 100,
        "vlr_unitario_cobro": 12000,
        "insumo_id": None,
    }]
    insumos.apply_saldo_flags_batch(
        1, items, descontar_linea_actual=False, refresh_listado=False,
    )
    assert calls["lookup"] == 0
    assert items[0]["vlr_unitario_cobro"] == 12000
    assert items[0]["contexto_presupuesto"]["saldo_disponible_despues"] == 96.0


def test_apply_saldo_flags_volumen_30_lineas_una_pasada_acum(monkeypatch):
    acum_calls = {"n": 0}

    def _acum(sb, contrato_id, keys, exclude=None):
        acum_calls["n"] += 1
        return {(int(p), str(k)): 0.0 for p, k in keys}

    monkeypatch.setattr(insumos, "batch_cantidad_solicitada_acumulada", _acum)
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "get_listado_precio_lookup", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no listado")))
    monkeypatch.setattr(insumos, "_sb", lambda: MagicMock())

    items = []
    for i in range(30):
        items.append({
            "presupuesto_id": 100 + i,
            "pk_id": f"PK-{i}",
            "capitulo": "1",
            "item": f"1.{i}",
            "cantidad": 1,
            "cant_presupuestada": 50,
            "vlr_unitario_cobro": 1000,
        })
    insumos.apply_saldo_flags_batch(
        1, items, descontar_linea_actual=False, refresh_listado=False,
    )
    assert acum_calls["n"] == 1
    assert all(it["contexto_presupuesto"]["saldo_disponible_despues"] == 50 for it in items)


def test_download_pdf_oc_reutiliza_blob(monkeypatch):
    oc = {
        "id": 9,
        "numero_oc": 3,
        "solicitud_id": 1,
        "pdf_blob_path": "almacen/oc/9.pdf",
        "pdf_nombre": "OC-3.pdf",
    }
    monkeypatch.setattr(svc, "get_orden_compra", lambda *_a, **_k: dict(oc))
    monkeypatch.setattr(svc, "download_soporte", lambda path: (b"%PDF-ok", "application/pdf"))

    def _no_gen(*_a, **_k):
        raise AssertionError("no debe regenerar PDF si ya hay blob")

    monkeypatch.setattr(svc, "generar_y_guardar_pdf_oc", _no_gen)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no get_solicitud")))

    data, fname = svc.download_pdf_oc(1, 9, 7)
    assert data == b"%PDF-ok"
    assert fname == "OC-3.pdf"


def test_apply_saldo_flags_texto_libre_vlr0_no_escanea_listado(monkeypatch):
    """Guardar borrador con texto libre (vlr=0, sin insumo) no debe full-scan listado."""
    calls = {"lookup": 0}

    def _boom(*_a, **_k):
        calls["lookup"] += 1
        raise AssertionError("no debe escanear listado para líneas sin insumo")

    monkeypatch.setattr(insumos, "get_listado_precio_lookup", _boom)
    monkeypatch.setattr(
        insumos,
        "batch_cantidad_solicitada_acumulada",
        lambda *_a, **_k: {(10, "PK-1"): 0.0},
    )
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "_sb", lambda: MagicMock())

    items = [{
        "presupuesto_id": 10,
        "pk_id": "PK-1",
        "capitulo": "1",
        "item": "1.01",
        "cantidad": 2,
        "cant_presupuestada": 50,
        "vlr_unitario_cobro": 0,
        "insumo_id": None,
    }]
    # refresh_listado=True simula el default antiguo; needs_price ya no dispara.
    insumos.apply_saldo_flags_batch(
        1, items, descontar_linea_actual=True, refresh_listado=True,
    )
    assert calls["lookup"] == 0
    assert items[0]["vlr_unitario_cobro"] == 0


def test_aprobar_solicitud_bloquea_si_falta_insumo(monkeypatch):
    """No generar OC si hay líneas aprobadas sin insumo del catálogo."""
    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table, store):
            self.table = table
            self.store = store
            self._filters = {}

        def select(self, *_a, **_k):
            return self

        def eq(self, col, val):
            self._filters[col] = val
            return self

        def is_(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def update(self, *_a, **_k):
            return self

        def execute(self):
            if self.table == "almacen_solicitud":
                return _Resp([{
                    "id": 1,
                    "contrato_id": 10,
                    "estado": "enviada",
                    "consecutivo": 5,
                    "created_by": 3,
                }])
            if self.table == "almacen_orden_compra":
                return _Resp([])
            if self.table == "almacen_solicitud_item":
                return _Resp([
                    {
                        "id": 101,
                        "numero_linea": 1,
                        "estado_validacion": "aprobado",
                        "insumo_id": None,
                        "es_recurrente": False,
                        "valor_compra_unitario": 1000,
                        "cantidad": 2,
                    },
                    {
                        "id": 102,
                        "numero_linea": 2,
                        "estado_validacion": "aprobado",
                        "insumo_id": 55,
                        "es_recurrente": False,
                        "valor_compra_unitario": 2000,
                        "cantidad": 1,
                    },
                ])
            return _Resp([])

    class _Sb:
        def __init__(self):
            self.store = {}

        def table(self, name):
            return _Q(name, self.store)

    monkeypatch.setattr(svc, "_sb", lambda: _Sb())
    monkeypatch.setattr(svc, "_fetch_solicitud_head", lambda *_a, **_k: {
        "id": 1, "contrato_id": 10, "estado": "enviada", "consecutivo": 5, "created_by": 3,
    })

    try:
        svc.aprobar_solicitud(10, 1, 7, {"aprobar_todos_pendientes": False})
        raise AssertionError("debía fallar por falta de insumo")
    except ValueError as exc:
        msg = str(exc)
        assert "No se puede generar la Orden de Compra" in msg
        assert "faltan insumos" in msg.lower()
        assert "#1" in msg
