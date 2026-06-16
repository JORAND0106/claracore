import { useCallback, useMemo, useRef, useState } from 'react'
import { coloresBloqueNiv, useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'

function niceStep(span) {
  const raw = span / 8
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)))
  const norm = raw / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

function parseAbscisa(val, fallback) {
  if (val == null || val === '') return fallback
  const n = Number(String(val).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

export default function NivelacionGrafico({ filasVista = [], ancho = 560, alto = 360 }) {
  const ui = useTopoTheme()
  const bloques = coloresBloqueNiv(ui.t)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef({ dragging: false, x0: 0, y0: 0, pan0: { x: 0, y: 0 } })

  const plot = useMemo(() => {
    let prog = 0
    const pts = []
    for (let i = 0; i < filasVista.length; i += 1) {
      const f = filasVista[i]
      const cota = f.cota != null ? Number(f.cota) : null
      if (cota == null || Number.isNaN(cota)) continue
      const distVp = f.distancia_vplus_calc != null ? Math.abs(Number(f.distancia_vplus_calc)) : 0
      const distVm = f.distancia_vminus_calc != null ? Math.abs(Number(f.distancia_vminus_calc)) : 0
      prog += distVp || distVm || 0
      const abs = parseAbscisa(f.abscisa, prog)
      pts.push({
        nombre: f.nombre_punto || `#${i + 1}`,
        abscisa: abs,
        cota,
        esCierre: Boolean(f.es_fila_cierre),
      })
    }
    if (pts.length < 2) return null

    const absVals = pts.map((p) => p.abscisa)
    const cotas = pts.map((p) => p.cota)
    let minA = Math.min(...absVals)
    let maxA = Math.max(...absVals)
    let minC = Math.min(...cotas)
    let maxC = Math.max(...cotas)
    const spanA = Math.max(maxA - minA, 1)
    const spanC = Math.max(maxC - minC, 0.5)
    const padA = spanA * 0.12
    const padC = spanC * 0.15
    minA -= padA
    maxA += padA
    minC -= padC
    maxC += padC

    const margin = { l: 52, r: 28, t: 44, b: 48 }
    const w = ancho - margin.l - margin.r
    const h = alto - margin.t - margin.b
    const tx = (a) => margin.l + ((a - minA) / Math.max(maxA - minA, 0.001)) * w
    const ty = (c) => margin.t + h - ((c - minC) / Math.max(maxC - minC, 0.001)) * h

    const stepA = niceStep(maxA - minA)
    const stepC = niceStep(maxC - minC)
    const gridLines = []
    for (let a = Math.ceil(minA / stepA) * stepA; a <= maxA; a += stepA) {
      gridLines.push({ type: 'v', val: a, x: tx(a) })
    }
    for (let c = Math.ceil(minC / stepC) * stepC; c <= maxC; c += stepC) {
      gridLines.push({ type: 'h', val: c, y: ty(c) })
    }

    const coords = pts.map((p) => ({ x: tx(p.abscisa), y: ty(p.cota), p }))
    const polyStr = coords.map((c) => `${c.x},${c.y}`).join(' ')

    return {
      coords,
      polyStr,
      gridLines,
      margin,
      w,
      h,
      north: { x: margin.l + w - 28, y: margin.t + 18, tip: margin.t + 2 },
    }
  }, [filasVista, ancho, alto])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.min(12, Math.max(0.4, s * delta)))
  }, [])

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    panRef.current = { dragging: true, x0: e.clientX, y0: e.clientY, pan0: { ...pan } }
  }, [pan])

  const onMouseMove = useCallback((e) => {
    if (!panRef.current.dragging) return
    setPan({
      x: panRef.current.pan0.x + (e.clientX - panRef.current.x0),
      y: panRef.current.pan0.y + (e.clientY - panRef.current.y0),
    })
  }, [])

  const onMouseUp = useCallback(() => {
    panRef.current.dragging = false
  }, [])

  const resetVista = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  if (!plot) {
    return (
      <div style={{ ...ui.card, color: ui.textMuted, marginTop: 12 }}>
        Agregue al menos dos puntos con cota calculada para ver el perfil del circuito.
      </div>
    )
  }

  return (
    <div style={{ ...ui.card, marginTop: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>Perfil del circuito de nivelación</span>
        <button
          type="button"
          onClick={resetVista}
          style={{ ...ui.btnSecondary, fontSize: 'var(--cc-xs)', padding: '4px 10px' }}
        >
          Restablecer zoom
        </button>
        <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Rueda: zoom · Arrastrar: pan</span>
      </div>

      <div
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          overflow: 'hidden',
          borderRadius: 8,
          border: ui.grafico.border,
          background: ui.grafico.background,
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${ancho} ${alto}`}
          style={{
            maxHeight: alto,
            display: 'block',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {plot.gridLines.map((g) =>
            g.type === 'h' ? (
              <g key={`h-${g.val}`}>
                <line x1={plot.margin.l} y1={g.y} x2={plot.margin.l + plot.w} y2={g.y} stroke="#94a3b8" strokeWidth="1" opacity="0.5" />
                <text x={6} y={g.y + 3} fontSize="9" fill={ui.grafico.labelFill}>{fmtNum(g.val, 2)}</text>
              </g>
            ) : (
              <g key={`v-${g.val}`}>
                <line x1={g.x} y1={plot.margin.t} x2={g.x} y2={plot.margin.t + plot.h} stroke="#94a3b8" strokeWidth="1" opacity="0.5" />
                <text x={g.x} y={alto - 8} fontSize="9" fill={ui.grafico.labelFill} textAnchor="middle">{fmtNum(g.val, 0)}</text>
              </g>
            ),
          )}

          <text x={plot.margin.l + plot.w / 2} y={alto - 6} fontSize="9" fill={ui.grafico.labelFill} textAnchor="middle">Abscisa (m) →</text>
          <text x={14} y={plot.margin.t + plot.h / 2} fontSize="9" fill={ui.grafico.labelFill} textAnchor="middle" transform={`rotate(-90 14 ${plot.margin.t + plot.h / 2})`}>Cota (m) →</text>

          <g>
            <line x1={plot.north.x} y1={plot.north.y} x2={plot.north.x} y2={plot.north.tip} stroke="#1e40af" strokeWidth="2.5" />
            <polygon points={`${plot.north.x},${plot.north.tip} ${plot.north.x - 6},${plot.north.tip + 10} ${plot.north.x + 6},${plot.north.tip + 10}`} fill="#1e40af" />
            <text x={plot.north.x} y={plot.north.tip - 5} fontSize="12" fill="#1e40af" fontWeight="700" textAnchor="middle">N</text>
          </g>

          <polyline points={plot.polyStr} fill="none" stroke={ui.accent} strokeWidth="2" />

          {plot.coords.map(({ x, y, p }) => (
            <g key={p.nombre}>
              <circle
                cx={x}
                cy={y}
                r={p.esCierre ? 7 : 5}
                fill={p.esCierre ? '#7c3aed' : ui.accent}
                stroke={bloques.inputBg}
                strokeWidth="1.5"
              />
              <text x={x + 8} y={y - 8} fontSize="10" fill={ui.grafico.pointLabel} fontWeight="600">{p.nombre}</text>
              <text x={x + 8} y={y + 4} fontSize="8" fill={ui.textMuted}>{fmtNum(p.cota, 3)} m</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
