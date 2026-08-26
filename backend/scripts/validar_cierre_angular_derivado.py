#!/usr/bin/env python3
"""Consulta la poligonal real (≈32/33 pts) en Supabase y reporta cierre angular derivado.

Requiere SUPABASE_URL y SUPABASE_KEY (service_role) en el entorno.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from topografia_utils import (  # noqa: E402
    calcular_cierre_poligonal,
    decimal_to_gms,
    radiar_armadas,
)


def main() -> int:
    url = (os.getenv("SUPABASE_URL") or "").strip()
    key = (os.getenv("SUPABASE_KEY") or "").strip()
    if not url or not key:
        print("MISSING_SECRETS: SUPABASE_URL / SUPABASE_KEY no disponibles en este entorno.")
        return 2

    from supabase import create_client

    sb = create_client(url, key)

    # Poligonales con más estaciones (candidata D1..D32)
    pols = (
        sb.table("topo_poligonales")
        .select("id,nombre,sentido,tipo,estado,contrato_id,tolerancia_relativa,precision_angular_seg,punto_inicial_id,punto_final_id")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    if not pols:
        print("NO_POLIGONALES")
        return 1

    best = None
    best_n = 0
    for pol in pols:
        n = (
            sb.table("topo_poligonal_estaciones")
            .select("id", count="exact")
            .eq("poligonal_id", pol["id"])
            .is_("deleted_at", "null")
            .execute()
        )
        count = n.count if n.count is not None else len(n.data or [])
        if count > best_n:
            best_n = count
            best = pol

    if not best or best_n < 10:
        # fallback: mayor por armadas
        for pol in pols:
            n = (
                sb.table("topo_poligonal_armadas")
                .select("id", count="exact")
                .eq("poligonal_id", pol["id"])
                .execute()
            )
            count = n.count if n.count is not None else len(n.data or [])
            if count > best_n:
                best_n = count
                best = pol

    pol = best
    print(f"POLIGONAL id={pol['id']} nombre={pol.get('nombre')!r} estaciones≈{best_n} sentido={pol.get('sentido')} tipo={pol.get('tipo')}")

    armadas = (
        sb.table("topo_poligonal_armadas")
        .select("*")
        .eq("poligonal_id", pol["id"])
        .order("orden")
        .execute()
        .data
        or []
    )
    estaciones = (
        sb.table("topo_poligonal_estaciones")
        .select("*")
        .eq("poligonal_id", pol["id"])
        .is_("deleted_at", "null")
        .order("orden")
        .execute()
        .data
        or []
    )
    # Filtrar soft-delete si la columna no existe en is_
    if not estaciones:
        estaciones = (
            sb.table("topo_poligonal_estaciones")
            .select("*")
            .eq("poligonal_id", pol["id"])
            .order("orden")
            .execute()
            .data
            or []
        )
        estaciones = [e for e in estaciones if not e.get("deleted_at")]

    print(f"armadas={len(armadas)} estaciones={len(estaciones)}")

    # Amarres: puntos de biblioteca referenciados
    nombres = set()
    for a in armadas:
        if a.get("estacion_nombre"):
            nombres.add(a["estacion_nombre"])
        if a.get("visado_nombre"):
            nombres.add(a["visado_nombre"])
    pts = (
        sb.table("topo_puntos")
        .select("nombre,norte,este,cota")
        .eq("contrato_id", pol["contrato_id"])
        .in_("nombre", list(nombres))
        .execute()
        .data
        or []
    )
    amarres = {p["nombre"]: p for p in pts if p.get("norte") is not None and p.get("este") is not None}

    pi = None
    if pol.get("punto_inicial_id"):
        pi = (
            sb.table("topo_puntos")
            .select("nombre,norte,este,cota")
            .eq("id", pol["punto_inicial_id"])
            .limit(1)
            .execute()
            .data
            or [None]
        )[0]
    if not pi and armadas:
        nom = armadas[0].get("estacion_nombre")
        pi = amarres.get(nom) or {"nombre": nom}

    arms, known, flat = radiar_armadas(armadas, estaciones, amarres)
    cierre = calcular_cierre_poligonal(
        arms,
        pi,
        sentido=pol.get("sentido") or "antihorario",
        tol_relativa=pol.get("tolerancia_relativa") or 25000,
        precision_angular_seg=pol.get("precision_angular_seg") or 10.0,
        tipo_pol=pol.get("tipo") or "cerrada",
    )

    print("--- ANGULOS CIERRE ---")
    for d in cierre.get("angulos_cierre_detalle") or []:
        print(
            f"Arm {d.get('armada_orden')}: {d.get('estacion')}→{d.get('punto_adelante')} "
            f"Az={d.get('azimut_texto') or d.get('azimut')} "
            f"α={d.get('angulo_cierre_texto')} derivado={d.get('derivado')}"
        )
    print("--- RESUMEN ---")
    print(f"angulos_derivados={cierre.get('angulos_derivados')}")
    print(f"num_angulos={cierre.get('num_angulos')} num_vertices={cierre.get('num_vertices')}")
    print(f"Σ Observada={cierre.get('suma_observada_texto')} ({cierre.get('suma_observada')})")
    print(f"Σ Teórica={cierre.get('suma_teorica_texto')} ({cierre.get('suma_teorica')})")
    print(f"Diferencia={cierre.get('error_angular_seg')}\"  tol=±{cierre.get('tolerancia_angular_seg')}\"")
    print(f"admisible_angular={cierre.get('admisible_angular')}")
    print(f"error_lineal={cierre.get('error_lineal')} m  precision=1:{cierre.get('precision')} admisible_lineal={cierre.get('admisible_lineal')}")
    print(f"cerrado={cierre.get('cerrado')} admisible={cierre.get('admisible')}")
    # Snapshot azimuts primeras 3 para verificar no mutación
    for f in flat[:3]:
        print(f"punto {f.get('nombre_punto')} az={f.get('azimut_texto')} N={f.get('norte')} E={f.get('este')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
