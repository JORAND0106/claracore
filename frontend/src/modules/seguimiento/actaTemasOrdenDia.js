/**
 * Temas pre-creados desde Orden del Día + estado abierto/cerrado.
 * Claves estables: od-1..N (orden), manual-* (agregados), suelta-* (sin tema abierto).
 */

export function claveOrdenDia(index1Based) {
  const n = Math.max(1, Number(index1Based) || 1)
  return `od-${n}`
}

export function isClaveOrdenDia(clave) {
  return /^od-\d+$/i.test(String(clave || '').trim())
}

export function isClaveSuelta(clave) {
  return /^suelta-/i.test(String(clave || '').trim())
}

export function ideaTemaAbierto(idea) {
  return !!(idea && idea._temaAbierto)
}

/** Índice del único tema abierto, o -1. */
export function indexTemaAbierto(ideas = []) {
  const list = Array.isArray(ideas) ? ideas : []
  return list.findIndex((row) => ideaTemaAbierto(row))
}

export function claveTemaActivo(ideas = []) {
  const idx = indexTemaAbierto(ideas)
  if (idx < 0) return null
  const k = String(ideas[idx]?._claveGrabacion || '').trim()
  return k || null
}

/**
 * Temas base para sembrar la sesión de grabación / prompt de IA.
 * [{clave, titulo, texto, interviniente}]
 */
export function temasBaseDesdeIdeas(ideas = []) {
  const out = []
  for (const row of Array.isArray(ideas) ? ideas : []) {
    const clave = String(row?._claveGrabacion || '').trim()
    if (!clave) continue
    if (isClaveSuelta(clave)) continue
    const titulo = String(row?.titulo || '').trim()
    if (!titulo && !clave) continue
    out.push({
      clave,
      titulo: titulo || clave,
      texto: '', // el texto vivo lo mantiene la sesión; aquí solo ancla título/expositor
      interviniente: String(row?.quien_dijo || '').trim() || null,
    })
  }
  return out
}

function soloIdeasVaciasPlaceholder(list) {
  if (!Array.isArray(list) || !list.length) return true
  if (list.length !== 1) return false
  const row = list[0]
  if (row?._claveGrabacion || row?.id || row?._desdeOrdenDia) return false
  const titulo = String(row?.titulo || '').trim()
  const texto = String(row?.texto || '').replace(/<[^>]+>/g, '').trim()
  return !titulo && !texto
}

/**
 * Pre-crea un tema cerrado por cada punto del Orden del Día.
 * No duplica si ya hay claves od-* / _desdeOrdenDia.
 * Conserva ideas sueltas/manuales existentes.
 */
export function seedIdeasFromOrdenDia(ordenItems = [], ideasActuales = [], { newRowKey } = {}) {
  const puntos = (Array.isArray(ordenItems) ? ordenItems : [])
    .filter((x) => String(x?.texto || x?.titulo || '').trim())
  const makeKey = typeof newRowKey === 'function'
    ? newRowKey
    : () => `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  if (!puntos.length) {
    return Array.isArray(ideasActuales) ? ideasActuales : []
  }

  let list = Array.isArray(ideasActuales) ? [...ideasActuales] : []
  if (soloIdeasVaciasPlaceholder(list)) {
    list = []
  }

  const byClave = new Map()
  list.forEach((row, idx) => {
    const k = String(row?._claveGrabacion || '').trim()
    if (k) byClave.set(k, idx)
  })

  // Reatachar por título si se cargó del servidor sin _claveGrabacion
  let changed = false
  puntos.forEach((p, i) => {
    const clave = claveOrdenDia(i + 1)
    if (byClave.has(clave)) return
    const titulo = String(p.texto || p.titulo || '').trim()
    const hit = list.findIndex((row) => {
      if (row?._claveGrabacion) return false
      return String(row?.titulo || '').trim().toLowerCase() === titulo.toLowerCase()
    })
    if (hit >= 0) {
      list[hit] = {
        ...list[hit],
        _claveGrabacion: clave,
        _desdeOrdenDia: true,
        _temaAbierto: !!list[hit]._temaAbierto,
        quien_dijo: String(list[hit].quien_dijo || p.expositor_nombre || '').trim(),
        titulo: list[hit].titulo || titulo,
      }
      byClave.set(clave, hit)
      changed = true
    }
  })

  const seeded = []

  puntos.forEach((p, i) => {
    const clave = claveOrdenDia(i + 1)
    const titulo = String(p.texto || p.titulo || '').trim()
    const expositor = String(p.expositor_nombre || '').trim()
    const idx = byClave.get(clave)
    if (idx != null) {
      const prev = list[idx]
      const next = {
        ...prev,
        _claveGrabacion: clave,
        _desdeOrdenDia: true,
        titulo: prev.titulo || titulo,
        quien_dijo: prev.quien_dijo || expositor,
        _temaAbierto: !!prev._temaAbierto,
      }
      if (
        next.titulo !== prev.titulo
        || next.quien_dijo !== prev.quien_dijo
        || prev._claveGrabacion !== clave
        || !prev._desdeOrdenDia
      ) {
        list[idx] = next
        changed = true
      }
      seeded.push(list[idx])
      return
    }
    const row = {
      _key: makeKey('idea'),
      _claveGrabacion: clave,
      _desdeOrdenDia: true,
      _temaAbierto: false,
      titulo,
      quien_dijo: expositor,
      texto: '',
      imagenes: [],
    }
    list.push(row)
    byClave.set(clave, list.length - 1)
    seeded.push(row)
    changed = true
  })

  // Garantizar un solo tema abierto
  let openSeen = false
  list = list.map((row) => {
    if (!row._temaAbierto) return row
    if (openSeen) {
      changed = true
      return { ...row, _temaAbierto: false }
    }
    openSeen = true
    return row
  })

  return changed ? list : ideasActuales
}

/** Abre un tema; cierra automáticamente cualquier otro (un solo abierto). */
export function abrirTemaEnIdeas(ideas = [], index) {
  const list = Array.isArray(ideas) ? [...ideas] : []
  if (index < 0 || index >= list.length) return ideas
  return list.map((row, i) => ({
    ...row,
    _temaAbierto: i === index,
  }))
}

/** Cierra el tema (por índice o todos). */
export function cerrarTemaEnIdeas(ideas = [], index = null) {
  const list = Array.isArray(ideas) ? [...ideas] : []
  return list.map((row, i) => {
    if (index == null || i === index) {
      if (!row._temaAbierto) return row
      return { ...row, _temaAbierto: false }
    }
    return row
  })
}

/** Agrega un tema manual cerrado al final. */
export function agregarTemaManual(ideas = [], { titulo = '', quien_dijo = '', newRowKey } = {}) {
  const makeKey = typeof newRowKey === 'function'
    ? newRowKey
    : () => `idea-${Date.now().toString(36)}`
  const key = makeKey('idea')
  const clave = `manual-${String(key).replace(/[^a-zA-Z0-9_-]/g, '').slice(-12) || Date.now().toString(36)}`
  const row = {
    _key: key,
    _claveGrabacion: clave,
    _desdeOrdenDia: false,
    _temaAbierto: false,
    titulo: String(titulo || '').trim() || 'Tema adicional',
    quien_dijo: String(quien_dijo || '').trim(),
    texto: '',
    imagenes: [],
  }
  const list = Array.isArray(ideas) ? [...ideas] : []
  // Quitar placeholder vacío
  if (soloIdeasVaciasPlaceholder(list)) {
    return [row]
  }
  return [...list, row]
}
