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
        dest["estado"] = g["estado"]
        dest["titulo"] = format_titulo_grupo(
            dest["consecutivo"], dest["created_at"], g["proveedor"], g["estado"],
        )
    for vac in plan["vacias"]:
        dest = por[int(vac["solicitud_id"])]
        dest["estado"] = "borrador"
        dest["titulo"] = vac["titulo"]
    return planificar_agrupacion(sols, items, oc)


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
    assert set(por_clave) == {"aprobada:id:5", "pendiente:id:6", "sin_insumo", "rechazadas"}
    assert por_clave["aprobada:id:5"]["item_ids"] == [1, 5]
    assert por_clave["aprobada:id:5"]["estado"] == "aprobada"
    assert por_clave["pendiente:id:6"]["estado"] == "enviada"
    assert por_clave["sin_insumo"]["proveedor"] == "Sin proveedor"
    assert por_clave["rechazadas"]["item_ids"] == [4]
    assert 4 not in por_clave["aprobada:id:5"]["item_ids"]
    assert plan["por_crear"] == 0


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
    assert any(t.endswith("Rechazadas - Rechazada") for t in titulos)
    por_item = {int(it["id"]): int(it["solicitud_id"]) for it in items}
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

    def upsert(self, payload, on_conflict=None):
        self.op = "upsert"
        self.payload = dict(payload)
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
            found = next((r for r in rows if r.get("contrato_id") == self.payload.get("contrato_id")), None)
            if found:
                found.update(self.payload)
            else:
                rows.append(dict(self.payload))
            self.log.append(("upsert", self.table))
            return _Resp([dict(self.payload)])
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
    assert db["almacen_solicitud"][0]["estado"] == "aprobada"
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
                if q.op == "update" and q.table == "almacen_solicitud_item" and q.payload and "numero_linea" in q.payload:
                    updates["n"] += 1
                    if updates["n"] == 2:
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
