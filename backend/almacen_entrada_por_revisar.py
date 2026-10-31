"""
Marca «por revisar» en entradas de Almacén (registro tablet sin bloqueos).
"""
from __future__ import annotations

from typing import Iterable, List, Optional

# Códigos estables (API / log). Etiquetas cortas para UI.
MOTIVO_SIN_OC = "sin_oc"
MOTIVO_OC_CONSUMIDA = "oc_consumida"
MOTIVO_SUPERA_SALDO = "supera_saldo"
MOTIVO_PROVEEDOR_MANUAL = "proveedor_manual"
MOTIVO_SIN_FOTO = "sin_foto"
MOTIVO_VEHICULO_NUEVO = "vehiculo_nuevo"
MOTIVO_SIN_INSUMO = "sin_insumo"

MOTIVO_ETIQUETA = {
    MOTIVO_SIN_OC: "Sin orden de compra",
    MOTIVO_OC_CONSUMIDA: "OC sin saldo",
    MOTIVO_SUPERA_SALDO: "Supera saldo OC",
    MOTIVO_PROVEEDOR_MANUAL: "Proveedor a mano",
    MOTIVO_SIN_FOTO: "Sin foto",
    MOTIVO_VEHICULO_NUEVO: "Vehículo nuevo",
    MOTIVO_SIN_INSUMO: "Sin insumo",
}


def etiqueta_motivo(codigo: str) -> str:
    return MOTIVO_ETIQUETA.get(codigo, (codigo or "").strip() or "Por revisar")


def unir_motivos(codigos: Iterable[str]) -> str:
    seen = []
    for c in codigos or []:
        c = (c or "").strip()
        if not c or c in seen:
            continue
        seen.append(c)
    return " | ".join(etiqueta_motivo(c) for c in seen)


def parse_motivos(texto: Optional[str]) -> List[str]:
    if not texto:
        return []
    parts = [p.strip() for p in str(texto).split("|")]
    return [p for p in parts if p]


def patch_por_revisar(motivos: List[str]) -> dict:
    """Campos a persistir en almacen_entrada."""
    unidos = unir_motivos(motivos)
    return {
        "por_revisar": bool(unidos),
        "por_revisar_motivos": unidos or None,
    }
