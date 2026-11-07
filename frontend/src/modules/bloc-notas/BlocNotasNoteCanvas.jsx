/**
 * Lienzo de nota: mano (trazos), teclado (bloques de texto) y post-its.
 * Herramientas separadas: el usuario elige.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

function uid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

const POSTIT_COLORS = ['#FEF08A', '#FBCFE8', '#BBF7D0', '#BFDBFE', '#FDBA74']

export default function BlocNotasNoteCanvas({
  body,
  onChange,
  tool, // 'hand' | 'text' | 'postit' | 'select'
  t,
  readOnly = false,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const drawingRef = useRef(null)
  const [selectedPostit, setSelectedPostit] = useState(null)
  const [dragPostit, setDragPostit] = useState(null)

  const strokes = body?.strokes || []
  const textBlocks = body?.textBlocks || []
  const postits = body?.postits || []
  const cw = body?.canvas?.width || 1200
  const ch = body?.canvas?.height || 1600
  const bg = body?.canvas?.bg || '#fffef8'

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, cw, ch)
    // soft lines
    ctx.strokeStyle = 'rgba(0,0,0,0.04)'
    ctx.lineWidth = 1
    for (let y = 32; y < ch; y += 32) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(cw, y)
      ctx.stroke()
    }
    for (const s of strokes) {
      const pts = s.points || []
      if (pts.length < 2) continue
      ctx.strokeStyle = s.color || '#1e293b'
      ctx.lineWidth = s.width || 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i]
        if (p.p != null && Number.isFinite(p.p)) {
          ctx.lineWidth = (s.width || 2.5) * (0.5 + p.p)
        }
        ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }
    // draft stroke
    const draft = drawingRef.current
    if (draft?.points?.length > 1) {
      ctx.strokeStyle = draft.color || '#1e293b'
      ctx.lineWidth = draft.width || 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(draft.points[0].x, draft.points[0].y)
      for (let i = 1; i < draft.points.length; i++) {
        ctx.lineTo(draft.points[i].x, draft.points[i].y)
      }
      ctx.stroke()
    }
  }, [strokes, cw, ch, bg])

  useEffect(() => { paint() }, [paint, textBlocks, postits])

  const localPoint = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = cw / rect.width
    const scaleY = ch / rect.height
    const pe = e.touches?.[0] || e.changedTouches?.[0] || e
    return {
      x: (pe.clientX - rect.left) * scaleX,
      y: (pe.clientY - rect.top) * scaleY,
      p: typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5,
    }
  }

  const emit = (patch) => {
    onChange?.({ ...body, ...patch })
  }

  const onPointerDown = (e) => {
    if (readOnly) return
    if (tool !== 'hand') return
    e.preventDefault()
    canvasRef.current?.setPointerCapture?.(e.pointerId)
    const pt = localPoint(e)
    drawingRef.current = {
      id: uid(),
      color: '#1e293b',
      width: e.pointerType === 'pen' ? 2.2 : 2.8,
      points: [pt],
    }
  }

  const onPointerMove = (e) => {
    if (!drawingRef.current || tool !== 'hand') return
    e.preventDefault()
    drawingRef.current.points.push(localPoint(e))
    paint()
  }

  const onPointerUp = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const stroke = drawingRef.current
    drawingRef.current = null
    if ((stroke.points || []).length >= 2) {
      emit({ strokes: [...strokes, stroke] })
    } else {
      paint()
    }
  }

  const addTextBlock = (e) => {
    if (readOnly || tool !== 'text') return
    const pt = localPoint(e)
    const block = {
      id: uid(),
      x: pt.x,
      y: pt.y,
      w: 280,
      h: 120,
      text: '',
      fontSize: 16,
    }
    emit({ textBlocks: [...textBlocks, block], tool: 'text' })
  }

  const addPostit = (e) => {
    if (readOnly || tool !== 'postit') return
    const pt = localPoint(e)
    const note = {
      id: uid(),
      x: pt.x,
      y: pt.y,
      w: 160,
      h: 140,
      color: POSTIT_COLORS[postits.length % POSTIT_COLORS.length],
      text: '',
    }
    emit({ postits: [...postits, note] })
    setSelectedPostit(note.id)
  }

  const onCanvasClick = (e) => {
    if (tool === 'text') addTextBlock(e)
    else if (tool === 'postit') addPostit(e)
  }

  const updateText = (id, text) => {
    emit({
      textBlocks: textBlocks.map((b) => (b.id === id ? { ...b, text } : b)),
    })
  }

  const updatePostit = (id, patch) => {
    emit({
      postits: postits.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  const removePostit = (id) => {
    emit({ postits: postits.filter((p) => p.id !== id) })
    if (selectedPostit === id) setSelectedPostit(null)
  }

  const removeText = (id) => {
    emit({ textBlocks: textBlocks.filter((b) => b.id !== id) })
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'auto',
        flex: 1,
        minHeight: 240,
        height: '100%',
        maxHeight: 'none',
        border: `1px solid ${t?.border || '#e2e8f0'}`,
        borderRadius: 12,
        background: t?.bg || '#f8fafc',
        touchAction: tool === 'hand' ? 'none' : 'pan-y',
      }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: cw, minHeight: Math.min(ch, 900), margin: '0 auto' }}>
        <canvas
          ref={canvasRef}
          width={cw}
          height={ch}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onCanvasClick}
          style={{
            display: 'block',
            cursor: tool === 'hand' ? 'crosshair' : tool === 'text' || tool === 'postit' ? 'cell' : 'default',
            touchAction: tool === 'hand' ? 'none' : 'auto',
          }}
        />
        {textBlocks.map((b) => (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y,
              width: b.w,
              minHeight: b.h,
              zIndex: 2,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={b.text}
              disabled={readOnly}
              onChange={(e) => updateText(b.id, e.target.value)}
              placeholder="Texto"
              title="Texto"
              style={{
                width: '100%',
                minHeight: b.h,
                resize: 'both',
                border: `1px dashed ${t?.border || '#94a3b8'}`,
                borderRadius: 6,
                padding: 8,
                fontSize: b.fontSize || 16,
                fontFamily: 'Georgia, "Times New Roman", serif',
                background: 'rgba(255,255,255,0.85)',
                color: '#0f172a',
                outline: 'none',
              }}
            />
            {!readOnly && (
              <button
                type="button"
                title="Eliminar texto"
                aria-label="Eliminar texto"
                onClick={() => removeText(b.id)}
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {postits.map((p) => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.w,
              minHeight: p.h,
              zIndex: selectedPostit === p.id ? 5 : 3,
              background: p.color || '#FEF08A',
              boxShadow: '2px 3px 8px rgba(0,0,0,0.18)',
              borderRadius: 2,
              padding: 8,
              cursor: dragPostit?.id === p.id ? 'grabbing' : 'grab',
            }}
            onPointerDown={(e) => {
              if (readOnly) return
              e.stopPropagation()
              setSelectedPostit(p.id)
              setDragPostit({
                id: p.id,
                ox: e.clientX,
                oy: e.clientY,
                sx: p.x,
                sy: p.y,
              })
              e.currentTarget.setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!dragPostit || dragPostit.id !== p.id) return
              const dx = e.clientX - dragPostit.ox
              const dy = e.clientY - dragPostit.oy
              const scale = cw / (canvasRef.current?.getBoundingClientRect().width || cw)
              updatePostit(p.id, {
                x: Math.max(0, dragPostit.sx + dx * scale),
                y: Math.max(0, dragPostit.sy + dy * scale),
              })
            }}
            onPointerUp={() => setDragPostit(null)}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={p.text}
              disabled={readOnly}
              onChange={(e) => updatePostit(p.id, { text: e.target.value })}
              placeholder="Post-it"
              title="Post-it"
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                height: 'calc(100% - 4px)',
                minHeight: (p.h || 140) - 16,
                border: 'none',
                background: 'transparent',
                resize: 'none',
                fontFamily: 'Georgia, serif',
                fontSize: 14,
                outline: 'none',
                color: '#1e293b',
              }}
            />
            {!readOnly && (
              <button
                type="button"
                title="Eliminar post-it"
                aria-label="Eliminar post-it"
                onClick={() => removePostit(p.id)}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: 'none',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
