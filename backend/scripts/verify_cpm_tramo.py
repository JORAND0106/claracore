"""Verifica CPM tramo 2.C -> 4.C tras recalcular."""
from dotenv import load_dotenv

load_dotenv()

from main import supabase  # noqa: E402
from prog_obra_calendar import CalendarioNoHabilesCache  # noqa: E402
from prog_obra_service import ejecutar_cpm_version, make_prog_calendar_loader  # noqa: E402

cid = 3
vid = "ad852fda-0a3c-46fc-9672-520d5d0ce8d9"
cache = CalendarioNoHabilesCache(make_prog_calendar_loader(supabase))
res = ejecutar_cpm_version(supabase, vid, cid, cache)
print("CPM ok:", res.ok, "error:", getattr(res, "error", None), "nodos:", len(res.nodos or []))

tramo_pks = [
    "120367", "120368", "120369", "120370", "120371", "120372",
    "120373", "120374", "120375", "120376", "120377", "120378",
]
for pk in tramo_pks:
    n2 = next((n for n in res.nodos if n.pk_id == pk and str(n.agrupador_id) == "16"), None)
    n4 = next((n for n in res.nodos if n.pk_id == pk and str(n.agrupador_id) == "21"), None)
    if not n2 and not n4:
        continue
    s2 = f"{n2.fecha_inicio_temprana}->{n2.fecha_fin_temprana}" if n2 else "—"
    s4 = f"{n4.fecha_inicio_temprana}->{n4.fecha_fin_temprana}" if n4 else "—"
    print(pk, "2.C", s2, "| 4.C", s4)
