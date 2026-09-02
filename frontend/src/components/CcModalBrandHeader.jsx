/**
 * Cinta de marca ClaraCore para encabezados de popups/modales.
 * Usa el favicon institucional (ícono circular sin texto) + wordmark "ClaraCore".
 * Color del texto: azulado oscuro en tema claro/descanso; claro en tema oscuro.
 */
import { isDarkMode, isRestMode } from '../theme/adminPanelTheme'

export const CC_MODAL_FAVICON_SRC = '/favicon.png?v=3'
export const CC_MODAL_BRAND_NAME = 'ClaraCore'

/** Altura del ícono y tipografía proporcional (misma en todos los popups). */
export const CC_MODAL_BRAND_ICON_PX = 26
export const CC_MODAL_BRAND_FONT = 'var(--cc-sm, 14px)'
export const CC_MODAL_BRAND_PAD_Y = 10
export const CC_MODAL_BRAND_PAD_X = 16

/**
 * Resuelve si el tema activo es oscuro (prop `theme`/`t` o `document.documentElement.dataset.ccTheme`).
 * @param {object|string|null|undefined} theme
 */
export function resolveModalThemeIsDark(theme) {
  if (typeof theme === 'string') {
    return isDarkMode(theme)
  }
  if (theme && typeof theme === 'object') {
    if (theme.isDark === true || theme.mode === 'dark') return true
    if (theme.isDark === false || theme.mode === 'light' || theme.mode === 'rest') return false
    // Heurística: fondos de tarjeta oscuros usados en la plataforma
    const bg = String(theme.bgCard || theme.bg || '').toLowerCase()
    if (bg && (bg.includes('#0') || bg.includes('rgb(10') || bg.includes('rgb(15'))) {
      // #0A1628 / #0F2038 típicos de dark
      if (/^#0[0-9a-f]{5}$/i.test(bg) || bg.startsWith('#0f2038') || bg.startsWith('#0a1628')) {
        return true
      }
    }
  }
  if (typeof document !== 'undefined') {
    const ds = document.documentElement?.dataset?.ccTheme
    if (ds === 'dark') return true
    if (ds === 'light' || ds === 'rest') return false
  }
  return false
}

/**
 * Color del wordmark según tema.
 * @param {object|string|null|undefined} theme
 */
export function claraCoreBrandTextColor(theme) {
  if (resolveModalThemeIsDark(theme)) {
    return (theme && theme.text) || '#E0F2FE'
  }
  if (typeof theme === 'string' && isRestMode(theme)) {
    return '#0E7490'
  }
  if (theme && theme.mode === 'rest') {
    return theme.primary || '#0E7490'
  }
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.ccTheme === 'rest') {
    return '#0E7490'
  }
  // Tema claro: azulado oscuro (no el primary cian brillante)
  return (theme && theme.text) || '#0A4D68'
}

/**
 * Estilos de la cinta (para tests / composición).
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

/**
 * @param {{ theme?: object|string, style?: object, className?: string }} props
 */
export default function CcModalBrandHeader({ theme, style, className }) {
  const color = claraCoreBrandTextColor(theme)
  return (
    <div
      className={className}
      data-cc-modal-brand="1"
      role="banner"
      aria-label="ClaraCore"
      style={{ ...ccModalBrandHeaderStyle(theme), ...(style || {}) }}
    >
      <img
        src={CC_MODAL_FAVICON_SRC}
        alt=""
        width={CC_MODAL_BRAND_ICON_PX}
        height={CC_MODAL_BRAND_ICON_PX}
        draggable={false}
        style={{
          width: CC_MODAL_BRAND_ICON_PX,
          height: CC_MODAL_BRAND_ICON_PX,
          objectFit: 'contain',
          flexShrink: 0,
          display: 'block',
        }}
      />
      <span
        style={{
          fontSize: CC_MODAL_BRAND_FONT,
          fontWeight: 800,
          letterSpacing: '0.02em',
          color,
          lineHeight: 1.2,
          userSelect: 'none',
        }}
      >
        {CC_MODAL_BRAND_NAME}
      </span>
    </div>
  )
}
