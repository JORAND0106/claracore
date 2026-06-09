"""Consulta fechas WBS en prog_actividades (diagnóstico)."""
from dotenv import load_dotenv

load_dotenv()

from main import supabase  # noqa: E402

VID = "ad852fda-0a3c-46fc-9672-520d5d0ce8d9"

rows = (
    supabase.table("prog_actividades")
    .select("pk_id,capitulo,codigo_wbs,fecha_inicio,fecha_fin_calculada,duracion_dias_habiles")
    .eq("version_id", VID)
    .not_.is_("codigo_wbs", "null")
    .order("fecha_inicio")
    .execute()
    .data
    or []
)

print(f"version_id = {VID}")
print(f"Total filas (codigo_wbs NOT NULL): {len(rows)}\n")
hdr = (
    "pk_id",
    "capitulo",
    "codigo_wbs",
    "fecha_inicio",
    "fecha_fin_calculada",
    "duracion_dias_habiles",
)
print("\t".join(hdr))
for r in rows:
    print(
        "\t".join(
            str(r.get(k) or "")
            for k in (
                "pk_id",
                "capitulo",
                "codigo_wbs",
                "fecha_inicio",
                "fecha_fin_calculada",
                "duracion_dias_habiles",
            )
        )
    )

# Resumen por mes de fecha_inicio / fecha_fin
from collections import Counter

ci = Counter(str(r.get("fecha_inicio") or "")[:7] for r in rows if r.get("fecha_inicio"))
cf = Counter(str(r.get("fecha_fin_calculada") or "")[:7] for r in rows if r.get("fecha_fin_calculada"))
print("\n--- Resumen fecha_inicio por mes (YYYY-MM) ---")
for k in sorted(ci):
    print(f"  {k}: {ci[k]} filas")
print("\n--- Resumen fecha_fin_calculada por mes (YYYY-MM) ---")
for k in sorted(cf):
    print(f"  {k}: {cf[k]} filas")
