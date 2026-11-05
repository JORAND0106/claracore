"""Dictado del Plan: moderador registra a nombre del expositor (acta abierta)."""
from __future__ import annotations

import plan_actividades_dictado as dictado


def test_item_vinculado_a_tema_por_campos_top_level():
    assert dictado.item_vinculado_a_tema(
        {"acta_id": 10, "idea_id": 20},
        10,
        20,
    )
    assert not dictado.item_vinculado_a_tema(
        {"acta_id": 10, "idea_id": 99},
        10,
        20,
    )
    assert not dictado.item_vinculado_a_tema(
        {"acta_id": 11, "idea_id": 20},
        10,
        20,
    )


def test_item_vinculado_via_blob_plan():
    item = {
        "acta_id": 5,
        "campos_libres": {"plan": {"idea_id": 7, "acta_id": 5}},
    }
    assert dictado.item_vinculado_a_tema(item, 5, 7)
    assert not dictado.item_vinculado_a_tema(item, 5, 8)


def test_puede_mutar_dictado_exige_elaborador_y_acta_abierta(monkeypatch):
    item = {"id": 1, "acta_id": 9, "idea_id": 3, "created_by": 50}

    class _Q:
        def __init__(self, rows):
            self._rows = rows

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": self._rows})()

    class _Sb:
        def __init__(self, rows):
            self._rows = rows

        def table(self, _name):
            return _Q(self._rows)

    monkeypatch.setattr(
        "seguimiento_service._acta_esta_sellada",
        lambda acta: str(acta.get("estado") or "") in ("realizada", "firmada"),
    )

    sb_ok = _Sb([{"id": 9, "elaborador_id": 2, "estado": "borrador"}])
    assert dictado.puede_mutar_dictado(sb_ok, item, 2, acta_id=9, idea_id=3) is True
    assert dictado.puede_mutar_dictado(sb_ok, item, 99, acta_id=9, idea_id=3) is False

    sb_cerrada = _Sb([{"id": 9, "elaborador_id": 2, "estado": "realizada"}])
    assert dictado.puede_mutar_dictado(sb_cerrada, item, 2, acta_id=9, idea_id=3) is False

    otra = {"id": 2, "acta_id": 9, "idea_id": 99, "created_by": 50}
    assert dictado.puede_mutar_dictado(sb_ok, otra, 2, acta_id=9, idea_id=3) is False


def test_acumular_aviso_con_sesion_no_envia_inmediato(monkeypatch):
    calls = {"digest": 0, "inmediato": 0}

    def fake_digest(*_a, **_kwargs):
        calls["digest"] += 1

    def fake_email(*_a, **_kwargs):
        calls["inmediato"] += 1
        return True

    monkeypatch.setattr(dictado, "_upsert_digest", fake_digest)
    monkeypatch.setattr(dictado, "_enviar_email_dictado", fake_email)

    dictado.acumular_aviso_dictado(
        None,
        session_id="sess-abc",
        expositor_id=10,
        moderador_id=2,
        contrato_id=1,
        item_id=55,
        titulo="Revisar planos",
        accion="crear",
    )
    assert calls["digest"] == 1
    assert calls["inmediato"] == 0


def test_acumular_aviso_sin_sesion_envia_inmediato(monkeypatch):
    calls = {"notif": 0, "email": 0}

    def fake_notif(*_a, **_kwargs):
        calls["notif"] += 1

    monkeypatch.setattr(
        "seguimiento_service._notificar",
        fake_notif,
    )
    monkeypatch.setattr(
        dictado,
        "_enviar_email_dictado",
        lambda *_a, **_k: calls.__setitem__("email", calls["email"] + 1) or True,
    )

    dictado.acumular_aviso_dictado(
        None,
        session_id=None,
        expositor_id=10,
        moderador_id=2,
        contrato_id=1,
        item_id=55,
        titulo="Revisar planos",
        accion="editar",
    )
    assert calls["notif"] == 1
    assert calls["email"] == 1


def test_acumular_aviso_no_notifica_si_expositor_es_moderador(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(
        dictado,
        "_upsert_digest",
        lambda *_a, **_k: called.__setitem__("n", called["n"] + 1),
    )
    dictado.acumular_aviso_dictado(
        None,
        session_id="x",
        expositor_id=2,
        moderador_id=2,
        contrato_id=1,
        item_id=1,
        titulo="X",
        accion="crear",
    )
    assert called["n"] == 0
