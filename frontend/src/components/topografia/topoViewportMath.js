const MIN_SCALE = 0.4
const MAX_SCALE = 12

/**
 * Zoom hacia un punto del contenedor con transform
 * `translate(pan) scale(scale)` y `transform-origin: center center`.
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

export { MIN_SCALE, MAX_SCALE }
