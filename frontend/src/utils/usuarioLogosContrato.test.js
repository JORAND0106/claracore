import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { logosDesdeContratosActivo } from './usuarioLogosContrato.js'

describe('logosDesdeContratosActivo', () => {
  it('toma logos del contrato activo aunque la sesión tenga valores viejos', () => {
    const prev = {
      contrato_id: 7,
      logo_contratista: 'data:old-c',
      logo_interventoria: 'data:old-i',
    }
    const list = [
      { id: 3, logo_contratista: 'data:other-c', logo_interventoria: 'data:other-i' },
      { id: 7, logo_contratista: 'data:new-c', logo_interventoria: 'data:new-i' },
    ]
    assert.deepEqual(logosDesdeContratosActivo(prev, list), {
      logo_contratista: 'data:new-c',
      logo_interventoria: 'data:new-i',
      logo_entidad: null,
    })
  })

  it('si no hay contrato activo usa el primero de la lista', () => {
    const prev = { logo_contratista: 'old', logo_interventoria: 'old' }
    const list = [{ id: 1, logo_contratista: 'c1', logo_interventoria: 'i1', logo_entidad: 'e1' }]
    assert.deepEqual(logosDesdeContratosActivo(prev, list), {
      logo_contratista: 'c1',
      logo_interventoria: 'i1',
      logo_entidad: 'e1',
    })
  })

  it('si la lista está vacía conserva los logos previos', () => {
    const prev = { contrato_id: 1, logo_contratista: 'c', logo_interventoria: 'i', logo_entidad: 'e' }
    assert.deepEqual(logosDesdeContratosActivo(prev, []), {
      logo_contratista: 'c',
      logo_interventoria: 'i',
      logo_entidad: 'e',
    })
  })

  it('limpia a null cuando el contrato activo no tiene logos', () => {
    const prev = {
      contrato_id: 2,
      logo_contratista: 'old-c',
      logo_interventoria: 'old-i',
      logo_entidad: 'old-e',
    }
    const list = [{ id: 2, logo_contratista: null, logo_interventoria: null, logo_entidad: null }]
    assert.deepEqual(logosDesdeContratosActivo(prev, list), {
      logo_contratista: null,
      logo_interventoria: null,
      logo_entidad: null,
    })
  })
})
