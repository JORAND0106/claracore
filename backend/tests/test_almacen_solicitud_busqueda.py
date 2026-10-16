"""Búsqueda de solicitudes: todas las palabras, sin tildes, y dónde coincidió."""

from __future__ import annotations

from almacen_solicitud_busqueda import (
    coincidencias_solicitudes,
    evaluar_busqueda,
    tokens_busqueda,
)


class _Resp:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, table, store):
        self.table = table
        self.store = store
        self.filters = []

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, set(vals)))
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        rows = []
        for raw in self.store.get(self.table, []):
            ok = True
            for op, col, val in self.filters:
                cur = raw.get(col)
                if op == "eq" and cur != val:
                    ok = False
                elif op == "in" and cur not in val:
                    ok = False
            if ok:
                rows.append(raw)
        return _Resp(rows)


class _Sb:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _Q(name, self.store)


def _store():
    return {
        "almacen_solicitud": [
            {
                "id": 1,
                "contrato_id": 9,
                "consecutivo": 17,
                "titulo": "Solicitud #17 - 13/07/2026 - Aceros del Norte - Enviada",
                "estado": "enviada",
                "created_at": "2026-07-13T15:00:00+00:00",
                "created_by": 7,
                "validada_by": None,
            },
            {
                "id": 2,
                "contrato_id": 9,
                "consecutivo": 18,
                "titulo": "Solicitud #18 - 14/07/2026 - Sin proveedor - Borrador",
                "estado": "borrador",
                "created_at": "2026-07-14T15:00:00+00:00",
                "created_by": 8,
                "validada_by": 3,
            },
            {
                "id": 3,
                "contrato_id": 4,
                "consecutivo": 1,
                "titulo": "Solicitud #1 - 01/01/2026 - Otro contrato - Borrador",
                "estado": "borrador",
                "created_at": "2026-01-01T15:00:00+00:00",
                "created_by": 7,
            },
        ],
        "almacen_solicitud_item": [
            {
                "id": 10,
                "solicitud_id": 1,
                "capitulo": "Redes",
                "item": "3.2",
                "material_descripcion": "TUBERÍA PVC 6\"",
                "descripcion_solicitada": "tubo de presion",
                "observacion_residente": "justificación de sobrecosto",
                "justificacion_autor_nombre": "Rosa Díaz",
                "proveedor_seleccionado_nombre": "Aceros del Norte",
                "tramo": "Tramo Norte",
                "pk_id": "PK-120",
                "insumo_id": 50,
            },
            {
                "id": 11,
                "solicitud_id": 2,
                "capitulo": "Obras",
                "item": "1.1",
                "material_descripcion": "Cemento gris",
                "insumo_id": 51,
                "tramo": "Tramo Sur",
                "pk_id": "PK-9",
            },
        ],
        "almacen_insumo": [
            {"id": 50, "codigo": "TB-06", "descripcion": "Tubería sanitaria"},
            {"id": 51, "codigo": "CM-01", "descripcion": "Cemento uso general"},
        ],
        "almacen_solicitud_mensaje": [
            {
                "id": 70,
                "solicitud_id": 2,
                "texto": "Asunto urgente\n\nFalta el plano de la acometida",
                "remitente_nombre": "Luis Mora",
            },
        ],
        "almacen_solicitud_mensaje_destinatario": [
            {"solicitud_id": 2, "destinatario_nombre": "Elena Ruiz"},
        ],
        "usuarios": [
            {"id": 7, "nombre": "Ana", "apellidos": "Pérez"},
            {"id": 8, "nombre": "Carlos", "apellidos": "López"},
            {"id": 3, "nombre": "Marta", "apellidos": "Gómez"},
        ],
        "logs": [
            {
                "entidad_id": 2,
                "usuario_nombre": "Pedro Envío",
                "accion": "ENVIAR",
                "modulo": "ALMACEN",
                "entidad_tipo": "solicitud",
            },
        ],
    }


def _donde(q):
    hits = coincidencias_solicitudes(_Sb(_store()), 9, tokens_busqueda(q))
    return {h["solicitud"]["id"]: h["donde"] for h in hits}


