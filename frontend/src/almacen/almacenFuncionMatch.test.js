/**
 * La fila Almacén de la sesión se reconoce con tilde, código y nombre largo.
 * node --test frontend/src/almacen/almacenFuncionMatch.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { esFuncionAlmacen, filaAlmacenEnSesion } from './almacenFuncionMatch.js'

describe('fila Almacén en la sesión', () => {
  it('reconoce Almacén con tilde, tilde descompuesta, código y nombre largo', () => {
    assert.equal(esFuncionAlmacen({ funcion_nombre: 'Almacén' }), true)
    assert.equal(esFuncionAlmacen({ funcion_nombre: 'Almace\u0301n' }), true)
    assert.equal(esFuncionAlmacen({ funcion_nombre: 'Almacén de Obra' }), true)
    assert.equal(esFuncionAlmacen({ funcion_nombre: 'Catálogo de insumos', funcion_codigo: 'CATINS' }), false)
    assert.equal(esFuncionAlmacen({ funcion_nombre: 'Otro', funcion_codigo: 'ALMACEN' }), true)
  })

  it('un editor sin Validar toma el flag editar de la fila del contrato', () => {
    const usuario = {
      contrato_id: 7,
      permisos: [
        { funcion_nombre: 'Almacén', contrato_id: 7, ver: true, editar: true, validar: false },
        { funcion_nombre: 'Almacén', contrato_id: 3, ver: true, editar: false, validar: true },
        { funcion_nombre: 'Catálogo de insumos', funcion_codigo: 'CATINS', contrato_id: 7, editar: true },
      ],
    }
    const fila = filaAlmacenEnSesion(usuario, 7)
    assert.equal(fila.editar, true)
    assert.equal(fila.validar, false)
  })

  it('si el nombre no coincide pero el código es ALMACEN, el editor igual tiene editar', () => {
    const usuario = {
      contrato_id: 4,
      permisos: [
        { funcion_nombre: 'Obra — materiales', funcion_codigo: 'ALMACEN', contrato_id: 4, ver: true, editar: true, validar: false },
      ],
    }
    const fila = filaAlmacenEnSesion(usuario, 4)
    assert.equal(Boolean(fila?.editar), true)
    assert.equal(Boolean(fila?.validar), false)
  })
})
