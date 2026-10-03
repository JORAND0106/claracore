import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { gkBogotaToWgs84 } from '../../utils/epsg3116.js'
import { draftToFeatureCollection } from './sicoeLevantamientoMapaLayer.js'

/** Copia ligera de puntosTopoAGeojson sin importar apiBase (Node test). */
function puntosTopoAGeojson(puntos, reporteId = null) {
  const features = []
  for (const p of puntos || []) {
    let lng = p?.lng
    let lat = p?.lat
    if (!(Number.isFinite(Number(lng)) && Number.isFinite(Number(lat)))) {
      const ll = gkBogotaToWgs84(p?.este, p?.norte)
      if (!ll) continue
      lng = ll.lng
      lat = ll.lat
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
      properties: {
        label: String(p.punto || p.id || ''),
        reporte_id: reporteId ?? p.reporte_id ?? null,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

function mapboxDashForLineStyle(style) {
  const s = String(style || 'continua')
  if (s === 'punteada') return [2, 2]
  if (s === 'punto_linea') return [6, 2, 1, 2]
  return undefined
}

describe('sicoeLevantamiento', () => {
  it('puntosTopoAGeojson transforma EPSG:3116', () => {
    const fc = puntosTopoAGeojson([
      { punto: 'P1', este: 1000000, norte: 1000000 },
    ], 7)
    assert.equal(fc.features.length, 1)
    assert.equal(fc.features[0].properties.label, 'P1')
    assert.equal(fc.features[0].properties.reporte_id, 7)
    const [lng, lat] = fc.features[0].geometry.coordinates
    assert.ok(lng > -75 && lng < -73)
    assert.ok(lat > 4 && lat < 5.5)
  })

  it('draftToFeatureCollection cierra polígono', () => {
    const fc = draftToFeatureCollection({
      geometriaTipo: 'area',
      vertices: [
        { lng: -74.05, lat: 4.72 },
        { lng: -74.049, lat: 4.72 },
        { lng: -74.049, lat: 4.721 },
      ],
    })
    const poly = fc.features.find((f) => f.geometry.type === 'Polygon')
    assert.ok(poly)
    const ring = poly.geometry.coordinates[0]
    assert.deepEqual(ring[0], ring[ring.length - 1])
  })

  it('mapboxDashForLineStyle', () => {
    assert.equal(mapboxDashForLineStyle('continua'), undefined)
    assert.ok(Array.isArray(mapboxDashForLineStyle('punteada')))
  })
})
