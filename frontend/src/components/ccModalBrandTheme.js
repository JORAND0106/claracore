/**
 * Tema / colores del wordmark ClaraCore en cintas de popup (sin JSX — testeable en Node).
 */
import { isDarkMode, isRestMode } from '../theme/adminPanelTheme.js'

export const CC_MODAL_FAVICON_SRC = '/favicon.png?v=3'
export const CC_MODAL_BRAND_NAME = 'ClaraCore'
export const CC_MODAL_BRAND_ICON_PX = 26
export const CC_MODAL_BRAND_FONT = 'var(--cc-sm, 14px)'
export const CC_MODAL_BRAND_PAD_Y = 10
export const CC_MODAL_BRAND_PAD_X = 16

/**
 * @param {object|string|null|undefined} theme
 */
export function resolveModalThemeIsDark(theme) {
  if (typeof theme === 'string') {
    return isDarkMode(theme)
  }
  if (theme && typeof theme === 'object') {
    if (theme.isDark === true || theme.mode === 'dark') return true
    if (theme.isDark === false || theme.mode === 'light' || theme.mode === 'rest') return false
    const bg = String(theme.bgCard || theme.bg || '').toLowerCase()
    if (bg.startsWith('#0f2038') || bg.startsWith('#0a1628')) return true
  }
  if (typeof document !== 'undefined') {
    const ds = document.documentElement?.dataset?.ccTheme
    if (ds === 'dark') return true
    if (ds === 'light' || ds === 'rest') return false
  }
  return false
}

/**
 * @param {object|string|null|undefined} theme
 */
export function claraCoreBrandTextColor(theme) {
  if (resolveModalThemeIsDark(theme)) {
    return (theme && typeof theme === 'object' && theme.text) || '#E0F2FE'
  }
  if (typeof theme === 'string' && isRestMode(theme)) {
    return '#0E7490'
  }
  if (theme && typeof theme === 'object' && theme.mode === 'rest') {
    return theme.primary || '#0E7490'
  }
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.ccTheme === 'rest') {
    return '#0E7490'
  }
  return (theme && typeof theme === 'object' && theme.text) || '#0A4D68'
}

/**
 * @param {object|string|null|undefined} theme
 */
export function ccModalBrandHeaderStyle(theme) {
  const dark = resolveModalThemeIsDark(theme)
  const border = (theme && typeof theme === 'object' && theme.border) || (dark ? '#1E3A5F' : '#BAE6FD')
  const bg = (theme && typeof theme === 'object' && (theme.headerBg || theme.bgCard)) || (dark ? '#0F2038' : '#FFFFFF')
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: `${CC_MODAL_BRAND_PAD_Y}px ${CC_MODAL_BRAND_PAD_X}px`,
    minHeight: CC_MODAL_BRAND_ICON_PX + CC_MODAL_BRAND_PAD_Y * 2,
    boxSizing: 'border-box',
    borderBottom: `1px solid ${border}`,
    background: bg,
    flexShrink: 0,
  }
}
