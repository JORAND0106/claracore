/**
 * Texturas procedurales para sólidos 3D (C-3D-18).
 * Patrones cacheados (64×64) tintados con el color/tono del sólido — liviano en iPad.
 * Sin imports desde esquema3dSolids (evita dependencia circular con el render).
 */

export const SOLID_TEXTURE_NONE = 'none'

function parseHexRgb(color) {
  const s = String(color || '#0f766e').trim()
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s)
  if (!m) return { r: 15, g: 118, b: 110 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function shadeRgb(color, factor = 1) {
  const base = parseHexRgb(color)
  const f = Number(factor)
  if (!Number.isFinite(f) || Math.abs(f - 1) < 1e-6) return base
  if (f >= 1) {
    const lift = Math.min(1, Math.max(0, (f - 1) * 1.2))
    return {
      r: Math.round(base.r + (255 - base.r) * lift),
      g: Math.round(base.g + (255 - base.g) * lift),
      b: Math.round(base.b + (255 - base.b) * lift),
    }
  }
  const t = Math.max(0.15, f)
  return {
    r: Math.round(base.r * t),
    g: Math.round(base.g * t),
    b: Math.round(base.b * t),
  }
}

/** Catálogo extensible. */
export const SOLID_TEXTURE_CATALOG = Object.freeze([
  { id: SOLID_TEXTURE_NONE, label: 'Sin textura' },
  { id: 'concreto', label: 'Concreto' },
  { id: 'cesped', label: 'Césped' },
  { id: 'piedra', label: 'Piedra' },
  { id: 'ladrillo', label: 'Ladrillo' },
  { id: 'asfalto', label: 'Asfalto' },
  { id: 'tierra', label: 'Tierra' },
  { id: 'grava', label: 'Grava' },
  { id: 'agua', label: 'Agua' },
])

export function solidTextureById(id) {
  if (!id || id === SOLID_TEXTURE_NONE) {
    return SOLID_TEXTURE_CATALOG[0]
  }
  return SOLID_TEXTURE_CATALOG.find((t) => t.id === id) || SOLID_TEXTURE_CATALOG[0]
}

export function normalizeSolidTextureId(id) {
  if (!id || id === SOLID_TEXTURE_NONE) return null
  return SOLID_TEXTURE_CATALOG.some((t) => t.id === id) ? id : null
}

const PATTERN_SIZE = 64
const patternCache = new Map()
const MAX_CACHE = 64

function rgbCss({ r, g, b }, a = 1) {
  return `rgba(${r},${g},${b},${a})`
}

function hash01(i, j, salt = 1) {
  const n = Math.sin(i * 12.9898 + j * 78.233 + salt * 37.719) * 43758.5453
  return n - Math.floor(n)
}

function paintTexture(g, textureId, baseRgb) {
  const { r, g: gg, b } = baseRgb
  const W = PATTERN_SIZE
  g.fillStyle = rgbCss(baseRgb, 1)
  g.fillRect(0, 0, W, W)

  if (textureId === 'concreto') {
    for (let i = 0; i < W; i += 2) {
      for (let j = 0; j < W; j += 2) {
        const n = hash01(i, j, 2)
        if (n > 0.55) {
          const d = (n - 0.55) * 40
          g.fillStyle = rgbCss({
            r: Math.min(255, r + d),
            g: Math.min(255, gg + d),
            b: Math.min(255, b + d),
          }, 0.55)
          g.fillRect(i, j, 2, 2)
        }
      }
    }
    g.strokeStyle = rgbCss({ r: r * 0.7, g: gg * 0.7, b: b * 0.7 }, 0.25)
    for (let k = 0; k < 8; k += 1) {
      const x0 = hash01(k, 1, 3) * W
      const y0 = hash01(k, 2, 4) * W
      g.beginPath()
      g.moveTo(x0, y0)
      g.lineTo(x0 + (hash01(k, 3, 5) - 0.5) * 18, y0 + (hash01(k, 4, 6) - 0.5) * 18)
      g.stroke()
    }
    return
  }

  if (textureId === 'cesped') {
    g.fillStyle = rgbCss({ r: Math.min(255, r * 0.55 + 40), g: Math.min(255, gg * 0.9 + 60), b: Math.min(255, b * 0.45) }, 1)
    g.fillRect(0, 0, W, W)
    for (let i = 0; i < 90; i += 1) {
      const x = hash01(i, 1, 7) * W
      const y = hash01(i, 2, 8) * W
      const h = 4 + hash01(i, 3, 9) * 8
      g.strokeStyle = rgbCss({
        r: 30 + hash01(i, 4, 10) * 40,
        g: 110 + hash01(i, 5, 11) * 80,
        b: 30 + hash01(i, 6, 12) * 30,
      }, 0.85)
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + (hash01(i, 7, 13) - 0.5) * 3, y - h)
      g.stroke()
    }
    return
  }

  if (textureId === 'piedra') {
    for (let i = 0; i < 18; i += 1) {
      const x = hash01(i, 1, 14) * W
      const y = hash01(i, 2, 15) * W
      const rw = 8 + hash01(i, 3, 16) * 16
      const rh = 6 + hash01(i, 4, 17) * 14
      const shade = 0.75 + hash01(i, 5, 18) * 0.35
      g.fillStyle = rgbCss({
        r: Math.min(255, r * shade),
        g: Math.min(255, gg * shade),
        b: Math.min(255, b * shade),
      }, 0.9)
      g.beginPath()
      g.ellipse(x, y, rw / 2, rh / 2, hash01(i, 6, 19), 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = rgbCss({ r: r * 0.5, g: gg * 0.5, b: b * 0.5 }, 0.35)
      g.stroke()
    }
    return
  }

  if (textureId === 'ladrillo') {
    const bw = 16
    const bh = 8
    for (let row = 0; row < W / bh + 1; row += 1) {
      const off = (row % 2) * (bw / 2)
      for (let col = -1; col < W / bw + 1; col += 1) {
        const x = col * bw + off
        const y = row * bh
        const shade = 0.85 + hash01(row, col, 20) * 0.2
        g.fillStyle = rgbCss({
          r: Math.min(255, (r * 0.7 + 140) * shade / 1.2),
          g: Math.min(255, (gg * 0.5 + 60) * shade / 1.2),
          b: Math.min(255, (b * 0.45 + 40) * shade / 1.2),
        }, 1)
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2)
      }
    }
    g.strokeStyle = rgbCss({ r: 220, g: 210, b: 200 }, 0.55)
    g.lineWidth = 1
    for (let y = 0; y <= W; y += bh) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke()
    }
    return
  }

  if (textureId === 'asfalto') {
    g.fillStyle = rgbCss({ r: Math.min(80, r * 0.35), g: Math.min(80, gg * 0.35), b: Math.min(85, b * 0.4) }, 1)
    g.fillRect(0, 0, W, W)
    for (let i = 0; i < 120; i += 1) {
      const x = hash01(i, 1, 21) * W
      const y = hash01(i, 2, 22) * W
      const s = 1 + hash01(i, 3, 23) * 2
      g.fillStyle = rgbCss({ r: 90, g: 90, b: 95 }, 0.35 + hash01(i, 4, 24) * 0.4)
      g.fillRect(x, y, s, s)
    }
    return
  }

  if (textureId === 'tierra') {
    g.fillStyle = rgbCss({ r: Math.min(255, r * 0.6 + 90), g: Math.min(255, gg * 0.45 + 55), b: Math.min(255, b * 0.3 + 25) }, 1)
    g.fillRect(0, 0, W, W)
    for (let i = 0; i < 70; i += 1) {
      g.fillStyle = rgbCss({
        r: 90 + hash01(i, 1, 25) * 80,
        g: 55 + hash01(i, 2, 26) * 50,
        b: 25 + hash01(i, 3, 27) * 30,
      }, 0.4)
      g.beginPath()
      g.arc(hash01(i, 4, 28) * W, hash01(i, 5, 29) * W, 1 + hash01(i, 6, 30) * 3, 0, Math.PI * 2)
      g.fill()
    }
    return
  }

  if (textureId === 'grava') {
    g.fillStyle = rgbCss({ r: Math.min(255, r * 0.7 + 70), g: Math.min(255, gg * 0.7 + 70), b: Math.min(255, b * 0.7 + 65) }, 1)
    g.fillRect(0, 0, W, W)
    for (let i = 0; i < 55; i += 1) {
      const shade = 0.6 + hash01(i, 1, 31) * 0.5
      g.fillStyle = rgbCss({
        r: Math.min(255, 110 * shade),
        g: Math.min(255, 110 * shade),
        b: Math.min(255, 105 * shade),
      }, 0.85)
      g.beginPath()
      g.ellipse(
        hash01(i, 2, 32) * W,
        hash01(i, 3, 33) * W,
        2 + hash01(i, 4, 34) * 4,
        1.5 + hash01(i, 5, 35) * 3,
        hash01(i, 6, 36),
        0,
        Math.PI * 2,
      )
      g.fill()
    }
    return
  }

  if (textureId === 'agua') {
    g.fillStyle = rgbCss({ r: Math.min(255, 40 + r * 0.25), g: Math.min(255, 110 + gg * 0.25), b: Math.min(255, 170 + b * 0.2) }, 1)
    g.fillRect(0, 0, W, W)
    g.strokeStyle = rgbCss({ r: 200, g: 230, b: 255 }, 0.35)
    g.lineWidth = 1.5
    for (let i = 0; i < 6; i += 1) {
      const y = 8 + i * 10
      g.beginPath()
      g.moveTo(0, y)
      for (let x = 0; x <= W; x += 8) {
        g.lineTo(x, y + Math.sin((x / W) * Math.PI * 2 + i) * 3)
      }
      g.stroke()
    }
  }
}

