"""Bitácora — exclusión por ROL de plataforma Administrativo (no por nombre de cargo)."""
from __future__ import annotations

from types import SimpleNamespace

from bitacora_service import (
    cargos_exclusivos_rol_administrativo,
    es_etiqueta_administrativo_excluida,
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


_ROLES_STORE = {
    "roles": [
        {"id": 10, "nombre": "Contratista"},
        {"id": 20, "nombre": "Administrativo"},
    ],
}


def test_es_etiqueta_administrativo_excluida_exacta():
    assert es_etiqueta_administrativo_excluida("Administrativo") is True
    assert es_etiqueta_administrativo_excluida("Gerente Administrativo") is False
    assert es_etiqueta_administrativo_excluida("Residente Administrativo") is False
    assert es_etiqueta_administrativo_excluida("Residente") is False


def test_trabajador_match_por_email_y_por_nombre():
    claves = {
        "emails": {"admin@obra.co"},
        "nombres": {"carla lopez"},
    }
    assert trabajador_tiene_rol_administrativo(
        {"email": "admin@obra.co", "nombres": "X", "apellidos": "Y"}, claves,
    )
    assert trabajador_tiene_rol_administrativo(
        {"email": "", "nombres": "Carla", "apellidos": "López"}, claves,
    )
    assert not trabajador_tiene_rol_administrativo(
        {"email": "obra@obra.co", "nombres": "Ana", "apellidos": "Campo"}, claves,
    )


def test_cargos_exclusivos_solo_si_todos_son_admin():
    claves = {"emails": {"g@x.co", "d@x.co", "r@x.co"}, "nombres": set()}
    trabajadores = [
        {"cargo_aspira": "Gerente Administrativo", "email": "g@x.co"},
        {"cargo_aspira": "Director de Obra", "email": "d@x.co"},
        {"cargo_aspira": "Residente", "email": "r@x.co"},
        {"cargo_aspira": "Residente", "email": "obra@x.co"},  # obra → Residente NO exclusivo
        {"cargo_aspira": "Oficial", "email": "of@x.co"},
        {"cargo_aspira": "Coordinador Administrativo", "email": "g@x.co"},
    ]
    excl = cargos_exclusivos_rol_administrativo(trabajadores, claves)
    assert "gerente administrativo" in excl
    assert "director de obra" in excl
    assert "coordinador administrativo" in excl
    assert "residente" not in excl  # tiene al menos un no-admin
    assert "oficial" not in excl


def test_list_trabajadores_excluye_rol_admin_por_email_y_nombre(monkeypatch):
    trabajadores = [
        {
            "id": 1,
            "nombres": "Ana",
            "apellidos": "Campo",
            "cargo_aspira": "Oficial",
            "email": "ana@obra.co",
            "numero_documento": "1",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
        {
            "id": 2,
            "nombres": "Beth",
            "apellidos": "Admin",
            "cargo_aspira": "Gerente Administrativo",
            "email": "beth@obra.co",
            "numero_documento": "2",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
        {
            "id": 3,
            "nombres": "Carla",
            "apellidos": "Lopez",
            "cargo_aspira": "Residente",
            "email": "",  # sin email → match por nombre
            "numero_documento": "3",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
        {
            "id": 4,
            "nombres": "Diego",
            "apellidos": "Obra",
            "cargo_aspira": "Residente Administrativo",
            "email": "diego@obra.co",
            "numero_documento": "4",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
    ]
    store = {
        **_ROLES_STORE,
        "usuario_contratos": [],
        "usuarios": [
            {
                "id": 200,
                "email": "beth@obra.co",
                "nombre": "Beth",
                "apellidos": "Admin",
                "rol_id": 20,
                "contrato_id": 7,
            },
            {
                "id": 201,
                "email": "carla.cuenta@obra.co",
                "nombre": "Carla",
                "apellidos": "Lopez",
                "rol_id": 20,
                # sin contrato_id / usuario_contratos → se encuentra por rol_id
            },
        ],
    }
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabajadores)

    out = list_rrhh_trabajadores_para_bitacora(_FakeSb(store), 7, solo_aprobados=False)
    ids = [r["id"] for r in out]
    assert ids == [1, 4]
    assert 2 not in ids and 3 not in ids


def test_list_cargos_excluye_solo_exclusivos_admin_no_por_nombre(monkeypatch):
    """
    Escenario real reportado: Gerente/Coordinador/Especialista Administrativo,
    Director de Obra y Residente (solo admin) salen del consolidado; Oficial
    y un Residente con personal de obra permanecen.
    """
    catalog = [
        {"valor": "Administrativo"},
        {"valor": "Coordinador Administrativo"},
        {"valor": "Director de Obra"},
        {"valor": "Gerente Administrativo"},
        {"valor": "Especialista Administrativo"},
        {"valor": "Residente"},
        {"valor": "Oficial"},
        {"valor": "Ayudante"},
    ]
    trabajadores = [
        {
            "id": 1, "nombres": "G", "apellidos": "A", "email": "g@x.co",
            "cargo_aspira": "Gerente Administrativo", "estado": "activo",
        },
        {
            "id": 2, "nombres": "C", "apellidos": "A", "email": "c@x.co",
            "cargo_aspira": "Coordinador Administrativo", "estado": "activo",
        },
        {
            "id": 3, "nombres": "D", "apellidos": "O", "email": "d@x.co",
            "cargo_aspira": "Director de Obra", "estado": "activo",
        },
        {
            "id": 4, "nombres": "E", "apellidos": "A", "email": "e@x.co",
            "cargo_aspira": "Especialista Administrativo", "estado": "activo",
        },
        {
            "id": 5, "nombres": "R", "apellidos": "Admin", "email": "ra@x.co",
            "cargo_aspira": "Residente", "estado": "activo",
        },
        {
            "id": 6, "nombres": "R", "apellidos": "Obra", "email": "ro@x.co",
            "cargo_aspira": "Residente", "estado": "activo",
        },
        {
            "id": 7, "nombres": "O", "apellidos": "F", "email": "of@x.co",
            "cargo_aspira": "Oficial", "estado": "activo",
        },
    ]
    store = {
        **_ROLES_STORE,
        "usuario_contratos": [{"usuario_id": i} for i in range(100, 105)],
        "usuarios": [
            {"id": 100, "email": "g@x.co", "nombre": "G", "apellidos": "A", "rol_id": 20, "contrato_id": 1},
            {"id": 101, "email": "c@x.co", "nombre": "C", "apellidos": "A", "rol_id": 20, "contrato_id": 1},
            {"id": 102, "email": "d@x.co", "nombre": "D", "apellidos": "O", "rol_id": 20, "contrato_id": 1},
            {"id": 103, "email": "e@x.co", "nombre": "E", "apellidos": "A", "rol_id": 20, "contrato_id": 1},
            {"id": 104, "email": "ra@x.co", "nombre": "R", "apellidos": "Admin", "rol_id": 20, "contrato_id": 1},
            {"id": 105, "email": "ro@x.co", "nombre": "R", "apellidos": "Obra", "rol_id": 10, "contrato_id": 1},
            {"id": 106, "email": "of@x.co", "nombre": "O", "apellidos": "F", "rol_id": 10, "contrato_id": 1},
        ],
    }
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(rrhh_mod, "list_catalogo", lambda *_a, **_k: catalog)
    monkeypatch.setattr(rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabajadores)

    out = list_rrhh_cargos_para_bitacora(_FakeSb(store), 1)

    # Cruzada: ninguno de los cargos restantes es exclusivo de rol Administrativo
    claves = {
        "emails": {"g@x.co", "c@x.co", "d@x.co", "e@x.co", "ra@x.co"},
        "nombres": set(),
    }
    excl = cargos_exclusivos_rol_administrativo(trabajadores, claves)
    assert not any(c.casefold() in excl for c in out)

    assert out == ["Ayudante", "Oficial", "Residente"]
    for ban in (
        "Administrativo",
        "Coordinador Administrativo",
        "Director de Obra",
        "Gerente Administrativo",
        "Especialista Administrativo",
    ):
        assert ban not in out
