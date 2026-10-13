"""Unidad y rendimiento del catálogo: solo Editar, listado cerrado y confirmación si está en uso."""
from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi import HTTPException

from catalogo_insumos_service import (
    UNIDADES_INSUMO,
    evaluar_cambio_unidad_rendimiento,
    mensaje_cambio_unidad_rendimiento,
    propagar_unidad_solicitudes_sin_oc,
    rendimiento_insumo_para_guardar,
    unidad_insumo_para_guardar,
    update_insumo_catalogo,
    uso_insumo_catalogo,
)

ROOT = Path(__file__).resolve().parents[2]
JSX_UNIDADES = ROOT / "frontend" / "src" / "utils" / "unidadesListadoPrecios.jsx"
ROUTES = ROOT / "backend" / "catalogo_insumos_routes.py"
SERVICE = ROOT / "backend" / "catalogo_insumos_service.py"


class Mem:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Q(self, name)


class _Q:
    def __init__(self, mem, name):
        self.mem = mem
        self.name = name
        self.filters = []
        self._op = "select"
        self._payload = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, list(values)))
        return self

    def limit(self, n):
        self.filters.append(("limit", n))
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = dict(payload)
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload)
        return self

    def _match(self, row):
        for kind, *rest in self.filters:
            if kind == "eq" and row.get(rest[0]) != rest[1]:
                return False
            if kind == "in" and row.get(rest[0]) not in rest[1]:
                return False
        return True

    def execute(self):
        rows = self.mem.tables.setdefault(self.name, [])
        if self._op == "insert":
            rows.append(dict(self._payload))
            return type("R", (), {"data": [self._payload]})()
        matched = [r for r in rows if self._match(r)]
        for kind, *rest in self.filters:
            if kind == "limit":
                matched = matched[: rest[0]]
        if self._op == "update":
            for row in rows:
                if self._match(row):
                    row.update(self._payload)
            matched = [r for r in rows if self._match(r)]
        return type("R", (), {"data": matched})()


def _insumo(**extra):
    row = {
        "id": 5,
        "contrato_id": 1,
        "unidad": "UND",
        "rendimiento": 1,
        "descripcion": "CEMENTO",
        "codigo": "CC-1",
        "costo_base": 100,
        "requiere_cotizacion": False,
        "cotizaciones_detalle": [
            {"tipo": "insumo", "es_ganadora": True, "numero": "1", "valor": 100, "proveedor": "A"},
        ],
    }
    row.update(extra)
    return row


def _mem_en_uso(insumo=None):
    ins = insumo or _insumo()
    return Mem({
        "almacen_insumo": [ins],
        "almacen_solicitud_item": [
            {"id": 11, "insumo_id": 5, "solicitud_id": 3, "unidad": "UND"},
            {"id": 12, "insumo_id": 5, "solicitud_id": 4, "unidad": "UND"},
        ],
        "almacen_orden_compra_item": [
            {"id": 70, "orden_compra_id": 8, "solicitud_item_id": 12, "unidad": "UND"},
        ],
        "almacen_entrada": [],
        "almacen_entrada_item": [],
        "almacen_salida": [],
        "almacen_insumo_precio_historial": [],
    })


def test_unidades_coinciden_con_el_listado_de_la_plataforma():
    text = JSX_UNIDADES.read_text(encoding="utf-8")
    bloque = re.search(r"UNIDADES_LISTADO_PRECIOS = \[(.*?)\]", text, re.S)
    assert bloque
    unidades = re.findall(r"'([^']+)'", bloque.group(1))
    assert set(unidades) == set(UNIDADES_INSUMO)


def test_unidad_rechaza_texto_libre_y_conserva_la_historica():
    assert unidad_insumo_para_guardar("m2") == "M2"
    assert unidad_insumo_para_guardar("bolsa", "bolsa") == "bolsa"
    with pytest.raises(ValueError, match="texto libre"):
        unidad_insumo_para_guardar("CAJA", "UND")
    with pytest.raises(ValueError, match="obligatoria"):
        unidad_insumo_para_guardar("  ")


def test_rendimiento_solo_numerico():
    assert rendimiento_insumo_para_guardar(None) is None
    assert rendimiento_insumo_para_guardar("") is None
    assert rendimiento_insumo_para_guardar(0) == 0
    assert rendimiento_insumo_para_guardar("1,5") == 1.5
    for malo in ("abc", True, -1, "inf", float("nan")):
        with pytest.raises(ValueError, match="numéricos"):
            rendimiento_insumo_para_guardar(malo)


