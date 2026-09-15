"""Tests: STT + checkpoints manuales de Temas (sin síntesis periódica)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from acta_grabacion_live_service import (
    MAX_TEMAS,
    MAX_TRANSCRIPT_CHARS,
    MSG_SCHEMA_LIVE,
    TRAMO_MIN_CHARS,
    _is_missing_live_column_error,
    _merge_temas_por_clave,
    _normalize_temas,
    _parse_temas_json,
    append_transcript,
    append_transcript_tracking_checkpoint,
    speech_status,
    tramo_desde_checkpoint,
)


def test_append_transcript_une_deltas():
    assert append_transcript("", "Hola") == "Hola"
    assert append_transcript("Hola", "mundo") == "Hola mundo"


def test_append_tracking_ajusta_checkpoint_al_truncar():
    base = "a" * (MAX_TRANSCRIPT_CHARS - 10)
    merged, cp = append_transcript_tracking_checkpoint(base, "b" * 50, checkpoint_chars=100)
    assert len(merged) == MAX_TRANSCRIPT_CHARS
    assert cp < 100
    assert cp >= 0


def test_tramo_desde_checkpoint_no_reprocesa():
    text = "AAAA BBBB CCCC"
    assert tramo_desde_checkpoint(text, 0) == text
    assert tramo_desde_checkpoint(text, 5) == "BBBB CCCC"
    assert tramo_desde_checkpoint(text, 999) == ""
    assert tramo_desde_checkpoint(text, 5) != text


def test_merge_temas_por_clave_actualiza_y_agrega():
    prev = [{"clave": "t1", "titulo": "A", "texto": "viejo", "interviniente": None}]
    nuevos = [
        {"clave": "t1", "titulo": "A", "texto": "actualizado", "interviniente": "Ana"},
        {"clave": "t2", "titulo": "B", "texto": "nuevo", "interviniente": None},
    ]
    out = _merge_temas_por_clave(prev, nuevos)
    assert len(out) == 2
    assert out[0]["texto"] == "actualizado"
    assert out[0]["interviniente"] == "Ana"
    assert out[1]["clave"] == "t2"


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


def test_tramo_min_chars():
    assert TRAMO_MIN_CHARS == 40


def test_max_temas_constante():
    assert MAX_TEMAS == 12


def test_speech_status_sin_clave(monkeypatch):
    monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
    st = speech_status()
    assert st["stt_disponible"] is False
    assert st["acepta_transcripcion_cliente"] is True


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQ:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._payload = None
        self._op = "select"

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = dict(payload)
        return self

    def execute(self):
        rows = list(self._store.get(self._table) or [])
        for col, val in self._filters:
            rows = [r for r in rows if r.get(col) == val or str(r.get(col)) == str(val)]
        if self._op == "update" and self._payload is not None:
            for r in rows:
                r.update(self._payload)
            return _Resp(rows)
        return _Resp(rows)


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQ(self.store, name)

    def rpc(self, *_a, **_k):
        raise RuntimeError("rpc no disponible en fake")


class _MissingLiveColError(Exception):
    """Simula APIError PostgREST PGRST204."""

    def __init__(self, message: str, code: str = "PGRST204"):
        super().__init__({"message": message, "code": code, "hint": None, "details": None})
        self.code = code
        self.message = message


class _FakeQMissingLive(_FakeQ):
    """Select/update de columnas live falla con PGRST204 (schema sin migración)."""

    def select(self, cols="*", *_a, **_k):
        self._op = "select"
        self._select_cols = cols
        return self

    def execute(self):
        cols = getattr(self, "_select_cols", "*") or "*"
        if self._op == "select" and cols != "*" and "transcripcion" in str(cols):
            raise _MissingLiveColError(
                "Could not find the 'transcripcion' column of "
                "'acta_grabacion_sesion' in the schema cache"
            )
        if self._op == "update" and self._payload is not None:
            for key in ("transcripcion", "temas_propuestos", "checkpoint_chars",
                        "temas_escucha_activa", "ultima_sintesis_en"):
                if key in self._payload:
                    raise _MissingLiveColError(
                        f"Could not find the '{key}' column of "
                        "'acta_grabacion_sesion' in the schema cache"
                    )
        return super().execute()


class _FakeSBMissingLive(_FakeSB):
    def table(self, name):
        return _FakeQMissingLive(self.store, name)


def test_is_missing_live_column_detecta_pgrst204():
    exc = _MissingLiveColError(
        "Could not find the 'transcripcion' column of "
        "'acta_grabacion_sesion' in the schema cache"
    )
    assert _is_missing_live_column_error(exc) is True
    assert _is_missing_live_column_error(RuntimeError("otro error")) is False


def test_ingest_soft_fail_si_faltan_columnas_live(monkeypatch):
    """La grabación (cupo) no debe tumbarse por PGRST204 en transcripcion."""
    import asyncio
    import acta_grabacion_live_service as svc

    svc._live_schema_ok = None
    store = {
        "acta_grabacion_sesion": [{
            "id": 1,
            "contrato_id": 10,
            "usuario_id": 5,
            "estado": "activa",
            "transcripcion": "",
            "temas_propuestos": [],
            "checkpoint_chars": 0,
            "temas_escucha_activa": False,
        }],
    }
    sb = _FakeSBMissingLive(store)
    out = asyncio.run(
        svc.ingest_transcript_delta(sb, 10, 1, 5, "Texto de prueba de la reunión en curso.")
    )
    assert out.get("schema_live_ok") is False
    assert MSG_SCHEMA_LIVE in (out.get("detalle") or "")
    # No se escribió (columna ausente); sesión sigue activa
    assert store["acta_grabacion_sesion"][0]["transcripcion"] == ""
    assert store["acta_grabacion_sesion"][0]["estado"] == "activa"


def test_armar_checkpoint_503_si_faltan_columnas_live():
    import acta_grabacion_live_service as svc

    svc._live_schema_ok = None
    store = {
        "acta_grabacion_sesion": [{
            "id": 1,
            "contrato_id": 10,
            "usuario_id": 5,
            "estado": "activa",
            "transcripcion": "algo",
            "temas_propuestos": [],
            "checkpoint_chars": 0,
            "temas_escucha_activa": False,
        }],
    }
    sb = _FakeSBMissingLive(store)
    with pytest.raises(HTTPException) as ei:
        svc.armar_checkpoint_temas(sb, 10, 1, 5)
    assert ei.value.status_code == 503
    assert "transcripcion" in str(ei.value.detail).lower() or "columnas" in str(ei.value.detail).lower()


def test_leer_estado_vivo_reporta_schema_live_ok_false():
    import acta_grabacion_live_service as svc

    svc._live_schema_ok = None
    store = {
        "acta_grabacion_sesion": [{
            "id": 1,
            "contrato_id": 10,
            "usuario_id": 5,
            "estado": "activa",
            "transcripcion": "",
            "temas_propuestos": [],
            "checkpoint_chars": 0,
            "temas_escucha_activa": False,
        }],
    }
    out = svc.leer_estado_vivo(_FakeSBMissingLive(store), 10, 1, 5)
    assert out["schema_live_ok"] is False
    assert MSG_SCHEMA_LIVE in (out.get("detalle") or "")


def test_armar_y_actualizar_avanza_checkpoint_sin_reprocesar(monkeypatch):
    import asyncio
    import acta_grabacion_live_service as svc

    svc._live_schema_ok = None
    store = {
        "acta_grabacion_sesion": [{
            "id": 1,
            "contrato_id": 10,
            "usuario_id": 5,
            "estado": "activa",
            "transcripcion": "Intro previa que no debe analizarse. ",
            "temas_propuestos": [],
            "checkpoint_chars": 0,
            "temas_escucha_activa": False,
        }],
    }
    sb = _FakeSB(store)

    arm = svc.armar_checkpoint_temas(sb, 10, 1, 5)
    assert arm["temas_escucha_activa"] is True
    cp1 = arm["checkpoint_chars"]
    assert cp1 == len(store["acta_grabacion_sesion"][0]["transcripcion"])

    # Audio nuevo tras el checkpoint
    asyncio.run(
        svc.ingest_transcript_delta(sb, 10, 1, 5, "Se discutió el pavimento del tramo norte con detalle suficiente.")
    )
    assert store["acta_grabacion_sesion"][0]["checkpoint_chars"] == cp1

    async def fake_sint(*_a, **_k):
        return [{"clave": "t1", "titulo": "Pavimento", "texto": "Tramo norte", "interviniente": None}]

    monkeypatch.setattr(svc, "sintetizar_temas", fake_sint)
    out = asyncio.run(
        svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5)
    )
    assert out["sintetizado"] is True
    assert out["temas"][0]["clave"] == "t1"
    cp2 = out["checkpoint_chars"]
    assert cp2 > cp1
    assert cp2 == len(store["acta_grabacion_sesion"][0]["transcripcion"])

    # Segundo Actualizar sin audio nuevo → no sintetiza
    out2 = asyncio.run(
        svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5)
    )
    assert out2["sintetizado"] is False
    assert out2["checkpoint_chars"] == cp2
