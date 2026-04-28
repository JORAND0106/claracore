r"""
Genera un UPDATE SQL para so_registros.foto_url a partir de imágenes en Cloudinary.

Problemas del script antiguo (migrar_fotos.py):
1) cloudinary.api.resources() sin "prefix" lista ~todo el account; las fotos en
   claracore/2/fotos no tienen prioridad y muchas quedan fuera de la paginación.
2) public_id con carpetas, p.ej. claracore/2/fotos/24197_xxx, no se puede leer
   el número con public_id.split("_")[0] (el primer token es "claracore/2/fotos/24197"
   o similar); hay que usar el último segmento (basename) y luego el prefijo
   numérico del archivo.
3) La migración antigua a veces dejó archivos en la **raíz** del cloud (`12345_abc.jpg`)
   sin ruta `claracore/2/fotos/`. El script hace: (a) listar bajo el prefijo de
   carpeta, (b) con INCLUDE_ACCOUNT_ROOT=1 (defecto), recorrer **toda** la cuenta
   e incorporar solo `public_id` **sin** `/` (archivos en raíz con número inicial).
   Si el mismo `foto_numero` está en carpeta y en raíz, gana la carpeta.

Uso (desde la raíz del repo ClaraCore). Lee backend/.env. Escribe:
  backend/sql/update_fotos.sql (monolítico; puede ser muy grande)
  backend/sql/update_fotos_partes/parte_XXX.sql — usar esto en el SQL Editor de Supabase (tamaño por partes).

  cd c:\...\ClaraCore
  $env:CONTRATO_ID="2"; python backend\scripts\migrar_fotos_cloudinary.py

Opcional: $env:PUBLIC_ID_PREFIX="claracore/2/fotos" si tus fotos están en otra ruta.
Opcional: $env:INCLUDE_ACCOUNT_ROOT="0" para solo listar el prefijo (más rápido).
Opcional: $env:DUMP_SQL_STDOUT="1" para imprimir el SQL monolítico por consola (pesado).

Nunca commitear API secrets. Rota el secret de Cloudinary si quedó en un .py
compartido o en un chat.
"""

from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import cloudinary
    import cloudinary.api
except ImportError:
    print("Instala: pip install cloudinary", file=sys.stderr)
    raise

CLOUDINARY_ROOT = "claracore"  # Misma raíz que backend/main.py


def _parse_contrato_id() -> int | None:
    raw = os.environ.get("CONTRATO_ID", "").strip()
    if not raw:
        return None
    try:
        n = int(raw, 10)
        return n if n > 0 else None
    except ValueError:
        return None


def _load_env_file() -> None:
    """Carga backend/.env si existe (mismas claves que el API). No sobreescribe variables ya seteadas."""
    here = Path(__file__).resolve()
    for candidate in (here.parents[1] / ".env", here.parents[0] / ".env", Path.cwd() / ".env"):
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
            continue
        break


def _esc_sql(s: str) -> str:
    return (s or "").replace("'", "''")


