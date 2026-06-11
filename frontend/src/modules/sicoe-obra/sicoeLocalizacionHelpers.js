/** Estado de localización reutilizable (wizard + hoja de registro). */
export function sicoeLocVacia() {
  return {
    pk_id_id: null,
    pkSeleccionado: null,
    margen: '',
    absInicio: '',
    absFinal: '',
    nodoIni: '',
    nodoFin: '',
    coordLat: null,
    coordLng: null,
  }
}

/** Fila maestro PK desde lista o campos ya guardados en el registro (detalle API). */
export function sicoePkRowFromRegistro(reg, pkIds = []) {
  const row =
    reg?.pk_id_id != null
      ? (pkIds || []).find((p) => String(p.id) === String(reg.pk_id_id))
      : null
  if (row) return row
  if (!reg) return null
  const pk_id = reg.pk_id_valor || reg.pk_id || null
  if (pk_id == null && reg.pk_id_id == null && !reg.civ) return null
  return {
    id: reg.pk_id_id,
    pk_id,
    civ: reg.civ,
    tramo: reg.tramo,
    infraestructura: reg.infraestructura,
    calzada: reg.calzada,
    ubicacion: reg.ubicacion,
    lat: reg.coord_lat,
    lng: reg.coord_lng,
  }
}

export function sicoeLocFromRegistro(reg, pkIds = []) {
  const pk = sicoePkRowFromRegistro(reg, pkIds)
  return {
    pk_id_id: reg?.pk_id_id ?? null,
    pkSeleccionado: pk || null,
    margen: reg?.margen || reg?.calzada || '',
    absInicio: reg?.abs_inicio ?? '',
    absFinal: reg?.abs_final ?? '',
    nodoIni: reg?.nodo_ini || '',
    nodoFin: reg?.nodo_fin || '',
    coordLat: reg?.coord_lat ?? null,
    coordLng: reg?.coord_lng ?? null,
  }
}

export function validarLocalizacion(loc, { requerido = true } = {}) {
  const errores = {}
  if (!requerido) return { ok: true, errores }
  if (!loc?.pkSeleccionado && loc?.pk_id_id == null) errores.pk = 'Requerido'
  if (!String(loc?.margen || '').trim()) errores.margen = 'Requerido'
  if (loc?.absInicio === '' || loc?.absInicio == null) errores.absInicio = 'Requerido'
  if (loc?.absFinal === '' || loc?.absFinal == null) errores.absFinal = 'Requerido'
  if (!String(loc?.nodoIni || '').trim()) errores.nodoIni = 'Requerido'
  if (!String(loc?.nodoFin || '').trim()) errores.nodoFin = 'Requerido'
  return { ok: Object.keys(errores).length === 0, errores }
}

/** Etiqueta corta para UI (PK + abscisas). */
export function fmtLocCorta(loc) {
  const pk = loc?.pkSeleccionado?.pk_id || (loc?.pk_id_id != null ? `PK #${loc.pk_id_id}` : '')
  const abs = loc?.absInicio != null && loc?.absInicio !== '' && loc?.absFinal != null && loc?.absFinal !== ''
    ? `${loc.absInicio} → ${loc.absFinal}`
    : ''
  return [pk, abs].filter(Boolean).join(' · ') || 'Sin definir'
}

