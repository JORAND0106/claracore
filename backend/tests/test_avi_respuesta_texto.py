"""Extracción de texto y avisos de error de Clara/AVI (Anthropic)."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from avi_service import (
    CLARA_ACTA_SYSTEM,
    clara_acta_max_input_chars,
    clara_acta_max_tokens,
    llamar_avi,
    mensaje_error_anthropic_usuario,
    mensaje_respuesta_truncada,
    mensaje_texto_demasiado_largo,
    texto_desde_respuesta_anthropic,
    _traducir_error_anthropic,
)


def test_texto_desde_respuesta_omite_thinking_block():
    """claude-haiku-5-5 puede devolver ThinkingBlock antes del texto."""
    thinking = SimpleNamespace()  # sin .text
    text_block = SimpleNamespace(text="Texto mejorado del tema.")
    resp = SimpleNamespace(content=[thinking, text_block])
    assert texto_desde_respuesta_anthropic(resp) == "Texto mejorado del tema."


def test_texto_desde_respuesta_vacia_si_solo_thinking():
    resp = SimpleNamespace(content=[SimpleNamespace()])
    assert texto_desde_respuesta_anthropic(resp) == ""


def test_mensaje_error_distingue_saldo_auth_y_modelo():
    assert "saldo" in mensaje_error_anthropic_usuario(
        RuntimeError("credit balance too low"), producto="Clara"
    ).lower()
    assert "clave" in mensaje_error_anthropic_usuario(
        RuntimeError("invalid api key / unauthorized"), producto="Clara"
    ).lower()
    assert "modelo" in mensaje_error_anthropic_usuario(
        RuntimeError("not_found_error: model xyz"), producto="Clara"
    ).lower()
    msg = mensaje_error_anthropic_usuario(RuntimeError("credit balance too low"), producto="Clara")
    assert "ACTA_ANTHROPIC" not in msg
    assert "ANTHROPIC_API_KEY" not in msg
    assert "credit balance" not in msg.lower()


def test_traducir_error_usa_clara_cuando_corresponde():
    with pytest.raises(HTTPException) as ei:
        _traducir_error_anthropic(
            RuntimeError("credit balance too low to access the API"),
            producto="Clara",
            model="claude-haiku-5-5",
        )
    assert ei.value.status_code == 502
    assert "Clara" in ei.value.detail
    assert "saldo" in ei.value.detail.lower()


def test_limites_clara_acta_con_holgura():
    assert clara_acta_max_tokens() >= 8192
    assert clara_acta_max_input_chars() >= 8000
    assert "pie de la letra" in CLARA_ACTA_SYSTEM.lower() or "instrucción" in CLARA_ACTA_SYSTEM.lower()


def test_avisos_longitud_sin_jerga_tecnica():
    msg_in = mensaje_texto_demasiado_largo(producto="Clara", limite_chars=20000)
    assert "20.000" in msg_in
    assert "token" not in msg_in.lower()
    assert "ACTA_" not in msg_in
    msg_out = mensaje_respuesta_truncada(producto="Clara", max_tokens=8192)
    assert "demasiado largo" in msg_out.lower() or "cortó" in msg_out.lower()
    assert "token" not in msg_out.lower()


def test_llamar_avi_rechaza_respuesta_truncada_por_max_tokens():
    import asyncio

    resp = SimpleNamespace(
        content=[SimpleNamespace(text="1. Solo el comienzo…")],
        stop_reason="max_tokens",
        usage=SimpleNamespace(input_tokens=100, output_tokens=1024),
    )
    client = SimpleNamespace(messages=SimpleNamespace(create=AsyncMock(return_value=resp)))

    async def _run():
        with patch("avi_service.anthropic.AsyncAnthropic", return_value=client):
            with pytest.raises(HTTPException) as ei:
                await llamar_avi(
                    mensaje="x",
                    modulo_actual="seguimiento",
                    historial=[],
                    imagen_base64=None,
                    api_key="sk-test",
                    model="claude-haiku-5-5",
                    max_tokens=1024,
                    system="sys",
                    producto="Clara",
                )
            assert ei.value.status_code == 502
            assert "Clara" in ei.value.detail
            assert "token" not in ei.value.detail.lower()

    asyncio.run(_run())
