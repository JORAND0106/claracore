/**
 * Criterio de adaptación móvil de las grillas Excel del Reporte Diario.
 * En compacto: Personal pasa a lista Cargo|Cant; Maquinaria/Materiales a cards apiladas.
 * En escritorio se mantiene la grilla de una sola línea.
 *
 * Contraste móvil (CSS `.cc-bitacora-entrada--compact .cc-bitacora-responsive-table`):
 * bordes #94a3b8 y etiquetas primary/800 — mismo criterio que encabezados de escritorio.
 */
export function debeUsarGrillaDiarioCompacta(viewportCompact) {
  return !!viewportCompact
}

/** Etiquetas de columna para el modo card (data-label) de Maquinaria. */
export const MAQUINARIA_DATA_LABELS = [
  'Equipo / máquina',
  'Operador',
  'Cant.',
  'Hora inicio',
  'Hora fin',
  'Hora interm.',
  'Preop.',
  '',
]

/** Etiquetas de columna para el modo card (data-label) de Materiales. */
export const MATERIALES_DATA_LABELS = [
  'Movimiento',
  'Tipo de material',
  'Proveedor',
  'Cant.',
  'Nº vale(s)',
  'Remisión',
  'PK',
  '',
]
