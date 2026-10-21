/**
 * Tipografía de tablas PNG (memoria, despiece, coordenadas) para que,
 * al insertarse en formatos/documentos (object-fit), el texto quede al
 * menos del tamaño del cuerpo del documento — sin achicar el dibujo.
 *
 * «Compacto» en documentos ≠ reducir la letra.
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
