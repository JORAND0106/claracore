"""Horarios de notificaciones por correo (hora local America/Bogota, lun–vie)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

TZ_BOGOTA = "America/Bogota"

# Ventanas del recordatorio informe → verificación 15 min después
INFORME_SLOT_KEYS = ("0800", "1030", "1300", "1530")
INFORME_CHECK_MINUTES: List[Tuple[str, int, int]] = [
    ("0800", 8, 15),
    ("1030", 10, 45),
    ("1300", 13, 15),
    ("1530", 15, 45),
]

# Sin ítem asignado + validación pendiente (editores / validadores)
DIA_0800 = (8, 0)
DIA_1400 = (14, 0)
DIA_1700 = (17, 0)

# Resumen administradores: mañana y fin de jornada
ADMIN_MANANA = (9, 0)
ADMIN_TARDE = (18, 0)

# ---------------------------------------------------------------------------
# TEMPORAL — prueba producción sábado 2026-07-18 23:32–23:40 (America/Bogota).
# Dispara admin_resumen una sola vez; ignora restricción lun–vie.
# ELIMINAR este bloque y temp_test_admin_jobs_due_now() tras confirmar envío
# en notificaciones_email_envio.
# ---------------------------------------------------------------------------
ADMIN_RESUMEN_PRUEBA_TEMP_FECHA = "2026-07-18"
ADMIN_RESUMEN_PRUEBA_TEMP = (23, 32)
ADMIN_RESUMEN_PRUEBA_TEMP_WINDOW_MIN = 8
ADMIN_RESUMEN_PRUEBA_TEMP_SLOT = "prueba_temp"

# Ventana de tolerancia (minutos) al disparar desde cron cada 5 min
CRON_MATCH_WINDOW_MIN = 6


@dataclass(frozen=True)
class JobRunSpec:
    job_type: str
    slot_key: str
    hour: int
    minute: int


def all_scheduled_jobs() -> List[JobRunSpec]:
    jobs: List[JobRunSpec] = []
    for sk, h, m in INFORME_CHECK_MINUTES:
        jobs.append(JobRunSpec("informe_no_copiado", sk, h, m))
    for label, (h, m) in (
        ("0800", DIA_0800),
        ("1400", DIA_1400),
    ):
        jobs.append(JobRunSpec("sin_item_asignado", label, h, m))
        jobs.append(JobRunSpec("validacion_pendiente", label, h, m))
    jobs.append(JobRunSpec("validacion_pendiente", "1700", DIA_1700[0], DIA_1700[1]))
    jobs.append(JobRunSpec("admin_resumen", "manana", ADMIN_MANANA[0], ADMIN_MANANA[1]))
    jobs.append(JobRunSpec("admin_resumen", "tarde", ADMIN_TARDE[0], ADMIN_TARDE[1]))
    return jobs


def temp_test_admin_jobs_due_now(dt) -> List[JobRunSpec]:
    """
    TEMPORAL — ventana única de prueba admin_resumen (sáb 2026-07-18 23:32–23:40 Bogotá).
    Eliminar junto con las constantes ADMIN_RESUMEN_PRUEBA_TEMP_*.
    """
    fecha = dt.strftime("%Y-%m-%d")
    if fecha != ADMIN_RESUMEN_PRUEBA_TEMP_FECHA:
        return []
    h, m = ADMIN_RESUMEN_PRUEBA_TEMP
    target = h * 60 + m
    now_m = dt.hour * 60 + dt.minute
    if target <= now_m < target + ADMIN_RESUMEN_PRUEBA_TEMP_WINDOW_MIN:
        return [
            JobRunSpec(
                "admin_resumen",
                ADMIN_RESUMEN_PRUEBA_TEMP_SLOT,
                h,
                m,
            )
        ]
    return []