def test_tokens_ignoran_tildes_y_orden():
    assert tokens_busqueda("  Tubería   PVC ") == ["tuberia", "pvc"]
    assert tokens_busqueda("") == []
    assert tokens_busqueda("   ") == []


def test_tuberia_encuentra_tilde_en_linea_y_excluye_el_resto():
    donde = _donde("tuberia")
    assert list(donde) == [1]
    assert donde[1] == "coincide en una línea"


def test_varias_palabras_en_cualquier_orden():
    assert 1 in _donde("pvc tuberia")
    assert _donde("pvc cemento") == {}


def test_nombre_no_anuncia_donde():
    donde = _donde("aceros")
    assert donde == {1: ""}
    assert _donde("17") == {1: ""}
    assert _donde("13/07/2026") == {1: ""}
    assert _donde("enviada") == {1: ""}
    assert _donde("borrador") == {2: ""}


def test_codigo_justificacion_y_tilde_en_persona():
    assert _donde("tb-06") == {1: "coincide en una línea"}
    assert _donde("sobrecosto") == {1: "coincide en una línea"}
    assert _donde("diaz") == {1: "coincide en una persona"}


def test_mas_reciente_primero():
    hits = coincidencias_solicitudes(_Sb(_store()), 9, tokens_busqueda("tramo"))
    assert [h["solicitud"]["id"] for h in hits] == [2, 1]
    assert hits[0]["donde"] == "coincide en el tramo"


def test_mensaje_tramo_pk_y_persona():
    assert _donde("acometida") == {2: "coincide en un mensaje"}
    assert _donde("tramo sur") == {2: "coincide en el tramo"}
    assert _donde("pk-9") == {2: "coincide en el PK-ID"}
    assert _donde("elena") == {2: "coincide en una persona"}
    assert _donde("pedro") == {2: "coincide en una persona"}
    assert _donde("rosa") == {1: "coincide en una persona"}


def test_persona_visible_no_pide_pista():
    assert _donde("ana") == {1: ""}
    assert _donde("marta") == {2: ""}


def test_linea_y_mensaje_a_la_vez():
    frase = evaluar_busqueda(
        {
            "nombre": "solicitud 4",
            "linea": "TUBERÍA",
            "mensaje": "falta el plano",
            "persona": "",
            "persona_visible": "",
            "tramo": "",
            "pk": "",
        },
        ["tuberia", "plano"],
    )
    assert frase == "coincide en una línea y en un mensaje"


def test_otro_contrato_no_entra():
    assert _donde("otro contrato") == {}


def test_pagina_adjunta_donde_y_total(monkeypatch):
    import almacen_service as svc

    hits = [
        {"solicitud": {"id": 3, "titulo": "A", "created_at": "2026-02-01", "estado": "borrador"}, "donde": "coincide en una línea"},
        {"solicitud": {"id": 4, "titulo": "B", "created_at": "2026-02-02", "estado": "borrador"}, "donde": ""},
    ]
    monkeypatch.setattr(
        "almacen_solicitud_busqueda.coincidencias_solicitudes",
        lambda *a, **k: hits,
    )
    monkeypatch.setattr(svc, "_sb", lambda: object())
    monkeypatch.setattr(
        svc,
        "_list_solicitudes_resumen",
        lambda sb, rows, cid, ver_economicos=False: [dict(r) for r in rows],
    )
    page = svc.list_solicitudes_pagina(9, q="tuberia", limit=1, offset=1)
    assert page["total"] == 2
    assert [it["id"] for it in page["items"]] == [4]
    assert page["items"][0]["busqueda_donde"] == ""
    assert "observaciones" not in page["items"][0]


def test_sin_texto_delega_el_listado(monkeypatch):
    import almacen_service as svc

    monkeypatch.setattr(svc, "list_solicitudes", lambda *a, **k: [{"id": 1}])
    monkeypatch.setattr(svc, "count_solicitudes", lambda *a, **k: 4)
    page = svc.list_solicitudes_pagina(9, q="   ")
    assert page == {"items": [{"id": 1}], "total": 4}
