/**
 * Vista rápida del tramo de planilla de tubería sobre Mapbox.
 * Inicio/Fin en WGS84 (o conversión GK Bogotá) con etiquetas y flechas bidireccionales.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import mapboxgl from 'mapbox-gl'
import CcModalBrandHeader from '../../CcModalBrandHeader'
import { crearMapboxMapSeguro, MapaNoDisponible } from '../../../mapboxSafe'
import { gkBogotaToWgs84 } from '../../../utils/epsg3116'
import { SICOE_MAPA_STYLE_SATELLITE } from '../../../modules/sicoe-obra/sicoeMapaBasemap'
import {
  bearingDegTramo,
  resolverCoordsTramoWgs84,
} from './planillaTuberiaTramoMapa'

const SRC = 'pt-tramo-src'
const LYR_LINE = 'pt-tramo-line'
const LYR_PTS = 'pt-tramo-pts'
const LYR_LABELS = 'pt-tramo-labels'
const SAT_OPACITY = 0.45

function applySatelliteOpacity(map, opacity = SAT_OPACITY) {
  try {
    for (const layer of map.getStyle()?.layers || []) {
      if (layer.type === 'raster') {
        map.setPaintProperty(layer.id, 'raster-opacity', opacity)
      }
    }
  } catch {
    /* ignore */
  }
}

function makeEndpointMarker({ label, bearing, color }) {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;'
  el.innerHTML = `
    <div style="
      background:#fff;color:#0f172a;font:700 12px/1.2 system-ui,sans-serif;
      padding:3px 8px;border-radius:6px;border:1px solid #cbd5e1;
      box-shadow:0 1px 3px rgba(15,23,42,.18);white-space:nowrap;
    ">${label}</div>
    <div style="
      width:0;height:0;
      border-left:7px solid transparent;border-right:7px solid transparent;
      border-bottom:14px solid ${color};
      transform:rotate(${bearing}deg);
      transform-origin:50% 70%;
      filter:drop-shadow(0 1px 1px rgba(0,0,0,.35));
    "></div>
    <div style="
      width:12px;height:12px;border-radius:50%;background:${color};
      border:2px solid #fff;margin-top:-2px;
      box-shadow:0 0 0 1px rgba(15,23,42,.25);
    "></div>
  `
  return el
}

/**
 * @param {{ open: boolean, onClose: function, theme?: object,
 *   coordsWgs84Inicio?: object|null, coordsWgs84Fin?: object|null,
 *   norteIni?: any, esteIni?: any, norteFin?: any, esteFin?: any,
 *   titulo?: string }} props
 */
