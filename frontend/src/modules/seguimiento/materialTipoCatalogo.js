/**
 * Catálogo propio de Bitácora de Obra para «Tipo de material».
 * Independiente del catálogo de insumos de Almacén: no mezclar ni consultar Almacén.
 */

export function normTipoMaterialNombre(nombre) {
  return String(nombre || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Normaliza respuesta de GET tipos-material (array o envoltorio). */
export function normalizeTiposMaterialRows(raw) {
  if (Array.isArray(raw)) return raw.filter((r) => r && (r.nombre || r.id != null))
  if (raw && Array.isArray(raw.data)) {
    return raw.data.filter((r) => r && (r.nombre || r.id != null))
  }
  if (raw && Array.isArray(raw.items)) {
    return raw.items.filter((r) => r && (r.nombre || r.id != null))
  }
  return []
}

/** Filtra sugerencias del catálogo Bitácora (solo por nombre). */
export function filtrarTiposMaterial(opts, needle) {
  const n = normTipoMaterialNombre(needle)
  const list = Array.isArray(opts) ? opts : []
  if (!n) return list
  return list.filter((o) => normTipoMaterialNombre(o?.nombre).includes(n))
}

/**
 * Decide qué hacer con el valor tipado al blur del campo Tipo de material.
 * Si no hay match en catálogo, siempre se registra (upsert idempotente).
 * No se omite por igualdad con `value`: con propagación en vivo al tipear,
 * value ya coincide con el draft y eso no implica que esté en catálogo.
 */
export function debeRegistrarTipoMaterialNuevo(q, _value, opts = []) {
  const needle = String(q || '').trim()
  if (!needle) return { action: 'clear' }
  const match = (opts || []).find(
    (o) => normTipoMaterialNombre(o.nombre) === normTipoMaterialNombre(needle),
  )
  if (match) return { action: 'pick', row: match }
  return { action: 'register', nombre: needle }
}

/** Fusiona filas del catálogo por nombre_norm (conserva la primera con id). */
export function mergeTiposMaterialOpts(prev, incoming) {
  const map = new Map()
  for (const row of [...(prev || []), ...(incoming || [])]) {
    if (!row || !row.nombre) continue
    const key = normTipoMaterialNombre(row.nombre)
    if (!key) continue
    const prevRow = map.get(key)
    if (!prevRow || (row.id != null && prevRow.id == null)) map.set(key, row)
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }),
  )
}
