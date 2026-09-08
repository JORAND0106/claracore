/**
 * Hatch por subregión: dibuja bordes de todas las figuras y hace flood-fill
 * desde el clic, de modo que líneas/círculos superpuestos actúan como fronteras.
 */
import { esquemaEntityInk } from './esquemaTheme.js'

function strokeObjectEdges(ctx, obj) {
  if (!obj || obj.type === 'hatchRegion' || obj.type === 'image' || obj.type === 'cota') return
  ctx.save()
  const center = objectCenterApprox(obj)
  if (obj.rotation) {
    ctx.translate(center.x, center.y)
    ctx.rotate(obj.rotation)
    ctx.translate(-center.x, -center.y)
  }
  ctx.strokeStyle = '#000000'
  ctx.fillStyle = '#000000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Grosor suficiente para que el flood-fill no “cruce” el trazo
  ctx.lineWidth = Math.max(3, (obj.width || 3) + 1)

  if (obj.type === 'stroke') {
    const pts = obj.points || []
    if (pts.length < 2) { ctx.restore(); return }
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
  } else if (obj.type === 'linea' || obj.type === 'flecha') {
    ctx.beginPath()
    ctx.moveTo(obj.x1, obj.y1)
    ctx.lineTo(obj.x2, obj.y2)
    ctx.stroke()
  } else if (obj.type === 'rect') {
    ctx.strokeRect(obj.x1, obj.y1, obj.x2 - obj.x1, obj.y2 - obj.y1)
  } else if (obj.type === 'elipse') {
    ctx.beginPath()
    ctx.ellipse(
      (obj.x1 + obj.x2) / 2,
      (obj.y1 + obj.y2) / 2,
      Math.max(Math.abs(obj.x2 - obj.x1) / 2, 0.5),
      Math.max(Math.abs(obj.y2 - obj.y1) / 2, 0.5),
      0, 0, Math.PI * 2,
    )
    ctx.stroke()
  } else if (obj.type === 'triangulo') {
    const midX = (obj.x1 + obj.x2) / 2
    ctx.beginPath()
    ctx.moveTo(midX, obj.y1)
    ctx.lineTo(obj.x2, obj.y2)
    ctx.lineTo(obj.x1, obj.y2)
    ctx.closePath()
    ctx.stroke()
  } else if (obj.type === 'polilinea') {
    const pts = obj.points || []
    if (pts.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function objectCenterApprox(obj) {
  if (obj.type === 'stroke' || obj.type === 'polilinea') {
    const pts = obj.points || []
    if (!pts.length) return { x: 0, y: 0 }
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    }
  }
  return {
    x: ((obj.x1 || 0) + (obj.x2 || 0)) / 2,
    y: ((obj.y1 || 0) + (obj.y2 || 0)) / 2,
  }
}

function expandBounds(objects, clickX, clickY, pad = 24) {
  let minX = clickX
  let maxX = clickX
  let minY = clickY
  let maxY = clickY
  for (const obj of objects || []) {
    if (obj.type === 'hatchRegion') {
      minX = Math.min(minX, obj.x)
      maxX = Math.max(maxX, obj.x + obj.w)
      minY = Math.min(minY, obj.y)
      maxY = Math.max(maxY, obj.y + obj.h)
      continue
    }
    if (obj.type === 'stroke' || obj.type === 'polilinea') {
      for (const p of obj.points || []) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
      continue
    }
    if (obj.x1 == null) continue
    minX = Math.min(minX, obj.x1, obj.x2)
    maxX = Math.max(maxX, obj.x1, obj.x2)
    minY = Math.min(minY, obj.y1, obj.y2)
    maxY = Math.max(maxY, obj.y1, obj.y2)
  }
  return {
    minX: Math.floor(minX - pad),
    minY: Math.floor(minY - pad),
    maxX: Math.ceil(maxX + pad),
    maxY: Math.ceil(maxY + pad),
  }
}

function isBarrier(data, idx) {
  return data[idx] < 200 || data[idx + 1] < 200 || data[idx + 2] < 200
}

/**
 * Crea un relleno hatch limitado a la subregión cerrada bajo el clic.
 * @returns {object|null} hatchRegion
 */
export function hatchRasterScale(worldW, worldH, maxPixels = 4_000_000) {
  const area = Math.max(1, worldW * worldH)
  let scale = 4
  if (area * scale * scale > maxPixels) {
    scale = Math.sqrt(maxPixels / area)
  }
  return Math.max(0.25, scale)
}

export function createHatchRegionFromClick(objects, worldX, worldY, hatchKind, color) {
  const bounds = expandBounds(objects, worldX, worldY, 32)
  const w = Math.max(1, bounds.maxX - bounds.minX)
  const h = Math.max(1, bounds.maxY - bounds.minY)
  const scale = hatchRasterScale(w, h)
  const rw = Math.max(1, Math.round(w * scale))
  const rh = Math.max(1, Math.round(h * scale))
  if (rw * rh > 4_000_000) return null

  const ox = bounds.minX
  const oy = bounds.minY
  const sx = Math.round((worldX - ox) * scale)
  const sy = Math.round((worldY - oy) * scale)
  if (sx < 0 || sy < 0 || sx >= rw || sy >= rh) return null

  const edge = document.createElement('canvas')
  edge.width = rw
  edge.height = rh
  const ectx = edge.getContext('2d', { willReadFrequently: true })
  ectx.fillStyle = '#ffffff'
  ectx.fillRect(0, 0, rw, rh)
  ectx.save()
  ectx.translate(-ox * scale, -oy * scale)
  ectx.scale(scale, scale)
  for (const obj of objects || []) strokeObjectEdges(ectx, obj)
  ectx.restore()

  const img = ectx.getImageData(0, 0, rw, rh)
  const { data } = img
  const startIdx = (sy * rw + sx) * 4
  if (isBarrier(data, startIdx)) return null

  const visited = new Uint8Array(rw * rh)
  const stack = [sx, sy]
  visited[sy * rw + sx] = 1
  let minX = sx
  let maxX = sx
  let minY = sy
  let maxY = sy
  let count = 0
  const maxPixels = rw * rh

  while (stack.length) {
    const y = stack.pop()
    const x = stack.pop()
    count += 1
    if (count > maxPixels) break
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue
      const ni = ny * rw + nx
      if (visited[ni]) continue
      if (isBarrier(data, ni * 4)) continue
      visited[ni] = 1
      stack.push(nx, ny)
    }
  }

  if (count < 8) return null
  if (count > rw * rh * 0.85) return null

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const mask = document.createElement('canvas')
  mask.width = bw
  mask.height = bh
  const mctx = mask.getContext('2d')
  const mid = mctx.createImageData(bw, bh)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!visited[y * rw + x]) continue
      const oi = ((y - minY) * bw + (x - minX)) * 4
      mid.data[oi] = 255
      mid.data[oi + 1] = 255
      mid.data[oi + 2] = 255
      mid.data[oi + 3] = 255
    }
  }
  mctx.putImageData(mid, 0, 0)

  const maskDataUri = mask.toDataURL('image/png')
  // Precargar en caché de dibujo
  const preload = new Image()
  preload.src = maskDataUri
  drawHatchRegion._cache = drawHatchRegion._cache || {}
  drawHatchRegion._cache[maskDataUri] = preload

  return {
    type: 'hatchRegion',
    maskDataUri,
    livePattern: true,
    x: ox + (minX / scale),
    y: oy + (minY / scale),
    w: bw / scale,
    h: bh / scale,
    hatch: hatchKind,
    color: color || undefined,
  }
}

