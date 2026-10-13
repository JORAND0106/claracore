#!/usr/bin/env python3
"""
Reúne textos de temas separados (filas huérfanas) con su tema del Orden del Día.

Criterios de unión (solo vínculos confiables):
  1) Misma clave_grabacion (duplicados od-* / manual-*).
  2) Fila con texto y clave legacy tN / sin clave, cuyo título coincide
     exactamente con un único tema od-* o manual-*.

No fusiona suelta-* (ideas generales sin tema abierto).
No inventa uniones por número repetido ni por proximidad de orden.

Uso:
  cd backend
  python3 scripts/reunir_textos_temas_actas.py --consecutivo 18
  python3 scripts/reunir_textos_temas_actas.py --consecutivo 18 --apply

Antes de --apply escribe JSON de respaldo en /tmp.
Requiere SUPABASE_URL y SUPABASE_KEY en el entorno.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _plain(html: str) -> str:
    s = re.sub(r"<[^>]+>", " ", str(html or ""))
    return re.sub(r"\s+", " ", s).replace("\u00a0", " ").strip()


def _append_html(base: str, add: str) -> str:
    a = _plain(base)
    b = _plain(add)
    if not b:
        return base or ""
    if not a:
        return add or f"<p>{b}</p>"
    if b in a:
        return base
    if a in b:
        return add
    left = (base or "").strip() or f"<p>{a}</p>"
    right = (add or "").strip() or f"<p>{b}</p>"
    return f"{left}{right}"


def _is_od(clave: str) -> bool:
    return bool(re.match(r"^od-\d+$", (clave or "").strip(), re.I))


def _is_manual(clave: str) -> bool:
    return bool(re.match(r"^manual-", (clave or "").strip(), re.I))


def _is_suelta(clave: str) -> bool:
    return bool(re.match(r"^suelta-", (clave or "").strip(), re.I))


def _is_legacy(clave: str) -> bool:
    return bool(re.match(r"^t\d+$", (clave or "").strip(), re.I))


def _sb():
    from main import get_supabase

    return get_supabase()


def list_actas(sb, consecutivo=None, acta_id=None):
    q = sb.table("seguimiento_acta").select(
        "id,consecutivo,contrato_id,elaborador_nombre,updated_at,orden_del_dia"
    )
    rows = q.order("id").execute().data or []
    if acta_id is not None:
        rows = [a for a in rows if int(a["id"]) == int(acta_id)]
    if consecutivo is not None:
        rows = [a for a in rows if int(a.get("consecutivo") or 0) == int(consecutivo)]
    return rows


def ideas_de_acta(sb, acta_id: int):
    return (
        sb.table("seguimiento_acta_idea")
        .select(
            "id,acta_id,titulo,texto,quien_dijo,orden,imagenes,"
            "clave_grabacion,expositor_usuario_id,texto_es_borrador"
        )
        .eq("acta_id", int(acta_id))
        .order("orden")
        .execute()
        .data
        or []
    )


def tiene_compromiso(sb, idea_id: int) -> bool:
    rows = (
        sb.table("seguimiento_item")
        .select("id")
        .eq("idea_id", int(idea_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def sesiones_contrato(sb, contrato_id: int):
    try:
        return (
            sb.table("acta_grabacion_sesion")
            .select("id,estado,temas_propuestos,transcripcion,updated_at,created_at")
            .eq("contrato_id", int(contrato_id))
            .order("id", desc=True)
            .limit(20)
            .execute()
            .data
            or []
        )
    except Exception:
        return []


def tramos_pendientes(sb, sesion_id: int):
    try:
        return (
            sb.table("acta_grabacion_tramo")
            .select("id,orden,estado,chars_tramo,error_detalle,intentos")
            .eq("sesion_id", int(sesion_id))
            .in_("estado", ["pendiente", "error", "procesando"])
            .order("orden")
            .execute()
            .data
            or []
        )
    except Exception:
        return []


def plan_reunion(ideas: list[dict]) -> dict:
    """Calcula uniones y borrados sin mutar IDs aún."""
    rows = [dict(x) for x in ideas]
    unidos = []
    sin_vinculo = []
    a_borrar = []
    updates = {}  # id -> patch

    def mark_update(idea_id, patch):
        cur = updates.get(idea_id, {})
        cur.update(patch)
        updates[idea_id] = cur

    # 1) Duplicados misma clave od/manual
    by_clave: dict[str, list[dict]] = {}
    for row in rows:
        clave = (row.get("clave_grabacion") or "").strip().lower()
        if not clave or _is_suelta(clave):
            continue
        by_clave.setdefault(clave, []).append(row)

    consumed = set()
    for clave, group in by_clave.items():
        if len(group) < 2:
            continue
        group_sorted = sorted(
            group,
            key=lambda r: (
                -(len(_plain(r.get("texto") or "")) + (1000 if (r.get("titulo") or "").strip() else 0)),
                int(r.get("id") or 10**12),
            ),
        )
        keep = group_sorted[0]
        texto = keep.get("texto") or ""
        titulo = keep.get("titulo") or ""
        quien = keep.get("quien_dijo") or ""
        imgs = list(keep.get("imagenes") or []) if isinstance(keep.get("imagenes"), list) else []
        for other in group_sorted[1:]:
            oid = int(other["id"])
            if tiene_compromiso_cache.get(oid):
                sin_vinculo.append({
                    "origen_id": oid,
                    "razon": "tiene_compromiso",
                    "clave": other.get("clave_grabacion"),
                })
                continue
            texto = _append_html(texto, other.get("texto") or "")
            if not (titulo or "").strip() and (other.get("titulo") or "").strip():
                titulo = other.get("titulo")
            if not (quien or "").strip() and (other.get("quien_dijo") or "").strip():
                quien = other.get("quien_dijo")
            oimgs = other.get("imagenes") if isinstance(other.get("imagenes"), list) else []
            if oimgs:
                imgs = imgs + oimgs
            unidos.append({
                "motivo": "misma_clave",
                "clave": clave,
                "destino_id": int(keep["id"]),
                "origen_id": oid,
                "chars": len(_plain(other.get("texto") or "")),
            })
            a_borrar.append(other)
            consumed.add(oid)
        mark_update(int(keep["id"]), {
            "texto": texto,
            "titulo": titulo or None,
            "quien_dijo": quien or None,
            "imagenes": imgs,
        })
        keep["texto"] = texto
        keep["titulo"] = titulo
        keep["quien_dijo"] = quien
        keep["imagenes"] = imgs

    # 2) Huérfanos tN / sin clave por título idéntico
    anclas = [
        r for r in rows
        if int(r["id"]) not in consumed
        and (
            _is_od((r.get("clave_grabacion") or "").strip())
            or _is_manual((r.get("clave_grabacion") or "").strip())
        )
    ]
    for row in rows:
        oid = int(row["id"])
        if oid in consumed:
            continue
        clave = (row.get("clave_grabacion") or "").strip()
        if _is_suelta(clave):
            continue
        if _is_od(clave) or _is_manual(clave):
            continue
        texto_p = _plain(row.get("texto") or "")
        if not texto_p:
            continue
        if clave and not _is_legacy(clave):
            sin_vinculo.append({
                "origen_id": oid,
                "razon": "clave_no_reconocida",
                "clave": clave,
                "chars": len(texto_p),
            })
            continue
        titulo_lc = (row.get("titulo") or "").strip().lower()
        if not titulo_lc:
            sin_vinculo.append({
                "origen_id": oid,
                "razon": "sin_titulo_ni_clave_od",
                "clave": clave or None,
                "chars": len(texto_p),
            })
            continue
        cands = [
            a for a in anclas
            if int(a["id"]) not in consumed
            and (a.get("titulo") or "").strip().lower() == titulo_lc
        ]
        if len(cands) != 1:
            sin_vinculo.append({
                "origen_id": oid,
                "razon": "sin_titulo_coincidente" if not cands else "titulo_ambiguo",
                "clave": clave or None,
                "titulo": row.get("titulo"),
                "chars": len(texto_p),
            })
            continue
        if tiene_compromiso_cache.get(oid):
            sin_vinculo.append({
                "origen_id": oid,
                "razon": "tiene_compromiso",
                "clave": clave or None,
            })
            continue
        dest = cands[0]
        did = int(dest["id"])
        nuevo_texto = _append_html(dest.get("texto") or "", row.get("texto") or "")
        patch = {"texto": nuevo_texto}
        if not (dest.get("quien_dijo") or "").strip() and (row.get("quien_dijo") or "").strip():
            patch["quien_dijo"] = row.get("quien_dijo")
        oimgs = row.get("imagenes") if isinstance(row.get("imagenes"), list) else []
        if oimgs:
            dimgs = list(dest.get("imagenes") or []) if isinstance(dest.get("imagenes"), list) else []
            patch["imagenes"] = dimgs + oimgs
        mark_update(did, patch)
        dest["texto"] = nuevo_texto
        unidos.append({
            "motivo": "titulo_identico",
            "clave_destino": dest.get("clave_grabacion"),
            "destino_id": did,
            "origen_id": oid,
            "titulo": dest.get("titulo") or row.get("titulo"),
            "chars": len(texto_p),
        })
        a_borrar.append(row)
        consumed.add(oid)

    # Renumerar orden de las que quedan
    surviving = [r for r in rows if int(r["id"]) not in consumed]
    surviving.sort(
        key=lambda r: (
            int(r.get("orden") if r.get("orden") is not None else 10**9),
            int(r.get("id") or 0),
        )
    )
    orden_patches = {}
    for i, r in enumerate(surviving):
        if int(r.get("orden") if r.get("orden") is not None else -1) != i:
            orden_patches[int(r["id"])] = i
            mark_update(int(r["id"]), {"orden": i})

    # Rotular sueltas sin título
    for r in surviving:
        clave = (r.get("clave_grabacion") or "").strip()
        if _is_suelta(clave) and not (r.get("titulo") or "").strip():
            mark_update(int(r["id"]), {"titulo": "Idea general"})

    return {
        "unidos": unidos,
        "sin_vinculo": sin_vinculo,
        "a_borrar": a_borrar,
        "updates": updates,
        "orden_patches": orden_patches,
        "surviving_count": len(surviving),
    }


# Cache de compromisos llenado en main
tiene_compromiso_cache: dict[int, bool] = {}


def analizar_tema_1(ideas: list[dict], sesiones: list[dict]) -> dict:
    """Explica por qué el tema od-1 puede no tener texto."""
    od1 = next(
        (r for r in ideas if (r.get("clave_grabacion") or "").strip().lower() == "od-1"),
        None,
    )
    if not od1:
        # Por título / orden 0
        ordered = sorted(
            ideas,
            key=lambda r: (
                int(r.get("orden") if r.get("orden") is not None else 10**9),
                int(r.get("id") or 0),
            ),
        )
        od1 = ordered[0] if ordered else None
    info = {
        "idea_id": int(od1["id"]) if od1 else None,
        "titulo": (od1 or {}).get("titulo"),
        "clave": (od1 or {}).get("clave_grabacion"),
        "chars_texto": len(_plain((od1 or {}).get("texto") or "")),
        "en_sesiones": [],
        "tramos_pendientes": [],
        "conclusion": "",
    }
    if not od1:
        info["conclusion"] = "No se encontró fila de tema 1 en el acta."
        return info
    if info["chars_texto"] > 0:
        info["conclusion"] = "El tema 1 ya tiene texto redactado en la base."
        return info

    for ses in sesiones or []:
        temas = ses.get("temas_propuestos") or []
        if isinstance(temas, str):
            try:
                temas = json.loads(temas)
            except Exception:
                temas = []
        for t in temas if isinstance(temas, list) else []:
            if str(t.get("clave") or "").strip().lower() != "od-1":
                continue
            info["en_sesiones"].append({
                "sesion_id": ses.get("id"),
                "chars": len(_plain(t.get("texto") or "")),
                "titulo": t.get("titulo"),
            })
    if info["en_sesiones"] and any(x["chars"] > 0 for x in info["en_sesiones"]):
        info["conclusion"] = (
            "Hay texto de od-1 en temas_propuestos de una sesión de grabación "
            "que no quedó guardado en seguimiento_acta_idea (posible tramo no "
            "aplicado al guardar el acta). El script puede copiarlo con --apply "
            "si se usa --recuperar-sesion."
        )
    else:
        info["conclusion"] = (
            "No hay texto de od-1 en el acta ni en las sesiones recientes: "
            "probablemente el tema 1 no tuvo tema abierto / tramo sintetizado, "
            "o el tramo quedó pendiente/error."
        )
    return info


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--acta-id", type=int, default=None)
    parser.add_argument("--consecutivo", type=int, default=None)
    parser.add_argument(
        "--recuperar-sesion",
        action="store_true",
        help="Si od-1 está vacío pero hay texto en temas_propuestos de sesión, copiarlo",
    )
    args = parser.parse_args()

    if not (os.getenv("SUPABASE_URL") or "").strip() or not (os.getenv("SUPABASE_KEY") or "").strip():
        print("ERROR: faltan SUPABASE_URL / SUPABASE_KEY en el entorno.", file=sys.stderr)
        return 2

    sb = _sb()
    actas = list_actas(sb, consecutivo=args.consecutivo, acta_id=args.acta_id)
    if not actas:
        print("No se encontraron actas con esos filtros.")
        return 1

    reporte_actas = []
    backup_ideas = []

    for acta in actas:
        aid = int(acta["id"])
        ideas = ideas_de_acta(sb, aid)
        backup_ideas.extend(ideas)
        global tiene_compromiso_cache
        tiene_compromiso_cache = {
            int(x["id"]): tiene_compromiso(sb, int(x["id"])) for x in ideas
        }
        plan = plan_reunion(ideas)
        sesiones = sesiones_contrato(sb, int(acta.get("contrato_id") or 0))
        tema1 = analizar_tema_1(ideas, sesiones)
        pend = []
        for ses in sesiones[:5]:
            for tr in tramos_pendientes(sb, int(ses["id"])):
                pend.append({**tr, "sesion_id": ses["id"]})
        tema1["tramos_pendientes"] = pend

        recuperar = None
        if args.recuperar_sesion and tema1.get("chars_texto") == 0 and tema1.get("en_sesiones"):
            best = max(tema1["en_sesiones"], key=lambda x: x.get("chars") or 0)
            if best.get("chars", 0) > 0 and tema1.get("idea_id"):
                # Buscar texto completo en sesión
                for ses in sesiones:
                    if int(ses.get("id") or 0) != int(best["sesion_id"]):
                        continue
                    temas = ses.get("temas_propuestos") or []
                    if isinstance(temas, str):
                        try:
                            temas = json.loads(temas)
                        except Exception:
                            temas = []
                    for t in temas if isinstance(temas, list) else []:
                        if str(t.get("clave") or "").strip().lower() == "od-1":
                            txt = t.get("texto") or ""
                            if _plain(txt):
                                html = txt if "<" in str(txt) else f"<p>{txt}</p>"
                                plan["updates"][int(tema1["idea_id"])] = {
                                    **plan["updates"].get(int(tema1["idea_id"]), {}),
                                    "texto": html,
                                }
                                recuperar = {
                                    "idea_id": int(tema1["idea_id"]),
                                    "sesion_id": best["sesion_id"],
                                    "chars": best["chars"],
                                }
                                plan["unidos"].append({
                                    "motivo": "recuperar_sesion_od1",
                                    "destino_id": int(tema1["idea_id"]),
                                    "sesion_id": best["sesion_id"],
                                    "chars": best["chars"],
                                })
                            break

        reporte_actas.append({
            "acta_id": aid,
            "consecutivo": acta.get("consecutivo"),
            "contrato_id": acta.get("contrato_id"),
            "ideas_antes": len(ideas),
            "ideas_despues": plan["surviving_count"],
            "unidos": plan["unidos"],
            "sin_vinculo": plan["sin_vinculo"],
            "a_borrar_ids": [int(x["id"]) for x in plan["a_borrar"]],
            "updates": plan["updates"],
            "tema_1": tema1,
            "recuperar_sesion": recuperar,
        })

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = Path(f"/tmp/backup_reunir_textos_temas_{stamp}.json")
    backup_path.write_text(
        json.dumps(
            {
                "created_at": stamp,
                "apply": bool(args.apply),
                "actas": reporte_actas,
                "ideas_backup": backup_ideas,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Respaldo: {backup_path}")
    total_unidos = sum(len(a["unidos"]) for a in reporte_actas)
    total_sin = sum(len(a["sin_vinculo"]) for a in reporte_actas)
    print(f"Actas: {len(reporte_actas)} | Uniones: {total_unidos} | Sin vínculo: {total_sin}")
    for row in reporte_actas:
        print(
            f"  Acta Nº {row.get('consecutivo')} (id={row['acta_id']}): "
            f"{row['ideas_antes']} → {row['ideas_despues']} filas, "
            f"{len(row['unidos'])} unidos, {len(row['sin_vinculo'])} sin vínculo"
        )
        t1 = row.get("tema_1") or {}
        print(f"    Tema 1: {t1.get('conclusion')}")
        if t1.get("tramos_pendientes"):
            print(f"    Tramos pendientes: {len(t1['tramos_pendientes'])}")

    if not args.apply:
        print("Dry-run: no se modificó nada. Reejecute con --apply para aplicar.")
        return 0

    applied = 0
    deleted = 0
    for row in reporte_actas:
        for idea_id, patch in (row.get("updates") or {}).items():
            sb.table("seguimiento_acta_idea").update(patch).eq("id", int(idea_id)).execute()
            applied += 1
        for oid in row.get("a_borrar_ids") or []:
            sb.table("seguimiento_acta_idea").delete().eq("id", int(oid)).execute()
            deleted += 1
    print(f"Actualizados: {applied} | Eliminados (huérfanos ya fusionados): {deleted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
