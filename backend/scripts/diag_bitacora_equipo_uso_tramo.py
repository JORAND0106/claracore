#!/usr/bin/env python3
"""
Diagnóstico SOLO LECTURA — columnas tramo / operador_rrhh_id en Maquinaria (prod).

Usa PostgREST: si la columna no existe, Supabase responde 42703.

Uso:
  VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... \\
    python3 backend/scripts/diag_bitacora_equipo_uso_tramo.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def _env(*names: str) -> str:
    for n in names:
        v = (os.getenv(n) or "").strip()
        if v:
            return v
    return ""


def probe(url: str, key: str, table: str, select: str) -> dict:
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/{table}?select={select}&limit=1",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            body = res.read().decode("utf-8", errors="replace")
            return {"ok": True, "status": res.status, "body": body[:500]}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "status": exc.code, "body": body[:800]}


def main() -> int:
    url = _env("SUPABASE_URL", "VITE_SUPABASE_URL")
    key = _env("SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        print("MISSING_SECRETS: SUPABASE_URL + key", file=sys.stderr)
        return 2

    checks = [
        ("equipo_uso.tramo", "seguimiento_bitacora_equipo_uso", "id,tramo"),
        ("equipo_uso.operador_rrhh_id", "seguimiento_bitacora_equipo_uso", "id,operador_rrhh_id"),
        ("equipo_uso.baseline", "seguimiento_bitacora_equipo_uso", "id,equipo_nombre,cantidad"),
        ("entrada.tramo (doc)", "seguimiento_bitacora_entrada", "id,tramo"),
    ]
    out = {}
    for label, table, select in checks:
        r = probe(url, key, table, select)
        missing = (
            not r["ok"]
            and "does not exist" in (r.get("body") or "").lower()
        )
        out[label] = {
            **r,
            "column_missing": missing,
        }
        flag = "MISSING" if missing else ("OK" if r["ok"] else f"ERR {r['status']}")
        print(f"{flag:8} {label}", file=sys.stderr)

    print(json.dumps(out, indent=2, ensure_ascii=False))
    # Exit 1 si falta tramo (causa del 400 de Maquinaria)
    if out.get("equipo_uso.tramo", {}).get("column_missing"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
