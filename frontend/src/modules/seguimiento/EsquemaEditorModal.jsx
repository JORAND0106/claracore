import { useEffect, useRef, useState } from 'react'

const TOOLS = [
  { id: 'lapiz', label: 'Lápiz' },
  { id: 'borrador', label: 'Borrador' },
  { id: 'regla', label: 'Regla' },
  { id: 'flecha', label: 'Flecha' },
  { id: 'rect', label: 'Rectángulo' },
  { id: 'elipse', label: 'Elipse' },
  { id: 'triangulo', label: 'Triángulo' },
]

/**
 * Editor de esquema a pantalla casi completa.
 * Guarda PNG vía onSave(dataUrl) asociado al sub-ítem (no sustituye imagen soporte).
 */
export default function EsquemaEditorModal({
  t,
  title = 'Crear esquema',
  initialDataUri = null,
  onSave,
  onClose,
}) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const drawing = useRef(false)
  const startPt = useRef(null)
  const snapshot = useRef(null)
  const [tool, setTool] = useState('lapiz')
  const [color, setColor] = useState('#1e293b')
  const [width, setWidth] = useState(3)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const resize = () => {
    const c = canvasRef.current
    const o = overlayRef.current
    if (!c || !o) return
    const parent = c.parentElement
    if (!parent) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(640, parent.clientWidth)
    const h = Math.max(420, parent.clientHeight)
    for (const canvas of [c, o]) {
      const prev = canvas.toDataURL('image/png')
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (canvas === c) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        if (prev && prev.length > 100) {
          const img = new Image()
          img.onload = () => ctx.drawImage(img, 0, 0, w, h)
          img.src = prev
        }
      } else {
        ctx.clearRect(0, 0, w, h)
      }
    }
  }

  useEffect(() => {
    resize()
    const onWin = () => resize()
    window.addEventListener('resize', onWin)
    return () => window.removeEventListener('resize', onWin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!initialDataUri) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const img = new Image()
    img.onload = () => {
      const w = c.clientWidth
      const h = c.clientHeight
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      setDirty(false)
    }
    img.src = initialDataUri
  }, [initialDataUri])

  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const src = e.touches?.[0] || e
    return { x: src.clientX - r.left, y: src.clientY - r.top }
  }

  const mainCtx = () => canvasRef.current.getContext('2d')
  const overCtx = () => overlayRef.current.getContext('2d')

  const clearOverlay = () => {
    const o = overlayRef.current
    const ctx = overCtx()
    ctx.clearRect(0, 0, o.clientWidth, o.clientHeight)
  }

  const strokeStyleFor = (ctx, isEraser) => {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = isEraser ? Math.max(8, width * 3) : width
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = color
      ctx.fillStyle = color
    }
  }

  const drawShape = (ctx, toolId, a, b, finalize) => {
    strokeStyleFor(ctx, false)
    ctx.beginPath()
    if (toolId === 'regla' || toolId === 'flecha') {
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      if (toolId === 'flecha' && finalize) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const len = 12 + width * 2
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(b.x - len * Math.cos(ang - 0.4), b.y - len * Math.sin(ang - 0.4))
        ctx.lineTo(b.x - len * Math.cos(ang + 0.4), b.y - len * Math.sin(ang + 0.4))
        ctx.closePath()
        ctx.fill()
      }
    } else if (toolId === 'rect') {
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    } else if (toolId === 'elipse') {
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const rx = Math.abs(b.x - a.x) / 2
      const ry = Math.abs(b.y - a.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (toolId === 'triangulo') {
      const midX = (a.x + b.x) / 2
      ctx.moveTo(midX, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(a.x, b.y)
      ctx.closePath()
      ctx.stroke()
    }
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const p = pos(e)
    startPt.current = p
    const ctx = mainCtx()
    if (tool === 'lapiz' || tool === 'borrador') {
      strokeStyleFor(ctx, tool === 'borrador')
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    } else {
      snapshot.current = canvasRef.current.toDataURL('image/png')
    }
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const p = pos(e)
    if (tool === 'lapiz' || tool === 'borrador') {
      const ctx = mainCtx()
      strokeStyleFor(ctx, tool === 'borrador')
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      setDirty(true)
      return
    }
    clearOverlay()
    drawShape(overCtx(), tool, startPt.current, p, false)
  }

  const end = (e) => {
    if (!drawing.current) return
    drawing.current = false
    const p = e ? pos(e) : startPt.current
    if (tool === 'lapiz' || tool === 'borrador') {
      mainCtx().globalCompositeOperation = 'source-over'
      return
    }
    clearOverlay()
    if (startPt.current && p) {
      drawShape(mainCtx(), tool, startPt.current, p, true)
      setDirty(true)
    }
    startPt.current = null
  }

  const clearAll = () => {
    const c = canvasRef.current
    const ctx = mainCtx()
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight)
    clearOverlay()
    setDirty(true)
  }

  const guardar = async () => {
    setBusy(true)
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      await onSave?.(dataUrl)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 13000,
        background: 'rgba(15,23,42,0.72)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
        padding: '1.5vh 1.5vw',
      }}
    >
      <div
        style={{
          width: '97vw',
          height: '97vh',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: t.shadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          padding: '10px 14px', borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-lg)', marginRight: 8 }}>{title}</div>
          {TOOLS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTool(tb.id)}
              style={{
                ...ghost(t),
                borderColor: tool === tb.id ? t.primary : t.border,
                background: tool === tb.id ? `${t.primary}18` : 'transparent',
                fontWeight: tool === tb.id ? 700 : 500,
              }}
            >
              {tb.label}
            </button>
          ))}
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Color
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={tool === 'borrador'} />
          </label>
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Grosor
            <input type="range" min={1} max={16} step={0.5} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
          <button type="button" style={ghost(t)} onClick={clearAll}>Limpiar</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" style={ghost(t)} onClick={onClose}>Cancelar</button>
            <button type="button" disabled={busy || !dirty} style={{ ...primary(t), opacity: dirty ? 1 : 0.45 }} onClick={guardar}>
              {busy ? 'Guardando…' : 'Guardar esquema PNG'}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#e2e8f0', padding: 8 }}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                background: '#fff', borderRadius: 8, touchAction: 'none', cursor: 'crosshair',
              }}
            />
            <canvas
              ref={overlayRef}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                borderRadius: 8, touchAction: 'none', cursor: 'crosshair',
              }}
              onMouseDown={start}
              onMouseMove={move}
              onMouseUp={end}
              onMouseLeave={() => { if (drawing.current) end() }}
              onTouchStart={start}
              onTouchMove={move}
              onTouchEnd={end}
            />
          </div>
        </div>
        <div style={{ padding: '6px 14px', fontSize: 'var(--cc-xs)', color: t.textMuted, borderTop: `1px solid ${t.border}` }}>
          El esquema se guarda como PNG de este sub-ítem y no reemplaza la imagen de soporte.
        </div>
      </div>
    </div>
  )
}

function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
