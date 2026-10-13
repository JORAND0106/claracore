/**
 * Normalización de tipos de acta (builtins + personalizados).
 * Sin duplicados: casefold + sin tildes.
 */

export const TIPO_ACTA_BUILTIN = [
  { value: 'interna', label: 'Interna' },
  { value: 'externa', label: 'Externa' },
]

export const TIPO_ACTA_OTRO = '__otro__'

export function normTipoActaKey(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  try {
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
  } catch {
    return s.toLowerCase()
  }
}

export function isBuiltinTipoActa(value) {
  const k = normTipoActaKey(value)
  return k === 'interna' || k === 'externa'
}

/**
 * Gestión de obra (TAB + PDF) solo aplica a los tipos originales Interna/Externa.
 * Se decide por el tipo canónico, no por el texto del nombre.
 */
export function actaIncluyeGestionObra(tipoActa) {
  return isBuiltinTipoActa(tipoActa)
}

export function labelTipoActaValue(value, customTipos = []) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  const k = normTipoActaKey(raw)
  if (k === 'interna') return 'Interna'
  if (k === 'externa') return 'Externa'
  const hit = (Array.isArray(customTipos) ? customTipos : []).find(
    (t) => normTipoActaKey(t?.nombre || t?.value || t) === k,
  )
  if (hit) return String(hit.nombre || hit.value || hit).trim() || raw
  return raw
}

/** Opciones para <select>: builtins + custom + Otro (si includeOtro). */
export function buildTipoActaOptions(customTipos = [], { includeTodos = false, includeOtro = true } = {}) {
  const out = []
  if (includeTodos) out.push({ value: '', label: 'Todos' })
  for (const b of TIPO_ACTA_BUILTIN) out.push({ ...b })
  const seen = new Set(TIPO_ACTA_BUILTIN.map((b) => b.value))
  for (const t of Array.isArray(customTipos) ? customTipos : []) {
    const nombre = String(t?.nombre || t?.value || t || '').trim()
    if (!nombre) continue
    const key = normTipoActaKey(nombre)
    if (!key || seen.has(key) || key === 'interna' || key === 'externa') continue
    seen.add(key)
    out.push({ value: nombre, label: nombre })
  }
  if (includeOtro) out.push({ value: TIPO_ACTA_OTRO, label: 'Otro…' })
  return out
}
