"""Agregar una línea a una solicitud masiva no renumera las existentes."""
from almacen_solicitud_numeracion import linea_congelada, planificar_numeros_linea


def test_insertar_en_medio_usa_el_siguiente_libre():
    existing = [
        {"id": 10, "numero_linea": 1},
        {"id": 11, "numero_linea": 2},
        {"id": 12, "numero_linea": 3},
    ]
    payload = [
        {"id": 10},
        {"cantidad": 1},
        {"id": 11},
        {"id": 12},
    ]
    assert planificar_numeros_linea(existing, payload) == [1, 4, 2, 3]


def test_agregar_al_final_continua_la_secuencia():
    existing = [{"id": 1, "numero_linea": 1}, {"id": 2, "numero_linea": 2}]
    assert planificar_numeros_linea(existing, [{"id": 1}, {"id": 2}, {}]) == [1, 2, 3]


def test_linea_aprobada_o_en_oc_queda_congelada():
    assert linea_congelada({"id": 2, "estado_validacion": "aprobado"}, set()) is True
    assert linea_congelada({"id": 3, "estado_validacion": "pendiente"}, {3}) is True
    assert linea_congelada({"id": 1, "estado_validacion": "pendiente"}, set()) is False


def test_sync_no_reescribe_aprobadas_ni_choca_el_numero(monkeypatch):
    import almacen_service as svc

    existing = [
        {"id": 1, "numero_linea": 1, "estado_validacion": "pendiente"},
        {"id": 2, "numero_linea": 2, "estado_validacion": "aprobado"},
        {"id": 3, "numero_linea": 3, "estado_validacion": "pendiente"},
    ]
    updates = []
    inserts = []

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table):
            self.table = table

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            if self.table == "almacen_orden_compra":
                return _Resp([{"id": 9}])
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    monkeypatch.setattr(svc, "_select_items_para_sync", lambda _sb, _sid: existing)
    monkeypatch.setattr(svc, "_solicitud_item_ids_en_ocs", lambda _sb, _ids: {3})
    monkeypatch.setattr(svc, "_item_for_db_insert", lambda it: {"cantidad": it.get("cantidad")})
    monkeypatch.setattr(
        svc,
        "_update_solicitud_item_row",
        lambda _sb, iid, row: updates.append((iid, row.get("numero_linea"))),
    )
    monkeypatch.setattr(
        svc,
        "_insert_solicitud_items_batch",
        lambda _sb, rows: inserts.extend(rows),
    )
    monkeypatch.setattr(svc, "_sync_solicitud_item_repartos", lambda *_a, **_k: None)

    items = [
        {"id": 1, "cantidad": 5},
        {"cantidad": 1},
        {"id": 2, "cantidad": 9},
        {"id": 3, "cantidad": 8},
    ]
    svc._sync_solicitud_items(_Sb(), 70, "enviada", items, user_id=0)
    assert updates == [(1, 1)]
    assert inserts == [{"cantidad": 1, "solicitud_id": 70, "numero_linea": 4, "estado_validacion": "pendiente"}]
    assert items[1]["numero_linea"] == 4
    assert items[2]["numero_linea"] == 2
    assert items[3]["numero_linea"] == 3
