#!/usr/bin/env python3
"""
Reconciliación one-shot / CLI del consumo Azure → Postgres.

Uso (desde backend/, con env de producción o staging):

  python scripts/reconciliar_storage_quota.py
  python scripts/reconciliar_storage_quota.py --contrato-id 12

Equivale al endpoint POST /admin/storage/reconciliar (misma función reutilizable).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

# Permitir importar módulos del backend al ejecutar como script
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Recalcula bytes_fotos/documentos/otros desde Azure Blob Storage"
    )
    parser.add_argument(
        "--contrato-id",
        type=int,
        default=None,
        help="Si se indica, solo reconcilia ese contrato",
    )
    parser.add_argument(
        "--no-zero-missing",
        action="store_true",
        help="No poner en 0 filas de uso sin blobs (solo en reconciliación global)",
    )
    args = parser.parse_args()

    from storage_quota_service import reconcile_storage_from_azure

    result = reconcile_storage_from_azure(
        contrato_id=args.contrato_id,
        zero_missing=not args.no_zero_missing,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
