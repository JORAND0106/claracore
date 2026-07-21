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

# Resumen gerencial (Contratista Gerencial + Desarrolladores): mañana y fin de jornada
ADMIN_MANANA = (9, 0)
ADMIN_TARDE = (18, 0)

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
