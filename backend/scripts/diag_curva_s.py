"""Diagnóstico raíz Curva S — solo lectura, no modifica código."""
import json
import sys
from collections import defaultdict
from datetime import date

from dotenv import load_dotenv

load_dotenv()

from main import supabase  # noqa: E402
from prog_obra_compare import fetch_compare_nodes  # noqa: E402
from prog_obra_costos_presupuesto import (  # noqa: E402
    fetch_ppto_baseline_version_id,
    fetch_ppto_borrador_version_id,
)
from prog_obra_curva_s import (  # noqa: E402
    _aggregate_version_monthly,
    _linear_monthly_distribution,
    _month_key,
    _parse_d,
    build_curva_s,
)
from prog_obra_service import fetch_baseline_version_id, fetch_vigente_meta  # noqa: E402


def diag_contrato(cid: int, target_id: str | None = None):
    print(f"\n{'='*60}\nCONTRATO {cid}\n{'='*60}")

    cto = (
        supabase.table("contratos")
        .select("id,numero,prog_version_vigente_id,prog_version_baseline_id")
        .eq("id", cid)
        .execute()
        .data
        or [{}]
    )[0]
    print("contrato:", json.dumps(cto, indent=2, default=str))

    bid_auto = fetch_baseline_version_id(supabase, cid)
    vid_meta, num = fetch_vigente_meta(supabase, cid)
    print("fetch_baseline_version_id():", bid_auto)
    print("fetch_vigente_meta():", vid_meta, "numero=", num)

    vers = (
        supabase.table("prog_versiones")
        .select("id,numero_version,tipo,estado,sellado_en,fecha_inicio,fecha_fin")
        .eq("contrato_id", cid)
        .execute()
        .data
        or []
    )
    print("prog_versiones:")
    for v in vers:
        print(" ", v)

    if not target_id and vers:
        target_id = vers[0]["id"]
    if not target_id:
        print("Sin versión target")
        return

    ppto_vig = fetch_ppto_borrador_version_id(supabase, cid)
    ppto_base = fetch_ppto_baseline_version_id(supabase, cid)
    print("ppto_borrador_id:", ppto_vig)
    print("ppto_baseline_id (V0):", ppto_base)

    # Actividades: rango de fechas en BD
    acts = (
        supabase.table("prog_actividades")
        .select("fecha_inicio,fecha_fin_calculada,costo_unitario,cantidad_programada,agrupador_id")
        .eq("contrato_id", cid)
        .eq("version_id", target_id)
        .not_.is_("fecha_inicio", "null")
        .execute()
        .data
        or []
    )
    fins = [_parse_d(a.get("fecha_fin_calculada")) for a in acts if a.get("fecha_fin_calculada")]
    inis = [_parse_d(a.get("fecha_inicio")) for a in acts if a.get("fecha_inicio")]
    print(f"actividades con fecha_inicio: {len(acts)}")
    if inis:
        print(f"  min inicio: {min(inis)}, max fin: {max(f for f in fins if f) if fins else 'N/A'}")
    aug = [a for a in acts if str(a.get("fecha_fin_calculada") or "")[:7] == "2026-08" or str(a.get("fecha_inicio") or "")[:7] == "2026-08"]
    print(f"  actividades tocando 2026-08: {len(aug)}")

    # Nodos compare: cuántos tienen ff en agosto
    nodes = fetch_compare_nodes(supabase, target_id, cid)
    with_cost = 0
    with_ff = 0
    aug_nodes = 0
    month_keys_from_nodes: set[str] = set()
    for n in nodes.values():
        fi, ff = n.get("fecha_inicio"), n.get("fecha_fin")
        costo = float(n.get("costo_programado") or 0)
        if costo > 0 and fi and ff:
            with_cost += 1
            for mk in _linear_monthly_distribution(fi, ff, costo):
                month_keys_from_nodes.add(mk)
            if ff and _month_key(ff) == "2026-08":
                aug_nodes += 1
        if ff:
            with_ff += 1
    print(f"compare nodes total: {len(nodes)}, con costo+fechas: {with_cost}, con fecha_fin: {with_ff}")
    print(f"  meses desde nodos (distribución): {sorted(month_keys_from_nodes)}")
    print(f"  nodos con fecha_fin en ago-2026: {aug_nodes}")

    tgt_m, tgt_total = _aggregate_version_monthly(supabase, target_id, cid, ppto_vig)
    print(f"_aggregate_version_monthly (vigente): total={tgt_total}, meses={sorted(tgt_m.keys())}")

    if bid_auto:
        base_m, base_total = _aggregate_version_monthly(supabase, bid_auto, cid, ppto_base)
        print(f"_aggregate_version_monthly (baseline auto {bid_auto}): total={base_total}, meses={sorted(base_m.keys())}")
    else:
        print("_aggregate_version_monthly (baseline auto): SKIPPED — fetch_baseline_version_id() = None")

    # JSON endpoint — escenarios
    scenarios = [
        ("A: target_id only", {"target_id": target_id}),
        ("B: baseline_id=target_id (frontend con 1 sola versión)", {"baseline_id": target_id, "target_id": target_id}),
        ("C: sin params (default vigente)", {}),
    ]
    if bid_auto:
        scenarios.append(("D: baseline auto + target", {"baseline_id": bid_auto, "target_id": target_id}))

    for label, kwargs in scenarios:
        print(f"\n--- build_curva_s {label} ---")
        try:
            data = build_curva_s(supabase, cid, **kwargs)
        except Exception as e:
            print("  ERROR:", e)
            continue
        out = {
            "baseline_id": data.get("baseline_id"),
            "target_id": data.get("target_id"),
            "version_ppto_id": data.get("version_ppto_id"),
            "version_ppto_baseline_id": data.get("version_ppto_baseline_id"),
            "indicadores": data.get("indicadores"),
            "meses": data.get("meses"),
        }
        print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    cid = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    tid = sys.argv[2] if len(sys.argv) > 2 else None
    diag_contrato(cid, tid)
