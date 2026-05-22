/**
 * Programación de obra — mapa (Mapbox) + panel lateral 420px.
 * Colores según prog_pk_estado de la versión vigente sellada; borrador en meta.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Upload } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { API_BASE } from './apiBase'
import { getContratoPlanoGeojson } from './contratoPlanoGeojsonCache'
import { sanitizePlanoFeatureCollection } from './geoPlanoSanitize'
import ProgObraProgramacionModal from './ProgObraProgramacionModal'
import ProgObraDependenciasGlobales from './ProgObraDependenciasGlobales'
import { fmtCOP, fmtCant, fmtDateHuman, fmtDateIso } from './progObraFormat'
import { aggregatePptoItemKeysByPk, buildProgValidationPreCheck } from './progObraValidation'
import {
  FILTER_MAPBOX_LABEL_ABSCISA,
  mapboxPlanoSymbolLayout,
  MAPBOX_PLANO_PAINT_LABELS,
  MAPBOX_ABSCISA_TEXT_FIELD,
} from './mapboxPlanoLabels'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
/** Plano físico del contrato: norte a la izquierda; el usuario puede rotar después. */
const MAP_INITIAL_BEARING = 270
const MAPBOX_STYLE_SATELLITE = 'mapbox://styles/mapbox/satellite-streets-v12'
const MAPBOX_STYLE_OUTDOORS = 'mapbox://styles/mapbox/outdoors-v12'
/** Alineado con backend presupuesto / prog_obra (polígonos). */
const PRESUPUESTO_TIPO_POLIGONO = 'Presupuesto de Obra'

function extendLngLatBox(box, lng, lat) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return box
  if (!box) return { minLng: lng, maxLng: lng, minLat: lat, maxLat: lat }
  return {
    minLng: Math.min(box.minLng, lng),
    maxLng: Math.max(box.maxLng, lng),
    minLat: Math.min(box.minLat, lat),
    maxLat: Math.max(box.maxLat, lat),
  }
}

function extendBoxFromRing(box, ring) {
  if (!Array.isArray(ring)) return box
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    box = extendLngLatBox(box, Number(pt[0]), Number(pt[1]))
  }
  return box
}

function boundsFromGeometry(geom, box) {
  if (!geom?.type) return box
  const c = geom.coordinates
  switch (geom.type) {
    case 'Point':
      return extendLngLatBox(box, Number(c[0]), Number(c[1]))
    case 'MultiPoint':
      for (const p of c || []) box = extendLngLatBox(box, Number(p[0]), Number(p[1]))
      return box
    case 'LineString':
      return extendBoxFromRing(box, c)
    case 'MultiLineString':
      for (const line of c || []) box = extendBoxFromRing(box, line)
      return box
    case 'Polygon':
      for (const ring of c || []) box = extendBoxFromRing(box, ring)
      return box
    case 'MultiPolygon':
      for (const poly of c || []) for (const ring of poly || []) box = extendBoxFromRing(box, ring)
      return box
    case 'GeometryCollection':
      for (const g of geom.geometries || []) box = boundsFromGeometry(g, box)
      return box
    default:
      return box
  }
}

/** [[minLng, minLat], [maxLng, maxLat]] para map.fitBounds, o null si no hay geometría. */
function boundsLngLatFromFeatureCollection(fc) {
  let box = null
  const feats = fc?.features
  if (!Array.isArray(feats)) return null
  for (const f of feats) {
    if (f?.geometry) box = boundsFromGeometry(f.geometry, box)
  }
  if (!box) return null
  const { minLng, maxLng, minLat, maxLat } = box
  if (!Number.isFinite(minLng) || !Number.isFinite(maxLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return null
  }
  const eps = 1e-5
  if (Math.abs(maxLng - minLng) < eps && Math.abs(maxLat - minLat) < eps) {
    return [
      [minLng - eps, minLat - eps],
      [maxLng + eps, maxLat + eps],
    ]
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

function installMapboxAttributionLinksOpenNewTab(map) {
  const el = map.getContainer()
  const fn = (e) => {
    const a = e.target && typeof e.target.closest === 'function' && e.target.closest('a[href]')
    if (!a) return
    const h = a.getAttribute('href') || ''
    if (!h || h.charAt(0) === '#') return
    e.preventDefault()
    e.stopPropagation()
    window.open(h, '_blank', 'noopener,noreferrer')
  }
  el.addEventListener('click', fn, true)
  return () => {
    try {
      el.removeEventListener('click', fn, true)
    } catch {
      /* ignore */
    }
  }
}

function normalizePlanoGeojson(plano) {
  if (plano == null || plano === '') return { type: 'FeatureCollection', features: [] }
  let p = plano
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p)
    } catch {
      return { type: 'FeatureCollection', features: [] }
    }
  }
  if (!p || typeof p !== 'object') return { type: 'FeatureCollection', features: [] }
  let fc
  if (p.type === 'FeatureCollection' && Array.isArray(p.features)) fc = p
  else if (p.type === 'Feature' && p.geometry) fc = { type: 'FeatureCollection', features: [p] }
  else if (Array.isArray(p.features)) fc = { type: 'FeatureCollection', features: p.features }
  else return { type: 'FeatureCollection', features: [] }
  return sanitizePlanoFeatureCollection(fc)
}

function featurePkId(f) {
  const p = f?.properties
  if (!p) return ''
  return String(p.PK_ID ?? p.pk_id ?? p.Layer ?? p.layer ?? p.Name ?? '').trim()
}

function colorForEstado(estado) {
  switch (estado) {
    case 'sin_cantidad':
      return { fill: '#94a3b8', line: '#64748b', op: 0.08 }
    case 'sin_iniciar':
      return { fill: '#888780', line: '#888780', op: 0.35 }
    case 'en_progreso':
      return { fill: '#EF9F27', line: '#EF9F27', op: 0.6 }
    case 'completa':
      return { fill: '#2563EB', line: '#2563EB', op: 0.7 }
    default:
      return { fill: '#888780', line: '#888780', op: 0.35 }
  }
}

function buildEnrichedPlano(planoFc, metaMap, criticalPkIds = new Set()) {
  if (!planoFc?.features) return { type: 'FeatureCollection', features: [] }
  return {
    ...planoFc,
    features: (planoFc.features || []).map((f) => {
      const pkid = featurePkId(f)
      const row = metaMap[pkid] || {}
      const est = row.estado_programacion || 'sin_iniciar'
      const c = colorForEstado(est)
      const critico = Boolean(row.tiene_ruta_critica) || criticalPkIds.has(pkid)
      const desviacion = Boolean(row.tiene_desviacion) && !critico
      return {
        ...f,
        properties: {
          ...f.properties,
          pk_id: pkid,
          prog_estado: est,
          prog_fill: c.fill,
          prog_line: c.line,
          prog_op: c.op,
          prog_critico: critico ? 1 : 0,
          prog_desviacion: desviacion ? 1 : 0,
          prog_desviacion_tipo: row.desviacion_tipo || '',
        },
      }
    }),
  }
}

/** Leyenda estados programación (alineada con prog_pk_estado / colorForEstado). */
const MAPA_LEYENDA_ESTADOS = [
  { key: 'sin_cantidad', label: 'Sin cantidad', desc: 'PK sin ítems activos en presupuesto', fill: '#94a3b8', op: 0.08 },
  { key: 'sin_iniciar', label: 'Sin iniciar', desc: 'Hay ítems; ninguno con fecha', fill: '#888780', op: 0.35 },
  { key: 'en_progreso', label: 'En progreso', desc: 'Algunos ítems con fecha', fill: '#EF9F27', op: 0.6 },
  { key: 'completa', label: 'Completamente programado', desc: 'Todos los ítems con fecha', fill: '#2563EB', op: 0.7 },
  { key: 'desviacion', label: 'Desviación vs baseline', desc: 'Fin de obra fuera del umbral configurado', fill: '#f97316', op: 0.9, lineOnly: true },
]

function progBarVisual(pct, estado) {
  const e = estado || 'sin_iniciar'
  if (e === 'sin_cantidad' || pct == null || !Number.isFinite(Number(pct))) {
    return { blocks: '──────────', fill: '#d1d5db' }
  }
  const p = Math.max(0, Math.min(100, Number(pct)))
  const filled = Math.round(p / 10)
  const fill = e === 'completa' ? '#2563EB' : e === 'en_progreso' ? '#F59E0B' : '#888780'
  return { blocks: `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`, fill }
}

