"""Tests: Azure STT + checkpoints auto/manual/final de Temas con tramos y reintento."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from acta_grabacion_live_service import (
    COLA_OVERLAP_CHARS,
    MAX_TEMAS,
    MAX_TRANSCRIPT_CHARS,
    MAX_TRAMO_INTENTOS,
    MSG_SCHEMA_LIVE,
    TRAMO_MIN_CHARS,
    _cola_desde_tramos,
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


def test_cola_desde_tramos_usa_solape():
    prev = {
        "estado": "listo",
        "transcripcion": "x" * 100 + "IDEA INCONCLUSA SOBRE PAVIMENTO",
    }
    cola = _cola_desde_tramos([prev], " Ignorado", 0)
    assert cola.endswith("IDEA INCONCLUSA SOBRE PAVIMENTO")
    assert len(cola) <= COLA_OVERLAP_CHARS


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
    assert MAX_TRAMO_INTENTOS >= 3


def test_max_temas_constante():
    assert MAX_TEMAS == 12


def test_speech_status_sin_clave(monkeypatch):
    monkeypatch.delenv("AZURE_SPEECH_KEY", raising=False)
    st = speech_status()
    assert st["stt_disponible"] is False
    assert st["acepta_transcripcion_cliente"] is False
    assert st["checkpoint_auto_segundos"] == 300
    assert "AZURE" in (st["detalle"] or "").upper()


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
        self._order = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = dict(payload) if isinstance(payload, dict) else payload
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def order(self, col):
        self._order = col
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = dict(payload)
        return self

    def execute(self):
        rows = list(self._store.get(self._table) or [])
        if self._op == "insert":
            if self._table not in self._store:
                self._store[self._table] = []
            row = dict(self._payload or {})
            if row.get("id") is None:
                nxt = max([int(r.get("id") or 0) for r in self._store[self._table]] or [0]) + 1
                row["id"] = nxt
            self._store[self._table].append(row)
            return _Resp([row])
        for col, val in self._filters:
            rows = [r for r in rows if r.get(col) == val or str(r.get(col)) == str(val)]
        if self._order:
            rows = sorted(rows, key=lambda r: r.get(self._order) or 0)
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
            "ultimo_tramo_estado": None,
            "tramos_error_count": 0,
        }],
        "acta_grabacion_tramo": [],
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
        svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5, origen="manual")
    )
    assert out["sintetizado"] is True
    assert out["temas"][0]["clave"] == "t1"
    cp2 = out["checkpoint_chars"]
    assert cp2 > cp1
    assert cp2 == len(store["acta_grabacion_sesion"][0]["transcripcion"])
    assert len(store["acta_grabacion_tramo"]) == 1
    assert store["acta_grabacion_tramo"][0]["estado"] == "listo"
    assert store["acta_grabacion_tramo"][0]["origen"] == "manual"
    assert out["tramos_resumen"]["listo"] == 1

    # Segundo Actualizar sin audio nuevo → no sintetiza
    out2 = asyncio.run(
        svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5, origen="auto")
    )
    assert out2["sintetizado"] is False
    assert out2["checkpoint_chars"] == cp2


def test_fallo_sintesis_deja_tramo_pendiente_y_reintento(monkeypatch):
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
            "temas_escucha_activa": True,
            "ultimo_tramo_estado": None,
            "tramos_error_count": 0,
        }],
        "acta_grabacion_tramo": [],
    }
    sb = _FakeSB(store)
    asyncio.run(
        svc.ingest_transcript_delta(
            sb, 10, 1, 5,
            "Primera parte de la idea sobre el drenaje pluvial del sector oriente.",
        )
    )

    calls = {"n": 0}

    async def flaky_sint(texto, previos, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise HTTPException(status_code=502, detail="No se pudo sintetizar los temas con IA.")
        assert kwargs.get("solo_tramo") is True
        return [{"clave": "t1", "titulo": "Drenaje", "texto": texto[:80], "interviniente": None}]

    monkeypatch.setattr(svc, "sintetizar_temas", flaky_sint)

    out_fail = asyncio.run(svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5, origen="auto"))
    assert out_fail["sintetizado"] is False
    assert store["acta_grabacion_tramo"][0]["estado"] == "error"
    assert store["acta_grabacion_sesion"][0]["ultimo_tramo_estado"] == "error"
    # Checkpoint avanzó (texto reclamado en el tramo) para no perderlo
    assert store["acta_grabacion_sesion"][0]["checkpoint_chars"] == len(
        store["acta_grabacion_sesion"][0]["transcripcion"]
    )

    out_ok = asyncio.run(svc.reintentar_tramo(sb, 10, 1, 5))
    assert out_ok["sintetizado"] is True
    assert store["acta_grabacion_tramo"][0]["estado"] == "listo"
    assert out_ok["temas"][0]["clave"] == "t1"


def test_continuidad_entre_tramos_pasa_cola(monkeypatch):
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
            "temas_escucha_activa": True,
            "ultimo_tramo_estado": None,
            "tramos_error_count": 0,
        }],
        "acta_grabacion_tramo": [],
    }
    sb = _FakeSB(store)
    t1 = "Se inició la discusión del refuerzo estructural del puente que atraviesa "
    t2 = "el río y se acordó priorizar la intervención en el estribo norte."
    asyncio.run(svc.ingest_transcript_delta(sb, 10, 1, 5, t1 + ("x" * 20)))

    seen = []

    async def capture_sint(texto, previos, **kwargs):
        seen.append({
            "texto": texto,
            "cola": kwargs.get("cola_previa") or "",
            "previos": list(previos or []),
        })
        if not previos:
            return [{"clave": "t1", "titulo": "Puente", "texto": "Discusión iniciada", "interviniente": None}]
        return [{"clave": "t1", "titulo": "Puente", "texto": "Discusión unificada del refuerzo", "interviniente": None}]

    monkeypatch.setattr(svc, "sintetizar_temas", capture_sint)
    asyncio.run(svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5, origen="auto"))

    asyncio.run(svc.ingest_transcript_delta(sb, 10, 1, 5, t2 + ("y" * 20)))
    out2 = asyncio.run(svc.actualizar_temas_desde_checkpoint(sb, 10, 1, 5, origen="final"))
    assert out2["sintetizado"] is True
    assert len(seen) == 2
    assert seen[1]["cola"]
    assert "puente" in seen[1]["cola"].lower() or "refuerzo" in seen[1]["cola"].lower()
    assert len(out2["temas"]) == 1
    assert out2["temas"][0]["clave"] == "t1"
    assert "unificada" in out2["temas"][0]["texto"].lower()
