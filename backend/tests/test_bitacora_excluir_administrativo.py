"""Bitácora — exclusión por ROL de plataforma Administrativo (v4)."""
from __future__ import annotations

from types import SimpleNamespace

from bitacora_service import (
    auditoria_exclusion_administrativo,
    cargos_exclusivos_rol_administrativo,
    enrich_asistencia_desde_rrhh,
    es_etiqueta_administrativo_excluida,
    ids_rrhh_excluidos_rol_administrativo,
    list_rrhh_cargos_para_bitacora,
    list_rrhh_trabajadores_para_bitacora,
    trabajador_tiene_rol_administrativo,
)


class _FakeQuery:
    def __init__(self, table: str, store: dict):
        self._table = table
        self._store = store
        self._filters = []
        self._in_ids = None

    def select(self, cols):
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self._in_ids = (col, list(vals))
        return self

    def execute(self):
        rows = list(self._store.get(self._table) or [])
        for kind, col, val in self._filters:
            if kind == "eq":
                rows = [r for r in rows if r.get(col) == val]
        if self._in_ids:
            col, vals = self._in_ids
            allowed = set(vals)
            rows = [r for r in rows if r.get(col) in allowed]
        return SimpleNamespace(data=rows)


class _FakeSb:
    def __init__(self, store: dict):
        self._store = store

    def table(self, name: str):
        return _FakeQuery(name, self._store)


_ROLES = {
    "roles": [
        {"id": 10, "nombre": "Contratista"},
        {"id": 20, "nombre": "Administrativo"},
    ],
}


def test_match_por_rol_nombre_sin_rol_id():
    """Fuente real: algunos entornos exponen rol_nombre aunque rol_id falle."""
    claves = {"emails": set(), "nombres": {"pedro admin"}}
    # Simula claves construidas desde usuario con solo rol_nombre
    assert trabajador_tiene_rol_administrativo(
        {"nombres": "Pedro", "apellidos": "Admin", "email": ""},
        {"emails": set(), "nombres": {"pedro admin", "admin pedro"}},
    )


def test_match_variante_orden_nombre():
    assert trabajador_tiene_rol_administrativo(
        {"nombres": "Carla", "apellidos": "Lopez Diaz", "email": ""},
        {"emails": set(), "nombres": {"lopez diaz carla"}},
    )


