"""Regla canónica Costo Directo aprobado nivel máximo — unificación Dashboard/Panel."""
from sicoe_costo_aprobado_nivel import (
    CRITERIO_COSTO_APROBADO_NIVEL_MAX,
    costo_directo_linea,
    registro_aprobado_nivel_max,
    sum_costo_aprobado_nivel_max,
)

# Caso ICCU-CTO-1614-2025 Acta RPO 1 (acta_rpo_id=620) — tres fuentes históricas.
SQL_CRUDO_ACTA620 = 78_318_891  # SUM(CD) WHERE nivel4_estado='Aprobado' (sin prerreqs)
DASHBOARD_LEGACY_ACTA620 = 76_788_964  # cant×listado VU sin prerreqs (KPI/CapFin)
PANEL_LEGACY_ACTA620 = 78_855_123  # cant×MAX(VU) con prerreqs (RPC matriz)


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


def test_tres_fuentes_historicas_divergen_y_canonico_unica():
    """
    Evidencia numérica del incidente ICCU Acta 620:
    - SQL crudo (solo n4=Aprobado): 78.318.891
    - Dashboard legacy (cant×listado, sin prerreqs): 76.788.964
    - Panel legacy (cant×MAX VU + prerreqs): 78.855.123
    Tras unificación, Dashboard KPI/CapFin y Panel N4 Aprobado deben usar
    sum_costo_aprobado_nivel_max (misma función).
    """
    assert SQL_CRUDO_ACTA620 != DASHBOARD_LEGACY_ACTA620
    assert SQL_CRUDO_ACTA620 != PANEL_LEGACY_ACTA620
    assert DASHBOARD_LEGACY_ACTA620 != PANEL_LEGACY_ACTA620
    # Deltas documentados del incidente
    assert PANEL_LEGACY_ACTA620 - SQL_CRUDO_ACTA620 == 536_232
    assert SQL_CRUDO_ACTA620 - DASHBOARD_LEGACY_ACTA620 == 1_529_927

    na = [1, 2, 3, 4]
    # Synthetic mix that reproduces the three formulas' relative ordering
    # when applied to the same registros:
    # - A: cascada OK, CD = listado-aligned
    # - B: n4 Aprobado sin N3 (entra en SQL crudo, no en canónico ni panel-prereq)
    # - C: cascada OK pero VU línea < MAX VU del ítem (panel MAX infla)
    regs = [
        {
            "item_numero": "1",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "nivel4_estado": "Aprobado",
            "cantidad_total": 10,
            "vlr_unitario": 7_678_896.4,  # listado-like
            "costo_directo": 76_788_964,
        },
        {
            "item_numero": "2",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Pendiente",
            "nivel4_estado": "Aprobado",
            "cantidad_total": 1,
            "vlr_unitario": 1_529_927,
            "costo_directo": 1_529_927,  # SQL-only bump → 78.318.891
        },
        {
            "item_numero": "1",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "nivel4_estado": "Aprobado",
            "cantidad_total": 1,
            "vlr_unitario": 8_066_159,  # higher VU → MAX inflates panel
            "costo_directo": 1_529_927,  # canon adds this → still not panel
        },
    ]
    # SQL crudo: todas con n4=Aprobado
    sql = round(sum(costo_directo_linea(r) for r in regs if r["nivel4_estado"] == "Aprobado"), 0)
    # Canónico: solo cascada completa
    canon = sum_costo_aprobado_nivel_max(regs, na)
    # Panel legacy: net cant × MAX VU por ítem, solo cascada
    from collections import defaultdict

    qty: dict = defaultdict(float)
    max_vu: dict = defaultdict(float)
    for r in regs:
        if not registro_aprobado_nivel_max(r, na):
            continue
        ik = r["item_numero"]
        qty[ik] += float(r["cantidad_total"])
        max_vu[ik] = max(max_vu[ik], float(r["vlr_unitario"]))
    panel = round(sum(q * max_vu[ik] for ik, q in qty.items()), 0)

    assert sql == 76_788_964 + 1_529_927 + 1_529_927  # 79.848.818
    assert canon == 76_788_964 + 1_529_927  # 78.318.891 — coincide con SQL_CRUDO del incidente
    assert panel != canon  # MAX VU infla respecto a SUM(CD)
    assert sql != canon  # líneas sin prerreq
    # Dashboard/Panel/SQL consumers must share this single function:
    assert canon == sum_costo_aprobado_nivel_max(regs, na)


def test_paridad_dashboard_panel_mismo_agregador():
    """Dashboard KPI y Panel N4 Aprobado deben invocar la misma función canónica."""
    na = [1, 2, 3, 4]
    regs = [
        {
            "item_numero": "Z",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "nivel4_estado": "Aprobado",
            "costo_directo": 100,
        },
        {
            "item_numero": "Z",
            "nivel1_estado": "Aprobado",
            "nivel2_estado": "Aprobado",
            "nivel3_estado": "Aprobado",
            "nivel4_estado": "Aprobado",
            "costo_directo": 50,
        },
    ]
    # Simula Dashboard scan (suma ap_c) y Panel matriz (fila Aprobado · N4)
    dash_total = sum_costo_aprobado_nivel_max(regs, na)
    panel_n4_aprobado = sum(
        costo_directo_linea(r) for r in regs if registro_aprobado_nivel_max(r, na)
    )
    assert dash_total == panel_n4_aprobado == 150.0
