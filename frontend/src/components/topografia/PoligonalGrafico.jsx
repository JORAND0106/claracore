import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { useTopoTheme } from './topografiaShared'
import { fmtNum } from '../../utils/topografia_angular'
import { gkBogotaToWgs84 } from '../../utils/epsg3116'
import { crearMapboxMapSeguro, MapaNoDisponible } from '../../mapboxSafe'
import { SICOE_MAPA_STYLE_SATELLITE } from '../../modules/sicoe-obra/sicoeMapaBasemap'
import { distanciasVecinas } from './topoPlanoLod'

/** Opacidad media-baja de la capa satelital para legibilidad del trazado. */
export const POLIGONAL_SATELLITE_OPACITY = 0.42

const SRC_LINE = 'poligonal-line'
const SRC_PTS = 'poligonal-pts'
const LYR_LINE = 'poligonal-line-lyr'
const LYR_PTS = 'poligonal-pts-lyr'
const LYR_PTS_HIT = 'poligonal-pts-hit'
const LYR_LABELS = 'poligonal-labels-lyr'

function puntosGrafico(estaciones) {
  const verts = (estaciones || []).filter(
    (e) => (e.tipo_punto || 'auxiliar') === 'estacion' && e.norte != null && e.este != null,
  )
  if (verts.length >= 3) return verts
  return (estaciones || []).filter((e) => e.norte != null && e.este != null)
}

function toLngLat(norte, este) {
  return gkBogotaToWgs84(este, norte)
}

