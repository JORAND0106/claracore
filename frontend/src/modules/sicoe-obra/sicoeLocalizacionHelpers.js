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

export function sicoeLocFromRegistro(reg, pkIds = []) {
  const pk = reg?.pk_id_id != null ? (pkIds || []).find((p) => p.id === reg.pk_id_id) : null
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

export function localizacionToApiFields(loc) {
  const pk = loc?.pkSeleccionado
  const absIni = loc?.absInicio
  const absFin = loc?.absFinal
  return {
    pk_id_id: pk?.id ?? loc?.pk_id_id ?? null,
    civ: pk?.civ ?? null,
    tramo: pk?.tramo ?? null,
    infraestructura: pk?.infraestructura ?? null,
    calzada: pk?.calzada ?? null,
    ubicacion: pk?.ubicacion ?? null,
    coord_lat: loc?.coordLat ?? null,
    coord_lng: loc?.coordLng ?? null,
    margen: loc?.margen || null,
    abs_inicio: absIni !== '' && absIni != null ? parseFloat(absIni) : null,
    abs_final: absFin !== '' && absFin != null ? parseFloat(absFin) : null,
    nodo_ini: loc?.nodoIni || null,
    nodo_fin: loc?.nodoFin || null,
  }
}
