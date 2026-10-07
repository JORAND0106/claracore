import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendCoordRowDesdePlano,
  coordRowsDesdePuntosPortada,
  coordRowsNoVacias,
  puntosPortadaDesdeCoordRows,
  redondearCoordGaussDesdePlano,
} from './sicoeDibujoCoordsPortada.js'

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

describe('appendCoordRowDesdePlano / sync portada', () => {
  it('rellena la primera fila vacía y numera', () => {
    const { rows: next, index } = appendCoordRowDesdePlano(
      [{ num: '1', norte: '', este: '', cota: '', desc: '' }],
      { norte: 971988.373, este: 958213.494 },
    )
    assert.equal(index, 0)
    assert.equal(next.length, 1)
    assert.equal(next[0].num, '1')
    assert.equal(next[0].norte, 971988.373)
    assert.equal(next[0].este, 958213.494)
    assert.equal(next[0].cota, '')
    assert.equal(next[0].desc, '')
  })

  it('agrega fila nueva con el siguiente número', () => {
    const { rows: next, index } = appendCoordRowDesdePlano(
      [{ num: '1', norte: 100, este: 200, cota: '', desc: '' }],
      { norte: 110, este: 210 },
    )
    assert.equal(index, 1)
    assert.equal(next.length, 2)
    assert.equal(next[1].num, '2')
    assert.equal(next[1].norte, 110)
    assert.equal(next[1].este, 210)
  })

  it('coordRowsNoVacias y puntosPortadaDesdeCoordRows omiten vacías', () => {
    const rows = [
      { num: '1', norte: 1, este: 2, cota: 3, desc: 'A' },
      { num: '2', norte: '', este: '', cota: '', desc: 'vacía' },
      { num: '3', norte: 4, este: 5, cota: '', desc: '' },
    ]
    assert.equal(coordRowsNoVacias(rows).length, 2)
    const puntos = puntosPortadaDesdeCoordRows(rows)
    assert.equal(puntos.length, 2)
    assert.equal(puntos[0].punto, '1')
    assert.equal(puntos[0].norte, 1)
    assert.equal(puntos[0].este, 2)
    assert.equal(puntos[0].cota, 3)
    assert.equal(puntos[0].descripcion, 'A')
    assert.equal(puntos[1].punto, '3')
    assert.equal(puntos[1].cota, null)
    assert.equal(puntos[1].descripcion, null)
  })

  it('redondea Gauss a 3 decimales', () => {
    assert.equal(redondearCoordGaussDesdePlano(971988.3734), 971988.373)
    assert.equal(redondearCoordGaussDesdePlano('x'), null)
  })
})
