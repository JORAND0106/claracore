"""Persistencia del toggle Bitácora↔RRHH: columna DDL o fallback JSON."""
from __future__ import annotations

import bitacora_service as svc


class _ExcQ:
    def __init__(self, exc):
        self._exc = exc

    def select(self, *_a, **_k):
        return self

    def update(self, payload):
        self.last_update = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        raise self._exc


class _OkQ:
    def __init__(self, rows=None, *, capture=None):
        self._rows = list(rows or [])
        self._capture = capture
        self._payload = None

    def select(self, cols, *_a, **_k):
        self._cols = cols
        return self

    def update(self, payload):
        self._payload = payload
        if self._capture is not None:
            self._capture["update"] = payload
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._payload is not None and self._rows:
            # Simula update en memoria para ccd_firma_config
            row = dict(self._rows[0])
            row.update(self._payload)
            self._rows[0] = row
        return type("R", (), {"data": list(self._rows)})()


def test_set_usa_columna_cuando_existe(monkeypatch):
    svc._FLAG_ASISTENCIA_RRHH_SCHEMA["ok"] = None
    svc._FLAG_ASISTENCIA_RRHH_SCHEMA["ts"] = 0.0
    capture = {}

    class Sb:
        def table(self, name):
            assert name == "contratos"
            return _OkQ(
                [{"id": 3, "bitacora_asistencia_rrhh_activa": False}],
                capture=capture,
            )

        def rpc(self, *_a, **_k):
            return type("R", (), {"execute": lambda self: None})()

    out = svc.set_asistencia_rrhh_activa(Sb(), 3, True)
    assert out is True
    assert capture.get("update") == {"bitacora_asistencia_rrhh_activa": True}


def test_set_fallback_json_si_columna_ausente(monkeypatch):
    svc._FLAG_ASISTENCIA_RRHH_SCHEMA["ok"] = None
    svc._FLAG_ASISTENCIA_RRHH_SCHEMA["ts"] = 0.0
    missing = Exception(
        "Could not find the 'bitacora_asistencia_rrhh_activa' column of 'contratos' "
        "in the schema cache (PGRST204)"
    )
    store = {
        "rows": [{"id": 3, "ccd_firma_config": {"FO-X": {"elaboro_nombre": "A"}}}],
    }
    calls = {"select_col": 0}

    class Sb:
        def table(self, name):
            assert name == "contratos"

            class Q:
                def __init__(self):
                    self._mode = None
                    self._payload = None

                def select(self, cols, *_a, **_k):
                    self._cols = cols
                    if "bitacora_asistencia_rrhh_activa" in str(cols):
                        calls["select_col"] += 1
                        self._mode = "missing"
                    else:
                        self._mode = "ok"
                    return self

                def update(self, payload):
                    self._payload = payload
                    return self

                def eq(self, *_a, **_k):
                    return self

                def limit(self, *_a, **_k):
                    return self

                def execute(self):
                    if self._mode == "missing":
                        raise missing
                    if self._payload is not None:
                        row = dict(store["rows"][0])
                        if "ccd_firma_config" in self._payload:
                            row["ccd_firma_config"] = self._payload["ccd_firma_config"]
                        store["rows"][0] = row
                        return type("R", (), {"data": [row]})()
                    return type("R", (), {"data": list(store["rows"])})()

            return Q()

        def rpc(self, *_a, **_k):
            return type("R", (), {"execute": lambda self: None})()

    monkeypatch.setattr(
        svc, "_ensure_asistencia_rrhh_column",
        lambda _sb: False,
    )

    out = svc.set_asistencia_rrhh_activa(Sb(), 3, True)
    assert out is True
    cfg = store["rows"][0]["ccd_firma_config"]
    assert cfg["FO-X"]["elaboro_nombre"] == "A"
    assert cfg[svc._FLAG_ASISTENCIA_RRHH_FALLBACK_KEY] is True

    # Lectura vía fallback
    monkeypatch.setattr(svc, "_ensure_asistencia_rrhh_column", lambda _sb: False)
    assert svc._leer_flag_asistencia_rrhh_activa(Sb(), 3) is True


def test_leer_false_si_fallback_vacio(monkeypatch):
    svc._FLAG_ASISTENCIA_RRHH_SCHEMA["ok"] = False
    svc._FLAG_ASISTENCIA_RRHH_SCHEMA["ts"] = __import__("time").monotonic()
    monkeypatch.setattr(svc, "_ensure_asistencia_rrhh_column", lambda _sb: False)

    class Sb:
        def table(self, name):
            return _OkQ([{"id": 3, "ccd_firma_config": {}}])

    assert svc._leer_flag_asistencia_rrhh_activa(Sb(), 3) is False
