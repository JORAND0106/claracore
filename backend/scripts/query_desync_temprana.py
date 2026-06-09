"""Desync fecha_inicio vs fecha_inicio_temprana (diagnóstico)."""
from collections import Counter

from dotenv import load_dotenv

load_dotenv()

from main import supabase  # noqa: E402

VID = "ad852fda-0a3c-46fc-9672-520d5d0ce8d9"

rows = (
    supabase.table("prog_actividades")
    .select(
        "pk_id,codigo_wbs,fecha_inicio,fecha_fin_calculada,"
        "fecha_inicio_temprana,fecha_fin_temprana"
    )
    .eq("version_id", VID)
    .not_.is_("codigo_wbs", "null")
    .execute()
    .data
    or []
)

desync = [
    r
    for r in rows
    if r.get("fecha_inicio_temprana") and r["fecha_inicio"] != r["fecha_inicio_temprana"]
]
print(f"Filas con fecha_inicio != fecha_inicio_temprana: {len(desync)} / {len(rows)}")
ci_t = Counter(str(r.get("fecha_inicio_temprana") or "")[:7] for r in rows if r.get("fecha_inicio_temprana"))
print("fecha_inicio_temprana por mes:", dict(sorted(ci_t.items())))
for r in sorted(desync, key=lambda x: (x.get("codigo_wbs") or "", x.get("pk_id") or "")):
    print(
        f"  pk={r['pk_id']} wbs={r['codigo_wbs']}"
        f" | inicio={r['fecha_inicio']} temprana={r['fecha_inicio_temprana']}"
        f" fin_t={r['fecha_fin_temprana']}"
    )

cpm = (
    supabase.table("prog_cpm_resultados")
    .select("pk_id,agrupador_id,fecha_inicio_temprana,fecha_fin_temprana")
    .eq("version_id", VID)
    .execute()
    .data
    or []
)
cpm_aug = [r for r in cpm if str(r.get("fecha_inicio_temprana") or "").startswith("2026-08")]
print(f"\nprog_cpm_resultados con inicio agosto: {len(cpm_aug)}")
