/**
 * Apertura de circuito + diagnóstico de hilos S/M/I.
 * node --test frontend/src/utils/topografia_nivelacion_apertura.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  diagnosticoHilosIncongruentes,
  hilosIncongruentes,
  modoAperturaNivelacion,
  primeraVueltaCompleta,
  puedeAbrirCircuito,
  puedeAgregarFila,
  validarCarteraNivelacion,
} from './topografia_nivelacion.js'

function fila({ nombre = 'P1', tipo = 'estacion', vplus = null, vminus = null, vi = null } = {}) {
  return {
    nombre_punto: nombre,
    tipo_punto: tipo,
    abscisa: '0',
    descripcion_punto: 'desc',
    vplus: vplus || { hS: '', hM: '', hI: '', lectura: '' },
    vi: vi || { hS: '', hM: '', hI: '', lectura: '' },
    vminus: vminus || { hS: '', hM: '', hI: '', lectura: '' },
    es_fila_cierre: false,
  }
}

describe('diagnosticoHilosIncongruentes', () => {
  it('detecta separación desigual', () => {
    const d = diagnosticoHilosIncongruentes({ hS: 1.5, hM: 1.2, hI: 0.8 }, 'automatico')
    assert.ok(d)
    assert.match(d.msg, /Separación|Hilos inconsistentes/)
    assert.equal(hilosIncongruentes({ hS: 1.5, hM: 1.2, hI: 0.8 }, 'automatico'), true)
  })

  it('detecta HM fuera de rango HS–HI', () => {
    const d = diagnosticoHilosIncongruentes({ hS: 1.0, hM: 1.5, hI: 0.8 }, 'automatico')
    assert.ok(d)
    assert.match(d.msg, /medio|inconsistentes/i)
  })

  it('acepta hilos congruentes', () => {
    assert.equal(diagnosticoHilosIncongruentes({ hS: 1.2, hM: 1.0, hI: 0.8 }, 'automatico'), null)
    assert.equal(hilosIncongruentes({ hS: 1.2, hM: 1.0, hI: 0.8 }, 'automatico'), false)
  })
})

describe('modoAperturaNivelacion', () => {
  it('sin circuito_abierto_at está en apertura', () => {
    assert.equal(modoAperturaNivelacion([], 'electronico', {}), true)
    assert.equal(modoAperturaNivelacion([], 'electronico', { circuito_abierto_at: null }), true)
  })

  it('abierto sin primera vuelta sigue en apertura', () => {
    const filas = [
      fila({
        nombre: 'BM1',
        tipo: 'BM',
        vplus: { hS: '', hM: '1.0', hI: '', lectura: '' },
      }),
    ]
    assert.equal(primeraVueltaCompleta(filas, 'electronico'), false)
    assert.equal(
      modoAperturaNivelacion(filas, 'electronico', { circuito_abierto_at: '2026-01-01' }),
      true,
    )
  })

  it('abierto con V+ BM y V− siguiente sale de apertura', () => {
    const filas = [
      fila({
        nombre: 'BM1',
        tipo: 'BM',
        vplus: { hS: '', hM: '1.0', hI: '', lectura: '' },
      }),
      fila({
        nombre: 'P2',
        vminus: { hS: '', hM: '0.9', hI: '', lectura: '' },
      }),
    ]
    assert.equal(primeraVueltaCompleta(filas, 'electronico'), true)
    assert.equal(
      modoAperturaNivelacion(filas, 'electronico', { circuito_abierto_at: '2026-01-01' }),
      false,
    )
  })
})

describe('puedeAgregarFila en apertura', () => {
  it('permite +Fila con solo V+ en BM', () => {
    const filas = [
      fila({
        nombre: 'BM1',
        tipo: 'BM',
        vplus: { hS: '', hM: '1.0', hI: '', lectura: '' },
      }),
    ]
    const r = puedeAgregarFila(filas, 'electronico', 'BM1', { modoApertura: true })
    assert.equal(r.ok, true)
  })

  it('bloquea V+ sin vista cuando ya no es apertura', () => {
    const filas = [
      fila({
        nombre: 'BM1',
        tipo: 'BM',
        vplus: { hS: '', hM: '1.0', hI: '', lectura: '' },
      }),
      fila({
        nombre: 'P2',
        vplus: { hS: '', hM: '0.8', hI: '', lectura: '' },
      }),
    ]
    const r = puedeAgregarFila(filas, 'electronico', 'BM1', { modoApertura: false })
    assert.equal(r.ok, false)
  })
})

describe('validarCarteraNivelacion apertura', () => {
  it('permite BM V+ y V− en otra fila en apertura', () => {
    const filas = [
      fila({
        nombre: 'BM1',
        tipo: 'BM',
        vplus: { hS: '', hM: '1.0', hI: '', lectura: '' },
      }),
      fila({
        nombre: 'P2',
        vminus: { hS: '', hM: '0.9', hI: '', lectura: '' },
      }),
    ]
    const err = validarCarteraNivelacion(filas, 'electronico', 'BM1', { modoApertura: true })
    assert.deepEqual(err, [])
  })
})

describe('puedeAbrirCircuito', () => {
  it('exige BM inicial', () => {
    assert.equal(puedeAbrirCircuito({}, {}).ok, false)
    assert.equal(puedeAbrirCircuito({}, { bm_inicial_id: 'x' }).ok, true)
    assert.equal(puedeAbrirCircuito({ circuito_abierto_at: 't' }, { bm_inicial_id: 'x' }).ok, false)
  })
})
