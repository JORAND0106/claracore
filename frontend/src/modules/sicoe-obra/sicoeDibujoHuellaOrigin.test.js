import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PX_PER_METER } from '../../components/esquema/esquemaGeometry.js'
import { gkBogotaToWgs84 } from '../../utils/epsg3116.js'
import {
  gkOriginFromCoordRows,
  gkOriginFromObjects,
  resolveHuellaMapOrigin,
} from './sicoeDibujoHuellaOrigin.js'

describe('sicoeDibujoHuellaOrigin', () => {
  it('gkOriginFromObjects: nodo en (0,0) define el ancla', () => {
    const gk = gkOriginFromObjects([
      { type: 'nodo', x: 0, y: 0, norte: 970815.977, este: 957380.723 },
      { type: 'bloque', x: -10, y: -10 },
    ])
    assert.deepEqual(gk, { este0: 957380.723, norte0: 970815.977 })
  })

  it('gkOriginFromObjects: invierte offset de un nodo desplazado', () => {
    const este0 = 1000
    const norte0 = 2000
    const x = 2 * PX_PER_METER // 2 m este
    const y = -3 * PX_PER_METER // 3 m norte
    const gk = gkOriginFromObjects([
      {
        type: 'nodo',
        x,
        y,
        este: este0 + 2,
        norte: norte0 + 3,
      },
    ])
    assert.ok(gk)
    assert.ok(Math.abs(gk.este0 - este0) < 1e-9)
    assert.ok(Math.abs(gk.norte0 - norte0) < 1e-9)
  })

  it('gkOriginFromCoordRows usa la primera fila válida', () => {
    assert.deepEqual(
      gkOriginFromCoordRows([
        { norte: '', este: '' },
        { norte: 1, este: 2 },
        { norte: 9, este: 8 },
      ]),
      { este0: 2, norte0: 1 },
    )
  })

  it('resolveHuellaMapOrigin prioriza Gauss sobre origin_lnglat guardado (corrige reaperturas)', () => {
    const norte = 970815.977
    const este = 957380.723
    const expected = gkBogotaToWgs84(este, norte)
    const resolved = resolveHuellaMapOrigin({
      objects: [{ type: 'nodo', x: 0, y: 0, norte, este }],
      escena: {
        origin_lnglat: { lng: -74.1, lat: 4.6 }, // centro PK incorrecto
      },
      fallbackLngLat: { lng: -75, lat: 5 },
    })
    assert.equal(resolved.source, 'gauss')
    assert.ok(Math.abs(resolved.lngLat.lng - expected.lng) < 1e-10)
    assert.ok(Math.abs(resolved.lngLat.lat - expected.lat) < 1e-10)
    assert.deepEqual(resolved.gk, { este0: este, norte0: norte })
  })

  it('resolveHuellaMapOrigin cae a escena si no hay Gauss', () => {
    const resolved = resolveHuellaMapOrigin({
      objects: [{ type: 'bloque', x: 0, y: 0 }],
      escena: { origin_lnglat: { lng: -74.08, lat: 4.65 } },
    })
    assert.equal(resolved.source, 'escena')
    assert.deepEqual(resolved.lngLat, { lng: -74.08, lat: 4.65 })
  })
})
