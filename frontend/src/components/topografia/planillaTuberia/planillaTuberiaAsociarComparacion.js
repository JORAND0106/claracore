/**
 * Helpers de la tabla de comparación (ítems cobrados en el reporte SICOE)
 * del popup Asociar planilla → reporte.
 */
import {
  formatearCantidadTotal,
  formatearDimension,
} from '../../../modules/sicoe-obra/sicoeCantidadRedondeo.js'

/** Ancho actual del popup de asociar (antes del ensanche). */
export const ASOCIAR_POPUP_ANCHO_PREVIO_PX = 720

/** Doble del ancho previo — requisito UI. */
export const ASOCIAR_POPUP_ANCHO_PX = ASOCIAR_POPUP_ANCHO_PREVIO_PX * 2

/**
 * Normaliza registros del GET reporte SICOE para la tabla de comparación.
 * @param {unknown} data respuesta de `/sicoe-obra/{cid}/reportes/{id}?ligero=1`
 */
export function registrosComparacionDesdeReporte(data) {
  const regs = Array.isArray(data?.registros) ? data.registros : []
  return regs.map((r, idx) => {
    const item = String(r?.item_numero || r?.item || '').trim()
    const descItem = String(r?.item_descripcion || '').trim()
    const obs = String(r?.observacion || r?.observaciones || '').trim()
    let descripcion = descItem
    if (obs && descItem && obs !== descItem) descripcion = `${descItem} · ${obs}`
    else if (obs && !descItem) descripcion = obs
    return {
      key: String(r?.id ?? `idx-${idx}`),
      numero_registro: r?.numero_registro ?? null,
      item: item || '—',
      descripcion: descripcion || '—',
      unidad: String(r?.unidad || '').trim() || '—',
      longitud: formatearDimension(r?.longitud, { locale: false }),
      ancho: formatearDimension(r?.ancho, { locale: false }),
      espesor: formatearDimension(r?.espesor, { locale: false }),
      /** Cantidad cobrada (cantidad_total SICOE); redondeo dinámico 2/3 dec. */
      cantidad: formatearCantidadTotal(
        r?.cantidad_total != null ? r.cantidad_total : r?.cantidad,
        { locale: false },
      ),
    }
  })
}
