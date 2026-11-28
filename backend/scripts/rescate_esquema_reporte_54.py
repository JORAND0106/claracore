#!/usr/bin/env python3
"""
Rescate SOLO del esquema eliminado del reporte SicoeObra #54
("Encole para alcantarilla en tramo 7 abscisa K11+340").

No restaura la BD completa ni toca cantidades/ítems/sellado.
Usa service role vía AZURE_CREDENTIALS → App Settings del backend.

Salida: JSON inventario + resultado en RESCATE_OUT_DIR (default /tmp/rescate_esquema_54).
"""
from __future__ import annotations

import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

REPORTE_NUM = 54
REPORTE_NOMBRE_FRAG = "Encole para alcantarilla"
OUT_DIR = os.environ.get("RESCATE_OUT_DIR") or "/tmp/rescate_esquema_54"


def _azure_supabase_and_props():
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
        raise SystemExit("App Settings sin SUPABASE_URL/KEY")
    for k in (
        "AZURE_STORAGE_CONNECTION_STRING",
        "AZURE_STORAGE_CONTAINER",
        "AZURE_STORAGE_CONTAINER_PRIVADO",
    ):
        if props.get(k):
            os.environ[k] = props[k]
    return create_client(url, key), props, rg


def _contar_calcs(entrada: dict) -> int:
    scene = entrada.get("scene") or entrada.get("esquema_scene") or {}
    if not isinstance(scene, dict):
        return 0
    calcs = scene.get("volumeCalcs") or []
    if not isinstance(calcs, list):
        return 0
    return sum(1 for c in calcs if isinstance(c, dict) and (c.get("lines") or []))


def _es_entrada_esquema(g: dict) -> bool:
    if not isinstance(g, dict):
        return False
    origen = str(g.get("origen") or "").lower()
    kind = str(g.get("kind") or "").lower()
    if kind in ("esquema-pdf", "esquema-dxf", "esquema-scene", "memoria-calculo", "grafico-isometrico"):
        return False
    if origen == "esquema" or kind == "esquema" or g.get("esquema_id"):
        return True
    # Heurística: historial con scene+volumeCalcs
    scene = g.get("scene") or g.get("esquema_scene")
    if isinstance(scene, dict) and scene.get("volumeCalcs") and (g.get("url") or g.get("numero") is not None):
        return True
    return False


def _parse_hist(raw) -> List[dict]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        try:
            j = json.loads(raw)
            return [x for x in j if isinstance(x, dict)] if isinstance(j, list) else []
        except Exception:
            return []
    return []


def _parse_jsonish(raw):
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {"_raw": raw[:500]}
    return raw


def find_reporte(sb) -> Optional[dict]:
    cols = (
        "id,contrato_id,numero_reporte,descripcion_actividad,estado,"
        "created_at,updated_at,tramo,abs_inicio,abs_final"
    )
    r = (
        sb.table("so_reportes")
        .select(cols)
        .eq("numero_reporte", REPORTE_NUM)
        .execute()
    )
    rows = r.data or []
    if not rows:
        r2 = (
            sb.table("so_reportes")
            .select(cols)
            .ilike("descripcion_actividad", f"%{REPORTE_NOMBRE_FRAG}%")
            .limit(20)
            .execute()
        )
        rows = r2.data or []
    if not rows:
        return None
    for row in rows:
        nom = str(row.get("descripcion_actividad") or "")
        if REPORTE_NOMBRE_FRAG.lower() in nom.lower() and int(row.get("numero_reporte") or 0) == REPORTE_NUM:
            return row
    for row in rows:
        if int(row.get("numero_reporte") or 0) == REPORTE_NUM:
            return row
    return rows[0]


def fetch_registros(sb, reporte_id: int) -> List[dict]:
    # so_registros: creado_en (no updated_at). Probar columnas y degradar.
    col_sets = [
        (
            "id,reporte_id,contrato_id,numero_registro,item_numero,item_descripcion,"
            "cantidad_total,cantidad,unidad,grafico_url,grafico_numero,grafico_descripcion,"
            "graficos_historial,bloqueado,nivel1_estado,creado_en"
        ),
        (
            "id,reporte_id,contrato_id,numero_registro,cantidad_total,"
            "grafico_url,grafico_numero,grafico_descripcion,graficos_historial,"
            "bloqueado,creado_en"
        ),
        (
            "id,reporte_id,contrato_id,numero_registro,cantidad_total,"
            "grafico_url,grafico_numero,grafico_descripcion,graficos_historial,bloqueado"
        ),
    ]
    last_err = None
    for cols in col_sets:
        try:
            r = (
                sb.table("so_registros")
                .select(cols)
                .eq("reporte_id", reporte_id)
                .order("numero_registro")
                .execute()
            )
            return r.data or []
        except Exception as e:
            last_err = e
            print(f"WARN fetch_registros ({cols[:40]}…): {e}", file=sys.stderr)
    raise last_err or RuntimeError("fetch_registros falló")


