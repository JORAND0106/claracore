"""Horarios de notificaciones por correo (hora local America/Bogota)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

TZ_BOGOTA = "America/Bogota"

# Snapshots silenciosos de matriz (apertura/cierre) para el informe semanal
SNAPSHOT_APERTURA = (9, 0)
SNAPSHOT_CIERRE = (18, 0)

# Informe semanal consolidado (solo lunes)
SEMANAL_LUNES = (8, 0)

# Sin ítem asignado + validación pendiente (editores / validadores) — lun–vie
DIA_0800 = (8, 0)
DIA_1400 = (14, 0)
DIA_1700 = (17, 0)

# Ventana de tolerancia (minutos) al disparar desde cron cada 5 min
CRON_MATCH_WINDOW_MIN = 6

# Roles excluidos del popup / informe semanal de validación (nombre normalizado)
ROLES_EXCLUIDOS_INFORME_VALIDACION = (
    "operativo gerencial",
    "contratista gerencial",
)


@dataclass(frozen=True)
class JobRunSpec:
    job_type: str
    slot_key: str
    hour: int
    minute: int


def all_scheduled_jobs() -> List[JobRunSpec]:
    """
    Jobs programados (cron lun–vie / snapshots también fin de semana según matcher).

    Correos SMTP desactivados intencionalmente vía
    notificaciones_email_mail.NOTIFICACIONES_EMAIL_ENVIO_ACTIVO = False.
    El cron sigue ejecutando matriz_snapshot para alimentar
    notificaciones_email_resumen_snapshot; no se elimina el código de los
    jobs de correo (por si se reactivan con decisión explícita).

    Histórico sin correo:
      - matriz_snapshot apertura/cierre → notificaciones_email_resumen_snapshot
      - informe_periodico_copia → API del modal (independiente del cron)

    Jobs que enviaban correo (hoy bloqueados por kill-switch SMTP):
      - sin_item_asignado, validacion_pendiente, admin_resumen_semanal
      - (legacy) informe_no_copiado, admin_resumen diario — ya fuera del schedule
    """
    jobs: List[JobRunSpec] = []
    for label, (h, m) in (
        ("0800", DIA_0800),
        ("1400", DIA_1400),
    ):
        jobs.append(JobRunSpec("sin_item_asignado", label, h, m))
        jobs.append(JobRunSpec("validacion_pendiente", label, h, m))
    jobs.append(JobRunSpec("validacion_pendiente", "1700", DIA_1700[0], DIA_1700[1]))
    jobs.append(
        JobRunSpec("matriz_snapshot", "apertura", SNAPSHOT_APERTURA[0], SNAPSHOT_APERTURA[1])
    )
    jobs.append(
        JobRunSpec("matriz_snapshot", "cierre", SNAPSHOT_CIERRE[0], SNAPSHOT_CIERRE[1])
    )
    jobs.append(
        JobRunSpec(
            "admin_resumen_semanal",
            "lunes_0800",
            SEMANAL_LUNES[0],
            SEMANAL_LUNES[1],
        )
    )
    return jobs
