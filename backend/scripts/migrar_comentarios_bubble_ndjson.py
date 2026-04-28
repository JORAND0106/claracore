r"""
Inserta filas en public.so_registro_comentarios desde Bubble/comentarios.ndjson.

El texto guardado en mensaje se arma así (sin depender de usuarios en BD):
  body & Comentario creado por & creador & migrador desde Bubble

(en SQL: concat con esos literales; el separador es el carácter &).

Cada línea del NDJSON:
  Registro → so_registros.numero_registro (mismo contrato)
  Body     → parte inicial del mensaje
  Creador  → va en el tramo "Comentario creado por"
  Etiqueta → etiqueta
  Enlace   → enlaces jsonb si hay URL

autor_id: un solo id opcional (MIGRACION_AUTOR_ID o USUARIO_FALLBACK_ID) para todas
las filas, por si la columna es NOT NULL. Si no defines la variable → NULL::bigint.

Requiere CONTRATO_ID.

Opcional:
  NDJSON_PATH, OUT_DIR
  NUM_LOTES — ej. 5 = exactamente 5 archivos SQL (reparto equilibrado de filas).
  BATCH_SIZE — si no usas NUM_LOTES: filas por archivo (defecto 3000).
  MIGRACION_AUTOR_ID o USUARIO_FALLBACK_ID — mismo efecto (entero, un usuario técnico)
  DEDUPE=1 — deduplica (num_reg, msg, creador, etiq, enlace)

Uso — solo 5 lotes:
  $env:CONTRATO_ID="2"
  $env:DEDUPE="1"
  $env:NUM_LOTES="5"
  python backend\\scripts\\migrar_comentarios_bubble_ndjson.py

Uso — ~3000 filas por archivo (los que salgan):
  $env:BATCH_SIZE="3000"
  python backend\\scripts\\migrar_comentarios_bubble_ndjson.py
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


def _get_ci(d: dict, *candidates: str):
    keys_lower = {str(k).lower(): k for k in d}
    for c in candidates:
        if c in d:
            return d[c]
        kl = c.lower()
        if kl in keys_lower:
            return d[keys_lower[kl]]
    return None


def _dollar_quote(s: str) -> str:
    tag = "d"
    while f"${tag}$" in s:
        tag += "x"
    return f"${tag}${s}${tag}$"


def _norm_ws(s: str) -> str:
    return " ".join((s or "").split())


def main() -> int:
    _load_env_file()

    cid_raw = os.environ.get("CONTRATO_ID", "").strip()
    if not cid_raw:
        print("Defina CONTRATO_ID.", file=sys.stderr)
        return 1
    try:
        contrato_id = int(cid_raw, 10)
    except ValueError:
        print("CONTRATO_ID inválido.", file=sys.stderr)
        return 1

    ma = os.environ.get("MIGRACION_AUTOR_ID", "").strip()
    fb = os.environ.get("USUARIO_FALLBACK_ID", "").strip()
    raw_autor = ma or fb
    autor_tecnico_id: int | None = None
    if raw_autor:
        try:
            autor_tecnico_id = int(raw_autor, 10)
        except ValueError:
            src = "MIGRACION_AUTOR_ID" if ma else "USUARIO_FALLBACK_ID"
            print(
                f"Aviso: {src}={raw_autor!r} no es un entero válido; se generará autor_id = NULL.\n"
                "  Si queda de una prueba anterior, en PowerShell: "
                "Remove-Item Env:\\USUARIO_FALLBACK_ID, Env:\\MIGRACION_AUTOR_ID -ErrorAction SilentlyContinue\n"
                "  Revisa también backend/.env si allí quedó un placeholder.",
                file=sys.stderr,
            )
            autor_tecnico_id = None

    dedupe = os.environ.get("DEDUPE", "0").strip().lower() in ("1", "true", "yes")

    repo_root = Path(__file__).resolve().parents[2]
    ndjson = Path(os.environ.get("NDJSON_PATH", "").strip() or repo_root / "Bubble" / "comentarios.ndjson")
    if not ndjson.is_file():
        print(f"No existe: {ndjson}", file=sys.stderr)
        return 1

    out_dir = Path(os.environ.get("OUT_DIR", "").strip() or repo_root / "backend" / "sql" / "migrar_comentarios_bubble")
    out_dir.mkdir(parents=True, exist_ok=True)

    rows: list[tuple[int, str, str, str, str]] = []
    bad = 0
    seen: set[tuple[int, str, str, str, str]] = set()

    with ndjson.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                bad += 1
                continue
            reg = _get_ci(o, "Registro", "registro", "REGISTRO")
            body = _get_ci(o, "Body", "body", "BODY")
            creador = _get_ci(o, "Creador", "creador", "CREADOR")
            etiq = _get_ci(o, "Etiqueta", "etiqueta", "ETIQUETA")
            enlace = _get_ci(o, "Enlace", "enlace", "ENLACE", "Enlace")

            if reg is None or body is None:
                bad += 1
                continue
            try:
                num = int(str(reg).strip(), 10)
            except ValueError:
                bad += 1
                continue
            if num <= 0:
                bad += 1
                continue

            msg = str(body).strip()
            if not msg:
                bad += 1
                continue

            cr = _norm_ws(str(creador or ""))
            et = (str(etiq).strip() if etiq else "") or ""
            en = (str(enlace).strip() if enlace else "") or ""

            tup = (num, msg, cr, et, en)
            if dedupe:
                if tup in seen:
                    continue
                seen.add(tup)
            rows.append(tup)

    if not rows:
        print("No hay filas válidas.", file=sys.stderr)
        return 1

    num_lotes_raw = os.environ.get("NUM_LOTES", "").strip()
    reparto_note = ""
    chunks: list[list[tuple[int, str, str, str, str]]] = []

    if num_lotes_raw:
        try:
            nl = int(num_lotes_raw, 10)
        except ValueError:
            print("NUM_LOTES debe ser un entero (ej. 5).", file=sys.stderr)
            return 1
        if nl < 1:
            print("NUM_LOTES debe ser >= 1.", file=sys.stderr)
            return 1
        n_parts = nl
        for i in range(nl):
            start = i * len(rows) // nl
            end = (i + 1) * len(rows) // nl
            chunks.append(rows[start:end])
        sizes = [len(c) for c in chunks]
        reparto_note = f"NUM_LOTES={nl} | filas por parte: min {min(sizes)}, max {max(sizes)}"
    else:
        batch = int(os.environ.get("BATCH_SIZE", "3000"), 10)
        if batch < 1:
            batch = 3000
        n_parts = (len(rows) + batch - 1) // batch
        chunks = [rows[p * batch : (p + 1) * batch] for p in range(n_parts)]
        reparto_note = f"BATCH_SIZE={batch}"

    chunks = [c for c in chunks if c]
    if not chunks:
        print("Sin filas tras reparto (revisa NUM_LOTES o datos).", file=sys.stderr)
        return 1
    n_parts = len(chunks)

    autor_sql = "NULL::bigint" if autor_tecnico_id is None else str(autor_tecnico_id)

    ins_header = f"""-- Migración comentarios Bubble → so_registro_comentarios
