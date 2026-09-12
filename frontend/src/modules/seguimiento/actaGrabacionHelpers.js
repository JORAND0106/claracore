/**
 * Helpers de grabación de reuniones (Actas).
 * Sin subida al servidor: el audio queda solo en el dispositivo del usuario.
 */

export const HEARTBEAT_MS = 15000
export const MAX_CLAIM_PER_BEAT = 120

export function formatMmSs(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function formatMinutosCupo(segundos) {
  const s = Math.max(0, Number(segundos) || 0)
  const mins = s / 60
  if (Number.isInteger(mins)) return String(mins)
  return mins.toFixed(1).replace(/\.0$/, '')
}

/**
 * Saludo oral según hora local del dispositivo.
 * 05:00–11:59 → Buenos días · 12:00–18:59 → Buenas tardes · resto → Buenas noches
 */
export function saludoSegunHora(now = new Date()) {
  const h = now instanceof Date ? now.getHours() : Number(now)
  const hour = Number.isFinite(h) ? h : new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/**
 * Guion compacto para lectura en voz alta (sin scroll en el modal ancho).
 */
export function buildGuionModeradorGrabacion(now = new Date()) {
  const saludo = saludoSegunHora(now)
  return (
    `${saludo}. Antes de iniciar, informo que esta reunión será grabada únicamente `
    + 'para elaborar el acta de compromisos y temas en ClaraCore.\n\n'
    + 'Importante: ClaraCore no conserva el audio de forma permanente. Al detener, '
    + 'el archivo se descarga en el dispositivo de quien graba; es responsabilidad '
    + 'exclusiva del moderador guardar esa copia si desea un registro propio de la '
    + 'reunión. La plataforma no ofrece archivo ni consulta posterior del audio.\n\n'
    + 'Con fundamento en la Ley 1581 de 2012, cada participante debe indicar en voz '
    + 'alta su nombre completo, la entidad que representa y si autoriza o no la '
    + 'grabación de su voz. Quien no autorice podrá permanecer sin que su '
    + 'intervención sea grabada, en la medida de lo posible. Continuamos con la '
    + 'ronda de presentaciones y consentimientos.'
  )
}

export function pickRecorderMimeType(isTypeSupported = (t) => {
  try {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
  } catch {
    return false
  }
}) {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const c of candidates) {
    if (isTypeSupported(c)) return c
  }
  return ''
}

export function extensionForMime(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('mp4')) return 'm4a'
  if (m.includes('ogg')) return 'ogg'
  return 'webm'
}

export function buildGrabacionFilename({ fecha, consecutivo, mime, now = new Date() }) {
  const day = String(fecha || now.toISOString().slice(0, 10)).slice(0, 10)
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const acta = consecutivo != null ? `acta-${consecutivo}` : 'acta'
  const ext = extensionForMime(mime)
  return `claracore-grabacion-${acta}-${day}_${hh}${mm}.${ext}`
}

/** Segundos a reclamar en un heartbeat a partir del tiempo de sesión. */
export function segundosAReclamar({ elapsedSec, alreadyClaimed, maxPerBeat = MAX_CLAIM_PER_BEAT }) {
  const elapsed = Math.max(0, Math.floor(Number(elapsedSec) || 0))
  const claimed = Math.max(0, Math.floor(Number(alreadyClaimed) || 0))
  const delta = elapsed - claimed
  if (delta <= 0) return 0
  return Math.min(delta, maxPerBeat)
}

export function downloadBlob(blob, filename, { createObjectURL, revokeObjectURL, createElement, body } = {}) {
  if (!blob) return false
  const urlFactory = createObjectURL || (typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : null)
  const urlRevoke = revokeObjectURL || (typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : null)
  const docBody = body || (typeof document !== 'undefined' ? document.body : null)
  const elFactory = createElement || (typeof document !== 'undefined' ? document.createElement.bind(document) : null)
  if (!urlFactory || !elFactory || !docBody) return false

  const url = urlFactory(blob)
  const a = elFactory('a')
  a.href = url
  a.download = filename || 'grabacion.webm'
  a.style.display = 'none'
  docBody.appendChild(a)
  a.click()
  docBody.removeChild(a)
  if (urlRevoke) {
    setTimeout(() => {
      try { urlRevoke(url) } catch { /* ignore */ }
    }, 1500)
  }
  return true
}

export function stopMediaStream(stream) {
  if (!stream) return
  try {
    stream.getTracks().forEach((tr) => {
      try { tr.stop() } catch { /* ignore */ }
    })
  } catch { /* ignore */ }
}

/**
 * Mezcla micrófono + audio de pestaña/ventana en un MediaStream grabable.
 * El video de getDisplayMedia se descarta (solo sirve para habilitar audio de pestaña en Chromium).
 */
export async function openGrabacionStreams({
  includeTabAudio = true,
  getUserMedia,
  getDisplayMedia,
  AudioContextImpl,
} = {}) {
  const gum = getUserMedia
    || (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices))
  const gdm = getDisplayMedia
    || (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices))
  const AC = AudioContextImpl
    || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext))

  if (!gum) {
    throw new Error('Este navegador no permite acceso al micrófono.')
  }

  const micStream = await gum({ audio: true, video: false })
  let displayStream = null
  let tabAudioOk = false

  if (includeTabAudio && gdm) {
    try {
      displayStream = await gdm({
        video: true,
        audio: true,
        preferCurrentTab: false,
      })
      // No necesitamos el video; lo detenemos para no transmitir pantalla.
      displayStream.getVideoTracks().forEach((tr) => {
        try { tr.stop() } catch { /* ignore */ }
      })
      tabAudioOk = displayStream.getAudioTracks().some((tr) => tr.readyState === 'live')
      if (!tabAudioOk) {
        stopMediaStream(displayStream)
        displayStream = null
      }
    } catch (err) {
      // Usuario canceló compartir pestaña: seguimos solo con micrófono.
      const name = err?.name || ''
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        // otros errores: también degradamos a mic
      }
      displayStream = null
      tabAudioOk = false
    }
  }

  const sources = [micStream]
  if (displayStream) sources.push(displayStream)

  let mixedStream = null
  let audioCtx = null

  if (AC && sources.length > 0) {
    audioCtx = new AC()
    const dest = audioCtx.createMediaStreamDestination()
    for (const src of sources) {
      if (!src.getAudioTracks().length) continue
      const node = audioCtx.createMediaStreamSource(src)
      node.connect(dest)
    }
    mixedStream = dest.stream
  } else {
    const tracks = sources.flatMap((s) => s.getAudioTracks())
    mixedStream = new MediaStream(tracks)
  }

  return {
    micStream,
    displayStream,
    mixedStream,
    audioCtx,
    tabAudioOk,
    mimeType: pickRecorderMimeType(),
  }
}

export function createMediaRecorder(stream, mimeType, MediaRecorderImpl) {
  const MR = MediaRecorderImpl || (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null)
  if (!MR) throw new Error('MediaRecorder no está disponible en este navegador.')
  const opts = mimeType ? { mimeType } : undefined
  try {
    return opts ? new MR(stream, opts) : new MR(stream)
  } catch {
    return new MR(stream)
  }
}
