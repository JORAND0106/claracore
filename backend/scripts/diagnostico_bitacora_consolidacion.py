#!/usr/bin/env python3
"""
Diagnóstico SOLO LECTURA — consolidación Bitácora incompleta en frontend.

Compara:
  - backup `_bak_seg_bitacora_entrada_consol_20260922` (+ usos)
  - diarios actuales `seguimiento_bitacora_entrada` / `seguimiento_bitacora_equipo_uso`

NO escribe ni borra nada.

Uso:
  SUPABASE_URL=... SUPABASE_KEY=... PYTHONPATH=backend \\
    python3 backend/scripts/diagnostico_bitacora_consolidacion.py

Salida: JSON en stdout + resumen humano en stderr.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _sb():
    url = _env("SUPABASE_URL") or _env("VITE_SUPABASE_URL")
    key = _env("SUPABASE_KEY") or _env("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "MISSING_SECRETS: se requieren SUPABASE_URL y SUPABASE_KEY (service_role).",
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


def _len_json(val: Any) -> int:
    return len(_arr(val))


def _fetch_all(sb, table: str, columns: str = "*", chunk: int = 1000) -> List[dict]:
    out: List[dict] = []
    start = 0
    while True:
        end = start + chunk - 1
        rows = (
            sb.table(table)
            .select(columns)
            .range(start, end)
            .execute()
            .data
            or []
        )
        out.extend(rows)
        if len(rows) < chunk:
            break
        start += chunk
    return out


def main() -> int:
    sb = _sb()
    report: Dict[str, Any] = {
        "veredicto": None,
        "backup_existe": False,
        "grupos": [],
        "frontend_vs_db": "pendiente",
        "notas": [],
    }

    # ¿Existe backup?
    try:
        bak_entradas = _fetch_all(sb, "_bak_seg_bitacora_entrada_consol_20260922")
        report["backup_existe"] = True
    except Exception as exc:
        report["notas"].append(f"No se pudo leer backup entradas: {exc}")
        bak_entradas = []

    try:
        bak_usos = _fetch_all(sb, "_bak_seg_bitacora_equipo_uso_consol_20260922")
    except Exception as exc:
        report["notas"].append(f"No se pudo leer backup usos: {exc}")
        bak_usos = []

    if not bak_entradas:
        # Sin backup: al menos inspeccionar diarios actuales multi-tramo / conteos
        report["notas"].append(
            "Backup vacío o inaccesible. Se inspeccionan solo diarios actuales."
        )

    # Diarios actuales (solo tipo diario)
    try:
        actuales = (
            sb.table("seguimiento_bitacora_entrada")
            .select(
                "id,contrato_id,fecha,tramo,estado,"
                "asistencia_colaboradores,materiales,personal,eventos,imagenes"
            )
            .eq("tipo", "diario")
            .execute()
            .data
            or []
        )
        # Si hay muchos, range
        if len(actuales) >= 1000:
            actuales = _fetch_all(
                sb,
                "seguimiento_bitacora_entrada",
                "id,contrato_id,fecha,tramo,estado,"
                "asistencia_colaboradores,materiales,personal,eventos,imagenes",
            )
            actuales = [r for r in actuales if str(r.get("tipo") or "diario") == "diario"
                        or True]
    except Exception as exc:
        print(f"ERROR leyendo entradas actuales: {exc}", file=sys.stderr)
        return 1

    # Filtrar solo diarios si el select no filtró por tipo en fetch_all
    # (cuando usamos select con .eq ya está filtrado)

    usos_by_entrada: Dict[int, int] = defaultdict(int)
    try:
        usos_rows = _fetch_all(sb, "seguimiento_bitacora_equipo_uso", "id,entrada_id,tramo,equipo_nombre")
        for u in usos_rows:
            try:
                usos_by_entrada[int(u["entrada_id"])] += 1
            except Exception:
                pass
    except Exception as exc:
        report["notas"].append(f"No se pudieron leer usos actuales: {exc}")
        usos_rows = []

    bak_usos_by_entrada: Dict[int, int] = defaultdict(int)
    for u in bak_usos:
        try:
            bak_usos_by_entrada[int(u["entrada_id"])] += 1
        except Exception:
            pass

    # Index actual por (contrato, fecha)
    actual_by_cf: Dict[Tuple[int, str], List[dict]] = defaultdict(list)
    for e in actuales:
        try:
            cid = int(e["contrato_id"])
            fecha = str(e.get("fecha") or "")[:10]
        except Exception:
            continue
        actual_by_cf[(cid, fecha)].append(e)

    # Grupos del backup
    bak_by_cf: Dict[Tuple[int, str], List[dict]] = defaultdict(list)
    for e in bak_entradas:
        try:
            cid = int(e["contrato_id"])
            fecha = str(e.get("fecha") or "")[:10]
        except Exception:
            continue
        bak_by_cf[(cid, fecha)].append(e)

    keys = sorted(set(bak_by_cf.keys()) | {
        k for k, v in actual_by_cf.items() if len(v) > 1
    })

    perdida_confirmada = False
    datos_en_db_completos = False
    sospecha_frontend = False

    for key in sorted(bak_by_cf.keys()):
        cid, fecha = key
        bak_rows = sorted(bak_by_cf[key], key=lambda r: int(r.get("id") or 0))
        act_rows = sorted(actual_by_cf.get(key, []), key=lambda r: int(r.get("id") or 0))

        asist_bak = sum(_len_json(r.get("asistencia_colaboradores")) for r in bak_rows)
        mat_bak = sum(_len_json(r.get("materiales")) for r in bak_rows)
        usos_bak = sum(bak_usos_by_entrada.get(int(r["id"]), 0) for r in bak_rows if r.get("id") is not None)

        asist_act = sum(_len_json(r.get("asistencia_colaboradores")) for r in act_rows)
        mat_act = sum(_len_json(r.get("materiales")) for r in act_rows)
        usos_act = sum(usos_by_entrada.get(int(r["id"]), 0) for r in act_rows if r.get("id") is not None)

        # Desglose por tramo origen (backup)
        por_tramo = []
        for r in bak_rows:
            por_tramo.append({
                "entrada_id": r.get("id"),
                "tramo": r.get("tramo"),
                "n_asist": _len_json(r.get("asistencia_colaboradores")),
                "n_mat": _len_json(r.get("materiales")),
                "n_usos": bak_usos_by_entrada.get(int(r["id"]), 0) if r.get("id") is not None else 0,
            })

        # Tramos presentes en asistencia actual
        tramos_asist_act = set()
        for r in act_rows:
            for row in _arr(r.get("asistencia_colaboradores")):
                t = str(row.get("tramo") or "").strip()
                if t:
                    tramos_asist_act.add(t)
                elif r.get("tramo"):
                    tramos_asist_act.add(str(r.get("tramo")))

        tramos_usos_act = set()
        for r in act_rows:
            eid = int(r["id"]) if r.get("id") is not None else None
            if eid is None:
                continue
            for u in usos_rows:
                if int(u.get("entrada_id") or 0) != eid:
                    continue
                t = str(u.get("tramo") or "").strip()
                if t:
                    tramos_usos_act.add(t)

        delta_asist = asist_bak - asist_act
        delta_usos = usos_bak - usos_act

        grupo = {
            "contrato_id": cid,
            "fecha": fecha,
            "n_entradas_bak": len(bak_rows),
            "n_entradas_actual": len(act_rows),
            "keeper_id_actual": act_rows[0]["id"] if act_rows else None,
            "asist_bak": asist_bak,
            "asist_actual": asist_act,
            "asist_faltante": delta_asist,
            "mat_bak": mat_bak,
            "mat_actual": mat_act,
            "usos_bak": usos_bak,
            "usos_actual": usos_act,
            "usos_faltantes": delta_usos,
            "por_tramo_backup": por_tramo,
            "tramos_en_asist_actual": sorted(tramos_asist_act),
            "tramos_en_usos_actual": sorted(tramos_usos_act),
        }
        report["grupos"].append(grupo)

        if delta_asist > 0 or delta_usos > 0:
            perdida_confirmada = True
        if delta_asist <= 0 and delta_usos <= 0 and asist_bak > 0:
            datos_en_db_completos = True

    if perdida_confirmada:
        report["veredicto"] = "PERDIDA_REAL_EN_BD"
        report["frontend_vs_db"] = (
            "Los conteos actuales son menores que el backup → datos faltan en BD "
            "(no es solo un filtro de UI). Usar script de recuperación desde backup."
        )
    elif datos_en_db_completos:
        # Si BD tiene todo pero UI no, sospecha frontend
        sospecha_frontend = True
        report["veredicto"] = "DATOS_EN_BD_OK_SOSPECHA_FRONTEND"
        report["frontend_vs_db"] = (
            "Backup vs actual: conteos OK. Si el UI sigue mostrando un solo tramo, "
            "revisar carga/render (enrich/dedupe o filtro)."
        )
    elif not bak_entradas:
        report["veredicto"] = "SIN_BACKUP_DIAGNOSTICO_PARCIAL"
    else:
        report["veredicto"] = "SIN_DISCREPANCIA_DETECTADA"

    if sospecha_frontend:
        report["notas"].append(
            "Si UI truncada con BD completa: verificar que el deploy incluya el fix "
            "de dedupe por tramo (#610) y que no se haya re-guardado un payload truncado."
        )

    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))

    # Resumen humano
    print("\n=== RESUMEN ===", file=sys.stderr)
    print(f"Veredicto: {report['veredicto']}", file=sys.stderr)
    print(f"Backup existe: {report['backup_existe']} ({len(bak_entradas)} filas)", file=sys.stderr)
    for g in report["grupos"]:
        print(
            f"  contrato={g['contrato_id']} fecha={g['fecha']}: "
            f"asist {g['asist_actual']}/{g['asist_bak']} "
            f"(faltan {g['asist_faltante']}), "
            f"usos {g['usos_actual']}/{g['usos_bak']} "
            f"(faltan {g['usos_faltantes']})",
            file=sys.stderr,
        )
    for n in report["notas"]:
        print(f"  nota: {n}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
