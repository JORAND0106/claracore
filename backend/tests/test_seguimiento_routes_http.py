"""HTTP: rutas Seguimiento registradas y creación de acta/tarea (sin Not Found)."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiJ9.e30.x")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")


@pytest.fixture()
def client(monkeypatch):
    import main
    import seguimiento_permissions as perm
    import seguimiento_routes as sr
    from fastapi.testclient import TestClient

    app = main._fastapi_app
    app.dependency_overrides[main.get_current_user] = lambda: {
        "sub": "1",
        "cargo_nombre": "Desarrollador",
        "rol_nombre": "Desarrollador",
        "contrato_id": 1,
    }
    monkeypatch.setattr(sr, "require_permiso_seguimiento", lambda *a, **k: None)
    monkeypatch.setattr(sr, "tiene_permiso_seguimiento", lambda *a, **k: True)
    monkeypatch.setattr(sr, "_check_contrato", lambda *a, **k: None)
    monkeypatch.setattr(main, "_require_contract_access", lambda *a, **k: None)
    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(perm, "_cargo_permiso_seguimiento", lambda *a, **k: True)
    monkeypatch.setattr(sr, "list_bandeja", lambda *a, **k: [{"id": 1, "titulo": "B", "origen": "tarea"}])
    monkeypatch.setattr(sr, "proximo_consecutivo", lambda *a, **k: 7)
    monkeypatch.setattr(
        sr,
        "crear_tarea",
        lambda sb, data, uid: {
            "id": 99,
            "titulo": data["titulo"],
            "origen": "tarea",
            "campos_libres": data.get("campos_libres") or {},
        },
    )
    monkeypatch.setattr(
        sr,
        "create_acta",
        lambda sb, cid, data, uid: {
            "id": 55,
            "consecutivo": 7,
            "contrato_id": cid,
            "ubicacion": data.get("ubicacion"),
        },
    )
    monkeypatch.setattr(sr, "registrar_log", lambda *a, **k: None)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_bandeja_no_not_found(client):
    r = client.get("/seguimiento/bandeja")
    assert r.status_code == 200
    assert r.json()[0]["titulo"] == "B"


def test_proximo_consecutivo_no_not_found(client):
    r = client.get("/seguimiento/1/actas/proximo-consecutivo")
    assert r.status_code == 200
    assert r.json()["consecutivo"] == 7


def test_crear_tarea_ok(client):
    r = client.post(
        "/seguimiento/tareas",
        json={
            "titulo": "Tarea real test",
            "fecha_vencimiento": "2026-08-01",
            "campos_libres": {"prioridad": 2, "destinatario_tentativo_nombre": "Ana"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["titulo"] == "Tarea real test"
    assert body["campos_libres"]["prioridad"] == 2


def test_crear_acta_ok(client):
    r = client.post(
        "/seguimiento/1/actas",
        json={"fecha_reunion": "2026-07-26", "ubicacion": "Sala test"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ubicacion"] == "Sala test"
    assert body["consecutivo"] == 7


def test_static_routes_registered_before_param_routes():
    import main

    order = []
    for r in main._fastapi_app.routes:
        if type(r).__name__ != "_IncludedRouter":
            continue
        for sub in getattr(r, "routes", []) or []:
            p = getattr(sub, "path", None)
            if p and p.startswith("/seguimiento"):
                order.append(p)
    # Fallback: inspect router module directly
    if not order:
        import seguimiento_routes as sr

        order = [getattr(x, "path", "") for x in sr.router.routes]
    assert "/seguimiento/bandeja" in order
    assert "/seguimiento/tareas" in order
    assert order.index("/seguimiento/bandeja") < order.index("/seguimiento/{contrato_id}/actas")
