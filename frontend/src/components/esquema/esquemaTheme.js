/**
 * Paleta de interfaz del editor de esquema, derivada de los tokens de plataforma (`t`).
 * No altera el color guardado de las entidades que el usuario ya personalizó.
 */
import { ADMIN_THEME, isLikelyDarkBackground } from '../../theme/adminPanelTheme.js'

const SNAP_LIGHT = {
  end: '#2563eb',
  mid: '#16a34a',
  center: '#9333ea',
  quad: '#0891b2',
  node: '#db2777',
  near: '#64748b',
  perp: '#d97706',
  ortho: '#64748b',
}

const SNAP_DARK = {
  end: '#93c5fd',
  mid: '#4ade80',
  center: '#d8b4fe',
  quad: '#67e8f9',
  node: '#f9a8d4',
  near: '#94a3b8',
  perp: '#fbbf24',
  ortho: '#cbd5e1',
}

const SNAP_REST = {
  end: '#1d4ed8',
  mid: '#15803d',
  center: '#7e22ce',
  quad: '#0e7490',
  node: '#be185d',
  near: '#5c5346',
  perp: '#b45309',
  ortho: '#78716c',
}

export function esquemaThemeMode(t) {
  const bgCard = t?.bgCard || t?.bg || ''
  const bg = t?.bg || ''
  const blob = `${bgCard} ${bg}`.toLowerCase()
  const dark = isLikelyDarkBackground(bgCard) || isLikelyDarkBackground(bg)
  const rest = !dark && /f2ede4|e8e0d5|ede6dc|faf6ef/.test(blob)
  return { dark, rest }
}

export function esquemaUiTheme(t) {
  const tok = t && typeof t === 'object' ? t : ADMIN_THEME.light
  const { dark, rest } = esquemaThemeMode(tok)
  const canvas = tok.bgCard || (dark ? '#0F2038' : rest ? '#F2EDE4' : '#FFFFFF')
  const wrap = tok.bg || (dark ? '#0A1628' : rest ? '#E8E0D5' : '#F0F9FF')
  const primary = tok.primary || (dark ? '#00B4C6' : rest ? '#0E7490' : '#0077B6')
  const text = tok.text || (dark ? '#E0F2FE' : rest ? '#2A2318' : '#0F2942')
  const muted = tok.textMuted || (dark ? '#7FB3D3' : rest ? '#5C5346' : '#4A7FA5')
  const border = tok.border || (dark ? '#1E3A5F' : rest ? '#C9B8A4' : '#BAE6FD')
  return {
    dark,
    rest,
    canvas,
    wrap,
    ink: text,
    text,
    muted,
    primary,
    border,
    inputBg: tok.inputBg || wrap,
    overlay: tok.overlay || (dark ? 'rgba(0,0,0,0.75)' : rest ? 'rgba(42,35,24,0.45)' : 'rgba(15,23,42,0.48)'),
    card: canvas,
    shadow: tok.shadow || (dark ? '0 2px 12px rgba(0,0,0,0.40)' : '0 2px 12px rgba(0,119,182,0.10)'),
    grid: dark ? 'rgba(127, 179, 211, 0.40)' : rest ? 'rgba(92, 83, 70, 0.34)' : 'rgba(74, 127, 165, 0.38)',
    snap: dark ? SNAP_DARK : rest ? SNAP_REST : SNAP_LIGHT,
    snapGuide: dark ? 'rgba(147, 197, 253, 0.65)' : rest ? 'rgba(29, 78, 216, 0.50)' : 'rgba(37, 99, 235, 0.55)',
    snapOrtho: dark ? 'rgba(203, 213, 225, 0.75)' : rest ? 'rgba(120, 113, 108, 0.70)' : 'rgba(100, 116, 139, 0.70)',
    selection: primary,
    handleFill: canvas,
    northFill: canvas,
    northStroke: border,
    northInk: text,
    hudBg: dark ? 'rgba(15,32,56,0.94)' : rest ? 'rgba(242,237,228,0.96)' : 'rgba(255,255,255,0.94)',
    hudTyping: dark ? 'rgba(42,26,10,0.95)' : rest ? '#FEF3C7' : '#FFFBEB',
    marqueeFill: dark ? 'rgba(0,180,198,0.16)' : rest ? 'rgba(14,116,144,0.12)' : 'rgba(0,119,182,0.12)',
    marqueeStroke: primary,
    crossingFill: dark ? 'rgba(74,222,128,0.14)' : 'rgba(22,163,74,0.10)',
    crossingStroke: dark ? '#4ade80' : '#16a34a',
    rotateStroke: dark ? '#c4b5fd' : '#7c3aed',
    rotateFill: dark ? '#2e1065' : '#ede9fe',
    scaleStroke: dark ? '#34d399' : '#059669',
    scaleFill: dark ? '#064e3b' : '#d1fae5',
    guide: primary,
    cellBg: dark ? 'rgba(15,32,56,0.92)' : rest ? 'rgba(250,246,239,0.94)' : 'rgba(255,255,255,0.92)',
    previewBg: canvas,
  }
}

export const DEFAULT_ESQUEMA_UI = esquemaUiTheme(ADMIN_THEME.light)

const THEME_DEFAULT_INKS = new Set(
  [ADMIN_THEME.light.text, ADMIN_THEME.dark.text, ADMIN_THEME.rest.text, '#1e293b', '#0f172a']
    .map((c) => String(c).toLowerCase()),
)

export function resolveEsquemaUi(ui) {
  return ui && ui.canvas ? ui : DEFAULT_ESQUEMA_UI
}

/** Tinta de entidad: color explícito del usuario, o tinta del tema si es el default. */
export function esquemaEntityInk(color, ui) {
  const palette = resolveEsquemaUi(ui)
  if (!color) return palette.ink
  return THEME_DEFAULT_INKS.has(String(color).toLowerCase()) ? palette.ink : color
}
