"""Anti-duplicados de entrada y umbrales de saldo OC."""
from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from almacen_entrada_duplicados import (
    fingerprint_items,
    mensaje_remision_duplicada,
    umbral_alerta_saldo_oc,
)


def test_fingerprint_ordena_items():
    a = fingerprint_items(5, [
        {"orden_compra_item_id": 2, "cantidad_recibida": 1.5},
        {"orden_compra_item_id": 1, "cantidad_recibida": 2},
    ])
    b = fingerprint_items(5, [
        {"orden_compra_item_id": 1, "cantidad_recibida": 2},
        {"orden_compra_item_id": 2, "cantidad_recibida": 1.5},
    ])
    assert a == b
    assert a.startswith("5|")


def test_umbral_alerta_saldo_oc_defaults():
    assert umbral_alerta_saldo_oc(200, 1000) == "amarillo"
    assert umbral_alerta_saldo_oc(40, 1000) == "rojo"
    assert umbral_alerta_saldo_oc(0, 1000) == "rojo"
    assert umbral_alerta_saldo_oc(500, 1000) is None


def test_mensaje_remision_bloquea_con_codigo():
    msg = mensaje_remision_duplicada("Ent-9-00012")
    assert "Ent-9-00012" in msg
    assert "No se puede" in msg


def test_migration_y_routes_criticas():
    root = Path(__file__).resolve().parents[1]
    mig = root / "migrations" / "20261103020000_almacen_entrada_dup_oc_saldo.sql"
    assert mig.is_file()
    text = mig.read_text(encoding="utf-8")
    assert "idempotency_key" in text
    assert "alerta_saldo_amarillo_pct" in text
    assert "almacen_oc_item_alerta_enviada" in text
    runner = (root / "schema_migrations_runner.py").read_text(encoding="utf-8")
    assert "20261103020000_almacen_entrada_dup_oc_saldo.sql" in runner
    routes = (root / "almacen_routes.py").read_text(encoding="utf-8")
    assert "check-similar-reciente" in routes
    assert '"blocked": True' in routes or "blocked\": True" in routes
