import { useEffect, useRef, useState } from 'react'

/**
 * Lienzo de dibujo a mano (ratón / touch). Independiente de imágenes adjuntas.
 * onSave(dataUrl) al confirmar.
 */
export default function DibujoCanvas({ t, onSave, disabled = false, height = 220 }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [stroke, setStroke] = useState('#1e293b')
  const [width, setWidth] = useState(2.5)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = Math.max(320, Math.floor(rect.width * dpr))
    c.height = Math.floor(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [height])

  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const src = e.touches?.[0] || e
    return { x: src.clientX - r.left, y: src.clientY - r.top }
  }

  const start = (e) => {
    if (disabled) return
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.strokeStyle = stroke
    ctx.lineWidth = width
  }

  const move = (e) => {
    if (!drawing.current || disabled) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setDirty(true)
  }

  const end = () => { drawing.current = false }

  const clear = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const r = c.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, r.width, height)
    setDirty(false)
  }

  const save = () => {
    if (!dirty || !onSave) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSave(dataUrl)
    setDirty(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Color
          <input type="color" value={stroke} disabled={disabled} onChange={(e) => setStroke(e.target.value)} />
        </label>
        <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Grosor
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={width}
            disabled={disabled}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <button type="button" disabled={disabled} style={ghost(t)} onClick={clear}>Limpiar</button>
        <button
          type="button"
          disabled={disabled || !dirty}
          style={{
            ...primary(t),
            opacity: dirty ? 1 : 0.45,
            cursor: dirty ? 'pointer' : 'not-allowed',
          }}
          onClick={save}
        >
          Guardar dibujo
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          touchAction: 'none',
          cursor: disabled ? 'default' : 'crosshair',
          background: '#fff',
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
      <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 6 }}>
        Dibuje con el mouse o el dedo. El trazo se guarda como imagen asociada a la tarea (aparte de las adjuntas).
      </div>
    </div>
  )
}

function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
