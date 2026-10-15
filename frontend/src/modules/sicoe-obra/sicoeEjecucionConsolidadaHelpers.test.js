import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeClaveItemEjecucion,
  sicoeConstruirArbolEjecucion,
  sicoeContarValidacionItem,
  sicoeFilasExcelEjecucion,
  sicoeRegistroCostoEfectivo,
} from './sicoeEjecucionConsolidadaHelpers.js'

describe('sicoeEjecucionConsolidadaHelpers', () => {
  it('mismo ítem en capítulos distintos queda separado', () => {
    const regs = [
      {
        id: 1,
        tramo: 'T1',
        capitulo: 'A',
        item_numero: '1.01',
        item_descripcion: 'Excavación',
        unidad: 'm3',
        cantidad_total: 10,
        vlr_unitario_listado: 1000,
        nivel1_estado: 'Aprobado',
        nivel2_estado: 'Aprobado',
        nivel3_estado: 'No Revisado',
        numero_reporte: 1,
        numero_registro: 1,
      },
      {
        id: 2,
        tramo: 'T1',
        capitulo: 'B',
        item_numero: '1.01',
        item_descripcion: 'Excavación B',
        unidad: 'm3',
        cantidad_total: 5,
        vlr_unitario_listado: 2000,
        nivel1_estado: 'Aprobado',
        nivel2_estado: 'Pendiente',
        nivel3_estado: 'No Revisado',
        numero_reporte: 1,
        numero_registro: 2,
      },
    ]
    const arbol = sicoeConstruirArbolEjecucion(regs, { nivelesActivos: [1, 2, 3] })
    assert.equal(arbol.tramos.length, 1)
    assert.equal(arbol.tramos[0].capitulos.length, 2)
    const capA = arbol.tramos[0].capitulos.find((c) => c.capitulo === 'A')
    const capB = arbol.tramos[0].capitulos.find((c) => c.capitulo === 'B')
    assert.equal(capA.items[0].vlr_unitario, 1000)
    assert.equal(capA.items[0].costo, 10000)
    assert.equal(capB.items[0].vlr_unitario, 2000)
    assert.equal(capB.items[0].costo, 10000)
    assert.equal(arbol.totalCosto, 20000)
  })

  it('subtotales de tramo suman capítulos', () => {
    const regs = [
      {
        id: 1, tramo: 'Norte', capitulo: 'I', item_numero: '2.1',
        cantidad_total: 2, vlr_unitario_listado: 500, unidad: 'm',
      },
      {
        id: 2, tramo: 'Norte', capitulo: 'II', item_numero: '3.1',
        cantidad_total: 3, vlr_unitario_listado: 100, unidad: 'm',
      },
    ]
    const arbol = sicoeConstruirArbolEjecucion(regs)
    assert.equal(arbol.tramos[0].costo, 1000 + 300)
    assert.equal(arbol.tramos[0].cantidad, 5)
  })

  it('conteo de validación por estado+nivel', () => {
    const regs = [
      { nivel1_estado: 'Aprobado', nivel2_estado: 'Aprobado', nivel3_estado: 'Aprobado' },
      { nivel1_estado: 'Aprobado', nivel2_estado: 'Pendiente', nivel3_estado: 'No Revisado' },
      { nivel1_estado: 'Aprobado', nivel2_estado: 'Pendiente', nivel3_estado: 'No Revisado' },
    ]
    const c = sicoeContarValidacionItem(regs, [1, 2, 3])
    assert.equal(c.total, 3)
    const pend = c.chips.find((x) => x.estado === 'Pendiente')
    assert.equal(pend.count, 2)
    assert.equal(pend.nivel, 2)
  })

  it('costo efectivo usa VU listado', () => {
    const { costo, cant, vu } = sicoeRegistroCostoEfectivo({
      cantidad_total: 10.555,
      vlr_unitario_listado: 1000,
    })
    assert.equal(vu, 1000)
    assert.equal(cant, 10.555)
    assert.equal(costo, 10560)
  })

  it('clave ítem distingue tramo+capítulo+código', () => {
    assert.notEqual(
      sicoeClaveItemEjecucion({ tramo: 'A', capitulo: '1', item_numero: '2.1' }),
      sicoeClaveItemEjecucion({ tramo: 'A', capitulo: '2', item_numero: '2.1' }),
    )
  })

  it('filas excel incluyen total y niveles', () => {
    const arbol = sicoeConstruirArbolEjecucion([
      {
        id: 1, tramo: 'T', capitulo: 'C', item_numero: '1',
        cantidad_total: 1, vlr_unitario_listado: 10,
        numero_reporte: 9, numero_registro: 3,
        nivel1_estado: 'Aprobado',
      },
    ])
    const { headers, rows } = sicoeFilasExcelEjecucion(arbol, { verEco: true, incluirRegistros: true })
    assert.ok(headers.includes('Costo Directo'))
    assert.equal(rows[0][0], 'Tramo')
    assert.equal(rows[rows.length - 1][0], 'TOTAL')
    assert.ok(rows.some((r) => r[0] === 'Registro'))
  })
})
