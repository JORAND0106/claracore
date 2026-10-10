"""Proveedor elegido en la línea y cotizaciones del insumo."""
import almacen_service as svc


def test_ofertas_marcan_una_ganadora_y_el_precio_con_iva():
    row = {
        "cotizaciones_detalle": [
            {
                "tipo": "insumo",
                "proveedor": "Ferretería Norte",
                "proveedor_id": 4,
                "numero": "C-1",
                "valor": 100,
                "es_ganadora": True,
                "impuesto": {"iva": "19"},
            },
            {
                "tipo": "insumo",
                "proveedor": "Aceros del Sur",
                "proveedor_id": 5,
                "numero": "C-9",
                "valor": 80,
                "es_ganadora": False,
                "impuesto": {"iva": "19"},
            },
        ]
    }
    ofertas = svc.ofertas_proveedor_desde_row(row)
    assert len(ofertas) == 2
    gan = svc.oferta_ganadora(ofertas)
    assert gan["proveedor_id"] == 4
    assert gan["valor"] == 119
    otra = svc.elegir_oferta_proveedor(ofertas, proveedor_id=5)
    assert otra["numero"] == "C-9"
    assert otra["valor"] == 95


def test_sin_eleccion_usa_la_ganadora():
    ofertas = [
        {"proveedor_id": 1, "proveedor_nombre": "A", "numero": "1", "es_ganadora": False, "valor": 10},
        {"proveedor_id": 2, "proveedor_nombre": "B", "numero": "2", "es_ganadora": True, "valor": 20},
    ]
    assert svc.elegir_oferta_proveedor(ofertas)["proveedor_id"] == 2


def test_proveedor_de_item_prefiere_el_guardado_sobre_la_ganadora():
    cat = {10: {"proveedor_id": 5}}
    nombres = {5: "Ganadora SAS", 8: "Elegida SAS"}
    key, pid, nombre = svc._proveedor_de_item(
        {
            "insumo_id": 10,
            "es_recurrente": False,
            "proveedor_seleccionado_id": 8,
            "proveedor_seleccionado_nombre": "Elegida SAS",
        },
        cat,
        nombres,
    )
    assert key == "id:8"
    assert pid == 8
    assert nombre == "Elegida SAS"


def test_valor_linea_prioriza_proveedor_elegido_y_si_no_la_ganadora():
    ofertas = svc.ofertas_proveedor_desde_row({
        "cotizaciones_detalle": [
            {
                "tipo": "insumo",
                "proveedor": "Ferretería Norte",
                "proveedor_id": 4,
                "numero": "C-1",
                "valor": 100,
                "es_ganadora": True,
                "impuesto": {"iva": "19"},
            },
            {
                "tipo": "insumo",
                "proveedor": "Aceros del Sur",
                "proveedor_id": 5,
                "numero": "C-9",
                "valor": 80,
                "es_ganadora": False,
                "impuesto": {"iva": "19"},
            },
        ],
    })
    elegida = {"cantidad": 2, "proveedor_seleccionado_id": 5, "valor_compra_unitario": 119}
    assert svc.valor_linea_proveedor(elegida, ofertas) == 190
    sin_eleccion = {"cantidad": 3, "valor_compra_unitario": 1}
    assert svc.valor_linea_proveedor(sin_eleccion, ofertas) == 357


class _Resp:
    def __init__(self, data):
        self.data = data


class _Tabla:
    def __init__(self, db, nombre):
        self.db = db
        self.nombre = nombre
        self.ids = None
        self.payload = None
        self.op = "select"

    def select(self, *_a, **_k):
        return self

    def in_(self, _col, vals):
        self.ids = list(vals)
        return self

    def upsert(self, payload, on_conflict=None, **_k):
        self.op = "upsert"
        self.payload = payload
        self.on_conflict = on_conflict
        return self

    def execute(self):
        filas = self.db.setdefault(self.nombre, [])
        if self.op == "upsert":
            for payload in self.payload:
                fila = next(r for r in filas if r.get("id") == payload.get("id"))
                fila.update(payload)
            return _Resp(list(self.payload))
        if self.ids is None:
            return _Resp(list(filas))
        return _Resp([r for r in filas if r.get("id") in self.ids])


