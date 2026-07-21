"""Destinatarios del correo resumen jornada."""
from main import _destinatarios_resumen_jornada


def test_resumen_jornada_incluye_desarrollador(monkeypatch):
    monkeypatch.setattr(
        "main._ids_cargo_por_nombre",
        lambda n: [99] if n == "desarrollador" else [],
    )
    monkeypatch.setattr(
        "main._usuarios_activos_por_cargos",
        lambda ids: [{"id": 1}] if 99 in ids else [],
    )
    monkeypatch.setattr("main._ids_rol_por_nombre", lambda n: [])
    monkeypatch.setattr("main._usuarios_activos_por_roles", lambda ids: [])
    assert _destinatarios_resumen_jornada(2) == [1]


def test_resumen_jornada_contratista_gerencial_vinculado(monkeypatch):
    monkeypatch.setattr("main._ids_cargo_por_nombre", lambda n: [])
    monkeypatch.setattr("main._usuarios_activos_por_cargos", lambda ids: [])
    monkeypatch.setattr(
        "main._ids_rol_por_nombre",
        lambda n: [7] if n == "contratista gerencial" else [],
    )
    monkeypatch.setattr(
        "main._usuarios_activos_por_roles",
        lambda ids: [{"id": 50, "rol_id": 7}],
    )
    monkeypatch.setattr("main._usuario_vinculado_a_contrato", lambda uid, cid: uid == 50 and cid == 3)
    assert _destinatarios_resumen_jornada(3) == [50]
    assert _destinatarios_resumen_jornada(99) == []
