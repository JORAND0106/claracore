"""Caché PDF de acta: invalidación por versión de plantilla."""
from __future__ import annotations

import seguimiento_service as svc
from seguimiento_pdf import PDF_ACTA_TEMPLATE_VERSION, pdf_acta_cache_key


class _Resp:
    def __init__(self, data=None):
        self.data = data


class _FakeQ:
    def __init__(self, store):
        self._store = store
        self._updates = []

    def update(self, payload):
        self._updates.append(payload)
        self._store["last_update"] = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        return _Resp([])


class _FakeSB:
    def __init__(self):
        self.store = {}
        self.q = _FakeQ(self.store)

    def table(self, _name):
        return self.q


def test_try_load_pdf_cache_requiere_misma_clave(monkeypatch):
    acta = {
        "id": 1,
        "pdf_blob_path": "seguimiento-actas/1/1/acta.pdf",
        "contenido_hash": pdf_acta_cache_key("hash-a"),
    }
    monkeypatch.setattr(
        "azure_blob_storage.download_blob_bytes_private",
        lambda _p: b"%PDF-1.4 cached-ok************",
    )
    assert svc._try_load_pdf_acta_cache(None, acta, pdf_acta_cache_key("hash-a")).startswith(b"%PDF")

    # Misma ruta pero hash de contenido distinto → miss
    assert svc._try_load_pdf_acta_cache(None, acta, pdf_acta_cache_key("hash-b")) is None

    # Plantilla distinta (simula deploy) → miss aunque el path exista
    old_key = f"old-template:hash-a"
    acta_old = {**acta, "contenido_hash": old_key}
    assert svc._try_load_pdf_acta_cache(None, acta_old, pdf_acta_cache_key("hash-a")) is None


def test_invalidar_pdf_acta_cache_limpia_blob_path():
    sb = _FakeSB()
    svc.invalidar_pdf_acta_cache(sb, 9)
    assert sb.store["last_update"]["pdf_blob_path"] is None


def test_generar_preview_force_no_usa_cache(monkeypatch):
    calls = {"gen": 0, "download": 0}

    monkeypatch.setattr(
        svc,
        "get_acta",
        lambda sb, aid, cid: {
            "id": aid,
            "tipo_acta": "externa",
            "consecutivo": 1,
            "fecha_reunion": "2026-07-28",
            "asistentes": [],
            "ideas": [],
            "apartados": [],
            "firmas": [],
            "compromisos": [],
            "pdf_blob_path": "seguimiento-actas/1/1/old.pdf",
            "contenido_hash": pdf_acta_cache_key("same"),
        },
    )
    monkeypatch.setattr(svc, "_contrato", lambda sb, cid: {"id": cid, "numero": "CT-1"})
    monkeypatch.setattr(svc, "compromisos_abiertos_contrato", lambda *a, **k: [])
    monkeypatch.setattr(
        svc,
        "contenido_hash_acta",
        lambda *a, **k: "same",
    )

    def _fake_download(_p):
        calls["download"] += 1
        return b"%PDF-1.4 FROM-CACHE**************"

    monkeypatch.setattr("azure_blob_storage.download_blob_bytes_private", _fake_download)
    monkeypatch.setattr(
        svc,
        "generar_pdf_acta",
        lambda *a, **k: (calls.__setitem__("gen", calls["gen"] + 1) or b"%PDF-1.4 FRESH****************"),
    )
    monkeypatch.setattr(svc, "_persist_pdf_acta_cache", lambda *a, **k: None)
    monkeypatch.setattr(svc, "invalidar_pdf_acta_cache", lambda *a, **k: None)

    # Sin force: usa caché
    out = svc.generar_preview_pdf_acta(None, 1, 1, force=False)
    assert out.startswith(b"%PDF-1.4 FROM-CACHE")
    assert calls["download"] == 1
    assert calls["gen"] == 0

    # Con force: regenera
    out2 = svc.generar_preview_pdf_acta(None, 1, 1, force=True)
    assert out2.startswith(b"%PDF-1.4 FRESH")
    assert calls["gen"] == 1


def test_template_version_constante_no_vacia():
    assert PDF_ACTA_TEMPLATE_VERSION
    assert ":" not in PDF_ACTA_TEMPLATE_VERSION