-- contrato_id = {contrato_id}
-- filas: {len(rows)} | líneas omitidas: {bad} | dedupe: {1 if dedupe else 0}
-- reparto: {reparto_note}
-- mensaje = msg || '&Comentario creado por&' || creador || '&migrador desde Bubble'
-- autor_id fijo (todos los INSERT): {autor_sql}
-- JOIN so_registros: solo inserta si existe numero_registro en el contrato.

"""

    for p, chunk in enumerate(chunks):
        val_lines = []
        for num, msg, cr, et, en in chunk:
            val_lines.append(
                "  ("
                + str(num)
                + ", "
                + _dollar_quote(cr)
                + ", "
                + _dollar_quote(msg)
                + ", "
                + _dollar_quote(et)
                + ", "
                + _dollar_quote(en)
                + ")"
            )
        vals = ",\n".join(val_lines)

        head = ins_header if p == 0 else f"-- contrato_id = {contrato_id} | parte {p + 1}/{n_parts}\n\n"

        sql_body = f"""{head}BEGIN;

INSERT INTO public.so_registro_comentarios (
  registro_id,
  contrato_id,
  autor_id,
  rol_origen,
  confidencialidad,
  destinatarios,
  etiqueta,
  asunto,
  mensaje,
  enlaces,
  tipo,
  padre_id,
  nivel_validacion
)
SELECT
  r.id,
  {contrato_id},
  {autor_sql},
  'contratista',
  'publico',
  '[]'::jsonb,
  NULLIF(trim(v.etiq), ''),
  NULL,
  concat(
    v.msg,
    '&Comentario creado por&',
    trim(v.creador),
    '&migrador desde Bubble'
  ),
  CASE
    WHEN trim(coalesce(v.enlace, '')) = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(trim(v.enlace))
  END,
  'validacion',
  NULL,
  NULL
FROM (
  VALUES
{vals}
) AS v(num_reg, creador, msg, etiq, enlace)
JOIN public.so_registros r
  ON r.contrato_id = {contrato_id}
 AND r.numero_registro = v.num_reg
;

COMMIT;
"""

        out = out_dir / f"contrato_{contrato_id}_comentarios_parte_{p + 1:03d}_de_{n_parts:03d}.sql"
        out.write_text(sql_body, encoding="utf-8")
        print(out)

    readme = out_dir / "README.txt"
    readme.write_text(
        f"""Generado migrar_comentarios_bubble_ndjson.py
contrato_id={contrato_id}
filas_sql={len(rows)}
partes={n_parts}
reparto={reparto_note}
dedupe={'1' if dedupe else '0'}
autor_id_todos={autor_sql}
ndjson={ndjson}

mensaje = body & Comentario creado por & creador & migrador desde Bubble

Si autor_id es NOT NULL en la tabla, define MIGRACION_AUTOR_ID con un id válido de usuarios.
Ejecutar partes en orden en SQL Editor.
""",
        encoding="utf-8",
    )
    print(readme)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
