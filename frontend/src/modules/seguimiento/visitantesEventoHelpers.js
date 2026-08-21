/** Helpers de asistentes / visitantes para Reporte de Evento (sin React). */

export function emptyVisitanteRow() {
  return { visitante_id: null, usuario_id: null, nombre: '', cargo: '', origen: null }
}

export function nombreCompletoUsuario(u) {
  if (!u) return ''
  return `${u.nombre || ''} ${u.apellidos || ''}`.trim() || u.email || (u.id != null ? `#${u.id}` : '')
}

function normKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Combina usuarios de plataforma (prioridad) + catálogo reutilizable.
 * Dedup por nombre normalizado: si hay usuario plataforma, se omite el del catálogo.
 *
 * @returns {Array<{ key, origen, id, usuario_id, visitante_id, nombre, cargo, labelOrigen }>}
 */
export function mergeAsistentesSearch(usuarios = [], catalogo = [], q = '') {
  const needle = normKey(q)
  const platform = []
  const seen = new Set()

  for (const u of usuarios || []) {
    if (!u || u.es_externo) continue // solo cuentas ClaraCore activas del contrato
    if (u.activo === false) continue
    const nombre = nombreCompletoUsuario(u)
    if (!nombre) continue
    const cargo = String(u.cargo_nombre || u.cargo || '').trim()
    const haystack = `${nombre} ${cargo} ${u.email || ''}`.toLowerCase()
    if (needle && !haystack.includes(needle)) continue
    const key = normKey(nombre)
    if (seen.has(key)) continue
    seen.add(key)
    platform.push({
      key: `u-${u.id}`,
      origen: 'plataforma',
      labelOrigen: 'Usuario',
      id: u.id,
      usuario_id: u.id,
      visitante_id: null,
      nombre,
      cargo,
    })
  }

  const catalog = []
  for (const c of catalogo || []) {
    if (!c) continue
    const nombre = String(c.nombre || '').trim()
    if (!nombre) continue
    const key = normKey(nombre)
    if (seen.has(key)) continue // ya cubierto por usuario plataforma
    const cargo = String(c.cargo || '').trim()
    const haystack = `${nombre} ${cargo}`.toLowerCase()
    if (needle && !haystack.includes(needle)) continue
    seen.add(key)
    catalog.push({
      key: `v-${c.id}`,
      origen: 'catalogo',
      labelOrigen: 'Catálogo',
      id: c.id,
      usuario_id: null,
      visitante_id: c.id,
      nombre,
      cargo,
    })
  }

  // Plataforma primero, luego catálogo (ambos ya filtrados).
  const out = [...platform, ...catalog]
  if (!needle) return out.slice(0, 40)
  return out.slice(0, 40)
}

/**
 * Normaliza visitantes_lista o texto legacy a filas de grilla.
 */
export function visitantesFromDetalle(detalle) {
  if (!detalle || typeof detalle !== 'object') return [emptyVisitanteRow()]
  const lista = detalle.visitantes_lista
  if (Array.isArray(lista) && lista.length) {
    const rows = lista.map((v) => ({
      visitante_id: v?.visitante_id ?? (v?.origen === 'catalogo' ? v?.id : null) ?? null,
      usuario_id: v?.usuario_id ?? (v?.origen === 'plataforma' ? v?.id : null) ?? null,
      nombre: String(v?.nombre || '').trim(),
      cargo: String(v?.cargo || '').trim(),
      origen: v?.origen || (v?.usuario_id ? 'plataforma' : (v?.visitante_id ? 'catalogo' : null)),
    })).filter((v) => v.nombre)
    return rows.length ? rows : [emptyVisitanteRow()]
  }
  const texto = String(detalle.visitantes || '').trim()
  if (!texto) return [emptyVisitanteRow()]
  const rows = texto.split(/[,;\n]+/).map((part) => {
    const p = part.trim()
    if (!p) return null
    const m = p.match(/^(.+?)\s*\(([^)]*)\)\s*$/)
    if (m) {
      return {
        visitante_id: null, usuario_id: null,
        nombre: m[1].trim(), cargo: m[2].trim(), origen: null,
      }
    }
    return {
      visitante_id: null, usuario_id: null, nombre: p, cargo: '', origen: null,
    }
  }).filter(Boolean)
  return rows.length ? rows : [emptyVisitanteRow()]
}
