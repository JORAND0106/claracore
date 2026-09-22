"""Bitácora — exclusión de ROL/cargo Administrativo del catálogo y picker."""
from __future__ import annotations

from types import SimpleNamespace

from bitacora_service import (
    es_etiqueta_administrativo_excluida,
    list_rrhh_trabajadores_para_bitacora,
)


def test_es_etiqueta_administrativo_excluida_exacta():
    assert es_etiqueta_administrativo_excluida("Administrativo") is True
    assert es_etiqueta_administrativo_excluida("  administrativo ") is True
    assert es_etiqueta_administrativo_excluida("Administrativo") is True
    assert es_etiqueta_administrativo_excluida("Residente Administrativo") is False
    assert es_etiqueta_administrativo_excluida("Oficial") is False
    assert es_etiqueta_administrativo_excluida("") is False


class _FakeQuery:
    def __init__(self, table: str, store: dict):
        self._table = table
        self._store = store
        self._filters = []
        self._in_ids = None
        self._cols = "*"

    def select(self, cols):
        self._cols = cols
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


def test_list_trabajadores_excluye_cargo_y_rol_administrativo(monkeypatch):
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
            "apellidos": "AdminCargo",
            "cargo_aspira": "Administrativo",
            "email": "beth@obra.co",
            "numero_documento": "2",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
        {
            "id": 3,
            "nombres": "Carla",
            "apellidos": "RolAdmin",
            "cargo_aspira": "Residente",
            "email": "carla.admin@obra.co",
            "numero_documento": "3",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
        {
            "id": 4,
            "nombres": "Diego",
            "apellidos": "ResidenteAdm",
            "cargo_aspira": "Residente Administrativo",
            "email": "diego@obra.co",
            "numero_documento": "4",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "Consorcio",
        },
    ]

    store = {
        "roles": [
            {"id": 10, "nombre": "Contratista"},
            {"id": 20, "nombre": "Administrativo"},
        ],
        "usuario_contratos": [
            {"usuario_id": 100},
            {"usuario_id": 200},
        ],
        "usuarios": [
            {"id": 100, "email": "ana@obra.co", "rol_id": 10, "contrato_id": 7},
            {"id": 200, "email": "carla.admin@obra.co", "rol_id": 20, "contrato_id": 7},
        ],
    }

    import rrhh_service as rrhh_mod

    monkeypatch.setattr(
        rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabajadores,
    )

    out = list_rrhh_trabajadores_para_bitacora(
        _FakeSb(store), 7, solo_aprobados=False,
    )
    ids = [r["id"] for r in out]
    assert ids == [1, 4]
    assert all(r["id"] != 2 for r in out)  # cargo_aspira Administrativo
    assert all(r["id"] != 3 for r in out)  # email con rol plataforma Administrativo
    assert any(r["cargo_aspira"] == "Residente Administrativo" for r in out)


def test_list_trabajadores_sin_rol_admin_en_plataforma_no_filtra_por_email(monkeypatch):
    trabajadores = [
        {
            "id": 1,
            "nombres": "Eva",
            "apellidos": "Obra",
            "cargo_aspira": "Ayudante",
            "email": "eva@obra.co",
            "numero_documento": "9",
            "doc_validacion_estado": "aprobado",
            "estado": "activo",
            "empresa_nombre": "X",
        },
    ]
    store = {
        "roles": [{"id": 1, "nombre": "Contratista"}],
        "usuario_contratos": [{"usuario_id": 1}],
        "usuarios": [
            {"id": 1, "email": "eva@obra.co", "rol_id": 1, "contrato_id": 3},
        ],
    }
    import rrhh_service as rrhh_mod

    monkeypatch.setattr(
        rrhh_mod, "list_trabajadores", lambda *_a, **_k: trabajadores,
    )
    out = list_rrhh_trabajadores_para_bitacora(
        _FakeSb(store), 3, solo_aprobados=False,
    )
    assert [r["id"] for r in out] == [1]