class _SB:
    def __init__(self, db):
        self.db = db

    def table(self, nombre):
        return _Tabla(self.db, nombre)


def test_completar_guarda_la_unica_o_la_ganadora_y_no_pisa():
    detalle = [
        {
            "tipo": "insumo",
            "proveedor": "Pancracio Pardo",
            "proveedor_id": 2,
            "numero": "C-1",
            "valor": 50,
            "es_ganadora": False,
        },
        {
            "tipo": "insumo",
            "proveedor": "Pepito Pérez",
            "proveedor_id": 1,
            "numero": "C-2",
            "valor": 80,
            "es_ganadora": True,
        },
    ]
    items = [
        {
            "id": 1,
            "insumo_id": 10,
            "proveedor_seleccionado_id": None,
            "proveedor_seleccionado_nombre": "",
            "valor_compra_unitario": 0,
        },
        {
            "id": 2,
            "insumo_id": 11,
            "proveedor_seleccionado_id": None,
            "proveedor_seleccionado_nombre": "",
            "valor_compra_unitario": 9,
        },
        {
            "id": 3,
            "insumo_id": 10,
            "proveedor_seleccionado_id": 8,
            "proveedor_seleccionado_nombre": "Ya elegido",
            "valor_compra_unitario": 4,
        },
        {
            "id": 4,
            "insumo_id": 12,
            "proveedor_seleccionado_id": None,
            "proveedor_seleccionado_nombre": "",
            "cotizacion_seleccionada_id": 70,
            "valor_compra_unitario": 1,
        },
    ]
    db = {
        "almacen_insumo": [
            {"id": 10, "cotizaciones_detalle": detalle, "proveedor_id": 2},
            {"id": 11, "proveedor_id": 2, "cotizacion_numero": "U-1", "costo_base": 30},
            {"id": 12, "proveedor_id": 1, "cotizacion_numero": "G-9", "costo_base": 99},
        ],
        "almacen_proveedor": [
            {"id": 1, "razon_social": "Pepito Pérez"},
            {"id": 2, "razon_social": "Pancracio Pardo"},
        ],
        "almacen_cotizacion": [
            {"id": 70, "proveedor_id": 9, "proveedor_nombre": "Elegida a mano", "observaciones": "M-1"},
        ],
        "almacen_solicitud_item": [dict(it) for it in items],
    }
    n = svc.completar_proveedor_guardado(_SB(db), items)
    assert n == 3
    assert items[0]["proveedor_seleccionado_id"] == 1
    assert items[0]["proveedor_seleccionado_nombre"] == "Pepito Pérez"
    assert items[0]["cotizacion_numero_seleccionada"] == "C-2"
    assert items[0]["valor_compra_unitario"] == 80
    assert items[1]["proveedor_seleccionado_id"] == 2
    assert items[1]["proveedor_seleccionado_nombre"] == "Pancracio Pardo"
    assert items[1]["valor_compra_unitario"] == 9
    assert items[2]["proveedor_seleccionado_id"] == 8
    assert items[2]["proveedor_seleccionado_nombre"] == "Ya elegido"
    assert items[3]["proveedor_seleccionado_id"] == 9
    assert items[3]["proveedor_seleccionado_nombre"] == "Elegida a mano"
    assert items[3]["cotizacion_numero_seleccionada"] == "M-1"
    guardadas = {r["id"]: r for r in db["almacen_solicitud_item"]}
    assert guardadas[1]["proveedor_seleccionado_id"] == 1
    assert guardadas[3]["proveedor_seleccionado_nombre"] == "Ya elegido"
    assert svc.completar_proveedor_guardado(_SB(db), items) == 0


def test_valor_compra_linea_usa_cantidad_por_oferta():
    it = {"cantidad": 3, "valor_compra_unitario": 119}
    svc._attach_valor_compra_linea(it)
    assert it["valor_compra_linea"] == 357
    svc._strip_economics_item(it)
    assert "valor_compra_linea" not in it
    assert "valor_compra_unitario" not in it
