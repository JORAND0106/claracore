/**
 * Hoja inferior en celular: tres alturas (contraída / media / completa).
 * El lienzo permanece visible encima en contraída y media.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ESQUEMA_PHONE_SHEET_ORDER,
  nearestPhoneSheetSnap,
  phoneSheetHeightPx,
} from './esquemaMobileLayout.js'

export function EsquemaPhoneBottomSheet({
  t,
  title = 'Paneles',
  snap = 'collapsed',
  onSnapChange,
  children,
  viewportH,
}) {
  const vh = viewportH || (typeof window !== 'undefined' ? window.innerHeight : 640)
  const [dragH, setDragH] = useState(null)
  const dragRef = useRef(null)
  const liveHRef = useRef(null)
  const movedRef = useRef(false)
  const height = dragH != null ? dragH : phoneSheetHeightPx(snap, vh)

  useEffect(() => {
    setDragH(null)
  }, [snap, vh])

  const startDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    const y0 = e.clientY ?? e.touches?.[0]?.clientY
    const h0 = height
    dragRef.current = { y0, h0 }
    liveHRef.current = h0
    movedRef.current = false
    try { e.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }

    const clientY = (ev) => ev.clientY ?? ev.touches?.[0]?.clientY ?? y0
    const onMove = (ev) => {
      const d = dragRef.current
      if (!d) return
      ev.preventDefault?.()
      const y = clientY(ev)
      if (Math.abs(y - d.y0) > 4) movedRef.current = true
      const next = Math.max(
        phoneSheetHeightPx('collapsed', vh),
        Math.min(phoneSheetHeightPx('full', vh), d.h0 - (y - d.y0)),
      )
      liveHRef.current = next
      setDragH(next)
    }
    const onUp = () => {
      const live = liveHRef.current ?? height
      const didMove = movedRef.current
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      setDragH(null)
      if (didMove) {
        onSnapChange?.(nearestPhoneSheetSnap(live, vh))
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
  }, [height, vh, onSnapChange])

  const cycleSnap = () => {
    const i = ESQUEMA_PHONE_SHEET_ORDER.indexOf(snap)
    const next = ESQUEMA_PHONE_SHEET_ORDER[(i + 1) % ESQUEMA_PHONE_SHEET_ORDER.length]
    onSnapChange?.(next)
  }

  const collapsed = snap === 'collapsed' && dragH == null

  return (
    <div
      data-testid="esquema-phone-bottom-sheet"
      data-snap={snap}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        background: t.bgCard || '#fff',
        borderTop: `1px solid ${t.border || '#cbd5e1'}`,
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        boxShadow: '0 -8px 28px rgba(15,23,42,0.18)',
        touchAction: 'none',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        data-testid="esquema-phone-sheet-handle"
        role="button"
        tabIndex={0}
        aria-label={`Panel ${title}: arrastre o toque para cambiar altura`}
        onPointerDown={startDrag}
        onClick={() => {
          if (movedRef.current) return
          cycleSnap()
        }}
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          padding: '8px 12px 6px',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: t.border || '#cbd5e1',
          }}
        />
        <div style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
        >
          <strong style={{ fontSize: 13, color: t.text, letterSpacing: '0.02em' }}>{title}</strong>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted || '#64748b' }}>
            {ESQUEMA_PHONE_SHEET_ORDER.map((id) => (id === snap ? '●' : '○')).join(' ')}
          </span>
        </div>
      </div>
      {!collapsed ? (
        <div
          data-testid="esquema-phone-sheet-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            background: t.bgMuted || '#f8fafc',
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}
