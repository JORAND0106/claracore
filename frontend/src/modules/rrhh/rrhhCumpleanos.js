/** Etiquetas de mes (ES) para la tarjeta de cumpleaños RRHH. */

export const MESES_ES = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function nombreMesEs(mes) {
  const m = Number(mes)
  return MESES_ES[m] || ''
}