function ProgPanelIconBtn({ title, onClick, disabled, children, t }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        padding: 0,
        borderRadius: 6,
        border: `1px solid ${t.border}`,
        background: t.bg,
        color: disabled ? t.textMuted : t.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function ProgPkListado({ rows, selPk, t, onSelectPk }) {
  const [collapsed, setCollapsed] = useState(true)
  const sorted = [...(rows || [])].sort((a, b) =>
    String(a.pk_id || '').localeCompare(String(b.pk_id || ''), undefined, { numeric: true }),
  )
  if (sorted.length === 0) return null

  return (
    <div style={{ marginTop: 2 }}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '4px 0',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 'var(--cc-caption)',
          color: t.text,
          textAlign: 'left',
        }}
      >
        <span style={{ color: t.textMuted, fontSize: 10, lineHeight: 1 }}>{collapsed ? '▸' : '▾'}</span>
        <span>PKs del proyecto ({sorted.length})</span>
      </button>
      {!collapsed && (
        <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 6, maxHeight: 200, overflowY: 'auto' }}>
          {sorted.map((r) => {
            const pk = String(r.pk_id || '').trim()
            if (!pk) return null
            const est = r.estado_programacion || 'sin_iniciar'
            const pctNum = est === 'sin_cantidad' ? null : Number(r.porcentaje_programado)
            const { blocks, fill } = progBarVisual(pctNum, est)
            const pctLabel = pctNum != null && Number.isFinite(pctNum) ? `${Math.round(pctNum)}%` : '—'
            const selected = pk === selPk
            const critico = Boolean(r.tiene_ruta_critica)
            const cardBg = critico ? '#fee2e2' : selected ? `${t.primary}18` : t.bg
            return (
              <button
                key={pk}
                type="button"
                onClick={() => onSelectPk(pk)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr auto',
                  gridTemplateRows: critico ? 'auto auto' : 'auto',
                  columnGap: 6,
                  rowGap: critico ? 1 : 0,
                  alignItems: 'center',
                  width: '100%',
                  padding: critico ? '4px 6px' : '3px 6px',
                  marginBottom: 3,
                  border: `1px solid ${selected ? t.primary : t.border}`,
                  borderRadius: 5,
                  background: cardBg,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 10,
                  color: t.text,
                  minHeight: 24,
                }}
              >
                <span
                  style={{
                    gridRow: critico ? '1 / -1' : undefined,
                    alignSelf: 'center',
                    fontWeight: selected ? 700 : 600,
                    color: selected ? t.primary : t.text,
                  }}
                >
                  PK {pk}
                </span>
                <span
                  style={{
                    gridRow: critico ? '1 / -1' : undefined,
                    alignSelf: 'center',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 9,
                    color: fill,
                    letterSpacing: -0.5,
                    overflow: 'hidden',
                  }}
                >
                  {blocks}
                </span>
                <span style={{ gridColumn: 3, textAlign: 'right', fontWeight: 600, fontSize: 10 }}>{pctLabel}</span>
                {critico && (
                  <span
                    style={{
                      gridColumn: 3,
                      textAlign: 'right',
                      fontSize: 8,
                      fontWeight: 600,
                      color: '#dc2626',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ⚠ Ruta crítica
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

async function parseApiError(res) {
  try {
    const j = await res.json()
    const d = j?.detail
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : x?.msg || JSON.stringify(x))).join('; ')
    return d || res.statusText || `Error ${res.status}`
  } catch {
    return res.statusText || `Error ${res.status}`
  }
}

function streetsStyleUrl(isDarkTheme) {
  return isDarkTheme ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
}

/** Terreno Mapbox (DEM) — solo en modo satélite. */
function ensureMapTerrain(map) {
  try {
    if (!map.getSource('mapbox-dem')) {
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      })
    }
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
  } catch {
    /* conflicto con DEM del propio estilo */
  }
}

function clearMapTerrain(map) {
  try {
    map.setTerrain(null)
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource('mapbox-dem')) map.removeSource('mapbox-dem')
  } catch {
    /* ignore */
  }
}

const PROG_MAP_HANDLERS = Symbol('progMapHandlers')

function removeProgLayersIfAny(map) {
  try {
    if (map.getLayer('prog-labels-abscisa')) map.removeLayer('prog-labels-abscisa')
    if (map.getLayer('prog-critico-line')) map.removeLayer('prog-critico-line')
    if (map.getLayer('prog-desviacion-line')) map.removeLayer('prog-desviacion-line')
    if (map.getLayer('prog-line')) map.removeLayer('prog-line')
    if (map.getLayer('prog-fill')) map.removeLayer('prog-fill')
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource('prog-pol')) map.removeSource('prog-pol')
  } catch {
    /* ignore */
  }
}

/** Tras `load` o `style.load`: terreno solo en satélite; fuente/capas/eventos de polígonos. */
function applyProgMapAfterStyle(map, basemapMode, enriched, onPkClick) {
  if (!map || !enriched) return
  if (basemapMode === 'satellite') {
    clearMapTerrain(map)
    ensureMapTerrain(map)
  } else {
    clearMapTerrain(map)
  }
  const existingSource = map.getSource('prog-pol')
  if (existingSource && typeof existingSource.setData === 'function' && map.getLayer('prog-fill')) {
    existingSource.setData(enriched)
    return
  }
  removeProgLayersIfAny(map)
  map.addSource('prog-pol', { type: 'geojson', data: enriched })
  map.addLayer({
    id: 'prog-fill',
    type: 'fill',
    source: 'prog-pol',
    paint: {
      'fill-color': ['get', 'prog_fill'],
      'fill-opacity': ['get', 'prog_op'],
    },
  })
  map.addLayer({
    id: 'prog-line',
    type: 'line',
    source: 'prog-pol',
    paint: {
      'line-color': ['coalesce', ['get', 'prog_line'], '#888780'],
      'line-width': 2,
      'line-opacity': 0.9,
    },
  })
  map.addLayer({
    id: 'prog-desviacion-line',
    type: 'line',
    source: 'prog-pol',
    filter: ['all', ['==', ['get', 'prog_desviacion'], 1], ['!=', ['get', 'prog_critico'], 1]],
    paint: {
      'line-color': '#f97316',
      'line-width': 3,
      'line-opacity': 0.9,
    },
  })
  map.addLayer({
    id: 'prog-critico-line',
    type: 'line',
    source: 'prog-pol',
    filter: ['==', ['get', 'prog_critico'], 1],
    paint: {
      'line-color': '#ef4444',
      'line-width': 4,
      'line-opacity': 0.9,
    },
  })
  map.addLayer({
    id: 'prog-labels-abscisa',
    type: 'symbol',
    source: 'prog-pol',
    filter: FILTER_MAPBOX_LABEL_ABSCISA,
    layout: mapboxPlanoSymbolLayout(MAPBOX_ABSCISA_TEXT_FIELD),
    paint: MAPBOX_PLANO_PAINT_LABELS,
  })
  const prev = map[PROG_MAP_HANDLERS]
  if (prev) {
    try {
      map.off('click', 'prog-fill', prev.onClick)
      map.off('mouseenter', 'prog-fill', prev.onEnter)
      map.off('mouseleave', 'prog-fill', prev.onLeave)
    } catch {
      /* ignore */
    }
  }
  const onClick = (e) => {
    const f = e.features && e.features[0]
    const pkid = featurePkId(f)
    if (pkid) onPkClick(pkid)
  }
  const onEnter = () => {
    map.getCanvas().style.cursor = 'pointer'
  }
  const onLeave = () => {
    map.getCanvas().style.cursor = ''
  }
  map.on('click', 'prog-fill', onClick)
  map.on('mouseenter', 'prog-fill', onEnter)
  map.on('mouseleave', 'prog-fill', onLeave)
  map[PROG_MAP_HANDLERS] = { onClick, onEnter, onLeave }
}

function basemapStyleUrl(mode, isDarkTheme) {
  if (mode === 'satellite') return MAPBOX_STYLE_SATELLITE
  if (mode === 'topo') return MAPBOX_STYLE_OUTDOORS
  return streetsStyleUrl(isDarkTheme)
}

function basemapLabel(mode) {
  if (mode === 'topo') return 'Topo'
  if (mode === 'satellite') return 'Satélite'
  return 'Plano'
}

/** Control top-right: menú Plano / Topo / Satélite. */
function createBasemapStyleControl({ getMode, t, onSelect }) {
  let container
  let menu
  let mainBtn
  const closeMenu = () => {
    if (menu) menu.style.display = 'none'
  }
  const mkOpt = (value, label) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    const styleBase = [
      'display:block',
      'width:100%',
      'text-align:left',
      'padding:8px 12px',
      'font-size:12px',
      'font-weight:600',
      'border:none',
      'background:transparent',
      'color:' + (t.text || '#111'),
      'cursor:pointer',
    ].join(';')
    b.style.cssText = styleBase
    const applySel = () => {
      const cur = getMode()
      if (value === cur) {
        b.style.background = (t.primary || '#2563eb') + '22'
        b.style.color = t.primary || '#2563eb'
      } else {
        b.style.background = 'transparent'
        b.style.color = t.text || '#111'
      }
    }
    applySel()
    b.onmouseenter = () => {
      if (value !== getMode()) b.style.background = (t.bg || '#f3f4f6')
    }
    b.onmouseleave = () => applySel()
    b.onclick = (ev) => {
      ev.stopPropagation()
      onSelect(value)
      closeMenu()
      if (mainBtn) mainBtn.textContent = basemapLabel(value)
    }
    return b
  }
  const rebuildMenu = () => {
    if (!menu) return
    menu.innerHTML = ''
    menu.appendChild(mkOpt('plano', 'Plano'))
    menu.appendChild(mkOpt('topo', 'Topo'))
    menu.appendChild(mkOpt('satellite', 'Satélite'))
  }
  return {
    onAdd() {
      container = document.createElement('div')
      container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group'
      container.style.position = 'relative'

      mainBtn = document.createElement('button')
      mainBtn.type = 'button'
      mainBtn.setAttribute('data-prog-basemap-btn', '1')
      mainBtn.textContent = basemapLabel(getMode())
      mainBtn.title = 'Vista del mapa'
      mainBtn.style.cssText = [
        'font-size:11px',
        'font-weight:700',
        'padding:6px 10px',
        'min-width:76px',
        'cursor:pointer',
        'color:#fff',
        'background:' + (t.primary || '#2563eb'),
        'border:none',
        'border-radius:4px',
      ].join(';')
      mainBtn.onmousedown = (e) => e.preventDefault()
      mainBtn.onclick = (e) => {
        e.stopPropagation()
        if (!menu) return
        rebuildMenu()
        mainBtn.textContent = basemapLabel(getMode())
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none'
      }

      menu = document.createElement('div')
      menu.style.cssText = [
        'display:none',
        'position:absolute',
        'top:100%',
        'right:0',
        'margin-top:4px',
        'min-width:140px',
        'padding:4px 0',
        'border-radius:8px',
        'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
        'background:' + (t.bgCard || '#fff'),
        'border:1px solid ' + (t.border || '#e5e7eb'),
        'z-index:20',
      ].join(';')
      rebuildMenu()

      container.appendChild(mainBtn)
      container.appendChild(menu)

      const onDoc = (e) => {
        if (!container.contains(e.target)) closeMenu()
      }
      document.addEventListener('click', onDoc, true)
      container.__progDocClose = onDoc

      return container
    },
    onRemove() {
      if (container?.__progDocClose) {
        document.removeEventListener('click', container.__progDocClose, true)
      }
      if (container?.parentNode) container.parentNode.removeChild(container)
    },
    getDefaultPosition: () => 'top-right',
  }
}

const PROG_Z_OVERLAY = 200000

function ProgOverlay({ children, onBackdropClick }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PROG_Z_OVERLAY,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onBackdropClick}
    >
      {children}
    </div>,
    document.body,
  )
}

