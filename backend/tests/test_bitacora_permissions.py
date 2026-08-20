"""Tests permisos Bitácora (matriz Control de accesos)."""
from __future__ import annotations

import bitacora_permissions as bp


def test_desarrollador_tiene_permiso(monkeypatch):
    user = {"sub": "1", "cargo_nombre": "Desarrollador"}
    monkeypatch.setattr(bp, "_es_desarrollador_seguro", lambda *_a, **_k: True)
    assert bp.tiene_permiso_bitacora(user, "crear") is True
    assert bp.tiene_permiso_bitacora(user, "eliminar") is True


def test_sin_matriz_deniega(monkeypatch):
    user = {"sub": "2", "cargo_nombre": "Residente"}
    monkeypatch.setattr(bp, "_es_desarrollador_seguro", lambda *_a, **_k: False)
    monkeypatch.setattr(bp, "_cargo_permiso_bitacora", lambda *_a, **_k: False)
    assert bp.tiene_permiso_bitacora(user, "crear") is False
