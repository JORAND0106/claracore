/**
 * Resumen Cantidades: multi-Otros, unidades, descuento altura cruzado.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaCantidadesMultiOtros.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calcularPlanillaLocal,
  CAMPOS_DESCUENTO_ALTURA,
  esCodigoOtros,
} from './planillaTuberiaCalc.js'
import {
  normalizarCantidadesManuales,
  siguienteCodigoOtros,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Resumen Cantidades — multi Otros + unidades + Δ altura', () => {
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

  it('motor: múltiples OTROS independientes + unidad ml en TUB', () => {
    const calc = calcularPlanillaLocal({
      tipo: 'ALCANTARILLA',
      diametro_m: 0.9,
      espesor_m: 0.05,
      ancho_excavacion_m: 1.5,
      relacion_atraque: '1:3',
      cama_triturado_m: 0.1,
      filas_campo: [
        { orden: 1, abscisa: 0, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
        { orden: 2, abscisa: 20, terreno_natural: 100, subrasante_via: 99, cota_fondo_excavacion: 98 },
      ],
      cantidades_manuales: [
        { codigo: 'EXC_ROC', espesor: 0.4, descontar_de: 'prom_altura_excavacion' },
        { codigo: 'OTROS_1', nombre: 'A', long: 2, ancho: 1, espesor: 0.5 },
        { codigo: 'OTROS_2', nombre: 'B', long: 3, ancho: 1, espesor: 0.2, descontar_de: 'prom_altura_excavacion' },
      ],
    })
    assert.ok(calc)
    const tub = calc.netos.find((n) => n.codigo === 'TUB')
    assert.equal(tub.unidad, 'ml')
    const otros = calc.netos.filter((n) => esCodigoOtros(n.codigo))
    assert.equal(otros.length, 2)
    assert.equal(otros[0].neto, 1) // 2*1*0.5
    assert.equal(otros[1].neto, 0.6) // 3*1*0.2
    // h_exc bruto = 2.0; restas 0.4+0.2=0.6 → h_exc efectivo 1.4
    // EXC = L*B*h = 20*1.5*1.4 = 42
    const exc = calc.netos.find((n) => n.codigo === 'EXC')
    assert.ok(Math.abs(exc.neto - 42) < 0.02, `EXC neto=${exc.neto}`)
    assert.ok(calc.descuentos_altura.prom_altura_excavacion > 0.5)
    assert.ok(CAMPOS_DESCUENTO_ALTURA.length >= 3)
  })

  it('UI: Und., + Otros, Δ Altura y tipografía uniforme', () => {
    assert.match(formSrc, /Und\./)
    assert.match(formSrc, /\+ Otros/)
    assert.match(formSrc, /Δ Altura/)
    assert.match(formSrc, /agregarLineaOtros/)
    assert.match(formSrc, /CAMPOS_DESCUENTO_ALTURA/)
    assert.match(formSrc, /fontSize: 'var\(--cc-xs\)'/)
    assert.match(formSrc, /step="0\.0001"/)
  })

  it('motor test file accepts OTROS_1', () => {
    assert.ok(esCodigoOtros('OTROS_1'))
    assert.ok(esCodigoOtros('OTROS_2'))
    assert.equal(esCodigoOtros('EXC_ROC'), false)
  })
})
