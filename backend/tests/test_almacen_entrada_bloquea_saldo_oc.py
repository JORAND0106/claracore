"""Entrada con OC: cantidad > saldo pendiente se rechaza (ya no «por revisar»)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from almacen_service import create_entrada

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _segmento(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service.contrato_codigo_segment",
        lambda _cid: "1614",
    )


def _table_factory(calls):
    def table(name):
        q = MagicMock()
        if name == "almacen_entrada":
            def do_insert(row):
                calls.append(row)
                return MagicMock(execute=MagicMock(return_value=MagicMock(data=[{"id": 50}])))

            q.insert.side_effect = do_insert
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        elif name == "almacen_entrada_item":
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
        elif name == "almacen_orden_compra_item":
            q.update.return_value.eq.return_value.lte.return_value.execute.return_value.data = [
                {"id": 5},
            ]
            q.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
        else:
            q.insert.return_value.execute.return_value.data = [{"id": 1}]
            q.select.return_value.execute.return_value.data = []
            q.update.return_value.eq.return_value.execute.return_value.data = []
        return q

    return table


def test_create_entrada_rechaza_si_supera_saldo_oc(monkeypatch):
    calls = []
    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock(table=_table_factory(calls)))
    monkeypatch.setattr(
        "almacen_service._upload_soporte",
        lambda *_a, **_k: {"blob_path": "x", "nombre": "rem.pdf", "mime": "application/pdf"},
    )
    monkeypatch.setattr("almacen_service.lookup_entrada_soporte_hash", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service.upsert_entrada_soporte_hash", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._next_consecutivo", lambda *_a, **_k: 1)
    monkeypatch.setattr("almacen_service._actualizar_estado_oc", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._upsert_inventario", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._generar_pdf_pos_entrada", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "almacen_service.get_orden_compra",
        lambda *_a, **_k: {
            "id": 2,
            "estado": "aprobada",
            "numero_oc": 9,
            "items": [{
                "id": 5,
                "presupuesto_id": 1,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "cantidad": 10,
                "cantidad_recibida": 8,
                "valor_unitario": 1000,
                "valor_recibido": 8000,
            }],
        },
    )

    with pytest.raises(ValueError, match=r"supera el saldo pendiente|Máximo permitido"):
        create_entrada(
            1,
            1,
            {
                "orden_compra_id": 2,
                "tipo": "recibo",
                "numero_documento": "REM-TEST",
                "items": [{"orden_compra_item_id": 5, "cantidad_recibida": 5}],
            },
            remision_data=b"%PDF",
            remision_nombre="r.pdf",
            remision_mime="application/pdf",
            material_foto_data=b"\xff\xd8",
            material_foto_nombre="m.jpg",
            material_foto_mime="image/jpeg",
        )


def test_create_entrada_rechaza_oc_consumida(monkeypatch):
    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock(table=_table_factory([])))
    monkeypatch.setattr(
        "almacen_service.get_orden_compra",
        lambda *_a, **_k: {
            "id": 2,
            "estado": "aprobada",
            "numero_oc": 9,
            "items": [{
                "id": 5,
                "material_descripcion": "Arena",
                "unidad": "M3",
                "cantidad": 10,
                "cantidad_recibida": 10,
                "valor_unitario": 1000,
                "valor_recibido": 10000,
            }],
        },
    )
    with pytest.raises(ValueError, match=r"consumida por completo"):
        create_entrada(
            1,
            1,
            {
                "orden_compra_id": 2,
                "tipo": "recibo",
                "items": [{"orden_compra_item_id": 5, "cantidad_recibida": 1}],
            },
            remision_data=b"%PDF",
            remision_nombre="r.pdf",
            remision_mime="application/pdf",
            material_foto_data=b"\xff\xd8",
            material_foto_nombre="m.jpg",
            material_foto_mime="image/jpeg",
        )


def test_service_fuente_bloquea_supera_saldo():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    create = src.split("def create_entrada")[1].split("\ndef ")[0]
    assert "Máximo permitido" in create
    assert "consumida por completo" in create
    assert "motivos.append(MOTIVO_SUPERA_SALDO" not in create
    audit = (ROOT / "sql" / "almacen_auditoria_saldos_excedidos.sql").read_text(encoding="utf-8")
    assert "exceso_sobre_oc" in audit
    assert "exceso_bruto_vs_recibido" in audit
