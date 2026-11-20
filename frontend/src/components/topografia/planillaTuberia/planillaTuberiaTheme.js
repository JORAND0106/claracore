/**
 * Resolución de superficies de Planilla Tubería a partir de useTopoTheme()
 * o del ui remapeado de los modales (cardBg / inputBg planos).
 * No inventa colores: reutiliza tokens del tema activo.
 */

/** Luminancia aproximada 0–1 del color de fondo (hex / rgb). */
export function planillaBgLuminance(bg) {
  const raw = String(bg || '').trim()
  let r = 248
  let g = 250
  let b = 252
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    const rgb = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
    if (rgb) {
      r = Number(rgb[1])
      g = Number(rgb[2])
      b = Number(rgb[3])
    }
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

export function planillaSurfaceFromUi(ui) {
  const t = (ui && ui.t) || {}
  const border = ui?.border || t.border || '#cbd5e1'
  const textMuted = ui?.textMuted || t.textMuted || '#64748b'
  const text = ui?.text || t.text || '#0f172a'
  const cardBg = ui?.cardBg || ui?.card?.background || t.bgCard || '#ffffff'
  const inputBg = ui?.inputBg || t.inputBg || '#f8fafc'
  const accent = ui?.accent || t.primary || '#2563eb'
  const accentSoft = ui?.accentSoft || `${accent}22`
  const grafico = ui?.grafico || {
    border: `1px solid ${border}`,
    background: inputBg,
    labelFill: textMuted,
    pointLabel: text,
  }
  const darkSurface = planillaBgLuminance(cardBg) < 0.45
  return {
    t,
    cardBg,
    inputBg,
    border,
    text,
    textMuted,
    accent,
    accentSoft,
    shadow: t.shadow,
    grafico,
    darkSurface,
    /** Franja de grupo (Resumen) + botón — tokens del tema, no gris/azul fijos. */
    grupoRowBg: accentSoft,
    grupoRowFg: accent,
    /** Cuadrícula / ejes del perfil: buen contraste en claro y oscuro. */
    gridStroke: textMuted,
    axisStroke: textMuted,
    /**
     * PNG de sección con fondo blanco: en superficies oscuras se invierte
     * para integrar el “papel” al panel sin perder el dibujo.
     */
    seccionImgFilter: darkSurface ? 'invert(1) hue-rotate(180deg)' : 'none',
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
