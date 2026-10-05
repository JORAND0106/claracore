"""La grilla del catálogo no arrastra cotizaciones, adjuntos ni historial."""
from __future__ import annotations

import time
from pathlib import Path

from catalogo_insumos_grilla import (
    completar_fila_grilla_desde_detalle,
    fila_grilla_catalogo,
    fila_grilla_incompleta,
    proyectar_grilla_catalogo,
)


def _detalle_pesado(n_cot=40):
    return [
        {
            "id": f"c-{i}",
            "tipo": "insumo",
            "es_ganadora": i == 0,
            "numero": "COT-001" if i == 0 else f"COT-{i:03d}",
            "fecha": "2026-03-01" if i == 0 else "2026-01-01",
            "valor": 1500 if i == 0 else 9000,
            "proveedor": "Proveedor Ganador" if i == 0 else f"Proveedor {i}",
            "pdf_nombre": "soporte.pdf",
            "nota": "X" * 800,
        }
        for i in range(n_cot)
    ]


def test_fila_grilla_solo_columnas_visibles():
    row = {
        "id": 9,
        "codigo": "INS-9",
        "descripcion": "Cemento",
        "unidad": "KG",
        "rendimiento": 1.5,
        "proveedor_id": 3,
        "tipo_impuesto": "iva",
        "impuesto_porcentaje": 19,
        "tributos": {"iva": {"porcentaje": 19}},
        "cantidad_negociada": 20,
        "cotizacion_numero": "COT-001",
        "cotizacion_fecha": "2026-03-01",
        "costo_base": 1000,
        "valor_compra_referencia": 1190,
        "cotizaciones_detalle": _detalle_pesado(),
        "soporte_pdf_blob_path": "blob/grande",
    }
    fila = fila_grilla_catalogo(row, "ACME")
    assert fila["proveedor_nombre"] == "ACME"
    assert fila["codigo"] == "INS-9"
    assert fila["rendimiento"] == 1.5
    assert fila["cantidad_negociada"] == 20
    assert fila["cotizacion_numero"] == "COT-001"
    assert fila["costo_total"] == 1190
    assert "cotizaciones_detalle" not in fila
    assert "soporte_pdf_blob_path" not in fila
    assert fila_grilla_incompleta(fila) is False


def test_completa_columnas_vacias_sin_adjuntar_el_detalle():
    fila = fila_grilla_catalogo(
        {"id": 4, "codigo": "A", "descripcion": "Arena", "unidad": "M3"},
        "—",
    )
    assert fila_grilla_incompleta(fila) is True
    out = completar_fila_grilla_desde_detalle(fila, _detalle_pesado(3))
    assert out["cotizacion_numero"] == "COT-001"
    assert out["cotizacion_fecha"] == "2026-03-01"
    assert out["proveedor_nombre"] == "Proveedor Ganador"
    assert out["costo"] == 1500
    assert "cotizaciones_detalle" not in out


def test_volumen_miles_de_insumos_no_copia_el_detalle():
    n = 3000
    rows = []
    detalles = {}
    for i in range(n):
        completo = i % 5 != 0
        rows.append({
            "id": i + 1,
            "codigo": f"C{i}",
            "descripcion": f"Insumo {i}",
            "unidad": "UND",
            "rendimiento": 2,
            "proveedor_id": 1 if completo else None,
            "tributos": {"iva": {"porcentaje": 19}},
            "cantidad_negociada": 10,
            "cotizacion_numero": "COT-001" if completo else "",
            "cotizacion_fecha": "2026-04-01" if completo else "",
            "costo_base": 100,
            "valor_compra_referencia": 119,
            "cotizaciones_detalle": _detalle_pesado(25),
        })
        if not completo:
            detalles[i + 1] = _detalle_pesado(25)
    t0 = time.perf_counter()
    out = proyectar_grilla_catalogo(rows, {1: "ACME"}, detalles)
    elapsed = time.perf_counter() - t0
    assert len(out) == n
    assert elapsed < 2.5, elapsed
    assert all("cotizaciones_detalle" not in fila for fila in out)
    assert out[1]["proveedor_nombre"] == "ACME"
    assert out[0]["cotizacion_numero"] == "COT-001"
    assert out[0]["proveedor_nombre"] == "Proveedor Ganador"


def test_listado_no_enriquece_ni_trae_select_estrella():
    src = Path(__file__).resolve().parents[1].joinpath("catalogo_insumos_service.py").read_text(encoding="utf-8")
    start = src.index("def list_catalogo_insumos")
    end = src.index("def get_insumo_catalogo")
    body = src[start:end]
    assert "GRILLA_INSUMO_SELECT" in body
    assert 'select("*", count="exact")' not in body
    assert "get_contexto_negociado_insumo" not in body
    assert "_enrich_insumo_catalogo_row" not in body
    assert "cotizaciones_detalle" not in body.split("incompletas")[0]
