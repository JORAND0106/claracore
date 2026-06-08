import { useCallback, useMemo, useRef, useState } from 'react'
import { useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'

function puntosGrafico(estaciones) {
  const verts = (estaciones || []).filter(
    (e) => (e.tipo_punto || 'auxiliar') === 'estacion' && e.norte != null && e.este != null,
  )
  if (verts.length >= 3) return verts
  return (estaciones || []).filter((e) => e.norte != null && e.este != null)
}

function niceStep(span) {
  const raw = span / 8
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)))
  const norm = raw / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

export default function PoligonalGrafico({
  estaciones,
  puntoInicial = null,
  cierre = null,
  ancho = 560,
  alto = 400,
}) {
  const ui = useTopoTheme()
  const [mostrarDistancias, setMostrarDistancias] = useState(true)
  const [mostrarAngulos, setMostrarAngulos] = useState(true)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef({ dragging: false, x0: 0, y0: 0, pan0: { x: 0, y: 0 } })
  const containerRef = useRef(null)

  const plot = useMemo(() => {
    const puntos = puntosGrafico(estaciones)
    const amarre = puntoInicial?.norte != null && puntoInicial?.este != null
      ? { nombre: puntoInicial.nombre || 'Amarre', norte: puntoInicial.norte, este: puntoInicial.este, cota: puntoInicial.cota }
      : null

    const all = [...puntos]
    if (amarre && !puntos.some((p) => p.nombre_punto === amarre.nombre)) {
      all.unshift(amarre)
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

    const traverse = puntos.length >= 2 ? puntos : all
    const coords = traverse.map((p) => ({ x: tx(p.este), y: ty(p.norte), p }))
    const polyStr = coords.map((c) => `${c.x},${c.y}`).join(' ')

    const lados = []
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length
      if (j === 0 && coords.length < 3) break
      const a = coords[i]
      const b = coords[j]
      const dist = Math.hypot(b.p.norte - a.p.norte, b.p.este - a.p.este)
      lados.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist })
    }

    let gapLine = null
    if (amarre && cierre?.cerrado && coords.length >= 1) {
      const last = coords[coords.length - 1]
      const ax = tx(amarre.este)
      const ay = ty(amarre.norte)
      const err = cierre.error_lineal
      if (err != null && err > 0.05) {
        gapLine = { x1: last.x, y1: last.y, x2: ax, y2: ay, err }
      }
    }

    const amarreCoord = amarre ? { x: tx(amarre.este), y: ty(amarre.norte), p: amarre } : null

    return {
      coords,
      polyStr,
      gridLines,
      lados,
      gapLine,
      amarreCoord,
      margin,
      w,
      h,
      north: { x: margin.l + w - 28, y: margin.t + 18, tip: margin.t + 2 },
    }
  }, [estaciones, puntoInicial, cierre, ancho, alto])

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
      <div style={{ ...ui.card, color: ui.textMuted }}>
        Agregue puntos con coordenadas radiadas para ver el gráfico de la poligonal.
      </div>
    )
  }

  return (
    <div style={ui.card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--cc-sm)' }}>Plano de la poligonal</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-xs)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarDistancias} onChange={(e) => setMostrarDistancias(e.target.checked)} />
          Longitudes (m)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--cc-xs)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarAngulos} onChange={(e) => setMostrarAngulos(e.target.checked)} />
          Ángulos observados
        </label>
        <button type="button" onClick={resetVista} style={{ fontSize: 'var(--cc-xs)', padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
          Restablecer zoom
        </button>
        <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Rueda: zoom · Arrastrar: pan</span>
      </div>

      {plot.gapLine && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
          El polígono de vértices radiados no coincide con el amarre inicial: error de cierre {fmtNum(plot.gapLine.err, 3)} m (línea punteada roja).
        </p>
      )}

      <div
        ref={containerRef}
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
          cursor: panRef.current.dragging ? 'grabbing' : 'grab',
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
                <line x1={plot.margin.l} y1={g.y} x2={plot.margin.l + plot.w} y2={g.y} stroke="#cbd5e1" strokeWidth="1" />
                <text x={6} y={g.y + 3} fontSize="9" fill="#64748b">{fmtNum(g.val, 0)}</text>
              </g>
            ) : (
              <g key={`v-${g.val}`}>
                <line x1={g.x} y1={plot.margin.t} x2={g.x} y2={plot.margin.t + plot.h} stroke="#cbd5e1" strokeWidth="1" />
                <text x={g.x} y={alto - 8} fontSize="9" fill="#64748b" textAnchor="middle">{fmtNum(g.val, 0)}</text>
              </g>
            ),
          )}

          <text x={plot.margin.l + plot.w / 2} y={alto - 6} fontSize="9" fill="#64748b" textAnchor="middle">Este →</text>
          <text x={14} y={plot.margin.t + plot.h / 2} fontSize="9" fill="#64748b" textAnchor="middle" transform={`rotate(-90 14 ${plot.margin.t + plot.h / 2})`}>Norte →</text>

          <g>
            <line x1={plot.north.x} y1={plot.north.y} x2={plot.north.x} y2={plot.north.tip} stroke="#1e40af" strokeWidth="2.5" />
            <polygon points={`${plot.north.x},${plot.north.tip} ${plot.north.x - 6},${plot.north.tip + 10} ${plot.north.x + 6},${plot.north.tip + 10}`} fill="#1e40af" />
            <text x={plot.north.x} y={plot.north.tip - 5} fontSize="12" fill="#1e40af" fontWeight="700" textAnchor="middle">N</text>
          </g>

          <polygon points={plot.polyStr} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth="2" strokeDasharray={plot.gapLine ? '6 4' : undefined} />

          {plot.lados.map((l, i) => (
            <g key={i}>
              {mostrarDistancias && (
                <text x={l.mx} y={l.my - 5} fontSize="9" fill="#0f766e" textAnchor="middle" fontWeight="600">
                  {fmtNum(l.dist, 2)} m
                </text>
              )}
            </g>
          ))}

          {plot.gapLine && (
            <line
              x1={plot.gapLine.x1}
              y1={plot.gapLine.y1}
              x2={plot.gapLine.x2}
              y2={plot.gapLine.y2}
              stroke="#dc2626"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}

          {plot.amarreCoord && (
            <g>
              <circle cx={plot.amarreCoord.x} cy={plot.amarreCoord.y} r="6" fill="#16a34a" stroke="#fff" strokeWidth="2" />
              <text x={plot.amarreCoord.x + 8} y={plot.amarreCoord.y - 10} fontSize="10" fill="#166534" fontWeight="700">
                {plot.amarreCoord.p.nombre} (amarre)
              </text>
            </g>
          )}

          {plot.coords.map(({ x, y, p }) => (
            <g key={p.id || p.nombre_punto}>
              <circle cx={x} cy={y} r="5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
              <text x={x + 8} y={y - 8} fontSize="10" fill={ui.grafico.pointLabel} fontWeight="600">{p.nombre_punto}</text>
              {mostrarAngulos && (p.angulo_observado_texto || p.angulo_medido != null) && (
                <text x={x + 8} y={y + 4} fontSize="8" fill="#7c3aed">{p.angulo_observado_texto || '—'}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
