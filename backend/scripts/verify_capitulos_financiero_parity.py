#!/usr/bin/env python3
"""Compara RPC dashboard_capitulos_financiero_agg vs agregación Python (contrato 2)."""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

import main as m  # noqa: E402


def _norm_rows(rows):
    return sorted(
        [
            {
                "capitulo": r.get("capitulo"),
                "claracore": int(r.get("claracore") or 0),
                "cobrado": int(r.get("cobrado") or 0),
                "delta": int(r.get("delta") or 0),
                "aprobado": int(r.get("aprobado") or 0),
                "pendiente": int(r.get("pendiente") or 0),
                "rechazado": int(r.get("rechazado") or 0),
                "no_revisado": int(r.get("no_revisado") or 0),
            }
            for r in (rows or [])
        ],
        key=lambda x: (x["capitulo"] or ""),
    )


def _rows_equal(a: dict, b: dict, *, tol: int = 2) -> bool:
    keys = ("claracore", "cobrado", "delta", "aprobado", "pendiente", "rechazado", "no_revisado")
    if a.get("capitulo") != b.get("capitulo"):
        return False
    for k in keys:
        if abs(int(a.get(k) or 0) - int(b.get(k) or 0)) > tol:
            return False
    return True


def compare(contrato_id: int, vista: str) -> bool:
    rpc = m._dashboard_capitulos_financiero_rpc(contrato_id, vista, None, acta_id=None)
    py_aiu, py_iva = m._gerencial_capitulos_data_both(contrato_id, vista, None, acta_id=None)
    if rpc is None:
        print("RPC no disponible — omitiendo comparación RPC/Python")
        return True
    ok = True
    for bloque, py_rows, rpc_key in (
        ("AIU", py_aiu, "capitulos_aiu"),
        ("IVA", py_iva, "capitulos_iva"),
    ):
        rpc_rows = rpc.get(rpc_key) or []
        if len(py_rows) != len(rpc_rows):
            ok = False
            print(f"MISMATCH {bloque} vista={vista}: python={len(py_rows)} rpc={len(rpc_rows)} caps")
            continue
        py_tot = m._gerencial_capitulos_totales(py_rows)
        rpc_tot = m._gerencial_capitulos_totales(rpc_rows)
        tot_ok = all(abs(int(py_tot.get(k) or 0) - int(rpc_tot.get(k) or 0)) <= 20 for k in py_tot)
        if not tot_ok:
            ok = False
            print(f"MISMATCH {bloque} vista={vista} totales (tol 20 COP)")
            for k in py_tot:
                d = int(py_tot[k]) - int(rpc_tot.get(k) or 0)
                if abs(d) > 20:
                    print(f"  {k}: py={py_tot[k]} rpc={rpc_tot.get(k)} diff={d}")
        else:
            print(f"OK {bloque} vista={vista}: {len(py_rows)} caps, totales ±20 COP")
    return ok


if __name__ == "__main__":
    cid = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    vistas = sys.argv[2:] if len(sys.argv) > 2 else ["obra_ejecutada", "presupuesto_obra"]
    all_ok = all(compare(cid, v) for v in vistas)
    sys.exit(0 if all_ok else 1)
