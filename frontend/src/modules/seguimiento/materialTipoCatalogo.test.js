import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  debeRegistrarTipoMaterialNuevo,
  filtrarTiposMaterial,
  mergeTiposMaterialOpts,
  normalizeTiposMaterialRows,
  normTipoMaterialNombre,
} from './materialTipoCatalogo.js'

describe('debeRegistrarTipoMaterialNuevo', () => {
  it('limpia si vacío', () => {
    assert.deepEqual(debeRegistrarTipoMaterialNuevo('', 'x', []), { action: 'clear' })
    assert.deepEqual(debeRegistrarTipoMaterialNuevo('  ', 'x', []), { action: 'clear' })
  })

  it('elige match existente', () => {
    const row = { id: 1, nombre: 'Arena' }
    assert.deepEqual(
      debeRegistrarTipoMaterialNuevo('arena', 'arena', [row]),
      { action: 'pick', row },
    )
  })

  it('registra valor nuevo aunque ya esté en el padre (propagación en vivo)', () => {
    assert.deepEqual(
      debeRegistrarTipoMaterialNuevo('Grava 3/4', 'Grava 3/4', []),
      { action: 'register', nombre: 'Grava 3/4' },
    )
  })

  it('registra aunque el valor confirmado coincida (aún no está en catálogo)', () => {
    assert.deepEqual(
      debeRegistrarTipoMaterialNuevo('Nuevo', 'Nuevo', [{ id: 2, nombre: 'Otro' }]),
      { action: 'register', nombre: 'Nuevo' },
    )
  })
})

describe('normalizeTiposMaterialRows / filtrar / merge', () => {
  it('normaliza array y envoltorios', () => {
    assert.deepEqual(normalizeTiposMaterialRows([{ id: 1, nombre: 'A' }]), [{ id: 1, nombre: 'A' }])
    assert.deepEqual(
      normalizeTiposMaterialRows({ data: [{ id: 2, nombre: 'B' }] }),
      [{ id: 2, nombre: 'B' }],
    )
    assert.deepEqual(normalizeTiposMaterialRows(null), [])
  })

  it('filtra por needle', () => {
    const opts = [
      { id: 1, nombre: 'Concreto 3000' },
      { id: 2, nombre: 'Arena' },
    ]
    assert.equal(filtrarTiposMaterial(opts, 'con').length, 1)
    assert.equal(filtrarTiposMaterial(opts, '').length, 2)
  })

  it('merge por nombre normalizado', () => {
    const merged = mergeTiposMaterialOpts(
      [{ id: 1, nombre: 'Arena' }],
      [{ id: 2, nombre: 'arena' }, { nombre: 'Grava' }],
    )
    assert.equal(merged.length, 2)
    assert.ok(merged.some((r) => normTipoMaterialNombre(r.nombre) === 'arena' && r.id === 1))
    assert.ok(merged.some((r) => r.nombre === 'Grava'))
  })
})
