"""Tests: STT/síntesis de Temas en vivo (sin audio persistente)."""
from __future__ import annotations

from acta_grabacion_live_service import (
    MAX_TEMAS,
    _normalize_temas,
    _parse_temas_json,
    _should_synthesize,
    append_transcript,
    speech_status,
)


def test_append_transcript_une_deltas():
    assert append_transcript("", "Hola") == "Hola"
    assert append_transcript("Hola", "mundo") == "Hola mundo"


def test_normalize_temas_limita_y_completa_titulo():
    raw = [
        {"clave": "t1", "titulo": "Obra", "texto": "Se revisó el avance."},
        {"clave": "t2", "texto": "Sin título. Continuación."},
        {"texto": ""},
    ]
    out = _normalize_temas(raw)
    assert len(out) == 2
    assert out[0]["clave"] == "t1"
    assert out[1]["titulo"].startswith("Sin título")


def test_parse_temas_json_con_fence():
    raw = """```json
    {"temas":[{"clave":"a1","titulo":"Pavimento","texto":"Se acordó priorizar el tramo.","interviniente":null}]}
    ```"""
    temas = _parse_temas_json(raw)
    assert len(temas) == 1
    assert temas[0]["clave"] == "a1"
    assert "pavimento" in temas[0]["titulo"].lower()


def test_should_synthesize_por_intervalo_y_chars():
    # Primera síntesis: basta con suficiente transcripción
    sesion = {"transcripcion": "x" * 200, "ultima_sintesis_en": None}
    assert _should_synthesize(sesion, new_chars=50, force=False) is True
    assert _should_synthesize({"transcripcion": "corto"}, 10, False) is False
    # Force siempre
    assert _should_synthesize({"transcripcion": "y" * 200}, 0, True) is True
    # Con síntesis previa reciente y pocos chars nuevos → no
    recent = {
        "transcripcion": "z" * 500,
        "ultima_sintesis_en": "2099-01-01T00:00:00+00:00",
    }
    assert _should_synthesize(recent, new_chars=10, force=False) is False


def test_max_temas_constante():
    assert MAX_TEMAS == 12


def test_speech_status_sin_clave(monkeypatch):
    monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
    st = speech_status()
    assert st["stt_disponible"] is False
    assert st["acepta_transcripcion_cliente"] is True