/** Metros lineales: número (1820) o texto de plano «1+820.00». */
export function sicoeAbscisaAMetros(val) {
  if (val == null || val === '') return null
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const s = String(val).trim().replace(',', '.')
  const km = s.match(/^(\d+)\+(\d+(?:\.\d+)?)$/)
  if (km) return parseInt(km[1], 10) * 1000 + parseFloat(km[2])
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Punto representativo del tramo del registro (media de abscisas). */
export function sicoeAbscisaMediaRegistro(reg) {
  const a = sicoeAbscisaAMetros(reg?.abs_inicio ?? reg?.absInicio)
  const b = sicoeAbscisaAMetros(reg?.abs_final ?? reg?.absFinal)
  if (a != null && b != null) return (a + b) / 2
  if (a != null) return a
  if (b != null) return b
  return null
}

/**
 * Índice ordenado de puntos de abscisa del plano (features Point con etiqueta K+M).
 * @param {object} fc FeatureCollection normalizada
 */
export function sicoeIndiceAbscisasDesdePlano(fc) {
  const feats = fc?.features
  if (!Array.isArray(feats) || !feats.length) return []
  const out = []
  for (const f of feats) {
    const gt = f?.geometry?.type
    if (gt !== 'Point' && gt !== 'MultiPoint') continue
    const et = String(f?.properties?.etiqueta ?? f?.properties?.Etiqueta ?? '').trim()
    const m = sicoeAbscisaAMetros(et)
    if (m == null) continue
    const coords = f.geometry.coordinates
    const lng = gt === 'Point' ? coords?.[0] : coords?.[0]?.[0]
    const lat = gt === 'Point' ? coords?.[1] : coords?.[0]?.[1]
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    out.push({ m, lng, lat, etiqueta: et })
  }
  out.sort((a, b) => a.m - b.m)
  return out
}

/** Interpola lng/lat en el eje del plano para una abscisa en metros. */
export function sicoeLngLatInterpAbscisa(indice, metros) {
  if (!Array.isArray(indice) || !indice.length || metros == null || !Number.isFinite(metros)) return null
  if (metros <= indice[0].m) {
    return { lng: indice[0].lng, lat: indice[0].lat, aproximado: true, fuente: 'abscisa' }
  }
  const last = indice[indice.length - 1]
  if (metros >= last.m) {
    return { lng: last.lng, lat: last.lat, aproximado: true, fuente: 'abscisa' }
  }
  let lo = 0
  let hi = indice.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (indice[mid].m <= metros) lo = mid
    else hi = mid
  }
  const a = indice[lo]
  const b = indice[hi]
  if (a.m === b.m) {
    return { lng: a.lng, lat: a.lat, aproximado: true, fuente: 'abscisa' }
  }
  const t = (metros - a.m) / (b.m - a.m)
  return {
    lng: a.lng + t * (b.lng - a.lng),
    lat: a.lat + t * (b.lat - a.lat),
    aproximado: true,
    fuente: 'abscisa',
  }
}

function sicoeCoordLatDesdeLoc(loc) {
  if (loc?.coordLat != null && loc.coordLat !== '') return parseFloat(loc.coordLat)
  if (loc?.coord_lat != null && loc.coord_lat !== '') return parseFloat(loc.coord_lat)
  return null
}

function sicoeCoordLngDesdeLoc(loc) {
  if (loc?.coordLng != null && loc.coordLng !== '') return parseFloat(loc.coordLng)
  if (loc?.coord_lng != null && loc.coord_lng !== '') return parseFloat(loc.coord_lng)
  return null
}

export function localizacionToApiFields(loc) {
  const pk = loc?.pkSeleccionado
  const absIni = loc?.absInicio ?? loc?.abs_inicio
  const absFin = loc?.absFinal ?? loc?.abs_final
  const lat = sicoeCoordLatDesdeLoc(loc)
  const lng = sicoeCoordLngDesdeLoc(loc)
  return {
    pk_id_id: pk?.id ?? loc?.pk_id_id ?? null,
    civ: pk?.civ ?? loc?.civ ?? null,
    tramo: pk?.tramo ?? loc?.tramo ?? null,
    infraestructura: pk?.infraestructura ?? loc?.infraestructura ?? null,
    calzada: pk?.calzada ?? loc?.calzada ?? null,
    ubicacion: pk?.ubicacion ?? loc?.ubicacion ?? null,
    coord_lat: lat != null && !Number.isNaN(lat) ? lat : null,
    coord_lng: lng != null && !Number.isNaN(lng) ? lng : null,
    margen: loc?.margen || null,
    abs_inicio: absIni !== '' && absIni != null ? parseFloat(absIni) : null,
    abs_final: absFin !== '' && absFin != null ? parseFloat(absFin) : null,
    nodo_ini: loc?.nodoIni ?? loc?.nodo_ini ?? null,
    nodo_fin: loc?.nodoFin ?? loc?.nodo_fin ?? null,
  }
}

/** Copia campos de localización (incl. GPS) al estado de un registro del wizard. */
export function sicoeLocSpreadEnRegistro(loc) {
  const api = localizacionToApiFields(loc)
  return {
    pkSeleccionado: loc?.pkSeleccionado ?? null,
    pk_id_id: api.pk_id_id,
    civ: api.civ,
    tramo: api.tramo,
    infraestructura: api.infraestructura,
    calzada: api.calzada,
    ubicacion: api.ubicacion,
    coordLat: api.coord_lat,
    coordLng: api.coord_lng,
    margen: api.margen ?? '',
    absInicio: loc?.absInicio ?? loc?.abs_inicio ?? '',
    absFinal: loc?.absFinal ?? loc?.abs_final ?? '',
    nodoIni: loc?.nodoIni ?? loc?.nodo_ini ?? '',
    nodoFin: loc?.nodoFin ?? loc?.nodo_fin ?? '',
  }
}
