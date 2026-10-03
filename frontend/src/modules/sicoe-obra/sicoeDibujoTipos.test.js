import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  sugerirTipoDibujo,
  tipoDesdeEscenaGuardada,
  validarEscenaPorTipo,
  normalizarTipoDibujo,
} from './sicoeDibujoTipos.js'
import { metersToWorld } from '../../components/esquema/esquemaGeometry.js'
import {
  esquemaSceneToGeojson,
  featureHuellaDesdeDibujo,
} from './sicoeDibujoEscenaGeojson.js'

describe('sicoeDibujoTipos', () => {
  it('sugiere tipo según cantidad de coordenadas', () => {
    assert.equal(sugerirTipoDibujo(0), 'nodo')
    assert.equal(sugerirTipoDibujo(1), 'nodo')
    assert.equal(sugerirTipoDibujo(2), 'linea')
    assert.equal(sugerirTipoDibujo(5), 'poligono')
  })

  it('dibujos antiguos sin tipo → poligono', () => {
    assert.equal(tipoDesdeEscenaGuardada({}, { type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] }), 'poligono')
  })

  it('valida nodo con un solo punto', () => {
    const ok = validarEscenaPorTipo([{ type: 'nodo', x: 1, y: 2, nodeNum: '1' }], 'nodo')
    assert.equal(ok.ok, true)
    const fail = validarEscenaPorTipo([], 'nodo')
    assert.equal(fail.ok, false)
    assert.match(fail.mensaje, /al menos un punto/i)
  })

  it('valida línea con dos puntos', () => {
    const fail = validarEscenaPorTipo([{ type: 'nodo', x: 0, y: 0 }], 'linea')
    assert.equal(fail.ok, false)
    assert.match(fail.mensaje, /al menos dos puntos/i)
    const ok = validarEscenaPorTipo([
      { type: 'linea', x1: 0, y1: 0, x2: 10, y2: 0 },
    ], 'linea')
    assert.equal(ok.ok, true)
  })

  it('mensaje de forma cerrada solo para polígono', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
    ]
    const open = validarEscenaPorTipo([{ type: 'polilinea', closed: false, points: pts }], 'poligono')
    assert.equal(open.ok, false)
    assert.match(open.mensaje, /cierre el área|área cerrada|forma cerrada/i)
  })
})

describe('esquemaSceneToGeojson por tipo', () => {
  const origin = { lng: -74.08, lat: 4.65 }

  it('nodo con bloque genera Point + Polygon', () => {
    const fc = esquemaSceneToGeojson(
      [{ id: 'n1', type: 'nodo', x: 0, y: 0, nodeNum: '1' }],
      origin,
      {
        dibujoTipo: 'nodo',
        bloque: { id: 1, nombre: 'Pozo', forma: 'circulo', ancho_m: 1.2, alto_m: 1.2 },
        rotacionDeg: 0,
        reporteId: 66,
      },
    )
    assert.ok(fc.features.some((f) => f.geometry.type === 'Point'))
    assert.ok(fc.features.some((f) => f.geometry.type === 'Polygon'))
    const feat = featureHuellaDesdeDibujo(fc, { reporte_id: 66 })
    assert.equal(feat.properties.huella_tipo, 'nodo')
    assert.equal(feat.geometry.type, 'Polygon')
  })

  it('línea abierta genera LineString', () => {
    const w = metersToWorld(5)
    const fc = esquemaSceneToGeojson(
      [{ type: 'polilinea', closed: false, points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: w }] }],
      origin,
      { dibujoTipo: 'linea', reporteId: 1 },
    )
    assert.equal(fc.features.length, 1)
    assert.equal(fc.features[0].geometry.type, 'LineString')
    const feat = featureHuellaDesdeDibujo(fc)
    assert.equal(feat.properties.huella_tipo, 'linea')
  })

  it('normalizarTipoDibujo', () => {
    assert.equal(normalizarTipoDibujo('Área'), 'poligono')
    assert.equal(normalizarTipoDibujo('punto'), 'nodo')
  })
})
