/**
 * Mapa PK offline — Leaflet + OSM (sin Mapbox).
 * Réplica la lógica de clic del modal Nuevo Reporte (Mapbox).
 */
import { useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

function FitPlanoBounds({ geojson }) {
  const map = useMap()
  useEffect(() => {
    if (!geojson?.features?.length) return
    try {
      const layer = L.geoJSON(geojson)
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

export default function ModalPkMapaLeaflet({ geojson, handlersRef }) {
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
        onEachFeature={(feature, layer) => {
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
