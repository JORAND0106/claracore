import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { debeMostrarChecklist, puedeExpandirChecklist } from './tareaExcelLayout.js'

describe('tareaExcelLayout expand', () => {
  it('en vista solo permite expandir si hay ítems o se puede editar', () => {
    assert.equal(puedeExpandirChecklist({ mode: 'view', checklistLength: 0, checklistDisabled: true }), false)
    assert.equal(puedeExpandirChecklist({ mode: 'view', checklistLength: 2, checklistDisabled: true }), true)
    assert.equal(puedeExpandirChecklist({ mode: 'view', checklistLength: 0, checklistDisabled: false }), true)
  })

  it('en creación siempre permite expandir', () => {
    assert.equal(puedeExpandirChecklist({ mode: 'create', checklistLength: 0, checklistDisabled: false }), true)
  })

  it('muestra checklist solo si expanded y canExpand', () => {
    assert.equal(debeMostrarChecklist({ mode: 'view', expanded: true, checklistLength: 1 }), true)
    assert.equal(debeMostrarChecklist({ mode: 'view', expanded: false, checklistLength: 1 }), false)
    assert.equal(debeMostrarChecklist({
      mode: 'view', expanded: true, checklistLength: 0, checklistDisabled: true,
    }), false)
  })
})
