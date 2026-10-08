"""
Aplica migraciones SQL idempotentes vía conexión Postgres directa.

PostgREST (SUPABASE_KEY) no puede ejecutar DDL. Cuando existe SUPABASE_DB_URL
(URI postgresql://…), este runner aplica archivos de backend/migrations/ y
registra los aplicados en public.schema_migrations.

Uso:
  SUPABASE_DB_URL=postgresql://... python -m schema_migrations_runner
  SUPABASE_DB_URL=... python -m schema_migrations_runner --only 20260925120000_bitacora_asistencia_rrhh_activa.sql
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Iterable, List, Optional

_log = logging.getLogger("claracore.schema_migrations")

ROOT = Path(__file__).resolve().parent
MIGRATIONS_DIR = ROOT / "migrations"

# Migraciones críticas que el arranque / deploy deben asegurar aunque el
# historial completo aún no se haya corrido (idempotentes con IF NOT EXISTS).
CRITICAL_MIGRATIONS = (
    "20260925120000_bitacora_asistencia_rrhh_activa.sql",
)

_ENSURE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
"""


def _db_url() -> str:
    return (os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL") or "").strip()


def list_migration_files(*, only: Optional[Iterable[str]] = None) -> List[Path]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    wanted = {str(x).strip() for x in (only or []) if str(x).strip()}
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if wanted:
        files = [p for p in files if p.name in wanted]
    return files


def apply_sql_files(db_url: str, paths: List[Path], *, record: bool = True) -> List[str]:
    """Aplica los SQL dados. Devuelve nombres aplicados en esta corrida."""
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError(
            "psycopg no está instalado. Añada psycopg[binary] a requirements.txt"
        ) from exc

    applied: List[str] = []
    with psycopg.connect(db_url) as conn:
        conn.execute("BEGIN")
        if record:
            conn.execute(_ENSURE_TABLE_SQL)
        already: set[str] = set()
        if record:
            rows = conn.execute("SELECT filename FROM public.schema_migrations").fetchall()
            already = {str(r[0]) for r in rows}
        for path in paths:
            name = path.name
            if name in already:
                _log.info("skip already applied: %s", name)
                continue
            sql = path.read_text(encoding="utf-8")
            _log.info("applying %s", name)
            conn.execute(sql)
            if record:
                conn.execute(
                    "INSERT INTO public.schema_migrations (filename) VALUES (%s) "
                    "ON CONFLICT (filename) DO NOTHING",
                    (name,),
                )
            applied.append(name)
        # Asegura refresh de PostgREST aunque el SQL individual no lo traiga.
        try:
            conn.execute("NOTIFY pgrst, 'reload schema'")
        except Exception as exc:
            _log.warning("NOTIFY pgrst falló: %s", exc)
        conn.commit()
    return applied


def ensure_critical_migrations(*, only: Optional[Iterable[str]] = None) -> dict:
    """
    Best-effort: aplica migraciones críticas si hay SUPABASE_DB_URL.
    No lanza si falta la URL (degradación silenciosa para App Service sin DDL).
    """
    db = _db_url()
    names = list(only) if only is not None else list(CRITICAL_MIGRATIONS)
    if not db:
        return {"ok": False, "reason": "missing_SUPABASE_DB_URL", "applied": []}
    paths = list_migration_files(only=names)
    missing = [n for n in names if not (MIGRATIONS_DIR / n).is_file()]
    if missing:
        return {"ok": False, "reason": "missing_files", "missing": missing, "applied": []}
    try:
        applied = apply_sql_files(db, paths, record=True)
        return {"ok": True, "applied": applied, "reason": None}
    except Exception as exc:
        _log.exception("ensure_critical_migrations falló: %s", exc)
        return {"ok": False, "reason": str(exc), "applied": []}


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(description="Aplica migraciones SQL vía SUPABASE_DB_URL")
    p.add_argument(
        "--only",
        action="append",
        default=[],
        help="Solo estos filenames (repetible). Default: todas las de migrations/",
    )
    p.add_argument(
        "--critical",
        action="store_true",
        help="Solo las migraciones CRITICAL_MIGRATIONS",
    )
    args = p.parse_args(argv)
    db = _db_url()
    if not db:
        print("Falta SUPABASE_DB_URL (o DATABASE_URL)", file=sys.stderr)
        return 2
    if args.critical:
        only = CRITICAL_MIGRATIONS
    elif args.only:
        only = args.only
    else:
        only = None
    paths = list_migration_files(only=only)
    if not paths:
        print("No hay archivos de migración que aplicar", file=sys.stderr)
        return 1
    applied = apply_sql_files(db, paths, record=True)
    print(f"OK aplicados={applied or '(ninguno nuevo)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
