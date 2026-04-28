# Bubble/migrar_foto_numero_nombre_fotos.py
"""
Rellena so_registros.foto_numero desde el export Bubble «nombre_fotos» (mapeo por número de registro).

Archivo fuente (ndjson Bubble «nombre_fotos», ej. Bubble/nombre_fotos.ndjson):
  - 01_NUMERO REGISTRO
  - 42_NUM IMAGEN → número de foto (se guarda en ClaraCore como foto_numero)
  - 42_IMAGEN_id (u otros id) opcional; si está vacío se ignora

También se aceptan columnas 42_IMAGEN si el export usa ese nombre en vez de 42_NUM IMAGEN.

La migración principal (migrar_sicoe_73, etc.) suele traer Old IMAGEN → foto_url pero no rellenaba foto_numero;
este script alinea foto_numero para que migrar_fotos_cloudinary / update_fotos.sql y la UI encuentren la imagen por número.

Formatos: .csv (utf-8-sig), .ndjson (una fila Bubble por línea), .xlsx (requiere openpyxl).

Variables de entorno:
  SUPABASE_URL, SUPABASE_KEY — mismo backend/.env que el resto de migraciones
  SICOE_CONTRATO_ID — default 2
  NOMBRE_FOTOS_PATH — ruta absoluta o relativa al archivo; si no se define, busca en esta carpeta:
      nombre_fotos.csv, nombre_fotos.ndjson, nombre_fotos.xlsx
  FOTO_NUMERO_DRY_RUN — 1 / true / yes: solo lee, muestra conteos y muestra, sin UPDATE
  FOTO_NUMERO_SQL_OUT — ruta opcional; si está definida, escribe un solo SQL (puede exceder el límite del editor)
  FOTO_NUMERO_SQL_OUT_DIR — carpeta; escribe parte_001.sql … (recomendado para Supabase SQL Editor)

Uso:
  cd ClaraCore
  python Bubble/migrar_foto_numero_nombre_fotos.py
  python Bubble/migrar_foto_numero_nombre_fotos.py --sql-out-dir backend/sql/patch_foto_numero_partes --sql-only
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

BUBBLE_DIR = Path(__file__).resolve().parent
BACKEND_ENV = BUBBLE_DIR.parent / "backend" / ".env"

CONTRATO_ID = int(os.environ.get("SICOE_CONTRATO_ID", "2"))
DRY_RUN = os.environ.get("FOTO_NUMERO_DRY_RUN", "").strip().lower() in ("1", "true", "yes", "si", "sí")

CAND_NUM_REG = (
    "01_numero registro",
    "01_NUMERO REGISTRO",
    "numero registro",
    "NUMERO REGISTRO",
    "numero_registro",
    "número registro",
    "n° registro",
    "n registro",
)
CAND_42_IMG = (
    "42_num imagen",
    "42_NUM IMAGEN",
    "42_NUM_IMAGEN",
    "42_imagen",
    "42_IMAGEN",
    "42 Imagen",
)
CAND_42_IMG_ID = (
    "42_imagen_id",
    "42_IMAGEN_id",
    "42_imagenid",
    "42_ImagenID",
    "42_IMAGENID",
    "42 ImagenID",
)


def _norm_h(s: str) -> str:
    return re.sub(r"[\s_]+", "", str(s or "").strip().lower().replace("í", "i"))


def _detect_columns(keys: list[str]) -> tuple[str | None, str | None, str | None]:
    """Devuelve (key_num_reg, key_42_imagen, key_42_imagen_id) usando los nombres reales del archivo."""
    nh = {_norm_h(k): k for k in keys}
    k_nr = None
    for c in CAND_NUM_REG:
        if _norm_h(c) in nh:
            k_nr = nh[_norm_h(c)]
            break
    if k_nr is None:
        for raw, orig in nh.items():
            if "numeroregistro" in raw or raw.endswith("numregistro"):
                k_nr = orig
                break
    k_im = None
    for c in CAND_42_IMG:
        if _norm_h(c) in nh:
            k_im = nh[_norm_h(c)]
            break
    if k_im is None:
        for raw, orig in nh.items():
            if raw in ("42imagen", "42numimagen") or raw.endswith("42imagen"):
                k_im = orig
                break
    if k_im is None:
        for raw, orig in nh.items():
            if raw.startswith("42") and "num" in raw and "imagen" in raw:
                k_im = orig
                break
    k_id = None
    for c in CAND_42_IMG_ID:
        if _norm_h(c) in nh:
            k_id = nh[_norm_h(c)]
            break
    return k_nr, k_im, k_id


def _parse_int_foto(v) -> int | None:
    if v in (None, "", "null"):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int) and not isinstance(v, bool):
        return int(v)
    if isinstance(v, float):
        if not math.isfinite(v) or v != v:
            return None
        try:
            i = int(v)
        except (OverflowError, ValueError):
            return None
        return i if float(i) == v else None
    s = str(v).strip()
    if not s or s.lower() in ("null", "none", "-"):
        return None
    s = s.replace(",", ".").split(".")[0] if re.match(r"^-?\d+[\.,]\d+$", s) else s
    try:
        f = float(s)
        if not math.isfinite(f):
            return None
        return int(f)
    except (ValueError, TypeError, OverflowError):
        m = re.search(r"-?\d+", s)
        if m:
            try:
                return int(m.group(0))
            except ValueError:
                pass
    return None


def _parse_numero_registro(v) -> int | None:
    return _parse_int_foto(v)


def resolve_input_path(explicit: str | None) -> Path:
    if explicit:
        p = Path(explicit)
        if not p.is_file():
            print(f"No existe el archivo: {p}", file=sys.stderr)
            sys.exit(1)
        return p.resolve()
    env_p = os.environ.get("NOMBRE_FOTOS_PATH", "").strip()
    if env_p:
        p = Path(env_p)
        if not p.is_file():
            print(f"NOMBRE_FOTOS_PATH no es archivo válido: {p}", file=sys.stderr)
            sys.exit(1)
        return p.resolve()
    for name in ("nombre_fotos.csv", "nombre_fotos.ndjson", "nombre_fotos.xlsx"):
        c = BUBBLE_DIR / name
        if c.is_file():
            return c.resolve()
    alt = BUBBLE_DIR.parent / "backend" / "bubble" / "nombre_fotos.csv"
    if alt.is_file():
        return alt.resolve()
    print(
        "No se encontró nombre_fotos (csv/ndjson/xlsx). "
        "Colócalo en Bubble/ o backend/bubble/ o define NOMBRE_FOTOS_PATH.",
        file=sys.stderr,
    )
    sys.exit(1)


def load_mapping_csv(path: Path) -> dict[int, int]:
    out: dict[int, int] = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        if not r.fieldnames:
            return out
        k_nr, k_im, _k_id = _detect_columns(list(r.fieldnames))
        if not k_nr or not k_im:
            print(f"Columnas detectadas: num_reg={k_nr!r}, 42_imagen={k_im!r}", file=sys.stderr)
            print(f"Cabeceras: {r.fieldnames}", file=sys.stderr)
            raise SystemExit("No se pudo detectar columna de número de registro y/o 42_IMAGEN.")
        for row in r:
            nr = _parse_numero_registro(row.get(k_nr))
            fn = _parse_int_foto(row.get(k_im))
            if nr is None or fn is None:
                continue
            out[nr] = fn
    return out


def load_mapping_ndjson(path: Path) -> dict[int, int]:
    out: dict[int, int] = {}
    k_nr = k_im = None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        if not isinstance(row, dict):
            continue
        if k_nr is None:
            k_nr, k_im, _k_id = _detect_columns(list(row.keys()))
            if not k_nr or not k_im:
                print(f"Claves ejemplo: {list(row.keys())[:20]}", file=sys.stderr)
                raise SystemExit("No se pudo detectar número de registro y/o 42_IMAGEN en ndjson.")
        nr = _parse_numero_registro(row.get(k_nr))
        fn = _parse_int_foto(row.get(k_im))
        if nr is None or fn is None:
            continue
        out[nr] = fn
    return out


def load_mapping_xlsx(path: Path) -> dict[int, int]:
    try:
        import openpyxl  # type: ignore
    except ImportError:
        raise SystemExit("Instala openpyxl: pip install openpyxl") from None
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None)
    if not header:
        return {}
    keys = [str(c).strip() if c is not None else "" for c in header]
    k_nr, k_im, _k_id = _detect_columns(keys)
    if not k_nr or not k_im:
        print(f"Columnas hoja: {keys}", file=sys.stderr)
        raise SystemExit("No se pudo detectar número de registro y/o 42_IMAGEN en xlsx.")
    idx_nr = keys.index(k_nr)
    idx_im = keys.index(k_im)
    out: dict[int, int] = {}
    for tup in rows:
        if not tup:
            continue
        nr = _parse_numero_registro(tup[idx_nr] if idx_nr < len(tup) else None)
        fn = _parse_int_foto(tup[idx_im] if idx_im < len(tup) else None)
        if nr is None or fn is None:
            continue
        out[nr] = fn
    return out


def load_mapping(path: Path) -> dict[int, int]:
    suf = path.suffix.lower()
    if suf == ".csv":
        return load_mapping_csv(path)
    if suf == ".ndjson":
        return load_mapping_ndjson(path)
    if suf in (".xlsx", ".xlsm"):
        return load_mapping_xlsx(path)
    raise SystemExit(f"Extensión no soportada: {suf} (use .csv, .ndjson, .xlsx)")


def write_sql_case_chunks(mapping: dict[int, int], contrato: int, out_path: Path, chunk: int = 400) -> None:
    items = sorted(mapping.items(), key=lambda x: x[0])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    parts: list[str] = [
        f"-- foto_numero desde nombre_fotos (contrato_id={contrato}) — generado por migrar_foto_numero_nombre_fotos.py\n",
    ]
    for i in range(0, len(items), chunk):
        batch = items[i : i + chunk]
        whens = "\n  ".join(f"WHEN '{nr}' THEN {fn}" for nr, fn in batch)
        nums = ",".join(repr(str(nr)) for nr, _ in batch)
        parts.append(
            f"""UPDATE public.so_registros SET foto_numero = (CASE numero_registro::text
  {whens}
  ELSE foto_numero
END)
WHERE contrato_id = {contrato} AND numero_registro::text IN ({nums});\n\n"""
        )
    out_path.write_text("".join(parts), encoding="utf-8")
    print(f"SQL escrito: {out_path} ({len(items)} filas en {((len(items)-1)//chunk)+1} sentencias)")


def write_sql_values_parts(
    mapping: dict[int, int],
    contrato: int,
    out_dir: Path,
    *,
    batch_size: int = 200,
    max_bytes_per_file: int = 75000,
) -> int:
    """
    Varias consultas pequeñas (UPDATE … FROM VALUES) en archivos parte_XXX.sql.
    Evita el límite de tamaño del SQL Editor de Supabase al pegar todo en un solo bloque.
    """
    items = sorted(mapping.items(), key=lambda x: x[0])
    out_dir.mkdir(parents=True, exist_ok=True)

    def one_update(batch: list[tuple[int, int]]) -> str:
        vals = ",\n  ".join(f"({nr}::bigint,{fn}::bigint)" for nr, fn in batch)
        return (
            f"UPDATE public.so_registros AS s SET foto_numero = v.fn\n"
            f"FROM (VALUES\n  {vals}\n) AS v(nr, fn)\n"
            f"WHERE s.contrato_id = {contrato} AND s.numero_registro = v.nr;\n\n"
        )

    part = 1
    buf: list[str] = []
    current_bytes = 0
    header_budget = 220

    def flush() -> None:
        nonlocal part, buf, current_bytes
        if not buf:
            return
        hdr = (
            f"-- foto_numero (contrato_id={contrato}) — partes para SQL Editor Supabase\n"
            f"-- Ejecuta este archivo; luego el siguiente (parte_{part + 1:03d}.sql) hasta el ultimo.\n\n"
        )
        p = out_dir / f"parte_{part:03d}.sql"
        p.write_text(hdr + "".join(buf), encoding="utf-8")
        part += 1
        buf = []
        current_bytes = 0

    for j in range(0, len(items), batch_size):
        block = one_update(items[j : j + batch_size])
        b = len(block.encode("utf-8"))
        if buf and current_bytes + b + header_budget > max_bytes_per_file:
            flush()
        if not buf:
            current_bytes = header_budget
        buf.append(block)
        current_bytes += b
    flush()
    nfiles = part - 1
    print(
        f"SQL partes: {out_dir} ({nfiles} archivos, {len(items)} pares, batch_size~{batch_size})"
    )
    return nfiles


def apply_via_supabase(sb, mapping: dict[int, int], contrato: int) -> None:
    nums = sorted(mapping.keys())
    ok = skip = err = 0
    t0 = time.perf_counter()
    step = 150
    for i in range(0, len(nums), step):
        chunk = nums[i : i + step]

        def _sel(c=chunk):
            return (
                sb.table("so_registros")
                .select("id, numero_registro")
                .eq("contrato_id", contrato)
                .in_("numero_registro", c)
                .execute()
                .data
            )

        rows = _sel()
        by_nr: dict[int, list[int]] = {}
        for r in rows or []:
            rid = r.get("id")
            nr = r.get("numero_registro")
            if rid is None or nr is None:
                continue
            try:
                nri = int(nr)
            except (TypeError, ValueError):
                continue
            by_nr.setdefault(nri, []).append(rid)
        for nreg in chunk:
            fn = mapping.get(nreg)
            if fn is None:
                continue
            ids = by_nr.get(nreg) or []
            if not ids:
                skip += 1
                continue
            for rid in ids:
                try:
                    sb.table("so_registros").update({"foto_numero": fn}).eq("id", rid).execute()
                    ok += 1
                except Exception as e:
                    err += 1
                    print(f"  ERROR id={rid} num_reg={nreg}: {e}", file=sys.stderr)
        if (i + step) % 1500 == 0 or i + step >= len(nums):
            dt = time.perf_counter() - t0
            print(f"  … procesados {min(i + step, len(nums))}/{len(nums)} registros archivo | updates_ok≈{ok} sin_fila={skip} err={err} ({dt:.1f}s)")
    print(f"\nListo: filas actualizadas (por id)={ok}, sin coincidencia en BD={skip}, errores={err}")


def main() -> None:
    global CONTRATO_ID
    ap = argparse.ArgumentParser(description="Mapea 42_IMAGEN → so_registros.foto_numero por número de registro")
    ap.add_argument("archivo", nargs="?", help="CSV / NDJSON / XLSX (opcional si existe env o Bubble/nombre_fotos.*)")
    ap.add_argument("--contrato", type=int, default=None, help="contrato_id (default env SICOE_CONTRATO_ID o 2)")
    ap.add_argument("--dry-run", action="store_true", help="No escribe en BD")
    ap.add_argument("--sql-out", type=str, default=os.environ.get("FOTO_NUMERO_SQL_OUT", "").strip() or None)
    ap.add_argument(
        "--sql-out-dir",
        type=str,
        default=os.environ.get("FOTO_NUMERO_SQL_OUT_DIR", "").strip() or None,
        help="Carpeta con parte_001.sql … (tamaño apto para SQL Editor Supabase)",
    )
    ap.add_argument("--sql-only", action="store_true", help="Solo genera --sql-out, no llama a Supabase")
    args = ap.parse_args()
    if args.contrato is not None:
        CONTRATO_ID = args.contrato
    dry = DRY_RUN or args.dry_run
    load_dotenv(BACKEND_ENV)
    path = resolve_input_path(args.archivo)
    print(f"Archivo: {path.name}")
    print(f"contrato_id={CONTRATO_ID}  DRY_RUN={dry}\n")

    mapping = load_mapping(path)
    if not mapping:
        print("No hay filas válidas (numero_registro + 42_IMAGEN parseables).")
        sys.exit(1)
    print(f"Mapeos unicos numero_registro -> foto_numero: {len(mapping)}")
    sample = list(mapping.items())[:5]
    print(f"Muestra: {sample}")

    sql_dir = (args.sql_out_dir or "").strip() or None
    if sql_dir:
        write_sql_values_parts(mapping, CONTRATO_ID, Path(sql_dir))
        if dry or args.sql_only:
            return

    if args.sql_out:
        write_sql_case_chunks(mapping, CONTRATO_ID, Path(args.sql_out))
        if dry or args.sql_only:
            return

    if dry:
        print("\nDry-run: no se aplicaron cambios. Quitá --dry-run o FOTO_NUMERO_DRY_RUN para ejecutar.")
        return

    if args.sql_only:
        return

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Faltan SUPABASE_URL / SUPABASE_KEY en backend/.env", file=sys.stderr)
        sys.exit(1)
    sb = create_client(url, key)
    apply_via_supabase(sb, mapping, CONTRATO_ID)


if __name__ == "__main__":
    main()
