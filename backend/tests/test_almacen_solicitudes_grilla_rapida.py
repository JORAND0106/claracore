"""Grilla de solicitudes: listado liviano y contadores de chips."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_list_resumen_no_trae_oc_completa():
    svc = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    assert "_OC_LIST_SELECTS" in svc
    assert "documento_sistema" in svc
    assert 'pdf_blob_path, es_sistema' not in svc
    assert "return_oci_rows=True" in svc
    assert "solicitud_item_id, cantidad, cantidad_recibida" in svc
    assert "need_ofertas" in svc
    assert "_fetch_ocs_for_solicitudes_list" in svc


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
        "documento_sistema": True,
        "observaciones": "no debe viajar",
        "pdf_bytes": b"xxx",
    })
    assert slim["numero_oc"] == "OC-1"
    assert slim["tiene_pdf_oc"] is True
    assert slim["documento_sistema"] is True
    assert "es_sistema" not in slim
    assert "observaciones" not in slim
    assert "pdf_bytes" not in slim


def test_fetch_ocs_fallback_sin_documento_sistema(monkeypatch):
    import almacen_service as svc

    class _Q:
        def __init__(self, fail_first=True):
            self.fail_first = fail_first
            self.n = 0

        def select(self, cols):
            self.cols = cols
            return self

        def in_(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            self.n += 1
            if self.fail_first and "documento_sistema" in self.cols:
                raise Exception(
                    "column almacen_orden_compra.documento_sistema does not exist"
                )
            return type("R", (), {"data": [
                {"id": 1, "solicitud_id": 9, "numero_oc": 3, "pdf_blob_path": None},
            ]})()

    class _Sb:
        def table(self, _name):
            return _Q()

    rows = svc._fetch_ocs_for_solicitudes_list(_Sb(), [9])
    assert len(rows) == 1
    assert rows[0]["numero_oc"] == 3
