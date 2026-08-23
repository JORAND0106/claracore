/**
 * Orden y armado de páginas del Libro Digital (Actas / Bitácora).
 * Solo lectura — no altera formularios ni reglas de negocio.
 */

/** @typedef {'acta'|'diario'|'evento'|'acta_bloqueada'|'vacia'} LibroPageKind */

/**
 * @param {object} row
 * @returns {boolean}
 */
export function actaEstaBloqueada(row) {
  return row?.puede_abrir === false || row?.acceso_restringido === true
}

/**
 * Actas: cronológico ascendente por fecha_reunion, luego consecutivo.
 * Incluye páginas bloqueadas (sin contenido) para respetar visibilidad.
 *
 * @param {object[]} actas
 * @returns {Array<{ kind: LibroPageKind, id: string, fecha: string, meta: object, data: object|null }>}
 */
export function buildActasPages(actas) {
  const rows = Array.isArray(actas) ? [...actas] : []
  rows.sort((a, b) => {
    const fa = String(a?.fecha_reunion || '').slice(0, 10)
    const fb = String(b?.fecha_reunion || '').slice(0, 10)
    if (fa !== fb) return fa.localeCompare(fb)
    const ca = Number(a?.consecutivo) || 0
    const cb = Number(b?.consecutivo) || 0
    if (ca !== cb) return ca - cb
    return Number(a?.id || 0) - Number(b?.id || 0)
  })
  return rows.map((a) => {
    const bloqueada = actaEstaBloqueada(a)
    return {
      kind: bloqueada ? 'acta_bloqueada' : 'acta',
      id: `acta-${a.id}`,
      fecha: String(a?.fecha_reunion || '').slice(0, 10),
      meta: {
        consecutivo: a?.consecutivo,
        tipo_acta: a?.tipo_acta,
        ubicacion: a?.ubicacion,
        elaborador_nombre: a?.elaborador_nombre,
        estado: a?.estado,
      },
      data: bloqueada ? null : a,
      sourceId: a?.id,
    }
  })
}

/**
 * Bitácora: fechas ascendentes; en cada día, Diario primero y luego Eventos
 * (por created_at / id).
 *
 * @param {object[]} entradas
 * @returns {Array<{ kind: LibroPageKind, id: string, fecha: string, meta: object, data: object }>}
 */
export function buildBitacoraPages(entradas) {
  const rows = Array.isArray(entradas) ? [...entradas] : []
  const byFecha = new Map()
  for (const row of rows) {
    const f = String(row?.fecha || '').slice(0, 10)
    if (!f) continue
    if (!byFecha.has(f)) byFecha.set(f, { diarios: [], eventos: [] })
    const bucket = byFecha.get(f)
    if (String(row?.tipo || '') === 'evento') bucket.eventos.push(row)
    else bucket.diarios.push(row)
  }

  const sortWithin = (list) => {
    list.sort((a, b) => {
      const ca = String(a?.created_at || '')
      const cb = String(b?.created_at || '')
      if (ca !== cb) return ca.localeCompare(cb)
      return Number(a?.id || 0) - Number(b?.id || 0)
    })
  }

  const fechas = [...byFecha.keys()].sort((a, b) => a.localeCompare(b))
  const pages = []
  for (const fecha of fechas) {
    const { diarios, eventos } = byFecha.get(fecha)
    sortWithin(diarios)
    sortWithin(eventos)
    for (const d of diarios) {
      pages.push({
        kind: 'diario',
        id: `diario-${d.id}`,
        fecha,
        meta: {
          estado: d?.estado,
          hora_inicio_labores: d?.hora_inicio_labores,
          created_by_nombre: d?.created_by_nombre,
        },
        data: d,
        sourceId: d?.id,
      })
    }
    for (const e of eventos) {
      pages.push({
        kind: 'evento',
        id: `evento-${e.id}`,
        fecha,
        meta: {
          evento_tipo: e?.evento_tipo,
          dirigido_a: e?.dirigido_a,
          created_by_nombre: e?.created_by_nombre,
        },
        data: e,
        sourceId: e?.id,
      })
    }
  }
  return pages
}

/**
 * Paleta del libro dentro de la familia azul/steel institucional (tema `t`).
 * @param {'actas'|'bitacora'} modo
 * @param {object} t
 */
export function libroPalette(modo, t) {
  const primary = t?.primary || '#0077B6'
  const border = t?.border || '#BAE6FD'
  const text = t?.text || '#0c4a6e'
  const textMuted = t?.textMuted || '#4A7FA5'
  const bg = t?.bg || '#F0F9FF'
  const bgCard = t?.bgCard || '#ffffff'

  if (modo === 'actas') {
    return {
      accent: `color-mix(in srgb, ${primary} 72%, #0c4a6e)`,
      accentSoft: `color-mix(in srgb, ${primary} 18%, ${bgCard})`,
      spine: `color-mix(in srgb, ${primary} 55%, #1e3a5f)`,
      pageBg: bgCard,
      pageEdge: `color-mix(in srgb, ${primary} 22%, ${border})`,
      headerBar: `linear-gradient(135deg, color-mix(in srgb, ${primary} 88%, #0c4a6e), color-mix(in srgb, ${primary} 55%, #0369a1))`,
      text,
      textMuted,
      border,
      bg,
      label: 'Actas',
    }
  }

  return {
    accent: primary,
    accentSoft: `color-mix(in srgb, ${primary} 14%, ${bgCard})`,
    spine: `color-mix(in srgb, ${primary} 70%, #164e63)`,
    pageBg: bgCard,
    pageEdge: `color-mix(in srgb, ${primary} 28%, ${border})`,
    headerBar: `linear-gradient(135deg, ${primary}, color-mix(in srgb, ${primary} 70%, #0891b2))`,
    text,
    textMuted,
    border,
    bg,
    label: 'Bitácora de Obra',
  }
}

export function personalConCantidad(personal) {
  return (Array.isArray(personal) ? personal : []).filter((p) => Number(p?.cantidad) > 0)
}

export function equiposConUso(equipos) {
  return (Array.isArray(equipos) ? equipos : []).filter((e) => {
    const nombre = String(e?.nombre || e?.equipo_nombre || e?.descripcion || '').trim()
    const cant = Number(e?.cantidad ?? e?.horas ?? 1)
    return Boolean(nombre) && (!Number.isFinite(cant) || cant > 0)
  })
}
