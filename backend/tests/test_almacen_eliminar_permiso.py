"""Eliminar en Almacén solo con el permiso Eliminar, y sin romper dependencias."""
from __future__ import annotations

import ast
from pathlib import Path

import pytest
from fastapi import HTTPException

import almacen_service as svc
import catalogo_insumos_service as cat
from almacen_eliminar_reglas import (
    MOTIVO_ADJUNTO_GANADORA,
    MOTIVO_COTIZACION_GANADORA,
    MOTIVO_ENTRADA_SALIDAS,
    MOTIVO_LINEA_OC,
    MOTIVO_SOLICITUD_OC,
    motivo_cotizacion_ganadora,
    motivo_insumo_con_dependencias,
    registro_completo,
)
from almacen_permissions import tiene_permiso_almacen
from catalogo_insumos_permissions import (
    require_permiso_catalogo_insumos,
    tiene_permiso_catalogo_insumos,
)

ROOT = Path(__file__).resolve().parents[1]


class _Resp:
    def __init__(self, data):
        self.data = data


class Mem:
    def __init__(self, tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}
        self.deleted = []

    def table(self, name):
        return _Q(self, name)


class _Q:
    def __init__(self, mem, name):
        self.mem = mem
        self.name = name
        self.mode = "select"
        self.filters = []
        self.payload = None
        self.lim = None

    def select(self, *_a, **_k):
        self.mode = "select"
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self.filters.append(("in", col, list(vals)))
        return self

    def limit(self, n):
        self.lim = n
        return self

    def order(self, *_a, **_k):
        return self

    def delete(self):
        self.mode = "delete"
        return self

    def update(self, payload):
        self.mode = "update"
        self.payload = dict(payload)
        return self

    def insert(self, rows):
        self.mode = "insert"
        self.payload = rows
        return self

    def _same(self, left, right):
        if left == right:
            return True
        try:
            return int(left) == int(right)
        except (TypeError, ValueError):
            return False

    def _match(self, row):
        for op, col, val in self.filters:
            cur = row.get(col)
            if op == "eq" and not self._same(cur, val):
                return False
            if op == "in" and not any(self._same(cur, item) for item in val):
                return False
        return True

    def execute(self):
        rows = self.mem.tables.setdefault(self.name, [])
        if self.mode == "select":
            found = [dict(r) for r in rows if self._match(r)]
            if self.lim is not None:
                found = found[: self.lim]
            return _Resp(found)
        if self.mode == "delete":
            keep = []
            for row in rows:
                if self._match(row):
                    self.mem.deleted.append((self.name, dict(row)))
                else:
                    keep.append(row)
            self.mem.tables[self.name] = keep
            return _Resp([])
        if self.mode == "update":
            for row in rows:
                if self._match(row):
                    row.update(self.payload)
            return _Resp([])
        if self.mode == "insert":
            data = self.payload if isinstance(self.payload, list) else [self.payload]
            rows.extend(dict(r) for r in data)
            return _Resp(data)
        return _Resp([])


def _fn_source(path: Path, name: str) -> str:
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return ast.get_source_segment(text, node) or ""
    raise AssertionError(name)


def test_motivos_en_espanol_sin_ocultar_el_caso():
    assert motivo_insumo_con_dependencias() is None
    texto = motivo_insumo_con_dependencias(solicitudes=True, ordenes=True, salidas=True)
    assert "solicitudes, órdenes de compra y salidas" in texto
    assert motivo_cotizacion_ganadora(True, True) == MOTIVO_COTIZACION_GANADORA
    assert motivo_cotizacion_ganadora(True, True, solo_adjunto=True) == MOTIVO_ADJUNTO_GANADORA
    assert motivo_cotizacion_ganadora(True, False) is None
    assert "salidas que consumen su stock" in MOTIVO_ENTRADA_SALIDAS
    assert "orden de compra" in MOTIVO_LINEA_OC
    assert "orden de compra" in MOTIVO_SOLICITUD_OC


def test_registro_completo_omite_bytes_y_conserva_el_resto():
    row = {"id": 3, "valor": 440000, "pdf": b"binario", "items": [{"nota": "arena", "blob": bytearray(b"x")}]}
    out = registro_completo(row)
    assert out["valor"] == 440000
    assert "pdf" not in out
    assert out["items"] == [{"nota": "arena"}]
    assert "blob" not in row["items"][0] or row["items"][0]["blob"] == bytearray(b"x")


