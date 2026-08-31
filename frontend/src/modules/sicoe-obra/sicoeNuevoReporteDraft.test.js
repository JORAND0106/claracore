import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeNuevoReporteDraftClear,
  sicoeNuevoReporteDraftIsDirty,
  sicoeNuevoReporteDraftKey,
  sicoeNuevoReporteDraftLoad,
  sicoeNuevoReporteDraftSave,
} from './sicoeNuevoReporteDraft.js'

describe('sicoeNuevoReporteDraft', () => {
  it('key estable por contrato/usuario/reporte', () => {
    assert.equal(
      sicoeNuevoReporteDraftKey(2, 9, null),
      'cc_sicoe_nuevo_reporte_draft_v1:2:9:nuevo',
    )
    assert.equal(
      sicoeNuevoReporteDraftKey(2, 9, 55),
      'cc_sicoe_nuevo_reporte_draft_v1:2:9:55',
    )
  })

  it('detecta dirty solo con datos reales', () => {
    assert.equal(sicoeNuevoReporteDraftIsDirty({}), false)
    assert.equal(sicoeNuevoReporteDraftIsDirty({ descripcion: '  ' }), false)
    assert.equal(sicoeNuevoReporteDraftIsDirty({ descripcion: 'Obra' }), true)
    assert.equal(sicoeNuevoReporteDraftIsDirty({ registros: [{ nombre: 'a' }] }), true)
  })

  it('guarda y recupera borrador en localStorage', () => {
    const store = new Map()
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
    }
    const snap = { descripcion: 'Prueba campo', registros: [{ nombre: 'R1' }] }
    assert.equal(sicoeNuevoReporteDraftSave(1, 7, snap), true)
    const loaded = sicoeNuevoReporteDraftLoad(1, 7)
    assert.equal(loaded.descripcion, 'Prueba campo')
    assert.equal(loaded.registros.length, 1)
    sicoeNuevoReporteDraftClear(1, 7)
    assert.equal(sicoeNuevoReporteDraftLoad(1, 7), null)
  })
})
