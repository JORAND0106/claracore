/**
 * C-OUT-25 · ClaraGIS usa la geometría guardada en Dibujar reporte (escena).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from '../../components/esquema/esquemaGeometry.js'
import {
  applyObjectRotationToPoints,
  geojsonCanonicoDesdeReporte,
  objectWorldRings,
  esquemaSceneToGeojson,
  compararVerticesEscenaVsClaraGis,
} from './sicoeDibujoEscenaGeojson.js'
import {
  reconciliarDibujosConEscenas,
  reporteGeometriaDesfasada,
} from './sicoeClaraGisGeometria.js'

describe('ClaraGIS geometría canónica desde Dibujar reporte', () => {
  const origin = { lng: -74.08, lat: 4.65 }

  it('rect 16×2,25 m girado: anillo rotado (no AABB vertical)', () => {
    const L = metersToWorld(16)
    const W = metersToWorld(2.25)
    const rot = Math.PI / 6 // 30°
    const rect = {
      id: 'r1',
      type: 'rect',
      x1: 0,
      y1: 0,
      x2: L,
      y2: W,
      rotation: rot,
    }
    const rings = objectWorldRings(rect)
    assert.equal(rings.length, 1)
    const ring = rings[0]
    assert.equal(ring.length, 4)
    // Sin rotación el lado largo sería horizontal (dy≈0 entre p0-p1).
    // Con 30° debe haber componente en Y.
    const dy = Math.abs(ring[1].y - ring[0].y)
    assert.ok(dy > metersToWorld(0.5), `esperado giro visible, dy=${dy}`)

    const fc = esquemaSceneToGeojson([rect], origin, {
      dibujoTipo: 'poligono',
      reporteId: 100,
    })
    assert.equal(fc.features.length, 1)
    const coords = fc.features[0].geometry.coordinates[0]
    // No es un rectángulo alineado a ejes: x de vértice 1 ≠ x de vértice 0
    // y el bbox no es solo “vertical”.
    const xs = coords.map((c) => c[0])
    const ys = coords.map((c) => c[1])
    const spanLng = Math.max(...xs) - Math.min(...xs)
    const spanLat = Math.max(...ys) - Math.min(...ys)
    assert.ok(spanLng > 0 && spanLat > 0)
  })

  it('geojsonCanonicoDesdeReporte prioriza escena sobre geojson stale', () => {
    const L = metersToWorld(16)
    const W = metersToWorld(2.25)
    const escena = {
      dibujo_tipo: 'poligono',
      origin_lnglat: origin,
      objects: [{
        type: 'rect', x1: 0, y1: 0, x2: L, y2: W, rotation: Math.PI / 4,
      }],
    }
    const stale = esquemaSceneToGeojson(
      [{ type: 'rect', x1: 0, y1: 0, x2: L, y2: W, rotation: 0 }],
      origin,
      { dibujoTipo: 'poligono', reporteId: 100 },
    )
    const canon = geojsonCanonicoDesdeReporte({
      id: 100,
      dibujo_escena: escena,
      dibujo_geojson: stale,
    })
    assert.equal(canon.origen_geometria, 'escena')
    const cmp = compararVerticesEscenaVsClaraGis({
      id: 100,
      dibujo_escena: escena,
      dibujo_geojson: stale,
    }, { tolM: 0.01 })
    assert.equal(cmp.ok, true)
    assert.ok(cmp.maxDiffM <= 0.01)

    const desfase = reporteGeometriaDesfasada({
      id: 100,
      numero_reporte: 100,
      dibujo_escena: escena,
      dibujo_geojson: stale,
    }, { tolM: 0.5 })
    assert.equal(desfase.desfasada, true)
  })

  it('reconciliarDibujosConEscenas reemplaza geometría stale', () => {
    const L = metersToWorld(10)
    const W = metersToWorld(2)
    const escena = {
      dibujo_tipo: 'poligono',
      origin_lnglat: origin,
      objects: [{ type: 'rect', x1: 0, y1: 0, x2: L, y2: W, rotation: Math.PI / 5 }],
    }
    const staleFc = esquemaSceneToGeojson(
      [{ type: 'rect', x1: 0, y1: 0, x2: L, y2: W, rotation: 0 }],
      origin,
      { dibujoTipo: 'poligono', reporteId: 100 },
    )
    const staleRing = staleFc.features[0].geometry.coordinates[0]
    const feats = [{
      type: 'Feature',
      geometry: staleFc.features[0].geometry,
      properties: {
        origen: 'reporte_dibujo',
        reporte_id: 100,
        weight: 0.8,
        costo_directo: 500,
        registro_id: 1,
        id: 1,
      },
    }]
    const fixed = reconciliarDibujosConEscenas(feats, { 100: escena })
    assert.equal(fixed.length, 1)
    assert.equal(fixed[0].properties.geometria_origen, 'escena_canonica')
    const ring = fixed[0].geometry.coordinates[0]
    // Vértices distintos al AABB stale
    assert.notDeepEqual(ring[1], staleRing[1])
    assert.equal(fixed[0].properties.weight, 0.8)
  })

  it('applyObjectRotationToPoints sin rotación conserva puntos', () => {
    const pts = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    const out = applyObjectRotationToPoints({ rotation: 0 }, pts)
    assert.deepEqual(out.map((p) => [p.x, p.y]), [[1, 2], [3, 4]])
  })
})
