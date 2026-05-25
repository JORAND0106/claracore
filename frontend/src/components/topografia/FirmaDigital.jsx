import { useEffect, useRef, useState } from 'react'

export default function FirmaDigital({ firmaExistente, onConfirm, titulo = 'Firma digital' }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [saved, setSaved] = useState(firmaExistente || '')

  useEffect(() => {
    setSaved(firmaExistente || '')
  }, [firmaExistente])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

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
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setSaved('')
  }

  const confirmar = () => {
    const data = canvasRef.current.toDataURL('image/png')
    setSaved(data)
    onConfirm?.(data)
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{titulo}</div>
      {saved ? (
        <img src={saved} alt="Firma" style={{ maxWidth: '100%', border: '1px solid #cbd5e1', background: '#fff' }} />
      ) : (
        <canvas
          ref={canvasRef}
          width={420}
          height={120}
          style={{ width: '100%', maxWidth: 420, border: '1px solid #cbd5e1', background: '#fff', touchAction: 'none', cursor: 'crosshair' }}
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
        <button type="button" onClick={limpiar} style={btnSec}>Limpiar</button>
        <button type="button" onClick={confirmar} style={btnPri}>Confirmar</button>
      </div>
    </div>
  )
}

const btnPri = { padding: '8px 14px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }
const btnSec = { padding: '8px 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }
