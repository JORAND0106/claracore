import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeEsBorradorReporte,
  sicoePuedeEliminarBorrador,
} from './sicoeBorradores.js'

describe('sicoeBorradores', () => {
  it('detecta estado Borrador', () => {
    assert.equal(sicoeEsBorradorReporte({ estado: 'Borrador' }), true)
    assert.equal(sicoeEsBorradorReporte({ estado: 'No Revisados' }), false)
  })

  it('creador puede eliminar su borrador sin permiso eliminar', () => {
    assert.equal(
      sicoePuedeEliminarBorrador(
        { id: 7 },
        { estado: 'Borrador', creado_por: 7 },
        { permisoEliminar: false },
      ),
      true,
    )
  })

  it('otro usuario sin permiso no elimina', () => {
    assert.equal(
      sicoePuedeEliminarBorrador(
        { id: 3 },
        { estado: 'Borrador', creado_por: 7 },
        { permisoEliminar: false },
      ),
      false,
    )
  })

  it('permiso eliminar permite borrar cualquier borrador', () => {
    assert.equal(
      sicoePuedeEliminarBorrador(
        { id: 3 },
        { estado: 'Borrador', creado_por: 7 },
        { permisoEliminar: true },
      ),
      true,
    )
  })

  it('no elimina reportes enviados aunque tenga permiso', () => {
    assert.equal(
      sicoePuedeEliminarBorrador(
        { id: 3 },
        { estado: 'No Revisados', creado_por: 3 },
        { permisoEliminar: true },
      ),
      false,
    )
  })
})
