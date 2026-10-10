"""Agrupar solicitudes por proveedor y el nombre Solicitud # - Fecha - Proveedor - Estado."""
from datetime import datetime, timedelta, timezone

import pytest

from almacen_agrupar import (
    asignar_numeros_destino,
    exigir_solicitud_libre,
    ejecutar_agrupacion,
    format_titulo_grupo,
    mensaje_error_agrupar,
    planificar_agrupacion,
    vista_publica,
)
from almacen_orden_compra_pdf import generar_pdf_orden_compra
from almacen_service import _contar_lineas_sin_insumo


def _sol(sid, consec, estado="enviada", titulo=""):
    return {
        "id": sid,
        "consecutivo": consec,
        "estado": estado,
        "titulo": titulo,
        "created_at": "2026-03-13T15:00:00+00:00",
        "motivo_rechazo": None,
    }


def _lin(iid, sid, *, insumo=None, ev="pendiente", pid=None, nombre=""):
    return {
        "id": iid,
        "solicitud_id": sid,
        "insumo_id": insumo,
        "estado_validacion": ev,
        "proveedor_seleccionado_id": pid,
        "proveedor_seleccionado_nombre": nombre,
    }


def _aplicar(sols, items, oc):
    """Simula el resultado del plan para comprobar que la segunda pasada no mueve."""
    plan = planificar_agrupacion(sols, items, oc)
    por = {int(s["id"]): s for s in sols}
    seq = max(int(s["id"]) for s in sols) + 1
    consec = max(int(s["consecutivo"]) for s in sols) + 1
    guard = 0
    while plan["por_crear"] and guard < 8:
        nueva = _sol(seq, consec, "borrador")
        sols.append(nueva)
        por[seq] = nueva
        seq += 1
        consec += 1
        guard += 1
        plan = planificar_agrupacion(sols, items, oc)
    for mov in plan["movimientos"]:
        it = next(x for x in items if int(x["id"]) == int(mov["item_id"]))
        it["solicitud_id"] = mov["despues"]["solicitud_id"]
    for g in plan["grupos"]:
        dest = por[int(g["solicitud_id"])]
        dest["estado"] = g.get("estado_cabecera") or g["estado"]
        dest["titulo"] = format_titulo_grupo(
            dest["consecutivo"], dest["created_at"], g["proveedor"], g["estado"],
        )
    for vac in plan["vacias"]:
        dest = por[int(vac["solicitud_id"])]
        dest["estado"] = "borrador"
        dest["titulo"] = vac["titulo"]
    return planificar_agrupacion(sols, items, oc)


def test_reune_por_proveedor_y_estado_aunque_el_insumo_cambie():
    """Pepito y Pancracio, cada uno con aprobadas y pendientes, de insumos distintos."""
    sols = [_sol(1, 1), _sol(2, 2), _sol(3, 3), _sol(4, 4), _sol(5, 5), _sol(6, 6)]
    items = [
        _lin(1, 1, insumo=10, ev="aprobado", pid=1, nombre="Pepito Pérez"),
        _lin(2, 2, insumo=11, ev="aprobado", pid=1, nombre="Pepito Pérez"),
        _lin(3, 1, insumo=12, ev="pendiente", pid=1, nombre="Pepito Pérez"),
        _lin(4, 3, insumo=20, ev="aprobado", pid=2, nombre="Pancracio Pardo"),
        _lin(5, 4, insumo=21, ev="pendiente", pid=2, nombre="Pancracio Pardo"),
        _lin(6, 2, insumo=22, ev="pendiente", pid=2, nombre="Pancracio Pardo"),
        _lin(7, 5, insumo=None, ev="pendiente"),
        _lin(8, 6, insumo=None, ev="aprobado"),
        _lin(9, 3, insumo=30, ev="rechazado", pid=1, nombre="Pepito Pérez"),
    ]
    plan = planificar_agrupacion(sols, items, set())
    por_clave = {g["clave"]: g for g in plan["grupos"]}
    assert set(por_clave) == {
        "aprobada:id:1",
        "pendiente:id:1",
        "aprobada:id:2",
        "pendiente:id:2",
        "sin_insumo",
    }
    assert por_clave["aprobada:id:1"]["item_ids"] == [1, 2]
    assert por_clave["pendiente:id:1"]["item_ids"] == [3]
    assert por_clave["aprobada:id:2"]["item_ids"] == [4]
    assert por_clave["pendiente:id:2"]["item_ids"] == [5, 6]
    assert por_clave["sin_insumo"]["item_ids"] == [7, 8]
    assert all(9 not in g["item_ids"] for g in plan["grupos"])
    assert por_clave["pendiente:id:1"]["estado"] == "enviada"
    assert por_clave["aprobada:id:1"]["estado"] == "aprobada"
    assert por_clave["aprobada:id:1"]["estado_cabecera"] == "enviada"
    segundo = _aplicar(sols, items, set())
    assert segundo["sin_cambios"] is True
    assert segundo["se_mueven"] == 0


def test_separa_aprobadas_pendientes_sin_insumo_y_rechazadas():
    sols = [_sol(1, 1), _sol(2, 2), _sol(3, 3), _sol(4, 4)]
    items = [
        _lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"),
        _lin(2, 1, insumo=11, ev="pendiente", pid=6, nombre="Canteras"),
        _lin(3, 1, insumo=None, ev="pendiente"),
        _lin(4, 1, insumo=12, ev="rechazado", pid=5, nombre="Aceros"),
        _lin(5, 2, insumo=13, ev="aprobado", pid=5, nombre="Aceros"),
    ]
    plan = planificar_agrupacion(sols, items, set())
    por_clave = {g["clave"]: g for g in plan["grupos"]}
    assert set(por_clave) == {"aprobada:id:5", "pendiente:id:6", "sin_insumo"}
    assert por_clave["aprobada:id:5"]["item_ids"] == [1, 5]
    assert por_clave["aprobada:id:5"]["estado"] == "aprobada"
    assert por_clave["aprobada:id:5"]["estado_cabecera"] == "enviada"
    assert por_clave["pendiente:id:6"]["estado"] == "enviada"
    assert por_clave["sin_insumo"]["proveedor"] == "Sin proveedor"
    assert all(4 not in g["item_ids"] for g in plan["grupos"])
    assert plan["por_crear"] == 0


