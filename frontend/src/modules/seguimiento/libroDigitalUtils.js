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
 * Bitácora unificada: una página por Reporte Diario (eventos embebidos en data.eventos).
 * Ignora filas legacy tipo=evento (ya consolidadas o fuera del hilo).
 *
 * @param {object[]} entradas
 * @returns {Array<{ kind: LibroPageKind, id: string, fecha: string, meta: object, data: object }>}
 */
export function buildBitacoraPages(entradas) {
  const rows = Array.isArray(entradas) ? [...entradas] : []
  const diarios = rows.filter((r) => {
    if (String(r?.tipo || '') === 'evento') return false
    return Boolean(String(r?.fecha || '').slice(0, 10))
  })
  diarios.sort((a, b) => {
    const fa = String(a?.fecha || '').slice(0, 10)
    const fb = String(b?.fecha || '').slice(0, 10)
    if (fa !== fb) return fa.localeCompare(fb)
    const ca = String(a?.created_at || '')
    const cb = String(b?.created_at || '')
    if (ca !== cb) return ca.localeCompare(cb)
    return Number(a?.id || 0) - Number(b?.id || 0)
  })
  return diarios.map((d) => {
    const fecha = String(d?.fecha || '').slice(0, 10)
    const nEv = Array.isArray(d?.eventos) ? d.eventos.length : 0
    return {
      kind: 'diario',
      id: `diario-${d.id}`,
      fecha,
      meta: {
        estado: d?.estado,
        hora_inicio_labores: d?.hora_inicio_labores,
        created_by_nombre: d?.created_by_nombre,
        eventos_count: nEv,
      },
      data: d,
      sourceId: d?.id,
    }
  })
}

/**
 * Índice de la primera página con la fecha indicada (YYYY-MM-DD).
 * Si no hay coincidencia exacta, salta a la primera fecha ≥ buscada;
 * si todas son anteriores, a la última página.
 * @param {Array<{ fecha?: string }>} pages
 * @param {string} fecha
 * @returns {number} índice ≥ 0, o -1 si no hay páginas
 */
