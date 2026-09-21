"""
Política Bitácora ↔ RRHH: identificación individual + documentación Aprobada.

- Hasta 2026-09-24 23:59:59 America/Bogota: sin gate (comportamiento actual).
- Desde 2026-09-25 00:00:00 America/Bogota: gate activo para todos los contratos
  excepto el ID 3, que permanece exento hasta activación manual (Desarrollador).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

TZ_BOGOTA = ZoneInfo("America/Bogota")

# Medianoche Colombia del 25-sep-2026: primer instante con gate activo.
BITACORA_ASISTENCIA_RRHH_CORTE = datetime(2026, 9, 25, 0, 0, 0, tzinfo=TZ_BOGOTA)

# Contrato exento indefinidamente hasta toggle manual.
BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID = 3

DOC_VALIDACION_APROBADO = "aprobado"


def ahora_bogota(now: Optional[datetime] = None) -> datetime:
    if now is None:
        return datetime.now(TZ_BOGOTA)
    if now.tzinfo is None:
        return now.replace(tzinfo=TZ_BOGOTA)
    return now.astimezone(TZ_BOGOTA)


def cutover_asistencia_rrhh_activo(now: Optional[datetime] = None) -> bool:
    """True a partir del 25-sep-2026 00:00:00 America/Bogota."""
    return ahora_bogota(now) >= BITACORA_ASISTENCIA_RRHH_CORTE


def es_contrato_exento_asistencia_rrhh(contrato_id: Any) -> bool:
    try:
        return int(contrato_id) == BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID
    except (TypeError, ValueError):
        return False


def requiere_asistencia_rrhh_aprobado(
    contrato_id: Any,
    *,
    activa_en_exento: bool = False,
    now: Optional[datetime] = None,
) -> bool:
    """
    Gate de identificación individual + documentación Aprobada.

    - Antes del corte: False (todos los contratos).
    - Contrato 3: False salvo `activa_en_exento` (toggle Desarrollador).
    - Resto: True tras el corte.
    """
    if not cutover_asistencia_rrhh_activo(now):
        return False
    if es_contrato_exento_asistencia_rrhh(contrato_id):
        return bool(activa_en_exento)
    return True


def doc_validacion_es_aprobado(raw: Any) -> bool:
    return str(raw or "").strip().lower() == DOC_VALIDACION_APROBADO


def policy_snapshot(
    contrato_id: Any,
    *,
    activa_en_exento: bool = False,
    now: Optional[datetime] = None,
) -> dict:
    """Payload estable para API / frontend."""
    corte_activo = cutover_asistencia_rrhh_activo(now)
    exento = es_contrato_exento_asistencia_rrhh(contrato_id)
    gate = requiere_asistencia_rrhh_aprobado(
        contrato_id, activa_en_exento=activa_en_exento, now=now,
    )
    return {
        "corte_iso": BITACORA_ASISTENCIA_RRHH_CORTE.date().isoformat(),
        "corte_activo": corte_activo,
        "contrato_id": int(contrato_id) if contrato_id is not None else None,
        "contrato_exento": exento,
        "activa_en_exento": bool(activa_en_exento) if exento else False,
        "requiere_rrhh_aprobado": gate,
        "permite_cargo_cuadrilla": (not gate) and exento,
    }
