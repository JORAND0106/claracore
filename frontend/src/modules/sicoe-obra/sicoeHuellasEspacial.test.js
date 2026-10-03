import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizarGeometriaTipo, sugerirGeometriaTipo } from './sicoeHuellasEspacial.js'
import { localizacionToApiFields, sicoeLocFromRegistro } from './sicoeLocalizacionHelpers.js'
import { justificacionesParaTipo, resumenAmbienteDesdeFilas } from './sicoeAuditoriaTraslapos.js'

describe('sicoeHuellasEspacial', () => {
  it('sugiere tipo según unidad y coords', () => {
    assert.equal(sugerirGeometriaTipo({ unidad: 'UN' }), 'punto')
    assert.equal(sugerirGeometriaTipo({ unidad: 'm2' }), 'area')
    assert.equal(sugerirGeometriaTipo({ unidad: 'ml' }), 'linea')
    assert.equal(sugerirGeometriaTipo({}, 3), 'area')
    assert.equal(normalizarGeometriaTipo('polígono'), 'area')
  })
})

describe('localizacion geometría', () => {
  it('serializa polígono solo si tipo área', () => {
    const loc = {
      pkSeleccionado: { id: 1, civ: 'C1' },
      margen: 'Derecha',
      absInicio: 10,
      absFinal: 20,
      nodoIni: 'A',
      nodoFin: 'B',
      coordLat: 4.72,
      coordLng: -74.05,
      geometriaTipo: 'area',
      coordsVertices: [
        { lng: -74.05, lat: 4.72 },
        { lng: -74.049, lat: 4.72 },
        { lng: -74.049, lat: 4.721 },
      ],
    }
    const api = localizacionToApiFields(loc)
    assert.equal(api.geometria_tipo, 'area')
    assert.equal(api.coords_geojson?.type, 'Polygon')

    const punto = localizacionToApiFields({ ...loc, geometriaTipo: 'punto' })
    assert.equal(punto.geometria_tipo, 'punto')
    assert.equal(punto.coords_geojson?.type, 'Point')
  })

  it('lee coords_geojson al hidratar localización', () => {
    const reg = {
      pk_id_id: 9,
      geometria_tipo: 'area',
      coords_geojson: {
        type: 'Polygon',
        coordinates: [[[-74, 4], [-73.9, 4], [-73.9, 4.1], [-74, 4]]],
      },
      coord_lat: 4,
      coord_lng: -74,
    }
    const loc = sicoeLocFromRegistro(reg)
    assert.equal(loc.geometriaTipo, 'area')
    assert.equal(loc.coordsVertices.length, 3)
  })
})

describe('auditoría cantidad_mayor_area', () => {
  it('justificaciones y resumen', () => {
    const just = justificacionesParaTipo('cantidad_mayor_area')
    assert.ok(just.some((j) => j.includes('desperdicio')))
    const res = resumenAmbienteDesdeFilas([
      { tipo: 'cantidad_mayor_area', estado: 'pendiente', valor_en_juego: 100 },
    ])
    assert.equal(res.inconsistencias.cantidad, 1)
  })
})
