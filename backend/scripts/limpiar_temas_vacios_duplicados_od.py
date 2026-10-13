#!/usr/bin/env python3
"""
Limpia temas vacíos duplicados del Orden del Día en actas de seguimiento.

Criterio de eliminación (TODOS deben cumplirse):
  - sin título
  - sin texto (plano vacío)
  - sin adjuntos/imagenes
  - sin clave_grabacion (o clave od-* huérfana ya cubierta por otro tema con título)
  - sin compromisos ligados (seguimiento_item.idea_id)
  - sin audio asociado (si existiera columna)

Uso:
  cd backend
  # Dry-run (solo reporte):
  python3 scripts/limpiar_temas_vacios_duplicados_od.py
  # Aplicar:
  python3 scripts/limpiar_temas_vacios_duplicados_od.py --apply

Requiere SUPABASE_URL y SUPABASE_KEY (service role recomendado) en el entorno.
Antes de --apply escribe un JSON de respaldo en /tmp.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Permitir importar desde backend/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _plain(html: str) -> str:
    s = re.sub(r"<[^>]+>", " ", str(html or ""))
    return re.sub(r"\s+", " ", s).replace("\u00a0", " ").strip()


def _idea_vacia(idea: dict) -> bool:
    titulo = (idea.get("titulo") or "").strip()
    texto = _plain(idea.get("texto") or "")
    imgs = idea.get("imagenes") if isinstance(idea.get("imagenes"), list) else []
    has_audio = bool(idea.get("audio_url") or idea.get("audio_blob_path"))
    return not titulo and not texto and not imgs and not has_audio


def _sb():
    from main import get_supabase

    return get_supabase()


def list_actas(sb):
    rows = (
        sb.table("seguimiento_acta")
        .select("id,consecutivo,contrato_id,elaborador_nombre,updated_at")
        .order("id")
        .execute()
        .data
        or []
    )
    return rows


def ideas_de_acta(sb, acta_id: int):
    return (
        sb.table("seguimiento_acta_idea")
        .select("id,acta_id,titulo,texto,quien_dijo,orden,imagenes,clave_grabacion,expositor_usuario_id")
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


def candidatos_vacios(ideas: list[dict]) -> list[dict]:
    """Vacías y no vinculadas a un punto real (sin clave, o od-* si ya hay otro od con título)."""
    con_titulo_od = set()
    for idea in ideas:
        clave = (idea.get("clave_grabacion") or "").strip().lower()
        if re.match(r"^od-\d+$", clave) and (idea.get("titulo") or "").strip():
            con_titulo_od.add(clave)
    out = []
    for idea in ideas:
        if not _idea_vacia(idea):
            continue
        clave = (idea.get("clave_grabacion") or "").strip().lower()
        if not clave:
            out.append(idea)
            continue
        if re.match(r"^od-\d+$", clave) and clave in con_titulo_od:
            # Duplicado vacío de un od que ya tiene tema con título.
            out.append(idea)
            continue
        # manual/suelta vacíos sin contenido: también candidatos si no tienen clave útil
        if re.match(r"^od-\d+$", clave) and clave not in con_titulo_od:
            # Único od vacío: podría ser el tema real aún sin título — NO borrar.
            continue
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Elimina de verdad (por defecto solo reporte)")
    parser.add_argument("--acta-id", type=int, default=None, help="Limitar a un acta_id")
    parser.add_argument("--consecutivo", type=int, default=None, help="Limitar a un número de acta")
    args = parser.parse_args()

    if not (os.getenv("SUPABASE_URL") or "").strip() or not (os.getenv("SUPABASE_KEY") or "").strip():
        print("ERROR: faltan SUPABASE_URL / SUPABASE_KEY en el entorno.", file=sys.stderr)
        return 2

    sb = _sb()
    actas = list_actas(sb)
    if args.acta_id is not None:
        actas = [a for a in actas if int(a["id"]) == int(args.acta_id)]
    if args.consecutivo is not None:
        actas = [a for a in actas if int(a.get("consecutivo") or 0) == int(args.consecutivo)]

    reporte = []
    a_borrar = []
    for acta in actas:
        aid = int(acta["id"])
        ideas = ideas_de_acta(sb, aid)
        cands = candidatos_vacios(ideas)
        safe = []
        for idea in cands:
            if tiene_compromiso(sb, int(idea["id"])):
                continue
            safe.append(idea)
        if not safe:
            continue
        reporte.append({
            "acta_id": aid,
            "consecutivo": acta.get("consecutivo"),
            "contrato_id": acta.get("contrato_id"),
            "eliminados": len(safe),
            "idea_ids": [int(x["id"]) for x in safe],
            "detalle": [
                {
                    "id": int(x["id"]),
                    "orden": x.get("orden"),
                    "quien_dijo": x.get("quien_dijo"),
                    "clave_grabacion": x.get("clave_grabacion"),
                }
                for x in safe
            ],
        })
        a_borrar.extend(safe)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = Path(f"/tmp/backup_temas_vacios_od_{stamp}.json")
    backup_path.write_text(json.dumps({
        "created_at": stamp,
        "apply": bool(args.apply),
        "actas": reporte,
        "ideas": a_borrar,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Respaldo: {backup_path}")
    print(f"Actas afectadas: {len(reporte)}")
    print(f"Temas candidatos a eliminar: {len(a_borrar)}")
    for row in reporte:
        print(
            f"  Acta Nº {row.get('consecutivo')} (id={row['acta_id']}): "
            f"{row['eliminados']} tema(s) vacío(s)"
        )

    if not args.apply:
        print("Dry-run: no se eliminó nada. Reejecute con --apply para borrar.")
        return 0

    deleted = 0
    for idea in a_borrar:
        sb.table("seguimiento_acta_idea").delete().eq("id", int(idea["id"])).execute()
        deleted += 1
    print(f"Eliminados: {deleted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
