const MIN_SCALE = 0.4
const MAX_SCALE = 12

/**
 * Zoom hacia un punto del contenedor con el mismo modelo de pan/scale
 * que antes usaba CSS `translate(pan) scale(scale)` + origin center.
 * Se conserva para gestos; el render usa viewBox (vectorial), no CSS scale.
 */
export function zoomPanAtPoint(
  pan,
  scale,
  nextScale,
  focalLocal,
  originLocal,
  { minScale = MIN_SCALE, maxScale = MAX_SCALE } = {},
) {
  const s0 = scale || 1
  const s1 = Math.min(maxScale, Math.max(minScale, nextScale))
  if (!(s0 > 0) || !Number.isFinite(s1)) {
    return { scale: s0, pan: { ...pan } }
  }
  const ratio = s1 / s0
  const fx = focalLocal.x
  const fy = focalLocal.y
  const ox = originLocal.x
  const oy = originLocal.y
  return {
    scale: s1,
    pan: {
      x: pan.x * ratio + (fx - ox) * (1 - ratio),
      y: pan.y * ratio + (fy - oy) * (1 - ratio),
    },
  }
}

/**
 * Convierte pan/scale (píxeles CSS del gesto) al viewBox SVG equivalente.
 * Evita `transform: scale()` en CSS, que rasteriza y pixeliza al acercar.
 *
 * Equivalente visual de:
 *   transform: translate(pan) scale(scale); transform-origin: center
 * sobre un SVG lógico 0..worldW × 0..worldH mostrado en cssW×cssH.
 */
export function viewBoxFromPanScale(worldW, worldH, scale, pan, cssW, cssH) {
  const s = Math.max(Number(scale) || 1, 1e-6)
  const ww = Math.max(Number(worldW) || 1, 1e-6)
  const wh = Math.max(Number(worldH) || 1, 1e-6)
  const cw = Math.max(Number(cssW) || ww, 1e-6)
  const ch = Math.max(Number(cssH) || wh, 1e-6)
  const px = Number(pan?.x) || 0
  const py = Number(pan?.y) || 0

  const vbW = ww / s
  const vbH = wh / s
  const vbX = (ww - vbW) / 2 - (px * ww) / (cw * s)
  const vbY = (wh - vbH) / 2 - (py * wh) / (ch * s)
  return {
    x: vbX,
    y: vbY,
    w: vbW,
    h: vbH,
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
  }
}

export { MIN_SCALE, MAX_SCALE }
