"""
Rendimiento PDF Bitácora: evidencia de que data_uri gigantes eran el cuello
y de que priorizar blob_path + JPEG compacto reduce tiempo a segundos.
"""
from __future__ import annotations

import base64
import io
import time
from unittest.mock import MagicMock

import bitacora_pdf as pdf


def _png_bytes(w: int, h: int, color=(40, 120, 200)) -> bytes:
    from PIL import Image
    im = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _data_uri_png(w: int, h: int) -> str:
    raw = _png_bytes(w, h)
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def test_prepare_img_omite_data_uri_gigante_y_usa_blob(monkeypatch):
    """data_uri multi-MB se ignora; se usa blob (con tope de bytes)."""
    huge_b64 = "A" * (pdf._FOTO_DATA_URI_MAX_RAW + 50_000)
    huge = "data:image/jpeg;base64," + huge_b64
    assert len(huge) > pdf._FOTO_DATA_URI_MAX_RAW

    calls = {"blob": 0, "data": 0}

    def fake_leer(cid, path):
        calls["blob"] += 1
        return _png_bytes(800, 600), "image/png"

    real_http = pdf._http_or_data_to_uri

    def wrap_http(src, *a, **k):
        if str(src).startswith("data:image"):
            calls["data"] += 1
        return real_http(src, *a, **k)

    monkeypatch.setattr(pdf, "leer_media_bitacora", fake_leer)
    monkeypatch.setattr(pdf, "_http_or_data_to_uri", wrap_http)

    out = pdf._prepare_img_asset(
        {
            "blob_path": "seguimiento-bitacora/1/x.png",
            "data_uri": huge,
        },
        1,
    )
    assert out is not None
    assert calls["blob"] == 1
    assert calls["data"] == 0
    uri, _w, _h = out
    assert uri.startswith("data:image/jpeg")


def test_pdf_con_fotos_grandes_termina_en_segundos(monkeypatch):
    """Cronometraje: 4 fotos 2000px + 1 evento con 2 fotos → total < 8s (sin red)."""
    pdf.clear_pdf_caches_for_tests()
    big = _data_uri_png(2000, 1500)

    monkeypatch.setattr(pdf, "contrato_meta_bitacora", lambda *_a, **_k: {
        "id": 1, "numero": "X", "objeto": "O", "contratista": "C",
        "interventoria": "I", "entidad": "E",
        "logo_contratista": None, "logo_interventoria": None, "logo_entidad": None,
        "geo_lat": 4.7, "geo_lng": -74.0,
        "export_palette": {},
    })
    monkeypatch.setattr(pdf, "list_entradas_del_dia", lambda *_a, **_k: {
        "fecha": "2026-08-20",
        "diario": {
            "id": 9,
            "fecha": "2026-08-20",
            "hora_inicio_labores": "07:00",
            "personal": [{"cargo": "Oficial", "cantidad": 3}],
            "equipos_uso": [{"equipo_nombre": "Retro", "cantidad": 1, "tramo": "Norte"}],
            "materiales": [],
            "cuerpo_html": "<p>ok</p>",
            "imagenes": [
                {"nombre": f"f{i}.png", "data_uri": big}
                for i in range(4)
            ],
            "asistencia_colaboradores": [],
        },
        "eventos": [{
            "evento_tipo": "novedades",
            "cuerpo_html": "<p>evt</p>",
            "imagenes": [
                {"nombre": "e1.png", "data_uri": big},
                {"nombre": "e2.png", "data_uri": big},
            ],
            "evento_detalle": {"actividades": []},
        }],
    })
    monkeypatch.setattr(pdf, "consultar_clima_slots_3h", lambda *_a, **_k: [
        {"hora": f"{h:02d}:00", "hora_num": h, "clima_descripcion": "Despejado",
         "clima_temp_c": 20, "manual": False, "fuente": "open-meteo"}
        for h in (0, 3, 6, 9, 12, 15, 18, 21)
    ])
    monkeypatch.setattr(pdf, "_prefetch_logos", lambda *_a, **_k: {})

    stages = {}

    def timed_pdf(doc, landscape=True):
        t0 = time.perf_counter()
        # Simula pisa barato: el coste real bajo prueba es prepare+html.
        out = b"%PDF-1.4 " + str(len(doc)).encode()
        stages["pisa_ms"] = (time.perf_counter() - t0) * 1000
        stages["html_kb"] = len(doc) / 1024
        return out

    monkeypatch.setattr(pdf, "to_pdf_bytes", timed_pdf)

    t0 = time.perf_counter()
    out = pdf.generar_pdf_bitacora_dia(MagicMock(), 1, "2026-08-20", entrada_id=9)
    total_ms = (time.perf_counter() - t0) * 1000
    assert out.startswith(b"%PDF")
    # Evidencia: debe quedar en rango de segundos, no minutos.
    assert total_ms < 8000, f"PDF tardó {total_ms:.0f} ms (html={stages.get('html_kb'):.0f} KB)"
    # HTML no debe hincharse a decenas de MB por fotos crudas.
    assert stages["html_kb"] < 2500, f"HTML demasiado grande: {stages['html_kb']:.0f} KB"


def test_export_pdf_frontend_timeout_no_enmascara_lentitud():
    """El timeout FE debe quedar en 45s — subir a 120s ocultaba el síntoma."""
    from pathlib import Path
    src = Path(__file__).resolve().parents[2] / "frontend/src/modules/seguimiento/seguimientoApi.js"
    text = src.read_text(encoding="utf-8")
    # Solo el export de un día (no el de rango).
    idx = text.find("exportBitacoraPdfBlob")
    assert idx >= 0
    chunk = text[idx: idx + 900]
    assert "apiFetchSignal(45000)" in chunk
    assert "apiFetchSignal(120000)" not in chunk
    assert "bitacora/export/pdf" in chunk


def test_prepare_img_blob_respeta_timeout(monkeypatch):
    """Si Azure cuelga, la foto se omite en < timeout+margen — no minutos."""
    import bitacora_pdf as pdf

    def hang(*_a, **_k):
        time.sleep(30)
        return b"x", "image/jpeg"

    monkeypatch.setattr(pdf, "leer_media_bitacora", hang)
    t0 = time.perf_counter()
    out = pdf._prepare_img_asset(
        {"blob_path": "seguimiento-bitacora/1/x.jpg"},
        1,
    )
    elapsed = time.perf_counter() - t0
    assert out is None
    assert elapsed < pdf._FOTO_BLOB_DOWNLOAD_TIMEOUT_S + 2.5
