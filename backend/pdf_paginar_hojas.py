"""Paginación confiable de PDFs institucionales (carta landscape).

Causa del hueco injustificado en horas extras:
- Se insertaba ``page-break-before:always`` al superar N filas de cuerpo.
- xhtml2pdf además ignora ``page-break-before:avoid`` entre grilla y firmas.

Solución: una hoja HTML por página física (sin saltos CSS), empaque por altura
con verificación de 1 página/parte, y fusión de PDFs.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

PAGE_H_PT = 612.0
PAGE_W_PT = 792.0
MARGIN_PT = 5.67  # 2 mm
INNER_H_PT = PAGE_H_PT - 2 * MARGIN_PT

# Estimación inicial HE (si desborda, se recorta con binaria solo en ese lote)
HE_HDR_META_PT = 100.0
HE_THEAD_PT = 18.0
HE_ROW_PT = 10.6
HE_CLOSING_PT = 64.0

PRES_HDR_META_PT = 92.0
PRES_THEAD_PT = 16.0
PRES_ROW_PT = 9.5
PRES_BLOQUE_LBL_PT = 10.0


@dataclass(frozen=True)
class HojaEmpaque:
    inicio: int
    fin: int
    con_encabezado: bool
    con_cierre: bool


def empacar_filas(
    n_filas: int,
    *,
    overhead_primera_pt: float,
    overhead_cont_pt: float,
    fila_pt: float,
    cierre_pt: float,
    inner_h_pt: float = INNER_H_PT,
) -> List[HojaEmpaque]:
    if n_filas < 0:
        raise ValueError("n_filas")
    if n_filas == 0:
        return [HojaEmpaque(0, 0, True, True)]

    hojas: List[HojaEmpaque] = []
    i = 0
    primera = True
    while i < n_filas:
        overhead = overhead_primera_pt if primera else overhead_cont_pt
        capacidad = max(0.0, inner_h_pt - overhead)
        quedan = n_filas - i

        if quedan * fila_pt + cierre_pt <= capacidad + 1e-6:
            hojas.append(HojaEmpaque(i, n_filas, primera, True))
            return hojas

        max_filas = int(capacidad // fila_pt) if fila_pt > 0 else quedan
        if max_filas <= 0:
            max_filas = 1
        tomar = min(max_filas, quedan)

        if i + tomar >= n_filas:
            max_con = int((capacidad - cierre_pt) // fila_pt) if fila_pt > 0 else 0
            if max_con <= 0:
                tomar = max(1, min(tomar, quedan - 1)) if quedan > 1 else 1
                hojas.append(HojaEmpaque(i, i + tomar, primera, False))
                i += tomar
                primera = False
                continue
            tomar = max(1, min(tomar, max_con))
            hojas.append(HojaEmpaque(i, i + tomar, primera, True))
            return hojas

        hojas.append(HojaEmpaque(i, i + tomar, primera, False))
        i += tomar
        primera = False

    if not hojas or not hojas[-1].con_cierre:
        hojas.append(HojaEmpaque(n_filas, n_filas, False, True))
    return hojas


def merge_pdf_bytes(partes: Sequence[bytes]) -> bytes:
    from pypdf import PdfReader, PdfWriter

    if not partes:
        raise ValueError("sin partes PDF")
    if len(partes) == 1:
        return partes[0]
    writer = PdfWriter()
    for raw in partes:
        if not raw:
            continue
        reader = PdfReader(io.BytesIO(raw))
        for page in reader.pages:
            writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def pdf_num_paginas(raw: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(raw)).pages)


def render_hojas_sin_desborde(
    armar_html: Callable[..., str],
    n_filas: int,
    *,
    render_pdf: Callable[[str], bytes],
    overhead_primera_pt: float,
    overhead_cont_pt: float,
    fila_pt: float,
    cierre_pt: float,
) -> List[bytes]:
    """
    Plan por estimación + 1 render/hoja. Solo si desborda, binaria en ese lote
    y se continúa desde el nuevo ``fin`` (pocos probes → <10 s).
    """
    if n_filas < 0:
        raise ValueError("n_filas")

    def _probe(inicio: int, fin: int, con_enc: bool, con_cierre: bool) -> Tuple[bytes, int]:
        html = armar_html(
            inicio=inicio, fin=fin, con_encabezado=con_enc, con_cierre=con_cierre,
        )
        pdf = render_pdf(html)
        return pdf, pdf_num_paginas(pdf)

    def _binaria(inicio: int, hi_cap: int, con_enc: bool, con_cierre: bool) -> Tuple[bytes, int]:
        lo, hi = inicio + (0 if con_cierre else 1), hi_cap
        if lo > hi:
            lo = hi
        best_pdf, best_fin = None, inicio
        # asegurar cota inferior válida
        pdf0, n0 = _probe(inicio, min(max(lo, inicio), hi_cap), con_enc, con_cierre)
        if n0 <= 1:
            best_pdf, best_fin = pdf0, min(max(lo, inicio), hi_cap)
            lo = best_fin + 1
        elif not con_cierre:
            raise RuntimeError(f"una fila desborda (i={inicio})")
        else:
            pdf0, n0 = _probe(inicio, inicio, con_enc, True)
            if n0 > 1:
                raise RuntimeError("cierre desborda")
            return pdf0, inicio
        while lo <= hi:
            mid = (lo + hi) // 2
            pdf, npag = _probe(inicio, mid, con_enc, con_cierre)
            if npag <= 1:
                best_pdf, best_fin = pdf, mid
                lo = mid + 1
            else:
                hi = mid - 1
        assert best_pdf is not None
        return best_pdf, best_fin

    partes: List[bytes] = []
    i = 0
    primera = True
    fila_eff = float(fila_pt)

    while i <= n_filas:
        if i >= n_filas:
            # solo cierre (informe vacío o filas ya emitidas sin cierre)
            if partes and True:
                # Si la última parte ya trajo cierre, listo
                break
            pdf, npag = _probe(n_filas, n_filas, primera, True)
            if npag > 1:
                raise RuntimeError("cierre huérfano")
            partes.append(pdf)
            break

        quedan = n_filas - i
        overhead = overhead_primera_pt if primera else overhead_cont_pt
        capacidad = max(0.0, INNER_H_PT - overhead)

        # Estimación rápida del lote
        if quedan * fila_eff + cierre_pt <= capacidad + 1e-6:
            take, con_cierre = quedan, True
        else:
            max_sin = max(1, int(capacidad // fila_eff) if fila_eff > 0 else quedan)
            take = min(quedan, max_sin)
            if i + take >= n_filas:
                max_con = int((capacidad - cierre_pt) // fila_eff) if fila_eff > 0 else 0
                if max_con <= 0:
                    take = max(1, min(take, quedan - 1)) if quedan > 1 else 1
                    con_cierre = False
                else:
                    take = max(1, min(take, max_con))
                    con_cierre = (i + take) >= n_filas
            else:
                con_cierre = False

        fin = i + take
        pdf, npag = _probe(i, fin, primera, con_cierre)

        if npag > 1:
            if con_cierre:
                pdf, fin = _binaria(i, n_filas, primera, True)
                if fin >= n_filas:
                    partes.append(pdf)
                    return partes
                pdf, fin = _binaria(i, fin if fin > i else n_filas, primera, False)
                con_cierre = False
            else:
                pdf, fin = _binaria(i, fin, primera, False)
            fila_eff *= 1.05
        elif not con_cierre and fin < n_filas:
            # Estimación corta: crecer con binaria hasta el tope real
            pdf, fin = _binaria(i, n_filas, primera, False)

        partes.append(pdf)
        if con_cierre and fin >= n_filas:
            return partes
        if fin >= n_filas and not con_cierre:
            # falta cierre: buscar mín. k filas finales + cierre
            for k in range(1, n_filas - i + 1):
                pdf_k, np_k = _probe(n_filas - k, n_filas, False, True)
                if np_k <= 1:
                    corte = n_filas - k
                    # reemplazar última parte si cubría más allá de corte
                    if fin > corte:
                        partes.pop()
                        if corte > i:
                            pdf_prev, np_prev = _probe(i, corte, primera, False)
                            if np_prev > 1:
                                pdf_prev, corte = _binaria(i, corte, primera, False)
                            partes.append(pdf_prev)
                    partes.append(pdf_k)
                    return partes
            raise RuntimeError("cierre no cabe")
        i = fin
        primera = False

    return partes


def medir_hueco_inferior_px(png_path: str, *, blanco_min: float = 248.0) -> Tuple[int, int, int]:
    from PIL import Image
    import numpy as np

    arr = np.array(Image.open(png_path))
    h = int(arr.shape[0])

    def _blank(y: int) -> bool:
        return float(arr[y].mean()) >= blanco_min

    last = 0
    for y in range(h - 1, -1, -1):
        if not _blank(y):
            last = y
            break
    return h, last, h - 1 - last
