import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  accesoBitacora,
  puedeEditarEntradaBitacora,
} from './bitacoraPermisos.js'

describe('bitacoraPermisos', () => {
  it('desarrollador tiene todos los permisos', () => {
    const p = accesoBitacora({ cargo_nombre: 'Desarrollador' }, 1)
    assert.equal(p.ver && p.crear && p.editar && p.eliminar, true)
    assert.equal(p.esDesarrollador, true)
  })

  it('usuario sin matriz no crea ni edita', () => {
    const p = accesoBitacora({ cargo_nombre: 'Residente', permisos: [] }, 1)
    assert.equal(p.crear, false)
    assert.equal(p.editar, false)
  })

  it('respeta flags de la matriz Bitácora', () => {
    const usuario = {
      cargo_nombre: 'Residente',
      contrato_id: 5,
      permisos: [{
        funcion_nombre: 'Bitácora',
        contrato_id: 5,
        ver: true,
        crear: true,
        editar: true,
        eliminar: false,
        validar: false,
        exportar: true,
      }],
    }
    const p = accesoBitacora(usuario, 5)
    assert.equal(p.ver, true)
    assert.equal(p.crear, true)
    assert.equal(p.editar, true)
    assert.equal(p.eliminar, false)
    assert.equal(p.exportar, true)
  })

  it('diario abierto editable; cerrado y evento no', () => {
    const perms = { editar: true, esDesarrollador: false }
    assert.equal(puedeEditarEntradaBitacora({ tipo: 'diario', estado: 'abierto' }, perms), true)
    assert.equal(puedeEditarEntradaBitacora({ tipo: 'diario', estado: 'cerrado' }, perms), false)
    assert.equal(puedeEditarEntradaBitacora({ tipo: 'evento', estado: 'cerrado' }, perms), false)
    assert.equal(puedeEditarEntradaBitacora(
      { tipo: 'diario', estado: 'cerrado' },
      { editar: true, esDesarrollador: true },
    ), true)
  })
})
