#!/usr/bin/env python3
"""
QA en vivo — paridad Costo Directo aprobado nivel máx.

Uso (desde backend/, con red a Supabase):
  SUPABASE_URL=... SUPABASE_ANON_KEY=... PYTHONPATH=. python3 scripts/qa_costo_aprobado_nivel_live.py

Si no hay env, intenta VITE_SUPABASE_* de frontend/.env.development.

Casos:
  1) ICCU-CTO-1614-2025 Acta RPO 1 (acta_rpo_id=620) — contrato_id=3, na=[1,2,3,4]
  2) Otro contrato: contrato_id=2, actas 307 y 308, na=[1,2,4]

Compara:
  - SQL crudo SUM(CD) WHERE nivel4=Aprobado
  - Canónico Dashboard/Panel (sicoe_costo_aprobado_nivel)
  - Panel legacy cant×MAX(VU)
  - Matriz Python N4 Aprobado (misma cascada + SUM CD)
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sicoe_costo_aprobado_nivel import (  # noqa: E402
    costo_directo_linea,
    registro_aprobado_nivel_max,
    sum_costo_aprobado_nivel_max,
)


def _load_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    key = (
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    )
    if url and key:
        return url.rstrip("/"), key
    env_path = ROOT / "frontend" / ".env.development"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            if line.startswith("VITE_SUPABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
            elif line.startswith("VITE_SUPABASE_ANON_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL / SUPABASE_ANON_KEY (o VITE_* en frontend/.env.development)")
    return url.rstrip("/"), key


def _fetch(url: str, key: str, path: str) -> Any:
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def fetch_regs(url: str, key: str, filt: str) -> List[dict]:
    cols = (
        "id,item_numero,capitulo,cantidad_total,vlr_unitario,costo_directo,acta_rpo_id,"
        "contrato_id,nivel1_estado,nivel2_estado,nivel3_estado,nivel4_estado,"
        "nivel5_estado,nivel6_estado"
    )
    rows: List[dict] = []
    off = 0
    while True:
        batch = _fetch(
            url, key, f"so_registros?{filt}&select={cols}&order=id&offset={off}&limit=1000"
        )
        rows.extend(batch or [])
        if len(batch or []) < 1000:
            break
        off += 1000
    return rows


def panel_legacy_max_vu(regs: List[dict], na: Sequence[int]) -> float:
    qty: Dict[str, float] = defaultdict(float)
    mx: Dict[str, float] = defaultdict(float)
    for r in regs:
        if not registro_aprobado_nivel_max(r, na):
            continue
        ik = str(r.get("item_numero") or "").strip()
        qty[ik] += float(r.get("cantidad_total") or 0)
        mx[ik] = max(mx[ik], float(r.get("vlr_unitario") or 0))
    return float(round(sum(q * mx[i] for i, q in qty.items()), 0))


def sql_crudo_n4(regs: List[dict]) -> float:
    return float(
        round(
            sum(
                costo_directo_linea(r)
                for r in regs
                if str(r.get("nivel4_estado") or "").strip() == "Aprobado"
            ),
            0,
        )
    )


def matriz_n4_aprobado(regs: List[dict], na: Sequence[int]) -> float:
    """Misma regla que Panel Python post-fix (ítem + prerreqs + SUM CD)."""
    return sum_costo_aprobado_nivel_max(regs, na)


def analyze(label: str, regs: List[dict], na: Sequence[int]) -> dict:
    sql = sql_crudo_n4(regs)
    canon = sum_costo_aprobado_nivel_max(regs, na)
    legacy = panel_legacy_max_vu(regs, na)
    matriz = matriz_n4_aprobado(regs, na)
    return {
        "case": label,
        "na": list(na),
        "n_regs": len(regs),
        "sql_crudo_n4": sql,
        "canon_dashboard_panel": canon,
        "panel_legacy_max_vu": legacy,
        "matriz_python_n4_aprobado": matriz,
        "parity_dash_panel_matriz": canon == matriz,
        "delta_legacy_panel_vs_canon": legacy - canon,
        "delta_sql_vs_canon": sql - canon,
    }


def main() -> None:
    url, key = _load_env()
    cases = [
        ("ICCU Acta620 contrato3", "acta_rpo_id=eq.620", [1, 2, 3, 4], 78_318_891.0),
        ("Contrato2 Acta307", "contrato_id=eq.2&acta_rpo_id=eq.307", [1, 2, 4], None),
        ("Contrato2 Acta308", "contrato_id=eq.2&acta_rpo_id=eq.308", [1, 2, 4], None),
    ]
    report = []
    for label, filt, na, expect_sql in cases:
        regs = fetch_regs(url, key, filt)
        row = analyze(label, regs, na)
        report.append(row)
        print(json.dumps(row, indent=2, ensure_ascii=False))
        assert row["parity_dash_panel_matriz"], f"sin paridad: {label}"
        if expect_sql is not None:
            assert row["sql_crudo_n4"] == expect_sql, (
                f"{label}: SQL {row['sql_crudo_n4']} != {expect_sql}"
            )
            assert row["canon_dashboard_panel"] == expect_sql
            # Evidencia histórica Panel MAX VU: +540.000 por ítems 2.1/2.3 con VU mixtos
            assert row["delta_legacy_panel_vs_canon"] == 540_000.0, (
                f"{label}: delta legacy {row['delta_legacy_panel_vs_canon']}"
            )

    out = Path(__file__).resolve().parents[1] / "tests" / "fixtures_qa_costo_n4_live.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"OK — {len(report)} casos; fixture → {out}")


if __name__ == "__main__":
    main()
