"""
Zona horaria RRHH — America/Bogota (UTC−5, sin DST).

La plataforma muestra y registra fechas/horas de usuario en hora de Colombia.
Los timestamptz de Postgres siguen siendo instantes absolutos; al serializar
preferimos offset -05:00 y al presentar siempre convertimos a Bogotá
(también corrige registros antiguos guardados en UTC).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

TZ_BOGOTA = ZoneInfo("America/Bogota")
TZ_UTC = timezone.utc


def now_bogota() -> datetime:
    return datetime.now(TZ_BOGOTA)


def now_iso_bogota() -> str:
    """ISO-8601 con offset de Colombia (p. ej. 2026-10-15T17:32:00-05:00)."""
    return now_bogota().isoformat(timespec="seconds")


def parse_to_bogota(raw: Any) -> Optional[datetime]:
    """
    Interpreta timestamp de API/Postgres y lo lleva a America/Bogota.
    Sin zona → se asume UTC (comportamiento histórico de registros RRHH).
    """
    if raw is None or raw == "":
        return None
    if isinstance(raw, datetime):
        dt = raw
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ_UTC)
        return dt.astimezone(TZ_BOGOTA)
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        if " " in s and "T" not in s:
            s = s.replace(" ", "T", 1)
        # Quitar fracciones excesivas
        if "." in s:
            import re
            s = re.sub(r"(\.\d{6})\d+", r"\1", s)
        dt = datetime.fromisoformat(s)
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ_UTC)
    return dt.astimezone(TZ_BOGOTA)


def format_fecha_hora_colombia(
    raw: Any,
    *,
    with_seconds: bool = False,
    fallback: str = "—",
) -> str:
    """Presentación legible en Colombia: dd/mm/aaaa HH:MM (o con segundos)."""
    dt = parse_to_bogota(raw)
    if not dt:
        return fallback if raw in (None, "") else str(raw)
    if with_seconds:
        return dt.strftime("%d/%m/%Y %H:%M:%S")
    return dt.strftime("%d/%m/%Y %H:%M")
