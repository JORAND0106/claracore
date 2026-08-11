"""Permiso para POST /presupuesto/{id}/sincronizar-vlr-unitario."""


def test_puede_sincronizar_vlr_desarrollador(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: False)
    monkeypatch.setattr(main, "_cargo_permiso_crear_registros_presupuesto", lambda *_a, **_k: False)
    assert main._puede_sincronizar_vlr_unitario({"sub": "1"}, 2) is True


def test_puede_sincronizar_vlr_con_editar(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: True)
    monkeypatch.setattr(main, "_cargo_permiso_crear_registros_presupuesto", lambda *_a, **_k: False)
    assert main._puede_sincronizar_vlr_unitario({"sub": "9"}, 2) is True


def test_puede_sincronizar_vlr_con_crear(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: False)
    monkeypatch.setattr(main, "_cargo_permiso_crear_registros_presupuesto", lambda *_a, **_k: True)
    assert main._puede_sincronizar_vlr_unitario({"sub": "9"}, 2) is True


def test_puede_sincronizar_vlr_sin_permiso(monkeypatch):
    import main

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(main, "_cargo_permiso_editar_registros_presupuesto", lambda *_a, **_k: False)
    monkeypatch.setattr(main, "_cargo_permiso_crear_registros_presupuesto", lambda *_a, **_k: False)
    assert main._puede_sincronizar_vlr_unitario({"sub": "9"}, 2) is False
