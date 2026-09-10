import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Firma manual: vista previa + popup ampliado para dibujar con dedo/mouse.
 */
export default function FirmaPad({
  value,
  onChange,
  disabled = false,
  themeTokens = {},
  titulo = 'Firma del trabajador',
}) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)
  const bg = themeTokens.inputBg || themeTokens.bg || '#f8fafc'
  const stroke = themeTokens.text || '#1e293b'
  const border = themeTokens.border || '#e2e8f0'
  const card = themeTokens.bgCard || '#fff'
  const muted = themeTokens.textMuted || '#64748b'

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    setHasStroke(false)
  }

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      clearCanvas()
      if (value && String(value).startsWith('data:')) {
        const img = new Image()
        img.onload = () => {
          const canvas = canvasRef.current
          if (!canvas) return
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          setHasStroke(true)
        }
        img.src = value
      }
    }, 30)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  const pos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY }
  }

  const start = (e) => {
    if (disabled) return
    e.preventDefault()
    drawingRef.current = true
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e) => {
    if (!drawingRef.current || disabled) return
    e.preventDefault()
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasStroke(true)
  }

  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
  }

  const guardar = () => {
    if (!canvasRef.current || !hasStroke) return
    onChange?.(canvasRef.current.toDataURL('image/png'))
    setOpen(false)
  }

  const limpiar = () => {
    clearCanvas()
  }

  const quitar = () => {
    onChange?.('')
    setOpen(false)
  }

  const btnBase = {
    border: `1px solid ${border}`,
    background: 'transparent',
    borderRadius: 6,
    padding: '8px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 'var(--cc-caption)',
    fontWeight: 700,
    fontFamily: 'inherit',
    color: 'inherit',
  }

  const modal = open ? createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          width: 'min(920px, 96vw)',
          maxHeight: '94vh',
          background: card,
          borderRadius: 14,
          border: `1px solid ${border}`,
          boxShadow: '0 24px 64px rgba(15,23,42,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-body)' }}>{titulo}</div>
          <button type="button" style={btnBase} onClick={() => setOpen(false)}>Cerrar</button>
        </div>
        <div style={{ padding: 16, overflow: 'auto' }}>
          <div style={{ color: muted, fontSize: 'var(--cc-caption)', marginBottom: 10 }}>
            Firme con el dedo o el mouse en el área ampliada.
          </div>
          <canvas
            ref={canvasRef}
            width={1100}
            height={420}
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: '1100 / 420',
              touchAction: 'none',
              border: `1px solid ${border}`,
              borderRadius: 8,
              background: '#fff',
              cursor: 'crosshair',
              display: 'block',
            }}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
        </div>
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${border}`,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}>
          <button type="button" style={btnBase} onClick={limpiar}>Limpiar</button>
          {value ? (
            <button type="button" style={btnBase} onClick={quitar}>Quitar firma</button>
          ) : null}
          <button
            type="button"
            style={{
              ...btnBase,
              background: themeTokens.primary || '#0077B6',
              borderColor: themeTokens.primary || '#0077B6',
              color: '#fff',
              opacity: hasStroke ? 1 : 0.55,
            }}
            disabled={!hasStroke}
            onClick={guardar}
          >
            Guardar firma
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div style={{
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: 10,
      background: card,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>{titulo}</div>
      {value ? (
        <img
          src={value}
          alt="Firma"
          style={{
            maxWidth: '100%',
            maxHeight: 100,
            border: `1px solid ${border}`,
            borderRadius: 6,
            background: bg,
            display: 'block',
            marginBottom: 8,
          }}
        />
      ) : (
        <div style={{
          height: 72,
          border: `1px dashed ${border}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: muted,
          fontSize: 'var(--cc-caption)',
          marginBottom: 8,
          background: bg,
        }}>
          Sin firma
        </div>
      )}
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnBase} onClick={() => setOpen(true)}>
            {value ? 'Firmar de nuevo' : 'Abrir espacio de firma'}
          </button>
          {value ? (
            <button type="button" style={btnBase} onClick={() => onChange?.('')}>
              Quitar
            </button>
          ) : null}
        </div>
      )}
      {modal}
    </div>
  )
}
