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

export function isClaveManual(clave) {
  return /^manual-/i.test(String(clave || '').trim())
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
 * Tema sin título, texto, adjuntos ni audio (candidato a duplicado vacío).
 * No considera compromisos (eso lo valida el servidor en limpieza).
 */
export function ideaSinContenido(idea) {
  if (!idea || typeof idea !== 'object') return true
  const titulo = String(idea.titulo || '').trim()
  const texto = String(idea.texto || '').replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ').trim()
  const imgs = Array.isArray(idea.imagenes) ? idea.imagenes.filter(Boolean) : []
  const hasAudio = !!(idea.audio_url || idea.audio_blob_path || idea._audioTema)
  return !titulo && !texto && imgs.length === 0 && !hasAudio
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
  return ideaSinContenido(row)
}

function makeManualClave(seed) {
  const raw = String(seed || Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, '')
  return `manual-${raw.slice(-14) || Date.now().toString(36)}`
}

/**
 * Pre-crea un tema cerrado por cada punto del Orden del Día.
 * Idempotente: no duplica; reclama filas vacías huérfanas; orden = orden del día.
 * Si sobra un tema od-* con contenido (punto eliminado), lo conserva como manual-*.
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

  let pool = Array.isArray(ideasActuales) ? [...ideasActuales] : []
  if (soloIdeasVaciasPlaceholder(pool)) {
    pool = []
  }

  const used = new Set()
  const takeMatch = (pred) => {
    const idx = pool.findIndex((row, i) => !used.has(i) && pred(row))
    if (idx < 0) return null
    used.add(idx)
    return pool[idx]
  }

  const matched = []
  let changed = false

  puntos.forEach((p, i) => {
    const clave = claveOrdenDia(i + 1)
    const titulo = String(p.texto || p.titulo || '').trim()
    const expositor = String(p.expositor_nombre || '').trim()
    const itemKey = String(p.key || p._key || '').trim() || null
    const expIdRaw = p.expositor_usuario_id ?? p.expositor_id ?? null
    const expId = expIdRaw != null && Number(expIdRaw) > 0 ? Number(expIdRaw) : null
    const tituloLc = titulo.toLowerCase()

    let idea =
      (itemKey
        ? takeMatch((row) => String(row?._ordenItemKey || '').trim() === itemKey)
        : null)
      || takeMatch((row) => String(row?._claveGrabacion || '').trim() === clave)
      || takeMatch((row) => {
        const t = String(row?.titulo || '').trim().toLowerCase()
        if (!t || t !== tituloLc) return false
        const k = String(row?._claveGrabacion || '').trim()
        return !k || isClaveOrdenDia(k)
      })
      // Reclamar filas vacías huérfanas (típico: se guardaron solo con interviniente, sin título/clave).
      || takeMatch((row) => {
        if (!ideaSinContenido(row)) return false
        const k = String(row?._claveGrabacion || '').trim()
        if (k && !isClaveOrdenDia(k)) return false
        return true
      })

    if (idea) {
      const next = {
        ...idea,
        _claveGrabacion: clave,
        _desdeOrdenDia: true,
        _ordenItemKey: itemKey || idea._ordenItemKey || null,
        titulo: String(idea.titulo || '').trim() || titulo,
        quien_dijo: String(idea.quien_dijo || '').trim() || expositor,
        expositor_usuario_id: idea.expositor_usuario_id ?? expId,
        _temaAbierto: !!idea._temaAbierto,
      }
      if (
        next.titulo !== idea.titulo
        || next.quien_dijo !== idea.quien_dijo
        || next.expositor_usuario_id !== idea.expositor_usuario_id
        || idea._claveGrabacion !== clave
        || idea._ordenItemKey !== next._ordenItemKey
        || !idea._desdeOrdenDia
      ) {
        changed = true
      }
      matched.push(next)
      return
    }

    matched.push({
      _key: makeKey('idea'),
      _claveGrabacion: clave,
      _desdeOrdenDia: true,
      _ordenItemKey: itemKey,
      _temaAbierto: false,
      titulo,
      quien_dijo: expositor,
      expositor_usuario_id: expId,
      texto: '',
      texto_es_borrador: false,
      imagenes: [],
    })
    changed = true
  })

  const rest = []
  pool.forEach((row, i) => {
    if (used.has(i)) return
    const k = String(row?._claveGrabacion || '').trim()
    // Vacío sin vínculo útil → no conservar (evita 4 filas fantasma + 4 reales).
    if (ideaSinContenido(row) && (!k || isClaveOrdenDia(k))) {
      changed = true
      return
    }
    // Punto eliminado del OD pero el tema ya tiene contenido → conservar como manual.
    if (isClaveOrdenDia(k)) {
      rest.push({
        ...row,
        _claveGrabacion: makeManualClave(row.id || row._key || k),
        _desdeOrdenDia: false,
        _ordenItemKey: null,
      })
      changed = true
      return
    }
    rest.push(row)
  })

  let list = [...matched, ...rest]

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
  const clave = makeManualClave(key)
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