function applySatelliteOpacity(map, opacity = POLIGONAL_SATELLITE_OPACITY) {
  try {
    const layers = map.getStyle()?.layers || []
    for (const layer of layers) {
      if (layer.type === 'raster') {
        map.setPaintProperty(layer.id, 'raster-opacity', opacity)
      }
    }
  } catch {
    /* estilo no listo */
  }
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
    >
      <CcModalBrandHeader theme="light" />
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

/**
 * Plano de la poligonal sobre Mapbox satelital (EPSG:3116 → WGS84).
 * Conserva zoom (rueda/pellizco), pan, clic en punto y «Restablecer zoom».
 */
export default function PoligonalGrafico({
  estaciones,
  puntoInicial = null,
  puntoFinal = null,
  cierre = null,
  ancho = 560,
  alto = 400,
}) {
  const ui = useTopoTheme()
  const mapNodeRef = useRef(null)
  const mapRef = useRef(null)
  const boundsRef = useRef(null)
  const [mapError, setMapError] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const [popupCss, setPopupCss] = useState(null)

  const geo = useMemo(() => {
    const tipoPol = cierre?.tipo_pol || (puntoFinal ? 'abierta' : 'cerrada')
    const esAbierta = tipoPol === 'abierta'
    const puntos = puntosGrafico(estaciones)
    const amarre =
      puntoInicial?.norte != null && puntoInicial?.este != null
        ? {
            key: 'extra:amarre',
            nombre: puntoInicial.nombre || 'Amarre',
            norte: puntoInicial.norte,
            este: puntoInicial.este,
            cota: puntoInicial.cota,
            rol: 'amarre',
          }
        : null
    const llegadaObjRaw =
      cierre?.llegada_objetivo ||
      (puntoFinal?.norte != null && puntoFinal?.este != null
        ? {
            nombre: puntoFinal.nombre || 'Llegada',
            norte: puntoFinal.norte,
            este: puntoFinal.este,
            cota: puntoFinal.cota,
          }
        : null)
    const llegadaCalcRaw = cierre?.llegada_calculada || null

    const traverse = []
    for (const p of puntos) {
      const ll = toLngLat(p.norte, p.este)
      if (!ll) continue
      traverse.push({
        key: String(traverse.length),
        nombre: p.nombre_punto || p.nombre || `P${traverse.length + 1}`,
        norte: p.norte,
        este: p.este,
        cota: p.cota,
        lng: ll.lng,
        lat: ll.lat,
        rol: 'estacion',
        id: p.id,
      })
    }

    const extras = []
    const pushExtra = (raw, key, rol) => {
      if (!raw || raw.norte == null || raw.este == null) return
      const ll = toLngLat(raw.norte, raw.este)
      if (!ll) return
      if (traverse.some((t) => Math.abs(t.norte - raw.norte) < 1e-4 && Math.abs(t.este - raw.este) < 1e-4)) {
        return
      }
      extras.push({
        key,
        nombre: raw.nombre || rol,
        norte: raw.norte,
        este: raw.este,
        cota: raw.cota,
        lng: ll.lng,
        lat: ll.lat,
        rol,
      })
    }
    if (amarre) pushExtra(amarre, 'extra:amarre', 'amarre')
    if (esAbierta && llegadaObjRaw) pushExtra(llegadaObjRaw, 'extra:llegadaObj', 'llegadaObj')
    if (esAbierta && llegadaCalcRaw) pushExtra(llegadaCalcRaw, 'extra:llegadaCalc', 'llegadaCalc')

    if (traverse.length < 2 && extras.length < 1) return null

    const esCerrada = !esAbierta && traverse.length >= 3
    const lineCoords = traverse.map((p) => [p.lng, p.lat])
    if (esCerrada && lineCoords.length >= 3) {
      lineCoords.push(lineCoords[0])
    }

    const allPts = [...traverse, ...extras]
    const lngs = allPts.map((p) => p.lng)
    const lats = allPts.map((p) => p.lat)
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ]

    // Distancias entre vértices en metros Gauss (mismo criterio que el plano cartesiano).
    const coordsForDist = traverse.map((p) => ({
      x: p.este,
      y: p.norte,
      p: { nombre_punto: p.nombre, nombre: p.nombre, norte: p.norte, este: p.este },
    }))

    return {
      traverse,
      extras,
      allPts,
      lineCoords,
      esCerrada,
      esAbierta,
      bounds,
      coordsForDist,
      gapErr:
        cierre?.cerrado && cierre?.error_lineal != null && cierre.error_lineal > 0.05
          ? cierre.error_lineal
          : null,
    }
  }, [estaciones, puntoInicial, puntoFinal, cierre])

  const fitToTraverse = useCallback(() => {
    const map = mapRef.current
    const b = boundsRef.current
    if (!map || !b) return
    try {
      map.fitBounds(b, { padding: 48, duration: 400, maxZoom: 18 })
    } catch {
      /* ignore */
    }
  }, [])

  // Crear mapa una vez
  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return undefined
    if (!geo) return undefined

    const { map, error } = crearMapboxMapSeguro(mapNodeRef.current, {
      style: SICOE_MAPA_STYLE_SATELLITE,
      center: [
        (geo.bounds[0][0] + geo.bounds[1][0]) / 2,
        (geo.bounds[0][1] + geo.bounds[1][1]) / 2,
      ],
      zoom: 15,
      attributionControl: true,
      cooperativeGestures: false,
    })
    if (error || !map) {
      setMapError(error || 'No se pudo cargar Mapbox')
      return undefined
    }
    mapRef.current = map
    setMapError(null)

    const onLoad = () => {
      applySatelliteOpacity(map, POLIGONAL_SATELLITE_OPACITY)
      setMapReady(true)
      boundsRef.current = geo.bounds
      try {
        map.fitBounds(geo.bounds, { padding: 48, duration: 0, maxZoom: 18 })
      } catch {
        /* ignore */
      }
    }
    map.on('load', onLoad)
    map.on('style.load', () => applySatelliteOpacity(map, POLIGONAL_SATELLITE_OPACITY))

    return () => {
      try {
        map.remove()
      } catch {
        /* ignore */
      }
      mapRef.current = null
      setMapReady(false)
    }
    // Solo montar una vez; geo se sincroniza en el efecto siguiente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!geo])

  // Actualizar GeoJSON / capas cuando cambian estaciones
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !geo) return

    boundsRef.current = geo.bounds

    const lineFc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: geo.lineCoords },
        },
      ],
    }
    const ptsFc = {
      type: 'FeatureCollection',
      features: geo.allPts.map((p) => ({
        type: 'Feature',
        properties: {
          key: p.key,
          nombre: p.nombre,
          rol: p.rol,
          norte: p.norte,
          este: p.este,
          cota: p.cota ?? null,
        },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    }

    const ensureLayers = () => {
      if (!map.getSource(SRC_LINE)) {
        map.addSource(SRC_LINE, { type: 'geojson', data: lineFc })
        map.addSource(SRC_PTS, { type: 'geojson', data: ptsFc })
        map.addLayer({
          id: LYR_LINE,
          type: 'line',
          source: SRC_LINE,
          paint: {
            'line-color': '#2563eb',
            'line-width': 3,
            'line-opacity': 0.95,
          },
        })
        map.addLayer({
          id: LYR_PTS_HIT,
          type: 'circle',
          source: SRC_PTS,
          paint: {
            'circle-radius': 14,
            'circle-color': 'transparent',
            'circle-opacity': 0,
          },
        })
        map.addLayer({
          id: LYR_PTS,
          type: 'circle',
          source: SRC_PTS,
          paint: {
            'circle-radius': [
              'match',
              ['get', 'rol'],
              'amarre', 7,
              'llegadaObj', 7,
              'llegadaCalc', 6,
              6,
            ],
            'circle-color': [
              'match',
              ['get', 'rol'],
              'amarre', '#16a34a',
              'llegadaObj', '#15803d',
              'llegadaCalc', '#c2410c',
              '#2563eb',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })
        map.addLayer({
          id: LYR_LABELS,
          type: 'symbol',
          source: SRC_PTS,
          layout: {
            'text-field': ['get', 'nombre'],
            'text-size': 12,
            'text-offset': [0, -1.35],
            'text-anchor': 'bottom',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': false,
            'text-optional': true,
          },
          paint: {
            'text-color': '#1e3a8a',
            'text-halo-color': 'rgba(255,255,255,0.92)',
            'text-halo-width': 1.6,
          },
        })
      } else {
        map.getSource(SRC_LINE).setData(lineFc)
        map.getSource(SRC_PTS).setData(ptsFc)
      }
      applySatelliteOpacity(map, POLIGONAL_SATELLITE_OPACITY)
    }

    ensureLayers()
    fitToTraverse()
  }, [geo, mapReady, fitToTraverse])

  // Clic en punto → detalle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return undefined

    const onClick = (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: [LYR_PTS_HIT, LYR_PTS] })
      const f = feats?.[0]
      if (!f) {
        setSelectedKey(null)
        setPopupCss(null)
        return
      }
      const key = f.properties?.key
      setSelectedKey((prev) => (prev === key ? null : key))
      const canvas = map.getCanvas()
      const rect = canvas.getBoundingClientRect()
      const popupW = 230
      const popupH = 180
      let left = e.point.x + 14
      let top = e.point.y - 20
      if (left + popupW > rect.width - 8) left = e.point.x - popupW - 10
      if (left < 8) left = 8
      if (top + popupH > rect.height - 8) top = Math.max(8, rect.height - popupH - 8)
      if (top < 8) top = 8
      setPopupCss({ left, top })
    }
    map.on('click', onClick)
    map.getCanvas().style.cursor = 'grab'
    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const onLeave = () => {
      map.getCanvas().style.cursor = 'grab'
    }
    map.on('mouseenter', LYR_PTS_HIT, onEnter)
    map.on('mouseleave', LYR_PTS_HIT, onLeave)

    return () => {
      map.off('click', onClick)
      map.off('mouseenter', LYR_PTS_HIT, onEnter)
      map.off('mouseleave', LYR_PTS_HIT, onLeave)
    }
  }, [mapReady])

  const selectedDetalle = useMemo(() => {
    if (!geo || selectedKey == null) return null
    const pt = geo.allPts.find((p) => p.key === selectedKey)
    if (!pt) return null
    let distPrev = null
    let distNext = null
    let prevNombre = null
    let nextNombre = null
    if (pt.rol === 'estacion') {
      const idx = geo.traverse.findIndex((p) => p.key === selectedKey)
      if (idx >= 0) {
        const vecinos = distanciasVecinas(geo.coordsForDist, idx, geo.esCerrada)
        distPrev = vecinos.prev
        distNext = vecinos.next
        prevNombre = vecinos.prevNombre
        nextNombre = vecinos.nextNombre
      }
    }
    const suffix =
      pt.rol === 'amarre'
        ? ' (amarre)'
        : pt.rol === 'llegadaObj'
          ? ' (obj.)'
          : pt.rol === 'llegadaCalc'
            ? ' (calc.)'
            : ''
    return {
      key: selectedKey,
      nombre: `${pt.nombre}${suffix}`,
      norte: pt.norte,
      este: pt.este,
      cota: pt.cota,
      distPrev,
      distNext,
      prevNombre,
      nextNombre,
    }
  }, [geo, selectedKey])

  if (!geo) {
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
        <button
          type="button"
          onClick={fitToTraverse}
          style={{
            fontSize: 'var(--cc-xs)',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Restablecer zoom
        </button>
        <span style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>
          Satélite · Rueda / pellizcar: zoom · Arrastrar: pan · Clic en un punto: detalle
        </span>
      </div>

      {geo.gapErr != null && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-xs)', color: '#b45309' }}>
          Error de cierre lineal preliminar: {fmtNum(geo.gapErr, 3)} m (el trazado muestra coords
          radiadas/ajustadas sobre el satélite).
        </p>
      )}

      {mapError ? (
        <MapaNoDisponible t={ui.t || ui} mensaje={mapError} minHeight={alto} />
      ) : (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: alto,
            borderRadius: 8,
            border: ui.grafico?.border || '1px solid #cbd5e1',
            overflow: 'hidden',
          }}
        >
          <div
            ref={mapNodeRef}
            data-poligonal-mapbox="1"
            style={{ width: '100%', height: '100%' }}
            aria-label="Mapa satelital de la poligonal"
          />
          {selectedDetalle && popupCss && (
            <NodoDetallePopup
              detalle={selectedDetalle}
              style={popupCss}
              onClose={() => {
                setSelectedKey(null)
                setPopupCss(null)
              }}
            />
          )}
        </div>
      )}

      {/* ancho reservado para layout; Mapbox usa 100% del contenedor */}
      <span style={{ display: 'none' }} aria-hidden>
        {ancho}
      </span>
    </div>
  )
}
