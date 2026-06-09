"""Diagnóstico 2.E en baseline Curva S vs presupuesto V0/V1."""
from dotenv import load_dotenv

load_dotenv()

from main import supabase  # noqa: E402
from prog_obra_compare import fetch_compare_nodes  # noqa: E402
from prog_obra_costos_presupuesto import (  # noqa: E402
    build_cost_overlay_maps,
    fetch_ppto_items_version,
    _listado_agrupador_por_item,
    _aggregate_items_por_agrupador,
)
from prog_obra_curva_s import _aggregate_version_monthly  # noqa: E402
from prog_obra_costos_presupuesto import fetch_ppto_baseline_version_id  # noqa: E402
from prog_obra_service import fetch_baseline_version_id  # noqa: E402

cid = 3
tramo = "TRAMO 7"
v0 = "2cb983d9-90b7-489d-9940-cebb1294513c"
v1 = "020cb4d5-b349-4669-883b-baa09e483f1b"
prog_vid = "ad852fda-0a3c-46fc-9672-520d5d0ce8d9"
ag_id_2e = 25

ag_by_item, desc_lp = _listado_agrupador_por_item(supabase, cid)

for label, ppto_id in [("V0", v0), ("V1", v1)]:
    rows = fetch_ppto_items_version(supabase, cid, ppto_id, tramo=tramo)
    items_2e = [r for r in rows if ag_by_item.get(((r.get("capitulo") or "").strip(), (r.get("item") or "").strip())) == ag_id_2e]
    cost_2e = sum(float(r.get("costo_directo") or 0) for r in items_2e)
    ag_buckets, _, _ = _aggregate_items_por_agrupador(rows, ag_by_item, desc_lp)
    ag_keys_2e = [k for k in ag_buckets if k[2] == ag_id_2e]
    print(f"\n{label} TRAMO7: total items={len(rows)}, 2.E items={len(items_2e)}, 2.E cost={cost_2e:,.0f}")
    print(f"  ag buckets 2E: {len(ag_keys_2e)} keys, sum={sum(ag_buckets[k]['costo_directo'] for k in ag_keys_2e):,.0f}")

nodes = fetch_compare_nodes(supabase, prog_vid, cid, schedule_mode="programada")
nodes_2e = [n for n in nodes.values() if n.get("agrupador_id") == ag_id_2e]
print(f"\nPROG compare nodes 2.E (baseline dates): {len(nodes_2e)}")
if nodes_2e:
    print(" sample", nodes_2e[0])

ag_v0, _ = build_cost_overlay_maps(supabase, cid, v0, tramo=tramo)
ag_v1, _ = build_cost_overlay_maps(supabase, cid, v1, tramo=tramo)
print(f"\nOverlay V0 ag25 keys: {len([k for k in ag_v0 if k[2]==ag_id_2e])}, cost={sum(v for k,v in ag_v0.items() if k[2]==ag_id_2e):,.0f}")
print(f"Overlay V1 ag25 keys: {len([k for k in ag_v1 if k[2]==ag_id_2e])}, cost={sum(v for k,v in ag_v1.items() if k[2]==ag_id_2e):,.0f}")

bid = fetch_baseline_version_id(supabase, cid)
ppto_base = fetch_ppto_baseline_version_id(supabase, cid)
base_m, base_total = _aggregate_version_monthly(supabase, bid, cid, ppto_base, tramos=tramo)
tgt_m, tgt_total = _aggregate_version_monthly(supabase, prog_vid, cid, v1, tramos=tramo)
print(f"\nCurva S baseline total={base_total:,.0f} meses={sorted(base_m.keys())}")
print(f"Curva S vigente  total={tgt_total:,.0f} meses={sorted(tgt_m.keys())}")
print(f"Scope ppto baseline id={ppto_base} (V0={v0})")
