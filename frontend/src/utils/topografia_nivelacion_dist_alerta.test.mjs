/**
 * Distancia > 50 m: solo advertencia visual, no bloqueo.
 *
 * node --test frontend/src/utils/topografia_nivelacion_dist_alerta.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DIST_MAX_VISUAL_ALERT_M,
  calcularVistaNivelacion,
  distanciaExcedeAlerta,
} from './topografia_nivelacion.js'

describe('alerta visual distancia > 50 m', () => {
  it('distanciaExcedeAlerta solo por encima del umbral', () => {
    assert.equal(DIST_MAX_VISUAL_ALERT_M, 50)
    assert.equal(distanciaExcedeAlerta(50), false)
    assert.equal(distanciaExcedeAlerta(50.01), true)
    assert.equal(distanciaExcedeAlerta(58.7), true)
    assert.equal(distanciaExcedeAlerta(null), false)
  })

  it('calcularVistaNivelacion avisa pero no falla con Dist V− > 50', () => {
    const filas = [
      {
        nombre_punto: 'GPS 1',
        tipo_punto: 'BM',
        abscisa: '0',
        ubicacion_pk_id: 'pk',
        descripcion_punto: 'ini',
        vplus: { hS: '', hM: '', hI: '', lectura: '1.500' },
        dist_vplus_m: '40',
        vi: { hS: '', hM: '', hI: '', lectura: '' },
        vminus: { hS: '', hM: '', hI: '', lectura: '' },
      },
      {
        nombre_punto: 'C#Delta_3',
        tipo_punto: 'cambio',
        abscisa: '60',
        ubicacion_pk_id: 'pk2',
        descripcion_punto: 'delta',
        vplus: { hS: '', hM: '', hI: '', lectura: '' },
        vi: { hS: '', hM: '', hI: '', lectura: '' },
        vminus: { hS: '', hM: '', hI: '', lectura: '1.200' },
        dist_vminus_m: '58.70',
      },
    ]
    const vista = calcularVistaNivelacion(filas, 'electronico', { 'GPS 1': 100 }, { distMax: 50 })
    assert.ok(vista.filasVista.length >= 2)
    assert.ok(vista.avisos.some((a) => /58\.70|V−/.test(a)))
    assert.ok(distanciaExcedeAlerta(vista.filasVista[1].distancia_vminus_calc))
    // Cotas calculadas a pesar de la distancia excedida
    assert.ok(vista.filasVista[1].cota != null)
  })
})
