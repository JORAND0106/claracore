"""
Utilidades compartidas — PDF térmico POS 80 mm (Almacén).

xhtml2pdf exige `@page size` conocido de antemano; el alto se estima por
contenido de cada copia (con margen de seguridad) para evitar rollos fijos
de 200/220 mm que desperdician papel en impresoras térmicas.
"""
from __future__ import annotations

import io
from typing import Optional, Sequence, Tuple

PAGE_ANCHO_MM = 80
BODY_ANCHO_MM = 74

# Altos fijos legacy (antes del ajuste dinámico). Detectan blobs a regenerar.
LEGACY_COPIA_ALTO_ENTRADA_MM = 200
LEGACY_COPIA_ALTO_SALIDA_MM = 220

# Estimación base por copia (encabezado + campos estándar + cantidad + footer).
# Calibrado para que xhtml2pdf no desborde a 2.ª página en contenido típico.
_BASE_COPIA_MM = 148
_ADMIN_BLOCK_MM = 8
_ADMIN_LINE_MM = 5
_OBJETO_WRAP_MM = 4  # por cada ~45 chars extra del objeto
_OBS_MM = 10
_DEVOL_MM = 14
_FIRMAS_STACK_MM = 36  # dos firmas apiladas verticalmente
_PAD_MM = 14


def page_size_css(ancho_mm: int, alto_mm: int) -> str:
    return f"{int(ancho_mm)}mm {int(alto_mm)}mm"


def estimate_copia_alto_mm(
    *,
    objeto: str = "",
    n_admins: int = 0,
    has_obs: bool = False,
    has_devol: bool = False,
    has_firmas: bool = False,
) -> int:
    """Estima alto de una copia en mm (entero, con padding)."""
    h = float(_BASE_COPIA_MM)
    obj = (objeto or "").strip()
    if len(obj) > 45:
        h += _OBJETO_WRAP_MM * max(1, (len(obj) - 45 + 44) // 45)
    if n_admins > 0:
        h += _ADMIN_BLOCK_MM + n_admins * _ADMIN_LINE_MM
    if has_obs:
        h += _OBS_MM
    if has_devol:
        h += _DEVOL_MM
    if has_firmas:
        h += _FIRMAS_STACK_MM
    h += _PAD_MM
    return max(110, int(round(h)))


def page_height_mm(copias_altos: Sequence[int]) -> int:
    return int(sum(int(x) for x in copias_altos))


def mediabox_mm(pdf_bytes: bytes) -> Optional[Tuple[float, float]]:
    """Retorna (ancho_mm, alto_mm) de la primera página, o None si no se puede leer."""
    if not pdf_bytes:
        return None
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        if not reader.pages:
            return None
        mb = reader.pages[0].mediabox
        w = float(mb.width) * 25.4 / 72.0
        h = float(mb.height) * 25.4 / 72.0
        return (w, h)
    except Exception:
        return None


def needs_pos_regen(pdf_bytes: bytes) -> bool:
    """
    True si el blob no es un recibo POS 80 mm con alto dinámico.
    Detecta: ancho distinto de 80 mm, o altos fijos legacy (400/440/600 mm).
    """
    dims = mediabox_mm(pdf_bytes)
    if dims is None:
        return True
    w_mm, h_mm = dims
    if abs(w_mm - PAGE_ANCHO_MM) > 1.5:
        return True
    legacy_heights = {
        LEGACY_COPIA_ALTO_ENTRADA_MM * 2,  # recibo
        LEGACY_COPIA_ALTO_ENTRADA_MM * 3,  # disposición
        LEGACY_COPIA_ALTO_SALIDA_MM * 2,  # salida
    }
    for lh in legacy_heights:
        if abs(h_mm - lh) < 1.5:
            return True
    return False
