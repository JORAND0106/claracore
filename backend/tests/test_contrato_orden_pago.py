"""Tests órdenes de pago — montos, validaciones y PDF."""

from datetime import date

import pytest

from contrato_orden_pago_pdf import _fila_meta, _fila_meta_html, generar_pdf_orden_pago
from contrato_orden_pago_service import (
    ORDEN_ESTADOS,
    calcular_fecha_vencimiento,
    calcular_montos_orden,
    default_plan_descripcion,
    validate_orden_estado,
    _normalize_correos_notificacion,
    _validate_cobro_config_payload,
)


def test_calcular_montos_orden_con_cartera():
    m = calcular_montos_orden(valor_unitario=1_000_000, iva_tasa=0.19, saldo_cartera=500_000)
    assert m["subtotal"] == 1_000_000
    assert m["iva_valor"] == 190_000
    assert m["total"] == 1_190_000
    assert m["saldo_cartera"] == 500_000
    assert m["total_a_pagar"] == 1_190_000


def test_calcular_montos_orden_sin_cartera():
    m = calcular_montos_orden(valor_unitario=2_521_008, iva_tasa=0.19, saldo_cartera=0)
    assert m["total_a_pagar"] == m["total"]
    assert m["iva_valor"] == int(round(2_521_008 * 0.19))


def test_calcular_fecha_vencimiento_mes_siguiente():
    # Período cierra en enero → vencimiento día 7 de febrero
    assert calcular_fecha_vencimiento(date(2026, 1, 31), 7) == date(2026, 2, 7)
    # Diciembre → enero del año siguiente
    assert calcular_fecha_vencimiento(date(2026, 12, 31), 15) == date(2027, 1, 15)


def test_calcular_fecha_vencimiento_ajusta_fin_de_mes():
    # Febrero no tiene día 31 → usa último día del mes
    assert calcular_fecha_vencimiento(date(2026, 1, 31), 31) == date(2026, 2, 28)


def test_default_plan_descripcion():
    mod = "control de obra, dashboard, presupuesto, programación y topografía"
    assert default_plan_descripcion({"numero": "CT-99"}, None) == (
        f"Licencia de uso ClaraCore — incluye módulos de {mod} — contrato/obra CT-99"
    )
    assert (
        default_plan_descripcion({"numero": "CT-99"}, {"identificacion_obra": "Obra X"})
        == f"Licencia de uso ClaraCore — incluye módulos de {mod} — contrato/obra Obra X"
    )
    assert default_plan_descripcion({}, None) == (
        f"Licencia de uso ClaraCore — incluye módulos de {mod}"
    )


def test_validate_orden_estado():
    for e in ORDEN_ESTADOS:
        assert validate_orden_estado(e) == e
    with pytest.raises(ValueError, match="Estado inválido"):
        validate_orden_estado("borrador")


def test_validate_cobro_config_payload():
    norm = _validate_cobro_config_payload(
        {
            "plan_descripcion": "  Plan test  ",
            "tipo_periodo": "quincenal",
            "dia_vencimiento": 15,
            "logo_receptor": "interventoria",
            "autorizo_nombre": " Ana ",
            "autorizo_cargo": "",
        }
    )
    assert norm["plan_descripcion"] == "Plan test"
    assert norm["tipo_periodo"] == "quincenal"
    assert norm["dia_vencimiento"] == 15
    assert norm["logo_receptor"] == "interventoria"
    assert norm["autorizo_nombre"] == "Ana"
    assert norm["autorizo_cargo"] is None
    assert norm["correos_notificacion"] == []


def test_normalize_correos_notificacion():
    assert _normalize_correos_notificacion(None) == []
    assert _normalize_correos_notificacion(["  A@B.co ", "a@b.co", "c@d.co"]) == ["a@b.co", "c@d.co"]
    with pytest.raises(ValueError, match="Correo inválido"):
        _normalize_correos_notificacion(["no-es-correo"])
    with pytest.raises(ValueError, match="lista"):
        _normalize_correos_notificacion("solo@correo.co")


