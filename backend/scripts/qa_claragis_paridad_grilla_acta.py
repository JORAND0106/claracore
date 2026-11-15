#!/usr/bin/env python3
"""
Comprobación en vivo: ClaraGIS (analisis?formato=mapa_calor) vs grilla
(analisis sin mapa + conteo de líneas / verificacion) para el mismo Acta RPO.

Uso (con token de sesión Claracore):

  export CLARACORE_API=https://claracore-backend.azurewebsites.net
  export CLARACORE_TOKEN='Bearer …'
  export CONTRATO_ID=<id numérico de ICCU-CTO-1614-2025>
  python3 backend/scripts/qa_claragis_paridad_grilla_acta.py

Imprime tabla: caso | regs ClaraGIS | CD ClaraGIS | regs analisis | CD analisis
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = (os.environ.get("CLARACORE_API") or "").rstrip("/")
TOKEN = os.environ.get("CLARACORE_TOKEN") or ""
CONTRATO_ID = os.environ.get("CONTRATO_ID") or ""

CASOS = [
    {"nombre": "Acta RPO 1", "params": {"acta_rpo": "1"}},
    {"nombre": "Acta RPO 3", "params": {"acta_rpo": "3"}},
    {"nombre": "Acta RPO (muchos ítems)", "params": {"acta_rpo": os.environ.get("ACTA_RPO_GRANDE", "2")}},
    {"nombre": "Acta 1 + capítulo", "params": {"acta_rpo": "1", "capitulo": os.environ.get("CAPITULO", "01")}},
    {
        "nombre": "Acta 1 + validación N2 No Revisado",
        "params": {
            "acta_rpo": "1",
            "validacion_capas": json.dumps([{"nivel": 2, "estado": "No Revisado"}]),
        },
    },
    {"nombre": "Ítem solo", "params": {"item": os.environ.get("ITEM", "1.1.")}},
]


def get(path: str, params: dict) -> dict:
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None and v != ""})
    url = f"{API}{path}?{qs}"
    req = urllib.request.Request(url, headers={"Authorization": TOKEN, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    if not API or not TOKEN or not CONTRATO_ID:
        print(
            "Faltan CLARACORE_API / CLARACORE_TOKEN / CONTRATO_ID. "
            "Este script no inventa números: hay que ejecutarlo autenticado.",
            file=sys.stderr,
        )
        return 2
    base = f"/sicoe-obra/{CONTRATO_ID}/analisis"
    print("| Caso | Regs ClaraGIS | CD ClaraGIS | Regs panel | CD panel | Δ regs | Δ CD |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    ok = True
    for caso in CASOS:
        p = dict(caso["params"])
        try:
            mapa = get(base, {**p, "formato": "mapa_calor"})
            panel = get(base, p)
        except urllib.error.HTTPError as e:
            print(f"| {caso['nombre']} | ERROR {e.code} | | | | | |")
            ok = False
            continue
        meta = mapa.get("meta") or {}
        regs_m = int(meta.get("total_registros") or 0)
        cd_m = float(meta.get("suma_costo_directo") or 0)
        ver = (panel.get("verificacion") or {})
        regs_p = int(ver.get("conteo_registros") or panel.get("total_registros") or 0)
        cd_p = float(ver.get("suma_costo_directo_registros") or panel.get("costo_total") or 0)
        d_r = regs_m - regs_p
        d_c = round(cd_m - cd_p, 2)
        if d_r != 0 or abs(d_c) > 0.01:
            ok = False
        print(
            f"| {caso['nombre']} | {regs_m} | {cd_m:,.0f} | {regs_p} | {cd_p:,.0f} | {d_r} | {d_c} |"
        )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
