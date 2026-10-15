import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoePortadaEditDraftSave,
  sicoePortadaEditDraftLoad,
  sicoePortadaEditDraftClear,
  sicoePortadaEditDraftKey,
} from './sicoePortadaEditDraft.js'

describe('sicoePortadaEditDraft', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* noop */ }
  })

  it('guarda y recupera borrador de portada', () => {
    sicoePortadaEditDraftSave(1, 26, {
      editDesc: 'Demo',
      locPortada: { absInicio: 10, absFinal: 20 },
    })
    const d = sicoePortadaEditDraftLoad(1, 26)
    assert.equal(d.editDesc, 'Demo')
    assert.equal(d.locPortada.absFinal, 20)
    assert.ok(d.savedAt)
    assert.equal(sicoePortadaEditDraftKey(1, 26).includes('26'), true)
  })

  it('limpia borrador', () => {
    sicoePortadaEditDraftSave(1, 26, { editDesc: 'x' })
    sicoePortadaEditDraftClear(1, 26)
    assert.equal(sicoePortadaEditDraftLoad(1, 26), null)
  })
})
