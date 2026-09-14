/**
 * Eje X del perfil = distancia acumulada (no PK/abscisa de plataforma).
 *
 * node --test frontend/src/utils/topografia_nivelacion_perfil.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { puntosPerfilNivelacion } from './topografia_nivelacion.js'

describe('puntosPerfilNivelacion — distancia acumulada', () => {
  it('ignora PK/abscisa de cartera y acumula V+(origen)+V−(destino)', () => {
    // Circuito tipo: GPS1 → C#1 → Aux_1 → C#Delta_3
    const filas = [
      {
        nombre_punto: 'GPS 1',
        abscisa: '525250', // PK_ID engañoso
        ubicacion_pk: '525250',
        cota: 100.0,
        distancia_vplus_calc: 40,
        distancia_vminus_calc: null,
      },
      {
        nombre_punto: 'C#1',
        abscisa: '525100', // PK menor → antes generaba retroceso
        cota: 100.2,
        distancia_vplus_calc: 35,
        distancia_vminus_calc: 40,
      },
      {
        nombre_punto: 'Aux_1',
        abscisa: '900000',
        cota: 100.1,
        distancia_vplus_calc: null,
        distancia_vminus_calc: null,
      },
      {
        nombre_punto: 'C#Delta_3',
        abscisa: '10',
        cota: 99.9,
        distancia_vplus_calc: null,
        distancia_vminus_calc: 30,
      },
    ]

    const pts = puntosPerfilNivelacion(filas)
    assert.equal(pts.length, 4)
    assert.deepEqual(
      pts.map((p) => p.nombre),
      ['GPS 1', 'C#1', 'Aux_1', 'C#Delta_3'],
    )
    // GPS1 en 0
    assert.equal(pts[0].abscisa, 0)
    // C#1 = 0 + V+(GPS1) + V−(C#1) = 40 + 40
    assert.equal(pts[1].abscisa, 80)
    // Aux = 80 + V+(C#1) + V−(Aux) = 80 + 35 + 0
    assert.equal(pts[2].abscisa, 115)
    // Delta = 115 + V+(Aux)=0 + V−(Delta)=30 → 145
    assert.equal(pts[3].abscisa, 145)

    // Monótono no decreciente (sin cruces/retrocesos por PK)
    for (let i = 1; i < pts.length; i += 1) {
      assert.ok(pts[i].abscisa >= pts[i - 1].abscisa)
    }
  })

  it('no usa abscisa aunque sea el único dato numérico disponible', () => {
    const pts = puntosPerfilNivelacion([
      { nombre_punto: 'A', abscisa: '1000', cota: 10, distancia_vplus_calc: 10 },
      { nombre_punto: 'B', abscisa: '50', cota: 11, distancia_vminus_calc: 10 },
    ])
    assert.equal(pts[0].abscisa, 0)
    assert.equal(pts[1].abscisa, 20)
  })
})
