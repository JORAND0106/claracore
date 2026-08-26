"""Papelera de poligonal (armadas / estaciones): baja lógica y restauración.

Patrón alineado con ``presupuesto_papelera`` (dado_de_baja / dado_de_baja_at).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

DIAS_PURGA_PAPELERA = 30


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def payload_marcar_baja() -> Dict[str, Any]:
    return {
        "dado_de_baja": True,
        "dado_de_baja_at": utc_now_iso(),
    }


def payload_restaurar() -> Dict[str, Any]:
    return {
        "dado_de_baja": False,
        "dado_de_baja_at": None,
    }


def umbral_purga(dias: int = DIAS_PURGA_PAPELERA) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=max(1, int(dias)))


def _parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def edad_en_papelera_dias(row: dict, *, ahora: Optional[datetime] = None) -> Optional[float]:
    """Días desde ingreso a papelera (dado_de_baja_at → created_at)."""
    ahora = ahora or datetime.now(timezone.utc)
    ts = _parse_ts(row.get("dado_de_baja_at")) or _parse_ts(row.get("created_at"))
    if not ts:
        return None
    return max(0.0, (ahora - ts).total_seconds() / 86400.0)


def es_activo(row: Optional[dict]) -> bool:
    if not row:
        return False
    return not bool(row.get("dado_de_baja"))


def filtrar_activos(rows: Optional[list]) -> list:
    return [r for r in (rows or []) if es_activo(r)]


def filtrar_papelera(rows: Optional[list]) -> list:
    return [r for r in (rows or []) if r and bool(r.get("dado_de_baja"))]
