"""Cliente Supabase thread-local: evita 401 por httpx compartido entre hilos."""
from __future__ import annotations

import os
import threading

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiJ9.e30.x")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")

import main as m  # noqa: E402


class _FakeErr(Exception):
    def __init__(self, code=None, message=""):
        super().__init__(message or code or "err")
        self.code = code


def test_is_supabase_auth_error_detects_jwt_and_401():
    assert m._is_supabase_auth_error(_FakeErr("PGRST301", "Invalid JWT"))
    assert m._is_supabase_auth_error(_FakeErr("401", "Unauthorized"))
    assert m._is_supabase_auth_error(Exception("httpx 401 Unauthorized invalid jwt"))
    assert not m._is_supabase_auth_error(Exception("column does not exist"))


def test_get_supabase_is_thread_local(monkeypatch):
    created = []

    def fake_make():
        obj = object()
        created.append((threading.get_ident(), obj))
        return obj

    monkeypatch.setattr(m, "_make_supabase_client", fake_make)
    # Limpiar TLS del hilo actual
    m._supabase_tls.client = None

    a = m.get_supabase()
    b = m.get_supabase()
    assert a is b

    other = {}

    def in_thread():
        m._supabase_tls.client = None
        other["client"] = m.get_supabase()

    t = threading.Thread(target=in_thread)
    t.start()
    t.join()
    assert other["client"] is not a
    assert len(created) >= 2


def test_proxy_routes_to_thread_local(monkeypatch):
    class Stub:
        def table(self, name):
            return f"stub:{name}:{id(self)}"

    monkeypatch.setattr(m, "_make_supabase_client", lambda: Stub())
    m._supabase_tls.client = None
    assert m.supabase.table("usuarios").startswith("stub:usuarios:")


def test_supabase_execute_resets_on_auth_error(monkeypatch):
    calls = {"n": 0, "resets": 0}

    def boom_then_ok():
        calls["n"] += 1
        if calls["n"] == 1:
            raise _FakeErr("PGRST301", "Invalid JWT")
        return {"ok": True}

    monkeypatch.setattr(m, "reset_supabase_client", lambda: calls.__setitem__("resets", calls["resets"] + 1))
    monkeypatch.setattr(m, "registrar_log_sistema", lambda *a, **k: None)
    out = m.supabase_execute(boom_then_ok, retries=3, delay=0)
    assert out == {"ok": True}
    assert calls["resets"] >= 1
