# Bubble/migrar_pk_id_csv_contrato.py
"""
Carga Bubble/PK_ID.csv en public.pk_ids para UN solo contrato (sin tocar otros).

Antes necesitas ejecutar en Supabase (una sola vez el proyecto):

  backend/sql/sicoe_consecutivos_desde_uno_por_contrato.sql

Eso agrega contratos.sicoe_consecutivos_desde_uno y cambia las funciones RPC para que,
en contratos marcados, el primer reporte/registro sea #1 (no #35000 / #55000).

Antes (script):
  • Opcionalmente vacía obra SICOE de ese contrato (reportes, registros, puntos, comentarios)
    y deja reservado_hasta = 0 en sico_ultimo_*.
  • Marca sicoe_consecutivos_desde_uno = true para CONTRATO_ID.
  • Borra todos los pk_ids del mismo contrato y reinserta desde el CSV (evita mezclar PK de otro lado).

Requisitos: backend/.env con SUPABASE_URL y SUPABASE_KEY (service_role).

Ejecución (PowerShell), desde la raíz del repo:
  python Bubble/migrar_pk_id_csv_contrato.py
"""

from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# ── Configuración fija (este flujo es para el contrato nuevo) ─────────────────
CONTRATO_ID = 3
CSV_PATH = Path(__file__).resolve().parent / "PK_ID.csv"

# Vacía reportes/registros SICOE solo de CONTRATO_ID y reinicia consecutivos en tablas sico_ultimo_*.
LIMPIAR_OBRA_SICOE_DEL_CONTRATO = True

# Pone contratos.sicoe_consecutivos_desde_uno = true para ESTE contrato (requiere SQL
# backend/sql/sicoe_consecutivos_desde_uno_por_contrato.sql ejecutado en Supabase antes).
# Así el primer reporte/registro será #1 y no #35000 / #55000.
MARCAR_CONSECUTIVOS_DESDE_UNO = True

# Tras limpiar obra, borra pk_ids del contrato y vuelve a cargarlos desde el CSV.
REEMPLAZAR_PK_IDS_DESDE_CSV = True

INSERT_CHUNK = 300


def _float(v) -> float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def _str(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _norm_key(name: str) -> str:
    return (name or "").strip().upper().replace(" ", "_")


def leer_filas_csv(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8-sig", errors="replace")
    lines = raw.splitlines()
    if not lines:
        return []
    delimiter = ";" if lines[0].count(";") > lines[0].count(",") else ","
    reader = csv.DictReader(lines, delimiter=delimiter)
    if not reader.fieldnames:
        return []
    canon = {_norm_key(n): n for n in reader.fieldnames if n}
    rows = []
    for row in reader:
        if not any((v or "").strip() for v in row.values()):
            continue
        out = {}
        for k, v in row.items():
            nk = _norm_key(k)
            if nk:
                out[nk] = v
        rows.append(out)
    return rows


def csv_row_to_payload(contrato_id: int, row: dict) -> dict | None:
    """Espera columnas tipo PK_ID.csv: CAPA, CIV, TRAMO, INFRAESTRUCTURA, COSTADO, UBICACION, ABS_INICIO, ABS_FINAL, CALZADA."""
    capa = _str(row.get("CAPA"))
    if not capa:
        return None
    payload: dict = {
        "contrato_id": contrato_id,
        "pk_id": capa,
    }
    civ = _str(row.get("CIV"))
    tramo = _str(row.get("TRAMO"))
    infra = _str(row.get("INFRAESTRUCTURA"))
    calzada = _str(row.get("CALZADA"))
    abs_i = _float(row.get("ABS_INICIO"))
    abs_f = _float(row.get("ABS_FINAL"))
    if civ:
        payload["civ"] = civ
    if tramo:
        payload["tramo"] = tramo
    if infra:
        payload["infraestructura"] = infra
    if calzada:
        payload["calzada"] = calzada
    if abs_i is not None:
        payload["abs_inicio"] = abs_i
    if abs_f is not None:
        payload["abs_final"] = abs_f
    return payload


def limpiar_obra_sicoe(sb, contrato_id: int) -> None:
    """Elimina obra SICOE del contrato y pone reservado_hasta en 0 (numeración natural si el contrato tiene sicoe_consecutivos_desde_uno)."""
    print(f"[limpiar] Contrato {contrato_id}: borrando comentarios -> registros -> puntos -> reportes...")

    while True:
        batch = (
            sb.table("so_registros")
            .select("id")
            .eq("contrato_id", contrato_id)
            .limit(800)
            .execute()
            .data
        )
        if not batch:
            break
        ids = [r["id"] for r in batch if r.get("id") is not None]
        if not ids:
            break
        sb.table("so_registro_comentarios").delete().in_("registro_id", ids).execute()
        sb.table("so_registros").delete().in_("id", ids).execute()

    sb.table("so_puntos_topograficos").delete().eq("contrato_id", contrato_id).execute()
    sb.table("so_reportes").delete().eq("contrato_id", contrato_id).execute()

    sb.table("sico_ultimo_numero_registro").upsert(
        {"contrato_id": contrato_id, "reservado_hasta": 0},
        on_conflict="contrato_id",
    ).execute()
    sb.table("sico_ultimo_numero_reporte").upsert(
        {"contrato_id": contrato_id, "reservado_hasta": 0},
        on_conflict="contrato_id",
    ).execute()
    print("[limpiar] Hecho. reservado_hasta=0. Si el contrato tiene sicoe_consecutivos_desde_uno=true, el proximo # es 1.")


def marcar_consecutivos_desde_uno(sb, contrato_id: int) -> None:
    """Activa numeración natural en el contrato (columna creada por SQL en Supabase)."""
    try:
        sb.table("contratos").update({"sicoe_consecutivos_desde_uno": True}).eq("id", contrato_id).execute()
        print(f"[contratos] sicoe_consecutivos_desde_uno=true para contrato_id={contrato_id}")
    except Exception as e:
        print(
            f"[contratos] No se pudo marcar sicoe_consecutivos_desde_uno: {e}\n"
            "  Ejecuta en Supabase el archivo backend/sql/sicoe_consecutivos_desde_uno_por_contrato.sql y reintenta.",
            file=sys.stderr,
        )


def borrar_pk_ids_contrato(sb, contrato_id: int) -> None:
    print(f"[pk_ids] Borrando filas existentes con contrato_id={contrato_id}...")
    sb.table("pk_ids").delete().eq("contrato_id", contrato_id).execute()


def insertar_pk_ids(sb, contrato_id: int, payloads: list[dict]) -> None:
    for i in range(0, len(payloads), INSERT_CHUNK):
        chunk = payloads[i : i + INSERT_CHUNK]
        sb.table("pk_ids").insert(chunk).execute()
        print(f"[pk_ids] Insertados {min(i + INSERT_CHUNK, len(payloads))}/{len(payloads)}")


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

    if LIMPIAR_OBRA_SICOE_DEL_CONTRATO:
        limpiar_obra_sicoe(sb, CONTRATO_ID)

    if MARCAR_CONSECUTIVOS_DESDE_UNO:
        marcar_consecutivos_desde_uno(sb, CONTRATO_ID)

    if REEMPLAZAR_PK_IDS_DESDE_CSV:
        borrar_pk_ids_contrato(sb, CONTRATO_ID)
        insertar_pk_ids(sb, CONTRATO_ID, payloads)

    print("Migracion PK_ID finalizada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