/**
 * CanvasPattern cacheado, o null si sin textura / sin document.
 */
export function getSolidTexturePattern(ctx, textureId, baseColor, faceTone = 1) {
  const tid = normalizeSolidTextureId(textureId)
  if (!tid || !ctx || typeof document === 'undefined') return null
  const tone = Number.isFinite(Number(faceTone)) ? Number(faceTone) : 1
  const key = `${tid}|${String(baseColor || '#0f766e')}|${tone.toFixed(2)}`
  if (patternCache.has(key)) return patternCache.get(key)
  const c = document.createElement('canvas')
  c.width = PATTERN_SIZE
  c.height = PATTERN_SIZE
  const g = c.getContext('2d')
  if (!g) return null
  const rgb = shadeRgb(baseColor || '#0f766e', tone)
  paintTexture(g, tid, rgb)
  const pat = ctx.createPattern(c, 'repeat')
  if (patternCache.size >= MAX_CACHE) patternCache.clear()
  patternCache.set(key, pat)
  return pat
}

/** Miniatura para UI / memoria (data URL o null). */
export function solidTextureThumbnailDataUrl(textureId, baseColor = '#0f766e', size = 48) {
  const c = solidTextureThumbnailCanvas(textureId, baseColor, size)
  return c ? c.toDataURL('image/png') : null
}

