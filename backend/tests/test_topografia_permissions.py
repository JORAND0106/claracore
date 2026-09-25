"""Unit tests: permisos Topografía (crear/editar vs validar + lado + legacy)."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException


class _Table:
    def __init__(self, name, *, usuarios=None, funciones=None, permisos=None):
        self.name = name
        self._usuarios = usuarios or []
        self._funciones = funciones or []
        self._permisos = permisos or []
        self._eq = {}
        self._in_ids = None

    def select(self, *_a, **_k):
        return self

    def eq(self, k, v):
        self._eq[k] = v
        return self

    def is_(self, k, v):
        self._eq[f"is:{k}"] = v
        return self

    def in_(self, k, ids):
        self._in_ids = (k, list(ids))
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self.name == "usuarios":
            return types.SimpleNamespace(data=list(self._usuarios))
        if self.name == "funciones":
            return types.SimpleNamespace(data=list(self._funciones))
        if self.name == "permisos":
            rows = list(self._permisos)
            if "cargo_id" in self._eq:
                rows = [p for p in rows if int(p.get("cargo_id")) == int(self._eq["cargo_id"])]
            if self._in_ids and self._in_ids[0] == "funcion_id":
                want = {int(x) for x in self._in_ids[1]}
                rows = [p for p in rows if int(p.get("funcion_id")) in want]
            if "contrato_id" in self._eq:
                cid = int(self._eq["contrato_id"])
                rows = [
                    p
                    for p in rows
                    if p.get("contrato_id") is not None and int(p["contrato_id"]) == cid
                ]
            if self._eq.get("is:contrato_id") == "null":
                rows = [p for p in rows if p.get("contrato_id") is None]
            return types.SimpleNamespace(data=rows)
        return types.SimpleNamespace(data=[])


def _install_main_stub(
    *,
    es_dev=False,
    usuario_row=None,
    funciones=None,
    permisos=None,
):
    main = types.ModuleType("main")
    main._es_desarrollador = lambda _u: bool(es_dev)
    main.supabase_execute = lambda fn: fn()

    urow = usuario_row or {}
    funcs = funciones or [{"id": 7, "nombre": "Topografía", "codigo": "TOPOGR"}]
    perms = permisos or []

    sb = MagicMock()
    sb.table = lambda name: _Table(
        name,
        usuarios=[urow] if urow else [],
        funciones=funcs,
        permisos=perms,
    )
    main.supabase = sb
    sys.modules["main"] = main
    sys.modules.pop("topografia_permissions", None)
    import topografia_permissions as tp  # noqa: WPS433

    return tp


@pytest.fixture(autouse=True)
def _clean_modules():
    yield
    sys.modules.pop("topografia_permissions", None)


def test_desarrollador_tiene_todas_las_acciones():
    tp = _install_main_stub(es_dev=True, usuario_row={"id": 1, "cargo_id": 1})
    user = {"sub": "1"}
    for accion in ("ver", "crear", "editar", "validar", "exportar", "eliminar"):
        assert tp.tiene_permiso_topografia(user, accion, 10) is True
    assert tp.lado_validacion_topo_usuario(user, 10) == 0


def test_crear_exige_flag_crear():
    tp = _install_main_stub(
        usuario_row={"id": 9, "cargo_id": 2},
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 10,
                "crear": True,
                "editar": False,
                "validar": False,
                "ver": True,
            }
        ],
    )
    user = {"sub": "9"}
    assert tp.tiene_permiso_topografia(user, "crear", 10) is True
    assert tp.tiene_permiso_topografia(user, "editar", 10) is False
    assert tp.tiene_permiso_topografia(user, "validar", 10) is False


def test_legacy_topografia_no_oculta_por_scoped_de_otras_funciones():
    """Regresión: lote scoped de SICOE no debe bloquear Topografía legacy."""
    tp = _install_main_stub(
        usuario_row={"id": 9, "cargo_id": 2},
        funciones=[
            {"id": 7, "nombre": "Topografía", "codigo": "TOPOGR"},
            {"id": 99, "nombre": "Reporte de Cantidades", "codigo": "SICOE"},
        ],
        permisos=[
            # Otras funciones scoped al contrato (como haría _permisos_rows_para_cargo).
            {
                "cargo_id": 2,
                "funcion_id": 99,
                "contrato_id": 10,
                "ver": True,
                "crear": True,
                "editar": True,
            },
            # Topografía solo legacy (global).
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": None,
                "ver": True,
                "crear": True,
                "editar": True,
                "exportar": True,
                "validar": False,
            },
        ],
    )
    user = {"sub": "9"}
    assert tp.tiene_permiso_topografia(user, "ver", 10) is True
    assert tp.tiene_permiso_topografia(user, "crear", 10) is True
    assert tp.tiene_permiso_topografia(user, "editar", 10) is True
    assert tp.tiene_permiso_topografia(user, "exportar", 10) is True
    assert tp.tiene_permiso_topografia(user, "validar", 10) is False


def test_no_reutiliza_topografia_de_otro_contrato():
    tp = _install_main_stub(
        usuario_row={"id": 9, "cargo_id": 2},
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 20,
                "ver": True,
                "crear": True,
                "editar": True,
            }
        ],
    )
    user = {"sub": "9"}
    assert tp.tiene_permiso_topografia(user, "ver", 10) is False
    with pytest.raises(HTTPException) as ei:
        tp.require_permiso_topografia(user, "ver", 10)
    assert ei.value.status_code == 403


def test_sin_permiso_matriz_deniega():
    tp = _install_main_stub(
        usuario_row={"id": 9, "cargo_id": 2},
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 10,
                "ver": True,
                "crear": False,
            }
        ],
    )
    user = {"sub": "9"}
    assert tp.tiene_permiso_topografia(user, "crear", 10) is False
    with pytest.raises(HTTPException) as ei:
        tp.require_permiso_topografia(user, "crear", 10)
    assert ei.value.status_code == 403


def test_lado_contratista_con_validar():
    tp = _install_main_stub(
        usuario_row={
            "id": 3,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Contratista"},
            "cargos": {"nombre": "Topógrafo"},
        },
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 10,
                "validar": True,
                "ver": True,
            }
        ],
    )
    user = {"sub": "3"}
    assert tp.lado_validacion_topo_usuario(user, 10) == 1
    tp.require_topo_puede_validar_nivel(user, 1, 10)
    with pytest.raises(HTTPException) as ei:
        tp.require_topo_puede_validar_nivel(user, 2, 10)
    assert ei.value.status_code == 403


def test_lado_interventoria_con_validar():
    tp = _install_main_stub(
        usuario_row={
            "id": 4,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Interventoría"},
            "cargos": {"nombre": "Residente"},
        },
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": None,
                "validar": True,
                "ver": True,
            }
        ],
    )
    user = {"sub": "4"}
    assert tp.lado_validacion_topo_usuario(user, 10) == 2
    tp.require_topo_puede_validar_nivel(user, 2, 10)


def test_validar_sin_lado_no_inventa_n1():
    tp = _install_main_stub(
        usuario_row={
            "id": 5,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Contador"},
            "cargos": {"nombre": "Analista"},
        },
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 10,
                "validar": True,
            }
        ],
    )
    user = {"sub": "5"}
    assert tp.lado_validacion_topo_usuario(user, 10) is None
    with pytest.raises(HTTPException) as ei:
        tp.require_topo_puede_validar_nivel(user, 1, 10)
    assert ei.value.status_code == 403


def test_cadenero_lado_n1():
    tp = _install_main_stub(
        usuario_row={
            "id": 6,
            "cargo_id": 2,
            "rol_id": 1,
            "roles": {"nombre": "Operativo Contratista"},
            "cargos": {"nombre": "Cadenero"},
        },
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 10,
                "validar": True,
            }
        ],
    )
    assert tp.lado_validacion_topo_usuario({"sub": "6"}, 10) == 1


def test_desarrollador_valida_ambos_niveles():
    tp = _install_main_stub(es_dev=True, usuario_row={"id": 1, "cargo_id": 1})
    user = {"sub": "1"}
    tp.require_topo_puede_validar_nivel(user, 1, 10)
    tp.require_topo_puede_validar_nivel(user, 2, 10)


def test_match_por_codigo_topogr():
    tp = _install_main_stub(
        usuario_row={"id": 9, "cargo_id": 2},
        funciones=[{"id": 7, "nombre": "Topo Obra", "codigo": "TOPOGR"}],
        permisos=[
            {
                "cargo_id": 2,
                "funcion_id": 7,
                "contrato_id": 10,
                "ver": True,
                "exportar": True,
            }
        ],
    )
    assert tp.tiene_permiso_topografia({"sub": "9"}, "ver", 10) is True
    assert tp.tiene_permiso_topografia({"sub": "9"}, "exportar", 10) is True
