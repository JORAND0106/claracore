import { useEffect, useRef, useState } from 'react'

/**
 * Lienzo de firma manual (mouse/touch) — agnóstico al tema de topografía.
 */
export default function FirmaPad({
  value,
  onChange,
  disabled = false,
  themeTokens = {},
  titulo = 'Firma del trabajador',
}) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStroke, setHasStroke] = useState(false)
  const bg = themeTokens.inputBg || themeTokens.bg || '#f8fafc'
  const stroke = themeTokens.text || '#1e293b'
  const border = themeTokens.border || '#e2e8f0'
  const card = themeTokens.bgCard || '#fff'

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    setHasStroke(false)
  }

  useEffect(() => {
    clearCanvas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg, stroke])

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
    setDrawing(true)
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e) => {
    if (!drawing || disabled) return
    e.preventDefault()
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasStroke(true)
  }

  const end = () => {
    if (!drawing) return
    setDrawing(false)
    if (canvasRef.current) {
      setHasStroke(true)
      onChange?.(canvasRef.current.toDataURL('image/png'))
    }
  }

  const limpiar = () => {
    clearCanvas()
    onChange?.('')
  }

  return (
    <div style={{
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: 10,
      background: card,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 'var(--cc-sm)' }}>{titulo}</div>
      {value && !hasStroke ? (
        <img
          src={value.startsWith('blob:') || value.startsWith('data:') || value.startsWith('http')
            ? value
            : value}
          alt="Firma"
          style={{
            maxWidth: '100%',
            maxHeight: 120,
            border: `1px solid ${border}`,
            borderRadius: 6,
            background: bg,
            display: 'block',
          }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={560}
          height={140}
          style={{
            width: '100%',
            maxWidth: 560,
            height: 120,
            touchAction: 'none',
            border: `1px solid ${border}`,
            borderRadius: 6,
            background: bg,
            cursor: disabled ? 'not-allowed' : 'crosshair',
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
      )}
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={limpiar}
            style={{
              border: `1px solid ${border}`,
              background: 'transparent',
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 'var(--cc-caption)',
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Limpiar firma
          </button>
          {value && !hasStroke && (
            <button
              type="button"
              onClick={() => { onChange?.(''); clearCanvas() }}
              style={{
                border: `1px solid ${border}`,
                background: 'transparent',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 'var(--cc-caption)',
                fontWeight: 700,
                fontFamily: 'inherit',
              }}
            >
              Firmar de nuevo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
