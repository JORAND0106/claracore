import { useMemo, useState } from 'react'
import { useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'
import { useTopoViewportGestures } from './useTopoViewportGestures'
import {
  pickVisibleLabelIndices,
  resolvePlanoLod,
  textCounterScale,
} from './topoPlanoLod'

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

/** Texto con tamaño de pantalla estable (counter-scale respecto al zoom del SVG). */
function ScreenText({
  x,
  y,
  scale,
  fontSize = 10,
  children,
  textAnchor = 'start',
  dx = 0,
  dy = 0,
  ...rest
}) {
  const inv = textCounterScale(scale)
  return (
    <text
      transform={`translate(${x}, ${y}) scale(${inv})`}
      x={dx}
      y={dy}
      fontSize={fontSize}
      textAnchor={textAnchor}
      style={{ pointerEvents: 'none' }}
      {...rest}
    >
      {children}
    </text>
  )
}

export default function PoligonalGrafico({
  estaciones,
  puntoInicial = null,
  puntoFinal = null,
  cierre = null,
  ancho = 560,
  alto = 400,
}) {
  const ui = useTopoTheme()
  const [mostrarDistancias, setMostrarDistancias] = useState(true)
  const [mostrarAngulos, setMostrarAngulos] = useState(true)
  const {
    containerRef,
    scale,
    viewBox,
    resetVista,
    viewportHandlers,
    containerStyle,
    contentStyle,
  } = useTopoViewportGestures({ worldWidth: ancho, worldHeight: alto })

  const plot = useMemo(() => {
    const tipoPol = cierre?.tipo_pol || (puntoFinal ? 'abierta' : 'cerrada')
    const esAbierta = tipoPol === 'abierta'
    const puntos = puntosGrafico(estaciones)
    const amarre = puntoInicial?.norte != null && puntoInicial?.este != null
      ? { nombre: puntoInicial.nombre || 'Amarre', norte: puntoInicial.norte, este: puntoInicial.este, cota: puntoInicial.cota }
      : null
    const llegadaObj = cierre?.llegada_objetivo || (puntoFinal?.norte != null && puntoFinal?.este != null
      ? { nombre: puntoFinal.nombre || 'Llegada', norte: puntoFinal.norte, este: puntoFinal.este, cota: puntoFinal.cota }
      : null)
    const llegadaCalc = cierre?.llegada_calculada || null

    const all = [...puntos]
    if (amarre && !puntos.some((p) => p.nombre_punto === amarre.nombre)) {
      all.unshift(amarre)
    }
    for (const extra of [llegadaObj, llegadaCalc]) {
      if (extra?.norte != null && extra?.este != null && !all.some((p) => p.norte === extra.norte && p.este === extra.este)) {
        all.push({ ...extra, nombre_punto: extra.nombre })
      }
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
    const esCerrada = !esAbierta && coords.length >= 3

    const lados = []
    const nLados = esCerrada ? coords.length : Math.max(coords.length - 1, 0)
    for (let i = 0; i < nLados; i++) {
      const j = esCerrada ? (i + 1) % coords.length : i + 1
      if (j >= coords.length) break
      const a = coords[i]
      const b = coords[j]
      const dist = Math.hypot(b.p.norte - a.p.norte, b.p.este - a.p.este)
      lados.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist })
    }

    let gapLine = null
    if (esAbierta && llegadaObj && llegadaCalc) {
      const err = cierre?.error_lineal
      if (err != null && err > 0.05) {
        gapLine = {
          x1: tx(llegadaObj.este),
          y1: ty(llegadaObj.norte),
          x2: tx(llegadaCalc.este),
          y2: ty(llegadaCalc.norte),
          err,
          modo: 'llegada',
        }
      }
    } else if (amarre && cierre?.cerrado && coords.length >= 1) {
      const last = coords[coords.length - 1]
      const ax = tx(amarre.este)
      const ay = ty(amarre.norte)
      const err = cierre.error_lineal
      if (err != null && err > 0.05) {
        gapLine = { x1: last.x, y1: last.y, x2: ax, y2: ay, err, modo: 'amarre' }
      }
    }

    const amarreCoord = amarre ? { x: tx(amarre.este), y: ty(amarre.norte), p: amarre } : null
    const llegadaObjCoord = llegadaObj
      ? { x: tx(llegadaObj.este), y: ty(llegadaObj.norte), p: llegadaObj }
      : null
    const llegadaCalcCoord = llegadaCalc
      ? { x: tx(llegadaCalc.este), y: ty(llegadaCalc.norte), p: llegadaCalc }
      : null

    return {
      coords,
      polyStr,
      esCerrada,
      esAbierta,
      gridLines,
      lados,
      gapLine,
      amarreCoord,
      llegadaObjCoord,
      llegadaCalcCoord,
      margin,
      w,
      h,
      north: { x: margin.l + w - 28, y: margin.t + 18, tip: margin.t + 2 },
    }
  }, [estaciones, puntoInicial, puntoFinal, cierre, ancho, alto])

  const lod = useMemo(() => resolvePlanoLod(scale), [scale])

  const labelsVisible = useMemo(() => {
    if (!plot?.coords?.length) return []
    return pickVisibleLabelIndices(plot.coords, scale, lod.level)
  }, [plot, scale, lod.level])

  const ladosVisible = useMemo(() => {
    if (!plot?.lados?.length) return []
    const mids = plot.lados.map((l) => ({ x: l.mx, y: l.my }))
    return pickVisibleLabelIndices(mids, scale, lod.level)
  }, [plot, scale, lod.level])

  const showDists = mostrarDistancias && lod.showDistancias
  const showAngs = mostrarAngulos && lod.showAngulos
  const showCoords = lod.showCoords

  const lodHint = lod.level === 0
    ? 'Detalle: nombres'
    : lod.level === 1
      ? 'Detalle: nombres + distancias'
      : 'Detalle: nombres + distancias + ángulos + coords'

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
        <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Rueda / pellizcar: zoom · Arrastrar: pan · {lodHint}
        </span>
      </div>

      {plot.gapLine && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
          {plot.gapLine.modo === 'llegada' ? (
            <>Error de cierre a la llegada: {fmtNum(plot.gapLine.err, 3)} m entre objetivo y posición calculada (línea punteada).</>
          ) : (
            <>El polígono de vértices radiados no coincide con el amarre inicial: error de cierre {fmtNum(plot.gapLine.err, 3)} m (línea punteada roja).</>
          )}
        </p>
      )}

      <div
        ref={containerRef}
        {...viewportHandlers}
        style={{
          ...containerStyle,
          borderRadius: 8,
          border: ui.grafico.border,
          background: ui.grafico.background,
        }}
      >
        <svg
          width="100%"
          height={alto}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          style={contentStyle}
        >
          {plot.gridLines.map((g) =>
            g.type === 'h' ? (
              <g key={`h-${g.val}`}>
                <line x1={plot.margin.l} y1={g.y} x2={plot.margin.l + plot.w} y2={g.y} stroke="#cbd5e1" strokeWidth="1" />
                <ScreenText x={6} y={g.y} scale={scale} fontSize={9} fill="#64748b" dy={3}>
                  {fmtNum(g.val, 0)}
                </ScreenText>
              </g>
            ) : (
              <g key={`v-${g.val}`}>
                <line x1={g.x} y1={plot.margin.t} x2={g.x} y2={plot.margin.t + plot.h} stroke="#cbd5e1" strokeWidth="1" />
                <ScreenText x={g.x} y={alto - 8} scale={scale} fontSize={9} fill="#64748b" textAnchor="middle">
                  {fmtNum(g.val, 0)}
                </ScreenText>
              </g>
            ),
          )}

          <ScreenText x={plot.margin.l + plot.w / 2} y={alto - 6} scale={scale} fontSize={9} fill="#64748b" textAnchor="middle">
            Este →
          </ScreenText>
          <g transform={`translate(14, ${plot.margin.t + plot.h / 2}) rotate(-90) scale(${textCounterScale(scale)})`}>
            <text x={0} y={0} fontSize={9} fill="#64748b" textAnchor="middle" style={{ pointerEvents: 'none' }}>
              Norte →
            </text>
          </g>

          <g>
            <line x1={plot.north.x} y1={plot.north.y} x2={plot.north.x} y2={plot.north.tip} stroke="#1e40af" strokeWidth="2.5" />
            <polygon points={`${plot.north.x},${plot.north.tip} ${plot.north.x - 6},${plot.north.tip + 10} ${plot.north.x + 6},${plot.north.tip + 10}`} fill="#1e40af" />
            <ScreenText x={plot.north.x} y={plot.north.tip - 5} scale={scale} fontSize={12} fill="#1e40af" fontWeight="700" textAnchor="middle">
              N
            </ScreenText>
          </g>

          {plot.esCerrada ? (
            <polygon points={plot.polyStr} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeWidth="2" strokeDasharray={plot.gapLine ? '6 4' : undefined} />
          ) : (
            <polyline points={plot.polyStr} fill="none" stroke="#2563eb" strokeWidth="2" />
          )}

          {plot.lados.map((l, i) => (
            <g key={i}>
              {showDists && ladosVisible[i] && (
                <ScreenText x={l.mx} y={l.my} scale={scale} fontSize={9} fill="#0f766e" textAnchor="middle" fontWeight="600" dy={-5}>
                  {fmtNum(l.dist, 2)} m
                </ScreenText>
              )}
            </g>
          ))}

          {plot.gapLine && (
            <line
              x1={plot.gapLine.x1}
              y1={plot.gapLine.y1}
              x2={plot.gapLine.x2}
              y2={plot.gapLine.y2}
              stroke={plot.gapLine.modo === 'llegada' ? '#94a3b8' : '#dc2626'}
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}

          {plot.llegadaObjCoord && (
            <g>
              <polygon
                points={`${plot.llegadaObjCoord.x},${plot.llegadaObjCoord.y - 6} ${plot.llegadaObjCoord.x + 6},${plot.llegadaObjCoord.y} ${plot.llegadaObjCoord.x},${plot.llegadaObjCoord.y + 6} ${plot.llegadaObjCoord.x - 6},${plot.llegadaObjCoord.y}`}
                fill="none"
                stroke="#15803d"
                strokeWidth="1.5"
              />
              <ScreenText x={plot.llegadaObjCoord.x} y={plot.llegadaObjCoord.y} scale={scale} fontSize={10} fill="#15803d" fontWeight="700" dx={8} dy={-10}>
                {plot.llegadaObjCoord.p.nombre || 'Llegada'} (obj.)
              </ScreenText>
            </g>
          )}

          {plot.llegadaCalcCoord && (
            <g>
              <circle cx={plot.llegadaCalcCoord.x} cy={plot.llegadaCalcCoord.y} r="6" fill="none" stroke="#c2410c" strokeWidth="2" strokeDasharray="3 2" />
              <ScreenText x={plot.llegadaCalcCoord.x} y={plot.llegadaCalcCoord.y} scale={scale} fontSize={10} fill="#c2410c" fontWeight="700" dx={8} dy={12}>
                {plot.llegadaCalcCoord.p.nombre || 'Llegada'} (calc.)
              </ScreenText>
            </g>
          )}

          {plot.amarreCoord && (
            <g>
              <circle cx={plot.amarreCoord.x} cy={plot.amarreCoord.y} r="6" fill="#16a34a" stroke="#fff" strokeWidth="2" />
              <ScreenText x={plot.amarreCoord.x} y={plot.amarreCoord.y} scale={scale} fontSize={10} fill="#166534" fontWeight="700" dx={8} dy={-10}>
                {plot.amarreCoord.p.nombre} (amarre)
              </ScreenText>
            </g>
          )}

          {plot.coords.map(({ x, y, p }, idx) => {
            const showName = labelsVisible[idx]
            const angTxt = p.angulo_observado_texto || (p.angulo_medido != null ? '—' : null)
            return (
              <g key={p.id || p.nombre_punto || idx}>
                <circle cx={x} cy={y} r="5" fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
                {showName && (
                  <ScreenText x={x} y={y} scale={scale} fontSize={10} fill={ui.grafico.pointLabel} fontWeight="600" dx={8} dy={-8}>
                    {p.nombre_punto}
                  </ScreenText>
                )}
                {showName && showAngs && angTxt && (
                  <ScreenText x={x} y={y} scale={scale} fontSize={8} fill="#7c3aed" dx={8} dy={4}>
                    {angTxt}
                  </ScreenText>
                )}
                {showName && showCoords && p.norte != null && p.este != null && (
                  <ScreenText x={x} y={y} scale={scale} fontSize={7} fill="#64748b" dx={8} dy={showAngs && angTxt ? 16 : 6}>
                    N {fmtNum(p.norte, 2)} · E {fmtNum(p.este, 2)}
                    {p.cota != null ? ` · Z ${fmtNum(p.cota, 2)}` : ''}
                  </ScreenText>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
