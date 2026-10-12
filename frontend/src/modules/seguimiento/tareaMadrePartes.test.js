import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  esMadreConPartes,
  esParte,
  fmtNota,
  partesDe,
  resumenAvancePartes,
} from './tareaMadrePartes.js'

describe('tareaMadrePartes', () => {
  it('detecta madre y parte', () => {
    assert.equal(esParte({ padre_id: 3 }), true)
    assert.equal(esMadreConPartes({ id: 1, partes: [{ id: 2 }] }), true)
    assert.equal(esMadreConPartes({ id: 1, partes: [] }), false)
    assert.equal(partesDe({ partes: [{ id: 9 }] }).length, 1)
  })

  it('resume avance de partes', () => {
    const r = resumenAvancePartes([
      { estado_gestion: 'cumplido' },
      { estado_gestion: 'abierto' },
      { estado_gestion: 'vencido' },
      { estado_gestion: 'en_progreso' },
      { estado_gestion: 'cancelado' },
    ])
    assert.equal(r.cumplidas, 1)
    assert.equal(r.pendientes, 1)
    assert.equal(r.vencidas, 1)
    assert.equal(r.en_curso, 1)
    assert.equal(r.canceladas, 1)
    assert.equal(r.avance_pct, 25)
  })

  it('formatea nota', () => {
    assert.equal(fmtNota(100), '100%')
    assert.equal(fmtNota(60.4), '60%')
    assert.equal(fmtNota(null), null)
  })
})
