/**
 * Permisos Topografía por contrato (crear/editar vs validar).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  permisoTopografia,
  permisosTopografia,
  tienePermisoTopografiaFlag,
} from './permisosContrato.js'

function row(contratoId, flags) {
  return {
    funcion_nombre: 'Topografía',
    contrato_id: contratoId,
    ver: false,
    crear: false,
    editar: false,
    eliminar: false,
    validar: false,
    exportar: false,
    ...flags,
  }
}

describe('permisosTopografia aislamiento por contrato', () => {
  const usuario = {
    cargo_nombre: 'Topógrafo',
    rol_nombre: 'Contratista',
    contrato_id: 10,
    permisos: [
      row(10, { ver: true, crear: true, editar: true, validar: false }),
      row(20, { ver: true, crear: false, editar: false, validar: true }),
    ],
  }

  it('perfil crear/editar en contrato activo no hereda validar de otro contrato', () => {
    const p = permisosTopografia(usuario, 10)
    assert.equal(p.ver, true)
    assert.equal(p.crear, true)
    assert.equal(p.editar, true)
    assert.equal(p.validar, false)
  })

  it('perfil solo validar en su contrato no puede crear/editar', () => {
    const p = permisosTopografia(usuario, 20)
    assert.equal(p.ver, true)
    assert.equal(p.crear, false)
    assert.equal(p.editar, false)
    assert.equal(p.validar, true)
  })

  it('sin fila ni legacy en el contrato pedido → deniega', () => {
    assert.equal(permisoTopografia(usuario, 999), null)
    assert.equal(tienePermisoTopografiaFlag(usuario, 'ver', 999), false)
    assert.equal(tienePermisoTopografiaFlag(usuario, 'crear', 999), false)
    assert.equal(tienePermisoTopografiaFlag(usuario, 'validar', 999), false)
  })

  it('acepta nombre sin tilde (topografia)', () => {
    const u = {
      cargo_nombre: 'Residente',
      permisos: [
        {
          funcion_nombre: 'topografia',
          contrato_id: 5,
          ver: true,
          crear: false,
          editar: false,
          eliminar: false,
          validar: true,
          exportar: false,
        },
      ],
    }
    assert.equal(tienePermisoTopografiaFlag(u, 'validar', 5), true)
    assert.equal(tienePermisoTopografiaFlag(u, 'crear', 5), false)
  })

  it('desarrollador tiene todos los flags', () => {
    const dev = { cargo_nombre: 'Desarrollador', permisos: [] }
    const p = permisosTopografia(dev, 1)
    assert.equal(p.ver, true)
    assert.equal(p.crear, true)
    assert.equal(p.editar, true)
    assert.equal(p.validar, true)
    assert.equal(p.eliminar, true)
    assert.equal(p.exportar, true)
  })
})

describe('tres perfiles Topografía', () => {
  it('sin crear/editar: solo ver', () => {
    const u = {
      cargo_nombre: 'Observador',
      rol_nombre: 'Contratista',
      permisos: [row(1, { ver: true })],
    }
    const p = permisosTopografia(u, 1)
    assert.deepEqual(
      { crear: p.crear, editar: p.editar, validar: p.validar },
      { crear: false, editar: false, validar: false },
    )
  })

  it('crear/editar sin validar', () => {
    const u = {
      cargo_nombre: 'Topógrafo',
      rol_nombre: 'Contratista',
      permisos: [row(1, { ver: true, crear: true, editar: true })],
    }
    const p = permisosTopografia(u, 1)
    assert.equal(p.crear, true)
    assert.equal(p.editar, true)
    assert.equal(p.validar, false)
  })

  it('validar sin crear/editar', () => {
    const u = {
      cargo_nombre: 'Residente Interventoría',
      rol_nombre: 'Interventoría',
      permisos: [row(1, { ver: true, validar: true })],
    }
    const p = permisosTopografia(u, 1)
    assert.equal(p.crear, false)
    assert.equal(p.editar, false)
    assert.equal(p.validar, true)
  })
})
