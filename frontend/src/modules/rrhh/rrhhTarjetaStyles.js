/**
 * Paleta de tarjetas contratista — alineada a tokens ClaraCore (#0077B6 / cyan).
 * Variaciones armónicas de la misma familia azul; asignación estable por clave.
 */

export const RRHH_TARJETA_PASTEL = [
  { bg: '#E0F2FE', border: '#7DD3FC', accent: '#0077B6', text: '#0F2942' },
  { bg: '#ECFEFF', border: '#67E8F9', accent: '#0891B2', text: '#164E63' },
  { bg: '#F0F9FF', border: '#BAE6FD', accent: '#0284C7', text: '#0C4A6E' },
  { bg: '#E0F7FA', border: '#80DEEA', accent: '#00B4C6', text: '#0F2942' },
  { bg: '#EFF6FF', border: '#93C5FD', accent: '#2563EB', text: '#1E3A5F' },
  { bg: '#F0FDFA', border: '#99F6E4', accent: '#0E7490', text: '#134E4A' },
  { bg: '#F8FAFC', border: '#CBD5E1', accent: '#0369A1', text: '#0F2942' },
  { bg: '#E8F4FC', border: '#A5D8F3', accent: '#0077B6', text: '#0F2942' },
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
