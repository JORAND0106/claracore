"""Unit tests: permisos Topografía (crear/editar vs validar + lado)."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException


def _install_main_stub(*, es_dev=False, perms=None, usuario_row=None, funciones=None):
    """Stub mínimo de main para topografia_permissions."""
    main = types.ModuleType("main")
    main._es_desarrollador = lambda _u: bool(es_dev)
    main._permisos_rows_para_cargo = lambda _cargo_id, _contrato_id=None: list(perms or [])
    main.supabase_execute = lambda fn: fn()

    class _Table:
        def __init__(self, name):
            self.name = name
            self._eq = {}

        def select(self, *_a, **_k):
            return self

        def eq(self, k, v):
            self._eq[k] = v
            return self

        def in_(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self.name == "usuarios":
                data = [usuario_row] if usuario_row else []
                return types.SimpleNamespace(data=data)
            if self.name == "funciones":
                return types.SimpleNamespace(data=list(funciones or []))
            return types.SimpleNamespace(data=[])

    sb = MagicMock()
    sb.table = lambda name: _Table(name)
    main.supabase = sb
    sys.modules["main"] = main
    # Forzar reimport limpio del módulo bajo prueba.
    sys.modules.pop("topografia_permissions", None)
    import topografia_permissions as tp  # noqa: WPS433

    return tp


@pytest.fixture(autouse=True)
def _clean_modules():
    yield
    sys.modules.pop("topografia_permissions", None)


def test_desarrollador_tiene_todas_las_acciones():
    tp = _install_main_stub(es_dev=True, perms=[], usuario_row={"cargo_id": 1})
    user = {"sub": "1"}
    for accion in ("ver", "crear", "editar", "validar", "exportar", "eliminar"):
        assert tp.tiene_permiso_topografia(user, accion, 10) is True
    assert tp.lado_validacion_topo_usuario(user, 10) == 0


def test_crear_exige_flag_crear_en_matriz_topografia():
    tp = _install_main_stub(
        perms=[{"funcion_id": 7, "crear": True, "editar": False, "validar": False}],
        usuario_row={"cargo_id": 2, "id": 9},
        funciones=[{"id": 7, "nombre": "Topografía"}],
    )
    user = {"sub": "9"}
    assert tp.tiene_permiso_topografia(user, "crear", 10) is True
    assert tp.tiene_permiso_topografia(user, "editar", 10) is False
    assert tp.tiene_permiso_topografia(user, "validar", 10) is False


def test_sin_permiso_matriz_deniega():
    tp = _install_main_stub(
        perms=[{"funcion_id": 7, "ver": True}],
        usuario_row={"cargo_id": 2, "id": 9},
        funciones=[{"id": 7, "nombre": "Topografía"}],
    )
    user = {"sub": "9"}
    assert tp.tiene_permiso_topografia(user, "crear", 10) is False
    with pytest.raises(HTTPException) as ei:
        tp.require_permiso_topografia(user, "crear", 10)
    assert ei.value.status_code == 403


def test_lado_contratista_con_validar():
    tp = _install_main_stub(
        perms=[{"funcion_id": 7, "validar": True}],
        usuario_row={
            "id": 3,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Contratista"},
            "cargos": {"nombre": "Topógrafo"},
        },
        funciones=[{"id": 7, "nombre": "Topografía"}],
    )
    user = {"sub": "3"}
    assert tp.lado_validacion_topo_usuario(user, 10) == 1
    tp.require_topo_puede_validar_nivel(user, 1, 10)
    with pytest.raises(HTTPException) as ei:
        tp.require_topo_puede_validar_nivel(user, 2, 10)
    assert ei.value.status_code == 403


def test_lado_interventoria_con_validar():
    tp = _install_main_stub(
        perms=[{"funcion_id": 7, "validar": True}],
        usuario_row={
            "id": 4,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Interventoría"},
            "cargos": {"nombre": "Residente"},
        },
        funciones=[{"id": 7, "nombre": "Topografía"}],
    )
    user = {"sub": "4"}
    assert tp.lado_validacion_topo_usuario(user, 10) == 2
    tp.require_topo_puede_validar_nivel(user, 2, 10)
    with pytest.raises(HTTPException) as ei:
        tp.require_topo_puede_validar_nivel(user, 1, 10)
    assert ei.value.status_code == 403


def test_validar_sin_lado_no_inventa_n1():
    tp = _install_main_stub(
        perms=[{"funcion_id": 7, "validar": True}],
        usuario_row={
            "id": 5,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Contador"},
            "cargos": {"nombre": "Analista"},
        },
        funciones=[{"id": 7, "nombre": "Topografía"}],
    )
    user = {"sub": "5"}
    assert tp.lado_validacion_topo_usuario(user, 10) is None
    with pytest.raises(HTTPException) as ei:
        tp.require_topo_puede_validar_nivel(user, 1, 10)
    assert ei.value.status_code == 403


def test_cadenero_lado_n1():
    tp = _install_main_stub(
        perms=[{"funcion_id": 7, "validar": True}],
        usuario_row={
            "id": 6,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Operativo Contratista"},
            "cargos": {"nombre": "Cadenero"},
        },
        funciones=[{"id": 7, "nombre": "Topografía"}],
    )
    assert tp.lado_validacion_topo_usuario({"sub": "6"}, 10) == 1


def test_desarrollador_valida_ambos_niveles():
    tp = _install_main_stub(es_dev=True, usuario_row={"id": 1, "cargo_id": 1})
    user = {"sub": "1"}
    tp.require_topo_puede_validar_nivel(user, 1, 10)
    tp.require_topo_puede_validar_nivel(user, 2, 10)
