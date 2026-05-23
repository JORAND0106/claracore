/** Saludos dinámicos según hora en Colombia (America/Bogota). */

export function horaColombia() {
  const h = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  const n = parseInt(h, 10)
  return Number.isFinite(n) ? n : new Date().getHours()
}

const SALUDOS = {
  madrugada: [
    'Buenas madrugadas, {nombre}.',
    '¡Hola, {nombre}!',
    'Hola, {nombre}.',
  ],
  manana: [
    '¡Buenos días, {nombre}!',
    'Buenos días, {nombre}.',
    'Hola, {nombre}.',
  ],
  mediodia: [
    '¡Buen mediodía, {nombre}!',
    'Hola, {nombre}.',
    'Buenos días, {nombre}.',
  ],
  tarde: [
    '¡Buenas tardes, {nombre}!',
    'Buenas tardes, {nombre}.',
    'Hola, {nombre}.',
  ],
  noche: [
    '¡Buenas noches, {nombre}!',
    'Buenas noches, {nombre}.',
    'Hola, {nombre}.',
  ],
}

function franjaDesdeHora(h) {
  if (h >= 0 && h <= 5) return 'madrugada'
  if (h <= 11) return 'manana'
  if (h <= 13) return 'mediodia'
  if (h <= 18) return 'tarde'
  return 'noche'
}

export function eligeSaludoInicio(nombre = '') {
  const n = (nombre || 'colega').trim() || 'colega'
  const franja = franjaDesdeHora(horaColombia())
  const pool = SALUDOS[franja] || SALUDOS.tarde
  const plantilla = pool[Math.floor(Math.random() * pool.length)]
  return plantilla.replace(/\{nombre\}/g, n)
}
