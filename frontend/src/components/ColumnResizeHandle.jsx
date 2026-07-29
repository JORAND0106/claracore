/**
 * Handle de arrastre para redimensionar columnas (estilo Excel).
 */
import { useCallback, useRef } from 'react'

export default function ColumnResizeHandle({ onResize, onResizeEnd, color = '#94a3b8' }) {
  const startX = useRef(0)
  const startW = useRef(0)
  const lastW = useRef(0)

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      startX.current = e.clientX
      const th = e.currentTarget.parentElement
      startW.current = th ? th.getBoundingClientRect().width : 80
      lastW.current = startW.current
      const move = (ev) => {
        const next = Math.max(40, Math.min(640, startW.current + (ev.clientX - startX.current)))
        lastW.current = next
        if (typeof onResize === 'function') onResize(next)
      }
      const up = () => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        if (typeof onResizeEnd === 'function') onResizeEnd(lastW.current)
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [onResize, onResizeEnd],
  )

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Arrastre para cambiar el ancho"
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 6,
        height: '100%',
        cursor: 'col-resize',
        userSelect: 'none',
        zIndex: 2,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = color + '55'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    />
  )
}