export function solidTextureThumbnailCanvas(textureId, baseColor = '#0f766e', size = 48) {
  const tid = normalizeSolidTextureId(textureId)
  if (!tid || typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (!g) return null
  const src = document.createElement('canvas')
  src.width = PATTERN_SIZE
  src.height = PATTERN_SIZE
  const sg = src.getContext('2d')
  paintTexture(sg, tid, shadeRgb(baseColor, 1))
  g.imageSmoothingEnabled = true
  g.drawImage(src, 0, 0, size, size)
  return c
}

/** Pinta miniatura de textura (o color) en un rectángulo del ctx destino. */
export function drawSolidTextureSwatch(ctx, x, y, w, h, textureId, baseColor = '#0f766e') {
  if (!ctx) return
  const thumb = solidTextureThumbnailCanvas(textureId, baseColor, Math.max(24, Math.round(Math.max(w, h) * 2)))
  if (thumb) {
    ctx.drawImage(thumb, x, y, w, h)
    return
  }
  ctx.fillStyle = baseColor || '#0f766e'
  ctx.fillRect(x, y, w, h)
}

/**
 * fillStyle listo para caras: patrón texturizado o null (usar rgba).
 * @param {{ texturesEnabled?: boolean }} opts — false = vista técnica.
 */
export function resolveSolidTextureFillStyle(ctx, solid, faceTone, opts = {}) {
  const enabled = opts.texturesEnabled !== false
  const tid = enabled ? normalizeSolidTextureId(solid?.textureId) : null
  if (!tid) return null
  return getSolidTexturePattern(ctx, tid, solid?.color || '#0f766e', faceTone)
}

export function clearSolidTexturePatternCache() {
  patternCache.clear()
}
