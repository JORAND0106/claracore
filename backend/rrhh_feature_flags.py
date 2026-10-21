"""
Flags de producto RRHH (interruptores sencillos).

Para reactivar la auditoría documental (UI + Anthropic):
  poner RRHH_AUDITORIA_DOCUMENTAL_ACTIVA = True
  o exportar RRHH_AUDITORIA_DOCUMENTAL=1
"""
from __future__ import annotations

import os

# Interruptor maestro. Por defecto OFF (sin llamadas Anthropic / sin botón).
_ENV = (os.getenv("RRHH_AUDITORIA_DOCUMENTAL") or "").strip().lower()
if _ENV in ("1", "true", "yes", "on"):
    RRHH_AUDITORIA_DOCUMENTAL_ACTIVA = True
elif _ENV in ("0", "false", "no", "off"):
    RRHH_AUDITORIA_DOCUMENTAL_ACTIVA = False
else:
    # Sin env: oculto por decisión de producto (costo Anthropic).
    RRHH_AUDITORIA_DOCUMENTAL_ACTIVA = False


def auditoria_documental_activa() -> bool:
    return bool(RRHH_AUDITORIA_DOCUMENTAL_ACTIVA)
