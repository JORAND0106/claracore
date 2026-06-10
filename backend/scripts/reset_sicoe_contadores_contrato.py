"""Renumerar reportes/registros SICOE de un contrato desde 1 y sincronizar contadores.

Uso (desde raíz del repo):
  python backend/scripts/reset_sicoe_contadores_contrato.py 3

Requiere backend/.env con SUPABASE_URL y SUPABASE_KEY (service_role).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    print("Faltan SUPABASE_URL / SUPABASE_KEY en backend/.env", file=sys.stderr)
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def renumber(table: str, num_col: str, contrato_id: int) -> int:
    rows = (
        sb.table(table)
        .select(f"id,{num_col}")
        .eq("contrato_id", contrato_id)
        .order(num_col)
        .order("id")
        .execute()
        .data
        or []
    )
    if not rows:
        return 0
    for r in rows:
        rid = int(r["id"])
        sb.table(table).update({num_col: -rid}).eq("id", rid).eq("contrato_id", contrato_id).execute()
    for i, r in enumerate(rows, start=1):
        rid = int(r["id"])
        sb.table(table).update({num_col: i}).eq("id", rid).eq("contrato_id", contrato_id).execute()
    return len(rows)


def main() -> None:
    contrato_id = int(sys.argv[1] if len(sys.argv) > 1 else 3)
    sb.table("contratos").update({"sicoe_consecutivos_desde_uno": True}).eq("id", contrato_id).execute()

    n_rep = renumber("so_reportes", "numero_reporte", contrato_id)
    n_reg = renumber("so_registros", "numero_registro", contrato_id)

    max_rep = 0
    max_reg = 0
    if n_rep:
        mr = (
            sb.table("so_reportes")
            .select("numero_reporte")
            .eq("contrato_id", contrato_id)
            .order("numero_reporte", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if mr:
            max_rep = int(mr[0]["numero_reporte"])
    if n_reg:
        mr = (
            sb.table("so_registros")
            .select("numero_registro")
            .eq("contrato_id", contrato_id)
            .order("numero_registro", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if mr:
            max_reg = int(mr[0]["numero_registro"])

    sb.table("sico_ultimo_numero_reporte").upsert(
        {"contrato_id": contrato_id, "reservado_hasta": max_rep}, on_conflict="contrato_id"
    ).execute()
    sb.table("sico_ultimo_numero_registro").upsert(
        {"contrato_id": contrato_id, "reservado_hasta": max_reg}, on_conflict="contrato_id"
    ).execute()

    print(
        f"Contrato {contrato_id}: reportes={n_rep} (max #{max_rep}), "
        f"registros={n_reg} (max #{max_reg}). "
        f"Siguiente reporte #{max_rep + 1 if max_rep else 1}, "
        f"siguiente registro #{max_reg + 1 if max_reg else 1}."
    )


if __name__ == "__main__":
    main()
