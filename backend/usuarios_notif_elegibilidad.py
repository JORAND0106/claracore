"""
Elegibilidad de usuarios para notificaciones automáticas (email / push).

Fuente de verdad: solo usuarios con ``usuarios.estado == "aprobado"``
deben recibir recordatorios y resúmenes del sistema.

Los valores canónicos en BD son minúsculas: aprobado | pendiente | rechazado.
"""
from __future__ import annotations

from typing import Any, Iterable, List, Mapping, Optional

ESTADO_APROBADO = "aprobado"
ESTADO_PENDIENTE = "pendiente"
ESTADO_RECHAZADO = "rechazado"


def normalizar_estado_usuario(estado: Any) -> str:
    return (str(estado) if estado is not None else "").strip().lower()


def usuario_estado_es_aprobado(estado: Any) -> bool:
    """True solo si el estado de acceso es Aprobado."""
    return normalizar_estado_usuario(estado) == ESTADO_APROBADO


def usuario_puede_recibir_notificaciones_automaticas(
    usuario: Optional[Mapping[str, Any]],
) -> bool:
    """
    Gate único para destinatarios de notificaciones automáticas.

    Requiere estado Aprobado. No valida ``activo`` aquí: las consultas de
    destinatarios ya filtran ``activo=True`` en servidor; este helper se
    centra en el requisito de negocio del estado de acceso.
    """
    if not usuario:
        return False
    return usuario_estado_es_aprobado(usuario.get("estado"))


def filtrar_usuarios_para_notificaciones_automaticas(
    usuarios: Iterable[Mapping[str, Any]],
) -> List[dict]:
    """Filtra un iterable de filas de ``usuarios`` dejando solo aprobados."""
    return [dict(u) for u in usuarios if usuario_puede_recibir_notificaciones_automaticas(u)]
