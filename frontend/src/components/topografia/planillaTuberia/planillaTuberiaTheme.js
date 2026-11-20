/**
 * Resolución de superficies de Planilla Tubería a partir de useTopoTheme()
 * o del ui remapeado de los modales (cardBg / inputBg planos).
 * No inventa colores: reutiliza tokens del tema activo.
 */

export function planillaSurfaceFromUi(ui) {
  const t = (ui && ui.t) || {}
  const border = ui?.border || t.border || '#cbd5e1'
  const textMuted = ui?.textMuted || t.textMuted || '#64748b'
  const text = ui?.text || t.text || '#0f172a'
  const cardBg = ui?.cardBg || ui?.card?.background || t.bgCard || '#ffffff'
  const inputBg = ui?.inputBg || t.inputBg || '#f8fafc'
  const accent = ui?.accent || t.primary || '#2563eb'
  const grafico = ui?.grafico || {
    border: `1px solid ${border}`,
    background: inputBg,
    labelFill: textMuted,
    pointLabel: text,
  }
  return {
    t,
    cardBg,
    inputBg,
    border,
    text,
    textMuted,
    accent,
    accentSoft: ui?.accentSoft || `${accent}22`,
    shadow: t.shadow,
    grafico,
    /** Cuadrícula / ejes del perfil: buen contraste en claro y oscuro. */
    gridStroke: textMuted,
    axisStroke: textMuted,
  }
}

/** Banner semántico suave sobre el fondo del tema (error | success | warn | info). */
export function planillaBannerStyle(kind, ui) {
  const s = planillaSurfaceFromUi(ui)
  const map = {
    error: { fg: 'var(--cc-color-danger)', tint: 'rgba(220, 38, 38, 0.12)', border: 'rgba(220, 38, 38, 0.35)' },
    success: { fg: 'var(--cc-color-success)', tint: 'rgba(4, 120, 87, 0.12)', border: 'rgba(4, 120, 87, 0.35)' },
    warn: { fg: '#b45309', tint: 'rgba(180, 83, 9, 0.14)', border: 'rgba(180, 83, 9, 0.35)' },
    info: { fg: s.accent, tint: s.accentSoft, border: `${s.accent}55` },
  }
  const m = map[kind] || map.info
  return {
    color: m.fg,
    background: m.tint,
    border: `1px solid ${m.border}`,
    borderRadius: 8,
    padding: 8,
  }
}
