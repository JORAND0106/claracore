import { useCallback, useLayoutEffect, useState } from 'react'

/**
 * Por encima de overlays de modales de plataforma.
 * Plan de actividades / Export / Form usan z≈100040–100070; ayuda mapa llega a ~100200.
 * El listado anclado (portal fixed) debe quedar siempre por delante.
 */
export const CC_ANCHORED_DROPDOWN_Z = 300000

/**
 * Posiciona un desplegable con `position:fixed` anclado a un input/elemento.
 * Evita el recorte por `overflow:hidden|auto` de modales y paneles, y reubica
 * arriba cuando no hay espacio debajo. Respeta zoom y visualViewport.
 *
 * @param {boolean} open
 * @param {{ current: Element|null }} anchorRef
 * @param {{ maxHeight?: number, gap?: number, zIndex?: number, minHeight?: number }} [opts]
 * @returns {import('react').CSSProperties|null}
 */
export function useAnchoredDropdown(open, anchorRef, {
  maxHeight = 240,
  gap = 4,
  zIndex = CC_ANCHORED_DROPDOWN_Z,
  minHeight = 80,
} = {}) {
  const [style, setStyle] = useState(null)

  const update = useCallback(() => {
    const el = anchorRef?.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const viewH = vv?.height ?? window.innerHeight
    const viewW = vv?.width ?? window.innerWidth
    const offsetTop = vv?.offsetTop ?? 0
    const offsetLeft = vv?.offsetLeft ?? 0
    const spaceBelow = offsetTop + viewH - rect.bottom - gap
    const spaceAbove = rect.top - offsetTop - gap
    const preferBelow = spaceBelow >= Math.min(maxHeight, 120) || spaceBelow >= spaceAbove
    const available = preferBelow ? spaceBelow : spaceAbove
    const height = Math.max(minHeight, Math.min(maxHeight, available))
    const width = Math.max(rect.width, 120)
    const left = Math.max(
      offsetLeft + 8,
      Math.min(rect.left, offsetLeft + viewW - width - 8),
    )
    const next = {
      position: 'fixed',
      left,
      width,
      zIndex,
      maxHeight: height,
    }
    if (preferBelow) {
      next.top = rect.bottom + gap
    } else {
      next.bottom = (window.innerHeight - rect.top) + gap
    }
    setStyle(next)
  }, [anchorRef, maxHeight, gap, zIndex, minHeight])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return undefined
    }
    update()
    const onScrollOrResize = () => update()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onScrollOrResize)
    vv?.addEventListener('scroll', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      vv?.removeEventListener('resize', onScrollOrResize)
      vv?.removeEventListener('scroll', onScrollOrResize)
    }
  }, [open, update])

  return style
}