def test_linea_ya_en_oc_no_se_mueve_ni_su_solicitud_recibe_mas():
    sols = [_sol(1, 1), _sol(2, 2)]
    comprada = _lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros")
    comprada["en_orden_compra"] = True
    items = [
        comprada,
        _lin(2, 1, insumo=11, ev="aprobado", pid=5, nombre="Aceros"),
        _lin(3, 2, insumo=12, ev="aprobado", pid=5, nombre="Aceros"),
    ]
    plan = planificar_agrupacion(sols, items, set())
    assert all(1 not in g["item_ids"] for g in plan["grupos"])
    assert all(g["solicitud_id"] != 1 for g in plan["grupos"])
    grupo = next(g for g in plan["grupos"] if 3 in g["item_ids"])
    assert grupo["item_ids"] == [2, 3]
    assert grupo["solicitud_id"] == 2
    assert grupo["estado_cabecera"] == "enviada"
    assert plan["lineas_total"] == 3


def test_la_solicitud_con_oc_no_entra():
    sols = [_sol(1, 1), _sol(9, 9, "aprobada")]
    items = [
        _lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"),
        _lin(2, 9, insumo=10, ev="aprobado", pid=5, nombre="Aceros"),
    ]
    plan = planificar_agrupacion(sols, items, {9})
    assert plan["grupos"][0]["item_ids"] == [1]
    assert plan["congeladas"] == 1
    assert all(v["solicitud_id"] != 9 for v in plan["vacias"])
    assert all(g["solicitud_id"] != 9 for g in plan["grupos"])


def test_si_faltan_solicitudes_pide_crear_solo_esas():
    sols = [_sol(1, 1)]
    items = [
        _lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"),
        _lin(2, 1, insumo=11, ev="pendiente", pid=6, nombre="Canteras"),
    ]
    plan = planificar_agrupacion(sols, items, set())
    assert plan["por_crear"] == 1
    assert sum(1 for g in plan["grupos"] if g["crear"]) == 1


def test_agrupar_dos_veces_no_cambia_la_segunda():
    sols = [_sol(1, 1), _sol(2, 2), _sol(3, 3)]
    items = [
        _lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"),
        _lin(2, 1, insumo=11, ev="pendiente", pid=6, nombre="Canteras"),
        _lin(3, 2, insumo=None, ev=""),
        _lin(4, 2, insumo=12, ev="rechazado", pid=5, nombre="Aceros"),
        _lin(5, 3, insumo=13, ev="aprobado", pid=5, nombre="Aceros"),
    ]
    segunda = _aplicar(sols, items, set())
    assert segunda["sin_cambios"] is True
    assert segunda["se_mueven"] == 0
    assert segunda["por_crear"] == 0
    assert segunda["ajustes"] == []
    titulos = [s["titulo"] for s in sols]
    assert any(t.endswith("Aceros - Aprobada") for t in titulos)
    assert any(t.endswith("Canteras - Enviada") for t in titulos)
    assert any(t.endswith("Sin proveedor - Borrador") for t in titulos)
    por_item = {int(it["id"]): int(it["solicitud_id"]) for it in items}
    assert por_item[4] == 2
    assert por_item[4] != por_item[1]
    assert por_item[3] != por_item[2]


def test_nombre_lleva_consecutivo_fecha_proveedor_y_estado():
    titulo = format_titulo_grupo(12, "2026-03-13T15:00:00+00:00", "Canteras", "enviada")
    assert titulo == "Solicitud #12 - 13/03/2026 - Canteras - Enviada"


def test_la_vista_sin_visibilidad_no_lleva_cifras():
    plan = {
        "grupos": [{
            "proveedor": "Aceros",
            "estado": "aprobada",
            "estado_label": "Aprobada",
            "lineas": 1,
            "se_mueven": 0,
            "solicitud_id": 1,
            "consecutivo": 1,
            "crear": False,
            "titulo": "Solicitud #1 - 13/03/2026 - Aceros - Aprobada",
            "total": 999,
        }],
        "vacias": [],
        "por_crear": 0,
        "se_mueven": 0,
        "sin_cambios": True,
        "congeladas": 0,
    }
    publica = vista_publica(plan, ver_economicos=False)
    assert "total" not in publica["grupos"][0]
    assert publica["ver_economicos"] is False


def test_el_pdf_muestra_el_nombre_completo():
    html = generar_pdf_orden_compra(
        contrato={"numero": "CT-1", "contratista": "Vías"},
        orden_compra={"numero_oc": 4, "items": []},
        solicitud={
            "consecutivo": 12,
            "titulo": "Solicitud #12 - 13/03/2026 - Canteras - Aprobada",
            "items": [],
        },
        solo_html=True,
    )
    assert "Solicitud #12 - 13/03/2026 - Canteras - Aprobada" in html


def test_contar_sin_insumo_no_marca_si_falta_la_columna():
    assert _contar_lineas_sin_insumo([{"id": 1}, {"id": 2}]) == 0
    assert _contar_lineas_sin_insumo([
        {"id": 1, "insumo_id": None},
        {"id": 2, "insumo_id": 9},
        {"id": 3, "insumo_id": None},
    ]) == 2


def test_otro_usuario_no_edita_mientras_se_agrupa():
    class Q:
        def __init__(self):
            self.col = None
            self.val = None

        def select(self, *_a, **_k):
            return self

        def eq(self, col, val):
            self.col = col
            self.val = val
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": [{
                "usuario_id": 4,
                "solicitud_ids": [8],
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat(),
            }]})()

    class SB:
        def table(self, name):
            assert name == "almacen_agrupacion_bloqueo"
            return Q()

    with pytest.raises(ValueError, match="agrupando"):
        exigir_solicitud_libre(SB(), 1, 8, 9)
    exigir_solicitud_libre(SB(), 1, 8, 4)
    exigir_solicitud_libre(SB(), 1, 99, 9)


