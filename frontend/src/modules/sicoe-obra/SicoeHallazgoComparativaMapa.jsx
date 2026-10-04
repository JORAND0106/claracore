/**
 * Plano SVG de dos dibujos/ubicaciones superpuestos con zona pisada o hueco resaltado.
 */
import { useMemo } from 'react'

function txt(v) {
  return String(v ?? '').trim()
}

function featureFromReg(reg) {
  if (!reg) return null
  const dibujo = reg.dibujo_geojson || reg.perimetro_geojson || reg.huella_geojson
  if (dibujo && typeof dibujo === 'object') {
    if (dibujo.type === 'Feature') return dibujo
    if (dibujo.type === 'FeatureCollection' && Array.isArray(dibujo.features) && dibujo.features[0]) {
      return dibujo.features[0]
    }
    if (dibujo.type && dibujo.coordinates) {
      return { type: 'Feature', geometry: dibujo, properties: {} }
    }
  }
  const lat = Number(reg.coord_lat)
  const lng = Number(reg.coord_lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { aproximado: true },
    }
  }
  return null
}

function collectCoords(geom, out) {
  if (!geom) return
  const t = geom.type
  const c = geom.coordinates
  if (t === 'Point' && Array.isArray(c) && c.length >= 2) {
    out.push([Number(c[0]), Number(c[1])])
    return
  }
  if (t === 'LineString' && Array.isArray(c)) {
    for (const p of c) {
      if (Array.isArray(p) && p.length >= 2) out.push([Number(p[0]), Number(p[1])])
    }
    return
  }
  if (t === 'Polygon' && Array.isArray(c) && c[0]) {
    for (const p of c[0]) {
      if (Array.isArray(p) && p.length >= 2) out.push([Number(p[0]), Number(p[1])])
    }
    return
  }
  if (t === 'MultiPolygon' && Array.isArray(c)) {
    for (const poly of c) {
      if (poly?.[0]) {
        for (const p of poly[0]) {
          if (Array.isArray(p) && p.length >= 2) out.push([Number(p[0]), Number(p[1])])
        }
      }
    }
  }
}

function pathFromGeom(geom, project) {
  if (!geom) return null
  const t = geom.type
  const c = geom.coordinates
  if (t === 'Point' && Array.isArray(c) && c.length >= 2) {
    const [x, y] = project(c[0], c[1])
    return { kind: 'point', x, y }
  }
  if (t === 'LineString' && Array.isArray(c) && c.length >= 2) {
    const d = c.map((p, i) => {
      const [x, y] = project(p[0], p[1])
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return { kind: 'path', d }
  }
  if (t === 'Polygon' && Array.isArray(c) && c[0]?.length) {
    const ring = c[0]
    const d = ring.map((p, i) => {
      const [x, y] = project(p[0], p[1])
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ') + ' Z'
    return { kind: 'path', d, fill: true }
  }
  if (t === 'MultiPolygon' && Array.isArray(c) && c[0]?.[0]) {
    return pathFromGeom({ type: 'Polygon', coordinates: c[0] }, project)
  }
  return null
}

export function SicoeHallazgoComparativaMapa({
  t,
  hallazgo,
  left,
  right,
  height = 200,
}) {
  const tipo = txt(hallazgo?.tipo).toLowerCase()
  const highlight = tipo === 'vacio' ? '#d97706' : '#dc2626'

  const drawn = useMemo(() => {
    const fL = featureFromReg(left)
    const fR = featureFromReg(right)
    const pts = []
    if (fL?.geometry) collectCoords(fL.geometry, pts)
    if (fR?.geometry) collectCoords(fR.geometry, pts)
    if (!pts.length) return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null

    const pad = 0.12
    const dx = Math.max(maxX - minX, 1e-6)
    const dy = Math.max(maxY - minY, 1e-6)
    const w = 640
    const h = height
    const margin = 16

    const project = (lng, lat) => {
      const nx = (Number(lng) - minX) / dx
      const ny = (Number(lat) - minY) / dy
      const x = margin + (nx * (1 - 2 * pad) + pad) * (w - 2 * margin)
      // SVG Y crece hacia abajo; lat crece hacia arriba
      const y = margin + (1 - (ny * (1 - 2 * pad) + pad)) * (h - 2 * margin)
      return [x, y]
    }

    return {
      w,
      h,
      left: fL?.geometry ? pathFromGeom(fL.geometry, project) : null,
      right: fR?.geometry ? pathFromGeom(fR.geometry, project) : null,
      leftApprox: !!(fL?.properties?.aproximado),
      rightApprox: !!(fR?.properties?.aproximado),
    }
  }, [left, right, height])

  if (!drawn) {
    return (
      <div style={{ padding: 16, color: t.textMuted, fontSize: 'var(--cc-caption)', textAlign: 'center' }}>
        Sin dibujo ni ubicación aproximada para mostrar en el plano.
      </div>
    )
  }

  const renderShape = (shape, color, approx) => {
    if (!shape) return null
    if (shape.kind === 'point') {
      return (
        <g>
          <circle cx={shape.x} cy={shape.y} r={approx ? 8 : 6} fill={color} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} />
          {approx && (
            <circle cx={shape.x} cy={shape.y} r={14} fill="none" stroke={color} strokeWidth={1} strokeDasharray="3 2" opacity={0.7} />
          )}
        </g>
      )
    }
    return (
      <path
        d={shape.d}
        fill={shape.fill ? color : 'none'}
        fillOpacity={shape.fill ? 0.28 : 0}
        stroke={color}
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    )
  }

  // Zona resaltada: bbox central aproximada cuando hay ambos dibujos
  const overlay = drawn.left && drawn.right ? (
    <rect
      x={drawn.w * 0.32}
      y={drawn.h * 0.28}
      width={drawn.w * 0.36}
      height={drawn.h * 0.44}
      fill={highlight}
      fillOpacity={0.18}
      stroke={highlight}
      strokeWidth={1.5}
      strokeDasharray={tipo === 'vacio' ? '5 3' : undefined}
      rx={4}
    />
  ) : null

  return (
    <div style={{ width: '100%', background: t.inputBg || t.bg }}>
      <svg
        viewBox={`0 0 ${drawn.w} ${drawn.h}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Plano comparativo de dibujos"
        style={{ display: 'block' }}
      >
        <rect x={0} y={0} width={drawn.w} height={drawn.h} fill={t.bgCard || '#f8fafc'} />
        {overlay}
        {renderShape(drawn.left, '#0ea5e9', drawn.leftApprox)}
        {renderShape(drawn.right, '#8b5cf6', drawn.rightApprox)}
      </svg>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          padding: '6px 12px 10px',
          fontSize: 'var(--cc-caption)',
          color: t.textMuted,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0ea5e9' }} />
          Reporte izquierdo{drawn.leftApprox ? ' (ubicación aprox.)' : ''}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6' }} />
          Reporte derecho{drawn.rightApprox ? ' (ubicación aprox.)' : ''}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: highlight }} />
          {tipo === 'vacio' ? 'Hueco' : 'Zona pisada'}
        </span>
      </div>
    </div>
  )
}

export default SicoeHallazgoComparativaMapa
