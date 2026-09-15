/**
 * Fusión de temas sintetizados en vivo → filas del TAB Temas.
 * No toca compromisos.
 */

import { plainTextToHtml } from './richTextUtils.js'

export function mergeTemasGrabacionViva(ideasActuales = [], temasPropuestos = [], { newRowKey } = {}) {
  const list = Array.isArray(ideasActuales) ? [...ideasActuales] : []
  const temas = Array.isArray(temasPropuestos) ? temasPropuestos : []
  if (!temas.length) return list

  const makeKey = typeof newRowKey === 'function'
    ? newRowKey
    : () => `gv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  const byClave = new Map()
  list.forEach((row, idx) => {
    const k = String(row?._claveGrabacion || '').trim()
    if (k) byClave.set(k, idx)
  })

  let changed = false
  temas.forEach((tema, i) => {
    const clave = String(tema?.clave || `t${i + 1}`).trim()
    if (!clave) return
    const titulo = String(tema?.titulo || '').trim()
    const textoPlano = String(tema?.texto || titulo || '').trim()
    if (!textoPlano && !titulo) return
    const quien = String(tema?.interviniente || '').trim()
    const html = plainTextToHtml(textoPlano)

    const idx = byClave.get(clave)
    if (idx != null) {
      const prev = list[idx]
      if (prev?._editadoUsuario) return
      const next = {
        ...prev,
        _claveGrabacion: clave,
        _desdeGrabacion: true,
        titulo: titulo || prev.titulo || '',
        texto: html,
        quien_dijo: quien || prev.quien_dijo || '',
      }
      if (
        next.titulo !== prev.titulo
        || next.texto !== prev.texto
        || next.quien_dijo !== prev.quien_dijo
      ) {
        list[idx] = next
        changed = true
      }
      return
    }

    // Evitar duplicar fila vacía inicial si es la única y está vacía
    const onlyEmpty = list.length === 1
      && !String(list[0]?.titulo || '').trim()
      && !String(list[0]?.texto || '').replace(/<[^>]+>/g, '').trim()
      && !list[0]?._claveGrabacion
      && !list[0]?.id

    const row = {
      _key: makeKey('idea'),
      _claveGrabacion: clave,
      _desdeGrabacion: true,
      texto: html,
      quien_dijo: quien,
      titulo: titulo || '',
      imagenes: [],
    }
    if (onlyEmpty) {
      list[0] = { ...list[0], ...row, _key: list[0]._key || row._key }
    } else {
      list.push(row)
    }
    byClave.set(clave, onlyEmpty ? 0 : list.length - 1)
    changed = true
  })

  return changed ? list : ideasActuales
}

/** Acumula blobs de MediaRecorder y emite un lote cada `intervalMs`. */
export function createAudioBatcher({ intervalMs = 15000, onBatch } = {}) {
  let buf = []
  let timer = null
  let mime = 'audio/webm'
  let closed = false

  const flush = async () => {
    if (closed || !buf.length) return
    const parts = buf
    buf = []
    const blob = new Blob(parts, { type: mime })
    if (blob.size < 200) return
    try {
      await onBatch?.(blob)
    } catch {
      /* best-effort */
    }
  }

  return {
    push(blob, mimeType) {
      if (closed || !blob || !blob.size) return
      if (mimeType) mime = mimeType
      buf.push(blob)
      if (!timer) {
        timer = setTimeout(() => {
          timer = null
          flush()
        }, intervalMs)
      }
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await flush()
    },
    stop() {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      buf = []
    },
  }
}

/**
 * Web Speech API continua (fallback si no hay Azure Speech).
 * Devuelve { stop } o null si no está disponible.
 */
export function startWebSpeechTranscript({ lang = 'es-CO', onDelta, onError } = {}) {
  const SR = typeof window !== 'undefined'
    && (window.SpeechRecognition || window.webkitSpeechRecognition)
  if (!SR) return null

  const rec = new SR()
  rec.lang = lang
  rec.continuous = true
  rec.interimResults = false
  let stopped = false

  rec.onresult = (ev) => {
    let text = ''
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      const r = ev.results[i]
      if (r?.isFinal) text += `${r[0]?.transcript || ''} `
    }
    text = text.trim()
    if (text) onDelta?.(text)
  }
  rec.onerror = (ev) => {
    const code = ev?.error || ''
    if (code === 'no-speech' || code === 'aborted') return
    onError?.(code || 'speech-error')
  }
  rec.onend = () => {
    if (!stopped) {
      try { rec.start() } catch { /* ignore */ }
    }
  }
  try {
    rec.start()
  } catch (e) {
    onError?.(e?.message || 'speech-start-failed')
    return null
  }
  return {
    stop() {
      stopped = true
      try { rec.onend = null; rec.stop() } catch { /* ignore */ }
    },
  }
}
