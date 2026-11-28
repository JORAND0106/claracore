#!/usr/bin/env python3
"""
Regenera el PNG del esquema #192 (Poceta de encole) del reporte SicoeObra #54
con C-OUT-24 (un cuadro por cálculo) y actualiza graficos_historial / blob público.

Requiere:
  - AZURE_CREDENTIALS (App Settings → SUPABASE + storage)
  - REGEN_PNG_PATH: PNG ya compuesto (p. ej. por node-canvas en el job)
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

REPORTE_NUM = 54
ESQUEMA_ID = "fda065a0-1c2b-41d5-848d-9d0dc25bacc2"
GRAFICO_NUM = 192
OUT_DIR = os.environ.get("REGEN_OUT_DIR") or "/tmp/regen_esquema_54"


def _azure():
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
    if not (url and key):
        raise SystemExit("sin SUPABASE")
    for k in ("AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_CONTAINER", "AZURE_STORAGE_CONTAINER_PRIVADO"):
        if props.get(k):
            os.environ[k] = props[k]
    return create_client(url, key), props


def _parse_hist(raw) -> List[dict]:
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        try:
            j = json.loads(raw)
            return [x for x in j if isinstance(x, dict)] if isinstance(j, list) else []
        except Exception:
            return []
    return []


def _es_esquema(g: dict) -> bool:
    if not isinstance(g, dict):
        return False
    if g.get("esquema_id") and str(g["esquema_id"]) == ESQUEMA_ID:
        return True
    if g.get("numero") is not None and int(g["numero"]) == GRAFICO_NUM:
        return True
    return False


def upload_public_png(props: dict, path: str, data: bytes) -> str:
    from azure.storage.blob import BlobServiceClient, ContentSettings

    cs = props.get("AZURE_STORAGE_CONNECTION_STRING") or os.environ["AZURE_STORAGE_CONNECTION_STRING"]
    pub = (props.get("AZURE_STORAGE_CONTAINER") or os.getenv("AZURE_STORAGE_CONTAINER") or "claracore").strip()
    bsc = BlobServiceClient.from_connection_string(cs)
    bc = bsc.get_blob_client(pub, path)
    bc.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type="image/png"),
    )
    # URL pública
    acct = None
    for part in cs.split(";"):
        if part.startswith("AccountName="):
            acct = part.split("=", 1)[1]
            break
    if not acct:
        raise SystemExit("AccountName no encontrado")
    return f"https://{acct}.blob.core.windows.net/{pub}/{path}"


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    png_path = (os.environ.get("REGEN_PNG_PATH") or "").strip()
    if not png_path or not os.path.isfile(png_path):
        print(json.dumps({"ok": False, "error": "REGEN_PNG_PATH ausente"}))
        return 2
    data = open(png_path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        print(json.dumps({"ok": False, "error": "no es PNG"}))
        return 3

    sb, props = _azure()
    rep = (
        sb.table("so_reportes")
        .select("id,contrato_id,numero_reporte,descripcion_actividad")
        .eq("numero_reporte", REPORTE_NUM)
        .ilike("descripcion_actividad", "%Encole%")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rep:
        print(json.dumps({"ok": False, "error": "reporte 54 no encontrado"}))
        return 4
    reporte = rep[0]
    cid = int(reporte["contrato_id"])
    rid = int(reporte["id"])

    blob_path = f"{cid}/graficos/grafico_{GRAFICO_NUM}.png"
    url = upload_public_png(props, blob_path, data)
    # cache-bust query for clientes
    url_bust = f"{url}?v={int(datetime.now(timezone.utc).timestamp())}"

    regs = (
        sb.table("so_registros")
        .select("id,numero_registro,grafico_url,grafico_numero,graficos_historial,cantidad_total,bloqueado,nivel1_estado")
        .eq("reporte_id", rid)
        .order("numero_registro")
        .execute()
        .data
        or []
    )
    patched = []
    for reg in regs:
        hist = _parse_hist(reg.get("graficos_historial"))
        if not any(_es_esquema(g) for g in hist):
            continue
        before = {
            "cantidad_total": reg.get("cantidad_total"),
            "bloqueado": reg.get("bloqueado"),
            "nivel1_estado": reg.get("nivel1_estado"),
            "grafico_url": reg.get("grafico_url"),
        }
        new_hist = []
        for g in hist:
            if _es_esquema(g):
                g2 = dict(g)
                g2["url"] = url_bust
                g2["numero"] = GRAFICO_NUM
                g2["origen"] = g2.get("origen") or "esquema"
                g2["kind"] = g2.get("kind") or "esquema"
                new_hist.append(g2)
            else:
                new_hist.append(g)
        body = {
            "grafico_url": url_bust,
            "grafico_numero": GRAFICO_NUM,
            "graficos_historial": new_hist,
        }
        sb.table("so_registros").update(body).eq("id", reg["id"]).execute()
        after = (
            sb.table("so_registros")
            .select("id,grafico_url,cantidad_total,bloqueado,nivel1_estado")
            .eq("id", reg["id"])
            .single()
            .execute()
            .data
        )
        patched.append({
            "registro_id": reg["id"],
            "numero_registro": reg.get("numero_registro"),
            "cantidad_intacta": before["cantidad_total"] == after.get("cantidad_total"),
            "sellado_intacto": before["bloqueado"] == after.get("bloqueado")
            and before["nivel1_estado"] == after.get("nivel1_estado"),
            "url": after.get("grafico_url"),
        })

    out = {
        "ok": True,
        "reporte": reporte,
        "blob_path": blob_path,
        "url": url_bust,
        "png_bytes": len(data),
        "n_patched": len(patched),
        "patched": patched,
        "cantidades_intactas": all(p["cantidad_intacta"] for p in patched),
        "sellado_intacto": all(p["sellado_intacto"] for p in patched),
    }
    path = os.path.join(OUT_DIR, "regen_esquema_54_resultado.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False, default=str)
    print(json.dumps(out, indent=2, default=str))
    return 0 if out["ok"] and patched else 5


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise
