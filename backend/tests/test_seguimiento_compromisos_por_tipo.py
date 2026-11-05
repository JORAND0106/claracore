"""Compromisos abiertos: filtro por tipo + visibilidad cronológica por consecutivo."""
from __future__ import annotations

from seguimiento_service import _acta_origen_es_anterior, compromisos_abiertos_contrato


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQ:
    def __init__(self, rows):
        self._rows = list(rows)

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self._rows = [r for r in self._rows if str(r.get(key)) == str(value)]
        return self

    def in_(self, key, values):
        vs = {str(v) for v in (values or [])}
        self._rows = [r for r in self._rows if str(r.get(key)) in vs]
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return _Resp(list(self._rows))


class _FakeSB:
    def __init__(self, items, actas):
        self._items = items
        self._actas = actas

    def table(self, name):
        if name == "seguimiento_item":
            return _FakeQ(self._items)
        if name == "seguimiento_acta":
            return _FakeQ(self._actas)
        return _FakeQ([])


ITEMS = [
    {
        "id": 1,
        "contrato_id": 10,
        "origen": "compromiso",
        "estado_gestion": "abierto",
        "acta_id": 100,
        "titulo": "Compromiso interna",
        "fecha_vencimiento": "2026-08-01",
    },
    {
        "id": 2,
        "contrato_id": 10,
        "origen": "compromiso",
        "estado_gestion": "abierto",
        "acta_id": 200,
        "titulo": "Compromiso externa",
        "fecha_vencimiento": "2026-08-02",
    },
    {
        "id": 3,
        "contrato_id": 10,
        "origen": "compromiso",
        "estado_gestion": "abierto",
        "acta_id": 101,
        "titulo": "Otro interna",
        "fecha_vencimiento": "2026-08-03",
    },
]

ACTAS = [
    {"id": 100, "consecutivo": 1, "fecha_reunion": "2026-07-01", "tipo_acta": "interna", "orden_del_dia": "[]"},
    {"id": 200, "consecutivo": 2, "fecha_reunion": "2026-07-02", "tipo_acta": "externa", "orden_del_dia": "[]"},
    {"id": 101, "consecutivo": 3, "fecha_reunion": "2026-07-03", "tipo_acta": "interna", "orden_del_dia": "[]"},
]


def test_compromisos_abiertos_filtra_por_tipo_interna():
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    assert [r["id"] for r in out] == [1, 3]
    assert all(r["acta_tipo"] == "interna" for r in out)


def test_compromisos_abiertos_filtra_por_tipo_externa():
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="externa")
    assert [r["id"] for r in out] == [2]
    assert out[0]["acta_tipo"] == "externa"
    assert out[0]["acta_numero"] == "Acta Nº 2"


def test_compromisos_abiertos_excluye_acta_actual_y_posteriores():
    """Al leer el acta 1 no deben aparecer compromisos creados en actas posteriores."""
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, excluir_acta_id=100, tipo_acta="interna")
    assert [r["id"] for r in out] == []


def test_compromisos_abiertos_solo_previos_al_acta_actual():
    """Compromiso del acta 1 es visible al leer el acta 3; el del 3 no (es el actual)."""
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, excluir_acta_id=101, tipo_acta="interna")
    assert [r["id"] for r in out] == [1]
    assert out[0]["acta_consecutivo"] == 1


def test_compromiso_de_acta_10_no_aparece_en_acta_9():
    """Caso reportado: compromiso creado en acta posterior no contamina actas anteriores."""
    items = [
        {
            "id": 90,
            "contrato_id": 10,
            "origen": "compromiso",
            "estado_gestion": "abierto",
            "acta_id": 109,
            "titulo": "De acta 9",
            "fecha_vencimiento": "2026-09-01",
        },
        {
            "id": 100,
            "contrato_id": 10,
            "origen": "compromiso",
            "estado_gestion": "abierto",
            "acta_id": 110,
            "titulo": "De acta 10",
            "fecha_vencimiento": "2026-09-02",
        },
    ]
    actas = [
        {"id": 109, "consecutivo": 9, "fecha_reunion": "2026-08-01", "tipo_acta": "interna", "orden_del_dia": "[]"},
        {"id": 110, "consecutivo": 10, "fecha_reunion": "2026-08-08", "tipo_acta": "interna", "orden_del_dia": "[]"},
    ]
    sb = _FakeSB(items, actas)
    en_9 = compromisos_abiertos_contrato(sb, 10, excluir_acta_id=109, tipo_acta="interna")
    assert [r["id"] for r in en_9] == []
    en_10 = compromisos_abiertos_contrato(sb, 10, excluir_acta_id=110, tipo_acta="interna")
    assert [r["id"] for r in en_10] == [90]
    en_11_nueva = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    assert [r["id"] for r in en_11_nueva] == [90, 100]


def test_compromisos_abiertos_legacy_sin_tipo_es_interna():
    actas = [
        {"id": 100, "consecutivo": 1, "fecha_reunion": "2026-07-01", "orden_del_dia": "[]"},
        {"id": 200, "consecutivo": 2, "fecha_reunion": "2026-07-02", "tipo_acta": "externa", "orden_del_dia": "[]"},
    ]
    sb = _FakeSB(ITEMS[:2], actas)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    assert [r["id"] for r in out] == [1]


