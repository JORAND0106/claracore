"""El guardado no crece una consulta por línea ni por registro de presupuesto."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

import almacen_insumos_service as insumos
import almacen_service as svc
import almacen_solicitud_tareas as tareas


def test_registros_de_un_pk_acumulan_en_un_solo_lote(monkeypatch):
    rows = [
        {
            "id": i, "cant_total": 2, "pk_id": "PK-1", "und": "m3",
            "capitulo": "Cap", "item": "1.01", "descripcion": "x",
            "abs_inicio": None, "abs_final": None, "no_inicio": None, "no_final": None,
            "tramo": "T1", "calzada": None,
        }
        for i in range(1, 41)
    ]
    monkeypatch.setattr(insumos, "_sb", lambda: object())
    monkeypatch.setattr(insumos, "list_presupuesto_rows_combo", lambda *_a, **_k: rows)
    monkeypatch.setattr(
        insumos, "_cantidad_solicitada_acumulada",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no una consulta por registro")),
    )
    seen = {}

    def _batch(_sb, _cid, keys, _exclude=None):
        seen["n"] = seen.get("n", 0) + 1
        seen["keys"] = len(list(keys))
        return {}

    monkeypatch.setattr(insumos, "batch_cantidad_solicitada_acumulada", _batch)
    data = insumos.list_presupuesto_registros(1, "Cap", "1.01", "PK-1")
    assert seen["n"] == 1
    assert seen["keys"] == 40
    assert len(data["registros"]) == 40


def test_acumulado_de_muchos_presupuestos_va_en_lotes_no_por_linea():
    calls = {"items": 0}

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table):
            self.table = table
            self._vals = []

        def select(self, *_a, **_k):
            return self

        def in_(self, _col, vals):
            self._vals = list(vals)
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            if self.table == "almacen_solicitud_item":
                calls["items"] += 1
                assert len(self._vals) <= 80
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    keys = [(i, "PK") for i in range(1, 201)]
    totals = insumos.batch_cantidad_solicitada_acumulada(_Sb(), 1, keys)
    assert calls["items"] == 3  # 80 + 80 + 40
    assert totals[(1, "PK")] == 0.0
    assert len(totals) == 200


def _linea_libre(i, pk="PK-1"):
    return {
        "descripcion_solicitada": f"Material de prueba {i}",
        "cantidad": 1,
        "pk_id": pk,
        "presupuesto_capitulo": "Cap",
        "presupuesto_item": "1.01",
        "presupuesto_id": 1,
        "presupuesto_ids": [1, 2],
        "es_principal": True,
        "unidad": "m3",
    }


def test_validar_200_lineas_del_mismo_pk_consulta_registros_una_vez(monkeypatch):
    regs = {"n": 0}

    def _regs(*_a, **_k):
        regs["n"] += 1
        return {"registros": [
            {"presupuesto_id": 1, "cant_total": 500, "saldo_disponible": 500},
            {"presupuesto_id": 2, "cant_total": 500, "saldo_disponible": 500},
        ]}

    monkeypatch.setattr(insumos, "list_presupuesto_registros", _regs)
    monkeypatch.setattr(insumos, "batch_cantidad_solicitada_acumulada", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "_sb", lambda: MagicMock())
    monkeypatch.setattr(
        svc, "_fetch_ppto_rows_batch",
        lambda ids, cid: {
            1: {"id": 1, "cant_total": 500, "capitulo": "Cap", "item": "1.01", "pk_id": "PK-1", "und": "m3"},
            2: {"id": 2, "cant_total": 500, "capitulo": "Cap", "item": "1.01", "pk_id": "PK-1", "und": "m3"},
        },
    )
    for n in (3, 30, 200):
        regs["n"] = 0
        out = svc._validate_items_payload([_linea_libre(i) for i in range(n)], 7, 1)
        assert len(out) == n
        assert regs["n"] == 1
        assert out[0]["repartos"]
        assert out[0]["cant_presupuestada"] == 1000


def test_validar_tres_pk_distintos_no_repite_por_linea(monkeypatch):
    regs = {"n": 0}

    def _regs(_cid, _cap, _item, pk, **_k):
        regs["n"] += 1
        return {"registros": [
            {"presupuesto_id": 1, "cant_total": 10, "saldo_disponible": 10},
            {"presupuesto_id": 2, "cant_total": 10, "saldo_disponible": 10},
        ]}

    monkeypatch.setattr(insumos, "list_presupuesto_registros", _regs)
    monkeypatch.setattr(insumos, "batch_cantidad_solicitada_acumulada", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "_sb", lambda: MagicMock())
    monkeypatch.setattr(svc, "_fetch_ppto_rows_batch", lambda *_a, **_k: {
        1: {"id": 1, "cant_total": 10, "capitulo": "Cap", "item": "1.01", "pk_id": "A"},
        2: {"id": 2, "cant_total": 10, "capitulo": "Cap", "item": "1.01", "pk_id": "A"},
    })
    items = [_linea_libre(i, pk=f"PK-{i}") for i in range(3)]
    svc._validate_items_payload(items, 7, 1)
    assert regs["n"] == 3


def test_validar_con_insumo_no_recorre_el_listado_ni_el_insumo_uno_a_uno(monkeypatch):
    monkeypatch.setattr(
        insumos, "resolver_vlr_cobro_listado",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("listado")),
    )
    monkeypatch.setattr(
        insumos, "get_insumo",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("get_insumo")),
    )
    monkeypatch.setattr(
        insumos, "resolve_presupuesto_row",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("combo presupuesto")),
    )
    monkeypatch.setattr(
        insumos, "list_presupuesto_registros",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("registros")),
    )
    monkeypatch.setattr(insumos, "batch_cantidad_solicitada_acumulada", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {5: 0.0})

    class _Q:
        def __init__(self, table):
            self.table = table

        def execute(self):
            if self.table == "almacen_insumo":
                return type("R", (), {"data": [{"id": 5, "rendimiento": 1.3}]})()
            return type("R", (), {"data": []})()

        def __getattr__(self, _name):
            return lambda *_a, **_k: self

    monkeypatch.setattr(insumos, "_sb", lambda: type("Sb", (), {"table": staticmethod(lambda name: _Q(name))})())
    monkeypatch.setattr(svc, "_fetch_ppto_rows_batch", lambda *_a, **_k: {
        10: {
            "id": 10, "pk_id": "PK", "capitulo": "Cap", "item": "1.01",
            "und": "m3", "cant_total": 100, "vlr_unitario": 50, "contrato_id": 1,
        },
    })
    monkeypatch.setattr(insumos, "prefetch_insumos_para_solicitud", lambda *_a, **_k: {
        5: {
            "id": 5, "codigo": "A", "descripcion": "Arena", "unidad": "m3",
            "rendimiento": 1.3, "valor_compra_referencia": 12, "origen": "almacen_insumo",
            "listado_precio_id": None, "cantidad_negociada": None,
        },
    })
    out = svc._validate_items_payload([{
        "insumo_id": 5,
        "descripcion_solicitada": "Arena lavada",
        "cantidad": 2,
        "pk_id": "PK",
        "presupuesto_capitulo": "Cap",
        "presupuesto_item": "1.01",
        "presupuesto_id": 10,
        "es_principal": True,
    }], 1, 1)
    assert out[0]["insumo_id"] == 5
    assert out[0]["cant_presupuestada"] == 100
    assert out[0]["vlr_unitario_cobro"] == 50
    assert out[0]["supera_presupuesto"] is False
    assert "banco" in (out[0]["contexto_presupuesto"]["texto_conversion"] or "")


def test_actualizar_200_lineas_en_tres_upserts():
    ops = {"upsert": [], "update": []}

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self):
            self._mode = "select"

        def select(self, *_a, **_k):
            self._mode = "select"
            return self

        def eq(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def update(self, payload):
            ops["update"].append(payload)
            return self

        def upsert(self, rows, on_conflict=None):
            assert on_conflict == "id"
            ops["upsert"].append(len(rows))
            return self

        def insert(self, rows):
            return self

        def delete(self):
            return self

        def execute(self):
            if self._mode == "select":
                return _Resp([
                    {"id": i, "numero_linea": i, "estado_validacion": "pendiente"}
                    for i in range(1, 201)
                ])
            return _Resp([])

    class _Sb:
        def table(self, _name):
            return _Q()

    items = [{
        "id": i,
        "cantidad": 1,
        "descripcion_solicitada": f"Linea {i} material",
        "presupuesto_id": i,
        "pk_id": "PK",
        "material_descripcion": f"Linea {i}",
        "unidad": "UND",
        "es_principal": True,
    } for i in range(1, 201)]
    svc._sync_solicitud_items(_Sb(), 9, "borrador", items, user_id=0)
    assert ops["upsert"] == [80, 80, 40]
    assert ops["update"] == []


def test_reparto_de_varias_lineas_borra_en_un_in():
    deletes = []

    class _Resp:
        data = [{"id": 1, "numero_linea": 1}, {"id": 2, "numero_linea": 2}, {"id": 3, "numero_linea": 3}]

    class _Q:
        def __init__(self, table):
            self.table = table
            self._ids = None

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def in_(self, _col, vals):
            self._ids = list(vals)
            return self

        def delete(self):
            return self

        def execute(self):
            if self.table == "almacen_solicitud_item_reparto" and self._ids is not None:
                deletes.append(self._ids)
            return _Resp()

    class _Sb:
        def table(self, name):
            return _Q(name)

    items = [{
        "id": i, "numero_linea": i, "presupuesto_id": 10, "presupuesto_ids": [10],
        "repartos": [{"presupuesto_id": 10, "cantidad": 1}],
    } for i in range(1, 4)]
    svc._sync_solicitud_item_repartos(_Sb(), 1, items)
    assert deletes == [[1, 2, 3]]


def test_programar_deja_la_solicitud_guardada_y_el_resto_para_despues(monkeypatch):
    ran = {}

    class _Bg:
        def add_task(self, fn, *args):
            ran["fn"] = fn
            ran["args"] = args

    monkeypatch.setattr(svc, "_sb", lambda: object())
    monkeypatch.setattr(tareas, "_guardar_estado", lambda *_a, **_k: None)
    result = {"id": 4, "consecutivo": 8}
    tareas.programar_tareas_tras_guardar(
        _Bg(), 1, 4, {"sub": 9, "nombre": "Ana"},
        accion="CREAR",
        detalle={"consecutivo": 8},
        valor_anterior=None,
        valor_nuevo={"id": 4},
        resultado=result,
    )
    assert result["tareas_fondo"]["estado"] == "pendiente"
    assert "log" not in result["tareas_fondo"]
    assert "registro de modificaciones" in (result["tareas_fondo"]["mensaje"] or "")
    assert ran["fn"] is tareas.ejecutar_tareas_tras_guardar
    assert ran["args"] == (1, 4)


def test_si_el_log_falla_la_solicitud_sigue_y_se_puede_reintentar(monkeypatch):
    saved = {}
    intentos = {"log": 0}

    def _guardar(_sb, sid, estado):
        saved[sid] = estado

    def _leer(_sb, sid):
        return saved.get(sid)

    def _paso(paso, _sb, _cid, _sid, estado):
        if paso == "log":
            intentos["log"] += 1
            if intentos["log"] == 1:
                raise ValueError("log caído")

    monkeypatch.setattr(tareas, "_guardar_estado", _guardar)
    monkeypatch.setattr(tareas, "_leer_estado", _leer)
    monkeypatch.setattr(tareas, "_correr_paso", _paso)
    monkeypatch.setattr(svc, "_sb", lambda: object())
    saved[4] = tareas._estado_inicial({"accion": "CREAR", "detalle": {}, "usuario": {"sub": 1}})
    primero = tareas.ejecutar_tareas_tras_guardar(1, 4)
    assert primero["estado"] == "error"
    assert primero["pasos"]["titulo"] == "ok"
    assert primero["pasos"]["log"] == "error"
    assert "registro de modificaciones" in primero["mensaje"]
    segundo = tareas.ejecutar_tareas_tras_guardar(1, 4)
    assert segundo["estado"] == "ok"
    assert intentos["log"] == 2
    assert segundo["pasos"]["titulo"] == "ok"


def test_sobrepresupuesto_sigue_exigiendo_justificacion():
    with pytest.raises(ValueError, match="justific"):
        svc._require_justificacion_sobrepresupuesto([{
            "supera_presupuesto": True,
            "es_principal": True,
            "observacion_residente": "corta",
            "numero_linea": 1,
        }])
