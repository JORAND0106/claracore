/**
 * Recorte heurístico del área del documento vía Canvas (sin dependencias).
 * Si falla o el navegador no soporta, devuelve el archivo original (sin error).
 */

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality)
  })
}

/**
 * Detecta un rectángulo de documento por contraste de bordes en una miniatura.
 * @returns {{ x: number, y: number, w: number, h: number } | null} coords en espacio de análisis
 */
function detectDocumentRect(gray, w, h) {
  const edge = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = gray[i + 1] - gray[i - 1]
      const gy = gray[i + w] - gray[i - w]
      edge[i] = Math.abs(gx) + Math.abs(gy)
    }
  }

  let sum = 0
  let count = 0
  for (let i = 0; i < edge.length; i++) {
    if (edge[i] > 0) {
      sum += edge[i]
      count++
    }
  }
  if (!count) return null
  const mean = sum / count
  const threshold = Math.max(28, mean * 1.35)

  const margin = Math.max(2, Math.floor(Math.min(w, h) * 0.02))
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  let hits = 0
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      if (edge[y * w + x] >= threshold) {
        hits++
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (hits < Math.max(80, (w * h) * 0.002)) return null

  const pad = Math.max(4, Math.floor(Math.min(w, h) * 0.03))
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad)
  maxY = Math.min(h - 1, maxY + pad)

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const areaRatio = (bw * bh) / (w * h)
  if (areaRatio < 0.18 || areaRatio > 0.98) return null
  if (bw < w * 0.25 || bh < h * 0.25) return null

  return { x: minX, y: minY, w: bw, h: bh }
}

/**
 * Intenta recortar el documento de una foto. Fallback silencioso al original.
 * @param {File} file
 * @returns {Promise<File>}
 */
export async function cropDocumentFromImage(file) {
  try {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return file
    if (typeof document === 'undefined' || !document.createElement) return file

    const img = await loadImageFromFile(file)
    const ow = img.naturalWidth || img.width
    const oh = img.naturalHeight || img.height
    if (!ow || !oh) return file

    const maxAnalyze = 640
    const scale = Math.min(1, maxAnalyze / Math.max(ow, oh))
    const aw = Math.max(1, Math.round(ow * scale))
    const ah = Math.max(1, Math.round(oh * scale))

    const analyze = document.createElement('canvas')
    analyze.width = aw
    analyze.height = ah
    const actx = analyze.getContext('2d', { willReadFrequently: true })
    if (!actx) return file
    actx.drawImage(img, 0, 0, aw, ah)

    let imageData
    try {
      imageData = actx.getImageData(0, 0, aw, ah)
    } catch {
      return file
    }

    const { data } = imageData
    const gray = new Float32Array(aw * ah)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }

    const rect = detectDocumentRect(gray, aw, ah)
    if (!rect) return file

    const sx = Math.max(0, Math.floor(rect.x / scale))
    const sy = Math.max(0, Math.floor(rect.y / scale))
    const sw = Math.min(ow - sx, Math.ceil(rect.w / scale))
    const sh = Math.min(oh - sy, Math.ceil(rect.h / scale))
    if (sw < 40 || sh < 40) return file
    if (sw * sh >= ow * oh * 0.97) return file

    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const octx = out.getContext('2d')
    if (!octx) return file
    octx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await canvasToBlob(out, mime, 0.92)
    if (!blob || blob.size < 100) return file

    const base = (file.name || 'soporte').replace(/\.[^.]+$/, '')
    const ext = mime === 'image/png' ? '.png' : '.jpg'
    return new File([blob], `${base}_doc${ext}`, { type: mime, lastModified: Date.now() })
  } catch {
    return file
  }
}