def test_compromisos_abiertos_incluye_cumplido_si_no_archivado():
    """Regresión: estado_gestion=cumplido es informativo y no debe ocultar por sí solo."""
    items = ITEMS + [
        {
            "id": 4,
            "contrato_id": 10,
            "origen": "compromiso",
            "estado_gestion": "cumplido",
            "acta_id": 100,
            "titulo": "Cumplido sin archivar",
            "fecha_vencimiento": "2026-08-04",
            "campos_libres": {},
        },
        {
            "id": 5,
            "contrato_id": 10,
            "origen": "compromiso",
            "estado_gestion": "cumplido",
            "acta_id": 101,
            "titulo": "Archivado con botón",
            "fecha_vencimiento": "2026-08-05",
            "campos_libres": {"archivado_revision": True},
        },
    ]
    sb = _FakeSB(items, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    ids = [r["id"] for r in out]
    assert 4 in ids
    assert 5 not in ids
    assert 1 in ids


def test_acta_origen_es_anterior_por_consecutivo_y_fecha():
    assert _acta_origen_es_anterior(
        {"consecutivo": 9, "fecha_reunion": "2026-08-01"},
        ref_consecutivo=10,
        ref_fecha="2026-08-08",
    )
    assert not _acta_origen_es_anterior(
        {"consecutivo": 10, "fecha_reunion": "2026-08-08"},
        ref_consecutivo=9,
        ref_fecha="2026-08-01",
    )
    assert _acta_origen_es_anterior(
        {"fecha_reunion": "2026-07-01"},
        ref_consecutivo=None,
        ref_fecha="2026-08-01",
    )


def test_plan_sin_acta_excluido_sin_permiso_plan():
    """Sin incluir_plan_pendientes, plan sin acta_id no aparece (actas sin Plan)."""
    items = ITEMS + [
        {
            "id": 50,
            "contrato_id": 10,
            "origen": "plan_actividad",
            "estado_gestion": "abierto",
            "acta_id": None,
            "titulo": "Plan suelto",
            "asignado_a_id": 7,
            "fecha_vencimiento": "2026-08-10",
            "campos_libres": {
                "plan": {"grupo_nombre": "Obra", "prioridad": 3, "fecha_inicio": "2026-08-01", "fecha_fin": "2026-08-10"},
                "asignaciones": [{"usuario_id": 7, "nombre": "Ana"}],
            },
        },
    ]
    sb = _FakeSB(items, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    assert all(r["id"] != 50 for r in out)


def test_plan_sin_acta_incluido_para_convocado_con_flag():
    items = ITEMS + [
        {
            "id": 50,
            "contrato_id": 10,
            "origen": "plan_actividad",
            "estado_gestion": "abierto",
            "acta_id": None,
            "titulo": "Plan suelto",
            "asignado_a_id": 7,
            "fecha_vencimiento": "2026-08-10",
            "campos_libres": {
                "plan": {
                    "grupo_nombre": "Obra",
                    "prioridad": 3,
                    "fecha_inicio": "2026-08-01",
                    "fecha_fin": "2026-08-10",
                },
                "asignaciones": [{"usuario_id": 7, "nombre": "Ana"}],
            },
        },
        {
            "id": 51,
            "contrato_id": 10,
            "origen": "plan_actividad",
            "estado_gestion": "abierto",
            "acta_id": None,
            "titulo": "Plan de otro",
            "asignado_a_id": 99,
            "fecha_vencimiento": "2026-08-11",
            "campos_libres": {
                "plan": {"grupo_nombre": "Calidad", "prioridad": 2},
                "asignaciones": [{"usuario_id": 99, "nombre": "Otro"}],
            },
        },
    ]
    sb = _FakeSB(items, ACTAS)
    out = compromisos_abiertos_contrato(
        sb,
        10,
        tipo_acta="interna",
        incluir_plan_pendientes=True,
        convocado_ids=[7],
    )
    ids = [r["id"] for r in out]
    assert 50 in ids
    assert 51 not in ids
    plan = next(r for r in out if r["id"] == 50)
    assert plan["grupo_nombre"] == "Obra"
    assert plan["acta_numero"] == "Plan de actividades"
    assert plan.get("es_plan_actividad") is True


def test_plan_vinculado_a_acta_previa_sigue_apareciendo():
    items = ITEMS + [
        {
            "id": 60,
            "contrato_id": 10,
            "origen": "plan_actividad",
            "estado_gestion": "abierto",
            "acta_id": 100,
            "titulo": "Plan desde acta 1",
            "fecha_vencimiento": "2026-08-12",
            "campos_libres": {"plan": {"grupo_nombre": "Obra", "prioridad": 4}},
        },
    ]
    sb = _FakeSB(items, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, excluir_acta_id=101, tipo_acta="interna")
    ids = [r["id"] for r in out]
    assert 1 in ids
    assert 60 in ids
    plan = next(r for r in out if r["id"] == 60)
    assert plan["grupo_nombre"] == "Obra"
