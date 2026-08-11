import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  pptoConcatenarObservacion,
  pptoContarIdsConHistorial,
  pptoTextoModoHistorial,
  pptoComentarioTipoLabel,
} from './pptoComentarioModo.js'

describe('pptoConcatenarObservacion', () => {
  it('usa solo el nuevo si no hay previo', () => {
    assert.equal(pptoConcatenarObservacion('', 'Nuevo'), 'Nuevo')
    assert.equal(pptoConcatenarObservacion('  ', 'Nuevo'), 'Nuevo')
  })

  it('concatena con salto de línea por defecto', () => {
    assert.equal(pptoConcatenarObservacion('Viejo', 'Nuevo'), 'Viejo\nNuevo')
  })
})

describe('pptoContarIdsConHistorial', () => {
  it('cuenta ids con count > 0', () => {
    assert.equal(
      pptoContarIdsConHistorial({ 1: { count: 2 }, 2: { count: 0 }, 3: 1 }, [1, 2, 3, 4]),
      2,
    )
  })
})

describe('pptoTextoModoHistorial', () => {
  it('texto singular y parcial en masivo', () => {
    assert.match(pptoTextoModoHistorial({ nConHistorial: 1, nTotal: 1 }), /Este registro/)
    assert.match(pptoTextoModoHistorial({ nConHistorial: 2, nTotal: 5 }), /2 de 5/)
    assert.match(pptoTextoModoHistorial({ nConHistorial: 3, nTotal: 3 }), /Los 3 registros/)
  })
})

describe('pptoComentarioTipoLabel', () => {
  it('etiqueta conocida y fallback', () => {
    assert.equal(pptoComentarioTipoLabel('validacion'), 'validación')
    assert.equal(pptoComentarioTipoLabel('otro'), 'comentario')
  })
})