export default function PlanillaTuberiaTramoMapaModal({
  open,
  onClose,
  theme,
  coordsWgs84Inicio = null,
  coordsWgs84Fin = null,
  norteIni,
  esteIni,
  norteFin,
  esteFin,
  titulo = 'Vista del tramo',
}) {
  const t = theme || {}
  const mapNodeRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [mapError, setMapError] = useState(null)
  const [mapReady, setMapReady] = useState(false)

  const tramo = useMemo(
    () => resolverCoordsTramoWgs84({
      coordsWgs84Inicio,
      coordsWgs84Fin,
      norteIni,
      esteIni,
      norteFin,
      esteFin,
      convertGk: gkBogotaToWgs84,
    }),
    [coordsWgs84Inicio, coordsWgs84Fin, norteIni, esteIni, norteFin, esteFin],
  )

  useEffect(() => {
    if (!open) return undefined
    if (!tramo?.ok || !mapNodeRef.current || mapRef.current) return undefined

    const { map, error } = crearMapboxMapSeguro(mapNodeRef.current, {
      style: SICOE_MAPA_STYLE_SATELLITE,
      center: [
        (tramo.inicio.lng + tramo.fin.lng) / 2,
        (tramo.inicio.lat + tramo.fin.lat) / 2,
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
      applySatelliteOpacity(map)
      setMapReady(true)
      try {
        const b = new mapboxgl.LngLatBounds(
          [tramo.inicio.lng, tramo.inicio.lat],
          [tramo.fin.lng, tramo.fin.lat],
        )
        map.fitBounds(b, { padding: 72, maxZoom: 18, duration: 0 })
      } catch {
        /* ignore */
      }
    }
    map.on('load', onLoad)
    map.on('style.load', () => applySatelliteOpacity(map))

    return () => {
      markersRef.current.forEach((m) => {
        try { m.remove() } catch { /* ignore */ }
      })
      markersRef.current = []
      try { map.remove() } catch { /* ignore */ }
      mapRef.current = null
      setMapReady(false)
    }
  }, [open, tramo])

  useEffect(() => {
    const map = mapRef.current
    if (!open || !map || !mapReady || !tramo?.ok) return

    const ini = tramo.inicio
    const fin = tramo.fin
    const bearIni = bearingDegTramo(ini, fin)
    const bearFin = bearingDegTramo(fin, ini)

    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { role: 'line' },
          geometry: {
            type: 'LineString',
            coordinates: [[ini.lng, ini.lat], [fin.lng, fin.lat]],
          },
        },
        {
          type: 'Feature',
          properties: { label: 'Inicio', role: 'inicio' },
          geometry: { type: 'Point', coordinates: [ini.lng, ini.lat] },
        },
        {
          type: 'Feature',
          properties: { label: 'Fin', role: 'fin' },
          geometry: { type: 'Point', coordinates: [fin.lng, fin.lat] },
        },
      ],
    }

    try {
      if (map.getSource(SRC)) {
        map.getSource(SRC).setData(fc)
      } else {
        map.addSource(SRC, { type: 'geojson', data: fc })
        map.addLayer({
          id: LYR_LINE,
          type: 'line',
          source: SRC,
          filter: ['==', ['get', 'role'], 'line'],
          paint: {
            'line-color': '#2563eb',
            'line-width': 4,
            'line-opacity': 0.95,
          },
        })
        map.addLayer({
          id: LYR_PTS,
          type: 'circle',
          source: SRC,
          filter: ['in', ['get', 'role'], ['literal', ['inicio', 'fin']]],
          paint: {
            'circle-radius': 5,
            'circle-color': '#1d4ed8',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        })
        map.addLayer({
          id: LYR_LABELS,
          type: 'symbol',
          source: SRC,
          filter: ['in', ['get', 'role'], ['literal', ['inicio', 'fin']]],
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#fff',
            'text-halo-width': 1.5,
          },
        })
      }
    } catch {
      /* ignore */
    }

    markersRef.current.forEach((m) => {
      try { m.remove() } catch { /* ignore */ }
    })
    markersRef.current = []
    try {
      const mIni = new mapboxgl.Marker({
        element: makeEndpointMarker({ label: 'Inicio', bearing: bearIni, color: '#16a34a' }),
        anchor: 'bottom',
      }).setLngLat([ini.lng, ini.lat]).addTo(map)
      const mFin = new mapboxgl.Marker({
        element: makeEndpointMarker({ label: 'Fin', bearing: bearFin, color: '#dc2626' }),
        anchor: 'bottom',
      }).setLngLat([fin.lng, fin.lat]).addTo(map)
      markersRef.current = [mIni, mFin]
    } catch {
      /* ignore */
    }
  }, [open, mapReady, tramo])

  if (!open) return null

  return (
    <div
      data-planilla-tramo-mapa-modal
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100060,
        background: t.overlay || 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(920px, 100%)',
          height: 'min(640px, 90vh)',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border || '#e2e8f0'}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: `1px solid ${t.border || '#e2e8f0'}`,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-body)', color: t.text || '#0f172a' }}>
              {titulo}
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted || '#64748b', marginTop: 2 }}>
              Inicio → Fin con flechas en ambos sentidos (WGS84)
            </div>
          </div>
          <button
            type="button"
            className="cc-topo-touch-btn"
            onClick={onClose}
            style={{
              minWidth: 44,
              minHeight: 44,
              borderRadius: 10,
              border: `1px solid ${t.border || '#cbd5e1'}`,
              background: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
        <div style={{ flex: 1, position: 'relative', minHeight: 280, background: '#0f172a' }}>
          {!tramo?.ok ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                color: '#e2e8f0',
                textAlign: 'center',
                fontSize: 'var(--cc-sm)',
              }}
            >
              {tramo?.mensaje || 'Registre coordenadas de inicio y fin del tramo para ver el mapa.'}
            </div>
          ) : mapError ? (
            <div style={{ padding: 24 }}>
              <MapaNoDisponible mensaje={mapError} />
            </div>
          ) : (
            <div ref={mapNodeRef} style={{ position: 'absolute', inset: 0 }} />
          )}
        </div>
      </div>
    </div>
  )
}
