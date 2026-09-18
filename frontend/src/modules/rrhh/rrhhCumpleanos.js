/**
 * Cumpleaños del mes — helpers FE (plantillas, rotación, etiquetas).
 */

export const MESES_ES = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function nombreMesEs(mes) {
  const m = Number(mes)
  return MESES_ES[m] || ''
}

/** 4 plantillas festivas (deben coincidir con backend rrhh_cumpleanos_pdf). */
export const CUMPLE_PLANTILLAS = [
  {
    id: 0,
    nombre: 'Confeti coral',
    bg: 'linear-gradient(145deg, #FFF1F2 0%, #FFE4E6 55%, #FECDD3 100%)',
    accent: '#E11D48',
    cardBg: '#FFFFFF',
    cardBorder: '#FB7185',
    text: '#881337',
    muted: '#9F1239',
    decor: ['🎈', '🎉', '🎂', '🎊', '✨'],
    btn: '#E11D48',
  },
  {
    id: 1,
    nombre: 'Fiesta cyan',
    bg: 'linear-gradient(145deg, #ECFEFF 0%, #CFFAFE 55%, #A5F3FC 100%)',
    accent: '#0891B2',
    cardBg: '#FFFFFF',
    cardBorder: '#22D3EE',
    text: '#164E63',
    muted: '#155E75',
    decor: ['🎊', '🎈', '✨', '🎁', '🎂'],
    btn: '#0891B2',
  },
  {
    id: 2,
    nombre: 'Globos violeta',
    bg: 'linear-gradient(145deg, #F5F3FF 0%, #EDE9FE 55%, #DDD6FE 100%)',
    accent: '#7C3AED',
    cardBg: '#FFFFFF',
    cardBorder: '#A78BFA',
    text: '#4C1D95',
    muted: '#5B21B6',
    decor: ['🎈', '💜', '🎂', '🎉', '✨'],
    btn: '#7C3AED',
  },
  {
    id: 3,
    nombre: 'Sol dorado',
    bg: 'linear-gradient(145deg, #FFFBEB 0%, #FEF3C7 55%, #FDE68A 100%)',
    accent: '#D97706',
    cardBg: '#FFFFFF',
    cardBorder: '#FBBF24',
    text: '#78350F',
    muted: '#92400E',
    decor: ['🌟', '🎂', '🎁', '✨', '🎈'],
    btn: '#D97706',
  },
]

/**
 * Rotación cada 4 meses — misma fórmula que backend plantilla_cumpleanos_index.
 * @param {number} mes 1–12
 * @param {number} [anio]
 */
export function plantillaCumpleanosIndex(mes, anio) {
  const m = Number(mes)
  const y = Number(anio)
  if (!Number.isFinite(m) || m < 1 || m > 12) return 0
  const year = Number.isFinite(y) ? y : new Date().getFullYear()
  const slot = Math.floor((year * 12 + m - 1) / 4)
  return ((slot % 4) + 4) % 4
}

export function plantillaCumpleanosFromPayload(cumpleanos) {
  const id = cumpleanos?.plantilla_id
  if (id != null && Number.isFinite(Number(id))) {
    return CUMPLE_PLANTILLAS[Number(id) % 4]
  }
  const idx = plantillaCumpleanosIndex(cumpleanos?.mes, cumpleanos?.anio)
  return CUMPLE_PLANTILLAS[idx]
}

export const MENSAJE_MOTIVACIONAL_DEFAULT =
  'En este mes celebramos a quienes hacen posible nuestro día a día. '
  + '¡Feliz cumpleaños! Gracias por su compromiso y por aportar su talento a nuestro equipo.'
