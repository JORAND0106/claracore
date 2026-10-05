/**
 * Tokens visuales de tooltips institucionales ClaraCore (sin JSX — testeable en Node).
 * Alineados con themes claro / oscuro / descansar (auto resuelve a claro u oscuro).
 */
import { ADMIN_THEME, isDarkMode, isRestMode } from '../theme/adminPanelTheme.js'
import { CC_MODAL_FAVICON_SRC, CC_MODAL_BRAND_NAME } from './ccModalBrandTheme.js'

export { CC_MODAL_FAVICON_SRC as CC_TOOLTIP_FAVICON_SRC, CC_MODAL_BRAND_NAME as CC_TOOLTIP_BRAND_NAME }

/** Umbral: textos más largos o multilínea se tratan como ayuda (con logo). */
export const CC_TOOLTIP_HELP_CHARS = 90

/**
 * @param {string|null|undefined} themeMode light|dark|rest|auto|undefined
 * @returns {'light'|'dark'|'rest'}
 */
export function resolveTooltipThemeMode(themeMode) {
  if (typeof document !== 'undefined') {
    const ds = document.documentElement?.dataset?.ccTheme
    if (ds === 'light' || ds === 'dark' || ds === 'rest') return ds
  }
  if (themeMode === 'auto') {
    const hour = new Date().getHours()
    return hour >= 7 && hour < 19 ? 'light' : 'dark'
  }
  if (isDarkMode(themeMode)) return 'dark'
  if (isRestMode(themeMode)) return 'rest'
  if (themeMode === 'light') return 'light'
  return 'light'
}

/**
 * @param {'light'|'dark'|'rest'} mode
 */
export function ccTooltipPalette(mode) {
  const base = ADMIN_THEME[mode] || ADMIN_THEME.light
  if (mode === 'dark') {
    return {
      bg: base.bgCard,
      border: base.primary,
      text: base.text,
      textMuted: base.textMuted,
      shadow: '0 10px 28px rgba(0,0,0,0.45)',
      accent: base.primary,
      headerBg: 'rgba(0,180,198,0.12)',
      headerBorder: base.border,
      brand: base.text,
    }
  }
  if (mode === 'rest') {
    return {
      bg: base.bgCard,
      border: base.primary,
      text: base.text,
      textMuted: base.textMuted,
      shadow: '0 8px 22px rgba(42,35,24,0.16)',
      accent: base.primary,
      headerBg: 'rgba(14,116,144,0.08)',
      headerBorder: base.border,
      brand: base.primary,
    }
  }
  return {
    bg: base.bgCard,
    border: base.primary,
    text: base.text,
    textMuted: base.textMuted,
    shadow: '0 8px 24px rgba(0,119,182,0.18)',
    accent: base.primary,
    headerBg: 'rgba(0,119,182,0.06)',
    headerBorder: base.border,
    brand: '#0A4D68',
  }
}

/**
 * @param {Element} el
 * @param {string} text
 * @returns {'short'|'help'}
 */
export function resolveTooltipVariant(el, text) {
  const raw = String(text || '')
  const explicit = el?.getAttribute?.('data-cc-tooltip-variant')
  if (explicit === 'help' || el?.hasAttribute?.('data-cc-tooltip-help')) return 'help'
  if (explicit === 'short') return 'short'
  if (raw.includes('\n') || raw.length > CC_TOOLTIP_HELP_CHARS) return 'help'
  return 'short'
}

/**
 * Posiciona el tip relativo al ancla (elemento), sin taparlo y sin salir del viewport.
 * @returns {{ left: number, top: number }}
 */
export function placeTooltipRect(anchorRect, tipSize, viewport, gap = 10, pad = 10) {
  const vw = viewport.width
  const vh = viewport.height
  const tw = tipSize.width
  const th = tipSize.height
  const ax = anchorRect.left + anchorRect.width / 2

  // Preferir arriba del elemento
  let top = anchorRect.top - th - gap
  let left = ax - tw / 2

  if (top < pad) {
    // Abajo
    top = anchorRect.bottom + gap
  }
  if (top + th > vh - pad) {
    // Lateral: derecha o izquierda del ancla
    top = Math.min(Math.max(pad, anchorRect.top), vh - pad - th)
    left = anchorRect.right + gap
    if (left + tw > vw - pad) left = anchorRect.left - tw - gap
  }

  left = Math.min(Math.max(pad, left), Math.max(pad, vw - pad - tw))
  top = Math.min(Math.max(pad, top), Math.max(pad, vh - pad - th))
  return { left, top }
}

/**
 * Mueve `title` → `data-cc-title-held` para que el tip nativo del navegador
 * (negro/blanco, auto-cierre ~2s) nunca aparezca.
 * @param {Element} el
 */
export function adoptNativeTitle(el) {
  if (!el || el.nodeType !== 1 || !el.getAttribute) return false
  if (el.id === 'cc-title-tooltip') return false
  if (el.closest?.('[data-cc-tooltip-off]')) return false
  if (!el.hasAttribute('title')) return false
  const raw = el.getAttribute('title')
  el.removeAttribute('title')
  if (raw == null || !String(raw).trim()) return true
  el.setAttribute('data-cc-title-held', String(raw))
  return true
}

/**
 * @param {ParentNode|Element|null|undefined} root
 * @returns {number} cantidad de titles adoptados
 */
export function adoptNativeTitlesInTree(root) {
  if (!root) return 0
  let n = 0
  if (root.nodeType === 1 && root.hasAttribute?.('title')) {
    if (adoptNativeTitle(root)) n += 1
  }
  const list = root.querySelectorAll?.('[title]')
  if (!list) return n
  Array.from(list).forEach((el) => {
    if (adoptNativeTitle(el)) n += 1
  })
  return n
}
