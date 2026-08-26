/**
 * Helpers BM / biblioteca para Circuito de Nivelación.
 * Ejecutar: node --test frontend/src/utils/topografia_nivelacion_bm.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  esPuntoVerificadoBiblioteca,
  nombreBmDesdeId,
  puntosBmParaNivelacion,
} from './topografia_nivelacion.js'

describe('esPuntoVerificadoBiblioteca', () => {
  it('acepta boolean, 1 y strings truthy comunes', () => {
    assert.equal(esPuntoVerificadoBiblioteca({ verificado: true }), true)
    assert.equal(esPuntoVerificadoBiblioteca({ verificado: 1 }), true)
    assert.equal(esPuntoVerificadoBiblioteca({ verificado: 'true' }), true)
    assert.equal(esPuntoVerificadoBiblioteca({ verificado: false }), false)
    assert.equal(esPuntoVerificadoBiblioteca({ verificado: 0 }), false)
    assert.equal(esPuntoVerificadoBiblioteca({}), false)
  })
})

describe('nombreBmDesdeId', () => {
  it('compara ids como string (select HTML vs UUID/número)', () => {
    const puntos = [{ id: 12, nombre: ' BM-A ' }, { id: 'uuid-1', nombre: 'BM-B' }]
    assert.equal(nombreBmDesdeId(puntos, '12'), 'BM-A')
    assert.equal(nombreBmDesdeId(puntos, 12), 'BM-A')
    assert.equal(nombreBmDesdeId(puntos, 'uuid-1'), 'BM-B')
    assert.equal(nombreBmDesdeId(puntos, ''), '')
    assert.equal(nombreBmDesdeId(puntos, null), '')
  })
})

describe('puntosBmParaNivelacion', () => {
  it('prioriza verificados con cota y ordena por nombre', () => {
    const puntos = [
      { id: '1', nombre: 'Z-BM', verificado: true, cota: 100 },
      { id: '2', nombre: 'A-BM', verificado: true, cota: 90 },
      { id: '3', nombre: 'Pendiente', verificado: false, cota: 80 },
      { id: '4', nombre: 'SinCota', verificado: true, cota: null },
    ]
    const out = puntosBmParaNivelacion(puntos)
    assert.deepEqual(out.map((p) => p.id), ['2', '1'])
  })

  it('si ningún verificado tiene cota, lista verificados igual', () => {
    const puntos = [
      { id: '1', nombre: 'B', verificado: true, cota: null },
      { id: '2', nombre: 'A', verificado: 'true', cota: '' },
      { id: '3', nombre: 'X', verificado: false, cota: 1 },
    ]
    const out = puntosBmParaNivelacion(puntos)
    assert.deepEqual(out.map((p) => p.id), ['2', '1'])
  })
})
