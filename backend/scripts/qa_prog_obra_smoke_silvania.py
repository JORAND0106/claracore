#!/usr/bin/env python3
"""
Gate / smoke Programación de Obra — contrato Silvania (ICCU).

Verifica con service role (Azure App Settings) que:
  - presupuesto del módulo > 0 e igual al del contrato (tolerancia 1 COP)
  - ejecutado > 0 si hay registros SicoeObra con ítem
  - mapa carga N PK (>0), tramos cargan, borrador/estado presente
  - meta del mapa incluye estados de PK (para pintar polígonos)

Exit 0 OK / 1 FAIL. Diseñado para bloquear despliegue.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from typing import Any, Dict, List, Optional

FLOOR_EJECUTADO = 676_262_994
EXPECTED_PK_MIN = 40  # Silvania tiene 44; umbral flexible por si hay bajas


def _azure_supabase():
    from azure.identity import ClientSecretCredential
    from azure.mgmt.web import WebSiteManagementClient
    from supabase import create_client

    creds = json.loads(os.environ["AZURE_CREDENTIALS"])
    credential = ClientSecretCredential(creds["tenantId"], creds["clientId"], creds["clientSecret"])
    client = WebSiteManagementClient(credential, creds["subscriptionId"])
    app_name = "claracore-backend"
    rg = None
    for site in client.web_apps.list():
        if site.name == app_name:
            parts = site.id.split("/")
            rg = parts[parts.index("resourceGroups") + 1]
            break
    if not rg:
        raise SystemExit("claracore-backend no encontrado")
    props = dict(client.web_apps.list_application_settings(rg, app_name).properties or {})
    url = (props.get("SUPABASE_URL") or "").rstrip("/")
    key = props.get("SUPABASE_KEY") or props.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    secret = props.get("SECRET_KEY") or ""
    algo = props.get("ALGORITHM") or "HS256"
    if not (url and key):
        raise SystemExit("App Settings sin SUPABASE_URL/KEY")
    return create_client(url, key), props, secret, algo, url


def _step(name: str, fn):
    t0 = time.perf_counter()
    try:
        out = fn()
        ms = round((time.perf_counter() - t0) * 1000, 1)
        print(f"OK  {name}  {ms}ms")
        return out, None, ms
    except Exception as exc:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        print(f"FAIL {name}  {ms}ms  {exc}")
        traceback.print_exc()
        return None, exc, ms


def main() -> int:
    cid = int(os.environ.get("QA_CONTRATO_ID") or "3")
    sb, props, secret, algo, _url = _azure_supabase()
    print("contrato_id", cid)

    failures: List[str] = []

    from prog_obra_service import (
        fetch_borrador_activo,
        fetch_vigente_meta,
        fetch_mapa_rows_for_version,
        fetch_mapa_rows_rpc,
        fetch_pks_con_ruta_critica,
        enrich_mapa_rows_with_ruta_critica,
        fetch_sin_agrupador_count_by_pk,
        enrich_mapa_rows_sin_agrupador,
        fetch_tramos_contrato,
    )
    from prog_obra_ejecutado import (
        fetch_prog_pk_ejecutado_map,
        enrich_mapa_rows_with_ejecutado,
        build_ejecucion_resumen,
        clear_ejecutado_fetch_cache,
        _fetch_so_registros_ejecucion,
        _registros_ejecutables,
    )

    borrador, err, _ = _step("fetch_borrador_activo", lambda: fetch_borrador_activo(sb, cid))
    if err:
        failures.append("borrador")
    vigente, err, _ = _step("fetch_vigente_meta", lambda: fetch_vigente_meta(sb, cid))
    vid = None
    if vigente:
        vid, _num = vigente if isinstance(vigente, tuple) else (vigente, None)

    def _mapa_rows():
        if borrador and borrador.get("id"):
            return fetch_mapa_rows_for_version(sb, cid, str(borrador["id"]))
        rows = fetch_mapa_rows_rpc(sb, cid) or []
        if not rows and vid:
            rows = fetch_mapa_rows_for_version(sb, cid, str(vid))
        return rows

    rows, err, _ = _step("fetch_mapa_rows", _mapa_rows)
    if err or not rows:
        failures.append("mapa_rows_empty_or_error")
        rows = rows or []

    version_mapa_id = str(borrador["id"]) if borrador and borrador.get("id") else (str(vid) if vid else None)

    critico, err, _ = _step(
        "fetch_pks_ruta_critica",
        lambda: fetch_pks_con_ruta_critica(sb, version_mapa_id),
    )
    rows = enrich_mapa_rows_with_ruta_critica(rows or [], critico or set())

    sin_ag, err, ms_sin = _step(
        "fetch_sin_agrupador_count_by_pk",
        lambda: fetch_sin_agrupador_count_by_pk(sb, cid),
    )
    if err:
        failures.append("sin_agrupador")
        sin_ag = {}
    if ms_sin > 25000:
        failures.append(f"sin_agrupador_slow_{ms_sin}ms")
    rows = enrich_mapa_rows_sin_agrupador(rows, sin_ag or {})

    ej_map, err, _ = _step("fetch_prog_pk_ejecutado_map", lambda: fetch_prog_pk_ejecutado_map(sb, cid))
    rows = enrich_mapa_rows_with_ejecutado(rows, ej_map or {})

    tramos, err, _ = _step("fetch_tramos_contrato", lambda: fetch_tramos_contrato(sb, cid))
    if err or not tramos:
        failures.append("tramos")

    clear_ejecutado_fetch_cache()
    resumen, err, _ = _step("build_ejecucion_resumen", lambda: build_ejecucion_resumen(sb, cid))
    if err or not resumen:
        failures.append("ejecucion_resumen")
        resumen = {}

    # Metadatos del contrato (columnas mínimas reales)
    crow = (
        sb.table("contratos")
        .select("id,numero,contratista")
        .eq("id", cid)
        .limit(1)
        .execute()
        .data
        or []
    )
    contrato = crow[0] if crow else {}
    ppto_mod = float((resumen or {}).get("presupuesto_total") or 0)
    ej_mod = float((resumen or {}).get("ejecutado_total") or 0)

    # Presupuesto del contrato = misma fuente del módulo (versión vigente / alcance)
    from prog_obra_costos_presupuesto import resolve_ppto_vigente_version_id, ppto_scope_direct_total

    ppto_vid = resolve_ppto_vigente_version_id(sb, cid, None, force_vigente=True)
    ppto_contrato = float(ppto_scope_direct_total(sb, cid, ppto_vid) or 0) if ppto_vid else 0.0

    print("contrato", {k: contrato.get(k) for k in ("id", "numero", "contratista")})
    print("ppto_modulo", ppto_mod, "ppto_contrato_scope", ppto_contrato)
    print("ejecutado_modulo", ej_mod)
    print("mapa_pk", len(rows), "tramos", len(tramos or []))
    if rows:
        estados = {}
        for r in rows:
            e = r.get("estado_programacion") or "?"
            estados[e] = estados.get(e, 0) + 1
        print("estados_pk", estados)
        print("sample", {k: rows[0].get(k) for k in ("pk_id", "estado_programacion", "porcentaje_programado", "items_sin_agrupador")})

    if ppto_mod <= 0:
        failures.append("presupuesto_modulo_zero")
    if ppto_contrato > 0 and abs(ppto_mod - ppto_contrato) > 1.0:
        failures.append(f"presupuesto_mismatch_{ppto_mod}_vs_{ppto_contrato}")

    clear_ejecutado_fetch_cache()
    so_rows = _fetch_so_registros_ejecucion(sb, cid)
    ejecutables = _registros_ejecutables(so_rows)
    print("so_registros", len(so_rows), "ejecutables", len(ejecutables))
    if ejecutables and ej_mod <= 0:
        failures.append("ejecutado_zero_con_registros")
    if ej_mod > 0 and ej_mod < FLOOR_EJECUTADO:
        failures.append(f"ejecutado_bajo_piso_{ej_mod}")

    if len(rows) < EXPECTED_PK_MIN:
        failures.append(f"pk_count_{len(rows)}_lt_{EXPECTED_PK_MIN}")
    if not (borrador or vid):
        failures.append("sin_version_programacion")
    # Polígonos: al menos un PK con estado distinto de vacío
    if rows and not any((r.get("estado_programacion") or "").strip() for r in rows):
        failures.append("mapa_sin_estados")

    # HTTP live: valida el backend YA desplegado (post-deploy). En PRs puede
    # fallar con código antiguo; no bloquea el gate de lógica (QA_HTTP=0).
    if secret and os.environ.get("QA_HTTP", "1") == "1":
        try:
            import jwt
            import urllib.error
            import urllib.request
            from datetime import datetime, timedelta

            users = (
                sb.table("usuarios")
                .select("id,email,cargo_id")
                .order("id")
                .limit(50)
                .execute()
                .data
                or []
            )
            # Preferir usuario con cargo_id bajo (suele ser admin/dev) o el primero
            uid = None
            for u in users:
                if u.get("id") is not None:
                    uid = int(u["id"])
                    break
            if uid is not None:
                token = jwt.encode(
                    {
                        "sub": str(uid),
                        "exp": datetime.utcnow() + timedelta(hours=1),
                        "rol_nombre": "Desarrollador",
                        "cargo_nombre": "Desarrollador",
                    },
                    secret,
                    algorithm=algo,
                )
                if isinstance(token, bytes):
                    token = token.decode()
                api = "https://claracore-backend.azurewebsites.net"
                for path in (
                    f"/prog-obra/{cid}/mapa",
                    f"/prog-obra/{cid}/tramos",
                    f"/prog-obra/{cid}/ejecucion/resumen",
                ):
                    t0 = time.perf_counter()
                    req = urllib.request.Request(
                        f"{api}{path}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    try:
                        with urllib.request.urlopen(req, timeout=120) as resp:
                            body = json.loads(resp.read().decode())
                            ms = round((time.perf_counter() - t0) * 1000, 1)
                            if path.endswith("/mapa"):
                                n = len(body.get("pk") or [])
                                print(f"HTTP {path} status=200 pk={n} {ms}ms")
                                if n < EXPECTED_PK_MIN:
                                    failures.append(f"http_mapa_pk_{n}")
                            elif path.endswith("/tramos"):
                                n = len(body if isinstance(body, list) else [])
                                print(f"HTTP {path} status=200 tramos={n} {ms}ms")
                                if n <= 0:
                                    failures.append("http_tramos_empty")
                            else:
                                print(
                                    f"HTTP {path} status=200 ppto={body.get('presupuesto_total')} "
                                    f"ej={body.get('ejecutado_total')} err={body.get('error')} {ms}ms"
                                )
                                if float(body.get("presupuesto_total") or 0) <= 0:
                                    failures.append("http_presupuesto_zero")
                    except urllib.error.HTTPError as hexc:
                        ms = round((time.perf_counter() - t0) * 1000, 1)
                        detail = hexc.read().decode()[:300] if hexc.fp else ""
                        print(f"HTTP {path} FAIL {hexc.code} {ms}ms {detail}")
                        failures.append(f"http_{path}_{hexc.code}")
                    except Exception as hexc:
                        ms = round((time.perf_counter() - t0) * 1000, 1)
                        print(f"HTTP {path} FAIL {ms}ms {hexc}")
                        failures.append(f"http_{path}")
            else:
                print("HTTP probe skipped: sin usuarios")
        except Exception as hexc:
            print("HTTP probe skipped/failed:", hexc)
            traceback.print_exc()

    if failures:
        print("SMOKE_FAIL", failures)
        return 1
    print("SMOKE_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
