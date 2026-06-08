"""Estado PK con programación por agrupadores WBS."""
from prog_obra_service import _compute_estado_pk


def _count_ppto_items_con_fecha(ppto_keys, ag_by_item, actividades):
    """Réplica de la lógica WBS-aware usada en _count_items_con_fecha (para tests)."""
    direct_with_fecha = set()
    agrupadores_con_fecha = set()
    for r in actividades:
        fi = r.get("fecha_inicio")
        if fi is None or str(fi).strip() == "":
            continue
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        ag_id = r.get("agrupador_id")
        if ag_id is not None:
            agrupadores_con_fecha.add((cap, int(ag_id)))
        if cap and it and (cap, it) in ppto_keys:
            direct_with_fecha.add((cap, it))

    seen = set()
    for cap, it in ppto_keys:
        if (cap, it) in direct_with_fecha:
            seen.add((cap, it))
            continue
        ag_id = ag_by_item.get((cap, it))
        if ag_id is not None and (cap, int(ag_id)) in agrupadores_con_fecha:
            seen.add((cap, it))
    return len(seen)


def test_agrupador_programado_cuenta_hijos_presupuesto():
    ppto_keys = {("01", "1.1"), ("01", "1.2"), ("01", "2.1")}
    ag_by_item = {("01", "1.1"): 10, ("01", "1.2"): 10, ("01", "2.1"): 20}
    actividades = [
        {
            "capitulo": "01",
            "item": "2.A",
            "fecha_inicio": "2026-06-01",
            "agrupador_id": 10,
        },
    ]
    n = _count_ppto_items_con_fecha(ppto_keys, ag_by_item, actividades)
    assert n == 2
    assert _compute_estado_pk(3, n) == "en_progreso"


def test_todos_agrupadores_programados_estado_completa():
    ppto_keys = {("01", "1.1"), ("01", "2.1")}
    ag_by_item = {("01", "1.1"): 10, ("01", "2.1"): 20}
    actividades = [
        {"capitulo": "01", "item": "A", "fecha_inicio": "2026-06-01", "agrupador_id": 10},
        {"capitulo": "01", "item": "B", "fecha_inicio": "2026-07-01", "agrupador_id": 20},
    ]
    n = _count_ppto_items_con_fecha(ppto_keys, ag_by_item, actividades)
    assert n == 2
    assert _compute_estado_pk(2, n) == "completa"


def test_items_sin_agrupador_impiden_estado_completa():
    """Todos los ítems con agrupador programados, pero queda uno sin agrupador → en_progreso."""
    ppto_keys = {("01", "1.1"), ("01", "1.2"), ("01", "9.9")}
    ag_by_item = {("01", "1.1"): 10, ("01", "1.2"): 10}
    actividades = [
        {"capitulo": "01", "item": "A", "fecha_inicio": "2026-06-01", "agrupador_id": 10},
    ]
    n = _count_ppto_items_con_fecha(ppto_keys, ag_by_item, actividades)
    assert n == 2
    assert _compute_estado_pk(3, n, items_sin_agrupador=1) == "en_progreso"


def test_sin_agrupador_bloquea_completa_si_conteos_coinciden():
    """Si items_total omitió ítems sin agrupador, igual no debe marcar completa."""
    assert _compute_estado_pk(2, 2, items_sin_agrupador=1) == "en_progreso"


def test_sin_fechas_en_actividades_estado_sin_iniciar():
    ppto_keys = {("01", "1.1"), ("01", "1.2")}
    ag_by_item = {("01", "1.1"): 10, ("01", "1.2"): 10}
    actividades = [
        {"capitulo": "01", "item": "2.A", "fecha_inicio": None, "agrupador_id": 10},
    ]
    n = _count_ppto_items_con_fecha(ppto_keys, ag_by_item, actividades)
    assert n == 0
    assert _compute_estado_pk(2, n) == "sin_iniciar"

