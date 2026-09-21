/**
 * Ejecutar: node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaUtils.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CALC_CELL_BG,
  confirmarGuardadoCartera,
  payloadFilas,
  tieneDatosExportables,
  TIPOS_PLANILLA,
  RELACIONES_ATRAQUE,
  FILAS_INICIALES_CARTERA,
  CARTERA_ROW_SCALE,
  RESUMEN_ROW_SCALE,
  SECCION_GRAFICO_SCALE,
  SECCION_MAX_HEIGHT,
  filasDesdeApi,
  migrarFilasAlCambiarTipo,
} from './planillaTuberiaUtils.js'

describe('planillaTuberiaUtils', () => {
  it('filas iniciales = 2 y escalas de dimensión', () => {
    assert.equal(FILAS_INICIALES_CARTERA, 2)
    assert.equal(CARTERA_ROW_SCALE, 0.7)
    assert.equal(RESUMEN_ROW_SCALE, 0.5)
    assert.equal(SECCION_GRAFICO_SCALE, 1.6)
    assert.equal(SECCION_MAX_HEIGHT, 352)
    assert.equal(filasDesdeApi([], 'ALCANTARILLA').length, 2)
  })

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

  it('migrarFilasAlCambiarTipo copia nivel entre columnas', () => {
    const desdeAlc = migrarFilasAlCambiarTipo([
      { abscisa: '1', subrasante_via: '10.5', terminado_filtro: '' },
    ], 'FILTRO')
    assert.equal(desdeAlc[0].terminado_filtro, '10.5')
    const desdeFil = migrarFilasAlCambiarTipo([
      { abscisa: '1', subrasante_via: '', terminado_filtro: '11.2' },
    ], 'ALCANTARILLA')
    assert.equal(desdeFil[0].subrasante_via, '11.2')
  })

  it('tieneDatosExportables y fondo calculado #F2F2F2', () => {
    assert.equal(CALC_CELL_BG, '#F2F2F2')
    assert.equal(tieneDatosExportables([], null), false)
    assert.equal(tieneDatosExportables([
      { abscisa: '', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '' },
    ], {}), false)
    assert.equal(tieneDatosExportables([
      { abscisa: '0', terreno_natural: '', subrasante_via: '', terminado_filtro: '', cota_fondo_excavacion: '' },
    ], {}), true)
    assert.equal(tieneDatosExportables([], {
      calculo: { cartera: { filas: [{ orden: 1, vacio: false, abscisa: 1 }] } },
    }), true)
  })
})
