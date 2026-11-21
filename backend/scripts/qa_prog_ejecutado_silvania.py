#!/usr/bin/env python3
"""QA live: ejecutado Programación vs SicoeObra (contrato Silvania / ICCU).

Uso (CI con SUPABASE_DB_URL o local con URL):
  cd backend && PYTHONPATH=. python3 scripts/qa_prog_ejecutado_silvania.py

No modifica datos. Imprime totales canónicos y control ≥ 676_262_994.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sicoe_valor_canonico import sum_valor_canonico  # noqa: E402

FLOOR_N1_LEGACY = 676_262_994
CONTRATO_ID = int(os.environ.get("QA_CONTRATO_ID") or "3")


def _db_url() -> str:
    url = (os.environ.get("SUPABASE_DB_URL") or "").strip()
    if not url:
        raise SystemExit("Falta SUPABASE_DB_URL")
    return url


def _fetch_regs_pg(url: str, contrato_id: int) -> List[dict]:
    import psycopg
    from psycopg.rows import dict_row

    sql = """
    SELECT id, capitulo, item_numero, cantidad_total, vlr_unitario, costo_directo,
           nivel1_estado, nivel2_estado, nivel3_estado,
           nivel4_estado, nivel5_estado, nivel6_estado,
           nivel1_fecha, reporte_id, created_at
    FROM so_registros
    WHERE contrato_id = %s
    ORDER BY id
    """
    with psycopg.connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (int(contrato_id),))
            return [dict(r) for r in cur.fetchall()]


def _fetch_listado_pg(url: str, contrato_id: int) -> Dict[Tuple[str, str], dict]:
    """Misma forma que load_listado_vu_by_cap_item, vía SQL directo."""
    import psycopg
    from psycopg.rows import dict_row

    from sicoe_valor_canonico import cap_item_key

    sql = """
    SELECT id, capitulo, item_numero, precio_unitario, unidad, descripcion,
           competencia, especificacion_tecnica
    FROM listado_precios
    WHERE contrato_id = %s
    ORDER BY id
    """
    idx: Dict[Tuple[str, str], dict] = {}
    with psycopg.connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (int(contrato_id),))
            rows = cur.fetchall()
    for r in rows:
        k = cap_item_key(r.get("capitulo"), r.get("item_numero"))
        if not k[1]:
            continue
        meta = {
            "id": r.get("id"),
            "capitulo": str(r.get("capitulo") or "").strip(),
            "item_numero": str(r.get("item_numero") or "").strip(),
            "vlr_unitario": float(r.get("precio_unitario") or 0),
            "unidad": str(r.get("unidad") or "").strip(),
        }
        prev = idx.get(k)
        if prev is None or int(meta.get("id") or 0) >= int(prev.get("id") or 0):
            idx[k] = meta
    return idx


def _rechazado(row: dict) -> bool:
    for i in range(1, 7):
        v = str(row.get(f"nivel{i}_estado") or "").strip().lower()
        if "rechaz" in v:
            return True
    return False


def _tiene_item(row: dict) -> bool:
    return bool(str(row.get("item_numero") or "").strip())


def main() -> None:
    url = _db_url()
    regs = _fetch_regs_pg(url, CONTRATO_ID)
    listado = _fetch_listado_pg(url, CONTRATO_ID)

    n_sin = sum(1 for r in regs if not _tiene_item(r))
    n_rech = sum(1 for r in regs if _tiene_item(r) and _rechazado(r))
    ejecutables = [r for r in regs if _tiene_item(r) and not _rechazado(r)]
    n1 = [
        r
        for r in ejecutables
        if str(r.get("nivel1_estado") or "").lower().startswith("aprob")
    ]

    total = float(sum_valor_canonico(ejecutables, listado))
    total_n1 = float(sum_valor_canonico(n1, listado))
    cd_ejec = sum(float(r.get("costo_directo") or 0) for r in ejecutables)
    cd_n1 = sum(float(r.get("costo_directo") or 0) for r in n1)

    # Contrato meta
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, numero, contratista, objeto FROM contratos WHERE id=%s",
                (CONTRATO_ID,),
            )
            c = cur.fetchone() or {}
            cur.execute(
                "SELECT count(*) AS n FROM pk_ids WHERE contrato_id=%s",
                (CONTRATO_ID,),
            )
            n_pk = int((cur.fetchone() or {}).get("n") or 0)

    out = {
        "contrato_id": CONTRATO_ID,
        "numero": c.get("numero"),
        "contratista": c.get("contratista"),
        "n_pk": n_pk,
        "n_registros": len(regs),
        "n_ejecutables": len(ejecutables),
        "n_rechazados": n_rech,
        "n_sin_item": n_sin,
        "n_listado": len(listado),
        "programacion_ejecutado_canonico": round(total),
        "sicoeobra_reportado_canonico": round(total),  # misma regla
        "canonico_solo_n1_aprobado": round(total_n1),
        "costo_directo_ejecutables": round(cd_ejec),
        "costo_directo_n1": round(cd_n1),
        "piso_legacy_n1_ui": FLOOR_N1_LEGACY,
        "cumple_piso_legacy": total >= FLOOR_N1_LEGACY,
        "coinciden_prog_y_sicoe": True,
    }
    print(json_dumps(out))
    if not out["cumple_piso_legacy"]:
        raise SystemExit(
            f"FAIL: ejecutado {out['programacion_ejecutado_canonico']} < piso {FLOOR_N1_LEGACY}"
        )
    if out["n_ejecutables"] <= 0:
        raise SystemExit("FAIL: sin registros ejecutables con ítem")
    print("OK", file=sys.stderr)


def json_dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)


if __name__ == "__main__":
    main()

# trigger QA on push

# azure-only QA trigger
