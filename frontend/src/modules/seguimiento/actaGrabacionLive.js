/**
 * Fusión de temas sintetizados en vivo → filas del TAB Temas.
 * No toca compromisos.
 * Respeta título/expositor de temas pre-creados (Orden del Día / manual).
 */

import { htmlToPlainText, plainTextToHtml } from './richTextUtils.js'
import {
  isClaveOrdenDia,
  isClaveSuelta,
  reunirTextosIdeasConTemas,
} from './actaTemasOrdenDia.js'

function idxTemaAbierto(list) {
  return (Array.isArray(list) ? list : []).findIndex((r) => r?._temaAbierto)
}

function idxPorTituloOdManual(list, titulo) {
  const t = String(titulo || '').trim().toLowerCase()
  if (!t) return -1
  const hits = []
  ;(Array.isArray(list) ? list : []).forEach((row, idx) => {
    const k = String(row?._claveGrabacion || '').trim()
    if (!(isClaveOrdenDia(k) || String(k).startsWith('manual-') || row?._desdeOrdenDia)) return
    if (String(row?.titulo || '').trim().toLowerCase() === t) hits.push(idx)
  })
  return hits.length === 1 ? hits[0] : -1
}

/**
 * Resuelve la clave destino para un tema sintetizado.
 * Nunca inventa t1/t2 si ya hay temas OD: eso separaba el texto del tema al guardar.
 */
export function resolverClaveTemaSintesis(tema, ideasActuales = [], indiceFallback = 0) {
  const raw = String(tema?.clave || '').trim()
  if (raw) return raw
  const open = idxTemaAbierto(ideasActuales)
  if (open >= 0) {
    const k = String(ideasActuales[open]?._claveGrabacion || '').trim()
    if (k) return k
  }
  const byTitle = idxPorTituloOdManual(ideasActuales, tema?.titulo)
  if (byTitle >= 0) {
    const k = String(ideasActuales[byTitle]?._claveGrabacion || '').trim()
    if (k) return k
  }
  // Sin tema abierto ni título coincidente → idea general (no tN huérfano).
  return `suelta-${Math.max(1, Number(indiceFallback) + 1)}`
}

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
    let clave = resolverClaveTemaSintesis(tema, list, i)
    if (!clave) return
    // Si la IA devolvió tN pero hay un OD con el mismo título, unir ahí.
    if (!isClaveOrdenDia(clave) && !isClaveSuelta(clave) && !String(clave).startsWith('manual-')) {
      const byTitle = idxPorTituloOdManual(list, tema?.titulo)
      if (byTitle >= 0) {
        const kOd = String(list[byTitle]?._claveGrabacion || '').trim()
        if (kOd) clave = kOd
      }
    }
    const titulo = String(tema?.titulo || '').trim()
    const textoPlano = String(tema?.texto || '').trim()
    if (!textoPlano && !titulo) return
    const quien = String(tema?.interviniente || '').trim()
    const html = textoPlano ? plainTextToHtml(textoPlano) : ''
    let idxExistente = byClave.has(clave) ? byClave.get(clave) : null
    if (idxExistente == null && titulo) {
      const byTitle = idxPorTituloOdManual(list, titulo)
      if (byTitle >= 0) idxExistente = byTitle
    }
    const protegerMeta = isClaveOrdenDia(clave)
      || String(clave).startsWith('manual-')
      || !!(idxExistente != null && list[idxExistente]?._desdeOrdenDia)

    const idx = idxExistente
    if (idx != null) {
      const prev = list[idx]
      if (prev?._editadoUsuario) return
      const prevPlain = htmlToPlainText(prev.texto || '').trim()
      // Si el expositor/moderador ya escribió y la IA trae texto distinto, no pisar:
      // solo anexar cuando el previo es borrador o vacío.
      let nextTexto = prev.texto || ''
      if (html) {
        if (!prevPlain || prev.texto_es_borrador) {
          nextTexto = html
        } else if (!prevPlain.includes(textoPlano) && !textoPlano.includes(prevPlain)) {
          nextTexto = `${String(prev.texto || '').trim()}${html}`
        } else if (textoPlano.includes(prevPlain) && textoPlano.length > prevPlain.length) {
          nextTexto = html
        }
      }
      const next = {
        ...prev,
        _claveGrabacion: String(prev._claveGrabacion || clave).trim() || clave,
        _desdeGrabacion: true,
        titulo: protegerMeta
          ? (prev.titulo || titulo || '')
          : (titulo || prev.titulo || ''),
        texto: nextTexto,
        quien_dijo: protegerMeta
          ? (prev.quien_dijo || quien || '')
          : (quien || prev.quien_dijo || ''),
        ...(prev.texto_es_borrador && html ? { texto_es_borrador: true } : {}),
      }
      if (isClaveSuelta(clave)) next._ideaSuelta = true
      if (
        next.titulo !== prev.titulo
        || next.texto !== prev.texto
        || next.quien_dijo !== prev.quien_dijo
        || next._claveGrabacion !== prev._claveGrabacion
      ) {
        list[idx] = next
        byClave.set(next._claveGrabacion, idx)
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
      _temaAbierto: false,
      _ideaSuelta: isClaveSuelta(clave),
      texto: html || '<p></p>',
      quien_dijo: quien,
      titulo: titulo || (isClaveSuelta(clave) ? 'Idea general' : ''),
      imagenes: [],
      texto_es_borrador: true,
    }
    if (onlyEmpty) {
      list[0] = { ...list[0], ...row, _key: list[0]._key || row._key }
      byClave.set(clave, 0)
    } else {
      list.push(row)
      byClave.set(clave, list.length - 1)
    }
    changed = true
  })

  if (!changed) return ideasActuales
  // Por si quedaron tN huérfanos con título OD, reunirlos.
  return reunirTextosIdeasConTemas(list)
}

