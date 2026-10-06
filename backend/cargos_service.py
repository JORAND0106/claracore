"""
Helpers de validación para cargos (Gestión de Cargos).
El nombre vive en `cargos.nombre`; los usuarios referencian `cargo_id`.
"""
from __future__ import annotations

from typing import Iterable, Optional


def normalizar_nombre_cargo(nombre: Optional[str]) -> str:
    return " ".join(str(nombre or "").strip().split())


def validar_nombre_cargo(
    nombre: Optional[str],
    *,
    nombres_existentes: Iterable[str],
    cargo_id_excluir: Optional[int] = None,
    existentes_con_id: Optional[Iterable[tuple[int, str]]] = None,
) -> tuple[Optional[str], Optional[str]]:
    """
    Valida nombre de cargo (crear o renombrar).

    Returns:
        (nombre_normalizado, None) si OK
        (None, mensaje_error) si falla
    """
    limpio = normalizar_nombre_cargo(nombre)
    if not limpio:
        return None, "El nombre del cargo no puede quedar vacío."

    key = limpio.casefold()
    if existentes_con_id is not None:
        for cid, nom in existentes_con_id:
            if cargo_id_excluir is not None and int(cid) == int(cargo_id_excluir):
                continue
            if normalizar_nombre_cargo(nom).casefold() == key:
                return None, f'Ya existe un cargo llamado "{normalizar_nombre_cargo(nom)}".'
        return limpio, None

    for nom in nombres_existentes or []:
        if normalizar_nombre_cargo(nom).casefold() == key:
            return None, f'Ya existe un cargo llamado "{normalizar_nombre_cargo(nom)}".'
    return limpio, None
