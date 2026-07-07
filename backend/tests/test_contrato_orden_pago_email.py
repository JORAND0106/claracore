"""Tests plantilla y asunto correo órdenes de pago."""

from datetime import date

from contrato_orden_pago_email import (
    asunto_orden_pago,
    build_email_context,
    cuerpo_html_orden_pago,
    cuerpo_texto_orden_pago,
)


def test_asunto_orden_pago():
    subj = asunto_orden_pago(
        numero_contrato="CT-001",
        numero_corte=3,
        periodo_inicio=date(2026, 1, 1),
        periodo_fin=date(2026, 1, 31),
    )
    assert subj == "Orden de Pago N.° 003 — Contrato CT-001 — Período 01/01/2026 — 31/01/2026"


def test_cuerpo_html_plantilla_institucional():
    ctx = build_email_context(
        numero_contrato="CT-99",
        numero_corte=1,
        periodo_inicio=date(2026, 2, 1),
        periodo_fin=date(2026, 2, 28),
        fecha_vencimiento=date(2026, 3, 7),
        monto_total=3_000_000,
    )
    html = cuerpo_html_orden_pago(ctx, mensaje_adicional="Nota especial del contrato.")
    assert "Este es un mensaje automático generado por la plataforma ClaraCore." in html
    assert "Orden de Pago N.° <strong>001</strong>" in html
    assert "por valor de <strong>$ 3.000.000 COP</strong>" in html
    assert "soporte de aprobación a este mismo correo" in html
    assert "Nota especial del contrato." in html
    assert "Este documento no reemplaza la factura electrónica." in html
    assert "Cordial saludo" not in html
    assert "Atentamente" not in html
    assert "confidencialidad" in html.lower()


def test_cuerpo_html_sin_mensaje_adicional_sin_espacio_extra():
    ctx = build_email_context(
        numero_contrato="CT-1",
        numero_corte=2,
        periodo_inicio=date(2026, 1, 1),
        periodo_fin=date(2026, 1, 31),
        fecha_vencimiento=date(2026, 2, 7),
        monto_total=1_190_000,
    )
    html = cuerpo_html_orden_pago(ctx, mensaje_adicional="")
    assert "factura electrónica correspondiente." in html
    assert "Este documento no reemplaza la factura electrónica." in html
    assert html.count("<p ") == 4


def test_cuerpo_texto_plano():
    ctx = build_email_context(
        numero_contrato="CT-1",
        numero_corte=2,
        periodo_inicio="2026-01-01",
        periodo_fin="2026-01-31",
        fecha_vencimiento="2026-02-07",
        monto_total=1_190_000,
    )
    txt = cuerpo_texto_orden_pago(ctx)
    assert "Este es un mensaje automático generado por la plataforma ClaraCore." in txt
    assert "Orden de Pago N.° 002" in txt
    assert "$ 1.190.000 COP" in txt
    assert "Este documento no reemplaza la factura electrónica." in txt
