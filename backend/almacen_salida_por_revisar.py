"""
Marca «por revisar» en salidas de Almacén (registro tablet sin bloqueos secundarios).
"""
from __future__ import annotations

from typing import Iterable, List, Optional

MOTIVO_SIN_SECTOR = "sin_sector"
MOTIVO_SIN_RECEPTOR = "sin_receptor"

MOTIVO_ETIQUETA = {
    MOTIVO_SIN_SECTOR: "Sin sector",
    MOTIVO_SIN_RECEPTOR: "Sin receptor",
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
    unidos = unir_motivos(motivos)
    return {
        "por_revisar": bool(unidos),
        "por_revisar_motivos": unidos or None,
    }
