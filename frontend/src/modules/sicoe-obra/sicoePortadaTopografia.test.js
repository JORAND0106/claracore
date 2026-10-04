/**
 * Tests — topografía de portada: normalización y mensajes de error.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mensajeDesdeDetailApi,
  mensajeErrorGuardarTopografiaPortada,
  mensajeErrorRespuestaTopo,
  normalizarPuntoTopoPortada,
  normalizarPuntosTopoPortada,
  numeroTopoONull,
} from './sicoePortadaTopografia.js'

describe('sicoePortadaTopografia', () => {
  it('numeroTopoONull acepta coma decimal y vacíos', () => {
    assert.equal(numeroTopoONull(''), null)
    assert.equal(numeroTopoONull(null), null)
    assert.equal(numeroTopoONull('971988,373'), 971988.373)
    assert.equal(numeroTopoONull(10), 10)
    assert.equal(numeroTopoONull('x'), null)
  })

  it('normaliza puntos y descarta filas sin norte/este', () => {
    const list = normalizarPuntosTopoPortada([
      { id: 9, contrato_id: 1, norte: '100', este: '200', cota: '', descripcion: 'A', punto: '1' },
      { norte: '', este: '', cota: '5' },
      { norte: 1, este: 2, cota: '3.5', punto: 2 },
    ])
    assert.equal(list.length, 2)
    assert.deepEqual(list[0], {
      punto: '1',
      norte: 100,
      este: 200,
      cota: null,
      descripcion: 'A',
    })
    assert.equal(list[1].cota, 3.5)
    assert.equal(list[1].punto, '2')
    assert.equal(Object.prototype.hasOwnProperty.call(list[0], 'id'), false)
  })

  it('mensajeDesdeDetailApi nunca devuelve [object Object]', () => {
    const msg = mensajeDesdeDetailApi([
      {
        loc: ['body', 'puntos', 0, 'cota'],
        msg: 'Input should be a valid number, unable to parse string as a number',
        type: 'float_parsing',
      },
    ])
    assert.match(msg, /Cota/i)
    assert.match(msg, /número válido/i)
    assert.equal(msg.includes('[object Object]'), false)
    assert.equal(mensajeDesdeDetailApi({ a: 1 }, 'fallback'), 'fallback')
    assert.equal(
      mensajeErrorGuardarTopografiaPortada(new Error('[object Object]')),
      'No se pudo guardar la topografía.',
    )
  })

  it('mensajeErrorRespuestaTopo lee detail de Response', async () => {
    const res = {
      status: 422,
      text: async () => JSON.stringify({
        detail: [{ loc: ['body', 'puntos', 1, 'norte'], msg: 'Input should be a valid number' }],
      }),
    }
    const msg = await mensajeErrorRespuestaTopo(res)
    assert.match(msg, /fila 2/i)
    assert.match(msg, /Norte/i)
    assert.equal(msg.includes('[object Object]'), false)
  })

  it('normalizarPuntoTopoPortada exige norte o este', () => {
    assert.equal(normalizarPuntoTopoPortada({ cota: 1 }), null)
    assert.ok(normalizarPuntoTopoPortada({ norte: 1 }))
    assert.ok(normalizarPuntoTopoPortada({ este: 2 }))
  })
})
