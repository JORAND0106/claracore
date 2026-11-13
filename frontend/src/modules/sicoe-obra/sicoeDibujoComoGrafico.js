/**
 * Puente dibujo del reporte → gráfico asignable (C-OUT-23).
 * El guardado geográfico del dibujo nunca depende de este flujo.
 */
import { drawEsquemaSalidaHeader, planEsquemaSalidaHeader } from '../../components/esquema/esquemaSalidaHeader.js'
import { captureMapAreaToDataUrl } from '../../components/esquema/esquemaMapaCapture.js'

export const DIBUJO_GRAFICO_FUENTE = 'dibujo_reporte'
export const DIBUJO_GRAFICO_NOMBRE_DEFAULT = (numeroReporte) => (
  `Dibujo reporte #${numeroReporte != null && numeroReporte !== '' ? numeroReporte : '—'}`
)

/** @param {object|null|undefined} escena */
export function leerLinkDibujoGrafico(escena) {
  const g = escena?.grafico || escena?.dibujo_grafico || null
  if (!g || typeof g !== 'object') return null
  const esquemaId = g.esquema_id || g.esquemaId || null
  const numero = g.numero != null ? Number(g.numero) : null
  if (!esquemaId && !Number.isFinite(numero)) return null
  return {
    esquema_id: esquemaId || (Number.isFinite(numero) ? `num:${numero}` : null),
    numero: Number.isFinite(numero) ? numero : null,
    nombre: String(g.nombre || '').trim() || null,
    url: g.url || null,
  }
}

/** ¿Primera vez: aún no hay gráfico ligado al dibujo? */
export function debeOfrecerGuardarComoGrafico(escena) {
  return !leerLinkDibujoGrafico(escena)
}

/**
 * Devuelve copia de la escena con el vínculo al gráfico.
 * @param {object} escena
 * @param {{ esquema_id: string, numero?: number|null, nombre?: string|null, url?: string|null }} link
 */
export function conLinkDibujoGrafico(escena, link) {
  const base = escena && typeof escena === 'object' ? { ...escena } : { version: 3 }
  if (!link) {
    delete base.grafico
    delete base.dibujo_grafico
    return base
  }
  const grafico = {
    fuente: DIBUJO_GRAFICO_FUENTE,
    esquema_id: link.esquema_id,
    numero: link.numero ?? null,
    nombre: link.nombre || null,
    url: link.url || null,
  }
  return { ...base, grafico, dibujo_grafico: grafico }
}

export function esEntradaDibujoReporte(g) {
  if (!g || typeof g !== 'object') return false
  if (g.fuente === DIBUJO_GRAFICO_FUENTE || g.dibujo_reporte === true) return true
  const origen = String(g.origen || '').toLowerCase()
  return origen === DIBUJO_GRAFICO_FUENTE
}

export function esFilaEsquemaDibujoReporte(row) {
  if (!row) return false
  if (row.fuente === DIBUJO_GRAFICO_FUENTE || row.dibujo_reporte === true) return true
  const scene = row.scene || row.esquema_scene
  return !!leerLinkDibujoGrafico(scene) || esEntradaDibujoReporte(row)
}

/**
 * Compone mapa (opacidad) + lienzo de dibujo (transparente) en un data URL PNG.
 * Sin DOM de Image: opera solo con canvases.
 */
export function compositeMapaYDibujoToDataUrl(mapCanvas, drawCanvas, opacity, area) {
  if (!drawCanvas || !area) return null
  const out = (typeof document !== 'undefined')
    ? document.createElement('canvas')
    : null
  if (!out) return null
  const w = Math.max(1, Math.round(area.w))
  const h = Math.max(1, Math.round(area.h))
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  if (mapCanvas) {
    const mapUri = captureMapAreaToDataUrl(mapCanvas, area, opacity, { mime: 'image/png' })
    if (mapUri) {
      // drawImage necesita Image; en captura síncrona usamos el canvas del mapa directo.
      try {
        const cssW = mapCanvas.clientWidth || mapCanvas.width
        const cssH = mapCanvas.clientHeight || mapCanvas.height
        const ratioX = mapCanvas.width / Math.max(1, cssW)
        const ratioY = mapCanvas.height / Math.max(1, cssH)
        const sx = Math.max(0, Math.floor(area.x * ratioX))
        const sy = Math.max(0, Math.floor(area.y * ratioY))
        const sw = Math.max(1, Math.min(mapCanvas.width - sx, Math.floor(area.w * ratioX)))
        const sh = Math.max(1, Math.min(mapCanvas.height - sy, Math.floor(area.h * ratioY)))
        const alpha = Math.max(0, Math.min(1, Number(opacity)))
        ctx.save()
        ctx.globalAlpha = Number.isFinite(alpha) ? alpha : 0.3
        ctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, w, h)
        ctx.restore()
        void mapUri
      } catch { /* mapa opcional */ }
    }
  }

  try {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    const dw = drawCanvas.width
    const dh = drawCanvas.height
    if (dw > 0 && dh > 0) {
      const sx = Math.max(0, Math.floor(area.x * dpr))
      const sy = Math.max(0, Math.floor(area.y * dpr))
      const sw = Math.max(1, Math.min(dw - sx, Math.floor(area.w * dpr)))
      const sh = Math.max(1, Math.min(dh - sy, Math.floor(area.h * dpr)))
      ctx.drawImage(drawCanvas, sx, sy, sw, sh, 0, 0, w, h)
    }
  } catch {
    return null
  }

  try {
    return out.toDataURL('image/png')
  } catch {
    return null
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image no disponible'))
      return
    }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la vista'))
    img.src = src
  })
}

/**
 * Encabezado institucional + vista capturada (mapa + dibujo).
 */
export async function composeVistaConEncabezado(vistaDataUrl, {
  title = 'Dibujo',
  tipoTitulo = 'Dibujo',
  brandTitle,
} = {}) {
  if (!vistaDataUrl || typeof document === 'undefined') {
    throw new Error('No se pudo generar la imagen del dibujo')
  }
  const img = await loadImage(vistaDataUrl)
  const imageWidth = Math.max(640, img.naturalWidth || img.width || 1280)
  const vistaH = Math.max(1, img.naturalHeight || img.height || 720)
  const headerPlan = planEsquemaSalidaHeader({
    imageWidth,
    tipoTitulo,
    nombre: title,
    brandTitle,
  })
  const canvas = document.createElement('canvas')
  canvas.width = imageWidth
  canvas.height = headerPlan.height + vistaH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo generar la imagen del dibujo')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await drawEsquemaSalidaHeader(ctx, {
    imageWidth,
    tipoTitulo,
    nombre: title,
    brandTitle,
  })
  ctx.drawImage(img, 0, headerPlan.height, imageWidth, vistaH)
  return canvas.toDataURL('image/png')
}

/**
 * Plan de decisión post-guardado (sin I/O).
 * @returns {{ modo: 'offer'|'update'|'skip', link: object|null }}
 */
export function planPuenteDibujoGrafico(escena) {
  const link = leerLinkDibujoGrafico(escena)
  if (link) return { modo: 'update', link }
  return { modo: 'offer', link: null }
}
