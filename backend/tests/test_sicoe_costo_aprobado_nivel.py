"""Regla canónica Costo Directo aprobado nivel máximo — unificación Dashboard/Panel."""
from sicoe_costo_aprobado_nivel import (
    CRITERIO_COSTO_APROBADO_NIVEL_MAX,
    costo_directo_linea,
    registro_aprobado_nivel_max,
    sum_costo_aprobado_nivel_max,
)


def test_criterio_documentado():
    assert "prerrequisitos" in CRITERIO_COSTO_APROBADO_NIVEL_MAX.lower()
    assert "costo_directo" in CRITERIO_COSTO_APROBADO_NIVEL_MAX.lower()


def test_predicado_exige_item_y_cascada():
    na = [1, 2, 3, 4]
    base = {
        "item_numero": "1.1",
        "nivel1_estado": "Aprobado",
        "nivel2_estado": "Aprobado",
        "nivel3_estado": "Aprobado",
        "nivel4_estado": "Aprobado",
        "costo_directo": 1000,
    }
    assert registro_aprobado_nivel_max(base, na) is True
    assert registro_aprobado_nivel_max({**base, "item_numero": ""}, na) is False
    assert registro_aprobado_nivel_max({**base, "nivel3_estado": "Pendiente"}, na) is False
    assert registro_aprobado_nivel_max({**base, "nivel4_estado": "No Revisado"}, na) is False


def test_sql_crudo_sin_prereqs_diverge_de_canonico():
    """Reproduce la divergencia A vs C: N4=Aprobado sin N3 no cuenta en canónico."""
    na = [1, 2, 3, 4]
    regs = [
        {
            "item_numero": "A",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "nivel4_estado": "Aprobado",
            "costo_directo": 78_318_891,
        },
        {
            # Contaría en SQL crudo SUM(CD WHERE n4=Aprobado) pero NO en canónico
            "item_numero": "B",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Pendiente",
            "nivel4_estado": "Aprobado",
            "costo_directo": 536_232,
        },
    ]
    sql_crudo = sum(float(r["costo_directo"]) for r in regs if r["nivel4_estado"] == "Aprobado")
    canon = sum_costo_aprobado_nivel_max(regs, na)
    assert sql_crudo == 78_318_891 + 536_232
    assert canon == 78_318_891
    assert sql_crudo - canon == 536_232  # ≈ Panel−SQL del caso ICCU Acta 1 (orden inverso por VU)


def test_agregacion_max_vu_diverge_de_sum_cd():
    """Reproduce Panel histórico (cant×MAX VU) vs SUM(costo_directo)."""
    regs = [
        {"item_numero": "X", "cantidad_total": 10, "vlr_unitario": 100, "costo_directo": 1000,
         "nivel1_estado": "Aprobado", "nivel2_estado": "Aprobado",
         "nivel3_estado": "Aprobado", "nivel4_estado": "Aprobado"},
        {"item_numero": "X", "cantidad_total": 10, "vlr_unitario": 120, "costo_directo": 1200,
         "nivel1_estado": "Aprobado", "nivel2_estado": "Aprobado",
         "nivel3_estado": "Aprobado", "nivel4_estado": "Aprobado"},
    ]
    sum_cd = sum_costo_aprobado_nivel_max(regs, [1, 2, 3, 4])
    max_vu = max(float(r["vlr_unitario"]) for r in regs)
    qty = sum(float(r["cantidad_total"]) for r in regs)
    panel_legacy = round(qty * max_vu, 0)
    assert sum_cd == 2200
    assert panel_legacy == 2400
    assert panel_legacy - sum_cd == 200


def test_costo_linea_fallback():
    assert costo_directo_linea({"costo_directo": 50}) == 50.0
    assert costo_directo_linea({"cantidad_total": 2.5, "vlr_unitario": 10}) == 25.0
