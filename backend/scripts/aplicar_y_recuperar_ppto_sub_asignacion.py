#!/usr/bin/env python3
"""
Aplica migraciones de presupuesto_sub_asignacion (+ saldado) y diagnostica
asignaciones perdidas por el fallback legado_exclusivo.

Requiere variables de entorno:
  SUPABASE_URL
  SUPABASE_KEY   (service role — PostgREST no ejecuta DDL; para DDL usar
                  SUPABASE_DB_URL con psycopg)

Uso DDL (recomendado):
  SUPABASE_DB_URL=postgresql://... python3 scripts/aplicar_y_recuperar_ppto_sub_asignacion.py --apply-ddl

Uso diagnóstico (service role REST):
  SUPABASE_URL=... SUPABASE_KEY=... python3 scripts/aplicar_y_recuperar_ppto_sub_asignacion.py --diagnose
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [
    ROOT / "migrations" / "20261007210000_presupuesto_sub_asignacion.sql",
    ROOT / "migrations" / "20261008120000_presupuesto_sub_asignacion_saldado.sql",
]


def apply_ddl(db_url: str) -> None:
    try:
        import psycopg
    except ImportError:
        print("Instale psycopg: pip install psycopg[binary]", file=sys.stderr)
        sys.exit(2)
    with psycopg.connect(db_url) as conn:
        conn.execute("BEGIN")
        for path in MIGRATIONS:
            sql = path.read_text(encoding="utf-8")
            print(f"Aplicando {path.name}…")
            conn.execute(sql)
        conn.commit()
    print("DDL aplicado OK.")


def diagnose_rest(url: str, key: str) -> None:
    from supabase import create_client

    sb = create_client(url, key)
    for table in ("presupuesto_sub_asignacion", "presupuesto_sub_redistribucion"):
        try:
            sb.table(table).select("id").limit(1).execute()
            print(f"OK tabla {table} existe")
        except Exception as exc:
            print(f"FALTA tabla {table}: {exc}")

    # Candidatos: FK con sub sin fila de asignacion
    try:
        rows = (
            sb.table("presupuesto")
            .select("id, contrato_id, item, tramo, subcontratista_id, cant_total, updated_at")
            .not_.is_("subcontratista_id", "null")
            .eq("dado_de_baja", False)
            .order("updated_at", desc=True)
            .limit(200)
            .execute()
            .data
        ) or []
    except Exception as exc:
        print("No se pudo listar presupuesto:", exc)
        return

    print(f"Muestra de {len(rows)} filas con subcontratista_id…")
    huérfanos = []
    for r in rows:
        pid = int(r["id"])
        sid = int(r["subcontratista_id"])
        try:
            a = (
                sb.table("presupuesto_sub_asignacion")
                .select("id")
                .eq("presupuesto_id", pid)
                .eq("subcontratista_id", sid)
                .limit(1)
                .execute()
                .data
            ) or []
        except Exception:
            print("No se puede consultar asignacion — aplique DDL primero.")
            return
        if not a:
            huérfanos.append(r)

    print(f"Huérfanos FK sin fila en asignacion: {len(huérfanos)}")
    for r in huérfanos[:30]:
        print(
            f"  ppto={r['id']} contrato={r['contrato_id']} item={r.get('item')} "
            f"tramo={r.get('tramo')} sub={r['subcontratista_id']} cant={r.get('cant_total')}"
        )

    # Backfill seguro de huérfanos (recrea asignación del FK actual; NO recupera el sub anterior)
    if huérfanos and os.environ.get("APPLY_BACKFILL") == "1":
        for r in huérfanos:
            sb.table("presupuesto_sub_asignacion").upsert({
                "contrato_id": int(r["contrato_id"]),
                "presupuesto_id": int(r["id"]),
                "subcontratista_id": int(r["subcontratista_id"]),
                "cantidad": float(r.get("cant_total") or 0),
            }, on_conflict="presupuesto_id,subcontratista_id").execute()
        print(f"Backfill aplicado a {len(huérfanos)} filas (solo FK actual).")
        print(
            "ATENCIÓN: esto NO restaura el subcontratista anterior reemplazado. "
            "Revise logs de presupuesto_bulk_subcontratista / legado_exclusivo."
        )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply-ddl", action="store_true")
    ap.add_argument("--diagnose", action="store_true")
    args = ap.parse_args()
    if args.apply_ddl:
        db = (os.environ.get("SUPABASE_DB_URL") or "").strip()
        if not db:
            print("Falta SUPABASE_DB_URL", file=sys.stderr)
            sys.exit(1)
        apply_ddl(db)
    if args.diagnose:
        url = (os.environ.get("SUPABASE_URL") or "").strip()
        key = (os.environ.get("SUPABASE_KEY") or "").strip()
        if not url or not key:
            print("Faltan SUPABASE_URL / SUPABASE_KEY", file=sys.stderr)
            sys.exit(1)
        diagnose_rest(url, key)
    if not args.apply_ddl and not args.diagnose:
        ap.print_help()


if __name__ == "__main__":
    main()
