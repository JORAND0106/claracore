"""Reglas de baja del módulo Almacén. El permiso se exige en la ruta; aquí solo la integridad."""
from __future__ import annotations

from typing import Any, Optional


MOTIVO_LINEA_OC = (
    "No se puede eliminar esta línea porque ya está incluida en una orden de compra."
)
MOTIVO_SOLICITUD_OC = (
    "No se puede eliminar esta solicitud porque tiene líneas que ya están en una orden de compra."
)
MOTIVO_LINEA_AL_GUARDAR = (
    "No se puede quitar una línea al guardar la solicitud. "
    "Eliminar una línea requiere el permiso Eliminar y una confirmación."
)
MOTIVO_ENTRADA_SALIDAS = (
    "No se puede eliminar esta entrada porque hay salidas que consumen su stock. "
    "Elimine primero esas salidas."
)
MOTIVO_COTIZACION_GANADORA = (
    "No se puede eliminar esta cotización porque es la ganadora de un insumo "
    "que ya tiene líneas asignadas en solicitudes."
)
MOTIVO_ADJUNTO_GANADORA = (
    "No se puede quitar el archivo de esta cotización porque es la ganadora de un insumo "
    "que ya tiene líneas asignadas en solicitudes."
)


def motivo_insumo_con_dependencias(
    *,
    solicitudes: bool = False,
    ordenes: bool = False,
    entradas: bool = False,
    salidas: bool = False,
) -> Optional[str]:
    partes = []
    if solicitudes:
        partes.append("solicitudes")
    if ordenes:
        partes.append("órdenes de compra")
    if entradas:
        partes.append("entradas")
    if salidas:
        partes.append("salidas")
    if not partes:
        return None
    if len(partes) == 1:
        lista = partes[0]
    elif len(partes) == 2:
        lista = f"{partes[0]} y {partes[1]}"
    else:
        lista = ", ".join(partes[:-1]) + f" y {partes[-1]}"
    return (
        f"No se puede eliminar este insumo porque tiene {lista} asociadas. "
        "Esas relaciones deben resolverse antes de eliminarlo."
    )


def motivo_cotizacion_ganadora(es_ganadora: bool, lineas_asignadas: bool, *, solo_adjunto: bool = False) -> Optional[str]:
    if es_ganadora and lineas_asignadas:
        return MOTIVO_ADJUNTO_GANADORA if solo_adjunto else MOTIVO_COTIZACION_GANADORA
    return None


def registro_completo(row: Any) -> Any:
    """Copia serializable del registro para el log. Omite bytes."""
    if isinstance(row, dict):
        out = {}
        for key, value in row.items():
            if isinstance(value, (bytes, bytearray)):
                continue
            out[key] = registro_completo(value)
        return out
    if isinstance(row, list):
        return [registro_completo(item) for item in row]
    return row