/** Acumula blobs de MediaRecorder y emite un lote cada `intervalMs` (legado). */
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

/** Azure Speech REST (short audio) solo acepta WAV/PCM 16 kHz mono u OGG/Opus — no WebM. */
export const AZURE_STT_SAMPLE_RATE = 16000
export const AZURE_STT_WAV_CONTENT_TYPE = 'audio/wav; codecs=audio/pcm; samplerate=16000'

/** Umbral RMS (0..1) por debajo del cual el lote se considera silencio. */
export const STT_SILENCE_RMS = 0.004

/** Causas que sí merecen aviso rojo (configuración / red / permiso real). */
const CAUSAS_STT_CRITICAS = new Set([
  'sin_clave',
  'auth_rechazada',
  'region_invalida',
  'formato_invalido',
  'error_red',
  'http_error',
  'sin_permiso',
])

/**
 * True si la causa STT debe mostrarse como error rojo.
 * Silencio o sin reconocimiento no son críticos por sí solos.
 */
export function esCausaSttCritica(causa) {
  return CAUSAS_STT_CRITICAS.has(String(causa || '').trim().toLowerCase())
}

/**
 * ¿Hay alguna pista de audio viva (micrófono o pestaña)?
 * Un track ended/muted sí indica micrófono caído.
 */
export function hayPistaAudioViva(handles = {}) {
  const streams = [handles?.micStream, handles?.displayStream].filter(Boolean)
  return streams.some((s) => (
    s?.getAudioTracks?.()?.some((t) => (
      t && t.readyState === 'live' && t.enabled !== false
    ))
  ))
}

/**
 * Clasifica un lote vacío: crítico (rojo) vs neutro (silencio normal).
 * Nunca marca sin_audio como crítico si ya hubo caracteres o el mic sigue vivo.
 */
export function clasificarAvisoSttVacio({
  causa = '',
  rms = 0,
  charsAcumulados = 0,
  micVivo = true,
} = {}) {
  const c = String(causa || '').trim().toLowerCase()
    || ((Number(rms) || 0) < STT_SILENCE_RMS ? 'sin_audio' : 'sin_reconocimiento')
  if (esCausaSttCritica(c)) {
    return { nivel: 'error', causa: c, mensaje: mensajeSttUsuario({ stt_causa: c }) }
  }
  // Micrófono realmente caído (sin pistas vivas) y sin transcripción previa.
  if ((c === 'sin_audio' || c === 'sin_permiso') && !micVivo && !(Number(charsAcumulados) > 0)) {
    return {
      nivel: 'error',
      causa: 'sin_audio',
      mensaje: mensajeSttUsuario({ stt_causa: 'sin_audio' }),
    }
  }
  // Ya hubo voz o el mic sigue activo: silencio / NoMatch = estado neutro, no rojo.
  if (c === 'sin_audio' || c === 'sin_reconocimiento') {
    return {
      nivel: 'neutro',
      causa: c,
      mensaje: Number(charsAcumulados) > 0 || micVivo
        ? 'Sin voz en este momento'
        : mensajeSttUsuario({ stt_causa: c }),
    }
  }
  return { nivel: 'neutro', causa: c, mensaje: mensajeSttUsuario({ stt_causa: c }) }
}

