import { useCallback, useEffect, useRef, useState } from 'react'

/** Herramientas con icono SVG + tooltip (title). */
const TOOLS = [
  { id: 'lapiz', label: 'Lápiz', Icon: IconLapiz },
  { id: 'borrador', label: 'Borrador', Icon: IconBorrador },
  { id: 'linea', label: 'Línea', Icon: IconLinea },
  { id: 'flecha', label: 'Flecha', Icon: IconFlecha },
  { id: 'rect', label: 'Rectángulo', Icon: IconRect },
  { id: 'elipse', label: 'Elipse', Icon: IconElipse },
  { id: 'triangulo', label: 'Triángulo', Icon: IconTriangulo },
]

const SHAPE_TOOLS = new Set(['linea', 'flecha', 'rect', 'elipse', 'triangulo'])

/**
 * Editor de esquema (tamaño alineado al popup de nueva tarea).
 * Figuras: preview durante el arrastre y commit al soltar (pointer capture).
 */
export default function EsquemaEditorModal({
  t,
  title = 'Crear esquema',
  initialDataUri = null,
  onSave,
  onClose,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const drawing = useRef(false)
  const startPt = useRef(null)
  const lastPt = useRef(null)
  const snapshot = useRef(null)
  const toolRef = useRef('lapiz')
  const colorRef = useRef('#1e293b')
  const widthRef = useRef(3)
  const [tool, setTool] = useState('lapiz')
  const [color, setColor] = useState('#1e293b')
  const [width, setWidth] = useState(3)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  toolRef.current = tool
  colorRef.current = color
  widthRef.current = width

  const cssSize = () => {
    const c = canvasRef.current
    return { w: c?.clientWidth || 0, h: c?.clientHeight || 0 }
  }

  const setupCanvas = useCallback((preserve = true) => {
    const c = canvasRef.current
    const wrap = wrapRef.current
    if (!c || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(480, wrap.clientWidth)
    const h = Math.max(360, wrap.clientHeight)
    let prev = null
    if (preserve && c.width > 0) {
      try { prev = c.toDataURL('image/png') } catch { /* ignore */ }
    }
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(h * dpr)
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    if (prev && prev.length > 100) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, w, h)
      img.src = prev
    }
  }, [])

  useEffect(() => {
    setupCanvas(false)
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (!drawing.current) setupCanvas(true) })
      : null
    if (ro && wrapRef.current) ro.observe(wrapRef.current)
    const onWin = () => { if (!drawing.current) setupCanvas(true) }
    window.addEventListener('resize', onWin)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', onWin)
    }
  }, [setupCanvas])

  useEffect(() => {
    if (!initialDataUri) return
    const c = canvasRef.current
    if (!c) return
    const paint = () => {
      const ctx = c.getContext('2d')
      const { w, h } = cssSize()
      const img = new Image()
      img.onload = () => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        setDirty(false)
      }
      img.src = initialDataUri
    }
    // Esperar un frame a que el canvas tenga tamaño
    requestAnimationFrame(paint)
  }, [initialDataUri])

  const posFromEvent = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const src = e.touches?.[0] || e.changedTouches?.[0] || e
    return {
      x: src.clientX - r.left,
      y: src.clientY - r.top,
    }
  }

  const applyStrokeStyle = (ctx, isEraser) => {
    const w = widthRef.current
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = isEraser ? Math.max(8, w * 3) : w
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = colorRef.current
      ctx.fillStyle = colorRef.current
    }
  }

  const drawShape = (ctx, toolId, a, b) => {
    applyStrokeStyle(ctx, false)
    if (toolId === 'linea') {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      return
    }
    if (toolId === 'flecha') {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const len = 12 + widthRef.current * 2
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - len * Math.cos(ang - 0.4), b.y - len * Math.sin(ang - 0.4))
      ctx.lineTo(b.x - len * Math.cos(ang + 0.4), b.y - len * Math.sin(ang + 0.4))
      ctx.closePath()
      ctx.fill()
      return
    }
    if (toolId === 'rect') {
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
      return
    }
    if (toolId === 'elipse') {
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const rx = Math.max(Math.abs(b.x - a.x) / 2, 0.5)
      const ry = Math.max(Math.abs(b.y - a.y) / 2, 0.5)
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
      return
    }
    if (toolId === 'triangulo') {
      const midX = (a.x + b.x) / 2
      ctx.beginPath()
      ctx.moveTo(midX, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(a.x, b.y)
      ctx.closePath()
      ctx.stroke()
    }
  }

  const restoreSnapshot = () => {
    const c = canvasRef.current
    if (!c || !snapshot.current) return
    c.getContext('2d').putImageData(snapshot.current, 0, 0)
  }

  const captureSnapshot = () => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    // ImageData en píxeles de dispositivo (incluye buffer completo)
    snapshot.current = ctx.getImageData(0, 0, c.width, c.height)
  }

  const paintShapePreview = (a, b) => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    restoreSnapshot()
    // Reaplicar transform tras putImageData
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawShape(ctx, toolRef.current, a, b)
  }

  const commitShape = (a, b) => {
    if (!a || !b) return
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    if (dx < 2 && dy < 2) {
      // trazo degenerado: restaurar sin dibujar
      restoreSnapshot()
      const dpr = window.devicePixelRatio || 1
      canvasRef.current.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
      return
    }
    paintShapePreview(a, b)
    setDirty(true)
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    const c = canvasRef.current
    c.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const p = posFromEvent(e)
    startPt.current = p
    lastPt.current = p
    const ctx = c.getContext('2d')
    const currentTool = toolRef.current
    if (currentTool === 'lapiz' || currentTool === 'borrador') {
      applyStrokeStyle(ctx, currentTool === 'borrador')
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    } else if (SHAPE_TOOLS.has(currentTool)) {
      captureSnapshot()
    }
  }

  const onPointerMove = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const p = posFromEvent(e)
    lastPt.current = p
    const currentTool = toolRef.current
    const ctx = canvasRef.current.getContext('2d')
    if (currentTool === 'lapiz' || currentTool === 'borrador') {
      applyStrokeStyle(ctx, currentTool === 'borrador')
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      setDirty(true)
      return
    }
    if (SHAPE_TOOLS.has(currentTool) && startPt.current) {
      paintShapePreview(startPt.current, p)
    }
  }

  const onPointerUp = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    drawing.current = false
    try { canvasRef.current.releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
    const currentTool = toolRef.current
    const p = posFromEvent(e)
    lastPt.current = p
    if (currentTool === 'lapiz' || currentTool === 'borrador') {
      canvasRef.current.getContext('2d').globalCompositeOperation = 'source-over'
      startPt.current = null
      return
    }
    if (SHAPE_TOOLS.has(currentTool) && startPt.current) {
      commitShape(startPt.current, p)
    }
    startPt.current = null
    snapshot.current = null
  }

  const clearAll = () => {
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    const { w, h } = cssSize()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
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
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 13000,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1640px, 98vw)',
          maxHeight: '92vh',
          height: 'min(820px, 92vh)',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          boxShadow: t.shadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          padding: '12px 16px', borderBottom: `1px solid ${t.border}`, flexShrink: 0,
        }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-lg)', marginRight: 4 }}>{title}</div>
          {TOOLS.map((tb) => {
            const active = tool === tb.id
            const Icon = tb.Icon
            return (
              <button
                key={tb.id}
                type="button"
                title={tb.label}
                aria-label={tb.label}
                onClick={() => setTool(tb.id)}
                style={{
                  width: 36, height: 36, padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${active ? t.primary : t.border}`,
                  background: active ? `${t.primary}18` : 'transparent',
                  color: active ? t.primary : t.text,
                }}
              >
                <Icon />
              </button>
            )
          })}
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }} title="Color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={tool === 'borrador'} />
          </label>
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 6, alignItems: 'center' }} title="Grosor">
            <input type="range" min={1} max={16} step={0.5} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 80 }} />
          </label>
          <button type="button" style={ghost(t)} onClick={clearAll}>Limpiar</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" style={ghost(t)} onClick={onClose}>Cancelar</button>
            <button type="button" disabled={busy || !dirty} style={{ ...primary(t), opacity: dirty ? 1 : 0.45 }} onClick={guardar}>
              {busy ? 'Guardando…' : 'Guardar esquema PNG'}
            </button>
          </div>
        </div>
        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, background: '#e2e8f0', padding: 10 }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block', width: '100%', height: '100%',
              background: '#fff', borderRadius: 8, touchAction: 'none', cursor: 'crosshair',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div style={{ padding: '6px 14px', fontSize: 'var(--cc-xs)', color: t.textMuted, borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
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

function iconProps() {
  return { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
}

function IconLapiz() {
  return (
    <svg {...iconProps()}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function IconBorrador() {
  return (
    <svg {...iconProps()}>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  )
}
function IconLinea() {
  return (
    <svg {...iconProps()}>
      <path d="M4 18 20 6" />
    </svg>
  )
}
function IconFlecha() {
  return (
    <svg {...iconProps()}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}
function IconRect() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  )
}
function IconElipse() {
  return (
    <svg {...iconProps()}>
      <ellipse cx="12" cy="12" rx="9" ry="6" />
    </svg>
  )
}
function IconTriangulo() {
  return (
    <svg {...iconProps()}>
      <path d="M12 4 21 19H3Z" />
    </svg>
  )
}
