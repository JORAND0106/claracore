"""Asignación en bloque: proveedor elegido y UPDATE por id (no upsert parcial)."""
from __future__ import annotations

from pathlib import Path

import pytest

import almacen_service as svc

ROOT = Path(__file__).resolve().parents[1]


def _fn(src: str, name: str) -> str:
    start = src.find(f"def {name}(")
    assert start >= 0, name
    nxt = src.find("\ndef ", start + 1)
    return src[start:nxt if nxt > 0 else None]


def test_mapear_bloque_body_acepta_proveedor():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    src_body = routes[routes.index("class MapearBloqueBody"): routes.index("class AprobarBloqueBody")]
    assert "proveedor_seleccionado_id" in src_body
    assert "proveedor_seleccionado_nombre" in src_body
    assert "cotizacion_numero_seleccionada" in src_body


def test_mapear_items_bloque_usa_update_no_upsert():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    fn = _fn(src, "mapear_items_bloque")
    assert "mapear_item_solicitud_gerencial" not in fn
    assert "_patch_solicitud_items_by_id" in fn
    assert "_update_solicitud_items_batch" not in fn
    assert "apply_saldo_flags_batch" in fn
    assert "_resolver_proveedor_mapeo" in fn
    assert "_persistir_cotizaciones_bloque" in fn
    assert "timing" in fn


def test_mapear_items_bloque_aplica_proveedor_a_todas(monkeypatch):
    lineas = [
        {
            "id": 11,
            "numero_linea": 1,
            "cantidad": 2,
            "capitulo": "Cap",
            "item": "1.01",
            "pk_id": "PK-1",
            "presupuesto_id": 5,
            "descripcion_solicitada": "Cemento",
            "material_descripcion": "Cemento",
            "unidad": "kg",
            "insumo_id": None,
            "es_principal": True,
            "es_recurrente": False,
            "estado_validacion": "pendiente",
        },
        {
            "id": 12,
            "numero_linea": 2,
            "cantidad": 3,
            "capitulo": "Cap",
            "item": "1.01",
            "pk_id": "PK-2",
            "presupuesto_id": 5,
            "descripcion_solicitada": "Cemento",
            "material_descripcion": "Cemento",
            "unidad": "kg",
            "insumo_id": 99,
            "es_principal": True,
            "es_recurrente": False,
            "estado_validacion": "aprobado",
            "valor_compra_unitario": 100,
        },
    ]
    store: dict = {"patches": [], "cot_insert": []}

    class _Resp:
        def __init__(self, data):
            self.data = data

        def execute(self):
            return self

    class _Q:
        def __init__(self, table):
            self.table = table
            self._ids = None
            self._pending = None
            self._update_body = None

        def select(self, *_a, **_k):
            return self

        def eq(self, col, val):
            if self._update_body is not None and col == "id":
                store["patches"].append({"id": int(val), **self._update_body})
                self._update_body = None
            return self

        def in_(self, col, vals):
            if col == "id":
                self._ids = list(vals)
            return self

        def insert(self, rows):
            store["cot_insert"] = list(rows)
            out = [{**r, "id": 1000 + i} for i, r in enumerate(rows)]
            self._pending = _Resp(out)
            return self

        def update(self, body):
            self._update_body = dict(body)
            return self

        def upsert(self, *_a, **_k):
            raise AssertionError("mapear en bloque no debe usar upsert")

        def execute(self):
            if self._pending is not None:
                resp = self._pending
                self._pending = None
                return resp
            if self.table == "almacen_solicitud_item" and self._ids is not None:
                return _Resp([r for r in lineas if r["id"] in self._ids])
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    monkeypatch.setattr(svc, "_sb", lambda: _Sb())
    monkeypatch.setattr(svc, "_exigir_agrupacion_libre", lambda *_a, **_k: None)
    monkeypatch.setattr(
        svc, "_fetch_solicitud_head",
        lambda *_a, **_k: {"id": 1, "estado": "enviada", "contrato_id": 1},
    )
    monkeypatch.setattr(svc, "_fetch_ocs_de_solicitud", lambda *_a, **_k: [])
    monkeypatch.setattr(
        svc, "_resolver_proveedor_mapeo",
        lambda *_a, **_k: {
            "aplicar": True,
            "proveedor_seleccionado_id": 7,
            "proveedor_seleccionado_nombre": "Proveedor B",
            "cotizacion_numero_seleccionada": "COT-B",
            "valor": 55.5,
            "forzar_costo": True,
        },
    )
    monkeypatch.setattr(svc, "_sincronizar_titulo_solicitud", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "get_solicitud", lambda *_a, **_k: {"id": 1, "items": lineas})

    import almacen_insumos_service as insumos

    monkeypatch.setattr(
        insumos, "prefetch_insumos_para_solicitud",
        lambda *_a, **_k: {42: {"id": 42, "descripcion": "Insumo X", "unidad": "kg"}},
    )

    def _resolve(_contrato_id, _user_id, raw, **_k):
        return {
            "insumo_id": 42,
            "listado_precio_id": None,
            "material_descripcion": "Insumo X",
            "unidad": "kg",
            "cantidad": raw["cantidad"],
            "valor_compra_unitario": 40,
            "vlr_unitario_cobro": 10,
            "supera_presupuesto": False,
            "supera_negociado": False,
            "es_principal": True,
            "pk_id": raw.get("pk_id"),
            "presupuesto_id": raw.get("presupuesto_id"),
        }

    monkeypatch.setattr(insumos, "resolve_insumo_for_solicitud", _resolve)
    monkeypatch.setattr(insumos, "apply_saldo_flags_batch", lambda *_a, **_k: None)

    result = svc.mapear_items_bloque(
        1, 1, 9,
        [11, 12],
        {
            "insumo_id": 42,
            "proveedor_seleccionado_id": 7,
            "proveedor_seleccionado_nombre": "Proveedor B",
            "cotizacion_numero_seleccionada": "COT-B",
        },
    )

    assert all(r["ok"] for r in result["resultados"])
    assert len(result["resultados"]) == 2
    assert "timing" in result
    principales = [row for row in store["patches"] if "insumo_id" in row]
    assert len(principales) == 2
    for row in principales:
        assert row["insumo_id"] == 42
        assert "solicitud_id" not in row  # UPDATE no reescribe identidad
        assert "numero_linea" not in row
        assert row["proveedor_seleccionado_id"] == 7
        assert row["proveedor_seleccionado_nombre"] == "Proveedor B"
        assert row["cotizacion_numero_seleccionada"] == "COT-B"
        assert float(row["valor_compra_unitario"]) == 55.5
    assert len(store.get("cot_insert") or []) == 2
    assert any("cotizacion_seleccionada_id" in row for row in store["patches"])


