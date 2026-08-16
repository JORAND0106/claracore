"""Cotizaciones: ganadora obligatoria; soportes opcionales."""
from catalogo_insumos_service import _validar_cotizaciones_requeridas


def test_validar_cotizaciones_sin_requerir_pasa():
    _validar_cotizaciones_requeridas(1, False)


def test_validar_cotizaciones_requiere_ganadora(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service._count_cotizaciones_insumo",
        lambda *a, **k: (False, 0),
    )
    monkeypatch.setattr("catalogo_insumos_service._sb", lambda: object())
    try:
        _validar_cotizaciones_requeridas(1, True, ganadora_pdf=None, body={})
        assert False, "debía exigir ganadora"
    except ValueError as exc:
        assert "ganadora" in str(exc).lower()


def test_validar_cotizaciones_ganadora_sin_soportes_ok(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service._count_cotizaciones_insumo",
        lambda *a, **k: (True, 0),
    )
    monkeypatch.setattr("catalogo_insumos_service._sb", lambda: object())
    # No debe lanzar aunque n_soportes = 0
    _validar_cotizaciones_requeridas(
        1,
        True,
        ganadora_pdf=b"%PDF",
        soporte_pdfs=None,
        body={"cotizacion_numero": "COT-1"},
    )


def test_insumo_disponible_solo_exige_ganadora():
    from almacen_insumos_service import _insumo_disponible_solicitud

    row = {
        "id": 10,
        "origen": "almacen_insumo",
        "activo": True,
        "requiere_cotizacion": True,
        "soporte_pdf_blob_path": "x/ganadora.pdf",
        "cotizacion_numero": "COT-1",
        "costo_base": 1000,
        "valor_compra_referencia": 1000,
    }
    # min_cot alto no debe bloquear si hay ganadora y 0 soportes
    assert _insumo_disponible_solicitud(row, sb=None, min_cot=99, soportes_count=0) is True

    row_sin = {**row, "soporte_pdf_blob_path": None, "cotizacion_numero": None}
    assert _insumo_disponible_solicitud(row_sin, sb=None, min_cot=1, soportes_count=5) is False
