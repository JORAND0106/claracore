import { useEffect, useRef, useState } from 'react'
import { useTopoTheme } from './topografiaShared'

export default function FirmaDigital({ firmaExistente, onConfirm, titulo = 'Firma digital' }) {
  const ui = useTopoTheme()
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [saved, setSaved] = useState(firmaExistente || '')
  const padBg = ui.t?.inputBg || '#f8fafc'
  const strokeColor = ui.text || '#1e293b'

  useEffect(() => {
    setSaved(firmaExistente || '')
  }, [firmaExistente])

  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = padBg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }

  useEffect(() => {
    initCanvas()
  }, [padBg, strokeColor])

  const pos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  const start = (e) => {
    e.preventDefault()
    setDrawing(true)
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (e) => {
    if (!drawing) return
    e.preventDefault()
    const p = pos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  const end = () => setDrawing(false)

  const limpiar = () => {
    initCanvas()
    setSaved('')
  }

  const confirmar = () => {
    const data = canvasRef.current.toDataURL('image/png')
    setSaved(data)
    onConfirm?.(data)
  }

  const border = ui.t?.border || '#e2e8f0'

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 12, background: ui.t?.bgCard || '#f8fafc', color: ui.text }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      {saved ? (
        <img src={saved} alt="Firma" style={{ maxWidth: '100%', border: `1px solid ${border}`, background: padBg, borderRadius: 6 }} />
      ) : (
        <canvas
          ref={canvasRef}
          width={420}
          height={120}
          style={{
            width: '100%',
            maxWidth: 420,
            border: `1px solid ${border}`,
            background: padBg,
            touchAction: 'none',
            cursor: 'crosshair',
            borderRadius: 6,
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
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={limpiar} style={ui.btnSecondary}>Limpiar</button>
        <button type="button" onClick={confirmar} style={ui.btnPrimary}>Confirmar</button>
      </div>
    </div>
  )
}
