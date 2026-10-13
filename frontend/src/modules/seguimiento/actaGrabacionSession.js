/**
 * Orquestación de una sesión de grabación (cupo + MediaRecorder + descarga local)
 * + pipeline Azure Speech sobre audio real + checkpoints de Temas (auto ~5 min / manual / final).
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
  clasificarAvisoSttVacio,
  createPcmWavStreamer,
  hayPistaAudioViva,
  mensajeSttUsuario,
} from './actaGrabacionLive.js'

/** Tope para no dejar Detener colgado si MediaRecorder no dispara onstop. */
export const RECORDER_STOP_TIMEOUT_MS = 4000

/** Intervalo de checkpoint automático de Temas (~5 min). */
export const CHECKPOINT_AUTO_MS = 5 * 60 * 1000

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
  /** Clave del tema abierto (od-N / manual-*); null → ideas sueltas. */
  getTemaClaveActiva,
  /** Temas pre-creados a sembrar en la sesión [{clave,titulo,texto,interviniente}]. */
  getTemasBase,
  /** Inyectables para tests */
  openStreams = openGrabacionStreams,
  createRecorder = createMediaRecorder,
  download = downloadBlob,
  heartbeatMs = HEARTBEAT_MS,
  chunkIntervalMs = 15000,
  recorderStopTimeoutMs = RECORDER_STOP_TIMEOUT_MS,
  checkpointAutoMs = CHECKPOINT_AUTO_MS,
  /** Si true, inicia STT al start; si false, solo tras armTemasCheckpoint. */
  enableLiveOnStart = false,
} = {}) {
  let closed = false
  let sesionId = null
  let startedAt = 0
  let claimed = 0
  let heartbeatTimer = null
  let tickTimer = null
  let autoCheckpointTimer = null
  let recorder = null
  let chunks = []
  let mimeType = ''
  let handles = null
  let stopping = false
  let pcmStreamer = null
  let liveMode = 'none' // azure | none
  let liveStarted = false
  let temasCheckpointArmed = false
  let temasBusy = false
  let sttEmptyStreak = 0
  /** Caracteres STT ya vistos en esta sesión (para no marcar silencio como error). */
  let sttCharsSeen = 0

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

  const clearAutoCheckpoint = () => {
    if (autoCheckpointTimer) {
      clearInterval(autoCheckpointTimer)
      autoCheckpointTimer = null
    }
  }

  const stopLivePipeline = async () => {
    try { await pcmStreamer?.flush?.() } catch { /* ignore */ }
    try { pcmStreamer?.stop?.() } catch { /* ignore */ }
    pcmStreamer = null
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

  const scheduleAutoCheckpoint = () => {
    clearAutoCheckpoint()
    if (!temasCheckpointArmed || closed || stopping) return
    const raw = Number(checkpointAutoMs)
    const ms = Number.isFinite(raw) && raw > 0
      ? Math.max(20, raw)
      : CHECKPOINT_AUTO_MS
    autoCheckpointTimer = setInterval(() => {
      if (closed || stopping || !temasCheckpointArmed || temasBusy) return
      actualizarTemas({ origen: 'auto' }).catch((e) => {
        onError?.(e?.message || 'No se pudo procesar el checkpoint automático de Temas')
      })
    }, ms)
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
      let timeoutId = null
      const st = await Promise.race([
        Promise.resolve(api.grabacionLiveStatus?.()).then((r) => r),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve(null), 8000)
        }),
      ])
      if (timeoutId) clearTimeout(timeoutId)
      if (st) {
        sttAzure = !!st?.stt_disponible
        onLiveInfo?.(st || {})
      }
    } catch {
      sttAzure = false
    }

    if (sttAzure && typeof api.grabacionChunk === 'function') {
      // PCM desde mic/pestaña (origen), NO desde mixedStream/dest: ese loopback
      // en el mismo AudioContext suele mandar silencio a Azure.
      // MediaRecorder sigue en mixedStream solo para la descarga local.
      const sourceStreams = [handles?.micStream, handles?.displayStream].filter(
        (s) => s?.getAudioTracks?.()?.some((t) => t && t.readyState !== 'ended'),
      )
      const streamer = createPcmWavStreamer({
        audioCtx: handles?.audioCtx,
        sourceStreams,
        intervalMs: chunkIntervalMs,
        onBatch: async (blob, meta = {}) => {
          if (closed || stopping || !sesionId) return
          try {
            const payload = await api.grabacionChunk(sesionId, blob, {
              rms: meta?.rms,
              samples: meta?.samples,
            })
            const delta = Number(payload?.delta_chars || 0)
            const chars = Number(payload?.transcripcion_chars || 0)
            if (chars > sttCharsSeen) sttCharsSeen = chars
            if (delta > 0) {
              sttEmptyStreak = 0
              // Quitar aviso neutro de silencio cuando vuelve a haber voz.
              applyLivePayload({
                ...(payload || {}),
                stt_estado: 'transcribiendo',
                stt_aviso: '',
              }, { applyTemas: false })
              return
            }
            // Durante checkpoint/síntesis no contar silencio: Abrir/Cerrar tema
            // hace flush y puede coincidir con pausas naturales de habla.
            if (temasBusy) {
              applyLivePayload(payload, { applyTemas: false })
              return
            }
            sttEmptyStreak += 1
            if (sttEmptyStreak === 4) {
              const aviso = clasificarAvisoSttVacio({
                causa: payload?.stt_causa || payload?.causa,
                rms: meta?.rms,
                charsAcumulados: sttCharsSeen,
                micVivo: hayPistaAudioViva(handles),
              })
              if (aviso.nivel === 'error') {
                onError?.(aviso.mensaje)
              } else {
                // Silencio normal o sin voz clara: estado neutro, nunca rojo.
                applyLivePayload({
                  ...(payload || {}),
                  stt_estado: 'silencio',
                  stt_aviso: aviso.mensaje || 'Sin voz en este momento',
                }, { applyTemas: false })
                return
              }
            }
            applyLivePayload(payload, { applyTemas: false })
          } catch (e) {
            onError?.(mensajeSttUsuario({ stt_causa: 'error_red', detalle: e?.message })
              || 'No se pudo enviar el audio para transcribir.')
          }
        },
      })
      if (streamer) {
        liveMode = 'azure'
        pcmStreamer = streamer
        emitState({ liveMode })
        return liveMode
      }
      liveMode = 'none'
      onLiveInfo?.({
        stt_disponible: true,
        acepta_transcripcion_cliente: false,
        detalle: (
          'No se pudo capturar el audio del micrófono para transcribir. '
          + 'Use Chrome o Edge e intente de nuevo.'
        ),
      })
      emitState({ liveMode })
      return liveMode
    }

    liveMode = 'none'
    onLiveInfo?.({
      stt_disponible: false,
      acepta_transcripcion_cliente: false,
      detalle: (
        'Configure Azure Speech (AZURE_SPEECH_KEY) para transcribir el audio real. '
        + 'El reconocimiento del navegador ya no se usa para Temas.'
      ),
    })
    emitState({ liveMode })
    return liveMode
  }

  /**
   * Al habilitar TAB Temas: inicia Azure STT (si hace falta) y fija el checkpoint inicial.
   * Arranca el timer de checkpoints automáticos (~5 min).
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
      const payload = await api.grabacionCheckpointTemas?.(sesionId, {
        tema_clave_activa: typeof getTemaClaveActiva === 'function' ? getTemaClaveActiva() : null,
        temas_base: typeof getTemasBase === 'function' ? getTemasBase() : undefined,
      })
      temasCheckpointArmed = true
      applyLivePayload(payload, { applyTemas: false })
      emitState({ temasCheckpointArmed: true })
      scheduleAutoCheckpoint()
      return { ok: true, payload }
    } catch (e) {
      const msg = e?.message || 'No se pudo armar el checkpoint de Temas'
      onError?.(msg)
      return { ok: false, detalle: msg }
    }
  }

  /**
   * Procesa el tramo pendiente (manual / auto / final) y reinicia el conteo automático.
   */
  async function actualizarTemas({ origen = 'manual' } = {}) {
    if (closed || !sesionId) {
      throw new Error('No hay sesión de grabación activa para actualizar Temas.')
    }
    // Esperar un tramo en curso (p.ej. auto CP al detener) sin descartar el final.
    const waitUntil = Date.now() + 90_000
    while (temasBusy && Date.now() < waitUntil) {
      await new Promise((r) => setTimeout(r, 200))
    }
    if (temasBusy) {
      return { sintetizado: false, detalle: 'Ya hay un tramo de Temas en proceso.' }
    }
    if (!liveStarted) {
      await startLivePipeline()
    }
    temasBusy = true
    // Abrir/Cerrar tema no debe reiniciar captura ni disparar falso aviso de mic.
    sttEmptyStreak = 0
    emitState({ temasBusy: true })
    try {
      try { await pcmStreamer?.flush?.() } catch { /* ignore */ }
      const payload = await api.grabacionActualizarTemas(sesionId, {
        origen,
        tema_clave_activa: typeof getTemaClaveActiva === 'function' ? getTemaClaveActiva() : null,
        temas_base: typeof getTemasBase === 'function' ? getTemasBase() : undefined,
      })
      if (payload?.temas_escucha_activa) temasCheckpointArmed = true
      applyLivePayload(payload, { applyTemas: true })
      // Reinicia el intervalo automático tras cualquier checkpoint efectivo.
      if (temasCheckpointArmed && !stopping && !closed) {
        scheduleAutoCheckpoint()
      }
      // Auto-reintento suave si quedó un tramo en error.
      const resumen = payload?.tramos_resumen || {}
      if ((resumen.error || 0) > 0 && origen !== 'reintento' && !stopping && !closed) {
        setTimeout(() => {
          if (closed || stopping || temasBusy) return
          reintentarTramo().catch(() => { /* best-effort */ })
        }, 4000)
      }
      return payload
    } finally {
      temasBusy = false
      emitState({ temasBusy: false })
    }
  }

  async function reintentarTramo(tramoId = null) {
    if (closed || stopping || !sesionId) {
      throw new Error('No hay sesión de grabación activa para reintentar.')
    }
    if (temasBusy) {
      return { sintetizado: false, detalle: 'Ya hay un tramo de Temas en proceso.' }
    }
    temasBusy = true
    emitState({ temasBusy: true })
    try {
      const payload = await api.grabacionReintentarTramo?.(sesionId, tramoId)
      applyLivePayload(payload, { applyTemas: true })
      return payload
    } finally {
      temasBusy = false
      emitState({ temasBusy: false })
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
    // Solo acumula para descarga local; STT usa PCM/WAV en paralelo.
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data)
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
    clearAutoCheckpoint()

    // Último tramo pendiente mientras la sesión sigue activa (antes de finalizar cupo).
    if (temasCheckpointArmed && sesionId) {
      try {
        await actualizarTemas({ origen: 'final' })
      } catch (e) {
        onError?.(e?.message || 'No se pudo sintetizar el último tramo de Temas al detener')
      }
    }

    try {
      await stopLivePipeline()
    } catch { /* ignore */ }

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
    temasCheckpointArmed = false
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
    clearAutoCheckpoint()
    try { pcmStreamer?.stop?.() } catch { /* ignore */ }
    pcmStreamer = null
    cleanupMedia()
    closed = true
  }

  return {
    start,
    stop,
    dispose,
    armTemasCheckpoint,
    actualizarTemas,
    reintentarTramo,
    getSesionId: () => sesionId,
    getLiveMode: () => liveMode,
    isTemasCheckpointArmed: () => temasCheckpointArmed,
  }
}
