r"""
Actualiza so_reportes.descripcion_actividad desde Bubble/nombre_reportes.ndjson.

Cada línea es un JSON con:
  "00_CONSECUTIVO"   → numero_reporte (por contrato en ClaraCore)
  "01_DESCRIPCION"   → texto de la actividad / nombre del reporte

Requiere CONTRATO_ID: los números de reporte son por contrato.

Uso (desde la raíz del repo):
  $env:CONTRATO_ID="2"
  python backend\scripts\actualizar_nombres_reportes_desde_ndjson.py

Opcional:
  $env:NDJSON_PATH="C:\...\nombre_reportes.ndjson"
  $env:BATCH_SIZE=400
  $env:OUT_DIR="backend\sql\update_nombres_reportes"

Genera SQL listo para SQL Editor de Supabase (transacción por archivo).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _load_env_file() -> None:
    here = Path(__file__).resolve()
    for candidate in (here.parents[1] / ".env", here.parents[2] / "backend" / ".env", Path.cwd() / ".env"):
        if not candidate.is_file():
            continue
        try:
            for line in candidate.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip()
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                elif v.startswith("'") and v.endswith("'"):
                    v = v[1:-1]
                if k and k not in os.environ:
                    os.environ[k] = v
        except OSError:
            pass
        break


def _dollar_quote(s: str) -> str:
    tag = "d"
    while f"${tag}$" in s:
        tag += "x"
    return f"${tag}${s}${tag}$"


def main() -> int:
    _load_env_file()

    cid_raw = os.environ.get("CONTRATO_ID", "").strip()
    if not cid_raw:
        print("Defina CONTRATO_ID (entero).", file=sys.stderr)
        return 1
    try:
        contrato_id = int(cid_raw, 10)
    except ValueError:
        print("CONTRATO_ID inválido.", file=sys.stderr)
        return 1

    repo_root = Path(__file__).resolve().parents[2]
    ndjson = Path(os.environ.get("NDJSON_PATH", "").strip() or repo_root / "Bubble" / "nombre_reportes.ndjson")
    if not ndjson.is_file():
        print(f"No existe el NDJSON: {ndjson}", file=sys.stderr)
        return 1

    batch = int(os.environ.get("BATCH_SIZE", "400"))
    if batch < 1:
        batch = 400

    out_dir = Path(os.environ.get("OUT_DIR", "").strip() or repo_root / "backend" / "sql" / "update_nombres_reportes")
    out_dir.mkdir(parents=True, exist_ok=True)

    by_num: dict[int, str] = {}
    bad_lines = 0

    with ndjson.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                bad_lines += 1
                continue
            raw = o.get("00_CONSECUTIVO") or o.get("CONSECUTIVO")
            desc = o.get("01_DESCRIPCION") or o.get("DESCRIPCION")
            if raw is None or desc is None:
                bad_lines += 1
                continue
            try:
                num = int(str(raw).strip(), 10)
            except ValueError:
                bad_lines += 1
                continue
            if num <= 0:
                bad_lines += 1
                continue
            by_num[num] = str(desc).strip()

    rows = sorted(by_num.items(), key=lambda x: x[0])
    n_parts = (len(rows) + batch - 1) // batch if rows else 0

    if not rows:
        print("No hay filas válidas en el NDJSON.", file=sys.stderr)
        return 1

    for p in range(n_parts):
        chunk = rows[p * batch : (p + 1) * batch]
        vals = ",\n  ".join(
            f"({num}, {_dollar_quote(desc)}::text)" for num, desc in chunk
        )
        head = (
            f"""-- Actualizar descripcion_actividad desde Bubble (nombre_reportes.ndjson)
-- contrato_id = {contrato_id}
-- filas únicas en mapa: {len(rows)} | líneas omitidas/erróneas: {bad_lines}
-- ndjson: {ndjson}
-- parte {p + 1} de {n_parts}
-- Ejecutar en Supabase SQL Editor.

"""
            if p == 0
            else f"""-- contrato_id = {contrato_id} | parte {p + 1}/{n_parts}

"""
        )
        body = f"""{head}BEGIN;

UPDATE public.so_reportes AS r
SET descripcion_actividad = v.txt
FROM (
  VALUES
  {vals}
) AS v(numero_reporte, txt)
WHERE r.contrato_id = {contrato_id}
  AND r.numero_reporte = v.numero_reporte;

COMMIT;
"""
        out = out_dir / f"contrato_{contrato_id}_parte_{p + 1:03d}_de_{n_parts:03d}.sql"
        out.write_text(body, encoding="utf-8")
        print(out)

    readme = out_dir / "README.txt"
    readme.write_text(
        f"""Generado por actualizar_nombres_reportes_desde_ndjson.py
contrato_id={contrato_id}
filas_unicas={len(rows)}
partes_sql={n_parts}
ndjson={ndjson}

Ejecute los .sql en orden (001, 002, …) en Supabase SQL Editor.
Si un numero_reporte no existe en ese contrato, no se modifica ninguna fila.
""",
        encoding="utf-8",
    )
    print(readme)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())