export function makeHatchPattern(ctx, kind, color) {
  const k = Number(kind)
  const ink = color || '#1e293b'
  if (k === 5) {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 4
    const g = c.getContext('2d')
    g.fillStyle = ink
    g.fillRect(0, 0, 4, 4)
    return ctx.createPattern(c, 'repeat')
  }
  if (k === 6) {
    const c = document.createElement('canvas')
    c.width = 24
    c.height = 16
    const g = c.getContext('2d')
    g.strokeStyle = ink
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, 0.5); g.lineTo(24, 0.5)
    g.moveTo(0, 8.5); g.lineTo(24, 8.5)
    g.moveTo(0, 15.5); g.lineTo(24, 15.5)
    g.moveTo(0.5, 0); g.lineTo(0.5, 8)
    g.moveTo(12.5, 0); g.lineTo(12.5, 8)
    g.moveTo(6.5, 8); g.lineTo(6.5, 16)
    g.moveTo(18.5, 8); g.lineTo(18.5, 16)
    g.stroke()
    return ctx.createPattern(c, 'repeat')
  }
  if (k === 7) {
    const c = document.createElement('canvas')
    c.width = 24
    c.height = 24
    const g = c.getContext('2d')
    g.strokeStyle = ink
    g.lineWidth = 1
    const tuft = (x, y) => {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x - 2.4, y - 5.5)
      g.moveTo(x, y)
      g.lineTo(x + 2.4, y - 5.5)
      g.moveTo(x, y)
      g.lineTo(x, y - 6.5)
      g.stroke()
    }
    tuft(5, 9)
    tuft(13, 7)
    tuft(20, 11)
    tuft(8, 19)
    tuft(17, 21)
    return ctx.createPattern(c, 'repeat')
  }
  const c = document.createElement('canvas')
  c.width = 10
  c.height = 10
  const g = c.getContext('2d')
  g.strokeStyle = ink
  g.fillStyle = ink
  g.lineWidth = 1
  if (k === 0) {
    g.beginPath(); g.moveTo(0, 10); g.lineTo(10, 0); g.stroke()
  } else if (k === 1) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 10); g.stroke()
  } else if (k === 2) {
    g.beginPath(); g.moveTo(0, 10); g.lineTo(10, 0); g.moveTo(0, 0); g.lineTo(10, 10); g.stroke()
  } else if (k === 3) {
    g.beginPath(); g.arc(5, 5, 1.2, 0, Math.PI * 2); g.fill()
  } else {
    g.beginPath(); g.moveTo(0, 5); g.lineTo(10, 5); g.stroke()
  }
  return ctx.createPattern(c, 'repeat')
}

