/**
 * Mapa PK offline — Leaflet + MapTiler (tiles en Cache API vía Service Worker).
 * Réplica la lógica de clic del modal Nuevo Reporte (Mapbox).
 */
import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function polygonFeaturesOnly(geojson) {
  return (geojson?.features || []).filter(
    (f) =>
      f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon',
  )
}

function abscissaLabelFromProps(props) {
  if (!props) return ''
  return String(
    props.Layer || props.Name || props.label || props.etiqueta || '',
  ).trim()
}

function abscissaDivIcon(labelText) {
  return L.divIcon({
    className: 'abscisa-label',
    html: `<span style="font-size:9px; color:#333; font-weight:500; white-space:nowrap; text-shadow: 1px 1px 0 white, -1px -1px 0 white;">${labelText}</span>`,
    iconSize: null,
    iconAnchor: [0, 0],
  })
}

function FitPlanoBounds({ geojson }) {
  const map = useMap()
  useEffect(() => {
    const polygons = polygonFeaturesOnly(geojson)
    if (!polygons.length) return
    try {
      const layer = L.geoJSON({
        type: 'FeatureCollection',
        features: polygons,
      })
      const b = layer.getBounds()
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 18 })
    } catch {
      /* ignore */
    }
  }, [geojson, map])
  return null
}

function pkIdFromFeatureProps(props) {
  if (!props) return ''
  return String(props.Layer || props.PK_ID || props.pk_id || '').trim()
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const MAPTILER_TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
  : null

export default function ModalPkMapaLeaflet({ geojson, handlersRef }) {
  if (!MAPTILER_TILE_URL) {
    return (
      <div style={{ padding: 24, color: '#6b7280', fontSize: 14 }}>
        Falta <code>VITE_MAPTILER_KEY</code> para el mapa offline. Configúrala y vuelve a preparar offline.
      </div>
    )
  }

  if (!geojson?.features?.length) {
    return (
      <div style={{ padding: 24, color: '#6b7280', fontSize: 14 }}>
        No hay plano GeoJSON en caché. Vuelve a preparar offline con conexión.
      </div>
    )
  }

  return (
    <MapContainer
      center={[4.760271, -74.031242]}
      zoom={12}
      style={{ width: '100%', height: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noreferrer">MapTiler</a>'
        url={MAPTILER_TILE_URL}
      />
      <FitPlanoBounds geojson={geojson} />
      <GeoJSON
        data={geojson}
        style={{
          fillColor: '#0077B6',
          fillOpacity: 0.35,
          color: '#00A896',
          weight: 1.5,
        }}
        pointToLayer={(feature, latlng) => {
          const labelText = abscissaLabelFromProps(feature.properties)
          if (!labelText) {
            return L.marker(latlng, {
              icon: L.divIcon({
                className: 'abscisa-label',
                html: '',
                iconSize: [0, 0],
                iconAnchor: [0, 0],
              }),
              interactive: false,
            })
          }
          return L.marker(latlng, {
            icon: abscissaDivIcon(labelText),
            interactive: false,
          })
        }}
        onEachFeature={(feature, layer) => {
          if (feature.geometry?.type === 'Point') return
          layer.on({
            click: (e) => {
              const h = handlersRef.current
              const pkIdVal = pkIdFromFeatureProps(feature.properties)
              const found = (h.pkIds || []).find(
                (p) => String(p.pk_id).trim() === pkIdVal,
              )
              if (found) {
                h.selPkId(found)
                h.setCoordLat(e.latlng.lat)
                h.setCoordLng(e.latlng.lng)
              } else {
                h.setPkBusqueda(pkIdVal)
                h.setPkSeleccionado(null)
              }
              h.setModalMapaPk(false)
            },
            mouseover: (e) => {
              e.target.setStyle({ fillColor: '#F59E0B', fillOpacity: 0.6 })
            },
            mouseout: (e) => {
              e.target.setStyle({ fillColor: '#0077B6', fillOpacity: 0.35 })
            },
          })
        }}
      />
    </MapContainer>
  )
}
