import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeActaRpoNumeroCorto,
  sicoeLabelActaRpoRegistro,
} from './sicoeActaRegistroLabel.js'

describe('sicoeLabelActaRpoRegistro', () => {
  it('usa acta_rpo_numero del registro', () => {
    assert.equal(
      sicoeLabelActaRpoRegistro({ acta_rpo_id: 9, acta_rpo_numero: 75 }),
      'Acta RPO 75',
    )
  })

  it('Sin acta si no hay id', () => {
    assert.equal(sicoeLabelActaRpoRegistro({}), 'Sin acta')
    assert.equal(sicoeLabelActaRpoRegistro({ acta_rpo_id: null }), 'Sin acta')
  })

  it('resuelve número desde actasList', () => {
    assert.equal(
      sicoeLabelActaRpoRegistro(
        { acta_rpo_id: 12 },
        { actasList: [{ id: 12, numero_rpo: 88 }] },
      ),
      'Acta RPO 88',
    )
  })

  it('columna corta', () => {
    assert.equal(sicoeActaRpoNumeroCorto({ acta_rpo_numero: 75 }), '75')
    assert.equal(sicoeActaRpoNumeroCorto({}), '—')
  })
})
