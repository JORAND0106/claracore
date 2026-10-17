/**
 * Tooltips al pasar el mouse sobre botones del editor de esquema.
 * Complementa CcTitleTooltips (táctil): aquí el hover es inmediato y fiable
 * aunque el modal tenga z-index alto o el title nativo se haya adoptado.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CcTipChrome from '../CcTipChrome'

const TIP_SEL = 'button[title], button[data-cc-tooltip], button[data-cc-title-held], label[title], [data-cc-tooltip]'

function resolveLabel(el) {
  if (!el) return ''
  const custom = el.getAttribute?.('data-cc-tooltip')
  if (custom != null && String(custom).trim()) return String(custom).trim()
  const held = el.getAttribute?.('data-cc-title-held')
  if (held != null && String(held).trim()) return String(held).trim()
  const title = el.getAttribute?.('title')
  if (title != null && String(title).trim()) return String(title).trim()
  const aria = el.getAttribute?.('aria-label')
  if (aria != null && String(aria).trim()) return String(aria).trim()
  return ''
}

/**
 * @param {{ rootRef: React.RefObject<HTMLElement|null>, enabled?: boolean }} props
 */
export function EsquemaToolbarHoverTips({ rootRef, enabled = true }) {
  const [tip, setTip] = useState(null)
  const hideTimer = useRef(null)
  const showTimer = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    const root = rootRef?.current
    if (!root || typeof document === 'undefined') return undefined

    const clearTimers = () => {
      clearTimeout(showTimer.current)
      clearTimeout(hideTimer.current)
    }

    const hide = () => {
      clearTimers()
      setTip(null)
    }

    const showFor = (el) => {
      const text = resolveLabel(el)
      if (!text) return
      const rect = el.getBoundingClientRect()
      // Preferir debajo del botón (barra superior); si no cabe, arriba.
      const gap = 8
      let top = rect.bottom + gap
      let left = rect.left + rect.width / 2
      const placeAbove = top + 48 > window.innerHeight - 8
      if (placeAbove) top = rect.top - gap
      setTip({
        text,
        left,
        top,
        placeAbove,
        anchorBottom: placeAbove ? undefined : rect.bottom,
        anchorTop: placeAbove ? rect.top : undefined,
      })
    }

    const onEnter = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return
      const el = e.target?.closest?.(TIP_SEL)
      if (!el || !root.contains(el)) return
      if (el.closest('[data-cc-tooltip-off]')) return
      if (el.disabled) return
      clearTimeout(hideTimer.current)
      clearTimeout(showTimer.current)
      showTimer.current = setTimeout(() => showFor(el), 120)
    }

    const onLeave = (e) => {
      const el = e.target?.closest?.(TIP_SEL)
      if (!el || !root.contains(el)) return
      const related = e.relatedTarget
      if (related && el.contains(related)) return
      clearTimeout(showTimer.current)
      hideTimer.current = setTimeout(hide, 80)
    }

    const onDown = () => hide()

    root.addEventListener('pointerover', onEnter, true)
    root.addEventListener('pointerout', onLeave, true)
    root.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)

    return () => {
      clearTimers()
      root.removeEventListener('pointerover', onEnter, true)
      root.removeEventListener('pointerout', onLeave, true)
      root.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [rootRef, enabled])

  if (!tip || typeof document === 'undefined') return null

  const node = (
    <div
      data-testid="esquema-toolbar-hover-tip"
      role="tooltip"
      style={{
        position: 'fixed',
        left: tip.left,
        top: tip.placeAbove ? undefined : tip.top,
        bottom: tip.placeAbove ? (window.innerHeight - tip.anchorTop + 8) : undefined,
        transform: 'translateX(-50%)',
        zIndex: 2147483646,
        pointerEvents: 'none',
        maxWidth: 'min(280px, calc(100vw - 24px))',
      }}
    >
      <CcTipChrome variant="short" style={{ boxShadow: '0 8px 22px rgba(15,23,42,0.18)' }}>
        {tip.text}
      </CcTipChrome>
    </div>
  )

  return createPortal(node, document.body)
}
