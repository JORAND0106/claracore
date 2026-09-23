/**
 * Descuentos Específicos: multi-Otros (mismo patrón que Resumen de Cantidades).
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaDescuentosMultiOtros.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calcularPlanillaLocal,
  esCodigoDescOtros,
} from './planillaTuberiaCalc.js'
import {
  normalizarDescuentosManuales,
  siguienteCodigoDescOtros,
} from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Descuentos Específicos — multi Otros', () => {
  it('normalizarDescuentosManuales migra DESC_OTROS → DESC_OTROS_1', () => {
    const n = normalizarDescuentosManuales([
      { codigo: 'DESC_OTROS', nombre: 'Pozo', espesor: 0.2 },
      { codigo: 'DESC_A1', cantidad: 9 },
    ])
    assert.ok(n.some((c) => c.codigo === 'DESC_OTROS_1' && c.nombre === 'Pozo'))
    assert.ok(!n.some((c) => c.codigo === 'DESC_OTROS'))
    assert.ok(!n.some((c) => c.codigo === 'DESC_A1'))
  })

  it('siguienteCodigoDescOtros incrementa', () => {
    assert.equal(siguienteCodigoDescOtros([{ codigo: 'DESC_OTROS_1' }]), 'DESC_OTROS_2')
    assert.equal(
      siguienteCodigoDescOtros([{ codigo: 'DESC_OTROS_1' }, { codigo: 'DESC_OTROS_3' }]),
      'DESC_OTROS_4',
    )
  })

  it('motor: múltiples DESC_OTROS independientes restan de EXC', () => {
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
      descuentos_manuales: [
        { codigo: 'DESC_OTROS_1', nombre: 'A', long: 2, ancho: 1, espesor: 0.5 },
        { codigo: 'DESC_OTROS_2', nombre: 'B', long: 3, ancho: 1, espesor: 0.2 },
      ],
    })
    assert.ok(calc)
    const otros = (calc.descuentos || []).filter((d) => esCodigoDescOtros(d.codigo))
    assert.equal(otros.length, 2)
    assert.equal(otros[0].cantidad, 1) // 2*1*0.5
    assert.equal(otros[1].cantidad, 0.6) // 3*1*0.2
    assert.equal(otros[0].nombre, 'Otros: A')
    assert.ok(otros[0].editable_dims && otros[0].editable_nombre)
    const exc = calc.netos.find((n) => n.codigo === 'EXC')
    assert.ok(Math.abs(exc.descuentos - 1.6) < 0.02, `EXC descuentos=${exc.descuentos}`)
    assert.ok(Math.abs(exc.neto - (exc.bruto - 1.6)) < 0.02)
  })

  it('UI: + Otros en Descuentos, agregarLineaDescOtros, dims editables', () => {
    assert.match(formSrc, /agregarLineaDescOtros/)
    assert.match(formSrc, /eliminarLineaDescOtros/)
    assert.match(formSrc, /setOverrideDescuento/)
    assert.match(formSrc, /normalizarDescuentosManuales/)
    assert.match(formSrc, /siguienteCodigoDescOtros/)
    // Dos botones + Otros (cantidades + descuentos)
    const matches = formSrc.match(/\+ Otros/g) || []
    assert.ok(matches.length >= 2, `esperado ≥2 botones + Otros, hay ${matches.length}`)
  })

  it('esCodigoDescOtros reconoce multi', () => {
    assert.ok(esCodigoDescOtros('DESC_OTROS'))
    assert.ok(esCodigoDescOtros('DESC_OTROS_1'))
    assert.ok(esCodigoDescOtros('DESC_OTROS_2'))
    assert.equal(esCodigoDescOtros('DESC_A1'), false)
    assert.equal(esCodigoDescOtros('OTROS_1'), false)
  })
})
