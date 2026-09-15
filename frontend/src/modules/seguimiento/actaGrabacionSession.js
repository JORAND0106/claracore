/**
 * Orquestación de una sesión de grabación (cupo + MediaRecorder + descarga local)
 * + pipeline en vivo (STT/síntesis de Temas).
 */
import {
  HEARTBEAT_MS,
  buildGrabacionFilename,
  createMediaRecorder,
  downloadBlob,
  openGrabacionStreams,
  segundosAReclamar,
  stopMediaStream,
} from './actaGrabacionHelpers.js'
import {
  createAudioBatcher,
  startWebSpeechTranscript,
} from './actaGrabacionLive.js'

export function createGrabacionSessionController({
  api,
  getMeta,
  onCupo,
  onTick,
  onState,
  onError,
  onDownloaded,
  onTemasVivos,
  onLiveInfo,
  /** Inyectables para tests */
  openStreams = openGrabacionStreams,
  createRecorder = createMediaRecorder,
  download = downloadBlob,
  heartbeatMs = HEARTBEAT_MS,
  chunkIntervalMs = 15000,
  enableLive = true,
} = {}) {
  let closed = false
  let sesionId = null
  let startedAt = 0
  let claimed = 0
  let heartbeatTimer = null
  let tickTimer = null
  let recorder = null
  let chunks = []
  let mimeType = ''
  let handles = null
  let stopping = false
  let audioBatcher = null
  let webSpeech = null
  let liveMode = 'none' // azure | webspeech | none

  const emitState = (patch) => {
    try { onState?.(patch) } catch { /* ignore */ }
  }

  const clearTimers = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  const stopLivePipeline = async () => {
    try { webSpeech?.stop?.() } catch { /* ignore */ }
    webSpeech = null
    try { await audioBatcher?.flush?.() } catch { /* ignore */ }
    try { audioBatcher?.stop?.() } catch { /* ignore */ }
    audioBatcher = null
  }

  const applyLivePayload = (payload) => {
    if (!payload) return
    try { onLiveInfo?.(payload) } catch { /* ignore */ }
    if (Array.isArray(payload.temas) && payload.temas.length) {
      try { onTemasVivos?.(payload.temas, payload) } catch { /* ignore */ }
    }
  }

  const cleanupMedia = () => {
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    } catch { /* ignore */ }
    recorder = null
    if (handles?.audioCtx) {
      try { handles.audioCtx.close() } catch { /* ignore */ }
    }
    stopMediaStream(handles?.micStream)
    stopMediaStream(handles?.displayStream)
    stopMediaStream(handles?.mixedStream)
    handles = null
  }

  const heartbeat = async () => {
    if (closed || !sesionId || stopping) return
    const elapsed = (Date.now() - startedAt) / 1000
    const pedir = segundosAReclamar({ elapsedSec: elapsed, alreadyClaimed: claimed })
    if (pedir <= 0) return
    try {
      const cupo = await api.reclamarGrabacion(sesionId, pedir)
      onCupo?.(cupo)
      const got = Number(cupo?.claimed || 0)
      claimed += got
      if (cupo?.debe_cerrar || got < pedir) {
        await stop({ motivo: 'cupo_agotado', auto: true })
      }
    } catch (e) {
      onError?.(e?.message || 'No se pudo actualizar el cupo de grabación')
    }
  }

  async function startLivePipeline() {
    if (!enableLive || !sesionId || !api) return
    let sttAzure = false
    try {
      const st = await api.grabacionLiveStatus?.()
      sttAzure = !!st?.stt_disponible
      onLiveInfo?.(st || {})
    } catch {
      sttAzure = false
    }

    if (sttAzure && typeof api.grabacionChunk === 'function') {
      liveMode = 'azure'
      audioBatcher = createAudioBatcher({
        intervalMs: chunkIntervalMs,
        onBatch: async (blob) => {
          if (closed || stopping || !sesionId) return
          try {
            const payload = await api.grabacionChunk(sesionId, blob)
            applyLivePayload(payload)
          } catch (e) {
            onError?.(e?.message || 'No se pudo transcribir el audio en vivo')
          }
        },
      })
      return
    }

    // Fallback: Web Speech del navegador → texto al backend → síntesis Clara
    webSpeech = startWebSpeechTranscript({
      onDelta: async (text) => {
        if (closed || stopping || !sesionId) return
        try {
          const payload = await api.grabacionTranscripcion(sesionId, { texto_delta: text })
          applyLivePayload(payload)
        } catch (e) {
          onError?.(e?.message || 'No se pudo enviar la transcripción en vivo')
        }
      },
      onError: (code) => {
        if (code === 'not-allowed') {
          onError?.('Permiso de reconocimiento de voz denegado en el navegador.')
        }
      },
    })
    liveMode = webSpeech ? 'webspeech' : 'none'
    if (!webSpeech) {
      onLiveInfo?.({
        stt_disponible: false,
        acepta_transcripcion_cliente: false,
        detalle: 'Sin Azure Speech ni Web Speech en este navegador.',
      })
    }
  }

  async function start({ includeTabAudio = true } = {}) {
    if (closed) throw new Error('Sesión cerrada')
    emitState({ phase: 'starting', stopping: false })

    handles = await openStreams({ includeTabAudio })
    mimeType = handles.mimeType || ''

    let cupoInicio
    try {
      cupoInicio = await api.iniciarGrabacion()
    } catch (err) {
      cleanupMedia()
      emitState({ phase: 'idle', stopping: false })
      throw err
    }
    onCupo?.(cupoInicio)
    sesionId = cupoInicio?.sesion?.id
    if (sesionId == null) {
      cleanupMedia()
      emitState({ phase: 'idle', stopping: false })
      throw new Error('El servidor no devolvió la sesión de grabación')
    }

    chunks = []
    recorder = createRecorder(handles.mixedStream, mimeType)
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data)
        audioBatcher?.push(ev.data, mimeType || ev.data.type)
      }
    }
    recorder.start(1000)
    startedAt = Date.now()
    claimed = 0

    emitState({
      phase: 'recording',
      sesionId,
      tabAudioOk: !!handles.tabAudioOk,
      elapsedSec: 0,
    })

    tickTimer = setInterval(() => {
      onTick?.({
        elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
      })
    }, 500)

    heartbeatTimer = setInterval(() => {
      heartbeat()
    }, heartbeatMs)

    setTimeout(() => { heartbeat() }, Math.min(2000, heartbeatMs))

    await startLivePipeline()
    emitState({ liveMode })

    return { sesionId, tabAudioOk: !!handles.tabAudioOk, liveMode }
  }

  async function stop({ motivo = 'usuario', auto = false } = {}) {
    if (stopping || closed) return null
    stopping = true
    emitState({ phase: 'stopping', stopping: true })
    clearTimers()
    await stopLivePipeline()

    // Última síntesis forzada si hay sesión
    if (sesionId && api?.grabacionTranscripcion) {
      try {
        const payload = await api.grabacionTranscripcion(sesionId, {
          texto_delta: '',
          forzar_sintesis: true,
        })
        applyLivePayload(payload)
      } catch { /* ignore */ }
    }

    const blob = await new Promise((resolve) => {
      if (!recorder || recorder.state === 'inactive') {
        resolve(chunks.length ? new Blob(chunks, { type: mimeType || 'audio/webm' }) : null)
        return
      }
      recorder.onstop = () => {
        resolve(chunks.length ? new Blob(chunks, { type: mimeType || recorder.mimeType || 'audio/webm' }) : null)
      }
      try { recorder.stop() } catch {
        resolve(chunks.length ? new Blob(chunks, { type: mimeType || 'audio/webm' }) : null)
      }
    })

    cleanupMedia()

    const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0
    const residual = segundosAReclamar({ elapsedSec: elapsed, alreadyClaimed: claimed })

    let cupoFinal = null
    if (sesionId != null) {
      try {
        cupoFinal = await api.finalizarGrabacion(sesionId, {
          segundos_adicionales: residual,
          motivo: auto ? 'cupo_agotado' : motivo,
        })
        onCupo?.(cupoFinal)
        claimed += Number(cupoFinal?.claimed || 0)
      } catch (e) {
        onError?.(e?.message || 'No se pudo cerrar la sesión de cupo')
      }
    }

    let downloaded = false
    if (blob && blob.size > 0) {
      const meta = getMeta?.() || {}
      const filename = buildGrabacionFilename({
        fecha: meta.fecha,
        consecutivo: meta.consecutivo,
        mime: blob.type || mimeType,
      })
      downloaded = download(blob, filename)
      onDownloaded?.({ filename, size: blob.size, auto })
    }

    closed = true
    emitState({
      phase: 'idle',
      stopping: false,
      downloaded,
      autoStop: auto,
      liveMode: 'none',
    })
    return { blob, cupoFinal, downloaded, auto }
  }

  function dispose() {
    clearTimers()
    try { webSpeech?.stop?.() } catch { /* ignore */ }
    try { audioBatcher?.stop?.() } catch { /* ignore */ }
    cleanupMedia()
    closed = true
  }

  return { start, stop, dispose, getSesionId: () => sesionId, getLiveMode: () => liveMode }
}