class _Resp:
    def __init__(self, data):
        self.data = data


class _Mem:
    def __init__(self, db, log):
        self.db = db
        self.log = log
        self.table = ""
        self.filters = []
        self.op = "select"
        self.payload = None

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, list(vals)))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = dict(payload)
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = dict(payload)
        return self

    def upsert(self, payload, on_conflict=None, **_k):
        self.op = "upsert"
        self.payload = payload
        self.on_conflict = on_conflict
        return self

    def delete(self):
        self.op = "delete"
        return self

    def _match(self, row):
        for op, col, val in self.filters:
            if op == "eq" and row.get(col) != val:
                return False
            if op == "in" and row.get(col) not in val:
                return False
        return True

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self.op == "select":
            self.log.append(("select", self.table))
            return _Resp([dict(r) for r in rows if self._match(r)])
        if self.op == "update":
            n = 0
            for row in rows:
                if self._match(row):
                    row.update(self.payload)
                    n += 1
            self.log.append(("update", self.table, self.payload, n))
            return _Resp([])
        if self.op == "insert":
            row = dict(self.payload)
            row.setdefault("id", self.db["_seq"])
            self.db["_seq"] += 1
            rows.append(row)
            self.log.append(("insert", self.table))
            return _Resp([dict(row)])
        if self.op == "upsert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            for payload in payloads:
                payload = dict(payload)
                if self.on_conflict == "id" or (
                    self.table == "almacen_solicitud_item" and payload.get("id") is not None
                ):
                    found = next((r for r in rows if r.get("id") == payload.get("id")), None)
                else:
                    found = next(
                        (r for r in rows if r.get("contrato_id") == payload.get("contrato_id")),
                        None,
                    )
                if found:
                    found.update(payload)
                else:
                    rows.append(dict(payload))
            self.log.append(("upsert", self.table, len(payloads)))
            return _Resp([dict(p) if isinstance(p, dict) else p for p in payloads])
        if self.op == "delete":
            self.db[self.table] = [r for r in rows if not self._match(r)]
            self.log.append(("delete", self.table))
            return _Resp([])
        return _Resp([])


def test_ejecutar_dos_veces_no_reescribe_lineas(monkeypatch):
    db = {
        "_seq": 50,
        "almacen_solicitud": [
            {**_sol(1, 1), "contrato_id": 3},
            {**_sol(2, 2, "borrador", "Solicitud #2 - 13/03/2026"), "contrato_id": 3},
        ],
        "almacen_solicitud_item": [
            _lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"),
            _lin(2, 1, insumo=11, ev="pendiente", pid=6, nombre="Canteras"),
        ],
        "almacen_orden_compra": [],
        "almacen_agrupacion_bloqueo": [],
    }
    log = []

    class SB:
        def table(self, name):
            q = _Mem(db, log)
            q.table = name
            return q

    monkeypatch.setattr("almacen_service._sb", lambda: SB())
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-03-13T15:00:00+00:00")

    primero = ejecutar_agrupacion(3, 7, ver_economicos=False)
    assert primero["se_mueven"] == 1
    assert primero["creadas"] == 0
    assert primero["bloqueo_persistido"] is True
    assert any(it["solicitud_id"] == 2 and it["id"] == 2 for it in db["almacen_solicitud_item"])
    assert db["almacen_solicitud"][0]["estado"] == "enviada"
    assert "Aprobada" in (db["almacen_solicitud"][0]["titulo"] or "")
    assert "Aceros" in (db["almacen_solicitud"][0]["titulo"] or "")
    assert "Canteras" in (db["almacen_solicitud"][1]["titulo"] or "")

    cortes = len(log)
    segundo = ejecutar_agrupacion(3, 7, ver_economicos=False)
    assert segundo["sin_cambios"] is True
    posteriores = log[cortes:]
    assert not any(op == "update" and tabla == "almacen_solicitud_item" for op, tabla, *_ in posteriores)
    assert not any(op == "update" and tabla == "almacen_solicitud" for op, tabla, *_ in posteriores)
    assert not any(op == "insert" and tabla == "almacen_solicitud" for op, tabla, *_ in posteriores)