def inventory_from_registros(regs: List[dict]) -> Dict[str, Any]:
    actuales = []
    for reg in regs:
        hist = _parse_hist(reg.get("graficos_historial"))
        esq = [g for g in hist if _es_entrada_esquema(g)]
        actuales.append({
            "registro_id": reg.get("id"),
            "numero_registro": reg.get("numero_registro"),
            "item_numero": reg.get("item_numero"),
            "grafico_url": reg.get("grafico_url"),
            "grafico_numero": reg.get("grafico_numero"),
            "n_historial": len(hist),
            "esquemas_en_historial": [
                {
                    "esquema_id": g.get("esquema_id"),
                    "numero": g.get("numero"),
                    "nombre": g.get("nombre") or g.get("descripcion"),
                    "url": g.get("url"),
                    "n_calcs": _contar_calcs(g),
                    "creado_en": g.get("creado_en"),
                    "tiene_scene": bool(g.get("scene") or g.get("esquema_scene")),
                }
                for g in esq
            ],
        })
    return {"registros": actuales}


def _extraer_candidatos_de_snap(snap: dict, meta: dict) -> List[dict]:
    out = []
    if not isinstance(snap, dict):
        return out
    hist = _parse_hist(snap.get("graficos_historial"))
    for g in hist:
        if not _es_entrada_esquema(g):
            continue
        # Exigir url o scene para ser restaurable
        if not (g.get("url") or g.get("scene") or g.get("esquema_scene")):
            continue
        g2 = dict(g)
        g2.update(meta)
        g2["_registroId"] = snap.get("id") or meta.get("_registroId")
        g2["_numeroRegistro"] = snap.get("numero_registro") or meta.get("_numeroRegistro")
        out.append(g2)
    return out


