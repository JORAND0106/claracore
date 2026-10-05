/**
 * Resumen Cantidades: multi-Otros, unidades, descuento de volumen cruzado.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCantidadesMultiOtros.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calcularPlanillaLocal,
  LINEAS_DESCUENTO_VOLUMEN,
  esCodigoOtros,
} from './planillaTuberiaCalc.js'
import {
  normalizarCantidadesManuales,
  siguienteCodigoOtros,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Resumen Cantidades — multi Otros + unidades + descuento volumen', () => {
  it('normalizarCantidadesManuales migra OTROS → OTROS_1 y garantiza EXC_ROC', () => {
    const n = normalizarCantidadesManuales([
      { codigo: 'OTROS', nombre: 'Imprevisto', espesor: 0.2 },
    ])
    assert.ok(n.some((c) => c.codigo === 'EXC_ROC'))
    assert.ok(n.some((c) => c.codigo === 'OTROS_1' && c.nombre === 'Imprevisto'))
    assert.ok(!n.some((c) => c.codigo === 'OTROS'))
  })

  it('siguienteCodigoOtros incrementa', () => {
    assert.equal(siguienteCodigoOtros([{ codigo: 'OTROS_1' }]), 'OTROS_2')
    assert.equal(siguienteCodigoOtros([{ codigo: 'OTROS_1' }, { codigo: 'OTROS_3' }]), 'OTROS_4')
  })

  it('motor: volumen propio (20 ml) se resta de EXC sin proporcionalizar el tramo', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.5,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.1,
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 100, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
      ],
      cantidades_manuales: [
        { codigo: 'EXC_ROC', long: 20, ancho: 1.5, espesor: 0.5, descontar_de: 'EXC' },
        { codigo: 'OTROS_1', nombre: 'A', long: 2, ancho: 1, espesor: 0.5 },
        { codigo: 'OTROS_2', nombre: 'B', long: 3, ancho: 1, espesor: 0.2, descontar_de: 'EXC' },
      ],
    })
    assert.ok(calc)
    const tub = calc.netos.find((n) => n.codigo === 'TUB')
    assert.equal(tub.unidad, 'ml')
    const otros = calc.netos.filter((n) => esCodigoOtros(n.codigo))
    assert.equal(otros.length, 2)
    assert.equal(otros[0].neto, 1) // 2*1*0.5
    assert.equal(otros[1].neto, 0.6) // 3*1*0.2
    const roc = calc.netos.find((n) => n.codigo === 'EXC_ROC')
    assert.equal(roc.neto, 15) // 20*1.5*0.5
    // EXC bruto = 100*1.5*2 = 300; desc = 15 + 0.6 = 15.6 → neto 284.4
    const exc = calc.netos.find((n) => n.codigo === 'EXC')
    assert.ok(Math.abs(exc.bruto - 300) < 0.02, `EXC bruto=${exc.bruto}`)
    assert.ok(Math.abs(exc.neto - 284.4) < 0.02, `EXC neto=${exc.neto}`)
    assert.ok(calc.descuentos_volumen.EXC > 15)
    assert.ok(LINEAS_DESCUENTO_VOLUMEN.length >= 3)
    assert.ok((calc.notas_descuento_volumen || []).some((n) => n.includes('Vol')))
  })

  it('UI: Und., + Otros, Descontar de y tipografía uniforme', () => {
    assert.match(formSrc, /Und\./)
    assert.match(formSrc, /\+ Otros/)
    assert.match(formSrc, /Descontar de/)
    assert.match(formSrc, /agregarLineaOtros/)
    assert.match(formSrc, /LINEAS_DESCUENTO_VOLUMEN/)
    assert.match(formSrc, /Notas de descuento de volumen/)
    assert.match(formSrc, /fontSize: 'var\(--cc-xs\)'/)
    assert.match(formSrc, /step="0\.0001"/)
  })

  it('motor test file accepts OTROS_1', () => {
    assert.ok(esCodigoOtros('OTROS_1'))
    assert.ok(esCodigoOtros('OTROS_2'))
    assert.equal(esCodigoOtros('EXC_ROC'), false)
  })
})