function transformPoint(matrix, x, y) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  }
}

function rememberComposedHatch(cache, key, canvas) {
  cache[key] = canvas
  const keys = Object.keys(cache)
  if (keys.length > 24) delete cache[keys[0]]
}

export function drawHatchRegion(ctx, obj, ui) {
  if (!obj?.maskDataUri) return
  const cache = drawHatchRegion._cache || (drawHatchRegion._cache = {})
  const composed = drawHatchRegion._composed || (drawHatchRegion._composed = {})
  const key = obj.maskDataUri
  const paint = (img) => {
    if (!img?.naturalWidth) return
    const x = obj.x || 0
    const y = obj.y || 0
    const w = obj.w || img.width
    const h = obj.h || img.height
    if (!obj.livePattern) {
      ctx.drawImage(img, x, y, w, h)
      return
    }
    const t = ctx.getTransform()
    const p1 = transformPoint(t, x, y)
    const p2 = transformPoint(t, x + w, y + h)
    const sx = Math.min(p1.x, p2.x)
    const sy = Math.min(p1.y, p2.y)
    const sw = Math.max(1, Math.abs(p2.x - p1.x))
    const sh = Math.max(1, Math.abs(p2.y - p1.y))
    const cap = 2048
    const down = Math.max(sw, sh) > cap ? cap / Math.max(sw, sh) : 1
    const ow = Math.max(1, Math.round(sw * down))
    const oh = Math.max(1, Math.round(sh * down))
    const ink = esquemaEntityInk(obj.color, ui)
    const ckey = `${key}|${obj.hatch}|${ink}|${ow}x${oh}`
    let off = composed[ckey]
    if (!off) {
      off = document.createElement('canvas')
      off.width = ow
      off.height = oh
      const octx = off.getContext('2d')
      const pattern = makeHatchPattern(octx, obj.hatch, ink)
      octx.fillStyle = pattern || ink
      octx.fillRect(0, 0, ow, oh)
      octx.globalCompositeOperation = 'destination-in'
      octx.drawImage(img, 0, 0, ow, oh)
      rememberComposedHatch(composed, ckey, off)
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(off, sx, sy, sw, sh)
    ctx.restore()
  }
  if (cache[key]?.complete && cache[key].naturalWidth) {
    paint(cache[key])
    return
  }
  const img = new Image()
  cache[key] = img
  img.onload = () => paint(img)
  img.src = key
}

/** Espera a que todas las imágenes de hatchRegion estén listas (p. ej. antes de exportar PNG). */
export function preloadHatchRegions(objects) {
  const list = (objects || []).filter((o) => o?.type === 'hatchRegion' && o.maskDataUri)
  if (!list.length) return Promise.resolve()
  const cache = drawHatchRegion._cache || (drawHatchRegion._cache = {})
  return Promise.all(list.map((o) => new Promise((resolve) => {
    const key = o.maskDataUri
    if (cache[key]?.complete && cache[key].naturalWidth) {
      resolve()
      return
    }
    const img = new Image()
    cache[key] = img
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = key
  })))
}