def test_mensaje_explica_el_uso_sin_cifras():
    texto = mensaje_cambio_unidad_rendimiento(
        unidad_antes="UND",
        unidad_despues="KG",
        rendimiento_antes=1,
        rendimiento_despues=2,
        solicitudes=2,
        ordenes=1,
        entradas=0,
        salidas=0,
    )
    assert "UND" in texto and "KG" in texto
    assert "2 solicitudes" in texto
    assert "1 orden de compra" in texto
    assert "conservan la unidad" in texto
    assert "no cambian" in texto
    assert "$" not in texto
    assert "COP" not in texto


def test_evaluar_pide_confirmacion_si_esta_en_uso():
    mem = _mem_en_uso()
    existing = mem.tables["almacen_insumo"][0]
    with pytest.raises(ValueError, match="está en uso"):
        evaluar_cambio_unidad_rendimiento(
            mem, 1, existing,
            {"unidad": "KG", "rendimiento": 1, "descripcion": "CEMENTO"},
        )
    ok = evaluar_cambio_unidad_rendimiento(
        mem, 1, existing,
        {
            "unidad": "KG",
            "rendimiento": 1,
            "descripcion": "CEMENTO",
            "confirmar_cambio_identidad": True,
        },
    )
    assert ok["cambio_unidad"] is True
    assert ok["cambio_rendimiento"] is False
    assert ok["campos"] == ["unidad"]


def test_evaluar_sin_uso_no_pide_confirmacion():
    mem = _mem_en_uso()
    mem.tables["almacen_solicitud_item"] = []
    existing = mem.tables["almacen_insumo"][0]
    ok = evaluar_cambio_unidad_rendimiento(
        mem, 1, existing,
        {"unidad": "KG", "rendimiento": "3", "descripcion": "CEMENTO"},
    )
    assert ok["cambio_unidad"] and ok["cambio_rendimiento"]
    assert ok["uso"]["en_uso"] is False


def test_evaluar_importacion_no_exige_confirmacion():
    mem = _mem_en_uso()
    existing = mem.tables["almacen_insumo"][0]
    ok = evaluar_cambio_unidad_rendimiento(
        mem, 1, existing,
        {"unidad": "KG", "rendimiento": 1, "descripcion": "CEMENTO"},
        motivo="import_csv_duplicado",
    )
    assert ok["cambio_unidad"] is True


def test_evaluar_exige_editar_de_catalogo_solo_si_cambia(monkeypatch):
    mem = _mem_en_uso()
    mem.tables["almacen_solicitud_item"] = []
    existing = mem.tables["almacen_insumo"][0]
    llamadas = []

    def boom(user, accion):
        llamadas.append((user.get("sub"), accion))
        raise HTTPException(status_code=403, detail="No tiene permiso (Catálogo de insumos · editar).")

    monkeypatch.setattr(
        "catalogo_insumos_permissions.require_permiso_catalogo_insumos",
        boom,
    )
    mismo = evaluar_cambio_unidad_rendimiento(
        mem, 1, existing,
        {"unidad": "UND", "rendimiento": 1, "descripcion": "CEMENTO"},
        current_user={"sub": 9},
    )
    assert mismo["campos"] == []
    assert llamadas == []
    with pytest.raises(HTTPException) as exc:
        evaluar_cambio_unidad_rendimiento(
            mem, 1, existing,
            {"unidad": "KG", "rendimiento": 1, "descripcion": "CEMENTO", "confirmar_cambio_identidad": True},
            current_user={"sub": 9},
        )
    assert exc.value.status_code == 403
    assert llamadas == [(9, "editar")]
    sin_usuario = evaluar_cambio_unidad_rendimiento(
        mem, 1, existing,
        {"unidad": "KG", "rendimiento": 1, "descripcion": "CEMENTO"},
        motivo="import_csv_duplicado",
        current_user=None,
    )
    assert sin_usuario["cambio_unidad"] is True
    assert llamadas == [(9, "editar")]


def test_descripcion_no_cambia_si_ya_hay_cotizaciones():
    mem = _mem_en_uso()
    existing = mem.tables["almacen_insumo"][0]
    with pytest.raises(ValueError, match="descripción del insumo no se puede modificar"):
        evaluar_cambio_unidad_rendimiento(
            mem, 1, existing,
            {"unidad": "UND", "rendimiento": 1, "descripcion": "ARENA"},
        )


