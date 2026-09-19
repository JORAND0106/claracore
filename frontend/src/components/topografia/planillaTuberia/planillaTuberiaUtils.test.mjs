/**
 * Ejecutar: node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaUtils.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  confirmarGuardadoCartera,
  payloadFilas,
  TIPOS_PLANILLA,
  RELACIONES_ATRAQUE,
} from './planillaTuberiaUtils.js'

describe('planillaTuberiaUtils', () => {
  it('tipos y relaciones de atraque', () => {
    assert.deepEqual(TIPOS_PLANILLA.map((t) => t.value), ['ALCANTARILLA', 'FILTRO'])
    assert.deepEqual(RELACIONES_ATRAQUE, ['1:1', '1:2', '1:3', '1:4', '1:6'])
  })

  it('confirmarGuardadoCartera exige verified + count', () => {
    assert.equal(confirmarGuardadoCartera(null, 2).ok, false)
    assert.equal(confirmarGuardadoCartera({ verified: false, count: 2 }, 2).ok, false)
    assert.equal(confirmarGuardadoCartera({ verified: true, count: 1 }, 2).ok, false)
    const ok = confirmarGuardadoCartera({ verified: true, count: 3, version: 5 }, 3)
    assert.equal(ok.ok, true)
    assert.equal(ok.version, 5)
  })

  it('payloadFilas filtra vacías y mapea nivel por tipo', () => {
    const filas = [
      { abscisa: '10', terreno_natural: '100', subrasante_via: '99', terminado_filtro: '', cota_fondo_excavacion: '98', norte: '', este: '', observacion: '' },
      { abscisa: '', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '', norte: '', este: '', observacion: '' },
    ]
    const alc = payloadFilas(filas, 'ALCANTARILLA')
    assert.equal(alc.length, 1)
    assert.equal(alc[0].subrasante_via, 99)
    assert.equal(alc[0].terminado_filtro, null)
    const fil = payloadFilas([
      { abscisa: '10', terreno_natural: '100', subrasante_via: '', terminado_filtro: '99.5', cota_fondo_excavacion: '98', norte: '', este: '', observacion: '' },
    ], 'FILTRO')
    assert.equal(fil[0].terminado_filtro, 99.5)
    assert.equal(fil[0].subrasante_via, null)
  })
})
