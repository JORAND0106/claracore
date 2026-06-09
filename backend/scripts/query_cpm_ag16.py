from dotenv import load_dotenv
load_dotenv()
from main import supabase

vid = "ad852fda-0a3c-46fc-9672-520d5d0ce8d9"
cid = 3
cpm = (
    supabase.table("prog_cpm_resultados")
    .select("pk_id,capitulo,agrupador_id,fecha_inicio_temprana,fecha_fin_temprana")
    .eq("version_id", vid)
    .execute()
    .data
    or []
)
ag16 = [r for r in cpm if r.get("agrupador_id") == 16]
print("CPM agrupador_id=16 total:", len(ag16))
for r in sorted(ag16, key=lambda x: (x.get("pk_id"), x.get("fecha_inicio_temprana"))):
    print(r)

aug = [r for r in cpm if "2026-08" in str(r.get("fecha_inicio_temprana") or "")]
print("\nCPM agosto inicio total:", len(aug))
ag_meta = {
    r["id"]: r
    for r in (
        supabase.table("listado_precios_agrupadores")
        .select("id,codigo_wbs,nombre")
        .eq("contrato_id", cid)
        .execute()
        .data
        or []
    )
}
for r in aug:
    ag = ag_meta.get(r["agrupador_id"], {})
    wbs = ag.get("codigo_wbs")
    print(f"pk={r['pk_id']} ag={r['agrupador_id']} wbs={wbs} | {r['fecha_inicio_temprana']} to {r['fecha_fin_temprana']}")