export function findPageIndexByFecha(pages, fecha) {
  const list = Array.isArray(pages) ? pages : []
  if (!list.length) return -1
  const target = String(fecha || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return -1

  const exact = list.findIndex((p) => String(p?.fecha || '').slice(0, 10) === target)
  if (exact >= 0) return exact

  for (let i = 0; i < list.length; i += 1) {
    const pf = String(list[i]?.fecha || '').slice(0, 10)
    if (pf && pf >= target) return i
  }
  return list.length - 1
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
  const bgCard = t?.bgCard || '#f7fbff'

  if (modo === 'actas') {
    return {
      accent: `color-mix(in srgb, ${primary} 68%, #0b3a5c)`,
      accentSoft: `color-mix(in srgb, ${primary} 16%, ${bgCard})`,
      spine: `color-mix(in srgb, ${primary} 48%, #12324f)`,
      cover: `linear-gradient(155deg, color-mix(in srgb, ${primary} 82%, #0b3a5c) 0%, color-mix(in srgb, ${primary} 45%, #1e3a5f) 55%, #0f2740 100%)`,
      pageBg: bgCard,
      pageEdge: `color-mix(in srgb, ${primary} 22%, ${border})`,
      headerBar: `linear-gradient(135deg, color-mix(in srgb, ${primary} 88%, #0c4a6e), color-mix(in srgb, ${primary} 55%, #0369a1))`,
      text,
      textMuted,
      border,
      bg,
      label: 'Actas',
      shortLabel: 'Actas',
    }
  }

  return {
    accent: primary,
    accentSoft: `color-mix(in srgb, ${primary} 12%, ${bgCard})`,
    spine: `color-mix(in srgb, ${primary} 62%, #0f3d52)`,
    cover: `linear-gradient(155deg, ${primary} 0%, color-mix(in srgb, ${primary} 70%, #0e7490) 52%, #164e63 100%)`,
    pageBg: bgCard,
    pageEdge: `color-mix(in srgb, ${primary} 28%, ${border})`,
    headerBar: `linear-gradient(135deg, ${primary}, color-mix(in srgb, ${primary} 70%, #0891b2))`,
    text,
    textMuted,
    border,
    bg,
    label: 'Bitácora de Obra',
    shortLabel: 'Bitácora',
  }
}

export function personalConCantidad(personal) {
  return (Array.isArray(personal) ? personal : []).filter((p) => Number(p?.cantidad) > 0)
}

/**
 * Filas de maquinaria con equipo registrado (campo real: equipo_nombre).
 * @param {object[]} equipos
 */
export function equiposConUso(equipos) {
  return (Array.isArray(equipos) ? equipos : []).filter((e) => {
    const nombre = String(e?.equipo_nombre || e?.nombre || e?.descripcion || '').trim()
    if (!nombre) return false
    if (e?.cantidad === '' || e?.cantidad == null) return true
    const cant = Number(e.cantidad)
    return !Number.isFinite(cant) || cant > 0
  })
}

/**
 * Materiales del diario: el API usa tipo_material (no `tipo`/`nombre`).
 * Conserva filas con cualquier dato útil (proveedor, cantidad, PK, etc.).
 * @param {object[]} materiales
 */
export function materialesConRegistro(materiales) {
  return (Array.isArray(materiales) ? materiales : []).filter((m) => {
    if (!m || typeof m !== 'object') return false
    const tipo = String(m.tipo_material || m.tipo || m.nombre || m.descripcion || '').trim()
    const proveedor = String(m.proveedor || '').trim()
    const pk = String(m.ubicacion_pk || m.pk_label || m.pk || '').trim()
    const vale = String(m.numeros_vale || '').trim()
    const cant = Number(m.cantidad)
    const hasCant = Number.isFinite(cant) && cant > 0
    const hasAdj = Array.isArray(m.adjuntos) && m.adjuntos.length > 0
    return Boolean(tipo || proveedor || pk || vale || hasCant || hasAdj || m.ubicacion_pk_id != null)
  })
}

export function labelMovimientoMaterial(mov) {
  const m = String(mov || '').toLowerCase()
  if (m === 'salida') return 'Salida'
  return 'Ingreso'
}

/**
 * Normaliza el texto de número(s) de vale del diario (campo libre `numeros_vale`).
 * Conserva todos los valores; no trunca.
 * @param {object|string|null|undefined} m
 * @returns {string}
 */
export function formatNumerosVale(m) {
  const raw = typeof m === 'string' || typeof m === 'number'
    ? m
    : (m?.numeros_vale ?? m?.numero_vale ?? (typeof m?.vales === 'string' ? m.vales : ''))
  const text = String(raw ?? '').trim()
  if (!text) return ''
  // Separadores habituales en el placeholder «Ej. 101, 102»; se unifican para lectura.
  const parts = text
    .split(/[,;/\n]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return text
  return parts.join(', ')
}

/**
 * Celdas de una fila de material para la tabla del Libro digital.
 * Vale(s) y PK sin truncar.
 * @param {object} m
 * @returns {{ movimiento: string, tipo: string, proveedor: string, cantidad: string, vales: string, pk: string }}
 */
export function materialRowCells(m) {
  if (!m) {
    return {
      movimiento: '—',
      tipo: '—',
      proveedor: '—',
      cantidad: '—',
      vales: '—',
      pk: '—',
    }
  }
  const tipo = String(m.tipo_material || m.tipo || m.nombre || m.descripcion || '').trim()
  const proveedor = String(m.proveedor || '').trim()
  const cant = m.cantidad
  const cantidad = (cant != null && cant !== '' && Number(cant) !== 0)
    ? String(cant)
    : ''
  const vales = formatNumerosVale(m)
  const pk = String(m.ubicacion_pk || m.pk_label || m.pk || '').trim()
  return {
    movimiento: labelMovimientoMaterial(m.movimiento),
    tipo: tipo || '—',
    proveedor: proveedor || '—',
    cantidad: cantidad || '—',
    vales: vales || '—',
    pk: pk || '—',
  }
}

/**
 * Texto de lectura para una fila de material
 * (movimiento, tipo, proveedor, cant., vale(s), PK).
 * @param {object} m
 */
export function formatMaterialLine(m) {
  if (!m) return '—'
  const c = materialRowCells(m)
  const parts = [c.movimiento]
  if (c.tipo !== '—') parts.push(c.tipo)
  if (c.proveedor !== '—') parts.push(c.proveedor)
  if (c.cantidad !== '—') parts.push(c.cantidad)
  if (c.vales !== '—') parts.push(`Vale(s): ${c.vales}`)
  if (c.pk !== '—') parts.push(`PK ${c.pk}`)
  return parts.join(' · ')
}

/**
 * Detalle completo de maquinaria para lectura.
 * @param {object} e
 */
export function formatEquipoDetalle(e) {
  if (!e) return { titulo: '—', detalle: '' }
  const titulo = String(e.equipo_nombre || e.nombre || e.descripcion || 'Equipo').trim()
  const bits = []
  if (e.operador) bits.push(`Operador: ${e.operador}`)
  if (e.cantidad != null && e.cantidad !== '') bits.push(`Cant.: ${e.cantidad}`)
  const hi = e.hora_inicio ? String(e.hora_inicio).slice(0, 5) : ''
  const hf = e.hora_fin ? String(e.hora_fin).slice(0, 5) : ''
  if (hi || hf) bits.push(`Horario: ${hi || '—'} – ${hf || '—'}`)
  const inter = Array.isArray(e.horas_intermedias) && e.horas_intermedias[0]?.hora
    ? String(e.horas_intermedias[0].hora).slice(0, 5)
    : (e.hora_intermedia ? String(e.hora_intermedia).slice(0, 5) : '')
  if (inter) bits.push(`Interm.: ${inter}`)
  if (e.horas != null && e.horas !== '') bits.push(`${e.horas} h`)
  return { titulo, detalle: bits.join(' · ') }
}

/**
 * Resumen de clima con todos los campos disponibles.
 * @param {object} d
 */
export function formatClimaResumen(d) {
  const row = d || {}
  const condicion = String(row.clima_descripcion || '').trim()
    || (row.clima_codigo != null && row.clima_codigo !== '' ? `Código ${row.clima_codigo}` : '')
  const temp = row.clima_temp_c != null && row.clima_temp_c !== ''
    ? `${row.clima_temp_c} °C`
    : ''
  return {
    condicion: condicion || '—',
    temperatura: temp,
    codigo: row.clima_codigo != null && row.clima_codigo !== '' ? String(row.clima_codigo) : '',
    editadoManual: Boolean(row.clima_editado_manual),
  }
}
