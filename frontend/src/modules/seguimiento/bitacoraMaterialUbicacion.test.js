/**
 * Node smoke test for PK identification used by material location picker.
 * Run: node --test src/modules/seguimiento/bitacoraMaterialUbicacion.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { identificarUbicacionMaterial } from './bitacoraMaterialUbicacion.js'

const PK_LIST = [
  {
    id: 'uuid-1',
    pk_id: '12+000',
    tramo: 'Tramo Norte',
    calzada: 'Derecho',
    infraestructura: 'Calzada',
    longitud: -74.1,
    latitud: 4.7,
  },
  {
    id: 'uuid-2',
    pk_id: '13+500',
    tramo: 'Tramo Sur',
    calzada: 'Izquierdo',
    infraestructura: 'Berma',
    longitud: -74.2,
    latitud: 4.8,
  },
]

describe('identificarUbicacionMaterial', () => {
  it('resuelve por valor de plano y completa tramo/costado/infra del maestro', () => {
    const r = identificarUbicacionMaterial('12+000', PK_LIST, null)
    assert.equal(r.ok, true)
    assert.equal(r.ubicacion_pk, '12+000')
    assert.equal(r.ubicacion_pk_id, 'uuid-1')
    assert.equal(r.ubicacion_tramo, 'Tramo Norte')
    assert.equal(r.ubicacion_costado, 'Derecho')
    assert.equal(r.ubicacion_infraestructura, 'Calzada')
  })

  it('usa properties del GeoJSON (Layer/costado/tramo/infraestructura) y prioriza maestro', () => {
    const r = identificarUbicacionMaterial('13+500', PK_LIST, {
      Layer: '13+500',
      costado: 'Izquierdo',
      tramo: 'Tramo Sur',
      infraestructura: 'Berma',
    })
    assert.equal(r.ok, true)
    assert.equal(r.ubicacion_pk_id, 'uuid-2')
    assert.equal(r.ubicacion_costado, 'Izquierdo')
    assert.equal(r.ubicacion_tramo, 'Tramo Sur')
    assert.equal(r.ubicacion_infraestructura, 'Berma')
  })

  it('hace fallback al valor del polígono si properties.pk_id no está en el maestro', () => {
    const r = identificarUbicacionMaterial('12+000', PK_LIST, {
      pk_id: 'objeto-gis-inexistente',
      Layer: 'otra-capa',
    })
    assert.equal(r.ok, true)
    assert.equal(r.ubicacion_pk_id, 'uuid-1')
    assert.equal(r.ubicacion_pk, '12+000')
  })

  it('falla con ok:false si no hay match en maestro', () => {
    const r = identificarUbicacionMaterial('99+999', PK_LIST, null)
    assert.equal(r.ok, false)
    assert.match(r.error, /99\+999/)
  })

  it('falla si no hay valor ni properties útiles', () => {
    assert.equal(identificarUbicacionMaterial('', PK_LIST, null).ok, false)
    assert.equal(identificarUbicacionMaterial(null, PK_LIST, {}).ok, false)
  })
})