def test_propagar_unidad_no_toca_lineas_en_orden_de_compra():
    mem = _mem_en_uso()
    n = propagar_unidad_solicitudes_sin_oc(mem, 5, "KG")
    assert n == 1
    items = {r["id"]: r["unidad"] for r in mem.tables["almacen_solicitud_item"]}
    assert items[11] == "KG"
    assert items[12] == "UND"
    assert mem.tables["almacen_orden_compra_item"][0]["unidad"] == "UND"


def test_uso_mensaje_sin_dinero_y_vacio_limpia_rendimiento(monkeypatch):
    mem = _mem_en_uso()
    monkeypatch.setattr("catalogo_insumos_service._sb", lambda: mem)
    out = uso_insumo_catalogo(1, 5, unidad="KG", rendimiento="2")
    assert out["solicitudes"] == 2
    assert out["ordenes"] == 1
    assert out["en_uso"] is True
    assert out["mensaje"]
    assert "$" not in out["mensaje"]
    limpio = uso_insumo_catalogo(1, 5, unidad="UND", rendimiento="")
    assert "rendimiento" in limpio["mensaje"]
    igual = uso_insumo_catalogo(1, 5, unidad="UND", rendimiento=None)
    assert igual["mensaje"] is None


def test_update_guarda_identidad_y_no_reescribe_la_orden(monkeypatch):
    mem = _mem_en_uso()
    monkeypatch.setattr("catalogo_insumos_service._sb", lambda: mem)
    monkeypatch.setattr(
        "catalogo_insumos_service._upsert_proveedores_desde_detalle",
        lambda contrato_id, user_id, detalle: detalle or [],
    )
    monkeypatch.setattr(
        "catalogo_insumos_service._resolve_proveedor_id_for_payload",
        lambda **kwargs: (None, kwargs.get("detalle") or []),
    )

    def _liq(sb, **kwargs):
        return kwargs["payload"], None

    monkeypatch.setattr(
        "almacen_insumo_liquidacion.aplicar_liquidacion_en_update",
        _liq,
    )
    monkeypatch.setattr(
        "catalogo_insumos_service.get_insumo",
        lambda cid, iid: {
            "id": iid,
            "unidad": mem.tables["almacen_insumo"][0]["unidad"],
            "rendimiento": mem.tables["almacen_insumo"][0]["rendimiento"],
            "codigo": "CC-1",
        },
    )
    with pytest.raises(ValueError, match="está en uso"):
        update_insumo_catalogo(
            1, 5, 3,
            {"unidad": "KG", "rendimiento": 2, "descripcion": "CEMENTO", "costo_base": 100, "requiere_cotizacion": False},
        )
    assert mem.tables["almacen_insumo"][0]["unidad"] == "UND"
    result = update_insumo_catalogo(
        1, 5, 3,
        {
            "unidad": "kg",
            "rendimiento": "2",
            "descripcion": "cemento",
            "costo_base": 100,
            "requiere_cotizacion": False,
            "confirmar_cambio_identidad": "true",
        },
    )
    assert result["unidad"] == "KG"
    assert result["rendimiento"] == 2
    cambios = result["_cambios_identidad"]
    assert cambios["campos"] == ["unidad", "rendimiento"]
    assert cambios["anterior"]["unidad"] == "UND"
    assert cambios["nuevo"]["unidad"] == "KG"
    assert "$" not in str(cambios)
    items = {r["id"]: r["unidad"] for r in mem.tables["almacen_solicitud_item"]}
    assert items[11] == "KG"
    assert items[12] == "UND"
    assert mem.tables["almacen_orden_compra_item"][0]["unidad"] == "UND"


def test_rutas_exigen_editar_y_el_log_no_devuelve_el_cambio():
    routes = ROUTES.read_text(encoding="utf-8")
    service = SERVICE.read_text(encoding="utf-8")
    assert 'require_permiso_catalogo_insumos(current_user, "editar")' in routes
    assert "/insumos/{insumo_id}/uso" in routes
    assert "result.pop(\"_cambios_identidad\"" in routes
    assert "valor_anterior=cambios.get(\"anterior\")" in routes
    assert "valor_nuevo=cambios.get(\"nuevo\")" in routes
    assert "propagar_unidad_solicitudes_sin_oc" in service
    assert "La descripción del insumo no se puede modificar." in service
