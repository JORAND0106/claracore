"""Utilidades de zona horaria para el módulo Almacén de Obra (Colombia)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

BOGOTA = ZoneInfo("America/Bogota")


def parse_timestamp(raw) -> Optional[datetime]:
    """Interpreta ISO/timestamptz; cadenas sin huso se asumen UTC."""
    if raw is None or raw == "":
        return None
    s = str(raw).strip().replace(" ", "T")
    try:
        if "T" in s or s.endswith("Z") or "+" in s[10:] or "-" in s[10:]:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        if len(s) >= 10 and s[4] == "-":
            return datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=BOGOTA)
    except ValueError:
        return None
    return None


def normalize_fecha_hora_bogota_to_utc_iso(raw: str) -> str:
    """Normaliza fecha/hora de formulario (Colombia) o ISO a UTC para timestamptz."""
    if not raw or not str(raw).strip():
        return datetime.now(timezone.utc).isoformat()
    s = str(raw).strip().replace(" ", "T")
    try:
        if s.endswith("Z") or "+" in s[10:] or (len(s) > 10 and s[10] == "-" and s.count("-") > 2):
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        elif "T" in s:
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=BOGOTA)
        else:
            return datetime.now(timezone.utc).isoformat()
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return datetime.now(timezone.utc).isoformat()


def fmt_fecha_hora_bogota(raw) -> str:
    dt = parse_timestamp(raw)
    if not dt:
        return "—"
    return dt.astimezone(BOGOTA).strftime("%d/%m/%Y %H:%M")


def fmt_fecha_bogota(raw) -> str:
    dt = parse_timestamp(raw)
    if dt:
        return dt.astimezone(BOGOTA).strftime("%d/%m/%Y")
    s = str(raw or "")[:10]
    if len(s) == 10 and s[4] == "-":
        try:
            return datetime.strptime(s, "%Y-%m-%d").strftime("%d/%m/%Y")
        except ValueError:
            pass
    return "—"


def fmt_fecha_hora_entrada(created_at, fecha_entrada) -> str:
    """Preferir timestamp de registro; si no hay hora, usar solo fecha de entrada."""
    if created_at:
        txt = fmt_fecha_hora_bogota(created_at)
        if txt != "—":
            return txt
    return fmt_fecha_bogota(fecha_entrada)
