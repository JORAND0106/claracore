/**
 * Escala tipográfica unificada (botones: Pequeña / Mediana / Grande en el header).
 * Todos los px pasan a variables --cc-* en documentElement para leerse con var(--cc-body), etc.
 */

export const CLARA_FONT_KEYS = ['pequena', 'normal', 'grande']

/** Tamaños base — pequeña / mediana / grande con salto claro (accesibilidad, baja visión) */
const SCALES = {
  pequena: {
    caption: 10,
    label: 11,
    sm: 12,
    body: 13,
    input: 13,
    md: 14,
    lg: 15,
    title: 16,
    h2: 18,
    h1: 20,
  },
  normal: {
    caption: 12,
    label: 13,
    sm: 14,
    body: 15,
    input: 15,
    md: 16,
    lg: 18,
    title: 19,
    h2: 21,
    h1: 24,
  },
  grande: {
    caption: 14,
    label: 15,
    sm: 16,
    body: 18,
    input: 18,
    md: 20,
    lg: 22,
    title: 23,
    h2: 26,
    h1: 30,
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
