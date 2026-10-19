/** Misma frase que backend/almacen_banco_suelto.py cuando aún no hay insumo. */
export const TEXTO_SALDO_SIN_INSUMO = (
  'Saldo sin conversión de banco a suelto: la línea aún no tiene insumo asignado. '
  + 'Se ajustará cuando se asigne el insumo.'
)

export function textoConversionPresupuesto(ctx) {
  return String(ctx?.texto_conversion || '').trim()
}
