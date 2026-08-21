import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { crearMapboxMapSeguro } from '../../mapboxSafe'
import {
  applySicoeBasemapTerrain,
  createSicoeBasemapStyleControl,
  guardarVistaBasemap,
  leerVistaBasemapGuardada,
  normalizarVistaBasemap,
  sicoeBasemapStyleUrl,
} from '../sicoe-obra/sicoeMapaBasemap'

/**
 * Modal Mapbox para ubicar ingreso/salida de material (satélite disponible).
 * Reutiliza el control de basemap de SicoeObra.
 */
export default function BitacoraMaterialUbicacionModal({
  t,
  lat = null,
  lng = null,
  centroLat = 4.711,
  centroLng = -74.0721,
  onConfirm,
  onClose,
  readOnly = false,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [vista, setVista] = useState(() => leerVistaBasemapGuardada())
  const [coords, setCoords] = useState(() => ({
    lat: lat != null && lat !== '' ? String(lat) : '',
    lng: lng != null && lng !== '' ? String(lng) : '',
  }))
  const [mapError, setMapError] = useState(null)
  const modoRef = useRef(!readOnly)
  const vistaRef = useRef(vista)

  useEffect(() => { modoRef.current = !readOnly }, [readOnly])
  useEffect(() => { vistaRef.current = vista }, [vista])

  useEffect(() => {
    if (!containerRef.current) return undefined
    const has = coords.lat && coords.lng
      && !Number.isNaN(parseFloat(coords.lat))
      && !Number.isNaN(parseFloat(coords.lng))
    const cLat = has ? parseFloat(coords.lat) : Number(centroLat) || 4.711
    const cLng = has ? parseFloat(coords.lng) : Number(centroLng) || -74.0721
    const initial = normalizarVistaBasemap(vistaRef.current)
    const { map, error } = crearMapboxMapSeguro(containerRef.current, {
      style: sicoeBasemapStyleUrl(initial),
      center: [cLng, cLat],
      zoom: has ? 15 : 12,
    })
    if (error || !map) {
      setMapError(error || 'Mapa no disponible')
      return undefined
    }
    setMapError(null)
    map.__sicoeBasemapUrl = sicoeBasemapStyleUrl(initial)
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(
      createSicoeBasemapStyleControl({
        getMode: () => vistaRef.current,
        t,
        onSelect: (v) => {
          const next = normalizarVistaBasemap(v)
          setVista(next)
          guardarVistaBasemap(next)
        },
      }),
      'top-right',
    )
    mapRef.current = map
    const onLoad = () => applySicoeBasemapTerrain(map, vistaRef.current)
    if (map.isStyleLoaded()) onLoad()
    else map.once('load', onLoad)
    if (has) {
      markerRef.current = new mapboxgl.Marker({ color: '#0f766e' })
        .setLngLat([cLng, cLat]).addTo(map)
    }
    map.on('click', (e) => {
      if (!modoRef.current) return
      const nLat = e.lngLat.lat.toFixed(7)
      const nLng = e.lngLat.lng.toFixed(7)
      if (markerRef.current) {
        markerRef.current.setLngLat([parseFloat(nLng), parseFloat(nLat)])
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#0f766e' })
          .setLngLat([parseFloat(nLng), parseFloat(nLat)]).addTo(map)
      }
      setCoords({ lat: nLat, lng: nLng })
    })
    return () => {
      try { map.remove() } catch { /* ignore */ }
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const mode = normalizarVistaBasemap(vista)
    const url = sicoeBasemapStyleUrl(mode)
    if (map.__sicoeBasemapUrl === url) {
      applySicoeBasemapTerrain(map, mode)
      return
    }
    const center = map.getCenter()
    const zoom = map.getZoom()
    map.__sicoeBasemapUrl = url
    map.setStyle(url)
    map.once('style.load', () => {
      try { map.jumpTo({ center, zoom }) } catch { /* ignore */ }
      applySicoeBasemapTerrain(map, mode)
      const la = parseFloat(coords.lat)
      const lo = parseFloat(coords.lng)
      if (!Number.isNaN(la) && !Number.isNaN(lo)) {
        if (markerRef.current) {
          try { markerRef.current.setLngLat([lo, la]) } catch { /* ignore */ }
        } else {
          try {
            markerRef.current = new mapboxgl.Marker({ color: '#0f766e' })
              .setLngLat([lo, la]).addTo(map)
          } catch { /* ignore */ }
        }
      }
    })
  }, [vista, coords.lat, coords.lng])

  const btn = {
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontWeight: 700, fontSize: 'var(--cc-sm)',
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 5600, background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ubicación del material"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 96vw)', background: t.bgCard, border: `1px solid ${t.border}`,
          borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 40px rgba(15,23,42,0.25)',
        }}
      >
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${t.border}`,
          display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 'var(--cc-sm)' }}>
              Ubicación del material
            </div>
            <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, marginTop: 2 }}>
              {readOnly ? 'Solo consulta' : 'Clic en el mapa para marcar · vista satélite disponible'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...btn, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
            Cerrar
          </button>
        </div>
        {mapError ? (
          <div style={{ padding: 24, color: t.textMuted, fontSize: 'var(--cc-sm)' }}>{mapError}</div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: 360 }} />
        )}
        <div style={{
          padding: '10px 16px', borderTop: `1px solid ${t.border}`,
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {coords.lat && coords.lng
              ? `${coords.lat}, ${coords.lng}`
              : 'Sin coordenadas'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!readOnly && (coords.lat || lat != null) && (
              <button
                type="button"
                onClick={() => {
                  setCoords({ lat: '', lng: '' })
                  try { markerRef.current?.remove() } catch { /* ignore */ }
                  markerRef.current = null
                  onConfirm?.({ ubicacion_lat: null, ubicacion_lng: null })
                }}
                style={{ ...btn, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
              >
                Quitar
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                disabled={!coords.lat || !coords.lng}
                onClick={() => onConfirm?.({
                  ubicacion_lat: parseFloat(coords.lat),
                  ubicacion_lng: parseFloat(coords.lng),
                })}
                style={{
                  ...btn, background: t.primary, color: '#fff',
                  opacity: (!coords.lat || !coords.lng) ? 0.5 : 1,
                }}
              >
                Guardar ubicación
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
