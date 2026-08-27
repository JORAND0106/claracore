/**
 * Tabla estructurada de Actividades del Reporte de Evento
 * (independiente del editor TipTap / tabla libre).
 */

export function emptyActividadRow() {
  return {
    actividad: '',
    abs_inicio: '',
    abs_fin: '',
    ubicacion_pk: '',
    ubicacion_pk_id: null,
    ubicacion_tramo: '',
    ubicacion_costado: '',
    ubicacion_infraestructura: '',
    ubicacion_lat: null,
    ubicacion_lng: null,
    cantidad: '',
    observacion: '',
  }
}

function rowFromApi(a) {
  if (!a || typeof a !== 'object') return emptyActividadRow()
  return {
    ...emptyActividadRow(),
    actividad: String(a.actividad || '').trim(),
    abs_inicio: String(a.abs_inicio || a.abs_ini || '').trim(),
    abs_fin: String(a.abs_fin || '').trim(),
    ubicacion_pk: String(a.ubicacion_pk || a.pk_label || a.pk || '').trim(),
    ubicacion_pk_id: a.ubicacion_pk_id != null && a.ubicacion_pk_id !== ''
      ? a.ubicacion_pk_id
      : (a.pk_id_id != null ? a.pk_id_id : null),
    ubicacion_tramo: String(a.ubicacion_tramo || a.tramo || '').trim(),
    ubicacion_costado: String(a.ubicacion_costado || a.costado || a.calzada || '').trim(),
    ubicacion_infraestructura: String(a.ubicacion_infraestructura || a.infraestructura || '').trim(),
    ubicacion_lat: a.ubicacion_lat != null && a.ubicacion_lat !== '' ? Number(a.ubicacion_lat) : null,
    ubicacion_lng: a.ubicacion_lng != null && a.ubicacion_lng !== '' ? Number(a.ubicacion_lng) : null,
    cantidad: a.cantidad != null && a.cantidad !== '' ? String(a.cantidad) : '',
    observacion: String(a.observacion || a.observaciones || '').trim(),
  }
}

function rowHasContent(row) {
  if (!row) return false
  return Boolean(
    String(row.actividad || '').trim()
    || String(row.abs_inicio || '').trim()
    || String(row.abs_fin || '').trim()
    || String(row.ubicacion_pk || '').trim()
    || row.ubicacion_pk_id != null
    || String(row.cantidad || '').trim()
    || String(row.observacion || '').trim(),
  )
}

/** Filas para la grilla (al menos una vacía). */
export function actividadesFromDetalle(detalle) {
  if (!detalle || typeof detalle !== 'object') return [emptyActividadRow()]
  const lista = detalle.actividades
  if (!Array.isArray(lista) || !lista.length) return [emptyActividadRow()]
  const rows = lista.map(rowFromApi).filter(rowHasContent)
  return rows.length ? rows : [emptyActividadRow()]
}

/** Payload a persistir (sin filas vacías). */
export function actividadesParaPayload(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map(rowFromApi).filter(rowHasContent).map((r) => ({
    actividad: r.actividad,
    abs_inicio: r.abs_inicio,
    abs_fin: r.abs_fin,
    ubicacion_pk: r.ubicacion_pk || null,
    ubicacion_pk_id: r.ubicacion_pk_id,
    ubicacion_tramo: r.ubicacion_tramo || null,
    ubicacion_costado: r.ubicacion_costado || null,
    ubicacion_infraestructura: r.ubicacion_infraestructura || null,
    ubicacion_lat: Number.isFinite(r.ubicacion_lat) ? r.ubicacion_lat : null,
    ubicacion_lng: Number.isFinite(r.ubicacion_lng) ? r.ubicacion_lng : null,
    cantidad: r.cantidad,
    observacion: r.observacion,
  }))
}

/** Filas con contenido (Libro Digital / PDF). */
export function actividadesConRegistro(detalleOrRows) {
  const rows = Array.isArray(detalleOrRows)
    ? detalleOrRows
    : (detalleOrRows && typeof detalleOrRows === 'object'
      ? detalleOrRows.actividades
      : null)
  if (!Array.isArray(rows)) return []
  return rows.map(rowFromApi).filter(rowHasContent)
}

/** Etiqueta visible de ubicación: Tramo · Infraestructura (pk_id queda solo en datos). */
export function formatUbicacionActividad(row) {
  if (!row) return ''
  const tramo = String(row.ubicacion_tramo || '').trim()
  const infra = String(row.ubicacion_infraestructura || '').trim()
  if (tramo || infra) {
    return [tramo, infra].filter(Boolean).join(' · ')
  }
  return ''
}

export function actividadRowCells(a) {
  const row = rowFromApi(a)
  return {
    actividad: row.actividad || '—',
    abs_inicio: row.abs_inicio || '—',
    abs_fin: row.abs_fin || '—',
    ubicacion: formatUbicacionActividad(row) || '—',
    cantidad: row.cantidad || '—',
    observacion: row.observacion || '—',
  }
}
