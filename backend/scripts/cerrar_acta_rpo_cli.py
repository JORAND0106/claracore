#!/usr/bin/env python3
"""
Cierre de acta RPO desde consola (emergencia si el panel hace timeout).

Uso (desde backend/, con .env cargado):
  python scripts/cerrar_acta_rpo_cli.py --contrato 2 --acta-id 123 --fecha-cierre 2026-05-16

Requiere las mismas variables que main.py (SUPABASE_URL, SUPABASE_KEY, etc.).
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


def main() -> int:
    p = argparse.ArgumentParser(description="Cerrar acta RPO y crear/reutilizar siguiente (local, sin HTTP).")
    p.add_argument("--contrato", type=int, required=True)
    p.add_argument("--acta-id", type=int, required=True)
    p.add_argument("--fecha-cierre", required=True, help="YYYY-MM-DD")
    args = p.parse_args()

    fc = date.fromisoformat(args.fecha_cierre[:10])

    import main as app_main

    rows = (
        app_main.supabase.table("actas")
        .select("*")
        .eq("id", args.acta_id)
        .eq("contrato_id", args.contrato)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        print("ERROR: acta no encontrada en ese contrato.", file=sys.stderr)
        return 1

    user_stub = {
        "sub": "0",
        "nombre": "CLI cerrar_acta_rpo",
        "email": "cli@local",
        "cargo_nombre": "desarrollador",
        "rol_nombre": "desarrollador",
    }
    r = app_main._cerrar_acta_rpo_ejecutar(
        args.contrato,
        fc,
        args.acta_id,
        rows[0],
        user_stub,
        "cerrar_rpo_cli",
        defer_mover_residuales=False,
    )
    print(r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
