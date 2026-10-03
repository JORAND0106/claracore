import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { coordRowsDesdePuntosPortada } from './sicoeDibujoCoordsPortada.js'

describe('coordRowsDesdePuntosPortada', () => {
  it('devuelve vacío si no hay puntos', () => {
    assert.deepEqual(coordRowsDesdePuntosPortada(null), [])
    assert.deepEqual(coordRowsDesdePuntosPortada([]), [])
  })

  it('mapea puntos de portada a filas de la tabla de coordenadas', () => {
    const rows = coordRowsDesdePuntosPortada([
      { punto: 'P1', norte: 1100000.5, este: 980000.2, cota: 2550, descripcion: 'Inicio' },
      { punto: 'P2', norte: '1100010', este: '980010', cota: '', descripcion: '' },
    ])
    assert.equal(rows.length, 2)
    assert.equal(rows[0].num, 'P1')
    assert.equal(rows[0].norte, 1100000.5)
    assert.equal(rows[0].este, 980000.2)
    assert.equal(rows[0].cota, 2550)
    assert.equal(rows[0].desc, 'Inicio')
    assert.equal(rows[1].num, 'P2')
    assert.equal(rows[1].norte, 1100010)
    assert.equal(rows[1].este, 980010)
  })

  it('omite filas sin norte ni este', () => {
    const rows = coordRowsDesdePuntosPortada([
      { punto: 'X', norte: '', este: '', descripcion: 'vacío' },
      { punto: 'Y', norte: 1, este: 2 },
    ])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].num, 'Y')
  })
})
