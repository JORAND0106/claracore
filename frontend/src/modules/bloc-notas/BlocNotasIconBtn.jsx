/**
 * Botón solo icono + tooltip institucional.
 * - Ratón: tip al pasar (CcTitleTooltips + tip local fiable).
 * - iPad/tablet: tip al mantener presionado, sin ejecutar la acción.
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CcTipChrome from '../../components/CcTipChrome'

const LONG_MS = 480

export default function BlocNotasIconBtn({
  title,
  onClick,
  children,
  t,
  active = false,
  disabled = false,
  size = 36,
}) {
  const btnRef = useRef(null)
  const longTimer = useRef(null)
  const suppressClick = useRef(false)
  const [tip, setTip] = useState(null)
  const [hoverTip, setHoverTip] = useState(null)

  const clearLong = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current)
      longTimer.current = null
    }
  }

  const showTipAtBtn = () => {
    const el = btnRef.current
    if (!el || !title) return
    const rect = el.getBoundingClientRect()
    const gap = 8
    let top = rect.bottom + gap
    let placeAbove = false
    if (top + 44 > window.innerHeight - 8) {
      placeAbove = true
      top = rect.top - gap
    }
    setTip({
      text: title,
      left: rect.left + rect.width / 2,
      top,
      placeAbove,
      anchorTop: rect.top,
    })
  }

  useEffect(() => () => clearLong(), [])

  useEffect(() => {
    if (!tip) return undefined
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [tip])

  const onPointerDown = (e) => {
    if (disabled) return
    clearLong()
    suppressClick.current = false
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      longTimer.current = setTimeout(() => {
        suppressClick.current = true
        showTipAtBtn()
      }, LONG_MS)
    }
  }

  const onPointerUp = () => {
    clearLong()
  }

  const onPointerCancel = () => {
    clearLong()
  }

  const onPointerEnter = (e) => {
    if (disabled || !title) return
    if (e.pointerType && e.pointerType !== 'mouse') return
    const el = btnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setHoverTip({
      text: title,
      left: rect.left + rect.width / 2,
      top: rect.bottom + 8,
      placeAbove: false,
      anchorTop: rect.top,
    })
  }

  const onPointerLeave = () => {
    clearLong()
    setHoverTip(null)
  }

  const handleClick = (e) => {
    if (suppressClick.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClick.current = false
      // Mantener tip visible un momento; se cierra al tocar fuera
      return
    }
    setTip(null)
    setHoverTip(null)
    if (!disabled) onClick?.(e)
  }

  const tipNode = tip || hoverTip

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        aria-label={title}
        data-cc-tooltip={title}
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        disabled={disabled}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          border: `1px solid ${active ? (t?.primary || '#0077B6') : (t?.border || '#cbd5e1')}`,
          background: active ? (t?.primary || '#0077B6') : (t?.bgCard || '#fff'),
          color: active ? '#fff' : (t?.text || '#0f172a'),
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 32 ? 16 : 14,
          flexShrink: 0,
          WebkitTouchCallout: 'none',
          userSelect: 'none',
        }}
      >
        {children}
      </button>
      {tipNode && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          data-testid="bloc-icon-tip"
          style={{
            position: 'fixed',
            left: tipNode.left,
            top: tipNode.placeAbove ? undefined : tipNode.top,
            bottom: tipNode.placeAbove
              ? (window.innerHeight - tipNode.anchorTop + 8)
              : undefined,
            transform: 'translateX(-50%)',
            zIndex: 2147483646,
            pointerEvents: 'none',
            maxWidth: 'min(280px, calc(100vw - 24px))',
          }}
        >
          <CcTipChrome variant="short" style={{ boxShadow: '0 8px 22px rgba(15,23,42,0.18)' }}>
            {tipNode.text}
          </CcTipChrome>
        </div>,
        document.body,
      )}
    </>
  )
}
