/**
 * Resaltes de fila por nivel en la grilla Excel del popup de Tarea.
 * - Nivel Tarea: azul suave (misma familia que ORIGEN_COLOR.tarea / #2563eb).
 * - Sub-ítems: slate tenue, claramente distinto y sin solapar estados
 *   (teal cumplido, rojo vencido, etc. — esos viven en chips/select, no en el fondo de fila).
 */
export const TAREA_ROW_HIGHLIGHT = {
  /** Fondo fila nivel principal (Tarea) */
  tarea: 'color-mix(in srgb, #2563eb 16%, transparent)',
  /** Fondo filas de checklist (sub-ítems) */
  subitem: 'color-mix(in srgb, #94a3b8 11%, transparent)',
  /** Fallback sólido si color-mix no aplica (tests / entornos viejos) */
  tareaSolid: '#e8effc',
  subitemSolid: '#f1f5f9',
}

/**
 * Contraste aproximado texto oscuro (#0f172a) sobre los fallbacks sólidos.
 * Ambos deben permanecer legibles (ratio WCAG AA ≥ 4.5 para texto normal).
 */
export function contrasteTextoSobre(hexBg, hexText = '#0f172a') {
  const toRgb = (hex) => {
    const h = String(hex || '').replace('#', '')
    if (h.length !== 6) return null
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  }
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = (rgb) => {
    if (!rgb) return 0
    const [r, g, b] = rgb.map(lin)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const L1 = lum(toRgb(hexText))
  const L2 = lum(toRgb(hexBg))
  const lighter = Math.max(L1, L2)
  const darker = Math.min(L1, L2)
  return (lighter + 0.05) / (darker + 0.05)
}
