/**
 * Validación cliente de edición de cantidad de salida.
 * El backend vuelve a validar; esto solo evita round-trips inútiles.
 */

export function validateCantidadSalidaEdit({
  cantidadNueva,
  cantidadActual,
  cantidadDevuelta = 0,
  disponibleLinea = null,
}) {
  const nueva = Number(cantidadNueva)
  const actual = Number(cantidadActual) || 0
  const devuelta = Math.max(0, Number(cantidadDevuelta) || 0)

  if (!Number.isFinite(nueva) || nueva <= 0) {
    return { ok: false, message: 'Indique una cantidad de salida mayor a cero.' }
  }
  if (nueva + 1e-9 < devuelta) {
    return {
      ok: false,
      message: `La cantidad no puede ser menor a lo ya devuelto (${devuelta}).`,
    }
  }
  if (disponibleLinea != null && Number.isFinite(Number(disponibleLinea))) {
    const maxPermitido = Math.round((Number(disponibleLinea) + actual) * 10000) / 10000
    if (nueva > maxPermitido + 1e-9) {
      return {
        ok: false,
        message: `La cantidad supera lo disponible en la línea de entrada. Máximo: ${maxPermitido}.`,
      }
    }
  }
  return { ok: true, cantidad: nueva }
}

export function puedeEditarCantidadSalidaPorPermisos(permisos) {
  return Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
}
