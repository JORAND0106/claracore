import { useMemo, useState } from 'react'
import { useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'
import { useTopoViewportGestures } from './useTopoViewportGestures'
import {
  MARKER_PX,
  markerRadiusSvg,
  markerStrokeSvg,
  pickVisibleLabelIndices,
  placePointLabels,
  resolvePlanoLod,
  textCounterScale,
  estimateLabelBoxPx,
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

/**
 * Bloque de etiqueta: nombre (jerarquía) + datos técnicos + fondo semitransparente.
 * Offsets dx/dy en píxeles de pantalla (espacio counter-scaled).
 */
function LabelBlock({
  x,
  y,
  scale,
  lines = [],
  dx = 7,
  dy = -4,
  textAnchor = 'start',
  nameColor = '#1e3a8a',
  bodyColor = '#475569',
}) {
  const inv = textCounterScale(scale)
  const rows = (lines || []).filter((l) => l != null && String(l).length > 0)
  if (!rows.length) return null

  const nameSize = 11
  const bodySize = 8
  const lineGap = 2
  const padX = 5
  const padY = 3
  const box = estimateLabelBoxPx(rows, { nameSize, bodySize, padX, padY, lineGap })

  let rectX = 0
  if (textAnchor === 'end') rectX = -box.w
  else if (textAnchor === 'middle') rectX = -box.w / 2

  const rectTop = dy - padY

  return (
    <g transform={`translate(${x}, ${y}) scale(${inv})`} style={{ pointerEvents: 'none' }}>
      <rect
        x={rectX + dx}
        y={rectTop}
        width={box.w}
        height={box.h}
        rx={4}
        ry={4}
        fill="rgba(255,255,255,0.92)"
        stroke="rgba(148,163,184,0.55)"
        strokeWidth={1}
      />
      {rows.map((line, i) => {
        const fs = i === 0 ? nameSize : bodySize
        const yPos = i === 0
          ? padY + nameSize * 0.78
          : padY + nameSize + lineGap + (i - 1) * (bodySize + lineGap) + bodySize * 0.78
        return (
          <text
            key={`${i}-${String(line).slice(0, 12)}`}
            x={dx}
            y={rectTop + yPos}
            fontSize={fs}
            fontWeight={i === 0 ? 700 : 500}
            fill={i === 0 ? nameColor : bodyColor}
            textAnchor={textAnchor}
          >
            {line}
          </text>
        )
      })}
    </g>
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

  const showDists = mostrarDistancias && lod.showDistancias
  const showAngs = mostrarAngulos && lod.showAngulos
  const showCoords = lod.showCoords

  const labelsVisible = useMemo(() => {
    if (!plot?.coords?.length) return []
    return pickVisibleLabelIndices(plot.coords, scale, lod.level)
  }, [plot, scale, lod.level])

  const placedLabels = useMemo(() => {
    if (!plot?.coords?.length) return []
    const items = plot.coords.map(({ x, y, p }, idx) => {
      if (!labelsVisible[idx]) return { x, y, lines: [] }
      const lines = [p.nombre_punto || `#${idx + 1}`]
      if (showAngs) {
        const angTxt = p.angulo_observado_texto
        if (angTxt) lines.push(angTxt)
      }
      if (showCoords && p.norte != null && p.este != null) {
        lines.push(`N ${fmtNum(p.norte, 2)}`)
        lines.push(`E ${fmtNum(p.este, 2)}`)
        if (p.cota != null) lines.push(`Z ${fmtNum(p.cota, 2)}`)
      }
      return { x, y, lines }
    })
    return placePointLabels(items, { scale, lodLevel: lod.level })
  }, [plot, labelsVisible, scale, lod.level, showAngs, showCoords])

  const ladosVisible = useMemo(() => {
    if (!plot?.lados?.length) return []
    const mids = plot.lados.map((l) => ({ x: l.mx, y: l.my }))
    // Más exigente cuando hay muchas etiquetas de punto (zoom alto)
    return pickVisibleLabelIndices(mids, scale, Math.max(0, lod.level - 1))
  }, [plot, scale, lod.level])

  const markerR = markerRadiusSvg(scale)
  const markerStroke = markerStrokeSvg(scale)
  const amarreR = markerRadiusSvg(scale, {
    desiredPx: MARKER_PX.AMARRE,
    minPx: MARKER_PX.MIN,
    maxPx: MARKER_PX.MAX + 0.5,
  })

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

  const nameColor = ui.grafico?.pointLabel || '#1e3a8a'

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
                <line x1={plot.margin.l} y1={g.y} x2={plot.margin.l + plot.w} y2={g.y} stroke="#cbd5e1" strokeWidth={markerStrokeSvg(scale, 1)} />
                <ScreenText x={6} y={g.y} scale={scale} fontSize={9} fill="#64748b" dy={3}>
                  {fmtNum(g.val, 0)}
                </ScreenText>
              </g>
            ) : (
              <g key={`v-${g.val}`}>
                <line x1={g.x} y1={plot.margin.t} x2={g.x} y2={plot.margin.t + plot.h} stroke="#cbd5e1" strokeWidth={markerStrokeSvg(scale, 1)} />
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
            <line
              x1={plot.north.x}
              y1={plot.north.y}
              x2={plot.north.x}
              y2={plot.north.tip}
              stroke="#1e40af"
              strokeWidth={markerStrokeSvg(scale, 2)}
            />
            <polygon
              points={`${plot.north.x},${plot.north.tip} ${plot.north.x - 6 * textCounterScale(scale)},${plot.north.tip + 10 * textCounterScale(scale)} ${plot.north.x + 6 * textCounterScale(scale)},${plot.north.tip + 10 * textCounterScale(scale)}`}
              fill="#1e40af"
            />
            <ScreenText x={plot.north.x} y={plot.north.tip - 5} scale={scale} fontSize={12} fill="#1e40af" fontWeight="700" textAnchor="middle">
              N
            </ScreenText>
          </g>

          {plot.esCerrada ? (
            <polygon
              points={plot.polyStr}
              fill="rgba(37,99,235,0.08)"
              stroke="#2563eb"
              strokeWidth={markerStrokeSvg(scale, 1.75)}
              strokeDasharray={plot.gapLine ? '6 4' : undefined}
            />
          ) : (
            <polyline
              points={plot.polyStr}
              fill="none"
              stroke="#2563eb"
              strokeWidth={markerStrokeSvg(scale, 1.75)}
            />
          )}

          {plot.lados.map((l, i) => (
            <g key={i}>
              {showDists && ladosVisible[i] && (
                <LabelBlock
                  x={l.mx}
                  y={l.my}
                  scale={scale}
                  lines={[`${fmtNum(l.dist, 2)} m`]}
                  dx={0}
                  dy={-2}
                  textAnchor="middle"
                  nameColor="#0f766e"
                  bodyColor="#0f766e"
                />
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
              strokeWidth={markerStrokeSvg(scale, 1.75)}
              strokeDasharray="4 3"
            />
          )}

          {plot.llegadaObjCoord && (
            <g>
              <polygon
                points={(() => {
                  const { x, y } = plot.llegadaObjCoord
                  const r = amarreR
                  return `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`
                })()}
                fill="none"
                stroke="#15803d"
                strokeWidth={markerStroke}
              />
              <LabelBlock
                x={plot.llegadaObjCoord.x}
                y={plot.llegadaObjCoord.y}
                scale={scale}
                lines={[`${plot.llegadaObjCoord.p.nombre || 'Llegada'} (obj.)`]}
                dx={8}
                dy={-10}
                nameColor="#15803d"
              />
            </g>
          )}

          {plot.llegadaCalcCoord && (
            <g>
              <circle
                cx={plot.llegadaCalcCoord.x}
                cy={plot.llegadaCalcCoord.y}
                r={amarreR}
                fill="none"
                stroke="#c2410c"
                strokeWidth={markerStroke}
                strokeDasharray="3 2"
              />
              <LabelBlock
                x={plot.llegadaCalcCoord.x}
                y={plot.llegadaCalcCoord.y}
                scale={scale}
                lines={[`${plot.llegadaCalcCoord.p.nombre || 'Llegada'} (calc.)`]}
                dx={8}
                dy={12}
                nameColor="#c2410c"
              />
            </g>
          )}

          {plot.amarreCoord && (
            <g>
              <circle
                cx={plot.amarreCoord.x}
                cy={plot.amarreCoord.y}
                r={amarreR}
                fill="#16a34a"
                stroke="#fff"
                strokeWidth={markerStroke}
              />
              <LabelBlock
                x={plot.amarreCoord.x}
                y={plot.amarreCoord.y}
                scale={scale}
                lines={[`${plot.amarreCoord.p.nombre} (amarre)`]}
                dx={8}
                dy={-10}
                nameColor="#166534"
              />
            </g>
          )}

          {plot.coords.map(({ x, y, p }, idx) => {
            const placed = placedLabels[idx]
            return (
              <g key={p.id || p.nombre_punto || idx}>
                <circle
                  cx={x}
                  cy={y}
                  r={markerR}
                  fill="#2563eb"
                  stroke="#fff"
                  strokeWidth={markerStroke}
                />
                {placed && (
                  <LabelBlock
                    x={x}
                    y={y}
                    scale={scale}
                    lines={placed.lines}
                    dx={placed.dx}
                    dy={placed.dy}
                    textAnchor={placed.textAnchor}
                    nameColor={nameColor}
                    bodyColor="#475569"
                  />
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
