#!/usr/bin/env python3
"""Sincroniza sico_ultimo_numero_reporte/registro = MAX real por contrato.

Caso típico: tras borrar reportes, reservado_hasta queda alto y el próximo número
salta huecos. Este script (service_role) alinea contadores; el backend también
sincroniza en cada DELETE de reporte/registro.

Uso:
  SUPABASE_URL=... SUPABASE_KEY=... python backend/scripts/sync_sicoe_reservado_hasta.py
  SUPABASE_URL=... SUPABASE_KEY=... python backend/scripts/sync_sicoe_reservado_hasta.py --contrato 3
"""

from __future__ import annotations

import argparse
import os
import sys

from supabase import create_client


def _max_num(sb, table: str, col: str, contrato_id: int) -> int:
    rows = (
        sb.table(table)
        .select(col)
        .eq("contrato_id", contrato_id)
        .order(col, desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or rows[0].get(col) is None:
        return 0
    return int(rows[0][col])


def sync_contrato(sb, contrato_id: int) -> dict:
    max_rep = _max_num(sb, "so_reportes", "numero_reporte", contrato_id)
    max_reg = _max_num(sb, "so_registros", "numero_registro", contrato_id)
    sb.table("sico_ultimo_numero_reporte").upsert(
        {"contrato_id": contrato_id, "reservado_hasta": max_rep},
        on_conflict="contrato_id",
    ).execute()
    sb.table("sico_ultimo_numero_registro").upsert(
        {"contrato_id": contrato_id, "reservado_hasta": max_reg},
        on_conflict="contrato_id",
    ).execute()
    return {
        "contrato_id": contrato_id,
        "max_numero_reporte": max_rep,
        "max_numero_registro": max_reg,
        "siguiente_numero_reporte": max_rep + 1 if max_rep else 1,
        "siguiente_numero_registro": max_reg + 1 if max_reg else 1,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contrato", type=int, default=None, help="Solo este contrato_id")
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
    )
    if not url or not key:
        print("Faltan SUPABASE_URL y SUPABASE_KEY/SERVICE_ROLE_KEY", file=sys.stderr)
        return 2

    sb = create_client(url, key)
    if args.contrato is not None:
        ids = [args.contrato]
    else:
        rows = sb.table("contratos").select("id").execute().data or []
        ids = sorted({int(r["id"]) for r in rows if r.get("id") is not None})

    for cid in ids:
        info = sync_contrato(sb, cid)
        print(
            f"contrato={cid} max_rep={info['max_numero_reporte']} "
            f"→ próximo={info['siguiente_numero_reporte']} | "
            f"max_reg={info['max_numero_registro']} "
            f"→ próximo={info['siguiente_numero_registro']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
