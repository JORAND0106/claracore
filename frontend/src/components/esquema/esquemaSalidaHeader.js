/**
 * Encabezado institucional aprobado de toda imagen generada por el esquema:
 * título de tipo, nombre, fecha y marca/logo de la plataforma (C-OUT-02…08).
 */
import { esquemaDocFontHierarchy } from './esquemaDocLegibility.js'

export const ESQUEMA_SALIDA_BRAND = 'Clara Core'
export const ESQUEMA_SALIDA_LOGO_URL = '/CLARA.CORE.png'

export const ESQUEMA_SALIDA_HEADER_COLORS = Object.freeze({
  bg: '#ecfeff',
  primary: '#0f766e',
  text: '#0f172a',
  muted: '#475569',
})

/** Alto de encabezado proporcional al ancho (≈ tipografía × DOC). */
export function esquemaSalidaHeaderHeight(imageWidth, textScale = 1) {
  const w = Math.max(320, Number(imageWidth) || 1280)
  const ts = Math.max(0.8, Number(textScale) || 1)
  const hier = esquemaDocFontHierarchy(w, { cellPx: Math.round(13 * ts) })
  return Math.max(Math.round(78 * ts), Math.round(hier.titlePx * 2.8 + hier.headerPx * 1.6 + 24))
}

/**
 * Plan estructural del encabezado (sin canvas) — verificación de referencias.
 */
export function planEsquemaSalidaHeader({
  imageWidth = 1280,
  tipoTitulo = 'Esquema',
  nombre = '',
  brandTitle = ESQUEMA_SALIDA_BRAND,
  fechaIso = null,
  textScale = 1,
} = {}) {
  const w = Math.max(320, Number(imageWidth) || 1280)
  const ts = Math.max(0.8, Number(textScale) || (w / 1280))
  const hier = esquemaDocFontHierarchy(w, { cellPx: Math.round(13 * ts) })
  const height = esquemaSalidaHeaderHeight(w, ts)
  const fecha = fechaIso
    ? new Date(fechaIso).toLocaleString('es-CO')
    : new Date().toLocaleString('es-CO')
  return {
    width: w,
    height,
    textScale: ts,
    tipoTitulo: String(tipoTitulo || 'Esquema'),
    nombre: String(nombre || '').trim() || 'Esquema',
    brandTitle: String(brandTitle || ESQUEMA_SALIDA_BRAND),
    fecha,
    titlePx: Math.max(Math.round(26 * ts), hier.titlePx),
    namePx: Math.max(Math.round(16 * ts), hier.headerPx),
    metaPx: Math.round(13 * ts),
    hasLogoSlot: true,
    requiredTokens: ['tipoTitulo', 'nombre', 'fecha', 'brandTitle', 'logoSlot'],
  }
}

let _logoCache = undefined

export async function loadEsquemaSalidaLogoDataUrl() {
  if (_logoCache !== undefined) return _logoCache
  try {
    if (typeof fetch !== 'function') {
      _logoCache = null
      return null
    }
    const res = await fetch(ESQUEMA_SALIDA_LOGO_URL)
    if (!res.ok) {
      _logoCache = null
      return null
    }
    const blob = await res.blob()
    _logoCache = await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
    return _logoCache
  } catch {
    _logoCache = null
    return null
  }
}

/** Solo tests: limpia caché del logo. */
export function __resetEsquemaSalidaLogoCache() {
  _logoCache = undefined
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Dibuja el encabezado institucional en (0,0)–(width, height).
 * @returns {Promise<object>} plan usado (para meta de verificación)
 */
export async function drawEsquemaSalidaHeader(ctx, opts = {}) {
  const plan = planEsquemaSalidaHeader(opts)
  if (!ctx) return { ...plan, drawn: false }
  const C = ESQUEMA_SALIDA_HEADER_COLORS
  const margin = Math.round(28 * plan.textScale)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, plan.width, plan.height)
  ctx.fillStyle = C.primary
  ctx.font = `bold ${plan.titlePx}px "Segoe UI", system-ui, sans-serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(plan.tipoTitulo, margin, Math.round(32 * plan.textScale))
  ctx.fillStyle = C.text
  ctx.font = `bold ${plan.namePx}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(plan.nombre, margin, Math.round(58 * plan.textScale))
  ctx.fillStyle = C.muted
  ctx.font = `${plan.metaPx}px "Segoe UI", system-ui, sans-serif`
  ctx.fillText(plan.brandTitle, plan.width * 0.42, Math.round(32 * plan.textScale))
  const fechaW = ctx.measureText(plan.fecha).width
  ctx.fillText(plan.fecha, plan.width - margin - fechaW, Math.round(58 * plan.textScale))

  let logoDrawn = false
  const logo = await loadEsquemaSalidaLogoDataUrl()
  if (logo) {
    try {
      const img = await loadImage(logo)
      const lw = Math.round(110 * plan.textScale)
      const lh = (img.height / Math.max(1, img.width)) * lw
      ctx.drawImage(
        img,
        plan.width - margin - lw,
        Math.round(10 * plan.textScale),
        lw,
        Math.min(lh, plan.height - Math.round(16 * plan.textScale)),
      )
      logoDrawn = true
    } catch { /* logo opcional */ }
  }
  return { ...plan, drawn: true, logoDrawn }
}
