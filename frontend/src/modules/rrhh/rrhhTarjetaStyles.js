/**
 * Paleta pastel sincronizada para tarjetas de contratista (RRHH).
 * Colores armónicos (misma saturación/luminosidad); asignación estable por clave.
 */

export const RRHH_TARJETA_PASTEL = [
  { bg: '#E8F4F8', border: '#A8C9D8', accent: '#4A7C94', text: '#1E3A4A' },
  { bg: '#F0EAF6', border: '#C4B3D9', accent: '#6B5B8A', text: '#2E2440' },
  { bg: '#EAF6EE', border: '#A8D0B8', accent: '#4A8A62', text: '#1E3A2A' },
  { bg: '#F8F0E8', border: '#D8C0A8', accent: '#9A6B45', text: '#3A2A1E' },
  { bg: '#F6EAEF', border: '#D4A8BC', accent: '#8A4A66', text: '#3A1E2A' },
  { bg: '#EEF2F8', border: '#B0BDD4', accent: '#4A5F8A', text: '#1E2840' },
  { bg: '#F4F6EA', border: '#C8D0A0', accent: '#6B7A3A', text: '#2E3418' },
  { bg: '#F8ECEC', border: '#D8B0B0', accent: '#8A4A4A', text: '#3A1E1E' },
]

export function pastelIndexFromKey(key) {
  const s = String(key || 'x')
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h) % RRHH_TARJETA_PASTEL.length
}

export function pastelForEmpresa(empresaKey) {
  return RRHH_TARJETA_PASTEL[pastelIndexFromKey(empresaKey)]
}