def inventory_logs(sb, contrato_id: int, reporte_id: int, reg_ids: List[int]) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "rows": [],
        "candidatos_esquema": [],
        "error": None,
        "queries": [],
    }
    seen_log_ids: Set[Any] = set()
    filtered: List[dict] = []

    def _ingest(rows: List[dict], tag: str):
        out["queries"].append({"tag": tag, "n": len(rows)})
        for row in rows:
            lid = row.get("id")
            if lid in seen_log_ids:
                continue
            seen_log_ids.add(lid)
            filtered.append(row)
            for key in ("valor_anterior", "valor_nuevo"):
                snap = _parse_jsonish(row.get(key))
                if isinstance(snap, dict):
                    out["candidatos_esquema"].extend(
                        _extraer_candidatos_de_snap(snap, {
                            "_rescateFuente": "log_modificaciones",
                            "_log_id": lid,
                            "_log_at": row.get("created_at"),
                            "_log_accion": row.get("accion"),
                            "_log_usuario": row.get("usuario_nombre"),
                            "_log_query": tag,
                        })
                    )
            # También campos_modificados.anterior en detalle
            det = _parse_jsonish(row.get("detalle"))
            if isinstance(det, dict):
                for cm in (det.get("campos_modificados") or []):
                    if not isinstance(cm, dict):
                        continue
                    if cm.get("campo") == "graficos_historial":
                        ant = cm.get("anterior")
                        if isinstance(ant, list):
                            fake = {"id": None, "graficos_historial": ant}
                            out["candidatos_esquema"].extend(
                                _extraer_candidatos_de_snap(fake, {
                                    "_rescateFuente": "log_campos_modificados",
                                    "_log_id": lid,
                                    "_log_at": row.get("created_at"),
                                    "_log_usuario": row.get("usuario_nombre"),
                                    "_registroId": row.get("entidad_id"),
                                })
                            )

    try:
        select_cols = (
            "id,created_at,usuario_nombre,accion,modulo,entidad_tipo,entidad_id,"
            "detalle,valor_anterior,valor_nuevo,resultado"
        )
        # 1) Por entidad registro (chunks)
        for i in range(0, len(reg_ids), 40):
            chunk = [str(x) for x in reg_ids[i:i + 40]]
            if not chunk:
                continue
            r = (
                sb.table("logs")
                .select(select_cols)
                .eq("contrato_id", contrato_id)
                .eq("modulo", "SICOE")
                .eq("entidad_tipo", "registro")
                .in_("entidad_id", chunk)
                .order("created_at", desc=True)
                .limit(1000)
                .execute()
            )
            _ingest(r.data or [], f"registro_ids_{i}")

        # 2) Por reporte
        r2 = (
            sb.table("logs")
            .select(select_cols)
            .eq("contrato_id", contrato_id)
            .eq("modulo", "SICOE")
            .ilike("entidad_tipo", "%reporte%")
            .eq("entidad_id", str(reporte_id))
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        _ingest(r2.data or [], "reporte")

        # 3) Barrido reciente SICOE del contrato (por si entidad_tipo varía)
        r3 = (
            sb.table("logs")
            .select(select_cols)
            .eq("contrato_id", contrato_id)
            .eq("modulo", "SICOE")
            .order("created_at", desc=True)
            .limit(3000)
            .execute()
        )
        rid_set = {str(x) for x in reg_ids}
        rid_set.add(str(reporte_id))
        hit = []
        for row in (r3.data or []):
            eid = str(row.get("entidad_id") or "")
            if eid in rid_set:
                hit.append(row)
                continue
            blob = json.dumps({
                "d": row.get("detalle"),
                "a": row.get("valor_anterior"),
                "n": row.get("valor_nuevo"),
            }, default=str)
            if (
                f'"reporte_id": {reporte_id}' in blob
                or f'"reporte_id":{reporte_id}' in blob
                or (f"reporte_id\": \"{reporte_id}\"" in blob)
            ):
                hit.append(row)
            elif "grafico" in blob.lower() and (
                "esquema" in blob.lower() or "volumeCalcs" in blob or "volume_calcs" in blob
            ):
                # Solo si menciona alguno de nuestros registro ids
                if any(str(rid) in blob for rid in reg_ids):
                    hit.append(row)
        _ingest(hit, "barrido_sicoe")

        out["rows"] = [
            {
                "id": r.get("id"),
                "created_at": r.get("created_at"),
                "usuario": r.get("usuario_nombre"),
                "accion": r.get("accion"),
                "entidad_tipo": r.get("entidad_tipo"),
                "entidad_id": r.get("entidad_id"),
                "resultado": r.get("resultado"),
            }
            for r in sorted(filtered, key=lambda x: str(x.get("created_at") or ""), reverse=True)[:250]
        ]
        out["n_filtrados"] = len(filtered)
        out["n_candidatos"] = len(out["candidatos_esquema"])
    except Exception as e:
        out["error"] = str(e)
        out["traceback"] = traceback.format_exc()
    return out


def inventory_blobs(contrato_id: int, reporte_id: int, reg_ids: List[int], desc: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "graficos_prefix": f"{contrato_id}/graficos/",
        "esquemas_prefix": f"esquemas/{contrato_id}/",
        "graficos": [],
        "esquemas_assets": [],
        "esquemas_del_reporte": [],
        "scene_blobs": [],
        "error": None,
    }
    try:
        from azure.storage.blob import BlobServiceClient

        cs = (os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "").strip()
        if not cs:
            out["error"] = "AZURE_STORAGE_CONNECTION_STRING ausente"
            return out
        bsc = BlobServiceClient.from_connection_string(cs)
        pub = (os.getenv("AZURE_STORAGE_CONTAINER") or "claracore").strip()
        priv = (os.getenv("AZURE_STORAGE_CONTAINER_PRIVADO") or "claracore-privado").strip()

        def list_prefix(container: str, prefix: str, limit: int = 400) -> List[dict]:
            items = []
            cc = bsc.get_container_client(container)
            for i, blob in enumerate(cc.list_blobs(name_starts_with=prefix)):
                if i >= limit:
                    break
                items.append({
                    "container": container,
                    "name": blob.name,
                    "size": getattr(blob, "size", None),
                    "last_modified": str(getattr(blob, "last_modified", None)),
                })
            return items

        out["graficos"] = list_prefix(pub, f"{contrato_id}/graficos/")

        # Prefijos privados del módulo sicoe
        slug_desc = re.sub(r"[^a-zA-Z0-9._\-]+", "-", (desc or "")[:60]).strip("-")
        prefixes = [
            f"esquemas/{contrato_id}/sicoe-obra/{reporte_id}-",
            f"esquemas/{contrato_id}/sicoe-obra/{reporte_id}/",
            f"esquemas/{contrato_id}/sicoe/{reporte_id}-",
            f"esquemas/{contrato_id}/sicoe/{reporte_id}/",
            f"esquemas/{contrato_id}/SicoeObra/{reporte_id}-",
            f"esquemas/{contrato_id}/SicoeObra/{reporte_id}/",
        ]
        if slug_desc:
            prefixes.append(f"esquemas/{contrato_id}/sicoe-obra/{reporte_id}-{slug_desc}")

        seen_names = set()
        for pref in prefixes:
            for it in list_prefix(priv, pref, limit=500):
                if it["name"] in seen_names:
                    continue
                seen_names.add(it["name"])
                out["esquemas_del_reporte"].append(it)
                if it["name"].endswith(".scene.json") or "scene" in it["name"].split("/")[-1]:
                    out["scene_blobs"].append(it)

        # También listar por registro_id bajo cualquier módulo
        for rid in reg_ids[:80]:
            for mod in ("sicoe-obra", "sicoe", "SicoeObra"):
                pref = f"esquemas/{contrato_id}/{mod}/"
                # demasiada lista — solo si ya tenemos algo del reporte
                break
            # Match paths that contain /{reporte_id}- or /{reporte_id}/ and /{rid}-
            pass

        # Sample general for evidence
        sample = list_prefix(priv, f"esquemas/{contrato_id}/", limit=80)
        out["esquemas_sample"] = sample
        out["esquemas_assets"] = out["esquemas_del_reporte"]
    except Exception as e:
        out["error"] = str(e)
        out["traceback"] = traceback.format_exc()
    return out


def download_scene_blob(blob_name: str) -> Optional[dict]:
    try:
        from azure.storage.blob import BlobServiceClient

        cs = (os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "").strip()
        priv = (os.getenv("AZURE_STORAGE_CONTAINER_PRIVADO") or "claracore-privado").strip()
        bsc = BlobServiceClient.from_connection_string(cs)
        data = bsc.get_blob_client(priv, blob_name).download_blob().readall()
        j = json.loads(data.decode("utf-8"))
        return j if isinstance(j, dict) else None
    except Exception as e:
        print(f"WARN download_scene {blob_name}: {e}", file=sys.stderr)
        return None


def public_url_for_grafico(props: dict, path: str) -> Optional[str]:
    """Construye URL pública del contenedor si hay account en connection string."""
    cs = (props.get("AZURE_STORAGE_CONNECTION_STRING") or os.getenv("AZURE_STORAGE_CONNECTION_STRING") or "")
    pub = (props.get("AZURE_STORAGE_CONTAINER") or os.getenv("AZURE_STORAGE_CONTAINER") or "claracore").strip()
    m = re.search(r"AccountName=([^;]+)", cs)
    if not m:
        return None
    acct = m.group(1)
    return f"https://{acct}.blob.core.windows.net/{pub}/{path}"


def elegir_mejor(candidatos: List[dict]) -> Optional[dict]:
    if not candidatos:
        return None
    scored = []
    for i, c in enumerate(candidatos):
        n = _contar_calcs(c)
        ts = 0
        for k in ("creado_en", "_log_at"):
            if c.get(k):
                try:
                    ts = max(ts, int(datetime.fromisoformat(str(c[k]).replace("Z", "+00:00")).timestamp()))
                except Exception:
                    pass
        has_url = 1 if c.get("url") else 0
        has_scene = 1 if (c.get("scene") or c.get("esquema_scene")) else 0
        scored.append((n, has_scene, has_url, ts, -i, c))
    scored.sort(reverse=True)
    return scored[0][5]


def pick_primary(hist: List[dict]) -> Optional[dict]:
    for g in reversed(hist):
        if _es_entrada_esquema(g) and g.get("url"):
            return g
    for g in reversed(hist):
        if g.get("url") and not str(g.get("mime") or "").endswith("pdf"):
            return g
    return hist[-1] if hist else None


def restaurar(sb, reporte: dict, regs: List[dict], entrada: dict, ids_asignar: List[Any]) -> Dict[str, Any]:
    eid = entrada.get("esquema_id")
    num = entrada.get("numero")
    desired = {str(x) for x in ids_asignar}
    patched = []

    def same_esquema(g: dict) -> bool:
        if not _es_entrada_esquema(g):
            return False
        if eid and g.get("esquema_id") and str(g["esquema_id"]) == str(eid):
            return True
        if num is not None and g.get("numero") is not None:
            try:
                return int(g["numero"]) == int(num)
            except Exception:
                return False
        return False

    for reg in regs:
        rid = str(reg["id"])
        hist = _parse_hist(reg.get("graficos_historial"))
        tiene = any(same_esquema(g) for g in hist)
        quiere = rid in desired
        entrada_put = {
            "url": entrada.get("url"),
            "numero": entrada.get("numero"),
            "creado_en": entrada.get("creado_en") or datetime.now(timezone.utc).isoformat(),
            "origen": "esquema",
            "kind": "esquema",
            "nombre": str(entrada.get("nombre") or entrada.get("descripcion") or "Esquema").strip() or "Esquema",
            "esquema_id": entrada.get("esquema_id"),
            "reporte_id": reporte["id"],
        }
        scene = entrada.get("scene") or entrada.get("esquema_scene")
        if scene:
            entrada_put["scene"] = scene
            entrada_put["esquema_scene"] = scene

        if quiere and not tiene:
            hist = [g for g in hist if not same_esquema(g)] + [entrada_put]
        elif not quiere and tiene:
            hist = [g for g in hist if not same_esquema(g)]
        elif quiere and tiene:
            hist = [
                ({**g, **entrada_put, "creado_en": entrada_put.get("creado_en") or g.get("creado_en")}
                 if same_esquema(g) else g)
                for g in hist
            ]
        else:
            continue

        prim = pick_primary(hist)
        body = {
            "grafico_url": (prim or {}).get("url"),
            "grafico_numero": (prim or {}).get("numero"),
            "grafico_descripcion": (prim or {}).get("nombre") or entrada_put["nombre"],
            "graficos_historial": hist,
        }
        before = {
            "grafico_url": reg.get("grafico_url"),
            "grafico_numero": reg.get("grafico_numero"),
            "cantidad_total": reg.get("cantidad_total"),
            "cantidad": reg.get("cantidad"),
            "bloqueado": reg.get("bloqueado"),
            "nivel1_estado": reg.get("nivel1_estado"),
        }
        sb.table("so_registros").update(body).eq("id", reg["id"]).execute()
        after = None
        for cols in (
            "id,numero_registro,grafico_url,grafico_numero,grafico_descripcion,"
            "cantidad_total,cantidad,bloqueado,nivel1_estado,graficos_historial",
            "id,numero_registro,grafico_url,grafico_numero,grafico_descripcion,"
            "cantidad_total,bloqueado,graficos_historial",
        ):
            try:
                after = sb.table("so_registros").select(cols).eq("id", reg["id"]).single().execute().data
                break
            except Exception as e:
                print(f"WARN after-select: {e}", file=sys.stderr)
        if not after:
            raise RuntimeError(f"No se pudo releer registro {reg['id']} tras patch")
        patched.append({
            "registro_id": reg["id"],
            "numero_registro": reg.get("numero_registro"),
            "before": before,
            "after": {
                "grafico_url": after.get("grafico_url"),
                "grafico_numero": after.get("grafico_numero"),
                "cantidad_total": after.get("cantidad_total"),
                "cantidad": after.get("cantidad"),
                "bloqueado": after.get("bloqueado"),
                "nivel1_estado": after.get("nivel1_estado"),
                "tiene_esquema": any(_es_entrada_esquema(g) for g in _parse_hist(after.get("graficos_historial"))),
                "n_calcs": max((_contar_calcs(g) for g in _parse_hist(after.get("graficos_historial")) if _es_entrada_esquema(g)), default=0),
            },
            "cantidad_intacta": before.get("cantidad_total") == after.get("cantidad_total")
            and before.get("cantidad") == after.get("cantidad"),
            "sellado_intacto": before.get("bloqueado") == after.get("bloqueado")
            and before.get("nivel1_estado") == after.get("nivel1_estado"),
        })
    return {"patched": patched, "n": len(patched)}


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    invent: Dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "reporte_buscado": {"numero": REPORTE_NUM, "nombre_frag": REPORTE_NOMBRE_FRAG},
    }
    try:
        sb, props, rg = _azure_supabase_and_props()
        invent["azure_rg"] = rg
        invent["supabase_ok"] = True
        invent["storage_configured"] = bool(props.get("AZURE_STORAGE_CONNECTION_STRING"))
    except Exception as e:
        invent["error_conexion"] = str(e)
        invent["traceback"] = traceback.format_exc()
        _write(invent, "inventario")
        print(json.dumps(invent, indent=2, default=str))
        return 2

    reporte = find_reporte(sb)
    invent["reporte"] = reporte
    if not reporte:
        invent["error"] = "No se encontró so_reportes #54 con ese nombre"
        # Listar reportes cercanos para evidencia
        try:
            near = (
                sb.table("so_reportes")
                .select("id,contrato_id,numero_reporte,descripcion_actividad")
                .gte("numero_reporte", 50)
                .lte("numero_reporte", 60)
                .limit(40)
                .execute()
            )
            invent["reportes_50_60"] = near.data
        except Exception as e:
            invent["reportes_50_60_error"] = str(e)
        _write(invent, "inventario")
        print(json.dumps(invent, indent=2, default=str))
        return 3

    contrato_id = int(reporte["contrato_id"])
    reporte_id = int(reporte["id"])
    desc = str(reporte.get("descripcion_actividad") or "")
    regs = fetch_registros(sb, reporte_id)
    invent["n_registros"] = len(regs)
    invent["registros_nums"] = [r.get("numero_registro") for r in regs]
    invent["galeria_actual"] = inventory_from_registros(regs)

    # Soft-delete: so_registros no tiene deleted_at; hard delete
    invent["registros_eliminados"] = {
        "tabla_papelera": False,
        "nota": "so_registros no conserva soft-delete; solo filas vivas del reporte.",
        "n_vivos": len(regs),
    }

    vivos = []
    for reg in regs:
        for g in _parse_hist(reg.get("graficos_historial")):
            if _es_entrada_esquema(g) and (g.get("url") or g.get("scene") or g.get("esquema_scene")):
                g2 = dict(g)
                g2["_rescateFuente"] = "historial_vivo"
                g2["_registroId"] = reg["id"]
                g2["_numeroRegistro"] = reg.get("numero_registro")
                vivos.append(g2)
    invent["candidatos_historial_vivo"] = len(vivos)

    logs = inventory_logs(sb, contrato_id, reporte_id, [r["id"] for r in regs])
    invent["logs"] = {
        "n_filtrados": logs.get("n_filtrados"),
        "error": logs.get("error"),
        "queries": logs.get("queries"),
        "sample": logs.get("rows", [])[:40],
        "n_candidatos": logs.get("n_candidatos"),
        "timeline_esquema": [
            {
                "at": c.get("_log_at") or c.get("creado_en"),
                "usuario": c.get("_log_usuario"),
                "accion": c.get("_log_accion"),
                "esquema_id": c.get("esquema_id"),
                "numero": c.get("numero"),
                "n_calcs": _contar_calcs(c),
                "registro_id": c.get("_registroId"),
                "fuente": c.get("_rescateFuente"),
            }
            for c in (logs.get("candidatos_esquema") or [])[:80]
        ],
    }
    # Guardar candidatos completos (pueden ser grandes) en archivo aparte
    _write({"candidatos": logs.get("candidatos_esquema") or [], "vivos": vivos}, "candidatos_raw")

    blobs = inventory_blobs(contrato_id, reporte_id, [r["id"] for r in regs], desc)
    invent["blobs"] = {
        "error": blobs.get("error"),
        "n_graficos": len(blobs.get("graficos") or []),
        "n_esquemas_reporte": len(blobs.get("esquemas_del_reporte") or []),
        "n_scenes": len(blobs.get("scene_blobs") or []),
        "esquemas_del_reporte": blobs.get("esquemas_del_reporte") or [],
        "scene_blobs": blobs.get("scene_blobs") or [],
        "graficos_sample": (blobs.get("graficos") or [])[:30],
        "esquemas_sample": blobs.get("esquemas_sample") or [],
    }

    invent["borradores"] = {
        "dispositivo_dexie": "No accesible desde CI (IndexedDB del navegador del usuario).",
        "nube_scene_json": blobs.get("scene_blobs") or [],
        "nota": "Borradores auto-guardados viven en Dexie ClaraCore_esquema_drafts_v1; "
                "Sin asignar en ClaraCore_sicoe_esquemas_sin_asignar_v1.",
    }
    invent["backups_bd"] = {
        "disponible_desde_este_entorno": False,
        "nota": "App Settings no exponen backups Postgres; solo service role + blob. "
                "No se restaura BD completa.",
    }

    # Candidatos desde scene blobs
    scene_cands = []
    for sb_item in (blobs.get("scene_blobs") or [])[:10]:
        scene = download_scene_blob(sb_item["name"])
        if not scene:
            continue
        # Inferir registro desde path
        path = sb_item["name"]
        reg_match = None
        for rid in [r["id"] for r in regs]:
            if f"/{rid}-" in path or f"/{rid}/" in path:
                reg_match = rid
                break
        # Buscar PNG hermano
        png_url = None
        folder = path.rsplit("/", 1)[0]
        for asset in (blobs.get("esquemas_del_reporte") or []):
            if asset["name"].startswith(folder + "/") and asset["name"].endswith(".png") and "memoria" not in asset["name"]:
                # PNG privado — puede no ser la URL pública del gráfico
                png_url = asset["name"]
                break
        # Emparejar número de gráfico desde nombre o graficos públicos
        g2 = {
            "scene": scene,
            "esquema_scene": scene,
            "nombre": scene.get("title") or "Esquema rescatado",
            "origen": "esquema",
            "kind": "esquema",
            "_rescateFuente": "blob_scene",
            "_blob": path,
            "_registroId": reg_match,
        }
        if _contar_calcs(g2) or scene.get("objects"):
            scene_cands.append(g2)

    candidatos = vivos + (logs.get("candidatos_esquema") or []) + scene_cands

    # Env force IDs
    force_ids = []
    raw_force = (os.environ.get("RESCATE_FORCE_REG_IDS") or "").strip()
    if raw_force:
        force_ids = [x.strip() for x in raw_force.split(",") if x.strip()]

    uniq = {}
    for c in candidatos:
        key = f"{c.get('esquema_id')}|{c.get('url')}|{_contar_calcs(c)}|{c.get('creado_en')}|{c.get('_rescateFuente')}|{c.get('_blob', '')}"
        uniq[key] = c
    candidatos = list(uniq.values())
    invent["n_candidatos_unicos"] = len(candidatos)

    mejor = elegir_mejor(candidatos)
    invent["mejor_candidato"] = None
    if mejor:
        inferred = sorted({
            c.get("_registroId") for c in candidatos
            if c.get("_registroId") is not None and (
                (mejor.get("esquema_id") and str(c.get("esquema_id")) == str(mejor.get("esquema_id")))
                or (mejor.get("numero") is not None and c.get("numero") is not None
                    and str(c.get("numero")) == str(mejor.get("numero")))
                or (mejor.get("_rescateFuente") == "blob_scene" and c.get("_blob") == mejor.get("_blob"))
            )
        }, key=lambda x: str(x))
        # Si el mejor no tiene URL pero hay hermano con misma esquema_id/numero que sí
        if not mejor.get("url"):
            for c in candidatos:
                if not c.get("url"):
                    continue
                same = (
                    (mejor.get("esquema_id") and str(c.get("esquema_id")) == str(mejor.get("esquema_id")))
                    or (mejor.get("numero") is not None and c.get("numero") is not None
                        and str(c.get("numero")) == str(mejor.get("numero")))
                )
                if same:
                    mejor = {**mejor, "url": c.get("url"), "numero": mejor.get("numero") or c.get("numero")}
                    break
        invent["mejor_candidato"] = {
            "esquema_id": mejor.get("esquema_id"),
            "numero": mejor.get("numero"),
            "nombre": mejor.get("nombre") or mejor.get("descripcion"),
            "url": mejor.get("url"),
            "n_calcs": _contar_calcs(mejor),
            "fuente": mejor.get("_rescateFuente"),
            "creado_en": mejor.get("creado_en") or mejor.get("_log_at"),
            "tiene_scene": bool(mejor.get("scene") or mejor.get("esquema_scene")),
            "registros_inferidos": inferred,
            "log_id": mejor.get("_log_id"),
            "blob": mejor.get("_blob"),
        }

    dry = (os.environ.get("RESCATE_DRY_RUN") or "").strip().lower() in ("1", "true", "yes")
    invent["dry_run"] = dry
    resultado: Dict[str, Any] = {"restaurado": False}

    ids_final = force_ids or (invent.get("mejor_candidato") or {}).get("registros_inferidos") or []
    # Validar que existen en el reporte
    ids_final = [i for i in ids_final if any(str(r["id"]) == str(i) for r in regs)]

    if mejor and (mejor.get("url") or mejor.get("scene") or mejor.get("esquema_scene")) and not dry:
        if not ids_final:
            # Último recurso: si hay exactamente un registro en el reporte, no asignar a ciegas.
            # Si hay PNG/URL y un solo candidato de log con registro → ya cubierto.
            # Si no hay IDs: restaurar al primer registro NO sellado solo si RESCATE_ASSIGN_ALL=1
            if (os.environ.get("RESCATE_ASSIGN_ALL") or "").strip() in ("1", "true", "yes"):
                ids_final = [r["id"] for r in regs if not r.get("bloqueado")]
            else:
                resultado = {
                    "restaurado": False,
                    "razon": "Candidato recuperable pero sin registros inferidos. "
                             "Pase RESCATE_FORCE_REG_IDS o RESCATE_ASSIGN_ALL=1.",
                    "candidato": invent.get("mejor_candidato"),
                }
        if ids_final and not resultado.get("razon"):
            # Si no hay URL pública pero hay path privado png, no inventar URL — el listado necesita url
            if not mejor.get("url"):
                # Buscar en graficos públicos por numero
                num = mejor.get("numero")
                if num is not None:
                    path = f"{contrato_id}/graficos/grafico_{int(num)}.png"
                    url = public_url_for_grafico(props, path)
                    # Verificar existencia
                    for g in (blobs.get("graficos") or []):
                        if g["name"] == path or g["name"].endswith(f"grafico_{int(num)}.png"):
                            mejor["url"] = url or f"blob://{g['name']}"
                            break
                    # También jpg
                    if not mejor.get("url"):
                        for ext in (".jpg", ".jpeg", ".webp"):
                            path2 = f"{contrato_id}/graficos/grafico_{int(num)}{ext}"
                            for g in (blobs.get("graficos") or []):
                                if g["name"] == path2:
                                    mejor["url"] = public_url_for_grafico(props, path2)
                                    break
            if not mejor.get("url") and not (mejor.get("scene") or mejor.get("esquema_scene")):
                resultado = {
                    "restaurado": False,
                    "razon": "Sin URL de PNG ni escena editable recuperable",
                    "candidato": invent.get("mejor_candidato"),
                }
            else:
                # Si solo hay scene sin URL, aún así restauramos con scene (lista puede mostrar sin thumb)
                if not mejor.get("url"):
                    mejor["url"] = None  # listarEsquemasDelReporte filtra !url — necesitamos URL
                    # Crear URL desde PNG privado no sirve públicamente.
                    # Buscar cualquier png del reporte en graficos del historial logs
                    for c in candidatos:
                        if c.get("url"):
                            mejor["url"] = c["url"]
                            if mejor.get("numero") is None:
                                mejor["numero"] = c.get("numero")
                            break
                if not mejor.get("url"):
                    resultado = {
                        "restaurado": False,
                        "razon": "Escena recuperada pero sin URL de imagen; "
                                 "listarEsquemasDelReporte exige url. "
                                 "Assets privados quedan listados en inventario.",
                        "candidato": invent.get("mejor_candidato"),
                        "assets_privados": blobs.get("esquemas_del_reporte"),
                    }
                else:
                    resultado = restaurar(sb, reporte, regs, mejor, ids_final)
                    resultado["restaurado"] = True
                    resultado["fuente"] = mejor.get("_rescateFuente")
                    resultado["n_calcs"] = _contar_calcs(mejor)
                    resultado["esquema_id"] = mejor.get("esquema_id")
                    resultado["numero"] = mejor.get("numero")
                    resultado["ids_asignados"] = ids_final
                    regs2 = fetch_registros(sb, reporte_id)
                    resultado["verificacion_lista"] = inventory_from_registros(regs2)
                    resultado["cantidades_intactas"] = all(
                        p.get("cantidad_intacta") for p in resultado.get("patched") or []
                    )
                    resultado["sellado_intacto"] = all(
                        p.get("sellado_intacto") for p in resultado.get("patched") or []
                    )
    elif dry:
        resultado = {
            "restaurado": False,
            "razon": "RESCATE_DRY_RUN=1 — solo inventario",
            "ids_que_se_asignarian": ids_final,
            "candidato": invent.get("mejor_candidato"),
        }
    elif not mejor:
        resultado = {"restaurado": False, "razon": "Sin candidatos recuperables en logs/historial/blobs"}

    invent["resultado"] = resultado
    _write(invent, "inventario")
    _write({
        "reporte": invent.get("reporte"),
        "mejor": invent.get("mejor_candidato"),
        "resultado": resultado,
        "logs_n": invent.get("logs", {}).get("n_filtrados"),
        "blobs_graficos": invent.get("blobs", {}).get("n_graficos"),
        "blobs_esquemas": invent.get("blobs", {}).get("n_esquemas_reporte"),
        "timeline": invent.get("logs", {}).get("timeline_esquema"),
    }, "resumen")
    print(json.dumps({
        "ok": bool(resultado.get("restaurado")),
        "dry_run": dry,
        "reporte": invent.get("reporte"),
        "mejor": invent.get("mejor_candidato"),
        "resultado": {
            k: resultado.get(k) for k in (
                "restaurado", "razon", "fuente", "n_calcs", "esquema_id", "numero",
                "ids_asignados", "cantidades_intactas", "sellado_intacto", "n",
            ) if k in resultado
        },
        "out_dir": OUT_DIR,
    }, indent=2, default=str))
    # Exit 0 si restauró o dry-run con inventario OK; 4 si no pudo restaurar (inventario igual se escribió)
    if resultado.get("restaurado") or dry:
        return 0
    # Inventario útil aunque no restaure — CI no debe fallar el artefacto
    return 0


def _write(data: dict, name: str) -> None:
    path = os.path.join(OUT_DIR, f"rescate_esquema_54_{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str, ensure_ascii=False)
    print(f"WROTE {path}", file=sys.stderr)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise
