"""La grilla del catálogo no arrastra cotizaciones, adjuntos ni el negociado consumido."""
from __future__ import annotations

import time
from pathlib import Path

import catalogo_insumos_service as cis
from catalogo_insumos_grilla import (
    GRILLA_TABLA_SELECT,
    GRILLA_VISTA_SELECT,
    fila_grilla_catalogo,
    fila_sin_detalle,
    proyectar_grilla_catalogo,
    vista_grilla_ausente,
)


def _fila_vista():
    return {
        "id": 9,
        "codigo": "INS-9",
        "descripcion": "Cemento",
        "unidad": "KG",
        "rendimiento": 1.5,
        "proveedor_id": 3,
        "proveedor_nombre": "ACME",
        "tipo_impuesto": "iva",
        "impuesto_porcentaje": 19,
        "tributos": {"iva": {"porcentaje": 19}},
        "cantidad_negociada": 20,
        "cotizacion_numero": "COT-001",
        "cotizacion_fecha": "2026-03-01",
        "costo_base": 1000,
        "valor_compra_referencia": 1190,
        "cotizaciones_detalle": [{"nota": "X" * 5000, "es_ganadora": True}],
        "soporte_pdf_blob_path": "blob/grande",
    }


def test_fila_grilla_solo_columnas_visibles():
    fila = fila_grilla_catalogo(_fila_vista())
    assert fila["proveedor_nombre"] == "ACME"
    assert fila["codigo"] == "INS-9"
    assert fila["rendimiento"] == 1.5
    assert fila["cantidad_negociada"] == 20
    assert fila["cotizacion_numero"] == "COT-001"
    assert fila["cotizacion_fecha"] == "2026-03-01"
    assert fila["costo_total"] == 1190
    assert fila_sin_detalle(fila)


def test_selects_no_incluyen_el_detalle():
    for cols in (GRILLA_VISTA_SELECT, GRILLA_TABLA_SELECT):
        assert "cotizaciones_detalle" not in cols
        assert "soporte_pdf" not in cols
        assert "*" not in cols.split(",")


def test_volumen_de_proyeccion_no_copia_el_detalle():
    n = 10000
    rows = [_fila_vista() | {"id": i, "codigo": f"C{i}"} for i in range(n)]
    t0 = time.perf_counter()
    out = proyectar_grilla_catalogo(rows)
    elapsed = time.perf_counter() - t0
    assert len(out) == n
    assert elapsed < 1.5, elapsed
    assert all(fila_sin_detalle(fila) for fila in out)
    assert out[0]["proveedor_nombre"] == "ACME"


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count if count is not None else len(data)


class _Query:
    def __init__(self, table, script):
        self.table = table
        self.script = script

    def select(self, cols, count=None):
        self.script["selects"].append((self.table, cols))
        return self

    def eq(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def or_(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def range(self, *args, **kwargs):
        return self

    def execute(self):
        if self.table == "v_catalogo_insumo_grilla" and self.script.get("vista_ausente"):
            raise RuntimeError("PGRST205 Could not find the table public.v_catalogo_insumo_grilla in the schema cache")
        if self.table == "almacen_proveedor":
            return _Resp([{"id": 3, "razon_social": "ACME"}])
        row = _fila_vista()
        if self.table == "almacen_insumo":
            row.pop("proveedor_nombre", None)
        return _Resp([row], 1)


class _SB:
    def __init__(self, script):
        self.script = script

    def table(self, name):
        return _Query(name, self.script)


def test_listado_lee_la_vista(monkeypatch):
    script = {"selects": [], "vista_ausente": False}
    monkeypatch.setattr(cis, "_sb", lambda: _SB(script))
    rows, total = cis.list_catalogo_insumos(7, "cem", 80, 0)
    assert total == 1
    assert script["selects"][0][0] == "v_catalogo_insumo_grilla"
    assert "cotizaciones_detalle" not in script["selects"][0][1]
    assert rows[0]["proveedor_nombre"] == "ACME"
    assert rows[0]["costo_total"] == 1190
    assert fila_sin_detalle(rows[0])


def test_listado_cae_a_columnas_si_no_hay_vista(monkeypatch):
    script = {"selects": [], "vista_ausente": True}
    monkeypatch.setattr(cis, "_sb", lambda: _SB(script))
    rows, total = cis.list_catalogo_insumos(7, "", 50, 0)
    assert total == 1
    tablas = [t for t, _cols in script["selects"]]
    assert tablas[0] == "v_catalogo_insumo_grilla"
    assert "almacen_insumo" in tablas
    assert all("cotizaciones_detalle" not in cols for _t, cols in script["selects"])
    assert rows[0]["proveedor_nombre"] == "ACME"
    assert fila_sin_detalle(rows[0])


def test_vista_ausente_no_confunde_otro_error():
    assert vista_grilla_ausente(RuntimeError("PGRST205 schema cache"))
    assert not vista_grilla_ausente(RuntimeError("connection timeout"))


def test_codigo_del_listado_no_recalcula_negociado_ni_hace_select_estrella():
    src = Path(__file__).resolve().parents[1].joinpath("catalogo_insumos_service.py").read_text(encoding="utf-8")
    start = src.index("def _fetch_grilla_vista")
    end = src.index("def get_insumo_catalogo")
    body = src[start:end]
    assert "VISTA_GRILLA" in body
    assert 'select("*", count="exact")' not in body
    assert "get_contexto_negociado_insumo" not in body
    assert "_enrich_insumo_catalogo_row" not in body
    assert "cotizaciones_detalle" not in body
