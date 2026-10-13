"""Credenciales Anthropic exclusivas del módulo Actas (síntesis + Clara del acta).

Prioridad de clave:
  1. ACTA_ANTHROPIC_API_KEY
  2. ANTHROPIC_API_KEY (respaldo; se registra en log, nunca el valor)

Modelo por defecto de actas: claude-haiku-5-5.
Ajuste opcional: ACTA_GRABACION_IA_MODEL o ANTHROPIC_MODEL.
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

_log = logging.getLogger("claracore.acta_anthropic")

ACTA_ANTHROPIC_DEFAULT_MODEL = "claude-haiku-5-5"
_FALLBACK_LOGGED = False


def resolve_acta_anthropic_key() -> Tuple[str, str]:
    """
    Devuelve (api_key, source) donde source es
    ``ACTA_ANTHROPIC_API_KEY`` o ``ANTHROPIC_API_KEY``.

    Nunca registra el valor de la clave.
    """
    global _FALLBACK_LOGGED
    acta = (os.getenv("ACTA_ANTHROPIC_API_KEY") or "").strip()
    if acta:
        return acta, "ACTA_ANTHROPIC_API_KEY"
    general = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if general:
        if not _FALLBACK_LOGGED:
            _log.warning(
                "ACTA_ANTHROPIC_API_KEY no configurada: actas usan respaldo ANTHROPIC_API_KEY"
            )
            _FALLBACK_LOGGED = True
        return general, "ANTHROPIC_API_KEY"
    return "", ""


def acta_anthropic_configured() -> bool:
    return bool(resolve_acta_anthropic_key()[0])


def resolve_acta_anthropic_model(explicit: Optional[str] = None) -> str:
    """Modelo para síntesis de temas y Clara dentro del acta."""
    if explicit and str(explicit).strip():
        return str(explicit).strip()
    return (
        (os.getenv("ACTA_GRABACION_IA_MODEL") or "").strip()
        or (os.getenv("ANTHROPIC_MODEL") or "").strip()
        or ACTA_ANTHROPIC_DEFAULT_MODEL
    )


def reset_fallback_log_flag_for_tests() -> None:
    """Solo tests: permite volver a emitir el warning de respaldo."""
    global _FALLBACK_LOGGED
    _FALLBACK_LOGGED = False
