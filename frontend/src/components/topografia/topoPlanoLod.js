/** Umbrales de zoom del Plano de poligonal (LOD de etiquetas). */
export const PLANO_LOD = {
  /** Por debajo: solo nombres (si caben). */
  MID: 1.35,
  /** Por encima: ángulos + coordenadas. */
  HIGH: 2.6,
}

/**
 * Nivel de detalle según scale del viewport (1 = vista inicial).
 * @returns {{ level: 0|1|2, showNombres: true, showDistancias: boolean, showAngulos: boolean, showCoords: boolean }}
 */
export function resolvePlanoLod(scale) {
  const s = Number(scale) || 1
  if (s < PLANO_LOD.MID) {
    return {
      level: 0,
      showNombres: true,
      showDistancias: false,
      showAngulos: false,
      showCoords: false,
    }
  }
  if (s < PLANO_LOD.HIGH) {
    return {
      level: 1,
      showNombres: true,
      showDistancias: true,
      showAngulos: false,
      showCoords: false,
    }
  }
  return {
    level: 2,
    showNombres: true,
    showDistancias: true,
    showAngulos: true,
    showCoords: true,
  }
}

/**
 * Separación mínima en píxeles de pantalla para no amontonar etiquetas.
 * A mayor nivel LOD, se tolera un poco menos (hay más espacio visual por punto).
 */
export function minLabelGapPx(lodLevel) {
  if (lodLevel >= 2) return 18
  if (lodLevel >= 1) return 24
  return 28
}

/**
 * Elige qué puntos muestran etiqueta de nombre sin superponerse en pantalla.
 * Distancia en SVG × scale ≈ separación en pantalla.
 *
 * @param {Array<{ x: number, y: number }>} points
 * @param {number} scale
 * @param {number} [lodLevel=0]
 * @returns {boolean[]} visible[i] alineado con points
 */
export function pickVisibleLabelIndices(points, scale, lodLevel = 0) {
  const s = Math.max(Number(scale) || 1, 0.01)
  const minPx = minLabelGapPx(lodLevel)
  const minSvg = minPx / s
  const minSvg2 = minSvg * minSvg
  const shown = []
  const visible = new Array(points.length).fill(false)

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]
    if (p?.x == null || p?.y == null) continue
    let ok = true
    for (let j = 0; j < shown.length; j += 1) {
      const q = shown[j]
      const dx = p.x - q.x
      const dy = p.y - q.y
      if (dx * dx + dy * dy < minSvg2) {
        ok = false
        break
      }
    }
    if (ok) {
      visible[i] = true
      shown.push(p)
    }
  }
  return visible
}

/**
 * Factor de counter-scale para texto dentro de un SVG ya escalado por `scale`.
 * Mantiene tamaño aproximado en pantalla.
 */
export function textCounterScale(scale) {
  const s = Math.max(Number(scale) || 1, 0.01)
  // Limitar para que no se vuelva enorme al alejar ni microscópico al acercar
  return Math.min(2.2, Math.max(0.35, 1 / s))
}