function ProgPkEditorModal({
  open,
  onClose,
  t,
  selPk,
  rowSel,
  loadAct,
  loadPpto,
  editable,
  panelBusy,
  puedeEnviar,
  onEnviarValidacion,
  children,
}) {
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PROG_Z_OVERLAY,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        flexDirection: 'column',
        padding: '2vh 2vw',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--cc-title)', color: t.primary }}>PK {selPk}</div>
            {rowSel && (
              <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginTop: 2 }}>
                {rowSel.estado_programacion} · {rowSel.items_con_fecha ?? 0}/{rowSel.items_total ?? 0} ítems programados
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {loadAct && <span style={{ fontSize: 11, color: t.textMuted }}>Sincronizando…</span>}
            {loadPpto && <span style={{ fontSize: 11, color: t.textMuted }}>Cargando ítems…</span>}
            {puedeEnviar && (
              <button
                type="button"
                disabled={panelBusy}
                onClick={onEnviarValidacion}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: `1px solid ${t.primary}`,
                  background: t.primary,
                  color: '#fff',
                  cursor: panelBusy ? 'not-allowed' : 'pointer',
                  opacity: panelBusy ? 0.55 : 1,
                }}
              >
                Enviar a validación
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 16px 16px' }}>{children}</div>
        {!editable && (
          <div
            style={{
              padding: '8px 16px',
              borderTop: `1px solid ${t.border}`,
              fontSize: 11,
              color: t.textMuted,
              background: t.bg,
            }}
          >
            Solo lectura: seleccione una versión en borrador con permiso de edición.
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function useDebounced(value, ms) {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return d
}

export default function ModuloProgramacionObra({
  t,
  usuario,
  token,
  puedeEditar = false,
  puedeCrear = false,
  puedeValidar = false,
}) {
  const cid = usuario?.contrato_id
  const uid = usuario?.id
  const API = API_BASE
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const mapBaseModeRef = useRef('plano')
  const enrichedGeojsonRef = useRef(null)
  const mapRefreshDebounceRef = useRef(null)
  const [plano, setPlano] = useState(undefined)
  const [mapaResp, setMapaResp] = useState(null)
  const [versiones, setVersiones] = useState([])
  const [selPk, setSelPk] = useState(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState(null)
  const [workingVersionId, setWorkingVersionId] = useState(null)
  const [presupuestoRows, setPresupuestoRows] = useState([])
  const [progEstructura, setProgEstructura] = useState({ capitulos: [] })
  const [loadEstructura, setLoadEstructura] = useState(false)
  const [presupuestoContratoAll, setPresupuestoContratoAll] = useState([])
  const [loadPpto, setLoadPpto] = useState(false)
  const [validacionPreCheck, setValidacionPreCheck] = useState(null)
  const [actData, setActData] = useState({ capitulos: [], actividades: [] })
  const [loadAct, setLoadAct] = useState(false)
  const [panelBusy, setPanelBusy] = useState(false)
  const [rowSaveStatus, setRowSaveStatus] = useState({})
  const [validaciones, setValidaciones] = useState([])
  const [loadVal, setLoadVal] = useState(false)
  const [showCrearVersion, setShowCrearVersion] = useState(false)
  const [crearMotivo, setCrearMotivo] = useState('')
  const [validarModal, setValidarModal] = useState(null)
  const [progModalOpen, setProgModalOpen] = useState(false)
  const [modalOpenCompareTab, setModalOpenCompareTab] = useState(false)
  const [modalPkTabs, setModalPkTabs] = useState([])
  const [activeModalPk, setActiveModalPk] = useState(null)
  const [criticalPkIds, setCriticalPkIds] = useState(new Set())
  const criticalPulseRef = useRef(null)

  const handleCpmUpdated = useCallback((resultados) => {
    const ids = new Set()
    for (const r of resultados || []) {
      if (r.es_ruta_critica) ids.add(String(r.pk_id || '').trim())
    }
    setCriticalPkIds(ids)
  }, [])

  useEffect(() => {
    const ids = new Set()
    for (const r of mapaResp?.pk || []) {
      if (r.tiene_ruta_critica) ids.add(String(r.pk_id || '').trim())
    }
    if (mapaResp?.pk) setCriticalPkIds(ids)
  }, [mapaResp])

  useEffect(() => {
    if (criticalPulseRef.current) { clearInterval(criticalPulseRef.current); criticalPulseRef.current = null }
    const map = mapInst.current
    if (!map || criticalPkIds.size === 0) return
    let opHigh = true
    const tick = () => {
      try {
        if (!map.getLayer('prog-critico-line')) return
        map.setPaintProperty('prog-critico-line', 'line-opacity', opHigh ? 0.9 : 0.2)
        opHigh = !opHigh
      } catch { /* ignore */ }
    }
    criticalPulseRef.current = setInterval(tick, 700)
    return () => { if (criticalPulseRef.current) { clearInterval(criticalPulseRef.current); criticalPulseRef.current = null } }
  }, [criticalPkIds])
  /** 'plano' = callejero claro/oscuro; 'topo' = outdoors; 'satellite' = satélite + relieve 3D. */
  const [mapBaseMode, setMapBaseMode] = useState('plano')
  mapBaseModeRef.current = mapBaseMode

  const hdrs = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}

  const showToast = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 5000)
  }, [])

  const refreshMapaYVersiones = useCallback(
    async (ensureVersionRow = null) => {
      if (!cid || !token) return
      const [m, v] = await Promise.all([
        fetch(`${API}/prog-obra/${cid}/mapa`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch(`${API}/prog-obra/${cid}/versiones`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
          r.ok ? r.json() : null,
        ),
      ])
      setMapaResp(m && typeof m === 'object' ? m : { pk: [], meta: {} })
      let arr = Array.isArray(v) ? v : []
      if (ensureVersionRow?.id != null) {
        const id = String(ensureVersionRow.id)
        if (!arr.some((x) => String(x.id) === id)) {
          arr = [ensureVersionRow, ...arr]
        }
      }
      arr = [...arr].sort((a, b) => (Number(b.numero_version) || 0) - (Number(a.numero_version) || 0))
      setVersiones(arr)
      return m
    },
    [cid, token, API],
  )

  const scheduleMapRefresh = useCallback(() => {
    if (mapRefreshDebounceRef.current) clearTimeout(mapRefreshDebounceRef.current)
    mapRefreshDebounceRef.current = setTimeout(() => {
      refreshMapaYVersiones()
    }, 2000)
  }, [refreshMapaYVersiones])

  useEffect(() => {
    if (!cid || !token) {
      setPlano({ type: 'FeatureCollection', features: [] })
      setMapaResp(null)
      setVersiones([])
      return
    }
    let cancel = false
    setPlano(undefined)
    setErr('')
    Promise.all([
      getContratoPlanoGeojson(API, cid, token).then((d) =>
        d && typeof d === 'object' ? { plano_geojson: d.plano_geojson } : null,
      ),
      fetch(`${API}/prog-obra/${cid}/mapa`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`${API}/prog-obra/${cid}/versiones`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
        r.ok ? r.json() : [],
      ),
    ])
      .then(([c, m, v]) => {
        if (cancel) return
        const raw = c?.plano_geojson ?? null
        setPlano(normalizePlanoGeojson(raw))
        setMapaResp(m && typeof m === 'object' ? m : { pk: [], meta: {} })
        setVersiones(Array.isArray(v) ? v : [])
      })
      .catch((e) => {
        if (!cancel) setErr(e?.message || 'Error de red')
      })
    return () => {
      cancel = true
    }
  }, [cid, token, API])

  const meta = mapaResp?.meta || {}
  const borradorMeta = meta.borrador

  useEffect(() => {
    if (borradorMeta?.id) setWorkingVersionId((prev) => prev || String(borradorMeta.id))
  }, [borradorMeta?.id])

  const tieneSellada = useMemo(
    () => versiones.some((v) => (v.estado || '') === 'sellada'),
    [versiones],
  )
  const sinVersiones = versiones.length === 0
  const baselineEnCurso = useMemo(
    () =>
      versiones.some(
        (v) =>
          (v.tipo || '') === 'baseline' && !['archivada', 'rechazada'].includes(String(v.estado || '')),
      ),
    [versiones],
  )
  const puedeCrearNuevaVersion = puedeCrear && (sinVersiones || tieneSellada)

  const versionIdForWork = useMemo(() => {
    if (workingVersionId) return workingVersionId
    if (borradorMeta?.id) return String(borradorMeta.id)
    const vb = versiones.find((v) => (v.estado || '') === 'borrador')
    return vb?.id != null ? String(vb.id) : null
  }, [workingVersionId, borradorMeta?.id, versiones])

  const workingVersion = useMemo(
    () => versiones.find((v) => String(v.id) === String(versionIdForWork)) || null,
    [versiones, versionIdForWork],
  )

  const pkForData = progModalOpen && activeModalPk ? activeModalPk : selPk

  const pkMeta = useCallback(() => {
    const rows = mapaResp?.pk
    if (!Array.isArray(rows)) return {}
    const m = {}
    for (const r of rows) {
      const id = String(r.pk_id || '').trim()
      if (id) m[id] = r
    }
    return m
  }, [mapaResp])

  const pkRowsProgramables = useMemo(
    () => (mapaResp?.pk || []).filter((r) => (r.estado_programacion || '') !== 'sin_cantidad'),
    [mapaResp],
  )

  const pkIdsProgramables = useMemo(
    () => pkRowsProgramables.map((r) => String(r.pk_id || '').trim()).filter(Boolean),
    [pkRowsProgramables],
  )

  const pkTieneCantidad = useCallback(
    (pkid) => {
      const id = String(pkid || '').trim()
      if (!id) return false
      const row = pkMeta()[id]
      return row ? (row.estado_programacion || '') !== 'sin_cantidad' : false
    },
    [pkMeta],
  )

  useEffect(() => {
    if (!mapaResp?.pk) return
    setModalPkTabs((tabs) => tabs.filter((pk) => pkTieneCantidad(pk)))
  }, [mapaResp, pkTieneCantidad])

  const openProgramacionModal = useCallback(
    (pkid, options = {}) => {
      if (!pkid) return
      if (!pkTieneCantidad(pkid)) {
        showToast?.('Este PK no tiene cantidades en presupuesto y no se puede programar.', 'info')
        return
      }
      if (!workingVersionId) {
        const vb = versiones.find((v) => (v.estado || '') === 'borrador')
        if (vb?.id) setWorkingVersionId(String(vb.id))
        else if (borradorMeta?.id) setWorkingVersionId(String(borradorMeta.id))
      }
      setSelPk(pkid)
      setModalPkTabs((prev) => (prev.includes(pkid) ? prev : [...prev, pkid]))
      setActiveModalPk(pkid)
      setModalOpenCompareTab(!!options.compare)
      setProgModalOpen(true)
    },
    [workingVersionId, versiones, borradorMeta?.id, pkTieneCantidad, showToast],
  )

  const desviacionContrato = mapaResp?.meta?.desviacion_contrato || null

  const handleVerDetalleDesviacion = useCallback(() => {
    const pk = selPk || String(pkRowsProgramables[0]?.pk_id || '').trim()
    if (!pk) {
      showToast('Seleccione un PK en el mapa para ver el detalle.', 'info')
      return
    }
    openProgramacionModal(pk, { compare: true })
  }, [selPk, pkRowsProgramables, openProgramacionModal, showToast])

  const onMapPkClick = useCallback(
    (pkid) => {
      if (!pkid) return
      if (!pkTieneCantidad(pkid)) {
        showToast?.('Este PK no tiene cantidades en presupuesto.', 'info')
        setSelPk(pkid)
        return
      }
      setSelPk(pkid)
      if (progModalOpen) {
        setModalPkTabs((prev) => (prev.includes(pkid) ? prev : [...prev, pkid]))
        setActiveModalPk(pkid)
      } else {
        openProgramacionModal(pkid)
      }
    },
    [progModalOpen, openProgramacionModal, pkTieneCantidad, showToast],
  )
  const onMapPkClickRef = useRef(onMapPkClick)
  onMapPkClickRef.current = onMapPkClick

  useEffect(() => {
    if (!MAPBOX_TOKEN || plano === undefined) return
    const mref = mapRef.current
    if (!mref) return

    if (mapInst.current) {
      try {
        mapInst.current.remove()
      } catch {
        /* ignore */
      }
      mapInst.current = null
    }

    mapboxgl.accessToken = MAPBOX_TOKEN
    const isDarkTheme = t.bg === '#0A1628'
    const styleUrl = basemapStyleUrl(mapBaseModeRef.current, isDarkTheme)
    const map = new mapboxgl.Map({
      container: mref,
      style: styleUrl,
      center: [0, 0],
      zoom: 1,
      bearing: MAP_INITIAL_BEARING,
      pitch: 0,
    })
    map.__progLastStyleUrl = styleUrl
    const unreg = installMapboxAttributionLinksOpenNewTab(map)
    mapInst.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(
      createBasemapStyleControl({
        getMode: () => mapBaseModeRef.current,
        t,
        onSelect: (v) => {
          if (v === 'plano' || v === 'topo' || v === 'satellite') setMapBaseMode(v)
        },
      }),
      'top-right',
    )

    map.on('load', () => {
      const enriched = buildEnrichedPlano(plano, pkMeta())
      enrichedGeojsonRef.current = enriched
      applyProgMapAfterStyle(map, mapBaseModeRef.current, enriched, (pk) => onMapPkClickRef.current(pk))
      const lab = map.getContainer().querySelector('[data-prog-basemap-btn]')
      if (lab) lab.textContent = basemapLabel(mapBaseModeRef.current)
      const b = boundsLngLatFromFeatureCollection(enriched)
      if (b) {
        const runFit = () => {
          try {
            map.resize()
            map.fitBounds(b, {
              padding: { top: 56, bottom: 132, left: 200, right: 56 },
              maxZoom: 22,
              duration: 0,
              bearing: MAP_INITIAL_BEARING,
              pitch: 0,
              essential: true,
            })
          } catch {
            /* ignore fit errors (geometría vacía / WebGL) */
          }
        }
        requestAnimationFrame(runFit)
      }
    })

    return () => {
      unreg()
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      if (mapInst.current === map) mapInst.current = null
    }
  }, [cid, plano, t.bg])

  useEffect(() => {
    const map = mapInst.current
    if (!map || !MAPBOX_TOKEN || !plano?.features?.length || !mapaResp) return
    const enriched = buildEnrichedPlano(plano, pkMeta(), criticalPkIds)
    enrichedGeojsonRef.current = enriched
    const apply = () =>
      applyProgMapAfterStyle(map, mapBaseModeRef.current, enriched, (pk) => onMapPkClickRef.current(pk))
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [mapaResp, pkMeta, plano, criticalPkIds])

  useEffect(() => {
    const map = mapInst.current
    if (!map || !MAPBOX_TOKEN) return
    if (!map.isStyleLoaded()) return
    const isDark = t.bg === '#0A1628'
    const url = basemapStyleUrl(mapBaseMode, isDark)
    if (map.__progLastStyleUrl === url) return
    map.__progLastStyleUrl = url
    map.setStyle(url)
    const modeAtSwitch = mapBaseMode
    map.once('style.load', () => {
      applyProgMapAfterStyle(map, modeAtSwitch, enrichedGeojsonRef.current, (pk) => onMapPkClickRef.current(pk))
      const lab = map.getContainer().querySelector('[data-prog-basemap-btn]')
      if (lab) lab.textContent = basemapLabel(modeAtSwitch)
    })
  }, [mapBaseMode, t.bg])

  const pptoPorPk = useMemo(() => {
    if (!pkForData) return []
    return presupuestoRows.filter(
      (r) =>
        String(r.pk_id || '').trim() === pkForData &&
        String(r.tipo_ejecucion || '').trim() === PRESUPUESTO_TIPO_POLIGONO &&
        r.dado_de_baja !== true,
    )
  }, [presupuestoRows, pkForData])

  const capitulosOrdenados = useMemo(() => {
    const fromEstructura = (progEstructura.capitulos || []).map((c) => c.capitulo).filter(Boolean)
    if (fromEstructura.length) {
      return [...fromEstructura].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    }
    const caps = new Map()
    for (const r of pptoPorPk) {
      const c = String(r.capitulo || '').trim()
      if (!c) continue
      if (!caps.has(c)) caps.set(c, [])
      caps.get(c).push(r)
    }
    return [...caps.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [progEstructura.capitulos, pptoPorPk])

  const estructuraPorCapitulo = useMemo(() => {
    const m = {}
    for (const c of progEstructura.capitulos || []) {
      const cap = String(c.capitulo || '').trim()
      if (cap) m[cap] = c
    }
    return m
  }, [progEstructura.capitulos])

  const agrupadorActItem = useCallback((ag) => {
    const wbs = String(ag?.codigo_wbs || '').trim()
    if (wbs) return wbs
    return `AG${ag?.agrupador_id ?? ''}`
  }, [])

  const agrupadorRowKey = useCallback(
    (cap, ag) => `${cap}\u0000ag:${agrupadorActItem(ag)}`,
    [agrupadorActItem],
  )

  const itemRowKey = (cap, item) => `${cap}\u0000${item}`

  const itemsPorCapitulo = useCallback(
    (cap) => {
      const m = new Map()
      for (const r of pptoPorPk) {
        if (String(r.capitulo || '').trim() !== cap) continue
        const it = String(r.item || '').trim()
        if (!it) continue
        const key = `${cap}\u0000${it}`
        const cd = Number(r.costo_directo)
        const cant = Number(r.cant_total) || 0
        const vlr = Number(r.vlr_unitario) || 0
        const lineCd = Number.isFinite(cd) && cd > 0 ? cd : cant * vlr
        if (!m.has(key)) {
          m.set(key, {
            capitulo: cap,
            item: it,
            descripcion: String(r.descripcion || r.registro || '').trim(),
            cant_total: cant,
            und: String(r.und || '').slice(0, 20),
            vlr_unitario: vlr,
            costo_directo: lineCd,
          })
        } else {
          const cur = m.get(key)
          cur.cant_total += cant
          cur.costo_directo += lineCd
          if (!cur.descripcion && (r.descripcion || r.registro)) {
            cur.descripcion = String(r.descripcion || r.registro || '').trim()
          }
        }
      }
      return [...m.values()].sort((a, b) => a.item.localeCompare(b.item, undefined, { numeric: true }))
    },
    [pptoPorPk],
  )

  const actividadKey = (cap, item, seg = 1) => `${cap}\u0000${item}\u0000${seg}`

  const actMap = useMemo(() => {
    const m = {}
    for (const a of actData.actividades || []) {
      const k = actividadKey(String(a.capitulo || ''), String(a.item || ''), Number(a.segmento) || 1)
      m[k] = a
    }
    return m
  }, [actData.actividades])

  const capProgMap = useMemo(() => {
    const m = {}
    for (const c of actData.capitulos || []) {
      const cap = String(c.capitulo || '').trim()
      if (cap) m[cap] = c
    }
    return m
  }, [actData.capitulos])

  useEffect(() => {
    if (!cid || !token || !pkForData) {
      setPresupuestoRows([])
      return
    }
    let cancel = false
    setLoadPpto(true)
    const q = new URLSearchParams()
    q.set('pk_criterio', pkForData)
    q.set('limit', '3000')
    fetch(`${API}/presupuesto/${cid}?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancel) setPresupuestoRows(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancel) setPresupuestoRows([])
      })
      .finally(() => {
        if (!cancel) setLoadPpto(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, pkForData, API])

  useEffect(() => {
    if (!cid || !token || !pkForData) {
      setProgEstructura({ capitulos: [] })
      return
    }
    let cancel = false
    setLoadEstructura(true)
    const q = new URLSearchParams({ pk_id: pkForData })
    fetch(`${API}/prog-obra/${cid}/programacion-estructura?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { capitulos: [] }))
      .then((d) => {
        if (!cancel) setProgEstructura(d && typeof d === 'object' ? d : { capitulos: [] })
      })
      .catch(() => {
        if (!cancel) setProgEstructura({ capitulos: [] })
      })
      .finally(() => {
        if (!cancel) setLoadEstructura(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, pkForData, API])

  useEffect(() => {
    if (!cid || !token || !pkForData || !versionIdForWork) {
      setActData({ capitulos: [], actividades: [] })
      return
    }
    let cancel = false
    setLoadAct(true)
    const q = new URLSearchParams({ version_id: String(versionIdForWork), pk_id: pkForData })
    fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }))
      .then((d) => {
        if (!cancel) setActData(d && typeof d === 'object' ? d : { capitulos: [], actividades: [] })
      })
      .catch(() => {
        if (!cancel) setActData({ capitulos: [], actividades: [] })
      })
      .finally(() => {
        if (!cancel) setLoadAct(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, pkForData, versionIdForWork, API])

  useEffect(() => {
    if (!cid || !token || !workingVersionId) {
      setValidaciones([])
      return
    }
    const est = workingVersion?.estado
    if (est !== 'en_validacion' && est !== 'sellada') {
      setValidaciones([])
      return
    }
    let cancel = false
    setLoadVal(true)
    fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/validaciones`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancel) setValidaciones(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancel) setValidaciones([])
      })
      .finally(() => {
        if (!cancel) setLoadVal(false)
      })
    return () => {
      cancel = true
    }
  }, [cid, token, workingVersionId, workingVersion?.estado, API])

  const rowSel = useMemo(() => {
    if (!selPk) return null
    const key = String(selPk).trim()
    const m = pkMeta()
    if (m[key]) return m[key]
    const lower = key.toLowerCase()
    return Object.values(m).find((r) => String(r.pk_id || '').trim().toLowerCase() === lower) || null
  }, [selPk, mapaResp, pkMeta])
  const esBorradorEditable = workingVersion && (workingVersion.estado || '') === 'borrador'

  const borradorProgResumen = useMemo(() => {
    if (!borradorMeta || !esBorradorEditable) return null
    const rows = mapaResp?.pk || []
    let sum = 0
    let n = 0
    for (const r of rows) {
      if ((r.estado_programacion || '') === 'sin_cantidad') continue
      const p = Number(r.porcentaje_programado)
      if (Number.isFinite(p)) {
        sum += p
        n += 1
      }
    }
    return { pct: n > 0 ? sum / n : 0 }
  }, [mapaResp, borradorMeta, esBorradorEditable])

  const selectPkAndZoom = useCallback(
    (pkid) => {
      if (!pkid) return
      setSelPk(pkid)
      const map = mapInst.current
      const fc = plano
      if (!map || !fc?.features?.length) return
      const feat = fc.features.find((f) => featurePkId(f) === pkid)
      if (!feat?.geometry) return
      const b = boundsLngLatFromFeatureCollection({ type: 'FeatureCollection', features: [feat] })
      if (!b) return
      try {
        map.fitBounds(b, { padding: 80, maxZoom: 17, duration: 900 })
      } catch {
        /* ignore */
      }
    },
    [plano],
  )
  const esEnValidacion = workingVersion && (workingVersion.estado || '') === 'en_validacion'
  const esSellada = workingVersion && (workingVersion.estado || '') === 'sellada'

  const badgeEstado = (estado) => {
    const e = (estado || '').toLowerCase()
    const colors = {
      borrador: { bg: '#e0e7ff', fg: '#3730a3' },
      en_validacion: { bg: '#fef3c7', fg: '#92400e' },
      sellada: { bg: '#d1fae5', fg: '#065f46' },
      archivada: { bg: '#f3f4f6', fg: '#4b5563' },
      rechazada: { bg: '#fee2e2', fg: '#991b1b' },
    }
    const c = colors[e] || { bg: t.bg, fg: t.textMuted }
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          background: c.bg,
          color: c.fg,
        }}
      >
        {estado || '—'}
      </span>
    )
  }

  const handleCrearVersion = async () => {
    if (!puedeCrear || !cid) return
    const tipo = sinVersiones || !baselineEnCurso ? 'baseline' : 'reprogramacion'
    if (tipo === 'reprogramacion' && !crearMotivo.trim()) {
      showToast('Indique el motivo de la reprogramación.', 'err')
      return
    }
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          tipo,
          motivo_reprogramacion: tipo === 'reprogramacion' ? crearMotivo.trim() : null,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const row = await res.json()
      setShowCrearVersion(false)
      setCrearMotivo('')
      const vid = row?.id != null ? String(row.id) : null
      await refreshMapaYVersiones(row)
      if (vid) setWorkingVersionId(vid)
      showToast(`Versión nº${row.numero_version} creada (${row.estado}).`)
    } catch (e) {
      showToast(e?.message || 'No se pudo crear la versión', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleClickNuevaVersion = async () => {
    if (!puedeCrear || !cid) {
      showToast('No tiene permiso para crear versiones de programación.', 'err')
      return
    }
    if (!token) {
      showToast('Sesión no válida. Vuelva a iniciar sesión.', 'err')
      return
    }
    if (sinVersiones) {
      await handleCrearVersion()
      return
    }
    if (!tieneSellada) {
      showToast(
        'Ya existe una versión en curso (borrador o en validación). Debe sellarla antes de crear una reprogramación.',
        'err',
      )
      return
    }
    setCrearMotivo('')
    setShowCrearVersion(true)
  }

  useEffect(() => {
    if (!cid || !token) {
      setPresupuestoContratoAll([])
      return
    }
    let cancel = false
    const q = new URLSearchParams({ limit: '20000' })
    fetch(`${API}/presupuesto/${cid}?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancel) setPresupuestoContratoAll(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancel) setPresupuestoContratoAll([])
      })
    return () => {
      cancel = true
    }
  }, [cid, token, API])

  const fetchActividadesByPk = useCallback(
    async (pkid) => {
      const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: pkid })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : { actividades: [] }))
      return Array.isArray(d?.actividades) ? d.actividades : []
    },
    [cid, token, API, workingVersionId],
  )

  const reloadActividadesPk = useCallback(
    async (pkidOverride) => {
      const pkid = (pkidOverride || pkForData || '').trim()
      if (!cid || !token || !pkid || !versionIdForWork) return
      const q = new URLSearchParams({ version_id: String(versionIdForWork), pk_id: pkid })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }))
      setActData(d && typeof d === 'object' ? d : { capitulos: [], actividades: [] })
    },
    [cid, token, pkForData, versionIdForWork, API],
  )

  const handleGuardarBatch = useCallback(
    async (items, pkId) => {
      const vid = versionIdForWork
      if (!puedeEditar || !cid || !vid || !pkId) return { ok: false, saved: 0, errors: items?.length || 0 }
      const actividades = (items || []).map((row) => {
        const def = row.itemDef || {}
        const durInt = row.duracion != null ? parseInt(String(row.duracion), 10) : null
        return {
          capitulo: row.capitulo || def.capitulo,
          item: row.item || def.item,
          segmento: 1,
          fecha_inicio: row.fecha_inicio ?? null,
          duracion_dias_habiles: Number.isFinite(durInt) ? durInt : null,
          cantidad_programada: Number(def.cant_total),
          unidad: def.und || '?',
          costo_unitario: Number(def.vlr_unitario) || 0,
          tipo_distribucion: 'lineal',
          override_manual: !!row.override_manual,
          heredado_de_capitulo: !!row.heredado_de_capitulo,
          ...(def.es_agrupador && def.agrupador_id
            ? { agrupador_id: def.agrupador_id, codigo_wbs: def.codigo_wbs || def.item }
            : {}),
        }
      })
      try {
        const res = await fetch(`${API}/prog-obra/${cid}/versiones/${vid}/actividades-batch`, {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({ pk_id: pkId, actividades }),
        })
        if (!res.ok) {
          const errText = await parseApiError(res)
          console.error('[ProgObra] actividades-batch HTTP', res.status, errText)
          throw new Error(errText)
        }
        const batchData = await res.json()
        if (batchData?.ms > 5000) {
          console.warn('[ProgObra] batch lento:', batchData.ms, 'ms rpc=', batchData.rpc)
          showToast(`Guardado en ${Math.round(batchData.ms)} ms${batchData.rpc === false ? ' (modo upsert, no RPC)' : ''}`, 'info')
        }

        // Actualizar actData localmente con la respuesta de la RPC — cero queries adicionales.
        // La RPC devuelve actividades con id + fecha_fin_calculada; los items enviados
        // tienen fecha_inicio + duracion. Los combinamos en actData sin fetch adicional.
        const rpcActMap = {}
        for (const a of batchData?.actividades || []) {
          rpcActMap[`${a.capitulo}\u0000${a.item}\u0000${String(a.segmento ?? 1)}`] = a
        }
        setActData((prev) => {
          const prevActs = prev?.actividades || []
          const sentKeys = new Set(
            actividades.map((a) => `${a.capitulo}\u0000${a.item}\u00001`),
          )
          // Mantener actividades no tocadas en este batch; reemplazar las enviadas
          const untouched = prevActs.filter(
            (a) => !sentKeys.has(`${a.capitulo}\u0000${a.item}\u0000${String(a.segmento ?? 1)}`),
          )
          const updated = actividades.map((a) => {
            const rpc = rpcActMap[`${a.capitulo}\u0000${a.item}\u00001`] || {}
            return {
              // Preservar campos existentes de la actividad anterior si los hay
              ...(prevActs.find(
                (p) => p.capitulo === a.capitulo && p.item === a.item && (p.segmento ?? 1) === 1,
              ) || {}),
              capitulo: a.capitulo,
              item: a.item,
              segmento: 1,
              fecha_inicio: a.fecha_inicio ?? null,
              duracion_dias_habiles: a.duracion_dias_habiles ?? null,
              fecha_fin_calculada: rpc.fecha_fin_calculada ?? null,
              override_manual: a.override_manual,
              heredado_de_capitulo: a.heredado_de_capitulo,
              ...(rpc.id ? { id: rpc.id } : {}),
            }
          })
          return { capitulos: prev?.capitulos || [], actividades: [...untouched, ...updated] }
        })

        await refreshMapaYVersiones()

        return { ok: true, saved: actividades.length, errors: 0, pkId: String(pkId || '').trim() }
      } catch (e) {
        console.error('[ProgObra] handleGuardarBatch:', e)
        showToast(e?.message || 'Error al guardar actividades', 'err')
        return { ok: false, saved: 0, errors: actividades.length }
      }
    },
    [puedeEditar, cid, versionIdForWork, hdrs, API, showToast, reloadActividadesPk, refreshMapaYVersiones],
  )

  const handleProgSaveSuccess = useCallback(
    async (pkId) => {
      const m = await refreshMapaYVersiones()
      const map = mapInst.current
      if (map && map.getSource('prog-pol') && m) {
        const metaMap = {}
        for (const r of m?.pk || []) {
          const id = String(r.pk_id || '').trim()
          if (id) metaMap[id] = r
        }
        const enriched = buildEnrichedPlano(plano, metaMap, criticalPkIds)
        map.getSource('prog-pol').setData(enriched)
      }
    },
    [refreshMapaYVersiones, plano, criticalPkIds],
  )

  const buildValidacionResumen = useCallback(async () => {
    const pptoByPk = aggregatePptoItemKeysByPk(presupuestoContratoAll)
    const pkList = [...pptoByPk.keys()]
    const actividadesByPk = new Map()
    await Promise.all(
      pkList.map(async (pk) => {
        const acts = await fetchActividadesByPk(pk)
        actividadesByPk.set(pk, acts)
      }),
    )
    return buildProgValidationPreCheck(pptoByPk, actividadesByPk)
  }, [presupuestoContratoAll, fetchActividadesByPk])

  const handleIniciarEnviarValidacion = async () => {
    if (!puedeEditar || !cid || !workingVersionId) return
    setPanelBusy(true)
    try {
      const resumen = await buildValidacionResumen()
      setValidacionPreCheck(resumen)
    } catch (e) {
      showToast(e?.message || 'No se pudo preparar el resumen de validación', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  /** Tras guardar ítems en el modal: sincronizar prog_pk_estado y refrescar mapa. */
  const handleGuardarCambiosModal = useCallback(async () => {
    if (!cid || !versionIdForWork || !token) {
      throw new Error('Seleccione versión de trabajo e inicie sesión.')
    }
    const res = await fetch(`${API}/prog-obra/${cid}/versiones/${versionIdForWork}/sincronizar-estados-pk`, {
      method: 'POST',
      headers: hdrs,
    })
    if (!res.ok) throw new Error(await parseApiError(res))
    await reloadActividadesPk()
    await refreshMapaYVersiones()
  }, [cid, versionIdForWork, token, hdrs, API, refreshMapaYVersiones, reloadActividadesPk])

  const handleConfirmEnviarValidacion = async () => {
    if (!puedeEditar || !cid || !workingVersionId) return
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/enviar-validacion`, {
        method: 'POST',
        headers: hdrs,
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      setValidacionPreCheck(null)
      await refreshMapaYVersiones()
      showToast('Versión enviada a validación.')
    } catch (e) {
      showToast(e?.message || 'Error al enviar', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleGuardarCapitulo = async (capitulo, fechaIso, durInt) => {
    if (!puedeEditar || !cid || !workingVersionId || !pkForData) return
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/capitulo`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          version_id: workingVersionId,
          pk_id: pkForData,
          capitulo,
          fecha_inicio_sugerida: fechaIso || null,
          duracion_dias_habiles: durInt != null && durInt !== '' ? parseInt(String(durInt), 10) : null,
        }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: pkForData })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } }).then(
        (r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }),
      )
      setActData(d)
      showToast(`Capítulo «${capitulo}» guardado.`)
    } catch (e) {
      showToast(e?.message || 'Error al guardar capítulo', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleHerencia = async (capitulo) => {
    if (!puedeEditar || !cid || !workingVersionId || !pkForData) return
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/herencia`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ version_id: workingVersionId, pk_id: pkForData, capitulo }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const q = new URLSearchParams({ version_id: String(workingVersionId), pk_id: pkForData })
      const d = await fetch(`${API}/prog-obra/${cid}/actividades?${q}`, { headers: { Authorization: `Bearer ${token}` } }).then(
        (r) => (r.ok ? r.json() : { capitulos: [], actividades: [] }),
      )
      setActData(d)
      await refreshMapaYVersiones()
      showToast('Herencia aplicada a ítems sin fecha.')
    } catch (e) {
      showToast(e?.message || 'No se pudo aplicar herencia', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const handleGuardarItem = async (itemDef, form, rowKey, options = {}) => {
    const { deferReload = false } = options
    if (!puedeEditar || !cid || !versionIdForWork || !pkForData) return false
    const cant = Number(itemDef.cant_total)
    if (!(cant > 0)) {
      showToast('Este ítem no tiene cantidad en presupuesto; no se programa.', 'err')
      return false
    }
    const rk = rowKey || itemRowKey(itemDef.capitulo, itemDef.item)
    setRowSaveStatus((s) => ({ ...s, [rk]: 'saving' }))
    try {
      const body = {
        version_id: versionIdForWork,
        pk_id: pkForData,
        capitulo: itemDef.capitulo,
        item: itemDef.item,
        segmento: 1,
        fecha_inicio: form.fecha_inicio || null,
        duracion_dias_habiles: form.duracion != null && form.duracion !== '' ? parseInt(String(form.duracion), 10) : null,
        cantidad_programada: cant,
        unidad: itemDef.und || '?',
        costo_unitario: Number(itemDef.vlr_unitario) || 0,
        tipo_distribucion: 'lineal',
        override_manual: !!form.override_manual,
        heredado_de_capitulo: !!form.heredado_de_capitulo,
        ...(itemDef.es_agrupador && itemDef.agrupador_id
          ? { agrupador_id: itemDef.agrupador_id, codigo_wbs: itemDef.codigo_wbs || itemDef.item }
          : {}),
      }
      const res = await fetch(`${API}/prog-obra/${cid}/actividad`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      if (!deferReload) {
        await reloadActividadesPk()
        scheduleMapRefresh()
      }
      setRowSaveStatus((s) => ({ ...s, [rk]: 'saved' }))
      setTimeout(() => setRowSaveStatus((s) => ({ ...s, [rk]: 'idle' })), 2000)
      return true
    } catch (e) {
      setRowSaveStatus((s) => ({ ...s, [rk]: 'error' }))
      showToast(e?.message || 'Error al guardar actividad', 'err')
      return false
    }
  }

  const handleValidarDecision = async (nivel, aprobar, observacion) => {
    if (!puedeValidar || !cid || !workingVersionId) return
    if (!aprobar && !(observacion || '').trim()) {
      showToast('La observación es obligatoria al rechazar.', 'err')
      return
    }
    setPanelBusy(true)
    try {
      const res = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/validar`, {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ nivel, aprobar, observacion: observacion || null }),
      })
      if (!res.ok) throw new Error(await parseApiError(res))
      const out = await res.json()
      const fueRechazo = out?.resultado === 'rechazado'
      const fueSellada = out?.resultado === 'sellada'
      if (fueRechazo) {
        showToast(
          uid
            ? 'Rechazo registrado. El creador de la versión recibe una notificación en la bandeja del sistema.'
            : 'Rechazo registrado.',
          'ok',
        )
      } else {
        showToast(aprobar ? 'Validación registrada.' : 'Procesado.')
      }
      setValidarModal(null)
      await refreshMapaYVersiones()
      if (fueSellada) {
        showToast('Versión sellada y publicada como vigente. Mapa actualizado.')
      }
      const valRows = await fetch(`${API}/prog-obra/${cid}/versiones/${workingVersionId}/validaciones`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : []))
      setValidaciones(Array.isArray(valRows) ? valRows : [])
    } catch (e) {
      showToast(e?.message || 'Error en validación', 'err')
    } finally {
      setPanelBusy(false)
    }
  }

  const btnStyle = (primary = false, disabled = false) => ({
    padding: '6px 12px',
    fontSize: 'var(--cc-sm)',
    fontWeight: 600,
    borderRadius: 8,
    border: `1px solid ${primary ? t.primary : t.border}`,
    background: primary ? t.primary : t.bgCard,
    color: primary ? '#fff' : t.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  })

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    fontSize: 'var(--cc-sm)',
  }

  if (!cid) {
    return (
      <div style={{ color: t.textMuted, fontSize: 'var(--cc-body)', padding: '48px 20px', textAlign: 'center' }}>
        Selecciona un contrato para usar programación de obra.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 140px)', minHeight: 480, gap: 0, position: 'relative', fontSize: 'var(--cc-sm)' }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            maxWidth: 360,
            padding: '12px 16px',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            background: toast.kind === 'err' ? '#fee2e2' : '#d1fae5',
            color: toast.kind === 'err' ? '#991b1b' : '#065f46',
            fontSize: 'var(--cc-sm)',
            fontWeight: 600,
          }}
        >
          {toast.msg}
        </div>
      )}
      {validarModal && (
        <ProgOverlay onBackdropClick={() => !panelBusy && setValidarModal(null)}>
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 20,
              color: t.text,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 12, color: t.primary }}>
              Nivel {validarModal.nivel} — {validarModal.aprobar ? 'Aprobar' : 'Rechazar'}
            </div>
            {!validarModal.aprobar && (
              <>
                <label style={{ display: 'block', fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Observación *</label>
                <textarea
                  value={validarModal.obs || ''}
                  onChange={(e) => setValidarModal((m) => ({ ...m, obs: e.target.value }))}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
                />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnStyle(false, panelBusy)} disabled={panelBusy} onClick={() => setValidarModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={btnStyle(true, panelBusy)}
                disabled={panelBusy}
                onClick={() =>
                  handleValidarDecision(validarModal.nivel, validarModal.aprobar, validarModal.aprobar ? null : validarModal.obs)
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </ProgOverlay>
      )}
      {showCrearVersion && (
        <ProgOverlay onBackdropClick={() => !panelBusy && setShowCrearVersion(false)}>
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 20,
              color: t.text,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: 8, color: t.primary }}>Nueva reprogramación</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, marginBottom: 12 }}>
              Nueva versión tras la programación sellada. Indique el motivo (obligatorio).
            </div>
            <label style={{ display: 'block', fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Motivo *</label>
            <textarea
              value={crearMotivo}
              onChange={(e) => setCrearMotivo(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnStyle(false, panelBusy)} disabled={panelBusy} onClick={() => setShowCrearVersion(false)}>
                Cancelar
              </button>
              <button type="button" style={btnStyle(true, panelBusy)} disabled={panelBusy} onClick={handleCrearVersion}>
                Crear reprogramación
              </button>
            </div>
          </div>
        </ProgOverlay>
      )}

      <ProgObraProgramacionModal
        open={progModalOpen && modalPkTabs.length > 0}
        onClose={() => {
          setProgModalOpen(false)
          setModalPkTabs([])
          setActiveModalPk(null)
          setModalOpenCompareTab(false)
        }}
        t={t}
        workingVersion={workingVersion}
        pkTabs={modalPkTabs}
        activePk={activeModalPk || modalPkTabs[0]}
        onSelectPk={setActiveModalPk}
        onRemovePk={(pk) => {
          setModalPkTabs((tabs) => {
            const next = tabs.filter((x) => x !== pk)
            if (activeModalPk === pk) setActiveModalPk(next[0] || null)
            if (next.length === 0) setProgModalOpen(false)
            return next
          })
        }}
        capitulosOrdenados={capitulosOrdenados}
        estructuraPorCapitulo={estructuraPorCapitulo}
        agrupadorActItem={agrupadorActItem}
        agrupadorRowKey={agrupadorRowKey}
        itemsPorCapitulo={itemsPorCapitulo}
        capProgMap={capProgMap}
        actMap={actMap}
        actividadKey={actividadKey}
        itemRowKey={itemRowKey}
        editable={!!(versionIdForWork && esBorradorEditable && puedeEditar)}
        rowSaveStatus={rowSaveStatus}
        onHerencia={handleHerencia}
        onGuardarCap={handleGuardarCapitulo}
        onGuardarItem={handleGuardarItem}
        onGuardarBatch={handleGuardarBatch}
        loadAct={loadAct}
        loadPpto={loadPpto || loadEstructura}
        cid={cid}
        token={token}
        API={API}
        panelBusy={panelBusy}
        onGuardarCambios={handleGuardarCambiosModal}
        onSaveSuccess={handleProgSaveSuccess}
        onReloadActividades={reloadActividadesPk}
        showToast={showToast}
        allPkIds={pkIdsProgramables}
        onCpmUpdated={handleCpmUpdated}
        openCompareTab={modalOpenCompareTab}
        compareBaselineId={desviacionContrato?.baseline_id || null}
        compareTargetId={desviacionContrato?.target_id || versionIdForWork || null}
      />

      {validacionPreCheck && (
        <ProgOverlay onBackdropClick={() => !panelBusy && setValidacionPreCheck(null)}>
          <div
            style={{
              background: t.bgCard,
              borderRadius: 12,
              border: `1px solid ${t.border}`,
              padding: 20,
              maxWidth: 520,
              width: '100%',
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 'var(--cc-md)', color: t.primary, marginBottom: 12 }}>
              Enviar programación a validación
            </div>
            <p style={{ fontSize: 'var(--cc-sm)', color: t.textMuted, margin: '0 0 12px', lineHeight: 1.45 }}>
              Revise el resumen antes de confirmar. No podrá editar el cronograma hasta un rechazo.
            </p>

            {validacionPreCheck.pksSinProgramar.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: '#b45309', marginBottom: 4 }}>
                  PKs sin programar ({validacionPreCheck.pksSinProgramar.length})
                </div>
                <div style={{ fontSize: 'var(--cc-caption)', color: t.text }}>
                  {validacionPreCheck.pksSinProgramar.join(', ')}
                </div>
              </div>
            )}

            {validacionPreCheck.pksItemsSinFecha.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--cc-sm)', color: '#b45309', marginBottom: 4 }}>
                  PKs con ítems sin fecha ({validacionPreCheck.pksItemsSinFecha.length})
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--cc-caption)', color: t.text }}>
                  {validacionPreCheck.pksItemsSinFecha.map((x) => (
                    <li key={x.pk}>
                      PK {x.pk}: faltan {x.missing} de {x.total} ítems
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginBottom: 12, fontSize: 'var(--cc-sm)', color: t.text }}>
              <strong>Ítems sin fecha en total:</strong> {validacionPreCheck.totalItemsSinFecha}
            </div>

            <div
              style={{
                marginBottom: 16,
                padding: 10,
                borderRadius: 8,
                background: t.bg,
                border: `1px solid ${t.border}`,
                fontSize: 'var(--cc-sm)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, color: t.text }}>Ruta crítica del contrato</div>
              <div style={{ color: t.textMuted }}>
                Inicio más temprano:{' '}
                <strong style={{ color: t.text }}>{validacionPreCheck.rutaCritica.inicio || '—'}</strong>
              </div>
              <div style={{ color: t.textMuted, marginTop: 4 }}>
                Fin más tardío:{' '}
                <strong style={{ color: t.text }}>{validacionPreCheck.rutaCritica.fin || '—'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnStyle(false, panelBusy)} disabled={panelBusy} onClick={() => setValidacionPreCheck(null)}>
                Cancelar
              </button>
              <button type="button" style={btnStyle(true, panelBusy)} disabled={panelBusy} onClick={() => void handleConfirmEnviarValidacion()}>
                Confirmar envío
              </button>
            </div>
          </div>
        </ProgOverlay>
      )}

      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {err && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 2,
              background: '#fee2e2',
              color: '#b91c1c',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 'var(--cc-sm)',
            }}
          >
            {err}
          </div>
        )}
        {borradorMeta && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 2,
              background: t.bgCard,
              border: `1px solid ${t.border}`,
              color: t.primary,
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
            }}
          >
            Borrador nº{borradorMeta.numero_version} — el mapa refleja el avance de este borrador
          </div>
        )}
        {!MAPBOX_TOKEN && <div style={{ padding: 24, color: t.textMuted }}>Falta VITE_MAPBOX_TOKEN para el mapa.</div>}
        <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            zIndex: 4,
            maxWidth: 280,
            padding: '10px 12px',
            borderRadius: 10,
            background: `${t.bgCard}ee`,
            border: `1px solid ${t.border}`,
            boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
            fontSize: 11,
            color: t.text,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, color: t.primary, marginBottom: 8, fontSize: 12 }}>Estado de programación</div>
          {MAPA_LEYENDA_ESTADOS.map((it) => (
            <div key={it.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: it.lineOnly ? 0 : 3,
                  marginTop: 2,
                  flexShrink: 0,
                  background: it.lineOnly ? 'transparent' : it.fill,
                  opacity: it.lineOnly ? 1 : Math.max(it.op, 0.15),
                  border: it.lineOnly ? `3px solid ${it.fill}` : `1px solid ${t.border}`,
                  boxSizing: 'border-box',
                }}
              />
              <span>
                <strong style={{ color: t.text }}>{it.label}</strong>
                <span style={{ color: t.textMuted, display: 'block', lineHeight: 1.35 }}>{it.desc}</span>
              </span>
            </div>
          ))}
        </div>
        {mapaResp?.tiempo_ms != null && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              zIndex: 3,
              fontSize: 11,
              color: t.textMuted,
              background: `${t.bgCard}cc`,
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            /mapa {mapaResp.tiempo_ms} ms
          </div>
        )}
      </div>

      <div
        style={{
          width: 420,
          flexShrink: 0,
          borderLeft: `1px solid ${t.border}`,
          background: t.bgCard,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflowY: 'auto',
          fontSize: 'var(--cc-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontWeight: 700, color: t.primary, fontSize: 'var(--cc-md)', lineHeight: 1.2, minWidth: 0 }}>
            Programación de obra
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {esBorradorEditable && puedeEditar && workingVersionId && (
              <ProgPanelIconBtn
                t={t}
                title="Enviar a validación"
                disabled={panelBusy}
                onClick={() => void handleIniciarEnviarValidacion()}
              >
                <Upload size={14} strokeWidth={2.25} />
              </ProgPanelIconBtn>
            )}
            {puedeCrearNuevaVersion && (
              <ProgPanelIconBtn
                t={t}
                title={sinVersiones ? 'Crear programación inicial' : 'Nueva versión'}
                disabled={panelBusy}
                onClick={() => void handleClickNuevaVersion()}
              >
                <Plus size={14} strokeWidth={2.25} />
              </ProgPanelIconBtn>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 4,
              fontSize: 11,
              color: t.textMuted,
              lineHeight: 1.35,
            }}
          >
            <span>
              Contrato <strong style={{ color: t.text }}>{cid}</strong>
            </span>
            {workingVersion && (
              <>
                <span>·</span>
                <span style={{ color: t.text }}>{workingVersion.estado || '—'}</span>
                {borradorProgResumen != null && (
                  <>
                    <span>·</span>
                    <span style={{ color: t.primary, fontWeight: 600 }}>{borradorProgResumen.pct.toFixed(0)}%</span>
                  </>
                )}
              </>
            )}
          </div>
          <select
            value={workingVersionId || ''}
            onChange={(e) => setWorkingVersionId(e.target.value || null)}
            style={{ ...inputStyle, padding: '3px 6px', fontSize: 11, width: '100%' }}
          >
            <option value="">— Seleccione versión —</option>
            {versiones.map((v) => (
              <option key={v.id} value={v.id}>
                nº{v.numero_version} · {v.tipo} · {v.estado}
              </option>
            ))}
          </select>
        </div>

        {desviacionContrato?.alerta && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 6,
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              fontSize: 11,
              color: '#92400E',
              lineHeight: 1.35,
            }}
          >
            <span>
              ⚠ Desviación vs baseline: {desviacionContrato.label_fechas || '—'}
            </span>
            <button
              type="button"
              onClick={handleVerDetalleDesviacion}
              style={{
                flexShrink: 0,
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid #D97706',
                background: '#FFFBEB',
                color: '#92400E',
                cursor: 'pointer',
              }}
            >
              Ver detalle
            </button>
          </div>
        )}

        {workingVersionId && (
          <details
            style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg }}
          >
            <summary style={{ fontWeight: 600, color: t.text, cursor: 'pointer', fontSize: 11 }}>
              Dependencias globales (CPM)
            </summary>
            <div style={{ marginTop: 8 }}>
              <ProgObraDependenciasGlobales
                cid={cid}
                token={token}
                API={API}
                t={t}
                versionId={workingVersionId}
                editable={!!(esBorradorEditable && puedeEditar)}
                showToast={showToast}
              />
            </div>
          </details>
        )}

        {(esEnValidacion || esSellada) && (
          <details
            open={!selPk}
            style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg }}
          >
            <summary style={{ fontWeight: 600, color: t.text, cursor: 'pointer', fontSize: 11 }}>Flujo de aprobación</summary>
            <div style={{ marginTop: 8 }}>
            {loadVal && <div style={{ color: t.textMuted }}>Cargando…</div>}
            {!loadVal && validaciones.length === 0 && (
              <div style={{ color: t.textMuted, fontSize: 11 }}>Sin filas de validación (versión no enviada o datos no disponibles).</div>
            )}
            <ul style={{ margin: 0, paddingLeft: 18, color: t.text, lineHeight: 1.7 }}>
              {validaciones.map((val) => (
                <li key={val.id || `${val.nivel}-${val.orden}`}>
                  <strong>Nivel {val.nivel}</strong> — {badgeEstado(val.estado)}
                  {val.validado_en && (
                    <span style={{ color: t.textMuted, fontSize: 11 }}>
                      {' '}
                      · {fmtDateIso(val.validado_en)}
                    </span>
                  )}
                  {puedeValidar && esEnValidacion && val.estado === 'pendiente' && (
                    <span style={{ marginLeft: 8 }}>
                      <button
                        type="button"
                        style={{ ...btnStyle(true), padding: '2px 8px', fontSize: 11 }}
                        disabled={panelBusy}
                        onClick={() => setValidarModal({ nivel: val.nivel, aprobar: true, obs: '' })}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        style={{ ...btnStyle(false), padding: '2px 8px', fontSize: 11, marginLeft: 4 }}
                        disabled={panelBusy}
                        onClick={() => setValidarModal({ nivel: val.nivel, aprobar: false, obs: '' })}
                      >
                        Rechazar
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {puedeValidar && esEnValidacion && (
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>
                Solo el nivel pendiente correspondiente a su rol puede validarse; el servidor rechaza si no corresponde.
              </div>
            )}
            </div>
          </details>
        )}

        {selPk ? (
          <div style={{ fontSize: 11, color: t.text, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 600 }}>
              PK {selPk}
              {rowSel && (
                <>
                  {' '}
                  · {rowSel.estado_programacion || '—'}
                  {' '}
                  ·{' '}
                  {rowSel.porcentaje_programado != null && Number.isFinite(Number(rowSel.porcentaje_programado))
                    ? `${Math.round(Number(rowSel.porcentaje_programado))}%`
                    : '—'}
                  {rowSel.items_total != null && (
                    <span style={{ fontWeight: 400, color: t.textMuted }}>
                      {' '}
                      ({rowSel.items_con_fecha ?? 0}/{rowSel.items_total} ítems)
                    </span>
                  )}
                </>
              )}
            </div>
            {!workingVersionId && (
              <div style={{ color: t.textMuted, marginTop: 2 }}>Seleccione versión de trabajo.</div>
            )}
            {workingVersionId && !esBorradorEditable && (
              <div style={{ color: t.textMuted, marginTop: 2 }}>
                Solo lectura — {workingVersion?.estado}.
              </div>
            )}
            {loadPpto && <div style={{ color: t.textMuted, marginTop: 2 }}>Cargando presupuesto…</div>}
            {!loadPpto && pptoPorPk.length === 0 && workingVersionId && (
              <div style={{ color: t.textMuted, marginTop: 2 }}>Sin ítems activos en este PK.</div>
            )}
            {loadAct && workingVersionId && (
              <div style={{ color: t.textMuted, marginTop: 2 }}>Sincronizando actividades…</div>
            )}
          </div>
        ) : (
          <div style={{ color: t.textMuted, fontSize: 11 }}>Haz clic en un polígono del plano.</div>
        )}

        <ProgPkListado rows={pkRowsProgramables} selPk={selPk} t={t} onSelectPk={selectPkAndZoom} />
      </div>
    </div>
  )
}

function progTableUi(variant) {
  const modal = variant === 'modal'
  return {
    cell: {
      padding: modal ? 'var(--cc-space-3) var(--cc-space-4)' : '2px 4px',
      fontSize: modal ? 'var(--cc-sm)' : 'var(--cc-caption)',
      lineHeight: 1.35,
      verticalAlign: 'middle',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: modal ? 'normal' : 'nowrap',
    },
    input: {
      width: '100%',
      boxSizing: 'border-box',
      padding: modal ? 'var(--cc-space-2) var(--cc-space-3)' : '2px 3px',
      fontSize: 'var(--cc-input)',
      border: '1px solid transparent',
      borderRadius: 4,
      background: 'transparent',
    },
    rowH: modal ? 48 : 40,
    descMax: modal ? 320 : 88,
    itemMax: modal ? 88 : 52,
    dateW: modal ? 148 : 108,
    daysW: modal ? 64 : 44,
    finW: modal ? 200 : 88,
    tableFont: modal ? 'var(--cc-sm)' : 'var(--cc-caption)',
    headers: modal
      ? ['Ítem', 'Descripción', 'Und', 'Cantidad', 'Costo directo', 'Fecha inicio', 'Días hábiles', 'Fecha fin', '']
      : ['Ítem', 'Descripción', 'Und', 'Cant.', 'CD', 'F.inicio', 'Días', 'Fin', ''],
  }
}

function ProgCapituloHeaderRow({ cap, cr, t, editable, onHerencia, onGuardarCap, ui }) {
  const u = ui || progTableUi('panel')
  const ex = cr || {}
  const [fechaCap, setFechaCap] = useState(() => fmtDateIso(ex.fecha_inicio_sugerida))
  const [durCap, setDurCap] = useState(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (dirtyRef.current) return
    setFechaCap(fmtDateIso(ex.fecha_inicio_sugerida))
    setDurCap(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
  }, [ex.fecha_inicio_sugerida, ex.duracion_dias_habiles, cap])

  const saveCap = () => {
    if (!editable || !dirtyRef.current) return
    onGuardarCap(cap, fechaCap || null, durCap)
    dirtyRef.current = false
  }

  const inputBorder = { borderColor: t.border, background: t.bg }

  return (
    <tr style={{ background: `${t.primary}14`, borderTop: `1px solid ${t.border}` }}>
      <td colSpan={9} style={{ ...u.cell, padding: '6px 10px', whiteSpace: 'normal' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: t.primary, flex: '1 1 80px' }}>{cap}</span>
          {editable && (
            <>
              <input
                type="date"
                value={fechaCap}
                onChange={(e) => {
                  dirtyRef.current = true
                  setFechaCap(e.target.value)
                }}
                onBlur={saveCap}
                title="Fecha inicio capítulo"
                style={{ ...u.input, ...inputBorder, width: u.dateW, flexShrink: 0 }}
              />
              <input
                type="number"
                min={1}
                value={durCap}
                placeholder="Días"
                onChange={(e) => {
                  dirtyRef.current = true
                  setDurCap(e.target.value)
                }}
                onBlur={saveCap}
                title="Días hábiles capítulo"
                style={{ ...u.input, ...inputBorder, width: u.daysW, flexShrink: 0, textAlign: 'right' }}
              />
              <button
                type="button"
                onClick={() => onHerencia(cap)}
                style={{
                  padding: '2px 8px',
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: 4,
                  border: `1px solid ${t.primary}`,
                  background: t.bgCard,
                  color: t.primary,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Aplicar fecha del capítulo a ítems sin fecha"
              >
                Aplicar herencia
              </button>
            </>
          )}
          {!editable && ex.fecha_inicio_sugerida && (
            <span style={{ fontSize: 9, color: t.textMuted }}>
              {fmtDateIso(ex.fecha_inicio_sugerida)} · {ex.duracion_dias_habiles ?? '—'} d
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

function ProgPkItemsTable({
  variant = 'panel',
  t,
  capitulos,
  itemsPorCapitulo,
  capProgMap,
  actMap,
  actividadKey,
  itemRowKey,
  cid,
  token,
  API,
  editable,
  rowSaveStatus,
  onHerencia,
  onGuardarCap,
  onGuardarItem,
}) {
  const u = progTableUi(variant)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: 'max-content',
          minWidth: variant === 'modal' ? 1050 : '100%',
          borderCollapse: 'collapse',
          fontSize: u.tableFont,
        }}
      >
        <thead>
          <tr style={{ background: t.bg, borderBottom: `2px solid ${t.border}` }}>
            {u.headers.map((h) => (
              <th
                key={h}
                style={{
                  ...u.cell,
                  fontWeight: 700,
                  color: t.textMuted,
                  textAlign:
                    h === 'Cant.' || h === 'Cantidad' || h === 'CD' || h === 'Costo directo' || h === 'Días' || h === 'Días hábiles'
                      ? 'right'
                      : 'left',
                  position: 'sticky',
                  top: 0,
                  background: t.bg,
                  zIndex: 1,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {capitulos.map((cap) => {
            const cr = capProgMap[cap] || {}
            const items = itemsPorCapitulo(cap)
            return (
              <Fragment key={cap}>
                <ProgCapituloHeaderRow
                  cap={cap}
                  cr={cr}
                  t={t}
                  editable={editable}
                  onHerencia={onHerencia}
                  onGuardarCap={onGuardarCap}
                  ui={u}
                />
                {items.map((it) => (
                  <ProgItemTableRow
                    key={itemRowKey(cap, it.item)}
                    itemDef={it}
                    act={actMap[actividadKey(cap, it.item, 1)]}
                    rk={itemRowKey(cap, it.item)}
                    cid={cid}
                    token={token}
                    API={API}
                    t={t}
                    editable={editable}
                    saveStatus={rowSaveStatus[itemRowKey(cap, it.item)] || 'idle'}
                    onGuardarItem={onGuardarItem}
                    ui={u}
                  />
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProgItemTableRow({ itemDef, act, rk, cid, token, API, t, editable, saveStatus, onGuardarItem, ui }) {
  const u = ui || progTableUi('panel')
  const ex = act || {}
  const [fechaIni, setFechaIni] = useState(() => fmtDateIso(ex.fecha_inicio))
  const [duracion, setDuracion] = useState(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
  const debDur = useDebounced(duracion, 320)
  const debFecha = useDebounced(fechaIni, 320)
  const [finCalc, setFinCalc] = useState(() => fmtDateIso(ex.fecha_fin_calculada))
  const dirtyRef = useRef(false)
  const actSyncKey = `${fmtDateIso(ex.fecha_inicio)}|${ex.duracion_dias_habiles ?? ''}|${fmtDateIso(ex.fecha_fin_calculada)}`

  useEffect(() => {
    if (dirtyRef.current) return
    setFechaIni(fmtDateIso(ex.fecha_inicio))
    setDuracion(ex.duracion_dias_habiles != null ? String(ex.duracion_dias_habiles) : '')
    setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
  }, [actSyncKey, itemDef.capitulo, itemDef.item])

  useEffect(() => {
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !d || d < 1 || !cid || !token) {
      if (!dirtyRef.current) setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
      return
    }
    let cancel = false
    const q = new URLSearchParams({ fecha_inicio: debFecha, duracion_dias_habiles: String(d) })
    fetch(`${API}/prog-obra/${cid}/calcular-fin?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancel) setFinCalc(j?.fecha_fin_calculada ? fmtDateIso(j.fecha_fin_calculada) : '')
      })
      .catch(() => {
        if (!cancel && !dirtyRef.current) setFinCalc(fmtDateIso(ex.fecha_fin_calculada))
      })
    return () => {
      cancel = true
    }
  }, [debFecha, debDur, cid, token, API, ex.fecha_fin_calculada])

  const trySave = useCallback(async () => {
    if (!editable || saveStatus === 'saving') return false
    const d = parseInt(String(duracion), 10)
    if (!fechaIni || !(d > 0)) return false
    const ok = await onGuardarItem(
      itemDef,
      {
        fecha_inicio: fechaIni,
        duracion: String(d),
        override_manual: true,
        heredado_de_capitulo: false,
      },
      rk,
    )
    if (ok) dirtyRef.current = false
    return ok
  }, [editable, saveStatus, onGuardarItem, itemDef, fechaIni, duracion, rk])

  useEffect(() => {
    if (!editable || !dirtyRef.current) return undefined
    const d = parseInt(String(debDur), 10)
    if (!debFecha || !(d > 0)) return undefined
    const timer = setTimeout(() => {
      trySave()
    }, 700)
    return () => clearTimeout(timer)
  }, [debFecha, debDur, editable, trySave])

  const onBlurField = () => {
    if (dirtyRef.current) trySave()
  }

  const saveIcon =
    saveStatus === 'saving' ? (
      <span style={{ color: t.textMuted }} title="Guardando">…</span>
    ) : saveStatus === 'saved' ? (
      <span style={{ color: '#1D9E75', fontWeight: 700 }} title="Guardado">✓</span>
    ) : saveStatus === 'error' ? (
      <span style={{ color: '#b91c1c', fontWeight: 700 }} title="Error">!</span>
    ) : ex.heredado_de_capitulo ? (
      <span style={{ fontSize: 9, color: '#1e40af' }} title="Heredado">H</span>
    ) : null

  const inputBorder = { borderColor: t.border, background: t.bg }

  return (
    <tr style={{ borderBottom: `1px solid ${t.border}`, height: u.rowH, maxHeight: u.rowH }}>
      <td style={{ ...u.cell, fontWeight: 600, color: t.text, maxWidth: u.itemMax }} title={itemDef.item}>
        {itemDef.item}
      </td>
      <td style={{ ...u.cell, maxWidth: u.descMax, color: t.textMuted }} title={itemDef.descripcion}>
        {itemDef.descripcion || '—'}
      </td>
      <td style={{ ...u.cell, maxWidth: 40 }}>{itemDef.und || '—'}</td>
      <td style={{ ...u.cell, textAlign: 'right', maxWidth: 72 }}>{fmtCant(itemDef.cant_total)}</td>
      <td style={{ ...u.cell, textAlign: 'right', maxWidth: 120, whiteSpace: 'nowrap' }} title={String(itemDef.costo_directo ?? '')}>
        {fmtCOP(itemDef.costo_directo)}
      </td>
      <td style={{ ...u.cell, maxWidth: u.dateW }}>
        {editable ? (
          <input
            type="date"
            value={fechaIni}
            onChange={(e) => {
              dirtyRef.current = true
              setFechaIni(e.target.value)
            }}
            onBlur={onBlurField}
            style={{ ...u.input, ...inputBorder }}
          />
        ) : (
          fmtDateIso(ex.fecha_inicio) || '—'
        )}
      </td>
      <td style={{ ...u.cell, maxWidth: u.daysW }}>
        {editable ? (
          <input
            type="number"
            min={1}
            value={duracion}
            onChange={(e) => {
              dirtyRef.current = true
              setDuracion(e.target.value)
            }}
            onBlur={onBlurField}
            style={{ ...u.input, ...inputBorder, textAlign: 'right' }}
          />
        ) : (
          ex.duracion_dias_habiles ?? '—'
        )}
      </td>
      <td style={{ ...u.cell, maxWidth: u.finW, color: t.textMuted, whiteSpace: 'nowrap' }}>
        {fmtDateHuman(finCalc || ex.fecha_fin_calculada)}
      </td>
      <td style={{ ...u.cell, width: 22, textAlign: 'center' }}>{saveIcon}</td>
    </tr>
  )
}
