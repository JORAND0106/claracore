import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analizarPuntosTopoParaGuardar,
  depurarResaltesTopo,
  formatearListaPuntosTopo,
  mensajeAdvertenciaCotaVacia,
  mensajeErrorDatosTopo,
} from './sicoeTopoCoordsValidacion.js'

describe('sicoeTopoCoordsValidacion', () => {
  it('formatea listas de puntos', () => {
    assert.equal(formatearListaPuntosTopo(['1']), '1')
    assert.equal(formatearListaPuntosTopo(['1', '2']), '1 y 2')
    assert.equal(formatearListaPuntosTopo(['1', '2', '3']), '1, 2 y 3')
  })

  it('permite cota vacía y la normaliza a null', () => {
    const r = analizarPuntosTopoParaGuardar([
      { punto: '1', norte: '972053.209', este: '958178.924', cota: '', descripcion: '' },
      { punto: '2', norte: '972060', este: '958180', cota: '', descripcion: '' },
    ])
    assert.equal(r.errores.length, 0)
    assert.equal(r.cotasVacias.length, 2)
    assert.equal(r.puntos.length, 2)
    assert.equal(r.puntos[0].cota, null)
    assert.equal(r.puntos[1].cota, null)
    assert.match(mensajeAdvertenciaCotaVacia(r.cotasVacias), /Cota vacía en los puntos 1 y 2/)
  })

  it('bloquea texto en Norte/Este', () => {
    const r = analizarPuntosTopoParaGuardar([
      { punto: 'A', norte: 'abc', este: '100', cota: '', descripcion: '' },
    ])
    assert.equal(r.errores.length, 1)
    assert.equal(r.errores[0].campo, 'norte')
    assert.match(mensajeErrorDatosTopo(r.errores), /Norte inválido/)
    assert.match(mensajeErrorDatosTopo(r.errores), /punto A/)
    // Con errores el caller no guarda; normalización puede conservar Este válido.
    assert.ok(r.errores.length > 0)
  })

  it('depurarResaltesTopo quita cota al diligenciarla', () => {
    const keys = new Set(['0:cota', '1:cota'])
    const next = depurarResaltesTopo(keys, [
      { cota: '2550', norte: 1, este: 2 },
      { cota: '', norte: 3, este: 4 },
    ])
    assert.equal(next.has('0:cota'), false)
    assert.equal(next.has('1:cota'), true)
  })
})
