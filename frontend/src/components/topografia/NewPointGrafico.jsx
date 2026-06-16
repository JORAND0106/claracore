import { useCallback, useMemo, useRef, useState } from 'react'
import { useTopoTheme } from './topografiaShared'
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

export default function NewPointGrafico({
  verticesPoligonal = [],
  p1 = null,
  p2 = null,
  opciones = [],
  opcionElegida = null,
  nombreNuevo = '',
  norteResultado = null,
  esteResultado = null,
  ancho = 560,
  alto = 400,
}) {
  const ui = useTopoTheme()
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef({ dragging: false, x0: 0, y0: 0, pan0: { x: 0, y: 0 } })

  const plot = useMemo(() => {
    const verts = (verticesPoligonal || []).filter((v) => v.norte != null && v.este != null)
    const p1pt = p1?.norte != null && p1?.este != null
      ? { nombre: p1.nombre || p1.punto1_nombre || 'P1', norte: Number(p1.norte ?? p1.punto1_norte), este: Number(p1.este ?? p1.punto1_este) }
      : null
    const p2pt = p2?.norte != null && p2?.este != null
      ? { nombre: p2.nombre || p2.punto2_nombre || 'P2', norte: Number(p2.norte ?? p2.punto2_norte), este: Number(p2.este ?? p2.punto2_este) }
      : null

    const all = [...verts]
    if (p1pt) all.push(p1pt)
    if (p2pt) all.push(p2pt)
    for (const op of opciones || []) {
      if (op.norte != null && op.este != null) {
        all.push({ nombre: op.id || '?', norte: Number(op.norte), este: Number(op.este), opcion: op.id })
      }
    }
    if (norteResultado != null && esteResultado != null) {
      all.push({ nombre: nombreNuevo || 'P', norte: Number(norteResultado), este: Number(esteResultado) })
    }
    if (all.length < 2) return null

    const nortes = all.map((p) => p.norte)
    const estes = all.map((p) => p.este)
    let minN = Math.min(...nortes)
    let maxN = Math.max(...nortes)
    let minE = Math.min(...estes)
    let maxE = Math.max(...estes)
    const span = Math.max(maxN - minN, maxE - minE, 1)
    const pad = span * 0.15
    minN -= pad
    maxN += pad
    minE -= pad
    maxE += pad

    const margin = { l: 52, r: 24, t: 40, b: 44 }
    const w = ancho - margin.l - margin.r
    const h = alto - margin.t - margin.b
    const tx = (e) => margin.l + ((e - minE) / Math.max(maxE - minE, 0.001)) * w
    const ty = (n) => margin.t + h - ((n - minN) / Math.max(maxN - minN, 0.001)) * h

    const stepN = niceStep(maxN - minN)
    const stepE = niceStep(maxE - minE)
    const gridLines = []
    for (let n = Math.ceil(minN / stepN) * stepN; n <= maxN; n += stepN) {
      gridLines.push({ type: 'h', val: n, y: ty(n) })
    }
    for (let e = Math.ceil(minE / stepE) * stepE; e <= maxE; e += stepE) {
      gridLines.push({ type: 'v', val: e, x: tx(e) })
    }

    const polyVerts = verts.map((v) => ({ x: tx(v.este), y: ty(v.norte), p: v }))
    const polyStr = polyVerts.map((c) => `${c.x},${c.y}`).join(' ')

    const colores = { A: '#16a34a', B: '#7c3aed' }
    const resultado = norteResultado != null && esteResultado != null
      ? { x: tx(Number(esteResultado)), y: ty(Number(norteResultado)), nombre: nombreNuevo || 'P' }
      : null

    const opsCoords = (opciones || [])
      .filter((op) => op.norte != null && op.este != null)
      .map((op) => ({
        x: tx(Number(op.este)),
        y: ty(Number(op.norte)),
        id: op.id,
        sel: op.id === opcionElegida,
        color: colores[op.id] || '#0f766e',
      }))

    const p1c = p1pt ? { x: tx(p1pt.este), y: ty(p1pt.norte), p: p1pt } : null
    const p2c = p2pt ? { x: tx(p2pt.este), y: ty(p2pt.norte), p: p2pt } : null

    return {
      gridLines,
      margin,
      w,
      h,
      polyStr,
      polyVerts,
      p1c,
      p2c,
      opsCoords,
      resultado,
      north: { x: margin.l + w - 28, y: margin.t + 18, tip: margin.t + 2 },
    }
  }, [verticesPoligonal, p1, p2, opciones, opcionElegida, nombreNuevo, norteResultado, esteResultado, ancho, alto])

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
        Sin coordenadas suficientes para el plano del puesto.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>Plano del puesto (NewPoint)</span>
        <button type="button" onClick={resetVista} style={{ ...ui.btnSecondary, fontSize: 'var(--cc-xs)', padding: '4px 10px' }}>
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
                <text x={6} y={g.y + 3} fontSize="9" fill={ui.grafico.labelFill}>{fmtNum(g.val, 0)}</text>
              </g>
            ) : (
              <g key={`v-${g.val}`}>
                <line x1={g.x} y1={plot.margin.t} x2={g.x} y2={plot.margin.t + plot.h} stroke="#94a3b8" strokeWidth="1" opacity="0.5" />
                <text x={g.x} y={alto - 8} fontSize="9" fill={ui.grafico.labelFill} textAnchor="middle">{fmtNum(g.val, 0)}</text>
              </g>
            ),
          )}

          <text x={plot.margin.l + plot.w / 2} y={alto - 6} fontSize="9" fill={ui.grafico.labelFill} textAnchor="middle">Este →</text>
          <text x={14} y={plot.margin.t + plot.h / 2} fontSize="9" fill={ui.grafico.labelFill} textAnchor="middle" transform={`rotate(-90 14 ${plot.margin.t + plot.h / 2})`}>Norte →</text>

          <g>
            <line x1={plot.north.x} y1={plot.north.y} x2={plot.north.x} y2={plot.north.tip} stroke="#1e40af" strokeWidth="2.5" />
            <polygon points={`${plot.north.x},${plot.north.tip} ${plot.north.x - 6},${plot.north.tip + 10} ${plot.north.x + 6},${plot.north.tip + 10}`} fill="#1e40af" />
            <text x={plot.north.x} y={plot.north.tip - 5} fontSize="12" fill="#1e40af" fontWeight="700" textAnchor="middle">N</text>
          </g>

          {plot.polyVerts.length >= 3 && (
            <polygon points={plot.polyStr} fill={`${ui.accent}14`} stroke="#64748b" strokeWidth="2" />
          )}

          {plot.p1c && plot.p2c && (
            <line
              x1={plot.p1c.x}
              y1={plot.p1c.y}
              x2={plot.p2c.x}
              y2={plot.p2c.y}
              stroke="#cbd5e1"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          )}

          {plot.resultado ? (
            <g>
              {plot.p1c && (
                <line x1={plot.p1c.x} y1={plot.p1c.y} x2={plot.resultado.x} y2={plot.resultado.y} stroke="#94a3b8" strokeWidth="0.8" opacity="0.7" />
              )}
              {plot.p2c && (
                <line x1={plot.p2c.x} y1={plot.p2c.y} x2={plot.resultado.x} y2={plot.resultado.y} stroke="#94a3b8" strokeWidth="0.8" opacity="0.7" />
              )}
              <circle cx={plot.resultado.x} cy={plot.resultado.y} r="9" fill="#16a34a" fillOpacity="0.3" stroke="#16a34a" strokeWidth="3" />
              <text x={plot.resultado.x} y={plot.resultado.y - 12} textAnchor="middle" fontSize="10" fontWeight="700" fill="#16a34a">
                {plot.resultado.nombre}
              </text>
            </g>
          ) : (
            plot.opsCoords.map((op) => (
              <g key={op.id}>
                {plot.p1c && (
                  <line x1={plot.p1c.x} y1={plot.p1c.y} x2={op.x} y2={op.y} stroke="#94a3b8" strokeWidth="0.8" opacity="0.7" />
                )}
                {plot.p2c && (
                  <line x1={plot.p2c.x} y1={plot.p2c.y} x2={op.x} y2={op.y} stroke="#94a3b8" strokeWidth="0.8" opacity="0.7" />
                )}
                <circle cx={op.x} cy={op.y} r={op.sel ? 9 : 7} fill={op.color} fillOpacity="0.25" stroke={op.color} strokeWidth={op.sel ? 3 : 1.5} />
                <text x={op.x} y={op.y - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill={op.color}>{op.id}</text>
                {op.sel && nombreNuevo && (
                  <text x={op.x} y={op.y + 18} textAnchor="middle" fontSize="9" fill={ui.grafico.pointLabel}>{nombreNuevo}</text>
                )}
              </g>
            ))
          )}

          {[plot.p1c, plot.p2c].filter(Boolean).map(({ x, y, p }) => (
            <g key={p.nombre}>
              <circle cx={x} cy={y} r="8" fill="#f59e0b" fillOpacity="0.35" stroke="#d97706" strokeWidth="2" />
              <text x={x} y={y - 12} textAnchor="middle" fontSize="10" fontWeight="700" fill="#b45309">{p.nombre}</text>
            </g>
          ))}

          {plot.polyVerts.map(({ x, y, p }) => (
            <g key={p.nombre || `${x}-${y}`}>
              <circle cx={x} cy={y} r="3" fill="#64748b" />
              {p.nombre && (
                <text x={x + 5} y={y - 4} fontSize="8" fill={ui.textMuted}>{p.nombre}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