/**
 * Mensaje breve al usuario según la causa STT (sin jerga ni nombres de variables/claves).
 */
export function mensajeSttUsuario(payload = {}) {
  const causa = String(payload?.stt_causa || payload?.causa || '').trim().toLowerCase()
  const map = {
    sin_audio: 'No se detectó sonido del micrófono. Revise el permiso y que el micrófono esté activo.',
    sin_permiso: 'No hay permiso para usar el micrófono. Actívelo en el navegador e intente de nuevo.',
    sin_clave: 'La transcripción no está configurada en el servidor. Avise a soporte.',
    auth_rechazada: 'El servicio de voz rechazó la configuración. Avise a soporte.',
    region_invalida: 'El servicio de voz no responde en esta región. Avise a soporte.',
    formato_invalido: 'No se pudo preparar el audio para transcribir. Intente de nuevo en Chrome o Edge.',
    sin_reconocimiento: 'Se oyó audio, pero no se reconoció voz clara. Hable más cerca del micrófono.',
    error_red: 'No se pudo enviar el audio para transcribir. Revise la conexión e intente de nuevo.',
    http_error: 'El servicio de voz no pudo transcribir el audio. Intente de nuevo en un momento.',
  }
  if (causa && map[causa]) return map[causa]
  const detalle = String(payload?.detalle || '').trim()
  // Evitar filtrar mensajes técnicos antiguos al usuario.
  if (detalle && !/AZURE_|Speech|WAV|PCM|WebM|Ocp-|subscription/i.test(detalle)) {
    return detalle
  }
  return map.sin_reconocimiento
}

/**
 * Re-muestrea Float32 mono a `targetRate` con interpolación lineal.
 */
export function resampleFloat32Mono(input, inputRate, targetRate = AZURE_STT_SAMPLE_RATE) {
  const src = input instanceof Float32Array ? input : new Float32Array(input || [])
  const inRate = Number(inputRate) || 0
  const outRate = Number(targetRate) || AZURE_STT_SAMPLE_RATE
  if (!src.length || inRate <= 0 || outRate <= 0) return new Float32Array(0)
  if (Math.abs(inRate - outRate) < 0.5) return src
  const outLen = Math.max(1, Math.round(src.length * (outRate / inRate)))
  const out = new Float32Array(outLen)
  const ratio = inRate / outRate
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, src.length - 1)
    const frac = pos - i0
    out[i] = src[i0] * (1 - frac) + src[i1] * frac
  }
  return out
}

/**
 * Codifica muestras Float32 [-1,1] a WAV PCM 16-bit LE mono.
 */
export function encodeWavPcm16(float32Samples, sampleRate = AZURE_STT_SAMPLE_RATE) {
  const samples = float32Samples instanceof Float32Array
    ? float32Samples
    : new Float32Array(float32Samples || [])
  const rate = Math.max(1, Math.floor(Number(sampleRate) || AZURE_STT_SAMPLE_RATE))
  const numSamples = samples.length
  const dataBytes = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits
  writeStr(36, 'data')
  view.setUint32(40, dataBytes, true)
  let offset = 44
  for (let i = 0; i < numSamples; i += 1) {
    let s = samples[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: AZURE_STT_WAV_CONTENT_TYPE })
}

function concatFloat32(chunks) {
  const total = chunks.reduce((n, c) => n + (c?.length || 0), 0)
  const out = new Float32Array(total)
  let off = 0
  for (const c of chunks) {
    if (!c?.length) continue
    out.set(c, off)
    off += c.length
  }
  return out
}

/**
 * RMS de muestras Float32 (0..~1). Útil para detectar silencio antes de Azure.
 */
export function float32Rms(samples) {
  const src = samples instanceof Float32Array ? samples : new Float32Array(samples || [])
  if (!src.length) return 0
  let sum = 0
  for (let i = 0; i < src.length; i += 1) {
    const s = src[i]
    sum += s * s
  }
  return Math.sqrt(sum / src.length)
}

