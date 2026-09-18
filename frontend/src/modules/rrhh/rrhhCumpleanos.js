/**
 * Cumpleaños del mes — helpers FE (plantillas, rotación, etiquetas).
 * Paleta alineada a ClaraCore (#0077B6 / cyan); decoración festiva como excepción visual.
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
    nombre: 'Azul ClaraCore',
    bg: 'linear-gradient(145deg, #E0F2FE 0%, #BAE6FD 55%, #7DD3FC 100%)',
    accent: '#0077B6',
    cardBg: '#FFFFFF',
    cardBorder: '#7DD3FC',
    text: '#0F2942',
    muted: '#4A7FA5',
    decor: ['🎊', '🎉', '🎂', '🎈', '✨', '🎁', '🌟'],
    decorExtra: ['🎀', '🥳', '🎈', '🎊', '✨'],
    btn: '#0077B6',
  },
  {
    id: 1,
    nombre: 'Cyan ClaraCore',
    bg: 'linear-gradient(145deg, #ECFEFF 0%, #CFFAFE 55%, #A5F3FC 100%)',
    accent: '#00B4C6',
    cardBg: '#FFFFFF',
    cardBorder: '#67E8F9',
    text: '#164E63',
    muted: '#0E7490',
    decor: ['🎈', '🎂', '🎊', '✨', '🎁', '🎉', '🌟'],
    decorExtra: ['🥳', '🎀', '🎈', '🎊', '✨'],
    btn: '#00B4C6',
  },
  {
    id: 2,
    nombre: 'Cielo ClaraCore',
    bg: 'linear-gradient(145deg, #F0F9FF 0%, #E0F2FE 55%, #BAE6FD 100%)',
    accent: '#0284C7',
    cardBg: '#FFFFFF',
    cardBorder: '#93C5FD',
    text: '#0C4A6E',
    muted: '#0369A1',
    decor: ['🎉', '✨', '🎂', '🎈', '🎊', '🎁', '🌟'],
    decorExtra: ['🥳', '🎀', '🎈', '🎊', '✨'],
    btn: '#0284C7',
  },
  {
    id: 3,
    nombre: 'Teal ClaraCore',
    bg: 'linear-gradient(145deg, #F0FDFA 0%, #CCFBF1 55%, #99F6E4 100%)',
    accent: '#0E7490',
    cardBg: '#FFFFFF',
    cardBorder: '#5EEAD4',
    text: '#134E4A',
    muted: '#0F766E',
    decor: ['🌟', '🎂', '🎁', '✨', '🎈', '🎊', '🎉'],
    decorExtra: ['🥳', '🎀', '🎈', '🎊', '✨'],
    btn: '#0E7490',
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

/** Mensaje FE de respaldo (el backend envía el mensaje con titular). */
export const MENSAJE_MOTIVACIONAL_DEFAULT =
  'En este mes celebramos a quienes hacen posible nuestro día a día. '
  + '¡Feliz cumpleaños! Gracias por su compromiso y por aportar su talento a nuestro equipo.'

/**
 * Construye mensaje con titular del contrato (misma lógica que backend).
 * @param {string} [titular]
 */
export function mensajeMotivacionalConTitular(titular) {
  const t = String(titular || '').trim()
  if (!t) return MENSAJE_MOTIVACIONAL_DEFAULT
  return (
    `${t} les desea a nuestros colaboradores un feliz cumpleaños. `
    + 'En este mes celebramos a quienes hacen posible nuestro día a día. '
    + 'Gracias por su compromiso y por aportar su talento a nuestro equipo.'
  )
}
