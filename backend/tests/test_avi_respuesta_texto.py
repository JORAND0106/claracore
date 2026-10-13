"""Extracción de texto y avisos de error de Clara/AVI (Anthropic)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from avi_service import (
    mensaje_error_anthropic_usuario,
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
