import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeActaEleccionAlRevalidar,
  sicoeActaLabel,
  sicoeNivelAsignaActaRpo,
} from './sicoeActaRevalidacion.js'

describe('sicoeActaRevalidacion', () => {
  it('no pregunta sin pre_reversion', () => {
    const r = sicoeActaEleccionAlRevalidar({
      registro: { acta_rpo_id: 1 },
      actasList: [{ id: 1, numero_rpo: 1, fecha_inicio: '2025-01-01', fecha_fin: '2025-01-31' }],
      actaVigente: { id: 2, numero_rpo: 2, fecha_inicio: '2025-02-01', fecha_fin: '2025-02-28' },
    })
    assert.equal(r.requerida, false)
  })

  it('no pregunta si original = vigente', () => {
    const r = sicoeActaEleccionAlRevalidar({
      registro: { acta_rpo_id: 5, acta_rpo_id_pre_reversion: 5 },
      actaVigente: { id: 5, numero_rpo: 5, fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31' },
    })
    assert.equal(r.requerida, false)
  })

  it('pregunta si original ≠ vigente', () => {
    const r = sicoeActaEleccionAlRevalidar({
      registro: { acta_rpo_id: 1, acta_rpo_id_pre_reversion: 1 },
      actasList: [
        { id: 1, numero_rpo: 1, fecha_inicio: '2025-01-01', fecha_fin: '2025-01-31' },
        { id: 2, numero_rpo: 2, fecha_inicio: '2025-02-01', fecha_fin: '2025-02-28' },
      ],
      actaVigente: { id: 2, numero_rpo: 2, fecha_inicio: '2025-02-01', fecha_fin: '2025-02-28' },
    })
    assert.equal(r.requerida, true)
    assert.equal(r.original.id, 1)
    assert.equal(r.vigente.id, 2)
    assert.match(sicoeActaLabel(r.original), /Acta RPO 1/)
  })

  it('nivel ≥ 2 asigna acta', () => {
    assert.equal(sicoeNivelAsignaActaRpo(1), false)
    assert.equal(sicoeNivelAsignaActaRpo(2), true)
    assert.equal(sicoeNivelAsignaActaRpo(4), true)
  })
})
