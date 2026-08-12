"""
Elegibilidad de usuarios para notificaciones y visibilidad en gestión.

Estados canónicos en BD (minúsculas): aprobado | pendiente | rechazado.

- **aprobado**: usuario activo del sistema (login, notificaciones, push).
- **pendiente**: visible en administración; aún no opera ni recibe notifs.
- **rechazado**: «papelera» — no aparece en listados de gestión, no inicia
  sesión, no recibe notificaciones/push/actualizaciones. El registro queda
  en BD solo como archivo; no se usa eliminación física ni búsqueda de actividad.
"""
from __future__ import annotations

from typing import Any, Iterable, List, Mapping, Optional

ESTADO_APROBADO = "aprobado"
ESTADO_PENDIENTE = "pendiente"
ESTADO_RECHAZADO = "rechazado"

# Solo estos aparecen en Gestión de Usuarios / flujos vivos.
ESTADOS_VISIBLES_GESTION = frozenset({ESTADO_PENDIENTE, ESTADO_APROBADO})


def normalizar_estado_usuario(estado: Any) -> str:
    return (str(estado) if estado is not None else "").strip().lower()


def usuario_estado_es_aprobado(estado: Any) -> bool:
    """True solo si el estado de acceso es Aprobado."""
    return normalizar_estado_usuario(estado) == ESTADO_APROBADO


def usuario_estado_es_rechazado(estado: Any) -> bool:
    return normalizar_estado_usuario(estado) == ESTADO_RECHAZADO


def usuario_visible_en_gestion(estado: Any) -> bool:
    """Pendiente o aprobado: visibles en admin. Rechazados no."""
    return normalizar_estado_usuario(estado) in ESTADOS_VISIBLES_GESTION


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


def filtrar_usuarios_visibles_gestion(
    usuarios: Iterable[Mapping[str, Any]],
) -> List[dict]:
    """Excluye rechazados (y estados desconocidos) del listado de gestión."""
    return [dict(u) for u in usuarios if usuario_visible_en_gestion(u.get("estado"))]
