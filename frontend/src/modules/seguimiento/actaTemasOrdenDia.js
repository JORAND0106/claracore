/**
 * Temas pre-creados desde Orden del Día + estado abierto/cerrado.
 * Claves estables: od-1..N (orden), manual-* (agregados), suelta-* (sin tema abierto).
 */

import { htmlToPlainText, plainTextToHtml } from './richTextUtils.js'

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

/** Claves legacy de síntesis (t1, t2…) sin vínculo OD. */
export function isClaveLegacyTema(clave) {
  return /^t\d+$/i.test(String(clave || '').trim())
}

function plainIdeaText(idea) {
  return htmlToPlainText(idea?.texto || '').replace(/\s+/g, ' ').trim()
}

function appendIdeaHtml(baseHtml, addHtml) {
  const a = plainIdeaText({ texto: baseHtml })
  const b = plainIdeaText({ texto: addHtml })
  if (!b) return baseHtml || ''
  if (!a) return addHtml || plainTextToHtml(b)
  if (a.includes(b)) return baseHtml
  if (b.includes(a)) return addHtml
  const left = String(baseHtml || '').trim() || plainTextToHtml(a)
  const right = String(addHtml || '').trim() || plainTextToHtml(b)
  return `${left}${right}`
}

/** Normaliza títulos para comparar (minúsculas, sin tildes, espacios colapsados). */
export function normalizarTituloTema(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Si la clave es legacy tN y existe od-N en la lista, devolver od-N.
 * Ese era el vínculo real (tema N) cuando la síntesis inventaba t1/t2/…
 */
export function remapClaveLegacyAOd(clave, ideas = []) {
  const raw = String(clave || '').trim()
  const m = /^t(\d+)$/i.exec(raw)
  if (!m) return raw
  const od = `od-${m[1]}`
  const existe = (Array.isArray(ideas) ? ideas : []).some((row) => {
    const k = String(row?._claveGrabacion || row?.clave_grabacion || '').trim().toLowerCase()
    return k === od.toLowerCase() || (!!row?._desdeOrdenDia && Number(row?.orden) + 1 === Number(m[1]))
  })
  return existe ? od : raw
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

  // Unir textos huérfanos (tN / sin clave) al tema OD/manual con vínculo confiable.
  const reunido = reunirTextosIdeasConTemas(list)
  if (reunido !== list) {
    changed = true
    list = reunido
  }

  return changed ? list : ideasActuales
}

function absorbInto(dest, src, reporte, motivo, extra = {}) {
  dest.texto = appendIdeaHtml(dest.texto, src.texto)
  if (!String(dest.titulo || '').trim() && String(src.titulo || '').trim()) {
    dest.titulo = src.titulo
  }
  if (!String(dest.quien_dijo || '').trim() && String(src.quien_dijo || '').trim()) {
    dest.quien_dijo = src.quien_dijo
  }
  const imgsD = Array.isArray(dest.imagenes) ? dest.imagenes : []
  const imgsR = Array.isArray(src.imagenes) ? src.imagenes : []
  if (imgsR.length) dest.imagenes = [...imgsD, ...imgsR]
  reporte.unidos.push({
    motivo,
    clave_destino: dest._claveGrabacion || null,
    destino_id: dest.id ?? null,
    origen_id: src.id ?? null,
    titulo: dest.titulo || src.titulo || null,
    chars: plainIdeaText(src).length,
    orden_origen: src.orden != null ? Number(src.orden) : null,
    ...extra,
  })
}

/**
 * Une filas de texto separadas a su tema cuando hay vínculo confiable:
 * 1) misma clave_grabacion (duplicados)
 * 2) clave legacy tN → od-N si ese OD existe (vínculo de tema N)
 * 3) mismo `orden` que el tema od-(orden+1) / ancla con ese orden
 *    (en Acta 18 los textos mostraban los números 2,3,4 = orden 1,2,3)
 * 4) título normalizado idéntico a un único od-* / manual-*
 * No fusiona suelta-* salvo que su orden/título apunten de forma unívoca a un OD
 * vacío y no haya otra interpretación (solo orden/tN; suelta por título no se une).
 *
 * @returns {{ ideas, reporte }} si withReport; si no, solo el array de ideas.
 */
export function reunirTextosIdeasConTemas(ideas = [], { withReport = false } = {}) {
  const list = Array.isArray(ideas) ? ideas.map((r) => ({ ...r })) : []
  const reporte = { unidos: [], sin_vinculo: [], omitidos_suelta: [] }
  if (list.length < 2) {
    return withReport ? { ideas: list.length ? list : ideas, reporte } : (list.length ? list : ideas)
  }

  const used = new Set()
  const isAncla = (row) => {
    const k = String(row?._claveGrabacion || '').trim()
    return isClaveOrdenDia(k) || isClaveManual(k) || !!row?._desdeOrdenDia
  }
  const isHuerfanoTexto = (row) => {
    if (used.has(row)) return false
    if (isAncla(row)) return false
    const k = String(row?._claveGrabacion || '').trim()
    const texto = plainIdeaText(row)
    if (!texto) return false
    // Candidatos: legacy tN, sin clave, o suelta que aún guarda el orden del tema.
    if (!k || isClaveLegacyTema(k)) return true
    if (isClaveSuelta(k) && row.orden != null && Number.isFinite(Number(row.orden))) return true
    return false
  }

  // 0) Remapear claves tN → od-N in-place cuando el OD existe.
  list.forEach((row) => {
    const k = String(row?._claveGrabacion || '').trim()
    const remapped = remapClaveLegacyAOd(k, list)
    if (remapped && remapped !== k) {
      row._claveGrabacion = remapped
      if (isClaveOrdenDia(remapped)) row._desdeOrdenDia = true
    }
  })

  // 1) Colapsar duplicados por la misma clave (od/manual).
  const byClave = new Map()
  list.forEach((row, idx) => {
    const k = String(row?._claveGrabacion || '').trim().toLowerCase()
    if (!k || isClaveSuelta(k)) return
    if (!byClave.has(k)) byClave.set(k, [])
    byClave.get(k).push(idx)
  })
  byClave.forEach((idxs, clave) => {
    if (idxs.length < 2) return
    idxs.sort((a, b) => {
      const sa = (plainIdeaText(list[a]).length) + (String(list[a].titulo || '').trim() ? 1000 : 0)
      const sb = (plainIdeaText(list[b]).length) + (String(list[b].titulo || '').trim() ? 1000 : 0)
      if (sb !== sa) return sb - sa
      return (Number(list[a].id) || 1e12) - (Number(list[b].id) || 1e12)
    })
    const keepIdx = idxs[0]
    const keep = list[keepIdx]
    for (let i = 1; i < idxs.length; i += 1) {
      const other = list[idxs[i]]
      absorbInto(keep, other, reporte, 'misma_clave', { clave })
      used.add(other)
    }
    list[keepIdx] = keep
  })

  // 2) Huérfanos → ancla por orden (número de tema en pantalla) o título normalizado.
  list.forEach((row) => {
    if (!isHuerfanoTexto(row)) return
    const k = String(row?._claveGrabacion || '').trim()

    // 2a) orden compartido con un único tema OD/manual (vínculo de Acta 18).
    const ordenNum = row.orden != null && row.orden !== '' ? Number(row.orden) : NaN
    if (Number.isFinite(ordenNum)) {
      const porOrden = list.filter((ancla) => {
        if (used.has(ancla) || ancla === row) return false
        if (!isAncla(ancla)) return false
        const ao = ancla.orden != null && ancla.orden !== '' ? Number(ancla.orden) : NaN
        if (!Number.isFinite(ao)) return false
        if (ao !== ordenNum) return false
        // Preferir anclas sin texto o con menos texto que el huérfano.
        return true
      })
      if (porOrden.length === 1) {
        const dest = porOrden[0]
        // Solo unir si el destino es el tema N y el huérfano no es una idea general
        // con contenido ya distinto y destino ya lleno del mismo texto.
        absorbInto(dest, row, reporte, 'mismo_orden', {
          orden: ordenNum,
          numero_tema: ordenNum + 1,
        })
        used.add(row)
        return
      }
      // od-N por número de tema (orden+1) si la ancla tiene clave od-(orden+1)
      const nTema = ordenNum + 1
      const porClaveOd = list.filter((ancla) => {
        if (used.has(ancla) || ancla === row) return false
        if (!isAncla(ancla)) return false
        return String(ancla._claveGrabacion || '').trim().toLowerCase() === `od-${nTema}`
      })
      if (porClaveOd.length === 1) {
        absorbInto(porClaveOd[0], row, reporte, 'orden_a_clave_od', {
          orden: ordenNum,
          numero_tema: nTema,
        })
        used.add(row)
        return
      }
    }

    // 2b) título normalizado idéntico.
    const tituloNorm = normalizarTituloTema(row.titulo)
    if (tituloNorm) {
      const candidatos = list.filter((ancla) => {
        if (used.has(ancla) || ancla === row) return false
        if (!isAncla(ancla)) return false
        return normalizarTituloTema(ancla.titulo) === tituloNorm
      })
      if (candidatos.length === 1) {
        absorbInto(candidatos[0], row, reporte, 'titulo_normalizado')
        used.add(row)
        return
      }
    }

    // 2c) solapamiento de palabras del título OD con el texto/título del huérfano
    // (p. ej. "Videos Capacitación" ↔ texto que habla de videos/capacitación).
    const corpus = normalizarTituloTema(`${row.titulo || ''} ${plainIdeaText(row)}`)
    const scored = []
    list.forEach((ancla) => {
      if (used.has(ancla) || ancla === row) return
      if (!isAncla(ancla)) return
      // Solo candidatos OD aún sin texto (o con mucho menos que el huérfano).
      const destChars = plainIdeaText(ancla).length
      const srcChars = plainIdeaText(row).length
      if (destChars > 40 && destChars >= srcChars) return
      const words = normalizarTituloTema(ancla.titulo).split(' ').filter((w) => w.length >= 4)
      if (!words.length) return
      const hits = words.filter((w) => corpus.includes(w)).length
      if (hits <= 0) return
      scored.push({ ancla, hits, ratio: hits / words.length })
    })
    scored.sort((a, b) => b.hits - a.hits || b.ratio - a.ratio)
    if (
      scored.length >= 1
      && scored[0].hits >= 1
      && (scored.length === 1 || scored[0].hits > scored[1].hits)
    ) {
      absorbInto(scored[0].ancla, row, reporte, 'solape_titulo_contenido', {
        hits: scored[0].hits,
      })
      used.add(row)
      return
    }

    if (isClaveSuelta(k)) {
      reporte.omitidos_suelta.push({
        id: row.id ?? null,
        clave: k,
        orden: row.orden ?? null,
        chars: plainIdeaText(row).length,
      })
    }
    reporte.sin_vinculo.push({
      id: row.id ?? null,
      clave: row._claveGrabacion || null,
      titulo: row.titulo || null,
      orden: row.orden ?? null,
      chars: plainIdeaText(row).length,
      razon: 'sin_vinculo_confiable',
    })
  })

  // Rotular sueltas sin título.
  const next = []
  list.forEach((row) => {
    if (used.has(row)) return
    const k = String(row?._claveGrabacion || '').trim()
    if (isClaveSuelta(k)) {
      next.push({
        ...row,
        _ideaSuelta: true,
        titulo: String(row.titulo || '').trim() || 'Idea general',
      })
      return
    }
    next.push(row)
  })

  // Renumerar orden secuencial (números únicos en UI/PDF).
  next.forEach((row, i) => {
    row.orden = i
  })

  const changed = used.size > 0
    || next.length !== ideas.length
    || next.some((row, i) => row !== ideas[i])
  const out = changed ? next : ideas
  return withReport ? { ideas: out, reporte } : out
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
