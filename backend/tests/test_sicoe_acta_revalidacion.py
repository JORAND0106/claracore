"""Elección de acta al revalidar registro reversado."""
from sicoe_acta_revalidacion import (
    sicoe_acta_eleccion_requerida,
    sicoe_formatear_acta_opcion,
    sicoe_payload_desellar_con_acta_pre,
    sicoe_resolver_acta_elegida,
)


def test_eleccion_no_requerida_sin_pre():
    assert sicoe_acta_eleccion_requerida(acta_pre_reversion_id=None, acta_vigente_id=10) is False


def test_eleccion_no_requerida_misma_acta():
    assert sicoe_acta_eleccion_requerida(acta_pre_reversion_id=5, acta_vigente_id=5) is False


def test_eleccion_requerida_cuando_difieren():
    assert sicoe_acta_eleccion_requerida(acta_pre_reversion_id=1, acta_vigente_id=2) is True


def test_resolver_sin_pregunta_conserva_original():
    aid, err = sicoe_resolver_acta_elegida(
        eleccion=None, acta_original_id=7, acta_vigente_id=7
    )
    assert err is None
    assert aid == 7


def test_resolver_exige_eleccion():
    aid, err = sicoe_resolver_acta_elegida(
        eleccion=None, acta_original_id=1, acta_vigente_id=2
    )
    assert aid is None
    assert err == "eleccion_requerida"


def test_resolver_original_y_vigente():
    aid, err = sicoe_resolver_acta_elegida(
        eleccion="original", acta_original_id=1, acta_vigente_id=2
    )
    assert err is None and aid == 1
    aid2, err2 = sicoe_resolver_acta_elegida(
        eleccion="vigente", acta_original_id=1, acta_vigente_id=2
    )
    assert err2 is None and aid2 == 2


def test_desellar_guarda_pre_reversion_solo_una_vez():
    base = {"bloqueado": False, "nivel4_estado": "No Revisado"}
    out = sicoe_payload_desellar_con_acta_pre(
        base,
        acta_rpo_id_actual=12,
        acta_rpo_id_pre_reversion_actual=None,
    )
    assert out["acta_rpo_id_pre_reversion"] == 12
    assert "acta_rpo_id" not in out  # conserva la del registro

    out2 = sicoe_payload_desellar_con_acta_pre(
        base,
        acta_rpo_id_actual=99,
        acta_rpo_id_pre_reversion_actual=12,
    )
    assert "acta_rpo_id_pre_reversion" not in out2


def test_formatear_acta_opcion():
    lab = sicoe_formatear_acta_opcion(
        {"id": 3, "numero_rpo": 1, "fecha_inicio": "2025-01-01", "fecha_fin": "2025-01-31"}
    )
    assert lab["id"] == 3
    assert lab["numero_rpo"] == 1
    assert "Acta RPO 1" in lab["label"]
    assert "2025-01-01" in lab["label"]
