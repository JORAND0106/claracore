/**
 * Node tests — agrupación RRHH por contratista.
 * Run: node --test src/modules/rrhh/rrhhCicloLogic.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorEmpresa, CLAUSULA_LEY_1581 } from './rrhhCicloLogic.js'

describe('rrhhCicloLogic', () => {
  it('incluye cláusula Ley 1581 de 2012', () => {
    assert.match(CLAUSULA_LEY_1581, /Ley 1581 de 2012/)
    assert.match(CLAUSULA_LEY_1581, /datos personales/)
  })

  it('expone periodicidades de renovación alineadas al backend', async () => {
    const { PERIODICIDAD_RENOVACION_OPTS } = await import('./rrhhCicloLogic.js')
    assert.deepEqual(
      PERIODICIDAD_RENOVACION_OPTS.map((o) => o.value),
      ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'],
    )
  })

  it('agrupa consorcio y subcontratista y oculta nómina sin salario', () => {
    const rows = [
      { id: 1, empresa_tipo: 'consorcio', empresa_nombre: 'Consorcio X', cargo_aspira: 'Oficial', estado: 'activo', salario: 2000000 },
      { id: 2, empresa_tipo: 'subcontratista', empresa_nombre: 'Sub A', empresa_subcontratista_id: 9, cargo_aspira: 'Ayudante', estado: 'retirado', salario: 1500000 },
    ]
    const visible = agruparPorEmpresa(rows, { verSalario: true })
    assert.equal(visible[0].empresa_key, 'consorcio')
    assert.equal(visible[0].total_nomina, 2000000)
    const hidden = agruparPorEmpresa(rows, { verSalario: false })
    assert.equal(hidden[0].total_nomina, null)
  })

  it('suma nómina parseando salario formateado sin NaN', () => {
    const rows = [
      { id: 1, empresa_tipo: 'consorcio', empresa_nombre: 'C', cargo_aspira: 'A', estado: 'activo', salario: '$ 2.500.000' },
      { id: 2, empresa_tipo: 'consorcio', empresa_nombre: 'C', cargo_aspira: 'A', estado: 'activo', salario: null },
    ]
    const g = agruparPorEmpresa(rows, { verSalario: true })
    assert.equal(g[0].total_nomina, 2500000)
  })
})