def test_validate_cobro_config_correos():
    norm = _validate_cobro_config_payload(
        {"correos_notificacion": ["Facturacion@Empresa.Co", " otro@mail.com "]}
    )
    assert norm["correos_notificacion"] == ["facturacion@empresa.co", "otro@mail.com"]


def test_validate_cobro_config_rechaza_logo():
    with pytest.raises(ValueError, match="logo_receptor"):
        _validate_cobro_config_payload({"logo_receptor": "invalido"})


def test_validate_cobro_config_rechaza_dia():
    with pytest.raises(ValueError, match="dia_vencimiento"):
        _validate_cobro_config_payload({"dia_vencimiento": 29})


def test_fila_meta_html():
    html = _fila_meta_html("Etiqueta", "valor<br/>linea2")
    assert "meta-lbl" in html
    assert "Etiqueta" in html
    assert "valor<br/>linea2" in html
    plain = _fila_meta("Campo", "A & B")
    assert "&amp;" in plain


def test_generar_pdf_orden_pago_bytes(monkeypatch):
    monkeypatch.delenv("CLARACORE_EMPRESA_NIT", raising=False)
    montos = calcular_montos_orden(valor_unitario=1_000_000, iva_tasa=0.19, saldo_cartera=0)
    pdf = generar_pdf_orden_pago(
        numero_contrato="CT-TEST-001",
        numero_corte=1,
        periodo_inicio=date(2026, 1, 1),
        periodo_fin=date(2026, 1, 31),
        fecha_emision=date(2026, 2, 1),
        fecha_vencimiento=date(2026, 2, 7),
        contrato_objeto="Licenciamiento plataforma ClaraCore para obra piloto",
        licenciatario={
            "razon_social": "CONTRATISTA S.A.S.",
            "nit": "900123456-7",
            "direccion": "Calle 1 # 2-3",
            "email_notificaciones": "facturacion@contratista.co",
        },
        empresa={
            "razon_social": "CLARACORE SOLUTIONS S.A.S.",
            "nit": "En trámite",
            "direccion": "Bogotá",
            "email": "ajaimes@claracore.co",
            "telefono": "3001234567",
            "elaboro_nombre": "Jorge Andrés Jaimes Arenas",
            "elaboro_cargo": "Representante Legal",
        },
        descripcion_servicio="Licencia de uso ClaraCore — CT-TEST-001",
        montos=montos,
        iva_etiqueta="19%",
        logo_receptor_url="",
        autorizo_nombre="Autorizador Test",
        autorizo_cargo="Director",
    )
    assert isinstance(pdf, bytes)
    assert len(pdf) > 400
    assert pdf[:4] == b"%PDF"


def test_generar_pdf_orden_pago_cartera_informativa(monkeypatch):
    monkeypatch.delenv("CLARACORE_EMPRESA_NIT", raising=False)
    montos = calcular_montos_orden(valor_unitario=2_521_008, iva_tasa=0.19, saldo_cartera=3_000_000)
    pdf = generar_pdf_orden_pago(
        numero_contrato="CT-TEST-002",
        numero_corte=2,
        periodo_inicio=date(2026, 2, 1),
        periodo_fin=date(2026, 2, 28),
        fecha_emision=date(2026, 3, 1),
        fecha_vencimiento=date(2026, 3, 7),
        contrato_objeto="Licenciamiento plataforma ClaraCore",
        licenciatario={"razon_social": "CONTRATISTA S.A.S.", "nit": "900123456-7"},
        empresa={
            "razon_social": "CLARACORE SOLUTIONS S.A.S.",
            "nit": "En trámite",
            "email": "ajaimes@claracore.co",
            "elaboro_nombre": "Test",
            "elaboro_cargo": "Rep Legal",
        },
        descripcion_servicio="Licencia febrero",
        montos=montos,
        iva_etiqueta="19%",
        logo_receptor_url="",
        autorizo_nombre="Autorizador",
        autorizo_cargo="Director",
    )
    html_snippet = pdf.decode("latin-1", errors="ignore")
    assert "incl. cartera" not in html_snippet.lower()
    assert montos["total_a_pagar"] == montos["total"] == 3_000_000