def write_update_foto_url_parts(
    fotos: list[tuple[str, str]],
    contrato_id: int,
    out_dir: Path,
    *,
    batch_size: int = 72,
    max_bytes_per_file: int = 65000,
) -> int:
    """
    UPDATE … FROM (VALUES (nº foto, url), …) por archivos pequeños (límite SQL Editor Supabase).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cid = int(contrato_id)
    part = 1
    buf: list[str] = []
    cur = 0
    hdr_budget = 280

    def flush() -> None:
        nonlocal part, buf, cur
        if not buf:
            return
        hdr = (
            f"-- foto_url desde Cloudinary (contrato_id={cid})\n"
            f"-- Ejecutar en orden: luego parte_{part + 1:03d}.sql si existe.\n\n"
        )
        (out_dir / f"parte_{part:03d}.sql").write_text(hdr + "".join(buf), encoding="utf-8")
        part += 1
        buf = []
        cur = 0

    for j in range(0, len(fotos), batch_size):
        chunk = fotos[j : j + batch_size]
        vals = ",\n  ".join(
            f"('{_esc_sql(n)}', '{_esc_sql(u)}')" for n, u in chunk
        )
        block = (
            f"UPDATE public.so_registros AS s SET foto_url = v.u\n"
            f"FROM (VALUES\n  {vals}\n) AS v(n, u)\n"
            f"WHERE s.contrato_id = {cid} AND s.foto_numero::text = v.n;\n\n"
        )
        b = len(block.encode("utf-8"))
        if buf and cur + b > max_bytes_per_file:
            flush()
        if not buf:
            cur = hdr_budget
        buf.append(block)
        cur += b
    flush()
    return part - 1


def _basename(public_id: str) -> str:
    return public_id.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def _numero_desde_basename(basename: str) -> str | None:
    """Coherente con Bubble (27696_xxx) y con la app ClaraCore (foto_27696)."""
    if not basename:
        return None
    low = basename.lower()
    if low.startswith("_inicial") or low.startswith("fotos de "):
        return None
    # Subidas desde la plataforma: public_id …/foto_27696
    m = re.match(r"^foto_(\d+)$", basename, re.IGNORECASE)
    if m:
        return m.group(1)
    # Lote Bubble / arrastre a Media Library: 27696_kc8501 o 27696
    m = re.match(r"^(\d+)(?:_|\.|$)", basename)
    if m:
        return m.group(1)
    return None


def _include_account_root() -> bool:
    v = (os.environ.get("INCLUDE_ACCOUNT_ROOT", "1") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _fetch_all_image_resources(cloudinary_mod, prefix: str | None) -> list[dict]:
    """Lista paginada; prefix=None = todo el account (puede ser lento)."""
    out: list[dict] = []
    next_cursor = None
    while True:
        p: dict = {
            "resource_type": "image",
            "type": "upload",
            "max_results": 500,
        }
        if prefix:
            p["prefix"] = prefix
        if next_cursor:
            p["next_cursor"] = next_cursor
        resultado = cloudinary_mod.api.resources(**p)
        out.extend(resultado.get("resources", []))
        next_cursor = resultado.get("next_cursor")
        if not next_cursor:
            break
    return out


def _ingest_resource(
    r: dict,
    by_num: dict[str, list[tuple[str, str]]],
) -> int:
    n = 0
    pid = (r.get("public_id") or "").strip()
    url = (r.get("secure_url") or r.get("url") or "").strip()
    if not pid or not url:
        return 0
    base = _basename(str(pid))
    num = _numero_desde_basename(base)
    if not num:
        return 0
    by_num[num].append((str(pid), str(url)))
    return 1


def main() -> None:
    _load_env_file()
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip().strip('"').strip("'")
    api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip().strip('"').strip("'")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip().strip('"').strip("'")
    contrato_id = _parse_contrato_id()
    contrato_numero = (os.environ.get("CONTRATO_NUMERO", "") or "").strip()
    if contrato_id is None and contrato_numero.isdigit():
        contrato_id = int(contrato_numero)
        contrato_numero = ""
    prefix_env = os.environ.get("PUBLIC_ID_PREFIX", "").strip().strip('"').strip("'")
    if prefix_env:
        prefix = prefix_env.strip("/ ")
    elif contrato_id is not None:
        prefix = f"{CLOUDINARY_ROOT}/{contrato_id}/fotos"
    else:
        prefix = "claracore/2/fotos"

    if not contrato_id and not contrato_numero:
        contrato_id = 2
        if not prefix_env:
            prefix = f"{CLOUDINARY_ROOT}/2/fotos"
        print(
            "-- Nota: sin CONTRATO_ID ni CONTRATO_NUMERO, se asume contrato_id=2. "
            "Para otra obra: $env:CONTRATO_ID=\"3\" (etc).",
            file=sys.stderr,
        )

    if not cloud_name or not api_key or not api_secret:
        print(
            "Definí CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET",
            file=sys.stderr,
        )
        sys.exit(1)

    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret)

    # numero -> list of (public_id, secure_url)
    by_num: dict[str, list[tuple[str, str]]] = defaultdict(list)

    raw_carpeta = _fetch_all_image_resources(cloudinary, prefix)
    for r in raw_carpeta:
        _ingest_resource(r, by_num)
    print(
        f"Cloudinary: carpeta prefix={prefix!r} -> {len(raw_carpeta)} recursos API, "
        f"{len(by_num)} numeros distintos.",
        file=sys.stderr,
    )

    raw_todo_len = 0
    añ_desde_raíz = 0
    if _include_account_root():
        print(
            "Incluyendo imágenes en la raíz del account (p. ej. 25040_xxx.jpg sin carpeta). "
            "Puede tardar varios minutos…",
            file=sys.stderr,
        )
        raw_todo = _fetch_all_image_resources(cloudinary, None)
        raw_todo_len = len(raw_todo)
        for r in raw_todo:
            pid = (r.get("public_id") or "").strip()
            if not pid or "/" in pid:
                continue
            if pid.lower().startswith("sample"):
                continue
            base = _basename(pid)
            num = _numero_desde_basename(base)
            if not num:
                continue
            if by_num.get(num):
                continue
            url = (r.get("secure_url") or r.get("url") or "").strip()
            if not url:
                continue
            by_num[num].append((pid, url))
            añ_desde_raíz += 1
        print(
            f"Cloudinary: merge raíz -> {añ_desde_raíz} filas añadidas (numeros que no estaban en carpeta); "
            f"listado total cuenta: {raw_todo_len} recursos; numeros distintos finales: {len(by_num)}.",
            file=sys.stderr,
        )
    else:
        print("INCLUDE_ACCOUNT_ROOT=0: solo carpetas, sin pase de raíz.", file=sys.stderr)

    if not by_num:
        print(
            f"Sin imágenes: ni bajo prefix={prefix!r} ni en raíz del account (o INCLUDE_ACCOUNT_ROOT=0 y carpeta vacía).",
            file=sys.stderr,
        )
        sys.exit(2)

    # Un número -> una URL (si hay colisión, gana la última y se avisa)
    fotos: list[tuple[str, str]] = []
    for num, pairs in sorted(by_num.items(), key=lambda x: int(x[0])):
        if len(pairs) > 1:
            print(
                f"-- AVISO: foto_numero {num!r} tiene {len(pairs)} archivos, se usa el último",
                file=sys.stderr,
            )
        _, u = pairs[-1]
        fotos.append((num, u))

    numeros = [n for n, _ in fotos]

    lines: list[str] = []
    meta = f"carpeta={len(raw_carpeta)} recursos"
    if raw_todo_len:
        meta += f", listado cuenta {raw_todo_len} recursos (incl. raíz)"
    lines.append(f"-- Generado: {len(fotos)} mapas ({meta})")
    lines.append("BEGIN;")
    lines.append("UPDATE so_registros SET foto_url = CASE foto_numero::text")
    for numero, url in fotos:
        safe_url = url.replace("'", "''")
        lines.append(f"  WHEN '{numero}' THEN '{safe_url}'")
    lines.append("  ELSE foto_url")
    lines.append("END")
    lines.append(f"WHERE foto_numero::text IN ({','.join(repr(n) for n in numeros)})")
    if contrato_id is not None:
        safe = str(int(contrato_id))
        lines.append(f"AND contrato_id = {safe};")
        scope_desc = f"contrato_id = {safe}"
    else:
        esc = contrato_numero.replace("'", "''")
        lines.append(f"AND contrato_id = (SELECT id FROM contratos WHERE numero = '{esc}');")
        scope_desc = f"contratos.numero = '{esc}'"
    lines.append("COMMIT;")
    lines.append("")
    lines.append(f"-- Total mapas: {len(fotos)} | scope: {scope_desc}")
    lines.append("")
    lines.append("-- Opcional: limitar a un acta RPO (elegir contrato_id y numero_rpo):")
    lines.append("-- AND reporte_id IN (")
    lines.append("--   SELECT id FROM so_reportes WHERE acta_rpo_id = (")
    lines.append("--     SELECT id FROM actas WHERE contrato_id = <ID> AND numero_rpo = 73")
    lines.append("-- ));")

    body = "\n".join(lines) + "\n"
    out_dir = Path(__file__).resolve().parents[1] / "sql"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "update_fotos.sql"
    out_path.write_text(body, encoding="utf-8")
    if (os.environ.get("DUMP_SQL_STDOUT", "") or "").strip() in ("1", "true", "yes") or len(body) < 200_000:
        sys.stdout.write(body)
    n_partes = 0
    if contrato_id is not None:
        partes_dir = out_dir / "update_fotos_partes"
        n_partes = write_update_foto_url_parts(fotos, int(contrato_id), partes_dir)
        print(
            f"[OK] Partes SQL Editor: {partes_dir} ({n_partes} archivos). Ejecutar parte_001.sql … en orden.",
            file=sys.stderr,
        )
    else:
        print(
            "[INFO] Sin CONTRATO_ID numérico: no se generan update_fotos_partes (usa contrato_id explícito).",
            file=sys.stderr,
        )
    print(
        f"\n[OK] Monolito (psql / referencia): {out_path}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
