"""Actualiza pk_ids contrato 3 desde PK_ID_v0.csv y sincroniza tramo en presupuesto."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from migrar_pk_id_csv_contrato import (
    CONTRATO_ID,
    INSERT_CHUNK,
    borrar_pk_ids_contrato,
    csv_row_to_payload,
    insertar_pk_ids,
    leer_filas_csv,
)

CONTRATO_ID = 3
CSV_PATH = Path(r"d:\Contratos ClaraCore\Silvania-Tibacuy\3. Planos Tibacuy\Geojson\PK_ID_v0.csv")


def _fetch_all(sb, table: str, select: str, contrato_id: int) -> list[dict]:
    page_size = 1000
    offset = 0
    out: list[dict] = []
    while True:
        batch = (
            sb.table(table)
            .select(select)
            .eq("contrato_id", contrato_id)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return out


def sync_presupuesto_tramo(sb, contrato_id: int) -> int:
    """Actualiza tramo en presupuesto según pk_ids vigente del contrato."""
    rows = _fetch_all(sb, "presupuesto", "id, pk_id, tramo", contrato_id)
    pk_rows = _fetch_all(sb, "pk_ids", "pk_id, tramo", contrato_id)
    tramo_por_pk = {
        str(r["pk_id"]).strip(): (r.get("tramo") or "").strip()
        for r in pk_rows
        if r.get("pk_id") is not None
    }

    updates: list[dict] = []
    sin_pk: list[str] = []
    for row in rows:
        pk = str(row.get("pk_id") or "").strip()
        if not pk:
            continue
        nuevo = tramo_por_pk.get(pk)
        if nuevo is None:
            sin_pk.append(pk)
            continue
        actual = (row.get("tramo") or "").strip()
        if actual != nuevo:
            updates.append({"id": row["id"], "tramo": nuevo})

    print(f"[presupuesto] Filas contrato {contrato_id}: {len(rows)}")
    print(f"[presupuesto] A actualizar tramo: {len(updates)}")
    if sin_pk:
        unicos = sorted(set(sin_pk))
        print(f"[presupuesto] PK sin match en pk_ids: {len(unicos)} -> {unicos[:10]}{'...' if len(unicos) > 10 else ''}")

    for i in range(0, len(updates), 200):
        chunk = updates[i : i + 200]
        for item in chunk:
            sb.table("presupuesto").update({"tramo": item["tramo"]}).eq("id", item["id"]).execute()
        print(f"[presupuesto] Actualizados {min(i + 200, len(updates))}/{len(updates)}")

    return len(updates)


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / "backend" / ".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Falta SUPABASE_URL o SUPABASE_KEY en backend/.env", file=sys.stderr)
        return 1
    if not CSV_PATH.is_file():
        print(f"No existe el archivo: {CSV_PATH}", file=sys.stderr)
        return 1

    rows = leer_filas_csv(CSV_PATH)
    if not rows:
        print("CSV vacio o sin filas de datos.", file=sys.stderr)
        return 1

    by_pk: dict[str, dict] = {}
    dupes = 0
    for r in rows:
        p = csv_row_to_payload(CONTRATO_ID, r)
        if not p:
            continue
        pk = str(p["pk_id"]).strip()
        if pk in by_pk:
            dupes += 1
        by_pk[pk] = p

    payloads = list(by_pk.values())
    payloads.sort(key=lambda x: str(x["pk_id"]))

    print(f"Contrato destino: {CONTRATO_ID}")
    print(f"Archivo: {CSV_PATH}")
    print(f"Filas CSV utiles: {len(rows)} | PK unicos: {len(payloads)} | duplicados CAPA descartados: {dupes}")

    sb = create_client(url, key)

    print("[pk_ids] Reemplazando catálogo del contrato 3...")
    borrar_pk_ids_contrato(sb, CONTRATO_ID)
    insertar_pk_ids(sb, CONTRATO_ID, payloads)

    n = sync_presupuesto_tramo(sb, CONTRATO_ID)
    print(f"Listo. presupuesto tramo actualizados: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
