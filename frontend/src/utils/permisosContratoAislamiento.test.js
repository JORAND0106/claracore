/**
 * Aislamiento de matriz Bitácora / funciones por contrato (frontend).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { permisoFuncionContrato, tienePermisoFlag } from './permisosContrato.js'
import { accesoBitacora } from '../modules/seguimiento/bitacoraPermisos.js'

describe('permisoFuncionContrato aislamiento', () => {
  const usuario = {
    cargo_nombre: 'Residente',
    contrato_id: 101,
    permisos: [
      {
        funcion_nombre: 'Bitácora',
        contrato_id: 101,
        ver: true,
        crear: true,
        editar: false,
        eliminar: false,
        validar: false,
        exportar: true,
      },
      {
        funcion_nombre: 'Bitácora',
        contrato_id: 202,
        ver: false,
        crear: false,
        editar: false,
        eliminar: false,
        validar: false,
        exportar: false,
      },
    ],
  }

  it('usa la fila del contrato pedido y no la de otro', () => {
    const a = permisoFuncionContrato(usuario, 'Bitácora', 101)
    const b = permisoFuncionContrato(usuario, 'Bitácora', 202)
    assert.equal(a?.ver, true)
    assert.equal(a?.exportar, true)
    assert.equal(b?.ver, false)
    assert.equal(tienePermisoFlag(usuario, 'Bitácora', 'ver', 101), true)
    assert.equal(tienePermisoFlag(usuario, 'Bitácora', 'ver', 202), false)
  })

  it('no cae a rows[0] de otro contrato cuando no hay match ni legacy', () => {
    const soloOtro = {
      cargo_nombre: 'Residente',
      permisos: [
        {
          funcion_nombre: 'Bitácora',
          contrato_id: 101,
          ver: true,
          crear: true,
          editar: true,
          eliminar: true,
          validar: true,
          exportar: true,
        },
      ],
    }
    assert.equal(permisoFuncionContrato(soloOtro, 'Bitácora', 999), null)
    assert.equal(tienePermisoFlag(soloOtro, 'Bitácora', 'ver', 999), false)
    const acc = accesoBitacora(soloOtro, 999)
    assert.equal(acc.ver, false)
    assert.equal(acc.crear, false)
  })
})