def test_update_batch_exige_solicitud_id_y_numero():
    with pytest.raises(ValueError, match="sin su solicitud"):
        svc._update_solicitud_items_batch(object(), [{"id": 1, "insumo_id": 2}])
    with pytest.raises(ValueError, match="sin su número"):
        svc._update_solicitud_items_batch(
            object(), [{"id": 1, "solicitud_id": 9, "insumo_id": 2}],
        )


def test_humanize_nulls_de_identidad_son_claros():
    msg = svc._humanize_solicitud_db_error(
        Exception(
            'null value in column "solicitud_id" of relation '
            '"almacen_solicitud_item" violates not-null constraint'
        )
    )
    assert "sin su solicitud" in msg.lower()
    assert "null value" not in msg.lower()

    msg2 = svc._humanize_solicitud_db_error(
        Exception(
            'null value in column "numero_linea" of relation '
            '"almacen_solicitud_item" violates not-null constraint'
        )
    )
    assert "sin su número" in msg2.lower()
    assert "null value" not in msg2.lower()


def test_mapear_items_bloque_falla_antes_de_escribir_si_hay_oc(monkeypatch):
    lineas = [
        {
            "id": 21,
            "numero_linea": 1,
            "cantidad": 1,
            "capitulo": "Cap",
            "item": "1",
            "pk_id": "PK",
            "presupuesto_id": 1,
            "descripcion_solicitada": "x",
            "es_principal": True,
        },
    ]

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def execute(self):
            return _Resp(lineas)

    class _Sb:
        def table(self, _name):
            return _Q()

    monkeypatch.setattr(svc, "_sb", lambda: _Sb())
    monkeypatch.setattr(svc, "_exigir_agrupacion_libre", lambda *_a, **_k: None)
    monkeypatch.setattr(
        svc, "_fetch_solicitud_head",
        lambda *_a, **_k: {"id": 1, "estado": "aprobada", "contrato_id": 1},
    )
    monkeypatch.setattr(svc, "_fetch_ocs_de_solicitud", lambda *_a, **_k: [{"id": 9}])
    monkeypatch.setattr(svc, "_solicitud_item_ids_en_ocs", lambda *_a, **_k: {21})
    monkeypatch.setattr(
        svc, "_patch_solicitud_items_by_id",
        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no debe escribir")),
    )

    with pytest.raises(ValueError, match="Orden de Compra"):
        svc.mapear_items_bloque(1, 1, 1, [21], {"insumo_id": 3})