def test_list_trabajadores_y_cargos_escenario_reportado(monkeypatch):
    trabajadores = [
        {
            "id": 1, "nombres": "Ana", "apellidos": "Campo", "email": "ana@obra.co",
            "cargo_aspira": "Oficial", "doc_validacion_estado": "aprobado", "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
        {
            "id": 2, "nombres": "Beth", "apellidos": "Gerente", "email": "beth@obra.co",
            "cargo_aspira": "Gerente Administrativo", "doc_validacion_estado": "aprobado",
            "estado": "activo", "empresa_nombre": "Consorcio",
        },
        {
            "id": 3, "nombres": "Carla", "apellidos": "Lopez", "email": "",
            "cargo_aspira": "Director de Obra", "doc_validacion_estado": "aprobado",
            "estado": "activo", "empresa_nombre": "Consorcio",
        },
        {
            "id": 4, "nombres": "Diego", "apellidos": "Obra", "email": "diego@obra.co",
            "cargo_aspira": "Residente", "doc_validacion_estado": "aprobado",
            "estado": "activo", "empresa_nombre": "Consorcio",
        },
        {
            "id": 5, "nombres": "Eva", "apellidos": "Admin", "email": "eva@obra.co",
            "cargo_aspira": "Residente", "doc_validacion_estado": "aprobado",
            "estado": "activo", "empresa_nombre": "Consorcio",
        },
        {
            "id": 6, "nombres": "Fran", "apellidos": "Coord", "email": "fran@obra.co",
            "cargo_aspira": "Coordinador Administrativo", "doc_validacion_estado": "aprobado",
            "estado": "activo", "empresa_nombre": "Consorcio",
        },
        {
            "id": 7, "nombres": "Gaby", "apellidos": "Esp", "email": "gaby@obra.co",
            "cargo_aspira": "Especialista Administrativo", "doc_validacion_estado": "aprobado",
            "estado": "activo", "empresa_nombre": "Consorcio",
        },
    ]
    catalog = [
        {"valor": c} for c in [
            "Administrativo", "Coordinador Administrativo", "Director de Obra",
            "Gerente Administrativo", "Especialista Administrativo", "Residente",
            "Oficial", "Ayudante", "Cargo Solo Catalogo Admin",
        ]
    ]
    store = {
        **_ROLES,
        "usuario_contratos": [],
        "usuarios": [
            # rol_id Administrativo
            {"id": 200, "email": "beth@obra.co", "nombre": "Beth", "apellidos": "Gerente",
             "rol_id": 20, "rol_nombre": "Administrativo"},
            # sin email en trabajador → match por nombre; usuario con rol_nombre
            {"id": 201, "email": "carla.cuenta@x.co", "nombre": "Carla", "apellidos": "Lopez",
             "rol_id": None, "rol_nombre": "Administrativo"},
            {"id": 202, "email": "eva@obra.co", "nombre": "Eva", "apellidos": "Admin",
             "rol_id": 20},
            {"id": 203, "email": "fran@obra.co", "nombre": "Fran", "apellidos": "Coord",
             "rol_id": 20},
            {"id": 204, "email": "gaby@obra.co", "nombre": "Gaby", "apellidos": "Esp",
             "rol_id": 20},
            {"id": 100, "email": "diego@obra.co", "nombre": "Diego", "apellidos": "Obra",
             "rol_id": 10, "rol_nombre": "Contratista"},
            {"id": 101, "email": "ana@obra.co", "nombre": "Ana", "apellidos": "Campo",
             "rol_id": 10},
        ],
    }
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabajadores)
    monkeypatch.setattr(rrhh_mod, "list_catalogo", lambda *_a, **_k: catalog)

    sb = _FakeSb(store)
    out_t = list_rrhh_trabajadores_para_bitacora(sb, 1, solo_aprobados=False)
    ids = [r["id"] for r in out_t]
    assert ids == [1, 4], f"picker incluyó admin: {ids}"

    excluidos_ids = ids_rrhh_excluidos_rol_administrativo(sb, 1, trabajadores)
    assert set(excluidos_ids) == {2, 3, 5, 6, 7}

    out_c = list_rrhh_cargos_para_bitacora(sb, 1)
    for ban in (
        "Administrativo",
        "Coordinador Administrativo",
        "Director de Obra",
        "Gerente Administrativo",
        "Especialista Administrativo",
        "Cargo Solo Catalogo Admin",
    ):
        assert ban not in out_c, f"cargo admin/vacío sigue en consolidado: {ban}"
    assert "Oficial" in out_c
    assert "Residente" in out_c  # tiene Diego (obra)

    # Verificación exhaustiva uno a uno
    report = auditoria_exclusion_administrativo(sb, 1)
    assert report["ok"] is True
    assert report["violaciones"] == []
    for row in report["incluidos"]:
        assert row["id"] in (1, 4)
        assert row["match_admin"] is False
    for row in report["excluidos"]:
        assert row["id"] in (2, 3, 5, 6, 7)
        assert row["match_admin"] is True


def test_enrich_omite_trabajadores_rol_administrativo(monkeypatch):
    trabajadores = [
        {
            "id": 1, "nombres": "Ana", "apellidos": "Campo", "email": "ana@obra.co",
            "cargo_aspira": "Oficial", "estado": "activo", "empresa_nombre": "X",
            "tipo_documento": "CC", "numero_documento": "1",
            "doc_validacion_estado": "aprobado",
        },
        {
            "id": 2, "nombres": "Beth", "apellidos": "Admin", "email": "beth@obra.co",
            "cargo_aspira": "Gerente Administrativo", "estado": "activo",
            "empresa_nombre": "X", "tipo_documento": "CC", "numero_documento": "2",
            "doc_validacion_estado": "aprobado",
        },
    ]
    store = {
        **_ROLES,
        "usuario_contratos": [],
        "usuarios": [
            {"id": 1, "email": "ana@obra.co", "nombre": "Ana", "apellidos": "Campo", "rol_id": 10},
            {"id": 2, "email": "beth@obra.co", "nombre": "Beth", "apellidos": "Admin", "rol_id": 20},
        ],
    }
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabajadores)
    out = enrich_asistencia_desde_rrhh(
        _FakeSb(store),
        1,
        [
            {"rrhh_trabajador_id": 1, "nombre": "Ana", "hora_ingreso": "07:30"},
            {"rrhh_trabajador_id": 2, "nombre": "Beth", "hora_ingreso": "07:30"},
        ],
    )
    assert len(out) == 1
    assert out[0]["rrhh_trabajador_id"] == 1


def test_cargos_exclusivos_helper():
    claves = {"emails": {"a@x.co"}, "nombres": set()}
    excl = cargos_exclusivos_rol_administrativo(
        [
            {"cargo_aspira": "Gerente Administrativo", "email": "a@x.co"},
            {"cargo_aspira": "Oficial", "email": "o@x.co"},
        ],
        claves,
    )
    assert "gerente administrativo" in excl
    assert "oficial" not in excl
    assert not es_etiqueta_administrativo_excluida("Gerente Administrativo")
