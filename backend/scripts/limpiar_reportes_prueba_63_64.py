#!/usr/bin/env python3
"""Elimina reportes de prueba SICOE #63 y #64 del contrato 3 (hard delete).

Uso (desde raíz del repo):
  # Solo diagnóstico
  PYTHONPATH=backend python backend/scripts/limpiar_reportes_prueba_63_64.py

  # Aplicar borrado + reset de contadores (próximo reporte = 63)
  PYTHONPATH=backend python backend/scripts/limpiar_reportes_prueba_63_64.py --execute

  # Tras --execute, smoke-test del consecutivo (reserva y deshace)
  PYTHONPATH=backend python backend/scripts/limpiar_reportes_prueba_63_64.py --verify-next

Requiere SUPABASE_URL + SUPABASE_KEY (service_role) en el entorno o backend/.env.

NO toca contrato 2 (allí #63/#64 son reportes reales Aprobados).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")

CONTRATO_ID = 3
NUMEROS = (63, 64)
# Tras borrar, forzar próximo = 63 (huecos 62/63 ya existían; MAX real = 61).
RESERVADO_HASTA_PARA_SIGUIENTE_63 = 62


def _client():
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (
        os.getenv("SUPABASE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()
    if not url or not key:
        print(
            "MISSING_SECRETS: se requieren SUPABASE_URL y SUPABASE_KEY (service_role).",
            file=sys.stderr,
        )
        sys.exit(2)
    return create_client(url, key)


def _list_reportes(sb) -> list[dict[str, Any]]:
    return (
        sb.table("so_reportes")
        .select(
            "id,numero_reporte,estado,descripcion_actividad,created_at,creado_por"
        )
        .eq("contrato_id", CONTRATO_ID)
        .in_("numero_reporte", list(NUMEROS))
        .order("numero_reporte")
        .execute()
        .data
        or []
    )


def _list_registros(sb, reporte_ids: list[int]) -> list[dict[str, Any]]:
    if not reporte_ids:
        return []
    return (
        sb.table("so_registros")
        .select(
            "id,reporte_id,numero_registro,observacion,cantidad_total,foto_url,grafico_url"
        )
        .eq("contrato_id", CONTRATO_ID)
        .in_("reporte_id", reporte_ids)
        .order("numero_registro")
        .execute()
        .data
        or []
    )


def _list_puntos(sb, reporte_ids: list[int]) -> list[dict[str, Any]]:
    if not reporte_ids:
        return []
    return (
        sb.table("so_puntos_topograficos")
        .select("id,reporte_id,punto,norte,este")
        .eq("contrato_id", CONTRATO_ID)
        .in_("reporte_id", reporte_ids)
        .execute()
        .data
        or []
    )


def _diagnostico(sb) -> dict[str, Any]:
    reps = _list_reportes(sb)
    rids = [int(r["id"]) for r in reps]
    regs = _list_registros(sb, rids)
    pts = _list_puntos(sb, rids)
    max_rep = (
        sb.table("so_reportes")
        .select("numero_reporte")
        .eq("contrato_id", CONTRATO_ID)
        .order("numero_reporte", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    rsv = (
        sb.table("sico_ultimo_numero_reporte")
        .select("*")
        .eq("contrato_id", CONTRATO_ID)
        .limit(1)
        .execute()
        .data
        or []
    )
    total = (
        sb.table("so_reportes")
        .select("id", count="exact")
        .eq("contrato_id", CONTRATO_ID)
        .execute()
    )
    info = {
        "reportes": reps,
        "registros": regs,
        "puntos": pts,
        "max_numero_reporte": int(max_rep[0]["numero_reporte"]) if max_rep else 0,
        "reservado_hasta": (rsv[0].get("reservado_hasta") if rsv else None),
        "total_reportes_contrato": getattr(total, "count", None) or len(total.data or []),
    }
    return info


def _print_diag(info: dict[str, Any]) -> None:
    print(f"=== Contrato {CONTRATO_ID} — reportes {NUMEROS} ===")
    if not info["reportes"]:
        print("(ningún reporte 63/64 encontrado)")
    for r in info["reportes"]:
        print(
            f"  reporte id={r['id']} #{r['numero_reporte']} "
            f"estado={r.get('estado')} | {r.get('descripcion_actividad')}"
        )
    print(f"registros asociados: {len(info['registros'])}")
    for g in info["registros"]:
        print(
            f"  reg id={g['id']} #{g.get('numero_registro')} "
            f"obs={g.get('observacion')!r} cant={g.get('cantidad_total')}"
        )
    print(f"puntos topográficos: {len(info['puntos'])}")
    print(
        f"max_numero_reporte={info['max_numero_reporte']} "
        f"reservado_hasta={info['reservado_hasta']} "
        f"total_reportes={info['total_reportes_contrato']}"
    )


def _limpiar_links_planilla(sb, reporte_ids: list[int]) -> int:
    """Quita entradas meta_cabecera.sicoe_reportes que apunten a 63/64."""
    rows = (
        sb.table("topo_planillas_tuberia")
        .select("id,meta_cabecera,version")
        .eq("contrato_id", CONTRATO_ID)
        .execute()
        .data
        or []
    )
    updated = 0
    rid_set = set(reporte_ids)
    for row in rows:
        meta = row.get("meta_cabecera") if isinstance(row.get("meta_cabecera"), dict) else {}
        links = meta.get("sicoe_reportes")
        if not isinstance(links, list) or not links:
            continue
        kept = []
        changed = False
        for item in links:
            if not isinstance(item, dict):
                kept.append(item)
                continue
            try:
                num = int(item.get("numero_reporte")) if item.get("numero_reporte") is not None else None
            except (TypeError, ValueError):
                num = None
            try:
                rid = int(item.get("reporte_id")) if item.get("reporte_id") is not None else None
            except (TypeError, ValueError):
                rid = None
            if num in NUMEROS or (rid is not None and rid in rid_set):
                changed = True
                continue
            kept.append(item)
        if not changed:
            continue
        new_meta = {**meta, "sicoe_reportes": kept}
        sb.table("topo_planillas_tuberia").update(
            {
                "meta_cabecera": new_meta,
                "version": int(row.get("version") or 1) + 1,
            }
        ).eq("id", row["id"]).eq("contrato_id", CONTRATO_ID).execute()
        updated += 1
    return updated


def _execute(sb) -> None:
    info = _diagnostico(sb)
    _print_diag(info)
    reporte_ids = [int(r["id"]) for r in info["reportes"]]
    reg_ids = [int(g["id"]) for g in info["registros"]]

    if not reporte_ids and not any(
        True
        for r in (
            sb.table("so_reportes")
            .select("id")
            .eq("contrato_id", CONTRATO_ID)
            .in_("numero_reporte", list(NUMEROS))
            .execute()
            .data
            or []
        )
    ):
        print("Nada que borrar en so_reportes; se ajustará el contador de todas formas.")

    if reg_ids:
        # comentarios
        sb.table("so_registro_comentarios").delete().in_("registro_id", reg_ids).execute()
        sb.table("so_registros").delete().eq("contrato_id", CONTRATO_ID).in_(
            "id", reg_ids
        ).execute()
        print(f"Eliminados {len(reg_ids)} so_registros")

    if reporte_ids:
        sb.table("so_puntos_topograficos").delete().eq("contrato_id", CONTRATO_ID).in_(
            "reporte_id", reporte_ids
        ).execute()
        n_plan = _limpiar_links_planilla(sb, reporte_ids)
        print(f"Planillas con vínculo sicoe limpiado: {n_plan}")
        sb.table("so_reportes").delete().eq("contrato_id", CONTRATO_ID).in_(
            "id", reporte_ids
        ).execute()
        print(f"Eliminados reportes ids={reporte_ids}")

    # Contadores
    max_reg_rows = (
        sb.table("so_registros")
        .select("numero_registro")
        .eq("contrato_id", CONTRATO_ID)
        .order("numero_registro", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    max_reg = int(max_reg_rows[0]["numero_registro"]) if max_reg_rows else 0

    sb.table("sico_ultimo_numero_reporte").upsert(
        {"contrato_id": CONTRATO_ID, "reservado_hasta": RESERVADO_HASTA_PARA_SIGUIENTE_63},
        on_conflict="contrato_id",
    ).execute()
    sb.table("sico_ultimo_numero_registro").upsert(
        {"contrato_id": CONTRATO_ID, "reservado_hasta": max_reg},
        on_conflict="contrato_id",
    ).execute()
    print(
        f"Contadores: reporte reservado_hasta={RESERVADO_HASTA_PARA_SIGUIENTE_63} "
        f"(próximo esperado 63); registro reservado_hasta={max_reg}"
    )

    # Verificar que otros reportes del contrato siguen
    left = _diagnostico(sb)
    if left["reportes"]:
        raise SystemExit(f"ERROR: aún quedan reportes {NUMEROS}: {left['reportes']}")
    if left["max_numero_reporte"] >= 63:
        raise SystemExit(
            f"ERROR: max_numero_reporte={left['max_numero_reporte']} (>=63) tras borrado"
        )
    print(
        f"OK. max_reporte={left['max_numero_reporte']} "
        f"total_reportes={left['total_reportes_contrato']}"
    )


def _verify_next(sb) -> None:
    """Llama RPC, comprueba 63, y revierte reservado_hasta a 62."""
    sig = sb.rpc("siguiente_numero_reporte", {"p_contrato_id": CONTRATO_ID}).execute().data
    print(f"siguiente_numero_reporte(3) → {sig}")
    if int(sig) != 63:
        raise SystemExit(f"Se esperaba 63, obtuvo {sig}")
    sb.table("sico_ultimo_numero_reporte").upsert(
        {"contrato_id": CONTRATO_ID, "reservado_hasta": RESERVADO_HASTA_PARA_SIGUIENTE_63},
        on_conflict="contrato_id",
    ).execute()
    print("Reserva deshecha (reservado_hasta=62). Próxima creación real tomará el 63.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--execute", action="store_true", help="Aplicar borrado hard delete")
    ap.add_argument(
        "--verify-next",
        action="store_true",
        help="Comprobar que el próximo número es 63 (y deshacer la reserva)",
    )
    args = ap.parse_args()
    sb = _client()

    if args.execute:
        _execute(sb)
    else:
        _print_diag(_diagnostico(sb))
        print("\n(Dry-run. Pasa --execute para borrar.)")

    if args.verify_next:
        _verify_next(sb)


if __name__ == "__main__":
    main()
