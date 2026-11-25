#!/usr/bin/env python3
"""
Diagnóstico SOLO LECTURA — actividades Bitácora 4–13 nov 2026.

Para cada fecha del rango (y opcionalmente un contrato):
  - ¿Existe reporte diario?
  - Conteos de actividades, eventos, personal, asistencia, maquinaria, materiales
  - Logs de CREAR/EDITAR BITACORA en la ventana de creación/edición
  - Alcance: otros contratos con diarios vacíos de actividades en el mismo rango

NO escribe ni borra nada.

Uso:
  SUPABASE_URL=... SUPABASE_KEY=... \\
    python3 backend/scripts/diagnostico_bitacora_actividades_nov2026.py \\
      [--contrato-id N] [--desde 2026-11-04] [--hasta 2026-11-13]

Salida: JSON en stdout + tabla humana en stderr.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _sb():
    url = _env("SUPABASE_URL") or _env("VITE_SUPABASE_URL")
    key = (
        _env("SUPABASE_KEY")
        or _env("SUPABASE_SERVICE_ROLE_KEY")
        or _env("SUPABASE_SERVICE_KEY")
    )
    if not url or not key:
        print(
            "MISSING_SECRETS: se requieren SUPABASE_URL y SUPABASE_KEY (service_role).",
            file=sys.stderr,
        )
        sys.exit(2)
    # Evitar usar anon por accidente (RLS → 0 filas).
    if "anon" in key.lower() and "service" not in key.lower():
        print(
            "REFUSED: la clave parece anon. Use service_role para diagnóstico.",
            file=sys.stderr,
        )
        sys.exit(2)
    try:
        from supabase import create_client
    except ImportError:
        print("Falta paquete supabase. pip install supabase", file=sys.stderr)
        sys.exit(2)
    return create_client(url, key)


def _arr(val: Any) -> List[dict]:
    if isinstance(val, list):
        return [x for x in val if isinstance(x, dict)]
    if isinstance(val, str) and val.strip():
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [x for x in parsed if isinstance(x, dict)]
        except Exception:
            return []
    return []


def _count_actividades(eventos: Any) -> int:
    n = 0
    for ev in _arr(eventos):
        det = ev.get("evento_detalle") if isinstance(ev.get("evento_detalle"), dict) else {}
        acts = det.get("actividades")
        if isinstance(acts, list):
            for a in acts:
                if isinstance(a, dict) and (
                    str(a.get("descripcion") or a.get("actividad") or a.get("texto") or "").strip()
                    or a.get("cantidad") not in (None, "", 0, "0")
                ):
                    n += 1
                elif isinstance(a, str) and a.strip():
                    n += 1
        elif isinstance(acts, str) and acts.strip():
            n += 1
    return n


def _fetch_diarios(sb, desde: str, hasta: str, contrato_id: Optional[int]) -> List[dict]:
    cols = (
        "id,contrato_id,fecha,estado,created_at,updated_at,created_by,created_by_nombre,"
        "eventos,personal,asistencia_colaboradores,materiales,horario_aplicado,"
        "cuerpo_html,cerrado_en,cierre_motivo"
    )
    q = (
        sb.table("seguimiento_bitacora_entrada")
        .select(cols)
        .eq("tipo", "diario")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha")
        .order("contrato_id")
    )
    if contrato_id is not None:
        q = q.eq("contrato_id", int(contrato_id))
    return q.execute().data or []


def _count_usos(sb, entrada_ids: List[int]) -> Dict[int, int]:
    out: Dict[int, int] = defaultdict(int)
    if not entrada_ids:
        return out
    # PostgREST in_() por lotes
    chunk = 80
    for i in range(0, len(entrada_ids), chunk):
        batch = entrada_ids[i : i + chunk]
        rows = (
            sb.table("seguimiento_bitacora_equipo_uso")
            .select("id,entrada_id")
            .in_("entrada_id", batch)
            .execute()
            .data
            or []
        )
        for r in rows:
            try:
                out[int(r["entrada_id"])] += 1
            except Exception:
                pass
    return out


def _fetch_logs_bitacora(sb, desde: str, hasta: str) -> List[dict]:
    """Logs de plataforma BITACORA en ventana ampliada (creación puede ser D+1)."""
    # created_at típico ISO UTC; ampliar margen
    try:
        rows = (
            sb.table("logs")
            .select("*")
            .eq("modulo", "BITACORA")
            .gte("created_at", f"{desde}T00:00:00")
            .lte("created_at", f"{hasta}T23:59:59.999999")
            .order("created_at")
            .limit(2000)
            .execute()
            .data
            or []
        )
        return rows
    except Exception as exc:
        # Esquema de logs puede variar (accion/modulo/tabla)
        print(f"WARN logs query: {exc}", file=sys.stderr)
        try:
            return (
                sb.table("logs")
                .select("*")
                .ilike("accion", "%BITACORA%")
                .limit(500)
                .execute()
                .data
                or []
            )
        except Exception as exc2:
            print(f"WARN logs fallback: {exc2}", file=sys.stderr)
            return []


def _dates(desde: str, hasta: str) -> List[str]:
    from datetime import date, timedelta

    d0 = date.fromisoformat(desde)
    d1 = date.fromisoformat(hasta)
    out = []
    cur = d0
    while cur <= d1:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def _row_summary(row: dict, usos_n: int) -> dict:
    eventos = row.get("eventos")
    personal = _arr(row.get("personal"))
    asist = _arr(row.get("asistencia_colaboradores"))
    mats = _arr(row.get("materiales"))
    evs = _arr(eventos)
    n_act = _count_actividades(eventos)
    faltante = []
    if n_act == 0:
        faltante.append("actividades")
    if not evs:
        faltante.append("eventos")
    if not personal and not asist:
        faltante.append("personal/asistencia")
    if usos_n == 0:
        faltante.append("maquinaria")
    if not mats:
        faltante.append("materiales")
    estado_dia = "completo"
    if not row:
        estado_dia = "sin_reporte"
    elif n_act == 0 and not evs:
        estado_dia = "reporte_sin_actividades"
    elif n_act == 0:
        estado_dia = "eventos_sin_actividades"
    return {
        "entrada_id": row.get("id"),
        "contrato_id": row.get("contrato_id"),
        "fecha": row.get("fecha"),
        "estado": row.get("estado"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "created_by": row.get("created_by"),
        "created_by_nombre": row.get("created_by_nombre"),
        "n_eventos": len(evs),
        "n_actividades": n_act,
        "n_personal_agregado": len(personal),
        "n_asistencia": len(asist),
        "n_materiales": len(mats),
        "n_maquinaria": usos_n,
        "tiene_horario_aplicado": bool(row.get("horario_aplicado")),
        "cierre_motivo": row.get("cierre_motivo"),
        "estado_diagnostico": estado_dia,
        "faltante": faltante,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--contrato-id", type=int, default=None)
    ap.add_argument("--desde", default="2026-11-04")
    ap.add_argument("--hasta", default="2026-11-13")
    args = ap.parse_args()

    sb = _sb()
    fechas = _dates(args.desde, args.hasta)
    diarios = _fetch_diarios(sb, args.desde, args.hasta, args.contrato_id)
    ids = [int(r["id"]) for r in diarios if r.get("id") is not None]
    usos = _count_usos(sb, ids)

    by_contrato_fecha: Dict[tuple, dict] = {}
    for r in diarios:
        key = (int(r["contrato_id"]), str(r["fecha"]))
        by_contrato_fecha[key] = r

    contratos = sorted({int(r["contrato_id"]) for r in diarios})
    if args.contrato_id is not None and args.contrato_id not in contratos:
        contratos = [args.contrato_id]

    por_dia: List[dict] = []
    for cid in contratos or ([args.contrato_id] if args.contrato_id else []):
        for f in fechas:
            row = by_contrato_fecha.get((cid, f))
            if not row:
                por_dia.append({
                    "contrato_id": cid,
                    "fecha": f,
                    "estado_diagnostico": "sin_reporte",
                    "faltante": ["reporte", "actividades", "personal", "maquinaria", "materiales", "eventos"],
                })
            else:
                por_dia.append(_row_summary(row, usos.get(int(row["id"]), 0)))

    # Alcance: diarios con 0 actividades en el rango (todos los contratos)
    vacios_act = []
    for r in diarios:
        n_act = _count_actividades(r.get("eventos"))
        if n_act == 0:
            vacios_act.append({
                "contrato_id": r.get("contrato_id"),
                "fecha": r.get("fecha"),
                "entrada_id": r.get("id"),
                "n_eventos": len(_arr(r.get("eventos"))),
                "created_by_nombre": r.get("created_by_nombre"),
            })

    logs = _fetch_logs_bitacora(sb, args.desde, args.hasta)

    # Backups conocidos
    backups = {}
    for t in (
        "_bak_seg_bitacora_entrada_consol_20260922",
        "_bak_seg_bitacora_equipo_uso_consol_20260922",
    ):
        try:
            n = (
                sb.table(t)
                .select("id", count="exact")
                .limit(1)
                .execute()
            )
            backups[t] = {"ok": True, "count": getattr(n, "count", None)}
        except Exception as exc:
            backups[t] = {"ok": False, "error": str(exc)}

    result = {
        "rango": {"desde": args.desde, "hasta": args.hasta},
        "filtro_contrato_id": args.contrato_id,
        "contratos_con_diario_en_rango": contratos,
        "por_dia": por_dia,
        "alcance_sin_actividades": vacios_act,
        "logs_bitacora_en_rango": logs,
        "backups_detectados": backups,
        "nota": (
            "Solo lectura. Sin service_role este script no debe ejecutarse. "
            "No hay borrador local de actividades; recuperación depende de BD, "
            "logs, backup _bak_* o PITR de Supabase."
        ),
    }
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))

    print("\n=== Tabla por día ===", file=sys.stderr)
    print(
        f"{'contrato':>8} {'fecha':12} {'estado':24} {'ev':>3} {'act':>3} "
        f"{'asist':>5} {'maq':>3} {'mat':>3} id",
        file=sys.stderr,
    )
    for d in por_dia:
        print(
            f"{str(d.get('contrato_id') or '-'):>8} {d.get('fecha',''):12} "
            f"{d.get('estado_diagnostico',''):24} "
            f"{d.get('n_eventos', 0):>3} {d.get('n_actividades', 0):>3} "
            f"{d.get('n_asistencia', 0):>5} {d.get('n_maquinaria', 0):>3} "
            f"{d.get('n_materiales', 0):>3} {d.get('entrada_id') or '-'}",
            file=sys.stderr,
        )
    print(
        f"\nDiarios sin actividades en rango (todos contratos): {len(vacios_act)}",
        file=sys.stderr,
    )
    print(f"Logs BITACORA en ventana: {len(logs)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
