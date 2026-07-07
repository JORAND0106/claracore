"""Tests alertas órdenes de pago — generación mensual y seguimiento."""

from datetime import date, datetime, timezone

import pytest

from contrato_orden_pago_service import (
    _contrato_activo_presupuesto,
    _en_ventana_alerta_generacion_mensual,
    alertas_generacion_mensual,
    alertas_seguimiento_emitidas,
)


def test_contrato_activo_presupuesto():
    assert _contrato_activo_presupuesto({"fase": "PRESUPUESTO"}) is True
    assert _contrato_activo_presupuesto({"fase": "LIQUIDACION"}) is False
    assert _contrato_activo_presupuesto({}) is True


def test_en_ventana_alerta_generacion_mensual_limites():
    assert _en_ventana_alerta_generacion_mensual(date(2026, 7, 1)) is True
    assert _en_ventana_alerta_generacion_mensual(date(2026, 7, 7)) is True
    assert _en_ventana_alerta_generacion_mensual(date(2026, 7, 8)) is False


def test_alertas_generacion_mensual_fuera_de_ventana(monkeypatch):
    monkeypatch.setattr(
        "contrato_orden_pago_service._bogota_today",
        lambda: date(2026, 3, 10),
    )
    result = alertas_generacion_mensual(sb=None)
    assert result["mostrar"] is False
    assert result["en_ventana"] is False
    assert result["zona_horaria"] == "America/Bogota"
    assert result["pendientes"] == []


def test_alertas_generacion_mensual_sin_sb():
    with pytest.raises(AttributeError):
        alertas_generacion_mensual(sb=object())


def test_alertas_seguimiento_filtra_por_24h(monkeypatch):
    class FakeQuery:
        def __init__(self, data):
            self._data = data

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            class R:
                data = self._data

            return R()

    old = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    recent = datetime.now(timezone.utc)

    class FakeSb:
        def table(self, name):
            assert name == "contrato_orden_pago"
            return FakeQuery(
                [
                    {
                        "id": 1,
                        "contrato_id": 10,
                        "numero_corte": 1,
                        "ultimo_envio_at": old.isoformat(),
                        "envio_estado": "enviado",
                        "estado": "emitida",
                        "contratos": {"numero": "CT-1", "objeto": "Obra A"},
                    },
                    {
                        "id": 2,
                        "contrato_id": 11,
                        "numero_corte": 2,
                        "ultimo_envio_at": recent.isoformat(),
                        "envio_estado": "enviado",
                        "estado": "emitida",
                        "contratos": {"numero": "CT-2", "objeto": "Obra B"},
                    },
                ]
            )

    result = alertas_seguimiento_emitidas(FakeSb())
    assert result["mostrar"] is True
    assert len(result["ordenes"]) == 1
    assert result["ordenes"][0]["numero_contrato"] == "CT-1"
