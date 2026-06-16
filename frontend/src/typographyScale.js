/**
 * Escala tipográfica unificada (botones: Pequeña / Mediana / Grande en el header).
 * Todos los px pasan a variables --cc-* en documentElement para leerse con var(--cc-body), etc.
 */

export const CLARA_FONT_KEYS = ['pequena', 'normal', 'grande']

/** Tamaños base — pequeña / mediana / grande con salto claro (accesibilidad, baja visión) */
const SCALES = {
  /* Pequeña: +2px respecto a la escala previa; mediana y grande reescaladas para notar el salto. */
  pequena: {
    caption: 12,
    label: 13,
    sm: 14,
    body: 15,
    input: 15,
    md: 16,
    lg: 17,
    title: 18,
    h2: 20,
    h1: 22,
  },
  normal: {
    caption: 15,
    label: 16,
    sm: 17,
    body: 18,
    input: 18,
    md: 19,
    lg: 21,
    title: 22,
    h2: 24,
    h1: 27,
  },
  grande: {
    caption: 17,
    label: 18,
    sm: 19,
    body: 21,
    input: 21,
    md: 23,
    lg: 25,
    title: 26,
    h2: 29,
    h1: 33,
  },
}

/** Espaciado (padding/gap/margin) coherente con el tamaño elegido */
const SPACES = {
  pequena: { 1: 4, 2: 6, 3: 8, 4: 10, 5: 12, 6: 16 },
  normal: { 1: 4, 2: 8, 3: 10, 4: 12, 5: 16, 6: 20 },
  grande: { 1: 5, 2: 9, 3: 12, 4: 14, 5: 18, 6: 24 },
}

const PX = (n) => `${Math.round(n * 10) / 10}px`

/**
 * Aplica --cc-* y --cc-space-* en <html>. Convive con --font-size-base (alias de body).
 */
export function applyClaraTypography(fontKey) {
  const k = CLARA_FONT_KEYS.includes(fontKey) ? fontKey : 'normal'
  const s = SCALES[k]
  const sp = SPACES[k]
  const r = document.documentElement
  r.style.setProperty('--cc-caption', PX(s.caption))
  r.style.setProperty('--cc-xs', PX(s.caption))
  r.style.setProperty('--cc-label', PX(s.label))
  r.style.setProperty('--cc-sm', PX(s.sm))
  r.style.setProperty('--cc-body', PX(s.body))
  r.style.setProperty('--cc-input', PX(s.input))
  r.style.setProperty('--cc-md', PX(s.md))
  r.style.setProperty('--cc-lg', PX(s.lg))
  r.style.setProperty('--cc-title', PX(s.title))
  r.style.setProperty('--cc-h2', PX(s.h2))
  r.style.setProperty('--cc-h1', PX(s.h1))
  for (const n of [1, 2, 3, 4, 5, 6]) {
    r.style.setProperty(`--cc-space-${n}`, PX(sp[n]))
  }
  r.style.setProperty('--font-size-base', PX(s.body))
}

/**
 * Tamaños en px (inline) alineados con SCALES — útil cuando el bloque UI debe
 * reaccionar de forma fiable al prop `fontSize` (p. ej. módulo Inicio).
 */
export function getClaraTypeScaleInline(fontKey) {
  const k = CLARA_FONT_KEYS.includes(fontKey) ? fontKey : 'normal'
  const s = SCALES[k]
  return {
    caption: PX(s.caption),
    label: PX(s.label),
    sm: PX(s.sm),
    body: PX(s.body),
    input: PX(s.input),
    md: PX(s.md),
    lg: PX(s.lg),
    title: PX(s.title),
    h2: PX(s.h2),
    h1: PX(s.h1),
  }
}

/** Densidad UI del tab Resumen / mapa (sincronizado con la misma clave) */
export function getDashTypoUI(fontKey) {
  const k = CLARA_FONT_KEYS.includes(fontKey) ? fontKey : 'normal'
  if (k === 'pequena') {
    return {
      title: 12, sub: 11, body: 11, table: 10, rowLabel: 11, legend: 11, chartLabel: 10, chartAxis: 10, chartTip: 10, barH: 10, rowGap: 5, padLabelW: 128,
      kpiLabel: 11, kpiValue: 17, kpiSub: 11, tab: 12,
    }
  }
  if (k === 'grande') {
    return {
      title: 16, sub: 14, body: 14, table: 13, rowLabel: 13, legend: 14, chartLabel: 13, chartAxis: 12, chartTip: 13, barH: 12, rowGap: 8, padLabelW: 220,
      kpiLabel: 13, kpiValue: 22, kpiSub: 13, tab: 15,
    }
  }
  return {
    title: 14, sub: 12, body: 12, table: 11, rowLabel: 12, legend: 12, chartLabel: 11, chartAxis: 10, chartTip: 11, barH: 10, rowGap: 6, padLabelW: 176,
    kpiLabel: 12, kpiValue: 19, kpiSub: 12, tab: 14,
  }
}
