"""Tests de integridad visual de firmas CCD (hash + marcador PDF)."""
from __future__ import annotations

from ccd_firma_integridad import (
    FIRMA_INVALIDADA_MARKER,
    TEXTO_FIRMA_INVALIDADA,
    es_marcador_firma_invalidada,
    hash_canonico,
    html_caja_firma_invalidada,
    html_fo_eo04_firma_invalidada,
    payload_desde_items_agregados,
    payload_desde_registros,
)


def test_hash_cambia_si_cambia_cantidad():
    base = dict(
        formato_codigo="CC-SUB-001",
        contexto_tipo="corte",
        contexto_id=10,
        items=[{"item_numero": "01", "cantidad": 2, "vlr_unitario": 100, "costo_directo": 200}],
        total_costo=200,
    )
    p1 = payload_desde_items_agregados(**base)
    p2 = payload_desde_items_agregados(
        **{**base, "items": [{"item_numero": "01", "cantidad": 3, "vlr_unitario": 100, "costo_directo": 300}], "total_costo": 300}
    )
    assert hash_canonico(p1) != hash_canonico(p2)


def test_hash_estable_ante_orden_items():
    a = payload_desde_items_agregados(
        formato_codigo="CC-SEM-001",
        contexto_tipo="semana",
        contexto_id=1,
        items=[
            {"item_numero": "02", "cantidad": 1, "costo_directo": 10},
            {"item_numero": "01", "cantidad": 2, "costo_directo": 20},
        ],
        total_costo=30,
    )
    b = payload_desde_items_agregados(
        formato_codigo="CC-SEM-001",
        contexto_tipo="semana",
        contexto_id=1,
        items=[
            {"item_numero": "01", "cantidad": 2, "costo_directo": 20},
            {"item_numero": "02", "cantidad": 1, "costo_directo": 10},
        ],
        total_costo=30,
    )
    assert hash_canonico(a) == hash_canonico(b)


def test_hash_registros_incluye_foto_url():
    base = dict(
        formato_codigo="CC-SUB-002",
        contexto_tipo="corte",
        contexto_id=5,
        registros=[{"id": 1, "item_numero": "1", "cantidad_total": 1, "foto_url": "http://a"}],
    )
    p1 = payload_desde_registros(**base)
    p2 = payload_desde_registros(
        **{
            **base,
            "registros": [{"id": 1, "item_numero": "1", "cantidad_total": 1, "foto_url": "http://b"}],
        }
    )
    assert hash_canonico(p1) != hash_canonico(p2)


def test_marcador_y_html_invalidacion():
    assert es_marcador_firma_invalidada(FIRMA_INVALIDADA_MARKER)
    assert not es_marcador_firma_invalidada("data:image/png;base64,xx")
    assert not es_marcador_firma_invalidada(None)
    html = html_caja_firma_invalidada(box_pt="28pt")
    assert TEXTO_FIRMA_INVALIDADA in html
    assert "28pt" in html
    html2 = html_fo_eo04_firma_invalidada(box_pt="36pt")
    assert TEXTO_FIRMA_INVALIDADA in html2
    assert "36pt" in html2


def test_html_cc_sub_columna_muestra_texto_si_marcador():
    """Smoke: el helper de columna usa el marcador sin romper el layout."""
    pytest = __import__("pytest")
    try:
        import informes as inf
    except Exception as e:
        pytest.skip(f"informes no importable en este entorno: {e}")

    td = inf._html_cc_sub_td_firma_columna(
        "border:1px solid #000",
        "Elaboró:",
        "Nombre",
        "Cargo",
        FIRMA_INVALIDADA_MARKER,
    )
    assert TEXTO_FIRMA_INVALIDADA in td
    assert "<img" not in td
    assert "Elaboró:" in td
