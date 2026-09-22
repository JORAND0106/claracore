/**
 * Recuadros del desglose de atraque (solo presentación).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaAtraqueCards.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  desgloseAtraqueAlcantarilla,
  pasosDesgloseAtraque,
} from './planillaTuberiaUtils.js'
import { calcularPlanillaLocal } from './planillaTuberiaCalc.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Desglose atraque — recuadros por paso', () => {
  it('pasosDesgloseAtraque expone hatr, htrit, sección, A1 y A2', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.6,
      relacion_atraque: '1:2',
      cama_triturado_m: 0.15,
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 100, subrasante_via: 99, cota_lomo: 99, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 10, terreno_natural: 100, subrasante_via: 99, cota_lomo: 99, cota_fondo_excavacion: 98 },
      ],
    })
    const d = desgloseAtraqueAlcantarilla(calc.seccion)
    assert.ok(d)
    const pasos = pasosDesgloseAtraque(d)
    assert.deepEqual(pasos.map((p) => p.key), ['hatr', 'htrit', 'seccion', 'a1', 'a2'])
    assert.match(pasos[0].titulo, /h_atr/)
    assert.match(pasos[1].titulo, /h_trit/)
    assert.match(pasos[2].titulo, /h_trit×B/)
    assert.equal(pasos[3].titulo, 'A1')
    assert.equal(pasos[4].titulo, 'A2')
    assert.equal(pasos[0].unidad, 'm')
    assert.equal(pasos[2].unidad, 'm²')
  })

  it('UI renderiza fila de recuadros con scroll horizontal (sin cadena corrida)', () => {
    assert.match(formSrc, /pasosDesgloseAtraque\(desgloseAtraque\)/)
    assert.match(formSrc, /data-atraque-paso/)
    assert.match(formSrc, /overflowX:\s*'auto'/)
    assert.doesNotMatch(formSrc, /h<sub>atr<\/sub>\([^)]*\)=\s*\n/)
  })
})
