import { useCallback, useMemo, useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'
import { useTopoViewportGestures } from './useTopoViewportGestures'
import {
  MARKER_PX,
  distanciasVecinas,
  markerRadiusSvg,
  markerStrokeSvg,
  pickVisibleLabelIndices,
  svgPointToCss,
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

/** Solo el nombre del punto, con fondo suave para contraste. */
function NameLabel({
  x,
  y,
  scale,
  nombre,
  dx = 7,
  dy = -5,
  textAnchor = 'start',
  color = '#1e3a8a',
  selected = false,
}) {
  const inv = textCounterScale(scale)
  const name = nombre || '—'
  const box = estimateLabelBoxPx([name], { nameSize: selected ? 12 : 11, padX: 4, padY: 2 })
  let rectX = 0
  if (textAnchor === 'end') rectX = -box.w
  else if (textAnchor === 'middle') rectX = -box.w / 2
  const rectTop = dy - box.padY
  return (
    <g transform={`translate(${x}, ${y}) scale(${inv})`} style={{ pointerEvents: 'none' }}>
      <rect
        x={rectX + dx}
        y={rectTop}
        width={box.w}
        height={box.h}
        rx={3}
        ry={3}
        fill={selected ? 'rgba(219,234,254,0.95)' : 'rgba(255,255,255,0.9)'}
        stroke={selected ? 'rgba(37,99,235,0.55)' : 'rgba(148,163,184,0.45)'}
        strokeWidth={1}
      />
      <text
        x={dx}
        y={rectTop + box.padY + (selected ? 12 : 11) * 0.78}
        fontSize={selected ? 12 : 11}
        fontWeight={700}
        fill={color}
        textAnchor={textAnchor}
      >
        {name}
      </text>
    </g>
  )
}

function NodoDetallePopup({ detalle, style, onClose }) {
  if (!detalle) return null
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }
  const label = { color: '#64748b', fontSize: 11 }
  const value = { color: '#0f172a', fontSize: 12, fontWeight: 600, textAlign: 'right' }
  return (
    <div
      role="dialog"
      aria-label={`Detalle de ${detalle.nombre}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        zIndex: 5,
        minWidth: 200,
        maxWidth: 260,
        padding: '10px 12px',
        background: '#fff',
        border: '1px solid #cbd5e1',
        borderRadius: 10,
        boxShadow: '0 10px 28px rgba(15,23,42,0.18)',
        fontFamily: 'inherit',
        ...style,
      }}
    >      <CcModalBrandHeader theme={t} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#1e3a8a' }}>{detalle.nombre}</div>
        <button
          type="button"
          aria-label="Cerrar detalle"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
        <div style={row}>
          <span style={label}>Norte</span>
          <span style={value}>{detalle.norte != null ? fmtNum(detalle.norte, 3) : '—'}</span>
        </div>
        <div style={row}>
          <span style={label}>Este</span>
          <span style={value}>{detalle.este != null ? fmtNum(detalle.este, 3) : '—'}</span>
        </div>
        <div style={row}>
          <span style={label}>Cota</span>
          <span style={value}>{detalle.cota != null ? fmtNum(detalle.cota, 3) : '—'}</span>
        </div>
      </div>
      <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
        <div style={row}>
          <span style={label}>
            Dist. anterior{detalle.prevNombre ? ` (${detalle.prevNombre})` : ''}
          </span>
          <span style={value}>
            {detalle.distPrev != null ? `${fmtNum(detalle.distPrev, 3)} m` : '—'}
          </span>
        </div>
        <div style={row}>
          <span style={label}>
            Dist. siguiente{detalle.nextNombre ? ` (${detalle.nextNombre})` : ''}
          </span>
          <span style={value}>
            {detalle.distNext != null ? `${fmtNum(detalle.distNext, 3)} m` : '—'}
          </span>
        </div>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 10, color: '#94a3b8' }}>
        Clic fuera o en otro punto para cerrar
      </p>
    </div>
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
  const [selectedKey, setSelectedKey] = useState(null)
  const {
    containerRef,
    scale,
    viewBox,
    cssSize,
    resetVista,
    consumeTap,
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

  // Solo nombres: declutter fijo (nivel 0), en cualquier zoom
  const namesVisible = useMemo(() => {
    if (!plot?.coords?.length) return []
    return pickVisibleLabelIndices(plot.coords, scale, 0)
  }, [plot, scale])

  const markerR = markerRadiusSvg(scale)
  const markerStroke = markerStrokeSvg(scale)
  const hitR = markerRadiusSvg(scale, {
    desiredPx: 14,
    minPx: 10,
    maxPx: 18,
  })
  const amarreR = markerRadiusSvg(scale, {
    desiredPx: MARKER_PX.AMARRE,
    minPx: MARKER_PX.MIN,
    maxPx: MARKER_PX.MAX + 0.5,
  })

  const selectedDetalle = useMemo(() => {
    if (!plot || selectedKey == null) return null
    if (typeof selectedKey === 'string' && selectedKey.startsWith('extra:')) {
      const kind = selectedKey.slice(6)
      const c = kind === 'amarre'
        ? plot.amarreCoord
        : kind === 'llegadaObj'
          ? plot.llegadaObjCoord
          : kind === 'llegadaCalc'
            ? plot.llegadaCalcCoord
            : null
      if (!c) return null
      const p = c.p
      return {
        key: selectedKey,
        x: c.x,
        y: c.y,
        nombre: `${p.nombre || p.nombre_punto || kind}${kind === 'amarre' ? ' (amarre)' : kind === 'llegadaObj' ? ' (obj.)' : kind === 'llegadaCalc' ? ' (calc.)' : ''}`,
        norte: p.norte,
        este: p.este,
        cota: p.cota,
        distPrev: null,
        distNext: null,
        prevNombre: null,
        nextNombre: null,
      }
    }
    const idx = Number(selectedKey)
    const c = plot.coords[idx]
    if (!c) return null
    const vecinos = distanciasVecinas(plot.coords, idx, plot.esCerrada)
    const p = c.p
    return {
      key: selectedKey,
      x: c.x,
      y: c.y,
      nombre: p.nombre_punto || p.nombre || `#${idx + 1}`,
      norte: p.norte,
      este: p.este,
      cota: p.cota,
      distPrev: vecinos.prev,
      distNext: vecinos.next,
      prevNombre: vecinos.prevNombre,
      nextNombre: vecinos.nextNombre,
    }
  }, [plot, selectedKey])

  const popupCss = useMemo(() => {
    if (!selectedDetalle || !viewBox) return null
    const pos = svgPointToCss(selectedDetalle.x, selectedDetalle.y, viewBox, cssSize.w, cssSize.h)
    // Anclar popup a la derecha del punto; si no cabe, a la izquierda
    const popupW = 230
    const popupH = 180
    let left = pos.left + 14
    let top = pos.top - 20
    if (left + popupW > cssSize.w - 8) left = pos.left - popupW - 10
    if (left < 8) left = 8
    if (top + popupH > cssSize.h - 8) top = Math.max(8, cssSize.h - popupH - 8)
    if (top < 8) top = 8
    return { left, top }
  }, [selectedDetalle, viewBox, cssSize])

  const selectNodo = useCallback((key) => {
    setSelectedKey((prev) => (prev === key ? null : key))
  }, [])

  const trySelectFromTap = useCallback((key, e) => {
    e?.stopPropagation?.()
    const tap = consumeTap()
    if (!tap) return
    selectNodo(key)
  }, [consumeTap, selectNodo])

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
        <button
          type="button"
          onClick={resetVista}
          style={{ fontSize: 'var(--cc-xs)', padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
        >
          Restablecer zoom
        </button>
        <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Rueda / pellizcar: zoom · Arrastrar: pan · Clic en un punto: detalle
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
          onClick={() => {
            // Clic en vacío (no en nodo): cerrar popup si fue tap limpio
            const tap = consumeTap()
            if (tap) setSelectedKey(null)
          }}
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
            <g
              data-nodo-key="extra:llegadaObj"
              style={{ cursor: 'pointer' }}
              onClick={(e) => trySelectFromTap('extra:llegadaObj', e)}
              onTouchEnd={(e) => trySelectFromTap('extra:llegadaObj', e)}
            >
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
              <circle cx={plot.llegadaObjCoord.x} cy={plot.llegadaObjCoord.y} r={hitR} fill="transparent" />
              <NameLabel
                x={plot.llegadaObjCoord.x}
                y={plot.llegadaObjCoord.y}
                scale={scale}
                nombre={`${plot.llegadaObjCoord.p.nombre || 'Llegada'} (obj.)`}
                color="#15803d"
                selected={selectedKey === 'extra:llegadaObj'}
              />
            </g>
          )}

          {plot.llegadaCalcCoord && (
            <g
              data-nodo-key="extra:llegadaCalc"
              style={{ cursor: 'pointer' }}
              onClick={(e) => trySelectFromTap('extra:llegadaCalc', e)}
              onTouchEnd={(e) => trySelectFromTap('extra:llegadaCalc', e)}
            >
              <circle
                cx={plot.llegadaCalcCoord.x}
                cy={plot.llegadaCalcCoord.y}
                r={amarreR}
                fill="none"
                stroke="#c2410c"
                strokeWidth={markerStroke}
                strokeDasharray="3 2"
              />
              <circle cx={plot.llegadaCalcCoord.x} cy={plot.llegadaCalcCoord.y} r={hitR} fill="transparent" />
              <NameLabel
                x={plot.llegadaCalcCoord.x}
                y={plot.llegadaCalcCoord.y}
                scale={scale}
                nombre={`${plot.llegadaCalcCoord.p.nombre || 'Llegada'} (calc.)`}
                color="#c2410c"
                selected={selectedKey === 'extra:llegadaCalc'}
              />
            </g>
          )}

          {plot.amarreCoord && (
            <g
              data-nodo-key="extra:amarre"
              style={{ cursor: 'pointer' }}
              onClick={(e) => trySelectFromTap('extra:amarre', e)}
              onTouchEnd={(e) => trySelectFromTap('extra:amarre', e)}
            >
              <circle
                cx={plot.amarreCoord.x}
                cy={plot.amarreCoord.y}
                r={amarreR}
                fill="#16a34a"
                stroke="#fff"
                strokeWidth={markerStroke}
              />
              <circle cx={plot.amarreCoord.x} cy={plot.amarreCoord.y} r={hitR} fill="transparent" />
              <NameLabel
                x={plot.amarreCoord.x}
                y={plot.amarreCoord.y}
                scale={scale}
                nombre={`${plot.amarreCoord.p.nombre} (amarre)`}
                color="#166534"
                selected={selectedKey === 'extra:amarre'}
              />
            </g>
          )}

          {plot.coords.map(({ x, y, p }, idx) => {
            const key = String(idx)
            const isSel = selectedKey === key
            return (
              <g
                key={p.id || p.nombre_punto || idx}
                data-nodo-key={key}
                style={{ cursor: 'pointer' }}
                onClick={(e) => trySelectFromTap(key, e)}
                onTouchEnd={(e) => trySelectFromTap(key, e)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isSel ? markerR * 1.25 : markerR}
                  fill={isSel ? '#1d4ed8' : '#2563eb'}
                  stroke="#fff"
                  strokeWidth={markerStroke}
                />
                {/* Área de toque ampliada */}
                <circle cx={x} cy={y} r={hitR} fill="transparent" />
                {namesVisible[idx] && (
                  <NameLabel
                    x={x}
                    y={y}
                    scale={scale}
                    nombre={p.nombre_punto}
                    color={nameColor}
                    selected={isSel}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {selectedDetalle && popupCss && (
          <NodoDetallePopup
            detalle={selectedDetalle}
            style={popupCss}
            onClose={() => setSelectedKey(null)}
          />
        )}
      </div>
    </div>
  )
}