def test_lineas_con_el_mismo_numero_reciben_el_siguiente_libre(monkeypatch):
    db = {
        "_seq": 50,
        "almacen_solicitud": [
            {**_sol(1, 1), "contrato_id": 3},
            {**_sol(2, 2), "contrato_id": 3},
        ],
        "almacen_solicitud_item": [
            {**_lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
            {**_lin(2, 2, insumo=11, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
        ],
        "almacen_orden_compra": [],
        "almacen_agrupacion_bloqueo": [],
    }
    log = []

    class SB:
        def table(self, name):
            q = _Mem(db, log)
            q.table = name
            return q

    monkeypatch.setattr("almacen_service._sb", lambda: SB())
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-03-13T15:00:00+00:00")

    primero = ejecutar_agrupacion(3, 7, ver_economicos=False)
    assert primero["creadas"] == 0
    assert primero["se_mueven"] == 1
    mov = primero["movimientos"][0]
    assert mov["antes"]["solicitud_id"] == 2
    assert mov["antes"]["numero_linea"] == 1
    assert mov["despues"]["numero_linea"] == 2
    assert mov["despues"]["solicitud_id"] == 1
    por_sol = {}
    for it in db["almacen_solicitud_item"]:
        por_sol.setdefault(it["solicitud_id"], set()).add(it["numero_linea"])
    assert len(por_sol[1]) == 2
    assert db["almacen_solicitud_item"][0]["numero_linea"] == 1

    segundo = ejecutar_agrupacion(3, 7, ver_economicos=False)
    assert segundo["sin_cambios"] is True
    assert len(db["almacen_solicitud"]) == 2


def test_si_falla_a_mitad_no_deja_lineas_movidas(monkeypatch):
    db = {
        "_seq": 80,
        "almacen_solicitud": [
            {**_sol(1, 1), "contrato_id": 3},
            {**_sol(2, 2), "contrato_id": 3},
            {**_sol(3, 3), "contrato_id": 3},
        ],
        "almacen_solicitud_item": [
            {**_lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
            {**_lin(2, 2, insumo=11, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
            {**_lin(3, 3, insumo=12, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
        ],
        "almacen_orden_compra": [],
        "almacen_agrupacion_bloqueo": [],
    }
    log = []
    updates = {"n": 0}

    class SB:
        def table(self, name):
            q = _Mem(db, log)
            q.table = name
            original = q.execute

            def execute():
                mueve = (
                    q.op == "update"
                    and q.table == "almacen_solicitud_item"
                    and "solicitud_id" in (q.payload or {})
                    and updates["n"] == 0
                )
                if mueve:
                    updates["n"] += 1
                    raise RuntimeError(
                        'duplicate key value violates unique constraint "idx_almacen_solicitud_item_linea"'
                    )
                return original()

            q.execute = execute
            return q

    monkeypatch.setattr("almacen_service._sb", lambda: SB())
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-03-13T15:00:00+00:00")

    with pytest.raises(ValueError) as exc:
        ejecutar_agrupacion(3, 7, ver_economicos=False)
    texto = str(exc.value)
    assert "idx_almacen" not in texto
    assert "duplicate" not in texto.lower()
    assert "No quedó ningún movimiento" in texto or "No se pudo agrupar" in texto
    lugares = {it["id"]: (it["solicitud_id"], it["numero_linea"]) for it in db["almacen_solicitud_item"]}
    assert lugares[1] == (1, 1)
    assert lugares[2] == (2, 1)
    assert lugares[3] == (3, 1)


def _sb_de(db, log):
    class SB:
        def table(self, name):
            q = _Mem(db, log)
            q.table = name
            return q

    return SB()


def test_agrupar_separa_el_monton_aunque_la_cotizacion_no_traiga_proveedor(monkeypatch):
    """La versión anterior dejó #5 en Varios proveedores y #7 en Sin proveedor seleccionado.

    Prov. muestra el proveedor del insumo. La cotización guardada no trae ese dato.
    Agrupar tiene que leerlo, guardar la línea y moverla.
    """
    basura = [{
        "tipo": "insumo",
        "numero": "C-1",
        "valor": 10,
        "es_ganadora": True,
        "proveedor": "",
    }]
    fenix = "DISTRIBUIDORA DOTACIONES EPP FENIX SAS"
    titan = "TITAN MANUFACTURAS DE CEMENTO"
    king = "KINGNOVA S.A.S."
    items = [
        {
            "id": 1, "solicitud_id": 5, "numero_linea": 1, "insumo_id": 100,
            "estado_validacion": "pendiente",
            "proveedor_seleccionado_id": None, "proveedor_seleccionado_nombre": "",
            "cantidad": 1, "valor_compra_unitario": 80, "descripcion_solicitada": "CC-1614-073",
        },
        {
            "id": 2, "solicitud_id": 5, "numero_linea": 2, "insumo_id": 101,
            "estado_validacion": "pendiente",
            "proveedor_seleccionado_id": None, "proveedor_seleccionado_nombre": "Sin proveedor seleccionado",
            "cantidad": 1, "valor_compra_unitario": 14, "descripcion_solicitada": "CC-1614-001",
        },
        {
            "id": 3, "solicitud_id": 7, "numero_linea": 1, "insumo_id": 100,
            "estado_validacion": "aprobado",
            "proveedor_seleccionado_id": None, "proveedor_seleccionado_nombre": "",
            "cantidad": 1, "valor_compra_unitario": 187, "descripcion_solicitada": "CC-1614-068",
        },
        {
            "id": 4, "solicitud_id": 7, "numero_linea": 2, "insumo_id": 102,
            "estado_validacion": "aprobado",
            "proveedor_seleccionado_id": None, "proveedor_seleccionado_nombre": "",
            "cantidad": 1, "valor_compra_unitario": 398, "descripcion_solicitada": "CC-1614-075",
        },
        {
            "id": 5, "solicitud_id": 8, "numero_linea": 1, "insumo_id": 100,
            "estado_validacion": "pendiente",
            "proveedor_seleccionado_id": 1, "proveedor_seleccionado_nombre": fenix,
            "cantidad": 1, "valor_compra_unitario": 169, "descripcion_solicitada": "CC-1614-076",
        },
    ]
    db = {
        "_seq": 20,
        "almacen_solicitud": [
            {**_sol(5, 5, "enviada", "Solicitud #5 - 01/10/2026 - Varios proveedores - Enviada"), "contrato_id": 3, "created_at": "2026-10-01T19:38:00+00:00"},
            {**_sol(7, 7, "aprobada", "Solicitud #7 - 01/10/2026 - Sin proveedor seleccionado - Aprobada"), "contrato_id": 3, "created_at": "2026-10-01T19:51:00+00:00"},
            {**_sol(8, 8, "enviada", f"Solicitud #8 - 06/10/2026 - {fenix} - Enviada"), "contrato_id": 3, "created_at": "2026-10-06T14:45:00+00:00"},
        ],
        "almacen_solicitud_item": items,
        "almacen_insumo": [
            {"id": 100, "proveedor_id": 1, "cotizaciones_detalle": basura, "cotizacion_numero": "C-1"},
            {"id": 101, "proveedor_id": 2, "cotizaciones_detalle": basura, "cotizacion_numero": "C-2"},
            {"id": 102, "proveedor_id": 3, "cotizaciones_detalle": basura, "cotizacion_numero": "C-3"},
        ],
        "almacen_proveedor": [
            {"id": 1, "razon_social": fenix},
            {"id": 2, "razon_social": titan},
            {"id": 3, "razon_social": king},
        ],
        "almacen_orden_compra": [],
        "almacen_agrupacion_bloqueo": [],
    }
    log = []
    monkeypatch.setattr("almacen_service._sb", lambda: _sb_de(db, log))
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-10-10T00:30:00+00:00")
    from almacen_agrupar import vista_previa_agrupacion

    antes = len(db["almacen_solicitud_item"])
    vista = vista_previa_agrupacion(3, ver_economicos=False)
    assert vista["sin_cambios"] is False
    assert vista["se_mueven"] > 0
    assert vista["por_crear"] == 1
    assert vista["lineas_sin_reconocer"] == 0
    nombres = {g["proveedor"] for g in vista["grupos"]}
    assert fenix in nombres
    assert titan in nombres
    assert king in nombres
    assert "Sin proveedor seleccionado" not in nombres
    assert "Varios proveedores" not in nombres
    assert "Sin proveedor asignado" not in nombres
    linea1 = next(it for it in db["almacen_solicitud_item"] if it["id"] == 1)
    assert linea1["proveedor_seleccionado_id"] == 1
    assert linea1["proveedor_seleccionado_nombre"] == fenix

    hecho = ejecutar_agrupacion(
        3, 7, ver_economicos=False, confirmar_creacion=True, crear_hasta=vista["por_crear"],
    )
    assert len(db["almacen_solicitud_item"]) == antes
    assert sorted(it["id"] for it in db["almacen_solicitud_item"]) == [1, 2, 3, 4, 5]
    por_sol = {}
    for it in db["almacen_solicitud_item"]:
        por_sol.setdefault(it["solicitud_id"], []).append(it)
    for lineas in por_sol.values():
        proveedores = {it.get("proveedor_seleccionado_id") for it in lineas}
        estados = {
            "aprobada" if (it.get("estado_validacion") or "") == "aprobado" else "enviada"
            for it in lineas
        }
        assert len(proveedores) == 1
        assert len(estados) == 1
    fenix_pend = [it for it in db["almacen_solicitud_item"] if it["id"] in (1, 5)]
    assert len({it["solicitud_id"] for it in fenix_pend}) == 1
    assert fenix_pend[0]["solicitud_id"] == 8
    titulos = " | ".join(s.get("titulo") or "" for s in db["almacen_solicitud"])
    assert "Sin proveedor seleccionado" not in titulos
    assert "Varios proveedores" not in titulos
    assert fenix in titulos
    assert titan in titulos
    assert king in titulos
    aprobadas = [s for s in db["almacen_solicitud"] if "Aprobada" in (s.get("titulo") or "") and fenix in (s.get("titulo") or "")]
    assert len(aprobadas) == 1
    assert aprobadas[0]["estado"] == "enviada"

    segundo = ejecutar_agrupacion(3, 7, ver_economicos=False)
    assert segundo["sin_cambios"] is True
    assert segundo["se_mueven"] == 0
    assert len(db["almacen_solicitud_item"]) == antes
    assert hecho["lineas_total"] == antes


def test_proveedor_de_catalogo_si_la_linea_no_lo_eligio(monkeypatch):
    """La solicitud #5: Prov. lleno y proveedor_seleccionado vacío. Agrupa por el insumo."""
    proveedores = [
        (1, "DISTRIBUIDORA DOTACIONES EPP FENIX SAS"),
        (2, "TITAN MANUFACTURAS DE CEMENTO"),
        (3, "PAVCO ( Wavin )"),
        (4, "Triturados TG"),
        (5, "FERRETERIA VILLA ALVAREZ SAS"),
    ]
    items = []
    for n in range(34):
        pid, _nombre = proveedores[n % 5]
        items.append({
            "id": n + 1,
            "solicitud_id": 5,
            "numero_linea": n + 1,
            "insumo_id": 100 + (n % 5),
            "estado_validacion": "pendiente",
            "proveedor_seleccionado_id": None,
            "proveedor_seleccionado_nombre": "",
            "cantidad": 2,
            "valor_compra_unitario": 10,
            "descripcion_solicitada": f"Material {n + 1}",
        })
    items.append({
        "id": 35,
        "solicitud_id": 6,
        "numero_linea": 1,
        "insumo_id": None,
        "estado_validacion": "pendiente",
        "cantidad": 1,
    })
    items.append({
        "id": 36,
        "solicitud_id": 6,
        "numero_linea": 2,
        "insumo_id": 200,
        "estado_validacion": "aprobado",
        "proveedor_seleccionado_id": None,
        "proveedor_seleccionado_nombre": "",
        "cantidad": 1,
        "valor_compra_unitario": 4,
    })
    items.append({
        "id": 37,
        "solicitud_id": 7,
        "numero_linea": 1,
        "insumo_id": 201,
        "estado_validacion": "rechazado",
        "cantidad": 1,
    })
    db = {
        "_seq": 80,
        "almacen_solicitud": [
            {**_sol(5, 5, "enviada", "Solicitud #5 - 01/10/2026 - Sin proveedor seleccionado - Enviada"), "contrato_id": 3},
            {**_sol(6, 6, "enviada", "Solicitud #6"), "contrato_id": 3},
            {**_sol(7, 7, "enviada", "Solicitud #7"), "contrato_id": 3},
            {**_sol(8, 8, "borrador", "Solicitud #8"), "contrato_id": 3},
            {**_sol(9, 9, "borrador", "Solicitud #9"), "contrato_id": 3},
            {**_sol(10, 10, "borrador", "Solicitud #10"), "contrato_id": 3},
            {**_sol(11, 11, "borrador", "Solicitud #11"), "contrato_id": 3},
            {**_sol(12, 12, "borrador", "Solicitud #12"), "contrato_id": 3},
        ],
        "almacen_solicitud_item": items,
        "almacen_insumo": [{"id": 100 + i, "proveedor_id": i + 1} for i in range(5)] + [
            {"id": 200, "proveedor_id": 3},
            {"id": 201, "proveedor_id": None},
        ],
        "almacen_proveedor": [{"id": pid, "razon_social": nombre} for pid, nombre in proveedores],
        "almacen_orden_compra": [],
        "almacen_agrupacion_bloqueo": [],
    }
    log = []
    monkeypatch.setattr("almacen_service._sb", lambda: _sb_de(db, log))
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-10-01T19:38:00+00:00")

    from almacen_agrupar import vista_previa_agrupacion

    antes = len(db["almacen_solicitud_item"])
    t_prev = time_ms(lambda: vista_previa_agrupacion(3, ver_economicos=True))
    vista, ms_prev = t_prev
    nombres = {g["proveedor"] for g in vista["grupos"]}
    assert "Sin proveedor seleccionado" not in nombres
    assert "DISTRIBUIDORA DOTACIONES EPP FENIX SAS" in nombres
    assert "PAVCO ( Wavin )" in nombres
    assert "Triturados TG" in nombres
    assert "FERRETERIA VILLA ALVAREZ SAS" in nombres
    assert "TITAN MANUFACTURAS DE CEMENTO" in nombres
    assert "Sin proveedor" in nombres
    assert "Rechazadas" not in nombres
    assert vista["lineas_total"] == antes
    assert sum(g["lineas"] for g in vista["grupos"]) == antes - 1
    assert vista["proveedores_completados"] == 35
    linea1 = next(it for it in db["almacen_solicitud_item"] if it["id"] == 1)
    assert linea1["proveedor_seleccionado_id"] == 1
    assert linea1["proveedor_seleccionado_nombre"] == "DISTRIBUIDORA DOTACIONES EPP FENIX SAS"
    linea36 = next(it for it in db["almacen_solicitud_item"] if it["id"] == 36)
    assert linea36["proveedor_seleccionado_id"] == 3
    assert linea36["proveedor_seleccionado_nombre"] == "PAVCO ( Wavin )"
    assert any(x[0] == "update" and x[1] == "almacen_solicitud_item" for x in log)
    assert not any(x[0] == "upsert" and x[1] == "almacen_solicitud_item" for x in log)
    assert "más de un proveedor" in (vista.get("diagnostico_texto") or "")
    selects_item = [x for x in log if x[0] == "select" and x[1] == "almacen_solicitud_item"]
    assert len(selects_item) == 1
    assert not any(x[1] == "almacen_insumo_cotizacion_soporte" for x in log if x[0] == "select")

    log.clear()
    t_apply = time_ms(lambda: ejecutar_agrupacion(3, 7, ver_economicos=True))
    hecho, ms_apply = t_apply
    assert len(db["almacen_solicitud_item"]) == antes
    assert hecho["lineas_total"] == antes
    ids = [it["id"] for it in db["almacen_solicitud_item"]]
    assert sorted(ids) == list(range(1, antes + 1))
    por_sol = {}
    for it in db["almacen_solicitud_item"]:
        por_sol.setdefault(it["solicitud_id"], []).append(it)
    for sid, lineas in por_sol.items():
        proveedores = set()
        estados = set()
        for it in lineas:
            ev = (it.get("estado_validacion") or "")
            if ev == "rechazado":
                proveedores.add("rechazadas")
                estados.add("rechazada")
            elif not it.get("insumo_id"):
                proveedores.add("sin_insumo")
                estados.add("sin_insumo")
            else:
                proveedores.add(it.get("proveedor_seleccionado_id") or "sin")
                estados.add("aprobada" if ev == "aprobado" else "enviada")
        assert len(proveedores) == 1, sid
        assert len(estados) == 1, sid
    titulos = " | ".join(s.get("titulo") or "" for s in db["almacen_solicitud"])
    assert "Sin proveedor seleccionado" not in titulos
    assert "PAVCO ( Wavin )" in titulos
    pavco = [s for s in db["almacen_solicitud"] if "PAVCO ( Wavin )" in (s.get("titulo") or "")]
    assert {s.get("estado") for s in pavco} == {"enviada"}
    assert any("Aprobada" in (s.get("titulo") or "") for s in pavco)
    assert any("Enviada" in (s.get("titulo") or "") for s in pavco)
    assert any(
        x[0] == "update" and x[1] == "almacen_solicitud_item" and "solicitud_id" in (x[2] or {})
        for x in log
    )
    assert not any(x[0] == "upsert" and x[1] == "almacen_solicitud_item" for x in log)
    conservada = next(it for it in db["almacen_solicitud_item"] if it["id"] == 1)
    assert conservada["insumo_id"] == 100
    assert conservada["descripcion_solicitada"] == "Material 1"
    assert conservada["cantidad"] == 2
    assert conservada["estado_validacion"] == "pendiente"
    consultas_aplicar = {}
    for op, tabla, *_resto in log:
        consultas_aplicar[(op, tabla)] = consultas_aplicar.get((op, tabla), 0) + 1
    assert consultas_aplicar.get(("upsert", "almacen_solicitud_item"), 0) == 0
    assert consultas_aplicar.get(("update", "almacen_solicitud_item"), 0) >= 1
    assert consultas_aplicar.get(("select", "almacen_solicitud_item"), 0) <= 2

    segundo = ejecutar_agrupacion(3, 7, ver_economicos=True)
    assert segundo["sin_cambios"] is True
    assert segundo["proveedores_completados"] == 0
    assert len(db["almacen_solicitud_item"]) == antes

    # Deshacer desde el log que escribiría la ruta.
    db["logs"] = []
    eid = hecho["ejecucion_id"]
    for mov in hecho["movimientos"]:
        db["logs"].append({
            "id": len(db["logs"]) + 1,
            "accion": "AGRUPAR",
            "modulo": "ALMACEN",
            "contrato_id": 3,
            "entidad_tipo": "solicitud_item",
            "entidad_id": str(mov["item_id"]),
            "detalle": {"motivo": "Agrupar solicitudes por proveedor", "ejecucion_id": eid},
            "valor_anterior": mov["antes"],
            "valor_nuevo": mov["despues"],
            "created_at": "2026-10-09T20:00:00+00:00",
        })
    for aj in hecho["ajustes"]:
        db["logs"].append({
            "id": len(db["logs"]) + 1,
            "accion": "AGRUPAR",
            "modulo": "ALMACEN",
            "contrato_id": 3,
            "entidad_tipo": "solicitud",
            "entidad_id": str(aj["solicitud_id"]),
            "detalle": {"motivo": "Agrupar solicitudes por proveedor", "ejecucion_id": eid},
            "valor_anterior": aj["antes"],
            "valor_nuevo": aj["despues"],
            "created_at": "2026-10-09T20:00:01+00:00",
        })
    from almacen_agrupar import ejecutar_deshacer, vista_previa_deshacer

    previa = vista_previa_deshacer(3)
    assert previa["puede"] is True
    assert previa["lineas"] == len(hecho["movimientos"])
    lugares = {it["id"]: (it["solicitud_id"], it["numero_linea"]) for it in db["almacen_solicitud_item"]}
    deshecho = ejecutar_deshacer(3, 7, confirmar=True)
    assert deshecho["deshecho"] is True
    assert len(db["almacen_solicitud_item"]) == antes
    restaurados = {it["id"]: (it["solicitud_id"], it["numero_linea"]) for it in db["almacen_solicitud_item"]}
    for mov in hecho["movimientos"]:
        assert restaurados[mov["item_id"]] == (mov["antes"]["solicitud_id"], mov["antes"]["numero_linea"])
        assert lugares[mov["item_id"]] == (mov["despues"]["solicitud_id"], mov["despues"]["numero_linea"])
    with pytest.raises(ValueError) as exc:
        ejecutar_deshacer(3, 7, confirmar=True)
    assert "No se deshace" in str(exc.value) or "cambió" in str(exc.value)

    db["almacen_orden_compra"].append({"id": 1, "contrato_id": 3, "solicitud_id": 5})
    # Reagrupar no debe mover la solicitud con OC; el deshacer anterior ya devolvió las líneas.
    otra = vista_previa_agrupacion(3, ver_economicos=False)
    assert all(g["solicitud_id"] != 5 for g in otra["grupos"] if not g["crear"])

    path = "/opt/cursor/artifacts/agrupar_tiempos.txt"
    with open(path, "a", encoding="utf-8") as fh:
        viejas_aplicar = 4 + (2 * int(hecho["se_mueven"])) + (3 * 8)
        fh.write(
            f"caso_34_lineas vista_previa_ms={ms_prev} aplicar_ms={ms_apply} "
            f"selects_item_preview={len(selects_item)} lineas={antes} "
            f"consultas_aplicar={consultas_aplicar} "
            f"consultas_aplicar_antes_reconstruidas={viejas_aplicar} "
            f"se_mueven={hecho['se_mueven']}\n"
        )


def time_ms(fn):
    import time as _time
    t0 = _time.perf_counter()
    valor = fn()
    return valor, round((_time.perf_counter() - t0) * 1000, 2)


def test_vista_previa_sigue_corta_con_cientos_de_solicitudes(monkeypatch):
    sols = []
    items = []
    insumos = []
    proveedores = [{"id": 1, "razon_social": "Canteras"}, {"id": 2, "razon_social": "Aceros"}]
    for i in range(1, 401):
        sols.append({**_sol(i, i, "enviada", f"Solicitud #{i}"), "contrato_id": 3})
        pid = 1 if i % 2 else 2
        items.append({
            "id": i,
            "solicitud_id": i,
            "numero_linea": 1,
            "insumo_id": 1000 + (i % 2),
            "estado_validacion": "pendiente",
            "proveedor_seleccionado_id": None,
            "proveedor_seleccionado_nombre": "",
            "cantidad": 1,
            "valor_compra_unitario": 3,
        })
    insumos = [
        {"id": 1000, "proveedor_id": 1},
        {"id": 1001, "proveedor_id": 2},
    ]
    db = {
        "_seq": 5000,
        "almacen_solicitud": sols,
        "almacen_solicitud_item": items,
        "almacen_insumo": insumos,
        "almacen_proveedor": proveedores,
        "almacen_orden_compra": [],
        "almacen_agrupacion_bloqueo": [],
    }
    log = []
    monkeypatch.setattr("almacen_service._sb", lambda: _sb_de(db, log))
    from almacen_agrupar import vista_previa_agrupacion

    vista, ms = time_ms(lambda: vista_previa_agrupacion(3, ver_economicos=True))
    assert vista["lineas_total"] == 400
    assert ms < 2000, ms
    selects = [x for x in log if x[0] == "select"]
    # Cabezas, líneas (en trozos de 120), OC, insumos y proveedores. No una consulta por línea.
    assert len(selects) < 20, len(selects)
    assert sum(1 for x in selects if x[1] == "almacen_solicitud_item") <= 4
    with open("/opt/cursor/artifacts/agrupar_tiempos.txt", "a", encoding="utf-8") as fh:
        fh.write(f"caso_400_solicitudes vista_previa_ms={ms} selects={len(selects)}\n")


def test_deshacer_se_bloquea_si_hay_oc(monkeypatch):
    db = {
        "_seq": 20,
        "almacen_solicitud": [
            {**_sol(1, 1), "contrato_id": 3},
            {**_sol(2, 2), "contrato_id": 3},
        ],
        "almacen_solicitud_item": [
            {**_lin(1, 2, insumo=10, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 4},
        ],
        "almacen_orden_compra": [{"id": 9, "contrato_id": 3, "solicitud_id": 2}],
        "almacen_agrupacion_bloqueo": [],
        "logs": [{
            "id": 1,
            "accion": "AGRUPAR",
            "modulo": "ALMACEN",
            "contrato_id": 3,
            "entidad_tipo": "solicitud_item",
            "entidad_id": "1",
            "detalle": {"ejecucion_id": "abc", "motivo": "Agrupar solicitudes por proveedor"},
            "valor_anterior": {"solicitud_id": 1, "numero_linea": 1, "titulo": "Solicitud #1", "estado": "enviada"},
            "valor_nuevo": {"solicitud_id": 2, "numero_linea": 4, "titulo": "Solicitud #2", "estado": "aprobada"},
            "created_at": "2026-10-09T20:00:00+00:00",
        }],
    }
    monkeypatch.setattr("almacen_service._sb", lambda: _sb_de(db, []))
    from almacen_agrupar import vista_previa_deshacer

    previa = vista_previa_deshacer(3)
    assert previa["puede"] is False
    assert "orden de compra" in previa["resumen"].lower()
    assert db["almacen_solicitud_item"][0]["solicitud_id"] == 2


def test_mensaje_de_agrupar_no_repite_la_base():
    bruto = RuntimeError('duplicate key value violates unique constraint "idx_almacen_solicitud_item_linea"')
    texto = mensaje_error_agrupar(bruto)
    assert "idx_" not in texto
    assert "duplicate" not in texto.lower()
    movs = [
        {"item_id": 1, "antes": {}, "despues": {"solicitud_id": 9}},
        {"item_id": 2, "antes": {}, "despues": {"solicitud_id": 9}},
    ]
    items = [
        {"id": 1, "solicitud_id": 9, "numero_linea": 1},
        {"id": 2, "solicitud_id": 4, "numero_linea": 1},
        {"id": 3, "solicitud_id": 9, "numero_linea": 2},
    ]
    asignar_numeros_destino(items, movs)
    assert movs[0]["despues"]["numero_linea"] == 3
    assert movs[1]["despues"]["numero_linea"] == 4
    otro = RuntimeError("null value in column presupuesto_id violates not-null constraint")
    aviso = mensaje_error_agrupar(otro)
    assert "No quedó ningún movimiento" in aviso
    assert "Motivo:" in aviso
    assert "presupuesto_id" in aviso


def test_mover_aparta_el_numero_antes_de_ocupar_el_destino():
    db = {
        "almacen_solicitud_item": [
            {"id": 1, "solicitud_id": 5, "numero_linea": 1},
            {"id": 2, "solicitud_id": 5, "numero_linea": 2},
        ],
    }
    log = []

    class SB:
        def rpc(self, _name, _params):
            class R:
                def execute(_self):
                    raise RuntimeError(
                        'duplicate key value violates unique constraint "idx_almacen_solicitud_item_linea"'
                    )
            return R()

        def table(self, name):
            q = _Mem(db, log)
            q.table = name
            original = q.execute

            def execute():
                result = original()
                vistos = {}
                for row in db["almacen_solicitud_item"]:
                    clave = (row.get("solicitud_id"), row.get("numero_linea"))
                    if clave in vistos:
                        raise RuntimeError("duplicate key")
                    vistos[clave] = row["id"]
                return result

            q.execute = execute
            return q

    from almacen_agrupar import _mover_lineas_bloque

    _mover_lineas_bloque(SB(), [
        {"item_id": 1, "solicitud_id": 8, "numero_linea": 1},
        {"item_id": 2, "solicitud_id": 8, "numero_linea": 2},
    ])
    por_id = {row["id"]: row for row in db["almacen_solicitud_item"]}
    assert (por_id[1]["solicitud_id"], por_id[1]["numero_linea"]) == (8, 1)
    assert (por_id[2]["solicitud_id"], por_id[2]["numero_linea"]) == (8, 2)
    assert any(
        x[0] == "update" and (x[2] or {}).get("numero_linea", 0) >= 1_500_000_000
        for x in log
    )


def test_oc_con_otro_contrato_no_recibe_lineas(monkeypatch):
    db = {
        "_seq": 50,
        "almacen_solicitud": [
            {**_sol(1, 1), "contrato_id": 3},
            {**_sol(2, 2), "contrato_id": 3},
        ],
        "almacen_solicitud_item": [
            {**_lin(1, 1, insumo=10, ev="pendiente", pid=5, nombre="Aceros"), "numero_linea": 1},
            {**_lin(2, 2, insumo=11, ev="pendiente", pid=5, nombre="Aceros"), "numero_linea": 1},
        ],
        "almacen_orden_compra": [{"id": 9, "contrato_id": 99, "solicitud_id": 2}],
        "almacen_agrupacion_bloqueo": [],
    }
    monkeypatch.setattr("almacen_service._sb", lambda: _sb_de(db, []))
    from almacen_agrupar import vista_previa_agrupacion

    vista = vista_previa_agrupacion(3)
    assert vista["congeladas"] == 1
    assert db["almacen_solicitud_item"][0]["solicitud_id"] == 1
    assert db["almacen_solicitud_item"][1]["solicitud_id"] == 2
    assert all(g.get("consecutivo") != 2 or g.get("se_mueven") == 0 for g in vista["grupos"])


def test_linea_comprada_no_se_agrupa_aunque_la_oc_no_traiga_la_solicitud(monkeypatch):
    db = {
        "_seq": 50,
        "almacen_solicitud": [
            {**_sol(1, 1), "contrato_id": 3},
            {**_sol(2, 2), "contrato_id": 3},
        ],
        "almacen_solicitud_item": [
            {**_lin(1, 1, insumo=10, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
            {**_lin(2, 1, insumo=11, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 2},
            {**_lin(3, 2, insumo=12, ev="aprobado", pid=5, nombre="Aceros"), "numero_linea": 1},
        ],
        "almacen_orden_compra": [],
        "almacen_orden_compra_item": [
            {"id": 1, "orden_compra_id": 9, "solicitud_item_id": 1},
        ],
        "almacen_agrupacion_bloqueo": [],
    }
    monkeypatch.setattr("almacen_service._sb", lambda: _sb_de(db, []))
    from almacen_agrupar import vista_previa_agrupacion

    vista = vista_previa_agrupacion(3)
    assert vista["congeladas"] == 0

    def ids_de(g):
        return [d["item_id"] for d in g.get("lineas_detalle") or []]

    assert all(1 not in ids_de(g) for g in vista["grupos"])
    assert all(g.get("solicitud_id") != 1 for g in vista["grupos"])
    destino = next(g for g in vista["grupos"] if 3 in ids_de(g))
    assert ids_de(destino) == [2, 3]
    assert destino["solicitud_id"] == 2
    assert destino["estado"] == "aprobada"
