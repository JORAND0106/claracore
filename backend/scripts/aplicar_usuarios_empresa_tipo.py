#!/usr/bin/env python3
"""Aplica migration usuarios.empresa_tipo + seed Coordinador de Topografía vía PostgREST/SQL.

Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_KEY con privilegios).
Usa el endpoint SQL de Supabase Management si hay DATABASE_URL con psql; si no,
ejecuta statements vía supabase-py RPC `exec_sql` si existe, o imprime el SQL.

Uso preferido con DATABASE_URL:
  DATABASE_URL=postgresql://... python3 scripts/aplicar_usuarios_empresa_tipo.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "sql" / "usuarios_empresa_tipo.sql"


def _load_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, _, v = s.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def main() -> int:
    _load_env()
    sql = SQL_PATH.read_text(encoding="utf-8")
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if db_url:
        import subprocess

        print(f"Aplicando {SQL_PATH.name} vía psql…")
        proc = subprocess.run(
            ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-f", str(SQL_PATH)],
            capture_output=True,
            text=True,
        )
        sys.stdout.write(proc.stdout or "")
        sys.stderr.write(proc.stderr or "")
        return proc.returncode

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
    )
    if not url or not key:
        print(
            "Faltan DATABASE_URL o SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY.\n"
            f"SQL listo en: {SQL_PATH}",
            file=sys.stderr,
        )
        return 2

    # Intentar RPC exec_sql si el proyecto la tiene
    try:
        from supabase import create_client

        sb = create_client(url, key)
        try:
            sb.rpc("exec_sql", {"query": sql}).execute()
            print("Migración aplicada vía RPC exec_sql.")
            return 0
        except Exception as rpc_err:
            print(f"RPC exec_sql no disponible: {rpc_err}", file=sys.stderr)
    except Exception as e:
        print(f"No se pudo crear cliente supabase: {e}", file=sys.stderr)

    print(
        "No se pudo ejecutar SQL automáticamente. Contenido a aplicar:\n"
        f"--- {SQL_PATH} ---\n{sql}",
        file=sys.stderr,
    )
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
