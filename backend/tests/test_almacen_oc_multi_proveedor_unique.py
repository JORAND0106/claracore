"""Varias OC por solicitud: UNIQUE por proveedor, no solo por solicitud_id."""
from pathlib import Path

import pytest

import almacen_service as svc


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "20261026200000_almacen_oc_multi_proveedor_unique.sql"
SQL_MANUAL = ROOT / "sql" / "almacen_oc_multi_proveedor_unique.sql"
SQL_DIAG = ROOT / "sql" / "almacen_oc_diagnostico_solicitud.sql"
SQL_LEGACY = ROOT / "sql" / "almacen_oc_por_proveedor.sql"


def test_migracion_critica_existe_y_quita_unique_solicitud():
    text = MIGRATION.read_text(encoding="utf-8")
    assert "DROP CONSTRAINT" in text
    assert "almacen_orden_compra_solicitud_id_key" in text
    assert "idx_almacen_oc_solicitud_proveedor_id_uq" in text
    assert "idx_almacen_oc_solicitud_proveedor_nombre_uq" in text
    assert "NOTIFY pgrst" in text
    assert SQL_MANUAL.is_file()
    assert SQL_DIAG.is_file()
    legacy = SQL_LEGACY.read_text(encoding="utf-8")
    assert "idx_almacen_oc_solicitud_proveedor_id_uq" in legacy


def test_humanize_legacy_unique_solicitud_id():
    msg = svc._humanize_oc_db_error(
        Exception(
            'duplicate key value violates unique constraint '
            '"almacen_orden_compra_solicitud_id_key" '
            "DETAIL: Key (solicitud_id)=(17) already exists. code 23505"
        )
    )
    assert msg is not None
    assert "solo una OC por solicitud" in msg
    assert "23505" not in msg
    assert "almacen_orden_compra_solicitud_id_key" not in msg


def test_humanize_unique_mismo_proveedor():
    msg = svc._humanize_oc_db_error(
        Exception(
            'duplicate key value violates unique constraint '
            '"idx_almacen_oc_solicitud_proveedor_id_uq" code 23505'
        )
    )
    assert msg is not None
    assert "mismo proveedor" in msg.lower() or "ese proveedor" in msg.lower()


def test_insert_oc_convierte_duplicate_en_valueerror(monkeypatch):
    class _Table:
        def insert(self, _row):
            return self

        def execute(self):
            raise Exception(
                'duplicate key value violates unique constraint '
                '"almacen_orden_compra_solicitud_id_key" '
                "Key (solicitud_id)=(17) already exists 23505"
            )

    class _Sb:
        def table(self, _name):
            return _Table()

    with pytest.raises(ValueError, match="solo una OC por solicitud"):
        svc._insert_orden_compra_row(_Sb(), {
            "solicitud_id": 17,
            "contrato_id": 1,
            "numero_oc": 2,
            "estado": "aprobada",
            "proveedor_id": 9,
            "proveedor_nombre": "CALHIDRA SAS",
        })


def test_aprobar_descarta_ocs_si_falla_la_segunda():
    src = Path(svc.__file__).read_text(encoding="utf-8")
    assert "_descartar_ocs_recien_creadas" in src
    assert "Todo o nada" in src or "todo o nada" in src.lower()
    # Crear varias OC en el bucle de aprobar / append.
    assert src.count("_crear_oc_con_items(") >= 2
