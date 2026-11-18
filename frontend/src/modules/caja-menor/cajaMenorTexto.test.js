import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { crearLenguaje } from './cajaMenorTexto.js'

const lexico = readFileSync(new URL('./lexico-es.txt', import.meta.url), 'utf8')
const { formatear, revisar } = crearLenguaje(lexico)
const crudo = 'TUBO PRESION 1/2 X 6M · UNION PRESION 1/2" · SOLDADURA PVC 1/32 PAVCO'
const esperado = 'Tubo presión 1/2 x 6M · Unión presión 1/2" · Soldadura PVC 1/32 PAVCO'

describe('descripcion de caja menor', () => {
  it('pone mayúscula inicial y conserva siglas, marcas y medidas', () => {
    assert.equal(formatear(crudo), esperado)
    assert.equal(formatear(esperado), esperado)
  })

  it('subraya el error y no marca siglas, marcas ni medidas', () => {
    const marcas = revisar(crudo)
    assert.deepEqual(marcas.map((m) => m.palabra), ['PRESION', 'UNION', 'PRESION'])
    assert.equal(marcas[0].sugerencias[0], 'presión')
    assert.equal(revisar('PAVCO PVC 6M 1/2" Bogotá').length, 0)
    assert.equal(revisar('Tubo presión').length, 0)
  })
})
