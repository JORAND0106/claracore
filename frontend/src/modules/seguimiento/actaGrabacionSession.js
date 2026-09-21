/**
 * Orquestación de una sesión de grabación (cupo + MediaRecorder + descarga local)
 * + pipeline STT para Temas por checkpoints manuales (sin síntesis periódica).
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

/** Tope para no dejar Detener colgado si MediaRecorder no dispara onstop. */
export const RECORDER_STOP_TIMEOUT_MS = 4000

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
  recorderStopTimeoutMs = RECORDER_STOP_TIMEOUT_MS,
  /** Si true, inicia STT al start; si false, solo tras armTemasCheckpoint. */
  enableLiveOnStart = false,
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
  let liveStarted = false
  let temasCheckpointArmed = false

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
    liveStarted = false
  }

  const applyLivePayload = (payload, { applyTemas = false } = {}) => {
    if (!payload) return
    try { onLiveInfo?.(payload) } catch { /* ignore */ }
    if (
      applyTemas
      && payload.sintetizado
      && Array.isArray(payload.temas)
      && payload.temas.length
    ) {
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
    if (!sesionId || !api || liveStarted || closed || stopping) return liveMode
    liveStarted = true
    let sttAzure = false
    try {
      // No bloquear la UI si live-status tarda: techo corto y seguir con Web Speech.
      const st = await Promise.race([
        Promise.resolve(api.grabacionLiveStatus?.()).then((r) => r),
        new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
      ])
      if (st) {
        sttAzure = !!st?.stt_disponible
        onLiveInfo?.(st || {})
      }
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
            // Solo acumula STT; no aplica temas hasta Actualizar.
            applyLivePayload(payload, { applyTemas: false })
          } catch (e) {
            onError?.(e?.message || 'No se pudo transcribir el audio en vivo')
          }
        },
      })
      emitState({ liveMode })
      return liveMode
    }

    webSpeech = startWebSpeechTranscript({
      onDelta: async (text) => {
        if (closed || stopping || !sesionId) return
        try {
          const payload = await api.grabacionTranscripcion(sesionId, { texto_delta: text })
          applyLivePayload(payload, { applyTemas: false })
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
    emitState({ liveMode })
    return liveMode
  }

  /**
   * Al habilitar TAB Temas: inicia STT (si hace falta) y fija el checkpoint inicial.
   */
  async function armTemasCheckpoint() {
    if (closed || stopping || !sesionId) {
      return { ok: false, detalle: 'No hay sesión de grabación activa.' }
    }
    try {
      await startLivePipeline()
    } catch {
      /* STT best-effort: el checkpoint puede armarse igual */
    }
    try {
      const payload = await api.grabacionCheckpointTemas?.(sesionId)
      temasCheckpointArmed = true
      applyLivePayload(payload, { applyTemas: false })
      emitState({ temasCheckpointArmed: true })
      return { ok: true, payload }
    } catch (e) {
      const msg = e?.message || 'No se pudo armar el checkpoint de Temas'
      onError?.(msg)
      return { ok: false, detalle: msg }
    }
  }

  /**
   * Botón Actualizar: flush STT pendiente + analiza tramo desde checkpoint.
   */
  async function actualizarTemas() {
    if (closed || stopping || !sesionId) {
      throw new Error('No hay sesión de grabación activa para actualizar Temas.')
    }
    if (!liveStarted) {
      await startLivePipeline()
    }
    try { await audioBatcher?.flush?.() } catch { /* ignore */ }
    const payload = await api.grabacionActualizarTemas(sesionId)
    if (payload?.temas_escucha_activa) temasCheckpointArmed = true
    applyLivePayload(payload, { applyTemas: true })
    return payload
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
      temasCheckpointArmed: false,
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

    if (enableLiveOnStart) {
      await startLivePipeline()
    } else {
      emitState({ liveMode: 'none' })
    }

    return { sesionId, tabAudioOk: !!handles.tabAudioOk, liveMode }
  }

  async function stop({ motivo = 'usuario', auto = false } = {}) {
    if (stopping || closed) return null
    stopping = true
    emitState({ phase: 'stopping', stopping: true })
    clearTimers()
    try {
      await stopLivePipeline()
    } catch { /* ignore */ }
    // Sin síntesis forzada al detener: Temas solo avanzan con Actualizar.

    const blob = await new Promise((resolve) => {
      let settled = false
      const finish = (b) => {
        if (settled) return
        settled = true
        resolve(b)
      }
      const fromChunks = () => (
        chunks.length
          ? new Blob(chunks, { type: mimeType || recorder?.mimeType || 'audio/webm' })
          : null
      )
      if (!recorder || recorder.state === 'inactive') {
        finish(fromChunks())
        return
      }
      const timer = setTimeout(() => {
        finish(fromChunks())
      }, Math.max(0, Number(recorderStopTimeoutMs) || RECORDER_STOP_TIMEOUT_MS))
      recorder.onstop = () => {
        clearTimeout(timer)
        finish(fromChunks())
      }
      try {
        recorder.stop()
      } catch {
        clearTimeout(timer)
        finish(fromChunks())
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
      temasCheckpointArmed: false,
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

  return {
    start,
    stop,
    dispose,
    armTemasCheckpoint,
    actualizarTemas,
    getSesionId: () => sesionId,
    getLiveMode: () => liveMode,
    isTemasCheckpointArmed: () => temasCheckpointArmed,
  }
}
