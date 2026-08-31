/**
 * node --test frontend/src/informesSubAprobacionFiltro.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  soloAprobadosFromFiltro,
  qsSoloAprobadosSub,
  pathConFiltroSubAprobacion,
} from './informesSubAprobacionFiltro.js'

describe('informesSubAprobacionFiltro', () => {
  it('Aprobado (default) → solo_aprobados=true', () => {
    assert.equal(soloAprobadosFromFiltro('aprobado'), true)
    assert.equal(qsSoloAprobadosSub('aprobado'), '?solo_aprobados=true')
  })

  it('Todo → solo_aprobados=false', () => {
    assert.equal(soloAprobadosFromFiltro('todo'), false)
    assert.equal(qsSoloAprobadosSub('todo'), '?solo_aprobados=false')
  })

  it('pathConFiltroSubAprobacion conserva otros query params', () => {
    const p = pathConFiltroSubAprobacion(
      '/informes/1/pdf/memoria-item/9?item_numero=1.01',
      'todo',
    )
    assert.match(p, /solo_aprobados=false/)
    assert.match(p, /item_numero=1\.01/)
  })
})
