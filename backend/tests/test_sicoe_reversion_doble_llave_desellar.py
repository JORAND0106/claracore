"""Reversión doble llave: desellar, carrera y recuperación de ambas llaves atascadas."""
from unittest.mock import MagicMock

import main as m


def test_ambas_llaves_listas():
    assert m._sicoe_reversion_ambas_llaves_listas(27, 38) is True
    assert m._sicoe_reversion_ambas_llaves_listas(27, 27) is False
    assert m._sicoe_reversion_ambas_llaves_listas(27, None) is False
    assert m._sicoe_reversion_ambas_llaves_listas(None, 38) is False


def test_filtro_elegibles_incluye_ambas_llaves_sellado_para_recuperacion(monkeypatch):
    monkeypatch.setattr(m, "_sicoe_db_nivel_validacion_usuario", lambda *_a, **_k: 3)
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_registro_reversion_bloqueada_por_aprobacion_nivel6", lambda *_a, **_k: False)
    monkeypatch.setattr(m, "_es_desarrollador", lambda *_a, **_k: False)

    # Escenario real (prod): id 60924 — ambas llaves, sigue bloqueado.
    candidatos = [
        {
            "id": 60924,
            "bloqueado": True,
            "reversion_arm_n2_usuario_id": 27,
            "reversion_arm_n3_usuario_id": 38,
            "nivel4_estado": "Aprobado",
        }
    ]
    elegibles, omitidos = m._sicoe_filtrar_filas_elegibles_reversion(
        3, candidatos, {"sub": 38, "id": 38}
    )
    assert omitidos == 0
    assert len(elegibles) == 1
    assert elegibles[0]["id"] == 60924


def test_filtro_elegibles_omite_misma_persona_dos_llaves(monkeypatch):
    monkeypatch.setattr(m, "_sicoe_db_nivel_validacion_usuario", lambda *_a, **_k: 2)
    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_registro_reversion_bloqueada_por_aprobacion_nivel6", lambda *_a, **_k: False)
    monkeypatch.setattr(m, "_es_desarrollador", lambda *_a, **_k: False)
    candidatos = [
        {
            "id": 1,
            "bloqueado": True,
            "reversion_arm_n2_usuario_id": 9,
            "reversion_arm_n3_usuario_id": 9,
        }
    ]
    elegibles, omitidos = m._sicoe_filtrar_filas_elegibles_reversion(
        3, candidatos, {"sub": 9, "id": 9}
    )
    assert elegibles == []
    assert omitidos == 1


def _cd():
    return {
        "mensaje": "Completar desbloqueo de prueba",
        "destinatarios": [{"id": 99, "nombre": "Destino"}],
    }


