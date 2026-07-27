import { useCallback, useLayoutEffect, useState } from 'react'

/** Por encima de overlays de Seguimiento (11000–12100). */
export const SEGUIMIENTO_DROPDOWN_Z = 12500

/**
 * Posiciona un desplegable con position:fixed anclado a un input/elemento.
 * Evita el recorte por overflow:auto de los modales (.cc-seguim-modal-sheet).
 */
export function useAnchoredDropdown(open, anchorRef, { maxHeight = 200, gap = 4 } = {}) {
  const [style, setStyle] = useState(null)

  const update = useCallback(() => {
    const el = anchorRef?.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const spaceAbove = rect.top - gap
    const preferBelow = spaceBelow >= Math.min(maxHeight, 120) || spaceBelow >= spaceAbove
    const available = preferBelow ? spaceBelow : spaceAbove
    const height = Math.max(80, Math.min(maxHeight, available))
    const next = {
      position: 'fixed',
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      zIndex: SEGUIMIENTO_DROPDOWN_Z,
      maxHeight: height,
    }
    if (preferBelow) {
      next.top = rect.bottom + gap
    } else {
      next.bottom = window.innerHeight - rect.top + gap
    }
    setStyle(next)
  }, [anchorRef, maxHeight, gap])

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