def test_director_y_gerencia_no_habilitan_eliminar(monkeypatch):
    import sys
    import types

    class _QUser:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return _Resp([{"cargo_id": 1}])

    class _Sb:
        def table(self, _name):
            return _QUser()

    fake = types.ModuleType("main")
    fake._es_desarrollador = lambda _u: False
    fake.supabase = _Sb()
    fake.supabase_execute = lambda fn: fn()
    monkeypatch.setitem(sys.modules, "main", fake)
    director = {"sub": 5, "cargo_nombre": "Director de obra", "rol_nombre": "Operativo"}
    gerencia = {"sub": 6, "cargo_nombre": "Residente", "rol_nombre": "Contratista Gerencial"}
    assert tiene_permiso_almacen(director, "validar") is True
    assert tiene_permiso_almacen(director, "eliminar") is False
    assert tiene_permiso_almacen(director, "editar") is False
    assert tiene_permiso_almacen(gerencia, "eliminar") is False


def test_catalogo_bloquea_rol_excluido_aunque_el_cargo_tenga_eliminar(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_permissions._cargo_permiso_catalogo",
        lambda _u, _a: True,
    )
    user = {"rol_nombre": "Supervisión Externa", "sub": 8}
    assert tiene_permiso_catalogo_insumos(user, "eliminar") is False
    with pytest.raises(HTTPException) as exc:
        require_permiso_catalogo_insumos(user, "eliminar")
    assert exc.value.status_code == 403


def test_rutas_de_baja_exigen_eliminar_y_dejan_el_registro_en_el_log():
    almacen = ROOT / "almacen_routes.py"
    for name in (
        "route_eliminar_entrada",
        "route_eliminar_salida",
        "route_eliminar_devolucion",
        "route_eliminar_solicitud",
        "route_eliminar_linea_solicitud",
    ):
        src = _fn_source(almacen, name)
        assert '"eliminar"' in src
        assert '"editar"' not in src
        assert "registro_completo" in src or 'valor_anterior=result.get("registro")' in src
        assert 'result.pop("registro"' in src or "registro_completo" in src
    catalogo = ROOT / "catalogo_insumos_routes.py"
    for name in ("route_delete_insumo", "route_eliminar_cotizacion_insumo"):
        src = _fn_source(catalogo, name)
        assert 'require_permiso_catalogo_insumos(current_user, "eliminar")' in src
        assert 'valor_anterior=result.get("registro")' in src
        assert 'result.pop("registro", None)' in src


def test_eliminar_solicitud_sin_oc_borra_y_recalcula(monkeypatch):
    mem = Mem({
        "almacen_solicitud": [{"id": 7, "contrato_id": 3, "consecutivo": 7, "titulo": "Arena", "valor": 100}],
        "almacen_solicitud_item": [{"id": 70, "solicitud_id": 7, "descripcion_solicitada": "Arena", "cantidad": 2}],
        "almacen_orden_compra": [],
    })
    calls = []
    monkeypatch.setattr(svc, "_sb", lambda: mem)
    monkeypatch.setattr(svc, "_invalidar_graficos_inventario", lambda cid: calls.append(cid))
    out = svc.eliminar_solicitud(3, 7)
    assert out["ok"] is True
    assert out["registro"]["solicitud"]["valor"] == 100
    assert mem.tables["almacen_solicitud"] == []
    assert mem.tables["almacen_solicitud_item"] == []
    assert calls == [3]


def test_eliminar_solicitud_con_oc_no_borra(monkeypatch):
    mem = Mem({
        "almacen_solicitud": [{"id": 7, "contrato_id": 3, "consecutivo": 7}],
        "almacen_solicitud_item": [{"id": 70, "solicitud_id": 7}],
        "almacen_orden_compra": [{"id": 4, "solicitud_id": 7, "contrato_id": 3, "numero_oc": 1}],
    })
    monkeypatch.setattr(svc, "_sb", lambda: mem)
    with pytest.raises(ValueError, match="orden de compra"):
        svc.eliminar_solicitud(3, 7)
    assert mem.tables["almacen_solicitud"]


def test_eliminar_linea_en_oc_explica_y_no_borra(monkeypatch):
    mem = Mem({
        "almacen_solicitud_item": [{"id": 70, "solicitud_id": 7, "cantidad": 2, "valor_compra_unitario": 50}],
        "almacen_solicitud": [{"id": 7, "contrato_id": 3, "consecutivo": 7}],
        "almacen_orden_compra": [{"id": 4, "solicitud_id": 7, "contrato_id": 3, "numero_oc": 1}],
        "almacen_orden_compra_item": [{"id": 9, "orden_compra_id": 4, "solicitud_item_id": 70}],
    })
    monkeypatch.setattr(svc, "_sb", lambda: mem)
    with pytest.raises(ValueError, match="incluida en una orden de compra"):
        svc.eliminar_linea_solicitud(3, 70)
    assert any(r["id"] == 70 for r in mem.tables["almacen_solicitud_item"])


