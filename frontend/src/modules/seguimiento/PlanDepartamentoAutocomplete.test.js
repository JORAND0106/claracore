/**
 * Smoke tests for Departamento autocomplete helpers (selection semantics).
 * Run: node --test frontend/src/modules/seguimiento/PlanDepartamentoAutocomplete.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/** Mirrors payload resolution used by PlanActividadFormModal. */
function resolveGrupoPayload({ grupoId, grupoNombre, grupoEsOtro, grupos }) {
  const payload = {}
  if (grupoEsOtro || !grupoId) {
    payload.grupo_nombre = String(grupoNombre || '').trim()
  } else {
    payload.grupo_id = Number(grupoId) || undefined
    const g = (grupos || []).find((x) => Number(x.id) === Number(grupoId))
    if (g) payload.grupo_nombre = g.nombre
    else if (grupoNombre) payload.grupo_nombre = String(grupoNombre).trim()
  }
  return payload
}

describe('Plan departamento autocomplete payload', () => {
  const grupos = [
    { id: 1, nombre: 'Obra' },
    { id: 2, nombre: 'Calidad' },
  ]

  it('elige departamento existente por id', () => {
    const p = resolveGrupoPayload({
      grupoId: 2,
      grupoNombre: 'Calidad',
      grupoEsOtro: false,
      grupos,
    })
    assert.equal(p.grupo_id, 2)
    assert.equal(p.grupo_nombre, 'Calidad')
  })

  it('opción Otro envía solo nombre nuevo', () => {
    const p = resolveGrupoPayload({
      grupoId: '',
      grupoNombre: 'SST nuevo',
      grupoEsOtro: true,
      grupos,
    })
    assert.equal(p.grupo_id, undefined)
    assert.equal(p.grupo_nombre, 'SST nuevo')
  })

  it('sin id ni nombre → payload vacío (validación UI)', () => {
    const p = resolveGrupoPayload({
      grupoId: '',
      grupoNombre: '  ',
      grupoEsOtro: true,
      grupos,
    })
    assert.equal(p.grupo_nombre, '')
  })
})
