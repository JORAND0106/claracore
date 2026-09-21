/**
 * Helpers FE para reportes SICOE originados en planilla de tubería.
 */
export const PLANILLA_TUBERIA_ORIGEN_PREFIX = 'claracore:planilla-tuberia:'

export function planillaIdDesdeEnlaceSoporte(raw) {
  const items = []
  if (raw == null || raw === '') return null
  if (Array.isArray(raw)) {
    items.push(...raw.map(String))
  } else if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.startsWith('[')) {
      try {
        const p = JSON.parse(s)
        if (Array.isArray(p)) items.push(...p.map(String))
        else items.push(s)
      } catch {
        items.push(s)
      }
    } else {
      items.push(s)
    }
  }
  for (const it of items) {
    if (String(it).startsWith(PLANILLA_TUBERIA_ORIGEN_PREFIX)) {
      const id = String(it).slice(PLANILLA_TUBERIA_ORIGEN_PREFIX.length).trim()
      if (id) return id
    }
  }
  return null
}