def test_eliminar_linea_libre_recalcula(monkeypatch):
    mem = Mem({
        "almacen_solicitud_item": [{"id": 71, "solicitud_id": 7, "cantidad": 1, "material_descripcion": "Grava"}],
        "almacen_solicitud": [{"id": 7, "contrato_id": 3, "consecutivo": 7}],
        "almacen_orden_compra": [],
    })
    calls = []
    monkeypatch.setattr(svc, "_sb", lambda: mem)
    monkeypatch.setattr(svc, "_invalidar_graficos_inventario", lambda cid: calls.append(cid))
    out = svc.eliminar_linea_solicitud(3, 71)
    assert out["registro"]["material_descripcion"] == "Grava"
    assert mem.tables["almacen_solicitud_item"] == []
    assert calls == [3]


def test_entrada_con_salidas_no_se_elimina(monkeypatch):
    mem = Mem({"almacen_salida": [{"id": 1, "entrada_item_id": 9}]})
    monkeypatch.setattr(svc, "_sb", lambda: mem)
    with pytest.raises(ValueError, match="consumen su stock"):
        svc.eliminar_entrada(3, 5, ent_prefetched={"id": 5, "items": [{"id": 9}], "numero_entrada": 2})
    assert mem.deleted == []


def test_anular_borrador_no_es_eliminar(monkeypatch):
    monkeypatch.setattr(svc, "_exigir_agrupacion_libre", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_fetch_solicitud_head", lambda *_a, **_k: {"id": 1, "estado": "borrador"})
    monkeypatch.setattr(svc, "_sb", lambda: Mem({}))
    with pytest.raises(ValueError, match="permiso Eliminar"):
        svc.anular_solicitud(3, 1, 9)


def test_insumo_con_solicitud_no_se_desactiva(monkeypatch):
    mem = Mem({
        "almacen_insumo": [{"id": 12, "contrato_id": 3, "codigo": "CC-1", "activo": True, "costo_base": 10}],
        "almacen_solicitud_item": [{"id": 1, "insumo_id": 12, "solicitud_id": 4}],
    })
    monkeypatch.setattr(cat, "_sb", lambda: mem)
    with pytest.raises(ValueError, match="solicitudes asociadas"):
        cat.delete_insumo_catalogo(3, 12)
    assert mem.tables["almacen_insumo"][0]["activo"] is True


def test_insumo_sin_dependencias_se_desactiva_y_guarda_el_registro(monkeypatch):
    mem = Mem({
        "almacen_insumo": [{
            "id": 12,
            "contrato_id": 3,
            "codigo": "CC-1",
            "activo": True,
            "costo_base": 10,
            "pdf": b"no-log",
        }],
    })
    monkeypatch.setattr(cat, "_sb", lambda: mem)
    out = cat.delete_insumo_catalogo(3, 12)
    assert out["registro"]["costo_base"] == 10
    assert "pdf" not in out["registro"]
    assert mem.tables["almacen_insumo"][0]["activo"] is False
    assert mem.tables["almacen_insumo"][0]["codigo"] != "CC-1"


def test_cotizacion_ganadora_con_lineas_no_se_quita(monkeypatch):
    mem = Mem({
        "almacen_insumo": [{
            "id": 12,
            "contrato_id": 3,
            "cotizaciones_detalle": [
                {"id": "p1-insumo", "tipo": "insumo", "es_ganadora": True, "numero": "C-1", "valor": 80},
            ],
        }],
        "almacen_solicitud_item": [{"id": 1, "insumo_id": 12, "solicitud_id": 4}],
    })
    monkeypatch.setattr(cat, "_sb", lambda: mem)
    with pytest.raises(ValueError, match="ganadora"):
        cat.eliminar_cotizacion_de_insumo(3, 12, "p1-insumo")
    assert len(mem.tables["almacen_insumo"][0]["cotizaciones_detalle"]) == 1


def test_cotizacion_no_ganadora_recalcula_el_costo(monkeypatch):
    mem = Mem({
        "almacen_insumo": [{
            "id": 12,
            "contrato_id": 3,
            "costo_base": 80,
            "cotizaciones_detalle": [
                {"id": "p1-insumo", "tipo": "insumo", "es_ganadora": True, "numero": "C-1", "valor": 80},
                {"id": "p2-insumo", "tipo": "insumo", "es_ganadora": False, "numero": "C-2", "valor": 120},
            ],
        }],
    })
    monkeypatch.setattr(cat, "_sb", lambda: mem)
    out = cat.eliminar_cotizacion_de_insumo(3, 12, "p2-insumo")
    assert out["registro"]["numero"] == "C-2"
    assert out["registro"]["valor"] == 120
    detalle = mem.tables["almacen_insumo"][0]["cotizaciones_detalle"]
    assert [r["numero"] for r in detalle] == ["C-1"]
    assert mem.tables["almacen_insumo"][0]["costo_base"] == 80
