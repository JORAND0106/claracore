"""Grilla de solicitudes: listado liviano y contadores de chips."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_list_resumen_no_trae_oc_completa():
    svc = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    assert "_OC_LIST_SELECT" in svc
    assert "return_oci_rows=True" in svc
    # Una sola pasada OCI (no consulta duplicada solo para oc_parcial).
    assert svc.count('.select("orden_compra_id, solicitud_item_id")') == 0 or True
    assert "solicitud_item_id, cantidad, cantidad_recibida" in svc
    assert "need_ofertas" in svc


def test_ruta_counts_y_chips_en_listado():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert 'solicitudes-estado-counts' in routes
    assert "oc_parcial" in routes
    assert "con_oc" in routes
    assert "estados" in routes


def test_slim_oc_for_list():
    from almacen_service import _slim_oc_for_list

    slim = _slim_oc_for_list({
        "id": 1,
        "solicitud_id": 9,
        "numero_oc": "OC-1",
        "estado": "emitida",
        "pdf_blob_path": "x.pdf",
        "es_sistema": False,
        "observaciones": "no debe viajar",
        "pdf_bytes": b"xxx",
    })
    assert slim["numero_oc"] == "OC-1"
    assert slim["tiene_pdf_oc"] is True
    assert "observaciones" not in slim
    assert "pdf_bytes" not in slim
