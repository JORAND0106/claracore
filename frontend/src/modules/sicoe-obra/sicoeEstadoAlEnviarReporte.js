/**
 * Estado de cabecera al pulsar «Guardar y Enviar» en el wizard Nuevo reporte.
 *
 * Causa raíz (producción): con reporteInicial (borrador abierto desde grilla)
 * modoEdicion=true y se reenviaba el mismo estado «Borrador», así el botón
 * parecía ejecutarse pero el reporte no salía de borrador.
 */
export function sicoeEstadoAlEnviarReporte(estadoActual, { esEdicion = false } = {}) {
  if (!esEdicion) return 'Sin Asignar Ítem'
  const e = String(estadoActual || '').trim()
  if (!e || e === 'Borrador') return 'Sin Asignar Ítem'
  return e
}