/**
 * Captura PCM desde los streams de origen (mic / pestaña), NO desde el
 * MediaStreamDestination del mix: reinyectar dest.stream en el mismo
 * AudioContext suele llegar en silencio a Azure (0 caracteres).
 *
 * Emite WAV 16 kHz cada `intervalMs` para Azure Speech.
 */
export function createPcmWavStreamer({
  audioCtx,
  /** @deprecated Preferir sourceStreams (mic/pestaña). mixedStream (dest) puede ser silencio. */
  mediaStream = null,
  /** Streams originales: micrófono y, si hay, audio de pestaña. */
  sourceStreams = null,
  intervalMs = 15000,
  targetSampleRate = AZURE_STT_SAMPLE_RATE,
  onBatch,
  /** Mínimo de samples a 16 kHz (~0.4 s) para no mandar silencio vacío. */
  minSamples = 6400,
} = {}) {
  const streams = []
  const fromSources = Array.isArray(sourceStreams) ? sourceStreams : []
  fromSources.forEach((s) => {
    if (s?.getAudioTracks?.()?.some((t) => t && t.readyState !== 'ended')) {
      streams.push(s)
    }
  })
  // Respaldo legado: un solo mediaStream (idealmente ya no el dest.stream).
  if (!streams.length && mediaStream?.getAudioTracks?.()?.length) {
    streams.push(mediaStream)
  }
  if (!audioCtx || !streams.length) return null

  let closed = false
  let chunks = []
  let timer = null
  const sourceNodes = []
  let processor = null
  let mute = null
  const ownsAudioCtx = false
  const inputRate = Number(audioCtx.sampleRate) || 48000

  const flush = async () => {
    if (closed || !chunks.length) return
    const raw = concatFloat32(chunks)
    chunks = []
    if (!raw.length) return
    const resampled = resampleFloat32Mono(raw, inputRate, targetSampleRate)
    if (resampled.length < minSamples) return
    const rms = float32Rms(resampled)
    const blob = encodeWavPcm16(resampled, targetSampleRate)
    if (!blob || blob.size < 100) return
    try {
      await onBatch?.(blob, { rms, samples: resampled.length, bytes: blob.size })
    } catch {
      /* best-effort */
    }
  }

  try {
    if (audioCtx.state === 'suspended') {
      Promise.resolve(audioCtx.resume?.()).catch(() => { /* ignore */ })
    }
    // ScriptProcessor: amplio soporte; el grafo se mantiene vivo vía gain=0.
    const bufferSize = 4096
    processor = audioCtx.createScriptProcessor(bufferSize, 1, 1)
    mute = audioCtx.createGain()
    mute.gain.value = 0
    processor.onaudioprocess = (ev) => {
      if (closed) return
      try {
        const input = ev.inputBuffer.getChannelData(0)
        chunks.push(new Float32Array(input))
      } catch {
        /* ignore */
      }
    }
    for (const stream of streams) {
      const node = audioCtx.createMediaStreamSource(stream)
      node.connect(processor)
      sourceNodes.push(node)
    }
    processor.connect(mute)
    mute.connect(audioCtx.destination)
  } catch {
    sourceNodes.forEach((n) => { try { n.disconnect?.() } catch { /* ignore */ } })
    try { processor?.disconnect?.() } catch { /* ignore */ }
    return null
  }

  timer = setInterval(() => {
    flush().catch(() => { /* ignore */ })
  }, Math.max(1000, Number(intervalMs) || 15000))

  return {
    async flush() {
      await flush()
    },
    stop() {
      closed = true
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      chunks = []
      try { processor.onaudioprocess = null } catch { /* ignore */ }
      try { processor?.disconnect?.() } catch { /* ignore */ }
      sourceNodes.forEach((n) => { try { n.disconnect?.() } catch { /* ignore */ } })
      try { mute?.disconnect?.() } catch { /* ignore */ }
      processor = null
      mute = null
      sourceNodes.length = 0
      if (ownsAudioCtx) {
        try { audioCtx.close?.() } catch { /* ignore */ }
      }
    },
  }
}

/**
 * @deprecated No usar para Temas: incompleto en reuniones largas.
 * Se conserva solo por compatibilidad de tests/legado.
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