def test_procesar_recuperacion_ambas_llaves_desella(monkeypatch):
    """Si N2 y N3 ya están y el registro sigue sellado, un validador completa el desbloqueo."""
    updates = []

    row = {
        "id": 60924,
        "bloqueado": True,
        "contrato_id": 3,
        "reversion_arm_n2_usuario_id": 27,
        "reversion_arm_n3_usuario_id": 38,
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": "Aprobado",
        "nivel4_estado": "Aprobado",
        "nivel5_estado": "No Revisado",
        "nivel6_estado": "No Revisado",
    }

    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_registro_reversion_bloqueada_por_aprobacion_nivel6", lambda *_a, **_k: False)
    monkeypatch.setattr(m, "_so_registro_fetch_validacion_audit", lambda *_a, **_k: dict(row))
    monkeypatch.setattr(m, "_so_registro_validacion_audit_snapshot", lambda x: x)
    monkeypatch.setattr(m, "_sicoe_db_nivel_validacion_usuario", lambda *_a, **_k: 4)
    monkeypatch.setattr(m, "_es_desarrollador", lambda *_a, **_k: False)
    monkeypatch.setattr(m, "_require_llave_reversion_sicoe_nivel", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_get_nivel_maximo_contrato", lambda *_a, **_k: "nivel4_estado")
    monkeypatch.setattr(m, "_insertar_comentario", lambda *_a, **_k: {"id": 1})
    monkeypatch.setattr(m, "_push_notif_validacion_sicoe_destinatarios", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_aplicar_acta_rpo_vigente_a_registro", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_audit_user_contrato", lambda u, *_a, **_k: u)
    monkeypatch.setattr(m, "registrar_log", lambda *_a, **_k: None)

    class _Q:
        def __init__(self):
            self._payload = None

        def update(self, payload):
            self._payload = payload
            updates.append(dict(payload))
            return self

        def eq(self, *_a, **_k):
            return self

        def is_(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=[{"id": 60924}])

    monkeypatch.setattr(m, "supabase", MagicMock(**{"table.return_value": _Q()}))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    res = m._sicoe_reversion_doble_llave_procesar_registro(
        3, 60924, 38, {"sub": 38, "id": 38}, _cd(), row=row
    )
    assert res["ok"] is True
    assert res["ejecutada"] is True
    assert res["recuperacion"] is True
    assert len(updates) == 1
    assert updates[0]["bloqueado"] is False
    assert updates[0]["nivel4_estado"] == "No Revisado"
    assert updates[0]["reversion_arm_n2_usuario_id"] is None
    assert updates[0]["reversion_arm_n3_usuario_id"] is None


def test_procesar_carrera_releer_y_desellar(monkeypatch):
    """Tras grabar la 1ª llave, si la contraparte ya escribió la suya, desella en el mismo request."""
    updates = []
    row = {
        "id": 100,
        "bloqueado": True,
        "contrato_id": 3,
        "reversion_arm_n2_usuario_id": None,
        "reversion_arm_n3_usuario_id": None,
        "nivel4_estado": "Aprobado",
    }
    row_after = {
        **row,
        "reversion_arm_n2_usuario_id": 27,
        "reversion_arm_n3_usuario_id": 38,
    }

    monkeypatch.setattr(m, "_registro_nivel_max_aprobado", lambda *_a, **_k: True)
    monkeypatch.setattr(m, "_registro_reversion_bloqueada_por_aprobacion_nivel6", lambda *_a, **_k: False)
    monkeypatch.setattr(m, "_so_registro_fetch_validacion_audit", lambda *_a, **_k: dict(row))
    monkeypatch.setattr(m, "_so_registro_validacion_audit_snapshot", lambda x: x)
    monkeypatch.setattr(m, "_sicoe_db_nivel_validacion_usuario", lambda *_a, **_k: 3)
    monkeypatch.setattr(m, "_es_desarrollador", lambda *_a, **_k: False)
    monkeypatch.setattr(m, "_require_llave_reversion_sicoe_nivel", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_get_nivel_maximo_contrato", lambda *_a, **_k: "nivel4_estado")
    monkeypatch.setattr(m, "_insertar_comentario", lambda *_a, **_k: {"id": 1})
    monkeypatch.setattr(m, "_push_notif_validacion_sicoe_destinatarios", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_aplicar_acta_rpo_vigente_a_registro", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_audit_user_contrato", lambda u, *_a, **_k: u)
    monkeypatch.setattr(m, "registrar_log", lambda *_a, **_k: None)
    monkeypatch.setattr(m, "_sicoe_reversion_fetch_arms_row", lambda *_a, **_k: dict(row_after))

    class _Q:
        def update(self, payload):
            updates.append(dict(payload))
            return self

        def eq(self, *_a, **_k):
            return self

        def is_(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=[{"id": 100}])

    monkeypatch.setattr(m, "supabase", MagicMock(**{"table.return_value": _Q()}))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    res = m._sicoe_reversion_doble_llave_procesar_registro(
        3, 100, 38, {"sub": 38, "id": 38}, _cd(), row=row
    )
    assert res["ok"] is True
    assert res["ejecutada"] is True
    # 1) escribe arm_n3  2) desellar tras releer
    assert len(updates) == 2
    assert updates[0] == {"reversion_arm_n3_usuario_id": 38}
    assert updates[1]["bloqueado"] is False
    assert updates[1]["reversion_arm_n2_usuario_id"] is None
