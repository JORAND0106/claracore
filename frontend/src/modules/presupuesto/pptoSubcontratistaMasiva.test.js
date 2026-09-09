import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PPTO_TRAMOS_COMPETENCIA_AYUDA,
  pptoLabelSubcontratista,
  pptoNormalizarSubcontratistasOpciones,
} from './pptoSubcontratistaMasiva.js'

describe('pptoSubcontratistaMasiva', () => {
  it('tooltip Tramos tiene el texto esperado', () => {
    assert.match(PPTO_TRAMOS_COMPETENCIA_AYUDA, /competencia por tramo/i)
    assert.match(PPTO_TRAMOS_COMPETENCIA_AYUDA, /heredarán automáticamente/i)
  })

  it('normaliza activos y descarta inactivos / duplicados', () => {
    const opts = pptoNormalizarSubcontratistasOpciones([
      { id: 2, razon_social: 'Beta', activo: true },
      { id: 1, nombre: 'Alfa', activo: true },
      { id: 3, razon_social: 'Gamma', activo: false },
      { id: 1, razon_social: 'Alfa dup' },
      { id: null },
    ])
    assert.deepEqual(opts.map((o) => o.id), [1, 2])
    assert.equal(opts[0].label, 'Alfa')
    assert.equal(opts[1].label, 'Beta')
  })

  it('label de subcontratista', () => {
    const opts = [{ id: 9, label: 'ROCERIA' }]
    assert.equal(pptoLabelSubcontratista(9, opts), 'ROCERIA')
    assert.equal(pptoLabelSubcontratista(null, opts), '—')
    assert.equal(pptoLabelSubcontratista(3, opts), '#3')
  })
})
