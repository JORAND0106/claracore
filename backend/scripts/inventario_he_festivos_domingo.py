#!/usr/bin/env python3
"""
Inventario SOLO LECTURA — filas de asistencia en domingos/festivos cuyo
``horas_extra`` guardado diferiría con la regla nueva (festivo = todo extra;
domingo = todo extra salvo domingo laborable en el contrato).

NO escribe ni borra nada.

Uso:
  SUPABASE_URL=... SUPABASE_KEY=... \\
    PYTHONPATH=backend python3 backend/scripts/inventario_he_festivos_domingo.py \\
      [--desde 2025-01-01] [--hasta 2026-12-31] [--contrato-id N]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
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
        print("MISSING_SECRETS: SUPABASE_URL + SUPABASE_KEY (service_role).", file=sys.stderr)
        sys.exit(2)
    from supabase import create_client
    return create_client(url, key)


def _arr(val: Any) -> List[dict]:
    if isinstance(val, list):
        return [x for x in val if isinstance(x, dict)]
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", default="2025-01-01")
    ap.add_argument("--hasta", default="2026-12-31")
    ap.add_argument("--contrato-id", type=int, default=None)
    args = ap.parse_args()

    # Ensure backend imports resolve
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from bitacora_horario import (
        calcular_horas_extra,
        etiqueta_dia_especial,
        normalize_horario,
        tiene_jornada_ordinaria,
    )

    sb = _sb()
    q = (
        sb.table("seguimiento_bitacora_entrada")
        .select("id,contrato_id,fecha,tipo,asistencia_colaboradores,horario_aplicado")
        .eq("tipo", "diario")
        .gte("fecha", args.desde[:10])
        .lte("fecha", args.hasta[:10])
        .order("fecha")
    )
    if args.contrato_id is not None:
        q = q.eq("contrato_id", int(args.contrato_id))
    rows = q.execute().data or []

    # Cache horario por contrato (fallback si el diario no tiene snapshot)
    horario_by_cto: Dict[int, Any] = {}

    def _horario_de(d: dict):
        if d.get("horario_aplicado"):
            return normalize_horario(d.get("horario_aplicado"))
        cid = d.get("contrato_id")
        try:
            cid_i = int(cid)
        except (TypeError, ValueError):
            return normalize_horario(None)
        if cid_i not in horario_by_cto:
            try:
                cr = (
                    sb.table("contratos")
                    .select("bitacora_horario")
                    .eq("id", cid_i)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                horario_by_cto[cid_i] = normalize_horario(
                    (cr[0] or {}).get("bitacora_horario") if cr else None
                )
            except Exception:
                horario_by_cto[cid_i] = normalize_horario(None)
        return horario_by_cto[cid_i]

    cambios: List[Dict[str, Any]] = []
    revisados = 0
    for d in rows:
        fecha = str(d.get("fecha") or "")[:10]
        if not fecha:
            continue
        horario = _horario_de(d)
        if tiene_jornada_ordinaria(horario, fecha):
            continue  # día ordinario (o domingo laborable): fuera de alcance
        etiq = etiqueta_dia_especial(fecha, horario) or "?"
        for a in _arr(d.get("asistencia_colaboradores")):
            nombre = str(a.get("nombre") or "").strip()
            if not nombre:
                continue
            revisados += 1
            ini = a.get("hora_ingreso")
            fin = a.get("hora_salida")
            try:
                stored = float(a.get("horas_extra") or 0)
            except (TypeError, ValueError):
                stored = 0.0
            nuevo = calcular_horas_extra(
                hora_ingreso=ini,
                hora_salida=fin,
                horario=horario,
                fecha=fecha,
            )
            if abs(stored - nuevo) < 0.005:
                continue
            cambios.append({
                "bitacora_id": d.get("id"),
                "contrato_id": d.get("contrato_id"),
                "fecha": fecha,
                "etiqueta": etiq,
                "nombre": nombre,
                "documento": str(a.get("documento_numero") or "").strip(),
                "hora_ingreso": str(ini or "")[:5],
                "hora_salida": str(fin or "")[:5],
                "horas_extra_guardado": round(stored, 2),
                "horas_extra_nuevo": nuevo,
                "justificacion": str(a.get("justificacion_horas_extra") or "").strip(),
            })

    out = {
        "desde": args.desde[:10],
        "hasta": args.hasta[:10],
        "diarios_leidos": len(rows),
        "filas_especiales_revisadas": revisados,
        "filas_que_cambiarian": len(cambios),
        "cambios": cambios,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    print(
        f"Resumen: {len(cambios)} filas cambiarían de {revisados} en días festivo/domingo "
        f"({len(rows)} diarios).",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
