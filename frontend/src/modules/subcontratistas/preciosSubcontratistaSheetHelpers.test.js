import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildBulkPayload,
  filterListadoItems,
  hasInvalidDrafts,
  isDraftIncomplete,
  parseNum,
  uniqueCapitulos,
} from './preciosSubcontratistaSheetHelpers.js'

describe('preciosSubcontratistaSheetHelpers', () => {
  it('parseNum acepta coma decimal', () => {
    assert.equal(parseNum('12,5'), 12.5)
    assert.equal(parseNum(''), null)
  })

  it('uniqueCapitulos ordena y deduplica', () => {
    assert.deepEqual(
      uniqueCapitulos([
        { capitulo: 'B' },
        { capitulo: 'A' },
        { capitulo: 'B' },
        { capitulo: '' },
      ]),
      ['A', 'B'],
    )
  })

  it('filterListadoItems excluye ya usados y filtra por capítulo/query', () => {
    const listado = [
      { id: 1, capitulo: '4', item_numero: '4.1', descripcion: 'Marca' },
      { id: 2, capitulo: '4', item_numero: '4.2', descripcion: 'Señal' },
      { id: 3, capitulo: '5', item_numero: '5.1', descripcion: 'Otro' },
    ]
    const out = filterListadoItems(listado, { capitulo: '4', query: 'señ', excludeLpIds: [1] })
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 2)
  })

  it('buildBulkPayload incluye cantidad_manual solo en filas manuales', () => {
    const rows = [
      { listado_precio_id: 1, origen: 'presupuesto', vu_costo_mo: 10, cantidad: 5 },
      { listado_precio_id: 2, origen: 'manual', vu_costo_mo: 8, cantidad: 3, _draftKey: 'd1' },
    ]
    const drafts = {
      'lp-1': { vu_costo: '11' },
      d1: { vu_costo: '9', cantidad: '4' },
    }
    const out = buildBulkPayload(rows, drafts)
    assert.deepEqual(out, [
      { listado_precio_id: 1, precio_unitario_sub: 11, origen: 'presupuesto' },
      { listado_precio_id: 2, precio_unitario_sub: 9, origen: 'manual', cantidad_manual: 4 },
    ])
  })

  it('isDraftIncomplete y hasInvalidDrafts', () => {
    assert.equal(isDraftIncomplete({ listado_precio_id: 1 }, { vu_costo: '1', cantidad: '2' }), false)
    assert.equal(isDraftIncomplete({ listado_precio_id: null }, { vu_costo: '1', cantidad: '2' }), true)
    assert.equal(
      hasInvalidDrafts(
        [{ listado_precio_id: 1, origen: 'presupuesto' }],
        { 'lp-1': { vu_costo: '-1' } },
      ),
      true,
    )
  })
})
