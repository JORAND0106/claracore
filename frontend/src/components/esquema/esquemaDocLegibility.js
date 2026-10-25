/**
 * Tipografía de tablas PNG (memoria, despiece, coordenadas) para que,
 * al insertarse en formatos/documentos (object-fit), el texto quede al
 * menos del tamaño del cuerpo del documento — sin achicar el dibujo.
 *
 * Norma medible (C-OUT-08): altura de letra de celdas ≥ imageWidth / 55.
 */

/** Factor ≈ ×2 respecto a la tipografía histórica de las tablas PNG. */
export const ESQUEMA_DOC_TYPE_SCALE = 2

/**
 * Tamaño mínimo deseado del texto de tabla (px CSS) tras object-fit:contain
 * cuando la imagen ocupa el ancho útil de la página (~cuerpo del documento).
 */
export const ESQUEMA_DOC_MIN_SCREEN_PX = 11

/**
 * Ancho útil típico de página en formatos (px CSS) — la imagen puede
 * ocupar todo el ancho (concepto: legible en el documento).
 */
export const ESQUEMA_DOC_CONTAINER_W = 600

/** Alto útil de referencia en página para object-fit:contain (px CSS). */
export const ESQUEMA_DOC_CONTAINER_H = 800

/**
 * Slot histórico FO-EO-04 (~plano/esquema). Se conserva para no romper
 * métricas auxiliares; la meta de legibilidad usa el contenedor de página.
 */
export const ESQUEMA_FO_EO_SLOT_H = 240
export const ESQUEMA_FO_EO_SLOT_W = 380

/**
 * Fracción mínima de altura de letra de celdas respecto al ancho de la imagen.
 * Celdas ≥ imageWidth / 55; encabezados > celdas; título > encabezados.
 */
export const ESQUEMA_DOC_MIN_FONT_FRAC = 1 / 55

/**
 * Altura mínima de letra de celda (px de imagen) para un ancho dado.
 * @param {number} imageWidthPx
 * @returns {number}
 */
export function esquemaMinCellFontPx(imageWidthPx) {
  const w = Number(imageWidthPx)
  if (!Number.isFinite(w) || w <= 0) return 12
  return Math.max(1, w * ESQUEMA_DOC_MIN_FONT_FRAC)
}

/**
 * Escala tipográfica jerárquica a partir del piso de celdas.
 * @param {number} imageWidthPx
 * @param {{ cellPx?: number }} [opts]
 * @returns {{ cellPx: number, headerPx: number, titlePx: number, totalPx: number }}
 */
export function esquemaDocFontHierarchy(imageWidthPx, opts = {}) {
  const cellPx = Math.max(
    esquemaMinCellFontPx(imageWidthPx),
    Number(opts.cellPx) || 0,
  )
  return {
    cellPx,
    headerPx: Math.round(cellPx * 1.18),
    titlePx: Math.round(cellPx * 1.45),
    totalPx: Math.round(cellPx * 1.28),
  }
}

/**
 * Asegura que un font px propuesto respete el piso 1/55 del ancho.
 * @param {number} proposedPx
 * @param {number} imageWidthPx
 */
export function enforceEsquemaMinFontPx(proposedPx, imageWidthPx) {
  const p = Number(proposedPx)
  const floor = esquemaMinCellFontPx(imageWidthPx)
  if (!Number.isFinite(p)) return floor
  return Math.max(p, floor)
}
