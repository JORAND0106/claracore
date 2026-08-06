"""Desarrollador: acceso irrestricto a contratos en el selector de sesión."""
from unittest.mock import MagicMock


def test_get_usuario_contratos_desarrollador_ve_todos(monkeypatch):
    import main

    todos = [
        {"id": 1, "numero": "C-1"},
        {"id": 2, "numero": "C-2"},
        {"id": 99, "numero": "C-NUEVO"},
    ]
    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(
        main,
        "_listar_contratos_selector",
        lambda ids=None: todos if ids is None else [r for r in todos if r["id"] in set(ids or [])],
    )
    # No debe consultar usuario_contratos para el propio Desarrollador
    monkeypatch.setattr(main, "supabase", MagicMock())

    out = main.get_usuario_contratos(10, current_user={"sub": "10"})
    assert {r["id"] for r in out} == {1, 2, 99}
    main.supabase.table.assert_not_called()


def test_get_usuario_contratos_no_dev_solo_vinculos(monkeypatch):
    import main

    todos = [
        {"id": 1, "numero": "C-1"},
        {"id": 2, "numero": "C-2"},
    ]
    vinculados = [{"contrato_id": 1}]

    class _Uc:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=vinculados)

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: False)
    monkeypatch.setattr(
        main,
        "_listar_contratos_selector",
        lambda ids=None: todos if ids is None else [r for r in todos if r["id"] in set(ids or [])],
    )
    monkeypatch.setattr(main, "supabase", MagicMock(table=lambda _n: _Uc()))

    out = main.get_usuario_contratos(10, current_user={"sub": "10"})
    assert [r["id"] for r in out] == [1]


def test_get_usuario_contratos_admin_consulta_otro_mantiene_vinculos(monkeypatch):
    """Caller Desarrollador viendo UC de otro usuario: no expandir a todos."""
    import main

    todos = [
        {"id": 1, "numero": "C-1"},
        {"id": 2, "numero": "C-2"},
    ]
    vinculados = [{"contrato_id": 2}]

    class _Uc:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=vinculados)

    monkeypatch.setattr(main, "_es_desarrollador", lambda _u: True)
    monkeypatch.setattr(
        main,
        "_listar_contratos_selector",
        lambda ids=None: todos if ids is None else [r for r in todos if r["id"] in set(ids or [])],
    )
    monkeypatch.setattr(main, "supabase", MagicMock(table=lambda _n: _Uc()))

    out = main.get_usuario_contratos(99, current_user={"sub": "1"})
    assert [r["id"] for r in out] == [2]
